import { useState } from 'react'
import { useProject } from '../../context/ProjectContext'
import { useDesign } from '../../hooks/useDesign'
import { MAX_RESIDENTIAL_KW, MODULE_WATT_OPTIONS, PLANNING_KW_MAX, PLANNING_KW_MIN, ROOF_EDGE_SETBACK_M } from '../../config/designerConfig'
import { assessFaceArray, fillFace, moduleSize, proposeCentre } from '../../lib/panelLayout'
import ValidationList from '../ValidationList'
import { fmtKw, fmtKwh } from '../../lib/format'

export default function PanelsStep({ onGoToRoof, roofConfirmed, editMode, onEditMode }) {
  const { actions, energyProfile, designChoices, building } = useProject()
  const { pv, design, suggestedPanels } = useDesign()
  const { layout } = design
  const profile = energyProfile?.profile
  const wanted = pv.panelCount
  const [alignNote, setAlignNote] = useState('')
  const arrays = designChoices.faceArrays ?? {}
  const alignFace = (building.roofFaces ?? []).find((f) => f.id === building.selectedRoofFaceId && f.included) ?? null
  const align = alignFace ? arrays[alignFace.id] ?? { dxM: 0, dyM: 0, rotationDeg: 0 } : null
  const setback = designChoices.setbackM ?? ROOF_EDGE_SETBACK_M

  const commitArray = (face, next) => {
    const ids = new Set(layout.panels.filter((p) => p.faceId === face.id).map((p) => p.id))
    const grids = fillFace(face, { moduleWatts: pv.moduleWatts, setbackM: setback }).cells.filter((c) => ids.has(c.id))
    const verdict = assessFaceArray(face, grids, next, { setbackM: setback, obstacles: designChoices.obstacles })
    if (!verdict.ok) {
      setAlignNote(`${verdict.reason} The panels were not moved.`)
      return
    }
    setAlignNote('')
    actions.updateDesign({
      faceArrays: {
        ...arrays,
        [face.id]: {
          dxM: next.dxM || 0,
          dyM: next.dyM || 0,
          rotationDeg: next.rotationDeg || 0,
          undo: { dxM: align.dxM || 0, dyM: align.dyM || 0, rotationDeg: align.rotationDeg || 0 },
        },
      },
    })
  }

  if (!roofConfirmed) {
    return (
      <div className="control-stack">
        <div className="info-box">
          Confirm your roof outlines in step 2 first. Panels are only placed inside the outlines you confirm.
        </div>
        <button type="button" className="primary-button" onClick={onGoToRoof}>
          Go to step 2
        </button>
      </div>
    )
  }

  if (layout.available === 0) {
    return (
      <div className="control-stack">
        <div className="info-box">
          No room for panels yet. Tick at least one roof face (or trace one) in step 2.
        </div>
        <button type="button" className="primary-button" onClick={onGoToRoof}>
          Go to step 2
        </button>
      </div>
    )
  }

  const maxCount = Math.min(layout.available, layout.maxByKw ?? Infinity)
  const setCount = (n) => actions.updateDesign({ panelCount: Math.max(0, Math.min(maxCount, Math.round(n) || 0)) })

  return (
    <div className="control-stack">
      <label htmlFor="module">Panel size</label>
      <select
        id="module"
        value={pv.moduleWatts}
        onChange={(e) => actions.updateDesign({ moduleWatts: Number(e.target.value) })}
      >
        {MODULE_WATT_OPTIONS.map((w) => (
          <option key={w} value={w}>
            {w} W panel
          </option>
        ))}
      </select>

      <small className="hint">
        {(() => {
          const m = moduleSize(pv.moduleWatts)
          return `About ${m.widthM.toFixed(2)} × ${m.heightM.toFixed(2)} m each.`
        })()}
      </small>

      <p className="mount-summary">
        These faces fit {layout.spatialCount ?? layout.available} panels inside the setbacks
        {layout.spatialCount ? ` (${((layout.spatialCount * pv.moduleWatts) / 1000).toFixed(1)} kW)` : ''}. This design
        places {layout.count} ({fmtKw(layout.dcKw)}). The fit and the target are separate.
      </p>
      <details className="adjust-design">
        <summary>Adjust design</summary>
        <label htmlFor="planning-kw">Planning size (kW)</label>
        <input
          id="planning-kw"
          type="number"
          min={PLANNING_KW_MIN}
          max={PLANNING_KW_MAX}
          step="0.1"
          value={designChoices.planningKw ?? MAX_RESIDENTIAL_KW}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (Number.isFinite(v) && v >= PLANNING_KW_MIN && v <= PLANNING_KW_MAX) actions.updateDesign({ planningKw: v })
          }}
        />
        <small className="hint">
          A planning assumption, not a network approval. The roof can fit more than this. Setbacks are not removed to make room.
        </small>
        <strong>Line up this face&apos;s panels</strong>
        <small className="hint">
          {alignFace
            ? `${alignFace.label}. Sliding or rotating here stays on the roof. It does not change which way the panels face the sun.`
            : 'Select a ticked roof face on the map first.'}
        </small>
        {alignFace && (
          <>
            <div className="two-column-buttons">
              <button type="button" className="secondary-button" onClick={() => commitArray(alignFace, { ...align, dxM: (align.dxM || 0) - 0.1 })}>
                Along gutter −
              </button>
              <button type="button" className="secondary-button" onClick={() => commitArray(alignFace, { ...align, dxM: (align.dxM || 0) + 0.1 })}>
                Along gutter +
              </button>
              <button type="button" className="secondary-button" onClick={() => commitArray(alignFace, { ...align, dyM: (align.dyM || 0) - 0.1 })}>
                Up the roof
              </button>
              <button type="button" className="secondary-button" onClick={() => commitArray(alignFace, { ...align, dyM: (align.dyM || 0) + 0.1 })}>
                Toward gutter
              </button>
              <button type="button" className="secondary-button" onClick={() => commitArray(alignFace, { ...align, rotationDeg: (align.rotationDeg || 0) - 5 })}>
                Rotate −5°
              </button>
              <button type="button" className="secondary-button" onClick={() => commitArray(alignFace, { ...align, rotationDeg: (align.rotationDeg || 0) + 5 })}>
                Rotate +5°
              </button>
            </div>
            <div className="two-column-buttons">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  const ids = new Set(layout.panels.filter((p) => p.faceId === alignFace.id).map((p) => p.id))
                  const grids = fillFace(alignFace, { moduleWatts: pv.moduleWatts, setbackM: setback }).cells.filter((c) => ids.has(c.id))
                  const proposal = proposeCentre(alignFace, grids, { setbackM: setback, rotationDeg: align.rotationDeg || 0 })
                  if (!proposal.ok) {
                    setAlignNote(`${proposal.reason} The panels were not moved.`)
                    return
                  }
                  commitArray(alignFace, proposal.adjust)
                }}
              >
                Centre on face
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!align.undo}
                onClick={() => align.undo && commitArray(alignFace, align.undo)}
              >
                Undo alignment
              </button>
              <button type="button" className="secondary-button" onClick={() => commitArray(alignFace, { dxM: 0, dyM: 0, rotationDeg: 0 })}>
                Reset alignment
              </button>
              <button type="button" className="secondary-button" onClick={() => actions.selectRoofFace(null)}>
                Clear selected face
              </button>
            </div>
          </>
        )}
        {alignNote && <div className="info-box error">{alignNote}</div>}
      <label>Panel direction</label>
      <div className="two-column-buttons" role="group" aria-label="Panel direction">
        {[
          ['portrait', 'Portrait'],
          ['landscape', 'Landscape'],
        ].map(([v, l]) => (
          <button
            key={v}
            type="button"
            id={`orientation-${v}`}
            className={(designChoices.panelOrientation ?? 'portrait') === v ? 'primary-button' : 'secondary-button'}
            onClick={() => actions.updateDesign({ panelOrientation: v, removedPanelIds: [], pinnedPanelIds: [] })}
          >
            {l}
          </button>
        ))}
      </div>

      <label htmlFor="setback">Gap from roof edges (m)</label>
      <input
        id="setback"
        type="number"
        min="0.2"
        max="1.5"
        step="0.05"
        value={designChoices.setbackM ?? ROOF_EDGE_SETBACK_M}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v) && v >= 0.2 && v <= 1.5)
            actions.updateDesign({ setbackM: v, removedPanelIds: [], pinnedPanelIds: [] })
        }}
      />
      <div className="two-column-buttons">
        <button
          type="button"
          id="edit-panels"
          className={editMode ? 'primary-button' : 'secondary-button'}
          onClick={() => onEditMode(!editMode)}
        >
          {editMode ? 'Done editing' : 'Move / add / remove panels'}
        </button>
        {((designChoices.removedPanelIds ?? []).length > 0 || (designChoices.pinnedPanelIds ?? []).length > 0) && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => actions.updateDesign({ removedPanelIds: [], pinnedPanelIds: [] })}
          >
            Reset panel layout
          </button>
        )}
      </div>
      {editMode && (
        <small className="hint">
          On the map: click a panel to remove it, click a blue outline to add a panel there, or drag a panel to a free
          spot (it snaps into the row).
        </small>
      )}
      </details>

      <label htmlFor="panel-count">Number of panels</label>
      <div className="count-row">
        <button type="button" className="secondary-button" onClick={() => setCount(layout.count - 1)} aria-label="One fewer panel">
          −
        </button>
        <input
          id="panel-count"
          type="number"
          min="0"
          max={maxCount}
          value={layout.count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
        <button type="button" className="secondary-button" onClick={() => setCount(layout.count + 1)} aria-label="One more panel">
          +
        </button>
      </div>
      <input
        type="range"
        min="0"
        max={maxCount}
        value={layout.count}
        onChange={(e) => setCount(Number(e.target.value))}
        aria-label="Number of panels"
      />
      <small className="hint">
        Up to {layout.available} panels fit on the faces you picked.{' '}
        {profile?.recommendedSolarKw
          ? `Energy Insights suggested ${profile.recommendedSolarKw} kW = ${suggestedPanels} panels.`
          : `Suggested for your use: ${suggestedPanels} panels.`}
        {wanted > layout.available && ` That is more than fits, so we placed ${layout.available}.`}
      </small>
      {layout.count !== Math.min(suggestedPanels, layout.available) && (
        <button type="button" className="link-button" onClick={() => actions.updateDesign({ panelCount: null })}>
          Use suggested size
        </button>
      )}

      <div className="roof-totals">
        <div>
          <span>System size</span>
          <strong>{fmtKw(layout.dcKw)}</strong>
        </div>
        <div>
          <span>Yearly output</span>
          <strong>{fmtKwh(design.annualGenKwh)}</strong>
        </div>
      </div>
      {editMode && <div className="info-box">Panel editing is on. Open Adjust design to finish or to reset the layout.</div>}

      {layout.notes?.map((n) => (
        <div key={n} className="info-box">
          {n}
        </div>
      ))}
      <ValidationList validation={design.validation} />

      <small className="hint">
        Panels are laid out in straight rows from the gutter, {Math.round((designChoices.setbackM ?? ROOF_EDGE_SETBACK_M) * 100)} cm
        in from every roof edge.{' '}
        {layout.assumptions?.some((a) => a.id === 'tilt-yield')
          ? 'Tilt-frame output is an estimate from your state’s average sun. It is not a boost on Google’s flush figures.'
          : layout.source === 'solar-api'
            ? 'Output comes from Google’s sun analysis of your roof; the best spots are used first.'
            : layout.source === 'grid'
              ? 'Output uses your state’s average sun, adjusted for roof pitch and direction.'
              : layout.source === 'mixed'
                ? 'Flush faces use Google’s sun figures. Tilt-frame and traced faces use the state average.'
                : ''}
      </small>
    </div>
  )
}
