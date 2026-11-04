/*
 * Turn Google's 3D roof data (dataLayers DSM + building mask) into precise
 * roof-face outlines, using roofPlanes.js. The Solar API's estimated outlines
 * (roofOutline.js) stay on each face as the fallback.
 */
import { MIN_FACE_AREA_M2 } from '../config/designerConfig'
import { centroid, fromLocal, planAreaM2, toLatLng, toLocal } from './geo'
import { makeFrame, roofFacesFromDsm } from './roofPlanes'
import { utmToLatLng, utmZoneFromEpsg } from './utm'

export const DSM_NOTE = 'Traced from Google’s 3D roof data.'

/**
 * Pixel -> local-metre frame for a north-up UTM raster.
 * layers: { width, height, originE, originN, resM, epsg }
 */
export function rasterFrame(layers, origin) {
  const { zone, south } = utmZoneFromEpsg(layers.epsg)
  const res = Math.abs(layers.resM)
  const loc = (u, v) => toLocal(origin, utmToLatLng(layers.originE + u * res, layers.originN - v * res, zone, south))
  // Fit the affine over the whole raster (UTM is not exactly our local frame).
  const p00 = loc(0, 0)
  const pW = loc(layers.width, 0)
  const pH = loc(0, layers.height)
  return makeFrame({
    a: p00.x,
    b: (pW.x - p00.x) / layers.width,
    c: (pH.x - p00.x) / layers.height,
    d: p00.y,
    e: (pW.y - p00.y) / layers.width,
    f: (pH.y - p00.y) / layers.height,
  })
}

/** Solar API roof segments in local metres for roofPlanes. */
export function segmentsForDsm(insights, origin) {
  const stats = insights?.solarPotential?.roofSegmentStats ?? []
  return stats.map((s, index) => {
    const sw = toLocal(origin, toLatLng(s.boundingBox?.sw) ?? origin)
    const ne = toLocal(origin, toLatLng(s.boundingBox?.ne) ?? origin)
    return {
      index,
      center: toLocal(origin, toLatLng(s.center) ?? origin),
      pitchDegrees: Number(s.pitchDegrees) || 0,
      azimuthDegrees: Number(s.azimuthDegrees) || 0,
      heightM: Number(s.planeHeightAtCenterMeters) || 0,
      areaM2: Number(s.stats?.groundAreaMeters2) || 0,
      box: { x0: Math.min(sw.x, ne.x), x1: Math.max(sw.x, ne.x), y0: Math.min(sw.y, ne.y), y1: Math.max(sw.y, ne.y) },
    }
  })
}

/** Run the plane fit. Returns null when there is nothing usable. */
export function traceFacesFromLayers(insights, layers) {
  const origin = toLatLng(insights?.center)
  if (!origin || !layers?.dsm || !layers?.mask) return null
  const frame = rasterFrame(layers, origin)
  const raster = { width: layers.width, height: layers.height, dsm: layers.dsm, mask: layers.mask, frame }
  const segs = segmentsForDsm(insights, origin)
  if (!segs.length) return null
  const out = roofFacesFromDsm(raster, segs)
  return {
    ...out,
    faces: out.faces.map((f) => ({
      ...f,
      vertices: f.polygon.map((p) => fromLocal(origin, p)),
    })),
  }
}

/**
 * Replace estimated outlines with DSM-traced ones where the trace is good.
 * Faces keep `estimateVertices` / `estimateConfidence` as the fallback.
 */
export function refineFacesWithDsm(faces, traced) {
  if (!traced?.faces?.length) return { faces, refined: 0 }
  const bySeg = new Map(traced.faces.map((f) => [f.index, f]))
  let refined = 0
  const next = faces.map((face) => {
    if (face.segmentIndex == null || face.outlineEdited) return face
    const t = bySeg.get(face.segmentIndex)
    if (!t || t.vertices.length < 3 || (t.confidence !== 'high' && t.confidence !== 'medium')) return face
    refined += 1
    const plan = planAreaM2(t.vertices)
    const cosP = Math.cos(((Number(face.pitchDegrees) || 0) * Math.PI) / 180)
    return {
      ...face,
      vertices: t.vertices,
      center: centroid(t.vertices),
      groundAreaSquareMetres: Math.round(plan * 10) / 10,
      areaSquareMetres: Math.round((plan / cosP) * 10) / 10,
      outlineShape: 'dsm',
      outlineConfidence: t.confidence,
      outlineNote: DSM_NOTE,
      dsmMetrics: t.metrics,
      estimateVertices: face.vertices,
      estimateConfidence: face.outlineConfidence,
      estimateNote: face.outlineNote,
    }
  })
  // A face left out only because its estimate was rough can come back in now.
  const best = Math.max(0, ...next.map((f) => f.sunshineKwhM2 ?? 0))
  for (const f of next) {
    if (f.outlineShape !== 'dsm' || f.included || f.estimateConfidence !== 'low') continue
    const sunnyEnough = best === 0 || (f.sunshineKwhM2 ?? 0) >= 0.75 * best
    f.included = f.areaSquareMetres >= MIN_FACE_AREA_M2 && sunnyEnough && f.googlePanelCount > 0
  }
  return { faces: next, refined }
}
