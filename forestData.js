const GRAPH_ID = process.env.GRAPH_ID || 'vanrakshak-india-demo';

// All seven zones are clustered tightly inside the Nitte Meenakshi
// Institute of Technology (NMIT) Bangalore campus block (Yelahanka).
// Center reference: 13.1186 N, 77.6002 E.
const FOREST_ZONES = [
  {
    id: 'Z-KABINI',
    name: 'NMIT North-West Grove',
    habitat: 'campus tree line and shaded walkway',
    risk: 'perimeter intrusion and crowd overflow',
    lat: 13.1192,
    lng: 77.5996,
  },
  {
    id: 'Z-BANDIPUR-CORE',
    name: 'NMIT Central Quad',
    habitat: 'main academic block and central lawn',
    risk: 'movement overlap and after-hours intrusion',
    lat: 13.1191,
    lng: 77.6005,
  },
  {
    id: 'Z-MOYAR',
    name: 'NMIT North-East Field',
    habitat: 'open field and dry edge near boundary wall',
    risk: 'fire risk and unauthorized entry',
    lat: 13.1189,
    lng: 77.6011,
  },
  {
    id: 'Z-MUDUMALAI',
    name: 'NMIT East Gate Watch',
    habitat: 'main gate corridor and vehicle path',
    risk: 'vehicle intrusion and after-hours logging trucks',
    lat: 13.1182,
    lng: 77.6010,
  },
  {
    id: 'Z-FARM-BUFFER',
    name: 'NMIT South Buffer',
    habitat: 'south-side perimeter and adjoining settlement',
    risk: 'human intrusion from settlement side',
    lat: 13.1180,
    lng: 77.6002,
  },
  {
    id: 'Z-WATCH-RIDGE',
    name: 'NMIT South-West Ridge',
    habitat: 'elevated patrol path and watch point',
    risk: 'acoustic anomaly and gunshot/voice detection',
    lat: 13.1182,
    lng: 77.5995,
  },
  {
    id: 'Z-WATERHOLE',
    name: 'NMIT Central Pond',
    habitat: 'campus pond and surrounding grazing patch',
    risk: 'predator-prey concentration around water',
    lat: 13.1186,
    lng: 77.6000,
  },
];

