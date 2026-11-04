import { useProject } from '../../context/ProjectContext'
import { useDesign } from '../../hooks/useDesign'
import { MODULE_WATT_OPTIONS, ROOF_EDGE_SETBACK_M } from '../../config/designerConfig'
import { moduleSize } from '../../lib/panelLayout'
import ValidationList from '../ValidationList'
import { fmtKw, fmtKwh } from '../../lib/format'

export default function PanelsStep({ onGoToRoof, roofConfirmed, editMode, onEditMode }) {
  const { actions, energyProfile, designChoices } = useProject()
  const { pv, design, suggestedPanels } = useDesign()
  const { layout } = design
  const profile = energyProfile?.profile
  const wanted = pv.panelCount

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
          ? `Wattsight suggested ${profile.recommendedSolarKw} kW = ${suggestedPanels} panels.`
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

      {layout.notes?.map((n) => (
        <div key={n} className="info-box">
          {n}
        </div>
      ))}
      <ValidationList validation={design.validation} />

      <small className="hint">
        Panels are laid out in straight rows from the gutter, {Math.round((designChoices.setbackM ?? ROOF_EDGE_SETBACK_M) * 100)} cm
        in from every roof edge.{' '}
        {layout.source === 'solar-api'
          ? 'Output comes from Google’s sun analysis of your roof; the best spots are used first.'
          : layout.source === 'grid'
            ? 'Output uses your state’s average sun, adjusted for roof angle.'
            : layout.source === 'mixed'
              ? 'Output uses Google’s sun analysis on scanned faces and your state’s average on traced faces.'
              : ''}
      </small>
    </div>
  )
}
