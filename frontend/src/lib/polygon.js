/*
 * Geometry core for roof outlines and panel placement.
 * All functions work on flat {x, y} points in metres (see geo.js toLocal).
 * No dependencies: roof faces have a handful of vertices, so simple exact
 * algorithms are fast enough and easy to test.
 */

const EPS = 1e-9

export function signedArea(poly) {
  let a = 0
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

export const area = (poly) => Math.abs(signedArea(poly))

/** Counter-clockwise copy of a polygon. */
export function ccw(poly) {
  return signedArea(poly) < 0 ? [...poly].reverse() : [...poly]
}

const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

/** Distance from point p to segment ab. */
export function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** True when segments ab and cd cross or touch. */
export function segmentsIntersect(a, b, c, d) {
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) {
    return true
  }
  const on = (p, q, r) =>
    Math.min(p.x, q.x) - EPS <= r.x && r.x <= Math.max(p.x, q.x) + EPS && Math.min(p.y, q.y) - EPS <= r.y && r.y <= Math.max(p.y, q.y) + EPS
  if (Math.abs(d1) <= EPS && on(c, d, a)) return true
  if (Math.abs(d2) <= EPS && on(c, d, b)) return true
  if (Math.abs(d3) <= EPS && on(a, b, c)) return true
  if (Math.abs(d4) <= EPS && on(a, b, d)) return true
  return false
}

export function segmentDistance(a, b, c, d) {
  if (segmentsIntersect(a, b, c, d)) return 0
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b))
}

/** Even-odd point in polygon (points exactly on an edge may go either way). */
export function pointInPolygon(pt, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

const edges = (poly) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]])

/** Smallest distance between the boundaries of two polygons (0 if they cross). */
export function boundaryDistance(a, b) {
  let best = Infinity
  for (const [p, q] of edges(a)) {
    for (const [r, s] of edges(b)) {
      best = Math.min(best, segmentDistance(p, q, r, s))
      if (best === 0) return 0
    }
  }
  return best
}

/**
 * True when `inner` lies completely inside `outer` with at least `clearance`
 * metres between their boundaries. Works for concave outers: every corner
 * must be inside and no edges may cross or come closer than the clearance.
 */
export function polygonInside(inner, outer, clearance = 0) {
  if (!inner.every((p) => pointInPolygon(p, outer))) return false
  // A concave outer can poke a vertex into the inner shape without any inner corner leaving it.
  if (outer.some((p) => pointInPolygon(p, inner))) return false
  return boundaryDistance(inner, outer) >= clearance - 1e-6
}

/**
 * True when two polygons share area. With `gap` > 0 they also count as
 * overlapping when their boundaries come closer than `gap` metres.
 */
export function polygonsOverlap(a, b, { gap = 0 } = {}) {
  if (a.some((p) => pointInPolygon(p, b)) || b.some((p) => pointInPolygon(p, a))) return true
  if (pointInPolygon(centroidXY(a), b) || pointInPolygon(centroidXY(b), a)) return true
  for (const [p, q] of edges(a)) {
    for (const [r, s] of edges(b)) {
      const d1 = cross(r, s, p)
      const d2 = cross(r, s, q)
      const d3 = cross(p, q, r)
      const d4 = cross(p, q, s)
      if (d1 * d2 < -EPS && d3 * d4 < -EPS) return true
    }
  }
  return gap > 0 ? boundaryDistance(a, b) < gap - 1e-6 : false
}

export function centroidXY(poly) {
  let cx = 0
  let cy = 0
  let a2 = 0
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const f = p.x * q.y - q.x * p.y
    cx += (p.x + q.x) * f
    cy += (p.y + q.y) * f
    a2 += f
  }
  if (Math.abs(a2) < EPS) {
    return { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length }
  }
  return { x: cx / (3 * a2), y: cy / (3 * a2) }
}

/** Sutherland-Hodgman: clip `subject` by a CONVEX `clip` polygon. */
export function clipConvex(subject, clip) {
  let out = [...subject]
  const c = ccw(clip)
  for (let i = 0; i < c.length && out.length; i += 1) {
    const a = c[i]
    const b = c[(i + 1) % c.length]
    const input = out
    out = []
    for (let j = 0; j < input.length; j += 1) {
      const p = input[j]
      const q = input[(j + 1) % input.length]
      const pin = cross(a, b, p) >= -EPS
      const qin = cross(a, b, q) >= -EPS
      if (pin) out.push(p)
      if (pin !== qin) {
        const t = cross(a, b, p) / (cross(a, b, p) - cross(a, b, q))
        out.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) })
      }
    }
  }
  return out
}

