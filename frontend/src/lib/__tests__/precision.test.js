// Synthetic geometry. Not a live roof survey.
import { describe, expect, it } from 'vitest'
import { centreAdjust, interiorPoint, rejectionReason, stepInPlaneRotation, transformUv, wrapDegrees } from '../arrayAdjust'
import { computeDesign } from '../design'
import { buildDesignSnapshot } from '../designSnapshot'
import { offset } from '../geo'
import { assessFaceArray, fillFace, layoutPanels, validateLayout } from '../panelLayout'
import { pointInPolygon } from '../polygon'
import { editedAzimuth, manualFace, resetAzimuth, wrapAzimuth } from '../roofFaces'
import { OUTLINE_EDIT_MAX_ZOOM, shouldAutoFit } from '../outlineEdit'

const o = { lat: -37.8665, lng: 145.1012 }
const rect = (id, w, d, azimuthDegrees = 0) => {
  const b = offset(o, w, 90)
  const c = offset(b, d, 0)
  const e = offset(o, d, 0)
  return manualFace({ id, label: id, vertices: [o, b, c, e], pitchDegrees: 22, azimuthDegrees })
}

describe('roof direction', () => {
  it('wraps 0 and 360 and keeps a manual override', () => {
    expect(wrapAzimuth(360)).toBe(0)
    expect(wrapAzimuth(-10)).toBe(350)
    expect(wrapAzimuth(90.4)).toBe(90.4)
    const face = rect('n', 10, 6, 22)
    const edited = { ...face, ...editedAzimuth(face, 400) }
    expect(edited.azimuthDegrees).toBe(40)
    expect(edited.azimuthEdited).toBe(true)
    expect(edited.vertices).toEqual(face.vertices)
    const again = { ...edited, ...editedAzimuth(edited, 40) }
    expect(resetAzimuth(again).azimuthDegrees).toBe(wrapAzimuth(face.detectedAzimuthDegrees))
    expect(resetAzimuth(again).azimuthEdited).toBe(false)
  })

  it('matching another face copies its direction and the layout follows it', () => {
    const north = rect('n', 12, 6, 0)
    const east = { ...rect('e', 12, 6, 90), id: 'e' }
    const matched = { ...east, ...editedAzimuth(east, north.azimuthDegrees) }
    expect(matched.azimuthDegrees).toBe(0)
    expect(matched.vertices).toEqual(east.vertices)
    const a = fillFace(east, { moduleWatts: 440 })
    const b = fillFace(matched, { moduleWatts: 440 })
    expect(b.frame.axes.down.y).toBeGreaterThan(0.99)
    expect(a.frame.axes.down.x).toBeGreaterThan(0.99)
  })
})

describe('outline edit zoom', () => {
  it('asks for the closest map zoom and does not claim a sharper photo', () => {
    expect(OUTLINE_EDIT_MAX_ZOOM).toBe(21)
    expect(shouldAutoFit(true)).toBe(false)
    expect(shouldAutoFit(false)).toBe(true)
  })
})

describe('capacity', () => {
  it('keeps a 1–3 panel face when a large face is also full, and explains a planning cap', () => {
    const big = rect('big', 16, 10, 0)
    const small = manualFace({
      id: 'small',
      label: 'small',
      vertices: [offset(o, 30, 90), offset(offset(o, 30, 90), 4.6, 90), offset(offset(offset(o, 30, 90), 4.6, 90), 2.6, 0), offset(offset(o, 30, 90), 2.6, 0)],
      pitchDegrees: 20,
      azimuthDegrees: 0,
    })
    const spatial = layoutPanels({ insights: null, faces: [big, small], panelCount: 99, moduleWatts: 440, state: 'VIC', maxKw: 100 })
    const per = spatial.panels.reduce((m, p) => ({ ...m, [p.faceId]: (m[p.faceId] ?? 0) + 1 }), {})
    expect(per.small).toBeGreaterThan(0)
    expect(per.small).toBeLessThan(4)
    expect(spatial.limitedBy).not.toBe('planning')
    const planned = layoutPanels({ insights: null, faces: [big], panelCount: 99, moduleWatts: 440, state: 'VIC', maxKw: 5 })
    expect(planned.capped).toBe(true)
    expect(planned.spatialCount).toBeGreaterThan(planned.count)
    expect(planned.notes.join(' ')).toMatch(/planning assumption/)
    expect(planned.notes.join(' ')).toMatch(/not a statement of what your network allows/)
    expect(validateLayout(spatial, [big, small]).issues.some((i) => /small has only/.test(i.message))).toBe(true)
  })
})

