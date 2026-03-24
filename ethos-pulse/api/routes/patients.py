from fastapi import APIRouter, Query
from typing import Optional
from data_loader import get_patients

router = APIRouter()

@router.get("/patients")
def patients(
    sort_by: Optional[str] = Query("delay_hours", description="Field to sort by"),
    limit: Optional[int] = Query(None, description="Max patients to return"),
    pcp_missing: Optional[bool] = Query(None, description="Filter to patients missing PCP"),
):
    data = get_patients()
    if pcp_missing is not None:
        data = [p for p in data if not p["pcp_assigned"] == (not pcp_missing)]
    if sort_by and data and sort_by in data[0]:
        reverse = sort_by in ("delay_hours", "delay_cost_usd", "los_days")
        data = sorted(data, key=lambda x: (x.get(sort_by) or 0), reverse=reverse)
    if limit:
        data = data[:limit]
    return {"total": len(data), "patients": data}
