/*
 * UTM <-> lat/lng (WGS84), used to place Google's dataLayers GeoTIFF pixels
 * (which come in a UTM zone, e.g. EPSG:32755 = zone 55 south) on the map.
 * Standard Transverse Mercator series (Snyder, USGS PP 1395); sub-millimetre
 * over a house-sized area, which is all we need.
 */
const A = 6378137
const F = 1 / 298.257223563
const E2 = F * (2 - F)
const EP2 = E2 / (1 - E2)
const K0 = 0.9996
const RAD = Math.PI / 180

/** Zone and hemisphere from an EPSG code (326xx north, 327xx south). Null if not UTM. */
export function utmZoneFromEpsg(epsg) {
  const code = Number(epsg)
  if (code > 32600 && code <= 32660) return { zone: code - 32600, south: false }
  if (code > 32700 && code <= 32760) return { zone: code - 32700, south: true }
  return null
}

export function utmToLatLng(easting, northing, zone, south) {
  const x = easting - 500000
  const y = south ? northing - 10000000 : northing
  const lon0 = ((zone - 1) * 6 - 180 + 3) * RAD
  const m = y / K0
  const mu = m / (A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 ** 3) / 256))
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2))
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu)
  const s = Math.sin(phi1)
  const c = Math.cos(phi1)
  const t = Math.tan(phi1)
  const n1 = A / Math.sqrt(1 - E2 * s * s)
  const r1 = (A * (1 - E2)) / (1 - E2 * s * s) ** 1.5
  const c1 = EP2 * c * c
  const t1 = t * t
  const d = x / (n1 * K0)
  const lat =
    phi1 -
    ((n1 * t) / r1) *
      ((d * d) / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) * d ** 6) / 720)
  const lng =
    lon0 +
    (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * d ** 5) / 120) / c
  return { lat: lat / RAD, lng: lng / RAD }
}

export function latLngToUtm(latDeg, lngDeg, zone, south) {
  const phi = latDeg * RAD
  const lon0 = ((zone - 1) * 6 - 180 + 3) * RAD
  const s = Math.sin(phi)
  const c = Math.cos(phi)
  const t = Math.tan(phi)
  const n = A / Math.sqrt(1 - E2 * s * s)
  const tt = t * t
  const cc = EP2 * c * c
  const a = c * (lngDeg * RAD - lon0)
  const m =
    A *
    ((1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 ** 3) / 256) * phi -
      ((3 * E2) / 8 + (3 * E2 * E2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * E2 * E2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * E2 ** 3) / 3072) * Math.sin(6 * phi))
  const easting =
    K0 * n * (a + ((1 - tt + cc) * a ** 3) / 6 + ((5 - 18 * tt + tt * tt + 72 * cc - 58 * EP2) * a ** 5) / 120) + 500000
  let northing =
    K0 *
    (m +
      n * t * ((a * a) / 2 + ((5 - tt + 9 * cc + 4 * cc * cc) * a ** 4) / 24 + ((61 - 58 * tt + tt * tt + 600 * cc - 330 * EP2) * a ** 6) / 720))
  if (south) northing += 10000000
  return { easting, northing }
}
