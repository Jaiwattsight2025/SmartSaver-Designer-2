/*
 * Roof Face Engine: turn Google Solar API roof segments into roof faces the
 * customer can include / exclude, plus manually traced faces.
 * D2: each outline is estimated from the segment's size, slope direction and
 * area (see roofOutline.js) instead of hugging Google's panel spots, and the
 * customer confirms or drags the corners before panels are placed.
 */
import { MIN_FACE_AREA_M2 } from '../config/designerConfig'
import { orientationFromAzimuth } from '../models/RoofFace'
import { centroid, planAreaM2, toLatLng, toLocal } from './geo'
import { overlapArea } from './polygon'
import { estimateSegmentOutline } from './roofOutline'

export function sunExposure(medianSunshine) {
  if (!Number.isFinite(medianSunshine) || medianSunshine <= 0) return 'Unknown'
  if (medianSunshine >= 1500) return 'High'
  if (medianSunshine >= 1100) return 'Medium'
  return 'Low'
}

function median(values) {
  if (!Array.isArray(values) || !values.length) return null
  const v = values.map(Number).filter(Number.isFinite)
  return v.length ? v[Math.floor(v.length / 2)] : null
}

function boxCorners(box) {
  const sw = toLatLng(box?.sw)
  const ne = toLatLng(box?.ne)
  if (!sw || !ne) return []
  return [
    { lat: ne.lat, lng: sw.lng },
    ne,
    { lat: sw.lat, lng: ne.lng },
    sw,
  ]
}

/** Panel geometry Google uses (metres) for an insights response. */
export function googlePanelSize(insights) {
  const p = insights?.solarPotential ?? {}
  return {
    widthM: Number(p.panelWidthMeters) || 1.045,
    heightM: Number(p.panelHeightMeters) || 1.879,
    watts: Number(p.panelCapacityWatts) || 400,
  }
}

/** Build roof faces from a buildingInsights response. */
export function facesFromBuildingInsights(insights) {
  const potential = insights?.solarPotential ?? {}
  const segments = Array.isArray(potential.roofSegmentStats) ? potential.roofSegmentStats : []
  const panels = Array.isArray(potential.solarPanels) ? potential.solarPanels : []
  const size = googlePanelSize(insights)

  const faces = segments.map((seg, index) => {
    const azimuth = Number(seg.azimuthDegrees) || 0
    const pitch = Number(seg.pitchDegrees) || 0
    const segPanels = panels.filter((p) => p.segmentIndex === index)
    const outline = estimateSegmentOutline(
      seg,
      segPanels.map((p) => ({ ...toLatLng(p.center), orientation: p.orientation })),
      { panelWidthM: size.widthM, panelHeightM: size.heightM },
    )
    let vertices = outline.vertices
    if (vertices.length < 3) {
      vertices = boxCorners(seg.boundingBox)
      outline.confidence = 'low'
      outline.shape = 'box'
    }

    const sunshine = median(seg.stats?.sunshineQuantiles)
    const area = Number(seg.stats?.areaMeters2) || 0
    return {
      id: `seg-${index}`,
      label: `Face ${index + 1}`,
      segmentIndex: index,
      vertices,
      center: toLatLng(seg.center) ?? (vertices.length ? centroid(vertices) : null),
      areaSquareMetres: area,
      groundAreaSquareMetres: Number(seg.stats?.groundAreaMeters2) || null,
      pitchDegrees: Math.round(pitch * 10) / 10,
      azimuthDegrees: Math.round(azimuth),
      orientation: orientationFromAzimuth(azimuth),
      sunshineKwhM2: sunshine,
      sunExposure: sunExposure(sunshine),
      googlePanelCount: segPanels.length,
      outlineShape: outline.shape,
      outlineConfidence: outline.confidence,
      outlineNote: outline.note,
      outlineEdited: false,
      source: 'solar-api',
      included: false,
    }
  })

  // Default selection: faces that hold panels and get at least 75% of the
  // best face's sun. Customers can change this.
  const best = Math.max(0, ...faces.map((f) => f.sunshineKwhM2 ?? 0))
  for (const f of faces) {
    const sunnyEnough = best === 0 || (f.sunshineKwhM2 ?? 0) >= 0.75 * best
    // Rough (low-confidence) outlines are left out until the customer fixes and ticks them.
    f.included =
      f.areaSquareMetres >= MIN_FACE_AREA_M2 &&
      sunnyEnough &&
      f.outlineConfidence !== 'low' &&
      (f.googlePanelCount > 0 || panels.length === 0)
  }
  return faces
}