describe('in-plane array alignment', () => {
  const face = rect('wide', 14, 8, 0)
  const laid = layoutPanels({ insights: null, faces: [face], panelCount: 8, moduleWatts: 440, state: 'VIC' })

  it('moves a valid array without changing ids or yield, and rejects a move off the roof', () => {
    const before = laid.panels.map((p) => p.yearlyAcKwh)
    const nudge = assessFaceArray(face, laid.panels, { dxM: 0.1, dyM: 0, rotationDeg: 0 })
    expect(nudge.ok).toBe(true)
    const moved = layoutPanels({
      insights: null,
      faces: [face],
      panelCount: 8,
      moduleWatts: 440,
      state: 'VIC',
      faceArrays: { wide: { dxM: 0, dyM: -0.15, rotationDeg: 0 } },
    })
    expect(moved.panels.map((p) => p.id)).toEqual(laid.panels.map((p) => p.id))
    expect(moved.panels.map((p) => p.yearlyAcKwh)).toEqual(before)
    expect(moved.panels[0].center).not.toEqual(laid.panels[0].center)
    const inner = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    const floating = [[{ x: 4, y: 4 }, { x: 5.2, y: 4 }, { x: 5.2, y: 5.6 }, { x: 4, y: 5.6 }]]
    expect(rejectionReason(transformUv(floating, { rotationDeg: 20 }), inner, [])).toBe('')
    const off = assessFaceArray(face, laid.panels, { dxM: 30, dyM: 0, rotationDeg: 0 })
    expect(off.ok).toBe(false)
    expect(off.reason).toMatch(/setback|edge/)
    const stayed = layoutPanels({
      insights: null,
      faces: [face],
      panelCount: 8,
      moduleWatts: 440,
      state: 'VIC',
      faceArrays: { wide: { dxM: 30, dyM: 0, rotationDeg: 0 } },
    })
    expect(stayed.panels.map((p) => p.id)).toEqual(laid.panels.map((p) => p.id))
    expect(stayed.panels[0].center).toEqual(laid.panels[0].center)
    expect(stayed.notes.join(' ')).toMatch(/not applied/)
    expect(validateLayout(moved, [face]).ok).toBe(true)
  })

  it('does not centre a concave face on a centroid that sits outside the roof', () => {
    const u = [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 8 },
      { x: 6, y: 8 },
      { x: 6, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 8 },
      { x: 0, y: 8 },
    ]
    const average = { x: u.reduce((s, p) => s + p.x, 0) / u.length, y: u.reduce((s, p) => s + p.y, 0) / u.length }
    expect(pointInPolygon(average, u)).toBe(false)
    const inside = interiorPoint(u)
    expect(pointInPolygon(inside, u)).toBe(true)
    const panel = [
      [
        { x: 0.2, y: 0.2 },
        { x: 1.2, y: 0.2 },
        { x: 1.2, y: 1.4 },
        { x: 0.2, y: 1.4 },
      ],
    ]
    const centred = centreAdjust(panel, u, {})
    expect(centred.ok).toBe(true)
    const moved = transformUv(panel, centred.adjust)
    expect(rejectionReason(moved, u, [])).toBe('')
  })

  it('rejects an alignment onto a no-go area', () => {
    const p0 = laid.panels[0]
    const blocked = assessFaceArray(face, laid.panels, { dxM: 0, dyM: 0, rotationDeg: 0 }, { obstacles: [{ id: 'vent', vertices: p0.corners }] })
    expect(blocked.ok).toBe(false)
    expect(blocked.reason).toMatch(/no-go/)
  })
})

describe('snapshot keeps direction and alignment', () => {
  it('records an edited azimuth and an in-plane shift', () => {
    const face = { ...rect('n', 12, 6, 10), ...editedAzimuth(rect('n', 12, 6, 10), 80) }
    const design = computeDesign({
      profile: null,
      insights: null,
      roofFaces: [face],
      pv: { moduleWatts: 440, panelCount: 6 },
      battery: { batteryKwh: 0, inverterKw: 5 },
      state: 'VIC',
      layoutOptions: { faceArrays: { n: { dxM: 0.1, dyM: 0, rotationDeg: 0 } } },
    })
    const snap = buildDesignSnapshot({
      roofFaces: [face],
      design,
      latitude: -37.8,
      state: 'VIC',
      confirmed: true,
      faceArrays: { n: { dxM: 0.1, dyM: 0, rotationDeg: 0 } },
    })
    expect(snap.faces[0]).toMatchObject({ azimuthDegrees: 80, azimuthEdited: true, arrayDxM: 0.1, arrayRotationDeg: 0 })
    expect(snap.panelIds).toEqual(design.layout.panels.map((p) => p.id))
  })
})

