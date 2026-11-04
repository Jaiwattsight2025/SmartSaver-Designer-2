/*
 * Precise roof faces from Google's Solar API dataLayers (D2.1).
 *
 * Input: the DSM (surface height per 0.25 m pixel) and building mask rasters,
 * plus buildingInsights' roof segments (pitch, azimuth, centre, height and box
 * per face). Output: one clean plan polygon per face, in local metres.
 *
 *  1. Building = mask pixels connected to the segment centres.
 *  2. Every building pixel is given to the segment whose plane fits it best
 *     (height + slope), then each plane is re-fitted to its pixels by least
 *     squares and the assignment repeated (a few rounds of k-planes).
 *  3. Each face keeps its main connected region; stray pixels go to the
 *     neighbour whose plane fits them.
 *  4. Each region is traced, simplified and regularised: an edge shared with
 *     another face becomes the exact intersection line of the two planes
 *     (ridge, hip or valley); an outer edge (gutter or barge) is fitted to the
 *     boundary and squared to the house's main direction when it is close.
 *  5. Corners shared between faces are snapped together and any remaining
 *     overlap is cut along the shared line, so faces never overlap.
 *
 * Pure functions on typed arrays - the GeoTIFF loading lives in
 * services/dataLayers.js.
 */
import { area, ccw, cleanPolygon, pointInPolygon } from './polygon'

const RAD = Math.PI / 180

/* ------------------------------------------------------------ raster frame */

/**
 * Pixel frame: continuous pixel coords (u = column, v = row; pixel (i, j)
 * covers [i, i+1] x [j, j+1]) to local metres, as an affine map.
 */
export function makeFrame(affine) {
  const { a, b, c, d, e, f } = affine
  const det = b * f - c * e
  return {
    ...affine,
    toLocal: (u, v) => ({ x: a + b * u + c * v, y: d + e * u + f * v }),
    toPixel: (x, y) => ({ u: (f * (x - a) - c * (y - d)) / det, v: (-e * (x - a) + b * (y - d)) / det }),
    pixelArea: Math.abs(det),
    pixelSize: Math.sqrt(Math.abs(det)),
  }
}

/** Affine frame from three pixel->local correspondences. */
export function frameFromPoints(p00, p10, p01) {
  // p00 = local of (u=0, v=0), p10 = local of (1, 0), p01 = local of (0, 1)
  return makeFrame({
    a: p00.x,
    b: p10.x - p00.x,
    c: p01.x - p00.x,
    d: p00.y,
    e: p10.y - p00.y,
    f: p01.y - p00.y,
  })
}

/* ------------------------------------------------------------- planes */

/** Plane z = h0 + gx * x + gy * y from a Google segment (centre, pitch, azimuth, height). */
export function planeFromSegment({ center, pitchDegrees, azimuthDegrees, heightM }) {
  const t = Math.tan((Number(pitchDegrees) || 0) * RAD)
  const az = (Number(azimuthDegrees) || 0) * RAD
  // Height falls in the azimuth (down-slope) direction.
  const gx = -t * Math.sin(az)
  const gy = -t * Math.cos(az)
  return { h0: heightM - gx * center.x - gy * center.y, gx, gy }
}

export const planeZ = (pl, x, y) => pl.h0 + pl.gx * x + pl.gy * y

export function planePitchAzimuth(pl) {
  const t = Math.hypot(pl.gx, pl.gy)
  const pitch = Math.atan(t) / RAD
  const az = t < 1e-6 ? 0 : (Math.atan2(-pl.gx, -pl.gy) / RAD + 360) % 360
  return { pitchDegrees: pitch, azimuthDegrees: az }
}

/** Least-squares plane through points [{x, y, z}]. */
export function fitPlane(pts) {
  let sx = 0, sy = 0, sz = 0, sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0
  const n = pts.length
  if (n < 3) return null
  for (const p of pts) { sx += p.x; sy += p.y; sz += p.z }
  const mx = sx / n, my = sy / n, mz = sz / n
  for (const p of pts) {
    const x = p.x - mx, y = p.y - my, z = p.z - mz
    sxx += x * x; sxy += x * y; syy += y * y; sxz += x * z; syz += y * z
  }
  const det = sxx * syy - sxy * sxy
  if (Math.abs(det) < 1e-9) return null
  const gx = (sxz * syy - syz * sxy) / det
  const gy = (syz * sxx - sxz * sxy) / det
  return { h0: mz - gx * mx - gy * my, gx, gy }
}

