"""Neo4j connection wrapper, seed loader, and read-only Cypher executor."""

import os
from typing import Any

from neo4j import GraphDatabase, Driver
from neo4j.time import Date, DateTime, Time

from forest_data import (
    FOREST_ZONES,
    GRAPH_ID,
    INDIAN_ANIMALS,
    ZONE_LINKS,
    build_mesh_links,
    build_nodes,
    build_seed_detections,
    classify_threat,
    get_animal_by_category,
)


_driver: Driver | None = None


def _database() -> str:
    return os.getenv("NEO4J_DATABASE", "neo4j")


def graph_configured() -> bool:
    return bool(
        os.getenv("NEO4J_URI")
        and os.getenv("NEO4J_USERNAME")
        and os.getenv("NEO4J_PASSWORD")
    )


def get_driver() -> Driver | None:
    global _driver
    if not graph_configured():
        return None
    if _driver is None:
        _driver = GraphDatabase.driver(
            os.getenv("NEO4J_URI"),
            auth=(os.getenv("NEO4J_USERNAME"), os.getenv("NEO4J_PASSWORD")),
        )
    return _driver


def close_driver() -> None:
    global _driver
    if _driver is not None:
        _driver.close()
        _driver = None


def graph_status() -> dict:
    if not graph_configured():
        return {
            "configured": False,
            "connected": False,
            "message": "Set NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD in python_agent/.env.",
        }
    return {
        "configured": True,
        "connected": _driver is not None,
        "uri": os.getenv("NEO4J_URI"),
        "database": _database(),
        "graphId": GRAPH_ID,
    }


def verify_graph() -> dict:
    driver = get_driver()
    if driver is None:
        return graph_status()
    driver.verify_connectivity()
    return {**graph_status(), "connected": True, "message": "Neo4j connection verified."}


def _to_plain(value: Any) -> Any:
    if isinstance(value, (DateTime, Date, Time)):
        return value.iso_format()
    if isinstance(value, list):
        return [_to_plain(v) for v in value]
    if isinstance(value, dict):
        return {k: _to_plain(v) for k, v in value.items()}
    if hasattr(value, "items") and not isinstance(value, str):
        return {k: _to_plain(v) for k, v in value.items()}
    return value


def run_cypher(cypher: str, params: dict | None = None, mode: str = "READ") -> list[dict]:
    driver = get_driver()
    if driver is None:
        raise RuntimeError(graph_status()["message"])

    params = params or {}
    session_kwargs = {"database": _database()}
    if mode == "READ":
        session_kwargs["default_access_mode"] = "READ"

    with driver.session(**session_kwargs) as session:
        result = session.run(cypher, params)
        rows = []
        for record in result:
            row = {}
            for key in record.keys():
                row[key] = _to_plain(record[key])
            rows.append(row)
        return rows


