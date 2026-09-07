// The only file meant to be hand-edited day to day. See docs/project-brief.md for what each
// section means and why (§4 config, §5 tile specs, §9 build order / open questions).

export const CONFIG = {
  location: { lat: 45.19, lon: -73.55, label: "Maison" }, // TODO: confirm exact coordinates (brief §11.5)
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
    finnhubKey: "",
    marketHours: { startHourEt: 9, startMinuteEt: 30, endHourEt: 16 },
    symbols: [
      { sym: "SPY", label: "S&P 500" },
      { sym: "QQQ", label: "Nasdaq 100" },
      { sym: "DIA", label: "Dow" },
      { sym: "IWM", label: "Russell 2000" },
    ],
  },

  calendar: { mode: "api", calendarId: "", googleApiKey: "" }, // TODO: brief §11.4

  camera: { enabled: false, feeds: [] }, // TODO: blocked on camera brand/model, brief §11.2

  night: { start: 21, end: 6, dimTo: 0.35 },
  dailyReloadHour: 3,
};
