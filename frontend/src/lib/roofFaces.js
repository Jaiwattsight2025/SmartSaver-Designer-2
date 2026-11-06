/*
 * Roof Face Engine: turn Google Solar API roof segments into roof faces the
 * customer can include / exclude, plus manually traced faces.
 * D2: each outline is estimated from the segment's size, slope direction and
 * area (see roofOutline.js) instead of hugging Google's panel spots, and the
 * customer confirms or drags the corners before panels are placed.
 */
import { FLAT_ROOF_MAX_PITCH_DEG, MIN_FACE_AREA_M2, TILT_FRAME_DEG } from '../config/designerConfig'
import { orientationFromAzimuth } from '../models/RoofFace'
import { centroid, fromLocal, planAreaM2, toLatLng, toLocal } from './geo'
import { overlapArea } from './polygon'
import { estimateSegmentOutline } from './roofOutline'

export const INSTALL_FLUSH = 'flush'
export const INSTALL_TILT = 'tilt'

/** Under FLAT_ROOF_MAX_PITCH_DEG the roof is flat — the same cut the panel layout uses. */
export function isFlatPitch(pitchDegrees) {
  return (Number(pitchDegrees) || 0) < FLAT_ROOF_MAX_PITCH_DEG
}

/** Pitched faces sit flush on the roof. Near-flat faces use tilt frames. */
export function defaultInstallType(pitchDegrees) {
  return isFlatPitch(pitchDegrees) ? INSTALL_TILT : INSTALL_FLUSH
}

/** 0° is north, 90° is east, clockwise. 360 and -10 both land in 0–360. */
export function wrapAzimuth(deg) {
  const n = Number(deg)
  if (!Number.isFinite(n)) return 0
  return Math.round((((n % 360) + 360) % 360) * 10) / 10
}

/** The install type to use: a saved choice, otherwise the pitch default. */
export function installTypeOf(face) {
  if (face?.installType === INSTALL_TILT || face?.installType === INSTALL_FLUSH) return face.installType
  return defaultInstallType(face?.pitchDegrees)
}

/**
 * Always-visible line: roof pitch (detected or overridden) kept separate from
 * how the panels sit. Tilt frames are a drawing assumption, not a structural approval.
 */
export function mountSummary(face) {
  const pitch = Number(face?.pitchDegrees) || 0
  const detected = Number(face?.detectedPitchDegrees)
  const tilt = installTypeOf(face) === INSTALL_TILT
  let pitchBit
  if (face?.pitchEdited && Number.isFinite(detected) && detected !== pitch) {
    pitchBit = `Roof pitch ${pitch}° (you changed it from the detected ${detected}°).`
  } else if (face?.source === 'solar-api' && Number.isFinite(detected)) {
    pitchBit = `Roof pitch ${pitch}° (detected from Google's roof data).`
  } else if (face?.pitchEdited) {
    pitchBit = `Roof pitch ${pitch}° (you set this).`
  } else {
    pitchBit = `Roof pitch ${pitch}°.`
  }
  const flatBit = isFlatPitch(pitch) ? ` This roof is under ${FLAT_ROOF_MAX_PITCH_DEG}°, so it is treated as flat.` : ''
  const mountBit = tilt
    ? ` Panels are drawn on ${TILT_FRAME_DEG}° tilt frames facing north. That is a layout sketch, not a structural design.`
    : ' Panels sit flush on the roof, so the panel tilt is the roof pitch.'
  const chosen = face?.installEdited ? ' You chose this mounting.' : ''
  return `${pitchBit}${flatBit}${mountBit}${chosen}`
}

/** Same text as the visible summary. The adjust controls add that it can be changed. */
export function mountHint(face) {
  return `${mountSummary(face)} Change the pitch or the mounting if that is wrong.`
}

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
    const roundedPitch = Math.round(pitch * 10) / 10
    return {
      id: `seg-${index}`,
      label: `Face ${index + 1}`,
      segmentIndex: index,
      vertices,
      center: toLatLng(seg.center) ?? (vertices.length ? centroid(vertices) : null),
      areaSquareMetres: area,
      groundAreaSquareMetres: Number(seg.stats?.groundAreaMeters2) || null,
      pitchDegrees: roundedPitch,
      detectedPitchDegrees: roundedPitch,
      installType: defaultInstallType(roundedPitch),
      installEdited: false,
      pitchEdited: false,
      azimuthDegrees: wrapAzimuth(azimuth),
      detectedAzimuthDegrees: wrapAzimuth(azimuth),
      azimuthEdited: false,
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
    detectedPitchDegrees: pitch,
    installType: defaultInstallType(pitch),
    installEdited: false,
    pitchEdited: false,
    azimuthDegrees: azimuth,
    detectedAzimuthDegrees: azimuth,
    azimuthEdited: false,
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
  const next = {
    pitchDegrees: pitch,
    areaSquareMetres: Math.round((plan / Math.cos((pitch * Math.PI) / 180)) * 10) / 10,
    pitchEdited: true,
  }
  // A pitch edit follows the flat/pitched rule until the customer has chosen an install type themselves.
  if (!face?.installEdited) next.installType = defaultInstallType(pitch)
  return next
}

/** Roof slope direction. Does not move the traced outline. */
export function editedAzimuth(face, deg) {
  const azimuth = wrapAzimuth(deg)
  return { azimuthDegrees: azimuth, azimuthEdited: true, orientation: orientationFromAzimuth(azimuth) }
}

