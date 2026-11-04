/*
 * Roof Face Engine: turn Google Solar API roof segments into roof faces the
 * customer can include / exclude, plus manually traced faces.
 * (Ported from SmartSaver-Solar-Designer v0.7.0 js/detector.js, improved: a
 * face outline is the hull of Google's panel positions on that segment when
 * available, falling back to the segment's bounding box.)
 */
import { MIN_FACE_AREA_M2 } from '../config/designerConfig'
import { orientationFromAzimuth } from '../models/RoofFace'
import { centroid, convexHullXY, fromLocal, panelCorners, planAreaM2, toLatLng, toLocal } from './geo'

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
    let vertices = []
    if (segPanels.length) {
      const origin = toLatLng(seg.center) ?? toLatLng(segPanels[0].center)
      const corners = segPanels.flatMap((p) =>
        panelCorners(toLatLng(p.center), size.widthM, size.heightM, azimuth, p.orientation === 'PORTRAIT'),
      )
      vertices = convexHullXY(corners.map((c) => toLocal(origin, c))).map((xy) => fromLocal(origin, xy))
    }
    if (vertices.length < 3) vertices = boxCorners(seg.boundingBox)

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
      source: 'solar-api',
      included: false,
    }
  })

  // Default selection: faces that hold panels and get at least 75% of the
  // best face's sun. Customers can change this.
  const best = Math.max(0, ...faces.map((f) => f.sunshineKwhM2 ?? 0))
  for (const f of faces) {
    const sunnyEnough = best === 0 || (f.sunshineKwhM2 ?? 0) >= 0.75 * best
    f.included = f.areaSquareMetres >= MIN_FACE_AREA_M2 && sunnyEnough && (f.googlePanelCount > 0 || panels.length === 0)
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
