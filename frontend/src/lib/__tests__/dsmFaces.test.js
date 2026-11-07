import { describe, expect, it } from 'vitest'
import { rasterFrame, refineFacesWithDsm, DSM_NOTE } from '../dsmFaces'
import { latLngToUtm } from '../utm'
import { layersRadius, cacheKey } from '../../services/dataLayers'

const ORIGIN = { lat: -37.8, lng: 145.0 }

describe('rasterFrame', () => {
  it('maps the raster onto local metres around the origin (north up, east right)', () => {
    const { easting, northing } = latLngToUtm(ORIGIN.lat, ORIGIN.lng, 55, true)
    const layers = { width: 100, height: 100, originE: easting - 12.5, originN: northing + 12.5, resM: 0.25, epsg: 32755 }
    const f = rasterFrame(layers, ORIGIN)
    const c = f.toLocal(50, 50)
    expect(Math.abs(c.x)).toBeLessThan(0.05)
    expect(Math.abs(c.y)).toBeLessThan(0.05)
    expect(f.toLocal(60, 50).x - c.x).toBeCloseTo(2.5, 1) // east
    expect(f.toLocal(50, 60).y - c.y).toBeCloseTo(-2.5, 1) // rows go south
  })
})

const face = (id, segmentIndex, extra = {}) => ({
  id,
  segmentIndex,
  vertices: [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.0001 }, { lat: 0.0001, lng: 0 }],
  pitchDegrees: 20,
  outlineShape: 'rect',
  outlineConfidence: 'low',
  outlineNote: 'est',
  areaSquareMetres: 30,
  googlePanelCount: 5,
  sunshineKwhM2: 1500,
  included: false,
  ...extra,
})
const sq = [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.00005 }, { lat: 0.00005, lng: 0.00005 }, { lat: 0.00005, lng: 0 }]

describe('refineFacesWithDsm', () => {
  it('uses good traces, keeps the estimate as fallback and leaves poor or edited faces alone', () => {
    const faces = [face('a', 0), face('b', 1), face('c', 2, { outlineEdited: true }), face('m', null)]
    const traced = {
      faces: [
        { index: 0, confidence: 'high', vertices: sq, metrics: {} },
        { index: 1, confidence: 'low', vertices: sq, metrics: {} },
        { index: 2, confidence: 'high', vertices: sq, metrics: {} },
      ],
    }
    const { faces: out, refined } = refineFacesWithDsm(faces, traced)
    expect(refined).toBe(1)
    expect(out[0].outlineShape).toBe('dsm')
    expect(out[0].outlineNote).toBe(DSM_NOTE)
    expect(out[0].vertices).toBe(sq)
    expect(out[0].estimateVertices).toBe(faces[0].vertices)
    expect(out[0].estimateConfidence).toBe('low')
    expect(out[0].included).toBe(true) // was left out only for a rough estimate
    expect(out[1]).toBe(faces[1])
    expect(out[2]).toBe(faces[2])
    expect(out[3]).toBe(faces[3])
  })

  it('keeps the estimate when the 3D trace was rejected, and says why', () => {
    const faces = [face('a', 0, { outlineConfidence: 'medium', outlineNote: 'Estimated.' })]
    const traced = {
      faces: [{ index: 0, confidence: 'low', vertices: sq, metrics: { rejectReason: '3D outline left out: it was about 3.9× this face and may include the next building.' } }],
    }
    const { faces: out, refined } = refineFacesWithDsm(faces, traced)
    expect(refined).toBe(0)
    expect(out[0].vertices).toBe(faces[0].vertices)
    expect(out[0].outlineShape).toBe('rect')
    expect(out[0].dsmRejectNote).toMatch(/next building/)
  })

  it('returns the faces untouched without a trace', () => {
    const faces = [face('a', 0)]
    expect(refineFacesWithDsm(faces, null)).toEqual({ faces, refined: 0 })
  })
})

describe('dataLayers helpers', () => {
  it('sizes the radius to the building box plus a margin, within limits', () => {
    const ins = { boundingBox: { sw: { latitude: -37.8001, longitude: 144.9999 }, ne: { latitude: -37.7999, longitude: 145.0001 } } }
    const r = layersRadius(ins)
    expect(r).toBeGreaterThan(20)
    expect(r).toBeLessThan(30)
    expect(layersRadius({})).toBe(30)
  })
  it('keys the cache by building', () => {
    expect(cacheKey({ name: 'buildings/x', center: { latitude: 1, longitude: 2 } })).toBe('buildings/x|1.000000,2.000000')
  })
})