export function resetAzimuth(face) {
  const azimuth = wrapAzimuth(face?.detectedAzimuthDegrees ?? face?.azimuthDegrees)
  return { azimuthDegrees: azimuth, azimuthEdited: false, orientation: orientationFromAzimuth(azimuth) }
}

/** Changes to apply when the customer picks flush or tilt frames. */
export function editedInstall(face, installType) {
  void face
  const install = installType === INSTALL_TILT ? INSTALL_TILT : INSTALL_FLUSH
  return { installType: install, installEdited: true }
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

/*
 * Ridge split (ported from the old roof.js splitPolygonByLine): cut a face in
 * two along the line through `a` and `b` (lat/lng). Each half slopes away from
 * the line; the half that faces the original way keeps the original azimuth.
 * Returns [faceA, faceB] or null when the line does not cut the face.
 */
export function splitPolygonByLine(polygon, lineStart, lineEnd, minAreaM2 = 1) {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return null
  const side = (p) => (dx * (p.y - lineStart.y) - dy * (p.x - lineStart.x)) / len
  const eps = 0.001
  const positive = []
  const negative = []
  for (let i = 0; i < polygon.length; i += 1) {
    const cur = polygon[i]
    const nxt = polygon[(i + 1) % polygon.length]
    const sc = side(cur)
    const sn = side(nxt)
    if (sc >= -eps) positive.push({ ...cur })
    if (sc <= eps) negative.push({ ...cur })
    if ((sc > eps && sn < -eps) || (sc < -eps && sn > eps)) {
      const t = sc / (sc - sn)
      const x = { x: cur.x + t * (nxt.x - cur.x), y: cur.y + t * (nxt.y - cur.y) }
      positive.push(x)
      negative.push({ ...x })
    }
  }
  const clean = (pts) => {
    const out = []
    for (const p of pts) {
      const prev = out[out.length - 1]
      if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 0.05) out.push(p)
    }
    if (out.length > 2 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= 0.05) out.pop()
    return out
  }
  const area = (p) => Math.abs(p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q.x * r.y - r.x * q.y }, 0)) / 2
  const A = clean(positive)
  const B = clean(negative)
  if (A.length < 3 || B.length < 3 || area(A) < minAreaM2 || area(B) < minAreaM2) return null
  return [A, B]
}

export function splitFace(face, a, b) {
  if (!face?.vertices?.length || face.vertices.length < 3) return null
  const origin = toLatLng(face.center) ?? face.vertices[0]
  const poly = face.vertices.map((v) => toLocal(origin, toLatLng(v)))
  const la = toLocal(origin, toLatLng(a))
  const lb = toLocal(origin, toLatLng(b))
  const halves = splitPolygonByLine(poly, la, lb)
  if (!halves) return null

  // Down-slope direction of each half: perpendicular to the ridge, away from it.
  const ux = lb.x - la.x
  const uy = lb.y - la.y
  const len = Math.hypot(ux, uy)
  const azOf = (half) => {
    const c = half.reduce((s, p) => ({ x: s.x + p.x / half.length, y: s.y + p.y / half.length }), { x: 0, y: 0 })
    let nx = -uy / len
    let ny = ux / len
    if ((c.x - la.x) * nx + (c.y - la.y) * ny < 0) {
      nx = -nx
      ny = -ny
    }
    return ((Math.atan2(nx, ny) * 180) / Math.PI + 360) % 360
  }
  const angDiff = (p, q) => Math.abs(((p - q + 540) % 360) - 180)
  const azs = halves.map(azOf)
  const keep = angDiff(azs[0], face.azimuthDegrees) <= angDiff(azs[1], face.azimuthDegrees) ? 0 : 1
  const stamp = Date.now().toString(36)
  return halves.map((half, i) => {
    const vertices = half.map((p) => fromLocal(origin, p))
    const az = i === keep ? face.azimuthDegrees : Math.round(azs[i])
    const piece = manualFace({
      id: `${face.id}-${i === 0 ? 'a' : 'b'}${stamp}`,
      vertices,
      pitchDegrees: face.pitchDegrees,
      azimuthDegrees: az,
      label: `${face.label} ${i === 0 ? 'a' : 'b'}`,
    })
    return {
      ...piece,
      detectedPitchDegrees: face.detectedPitchDegrees ?? face.pitchDegrees,
      detectedAzimuthDegrees: i === keep ? (face.detectedAzimuthDegrees ?? face.azimuthDegrees) : piece.azimuthDegrees,
      azimuthDegrees: i === keep ? face.azimuthDegrees : piece.azimuthDegrees,
      azimuthEdited: i === keep ? Boolean(face.azimuthEdited) : false,
      orientation: i === keep ? face.orientation : piece.orientation,
      installType: face.installEdited ? installTypeOf(face) : piece.installType,
      installEdited: Boolean(face.installEdited),
      pitchEdited: Boolean(face.pitchEdited),
      included: face.included,
      outlineNote: 'Split along a ridge by you.',
      splitFrom: face.id,
      // Sun figures only carry over to the half that still faces the same way.
      sunshineKwhM2: i === keep ? face.sunshineKwhM2 : null,
      sunExposure: i === keep ? face.sunExposure : 'Unknown',
    }
  })
}
