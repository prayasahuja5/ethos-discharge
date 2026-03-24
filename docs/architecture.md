# Ethos Platform — Architecture & Flow Documentation

> **Audience**: COO, Case Managers, Engineering Team (Mohammed)
> **Program**: Meds-to-Beds (M2B) at Saint John's Regional Medical Center
> **Version**: March 2026 — Pilot Phase

---

## Context

The **Ethos platform** addresses a single, measurable problem: **nonmedical discharge delays** that waste bed capacity and inflate costs.

| Metric | Value |
|--------|-------|
| Total monthly discharges | **800** |
| Currently in M2B program | **80 (10%)** |
| Average nonmedical delay | **4.4 hours/patient** |
| Cost per delay hour (CA) | **$135** |
| Monthly waste (80 patients) | **$48,000** |
| Annual waste (extrapolated) | **$600,000+** |
| Patients lacking PCP | **80%** |
| SNF placement avg wait | **28 hours** |
| Pharmacy visibility gap | **45–90 min** |

**Month 1 result**: Delay reduced from **4.4h → 3.0h** (1.5h improvement per patient)

---

## Diagram 1 — System / Agentic Architecture

> For: Mohammed (API planning) + Engineering team

```mermaid
flowchart TB
    subgraph EHR["🏥 Epic EHR (Read-Only Integration)"]
        ADT["ADT / FHIR Events\n• ADT-A01: Admit\n• ADT-A03: Discharge\n• ADT-A08: Update"]
        EHR_DATA["Patient Record\n• Demographics\n• Diagnosis codes\n• Insurance type\n• Expected LOS\n• Discharge order time"]
    end

    subgraph ETHOS_ENGINE["⚙️ Ethos Rules Engine (Node.js)"]
        MSG_PROCESSOR["ADT Message Processor\nExtract patient + discharge context"]
        COMPLEXITY["Complexity Scorer\n• Diagnosis group match\n• Insurance type\n• PCP on file\n• Readmission within 30d\n• Comorbidities"]
        RULES["Rules Engine\nAuto-generate task checklist"]
        RESOURCE["Resource Matcher\nSNF options + PCP clinic matches\ngeo-radius + insurance filter"]
        CASE_MGR["Case Manager Assigner\nLoad-balanced by floor + priority"]
    end

    subgraph ETHOS_DB["🗃️ Ethos Database (PostgreSQL)"]
        PATIENTS["patients\nid, epic_patient_id\ninsurance_type, floor\ncomplexity_score\ndischarge_order_placed_at\nmeds_prescribed"]
        TASKS["tasks\ntask_type, status\norigin: auto or manual\nmetadata: SNF options, timing"]
        EVENTS["patient_events\nAll ADT messages logged\nFull audit trail"]
        SNF_METRICS["snf_response_metrics\nAvg response time by\nSNF x insurance x diagnosis\nlearning loop"]
    end

    subgraph TASK_TYPES["📋 Auto-Generated Task Types"]
        T1["SNF_REFERRAL\nGeo-radius match\nBed availability\nEscalate at 30 min"]
        T2["PCP_PLACEMENT\nInsurance-matched clinic\nLanguage preference\nReferral draft auto-generated"]
        T3["PHARMACY_COORDINATION\nFace sheet auto-sent\nDischarge window calculated\nMeds-to-Beds trigger"]
        T4["TRANSPORTATION\nDisposition-based routing\nInsurance auth verification"]
        T5["POST_DISCHARGE_FOLLOW_UP\n24h / 7d / 30d call schedule\nTCM billing trigger"]
    end

    subgraph DASHBOARDS["💻 Ethos Dashboards"]
        AGENT_UI["Discharge Agent Dashboard\nCase Manager Tool\n• Patient task board\n• SNF / PCP recommendations\n• Status updates\n• Pharmacy readiness"]
        PULSE_UI["Ethos Pulse Analytics\nExecutive / COO Layer\n• Delay hours and cost impact\n• Extrapolated monthly savings\n• Bottleneck flags\n• M2B ROI scenarios"]
    end

    EHR_DATA --> ADT
    ADT -->|"POST /api/adt"| MSG_PROCESSOR
    MSG_PROCESSOR --> COMPLEXITY
    COMPLEXITY --> RULES
    RULES --> TASK_TYPES
    RULES --> CASE_MGR
    MSG_PROCESSOR --> RESOURCE
    RESOURCE --> ETHOS_DB
    TASK_TYPES --> TASKS
    MSG_PROCESSOR --> PATIENTS
    MSG_PROCESSOR --> EVENTS
    PATIENTS & TASKS --> AGENT_UI
    AGENT_UI -->|"SNF response logged"| SNF_METRICS
    SNF_METRICS -->|"Improves future ranking"| RESOURCE

    subgraph PULSE_PIPELINE["📊 Ethos Pulse Pipeline (Python)"]
        EXCEL["Excel Pilot Export\nMonthly cohort data"]
        INGEST["ingest.py — Load financial + meds sheet"]
        PREPROCESS["preprocess.py — Clean timestamps, detect dups"]
        METRICS_PY["metrics.py — Delay hrs, cost, extrapolation"]
        JSON_OUT["JSON outputs to api/data/"]
        EXCEL --> INGEST --> PREPROCESS --> METRICS_PY --> JSON_OUT
    end
    JSON_OUT --> PULSE_UI
```

