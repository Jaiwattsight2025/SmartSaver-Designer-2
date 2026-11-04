import { describe, expect, it } from 'vitest'
import { splitFace, splitPolygonByLine } from '../roofFaces'
import { fromLocal, planAreaM2 } from '../geo'

const O = { lat: -37.8, lng: 145.1 }
const rect = [
  { x: -5, y: -3 },
  { x: 5, y: -3 },
  { x: 5, y: 3 },
  { x: -5, y: 3 },
]

describe('ridge split', () => {
  it('splits a polygon along a line', () => {
    const halves = splitPolygonByLine(rect, { x: -10, y: 0 }, { x: 10, y: 0 })
    expect(halves).toHaveLength(2)
    const area = (p) => Math.abs(p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q.x * r.y - r.x * q.y }, 0)) / 2
    expect(area(halves[0])).toBeCloseTo(30, 6)
    expect(area(halves[1])).toBeCloseTo(30, 6)
  })

  it('returns null when the line misses the face', () => {
    expect(splitPolygonByLine(rect, { x: -10, y: 8 }, { x: 10, y: 8 })).toBeNull()
  })

  it('turns one gable face into two faces that slope away from the ridge', () => {
    const vertices = rect.map((p) => fromLocal(O, p))
    const face = {
      id: 'seg-1',
      label: 'Face 2',
      vertices,
      center: O,
      pitchDegrees: 22,
      azimuthDegrees: 0,
      sunshineKwhM2: 1500,
      sunExposure: 'High',
      included: true,
    }
    const parts = splitFace(face, fromLocal(O, { x: -8, y: 0 }), fromLocal(O, { x: 8, y: 0 }))
    expect(parts).toHaveLength(2)
    const north = parts.find((p) => p.azimuthDegrees === 0)
    const south = parts.find((p) => p.azimuthDegrees === 180)
    expect(north).toBeTruthy()
    expect(south).toBeTruthy()
    expect(north.sunExposure).toBe('High')
    expect(south.sunExposure).toBe('Unknown')
    expect(north.pitchDegrees).toBe(22)
    expect(planAreaM2(north.vertices) + planAreaM2(south.vertices)).toBeCloseTo(60, 0)
    expect(parts.every((p) => p.included && p.splitFrom === 'seg-1')).toBe(true)
  })
})