/** The plan line where two planes meet: points p with n . p = c. Null when parallel. */
export function planeIntersectionLine(p1, p2) {
  const nx = p1.gx - p2.gx
  const ny = p1.gy - p2.gy
  const len = Math.hypot(nx, ny)
  if (len < 0.05) return null // slopes within ~3 degrees: no reliable crease
  return { nx: nx / len, ny: ny / len, c: (p2.h0 - p1.h0) / len }
}

/* ------------------------------------------------------------- labelling */

function neighbours4(i, w, h) {
  const x = i % w
  const out = []
  if (x > 0) out.push(i - 1)
  if (x < w - 1) out.push(i + 1)
  if (i >= w) out.push(i - w)
  if (i < w * (h - 1)) out.push(i + w)
  return out
}

function componentFrom(seedIdx, ok, w, h) {
  const seen = new Uint8Array(w * h)
  const out = []
  const stack = seedIdx.filter((i) => ok(i))
  stack.forEach((i) => { seen[i] = 1 })
  while (stack.length) {
    const i = stack.pop()
    out.push(i)
    for (const j of neighbours4(i, w, h)) {
      if (!seen[j] && ok(j)) { seen[j] = 1; stack.push(j) }
    }
  }
  return out
}

/** Local surface gradient (dz/dx, dz/dy in local metres) from a 3x3 window. */
function gradients(dsm, w, h, frame) {
  const gx = new Float32Array(w * h)
  const gy = new Float32Array(w * h)
  // Jacobian of local w.r.t. pixel: [[b, c], [e, f]]; grad_local = inv(J)^T grad_pix.
  const { b, c, e, f } = frame
  const det = b * f - c * e
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x
      const du = (dsm[i - w + 1] + 2 * dsm[i + 1] + dsm[i + w + 1] - dsm[i - w - 1] - 2 * dsm[i - 1] - dsm[i + w - 1]) / 8
      const dv = (dsm[i + w - 1] + 2 * dsm[i + w] + dsm[i + w + 1] - dsm[i - w - 1] - 2 * dsm[i - w] - dsm[i - w + 1]) / 8
      // inv(J) = [[f, -c], [-e, b]] / det ; transpose -> [[f, -e], [-c, b]] / det
      gx[i] = (f * du - e * dv) / det
      gy[i] = (-c * du + b * dv) / det
    }
  }
  return { gx, gy }
}

/**
 * Split the building into faces. `segments`: [{ index, center:{x,y},
 * pitchDegrees, azimuthDegrees, heightM, box:{x0,y0,x1,y1} }] in local metres.
 */
