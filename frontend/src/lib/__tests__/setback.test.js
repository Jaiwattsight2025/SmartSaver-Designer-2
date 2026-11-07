import { describe, expect, it } from 'vitest'
import { ROOF_EDGE_SETBACK_M, resolveSetbackM } from '../../config/designerConfig'
import { createEmptyProject } from '../../models/Project'
import { offset } from '../geo'
import { manualFace } from '../roofFaces'
import { canAddPanel, fillFace, layoutPanels, panelSlotStatus, validateLayout } from '../panelLayout'

const origin = { lat: -37.8665, lng: 145.1012 }

function face(id, w, d, azimuthDegrees, label, east = 0) {
  const a = offset(origin, east, 90)
  const b = offset(a, w, 90)
  const c = offset(b, d, 0)
  const e = offset(a, d, 0)
  return manualFace({ id, label, vertices: [a, b, c, e], pitchDegrees: 22, azimuthDegrees })
}

describe('planning setback default', () => {
  it('uses 0.2 m for a new project and for reset, and keeps an explicit saved number', () => {
    expect(ROOF_EDGE_SETBACK_M).toBe(0.2)
    expect(createEmptyProject().design.setbackM).toBeNull()
    expect(resolveSetbackM(null)).toBe(0.2)
    expect(resolveSetbackM(undefined)).toBe(0.2)
    expect(resolveSetbackM(0.2)).toBe(0.2)
    // An older session that stored 0.4, or any other typed value, is not rewritten.
    expect(resolveSetbackM(0.4)).toBe(0.4)
    expect(resolveSetbackM(0.35)).toBe(0.35)
    expect(resolveSetbackM(1.5)).toBe(1.5)
    expect(resolveSetbackM(0.1)).toBe(0.2)
  })

  it('checks the edge, a no-go area, an overlap and a tilt row gap at the setback in use', () => {
    const north = face('north', 10, 6, 0, 'North roof')
    const atDefault = layoutPanels({ insights: null, faces: [north], panelCount: 4, moduleWatts: 440, state: 'VIC' })
    const atExplicit = layoutPanels({
      insights: null,
      faces: [north],
      panelCount: 4,
      moduleWatts: 440,
      state: 'VIC',
      setbackM: 0.4,
    })
    expect(atDefault.count).toBe(4)
    expect(validateLayout(atDefault, [north], { setbackM: 0.2 }).ok).toBe(true)
    expect(validateLayout(atExplicit, [north], { setbackM: 0.4 }).ok).toBe(true)
    const home = layoutPanels({
      insights: null,
      faces: [north],
      panelCount: 6,
      moduleWatts: 440,
      state: 'VIC',
      setbackM: 0.2,
    })
    const vent = { id: 'vent', vertices: home.panels[0].corners }
    const blocked = layoutPanels({
      insights: null,
      faces: [north],
      panelCount: 6,
      moduleWatts: 440,
      state: 'VIC',
      setbackM: 0.2,
      obstacles: [vent],
    })
    expect(blocked.blockedByObstacles).toBeGreaterThan(0)
    expect(blocked.panels.map((p) => p.id)).not.toContain(home.panels[0].id)
    const panel = atExplicit.panels[0]
    const outside = panelSlotStatus(
      north,
      panel.uv.map((p) => ({ x: p.x + 20, y: p.y })),
      [],
      { setbackM: 0.4 },
    )
    expect(outside).toMatch(/0\.4 m setback/)
    expect(panelSlotStatus(north, panel.uv, [panel.uv], { setbackM: 0.2 })).toMatch(/overlaps/)
    const flat = manualFace({
      id: 'flat',
      label: 'Flat',
      vertices: north.vertices,
      pitchDegrees: 2,
      azimuthDegrees: 0,
    })
    const tilt = layoutPanels({ insights: null, faces: [flat], panelCount: 2, moduleWatts: 440, state: 'VIC', setbackM: 0.2 })
    const a = tilt.panels[0]
    const ys = a.uv.map((p) => p.y)
    const height = Math.max(...ys) - Math.min(...ys)
    const frame = fillFace(flat, { moduleWatts: 440, setbackM: 0.2 }).frame
    const reasons = [height + 0.15, -(height + 0.15)].map((dy) => {
      const uv = a.uv.map((p) => ({ x: p.x, y: p.y + dy }))
      return canAddPanel({
        panels: [a],
        cell: { ...a, id: 'shade', uv, corners: uv.map((p) => frame.toLatLng(p)) },
        face: flat,
        setbackM: 0.2,
      }).reason
    })
    expect(reasons.some((reason) => /tilt-frame row gap/.test(reason))).toBe(true)
  })
})

describe('an included north face', () => {
  it('is filled when it can hold panels, and is not skipped for being north', () => {
    const north = face('north', 10, 6, 0, 'North roof')
    const south = face('south', 10, 6, 180, 'South roof', 14)
    const laid = layoutPanels({
      insights: null,
      faces: [south, north],
      panelCount: 8,
      moduleWatts: 440,
      state: 'VIC',
    })
    expect(north.orientation).toBe('North')
    expect(laid.panels.filter((p) => p.faceId === 'north').length).toBeGreaterThan(0)
    expect(laid.panels[0].faceId).toBe('north')
    expect(laid.notes.join(' ')).not.toMatch(/North roof: no full panel/)
  })

  it('stays empty only when the inset cannot hold one panel, and says so', () => {
    // About 2.15 m down the slope: inside a 0.4 m inset this is shorter than a panel, so the grid is empty.
    const shallow = face('north', 8, 2.15, 0, 'North roof')
    const wide = face('south', 10, 6, 180, 'South roof', 14)
    const tight = fillFace(shallow, { moduleWatts: 440, setbackM: 0.4 })
    expect(tight.cells).toHaveLength(0)
    const laid = layoutPanels({
      insights: null,
      faces: [shallow, wide],
      panelCount: 12,
      moduleWatts: 440,
      state: 'VIC',
      setbackM: 0.4,
    })
    expect(laid.panels.filter((p) => p.faceId === 'north')).toHaveLength(0)
    expect(laid.panels.filter((p) => p.faceId === 'south').length).toBeGreaterThan(0)
    expect(laid.notes.join(' ')).toMatch(/North roof: no full panel fits inside the 0.4 m planning setback/)
    const looser = fillFace(shallow, { moduleWatts: 440, setbackM: 0.2 })
    expect(looser.cells.length).toBeGreaterThanOrEqual(tight.cells.length)
  })

  it('keeps spare spots on a ticked face that the target did not fill', () => {
    const north = face('north', 10, 6, 0, 'North roof')
    const south = face('south', 10, 6, 180, 'South roof', 14)
    const laid = layoutPanels({
      insights: null,
      faces: [north, south],
      panelCount: 4,
      moduleWatts: 440,
      state: 'VIC',
      setbackM: 0.2,
    })
    const southPlaced = laid.panels.filter((p) => p.faceId === 'south')
    const southSpares = laid.candidates.filter((c) => c.faceId === 'south' && !laid.panels.some((p) => p.id === c.id))
    expect(southPlaced).toHaveLength(0)
    expect(southSpares.length).toBeGreaterThan(0)
    expect(laid.notes.join(' ')).toMatch(/South roof:/)
  })
})
