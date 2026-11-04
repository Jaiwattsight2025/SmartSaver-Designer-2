import { describe, expect, it } from 'vitest'
import {
  area,
  bandIntervals,
  boundaryDistance,
  clipConvex,
  insetPolygon,
  overlapArea,
  pointInPolygon,
  polygonInside,
  polygonsOverlap,
  sliceAt,
} from '../polygon'

const rect = (x0, y0, x1, y1) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]
// An L-shaped (concave) roof: 10 x 10 with the top-right 5 x 5 cut away.
const L = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 5 },
  { x: 5, y: 5 },
  { x: 5, y: 10 },
  { x: 0, y: 10 },
]

describe('polygon core', () => {
  it('measures area either winding', () => {
    expect(area(rect(0, 0, 4, 3))).toBeCloseTo(12)
    expect(area([...rect(0, 0, 4, 3)].reverse())).toBeCloseTo(12)
    expect(area(L)).toBeCloseTo(75)
  })

  it('insets a rectangle by the setback on every side', () => {
    const r = insetPolygon(rect(0, 0, 10, 6), 0.4)
    expect(area(r)).toBeCloseTo(9.2 * 5.2, 6)
    expect(boundaryDistance(r, rect(0, 0, 10, 6))).toBeCloseTo(0.4, 6)
  })

  it('insets a concave L and a triangle, and collapses thin shapes', () => {
    const l = insetPolygon(L, 1)
    expect(area(l)).toBeCloseTo(8 * 3 + 3 * 5, 6) // 8x3 bottom arm + 3x5 left arm
    expect(boundaryDistance(l, L)).toBeCloseTo(1, 6)
    const tri = insetPolygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }], 0.5)
    expect(tri.length).toBe(3)
    expect(boundaryDistance(tri, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }])).toBeCloseTo(0.5, 6)
    expect(insetPolygon(rect(0, 0, 10, 0.6), 0.4)).toEqual([])
  })

  it('keeps a trapezoid (hip face) the right shape after inset', () => {
    const trap = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 7, y: 3 }, { x: 3, y: 3 }]
    const t = insetPolygon(trap, 0.4)
    expect(t.length).toBe(4)
    expect(polygonInside(t, trap, 0.399)).toBe(true)
  })

  it('checks a panel is fully inside with clearance, including concave notches', () => {
    expect(polygonInside(rect(1, 1, 3, 2), rect(0, 0, 10, 6), 0.4)).toBe(true)
    expect(polygonInside(rect(0.2, 1, 3, 2), rect(0, 0, 10, 6), 0.4)).toBe(false) // too close to edge
    expect(polygonInside(rect(9, 1, 11, 2), rect(0, 0, 10, 6), 0)).toBe(false) // crosses edge
    const corners = rect(3, 3, 9, 4.9)
    expect(polygonInside(corners, L, 0)).toBe(true)
    const notch = rect(4, 4, 6.5, 6.5) // corner (6.5, 6.5) is in the cut-out
    expect(polygonInside(notch, L, 0)).toBe(false)
    // Concave outer whose re-entrant vertex pokes into a long panel that has all corners inside.
    const U = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 6, y: 10 }, { x: 5, y: 4 }, { x: 4, y: 10 }, { x: 0, y: 10 }]
    const across = rect(1, 3.5, 9, 6)
    expect(across.every((p) => pointInPolygon(p, U))).toBe(true)
    expect(polygonInside(across, U, 0)).toBe(false)
  })

  it('detects overlapping and separate panels', () => {
    expect(polygonsOverlap(rect(0, 0, 1, 2), rect(0.5, 0.5, 1.5, 2.5))).toBe(true)
    expect(polygonsOverlap(rect(0, 0, 1, 2), rect(0, 0, 1, 2))).toBe(true)
    expect(polygonsOverlap(rect(0, 0, 1, 2), rect(1.02, 0, 2, 2))).toBe(false)
    expect(polygonsOverlap(rect(0, 0, 1, 2), rect(1.02, 0, 2, 2), { gap: 0.05 })).toBe(true)
    // Plus-sign overlap: no corner of either is inside the other.
    expect(polygonsOverlap(rect(0, 1, 4, 2), rect(1.5, -1, 2.5, 4))).toBe(true)
  })

  it('slices and bands a concave polygon', () => {
    expect(sliceAt(L, 7)).toEqual([[0, 5]])
    expect(sliceAt(L, 2)).toEqual([[0, 10]])
    expect(bandIntervals(L, 4, 6)).toEqual([[0, 5]])
    expect(bandIntervals(L, 1, 3)).toEqual([[0, 10]])
  })

  it('clips and measures overlap area', () => {
    expect(area(clipConvex(rect(0, 0, 4, 4), rect(2, 2, 6, 6)))).toBeCloseTo(4)
    expect(overlapArea(L, rect(4, 4, 6, 6), 0.05)).toBeCloseTo(3, 1)
  })
})