export function labelRoof(raster, segments, opts = {}) {
  const { width: w, height: h, dsm, mask, frame } = raster
  const n = w * h
  const heightTol = opts.heightTolM ?? 0.3
  const slopeTol = opts.slopeTol ?? 0.18
  const boxPad = opts.boxPadM ?? 1.5

  const seeds = segments
    .map((s) => frame.toPixel(s.center.x, s.center.y))
    .map(({ u, v }) => Math.floor(v) * w + Math.floor(u))
    .filter((i) => i >= 0 && i < n)
  const building = new Uint8Array(n)
  // Grow from each centre (and a 1 m neighbourhood, in case a centre sits on a mask gap).
  const near = []
  for (const s of segments) {
    const { u, v } = frame.toPixel(s.center.x, s.center.y)
    const r = Math.ceil(1 / frame.pixelSize)
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        const x = Math.floor(u) + dx
        const y = Math.floor(v) + dy
        if (x >= 0 && y >= 0 && x < w && y < h) near.push(y * w + x)
      }
    }
  }
  for (const i of componentFrom([...seeds, ...near], (i) => mask[i] > 0, w, h)) building[i] = 1

  const { gx, gy } = gradients(dsm, w, h, frame)
  let planes = segments.map((s) => planeFromSegment(s))
  const boxes = segments.map((s) => s.box)
  const label = new Int16Array(n).fill(-1)
  const centres = new Float32Array(2 * n)
  for (let i = 0; i < n; i += 1) {
    const p = frame.toLocal((i % w) + 0.5, Math.floor(i / w) + 0.5)
    centres[2 * i] = p.x
    centres[2 * i + 1] = p.y
  }

  const cost = (k, i) => {
    const x = centres[2 * i]
    const y = centres[2 * i + 1]
    const pl = planes[k]
    const dz = Math.abs(dsm[i] - planeZ(pl, x, y)) / heightTol
    const ds = Math.hypot(gx[i] - pl.gx, gy[i] - pl.gy) / slopeTol
    const bx = boxes[k]
    let out = 0
    if (bx) {
      const ox = Math.max(bx.x0 - boxPad - x, 0, x - bx.x1 - boxPad)
      const oy = Math.max(bx.y0 - boxPad - y, 0, y - bx.y1 - boxPad)
      out = Math.hypot(ox, oy) * 2
    }
    // Slope is noisy right at creases, so it counts less than height.
    return dz * dz + 0.5 * Math.min(ds, 3) ** 2 + out * out
  }

  const assign = () => {
    for (let i = 0; i < n; i += 1) {
      label[i] = -1
      if (!building[i]) continue
      let best = -1
      let bestC = 6
      for (let k = 0; k < planes.length; k += 1) {
        const c = cost(k, i)
        if (c < bestC) { bestC = c; best = k }
      }
      label[i] = best
    }
  }

  const refit = () => {
    planes = planes.map((pl, k) => {
      const pts = []
      for (let i = 0; i < n; i += 1) {
        if (label[i] === k && Math.abs(dsm[i] - planeZ(pl, centres[2 * i], centres[2 * i + 1])) < heightTol) {
          pts.push({ x: centres[2 * i], y: centres[2 * i + 1], z: dsm[i] })
        }
      }
      // Need a real patch (>= ~1.5 m2) to trust a refit; otherwise keep Google's plane.
      if (pts.length * frame.pixelArea < 1.5) return pl
      return fitPlane(pts) ?? pl
    })
  }

  for (let round = 0; round < 3; round += 1) {
    assign()
    refit()
  }
  assign()

  // Majority filter (3x3) to smooth ragged boundaries.
  const smooth = Int16Array.from(label)
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x
      if (!building[i]) continue
      const counts = new Map()
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const l = label[i + dy * w + dx]
        if (l >= 0) counts.set(l, (counts.get(l) ?? 0) + 1)
      }
      let best = label[i]
      let bc = label[i] >= 0 ? counts.get(label[i]) ?? 0 : 0
      for (const [l, c] of counts) if (c > bc + 1) { best = l; bc = c }
      smooth[i] = best
    }
  }
  label.set(smooth)

  // Keep each face's main region (the one nearest its centre if similar in size).
  for (let k = 0; k < planes.length; k += 1) {
    const seen = new Uint8Array(n)
    const comps = []
    for (let i = 0; i < n; i += 1) {
      if (label[i] !== k || seen[i]) continue
      const comp = componentFrom([i], (j) => label[j] === k && !seen[j], w, h)
      comp.forEach((j) => { seen[j] = 1 })
      comps.push(comp)
    }
    if (comps.length < 2) continue
    comps.sort((p, q) => q.length - p.length)
    for (const comp of comps.slice(1)) comp.forEach((j) => { label[j] = -1 })
  }

  // Give unlabelled building pixels to a neighbouring face whose plane fits.
  for (let pass = 0; pass < 6; pass += 1) {
    let changed = 0
    const next = Int16Array.from(label)
    for (let i = 0; i < n; i += 1) {
      if (!building[i] || label[i] >= 0) continue
      let best = -1
      let bestD = 0.45
      for (const j of neighbours4(i, w, h)) {
        const k = label[j]
        if (k < 0) continue
        const d = Math.abs(dsm[i] - planeZ(planes[k], centres[2 * i], centres[2 * i + 1]))
        if (d < bestD) { bestD = d; best = k }
      }
      if (best >= 0) { next[i] = best; changed += 1 }
    }
    label.set(next)
    if (!changed) break
  }

  // Fit statistics.
  // rmsM is robust (1.4826 x median absolute residual): pixels right on the
  // gutter drop away from the plane and should not count against the fit.
  const stats = planes.map((pl, k) => {
    const res = []
    for (let i = 0; i < n; i += 1) {
      if (label[i] !== k) continue
      res.push(Math.abs(dsm[i] - planeZ(pl, centres[2 * i], centres[2 * i + 1])))
    }
    res.sort((a, b) => a - b)
    const cnt = res.length
    return { pixels: cnt, areaM2: cnt * frame.pixelArea, rmsM: cnt ? 1.4826 * res[Math.floor(cnt / 2)] : null }
  })

  return { label, building, planes, stats, centres }
}

/* ------------------------------------------------------------ tracing */