const INDIAN_ANIMALS = [
  {
    name: 'Bengal Tiger',
    category: 'Tiger',
    conservationStatus: 'Endangered',
    activity: 'dawn, dusk, and night',
    signs: ['alarm calls', 'pugmarks', 'scrape marks'],
    zones: ['Z-BANDIPUR-CORE', 'Z-WATERHOLE', 'Z-WATCH-RIDGE'],
  },
  {
    name: 'Asian Elephant',
    category: 'Elephant',
    conservationStatus: 'Endangered',
    activity: 'late evening and early morning',
    signs: ['low rumbles', 'broken bamboo', 'dung trail'],
    zones: ['Z-KABINI', 'Z-FARM-BUFFER', 'Z-WATERHOLE'],
  },
  {
    name: 'Indian Leopard',
    category: 'Leopard',
    conservationStatus: 'Vulnerable',
    activity: 'night',
    signs: ['coughing call', 'tree drag marks', 'scat'],
    zones: ['Z-MUDUMALAI', 'Z-WATCH-RIDGE', 'Z-FARM-BUFFER'],
  },
  {
    name: 'Sloth Bear',
    category: 'Sloth Bear',
    conservationStatus: 'Vulnerable',
    activity: 'night and early morning',
    signs: ['digging marks', 'huffing calls', 'termite mound damage'],
    zones: ['Z-MOYAR', 'Z-WATERHOLE', 'Z-MUDUMALAI'],
  },
  {
    name: 'Gaur',
    category: 'Gaur',
    conservationStatus: 'Vulnerable',
    activity: 'morning and late evening',
    signs: ['hoof marks', 'grazing patches', 'snorts'],
    zones: ['Z-WATERHOLE', 'Z-KABINI', 'Z-BANDIPUR-CORE'],
  },
  {
    name: 'Dhole',
    category: 'Dhole',
    conservationStatus: 'Endangered',
    activity: 'daytime pack movement',
    signs: ['whistles', 'group tracks', 'chase calls'],
    zones: ['Z-BANDIPUR-CORE', 'Z-MOYAR', 'Z-WATERHOLE'],
  },
  {
    name: 'Sambar Deer',
    category: 'Sambar Deer',
    conservationStatus: 'Vulnerable',
    activity: 'dusk and night',
    signs: ['alarm barks', 'hoof marks', 'browse lines'],
    zones: ['Z-WATERHOLE', 'Z-BANDIPUR-CORE', 'Z-KABINI'],
  },
  {
    name: 'Chital',
    category: 'Chital',
    conservationStatus: 'Least Concern',
    activity: 'daytime and dusk',
    signs: ['herd calls', 'grazing clusters', 'alarm calls'],
    zones: ['Z-WATERHOLE', 'Z-KABINI', 'Z-FARM-BUFFER'],
  },
  {
    name: 'Nilgai',
    category: 'Nilgai',
    conservationStatus: 'Least Concern',
    activity: 'daytime',
    signs: ['hoof marks', 'crop edge feeding', 'snorts'],
    zones: ['Z-FARM-BUFFER', 'Z-MOYAR'],
  },
  {
    name: 'Indian Peafowl',
    category: 'Peafowl',
    conservationStatus: 'Least Concern',
    activity: 'morning and evening',
    signs: ['loud calls', 'roosting trees', 'feathers'],
    zones: ['Z-FARM-BUFFER', 'Z-WATCH-RIDGE', 'Z-MOYAR'],
  },
  {
    name: 'Grey Langur',
    category: 'Langur',
    conservationStatus: 'Least Concern',
    activity: 'daytime',
    signs: ['canopy calls', 'alarm calls', 'branch movement'],
    zones: ['Z-KABINI', 'Z-MUDUMALAI', 'Z-WATCH-RIDGE'],
  },
  {
    name: 'Great Hornbill',
    category: 'Hornbill',
    conservationStatus: 'Vulnerable',
    activity: 'morning canopy movement',
    signs: ['wing beats', 'canopy calls', 'fruit tree visits'],
    zones: ['Z-KABINI', 'Z-MUDUMALAI'],
  },
  {
    name: 'Wild Boar',
    category: 'Wild Boar',
    conservationStatus: 'Least Concern',
    activity: 'night and dawn',
    signs: ['rooting marks', 'grunts', 'crop edge movement'],
    zones: ['Z-FARM-BUFFER', 'Z-MOYAR', 'Z-WATERHOLE'],
  },
];

const EVENT_CATEGORIES = [
  { source: 'CAM', category: 'Bengal Tiger', confidence: [82, 98], weight: 9 },
  { source: 'CAM', category: 'Asian Elephant', confidence: [84, 99], weight: 11 },
  { source: 'CAM', category: 'Indian Leopard', confidence: [75, 94], weight: 7 },
  { source: 'CAM', category: 'Sloth Bear', confidence: [72, 93], weight: 6 },
  { source: 'CAM', category: 'Gaur', confidence: [78, 96], weight: 7 },
  { source: 'CAM', category: 'Dhole', confidence: [70, 92], weight: 5 },
  { source: 'CAM', category: 'Sambar Deer', confidence: [80, 97], weight: 8 },
  { source: 'CAM', category: 'Chital', confidence: [80, 97], weight: 8 },
  { source: 'AUD', category: 'Peafowl', confidence: [68, 91], weight: 6 },
  { source: 'AUD', category: 'Hornbill', confidence: [70, 90], weight: 4 },
  { source: 'AUD', category: 'Langur', confidence: [76, 94], weight: 5 },
  { source: 'CAM', category: 'Human', confidence: [70, 96], weight: 4 },
  { source: 'AUD', category: 'Chainsaw', confidence: [78, 98], weight: 3 },
  { source: 'AUD', category: 'Gunshot', confidence: [82, 99], weight: 2 },
  { source: 'CAM', category: 'Logging Vehicle', confidence: [72, 95], weight: 2 },
  { source: 'SENS', category: 'Fire', confidence: [74, 98], weight: 2 },
  { source: 'AUD', category: 'Silence Anomaly', confidence: [65, 90], weight: 2 },
];

