// Speaker control tile. Talks only to the local speaker-bridge Node service (see /server) — a
// browser can't do Cast-protocol device discovery or control directly, so that bridge (running on
// Kevin's PC, later a Raspberry Pi) does it and exposes a small HTTP API instead. Stays quiet
// until both config.speakers.enabled and config.speakers.bridgeUrl are set.
import { loadCache, saveCache } from "./store.js";

const CACHE_KEY = "speakers";

// Inline SVG, not emoji or an icon font, matching the rest of the panel's icons.
function icon(kind) {
  switch (kind) {
    case "play":
      return '<svg viewBox="0 0 20 20" width="1em" height="1em"><path d="M5 3l12 7-12 7V3z" fill="currentColor"/></svg>';
    case "pause":
      return '<svg viewBox="0 0 20 20" width="1em" height="1em"><rect x="4" y="3" width="4" height="14" fill="currentColor"/><rect x="12" y="3" width="4" height="14" fill="currentColor"/></svg>';
    case "stop":
      return '<svg viewBox="0 0 20 20" width="1em" height="1em"><rect x="4" y="4" width="12" height="12" fill="currentColor"/></svg>';
    default:
      return "";
  }
}

async function fetchSpeakers(bridgeUrl) {
  const res = await fetch(`${bridgeUrl}/api/speakers`);
  if (!res.ok) throw new Error(`speaker bridge ${res.status}`);
  return res.json();
}

async function postAction(bridgeUrl, id, action, body) {
  const res = await fetch(`${bridgeUrl}/api/speakers/${id}/${action}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`speaker bridge ${res.status}`);
  return res.json();
}

function render(root, speakers, config, bridgeUrl, onActionDone) {
  const isFr = config.locale?.startsWith("fr");
  const list = root.querySelector(".speaker-list");
  list.innerHTML = "";

  if (speakers.length === 0) {
    list.textContent = isFr ? "aucun haut-parleur trouvé" : "no speakers found";
    return;
  }

  for (const s of speakers) {
    const row = document.createElement("div");
    row.className = "speaker-row" + (s.reachable ? "" : " is-stale");

    const status = !s.reachable
      ? isFr
        ? "hors ligne"
        : "offline"
      : s.app
        ? `${s.app}${s.statusText ? " — " + s.statusText : ""}`
        : isFr
          ? "en veille"
          : "idle";

    const disabled = s.reachable ? "" : "disabled";
    row.innerHTML =
      `<div class="speaker-head">` +
      `<span class="speaker-name">${s.name}</span>` +
      `<span class="speaker-status">${status}</span>` +
      `</div>` +
      `<div class="speaker-controls">` +
      `<button class="speaker-btn" data-action="resume" aria-label="play" ${disabled}>${icon("play")}</button>` +
      `<button class="speaker-btn" data-action="pause" aria-label="pause" ${disabled}>${icon("pause")}</button>` +
      `<button class="speaker-btn" data-action="stop" aria-label="stop" ${disabled}>${icon("stop")}</button>` +
      `<button class="speaker-btn speaker-vol" data-action="vol-down" aria-label="volume down" ${disabled}>−</button>` +
      `<span class="speaker-volume">${s.volume != null ? Math.round(s.volume * 100) + "%" : "—"}</span>` +
      `<button class="speaker-btn speaker-vol" data-action="vol-up" aria-label="volume up" ${disabled}>+</button>` +
      `</div>`;

    row.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          if (btn.dataset.action === "vol-up" || btn.dataset.action === "vol-down") {
            const current = s.volume ?? 0.5;
            const level = Math.min(1, Math.max(0, current + (btn.dataset.action === "vol-up" ? 0.1 : -0.1)));
            await postAction(bridgeUrl, s.id, "volume", { level });
          } else {
            await postAction(bridgeUrl, s.id, btn.dataset.action);
          }
          onActionDone();
        } catch (err) {
          console.warn("[speakers]", err);
        }
      });
    });

    list.appendChild(row);
  }
}

export function initSpeakers(config, root) {
  const { enabled, bridgeUrl, refresh } = config.speakers;
  if (!enabled || !bridgeUrl) return;

  let timer = null;

  async function refreshNow() {
    try {
      const speakers = await fetchSpeakers(bridgeUrl);
      saveCache(CACHE_KEY, speakers);
      render(root, speakers, config, bridgeUrl, refreshNow);
    } catch (err) {
      console.warn("[speakers]", err);
      const cached = loadCache(CACHE_KEY);
      if (cached) render(root, cached.data, config, bridgeUrl, refreshNow);
    }
  }

  function scheduleNext() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      refreshNow();
      scheduleNext();
    }, refresh);
  }

  refreshNow();
  scheduleNext();
}
