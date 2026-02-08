import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import * as storage from '../storage/sqlite.js';
import type {
  WorkflowDesign,
  WorkflowDesignWithRelations,
  WorkflowNode,
  WorkflowEdge,
  WorkflowDesignStatus,
  WorkflowNodeStatus,
  CanvasState,
  DocumentMapping,
  CreateWorkflowDesignRequest,
  UpdateWorkflowDesignRequest,
  CreateWorkflowNodeRequest,
  UpdateWorkflowNodeRequest,
  CreateWorkflowEdgeRequest,
  WorkflowExecutionStatus
} from '../types/index.js';

const MAX_NODES = 5;

/**
 * Create a new workflow design
 */
export function createWorkflowDesign(
  db: Database.Database,
  request: CreateWorkflowDesignRequest
): WorkflowDesignWithRelations {
  const id = `wfd-${uuidv4().slice(0, 8)}`;
  const design = storage.createWorkflowDesign(
    db,
    id,
    request.name,
    request.description || null
  );

  return {
    ...design,
    nodes: [],
    edges: []
  };
}

/**
 * Get a workflow design with all nodes and edges
 */
export function getWorkflowDesign(
  db: Database.Database,
  workflowDesignId: string
): WorkflowDesignWithRelations | null {
  return storage.getWorkflowDesignWithRelations(db, workflowDesignId);
}

/**
 * Get all workflow designs
 */
export function getAllWorkflowDesigns(
  db: Database.Database
): WorkflowDesign[] {
  return storage.getAllWorkflowDesigns(db);
}

/**
 * Update a workflow design
 */
export function updateWorkflowDesign(
  db: Database.Database,
  workflowDesignId: string,
  request: UpdateWorkflowDesignRequest
): WorkflowDesignWithRelations | null {
  const design = storage.getWorkflowDesign(db, workflowDesignId);
  if (!design) return null;

  storage.updateWorkflowDesign(db, workflowDesignId, {
    name: request.name,
    description: request.description,
    canvasState: request.canvasState
  });

  return storage.getWorkflowDesignWithRelations(db, workflowDesignId);
}

/**
 * Delete a workflow design (cascades to nodes and edges)
 */
export function deleteWorkflowDesign(
  db: Database.Database,
  workflowDesignId: string
): boolean {
  return storage.deleteWorkflowDesign(db, workflowDesignId);
}

/**
 * Add a node to a workflow design
 */
export function addNode(
  db: Database.Database,
  workflowDesignId: string,
  request: CreateWorkflowNodeRequest
): WorkflowNode {
  const design = storage.getWorkflowDesign(db, workflowDesignId);
  if (!design) {
    throw new Error('WORKFLOW_NOT_FOUND');
  }

  const existingNodes = storage.getWorkflowDesignNodes(db, workflowDesignId);
  if (existingNodes.length >= MAX_NODES) {
    throw new Error('MAX_NODES_REACHED');
  }

  const nodeId = `wfn-${uuidv4().slice(0, 8)}`;
  return storage.createWorkflowDesignNode(
    db,
    nodeId,
    workflowDesignId,
    request.scenarioName,
    request.positionX,
    request.positionY,
    request.label || null
  );
}

/**
 * Update a node's position
 */
export function updateNodePosition(
  db: Database.Database,
  nodeId: string,
  positionX: number,
  positionY: number
): WorkflowNode | null {
  return storage.updateWorkflowDesignNode(db, nodeId, {
    positionX,
    positionY
  });
}

/**
 * Update a node's properties
 */
export function updateNode(
  db: Database.Database,
  nodeId: string,
  request: UpdateWorkflowNodeRequest
): WorkflowNode | null {
  return storage.updateWorkflowDesignNode(db, nodeId, {
    label: request.label,
    positionX: request.positionX,
    positionY: request.positionY
  });
}

/**
 * Remove a node from a workflow (cascades to connected edges)
 */
export function removeNode(
  db: Database.Database,
  nodeId: string
): boolean {
  return storage.deleteWorkflowDesignNode(db, nodeId);
}

/**
 * Add an edge between two nodes
 */
