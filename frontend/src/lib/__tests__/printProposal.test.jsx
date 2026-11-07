import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { facesFromBuildingInsights } from '../roofFaces'
import { computeDesign } from '../design'
import { profileFromUrl } from '../energyProfile'
import { exampleQuery, insightsFixture } from './fixtures'
import { fmtKwh, fmtMoney, fmtYears } from '../format'
import { SavingsReport } from '../../components/steps/OutputStep'
import { ProposalDocument, coverPayback } from '../../components/steps/SummaryStep'
import { REPORT_BYLINE, REPORT_COLORS, REPORT_FOOTER, REPORT_PRODUCT, solarDestination } from '../reportDesign'

const profile = profileFromUrl(exampleQuery).profile
const faces = facesFromBuildingInsights(insightsFixture)
const pv = { moduleWatts: 440, panelCount: 20 }

function designFor(extra = {}) {
  return computeDesign({
    profile,
    insights: insightsFixture,
    roofFaces: faces,
    pv,
    battery: { batteryKwh: 13.5, inverterKw: null },
    state: 'VIC',
    ...extra,
  })
}

describe('print proposal uses the output figures', () => {
  const design = designFor()
  const saving = fmtMoney(design.bill.savingAnnual)
  const generated = fmtKwh(design.sim.annual.genKwh)

  it('prints the same generation and bill strings as the output report', () => {
    const output = renderToStaticMarkup(<SavingsReport design={design} />)
    const proposal = renderToStaticMarkup(
      <ProposalDocument design={design} pv={pv} profile={profile} roofFaces={faces} address="Synthetic fixture VIC 3000" />,
    )
    expect(output).toContain('Where your solar goes')
    expect(output).toContain(generated)
    expect(output).toContain(saving)
    expect(proposal).toContain(generated)
    expect(proposal).toContain(saving)
    expect(proposal).toContain('proposal-cover')
    expect(proposal).toContain('proposal-follow')
    expect(proposal).toContain('data-testid="proposal-generation"')
    expect(proposal).toContain('Monthly solar generation compared with household use')
    expect(proposal).toContain('Synthetic fixture')
    expect(proposal).toContain('not added together')
    expect(proposal).not.toContain('PLACEHOLDER')
    expect(proposal).not.toContain('AlphaESS')
  })

  it('does not invent a payback when solar and battery are separate benchmarks', () => {
    expect(design.payback).toBeNull()
    expect(coverPayback(design.payback)).toMatch(/Unavailable/)
    const proposal = renderToStaticMarkup(
      <ProposalDocument design={design} pv={pv} profile={profile} roofFaces={faces} address="" />,
    )
    expect(proposal).toContain(coverPayback(null))
  })

  it('shows a quote payback only from the same payback object', () => {
    const quoted = designFor({ installerQuoteAud: 20000 })
    expect(quoted.payback.kind).toBe('user-quote')
    const line = coverPayback(quoted.payback)
    expect(line).toContain('Not an IRR')
    expect(line).toContain(fmtYears(quoted.payback.years))
    const proposal = renderToStaticMarkup(
      <ProposalDocument design={quoted} pv={pv} profile={profile} roofFaces={faces} address="" />,
    )
    expect(proposal).toContain(line)
  })

  it('labels savings unavailable when there is no bill, and still shows generation', () => {
    const bare = computeDesign({
      profile: null,
      insights: insightsFixture,
      roofFaces: faces,
      pv,
      battery: { batteryKwh: 0, inverterKw: null },
      state: 'VIC',
    })
    expect(bare.bill).toBeNull()
    const proposal = renderToStaticMarkup(
      <ProposalDocument design={bare} pv={pv} profile={null} roofFaces={faces} address="" />,
    )
    expect(proposal).toContain('Unavailable')
    expect(proposal).toContain('add bill data')
    expect(proposal).toContain(fmtKwh(bare.annualGenKwh))
    expect(proposal).toContain('Add your bill data')
  })
})

