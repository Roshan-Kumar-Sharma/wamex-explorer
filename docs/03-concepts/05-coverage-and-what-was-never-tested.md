# Coverage, and "what was never tested"

*Written during Phase 2. `BUILD.md` called this "the most valuable section, and the one
nobody else can generate". This note is how we generate it without inventing anything.*

## The geology you need first: regolith

Most of Western Australia has been exposed to weather for a very long time — hundreds of
millions of years in places, with no glaciation to scrape it clean. The result is a blanket
of **regolith**: weathered, oxidised, leached rock and transported sand and clay, commonly
20–100 m thick over the Yilgarn, and much thicker where old river systems (palaeochannels)
ran. Underneath is **fresh rock** — what geologists actually want to sample.

Exploration drilling methods split along this line:

| Method | Code | Typical depth | What it tests | Cost |
|---|---|---|---|---|
| Rotary air blast | RAB | 20–60 m | regolith geochemistry; sometimes top of fresh rock | cheap |
| Aircore | AC | 30–80 m | regolith, bottom-of-hole sample at the weathering front | cheap |
| Auger / vacuum | AUGER, VACUUM | 1–5 m | soil, calcrete | very cheap |
| Reverse circulation | RC | 50–300 m | fresh rock, reliable samples | mid |
| Diamond | DD | 100–1,000+ m | fresh rock, oriented core, structure | expensive |

So a piece of ground with 2,000 aircore holes and no RC or diamond has been **surface
sampled, not tested at depth**. Tropicana's brief shows this exactly: 4,260 AC holes
averaging 32 m — a systematic bottom-of-hole geochemistry programme through sand cover —
before RC and diamond define the deposit.

The brief uses two proxies for "reached fresh rock", both stated in the document:
- **depth ≥ 50 m** (`BEDROCK_DEPTH_M`)
- **method in RC / DD / RCD** (`BEDROCK_METHODS`)

Neither is exact. Weathering depth varies from 0 to 200 m and is not in the register. The
document says so — a general note, marked as not from this record.

## The coverage grid

The question "how much of this polygon has never been drilled" needs a unit of area. We
tile the polygon with a square grid and count cells.

### Why squares, in the local MGA zone

1. **Metres, not degrees.** A 750 m cell should be 750 m wide. We transform the polygon to
   the MGA2020 zone of its centroid (`7800 + zone`; zone = ⌊(lon+180)/6⌋+1, so 49–52 in WA —
   see [01-coordinate-systems.md](01-coordinate-systems.md)) and grid there.
2. **Squares, not hexagons.** Hexagons are prettier and have better neighbour geometry, but
   a point falls into a square by *arithmetic* — `floor(x / size)`, `floor(y / size)` — and
   into a hexagon only by a polygon test. With 357k holes in a 1° box, the square version
   ran in 0.4 s and the hexagon version in 1.3 s.
3. **Cell size from area.** `size = sqrt(area / 300)` rounded to 50 m, minimum 50 m. So a
   prospect gets 50–100 m cells and a 1°×1° box gets ~6 km cells. The document always
   prints the size; a percentage without it would be meaningless.

### The two rules that keep it honest

- **A cell belongs to the polygon if its centre is inside.** Otherwise edge slivers — cells
  that are 5% inside the polygon — count as "undrilled" just for being small. On the
  Golden Mile reference box the first version said 109 of 320 cells (34%), many of them
  slivers; with the centroid rule, 94 of 289 (33%); the hexagon prototype, whose cells were
  2.6× larger, said 20%. Same ground, three numbers. The one we ship is the one whose rule
  and cell size are printed in the document.
- **A cell's holes are counted over the whole cell**, including any part outside the
  polygon. An edge cell is judged on all of its ground, not the part the user happened to
  include.

And the caveat the document carries: **a cell counts as tested if any hole falls anywhere
in it.** One 30 m RAB hole in a 750 m square makes that square "drilled". The three tiers
(no hole / no hole ≥ 50 m / no RC-DD) are there so a reader can pick their own bar.

### The SQL, in outline

```sql
WITH p AS (           -- polygon in MGA metres, cell size, and a lat/long search box
  SELECT ST_Transform(geom, srid) AS g, size,
         ST_Transform(ST_Expand(ST_Transform(geom, srid), size), 4326) AS box …
), grid AS (          -- cells whose centre is inside
  SELECT floor(ST_XMin(sq.geom)/size) i, floor(ST_YMin(sq.geom)/size) j, sq.geom
    FROM p, ST_SquareGrid(size, g) sq WHERE ST_Contains(g, ST_Centroid(sq.geom))
), hits AS MATERIALIZED (   -- one pass over the holes, snapped to (i, j)
  SELECT floor(ST_X(pt)/size) i, floor(ST_Y(pt)/size) j, count(*) holes,
         bool_or(maxdepth >= 50) deep, bool_or(holetype_std IN ('RC','DD','RCD')) bedrock
    FROM (SELECT ST_Transform(d.geom, srid) pt … FROM drillholes d, p
           WHERE ST_Intersects(d.geom, p.box) AND holetype_std NOT IN ('WATER_BORE','COSTEAN')) x
   GROUP BY 1, 2
)
SELECT grid.*, coalesce(hits.holes, 0) … FROM grid LEFT JOIN hits USING (i, j);
```

Two performance lessons that cost an hour each:

- **Put the search box in a column.** `ST_Intersects(d.geom, ST_Transform(ST_Expand(…)))`
  inline in the join is not recognised as a constant; the planner scanned all 3.4M points
  and transformed each. As a CTE column, the GIST index is used.
- **`MATERIALIZED` on the aggregate.** A CTE referenced once is inlined. The planner then
  put the 250k-row sort-and-aggregate on the inner side of a nested loop and ran it **once
  per grid cell** — 301 times, 9 seconds. Forced materialisation: 0.4 s. When a query is
  20× slower than its parts, `EXPLAIN (ANALYZE)` and look for `loops=`.

## Grid convergence — why the cells look tilted

On the map the coverage squares sit at a slight angle to the lat/long box the user drew.
That is not a bug. MGA grid north and true north differ by the **grid convergence**, up to
about ±3° at the edges of a 6° zone. Squares that are axis-aligned in MGA metres are
rotated in WGS84 degrees. Anyone who has laid out a drill grid has met this.

## The rest of "what the record does not show"

Coverage is one of six statements, each a fact about the record:

| Statement | Source | Phrasing rule |
|---|---|---|
| Undrilled / shallow-only cells | grid above | state cell size, count, percentage |
| Decades with no report | `reportsByDecade` gaps between first and last year | "nothing on open file is dated to…" |
| Methods never used | fixed list of 10 exploration types minus those present | "no … hole is recorded" |
| Commodities never targeted | fixed list of 23 major WA commodities minus those on any report | "no report lists … as a target" — and the list is named |
| Reports without an abstract | count of NULL `abstract_short` | explains the 2014 change |
| Confidential work | `max(date_released)` | states the latest release date |

The phrasing matters as much as the number. "No report lists lithium as a target" is
true and checkable. "Lithium was never tested" is a claim about rocks we cannot see. The
document only ever makes the first kind (CLAUDE.md rules 3 and 4).
