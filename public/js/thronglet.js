// StateLoop Thronglet UI
const API_BASE = '/api';
let currentCase = null;
let canvas, ctx;
let bufferCanvas, bufferCtx;  // Double buffering to avoid tearing
let pollInterval = null;
let logPollInterval = null;
let backgroundRefreshInterval = null;

// Audio/Speech state
let audioEnabled = true; // Audio on by default
let lastSpokenMessageId = null;
let availableVoices = [];
let agentVoiceSettings = {}; // Maps agent ID to voice settings
let isSpeaking = false;
let speechEndTime = 0;
const SPEECH_GAP_MS = 1500; // Gap after speech before next poll
const BUBBLE_LINGER_MS = 15000; // Keep speech bubble visible for 15 seconds after audio ends
let bubbleHideTime = 0; // When to hide the speech bubble
let userHasInteracted = false; // Track if user has clicked (needed for browser autoplay policy)

// Message Queue state - displays messages one at a time
let messageQueue = [];
let currentDisplayMessage = null;
let displayedMessageIds = new Set();  // Track ALL displayed messages to prevent re-queuing
let isDisplayingMessage = false;
let waitingForSpeech = false; // True when waiting for speech to complete
const MESSAGE_DISPLAY_MIN_MS = 3000; // Minimum time to display each message (without audio)
const MESSAGE_DISPLAY_MS_PER_WORD = 300; // Additional time per word (average reading ~200 wpm = 300ms/word)
const MESSAGE_DISPLAY_MAX_MS = 15000; // Maximum display time for very long messages
const MESSAGE_GAP_AFTER_SPEECH_MS = 1000; // Gap after speech ends before next message starts
let messageDisplayStartTime = 0;
let currentMessageDisplayDuration = MESSAGE_DISPLAY_MIN_MS;

// Calculate display time based on message length
function calculateDisplayTime(message) {
  if (!message || !message.content) return MESSAGE_DISPLAY_MIN_MS;
  const wordCount = message.content.split(/\s+/).filter(w => w.length > 0).length;
  const calculatedTime = MESSAGE_DISPLAY_MIN_MS + (wordCount * MESSAGE_DISPLAY_MS_PER_WORD);
  return Math.min(calculatedTime, MESSAGE_DISPLAY_MAX_MS);
}

// Selection state
let selectedAgentId = null;

// Camera/zoom state
let camera = {
  x: 0,
  y: 0,
  zoom: 1,
  targetX: 0,
  targetY: 0,
  targetZoom: 1,
  isZoomedIn: false
};

// Agent visual state - populated dynamically from case participants
const agents = {};

// Idle actions - more variety!
const idleActions = [
  'standing', 'looking', 'wandering', 'checking_phone', 'stretching', 'waving',
  'looking_at_option', 'yawning', 'tapping_foot', 'scratching_head', 'crossing_arms',
  'looking_at_watch', 'humming', 'pacing', 'jumping', 'sitting', 'daydreaming', 'chitchat'
];

// Scale for thronglet size (1.6 = 160% of original size)
const THRONGLET_SCALE = 1.6;

// View mode: '2d' or '3d' (isometric)
let viewMode = '2d';

// Option card positions (displayed on screen for voting/selection)
const optionPositions = [
  { x: 180, y: 120 },
  { x: 350, y: 100 },
  { x: 520, y: 120 }
];

// Location/environment configuration - extracted from scenario
let currentLocation = {
  type: 'park',      // park, hospital, office, cafe, school, library
  name: '',          // e.g., "South Bristol Hospital"
  subtitle: ''       // e.g., "Rehab Ward"
};

// Location type detection keywords
const locationKeywords = {
  hospital: ['hospital', 'ward', 'clinic', 'medical', 'nhs', 'patient', 'nurse', 'rehab'],
  office: ['office', 'workplace', 'meeting room', 'boardroom', 'corporate', 'company'],
  school: ['school', 'classroom', 'teacher', 'student', 'education', 'college'],
  cafe: ['cafe', 'coffee', 'restaurant', 'bistro', 'diner'],
  library: ['library', 'books', 'reading', 'study'],
  park: ['park', 'garden', 'outdoor', 'picnic']
};

// === FURNITURE SYSTEM ===
let furnitureCatalog = null;
let roomFurniture = []; // Furniture items placed in current room
let furnitureViewerOpen = false;
let viewerRotation = 0;
let viewerZoom = 1;
let selectedFurnitureItem = null;

// Load furniture catalog
async function loadFurnitureCatalog() {
  try {
    const res = await fetch('/data/furniture.json');
    furnitureCatalog = await res.json();
    console.log('Furniture catalog loaded:', Object.keys(furnitureCatalog.categories));
  } catch (e) {
    console.warn('Could not load furniture catalog:', e);
    furnitureCatalog = { categories: {} };
  }
}

// Setup room furniture based on location type
function setupRoomFurniture(locationType) {
  roomFurniture = [];
  if (!furnitureCatalog || !furnitureCatalog.categories[locationType]) return;

  const category = furnitureCatalog.categories[locationType];
  const items = category.items || [];

  // Place furniture items in isometric grid
  const baseX = 100;
  const baseY = 150;
  const spacing = 120;

  items.slice(0, 6).forEach((item, index) => {
    const row = Math.floor(index / 3);
    const col = index % 3;
    roomFurniture.push({
      ...item,
      x: baseX + col * spacing,
      y: baseY + row * 100,
      rotation: 0
    });
  });
}

// Setup custom furniture from AI-specified list of item IDs
function setupCustomFurniture(furnitureIds) {
  roomFurniture = [];
  if (!furnitureCatalog || !furnitureIds || furnitureIds.length === 0) return;

  // Build a lookup map of all furniture items across all categories
  const allItems = {};
  for (const category of Object.values(furnitureCatalog.categories)) {
    for (const item of category.items || []) {
      allItems[item.id] = item;
    }
  }

  // Place specified furniture items in isometric grid
  const baseX = 100;
  const baseY = 150;
  const spacing = 120;

  furnitureIds.slice(0, 8).forEach((itemId, index) => {
    const item = allItems[itemId];
    if (!item) {
      console.warn(`Furniture item not found: ${itemId}`);
      return;
    }
    const row = Math.floor(index / 4);
    const col = index % 4;
    roomFurniture.push({
      ...item,
      x: baseX + col * spacing,
      y: baseY + row * 100,
      rotation: 0
    });
  });

  console.log(`Placed ${roomFurniture.length} custom furniture items`);
}

// Draw isometric furniture item
function drawIsometricFurniture(item, x, y, scale = 1, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Isometric transformation
  const isoAngle = Math.PI / 6; // 30 degrees
  const rotRad = rotation * Math.PI / 180;

  // Get dimensions from item size
  const w = item.size?.w || 50;
  const h = item.size?.h || 50;
  const depth = Math.min(w, h) * 0.6;

  // Draw based on furniture type
  switch (item.id) {
    case 'hospital_bed':
      drawIsoBed(w, h, depth);
      break;
    case 'bookshelf':
      drawIsoBookshelf(w, h, depth);
      break;
    case 'conference_table':
    case 'reading_table':
    case 'cafe_table':
      drawIsoTable(w, h, depth);
      break;
    case 'office_chair':
    case 'armchair':
    case 'bar_stool':
      drawIsoChair(w, h, depth);
      break;
    case 'tree':
      drawIsoTree(w, h);
      break;
    case 'window':
      drawIsoWindow(w, h);
      break;
    case 'cafe_counter':
      drawIsoBox(w, 30, depth, '#5d4037');
      break;
    case 'coffee_machine':
      drawIsoBox(w, h, depth, '#1a1a1a');
      break;
    case 'pastry_case':
      drawIsoBox(w, h * 0.7, depth, '#d4a574');
      break;
    case 'menu_board':
    case 'hanging_light':
    case 'quiet_sign':
    case 'clock':
    case 'notice_board':
      // Wall-mounted items - skip in furniture placement (drawn in location)
      break;
    default:
      // Don't draw unknown items as gray boxes
      break;
  }

  ctx.restore();
}

// Isometric box (base for most furniture)
function drawIsoBox(w, h, d, color) {
  const topColor = color;
  const leftColor = shadeColor(color, -20);
  const rightColor = shadeColor(color, -40);

  // Top face
  ctx.fillStyle = topColor;
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(w/2, -h - d/2);
  ctx.lineTo(w, -h);
  ctx.lineTo(w/2, -h + d/2);
  ctx.closePath();
  ctx.fill();

  // Left face
  ctx.fillStyle = leftColor;
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(0, 0);
  ctx.lineTo(w/2, d/2);
  ctx.lineTo(w/2, -h + d/2);
  ctx.closePath();
  ctx.fill();

  // Right face
  ctx.fillStyle = rightColor;
  ctx.beginPath();
  ctx.moveTo(w, -h);
  ctx.lineTo(w, 0);
  ctx.lineTo(w/2, d/2);
  ctx.lineTo(w/2, -h + d/2);
  ctx.closePath();
  ctx.fill();
}

// Hospital bed
function drawIsoBed(w, _h, d) {
  const bedW = w * 0.85;
  const bedD = d * 0.55;
  const frameH = 18;
  const mattressH = 10;

  // Bed frame legs
  ctx.fillStyle = '#909090';
  const legPositions = [
    [2, 0], [bedW - 6, 0],
    [2 + bedD/3, bedD/3], [bedW - 6 + bedD/3, bedD/3]
  ];
  legPositions.forEach(([lx, ly]) => {
    ctx.fillRect(lx, ly - frameH + 5, 4, frameH - 5);
  });

  // Bed frame (metal)
  ctx.save();
  ctx.translate(0, -frameH + 5);
  drawIsoBox(bedW, 5, bedD, '#b0b0b0');
  ctx.restore();

  // Side rails
  ctx.fillStyle = '#c0c0c0';
  ctx.fillRect(0, -frameH, 3, 8);
  ctx.fillRect(bedW - 3, -frameH, 3, 8);

  // Mattress
  ctx.save();
  ctx.translate(3, -frameH);
  drawIsoBox(bedW - 6, mattressH, bedD - 6, '#e3f2fd');
  ctx.restore();

  // Mattress quilting lines
  ctx.strokeStyle = '#bbdefb';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const lineX = 3 + (bedW - 6) * i / 4;
    ctx.beginPath();
    ctx.moveTo(lineX, -frameH - mattressH);
    ctx.lineTo(lineX + bedD/6, -frameH - mattressH + bedD/6);
    ctx.stroke();
  }

  // Pillow
  ctx.save();
  ctx.translate(bedW * 0.55, -frameH - mattressH);
  drawIsoBox(bedW * 0.25, 6, bedD * 0.4, '#ffffff');
  ctx.restore();

  // Pillow indent
  ctx.fillStyle = '#f5f5f5';
  ctx.beginPath();
  ctx.ellipse(bedW * 0.67, -frameH - mattressH - 4, bedW * 0.08, 3, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Blanket fold at foot of bed
  ctx.save();
  ctx.translate(5, -frameH - mattressH + 2);
  drawIsoBox(bedW * 0.35, 4, bedD - 10, '#90caf9');
  ctx.restore();

  // Headboard
  ctx.save();
  ctx.translate(bedW - 5, -frameH - mattressH);
  drawIsoBox(5, 20, bedD, '#78909c');
  ctx.restore();
}

// Bookshelf
function drawIsoBookshelf(w, h, d) {
  const shelfW = w * 0.75;
  const shelfH = h * 0.85;
  const shelfD = d * 0.35;

  // Main frame (dark wood)
  drawIsoBox(shelfW, shelfH, shelfD, '#3e2723');

  // Back panel (slightly lighter)
  ctx.save();
  ctx.translate(2, -2);
  drawIsoBox(shelfW - 4, shelfH - 4, 2, '#4e342e');
  ctx.restore();

  // Shelf dividers (3 shelves)
  const shelfHeights = [shelfH * 0.3, shelfH * 0.55, shelfH * 0.8];
  shelfHeights.forEach(sh => {
    ctx.save();
    ctx.translate(2, -sh);
    drawIsoBox(shelfW - 4, 3, shelfD - 4, '#5d4037');
    ctx.restore();
  });

  // Books on each shelf with varied sizes and colors
  const bookColors = [
    '#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400', '#16a085',
    '#c0392b', '#1565c0', '#2e7d32', '#6a1b9a', '#e65100', '#00838f'
  ];

  const shelfStartHeights = [5, shelfH * 0.32, shelfH * 0.57];
  shelfStartHeights.forEach((startH, shelfIdx) => {
    let bookX = 4;
    const maxX = shelfW - 8;
    const maxBookH = shelfH * 0.22;

    while (bookX < maxX) {
      const bookW = 5 + (bookX * 3 + shelfIdx) % 5;
      const bookH = maxBookH * 0.7 + ((bookX + shelfIdx * 7) % 6) * 2;
      const colorIdx = (bookX + shelfIdx * 4) % bookColors.length;

      ctx.save();
      ctx.translate(bookX, -startH);
      drawIsoBox(bookW, bookH, shelfD * 0.6, bookColors[colorIdx]);
      ctx.restore();

      bookX += bookW + 1;
    }
  });

  // Top molding
  ctx.save();
  ctx.translate(-1, -shelfH - 2);
  drawIsoBox(shelfW + 2, 4, shelfD + 2, '#2e1b14');
  ctx.restore();
}

// Table
function drawIsoTable(w, _h, d) {
  const tableW = w * 0.7;
  const tableD = d * 0.5;
  const legH = 25;

  // Table legs (draw first, behind tabletop)
  ctx.fillStyle = '#5d4037';
  // Back-left leg
  ctx.beginPath();
  ctx.moveTo(3, -legH);
  ctx.lineTo(3, 0);
  ctx.lineTo(7, 2);
  ctx.lineTo(7, -legH + 2);
  ctx.closePath();
  ctx.fill();
  // Back-right leg
  ctx.beginPath();
  ctx.moveTo(tableW - 7, -legH);
  ctx.lineTo(tableW - 7, 0);
  ctx.lineTo(tableW - 3, 2);
  ctx.lineTo(tableW - 3, -legH + 2);
  ctx.closePath();
  ctx.fill();
  // Front-left leg
  ctx.fillStyle = '#4e342e';
  ctx.beginPath();
  ctx.moveTo(3 + tableD/4, -legH + tableD/4);
  ctx.lineTo(3 + tableD/4, tableD/4);
  ctx.lineTo(7 + tableD/4, tableD/4 + 2);
  ctx.lineTo(7 + tableD/4, -legH + tableD/4 + 2);
  ctx.closePath();
  ctx.fill();
  // Front-right leg
  ctx.beginPath();
  ctx.moveTo(tableW - 7 + tableD/4, -legH + tableD/4);
  ctx.lineTo(tableW - 7 + tableD/4, tableD/4);
  ctx.lineTo(tableW - 3 + tableD/4, tableD/4 + 2);
  ctx.lineTo(tableW - 3 + tableD/4, -legH + tableD/4 + 2);
  ctx.closePath();
  ctx.fill();

  // Tabletop
  ctx.save();
  ctx.translate(0, -legH);
  drawIsoBox(tableW, 6, tableD, '#8b6914');
  ctx.restore();

  // Table edge highlight
  ctx.fillStyle = '#a67c00';
  ctx.beginPath();
  ctx.moveTo(0, -legH - 6);
  ctx.lineTo(tableW/2, -legH - 6 - tableD/2);
  ctx.lineTo(tableW/2, -legH - 4 - tableD/2);
  ctx.lineTo(0, -legH - 4);
  ctx.closePath();
  ctx.fill();
}

// Chair
function drawIsoChair(_w, _h, _d) {
  const chairW = 28;
  const chairD = 24;
  const seatH = 18;
  const backH = 22;

  // Chair legs
  ctx.fillStyle = '#1a1a1a';
  const legPositions = [
    [2, 0], [chairW - 6, 0],
    [2 + chairD/3, chairD/3], [chairW - 6 + chairD/3, chairD/3]
  ];
  legPositions.forEach(([lx, ly]) => {
    ctx.fillRect(lx, ly - seatH, 4, seatH);
  });

  // Seat cushion
  ctx.save();
  ctx.translate(0, -seatH);
  drawIsoBox(chairW, 5, chairD, '#34495e');
  ctx.restore();

  // Seat padding highlight
  ctx.save();
  ctx.translate(2, -seatH - 5);
  drawIsoBox(chairW - 4, 2, chairD - 4, '#4a6572');
  ctx.restore();

  // Chair back
  ctx.save();
  ctx.translate(0, -seatH - 5);
  drawIsoBox(chairW, backH, 4, '#2c3e50');
  ctx.restore();

  // Back cushion
  ctx.save();
  ctx.translate(2, -seatH - 3);
  drawIsoBox(chairW - 4, backH - 6, 3, '#34495e');
  ctx.restore();
}

