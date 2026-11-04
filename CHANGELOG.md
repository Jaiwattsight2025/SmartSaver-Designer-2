# Changelog

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
