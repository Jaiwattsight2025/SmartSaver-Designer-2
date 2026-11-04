import { describe, expect, it } from 'vitest'
import { flagNonRoofFaces, minWidthM, nonRoofReasons } from '../nonRoof'
import { localGroundM } from '../dsmFaces'
import { makeFrame } from '../roofPlanes'
import { offset } from '../geo'

const o = { lat: -37.8665, lng: 145.1012 }
const rectV = (origin, w, d) => [origin, offset(origin, w, 90), offset(offset(origin, w, 90), d, 0), offset(origin, d, 0)]
const face = (over) => ({
  id: 'f',
  label: 'Face',
  source: 'solar-api',
  included: true,
  pitchDegrees: 22,
  areaSquareMetres: 40,
  outlineConfidence: 'high',
  vertices: rectV(o, 8, 5),
  ...over,
})

describe('likely non-roof faces', () => {
  it('measures the narrowest width', () => {
    expect(minWidthM(rectV(o, 8, 1.5))).toBeCloseTo(1.5, 1)
    expect(minWidthM(rectV(o, 6, 4))).toBeCloseTo(4, 1)
  })
  it('a normal roof face has no reasons', () => {
    expect(nonRoofReasons(face({ dsmMetrics: { heightAboveGroundM: 3.8 } }))).toEqual([])
  })
  it('flags a low, flat, uncertain verandah (like Ashwood face 6) and unticks it', () => {
    const main = face({ id: 'm', segmentIndex: 0, dsmMetrics: { heightM: 72, heightAboveGroundM: 3.5 } })
    const ver = face({
      id: 'v',
      segmentIndex: 1,
      pitchDegrees: 8.1,
      areaSquareMetres: 13.2,
      outlineConfidence: 'medium',
      vertices: rectV(offset(o, 9, 90), 3.3, 4),
      dsmMetrics: { heightM: 70.7, heightAboveGroundM: 2.2 },
    })
    const out = flagNonRoofFaces([main, ver], null)
    expect(out[0].nonRoofLikely).toBeFalsy()
    expect(out[0].included).toBe(true)
    expect(out[1].nonRoofLikely).toBe(true)
    expect(out[1].included).toBe(false)
    expect(out[1].nonRoofReasons.join(' ')).toMatch(/above the ground/)
    expect(out[1].nonRoofReasons.join(' ')).toMatch(/nearly flat/)
  })
  it('uses Google plane heights when there is no 3D data', () => {
    const stats = [{ planeHeightAtCenterMeters: 75 }, { planeHeightAtCenterMeters: 73.5 }]
    const main = face({ id: 'm', segmentIndex: 0 })
    const strip = face({ id: 's', segmentIndex: 1, areaSquareMetres: 9, vertices: rectV(o, 6, 1.4) })
    const out = flagNonRoofFaces([main, strip], { solarPotential: { roofSegmentStats: stats } })
    expect(out[1].nonRoofLikely).toBe(true)
    expect(out[1].nonRoofReasons.join(' ')).toMatch(/below the main roof/)
    expect(out[1].nonRoofReasons.join(' ')).toMatch(/wide/)
  })
  it('one weak signal alone is not enough; edited and manual faces are left alone', () => {
    const small = face({ id: 'a', areaSquareMetres: 7.7, dsmMetrics: { heightAboveGroundM: 1.0 } })
    expect(flagNonRoofFaces([small], null)[0].nonRoofLikely).toBeFalsy()
    const flat = face({ id: 'b', pitchDegrees: 5, areaSquareMetres: 10, outlineConfidence: 'medium' })
    expect(flagNonRoofFaces([{ ...flat, outlineEdited: true }], null)[0].nonRoofLikely).toBeFalsy()
    expect(flagNonRoofFaces([{ ...flat, source: 'manual' }], null)[0].nonRoofLikely).toBeFalsy()
    expect(flagNonRoofFaces([flat], null)[0].nonRoofLikely).toBe(true)
  })
  it('estimates local ground from off-building pixels, ignoring trees', () => {
    const W = 40
    const frame = makeFrame({ a: -5, b: 0.25, c: 0, d: 5, e: 0, f: -0.25 })
    const dsm = new Float32Array(W * W)
    const mask = new Uint8Array(W * W)
    for (let v = 0; v < W; v += 1)
      for (let u = 0; u < W; u += 1) {
        const i = v * W + u
        const onHouse = u >= 12 && u < 28 && v >= 12 && v < 28
        mask[i] = onHouse ? 1 : 0
        dsm[i] = onHouse ? 104 : u < 6 ? 109 : 100 // a row of trees on the left
      }
    const poly = [
      { x: -2, y: -2 },
      { x: 2, y: -2 },
      { x: 2, y: 2 },
      { x: -2, y: 2 },
    ]
    expect(localGroundM({ frame, width: W, height: W, dsm, mask }, poly)).toBeCloseTo(100, 5)
  })
})
