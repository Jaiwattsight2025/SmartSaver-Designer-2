/*
 * Roof-face outlines from Google's Solar API.
 *
 * buildingInsights gives each roof segment a centre, pitch, azimuth, sloped
 * area and an axis-aligned lat/lng bounding box - but no outline. We estimate
 * one: the face is a rectangle (gable) or trapezoid/triangle (hip) turned to
 * the azimuth, sized so its bounding box matches Google's box and its plan
 * area matches Google's area. Google's own panel spots, when present, pick the
 * best-fitting shape. The customer then checks and drags the corners before
 * any panels are placed ("Confirm roof").
 */
import { fromLocal, toLatLng, toLocal } from './geo'
import { area, pointInPolygon } from './polygon'

const RAD = Math.PI / 180

/** Unit vectors for a face: `down` points down-slope (to the gutter), `across` along the gutter. */
export function faceAxes(azimuthDeg) {
  const a = (Number(azimuthDeg) || 0) * RAD
  return { down: { x: Math.sin(a), y: Math.cos(a) }, across: { x: Math.cos(a), y: -Math.sin(a) } }
}

export function toFaceUV(p, axes) {
  return { x: p.x * axes.across.x + p.y * axes.across.y, y: p.x * axes.down.x + p.y * axes.down.y }
}

export function fromFaceUV(q, axes) {
  return { x: q.x * axes.across.x + q.y * axes.down.x, y: q.x * axes.across.y + q.y * axes.down.y }
}

/**
 * Size (a = along the gutter, b = down-slope, both in plan) of a rectangle
 * turned to `azimuth` whose axis-aligned box is boxW (east-west) x boxH.
 */
export function rectangleInBox(boxW, boxH, azimuthDeg, planArea) {
  const t = (Number(azimuthDeg) || 0) * RAD
  const c = Math.abs(Math.cos(t))
  const s = Math.abs(Math.sin(t))
  const det = c * c - s * s
  if (Math.abs(det) > 0.3) {
    const a = (boxW * c - boxH * s) / det
    const b = (boxH * c - boxW * s) / det
    if (a > 0.5 && b > 0.5) return { a, b, conditioned: true }
  }
  // Near 45 degrees the box does not pin the shape down: use the area instead.
  const sum = (boxW + boxH) / (2 * Math.max(c, s, 0.5)) / (1 + Math.min(c, s) / Math.max(c, s))
  const target = Math.max(planArea || 0, 1)
  const disc = sum * sum - 4 * target
  if (disc > 0) {
    const a = (sum + Math.sqrt(disc)) / 2
    return { a, b: sum - a > 0.5 ? sum - a : target / a, conditioned: false }
  }
  return { a: Math.sqrt(target * 1.5), b: Math.sqrt(target / 1.5), conditioned: false }
}

/** Candidate shapes (in face u/v metres, gutter at +b/2): rectangle, hip trapezoid, valley trapezoid. */
export function candidateShapes(a, b, planArea) {
  const hb = b / 2
  const ha = a / 2
  const rectA = a * b
  const shapes = [
    {
      kind: 'rectangle',
      uv: [
        { x: -ha, y: -hb },
        { x: ha, y: -hb },
        { x: ha, y: hb },
        { x: -ha, y: hb },
      ],
    },
  ]
  if (planArea > 0 && planArea < rectA * 0.92) {
    const short = Math.max(0, Math.min(a, (2 * planArea) / b - a))
    const hs = short / 2
    // Hip: long side at the gutter, short ridge (0 = triangle / hip end).
    shapes.push({
      kind: short < 0.3 ? 'triangle' : 'hip',
      uv: short < 0.3
        ? [{ x: 0, y: -hb }, { x: ha, y: hb }, { x: -ha, y: hb }]
        : [{ x: -hs, y: -hb }, { x: hs, y: -hb }, { x: ha, y: hb }, { x: -ha, y: hb }],
    })
    // Valley: long side at the ridge, short gutter.
    if (short >= 0.3) {
      shapes.push({
        kind: 'valley',
        uv: [{ x: -ha, y: -hb }, { x: ha, y: -hb }, { x: hs, y: hb }, { x: -hs, y: hb }],
      })
    }
  }
  return shapes
}

/**
 * Estimate one segment's outline. `panelCentres` are Google's panel spots on
 * this segment (lat/lng). Returns { vertices, shape, confidence, note }.
 */