/** Outer boundary of a pixel set as a loop of pixel-corner points (u, v). */
export function traceRegion(inSet, w, h) {
  // Directed boundary edges with the region on the left (CCW in u/v with v down => visually CW; fine).
  const edges = new Map()
  const key = (u, v) => `${u},${v}`
  const add = (u0, v0, u1, v1) => {
    const k = key(u0, v0)
    if (!edges.has(k)) edges.set(k, [])
    edges.get(k).push({ u: u1, v: v1 })
  }
  const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && inSet(y * w + x)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!at(x, y)) continue
      if (!at(x, y - 1)) add(x, y, x + 1, y)
      if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1)
      if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1)
      if (!at(x - 1, y)) add(x, y + 1, x, y)
    }
  }
  let best = []
  const used = new Set()
  for (const [start, outs] of edges) {
    for (let oi = 0; oi < outs.length; oi += 1) {
      if (used.has(`${start}>${oi}`)) continue
      const loop = []
      let [cu, cv] = start.split(',').map(Number)
      let k = start
      let idx = oi
      for (let guard = 0; guard < 4 * w * h; guard += 1) {
        used.add(`${k}>${idx}`)
        loop.push({ u: cu, v: cv })
        const nxt = edges.get(k)[idx]
        cu = nxt.u
        cv = nxt.v
        k = key(cu, cv)
        if (k === start) break
        const cand = edges.get(k) ?? []
        idx = cand.findIndex((_, j) => !used.has(`${k}>${j}`))
        if (idx < 0) break
      }
      if (loop.length > best.length) best = loop
    }
  }
  return best
}

/** Douglas-Peucker on a closed loop. */
export function simplifyLoop(pts, tol) {
  if (pts.length <= 4) return pts
  // Split at the two most distant points.
  let i0 = 0
  let i1 = 0
  let far = -1
  for (let i = 0; i < pts.length; i += 1) {
    const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y)
    if (d > far) { far = d; i1 = i }
  }
  const dp = (seq) => {
    if (seq.length < 3) return seq
    const a = seq[0]
    const b = seq[seq.length - 1]
    let idx = 0
    let dmax = 0
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1e-9
    for (let i = 1; i < seq.length - 1; i += 1) {
      const p = seq[i]
      const d = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len
      if (d > dmax) { dmax = d; idx = i }
    }
    if (dmax <= tol) return [a, b]
    const left = dp(seq.slice(0, idx + 1))
    const right = dp(seq.slice(idx))
    return [...left.slice(0, -1), ...right]
  }
  const first = pts.slice(i0, i1 + 1)
  const second = [...pts.slice(i1), pts[0]]
  const s1 = dp(first)
  const s2 = dp(second)
  return [...s1.slice(0, -1), ...s2.slice(0, -1)]
}

/* ------------------------------------------------------- regularising */

