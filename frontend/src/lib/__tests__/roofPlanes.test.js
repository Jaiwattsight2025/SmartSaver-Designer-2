import { describe, expect, it } from 'vitest'
import { makeFrame, roofFacesFromDsm, planeFromSegment, planeZ, planeIntersectionLine } from '../roofPlanes'

// Synthetic 12 m x 8 m hip roof, 22 degree pitch, eaves at 3 m, on a 0.25 m grid.
// A neighbour's shed sits 3 m east (in the building mask too) and the rest is garden.
const RES = 0.25
const W = 96
const H = 80
const frame = makeFrame({ a: -12, b: RES, c: 0, d: 10, e: 0, f: -RES })
const T = Math.tan((22 * Math.PI) / 180)

function hipZ(x, y) {
  const dx = 6 - Math.abs(x)
  const dy = 4 - Math.abs(y)
  return 3 + T * Math.min(dx, dy)
}

function makeRaster() {
  const dsm = new Float32Array(W * H)
  const mask = new Uint8Array(W * H)
  for (let v = 0; v < H; v += 1) {
    for (let u = 0; u < W; u += 1) {
      const { x, y } = frame.toLocal(u + 0.5, v + 0.5)
      const i = v * W + u
      if (Math.abs(x) <= 6 && Math.abs(y) <= 4) {
        dsm[i] = hipZ(x, y)
        mask[i] = 1
      } else if (x >= 9 && x <= 11.5 && Math.abs(y) <= 2) {
        dsm[i] = 2.2 // flat shed next door
        mask[i] = 1
      } else {
        dsm[i] = 0.1 * Math.sin(u) // lawn noise
      }
    }
  }
  return { width: W, height: H, dsm, mask, frame }
}

// What Google reports: pitch/azimuth per face, a centre and a height at that centre.
const seg = (index, cx, cy, az, areaM2, box) => ({
  index,
  center: { x: cx, y: cy },
  pitchDegrees: 22,
  azimuthDegrees: az,
  heightM: hipZ(cx, cy),
  areaM2,
  box,
})
const SEGMENTS = [
  seg(0, 0, 2.2, 0, 40, { x0: -6, x1: 6, y0: 0, y1: 4 }),
  seg(1, 0, -2.2, 180, 40, { x0: -6, x1: 6, y0: -4, y1: 0 }),
  seg(2, 4.7, 0, 90, 16, { x0: 2, x1: 6, y0: -4, y1: 4 }),
  seg(3, -4.7, 0, 270, 16, { x0: -6, x1: -2, y0: -4, y1: 4 }),
]

const area = (p) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y }, 0)) / 2

describe('roofPlanes', () => {
  it('builds a plane that matches pitch and azimuth', () => {
    const pl = planeFromSegment({ center: { x: 0, y: 0 }, pitchDegrees: 22, azimuthDegrees: 90, heightM: 5 })
    expect(planeZ(pl, 1, 0)).toBeCloseTo(5 - T, 6)
    expect(planeZ(pl, 0, 1)).toBeCloseTo(5, 6)
  })

  it('finds the ridge between two opposing planes', () => {
    const n = planeFromSegment(SEGMENTS[0])
    const s = planeFromSegment(SEGMENTS[1])
    const line = planeIntersectionLine(n, s)
    // ridge is y = 0  ->  |ny| ~ 1, c ~ 0
    expect(Math.abs(line.ny)).toBeCloseTo(1, 3)
    expect(Math.abs(line.c)).toBeLessThan(0.01)
  })

  it('reports which faces meet and how big the step is', () => {
    const out = roofFacesFromDsm(makeRaster(), SEGMENTS)
    const e02 = out.adjacency.find((e) => (e.a === 0 && e.b === 2) || (e.a === 2 && e.b === 0))
    expect(e02).toBeTruthy()
    expect(e02.stepM).toBeLessThan(0.3) // a hip crease, not a wall
    expect(e02.lenM).toBeGreaterThan(2)
    // A two-storey house: the east half is raised 2.5 m above a west lean-to.
    const r = makeRaster()
    const stepSegs = [
      { index: 0, center: { x: -3, y: 0 }, pitchDegrees: 10, azimuthDegrees: 0, heightM: 0, areaM2: 48, box: { x0: -6, x1: 0, y0: -4, y1: 4 } },
      { index: 1, center: { x: 3, y: 0 }, pitchDegrees: 10, azimuthDegrees: 0, heightM: 0, areaM2: 48, box: { x0: 0, x1: 6, y0: -4, y1: 4 } },
    ]
    const t10 = Math.tan((10 * Math.PI) / 180)
    for (let v = 0; v < H; v += 1) {
      for (let u = 0; u < W; u += 1) {
        const { x, y } = frame.toLocal(u + 0.5, v + 0.5)
        if (Math.abs(x) <= 6 && Math.abs(y) <= 4) r.dsm[v * W + u] = (x < 0 ? 3 : 5.5) + t10 * (4 - y)
      }
    }
    stepSegs[0].heightM = 3 + t10 * 4
    stepSegs[1].heightM = 5.5 + t10 * 4
    const st = roofFacesFromDsm(r, stepSegs)
    const e = st.adjacency.find((x) => x.a !== x.b)
    expect(e).toBeTruthy()
    expect(e.stepM).toBeGreaterThan(2)
  })
  it('traces four clean hip faces on the building only', () => {
    const out = roofFacesFromDsm(makeRaster(), SEGMENTS)
    expect(out.faces).toHaveLength(4)
    const byIndex = Object.fromEntries(out.faces.map((f) => [f.index, f]))
    // Expected plan areas: trapezoids 12+4 /2 * 4 = 32, triangles 8*4/2 = 16
    expect(area(byIndex[0].polygon)).toBeGreaterThan(28)
    expect(area(byIndex[0].polygon)).toBeLessThan(35)
    expect(area(byIndex[2].polygon)).toBeGreaterThan(13)
    expect(area(byIndex[2].polygon)).toBeLessThan(18.5)
    for (const f of out.faces) {
      expect(f.confidence).toBe('high')
      // never onto the neighbour's shed or the lawn
      for (const p of f.polygon) {
        expect(Math.abs(p.x)).toBeLessThan(6.4)
        expect(Math.abs(p.y)).toBeLessThan(4.4)
      }
      expect(f.polygon.length).toBeLessThanOrEqual(6)
    }
    expect(out.residualOverlaps).toEqual([])
    // the north face's ridge edge sits on y = 0
    const ridgeYs = byIndex[0].polygon.filter((p) => Math.abs(p.y) < 0.5)
    expect(ridgeYs.length).toBeGreaterThanOrEqual(2)
  })

  it('falls back to nothing when the mask is empty', () => {
    const r = makeRaster()
    r.mask.fill(0)
    const out = roofFacesFromDsm(r, SEGMENTS)
    for (const f of out.faces) expect(['low', 'none']).toContain(f.confidence)
  })
})
