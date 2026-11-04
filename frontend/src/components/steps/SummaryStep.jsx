import { useState } from 'react'
import { useProject } from '../../context/ProjectContext'
import { useDesign } from '../../hooks/useDesign'
import { PRICES_ARE_PLACEHOLDERS, QUOTE_URL, SHOP_PRODUCTS_URL } from '../../config/pricing'
import { buildDesignJson, buildSummaryText } from '../../lib/designSummary'
import { fmtKw, fmtKwh, fmtMoney, fmtYears } from '../../lib/format'

function useSummaryData() {
  const { building } = useProject()
  const { design, pv, profile } = useDesign()
  return { design, pv, profile, roofFaces: building.roofFaces }
}

export default function SummaryStep() {
  const { design, pv, profile, roofFaces } = useSummaryData()
  const [note, setNote] = useState('')

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildSummaryText({ profile, design, pv }))
      setNote('Summary copied. Paste it into the quote form.')
      return true
    } catch {
      setNote('Could not copy automatically. Use Download summary instead.')
      return false
    }
  }

  const getQuote = async () => {
    await copySummary()
    window.open(QUOTE_URL, '_blank', 'noopener')
  }

  const downloadJson = () => {
    const json = buildDesignJson({ profile, design, pv, roofFaces })
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `smartsaver-design-${profile?.postcode ?? 'system'}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="control-stack">
      <div className="big-figure">
        <span>Your system</span>
        <strong>
          {fmtKw(design.layout.dcKw)}
          {design.batteryKwh > 0 ? ` + ${design.batteryKwh} kWh` : ''}
        </strong>
        <small>
          {design.layout.count} × {pv.moduleWatts} W panels · {design.inverterKw} kW inverter
        </small>
      </div>
      {design.bill && (
        <div className="big-figure good">
          <span>Estimated saving</span>
          <strong>{fmtMoney(design.bill.savingAnnual)}/yr</strong>
          <small>Payback about {fmtYears(design.payback?.total)}</small>
        </div>
      )}
      <button type="button" className="primary-button" onClick={getQuote} disabled={design.layout.count === 0}>
        Get a quote
      </button>
      <a className="secondary-button as-link" href={SHOP_PRODUCTS_URL} target="_blank" rel="noopener noreferrer">
        Shop energy-saving products
      </a>
      <div className="two-column-buttons">
        <button type="button" className="secondary-button" onClick={() => window.print()}>
          Print / save PDF
        </button>
        <button type="button" className="secondary-button" onClick={downloadJson}>
          Download summary
        </button>
      </div>
      <button type="button" className="link-button" onClick={copySummary}>
        Copy summary text
      </button>
      {note && <div className="info-box">{note}</div>}
      {PRICES_ARE_PLACEHOLDERS && (
        <small className="hint">The shop and quote links go to the SmartSaver store, which is not open to the public yet.</small>
      )}
    </div>
  )
}

export function SummaryReport() {
  const { design, pv, profile, roofFaces } = useSummaryData()
  const used = roofFaces.filter((f) => f.included)
  const p = design.pricing
  return (
    <div className="report summary-report">
      <div className="print-only print-header">
        <strong>SmartSaver Energy</strong> · Solar + Battery design summary
      </div>
      <h3>Your design</h3>
      {PRICES_ARE_PLACEHOLDERS && (
        <div className="placeholder-banner">
          PLACEHOLDER PRICING: these prices are not confirmed and are not a quote.
        </div>
      )}
      <div className="report-columns">
        <section>
          <h4>System</h4>
          <table className="report-table">
            <tbody>
              <tr>
                <td>Solar panels</td>
                <td>
                  {design.layout.count} × {pv.moduleWatts} W = {fmtKw(design.layout.dcKw)}
                </td>
              </tr>
              <tr>
                <td>Inverter</td>
                <td>{design.inverterKw} kW</td>
              </tr>
              <tr>
                <td>Battery</td>
                <td>{design.batteryKwh > 0 ? `${design.batteryKwh} kWh` : 'None'}</td>
              </tr>
              <tr>
                <td>Roof faces used</td>
                <td>
                  {used.length ? used.map((f) => `${f.orientation} ${f.pitchDegrees}°`).join(', ') : '—'}
                </td>
              </tr>
              <tr>
                <td>Location</td>
                <td>{[profile?.postcode, profile?.state].filter(Boolean).join(' ') || '—'}</td>
              </tr>
            </tbody>
          </table>
          <h4>Energy and savings (per year)</h4>
          <table className="report-table">
            <tbody>
              <tr>
                <td>Solar generated</td>
                <td>{fmtKwh(design.annualGenKwh)}</td>
              </tr>
              {design.sim && (
                <tr>
                  <td>Used at home</td>
                  <td>{Math.round(design.sim.annual.selfConsumptionPct)}%</td>
                </tr>
              )}
              <tr>
                <td>Bill now</td>
                <td>{fmtMoney(design.bill?.beforeAnnual)}</td>
              </tr>
              <tr>
                <td>Bill with system</td>
                <td>{fmtMoney(design.bill?.afterAnnual)}</td>
              </tr>
              <tr className="total">
                <td>Saving</td>
                <td>{fmtMoney(design.bill?.savingAnnual)}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section>
          <h4>Indicative price {p.placeholder && <span className="tag">PLACEHOLDER</span>}</h4>
          <table className="report-table">
            <tbody>
              <tr>
                <td>Solar ({fmtKw(design.layout.dcKw)}, after rebate)</td>
                <td>{fmtMoney(p.solar.mid)}</td>
              </tr>
              <tr>
                <td>Battery{p.battery.packageName ? ` (${p.battery.packageName})` : ''}</td>
                <td>{design.batteryKwh > 0 ? fmtMoney(p.battery.price) : '—'}</td>
              </tr>
              <tr className="total">
                <td>Price range</td>
                <td>
                  {p.totalLow === null ? 'Quote needed' : `${fmtMoney(p.totalLow)} – ${fmtMoney(p.totalHigh)}`}
                </td>
              </tr>
              <tr>
                <td>Simple payback</td>
                <td>{fmtYears(design.payback?.total)}</td>
              </tr>
            </tbody>
          </table>
          {design.warnings.map((w) => (
            <p key={w} className="hint">
              {w}
            </p>
          ))}
          <p className="hint">
            Prices and savings are estimates only. A SmartSaver installer will check your roof, switchboard and network
            rules before giving you a fixed quote.
          </p>
        </section>
      </div>
    </div>
  )
}
