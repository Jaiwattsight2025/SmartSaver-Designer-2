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
 * Faces off the main roof are unticked and badged "Other roof - tick to
 * include". Faces drawn or edited by the user, and faces with no 3D data,
 * are left alone.
 */
import { MAIN_ROOF } from '../config/designerConfig'
import { toLatLng, toLocal } from './geo'
import { pointInPolygon, pointSegmentDistance } from './polygon'

export const OTHER_ROOF_LABEL = 'Other roof - tick to include'
const { STEP_M, MIN_EDGE_M, WALL_EDGE_M, HOUSE_MAX_M2, SEED_MAX_M } = MAIN_ROOF

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

/**
 * Split faces into the main roof and other roofs.
 * adjacency: [{ a, b, stepM, lenM }] by segment index (from roofFacesFromDsm).
 * Returns { seed, main: Set(segIdx), attached: Set(segIdx), other: Map(segIdx -> reason) } or null
 * when there is nothing to decide (no 3D data, or no face near the locked point).
 */
export function splitMainRoof(faces, adjacency, target) {
  if (!adjacency?.length) return null
  const seed = seedFace(faces ?? [], target)
  if (!seed) return null
  const bySeg = new Map(faces.filter((f) => f.segmentIndex != null).map((f) => [f.segmentIndex, f]))
  const touched = new Set(adjacency.flatMap((e) => [e.a, e.b]))
  const nodes = [...bySeg.keys()].filter((k) => touched.has(k) || bySeg.get(k).outlineShape === 'dsm')
  if (!nodes.includes(seed.segmentIndex)) return null
  const joins = adjacency.filter((e) => e.lenM >= MIN_EDGE_M && e.stepM < STEP_M)
  const walls = adjacency.filter((e) => e.lenM >= WALL_EDGE_M && e.stepM >= STEP_M)
  const comps = components(nodes, joins)
  const compOf = new Map()
  comps.forEach((c, i) => c.forEach((n) => compOf.set(n, i)))
  const main = comps[compOf.get(seed.segmentIndex)]
  const mainArea = [...main].reduce((t, k) => t + planArea(bySeg.get(k)), 0)
  const houseSized = mainArea <= HOUSE_MAX_M2
  const attached = new Set()
  const other = new Map()
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
