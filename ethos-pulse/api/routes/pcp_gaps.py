from fastapi import APIRouter
from data_loader import get_pcp_gaps

router = APIRouter()

@router.get("/pcp-gaps")
def pcp_gaps():
    data = get_pcp_gaps()
    return {"total": len(data), "patients": data}
