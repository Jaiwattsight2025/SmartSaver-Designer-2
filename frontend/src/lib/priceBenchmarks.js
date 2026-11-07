/*
 * Installed-price benchmarks read from published tables.
 *
 * Solar Choice residential solar index, page updated 6 November 2026, table
 * dated 1 November 2026. Fully installed DC, GST and the STC discount included.
 * Standard and premium are two offer tiers from that installer network. They
 * are not an observed minimum and maximum, and they are not a confidence interval.
 * https://www.solarchoice.net.au/solar-panels/solar-power-system-prices/
 *
 * Solar Choice battery index, page updated 6 November 2026, national figures,
 * GST and the federal battery rebate included. The page's pre-rebate column is
 * ambiguous and is not stored here.
 * https://www.solarchoice.net.au/solar-batteries/price/
 *
 * Cheaper Home Batteries Program, page updated 9 June 2026. STC factors and the
 * size taper only. There is no official dollar rate, and the net indices above
 * already include the rebate, so nothing here subtracts it again.
 * https://www.dcceew.gov.au/energy/programs/cheaper-home-batteries
 *
 * Nothing in this file is a quote. Sizes outside a published bracket are
 * unavailable. Interpolation is linear, only between neighbouring points on
 * the same city, tier and date, and is labelled a derived estimate.
 */

export const SOLAR_INDEX = {
  source: 'https://www.solarchoice.net.au/solar-panels/solar-power-system-prices/',
  updated: '2026-11-06',
  tableDate: '2026-11-01',
  includes: 'GST and the STC discount',
  kind: 'Installer-network average of fully installed residential DC systems. Not a quote.',
  stalenessDays: 45,
}

export const BATTERY_INDEX = {
  source: 'https://www.solarchoice.net.au/solar-batteries/price/',
  updated: '2026-11-06',
  includes: 'installation, GST and the federal battery rebate',
  excludes: 'meter installation and extra cost for a difficult install',
  kind: 'National installer-network average. Not a quote.',
  stalenessDays: 120,
}

export const BATTERY_REBATE = {
  source: 'https://www.dcceew.gov.au/energy/programs/cheaper-home-batteries',
  updated: '2026-06-09',
  factorMayDec2026: 6.8,
  factorJanJun2027: 5.7,
  taper: [
    { toKwh: 14, share: 1 },
    { toKwh: 28, share: 0.6 },
    { toKwh: 50, share: 0.15 },
  ],
  dollarRate: null,
}

export const SOLAR_SIZES_KW = [3, 4, 5, 6, 7, 10]

/** Residential standard-offer row, AUD, same column order as SOLAR_SIZES_KW. */
export const SOLAR_STANDARD_AUD = {
  Adelaide: [3710, 4180, 4870, 5470, 6340, 8610],
  Brisbane: [4120, 4850, 5540, 6200, 7080, 9350],
  Canberra: [3990, 4580, 5170, 5790, 6560, 8580],
  Darwin: [6250, 7830, 8470, 9890, 10490, 14930],
  Hobart: [4130, 5090, 5890, 6680, 7500, 11080],
  Melbourne: [3950, 4440, 5120, 5750, 6450, 8870],
  Sydney: [3670, 4270, 5000, 5800, 6510, 8810],
  Perth: [3170, 3780, 4400, 5230, 5670, 8410],
  All: [4120, 4880, 5560, 6350, 7080, 9830],
}

/**
 * Premium-offer row from the same page. Melbourne and the national All row
 * were in the research note. The other capitals were read from that premium
 * table on the same page. They are not estimated from the standard row.
 */
export const SOLAR_PREMIUM_AUD = {
  Adelaide: [4460, 5080, 5940, 6670, 7600, 10220],
  Brisbane: [4910, 5710, 6520, 7320, 8330, 11000],
  Canberra: [4640, 5440, 6110, 6910, 7580, 10160],
  Darwin: [7050, 9040, 9950, 11630, 12680, 18250],
  Hobart: [4880, 6020, 6920, 7880, 8720, 12670],
  Melbourne: [4530, 5130, 5930, 6660, 7500, 10330],
  Sydney: [4370, 5030, 5910, 6720, 7570, 10380],
  Perth: [3930, 4570, 5360, 6200, 6860, 9930],
  All: [4850, 5750, 6580, 7500, 8360, 11620],
}

