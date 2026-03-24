"""
data_loader.py — Loads and caches the pipeline JSON outputs.
"""
import os
import json
from functools import lru_cache

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")


def _load(filename: str):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Pipeline output not found: {path}\n"
            "Please run:  cd pipeline && python run.py"
        )
    with open(path) as f:
        return json.load(f)


@lru_cache(maxsize=None)
def get_summary():
    return _load("summary.json")


@lru_cache(maxsize=None)
def get_patients():
    return _load("patients.json")


@lru_cache(maxsize=None)
def get_delay_by_department():
    return _load("delay_by_department.json")


@lru_cache(maxsize=None)
def get_pcp_gaps():
    return _load("pcp_gaps.json")


@lru_cache(maxsize=None)
def get_cost_impact():
    return _load("cost_impact.json")


@lru_cache(maxsize=None)
def get_complexity_scores():
    return _load("complexity_scores.json")


@lru_cache(maxsize=None)
def get_snf_patterns():
    return _load("snf_patterns.json")


def reload_all():
    """Invalidate cache and reload from disk (called after pipeline re-run)."""
    get_summary.cache_clear()
    get_patients.cache_clear()
    get_delay_by_department.cache_clear()
    get_pcp_gaps.cache_clear()
    get_cost_impact.cache_clear()
    get_complexity_scores.cache_clear()
    get_snf_patterns.cache_clear()
