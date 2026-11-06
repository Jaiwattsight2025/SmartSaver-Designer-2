/*
 * Did Google's "closest building" land on the house the customer centred?
 * findClosest happily returns a garden shed or a neighbour's garage when the
 * pin sits in a big garden, a car park or a dense block, so we measure how far
 * the locked point is from the building Google returned.
 */
import { toLocal } from './geo'

/** Metres from `target` to Google's building box (0 when inside), plus the box size. */
export function buildingMatch(target, insights) {
  const sw = insights?.boundingBox?.sw
  const ne = insights?.boundingBox?.ne
  if (!target || !sw || !ne) return null
  const a = toLocal(target, { lat: sw.latitude, lng: sw.longitude })
  const b = toLocal(target, { lat: ne.latitude, lng: ne.longitude })
  const dx = Math.max(a.x - 0, 0, 0 - b.x)
  const dy = Math.max(a.y - 0, 0, 0 - b.y)
  return {
    distanceM: Math.hypot(dx, dy),
    widthM: Math.abs(b.x - a.x),
    depthM: Math.abs(b.y - a.y),
  }
}

/** Plain-English warning when Google's building is off the locked point, else ''. */
export function buildingMatchWarning(target, insights, { toleranceM = 3 } = {}) {
  const m = buildingMatch(target, insights)
  if (!m || m.distanceM <= toleranceM) return ''
  return ` Google's nearest roof is about ${Math.round(m.distanceM)} m from the centre of the map - if that is not your house, press Reposition, centre the map on your roof and lock again.`
}

/**
 * Shown on the roof step when building insights worked but no face got a
 * usable 3D outline (rural and new areas, or a trace that was rejected).
 * Empty when at least one face was traced, or there is nothing from Google.
 */
export function no3dRoofNote(faces) {
  const solar = (faces ?? []).filter((f) => f.source === 'solar-api')
  if (!solar.length || solar.some((f) => f.outlineShape === 'dsm')) return ''
  return 'Google has no usable 3D roof model for this spot (common in rural and new areas), so these outlines are estimates. Drag the corner dots onto the roof edges (drag a middle dot to add a corner, right-click a corner to delete one), or trace the roof yourself.'
}

/** Friendlier text for "no Solar API building here" errors. */
export function noCoverageMessage(error) {
  const status = error?.details?.httpStatus
  const msg = String(error?.message ?? '')
  if (status === 404 || /not found|no supported solar/i.test(msg)) {
    return 'Google has no 3D roof data for this spot (common in rural and new areas).'
  }
  return msg
}
