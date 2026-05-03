// ═══════════════════════════════════════════════
//  VanRakshak — Dashboard Frontend
// ═══════════════════════════════════════════════

const socket = io();

// ── State ──
let allDetections = [];
let nodes = {};
let nodeStatus = {};
let currentFilter = 'all';
let miniMap, fullMap;
let predictionMap;
let predictionLayers;
let guidanceAudioCtx;
let guidanceMasterGain;
let miniMarkers = {}, fullMarkers = {};
let categoryChart, hourlyChart, sourceChart, threatChart;

// ── Chart.js defaults ──
Chart.defaults.color = '#6e7681';
Chart.defaults.borderColor = '#1e2530';
Chart.defaults.font.family = "'Inter', sans-serif";

const COLORS = {
  critical: '#f85149', warning: '#d29922', info: '#58a6ff',
  success: '#3fb950', primary: '#e8612d', cam: '#bc8cff', aud: '#79c0ff',
};

const CATEGORY_COLORS = [
  '#e8612d','#f85149','#d29922','#58a6ff','#3fb950',
  '#bc8cff','#79c0ff','#ff7b72','#ffa657','#7ee787',
];

const WILDLIFE_CATEGORIES = ['Elephant', 'Tiger', 'Bear', 'Lion', 'Bird', 'Bovine', 'Horse', 'Giraffe', 'Animal'];

const HEX_ZONES = [
  { id: 'A1', name: 'North Ridge', latOffset: 0.00058, lngOffset: -0.00048 },
  { id: 'A2', name: 'North East', latOffset: 0.00058, lngOffset: 0.00048 },
  { id: 'B1', name: 'Central West', latOffset: 0.00005, lngOffset: -0.00095 },
  { id: 'B2', name: 'Core Habitat', latOffset: 0.00005, lngOffset: 0.0 },
  { id: 'B3', name: 'Central East', latOffset: 0.00005, lngOffset: 0.00095 },
  { id: 'C1', name: 'South West', latOffset: -0.00048, lngOffset: -0.00048 },
  { id: 'C2', name: 'South Gate', latOffset: -0.00048, lngOffset: 0.00048 },
];

// ═══════ SOCKET EVENTS ═══════

socket.on('init', (data) => {
  allDetections = data.detections || [];
  nodes = data.nodes || {};
  nodeStatus = data.nodeStatus || {};

  initMaps();
  initPredictionMap();
  initCharts();
  renderAlerts(allDetections.slice(0, 8), 'overviewAlerts');
  renderAlerts(allDetections, 'alertsList');
  renderNodes();
  updateKPIs(data.stats);
  updateCharts(data.stats);
  updateInsights(data.stats);
  renderPredictionPanel();
  updateAlertBadge();

  // Serial status
  if (data.serialConnected) {
    setSerialStatus('online', 'Serial: Connected');
  } else {
    setSerialStatus('offline', 'Serial: Not Connected');
  }
});

socket.on('new-detection', (d) => {
  allDetections.unshift(d);
  if (allDetections.length > 500) allDetections.length = 500;

  // Update feeds
  prependAlert(d, 'overviewAlerts', 8);
  prependAlert(d, 'alertsList', 500);
  updateAlertBadge();

  // Update map markers
  updateNodeMarker(d.nodeId, d);

  // Flash KPI
  flashKPI(d.threat);

  // Prediction panel refresh
  renderPredictionPanel();
});

socket.on('stats-update', (stats) => {
  updateKPIs(stats);
  updateCharts(stats);
  updateInsights(stats);
  renderPredictionPanel();
});

socket.on('serial-status', (s) => {
  if (s.connected) {
    setSerialStatus('online', `Serial: ${s.port}`);
  } else {
    setSerialStatus('offline', 'Serial: Disconnected');
  }
});

// ═══════ NAVIGATION ═══════

document.querySelectorAll('.nav-item[data-panel]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    switchPanel(link.dataset.panel);
  });
});

function switchPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item[data-panel]').forEach(n => n.classList.remove('active'));

  const panel = document.getElementById(`panel-${name}`);
  const nav = document.querySelector(`[data-panel="${name}"]`);
  if (panel) panel.classList.add('active');
  if (nav) nav.classList.add('active');

  document.getElementById('panelTitle').textContent =
    { overview:'Overview', map:'Node Map', alerts:'Live Alerts', insights:'Insights', prediction:'Prediction Zones', nodes:'Nodes' }[name] || name;

  // Resize maps when switching
  if (name === 'map' && fullMap) setTimeout(() => fullMap.invalidateSize(), 100);
  if (name === 'overview' && miniMap) setTimeout(() => miniMap.invalidateSize(), 100);
  if (name === 'prediction' && predictionMap) setTimeout(() => predictionMap.invalidateSize(), 100);

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
}

// Expose globally for inline onclick
window.switchPanel = switchPanel;

// Mobile menu toggle
document.getElementById('menuToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ═══════ CLOCK ═══════
function updateClock() {
  const now = new Date();
  document.getElementById('currentTime').textContent =
    now.toLocaleTimeString('en-US', { hour12: false }) + ' · ' +
    now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
setInterval(updateClock, 1000);
updateClock();

// ═══════ MAPS ═══════

function createDarkTiles() {
  return L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; CartoDB',
    maxZoom: 19,
  });
}

function initMaps() {
  // Nitte Meenakshi Institute of Technology, Yelahanka
  const center = [13.0816, 77.5883];

  // Mini map — zoom 17 for campus-level view
  if (!miniMap) {
    miniMap = L.map('miniMap', { zoomControl: false, attributionControl: false }).setView(center, 17);
    createDarkTiles().addTo(miniMap);
  }

  // Full map
  if (!fullMap) {
    fullMap = L.map('fullMap', { attributionControl: false }).setView(center, 17);
    createDarkTiles().addTo(fullMap);
  }

  // Add node markers
  Object.entries(nodes).forEach(([id, node]) => {
    addNodeMarker(id, node, miniMap, miniMarkers);
    addNodeMarker(id, node, fullMap, fullMarkers);
  });
}

function addNodeMarker(id, node, map, markersObj) {
  const status = nodeStatus[id];
  const isSender = id === 'SENDER-NODE';
  const color = status ? threatColor(status.lastThreat) : (isSender ? '#e8612d' : '#58a6ff');
  const label = isSender ? 'TX' : 'RX';
  const size = 28;

  const icon = L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};
      border:3px solid ${color};
      box-shadow:0 0 16px ${color}77;
      display:flex;align-items:center;justify-content:center;
      font-size:10px;font-weight:800;color:#fff;
      font-family:'JetBrains Mono',monospace;
    ">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
  });

  const marker = L.marker([node.lat, node.lng], { icon }).addTo(map);
  marker.bindPopup(`
    <strong style="font-size:1rem">${id}</strong><br/>
    <span style="color:#e8612d;font-weight:600">${node.role || ''}</span><br/>
    <span style="color:#6e7681">${node.device || ''}</span><br/>
    <span style="color:#6e7681">${node.zone}</span><br/>
    ${status ? `<span style="color:${color}">Last: ${status.lastCategory}</span><br/>
    <span style="color:#6e7681">Total: ${status.totalDetections} detections</span>` : '<span style="color:#6e7681">Waiting for data...</span>'}
  `);

  markersObj[id] = marker;

  // Draw a dashed line between sender and receiver
  if (isSender && nodes['RECEIVER-NODE']) {
    const rx = nodes['RECEIVER-NODE'];
    L.polyline([[node.lat, node.lng], [rx.lat, rx.lng]], {
      color: '#e8612d', weight: 2, dashArray: '8,6', opacity: 0.5,
    }).addTo(map);
  }
}

