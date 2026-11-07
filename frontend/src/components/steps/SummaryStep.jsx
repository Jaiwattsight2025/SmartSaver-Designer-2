import { useState } from 'react'
import { useProject } from '../../context/ProjectContext'
import { useDesign } from '../../hooks/useDesign'
import { SHOP_PRODUCTS_URL, SOLAR_BATTERIES_URL } from '../../config/pricing'
import { buildQuoteUrl, pickShopLinks } from '../../lib/shopifyHandoff'
import { buildSummaryText } from '../../lib/designSummary'
import { installTypeOf } from '../../lib/roofFaces'
import { fmtKw, fmtKwh, fmtMoney, fmtYears } from '../../lib/format'
import { SavingsReport } from './OutputStep'
import { BATTERY_INDEX, BATTERY_REBATE, SOLAR_INDEX } from '../../lib/priceBenchmarks'
import ValidationList from '../ValidationList'

function useSummaryData() {
  const { building } = useProject()
  const { design, pv, profile } = useDesign()
  return { design, pv, profile, roofFaces: building.roofFaces, address: building.formattedAddress }
}

/** One line for the cover. The figures are design.payback, the same object as the price page. */
export function coverPayback(payback) {
  if (payback?.kind === 'user-quote' && payback.years) {
    return `From your quote: ${fmtYears(payback.years)}. Savings-to-cost ${payback.savingsToCostPct.toFixed(1)}%. Not an IRR.`
  }
  if (payback?.kind === 'solar-only' && (payback.standard?.years || payback.premium?.years)) {
    const parts = []
    if (payback.standard?.years) parts.push(`Standard offer ${fmtYears(payback.standard.years)}`)
    if (payback.premium?.years) parts.push(`Premium offer ${fmtYears(payback.premium.years)}`)
    return `${parts.join('. ')}. Separate tiers, not a range. Not an IRR.`
  }
  return 'Unavailable until there is one complete price. Solar and battery benchmarks are not added together.'
}

function paybackBlurb(payback) {
  if (payback?.kind === 'user-quote' && payback.years) {
    return `Simple payback from your quote: ${fmtYears(payback.years)}. Not an IRR.`
  }
  if (payback?.kind === 'solar-only' && (payback.standard?.years || payback.premium?.years)) {
    return 'Simple payback is below, from the solar index only. Standard and premium are separate tiers.'
  }
  return 'Simple payback: unavailable until there is one complete price.'
}

export default function SummaryStep() {
  const { actions, designChoices } = useProject()
  const { design, pv, profile } = useSummaryData()
  const [note, setNote] = useState('')
  const shopLinks = pickShopLinks({ profile, design })

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildSummaryText({ profile, design, pv }))
      setNote('Summary copied. Paste it into the quote form.')
      return true
    } catch {
      setNote('Could not copy automatically. Use Print / save PDF instead.')
      return false
    }
  }

  const getQuote = async () => {
    // Open synchronously (popup blockers), then copy as fallback for themes that ignore the prefill.
    const summaryText = buildSummaryText({ profile, design, pv })
    window.open(buildQuoteUrl({ summaryText }), '_blank', 'noopener')
    await copySummary()
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
          <small>{paybackBlurb(design.payback)}</small>
        </div>
      )}
      <label htmlFor="installer-quote">
        Installer quote for this whole project (AUD)
        <input
          id="installer-quote"
          type="number"
          min="1"
          step="1"
          inputMode="decimal"
          value={designChoices.installerQuoteAud ?? ''}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') actions.updateDesign({ installerQuoteAud: null })
            else {
              const n = Number(raw)
              if (Number.isFinite(n) && n > 0) actions.updateDesign({ installerQuoteAud: n })
            }
          }}
        />
      </label>
      <small className="hint">
        Optional. If you enter a quote, the simple payback uses that figure and is labelled as yours. It is not a Solar Choice price.
      </small>
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
      <button type="button" className="secondary-button" onClick={() => window.print()}>
        Print / save PDF
      </button>
      <small className="hint">
        The PDF starts with this system, the saving and payback, then the output charts, bills and price basis.
      </small>
      <button type="button" className="link-button" onClick={copySummary}>
        Copy summary text
      </button>
      {note && <div className="info-box">{note}</div>}
    </div>
  )
}

