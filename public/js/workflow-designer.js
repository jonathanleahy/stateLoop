// Workflow Designer JavaScript

// State
let currentWorkflow = null;
let scenarios = [];
let canvasState = { panX: 0, panY: 0, zoom: 1 };
let selectedNode = null;
let isDragging = false;
let isPanning = false;
let isConnecting = false;
let connectingFromNode = null;
let dragOffset = { x: 0, y: 0 };
let panStart = { x: 0, y: 0 };

// DOM Elements
const workflowSelector = document.getElementById('workflow-selector');
const newWorkflowBtn = document.getElementById('new-workflow-btn');
const playBtn = document.getElementById('play-btn');
const continueBtn = document.getElementById('continue-btn');
const scenarioPalette = document.getElementById('scenario-palette');
const canvasContainer = document.getElementById('canvas-container');
const nodesContainer = document.getElementById('nodes-container');
const edgeCanvas = document.getElementById('edge-canvas');
const emptyState = document.getElementById('empty-state');
const detailsPanel = document.getElementById('details-panel');
const nodeDetails = document.getElementById('node-details');
const workflowDetails = document.getElementById('workflow-details');
const workflowStatus = document.getElementById('workflow-status');
const nodeCount = document.getElementById('node-count');

// Theme toggle
document.getElementById('theme-toggle').addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
  const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  localStorage.setItem('stateloop-theme', theme);
});

// Initialize
async function init() {
  await loadScenarios();
  await loadWorkflows();
  setupEventListeners();
  resizeCanvas();
}

// Load scenarios for palette
async function loadScenarios() {
  try {
    const response = await fetch('/api/scenarios');
    const data = await response.json();
    scenarios = Array.isArray(data) ? data : (data.scenarios || []);
    renderScenarioPalette();
  } catch (error) {
    console.error('Failed to load scenarios:', error);
  }
}

// Render scenario palette
function renderScenarioPalette() {
  scenarioPalette.innerHTML = scenarios.map(s => {
    const scenarioId = s.filename ? s.filename.replace('.txt', '') : s.name;
    return `
    <div class="scenario-item p-3 bg-gray-100 dark:bg-slate-700 rounded-lg cursor-grab hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
         draggable="true"
         data-scenario="${scenarioId}">
      <div class="flex items-center gap-2">
        <span class="text-lg">${s.icon || '📄'}</span>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-gray-900 dark:text-slate-200 truncate">${s.name}</div>
          <div class="text-xs text-gray-500 dark:text-slate-400">${s.location || 'No location'}</div>
        </div>
      </div>
    </div>
  `}).join('');

  // Add drag handlers
  scenarioPalette.querySelectorAll('.scenario-item').forEach(item => {
    item.addEventListener('dragstart', handleScenarioDragStart);
  });
}

// Load workflows
async function loadWorkflows() {
  try {
    const response = await fetch('/api/workflow-designs');
    const data = await response.json();
    const workflows = data.designs || [];

    workflowSelector.innerHTML = '<option value="">Select workflow...</option>' +
      workflows.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
  } catch (error) {
    console.error('Failed to load workflows:', error);
  }
}

