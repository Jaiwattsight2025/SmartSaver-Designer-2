import { describe, expect, it } from 'vitest'
import {
  ProfileError,
  profileFromFileText,
  profileFromManual,
  profileFromUrl,
  stateFromPostcode,
} from '../energyProfile'
import { exampleQuery } from './fixtures'

describe('profileFromUrl', () => {
  it('reads the Wattsight example link', () => {
    const { profile, warnings } = profileFromUrl(exampleQuery)
    expect(warnings).toEqual([])
    expect(profile).toMatchObject({
      source: 'wattsight',
      postcode: '3147',
      state: 'VIC',
      retailer: 'Alinta Energy',
      billingDays: 31,
      annualKwh: 11462,
      avgDailyKwh: 31.4,
      tariffType: 'single',
      importRate: 0.3035,
      supplyPerDay: 0.862,
      feedInRate: 0.05,
      recommendedSolarKw: 10,
      recommendedBatteryKwh: 13.5,
      assumed: [],
    })
  })

  it('also reads the profile from the #hash', () => {
    expect(profileFromUrl('', exampleQuery.replace('?', '#')).profile.annualKwh).toBe(11462)
  })

  it('returns null when there is no profile', () => {
    expect(profileFromUrl('?foo=bar', '')).toBeNull()
    expect(profileFromUrl('', '')).toBeNull()
  })

  it('drops out-of-range or junk values with a warning and uses defaults', () => {
    const { profile, warnings } = profileFromUrl('?src=wattsight&kwh_day=20&rate=9&fit=abc&st=XX&pc=31470&ret=<script>')
    expect(profile.annualKwh).toBe(7300)
    expect(profile.importRate).toBe(0.3)
    expect(profile.feedInRate).toBe(0.05)
    expect(profile.state).toBeNull()
    expect(profile.postcode).toBeNull()
    expect(profile.retailer).toBeNull()
    expect(profile.assumed).toEqual(['usage rate', 'supply charge', 'feed-in tariff'])
    expect(warnings.length).toBe(5)
  })

  it('derives state from postcode and averages TOU rates', () => {
    const { profile } = profileFromUrl('?src=wattsight&pc=2000&kwh_yr=5000&tariff=tou&r_pk=0.5&r_sh=0.3&r_op=0.2')
    expect(profile.state).toBe('NSW')
    expect(profile.tariffType).toBe('tou')
    expect(profile.importRate).toBeCloseTo(1 / 3, 5)
  })

  it('rejects a link with no usage and a newer version', () => {
    expect(() => profileFromUrl('?src=wattsight&rate=0.3')).toThrow(ProfileError)
    expect(() => profileFromUrl('?v=2&src=wattsight&kwh_yr=5000')).toThrow(/newer version/)
  })
})

describe('profileFromFileText', () => {
  const profileJson = {
    version: '1',
    source: 'wattsight',
    location: { postcode: '3147', state: 'VIC' },
    retailer: 'Alinta Energy',
    billing: { days: 31 },
    usage: { annualKwh: 11462, avgDailyKwh: 31.4 },
    tariff: { type: 'single', importRateAvg: 0.3035, supplyPerDay: 0.862, feedInRate: 0.05 },
    recommendation: { solarKw: 10, batteryKwh: 13.5 },
  }

  it('reads a Wattsight results file', () => {
    const text = JSON.stringify({ format: 'wattsight-results', version: 1, profile: profileJson, bill: {} })
    const { profile } = profileFromFileText(text)
    expect(profile.source).toBe('wattsight-file')
    expect(profile.annualKwh).toBe(11462)
    expect(profile.recommendedBatteryKwh).toBe(13.5)
  })

  it('reads a bare energy profile JSON', () => {
    expect(profileFromFileText(JSON.stringify(profileJson)).profile.importRate).toBe(0.3035)
  })

  it('rejects junk, other formats and newer versions', () => {
    expect(() => profileFromFileText('not json')).toThrow(/not valid JSON/)
    expect(() => profileFromFileText('[1,2]')).toThrow(ProfileError)
    expect(() => profileFromFileText('{"format":"other"}')).toThrow(ProfileError)
    expect(() => profileFromFileText(JSON.stringify({ format: 'wattsight-results', version: 2, profile: profileJson }))).toThrow(/newer/)
    expect(() => profileFromFileText('x'.repeat(300 * 1024))).toThrow(/too big/)
  })
})

describe('manual entry and postcodes', () => {
  it('takes cents and converts to dollars', () => {
    const { profile } = profileFromManual({ dailyKwh: '20', rateCents: '32', supplyCents: '110', feedInCents: '4', postcode: '5000' })
    expect(profile).toMatchObject({ source: 'manual', annualKwh: 7300, importRate: 0.32, supplyPerDay: 1.1, feedInRate: 0.04, state: 'SA' })
  })

  it('maps postcodes to states', () => {
    expect(stateFromPostcode('3147')).toBe('VIC')
    expect(stateFromPostcode('2600')).toBe('ACT')
    expect(stateFromPostcode('0800')).toBe('NT')
    expect(stateFromPostcode('4000')).toBe('QLD')
    expect(stateFromPostcode('6000')).toBe('WA')
    expect(stateFromPostcode('7000')).toBe('TAS')
    expect(stateFromPostcode('abc')).toBeNull()
  })
})