describe('print stylesheet', () => {
  const css = readFileSync(new URL('../../App.css', import.meta.url), 'utf8')
  const print = css.slice(css.lastIndexOf('@media print'))

  it('is A4 and hides the app chrome without clipping the report', () => {
    expect(css).toMatch(/@page\s*\{[^}]*size:\s*A4/)
    expect(print).toMatch(/\.control-panel/)
    expect(print).toMatch(/\.step-sidebar/)
    expect(print).toMatch(/\.panel-navigation/)
    expect(print).toMatch(/\.google-map/)
    expect(print).toMatch(/\.metrics-strip/)
    expect(print).toMatch(/display:\s*none !important/)
    expect(print).toMatch(/\.proposal-follow[\s\S]*break-before:\s*page/)
    expect(print).toMatch(/\.proposal-generation[\s\S]*break-before:\s*auto/)
    expect(css).toMatch(/Indicative estimate, not a quote/)
    expect(css).toMatch(/Solar Designer\s+\|\s+Page/)
    expect(css).toMatch(/#20a97c/)
    expect(css).toMatch(/#f5a623/)
    expect(css).toMatch(/#186888/)
    expect(css).toMatch(/#b0b8b8/)
    expect(print).toMatch(/overflow:\s*visible !important/)
    expect(print).toMatch(/\.report-columns[\s\S]*display:\s*block !important/)
  })
})

describe('approved proposal treatment', () => {
  const design = designFor()

  it('names Solar Designer once for the company and uses the locked category colours', () => {
    const guide = readFileSync(new URL('../../../../docs/report-design.md', import.meta.url), 'utf8')
    expect(guide).toContain('7 November 2026')
    expect(guide).toContain(REPORT_COLORS.daylight)
    expect(guide).toContain(REPORT_COLORS.battery)
    expect(guide).toContain(REPORT_COLORS.export)
    expect(guide).toContain(REPORT_COLORS.loss)
    const proposal = renderToStaticMarkup(
      <ProposalDocument design={design} pv={pv} profile={profile} roofFaces={faces} address="Synthetic fixture VIC 3000" />,
    )
    expect(proposal).toContain(REPORT_PRODUCT)
    expect(proposal).toContain(REPORT_BYLINE)
    expect(proposal).toContain(REPORT_FOOTER)
    expect(proposal).not.toContain('Energy Insights')
    expect(proposal.match(/SmartSaver Energy/g)).toEqual(['SmartSaver Energy'])
    expect(proposal).toContain(`stroke="${REPORT_COLORS.daylight}"`)
    expect(proposal).toContain(`stroke="${REPORT_COLORS.battery}"`)
    expect(proposal).toContain(`stroke="${REPORT_COLORS.export}"`)
    expect(proposal).toContain(`stroke="${REPORT_COLORS.loss}"`)
    expect(proposal).toContain('Example data')
    expect(proposal).toContain('not measured hour by hour')
    expect(proposal).not.toContain('#1f4e79')
  })

  it('draws charging loss from the stored balance and skips it when there is no battery', () => {
    const annual = design.sim.annual
    const dest = solarDestination(annual)
    const loss = dest.parts.find((part) => part.key === 'loss')
    expect(loss.kwh).toBeCloseTo(annual.genKwh - annual.directKwh - annual.batteryKwh - annual.exportKwh, 6)
    expect(loss.color).toBe(REPORT_COLORS.loss)
    const bare = solarDestination(design.simSolarOnly.annual)
    expect(bare.parts.some((part) => part.key === 'battery' || part.key === 'loss')).toBe(false)
  })

  it('keeps a long multi-face description in the layout page', () => {
    const long = `North roof ${'wing '.repeat(30)}end`
    const crowded = [
      { ...faces[0], id: 'long-face', label: long, included: true },
      { ...faces[1], id: 'second-face', label: 'East roof', included: true },
    ]
    const proposal = renderToStaticMarkup(
      <ProposalDocument design={design} pv={pv} profile={profile} roofFaces={crowded} address="Synthetic fixture VIC 3000" />,
    )
    expect(proposal).toContain(long)
    expect(proposal).toContain('East roof')
  })
})
