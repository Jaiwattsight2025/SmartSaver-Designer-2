import { useDesign } from '../../hooks/useDesign'
import { fmtKw, fmtKwh, fmtMoney, fmtPct } from '../../lib/format'
import MonthlyChart from '../MonthlyChart'
import EnergyProfileCard from '../EnergyProfileCard'

export default function OutputStep() {
  const { design, profile } = useDesign()
  const { sim, bill } = design
  return (
    <div className="control-stack">
      <div className="big-figure">
        <span>Yearly solar output</span>
        <strong>{fmtKwh(design.annualGenKwh)}</strong>
        <small>
          {fmtKw(design.layout.dcKw)} system · {Math.round(design.specificYield).toLocaleString('en-AU')} kWh per kW
        </small>
      </div>
      {bill ? (
        <div className="big-figure good">
          <span>Estimated bill saving</span>
          <strong>{fmtMoney(bill.savingAnnual)}/yr</strong>
          <small>
            {fmtPct(sim.annual.selfConsumptionPct)} of your solar used at home
          </small>
        </div>
      ) : (
        <>
          <div className="info-box">Add your bill data to see savings.</div>
          <EnergyProfileCard />
        </>
      )}
      {profile && <EnergyProfileCard compact />}
    </div>
  )
}

/**
 * Generation, self-use and bill tables from the design already computed for
 * Output and savings. Print uses this same component. It does not recalculate.
 */
export function SavingsReport({ design, variant }) {
  const { sim, bill } = design
  if (!sim) {
    return (
      <p>
        Your panels should make about <strong>{fmtKwh(design.annualGenKwh)}</strong> a year. Add your bill data in
        step 1 (or on the left) to see self-use, export and bill savings.
      </p>
    )
  }
  const a = sim.annual
  return (
    <>
      <MonthlyChart
        months={sim.months}
        title={variant === 'proposal' ? 'Use and solar output by month' : undefined}
        note={
          variant === 'proposal'
            ? 'Your use is this bill scaled across the year. Solar output is modelled for this design. Neither is measured month by month.'
            : undefined
        }
      />
      <div className="report-columns">
        <section>
          <h4>Where your solar goes (per year)</h4>
          <table className="report-table">
            <tbody>
              <tr>
                <td>Generated</td>
                <td>{fmtKwh(a.genKwh)}</td>
              </tr>
              <tr>
                <td>Used straight away</td>
                <td>{fmtKwh(a.directKwh)}</td>
              </tr>
              <tr>
                <td>Used later from the battery</td>
                <td>{fmtKwh(a.batteryKwh)}</td>
              </tr>
              <tr>
                <td>Sent to the grid (export)</td>
                <td>{fmtKwh(a.exportKwh)}</td>
              </tr>
              <tr>
                <td>Still bought from the grid</td>
                <td>{fmtKwh(a.importKwh)}</td>
              </tr>
              <tr>
                <td>Home powered by solar</td>
                <td>{fmtPct(a.selfSufficiencyPct)}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section>
          <h4>Your bill (per year)</h4>
          <table className="report-table">
            <tbody>
              <tr>
                <td>Now</td>
                <td>{fmtMoney(bill.beforeAnnual)}</td>
              </tr>
              <tr>
                <td>With this system</td>
                <td>{fmtMoney(bill.afterAnnual)}</td>
              </tr>
              <tr>
                <td>Less power bought</td>
                <td>{fmtMoney(bill.importSaving)}</td>
              </tr>
              <tr>
                <td>Feed-in credit</td>
                <td>{fmtMoney(bill.exportCredit)}</td>
              </tr>
              <tr className="total">
                <td>Saving</td>
                <td>{fmtMoney(bill.savingAnnual)}</td>
              </tr>
            </tbody>
          </table>
          {design.billSolarOnly && design.batteryKwh > 0 && (
            <p className="hint">
              Solar alone would save {fmtMoney(design.billSolarOnly.savingAnnual)}; the battery adds{' '}
              {fmtMoney(bill.savingAnnual - design.billSolarOnly.savingAnnual)}.
            </p>
          )}
        </section>
      </div>
      <p className="hint">
        Estimates. Output source: {design.generationSource}. Bill maths uses your rates: usage, daily supply and
        feed-in. An after-bill below $0 means credits exceed charges. Real results depend on weather, shading and how
        you use power.
      </p>
    </>
  )
}

export function OutputReport() {
  const { design } = useDesign()
  return (
    <div className="report">
      <h3>{design.sim ? 'Month by month' : 'Your solar output'}</h3>
      <SavingsReport design={design} />
    </div>
  )
}