describe('one-degree in-plane rotation', () => {
  const face = rect('roomy', 16, 12, 0)
  const pool = fillFace(face, { moduleWatts: 440 }).cells
  const mid = {
    x: pool.reduce((s, c) => s + c.uvCenter.x, 0) / pool.length,
    y: pool.reduce((s, c) => s + c.uvCenter.y, 0) / pool.length,
  }
  const spot = pool.slice().sort((a, b) => {
    const da = (a.uvCenter.x - mid.x) ** 2 + (a.uvCenter.y - mid.y) ** 2
    const db = (b.uvCenter.x - mid.x) ** 2 + (b.uvCenter.y - mid.y) ** 2
    return da - db
  })[0]
  const base = layoutPanels({
    insights: null,
    faces: [face],
    panelCount: 1,
    moduleWatts: 440,
    state: 'VIC',
    maxKw: 20,
    pinnedPanelIds: [spot.id],
  })
  const grids = () => fillFace(face, { moduleWatts: 440 }).cells.filter((c) => c.id === spot.id)

  function lay(rotationDeg) {
    return layoutPanels({
      insights: null,
      faces: [face],
      panelCount: 1,
      moduleWatts: 440,
      state: 'VIC',
      maxKw: 20,
      pinnedPanelIds: [spot.id],
      faceArrays: { roomy: { dxM: 0, dyM: 0, rotationDeg, panelIds: [spot.id] } },
    })
  }

  it('steps by 1°, undoes one step, and leaves an invalid turn unmoved', () => {
    expect(wrapDegrees(stepInPlaneRotation({ rotationDeg: 359 }, 1).rotationDeg)).toBe(0)
    expect(stepInPlaneRotation({ dxM: 0.2, rotationDeg: 2 }, -1)).toMatchObject({ dxM: 0.2, rotationDeg: 1 })
    let angle = { dxM: 0, dyM: 0, rotationDeg: 0 }
    const ids = base.panels.map((p) => p.id)
    const kwh = base.panels.map((p) => p.yearlyAcKwh)
    const applied = []
    for (let i = 0; i < 3; i += 1) {
      const next = stepInPlaneRotation(angle, 1)
      const verdict = assessFaceArray(face, grids(), next)
      expect(verdict.ok, verdict.reason).toBe(true)
      const laid = lay(next.rotationDeg)
      expect(laid.notes.join(' ')).not.toMatch(/not applied/)
      expect(laid.panels.map((p) => p.id)).toEqual(ids)
      expect(laid.panels.map((p) => p.yearlyAcKwh)).toEqual(kwh)
      expect(face.azimuthDegrees).toBe(0)
      applied.push({ angle: next, centers: laid.panels.map((p) => p.center) })
      angle = { ...next, undo: angle }
    }
    expect(applied[2].angle.rotationDeg).toBe(3)
    const undone = lay(angle.undo.rotationDeg)
    expect(undone.panels.map((p) => p.center)).toEqual(applied[1].centers)
    const edge = pool.slice().sort((a, b) => a.col - b.col || a.row - b.row)[0]
    const bad = assessFaceArray(face, [edge], { dxM: 0, dyM: 0, rotationDeg: 25 })
    expect(bad.ok).toBe(false)
    expect(bad.reason).toMatch(/setback|edge/)
    const stayed = lay(angle.rotationDeg)
    expect(stayed.panels.map((p) => p.center)).toEqual(applied[2].centers)
    const snap = buildDesignSnapshot({
      roofFaces: [face],
      design: { layout: stayed, validation: { ok: true, issues: [] } },
      confirmed: true,
      faceArrays: { roomy: { dxM: 0, dyM: 0, rotationDeg: 3 } },
    })
    expect(snap.faces[0].arrayRotationDeg).toBe(3)
    expect(snap.panelIds).toEqual(ids)
  })
})

describe('tapered roof grid', () => {
  it('keeps every spot inside the setback, and a zero move of those spots is allowed', () => {
    const a = o
    const b = offset(a, 12, 90)
    const c = offset(b, 7, 180)
    const d = offset(a, 7, 180)
    const e = offset(d, 3, 90)
    // Gutter along the north side, ridge shorter and shifted: a hip-like taper.
    const skew = manualFace({ id: 'skew', label: 'skew', vertices: [a, b, c, e], pitchDegrees: 22, azimuthDegrees: 0 })
    const found = fillFace(skew, { moduleWatts: 440, setbackM: 0.2 })
    expect(found.cells.length).toBeGreaterThan(0)
    const zero = assessFaceArray(skew, found.cells, { dxM: 0, dyM: 0, rotationDeg: 0 }, { setbackM: 0.2 })
    expect(zero.ok, zero.reason).toBe(true)
    const rows = new Map()
    for (const cell of found.cells) {
      const cols = rows.get(cell.row) ?? []
      cols.push(cell.col)
      rows.set(cell.row, cols)
    }
    expect(rows.size).toBeGreaterThan(1)
  })
})
