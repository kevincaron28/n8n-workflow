# Maison Panel

A wall-mounted Android tablet dashboard — clock, weather, fishing/solunar timing, household calendar,
a market-indices strip, and Google Home speaker control. Read from across a hallway, always on.

Full design rationale, tile specs, and build order: [`docs/project-brief.md`](docs/project-brief.md).
Repo-specific dev notes: [`CLAUDE.md`](CLAUDE.md). Getting this onto an actual tablet:
[`docs/install-guide.md`](docs/install-guide.md).

## Stack

Plain HTML + CSS + vanilla JS modules. No framework, no build step, no bundler. Deployed as a static
site to Cloudflare Pages; the tablet's browser calls every API directly (Open-Meteo, FMP, Google
Calendar). Solunar/fishing timing is local astronomy math via a vendored copy of
[SunCalc](https://github.com/mourner/suncalc) — no network call for that tile.

One exception: speaker control needs a real always-on process on the LAN (a browser can't do
Cast-protocol device discovery), so [`/server`](server/README.md) is a small Node service meant to
run on Kevin's PC today and a Raspberry Pi eventually. Everything else stays client-side-only.

## Running locally

```
npx serve .
```

(Any static file server works. Do not open `index.html` via `file://` — that origin breaks CORS.)

## Configuration

Everything you'd tune — location, units, refresh intervals, API keys, market symbols, camera feeds —
lives in [`config.js`](config.js). That's the only file meant to be hand-edited day to day.

## Status

Phases 1–4 (weather, solunar/fishing, calendar, markets) are built and configured:

- **Markets** uses Financial Modeling Prep (`config.js` → `markets.fmpKey`), not Finnhub — the free
  tier is end-of-day only, same limitation Finnhub's free tier turned out to have. The key currently
  ships in `config.js` as plain client-side JS; `/server` can now proxy markets too (holding the key
  as a server-side env var instead) — set `config.js` → `markets.bridgeUrl` once the PC/Pi bridge is
  running to switch over. Genuinely live intraday quotes are a separate, later upgrade to what that
  proxy fetches.
- **Calendar** is a private Google Calendar iframe embed (Path B in the brief) pointed at
  `config.js` → `calendar.calendarId` — nothing needed to be made public, it just needs the
  tablet's browser signed into that Google account.

Camera (`js/camera.js`) is fully built — snapshot polling, live/offline state, tap-to-enlarge —
and just needs feeds added to `config.js` → `camera.feeds` once hardware is picked; see
`docs/project-brief.md` §9 and §11.2.

Speaker control (`js/speakers.js`) is built too, but needs the local bridge in
[`/server`](server/README.md) running and reachable — see its README for setup, then set
`config.js` → `speakers.enabled: true` and `speakers.bridgeUrl`.

## Deployment

Push to the connected branch; Cloudflare Pages builds and serves the repo root as static files —
no build command, no output directory override needed.
