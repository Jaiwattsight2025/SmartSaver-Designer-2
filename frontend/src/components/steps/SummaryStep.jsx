import { useState } from 'react'
import { useProject } from '../../context/ProjectContext'
import { useDesign } from '../../hooks/useDesign'
import { PRICES_ARE_PLACEHOLDERS, SHOP_PRODUCTS_URL, SOLAR_BATTERIES_URL } from '../../config/pricing'
import { buildQuoteUrl, pickShopLinks } from '../../lib/shopifyHandoff'
import { buildDesignJson, buildSummaryText } from '../../lib/designSummary'
import { installTypeOf } from '../../lib/roofFaces'
import { fmtKw, fmtKwh, fmtMoney, fmtYears } from '../../lib/format'
import ValidationList from '../ValidationList'

function useSummaryData() {
  const { building, designSnapshot } = useProject()
  const { design, pv, profile, state } = useDesign()
  return { design, pv, profile, roofFaces: building.roofFaces, designSnapshot, state, latitude: building.location?.lat ?? null, confirmed: Boolean(building.roofModelAccepted) }
}

export default function SummaryStep() {
  const { design, pv, profile, roofFaces, designSnapshot, latitude, confirmed } = useSummaryData()
  const [note, setNote] = useState('')
  const shopLinks = pickShopLinks({ profile, design })

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
    // Open synchronously (popup blockers), then copy as fallback for themes that ignore the prefill.
    const summaryText = buildSummaryText({ profile, design, pv })
    window.open(buildQuoteUrl({ summaryText }), '_blank', 'noopener')
    await copySummary()
  }

  const downloadJson = () => {
    const json = buildDesignJson({
      profile,
      design,
      pv,
      roofFaces,
      latitude,
      confirmed,
      snapshot: designSnapshot ?? undefined,
    })
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
      <div className="next-steps">
        <strong>Next steps for your home</strong>
        {shopLinks
          .filter((l) => l.href !== SOLAR_BATTERIES_URL)
          .map((l) => (
            <a key={l.id} className="secondary-button as-link" href={l.href} target="_blank" rel="noopener noreferrer" title={l.reason}>
              {l.label}
            </a>
          ))}
        <a className="secondary-button as-link" href={SOLAR_BATTERIES_URL} target="_blank" rel="noopener noreferrer">
          View solar &amp; battery packages
        </a>
        <a className="link-button as-link" href={SHOP_PRODUCTS_URL} target="_blank" rel="noopener noreferrer">
          Browse energy-saving products
        </a>
      </div>
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
        <small className="hint">The quote page and shop links go to the SmartSaver store, which is still password-protected until launch. Use the store password to view them.</small>
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
                  {used.length
                    ? used
                        .map((f) => `${f.orientation} ${f.pitchDegrees}° ${installTypeOf(f) === 'tilt' ? 'tilt frames' : 'flush'}`)
                        .join(', ')
                    : '—'}
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
          <ValidationList validation={design.validation} />
          <p className="hint">
            Prices and savings are estimates only. A SmartSaver installer will check your roof, switchboard and network
            rules before giving you a fixed quote.
          </p>
        </section>
      </div>
    </div>
  )
}
