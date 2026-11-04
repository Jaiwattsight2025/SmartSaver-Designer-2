import { useEffect, useState } from 'react'
import { useProject } from '../../context/ProjectContext'
import { editedOutline, editedPitch, faceOverlaps, manualFace, roofTotals, splitFace } from '../../lib/roofFaces'

function FaceCard({ face, selected, onSelect, onToggle, onUpdate, onRemove, onResetOutline, onSplit }) {
  return (
    <div className={`roof-face-card ${selected ? 'selected' : ''} ${face.included ? 'included' : ''}`} onClick={onSelect}>
      <div className="face-row">
        <label className="face-toggle" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={face.included} onChange={onToggle} aria-label={`Use ${face.label}`} />
          <strong>{face.label}</strong>
        </label>
        <span className={`sun-pill ${face.sunExposure.toLowerCase()}`}>{face.sunExposure} sun</span>
      </div>
      <div className="face-stats">
        <span>
          {face.orientation} · {face.azimuthDegrees}°
        </span>
        <span>{face.pitchDegrees}° pitch</span>
        <span>{face.areaSquareMetres.toFixed(1)} m²</span>
        {face.source === 'solar-api' && <span>Google: {face.googlePanelCount} panels</span>}
      </div>
      {face.source === 'solar-api' && (
        <div className="face-outline-note">
          {face.outlineEdited ? (
            <span className="outline-badge good">Outline adjusted by you</span>
          ) : (
            <span className={`outline-badge ${face.outlineConfidence ?? 'low'}`} title={face.outlineNote ?? ''}>
              {face.outlineShape === 'dsm'
                ? face.outlineConfidence === 'high'
                  ? 'Outline: traced from 3D roof data'
                  : 'Outline: traced - check the corners'
                : face.outlineConfidence === 'high'
                  ? 'Outline: good estimate'
                  : face.outlineConfidence === 'medium'
                    ? 'Outline: check the corners'
                    : 'Outline: rough - please adjust'}
            </span>
          )}
          {face.nonRoofLikely && (
            <span className="outline-badge low non-roof" title={(face.nonRoofReasons ?? []).join('; ')}>
              Possibly verandah/not roof
            </span>
          )}
          {face.nonRoofLikely && (
            <small className="non-roof-why">
              Left out: {(face.nonRoofReasons ?? []).join(', ')}. Tick it if it really is roof you want panels on.
            </small>
          )}
          {selected && <small>Drag the white corner dots on the map to match the roof edges.</small>}
        </div>
      )}
      {selected && face.source === 'solar-api' && (
        <div className="face-edit" onClick={(e) => e.stopPropagation()}>
          <label>
            Pitch °
            <input
              type="number"
              min="0"
              max="60"
              value={face.pitchDegrees}
              onChange={(e) => onUpdate(editedPitch(face, e.target.value), true)}
            />
          </label>
          {face.outlineEdited && face.originalVertices && (
            <button type="button" className="link-button" onClick={onResetOutline}>
              Reset outline
            </button>
          )}
          {!face.outlineEdited && face.outlineShape === 'dsm' && face.estimateVertices && (
            <button type="button" className="link-button" onClick={() => onUpdate(estimateOutline(face), true)}>
              Use Google's estimate instead
            </button>
          )}
        </div>
      )}
      {selected && onSplit && (
        <div className="face-edit" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="link-button split-face" onClick={onSplit}>
            Split along a ridge
          </button>
        </div>
      )}
      {face.source === 'manual' && selected && (
        <div className="face-edit" onClick={(e) => e.stopPropagation()}>
          <label>
            Pitch °
            <input
              type="number"
              min="0"
              max="60"
              value={face.pitchDegrees}
              onChange={(e) => onUpdate({ pitchDegrees: Number(e.target.value) })}
            />
          </label>
          <label>
            Faces
            <select value={face.azimuthDegrees} onChange={(e) => onUpdate({ azimuthDegrees: Number(e.target.value) })}>
              {[
                ['North', 0],
                ['North-east', 45],
                ['East', 90],
                ['South-east', 135],
                ['South', 180],
                ['South-west', 225],
                ['West', 270],
                ['North-west', 315],
              ]
                .concat(
                  [0, 45, 90, 135, 180, 225, 270, 315].includes(Number(face.azimuthDegrees))
                    ? []
                    : [[`${face.orientation ?? 'Custom'} (${face.azimuthDegrees}°)`, Number(face.azimuthDegrees)]],
                )
                .map(([l, v]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="link-button" onClick={onRemove}>
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

export default function RoofStep({ map, onGoToProperty, onGoToPanels, onRedraw }) {
  const { building, designChoices, actions } = useProject()
  const [tracePoints, setTracePoints] = useState(null) // null = not tracing
  const [traceKind, setTraceKind] = useState('face') // 'face' | 'obstacle' | 'split'
  const [splitError, setSplitError] = useState('')
  const faces = building.roofFaces
  const obstacles = designChoices?.obstacles ?? []
  const overlaps = faceOverlaps(faces)
  const confirmed = Boolean(building.roofModelAccepted)
  const totals = roofTotals(faces)
  const solar = building.solar

  // Leaving the step (or unmounting) stops any half-finished trace.
  useEffect(() => () => map?.cancelTracing(), [map])

  if (!building.mapLocked) {
    return (
      <div className="control-stack">
        <div className="info-box">Find and lock your property in step 1 first. Then we load your roof from Google.</div>
        <button type="button" className="primary-button" onClick={onGoToProperty}>
          Go to step 1
        </button>
      </div>
    )
  }

  const startTrace = (kind) => {
    if (!map) return
    setTraceKind(kind)
    setTracePoints([])
    setSplitError('')
    const color = kind === 'obstacle' ? '#ff4d4f' : kind === 'split' ? '#ffffff' : '#65d487'
    map.startTracing(
      (pts) => {
        setTracePoints(pts)
        if (kind === 'split' && pts.length >= 2) finishSplit(pts)
      },
      { color },
    )
  }
  // Ridge split: two clicks on the map along the ridge (or hip / valley) line.
  const finishSplit = (pts) => {
    map.finishTracing()
    setTracePoints(null)
    onRedraw?.()
    const face = faces.find((f) => f.id === building.selectedRoofFaceId)
    const parts = face ? splitFace(face, pts[0], pts[1]) : null
    if (!parts) {
      setSplitError('That line does not cut the selected face in two. Click two points along the ridge, across the face.')
      return
    }
    parts.forEach((p) => actions.addRoofFace(p))
    actions.removeRoofFace(face.id)
    actions.selectRoofFace(parts[0].id)
  }
  const finishTrace = () => {
    const pts = map.finishTracing()
    setTracePoints(null)
    onRedraw?.()
    if (pts.length < 3) return
    if (traceKind === 'obstacle') {
      actions.updateDesign({ obstacles: [...obstacles, { id: `nogo-${Date.now().toString(36)}`, vertices: pts }] })
      return
    }
    const n = faces.filter((f) => f.source === 'manual').length + 1
    actions.addRoofFace(manualFace({ id: `manual-${Date.now().toString(36)}`, vertices: pts, label: `Traced face ${n}` }))
  }
  const cancelTrace = () => {
    map?.cancelTracing()
    setTracePoints(null)
    onRedraw?.()
  }

  const recalc = (face, changes, direct = false) => {
    if (direct) {
      actions.updateRoofFace(face.id, changes)
      return
    }
    const next = manualFace({ ...face, ...changes })
    actions.updateRoofFace(face.id, {
      ...changes,
      pitchDegrees: next.pitchDegrees,
      azimuthDegrees: next.azimuthDegrees,
      orientation: next.orientation,
      areaSquareMetres: next.areaSquareMetres,
    })
  }

  return (
    <div className="control-stack">
      {solar.status === 'Connecting' && <div className="info-box">Loading your roof from Google…</div>}
      {solar.status === 'Unavailable' && (
        <div className="info-box error">
          Google has no roof data for this house. Trace your roof faces on the map instead.
        </div>
      )}
      {solar.status === 'Connected' && faces.length > 0 && !confirmed && (
        <div className="info-box">
          We found {faces.length} roof face{faces.length === 1 ? '' : 's'}. Tick the ones you want panels on, then check
          each outline: click a face and drag its corner dots onto the roof edges (drag a middle dot to add a corner,
          right-click a corner to delete it). Orange outlines are rough guesses.
        </div>
      )}

      <div className="roof-totals">
        <div>
          <span>Faces in use</span>
          <strong>
            {totals.includedCount} of {totals.faceCount}
          </strong>
        </div>
        <div>
          <span>Usable area</span>
          <strong>{totals.includedAreaM2.toFixed(1)} m²</strong>
        </div>
      </div>

      <div className="roof-face-list">
        {faces.length === 0 && solar.status !== 'Connecting' && (
          <div className="roof-face-list empty">No roof faces yet. Trace one on the map.</div>
        )}
        {faces.map((face) => (
          <FaceCard
            key={face.id}
            face={face}
            selected={face.id === building.selectedRoofFaceId}
            onSelect={() => actions.selectRoofFace(face.id)}
            onToggle={() => actions.toggleRoofFace(face.id)}
            onUpdate={(changes) => recalc(face, changes)}
            onRemove={() => actions.removeRoofFace(face.id)}
            onSplit={tracePoints === null && map ? () => startTrace('split') : undefined}
            onResetOutline={() =>
              actions.updateRoofFace(face.id, {
                ...editedOutlineReset(face),
              })
            }
          />
        ))}
      </div>

      {overlaps.map((o) => (
        <div key={`${o.a.id}-${o.b.id}`} className="info-box" data-testid="face-overlap">
          {o.a.label} and {o.b.label} overlap by about {o.areaM2.toFixed(0)} m². Drag their corners so they meet along
          the ridge or hip line. Panels are never put in the overlap twice.
        </div>
      ))}

      <div className="obstacle-list">
        <strong>No-go areas</strong>
        <small className="hint">Vents, skylights, aircon units, flues - panels stay 30 cm clear of them.</small>
        {obstacles.map((ob, i) => (
          <div key={ob.id} className="face-row">
            <span>No-go area {i + 1}</span>
            <button
              type="button"
              className="link-button"
              onClick={() => actions.updateDesign({ obstacles: obstacles.filter((o) => o.id !== ob.id) })}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {splitError && <div className="info-box error">{splitError}</div>}
      {tracePoints === null ? (
        <div className="two-column-buttons">
          <button type="button" className="secondary-button" onClick={() => startTrace('face')} disabled={!map}>
            + Trace a roof face
          </button>
          <button
            type="button"
            className="secondary-button"
            id="add-no-go"
            onClick={() => startTrace('obstacle')}
            disabled={!map}
          >
            + Mark a no-go area
          </button>
        </div>
      ) : (
        <div className="trace-box">
          <strong>
            {traceKind === 'obstacle'
              ? 'Click each corner of the vent, skylight or unit on the map'
              : traceKind === 'split'
                ? 'Split: click two points along the ridge line on the map'
                : 'Tracing: click each corner of the roof face on the map'}
          </strong>
          <small>
            {traceKind === 'split'
              ? `${tracePoints.length} of 2 points`
              : `${tracePoints.length} corner${tracePoints.length === 1 ? '' : 's'} so far (at least 3)`}
          </small>
          <div className="three-column-buttons">
            <button type="button" className="secondary-button" onClick={() => setTracePoints(map.undoTracePoint())}>
              Undo
            </button>
            <button type="button" className="secondary-button" onClick={cancelTrace}>
              Cancel
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={finishTrace}
              disabled={traceKind === 'split' || tracePoints.length < 3}
            >
              Finish
            </button>
          </div>
        </div>
      )}

      {tracePoints === null &&
        (confirmed ? (
          <div className="info-box success" data-testid="roof-confirmed">
            Roof confirmed. Changing a face will ask you to confirm again.{' '}
            <button type="button" className="link-button" onClick={onGoToPanels}>
              Go to panels
            </button>
          </div>
        ) : (
          <button
            type="button"
            id="confirm-roof"
            className="primary-button"
            disabled={totals.includedCount === 0}
            onClick={() => {
              actions.acceptRoofModel()
              onGoToPanels?.()
            }}
          >
            Confirm roof
          </button>
        ))}
    </div>
  )
}

function editedOutlineReset(face) {
  return {
    ...editedOutline(face, face.originalVertices),
    outlineEdited: false,
    outlineConfidence: face.originalConfidence ?? 'medium',
    originalVertices: undefined,
  }
}

/** Fall back from the 3D-traced outline to the Solar API estimate. */
function estimateOutline(face) {
  return {
    ...editedOutline(face, face.estimateVertices),
    outlineEdited: false,
    outlineShape: 'estimate',
    outlineConfidence: face.estimateConfidence ?? 'medium',
    outlineNote: face.estimateNote,
    originalVertices: undefined,
  }
}
