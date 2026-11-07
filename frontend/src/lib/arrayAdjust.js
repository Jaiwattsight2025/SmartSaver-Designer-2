/*
 * In-plane array alignment. This moves or rotates the panel drawing on the
 * roof. It does not change roof azimuth, pitch, or the panel's mounting
 * normal, so it must not change the annual-yield model.
 *
 * dxM is metres across the gutter (face u). dyM is metres down the slope
 * (face v). rotationDeg is clockwise in that same plane.
 */
import { pointInPolygon, polygonInside, polygonsOverlap } from './polygon'

const RAD = Math.PI / 180

export function wrapDegrees(deg) {
  const n = Number(deg)
  if (!Number.isFinite(n)) return 0
  return Math.round((((n % 360) + 360) % 360) * 10) / 10
}

function uvCentroid(polys) {
  const pts = polys.flat()
  if (!pts.length) return null
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  }
}

/** Rotate then translate copies of the panel UV polygons. */
export function transformUv(polys, { dxM = 0, dyM = 0, rotationDeg = 0 } = {}) {
  const c = uvCentroid(polys)
  if (!c) return []
  const a = (Number(rotationDeg) || 0) * RAD
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const dx = Number(dxM) || 0
  const dy = Number(dyM) || 0
  return polys.map((poly) =>
    poly.map((q) => {
      const x = q.x - c.x
      const y = q.y - c.y
      return { x: x * cos - y * sin + c.x + dx, y: x * sin + y * cos + c.y + dy }
    }),
  )
}

function edgeClearance(p, poly) {
  let best = Infinity
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0
    t = Math.max(0, Math.min(1, t))
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)))
  }
  return best
}

/**
 * A point inside `poly` that sits as far from the boundary as a coarse
 * sample allows. The polygon centroid is used only when it is actually inside.
 * Concave roofs often have a centroid in the notch, which is not a valid centre.
 */
export function interiorPoint(poly) {
  if (!poly || poly.length < 3) return null
  const c = {
    x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
    y: poly.reduce((s, p) => s + p.y, 0) / poly.length,
  }
  const xs = poly.map((p) => p.x)
  const ys = poly.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  let best = pointInPolygon(c, poly) ? { ...c, score: edgeClearance(c, poly) } : null
  const n = 16
  for (let i = 0; i <= n; i += 1) {
    for (let j = 0; j <= n; j += 1) {
      const p = { x: minX + ((maxX - minX) * i) / n, y: minY + ((maxY - minY) * j) / n }
      if (!pointInPolygon(p, poly)) continue
      const score = edgeClearance(p, poly)
      if (!best || score > best.score) best = { ...p, score }
    }
  }
  return best ? { x: best.x, y: best.y } : null
}

/**
 * Next in-plane rotation of a whole group. Roof azimuth is not involved.
 * The angle stays in 0–360. One degree is the fine step; five is the coarse step.
 */
export function stepInPlaneRotation(current, deltaDeg) {
  const base = current ?? {}
  return {
    dxM: Number(base.dxM) || 0,
    dyM: Number(base.dyM) || 0,
    rotationDeg: wrapDegrees((Number(base.rotationDeg) || 0) + (Number(deltaDeg) || 0)),
  }
}

/** Why a transformed array is rejected, or ''. `clearance` is the setback from `outer`. */
export function rejectionReason(polys, outer, obstacles = [], clearance = 0) {
  if (!outer || outer.length < 3) return 'The setback leaves no room on this face.'
  for (const poly of polys) {
    if (!polygonInside(poly, outer, clearance)) return 'A panel would cross the roof edge or the setback.'
    for (const ob of obstacles) {
      if (ob?.length >= 3 && polygonsOverlap(poly, ob, { gap: 0 })) return 'A panel would sit on a no-go area.'
    }
  }
  for (let i = 0; i < polys.length; i += 1) {
    for (let j = i + 1; j < polys.length; j += 1) {
      if (polygonsOverlap(polys[i], polys[j], { gap: 0.01 })) return 'Panels in the array would overlap.'
    }
  }
  return ''
}

/**
 * Translation that parks the array's centre on a valid interior point,
 * keeping any in-plane rotation already in `adjust`.
 */
export function centreAdjust(polys, inner, adjust = {}) {
  const target = interiorPoint(inner)
  if (!target) return { ok: false, reason: 'No point inside the setback can be used as a centre.' }
  const spun = transformUv(polys, { rotationDeg: adjust.rotationDeg || 0 })
  const c = uvCentroid(spun)
  if (!c) return { ok: false, reason: 'This face has no panels to centre.' }
  const next = {
    dxM: target.x - c.x,
    dyM: target.y - c.y,
    rotationDeg: Number(adjust.rotationDeg) || 0,
  }
  const moved = transformUv(polys, next)
  const outer = adjust.outer && adjust.outer.length >= 3 ? adjust.outer : inner
  const clearance = outer === inner ? 0 : Number(adjust.clearance) || 0
  const reason = rejectionReason(moved, outer, [], clearance)
  if (reason) return { ok: false, reason: `No centred fit keeps every panel inside the setback. ${reason}` }
  return { ok: true, adjust: next, reason: '' }
}

export function checkAdjust(polys, outer, obstacles, adjust, clearance = 0) {
  const moved = transformUv(polys, adjust)
  const reason = rejectionReason(moved, outer, obstacles, clearance)
  return reason ? { ok: false, reason, uv: null } : { ok: true, reason: '', uv: moved }
}
