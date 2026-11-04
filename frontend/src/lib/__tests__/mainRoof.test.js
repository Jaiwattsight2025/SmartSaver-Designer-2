import { describe, expect, it } from 'vitest'
import { markOtherRoofs, seedFace, splitMainRoof, OTHER_ROOF_LABEL } from '../mainRoof'
import { flagNonRoofFaces, verandahSkirts } from '../nonRoof'
import { manualFace } from '../roofFaces'
import { elongationCost, layoutPanels } from '../panelLayout'
import { offset } from '../geo'

const o = { lat: -37.8665, lng: 145.1012 }
const at = (east, north) => offset(offset(o, east, 90), north, 0)
const rect = (e0, n0, w, d) => [at(e0, n0), at(e0 + w, n0), at(e0 + w, n0 + d), at(e0, n0 + d)]
const face = (seg, e0, n0, w, d, over = {}) => ({
  id: `seg-${seg}`,
  label: `Face ${seg + 1}`,
  source: 'solar-api',
  segmentIndex: seg,
  included: true,
  pitchDegrees: 20,
  groundAreaSquareMetres: w * d,
  outlineShape: 'dsm',
  vertices: rect(e0, n0, w, d),
  ...over,
})
const join = (a, b, stepM = 0.1, lenM = 6) => ({ a, b, stepM, lenM })

describe('main roof filter', () => {
  it('picks the face under the locked point', () => {
    const faces = [face(0, -5, -4, 10, 4), face(1, -5, 0, 10, 4)]
    expect(seedFace(faces, at(0, 2)).segmentIndex).toBe(1)
    expect(seedFace(faces, at(0, 40))).toBe(null)
  })
  it('keeps the lower storey of a house (wall step, house-sized)', () => {
    const faces = [face(0, -5, 0, 10, 4), face(1, -5, -4, 10, 4), face(2, 5, -4, 6, 8)]
    const adj = [join(0, 1), join(1, 2, 2.6, 4)]
    const s = splitMainRoof(faces, adj, at(0, 2))
    expect([...s.main].sort()).toEqual([0, 1])
    expect(s.attached.has(2)).toBe(true)
    expect(s.other.size).toBe(0)
    expect(markOtherRoofs(faces, adj, at(0, 2)).other).toBe(0)
  })
  it('leaves out a lower neighbour behind a wall on a big merged building (Bunnings)', () => {
    const faces = [face(0, -40, -20, 80, 40), face(1, -40, 20, 80, 10), face(2, 40, -20, 20, 20)]
    const adj = [join(0, 1), join(0, 2, 4.9, 10)]
    const { faces: out, other } = markOtherRoofs(faces, adj, at(0, 0))
    expect(other).toBe(1)
    const n = out.find((f) => f.segmentIndex === 2)
    expect(n.otherRoof).toBe(true)
    expect(n.included).toBe(false)
    expect(n.otherRoofReason).toMatch(/4\.9 m wall/)
    expect(out.find((f) => f.segmentIndex === 0).included).toBe(true)
    expect(OTHER_ROOF_LABEL).toBe('Other roof - tick to include')
  })
  it('leaves out a separate block that only touches itself (Labassa)', () => {
    const faces = [face(0, -5, 0, 10, 4), face(1, -5, -4, 10, 4), face(5, -5, 20, 8, 4), face(6, -5, 24, 8, 4)]
    const adj = [join(0, 1), join(5, 6)]
    const s = splitMainRoof(faces, adj, at(0, 2))
    expect([...s.other.keys()].sort()).toEqual([5, 6])
    expect(s.other.get(5)).toMatch(/separate building/)
  })
  it('does nothing without 3D data or when the point is off every roof', () => {
    const faces = [face(0, -5, 0, 10, 4)]
    expect(splitMainRoof(faces, [], at(0, 2))).toBe(null)
    expect(markOtherRoofs(faces, [join(0, 1)], at(100, 100)).faces).toBe(faces)
  })
  it('never touches a face the user drew or edited', () => {
    const faces = [face(0, -5, 0, 10, 4), face(1, -5, 30, 10, 4, { outlineEdited: true }), face(2, -5, 40, 10, 4, { source: 'manual' })]
    const out = markOtherRoofs(faces, [join(0, 3), join(1, 2)], at(0, 2)).faces
    expect(out[1].included).toBe(true)
    expect(out[2].included).toBe(true)
  })
})

describe('raised verandah skirts', () => {
  const main = face(0, -8, 2, 16, 5, { pitchDegrees: 36, dsmMetrics: { heightM: 18.4, heightAboveGroundM: 6.5 } })
  const skirt = face(1, -8, -1, 16, 3, { pitchDegrees: 18, dsmMetrics: { heightM: 16.1, heightAboveGroundM: 5.9 } })
  it('flags a flatter roof creased onto a steeper, higher one (Newstead)', () => {
    const adj = [join(0, 1, 0.2, 14)]
    expect(verandahSkirts([main, skirt], adj).has(1)).toBe(true)
    const out = flagNonRoofFaces([main, skirt], null, { adjacency: adj })
    expect(out[1].nonRoofLikely).toBe(true)
    expect(out[1].included).toBe(false)
    expect(out[1].nonRoofReasons[0]).toMatch(/verandah/)
    expect(out[0].nonRoofLikely).toBeFalsy()
  })
  it('ignores small pitch changes, walls and stepped joins', () => {
    const gentle = { ...skirt, pitchDegrees: 26 } // only 10° flatter (Como-like)
    expect(verandahSkirts([main, gentle], [join(0, 1, 0.2, 14)]).size).toBe(0)
    expect(verandahSkirts([main, skirt], [join(0, 1, 1.5, 14)]).size).toBe(0)
    const wall = { ...main, pitchDegrees: 57 }
    expect(verandahSkirts([wall, skirt], [join(0, 1, 0.2, 14)]).size).toBe(0)
  })
})

describe('compact panel blocks', () => {
  it('scores one long row as elongated and a 3-row block as compact', () => {
    const cell = (x, y) => ({ uv: [{ x, y }, { x: x + 1.1, y }, { x: x + 1.1, y: y + 1.7 }, { x, y: y + 1.7 }] })
    const row = Array.from({ length: 20 }, (_, i) => cell(i * 1.12, 0))
    const block = Array.from({ length: 21 }, (_, i) => cell((i % 7) * 1.12, Math.floor(i / 7) * 1.72))
    expect(elongationCost(row)).toBeGreaterThan(2)
    expect(elongationCost(block)).toBe(0)
  })
  it('lays 23 panels on a long wide roof in 2-3 rows, not one long row (St James)', () => {
    const a = o
    const b = offset(a, 32, 90)
    const c = offset(b, 6, 0)
    const d = offset(a, 6, 0)
    const f = manualFace({ id: 'wide', vertices: [a, b, c, d], pitchDegrees: 20, azimuthDegrees: 0 })
    const l = layoutPanels({ insights: null, faces: [f], panelCount: 23, moduleWatts: 440, state: 'VIC' })
    expect(l.count).toBe(23)
    const rows = new Set(l.panels.map((p) => p.row))
    expect(rows.size).toBeGreaterThanOrEqual(2)
    expect(rows.size).toBeLessThanOrEqual(3)
  })
})
