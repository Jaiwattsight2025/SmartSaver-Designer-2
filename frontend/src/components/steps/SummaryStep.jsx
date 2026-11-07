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
import { REPORT_BYLINE, REPORT_COLORS, REPORT_FOOTER, REPORT_PRODUCT, reportDate, solarDestination } from '../../lib/reportDesign'
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
  const place = [profile?.postcode, profile?.state].filter(Boolean).join(' ')
  return (
    <article className="report summary-report proposal">
      <header className="proposal-cover">
        <div className="proposal-mast">
          <div className="proposal-brand">
            <ProposalMark />
            <div>
              <strong>{REPORT_PRODUCT}</strong>
              <span>{REPORT_BYLINE}</span>
            </div>
          </div>
          <p className="proposal-meta">
            Design proposal | {reportDate()}
            {(place || address) && (
              <>
                <br />
                {place || address}
              </>
            )}
          </p>
        </div>
        {synthetic && (
          <p className="proposal-banner example">
            Example data. Synthetic fixture — not a real property and not a live Google roof. Figures are examples. This is not a customer bill.
          </p>
        )}
        <p className="proposal-banner estimate">
          Market estimates. Prices and paybacks in this proposal are market estimates or a quote you typed. Firm pricing is arranged with an installer after a site visit. This is not a quote.
        </p>
        <h3>Your design at a glance</h3>
        <div className="proposal-cards">
          <Fact label="System" value={`${fmtKw(design.layout.dcKw)}${design.batteryKwh > 0 ? ` + ${design.batteryKwh} kWh` : ''}`} detail={`${design.layout.count} × ${pv.moduleWatts} W · ${design.inverterKw} kW inverter`} />
          <Fact label="Solar generated" value={fmtKwh(design.annualGenKwh)} detail="modelled for this design / year" />
          <Fact label="Bill now" value={bill ? `${fmtMoney(bill.beforeAnnual)}/yr` : 'Unavailable'} detail={bill ? 'from your rates, estimated for a year' : 'add bill data'} />
          <Fact label="Bill with system" value={bill ? `${fmtMoney(bill.afterAnnual)}/yr` : 'Unavailable'} detail={bill ? 'modelled' : 'add bill data'} />
        </div>
        <p className="proposal-callout">
          <strong>{bill ? `${fmtMoney(bill.savingAnnual)} a year` : 'Saving unavailable'}</strong>
          <span>{bill ? ' INDICATIVE' : ''}</span>
          <br />
          {coverPayback(design.payback)}
        </p>
        <LayoutSketch panels={design.layout.panels} />
        <p className="hint">
          The later pages use the same generation and bill figures as Output and savings. Prices are separate benchmarks, or a quote you typed.
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
              <td className="proposal-faces">
                {used.length
                  ? used.map((f) => (
                      <span key={f.id} className="proposal-face">
                        {f.label ?? f.orientation}: {f.orientation} {f.pitchDegrees}° {installTypeOf(f) === 'tilt' ? 'tilt frames' : 'flush'}
                      </span>
                    ))
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
        <SavingsReport design={design} variant="proposal" />
        <SolarDestination design={design} />
      </section>

      <section className="proposal-follow proposal-basis" data-testid="proposal-basis">
        <h3>Price basis and assumptions</h3>
        <PriceSection pricing={design.pricing} dcKw={design.layout.dcKw} batteryKwh={design.batteryKwh} />
        {(design.layout?.assumptions?.length > 0 || design.warnings?.length > 0 || design.validation?.issues?.length > 0) && (
          <>
            <h4>Model notes</h4>
            {(design.layout?.assumptions ?? []).map((a) => (
              <p key={a.id} className="proposal-cite">
                {a.text}
              </p>
            ))}
            {design.warnings.map((w) => (
              <p key={w} className="proposal-cite">
                {w}
              </p>
            ))}
            <ValidationList validation={design.validation} />
          </>
        )}
        <p className="proposal-disclaimer">
          This proposal is an indicative estimate. It is not a quote or financial advice. Savings come from this design&apos;s modelled use and the bill rates. An installer still has to check the roof, shading, switchboard and network rules.
        </p>
        <p className="proposal-endorsement">{REPORT_FOOTER}</p>
      </section>
    </article>
  )
}

