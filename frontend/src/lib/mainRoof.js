/*
 * Keep the design to the roof the user picked.
 *
 * Google sometimes merges a whole complex (a warehouse and the shops next
 * door, a mansion and the flats behind it) into one "building". We split it
 * using the 3D roof data:
 *   - two faces are on the same roof when their planes meet along a shared
 *     edge (a ridge, hip or valley: the planes are within STEP_M of each
 *     other there), even across a thin crease or gutter;
 *   - the main roof is every face joined that way to the face under the
 *     locked point (the map centre);
 *   - a roof joined only by a wall (a height step) is another storey of the
 *     same house when the main roof is house-sized; on a big building
 *     (over HOUSE_MAX_M2) a wall step usually separates tenancies, so that
 *     roof is left out;
 *   - a roof that touches nothing is a separate building.
 * Outlines the 3D model never joined (a failed trace, or no 3D data at all)
 * are still split by distance: faces within CONNECT_GAP_M of the roof you
 * picked stay; anything farther is a separate building. A neighbour that
 * actually touches your outline, with no 3D wall step, is kept — tick it off
 * if it is next door.
 * Faces off the main roof are unticked and badged "Other roof - tick to
 * include". Faces drawn or edited by the user are left alone.
 */
import { MAIN_ROOF } from '../config/designerConfig'
import { toLatLng, toLocal } from './geo'
import { boundaryDistance, pointInPolygon, pointSegmentDistance, polygonsOverlap } from './polygon'

export const OTHER_ROOF_LABEL = 'Other roof - tick to include'
const { STEP_M, MIN_EDGE_M, WALL_EDGE_M, HOUSE_MAX_M2, SEED_MAX_M, CONNECT_GAP_M } = MAIN_ROOF

const planArea = (f) => Number(f.groundAreaSquareMetres ?? f.areaSquareMetres) || 0

function distanceToFace(target, face) {
  const poly = face.vertices.map((v) => toLocal(target, toLatLng(v)))
  const p = { x: 0, y: 0 }
  if (pointInPolygon(p, poly)) return 0
  let d = Infinity
  for (let i = 0; i < poly.length; i += 1) d = Math.min(d, pointSegmentDistance(p, poly[i], poly[(i + 1) % poly.length]))
  return d
}

/** The face under (or nearest to) the locked point, or null if none is within SEED_MAX_M. */
export function seedFace(faces, target) {
  const t = toLatLng(target)
  if (!t) return null
  let best = null
  for (const f of faces) {
    if (!f.vertices || f.vertices.length < 3 || f.segmentIndex == null) continue
    const d = distanceToFace(t, f)
    // Inside two faces (overlapping outlines): take the bigger one.
    if (!best || d < best.d - 1e-6 || (d === best.d && planArea(f) > planArea(best.f))) best = { d, f }
  }
  return best && best.d <= SEED_MAX_M ? best.f : null
}

function components(nodes, edges) {
  const parent = new Map(nodes.map((n) => [n, n]))
  const find = (n) => (parent.get(n) === n ? n : (parent.set(n, find(parent.get(n))), parent.get(n)))
  for (const e of edges) if (parent.has(e.a) && parent.has(e.b)) parent.set(find(e.a), find(e.b))
  const out = new Map()
  for (const n of nodes) {
    const r = find(n)
    if (!out.has(r)) out.set(r, new Set())
    out.get(r).add(n)
  }
  return [...out.values()]
}

/** Metres between two outlines (0 when they overlap or touch). */
export function outlineGapM(a, b) {
  if (!a?.vertices || !b?.vertices || a.vertices.length < 3 || b.vertices.length < 3) return Infinity
  const origin = toLatLng(a.vertices[0])
  if (!origin) return Infinity
  const pa = a.vertices.map((v) => toLocal(origin, toLatLng(v))).filter(Boolean)
  const pb = b.vertices.map((v) => toLocal(origin, toLatLng(v))).filter(Boolean)
  if (pa.length < 3 || pb.length < 3) return Infinity
  if (polygonsOverlap(pa, pb)) return 0
  return boundaryDistance(pa, pb)
}

const canSeparate = (f) => f?.source === 'solar-api' && !f.outlineEdited && f.segmentIndex != null && f.vertices?.length >= 3

