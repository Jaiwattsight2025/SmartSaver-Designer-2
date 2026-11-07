// Synthetic geometry only. These are not live Google roof surveys.
import { describe, expect, it } from 'vitest'
import { computeDesign } from '../design'
import { buildDesignJson } from '../designSummary'
import { buildDesignSnapshot } from '../designSnapshot'
import { no3dRoofNote, noCoverageMessage } from '../buildingMatch'
import { markOtherRoofs } from '../mainRoof'
import { fillFace, layoutPanels, validateLayout, winterNoonSunDeg } from '../panelLayout'
import { syntheticRoofFaces, SYNTHETIC_LAT } from '../syntheticFixture'

describe('winter sun from latitude (synthetic)', () => {
  it('matches the usual Australian cities and refuses a missing latitude', () => {
    expect(winterNoonSunDeg(-37.8)).toBe(29) // Melbourne
    expect(winterNoonSunDeg(-33.9)).toBe(33) // Sydney
    expect(winterNoonSunDeg(-42.9)).toBe(24) // Hobart
    expect(winterNoonSunDeg(-12.5)).toBe(54) // Darwin
    expect(winterNoonSunDeg(null)).toBe(null)
  })

  it('spaces tilt-frame rows from the site sun, not a fixed 29°', () => {
    const flat = syntheticRoofFaces().find((f) => f.id === 'syn-flat')
    const melbourne = fillFace({ ...flat, included: true }, { moduleWatts: 440, sunDeg: winterNoonSunDeg(-37.8) })
    const darwin = fillFace({ ...flat, included: true }, { moduleWatts: 440, sunDeg: winterNoonSunDeg(-12.5) })
    expect(darwin.grid.stepV).toBeLessThan(melbourne.grid.stepV)
    const laid = layoutPanels({
      insights: null,
      faces: [{ ...flat, included: true }],
      panelCount: 6,
      moduleWatts: 440,
      state: 'NT',
      latitude: -12.5,
    })
    expect(laid.sunDeg).toBe(54)
    expect(laid.sunSource).toBe('latitude')
    expect(laid.assumptions.find((a) => a.id === 'winter-sun').source).toBe('latitude')
  })

  it('says when row spacing is the Melbourne/Sydney fallback', () => {
    const flat = { ...syntheticRoofFaces().find((f) => f.id === 'syn-flat'), included: true }
    const laid = layoutPanels({ insights: null, faces: [flat], panelCount: 4, moduleWatts: 440, state: 'VIC' })
    expect(laid.sunSource).toBe('fallback')
    expect(laid.notes.join(' ')).toMatch(/no latitude/)
  })
})

describe('synthetic homeowner scenarios', () => {
  const faces = syntheticRoofFaces()

  it('keeps a pitched face flush and a flat face on tilt frames', () => {
    const design = computeDesign({
      profile: null,
      insights: null,
      roofFaces: faces.filter((f) => f.included),
      pv: { moduleWatts: 440, panelCount: 40 },
      battery: { batteryKwh: 0, inverterKw: 10 },
      state: 'VIC',
      layoutOptions: { latitude: SYNTHETIC_LAT },
    })
    const north = design.layout.panels.filter((p) => p.faceId === 'syn-north')
    const flat = design.layout.panels.filter((p) => p.faceId === 'syn-flat')
    expect(north.length).toBeGreaterThan(0)
    expect(flat.length).toBeGreaterThan(0)
    expect(north.every((p) => p.source === 'grid')).toBe(true)
    expect(design.layout.notes.join(' ')).toMatch(/not a structural design/)
    expect(design.validation.ok).toBe(true)
    expect(design.layout.dcKw).toBeLessThanOrEqual(13.2)
  })

  it('does not place panels on a separate block, and a touching lower storey can be included', () => {
    const other = faces.find((f) => f.id === 'syn-other')
    expect(other.included).toBe(false)
    expect(other.otherRoofReason).toMatch(/separate building/)
    const withLower = faces
      .filter((f) => f.id !== 'syn-flat')
      .map((f) => (f.id === 'syn-lower' ? { ...f, included: true } : f))
    const layout = layoutPanels({
      insights: null,
      faces: withLower,
      panelCount: 99,
      moduleWatts: 440,
      state: 'VIC',
      latitude: SYNTHETIC_LAT,
      maxKw: 100,
    })
    expect(layout.panels.some((p) => p.faceId === 'syn-lower')).toBe(true)
    expect(layout.panels.some((p) => p.faceId === 'syn-other')).toBe(false)
    expect(validateLayout(layout, withLower).ok).toBe(true)
  })

  it('labels a rural miss and still lets a traced face be designed', () => {
    const err = Object.assign(new Error('Requested entity was not found.'), { details: { httpStatus: 404 } })
    expect(noCoverageMessage(err)).toMatch(/no 3D roof data/)
    expect(no3dRoofNote([{ source: 'solar-api', outlineShape: 'rectangle' }])).toMatch(/no usable 3D roof model/)
    const traced = faces.filter((f) => f.id === 'syn-north')
    const design = computeDesign({
      profile: null,
      insights: null,
      roofFaces: traced,
      pv: { moduleWatts: 440, panelCount: 8 },
      battery: { batteryKwh: 0, inverterKw: 5 },
      state: 'VIC',
    })
    expect(design.layout.count).toBe(8)
    expect(design.layout.sunSource).toBe('fallback')
  })
})

