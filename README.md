# Ethos Platform

> **Operational AI infrastructure for hospital discharge coordination**
> Meds-to-Beds Pilot — Saint John's Regional Medical Center, March 2026

---

## Why This Exists

Every day, patients who are medically cleared for discharge sit in hospital beds for 4+ extra hours — not because of clinical reasons, but because of broken coordination: no one notified the pharmacy, no SNF has confirmed a bed, no PCP has been assigned.

In California at $135/hr, that's **$607 wasted per patient**. Across 800 monthly discharges, it's **$600,000+ per year in preventable operational cost**.

Ethos fixes this with automated checklists, intelligent resource matching, and real-time visibility — built directly into the workflow case managers already use.

---

## The Two Products

### 1. ⚡ Discharge Agent (`server/` + `web/`)
**Who it's for**: Case managers, charge nurses, discharge coordinators

The **operational tool** — powered by a rules engine that receives Epic ADT events and automatically:
- Builds a patient discharge checklist at admission
- Generates tasks: SNF referral, PCP placement, pharmacy coordination, transportation, follow-up
- Ranks SNF facilities by availability, insurance compatibility, and historical response time
- Alerts when windows are closing (e.g., pharmacy has 30 min before expected discharge)
- Learns from every SNF response to improve future ranking

**Start it**: `docker compose up && npm run dev` (see `web/README.md`)

### 2. 📊 Ethos Pulse (`ethos-pulse/`)
**Who it's for**: Hospital COO, Finance, Ethos leadership

The **executive analytics layer** — ingests monthly Excel pilot exports and surfaces:
- Total nonmedical delay hours and cost impact
- Extrapolation from 80-patient pilot → full 800-patient population
- Savings scenarios at 25/50/75% operational improvement
- Per-patient breakdown, flagged bottlenecks (no PCP, SNF backlog, duplicate EHR)
- Month-over-month improvement tracking

**Start it**: `cd ethos-pulse && python pipeline/run.py && uvicorn api/main:app --port 8080` (see `ethos-pulse/README.md`)

---

## Key Numbers (Pilot Cohort)

| Metric | Value |
|--------|-------|
| Total monthly discharges (hospital) | 800 |
| Patients in M2B pilot | 80 (10%) |
| Avg nonmedical delay before Ethos | **4.4 hours** |
| Cost per delay hour (CA) | **$135** |
| Monthly waste (80-patient cohort) | **$48,000** |
| Annual waste extrapolated (800 pts) | **$600,000+** |
| Month 1: Avg delay reduced | **4.4h → 3.0h (−1.5h)** |
| Patients lacking PCP | **80%** |
| SNF placement wait (avg) | **28 hours** |
| Pharmacy visibility gap | **45–90 minutes** |
| TCM billing identified (Month 1) | **$1,400** |

---

## Repository Structure

```
discharge-agent-prototype/
├── server/                    ← Node.js rules engine + REST API
│   └── src/
│       ├── simulator.js       ADT message processing
│       ├── rulesEngine.js     Auto-task generation logic
│       ├── resourceMatching.js SNF + PCP matching
│       ├── scoring.js         Complexity scorer
│       ├── alerts.js          Time-sensitive alert generation
│       ├── routes.js          Dashboard API + SNF learning loop
│       └── schema.js          PostgreSQL migrations
│
├── web/                       ← React discharge agent dashboard
│   └── src/
│       ├── App.jsx            Main UI (premium dark mode design)
│       ├── api.js             API client
│       └── styles.css         Design system
│
├── ethos-pulse/               ← Python analytics pipeline + dashboard
│   ├── pipeline/              ingest → preprocess → metrics → export
│   ├── api/                   FastAPI (5 endpoints)
│   ├── frontend/              React analytics dashboard
│   └── data/raw/              Raw Excel pilot data
│
└── docs/                      ← Shared documentation
    ├── architecture.md        System + clinical + IA diagrams
    ├── for-case-managers.md   Plain-English onboarding guide
    └── for-coo.md             Executive summary + ROI
```

---

## Documentation Index

| Document | Audience | Location |
|----------|---------|---------|
| Architecture Diagrams | Engineering, COO | [`docs/architecture.md`](docs/architecture.md) |
| Case Manager Guide | Case Managers | [`docs/for-case-managers.md`](docs/for-case-managers.md) |
| Executive Summary | COO, Finance | [`docs/for-coo.md`](docs/for-coo.md) |
| Ethos Pulse README | Analytics team | [`ethos-pulse/README.md`](ethos-pulse/README.md) |

---

## Quick Start

### Prerequisites
- Docker + Docker Compose (for the agent server + Postgres)
- Node.js 18+ (for both frontends)
- Python 3.9+ (for Ethos Pulse pipeline)

### Run the Discharge Agent
```bash
# Start Postgres + API server
docker compose up -d

# Start the web dashboard
cd web && npm install && npm run dev
# → http://localhost:5174
```

### Run Ethos Pulse Analytics
```bash
cd ethos-pulse

# 1. Run the data pipeline
cd pipeline && python run.py

# 2. Start the API
cd ../api && uvicorn main:app --port 8080 --reload

# 3. Start the dashboard
cd ../frontend && npm install && npm run dev
# → http://localhost:5173
```

---

## Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| M2B Pilot (80 patients) | ✅ Live | Rules engine, task automation, SNF/PCP matching |
| Ethos Pulse analytics | ✅ Built | Delay metrics, cost impact, savings scenarios |
| Transportation automation | 🟡 Next | Post-discharge-order transport task + insurance auth |
| Post-discharge follow-up | 🟡 Next | 24/7/30-day automated call schedule + TCM billing |
| Epic EHR read-only integration | 🔵 Planned | Replace ADT simulator with live Epic FHIR feed |
| Full hospital rollout (800 pts) | 🔵 Planned | Scale from 10% → 100% coverage |
| AI-to-AI communication layer | 🔵 Planned | Automated SNF facility outreach system |
