/*
 * Generation, self-consumption, bill savings, sizing and pricing.
 * Pure functions - no React, easy to test.
 */
import {
  BATTERY_ROUND_TRIP_EFFICIENCY,
  BATTERY_SIZE_OPTIONS_KWH,
  DAYS_IN_MONTH,
  DEFAULT_SEASONAL_SWING,
  INVERTER_SIZES_KW,
  LOAD_HOURLY_SHAPE,
  MAX_DC_AC_RATIO,
  MAX_RESIDENTIAL_KW,
  NATIONAL_FALLBACK_YIELD,
  SEASONAL_SWING_BY_STATE,
  SOLAR_HOURLY_SHAPE,
  SOLAR_YIELD_BY_STATE,
} from '../config/designerConfig'
import {
  BATTERY_PACKAGES,
  SOLAR_PRICE_HIGH_FACTOR,
  SOLAR_PRICE_LOW_FACTOR,
  SOLAR_PRICE_PER_WATT,
} from '../config/pricing'

const normalise = (shape) => {
  const total = shape.reduce((a, b) => a + b, 0)
  return shape.map((x) => x / total)
}
// Wattsight's solar shape sums to 0.995; normalise so no energy goes missing.
const SOLAR_SHAPE = normalise(SOLAR_HOURLY_SHAPE)
const LOAD_SHAPE = normalise(LOAD_HOURLY_SHAPE)

export function stateYield(state) {
  return SOLAR_YIELD_BY_STATE[state] ?? NATIONAL_FALLBACK_YIELD
}

/** Share of the year's solar output in each month (sums to 1). Southern hemisphere. */
export function monthlySolarShares(state) {
  const swing = SEASONAL_SWING_BY_STATE[state] ?? DEFAULT_SEASONAL_SWING
  const w = DAYS_IN_MONTH.map((d, m) => d * (1 + swing * Math.cos((2 * Math.PI * (m + 0.35)) / 12)))
  const total = w.reduce((a, b) => a + b, 0)
  return w.map((x) => x / total)
}

/**
 * Average-day model per month: hourly solar vs hourly household load, with an
 * optional battery charged from surplus solar and used for the evening.
 */
export function simulateYear({ annualGenKwh, annualLoadKwh, batteryKwh = 0, state }) {
  const shares = monthlySolarShares(state)
  const dailyLoad = annualLoadKwh / 365
  const rte = BATTERY_ROUND_TRIP_EFFICIENCY
  const months = shares.map((share, m) => {
    const days = DAYS_IN_MONTH[m]
    const dailyGen = (annualGenKwh * share) / days
    let direct = 0
    let surplus = 0
    let deficit = 0
    for (let h = 0; h < 24; h += 1) {
      const g = dailyGen * SOLAR_SHAPE[h]
      const l = dailyLoad * LOAD_SHAPE[h]
      direct += Math.min(g, l)
      surplus += Math.max(g - l, 0)
      deficit += Math.max(l - g, 0)
    }
    const batteryOut = Math.min(surplus * rte, batteryKwh, deficit)
    const exported = surplus - batteryOut / rte
    const imported = deficit - batteryOut
    return {
      genKwh: dailyGen * days,
      loadKwh: dailyLoad * days,
      directKwh: direct * days,
      batteryKwh: batteryOut * days,
      exportKwh: exported * days,
      importKwh: imported * days,
    }
  })
  const sum = (k) => months.reduce((s, x) => s + x[k], 0)
  const annual = {
    genKwh: sum('genKwh'),
    loadKwh: sum('loadKwh'),
    directKwh: sum('directKwh'),
    batteryKwh: sum('batteryKwh'),
    exportKwh: sum('exportKwh'),
    importKwh: sum('importKwh'),
  }
  annual.selfConsumedKwh = annual.directKwh + annual.batteryKwh
  annual.selfConsumptionPct = annual.genKwh > 0 ? (annual.selfConsumedKwh / annual.genKwh) * 100 : 0
  annual.selfSufficiencyPct = annual.loadKwh > 0 ? (annual.selfConsumedKwh / annual.loadKwh) * 100 : 0
  return { months, annual }
}

/** Yearly bill before/after using the profile's own rates. */
export function billImpact(sim, profile) {
  const supply = 365 * profile.supplyPerDay
  const before = sim.annual.loadKwh * profile.importRate + supply
  const after = sim.annual.importKwh * profile.importRate + supply - sim.annual.exportKwh * profile.feedInRate
  return {
    beforeAnnual: before,
    afterAnnual: after,
    savingAnnual: before - after,
    importSaving: sim.annual.selfConsumedKwh * profile.importRate,
    exportCredit: sim.annual.exportKwh * profile.feedInRate,
  }
}

// ---------- sizing ----------

export function suggestedSolarKw(profile, state) {
  if (profile?.recommendedSolarKw > 0) return profile.recommendedSolarKw
  if (profile?.annualKwh > 0) {
    return Math.min(MAX_RESIDENTIAL_KW, Math.round((profile.annualKwh / stateYield(state)) * 10) / 10)
  }
  return 6.6
}

export function suggestedPanelCount(profile, moduleWatts, state) {
  return Math.max(1, Math.round((suggestedSolarKw(profile, state) * 1000) / moduleWatts))
}

/** Smallest standard inverter the panels can sit on (CEC 133% oversize rule). */
export function suggestedInverterKw(dcKw) {
  if (!(dcKw > 0)) return 0
  const need = dcKw / MAX_DC_AC_RATIO
  return INVERTER_SIZES_KW.find((s) => s >= need - 1e-9) ?? INVERTER_SIZES_KW[INVERTER_SIZES_KW.length - 1]
}

export function suggestedBatteryKwh(profile) {
  if (!profile) return 0
  if (profile.recommendedBatteryKwh !== null && profile.recommendedBatteryKwh !== undefined) {
    return profile.recommendedBatteryKwh
  }
  // [ASSUMPTION] cover roughly the evening/overnight share of a day's use
  const need = (profile.avgDailyKwh ?? profile.annualKwh / 365) * 0.45
  return BATTERY_SIZE_OPTIONS_KWH.find((s) => s >= need) ?? BATTERY_SIZE_OPTIONS_KWH.at(-1)
}

// ---------- pricing (all PLACEHOLDER, see config/pricing.js) ----------

export function solarPrice(dcKw) {
  if (!(dcKw > 0)) return { mid: 0, low: 0, high: 0, perWatt: 0 }
  const band = SOLAR_PRICE_PER_WATT.find(([limit]) => dcKw <= limit + 1e-9) ?? SOLAR_PRICE_PER_WATT.at(-1)
  const mid = dcKw * 1000 * band[1]
  return { mid, low: mid * SOLAR_PRICE_LOW_FACTOR, high: mid * SOLAR_PRICE_HIGH_FACTOR, perWatt: band[1] }
}

export function batteryPrice(kwh) {
  if (!(kwh > 0)) return { price: 0, packageName: null, note: null }
  const pkg = BATTERY_PACKAGES.find((p) => p.kwh >= kwh - 1e-9)
  if (!pkg) {
    return { price: null, packageName: null, note: 'No reference price above 30 kWh - quote required.' }
  }
  const note =
    pkg.kwh > kwh ? `No price data for ${kwh} kWh; priced as the ${pkg.kwh} kWh package.` : null
  return { price: pkg.price, packageName: pkg.name, note }
}

export function paybackYears(price, annualSaving) {
  if (!(price > 0) || !(annualSaving > 0)) return null
  return price / annualSaving
}
