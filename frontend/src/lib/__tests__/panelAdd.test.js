import { describe, expect, it } from 'vitest'
import { manualFace } from '../roofFaces'
import { canAddPanel, fillFace, layoutPanels, nextPanelAdd, sizingLimitKw, validateLayout } from '../panelLayout'
import { buildDesignSnapshot } from '../designSnapshot'
import { offset, toLocal } from '../geo'

const a0 = { lat: -37.8665, lng: 145.1012 }
function rect(id, origin, w, d, azimuthDegrees = 0) {
  const b = offset(origin, w, 90)
  const c = offset(b, d, 0)
  const e = offset(origin, d, 0)
  return manualFace({ id, label: id, vertices: [origin, b, c, e], pitchDegrees: 20, azimuthDegrees })
}
const big = rect('big', a0, 8, 12, 0)
const metres = (a, b) => {
  const d = toLocal(a, b)
  return Math.hypot(d.x, d.y)
}

describe('panel target versus planning size', () => {
  it('an explicit target above 13.2 kW can use the roof fit', () => {
    const open = layoutPanels({ insights: null, faces: [big], panelCount: 99, moduleWatts: 440, state: 'VIC', maxKw: 100 })
    expect(open.spatialCount).toBeGreaterThan(30)
    const planned = layoutPanels({ insights: null, faces: [big], panelCount: 99, moduleWatts: 440, state: 'VIC', maxKw: 13.2 })
    expect(planned.count).toBe(30)
    expect(planned.limitedBy).toBe('planning')
    const kw = sizingLimitKw({ panelCount: open.spatialCount, moduleWatts: 440, planningKw: 13.2 })
    expect(kw).toBeGreaterThan(13.2)
    const raised = layoutPanels({
      insights: null,
      faces: [big],
      panelCount: open.spatialCount,
      moduleWatts: 440,
      state: 'VIC',
      maxKw: kw,
    })
    expect(raised.count).toBe(open.spatialCount)
    expect(raised.limitedBy).not.toBe('planning')
  })
})