export function SummaryReport() {
  const data = useSummaryData()
  return <ProposalDocument {...data} />
}

export function ProposalDocument({ design, pv, profile, roofFaces, address = '' }) {
  const used = (roofFaces ?? []).filter((f) => f.included)
  const synthetic = /synthetic fixture/i.test(address || '')
  const bill = design.bill
  return (
    <article className="report summary-report proposal">
      <header className="proposal-cover">
        <p className="proposal-kicker">SmartSaver Energy · Design summary</p>
        <h3>Your system</h3>
        {synthetic && (
          <p className="proposal-synthetic">
            Synthetic fixture — not a real property and not a live Google roof. No customer data is used.
          </p>
        )}
        <table className="report-table proposal-facts">
          <tbody>
            <tr>
              <td>System</td>
              <td>
                {fmtKw(design.layout.dcKw)}
                {design.batteryKwh > 0 ? ` + ${design.batteryKwh} kWh battery` : ''} · {design.layout.count} × {pv.moduleWatts} W · {design.inverterKw} kW inverter
              </td>
            </tr>
            <tr>
              <td>Solar generated</td>
              <td>{fmtKwh(design.annualGenKwh)} / year</td>
            </tr>
            <tr>
              <td>Bill now</td>
              <td>{bill ? fmtMoney(bill.beforeAnnual) : 'Unavailable — add bill data'}</td>
            </tr>
            <tr>
              <td>Bill with system</td>
              <td>{bill ? fmtMoney(bill.afterAnnual) : 'Unavailable — add bill data'}</td>
            </tr>
            <tr className="total">
              <td>Saving</td>
              <td>{bill ? `${fmtMoney(bill.savingAnnual)} / year` : 'Unavailable — add bill data'}</td>
            </tr>
            <tr>
              <td>Simple payback</td>
              <td>{coverPayback(design.payback)}</td>
            </tr>
          </tbody>
        </table>
        <LayoutSketch panels={design.layout.panels} />
        <p className="hint">
          The pages after this one use the same generation and bill figures as Output and savings. Prices are separate benchmarks, or a quote you typed. This is not an installer quotation.
        </p>
      </header>

      <section className="proposal-follow">
        <h3>Roof and system</h3>
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
                      .map((f) => `${f.label ?? f.orientation}: ${f.orientation} ${f.pitchDegrees}° ${installTypeOf(f) === 'tilt' ? 'tilt frames' : 'flush'}`)
                      .join('; ')
                  : 'None confirmed'}
              </td>
            </tr>
            <tr>
              <td>Location</td>
              <td>{[profile?.postcode, profile?.state].filter(Boolean).join(' ') || '—'}</td>
            </tr>
          </tbody>
        </table>
        <LayoutSketch panels={design.layout.panels} />
        {!design.layout.panels?.length && <p>No panels are placed, so there is no roof layout to draw.</p>}
      </section>

      <section className="proposal-follow proposal-generation" data-testid="proposal-generation">
        <h3>Generation and bills</h3>
        <SavingsReport design={design} />
        <SupplyChart sim={design.sim} />
      </section>

      <section className="proposal-follow proposal-basis" data-testid="proposal-basis">
        <h3>Price basis and assumptions</h3>
        <PriceSection pricing={design.pricing} dcKw={design.layout.dcKw} batteryKwh={design.batteryKwh} />
        <h4>Model notes</h4>
        {(design.layout?.assumptions ?? []).map((a) => (
          <p key={a.id} className="hint">
            {a.text}
          </p>
        ))}
        {design.warnings.map((w) => (
          <p key={w} className="hint">
            {w}
          </p>
        ))}
        <ValidationList validation={design.validation} />
        <p className="hint">
          Savings come from this design&apos;s modelled use and the bill rates. An installer still has to check the roof, switchboard and network rules.
        </p>
      </section>
    </article>
  )
}

function moneyCell(benchmark) {
  if (!benchmark) return '—'
  return fmtMoney(benchmark.aud)
}