function fitLine(points) {
  const n = points.length
  const mx = points.reduce((s, p) => s + p.x, 0) / n
  const my = points.reduce((s, p) => s + p.y, 0) / n
  let sxx = 0, sxy = 0, syy = 0
  for (const p of points) {
    sxx += (p.x - mx) ** 2
    sxy += (p.x - mx) * (p.y - my)
    syy += (p.y - my) ** 2
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  return { p: { x: mx, y: my }, d: { x: Math.cos(theta), y: Math.sin(theta) } }
}

function intersect(l1, l2) {
  const den = l1.d.x * l2.d.y - l1.d.y * l2.d.x
  if (Math.abs(den) < Math.sin(12 * RAD)) return null
  const t = ((l2.p.x - l1.p.x) * l2.d.y - (l2.p.y - l1.p.y) * l2.d.x) / den
  return { x: l1.p.x + t * l1.d.x, y: l1.p.y + t * l1.d.y }
}

function project(p, l) {
  const t = (p.x - l.p.x) * l.d.x + (p.y - l.p.y) * l.d.y
  return { x: l.p.x + t * l.d.x, y: l.p.y + t * l.d.y }
}

const angleOf = (d) => Math.atan2(d.y, d.x)

/** Rotate a line about its anchor so its direction is a multiple of 90 deg from `axis` (radians) when within `tolDeg`. */
function squareTo(line, axis, tolDeg) {
  const a = angleOf(line.d)
  const rel = ((((a - axis) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2))
  const off = rel > Math.PI / 4 ? rel - Math.PI / 2 : rel
  if (Math.abs(off) > tolDeg * RAD) return line
  const na = a - off
  return { p: line.p, d: { x: Math.cos(na), y: Math.sin(na) } }
}

/** Main direction of the house (radians, mod 90 deg) from the faces' azimuths, weighted by area. */
export function dominantAxis(segments) {
  let sx = 0
  let sy = 0
  for (const s of segments) {
    // Local x = east; a face sloping to azimuth az has its gutter along angle -az (mod 90 the same).
    const a = (90 - (Number(s.azimuthDegrees) || 0)) * RAD
    const wgt = Number(s.areaM2) || 1
    sx += wgt * Math.cos(4 * a)
    sy += wgt * Math.sin(4 * a)
  }
  return Math.atan2(sy, sx) / 4
}

/**
 * Trace and regularise every face. Returns [{ k, polygon:[{x,y}], ... }] in local metres.
 */
export function facePolygons(raster, labelled, segments, opts = {}) {
  const { width: w, height: h, frame } = raster
  const { label, building, planes } = labelled
  const tol = opts.simplifyM ?? 0.35
  const axis = dominantAxis(segments)
  const px = frame.pixelSize
  const labelAt = (x, y) => {
    const { u, v } = frame.toPixel(x, y)
    const cx = Math.floor(u)
    const cy = Math.floor(v)
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) return -2
    const i = cy * w + cx
    return building[i] ? label[i] : -2
  }

  const out = []
  for (let k = 0; k < planes.length; k += 1) {
    const loopUV = traceRegion((i) => label[i] === k, w, h)
    if (loopUV.length < 4) { out.push({ k, polygon: [] }); continue }
    const loop = loopUV.map(({ u, v }) => frame.toLocal(u, v))
    let simp = cleanPolygon(ccw(simplifyLoop(loop, tol)), 1e-6)
    if (simp.length < 3 || area(simp) < 1) { out.push({ k, polygon: [] }); continue }

    // Classify each simplified edge by what lies just outside it.
    const n = simp.length
    const edges = []
    for (let i = 0; i < n; i += 1) {
      const a = simp[i]
      const b = simp[(i + 1) % n]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
      const outward = { x: d.y, y: -d.x } // CCW polygon: outside is on the right
      const votes = new Map()
      const samples = Math.max(3, Math.round(len / 0.25))
      for (let s = 0; s < samples; s += 1) {
        const t = (s + 0.5) / samples
        const q = { x: a.x + t * (b.x - a.x) + outward.x * 1.5 * px, y: a.y + t * (b.y - a.y) + outward.y * 1.5 * px }
        const l = labelAt(q.x, q.y)
        votes.set(l, (votes.get(l) ?? 0) + 1)
      }
      let other = -2
      let best = 0
      for (const [l, c] of votes) if (l !== k && c > best) { best = c; other = l }
      if (best < samples * 0.5) other = -2 // mostly outside the house (or noise): an outer edge
      // Boundary points of the traced loop that belong to this edge.
      const pts = loop.filter((p) => {
        const t = (p.x - a.x) * d.x + (p.y - a.y) * d.y
        const dist = Math.abs((p.x - a.x) * d.y - (p.y - a.y) * d.x)
        return t >= -0.01 && t <= len + 0.01 && dist <= tol + px
      })
      let line = pts.length >= 3 ? fitLine(pts) : { p: a, d }
      if (line.d.x * d.x + line.d.y * d.y < 0) line = { p: line.p, d: { x: -line.d.x, y: -line.d.y } }
      let kind = 'eave'
      if (other >= 0) {
        const L = planeIntersectionLine(planes[k], planes[other])
        if (L) {
          const dir = { x: -L.ny, y: L.nx }
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
          const off = mid.x * L.nx + mid.y * L.ny - L.c
          const cos = Math.abs(dir.x * d.x + dir.y * d.y)
          if (Math.abs(off) < 0.8 && cos > Math.cos(20 * RAD)) {
            const p0 = { x: mid.x - off * L.nx, y: mid.y - off * L.ny }
            line = { p: p0, d: dir.x * d.x + dir.y * d.y >= 0 ? dir : { x: -dir.x, y: -dir.y } }
            kind = 'shared'
          }
        }
        if (kind !== 'shared') kind = 'step'
      }
      if (kind === 'eave' || kind === 'step') line = squareTo(line, axis, 12)
      edges.push({ a, b, len, line, kind, other })
    }

    // Merge consecutive edges on (nearly) the same line.
    const merged = []
    for (const e of edges) {
      const prev = merged[merged.length - 1]
      if (prev && prev.kind === e.kind && prev.other === e.other && Math.abs(prev.line.d.x * e.line.d.y - prev.line.d.y * e.line.d.x) < Math.sin(8 * RAD)) {
        prev.b = e.b
        prev.len += e.len
        if (e.kind !== 'shared') {
          const pts = loop.filter((p) => {
            const dd = prev.line.d
            const dist = Math.abs((p.x - prev.line.p.x) * dd.y - (p.y - prev.line.p.y) * dd.x)
            return dist <= tol + px
          })
          if (pts.length >= 3) {
            let line = fitLine(pts)
            if (line.d.x * prev.line.d.x + line.d.y * prev.line.d.y < 0) line = { p: line.p, d: { x: -line.d.x, y: -line.d.y } }
            prev.line = e.kind === 'eave' || e.kind === 'step' ? squareTo(line, axis, 12) : line
          }
        }
      } else merged.push({ ...e })
    }
    if (merged.length > 2) {
      const f = merged[0]
      const l = merged[merged.length - 1]
      if (f.kind === l.kind && f.other === l.other && Math.abs(f.line.d.x * l.line.d.y - f.line.d.y * l.line.d.x) < Math.sin(8 * RAD)) {
        f.a = l.a
        merged.pop()
      }
    }

    // New corners = where consecutive edge lines cross.
    const m = merged.length
    const poly = []
    for (let i = 0; i < m; i += 1) {
      const prev = merged[(i - 1 + m) % m]
      const cur = merged[i]
      const orig = cur.a
      const x = intersect(prev.line, cur.line)
      if (x && Math.hypot(x.x - orig.x, x.y - orig.y) < 1.5) poly.push(x)
      else {
        poly.push(project(orig, prev.line))
        poly.push(project(orig, cur.line))
      }
    }
    let polygon = cleanPolygon(ccw(poly), 0.05)
    if (polygon.length < 3 || area(polygon) < 1) polygon = simp
    out.push({ k, polygon, edges: merged.map((e) => ({ kind: e.kind, other: e.other })) })
  }
  return out
}

/* ---------------------------------------------- shared corners, overlaps */

/** Snap corners of different faces that are within `tolM` of each other to one point. */
export function snapSharedCorners(faces, tolM = 0.45) {
  const all = []
  faces.forEach((f, fi) => f.polygon.forEach((p, vi) => all.push({ fi, vi, p })))
  const used = new Set()
  for (let i = 0; i < all.length; i += 1) {
    if (used.has(i)) continue
    const group = [i]
    for (let j = i + 1; j < all.length; j += 1) {
      if (used.has(j) || all[j].fi === all[i].fi) continue
      if (group.some((g) => all[g].fi === all[j].fi)) continue
      if (Math.hypot(all[j].p.x - all[i].p.x, all[j].p.y - all[i].p.y) <= tolM) group.push(j)
    }
    if (group.length < 2) continue
    const cx = group.reduce((s, g) => s + all[g].p.x, 0) / group.length
    const cy = group.reduce((s, g) => s + all[g].p.y, 0) / group.length
    for (const g of group) {
      used.add(g)
      faces[all[g].fi].polygon[all[g].vi] = { x: cx, y: cy }
    }
  }
  return faces
}

/** Keep the part of `poly` on the side n.p <= c (or >= when `sign` < 0). Works for any simple polygon. */
export function clipHalfPlane(poly, nx, ny, c, sign = 1) {
  const inside = (p) => sign * (p.x * nx + p.y * ny - c) <= 1e-9
  const out = []
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const pin = inside(p)
    const qin = inside(q)
    if (pin) out.push(p)
    if (pin !== qin) {
      const dp = p.x * nx + p.y * ny - c
      const dq = q.x * nx + q.y * ny - c
      const t = dp / (dp - dq)
      out.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) })
    }
  }
  return cleanPolygon(out, 1e-6)
}

