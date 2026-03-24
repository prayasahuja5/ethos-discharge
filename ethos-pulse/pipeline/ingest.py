"""
ingest.py — Load and merge Excel sheets from the pilot dataset.

Sheets loaded:
  Sheet 1  (index 0):  "MRNs <-- Baseline Characteristi" — patient demographics
  Sheet 2:             "Pharmacy Face Sheets"             — meds-to-beds timing (CRITICAL)
  Sheet 3:             "PATIENT DATA- FINANCIALS "        — primary source of truth
  Sheet 4:             "Diagnosis Codes"                  — ICD-10 codes, chronic/substance flags
"""
import os
import pandas as pd
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../.env"))

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_raw_path = os.getenv("EXCEL_PATH", "data/raw/Data Entry Master Log.xlsx")
EXCEL_PATH = _raw_path if os.path.isabs(_raw_path) else os.path.join(_ROOT, _raw_path)


def load_financials_sheet() -> pd.DataFrame:
    """Sheet 3: PATIENT DATA-FINANCIALS — primary source of truth."""
    df = pd.read_excel(
        EXCEL_PATH, sheet_name="PATIENT DATA- FINANCIALS ", engine="openpyxl"
    )
    df.columns = [str(c).strip() for c in df.columns]
    return df


def load_demographics_sheet() -> pd.DataFrame:
    """Sheet 1: Patient demographics (MRN, Age, Gender, Race, etc.)."""
    df = pd.read_excel(EXCEL_PATH, sheet_name=0, engine="openpyxl")
    df.columns = [str(c).strip() for c in df.columns]
    return df


def load_pharmacy_sheet() -> pd.DataFrame:
    """Sheet 2: Pharmacy Face Sheets — meds-to-beds order and pickup timestamps."""
    df = pd.read_excel(
        EXCEL_PATH, sheet_name="Pharmacy Face Sheets", engine="openpyxl"
    )
    df.columns = [str(c).strip() for c in df.columns]
    return df


def load_diagnosis_sheet() -> pd.DataFrame:
    """Sheet 4: Diagnosis Codes — ICD-10 codes per patient with chronic/substance flags."""
    df = pd.read_excel(
        EXCEL_PATH, sheet_name="Diagnosis Codes", engine="openpyxl"
    )
    df.columns = [str(c).strip() for c in df.columns]
    return df


