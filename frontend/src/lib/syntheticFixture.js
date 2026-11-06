/*
 * Synthetic roof geometry for tests and the ?preview=synthetic screen.
 * Not a surveyed property and not a live Google roof.
 */
import { offset } from './geo'
import { manualFace } from './roofFaces'

export const SYNTHETIC_BANNER =
  'Synthetic fixture — not a real property and not a live Google roof. No customer data is used.'

export const SYNTHETIC_LAT = -37.82
export const SYNTHETIC_LNG = 145

const origin = { lat: SYNTHETIC_LAT, lng: SYNTHETIC_LNG }

function rect(east, north, w, d) {
  const a = offset(offset(origin, east, 90), north, 0)
  const b = offset(a, w, 90)
  const c = offset(b, d, 0)
  return [a, b, c, offset(a, d, 0)]
}

function asDetected(face, extra) {
  return {
    ...face,
    source: 'solar-api',
    outlineEdited: false,
    outlineShape: 'estimate',
    outlineConfidence: 'medium',
    outlineNote: 'Synthetic estimate.',
    detectedPitchDegrees: face.pitchDegrees,
    pitchEdited: false,
    installEdited: false,
    googlePanelCount: 0,
    segmentIndex: extra.segmentIndex,
    sunExposure: extra.sunExposure ?? 'Medium',
    ...extra,
  }
}

/** Pitched north face, flat roof, touching lower storey, and a separate block. */
export function syntheticRoofFaces() {
  const pitched = asDetected(
    manualFace({ id: 'syn-north', label: 'North roof', vertices: rect(0, 0, 10, 6), pitchDegrees: 22, azimuthDegrees: 0 }),
    { segmentIndex: 0, sunExposure: 'High', outlineShape: 'estimate', outlineConfidence: 'medium' },
  )
  const flat = asDetected(
    manualFace({ id: 'syn-flat', label: 'Flat roof', vertices: rect(0, 8, 8, 5), pitchDegrees: 2, azimuthDegrees: 180 }),
    { segmentIndex: 1, sunExposure: 'Medium' },
  )
  const lower = asDetected(
    manualFace({ id: 'syn-lower', label: 'Lower storey', vertices: rect(10, 0, 8, 6), pitchDegrees: 18, azimuthDegrees: 90 }),
    { segmentIndex: 2, sunExposure: 'Medium', included: false },
  )
  const other = asDetected(
    manualFace({ id: 'syn-other', label: 'Separate block', vertices: rect(0, 30, 8, 5), pitchDegrees: 20, azimuthDegrees: 0 }),
    {
      segmentIndex: 3,
      included: false,
      otherRoof: true,
      otherRoofReason: 'not joined to the roof you picked - a separate building',
    },
  )
  return [pitched, flat, lower, other]
}
