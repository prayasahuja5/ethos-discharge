from fastapi import APIRouter
from data_loader import get_cost_impact

router = APIRouter()

@router.get("/cost-impact")
def cost_impact():
    return get_cost_impact()
