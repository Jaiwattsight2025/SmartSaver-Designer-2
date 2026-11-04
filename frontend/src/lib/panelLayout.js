/*
 * Panel layout on the included roof faces.
 *  - Faces from Google's Solar API use Google's own panel positions
 *    (solarPotential.solarPanels, best panels first) and Google's per-panel
 *    yearly energy for THAT roof position, scaled to the chosen module wattage.
 *  - Traced faces (or faces with no Google panels) use a simple grid fallback
 *    with an edge setback, and the state-average yield adjusted for tilt and
 *    direction.
 */
import {
  DC_TO_AC_DERATE,
  MODULE_HEIGHT_M,
  MODULE_WIDTH_M,
  PANEL_GAP_M,
  ROOF_EDGE_SETBACK_M,
} from '../config/designerConfig'
import { fromLocal, panelCorners, pointInPolygonXY, toLatLng, toLocal } from './geo'
import { googlePanelSize } from './roofFaces'
import { stateYield } from './energyModel'

const RAD = Math.PI / 180

/** [ASSUMPTION] Output vs the state average for a roof's pitch and direction (southern hemisphere: north is best). */
export function orientationFactor(pitchDegrees, azimuthDegrees) {
  const p = (Number(pitchDegrees) || 0) * RAD
  const a = (Number(azimuthDegrees) || 0) * RAD
  return 0.92 + 0.3 * Math.sin(p) * Math.cos(a) - 0.06 * (1 - Math.cos(p))
}

/** Grid-fill one face. Returns panel rectangles (lat/lng corners). */
export function gridPanelsForFace(face, opts = {}) {
  const widthM = opts.widthM ?? MODULE_WIDTH_M
  const heightM = opts.heightM ?? MODULE_HEIGHT_M
  const gap = opts.gapM ?? PANEL_GAP_M
  const setback = opts.setbackM ?? ROOF_EDGE_SETBACK_M
  if (!face?.vertices || face.vertices.length < 3) return []

  const origin = face.center ?? face.vertices[0]
  const a = (Number(face.azimuthDegrees) || 0) * RAD
  const cosPitch = Math.cos((Number(face.pitchDegrees) || 0) * RAD)
  const down = { x: Math.sin(a), y: Math.cos(a) } // towards the gutter
  const across = { x: Math.cos(a), y: -Math.sin(a) }
  const toUV = (p) => ({ x: p.x * across.x + p.y * across.y, y: p.x * down.x + p.y * down.y })
  const fromUV = (q) => ({ x: q.x * across.x + q.y * down.x, y: q.x * across.y + q.y * down.y })

  const poly = face.vertices.map((v) => toUV(toLocal(origin, v)))
  const xs = poly.map((p) => p.x)
  const ys = poly.map((p) => p.y)
  const [minU, maxU, minV, maxV] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]

  const w = widthM
  const h = heightM * cosPitch // panel length seen from above
  const sb = setback
  const panels = []
  for (let v = minV + sb; v + h <= maxV - sb + 1e-9; v += h + gap) {
    for (let u = minU + sb; u + w <= maxU - sb + 1e-9; u += w + gap) {
      const test = [
        { x: u - sb, y: v - sb },
        { x: u + w + sb, y: v - sb },
        { x: u + w + sb, y: v + h + sb },
        { x: u - sb, y: v + h + sb },
      ]
      if (!test.every((pt) => pointInPolygonXY(pt, poly))) continue
      const rect = [
        { x: u, y: v },
        { x: u + w, y: v },
        { x: u + w, y: v + h },
        { x: u, y: v + h },
      ].map((q) => fromLocal(origin, fromUV(q)))
      const c = fromLocal(origin, fromUV({ x: u + w / 2, y: v + h / 2 }))
      panels.push({ center: c, corners: rect })
    }
  }
  return panels
}

/**
 * Lay out up to `panelCount` panels on the included faces.
 * Returns { panels, available, count, dcKw, annualAcKwh, source, googleWatts }.
 */
export function layoutPanels({ insights, faces, panelCount, moduleWatts, state }) {
  const included = (faces ?? []).filter((f) => f.included)
  const google = googlePanelSize(insights)
  const apiSegments = new Set(
    included.filter((f) => f.source === 'solar-api' && f.googlePanelCount > 0).map((f) => f.segmentIndex),
  )
  const facesBySegment = new Map(included.map((f) => [f.segmentIndex, f]))
  const solarPanels = insights?.solarPotential?.solarPanels ?? []
  const scale = moduleWatts / google.watts

  const candidates = []
  solarPanels.forEach((p, i) => {
    if (!apiSegments.has(p.segmentIndex)) return
    const face = facesBySegment.get(p.segmentIndex)
    const center = toLatLng(p.center)
    if (!center) return
    const dc = Math.max(0, Number(p.yearlyEnergyDcKwh) || 0)
    candidates.push({
      id: `g${i}`,
      faceId: face.id,
      center,
      corners: panelCorners(center, google.widthM, google.heightM, face.azimuthDegrees, p.orientation === 'PORTRAIT'),
      yearlyAcKwh: dc * scale * DC_TO_AC_DERATE,
      source: 'solar-api',
    })
  })

  const yieldKw = stateYield(state)
  const gridFaces = included.filter((f) => !(f.source === 'solar-api' && f.googlePanelCount > 0))
  const gridCandidates = []
  for (const face of gridFaces) {
    const perPanel = (moduleWatts / 1000) * yieldKw * orientationFactor(face.pitchDegrees, face.azimuthDegrees)
    gridPanelsForFace(face).forEach((p, i) =>
      gridCandidates.push({ id: `${face.id}-${i}`, faceId: face.id, ...p, yearlyAcKwh: perPanel, source: 'grid' }),
    )
  }
  gridCandidates.sort((x, y) => y.yearlyAcKwh - x.yearlyAcKwh)
  candidates.push(...gridCandidates)

  const available = candidates.length
  const count = Math.max(0, Math.min(Math.round(Number(panelCount) || 0), available))
  const panels = candidates.slice(0, count)
  const sources = new Set(panels.map((p) => p.source))
  return {
    panels,
    available,
    count,
    dcKw: (count * moduleWatts) / 1000,
    annualAcKwh: panels.reduce((s, p) => s + p.yearlyAcKwh, 0),
    source: sources.size === 0 ? 'none' : sources.size > 1 ? 'mixed' : [...sources][0],
    googleWatts: google.watts,
  }
}
