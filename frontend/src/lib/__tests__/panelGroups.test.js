import { describe, expect, it } from 'vitest'
import { manualFace } from '../roofFaces'
import { chooseBlock, fillFace, layoutPanels, validateLayout } from '../panelLayout'
import { offset } from '../geo'

const a0 = { lat: -37.8665, lng: 145.1012 }
// A rectangle face: gutter a-b, `w` m along the gutter, `d` m up the slope.
function rect(id, origin, w, d, azimuthDegrees = 0) {
  const b = offset(origin, w, 90)
  const c = offset(b, d, 0)
  const e = offset(origin, d, 0)
  return manualFace({ id, label: id, vertices: [origin, b, c, e], pitchDegrees: 20, azimuthDegrees })
}
const big = rect('big', a0, 6, 10, 90) // east-facing, gutter 10 m long
const small = rect('small', offset(a0, 30, 90), 4.6, 2.6, 0) // north-facing, 3 spots in one row
const run = (opts) => layoutPanels({ insights: null, panelCount: 99, moduleWatts: 440, state: 'VIC', faces: [big, small], ...opts })
const perFace = (l) => l.panels.reduce((m, p) => ({ ...m, [p.faceId]: (m[p.faceId] ?? 0) + 1 }), {})

describe('panel groups (no odd singles)', () => {
  it('fixture sizes', () => {
    expect(fillFace(big).cells.length).toBeGreaterThanOrEqual(15)
    expect(fillFace(small).cells.length).toBeGreaterThan(0)
    expect(fillFace(small).cells.length).toBeLessThan(4)
  })
  it('never leaves fewer than 4 on a face from the auto-fill', () => {
    const l = run({ panelCount: 99 })
    const n = perFace(l)
    expect(n.small).toBeUndefined()
    expect(l.count).toBe(fillFace(big).cells.length)
    expect(l.available).toBe(l.count)
    for (const k of Object.values(n)) expect(k).toBeGreaterThanOrEqual(4)
    expect(validateLayout(l, [big, small]).issues.filter((i) => i.level === 'warning')).toHaveLength(0)
  })
  it('a tiny system may use groups of 2', () => {
    const l = run({ panelCount: 5 })
    const n = perFace(l)
    expect(l.count).toBe(5)
    for (const k of Object.values(n)) expect(k).toBeGreaterThanOrEqual(2)
    expect(n.small).toBe(3) // best (north) face first
  })
  it('reallocates a too-small leftover rather than leaving a single', () => {
    const l = run({ panelCount: 4 })
    expect(l.count).toBe(4)
    for (const k of Object.values(perFace(l))) expect(k).toBeGreaterThanOrEqual(2)
  })
  it('the minimum is configurable', () => {
    const l = run({ panelCount: 99, minPanelsPerFace: 2 })
    expect(perFace(l).small).toBe(fillFace(small).cells.length)
  })
  it('fills a face as one rectangular block from the gutter', () => {
    const l = layoutPanels({ insights: null, faces: [big], panelCount: 10, moduleWatts: 440, state: 'VIC' })
    const rows = {}
    for (const p of l.panels) (rows[p.row] ??= []).push(p.col)
    const lists = Object.values(rows).map((c) => c.sort((x, y) => x - y))
    expect(lists).toHaveLength(2)
    expect(lists[0]).toEqual(lists[1]) // same columns: a 5 x 2 block
    expect(lists[0][lists[0].length - 1] - lists[0][0]).toBe(lists[0].length - 1) // contiguous
    expect(Math.min(...l.panels.map((p) => p.row))).toBe(0)
  })
  it('removing one panel by hand does not reshuffle the rest', () => {
    const base = layoutPanels({ insights: null, faces: [big], panelCount: 10, moduleWatts: 440, state: 'VIC' })
    const gone = base.panels[3].id
    const l = layoutPanels({ insights: null, faces: [big], panelCount: 9, moduleWatts: 440, state: 'VIC', removedPanelIds: [gone] })
    expect(l.panels.map((p) => p.id).sort()).toEqual(base.panels.map((p) => p.id).filter((id) => id !== gone).sort())
  })
  it('a hand-placed single is allowed but warned about', () => {
    const [spot, ...rest] = fillFace(small).cells.map((c) => c.id)
    const l = run({ panelCount: 16, pinnedPanelIds: [spot], removedPanelIds: rest })
    expect(perFace(l).small).toBe(1)
    const warn = validateLayout(l, [big, small]).issues.filter((i) => i.level === 'warning')
    expect(warn.map((w) => w.message).join(' ')).toMatch(/small has only 1 panel/)
  })
  it('keeps every panel inside an L-shaped face, including the setback', () => {
    const o = a0
    const p = (east, north) => offset(offset(o, east, 90), north, 0)
    // 10 m x 8 m with a 5 m x 4 m notch taken out of the north-east.
    const face = manualFace({
      id: 'ell',
      vertices: [p(0, 0), p(10, 0), p(10, 4), p(5, 4), p(5, 8), p(0, 8)],
      pitchDegrees: 22,
      azimuthDegrees: 0,
    })
    const l = layoutPanels({ insights: null, faces: [face], panelCount: 99, moduleWatts: 440, state: 'VIC' })
    expect(l.count).toBeGreaterThanOrEqual(4)
    expect(validateLayout(l, [face]).ok).toBe(true)
    expect(l.dcKw).toBeLessThanOrEqual(13.2)
  })
  it('chooseBlock prefers a full rectangle over a stepped fragment', () => {
    const cells = []
    for (let r = 0; r < 3; r += 1) for (let c = 0; c < 4; c += 1) cells.push({ id: `${r}:${c}`, row: r, col: c, yearlyAcKwh: 500 })
    const pick = chooseBlock(cells, [], 6)
    const shape = new Set(pick.map((p) => p.row)).size
    expect(pick).toHaveLength(6)
    expect(shape).toBe(2) // 3 x 2 block, not 4 + 2
    expect(new Set(pick.map((p) => p.col)).size).toBe(3)
  })
})
