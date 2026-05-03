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
    { overview:'Overview', map:'Node Map', alerts:'Live Alerts', insights:'Insights', graph:'AI Forest Query', prediction:'Prediction Zones', nodes:'Nodes' }[name] || name;

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

// Nitte Meenakshi Institute of Technology (NMIT), Yelahanka, Bangalore.
const NMIT_CENTER = [13.1186, 77.6002];
const NMIT_ZOOM = 18;

const ZONE_PALETTE = {
  'Z-KABINI':        '#3fb950',
  'Z-BANDIPUR-CORE': '#e8612d',
  'Z-MOYAR':         '#d29922',
  'Z-MUDUMALAI':     '#bc8cff',
  'Z-FARM-BUFFER':   '#79c0ff',
  'Z-WATCH-RIDGE':   '#f85149',
  'Z-WATERHOLE':     '#58a6ff',
};

let miniZoneLayer, fullZoneLayer;
let miniMeshLayer, fullMeshLayer;

function nodeNumber(id) {
  if (id === 'SENDER-NODE') return 'TX';
  if (id === 'RECEIVER-NODE') return 'RX';
  const m = String(id).match(/(\d+)/);
  return m ? m[1].padStart(2, '0') : id;
}

function nodeColor(id, status) {
  if (status) return threatColor(status.lastThreat);
  if (id === 'SENDER-NODE') return '#e8612d';
  if (id === 'RECEIVER-NODE') return '#58a6ff';
  const node = nodes[id];
  if (node && ZONE_PALETTE[node.zoneId]) return ZONE_PALETTE[node.zoneId];
  return '#58a6ff';
}

function buildNodeIcon(id, status, { pulse = false } = {}) {
  const color = nodeColor(id, status);
  const size = 32;
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};
      border:3px solid #ffffff44;
      box-shadow:0 0 18px ${color}aa, 0 0 0 2px ${color}33;
      display:flex;align-items:center;justify-content:center;
      font-size:11px;font-weight:800;color:#fff;
      font-family:'JetBrains Mono',monospace;letter-spacing:0.5px;
      ${pulse ? 'animation: pulse 1s ease 3;' : ''}
    ">${nodeNumber(id)}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function nodePopupHTML(id, node, status) {
  const color = nodeColor(id, status);
  const lastSeen = status ? `
    <div style="margin-top:6px;color:${color};font-weight:600">Last: ${status.lastCategory}</div>
    <div style="color:#6e7681;font-size:.78rem">${status.totalDetections} detections · ${timeAgo(status.lastSeen)}</div>
  ` : '<div style="margin-top:6px;color:#6e7681">Waiting for data...</div>';

  return `
    <strong style="font-size:1rem">${id}</strong>
    <span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:4px;background:${color}33;color:${color};font-size:.65rem;font-weight:700">${node.zoneId || ''}</span><br/>
    <div style="color:#e8612d;font-weight:600">${node.role || 'AI Detection Node'}</div>
    <div style="color:#6e7681;font-size:.78rem">${node.device || ''}</div>
    <div style="color:#c9d1d9;font-size:.82rem;margin-top:2px">${node.zone}</div>
    <div style="color:#6e7681;font-size:.72rem;font-family:'JetBrains Mono',monospace">${node.lat.toFixed(5)}, ${node.lng.toFixed(5)} · battery ${node.battery ?? '—'}%</div>
    ${lastSeen}
  `;
}

function drawZoneOverlays(map) {
  // Build a flat list of zone center points by averaging the nodes inside each zone.
  const zones = {};
  Object.values(nodes).forEach((n) => {
    const z = zones[n.zoneId] = zones[n.zoneId] || {
      zoneId: n.zoneId,
      name: n.zone,
      latSum: 0,
      lngSum: 0,
      count: 0,
    };
    z.latSum += n.lat;
    z.lngSum += n.lng;
    z.count += 1;
  });

  const layer = L.layerGroup();
  Object.values(zones).forEach((z) => {
    const lat = z.latSum / z.count;
    const lng = z.lngSum / z.count;
    const color = ZONE_PALETTE[z.zoneId] || '#e8612d';

    const circle = L.circle([lat, lng], {
      radius: 35, // ~35 m, fits a campus zone block
      color,
      weight: 1.5,
      fillColor: color,
      fillOpacity: 0.10,
      dashArray: '4 4',
    });
    circle.bindTooltip(`<b>${z.name}</b><br/><span style="color:#6e7681">${z.zoneId}</span>`,
      { direction: 'top', offset: [0, -2], className: 'zone-tooltip' });
    layer.addLayer(circle);
  });

  layer.addTo(map);
  return layer;
}

