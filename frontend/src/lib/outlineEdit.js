/** Closest zoom the Google map widget supports in this Designer. Not a sharper photo. */
export const OUTLINE_EDIT_MAX_ZOOM = 21

export function shouldAutoFit(holdZoom) {
  return !holdZoom
}

export function outlineEditZoomNote() {
  return 'Zoomed as close as the map allows. The aerial photo does not get sharper.'
}