function sampledOverlap(a, b, step = 0.1) {
  const x0 = Math.max(Math.min(...a.map((p) => p.x)), Math.min(...b.map((p) => p.x)))
  const x1 = Math.min(Math.max(...a.map((p) => p.x)), Math.max(...b.map((p) => p.x)))
  const y0 = Math.max(Math.min(...a.map((p) => p.y)), Math.min(...b.map((p) => p.y)))
  const y1 = Math.min(Math.max(...a.map((p) => p.y)), Math.max(...b.map((p) => p.y)))
  if (!(x1 > x0 && y1 > y0)) return 0
  let cnt = 0
  for (let x = x0 + step / 2; x < x1; x += step) {
    for (let y = y0 + step / 2; y < y1; y += step) {
      if (pointInPolygon({ x, y }, a) && pointInPolygon({ x, y }, b)) cnt += 1
    }
  }
  return cnt * step * step
}

/**
 * Remove overlaps between faces: cut each overlapping pair along the line
 * where their planes meet (each keeps its own side). When that would cut a
 * face badly (a bent face), the smaller overlap is given to the face whose
 * plane fits there instead, by cutting along the overlap's mid-line.
 */
export function removeOverlaps(faces, planes, labelled, raster) {
  const { frame } = raster
  const pixelCentres = (k) => {
    const pts = []
    const { label, centres } = labelled
    for (let i = 0; i < label.length; i += 1) if (label[i] === k) pts.push({ x: centres[2 * i], y: centres[2 * i + 1] })
    return pts
  }
  const cache = new Map()
  const pix = (k) => {
    if (!cache.has(k)) cache.set(k, pixelCentres(k))
    return cache.get(k)
  }
  const residual = []
  for (let i = 0; i < faces.length; i += 1) {
    for (let j = i + 1; j < faces.length; j += 1) {
      const A = faces[i]
      const B = faces[j]
      if (A.polygon.length < 3 || B.polygon.length < 3) continue
      if (sampledOverlap(A.polygon, B.polygon, 0.15) < 0.05) continue
      const L = planeIntersectionLine(planes[A.k], planes[B.k])
      let done = false
      if (L) {
        // Which side is A on? Use A's pixels.
        const pa = pix(A.k)
        const sideA = pa.reduce((s, p) => s + Math.sign(p.x * L.nx + p.y * L.ny - L.c), 0) <= 0 ? 1 : -1
        const lossA = pa.filter((p) => sideA * (p.x * L.nx + p.y * L.ny - L.c) > 0.15).length / Math.max(pa.length, 1)
        const pb = pix(B.k)
        const lossB = pb.filter((p) => -sideA * (p.x * L.nx + p.y * L.ny - L.c) > 0.15).length / Math.max(pb.length, 1)
        if (lossA < 0.08 && lossB < 0.08) {
          const na = clipHalfPlane(A.polygon, L.nx, L.ny, L.c, sideA)
          const nb = clipHalfPlane(B.polygon, L.nx, L.ny, L.c, -sideA)
          if (na.length >= 3 && nb.length >= 3) {
            A.polygon = na
            B.polygon = nb
            done = true
          }
        }
      }
      if (!done) {
        // Fallback: separating line through the overlap, perpendicular to the line between the faces' pixel centres.
        const ca = mean(pix(A.k))
        const cb = mean(pix(B.k))
        if (!ca || !cb) continue
        let nx = cb.x - ca.x
        let ny = cb.y - ca.y
        const len = Math.hypot(nx, ny) || 1
        nx /= len
        ny /= len
        const over = A.polygon.filter((p) => pointInPolygon(p, B.polygon)).concat(B.polygon.filter((p) => pointInPolygon(p, A.polygon)))
        const mid = over.length ? mean(over) : { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 }
        const c = mid.x * nx + mid.y * ny
        const na = clipHalfPlane(A.polygon, nx, ny, c, 1)
        const nb = clipHalfPlane(B.polygon, nx, ny, c, -1)
        if (na.length >= 3 && nb.length >= 3 && area(na) > 0.6 * area(A.polygon) && area(nb) > 0.6 * area(B.polygon)) {
          A.polygon = na
          B.polygon = nb
        } else residual.push([A.k, B.k])
      }
    }
  }
  void frame
  return residual
}