// Setup event listeners
function setupEventListeners() {
  // Workflow selector
  workflowSelector.addEventListener('change', async (e) => {
    if (e.target.value) {
      await loadWorkflow(e.target.value);
    } else {
      currentWorkflow = null;
      renderWorkflow();
    }
  });

  // New workflow
  newWorkflowBtn.addEventListener('click', () => {
    document.getElementById('new-workflow-modal').classList.remove('hidden');
    document.getElementById('new-workflow-name').value = '';
    document.getElementById('new-workflow-desc').value = '';
    document.getElementById('new-workflow-name').focus();
  });

  document.getElementById('cancel-new-workflow').addEventListener('click', () => {
    document.getElementById('new-workflow-modal').classList.add('hidden');
  });

  document.getElementById('create-workflow-btn').addEventListener('click', createWorkflow);

  // Canvas events
  canvasContainer.addEventListener('dragover', handleCanvasDragOver);
  canvasContainer.addEventListener('drop', handleCanvasDrop);
  canvasContainer.addEventListener('mousedown', handleCanvasMouseDown);
  canvasContainer.addEventListener('mousemove', handleCanvasMouseMove);
  canvasContainer.addEventListener('mouseup', handleCanvasMouseUp);
  canvasContainer.addEventListener('wheel', handleCanvasWheel);
  canvasContainer.addEventListener('click', handleCanvasClick);

  // Zoom buttons
  document.getElementById('zoom-in-btn').addEventListener('click', () => {
    canvasState.zoom = Math.min(2, canvasState.zoom * 1.2);
    applyCanvasTransform();
  });

  document.getElementById('zoom-out-btn').addEventListener('click', () => {
    canvasState.zoom = Math.max(0.25, canvasState.zoom / 1.2);
    applyCanvasTransform();
  });

  document.getElementById('fit-btn').addEventListener('click', fitToView);

  // Play/Continue
  playBtn.addEventListener('click', runWorkflow);
  continueBtn.addEventListener('click', continueWorkflow);

  // Details panel
  document.getElementById('node-label').addEventListener('change', updateNodeLabel);
  document.getElementById('delete-node-btn').addEventListener('click', deleteSelectedNode);
  document.getElementById('rerun-node-btn').addEventListener('click', rerunSelectedNode);
  document.getElementById('save-workflow-btn').addEventListener('click', saveWorkflowDetails);
  document.getElementById('delete-workflow-btn').addEventListener('click', deleteWorkflow);

  // Command bar
  document.getElementById('copy-command-btn').addEventListener('click', copyCommand);
  document.getElementById('run-auto-btn').addEventListener('click', autoRunCase);
  document.getElementById('hide-command-btn').addEventListener('click', hideCommand);

  // Window resize
  window.addEventListener('resize', resizeCanvas);
}

// Handle scenario drag start
function handleScenarioDragStart(e) {
  e.dataTransfer.setData('text/plain', e.target.dataset.scenario);
  e.dataTransfer.effectAllowed = 'copy';
}

// Handle canvas drag over
function handleCanvasDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
}

