# Changelog

## [designer-v2] – 2026-11-07 – Start from the full valid roof

- A new design, or one with no saved target, places every spot that fits on the ticked faces. The planning size and the household suggestion do not reduce that starting layout. Lower the target, or remove a panel, to use less. Fill available roof puts an explicit target back to that full fit and does not restore panels that were removed. A saved target is kept. This roof fit is not a network approval and not a recommendation of what to buy.

## [designer-v2] – 2026-11-07 – Place panels on every ticked face

- With no target chosen, the layout uses every spot that fits, up to the planning size. It no longer stops at the 6.6 kW suggestion when other ticked faces still have room. The suggestion stays a separate button. A target the customer set, including 15, is kept when the planning size changes.
- A spare spot is checked in its own roof face. Another face’s local coordinates are not reused, so a real grid spot stays available beside panels on a different face. Raising or lowering the target keeps the panels already placed.

## [designer-v2] – 2026-11-07 – Planning setback default 0.2 m

- A new design and a reset use a 0.2 m inset from the drawn roof edge. That inset is a planning assumption, not an installation approval or a building-code clearance. A saved number, including 0.4 from an older session, is kept. The field stays editable from 0.2 m to 1.5 m.
- Edge, no-go, overlap and tilt-frame row-gap checks use the setback that is in force. A face is not skipped because its direction is north. If the inset cannot hold one panel, the page says so. Spare spots on a ticked face that the target did not fill stay visible as blue outlines.

## [designer-v2] – 2026-11-07 – Proposal look locked to the approved report

- The downloadable proposal uses the approved 7 November 2026 report treatment: Solar Designer by SmartSaver Energy (named once), green and mint, flat category colours, and the footer “Indicative estimate, not a quote”. Daylight use is green, battery supply is teal, exports are amber, and modelled charging loss is grey. Those slices come from figures the design already stored. There is no red-to-green score gauge and no hourly chart.
- The page order is still the summary, the roof layout, generation and savings from Output and savings, then the price basis and assumptions. A missing bill or a missing complete price stays unavailable. The locked colours, footer, and checklist are in `docs/report-design.md` and `frontend/src/lib/reportDesign.js`.

## [designer-v2] – 2026-11-07 – Spare spots, roof direction on Panels, Move map

- Spare panel outlines are checked again after a slide, turn, add, remove, setback, or no-go change. A spot that no longer fits a full panel is hidden. A spot that becomes free can show. The search also places a panel in a bay the gutter grid never listed, without moving the panels already there. Clicking a spot uses that same check. A refused move does not delete placed panels.
- The Panels step shows the selected face’s roof direction and can edit it, including reset and match. That is the same direction as Confirm roof. 0° is north and 90° is east. The drawing angle is labelled separately and does not change the yearly figure. Flush output uses the roof direction. Tilt frames stay facing north. If the new direction points the rows along a different gutter, the page says the rows were redrawn.
- Move map is a separate mode. Dragging pans. + and − zoom, and they stop at the closest zoom the map allows, which does not make the aerial photo sharper. Fit roof is explicit. Choosing a face or editing panels does not pull the view back. Outline edit still zooms in on purpose. Switching back to Move map keeps the view.

## [designer-v2] – 2026-11-07 – One-degree array rotation, honest grid count

- On the selected face, Adjust design can rotate the whole panel group by 1° as well as 5°. The angle shown is the in-plane drawing angle. It does not change the roof direction or the yearly figure. Undo still puts back the previous slide and rotation. A turn that would cross the setback, hit a no-go area, or overlap is refused and the panels stay, with the reason.
- A move is checked with the same outline clearance as placement. The spot count is the gutter-aligned grid inside the setback, including a per-row shift on a tapering face. It is not described as the most panels any arrangement could fit. Blank roof without a blue outline is not a spare spot.

## [designer-v2] – 2026-11-07 – Print proposal includes output and savings

- Print / save PDF from the summary is an A4 proposal. The first page is the system, yearly generation, bill now, bill with the system, saving, and simple payback only when one complete price supports it. Later pages are the roof layout, the generation chart and bill tables from Output and savings, the household supply chart, then the price basis, assumptions and source dates.
- Those generation and bill figures are the same `SavingsReport` component the output tab renders. Print does not calculate them again. Solar and battery benchmarks are still not added. A missing bill is labelled unavailable. The synthetic fixture banner is repeated on the proposal so it is not only in the controls, which print hides.
- Print hides the step list, controls, map and metric strip, and lets the report flow instead of clipping it to the map pane. Tables and charts stay together. Each detail section starts on a new page.

## [designer-v2] – 2026-11-07 – Handles, panel target, sourced prices

