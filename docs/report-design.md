# Solar Designer proposal — locked report design

Approved **7 November 2026**.

The visual source is the approved Energy Insights bill report (synthetic example). Its numbers are examples only and are not copied into the Designer. The downloadable proposal is named **Solar Designer**. The company is named once, in the masthead: **by SmartSaver Energy**.

Locked values used by the proposal live in `frontend/src/lib/reportDesign.js`. Change those, this page, and the print CSS together. Do not introduce a second palette in the proposal.

## Colour tokens

| Token | Hex | Use |
| --- | --- | --- |
| green | `#20a97c` | Rules under headings, masthead mark, panel stroke |
| deep | `#003c2b` | Headings, panel fill, household-use bars |
| ink | `#1a3c34` | Body text |
| muted | `#5f7570` | Labels, footer, notes |
| line | `#d5e3dc` | Card and table rules |
| mint | `#eaf6f1` | Callout fill |
| mintBar | `#d7ebe3` | Callout edge |
| amber | `#f5a623` | Solar-generation bars, example-data border |
| amberSoft | `#fbf6ea` | Example and market-estimate banners |
| daylight | `#20a878` | Solar used while the sun is out |
| battery | `#186888` | Energy the battery later supplies |
| export | `#f0a020` | Exports |
| loss | `#b0b8b8` | Charging loss (modelled round trip only) |
| track | `#edf3f1` | Empty donut track |

Category arcs are one flat colour. They are not a red-to-green performance scale. The Designer has no 0–100 suitability scores, so those gauges are not drawn.

## Type, spacing, chrome

- Typeface: Segoe UI, Roboto, Helvetica, Arial, sans-serif (the app default).
- Headings: deep green, with a 2px green rule underneath.
- Fact cards: white, 1px line, 8px radius, muted label, deep value.
- Callouts: mint fill, 4px green left border. Example-data and market-estimate banners: amber soft fill, amber border.
- Footer on every printed page: “Indicative estimate, not a quote” on the left. “Solar Designer | Page n” on the right. The company name is not repeated in the footer.
- Page: A4. Keep a chart and its legend on the same page. Do not clip the report to the map pane.

## Page order

1. Concise summary: system, generation, bill now, bill with the system, saving, simple payback only when one complete price exists, small roof sketch.
2. Roof and system, including the layout drawing.
3. Generation and savings from the same Output and savings figures: monthly chart, where solar goes, bill before and after.
4. Price basis, assumptions, and source dates.

The roof block is short, so generation continues on that sheet instead of opening a nearly blank page. If the text is long, it flows onto the next sheet. It is not clipped. Price basis still starts on its own page.

## What the charts may say

- Monthly bars are modelled generation and bill-scaled use. They are not measured month by month.
- “Where solar goes” uses `directKwh`, `batteryKwh`, `exportKwh`, and the residual charging loss already implied by the yearly balance. Loss under 0.5 kWh is not drawn.
- A second donut (no battery) is drawn only from `simSolarOnly`, and only when this design has a battery.
- No typical-day hourly chart. The proposal does not claim measured hourly use.
- Money and energy are rounded to the existing whole-number formats. Percents are whole numbers. Payback stays one decimal and is labelled as not an IRR.
- Solar and battery benchmarks are not added. No payback is invented when a complete price is missing.

## Checklist before changing the proposal

- [ ] Product name is Solar Designer, not Energy Insights.
- [ ] “by SmartSaver Energy” appears once.
- [ ] Footer reads “Indicative estimate, not a quote” on every page.
- [ ] Example data is labelled example data, and is not presented as a customer bill.
- [ ] Colours match the table above. No red/green score gauge.
- [ ] Daylight, battery, export, and loss use only those four colours, and only when that quantity is in the design.
- [ ] Chart and legend stay together. No empty page created only to hold a note.
- [ ] Bill facts and modelled estimates are labelled differently.
- [ ] Missing price or missing bill stays “unavailable”. No made-up quote or payback.
- [ ] Source names and dates stay legible. Standard and premium stay separate tiers.
- [ ] Calculator results and commercial gates are unchanged.
- [ ] A synthetic PDF is printed from the browser and each page is looked at. A live map is not claimed.
