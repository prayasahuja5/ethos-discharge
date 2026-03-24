# Ethos Pulse — Hospital Discharge Analytics Platform

> **A data pipeline + REST API + React dashboard** that turns raw hospital discharge Excel records into actionable operational intelligence for the Ethos team.

---

## What It Does

Ethos Pulse ingests a pilot hospital discharge dataset (≈7% of monthly discharges) and surfaces:

| Metric | Value (Pilot Cohort) |
|--------|---------------------|
| Total Discharge Delay Hours | **332.9 h** |
| Operational Delay Cost | **$44,937** |
| Extrapolated Monthly Cost | **$641,964** |
| Patients Missing PCP | **33 / 57** |
| Duplicate EHR Entries Detected | **2** |

### Key Calculations
- **Discharge Execution Delay** = `Actual_Discharge_Date − Discharge_Order_Time` (hours)
- **Operational Delay Cost** = `delay_hours × $135/hr`
- **Extrapolated Cost** = `pilot_cost ÷ 0.07` (7% → 100% of hospital population)
- **Savings Scenarios**: Cost recovered at 25% / 50% / 75% operational improvement

---

## Architecture

```
Excel File
    │
    ▼
pipeline/ingest.py        ← loads PATIENT DATA-FINANCIALS sheet (~65 rows)
    │
    ▼
pipeline/preprocess.py    ← cleans timestamps, normalises flags, detects duplicate EHR entries
    │
    ▼
pipeline/metrics.py       ← computes delay hours, cost, department groupings, PCP gaps
    │
    ▼
pipeline/export.py        ← writes JSON to api/data/*.json
    │
    ▼
api/main.py (FastAPI)     ← serves 5 endpoints on :8080
    │
    ├── GET /summary
    ├── GET /patients
    ├── GET /delay-by-department
    ├── GET /pcp-gaps
    └── GET /cost-impact
         │
         ▼
frontend (React + Vite)   ← polls API every 30s, renders on :5173
    │
    ├── Overview tab       → Summary cards + bar chart + savings preview
    ├── Delay Analysis tab → Full department delay chart
    ├── Patients tab       → Sortable, filterable per-patient table
    ├── Savings Model tab  → 25 / 50 / 75% recovery scenarios
    └── Flagged tab        → PCP gaps · SNF flags · 30-day readmissions
```

---

## Directory Structure

```
ethos-pulse/
├── data/
│   └── raw/
│       ├── Data Entry Master Log.xlsx     ← source data (do not edit)
│       └── Transcript.txt
├── pipeline/
│   ├── ingest.py           ← Excel → DataFrames
│   ├── preprocess.py       ← cleaning, dedup, delay computation
│   ├── metrics.py          ← business metrics
│   ├── export.py           ← → api/data/*.json
│   ├── run.py              ← orchestrator (re-runnable)
│   └── requirements.txt
├── api/
│   ├── main.py             ← FastAPI app + CORS
│   ├── data_loader.py      ← loads JSON files into memory
│   ├── data/               ← pipeline outputs (auto-generated)
│   ├── routes/
│   │   ├── summary.py
│   │   ├── patients.py
│   │   ├── delay_by_dept.py
│   │   ├── pcp_gaps.py
│   │   └── cost_impact.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx              ← main layout, tabs, 30s polling
│   │   ├── api.js               ← API client
│   │   ├── styles.css           ← design system (dark mode)
│   │   └── components/
│   │       ├── SummaryCards.jsx
│   │       ├── DelayByDeptChart.jsx
│   │       ├── PatientTable.jsx
│   │       ├── SavingsToggle.jsx
│   │       └── FlagView.jsx
│   └── package.json
├── .env                    ← configuration (cost rate, pilot fraction, paths)
└── README.md
```

---

## Quick Start

### Prerequisites
- Python 3.9+ with pip
- Node.js 18+

### 1. Configure environment
```bash
# .env is pre-configured; edit if needed
cat .env
```

### 2. Install pipeline dependencies
```bash
cd pipeline
pip install -r requirements.txt
```

### 3. Run the pipeline
```bash
python run.py
# Outputs JSON files to ../api/data/
```
> Re-run this command whenever a new Excel file is dropped into `data/raw/`.

### 4. Start the API
```bash
cd ../api
pip install -r requirements.txt
uvicorn main:app --port 8080 --reload
```
API docs available at: http://localhost:8080/docs

### 5. Start the frontend
```bash
cd ../frontend
npm install
npm run dev
# Open http://localhost:5173
```

---

## API Reference

| Endpoint | Description |
|----------|-------------|
| `GET /summary` | Overall stats: delay hours, cost, extrapolated cost, patient count |
| `GET /patients` | Per-patient list with delay breakdown, flags, insurance |
| `GET /delay-by-department` | Delay hours grouped by insurance type, discharge disposition, unit |
| `GET /pcp-gaps` | Patients without PCP assigned |
| `GET /cost-impact` | Cost breakdown with 25/50/75% savings scenarios |
| `POST /reload` | Clear API cache after re-running pipeline |

---

## Environment Variables (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `EXCEL_PATH` | `data/raw/Data Entry Master Log.xlsx` | Path to source Excel file |
| `COST_PER_HOUR` | `135` | Operational delay cost rate (USD/hr) |
| `PILOT_FRACTION` | `0.07` | Fraction of total monthly discharges in pilot dataset |
| `VITE_API_URL` | `http://localhost:8080` | API base URL for frontend |

---

## Re-running with New Data

1. Drop new Excel file into `data/raw/` (same column format)
2. Update `EXCEL_PATH` in `.env` if the filename changed
3. Run `cd pipeline && python run.py`
4. Restart the API or call `POST /reload`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Data Pipeline | Python 3.12, pandas, openpyxl |
| API | FastAPI, uvicorn |
| Frontend | React 18, Vite, Recharts |
| Data Format | JSON (pipeline → API → frontend) |
| Config | python-dotenv |