export function addEdge(
  db: Database.Database,
  workflowDesignId: string,
  request: CreateWorkflowEdgeRequest
): WorkflowEdge {
  const design = storage.getWorkflowDesign(db, workflowDesignId);
  if (!design) {
    throw new Error('WORKFLOW_NOT_FOUND');
  }

  // Validate nodes exist and belong to this workflow
  const sourceNode = storage.getWorkflowDesignNode(db, request.sourceNodeId);
  const targetNode = storage.getWorkflowDesignNode(db, request.targetNodeId);

  if (!sourceNode || sourceNode.workflowDesignId !== workflowDesignId) {
    throw new Error('NODE_NOT_IN_WORKFLOW');
  }
  if (!targetNode || targetNode.workflowDesignId !== workflowDesignId) {
    throw new Error('NODE_NOT_IN_WORKFLOW');
  }

  // Check for self-loop
  if (request.sourceNodeId === request.targetNodeId) {
    throw new Error('SELF_LOOP');
  }

  // Check for duplicate edge
  const existingEdges = storage.getWorkflowDesignEdges(db, workflowDesignId);
  const isDuplicate = existingEdges.some(
    e => e.sourceNodeId === request.sourceNodeId && e.targetNodeId === request.targetNodeId
  );
  if (isDuplicate) {
    throw new Error('EDGE_EXISTS');
  }

  const edgeId = `wfe-${uuidv4().slice(0, 8)}`;
  return storage.createWorkflowDesignEdge(
    db,
    edgeId,
    workflowDesignId,
    request.sourceNodeId,
    request.targetNodeId,
    request.documentMapping || null
  );
}

/**
 * Remove an edge
 */
export function removeEdge(
  db: Database.Database,
  edgeId: string
): boolean {
  return storage.deleteWorkflowDesignEdge(db, edgeId);
}

/**
 * Get entry nodes (nodes with no incoming edges)
 */
export function getEntryNodes(
  db: Database.Database,
  workflowDesignId: string
): WorkflowNode[] {
  return storage.getEntryNodes(db, workflowDesignId);
}

/**
 * Get nodes that are ready to run (all upstream completed)
 */
export function getReadyNodes(
  db: Database.Database,
  workflowDesignId: string
): WorkflowNode[] {
  return storage.getReadyNodes(db, workflowDesignId);
}

/**
 * Mark a workflow as ready to run
 */
export function markReady(
  db: Database.Database,
  workflowDesignId: string
): WorkflowDesignWithRelations | null {
  const design = storage.getWorkflowDesignWithRelations(db, workflowDesignId);
  if (!design) return null;

  if (design.nodes.length === 0) {
    throw new Error('WORKFLOW_EMPTY');
  }

  storage.updateWorkflowDesign(db, workflowDesignId, {
    status: 'ready'
  });

  return storage.getWorkflowDesignWithRelations(db, workflowDesignId);
}

/**
 * Get workflow execution status
 */
export function getExecutionStatus(
  db: Database.Database,
  workflowDesignId: string
): WorkflowExecutionStatus | null {
  const design = storage.getWorkflowDesignWithRelations(db, workflowDesignId);
  if (!design) return null;

  const completedNodes = design.nodes.filter(n => n.status === 'completed').map(n => n.id);
  const failedNodes = design.nodes.filter(n => n.status === 'failed').map(n => n.id);
  const pendingNodes = design.nodes.filter(n => n.status === 'pending').map(n => n.id);
  const runningNode = design.nodes.find(n => n.status === 'running');

  return {
    workflowId: workflowDesignId,
    status: design.status,
    currentNodeId: runningNode?.id || null,
    completedNodes,
    failedNodes,
    pendingNodes
  };
}

/**
 * Start running a workflow
 */
export function startWorkflow(
  db: Database.Database,
  workflowDesignId: string
): WorkflowDesignWithRelations | null {
  const design = storage.getWorkflowDesignWithRelations(db, workflowDesignId);
  if (!design) return null;

  if (design.status !== 'ready' && design.status !== 'draft') {
    throw new Error('WORKFLOW_NOT_READY');
  }

  if (design.nodes.length === 0) {
    throw new Error('WORKFLOW_EMPTY');
  }

  // Set workflow to running
  storage.updateWorkflowDesign(db, workflowDesignId, {
    status: 'running'
  });

  // Set entry nodes to ready
  const entryNodes = storage.getEntryNodes(db, workflowDesignId);
  for (const node of entryNodes) {
    storage.updateWorkflowDesignNode(db, node.id, {
      status: 'ready'
    });
  }

  return storage.getWorkflowDesignWithRelations(db, workflowDesignId);
}

/**
 * Mark a node as running
 */
export function setNodeRunning(
  db: Database.Database,
  nodeId: string,
  caseId: string
): WorkflowNode | null {
  return storage.updateWorkflowDesignNode(db, nodeId, {
    status: 'running',
    caseId
  });
}

/**
 * Mark a node as completed and pause the workflow
 */