/** Approximate shared area of two (possibly concave) polygons, by sampling on a grid. */
export function overlapArea(a, b, step = 0.1) {
  const xs = [...a, ...b].map((p) => p.x)
  const ys = [...a, ...b].map((p) => p.y)
  const x0 = Math.max(Math.min(...a.map((p) => p.x)), Math.min(...b.map((p) => p.x)))
  const x1 = Math.min(Math.max(...a.map((p) => p.x)), Math.max(...b.map((p) => p.x)))
  const y0 = Math.max(Math.min(...a.map((p) => p.y)), Math.min(...b.map((p) => p.y)))
  const y1 = Math.min(Math.max(...a.map((p) => p.y)), Math.max(...b.map((p) => p.y)))
  if (!(x1 > x0 && y1 > y0) || !xs.length || !ys.length) return 0
  let n = 0
  for (let x = x0 + step / 2; x < x1; x += step) {
    for (let y = y0 + step / 2; y < y1; y += step) {
      const p = { x, y }
      if (pointInPolygon(p, a) && pointInPolygon(p, b)) n += 1
    }
  }
  return n * step * step
}

function lineIntersection(p1, d1, p2, d2) {
  const den = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(den) < 1e-12) return null
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den
  return { x: p1.x + t * d1.x, y: p1.y + t * d1.y }
}

/** Remove repeated and collinear vertices. */
export function cleanPolygon(poly, tol = 1e-6) {
  let pts = poly.filter((p, i) => {
    const q = poly[(i + 1) % poly.length]
    return Math.hypot(p.x - q.x, p.y - q.y) > tol
  })
  let changed = true
  while (changed && pts.length > 3) {
    changed = false
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[(i - 1 + pts.length) % pts.length]
      const b = pts[i]
      const c = pts[(i + 1) % pts.length]
      if (Math.abs(cross(a, b, c)) < tol) {
        pts = pts.filter((_, k) => k !== i)
        changed = true
        break
      }
    }
  }
  return pts
}

/**
 * Shrink a simple polygon inward by `d` metres (mitred offset). Edges that
 * vanish are dropped and the offset is repeated, so thin or concave faces
 * shrink sensibly. Returns [] when nothing is left.
 */
export function insetPolygon(poly, d) {
  let src = cleanPolygon(ccw(poly))
  if (d <= 0) return src
  for (let guard = 0; guard < 20 && src.length >= 3; guard += 1) {
    const n = src.length
    const lines = src.map((p, i) => {
      const q = src[(i + 1) % n]
      const len = Math.hypot(q.x - p.x, q.y - p.y)
      const dir = { x: (q.x - p.x) / len, y: (q.y - p.y) / len }
      // Inward normal of a CCW polygon is to the left of each edge.
      return { p: { x: p.x - dir.y * d, y: p.y + dir.x * d }, dir }
    })
    const out = []
    for (let i = 0; i < n; i += 1) {
      const prev = lines[(i - 1 + n) % n]
      const cur = lines[i]
      out.push(lineIntersection(prev.p, prev.dir, cur.p, cur.dir) ?? cur.p)
    }
    // Edge i of the result runs out[i] -> out[i+1]; it must keep its direction.
    const flipped = []
    for (let i = 0; i < n; i += 1) {
      const a = out[i]
      const b = out[(i + 1) % n]
      if ((b.x - a.x) * lines[i].dir.x + (b.y - a.y) * lines[i].dir.y <= 1e-9) flipped.push(i)
    }
    if (!flipped.length) {
      const res = cleanPolygon(out)
      if (res.length < 3 || signedArea(res) <= 1e-6) return []
      return res
    }
    // Drop the shortest collapsing edge and try again.
    const lens = flipped.map((i) => {
      const p = src[i]
      const q = src[(i + 1) % n]
      return Math.hypot(q.x - p.x, q.y - p.y)
    })
    const drop = flipped[lens.indexOf(Math.min(...lens))]
    const next = src.filter((_, k) => k !== (drop + 1) % n)
    src = cleanPolygon(next)
    if (signedArea(src) <= 1e-6) return []
  }
  return []
}

/**
 * For a horizontal band v in [v0, v1], the x-intervals [a, b] where the band
 * lies fully inside the polygon. Exact for simple polygons: interval ends move
 * linearly between vertex heights, so checking the band edges and every vertex
 * height inside the band is enough.
 */
export function bandIntervals(poly, v0, v1) {
  const heights = [v0, v1, ...poly.map((p) => p.y).filter((y) => y > v0 && y < v1)]
  let result = null
  for (const h of heights) {
    const sl = sliceAt(poly, h)
    result = result === null ? sl : intersectIntervals(result, sl)
    if (!result.length) return []
  }
  return result ?? []
}

/** x-intervals of the polygon on the line y = h (nudged off vertex heights). */
export function sliceAt(poly, h) {
  const xs = []
  for (const tweak of [1e-7, -1e-7]) {
    const y = h + tweak
    const cur = []
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      if ((a.y > y) !== (b.y > y)) cur.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y))
    }
    cur.sort((p, q) => p - q)
    const iv = []
    for (let i = 0; i + 1 < cur.length; i += 2) iv.push([cur[i], cur[i + 1]])
    xs.push(iv)
  }
  return intersectIntervals(xs[0], xs[1])
}

export function intersectIntervals(a, b) {
  const out = []
  for (const [a0, a1] of a) {
    for (const [b0, b1] of b) {
      const lo = Math.max(a0, b0)
      const hi = Math.min(a1, b1)
      if (hi > lo) out.push([lo, hi])
    }
  }
  return out.sort((p, q) => p[0] - q[0])
}
