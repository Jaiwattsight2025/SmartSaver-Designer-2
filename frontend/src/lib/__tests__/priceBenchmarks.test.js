import { describe, expect, it } from 'vitest'
import {
  BATTERY_ONLY_AUD,
  BATTERY_PLUS_INVERTER_AUD,
  BATTERY_REBATE,
  SOLAR_PREMIUM_AUD,
  SOLAR_STANDARD_AUD,
  batteryBenchmarks,
  priceDesign,
  solarBenchmarks,
  summaryPriceLines,
} from '../priceBenchmarks'

describe('Solar Choice solar index, 1 November 2026', () => {
  it('uses the published capital cells and no other city is invented', () => {
    expect(solarBenchmarks({ kw: 6, state: 'VIC' }).standard.aud).toBe(SOLAR_STANDARD_AUD.Melbourne[3])
    expect(solarBenchmarks({ kw: 6, state: 'VIC' }).premium.aud).toBe(SOLAR_PREMIUM_AUD.Melbourne[3])
    expect(SOLAR_PREMIUM_AUD.Melbourne).toEqual([4530, 5130, 5930, 6660, 7500, 10330])
    expect(SOLAR_PREMIUM_AUD.All).toEqual([4850, 5750, 6580, 7500, 8360, 11620])
    expect(SOLAR_STANDARD_AUD.Sydney).toEqual([3670, 4270, 5000, 5800, 6510, 8810])
    expect(SOLAR_PREMIUM_AUD.Sydney[0]).toBe(4370)
    expect(SOLAR_PREMIUM_AUD.Darwin[5]).toBe(18250)
    expect(SOLAR_PREMIUM_AUD.Adelaide[0]).toBe(4460)
    expect(SOLAR_STANDARD_AUD.Perth[0]).toBe(3170)
    expect(SOLAR_STANDARD_AUD.Hobart[5]).toBe(11080)
  })

  it('interpolates 6.6 kW only between the 6 and 7 kW cells of the same city and tier', () => {
    const row = solarBenchmarks({ kw: 6.6, state: 'VIC' })
    expect(row.standard.derived).toBe(true)
    expect(row.standard.aud).toBe(6170)
    expect(row.standard.citation).toMatch(/\$5,750/)
    expect(row.standard.citation).toMatch(/\$6,450/)
    expect(row.standard.citation).toMatch(/not a published 6.6 kW average/)
    expect(row.premium.aud).toBe(7164)
    expect(row.tierNote).toMatch(/not a low-to-high/)
  })

  it('does not price 15.84 kW, or anything under 3 kW or over 10 kW', () => {
    for (const kw of [2.99, 15.84, 10.01]) {
      const row = solarBenchmarks({ kw, state: 'NSW' })
      expect(row.available).toBe(false)
      expect(row.standard).toBeNull()
      expect(row.reason).toMatch(/Nothing is estimated outside/)
    }
  })

  it('does not assume a capital from a missing state, and does not use the All row', () => {
    const row = solarBenchmarks({ kw: 6, state: null })
    expect(row.available).toBe(false)
    expect(row.reason).toMatch(/national All row is not applied/)
    expect(summaryPriceLines(priceDesign({ dcKw: 6, state: null, batteryKwh: 0, projectSaving: 1000 })).join('\n')).not.toMatch(/\$6,350/)
  })
})

