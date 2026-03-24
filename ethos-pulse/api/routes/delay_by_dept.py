from fastapi import APIRouter, Query
from typing import Optional
from data_loader import get_delay_by_department

router = APIRouter()

@router.get("/delay-by-department")
def delay_by_department(source: Optional[str] = Query(None, description="Filter by source: 'delay_category' or 'service_line'")):
    data = get_delay_by_department()
    if source:
        data = [d for d in data if d.get("source") == source]
    return {"total": len(data), "departments": data}
