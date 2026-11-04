// D2.3: fixes from the multi-address check (synthetic geometry only).
import { describe, expect, it } from 'vitest'
import { flagNonRoofFaces } from '../nonRoof'
import { buildingMatch, buildingMatchWarning, noCoverageMessage } from '../buildingMatch'
import { fillFace, layoutPanels, mountFor, panelFootprint, tiltFrameGain, tiltRowShadowGapM, validateLayout } from '../panelLayout'
import { manualFace } from '../roofFaces'
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

describe('flat buildings and two-storey homes are not flagged as verandahs', () => {
  it('a flat face on a flat-roofed building is fine (no "nearly flat" or bad-ground "below main" reasons)', () => {
    const main = face({ id: 'm', pitchDegrees: 2, areaSquareMetres: 600, dsmMetrics: { heightM: 31, heightAboveGroundM: 9 } })
    const lower = face({ id: 'l', pitchDegrees: 4, areaSquareMetres: 40, dsmMetrics: { heightM: 27.5, heightAboveGroundM: -5.9 } })
    const out = flagNonRoofFaces([main, lower], null)
    expect(out.map((f) => f.nonRoofLikely ?? false)).toEqual([false, false])
    expect(out[1].included).toBe(true)
  })
  it('a lower storey roof well above the ground is not "below the main roof"', () => {
    const upper = face({ id: 'u', areaSquareMetres: 60, dsmMetrics: { heightM: 80, heightAboveGroundM: 6.5 } })
    const lower = face({
      id: 'l',
      areaSquareMetres: 12,
      outlineConfidence: 'medium',
      dsmMetrics: { heightM: 77, heightAboveGroundM: 3.4 },
    })
    const out = flagNonRoofFaces([upper, lower], null)
    expect(out[1].nonRoofLikely).toBeFalsy()
    expect(out[1].included).toBe(true)
  })
  it('a verandah on a pitched house is still flagged', () => {
    const main = face({ id: 'm', dsmMetrics: { heightM: 72, heightAboveGroundM: 3.5 } })
    const ver = face({ id: 'v', pitchDegrees: 6, areaSquareMetres: 12, dsmMetrics: { heightM: 70.5, heightAboveGroundM: 2.1 } })
    expect(flagNonRoofFaces([main, ver], null)[1].nonRoofLikely).toBe(true)
  })
  it('falls back to "below the main roof" when the ground estimate is implausible', () => {
    const main = face({ id: 'm', dsmMetrics: { heightM: 72, heightAboveGroundM: 4 } })
    const ver = face({ id: 'v', pitchDegrees: 6, areaSquareMetres: 30, dsmMetrics: { heightM: 70, heightAboveGroundM: -2 } })
    const out = flagNonRoofFaces([main, ver], null)
    expect(out[1].nonRoofLikely).toBe(true)
    expect(out[1].nonRoofReasons.join(' ')).toMatch(/below the main roof/)
  })
  it('a near-vertical strip is a wall and is flagged on its own', () => {
    const main = face({ id: 'm' })
    const wall = face({ id: 'w', pitchDegrees: 78, areaSquareMetres: 30, vertices: rectV(offset(o, 10, 90), 6, 3) })
    const out = flagNonRoofFaces([main, wall], null)
    expect(out[1].nonRoofLikely).toBe(true)
    expect(out[1].nonRoofReasons[0]).toMatch(/wall/)
  })
})

