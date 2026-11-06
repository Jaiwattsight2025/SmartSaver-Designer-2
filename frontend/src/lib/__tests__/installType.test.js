import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FaceMount } from '../../components/steps/RoofStep'
import { offset } from '../geo'
import { fillFace, layoutPanels, mountFor, tiltFrameGain, validateLayout } from '../panelLayout'
import {
  editedInstall,
  editedPitch,
  facesFromBuildingInsights,
  installTypeOf,
  isFlatPitch,
  manualFace,
  mountHint,
} from '../roofFaces'
import { insightsFixture } from './fixtures'

const o = { lat: -37.8665, lng: 145.1012 }
const rect = (w, d) => [o, offset(o, w, 90), offset(offset(o, w, 90), d, 0), offset(o, d, 0)]

// Same merge the project reducer uses when a face is updated.
const save = (face, changes) => ({ ...face, ...changes })

describe('pitch and install type', () => {
  it('detects flush on a pitched Google face and tilt frames under 5°', () => {
    const faces = facesFromBuildingInsights(insightsFixture)
    const pitched = faces[0]
    expect(pitched.pitchDegrees).toBe(22.4)
    expect(pitched.detectedPitchDegrees).toBe(22.4)
    expect(pitched.installType).toBe('flush')
    expect(pitched.pitchEdited).toBe(false)
    expect(pitched.installEdited).toBe(false)
    expect(mountFor(pitched)).toEqual({ flat: false, tiltDeg: 22.4, azimuthDeg: 1 })
    expect(mountHint(pitched)).toMatch(/Roof pitch 22.4° \(detected from Google's roof data\)/)
    expect(mountHint(pitched)).toMatch(/panel tilt is the roof pitch/)
    expect(isFlatPitch(4.9)).toBe(true)
    expect(isFlatPitch(5)).toBe(false)

    const flat = manualFace({ id: 'flat', vertices: rect(12, 8), pitchDegrees: 2, azimuthDegrees: 180 })
    expect(flat.installType).toBe('tilt')
    expect(mountFor(flat)).toEqual({ flat: true, tiltDeg: 10, azimuthDeg: 0 })
    expect(mountHint(flat)).toMatch(/under 5°/)
    expect(mountHint(flat)).toMatch(/not a structural design/)
    expect(mountHint(flat)).not.toMatch(/Google/)
  })

  it('keeps a saved pitch and install type when the face is updated again', () => {
    let face = facesFromBuildingInsights(insightsFixture)[0]
    face = save(face, editedInstall(face, 'tilt'))
    face = save(face, editedPitch(face, 18))
    // Tilt was chosen by hand, so a later pitch edit does not switch it back to flush.
    expect(face.pitchDegrees).toBe(18)
    expect(face.pitchEdited).toBe(true)
    expect(face.installEdited).toBe(true)
    expect(face.installType).toBe('tilt')
    expect(face.detectedPitchDegrees).toBe(22.4)
    expect(mountFor(face).flat).toBe(true)
    expect(mountHint(face)).toMatch(/you changed it from the detected 22.4/)
    expect(mountHint(face)).toMatch(/not a structural design/)
    expect(mountHint(face)).toMatch(/You chose this mounting/)

    // Closing and reopening the face list is just reading the same saved face.
    const reopened = save(face, { included: false })
    const tickedAgain = save(reopened, { included: true })
    expect(tickedAgain.pitchDegrees).toBe(18)
    expect(installTypeOf(tickedAgain)).toBe('tilt')
    expect(tickedAgain.installEdited).toBe(true)
  })

  it('follows the flat rule when pitch changes and the install type was not chosen by hand', () => {
    let face = manualFace({ id: 'm', vertices: rect(10, 6), pitchDegrees: 22, azimuthDegrees: 0 })
    face = save(face, editedPitch(face, 3))
    expect(face.installType).toBe('tilt')
    expect(face.pitchEdited).toBe(true)
    expect(face.installEdited).toBeFalsy()
    expect(mountFor(face)).toEqual({ flat: true, tiltDeg: 10, azimuthDeg: 0 })
    face = save(face, editedPitch(face, 12))
    expect(face.installType).toBe('flush')
    expect(mountFor(face).flat).toBe(false)
  })

  it('pitch and install type change the panel grid and the yield', () => {
    const roof = manualFace({ id: 'wide', vertices: rect(16, 10), pitchDegrees: 15, azimuthDegrees: 90 })
    const steeper = save(roof, editedPitch(roof, 55))
    expect(fillFace(steeper).grid.h).toBeLessThan(fillFace(roof).grid.h)

    const tilt = save(roof, editedInstall(roof, 'tilt'))
    const flushLayout = layoutPanels({ insights: null, faces: [roof], panelCount: 8, moduleWatts: 440, state: 'VIC' })
    const tiltLayout = layoutPanels({ insights: null, faces: [tilt], panelCount: 8, moduleWatts: 440, state: 'VIC' })
    expect(flushLayout.notes.join(' ')).not.toMatch(/tilt frames/)
    expect(tiltLayout.notes.join(' ')).toMatch(/tilt frames facing north/)
    expect(fillFace(tilt).frame.axes.down.y).toBeGreaterThan(0.99)
    expect(tiltFrameGain(tilt)).not.toBeCloseTo(1, 2)
    expect(tiltLayout.annualAcKwh).not.toBeCloseTo(flushLayout.annualAcKwh, 0)
    expect(validateLayout(tiltLayout, [tilt]).ok).toBe(true)
    expect(validateLayout(flushLayout, [roof]).ok).toBe(true)

    const flat = manualFace({ id: 'flat', vertices: rect(16, 10), pitchDegrees: 1, azimuthDegrees: 200 })
    const flushOnFlat = save(flat, editedInstall(flat, 'flush'))
    expect(mountFor(flushOnFlat)).toEqual({ flat: false, tiltDeg: 1, azimuthDeg: 200 })
    expect(tiltFrameGain(flushOnFlat)).toBe(1)
    const laid = layoutPanels({ insights: null, faces: [flushOnFlat], panelCount: 6, moduleWatts: 440, state: 'VIC' })
    expect(laid.notes.join(' ')).not.toMatch(/tilt frames/)
    expect(validateLayout(laid, [flushOnFlat]).ok).toBe(true)
  })

  it('shows the controls, the flat badge, and the saved choice', () => {
    const google = facesFromBuildingInsights(insightsFixture)[0]
    const detected = renderToStaticMarkup(createElement(FaceMount, { face: google, onUpdate: () => {} }))
    expect(detected).toContain('Pitch of Face 1 in degrees')
    expect(detected).toContain('Flush')
    expect(detected).toContain('Tilt frames')
    expect(detected).toContain('Pitch of Face 1 in degrees')
    expect(detected).not.toContain('Flat roof')

    let flat = manualFace({ id: 'flat', label: 'North flat', vertices: rect(8, 6), pitchDegrees: 1, azimuthDegrees: 0 })
    flat = save(flat, editedInstall(flat, 'tilt'))
    const html = renderToStaticMarkup(createElement(FaceMount, { face: flat, onUpdate: () => {} }))
    expect(html).toContain('Flat roof')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('not a structural design')
    expect(html).toMatch(/Tilt frames[\s\S]*aria-pressed="true"|aria-pressed="true"[\s\S]*Tilt frames/)
  })
})
