"""Groq-powered Graph RAG agent for the VanRakshak forest graph.

Flow:
    user question
        -> Groq generates a read-only Cypher query (schema-aware)
        -> Neo4j executes
        -> Groq summarizes rows into a ranger answer
        -> return { answer, cypher, records }

Safety:
    - The generated Cypher is rejected if it contains write keywords.
    - All queries are run with READ access mode.
"""

import json
import os
import re
from typing import Any

from groq import Groq

from forest_data import GRAPH_ID
from graph_db import graph_status, run_cypher

GRAPH_SCHEMA = """
Graph schema (Neo4j) — every node has graphId = '%(graph_id)s'.

Nodes:
  (:Zone {id, name, habitat, risk, lat, lng, graphId})
      id values: Z-KABINI, Z-BANDIPUR-CORE, Z-MOYAR, Z-MUDUMALAI,
                 Z-FARM-BUFFER, Z-WATCH-RIDGE, Z-WATERHOLE
  (:ForestNode {id, lat, lng, zone, zoneId, env, device, role, battery,
                status, graphId, lastSeen, lastCategory, lastThreat})
      id values: SENDER-NODE (LoRa TX, ESP32 + Camera + Mic),
                 RECEIVER-NODE (LoRa RX gateway, Raspberry Pi 5)
  (:Animal {name, category, conservationStatus, activity, signs, graphId})
      example names: Bengal Tiger, Asian Elephant, Indian Leopard, Sloth Bear,
                     Gaur, Dhole, Sambar Deer, Chital, Nilgai,
                     Indian Peafowl, Grey Langur, Great Hornbill, Wild Boar
  (:Detection {id, graphId, timestamp (datetime), source, category,
               confidence, threat, raw})
      source values: CAM, AUD, SENS
      threat values: critical, warning, info
      category values include: Bengal Tiger, Asian Elephant, Indian Leopard,
                               Sloth Bear, Gaur, Dhole, Sambar Deer, Chital,
                               Peafowl, Hornbill, Langur, Human, Chainsaw,
                               Gunshot, Logging Vehicle, Fire, Silence Anomaly

Relationships:
  (:ForestNode)-[:LOCATED_IN]->(:Zone)
  (:ForestNode)-[:CONNECTED_TO {network}]->(:ForestNode)   // LoRa mesh
  (:Zone)-[:NEAR]->(:Zone)
  (:Animal)-[:COMMON_IN]->(:Zone)
  (:ForestNode)-[:RECORDED]->(:Detection)
  (:Detection)-[:OBSERVED_IN]->(:Zone)
  (:Detection)-[:DETECTED_ANIMAL]->(:Animal)
""" % {"graph_id": GRAPH_ID}


SYSTEM_CYPHER = (
    "You are a Cypher query generator for the VanRakshak Indian forest "
    "monitoring graph. Use ONLY the schema below. Generate ONE read-only "
    "Cypher query that answers the user's question. Rules:\n"
    "1. Output ONLY the Cypher. No markdown, no comments, no explanations.\n"
    "2. NEVER use CREATE, MERGE, DELETE, SET, REMOVE, DROP, LOAD, CALL db., "
    "apoc., or any write/admin clauses.\n"
    "3. Always filter detections/zones/animals by graphId where reasonable, "
    "or rely on the labels above.\n"
    "4. Always include LIMIT (default LIMIT 10).\n"
    "5. Prefer toString(d.timestamp) when returning timestamps.\n"
    "6. Use case-insensitive matches with toLower() for category/animal "
    "name fuzzy matches when the user does not use the exact label.\n\n"
    + GRAPH_SCHEMA
)

SYSTEM_ANSWER = (
    "You are VanRakshak, a forest ranger intelligence analyst. Use ONLY the "
    "Neo4j rows provided to answer. Be concise, operational, and ranger-"
    "friendly. Mention concrete node IDs (NODE-XX), zones, animal names, and "
    "threat levels from the data. If the rows are empty, say the graph has "
    "no matching evidence and suggest seeding the graph or starting the test "
    "stream. Do not invent facts not in the rows."
)

