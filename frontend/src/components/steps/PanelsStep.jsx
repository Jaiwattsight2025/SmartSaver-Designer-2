import { useProject } from '../../context/ProjectContext'
import { useDesign } from '../../hooks/useDesign'
import { MODULE_WATT_OPTIONS } from '../../config/designerConfig'
import { fmtKw, fmtKwh } from '../../lib/format'

export default function PanelsStep({ onGoToRoof }) {
  const { actions, energyProfile } = useProject()
  const { pv, design, suggestedPanels } = useDesign()
  const { layout } = design
  const profile = energyProfile?.profile
  const wanted = pv.panelCount

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

  const setCount = (n) => actions.updateDesign({ panelCount: Math.max(0, Math.min(layout.available, Math.round(n) || 0)) })

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

      <label htmlFor="panel-count">Number of panels</label>
      <div className="count-row">
        <button type="button" className="secondary-button" onClick={() => setCount(layout.count - 1)} aria-label="One fewer panel">
          −
        </button>
        <input
          id="panel-count"
          type="number"
          min="0"
          max={layout.available}
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
        max={layout.available}
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
      <small className="hint">
        {layout.source === 'solar-api'
          ? 'Panel spots and output come from Google’s sun analysis of your roof, best spots first.'
          : layout.source === 'grid'
            ? 'Panels are laid out on a grid with a 30 cm edge gap. Output uses your state’s average sun, adjusted for roof angle.'
            : layout.source === 'mixed'
              ? 'Google’s panel spots on scanned faces, plus a grid layout on traced faces.'
              : ''}
      </small>
    </div>
  )
}
