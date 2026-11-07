import { describe, expect, it } from 'vitest'
import { suggestedPanelCount } from '../energyModel'
import { resolvePlacementCount, layoutPanels, sizingLimitKw } from '../panelLayout'
import { syntheticRoofFaces } from '../syntheticFixture'
import { offset } from '../geo'
import { manualFace } from '../roofFaces'

const included = syntheticRoofFaces().filter((face) => face.included)

function place(panelCount, extra = {}) {
  return layoutPanels({
    insights: null,
    faces: included,
    panelCount,
    moduleWatts: 440,
    state: 'VIC',
    maxKw: sizingLimitKw({
      panelCount: extra.explicit ?? null,
      moduleWatts: 440,
      planningKw: extra.planningKw ?? null,
    }),
    ...extra.layout,
  })
}

describe('untouched target fills every ticked face the planning size allows', () => {
  it('does not stop at the no-bill suggestion while other faces still have room', () => {
    const suggested = suggestedPanelCount(null, 440, 'VIC')
    expect(suggested).toBe(15)
    const fresh = resolvePlacementCount({ panelCount: null, moduleWatts: 440, planningKw: null })
    expect(fresh).toBeGreaterThan(suggested)
    const laid = place(fresh)
    const used = new Set(laid.panels.map((panel) => panel.faceId))
    expect(used.size).toBeGreaterThan(1)
    expect(laid.count).toBeGreaterThan(suggested)
    expect(laid.count).toBe(Math.min(laid.spatialCount, fresh))
    for (const face of included) {
      const fits = laid.faceStats.find((stat) => stat.faceId === face.id)?.fits ?? 0
      if (fits > 0) expect(laid.panels.some((panel) => panel.faceId === face.id)).toBe(true)
    }
  })

  it('keeps an explicit target of 15, including when the planning size is 38 kW', () => {
    const wanted = resolvePlacementCount({ panelCount: 15, moduleWatts: 440, planningKw: 38 })
    expect(wanted).toBe(15)
    const laid = place(wanted, { explicit: 15, planningKw: 38 })
    expect(laid.count).toBe(15)
    expect(laid.dcKw).toBeCloseTo(6.6, 1)
  })

  it('a saved explicit count is not replaced by a later planning-size edit', () => {
    const saved = { panelCount: 15, planningKw: 13.2, moduleWatts: 440 }
    const afterEdit = resolvePlacementCount({ ...saved, planningKw: 38 })
    expect(afterEdit).toBe(15)
  })

  it('lowers the fill when the planning size is the only limit and no target was chosen', () => {
    const cap = resolvePlacementCount({ panelCount: null, moduleWatts: 440, planningKw: 5 })
    expect(cap).toBe(11)
    const laid = place(cap, { planningKw: 5 })
    expect(laid.count).toBeLessThanOrEqual(11)
    expect(laid.count).toBeGreaterThan(0)
  })
})

describe('empty and occupied faces stay distinct', () => {
  const origin = { lat: -37.82, lng: 145 }
  function rect(id, w, d, azimuth, east) {
    const a = offset(origin, east, 90)
    const b = offset(a, w, 90)
    const c = offset(b, d, 0)
    const e = offset(a, d, 0)
    return manualFace({ id, label: id, vertices: [a, b, c, e], pitchDegrees: 22, azimuthDegrees: azimuth })
  }

  it('fills a wide face and leaves a strip that cannot hold one panel empty', () => {
    const wide = rect('wide', 10, 6, 0, 0)
    const strip = rect('strip', 8, 1.2, 180, 16)
    const wanted = resolvePlacementCount({ panelCount: null, moduleWatts: 440, planningKw: null })
    const laid = layoutPanels({
      insights: null,
      faces: [wide, strip],
      panelCount: wanted,
      moduleWatts: 440,
      state: 'VIC',
      maxKw: 13.2,
    })
    expect(laid.panels.filter((panel) => panel.faceId === 'wide').length).toBeGreaterThan(0)
    expect(laid.panels.filter((panel) => panel.faceId === 'strip')).toHaveLength(0)
    expect(laid.faceStats.find((stat) => stat.faceId === 'strip').fits).toBe(0)
  })

  it('does not drop a real grid spot because another face uses the same local coordinates', () => {
    const faces = syntheticRoofFaces().filter((face) => face.included)
    const full = layoutPanels({ insights: null, faces, panelCount: 30, moduleWatts: 440, state: 'VIC', maxKw: 13.2 })
    const gridFits = full.faceStats.reduce((sum, stat) => sum + stat.fits, 0)
    expect(full.spatialCount).toBe(gridFits)
    const dropped = full.panels[full.panels.length - 1].id
    const less = layoutPanels({
      insights: null,
      faces,
      panelCount: 29,
      moduleWatts: 440,
      state: 'VIC',
      maxKw: sizingLimitKw({ panelCount: 29, moduleWatts: 440, planningKw: null }),
      pinnedPanelIds: full.panels.slice(0, -1).map((panel) => panel.id),
    })
    expect(less.candidates.some((cell) => cell.id === dropped)).toBe(true)
    expect(less.spatialCount).toBeGreaterThan(less.count)
  })

  it('adding to an explicit count keeps the panels already placed', () => {
    const wide = rect('wide', 10, 6, 0, 0)
    const first = layoutPanels({ insights: null, faces: [wide], panelCount: 6, moduleWatts: 440, state: 'VIC', maxKw: 20 })
    const ids = first.panels.map((panel) => panel.id)
    const more = layoutPanels({
      insights: null,
      faces: [wide],
      panelCount: 10,
      moduleWatts: 440,
      state: 'VIC',
      maxKw: 20,
      pinnedPanelIds: ids,
    })
    expect(more.panels.map((panel) => panel.id)).toEqual(expect.arrayContaining(ids))
    expect(more.count).toBe(10)
  })
})
