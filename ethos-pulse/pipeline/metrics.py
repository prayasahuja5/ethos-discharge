"""
metrics.py — Core metrics calculation for Ethos Pulse.
"""
import os
import json
import numpy as np
import pandas as pd
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../.env"))

COST_PER_HOUR = float(os.getenv("COST_PER_HOUR", "135"))
PILOT_FRACTION = float(os.getenv("PILOT_FRACTION", "0.07"))


def _safe(val):
    """Convert numpy types to native Python for JSON serialization."""
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    if isinstance(val, (np.bool_,)):
        return bool(val)
    return val


_SUBSTANCE_ABUSE_PREFIXES = {f"F{n:02d}" for n in range(10, 20)}
_MEDICAID_UNINSURED_LABELS = {"medi-cal", "medicaid", "self-pay", "uninsured", "no insurance"}
_HIGH_PRIORITY_THRESHOLD = 5


def _complexity_score(row) -> tuple[int, dict]:
    """
    Compute complexity score for a single patient row.
    Mirrors scoring.js exactly (parity between Python pipeline and Node rules engine).
    Returns (score, components_dict).
    """
    components = {}
    score = 0

    age = row.get("Age", None)
    if age is not None and not pd.isna(age):
        try:
            if float(age) > 65:
                score += 2
                components["ageGt65"] = True
            else:
                components["ageGt65"] = False
        except (ValueError, TypeError):
            components["ageGt65"] = False
    else:
        components["ageGt65"] = False

    insurance = str(row.get("Insurance_Category", "") or "").strip().lower()
    if insurance in _MEDICAID_UNINSURED_LABELS:
        score += 2
        components["medicaidOrUninsured"] = True
    else:
        components["medicaidOrUninsured"] = False

    if not row.get("pcp_assigned", True):
        score += 3
        components["noPcp"] = True
    else:
        components["noPcp"] = False

    if row.get("readmission_30d", False):
        score += 2
        components["readmissionLt30"] = True
    else:
        components["readmissionLt30"] = False

    chronic_count = int(row.get("chronic_diagnosis_count", 0) or 0)
    score += chronic_count
    components["comorbiditiesCount"] = chronic_count

    if row.get("substance_abuse_flag", False):
        score += 2
        components["substanceAbuse"] = True
    else:
        components["substanceAbuse"] = False

    return score, components


def compute_complexity_scores(df: pd.DataFrame) -> list:
    """Per-patient complexity scores, mirroring server/src/scoring.js formula."""
    rows = []
    for pid, group in df.groupby("Patient_ID"):
        first = group.iloc[0]
        score, components = _complexity_score(first)
        priority = "HIGH" if score >= _HIGH_PRIORITY_THRESHOLD else ("NORMAL" if score >= 2 else "LOW")
        rows.append({
            "patient_id": int(pid),
            "complexity_score": score,
            "priority": priority,
            "score_components": components,
            "insurance_category": str(first.get("Insurance_Category", "") or "").strip() or None,
            "pcp_assigned": bool(first.get("pcp_assigned", False)),
            "substance_abuse_flag": bool(first.get("substance_abuse_flag", False)),
            "readmission_30d": bool(first.get("readmission_30d", False)),
            "icd10_codes": str(first.get("icd10_codes", "") or "").strip() or None,
        })
    rows.sort(key=lambda r: r["complexity_score"], reverse=True)
    return rows


def compute_snf_patterns(df: pd.DataFrame) -> dict:
    """
    SNF placement patterns by insurance — from requirements Step 2.
    Identifies which insurance types most frequently require SNF placement
    and the avg delay associated, to inform facility matching rules.
    """
    if "snf_requested" not in df.columns:
        return {"patterns": [], "total_snf_patients": 0}

    snf_df = df[df["snf_requested"]].copy()
    total_snf = snf_df["Patient_ID"].nunique()

    patterns = []
    if "Insurance_Category" in snf_df.columns and len(snf_df) > 0:
        grp = (
            snf_df.groupby("Insurance_Category")
            .agg(
                patient_count=("Patient_ID", "nunique"),
                avg_delay_hours=("discharge_execution_delay_hours", "mean"),
                total_delay_hours=("discharge_execution_delay_hours", "sum"),
            )
            .reset_index()
        )
        for _, row in grp.iterrows():
            patterns.append({
                "insurance_category": str(row["Insurance_Category"]).strip(),
                "snf_patient_count": int(row["patient_count"]),
                "avg_delay_hours": round(float(row["avg_delay_hours"]), 2),
                "total_delay_hours": round(float(row["total_delay_hours"]), 2),
                "pct_of_snf_patients": round(int(row["patient_count"]) / total_snf * 100, 1) if total_snf > 0 else 0,
            })
        patterns.sort(key=lambda r: r["snf_patient_count"], reverse=True)

    # Disposition breakdown for SNF patients
    disposition_patterns = []
    if "discharge_disposition" in snf_df.columns:
        disp_grp = snf_df.groupby("discharge_disposition")["Patient_ID"].nunique().reset_index()
        for _, row in disp_grp.iterrows():
            disposition_patterns.append({
                "disposition": str(row["discharge_disposition"]).strip(),
                "count": int(row["Patient_ID"]),
            })

    return {
        "total_snf_patients": total_snf,
        "snf_rate_pct": round(total_snf / df["Patient_ID"].nunique() * 100, 1) if len(df) > 0 else 0,
        "patterns": patterns,
        "disposition_breakdown": disposition_patterns,
    }


