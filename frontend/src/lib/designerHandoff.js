/*
 * Energy Insights -> Designer handoff.
 *
 * Insights redirects the browser to the Designer with only `#handoff=<opaque token>`.
 * The token is a capability for one redemption. It is stripped from the address bar
 * immediately and is not written to storage, React state, or logs.
 * The Designer POSTs { token } to VITE_INSIGHTS_API_BASE (build-time only, never
 * taken from the page URL). credentials are omitted: the token is the capability,
 * not a third-party cookie.
 *
 * This client is not a live end-to-end proof. Expiry, single use, the subscription
 * gate and CORS are enforced by the Insights backend once that base is configured.
 */
import { MAX_FILE_BYTES, ProfileError, profileFromFileText } from './energyProfile'

export const INSIGHTS_APP_URL = 'https://wattsight-platform.onrender.com'
export const HANDOFF_REDEEM_PATH = '/api/designer-handoff/redeem'
export const HANDOFF_TIMEOUT_MS = 15000

const TOKEN_RX = /^[A-Za-z0-9._~-]{16,512}$/

export const HANDOFF_NOT_CONFIGURED =
  'Energy Insights handoff is not configured in this Designer build yet. Enter your bill numbers here, or analyse your bill in Energy Insights.'
export const HANDOFF_EXPIRED =
  'This Energy Insights link has expired, was already used, or is not available on your plan. Analyse your bill in Energy Insights again, or enter the numbers below.'
export const HANDOFF_UNREACHABLE =
  'Energy Insights could not be reached. Check your connection, try again from Energy Insights, or enter your bill numbers.'
export const HANDOFF_UNUSABLE =
  'Energy Insights returned bill data this Designer could not use. Enter your numbers below, or try again from Energy Insights.'

export class HandoffError extends Error {
  constructor(message) {
    super(message)
    this.name = 'HandoffError'
  }
}

/** Origin only. Rejects userinfo, paths, queries and hashes so the base cannot smuggle a URL. */
export function trustedInsightsBase(envValue = import.meta.env?.VITE_INSIGHTS_API_BASE) {
  if (typeof envValue !== 'string') return null
  const trimmed = envValue.trim()
  if (!trimmed) return null
  let url
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.username || url.password || url.search || url.hash) return null
  if (url.pathname !== '/' && url.pathname !== '') return null
  const local = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  if (url.protocol !== 'https:' && !local) return null
  return url.origin
}

/**
 * Read `#handoff=` and remove it from the address. Returns the token, or null.
 * `replace` receives the new URL (path + search, no token).
 */
export function extractAndStripHandoffToken(loc, replace) {
  const hash = String(loc?.hash || '')
  const body = hash.startsWith('#') ? hash.slice(1) : hash
  if (!body) return null
  const params = new URLSearchParams(body)
  if (!params.has('handoff')) return null
  const token = params.get('handoff')
  params.delete('handoff')
  const rest = params.toString()
  const path = loc.pathname || '/'
  const search = loc.search || ''
  replace(`${path}${search}${rest ? `#${rest}` : ''}`)
  return token || null
}

let heldToken = null

/** Strip the token from this browser tab as soon as the module is used. */
export function captureHandoffFromBrowser() {
  if (typeof window === 'undefined') return
  heldToken = extractAndStripHandoffToken(window.location, (next) => {
    window.history.replaceState(window.history.state, '', next)
  })
}

/** One-shot read. Clears the in-memory token. */
export function consumeHandoffToken() {
  const token = heldToken
  heldToken = null
  return token
}

function publicMessage(status) {
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 409 || status === 410) {
    return HANDOFF_EXPIRED
  }
  return HANDOFF_UNREACHABLE
}

/**
 * Redeem a capability token. `fetchImpl` is injectable for tests.
 * The token is sent only as JSON `{ token }` to the trusted base.
 */
export async function redeemDesignerHandoff(token, { fetchImpl = fetch, base = trustedInsightsBase(), timeoutMs = HANDOFF_TIMEOUT_MS } = {}) {
  if (!base) throw new HandoffError(HANDOFF_NOT_CONFIGURED)
  if (typeof token !== 'string' || !TOKEN_RX.test(token)) throw new HandoffError(HANDOFF_EXPIRED)

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  let response
  try {
    response = await fetchImpl(`${base}${HANDOFF_REDEEM_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token }),
      credentials: 'omit',
      signal: controller?.signal,
    })
  } catch {
    throw new HandoffError(HANDOFF_UNREACHABLE)
  } finally {
    if (timer) clearTimeout(timer)
  }

  if (!response?.ok) throw new HandoffError(publicMessage(response?.status))

  const declared = Number(response.headers?.get?.('content-length'))
  if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) throw new HandoffError(HANDOFF_UNUSABLE)

  let text
  try {
    text = typeof response.text === 'function' ? await response.text() : ''
  } catch {
    throw new HandoffError(HANDOFF_UNUSABLE)
  }
  if (typeof text !== 'string' || text.length > MAX_FILE_BYTES) throw new HandoffError(HANDOFF_UNUSABLE)

  try {
    return profileFromFileText(text)
  } catch (error) {
    if (error instanceof ProfileError) throw new HandoffError(HANDOFF_UNUSABLE)
    throw new HandoffError(HANDOFF_UNUSABLE)
  }
}
