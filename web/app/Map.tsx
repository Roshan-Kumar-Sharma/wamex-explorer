"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MLMap, LngLatBoundsLike, MapMouseEvent, MapGeoJSONFeature, StyleSpecification } from "maplibre-gl";
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
// pool that the second map then tries to use -- tiles are requested but never
// parsed, and `load` never fires. prewarm() pins the pool so it survives the
// remount. This is exactly what prewarm exists for.
maplibregl.prewarm();
import type { Brief } from "./types";

// Phase 0 study area -- the only ground currently loaded.
const KAL: LngLatBoundsLike = [
  [121.0, -31.25],
  [122.0, -30.25],
];

/**
 * A self-contained style: no external CDN, no sprites, no glyphs.
 *
 * Phase 0 deliberately has no basemap. An external basemap is a runtime
 * dependency on somebody else's CDN, an extra attribution obligation, and --
 * as we found -- a silent failure mode when its sprite/glyph fetches stall.
 * The product is about OUR data, and the architecture already calls for
 * self-hosted static tiles. Phase 1 adds a Protomaps basemap served from the
 * same PMTiles bucket as the drillholes.
 */
const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#f5f5f4" } }],
};

type Props = { onBrief: (b: Brief | null, loading: boolean) => void };

export default function Map({ onBrief }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [shown, setShown] = useState<{ total: number; shown: number } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const start = useRef<maplibregl.LngLat | null>(null);

  const loadHoles = useCallback(async (m: MLMap) => {
    const b = m.getBounds();
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(",");
    const r = await fetch(`/api/holes?bbox=${bbox}`);
    if (!r.ok) return;
    const fc = await r.json();
    (m.getSource("holes") as maplibregl.GeoJSONSource)?.setData(fc);
    setShown({ total: fc._meta.total, shown: fc._meta.shown });
  }, []);

  const runBrief = useCallback(
    async (geometry: GeoJSON.Polygon) => {
      onBrief(null, true);
      const r = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geometry }),
      });
      onBrief(r.ok ? await r.json() : null, false);
    },
    [onBrief],
  );

  useEffect(() => {
    if (!ref.current || map.current) return;

    const m = new maplibregl.Map({
      container: ref.current,
      style: BASE_STYLE,
      bounds: KAL,
      fitBoundsOptions: { padding: 40 },
attributionControl: {
        customAttribution:
          'Based on Department of Mines, Petroleum and Exploration material, ' +
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

    // Set up on `styledata`, NOT on `load`.
    //
    // `load` waits for the style AND the first rendered frame. A browser
    // suspends requestAnimationFrame in a hidden/background tab, so the first
    // frame -- and therefore `load` -- may never arrive. Gating data loading on
    // it means a user who opens the app in a background tab gets a permanently
    // empty map. `styledata` fires as soon as the style is ready, which is all
    // we actually need to add sources and layers.
    let setUp = false;
    const setup = () => {
      if (setUp) return;
      setUp = true;

      m.addSource("holes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "holes",
        type: "circle",
        source: "holes",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 1.4, 12, 2.6, 16, 5],
          // Written out rather than spread: MapLibre's expression types are
          // tuple-shaped and a spread can't be verified at compile time.
          "circle-color": [
            "match",
            ["get", "holetype"],
            "DD", HOLETYPE_COLORS.DD,
            "RC", HOLETYPE_COLORS.RC,
            "AC", HOLETYPE_COLORS.AC,
            "RAB", HOLETYPE_COLORS.RAB,
            "RCD", HOLETYPE_COLORS.RCD,
            "AUGER", HOLETYPE_COLORS.AUGER,
            "#a8a29e",
          ],
          "circle-opacity": 0.75,
        },
      });

      // Study-area outline, so it's obvious where data exists.
      m.addSource("aoi-bounds", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[[121, -31.25], [122, -31.25], [122, -30.25], [121, -30.25], [121, -31.25]]],
          },
        },
      });
      m.addLayer({
        id: "aoi-bounds",
        type: "line",
        source: "aoi-bounds",
        paint: { "line-color": "#b45309", "line-dasharray": [3, 3], "line-width": 1.5, "line-opacity": 0.6 },
      });

      // The drawn selection.
      m.addSource("sel", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "sel-fill", type: "fill", source: "sel",
        paint: { "fill-color": "#b45309", "fill-opacity": 0.12 },
      });
      m.addLayer({
        id: "sel-line", type: "line", source: "sel",
        paint: { "line-color": "#b45309", "line-width": 2 },
      });

      loadHoles(m);
      m.on("moveend", () => loadHoles(m));

      m.on("click", "holes", (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
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
      m.on("mouseenter", "holes", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "holes", () => (m.getCanvas().style.cursor = ""));
    };

    m.on("styledata", setup);
    if (m.isStyleLoaded()) setup();

    return () => { m.remove(); map.current = null; };
  }, [loadHoles]);

  // Drag-to-draw a box. Phase 0 uses a rectangle; Phase 1 adds free polygons.
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const rect = (a: maplibregl.LngLat, b: maplibregl.LngLat): GeoJSON.Polygon => ({
      type: "Polygon",
      coordinates: [[
        [a.lng, a.lat], [b.lng, a.lat], [b.lng, b.lat], [a.lng, b.lat], [a.lng, a.lat],
      ]],
    });
    const setSel = (g: GeoJSON.Polygon | null) =>
      (m.getSource("sel") as maplibregl.GeoJSONSource)?.setData(
        g ? { type: "Feature", properties: {}, geometry: g } : { type: "FeatureCollection", features: [] },
      );

    const down = (e: MapMouseEvent) => {
      if (!drawing) return;
      start.current = e.lngLat;
      m.dragPan.disable();
    };
    const move = (e: MapMouseEvent) => {
      if (!drawing || !start.current) return;
      setSel(rect(start.current, e.lngLat));
    };
    const up = (e: MapMouseEvent) => {
      if (!drawing || !start.current) return;
      const g = rect(start.current, e.lngLat);
      start.current = null;
      m.dragPan.enable();
      setDrawing(false);
      setSel(g);
      runBrief(g);
    };

    m.on("mousedown", down);
    m.on("mousemove", move);
    m.on("mouseup", up);
    m.getCanvas().style.cursor = drawing ? "crosshair" : "";
    return () => {
      m.off("mousedown", down); m.off("mousemove", move); m.off("mouseup", up);
    };
  }, [drawing, runBrief]);

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full" />

      <div className="absolute left-3 top-3 flex flex-col gap-2">
        <button
          onClick={() => setDrawing((d) => !d)}
          className={`rounded-md border px-3 py-2 text-sm font-medium shadow-sm transition ${
            drawing
              ? "border-amber-700 bg-amber-700 text-white"
              : "border-stone-300 bg-white text-stone-800 hover:bg-stone-50"
          }`}
        >
          {drawing ? "Drag on the map to draw…" : "▢ Draw an area"}
        </button>

        {shown && (
          <div className="rounded-md border border-stone-200 bg-white/90 px-2.5 py-1.5 text-[11px] text-stone-600 shadow-sm">
            {shown.total.toLocaleString()} holes in view
            {shown.shown < shown.total && (
              <>
                {" · showing "}
                {shown.shown.toLocaleString()} sample
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
      </div>
    </div>
  );
}
