/*
 * Panel layout (D2).
 *
 * Each included roof face is filled on its own grid:
 *   - the outline is shrunk by the edge setback (default 0.4 m),
 *   - rows start at the gutter and run up the roof, lined up with the gutter,
 *   - panels are portrait or landscape, with the chosen module's real size,
 *     foreshortened by the roof pitch (what you see from above),
 *   - every panel is then checked exactly: fully inside the outline with the
 *     setback all round, clear of no-go areas, and not overlapping panels on
 *     neighbouring faces.
 * Google's panel data is used only to rank spots and estimate yield; it no
 * longer decides where panels go.
 */
import {
  DC_TO_AC_DERATE,
  DEFAULT_PANEL_ORIENTATION,
  MAX_ADDED_PANEL_SNAP_M,
  MAX_RESIDENTIAL_KW,
  MIN_PANELS_PER_FACE,
  MIN_PANELS_PER_FACE_SMALL,
  MODULE_DIMENSIONS_BY_WATTS,
  MODULE_HEIGHT_M,
  MODULE_WIDTH_M,
  OBSTACLE_CLEARANCE_M,
  PANEL_GAP_M,
  ROOF_EDGE_SETBACK_M,
  ROW_GAP_M,
  SMALL_SYSTEM_PANELS,
  FLAT_ROOF_MAX_PITCH_DEG,
  TILT_FRAME_DEG,
  WINTER_NOON_SUN_DEG,
} from '../config/designerConfig'
import { centroid, fromLocal, toLatLng, toLocal } from './geo'
import { bandIntervals, ccw, insetPolygon, polygonInside, polygonsOverlap } from './polygon'
import { faceAxes, fromFaceUV, toFaceUV } from './roofOutline'
import { googlePanelSize } from './roofFaces'
import { stateYield } from './energyModel'

const RAD = Math.PI / 180

/** [ASSUMPTION] Output vs the state average for a roof's pitch and direction (southern hemisphere: north is best). */
export function orientationFactor(pitchDegrees, azimuthDegrees) {
  const p = (Number(pitchDegrees) || 0) * RAD
  const a = (Number(azimuthDegrees) || 0) * RAD
  return 0.92 + 0.3 * Math.sin(p) * Math.cos(a) - 0.06 * (1 - Math.cos(p))
}

/** Module size in metres for a wattage ([ASSUMPTION] typical datasheet sizes). */
export function moduleSize(watts) {
  return MODULE_DIMENSIONS_BY_WATTS[watts] ?? { widthM: MODULE_WIDTH_M, heightM: MODULE_HEIGHT_M }
}

/**
 * How panels sit on a face. Pitched roofs: flush, following the roof.
 * Flat roofs (under FLAT_ROOF_MAX_PITCH_DEG): on tilt frames facing north, with
 * rows spaced so one row does not shade the next at winter noon.
 */
export function mountFor(face) {
  const pitch = Number(face?.pitchDegrees) || 0
  if (pitch < FLAT_ROOF_MAX_PITCH_DEG) return { flat: true, tiltDeg: TILT_FRAME_DEG, azimuthDeg: 0 }
  return { flat: false, tiltDeg: pitch, azimuthDeg: Number(face?.azimuthDegrees) || 0 }
}

/** Output gain of a tilt frame over Google's flush-mounted estimate on a flat face (1 for pitched faces). */
export function tiltFrameGain(face) {
  const m = mountFor(face)
  if (!m.flat) return 1
  const flush = orientationFactor(face.pitchDegrees, face.azimuthDegrees)
  return flush > 0 ? orientationFactor(m.tiltDeg, m.azimuthDeg) / flush : 1
}

/** Gap needed behind a tilted row of slope length `lengthM` so it does not shade the next row at winter noon. */
export function tiltRowShadowGapM(lengthM, tiltDeg = TILT_FRAME_DEG, sunDeg = WINTER_NOON_SUN_DEG) {
  return (lengthM * Math.sin(tiltDeg * RAD)) / Math.tan(sunDeg * RAD)
}