---

## Diagram 2 — Clinical Patient Journey (M2B Flow)

> For: COO + Case Managers — shows where Ethos adds value at every step

```mermaid
flowchart LR
    subgraph ADMIT["Day 0: Admission"]
        A1["Patient Arrives\nED or Scheduled"]
        A2["Epic ADT-A01 Fired"]
        A3["Ethos: Patient created\nChecklist built\nCase manager assigned"]
        A1 --> A2 --> A3
    end

    subgraph STAY["Days 1-N: Inpatient Stay"]
        S1["Case Manager Reviews\nEthos Task Board"]
        S2["SNF_REFERRAL auto-created\nTop 3 facilities ranked\nReferral sent automatically\n30-min escalation if no response"]
        S3["PCP_PLACEMENT auto-created\nInsurance-matched clinics\nLanguage preference matched"]
        S1 --> S2
        S1 --> S3
    end

    subgraph DISCHARGE_ORDER["Discharge Day: Order Placed"]
        D1["Doctor Signs Discharge Order\nHistorically 12 PM"]
        D2["Epic ADT update — Ethos notified"]
        D3["PHARMACY_COORDINATION triggered\nFace sheet auto-sent to pharmacy\nNo more 45-90 min fax gap\nDischarge window calculated"]
        D4["TRANSPORTATION task created\nInsurance auth checked\nMode arranged"]
        D1 --> D2 --> D3 & D4
    end

    subgraph MEDS_TO_BEDS["Meds-to-Beds Execution"]
        M1["Pharmacy Receives Auto-Notification"]
        M2["Medications Prepared\nwithin discharge window"]
        M3["Meds Delivered to Bedside\nbefore patient leaves"]
        M4["Task marked complete"]
        M1 --> M2 --> M3 --> M4
    end

    subgraph ACTUAL_DISCHARGE["Actual Discharge"]
        X1["All Tasks Green\nTransport ready\nMeds delivered\nSNF confirmed or PCP scheduled"]
        X2["Patient Discharged\nTarget: under 2hr after order"]
        X1 --> X2
    end

    subgraph FOLLOWUP["Post-Discharge — Ethos Owned"]
        F1["Follow-up auto-scheduled"]
        F2["24-hr check-in call"]
        F3["7-day check-in call"]
        F4["30-day readmission prevention"]
        F5["TCM Billing Triggered\n$1,400+ per eligible patient"]
        F1 --> F2 --> F3 --> F4
        F3 --> F5
    end

    ADMIT --> STAY --> DISCHARGE_ORDER --> MEDS_TO_BEDS --> ACTUAL_DISCHARGE --> FOLLOWUP
```

---

## Diagram 3 — Information Architecture

