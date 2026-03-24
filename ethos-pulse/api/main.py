"""
main.py — FastAPI application for Ethos Pulse.
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../.env"))

from routes.summary import router as summary_router
from routes.patients import router as patients_router
from routes.delay_by_dept import router as delay_dept_router
from routes.pcp_gaps import router as pcp_gaps_router
from routes.cost_impact import router as cost_impact_router
from routes.complexity import router as complexity_router
from routes.snf_patterns import router as snf_patterns_router

app = FastAPI(
    title="Ethos Pulse API",
    description="Hospital discharge analytics pipeline API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(summary_router)
app.include_router(patients_router)
app.include_router(delay_dept_router)
app.include_router(pcp_gaps_router)
app.include_router(cost_impact_router)
app.include_router(complexity_router)
app.include_router(snf_patterns_router)


@app.get("/")
def root():
    return {"service": "Ethos Pulse API", "version": "1.0.0", "docs": "/docs"}


@app.post("/reload")
def reload():
    """Re-read pipeline output files (call after running pipeline again)."""
    from data_loader import reload_all
    reload_all()
    return {"status": "cache cleared, data reloaded"}
