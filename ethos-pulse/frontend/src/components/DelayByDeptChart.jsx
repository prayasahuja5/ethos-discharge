// DelayByDeptChart.jsx — Horizontal bar chart of delay hours by department
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'

const COLORS = [
  '#00D2FF', '#FFB547', '#FF4D6D', '#9B7FFF',
  '#2DFFB3', '#FF6B6B', '#4ECDC4', '#45B7D1',
]

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="custom-tooltip">
      <div className="tt-label">{label}</div>
      <div className="tt-value">{Number(d.total_delay_hours).toFixed(1)}h total delay</div>
      <div style={{ color: '#8898B5', fontSize: '0.72rem', marginTop: 4 }}>
        {d.patient_count} patients · {Number(d.avg_delay_hours).toFixed(1)}h avg
      </div>
    </div>
  )
}

export default function DelayByDeptChart({ departments }) {
  if (!departments?.length) return (
    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
      No department data available
    </div>
  )

  // top 10 only, filter out "service_line" duplicates, prefer delay_category
  const cats = departments.filter(d => d.source === 'delay_category')
  const data = (cats.length ? cats : departments).slice(0, 10)

  const formatLabel = (val) => {
    if (val.length > 20) return val.slice(0, 18) + '…'
    return val
  }

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 32, left: 160, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#1E2E4A"
            horizontal={false}
          />
          <XAxis
            type="number"
            tick={{ fill: '#8898B5', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}h`}
          />
          <YAxis
            type="category"
            dataKey="department"
            tick={{ fill: '#8898B5', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatLabel}
            width={155}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Bar dataKey="total_delay_hours" radius={[0, 4, 4, 0]} maxBarSize={28}>
            {data.map((_, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
