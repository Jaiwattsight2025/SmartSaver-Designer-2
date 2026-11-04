# Changelog

## [designer-v2] – 2026-11-05 – Milestone D2: roof outlines first, then panels

- Roof faces now get a real outline estimate (rectangle / hip / valley / fit-to-Google-panels) instead of a hull
  around Google's panel dots. Each face shows how sure we are (good / check corners / rough).
- Select a face and drag its corner dots on the map (drag a middle dot to add a corner, right-click to delete one).
  Pitch can be corrected per face. Reset outline puts back the estimate. Overlapping faces are flagged.
- New "Confirm roof" step. Panels are only placed after the roof is confirmed; any roof change asks again.
- New panel filler: 0.4 m setback from every edge (adjustable), straight rows from the gutter, portrait or
  landscape, real module size per wattage, strict inside checks. Google data is only used to rank spots and for yield.
- No-go areas (vents, skylights, aircon) with 0.3 m clearance.
- Panel edit mode: click a panel to remove, click a blue outline to add, drag to move (snaps to the row).
- Final checks: every panel inside its face with the setback, no overlaps, nothing on a no-go area, kW cap
  (13.2 kW) and inverter limit (133%).
- Known gaps: no DSM plane fit / building footprint yet (needs Google data layers + GeoTIFF parsing); outlines are
  estimates until the customer checks them.

## [designer-v1] – 2026-11-04 – Milestone D1

### Added
- Wattsight hand-off: bill profile read from the URL or an uploaded Wattsight results `.json`,
  validated (bad values dropped with a warning), shown as "Your bill data from Wattsight".
  Manual entry when there is no Wattsight data.
- Roof step: faces built from Google Solar API roof segments (pitch, direction, area, sun rating),
  drawn on the map, tick to include/exclude; trace your own faces by clicking the map.
- Panels step: Google's panel spots on the chosen faces, grid layout for traced faces,
  panel count and module wattage controls, defaults to the Wattsight solar size.
- Battery & inverter step with suggested sizes (Wattsight battery size) and DC/AC ratio check.
- Output step: yearly and monthly generation, self-use vs export, bill before/after using the
  customer's usage rate, supply charge and feed-in tariff (hourly average-day model, battery included).
- Summary step: system, savings, placeholder price range and payback; "Get a quote",
  "Shop energy-saving products", print / save as PDF, JSON download, copy text.
- Placeholder pricing config (`src/config/pricing.js`) and modelling config (`src/config/designerConfig.js`).
- Vitest unit tests (`npm test`).

### Changed
- Solar API lookup falls back from MEDIUM to BASE imagery quality when MEDIUM has no data.
- Bottom bar now shows roof area, solar size, battery, yearly output and yearly saving.
- Dark UI styles for the new steps, mobile layout and print styles.
- Removed the disabled "Save draft" button.

### Not removed (unused now, left for review)
- `frontend/src/components/RoofFaceList.jsx`, `frontend/src/hooks/useRoofFaces.js`.