// Handle canvas drop
async function handleCanvasDrop(e) {
  e.preventDefault();
  if (!currentWorkflow) {
    alert('Please create or select a workflow first');
    return;
  }

  const scenarioName = e.dataTransfer.getData('text/plain');
  if (!scenarioName) return;

  const rect = canvasContainer.getBoundingClientRect();
  const x = (e.clientX - rect.left - canvasState.panX) / canvasState.zoom;
  const y = (e.clientY - rect.top - canvasState.panY) / canvasState.zoom;

  try {
    const response = await fetch(`/api/workflow-designs/${currentWorkflow.id}/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenarioName,
        positionX: x,
        positionY: y
      })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error?.message || 'Failed to add node');
      return;
    }

    await loadWorkflow(currentWorkflow.id);
  } catch (error) {
    console.error('Failed to add node:', error);
  }
}

// Handle canvas mouse events
function handleCanvasMouseDown(e) {
  const nodeEl = e.target.closest('.node-card');

  if (nodeEl) {
    // Check if clicking on output port
    if (e.target.classList.contains('output-port')) {
      isConnecting = true;
      connectingFromNode = nodeEl.dataset.nodeId;
      e.preventDefault();
      return;
    }

    // Start dragging node
    isDragging = true;
    selectedNode = nodeEl.dataset.nodeId;
    const rect = nodeEl.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    nodeEl.classList.add('dragging');
    showNodeDetails(selectedNode);
  } else {
    // Start panning
    isPanning = true;
    panStart.x = e.clientX - canvasState.panX;
    panStart.y = e.clientY - canvasState.panY;
    canvasContainer.style.cursor = 'grabbing';
  }
}

function handleCanvasMouseMove(e) {
  if (isDragging && selectedNode) {
    const nodeEl = nodesContainer.querySelector(`[data-node-id="${selectedNode}"]`);
    if (!nodeEl) return;

    const rect = canvasContainer.getBoundingClientRect();
    const x = (e.clientX - rect.left - canvasState.panX - dragOffset.x) / canvasState.zoom;
    const y = (e.clientY - rect.top - canvasState.panY - dragOffset.y) / canvasState.zoom;

    nodeEl.style.left = `${x}px`;
    nodeEl.style.top = `${y}px`;
    drawEdges();
  } else if (isPanning) {
    canvasState.panX = e.clientX - panStart.x;
    canvasState.panY = e.clientY - panStart.y;
    applyCanvasTransform();
  } else if (isConnecting) {
    drawEdges(e);
  }
}

async function handleCanvasMouseUp(e) {
  if (isDragging && selectedNode) {
    const nodeEl = nodesContainer.querySelector(`[data-node-id="${selectedNode}"]`);
    if (nodeEl) {
      nodeEl.classList.remove('dragging');
      // Save position
      const x = parseFloat(nodeEl.style.left);
      const y = parseFloat(nodeEl.style.top);
      await updateNodePosition(selectedNode, x, y);
    }
    isDragging = false;
  }

  if (isPanning) {
    isPanning = false;
    canvasContainer.style.cursor = '';
    // Save canvas state
    if (currentWorkflow) {
      saveCanvasState();
    }
  }

  if (isConnecting) {
    // Check if dropped on an input port
    const targetPort = e.target.closest('.input-port');
    if (targetPort) {
      const targetNode = targetPort.closest('.node-card').dataset.nodeId;
      if (targetNode !== connectingFromNode) {
        await createEdge(connectingFromNode, targetNode);
      }
    }
    isConnecting = false;
    connectingFromNode = null;
    drawEdges();
  }
}

function handleCanvasWheel(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  canvasState.zoom = Math.max(0.25, Math.min(2, canvasState.zoom * delta));
  applyCanvasTransform();
}

function handleCanvasClick(e) {
  if (!e.target.closest('.node-card')) {
    selectedNode = null;
    showWorkflowDetails();
  }
}

// Apply canvas transform
function applyCanvasTransform() {
  nodesContainer.style.transform = `translate(${canvasState.panX}px, ${canvasState.panY}px) scale(${canvasState.zoom})`;
  nodesContainer.style.transformOrigin = '0 0';
  drawEdges();
}

// Resize canvas
function resizeCanvas() {
  const rect = canvasContainer.getBoundingClientRect();
  edgeCanvas.width = rect.width;
  edgeCanvas.height = rect.height;
  drawEdges();
}

// Load workflow
async function loadWorkflow(workflowId) {
  try {
    const response = await fetch(`/api/workflow-designs/${workflowId}`);
    if (!response.ok) throw new Error('Failed to load workflow');

    currentWorkflow = await response.json();
    if (currentWorkflow.canvasState) {
      canvasState = currentWorkflow.canvasState;
    } else {
      canvasState = { panX: 0, panY: 0, zoom: 1 };
    }
    renderWorkflow();
    updateUI();
  } catch (error) {
    console.error('Failed to load workflow:', error);
  }
}

// Render workflow
function renderWorkflow() {
  if (!currentWorkflow) {
    nodesContainer.innerHTML = '';
    emptyState.classList.remove('hidden');
    detailsPanel.classList.add('hidden');
    playBtn.disabled = true;
    return;
  }

  emptyState.classList.toggle('hidden', currentWorkflow.nodes.length > 0);
  playBtn.disabled = currentWorkflow.nodes.length === 0;

  // Render nodes
  nodesContainer.innerHTML = currentWorkflow.nodes.map(node => {
    const scenario = scenarios.find(s => s.name === node.scenarioName) || {};
    const statusClass = `status-${node.status}`;

    return `
      <div class="node-card absolute bg-white dark:bg-slate-700 rounded-lg shadow-lg border-2 border-gray-200 dark:border-slate-600 w-48 p-3 transition-shadow hover:shadow-xl"
           data-node-id="${node.id}"
           style="left: ${node.positionX}px; top: ${node.positionY}px">
        <!-- Input port -->
        <div class="input-port absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-gray-400 dark:bg-slate-500 border-2 border-white dark:border-slate-700 cursor-pointer port"></div>

        <!-- Content -->
        <div class="flex items-start gap-2">
          <span class="text-2xl">${scenario.icon || '📄'}</span>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">
              ${node.label || scenario.title || node.scenarioName}
            </div>
            <div class="text-xs text-gray-500 dark:text-slate-400 truncate">
              ${scenario.location || 'No location'}
            </div>
            <div class="mt-1 flex items-center gap-1">
              <span class="w-2 h-2 rounded-full ${statusClass}"></span>
              <span class="text-xs text-gray-500 dark:text-slate-400 capitalize">${node.status}</span>
            </div>
          </div>
        </div>

        <!-- Output port -->
        <div class="output-port absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-primary border-2 border-white dark:border-slate-700 cursor-pointer port"></div>
      </div>
    `;
  }).join('');

  applyCanvasTransform();
  drawEdges();
}

// Draw edges
function drawEdges(mouseEvent = null) {
  const ctx = edgeCanvas.getContext('2d');
  ctx.clearRect(0, 0, edgeCanvas.width, edgeCanvas.height);

  if (!currentWorkflow) return;

  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 2;

  // Draw existing edges
  for (const edge of currentWorkflow.edges) {
    const sourceEl = nodesContainer.querySelector(`[data-node-id="${edge.sourceNodeId}"]`);
    const targetEl = nodesContainer.querySelector(`[data-node-id="${edge.targetNodeId}"]`);

    if (sourceEl && targetEl) {
      const sourceRect = sourceEl.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      const containerRect = canvasContainer.getBoundingClientRect();

      const x1 = sourceRect.right - containerRect.left;
      const y1 = sourceRect.top + sourceRect.height / 2 - containerRect.top;
      const x2 = targetRect.left - containerRect.left;
      const y2 = targetRect.top + targetRect.height / 2 - containerRect.top;

      drawBezierCurve(ctx, x1, y1, x2, y2);
    }
  }

  // Draw connecting line
  if (isConnecting && connectingFromNode && mouseEvent) {
    const sourceEl = nodesContainer.querySelector(`[data-node-id="${connectingFromNode}"]`);
    if (sourceEl) {
      const sourceRect = sourceEl.getBoundingClientRect();
      const containerRect = canvasContainer.getBoundingClientRect();

      const x1 = sourceRect.right - containerRect.left;
      const y1 = sourceRect.top + sourceRect.height / 2 - containerRect.top;
      const x2 = mouseEvent.clientX - containerRect.left;
      const y2 = mouseEvent.clientY - containerRect.top;

      ctx.setLineDash([5, 5]);
      drawBezierCurve(ctx, x1, y1, x2, y2);
      ctx.setLineDash([]);
    }
  }
}

function drawBezierCurve(ctx, x1, y1, x2, y2) {
  const cp1x = x1 + (x2 - x1) / 2;
  const cp2x = x1 + (x2 - x1) / 2;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(cp1x, y1, cp2x, y2, x2, y2);
  ctx.stroke();

  // Draw arrow
  const angle = Math.atan2(y2 - y1, x2 - cp2x);
  const arrowSize = 8;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - arrowSize * Math.cos(angle - Math.PI / 6), y2 - arrowSize * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - arrowSize * Math.cos(angle + Math.PI / 6), y2 - arrowSize * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fillStyle = '#6366f1';
  ctx.fill();
}

// Create edge
async function createEdge(sourceNodeId, targetNodeId) {
  try {
    const response = await fetch(`/api/workflow-designs/${currentWorkflow.id}/edges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceNodeId, targetNodeId })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error?.message || 'Failed to create edge');
      return;
    }

    await loadWorkflow(currentWorkflow.id);
  } catch (error) {
    console.error('Failed to create edge:', error);
  }
}

