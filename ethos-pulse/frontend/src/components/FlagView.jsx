// FlagView.jsx — Patients flagged for missing PCP or SNF sign-offs
import { useState } from 'react'

export default function FlagView({ pcpGaps, patients }) {
  const [activeFlag, setActiveFlag] = useState('pcp')

  const snfPatients = (patients || []).filter(p => p.snf_requested && !p.pcp_assigned)
  const readmitPatients = (patients || []).filter(p => p.readmission_30d)

  const lists = {
    pcp: { label: '⚠ No PCP Assigned', color: 'red', data: pcpGaps || [], icon: '👤' },
    snf: { label: '🏥 SNF + No PCP', color: 'amber', data: snfPatients, icon: '🏥' },
    readmit: { label: '🔁 Readmitted 30d', color: 'purple', data: readmitPatients, icon: '🔁' },
  }

  const current = lists[activeFlag]
  const data = current.data

  const fmt = (n) => `${Number(n).toFixed(1)}h`

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {Object.entries(lists).map(([key, val]) => (
          <button
            key={key}
            onClick={() => setActiveFlag(key)}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: '100px',
              border: `1px solid ${activeFlag === key ? 'var(--border-light)' : 'var(--border)'}`,
              background: activeFlag === key ? 'var(--bg-card-hover)' : 'transparent',
              color: activeFlag === key ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontFamily: 'var(--font)',
              transition: 'all 0.2s',
            }}
          >
            {val.label}
            <span style={{
              marginLeft: 8,
              background: 'var(--bg-surface)',
              padding: '0.1rem 0.4rem',
              borderRadius: '100px',
              fontSize: '0.68rem',
            }}>
              {val.data.length}
            </span>
          </button>
        ))}
      </div>

      {data.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
          ✅ No patients flagged in this category
        </div>
      ) : (
        <div className="flag-list">
          {data.slice(0, 30).map((p, i) => (
            <div key={p.patient_id || i} className="flag-item">
              <div className="flag-item-left">
                <div className="flag-icon">{current.icon}</div>
                <div>
                  <div className="flag-pid">Patient #{p.patient_id}</div>
                  <div className="flag-detail">
                    {[
                      p.insurance_category,
                      p.admitting_service_line,
                      p.discharge_disposition,
                    ].filter(Boolean).join(' · ') || 'No additional details'}
                  </div>
                </div>
              </div>
              <div className="flag-badges">
                {p.delay_hours > 0 && (
                  <span className={`badge ${p.delay_hours >= 10 ? 'badge-red' : p.delay_hours >= 5 ? 'badge-amber' : 'badge-teal'}`}>
                    {fmt(p.delay_hours)} delay
                  </span>
                )}
                {!p.pcp_assigned && (
                  <span className="badge badge-red">No PCP</span>
                )}
                {p.snf_requested && (
                  <span className="badge badge-amber">SNF</span>
                )}
                {p.readmission_30d && (
                  <span className="badge badge-purple">Readmit</span>
                )}
              </div>
            </div>
          ))}
          {data.length > 30 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem', padding: '1rem' }}>
              Showing top 30 of {data.length} flagged patients
            </div>
          )}
        </div>
      )}
    </div>
  )
}
