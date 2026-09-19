# Cost model

`CLAUDE.md` sets a hard budget: **under $20/month.** This is how we hit it, and where the
risk of blowing it actually lies.

---

## The plan

| Component | Service | Cost |
|---|---|---|
| Frontend | Cloudflare Pages / Vercel Hobby | **$0** |
| PMTiles hosting | **Cloudflare R2** (10 GB free, **zero egress**) | **$0** |
| API | Same deploy as frontend | **$0** |
| PostgreSQL + PostGIS | **Hetzner CX22** (2 vCPU, 4 GB, 40 GB SSD) | **~€4 / ~$6.50 AUD** |
| Domain | `.com.au` or `.dev` | ~$1.50/mo amortised |
| LLM (when added) | Claude API, on demand, cached | $0–5 |
| **Total** | | **~$8–13/month** |

Dev costs nothing — Postgres runs in Docker locally.

## Why not the free Postgres tiers

Verified September 2026:

| Service | Free storage | Verdict |
|---|---|---|
| **Neon** | **0.5 GB** per project (reduced post-Databricks; 100 compute-hrs) | ✗ too small |
| **Supabase** | **500 MB** database, 5 GB egress | ✗ too small |

We need [~3.5 GB](02-data-model.md#sizing). Both fail by ~7×.

A €4 VPS with self-managed Postgres is cheaper than any managed tier that fits, and
PostGIS + `pg_trgm` are a one-line install. The cost is that you own backups and updates
— acceptable for a project whose data is fully reproducible from a public source anyway.

> **This is the one place I'd deviate from instinct:** the reflex is "use the managed free
> tier." At this data size the free tiers simply don't fit, and discovering that after
> building the ingest is a painful week.

## Where the budget actually breaks

**Egress, not compute.** Map tiles are the classic surprise bill: 3.4M points of PMTiles
is ~1–3 GB, and a single user panning around pulls tens of MB.

| Host | Egress cost | 100 GB/mo |
|---|---|---|
| **Cloudflare R2** | **$0** | **$0** |
| AWS S3 | ~$0.09/GB | ~$9 |
| Vercel (over free) | ~$0.15/GB | ~$15 |

**Use R2.** This single choice is worth more than every other cost decision combined. It
is also why the architecture puts tiles on static storage rather than behind the app
server — a tile server on Vercel would meter every byte.

## LLM cost — and why v1 spends nothing

Per [data findings](../01-research/02-data-findings.md), the `keywords` controlled
vocabulary supports a genuinely useful factual brief **with no LLM at all**. So:

- **v1 LLM cost: $0.** Not a cost-saving hack — it's the *safer* product, because a
  `GROUP BY` cannot hallucinate.
- When prose is added: ~20 abstracts × ~1,200 chars ≈ 8k input tokens per brief. At Claude
  pricing that is fractions of a cent per brief.
- **Cache by polygon hash** (`CLAUDE.md`). Famous ground gets requested repeatedly; the
  pre-generated briefs from `BUILD.md` §7 are cached forever by construction.

The real cost risk is not price per call — it's an accidental loop over 615k reports.
**Put a hard cap on reports-per-brief and a monthly spend ceiling in code, not in
intentions.**

## Scaling triggers

| If | Then | New cost |
|---|---|---|
| PMTiles > 10 GB | R2 paid storage | +$0.015/GB/mo — trivial |
| DB > 40 GB (adding geochem) | Hetzner CX32 or a volume | +€4–8/mo |
| Real traffic | Still fine — R2 egress is free | $0 |
| Adding 56.7 GB downhole geochem | Bigger volume | +~€10/mo |

Even the worst case here lands around $25/month. There is no cliff.

## What is free and should stay free

- **The data.** CC BY 4.0, commercial use permitted. No licensing cost, ever.
- **The entire stack.** PostGIS, MapLibre, PMTiles, tippecanoe, GDAL, Next.js — all open
  source, no seat fees, no usage tiers.

That combination is genuinely unusual, and it's why this project is viable while jobless.

---

## Licence obligation — not optional

> Based on Department of Mines, Petroleum and Exploration material

Must be **visible in the UI and on every export or generated document**. It is a licence
condition, not a courtesy. Keep it in exactly one config constant
(`ATTRIBUTION_STRING`) — the department has renamed twice already.

---

**Next:** [../03-concepts/01-coordinate-systems.md](../03-concepts/01-coordinate-systems.md)