// Update node position
async function updateNodePosition(nodeId, x, y) {
  try {
    await fetch(`/api/workflow-designs/${currentWorkflow.id}/nodes/${nodeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positionX: x, positionY: y })
    });
  } catch (error) {
    console.error('Failed to update node position:', error);
  }
}

// Save canvas state
async function saveCanvasState() {
  try {
    await fetch(`/api/workflow-designs/${currentWorkflow.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canvasState })
    });
  } catch (error) {
    console.error('Failed to save canvas state:', error);
  }
}

// Show node details
function showNodeDetails(nodeId) {
  const node = currentWorkflow?.nodes.find(n => n.id === nodeId);
  if (!node) return;

  detailsPanel.classList.remove('hidden');
  nodeDetails.classList.remove('hidden');
  workflowDetails.classList.add('hidden');

  document.getElementById('node-label').value = node.label || '';
  document.getElementById('node-scenario').textContent = node.scenarioName;
  document.getElementById('node-status').innerHTML = `<span class="px-2 py-1 rounded-full text-xs text-white status-${node.status} capitalize">${node.status}</span>`;

  const caseLink = document.getElementById('node-case-link');
  if (node.caseId) {
    caseLink.classList.remove('hidden');
    caseLink.querySelector('a').href = `/?caseId=${node.caseId}`;
  } else {
    caseLink.classList.add('hidden');
  }

  document.getElementById('rerun-node-btn').disabled = node.status === 'pending' || node.status === 'ready';

  // Highlight selected node
  nodesContainer.querySelectorAll('.node-card').forEach(el => {
    el.classList.toggle('ring-2', el.dataset.nodeId === nodeId);
    el.classList.toggle('ring-primary', el.dataset.nodeId === nodeId);
  });
}