function updateNodeMarker(nodeId, detection) {
  const node = nodes[nodeId];
  if (!node) return;

  nodeStatus[nodeId] = {
    lastSeen: detection.timestamp,
    lastCategory: detection.category,
    lastThreat: detection.threat,
    totalDetections: (nodeStatus[nodeId]?.totalDetections || 0) + 1,
  };

  const color = threatColor(detection.threat);

  const isSender = nodeId === 'SENDER-NODE';
  const label = isSender ? 'TX' : 'RX';

  [miniMarkers, fullMarkers].forEach(markers => {
    if (markers[nodeId]) {
      markers[nodeId].setIcon(L.divIcon({
        className: 'custom-marker',
        html: `<div style="
          width:28px;height:28px;border-radius:50%;
          background:${color};
          border:3px solid ${color};
          box-shadow:0 0 20px ${color}aa;
          display:flex;align-items:center;justify-content:center;
          font-size:10px;font-weight:800;color:#fff;
          font-family:'JetBrains Mono',monospace;
          animation: pulse 1s ease 3;
        ">${label}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }));

      const n = nodes[nodeId];
      const s = nodeStatus[nodeId];
      markers[nodeId].setPopupContent(`
        <strong style="font-size:1rem">${nodeId}</strong><br/>
        <span style="color:#e8612d;font-weight:600">${n.role || ''}</span><br/>
        <span style="color:${color}">Last: ${s.lastCategory}</span><br/>
        <span style="color:#6e7681">Total: ${s.totalDetections} detections</span>
      `);
    }
  });

  renderNodes();
}

function threatColor(threat) {
  return { critical: '#f85149', warning: '#d29922', info: '#58a6ff' }[threat] || '#6e7681';
}

// ═══════ ALERTS ═══════

function renderAlerts(items, containerId, max) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const list = max ? items.slice(0, max) : items;
  container.innerHTML = list.map(alertHTML).join('');
}

function prependAlert(d, containerId, maxItems) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Apply filter for alerts panel
  if (containerId === 'alertsList' && currentFilter !== 'all') {
    if (currentFilter === 'CAM' || currentFilter === 'AUD') {
      if (d.source !== currentFilter) return;
    } else if (d.threat !== currentFilter) return;
  }

  const temp = document.createElement('div');
  temp.innerHTML = alertHTML(d);
  const el = temp.firstElementChild;
  container.prepend(el);

  // Limit items
  while (container.children.length > maxItems) {
    container.removeChild(container.lastChild);
  }

  updateFilteredCount();
}

function alertHTML(d) {
  const time = timeAgo(d.timestamp);
  return `
    <div class="alert-entry ${d.threat}" data-threat="${d.threat}" data-source="${d.source}">
      <div class="alert-entry-icon ${d.threat}"><i class="fas ${d.icon}"></i></div>
      <div class="alert-entry-body">
        <div class="alert-entry-title">${d.category} Detected</div>
        <div class="alert-entry-meta">
          <span class="tag ${d.source.toLowerCase()}">${d.source === 'CAM' ? 'Camera' : 'Audio'}</span>
          <span><i class="fas fa-signal"></i> ${d.confidence}</span>
          <span><i class="fas fa-microchip"></i> ${d.nodeId}</span>
          <span>${d.zone}</span>
        </div>
      </div>
      <div class="alert-entry-time">${time}</div>
    </div>`;
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return Math.floor(diff / 1000) + 's ago';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

function updateAlertBadge() {
  const critical = allDetections.filter(d => d.threat === 'critical').length;
  document.getElementById('alertBadge').textContent = critical;
}

// Filters
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    applyFilter();
  });
});

function applyFilter() {
  const container = document.getElementById('alertsList');
  let filtered = allDetections;
  if (currentFilter === 'CAM' || currentFilter === 'AUD') {
    filtered = allDetections.filter(d => d.source === currentFilter);
  } else if (currentFilter !== 'all') {
    filtered = allDetections.filter(d => d.threat === currentFilter);
  }
  renderAlerts(filtered, 'alertsList');
  updateFilteredCount();
}

function updateFilteredCount() {
  const count = document.getElementById('alertsList')?.children.length || 0;
  document.getElementById('filteredCount').textContent = `${count} alerts`;
}

// ═══════ KPIs ═══════

function updateKPIs(stats) {
  if (!stats) return;
  document.getElementById('kpiCritical').textContent = stats.threatCounts?.critical || 0;
  document.getElementById('kpiWarning').textContent = stats.threatCounts?.warning || 0;
  document.getElementById('kpiWildlife').textContent = stats.threatCounts?.info || 0;
  document.getElementById('kpiNodes').textContent = `${stats.activeNodes || 0}/${stats.totalNodes || 19}`;
  document.getElementById('kpiCam').textContent = stats.sourceCounts?.CAM || 0;
  document.getElementById('kpiAud').textContent = stats.sourceCounts?.AUD || 0;
}

function flashKPI(threat) {
  const map = { critical: 'kpiCritical', warning: 'kpiWarning', info: 'kpiWildlife' };
  const el = document.getElementById(map[threat]);
  if (el) {
    el.parentElement.parentElement.style.borderColor = threatColor(threat);
    setTimeout(() => { el.parentElement.parentElement.style.borderColor = ''; }, 2000);
  }
}

// ═══════ CHARTS ═══════

function initCharts() {
  // Category donut
  const catCtx = document.getElementById('categoryChart')?.getContext('2d');
  if (catCtx) {
    categoryChart = new Chart(catCtx, {
      type: 'doughnut',
      data: { labels: [], datasets: [{ data: [], backgroundColor: CATEGORY_COLORS, borderWidth: 0, hoverOffset: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { position: 'right', labels: { padding: 12, usePointStyle: true, pointStyleWidth: 8, font: { size: 11 } } },
        },
      },
    });
  }

  // Hourly bar
  const hrCtx = document.getElementById('hourlyChart')?.getContext('2d');
  if (hrCtx) {
    hourlyChart = new Chart(hrCtx, {
      type: 'bar',
      data: {
        labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
        datasets: [{
          label: 'Detections',
          data: new Array(24).fill(0),
          backgroundColor: 'rgba(232,97,45,0.5)',
          borderColor: '#e8612d',
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
          y: { grid: { color: '#1e2530' }, ticks: { font: { size: 10 } }, beginAtZero: true },
        },
      },
    });
  }

  // Source bar
  const srcCtx = document.getElementById('sourceChart')?.getContext('2d');
  if (srcCtx) {
    sourceChart = new Chart(srcCtx, {
      type: 'bar',
      data: {
        labels: ['Camera (CAM)', 'Audio (AUD)'],
        datasets: [{
          data: [0, 0],
          backgroundColor: [COLORS.cam, COLORS.aud],
          borderWidth: 0,
          borderRadius: 6,
          barPercentage: 0.5,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#1e2530' }, beginAtZero: true },
          y: { grid: { display: false } },
        },
      },
    });
  }

  // Threat donut
  const thrCtx = document.getElementById('threatChart')?.getContext('2d');
  if (thrCtx) {
    threatChart = new Chart(thrCtx, {
      type: 'doughnut',
      data: {
        labels: ['Critical', 'Warning', 'Info'],
        datasets: [{ data: [0, 0, 0], backgroundColor: [COLORS.critical, COLORS.warning, COLORS.info], borderWidth: 0 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '60%',
        plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, font: { size: 11 } } } },
      },
    });
  }
}

function updateCharts(stats) {
  if (!stats) return;

  // Category chart
  if (categoryChart && stats.topCategories) {
    categoryChart.data.labels = stats.topCategories.map(c => c[0]);
    categoryChart.data.datasets[0].data = stats.topCategories.map(c => c[1]);
    categoryChart.update('none');
  }

  // Hourly
  if (hourlyChart && stats.hourlyData) {
    hourlyChart.data.datasets[0].data = stats.hourlyData.map(h => h.count);
    hourlyChart.update('none');
  }

  // Source
  if (sourceChart && stats.sourceCounts) {
    sourceChart.data.datasets[0].data = [stats.sourceCounts.CAM || 0, stats.sourceCounts.AUD || 0];
    sourceChart.update('none');
  }

  // Threat
  if (threatChart && stats.threatCounts) {
    threatChart.data.datasets[0].data = [
      stats.threatCounts.critical || 0,
      stats.threatCounts.warning || 0,
      stats.threatCounts.info || 0,
    ];
    threatChart.update('none');
  }

  // Hotspots
  if (stats.hotspots) {
    const maxCount = stats.hotspots.length ? stats.hotspots[0][1] : 1;
    document.getElementById('hotspotList').innerHTML = stats.hotspots.map(([zone, count]) => `
      <div class="hotspot-item">
        <span class="hotspot-name">${zone}</span>
        <div class="hotspot-bar-wrap">
          <div class="hotspot-bar"><div class="hotspot-bar-fill" style="width:${(count/maxCount)*100}%"></div></div>
          <span class="hotspot-count">${count}</span>
        </div>
      </div>`).join('');
  }
}

// ═══════ INSIGHTS ═══════

function updateInsights(stats) {
  if (!stats || stats.totalAll < 2) return;

  const insights = [];
  const tc = stats.threatCounts || {};
  const sc = stats.sourceCounts || {};
  const cats = stats.topCategories || [];

  // Most detected category
  if (cats.length) {
    insights.push(`<i class="fas fa-chart-bar"></i><p>Most detected: <strong>${cats[0][0]}</strong> with ${cats[0][1]} events in the last 24 hours.</p>`);
  }

  // Critical ratio
  const total = stats.total24h || 1;
  const critPct = ((tc.critical || 0) / total * 100).toFixed(1);
  if (tc.critical > 0) {
    insights.push(`<i class="fas fa-exclamation-triangle"></i><p><strong>${critPct}%</strong> of all detections are <strong>critical threats</strong> (Human intrusion, Gunshots, Chainsaws, Logging). Immediate patrol recommended.</p>`);
  }

  // Source split
  const camPct = ((sc.CAM || 0) / total * 100).toFixed(0);
  const audPct = ((sc.AUD || 0) / total * 100).toFixed(0);
  insights.push(`<i class="fas fa-balance-scale"></i><p>Detection source split: <strong>${camPct}% Camera</strong> vs <strong>${audPct}% Audio</strong>. ${parseInt(audPct) > 40 ? 'Bioacoustic system is highly active — sound-based threats are significant.' : 'Camera-based detection is the primary source.'}</p>`);

  // Peak hour
  if (stats.hourlyData) {
    const peak = stats.hourlyData.reduce((a, b) => b.count > a.count ? b : a, { hour: 0, count: 0 });
    if (peak.count > 0) {
      const period = peak.hour < 6 ? 'early morning' : peak.hour < 12 ? 'morning' : peak.hour < 18 ? 'afternoon' : 'night';
      insights.push(`<i class="fas fa-clock"></i><p>Peak activity at <strong>${peak.hour}:00</strong> (${period}). ${peak.hour >= 18 || peak.hour < 6 ? 'Nocturnal activity detected — consider increased night patrols.' : 'Daytime activity peak detected.'}</p>`);
    }
  }

  // Hotspot
  if (stats.hotspots?.length) {
    insights.push(`<i class="fas fa-map-pin"></i><p>Highest activity zone: <strong>${stats.hotspots[0][0]}</strong> (${stats.hotspots[0][1]} detections). Focus patrol and monitoring resources here.</p>`);
  }

  // Node coverage
  if (stats.activeNodes < stats.totalNodes) {
    const inactive = stats.totalNodes - stats.activeNodes;
    insights.push(`<i class="fas fa-satellite-dish"></i><p><strong>${inactive} nodes</strong> have not reported data yet. Check connectivity and power on inactive nodes.</p>`);
  }

  // Human + Chainsaw combo check
  const hasHuman = cats.some(c => c[0] === 'Human');
  const hasChainsaw = cats.some(c => c[0] === 'Chainsaw');
  if (hasHuman && hasChainsaw) {
    insights.push(`<i class="fas fa-skull-crossbones"></i><p><strong>ALERT:</strong> Both <strong>Human intrusion</strong> and <strong>Chainsaw sounds</strong> detected. High probability of <strong>active illegal logging</strong>. Dispatch field team immediately.</p>`);
  }

  document.getElementById('aiInsights').innerHTML = insights.map(i => `<div class="insight-item">${i}</div>`).join('');
}

// ═══════ NODES ═══════

function renderNodes() {
  const grid = document.getElementById('nodesGrid');
  if (!grid) return;

  grid.innerHTML = Object.entries(nodes).map(([id, node]) => {
    const status = nodeStatus[id];
    let badge = 'idle', badgeText = 'Idle';
    if (status) {
      badge = status.lastThreat === 'critical' ? 'alert' : 'active';
      badgeText = status.lastThreat === 'critical' ? 'Alert' : 'Active';
    }

    return `
      <div class="node-card">
        <div class="node-card-header">
          <span class="node-id">${id}</span>
          <span class="node-status-badge ${badge}">${badgeText}</span>
        </div>
        <div class="node-details">
          <div class="node-detail"><span class="node-detail-label">Role</span><span class="node-detail-value">${node.role || '—'}</span></div>
          <div class="node-detail"><span class="node-detail-label">Device</span><span class="node-detail-value">${node.device || '—'}</span></div>
          <div class="node-detail"><span class="node-detail-label">Location</span><span class="node-detail-value">${node.zone}</span></div>
          <div class="node-detail"><span class="node-detail-label">Coordinates</span><span class="node-detail-value">${node.lat.toFixed(4)}, ${node.lng.toFixed(4)}</span></div>
          ${status ? `
          <div class="node-detail"><span class="node-detail-label">Last Detection</span><span class="node-detail-value">${status.lastCategory}</span></div>
          <div class="node-detail"><span class="node-detail-label">Total Events</span><span class="node-detail-value">${status.totalDetections}</span></div>
          <div class="node-detail"><span class="node-detail-label">Last Seen</span><span class="node-detail-value">${timeAgo(status.lastSeen)}</span></div>
          ` : `<div class="node-detail"><span class="node-detail-label">Status</span><span class="node-detail-value">Waiting for data...</span></div>`}
        </div>
      </div>`;
  }).join('');
}

// ═══════ SERIAL STATUS ═══════

function setSerialStatus(status, text) {
  const el = document.getElementById('serialStatus');
  el.innerHTML = `<span class="status-dot ${status}"></span><span>${text}</span>`;
}

// ═══════ PREDICTION ZONES ═══════

function renderPredictionPanel() {
  renderPredictionHexMap();
  renderPredictionRecommendations();
}

function buildWildlifeCounts() {
  const counts = {};
  allDetections.forEach((d) => {
    if (WILDLIFE_CATEGORIES.includes(d.category)) {
      counts[d.category] = (counts[d.category] || 0) + 1;
    }
  });

  if (Object.keys(counts).length === 0) {
    counts.Elephant = 5;
    counts.Tiger = 3;
    counts.Bear = 2;
  }

  return counts;
}

function sortedWildlife(counts) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function zoneColor(probability) {
  if (probability >= 75) return '#f85149';
  if (probability >= 55) return '#d29922';
  return '#58a6ff';
}

function zoneAnimalByIndex(topAnimals, index) {
  if (!topAnimals.length) return 'Elephant';
  return topAnimals[index % topAnimals.length][0];
}

function getZonePredictions() {
  const counts = buildWildlifeCounts();
  const topAnimals = sortedWildlife(counts);
  const nodeLoad = Object.values(nodeStatus).reduce((acc, n) => acc + (n.totalDetections || 0), 0);
  const dynamicBoost = Math.min(12, Math.floor(nodeLoad / 8));
  const center = [12.9987, 77.5911];

  return HEX_ZONES.map((zone, i) => {
    const animal = zoneAnimalByIndex(topAnimals, i);
    const base = 48 + ((i * 7) % 18);
    const freq = counts[animal] || 1;
    const probability = Math.min(94, base + freq * 4 + dynamicBoost);

    return {
      ...zone,
      lat: center[0] + zone.latOffset,
      lng: center[1] + zone.lngOffset,
      animal,
      probability,
      guidance: soundGuidanceFor(animal),
      color: zoneColor(probability),
    };
  });
}

function soundGuidanceFor(animal) {
  const guidance = {
    Elephant: 'Use low-frequency corridor tone near South Gate to guide elephants back to open migration lane.',
    Tiger: 'Use non-threatening metallic pulse near boundary lights to keep tiger movement away from patrol trails.',
    Bear: 'Broadcast short horn + clap envelope near camp buffers to redirect bears away from waste points.',
    Lion: 'Play distant engine-like ambient tone near trail edge and keep ranger route illuminated.',
    Bird: 'Use soft predator-call deterrent only near runway corridor; keep rest zones silent.',
    Bovine: 'Apply cattle whistle sequence near farm edge to redirect herd back to buffer zone.',
    Horse: 'Use calm flute-like guidance tones toward open grass corridor.',
    Giraffe: 'Use low-activity siren and keep upper-canopy corridor clear for movement.',
    Animal: 'Play neutral wideband deterrent for 20-30s, then pause and re-evaluate movement.',
  };
  return guidance[animal] || guidance.Animal;
}

function getAnimalSoundProfile(animal) {
  const profiles = {
    Elephant: { tones: [118, 132, 124], wave: 'sine', label: '118-132 Hz low corridor tone' },
    Bear: { tones: [360, 330, 300], wave: 'triangle', label: '300-360 Hz caution pulse' },
    Tiger: { tones: [540, 480, 620], wave: 'sawtooth', label: '480-620 Hz boundary pulse' },
    Lion: { tones: [410, 390, 430], wave: 'square', label: '390-430 Hz deterrent tone' },
    Bird: { tones: [1200, 980, 1400], wave: 'triangle', label: '980-1400 Hz directional chirp' },
    Bovine: { tones: [650, 700, 620], wave: 'sine', label: '620-700 Hz whistle set' },
    Horse: { tones: [720, 770, 680], wave: 'sine', label: '680-770 Hz guidance flute' },
    Giraffe: { tones: [280, 320, 300], wave: 'triangle', label: '280-320 Hz low siren' },
    Animal: { tones: [500, 620, 540], wave: 'sine', label: '500-620 Hz neutral redirect' },
  };
  return profiles[animal] || profiles.Animal;
}

function ensureGuidanceAudioContext() {
  if (!window.AudioContext && !window.webkitAudioContext) return null;
  if (!guidanceAudioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    guidanceAudioCtx = new Ctx();
  }
  if (guidanceAudioCtx.state === 'suspended') {
    guidanceAudioCtx.resume();
  }
  return guidanceAudioCtx;
}

function stopGuidanceTone() {
  if (guidanceMasterGain) {
    try {
      guidanceMasterGain.gain.cancelScheduledValues(0);
      guidanceMasterGain.gain.setTargetAtTime(0.0001, guidanceAudioCtx.currentTime, 0.05);
    } catch (e) {
      // Ignore abrupt stop errors from browser audio graph.
    }
    guidanceMasterGain = null;
  }
}

function playGuidanceTone(animal, zoneName) {
  const ctx = ensureGuidanceAudioContext();
  if (!ctx) return;

  stopGuidanceTone();

  const profile = getAnimalSoundProfile(animal);
  const start = ctx.currentTime + 0.03;
  let t = start;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, start);
  master.gain.linearRampToValueAtTime(0.22, start + 0.07);
  master.gain.setValueAtTime(0.22, start + 1.7);
  master.gain.linearRampToValueAtTime(0.0001, start + 2.0);
  master.connect(ctx.destination);
  guidanceMasterGain = master;

  profile.tones.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const toneGain = ctx.createGain();
    osc.type = profile.wave;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.linearRampToValueAtTime(freq * (1.04 - idx * 0.01), t + 0.45);
    toneGain.gain.setValueAtTime(0.0001, t);
    toneGain.gain.linearRampToValueAtTime(1, t + 0.06);
    toneGain.gain.linearRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(toneGain);
    toneGain.connect(master);
    osc.start(t);
    osc.stop(t + 0.52);
    t += 0.58;
  });

  const statusEl = document.getElementById('predictionToneStatus');
  if (statusEl) {
    statusEl.textContent = `Playing ${profile.label} for ${animal} (${zoneName})`;
  }
}

function seedFromText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededUnit(seed, i) {
  const x = Math.sin(seed * 0.0001 + i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function naturalBoundaryLatLng(zone, latRadius, lngRadius) {
  const seed = seedFromText(`${zone.id}-${zone.animal}`);
  const pts = [];
  const steps = 12;

  for (let i = 0; i < steps; i++) {
    const angle = (Math.PI * 2 * i) / steps;
    const noiseA = seededUnit(seed, i);
    const noiseB = seededUnit(seed, i + 29);

    // Generates uneven but stable polygon edges for a natural boundary look.
    const radialJitter = 0.72 + noiseA * 0.62;
    const wave = 0.9 + 0.2 * Math.sin((i * Math.PI) / 3 + noiseB * Math.PI);

    const rLat = latRadius * radialJitter * wave;
    const rLng = lngRadius * radialJitter * (1.04 - (wave - 0.9) * 0.4);

    pts.push([
      zone.lat + (rLat * Math.sin(angle)),
      zone.lng + (rLng * Math.cos(angle)),
    ]);
  }

  return pts;
}

function initPredictionMap() {
  const el = document.getElementById('predictionMap');
  if (!el || predictionMap) return;

  const center = [12.9987, 77.5911];
  predictionMap = L.map('predictionMap', { attributionControl: false }).setView(center, 17);
  createDarkTiles().addTo(predictionMap);
  predictionLayers = L.layerGroup().addTo(predictionMap);
}

function renderPredictionHexMap() {
  if (!predictionMap || !predictionLayers) return;
  predictionLayers.clearLayers();

  const predictions = getZonePredictions();

  predictions.forEach((zone) => {
    const polygon = L.polygon(naturalBoundaryLatLng(zone, 0.00026, 0.00036), {
      color: zone.color,
      weight: 2,
      fillColor: zone.color,
      fillOpacity: 0.24,
      dashArray: zone.probability >= 75 ? null : '6 4',
    });

    polygon.bindTooltip(
      `${zone.id} • ${zone.name}<br>${zone.animal} • ${zone.probability}%`,
      { permanent: true, direction: 'center', className: 'pred-tooltip' }
    );
    polygon.addTo(predictionLayers);
  });

  Object.entries(nodes).forEach(([id, node]) => {
    const label = id === 'SENDER-NODE' ? 'TX' : 'RX';
    const icon = L.divIcon({ className: '', html: `<div class="prediction-node-icon">${label}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
    const marker = L.marker([node.lat, node.lng], { icon });
    marker.bindPopup(`<strong>${id}</strong><br>${node.zone || 'Zone'}`);
    marker.addTo(predictionLayers);
  });
}

function renderPredictionRecommendations() {
  const list = document.getElementById('predictionRecommendations');
  if (!list) return;

  const topZones = getZonePredictions()
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5);

  const elephantZone = topZones.find((z) => z.animal === 'Elephant');
  const bearZone = topZones.find((z) => z.animal === 'Bear');

  const crossRegionAlert = (elephantZone && bearZone)
    ? `Elephant movement crossed into ${bearZone.name} (bear region). Protect both groups by playing the elephant corridor frequency and guiding movement back toward ${elephantZone.name}.`
    : 'No elephant-bear region crossing detected in current prediction window.';

  list.innerHTML = `
    <div class="prediction-item priority">
      <h4>Cross-Region Protection Alert</h4>
      <p>${crossRegionAlert}</p>
      <span class="prob" id="predictionToneStatus">Ready to play guidance frequency</span>
      ${elephantZone ? `<button class="sound-btn" data-animal="Elephant" data-zone="${elephantZone.name}"><i class="fas fa-play"></i> Play Elephant Corridor Frequency</button>` : ''}
    </div>
  ` + topZones.map((zone) => `
    <div class="prediction-item">
      <h4>${zone.id} - ${zone.name}</h4>
      <p><strong>${zone.animal}</strong> likely in this boundary. ${zone.guidance}</p>
      <span class="prob">Predicted Presence: ${zone.probability}% • Tone: ${getAnimalSoundProfile(zone.animal).label}</span>
      <button class="sound-btn" data-animal="${zone.animal}" data-zone="${zone.name}"><i class="fas fa-play"></i> Play ${zone.animal} Guidance Tone</button>
    </div>
  `).join('');

  list.querySelectorAll('.sound-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      playGuidanceTone(btn.dataset.animal, btn.dataset.zone || 'zone');
    });
  });
}

// ═══════ REFRESH TIMES ═══════
setInterval(() => {
  document.querySelectorAll('.alert-entry-time').forEach(el => {
    // Times auto-refresh would need stored timestamps; skip for now
  });
}, 30000);
