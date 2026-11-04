/*
 * SMARTSAVER DESIGNER - PRICING   *** ALL VALUES ARE PLACEHOLDERS ***
 *
 * Nothing in this file is a confirmed SmartSaver price. Jai must replace these
 * from the SmartSaver Pricing Book before any customer sees a price.
 * While PRICES_ARE_PLACEHOLDERS is true the Designer shows an
 * "indicative pricing - placeholder" notice next to every price.
 */

export const PRICES_ARE_PLACEHOLDERS = true

// [PLACEHOLDER] Installed solar, $ per watt AFTER the STC rebate.
// Copied from Wattsight's placeholder table (config/assumptions.py) - NOT verified.
// [upper size limit kW, $/W]
export const SOLAR_PRICE_PER_WATT = [
  [3.0, 1.65],
  [5.0, 1.35],
  [6.6, 1.16],
  [10.0, 0.98],
  [99.0, 0.9],
]
export const SOLAR_PRICE_LOW_FACTOR = 0.9 // [PLACEHOLDER] range shown to customer
export const SOLAR_PRICE_HIGH_FACTOR = 1.15 // [PLACEHOLDER]

// [PLACEHOLDER] Battery packages, supply & install. Prices are the ARCHIVED
// AlphaESS "Battery Only" listings on the SmartSaver Shopify store (read
// 4 Nov 2026). Not confirmed; sizes below 20 kWh have NO price data and are
// priced as the smallest package until the Pricing Book is connected.
export const BATTERY_PACKAGES = [
  { kwh: 20, price: 7490, name: 'AlphaESS 20 kWh (Shopify listing, archived)' },
  { kwh: 25, price: 7990, name: 'AlphaESS 25 kWh (Shopify listing, archived)' },
  { kwh: 30, price: 8490, name: 'AlphaESS 30 kWh (Shopify listing, archived)' },
]

// [PLACEHOLDER] Shopify links. The store is still password-protected and the
// quote page is unpublished, so these will not work for customers yet.
export const SHOP_BASE_URL = 'https://qgy961-0w.myshopify.com'
export const QUOTE_URL = `${SHOP_BASE_URL}/pages/contact` // swap to /pages/request-a-quote once published
export const SHOP_PRODUCTS_URL = `${SHOP_BASE_URL}/collections/all`