export const BATTERY_KWH = [10, 20, 30, 40, 50]
export const BATTERY_ONLY_AUD = [7384, 14172, 20689, 27911, 35534]
export const BATTERY_PLUS_INVERTER_AUD = [7984, 15172, 21889, 29511, 38034]

/** Capital named on the Solar Choice city row for a known bill state. */
export const CAPITAL_BY_STATE = {
  VIC: 'Melbourne',
  NSW: 'Sydney',
  QLD: 'Brisbane',
  SA: 'Adelaide',
  WA: 'Perth',
  ACT: 'Canberra',
  TAS: 'Hobart',
  NT: 'Darwin',
}

const aud = (n) => `$${Math.round(n).toLocaleString('en-AU')}`

function interpolate(sizes, values, size) {
  for (let i = 0; i < sizes.length; i += 1) {
    if (Math.abs(sizes[i] - size) < 1e-6) {
      return {
        aud: values[i],
        derived: false,
        from: { size: sizes[i], aud: values[i] },
        to: { size: sizes[i], aud: values[i] },
      }
    }
  }
  for (let i = 0; i < sizes.length - 1; i += 1) {
    if (size > sizes[i] && size < sizes[i + 1]) {
      const t = (size - sizes[i]) / (sizes[i + 1] - sizes[i])
      return {
        aud: Math.round(values[i] + t * (values[i + 1] - values[i])),
        derived: true,
        from: { size: sizes[i], aud: values[i] },
        to: { size: sizes[i + 1], aud: values[i + 1] },
      }
    }
  }
  return null
}

function solarPoint(city, tier, kw) {
  const row = (tier === 'premium' ? SOLAR_PREMIUM_AUD : SOLAR_STANDARD_AUD)[city]
  const hit = interpolate(SOLAR_SIZES_KW, row, kw)
  if (!hit) return null
  const tierLabel = tier === 'premium' ? 'premium offer' : 'standard offer'
  const cells = hit.derived
    ? `${city} ${tierLabel} ${hit.from.size} kW ${aud(hit.from.aud)} and ${hit.to.size} kW ${aud(hit.to.aud)}`
    : `${city} ${tierLabel} ${hit.from.size} kW ${aud(hit.from.aud)}`
  const citation = hit.derived
    ? `Derived estimate, not a published ${kw} kW average. Linear interpolation on the ${cells}, same city, tier and 1 November 2026 table. Result ${aud(hit.aud)}.`
    : `${cells}. Cell in the Solar Choice residential table dated 1 November 2026, page updated 6 November 2026.`
  return { ...hit, tier, city, citation, cells }
}

/**
 * Solar benchmark for one state. The city row is named. A missing state does
 * not fall back to the national All row or to a capital guessed from a postcode.
 */
export function solarBenchmarks({ kw, state } = {}) {
  const city = CAPITAL_BY_STATE[state] ?? null
  const base = {
    source: SOLAR_INDEX.source,
    updated: SOLAR_INDEX.updated,
    tableDate: SOLAR_INDEX.tableDate,
    includes: SOLAR_INDEX.includes,
    city,
    state: state ?? null,
    kw,
  }
  if (!city) {
    return {
      ...base,
      available: false,
      standard: null,
      premium: null,
      reason: 'No state is on this design, so no capital-city row is used. The national All row is not applied in its place.',
    }
  }
  if (!(kw >= SOLAR_SIZES_KW[0] && kw <= SOLAR_SIZES_KW.at(-1))) {
    return {
      ...base,
      available: false,
      standard: null,
      premium: null,
      reason: `Solar Choice has no residential price for ${Number(kw).toFixed(2)} kW. The 1 November 2026 table is 3, 4, 5, 6, 7 and 10 kW only. Nothing is estimated outside that.`,
    }
  }
  const where = `${city} row, because the bill state is ${state}. This is that capital's index, not a price for every town in ${state}.`
  return {
    ...base,
    available: true,
    standard: solarPoint(city, 'standard', kw),
    premium: solarPoint(city, 'premium', kw),
    where,
    tierNote: 'Standard and premium are two offer tiers, not a low-to-high price range.',
    reason: '',
  }
}