def _build_pharmacy_summary(pharmacy_df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate pharmacy sheet to one row per patient (MRN = Patient_ID).
    Extracts key meds-to-beds timing columns and prior-auth flag.
    """
    ph = pharmacy_df.copy()

    # Rename columns to clean names
    # Column names are stripped in load_pharmacy_sheet(); use stripped keys here
    col_map = {
        "MRN": "Patient_ID",
        "Time discharge medication ordered": "ph_med_ordered_ts",
        "Time order transmitted to the pharmacy": "ph_order_transmitted_ts",
        "Time pharmacist verification completed": "ph_verification_ts",
        "Time medication filled": "ph_med_filled_ts",
        "Time medication ready for pickup": "ph_med_ready_ts",
        "Time medication received by patient": "ph_med_received_ts",
        "Insurance prior authorization required (yes/no)": "ph_prior_auth_required",
        "If delay in medication fill reason (out of stock, verification issues, communication issues etc.)": "ph_delay_reason",
        "Number of perscriptions @ discharge": "ph_rx_count",
    }
    ph.rename(columns={k: v for k, v in col_map.items() if k in ph.columns}, inplace=True)

    # Normalize Patient_ID
    ph["Patient_ID"] = pd.to_numeric(ph["Patient_ID"], errors="coerce")
    ph.dropna(subset=["Patient_ID"], inplace=True)
    ph["Patient_ID"] = ph["Patient_ID"].astype(int)

    # Keep only relevant columns
    keep = ["Patient_ID"] + [v for v in col_map.values() if v != "Patient_ID" and v in ph.columns]
    ph = ph[keep]

    # One row per patient (take first occurrence if duplicates)
    ph = ph.groupby("Patient_ID").first().reset_index()
    return ph


def _build_diagnosis_summary(diagnosis_df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate diagnosis sheet to one row per patient.
    Produces: icd10_codes (list), substance_abuse_flag (bool), chronic_diagnosis_count (int).
    Substance abuse = any code starting with F10–F19.
    """
    dx = diagnosis_df.copy()
    dx.rename(columns={"Patient ID": "Patient_ID"}, inplace=True)
    dx["Patient_ID"] = pd.to_numeric(dx["Patient_ID"], errors="coerce")
    dx.dropna(subset=["Patient_ID"], inplace=True)
    dx["Patient_ID"] = dx["Patient_ID"].astype(int)

    def _parse_codes(raw) -> list:
        """Split comma-separated ICD-10 codes into a clean list."""
        if pd.isna(raw):
            return []
        return [c.strip() for c in str(raw).split(",") if c.strip()]

    rows = []
    for pid, group in dx.groupby("Patient_ID"):
        all_codes = []
        for _, row in group.iterrows():
            all_codes.extend(_parse_codes(row.get("Code", "")))

        substance_abuse = any(
            c[:3] in {f"F{n:02d}" for n in range(10, 20)} for c in all_codes
        )

        # Count codes from the reference "CODES OF RELEVENCE" column as chronic indicators
        # Use the main Code column: chronic if definition mentions chronic conditions
        # Simple heuristic: count unique ICD-10 codes as proxy for comorbidity count
        chronic_count = len(set(all_codes))

        rows.append({
            "Patient_ID": int(pid),
            "icd10_codes": ",".join(sorted(set(all_codes))),
            "substance_abuse_flag": substance_abuse,
            "chronic_diagnosis_count": chronic_count,
        })

    return pd.DataFrame(rows)


def ingest() -> pd.DataFrame:
    """
    Load all 4 data sheets and merge into a single DataFrame keyed on Patient_ID.
    Returns a cleaned DataFrame ready for preprocessing.
    """
    # Sheet 3: Primary source of truth
    print("[ingest] Loading PATIENT DATA-FINANCIALS sheet (primary)...")
    fin = load_financials_sheet()
    fin["Patient_ID"] = pd.to_numeric(fin["Patient_ID"], errors="coerce")
    fin.dropna(subset=["Patient_ID"], inplace=True)
    fin["Patient_ID"] = fin["Patient_ID"].astype(int)
    print(f"[ingest] Financials sheet: {len(fin)} rows")

    # Sheet 1: Demographics (Age, Gender, Race, etc.)
    try:
        print("[ingest] Loading demographics sheet (Sheet 1)...")
        demo = load_demographics_sheet()
        demo_cols = ["Age", "Gender", "Race", "Ethnicity", "Marital Status", "Living Status",
                     "Alcohol Use", "Tobacco Use", "Drug Use"]
        available = [c for c in demo_cols if c in demo.columns]
        if available and "FIN #" in demo.columns:
            demo_sub = demo[["FIN #"] + available].copy()
            demo_sub.rename(columns={"FIN #": "Patient_ID"}, inplace=True)
            demo_sub["Patient_ID"] = pd.to_numeric(demo_sub["Patient_ID"], errors="coerce")
            demo_sub.dropna(subset=["Patient_ID"], inplace=True)
            demo_sub["Patient_ID"] = demo_sub["Patient_ID"].astype(int)
            fin = fin.merge(demo_sub, on="Patient_ID", how="left", suffixes=("", "_demo"))
            print(f"[ingest] Merged demographics ({len(available)} columns)")
    except Exception as e:
        print(f"[ingest] Warning: could not load demographics sheet: {e}")

    # Sheet 2: Pharmacy Face Sheets (meds-to-beds timing)
    try:
        print("[ingest] Loading Pharmacy Face Sheets (Sheet 2)...")
        pharmacy_raw = load_pharmacy_sheet()
        pharmacy_summary = _build_pharmacy_summary(pharmacy_raw)
        fin = fin.merge(pharmacy_summary, on="Patient_ID", how="left")
        matched = fin["ph_med_ordered_ts"].notna().sum() if "ph_med_ordered_ts" in fin.columns else 0
        print(f"[ingest] Merged pharmacy data ({len(pharmacy_summary)} pharmacy records, {matched} matched patients)")
    except Exception as e:
        print(f"[ingest] Warning: could not load pharmacy sheet: {e}")

    # Sheet 4: Diagnosis Codes (ICD-10, substance abuse, chronic flags)
    try:
        print("[ingest] Loading Diagnosis Codes sheet (Sheet 4)...")
        diagnosis_raw = load_diagnosis_sheet()
        diagnosis_summary = _build_diagnosis_summary(diagnosis_raw)
        fin = fin.merge(diagnosis_summary, on="Patient_ID", how="left")
        fin["substance_abuse_flag"] = fin["substance_abuse_flag"].fillna(False)
        fin["chronic_diagnosis_count"] = fin["chronic_diagnosis_count"].fillna(0).astype(int)
        sa_count = fin["substance_abuse_flag"].sum()
        print(f"[ingest] Merged diagnosis data ({len(diagnosis_summary)} patients with codes, {sa_count} substance abuse flags)")
    except Exception as e:
        print(f"[ingest] Warning: could not load diagnosis sheet: {e}")

    print(f"[ingest] Final DataFrame: {len(fin)} rows, {len(fin.columns)} columns")
    return fin


if __name__ == "__main__":
    df = ingest()
    print(df.head(3).to_string())
