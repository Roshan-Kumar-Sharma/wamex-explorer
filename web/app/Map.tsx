"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import type {
  Map as MLMap, MapMouseEvent, MapGeoJSONFeature, StyleSpecification, LngLatBoundsLike,
} from "maplibre-gl";
import { Protocol as PMTilesProtocol } from "pmtiles";
import {
  TerraDraw, TerraDrawPolygonMode, TerraDrawRectangleMode, TerraDrawSelectMode,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import { HOLETYPE_COLORS } from "@/lib/constants";

// MapLibre v6 finds its Web Worker with `new URL("./maplibre-gl-worker.mjs",
// import.meta.url)`. Under Next that resolves into /_next/static/chunks/, where
// the file does not exist, so the request returns Next's HTML 404 page. The
// worker then dies silently: the style loads, `load` never fires, and the map
// stays blank with no error. Point it at our own copy instead (kept in sync by
// the `sync:maplibre` npm script).
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

// React StrictMode mounts effects twice in dev. MapLibre's Web Worker pool is
// refcounted, so the first map's cleanup `remove()` releases and TERMINATES the
// pool that the second map then tries to use. prewarm() pins the pool so it
// survives the remount.
maplibregl.prewarm();

// PMTiles: a single static file of vector tiles, fetched by HTTP Range request.
// No tile server. See docs/03-concepts/03-vector-tiles-and-pmtiles.md.
maplibregl.addProtocol("pmtiles", new PMTilesProtocol().tile);

/** Phase 1 tiles, if built. Falls back to the sampled GeoJSON endpoint otherwise. */
const PMTILES_URL = process.env.NEXT_PUBLIC_PMTILES_URL ?? "";

/** All of WA. */
const WA_BOUNDS: LngLatBoundsLike = [[112.5, -35.5], [129.5, -13.5]];

/**
 * A self-contained style: no external CDN, no sprites, no glyphs. See ADR-010.
 */
const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#f5f5f4" } }],
};

const CIRCLE_PAINT: maplibregl.CircleLayerSpecification["paint"] = {
  "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 0.8, 8, 1.4, 12, 2.6, 16, 5],
  // Written out rather than spread: MapLibre's expression types are
  // tuple-shaped and a spread can't be verified at compile time.
  "circle-color": [
    "match", ["get", "holetype"],
    "DD", HOLETYPE_COLORS.DD,
    "RC", HOLETYPE_COLORS.RC,
    "AC", HOLETYPE_COLORS.AC,
    "RAB", HOLETYPE_COLORS.RAB,
    "RCD", HOLETYPE_COLORS.RCD,
    "AUGER", HOLETYPE_COLORS.AUGER,
    "#a8a29e",
  ],
  "circle-opacity": 0.75,
};

type DrawMode = "polygon" | "rectangle" | null;
type Coverage = GeoJSON.FeatureCollection<GeoJSON.Geometry, { holes: number; deep: boolean; bedrock: boolean }>;
type Props = {
  onGeometry: (g: GeoJSON.Polygon | null) => void;
  /** A polygon to place on the map from outside, e.g. a permalink being reopened. */
  initialGeometry?: GeoJSON.Polygon | null;
  /** The brief's coverage grid, drawn under the holes when `showCoverage`. */
  coverage?: Coverage | null;
  showCoverage?: boolean;
};

const EMPTY_FC: Coverage = { type: "FeatureCollection", features: [] };

