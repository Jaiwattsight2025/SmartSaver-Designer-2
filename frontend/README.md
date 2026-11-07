# SmartSaver Solar + Battery Designer (frontend)

React + Vite app that takes a customer from their power bill to a sized solar +
battery system in six steps:

1. **Property** – bill numbers (Energy Insights handoff, or typed in) and the address. The Designer does not take a bill file.
2. **Roof** – estimated roof-face outlines from the Google Solar API, plus faces you trace by hand. Tick the ones to
   use. Pitch, mounting, corners and no-go areas are under **Adjust design**. Then **Confirm roof**.
3. **Panels** – rows laid inside each confirmed outline. Edit tools are under **Adjust design**. Size can follow the Energy Insights suggestion.
4. **Battery & inverter** – suggested sizes, editable.
5. **Output** – yearly and monthly generation, self-use vs export, bill before/after.
6. **Summary** – size, savings, and price benchmarks or an installer quote; quote / shop links; print. A confirmed design keeps an internal snapshot for a later PDF. There is no customer JSON download.

## Run

```bash
cd frontend
npm install
npm run dev -- --port 5173   # http://localhost:5173
npm test                     # vitest unit tests (src/lib/__tests__)
npm run build
```

`frontend/.env.local` (see `.env.example`, git-ignored):

- `VITE_GOOGLE_MAPS_API_KEY` — Maps JavaScript, Geocoding and Solar APIs. Without it the map does not load. Roof messages then say the map or the lookup failed; they do not say the lookup succeeded.
- `VITE_INSIGHTS_API_BASE` — Insights **origin only**, for example `https://wattsight-platform.onrender.com`. No path, query, hash or token. This is baked in at build time. If it is blank, handoff shows a not-configured message and manual bill entry still works. The public “Analyse my bill in Energy Insights” link is always `https://wattsight-platform.onrender.com`.

`solar.status` inside the app starts as `Not tested` until a property is locked. That string is internal. It is not shown. Customers see the map message and the roof-step text for that address (no data, estimate, or traced).

A labelled fixture, not a live roof, is `http://localhost:5173/?preview=synthetic`.

## Energy Insights handoff

Insights should redirect the browser to the Designer with only:

```
https://<designer-host>/#handoff=<opaque-token>
```

The Designer strips that fragment immediately, then `POST`s JSON `{ "token": "<opaque-token>" }` to `{VITE_INSIGHTS_API_BASE}/api/designer-handoff/redeem` with `credentials: "omit"`. The body must be the existing profile.json (`source: "wattsight"`, with `usage`) or a `wattsight-results` wrapper. Bill numbers in the query string, `#` profile fields, and `?profile_url=` are ignored.

The backend must enforce short expiry, single redemption, the subscription gate, and CORS for the exact Designer origin. This repo does not claim that live path is done.

Still to test against a configured host (not covered by unit tests):

- CORS preflight from the Designer origin
- a fresh token redeems once and the second POST is rejected
- an expired token
- an account the subscription gate refuses
- the browser sends no cookie (`credentials: omit`)
- the token is absent from the address bar after load and is not in Designer logs
- a non-finite or oversized JSON body shows the fixed “could not use” message and does not replace a profile the customer already typed

## Where things live

| Path | What |
| --- | --- |
| `src/config/designerConfig.js` | Modelling assumptions (yields by state, load/solar shapes, module sizes, inverter/battery options) |
| `src/config/pricing.js` | Shop and quote URLs only |
| `src/lib/priceBenchmarks.js` | Solar Choice and Cheaper Home Batteries figures, with the cell each number comes from |
| `src/lib/` | Pure logic: profile parsing, roof faces, panel layout, energy model, design, summary export |
| `src/hooks/useDesign.js` | Joins project state into one computed design |
| `src/components/steps/` | One component per step |
| `src/services/googleMaps.js` | Map, roof-face/panel overlays and tracing |

Installed prices are the Solar Choice November 2026 indices (solar updated 6 November 2026, batteries the same day) and the Cheaper Home Batteries STC factors (updated 9 June 2026). A size outside those tables is unavailable. Solar and battery figures are not added together. A simple payback is shown only from one complete price: a solar-only index figure, or an installer quote the customer types.
