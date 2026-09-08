// The only file meant to be hand-edited day to day. See docs/project-brief.md for what each
// section means and why (§4 config, §5 tile specs, §9 build order / open questions).

export const CONFIG = {
  location: { lat: 45.167, lon: -73.517, label: "Maison" }, // Sherrington, QC (J0L 2N0) — brief §11.5 answered
  timezone: "America/Toronto",
  locale: "fr-CA", // TODO: confirm French vs English on the panel (brief §11.3)
  units: { temp: "celsius", wind: "kmh" },

  refresh: {
    weather: 15 * 60 * 1000,
    calendar: 10 * 60 * 1000,
    markets: 2 * 60 * 1000, // only polled during market hours, see markets.marketHours below
    solunar: 5 * 60 * 1000, // cheap, it's local math
    camera: 2 * 1000,
  },

  markets: {
    finnhubKey: "", // paste your Finnhub key here — the tile stays quiet with no API calls until it's set
    marketHours: { startHourEt: 9, startMinuteEt: 30, endHourEt: 16 },
    symbols: [
      { sym: "SPY", label: "S&P 500" },
      { sym: "QQQ", label: "Nasdaq 100" },
      { sym: "DIA", label: "Dow" },
      { sym: "IWM", label: "Russell 2000" },
    ],
  },

  calendar: {
    mode: "embed", // "embed" = private iframe, your own Google login on the tablet (current choice)
    calendarId: "kevincaron28@gmail.com", // the calendar to show
    googleApiKey: "", // only used if you ever switch mode to "api" (see docs/project-brief.md §5.3)
  },

  camera: { enabled: false, feeds: [] }, // TODO: blocked on camera brand/model, brief §11.2

  speakers: {
    enabled: false, // flip on once the bridge (see /server) is running and reachable
    bridgeUrl: "", // e.g. "http://192.168.1.50:8787" — the PC/Pi running the speaker bridge
    refresh: 10 * 1000,
  },

  night: { start: 21, end: 6, dimTo: 0.35 },
  dailyReloadHour: 3,
};
