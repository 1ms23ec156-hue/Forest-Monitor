const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;

// ── Middleware ──
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// ── In-Memory Data Store ──
const detections = [];       // all detections received
const MAX_DETECTIONS = 500;  // keep last 500
const nodeStatus = {};       // last-seen per node

// ── Node Configuration ──
// Nitte Meenakshi Institute of Technology, Yelahanka — real deployment location
const NODES = {
  'SENDER-NODE': {
    lat: 13.0814,
    lng: 77.5879,
    zone: 'Nitte Meenakshi Institute of Technology, Yelahanka',
    env: 'Field Deployment',
    device: 'Raspberry Pi 5 + LoRa + Camera + Mic',
    role: 'Sender — AI Detection & Transmission',
  },
  'RECEIVER-NODE': {
    lat: 13.0818,
    lng: 77.5887,
    zone: 'Nitte Meenakshi Institute of Technology, Yelahanka',
    env: 'Base Station',
    device: 'ESP32 + LoRa + LCD Display',
    role: 'Receiver — Data Collection & Serial Output',
  },
};

// ── Threat Classification ──
function classifyThreat(source, category) {
  const HIGH_THREATS = ['Human', 'Gunshot', 'Chainsaw', 'Explosion', 'Logging Vehicle'];
  const MED_THREATS  = ['Vehicle', 'Speech', 'Fire'];
  if (HIGH_THREATS.includes(category)) return 'critical';
  if (MED_THREATS.includes(category))  return 'warning';
  return 'info';
}

function getIcon(source, category) {
  const icons = {
    'Human': 'fa-user-secret', 'Gunshot': 'fa-crosshairs', 'Chainsaw': 'fa-tree',
    'Explosion': 'fa-bomb', 'Vehicle': 'fa-truck', 'Logging Vehicle': 'fa-truck-loading',
    'Speech': 'fa-comment', 'Fire': 'fa-fire-alt', 'Elephant': 'fa-hippo',
    'Bear': 'fa-paw', 'Tiger': 'fa-cat', 'Lion': 'fa-paw', 'Bird': 'fa-dove',
    'Bovine': 'fa-horse', 'Horse': 'fa-horse', 'Giraffe': 'fa-horse', 'Animal': 'fa-paw',
  };
  return icons[category] || (source === 'AUD' ? 'fa-microphone' : 'fa-camera');
}

// ── Process incoming detection ──
function processDetection(raw) {
  // Format from sender: "SOURCE:CATEGORY:CONFIDENCE" e.g. "CAM:Human:88%"
  // Also handles: "label:XX%" format from basic ESP32 output
  // ESP32 serial prints: "Got: CAM:Human:88%"
  let msg = raw.trim();

  // Strip "Got: " prefix from ESP32 serial output
  if (msg.startsWith('Got:')) msg = msg.substring(4).trim();

  // Skip non-detection messages (noise filtering)
  const skipPatterns = [
    'Ready', 'LoRa Ready', 'entry', 'rst:', 'configsip:', 'clk_drv:', 
    'load:', 'ho ', 'mode:', 'E BOD', 'rmt:', 'tuya-convert', 'boot:', 
    'LoRa', 'Brownout', 'detector', 'triggered'
  ];
  if (msg === '' || skipPatterns.some(p => msg.includes(p))) return null;

  const parts = msg.split(':');
  if (parts.length < 2) return null;

  let source, category, confidence;

  if (parts.length >= 3 && (parts[0] === 'CAM' || parts[0] === 'AUD')) {
    // Full format: SOURCE:CATEGORY:CONFIDENCE
    source     = parts[0];
    category   = parts[1].trim();
    confidence = parts[2] || '0%';
  } else if (parts.length === 2) {
    // Simple format: LABEL:CONFIDENCE (from basic ESP32 code)
    source     = 'CAM';
    category   = parts[0].trim();
    confidence = parts[1].trim();
  } else {
    return null;
  }

  // Fix common character corruption/transmission errors
  const categoryCorrections = {
    '$peech': 'Speech',
    'peech': 'Speech',
    'Human': 'Human',
    'Vehicle': 'Vehicle',
    'Fire': 'Fire',
  };
  category = categoryCorrections[category] || category;

  // Skip if couldn't parse source properly
  if (!source || source.length === 0 || !category || category.length === 0) return null;

  // All detections come from the sender node via the receiver
  const nodeId = 'SENDER-NODE';
  const node = NODES[nodeId];

  const detection = {
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    source,
    category,
    confidence,
    threat: classifyThreat(source, category),
    icon: getIcon(source, category),
    nodeId,
    lat: node.lat,
    lng: node.lng,
    zone: node.zone,
    env: node.env,
    raw: msg,
  };

  detections.unshift(detection);
  if (detections.length > MAX_DETECTIONS) detections.length = MAX_DETECTIONS;

  // Update node status
  nodeStatus[nodeId] = {
    lastSeen: detection.timestamp,
    lastCategory: category,
    lastSource: source,
    lastConfidence: confidence,
    lastThreat: detection.threat,
    totalDetections: (nodeStatus[nodeId]?.totalDetections || 0) + 1,
  };

  // Also mark receiver as active (it relayed the data)
  nodeStatus['RECEIVER-NODE'] = {
    lastSeen: detection.timestamp,
    lastCategory: `Relayed: ${category}`,
    lastThreat: 'info',
    totalDetections: (nodeStatus['RECEIVER-NODE']?.totalDetections || 0) + 1,
  };

  console.log(`  [DETECT] ${source}:${category}:${confidence} → ${detection.threat}`);

  return detection;
}

