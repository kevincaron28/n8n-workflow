# Wall Panel Dashboard — Project Brief

**For:** Claude Code
**Owner:** Kevin (ClearPoint Trading)
**Status:** ready to build, Phase 1
**Constraint that drives everything:** no home server, no Docker, no n8n. The tablet and a free static host are the entire stack.

---

## 1. What we're building

A wall-mounted Android tablet showing a single always-on dashboard:

| Tile | Data | Phase |
|---|---|---|
| Clock + date | local device | 1 |
| Weather | Open-Meteo | 1 |
| Fishing / solunar | computed in-browser | 2 |
| Calendar | Google Calendar | 3 |
| Market indices | Finnhub | 4 |
| House cameras | camera HTTP snapshot | 5 |

Weather and fishing are the primary use. Markets are a secondary strip, not the focus.

---

## 2. Architecture decision

**A single static site. No backend. All API calls happen client-side from the tablet's browser.**

```
[Android tablet]
  Fully Kiosk Browser (fullscreen, no chrome, screen-on)
        │  loads https://<name>.pages.dev
        ▼
[Cloudflare Pages]  ← static HTML/CSS/JS only, deployed from git
        │
        │  the browser then fetches directly:
        ├──► api.open-meteo.com        (no key, CORS: *)
        ├──► finnhub.io/api/v1         (key in query string, CORS enabled)
        ├──► googleapis.com/calendar   (browser API key)
        └──► http://<camera-lan-ip>    (LAN only, phase 5)
```

### Why Cloudflare Pages and not just an HTML file on the tablet

The tablet-only instinct is to drop `index.html` in the tablet's storage and open it. Don't. A page loaded over `file://` has a **null origin**, which breaks a chunk of CORS behaviour, blocks service workers, and makes debugging miserable. Hosting the same static file costs nothing, gives a real `https://` origin, and means updating the dashboard is a `git push` instead of sideloading a file onto a tablet screwed to a wall.

Kevin already has a Cloudflare Pages deployment (`cpt-ai.pages.dev`), so the account and workflow exist. **This is still "tablet only" in the way that matters: no hardware to run, patch, or babysit at home.**

### Why not n8n or Home Assistant

Both were considered and rejected for this build. Every data source needed here is either keyless-and-CORS-enabled or pure math, so a middleware layer would add a machine to maintain for zero capability gain. The one thing a server buys you is real RTSP camera streaming — see §8, where we work around it.

---

## 3. Stack

