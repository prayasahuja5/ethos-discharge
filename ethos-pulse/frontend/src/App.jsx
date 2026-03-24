// App.jsx — Main Ethos Pulse dashboard with polling and tab navigation
import { useState, useEffect, useCallback } from 'react'
import { api } from './api'
import SummaryCards from './components/SummaryCards'
import DelayByDeptChart from './components/DelayByDeptChart'
import PatientTable from './components/PatientTable'
import SavingsToggle from './components/SavingsToggle'
import FlagView from './components/FlagView'

const POLL_INTERVAL = 30_000 // 30 seconds

export default function App() {
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchAll = useCallback(async () => {
    try {
      const [summary, patients, departments, pcpGaps, costImpact] = await Promise.all([
        api.summary(),
        api.patients(),
        api.delayByDept(),
        api.pcpGaps(),
        api.costImpact(),
      ])
      setData({
        summary,
        patients: patients.patients,
        departments: departments.departments,
        pcpGaps: pcpGaps.patients,
        costImpact,
      })
      setLastUpdated(new Date())
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const id = setInterval(fetchAll, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [fetchAll])

  const tabs = [
    { id: 'overview',  label: '📊 Overview' },
    { id: 'delays',    label: '⏱ Delay Analysis' },
    { id: 'patients',  label: '🧑‍⚕️ Patients' },
    { id: 'savings',   label: '💡 Savings Model' },
    { id: 'flags',     label: '🚩 Flagged' },
  ]

  if (loading) return (
    <div className="app-shell">
      <Topbar lastUpdated={lastUpdated} />
      <div className="loading-state">
        <div className="spinner" />
        <div className="text-muted" style={{ fontSize: '0.85rem' }}>Loading Ethos Pulse data…</div>
      </div>
    </div>
  )

  if (error) return (
    <div className="app-shell">
      <Topbar lastUpdated={lastUpdated} />
      <div className="error-state">
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
        <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>API Unavailable</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{error}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '1rem' }}>
          Start the API:&nbsp;<code style={{ background: 'var(--bg-card)', padding: '0.2rem 0.5rem', borderRadius: 4 }}>
            cd api && uvicorn main:app --port 8080
          </code>
        </div>
      </div>
    </div>
  )

  const { summary, patients, departments, pcpGaps, costImpact } = data

  return (
    <div className="app-shell">
      <Topbar lastUpdated={lastUpdated} summary={summary} />

      <div className="nav-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`nav-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="main-content">

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <>
            <SummaryCards summary={summary} />

            <div className="grid-2">
              <div className="card">
                <div className="section-header">
                  <span className="section-title">⏱ Delay by Department</span>
                  <span className="text-muted" style={{ fontSize: '0.72rem' }}>by delay category</span>
                </div>
                <DelayByDeptChart departments={departments} />
              </div>

              <div className="card">
                <div className="section-header">
                  <span className="section-title">💡 Quick Savings Preview</span>
                  <span className="text-muted" style={{ fontSize: '0.72rem' }}>50% recovery scenario</span>
                </div>
                {costImpact && (
                  <div style={{ padding: '1rem 0' }}>
                    {[
                      { label: 'Baseline Monthly Cost', val: `$${Number(costImpact.extrapolated_baseline_usd).toLocaleString('en-US', { maximumFractionDigits: 0 })}`, color: 'var(--red)' },
                      { label: 'At 25% Recovery', val: `$${Number(costImpact.scenarios[0].extrapolated_cost_saved_usd).toLocaleString('en-US', { maximumFractionDigits: 0 })} saved`, color: 'var(--amber)' },
                      { label: 'At 50% Recovery', val: `$${Number(costImpact.scenarios[1].extrapolated_cost_saved_usd).toLocaleString('en-US', { maximumFractionDigits: 0 })} saved`, color: 'var(--teal)' },
                      { label: 'At 75% Recovery', val: `$${Number(costImpact.scenarios[2].extrapolated_cost_saved_usd).toLocaleString('en-US', { maximumFractionDigits: 0 })} saved`, color: 'var(--green)' },
                    ].map((r, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
                        <span style={{ fontSize: '0.83rem', color: 'var(--text-secondary)' }}>{r.label}</span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: r.color }}>{r.val}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="card grid-full">
              <div className="section-header">
                <span className="section-title">🚩 Top Flagged Patients</span>
                <span className="text-muted" style={{ fontSize: '0.72rem' }}>Missing PCP assignment</span>
              </div>
              <FlagView pcpGaps={pcpGaps?.slice(0, 8)} patients={patients} />
            </div>
          </>
        )}

        {/* ── DELAY ANALYSIS ── */}
        {tab === 'delays' && (
          <div className="card">
            <div className="section-header">
              <span className="section-title">⏱ Discharge Delay by Department</span>
            </div>
            <div style={{ height: 500 }}>
              <DelayByDeptChart departments={departments} />
            </div>
          </div>
        )}

        {/* ── PATIENTS ── */}
        {tab === 'patients' && (
          <div className="card">
            <div className="section-header">
              <span className="section-title">🧑‍⚕️ Per-Patient Discharge Delay Breakdown</span>
            </div>
            <PatientTable patients={patients} />
          </div>
        )}

        {/* ── SAVINGS ── */}
        {tab === 'savings' && (
          <div className="card">
            <SavingsToggle costImpact={costImpact} />
          </div>
        )}

        {/* ── FLAGS ── */}
        {tab === 'flags' && (
          <div className="card">
            <div className="section-header">
              <span className="section-title">🚩 Flagged Patients</span>
              <span className="text-muted" style={{ fontSize: '0.72rem' }}>Operational risk indicators</span>
            </div>
            <FlagView pcpGaps={pcpGaps} patients={patients} />
          </div>
        )}

      </div>
    </div>
  )
}

function Topbar({ lastUpdated, summary }) {
  return (
    <div className="topbar">
      <div className="topbar-brand">
        <div className="brand-pulse">⚡</div>
        <span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Ethos </span>
          <span style={{ background: 'linear-gradient(90deg, var(--teal), #0084FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Pulse
          </span>
        </span>
      </div>
      <div className="topbar-meta">
        <span>
          <span className="status-dot" />
          Live · {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Loading…'}
        </span>
        {summary && (
          <>
            <span>{summary.patient_count} patients · {summary.pilot_fraction_pct}% pilot</span>
            <span style={{ color: 'var(--teal)', fontWeight: 600 }}>
              ${Number(summary.extrapolated_cost_usd).toLocaleString('en-US', { maximumFractionDigits: 0 })} / mo extrapolated
            </span>
          </>
        )}
      </div>
    </div>
  )
}
