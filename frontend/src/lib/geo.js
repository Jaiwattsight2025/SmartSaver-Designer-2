// Small flat-earth helpers. Accurate to well under 1% over a house-sized area.
const R = 6378137
const RAD = Math.PI / 180

export const lat = (p) => Number(p.lat ?? p.latitude)
export const lng = (p) => Number(p.lng ?? p.longitude)

export function toLatLng(p) {
  if (!p) return null
  const la = lat(p)
  const ln = lng(p)
  return Number.isFinite(la) && Number.isFinite(ln) ? { lat: la, lng: ln } : null
}

/** Metres east (x) / north (y) of origin. */
export function toLocal(origin, p) {
  return {
    x: (lng(p) - lng(origin)) * RAD * R * Math.cos(lat(origin) * RAD),
    y: (lat(p) - lat(origin)) * RAD * R,
  }
}

export function fromLocal(origin, { x, y }) {
  return {
    lat: lat(origin) + y / R / RAD,
    lng: lng(origin) + x / (R * Math.cos(lat(origin) * RAD)) / RAD,
  }
}

/** Point `distance` metres from `origin` on compass heading (deg clockwise from north). */
export function offset(origin, distance, headingDeg) {
  const h = headingDeg * RAD
  return fromLocal(origin, { x: distance * Math.sin(h), y: distance * Math.cos(h) })
}

export function polygonAreaXY(points) {
  let a = 0
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]
    const q = points[(i + 1) % points.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a) / 2
}

/** Plan (ground) area of a lat/lng polygon, m². */
export function planAreaM2(latLngs) {
  if (!latLngs || latLngs.length < 3) return 0
  const o = latLngs[0]
  return polygonAreaXY(latLngs.map((p) => toLocal(o, p)))
}

export function centroid(latLngs) {
  const n = latLngs.length || 1
  return {
    lat: latLngs.reduce((s, p) => s + lat(p), 0) / n,
    lng: latLngs.reduce((s, p) => s + lng(p), 0) / n,
  }
}

export function pointInPolygonXY(pt, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

/** Andrew's monotone chain convex hull on {x,y}. */
export function convexHullXY(points) {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (pts.length < 3) return pts
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  upper.pop()
  lower.pop()
  return lower.concat(upper)
}

/**
 * Corners of a panel rectangle, as Google's Solar API sample draws them:
 * width x height (m) centred on `center`, turned to the roof azimuth
 * (+90 deg when the panel is PORTRAIT).
 */
export function panelCorners(center, widthM, heightM, azimuthDeg, portrait = false) {
  const w = widthM / 2
  const h = heightM / 2
  const turn = (portrait ? 90 : 0) + azimuthDeg
  return [
    { x: w, y: h },
    { x: w, y: -h },
    { x: -w, y: -h },
    { x: -w, y: h },
  ].map(({ x, y }) => offset(center, Math.hypot(x, y), (Math.atan2(y, x) * 180) / Math.PI + turn))
}