function Fact({ label, value, detail }) {
  return (
    <div className="proposal-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}

function ProposalMark() {
  return (
    <svg className="proposal-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill={REPORT_COLORS.deep} />
      <circle cx="16" cy="16" r="6" fill={REPORT_COLORS.green} />
    </svg>
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
          <p className="proposal-cite" data-testid="solar-standard-cite">{solar.standard.citation}</p>
          <p className="proposal-cite" data-testid="solar-premium-cite">{solar.premium.citation}</p>
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
          <p className="proposal-cite">{battery.only.citation} {battery.only.caveat}</p>
          <p className="proposal-cite">{battery.withInverter.citation} {battery.withInverter.caveat}</p>
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
      {pricing?.financeNote && <p className="proposal-banner estimate">{pricing.financeNote}</p>}
      {pricing?.rebateNote && <p className="proposal-cite">{pricing.rebateNote}</p>}
      {pricing?.stalenessNote && <p className="proposal-cite">{pricing.stalenessNote}</p>}
      <p className="proposal-cite">
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
          return <path key={p.id} d={d} fill={REPORT_COLORS.deep} stroke={REPORT_COLORS.green} strokeWidth={Math.max(w, h) / 80} />
        })}
      </svg>
      <figcaption>Panel positions from this design. Not taken from a price table.</figcaption>
    </figure>
  )
}

function ringParts(parts) {
  const total = parts.reduce((sum, part) => sum + part.kwh, 0)
  const radius = 36
  const circ = 2 * Math.PI * radius
  let walked = 0
  return parts.map((part) => {
    const len = total > 0 ? (part.kwh / total) * circ : 0
    const slice = { ...part, dash: `${len.toFixed(2)} ${(circ - len).toFixed(2)}`, shift: (-walked).toFixed(2) }
    walked += len
    return slice
  })
}

function DestinationDonut({ title, annual }) {
  const dest = solarDestination(annual)
  if (!dest) return null
  const slices = ringParts(dest.parts)
  return (
    <figure className="proposal-donut">
      <figcaption className="chart-title">{title}</figcaption>
      <svg viewBox="0 0 100 100" role="img" aria-label={title}>
        <circle cx="50" cy="50" r="36" fill="none" stroke={REPORT_COLORS.track} strokeWidth="12" />
        {slices.map((slice) => (
          <circle
            key={slice.key}
            cx="50"
            cy="50"
            r="36"
            fill="none"
            stroke={slice.color}
            strokeWidth="12"
            strokeDasharray={slice.dash}
            strokeDashoffset={slice.shift}
            transform="rotate(-90 50 50)"
          />
        ))}
      </svg>
      <ul className="proposal-legend">
        {dest.parts.map((part) => (
          <li key={part.key}>
            <i style={{ background: part.color }} />
            {part.label} {dest.total > 0 ? `${Math.round((part.kwh / dest.total) * 100)}%` : ''} ({fmtKwh(part.kwh)})
          </li>
        ))}
      </ul>
    </figure>
  )
}

function SolarDestination({ design }) {
  const annual = design.sim?.annual
  if (!annual) return null
  const withBattery = design.batteryKwh > 0 && design.simSolarOnly?.annual
  const names = []
  if (annual.directKwh > 0) names.push('Green is solar used while the sun is out.')
  if (annual.exportKwh > 0) names.push('Amber is exported.')
  if (annual.batteryKwh > 0) names.push('Teal is energy the battery later supplies to the home. It is not a second copy of daytime use.')
  const loss = annual.genKwh - annual.directKwh - annual.batteryKwh - annual.exportKwh
  if (loss >= 0.5) names.push('Grey is energy lost charging the battery in the model and is not counted as export.')
  return (
    <div className="proposal-destination">
      <div className={withBattery ? 'proposal-donuts' : 'proposal-donuts single'}>
        {withBattery && <DestinationDonut title="Where solar goes with no battery" annual={design.simSolarOnly.annual} />}
        <DestinationDonut title={withBattery ? 'Where solar goes with this battery' : 'Where solar goes'} annual={annual} />
      </div>
      <p className="chart-note">
        {names.join(' ')} {withBattery ? 'Both charts use' : 'This chart uses'} the same modelled year as Output and savings. {withBattery ? 'They are' : 'It is'} not measured hour by hour.
      </p>
    </div>
  )
}
