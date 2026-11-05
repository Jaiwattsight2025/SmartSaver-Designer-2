/*
 * Shopify handoff from the Designer Summary step.
 * - buildQuoteUrl: Request a Quote page (contact template) with the design
 *   summary prefilled via contact[body]. Dawn-style themes read this param;
 *   if a theme ignores it, the summary is also copied to the clipboard.
 * - pickShopLinks: 1-3 simple, documented next-step product links.
 */
import {
  QUOTE_URL,
  SOLAR_BATTERIES_URL,
  SHOP_SMART_PLUGS_URL,
  SHOP_POWER_MONITORING_URL,
  SHOP_LED_URL,
  ENERGY_MONITOR_PRODUCT_URL,
} from '../config/pricing'

export const MAX_QUOTE_BODY_CHARS = 1500
// [ASSUMPTION] ~16 kWh/day; above this, plug loads and lighting are worth targeting.
export const HIGH_USAGE_KWH_YR = 6000
// [ASSUMPTION] 2+ defaulted bill fields (rates, supply, feed-in) = low bill detail.
export const LOW_DETAIL_ASSUMED_FIELDS = 2

export function buildQuoteUrl({ summaryText } = {}) {
  const text = (summaryText ?? '').trim()
  if (!text) return QUOTE_URL
  const body =
    text.length > MAX_QUOTE_BODY_CHARS ? text.slice(0, MAX_QUOTE_BODY_CHARS - 20).trimEnd() + '\n...(truncated)' : text
  return `${QUOTE_URL}?${new URLSearchParams({ 'contact[body]': body }).toString()}`
}

export function pickShopLinks({ profile, design } = {}) {
  const links = []
  const assumed = profile?.assumed?.length ?? 0
  const lowDetail = !profile || profile.source === 'manual' || assumed >= LOW_DETAIL_ASSUMED_FIELDS
  const highUsage = (profile?.annualKwh ?? 0) >= HIGH_USAGE_KWH_YR

  if (lowDetail) {
    // Not enough bill detail: measure first.
    links.push({ id: 'monitor', label: 'Whole-home energy monitor', href: ENERGY_MONITOR_PRODUCT_URL, reason: 'See where your power goes before you spend more.' })
    links.push({ id: 'monitoring', label: 'Power monitoring products', href: SHOP_POWER_MONITORING_URL, reason: 'Track usage room by room.' })
  } else if (highUsage) {
    links.push({ id: 'plugs', label: 'Smart plugs', href: SHOP_SMART_PLUGS_URL, reason: 'Cut standby and evening plug loads.' })
    links.push({ id: 'led', label: 'LED lighting', href: SHOP_LED_URL, reason: 'Lower lighting use, mostly after dark when solar is off.' })
  } else {
    links.push({ id: 'plugs', label: 'Smart plugs', href: SHOP_SMART_PLUGS_URL, reason: 'Easy savings on everyday appliances.' })
  }

  if ((design?.layout?.count ?? 0) > 0 || (design?.batteryKwh ?? 0) > 0) {
    links.push({ id: 'packages', label: 'Solar & battery packages', href: SOLAR_BATTERIES_URL, reason: 'Packages matching this design.' })
  }
  return links.slice(0, 3)
}