describe('flat roofs use north-facing tilt frames', () => {
  // 20 m x 12 m flat roof, drawn with its long side east-west.
  const flat = manualFace({ id: 'flat', label: 'flat', vertices: rectV(o, 20, 12), pitchDegrees: 1, azimuthDegrees: 200 })
  it('mount rules', () => {
    expect(mountFor(flat)).toEqual({ flat: true, tiltDeg: 10, azimuthDeg: 0 })
    expect(mountFor({ pitchDegrees: 22, azimuthDegrees: 90 })).toEqual({ flat: false, tiltDeg: 22, azimuthDeg: 90 })
    expect(tiltRowShadowGapM(1.722)).toBeGreaterThan(0.45)
    expect(tiltRowShadowGapM(1.722)).toBeLessThan(0.65)
    const fp = panelFootprint(flat, { widthM: 1.134, heightM: 1.722, orientation: 'portrait' })
    expect(fp.down).toBeCloseTo(1.722 * Math.cos((10 * Math.PI) / 180), 3)
    expect(fp.shadowGapM).toBeGreaterThan(0.45)
  })
  it('rows face north whatever azimuth Google gave, spaced for winter shade', () => {
    const { cells, frame, grid } = fillFace(flat, { moduleWatts: 440 })
    expect(frame.axes.down.y).toBeGreaterThan(0.99) // "down the slope" = north
    expect(grid.stepV).toBeGreaterThan(grid.h + 0.45)
    const rows = new Set(cells.map((c) => c.row))
    expect(rows.size).toBeGreaterThanOrEqual(4)
    expect(rows.size).toBeLessThanOrEqual(6) // flush would give 7
  })
  it('layout is valid, groups of 4+, and says it used tilt frames', () => {
    const l = layoutPanels({ insights: null, faces: [flat], panelCount: 20, moduleWatts: 440, state: 'VIC' })
    expect(l.count).toBe(20)
    expect(l.notes.join(' ')).toMatch(/tilt frames facing north/)
    expect(validateLayout(l, [flat]).ok).toBe(true)
  })
  it("Google's flush yields on a flat face are raised for the tilt frame, so flat roofs are not ranked unfairly", () => {
    expect(tiltFrameGain({ pitchDegrees: 1, azimuthDegrees: 200 })).toBeGreaterThan(1.03)
    expect(tiltFrameGain({ pitchDegrees: 22, azimuthDegrees: 0 })).toBe(1)
    const seg = { ...flat, id: 'seg-0', source: 'solar-api', segmentIndex: 0 }
    const insights = {
      solarPotential: {
        panelCapacityWatts: 400,
        panelHeightMeters: 1.879,
        panelWidthMeters: 1.045,
        solarPanels: [{ segmentIndex: 0, center: { latitude: seg.center.lat, longitude: seg.center.lng }, yearlyEnergyDcKwh: 500 }],
      },
    }
    const l = layoutPanels({ insights, faces: [seg], panelCount: 4, moduleWatts: 400, state: 'VIC' })
    expect(l.count).toBe(4)
    for (const p of l.panels) expect(p.yearlyAcKwh).toBeCloseTo(500 * 0.85 * tiltFrameGain(seg), 1)
  })
  it('pitched faces are unchanged (no tilt-frame note)', () => {
    const pitched = manualFace({ id: 'p', label: 'p', vertices: rectV(o, 10, 6), pitchDegrees: 20, azimuthDegrees: 0 })
    const l = layoutPanels({ insights: null, faces: [pitched], panelCount: 8, moduleWatts: 440, state: 'VIC' })
    expect(l.notes.join(' ')).not.toMatch(/tilt frames/)
    expect(fillFace(pitched).grid.stepV).toBeLessThan(fillFace(pitched).grid.h + 0.1)
  })
})

describe('wrong building and no coverage', () => {
  const box = (sw, ne) => ({ boundingBox: { sw: { latitude: sw.lat, longitude: sw.lng }, ne: { latitude: ne.lat, longitude: ne.lng } } })
  const sw = o
  const ne = offset(offset(o, 12, 90), 10, 0)
  const insights = box(sw, ne)
  it('no warning when the locked point is on the building', () => {
    const inside = offset(offset(o, 6, 90), 5, 0)
    expect(buildingMatch(inside, insights).distanceM).toBe(0)
    expect(buildingMatchWarning(inside, insights)).toBe('')
    expect(buildingMatchWarning(offset(o, 2, 270), insights)).toBe('')
  })
  it('warns when Google picked a building away from the centre of the map', () => {
    const away = offset(o, 25, 270)
    expect(buildingMatch(away, insights).distanceM).toBeCloseTo(25, 0)
    expect(buildingMatchWarning(away, insights)).toMatch(/about 25 m .*Reposition/)
  })
  it('missing data reads as plain English', () => {
    const err = Object.assign(new Error('Requested entity was not found.'), { details: { httpStatus: 404 } })
    expect(noCoverageMessage(err)).toMatch(/no 3D roof data/)
    expect(noCoverageMessage(new Error('Quota exceeded'))).toBe('Quota exceeded')
  })
})
