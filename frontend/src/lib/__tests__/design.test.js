import { describe, expect, it } from 'vitest'
import { facesFromBuildingInsights, manualFace } from '../roofFaces'
import { gridPanelsForFace, layoutPanels, orientationFactor, snapToCell, validateLayout } from '../panelLayout'
import {
  billImpact,
  monthlySolarShares,
  paybackYears,
  simulateYear,
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
    expect(faces[0]).toMatchObject({ pitchDegrees: 22.4, azimuthDegrees: 1.2, orientation: 'North', areaSquareMetres: 62.5, googlePanelCount: 24, sunExposure: 'High' })
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
  it('fills the north face on its own grid, ranks by Google yield, capped at what fits', () => {
    const l = layoutPanels({ insights: insightsFixture, faces, panelCount: 20, moduleWatts: 440, state: 'VIC', setbackM: 0.4 })
    expect(l.available).toBe(21) // 0.4 m setback, 1.134 m modules (Google packed 24 smaller ones)
    expect(l.count).toBe(20)
    expect(l.source).toBe('solar-api')
    expect(l.dcKw).toBeCloseTo(8.8, 2)
    // The best spot takes the nearest Google panel's yield: 560 kWh DC @400 W -> x1.1 for 440 W -> x0.85 AC
    const top = 560 * 1.1 * 0.85
    expect(l.panels[0].yearlyAcKwh).toBeGreaterThan(0.97 * top)
    expect(Math.max(...l.panels.map((p) => p.yearlyAcKwh))).toBeCloseTo(top, 3)
    expect(l.panels.every((p) => p.faceId === 'seg-0')).toBe(true)
    const many = layoutPanels({ insights: insightsFixture, faces, panelCount: 99, moduleWatts: 440, state: 'VIC', setbackM: 0.4 })
    expect(many.count).toBe(21)
    expect(validateLayout(many, faces).ok).toBe(true)
  })
  it('adds south panels when the south face is included, never overlapping', () => {
    const f2 = faces.map((f) => (f.segmentIndex === 1 ? { ...f, included: true } : f))
    const l = layoutPanels({ insights: insightsFixture, faces: f2, panelCount: 99, moduleWatts: 400, state: 'VIC' })
    expect(l.available).toBeGreaterThan(21)
    expect(l.panels.filter((p) => p.faceId === 'seg-1').length).toBeGreaterThan(0)
    // North panels first (better yield).
    expect(l.panels[0].faceId).toBe('seg-0')
    expect(validateLayout(l, f2).ok).toBe(true)
  })
  it('fills a traced face with the setback, rows from the gutter, portrait or landscape', () => {
    const a = { lat: -37.8665, lng: 145.1012 }
    const b = offset(a, 10, 90)
    const c = offset(b, 6, 180)
    const d = offset(a, 6, 180)
    const face = manualFace({ id: 'm1', vertices: [a, b, c, d], pitchDegrees: 20, azimuthDegrees: 0 })
    expect(face.groundAreaSquareMetres).toBeCloseTo(60, 0)
    expect(face.areaSquareMetres).toBeCloseTo(63.9, 0)
    // At the previous 0.4 m inset: usable 9.2 m x 5.2 m; portrait 1.134 x 1.656 (plan) -> 7 across x 3 rows
    expect(gridPanelsForFace(face, { setbackM: 0.4 }).length).toBe(21)
    expect(gridPanelsForFace(face).length).toBeGreaterThanOrEqual(21)
    // landscape 1.762 x 1.066 (plan) -> 5 across x 4 rows at 0.4 m
    expect(gridPanelsForFace(face, { orientation: 'landscape', setbackM: 0.4 }).length).toBe(20)
    // bigger setback, fewer panels
    expect(gridPanelsForFace(face, { setbackM: 1 }).length).toBeLessThan(21)
    const l = layoutPanels({ insights: null, faces: [face], panelCount: 10, moduleWatts: 440, state: 'VIC' })
    expect(l.source).toBe('grid')
    expect(l.annualAcKwh).toBeCloseTo(10 * 0.44 * 1314 * orientationFactor(20, 0), 3)
    // First row hugs the gutter (south edge for a north-facing roof).
    expect(l.panels[0].row).toBe(0)
  })
  it('keeps every panel strictly inside a hip (trapezoid) face', () => {
    const a = { lat: -37.8665, lng: 145.1012 }
    const b = offset(a, 10, 90)
    const c = offset(b, 4, 0)
    const c2 = offset(c, 3, 270)
    const d = offset(a, 4, 0)
    const d2 = offset(d, 3, 90)
    // Gutter a-b on the north side? No: azimuth 180 faces south, gutter is the a-b edge.
    const face = manualFace({ id: 'hip', vertices: [a, b, c2, d2], pitchDegrees: 22, azimuthDegrees: 180 })
    const l = layoutPanels({ insights: null, faces: [face], panelCount: 99, moduleWatts: 440, state: 'VIC' })
    expect(l.count).toBeGreaterThan(0)
    expect(validateLayout(l, [face]).ok).toBe(true)
  })
  it('respects removed spots, pins, no-go areas and the kW cap', () => {
    const base = layoutPanels({ insights: insightsFixture, faces, panelCount: 5, moduleWatts: 440, state: 'VIC' })
    const gone = base.panels[0].id
    const pin = base.candidates[base.candidates.length - 1].id
    const l = layoutPanels({ insights: insightsFixture, faces, panelCount: 5, moduleWatts: 440, state: 'VIC', removedPanelIds: [gone], pinnedPanelIds: [pin] })
    expect(l.panels.map((p) => p.id)).not.toContain(gone)
    expect(l.panels[0].id).toBe(pin)
    // No-go area over the first panel's spot.
    const ob = { id: 'o1', vertices: base.panels[1].corners }
    const lo = layoutPanels({ insights: insightsFixture, faces, panelCount: 99, moduleWatts: 440, state: 'VIC', obstacles: [ob] })
    expect(lo.available).toBeLessThan(21)
    expect(lo.blockedByObstacles).toBeGreaterThan(0)
    expect(validateLayout(lo, faces, { obstacles: [ob] }).ok).toBe(true)
    // kW cap.
    const capped = layoutPanels({ insights: insightsFixture, faces, panelCount: 99, moduleWatts: 440, state: 'VIC', maxKw: 5 })
    expect(capped.count).toBe(11)
    expect(capped.capped).toBe(true)
    // Snap to the nearest free spot.
    expect(snapToCell(base.candidates, base.candidates[3].center).id).toBe(base.candidates[3].id)
  })
  it('validation catches a panel outside the roof and overlapping panels', () => {
    const l = layoutPanels({ insights: insightsFixture, faces, panelCount: 3, moduleWatts: 440, state: 'VIC' })
    const shifted = l.panels[0].corners.map((c) => offset(c, 30, 0))
    const bad = { ...l, panels: [...l.panels, { ...l.panels[0], id: 'x', corners: shifted }, { ...l.panels[1], id: 'y' }] }
    const v = validateLayout(bad, faces)
    expect(v.ok).toBe(false)
    expect(v.issues.map((i) => i.message).join(' ')).toMatch(/crosses the roof edge/)
    expect(v.issues.map((i) => i.message).join(' ')).toMatch(/overlap/)
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
  it('simple payback is cost over a positive saving', () => {
    expect(paybackYears(10000, 2000)).toBe(5)
    expect(paybackYears(10000, 0)).toBeNull()
    expect(paybackYears(10000, -1)).toBeNull()
  })
})

describe('whole design', () => {
  const faces = facesFromBuildingInsights(insightsFixture)
  const pv = { moduleWatts: 440, panelCount: 20 }
  const design = computeDesign({ profile, insights: insightsFixture, roofFaces: faces, pv, battery: { batteryKwh: 13.5, inverterKw: null }, state: 'VIC' })
  it('produces consistent numbers', () => {
    expect(design.inverterKw).toBe(8)
    expect(design.layout.dcKw).toBeCloseTo(8.8, 2)
    expect(design.annualGenKwh).toBeGreaterThan(9000)
    expect(design.bill.savingAnnual).toBeGreaterThan(0)
    expect(design.bill.savingAnnual).toBeLessThan(design.bill.beforeAnnual)
    expect(design.pricing.solar.standard.aud).toBe(7902)
    expect(design.pricing.solar.standard.derived).toBe(true)
    expect(design.pricing.solar.standard.citation).toMatch(/7 kW/)
    expect(design.pricing.solar.standard.citation).toMatch(/10 kW/)
    expect(design.pricing.battery.only.aud).toBe(9760)
    expect(design.pricing.battery.only.derived).toBe(true)
    expect(design.pricing.combinedFromIndices).toBe(false)
    expect(design.payback).toBeNull()
  })
  it('summary JSON has no address-like fields and the text is readable', () => {
    const json = buildDesignJson({ profile, design, pv, roofFaces: faces, now: new Date('2026-11-04T00:00:00Z') })
    expect(json.format).toBe('smartsaver-design')
    expect(json.system).toMatchObject({ panelCount: 20, moduleWatts: 440, solarKw: 8.8, inverterKw: 8, batteryKwh: 13.5 })
    expect(JSON.stringify(json)).not.toMatch(/address|nmi|street/i)
    const text = buildSummaryText({ profile, design, pv })
    expect(text).toMatch(/20 x 440 W panels = 8.80 kW/)
    expect(text).not.toMatch(/PLACEHOLDER|AlphaESS|7490/)
    expect(text).toMatch(/not added together/)
    expect(text).toMatch(/Simple payback is unavailable/)
    const quoted = computeDesign({
      profile,
      insights: insightsFixture,
      roofFaces: faces,
      pv,
      battery: { batteryKwh: 13.5, inverterKw: null },
      state: 'VIC',
      installerQuoteAud: 20000,
    })
    const quotedText = buildSummaryText({ profile, design: quoted, pv })
    expect(quoted.payback.kind).toBe('user-quote')
    expect(quoted.payback.years).toBeCloseTo(20000 / quoted.bill.savingAnnual, 6)
    expect(quotedText).toMatch(/installer quote of \$20,000/)
  })
  it('works with no profile and no faces', () => {
    const d = computeDesign({ profile: null, insights: null, roofFaces: [], pv: { moduleWatts: 440, panelCount: 10 }, battery: { batteryKwh: 0, inverterKw: null }, state: null })
    expect(d.layout.count).toBe(0)
    expect(d.bill).toBeNull()
  })
})
