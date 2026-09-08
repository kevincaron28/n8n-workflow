// Camera tile — Phase 5 (docs/project-brief.md §5.5). HTTP snapshot polling per feed: an <img>
// pointed at a LAN snapshot URL, src swapped on an interval with a cache-busting query param —
// brief §5.5 option 1 (no browser can play RTSP, this is the workaround). Each feed fails and
// recovers independently; there's no persistent connection to "reconnect," so a feed that comes
// back online just starts succeeding on its next poll tick.
let overlay = null;

function ensureOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.className = "camera-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <button class="camera-overlay-close" aria-label="close">&times;</button>
    <div class="camera-overlay-name"></div>
    <img class="camera-overlay-img" alt="" />
  `;
  overlay.querySelector(".camera-overlay-close").addEventListener("click", closeOverlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeOverlay();
  });
  document.body.appendChild(overlay);
  return overlay;
}

function closeOverlay() {
  if (overlay) overlay.hidden = true;
}

function openOverlay(feed, currentSrc) {
  const el = ensureOverlay();
  el.dataset.feedId = feed.id;
  el.querySelector(".camera-overlay-name").textContent = feed.name;
  // Seed from the thumbnail's already-loaded image immediately — otherwise the overlay shows a
  // broken-image icon until the next poll tick (up to refreshMs later) sets a src for the first time.
  if (currentSrc) el.querySelector(".camera-overlay-img").src = currentSrc;
  el.hidden = false;
}

function snapshotUrl(feed) {
  return `${feed.snapshotUrl}${feed.snapshotUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

function initFeed(config, root, feed) {
  const card = document.createElement("div");
  card.className = "camera-feed";
  card.innerHTML = `
    <img class="camera-feed-img" alt="${feed.name}" />
    <div class="camera-feed-label">${feed.name}</div>
    <div class="camera-feed-status">connexion…</div>
  `;
  root.appendChild(card);

  const img = card.querySelector(".camera-feed-img");
  const status = card.querySelector(".camera-feed-status");

  card.addEventListener("click", () => openOverlay(feed, img.src));

  function setState(state) {
    card.classList.toggle("is-offline", state === "offline");
    status.hidden = state !== "offline";
    status.textContent = state === "offline" ? "hors ligne" : "";
  }

  function tick() {
    const url = snapshotUrl(feed);
    img.src = url;
    if (overlay && !overlay.hidden && overlay.dataset.feedId === feed.id) {
      overlay.querySelector(".camera-overlay-img").src = url;
    }
  }

  img.addEventListener("load", () => setState("live"));
  img.addEventListener("error", () => setState("offline"));

  tick();
  setInterval(tick, feed.refreshMs || config.refresh.camera);
}

export function initCamera(config, root) {
  const feeds = (config.camera?.feeds || []).filter((f) => f.enabled && f.snapshotUrl);
  if (feeds.length === 0) return;

  for (const feed of feeds) {
    initFeed(config, root, feed);
  }
}
