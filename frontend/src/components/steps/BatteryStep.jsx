import { useProject } from '../../context/ProjectContext'
import { useDesign } from '../../hooks/useDesign'
import { BATTERY_SIZE_OPTIONS_KWH, INVERTER_SIZES_KW } from '../../config/designerConfig'
import { suggestedInverterKw } from '../../lib/energyModel'
import { fmtKw } from '../../lib/format'
import ValidationList from '../ValidationList'

export default function BatteryStep() {
  const { actions, designChoices } = useProject()
  const { design, suggestedBattery, profile } = useDesign()
  const autoInverter = suggestedInverterKw(design.layout.dcKw)
  const batteryOptions = [...new Set([...BATTERY_SIZE_OPTIONS_KWH, suggestedBattery, design.batteryKwh])].sort((a, b) => a - b)

  return (
    <div className="control-stack">
      <label htmlFor="inverter">Inverter</label>
      <select
        id="inverter"
        value={designChoices.inverterKw ?? 'auto'}
        onChange={(e) => actions.updateDesign({ inverterKw: e.target.value === 'auto' ? null : Number(e.target.value) })}
      >
        <option value="auto">Suggested: {autoInverter} kW</option>
        {INVERTER_SIZES_KW.map((kw) => (
          <option key={kw} value={kw}>
            {kw} kW
          </option>
        ))}
      </select>
      <small className="hint">
        Panels {fmtKw(design.layout.dcKw)} on a {design.inverterKw} kW inverter
        {design.dcAcRatio ? ` (${Math.round(design.dcAcRatio * 100)}% of inverter size; up to 133% is allowed)` : ''}.
      </small>

      <label htmlFor="battery">Battery</label>
      <select
        id="battery"
        value={design.batteryKwh}
        onChange={(e) => actions.updateDesign({ batteryKwh: Number(e.target.value) })}
      >
        {batteryOptions.map((kwh) => (
          <option key={kwh} value={kwh}>
            {kwh === 0 ? 'No battery' : `${kwh} kWh`}
            {kwh === suggestedBattery ? ' (suggested)' : ''}
          </option>
        ))}
      </select>
      <small className="hint">
        {profile?.recommendedBatteryKwh !== null && profile?.recommendedBatteryKwh !== undefined
          ? `Wattsight suggested ${profile.recommendedBatteryKwh ? `${profile.recommendedBatteryKwh} kWh` : 'no battery'} from your bill.`
          : 'Suggested from your average night-time use.'}{' '}
        A battery stores spare daytime solar for the evening.
      </small>

      {design.warnings.map((w) => (
        <div key={w} className="info-box">
          {w}
        </div>
      ))}
      <ValidationList validation={design.validation} />

      {design.bill && design.billSolarOnly && design.batteryKwh > 0 && (
        <div className="roof-totals">
          <div>
            <span>Saving, solar only</span>
            <strong>${Math.round(design.billSolarOnly.savingAnnual).toLocaleString('en-AU')}/yr</strong>
          </div>
          <div>
            <span>With battery</span>
            <strong>${Math.round(design.bill.savingAnnual).toLocaleString('en-AU')}/yr</strong>
          </div>
        </div>
      )}
    </div>
  )
}
