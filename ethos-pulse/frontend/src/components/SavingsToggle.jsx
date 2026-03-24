// SavingsToggle.jsx — Animated 25/50/75% savings scenario switcher
import { useState } from 'react'

export default function SavingsToggle({ costImpact }) {
  const [selected, setSelected] = useState(1) // default 50%

  if (!costImpact) return null

  const { baseline_delay_hours, baseline_delay_days, baseline_cost_usd, extrapolated_baseline_usd, scenarios } = costImpact

  const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
  const fmtUSD = (n) => `$${fmt(n)}`

  const sc = scenarios[selected]

  return (
    <div className="savings-section">
      <div className="section-header">
        <div>
          <div className="section-title">💡 Savings Scenarios</div>
          <div className="text-muted mt-1" style={{ fontSize: '0.78rem' }}>
            If Ethos Pulse can recover X% of delay hours — what is the cost impact?
          </div>
        </div>
      </div>

      {/* Baseline stats */}
      <div className="savings-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="savings-card">
          <div className="savings-value text-amber">{Number(baseline_delay_hours).toFixed(0)}h</div>
          <div className="savings-label">Baseline Delay Hours (Pilot)</div>
        </div>
        <div className="savings-card">
          <div className="savings-value text-amber">{Number(baseline_delay_days).toFixed(1)}d</div>
          <div className="savings-label">Baseline Delay Days (Pilot)</div>
        </div>
        <div className="savings-card">
          <div className="savings-value text-red">{fmtUSD(baseline_cost_usd)}</div>
          <div className="savings-label">Pilot Cohort Cost</div>
        </div>
        <div className="savings-card">
          <div className="savings-value text-red">{fmtUSD(extrapolated_baseline_usd)}</div>
          <div className="savings-label">Extrapolated Monthly Cost</div>
        </div>
      </div>

      {/* Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Scenario:</span>
        <div className="savings-toggle">
          {scenarios.map((s, i) => (
            <button
              key={i}
              className={selected === i ? 'active' : ''}
              onClick={() => setSelected(i)}
            >
              {s.reduction_pct}% Recovery
            </button>
          ))}
        </div>
      </div>

      {/* Scenario results */}
      <div className="savings-grid">
        <div className={`savings-card ${selected !== null ? 'selected' : ''}`}>
          <div className="savings-value">{fmtUSD(sc.cost_saved_usd)}</div>
          <div className="savings-label">Pilot Cohort Savings</div>
        </div>
        <div className={`savings-card ${selected !== null ? 'selected' : ''}`}>
          <div className="savings-value">{fmtUSD(sc.extrapolated_cost_saved_usd)}</div>
          <div className="savings-label">Extrapolated Monthly Savings</div>
        </div>
        <div className={`savings-card ${selected !== null ? 'selected' : ''}`}>
          <div className="savings-value text-green">{Number(sc.hours_recovered).toFixed(0)}h</div>
          <div className="savings-label">Hours Recovered</div>
        </div>
        <div className={`savings-card ${selected !== null ? 'selected' : ''}`}>
          <div className="savings-value text-green">{Number(sc.days_recovered).toFixed(1)}d</div>
          <div className="savings-label">Bed-Days Recovered</div>
        </div>
      </div>

      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '1rem', lineHeight: 1.6 }}>
        * Extrapolation assumes pilot cohort represents {costImpact.cost_per_hour && '7%'} of total monthly discharges.
        Savings calculated at ${costImpact.cost_per_hour}/hr operational delay rate.
        Bed-days recovered could translate to additional admissions for backlogged ED patients.
      </div>
    </div>
  )
}
