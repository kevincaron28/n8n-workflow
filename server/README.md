# Local bridge

A small local Node service, meant to run on Kevin's PC for now and move to a Raspberry Pi later.
It does two things:

1. **Speaker control** — discovers and controls Google Home / Chromecast-enabled speakers on the
   LAN, exposed as plain HTTP for the tablet's browser to call.
2. **Markets proxy** (optional) — re-serves FMP quotes with the API key held here (an environment
   variable) instead of in the publicly-served `config.js`.

**Why speaker control needs this at all:** a browser genuinely cannot do it itself. Controlling a
Cast device needs local network device discovery (mDNS) and a raw socket protocol — there's no
CORS-friendly public API for it. That's the one piece of Maison Panel that needs a real always-on
process somewhere on the LAN, which is why it lives here instead of in `/js` with everything else.

**Why markets is here too:** a server-to-server call has no CORS restriction and, more importantly,
never exposes the key to the browser at all — `view-source` on the deployed page can't see a key
that was never sent to it in the first place. This is optional; markets keeps working exactly as
it does today (direct client-side fetch) until `config.js` → `markets.bridgeUrl` is set.

## Setup

Requires Node.js 18+, running on a machine on the **same LAN/Wi-Fi** as the speakers (and the
tablet).

```
cd server
npm install
npm start
```

You should see something like:

```
[speaker-bridge] listening on http://0.0.0.0:8787
[speaker-bridge] waiting for Cast devices to announce themselves...
[speaker-bridge] discovered "Living Room speaker" (192.168.1.42) as "living-room-speaker"
```

Devices can take a few seconds to announce themselves after startup — that's normal. If nothing
shows up after ~30 seconds, see **Troubleshooting** below.

Verify it's working before touching the panel at all:

```
curl http://localhost:8787/api/health
curl http://localhost:8787/api/speakers
```

## Wiring it into the panel

1. Find this machine's LAN IP address (not `localhost` — the tablet needs to reach it over
   Wi-Fi): `ipconfig` on Windows, `ip addr` or `hostname -I` on Linux/Raspberry Pi OS.
2. In the repo's `config.js`, for speakers:
   ```js
   speakers: {
     enabled: true,
     bridgeUrl: "http://192.168.1.50:8787", // this machine's IP and the port above
     refresh: 10 * 1000,
   },
   ```
   And, if you also want markets routed through here (see **Markets proxy setup** below):
   ```js
   markets: {
     bridgeUrl: "http://192.168.1.50:8787", // same address as speakers.bridgeUrl
     // fmpKey stops being read once bridgeUrl is set — safe to remove it from config.js at that point
   },
   ```
3. Push that change — Cloudflare redeploys the panel automatically.
4. **On the tablet**, in Fully Kiosk Browser: enable **"Allow insecure content" / "Enable Mixed
   Content"** (exact name varies by version, under Web Content Settings). The panel is served over
   `https://`, but this bridge is plain `http://` on the LAN — browsers block that combination by
   default, same as the camera tile in the brief. This is a one-time setting, not a code fix.

## Markets proxy setup

Set `FMP_KEY` in the environment before starting the bridge — it's never read from `config.js` or
committed anywhere:

```
# macOS/Linux
FMP_KEY=your-fmp-key npm start

# Windows (PowerShell)
$env:FMP_KEY="your-fmp-key"; npm start
```

Without `FMP_KEY` set, `/api/markets` responds `503` and the panel just keeps using its existing
direct-to-FMP path — nothing breaks by leaving this unconfigured.

## Keeping it running

For now, on the PC, just leave the terminal window open (or run `npm start` again after a reboot).
Once this moves to a Raspberry Pi, run it as a real background service so it survives reboots —
e.g. a systemd unit:

```ini
# /etc/systemd/system/maison-bridge.service
[Unit]
Description=Maison Panel local bridge
After=network-online.target

[Service]
WorkingDirectory=/home/pi/Maison-Panel/server
ExecStart=/usr/bin/node index.js
Restart=on-failure
User=pi
Environment=FMP_KEY=your-fmp-key
# ^ only needed if markets is routed through the bridge — omit otherwise

[Install]
WantedBy=multi-user.target
```

Then `sudo systemctl enable --now maison-bridge`.

## API

All responses are JSON. No auth — this is a LAN-only tool with nothing secret in play.

| Endpoint | Method | Body | Does |
|---|---|---|---|
| `/api/health` | GET | — | `{ ok, speakerCount }` — is the bridge alive |
| `/api/speakers` | GET | — | list of known speakers with status |
| `/api/speakers/:id/pause` | POST | — | pause |
| `/api/speakers/:id/resume` | POST | — | resume/unpause |
| `/api/speakers/:id/stop` | POST | — | stop |
| `/api/speakers/:id/volume` | POST | `{ "level": 0.0-1.0 }` | set volume |
| `/api/markets?symbols=SPY,QQQ` | GET | — | FMP batch quotes; `503` if `FMP_KEY` isn't set |

A speaker's `:id` is a slug of its name (e.g. "Living Room speaker" → `living-room-speaker`) —
check `/api/speakers` to see the exact ids for your devices.

## Known limitation — please verify against your real speakers

This was built and tested for correctness against the `chromecast-api` library's own source and a
live HTTP smoke test, but **not against real Google Home hardware** — there wasn't any reachable
from where this was built. Two things worth knowing once you do test it:

- **Status** (`/api/speakers`) reads the Cast receiver's status, which works no matter what started
  playback — a voice command, Spotify, YouTube Music, or this bridge itself.
- **Transport controls** (pause/resume/stop) only work for a session this bridge can actually join.
  In practice that reliably means content it casts itself, or the built-in YouTube/default-receiver
  apps. A session a third-party app started under its *own* Cast receiver (Spotify's, for instance)
  may show up fine in status but not respond to pause/resume — that's a Cast protocol boundary, not
  a bug to file here. Volume control is receiver-level and should work regardless.

If that limitation turns out to matter for how you actually use these speakers, say so and this can
be revisited — there are lower-level ways to influence third-party sessions, they're just more
involved than this first pass.

## Troubleshooting

- **No devices found**: confirm this machine and the speakers are on the same Wi-Fi network/subnet
  (a "guest" network or an isolated IoT VLAN will hide them). Some routers block the mDNS multicast
  traffic discovery needs between subnets — same-subnet Wi-Fi is the easy case.
- **Panel shows nothing / console says failed to fetch**: check the mixed-content setting above,
  and confirm `bridgeUrl` in `config.js` matches this machine's *current* LAN IP (it can change on
  reboot unless you reserve it in your router's DHCP settings — worth doing once this is permanent).
