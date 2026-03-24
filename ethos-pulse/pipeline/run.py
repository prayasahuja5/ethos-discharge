"""
run.py — Ethos Pulse pipeline orchestrator.
Run this script whenever new Excel data is dropped into data/raw/.

Usage:
    cd ethos-pulse/pipeline
    python run.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from ingest import ingest
from preprocess import preprocess
from metrics import (
    compute_summary,
    compute_patients,
    compute_delay_by_department,
    compute_pcp_gaps,
    compute_cost_impact,
    compute_complexity_scores,
    compute_snf_patterns,
)
from export import export_all


def main():
    print("=" * 60)
    print("  Ethos Pulse — Data Pipeline")
    print("=" * 60)

    print("\n[1/5] Ingesting data...")
    df_raw = ingest()

    print("\n[2/5] Preprocessing...")
    df = preprocess(df_raw)

    print("\n[3/5] Computing metrics...")
    summary = compute_summary(df)
    patients = compute_patients(df)
    delay_dept = compute_delay_by_department(df)
    pcp_gaps = compute_pcp_gaps(df)
    cost_impact = compute_cost_impact(df)
    complexity = compute_complexity_scores(df)
    snf_patterns = compute_snf_patterns(df)

    print("\n[4/5] Exporting to JSON...")
    export_all(summary, patients, delay_dept, pcp_gaps, cost_impact, complexity, snf_patterns)

    print("\n[5/5] Done!")
    print(f"  → Total delay hours      : {summary['total_delay_hours']:,.1f}")
    print(f"  → Total cost             : ${summary['total_cost_usd']:,.0f}")
    print(f"  → Extrapolated cost      : ${summary['extrapolated_cost_usd']:,.0f}")
    print(f"  → Patients               : {summary['patient_count']}")
    print(f"  → Missing PCP            : {summary['patients_missing_pcp']}")
    print(f"  → High-priority patients : {summary['high_priority_patient_count']}")
    print(f"  → Substance abuse flags  : {summary['substance_abuse_patient_count']}")
    print(f"  → Avg complexity score   : {summary['avg_complexity_score']}")
    if summary.get('avg_meds_to_beds_minutes'):
        print(f"  → Avg meds-to-beds       : {summary['avg_meds_to_beds_minutes']:.0f} min")
    print("=" * 60)


if __name__ == "__main__":
    main()