> For: Mohammed — where does each piece of data live?

```mermaid
flowchart TB
    subgraph EPIC["Epic EHR — Source of Truth — Read Only"]
        E1["Patient Demographics"]
        E2["Diagnosis Codes ICD-10"]
        E3["Insurance / Payer"]
        E4["Admission Source"]
        E5["Expected LOS"]
        E6["Discharge Order Timestamp"]
        E7["Current Floor / Unit"]
    end

    subgraph ETHOS_OWNED["Ethos Database — Operational"]
        P1["Complexity Score — computed"]
        P2["Is High Priority — computed"]
        P3["Assigned Case Manager"]
        P4["Anticipated Disposition"]
        P5["Meds Prescribed Flag"]
        T1["Task Type and Status"]
        T2["Task Metadata — SNF options, timing"]
        L1["SNF Response Metrics — learning loop"]
        L2["Placement Attempts Log"]
        L3["Patient Events Audit Log"]
    end

    subgraph ETHOS_PULSE["Ethos Pulse — Analytics Layer"]
        AP1["Actual Discharge Timestamp"]
        AP2["Discharge Execution Delay — computed"]
        AP3["Delay Cost — delay hrs x $135"]
        AP4["Extrapolated Monthly Cost"]
        AP5["Insurance / Department Groupings"]
    end

    EPIC -->|"ADT/FHIR event — read only"| ETHOS_OWNED
    EPIC -->|"Monthly Excel export"| ETHOS_PULSE
    ETHOS_OWNED -->|"Task completion data"| ETHOS_PULSE
```

---

## Data Ownership Table

| Data Field | Lives In | Updated By | Used For |
|-----------|----------|-----------|---------|
| Patient demographics | Epic (primary) | Hospital staff | Patient identification |
| Diagnosis codes | Epic (primary) | Physicians | Task generation, SNF matching |
| Insurance type | Epic (primary) | Admissions | SNF + PCP filtering |
| Discharge order time | Epic (primary) | Attending MD | Delay calculation |
| Complexity score | Ethos DB | Rules engine (auto) | Priority routing |
| Task list | Ethos DB | Rules engine (auto) | Case manager workflow |
| SNF referral outcome | Ethos DB | Case manager | Learning loop |
| Avg SNF response time | Ethos DB | Learning loop | Future ranking |
| Actual discharge time | Excel export (pilot) | Hospital system | Delay cost calculation |
| Delay hours | Ethos Pulse (computed) | Pipeline | ROI reporting |

---

## The Five Automation Targets

| # | Target | Current State | Ethos Solution | Status |
|---|--------|--------------|---------------|--------|
| 1 | **SNF Bed Confirmation** | Manual calls, avg 28hr wait | Geo-radius match + auto referral + 30-min escalation | ✅ Prototype |
| 2 | **Disposition ID from EHR** | Case manager reads notes | Auto-detect from diagnosis codes | ✅ Prototype |
| 3 | **Transportation** | Manual phone calls | Task auto-created post-discharge-order | 🟡 Scaffolded |
| 4 | **Post-Discharge Follow-up** | Ad-hoc, inconsistent | 24/7/30-day call schedule, TCM billing trigger | 🟡 Scaffolded |
| 5 | **Medication Delivery Tracking** | 45–90min fax gap | Face sheet auto-sent on discharge order event | ✅ Prototype |

---

## Bottleneck → Automation Map

| Bottleneck | Ethos Solution |
|-----------|---------------|
| Manual nurse input (inconsistent) | Standardized checklist built at admit |
| No ownership structure | Auto case manager assignment by floor + priority |
| SNF avg 28-hour wait | Ranked referrals + 30-min escalation loop |
| 45–90 min pharmacy fax gap | Auto face sheet sent on discharge order event |
| Doctor rounds 8AM / signs 12PM | Discharge window pre-calculated and surfaced |
| Post-discharge patient loss | Automated 24/7/30-day follow-up schedule |
| 80% patients lack PCP | PCP task auto-created, insurance-matched |
