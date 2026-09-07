# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**Maison Panel** is a wall-mounted Android tablet dashboard: clock, weather, fishing/solunar timing,
household calendar, and a market-indices strip, in that priority order. Weather and fishing are the
primary use; markets are a secondary strip.

**The constraint that drives every decision:** no home server, no Docker, no backend. It is a static
site — plain HTML/CSS/vanilla JS modules, no framework, no build step, no bundler — deployed to
Cloudflare Pages. The tablet's browser calls every external API directly; there is no middleware layer.
See `docs/project-brief.md` for the full brief this build follows (architecture rationale, tile specs,
resilience requirements, design direction, and the phased build order).

There are no lint, build, or test commands. Changes are validated by opening `index.html` (a local
static server is enough — see below) and, ultimately, by the deployed Pages URL on the actual tablet.

## Running locally

No build step, so any static file server works, e.g.:

```
npx serve .
# or
python3 -m http.server 8080
```

Opening `index.html` directly via `file://` does **not** work reliably — a `file://` origin breaks CORS
and service workers, so always serve it over `http(s)`.

## Architecture

```
[Android tablet, Fully Kiosk Browser]
        │ loads https://<name>.pages.dev
        ▼
[Cloudflare Pages] ← static HTML/CSS/JS only, deployed from git
        │ the browser fetches directly:
        ├──► api.open-meteo.com        (weather, no key, CORS: *)
        ├──► finnhub.io/api/v1         (markets, key in query string, CORS enabled)
        ├──► googleapis.com/calendar   (calendar, browser API key)
        └──► http://<camera-lan-ip>    (camera snapshots, LAN only, phase 5)
```

Fishing/solunar times are pure client-side astronomy math (vendored SunCalc) — zero network calls.

## File layout

```
index.html           shell + grid markup for every tile
config.js             the only file Kevin edits day-to-day (location, keys, refresh intervals)
css/panel.css         design tokens (colour, type scale), grid layout, night mode, motion rules
js/
  app.js              orchestrator: wires tiles, runs the refresh scheduler, error boundary
  store.js            localStorage cache + staleness/backoff helper shared by every tile
  clock.js            clock + date tile
  weather.js          Open-Meteo tile (current/hourly/daily)
  solunar.js          fishing/solunar tile (phase 2, built on vendor/suncalc.js)
  calendar.js         Google Calendar tile (phase 3)
  markets.js          Finnhub markets strip (phase 4)
  camera.js           camera snapshot tile (phase 5)
vendor/suncalc.js     vendored SunCalc (MIT/BSD-2-Clause) — not loaded from a CDN
fonts/                self-hosted Archivo + Public Sans (see fonts/README.md)
```

## Key implementation rules (from the brief — do not relax these)

- **Every tile fails independently.** Each fetch is wrapped in its own try/catch; one dead API must
  never blank the rest of the panel.
- **Cache last-good.** Each tile persists its last successful payload to `localStorage` via `store.js`
  and keeps rendering it (dimmed, with a quiet "updated HH:MM" stamp) when a refresh fails.
  A stale reading beats an empty box.
- **Backoff on failure**, reset on success, capped at 30 minutes.
- **Markets only poll 09:30–16:00 ET on weekdays** — outside that window, show the last close and stop
  calling the API.
- **No emoji, no icon fonts.** Weather/moon icons are inline SVG.
- **Type scale has a floor of 18px** — nothing smaller belongs on a panel read from across a room.
- **Solunar amber (`--solunar`) is reserved exclusively** for an active fishing period — it must not
  appear anywhere else on the panel.
- Repo stays **private**: camera URLs/credentials belong only in `config.js`, never committed elsewhere.

## Build order

Phase 1 (shell, grid, tokens, clock, weather) ships first and should always be deployable/visible on
its own before later phases add solunar, calendar, markets, and camera tiles. See `docs/project-brief.md`
§9 for the full phase table and §11 for open questions (tablet model, camera brand, locale, calendar
visibility, exact coordinates) that block phases 3+.