describe('adding one panel beside an array', () => {
  const base = layoutPanels({ insights: null, faces: [big], panelCount: 10, moduleWatts: 440, state: 'VIC', maxKw: 20 })
  const ids = base.panels.map((p) => p.id)
  const extra = base.candidates.find((c) => !ids.includes(c.id))

  it('keeps the existing ids and adds the clicked cell', () => {
    expect(extra).toBeTruthy()
    const decision = nextPanelAdd({
      placedIds: ids,
      cell: extra,
      panels: base.panels,
      panelCount: base.panels.length,
      faceArrays: {},
      removedIds: [],
      obstacles: [],
    })
    expect(decision.ok).toBe(true)
    const next = layoutPanels({
      insights: null,
      faces: [big],
      panelCount: decision.patch.panelCount,
      moduleWatts: 440,
      state: 'VIC',
      maxKw: sizingLimitKw({ panelCount: decision.patch.panelCount, moduleWatts: 440, planningKw: 13.2 }),
      pinnedPanelIds: decision.patch.pinnedPanelIds,
    })
    expect(next.panels.map((p) => p.id).sort()).toEqual([...ids, extra.id].sort())
    expect(validateLayout(next, [big]).ok).toBe(true)
  })

  it('after a slide, a clear cell stays put and a covered cell is refused', () => {
    const adjust = { dxM: 0.2, dyM: 0, rotationDeg: 0, panelIds: ids }
    const shifted = layoutPanels({
      insights: null,
      faces: [big],
      panelCount: 10,
      moduleWatts: 440,
      state: 'VIC',
      maxKw: 20,
      pinnedPanelIds: ids,
      faceArrays: { big: adjust },
    })
    expect(shifted.notes.join(' ')).not.toMatch(/not applied/)
    const clear = base.candidates.find(
      (c) => !ids.includes(c.id) && shifted.panels.every((p) => metres(p.center, c.center) > 1.2) && canAddPanel({ panels: shifted.panels, cell: c }).ok,
    )
    expect(clear).toBeTruthy()
    const decision = nextPanelAdd({
      placedIds: ids,
      cell: clear,
      panels: shifted.panels,
      panelCount: shifted.panels.length,
      faceArrays: { big: adjust },
      removedIds: [],
    })
    expect(decision.ok).toBe(true)
    expect(decision.patch.faceArrays.big.panelIds).toEqual(ids)
    const added = layoutPanels({
      insights: null,
      faces: [big],
      panelCount: decision.patch.panelCount,
      moduleWatts: 440,
      state: 'VIC',
      maxKw: 20,
      pinnedPanelIds: decision.patch.pinnedPanelIds,
      faceArrays: decision.patch.faceArrays,
    })
    expect(added.notes.join(' ')).not.toMatch(/not applied/)
    expect(added.panels.map((p) => p.id).sort()).toEqual([...ids, clear.id].sort())
    const newbie = added.panels.find((p) => p.id === clear.id)
    const moved = added.panels.find((p) => p.id === ids[0])
    const grid = base.panels.find((p) => p.id === ids[0])
    expect(metres(newbie.center, clear.center)).toBeLessThan(0.05)
    expect(metres(moved.center, grid.center)).toBeGreaterThan(0.1)
    const covered = nextPanelAdd({
      placedIds: ids,
      cell: extra,
      panels: shifted.panels,
      panelCount: shifted.panels.length,
      faceArrays: { big: adjust },
    })
    expect(covered.ok).toBe(false)
    expect(covered.patch.placementNote).toMatch(/overlaps/)
    const snap = buildDesignSnapshot({
      roofFaces: [big],
      design: { layout: added, validation: { ok: true, issues: [] }, assumptions: [] },
      confirmed: true,
    })
    expect(snap.panelIds.sort()).toEqual([...ids, clear.id].sort())
  })

  it('refuses a spot that overlaps, sits on a no-go area, or crosses the setback', () => {
    const overlap = canAddPanel({ panels: base.panels, cell: { ...base.panels[0], id: 'ghost' } })
    expect(overlap.ok).toBe(false)
    expect(overlap.reason).toMatch(/overlaps/)
    const blocked = canAddPanel({
      panels: base.panels,
      cell: extra,
      obstacles: [{ id: 'vent', vertices: extra.corners }],
    })
    expect(blocked.ok).toBe(false)
    expect(blocked.reason).toMatch(/no-go/)
    const outside = {
      ...extra,
      id: 'out',
      corners: extra.corners.map(() => offset(a0, 40, 90)),
      center: offset(a0, 40, 90),
    }
    const edge = canAddPanel({ panels: [], cell: outside, face: big })
    expect(edge.ok).toBe(false)
    expect(edge.reason).toMatch(/setback/)
    const refused = nextPanelAdd({ placedIds: ids, cell: { ...base.panels[0], id: 'ghost' }, panels: base.panels, panelCount: ids.length })
    expect(refused.ok).toBe(false)
    expect(refused.patch.placementNote).toMatch(/overlaps/)
    expect(refused.patch.pinnedPanelIds).toBeUndefined()
  })

  it('still places a single panel on a small face and on a concave face', () => {
    const small = rect('small', offset(a0, 40, 90), 4.6, 2.6, 0)
    const spots = fillFace(small).cells
    expect(spots.length).toBeGreaterThan(0)
    expect(spots.length).toBeLessThan(4)
    const one = layoutPanels({
      insights: null,
      faces: [small],
      panelCount: 1,
      moduleWatts: 440,
      state: 'VIC',
      maxKw: 13.2,
      pinnedPanelIds: [spots[0].id],
    })
    expect(one.panels.map((p) => p.id)).toEqual([spots[0].id])
    expect(validateLayout(one, [small]).ok).toBe(true)
    const o = a0
    const p = (east, north) => offset(offset(o, east, 90), north, 0)
    const ell = manualFace({
      id: 'ell',
      label: 'ell',
      vertices: [p(0, 0), p(10, 0), p(10, 4), p(5, 4), p(5, 8), p(0, 8)],
      pitchDegrees: 22,
      azimuthDegrees: 0,
    })
    const laid = layoutPanels({ insights: null, faces: [ell], panelCount: 8, moduleWatts: 440, state: 'VIC', maxKw: 20 })
    const have = new Set(laid.panels.map((panel) => panel.id))
    const free = laid.candidates.find((c) => !have.has(c.id))
    expect(free).toBeTruthy()
    const more = layoutPanels({
      insights: null,
      faces: [ell],
      panelCount: laid.panels.length + 1,
      moduleWatts: 440,
      state: 'VIC',
      maxKw: 20,
      pinnedPanelIds: [...have, free.id],
    })
    expect(more.panels.map((panel) => panel.id).sort()).toEqual([...have, free.id].sort())
    expect(validateLayout(more, [ell]).ok).toBe(true)
  })
})