// Tree (for outdoor)
function drawIsoTree(w, h) {
  const trunkW = w * 0.12;
  const trunkH = h * 0.35;

  // Tree shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, 5, w * 0.35, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Trunk with bark texture
  ctx.fillStyle = '#5d4037';
  ctx.fillRect(w * 0.4, -trunkH, trunkW, trunkH);
  ctx.fillStyle = '#4e342e';
  ctx.fillRect(w * 0.4 + trunkW * 0.7, -trunkH, trunkW * 0.3, trunkH);

  // Bark lines
  ctx.strokeStyle = '#3e2723';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(w * 0.42 + i * 2, -trunkH + 5);
    ctx.lineTo(w * 0.42 + i * 2, -5);
    ctx.stroke();
  }

  // Foliage layers (back to front)
  const foliageColors = ['#1b5e20', '#2e7d32', '#388e3c', '#43a047'];

  // Back layer
  ctx.fillStyle = foliageColors[0];
  ctx.beginPath();
  ctx.arc(w * 0.5, -trunkH - h * 0.25, w * 0.32, 0, Math.PI * 2);
  ctx.fill();

  // Middle layers
  ctx.fillStyle = foliageColors[1];
  ctx.beginPath();
  ctx.arc(w * 0.38, -trunkH - h * 0.18, w * 0.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = foliageColors[2];
  ctx.beginPath();
  ctx.arc(w * 0.58, -trunkH - h * 0.2, w * 0.26, 0, Math.PI * 2);
  ctx.fill();

  // Front layer (lighter, highlight)
  ctx.fillStyle = foliageColors[3];
  ctx.beginPath();
  ctx.arc(w * 0.48, -trunkH - h * 0.28, w * 0.22, 0, Math.PI * 2);
  ctx.fill();

  // Top highlight
  ctx.fillStyle = '#4caf50';
  ctx.beginPath();
  ctx.arc(w * 0.45, -trunkH - h * 0.35, w * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

// Window
function drawIsoWindow(w, h) {
  // Window frame (outer)
  ctx.fillStyle = '#eceff1';
  ctx.fillRect(-2, -h - 2, w + 4, h + 4);

  // Window frame shadow
  ctx.fillStyle = '#cfd8dc';
  ctx.fillRect(w, -h, 3, h + 2);
  ctx.fillRect(-2, 0, w + 5, 3);

  // Glass with gradient effect
  const gradient = ctx.createLinearGradient(0, -h, w, 0);
  gradient.addColorStop(0, '#b3e5fc');
  gradient.addColorStop(0.5, '#81d4fa');
  gradient.addColorStop(1, '#4fc3f7');
  ctx.fillStyle = gradient;
  ctx.fillRect(2, -h + 2, w - 4, h - 4);

  // Window reflection
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.moveTo(4, -h + 4);
  ctx.lineTo(w * 0.3, -h + 4);
  ctx.lineTo(4, -h * 0.5);
  ctx.closePath();
  ctx.fill();

  // Cross frame (muntins)
  ctx.fillStyle = '#eceff1';
  ctx.fillRect(w/2 - 2, -h + 2, 4, h - 4);
  ctx.fillRect(2, -h/2 - 2, w - 4, 4);

  // Frame inner shadow
  ctx.strokeStyle = '#90a4ae';
  ctx.lineWidth = 1;
  ctx.strokeRect(2, -h + 2, w - 4, h - 4);
}

// Shade color utility
function shadeColor(color, percent) {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

// === FURNITURE VIEWER MODAL ===
function openFurnitureViewer(item) {
  selectedFurnitureItem = item;
  viewerRotation = 0;
  viewerZoom = 1;
  furnitureViewerOpen = true;

  // Create or show modal
  let modal = document.getElementById('furniture-viewer-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'furniture-viewer-modal';
    modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-lg w-full mx-4">
        <div class="flex justify-between items-center mb-4">
          <h3 id="viewer-title" class="text-xl font-bold"></h3>
          <button onclick="closeFurnitureViewer()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
        </div>
        <div class="relative bg-gray-100 dark:bg-slate-700 rounded-lg" style="height: 300px;">
          <canvas id="furniture-viewer-canvas" width="400" height="300" class="w-full h-full"></canvas>
        </div>
        <p id="viewer-description" class="text-gray-600 dark:text-gray-300 mt-3 text-sm"></p>
        <div class="flex gap-4 mt-4">
          <div class="flex items-center gap-2">
            <span class="text-sm">Rotate:</span>
            <button onclick="rotateFurniture(-45)" class="px-3 py-1 bg-gray-200 dark:bg-slate-600 rounded">&#8634;</button>
            <button onclick="rotateFurniture(45)" class="px-3 py-1 bg-gray-200 dark:bg-slate-600 rounded">&#8635;</button>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm">Zoom:</span>
            <button onclick="zoomFurniture(-0.2)" class="px-3 py-1 bg-gray-200 dark:bg-slate-600 rounded">-</button>
            <button onclick="zoomFurniture(0.2)" class="px-3 py-1 bg-gray-200 dark:bg-slate-600 rounded">+</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  modal.classList.remove('hidden');
  document.getElementById('viewer-title').textContent = item.name;
  document.getElementById('viewer-description').textContent = item.description || '';

  renderFurnitureViewer();
}

function closeFurnitureViewer() {
  furnitureViewerOpen = false;
  const modal = document.getElementById('furniture-viewer-modal');
  if (modal) modal.classList.add('hidden');
}

function rotateFurniture(degrees) {
  viewerRotation = (viewerRotation + degrees) % 360;
  renderFurnitureViewer();
}

function zoomFurniture(delta) {
  viewerZoom = Math.max(0.5, Math.min(3, viewerZoom + delta));
  renderFurnitureViewer();
}

function renderFurnitureViewer() {
  const viewerCanvas = document.getElementById('furniture-viewer-canvas');
  if (!viewerCanvas || !selectedFurnitureItem) return;

  const vctx = viewerCanvas.getContext('2d');
  vctx.clearRect(0, 0, viewerCanvas.width, viewerCanvas.height);

  // Draw grid for reference
  vctx.strokeStyle = '#ddd';
  vctx.lineWidth = 1;
  for (let x = 0; x < viewerCanvas.width; x += 20) {
    vctx.beginPath();
    vctx.moveTo(x, 0);
    vctx.lineTo(x, viewerCanvas.height);
    vctx.stroke();
  }
  for (let y = 0; y < viewerCanvas.height; y += 20) {
    vctx.beginPath();
    vctx.moveTo(0, y);
    vctx.lineTo(viewerCanvas.width, y);
    vctx.stroke();
  }

  // Draw furniture centered with rotation and zoom
  vctx.save();
  vctx.translate(viewerCanvas.width / 2, viewerCanvas.height / 2 + 50);
  vctx.rotate(viewerRotation * Math.PI / 180);
  vctx.scale(viewerZoom, viewerZoom);

  // Use the global drawing context temporarily
  const savedCtx = ctx;
  ctx = vctx;
  drawIsometricFurniture(selectedFurnitureItem, 0, 0, 2);
  ctx = savedCtx;

  vctx.restore();

  // Draw item dimensions
  vctx.fillStyle = '#666';
  vctx.font = '12px sans-serif';
  vctx.textAlign = 'center';
  const dims = selectedFurnitureItem.size || { w: 50, h: 50 };
  vctx.fillText(`Size: ${dims.w} x ${dims.h}`, viewerCanvas.width / 2, viewerCanvas.height - 20);
}

// Make functions globally accessible
window.closeFurnitureViewer = closeFurnitureViewer;
window.rotateFurniture = rotateFurniture;
window.zoomFurniture = zoomFurniture;

// Tree positions (obstacles)
const treePositions = [
  { x: 50, y: 100 }, { x: 650, y: 120 },
  { x: 70, y: 480 }, { x: 630, y: 460 },
  { x: 350, y: 520 }, { x: 50, y: 280 }, { x: 650, y: 300 }
];

// Check if a position collides with obstacles
function collidesWithObstacle(x, y) {
  // Check trees
  for (const tree of treePositions) {
    const dist = Math.sqrt((x - tree.x) ** 2 + (y - tree.y) ** 2);
    if (dist < 50) return true;
  }
  // Check options
  for (const opt of optionPositions) {
    const dist = Math.sqrt((x - opt.x) ** 2 + (y - opt.y) ** 2);
    if (dist < 60) return true;
  }
  // Check path boundaries (stay on/near the path)
  if (y < 180 || y > 500) return true;
  // Check canvas edges
  if (x < 60 || x > 640) return true;
  return false;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('thronglet-map');
  ctx = canvas.getContext('2d');

  // Create offscreen buffer for double buffering (prevents tearing/sharding)
  bufferCanvas = document.createElement('canvas');
  bufferCtx = bufferCanvas.getContext('2d');

  // Resize canvas
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Load furniture catalog
  loadFurnitureCatalog();

  // Load cases and restore last viewed case (URL parameter takes priority)
  loadCases().then(() => {
    // Check for case ID in URL parameter first (from "Use This" button)
    const urlParams = new URLSearchParams(window.location.search);
    const urlCaseId = urlParams.get('case');

    if (urlCaseId) {
      // URL parameter takes priority - select and load the case
      document.getElementById('case-selector').value = urlCaseId;
      loadCase(urlCaseId);
      // Clear the URL parameter to avoid reloading on refresh
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      // Fall back to localStorage
      const savedCaseId = localStorage.getItem('stateloop-current-case');
      if (savedCaseId) {
        document.getElementById('case-selector').value = savedCaseId;
        loadCase(savedCaseId);
      }
    }
  });

  // Background refresh every 10 seconds - keeps content updated even when case is resolved
  backgroundRefreshInterval = setInterval(() => {
    if (currentCase) {
      // Refresh the current tab content
      if (currentDocumentTab === 'images') loadImages();
      else if (currentDocumentTab === 'working') loadWorkingDocuments();
      else if (currentDocumentTab === 'output') loadOutputContent();
    }
  }, 10000);

  // Event listeners
  document.getElementById('new-case-btn').addEventListener('click', showModal);
  document.getElementById('create-first-case').addEventListener('click', showModal);
  document.getElementById('cancel-modal').addEventListener('click', hideModal);
  document.getElementById('new-case-form').addEventListener('submit', createCase);
  document.getElementById('case-selector').addEventListener('change', selectCase);
  document.getElementById('send-boss-message').addEventListener('click', sendBossMessage);
  // Main boss message input under map
  const bossMainBtn = document.getElementById('send-boss-message-main');
  const bossMainInput = document.getElementById('boss-message-input-main');
  if (bossMainBtn) {
    bossMainBtn.addEventListener('click', () => sendBossMessageMain());
  }
  if (bossMainInput) {
    bossMainInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendBossMessageMain();
    });
  }
  document.getElementById('toggle-log').addEventListener('click', toggleLog);
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('copy-curl-get').addEventListener('click', copyCurlGet);
  document.getElementById('reset-db-btn').addEventListener('click', resetDatabase);

  // Zoom button - add if exists
  const zoomBtn = document.getElementById('zoom-agent-btn');
  if (zoomBtn) {
    zoomBtn.addEventListener('click', toggleZoomToAgent);
  }

  // Audio toggle button
  const audioBtn = document.getElementById('audio-toggle-btn');
  if (audioBtn) {
    audioBtn.addEventListener('click', toggleAudio);
    // Initialize audio button to "on" state since audioEnabled defaults to true
    initAudioButtonState();
  }

  // Replay button - replay existing messages from the beginning
  const resetReplayBtn = document.getElementById('reset-replay-btn');
  if (resetReplayBtn) {
    resetReplayBtn.addEventListener('click', replayMessages);
  }

  // View mode toggle (2D/3D)
  const viewModeBtn = document.getElementById('view-mode-btn');
  if (viewModeBtn) {
    viewModeBtn.addEventListener('click', toggleViewMode);
  }

  // Canvas click handler for selecting agents
  canvas.addEventListener('click', handleCanvasClick);

  // Initialize speech synthesis voices
  initializeVoices();

  // Track user interaction for browser autoplay policy
  // Speech synthesis requires user interaction before it can play
  const markUserInteracted = () => {
    if (!userHasInteracted) {
      userHasInteracted = true;
      console.log('User interaction detected - audio enabled');
      // Hide the click-to-start prompt
      const clickPrompt = document.getElementById('click-to-start-audio');
      if (clickPrompt) clickPrompt.remove();
      // If there are queued messages waiting, try to play them now
      if (audioEnabled && currentDisplayMessage && !isSpeaking) {
        speakMessage(currentDisplayMessage);
      }
    }
  };
  document.addEventListener('click', markUserInteracted, { once: false });
  document.addEventListener('keydown', markUserInteracted, { once: false });

  // Show "click to start" prompt if audio is enabled and there are messages to play
  setTimeout(() => {
    if (audioEnabled && !userHasInteracted && currentCase && currentCase.messages && currentCase.messages.length > 0) {
      showClickToStartPrompt();
    }
  }, 500);

  // Start log polling
  logPollInterval = setInterval(loadLogs, 5000);
  loadLogs();

  // Initialize document panel tabs
  initDocumentTabs();

  // Start idle behavior updates
  setInterval(updateIdleBehaviors, 100);

  // Agent Thoughts panel toggle
  const thoughtsToggle = document.getElementById('thoughts-toggle');
  const thoughtsContent = document.getElementById('thoughts-content');
  const thoughtsChevron = document.getElementById('thoughts-chevron');
  if (thoughtsToggle && thoughtsContent) {
    // Start collapsed
    thoughtsContent.style.display = 'none';
    thoughtsToggle.addEventListener('click', () => {
      const isHidden = thoughtsContent.style.display === 'none';
      thoughtsContent.style.display = isHidden ? 'block' : 'none';
      if (thoughtsChevron) {
        thoughtsChevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    });
  }

  // Start animation loop
  requestAnimationFrame(render);
});

function resizeCanvas() {
  const container = canvas.parentElement;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;

  // Resize buffer canvas to match
  if (bufferCanvas) {
    bufferCanvas.width = canvas.width;
    bufferCanvas.height = canvas.height;
  }
}

// Handle canvas clicks to select agents
function handleCanvasClick(event) {
  const rect = canvas.getBoundingClientRect();
  // Convert click to canvas coordinates accounting for camera
  const clickX = (event.clientX - rect.left) / camera.zoom + camera.x;
  const clickY = (event.clientY - rect.top) / camera.zoom + camera.y;

  // Check if click is near any agent
  let clickedAgentId = null;
  const clickRadius = 30 * THRONGLET_SCALE;

  Object.entries(agents).forEach(([agentId, agent]) => {
    const dist = Math.sqrt((clickX - agent.x) ** 2 + (clickY - agent.y) ** 2);
    if (dist < clickRadius) {
      clickedAgentId = agentId;
    }
  });

  // Check if click is on furniture
  let clickedFurniture = null;
  for (const item of roomFurniture) {
    const itemWidth = (item.size?.w || 50) * 0.8;
    const itemHeight = (item.size?.h || 50) * 0.8;
    if (clickX >= item.x - itemWidth/2 && clickX <= item.x + itemWidth/2 &&
        clickY >= item.y - itemHeight && clickY <= item.y) {
      clickedFurniture = item;
      break;
    }
  }

  // Toggle selection
  if (clickedFurniture) {
    openFurnitureViewer(clickedFurniture);
  } else if (clickedAgentId) {
    selectedAgentId = (selectedAgentId === clickedAgentId) ? null : clickedAgentId;
    updateCaseInfo(); // Refresh the panel to show selection
  } else {
    selectedAgentId = null;
    updateCaseInfo();
  }
}

// Select agent from participant panel click
function selectAgent(agentId) {
  selectedAgentId = (selectedAgentId === agentId) ? null : agentId;
  updateCaseInfo();
}

// Make selectAgent globally accessible
window.selectAgent = selectAgent;

// Extract character bio/description from scenario
// Extract role/title from scenario AGENDA line (e.g., "Senior Nurse" from "AGENDA (Senior Nurse):")
function getCharacterRole(agentName, scenario) {
  if (!scenario) return null;

  // Look for AGENDA (Role): pattern
  const pattern = new RegExp(`AGENT:\\s*${agentName}[\\s\\S]*?AGENDA\\s*\\(([^)]+)\\)`, 'i');
  const match = scenario.match(pattern);

  if (match) {
    return match[1].trim();
  }
  return null;
}

// Make it globally accessible
window.getCharacterRole = getCharacterRole;

function getCharacterBio(agentName, scenario) {
  if (!scenario) return null;

  // Find the agent's AGENDA section
  const pattern = new RegExp(`AGENT:\\s*${agentName}[\\s\\S]*?AGENDA[^:]*:([\\s\\S]*?)(?=AGENT:|OPTIONS:|RESTAURANTS:|RULES:|$)`, 'i');
  const match = scenario.match(pattern);

  if (!match) return null;

  let agenda = match[1].trim();

  // Clean up and summarize
  // Remove technical instructions like "Say X" or AGREEABILITY
  agenda = agenda.replace(/Say\s*["'][^"']+["']/gi, '').trim();
  agenda = agenda.replace(/AGREEABILITY[:\s]*\d+/gi, '').trim();
  agenda = agenda.replace(/Hard stance[^.]+\./gi, '').trim();
  agenda = agenda.replace(/Use type[^.]+\./gi, '').trim();
  agenda = agenda.replace(/Do NOT[^.]+\./gi, '').trim();
  agenda = agenda.replace(/Only intervene[^.]+\./gi, '').trim();

  // Take first 2-3 sentences as the bio
  const sentences = agenda.split(/(?<=[.!?])\s+/);
  const bio = sentences.slice(0, 3).join(' ').trim();

  if (bio.length < 10) return null;

  // Truncate if too long
  return bio.length > 200 ? bio.substring(0, 197) + '...' : bio;
}

// Make getCharacterBio globally accessible
window.getCharacterBio = getCharacterBio;

// Idle behavior system
function updateIdleBehaviors() {
  // Find who is currently speaking (has the active speech bubble)
  let speakerId = null;
  const speakerBubbleWidth = 280;

  if (currentCase && currentCase.messages.length > 0) {
    const lastMessage = currentCase.messages[currentCase.messages.length - 1];
    speakerId = lastMessage.author;
  }

  Object.entries(agents).forEach(([agentId, agent]) => {
    // Check if this agent is behind a speech bubble - if so, move away
    if (speakerId && agentId !== speakerId) {
      const speaker = agents[speakerId];
      if (speaker) {
        const bubbleLeft = speaker.x - speakerBubbleWidth / 2;
        const bubbleRight = speaker.x + speakerBubbleWidth / 2;
        const bubbleBottom = speaker.y - 20 * THRONGLET_SCALE;

        // Check if agent is under the bubble
        if (agent.x > bubbleLeft - 30 && agent.x < bubbleRight + 30 && agent.y < bubbleBottom + 50) {
          // Move away from the bubble
          agent.idleAction = 'avoiding';
          agent.targetX = agent.x < speaker.x ? agent.x - 80 : agent.x + 80;
          agent.targetX = Math.max(80, Math.min(canvas.width - 80, agent.targetX));
          agent.targetY = agent.homeY;
          agent.idleTimer = 2000;
        }
      }
    }

    if (agent.state === 'thinking') {
      // When thinking, stay put but look busy
      agent.idleAction = 'thinking';
      return;
    }

    // Update emote timer
    if (agent.emoteTimer > 0) {
      agent.emoteTimer -= 100;
      if (agent.emoteTimer <= 0) {
        agent.emote = null;
      }
    }

    // Update idle timer
    agent.idleTimer -= 100;

    if (agent.idleTimer <= 0) {
      // Pick new idle action
      pickNewIdleAction(agent);
    }

    // Execute current action
    executeIdleAction(agent);
  });
}

function pickNewIdleAction(agent) {
  // Weighted selection - wandering is more common
  let action;
  const rand = Math.random();

  // Don't do chitchat when a case is active (has messages)
  const caseActive = currentCase && currentCase.messages && currentCase.messages.length > 0;
  let availableActions = caseActive
    ? idleActions.filter(a => a !== 'chitchat')
    : idleActions;

  // Wheelchair users can't jump or pace
  if (agent.accessory === 'wheelchair') {
    availableActions = availableActions.filter(a => a !== 'jumping' && a !== 'pacing');
  }

  if (rand < 0.3) {
    action = 'wandering'; // 30% chance to wander
  } else {
    const otherActions = availableActions.filter(a => a !== 'wandering');
    action = otherActions[Math.floor(Math.random() * otherActions.length)];
  }
  agent.idleAction = action;

  switch (action) {
    case 'standing':
      agent.idleTimer = 2000 + Math.random() * 3000;
      break;
    case 'looking':
      agent.lookDirection = Math.random() * Math.PI * 2;
      agent.idleTimer = 1000 + Math.random() * 2000;
      break;
    case 'wandering':
      // Pick a random spot - avoid obstacles
      const wanderRadius = 120;
      let attempts = 0;
      let newX, newY;
      do {
        newX = agent.homeX + (Math.random() - 0.5) * wanderRadius * 2;
        newY = agent.homeY + (Math.random() - 0.5) * wanderRadius;
        newY = Math.max(250, Math.min(450, newY));
        newX = Math.max(100, Math.min(600, newX));
        attempts++;
      } while (collidesWithObstacle(newX, newY) && attempts < 10);

      if (!collidesWithObstacle(newX, newY)) {
        agent.targetX = newX;
        agent.targetY = newY;
      } else {
        // Stay near home if can't find valid spot
        agent.targetX = agent.homeX;
        agent.targetY = agent.homeY;
      }
      agent.idleTimer = 4000 + Math.random() * 3000;
      break;
    case 'checking_phone':
      agent.idleTimer = 2000 + Math.random() * 3000;
      if (Math.random() < 0.3) {
        agent.emote = '📱';
        agent.emoteTimer = 1500;
      }
      break;
    case 'stretching':
      agent.idleTimer = 1500 + Math.random() * 1000;
      agent.emote = '💪';
      agent.emoteTimer = 1000;
      break;
    case 'waving':
      agent.idleTimer = 1000 + Math.random() * 500;
      agent.emote = '👋';
      agent.emoteTimer = 1000;
      break;
    case 'looking_at_option':
      // Look toward an option
      if (currentCase && currentCase.options.length > 0) {
        const optIdx = Math.floor(Math.random() * Math.min(currentCase.options.length, optionPositions.length));
        const optPos = optionPositions[optIdx];
        agent.lookDirection = Math.atan2(optPos.y - agent.y, optPos.x - agent.x);
        if (Math.random() < 0.4) {
          agent.emote = '🤔';
          agent.emoteTimer = 2000;
        }
      }
      agent.idleTimer = 2000 + Math.random() * 2000;
      break;
    case 'yawning':
      agent.idleTimer = 1500 + Math.random() * 1000;
      agent.emote = '😴';
      agent.emoteTimer = 1500;
      break;
    case 'tapping_foot':
      agent.idleTimer = 2000 + Math.random() * 2000;
      break;
    case 'scratching_head':
      agent.idleTimer = 1500 + Math.random() * 1000;
      agent.emote = '🤨';
      agent.emoteTimer = 1500;
      break;
    case 'crossing_arms':
      agent.idleTimer = 3000 + Math.random() * 2000;
      break;
    case 'looking_at_watch':
      agent.idleTimer = 1000 + Math.random() * 500;
      agent.emote = '⌚';
      agent.emoteTimer = 1000;
      break;
    case 'humming':
      agent.idleTimer = 2000 + Math.random() * 2000;
      agent.emote = '🎵';
      agent.emoteTimer = 2000;
      break;
    case 'pacing':
      // Back and forth pacing
      agent.targetX = agent.x > agent.homeX ? agent.homeX - 30 : agent.homeX + 30;
      agent.targetY = agent.y;
      agent.idleTimer = 2000 + Math.random() * 1500;
      break;
    case 'jumping':
      agent.idleTimer = 800;
      agent.emote = '⬆️';
      agent.emoteTimer = 600;
      break;
    case 'sitting':
      agent.idleTimer = 5000 + Math.random() * 5000; // Sit for a while
      break;
    case 'daydreaming':
      agent.idleTimer = 3000 + Math.random() * 3000;
      agent.emote = '💭';
      agent.emoteTimer = 2500;
      break;
    case 'chitchat':
      agent.idleTimer = 3000 + Math.random() * 3000;
      agent.emote = '💬';
      agent.emoteTimer = 2000;
      agent.chitchatMessage = getChitchatMessage();
      break;
  }
}

// Chitchat messages for idle conversation
function getChitchatMessage() {
  const messages = [
    "Nice weather today...",
    "Wonder what's for lunch",
    "Did you hear the news?",
    "I'm getting hungry",
    "This is taking a while",
    "Any plans later?",
    "Traffic was bad today",
    "Coffee sounds good",
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

// Move the speaking agent to a clear visible position and move others away
function moveSpeakerToFront(speakerId) {
  const speaker = agents[speakerId];
  if (!speaker || !canvas) return;

  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  // Speech Bubble Zone Layout:
  // ┌─────────────────────────────────────────────┐
  // │         ┌─────────────────┐                 │
  // │         │  Speech Bubble  │                 │ (above y=380)
  // │         └────────┬────────┘                 │
  // │              ╔═══╧═══╗                      │
  // │              ║Speaker║  ← y=380             │
  // │              ╚═══════╝                      │
  // │   ○ ←──────              ──────→ ○          │
  // │ Agent A                        Agent B      │ (spread left/right)
  // │           (thought bubble zone)             │ (below y=380)
  // └─────────────────────────────────────────────┘

  // Speaker position: center horizontally, y=380 for speech bubble room above
  const speakingX = canvasWidth * 0.5;
  const speakingY = 380; // Vertical center - speech above, thoughts below

  // Safe vertical zone: room for speech bubbles above (~150px) and thoughts below (~100px)
  const minY = 200;  // Top boundary (speech bubbles need ~150px above agent)
  const maxY = canvasHeight - 120;  // Bottom boundary (thoughts need ~100px below)

  // Store original position if not already stored (for returning later)
  if (speaker.originalX === undefined) {
    speaker.originalX = speaker.x;
    speaker.originalY = speaker.y;
  }

  // Move speaker to speaking position smoothly
  speaker.targetX = speakingX;
  speaker.targetY = Math.max(minY, Math.min(maxY, speakingY));
  speaker.idleAction = 'speaking_move';

  // Get all non-speaking agents
  const otherAgents = Object.entries(agents).filter(([id, _]) => id !== speakerId);
  const numOthers = otherAgents.length;

  if (numOthers === 0) return;

  // Split agents between LEFT and RIGHT sides of the speaker
  // Alternate assignment: even indices go left, odd indices go right
  const leftAgents = otherAgents.filter((_, i) => i % 2 === 0);
  const rightAgents = otherAgents.filter((_, i) => i % 2 === 1);

  // Left side positioning
  const leftEdge = 80;
  const leftAreaEnd = speakingX - 180;  // Leave gap for speech bubble
  const leftSpread = leftAreaEnd - leftEdge;

  leftAgents.forEach(([_agentId, agent], index) => {
    agent.idleAction = 'avoiding';
    const spacing = leftAgents.length > 1 ? leftSpread / (leftAgents.length - 1) : leftSpread / 2;
    const targetX = leftAgents.length === 1
      ? leftEdge + leftSpread / 2
      : leftEdge + spacing * index;
    const yOffset = (index % 2 === 0) ? 0 : 25;
    const targetY = speakingY + yOffset;

    agent.targetX = Math.max(leftEdge, Math.min(leftAreaEnd, targetX));
    agent.targetY = Math.max(minY, Math.min(maxY, targetY));
    agent.idleTimer = 8000;
  });

  // Right side positioning
  const rightStart = speakingX + 180;  // Leave gap for speech bubble
  const rightEdge = canvasWidth - 80;
  const rightSpread = rightEdge - rightStart;

  rightAgents.forEach(([_agentId, agent], index) => {
    agent.idleAction = 'avoiding';
    const spacing = rightAgents.length > 1 ? rightSpread / (rightAgents.length - 1) : rightSpread / 2;
    const targetX = rightAgents.length === 1
      ? rightStart + rightSpread / 2
      : rightStart + spacing * index;
    const yOffset = (index % 2 === 0) ? 0 : 25;
    const targetY = speakingY + yOffset;

    agent.targetX = Math.max(rightStart, Math.min(rightEdge, targetX));
    agent.targetY = Math.max(minY, Math.min(maxY, targetY));
    agent.idleTimer = 8000;
  });
}

function executeIdleAction(agent) {
  switch (agent.idleAction) {
    case 'wandering':
    case 'pacing':
    case 'avoiding':
    case 'speaking_move':
      // Move toward target
      const dx = agent.targetX - agent.x;
      const dy = agent.targetY - agent.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 2) {
        // Faster speeds for repositioning due to speaking
        let speed = 0.8;
        if (agent.idleAction === 'avoiding') speed = 2.0;
        else if (agent.idleAction === 'speaking_move') speed = 2.5;
        else if (agent.idleAction === 'pacing') speed = 1.0;

        const newX = agent.x + (dx / dist) * speed;
        const newY = agent.y + (dy / dist) * speed;

        // Only move if not colliding
        if (!collidesWithObstacle(newX, newY)) {
          agent.x = newX;
          agent.y = newY;
          agent.lookDirection = Math.atan2(dy, dx);
        } else {
          // Stop and pick a new action
          agent.idleTimer = 0;
        }
      }
      break;
    case 'looking':
      // Slowly rotate look direction
      agent.lookDirection += 0.02;
      break;
    case 'tapping_foot':
      // Handled in animation
      break;
    case 'jumping':
      // Handled in animation
      break;
  }
}

// Parse case description text into structured data
function parseCaseDescription(text) {
  const participants = [];
  const options = [];

  const lines = text.split('\n');
  let inOptions = false;
  let inParticipants = false;
  let currentAgent = null;

  lines.forEach((line) => {
    const trimmed = line.trim();

    // Track sections (support both OPTIONS: and RESTAURANTS: for backwards compat)
    if (/^(OPTIONS|RESTAURANTS):/i.test(trimmed)) {
      inOptions = true;
      inParticipants = false;
      currentAgent = null;
      return;
    }
    if (/^PARTICIPANTS:/i.test(trimmed)) {
      inParticipants = true;
      inOptions = false;
      currentAgent = null;
      return;
    }
    if (/^(PUBLIC|RULES:|NOTES:|SCENARIO:)/i.test(trimmed)) {
      inOptions = false;
      inParticipants = false;
      currentAgent = null;
    }

    // Parse AGENT: lines (primary format)
    if (/^AGENT:\s*(\w+)/i.test(trimmed)) {
      const nameMatch = trimmed.match(/^AGENT:\s*(\w+)/i);
      if (nameMatch) {
        const name = nameMatch[1];
        // Don't add duplicates
        if (!participants.some(p => p.name === name)) {
          currentAgent = {
            id: `person-${participants.length}`,
            name: name,
            preferences: [],
            constraints: [],
            isPayer: false,
            appearance: {} // Will store visual customization
          };
          participants.push(currentAgent);
        } else {
          currentAgent = participants.find(p => p.name === name);
        }
      }
      return;
    }

    // Parse APPEARANCE: lines for current agent
    if (currentAgent && /^APPEARANCE:/i.test(trimmed)) {
      const appearanceText = trimmed.replace(/^APPEARANCE:\s*/i, '').toLowerCase();
      currentAgent.appearance = parseAppearance(appearanceText);
      return;
    }

    // Parse old format: "- Name" ONLY in explicit PARTICIPANTS section
    if (inParticipants && /^-\s*([A-Za-z]+)/.test(trimmed)) {
      const nameMatch = trimmed.match(/^-\s*([A-Za-z]+)/);
      if (nameMatch && !participants.some(p => p.name === nameMatch[1])) {
        participants.push({
          id: `person-${participants.length}`,
          name: nameMatch[1],
          preferences: [],
          constraints: [],
          isPayer: /paying/i.test(trimmed),
          appearance: {}
        });
      }
    }

    // Parse option lines
    if (inOptions && trimmed.startsWith('-')) {
      const nameMatch = trimmed.match(/^-\s*([^:]+)/);
      if (nameMatch) {
        options.push({
          id: `opt-${options.length + 1}`,
          name: nameMatch[1].trim(),
          category: 'Various',
          priceRange: '$$',
          features: []
        });
      }
    }
  });

  console.log('Parsed participants:', participants);
  console.log('Parsed options:', options);

  return {
    scenario: text,
    participants,
    options
  };
}

// Extract and detect location from scenario text
function extractLocation(scenario) {
  if (!scenario) return { type: 'park', name: '', subtitle: '' };

  const lower = scenario.toLowerCase();

  // Try to find explicit LOCATION: line
  const locationMatch = scenario.match(/LOCATION:\s*([^\n]+)/i);
  let name = locationMatch ? locationMatch[1].trim() : '';
  let subtitle = '';

  // Try to find SCENARIO: line for name if no explicit location
  if (!name) {
    const scenarioMatch = scenario.match(/SCENARIO:\s*([^\n-]+)/i);
    if (scenarioMatch) {
      name = scenarioMatch[1].trim();
    }
  }

  // Extract subtitle (often after a dash or in the scenario line)
  const subtitleMatch = scenario.match(/SCENARIO:[^-\n]*-\s*([^\n]+)/i);
  if (subtitleMatch) {
    subtitle = subtitleMatch[1].trim();
  }

  // Detect location type based on keywords
  let type = 'park'; // default
  for (const [locType, keywords] of Object.entries(locationKeywords)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        type = locType;
        break;
      }
    }
    if (type !== 'park') break;
  }

  return { type, name, subtitle };
}

// Parse appearance text into visual properties
function parseAppearance(text) {
  const appearance = {};
  const lower = text.toLowerCase();

  // Accessories
  if (lower.includes('hat') || lower.includes('cap')) appearance.accessory = 'hat';
  else if (lower.includes('glasses') || lower.includes('spectacles')) appearance.accessory = 'glasses';
  else if (lower.includes('bowtie') || lower.includes('bow tie') || lower.includes('formal')) appearance.accessory = 'bowtie';
  else if (lower.includes('headphones') || lower.includes('music') || lower.includes('energetic')) appearance.accessory = 'headphones';
  else if (lower.includes('scarf') || lower.includes('cozy')) appearance.accessory = 'scarf';
  else if (lower.includes('walking stick') || lower.includes('walking_stick') || lower.includes('cane')) appearance.accessory = 'walking_stick';
  else if (lower.includes('zimmer') || lower.includes('zimmer_frame') || lower.includes('walking frame') || lower.includes('walker')) appearance.accessory = 'zimmer_frame';

  // Body style from personality hints
  if (lower.includes('tall') || lower.includes('confident')) appearance.bodyStyle = 'tall';
  else if (lower.includes('short') || lower.includes('small')) appearance.bodyStyle = 'short';
  else if (lower.includes('big') || lower.includes('large') || lower.includes('bold')) appearance.bodyStyle = 'wide';

  // Colors from personality
  if (lower.includes('red') || lower.includes('bold') || lower.includes('passionate')) appearance.color = '#e74c3c';
  else if (lower.includes('blue') || lower.includes('calm') || lower.includes('professional')) appearance.color = '#3498db';
  else if (lower.includes('green') || lower.includes('nature') || lower.includes('relaxed')) appearance.color = '#27ae60';
  else if (lower.includes('purple') || lower.includes('creative')) appearance.color = '#9b59b6';
  else if (lower.includes('orange') || lower.includes('energetic') || lower.includes('lively')) appearance.color = '#f39c12';
  else if (lower.includes('teal') || lower.includes('modern')) appearance.color = '#1abc9c';

  // Skin tone
  if (lower.includes('pale') || lower.includes('light skin')) appearance.skinTone = '#ffcc80';
  else if (lower.includes('tan') || lower.includes('olive')) appearance.skinTone = '#e0ac69';
  else if (lower.includes('brown') || lower.includes('dark skin')) appearance.skinTone = '#8d5524';

  return appearance;
}

// API Functions
async function loadCases() {
  try {
    const response = await fetch(`${API_BASE}/cases`);
    const cases = await response.json();

    const selector = document.getElementById('case-selector');
    selector.innerHTML = '<option value="">Select a case...</option>';

    cases.forEach(c => {
      const option = document.createElement('option');
      option.value = c.id;
      option.textContent = `${c.id} - ${c.status}`;
      selector.appendChild(option);
    });

    if (cases.length === 0) {
      document.getElementById('no-case-overlay').classList.remove('hidden');
    } else {
      document.getElementById('no-case-overlay').classList.add('hidden');
    }
  } catch (err) {
    console.error('Failed to load cases:', err);
  }
}

async function loadCase(caseId) {
  if (!caseId) {
    currentCase = null;
    localStorage.removeItem('stateloop-current-case');
    clearMessageQueue();
    updateCaseInfo();
    refreshDocuments();
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/cases/${caseId}`);
    const newCaseData = await response.json();

    // Check if this is a different case or initial load
    const isInitialLoad = !currentCase;
    const isSameCase = currentCase && currentCase.id === newCaseData.id;
    if (!isSameCase) {
      clearMessageQueue();
    }

    // Get messages we haven't seen before
    const prevMessageIds = new Set(currentCase ? currentCase.messages.map(m => m.id) : []);
    const newMessages = newCaseData.messages.filter(m => !prevMessageIds.has(m.id));

    currentCase = newCaseData;

    // On initial page load, mark all existing messages as already displayed
    // This prevents replaying the entire conversation on refresh
    if (isInitialLoad && newCaseData.messages.length > 0) {
      newCaseData.messages.forEach(m => displayedMessageIds.add(m.id));
      // Show the most recent message immediately
      const lastMessage = newCaseData.messages[newCaseData.messages.length - 1];
      if (lastMessage) {
        const agentKey = lastMessage.author;
        if (agents[agentKey]) {
          agents[agentKey].message = lastMessage.content;
          agents[agentKey].messageType = lastMessage.type;
          agents[agentKey].messageTime = new Date(lastMessage.timestamp).getTime();
        }
        updateThoughtsPanel(lastMessage);
      }
    }

    // Use AI-determined location if available, otherwise fall back to regex extraction
    if (newCaseData.locationType) {
      currentLocation = {
        type: newCaseData.locationType,
        name: newCaseData.locationName || '',
        subtitle: ''
      };
      console.log('Location from API:', currentLocation);

      // Use custom furniture if provided, otherwise use defaults for location type
      if (newCaseData.locationFurniture && newCaseData.locationFurniture.length > 0) {
        setupCustomFurniture(newCaseData.locationFurniture);
      } else {
        setupRoomFurniture(currentLocation.type);
      }
    } else {
      // Fall back to extracting location from scenario text
      currentLocation = extractLocation(newCaseData.scenario);
      console.log('Location from scenario:', currentLocation);
      setupRoomFurniture(currentLocation.type);
    }

    // Save to localStorage
    localStorage.setItem('stateloop-current-case', caseId);

    updateCaseInfo();
    updateAgentStates();
    refreshDocuments();

    // Queue any new messages for sequential display
    if (newMessages.length > 0) {
      queueNewMessages(newMessages);
    }

    // Start polling if active
    if (currentCase.status === 'active') {
      startPolling();

      // Show curl command if there's a pending turn
      if (currentCase.currentTurn) {
        showPendingTurnCurl();
      }
    } else {
      stopPolling();
      hidePendingTurnCurl();
    }
  } catch (err) {
    console.error('Failed to load case:', err);
  }
}

// Show curl command for pending agent turn
function showPendingTurnCurl() {
  let curlBox = document.getElementById('pending-turn-curl');
  if (!curlBox) {
    curlBox = document.createElement('div');
    curlBox.id = 'pending-turn-curl';
    curlBox.className = 'fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-slate-800 text-green-400 px-4 py-3 rounded-lg shadow-lg z-50 font-mono text-sm max-w-2xl';
    document.body.appendChild(curlBox);
  }

  const curlCmd = `curl "${window.location.origin}/api/cases/${currentCase.id}/auto-play"`;
  const agentName = currentCase.participants?.find(p => p.id === currentCase.currentTurn)?.name || 'agent';

  curlBox.innerHTML = `
    <div class="text-xs text-yellow-400 mb-1">⏳ Waiting for ${agentName}'s turn:</div>
    <code class="select-all cursor-pointer" onclick="navigator.clipboard.writeText(this.textContent)">${curlCmd}</code>
    <div class="text-xs text-slate-500 mt-1">Click to copy</div>
  `;
  curlBox.style.display = 'block';
}

// Hide the pending turn curl box
function hidePendingTurnCurl() {
  const curlBox = document.getElementById('pending-turn-curl');
  if (curlBox) {
    curlBox.style.display = 'none';
  }
}

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => {
    // Skip polling if message queue is busy (displaying messages sequentially)
    if (isQueueBusy()) {
      return;
    }
    // Skip polling if audio is enabled and speech is in progress
    if (audioEnabled && isSpeaking) {
      return;
    }
    if (currentCase) loadCase(currentCase.id);
  }, 2000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function createCase(e) {
  e.preventDefault();

  const description = document.getElementById('case-description').value;

  // Parse the text description
  const parsed = parseCaseDescription(description);

  // Only send scenario - AI will identify participants and options during setup
  const payload = {
    scenario: parsed.scenario,
    participants: [],  // Empty - AI will create these
    options: []        // Empty - AI will create these
  };

  try {
    const response = await fetch(`${API_BASE}/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const newCase = await response.json();
      hideModal();
      await loadCases();
      document.getElementById('case-selector').value = newCase.id;
      await loadCase(newCase.id);
      document.getElementById('no-case-overlay').classList.add('hidden');
    } else {
      const error = await response.json();
      alert('Failed to create case: ' + error.error.message);
    }
  } catch (err) {
    console.error('Failed to create case:', err);
    alert('Failed to create case');
  }
}