// ── Serial Port (ESP32) ──
let serialConnected = false;
const SERIAL_PORT = process.env.SERIAL_PORT || 'COM4';
const SERIAL_BAUD = parseInt(process.env.SERIAL_BAUD || '115200');

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
      if (detection) {
        io.emit('new-detection', detection);
        io.emit('stats-update', computeStats());
      }
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
    console.log('  [SERIAL] Waiting for live data from ESP32...');
    serialConnected = false;
  }
}

// ── Compute Stats / Insights ──
function computeStats() {
  const now = Date.now();
  const last24h = detections.filter(d => now - new Date(d.timestamp).getTime() < 86400000);
  const lastHour = detections.filter(d => now - new Date(d.timestamp).getTime() < 3600000);

  const categoryCounts = {};
  const sourceCounts = { CAM: 0, AUD: 0 };
  const threatCounts = { critical: 0, warning: 0, info: 0 };
  const hourlyBuckets = {};
  const zoneCounts = {};

  last24h.forEach(d => {
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

  const hourlyData = [];
  for (let h = 0; h < 24; h++) {
    hourlyData.push({ hour: h, count: hourlyBuckets[h] || 0 });
  }

  const hotspots = Object.entries(zoneCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const activeNodes = Object.keys(nodeStatus).length;

  return {
    total24h: last24h.length,
    totalHour: lastHour.length,
    totalAll: detections.length,
    threatCounts,
    sourceCounts,
    topCategories,
    hourlyData,
    hotspots,
    activeNodes,
    totalNodes: Object.keys(NODES).length,
  };
}

// ── Socket.IO ──
io.on('connection', (socket) => {
  console.log(`  [WS] Client connected: ${socket.id}`);

  socket.emit('init', {
    detections: detections.slice(0, 50),
    nodes: NODES,
    nodeStatus,
    stats: computeStats(),
    serialConnected,
  });

  socket.on('disconnect', () => {
    console.log(`  [WS] Client disconnected: ${socket.id}`);
  });
});

// ── API Routes ──
app.get('/api/detections', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(detections.slice(0, limit));
});

app.get('/api/stats', (req, res) => {
  res.json(computeStats());
});

app.get('/api/nodes', (req, res) => {
  res.json({ nodes: NODES, status: nodeStatus });
});

// ── Data Injection API (bypass serial port) ──
app.post('/api/inject', (req, res) => {
  const raw = req.body.data;
  if (!raw) {
    return res.status(400).json({ error: 'Missing data field' });
  }

  console.log(`  [INJECT] ${raw}`);
  const detection = processDetection(raw);
  
  if (detection) {
    io.emit('new-detection', detection);
    io.emit('stats-update', computeStats());
    res.json({ success: true, detection });
  } else {
    res.status(400).json({ error: 'Could not parse detection data' });
  }
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ──
server.listen(PORT, () => {
  console.log('\n  ╔══════════════════════════════════════════════╗');
  console.log('  ║   WildSenseAI — VanRakshak Server             ║');
  console.log('  ╠══════════════════════════════════════════════╣');
  console.log(`  ║   Website:   http://localhost:${PORT}              ║`);
  console.log(`  ║   Dashboard: http://localhost:${PORT}/dashboard    ║`);
  console.log(`  ║   Serial:    ${SERIAL_PORT} @ ${SERIAL_BAUD}                  ║`);
  console.log('  ╚══════════════════════════════════════════════╝\n');
  initSerial();
});