function drawMeshLinks(map) {
  // Single LoRa link between TX and RX (the only two nodes in the demo).
  const tx = nodes['SENDER-NODE'];
  const rx = nodes['RECEIVER-NODE'];
  if (!tx || !rx) return null;

  const layer = L.layerGroup();

  // Glow under the link
  L.polyline([[tx.lat, tx.lng], [rx.lat, rx.lng]], {
    color: '#e8612d',
    weight: 6,
    opacity: 0.18,
  }).addTo(layer);

  // Main dashed link
  L.polyline([[tx.lat, tx.lng], [rx.lat, rx.lng]], {
    color: '#e8612d',
    weight: 2,
    opacity: 0.85,
    dashArray: '8 6',
  }).addTo(layer).bindTooltip('LoRa link · TX → RX', { sticky: true, className: 'zone-tooltip' });

  layer.addTo(map);
  return layer;
}

function fitToNodes(map) {
  const points = Object.values(nodes).map((n) => [n.lat, n.lng]);
  if (!points.length) return;
  const bounds = L.latLngBounds(points).pad(0.35);
  map.fitBounds(bounds, { maxZoom: 19 });
}

function initMaps() {
  // Mini map — campus-block view of NMIT
  if (!miniMap) {
    miniMap = L.map('miniMap', { zoomControl: false, attributionControl: false }).setView(NMIT_CENTER, NMIT_ZOOM);
    createDarkTiles().addTo(miniMap);
  }

  // Full map
  if (!fullMap) {
    fullMap = L.map('fullMap', { attributionControl: false }).setView(NMIT_CENTER, NMIT_ZOOM);
    createDarkTiles().addTo(fullMap);
  }

  // Clear any previous overlays before re-adding (idempotent on re-init).
  [miniZoneLayer, fullZoneLayer, miniMeshLayer, fullMeshLayer].forEach((l) => l && l.remove());
  Object.values(miniMarkers).forEach((m) => m.remove());
  Object.values(fullMarkers).forEach((m) => m.remove());
  miniMarkers = {};
  fullMarkers = {};

  // Zone overlays + mesh links
  miniZoneLayer = drawZoneOverlays(miniMap);
  fullZoneLayer = drawZoneOverlays(fullMap);
  miniMeshLayer = drawMeshLinks(miniMap);
  fullMeshLayer = drawMeshLinks(fullMap);

  // Add node markers
  Object.entries(nodes).forEach(([id, node]) => {
    addNodeMarker(id, node, miniMap, miniMarkers);
    addNodeMarker(id, node, fullMap, fullMarkers);
  });

  // Fit bounds so all nodes are visible.
  fitToNodes(miniMap);
  fitToNodes(fullMap);
}