function PriceSection({ pricing, dcKw, batteryKwh }) {
  const solar = pricing?.solar
  const battery = pricing?.battery
  const pay = pricing?.payback
  return (
    <div className="price-block">
      <h4>Price benchmarks</h4>
      <p className="hint">Not a quote. Standard and premium are two offer tiers, not a low-to-high range.</p>
      {!solar?.available && (
        <p data-testid="solar-unavailable">
          Solar benchmark for {fmtKw(dcKw)}: unavailable. {solar?.reason}
        </p>
      )}
      {solar?.available && (
        <>
          <p className="hint">{solar.where}</p>
          <table className="report-table">
            <tbody>
              <tr>
                <td>Solar, standard offer</td>
                <td data-testid="solar-standard-price">{moneyCell(solar.standard)}</td>
              </tr>
              <tr>
                <td>Solar, premium offer</td>
                <td data-testid="solar-premium-price">{moneyCell(solar.premium)}</td>
              </tr>
            </tbody>
          </table>
          <p className="hint" data-testid="solar-standard-cite">{solar.standard.citation}</p>
          <p className="hint" data-testid="solar-premium-cite">{solar.premium.citation}</p>
        </>
      )}
      {batteryKwh > 0 && battery?.available && (
        <>
          <table className="report-table">
            <tbody>
              <tr>
                <td>Battery only ({battery.kwh} kWh)</td>
                <td data-testid="battery-only-price">{moneyCell(battery.only)}</td>
              </tr>
              <tr>
                <td>Battery + inverter ({battery.kwh} kWh)</td>
                <td data-testid="battery-inverter-price">{moneyCell(battery.withInverter)}</td>
              </tr>
            </tbody>
          </table>
          <p className="hint">{battery.only.citation} {battery.only.caveat}</p>
          <p className="hint">{battery.withInverter.citation} {battery.withInverter.caveat}</p>
          <p className="hint">Not included: {battery.excludes}.</p>
        </>
      )}
      {batteryKwh > 0 && battery && !battery.available && <p>Battery benchmark: unavailable. {battery.reason}</p>}
      {batteryKwh > 0 && (
        <p className="hint" data-testid="combined-caveat">
          These solar and battery figures are not added together. There is no combined installed-price dataset, so this is not a project quotation.
        </p>
      )}
      <h4>Simple payback</h4>
      {pay?.kind === 'user-quote' && pay.years && (
        <p data-testid="payback-quote">
          From your installer quote of {fmtMoney(pay.cost)}: {fmtYears(pay.years)}. Savings-to-cost {pay.savingsToCostPct.toFixed(1)}%. {pay.label}
        </p>
      )}
      {pay?.kind === 'user-quote' && !pay.years && (
        <p>Your quote is saved. Simple payback needs a modelled yearly saving above zero. {pricing.financeNote}</p>
      )}
      {pay?.kind === 'solar-only' && (
        <ul>
          {pay.standard?.years ? (
            <li>
              Standard offer {fmtMoney(pay.standard.cost)}: {fmtYears(pay.standard.years)}. Savings-to-cost {pay.standard.savingsToCostPct.toFixed(1)}%.
            </li>
          ) : (
            <li>Standard-offer payback is not shown. It needs a modelled yearly saving above zero.</li>
          )}
          {pay.premium?.years ? (
            <li>
              Premium offer {fmtMoney(pay.premium.cost)}: {fmtYears(pay.premium.years)}. Savings-to-cost {pay.premium.savingsToCostPct.toFixed(1)}%.
            </li>
          ) : (
            <li>Premium-offer payback is not shown. It needs a modelled yearly saving above zero.</li>
          )}
        </ul>
      )}
      {!pay && (
        <p data-testid="payback-unavailable">
          {pricing?.paybackBlocked || 'Simple payback is unavailable.'} Use the quote box, or ask an installer for a price for this design.
        </p>
      )}
      <p className="hint">{pricing?.financeNote}</p>
      <p className="hint">{pricing?.rebateNote}</p>
      <p className="hint">{pricing?.stalenessNote}</p>
      <p className="hint">
        Sources:{' '}
        <a href={SOLAR_INDEX.source}>Solar Choice solar index</a> (updated {SOLAR_INDEX.updated}),{' '}
        <a href={BATTERY_INDEX.source}>Solar Choice battery index</a> (updated {BATTERY_INDEX.updated}),{' '}
        <a href={BATTERY_REBATE.source}>Cheaper Home Batteries</a> (updated {BATTERY_REBATE.updated}, no dollar rate).
      </p>
    </div>
  )
}