/**
 * Pull in every separable face within CONNECT_GAP_M of the roof already
 * chosen, crossing a chain of shared edges. Faces already marked `other`
 * (a wall on a big building) are not pulled back in.
 */
function absorbTouching(list, kept, other) {
  const queue = [...kept]
  while (queue.length) {
    const k = queue.pop()
    const a = list.find((f) => f.segmentIndex === k)
    if (!a) continue
    for (const b of list) {
      if (kept.has(b.segmentIndex) || other.has(b.segmentIndex)) continue
      if (outlineGapM(a, b) <= CONNECT_GAP_M) {
        kept.add(b.segmentIndex)
        queue.push(b.segmentIndex)
      }
    }
  }
}

/**
 * Split faces into the main roof and other roofs.
 * adjacency: [{ a, b, stepM, lenM }] by segment index (from roofFacesFromDsm).
 * Returns { seed, main: Set(segIdx), attached: Set(segIdx), other: Map(segIdx -> reason) } or null
 * when no face is near the locked point.
 */
export function splitMainRoof(faces, adjacency, target) {
  const list = (faces ?? []).filter((f) => f.segmentIndex != null)
  const seed = seedFace(list, target)
  if (!seed) return null
  const bySeg = new Map(list.map((f) => [f.segmentIndex, f]))
  const adj = adjacency ?? []
  const touched = new Set(adj.flatMap((e) => [e.a, e.b]))
  const nodes = [...bySeg.keys()].filter((k) => touched.has(k) || bySeg.get(k).outlineShape === 'dsm')
  let main
  let attached
  let other
  let mainArea
  if (adj.length && nodes.includes(seed.segmentIndex)) {
    const joins = adj.filter((e) => e.lenM >= MIN_EDGE_M && e.stepM < STEP_M)
    const walls = adj.filter((e) => e.lenM >= WALL_EDGE_M && e.stepM >= STEP_M)
    const comps = components(nodes, joins)
    const compOf = new Map()
    comps.forEach((c, i) => c.forEach((n) => compOf.set(n, i)))
    main = comps[compOf.get(seed.segmentIndex)]
    mainArea = [...main].reduce((t, k) => t + planArea(bySeg.get(k)), 0)
    const houseSized = mainArea <= HOUSE_MAX_M2
    attached = new Set()
    other = new Map()
    for (const e of walls) {
      const [inMain, out] = main.has(e.a) ? [e.a, e.b] : main.has(e.b) ? [e.b, e.a] : [null, null]
      if (inMain === null || main.has(out)) continue
      const comp = comps[compOf.get(out)]
      for (const k of comp) {
        if (houseSized) attached.add(k)
        else if (!other.has(k)) other.set(k, `behind a ${e.stepM.toFixed(1)} m wall from the roof you picked - probably next door`)
      }
    }
    for (const k of nodes) {
      if (main.has(k) || attached.has(k) || other.has(k)) continue
      other.set(k, 'not joined to the roof you picked - a separate building')
    }
    for (const k of attached) other.delete(k)
  } else {
    main = new Set([seed.segmentIndex])
    attached = new Set()
    other = new Map()
    mainArea = planArea(seed)
  }
  // Faces the 3D join graph never mentioned (estimate-only, or no 3D data).
  const kept = new Set([...main, ...attached])
  absorbTouching(list.filter(canSeparate), kept, other)
  for (const f of list) {
    if (!canSeparate(f) || kept.has(f.segmentIndex) || other.has(f.segmentIndex)) continue
    other.set(f.segmentIndex, 'not joined to the roof you picked - a separate building')
  }
  return { seed: seed.segmentIndex, main, attached, other, mainAreaM2: mainArea }
}

/** Untick and badge faces that are not on the main roof. */
export function markOtherRoofs(faces, adjacency, target) {
  const split = splitMainRoof(faces, adjacency, target)
  if (!split) return { faces, other: 0 }
  let other = 0
  const next = (faces ?? []).map((f) => {
    if (f.source !== 'solar-api' || f.outlineEdited || !split.other.has(f.segmentIndex)) return f
    other += 1
    return { ...f, otherRoof: true, otherRoofReason: split.other.get(f.segmentIndex), included: false }
  })
  return { faces: next, other }
}
