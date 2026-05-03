// Thin proxy to the Python Groq + Neo4j RAG agent in python_agent/.
// The dashboard hits /api/agent/ask on this Node server, which forwards
// the question to the Python service and returns its response unchanged.

const graph = require('./graphService');

const PY_AGENT_URL = process.env.PY_AGENT_URL || 'http://127.0.0.1:8000';
const REQUEST_TIMEOUT_MS = parseInt(process.env.PY_AGENT_AGENT_TIMEOUT_MS || '60000', 10);

let lastAgentStatus = {
  framework: 'Groq + Neo4j Graph RAG (Python)',
  model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  llmConfigured: false,
  graph: graph.graphStatus(),
  reachable: false,
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

function agentStatus() {
  return lastAgentStatus;
}

async function refreshAgentStatus() {
  try {
    const data = await pyFetch('/status');
    lastAgentStatus = { ...data, reachable: true };
  } catch (err) {
    lastAgentStatus = {
      ...lastAgentStatus,
      reachable: false,
      error: err.message,
      graph: graph.graphStatus(),
    };
  }
  return lastAgentStatus;
}

async function askForestAgent(question) {
  try {
    const result = await pyFetch('/agent/ask', {
      method: 'POST',
      body: { question },
    });
    if (result && result.agent) lastAgentStatus = { ...result.agent, reachable: true };
    return result;
  } catch (err) {
    return {
      question,
      answer: `Python agent unreachable at ${PY_AGENT_URL}. Start it with: cd python_agent && uvicorn app:app --port 8000`,
      cypher: '',
      records: [],
      error: err.message,
      agent: { ...lastAgentStatus, reachable: false },
    };
  }
}

refreshAgentStatus().catch(() => {});

module.exports = {
  agentStatus,
  refreshAgentStatus,
  askForestAgent,
};