function batteryPoint(kind, kwh) {
  const values = kind === 'withInverter' ? BATTERY_PLUS_INVERTER_AUD : BATTERY_ONLY_AUD
  const hit = interpolate(BATTERY_KWH, values, kwh)
  if (!hit) return null
  const label = kind === 'withInverter' ? 'battery plus a separate inverter' : 'battery only'
  const cells = hit.derived
    ? `${label} ${hit.from.size} kWh ${aud(hit.from.aud)} and ${hit.to.size} kWh ${aud(hit.to.aud)}`
    : `${label} ${hit.from.size} kWh ${aud(hit.from.aud)}`
  const citation = hit.derived
    ? `Derived estimate, not a published ${kwh} kWh average. Linear interpolation on the national ${cells}, same table dated 6 November 2026. Result ${aud(hit.aud)}.`
    : `National ${cells}. Cell in the Solar Choice battery table, page updated 6 November 2026.`
  const caveat =
    kind === 'withInverter'
      ? 'AC retrofit with its own inverter. The solar index already includes a standard inverter, so this figure can count an inverter twice if the two are added.'
      : 'Needs a hybrid inverter that is already battery-ready. It does not include a hybrid upgrade the solar index left out.'
  return { ...hit, kind, citation, cells, caveat }
}

export function batteryBenchmarks(kwh) {
  const base = {
    source: BATTERY_INDEX.source,
    updated: BATTERY_INDEX.updated,
    includes: BATTERY_INDEX.includes,
    excludes: BATTERY_INDEX.excludes,
    kwh,
  }
  if (!(kwh > 0)) return { ...base, applicable: false, available: false, only: null, withInverter: null, reason: '' }
  if (!(kwh >= BATTERY_KWH[0] && kwh <= BATTERY_KWH.at(-1))) {
    return {
      ...base,
      applicable: true,
      available: false,
      only: null,
      withInverter: null,
      reason: `Solar Choice has no battery price for ${kwh} kWh. The November 2026 table is 10, 20, 30, 40 and 50 kWh only. Nothing is estimated outside that.`,
    }
  }
  return {
    ...base,
    applicable: true,
    available: true,
    only: batteryPoint('only', kwh),
    withInverter: batteryPoint('withInverter', kwh),
    reason: '',
  }
}

function packFinance(cost, saving, extra) {
  if (!(cost > 0)) return null
  const savingOk = Number.isFinite(saving) ? saving : null
  return {
    cost,
    saving: savingOk,
    years: savingOk > 0 ? cost / savingOk : null,
    savingsToCostPct: savingOk === null ? null : (savingOk / cost) * 100,
    ...extra,
  }
}

const FINANCE_NOTE =
  'Simple payback is price divided by the modelled yearly saving, and only when that saving is above zero. The percentage is saving divided by price. Neither is an IRR or a guarantee. Both leave out degradation, finance, maintenance and tariff changes.'

/**
 * Benchmarks and, only when one complete upfront figure exists, a simple payback.
 * Solar and battery indices are never added together.
 */
