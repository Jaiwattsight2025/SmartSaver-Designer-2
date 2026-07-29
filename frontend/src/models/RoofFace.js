export function createRoofFace({
  id = crypto.randomUUID(),
  label = 'Roof face',
  vertices = [],
  areaSquareMetres = 0,
  pitchDegrees = 0,
  azimuthDegrees = 0,
  irradianceKwhM2 = null,
  source = 'manual',
} = {}) {
  return {
    id,
    label,
    vertices,
    areaSquareMetres,
    pitchDegrees,
    azimuthDegrees,
    orientation: orientationFromAzimuth(azimuthDegrees),
    irradianceKwhM2,
    source,
    accepted: false,
  }
}

export function orientationFromAzimuth(azimuthDegrees) {
  const normalized = ((Number(azimuthDegrees) % 360) + 360) % 360
  const directions = [
    'North',
    'North-east',
    'East',
    'South-east',
    'South',
    'South-west',
    'West',
    'North-west',
  ]
  const index = Math.round(normalized / 45) % 8
  return directions[index]
}
