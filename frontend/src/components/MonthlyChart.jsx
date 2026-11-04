import { MONTHS } from '../config/designerConfig'

/** Simple SVG bars: solar generation vs household use, per month. */
export default function MonthlyChart({ months }) {
  if (!months?.length) return null
  const W = 640
  const H = 220
  const pad = { l: 44, r: 10, t: 14, b: 26 }
  const max = Math.max(...months.flatMap((m) => [m.genKwh, m.loadKwh]), 1)
  const step = (W - pad.l - pad.r) / 12
  const bw = step * 0.36
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((max * f) / 50) * 50)

  return (
    <figure className="monthly-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly solar generation compared with household use">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="axis">
              {t}
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const x = pad.l + i * step + step * 0.12
          return (
            <g key={MONTHS[i]}>
              <rect x={x} y={y(m.genKwh)} width={bw} height={y(0) - y(m.genKwh)} className="bar-gen">
                <title>{`${MONTHS[i]}: ${Math.round(m.genKwh)} kWh solar`}</title>
              </rect>
              <rect x={x + bw + 2} y={y(m.loadKwh)} width={bw} height={y(0) - y(m.loadKwh)} className="bar-load">
                <title>{`${MONTHS[i]}: ${Math.round(m.loadKwh)} kWh used`}</title>
              </rect>
              <text x={x + bw} y={H - 8} textAnchor="middle" className="axis">
                {MONTHS[i]}
              </text>
            </g>
          )
        })}
      </svg>
      <figcaption>
        <span className="key gen" /> Solar generated (kWh) <span className="key load" /> Household use (kWh)
      </figcaption>
    </figure>
  )
}
