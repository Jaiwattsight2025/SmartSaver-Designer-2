/*
 * Google Solar API dataLayers: the 3D surface (DSM) and building mask around a
 * locked property. Mindful of cost: one dataLayers call per locked building,
 * cached in memory and in localStorage (30 days, last few buildings only), and
 * in-flight requests are shared.
 */
import { fromArrayBuffer } from 'geotiff'

const ENDPOINT = 'https://solar.googleapis.com/v1/dataLayers:get'
const PIXEL_M = 0.25
const CACHE_PREFIX = 'ssd.dataLayers.v1.'
const CACHE_DAYS = 30
const CACHE_MAX = 6
const memory = new Map()

function getApiKey() {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()
  if (!key) throw new Error('VITE_GOOGLE_MAPS_API_KEY is missing from the frontend .env.local file.')
  return key
}

const toRad = (d) => (d * Math.PI) / 180

/** Radius (m) that covers the building's bounding box plus a margin. */
export function layersRadius(insights) {
  const sw = insights?.boundingBox?.sw
  const ne = insights?.boundingBox?.ne
  if (!sw || !ne) return 30
  const midLat = toRad((sw.latitude + ne.latitude) / 2)
  const dy = (ne.latitude - sw.latitude) * 111320
  const dx = (ne.longitude - sw.longitude) * 111320 * Math.cos(midLat)
  return Math.min(60, Math.max(15, Math.hypot(dx, dy) / 2 + 8))
}

export function cacheKey(insights) {
  const c = insights?.center
  const id = insights?.name ?? ''
  return `${id}|${Number(c?.latitude).toFixed(6)},${Number(c?.longitude).toFixed(6)}`
}

function b64(buf) {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
function unb64(str) {
  const s = atob(str)
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i += 1) bytes[i] = s.charCodeAt(i)
  return bytes.buffer
}

const store = () => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function readCache(key) {
  try {
    const raw = store()?.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const j = JSON.parse(raw)
    if (!j.savedAt || Date.now() - j.savedAt > CACHE_DAYS * 864e5) {
      store().removeItem(CACHE_PREFIX + key)
      return null
    }
    return { ...j, dsm: new Float32Array(unb64(j.dsm)), mask: new Uint8Array(unb64(j.mask)), fromCache: true }
  } catch {
    return null
  }
}

function writeCache(key, layers) {
  const ls = store()
  if (!ls) return
  try {
    // Keep only the most recent few buildings.
    const old = []
    for (let i = 0; i < ls.length; i += 1) {
      const k = ls.key(i)
      if (k?.startsWith(CACHE_PREFIX)) old.push([k, JSON.parse(ls.getItem(k))?.savedAt ?? 0])
    }
    old.sort((a, b) => a[1] - b[1])
    while (old.length >= CACHE_MAX) ls.removeItem(old.shift()[0])
    const { dsm, mask, ...rest } = layers
    ls.setItem(CACHE_PREFIX + key, JSON.stringify({ ...rest, savedAt: Date.now(), dsm: b64(dsm.buffer), mask: b64(mask.buffer) }))
  } catch {
    // Storage full or unavailable: the in-memory cache still holds it.
  }
}

async function decodeTiff(url, key) {
  const res = await fetch(`${url}&key=${encodeURIComponent(key)}`)
  if (!res.ok) throw new Error(`Roof data download failed (HTTP ${res.status}).`)
  const tiff = await fromArrayBuffer(await res.arrayBuffer())
  const image = await tiff.getImage()
  const [band] = await image.readRasters()
  const [originE, originN] = image.getOrigin()
  const [resM] = image.getResolution()
  const geo = image.getGeoKeys?.() ?? image.geoKeys ?? {}
  return {
    band,
    width: image.getWidth(),
    height: image.getHeight(),
    originE,
    originN,
    resM: Math.abs(resM),
    epsg: geo.ProjectedCSTypeGeoKey,
  }
}

async function requestLayers(insights) {
  const key = getApiKey()
  const url = new URL(ENDPOINT)
  url.searchParams.set('location.latitude', String(insights.center.latitude))
  url.searchParams.set('location.longitude', String(insights.center.longitude))
  url.searchParams.set('radiusMeters', String(Math.round(layersRadius(insights))))
  url.searchParams.set('view', 'IMAGERY_LAYERS')
  url.searchParams.set('requiredQuality', insights.imageryQuality === 'BASE' ? 'BASE' : 'MEDIUM')
  url.searchParams.set('pixelSizeMeters', String(PIXEL_M))
  url.searchParams.set('key', key)

  const res = await fetch(url)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error?.message?.split(key).join('[KEY]') || `3D roof data request failed (HTTP ${res.status}).`)
  if (!body?.dsmUrl || !body?.maskUrl) throw new Error('Google returned no 3D roof data for this building.')

  const [dsm, mask] = await Promise.all([decodeTiff(body.dsmUrl, key), decodeTiff(body.maskUrl, key)])
  if (dsm.width !== mask.width || dsm.height !== mask.height) throw new Error('3D roof data layers do not line up.')
  return {
    width: dsm.width,
    height: dsm.height,
    originE: dsm.originE,
    originN: dsm.originN,
    resM: dsm.resM,
    epsg: dsm.epsg,
    imageryQuality: body.imageryQuality,
    imageryDate: body.imageryDate,
    dsm: Float32Array.from(dsm.band),
    mask: Uint8Array.from(mask.band, (v) => (v > 0 ? 1 : 0)),
  }
}

/** DSM + mask for the building in `insights` (one paid call per building, then cached). */
export function getRoofLayers(insights) {
  if (!insights?.center) return Promise.reject(new Error('No building to fetch 3D roof data for.'))
  const key = cacheKey(insights)
  if (memory.has(key)) return memory.get(key)
  const cached = readCache(key)
  if (cached) {
    const p = Promise.resolve(cached)
    memory.set(key, p)
    return p
  }
  const p = requestLayers(insights).then(
    (layers) => {
      writeCache(key, layers)
      return layers
    },
    (err) => {
      memory.delete(key) // let a later lock retry
      throw err
    },
  )
  memory.set(key, p)
  return p
}

/** Test hook. */
export function clearRoofLayerCache() {
  memory.clear()
}