function mean(pts) {
  if (!pts.length) return null
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length }
}

/* --------------------------------------------------------- quality */

/** How well a polygon matches its pixels: IoU and share of the polygon on the building. */
export function polygonQuality(polygon, k, labelled, raster) {
  const { label, building, centres } = labelled
  const { frame, width: w, height: h } = raster
  if (polygon.length < 3) return { iou: 0, onBuilding: 0 }
  let inter = 0
  let regionCount = 0
  let polyCount = 0
  let polyOnBuilding = 0
  for (let i = 0; i < label.length; i += 1) {
    const inR = label[i] === k
    const p = { x: centres[2 * i], y: centres[2 * i + 1] }
    const inP = pointInPolygon(p, polygon)
    if (inR) regionCount += 1
    if (inP) {
      polyCount += 1
      if (building[i]) polyOnBuilding += 1
      if (inR) inter += 1
    }
  }
  void frame
  void w
  void h
  const union = regionCount + polyCount - inter
  return { iou: union ? inter / union : 0, onBuilding: polyCount ? polyOnBuilding / polyCount : 0 }
}

/* ------------------------------------------------------------ adjacency */

/**
 * Which faces touch, and how. For every pair of labelled pixels of different
 * faces within `reachPx` of each other (so a thin unlabelled crease or gutter
 * does not split them), compare the two faces' planes at that spot: a ridge,
 * hip or valley has the planes meeting (small step); a wall between a lower
 * and upper roof shows as a height step. Returns
 * [{ a, b, contacts, stepM (median plane gap), lenM (shared edge length) }]
 * with a < b as face indices k.
 */