function addNodeMarker(id, node, map, markersObj) {
  const status = nodeStatus[id];
  const marker = L.marker([node.lat, node.lng], { icon: buildNodeIcon(id, status) }).addTo(map);
  marker.bindPopup(nodePopupHTML(id, node, status));
  markersObj[id] = marker;
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

  const status = nodeStatus[nodeId];
  [miniMarkers, fullMarkers].forEach((markers) => {
    if (!markers[nodeId]) return;
    markers[nodeId].setIcon(buildNodeIcon(nodeId, status, { pulse: true }));
    markers[nodeId].setPopupContent(nodePopupHTML(nodeId, node, status));
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
  const center = NMIT_CENTER;

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

  predictionMap = L.map('predictionMap', { attributionControl: false }).setView(NMIT_CENTER, NMIT_ZOOM);
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
    const icon = L.divIcon({
      className: '',
      html: `<div class="prediction-node-icon">${nodeNumber(id)}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
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

// ═══════ AI QUERY (NEO4J + GROQ) ═══════

const graphStatusEl = document.getElementById('graphStatus');
const streamStatusEl = document.getElementById('streamStatus');
const seedNoteEl = document.getElementById('graphSeedResult');
const agentAnswerEl = document.getElementById('agentAnswer');
const graphQuestionEl = document.getElementById('graphQuestion');
const graphFormEl = document.getElementById('graphQueryForm');

function renderGraphStatus(status) {
  if (!graphStatusEl) return;
  if (!status) {
    graphStatusEl.innerHTML = `<span class="status-dot offline"></span><span>Checking graph connection...</span>`;
    return;
  }

  const ok = status.configured && status.connected;
  const cls = ok ? 'ok' : (status.configured ? 'warn' : 'err');
  const dotCls = ok ? 'online' : (status.configured ? 'demo' : 'offline');
  const label = ok ? 'CONNECTED' : (status.configured ? 'NOT VERIFIED' : 'NOT CONFIGURED');
  const detail = status.message
    || (status.uri ? `${status.uri} · db: ${status.database || 'neo4j'}` : 'Set NEO4J_* in .env');

  graphStatusEl.innerHTML = `
    <span class="status-dot ${dotCls}"></span>
    <span>${detail}</span>
    <span class="status-pill ${cls}">${label}</span>
  `;
}

function renderStreamStatus(status) {
  if (!streamStatusEl) return;
  if (!status || !status.running) {
    streamStatusEl.innerHTML = `<span class="status-dot offline"></span><span>Stream stopped</span>`;
    return;
  }
  streamStatusEl.innerHTML = `
    <span class="status-dot online"></span>
    <span>Streaming · ${status.emitted || 0} events emitted · every ${(status.intervalMs/1000).toFixed(1)}s</span>
  `;
}

function setSeedNote(html, kind) {
  if (!seedNoteEl) return;
  const cls = kind === 'success' ? 'note-success' : kind === 'error' ? 'note-error' : '';
  seedNoteEl.innerHTML = `<span class="${cls}">${html}</span>`;
}

async function callGraphApi(path, options = {}) {
  const res = await fetch(path, options);
  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok && !data.error) data.error = `HTTP ${res.status}`;
  return data;
}

async function refreshGraphStatus() {
  try {
    const data = await callGraphApi('/api/graph/status');
    renderGraphStatus(data);
  } catch (err) {
    renderGraphStatus({ configured: false, connected: false, message: err.message });
  }
}

const verifyBtn = document.getElementById('verifyGraphBtn');
if (verifyBtn) {
  verifyBtn.addEventListener('click', async () => {
    verifyBtn.disabled = true;
    setSeedNote(`<span class="spinner"></span>Verifying Neo4j connection...`);
    try {
      const data = await callGraphApi('/api/graph/verify');
      renderGraphStatus(data);
      if (data.connected) setSeedNote('Connection verified.', 'success');
      else setSeedNote(data.error || data.message || 'Could not verify.', 'error');
    } catch (err) {
      setSeedNote(`Verify failed: ${err.message}`, 'error');
    } finally {
      verifyBtn.disabled = false;
    }
  });
}

const seedBtn = document.getElementById('seedGraphBtn');
if (seedBtn) {
  seedBtn.addEventListener('click', async () => {
    seedBtn.disabled = true;
    setSeedNote(`<span class="spinner"></span>Exporting 19 nodes, zones, animals, and detections to Neo4j...`);
    try {
      const data = await callGraphApi('/api/graph/seed', { method: 'POST' });
      if (data.success) {
        setSeedNote(`
          <strong>Graph exported successfully.</strong>
          <div class="seed-summary">
            <div class="seed-stat"><span class="seed-stat-value">${data.nodes}</span><span class="seed-stat-label">Forest Nodes</span></div>
            <div class="seed-stat"><span class="seed-stat-value">${data.zones}</span><span class="seed-stat-label">Zones</span></div>
            <div class="seed-stat"><span class="seed-stat-value">${data.animals}</span><span class="seed-stat-label">Animals</span></div>
            <div class="seed-stat"><span class="seed-stat-value">${data.detections}</span><span class="seed-stat-label">Detections</span></div>
          </div>
        `, 'success');
        refreshGraphStatus();
      } else {
        setSeedNote(`Seeding failed: ${data.error || 'unknown error'}`, 'error');
      }
    } catch (err) {
      setSeedNote(`Seeding failed: ${err.message}`, 'error');
    } finally {
      seedBtn.disabled = false;
    }
  });
}

const startStreamBtn = document.getElementById('startStreamBtn');
if (startStreamBtn) {
  startStreamBtn.addEventListener('click', async () => {
    const intervalMs = parseInt(document.getElementById('streamInterval').value, 10);
    try {
      const data = await callGraphApi('/api/stream/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMs }),
      });
      renderStreamStatus(data);
    } catch (err) {
      renderStreamStatus({ running: false });
    }
  });
}

const stopStreamBtn = document.getElementById('stopStreamBtn');
if (stopStreamBtn) {
  stopStreamBtn.addEventListener('click', async () => {
    try {
      const data = await callGraphApi('/api/stream/stop', { method: 'POST' });
      renderStreamStatus(data);
    } catch (err) {
      renderStreamStatus({ running: false });
    }
  });
}

document.querySelectorAll('.prompt-chips button[data-question]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (graphQuestionEl) graphQuestionEl.value = btn.dataset.question;
    submitAgentQuery(btn.dataset.question);
  });
});

if (graphFormEl) {
  graphFormEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = graphQuestionEl?.value?.trim();
    if (!q) return;
    submitAgentQuery(q);
  });
}

function appendAgentBlock({ question, answer, cypher, records, error }) {
  if (!agentAnswerEl) return;

  const placeholder = agentAnswerEl.querySelector('.placeholder');
  if (placeholder) placeholder.remove();

  const block = document.createElement('div');
  block.className = `agent-block ${error ? 'error' : ''}`;
  const recordCount = Array.isArray(records) ? records.length : 0;
  const recordPreview = recordCount
    ? JSON.stringify(records.slice(0, 8), null, 2)
    : '(no rows returned)';

  block.innerHTML = `
    <div class="agent-question"><strong>${escapeHtml(question)}</strong></div>
    <div class="agent-text">${escapeHtml(answer || '(no answer)')}</div>
    ${cypher ? `<details><summary><i class="fas fa-code"></i> Cypher used</summary><div class="agent-cypher">${escapeHtml(cypher)}</div></details>` : ''}
    ${recordCount ? `<details><summary><i class="fas fa-table"></i> ${recordCount} graph row${recordCount === 1 ? '' : 's'}</summary><div class="agent-records">${escapeHtml(recordPreview)}</div></details>` : ''}
  `;
  agentAnswerEl.prepend(block);
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function submitAgentQuery(question) {
  if (!agentAnswerEl) return;
  const placeholder = agentAnswerEl.querySelector('.placeholder');
  if (placeholder) placeholder.remove();

  const submitBtn = graphFormEl?.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  const loading = document.createElement('div');
  loading.className = 'agent-block';
  loading.innerHTML = `
    <div class="agent-question"><strong>${escapeHtml(question)}</strong></div>
    <div class="agent-text"><span class="spinner"></span>Asking the Groq + Neo4j agent...</div>
  `;
  agentAnswerEl.prepend(loading);

  try {
    const data = await callGraphApi('/api/agent/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    loading.remove();
    appendAgentBlock({
      question,
      answer: data.answer,
      cypher: data.cypher,
      records: data.records,
      error: data.error,
    });
  } catch (err) {
    loading.remove();
    appendAgentBlock({ question, answer: err.message, error: err.message });
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (graphQuestionEl) graphQuestionEl.value = '';
  }
}

// Stream + graph status push from server
socket.on('stream-status', renderStreamStatus);

// Pull initial graph + stream state on first connect.
(function initGraphPanel() {
  refreshGraphStatus();
  callGraphApi('/api/stream/status').then(renderStreamStatus).catch(() => {});
})();

// Use the graph status emitted in the socket init payload, if present.
const _origInitHandler = socket.listeners('init')[0];
if (!socket._graphInitPatched) {
  socket._graphInitPatched = true;
  socket.on('init', (data) => {
    if (data && data.graph) renderGraphStatus(data.graph);
    if (data && data.stream) renderStreamStatus(data.stream);
  });
}

// ═══════ REFRESH TIMES ═══════
setInterval(() => {
  document.querySelectorAll('.alert-entry-time').forEach(el => {
    // Times auto-refresh would need stored timestamps; skip for now
  });
}, 30000);