def compute_summary(df: pd.DataFrame) -> dict:
    """Overall stats."""
    total_delay_hours = df["discharge_execution_delay_hours"].sum()
    total_cost = total_delay_hours * COST_PER_HOUR
    extrapolated_cost = total_cost / PILOT_FRACTION
    extrapolated_delay_hours = total_delay_hours / PILOT_FRACTION
    patient_count = df["Patient_ID"].nunique()
    avg_delay = df.groupby("Patient_ID")["discharge_execution_delay_hours"].sum().mean()
    duplicate_entries = int(df["is_duplicate_ehr_entry"].sum())
    no_pcp = int((~df["pcp_assigned"]).sum())
    snf_flag = int(df["snf_requested"].sum())

    # Complexity distribution
    complexity_rows = compute_complexity_scores(df)
    high_priority = sum(1 for r in complexity_rows if r["priority"] == "HIGH")
    substance_abuse_count = int(df["substance_abuse_flag"].sum()) if "substance_abuse_flag" in df.columns else 0
    avg_complexity = round(
        sum(r["complexity_score"] for r in complexity_rows) / len(complexity_rows), 2
    ) if complexity_rows else 0.0

    # Pharmacy timing
    avg_meds_to_beds = None
    if "meds_to_beds_minutes" in df.columns:
        mtb = df["meds_to_beds_minutes"].dropna()
        avg_meds_to_beds = round(float(mtb.mean()), 1) if len(mtb) > 0 else None

    return {
        "total_delay_hours": round(float(total_delay_hours), 2),
        "total_cost_usd": round(float(total_cost), 2),
        "extrapolated_cost_usd": round(float(extrapolated_cost), 2),
        "extrapolated_delay_hours": round(float(extrapolated_delay_hours), 2),
        "patient_count": _safe(patient_count),
        "avg_delay_hours_per_patient": round(float(avg_delay), 2) if not np.isnan(avg_delay) else 0.0,
        "duplicate_ehr_entries": duplicate_entries,
        "patients_missing_pcp": no_pcp,
        "patients_with_snf_flag": snf_flag,
        "cost_per_hour": COST_PER_HOUR,
        "pilot_fraction_pct": round(PILOT_FRACTION * 100, 1),
        # Complexity
        "avg_complexity_score": avg_complexity,
        "high_priority_patient_count": high_priority,
        "substance_abuse_patient_count": substance_abuse_count,
        # Pharmacy
        "avg_meds_to_beds_minutes": avg_meds_to_beds,
    }


def compute_patients(df: pd.DataFrame) -> list:
    """Per-patient delay breakdown."""
    rows = []
    for pid, group in df.groupby("Patient_ID"):
        delay = group["discharge_execution_delay_hours"].sum()
        first = group.iloc[0]

        def _str(col):
            v = first.get(col, None) if hasattr(first, "get") else None
            if v is None and col in group.columns:
                v = group[col].iloc[0]
            if pd.isna(v) if not isinstance(v, str) else v in (None, "nan", "None"):
                return None
            return str(v).strip() or None

        rows.append({
            "patient_id": int(pid),
            "delay_hours": round(float(delay), 2),
            "delay_cost_usd": round(float(delay * COST_PER_HOUR), 2),
            "delay_category": _str("Delay_Category"),
            "insurance_category": _str("Insurance_Category"),
            "insurance_payer": _str("Insurance_Payer"),
            "admitting_service_line": _str("Admitting_Service_Line"),
            "discharge_disposition": _str("discharge_disposition"),
            "los_days": float(group["Length_of_Stay_Days"].iloc[0])
                if "Length_of_Stay_Days" in group.columns and not pd.isna(group["Length_of_Stay_Days"].iloc[0])
                else None,
            "pcp_assigned": bool(first["pcp_assigned"]),
            "snf_requested": bool(first["snf_requested"]),
            "case_mgmt_involved": bool(first["case_mgmt_involved"]),
            "readmission_30d": bool(first["readmission_30d"]),
            "is_duplicate_ehr_entry": bool(first["is_duplicate_ehr_entry"]),
            "discharge_order_ts": str(first["discharge_order_ts"]) if pd.notna(first["discharge_order_ts"]) else None,
            "actual_discharge_ts": str(first["actual_discharge_ts"]) if pd.notna(first["actual_discharge_ts"]) else None,
        })
    rows.sort(key=lambda r: r["delay_hours"], reverse=True)
    return rows


