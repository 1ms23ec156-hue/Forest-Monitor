"""Static data for the VanRakshak forest graph.

Mirrors forestData.js so the Python seeder builds the same 19-node Indian
reserve, the same zones, and the same animal -> zone associations as the
Node service. Keeping a single source of fake data prevents the JS layer
and the Python agent from drifting apart.
"""

import os
import random
from datetime import datetime, timedelta, timezone

GRAPH_ID = os.getenv("GRAPH_ID", "vanrakshak-india-demo")

# All seven zones are clustered tightly inside the Nitte Meenakshi Institute
# of Technology (NMIT) Bangalore campus block (Yelahanka).
# Center reference: 13.1186 N, 77.6002 E.
FOREST_ZONES = [
    {
        "id": "Z-KABINI",
        "name": "NMIT North-West Grove",
        "habitat": "campus tree line and shaded walkway",
        "risk": "perimeter intrusion and crowd overflow",
        "lat": 13.1192,
        "lng": 77.5996,
    },
    {
        "id": "Z-BANDIPUR-CORE",
        "name": "NMIT Central Quad",
        "habitat": "main academic block and central lawn",
        "risk": "movement overlap and after-hours intrusion",
        "lat": 13.1191,
        "lng": 77.6005,
    },
    {
        "id": "Z-MOYAR",
        "name": "NMIT North-East Field",
        "habitat": "open field and dry edge near boundary wall",
        "risk": "fire risk and unauthorized entry",
        "lat": 13.1189,
        "lng": 77.6011,
    },
    {
        "id": "Z-MUDUMALAI",
        "name": "NMIT East Gate Watch",
        "habitat": "main gate corridor and vehicle path",
        "risk": "vehicle intrusion and after-hours logging trucks",
        "lat": 13.1182,
        "lng": 77.6010,
    },
    {
        "id": "Z-FARM-BUFFER",
        "name": "NMIT South Buffer",
        "habitat": "south-side perimeter and adjoining settlement",
        "risk": "human intrusion from settlement side",
        "lat": 13.1180,
        "lng": 77.6002,
    },
    {
        "id": "Z-WATCH-RIDGE",
        "name": "NMIT South-West Ridge",
        "habitat": "elevated patrol path and watch point",
        "risk": "acoustic anomaly and gunshot/voice detection",
        "lat": 13.1182,
        "lng": 77.5995,
    },
    {
        "id": "Z-WATERHOLE",
        "name": "NMIT Central Pond",
        "habitat": "campus pond and surrounding grazing patch",
        "risk": "predator-prey concentration around water",
        "lat": 13.1186,
        "lng": 77.6000,
    },
]