/** A face the customer traced on the map. `vertices` are lat/lng in order. */
export function manualFace({ id, vertices, pitchDegrees = 20, azimuthDegrees = 0, label }) {
  const pitch = Math.min(Math.max(Number(pitchDegrees) || 0, 0), 60)
  const azimuth = ((Math.round(Number(azimuthDegrees) || 0) % 360) + 360) % 360
  const plan = planAreaM2(vertices)
  return {
    id: id ?? `manual-${Date.now().toString(36)}`,
    label: label ?? 'Traced face',
    segmentIndex: null,
    vertices,
    center: vertices.length ? centroid(vertices) : null,
    areaSquareMetres: Math.round((plan / Math.cos((pitch * Math.PI) / 180)) * 10) / 10,
    groundAreaSquareMetres: Math.round(plan * 10) / 10,
    pitchDegrees: pitch,
    azimuthDegrees: azimuth,
    orientation: orientationFromAzimuth(azimuth),
    sunshineKwhM2: null,
    sunExposure: 'Unknown',
    googlePanelCount: 0,
    outlineShape: 'traced',
    outlineConfidence: 'high',
    outlineNote: 'Traced by you.',
    outlineEdited: true,
    source: 'manual',
    included: true,
  }
}

export function roofTotals(faces) {
  const inc = faces.filter((f) => f.included)
  return {
    faceCount: faces.length,
    includedCount: inc.length,
    includedAreaM2: inc.reduce((s, f) => s + (f.areaSquareMetres || 0), 0),
  }
}

/** Changes to apply when the customer drags a face's corners. */
export function editedOutline(face, vertices) {
  const plan = planAreaM2(vertices)
  const cosP = Math.cos(((Number(face.pitchDegrees) || 0) * Math.PI) / 180)
  return {
    vertices,
    center: centroid(vertices),
    groundAreaSquareMetres: Math.round(plan * 10) / 10,
    areaSquareMetres: Math.round((plan / cosP) * 10) / 10,
    outlineEdited: true,
    outlineConfidence: 'high',
    originalVertices: face.originalVertices ?? face.vertices,
    originalConfidence: face.originalConfidence ?? face.outlineConfidence,
  }
}

/** Changes to apply when the customer corrects a face's pitch (tilt). */
export function editedPitch(face, pitchDegrees) {
  const pitch = Math.min(Math.max(Number(pitchDegrees) || 0, 0), 60)
  const plan = planAreaM2(face.vertices)
  return { pitchDegrees: pitch, areaSquareMetres: Math.round((plan / Math.cos((pitch * Math.PI) / 180)) * 10) / 10 }
}

/** Pairs of included faces whose outlines overlap by more than `minM2` (estimated outlines can). */
export function faceOverlaps(faces, minM2 = 1) {
  const inc = (faces ?? []).filter((f) => f.included && f.vertices?.length >= 3)
  if (inc.length < 2) return []
  const origin = toLatLng(inc[0].center) ?? inc[0].vertices[0]
  const polys = inc.map((f) => f.vertices.map((v) => toLocal(origin, toLatLng(v))))
  const out = []
  for (let i = 0; i < inc.length; i += 1) {
    for (let j = i + 1; j < inc.length; j += 1) {
      const a = overlapArea(polys[i], polys[j], 0.2)
      if (a > minM2) out.push({ a: inc[i], b: inc[j], areaM2: a })
    }
  }
  return out
}