async function sendBossMessage() {
  if (!currentCase) return;

  const input = document.getElementById('boss-message-input');
  const content = input.value.trim();
  if (!content) return;

  try {
    await fetch(`${API_BASE}/cases/${currentCase.id}/boss-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });

    input.value = '';
    loadCase(currentCase.id);
  } catch (err) {
    console.error('Failed to send boss message:', err);
  }
}

// Main boss message function (under the map) - can reopen resolved cases
async function sendBossMessageMain() {
  if (!currentCase) {
    alert('Please select a case first');
    return;
  }

  const input = document.getElementById('boss-message-input-main');
  const content = input.value.trim();
  if (!content) return;

  try {
    // If case is resolved, reopen it first
    if (currentCase.status === 'resolved') {
      await fetch(`${API_BASE}/cases/${currentCase.id}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Boss message sent' })
      });
    }

    // Send the boss message
    await fetch(`${API_BASE}/cases/${currentCase.id}/boss-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });

    input.value = '';

    // Update status indicator
    const statusEl = document.getElementById('boss-case-status');
    if (statusEl) {
      statusEl.textContent = 'Message sent!';
      statusEl.className = 'ml-auto text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400';
      setTimeout(() => {
        statusEl.textContent = '';
        statusEl.className = 'ml-auto text-xs px-2 py-1 rounded-full bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-400';
      }, 3000);
    }

    // Reload case to show the message and continue conversation
    await loadCase(currentCase.id);

    // Show curl command for continuing the conversation
    const curlCmd = `curl "${window.location.origin}/api/cases/${currentCase.id}/auto-play"`;
    console.log('Continue with:', curlCmd);

    // Display curl command to user
    const curlDisplay = document.createElement('div');
    curlDisplay.className = 'fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-slate-800 text-green-400 px-4 py-3 rounded-lg shadow-lg z-50 font-mono text-sm max-w-2xl';
    curlDisplay.innerHTML = `
      <div class="text-xs text-slate-400 mb-1">Continue the conversation:</div>
      <code class="select-all cursor-pointer" onclick="navigator.clipboard.writeText(this.textContent)">${curlCmd}</code>
      <div class="text-xs text-slate-500 mt-1">Click to copy</div>
    `;
    document.body.appendChild(curlDisplay);
    setTimeout(() => curlDisplay.remove(), 10000);

  } catch (err) {
    console.error('Failed to send boss message:', err);
    alert('Failed to send message');
  }
}

async function loadLogs() {
  try {
    const response = await fetch(`${API_BASE}/logs?limit=20`);
    const data = await response.json();

    const tbody = document.getElementById('log-body');
    tbody.innerHTML = '';

    data.logs.forEach(log => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-700/50';
      const time = new Date(log.timestamp).toLocaleTimeString();
      const methodClass = log.method === 'GET' ? 'text-green-400' : 'text-yellow-400';
      const statusClass = log.statusCode < 300 ? 'text-green-400' : log.statusCode < 500 ? 'text-yellow-400' : 'text-red-400';

      tr.innerHTML = `
        <td class="px-4 py-2 text-slate-400">${time}</td>
        <td class="px-4 py-2 ${methodClass} font-medium">${log.method}</td>
        <td class="px-4 py-2 text-slate-300 font-mono text-xs">${log.path}</td>
        <td class="px-4 py-2 ${statusClass}">${log.statusCode}</td>
        <td class="px-4 py-2 text-slate-400">${log.durationMs}ms</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Failed to load logs:', err);
  }
}

