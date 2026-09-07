// Markets strip — Phase 4 (docs/project-brief.md §5.4). Finnhub quotes for the ETF proxies in
// config.markets.symbols, polled only 09:30-16:00 ET on weekdays; outside that window (or before a
// finnhubKey is set in config.js) it just shows the last cached close and makes no network calls.
import { loadCache, saveCache, formatUpdatedAt } from "./store.js";

const MINUTE_MS = 60 * 1000;
const MAX_INTERVAL_MS = 30 * MINUTE_MS;
const CLOSED_CHECK_MS = 5 * MINUTE_MS;
const CACHE_KEY = "markets";

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

async function fetchQuote(symbol, key) {
  const url = new URL("https://finnhub.io/api/v1/quote");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("token", key);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub ${symbol} ${res.status}`);
  return res.json();
}

// Each symbol fails independently — one bad quote shouldn't blank the others.
async function fetchAllQuotes(symbols, key) {
  const results = await Promise.allSettled(symbols.map((s) => fetchQuote(s.sym, key)));
  const quotes = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled") quotes[symbols[i].sym] = r.value;
    else console.warn(`[markets] ${symbols[i].sym}`, r.reason);
  });
  return quotes;
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
    row.className = `market-row ${q.d >= 0 ? "market-up" : "market-down"}`;
    row.innerHTML =
      `<span class="market-label">${s.label}</span>` +
      `<span class="market-price">${q.c.toFixed(2)}</span>` +
      `<span class="market-change">${arrow(q.d)} ${q.d >= 0 ? "+" : ""}${q.dp.toFixed(2)}%</span>`;
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
    const key = config.markets.finnhubKey;

    if (open && key) {
      try {
        const quotes = await fetchAllQuotes(config.markets.symbols, key);
        if (Object.keys(quotes).length === 0) throw new Error("no quotes returned");
        saveCache(CACHE_KEY, quotes);
        interval = config.refresh.markets;
        render(root, config, quotes, { marketOpen: true });
      } catch (err) {
        console.warn("[markets]", err);
        interval = Math.min(interval * 2, MAX_INTERVAL_MS);
        const cached = loadCache(CACHE_KEY);
        if (cached) render(root, config, cached.data, { marketOpen: false, fetchedAt: cached.fetchedAt });
      }
    } else {
      // market closed, or no key configured yet — never call the API, just show the last close
      const cached = loadCache(CACHE_KEY);
      if (cached) render(root, config, cached.data, { marketOpen: false, fetchedAt: cached.fetchedAt });
    }

    setTimeout(tick, open ? interval : CLOSED_CHECK_MS);
  }

  tick();
}