export function faceAdjacency(labelled, raster, { reachPx = 2 } = {}) {
  const { label, planes, centres } = labelled
  const { width: w, height: h, frame } = raster
  const pairs = new Map()
  const offs = []
  for (let dy = 0; dy <= reachPx; dy += 1) {
    for (let dx = -reachPx; dx <= reachPx; dx += 1) {
      if (dy === 0 && dx <= 0) continue
      if (dx * dx + dy * dy <= reachPx * reachPx) offs.push([dx, dy])
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      const a = label[i]
      if (a < 0) continue
      for (const [dx, dy] of offs) {
        const xx = x + dx
        const yy = y + dy
        if (xx < 0 || xx >= w || yy >= h) continue
        const j = yy * w + xx
        const b = label[j]
        if (b < 0 || b === a) continue
        const k0 = Math.min(a, b)
        const k1 = Math.max(a, b)
        const key = k0 * 65536 + k1
        let e = pairs.get(key)
        if (!e) { e = { a: k0, b: k1, steps: [], cells: new Set() }; pairs.set(key, e) }
        const mx = (centres[2 * i] + centres[2 * j]) / 2
        const my = (centres[2 * i + 1] + centres[2 * j + 1]) / 2
        e.steps.push(Math.abs(planeZ(planes[a], mx, my) - planeZ(planes[b], mx, my)))
        e.cells.add(i)
      }
    }
  }
  return [...pairs.values()].map((e) => {
    e.steps.sort((p, q) => p - q)
    return {
      a: e.a,
      b: e.b,
      contacts: e.steps.length,
      stepM: e.steps[Math.floor(e.steps.length / 2)],
      lenM: e.cells.size * frame.pixelSize,
    }
  })
}

/**
 * Whole pipeline. `segments` as for labelRoof. Returns per segment:
 * { index, polygon (local metres, CCW), confidence, metrics }.
 */
export function roofFacesFromDsm(raster, segments, opts = {}) {
  const labelled = labelRoof(raster, segments, opts)
  const faces = facePolygons(raster, labelled, segments, opts)
  snapSharedCorners(faces, opts.snapM ?? 0.45)
  const residual = removeOverlaps(faces, labelled.planes, labelled, raster)
  return {
    planes: labelled.planes,
    residualOverlaps: residual,
    adjacency: faceAdjacency(labelled, raster).map((e) => ({ ...e, a: segments[e.a].index, b: segments[e.b].index })),
    faces: faces.map((f) => {
      const st = labelled.stats[f.k]
      const q = polygonQuality(f.polygon, f.k, labelled, raster)
      const polyArea = f.polygon.length >= 3 ? area(f.polygon) : 0
      let confidence = 'none'
      if (polyArea >= 1) {
        confidence = 'low'
        if (q.iou >= 0.7 && q.onBuilding >= 0.85) confidence = 'medium'
        if (q.iou >= 0.8 && q.onBuilding >= 0.92 && (st.rmsM ?? 1) <= 0.15 && st.areaM2 >= 2) confidence = 'high'
        // Far bigger or smaller than Google's own area for this face: something else got merged in (or lost).
        const googleArea = Number(segments[f.k].areaM2) || 0
        const ratio = googleArea > 0 ? polyArea / googleArea : 1
        if (confidence === 'high' && (ratio > 1.6 || ratio < 0.6)) confidence = 'medium'
      }
      const fitted = planePitchAzimuth(labelled.planes[f.k])
      return {
        index: segments[f.k].index,
        polygon: f.polygon,
        confidence,
        metrics: {
          planAreaM2: polyArea,
          pixelAreaM2: st.areaM2,
          rmsM: st.rmsM,
          iou: q.iou,
          onBuilding: q.onBuilding,
          fittedPitch: fitted.pitchDegrees,
          fittedAzimuth: fitted.azimuthDegrees,
        },
        edges: f.edges ?? [],
      }
    }),
  }
}
