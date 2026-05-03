const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const { createIndiaNodes, createFakeEvent } = require('./forestData');
const graph = require('./graphService');
const graphAgent = require('./graphAgent');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'images')));

const detections = [];
const MAX_DETECTIONS = 500;
const nodeStatus = {};
const NODES = createIndiaNodes();

let serialConnected = false;
let testStreamTimer = null;
let testStreamState = {
  running: false,
  intervalMs: 4000,
  emitted: 0,
  startedAt: null,
};

const SERIAL_PORT = process.env.SERIAL_PORT || 'COM4';
const SERIAL_BAUD = parseInt(process.env.SERIAL_BAUD || '115200', 10);

function classifyThreat(source, category) {
  const highThreats = ['Human', 'Gunshot', 'Chainsaw', 'Explosion', 'Logging Vehicle'];
  const mediumThreats = ['Vehicle', 'Speech', 'Fire', 'Silence Anomaly'];
  if (highThreats.includes(category)) return 'critical';
  if (mediumThreats.includes(category)) return 'warning';
  return 'info';
}

function getIcon(source, category) {
  const icons = {
    Human: 'fa-user-secret',
    Gunshot: 'fa-crosshairs',
    Chainsaw: 'fa-tree',
    Explosion: 'fa-bomb',
    Vehicle: 'fa-truck',
    'Logging Vehicle': 'fa-truck-loading',
    Speech: 'fa-comment',
    Fire: 'fa-fire-alt',
    'Silence Anomaly': 'fa-volume-mute',
    'Asian Elephant': 'fa-hippo',
    Elephant: 'fa-hippo',
    'Bengal Tiger': 'fa-cat',
    Tiger: 'fa-cat',
    'Indian Leopard': 'fa-cat',
    Leopard: 'fa-cat',
    'Sloth Bear': 'fa-paw',
    Bear: 'fa-paw',
    Gaur: 'fa-paw',
    Dhole: 'fa-paw',
    'Sambar Deer': 'fa-paw',
    Chital: 'fa-paw',
    Nilgai: 'fa-paw',
    Peafowl: 'fa-dove',
    Langur: 'fa-paw',
    Hornbill: 'fa-dove',
    'Wild Boar': 'fa-paw',
    Animal: 'fa-paw',
  };
  if (icons[category]) return icons[category];
  if (source === 'AUD') return 'fa-microphone';
  if (source === 'SENS') return 'fa-temperature-high';
  return 'fa-camera';
}

function buildDetection({ nodeId = 'NODE-01', source, category, confidence, raw }) {
  const fallbackNodeId = NODES[nodeId] ? nodeId : 'NODE-01';
  const node = NODES[fallbackNodeId];
  const timestamp = new Date().toISOString();

  return {
    id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    timestamp,
    source,
    category,
    confidence: confidence || '0%',
    threat: classifyThreat(source, category),
    icon: getIcon(source, category),
    nodeId: fallbackNodeId,
    lat: node.lat,
    lng: node.lng,
    zone: node.zone,
    zoneId: node.zoneId,
    env: node.env,
    raw: raw || `${fallbackNodeId}:${source}:${category}:${confidence || '0%'}`,
  };
}

function registerDetection(detection) {
  detections.unshift(detection);
  if (detections.length > MAX_DETECTIONS) detections.length = MAX_DETECTIONS;

  nodeStatus[detection.nodeId] = {
    lastSeen: detection.timestamp,
    lastCategory: detection.category,
    lastSource: detection.source,
    lastConfidence: detection.confidence,
    lastThreat: detection.threat,
    totalDetections: (nodeStatus[detection.nodeId]?.totalDetections || 0) + 1,
  };

  return detection;
}

async function persistDetection(detection) {
  if (!graph.graphStatus().configured) return;
  try {
    await graph.saveDetection(detection);
  } catch (err) {
    console.log(`  [NEO4J] Save skipped: ${err.message}`);
  }
}

function publishDetection(detection) {
  registerDetection(detection);
  io.emit('new-detection', detection);
  io.emit('stats-update', computeStats());
  persistDetection(detection);
  console.log(`  [DETECT] ${detection.nodeId} ${detection.source}:${detection.category}:${detection.confidence} -> ${detection.threat}`);
}