def compute_delay_by_department(df: pd.DataFrame) -> list:
    """Delay hours grouped by meaningful populated categories."""
    results = []

    def _add_group(col, source_label):
        if col not in df.columns:
            return
        clean = df[col].astype(str).str.strip()
        mask = clean.notna() & ~clean.isin(["nan", "None", ""])
        grp = (
            df[mask]
            .assign(_cat=clean[mask])
            .groupby("_cat")["discharge_execution_delay_hours"]
            .agg(["sum", "count", "mean"])
            .reset_index()
        )
        for _, row in grp.iterrows():
            results.append({
                "department": str(row["_cat"]).strip(),
                "source": source_label,
                "total_delay_hours": round(float(row["sum"]), 2),
                "patient_count": int(row["count"]),
                "avg_delay_hours": round(float(row["mean"]), 2),
            })

    # Use actually-populated columns from the real dataset
    _add_group("Insurance_Category", "insurance")
    _add_group("Discharge_Disposition_Type\n", "discharge_disposition")
    _add_group("discharge_disposition", "discharge_disposition")  # cleaned column
    _add_group("Initial_Inpatient_Unit", "inpatient_unit")

    # De-duplicate: prefer "insurance" labels, remove exact dupes
    seen = set()
    deduped = []
    for r in results:
        key = (r["department"], r["source"])
        if key not in seen:
            seen.add(key)
            deduped.append(r)

    deduped.sort(key=lambda r: r["total_delay_hours"], reverse=True)
    return deduped



def compute_pcp_gaps(df: pd.DataFrame) -> list:
    """Patients without PCP assigned."""
    no_pcp = df[~df["pcp_assigned"]].copy()
    rows = []
    for pid, group in no_pcp.groupby("Patient_ID"):
        first = group.iloc[0]
        delay = group["discharge_execution_delay_hours"].sum()
        rows.append({
            "patient_id": int(pid),
            "delay_hours": round(float(delay), 2),
            "insurance_category": str(first["Insurance_Category"]).strip()
                if "Insurance_Category" in group.columns and pd.notna(first["Insurance_Category"]) else None,
            "admitting_service_line": str(first["Admitting_Service_Line"]).strip()
                if "Admitting_Service_Line" in group.columns and pd.notna(first.get("Admitting_Service_Line")) else None,
            "discharge_disposition": str(first.get("discharge_disposition", "")).strip() or None,
            "snf_requested": bool(first["snf_requested"]),
            "readmission_30d": bool(first["readmission_30d"]),
        })
    rows.sort(key=lambda r: r["delay_hours"], reverse=True)
    return rows


def compute_cost_impact(df: pd.DataFrame) -> dict:
    """Cost breakdown with savings scenarios."""
    total_delay = df["discharge_execution_delay_hours"].sum()
    total_delay_days = total_delay / 24

    baseline_cost = total_delay * COST_PER_HOUR
    extrapolated_baseline = baseline_cost / PILOT_FRACTION

    def scenario(pct):
        saved_hours = total_delay * pct
        saved_cost = saved_hours * COST_PER_HOUR
        extrapolated_saved = saved_cost / PILOT_FRACTION
        return {
            "reduction_pct": int(pct * 100),
            "hours_recovered": round(float(saved_hours), 2),
            "days_recovered": round(float(saved_hours / 24), 2),
            "cost_saved_usd": round(float(saved_cost), 2),
            "extrapolated_cost_saved_usd": round(float(extrapolated_saved), 2),
        }

    return {
        "baseline_delay_hours": round(float(total_delay), 2),
        "baseline_delay_days": round(float(total_delay_days), 2),
        "baseline_cost_usd": round(float(baseline_cost), 2),
        "extrapolated_baseline_usd": round(float(extrapolated_baseline), 2),
        "cost_per_hour": COST_PER_HOUR,
        "scenarios": [scenario(0.25), scenario(0.50), scenario(0.75)],
    }
