/** Closest zoom the Google map widget supports in this Designer. Not a sharper photo. */
export const OUTLINE_EDIT_MAX_ZOOM = 21

export function shouldAutoFit(holdZoom) {
  return !holdZoom
}

/** What a drag or click is allowed to change. Move map never edits the design. */
export function mapInteraction(mode) {
  const move = mode !== 'panels' && mode !== 'outline'
  return {
    mode: move ? 'move' : mode,
    panAndZoom: true,
    dragMovesPanels: mode === 'panels',
    clickEditsPanels: mode === 'panels',
    dragEditsOutline: mode === 'outline',
    autoFitOnSelection: false,
  }
}

export function clampMapZoom(zoom) {
  const z = Number(zoom)
  if (!Number.isFinite(z)) return 20
  return Math.min(OUTLINE_EDIT_MAX_ZOOM, Math.max(1, z))
}

export function outlineEditZoomNote() {
  return 'Zoomed as close as the map allows. The aerial photo does not get sharper.'
}
