# VanRakshak / WildSenseAI

AI-Enabled Smart Forest Monitoring System

VanRakshak is a real-time, multi-sensory forest surveillance platform that replaces passive camera-trap recording with an intelligent network of edge-AI nodes. Each node sees, hears, and understands its environment, communicates over a long-range LoRa mesh, and is queryable through a Neo4j-backed Graph RAG agent.

---

## 1. The Problem

Forests are the lungs of our planet, yet they remain among the most poorly monitored environments on Earth. Traditional surveillance still relies on static camera traps with memory cards that rangers must physically retrieve - sometimes weeks or months after an incident. By then:

- A poacher caught at night is long gone.
- A century-old tree felled by a chainsaw is already lost.
- A small spark has become a wildfire.
- The forest soundscape - birds, calls, rustles - has been completely ignored.

Conventional systems do not monitor; they record. They do not respond; they reveal the past. And they do not listen.

## 2. The Solution

A network of smart IoT nodes that perform on-device classification of visual and acoustic events, then relay only the final predictions over a LoRa mesh to a live ranger dashboard. No internet required at the node. No cloud inference. No latency.

The system goes beyond detection into predictive ecological awareness: long-term acoustic baselines reveal anomalies (for example, sudden silence in a previously active region) that point to disturbances no camera could capture.

---

## 3. Edge AI Pipelines

### Audio Pipeline
1. The microphone signal is converted into a Mel spectrogram - sound is reframed as an image.
2. The spectrogram is passed into MobileNetV2.
3. MobileNetV2 is chosen for depthwise separable convolutions, which reduce computation and model size.
4. Output classes include Gunshot, Chainsaw, Speech, Animal Vocalization, Silence Anomaly, and more.

### Vision Pipeline
1. YOLO processes each frame in a single pass, predicting bounding boxes, class labels, and confidence scores for humans, animals, and vehicles.
2. To improve reliability, predictions are aggregated over about 10 frames and a voting mechanism picks the final label.
3. Bounding-box color signals threat type - red for humans, green for animals.

### Multimodal Fusion
Combining audio and vision raises confidence and provides redundancy: even if one modality fails or is fooled, the other still carries the event. This is the Bioacoustic Fusion Intelligence core of the system.

All inference runs locally on the edge device. Only final predictions leave the node over LoRa.

---

## 4. Node Hardware

Each node is an independent yet interconnected unit:

| Component | Role |
|---|---|
| Raspberry Pi 5 | Edge AI runtime |
| ESP32 | Sensor + LoRa controller |
| PIR sensor | Event-driven trigger (no continuous recording) |
| Camera module | Vision capture on PIR trigger |
| Microphone array | Continuous bioacoustic capture |
| LoRa SX1278 | Long-range, low-power communication (10-15 km) |
| Temperature + smoke sensors | Early fire detection |
| Battery / solar | Sustainable, long-deployment power |

The PIR sensor wakes the camera only on motion, saving power and skipping empty frames.

---

## 5. LoRa Mesh Network

- Nodes do not rely on direct links to a central station.
- Each node communicates with nearest neighbors and relays events forward.
- The mesh is self-healing - if one node fails, the network reroutes around it.
- About 19 nodes can cover up to about 1,800 km2.
- The system is independent of cellular and internet infrastructure.

The current repo ships a 2-node demo (SENDER-NODE, RECEIVER-NODE) on the NMIT Yelahanka campus block, scalable to the full 19-node mesh.

---

## 6. Graph RAG Intelligence Layer

Detections are not just shown - they are stored as a knowledge graph in Neo4j and exposed through a Groq-powered RAG agent so rangers can ask natural-language questions of the forest itself.

### Graph schema