function processDetection(raw) {
  let msg = raw.trim();
  if (msg.startsWith('Got:')) msg = msg.substring(4).trim();

  const skipPatterns = [
    'Ready',
    'LoRa Ready',
    'entry',
    'rst:',
    'configsip:',
    'clk_drv:',
    'load:',
    'mode:',
    'Brownout',
    'detector',
    'triggered',
    'boot:',
  ];
  if (msg === '' || skipPatterns.some((pattern) => msg.includes(pattern))) return null;

  const parts = msg.split(':').map((item) => item.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  let nodeId = 'NODE-01';
  let source;
  let category;
  let confidence;

  if (parts.length >= 4 && NODES[parts[0]]) {
    nodeId = parts[0];
    source = parts[1];
    category = parts[2];
    confidence = parts[3];
  } else if (parts.length >= 3 && ['CAM', 'AUD', 'SENS'].includes(parts[0])) {
    source = parts[0];
    category = parts[1];
    confidence = parts[2];
  } else if (parts.length === 2) {
    source = 'CAM';
    category = parts[0];
    confidence = parts[1];
  } else {
    return null;
  }

  const categoryCorrections = {
    '$peech': 'Speech',
    peech: 'Speech',
    fire: 'Fire',
    human: 'Human',
  };

  category = categoryCorrections[category] || category;
  if (!source || !category) return null;

  return buildDetection({ nodeId, source, category, confidence, raw: msg });
}

async function initSerial() {
  try {
    const { SerialPort } = require('serialport');
    const { ReadlineParser } = require('@serialport/parser-readline');

    const port = new SerialPort({ path: SERIAL_PORT, baudRate: SERIAL_BAUD });
    const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    port.on('open', () => {
      console.log(`  [SERIAL] Connected to ${SERIAL_PORT} @ ${SERIAL_BAUD}`);
      serialConnected = true;
      io.emit('serial-status', { connected: true, port: SERIAL_PORT });
    });

    parser.on('data', (line) => {
      console.log(`  [SERIAL RAW] ${line}`);
      const detection = processDetection(line);
      if (detection) publishDetection(detection);
    });

    port.on('error', (err) => {
      console.log(`  [SERIAL] Error: ${err.message}`);
      serialConnected = false;
      io.emit('serial-status', { connected: false, error: err.message });
    });

    port.on('close', () => {
      console.log('  [SERIAL] Port closed');
      serialConnected = false;
      io.emit('serial-status', { connected: false });
    });
  } catch (err) {
    console.log(`  [SERIAL] Could not open port (${err.message})`);
    console.log('  [SERIAL] Waiting for live data from ESP32 or test stream...');
    serialConnected = false;
  }
}

function computeStats() {
  const now = Date.now();
  const last24h = detections.filter((d) => now - new Date(d.timestamp).getTime() < 86400000);
  const lastHour = detections.filter((d) => now - new Date(d.timestamp).getTime() < 3600000);

  const categoryCounts = {};
  const sourceCounts = { CAM: 0, AUD: 0, SENS: 0 };
  const threatCounts = { critical: 0, warning: 0, info: 0 };
  const hourlyBuckets = {};
  const zoneCounts = {};

  last24h.forEach((d) => {
    categoryCounts[d.category] = (categoryCounts[d.category] || 0) + 1;
    sourceCounts[d.source] = (sourceCounts[d.source] || 0) + 1;
    threatCounts[d.threat] = (threatCounts[d.threat] || 0) + 1;

    const hour = new Date(d.timestamp).getHours();
    hourlyBuckets[hour] = (hourlyBuckets[hour] || 0) + 1;
    zoneCounts[d.zone] = (zoneCounts[d.zone] || 0) + 1;
  });

  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const hourlyData = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: hourlyBuckets[hour] || 0,
  }));

  const hotspots = Object.entries(zoneCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return {
    total24h: last24h.length,
    totalHour: lastHour.length,
    totalAll: detections.length,
    threatCounts,
    sourceCounts,
    topCategories,
    hourlyData,
    hotspots,
    activeNodes: Object.keys(nodeStatus).length,
    totalNodes: Object.keys(NODES).length,
  };
}