/** Panel footprint seen from above: `across` along the gutter, `down` up/down the slope. */
export function panelFootprint(face, { widthM, heightM, orientation }) {
  const m = mountFor(face)
  const cosP = Math.cos((m.flat ? m.tiltDeg : Number(face.pitchDegrees) || 0) * RAD)
  const landscape = String(orientation).toLowerCase() === 'landscape'
  const slope = landscape ? widthM : heightM
  return {
    across: landscape ? heightM : widthM,
    down: slope * cosP,
    shadowGapM: m.flat ? tiltRowShadowGapM(slope, m.tiltDeg) : 0,
  }
}

/**
 * A face's own flat frame: u along the gutter, v down the slope (gutter =
 * largest v). The gutter direction comes from the outline edge that faces
 * down-slope, so rows line up with the drawn gutter even if the azimuth is
 * a degree or two off.
 */
export function faceFrame(face) {
  const origin = toLatLng(face.center) ?? centroid(face.vertices)
  const xy = ccw(face.vertices.map((v) => toLocal(origin, toLatLng(v))))
  const az = faceAxes(mountFor(face).azimuthDeg) // flat roofs: rows face north
  let best = null
  for (let i = 0; i < xy.length; i += 1) {
    const a = xy[i]
    const b = xy[(i + 1) % xy.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 0.5) continue
    const n = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len } // outward normal (CCW)
    const dot = n.x * az.down.x + n.y * az.down.y
    if (dot < Math.cos(25 * RAD)) continue
    const score = dot * len
    if (!best || score > best.score) best = { score, n }
  }
  const axes = best ? { down: best.n, across: { x: best.n.y, y: -best.n.x } } : az
  const poly = ccw(xy.map((p) => toFaceUV(p, axes)))
  return { origin, axes, poly, toLatLng: (q) => fromLocal(origin, fromFaceUV(q, axes)) }
}

function layoutOpts(opts = {}) {
  const size = opts.widthM && opts.heightM ? { widthM: opts.widthM, heightM: opts.heightM } : moduleSize(opts.moduleWatts)
  return {
    ...size,
    orientation: opts.orientation ?? DEFAULT_PANEL_ORIENTATION,
    gapM: opts.gapM ?? PANEL_GAP_M,
    rowGapM: opts.rowGapM ?? ROW_GAP_M,
    setbackM: opts.setbackM ?? ROOF_EDGE_SETBACK_M,
  }
}

/**
 * Every spot a panel fits on one face (gutter-aligned grid, strict checks).
 * Returns { cells, frame, grid } where each cell has id, row, col, center,
 * corners (lat/lng) and uv (face-frame rectangle).
 */