- Corner handles draw a small translucent ring. The marker is 44 px (36 px for an edge insert) so the touch target stays large. The roof copy no longer says a right-click deletes a corner. Undo still puts the last corner edit back.
- Match a face is a full-width list. The closed label is "Match a face", and each option is the face name and its degrees.
- The selected roof card has a gold outline and a pale gold fill. The green include tick is unchanged.
- The panel stepper goes up to the roof fit, not the 13.2 kW planning size. Roof fit, the target and the planning size sit together. A target above the planning size is kept. The planning size is still described as an assumption, not a network approval. Setbacks are unchanged.
- Clicking an empty panel spot keeps the panels already placed and adds that spot, including after the array has been slid, as long as the spot does not overlap, cross the setback or sit on a no-go area. If it cannot be added, the reason is shown. A new panel is not dragged by an alignment that was already applied.
- Summary prices are the Solar Choice residential table dated 1 November 2026 (page updated 6 November 2026) and the Solar Choice battery table updated the same day. Premium rows for every capital were read from that premium table. The national All row is stored and is not used when the state is missing. Sizes outside 3–10 kW solar or 10–50 kWh battery are unavailable, including 15.84 kW. A value between two published cells is labelled a derived estimate. 13.5 kWh battery-only is that estimate between the 10 and 20 kWh cells ($7,384 and $14,172), $9,760, not a published average. Standard and premium are separate offer tiers, not a price range. The pre-rebate battery column is not used. Net figures already include GST and the rebate, so it is not subtracted again. The Cheaper Home Batteries page (updated 9 June 2026) supplies the STC factors only. There is no official dollar rate. Solar and battery benchmarks are not added into a project price. Simple payback is cost divided by a positive modelled saving, from a solar-only benchmark or from an installer quote the customer types. It is labelled as not an IRR and not a guarantee. Charts use the modelled bills, not the price tables. The archived AlphaESS package prices and the placeholder banner are gone.

## [designer-v2] – 2026-11-06 – Azimuth, outline focus, selection, capacity, array align

- Roof direction is separate from the traced outline. 0° is north and 90° is east, clockwise, wrapped into 0–360. It defaults to the detected value, can be typed, matched to another face, and reset. The override stays on the face when you change steps. Changing it does not move the outline. Flush yield uses this direction. Sliding or rotating the panels on the roof does not change it, and does not change the yearly-yield figure.
- Edit outline (under Adjust design on the selected face) zooms to level 21, the closest the map widget allows, and says the aerial photo does not get sharper. Automatic fit-to-roof is held so a corner drag does not zoom back out. Corners use larger white dots; orange dots add a corner. Undo puts back the last corner edit. Done leaves the mode. The face is not vertex-editable until then, so a normal drag pans the map.
- Clicking a face on the map selects its card and scrolls it into view. Clicking the card selects the face on the map. Adjust design opens only on the selected face. Cards can be focused from the keyboard.
- A face may have 1–3 panels. Fewer than four is a wiring warning, not a reason to leave the face empty. The number that fit inside the setbacks is shown separately from the target and from the planning size (default 13.2 kW, changeable from 1 to 100 kW under Adjust design). That size is described as a planning assumption, not a network approval. Setbacks are unchanged.
- On the Panels step, Adjust design can nudge, rotate in the roof plane, centre, undo, or reset the selected face's panels. A move that would cross the setback, hit a no-go area, or overlap is refused and the panels stay put. Centring uses a point that is actually inside the outline, including on a concave face. The shift is stored with the design and written into the confirmed snapshot.

## [designer-v2] – 2026-11-06 – Energy Insights handoff, no customer JSON

- Removed the customer “Load Wattsight file” control and the design JSON download. Manual bill numbers stay. “Analyse my bill in Energy Insights” links to https://wattsight-platform.onrender.com. The Designer does not take a bill file. Customer copy says Energy Insights; internal profile source ids are unchanged. The confirmed-design snapshot is still stored for a later PDF. It is not offered as a download.
- The property step no longer shows “GOOGLE ROOF DATA / Not tested”. That string is the initial value of `building.solar.status` in `models/Building.js` (also reset in `ProjectContext` before a lookup). It was rendered in `App.jsx` inside the diagnostics disclosure. It is internal only now. A failed or not-yet-run lookup is not described as successful. The map message and the roof step still say when this property has no data, an estimate, or a trace. The synthetic preview banner still says it is not a real property.
- Handoff client: Insights may open the Designer with `#handoff=<opaque token>` only. The token is removed from the address bar immediately and is not stored. The Designer POSTs `{ token }` to `VITE_INSIGHTS_API_BASE/api/designer-handoff/redeem` (`credentials: omit`). The base comes from the build env, not the page URL. The body must match the existing profile.json checks. Query-string bill data and `profile_url` are not loaded. Errors are fixed sentences (not configured, expired or already used, unreachable, unusable) and do not include the token. A failed handoff does not replace bill numbers the customer already entered. Live redeem is not claimed until the Insights host, CORS and subscription gate are configured.