function startTestStream(intervalMs = 4000) {
  stopTestStream();
  testStreamState = {
    running: true,
    intervalMs,
    emitted: 0,
    startedAt: new Date().toISOString(),
  };

  const tick = () => {
    const fake = createFakeEvent(NODES);
    const detection = buildDetection(fake);
    testStreamState.emitted += 1;
    publishDetection(detection);
    io.emit('stream-status', getTestStreamStatus());
  };

  tick();
  testStreamTimer = setInterval(tick, intervalMs);
  return getTestStreamStatus();
}

function stopTestStream() {
  if (testStreamTimer) clearInterval(testStreamTimer);
  testStreamTimer = null;
  testStreamState.running = false;
  return getTestStreamStatus();
}

function getTestStreamStatus() {
  return { ...testStreamState };
}

io.on('connection', (socket) => {
  console.log(`  [WS] Client connected: ${socket.id}`);

  socket.emit('init', {
    detections: detections.slice(0, 50),
    nodes: NODES,
    nodeStatus,
    stats: computeStats(),
    serialConnected,
    graph: graph.graphStatus(),
    agent: graphAgent.agentStatus(),
    stream: getTestStreamStatus(),
  });

  socket.on('disconnect', () => {
    console.log(`  [WS] Client disconnected: ${socket.id}`);
  });
});

app.get('/api/detections', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  res.json(detections.slice(0, limit));
});

app.get('/api/stats', (req, res) => {
  res.json(computeStats());
});

app.get('/api/nodes', (req, res) => {
  res.json({ nodes: NODES, status: nodeStatus });
});

app.post('/api/inject', (req, res) => {
  const raw = req.body.data;
  if (!raw) return res.status(400).json({ error: 'Missing data field' });

  const detection = processDetection(raw);
  if (!detection) return res.status(400).json({ error: 'Could not parse detection data' });

  publishDetection(detection);
  return res.json({ success: true, detection });
});

app.get('/api/graph/status', (req, res) => {
  res.json(graph.graphStatus());
});

app.get('/api/graph/verify', async (req, res) => {
  try {
    res.json(await graph.verifyGraph());
  } catch (err) {
    res.status(500).json({ error: err.message, ...graph.graphStatus() });
  }
});

app.post('/api/graph/seed', async (req, res) => {
  try {
    const result = await graph.seedGraph();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, ...graph.graphStatus() });
  }
});

app.post('/api/agent/ask', async (req, res) => {
  const question = req.body.question || '';
  if (!question.trim()) return res.status(400).json({ error: 'Missing question' });

  try {
    res.json(await graphAgent.askForestAgent(question));
  } catch (err) {
    res.status(500).json({ error: err.message, agent: graphAgent.agentStatus() });
  }
});

app.get('/api/stream/status', (req, res) => {
  res.json(getTestStreamStatus());
});

app.post('/api/stream/start', (req, res) => {
  const intervalMs = Math.max(1000, parseInt(req.body.intervalMs, 10) || 4000);
  const status = startTestStream(intervalMs);
  io.emit('stream-status', status);
  res.json(status);
});

app.post('/api/stream/stop', (req, res) => {
  const status = stopTestStream();
  io.emit('stream-status', status);
  res.json(status);
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log('');
  console.log('  WildSenseAI - VanRakshak Server');
  console.log(`  Website:   http://localhost:${PORT}`);
  console.log(`  Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`  Nodes:     ${Object.keys(NODES).length} NMIT campus nodes (${Object.keys(NODES).join(', ')})`);
  console.log(`  Serial:    ${SERIAL_PORT} @ ${SERIAL_BAUD}`);
  console.log(`  Neo4j:     ${graph.graphStatus().configured ? 'configured' : 'not configured'}`);
  console.log(`  Py Agent:  ${process.env.PY_AGENT_URL || 'http://127.0.0.1:8000'} (start with python_agent/start.bat)`);
  console.log('');
  initSerial();
});

process.on('SIGINT', async () => {
  stopTestStream();
  await graph.closeGraph();
  process.exit(0);
});
