import { describe, expect, it } from 'vitest'
import { toLatLng, toLocal } from '../geo'
import { area, pointInPolygon } from '../polygon'
import { candidateShapes, estimateSegmentOutline, faceAxes, fromFaceUV, rectangleInBox, toFaceUV } from '../roofOutline'
import { facesFromBuildingInsights } from '../roofFaces'
import { insightsFixture } from './fixtures'

describe('roof outlines', () => {
  it('face axes: down-slope follows the azimuth, round-trips', () => {
    const ax = faceAxes(0)
    expect(ax.down.y).toBeCloseTo(1)
    const p = { x: 3, y: -2 }
    const q = fromFaceUV(toFaceUV(p, faceAxes(37)), faceAxes(37))
    expect(q.x).toBeCloseTo(3)
    expect(q.y).toBeCloseTo(-2)
  })

  it('recovers a turned rectangle from its bounding box', () => {
    const a = 10
    const b = 4
    const t = (20 * Math.PI) / 180
    const W = a * Math.cos(t) + b * Math.sin(t)
    const H = a * Math.sin(t) + b * Math.cos(t)
    const r = rectangleInBox(W, H, 20, a * b)
    expect(r.a).toBeCloseTo(10, 6)
    expect(r.b).toBeCloseTo(4, 6)
    expect(r.conditioned).toBe(true)
  })

  it('offers hip and valley shapes when the area is below the rectangle', () => {
    const s = candidateShapes(10, 4, 28)
    expect(s.map((x) => x.kind)).toEqual(['rectangle', 'hip', 'valley'])
    expect(area(s[1].uv)).toBeCloseTo(28)
    // Hip: the long edge is the gutter (+v side).
    const gutter = s[1].uv.filter((p) => p.y > 0)
    expect(Math.abs(gutter[0].x - gutter[1].x)).toBeCloseTo(10)
    expect(candidateShapes(10, 4, 20.2)[1].kind).toBe('triangle')
  })

  it('fixture faces contain all of Google\u2019s panel spots and roughly match the area', () => {
    const faces = facesFromBuildingInsights(insightsFixture)
    const panels = insightsFixture.solarPotential.solarPanels
    for (const f of faces.slice(0, 2)) {
      const origin = toLatLng(f.center)
      const poly = f.vertices.map((v) => toLocal(origin, v))
      const mine = panels.filter((p) => p.segmentIndex === f.segmentIndex)
      expect(mine.every((p) => pointInPolygon(toLocal(origin, toLatLng(p.center)), poly))).toBe(true)
      expect(['high', 'medium']).toContain(f.outlineConfidence)
      expect(area(poly)).toBeGreaterThan(0.6 * f.groundAreaSquareMetres)
      expect(area(poly)).toBeLessThan(1.4 * f.groundAreaSquareMetres)
    }
  })

  it('handles a segment without a bounding box', () => {
    expect(estimateSegmentOutline({}).vertices).toEqual([])
  })
})
