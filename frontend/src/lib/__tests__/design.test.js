import { describe, expect, it } from 'vitest'
import { facesFromBuildingInsights, manualFace } from '../roofFaces'
import { gridPanelsForFace, layoutPanels, orientationFactor } from '../panelLayout'
import {
  batteryPrice,
  billImpact,
  monthlySolarShares,
  paybackYears,
  simulateYear,
  solarPrice,
  suggestedBatteryKwh,
  suggestedInverterKw,
  suggestedPanelCount,
} from '../energyModel'
import { computeDesign } from '../design'
import { buildDesignJson, buildSummaryText } from '../designSummary'
import { profileFromUrl } from '../energyProfile'
import { offset, planAreaM2 } from '../geo'
import { exampleQuery, insightsFixture } from './fixtures'

const profile = profileFromUrl(exampleQuery).profile

describe('geo', () => {
  it('measures a 10 m x 5 m rectangle', () => {
    const a = { lat: -37.8665, lng: 145.1012 }
    const b = offset(a, 10, 90)
    const c = offset(b, 5, 0)
    const d = offset(a, 5, 0)
    expect(planAreaM2([a, b, c, d])).toBeCloseTo(50, 0)
  })
})

describe('roof faces from the Solar API', () => {
  const faces = facesFromBuildingInsights(insightsFixture)
  it('makes one face per segment with pitch, azimuth and area', () => {
    expect(faces).toHaveLength(3)
    expect(faces[0]).toMatchObject({ pitchDegrees: 22.4, azimuthDegrees: 1, orientation: 'North', areaSquareMetres: 62.5, googlePanelCount: 24, sunExposure: 'High' })
    expect(faces[0].vertices.length).toBeGreaterThanOrEqual(4)
  })
  it('includes the sunny north face, excludes the shady south and tiny west faces', () => {
    expect(faces.map((f) => f.included)).toEqual([true, false, false])
  })
  it('handles an empty response', () => {
    expect(facesFromBuildingInsights({})).toEqual([])
  })
})

describe('panel layout', () => {
  const faces = facesFromBuildingInsights(insightsFixture)
  it('uses Google panels on included faces, best first, capped at what fits', () => {
    const l = layoutPanels({ insights: insightsFixture, faces, panelCount: 23, moduleWatts: 440, state: 'VIC' })
    expect(l.available).toBe(24)
    expect(l.count).toBe(23)
    expect(l.source).toBe('solar-api')
    expect(l.dcKw).toBeCloseTo(10.12, 2)
    // 560 kWh DC @400 W -> x1.1 for 440 W -> x0.85 AC
    expect(l.panels[0].yearlyAcKwh).toBeCloseTo(560 * 1.1 * 0.85, 3)
    const many = layoutPanels({ insights: insightsFixture, faces, panelCount: 99, moduleWatts: 440, state: 'VIC' })
    expect(many.count).toBe(24)
  })
  it('adds south panels when the south face is included', () => {
    const f2 = faces.map((f) => (f.segmentIndex === 1 ? { ...f, included: true } : f))
    expect(layoutPanels({ insights: insightsFixture, faces: f2, panelCount: 99, moduleWatts: 400, state: 'VIC' }).available).toBe(36)
  })
  it('grid-fills a traced face', () => {
    const a = { lat: -37.8665, lng: 145.1012 }
    const b = offset(a, 10, 90)
    const c = offset(b, 6, 180)
    const d = offset(a, 6, 180)
    const face = manualFace({ id: 'm1', vertices: [a, b, c, d], pitchDegrees: 20, azimuthDegrees: 0 })
    expect(face.groundAreaSquareMetres).toBeCloseTo(60, 0)
    expect(face.areaSquareMetres).toBeCloseTo(63.9, 0)
    const panels = gridPanelsForFace(face)
    // usable 9.4 m x 5.4 m; panels 1.134 x 1.656 (plan) -> 8 across x 3 rows
    expect(panels.length).toBe(24)
    const l = layoutPanels({ insights: null, faces: [face], panelCount: 10, moduleWatts: 440, state: 'VIC' })
    expect(l.source).toBe('grid')
    expect(l.annualAcKwh).toBeCloseTo(10 * 0.44 * 1314 * orientationFactor(20, 0), 3)
  })
  it('north beats east beats south', () => {
    expect(orientationFactor(20, 0)).toBeGreaterThan(orientationFactor(20, 90))
    expect(orientationFactor(20, 90)).toBeGreaterThan(orientationFactor(20, 180))
  })
})