export function fillFace(face, options = {}) {
  if (!face?.vertices || face.vertices.length < 3) return { cells: [], frame: null, grid: null }
  const o = layoutOpts({ ...options, orientation: face.panelOrientation ?? options.orientation })
  const frame = faceFrame(face)
  const inner = insetPolygon(frame.poly, o.setbackM)
  if (inner.length < 3) return { cells: [], frame, grid: null }
  const { across: w, down: h, shadowGapM } = panelFootprint(face, o)
  const stepU = w + o.gapM
  const stepV = h + Math.max(o.rowGapM, shadowGapM)
  const minU = Math.min(...inner.map((p) => p.x))
  const maxV = Math.max(...inner.map((p) => p.y))
  const minV = Math.min(...inner.map((p) => p.y))

  const makeRows = (shift) => {
    const rows = []
    for (let r = 0; maxV - shift - r * stepV - h >= minV - 1e-9; r += 1) {
      const v1 = maxV - shift - r * stepV
      rows.push({ r, v0: v1 - h, v1, intervals: bandIntervals(inner, v1 - h, v1) })
    }
    return rows
  }

  const tryOffset = (u0, rows) => {
    const cells = []
    for (const row of rows) {
      for (const [lo, hi] of row.intervals) {
        for (let k = Math.ceil((lo - u0) / stepU - 1e-9); u0 + k * stepU + w <= hi + 1e-9; k += 1) {
          const a = u0 + k * stepU
          const uv = [
            { x: a, y: row.v0 },
            { x: a + w, y: row.v0 },
            { x: a + w, y: row.v1 },
            { x: a, y: row.v1 },
          ]
          if (!polygonInside(uv, frame.poly, o.setbackM)) continue
          cells.push({ row: row.r, col: k, uv })
        }
      }
    }
    return cells
  }

  // Try a few grid offsets along the gutter (and tiny nudges up from it); keep the one that fits most.
  let best = { cells: [], u0: minU, shift: 0 }
  const tries = 8
  for (const shift of [0, 0.01, 0.03, 0.06]) {
    const rows = makeRows(shift)
    for (let i = 0; i < tries; i += 1) {
      const u0 = minU + (i * stepU) / tries
      const cells = tryOffset(u0, rows)
      if (cells.length > best.cells.length) best = { cells, u0, shift }
    }
  }

  const cells = best.cells.map((c) => {
    const ctr = { x: (c.uv[0].x + c.uv[2].x) / 2, y: (c.uv[0].y + c.uv[2].y) / 2 }
    return {
      id: `${face.id}:r${c.row}:c${c.col}`,
      faceId: face.id,
      row: c.row,
      col: c.col,
      uv: c.uv,
      uvCenter: ctr,
      center: frame.toLatLng(ctr),
      corners: c.uv.map(frame.toLatLng),
    }
  })
  return { cells, frame, grid: { u0: best.u0, shift: best.shift, stepU, stepV, maxV, w, h } }
}

/** Kept for older callers: the panel spots on one face. */
export function gridPanelsForFace(face, opts = {}) {
  return fillFace(face, opts).cells
}

const asPoly = (origin, latLngs) => latLngs.map((p) => toLocal(origin, toLatLng(p)))

function radius(poly) {
  const c = { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length }
  return { c, r: Math.max(...poly.map((p) => Math.hypot(p.x - c.x, p.y - c.y))) }
}

function near(a, b, gap) {
  return Math.hypot(a.c.x - b.c.x, a.c.y - b.c.y) <= a.r + b.r + gap
}

/**
 * Lay out panels on the included faces.
 *
 * options: insights, faces, panelCount, moduleWatts, state,
 *          orientation ('portrait' | 'landscape'), setbackM, gapM, rowGapM,
 *          removedPanelIds, pinnedPanelIds, obstacles [{ id, vertices }],
 *          maxKw (default MAX_RESIDENTIAL_KW),
 *          minPanelsPerFace (default 4, or 2 for a tiny system)
 *
 * Returns { panels, candidates, available, count, dcKw, annualAcKwh, source,
 *           googleWatts, faceStats, notes, blockedByObstacles, capped }.
 */
