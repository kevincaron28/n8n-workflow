// Markets strip — Phase 4 (docs/project-brief.md §5.4). Financial Modeling Prep (FMP) quotes for
// the ETF proxies in config.markets.symbols, polled during 09:30-16:00 ET on weekdays, plus one
// fetch any time there's no cached data yet at all (so a fresh install isn't stuck blank until the
// next market session). Outside that window with a cache already in hand — or before an fmpKey is
// set in config.js — it just shows the last close and makes no network calls. FMP's free tier is
// end-of-day only (confirmed via their own docs), so that close is the freshest data there is
// regardless of when it's fetched.
import { loadCache, saveCache, formatUpdatedAt } from "./store.js";

const MINUTE_MS = 60 * 1000;
const MAX_INTERVAL_MS = 30 * MINUTE_MS;
const CLOSED_CHECK_MS = 5 * MINUTE_MS;
// Bumped from "markets" — a tablet that already cached the pre-batch-fix result (only SPY, from
// when 3 of 4 parallel requests were silently failing) would otherwise keep re-showing that stale,
// incomplete cache forever outside market hours, since the fetch is normally gated to market hours
// once *any* cache exists. Changing the key makes it look like no cache exists yet on next load,
// which triggers an immediate fetch regardless of the clock (see the tick() comment below) and
// naturally self-heals — this isn't something to keep bumping routinely, just for a fetch/shape
// change like this one where an old cached value would otherwise be silently wrong forever.
const CACHE_KEY = "markets-v2";

function isMarketOpen(date, marketHours) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  const isWeekday = !["Sat", "Sun"].includes(parts.weekday);
  const minutesNow = Number(parts.hour) * 60 + Number(parts.minute);
  const openMin = marketHours.startHourEt * 60 + marketHours.startMinuteEt;
  const closeMin = marketHours.endHourEt * 60;
  return isWeekday && minutesNow >= openMin && minutesNow < closeMin;
}

function parseQuotes(data) {
  const quotes = {};
  for (const q of Array.isArray(data) ? data : []) {
    if (q?.symbol) quotes[q.symbol] = q;
  }
  return quotes;
}

// One batch call for every symbol, not N parallel single-symbol calls. Firing 4 simultaneous
// requests at a free-tier API is exactly the kind of thing that trips a concurrent-connection
// limit — 3 silently failing while 1 succeeds is consistent with that, and matches what showed up
// on the tablet (only SPY rendering). FMP's batch-quote endpoint returns every requested symbol in
// one response; a symbol FMP can't find is just missing from the array, so a single bad ticker
// still can't blank the others.
//
// If markets.bridgeUrl is set (the PC/Pi bridge, see /server), route through it instead — the
// bridge holds the FMP key server-side (an env var, never shipped to the browser) rather than in
// this public config.js. Until Kevin sets that up, bridgeUrl stays empty and this fetches FMP
// directly with fmpKey, exactly as before.
async function fetchAllQuotes(symbols, marketsConfig) {
  const symbolList = symbols.map((s) => s.sym).join(",");

  if (marketsConfig.bridgeUrl) {
    const url = new URL(`${marketsConfig.bridgeUrl}/api/markets`);
    url.searchParams.set("symbols", symbolList);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`bridge markets ${res.status}`);
    return parseQuotes(await res.json());
  }

  const url = new URL("https://financialmodelingprep.com/stable/batch-quote");
  url.searchParams.set("symbols", symbolList);
  url.searchParams.set("apikey", marketsConfig.fmpKey);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FMP batch-quote ${res.status}`);
  return parseQuotes(await res.json());
}

function arrow(change) {
  return change > 0 ? "▲" : change < 0 ? "▼" : "▬";
}

function render(root, config, quotes, meta) {
  const isFr = config.locale?.startsWith("fr");
  const list = root.querySelector(".market-list");
  list.innerHTML = "";

  for (const s of config.markets.symbols) {
    const q = quotes[s.sym];
    if (!q) continue;
    const row = document.createElement("div");
    row.className = `market-row ${q.change >= 0 ? "market-up" : "market-down"}`;
    row.innerHTML =
      `<span class="market-label">${s.label}</span>` +
      `<span class="market-values">` +
      `<span class="market-price">${q.price.toFixed(2)}</span>` +
      `<span class="market-change">${arrow(q.change)} ${q.change >= 0 ? "+" : ""}${q.changePercentage.toFixed(2)}%</span>` +
      `</span>`;
    list.appendChild(row);
  }

  const note = root.querySelector(".market-note");
  if (Object.keys(quotes).length === 0) {
    note.textContent = "";
  } else if (meta.marketOpen) {
    note.textContent = "";
  } else {
    note.textContent = `${isFr ? "marché fermé" : "market closed"} — ${formatUpdatedAt(meta.fetchedAt)}`;
  }
}

export function initMarkets(config, root) {
  let interval = config.refresh.markets;

  async function tick() {
    const now = new Date();
    const open = isMarketOpen(now, config.markets.marketHours);
    const hasCredentials = Boolean(config.markets.bridgeUrl || config.markets.fmpKey);
    const cached = loadCache(CACHE_KEY);

    // Fetch during market hours (to catch the close as it lands), or any time there's no cache
    // yet at all — otherwise a fresh install loading outside 09:30-16:00 ET would show nothing
    // until the next session, even though last close is available from FMP right now regardless
    // of the clock.
    if (hasCredentials && (open || !cached)) {
      try {
        const quotes = await fetchAllQuotes(config.markets.symbols, config.markets);
        if (Object.keys(quotes).length === 0) throw new Error("no quotes returned");
        saveCache(CACHE_KEY, quotes);
        interval = config.refresh.markets;
        render(root, config, quotes, { marketOpen: open, fetchedAt: Date.now() });
      } catch (err) {
        console.warn("[markets]", err);
        interval = Math.min(interval * 2, MAX_INTERVAL_MS);
        if (cached) render(root, config, cached.data, { marketOpen: false, fetchedAt: cached.fetchedAt });
      }
    } else if (cached) {
      render(root, config, cached.data, { marketOpen: false, fetchedAt: cached.fetchedAt });
    }

    setTimeout(tick, open ? interval : CLOSED_CHECK_MS);
  }

  tick();
}
