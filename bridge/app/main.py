"""Local hardware bridge for the Lab Manager app.

Runs on the lab PC. The React frontend calls it on localhost to reach
hardware the browser cannot touch directly: the USB balance and the
Brother label printer. Keep this service small and dependency-light.

Run:  poetry run uvicorn app.main:app --port 8200 --reload
"""

import os

import serial
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

from app import balance, printer  # noqa: E402 — must import after load_dotenv() populates os.environ

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

app = FastAPI(title="Lab Manager Hardware Bridge", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    """Liveness check — the frontend uses this to detect the bridge."""
    return {"status": "ok"}


@app.get("/balance/read")
def read_balance():
    """Return the current weight from the USB balance."""
    try:
        return balance.read_weight()
    except serial.SerialException as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@app.post("/balance/tare")
def tare_balance():
    """Zero the USB balance."""
    try:
        return balance.tare()
    except serial.SerialException as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


class PrintLabelRequest(BaseModel):
    template: int
    fields: dict[str, str]
    copies: int = 1


@app.post("/print/label")
def print_label(req: PrintLabelRequest):
    """Print a label from a template already transferred onto the printer."""
    try:
        return printer.print_label(req.template, req.fields, req.copies)
    except OSError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@app.get("/print/status")
def print_status():
    """Return the printer's current media, battery, and error status."""
    try:
        return printer.get_status()
    except OSError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
