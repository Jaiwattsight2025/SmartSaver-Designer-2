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
import { layoutPanels } from './panelLayout'
import { roofTotals } from './roofFaces'

export function computeDesign({ profile, insights, roofFaces, pv, battery, state }) {
  const roof = roofTotals(roofFaces ?? [])
  const layout = layoutPanels({
    insights,
    faces: roofFaces ?? [],
    panelCount: pv.panelCount,
    moduleWatts: pv.moduleWatts,
    state,
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

  if (dcAcRatio !== null && dcAcRatio > 1.33) {
    result.warnings.push('Panels are more than 133% of the inverter size - pick a bigger inverter.')
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
