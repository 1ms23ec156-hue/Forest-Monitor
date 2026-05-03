"""FastAPI service exposing the Neo4j Graph RAG agent for VanRakshak.

Run:
    uvicorn app:app --host 0.0.0.0 --port 8000

The Node server in server.js proxies its /api/agent/ask, /api/graph/seed,
/api/graph/verify, /api/graph/status, and detection-save calls to this
service so the dashboard keeps using one base URL.
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Load env from project root (../.env) first, then python_agent/.env if present
# (the local file overrides). One source of truth lives at the project root.
_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE.parent / ".env")
load_dotenv(_HERE / ".env", override=True)

from agent import agent_status, ask_forest_agent  # noqa: E402
from graph_db import (  # noqa: E402
    close_driver,
    graph_status,
    save_detection,
    seed_graph,
    verify_graph,
)


app = FastAPI(title="VanRakshak Graph Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AskRequest(BaseModel):
    question: str


class DetectionRequest(BaseModel):
    id: str | int
    nodeId: str
    zoneId: str
    timestamp: str
    source: str
    category: str
    confidence: str
    threat: str | None = None
    raw: str | None = ""


@app.get("/")
def root() -> dict:
    return {
        "service": "vanrakshak-python-agent",
        "ok": True,
        "hint": "API-only service. Open the dashboard at http://localhost:3000/dashboard",
        "endpoints": [
            "GET  /health",
            "GET  /status",
            "GET  /graph/status",
            "GET  /graph/verify",
            "POST /graph/seed",
            "POST /graph/detection",
            "POST /agent/ask",
        ],
    }


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "vanrakshak-python-agent"}


@app.get("/status")
def status() -> dict:
    return agent_status()


@app.get("/graph/status")
def graph_status_route() -> dict:
    return graph_status()


@app.get("/graph/verify")
def graph_verify_route() -> dict:
    try:
        return verify_graph()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/graph/seed")
def graph_seed_route() -> dict:
    try:
        return {"success": True, **seed_graph()}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/graph/detection")
def graph_save_detection(detection: DetectionRequest) -> dict:
    try:
        save_detection(detection.model_dump())
        return {"success": True}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/agent/ask")
def agent_ask(req: AskRequest) -> dict:
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Missing question")
    return ask_forest_agent(req.question)


@app.on_event("shutdown")
def shutdown() -> None:
    close_driver()


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("AGENT_PORT", "8000"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