// Show workflow details
function showWorkflowDetails() {
  if (!currentWorkflow) {
    detailsPanel.classList.add('hidden');
    return;
  }

  detailsPanel.classList.remove('hidden');
  nodeDetails.classList.add('hidden');
  workflowDetails.classList.remove('hidden');

  document.getElementById('workflow-name').value = currentWorkflow.name;
  document.getElementById('workflow-description').value = currentWorkflow.description || '';

  // Remove node selection
  nodesContainer.querySelectorAll('.node-card').forEach(el => {
    el.classList.remove('ring-2', 'ring-primary');
  });
}

// Update node label
async function updateNodeLabel() {
  if (!selectedNode) return;

  const label = document.getElementById('node-label').value;
  try {
    await fetch(`/api/workflow-designs/${currentWorkflow.id}/nodes/${selectedNode}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label })
    });
    await loadWorkflow(currentWorkflow.id);
    showNodeDetails(selectedNode);
  } catch (error) {
    console.error('Failed to update node label:', error);
  }
}

// Delete selected node
async function deleteSelectedNode() {
  if (!selectedNode || !confirm('Delete this node?')) return;

  try {
    await fetch(`/api/workflow-designs/${currentWorkflow.id}/nodes/${selectedNode}`, {
      method: 'DELETE'
    });
    selectedNode = null;
    await loadWorkflow(currentWorkflow.id);
    showWorkflowDetails();
  } catch (error) {
    console.error('Failed to delete node:', error);
  }
}

// Re-run selected node
async function rerunSelectedNode() {
  if (!selectedNode) return;

  try {
    await fetch(`/api/workflow-designs/${currentWorkflow.id}/nodes/${selectedNode}/rerun`, {
      method: 'POST'
    });
    await loadWorkflow(currentWorkflow.id);
    showNodeDetails(selectedNode);
  } catch (error) {
    console.error('Failed to re-run node:', error);
  }
}

// Save workflow details
async function saveWorkflowDetails() {
  if (!currentWorkflow) return;

  const name = document.getElementById('workflow-name').value;
  const description = document.getElementById('workflow-description').value;

  try {
    await fetch(`/api/workflow-designs/${currentWorkflow.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    });
    await loadWorkflow(currentWorkflow.id);
    await loadWorkflows();
    workflowSelector.value = currentWorkflow.id;
  } catch (error) {
    console.error('Failed to save workflow:', error);
  }
}

