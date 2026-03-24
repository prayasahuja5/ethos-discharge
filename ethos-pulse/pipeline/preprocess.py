"""
preprocess.py — Clean and normalize the merged DataFrame.
- Parse mixed date/timestamp formats
- Fill missing flags
- Detect duplicate EHR entries (same Patient_ID entered by multiple staff)
- Compute discharge_execution_delay_hours
"""
import re
import pandas as pd
import numpy as np


# ── Date parsing helpers ────────────────────────────────────────────────────

_DATE_FORMATS = [
    "%m/%d/%Y %H:%M %Z",
    "%m/%d/%Y %H:%M",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d",
    "%m/%d/%Y",
]


def _try_parse_date(val) -> pd.Timestamp | None:
    """Attempt to parse a single value to a Timestamp using multiple formats."""
    if pd.isna(val) or val is None:
        return None
    if isinstance(val, (pd.Timestamp,)):
        return val
    if hasattr(val, "year"):  # datetime / date object
        return pd.Timestamp(val)
    s = str(val).strip()
    # Remove timezone like "PST", "PST", etc.
    s = re.sub(r"\s+(PST|PDT|MST|EST|CST|UTC)$", "", s, flags=re.IGNORECASE)
    for fmt in _DATE_FORMATS:
        try:
            return pd.Timestamp(pd.to_datetime(s, format=fmt))
        except Exception:
            pass
    try:
        return pd.Timestamp(pd.to_datetime(s, infer_datetime_format=True))
    except Exception:
        return None


def _parse_col(series: pd.Series) -> pd.Series:
    return series.apply(_try_parse_date)


# ── Main preprocessing ──────────────────────────────────────────────────────