def seed_graph() -> dict:
    """Wipe the demo subgraph and re-seed zones, nodes, mesh, animals, detections."""
    nodes = build_nodes()
    detections = build_seed_detections(nodes)

    # 1. Wipe everything tagged with this graphId so re-seeding is idempotent.
    run_cypher(
        "MATCH (n {graphId: $graphId}) DETACH DELETE n",
        {"graphId": GRAPH_ID},
        mode="WRITE",
    )

    # 2. Constraints (idempotent).
    run_cypher(
        "CREATE CONSTRAINT forest_node_id IF NOT EXISTS "
        "FOR (n:ForestNode) REQUIRE n.id IS UNIQUE",
        mode="WRITE",
    )
    run_cypher(
        "CREATE CONSTRAINT forest_zone_id IF NOT EXISTS "
        "FOR (z:Zone) REQUIRE z.id IS UNIQUE",
        mode="WRITE",
    )
    run_cypher(
        "CREATE CONSTRAINT animal_name IF NOT EXISTS "
        "FOR (a:Animal) REQUIRE a.name IS UNIQUE",
        mode="WRITE",
    )

    # 3. Zones.
    run_cypher(
        """
        UNWIND $zones AS zone
        MERGE (z:Zone {id: zone.id})
        SET z += zone, z.graphId = $graphId
        """,
        {"zones": FOREST_ZONES, "graphId": GRAPH_ID},
        mode="WRITE",
    )

    # 4. Forest nodes -> zones.
    node_rows = list(nodes.values())
    run_cypher(
        """
        UNWIND $nodes AS row
        MATCH (z:Zone {id: row.zoneId})
        MERGE (n:ForestNode {id: row.id})
        SET n += row, n.graphId = $graphId
        MERGE (n)-[:LOCATED_IN]->(z)
        """,
        {"nodes": node_rows, "graphId": GRAPH_ID},
        mode="WRITE",
    )

    # 5. LoRa mesh links between nodes.
    run_cypher(
        """
        UNWIND $links AS link
        MATCH (a:ForestNode {id: link.from})
        MATCH (b:ForestNode {id: link.to})
        MERGE (a)-[:CONNECTED_TO {network: 'LoRa mesh'}]->(b)
        MERGE (b)-[:CONNECTED_TO {network: 'LoRa mesh'}]->(a)
        """,
        {"links": build_mesh_links(nodes)},
        mode="WRITE",
    )

    # 6. Zone adjacency.
    run_cypher(
        """
        UNWIND $links AS link
        MATCH (a:Zone {id: link[0]})
        MATCH (b:Zone {id: link[1]})
        MERGE (a)-[:NEAR]->(b)
        MERGE (b)-[:NEAR]->(a)
        """,
        {"links": [list(pair) for pair in ZONE_LINKS]},
        mode="WRITE",
    )

    # 7. Animals -> zones.
    run_cypher(
        """
        UNWIND $animals AS row
        MERGE (a:Animal {name: row.name})
        SET a.category = row.category,
            a.conservationStatus = row.conservationStatus,
            a.activity = row.activity,
            a.signs = row.signs,
            a.graphId = $graphId
        WITH a, row
        UNWIND row.zones AS zoneId
        MATCH (z:Zone {id: zoneId})
        MERGE (a)-[:COMMON_IN]->(z)
        """,
        {"animals": INDIAN_ANIMALS, "graphId": GRAPH_ID},
        mode="WRITE",
    )

    # 8. Seed detections.
    run_cypher(
        """
        UNWIND $detections AS row
        MATCH (n:ForestNode {id: row.nodeId})
        MATCH (z:Zone {id: row.zoneId})
        CREATE (d:Detection {
            id: row.id,
            graphId: $graphId,
            timestamp: datetime(row.timestamp),
            source: row.source,
            category: row.category,
            confidence: row.confidence,
            threat: row.threat,
            raw: row.raw
        })
        MERGE (n)-[:RECORDED]->(d)
        MERGE (d)-[:OBSERVED_IN]->(z)
        FOREACH (_ IN CASE WHEN row.animalName IS NULL THEN [] ELSE [1] END |
            MERGE (a:Animal {name: row.animalName})
            MERGE (d)-[:DETECTED_ANIMAL]->(a)
        )
        """,
        {"detections": detections, "graphId": GRAPH_ID},
        mode="WRITE",
    )

    return {
        "graphId": GRAPH_ID,
        "zones": len(FOREST_ZONES),
        "nodes": len(node_rows),
        "animals": len(INDIAN_ANIMALS),
        "detections": len(detections),
    }


def save_detection(detection: dict) -> None:
    """Persist a live detection coming from the Node server."""
    animal = get_animal_by_category(detection.get("category", ""))
    threat = detection.get("threat") or classify_threat(detection.get("category", ""))

    run_cypher(
        """
        MATCH (n:ForestNode {id: $nodeId})
        MATCH (z:Zone {id: $zoneId})
        CREATE (d:Detection {
            id: $id,
            graphId: $graphId,
            timestamp: datetime($timestamp),
            source: $source,
            category: $category,
            confidence: $confidence,
            threat: $threat,
            raw: $raw
        })
        MERGE (n)-[:RECORDED]->(d)
        MERGE (d)-[:OBSERVED_IN]->(z)
        SET n.lastSeen = datetime($timestamp),
            n.lastCategory = $category,
            n.lastThreat = $threat
        FOREACH (_ IN CASE WHEN $animalName IS NULL THEN [] ELSE [1] END |
            MERGE (a:Animal {name: $animalName})
            SET a.category = $animalCategory, a.graphId = $graphId
            MERGE (d)-[:DETECTED_ANIMAL]->(a)
        )
        """,
        {
            "id": str(detection.get("id", "")),
            "graphId": GRAPH_ID,
            "nodeId": detection.get("nodeId"),
            "zoneId": detection.get("zoneId"),
            "timestamp": detection.get("timestamp"),
            "source": detection.get("source"),
            "category": detection.get("category"),
            "confidence": detection.get("confidence"),
            "threat": threat,
            "raw": detection.get("raw", ""),
            "animalName": animal["name"] if animal else None,
            "animalCategory": animal["category"] if animal else None,
        },
        mode="WRITE",
    )
