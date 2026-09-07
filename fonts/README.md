# Self-hosted fonts

`css/panel.css` expects two variable font files here, not fetched from a CDN (brief §3 — a CDN
outage shouldn't blank the wall):

- `archivo-variable.woff2` — [Archivo](https://fonts.google.com/specimen/Archivo), used for readouts
  (clock, hero temperature, section numbers). Enable tabular figures.
- `public-sans-variable.woff2` — [Public Sans](https://fonts.google.com/specimen/Public+Sans), used
  for labels and event text.

Both are open-source (OFL) and available from Google Fonts or
[Fontsource](https://fontsource.org/). Download the variable woff2 build of each and drop them in
this directory under the filenames above. Until they're added, the panel falls back to the system
font stack declared alongside each `@font-face` rule — everything still renders, just not in the
final typeface.
