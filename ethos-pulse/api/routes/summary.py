from fastapi import APIRouter
from data_loader import get_summary

router = APIRouter()

@router.get("/summary")
def summary():
    return get_summary()
