// PatientTable.jsx — sortable, paginated per-patient delay breakdown
import { useState } from 'react'

const PAGE_SIZE = 15

function SortIcon({ dir }) {
  if (!dir) return <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>↕</span>
  return <span style={{ color: 'var(--teal)', marginLeft: 4 }}>{dir === 'asc' ? '↑' : '↓'}</span>
}

export default function PatientTable({ patients }) {
  const [sort, setSort] = useState({ key: 'delay_hours', dir: 'desc' })
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [filterFlag, setFilterFlag] = useState('all')

  if (!patients?.length) return (
    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
      No patient data available
    </div>
  )

  const handleSort = (key) => {
    setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))
    setPage(0)
  }

  let data = [...patients]

  // Search by patient id or category
  if (search.trim()) {
    const q = search.toLowerCase()
    data = data.filter(p =>
      String(p.patient_id).includes(q) ||
      (p.delay_category || '').toLowerCase().includes(q) ||
      (p.insurance_category || '').toLowerCase().includes(q)
    )
  }

  // Filter by flag
  if (filterFlag === 'no_pcp') data = data.filter(p => !p.pcp_assigned)
  if (filterFlag === 'snf')    data = data.filter(p => p.snf_requested)
  if (filterFlag === 'dup')    data = data.filter(p => p.is_duplicate_ehr_entry)

  // Sort
  data.sort((a, b) => {
    const av = a[sort.key] ?? 0, bv = b[sort.key] ?? 0
    if (typeof av === 'boolean') return sort.dir === 'asc' ? av - bv : bv - av
    if (typeof av === 'number')  return sort.dir === 'asc' ? av - bv : bv - av
    return sort.dir === 'asc'
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av))
  })

  const pages = Math.ceil(data.length / PAGE_SIZE)
  const slice = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const Col = ({ label, k }) => (
    <th onClick={() => handleSort(k)}>
      {label}<SortIcon dir={sort.key === k ? sort.dir : null} />
    </th>
  )

  const fmtHr = (v) => v != null ? `${Number(v).toFixed(1)}h` : '—'
  const fmtUSD = (v) => v != null ? `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'

  const delayColor = (h) => {
    if (h >= 10) return 'text-red'
    if (h >= 5)  return 'text-amber'
    return 'text-teal'
  }

  return (
    <div>
      <div className="search-bar">
        <input
          className="search-input"
          placeholder="Search patient ID, category, insurance…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
        />
        {['all', 'no_pcp', 'snf', 'dup'].map(f => (
          <button
            key={f}
            className={`filter-tag ${filterFlag === f ? 'active' : ''}`}
            onClick={() => { setFilterFlag(f); setPage(0) }}
          >
            {f === 'all' ? 'All' : f === 'no_pcp' ? '⚠ No PCP' : f === 'snf' ? '🏥 SNF' : '📋 Dup EHR'}
          </button>
        ))}
        <span className="text-muted" style={{ fontSize: '0.75rem', marginLeft: 'auto' }}>
          {data.length} patients
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <Col label="Patient ID"    k="patient_id" />
              <Col label="Delay Hours"   k="delay_hours" />
              <Col label="Delay Cost"    k="delay_cost_usd" />
              <Col label="Delay Category" k="delay_category" />
              <Col label="Insurance"     k="insurance_category" />
              <Col label="LOS Days"      k="los_days" />
              <th>PCP</th>
              <th>SNF</th>
              <th>Readmit</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((p) => (
              <tr key={p.patient_id}>
                <td>
                  #{p.patient_id}
                  {p.is_duplicate_ehr_entry && (
                    <span className="badge badge-amber" style={{ marginLeft: 8 }}>DUP</span>
                  )}
                </td>
                <td className={delayColor(p.delay_hours)} style={{ fontWeight: 600 }}>
                  {fmtHr(p.delay_hours)}
                </td>
                <td>{fmtUSD(p.delay_cost_usd)}</td>
                <td>
                  {p.delay_category ? (
                    <span className="badge badge-teal">{p.delay_category}</span>
                  ) : '—'}
                </td>
                <td>{p.insurance_category || '—'}</td>
                <td>{p.los_days != null ? Number(p.los_days).toFixed(1) : '—'}</td>
                <td>
                  <span className={`badge ${p.pcp_assigned ? 'badge-green' : 'badge-red'}`}>
                    {p.pcp_assigned ? 'Yes' : 'No'}
                  </span>
                </td>
                <td>
                  <span className={`badge ${p.snf_requested ? 'badge-amber' : 'badge-gray'}`}>
                    {p.snf_requested ? 'Yes' : 'No'}
                  </span>
                </td>
                <td>
                  <span className={`badge ${p.readmission_30d ? 'badge-red' : 'badge-gray'}`}>
                    {p.readmission_30d ? 'Yes' : 'No'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="pagination">
          <span>Page {page + 1} of {pages}</span>
          <div className="page-btns">
            <button className="page-btn" onClick={() => setPage(0)} disabled={page === 0}>«</button>
            <button className="page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 0}>‹</button>
            {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
              const pg = Math.max(0, Math.min(page - 2 + i, pages - 5 + i))
              return (
                <button
                  key={pg}
                  className={`page-btn ${pg === page ? 'active' : ''}`}
                  onClick={() => setPage(pg)}
                >
                  {pg + 1}
                </button>
              )
            })}
            <button className="page-btn" onClick={() => setPage(p => p + 1)} disabled={page === pages - 1}>›</button>
            <button className="page-btn" onClick={() => setPage(pages - 1)} disabled={page === pages - 1}>»</button>
          </div>
        </div>
      )}
    </div>
  )
}
