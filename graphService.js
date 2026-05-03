// Thin proxy that forwards all Neo4j graph operations to the Python service
// in python_agent/. The Python side owns the Neo4j driver, the seed data,
// and the Groq agent — this file just keeps server.js call sites stable.

const PY_AGENT_URL = process.env.PY_AGENT_URL || 'http://127.0.0.1:8000';
const REQUEST_TIMEOUT_MS = parseInt(process.env.PY_AGENT_TIMEOUT_MS || '15000', 10);

let lastStatus = {
  configured: false,
  connected: false,
  message: 'Python agent not contacted yet.',
  uri: null,
  database: null,
  graphId: process.env.GRAPH_ID || 'vanrakshak-india-demo',
};

async function pyFetch(path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${PY_AGENT_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const detail = data && data.detail ? data.detail : `HTTP ${res.status}`;
      throw new Error(detail);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function graphStatus() {
  return lastStatus;
}

async function refreshStatus() {
  try {
    const data = await pyFetch('/graph/status');
    lastStatus = { ...data };
    return lastStatus;
  } catch (err) {
    lastStatus = {
      configured: false,
      connected: false,
      message: `Python agent unreachable at ${PY_AGENT_URL} (${err.message})`,
      graphId: lastStatus.graphId,
    };
    return lastStatus;
  }
}

async function verifyGraph() {
  try {
    const data = await pyFetch('/graph/verify');
    lastStatus = { ...lastStatus, ...data };
    return lastStatus;
  } catch (err) {
    lastStatus = { ...lastStatus, connected: false, message: err.message };
    throw err;
  }
}

async function seedGraph() {
  return pyFetch('/graph/seed', { method: 'POST' });
}

async function saveDetection(detection) {
  // Map the Node-side detection shape to what the Python endpoint expects.
  await pyFetch('/graph/detection', {
    method: 'POST',
    body: {
      id: String(detection.id),
      nodeId: detection.nodeId,
      zoneId: detection.zoneId,
      timestamp: detection.timestamp,
      source: detection.source,
      category: detection.category,
      confidence: detection.confidence,
      threat: detection.threat,
      raw: detection.raw || '',
    },
  });
}

async function closeGraph() {
  // Nothing to close on the Node side — the Python service owns the driver.
}

// Kick off an initial status refresh so /api/graph/status returns useful info
// after server boot, even before anyone hits /api/graph/verify.
refreshStatus().catch(() => {});

module.exports = {
  graphStatus,
  refreshStatus,
  verifyGraph,
  seedGraph,
  saveDetection,
  closeGraph,
};
