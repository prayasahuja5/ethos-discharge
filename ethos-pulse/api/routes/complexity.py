from fastapi import APIRouter
from data_loader import get_complexity_scores

router = APIRouter()


@router.get("/complexity")
def complexity():
    """Per-patient complexity scores with priority tiers and score components."""
    data = get_complexity_scores()
    high = [p for p in data if p["priority"] == "HIGH"]
    return {
        "total_patients": len(data),
        "high_priority_count": len(high),
        "high_priority_patients": high,
        "all_patients": data,
    }
