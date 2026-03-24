"""
export.py — Serialize pipeline outputs to JSON files consumed by the API.
"""
import os
import json
from datetime import datetime

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "../api/data")


def _dump(data, filename: str):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    path = os.path.join(OUTPUT_DIR, filename)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str)
    print(f"[export] Wrote {filename} ({os.path.getsize(path):,} bytes)")


def export_all(
    summary: dict,
    patients: list,
    delay_dept: list,
    pcp_gaps: list,
    cost_impact: dict,
    complexity: list = None,
    snf_patterns: dict = None,
):
    _dump(summary, "summary.json")
    _dump(patients, "patients.json")
    _dump(delay_dept, "delay_by_department.json")
    _dump(pcp_gaps, "pcp_gaps.json")
    _dump(cost_impact, "cost_impact.json")
    if complexity is not None:
        _dump(complexity, "complexity_scores.json")
    if snf_patterns is not None:
        _dump(snf_patterns, "snf_patterns.json")
    _dump({"generated_at": datetime.utcnow().isoformat() + "Z"}, "meta.json")
    print("[export] All outputs written successfully.")
