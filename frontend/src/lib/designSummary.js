/* The downloadable design ("smartsaver-design" v1) and a plain-text summary. */
import { MONTHS } from '../config/designerConfig'
import { installTypeOf } from './roofFaces'

export const DESIGN_FORMAT = 'smartsaver-design'
export const DESIGN_VERSION = 1

const r1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10)
const r0 = (x) => (x === null || x === undefined ? null : Math.round(x))

/** No street address, name or NMI goes in here - postcode/state only. */
export function buildDesignJson({ profile, design, pv, roofFaces, now = new Date() }) {
  return {
    format: DESIGN_FORMAT,
    version: DESIGN_VERSION,
    createdAt: now.toISOString(),
    pricesArePlaceholders: design.pricing.placeholder,
    location: { postcode: profile?.postcode ?? null, state: profile?.state ?? null },
    energyProfile: profile
      ? {
          source: profile.source,
          annualKwh: profile.annualKwh,
          importRate: profile.importRate,
          supplyPerDay: profile.supplyPerDay,
          feedInRate: profile.feedInRate,
          tariffType: profile.tariffType,
          assumed: profile.assumed,
        }
      : null,
    roof: (roofFaces ?? [])
      .filter((f) => f.included)
      .map((f) => ({
        label: f.label,
        source: f.source,
        pitchDegrees: f.pitchDegrees,
        installType: installTypeOf(f),
        azimuthDegrees: f.azimuthDegrees,
        orientation: f.orientation,
        areaM2: r1(f.areaSquareMetres),
      })),
    system: {
      panelCount: design.layout.count,
      moduleWatts: pv.moduleWatts,
      solarKw: Math.round(design.layout.dcKw * 100) / 100,
      inverterKw: design.inverterKw,
      batteryKwh: design.batteryKwh,
    },
    output: {
      annualGenerationKwh: r0(design.annualGenKwh),
      generationSource: design.generationSource,
      monthlyGenerationKwh: design.sim ? Object.fromEntries(design.sim.months.map((m, i) => [MONTHS[i], r0(m.genKwh)])) : null,
      selfConsumptionPct: design.sim ? r1(design.sim.annual.selfConsumptionPct) : null,
      exportKwh: design.sim ? r0(design.sim.annual.exportKwh) : null,
    },
    savings: design.bill
      ? {
          billBeforeAnnual: r0(design.bill.beforeAnnual),
          billAfterAnnual: r0(design.bill.afterAnnual),
          savingAnnual: r0(design.bill.savingAnnual),
        }
      : null,
    price: {
      solarMid: r0(design.pricing.solar.mid),
      batteryPrice: r0(design.pricing.battery.price),
      totalLow: r0(design.pricing.totalLow),
      totalHigh: r0(design.pricing.totalHigh),
      paybackYears: design.payback?.total ? r1(design.payback.total) : null,
    },
    warnings: design.warnings,
  }
}

const money = (x) => (x === null || x === undefined ? 'n/a' : `$${Math.round(x).toLocaleString('en-AU')}`)

export function buildSummaryText({ profile, design, pv }) {
  const lines = [
    'SmartSaver Solar Designer - my system',
    `Location: ${profile?.postcode ?? '-'} ${profile?.state ?? ''}`.trim(),
    `Solar: ${design.layout.count} x ${pv.moduleWatts} W panels = ${design.layout.dcKw.toFixed(2)} kW`,
    `Inverter: ${design.inverterKw} kW`,
    `Battery: ${design.batteryKwh > 0 ? `${design.batteryKwh} kWh` : 'none'}`,
    `Estimated generation: ${Math.round(design.annualGenKwh).toLocaleString('en-AU')} kWh/year`,
  ]
  if (design.bill) {
    lines.push(`Estimated bill saving: ${money(design.bill.savingAnnual)}/year`)
    lines.push(`Bill before: ${money(design.bill.beforeAnnual)}/yr, after: ${money(design.bill.afterAnnual)}/yr`)
  }
  lines.push(
    `Indicative price: ${money(design.pricing.totalLow)} - ${money(design.pricing.totalHigh)}${design.pricing.placeholder ? ' (PLACEHOLDER pricing, not a quote)' : ''}`,
  )
  if (design.payback?.total) lines.push(`Simple payback: ${design.payback.total.toFixed(1)} years`)
  return lines.join('\n')
}
