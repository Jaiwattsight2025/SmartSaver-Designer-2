import { useEffect, useState } from 'react'
import { useProject } from '../../context/ProjectContext'
import { manualFace, roofTotals } from '../../lib/roofFaces'

function FaceCard({ face, selected, onSelect, onToggle, onUpdate, onRemove }) {
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
        {face.source === 'solar-api' && <span>{face.googlePanelCount} panels fit</span>}
      </div>
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
              ].map(([l, v]) => (
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

export default function RoofStep({ map, onGoToProperty }) {
  const { building, actions } = useProject()
  const [tracePoints, setTracePoints] = useState(null) // null = not tracing
  const faces = building.roofFaces
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

  const startTrace = () => {
    if (!map) return
    setTracePoints([])
    map.startTracing((pts) => setTracePoints(pts))
  }
  const finishTrace = () => {
    const pts = map.finishTracing()
    setTracePoints(null)
    if (pts.length < 3) return
    const n = faces.filter((f) => f.source === 'manual').length + 1
    actions.addRoofFace(manualFace({ id: `manual-${Date.now().toString(36)}`, vertices: pts, label: `Traced face ${n}` }))
  }
  const cancelTrace = () => {
    map?.cancelTracing()
    setTracePoints(null)
  }

  const recalc = (face, changes) => {
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
      {solar.status === 'Connected' && faces.length > 0 && (
        <div className="info-box">
          We found {faces.length} roof face{faces.length === 1 ? '' : 's'}. Tick the ones you want panels on. Yellow
          faces are in use.
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
          />
        ))}
      </div>

      {tracePoints === null ? (
        <button type="button" className="secondary-button" onClick={startTrace} disabled={!map}>
          + Trace a roof face
        </button>
      ) : (
        <div className="trace-box">
          <strong>Tracing: click each corner of the roof face on the map</strong>
          <small>{tracePoints.length} corner{tracePoints.length === 1 ? '' : 's'} so far (at least 3)</small>
          <div className="three-column-buttons">
            <button type="button" className="secondary-button" onClick={() => setTracePoints(map.undoTracePoint())}>
              Undo
            </button>
            <button type="button" className="secondary-button" onClick={cancelTrace}>
              Cancel
            </button>
            <button type="button" className="primary-button" onClick={finishTrace} disabled={tracePoints.length < 3}>
              Finish
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