describe('design snapshot', () => {
  it('freezes faces, overrides, panel ids, kW and validation, and does not change if built again', () => {
    const faces = syntheticRoofFaces().map((f) =>
      f.id === 'syn-north' ? { ...f, pitchDegrees: 18, pitchEdited: true, detectedPitchDegrees: 22, installType: 'tilt', installEdited: true } : f,
    )
    const included = faces.filter((f) => f.included || f.id === 'syn-north')
    const design = computeDesign({
      profile: null,
      insights: null,
      roofFaces: included,
      pv: { moduleWatts: 440, panelCount: 10 },
      battery: { batteryKwh: 0, inverterKw: 5 },
      state: 'VIC',
      layoutOptions: { latitude: SYNTHETIC_LAT },
    })
    const a = buildDesignSnapshot({ roofFaces: included, design, latitude: SYNTHETIC_LAT, state: 'VIC', confirmed: true })
    const b = buildDesignSnapshot({ roofFaces: included, design, latitude: SYNTHETIC_LAT, state: 'VIC', confirmed: true })
    expect(a).toEqual(b)
    expect(a.confirmed).toBe(true)
    expect(a.faces.find((f) => f.id === 'syn-north')).toMatchObject({
      roofPitchDegrees: 18,
      detectedPitchDegrees: 22,
      pitchEdited: true,
      installType: 'tilt',
      installEdited: true,
      mounting: 'tilt-frames',
      panelTiltDegrees: 10,
    })
    expect(a.panelIds).toEqual(design.layout.panels.map((p) => p.id))
    expect(a.dcKw).toBeCloseTo(design.layout.dcKw, 5)
    expect(a.validation.ok).toBe(true)
    expect(a.assumptions.map((x) => x.id)).toContain('tilt-yield')
    expect(a.limitations.join(' ')).toMatch(/not a structural approval/)
    expect(a.winterNoonSunSource).toBe('latitude')

    const json = buildDesignJson({
      profile: { state: 'VIC', postcode: '3000', source: 'manual', annualKwh: 0, importRate: 0.3, supplyPerDay: 1, feedInRate: 0.05, tariffType: 'single', assumed: [] },
      design,
      pv: { moduleWatts: 440 },
      roofFaces: included,
      snapshot: a,
    })
    expect(json.snapshot.panelIds).toEqual(a.panelIds)
    expect(JSON.stringify(json)).not.toMatch(/street|nmi/i)
  })

  it('a wall-joined neighbour on a big building stays out of the snapshot', () => {
    const o = { lat: -37.82, lng: 145 }
    // Reuse the main-roof marker: a far face is already otherRoof on the fixture.
    const faces = syntheticRoofFaces()
    const marked = markOtherRoofs(faces, [], o)
    expect(marked.faces.find((f) => f.id === 'syn-other').included).toBe(false)
  })
})
