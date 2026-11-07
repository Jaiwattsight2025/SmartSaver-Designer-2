/**
 * Locked look for the Solar Designer downloadable proposal.
 * Approved 7 November 2026 from the Energy Insights bill-report treatment.
 * These values are the source for the proposal. Do not recolour charts ad hoc.
 * The checklist lives in docs/report-design.md.
 */
export const REPORT_APPROVED = '2026-11-07'

export const REPORT_PRODUCT = 'Solar Designer'
export const REPORT_COMPANY = 'SmartSaver Energy'
export const REPORT_BYLINE = 'by SmartSaver Energy'
export const REPORT_FOOTER = 'Indicative estimate, not a quote'

/** Flat colours. Arcs are one colour per category, not a red-to-green score. */
export const REPORT_COLORS = {
  green: '#20a97c',
  deep: '#003c2b',
  ink: '#1a3c34',
  muted: '#5f7570',
  line: '#d5e3dc',
  mint: '#eaf6f1',
  mintBar: '#d7ebe3',
  paper: '#ffffff',
  amber: '#f5a623',
  amberSoft: '#fbf6ea',
  amberLine: '#e6c27a',
  daylight: '#20a878',
  battery: '#186888',
  export: '#f0a020',
  loss: '#b0b8b8',
  track: '#edf3f1',
}

/**
 * Where the year's solar goes, from figures the model already stored.
 * Charging loss is the residual (generation minus daylight use, battery supply and export).
 * It is omitted when it is under 0.5 kWh so a no-battery year does not grow a grey slice.
 */
export function solarDestination(annual) {
  if (!annual || !(annual.genKwh > 0)) return null
  const direct = Math.max(0, Number(annual.directKwh) || 0)
  const battery = Math.max(0, Number(annual.batteryKwh) || 0)
  const exported = Math.max(0, Number(annual.exportKwh) || 0)
  const loss = Math.max(0, annual.genKwh - direct - battery - exported)
  const parts = [
    { key: 'daylight', label: 'Daylight use', kwh: direct, color: REPORT_COLORS.daylight },
    battery >= 0.5 ? { key: 'battery', label: 'Battery supply', kwh: battery, color: REPORT_COLORS.battery } : null,
    { key: 'export', label: 'Exported', kwh: exported, color: REPORT_COLORS.export },
    loss >= 0.5 ? { key: 'loss', label: 'Charging loss', kwh: loss, color: REPORT_COLORS.loss } : null,
  ].filter(Boolean)
  return { parts, total: annual.genKwh }
}

export function reportDate(now = new Date()) {
  return now.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Australia/Melbourne',
  })
}
