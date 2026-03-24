from fastapi import APIRouter
from data_loader import get_snf_patterns

router = APIRouter()


@router.get("/snf-patterns")
def snf_patterns():
    """SNF placement patterns by insurance type — informs facility matching rules."""
    return get_snf_patterns()
