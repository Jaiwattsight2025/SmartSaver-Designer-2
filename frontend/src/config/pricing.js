/*
 * Shop and quote links only.
 * Installed-price benchmarks live in src/lib/priceBenchmarks.js.
 * This file does not hold a $/W table or a battery package price.
 */

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