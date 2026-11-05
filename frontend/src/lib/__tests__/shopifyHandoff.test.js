import { describe, it, expect } from 'vitest'
import { buildQuoteUrl, pickShopLinks, MAX_QUOTE_BODY_CHARS } from '../shopifyHandoff'
import { QUOTE_URL, SOLAR_BATTERIES_URL, ENERGY_MONITOR_PRODUCT_URL, SHOP_SMART_PLUGS_URL, SHOP_LED_URL } from '../../config/pricing'

const good = { source: 'wattsight', annualKwh: 4000, assumed: [] }
const panels = { layout: { count: 16 }, batteryKwh: 0 }

describe('buildQuoteUrl', () => {
  it('returns bare quote URL without text', () => {
    expect(buildQuoteUrl({})).toBe(QUOTE_URL)
    expect(QUOTE_URL).toBe('https://smartsaverenergy.com.au/pages/request-a-quote')
  })
  it('prefills contact[body]', () => {
    const u = new URL(buildQuoteUrl({ summaryText: '6.6 kW & 10 kWh' }))
    expect(u.pathname).toBe('/pages/request-a-quote')
    expect(u.searchParams.get('contact[body]')).toBe('6.6 kW & 10 kWh')
  })
  it('caps long bodies', () => {
    const u = new URL(buildQuoteUrl({ summaryText: 'x'.repeat(5000) }))
    expect(u.searchParams.get('contact[body]').length).toBeLessThanOrEqual(MAX_QUOTE_BODY_CHARS)
  })
})

describe('pickShopLinks', () => {
  it('suggests monitoring when no profile', () => {
    const l = pickShopLinks({ profile: null, design: { layout: { count: 0 } } })
    expect(l[0].href).toBe(ENERGY_MONITOR_PRODUCT_URL)
    expect(l.some((x) => x.href === SOLAR_BATTERIES_URL)).toBe(false)
  })
  it('suggests plugs + LED for high usage, plus packages', () => {
    const l = pickShopLinks({ profile: { ...good, annualKwh: 9000 }, design: panels })
    expect(l.map((x) => x.href)).toEqual([SHOP_SMART_PLUGS_URL, SHOP_LED_URL, SOLAR_BATTERIES_URL])
  })
  it('includes packages for battery-only designs and caps at 3', () => {
    const l = pickShopLinks({ profile: { ...good, assumed: ['a', 'b'] }, design: { layout: { count: 0 }, batteryKwh: 10 } })
    expect(l.length).toBeLessThanOrEqual(3)
    expect(l.at(-1).href).toBe(SOLAR_BATTERIES_URL)
  })
})