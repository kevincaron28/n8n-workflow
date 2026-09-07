# Maison Panel

A wall-mounted Android tablet dashboard — clock, weather, fishing/solunar timing, household calendar,
and a market-indices strip. Read from across a hallway, always on, no home server.

Full design rationale, tile specs, and build order: [`docs/project-brief.md`](docs/project-brief.md).
Repo-specific dev notes: [`CLAUDE.md`](CLAUDE.md). Getting this onto an actual tablet:
[`docs/install-guide.md`](docs/install-guide.md).

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

Phases 1–4 (weather, solunar/fishing, calendar, markets) are built. Two of them are waiting on
values only Kevin has:

- `config.js` → `markets.finnhubKey` — paste the Finnhub key in; the strip stays quiet until then.
- `config.js` → `calendar.calendarId` — your Google account email; the tile stays quiet until then.
  Calendar is built as a private iframe embed (Path B in the brief), so nothing needs to be made
  public — it just needs the tablet's browser to stay signed into that Google account.

Camera is still pending on hardware; see `docs/project-brief.md` §9 and §11.

## Deployment

Push to the connected branch; Cloudflare Pages builds and serves the repo root as static files —
no build command, no output directory override needed.
