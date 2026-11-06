/*
 * A frozen copy of the design the customer is looking at.
 * The paid summary should read this, not run the layout again.
 * Synthetic tests build the same object from fixture geometry; they are not live roof surveys.
 */
import { mountFor, winterNoonSunDeg } from './panelLayout'
import { installTypeOf } from './roofFaces'

const round1 = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n) * 10) / 10 : null)

export function buildDesignSnapshot({ roofFaces, design, latitude, state, confirmed = false, faceArrays = null } = {}) {
  const layout = design?.layout
  const faces = (roofFaces ?? [])
    .filter((f) => f.included)
    .map((f) => {
      const mount = mountFor(f)
      return {
        id: f.id,
        label: f.label,
        source: f.source ?? null,
        roofPitchDegrees: round1(f.pitchDegrees),
        detectedPitchDegrees: round1(f.detectedPitchDegrees),
        pitchEdited: Boolean(f.pitchEdited),
        installType: installTypeOf(f),
        installEdited: Boolean(f.installEdited),
        azimuthDegrees: round1(f.azimuthDegrees),
        detectedAzimuthDegrees: round1(f.detectedAzimuthDegrees),
        azimuthEdited: Boolean(f.azimuthEdited),
        panelTiltDegrees: round1(mount.tiltDeg),
        panelAzimuthDegrees: round1(mount.azimuthDeg),
        mounting: mount.flat ? 'tilt-frames' : 'flush',
        arrayDxM: round1((faceArrays ?? design?.faceArrays)?.[f.id]?.dxM) ?? 0,
        arrayDyM: round1((faceArrays ?? design?.faceArrays)?.[f.id]?.dyM) ?? 0,
        arrayRotationDeg: round1((faceArrays ?? design?.faceArrays)?.[f.id]?.rotationDeg) ?? 0,
      }
    })
  const panels = (layout?.panels ?? []).map((p) => ({
    id: p.id,
    faceId: p.faceId,
    row: p.row,
    col: p.col,
    yearlyAcKwh: Math.round(Number(p.yearlyAcKwh) || 0),
    source: p.source ?? null,
  }))
  const sun = winterNoonSunDeg(latitude)
  return {
    kind: 'designer-snapshot',
    version: 1,
    confirmed: Boolean(confirmed),
    state: state ?? null,
    latitude: round1(latitude),
    winterNoonSunDeg: sun ?? layout?.sunDeg ?? null,
    winterNoonSunSource: sun != null ? 'latitude' : layout?.sunSource ?? 'fallback',
    faces,
    panelIds: panels.map((p) => p.id),
    panels,
    count: layout?.count ?? 0,
    dcKw: round1(layout?.dcKw) ?? 0,
    annualAcKwh: Math.round(Number(design?.annualGenKwh) || 0),
    validation: {
      ok: Boolean(design?.validation?.ok),
      issues: (design?.validation?.issues ?? []).map((i) => ({ level: i.level, message: i.message })),
    },
    assumptions: layout?.assumptions ?? [],
    limitations: [
      'Not an engineering or compliance design. A qualified installer has to assess the roof, the structure, the wiring rules and the shade.',
      'Tilt frames are drawn at a fixed 10° facing north. That is not a product specification and not a structural approval.',
      'Where Google measured flush panels, those figures are used as published. Tilt-frame output is a state-average estimate, not a boost on Google’s number.',
      'Winter row spacing is the noon sun at this latitude, or a Melbourne/Sydney figure when latitude is missing. It is not a shade study.',
    ],
  }
}
