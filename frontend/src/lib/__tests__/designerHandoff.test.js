import { describe, expect, it } from 'vitest'
import {
  HANDOFF_EXPIRED,
  HANDOFF_NOT_CONFIGURED,
  HANDOFF_UNREACHABLE,
  HANDOFF_UNUSABLE,
  extractAndStripHandoffToken,
  redeemDesignerHandoff,
  trustedInsightsBase,
} from '../designerHandoff'

const profileJson = {
  version: '1',
  source: 'wattsight',
  location: { postcode: '3147', state: 'VIC' },
  usage: { annualKwh: 11462, avgDailyKwh: 31.4 },
  tariff: { type: 'single', importRateAvg: 0.3035, supplyPerDay: 0.862, feedInRate: 0.05 },
  recommendation: { solarKw: 10, batteryKwh: 13.5 },
}

const token = 'abcdefghijklmnop'

function okResponse(body, status = 200) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name === 'content-length' ? String(text.length) : null) },
    text: async () => text,
  }
}

describe('trusted Insights base', () => {
  it('accepts an https origin and a local http origin only', () => {
    expect(trustedInsightsBase('https://wattsight-platform.onrender.com')).toBe('https://wattsight-platform.onrender.com')
    expect(trustedInsightsBase('https://wattsight-platform.onrender.com/')).toBe('https://wattsight-platform.onrender.com')
    expect(trustedInsightsBase('http://127.0.0.1:8000')).toBe('http://127.0.0.1:8000')
    expect(trustedInsightsBase('http://example.com')).toBeNull()
    expect(trustedInsightsBase('https://user:pass@wattsight-platform.onrender.com')).toBeNull()
    expect(trustedInsightsBase('https://wattsight-platform.onrender.com/api?token=abc')).toBeNull()
    expect(trustedInsightsBase('https://wattsight-platform.onrender.com/#handoff=abc')).toBeNull()
    expect(trustedInsightsBase('')).toBeNull()
    expect(trustedInsightsBase(undefined)).toBeNull()
  })
})

describe('handoff token strip', () => {
  it('removes #handoff from the address and returns the token', () => {
    let next = ''
    const got = extractAndStripHandoffToken(
      { pathname: '/designer', search: '?step=1', hash: `#handoff=${token}` },
      (url) => {
        next = url
      },
    )
    expect(got).toBe(token)
    expect(next).toBe('/designer?step=1')
    expect(next).not.toContain(token)
  })

  it('keeps other hash values and ignores a token sitting in the query string', () => {
    let next = 'untouched'
    const got = extractAndStripHandoffToken(
      { pathname: '/', search: `?handoff=${token}`, hash: '#stay=1' },
      (url) => {
        next = url
      },
    )
    expect(got).toBeNull()
    expect(next).toBe('untouched')
  })
})

describe('redeem', () => {
  it('POSTs the token as JSON to the trusted base and parses profile.json', async () => {
    const calls = []
    const fetchImpl = async (url, opts) => {
      calls.push({ url, opts })
      return okResponse(profileJson)
    }
    const result = await redeemDesignerHandoff(token, { fetchImpl, base: 'https://insights.example' })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://insights.example/api/designer-handoff/redeem')
    expect(calls[0].opts.method).toBe('POST')
    expect(calls[0].opts.credentials).toBe('omit')
    expect(JSON.parse(calls[0].opts.body)).toEqual({ token })
    expect(result.profile.annualKwh).toBe(11462)
    expect(result.profile.postcode).toBe('3147')
  })

  it('drops out-of-range numbers and rejects a non-finite JSON token', async () => {
    const fetchImpl = async () => okResponse({ ...profileJson, tariff: { ...profileJson.tariff, importRateAvg: 99 } })
    const result = await redeemDesignerHandoff(token, { fetchImpl, base: 'https://insights.example' })
    expect(result.profile.importRate).toBe(0.3)
    expect(result.warnings.join(' ')).toMatch(/out-of-range/)
    const infinite = async () =>
      okResponse('{"source":"wattsight","usage":{"annualKwh":5000},"tariff":{"importRateAvg":Infinity}}')
    await expect(redeemDesignerHandoff(token, { fetchImpl: infinite, base: 'https://insights.example' })).rejects.toThrow(HANDOFF_UNUSABLE)
  })

  it('uses a fixed message for expiry and never echoes the token or the body', async () => {
    const secret = `${token}LEAKED`
    const fetchImpl = async () => okResponse(secret, 410)
    await expect(redeemDesignerHandoff(token, { fetchImpl, base: 'https://insights.example' })).rejects.toThrow(HANDOFF_EXPIRED)
    try {
      await redeemDesignerHandoff(token, { fetchImpl, base: 'https://insights.example' })
    } catch (error) {
      expect(error.message).not.toContain(token)
      expect(error.message).not.toContain('LEAKED')
    }
  })

  it('does not surface a network error that contains the token', async () => {
    const fetchImpl = async () => {
      throw new Error(`network down ${token}`)
    }
    await expect(redeemDesignerHandoff(token, { fetchImpl, base: 'https://insights.example' })).rejects.toThrow(HANDOFF_UNREACHABLE)
  })

  it('rejects a missing base, a bad token, an oversized body and an unusable profile', async () => {
    await expect(redeemDesignerHandoff(token, { base: null, fetchImpl: async () => okResponse(profileJson) })).rejects.toThrow(
      HANDOFF_NOT_CONFIGURED,
    )
    await expect(redeemDesignerHandoff('short', { base: 'https://insights.example', fetchImpl: async () => okResponse(profileJson) })).rejects.toThrow(
      HANDOFF_EXPIRED,
    )
    const huge = async () => okResponse('x'.repeat(300 * 1024))
    await expect(redeemDesignerHandoff(token, { fetchImpl: huge, base: 'https://insights.example' })).rejects.toThrow(HANDOFF_UNUSABLE)
    const junk = async () => okResponse({ hello: 'no' })
    await expect(redeemDesignerHandoff(token, { fetchImpl: junk, base: 'https://insights.example' })).rejects.toThrow(HANDOFF_UNUSABLE)
  })
})
