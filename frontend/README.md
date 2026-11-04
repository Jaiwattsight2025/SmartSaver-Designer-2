# SmartSaver Solar + Battery Designer (frontend)

React + Vite app that takes a customer from their power bill to a sized solar +
battery system in six steps:

1. **Property** – bill data (Wattsight link, Wattsight results `.json`, or typed in) and the address.
2. **Roof** – estimated roof-face outlines from the Google Solar API, plus faces you trace by hand. Tick the ones to
   use, drag corner dots to fix outlines, mark no-go areas, then **Confirm roof**.
3. **Panels** – rows laid inside each confirmed outline (0.4 m setback, portrait/landscape, real module size); Google
   data only ranks spots and gives yield. Edit mode: click to remove/add, drag to move. Size defaults to Wattsight `sol_kw`.
4. **Battery & inverter** – suggested sizes (Wattsight `bat_kwh`), editable.
5. **Output** – yearly and monthly generation, self-use vs export, bill before/after.
6. **Summary** – size, savings, placeholder price, payback; quote / shop links; print-to-PDF and JSON download.

## Run

```bash
cd frontend
npm install
npm run dev -- --port 5173   # http://localhost:5173
npm test                     # vitest unit tests (src/lib/__tests__)
npm run build
```

`frontend/.env.local` must contain `VITE_GOOGLE_MAPS_API_KEY` (Maps JavaScript, Geocoding
and Solar APIs enabled). It is git-ignored – never commit it.

## Wattsight hand-off

Wattsight opens the designer with its profile in the query string, for example:

```
http://localhost:5173/?v=1&src=wattsight&pc=3147&st=VIC&ret=Alinta+Energy&days=31&kwh_yr=11462&kwh_day=31.4&tariff=single&rate=0.3035&supply=0.862&fit=0.05&sol_kw=10&bat_kwh=13.5
```

Keys: `v, src, pc, st, ret, days, kwh_yr, kwh_day, kwh_pk, kwh_sh, kwh_op, kwh_cl, exp_kwh,
tariff, rate, r_pk, r_sh, r_op, r_cl, supply, fit, sol_kw, bat_kwh` (rates in $/kWh, supply in $/day).
A Wattsight results file (`"format": "wattsight-results"`, version 1) can be uploaded instead.
Parsing and validation live in `src/lib/energyProfile.js`.

## Where things live

| Path | What |
| --- | --- |
| `src/config/designerConfig.js` | Modelling assumptions (yields by state, load/solar shapes, module sizes, inverter/battery options) |
| `src/config/pricing.js` | **Placeholder** prices and shop/quote URLs – edit here |
| `src/lib/` | Pure logic: profile parsing, roof faces, panel layout, energy model, design, summary export |
| `src/hooks/useDesign.js` | Joins project state into one computed design |
| `src/components/steps/` | One component per step |
| `src/services/googleMaps.js` | Map, roof-face/panel overlays and tracing |

All prices are placeholders (`PRICES_ARE_PLACEHOLDERS = true`) and are labelled as such in the UI
and in exports. Battery prices are the archived AlphaESS listings from the SmartSaver Shopify store.