def preprocess(df: pd.DataFrame) -> pd.DataFrame:
    print("[preprocess] Starting preprocessing...")
    df = df.copy()

    # ── 1. Parse key date columns ────────────────────────────────────────────
    date_cols = {
        "Discharge_Order_Time": "discharge_order_ts",
        "Actual_Discharge_Date": "actual_discharge_ts",
        "Expected_Discharge_Date": "expected_discharge_ts",
        "ED_Check_In_Time": "ed_check_in_ts",
        "Admit_Order_Time": "admit_order_ts",
    }
    for raw_col, new_col in date_cols.items():
        if raw_col in df.columns:
            df[new_col] = _parse_col(df[raw_col])
        else:
            df[new_col] = pd.NaT

    # ── 2. Compute discharge execution delay ─────────────────────────────────
    # Prefer the pre-computed Discharge_Delay_Hours if present & valid
    if "Discharge_Delay_Hours" in df.columns:
        df["delay_hours_raw"] = pd.to_numeric(df["Discharge_Delay_Hours"], errors="coerce")
    else:
        df["delay_hours_raw"] = np.nan

    # Always recompute from timestamps where both are available
    computed = (df["actual_discharge_ts"] - df["discharge_order_ts"]).dt.total_seconds() / 3600
    df["discharge_execution_delay_hours"] = computed

    # Fill gaps using the raw pre-computed column
    mask_missing = df["discharge_execution_delay_hours"].isna()
    df.loc[mask_missing, "discharge_execution_delay_hours"] = df.loc[mask_missing, "delay_hours_raw"]

    # Clamp negatives (data entry errors) to 0
    df["discharge_execution_delay_hours"] = df["discharge_execution_delay_hours"].clip(lower=0)

    # ── 3. Normalize flag columns ─────────────────────────────────────────────
    def yn_to_bool(series: pd.Series) -> pd.Series:
        s = series.astype(str).str.strip().str.upper()
        return s.map({"Y": True, "YES": True, "N": False, "NO": False}).fillna(False)

    flag_cols = [
        ("PCP", "pcp_assigned"),
        ("SNF_Placement_Requested_Flag", "snf_requested"),
        ("Case_Management_Involved_Flag", "case_mgmt_involved"),
        ("Meds_to_Beds_Opt_In (Y/N)", "meds_to_beds"),
        ("Government_Plan_Flag (Y/N)", "govt_plan"),
        ("Readmission_Within_30_Days (Y/N)", "readmission_30d"),
    ]
    for raw, clean in flag_cols:
        if raw in df.columns:
            df[clean] = yn_to_bool(df[raw])
        else:
            df[clean] = False

    # ── 4. Normalize categorical columns ─────────────────────────────────────
    str_cols = [
        "Insurance_Category", "Insurance_Payer", "Delay_Category",
        "Admitting_Service_Line", "Final_Inpatient_Unit (final discharge unit)",
        "Discharge_Disposition_Type\n", "Primary_Diagnosis_or_Visit_Reason",
    ]
    col_map = {
        "Final_Inpatient_Unit (final discharge unit)": "final_unit",
        "Discharge_Disposition_Type\n": "discharge_disposition",
        "Admitting_Service_Line\n": "admitting_service_line",
    }
    for col in str_cols:
        if col in df.columns:
            clean_name = col_map.get(col, col)
            df[clean_name] = df[col].astype(str).str.strip().replace(
                {"nan": None, "None": None, "": None}
            )

    # Keep Admitting_Service_Line normalized
    if "Admitting_Service_Line" in df.columns:
        df["Admitting_Service_Line"] = df["Admitting_Service_Line"].astype(str).str.strip()

    # ── 5. Parse pharmacy meds-to-beds timestamps ────────────────────────────
    pharmacy_ts_cols = [
        "ph_med_ordered_ts",
        "ph_order_transmitted_ts",
        "ph_verification_ts",
        "ph_med_filled_ts",
        "ph_med_ready_ts",
        "ph_med_received_ts",
    ]
    for col in pharmacy_ts_cols:
        if col in df.columns:
            df[col] = pd.to_datetime(_parse_col(df[col]), errors="coerce")

    # Compute meds-to-beds cycle time: ordered → received (minutes)
    if "ph_med_ordered_ts" in df.columns and "ph_med_received_ts" in df.columns:
        df["meds_to_beds_minutes"] = (
            (df["ph_med_received_ts"] - df["ph_med_ordered_ts"])
            .dt.total_seconds() / 60
        ).clip(lower=0)
    else:
        df["meds_to_beds_minutes"] = np.nan

    # Prior auth flag
    if "ph_prior_auth_required" in df.columns:
        df["ph_prior_auth_required"] = yn_to_bool(df["ph_prior_auth_required"])

    # ── 6. Substance abuse and chronic diagnosis flags ────────────────────────
    # substance_abuse_flag and chronic_diagnosis_count come from ingest (diagnosis sheet)
    if "substance_abuse_flag" not in df.columns:
        df["substance_abuse_flag"] = False
    if "chronic_diagnosis_count" not in df.columns:
        df["chronic_diagnosis_count"] = 0

    # ── 7. Detect duplicate EHR entries ──────────────────────────────────────
    # Flag rows where the same Patient_ID appears more than once
    id_counts = df["Patient_ID"].value_counts()
    df["is_duplicate_ehr_entry"] = df["Patient_ID"].map(id_counts) > 1

    # ── 8. Drop rows with no usable delay data ────────────────────────────────
    df_valid = df[df["discharge_execution_delay_hours"].notna()].copy()
    df_invalid = df[df["discharge_execution_delay_hours"].isna()].copy()
    print(
        f"[preprocess] {len(df_valid)} rows with valid delay data, "
        f"{len(df_invalid)} rows skipped (no timestamps or delay hours)."
    )
    if df["is_duplicate_ehr_entry"].any():
        dup_ids = df[df["is_duplicate_ehr_entry"]]["Patient_ID"].nunique()
        print(f"[preprocess] {dup_ids} patients have duplicate EHR entries.")
    ph_matched = df_valid["meds_to_beds_minutes"].notna().sum()
    print(f"[preprocess] {ph_matched} patients with pharmacy meds-to-beds timing data.")

    return df_valid