export function completeNode(
  db: Database.Database,
  nodeId: string
): { node: WorkflowNode | null; workflowPaused: boolean } {
  const node = storage.getWorkflowDesignNode(db, nodeId);
  if (!node) return { node: null, workflowPaused: false };

  // Mark node as completed
  const updated = storage.updateWorkflowDesignNode(db, nodeId, {
    status: 'completed'
  });

  // Check if all nodes are completed
  const design = storage.getWorkflowDesignWithRelations(db, node.workflowDesignId);
  if (!design) return { node: updated, workflowPaused: false };

  const allCompleted = design.nodes.every(n => n.status === 'completed' || n.id === nodeId);

  if (allCompleted) {
    storage.updateWorkflowDesign(db, node.workflowDesignId, {
      status: 'completed'
    });
    return { node: updated, workflowPaused: false };
  }

  // Pause the workflow for review
  storage.updateWorkflowDesign(db, node.workflowDesignId, {
    status: 'paused'
  });

  return { node: updated, workflowPaused: true };
}

/**
 * Mark a node as failed
 */
export function failNode(
  db: Database.Database,
  nodeId: string
): WorkflowNode | null {
  const node = storage.getWorkflowDesignNode(db, nodeId);
  if (!node) return null;

  storage.updateWorkflowDesignNode(db, nodeId, {
    status: 'failed'
  });

  // Mark workflow as failed
  storage.updateWorkflowDesign(db, node.workflowDesignId, {
    status: 'failed'
  });

  return storage.getWorkflowDesignNode(db, nodeId);
}

/**
 * Continue a paused workflow
 */
export function continueWorkflow(
  db: Database.Database,
  workflowDesignId: string
): WorkflowDesignWithRelations | null {
  const design = storage.getWorkflowDesignWithRelations(db, workflowDesignId);
  if (!design) return null;

  if (design.status !== 'paused') {
    throw new Error('WORKFLOW_NOT_PAUSED');
  }

  // Find nodes that are ready to run
  const readyNodes = storage.getReadyNodes(db, workflowDesignId);

  if (readyNodes.length === 0) {
    // All nodes completed
    storage.updateWorkflowDesign(db, workflowDesignId, {
      status: 'completed'
    });
  } else {
    // Set workflow to running and mark ready nodes
    storage.updateWorkflowDesign(db, workflowDesignId, {
      status: 'running'
    });

    for (const node of readyNodes) {
      storage.updateWorkflowDesignNode(db, node.id, {
        status: 'ready'
      });
    }
  }

  return storage.getWorkflowDesignWithRelations(db, workflowDesignId);
}

/**
 * Reset entire workflow for re-running (all nodes back to pending, workflow to draft)
 */
export function resetWorkflow(
  db: Database.Database,
  workflowDesignId: string
): WorkflowDesignWithRelations | null {
  const design = storage.getWorkflowDesignWithRelations(db, workflowDesignId);
  if (!design) return null;

  // Reset all nodes to pending, clear case links
  for (const node of design.nodes) {
    storage.updateWorkflowDesignNode(db, node.id, {
      status: 'pending',
      caseId: null
    });
  }

  // Reset workflow to draft
  storage.updateWorkflowDesign(db, workflowDesignId, {
    status: 'draft'
  });

  return storage.getWorkflowDesignWithRelations(db, workflowDesignId);
}

/**
 * Reset a node for re-running
 */
export function resetNode(
  db: Database.Database,
  nodeId: string
): WorkflowNode | null {
  const node = storage.getWorkflowDesignNode(db, nodeId);
  if (!node) return null;

  return storage.updateWorkflowDesignNode(db, nodeId, {
    status: 'pending',
    caseId: null
  });
}

/**
 * Get upstream nodes (nodes that connect to this one)
 */
export function getUpstreamNodes(
  db: Database.Database,
  nodeId: string
): WorkflowNode[] {
  const edges = storage.getEdgesToNode(db, nodeId);
  const nodes: WorkflowNode[] = [];

  for (const edge of edges) {
    const node = storage.getWorkflowDesignNode(db, edge.sourceNodeId);
    if (node) nodes.push(node);
  }

  return nodes;
}

/**
 * Get downstream nodes (nodes that this one connects to)
 */
export function getDownstreamNodes(
  db: Database.Database,
  nodeId: string
): WorkflowNode[] {
  const edges = storage.getEdgesFromNode(db, nodeId);
  const nodes: WorkflowNode[] = [];

  for (const edge of edges) {
    const node = storage.getWorkflowDesignNode(db, edge.targetNodeId);
    if (node) nodes.push(node);
  }

  return nodes;
}

/**
 * Get document mapping for an edge
 */
export function getDocumentMapping(
  db: Database.Database,
  sourceNodeId: string,
  targetNodeId: string
): DocumentMapping[] | null {
  const node = storage.getWorkflowDesignNode(db, sourceNodeId);
  if (!node) return null;

  const edges = storage.getEdgesFromNode(db, sourceNodeId);
  const edge = edges.find(e => e.targetNodeId === targetNodeId);

  return edge?.documentMapping || null;
}