describe('energy model', () => {
  it('monthly shares sum to 1 and peak in summer', () => {
    const s = monthlySolarShares('VIC')
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
    expect(s[0]).toBeGreaterThan(s[5])
    expect(s[11]).toBeGreaterThan(s[6])
  })
  it('balances energy with and without a battery', () => {
    for (const batteryKwh of [0, 13.5]) {
      const sim = simulateYear({ annualGenKwh: 12000, annualLoadKwh: 11462, batteryKwh, state: 'VIC' })
      const a = sim.annual
      expect(a.genKwh).toBeCloseTo(12000, 6)
      expect(a.loadKwh).toBeCloseTo(11462, 6)
      expect(a.directKwh + a.batteryKwh + a.importKwh).toBeCloseTo(a.loadKwh, 6)
      expect(a.directKwh + a.batteryKwh / 0.9 + a.exportKwh).toBeCloseTo(a.genKwh, 6)
    }
  })
  it('a battery increases self-consumption and savings', () => {
    const noBat = simulateYear({ annualGenKwh: 12000, annualLoadKwh: 11462, batteryKwh: 0, state: 'VIC' })
    const bat = simulateYear({ annualGenKwh: 12000, annualLoadKwh: 11462, batteryKwh: 13.5, state: 'VIC' })
    expect(bat.annual.selfConsumptionPct).toBeGreaterThan(noBat.annual.selfConsumptionPct)
    expect(billImpact(bat, profile).savingAnnual).toBeGreaterThan(billImpact(noBat, profile).savingAnnual)
  })
  it('bill maths uses the profile rates', () => {
    const sim = { annual: { loadKwh: 1000, importKwh: 400, exportKwh: 300, selfConsumedKwh: 600 } }
    const b = billImpact(sim, { importRate: 0.3, supplyPerDay: 1, feedInRate: 0.05 })
    expect(b.beforeAnnual).toBeCloseTo(300 + 365, 6)
    expect(b.afterAnnual).toBeCloseTo(120 + 365 - 15, 6)
    expect(b.savingAnnual).toBeCloseTo(195, 6)
  })
  it('suggests sizes', () => {
    expect(suggestedPanelCount(profile, 440, 'VIC')).toBe(23)
    expect(suggestedPanelCount(null, 440, 'VIC')).toBe(15)
    expect(suggestedInverterKw(10.12)).toBe(8)
    expect(suggestedInverterKw(6.6)).toBe(5)
    expect(suggestedInverterKw(0)).toBe(0)
    expect(suggestedBatteryKwh(profile)).toBe(13.5)
    expect(suggestedBatteryKwh({ ...profile, recommendedBatteryKwh: null, avgDailyKwh: 20 })).toBe(10)
  })
  it('prices from the placeholder tables', () => {
    expect(solarPrice(6.6).mid).toBeCloseTo(6600 * 1.16, 6)
    expect(solarPrice(10.12).perWatt).toBe(0.9)
    expect(batteryPrice(13.5)).toMatchObject({ price: 7490 })
    expect(batteryPrice(13.5).note).toMatch(/priced as the 20 kWh/)
    expect(batteryPrice(25).note).toBeNull()
    expect(batteryPrice(40).price).toBeNull()
    expect(paybackYears(10000, 2000)).toBe(5)
    expect(paybackYears(10000, 0)).toBeNull()
  })
})

describe('whole design', () => {
  const faces = facesFromBuildingInsights(insightsFixture)
  const pv = { moduleWatts: 440, panelCount: 23 }
  const design = computeDesign({ profile, insights: insightsFixture, roofFaces: faces, pv, battery: { batteryKwh: 13.5, inverterKw: null }, state: 'VIC' })
  it('produces consistent numbers', () => {
    expect(design.inverterKw).toBe(8)
    expect(design.layout.dcKw).toBeCloseTo(10.12, 2)
    expect(design.annualGenKwh).toBeGreaterThan(9000)
    expect(design.bill.savingAnnual).toBeGreaterThan(0)
    expect(design.bill.savingAnnual).toBeLessThan(design.bill.beforeAnnual)
    expect(design.pricing.placeholder).toBe(true)
    expect(design.pricing.totalMid).toBeCloseTo(10120 * 0.9 + 7490, 6)
    expect(design.payback.total).toBeGreaterThan(0)
  })
  it('summary JSON has no address-like fields and the text is readable', () => {
    const json = buildDesignJson({ profile, design, pv, roofFaces: faces, now: new Date('2026-11-04T00:00:00Z') })
    expect(json.format).toBe('smartsaver-design')
    expect(json.system).toMatchObject({ panelCount: 23, moduleWatts: 440, solarKw: 10.12, inverterKw: 8, batteryKwh: 13.5 })
    expect(JSON.stringify(json)).not.toMatch(/address|nmi|street/i)
    const text = buildSummaryText({ profile, design, pv })
    expect(text).toMatch(/23 x 440 W panels = 10.12 kW/)
    expect(text).toMatch(/PLACEHOLDER/)
  })
  it('works with no profile and no faces', () => {
    const d = computeDesign({ profile: null, insights: null, roofFaces: [], pv: { moduleWatts: 440, panelCount: 10 }, battery: { batteryKwh: 0, inverterKw: null }, state: null })
    expect(d.layout.count).toBe(0)
    expect(d.bill).toBeNull()
  })
})