export function priceDesign({ dcKw, batteryKwh = 0, state = null, quoteAud = null, solarSaving = null, projectSaving = null } = {}) {
  const solar = solarBenchmarks({ kw: dcKw, state })
  const battery = batteryBenchmarks(batteryKwh)
  const quote = Number(quoteAud)
  const quoteOk = Number.isFinite(quote) && quote > 0
  let payback = null
  if (quoteOk) {
    payback = {
      kind: 'user-quote',
      ...packFinance(quote, projectSaving, {
        label: 'From the installer quote you entered. Not a Solar Choice price.',
      }),
    }
  } else if (!(batteryKwh > 0) && solar.available) {
    payback = {
      kind: 'solar-only',
      standard: packFinance(solar.standard.aud, solarSaving ?? projectSaving, {
        label: 'Solar-only, standard-offer benchmark. Not a project price once a battery is added.',
      }),
      premium: packFinance(solar.premium.aud, solarSaving ?? projectSaving, {
        label: 'Solar-only, premium-offer benchmark. A separate tier, not the top of a range.',
      }),
    }
  }
  const blocked = quoteOk
    ? ''
    : batteryKwh > 0
      ? 'Simple payback is unavailable. The solar index and the battery index are separate benchmarks and are not added into a project price. Enter an installer quote for the whole job if you want a simple payback from that figure.'
      : solar.available
        ? ''
        : 'Simple payback is unavailable because this solar size has no complete price in the November 2026 index.'
  return {
    solar,
    battery,
    quoteAud: quoteOk ? quote : null,
    combinedFromIndices: false,
    payback,
    paybackBlocked: blocked,
    financeNote: FINANCE_NOTE,
    rebateNote:
      'These net prices already include GST and the rebate in the source (STC discount on solar, federal battery rebate on batteries). They are not discounted again. The Cheaper Home Batteries factor is 6.8 STCs per usable kWh from May to December 2026 and 5.7 from January to June 2027, tapering after 14 kWh and again after 28 kWh. No official dollar rate for an STC is published on that page.',
    stalenessNote:
      'Solar index updated 6 November 2026, monthly, so treat it as stale after about 45 days. Battery index updated 6 November 2026, quarterly, so treat it as stale after about 120 days. A 2026 net benchmark is not guaranteed after a rebate change.',
  }
}

export function summaryPriceLines(pricing, { dcKw, batteryKwh } = {}) {
  const lines = []
  const solar = pricing?.solar
  if (!solar?.available) {
    lines.push(`Solar benchmark${dcKw ? ` (${Number(dcKw).toFixed(2)} kW)` : ''}: unavailable. ${solar?.reason ?? ''}`.trim())
  } else {
    lines.push(`Solar benchmark, ${solar.where}`)
    lines.push(`Standard offer: ${aud(solar.standard.aud)}. ${solar.standard.citation}`)
    lines.push(`Premium offer: ${aud(solar.premium.aud)}. ${solar.premium.citation}`)
    lines.push(solar.tierNote)
  }
  const battery = pricing?.battery
  if (battery?.applicable && battery.available) {
    lines.push(`Battery only, ${battery.kwh} kWh: ${aud(battery.only.aud)}. ${battery.only.citation} ${battery.only.caveat}`)
    lines.push(
      `Battery plus inverter, ${battery.kwh} kWh: ${aud(battery.withInverter.aud)}. ${battery.withInverter.citation} ${battery.withInverter.caveat}`,
    )
    lines.push(`Excluded from both battery figures: ${battery.excludes}.`)
    lines.push('The solar and battery benchmarks are not added together. There is no combined installed-price dataset.')
  } else if (battery?.applicable) {
    lines.push(`Battery benchmark: unavailable. ${battery.reason}`)
  } else if (!(batteryKwh > 0)) {
    lines.push('Battery: none.')
  }
  const pay = pricing?.payback
  if (pay?.kind === 'user-quote' && pay.years) {
    lines.push(
      `Simple payback from your installer quote of ${aud(pay.cost)}: ${pay.years.toFixed(1)} years. Savings-to-cost ${(pay.savingsToCostPct).toFixed(1)}%. ${pay.label}`,
    )
  } else if (pay?.kind === 'solar-only') {
    for (const tier of [pay.standard, pay.premium]) {
      if (tier?.years) {
        lines.push(
          `Simple payback, ${tier.label} ${aud(tier.cost)}: ${tier.years.toFixed(1)} years. Savings-to-cost ${tier.savingsToCostPct.toFixed(1)}%.`,
        )
      }
    }
  } else {
    lines.push(pricing?.paybackBlocked || 'Simple payback: unavailable.')
  }
  lines.push(pricing?.financeNote ?? FINANCE_NOTE)
  lines.push(pricing?.rebateNote ?? '')
  lines.push(pricing?.stalenessNote ?? '')
  return lines.filter(Boolean)
}
