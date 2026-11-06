/*
 * Read the customer's bill numbers ("energy profile") into the Designer.
 *
 * Two ways in, one validator:
 *   1. Energy Insights handoff redeem body: profile.json (source "wattsight")
 *      or a wattsight-results wrapper. Parsed here, never taken from the page URL.
 *   2. Manual entry in the Designer
 *
 * profileFromUrl still validates the old flat keys for tests. The app must not
 * call it: bill numbers in the query or hash are not accepted.
 *
 * Nothing here is trusted: every number is type- and range-checked, unknown
 * keys are ignored and the profile never contains name / street address / NMI.
 */
import {
  DEFAULT_FEED_IN_RATE,
  DEFAULT_IMPORT_RATE,
  DEFAULT_SUPPLY_PER_DAY,
  STATES,
} from '../config/designerConfig'

export const PROFILE_VERSION = 1
export const RESULTS_FILE_FORMAT = 'wattsight-results'
export const RESULTS_FILE_VERSION = 1
export const MAX_FILE_BYTES = 256 * 1024

export class ProfileError extends Error {}

// key -> [min, max]
const BOUNDS = {
  days: [1, 800],
  kwh_yr: [100, 200000],
  kwh_day: [0.3, 550],
  kwh_pk: [0, 200000],
  kwh_sh: [0, 200000],
  kwh_op: [0, 200000],
  kwh_cl: [0, 200000],
  exp_kwh: [0, 200000],
  rate: [0.01, 1.5],
  r_pk: [0.01, 1.5],
  r_sh: [0.01, 1.5],
  r_op: [0.01, 1.5],
  r_cl: [0.01, 1.5],
  supply: [0, 6],
  fit: [0, 0.6],
  sol_kw: [0, 100],
  bat_kwh: [0, 200],
}