export function layoutPanels({
  insights,
  faces,
  panelCount,
  moduleWatts,
  state,
  orientation,
  setbackM,
  gapM,
  rowGapM,
  removedPanelIds = [],
  pinnedPanelIds = [],
  obstacles = [],
  maxKw = MAX_RESIDENTIAL_KW,
  minPanelsPerFace,
}) {
  const included = (faces ?? []).filter((f) => f.included && f.vertices?.length >= 3)
  const google = googlePanelSize(insights)
  const solarPanels = insights?.solarPotential?.solarPanels ?? []
  const scale = moduleWatts / google.watts
  const yieldKw = stateYield(state)
  const notes = []
  const removed = new Set(removedPanelIds)
  const pinned = new Map(pinnedPanelIds.map((id, i) => [id, i]))

  const origin =
    toLatLng(included[0]?.center) ?? toLatLng(insights?.center) ?? (included[0] ? centroid(included[0].vertices) : null)
  const obstaclePolys = (obstacles ?? [])
    .filter((ob) => ob?.vertices?.length >= 3 && origin)
    .map((ob) => {
      const poly = asPoly(origin, ob.vertices)
      return { id: ob.id, poly, ...radius(poly) }
    })

  const faceStats = []
  let all = []
  let blockedByObstacles = 0
  const removedCells = []
  for (const face of included) {
    const { cells, frame } = fillFace(face, { moduleWatts, orientation, setbackM, gapM, rowGapM })
    // Yield from Google's nearest panel spot on this segment, else the segment mean, else the state average.
    // Google's figures are for flush panels; flat faces get the tilt-frame gain.
    const gain = tiltFrameGain(face)
    const gp =
      face.source === 'solar-api' && Number.isInteger(face.segmentIndex)
        ? solarPanels
            .filter((p) => p.segmentIndex === face.segmentIndex && toLatLng(p.center))
            .map((p) => ({
              uv: toFaceUV(toLocal(frame.origin, toLatLng(p.center)), frame.axes),
              ac: Math.max(0, Number(p.yearlyEnergyDcKwh) || 0) * scale * DC_TO_AC_DERATE * gain,
            }))
        : []
    const mean = gp.length ? gp.reduce((s, p) => s + p.ac, 0) / gp.length : null
    const mount = mountFor(face)
    const fallback = (moduleWatts / 1000) * yieldKw * orientationFactor(mount.tiltDeg, mount.azimuthDeg)
    let kept = 0
    for (const cell of cells) {
      let yearlyAcKwh = mean ?? fallback
      let source = mean === null ? 'grid' : 'solar-api'
      if (gp.length) {
        let bestD = Infinity
        for (const p of gp) {
          const d = Math.hypot(p.uv.x - cell.uvCenter.x, p.uv.y - cell.uvCenter.y)
          if (d < bestD) {
            bestD = d
            if (d <= 1.5) yearlyAcKwh = p.ac
          }
        }
        source = 'solar-api'
      }
      const xy = asPoly(origin, cell.corners)
      const geom = { xy, ...radius(xy) }
      if (obstaclePolys.some((ob) => near(geom, ob, OBSTACLE_CLEARANCE_M) && polygonsOverlap(xy, ob.poly, { gap: OBSTACLE_CLEARANCE_M }))) {
        blockedByObstacles += 1
        continue
      }
      if (removed.has(cell.id)) {
        removedCells.push({ id: cell.id, faceId: cell.faceId, corners: cell.corners, center: cell.center, row: cell.row, col: cell.col })
        continue
      }
      kept += 1
      all.push({ ...cell, yearlyAcKwh, source, geom, faceMean: mean ?? fallback })
    }
    faceStats.push({ faceId: face.id, label: face.label, fits: kept, rawFits: cells.length })
  }

  // Best faces first, then best spots on each face, row by row from the gutter.
  const faceRank = new Map(
    [...faceStats]
      .map((s) => ({ id: s.faceId, mean: all.filter((c) => c.faceId === s.faceId).reduce((t, c, _, arr) => t + c.yearlyAcKwh / arr.length, 0) }))
      .sort((a, b) => b.mean - a.mean)
      .map((f, i) => [f.id, i]),
  )
  const bucket = (c) => Math.round((c.yearlyAcKwh / Math.max(c.faceMean, 1)) * 20) // 5% bands
  all.sort((a, b) => {
    const pa = pinned.has(a.id) ? pinned.get(a.id) : Infinity
    const pb = pinned.has(b.id) ? pinned.get(b.id) : Infinity
    if (pa !== pb) return pa - pb
    return faceRank.get(a.faceId) - faceRank.get(b.faceId) || bucket(b) - bucket(a) || a.row - b.row || a.col - b.col
  })

  // Faces can overlap a little (estimated outlines): never stack panels.
  const accepted = []
  let overlapDropped = 0
  for (const c of all) {
    const clash = accepted.some(
      (a) => a.faceId !== c.faceId && near(a.geom, c.geom, 0.01) && polygonsOverlap(a.geom.xy, c.geom.xy, { gap: 0.01 }),
    )
    if (clash) {
      overlapDropped += 1
      continue
    }
    accepted.push(c)
  }
  all = accepted

  // Panels go on in whole blocks: no face gets fewer than `minPer` panels from the
  // auto-fill (faces you edited by hand are left as you made them).
  const wanted = Math.max(0, Math.round(Number(panelCount) || 0))
  const maxByKw = maxKw > 0 ? Math.floor((maxKw * 1000) / moduleWatts + 1e-9) : Infinity
  const pinnedCells = all.filter((c) => pinned.has(c.id))
  const byFace = new Map(faceStats.map((s) => [s.faceId, { elig: [], removed: [], pinned: 0, pinnedCells: [] }]))
  for (const c of all) {
    const f = byFace.get(c.faceId)
    if (pinned.has(c.id)) {
      f.pinned += 1
      f.pinnedCells.push(c)
    }
    else f.elig.push(c)
  }
  for (const r of removedCells) byFace.get(r.faceId)?.removed.push(r)
  const manual = (f) => f.removed.length > 0 || f.pinned > 0
  const eligibleTotal = (min) =>
    pinnedCells.length + [...byFace.values()].reduce((t, f) => t + (manual(f) || f.elig.length >= min ? f.elig.length : 0), 0)
  const explicitMin = Math.round(Number(minPanelsPerFace) || 0) > 0 ? Math.round(Number(minPanelsPerFace)) : null
  let minPer = explicitMin ?? (wanted <= SMALL_SYSTEM_PANELS ? MIN_PANELS_PER_FACE_SMALL : MIN_PANELS_PER_FACE)
  let available = eligibleTotal(explicitMin ?? MIN_PANELS_PER_FACE)
  if (available < wanted && minPer < (explicitMin ?? MIN_PANELS_PER_FACE)) available = eligibleTotal(minPer)
  if (available === 0 && all.length > 0) {
    minPer = 1
    available = all.length
    notes.push('Only small roof areas are available, so panels sit in small groups.')
  }
  const smallFaces = faceStats.filter((s) => {
    const f = byFace.get(s.faceId)
    return !manual(f) && f.elig.length > 0 && f.elig.length < minPer
  })

  let count = Math.min(wanted, available)
  let capped = false
  if (count > maxByKw) {
    count = maxByKw
    capped = true
    notes.push(`Capped at ${maxByKw} panels (${maxKw} kW) - the usual limit for a home connection. Check with your network.`)
  }
  if (blockedByObstacles) notes.push(`${blockedByObstacles} spot${blockedByObstacles === 1 ? '' : 's'} left clear around no-go areas.`)
  if (overlapDropped) notes.push(`${overlapDropped} spot${overlapDropped === 1 ? '' : 's'} skipped where two faces overlap.`)

  // Share the panels out: best faces first, whole groups only, then top up faces already in use.
  const fixed = pinnedCells.slice(0, count)
  const ranked = [...byFace.keys()].sort((a, b) => faceRank.get(a) - faceRank.get(b))
  const share = (skip) => {
    let left = count - fixed.length
    const out = new Map()
    for (const id of ranked) {
      if (skip.has(id)) continue
      const f = byFace.get(id)
      const take = Math.min(f.elig.length, left)
      if (take <= 0 || take < (manual(f) ? 1 : minPer)) continue
      out.set(id, take)
      left -= take
    }
    for (const id of ranked) {
      if (left <= 0 || !out.has(id)) continue
      const extra = Math.min(byFace.get(id).elig.length - out.get(id), left)
      out.set(id, out.get(id) + extra)
      left -= extra
    }
    return { alloc: out, left }
  }
  // If a leftover is too small for any face, try leaving one face out so the rest fits in whole groups.
  let plan = share(new Set())
  if (plan.left > 0) {
    for (const id of [...plan.alloc.keys()].reverse()) {
      if (manual(byFace.get(id))) continue
      const alt = share(new Set([id]))
      if (alt.left < plan.left) plan = alt
      if (plan.left === 0) break
    }
  }
  const { alloc } = plan
  const remaining = plan.left
  if (remaining > 0) {
    notes.push(
      `${remaining} panel${remaining === 1 ? '' : 's'} fewer than asked, so no roof face is left with fewer than ${minPer} panels.`,
    )
    count -= remaining
  }
  const chosen = [...fixed]
  for (const id of ranked) {
    if (!alloc.has(id)) continue
    const f = byFace.get(id)
    chosen.push(...chooseBlock(f.elig, [...f.removed, ...f.pinnedCells], alloc.get(id)))
  }
  const chosenIds = new Set(chosen.map((c) => c.id))
  const strip = (c) => {
    const out = { ...c }
    delete out.geom
    delete out.faceMean
    return out
  }
  const panels = chosen.map(strip)
  const flatIds = new Set(included.filter((f) => mountFor(f).flat).map((f) => f.id))
  if (panels.some((p) => flatIds.has(p.faceId)))
    notes.push(
      `Flat roof: panels are on ${TILT_FRAME_DEG}° tilt frames facing north, with rows spaced so they do not shade each other in winter.`,
    )
  const candidates = [...panels, ...all.filter((c) => !chosenIds.has(c.id)).map(strip)]
  const sources = new Set(panels.map((p) => p.source))
  return {
    panels,
    candidates,
    available,
    maxByKw,
    count,
    capped,
    dcKw: (count * moduleWatts) / 1000,
    annualAcKwh: panels.reduce((s, p) => s + p.yearlyAcKwh, 0),
    source: sources.size === 0 ? 'none' : sources.size > 1 ? 'mixed' : [...sources][0],
    googleWatts: google.watts,
    faceStats,
    notes,
    blockedByObstacles,
    removedCells,
    minPanelsPerFace: minPer,
    smallFaces: smallFaces.map((f) => f.label ?? f.faceId),
  }
}