// Delete workflow
async function deleteWorkflow() {
  if (!currentWorkflow || !confirm('Delete this workflow?')) return;

  try {
    await fetch(`/api/workflow-designs/${currentWorkflow.id}`, {
      method: 'DELETE'
    });
    currentWorkflow = null;
    workflowSelector.value = '';
    await loadWorkflows();
    renderWorkflow();
  } catch (error) {
    console.error('Failed to delete workflow:', error);
  }
}

// Create workflow
async function createWorkflow() {
  const name = document.getElementById('new-workflow-name').value.trim();
  const description = document.getElementById('new-workflow-desc').value.trim();

  if (!name) {
    alert('Please enter a workflow name');
    return;
  }

  try {
    const response = await fetch('/api/workflow-designs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: description || undefined })
    });

    if (!response.ok) throw new Error('Failed to create workflow');

    const workflow = await response.json();
    document.getElementById('new-workflow-modal').classList.add('hidden');

    await loadWorkflows();
    workflowSelector.value = workflow.id;
    await loadWorkflow(workflow.id);
  } catch (error) {
    console.error('Failed to create workflow:', error);
    alert('Failed to create workflow');
  }
}

// Run workflow
async function runWorkflow() {
  if (!currentWorkflow) return;

  try {
    // Start the workflow
    const response = await fetch(`/api/workflow-designs/${currentWorkflow.id}/run`, {
      method: 'POST'
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error?.message || 'Failed to start workflow');
      return;
    }

    await loadWorkflow(currentWorkflow.id);

    // Execute ready nodes and show command
    await executeReadyNodes();
  } catch (error) {
    console.error('Failed to run workflow:', error);
  }
}