const RETAILER_RX = /^[A-Za-z0-9 &'().,+/-]{1,60}$/

export function stateFromPostcode(postcode) {
  const n = Number(postcode)
  if (!/^\d{4}$/.test(String(postcode))) return null
  if ((n >= 200 && n <= 299) || (n >= 2600 && n <= 2618) || (n >= 2900 && n <= 2920)) return 'ACT'
  if (n >= 800 && n <= 999) return 'NT'
  if (n >= 1000 && n <= 2999) return 'NSW'
  if ((n >= 3000 && n <= 3999) || (n >= 8000 && n <= 8999)) return 'VIC'
  if ((n >= 4000 && n <= 4999) || (n >= 9000 && n <= 9999)) return 'QLD'
  if (n >= 5000 && n <= 5999) return 'SA'
  if (n >= 6000 && n <= 6999) return 'WA'
  if (n >= 7000 && n <= 7999) return 'TAS'
  return null
}

function num(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return NaN
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(n) ? n : NaN
}

/**
 * Validate a flat set of Wattsight query-string keys.
 * Returns { profile, warnings }. Throws ProfileError if unusable.
 */
export function validateProfileParams(params, source = 'wattsight') {
  const get = (k) => (typeof params.get === 'function' ? params.get(k) : params[k])
  const warnings = []

  const v = get('v')
  if (v !== null && v !== undefined && v !== '') {
    const ver = num(v)
    if (!Number.isInteger(ver) || ver < 1) throw new ProfileError('The bill data has an unknown version.')
    if (ver > PROFILE_VERSION) {
      throw new ProfileError('This bill data was made by a newer version of Wattsight. Please update the Designer.')
    }
  }

  const values = {}
  for (const [key, [min, max]] of Object.entries(BOUNDS)) {
    const n = num(get(key))
    if (n === null) continue
    if (Number.isNaN(n) || n < min || n > max) {
      warnings.push(`Ignored an out-of-range value for "${key}".`)
      continue
    }
    values[key] = n
  }

  let postcode = String(get('pc') ?? '').trim()
  if (postcode && !/^\d{4}$/.test(postcode)) {
    warnings.push('Ignored an invalid postcode.')
    postcode = ''
  }
  let state = String(get('st') ?? '').trim().toUpperCase()
  if (state && !STATES.includes(state)) {
    warnings.push('Ignored an invalid state.')
    state = ''
  }
  if (!state && postcode) state = stateFromPostcode(postcode) ?? ''

  let retailer = String(get('ret') ?? '').trim()
  if (retailer && !RETAILER_RX.test(retailer)) {
    warnings.push('Ignored an invalid retailer name.')
    retailer = ''
  }

  const tariffRaw = String(get('tariff') ?? '').trim().toLowerCase()
  const tariffType = tariffRaw === 'tou' || tariffRaw === 'time of use' ? 'tou' : 'single'

  let annualKwh = values.kwh_yr ?? null
  let avgDailyKwh = values.kwh_day ?? null
  if (annualKwh === null && avgDailyKwh !== null) annualKwh = Math.round(avgDailyKwh * 365)
  if (avgDailyKwh === null && annualKwh !== null) avgDailyKwh = Math.round((annualKwh / 365) * 100) / 100
  if (annualKwh === null) {
    throw new ProfileError('The bill data has no usable electricity usage (kWh).')
  }

  const assumed = []
  let importRate = values.rate ?? null
  if (importRate === null) {
    const tou = [values.r_pk, values.r_sh, values.r_op].filter((r) => r != null)
    if (tou.length) importRate = tou.reduce((a, b) => a + b, 0) / tou.length
  }
  if (importRate === null) {
    importRate = DEFAULT_IMPORT_RATE
    assumed.push('usage rate')
  }
  let supplyPerDay = values.supply ?? null
  if (supplyPerDay === null) {
    supplyPerDay = DEFAULT_SUPPLY_PER_DAY
    assumed.push('supply charge')
  }
  let feedInRate = values.fit ?? null
  if (feedInRate === null) {
    feedInRate = DEFAULT_FEED_IN_RATE
    assumed.push('feed-in tariff')
  }

  const profile = {
    version: PROFILE_VERSION,
    source,
    postcode: postcode || null,
    state: state || null,
    retailer: retailer || null,
    billingDays: values.days ?? null,
    annualKwh,
    avgDailyKwh,
    tariffType,
    importRate,
    peakRate: values.r_pk ?? null,
    shoulderRate: values.r_sh ?? null,
    offpeakRate: values.r_op ?? null,
    controlledLoadRate: values.r_cl ?? null,
    supplyPerDay,
    feedInRate,
    existingSolarExportKwh: values.exp_kwh ?? null,
    recommendedSolarKw: values.sol_kw ?? null,
    recommendedBatteryKwh: values.bat_kwh ?? null,
    assumed,
  }
  return { profile, warnings }
}

/**
 * Flat-key validator used by tests. Not a runtime entry.
 * Returns null for `#handoff=` and `profile_url` so a page URL cannot carry bill data.
 */
export function profileFromUrl(search = '', hash = '') {
  for (const raw of [search, hash]) {
    const text = String(raw || '').replace(/^[?#]/, '')
    if (!text) continue
    const params = new URLSearchParams(text)
    if (params.has('handoff') || params.has('profile_url')) return null
    const looksLikeProfile =
      params.get('src') === 'wattsight' || params.has('kwh_yr') || params.has('kwh_day')
    if (looksLikeProfile) return validateProfileParams(params, 'wattsight')
  }
  return null
}

/** Convert a Wattsight energy profile v1 object (JSON shape) to flat keys. */
export function profileJsonToParams(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new ProfileError('The file has no energy profile.')
  const o = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {})
  const loc = o(p.location)
  const billing = o(p.billing)
  const usage = o(p.usage)
  const tariff = o(p.tariff)
  const rec = o(p.recommendation)
  return {
    v: p.version ?? '1',
    pc: loc.postcode,
    st: loc.state,
    ret: typeof p.retailer === 'string' ? p.retailer : undefined,
    days: billing.days,
    kwh_yr: usage.annualKwh,
    kwh_day: usage.avgDailyKwh,
    kwh_pk: usage.peakKwh,
    kwh_sh: usage.shoulderKwh,
    kwh_op: usage.offpeakKwh,
    kwh_cl: usage.controlledLoadKwh,
    exp_kwh: usage.solarExportKwh,
    tariff: tariff.type,
    rate: tariff.importRateAvg ?? tariff.flatRate,
    r_pk: tariff.peakRate,
    r_sh: tariff.shoulderRate,
    r_op: tariff.offpeakRate,
    r_cl: tariff.controlledLoadRate,
    supply: tariff.supplyPerDay,
    fit: tariff.feedInRate,
    sol_kw: rec.solarKw,
    bat_kwh: rec.batteryKwh,
  }
}

/**
 * Read a Wattsight results file ("wattsight-results" v1) or a bare energy
 * profile JSON. `text` is the file contents. Returns { profile, warnings }.
 */
export function profileFromFileText(text) {
  if (typeof text !== 'string') throw new ProfileError('Could not read that file.')
  if (new Blob([text]).size > MAX_FILE_BYTES) throw new ProfileError('That file is too big to be a Wattsight results file.')
  let data
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    throw new ProfileError('That file is not a Wattsight results file (it is not valid JSON).')
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ProfileError('That file is not a Wattsight results file.')
  }

  if (data.format === RESULTS_FILE_FORMAT) {
    const version = data.version
    if (!Number.isInteger(version) || version < 1) throw new ProfileError('The results file has an unknown version.')
    if (version > RESULTS_FILE_VERSION) {
      throw new ProfileError('This results file was saved by a newer version of Wattsight. Please update the Designer.')
    }
    const result = validateProfileParams(profileJsonToParams(data.profile), 'wattsight-file')
    return result
  }

  if (data.source === 'wattsight' && data.usage) {
    return validateProfileParams(profileJsonToParams(data), 'wattsight-file')
  }

  throw new ProfileError('That file is not a Wattsight results file.')
}

/**
 * Manual entry. Form values are in friendly units: rates in cents.
 * { annualKwh?, dailyKwh?, rateCents, supplyCents, feedInCents, postcode, state }
 */
export function profileFromManual(form) {
  const cents = (x) => {
    const n = num(x)
    return n === null || Number.isNaN(n) ? undefined : n / 100
  }
  return validateProfileParams(
    {
      v: '1',
      pc: form.postcode,
      st: form.state,
      kwh_yr: form.annualKwh,
      kwh_day: form.dailyKwh,
      rate: cents(form.rateCents),
      supply: cents(form.supplyCents),
      fit: cents(form.feedInCents),
      tariff: 'single',
    },
    'manual',
  )
}