export function estimateSegmentOutline(seg, panelCentres = [], opts = {}) {
  const sw = toLatLng(seg?.boundingBox?.sw)
  const ne = toLatLng(seg?.boundingBox?.ne)
  if (!sw || !ne) return { vertices: [], shape: 'none', confidence: 'none', note: 'No bounding box from Google.' }
  const origin = { lat: (sw.lat + ne.lat) / 2, lng: (sw.lng + ne.lng) / 2 }
  const p0 = toLocal(origin, sw)
  const p1 = toLocal(origin, ne)
  const boxW = Math.abs(p1.x - p0.x)
  const boxH = Math.abs(p1.y - p0.y)
  const pitch = Number(seg.pitchDegrees) || 0
  const azimuth = Number(seg.azimuthDegrees) || 0
  const sloped = Number(seg.stats?.areaMeters2) || 0
  const planArea = Number(seg.stats?.groundAreaMeters2) || sloped * Math.cos(pitch * RAD)
  const { a, b, conditioned } = rectangleInBox(boxW, boxH, azimuth, planArea)
  const axes = faceAxes(azimuth)
  const pts = panelCentres.map((c) => toFaceUV(toLocal(origin, c), axes))

  const shapes = candidateShapes(a, b, planArea)
  const fit = panelFitShape(pts, panelCentres, opts, pitch, planArea, a, b)
  if (fit) shapes.push(fit)
  let best = null
  for (const shape of shapes) {
    const inside = pts.filter((p) => pointInPolygon(p, shape.uv)).length
    const areaErr = Math.abs(area(shape.uv) - planArea) / Math.max(planArea, 1)
    const score = inside * 10 - areaErr // panels first, then area match
    if (!best || score > best.score) best = { ...shape, inside, areaErr, score }
  }

  const vertices = best.uv.map((q) => fromLocal(origin, fromFaceUV(q, axes)))
  let confidence = 'medium'
  if (best.kind === 'panel-fit') confidence = best.areaErr < 0.25 ? 'medium' : 'low'
  else if (!conditioned || best.areaErr > 0.35) confidence = 'low'
  else if (pts.length && best.inside === pts.length && best.areaErr < 0.2) confidence = 'high'
  const note =
    confidence === 'low'
      ? 'Rough estimate - please drag the corners onto the roof edges.'
      : 'Estimated from Google\u2019s roof data - check the corners match the roof edges.'
  return { vertices, shape: best.kind, confidence, note, sizeM: { along: a, down: b } }
}

/**
 * Rectangle around Google's panel spots (plus half a panel and a small
 * margin), grown towards the expected size until it matches the plan area.
 */
function panelFitShape(pts, centres, opts, pitch, planArea, a, b) {
  if (pts.length < 2) return null
  const pw = Number(opts.panelWidthM) || 1.045
  const ph = Number(opts.panelHeightM) || 1.879
  const cosP = Math.cos(pitch * RAD)
  let acrossHalf = 0
  let downHalf = 0
  centres.forEach((c) => {
    const land = String(c?.orientation || '').toUpperCase() === 'LANDSCAPE'
    acrossHalf = Math.max(acrossHalf, (land ? ph : pw) / 2)
    downHalf = Math.max(downHalf, ((land ? pw : ph) / 2) * cosP)
  })
  const margin = 0.25
  let u0 = Math.min(...pts.map((p) => p.x)) - acrossHalf - margin
  let u1 = Math.max(...pts.map((p) => p.x)) + acrossHalf + margin
  let v0 = Math.min(...pts.map((p) => p.y)) - downHalf - margin
  let v1 = Math.max(...pts.map((p) => p.y)) + downHalf + margin
  const grow = (lo, hi, want) => {
    const extra = Math.max(0, want - (hi - lo)) / 2
    return [lo - extra, hi + extra]
  }
  if (planArea > 0 && (u1 - u0) * (v1 - v0) < planArea) {
    ;[v0, v1] = grow(v0, v1, Math.min(Math.max(b, v1 - v0), planArea / (u1 - u0)))
    ;[u0, u1] = grow(u0, u1, Math.min(Math.max(a, u1 - u0), planArea / (v1 - v0)))
  }
  return {
    kind: 'panel-fit',
    uv: [
      { x: u0, y: v0 },
      { x: u1, y: v0 },
      { x: u1, y: v1 },
      { x: u0, y: v1 },
    ],
  }
}
