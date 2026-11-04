/*
 * Spot roof faces that are probably not main roof: verandahs, pergolas,
 * carports, awnings or a strip of something else picked up next to the house.
 * They are flagged "Possibly verandah/not roof", left unticked and so kept out
 * of the auto-fill until the user ticks them.
 *
 * A face is flagged when at least two of these hold:
 *   - low: its plane sits less than 2.6 m above the local ground (3D data);
 *     only when the ground height is unknown or implausible (dense blocks,
 *     big buildings) do we fall back to "1 m or more below the main roof", so
 *     the lower roof of a two-storey house is not mistaken for a verandah,
 *   - flat: pitch under 12 degrees, unless the main roof is itself flat
 *     (warehouses, modern flat-roof homes),
 *   - narrow: under 1.8 m across at its narrowest,
 *   - weak and small: the outline is not high confidence and it is under 15 m².
 * A face steeper than 60 degrees is a wall or parapet edge and is flagged on
 * its own.
 * Being both low above ground and well below the main roof counts once.
 * A raised verandah (a Queenslander's wrap-around, a first-floor balcony
 * roof) is also flagged on its own: a flatter skirt joined along a crease to
 * a steeper face that sits clearly higher (needs the 3D roof data).
 */
import { toLatLng, toLocal } from './geo'

export const NON_ROOF_LABEL = 'Possibly verandah/not roof'
const LOW_ABOVE_GROUND_M = 2.6 // [ASSUMPTION] a single-storey roof plane centre is usually 3 m+ above the ground
const BELOW_MAIN_M = 1.0
const FLAT_PITCH_DEG = 12
const NARROW_M = 1.8
const SMALL_M2 = 15
const WALL_PITCH_DEG = 60
const SKIRT = { pitchDiffDeg: 14, heightDiffM: 1.2, maxStepM: 0.5, minEdgeM: 2, maxRoofPitchDeg: 55 } // [ASSUMPTION] tuned on public test roofs
const GROUND_PLAUSIBLE_M = [0.5, 40] // outside this the local ground estimate hit other roofs or noise

/** Narrowest width of a face outline (metres, rotating callipers over its edges). */
export function minWidthM(vertices) {
  const pts = (vertices ?? []).map(toLatLng).filter(Boolean)
  if (pts.length < 3) return 0
  const xy = pts.map((p) => toLocal(pts[0], p))
  let best = Infinity
  for (let i = 0; i < xy.length; i += 1) {
    const a = xy[i]
    const b = xy[(i + 1) % xy.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 0.3) continue
    const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }
    const pr = xy.map((p) => p.x * n.x + p.y * n.y)
    best = Math.min(best, Math.max(...pr) - Math.min(...pr))
  }
  return Number.isFinite(best) ? best : 0
}

function weightedMedian(items) {
  const s = items.filter((i) => Number.isFinite(i.v) && i.w > 0).sort((a, b) => a.v - b.v)
  const total = s.reduce((t, i) => t + i.w, 0)
  let acc = 0
  for (const i of s) {
    acc += i.w
    if (acc >= total / 2) return i.v
  }
  return null
}

const planeHeight = (face, stats) =>
  Number(face.dsmMetrics?.heightM ?? stats?.[face.segmentIndex]?.planeHeightAtCenterMeters) || null

