// SummaryCards.jsx — M2B hero metric cards
export default function SummaryCards({ summary }) {
  if (!summary) return null

  const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
  const fmtHr = (n) => `${Number(n).toFixed(1)}h`
  const fmtUSD = (n) => `$${fmt(n)}`

  const cards = [
    {
      color: 'teal',
      icon: '⏱',
      label: 'Total Delay Hours (Pilot)',
      value: fmtHr(summary.total_delay_hours),
      sub: `Nonmedical discharge delays across ${summary.patient_count} M2B patients`,
    },
    {
      color: 'amber',
      icon: '💰',
      label: 'Pilot Cohort Cost',
      value: fmtUSD(summary.total_cost_usd),
      sub: `${fmtHr(summary.avg_delay_hours_per_patient)} avg delay × $${summary.cost_per_hour}/hr CA rate`,
    },
    {
      color: 'red',
      icon: '📈',
      label: 'Extrapolated Monthly Waste',
      value: fmtUSD(summary.extrapolated_cost_usd),
      sub: `Scaled from ${summary.pilot_fraction_pct}% pilot → ${800 - Math.round(800 * summary.pilot_fraction_pct / 100)} remaining patients`,
    },
    {
      color: 'green',
      icon: '📉',
      label: 'Month 1 Improvement',
      value: '1.5h',
      sub: 'Avg delay reduced: 4.4h → 3.0h per patient',
    },
    {
      color: 'red',
      icon: '🚩',
      label: 'Missing PCP',
      value: `${summary.patients_missing_pcp} / ${summary.patient_count}`,
      sub: `${Math.round(summary.patients_missing_pcp / summary.patient_count * 100)}% of M2B patients lack primary care physician`,
    },
    {
      color: 'amber',
      icon: '📋',
      label: 'Duplicate EHR Entries',
      value: summary.duplicate_ehr_entries,
      sub: 'Same-patient multi-staff data entry detected',
    },
  ]

  return (
    <div className="summary-grid">
      {cards.map((c, i) => (
        <div key={i} className={`summary-card ${c.color}`}>
          <div className="icon">{c.icon}</div>
          <div className="label">{c.label}</div>
          <div className="value">{c.value}</div>
          <div className="sub">{c.sub}</div>
        </div>
      ))}
    </div>
  )
}