INDIAN_ANIMALS = [
    {
        "name": "Bengal Tiger",
        "category": "Tiger",
        "conservationStatus": "Endangered",
        "activity": "dawn, dusk, and night",
        "signs": ["alarm calls", "pugmarks", "scrape marks"],
        "zones": ["Z-BANDIPUR-CORE", "Z-WATERHOLE", "Z-WATCH-RIDGE"],
    },
    {
        "name": "Asian Elephant",
        "category": "Elephant",
        "conservationStatus": "Endangered",
        "activity": "late evening and early morning",
        "signs": ["low rumbles", "broken bamboo", "dung trail"],
        "zones": ["Z-KABINI", "Z-FARM-BUFFER", "Z-WATERHOLE"],
    },
    {
        "name": "Indian Leopard",
        "category": "Leopard",
        "conservationStatus": "Vulnerable",
        "activity": "night",
        "signs": ["coughing call", "tree drag marks", "scat"],
        "zones": ["Z-MUDUMALAI", "Z-WATCH-RIDGE", "Z-FARM-BUFFER"],
    },
    {
        "name": "Sloth Bear",
        "category": "Sloth Bear",
        "conservationStatus": "Vulnerable",
        "activity": "night and early morning",
        "signs": ["digging marks", "huffing calls", "termite mound damage"],
        "zones": ["Z-MOYAR", "Z-WATERHOLE", "Z-MUDUMALAI"],
    },
    {
        "name": "Gaur",
        "category": "Gaur",
        "conservationStatus": "Vulnerable",
        "activity": "morning and late evening",
        "signs": ["hoof marks", "grazing patches", "snorts"],
        "zones": ["Z-WATERHOLE", "Z-KABINI", "Z-BANDIPUR-CORE"],
    },
    {
        "name": "Dhole",
        "category": "Dhole",
        "conservationStatus": "Endangered",
        "activity": "daytime pack movement",
        "signs": ["whistles", "group tracks", "chase calls"],
        "zones": ["Z-BANDIPUR-CORE", "Z-MOYAR", "Z-WATERHOLE"],
    },
    {
        "name": "Sambar Deer",
        "category": "Sambar Deer",
        "conservationStatus": "Vulnerable",
        "activity": "dusk and night",
        "signs": ["alarm barks", "hoof marks", "browse lines"],
        "zones": ["Z-WATERHOLE", "Z-BANDIPUR-CORE", "Z-KABINI"],
    },
    {
        "name": "Chital",
        "category": "Chital",
        "conservationStatus": "Least Concern",
        "activity": "daytime and dusk",
        "signs": ["herd calls", "grazing clusters", "alarm calls"],
        "zones": ["Z-WATERHOLE", "Z-KABINI", "Z-FARM-BUFFER"],
    },
    {
        "name": "Nilgai",
        "category": "Nilgai",
        "conservationStatus": "Least Concern",
        "activity": "daytime",
        "signs": ["hoof marks", "crop edge feeding", "snorts"],
        "zones": ["Z-FARM-BUFFER", "Z-MOYAR"],
    },
    {
        "name": "Indian Peafowl",
        "category": "Peafowl",
        "conservationStatus": "Least Concern",
        "activity": "morning and evening",
        "signs": ["loud calls", "roosting trees", "feathers"],
        "zones": ["Z-FARM-BUFFER", "Z-WATCH-RIDGE", "Z-MOYAR"],
    },
    {
        "name": "Grey Langur",
        "category": "Langur",
        "conservationStatus": "Least Concern",
        "activity": "daytime",
        "signs": ["canopy calls", "alarm calls", "branch movement"],
        "zones": ["Z-KABINI", "Z-MUDUMALAI", "Z-WATCH-RIDGE"],
    },
    {
        "name": "Great Hornbill",
        "category": "Hornbill",
        "conservationStatus": "Vulnerable",
        "activity": "morning canopy movement",
        "signs": ["wing beats", "canopy calls", "fruit tree visits"],
        "zones": ["Z-KABINI", "Z-MUDUMALAI"],
    },
    {
        "name": "Wild Boar",
        "category": "Wild Boar",
        "conservationStatus": "Least Concern",
        "activity": "night and dawn",
        "signs": ["rooting marks", "grunts", "crop edge movement"],
        "zones": ["Z-FARM-BUFFER", "Z-MOYAR", "Z-WATERHOLE"],
    },
]

EVENT_CATEGORIES = [
    {"source": "CAM", "category": "Bengal Tiger", "confidence": (82, 98), "weight": 9},
    {"source": "CAM", "category": "Asian Elephant", "confidence": (84, 99), "weight": 11},
    {"source": "CAM", "category": "Indian Leopard", "confidence": (75, 94), "weight": 7},
    {"source": "CAM", "category": "Sloth Bear", "confidence": (72, 93), "weight": 6},
    {"source": "CAM", "category": "Gaur", "confidence": (78, 96), "weight": 7},
    {"source": "CAM", "category": "Dhole", "confidence": (70, 92), "weight": 5},
    {"source": "CAM", "category": "Sambar Deer", "confidence": (80, 97), "weight": 8},
    {"source": "CAM", "category": "Chital", "confidence": (80, 97), "weight": 8},
    {"source": "AUD", "category": "Peafowl", "confidence": (68, 91), "weight": 6},
    {"source": "AUD", "category": "Hornbill", "confidence": (70, 90), "weight": 4},
    {"source": "AUD", "category": "Langur", "confidence": (76, 94), "weight": 5},
    {"source": "CAM", "category": "Human", "confidence": (70, 96), "weight": 4},
    {"source": "AUD", "category": "Chainsaw", "confidence": (78, 98), "weight": 3},
    {"source": "AUD", "category": "Gunshot", "confidence": (82, 99), "weight": 2},
    {"source": "CAM", "category": "Logging Vehicle", "confidence": (72, 95), "weight": 2},
    {"source": "SENS", "category": "Fire", "confidence": (74, 98), "weight": 2},
    {"source": "AUD", "category": "Silence Anomaly", "confidence": (65, 90), "weight": 2},
]

# Two-node demo on the NMIT campus block: a SENDER (TX) at the NW grove and
# a RECEIVER (RX) gateway at the central quad. Layout entries:
# (node_id, zone_id, lat_offset, lng_offset, role, device, battery)
NODE_LAYOUT = [
    (
        "SENDER-NODE",
        "Z-KABINI",
        0.0,
        0.0,
        "LoRa Sender (TX)",
        "ESP32 + PIR + Camera + Mic + LoRa SX1278",
        86,
    ),
    (
        "RECEIVER-NODE",
        "Z-BANDIPUR-CORE",
        0.0,
        0.0,
        "LoRa Gateway (RX)",
        "Raspberry Pi 5 + LoRa SX1278 + Edge AI",
        94,
    ),
]