// Execute ready nodes and show curl command
async function executeReadyNodes() {
  if (!currentWorkflow) return;

  const readyNodes = currentWorkflow.nodes.filter(n => n.status === 'ready');
  if (readyNodes.length === 0) return;

  // Execute the first ready node
  const node = readyNodes[0];
  try {
    const response = await fetch(`/api/workflow-designs/${currentWorkflow.id}/nodes/${node.id}/execute`, {
      method: 'POST'
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to execute node:', error);
      return;
    }

    const result = await response.json();
    await loadWorkflow(currentWorkflow.id);

    // Show the command bar
    showCommand(result.case.id);
  } catch (error) {
    console.error('Failed to execute node:', error);
  }
}

// Show command bar with curl command
function showCommand(caseId) {
  const commandBar = document.getElementById('command-bar');
  const commandText = document.getElementById('command-text');
  const baseUrl = window.location.origin;

  currentCaseId = caseId;
  commandText.textContent = `curl -X POST ${baseUrl}/api/cases/${caseId}/run`;
  commandBar.classList.remove('hidden');
}

// Hide command bar
function hideCommand() {
  document.getElementById('command-bar').classList.add('hidden');
}

// Copy command to clipboard
function copyCommand() {
  const commandText = document.getElementById('command-text').textContent;
  navigator.clipboard.writeText(commandText).then(() => {
    const btn = document.getElementById('copy-command-btn');
    btn.innerHTML = '<svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>';
    setTimeout(() => {
      btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>';
    }, 2000);
  });
}

// Auto-run the case
let currentCaseId = null;
async function autoRunCase() {
  if (!currentCaseId) return;

  const btn = document.getElementById('run-auto-btn');
  btn.disabled = true;
  btn.textContent = 'Running...';

  try {
    const response = await fetch(`/api/cases/${currentCaseId}/run`, {
      method: 'POST'
    });

    if (response.ok) {
      btn.textContent = 'Complete!';
      btn.classList.remove('bg-green-600', 'hover:bg-green-700');
      btn.classList.add('bg-gray-600');

      // Refresh workflow to update node status
      setTimeout(async () => {
        await loadWorkflow(currentWorkflow.id);
        hideCommand();
      }, 1000);
    } else {
      btn.textContent = 'Failed';
      btn.classList.remove('bg-green-600', 'hover:bg-green-700');
      btn.classList.add('bg-red-600');
    }
  } catch (error) {
    console.error('Failed to auto-run:', error);
    btn.textContent = 'Error';
  }
}

// Continue workflow
async function continueWorkflow() {
  if (!currentWorkflow) return;

  try {
    const response = await fetch(`/api/workflow-designs/${currentWorkflow.id}/continue`, {
      method: 'POST'
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error?.message || 'Failed to continue workflow');
      return;
    }

    await loadWorkflow(currentWorkflow.id);
  } catch (error) {
    console.error('Failed to continue workflow:', error);
  }
}

// Fit to view
function fitToView() {
  if (!currentWorkflow || currentWorkflow.nodes.length === 0) {
    canvasState = { panX: 0, panY: 0, zoom: 1 };
    applyCanvasTransform();
    return;
  }

  const nodes = currentWorkflow.nodes;
  const minX = Math.min(...nodes.map(n => n.positionX));
  const maxX = Math.max(...nodes.map(n => n.positionX + 200));
  const minY = Math.min(...nodes.map(n => n.positionY));
  const maxY = Math.max(...nodes.map(n => n.positionY + 100));

  const width = maxX - minX + 100;
  const height = maxY - minY + 100;
  const containerRect = canvasContainer.getBoundingClientRect();

  const scaleX = containerRect.width / width;
  const scaleY = containerRect.height / height;
  canvasState.zoom = Math.min(scaleX, scaleY, 1);

  canvasState.panX = (containerRect.width - width * canvasState.zoom) / 2 - minX * canvasState.zoom + 50;
  canvasState.panY = (containerRect.height - height * canvasState.zoom) / 2 - minY * canvasState.zoom + 50;

  applyCanvasTransform();
  saveCanvasState();
}

// Update UI
function updateUI() {
  if (!currentWorkflow) return;

  // Status badge
  const statusMap = {
    draft: { text: 'Draft', class: 'status-pending' },
    ready: { text: 'Ready', class: 'status-ready' },
    running: { text: 'Running', class: 'status-running' },
    paused: { text: 'Paused', class: 'status-paused' },
    completed: { text: 'Completed', class: 'status-completed' },
    failed: { text: 'Failed', class: 'status-failed' }
  };
  const status = statusMap[currentWorkflow.status] || statusMap.draft;
  workflowStatus.textContent = status.text;
  workflowStatus.className = `px-2 py-1 rounded-full text-xs text-white ${status.class}`;

  // Node count
  nodeCount.textContent = `${currentWorkflow.nodes.length}/5 nodes`;

  // Play/Continue buttons
  playBtn.classList.toggle('hidden', currentWorkflow.status === 'running' || currentWorkflow.status === 'paused');
  playBtn.disabled = currentWorkflow.nodes.length === 0 || currentWorkflow.status === 'completed';

  continueBtn.classList.toggle('hidden', currentWorkflow.status !== 'paused');
}

// Initialize on load
init();