- Plain HTML + CSS + vanilla JS modules. **No framework, no build step**, no bundler.
- One dependency, vendored locally (not from a CDN, so a CDN outage can't blank the wall): **SunCalc** (MIT, ~5 KB) for sun/moon position math.
- Google Fonts self-hosted in `/fonts` for the same reason.

```
/
  index.html
  config.js          ← the only file Kevin edits
  /css/panel.css
  /js/
    app.js           orchestrator, scheduler, error boundary
    store.js         localStorage cache + staleness
    clock.js
    weather.js
    solunar.js
    calendar.js
    markets.js
    camera.js
  /vendor/suncalc.js
  /fonts/
```

---

## 4. `config.js` — all tuning lives here

```js
export const CONFIG = {
  location: { lat: 45.19, lon: -73.55, label: "Maison" },  // confirm exact coords
  timezone: "America/Toronto",
  locale: "fr-CA",              // see open question #3
  units: { temp: "celsius", wind: "kmh" },

  refresh: {
    weather:  15 * 60 * 1000,
    calendar: 10 * 60 * 1000,
    markets:   2 * 60 * 1000,   // market hours only
    solunar:   5 * 60 * 1000,   // cheap, it's local math
    camera:         2 * 1000,
  },

  markets: {
    finnhubKey: "",             // see §7 note on key exposure
    symbols: [
      { sym: "SPY", label: "S&P 500" },
      { sym: "QQQ", label: "Nasdaq 100" },
      { sym: "DIA", label: "Dow" },
      { sym: "IWM", label: "Russell 2000" },
    ],
  },

  calendar: { mode: "api", calendarId: "", googleApiKey: "" },
  camera:   { enabled: false, feeds: [] },

  night: { start: 21, end: 6, dimTo: 0.35 },
  dailyReloadHour: 3,
};
```

---

## 5. Tile specs

### 5.1 Weather — Open-Meteo

No API key, no signup, `Access-Control-Allow-Origin: *`, ~10k requests/day. Confirmed working from the browser.

```
GET https://api.open-meteo.com/v1/forecast
  ?latitude={lat}&longitude={lon}
  &current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,
           wind_direction_10m,relative_humidity_2m,is_day
  &hourly=temperature_2m,precipitation_probability,weather_code
  &daily=weather_code,temperature_2m_max,temperature_2m_min,
         sunrise,sunset,precipitation_probability_max
  &timezone=America%2FToronto&forecast_days=6
```

Render: current temp as the hero number, feels-like + wind + humidity beneath it, a 12-hour horizontal strip (hour, icon, temp, precip %), and 5 day rows.

`weather_code` is a WMO code — build a lookup mapping code → label (in the chosen locale) → icon. Ship the icons as inline SVG, not an icon font.

Attribution required: Open-Meteo is CC BY 4.0. Put a small credit line in the footer.

### 5.2 Fishing / solunar — computed locally

**Zero network calls.** This is the tile with no off-the-shelf feed, and it's the easiest one, because it's all astronomy math.

Using SunCalc, compute for the configured lat/lon:

- Moon phase (0–1) and illumination %, rendered as an actual drawn moon disc in SVG, not an emoji.
- Moonrise, moonset, sunrise, sunset, civil twilight.
- **Major periods**: moon transit (moon at highest point overhead) and moon underfoot (opposite meridian), each ±1 hour.
- **Minor periods**: moonrise and moonset, each ±30 minutes.

Note SunCalc gives moon *position* (altitude/azimuth) and rise/set times. Transit is the local time of maximum lunar altitude — find it by sampling altitude across the day at 1-minute resolution and taking the peak; underfoot is the minimum. Sampling is fine, this runs once per refresh on a device that's otherwise idle.

Day rating: a simple 0–4 star score, weighted by proximity to new/full moon (peak solunar activity) with a bonus when a major period overlaps sunrise or sunset. Document the formula in a comment so Kevin can tune it — this is folk knowledge, not physics, and he'll want to adjust it against what he actually catches.

Highlight the **next** period prominently with a countdown. That's the number he'll walk past and glance at.

### 5.3 Calendar — Google

Two viable paths without a server. **Build path A; keep B documented as the fallback.**

**Path A — Calendar API v3 with a browser API key.** Works only against a calendar whose sharing is set to public. The clean move is a dedicated "Maison" calendar holding household events, made public, while personal calendars stay private.

```
GET https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
  ?key={API_KEY}&timeMin={now}&timeMax={now+7d}
  &singleEvents=true&orderBy=startTime&maxResults=20
```

Restrict the API key in Google Cloud Console to the Calendar API and to the Pages domain as an HTTP referrer.

Gives full styling control: today's events large, next 7 days condensed, all-day events distinguished from timed ones.

**Path B — iframe embed.** Zero code, and it shows private calendars as long as the tablet's browser stays signed into the Google account. Trade-off: almost no styling control, and it will look like a Google product bolted onto the panel. Use only if Kevin isn't comfortable making a calendar public.

### 5.4 Markets — Finnhub

CORS-enabled, free tier is 60 calls/minute, covers US equities and ETFs. Kevin already has a key from the n8n stack.

```
GET https://finnhub.io/api/v1/quote?symbol=SPY&token={KEY}
→ { c: current, d: change, dp: changePct, pc: prevClose, h, l, o }
```

**Use ETF proxies, not index symbols.** The free tier doesn't serve `^GSPC` and friends; SPY / QQQ / DIA / IWM track the same thing and are covered. Label them by the index name so the panel reads naturally.

Poll only between 09:30 and 16:00 ET on weekdays. Outside those hours, show the last close and stop hitting the API — four symbols every 2 minutes for 6.5 hours is ~800 calls/day, and there's no reason to spend more.

Colour: green up, red down, with the arrow and sign doing the work so it's still readable if the colour washes out at an angle.

### 5.5 Camera — Phase 5, and the one real limitation

**A browser cannot play RTSP.** Not with a plugin, not with a trick. This is the single thing the no-server architecture genuinely costs.

The tablet-only workaround, in order of preference:

1. **HTTP snapshot polling.** Most IP cameras expose a still-image CGI endpoint. Point an `<img>` at it and swap `src` every 1–2 seconds with a cache-busting query param. Not video, but for a glance-at-the-wall panel it's honestly enough. Needs the camera brand to know the URL pattern — see open question #2.
2. **MJPEG stream**, if the camera offers one. Drop the URL straight into `<img src>` and the browser plays it natively.
3. **Tap-to-open tile.** A camera-shaped tile that launches the vendor's Android app via intent. Ugly but reliable.

Whichever path: the camera lives on the LAN, so this tile only works when the tablet is on home wifi, and the URL must never be committed to a public repo. Keep camera credentials in `config.js` and keep the repo private.

---

## 6. Resilience — this thing runs unattended for months

Non-negotiable behaviours:

- **Independent tiles.** Every fetch wrapped in its own try/catch. One failing API must never blank the panel. If markets die, weather keeps updating.
- **Cache last-good.** Persist each tile's last successful payload to `localStorage`. On failure, keep rendering the cached value at reduced opacity with a quiet "updated 14:20" timestamp. A slightly stale reading beats an empty box.
- **Backoff.** On failure, retry at 2×, 4×, 8× the normal interval, capped at 30 minutes. Reset on success.
- **Daily reload** at the configured hour (default 03:00) to clear any accumulated memory leak. Android WebView left running for weeks will otherwise degrade.
- **Offline detection.** Listen for `online`/`offline` events; show one small persistent indicator rather than an error per tile.
- **Silent logging.** Ring-buffer the last 50 errors in memory, exposed via a hidden long-press on the clock. No console spam, no alerts, no modals — nothing that can obscure the panel.

---

## 7. Security notes, stated plainly

API keys in client-side JS are visible to anyone who loads the page. For this project that's acceptable, with conditions:

- The Finnhub key is read-only market data on a free tier. Worst case is quota theft. Restrict by HTTP referrer where the provider allows it.
- The Google API key **must** be referrer-restricted to the Pages domain and scoped to the Calendar API only.
- The repo stays **private**. Camera URLs and credentials never touch a public repo.
- If the Pages URL is guessable, add Cloudflare Access with a single allowed email — the tablet authenticates once and stays authenticated.

---

## 8. Display and design direction

This is a panel read from **two to three metres away, in a hallway, at a glance**. That constraint, not decoration, drives the design.

**Reject:** the SaaS-card look — every tile in an identical rounded box with an identical border and shadow. It flattens hierarchy exactly where hierarchy is the whole point. Separation should come from space and scale, not from drawing boxes around things.

**Concept:** an almanac instrument board. Dark ground so the panel disappears into a wall at night, with the readouts as the only lit things — closer to a boat's helm display than to a web dashboard.

**Palette**

```
--ground        #0D1417   deep lake-at-dusk, near-black with a green cast
--ground-raised #141E22   used sparingly, for the camera strip only
--ink-high      #F2F5F3   primary readouts
--ink-mid       #8FA3A6   labels, secondary values
--tide          #4FB3C9   cold/water accent — temperature, precipitation
--solunar       #E8A33D   warm accent — reserved exclusively for active fishing periods
--up            #4FC08D
--down          #E5615E
```

Spend the boldness in one place: the **solunar amber**. It appears nowhere else on the panel, so when a fishing period is active the wall visibly changes colour and Kevin knows from across the room.

**Type:** Archivo for readouts (tabular figures on, so numbers don't jitter when they update), Public Sans for labels and event text. Sentence case throughout — no all-caps labels.

**Type scale:** hero temperature ~180px, section readouts ~64px, labels ~20px, minimum body 18px. If it's under 18px it can't be read from the hall, so it shouldn't be on the panel.

**Layout** — landscape, fixed viewport, **no scrolling ever**:

```
┌──────────────────────────────────────────────────────────┐
│  14:32                              lundi 7 septembre    │
├─────────────────────┬──────────────────┬─────────────────┤
│                     │                  │  ◐ moon disc    │
│      -3°            │  Today           │  waxing 68%     │
│      feels -9°      │  ─────────       │                 │
│      ↖ 22 km/h      │  09:00  event    │  next major     │
│                     │  14:30  event    │  in 1h 12m      │
│  ── hourly strip ── │                  │  ★★★☆           │
│  ── 5 day rows ───  │  Tomorrow        │                 │
│                     │  ...             │  ── markets ──  │
├─────────────────────┴──────────────────┴─────────────────┤
│  [cam 1]  [cam 2]                    (phase 5)           │
└──────────────────────────────────────────────────────────┘
```

**Night mode:** after the configured hour, drop overall opacity and shift toward warm — a bright panel in a dark hallway is genuinely unpleasant to walk past at 2am.

**Burn-in:** shift the whole layout by a few pixels on a slow hourly cycle. Static high-contrast elements on an always-on display will ghost otherwise, and this panel will be showing the same clock in the same place for years.

**Motion:** essentially none. Number changes cross-fade over ~300ms and nothing else moves. A wall panel that animates is a wall panel that catches your eye when it has nothing to say. Respect `prefers-reduced-motion` anyway.

---

## 9. Build order

Each phase should end deployed and visible on the tablet, so problems surface on real hardware early.

| Phase | Deliverable | Done when |
|---|---|---|
| 1 | Shell, grid, tokens, clock, weather, deploy to Pages | Live weather on the tablet |
| 2 | Solunar module + moon rendering | Periods match a published solunar table for the same date |
| 3 | Calendar (path A) | Real events, correct all-day handling |
| 4 | Markets strip + market-hours gating | Correct quotes, no polling overnight |
| 5 | Camera | Snapshot refresh on LAN |
| 6 | Kiosk hardening, night mode, burn-in shift, mount | Runs 7 days unattended without a reload |

---

## 10. Tablet setup checklist

- **Fully Kiosk Browser** — the standard tool for this. Set: start URL, fullscreen, screen always on, disable pull-to-refresh, disable long-press context menu, motion-detect screen wake if the tablet has a front camera.
- Disable auto-update and all notifications on the tablet.
- **Battery:** charging 24/7 swells batteries within a year or two. If the tablet supports a charge limit, cap it at 80%. If not, budget for it as a consumable.
- Plan the power cable route **before** drilling.
- Landscape lock.

---

## 11. Open questions — need answers before Phase 3+

1. **Tablet model and Android version?** Determines WebView version, which determines how modern the JS and CSS can be.
2. **Camera brand and model?** Determines whether snapshot polling is available and what the URL pattern is. Blocks Phase 5 entirely.
3. **French or English on the panel?** Affects weather-code labels, date formatting, and the type scale. `fr-CA` is assumed above.
4. **Is a dedicated public "Maison" calendar acceptable?** Decides calendar path A vs. B.
5. **Exact coordinates** for the house, for accurate solunar timing.

Phases 1 and 2 can start immediately — neither depends on any of these.