/** Nearest free panel spot to a lat/lng (for drag-and-snap), or null if none is close. */
export function snapToCell(candidates, latLng, { exclude = [], maxM = MAX_ADDED_PANEL_SNAP_M } = {}) {
  const p = toLatLng(latLng)
  if (!p) return null
  const skip = new Set(exclude)
  let best = null
  for (const c of candidates) {
    if (skip.has(c.id)) continue
    const xy = toLocal(p, c.center)
    const d = Math.hypot(xy.x, xy.y)
    if (d <= maxM && (!best || d < best.d)) best = { d, cell: c }
  }
  return best?.cell ?? null
}

/**
 * Pick `n` spots on one face as one tidy block: full rows of the same columns,
 * from the gutter up, with at most one shorter last row. Spots you removed by
 * hand still count as part of the shape (so one removal does not reshuffle the
 * face) but never get a panel; so do panels you placed by hand.
 */
export function chooseBlock(eligible, removed = [], n) {
  if (n <= 0) return []
  if (n >= eligible.length) return [...eligible]
  const grid = new Map()
  for (const c of eligible) grid.set(`${c.row}:${c.col}`, c)
  for (const r of removed) if (!grid.has(`${r.row}:${r.col}`)) grid.set(`${r.row}:${r.col}`, { ...r, removed: true })
  const want = n + removed.length
  const rows = [...new Set([...grid.values()].map((c) => c.row))].sort((a, b) => a - b)
  const cols = [...new Set([...grid.values()].map((c) => c.col))].sort((a, b) => a - b)
  const top = Math.max(...eligible.map((c) => c.yearlyAcKwh || 0), 1)
  let best = null
  for (const r0 of rows) {
    for (const c0 of cols) {
      for (let wd = 1; grid.has(`${r0}:${c0 + wd - 1}`); wd += 1) {
        const nr = Math.ceil(want / wd)
        const pick = []
        let ok = true
        for (let i = 0; i < nr && ok; i += 1) {
          const m = i === nr - 1 ? want - wd * (nr - 1) : wd
          for (let j = 0; j < m; j += 1) {
            const c = grid.get(`${r0 + i}:${c0 + j}`)
            if (!c) {
              ok = false
              break
            }
            pick.push(c)
          }
        }
        if (!ok) continue
        const real = pick.filter((c) => !c.removed)
        const yieldFrac = real.reduce((t, c) => t + (c.yearlyAcKwh || 0), 0) / Math.max(real.length, 1) / top
        const cost =
          (want % wd ? 2 : 0) + (wd === 1 && want > 2 ? 3 : 0) + nr * 0.25 + (r0 - rows[0]) * 0.5 - yieldFrac * 10
        if (!best || cost < best.cost - 1e-9) best = { cost, real }
      }
    }
  }
  // Fall back to row by row from the gutter if no single block fits.
  const rowMajor = [...eligible].sort((a, b) => a.row - b.row || a.col - b.col)
  const out = best ? best.real.slice(0, n) : []
  const have = new Set(out.map((c) => c.id))
  for (const c of rowMajor) {
    if (out.length >= n) break
    if (!have.has(c.id)) out.push(c)
  }
  return out
}

