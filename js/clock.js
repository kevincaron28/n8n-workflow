// Clock + date tile. Local device time — no network, no cache needed.

export function initClock(config, root) {
  const timeEl = root.querySelector(".clock-time");
  const dateEl = root.querySelector(".clock-date");

  const timeFmt = new Intl.DateTimeFormat(config.locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: config.timezone,
  });
  const dateFmt = new Intl.DateTimeFormat(config.locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: config.timezone,
  });

  function render() {
    const now = new Date();
    timeEl.textContent = timeFmt.format(now);
    dateEl.textContent = dateFmt.format(now);
  }

  render();
  setInterval(render, 15 * 1000);
}