```text
(:Zone)              <-[:LOCATED_IN]-     (:ForestNode)   -[:RECORDED]->     (:Detection)
(:Zone) -[:NEAR]-    (:Zone)                                                 -[:OBSERVED_IN]-> (:Zone)
(:Animal) -[:COMMON_IN]-> (:Zone)         (:ForestNode) -[:CONNECTED_TO]-    (:ForestNode)     -[:DETECTED_ANIMAL]-> (:Animal)
```

### Agent flow

1. Ranger asks a question.
2. Groq (LLaMA 3.3 70B) generates a read-only Cypher query, schema-aware.
3. A safety filter blocks write keywords (CREATE, MERGE, DELETE, SET, CALL db., and others).
4. Cypher executes against Neo4j in read mode.
5. Groq summarizes the rows into a concise ranger-style answer.
6. The dashboard renders the answer, the Cypher used, and the raw graph rows.

Sample questions:
- Where are Asian elephants moving?
- Which zone has the highest risk today?
- Which nodes recorded chainsaw sounds recently?
- Show zones where humans and animals overlap.

---

## 7. Live Dashboard

A web dashboard at http://localhost:3000/dashboard provides:

- Overview: KPI tiles (critical, warning, wildlife, nodes, cam, aud), mini map, recent alerts feed, category chart, and 24h activity chart.
- Node Map: Full-screen Leaflet map centered on NMIT Yelahanka with TX/RX markers, LoRa link, and zone overlays.
- Live Alerts: Filterable feed (all, critical, warning, info, camera, audio, sensor).
- Insights: Source distribution, threat breakdown, hotspot zones, and AI-generated summaries.
- AI Query: Neo4j status, seed control, test-stream control, and a chat interface to the Groq + Neo4j agent.
- Prediction Zones: Hex grid of predicted wildlife presence with sound-guidance recommendations and on-demand directional tones.
- Nodes: Per-node status cards.

---

## 8. Use Cases

- Anti-poaching: Instant alerts on human intrusion in restricted areas.
- Anti-logging: Chainsaw and logging-vehicle audio detection.
- Wildfire detection: Temperature + smoke + acoustic anomalies.
- Wildlife monitoring: Passive species inventory and movement patterns.
- Search and rescue: Locating lost individuals via visual/audio detection where no cell signal exists.
- Agricultural protection: Sandalwood farms and large estates against theft and unauthorized entry.
- Ecological anomaly detection: Sudden silence in normally active regions as an early warning of disturbance.

---

## 9. Architecture

```text
+--------------+  PIR + Camera + Mic   +----------------------+
| SENDER-NODE  |---------------------->|  Edge AI on Pi 5     |
| (ESP32+LoRa) |                       |  YOLO + MobileNetV2  |
+------+-------+                       +----------+-----------+
       | LoRa SX1278                              |
       v                                          v
+--------------+    Serial (USB)        +----------------------+
| RECEIVER-    |------------------------>|   Node.js server     |
| NODE / Pi 5  |                         |   server.js (3000)   |
+--------------+                         +------+---------------+
                                               | HTTP proxy
                                               v
                                +------------------------------+
                                | Python agent (FastAPI 8000)  |
                                | Neo4j + Groq LLM RAG         |
                                +--------------+---------------+
                                               v
                                       +---------------+
                                       |    Neo4j      |
                                       +---------------+

Browser dashboard <------- Socket.IO + REST -------- server.js
```

---

## 10. Project Structure

```text
Forest_Monitoring/
|- server.js                    Express + Socket.IO + serial ingest
|- forestData.js                Zones, animals, nodes (NMIT campus)
|- graphService.js              HTTP proxy to Python /graph endpoints
|- graphAgent.js                HTTP proxy to Python /agent endpoints
|- serial_test.js               Raw serial debug tool
|- public/
|  |- index.html                Project landing page
|  |- dashboard.html            Live dashboard markup
|  |- dashboard.css             Dashboard styling
|  |- dashboard.js              Dashboard logic, maps, charts, agent UI
|  |- styles.css
|- python_agent/
|  |- app.py                    FastAPI service (port 8000)
|  |- agent.py                  Groq RAG agent: NL -> Cypher -> answer
|  |- graph_db.py               Neo4j driver, seed, save_detection
|  |- forest_data.py            Mirror of forestData.js for the seeder
|  |- requirements.txt
|  |- start.bat                 One-shot Windows launcher
|  |- .env.example
|- images/
|- package.json
|- .env                         All environment configuration
```

