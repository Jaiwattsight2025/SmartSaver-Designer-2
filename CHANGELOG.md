# Changelog

## [designer-v2] – 2026-11-05 – D2.4: main roof only, compact panel blocks, raised verandahs

- Main roof: when Google merges a complex (or next door) into one building, the 3D roof data is used to find
  which faces join the roof under the locked point. Faces meet if their planes line up along a shared edge (step
  under 1 m); a step of 1 m or more along 2 m+ is a wall. A house-sized main roof (up to 1000 m²) keeps roofs
  behind a wall (a lower storey); a bigger one treats them as next door. Faces not joined at all are a separate
  building. Those faces are unticked, dimmed on the map and badged "Other roof - tick to include" with the reason.
  Fixes panels landing on the lower neighbour at the Bunnings test site and on the separate block at Labassa.
- Compact blocks: on each face the layout now prefers near-square blocks (2-3 rows) to one long row; a block
  longer than twice its depth costs extra (BLOCK_MAX_ASPECT in designerConfig.js) and a short last row costs less.
- Raised verandahs: a flatter face creased onto a steeper face at least 1.2 m higher (14°+ pitch difference) is
  flagged as a likely verandah on its own and unticked (Queenslander wrap-arounds at the Newstead test site).
- roofFacesFromDsm now also returns `adjacency` ([{ a, b, stepM, lenM }]) between traced faces.
- Settings (assumptions): MAIN_ROOF in designerConfig.js; skirt thresholds in nonRoof.js.

## [designer-v2] – 2026-11-05 – D2.3: checked on six public roof types (two-storey, verandahs, flat, hip, gable, rural)

- Wrong building: if Google's nearest building is more than 3 m from the centre of the map, the lock message says
  how far away it is and to press Reposition, centre the roof and lock again (findClosest often picks a shed or a
  neighbour when the pin sits in a garden or car park).
- No coverage: a 404 from Google now reads "Google has no 3D roof data for this spot (common in rural and new
  areas). You can trace your roof yourself in step 2" instead of "Requested entity was not found".
- Flat roofs (under 5°): panels go on 10° tilt frames facing north (rows snap to a building edge within 25° of
  north), with rows spaced for the winter-noon shadow (about 0.5 m for a 1.7 m panel). Yields use the tilted
  panel, Google's flush figures get the same gain so flat faces are ranked fairly, and the panel notes say so.
  Settings in designerConfig.js: FLAT_ROOF_MAX_PITCH_DEG, TILT_FRAME_DEG, WINTER_NOON_SUN_DEG (assumptions).
- Non-roof flags: "nearly flat" no longer counts when the main roof is itself flat (warehouses, flat-roof homes);
  "below the main roof" is only used when the ground height is unknown or implausible (under 0.5 m or negative),
  so the lower roof of a two-storey home is no longer mistaken for a verandah; faces steeper than 60° (walls,
  parapets) are flagged on their own.
- Dev only: window.__ssdMap.centreOn({ lat, lng }) for the multi-address e2e.

## [designer-v2] – 2026-11-05 – D2.2: no odd single panels, verandah/non-roof faces left out

- Panel filler now places whole rectangular blocks on each face (full rows from the gutter, last row may be partial)
  instead of scattered best-first spots. Each face gets at least 4 panels or none (2 when the whole system is 8
  panels or fewer); set in designerConfig.js (MIN_PANELS_PER_FACE, MIN_PANELS_PER_FACE_SMALL, SMALL_SYSTEM_PANELS).
  Panels that would only make a small group go to the best faces instead; if they cannot, the note says the system
  is N panels smaller so no face has a tiny group. Setback, strict-inside and kW cap rules unchanged.
- Faces you edit by hand (removed or added panels) keep exactly what you chose; the final checks warn about any face
  with fewer panels than the minimum.
- Likely non-roof faces (verandahs, carports, awnings) are flagged "Possibly verandah/not roof" and unticked by
  default when at least two of these hold: under 2.6 m above the local ground (or 1 m+ below the main roof), nearly
  flat (under 12°), narrower than 1.8 m, small (under 15 m²) with an uncertain outline. Tick the face to use it.

## [designer-v2] – 2026-11-05 – D2.1: roof outlines traced from Google's 3D roof data

- On lock, the app makes one Google Solar dataLayers call (0.25 m height map + building mask), decodes the GeoTIFFs
  in the browser (geotiff.js) and caches them per property (memory + localStorage, 30 days, 6 properties max).
- Each roof face gets a plane fitted from Google's segment stats, then a clean outline: pixels assigned to the
  best-fitting plane, clipped to the building mask, simplified and snapped to ridge / hip / valley lines, no overlaps.
  Badges: "traced from 3D roof data" (high) or "traced - check the corners" (medium). Low-confidence faces keep the
  estimate, and every traced face has "Use Google's estimate instead". If the call fails, estimates are used.
- Ridge split tool (ported from the old roof.js): select a face, "Split along a ridge", click two points.
- Panel edit: a click that turns into a tiny drag now removes the panel instead of nudging it; repeat clicks ignored.
- Dev only: window.__ssdMap helpers so the real-map e2e can click panels, ghosts and corners.

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
- Known gaps: outlines are estimates until the customer checks them (DSM tracing added in D2.1 above).

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
