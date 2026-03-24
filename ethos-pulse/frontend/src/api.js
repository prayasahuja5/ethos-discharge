// api.js — All API calls to the FastAPI backend

const BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL
  : '/api'

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API error ${res.status} on ${path}`)
  return res.json()
}

export const api = {
  summary:         () => get('/summary'),
  patients:        () => get('/patients'),
  delayByDept:     () => get('/delay-by-department'),
  pcpGaps:         () => get('/pcp-gaps'),
  costImpact:      () => get('/cost-impact'),
}
