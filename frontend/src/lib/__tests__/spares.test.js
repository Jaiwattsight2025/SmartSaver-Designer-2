import { describe, expect, it } from 'vitest'
import { assessFaceArray, canAddPanel, fillFace, layoutPanels, panelSlotStatus } from '../panelLayout'
import { offset } from '../geo'
import { manualFace } from '../roofFaces'

const origin = { lat: -37.8665, lng: 145.1012 }
function rect(id, w, d, pitchDegrees = 22) {
  const b = offset(origin, w, 90)
  const c = offset(b, d, 0)
  const e = offset(origin, d, 0)
  return manualFace({ id, label: id, vertices: [origin, b, c, e], pitchDegrees, azimuthDegrees: 0 })
}

describe('spare slots follow the panels', () => {
  const face = rect('wide', 14, 10)
  const grid = fillFace(face, { moduleWatts: 440 }).cells
  const half = Math.max(2, Math.floor(grid.length / 3))
  const base = layoutPanels({ insights: null, faces: [face], panelCount: half, moduleWatts: 440, state: 'VIC', maxKw: 40 })
  const ids = base.panels.map((p) => p.id)

  function moved(adjust) {
    return layoutPanels({
      insights: null,
      faces: [face],
      panelCount: half,
      moduleWatts: 440,
      state: 'VIC',
      maxKw: 40,
      pinnedPanelIds: ids,
      faceArrays: { wide: { ...adjust, panelIds: ids } },
    })
  }

  it('drops spare slots the moved group covers, and keeps the placed ids', () => {
    const spares = base.candidates.filter((c) => !ids.includes(c.id))
    expect(spares.length).toBeGreaterThan(0)
    const shift = { dxM: 1.2, dyM: 0, rotationDeg: 0 }
    expect(assessFaceArray(face, grid.filter((c) => ids.includes(c.id)), shift).ok).toBe(true)
    const after = moved(shift)
    expect(after.panels.map((p) => p.id)).toEqual(ids)
    expect(after.notes.join(' ')).not.toMatch(/not applied/)
    for (const spare of after.candidates.filter((c) => !ids.includes(c.id))) {
      expect(canAddPanel({ panels: after.panels, cell: spare, face }).ok).toBe(true)
    }
    const covered = spares.filter((s) => !canAddPanel({ panels: after.panels, cell: s, face }).ok)
    expect(covered.length).toBeGreaterThan(0)
    for (const stale of covered) {
      expect(after.candidates.some((c) => c.id === stale.id)).toBe(false)
    }
    const back = moved({ dxM: 0, dyM: 0, rotationDeg: 0 })
    expect(back.candidates.filter((c) => !ids.includes(c.id)).map((c) => c.id).sort()).toEqual(spares.map((c) => c.id).sort())
  })

  it('adds a panel in a vacated spot without moving the ones already placed', () => {
    const after = moved({ dxM: 1.2, dyM: 0, rotationDeg: 0 })
    const spare = after.candidates.find((c) => !ids.includes(c.id))
    expect(spare).toBeTruthy()
    const more = layoutPanels({
      insights: null,
      faces: [face],
      panelCount: half + 1,
      moduleWatts: 440,
      state: 'VIC',
      maxKw: 40,
      pinnedPanelIds: [...ids, spare.id],
      faceArrays: { wide: { dxM: 1.2, dyM: 0, rotationDeg: 0, panelIds: ids } },
    })
    expect(more.panels.map((p) => p.id)).toEqual(expect.arrayContaining(ids))
    expect(more.panels.map((p) => p.id)).toContain(spare.id)
    expect(more.count).toBe(half + 1)
    expect(canAddPanel({ panels: more.panels.filter((p) => p.id !== spare.id), cell: spare, face }).ok).toBe(true)
  })

  it('hides a spare that lands on a no-go area or outside the setback', () => {
    const spare = base.candidates.find((c) => !ids.includes(c.id))
    const blocked = layoutPanels({
      insights: null,
      faces: [face],
      panelCount: half,
      moduleWatts: 440,
      state: 'VIC',
      maxKw: 40,
      obstacles: [{ id: 'vent', vertices: spare.corners }],
    })
    expect(blocked.candidates.some((c) => c.id === spare.id)).toBe(false)
    const outside = panelSlotStatus(
      face,
      spare.uv.map((p) => ({ x: p.x + 30, y: p.y })),
      [],
      { setbackM: 0.4 },
    )
    expect(outside).toMatch(/setback|edge/)
  })
})

describe('tilt row gap', () => {
  it('does not offer a spare in the shadow between tilt-frame rows', () => {
    const face = rect('flat', 8, 8, 2)
    const laid = layoutPanels({ insights: null, faces: [face], panelCount: 2, moduleWatts: 440, state: 'VIC', maxKw: 20 })
    const ids = new Set(laid.panels.map((p) => p.id))
    for (const spare of laid.candidates.filter((c) => !ids.has(c.id))) {
      expect(canAddPanel({ panels: laid.panels, cell: spare, face }).reason).not.toMatch(/tilt-frame row gap/)
    }
    const a = laid.panels[0]
    const hit = [0.35, -0.35, 0.7, -0.7].map((dy) => {
      const uv = a.uv.map((p) => ({ x: p.x, y: p.y + dy }))
      const cell = { ...a, id: 'shade', uv, corners: uv.map((p) => fillFace(face, { moduleWatts: 440 }).frame.toLatLng(p)) }
      return canAddPanel({ panels: [a], cell, face }).reason
    })
    expect(hit.some((reason) => /tilt-frame row gap|overlaps/.test(reason))).toBe(true)
  })
})