---

## 11. Tech Stack

| Layer | Tech |
|---|---|
| Edge vision | YOLO + multi-frame voting |
| Edge audio | Mel spectrogram -> MobileNetV2 |
| Wireless | LoRa SX1278 mesh |
| Sensors | PIR, smoke, temperature, microphone |
| Edge runtime | Raspberry Pi 5, ESP32 |
| API server | Node.js, Express, Socket.IO, SerialPort |
| Maps and charts | Leaflet, Chart.js |
| Agent service | Python, FastAPI, Uvicorn |
| Graph DB | Neo4j (Aura or local) |
| LLM | Groq - llama-3.3-70b-versatile |
| Frontend | Vanilla HTML/CSS/JS |

---

## 12. Setup

### Prerequisites
- Node.js 18+ (for built-in fetch)
- Python 3.10+
- A Neo4j instance (Aura free tier works)
- A Groq API key from https://console.groq.com

### One-time install

```bash
# Node deps
npm install

# Python venv + deps (Windows: use start.bat)
cd python_agent
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Environment

Edit .env in the project root:

```env
PORT=3000
SERIAL_PORT=COM7
SERIAL_BAUD=115200

PY_AGENT_URL=http://127.0.0.1:8000

NEO4J_URI=neo4j+s://<your-instance>.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=<your-password>
NEO4J_DATABASE=neo4j

GROQ_API_KEY=<your-groq-key>
GROQ_MODEL=llama-3.3-70b-versatile

GRAPH_ID=vanrakshak-india-demo
```

The Python agent auto-loads this same .env from the project root, so there is one config file.

---

## 13. Run

You need two terminals.

### Terminal 1 - Python agent

```bash
cd python_agent
.\start.bat
# or
.\.venv\Scripts\Activate.ps1
uvicorn app:app --host 0.0.0.0 --port 8000
```

### Terminal 2 - Node server

```bash
npm start
```

### Browser

- Landing page: http://localhost:3000
- Dashboard: http://localhost:3000/dashboard

### First-time graph export

In the dashboard sidebar, AI Query:

1. Click Verify to confirm Neo4j is reachable.
2. Click Seed India Graph to export zones, nodes, animals, and demo detections to Neo4j.
3. Ask a question.

---

## 14. API Endpoints

### Node server (port 3000)

| Method | Path | Description |
|---|---|---|
| GET | /api/detections?limit=50 | Recent detections in memory |
| GET | /api/stats | Live aggregated statistics |
| GET | /api/nodes | Node table + last-seen status |
| POST | /api/inject | Push a synthetic detection |
| GET | /api/graph/status | Neo4j connection status (proxied) |
| GET | /api/graph/verify | Verify Neo4j connectivity |
| POST | /api/graph/seed | Re-export the graph |
| POST | /api/agent/ask | { question } -> ranger answer |
| GET/POST | /api/stream/{status,start,stop} | Test event firehose |

### Python agent (port 8000)

| Method | Path | Description |
|---|---|---|
| GET | /health | Liveness |
| GET | /status | Agent + graph status |
| GET | /graph/status | Neo4j config |
| GET | /graph/verify | Neo4j connectivity |
| POST | /graph/seed | Seed the demo graph |
| POST | /graph/detection | Persist a live detection |
| POST | /agent/ask | { question } -> { answer, cypher, records } |

---

## Contact

Nitte Meenakshi Institute of Technology, Nitte University Campus, Yelahanka, Bengaluru, Karnataka 560064
Office: +91 80 22167800