describe('Solar Choice battery index, 6 November 2026', () => {
  it('uses the published net cells and ignores the pre-rebate column', () => {
    const exact = batteryBenchmarks(10)
    expect(exact.only.aud).toBe(BATTERY_ONLY_AUD[0])
    expect(exact.withInverter.aud).toBe(BATTERY_PLUS_INVERTER_AUD[0])
    expect(exact.only.aud).toBe(7384)
    expect(exact.withInverter.aud).toBe(7984)
    expect(JSON.stringify(exact)).not.toMatch(/990|pre-rebate|Pre Rebate/i)
  })

  it('labels 13.5 kWh as a derived estimate between 10 and 20', () => {
    const row = batteryBenchmarks(13.5)
    expect(row.only.derived).toBe(true)
    expect(row.only.aud).toBe(9760)
    expect(row.only.citation).toMatch(/\$7,384/)
    expect(row.only.citation).toMatch(/\$14,172/)
    expect(row.only.citation).toMatch(/not a published 13.5 kWh average/)
    expect(row.withInverter.aud).toBe(10500)
    expect(row.only.caveat).toMatch(/hybrid/)
    expect(row.withInverter.caveat).toMatch(/twice/)
  })

  it('has no price under 10 kWh or over 50 kWh and no invented band', () => {
    expect(batteryBenchmarks(9).available).toBe(false)
    expect(batteryBenchmarks(51).available).toBe(false)
    expect(batteryBenchmarks(13.5).only).not.toHaveProperty('low')
    expect(batteryBenchmarks(13.5).only).not.toHaveProperty('high')
  })
})

describe('financial outputs', () => {
  it('does not add solar and battery into a project price or a payback', () => {
    const priced = priceDesign({ dcKw: 6.6, batteryKwh: 13.5, state: 'VIC', projectSaving: 2000, solarSaving: 1500 })
    expect(priced.combinedFromIndices).toBe(false)
    expect(priced.payback).toBeNull()
    expect(priced.paybackBlocked).toMatch(/not added/)
    const text = summaryPriceLines(priced, { dcKw: 6.6, batteryKwh: 13.5 }).join('\n')
    expect(text).toMatch(/\$6,170/)
    expect(text).toMatch(/\$9,760/)
    expect(text).not.toMatch(/\$16,930|\$15,930/)
    expect(text).toMatch(/Simple payback is unavailable/)
  })

  it('uses a user quote as the only complete project price', () => {
    const priced = priceDesign({ dcKw: 15.84, batteryKwh: 13.5, state: 'VIC', quoteAud: 18000, projectSaving: 2400 })
    expect(priced.solar.available).toBe(false)
    expect(priced.payback.kind).toBe('user-quote')
    expect(priced.payback.years).toBeCloseTo(7.5, 6)
    expect(priced.payback.savingsToCostPct).toBeCloseTo(13.333, 2)
    expect(priced.payback.label).toMatch(/Not a Solar Choice/)
  })

  it('gives solar-only payback from each tier when there is no battery and saving is positive', () => {
    const priced = priceDesign({ dcKw: 6, batteryKwh: 0, state: 'VIC', projectSaving: 1000 })
    expect(priced.payback.kind).toBe('solar-only')
    expect(priced.payback.standard.years).toBeCloseTo(5.75, 6)
    expect(priced.payback.premium.years).toBeCloseTo(6.66, 6)
    expect(priced.payback.standard.cost).not.toBe(priced.payback.premium.cost)
  })

  it('does not claim a payback when the saving is zero or negative', () => {
    const zero = priceDesign({ dcKw: 6, batteryKwh: 0, state: 'VIC', projectSaving: 0 })
    expect(zero.payback.standard.years).toBeNull()
    const negative = priceDesign({ dcKw: 6, batteryKwh: 0, state: 'VIC', quoteAud: 5000, projectSaving: -100 })
    expect(negative.payback.years).toBeNull()
  })

  it('records the rebate factors and does not apply a dollar discount on top of the net index', () => {
    expect(BATTERY_REBATE.factorMayDec2026).toBe(6.8)
    expect(BATTERY_REBATE.factorJanJun2027).toBe(5.7)
    expect(BATTERY_REBATE.dollarRate).toBeNull()
    expect(BATTERY_REBATE.taper.map((t) => t.share)).toEqual([1, 0.6, 0.15])
    const priced = priceDesign({ dcKw: 5, batteryKwh: 0, state: 'QLD', projectSaving: 800 })
    expect(priced.solar.standard.aud).toBe(SOLAR_STANDARD_AUD.Brisbane[2])
    expect(priced.rebateNote).toMatch(/not discounted again/)
    expect(priced.stalenessNote).toMatch(/45 days/)
    expect(priced.stalenessNote).toMatch(/120 days/)
  })
})