WRITE_KEYWORDS = re.compile(
    r"\b(create|merge|delete|set|remove|drop|detach|load\s+csv|call\s+db\.|"
    r"call\s+apoc\.|foreach)\b",
    re.IGNORECASE,
)


def groq_configured() -> bool:
    return bool(os.getenv("GROQ_API_KEY"))


def _model() -> str:
    return os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")


def agent_status() -> dict:
    return {
        "framework": "Groq + Neo4j Graph RAG (Python)",
        "model": _model(),
        "llmConfigured": groq_configured(),
        "graph": graph_status(),
    }


_client: Groq | None = None


def _groq() -> Groq:
    global _client
    if _client is None:
        _client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    return _client


def _strip_fences(text: str) -> str:
    """Strip ```cypher fences if the model still emits them."""
    text = text.strip()
    if text.startswith("```"):
        # remove leading fence line
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        if text.endswith("```"):
            text = text[: -3]
    return text.strip().rstrip(";").strip()


def _is_safe_cypher(cypher: str) -> bool:
    if not cypher:
        return False
    if WRITE_KEYWORDS.search(cypher):
        return False
    return True


def generate_cypher(question: str) -> str:
    response = _groq().chat.completions.create(
        model=_model(),
        temperature=0,
        max_tokens=400,
        messages=[
            {"role": "system", "content": SYSTEM_CYPHER},
            {"role": "user", "content": f"Question: {question}\nReturn ONLY the Cypher."},
        ],
    )
    return _strip_fences(response.choices[0].message.content or "")


def synthesize_answer(question: str, cypher: str, rows: list[dict]) -> str:
    context = json.dumps(rows[:30], default=str, indent=2)
    response = _groq().chat.completions.create(
        model=_model(),
        temperature=0.2,
        max_tokens=600,
        messages=[
            {"role": "system", "content": SYSTEM_ANSWER},
            {
                "role": "user",
                "content": (
                    f"Question: {question}\n\n"
                    f"Cypher used:\n{cypher}\n\n"
                    f"Neo4j rows ({len(rows)} total, showing up to 30):\n{context}"
                ),
            },
        ],
    )
    return (response.choices[0].message.content or "").strip()


def ask_forest_agent(question: str) -> dict:
    if not graph_status().get("configured"):
        return {
            "question": question,
            "answer": "Neo4j is not configured. Set NEO4J_* in python_agent/.env.",
            "cypher": "",
            "records": [],
            "agent": agent_status(),
            "error": "neo4j_not_configured",
        }

    if not groq_configured():
        return {
            "question": question,
            "answer": "Groq is not configured. Set GROQ_API_KEY in python_agent/.env.",
            "cypher": "",
            "records": [],
            "agent": agent_status(),
            "error": "groq_not_configured",
        }

    try:
        cypher = generate_cypher(question)
    except Exception as exc:  # noqa: BLE001
        return {
            "question": question,
            "answer": f"Groq Cypher generation failed: {exc}",
            "cypher": "",
            "records": [],
            "agent": agent_status(),
            "error": str(exc),
        }

    if not _is_safe_cypher(cypher):
        return {
            "question": question,
            "answer": (
                "The generated Cypher was rejected because it tried to write or "
                "call admin procedures. Rephrase the question as a read query."
            ),
            "cypher": cypher,
            "records": [],
            "agent": agent_status(),
            "error": "unsafe_cypher",
        }

    try:
        rows = run_cypher(cypher, {"graphId": GRAPH_ID}, mode="READ")
    except Exception as exc:  # noqa: BLE001
        return {
            "question": question,
            "answer": f"Cypher execution failed: {exc}",
            "cypher": cypher,
            "records": [],
            "agent": agent_status(),
            "error": str(exc),
        }

    try:
        answer = synthesize_answer(question, cypher, rows)
    except Exception as exc:  # noqa: BLE001
        return {
            "question": question,
            "answer": f"Groq summarization failed: {exc}",
            "cypher": cypher,
            "records": rows,
            "agent": agent_status(),
            "error": str(exc),
        }

    return {
        "question": question,
        "answer": answer,
        "cypher": cypher,
        "records": rows,
        "agent": agent_status(),
        "error": None,
    }
