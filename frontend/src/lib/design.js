/*
 * One place that turns the project state into every number the customer sees.
 * Used by the steps, the bottom bar and the summary download.
 */
import { PRICES_ARE_PLACEHOLDERS } from '../config/pricing'
import {
  batteryPrice,
  billImpact,
  paybackYears,
  simulateYear,
  solarPrice,
  stateYield,
  suggestedInverterKw,
} from './energyModel'
import { layoutPanels, validateLayout } from './panelLayout'
import { MAX_DC_AC_RATIO, ROOF_EDGE_SETBACK_M } from '../config/designerConfig'
import { roofTotals } from './roofFaces'

export function computeDesign({ profile, insights, roofFaces, pv, battery, state, layoutOptions = {} }) {
  const roof = roofTotals(roofFaces ?? [])
  const layout = layoutPanels({
    insights,
    faces: roofFaces ?? [],
    panelCount: pv.panelCount,
    moduleWatts: pv.moduleWatts,
    state,
    ...layoutOptions,
  })
  const inverterKw = battery.inverterKw ?? suggestedInverterKw(layout.dcKw)
  const batteryKwh = battery.batteryKwh ?? 0

  // Generation: roof-specific (Google / grid). Clip slightly if the inverter is undersized.
  let annualGenKwh = layout.annualAcKwh
  const generationSource = layout.source === 'solar-api' ? 'Google Solar API (your roof)' : layout.source === 'none' ? 'none' : layout.source === 'grid' ? 'State average, adjusted for roof angle' : 'Google Solar API + state average'
  const dcAcRatio = inverterKw > 0 ? layout.dcKw / inverterKw : null
  if (inverterKw > 0 && dcAcRatio > 1.33) {
    annualGenKwh *= Math.max(0.6, 1 - (dcAcRatio - 1.33) * 0.35) // [ASSUMPTION] rough clipping loss
  }
  if (inverterKw === 0) annualGenKwh = 0

  const result = {
    roof,
    layout,
    inverterKw,
    batteryKwh,
    dcAcRatio,
    annualGenKwh,
    generationSource,
    specificYield: layout.dcKw > 0 ? annualGenKwh / layout.dcKw : 0,
    stateAverageYield: stateYield(state),
    sim: null,
    simSolarOnly: null,
    bill: null,
    billSolarOnly: null,
    pricing: null,
    payback: null,
    warnings: [],
  }

  layout.notes?.forEach((n) => result.warnings.push(n))

  // Final checks: panels inside the roof with the setback, no overlaps, no no-go areas, inverter limit.
  result.validation = validateLayout(layout, roofFaces ?? [], {
    setbackM: layoutOptions.setbackM ?? ROOF_EDGE_SETBACK_M,
    obstacles: layoutOptions.obstacles ?? [],
  })
  if (dcAcRatio !== null && dcAcRatio > MAX_DC_AC_RATIO + 1e-9) {
    result.validation.issues.push({
      level: 'error',
      message: `Panels (${layout.dcKw.toFixed(2)} kW) are more than ${Math.round(MAX_DC_AC_RATIO * 100)}% of the ${inverterKw} kW inverter - pick a bigger inverter or fewer panels.`,
    })
    result.validation.ok = false
  }

  const sp = solarPrice(layout.dcKw)
  const bp = batteryPrice(batteryKwh)
  if (bp.note) result.warnings.push(bp.note)
  const total = bp.price === null ? null : sp.mid + bp.price
  result.pricing = {
    placeholder: PRICES_ARE_PLACEHOLDERS,
    solar: sp,
    battery: bp,
    totalMid: total,
    totalLow: total === null ? null : sp.low + (bp.price ?? 0),
    totalHigh: total === null ? null : sp.high + (bp.price ?? 0),
  }

  if (profile) {
    result.sim = simulateYear({ annualGenKwh, annualLoadKwh: profile.annualKwh, batteryKwh, state })
    result.bill = billImpact(result.sim, profile)
    result.simSolarOnly = simulateYear({ annualGenKwh, annualLoadKwh: profile.annualKwh, batteryKwh: 0, state })
    result.billSolarOnly = billImpact(result.simSolarOnly, profile)
    result.payback = {
      total: total === null ? null : paybackYears(total, result.bill.savingAnnual),
      solarOnly: paybackYears(sp.mid, result.billSolarOnly.savingAnnual),
      batteryAddOn:
        bp.price > 0 ? paybackYears(bp.price, result.bill.savingAnnual - result.billSolarOnly.savingAnnual) : null,
    }
  }
  return result
}