/**
 * Final checks on a laid-out design: every panel inside its face with the
 * setback, no two panels overlapping, nothing on a no-go area.
 */
export function validateLayout(layout, faces, { setbackM = ROOF_EDGE_SETBACK_M, obstacles = [], minPanelsPerFace } = {}) {
  const issues = []
  const byId = new Map((faces ?? []).map((f) => [f.id, f]))
  const frames = new Map()
  const panels = layout?.panels ?? []
  for (const p of panels) {
    const face = byId.get(p.faceId)
    if (!face) {
      issues.push({ level: 'error', message: `A panel sits on a roof face that no longer exists (${p.id}).` })
      continue
    }
    if (!frames.has(face.id)) frames.set(face.id, faceFrame(face))
    const fr = frames.get(face.id)
    const uv = p.corners.map((c) => toFaceUV(toLocal(fr.origin, c), fr.axes))
    if (!polygonInside(uv, fr.poly, setbackM - 0.01)) {
      issues.push({ level: 'error', message: `A panel on ${face.label} crosses the roof edge or the ${setbackM} m setback.` })
    }
  }
  const origin = panels[0]?.center
  if (origin) {
    const geo = panels.map((p) => {
      const xy = asPoly(origin, p.corners)
      return { id: p.id, xy, ...radius(xy) }
    })
    let overlaps = 0
    for (let i = 0; i < geo.length; i += 1) {
      for (let j = i + 1; j < geo.length; j += 1) {
        if (near(geo[i], geo[j], 0) && polygonsOverlap(geo[i].xy, geo[j].xy)) overlaps += 1
      }
    }
    if (overlaps) issues.push({ level: 'error', message: `${overlaps} pair${overlaps === 1 ? '' : 's'} of panels overlap.` })
    const obs = (obstacles ?? []).filter((o) => o?.vertices?.length >= 3).map((o) => asPoly(origin, o.vertices))
    const onObstacle = geo.filter((g) => obs.some((ob) => polygonsOverlap(g.xy, ob))).length
    if (onObstacle) issues.push({ level: 'error', message: `${onObstacle} panel${onObstacle === 1 ? '' : 's'} sit on a no-go area.` })
  }
  const min = minPanelsPerFace ?? layout?.minPanelsPerFace ?? MIN_PANELS_PER_FACE
  const perFace = new Map()
  for (const p of panels) perFace.set(p.faceId, (perFace.get(p.faceId) ?? 0) + 1)
  for (const [faceId, n] of perFace) {
    if (n < min) {
      const label = byId.get(faceId)?.label ?? faceId
      issues.push({
        level: 'warning',
        message: `${label} has only ${n} panel${n === 1 ? '' : 's'} - small groups are harder to wire; move ${n === 1 ? 'it' : 'them'} to a bigger group or add more.`,
      })
    }
  }
  return { ok: !issues.some((i) => i.level === 'error'), issues }
}
