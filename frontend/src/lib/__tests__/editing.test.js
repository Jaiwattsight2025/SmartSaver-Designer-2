import { describe, expect, it } from 'vitest'
import { editedOutline, editedPitch, faceOverlaps, manualFace } from '../roofFaces'
import { layoutPanels, snapToCell } from '../panelLayout'
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