## [designer-v2] – 2026-11-06 – Simpler journey, honest tilt assumptions, design snapshot

- Homeowner path stays address, confirm roof, then design and savings. Detected roof pitch and how the panels sit stay visible on every face. Pitch, mounting, corner edits, ridge split, tracing and no-go areas sit under **Adjust design**. Confirm roof, other-roof and verandah warnings, overlaps and validation stay in view. Overrides are still saved on the face.
- Phone layout: 44px controls, 16px type in the controls, stacked buttons, no sideways scroll, Previous and Next stay on screen.
- Tilt frames are still 10° facing north, but that is labelled a layout sketch, not a structural design. On a pitched roof the note says it is not an approved mounting method.
- Winter row spacing uses the mid-winter noon sun at the property latitude (Melbourne about 29°, Sydney about 33°, Darwin about 54°), rounded to the nearest degree. With no latitude it says it is using about 29° (Melbourne/Sydney) and that hills, trees and the rest of the day are ignored.
- Tilt-frame yearly output is the state-average estimate for that frame tilt. Google's flush-panel figures are no longer multiplied by a generic gain.
- A confirmed design stores a snapshot (faces, pitch and mounting overrides, panel ids, kW, validation, assumptions, limitations) for a later paid summary. The JSON download includes that snapshot instead of placing the panels again. `?preview=synthetic` opens a labelled fixture (not a live roof) when a Maps key is unavailable.
- Tests for these cases use synthetic geometry only. They are not live property checks.

## [designer-v2] – 2026-11-06 – Per-face pitch and install type

- Each included roof face on the confirm-roof step has a pitch control (degrees, with − / +) and an install
  type: Flush (flat on the roof) or Tilt frames. A pitch under 5° is badged "Flat roof" — the same cut the
  layout already uses (FLAT_ROOF_MAX_PITCH_DEG).
- The pitch is the one already stored from Google's roof segment. Near-flat faces default to tilt frames
  (10° facing north, rows spaced for winter shade). Pitched faces default to flush. The note says the value
  was detected and can be changed.
- Changing the pitch updates the sloped area and, until the customer has picked an install type themselves,
  switches flush / tilt with the 5° rule. A chosen install type stays put if they edit the pitch afterwards,
  and both stay on the face for the rest of the session (including untick and tick again).
- Panel rows, setback checks and yield use that choice. Flush on a flat face no longer gets the tilt-frame
  gain. Tilt frames on a pitched face use the same north-facing frame model as a flat roof.
- Still fixed, not per face: tilt-frame angle (10°), tilt-frame direction (north), and winter sun height (29°).

## [designer-v2] – 2026-11-06 – D2.5: roof and panel reliability

- Separate buildings with no 3D join are left out. If Google never records an edge between faces
  (the trace failed, or there is no 3D model), outlines more than 0.6 m apart are treated as another
  building: unticked, badged "Other roof - tick to include". A face that shares an edge, or sits in a
  thin tracing gap, stays. This covers the Labassa-style separate block when only the estimate outlines
  exist, not only when the 3D adjacency graph does. A neighbour that physically touches the roof you
  picked, with no 3D wall step, is still included — tick it off if it is next door. Bunnings (wall on a
  big building) and a house-sized lower storey are unchanged.
- Swallowed outlines are not used. A 3D trace more than twice Google's area for that face, or under 45%
  of it, is low confidence and kept as the estimate. The face says why ("may include the next building"
  or "only covered N% of this face") instead of a "traced from 3D" badge. A trace between 1.6× and 2×
  stays medium: "traced - check the corners".
- No 3D model: the roof step says Google has no usable 3D roof model (common in rural and new areas) and
  to drag the corners or trace the roof. A Solar API 404 still uses that plain-English line on the map
  and on the roof step; other errors show Google's message, plus how to trace.
- Panel edit: a drag under 0.6 m is a click (remove). A move only sticks when the drop is closer to a
  free slot than to the panel you started on, so a short nudge no longer jumps to the next panel. A drag
  that does not land on a free slot snaps back. A real drag no longer also counts as a click. Removing
  one panel still leaves the others where they were. Setback, L-shaped faces, and the 13.2 kW cap still
  hold (tests).
- Settings: MAIN_ROOF.CONNECT_GAP_M and PANEL_CLICK_SLOP_M in designerConfig.js.

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
