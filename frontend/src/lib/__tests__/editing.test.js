import { describe, expect, it } from 'vitest'
import { editedOutline, editedPitch, faceOverlaps, facesFromBuildingInsights, manualFace } from '../roofFaces'
import { layoutPanels, resolvePanelDrag, snapToCell, validateLayout } from '../panelLayout'
import { insightsFixture } from './fixtures'
import { computeDesign } from '../design'
import { offset } from '../geo'

const a = { lat: -37.8665, lng: 145.1012 }
const rectFace = (id, origin, w, h, extra = {}) => {
  const b = offset(origin, w, 90)
  const c = offset(b, h, 180)
  const d = offset(origin, h, 180)
  return { ...manualFace({ id, vertices: [origin, b, c, d], pitchDegrees: 20, azimuthDegrees: 0 }), ...extra }
}

describe('roof outline editing', () => {
  it('recomputes areas when corners are dragged and keeps the original for reset', () => {
    const face = { ...rectFace('f', a, 10, 6), source: 'solar-api', outlineConfidence: 'low' }
    const b = offset(a, 12, 90)
    const ch = editedOutline(face, [a, b, offset(b, 6, 180), offset(a, 6, 180)])
    expect(ch.groundAreaSquareMetres).toBeCloseTo(72, 0)
    expect(ch.areaSquareMetres).toBeCloseTo(72 / Math.cos((20 * Math.PI) / 180), 0)
    expect(ch.outlineEdited).toBe(true)
    expect(ch.outlineConfidence).toBe('high')
    expect(ch.originalVertices).toBe(face.vertices)
    expect(ch.originalConfidence).toBe('low')
  })
  it('corrects the pitch (tilt quick fix) and the sloped area', () => {
    const face = rectFace('f', a, 10, 6)
    const ch = editedPitch(face, 30)
    expect(ch.pitchDegrees).toBe(30)
    expect(ch.areaSquareMetres).toBeCloseTo(60 / Math.cos(Math.PI / 6), 0)
    expect(editedPitch(face, 90).pitchDegrees).toBe(60)
  })
  it('flags faces whose outlines overlap', () => {
    const f1 = { ...rectFace('f1', a, 10, 6), included: true }
    const f2 = { ...rectFace('f2', offset(a, 8, 90), 10, 6), included: true } // 2 m x 6 m overlap
    const o = faceOverlaps([f1, f2])
    expect(o.length).toBe(1)
    expect(o[0].areaM2).toBeGreaterThan(10)
    expect(o[0].areaM2).toBeLessThan(14)
    expect(faceOverlaps([f1, { ...f2, included: false }])).toEqual([])
  })
})

describe('panel editing', () => {
  const face = { ...rectFace('m1', a, 10, 6), included: true }
  const base = { insights: null, faces: [face], moduleWatts: 440, state: 'VIC' }
  it('removed spots come back as ghosts and can be re-added by pinning', () => {
    const l = layoutPanels({ ...base, panelCount: 10 })
    const id = l.panels[0].id
    const l2 = layoutPanels({ ...base, panelCount: 9, removedPanelIds: [id] })
    expect(l2.panels.map((p) => p.id)).not.toContain(id)
    expect(l2.removedCells.map((c) => c.id)).toContain(id)
    const l3 = layoutPanels({ ...base, panelCount: 10, pinnedPanelIds: [id] })
    expect(l3.panels[0].id).toBe(id)
  })
  it('drag-and-snap picks the nearest free spot', () => {
    const l = layoutPanels({ ...base, panelCount: 5 })
    const target = l.candidates[l.candidates.length - 1]
    const cell = snapToCell(l.candidates, offset(target.center, 0.3, 90), { exclude: l.panels.map((p) => p.id) })
    expect(cell.id).toBe(target.id)
  })
  it('a shaky click removes the panel; a drag onto the next slot moves it; a drag into empty space does not', () => {
    const l = layoutPanels({ ...base, panelCount: 8 })
    const panel = l.panels[0]
    const placed = new Set(l.panels.map((p) => p.id))
    const ghost = l.candidates.find((c) => !placed.has(c.id))
    expect(ghost).toBeTruthy()
    const jitter = offset(panel.center, 0.45, 90)
    expect(resolvePanelDrag(panel.center, jitter, l.candidates, { exclude: [...placed] }).type).toBe('remove')
    const reach = resolvePanelDrag(panel.center, ghost.center, l.candidates, { exclude: [...placed] })
    expect(reach.type).toBe('move')
    expect(reach.cell.id).toBe(ghost.id)
    const gone = resolvePanelDrag(panel.center, offset(panel.center, 4, 45), l.candidates, { exclude: [...placed] })
    expect(gone.type).toBe('cancel')
    const moved = layoutPanels({
      ...base,
      panelCount: l.count,
      removedPanelIds: [panel.id],
      pinnedPanelIds: [ghost.id],
    })
    expect(moved.panels.map((p) => p.id)).toContain(ghost.id)
    expect(moved.panels.map((p) => p.id)).not.toContain(panel.id)
    expect(moved.dcKw).toBeCloseTo(l.dcKw, 5)
    expect(validateLayout(moved, [face]).ok).toBe(true)
  })
  it('removing one panel keeps the rest, including when yields differ, and stays under the kW cap', () => {
    const faces = facesFromBuildingInsights(insightsFixture).map((f) => ({ ...f, included: f.segmentIndex === 0 }))
    const baseL = layoutPanels({ insights: insightsFixture, faces, panelCount: 10, moduleWatts: 440, state: 'VIC' })
    const gone = baseL.panels[4].id
    const next = layoutPanels({
      insights: insightsFixture,
      faces,
      panelCount: 9,
      moduleWatts: 440,
      state: 'VIC',
      removedPanelIds: [gone],
    })
    expect(next.panels.map((p) => p.id).sort()).toEqual(baseL.panels.map((p) => p.id).filter((id) => id !== gone).sort())
    expect(validateLayout(next, faces).ok).toBe(true)
    const capped = layoutPanels({
      insights: insightsFixture,
      faces,
      panelCount: 99,
      moduleWatts: 440,
      state: 'VIC',
      maxKw: 5,
      removedPanelIds: [gone],
    })
    expect(capped.count).toBeLessThanOrEqual(11)
    expect(capped.dcKw).toBeLessThanOrEqual(5)
    expect(capped.panels.map((p) => p.id)).not.toContain(gone)
    expect(validateLayout(capped, faces).ok).toBe(true)
  })
  it('computeDesign reports validation and an inverter error when oversized', () => {
    const d = computeDesign({
      profile: null,
      insights: null,
      roofFaces: [face],
      pv: { moduleWatts: 440, panelCount: 20 },
      battery: { batteryKwh: 0, inverterKw: 5 },
      state: 'VIC',
      layoutOptions: { orientation: 'portrait' },
    })
    expect(d.layout.count).toBe(20)
    expect(d.validation.ok).toBe(false)
    expect(d.validation.issues.some((i) => /inverter/.test(i.message))).toBe(true)
    const ok = computeDesign({
      profile: null,
      insights: null,
      roofFaces: [face],
      pv: { moduleWatts: 440, panelCount: 10 },
      battery: { batteryKwh: 0, inverterKw: 5 },
      state: 'VIC',
    })
    expect(ok.validation.ok).toBe(true)
  })
})