export default function Map({ onGeometry, initialGeometry, coverage, showCoverage }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const draw = useRef<TerraDraw | null>(null);
  const [shown, setShown] = useState<{ total: number; shown: number } | null>(null);
  const [mode, setMode] = useState<DrawMode>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [ready, setReady] = useState(false);

  // Keep the latest callback in a ref. The map effect must NOT depend on it:
  // a dependency on a parent callback whose identity changes would tear down
  // and recreate the map on every render (which happened -- view reset to WA).
  const onGeometryRef = useRef(onGeometry);
  useEffect(() => { onGeometryRef.current = onGeometry; }, [onGeometry]);

  // Phase 0 fallback: sampled GeoJSON for the viewport. Unused once PMTiles exist.
  const loadHoles = useCallback(async (m: MLMap) => {
    if (PMTILES_URL) return;
    const b = m.getBounds();
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(",");
    const r = await fetch(`/api/holes?bbox=${bbox}`);
    if (!r.ok) return;
    const fc = await r.json();
    (m.getSource("holes") as maplibregl.GeoJSONSource)?.setData(fc);
    setShown({ total: fc._meta.total, shown: fc._meta.shown });
  }, []);


  useEffect(() => {
    if (!ref.current || map.current) return;

    const m = new maplibregl.Map({
      container: ref.current,
      style: BASE_STYLE,
      bounds: WA_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      attributionControl: {
        customAttribution:
          "Based on Department of Mines, Petroleum and Exploration material, " +
          '<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>',
      },
    });
    map.current = m;
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __map?: MLMap }).__map = m;
    }

    // MapLibre swallows style/tile failures unless you listen. Without this a
    // broken basemap looks identical to an empty map.
    m.on("error", (e) => console.error("[maplibre]", e?.error?.message ?? e));

    m.addControl(new maplibregl.NavigationControl(), "top-right");
    m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    // Set up on `styledata`, NOT on `load`. `load` waits for the first rendered
    // frame, which never comes in a hidden/background tab. See ADR-011.
    let setUp = false;
    const setup = () => {
      if (setUp) return;
      setUp = true;

      if (PMTILES_URL) {
        m.addSource("holes", { type: "vector", url: `pmtiles://${PMTILES_URL}` });
        m.addLayer({
          id: "holes", type: "circle", source: "holes",
          "source-layer": "drillholes",       // must match tippecanoe --layer
          paint: CIRCLE_PAINT,
        });
      } else {
        m.addSource("holes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({ id: "holes", type: "circle", source: "holes", paint: CIRCLE_PAINT });
        loadHoles(m);
        m.on("moveend", () => loadHoles(m));
      }

      // Coverage grid (Phase 2): which cells of the drawn area have no hole,
      // or only shallow ones. Sits under the holes so the collars stay legible.
      m.addSource("coverage", { type: "geojson", data: EMPTY_FC });
      m.addLayer({
        id: "coverage-fill", type: "fill", source: "coverage",
        paint: {
          "fill-color": [
            "case",
            ["==", ["get", "holes"], 0], "#dc2626",
            ["!", ["get", "deep"]], "#f59e0b",
            "#78716c",
          ],
          "fill-opacity": [
            "case",
            ["==", ["get", "holes"], 0], 0.22,
            ["!", ["get", "deep"]], 0.14,
            0.04,
          ],
        },
        layout: { visibility: "none" },
      }, "holes");
      m.addLayer({
        id: "coverage-line", type: "line", source: "coverage",
        paint: { "line-color": "#78716c", "line-opacity": 0.25, "line-width": 0.5 },
        layout: { visibility: "none" },
      }, "holes");
      setReady(true);

      m.on("click", "holes", (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
        // Read the live draw mode, not a closed-over React state value.
        const dm = draw.current?.getMode();
        if (dm && dm !== "select") return;
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, unknown>;
        new maplibregl.Popup({ closeButton: true })
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font:12px system-ui;line-height:1.5">
               <b>${p.holeid ?? "—"}</b><br/>
               ${p.holetype ?? "—"} · ${p.maxdepth ?? "?"} m<br/>
               ${p.operator ? `${p.operator}<br/>` : ""}
               ${p.anumber ? `<a href="https://wamex.dmp.wa.gov.au/Wamex/Search/ReportDetails?ANumber=${p.anumber}" target="_blank">A${p.anumber}</a>` : ""}
             </div>`,
          )
          .addTo(m);
      });
      m.on("mouseenter", "holes", () => { if (!draw.current?.getMode() || draw.current.getMode() === "select") m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", "holes", () => { if (!draw.current?.getMode() || draw.current.getMode() === "select") m.getCanvas().style.cursor = ""; });

      // Terra Draw: free polygons and rectangles. Replaces the Phase 0 drag-box.
      const td = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map: m }),
        modes: [
          new TerraDrawPolygonMode({
            styles: { fillColor: "#b45309", fillOpacity: 0.12, outlineColor: "#b45309", outlineWidth: 2 },
          }),
          new TerraDrawRectangleMode({
            styles: { fillColor: "#b45309", fillOpacity: 0.12, outlineColor: "#b45309", outlineWidth: 2 },
          }),
          new TerraDrawSelectMode(),
        ],
      });
      td.start();
      td.setMode("select");
      td.on("finish", (id) => {
        const f = td.getSnapshotFeature(id);
        if (!f || f.geometry.type !== "Polygon") return;
        // One area at a time: drop everything except what was just drawn.
        for (const other of td.getSnapshot()) if (other.id !== id) td.removeFeatures([other.id!]);
        td.setMode("select");
        setMode(null);
        setHasSelection(true);
        onGeometryRef.current(f.geometry as GeoJSON.Polygon);
      });
      draw.current = td;
    };

    m.on("styledata", setup);
    if (m.isStyleLoaded()) setup();

    return () => {
      draw.current?.stop();
      draw.current = null;
      m.remove();
      map.current = null;
    };
  }, [loadHoles]);

  // Push the latest coverage grid into the map and toggle its visibility.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource("coverage") as maplibregl.GeoJSONSource | undefined)?.setData(coverage ?? EMPTY_FC);
    const vis = showCoverage && coverage ? "visible" : "none";
    for (const id of ["coverage-fill", "coverage-line"]) {
      if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", vis);
    }
  }, [coverage, showCoverage, ready]);

  // A polygon handed in from outside (a reopened permalink): draw it, frame it.
  useEffect(() => {
    const m = map.current;
    const td = draw.current;
    if (!m || !td || !ready || !initialGeometry) return;
    td.clear();
    td.addFeatures([{ type: "Feature", geometry: initialGeometry, properties: { mode: "polygon" } }]);
    td.setMode("select");
    setMode(null);
    setHasSelection(true);
    const xs = initialGeometry.coordinates[0].map((c) => c[0]);
    const ys = initialGeometry.coordinates[0].map((c) => c[1]);
    m.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 60, duration: 0 });
  }, [initialGeometry, ready]);

  const startMode = (next: DrawMode) => {
    const td = draw.current;
    if (!td) return;
    if (next === null || next === mode) {
      td.setMode("select");
      setMode(null);
      return;
    }
    td.clear();
    setHasSelection(false);
    onGeometryRef.current(null);
    td.setMode(next);
    setMode(next);
  };

  const clearSelection = () => {
    draw.current?.clear();
    draw.current?.setMode("select");
    setMode(null);
    setHasSelection(false);
    onGeometryRef.current(null);
  };

  const btn = (active: boolean) =>
    `rounded-md border px-3 py-2 text-sm font-medium shadow-sm transition ${
      active
        ? "border-amber-700 bg-amber-700 text-white"
        : "border-stone-300 bg-white text-stone-800 hover:bg-stone-50"
    }`;

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full" />

      <div className="absolute left-3 top-3 flex flex-col gap-2">
        <div className="flex gap-1.5">
          <button onClick={() => startMode("polygon")} className={btn(mode === "polygon")}>
            {mode === "polygon" ? "Click to add points, double-click to finish" : "⬠ Draw polygon"}
          </button>
          <button onClick={() => startMode("rectangle")} className={btn(mode === "rectangle")}>
            {mode === "rectangle" ? "Click two corners" : "▢ Draw box"}
          </button>
          {hasSelection && (
            <button onClick={clearSelection} className={btn(false)} title="Clear">✕</button>
          )}
        </div>

        {shown && (
          <div className="rounded-md border border-stone-200 bg-white/90 px-2.5 py-1.5 text-[11px] text-stone-600 shadow-sm">
            {shown.total.toLocaleString()} holes in view
            {shown.shown < shown.total && (
              <>
                {" · showing "}{shown.shown.toLocaleString()} sample
                <div className="text-stone-400">counts come from the database, not the map</div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="absolute bottom-6 left-3 rounded-md border border-stone-200 bg-white/90 px-2.5 py-2 text-[11px] shadow-sm">
        <div className="mb-1 font-medium text-stone-700">Drill method</div>
        {Object.entries(HOLETYPE_COLORS).map(([k, c]) => (
          <div key={k} className="flex items-center gap-1.5 text-stone-600">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />
            {k}
          </div>
        ))}
        {showCoverage && coverage && (
          <>
            <div className="mb-1 mt-2 font-medium text-stone-700">Coverage grid</div>
            <div className="flex items-center gap-1.5 text-stone-600"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-600/30" />no drillhole</div>
            <div className="flex items-center gap-1.5 text-stone-600"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500/25" />none ≥ 50 m</div>
          </>
        )}
      </div>
    </div>
  );
}