function LayoutSketch({ panels }) {
  if (!panels?.length) return null
  const pts = panels.flatMap((p) => p.corners ?? [])
  if (pts.length < 3) return null
  const lat0 = pts[0].lat
  const lng0 = pts[0].lng
  const xy = (p) => ({
    x: (p.lng - lng0) * Math.cos((lat0 * Math.PI) / 180) * 111320,
    y: (p.lat - lat0) * 111320,
  })
  const all = pts.map(xy)
  const minX = Math.min(...all.map((p) => p.x))
  const maxX = Math.max(...all.map((p) => p.x))
  const minY = Math.min(...all.map((p) => p.y))
  const maxY = Math.max(...all.map((p) => p.y))
  const w = Math.max(0.2, maxX - minX)
  const h = Math.max(0.2, maxY - minY)
  const pad = 0.4
  return (
    <figure className="layout-sketch-wrap">
      <svg
        className="layout-sketch"
        viewBox={`${minX - pad} ${-(maxY + pad)} ${w + pad * 2} ${h + pad * 2}`}
        role="img"
        aria-label={`${panels.length} panels placed in this design`}
      >
        {panels.map((p) => {
          const c = (p.corners ?? []).map(xy)
          if (c.length < 3) return null
          const d = `${c.map((q, i) => `${i === 0 ? 'M' : 'L'}${q.x.toFixed(2)},${(-q.y).toFixed(2)}`).join(' ')} Z`
          return <path key={p.id} d={d} fill="#123a2d" stroke="#9ec5ff" strokeWidth={Math.max(w, h) / 80} />
        })}
      </svg>
      <figcaption>Panel positions from this design. Not taken from a price table.</figcaption>
    </figure>
  )
}

function wedge(startPct, endPct, fill) {
  const sweep = endPct - startPct
  if (sweep >= 99.9) return <circle cx="50" cy="50" r="40" fill={fill} />
  if (sweep <= 0.1) return null
  const rad = (pct) => (pct / 100) * Math.PI * 2 - Math.PI / 2
  const p = (pct) => ({ x: 50 + 40 * Math.cos(rad(pct)), y: 50 + 40 * Math.sin(rad(pct)) })
  const a = p(startPct)
  const b = p(endPct)
  const large = sweep > 50 ? 1 : 0
  return <path d={`M50,50 L${a.x.toFixed(2)},${a.y.toFixed(2)} A40,40 0 ${large} 1 ${b.x.toFixed(2)},${b.y.toFixed(2)} Z`} fill={fill} />
}

function SupplyPie({ gridPct }) {
  return (
    <>
      {wedge(0, gridPct, '#1f4e79')}
      {wedge(gridPct, 100, '#0f6b4a')}
    </>
  )
}

function SupplyChart({ sim }) {
  const a = sim?.annual
  if (!a || !(a.loadKwh > 0)) return null
  const solar = a.selfConsumedKwh
  const grid = a.importKwh
  const exported = a.exportKwh
  const drawable = solar >= 0 && grid >= 0 && solar + grid > 0
  const gridPct = drawable ? (grid / (solar + grid)) * 100 : 0
  return (
    <figure className="supply-chart">
      <figcaption>
        Household electricity from the modelled year. The split is grid import against solar used at home. Generation is not the denominator. Export is not a slice.
      </figcaption>
      {drawable ? (
        <div className="supply-split">
          <svg
            className="supply-doughnut"
            viewBox="0 0 100 100"
            role="img"
            aria-label={`Grid import ${Math.round(grid)} kilowatt hours, solar used at home ${Math.round(solar)} kilowatt hours`}
          >
            <SupplyPie gridPct={gridPct} />
          </svg>
          <ul>
            <li>Grid import: {fmtKwh(grid)}</li>
            <li>Solar used at home: {fmtKwh(solar)}</li>
          </ul>
        </div>
      ) : (
        <p>The chart is not drawn because one of those figures is negative.</p>
      )}
      <p className="hint">Exported to the grid: {fmtKwh(exported)}. That is a bill credit, not household consumption.</p>
    </figure>
  )
}
