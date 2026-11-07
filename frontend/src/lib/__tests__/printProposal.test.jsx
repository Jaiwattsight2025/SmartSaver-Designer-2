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
    expect(proposal).toContain('Unavailable — add bill data')
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
    expect(print).toMatch(/overflow:\s*visible !important/)
    expect(print).toMatch(/\.report-columns[\s\S]*display:\s*block !important/)
  })
})