ZONE_LINKS = [
    ("Z-KABINI", "Z-BANDIPUR-CORE"),
    ("Z-BANDIPUR-CORE", "Z-WATERHOLE"),
    ("Z-BANDIPUR-CORE", "Z-MOYAR"),
    ("Z-MOYAR", "Z-MUDUMALAI"),
    ("Z-MUDUMALAI", "Z-WATCH-RIDGE"),
    ("Z-WATCH-RIDGE", "Z-FARM-BUFFER"),
    ("Z-FARM-BUFFER", "Z-KABINI"),
    ("Z-WATERHOLE", "Z-KABINI"),
]

HIGH_THREAT = {"Human", "Gunshot", "Chainsaw", "Explosion", "Logging Vehicle"}
MEDIUM_THREAT = {"Vehicle", "Speech", "Fire", "Silence Anomaly"}


def classify_threat(category: str) -> str:
    if category in HIGH_THREAT:
        return "critical"
    if category in MEDIUM_THREAT:
        return "warning"
    return "info"


def build_nodes() -> dict:
    zones_by_id = {z["id"]: z for z in FOREST_ZONES}
    nodes = {}
    for node_id, zone_id, lat_off, lng_off, role, device, battery in NODE_LAYOUT:
        zone = zones_by_id[zone_id]
        nodes[node_id] = {
            "id": node_id,
            "lat": zone["lat"] + lat_off,
            "lng": zone["lng"] + lng_off,
            "zone": zone["name"],
            "zoneId": zone_id,
            "env": "NMIT Bangalore Campus Block Demo",
            "device": device,
            "role": role,
            "battery": battery,
            "status": "active",
        }
    return nodes


def build_mesh_links(nodes: dict) -> list:
    ids = list(nodes.keys())
    links = []
    for i, node_id in enumerate(ids):
        links.append({"from": node_id, "to": ids[(i + 1) % len(ids)]})
        if i % 3 == 0 and i + 3 < len(ids):
            links.append({"from": node_id, "to": ids[i + 3]})
    return links


def get_animal_by_category(category: str):
    for animal in INDIAN_ANIMALS:
        if animal["name"] == category or animal["category"] == category:
            return animal
    return None


def weighted_pick(items):
    total = sum(item["weight"] for item in items)
    cursor = random.uniform(0, total)
    for item in items:
        cursor -= item["weight"]
        if cursor <= 0:
            return item
    return items[-1]


def build_seed_detections(nodes: dict, total: int = 95) -> list:
    detections = []
    now = datetime.now(timezone.utc)
    node_items = list(nodes.items())

    for index in range(total):
        event = weighted_pick(EVENT_CATEGORIES)
        animal = get_animal_by_category(event["category"])

        candidates = node_items
        if animal:
            candidates = [(nid, n) for nid, n in node_items if n["zoneId"] in animal["zones"]]
        elif event["category"] in {"Chainsaw", "Logging Vehicle"}:
            candidates = [(nid, n) for nid, n in node_items if n["zoneId"] in {"Z-MUDUMALAI", "Z-MOYAR"}]
        elif event["category"] == "Human":
            candidates = [
                (nid, n) for nid, n in node_items
                if n["zoneId"] in {"Z-FARM-BUFFER", "Z-WATCH-RIDGE", "Z-MUDUMALAI"}
            ]
        elif event["category"] == "Fire":
            candidates = [(nid, n) for nid, n in node_items if n["zoneId"] in {"Z-MOYAR", "Z-WATCH-RIDGE"}]

        if not candidates:
            candidates = node_items

        node_id, node = random.choice(candidates)
        confidence_low, confidence_high = event["confidence"]
        confidence = f"{random.randint(confidence_low, confidence_high)}%"
        age_minutes = random.randint(0, 60 * 36)
        timestamp = (now - timedelta(minutes=age_minutes)).isoformat()

        detections.append({
            "id": f"seed-{index + 1}",
            "nodeId": node_id,
            "zoneId": node["zoneId"],
            "zone": node["zone"],
            "lat": node["lat"],
            "lng": node["lng"],
            "source": event["source"],
            "category": event["category"],
            "confidence": confidence,
            "threat": classify_threat(event["category"]),
            "timestamp": timestamp,
            "raw": f"{node_id}:{event['source']}:{event['category']}:{confidence}",
            "animalName": animal["name"] if animal else None,
            "animalCategory": animal["category"] if animal else None,
        })
    return detections