/** Reasons a face looks like it is not main roof (empty when it looks fine). */
export function nonRoofReasons(face, { mainHeightM = null, stats = null, mainIsFlat = false } = {}) {
  const reasons = []
  if ((Number(face.pitchDegrees) || 0) >= WALL_PITCH_DEG) reasons.push(`steeper than ${WALL_PITCH_DEG}° (likely a wall or parapet)`)
  const h = planeHeight(face, stats)
  const hag = face.dsmMetrics?.heightAboveGroundM
  const groundKnown = Number.isFinite(hag) && hag >= GROUND_PLAUSIBLE_M[0] && hag <= GROUND_PLAUSIBLE_M[1]
  if (groundKnown) {
    if (hag < LOW_ABOVE_GROUND_M) reasons.push(`only ${hag.toFixed(1)} m above the ground`)
  } else if (h !== null && mainHeightM !== null && mainHeightM - h >= BELOW_MAIN_M)
    reasons.push(`${(mainHeightM - h).toFixed(1)} m below the main roof`)
  if (!mainIsFlat && (Number(face.pitchDegrees) || 0) < FLAT_PITCH_DEG) reasons.push(`nearly flat (${face.pitchDegrees}°)`)
  const w = minWidthM(face.vertices)
  if (w > 0 && w < NARROW_M) reasons.push(`only ${w.toFixed(1)} m wide`)
  if (face.outlineConfidence !== 'high' && (Number(face.areaSquareMetres) || 0) < SMALL_M2)
    reasons.push('small, and the outline is not certain')
  return reasons
}

/**
 * Faces that look like a verandah skirt: flatter by SKIRT.pitchDiffDeg+ than a
 * neighbour they meet along a crease, and SKIRT.heightDiffM+ lower than it.
 * adjacency: [{ a, b, stepM, lenM }] by segment index. Returns Map(segIdx -> reason).
 */
export function verandahSkirts(faces, adjacency, stats = null) {
  const out = new Map()
  if (!adjacency?.length) return out
  const bySeg = new Map((faces ?? []).filter((f) => f.segmentIndex != null).map((f) => [f.segmentIndex, f]))
  for (const e of adjacency) {
    if (e.stepM >= SKIRT.maxStepM || e.lenM < SKIRT.minEdgeM) continue
    for (const [lo, hi] of [[e.a, e.b], [e.b, e.a]]) {
      const f = bySeg.get(lo)
      const g = bySeg.get(hi)
      if (!f || !g) continue
      const hf = planeHeight(f, stats)
      const hg = planeHeight(g, stats)
      const dp = (Number(g.pitchDegrees) || 0) - (Number(f.pitchDegrees) || 0)
      if ((Number(g.pitchDegrees) || 0) > SKIRT.maxRoofPitchDeg) continue // the steeper one must be roof, not a wall
      if (hf === null || hg === null || dp < SKIRT.pitchDiffDeg || hg - hf < SKIRT.heightDiffM) continue
      if (!out.has(lo)) out.set(lo, `a flatter skirt ${(hg - hf).toFixed(1)} m below a steeper roof (likely a raised verandah)`)
    }
  }
  return out
}

/**
 * Flag likely non-roof faces from Google's roof data (manual faces and faces
 * the user has already edited are left alone). Flagged faces are unticked.
 */
export function flagNonRoofFaces(faces, insights, { adjacency = null } = {}) {
  const stats = insights?.solarPotential?.roofSegmentStats ?? null
  const big = (faces ?? []).filter((f) => (Number(f.areaSquareMetres) || 0) >= SMALL_M2)
  const mainHeightM = weightedMedian(big.map((f) => ({ v: planeHeight(f, stats), w: Number(f.areaSquareMetres) || 0 })))
  const mainPitch = weightedMedian(big.map((f) => ({ v: Number(f.pitchDegrees) || 0, w: Number(f.areaSquareMetres) || 0 })))
  const mainIsFlat = mainPitch !== null && mainPitch < FLAT_PITCH_DEG
  const skirts = verandahSkirts(faces, adjacency, stats)
  return (faces ?? []).map((f) => {
    if (f.source !== 'solar-api' || f.outlineEdited) return f
    const reasons = nonRoofReasons(f, { mainHeightM, stats, mainIsFlat })
    const skirt = skirts.get(f.segmentIndex)
    if (skirt) reasons.unshift(skirt)
    const wall = (Number(f.pitchDegrees) || 0) >= WALL_PITCH_DEG
    if (!wall && !skirt && reasons.length < 2) return f.nonRoofLikely ? { ...f, nonRoofLikely: false, nonRoofReasons: [] } : f
    return { ...f, nonRoofLikely: true, nonRoofReasons: reasons, included: false }
  })
}