// UI Updates
function updateCaseInfo() {
  const container = document.getElementById('case-details');
  const statusIndicator = document.getElementById('status-indicator');
  const agentPromptCard = document.getElementById('agent-prompt-card');
  const agentPromptUrl = document.getElementById('agent-prompt-url');

  if (!currentCase) {
    container.innerHTML = '<p class="text-slate-500 text-sm italic">Select or create a case to view details</p>';
    statusIndicator.textContent = 'No case selected';
    statusIndicator.className = 'text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-400';
    agentPromptCard.classList.add('hidden');
    return;
  }

  // Update status indicator
  if (currentCase.status === 'active') {
    statusIndicator.textContent = 'Active';
    statusIndicator.className = 'text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400';
  } else {
    statusIndicator.textContent = 'Resolved';
    statusIndicator.className = 'text-xs px-2 py-1 rounded-full bg-indigo-500/20 text-indigo-400';
  }

  const currentTurnParticipant = currentCase.participants.find(p => p.id === currentCase.currentTurn);

  // Extract scenario title and max rounds
  const scenarioMatch = currentCase.scenario.match(/Scenario:\s*(.+?)(?:\n|$)/i);
  const scenarioTitle = scenarioMatch ? scenarioMatch[1].trim() : 'Negotiation';
  const maxRoundsMatch = currentCase.scenario.match(/MAX_ROUNDS:\s*(\d+)/i);
  const maxRounds = maxRoundsMatch ? parseInt(maxRoundsMatch[1]) : 20;

  let html = `
    <!-- Case ID and Scenario -->
    <div class="mb-4 pb-3 border-b border-slate-700">
      <div class="text-xs text-slate-500 font-mono mb-1">${currentCase.id}</div>
      <div class="text-sm text-white font-medium">${scenarioTitle}</div>
    </div>

    <!-- Status Grid -->
    <div class="grid grid-cols-2 gap-2 mb-4 text-xs">
      <div class="bg-slate-700/50 rounded p-2">
        <div class="text-slate-400">Status</div>
        <div class="${currentCase.status === 'active' ? 'text-green-400' : 'text-indigo-400'} font-medium">${currentCase.status}</div>
      </div>
      <div class="bg-slate-700/50 rounded p-2">
        <div class="text-slate-400">Turn</div>
        <div class="text-white font-medium">${currentTurnParticipant?.name || 'N/A'}</div>
      </div>
      <div class="bg-slate-700/50 rounded p-2">
        <div class="text-slate-400">Messages</div>
        <div class="text-white">${currentCase.messages.length} / ${maxRounds}</div>
      </div>
      <div class="bg-slate-700/50 rounded p-2">
        <div class="text-slate-400">Participants</div>
        <div class="text-white">${currentCase.participants.length}</div>
      </div>
    </div>

    <!-- Options -->
    ${currentCase.options && currentCase.options.length > 0 ? `
      <div class="mb-4">
        <div class="text-xs text-slate-400 mb-2">Options</div>
        <div class="space-y-1">
          ${currentCase.options.map(r => `
            <div class="text-xs px-2 py-1 rounded ${currentCase.selectedOptionId === r.id ? 'bg-green-500/20 text-green-400' : 'bg-slate-700/30 text-slate-300'}">
              ${r.name}
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;

  if (currentCase.status === 'resolved') {
    const selectedRest = currentCase.options.find(r => r.id === currentCase.selectedOptionId);
    html += `
      <div class="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mb-4">
        <div class="flex justify-between text-sm mb-1">
          <span class="text-green-400">Outcome</span>
          <span class="text-green-300 font-medium">${currentCase.outcome}</span>
        </div>
        ${selectedRest ? `
          <div class="flex justify-between text-sm">
            <span class="text-green-400">Choice</span>
            <span class="text-green-300 font-medium">${selectedRest.name}</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  // Participants
  html += '<div class="space-y-3">';
  currentCase.participants.forEach(p => {
    const isTurn = p.id === currentCase.currentTurn;
    const isSelected = p.id === selectedAgentId;
    const idx = currentCase.participants.indexOf(p);
    const colors = ['#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#27ae60', '#e91e63', '#00bcd4', '#795548'];
    const agentColor = colors[idx % colors.length];

    // Parse appearance from preferences if available
    let appearance = {};
    try {
      if (p.preferences && typeof p.preferences === 'object' && p.preferences.accessory) {
        appearance = p.preferences;
      }
    } catch (e) {}

    html += `
      <div class="rounded-lg p-3 cursor-pointer transition-all ${isSelected ? 'bg-primary/20 border-2 border-primary' : 'bg-gray-100 dark:bg-slate-700/50 hover:bg-gray-200 dark:hover:bg-slate-600/50'}" onclick="selectAgent('${p.id}')">
        <div class="flex items-center gap-2 mb-2">
          ${isTurn ? '<span class="w-2 h-2 bg-green-500 dark:bg-green-400 rounded-full animate-pulse"></span>' : ''}
          <span class="w-3 h-3 rounded-full" style="background-color: ${appearance.color || agentColor}"></span>
          <span class="font-medium text-gray-800 dark:text-slate-200">${p.name}</span>
          ${p.isPayer ? '<span class="text-xs bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded">Paying</span>' : ''}
          ${appearance.accessory === 'wheelchair' ? '<span class="text-xs">♿</span>' : ''}
        </div>
        ${isSelected ? `
          <div class="mt-2 pt-2 border-t border-gray-300 dark:border-slate-600 text-xs space-y-2">
            <!-- Character Bio -->
            ${getCharacterBio(p.name, currentCase.scenario) ? `
              <div class="bg-gray-50 dark:bg-slate-800 rounded p-2 mb-2">
                <div class="text-gray-600 dark:text-slate-300 italic text-xs leading-relaxed">${getCharacterBio(p.name, currentCase.scenario)}</div>
              </div>
            ` : ''}
            <!-- Appearance Details -->
            <div class="text-gray-500 dark:text-slate-400 font-medium mb-1">Appearance</div>
            ${appearance.gender ? `
              <div class="flex justify-between">
                <span class="text-gray-500 dark:text-slate-400">Gender</span>
                <span class="text-gray-700 dark:text-slate-300">${appearance.gender}</span>
              </div>
            ` : ''}
            ${appearance.accessory && appearance.accessory !== 'none' ? `
              <div class="flex justify-between">
                <span class="text-gray-500 dark:text-slate-400">Style</span>
                <span class="text-gray-700 dark:text-slate-300">${appearance.accessory}</span>
              </div>
            ` : ''}
            ${appearance.bodyStyle ? `
              <div class="flex justify-between">
                <span class="text-gray-500 dark:text-slate-400">Build</span>
                <span class="text-gray-700 dark:text-slate-300">${appearance.bodyStyle}</span>
              </div>
            ` : ''}
            ${appearance.voice ? `
              <div class="flex justify-between">
                <span class="text-gray-500 dark:text-slate-400">Voice</span>
                <span class="text-gray-700 dark:text-slate-300">${appearance.voice.voiceType}</span>
              </div>
            ` : ''}
            <!-- Technical ID -->
            <div class="flex justify-between mt-2 pt-1 border-t border-gray-200 dark:border-slate-700">
              <span class="text-gray-400 dark:text-slate-500">Agent ID</span>
              <span class="text-gray-500 dark:text-slate-400 font-mono text-[10px]">${p.id.split('-').pop()}</span>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  });
  html += '</div>';

  container.innerHTML = html;

  // Update conversation thread (if element exists)
  const thread = document.getElementById('conversation-thread');
  if (thread) {
    if (currentCase.messages.length === 0) {
      thread.innerHTML = '<p class="text-gray-500 dark:text-slate-500 text-sm italic text-center">No messages yet</p>';
    } else {
      thread.innerHTML = currentCase.messages.map(m => {
        const participant = currentCase.participants.find(p => p.id === m.author);
        const name = participant?.name || 'Unknown';
        const isPersonA = m.author.includes('person-a');
        const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const typeColors = {
          proposal: 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700',
          counter: 'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700',
          accept: 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700',
          reject: 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700',
          message: 'bg-gray-100 dark:bg-slate-700/50 border-gray-300 dark:border-slate-600'
        };
        const bgClass = typeColors[m.type] || typeColors.message;
        return `
          <div class="flex gap-2 ${isPersonA ? '' : 'flex-row-reverse'}">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${isPersonA ? 'bg-red-500' : 'bg-blue-500'}">
              ${name.charAt(0)}
            </div>
            <div class="flex-1 ${isPersonA ? '' : 'text-right'}">
              <div class="flex items-center gap-2 ${isPersonA ? '' : 'justify-end'}">
                <span class="text-sm font-medium ${isPersonA ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}">${name}</span>
                <span class="text-xs text-gray-400 dark:text-slate-500">${time}</span>
              </div>
              <div class="mt-1 p-2 rounded-lg border text-sm text-gray-700 dark:text-slate-300 ${bgClass} ${isPersonA ? 'rounded-tl-none' : 'rounded-tr-none'}">
                ${m.content}
              </div>
            </div>
          </div>
        `;
      }).join('');
      // Scroll to bottom
      thread.scrollTop = thread.scrollHeight;
    }
  }

  // Update boss messages
  const msgList = document.getElementById('boss-message-list');
  if (currentCase.bossMessages.length === 0) {
    msgList.innerHTML = '<p class="text-slate-500 text-sm italic">No messages yet</p>';
  } else {
    msgList.innerHTML = currentCase.bossMessages.map(m => `
      <div class="bg-slate-700/50 rounded-lg p-3">
        <span class="text-xs text-slate-500">${new Date(m.timestamp).toLocaleTimeString()}</span>
        <p class="text-sm text-slate-300 mt-1">${m.content}</p>
      </div>
    `).join('');
  }

  // Update agent prompt URL and curl command
  const baseUrl = window.location.origin;
  const autoPlayUrl = `${baseUrl}/api/cases/${currentCase.id}/auto-play`;

  if (currentCase.status === 'active') {
    agentPromptCard.classList.remove('hidden');
    agentPromptUrl.value = autoPlayUrl;

    // Update current turn badge
    const turnBadge = document.getElementById('current-turn-badge');
    const isSetupPhase = !currentCase.messages || currentCase.messages.length === 0;

    if (isSetupPhase) {
      turnBadge.textContent = 'Setup Phase';
      turnBadge.className = 'text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-400';
    } else if (currentTurnParticipant) {
      turnBadge.textContent = `${currentTurnParticipant.name}'s turn`;
      turnBadge.className = 'text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400';
    } else {
      turnBadge.textContent = 'Waiting...';
    }

    // Set up curl command
    const curlGetCmd = document.getElementById('curl-get-cmd');
    curlGetCmd.textContent = `curl "${autoPlayUrl}"`;
  } else {
    agentPromptCard.classList.add('hidden');
  }
}

function updateAgentStates() {
  if (!currentCase) return;

  // Calculate positions dynamically based on number of participants
  const numParticipants = currentCase.participants.length;
  const canvasWidth = canvas.width || 700;
  const spacing = canvasWidth / (numParticipants + 1);

  // Agent colors - cycle through these
  const agentColors = ['#e74c3c', '#3498db', '#9b59b6', '#27ae60', '#f39c12', '#1abc9c'];

  // Agent accessories - different visual features
  const accessories = ['none', 'hat', 'glasses', 'bowtie', 'headphones', 'scarf'];
  const bodyStyles = ['normal', 'tall', 'short', 'wide'];

  currentCase.participants.forEach((p, i) => {
    const agentKey = p.id;
    // First participant (moderator/adjudicator) sits up top, others on the path
    const isFirstParticipant = i === 0;
    const xPos = spacing * (i + 1);
    const yPos = isFirstParticipant ? 220 : 380;

    // Try to get AI-determined appearance from preferences (stored as JSON)
    let aiAppearance = {};
    try {
      if (p.preferences && typeof p.preferences === 'string') {
        aiAppearance = JSON.parse(p.preferences);
      } else if (p.preferences && typeof p.preferences === 'object' && p.preferences.accessory) {
        aiAppearance = p.preferences;
      }
    } catch (e) {
      // Not JSON, use defaults
    }

    // Use AI appearance or fall back to defaults
    const color = aiAppearance.color || agentColors[i % agentColors.length];
    const accessory = aiAppearance.accessory || accessories[i % accessories.length];
    const bodyStyle = aiAppearance.bodyStyle || bodyStyles[i % bodyStyles.length];
    const skinTone = aiAppearance.skinTone || ['#ffcc80', '#e0ac69', '#c68642', '#8d5524', '#f1c27d'][i % 5];

    if (!agents[agentKey]) {
      agents[agentKey] = {
        x: xPos,
        y: yPos,
        homeX: xPos,
        homeY: yPos,
        color: color,
        state: 'idle',
        message: null,
        messageTime: 0,
        idleAction: 'standing',
        idleTimer: 0,
        targetX: xPos,
        targetY: yPos,
        lookDirection: 0,
        emote: null,
        emoteTimer: 0,
        // Visual variety - from AI or defaults
        accessory: accessory,
        bodyStyle: bodyStyle,
        bounceSpeed: 250 + (i * 50),
        skinTone: skinTone
      };
    } else {
      // Update appearance if AI set it
      if (aiAppearance.color) agents[agentKey].color = aiAppearance.color;
      if (aiAppearance.accessory) agents[agentKey].accessory = aiAppearance.accessory;
      if (aiAppearance.bodyStyle) agents[agentKey].bodyStyle = aiAppearance.bodyStyle;
      if (aiAppearance.skinTone) agents[agentKey].skinTone = aiAppearance.skinTone;
    }

    // Update state
    agents[agentKey].name = p.name;
    agents[agentKey].role = getCharacterRole(p.name, currentCase.scenario) || '';
    agents[agentKey].state = currentCase.currentTurn === p.id ? 'thinking' : 'idle';

    // Face center of the group
    const centerX = canvasWidth / 2;
    agents[agentKey].lookDirection = Math.atan2(0, centerX - xPos);

    // Clear emote when thinking
    if (agents[agentKey].state === 'thinking') {
      agents[agentKey].emote = null;
    }

    // Update message from latest - BUT only if queue is not actively displaying
    // The message queue system handles sequential display, so we don't want to override it
    if (!isDisplayingMessage && !isQueueBusy()) {
      const latestMessage = [...currentCase.messages].reverse().find(m => m.author === p.id);
      if (latestMessage && latestMessage.timestamp !== agents[agentKey].lastMessageTimestamp) {
        agents[agentKey].message = latestMessage.content;
        agents[agentKey].messageType = latestMessage.type;
        agents[agentKey].messageTime = new Date(latestMessage.timestamp).getTime();
        agents[agentKey].lastMessageTimestamp = latestMessage.timestamp;

        // Emote based on message type
        if (latestMessage.type === 'accept') {
          agents[agentKey].emote = '✅';
          agents[agentKey].emoteTimer = 3000;
        } else if (latestMessage.type === 'reject') {
          agents[agentKey].emote = '❌';
          agents[agentKey].emoteTimer = 2000;
        } else if (latestMessage.type === 'proposal' || latestMessage.type === 'counter') {
          agents[agentKey].emote = '💡';
          agents[agentKey].emoteTimer = 2000;
        }
      }
    }
  });

  // Move speaker to position below their speech bubble
  // Use currentDisplayMessage if queue is active, otherwise use latest message
  const activeMessage = currentDisplayMessage ||
    (currentCase.messages.length > 0 ? currentCase.messages[currentCase.messages.length - 1] : null);

  if (activeMessage) {
    const speakerId = activeMessage.author;
    const speaker = agents[speakerId];

    if (speaker) {
      // Safe vertical zone for all agents
      const minY = 200;  // Room for speech bubbles above
      const maxY = canvas.height - 120;  // Room for thoughts below

      // Speaking position: center, y=380 for speech bubble room above
      const speakingX = canvas.width * 0.5;
      const speakingY = Math.max(minY, Math.min(maxY, 380));

      // Move speaker to speaking position
      speaker.targetX = speakingX;
      speaker.targetY = speakingY;
      speaker.idleAction = 'speaking_move';

      // Speech bubble zone dimensions
      const bubbleWidth = 300;
      const bubbleLeft = speakingX - bubbleWidth / 2 - 30;
      const bubbleRight = speakingX + bubbleWidth / 2 + 30;

      // Split other agents between left and right sides
      const otherAgents = Object.entries(agents).filter(([id]) => id !== speakerId);
      const leftAgents = otherAgents.filter((_, i) => i % 2 === 0);
      const rightAgents = otherAgents.filter((_, i) => i % 2 === 1);

      // Position left-side agents
      leftAgents.forEach(([_agentId, agent], index) => {
        agent.idleAction = 'avoiding';
        const targetX = 80 + (index * 100);  // Spread from left edge
        const yOffset = (index % 2 === 0) ? 0 : 25;
        agent.targetX = Math.max(80, Math.min(bubbleLeft - 60, targetX));
        agent.targetY = Math.max(minY, Math.min(maxY, speakingY + yOffset));
        agent.idleTimer = 5000;
      });

      // Position right-side agents
      rightAgents.forEach(([_agentId, agent], index) => {
        agent.idleAction = 'avoiding';
        const targetX = canvasWidth - 80 - (index * 100);  // Spread from right edge
        const yOffset = (index % 2 === 0) ? 0 : 25;
        agent.targetX = Math.max(bubbleRight + 60, Math.min(canvasWidth - 80, targetX));
        agent.targetY = Math.max(minY, Math.min(maxY, speakingY + yOffset));
        agent.idleTimer = 5000;
      });
    }
  }
}

// Modal
function showModal() {
  document.getElementById('new-case-modal').classList.remove('hidden');
}

function hideModal() {
  document.getElementById('new-case-modal').classList.add('hidden');
}

async function resetDatabase() {
  if (!confirm('Are you sure you want to clear all cases? This cannot be undone.')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/reset`, { method: 'POST' });
    if (response.ok) {
      currentCase = null;
      Object.keys(agents).forEach(key => delete agents[key]);
      localStorage.removeItem('stateloop-current-case');
      await loadCases();
      document.getElementById('no-case-overlay').classList.remove('hidden');
      updateCaseInfo();
    } else {
      alert('Failed to reset database');
    }
  } catch (err) {
    console.error('Failed to reset:', err);
    alert('Failed to reset database');
  }
}

function selectCase(e) {
  loadCase(e.target.value);
}

function toggleLog() {
  const container = document.getElementById('log-container');
  const btn = document.getElementById('toggle-log');
  container.classList.toggle('hidden');
  btn.textContent = container.classList.contains('hidden') ? 'Expand' : 'Collapse';
}

// === DOCUMENT PANEL FUNCTIONS ===

// Current active document tab
let currentDocumentTab = 'details';

// Document expansion state
const documentExpanded = {};

// Initialize document panel tabs
function initDocumentTabs() {
  const tabs = document.querySelectorAll('.document-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchDocumentTab(tabName);
    });
  });
}

// Switch to a specific document tab
function switchDocumentTab(tabName) {
  currentDocumentTab = tabName;

  // Update tab button styles
  const tabs = document.querySelectorAll('.document-tab');
  tabs.forEach(tab => {
    if (tab.dataset.tab === tabName) {
      tab.classList.add('border-primary', 'text-primary', 'bg-primary/5');
      tab.classList.remove('border-transparent', 'text-gray-500', 'dark:text-slate-400');
    } else {
      tab.classList.remove('border-primary', 'text-primary', 'bg-primary/5');
      tab.classList.add('border-transparent', 'text-gray-500', 'dark:text-slate-400');
    }
  });

  // Show/hide tab content
  const contents = document.querySelectorAll('.document-tab-content');
  contents.forEach(content => {
    if (content.id === `tab-${tabName}`) {
      content.classList.remove('hidden');
    } else {
      content.classList.add('hidden');
    }
  });

  // Load content for the tab
  if (currentCase) {
    if (tabName === 'inputs') loadInputDocuments();
    else if (tabName === 'working') loadWorkingDocuments();
    else if (tabName === 'output') loadOutputContent();
    else if (tabName === 'images') loadImages();
  }
}

// Load input documents for current case
async function loadInputDocuments() {
  if (!currentCase) return;

  const container = document.getElementById('input-documents');
  if (!container) return;

  try {
    const response = await fetch(`${API_BASE}/cases/${currentCase.id}/input-documents`);
    if (!response.ok) throw new Error('Failed to fetch input documents');

    const data = await response.json();
    const documents = data.documents || data || [];

    if (!documents || documents.length === 0) {
      container.innerHTML = '<p class="text-gray-500 dark:text-slate-500 text-sm italic text-center">No input documents</p>';
      return;
    }

    container.innerHTML = documents.map(doc => renderDocumentCard(doc, 'input')).join('');
    attachDocumentEventHandlers(container);
  } catch (err) {
    console.error('Failed to load input documents:', err);
    container.innerHTML = '<p class="text-red-500 dark:text-red-400 text-sm italic text-center">Failed to load documents</p>';
  }
}

// Load working documents for current case
async function loadWorkingDocuments() {
  if (!currentCase) return;

  const container = document.getElementById('working-documents');
  if (!container) return;

  try {
    const response = await fetch(`${API_BASE}/cases/${currentCase.id}/documents`);
    if (!response.ok) throw new Error('Failed to fetch working documents');

    const data = await response.json();
    const documents = data.documents || data || [];

    if (!documents || documents.length === 0) {
      container.innerHTML = '<p class="text-gray-500 dark:text-slate-500 text-sm italic text-center">No working documents</p>';
      return;
    }

    container.innerHTML = documents.map(doc => renderDocumentCard(doc, 'working')).join('');
    attachDocumentEventHandlers(container);
  } catch (err) {
    console.error('Failed to load working documents:', err);
    container.innerHTML = '<p class="text-red-500 dark:text-red-400 text-sm italic text-center">Failed to load documents</p>';
  }
}

// Load output content for current case
async function loadOutputContent() {
  if (!currentCase) return;

  const container = document.getElementById('output-content');
  if (!container) return;

  // Only show output for resolved cases
  if (currentCase.status !== 'resolved') {
    container.innerHTML = '<p class="text-gray-500 dark:text-slate-500 text-sm italic text-center">Output will appear when case is complete</p>';
    return;
  }

  // Check if this case has a completed form
  if (currentCase.completedForm && currentCase.completedForm.formName) {
    container.innerHTML = renderCompletedForm(currentCase.completedForm, currentCase.formDefinition);
    attachFormEventHandlers(container);
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/cases/${currentCase.id}/output`);
    if (!response.ok) {
      if (response.status === 404) {
        container.innerHTML = '<p class="text-gray-500 dark:text-slate-500 text-sm italic text-center">No output document defined</p>';
        return;
      }
      throw new Error('Failed to fetch output');
    }

    const output = await response.json();

    if (!output || !output.content) {
      container.innerHTML = '<p class="text-gray-500 dark:text-slate-500 text-sm italic text-center">No output content available</p>';
      return;
    }

    // Check if the output content is a completed form (JSON with formName)
    if (output.content && typeof output.content === 'string') {
      try {
        const parsed = JSON.parse(output.content);
        if (parsed.formName) {
          container.innerHTML = renderCompletedForm(parsed, currentCase.formDefinition);
          attachFormEventHandlers(container);
          return;
        }
      } catch (e) {
        // Not JSON, continue with normal rendering
      }
    }

    container.innerHTML = renderDocumentCard(output, 'output');
    attachDocumentEventHandlers(container);
  } catch (err) {
    console.error('Failed to load output:', err);
    container.innerHTML = '<p class="text-red-500 dark:text-red-400 text-sm italic text-center">Failed to load output</p>';
  }
}

// Load images for current case
async function loadImages() {
  if (!currentCase) return;

  const container = document.getElementById('case-images');
  if (!container) return;

  try {
    const response = await fetch(`${API_BASE}/cases/${currentCase.id}/images`);
    if (!response.ok) throw new Error('Failed to fetch images');

    const data = await response.json();
    const images = data.images || [];

    if (!images || images.length === 0) {
      container.innerHTML = '<p class="text-gray-500 dark:text-slate-500 text-sm italic text-center">No images generated</p>';
      return;
    }

    container.innerHTML = `<div class="flex flex-wrap gap-2">${images.map(img => renderImageCard(img)).join('')}</div>`;
    attachImageEventHandlers(container);
    // Scale SVGs to fit their containers
    container.querySelectorAll('.image-preview svg').forEach(svg => {
      svg.style.width = '100%';
      svg.style.height = '100%';
    });
  } catch (err) {
    console.error('Failed to load images:', err);
    container.innerHTML = '<p class="text-red-500 dark:text-red-400 text-sm italic text-center">Failed to load images</p>';
  }
}

// Render an image card - simple clickable icon that downloads
function renderImageCard(img) {
  return `
    <div class="image-icon-card inline-block cursor-pointer hover:opacity-80 transition-opacity p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
         data-image-name="${img.name}" title="Click to download: ${img.name}.svg">
      <div class="bg-white dark:bg-slate-800 rounded border border-gray-200 dark:border-slate-600 p-2 w-20 h-20 flex items-center justify-center">
        <div class="image-preview" style="width: 64px; height: 64px;">${img.content}</div>
      </div>
      <div class="text-xs text-center text-gray-600 dark:text-slate-400 mt-1 truncate w-20">${img.name}</div>
      <textarea class="image-svg-content hidden">${escapeHtml(img.content)}</textarea>
    </div>
  `;
}

// Attach event handlers for image cards - click to download
function attachImageEventHandlers(container) {
  container.querySelectorAll('.image-icon-card').forEach(card => {
    card.addEventListener('click', () => {
      const imageName = card.dataset.imageName;
      const svgContent = card.querySelector('.image-svg-content').value;

      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${imageName}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  });
}

// Render a document card
function renderDocumentCard(doc, docType) {
  const docId = doc.id || doc.name || 'doc';
  const isExpanded = documentExpanded[docId] !== false; // Default to expanded
  const isLongContent = (doc.content || '').length > 500;

  // Determine badge color based on document type
  const typeBadgeColors = {
    'text': 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300',
    'markdown': 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    'json': 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    'code': 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
    'input': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400',
    'working': 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
    'output': 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
  };

  const contentType = doc.type || docType;
  const badgeColor = typeBadgeColors[contentType] || typeBadgeColors['text'];

  // Format last edited info for working docs
  let lastEditedHtml = '';
  if (docType === 'working' && doc.lastEditedBy) {
    const agentName = getAgentNameById(doc.lastEditedBy);
    const editTime = doc.lastEditedAt ? new Date(doc.lastEditedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    lastEditedHtml = `
      <div class="text-xs text-gray-500 dark:text-slate-500 mt-1">
        Last edited by <span class="font-medium text-gray-700 dark:text-slate-300">${agentName}</span>${editTime ? ` at ${editTime}` : ''}
      </div>
    `;
  }

  // Determine if content should use monospace font
  const isCodeLike = ['json', 'code'].includes(doc.type) ||
                     (doc.name && /\.(json|js|ts|py|md|txt)$/i.test(doc.name));
  const fontClass = isCodeLike ? 'font-mono text-xs' : 'text-sm';

  // Escape HTML in content
  const escapedContent = escapeHtml(doc.content || '');

  return `
    <div class="bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-200 dark:border-slate-600 overflow-hidden" data-doc-id="${docId}">
      <!-- Header -->
      <div class="flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-xs px-2 py-0.5 rounded ${badgeColor}">${contentType}</span>
          <span class="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">${doc.name || 'Untitled'}</span>
        </div>
        <div class="flex items-center gap-1">
          <button class="copy-doc-btn p-1.5 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-600 rounded transition-colors" title="Copy content">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <button class="download-doc-btn p-1.5 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-600 rounded transition-colors" title="Download file" data-filename="${doc.name || 'document.txt'}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          <button class="open-doc-btn p-1.5 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-600 rounded transition-colors" title="Open in new tab" data-filename="${doc.name || 'document.txt'}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
          ${isLongContent ? `
            <button class="toggle-doc-btn p-1.5 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-600 rounded transition-colors" title="${isExpanded ? 'Collapse' : 'Expand'}">
              <svg class="w-4 h-4 transform transition-transform ${isExpanded ? '' : '-rotate-90'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          ` : ''}
        </div>
      </div>
      ${lastEditedHtml}
      <!-- Content -->
      <div class="doc-content p-3 ${isExpanded ? '' : 'hidden'}">
        <pre class="${fontClass} text-gray-700 dark:text-slate-300 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">${escapedContent}</pre>
      </div>
    </div>
  `;
}

// Attach event handlers to document cards
function attachDocumentEventHandlers(container) {
  // Copy buttons
  container.querySelectorAll('.copy-doc-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const card = btn.closest('[data-doc-id]');
      if (!card) {
        console.error('Copy: Could not find card');
        return;
      }
      const pre = card.querySelector('pre');
      if (!pre) {
        console.error('Copy: Could not find pre element in card');
        return;
      }
      const content = pre.textContent;
      console.log('Copying:', content.substring(0, 50) + '...');
      copyToClipboard(content, btn);
    });
  });

  // Download buttons
  container.querySelectorAll('.download-doc-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const card = btn.closest('[data-doc-id]');
      if (!card) return;
      const pre = card.querySelector('pre');
      if (!pre) return;
      const content = pre.textContent;
      const filename = btn.dataset.filename || 'document.txt';

      // Create blob and download
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  });

  // Open in new tab buttons
  container.querySelectorAll('.open-doc-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const card = btn.closest('[data-doc-id]');
      if (!card) return;
      const pre = card.querySelector('pre');
      if (!pre) return;
      const content = pre.textContent;
      const filename = btn.dataset.filename || 'document.txt';

      // Determine MIME type based on filename
      let mimeType = 'text/plain';
      if (filename.endsWith('.html') || filename.endsWith('.htm')) {
        mimeType = 'text/html';
      } else if (filename.endsWith('.json')) {
        mimeType = 'application/json';
      } else if (filename.endsWith('.js')) {
        mimeType = 'text/javascript';
      } else if (filename.endsWith('.css')) {
        mimeType = 'text/css';
      } else if (filename.endsWith('.svg')) {
        mimeType = 'image/svg+xml';
      }

      // Create blob and open in new tab
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    });
  });

  // Toggle buttons
  container.querySelectorAll('.toggle-doc-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('[data-doc-id]');
      const docId = card.dataset.docId;
      const content = card.querySelector('.doc-content');
      const icon = btn.querySelector('svg');

      const isHidden = content.classList.contains('hidden');
      content.classList.toggle('hidden');
      icon.classList.toggle('-rotate-90', !isHidden);
      documentExpanded[docId] = isHidden;
    });
  });
}

// Render a completed form in a nice display format
function renderCompletedForm(completedForm, formDefinition) {
  const formName = completedForm.formName || 'Completed Form';
  const completedBy = completedForm.completedBy ? getAgentNameById(completedForm.completedBy) : 'Unknown';
  const completedAt = completedForm.completedAt ? new Date(completedForm.completedAt).toLocaleString() : '';
  const outcome = completedForm.caseOutcome || 'consensus';
  const selectedOption = completedForm.selectedOption || '';
  const data = completedForm.data || {};

  // Get field definitions if available
  const fieldDefs = formDefinition && formDefinition.fields ? formDefinition.fields : [];

  // Build field rows
  let fieldsHtml = '';

  // First render fields from the definition (in order)
  const renderedFields = new Set();
  for (const field of fieldDefs) {
    const value = data[field.name];
    renderedFields.add(field.name);
    fieldsHtml += renderFormField(field, value);
  }

  // Then render any additional data fields not in the definition
  for (const [key, value] of Object.entries(data)) {
    if (!renderedFields.has(key)) {
      fieldsHtml += renderFormField({ name: key, label: key, required: false, type: typeof value === 'boolean' ? 'checkbox' : 'text' }, value);
    }
  }

  // Outcome badge colors
  const outcomeBadgeColors = {
    'consensus': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    'majority': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    'compromise': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
    'deadlock': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    'timeout': 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
  };
  const outcomeBadgeColor = outcomeBadgeColors[outcome] || outcomeBadgeColors['consensus'];

  return `
    <div class="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border-2 border-green-300 dark:border-green-700 overflow-hidden" data-form-id="${escapeHtml(formName)}">
      <!-- Header -->
      <div class="bg-green-100 dark:bg-green-800/40 px-4 py-3 border-b border-green-200 dark:border-green-700">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-8 h-8 rounded-full bg-green-500 dark:bg-green-600">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-green-800 dark:text-green-200">${escapeHtml(formName)}</h3>
              <p class="text-sm text-green-600 dark:text-green-400">Form completed successfully</p>
            </div>
          </div>
          <button class="copy-form-btn p-2 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 hover:bg-green-200 dark:hover:bg-green-700/50 rounded-lg transition-colors" title="Copy form data">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Metadata -->
      <div class="px-4 py-3 bg-white/50 dark:bg-slate-800/30 border-b border-green-200 dark:border-green-700/50">
        <div class="flex flex-wrap gap-4 text-sm">
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-green-600 dark:text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span class="text-gray-600 dark:text-slate-400">Completed by:</span>
            <span class="font-medium text-gray-800 dark:text-slate-200">${escapeHtml(completedBy)}</span>
          </div>
          ${completedAt ? `
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-green-600 dark:text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span class="text-gray-600 dark:text-slate-400">At:</span>
            <span class="font-medium text-gray-800 dark:text-slate-200">${escapeHtml(completedAt)}</span>
          </div>
          ` : ''}
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-green-600 dark:text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span class="text-gray-600 dark:text-slate-400">Outcome:</span>
            <span class="px-2 py-0.5 rounded-full text-xs font-medium ${outcomeBadgeColor}">${escapeHtml(outcome)}</span>
          </div>
          ${selectedOption ? `
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-green-600 dark:text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            <span class="text-gray-600 dark:text-slate-400">Selected:</span>
            <span class="font-medium text-gray-800 dark:text-slate-200">${escapeHtml(selectedOption)}</span>
          </div>
          ` : ''}
        </div>
      </div>

      <!-- Form Fields -->
      <div class="p-4 space-y-3">
        ${fieldsHtml || '<p class="text-gray-500 dark:text-slate-500 text-sm italic text-center">No form data</p>'}
      </div>
    </div>
  `;
}

// Render a single form field in display mode
function renderFormField(field, value) {
  const label = field.label || field.name;
  const isRequired = field.required;
  const fieldType = field.type || 'text';

  // Format value based on type
  let displayValue = '';
  let valueClass = 'text-gray-800 dark:text-slate-200';

  if (fieldType === 'checkbox') {
    const isChecked = value === true || value === 'true';
    displayValue = isChecked ?
      '<span class="inline-flex items-center gap-1 text-green-600 dark:text-green-400"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg> Yes</span>' :
      '<span class="inline-flex items-center gap-1 text-gray-500 dark:text-slate-400"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg> No</span>';
  } else if (value === undefined || value === null || value === '') {
    displayValue = '<span class="text-gray-400 dark:text-slate-500 italic">Not provided</span>';
    valueClass = '';
  } else if (fieldType === 'textarea') {
    displayValue = `<div class="whitespace-pre-wrap ${valueClass}">${escapeHtml(String(value))}</div>`;
  } else if (fieldType === 'date') {
    try {
      const date = new Date(value);
      displayValue = `<span class="${valueClass}">${date.toLocaleDateString()}</span>`;
    } catch (e) {
      displayValue = `<span class="${valueClass}">${escapeHtml(String(value))}</span>`;
    }
  } else {
    displayValue = `<span class="${valueClass}">${escapeHtml(String(value))}</span>`;
  }

  // Required indicator
  const requiredBadge = isRequired ?
    '<span class="ml-1 text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">required</span>' : '';

  // Has value indicator for required fields
  const filledIndicator = isRequired && value !== undefined && value !== null && value !== '' ?
    '<svg class="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>' : '';

  return `
    <div class="bg-white dark:bg-slate-800/50 rounded-lg border border-green-100 dark:border-green-800/50 p-3">
      <div class="flex items-start justify-between gap-2 mb-1">
        <label class="text-sm font-medium text-gray-700 dark:text-slate-300">
          ${escapeHtml(label)}${requiredBadge}
        </label>
        ${filledIndicator}
      </div>
      <div class="text-sm">
        ${displayValue}
      </div>
    </div>
  `;
}

// Attach event handlers for completed form cards
function attachFormEventHandlers(container) {
  // Copy form data button
  container.querySelectorAll('.copy-form-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('[data-form-id]');
      // Get the current case's completed form data as JSON
      if (currentCase && currentCase.completedForm) {
        const jsonStr = JSON.stringify(currentCase.completedForm, null, 2);
        copyToClipboard(jsonStr, btn);
      }
    });
  });
}

// Copy text to clipboard with visual feedback
function copyToClipboard(text, btn) {
  // Try modern clipboard API first
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showCopySuccess(btn);
    }).catch(err => {
      console.warn('Clipboard API failed, trying fallback:', err);
      fallbackCopy(text, btn);
    });
  } else {
    fallbackCopy(text, btn);
  }
}

// Fallback copy method using textarea
function fallbackCopy(text, btn) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showCopySuccess(btn);
  } catch (err) {
    console.error('Fallback copy failed:', err);
    alert('Copy failed. Please select and copy manually.');
  }
  document.body.removeChild(textarea);
}

// Visual feedback for successful copy
function showCopySuccess(btn) {
  const originalHtml = btn.innerHTML;
  btn.innerHTML = `
    <svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
    </svg>
  `;
  setTimeout(() => {
    btn.innerHTML = originalHtml;
  }, 1500);
}

// Get agent name by ID
function getAgentNameById(agentId) {
  if (!currentCase || !currentCase.participants) return agentId;
  const participant = currentCase.participants.find(p => p.id === agentId);
  return participant ? participant.name : agentId;
}

// Escape HTML characters
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Refresh documents for current tab (called after case updates)
function refreshDocuments() {
  if (!currentCase) {
    // Clear all document panels when no case is selected
    const inputDocs = document.getElementById('input-documents');
    const workingDocs = document.getElementById('working-documents');
    const outputContent = document.getElementById('output-content');

    if (inputDocs) inputDocs.innerHTML = '<p class="text-gray-500 dark:text-slate-500 text-sm italic text-center">No input documents</p>';
    if (workingDocs) workingDocs.innerHTML = '<p class="text-gray-500 dark:text-slate-500 text-sm italic text-center">No working documents</p>';
    if (outputContent) outputContent.innerHTML = '<p class="text-gray-500 dark:text-slate-500 text-sm italic text-center">Output will appear when case is complete</p>';
    return;
  }

  if (currentDocumentTab === 'inputs') loadInputDocuments();
  else if (currentDocumentTab === 'working') loadWorkingDocuments();
  else if (currentDocumentTab === 'output') loadOutputContent();
}

function copyAgentUrl() {
  const url = document.getElementById('agent-prompt-url').value;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('copy-url-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.classList.contains('dark');
  html.classList.toggle('dark', !isDark);
  localStorage.setItem('stateloop-theme', isDark ? 'light' : 'dark');
}

function toggleZoomToAgent() {
  if (camera.isZoomedIn) {
    // Zoom out
    camera.targetX = 0;
    camera.targetY = 0;
    camera.targetZoom = 1;
    camera.isZoomedIn = false;
  } else {
    // Zoom in on current agent
    if (currentCase && currentCase.currentTurn) {
      const agent = agents[currentCase.currentTurn];
      if (agent) {
        // Center on agent
        camera.targetX = agent.x - canvas.width / 4;
        camera.targetY = agent.y - canvas.height / 4;
        camera.targetZoom = 2;
        camera.isZoomedIn = true;
      }
    }
  }
  updateZoomButton();
}

function updateZoomButton() {
  const btn = document.getElementById('zoom-agent-btn');
  if (btn) {
    btn.textContent = camera.isZoomedIn ? 'Zoom Out' : 'Zoom In';
  }
}

// Toggle between 2D and 3D (isometric) view
function toggleViewMode() {
  viewMode = viewMode === '2d' ? '3d' : '2d';
  updateViewModeButton();
}

function updateViewModeButton() {
  const btn = document.getElementById('view-mode-btn');
  if (btn) {
    btn.textContent = viewMode === '2d' ? '2D' : '3D';
    if (viewMode === '3d') {
      btn.classList.remove('bg-green-100', 'dark:bg-green-900/30', 'text-green-600', 'dark:text-green-400');
      btn.classList.add('bg-purple-100', 'dark:bg-purple-900/30', 'text-purple-600', 'dark:text-purple-400');
    } else {
      btn.classList.remove('bg-purple-100', 'dark:bg-purple-900/30', 'text-purple-600', 'dark:text-purple-400');
      btn.classList.add('bg-green-100', 'dark:bg-green-900/30', 'text-green-600', 'dark:text-green-400');
    }
  }
}

// Update the Agent Thoughts sidebar panel with current speaker's thoughts
function updateThoughtsPanel(message) {
  const thoughtsText = document.getElementById('thoughts-text');
  const thoughtsSpeaker = document.getElementById('thoughts-speaker');
  const thoughtsContent = document.getElementById('thoughts-content');

  if (!thoughtsText) return;

  if (message && message.thoughts) {
    // Find speaker name
    let speakerName = message.author;
    if (currentCase && currentCase.participants) {
      const participant = currentCase.participants.find(p => p.id === message.author);
      if (participant) speakerName = participant.name;
    }

    // Update speaker label
    if (thoughtsSpeaker) {
      thoughtsSpeaker.textContent = `- ${speakerName}`;
    }

    // Update thoughts text
    thoughtsText.textContent = message.thoughts;
    thoughtsText.classList.remove('text-purple-500');
    thoughtsText.classList.add('text-purple-700', 'dark:text-purple-300');

    // Auto-expand when there are new thoughts
    if (thoughtsContent) {
      thoughtsContent.style.display = 'block';
      const chevron = document.getElementById('thoughts-chevron');
      if (chevron) chevron.style.transform = 'rotate(180deg)';
    }
  } else {
    // No thoughts available
    if (thoughtsSpeaker) thoughtsSpeaker.textContent = '';
    thoughtsText.textContent = 'No thoughts to display. Agent internal reasoning will appear here when available.';
    thoughtsText.classList.add('text-purple-500');
    thoughtsText.classList.remove('text-purple-700', 'dark:text-purple-300');
  }
}

function updateCamera() {
  // Smooth lerp toward target
  const lerpSpeed = 0.08;
  camera.x += (camera.targetX - camera.x) * lerpSpeed;
  camera.y += (camera.targetY - camera.y) * lerpSpeed;
  camera.zoom += (camera.targetZoom - camera.zoom) * lerpSpeed;

  // If zoomed in, frame current agent + previous 2 speakers
  if (camera.isZoomedIn && currentCase) {
    const agentsToFrame = getRecentSpeakers(3);

    if (agentsToFrame.length > 0) {
      // Calculate bounding box for all agents to frame
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;

      for (const agentId of agentsToFrame) {
        const agent = agents[agentId];
        if (agent) {
          minX = Math.min(minX, agent.x);
          maxX = Math.max(maxX, agent.x);
          minY = Math.min(minY, agent.y);
          maxY = Math.max(maxY, agent.y);
        }
      }

      // Add padding around the bounding box
      const padding = 150;
      minX -= padding;
      maxX += padding;
      minY -= padding;
      maxY += padding;

      // Calculate center and required zoom
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const boxWidth = maxX - minX;
      const boxHeight = maxY - minY;

      // Calculate zoom to fit all agents (but cap at 2x)
      const zoomX = canvas.width / boxWidth;
      const zoomY = canvas.height / boxHeight;
      const fitZoom = Math.min(zoomX, zoomY, 2.0);

      camera.targetX = centerX - canvas.width / (2 * fitZoom);
      camera.targetY = centerY - canvas.height / (2 * fitZoom);
      camera.targetZoom = Math.max(1.2, fitZoom); // At least 1.2x zoom
    }
  }
}

// Get the most recent N speakers from the message history
function getRecentSpeakers(count) {
  const speakers = [];

  // Always include current turn if set
  if (currentCase && currentCase.currentTurn && agents[currentCase.currentTurn]) {
    speakers.push(currentCase.currentTurn);
  }

  // Add previous speakers from message history
  if (currentCase && currentCase.messages) {
    const recentMessages = [...currentCase.messages].reverse();
    for (const msg of recentMessages) {
      if (speakers.length >= count) break;
      if (msg.author && agents[msg.author] && !speakers.includes(msg.author)) {
        speakers.push(msg.author);
      }
    }
  }

  return speakers;
}


function copyCurlGet() {
  const cmd = document.getElementById('curl-get-cmd').textContent;
  navigator.clipboard.writeText(cmd).then(() => {
    const btn = document.getElementById('copy-curl-get');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy curl command'; }, 2000);
  });
}

// Rendering
function render() {
  // Update camera
  updateCamera();

  // Double buffering: draw to offscreen buffer first
  const drawCtx = bufferCtx || ctx;
  const originalCtx = ctx;
  ctx = drawCtx;  // Temporarily swap so all drawing goes to buffer

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Apply camera transform
  ctx.save();
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  // Draw location-appropriate background
  drawBackground();

  // Draw furniture items in the room
  drawRoomFurniture();

  // Draw location title
  drawLocationTitle();

  // Only draw options and agents AFTER setup is complete (has messages)
  const setupComplete = currentCase && currentCase.messages && currentCase.messages.length > 0;

  // Show setup phase message if case exists but no messages yet
  if (currentCase && !setupComplete) {
    drawSetupPhaseOverlay();
  }

  // Draw option cards (only after setup)
  if (setupComplete) {
    drawOptions();
  }

  // Draw agents (only after setup)
  if (setupComplete) {
    // Sort agents by Y position for proper depth ordering in 3D mode
    const agentEntries = Object.entries(agents)
      .filter(([id]) => currentCase.participants.some(p => p.id === id))
      .sort((a, b) => a[1].y - b[1].y);

    agentEntries.forEach(([id, agent]) => {
      if (viewMode === '3d') {
        drawAgent3D(agent, id);
      } else {
        drawAgent(agent, id);
      }
    });
  }

  // Draw chitchat bubbles (only when no case active - NOT during setup phase or active negotiations)
  // Note: When a case exists, we're either in setup or negotiation - no chitchat in either
  if (!currentCase && Object.keys(agents).length > 0) {
    Object.entries(agents).forEach(([_id, agent]) => {
      if (agent.idleAction === 'chitchat' && agent.chitchatMessage) {
        drawChitchatBubble(agent);
      }
    });
  }

  // Draw speech bubble only when actively displaying a message
  // Don't show bubble when idle (no currentDisplayMessage)
  if (setupComplete && currentDisplayMessage) {
    const speaker = agents[currentDisplayMessage.author];
    if (speaker) {
      // Set the speaker's message to the display message
      speaker.message = currentDisplayMessage.content;
      speaker.messageType = currentDisplayMessage.type;
      drawSpeechBubble(speaker);

      // Draw thought bubble if the message has thoughts (shown to observers only)
      if (currentDisplayMessage.thoughts) {
        drawThoughtBubble(speaker, currentDisplayMessage.thoughts);
      }
    }
  }

  // Draw resolved overlay LAST so it's on top - but only after message queue is empty
  if (currentCase && currentCase.status === 'resolved' && !isQueueBusy()) {
    drawResolvedOverlay();
  }

  // Restore camera transform
  ctx.restore();

  // Draw zoom indicator (outside camera transform)
  if (camera.isZoomedIn) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Zoomed: ' + Math.round(camera.zoom * 100) + '%', canvas.width - 10, 20);
  }

  // Double buffering: copy buffer to visible canvas in one operation
  if (bufferCanvas && originalCtx !== drawCtx) {
    ctx = originalCtx;  // Restore original context
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bufferCanvas, 0, 0);
  }

  requestAnimationFrame(render);
}

// Main background dispatcher based on location type
function drawBackground() {
  // Use isometric backgrounds in 3D mode
  if (viewMode === '3d') {
    drawIsometricBackground();
    return;
  }

  // 2D mode - use flat backgrounds
  switch (currentLocation.type) {
    case 'hospital':
      drawHospitalBackground();
      break;
    case 'office':
      drawOfficeBackground();
      break;
    case 'library':
      drawLibraryBackground();
      break;
    case 'school':
      drawSchoolBackground();
      break;
    case 'cafe':
      drawCafeBackground();
      break;
    case 'park':
    default:
      drawParkBackground();
      break;
  }
}

// === ISOMETRIC 3D BACKGROUND ===
function drawIsometricBackground() {
  const roomWidth = 600;
  const roomDepth = 400;
  const wallHeight = 150;
  // Position room in world coordinates (camera transform is applied in render)
  // Center the room so it fits well in the view
  const originX = 350;
  const originY = 180;

  // Isometric transformation helper
  function toIso(x, y, z = 0) {
    return {
      x: originX + (x - y) * 0.7,
      y: originY + (x + y) * 0.35 - z
    };
  }

  // Get colors based on location type
  let floorColor, wallColor, accentColor;
  switch (currentLocation.type) {
    case 'hospital':
      floorColor = '#e8e4df';
      wallColor = '#f5f5f0';
      accentColor = '#0077b6';
      break;
    case 'office':
      floorColor = '#7a8a7a';
      wallColor = '#e0e0e0';
      accentColor = '#2c3e50';
      break;
    case 'library':
      floorColor = '#8b6914';
      wallColor = '#f5f5dc';
      accentColor = '#4a3728';
      break;
    case 'school':
      floorColor = '#d4c4a8';
      wallColor = '#fafaf0';
      accentColor = '#1a5f7a';
      break;
    case 'cafe':
      floorColor = '#a0522d';
      wallColor = '#f5deb3';
      accentColor = '#3e2723';
      break;
    case 'park':
    default:
      floorColor = '#4a7c59';
      wallColor = '#87ceeb';
      accentColor = '#2e7d32';
      break;
  }

  // Sky/ambient background
  ctx.fillStyle = currentLocation.type === 'park' ? '#87ceeb' : '#d0d8e0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Floor corners in room coordinates (0,0 is back-left)
  const floorPoints = [
    toIso(0, 0),                    // back-left
    toIso(roomWidth, 0),            // back-right
    toIso(roomWidth, roomDepth),    // front-right
    toIso(0, roomDepth)             // front-left
  ];

  // Draw floor
  ctx.beginPath();
  ctx.moveTo(floorPoints[0].x, floorPoints[0].y);
  ctx.lineTo(floorPoints[1].x, floorPoints[1].y);
  ctx.lineTo(floorPoints[2].x, floorPoints[2].y);
  ctx.lineTo(floorPoints[3].x, floorPoints[3].y);
  ctx.closePath();
  ctx.fillStyle = floorColor;
  ctx.fill();

  // Floor grid lines
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  const gridSize = 60;

  // Lines parallel to right wall
  for (let x = 0; x <= roomWidth; x += gridSize) {
    const start = toIso(x, 0);
    const end = toIso(x, roomDepth);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  // Lines parallel to left wall
  for (let y = 0; y <= roomDepth; y += gridSize) {
    const start = toIso(0, y);
    const end = toIso(roomWidth, y);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  // Left wall (if not park)
  if (currentLocation.type !== 'park') {
    const leftWall = [
      toIso(0, 0),
      toIso(0, 0, wallHeight),
      toIso(0, roomDepth, wallHeight),
      toIso(0, roomDepth)
    ];
    ctx.beginPath();
    ctx.moveTo(leftWall[0].x, leftWall[0].y);
    ctx.lineTo(leftWall[1].x, leftWall[1].y);
    ctx.lineTo(leftWall[2].x, leftWall[2].y);
    ctx.lineTo(leftWall[3].x, leftWall[3].y);
    ctx.closePath();
    ctx.fillStyle = wallColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.stroke();

    // Left wall trim
    const trimHeight = 10;
    const leftTrim = [
      toIso(0, 0, trimHeight),
      toIso(0, 0),
      toIso(0, roomDepth),
      toIso(0, roomDepth, trimHeight)
    ];
    ctx.beginPath();
    ctx.moveTo(leftTrim[0].x, leftTrim[0].y);
    ctx.lineTo(leftTrim[1].x, leftTrim[1].y);
    ctx.lineTo(leftTrim[2].x, leftTrim[2].y);
    ctx.lineTo(leftTrim[3].x, leftTrim[3].y);
    ctx.closePath();
    ctx.fillStyle = accentColor;
    ctx.fill();
  }

  // Back wall (if not park)
  if (currentLocation.type !== 'park') {
    const backWall = [
      toIso(0, 0),
      toIso(0, 0, wallHeight),
      toIso(roomWidth, 0, wallHeight),
      toIso(roomWidth, 0)
    ];
    ctx.beginPath();
    ctx.moveTo(backWall[0].x, backWall[0].y);
    ctx.lineTo(backWall[1].x, backWall[1].y);
    ctx.lineTo(backWall[2].x, backWall[2].y);
    ctx.lineTo(backWall[3].x, backWall[3].y);
    ctx.closePath();
    ctx.fillStyle = wallColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.stroke();

    // Back wall trim
    const backTrim = [
      toIso(0, 0, 10),
      toIso(0, 0),
      toIso(roomWidth, 0),
      toIso(roomWidth, 0, 10)
    ];
    ctx.beginPath();
    ctx.moveTo(backTrim[0].x, backTrim[0].y);
    ctx.lineTo(backTrim[1].x, backTrim[1].y);
    ctx.lineTo(backTrim[2].x, backTrim[2].y);
    ctx.lineTo(backTrim[3].x, backTrim[3].y);
    ctx.closePath();
    ctx.fillStyle = accentColor;
    ctx.fill();

    // Window on back wall (if indoor location)
    if (currentLocation.type !== 'park') {
      const windowX = roomWidth / 2 - 50;
      const windowW = 100;
      const windowBottom = 40;
      const windowTop = 100;

      const windowShape = [
        toIso(windowX, 0, windowBottom),
        toIso(windowX, 0, windowTop),
        toIso(windowX + windowW, 0, windowTop),
        toIso(windowX + windowW, 0, windowBottom)
      ];
      ctx.beginPath();
      ctx.moveTo(windowShape[0].x, windowShape[0].y);
      ctx.lineTo(windowShape[1].x, windowShape[1].y);
      ctx.lineTo(windowShape[2].x, windowShape[2].y);
      ctx.lineTo(windowShape[3].x, windowShape[3].y);
      ctx.closePath();
      ctx.fillStyle = '#87ceeb';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  // Draw location-specific decorations in isometric
  drawIsometricDecorations(toIso, roomWidth, roomDepth, wallHeight);
}

// Draw location-specific decorations in isometric view
function drawIsometricDecorations(toIso, roomWidth, roomDepth, _wallHeight) {
  switch (currentLocation.type) {
    case 'hospital':
      // Nurse station (back-left corner)
      drawLocationIsoBox(toIso, 30, 30, 120, 60, 40, '#2c5f7c', '#1a3d4d');
      // Hospital beds
      for (let i = 0; i < 3; i++) {
        const bedX = 180 + i * 140;
        drawLocationIsoBox(toIso, bedX, 60, 80, 45, 25, '#c0c0c0', '#909090');
        // Mattress
        drawLocationIsoBox(toIso, bedX + 5, 62, 70, 38, 5, '#e8f4f8', '#d0e4e8');
        // Pillow
        drawLocationIsoBox(toIso, bedX + 55, 68, 18, 15, 8, '#ffffff', '#e0e0e0');
      }
      break;

    case 'office':
      // Conference table (center)
      drawLocationIsoBox(toIso, roomWidth/2 - 100, roomDepth/2 - 40, 200, 80, 30, '#4a3728', '#2c1810');
      // Chairs around table
      for (let i = 0; i < 4; i++) {
        drawLocationIsoBox(toIso, roomWidth/2 - 80 + i*50, roomDepth/2 - 70, 35, 25, 40, '#333', '#222');
        drawLocationIsoBox(toIso, roomWidth/2 - 80 + i*50, roomDepth/2 + 60, 35, 25, 40, '#333', '#222');
      }
      break;

    case 'library':
      // Bookshelves along back wall - improved with detailed books
      for (let i = 0; i < 4; i++) {
        const shelfX = 50 + i * 140;
        // Main bookshelf frame (dark wood)
        drawLocationIsoBox(toIso, shelfX, 15, 120, 35, 130, '#3e2723', '#2c1810');
        // Shelf dividers
        drawLocationIsoBox(toIso, shelfX + 5, 18, 110, 30, 5, '#4a3728', '#3e2723');
        drawLocationIsoBox(toIso, shelfX + 5, 18, 110, 30, 45, '#4a3728', '#3e2723');
        drawLocationIsoBox(toIso, shelfX + 5, 18, 110, 30, 85, '#4a3728', '#3e2723');
        // Books on each shelf (varied colors)
        const bookColors = [
          ['#c0392b', '#a02818'], ['#2980b9', '#1a5276'], ['#27ae60', '#1e8449'],
          ['#8e44ad', '#6c3483'], ['#d35400', '#a04000'], ['#16a085', '#117a65']
        ];
        for (let shelf = 0; shelf < 3; shelf++) {
          const baseZ = 8 + shelf * 40;
          let bookX = shelfX + 8;
          while (bookX < shelfX + 110) {
            const bookW = 8 + Math.floor((bookX * 7 + shelf) % 6);
            const bookH = 28 + ((bookX + shelf * 3) % 8);
            const colorIdx = (bookX + shelf * 2) % bookColors.length;
            drawLocationIsoBox(toIso, bookX, 20, bookW, 22, baseZ + bookH, bookColors[colorIdx][0], bookColors[colorIdx][1]);
            bookX += bookW + 2;
          }
        }
        // Top molding
        drawLocationIsoBox(toIso, shelfX - 3, 12, 126, 38, 132, '#2e1b14', '#1a0f0a');
      }
      // Reading tables with chairs
      drawLocationIsoBox(toIso, 150, 200, 100, 60, 30, '#5d4037', '#3e2723');
      drawLocationIsoBox(toIso, 140, 180, 25, 25, 35, '#4a3728', '#3e2723'); // Chair
      drawLocationIsoBox(toIso, 225, 180, 25, 25, 35, '#4a3728', '#3e2723'); // Chair
      drawLocationIsoBox(toIso, 350, 200, 100, 60, 30, '#5d4037', '#3e2723');
      drawLocationIsoBox(toIso, 340, 180, 25, 25, 35, '#4a3728', '#3e2723'); // Chair
      drawLocationIsoBox(toIso, 425, 180, 25, 25, 35, '#4a3728', '#3e2723'); // Chair
      break;

    case 'school':
      // Teacher's desk
      drawLocationIsoBox(toIso, roomWidth/2 - 60, 40, 120, 50, 30, '#5d4037', '#3e2723');
      // Blackboard on back wall (just a darker rectangle)
      const bbX = roomWidth/2 - 80;
      const bbPts = [
        toIso(bbX, 0, 50),
        toIso(bbX, 0, 120),
        toIso(bbX + 160, 0, 120),
        toIso(bbX + 160, 0, 50)
      ];
      ctx.beginPath();
      ctx.moveTo(bbPts[0].x, bbPts[0].y);
      ctx.lineTo(bbPts[1].x, bbPts[1].y);
      ctx.lineTo(bbPts[2].x, bbPts[2].y);
      ctx.lineTo(bbPts[3].x, bbPts[3].y);
      ctx.closePath();
      ctx.fillStyle = '#1a3d1a';
      ctx.fill();
      // Student desks
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 4; col++) {
          drawLocationIsoBox(toIso, 100 + col * 110, 150 + row * 100, 80, 50, 28, '#d4a574', '#b08050');
        }
      }
      break;

    case 'cafe':
      // Draw detailed cafe/bar counter
      drawIsoCafeCounter(toIso, 100, 30, 400, 70);
      // Cafe tables with stools
      drawIsoCafeTable(toIso, 150, 200);
      drawIsoCafeTable(toIso, 350, 200);
      drawIsoCafeTable(toIso, 500, 200);
      drawIsoCafeTable(toIso, 250, 320);
      drawIsoCafeTable(toIso, 400, 320);
      break;

    case 'park':
    default:
      // Trees
      drawLocationIsoTree(toIso, 80, 80);
      drawLocationIsoTree(toIso, 520, 60);
      drawLocationIsoTree(toIso, 100, 350);
      drawLocationIsoTree(toIso, 500, 320);
      // Park bench
      drawLocationIsoBox(toIso, 250, 150, 100, 35, 25, '#5d4037', '#3e2723');
      drawLocationIsoBox(toIso, 250, 145, 100, 5, 45, '#5d4037', '#3e2723');
      break;
  }
}

// Helper to draw an isometric box for locations
function drawLocationIsoBox(toIso, x, y, w, d, h, topColor, sideColor) {
  // Top face
  const top = [
    toIso(x, y, h),
    toIso(x + w, y, h),
    toIso(x + w, y + d, h),
    toIso(x, y + d, h)
  ];
  ctx.beginPath();
  ctx.moveTo(top[0].x, top[0].y);
  ctx.lineTo(top[1].x, top[1].y);
  ctx.lineTo(top[2].x, top[2].y);
  ctx.lineTo(top[3].x, top[3].y);
  ctx.closePath();
  ctx.fillStyle = topColor;
  ctx.fill();

  // Right face
  const right = [
    toIso(x + w, y, 0),
    toIso(x + w, y, h),
    toIso(x + w, y + d, h),
    toIso(x + w, y + d, 0)
  ];
  ctx.beginPath();
  ctx.moveTo(right[0].x, right[0].y);
  ctx.lineTo(right[1].x, right[1].y);
  ctx.lineTo(right[2].x, right[2].y);
  ctx.lineTo(right[3].x, right[3].y);
  ctx.closePath();
  ctx.fillStyle = sideColor;
  ctx.fill();

  // Front face
  const front = [
    toIso(x, y + d, 0),
    toIso(x, y + d, h),
    toIso(x + w, y + d, h),
    toIso(x + w, y + d, 0)
  ];
  ctx.beginPath();
  ctx.moveTo(front[0].x, front[0].y);
  ctx.lineTo(front[1].x, front[1].y);
  ctx.lineTo(front[2].x, front[2].y);
  ctx.lineTo(front[3].x, front[3].y);
  ctx.closePath();
  // Front is slightly lighter than side
  const frontColor = sideColor.replace(/[0-9a-f]{2}$/i, m => {
    const val = Math.min(255, parseInt(m, 16) + 20);
    return val.toString(16).padStart(2, '0');
  });
  ctx.fillStyle = frontColor;
  ctx.fill();
}

// Isometric cafe/bar counter with details
function drawIsoCafeCounter(toIso, x, y, width, depth) {
  // Main counter base
  drawLocationIsoBox(toIso, x, y, width, depth, 40, '#3e2723', '#2c1a16');

  // Counter top (lighter wood)
  drawLocationIsoBox(toIso, x - 5, y - 5, width + 10, depth + 10, 5, '#5d4037', '#4a3530');

  // Coffee machine
  const machineX = x + 80;
  const machineY = y + 15;
  // Machine body
  drawLocationIsoBox(toIso, machineX, machineY, 50, 40, 50, '#1a1a1a', '#111');
  // Machine top
  drawLocationIsoBox(toIso, machineX + 5, machineY + 5, 40, 30, 15, '#2c2c2c', '#1a1a1a');
  // Steam wand
  const wandBot = toIso(machineX + 45, machineY + 35, 30);
  const wandTop = toIso(machineX + 50, machineY + 40, 20);
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(wandBot.x, wandBot.y);
  ctx.lineTo(wandTop.x, wandTop.y);
  ctx.stroke();
  // Indicator light
  const lightPos = toIso(machineX + 15, machineY + 10, 55);
  ctx.fillStyle = '#00ff00';
  ctx.beginPath();
  ctx.arc(lightPos.x, lightPos.y, 3, 0, Math.PI * 2);
  ctx.fill();

  // Cash register
  const regX = x + 280;
  const regY = y + 15;
  drawLocationIsoBox(toIso, regX, regY, 50, 40, 25, '#2c2c2c', '#1a1a1a');
  // Register screen
  const screenPts = [
    toIso(regX + 10, regY + 5, 35),
    toIso(regX + 40, regY + 5, 35),
    toIso(regX + 40, regY + 5, 50),
    toIso(regX + 10, regY + 5, 50)
  ];
  ctx.beginPath();
  ctx.moveTo(screenPts[0].x, screenPts[0].y);
  ctx.lineTo(screenPts[1].x, screenPts[1].y);
  ctx.lineTo(screenPts[2].x, screenPts[2].y);
  ctx.lineTo(screenPts[3].x, screenPts[3].y);
  ctx.closePath();
  ctx.fillStyle = '#1a4a1a';
  ctx.fill();

  // Display case (glass front with pastries)
  const caseX = x + 170;
  const caseY = y + 10;
  // Case frame
  drawLocationIsoBox(toIso, caseX, caseY, 80, 50, 35, '#d4a574', '#b08050');
  // Glass front
  const glassPts = [
    toIso(caseX, caseY + 50, 5),
    toIso(caseX + 80, caseY + 50, 5),
    toIso(caseX + 80, caseY + 50, 32),
    toIso(caseX, caseY + 50, 32)
  ];
  ctx.beginPath();
  ctx.moveTo(glassPts[0].x, glassPts[0].y);
  ctx.lineTo(glassPts[1].x, glassPts[1].y);
  ctx.lineTo(glassPts[2].x, glassPts[2].y);
  ctx.lineTo(glassPts[3].x, glassPts[3].y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(200, 230, 255, 0.4)';
  ctx.fill();
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Pastries in display
  const pastryColors = ['#d4956a', '#c9a86c', '#e8c47a'];
  for (let i = 0; i < 3; i++) {
    const px = caseX + 15 + i * 25;
    const py = caseY + 20;
    const pos = toIso(px, py, 10);
    ctx.fillStyle = pastryColors[i];
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Menu board on wall behind counter
  const boardPts = [
    toIso(x + 120, y - 10, 80),
    toIso(x + 280, y - 10, 80),
    toIso(x + 280, y - 10, 140),
    toIso(x + 120, y - 10, 140)
  ];
  ctx.beginPath();
  ctx.moveTo(boardPts[0].x, boardPts[0].y);
  ctx.lineTo(boardPts[1].x, boardPts[1].y);
  ctx.lineTo(boardPts[2].x, boardPts[2].y);
  ctx.lineTo(boardPts[3].x, boardPts[3].y);
  ctx.closePath();
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();
  // Menu text lines
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 4; i++) {
    const lineY = 95 + i * 10;
    const left = toIso(x + 130, y - 10, lineY);
    const right = toIso(x + 260, y - 10, lineY);
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();
  }

  // Bar stools at counter
  drawIsoCafeStool(toIso, x + 50, y + depth + 30);
  drawIsoCafeStool(toIso, x + 150, y + depth + 30);
  drawIsoCafeStool(toIso, x + 250, y + depth + 30);
  drawIsoCafeStool(toIso, x + 350, y + depth + 30);
}

// Isometric cafe table with stools
function drawIsoCafeTable(toIso, x, y) {
  // Draw stools around the table first (behind the table)
  drawIsoCafeStool(toIso, x - 15, y + 18);  // Left stool
  drawIsoCafeStool(toIso, x + 18, y - 15);  // Top stool

  // Table pedestal (center pole)
  const centerX = x + 18;
  const centerY = y + 18;

  // Pedestal base
  const basePoints = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    basePoints.push(toIso(centerX + Math.cos(angle) * 10, centerY + Math.sin(angle) * 10, 0));
  }
  ctx.beginPath();
  ctx.moveTo(basePoints[0].x, basePoints[0].y);
  for (let i = 1; i < 6; i++) {
    ctx.lineTo(basePoints[i].x, basePoints[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();

  // Pedestal pole
  const poleBot = toIso(centerX, centerY, 2);
  const poleTop = toIso(centerX, centerY, 26);
  ctx.strokeStyle = '#2c2c2c';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(poleBot.x, poleBot.y);
  ctx.lineTo(poleTop.x, poleTop.y);
  ctx.stroke();
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(poleBot.x - 1, poleBot.y);
  ctx.lineTo(poleTop.x - 1, poleTop.y);
  ctx.stroke();

  // Table top (circular approximated as polygon)
  const radius = 32;
  const tableTop = [];
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    tableTop.push(toIso(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, 28));
  }

  // Table edge (darker)
  ctx.beginPath();
  ctx.moveTo(tableTop[0].x, tableTop[0].y + 3);
  for (let i = 1; i < 12; i++) {
    ctx.lineTo(tableTop[i].x, tableTop[i].y + 3);
  }
  ctx.closePath();
  ctx.fillStyle = '#3e2723';
  ctx.fill();

  // Table surface
  ctx.beginPath();
  ctx.moveTo(tableTop[0].x, tableTop[0].y);
  for (let i = 1; i < 12; i++) {
    ctx.lineTo(tableTop[i].x, tableTop[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = '#5d4037';
  ctx.fill();

  // Table surface highlight
  ctx.beginPath();
  ctx.moveTo(tableTop[0].x, tableTop[0].y);
  for (let i = 1; i < 6; i++) {
    ctx.lineTo(tableTop[i].x, tableTop[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = '#6d5047';
  ctx.fill();

  // Draw front stools (in front of table)
  drawIsoCafeStool(toIso, x + 50, y + 18);  // Right stool
  drawIsoCafeStool(toIso, x + 18, y + 50);  // Bottom stool
}

// Isometric cafe stool
function drawIsoCafeStool(toIso, x, y) {
  // Stool legs (4 angled legs)
  const legColor = '#2c2c2c';
  const legPositions = [
    {dx: -6, dy: -6}, {dx: 6, dy: -6},
    {dx: -6, dy: 6}, {dx: 6, dy: 6}
  ];

  for (const leg of legPositions) {
    const bot = toIso(x + leg.dx * 1.5, y + leg.dy * 1.5, 0);
    const top = toIso(x + leg.dx, y + leg.dy, 18);
    ctx.strokeStyle = legColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bot.x, bot.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
  }

  // Foot ring
  const ringPoints = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    ringPoints.push(toIso(x + Math.cos(angle) * 7, y + Math.sin(angle) * 7, 8));
  }
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ringPoints[0].x, ringPoints[0].y);
  for (let i = 1; i < 8; i++) {
    ctx.lineTo(ringPoints[i].x, ringPoints[i].y);
  }
  ctx.closePath();
  ctx.stroke();

  // Seat (circular)
  const seatPoints = [];
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    seatPoints.push(toIso(x + Math.cos(angle) * 10, y + Math.sin(angle) * 10, 20));
  }

  // Seat edge
  ctx.beginPath();
  ctx.moveTo(seatPoints[0].x, seatPoints[0].y + 2);
  for (let i = 1; i < 10; i++) {
    ctx.lineTo(seatPoints[i].x, seatPoints[i].y + 2);
  }
  ctx.closePath();
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();

  // Seat top
  ctx.beginPath();
  ctx.moveTo(seatPoints[0].x, seatPoints[0].y);
  for (let i = 1; i < 10; i++) {
    ctx.lineTo(seatPoints[i].x, seatPoints[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = '#2c2c2c';
  ctx.fill();

  // Seat cushion highlight
  const cushionPoints = [];
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    cushionPoints.push(toIso(x + Math.cos(angle) * 7, y + Math.sin(angle) * 7, 21));
  }
  ctx.beginPath();
  ctx.moveTo(cushionPoints[0].x, cushionPoints[0].y);
  for (let i = 1; i < 10; i++) {
    ctx.lineTo(cushionPoints[i].x, cushionPoints[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = '#3d3d3d';
  ctx.fill();
}

// Isometric tree for locations
function drawLocationIsoTree(toIso, x, y) {
  // Trunk
  drawLocationIsoBox(toIso, x + 5, y + 5, 10, 10, 40, '#5d4037', '#3e2723');
  // Foliage (simple layered circles as boxes)
  const pos = toIso(x + 10, y + 10, 50);
  ctx.fillStyle = '#2e7d32';
  ctx.beginPath();
  ctx.arc(pos.x, pos.y - 15, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#388e3c';
  ctx.beginPath();
  ctx.arc(pos.x - 8, pos.y - 5, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(pos.x + 8, pos.y - 5, 22, 0, Math.PI * 2);
  ctx.fill();
}

// Draw furniture items placed in the room
function drawRoomFurniture() {
  if (!roomFurniture || roomFurniture.length === 0) return;

  // Sort by Y position for proper depth ordering
  const sorted = [...roomFurniture].sort((a, b) => a.y - b.y);

  for (const item of sorted) {
    // Draw in 2D or 3D based on current view mode
    if (viewMode === '3d') {
      drawIsometricFurniture(item, item.x, item.y, 1, item.rotation || 0);
    } else {
      draw2DFurniture(item, item.x, item.y, 1);
    }

    // Draw item name label - only in 2D mode (in 3D the positions are transformed)
    if (viewMode === '2d') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(item.name, item.x + 20, item.y + 15);
    }
  }
}

// Draw 2D top-down furniture item
function draw2DFurniture(item, x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  const w = (item.size?.w || 40) * 0.5;
  const h = (item.size?.h || 40) * 0.5;

  // Simple 2D top-down representation
  switch (item.id) {
    case 'cafe_counter':
      ctx.fillStyle = '#3e2723';
      ctx.fillRect(-w/2, -h/2, w, h);
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(-w/2 + 2, -h/2 + 2, w - 4, h - 4);
      break;
    case 'cafe_table':
      ctx.fillStyle = '#5d4037';
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8d6e63';
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) / 2 - 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'coffee_machine':
      ctx.fillStyle = '#212121';
      ctx.fillRect(-w/2, -h/2, w, h);
      ctx.fillStyle = '#b71c1c';
      ctx.fillRect(-w/2 + 4, -h/2 + 4, 10, 8);
      break;
    case 'menu_board':
      ctx.fillStyle = '#1b1b1b';
      ctx.fillRect(-w/2, -h/2, w, h);
      ctx.fillStyle = '#fff';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MENU', 0, 0);
      break;
    case 'hanging_light':
    case 'pendant_light':
      ctx.fillStyle = '#ffd54f';
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'bar_stool':
      ctx.fillStyle = '#5d4037';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8d6e63';
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      break;
    default:
      // Generic rectangle
      ctx.fillStyle = '#888';
      ctx.fillRect(-w/2, -h/2, w, h);
      ctx.fillStyle = '#aaa';
      ctx.fillRect(-w/2 + 2, -h/2 + 2, w - 4, h - 4);
  }

  ctx.restore();
}

// Draw location title at top of screen
function drawLocationTitle() {
  if (!currentLocation.name && !currentLocation.subtitle) return;

  const title = currentLocation.name || '';
  const subtitle = currentLocation.subtitle || '';

  // Background banner
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, canvas.width, subtitle ? 55 : 40);

  // Main title
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, canvas.width / 2, 25);

  // Subtitle
  if (subtitle) {
    ctx.fillStyle = '#ccc';
    ctx.font = '13px sans-serif';
    ctx.fillText(subtitle, canvas.width / 2, 45);
  }
}

// === PARK BACKGROUND (default) ===
function drawParkBackground() {
  // Grass base
  ctx.fillStyle = '#4a7c59';
  ctx.fillRect(camera.x - 100, camera.y - 100, canvas.width / camera.zoom + 200, canvas.height / camera.zoom + 200);
  drawGrassTexture();
  drawTrees();
  drawPath();
}

function drawGrassTexture() {
  ctx.fillStyle = '#3d6b4a';
  for (let i = 0; i < 200; i++) {
    const x = (Math.sin(i * 123.456) * 0.5 + 0.5) * canvas.width;
    const y = (Math.cos(i * 789.012) * 0.5 + 0.5) * canvas.height;
    ctx.fillRect(x, y, 2, 4);
  }
}

// === HOSPITAL BACKGROUND ===
function drawHospitalBackground() {
  // Floor - light linoleum
  ctx.fillStyle = '#e8e4df';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Floor tile pattern
  ctx.strokeStyle = '#d0ccc7';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Walls at top
  ctx.fillStyle = '#f5f5f0';
  ctx.fillRect(0, 0, canvas.width, 100);

  // Wall trim
  ctx.fillStyle = '#0077b6';
  ctx.fillRect(0, 95, canvas.width, 8);

  // Nurse station on left
  ctx.fillStyle = '#2c5f7c';
  ctx.fillRect(20, 110, 120, 60);
  ctx.fillStyle = '#fff';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NURSES STATION', 80, 145);

  // Hospital beds (3)
  for (let i = 0; i < 3; i++) {
    drawHospitalBed(180 + i * 160, 100);
  }

  // Corridor
  ctx.fillStyle = '#d0ccc7';
  ctx.fillRect(0, 280, canvas.width, 80);

  // Hand sanitizer dispensers
  ctx.fillStyle = '#fff';
  ctx.fillRect(30, 120, 15, 25);
  ctx.fillStyle = '#00a651';
  ctx.fillRect(33, 125, 9, 10);

  // Medical equipment cart
  ctx.fillStyle = '#666';
  ctx.fillRect(620, 150, 50, 40);
  ctx.fillStyle = '#999';
  ctx.fillRect(625, 145, 40, 8);

  // Windows at top right
  ctx.fillStyle = '#87ceeb';
  ctx.fillRect(550, 20, 60, 50);
  ctx.fillRect(630, 20, 60, 50);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.strokeRect(550, 20, 60, 50);
  ctx.strokeRect(630, 20, 60, 50);
}

function drawHospitalBed(x, y) {
  // Bed frame
  ctx.fillStyle = '#c0c0c0';
  ctx.fillRect(x, y, 80, 50);
  // Mattress
  ctx.fillStyle = '#e8f4f8';
  ctx.fillRect(x + 5, y + 5, 70, 40);
  // Pillow
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + 55, y + 8, 18, 15);
  // Bedside table
  ctx.fillStyle = '#8b7355';
  ctx.fillRect(x + 85, y + 15, 25, 30);
  // Water jug on table
  ctx.fillStyle = '#87ceeb';
  ctx.fillRect(x + 90, y + 8, 12, 15);
}

// === LIBRARY BACKGROUND ===
function drawLibraryBackground() {
  // Wooden floor
  ctx.fillStyle = '#8b6914';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Floor planks
  ctx.strokeStyle = '#7a5d12';
  ctx.lineWidth = 1;
  for (let y = 0; y < canvas.height; y += 20) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Bookshelves on walls
  drawBookshelf(20, 80);
  drawBookshelf(20, 200);
  drawBookshelf(620, 80);
  drawBookshelf(620, 200);

  // Central reading area - carpet
  ctx.fillStyle = '#6b4423';
  ctx.fillRect(150, 280, 400, 200);

  // Reading tables
  ctx.fillStyle = '#5d4037';
  ctx.fillRect(200, 320, 100, 60);
  ctx.fillRect(400, 320, 100, 60);

  // Desk lamps
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.arc(250, 330, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(450, 330, 10, 0, Math.PI * 2);
  ctx.fill();

  // Windows with natural light
  ctx.fillStyle = '#fffacd';
  ctx.fillRect(280, 30, 60, 80);
  ctx.fillRect(380, 30, 60, 80);
  ctx.strokeStyle = '#8b4513';
  ctx.lineWidth = 4;
  ctx.strokeRect(280, 30, 60, 80);
  ctx.strokeRect(380, 30, 60, 80);

  // "QUIET PLEASE" sign
  ctx.fillStyle = '#2c1810';
  ctx.fillRect(320, 130, 80, 25);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('QUIET PLEASE', 360, 147);
}

function drawBookshelf(x, y) {
  // Shelf frame - dark wood
  ctx.fillStyle = '#3e2723';
  ctx.fillRect(x, y, 70, 100);

  // Back panel (slightly lighter)
  ctx.fillStyle = '#4e342e';
  ctx.fillRect(x + 3, y + 3, 64, 94);

  // Shelf dividers
  ctx.fillStyle = '#3e2723';
  ctx.fillRect(x, y + 30, 70, 4);
  ctx.fillRect(x, y + 64, 70, 4);

  // Books with varied heights and colors
  const bookColors = ['#c62828', '#1565c0', '#2e7d32', '#f9a825', '#6a1b9a', '#00838f', '#d84315', '#5e35b1'];
  const rowYPositions = [y + 5, y + 35, y + 69];

  // Use shelf position to create unique seed for this bookshelf
  const shelfSeed = x * 127 + y * 311;

  rowYPositions.forEach((rowY, row) => {
    let bookX = x + 5;
    let bookIdx = 0;
    while (bookX < x + 65) {
      // Unique seed per book using shelf position, row, and book index
      const seed = (shelfSeed + row * 73 + bookIdx * 37) % 1000;
      const bookWidth = 4 + (seed % 4);
      const bookHeight = 20 + ((seed * 3) % 6);
      const colorIdx = (shelfSeed + row * 5 + bookIdx * 3) % bookColors.length;

      // Book spine
      ctx.fillStyle = bookColors[colorIdx];
      ctx.fillRect(bookX, rowY + (26 - bookHeight), bookWidth, bookHeight);

      // Book edge highlight
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(bookX, rowY + (26 - bookHeight), 1, bookHeight);

      // Title line on some books (deterministic based on position)
      if ((seed + bookIdx) % 3 !== 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(bookX + 1, rowY + (26 - bookHeight) + 3, bookWidth - 2, 1);
      }

      bookX += bookWidth + 1;
      bookIdx++;
    }
  });

  // Top decorative molding
  ctx.fillStyle = '#2e1b14';
  ctx.fillRect(x - 2, y - 3, 74, 5);

  // Side shadows for depth
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x + 67, y, 3, 100);
}

// === OFFICE BACKGROUND ===
function drawOfficeBackground() {
  // Carpet floor
  ctx.fillStyle = '#4a5568';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Carpet texture
  ctx.fillStyle = '#3d4556';
  for (let i = 0; i < 300; i++) {
    const x = (Math.sin(i * 234.567) * 0.5 + 0.5) * canvas.width;
    const y = (Math.cos(i * 345.678) * 0.5 + 0.5) * canvas.height;
    ctx.fillRect(x, y, 3, 3);
  }

  // Conference table
  ctx.fillStyle = '#2d3748';
  ctx.fillRect(200, 200, 300, 150);
  ctx.fillStyle = '#1a202c';
  ctx.fillRect(210, 210, 280, 130);

  // Office chairs around table
  const chairPositions = [
    { x: 180, y: 250 }, { x: 180, y: 320 },
    { x: 520, y: 250 }, { x: 520, y: 320 },
    { x: 300, y: 180 }, { x: 400, y: 180 },
    { x: 300, y: 370 }, { x: 400, y: 370 }
  ];
  chairPositions.forEach(pos => drawOfficeChair(pos.x, pos.y));

  // Whiteboard
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(250, 40, 200, 100);
  ctx.strokeStyle = '#718096';
  ctx.lineWidth = 3;
  ctx.strokeRect(250, 40, 200, 100);

  // Projector screen area
  ctx.fillStyle = '#2d3748';
  ctx.fillRect(260, 50, 180, 80);

  // Plants in corners
  drawOfficePlant(50, 80);
  drawOfficePlant(630, 80);
}

function drawOfficeChair(x, y) {
  ctx.fillStyle = '#1a202c';
  ctx.beginPath();
  ctx.arc(x, y, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2d3748';
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fill();
}

function drawOfficePlant(x, y) {
  // Pot
  ctx.fillStyle = '#8b4513';
  ctx.fillRect(x - 15, y + 20, 30, 25);
  // Plant
  ctx.fillStyle = '#228b22';
  ctx.beginPath();
  ctx.arc(x, y, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - 15, y + 10, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 15, y + 10, 18, 0, Math.PI * 2);
  ctx.fill();
}

// === SCHOOL BACKGROUND ===
function drawSchoolBackground() {
  // Classroom floor
  ctx.fillStyle = '#d4c4a8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Blackboard/whiteboard at front
  ctx.fillStyle = '#2d5016';
  ctx.fillRect(150, 30, 400, 120);
  ctx.strokeStyle = '#8b4513';
  ctx.lineWidth = 8;
  ctx.strokeRect(150, 30, 400, 120);

  // Chalk/marker writing
  ctx.fillStyle = '#fff';
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Today\'s Topic', 350, 80);

  // Teacher's desk
  ctx.fillStyle = '#8b4513';
  ctx.fillRect(280, 170, 140, 50);

  // Student desks (grid)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      drawStudentDesk(120 + col * 140, 280 + row * 80);
    }
  }

  // Clock on wall
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(620, 60, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Door
  ctx.fillStyle = '#8b4513';
  ctx.fillRect(30, 150, 50, 100);
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.arc(70, 200, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawStudentDesk(x, y) {
  ctx.fillStyle = '#a0522d';
  ctx.fillRect(x, y, 80, 40);
  ctx.fillStyle = '#d2691e';
  ctx.fillRect(x + 5, y + 5, 70, 30);
}

// === CAFE BACKGROUND ===
function drawCafeBackground() {
  // Warm wooden floor
  ctx.fillStyle = '#a0522d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Floor pattern
  ctx.strokeStyle = '#8b4513';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  // Counter/bar area at top
  ctx.fillStyle = '#3e2723';
  ctx.fillRect(100, 50, 500, 80);
  ctx.fillStyle = '#5d4037';
  ctx.fillRect(100, 120, 500, 15);

  // Coffee machine
  ctx.fillStyle = '#212121';
  ctx.fillRect(200, 60, 60, 55);
  ctx.fillStyle = '#b71c1c';
  ctx.fillRect(210, 70, 15, 10);

  // Menu board
  ctx.fillStyle = '#1b1b1b';
  ctx.fillRect(350, 20, 150, 50);
  ctx.fillStyle = '#fff';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MENU', 425, 40);
  ctx.font = '9px sans-serif';
  ctx.fillText('Coffee • Tea • Pastries', 425, 55);

  // Cafe tables
  drawCafeTable(150, 250);
  drawCafeTable(350, 250);
  drawCafeTable(550, 250);
  drawCafeTable(250, 400);
  drawCafeTable(450, 400);

  // Hanging lights
  ctx.fillStyle = '#ffd54f';
  ctx.beginPath();
  ctx.arc(200, 160, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(350, 160, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(500, 160, 12, 0, Math.PI * 2);
  ctx.fill();
}

function drawCafeTable(x, y) {
  // Table top (round)
  ctx.fillStyle = '#5d4037';
  ctx.beginPath();
  ctx.arc(x, y, 35, 0, Math.PI * 2);
  ctx.fill();
  // Table surface
  ctx.fillStyle = '#8d6e63';
  ctx.beginPath();
  ctx.arc(x, y, 30, 0, Math.PI * 2);
  ctx.fill();
  // Coffee cup
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + 10, y - 5, 8, 0, Math.PI * 2);
  ctx.fill();
}

function drawTrees() {
  const treePositions = [
    { x: 50, y: 100 }, { x: 650, y: 120 },
    { x: 70, y: 480 }, { x: 630, y: 460 },
    { x: 350, y: 520 }, { x: 50, y: 280 }, { x: 650, y: 300 }
  ];

  treePositions.forEach(pos => {
    // Trunk
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(pos.x - 5, pos.y + 20, 10, 30);

    // Leaves
    ctx.fillStyle = '#2e7d32';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 25, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#388e3c';
    ctx.beginPath();
    ctx.arc(pos.x - 10, pos.y + 5, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(pos.x + 10, pos.y + 5, 20, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawPath() {
  ctx.strokeStyle = '#c9b896';
  ctx.lineWidth = 35;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(80, 320);
  ctx.lineTo(canvas.width - 80, 320);
  ctx.stroke();

  // Path to options
  ctx.lineWidth = 20;
  ctx.beginPath();
  ctx.moveTo(350, 320);
  ctx.lineTo(350, 180);
  ctx.stroke();
}

// Draw option cards (function name kept for backwards compatibility)
function drawOptions() {
  currentCase.options.forEach((r, i) => {
    const pos = optionPositions[i] || { x: 200 + i * 150, y: 100 };
    const isSelected = currentCase.selectedOptionId === r.id;
    const isProposed = currentCase.messages.some(m =>
      (m.type === 'proposal' || m.type === 'counter') && m.optionId === r.id
    );

    // Building
    ctx.fillStyle = isSelected ? '#f39c12' : isProposed ? '#3498db' : '#795548';
    ctx.fillRect(pos.x - 25, pos.y - 20, 50, 40);

    // Roof
    ctx.fillStyle = isSelected ? '#e67e22' : isProposed ? '#2980b9' : '#5d4037';
    ctx.beginPath();
    ctx.moveTo(pos.x - 30, pos.y - 20);
    ctx.lineTo(pos.x, pos.y - 45);
    ctx.lineTo(pos.x + 30, pos.y - 20);
    ctx.fill();

    // Door
    ctx.fillStyle = '#3e2723';
    ctx.fillRect(pos.x - 8, pos.y, 16, 20);

    // Name label
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(r.name, pos.x, pos.y + 35);

    // Selected checkmark
    if (isSelected) {
      ctx.fillStyle = '#27ae60';
      ctx.font = '24px sans-serif';
      ctx.fillText('✓', pos.x + 35, pos.y - 10);
    }
  });
}

function drawAgent(agent, _id) {
  const x = agent.x;
  const y = agent.y;
  const color = agent.color;
  const time = Date.now();
  const baseScale = THRONGLET_SCALE;

  // Body style variations
  let s = baseScale;
  let heightMod = 1;
  switch (agent.bodyStyle) {
    case 'tall': heightMod = 1.15; break;
    case 'short': heightMod = 0.85; s *= 0.9; break;
    case 'wide': break;
  }

  // Check for wheelchair
  const hasWheelchair = agent.accessory === 'wheelchair';

  // Bobbing animation with individual speed (disabled for wheelchair users)
  const bounceSpeed = agent.bounceSpeed || 300;
  let bobOffset = hasWheelchair ? 0 : Math.sin(time / bounceSpeed) * 2 * s;

  // Jump animation (disabled for wheelchair users)
  let jumpOffset = 0;
  if (agent.idleAction === 'jumping' && !hasWheelchair) {
    jumpOffset = -Math.abs(Math.sin(time / 100)) * 15 * s;
  }

  // Additional animation based on idle action
  let armOffset = 0;
  let legOffset = 0;
  let headTilt = 0;
  let mouthOpen = false;
  let isSitting = agent.idleAction === 'sitting';

  switch (agent.idleAction) {
    case 'wandering':
    case 'pacing':
      legOffset = Math.sin(time / 100) * 3 * s;
      break;
    case 'stretching':
      armOffset = Math.sin(time / 200) * 15;
      break;
    case 'waving':
      armOffset = Math.sin(time / 100) * 20;
      break;
    case 'checking_phone':
    case 'looking_at_watch':
      headTilt = 0.3;
      break;
    case 'looking':
    case 'looking_at_option':
      headTilt = Math.sin(agent.lookDirection) * 0.15;
      break;
    case 'yawning':
      mouthOpen = true;
      headTilt = -0.1;
      break;
    case 'tapping_foot':
      legOffset = Math.sin(time / 80) * 4 * s;
      break;
    case 'scratching_head':
      armOffset = Math.sin(time / 150) * 8;
      headTilt = 0.1;
      break;
    case 'crossing_arms':
      // Arms crossed - handled in arm drawing
      break;
    case 'humming':
      bobOffset = Math.sin(time / 200) * 3 * s;
      headTilt = Math.sin(time / 400) * 0.1;
      break;
    case 'sitting':
      bobOffset = 0; // No bobbing when sitting
      break;
    case 'daydreaming':
      headTilt = 0.2;
      break;
    case 'chitchat':
      headTilt = Math.sin(time / 300) * 0.1; // Subtle head movement while talking
      break;
  }

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y + 18 * s, 10 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Draw a bench/seat when sitting - more visible
  if (isSitting) {
    // Bench legs
    ctx.fillStyle = '#4e342e';
    ctx.fillRect(x - 18 * s, y + 10 * s, 4 * s, 12 * s);
    ctx.fillRect(x + 14 * s, y + 10 * s, 4 * s, 12 * s);
    // Bench seat
    ctx.fillStyle = '#6d4c41';
    ctx.fillRect(x - 20 * s, y + 6 * s, 40 * s, 6 * s);
    // Bench back
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(x - 18 * s, y - 8 * s, 4 * s, 16 * s);
    ctx.fillRect(x + 14 * s, y - 8 * s, 4 * s, 16 * s);
    ctx.fillRect(x - 18 * s, y - 8 * s, 36 * s, 4 * s);
  }

  // Draw wheelchair if applicable
  if (hasWheelchair) {
    // Shadow under wheelchair
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.beginPath();
    ctx.ellipse(x, y + 22 * s, 18 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Main large wheel (back) - filled with gradient
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(x - 6 * s, y + 12 * s, 14 * s, 0, Math.PI * 2);
    ctx.fill();
    // Wheel rim
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.arc(x - 6 * s, y + 12 * s, 12 * s, 0, Math.PI * 2);
    ctx.stroke();
    // Hub
    ctx.fillStyle = '#666';
    ctx.beginPath();
    ctx.arc(x - 6 * s, y + 12 * s, 4 * s, 0, Math.PI * 2);
    ctx.fill();
    // Spokes
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1 * s;
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI * 2) / 8;
      ctx.beginPath();
      ctx.moveTo(x - 6 * s + Math.cos(angle) * 4 * s, y + 12 * s + Math.sin(angle) * 4 * s);
      ctx.lineTo(x - 6 * s + Math.cos(angle) * 11 * s, y + 12 * s + Math.sin(angle) * 11 * s);
      ctx.stroke();
    }
    // Hand rim (outer ring for pushing)
    ctx.strokeStyle = '#c0c0c0';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.arc(x - 6 * s, y + 12 * s, 10 * s, 0, Math.PI * 2);
    ctx.stroke();

    // Small front caster wheel
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(x + 14 * s, y + 18 * s, 5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#666';
    ctx.beginPath();
    ctx.arc(x + 14 * s, y + 18 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();

    // Wheelchair frame
    ctx.strokeStyle = '#2c2c2c';
    ctx.lineWidth = 2.5 * s;
    // Seat frame
    ctx.beginPath();
    ctx.moveTo(x - 12 * s, y + 2 * s);
    ctx.lineTo(x + 10 * s, y + 2 * s);
    ctx.lineTo(x + 14 * s, y + 13 * s);
    ctx.stroke();
    // Back support frame
    ctx.beginPath();
    ctx.moveTo(x - 12 * s, y + 2 * s);
    ctx.lineTo(x - 14 * s, y - 18 * s);
    ctx.stroke();

    // Seat cushion
    ctx.fillStyle = '#1a365d';
    ctx.beginPath();
    ctx.roundRect(x - 11 * s, y - 2 * s, 18 * s, 6 * s, 2 * s);
    ctx.fill();

    // Back cushion
    ctx.fillStyle = '#1a365d';
    ctx.beginPath();
    ctx.roundRect(x - 13 * s, y - 16 * s, 5 * s, 16 * s, 2 * s);
    ctx.fill();

    // Armrest
    ctx.fillStyle = '#2c2c2c';
    ctx.fillRect(x - 14 * s, y - 4 * s, 26 * s, 2 * s);

    // Footrest
    ctx.fillStyle = '#2c2c2c';
    ctx.fillRect(x + 6 * s, y + 14 * s, 10 * s, 2 * s);

    // Legs (seated)
    ctx.fillStyle = '#2c3e50';
    // Thighs on seat
    ctx.fillRect(x - 6 * s, y + 2 * s, 5 * s, 5 * s);
    ctx.fillRect(x + 1 * s, y + 2 * s, 5 * s, 5 * s);
    // Lower legs to footrest
    ctx.fillRect(x + 4 * s, y + 5 * s, 4 * s, 10 * s);
  } else {
    // Normal legs with articulation
    const legY = y + 6 * s + bobOffset + jumpOffset;
    const pantColor = '#2c3e50';
    const shoeColor = '#1a1a1a';

    if (isSitting) {
      // Bent legs when sitting
      ctx.fillStyle = pantColor;
      // Left thigh (horizontal)
      ctx.beginPath();
      ctx.roundRect(x - 10 * s, legY + 1 * s, 8 * s, 5 * s, 2 * s);
      ctx.fill();
      // Left calf (vertical)
      ctx.beginPath();
      ctx.roundRect(x - 11 * s, legY + 5 * s, 5 * s, 9 * s, 2 * s);
      ctx.fill();
      // Right thigh
      ctx.beginPath();
      ctx.roundRect(x + 2 * s, legY + 1 * s, 8 * s, 5 * s, 2 * s);
      ctx.fill();
      // Right calf
      ctx.beginPath();
      ctx.roundRect(x + 6 * s, legY + 5 * s, 5 * s, 9 * s, 2 * s);
      ctx.fill();
      // Shoes
      ctx.fillStyle = shoeColor;
      ctx.beginPath();
      ctx.roundRect(x - 13 * s, legY + 13 * s, 8 * s, 4 * s, 2 * s);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(x + 5 * s, legY + 13 * s, 8 * s, 4 * s, 2 * s);
      ctx.fill();
    } else {
      // Standing legs with walking animation
      const leftLegLen = 14 * s + legOffset;
      const rightLegLen = 14 * s - legOffset;

      // Left leg
      ctx.fillStyle = pantColor;
      // Thigh
      ctx.beginPath();
      ctx.roundRect(x - 8 * s, legY - 2 * s, 6 * s, 8 * s, 2 * s);
      ctx.fill();
      // Calf
      ctx.beginPath();
      ctx.roundRect(x - 7 * s, legY + 5 * s, 5 * s, leftLegLen - 6 * s, 2 * s);
      ctx.fill();
      // Shoe
      ctx.fillStyle = shoeColor;
      ctx.beginPath();
      ctx.roundRect(x - 9 * s, legY + leftLegLen - 3 * s, 8 * s, 4 * s, 2 * s);
      ctx.fill();

      // Right leg
      ctx.fillStyle = pantColor;
      // Thigh
      ctx.beginPath();
      ctx.roundRect(x + 2 * s, legY - 2 * s, 6 * s, 8 * s, 2 * s);
      ctx.fill();
      // Calf
      ctx.beginPath();
      ctx.roundRect(x + 2 * s, legY + 5 * s, 5 * s, rightLegLen - 6 * s, 2 * s);
      ctx.fill();
      // Shoe
      ctx.fillStyle = shoeColor;
      ctx.beginPath();
      ctx.roundRect(x + 1 * s, legY + rightLegLen - 3 * s, 8 * s, 4 * s, 2 * s);
      ctx.fill();
    }
  }

  // Body - adjust position for wheelchair users, use rounded torso
  const bodyY = hasWheelchair ? y - 10 * s : y - 14 * s + bobOffset + jumpOffset;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - 9 * s, bodyY, 18 * s, 22 * s, 4 * s);
  ctx.fill();

  // Neck
  const skinColor = agent.skinTone || '#d4a574';
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.roundRect(x - 3 * s, bodyY - 4 * s, 6 * s, 6 * s, 2 * s);
  ctx.fill();

  // Professional uniform overlays (drawn on body)
  if (agent.accessory === 'nurse_scrubs') {
    // Scrub top in medical blue/teal
    ctx.fillStyle = '#17a2b8';
    ctx.fillRect(x - 8 * s, bodyY, 16 * s, 18 * s);
    // V-neck detail
    ctx.fillStyle = agent.skinTone || '#ffcc80';
    ctx.beginPath();
    ctx.moveTo(x - 3 * s, bodyY);
    ctx.lineTo(x, bodyY + 5 * s);
    ctx.lineTo(x + 3 * s, bodyY);
    ctx.closePath();
    ctx.fill();
    // Pocket
    ctx.fillStyle = '#138496';
    ctx.fillRect(x + 2 * s, bodyY + 8 * s, 4 * s, 5 * s);
  } else if (agent.accessory === 'doctor_coat') {
    // White coat over body
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 9 * s, bodyY + 2 * s, 18 * s, 18 * s);
    // Coat lapels
    ctx.fillStyle = '#f0f0f0';
    ctx.beginPath();
    ctx.moveTo(x - 4 * s, bodyY + 2 * s);
    ctx.lineTo(x - 2 * s, bodyY + 10 * s);
    ctx.lineTo(x, bodyY + 2 * s);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 4 * s, bodyY + 2 * s);
    ctx.lineTo(x + 2 * s, bodyY + 10 * s);
    ctx.lineTo(x, bodyY + 2 * s);
    ctx.closePath();
    ctx.fill();
    // Stethoscope hint
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, bodyY + 6 * s, 3 * s, 0.3 * Math.PI, 0.7 * Math.PI);
    ctx.stroke();
    // Pockets
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(x - 7 * s, bodyY + 12 * s, 5 * s, 4 * s);
    ctx.fillRect(x + 2 * s, bodyY + 12 * s, 5 * s, 4 * s);
  } else if (agent.accessory === 'police_uniform') {
    // Dark blue uniform
    ctx.fillStyle = '#1a237e';
    ctx.fillRect(x - 8 * s, bodyY, 16 * s, 20 * s);
    // Badge
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.moveTo(x - 4 * s, bodyY + 4 * s);
    ctx.lineTo(x - 6 * s, bodyY + 7 * s);
    ctx.lineTo(x - 4 * s, bodyY + 10 * s);
    ctx.lineTo(x - 2 * s, bodyY + 7 * s);
    ctx.closePath();
    ctx.fill();
    // Buttons
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(x - 1 * s, bodyY + 4 * s, 2 * s, 2 * s);
    ctx.fillRect(x - 1 * s, bodyY + 8 * s, 2 * s, 2 * s);
    ctx.fillRect(x - 1 * s, bodyY + 12 * s, 2 * s, 2 * s);
    // Shoulder epaulettes
    ctx.fillStyle = '#283593';
    ctx.fillRect(x - 10 * s, bodyY + 1 * s, 4 * s, 3 * s);
    ctx.fillRect(x + 6 * s, bodyY + 1 * s, 4 * s, 3 * s);
  } else if (agent.accessory === 'teacher') {
    // Smart cardigan look
    ctx.fillStyle = '#5d4037';
    // Cardigan overlay
    ctx.fillRect(x - 9 * s, bodyY + 2 * s, 6 * s, 16 * s);
    ctx.fillRect(x + 3 * s, bodyY + 2 * s, 6 * s, 16 * s);
    // Inner shirt visible
    ctx.fillStyle = '#e3f2fd';
    ctx.fillRect(x - 4 * s, bodyY + 2 * s, 8 * s, 14 * s);
    // Elbow patches hint
    ctx.fillStyle = '#4e342e';
    ctx.fillRect(x - 10 * s, bodyY + 8 * s, 3 * s, 4 * s);
    ctx.fillRect(x + 7 * s, bodyY + 8 * s, 3 * s, 4 * s);
  } else if (agent.accessory === 'business_suit') {
    // Suit jacket
    ctx.fillStyle = '#263238';
    ctx.fillRect(x - 9 * s, bodyY + 2 * s, 18 * s, 18 * s);
    // Lapels
    ctx.fillStyle = '#37474f';
    ctx.beginPath();
    ctx.moveTo(x - 5 * s, bodyY + 2 * s);
    ctx.lineTo(x - 3 * s, bodyY + 12 * s);
    ctx.lineTo(x, bodyY + 8 * s);
    ctx.lineTo(x + 3 * s, bodyY + 12 * s);
    ctx.lineTo(x + 5 * s, bodyY + 2 * s);
    ctx.closePath();
    ctx.fill();
    // White shirt underneath
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 2 * s, bodyY + 2 * s, 4 * s, 10 * s);
    // Tie
    ctx.fillStyle = '#b71c1c';
    ctx.beginPath();
    ctx.moveTo(x - 1.5 * s, bodyY + 2 * s);
    ctx.lineTo(x - 2 * s, bodyY + 14 * s);
    ctx.lineTo(x, bodyY + 16 * s);
    ctx.lineTo(x + 2 * s, bodyY + 14 * s);
    ctx.lineTo(x + 1.5 * s, bodyY + 2 * s);
    ctx.closePath();
    ctx.fill();
    // Tie knot
    ctx.fillStyle = '#8b0000';
    ctx.fillRect(x - 1.5 * s, bodyY + 2 * s, 3 * s, 2 * s);
  }

  // Arms with upper arm, forearm, and hands
  const armSkinColor = agent.skinTone || '#d4a574';
  const armSleeveColor = color;

  if (agent.idleAction === 'crossing_arms') {
    // Crossed arms - sleeves
    ctx.fillStyle = armSleeveColor;
    ctx.beginPath();
    ctx.roundRect(x - 12 * s, y - 6 * s + bobOffset + jumpOffset, 24 * s, 6 * s, 3 * s);
    ctx.fill();
    // Hands visible
    ctx.fillStyle = armSkinColor;
    ctx.beginPath();
    ctx.arc(x - 10 * s, y - 3 * s + bobOffset + jumpOffset, 3 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 10 * s, y - 3 * s + bobOffset + jumpOffset, 3 * s, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Left arm
    ctx.save();
    ctx.translate(x - 9 * s, y - 10 * s + bobOffset + jumpOffset);
    ctx.rotate(-0.15 - armOffset * 0.02);
    // Upper arm (sleeve)
    ctx.fillStyle = armSleeveColor;
    ctx.beginPath();
    ctx.roundRect(-4 * s, 0, 5 * s, 8 * s, 2 * s);
    ctx.fill();
    // Forearm (skin)
    ctx.fillStyle = armSkinColor;
    ctx.beginPath();
    ctx.roundRect(-3.5 * s, 7 * s, 4 * s, 7 * s, 2 * s);
    ctx.fill();
    // Hand
    ctx.beginPath();
    ctx.arc(-1.5 * s, 15 * s, 2.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Right arm (waving animation)
    ctx.save();
    ctx.translate(x + 9 * s, y - 10 * s + bobOffset + jumpOffset);
    ctx.rotate(0.15 + armOffset * 0.05);
    // Upper arm (sleeve)
    ctx.fillStyle = armSleeveColor;
    ctx.beginPath();
    ctx.roundRect(-1 * s, 0, 5 * s, 8 * s, 2 * s);
    ctx.fill();
    // Forearm (skin)
    ctx.fillStyle = armSkinColor;
    ctx.beginPath();
    ctx.roundRect(-0.5 * s, 7 * s, 4 * s, 7 * s, 2 * s);
    ctx.fill();
    // Hand
    ctx.beginPath();
    ctx.arc(1.5 * s, 15 * s, 2.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Head
  ctx.save();
  ctx.translate(x, y - 20 * s * heightMod + bobOffset + jumpOffset);
  ctx.rotate(headTilt);
  ctx.fillStyle = agent.skinTone || '#ffcc80';
  ctx.beginPath();
  ctx.arc(0, 0, 10 * s, 0, Math.PI * 2);
  ctx.fill();

  // Accessory drawing
  if (agent.accessory === 'hat') {
    ctx.fillStyle = '#333';
    ctx.fillRect(-8 * s, -14 * s, 16 * s, 4 * s); // brim
    ctx.fillRect(-5 * s, -22 * s, 10 * s, 10 * s); // top
  } else if (agent.accessory === 'glasses') {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(-4 * s, -1 * s, 3 * s, 0, Math.PI * 2);
    ctx.arc(4 * s, -1 * s, 3 * s, 0, Math.PI * 2);
    ctx.moveTo(-1 * s, -1 * s);
    ctx.lineTo(1 * s, -1 * s);
    ctx.stroke();
  } else if (agent.accessory === 'bowtie') {
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.moveTo(0, 8 * s);
    ctx.lineTo(-6 * s, 5 * s);
    ctx.lineTo(-6 * s, 11 * s);
    ctx.lineTo(0, 8 * s);
    ctx.lineTo(6 * s, 5 * s);
    ctx.lineTo(6 * s, 11 * s);
    ctx.closePath();
    ctx.fill();
  } else if (agent.accessory === 'headphones') {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -2 * s, 12 * s, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#555';
    ctx.fillRect(-14 * s, -4 * s, 5 * s, 8 * s);
    ctx.fillRect(9 * s, -4 * s, 5 * s, 8 * s);
  } else if (agent.accessory === 'scarf') {
    ctx.fillStyle = '#9b59b6';
    ctx.fillRect(-10 * s, 6 * s, 20 * s, 4 * s);
    ctx.fillRect(6 * s, 6 * s, 4 * s, 15 * s);
  } else if (agent.accessory === 'walking_stick') {
    // Walking stick/cane held to the side
    ctx.strokeStyle = '#5d4037';
    ctx.lineWidth = 3 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(12 * s, 5 * s);  // Hand position
    ctx.lineTo(14 * s, 30 * s);  // Stick extends down
    ctx.stroke();
    // Handle curve
    ctx.beginPath();
    ctx.arc(11 * s, 4 * s, 3 * s, Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();
    // Rubber tip
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(14 * s, 31 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();
  } else if (agent.accessory === 'zimmer_frame') {
    // Zimmer frame / walking frame surrounding the person
    ctx.strokeStyle = '#9e9e9e';
    ctx.lineWidth = 2.5 * s;
    ctx.lineCap = 'round';
    // Frame sides
    ctx.beginPath();
    ctx.moveTo(-18 * s, 5 * s);   // Left handle
    ctx.lineTo(-18 * s, 32 * s);  // Left leg
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(18 * s, 5 * s);    // Right handle
    ctx.lineTo(18 * s, 32 * s);   // Right leg
    ctx.stroke();
    // Front crossbar
    ctx.beginPath();
    ctx.moveTo(-18 * s, 32 * s);
    ctx.lineTo(18 * s, 32 * s);
    ctx.stroke();
    // Top handles (horizontal grips)
    ctx.lineWidth = 4 * s;
    ctx.strokeStyle = '#757575';
    ctx.beginPath();
    ctx.moveTo(-18 * s, 4 * s);
    ctx.lineTo(-14 * s, 4 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(14 * s, 4 * s);
    ctx.lineTo(18 * s, 4 * s);
    ctx.stroke();
    // Rubber feet
    ctx.fillStyle = '#424242';
    ctx.beginPath();
    ctx.arc(-18 * s, 33 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(18 * s, 33 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyes - look in direction
  const eyeOffsetX = Math.cos(agent.lookDirection) * 1.5 * s;
  const eyeOffsetY = Math.sin(agent.lookDirection) * 0.8 * s;
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.arc(-3 * s + eyeOffsetX, -1 * s + eyeOffsetY, 1.5 * s, 0, Math.PI * 2);
  ctx.arc(3 * s + eyeOffsetX, -1 * s + eyeOffsetY, 1.5 * s, 0, Math.PI * 2);
  ctx.fill();

  // Mouth
  if (mouthOpen) {
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(0, 4 * s, 3 * s, 0, Math.PI);
    ctx.fill();
  }

  // Phone/Watch if checking
  if (agent.idleAction === 'checking_phone') {
    ctx.fillStyle = '#333';
    ctx.fillRect(-5 * s, 6 * s, 4 * s, 7 * s);
    ctx.fillStyle = '#4fc3f7';
    ctx.fillRect(-4 * s, 7 * s, 2.5 * s, 5 * s);
  } else if (agent.idleAction === 'looking_at_watch') {
    ctx.fillStyle = '#333';
    ctx.fillRect(6 * s, 0, 3 * s, 2 * s);
  }

  ctx.restore();

  // Name label
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${11 * s}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(agent.name || 'Agent', x, y + 32 * s);

  // Role label (if agent has a role)
  if (agent.role) {
    ctx.fillStyle = '#aaa';
    ctx.font = `${9 * s}px sans-serif`;
    ctx.fillText(agent.role, x, y + 42 * s);
  }

  // Emote bubble
  if (agent.emote) {
    ctx.font = `${14 * s}px sans-serif`;
    ctx.fillText(agent.emote, x + 18 * s, y - 32 * s + bobOffset + jumpOffset);
  }

  // Show waiting indicator only when it's their turn (subtle)
  if (agent.state === 'thinking') {
    ctx.fillStyle = 'rgba(243, 156, 18, 0.6)';
    ctx.beginPath();
    ctx.arc(x + 20 * s, y - 35 * s + bobOffset + jumpOffset, 4 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

// === 3D ISOMETRIC AGENT DRAWING ===
function drawAgent3D(agent, _agentId) {
  const x = agent.x;
  const y = agent.y;
  const color = agent.color || '#3498db';
  const skinTone = agent.skinTone || '#d4a574';
  const time = Date.now();
  const scale = THRONGLET_SCALE * 0.8;

  ctx.save();
  ctx.translate(x, y);

  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.beginPath();
  ctx.ellipse(0, 10 * scale, 20 * scale, 8 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bobbing animation
  const bobOffset = Math.sin(time / 300) * 2 * scale;

  // Professional role affects appearance
  const role = agent.professionalRole || '';
  let bodyColor = color;
  let hasCoat = false;

  if (role === 'nurse_scrubs') {
    bodyColor = '#5dade2'; // Light blue scrubs
  } else if (role === 'doctor_coat') {
    bodyColor = '#ffffff';
    hasCoat = true;
  } else if (role === 'police_uniform') {
    bodyColor = '#1a237e';
  } else if (role === 'healthcare_assistant') {
    bodyColor = '#81d4fa';
  }

  // === BODY - Different shapes based on bodyStyle ===
  const bodyStyle = agent.bodyStyle || 'normal';

  // Adjust dimensions based on body style
  let bodyW, bodyH, bodyD;
  switch (bodyStyle) {
    case 'tall':
      bodyW = 22 * scale;
      bodyH = 45 * scale;
      bodyD = 12 * scale;
      break;
    case 'short':
      bodyW = 28 * scale;
      bodyH = 28 * scale;
      bodyD = 16 * scale;
      break;
    case 'wide':
      bodyW = 35 * scale;
      bodyH = 32 * scale;
      bodyD = 20 * scale;
      break;
    case 'athletic':
      bodyW = 26 * scale;
      bodyH = 40 * scale;
      bodyD = 14 * scale;
      break;
    default: // normal
      bodyW = 25 * scale;
      bodyH = 35 * scale;
      bodyD = 15 * scale;
  }

  // Choose body shape type: 'box', 'cylinder', 'rounded'
  const shapeType = agent.shapeType || 'box';

  if (shapeType === 'cylinder' || bodyStyle === 'rounded') {
    // === CYLINDRICAL BODY ===
    // Draw as oval/cylinder shape instead of box

    // Body back (darker)
    ctx.fillStyle = shadeColor(bodyColor, -30);
    ctx.beginPath();
    ctx.ellipse(0, -bodyH/2 + bobOffset, bodyW/2, bodyD/2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body main cylinder
    ctx.fillStyle = shadeColor(bodyColor, -15);
    ctx.beginPath();
    ctx.moveTo(-bodyW/2, -bodyH + bobOffset);
    ctx.lineTo(-bodyW/2, bobOffset);
    ctx.quadraticCurveTo(-bodyW/2, bodyD/2 + bobOffset, 0, bodyD/2 + bobOffset);
    ctx.quadraticCurveTo(bodyW/2, bodyD/2 + bobOffset, bodyW/2, bobOffset);
    ctx.lineTo(bodyW/2, -bodyH + bobOffset);
    ctx.closePath();
    ctx.fill();

    // Body highlight (lighter side)
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(-bodyW/4, -bodyH + bobOffset);
    ctx.lineTo(-bodyW/4, bobOffset);
    ctx.lineTo(bodyW/6, bobOffset);
    ctx.lineTo(bodyW/6, -bodyH + bobOffset);
    ctx.closePath();
    ctx.fill();

    // Top ellipse (shoulders)
    ctx.fillStyle = shadeColor(bodyColor, 10);
    ctx.beginPath();
    ctx.ellipse(0, -bodyH + bobOffset, bodyW/2, bodyD/2, 0, 0, Math.PI * 2);
    ctx.fill();

  } else if (shapeType === 'oval' || bodyStyle === 'wide') {
    // === OVAL/EGG BODY ===
    // More rounded egg-like shape

    // Body shadow
    ctx.fillStyle = shadeColor(bodyColor, -35);
    ctx.beginPath();
    ctx.ellipse(3*scale, -bodyH/2 + 5*scale + bobOffset, bodyW/2 + 2*scale, bodyH/2 + 2*scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Main body oval
    ctx.fillStyle = shadeColor(bodyColor, -10);
    ctx.beginPath();
    ctx.ellipse(0, -bodyH/2 + bobOffset, bodyW/2, bodyH/2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(-bodyW/6, -bodyH/2 - 3*scale + bobOffset, bodyW/4, bodyH/3, 0, 0, Math.PI * 2);
    ctx.fill();

  } else {
    // === DEFAULT BOX BODY (Isometric) ===

    // Left side of body
    ctx.fillStyle = shadeColor(bodyColor, -20);
    ctx.beginPath();
    ctx.moveTo(-bodyW/2, -bodyH + bobOffset);
    ctx.lineTo(-bodyW/2, bobOffset);
    ctx.lineTo(0, bodyD/2 + bobOffset);
    ctx.lineTo(0, -bodyH + bodyD/2 + bobOffset);
    ctx.closePath();
    ctx.fill();

    // Right side of body
    ctx.fillStyle = shadeColor(bodyColor, -40);
    ctx.beginPath();
    ctx.moveTo(bodyW/2, -bodyH + bobOffset);
    ctx.lineTo(bodyW/2, bobOffset);
    ctx.lineTo(0, bodyD/2 + bobOffset);
    ctx.lineTo(0, -bodyH + bodyD/2 + bobOffset);
    ctx.closePath();
    ctx.fill();

    // Top of body (shoulders)
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(-bodyW/2, -bodyH + bobOffset);
    ctx.lineTo(0, -bodyH - bodyD/2 + bobOffset);
    ctx.lineTo(bodyW/2, -bodyH + bobOffset);
    ctx.lineTo(0, -bodyH + bodyD/2 + bobOffset);
    ctx.closePath();
    ctx.fill();
  }

  // White coat overlay for doctors (works with all body shapes)
  if (hasCoat) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.moveTo(-bodyW/2 - 3*scale, -bodyH + 10*scale + bobOffset);
    ctx.lineTo(-bodyW/2 - 3*scale, 5*scale + bobOffset);
    ctx.lineTo(bodyW/2 + 3*scale, 5*scale + bobOffset);
    ctx.lineTo(bodyW/2 + 3*scale, -bodyH + 10*scale + bobOffset);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // === HEAD (Isometric sphere-ish) ===
  const headY = -bodyH - 12 * scale + bobOffset;

  // Head back shadow
  ctx.fillStyle = shadeColor(skinTone, -20);
  ctx.beginPath();
  ctx.ellipse(0, headY, 12 * scale, 10 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head main
  ctx.fillStyle = skinTone;
  ctx.beginPath();
  ctx.ellipse(0, headY - 2*scale, 11 * scale, 9 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair (varies by accessory/style)
  ctx.fillStyle = '#4a3728';
  ctx.beginPath();
  ctx.ellipse(0, headY - 8*scale, 10 * scale, 5 * scale, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.arc(-4 * scale, headY - 2*scale, 2 * scale, 0, Math.PI * 2);
  ctx.arc(4 * scale, headY - 2*scale, 2 * scale, 0, Math.PI * 2);
  ctx.fill();

  // Glasses if applicable
  if (agent.accessory === 'glasses') {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.arc(-4 * scale, headY - 2*scale, 4 * scale, 0, Math.PI * 2);
    ctx.arc(4 * scale, headY - 2*scale, 4 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, headY - 2*scale);
    ctx.lineTo(0, headY - 2*scale);
    ctx.stroke();
  }

  // Smile
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.arc(0, headY + 2*scale, 4 * scale, 0.2, Math.PI - 0.2);
  ctx.stroke();

  // === LEGS (draw first, behind body) ===
  const pantColor = '#3d5a80';
  const pantDark = shadeColor(pantColor, -20);
  const pantLight = shadeColor(pantColor, 10);
  const legY = bobOffset;
  const legSpread = 7 * scale;

  // Left leg - thigh (cylindrical shape)
  // Back of thigh
  ctx.fillStyle = pantDark;
  ctx.beginPath();
  ctx.ellipse(-legSpread, legY + 2*scale, 6*scale, 4*scale, 0, 0, Math.PI);
  ctx.fill();
  // Front of thigh
  ctx.fillStyle = pantColor;
  ctx.beginPath();
  ctx.moveTo(-legSpread - 6*scale, legY + 2*scale);
  ctx.lineTo(-legSpread - 5*scale, legY + 14*scale);
  ctx.quadraticCurveTo(-legSpread, legY + 16*scale, -legSpread + 5*scale, legY + 14*scale);
  ctx.lineTo(-legSpread + 6*scale, legY + 2*scale);
  ctx.closePath();
  ctx.fill();
  // Thigh highlight
  ctx.fillStyle = pantLight;
  ctx.beginPath();
  ctx.moveTo(-legSpread - 2*scale, legY + 2*scale);
  ctx.lineTo(-legSpread - 1*scale, legY + 12*scale);
  ctx.lineTo(-legSpread + 2*scale, legY + 12*scale);
  ctx.lineTo(-legSpread + 2*scale, legY + 2*scale);
  ctx.closePath();
  ctx.fill();

  // Left leg - calf
  ctx.fillStyle = pantDark;
  ctx.beginPath();
  ctx.moveTo(-legSpread - 5*scale, legY + 14*scale);
  ctx.lineTo(-legSpread - 4*scale, legY + 26*scale);
  ctx.quadraticCurveTo(-legSpread, legY + 28*scale, -legSpread + 4*scale, legY + 26*scale);
  ctx.lineTo(-legSpread + 5*scale, legY + 14*scale);
  ctx.closePath();
  ctx.fill();
  // Calf highlight
  ctx.fillStyle = pantColor;
  ctx.beginPath();
  ctx.moveTo(-legSpread - 2*scale, legY + 14*scale);
  ctx.lineTo(-legSpread - 1*scale, legY + 24*scale);
  ctx.lineTo(-legSpread + 2*scale, legY + 24*scale);
  ctx.lineTo(-legSpread + 2*scale, legY + 14*scale);
  ctx.closePath();
  ctx.fill();

  // Right leg - thigh
  ctx.fillStyle = pantDark;
  ctx.beginPath();
  ctx.ellipse(legSpread, legY + 2*scale, 6*scale, 4*scale, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = pantColor;
  ctx.beginPath();
  ctx.moveTo(legSpread - 6*scale, legY + 2*scale);
  ctx.lineTo(legSpread - 5*scale, legY + 14*scale);
  ctx.quadraticCurveTo(legSpread, legY + 16*scale, legSpread + 5*scale, legY + 14*scale);
  ctx.lineTo(legSpread + 6*scale, legY + 2*scale);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pantLight;
  ctx.beginPath();
  ctx.moveTo(legSpread - 2*scale, legY + 2*scale);
  ctx.lineTo(legSpread - 1*scale, legY + 12*scale);
  ctx.lineTo(legSpread + 2*scale, legY + 12*scale);
  ctx.lineTo(legSpread + 2*scale, legY + 2*scale);
  ctx.closePath();
  ctx.fill();

  // Right leg - calf
  ctx.fillStyle = pantDark;
  ctx.beginPath();
  ctx.moveTo(legSpread - 5*scale, legY + 14*scale);
  ctx.lineTo(legSpread - 4*scale, legY + 26*scale);
  ctx.quadraticCurveTo(legSpread, legY + 28*scale, legSpread + 4*scale, legY + 26*scale);
  ctx.lineTo(legSpread + 5*scale, legY + 14*scale);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pantColor;
  ctx.beginPath();
  ctx.moveTo(legSpread - 2*scale, legY + 14*scale);
  ctx.lineTo(legSpread - 1*scale, legY + 24*scale);
  ctx.lineTo(legSpread + 2*scale, legY + 24*scale);
  ctx.lineTo(legSpread + 2*scale, legY + 14*scale);
  ctx.closePath();
  ctx.fill();

  // Shoes (3D with depth)
  // Left shoe - sole
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.ellipse(-legSpread, legY + 30*scale, 7*scale, 4*scale, -0.15, 0, Math.PI * 2);
  ctx.fill();
  // Left shoe - upper
  ctx.fillStyle = '#2d2d2d';
  ctx.beginPath();
  ctx.ellipse(-legSpread, legY + 28*scale, 6*scale, 3*scale, -0.15, 0, Math.PI * 2);
  ctx.fill();
  // Left shoe - top highlight
  ctx.fillStyle = '#404040';
  ctx.beginPath();
  ctx.ellipse(-legSpread - 1*scale, legY + 27*scale, 3*scale, 2*scale, -0.15, 0, Math.PI * 2);
  ctx.fill();

  // Right shoe
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.ellipse(legSpread, legY + 30*scale, 7*scale, 4*scale, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2d2d2d';
  ctx.beginPath();
  ctx.ellipse(legSpread, legY + 28*scale, 6*scale, 3*scale, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#404040';
  ctx.beginPath();
  ctx.ellipse(legSpread + 1*scale, legY + 27*scale, 3*scale, 2*scale, 0.15, 0, Math.PI * 2);
  ctx.fill();

  // === ARMS (articulated with upper arm, forearm, hands) ===
  const armY = -bodyH + 8*scale + bobOffset;
  const sleeveColor = role === 'doctor_coat' ? '#ffffff' : shadeColor(bodyColor, -10);
  const sleeveDark = shadeColor(sleeveColor, -20);

  // Left arm - upper arm (sleeve) with roundness
  ctx.fillStyle = sleeveDark;
  ctx.beginPath();
  ctx.moveTo(-bodyW/2 - 2*scale, armY);
  ctx.quadraticCurveTo(-bodyW/2 - 10*scale, armY + 5*scale, -bodyW/2 - 8*scale, armY + 14*scale);
  ctx.lineTo(-bodyW/2 - 2*scale, armY + 12*scale);
  ctx.lineTo(-bodyW/2 + 2*scale, armY + 2*scale);
  ctx.closePath();
  ctx.fill();
  // Sleeve highlight
  ctx.fillStyle = sleeveColor;
  ctx.beginPath();
  ctx.moveTo(-bodyW/2, armY + 2*scale);
  ctx.quadraticCurveTo(-bodyW/2 - 6*scale, armY + 6*scale, -bodyW/2 - 5*scale, armY + 12*scale);
  ctx.lineTo(-bodyW/2 - 3*scale, armY + 10*scale);
  ctx.lineTo(-bodyW/2 + 1*scale, armY + 3*scale);
  ctx.closePath();
  ctx.fill();

  // Left arm - forearm (skin) with roundness
  ctx.fillStyle = shadeColor(skinTone, -15);
  ctx.beginPath();
  ctx.moveTo(-bodyW/2 - 6*scale, armY + 12*scale);
  ctx.quadraticCurveTo(-bodyW/2 - 12*scale, armY + 18*scale, -bodyW/2 - 10*scale, armY + 26*scale);
  ctx.lineTo(-bodyW/2 - 4*scale, armY + 24*scale);
  ctx.lineTo(-bodyW/2 - 2*scale, armY + 14*scale);
  ctx.closePath();
  ctx.fill();
  // Forearm highlight
  ctx.fillStyle = skinTone;
  ctx.beginPath();
  ctx.moveTo(-bodyW/2 - 4*scale, armY + 14*scale);
  ctx.quadraticCurveTo(-bodyW/2 - 8*scale, armY + 18*scale, -bodyW/2 - 7*scale, armY + 24*scale);
  ctx.lineTo(-bodyW/2 - 5*scale, armY + 22*scale);
  ctx.lineTo(-bodyW/2 - 3*scale, armY + 15*scale);
  ctx.closePath();
  ctx.fill();

  // Right arm - upper arm (sleeve)
  ctx.fillStyle = sleeveDark;
  ctx.beginPath();
  ctx.moveTo(bodyW/2 + 2*scale, armY);
  ctx.quadraticCurveTo(bodyW/2 + 10*scale, armY + 5*scale, bodyW/2 + 8*scale, armY + 14*scale);
  ctx.lineTo(bodyW/2 + 2*scale, armY + 12*scale);
  ctx.lineTo(bodyW/2 - 2*scale, armY + 2*scale);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = sleeveColor;
  ctx.beginPath();
  ctx.moveTo(bodyW/2, armY + 2*scale);
  ctx.quadraticCurveTo(bodyW/2 + 6*scale, armY + 6*scale, bodyW/2 + 5*scale, armY + 12*scale);
  ctx.lineTo(bodyW/2 + 3*scale, armY + 10*scale);
  ctx.lineTo(bodyW/2 - 1*scale, armY + 3*scale);
  ctx.closePath();
  ctx.fill();

  // Right arm - forearm (skin)
  ctx.fillStyle = shadeColor(skinTone, -15);
  ctx.beginPath();
  ctx.moveTo(bodyW/2 + 6*scale, armY + 12*scale);
  ctx.quadraticCurveTo(bodyW/2 + 12*scale, armY + 18*scale, bodyW/2 + 10*scale, armY + 26*scale);
  ctx.lineTo(bodyW/2 + 4*scale, armY + 24*scale);
  ctx.lineTo(bodyW/2 + 2*scale, armY + 14*scale);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = skinTone;
  ctx.beginPath();
  ctx.moveTo(bodyW/2 + 4*scale, armY + 14*scale);
  ctx.quadraticCurveTo(bodyW/2 + 8*scale, armY + 18*scale, bodyW/2 + 7*scale, armY + 24*scale);
  ctx.lineTo(bodyW/2 + 5*scale, armY + 22*scale);
  ctx.lineTo(bodyW/2 + 3*scale, armY + 15*scale);
  ctx.closePath();
  ctx.fill();

  // Hands (rounded with slight 3D effect)
  // Left hand
  ctx.fillStyle = shadeColor(skinTone, -10);
  ctx.beginPath();
  ctx.arc(-bodyW/2 - 7*scale, armY + 26*scale, 5*scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = skinTone;
  ctx.beginPath();
  ctx.arc(-bodyW/2 - 8*scale, armY + 25*scale, 4*scale, 0, Math.PI * 2);
  ctx.fill();
  // Right hand
  ctx.fillStyle = shadeColor(skinTone, -10);
  ctx.beginPath();
  ctx.arc(bodyW/2 + 7*scale, armY + 26*scale, 5*scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = skinTone;
  ctx.beginPath();
  ctx.arc(bodyW/2 + 8*scale, armY + 25*scale, 4*scale, 0, Math.PI * 2);
  ctx.fill();

  // === NAME TAG ===
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.font = `bold ${10 * scale}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(agent.name || 'Agent', 0, legY + 35*scale);

  // Role title
  const roleName = getCharacterRole(agent.name, currentCase?.scenario);
  if (roleName) {
    ctx.fillStyle = 'rgba(100, 100, 100, 0.8)';
    ctx.font = `${8 * scale}px sans-serif`;
    ctx.fillText(roleName, 0, legY + 45*scale);
  }

  // Thinking indicator
  if (agent.state === 'thinking') {
    ctx.fillStyle = 'rgba(243, 156, 18, 0.8)';
    ctx.beginPath();
    ctx.arc(15*scale, headY - 15*scale, 5*scale, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawSpeechBubble(agent) {
  const text = agent.message || '';
  const lines = wrapText(text, 40);

  const padding = 15;
  const lineHeight = 20;
  const width = 280;
  const height = Math.max(50, lines.length * lineHeight + padding * 2);

  // Calculate bubble position - ABOVE the agent
  let bubbleX = agent.x;

  // Keep bubble within horizontal bounds
  const minX = width / 2 + 10;  // Left edge + padding
  const maxX = canvas.width - width / 2 - 10;  // Right edge - padding
  bubbleX = Math.max(minX, Math.min(maxX, bubbleX));

  // Bubble bottom should be above the agent's head
  // bubbleY is the BOTTOM of the bubble rectangle
  const minTopY = 65;  // Minimum Y for top of bubble (below title bar)
  const agentHeadY = agent.y - 35 * THRONGLET_SCALE;  // Top of agent's head

  // Position bubble so its bottom is above the agent's head
  let bubbleY = agentHeadY - 15;  // 15px gap between bubble bottom and agent head

  // CRITICAL: Ensure bubble TOP never goes above minTopY
  // This takes priority over avoiding agent overlap - better to overlap than go off screen
  const bubbleTop = bubbleY - height;
  if (bubbleTop < minTopY) {
    bubbleY = minTopY + height;
  }

  // Keep bubble fully visible
  const alpha = 1.0;

  // Bubble
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.roundRect(bubbleX - width / 2, bubbleY - height, width, height, 10);
  ctx.fill();

  // Pointer - point down toward the agent from bottom of bubble
  const pointerX = Math.max(bubbleX - width/2 + 20, Math.min(bubbleX + width/2 - 20, agent.x));
  ctx.beginPath();
  ctx.moveTo(pointerX - 10, bubbleY);  // Bottom edge of bubble
  ctx.lineTo(agent.x, agentHeadY + 5);  // Point to just above agent's head
  ctx.lineTo(pointerX + 10, bubbleY);
  ctx.fill();

  // Type indicator
  const typeColors = {
    proposal: '#27ae60',
    counter: '#f39c12',
    accept: '#27ae60',
    reject: '#e74c3c',
    message: '#3498db'
  };
  ctx.fillStyle = typeColors[agent.messageType] || '#666';
  ctx.fillRect(bubbleX - width / 2, bubbleY - height, 5, height);

  // Text
  ctx.fillStyle = '#222';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'left';
  lines.forEach((line, i) => {
    ctx.fillText(line, bubbleX - width / 2 + padding + 5, bubbleY - height + padding + 16 + i * lineHeight);
  });

  ctx.globalAlpha = 1;
}

// Draw thought bubble for agent's internal reasoning (shown to observers only)
// Positioned BELOW the agent (speech bubble is above)
function drawThoughtBubble(agent, thoughts) {
  if (!thoughts) return;

  const lines = wrapText(thoughts, 25);
  const padding = 10;
  const lineHeight = 15;
  const width = 190;
  const height = Math.max(45, lines.length * lineHeight + padding * 2 + 18);

  // Position thought bubble BELOW the agent
  let bubbleX = agent.x;
  let bubbleY = agent.y + 80 * THRONGLET_SCALE; // Below agent

  // Keep bubble within horizontal bounds
  if (bubbleX - width / 2 < 20) {
    bubbleX = 20 + width / 2;
  } else if (bubbleX + width / 2 > canvas.width - 20) {
    bubbleX = canvas.width - 20 - width / 2;
  }

  // Keep bubble within vertical bounds (don't go off bottom)
  if (bubbleY + height / 2 > canvas.height - 20) {
    bubbleY = canvas.height - 20 - height / 2;
  }

  const cx = bubbleX;
  const cy = bubbleY;

  // Draw cloud-shaped thought bubble with scalloped edges
  ctx.save();

  // Shadow
  ctx.fillStyle = 'rgba(155, 89, 182, 0.2)';
  drawCloudShape(cx + 4, cy + 4, width, height);
  ctx.fill();

  // Main cloud fill
  ctx.fillStyle = 'rgba(245, 240, 255, 0.97)';
  ctx.strokeStyle = '#9b59b6';
  ctx.lineWidth = 2.5;
  drawCloudShape(cx, cy, width, height);
  ctx.fill();
  ctx.stroke();

  // Thought bubble trailing circles (classic comic style) - pointing UP to agent
  const dotSizes = [10, 7, 4];
  const startX = cx;
  const startY = cy - height / 2 - 5; // Top of bubble
  const endX = agent.x;
  const endY = agent.y + 40 * THRONGLET_SCALE; // Just below agent

  for (let i = 0; i < 3; i++) {
    const t = (i + 1) / 4;
    const dotX = startX + (endX - startX) * t;
    const dotY = startY + (endY - startY) * t;

    // Shadow
    ctx.fillStyle = 'rgba(155, 89, 182, 0.15)';
    ctx.beginPath();
    ctx.arc(dotX + 1, dotY + 1, dotSizes[i], 0, Math.PI * 2);
    ctx.fill();

    // Dot
    ctx.fillStyle = 'rgba(245, 240, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotSizes[i], 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#9b59b6';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // "thinking..." label with thought emoji
  ctx.fillStyle = '#9b59b6';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('💭 thinking...', cx - width/2 + padding, cy - height/2 + padding + 12);

  // Thought text in italics
  ctx.fillStyle = '#4a4a4a';
  ctx.font = 'italic 13px sans-serif';
  ctx.textAlign = 'left';
  lines.forEach((line, i) => {
    ctx.fillText(line, cx - width/2 + padding, cy - height/2 + padding + 30 + i * lineHeight);
  });

  ctx.restore();
}

// Helper: Draw cloud shape for thought bubbles - simple rounded rectangle
function drawCloudShape(cx, cy, width, height) {
  const x = cx - width / 2;
  const y = cy - height / 2;
  const r = 15; // corner radius

  ctx.beginPath();
  ctx.roundRect(x, y, width, height, r);
}

function drawChitchatBubble(agent) {
  const text = agent.chitchatMessage || '';
  const x = agent.x + 60; // Offset to the side
  const y = agent.y - 40 * THRONGLET_SCALE;
  const width = 140;
  const height = 36;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.roundRect(x - width / 2 + 3, y - height + 3, width, height, 8);
  ctx.fill();

  // White bubble background
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - height, width, height, 8);
  ctx.fill();

  // Border
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Pointer
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x - 25, y);
  ctx.lineTo(x - 40, y + 12);
  ctx.lineTo(x - 15, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Cover the pointer border inside bubble
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 26, y - 3, 13, 4);

  // Text
  ctx.fillStyle = '#222';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y - height / 2 + 5);
}

function drawSetupPhaseOverlay() {
  // Semi-transparent overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Setup message box
  const boxWidth = 400;
  const boxHeight = 160;
  const boxX = (canvas.width - boxWidth) / 2;
  const boxY = (canvas.height - boxHeight) / 2;

  // Box background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 12);
  ctx.fill();

  // Purple accent bar
  ctx.fillStyle = '#9b59b6';
  ctx.fillRect(boxX, boxY, 6, boxHeight);

  // Check if agents are already created
  const agentsCreated = currentCase && currentCase.participants && currentCase.participants.length > 0;

  // Icon
  ctx.font = '32px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(agentsCreated ? '✅' : '⚙️', canvas.width / 2, boxY + 45);

  // Title
  ctx.fillStyle = '#333';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(agentsCreated ? 'Ready to Start' : 'Setup Phase', canvas.width / 2, boxY + 75);

  // Description
  ctx.fillStyle = '#666';
  ctx.font = '14px sans-serif';
  if (agentsCreated) {
    ctx.fillText('Agents are ready and waiting.', canvas.width / 2, boxY + 100);
    ctx.fillText('Use auto-play to begin the discussion.', canvas.width / 2, boxY + 120);
  } else {
    ctx.fillText('Waiting for AI to analyze scenario', canvas.width / 2, boxY + 100);
    ctx.fillText('and identify agents & options...', canvas.width / 2, boxY + 120);
  }

  // Show progress if any agents/options created
  if (currentCase) {
    const agentCount = currentCase.participants ? currentCase.participants.length : 0;
    const optionCount = currentCase.options ? currentCase.options.length : 0;

    if (agentCount > 0 || optionCount > 0) {
      // Setup complete - waiting for first message
      ctx.fillStyle = '#27ae60';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`Ready: ${agentCount} agents, ${optionCount} options`, canvas.width / 2, boxY + 140);
      ctx.fillStyle = '#666';
      ctx.font = '11px sans-serif';
      ctx.fillText('Submit first response to begin', canvas.width / 2, boxY + 155);
    } else {
      ctx.fillStyle = '#999';
      ctx.font = '12px sans-serif';
      ctx.fillText('Run auto-play to begin setup', canvas.width / 2, boxY + 145);
    }
  }
}

function getSetupCurlCommand() {
  if (!currentCase) return '';
  const baseUrl = window.location.origin;
  return `curl "${baseUrl}/api/cases/${currentCase.id}/auto-play"`;
}

function drawResolvedOverlay() {
  // Check for unread boss messages that will reopen the case
  const unreadBossMessages = currentCase.bossMessages?.filter(m => !m.read) || [];
  const willContinue = unreadBossMessages.length > 0;

  // Subtle darkening at edges instead of full overlay
  const gradient = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, 100,
    canvas.width / 2, canvas.height / 2, canvas.width / 2
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Determine what to show based on outcome
  const isAgreed = currentCase.outcome === 'agreed';

  // Get the resolution details
  let selectedOptionName = null;
  if (currentCase.selectedOptionId && currentCase.options) {
    const selectedOption = currentCase.options.find(r => r.id === currentCase.selectedOptionId);
    if (selectedOption) {
      selectedOptionName = selectedOption.name;
    }
  }

  // Calculate banner height based on content
  const hasDetail = selectedOptionName || currentCase.resolutionSummary || willContinue;
  const bannerHeight = willContinue ? 130 : (hasDetail ? 100 : 70);
  const bannerY = canvas.height / 2 - bannerHeight / 2 + 20;

  // Banner background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath();
  ctx.roundRect(canvas.width / 2 - 180, bannerY - 45, 360, bannerHeight, 12);
  ctx.fill();

  // Accent bar color - blue if continuing, otherwise green/red based on outcome
  ctx.fillStyle = willContinue ? '#3498db' : (isAgreed ? '#27ae60' : '#e74c3c');
  ctx.fillRect(canvas.width / 2 - 180, bannerY - 45, 6, bannerHeight);

  // Outcome text
  ctx.fillStyle = isAgreed ? '#27ae60' : '#e74c3c';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(isAgreed ? 'AGREED!' : 'FAILED', canvas.width / 2, bannerY - 5);

  // Show what was agreed on
  ctx.fillStyle = '#333';
  ctx.font = '16px sans-serif';

  if (selectedOptionName) {
    // Option-based resolution
    ctx.fillText(`Selected: ${selectedOptionName}`, canvas.width / 2, bannerY + 25);
  } else if (currentCase.resolutionSummary) {
    // Debate-style or custom resolution
    const summaryLines = wrapText(currentCase.resolutionSummary, 40);
    summaryLines.slice(0, 2).forEach((line, i) => {
      ctx.fillText(line, canvas.width / 2, bannerY + 25 + i * 20);
    });
  }

  // Show "conversation will continue" indicator if there are unread boss messages
  if (willContinue) {
    ctx.fillStyle = '#3498db';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('New facilitator message - conversation will continue', canvas.width / 2, bannerY + 55);
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.fillText('Run auto-play to resume', canvas.width / 2, bannerY + 75);
  }
}

function wrapText(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  words.forEach(word => {
    if ((currentLine + ' ' + word).trim().length <= maxChars) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  });

  if (currentLine) lines.push(currentLine);
  return lines;
}

// Polyfill for roundRect if needed
if (!ctx.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}

// ==================== AUDIO / TEXT-TO-SPEECH ====================

function initializeVoices() {
  // Load available voices
  const loadVoices = () => {
    availableVoices = speechSynthesis.getVoices();
    console.log('Loaded', availableVoices.length, 'voices');

    // Log available voices for debugging (check console to see what's available)
    if (availableVoices.length > 0) {
      logAvailableVoices();

      // Check if we have high-quality neural voices
      const hasNeuralVoices = availableVoices.some(v =>
        v.name.includes('Online') || v.name.includes('Natural')
      );
      if (hasNeuralVoices) {
        console.log('✓ Microsoft Neural voices detected - best quality available!');
      } else if (availableVoices.some(v => v.name.includes('Microsoft'))) {
        console.log('✓ Microsoft Desktop voices detected - good quality');
      } else {
        console.log('ℹ Using standard browser voices. For best quality, try Microsoft Edge.');
      }
    }
  };

  // Chrome loads voices asynchronously
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
  }
  loadVoices();
}

function initAudioButtonState() {
  const btn = document.getElementById('audio-toggle-btn');
  const iconOff = document.getElementById('audio-icon-off');
  const iconOn = document.getElementById('audio-icon-on');
  const label = document.getElementById('audio-label');

  if (!btn) return;

  if (audioEnabled) {
    btn.classList.remove('bg-gray-200', 'dark:bg-slate-700', 'text-gray-600', 'dark:text-slate-400');
    btn.classList.add('bg-primary/20', 'text-primary');
    if (iconOff) iconOff.classList.add('hidden');
    if (iconOn) iconOn.classList.remove('hidden');
    if (label) label.textContent = 'Audio On';
  } else {
    btn.classList.add('bg-gray-200', 'dark:bg-slate-700', 'text-gray-600', 'dark:text-slate-400');
    btn.classList.remove('bg-primary/20', 'text-primary');
    if (iconOff) iconOff.classList.remove('hidden');
    if (iconOn) iconOn.classList.add('hidden');
    if (label) label.textContent = 'Audio Off';
  }
}

function showClickToStartPrompt() {
  // Don't show if already exists or user has interacted
  if (document.getElementById('click-to-start-audio') || userHasInteracted) return;

  const prompt = document.createElement('div');
  prompt.id = 'click-to-start-audio';
  prompt.className = 'fixed top-20 left-1/2 transform -translate-x-1/2 bg-primary text-white px-4 py-2 rounded-lg shadow-lg z-50 cursor-pointer animate-pulse';
  prompt.innerHTML = '🔊 Click anywhere to start audio';
  prompt.onclick = () => prompt.remove();

  document.body.appendChild(prompt);

  // Auto-hide after 10 seconds if not clicked
  setTimeout(() => {
    if (prompt.parentNode) prompt.remove();
  }, 10000);
}

function toggleAudio() {
  audioEnabled = !audioEnabled;

  const btn = document.getElementById('audio-toggle-btn');
  const iconOff = document.getElementById('audio-icon-off');
  const iconOn = document.getElementById('audio-icon-on');
  const label = document.getElementById('audio-label');

  if (audioEnabled) {
    btn.classList.remove('bg-gray-200', 'dark:bg-slate-700', 'text-gray-600', 'dark:text-slate-400');
    btn.classList.add('bg-primary/20', 'text-primary');
    iconOff.classList.add('hidden');
    iconOn.classList.remove('hidden');
    label.textContent = 'Audio On';

    // Speak the last message when enabling
    if (currentCase && currentCase.messages.length > 0) {
      const lastMsg = currentCase.messages[currentCase.messages.length - 1];
      speakMessage(lastMsg);
    }
  } else {
    btn.classList.add('bg-gray-200', 'dark:bg-slate-700', 'text-gray-600', 'dark:text-slate-400');
    btn.classList.remove('bg-primary/20', 'text-primary');
    iconOff.classList.remove('hidden');
    iconOn.classList.add('hidden');
    label.textContent = 'Audio Off';

    // Stop any ongoing speech
    speechSynthesis.cancel();
  }
}

// Replay all messages from the beginning (re-queue existing messages)
function replayMessages() {
  if (!currentCase) {
    alert('No case selected');
    return;
  }

  if (!currentCase.messages || currentCase.messages.length === 0) {
    alert('No messages to replay');
    return;
  }

  // Stop any current speech
  speechSynthesis.cancel();

  // Clear the queue and reset tracking
  messageQueue = [];
  currentDisplayMessage = null;
  displayedMessageIds.clear();  // Clear ALL displayed tracking for replay
  lastSpokenMessageId = null;
  isDisplayingMessage = false;
  waitingForSpeech = false;
  isSpeaking = false;

  // Queue all messages from the beginning
  console.log('Replaying', currentCase.messages.length, 'messages');
  queueNewMessages(currentCase.messages);
}

function getVoiceForAgent(agentId) {
  // Check if agent has AI-determined voice settings
  if (currentCase && currentCase.participants) {
    const participant = currentCase.participants.find(p => p.id === agentId);
    if (participant) {
      // Try to get voice settings from preferences (stored as JSON)
      let voiceSettings = {};
      try {
        if (participant.preferences && typeof participant.preferences === 'object') {
          voiceSettings = participant.preferences.voice || {};
        }
      } catch (e) {}

      // Return agent-specific settings or defaults based on index
      const idx = currentCase.participants.indexOf(participant);
      const defaultSettings = getDefaultVoiceSettings(idx, participant.name);

      return {
        pitch: voiceSettings.pitch || defaultSettings.pitch,
        rate: voiceSettings.rate || defaultSettings.rate,
        voiceType: voiceSettings.voiceType || defaultSettings.voiceType
      };
    }
  }

  return { pitch: 1, rate: 1, voiceType: 'default' };
}

function getDefaultVoiceSettings(index, _name) {
  // Assign different voice characteristics based on index/role
  const voiceProfiles = [
    { pitch: 0.8, rate: 0.9, voiceType: 'male' },    // First agent - deeper, slower (often moderator)
    { pitch: 1.2, rate: 1.0, voiceType: 'female' },  // Second agent - higher pitch
    { pitch: 1.0, rate: 1.1, voiceType: 'male' },    // Third agent - normal pitch, slightly faster
    { pitch: 1.4, rate: 0.95, voiceType: 'female' }, // Fourth agent - highest pitch
    { pitch: 0.7, rate: 0.85, voiceType: 'male' },   // Fifth agent - very deep
  ];

  return voiceProfiles[index % voiceProfiles.length];
}

// Voice Selection Priority:
// 1. Microsoft Edge Neural Voices (best quality, free in Edge browser)
//    - Names include "Online" or "Natural", e.g. "Microsoft Aria Online (Natural)"
//    - Available voices: Aria, Jenny, Guy, Eric, Sara, etc.
// 2. Microsoft Desktop Voices (good quality, available on Windows)
//    - Names like "Microsoft David", "Microsoft Zira"
// 3. macOS/iOS Voices (good quality on Apple devices)
//    - Names like "Samantha", "Alex", "Daniel"
// 4. Google Chrome Voices (decent quality)
//    - Names like "Google US English", "Google UK English Female"
// 5. Any available voice as fallback

function findVoiceByType(voiceType) {
  if (availableVoices.length === 0) return null;

  // Microsoft Edge Neural Voices (highest quality, free)
  // These have "Online" or "Natural" in the name
  const msNeuralVoices = {
    'male': ['Guy Online', 'Eric Online', 'Christopher Online', 'Guy Natural', 'Eric Natural'],
    'female': ['Aria Online', 'Jenny Online', 'Sara Online', 'Aria Natural', 'Jenny Natural']
  };

  // Microsoft Desktop Voices (good quality)
  const msDesktopVoices = {
    'male': ['Microsoft David', 'Microsoft Mark', 'Microsoft George'],
    'female': ['Microsoft Zira', 'Microsoft Hazel', 'Microsoft Susan']
  };

  // macOS/iOS Voices (good quality on Apple)
  const appleVoices = {
    'male': ['Daniel', 'Alex', 'Tom', 'Oliver', 'Aaron'],
    'female': ['Samantha', 'Karen', 'Victoria', 'Fiona', 'Moira', 'Tessa']
  };

  // Google Chrome Voices
  const googleVoices = {
    'male': ['Google UK English Male', 'Google US English'],
    'female': ['Google UK English Female', 'Google US English Female']
  };

  // Try each voice set in priority order
  const voiceSets = [msNeuralVoices, msDesktopVoices, appleVoices, googleVoices];

  for (const voiceSet of voiceSets) {
    const names = voiceSet[voiceType] || [];
    for (const name of names) {
      const voice = availableVoices.find(v => v.name.includes(name));
      if (voice) {
        console.log(`Selected voice: ${voice.name} (${voiceType})`);
        return voice;
      }
    }
  }

  // Fallback: try to find by gender hint in voice name
  if (voiceType === 'female') {
    const femaleVoice = availableVoices.find(v =>
      v.name.toLowerCase().includes('female') ||
      ['samantha', 'karen', 'victoria', 'zira', 'hazel', 'aria', 'jenny'].some(n =>
        v.name.toLowerCase().includes(n)
      )
    );
    if (femaleVoice) return femaleVoice;
  }

  if (voiceType === 'male') {
    const maleVoice = availableVoices.find(v =>
      v.name.toLowerCase().includes('male') ||
      ['david', 'mark', 'george', 'guy', 'eric', 'daniel'].some(n =>
        v.name.toLowerCase().includes(n)
      )
    );
    if (maleVoice) return maleVoice;
  }

  // Final fallback: return first available voice
  return availableVoices[0];
}

// Log available voices for debugging
function logAvailableVoices() {
  console.log('Available voices:');
  availableVoices.forEach((v, i) => {
    const isNeural = v.name.includes('Online') || v.name.includes('Natural');
    console.log(`  ${i + 1}. ${v.name} (${v.lang})${isNeural ? ' [NEURAL]' : ''}`);
  });
}

function speakMessage(message) {
  if (!audioEnabled) return;
  if (!message || !message.content) return;
  if (message.id === lastSpokenMessageId) return;

  // Browser autoplay policy: can't play audio until user has interacted with page
  if (!userHasInteracted) {
    console.log('Waiting for user interaction before playing audio...');
    return; // Will be triggered when user clicks
  }

  // Cancel any ongoing speech
  speechSynthesis.cancel();
  isSpeaking = false;
  waitingForSpeech = true;

  const voiceSettings = getVoiceForAgent(message.author);
  const utterance = new SpeechSynthesisUtterance(message.content);

  // Apply voice settings
  utterance.pitch = voiceSettings.pitch;
  utterance.rate = voiceSettings.rate;

  // Try to set a specific voice
  const voice = findVoiceByType(voiceSettings.voiceType);
  if (voice) {
    utterance.voice = voice;
  }

  // Store the message ID we're speaking so callbacks can verify
  const speakingMessageId = message.id;

  // Track speech start/end for polling pause and bubble lingering
  utterance.onstart = () => {
    isSpeaking = true;
    bubbleHideTime = 0; // Reset - bubble should show while speaking
  };
  utterance.onend = () => {
    // Only process if this is still the message we're waiting for
    if (lastSpokenMessageId !== speakingMessageId) return;
    isSpeaking = false;
    waitingForSpeech = false;
    speechEndTime = Date.now();
    bubbleHideTime = Date.now() + BUBBLE_LINGER_MS; // Keep bubble visible for 15 more seconds
    // Wait 1 second after speech ends, then complete the message and start next
    setTimeout(() => {
      completeCurrentMessage();
    }, MESSAGE_GAP_AFTER_SPEECH_MS);
  };
  utterance.onerror = (event) => {
    // Only process if this is still the message we're waiting for
    // Also ignore 'interrupted' errors from cancel() calls
    if (lastSpokenMessageId !== speakingMessageId) return;
    if (event.error === 'interrupted' || event.error === 'canceled') return;
    isSpeaking = false;
    waitingForSpeech = false;
    speechEndTime = Date.now();
    bubbleHideTime = Date.now() + BUBBLE_LINGER_MS;
    // Wait 1 second, then complete the current message even on error
    setTimeout(() => {
      completeCurrentMessage();
    }, MESSAGE_GAP_AFTER_SPEECH_MS);
  };

  // Get agent name for logging
  let agentName = 'Unknown';
  if (currentCase && currentCase.participants) {
    const participant = currentCase.participants.find(p => p.id === message.author);
    if (participant) agentName = participant.name;
  }

  console.log(`Speaking as ${agentName} (pitch: ${voiceSettings.pitch}, rate: ${voiceSettings.rate})`);

  lastSpokenMessageId = message.id;
  isSpeaking = true; // Set immediately in case onstart is delayed
  speechSynthesis.speak(utterance);
}

// ==================== MESSAGE QUEUE SYSTEM ====================

// Queue new messages that haven't been displayed yet
function queueNewMessages(messages) {
  if (!messages || messages.length === 0) return;

  // Hide the pending turn curl since messages are coming in
  hidePendingTurnCurl();

  // Find messages that we haven't seen yet
  messages.forEach(msg => {
    // Skip if already displayed (check the Set of ALL displayed IDs)
    if (displayedMessageIds.has(msg.id)) return;
    // Skip if currently displaying
    if (currentDisplayMessage && msg.id === currentDisplayMessage.id) return;
    // Skip if already in queue
    if (messageQueue.some(m => m.id === msg.id)) return;

    messageQueue.push(msg);
  });

  // If not currently displaying a message, start processing
  if (!isDisplayingMessage && messageQueue.length > 0) {
    processNextMessage();
  }
}

// Process the next message in the queue
function processNextMessage() {
  if (messageQueue.length === 0) {
    isDisplayingMessage = false;
    currentDisplayMessage = null;
    return;
  }

  isDisplayingMessage = true;
  currentDisplayMessage = messageQueue.shift();
  messageDisplayStartTime = Date.now();
  currentMessageDisplayDuration = calculateDisplayTime(currentDisplayMessage);

  // Update agent state to show the message
  if (currentCase && currentDisplayMessage) {
    const agentKey = currentDisplayMessage.author;
    if (agents[agentKey]) {
      agents[agentKey].message = currentDisplayMessage.content;
      agents[agentKey].messageType = currentDisplayMessage.type;
      agents[agentKey].messageTime = new Date(currentDisplayMessage.timestamp).getTime();

      // Emote based on message type
      if (currentDisplayMessage.type === 'accept') {
        agents[agentKey].emote = '✅';
        agents[agentKey].emoteTimer = 3000;
      } else if (currentDisplayMessage.type === 'reject') {
        agents[agentKey].emote = '❌';
        agents[agentKey].emoteTimer = 2000;
      } else if (currentDisplayMessage.type === 'proposal' || currentDisplayMessage.type === 'counter') {
        agents[agentKey].emote = '💡';
        agents[agentKey].emoteTimer = 2000;
      }

      // Move speaker to a clear visible position and move others away
      moveSpeakerToFront(agentKey);
    }

    // Update the thoughts panel in the sidebar
    updateThoughtsPanel(currentDisplayMessage);
  }

  // Speak the message if audio is enabled AND user has interacted
  if (audioEnabled && userHasInteracted) {
    waitingForSpeech = true;
    speakMessage(currentDisplayMessage);
  } else {
    waitingForSpeech = false;
    // If no audio (or no user interaction yet), auto-advance after calculated display time
    setTimeout(() => {
      completeCurrentMessage();
    }, currentMessageDisplayDuration);
  }
}

// Mark the current message as complete and process next
function completeCurrentMessage() {
  if (!currentDisplayMessage) return;

  // If audio is enabled and we're still waiting for speech, don't complete yet
  if (audioEnabled && waitingForSpeech && isSpeaking) {
    return;
  }

  // Ensure display time has passed (only applies when no audio)
  if (!audioEnabled) {
    const elapsed = Date.now() - messageDisplayStartTime;
    if (elapsed < currentMessageDisplayDuration) {
      setTimeout(() => completeCurrentMessage(), currentMessageDisplayDuration - elapsed);
      return;
    }
  }

  // Return the speaker to their original position (or home position)
  const speakerId = currentDisplayMessage.author;
  const speaker = agents[speakerId];
  if (speaker) {
    // Return to original position if stored, otherwise home position
    const returnX = speaker.originalX !== undefined ? speaker.originalX : speaker.homeX;
    const returnY = speaker.originalY !== undefined ? speaker.originalY : speaker.homeY;
    speaker.targetX = returnX;
    speaker.targetY = returnY;
    speaker.idleAction = 'speaking_move';
    // Clear the stored original position
    delete speaker.originalX;
    delete speaker.originalY;
  }

  // Add to set of displayed messages (prevents re-queuing on poll)
  displayedMessageIds.add(currentDisplayMessage.id);
  currentDisplayMessage = null;
  isDisplayingMessage = false;
  waitingForSpeech = false;

  // Process next message after a brief pause
  setTimeout(() => {
    processNextMessage();
  }, 500);
}

// Clear the message queue (called on case change)
function clearMessageQueue() {
  messageQueue = [];
  currentDisplayMessage = null;
  displayedMessageIds.clear();  // Clear ALL displayed tracking for new case
  isDisplayingMessage = false;
  waitingForSpeech = false;
  messageDisplayStartTime = 0;
  // Cancel any ongoing speech
  speechSynthesis.cancel();
}

// Check if the queue is busy (for polling control)
function isQueueBusy() {
  return isDisplayingMessage || messageQueue.length > 0;
}
