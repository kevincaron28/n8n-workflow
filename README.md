# Maison Panel

A wall-mounted Android tablet dashboard — clock, weather, fishing/solunar timing, household calendar,
and a market-indices strip. Read from across a hallway, always on, no home server.

Full design rationale, tile specs, and build order: [`docs/project-brief.md`](docs/project-brief.md).
Repo-specific dev notes: [`CLAUDE.md`](CLAUDE.md).

## Stack

Plain HTML + CSS + vanilla JS modules. No framework, no build step, no bundler. Deployed as a static
site to Cloudflare Pages; the tablet's browser calls every API directly (Open-Meteo, Finnhub, Google
Calendar). Solunar/fishing timing is local astronomy math via a vendored copy of
[SunCalc](https://github.com/mourner/suncalc) — no network call for that tile.

## Running locally

```
npx serve .
```

(Any static file server works. Do not open `index.html` via `file://` — that origin breaks CORS.)

## Configuration

Everything you'd tune — location, units, refresh intervals, API keys, market symbols, camera feeds —
lives in [`config.js`](config.js). That's the only file meant to be hand-edited day to day.

## Status

Phase 1 (shell, grid, clock, weather) is in place. Solunar, calendar, markets, and camera tiles land in
later phases per the brief's build order — see `docs/project-brief.md` §9.

## Deployment

Push to the connected branch; Cloudflare Pages builds and serves the repo root as static files —
no build command, no output directory override needed.
