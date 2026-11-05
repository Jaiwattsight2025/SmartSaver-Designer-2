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

// Shopify links. Request a Quote and Solar Batteries pages are PUBLISHED, but
// the store is still password-protected, so visitors need the store password
// until launch. Primary domain below; https://qgy961-0w.myshopify.com also works.
export const SHOP_BASE_URL = 'https://smartsaverenergy.com.au'
export const QUOTE_URL = `${SHOP_BASE_URL}/pages/request-a-quote`
export const SOLAR_BATTERIES_URL = `${SHOP_BASE_URL}/pages/solar-batteries`
export const SHOP_SMART_PLUGS_URL = `${SHOP_BASE_URL}/collections/smart-plugs`
export const SHOP_POWER_MONITORING_URL = `${SHOP_BASE_URL}/collections/power-monitoring`
export const SHOP_LED_URL = `${SHOP_BASE_URL}/collections/led-lighting`
export const SHOP_SWITCHES_URL = `${SHOP_BASE_URL}/collections/smart-switches-relays`
export const ENERGY_MONITOR_PRODUCT_URL = `${SHOP_BASE_URL}/products/whole-home-energy-monitor-ct-clamp-wi-fi`
export const SMART_PLUG_PRODUCT_URL = `${SHOP_BASE_URL}/products/tp-link-tapo-p110-energy-monitoring-smart-plug`
// Generic "browse efficiency products" entry point.
export const SHOP_PRODUCTS_URL = SHOP_SMART_PLUGS_URL