function createIndiaNodes() {
  // Two-node demo: SENDER and RECEIVER, ~80 m apart on the NMIT campus block.
  // Other 17 nodes will be added back as the deployment grows.
  const layout = [
    {
      id: 'SENDER-NODE',
      zoneId: 'Z-KABINI',
      latOffset: 0.0,
      lngOffset: 0.0,
      role: 'LoRa Sender (TX)',
      device: 'ESP32 + PIR + Camera + Mic + LoRa SX1278',
      battery: 86,
    },
    {
      id: 'RECEIVER-NODE',
      zoneId: 'Z-BANDIPUR-CORE',
      latOffset: 0.0,
      lngOffset: 0.0,
      role: 'LoRa Gateway (RX)',
      device: 'Raspberry Pi 5 + LoRa SX1278 + Edge AI',
      battery: 94,
    },
  ];

  return layout.reduce((acc, item) => {
    const zone = FOREST_ZONES.find((z) => z.id === item.zoneId);
    acc[item.id] = {
      lat: zone.lat + item.latOffset,
      lng: zone.lng + item.lngOffset,
      zone: zone.name,
      zoneId: item.zoneId,
      env: 'NMIT Bangalore Campus Block Demo',
      device: item.device,
      role: item.role,
      battery: item.battery,
    };
    return acc;
  }, {});
}

function getAnimalByCategory(category) {
  return INDIAN_ANIMALS.find((animal) => animal.name === category || animal.category === category);
}

function weightedPick(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.random() * total;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) return item;
  }
  return items[items.length - 1];
}

function randomConfidence(range) {
  const [min, max] = range;
  return `${Math.floor(min + Math.random() * (max - min + 1))}%`;
}

function createFakeEvent(nodes) {
  const event = weightedPick(EVENT_CATEGORIES);
  const nodeEntries = Object.entries(nodes);
  const animal = getAnimalByCategory(event.category);
  let candidates = nodeEntries;

  if (animal) {
    candidates = nodeEntries.filter(([, node]) => animal.zones.includes(node.zoneId));
  } else if (event.category === 'Chainsaw' || event.category === 'Logging Vehicle') {
    candidates = nodeEntries.filter(([, node]) => ['Z-MUDUMALAI', 'Z-MOYAR'].includes(node.zoneId));
  } else if (event.category === 'Human') {
    candidates = nodeEntries.filter(([, node]) => ['Z-FARM-BUFFER', 'Z-WATCH-RIDGE', 'Z-MUDUMALAI'].includes(node.zoneId));
  } else if (event.category === 'Fire') {
    candidates = nodeEntries.filter(([, node]) => ['Z-MOYAR', 'Z-WATCH-RIDGE'].includes(node.zoneId));
  }

  const [nodeId, node] = candidates[Math.floor(Math.random() * candidates.length)];
  return {
    nodeId,
    source: event.source,
    category: event.category,
    confidence: randomConfidence(event.confidence),
    zone: node.zone,
    zoneId: node.zoneId,
    lat: node.lat,
    lng: node.lng,
    env: node.env,
    raw: `${nodeId}:${event.source}:${event.category}`,
  };
}

module.exports = {
  GRAPH_ID,
  FOREST_ZONES,
  INDIAN_ANIMALS,
  EVENT_CATEGORIES,
  createIndiaNodes,
  createFakeEvent,
  getAnimalByCategory,
};
