import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { initializeDatabase } from '../storage/sqlite.js';
import * as workflowDesignService from './workflowDesignService.js';
import * as storage from '../storage/sqlite.js';

describe('WorkflowDesignService', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initializeDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('createWorkflowDesign', () => {
    it('should create a workflow design with name and description', () => {
      const design = workflowDesignService.createWorkflowDesign(db, {
        name: 'Test Workflow',
        description: 'A test workflow'
      });

      expect(design.id).toBeDefined();
      expect(design.name).toBe('Test Workflow');
      expect(design.description).toBe('A test workflow');
      expect(design.status).toBe('draft');
      expect(design.nodes).toEqual([]);
      expect(design.edges).toEqual([]);
    });

    it('should create a workflow design without description', () => {
      const design = workflowDesignService.createWorkflowDesign(db, {
        name: 'Simple Workflow'
      });

      expect(design.name).toBe('Simple Workflow');
      expect(design.description).toBeNull();
    });
  });

  describe('getWorkflowDesign', () => {
    it('should return null for non-existent workflow', () => {
      const design = workflowDesignService.getWorkflowDesign(db, 'non-existent');
      expect(design).toBeNull();
    });

    it('should return workflow with nodes and edges', () => {
      const created = workflowDesignService.createWorkflowDesign(db, {
        name: 'Test Workflow'
      });

      const design = workflowDesignService.getWorkflowDesign(db, created.id);
      expect(design).not.toBeNull();
      expect(design!.id).toBe(created.id);
      expect(design!.nodes).toEqual([]);
      expect(design!.edges).toEqual([]);
    });
  });

  describe('updateWorkflowDesign', () => {
    it('should update name and description', () => {
      const created = workflowDesignService.createWorkflowDesign(db, {
        name: 'Original Name'
      });

      const updated = workflowDesignService.updateWorkflowDesign(db, created.id, {
        name: 'Updated Name',
        description: 'New description'
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Updated Name');
      expect(updated!.description).toBe('New description');
    });

    it('should update canvas state', () => {
      const created = workflowDesignService.createWorkflowDesign(db, {
        name: 'Test'
      });

      const updated = workflowDesignService.updateWorkflowDesign(db, created.id, {
        canvasState: { panX: 100, panY: 200, zoom: 1.5 }
      });

      expect(updated!.canvasState).toEqual({ panX: 100, panY: 200, zoom: 1.5 });
    });
  });

  describe('deleteWorkflowDesign', () => {
    it('should delete a workflow design', () => {
      const created = workflowDesignService.createWorkflowDesign(db, {
        name: 'To Delete'
      });

      const result = workflowDesignService.deleteWorkflowDesign(db, created.id);
      expect(result).toBe(true);

      const design = workflowDesignService.getWorkflowDesign(db, created.id);
      expect(design).toBeNull();
    });

    it('should cascade delete nodes and edges', () => {
      const created = workflowDesignService.createWorkflowDesign(db, {
        name: 'With Nodes'
      });

      workflowDesignService.addNode(db, created.id, {
        scenarioName: 'test-scenario',
        positionX: 0,
        positionY: 0
      });

      workflowDesignService.deleteWorkflowDesign(db, created.id);

      const nodes = storage.getWorkflowDesignNodes(db, created.id);
      expect(nodes).toEqual([]);
    });
  });

  describe('addNode', () => {
    it('should add a node to workflow', () => {
      const design = workflowDesignService.createWorkflowDesign(db, {
        name: 'Test'
      });

      const node = workflowDesignService.addNode(db, design.id, {
        scenarioName: 'hospital-hydration',
        positionX: 100,
        positionY: 200
      });

      expect(node.id).toBeDefined();
      expect(node.scenarioName).toBe('hospital-hydration');
      expect(node.positionX).toBe(100);
      expect(node.positionY).toBe(200);
      expect(node.status).toBe('pending');
    });

    it('should add a node with label', () => {
      const design = workflowDesignService.createWorkflowDesign(db, {
        name: 'Test'
      });

      const node = workflowDesignService.addNode(db, design.id, {
        scenarioName: 'movie-night',
        label: 'Choose Movie',
        positionX: 0,
        positionY: 0
      });

      expect(node.label).toBe('Choose Movie');
    });

    it('should throw for non-existent workflow', () => {
      expect(() => {
        workflowDesignService.addNode(db, 'non-existent', {
          scenarioName: 'test',
          positionX: 0,
          positionY: 0
        });
      }).toThrow('WORKFLOW_NOT_FOUND');
    });

    it('should enforce max 5 nodes', () => {
      const design = workflowDesignService.createWorkflowDesign(db, {
        name: 'Test'
      });

      for (let i = 0; i < 5; i++) {
        workflowDesignService.addNode(db, design.id, {
          scenarioName: `scenario-${i}`,
          positionX: i * 100,
          positionY: 0
        });
      }

      expect(() => {
        workflowDesignService.addNode(db, design.id, {
          scenarioName: 'one-too-many',
          positionX: 500,
          positionY: 0
        });
      }).toThrow('MAX_NODES_REACHED');
    });
  });

  describe('updateNodePosition', () => {
    it('should update node position', () => {
      const design = workflowDesignService.createWorkflowDesign(db, {
        name: 'Test'
      });

      const node = workflowDesignService.addNode(db, design.id, {
        scenarioName: 'test',
        positionX: 0,
        positionY: 0
      });

      const updated = workflowDesignService.updateNodePosition(db, node.id, 150, 250);
      expect(updated!.positionX).toBe(150);
      expect(updated!.positionY).toBe(250);
    });

    it('should update node label', () => {
      const design = workflowDesignService.createWorkflowDesign(db, {
        name: 'Test'
      });

      const node = workflowDesignService.addNode(db, design.id, {
        scenarioName: 'test',
        positionX: 0,
        positionY: 0
      });

      const updated = workflowDesignService.updateNode(db, node.id, { label: 'New Label' });
      expect(updated!.label).toBe('New Label');
    });
  });

  describe('removeNode', () => {
    it('should remove a node', () => {
      const design = workflowDesignService.createWorkflowDesign(db, {
        name: 'Test'
      });

      const node = workflowDesignService.addNode(db, design.id, {
        scenarioName: 'test',
        positionX: 0,
        positionY: 0
      });

      const result = workflowDesignService.removeNode(db, node.id);
      expect(result).toBe(true);

      const designWithNodes = workflowDesignService.getWorkflowDesign(db, design.id);
      expect(designWithNodes!.nodes).toEqual([]);
    });

    it('should cascade delete connected edges', () => {
      const design = workflowDesignService.createWorkflowDesign(db, {
        name: 'Test'
      });

      const node1 = workflowDesignService.addNode(db, design.id, {
        scenarioName: 'test1',
        positionX: 0,
        positionY: 0
      });

      const node2 = workflowDesignService.addNode(db, design.id, {
        scenarioName: 'test2',
        positionX: 200,
        positionY: 0
      });

      workflowDesignService.addEdge(db, design.id, {
        sourceNodeId: node1.id,
        targetNodeId: node2.id
      });

      workflowDesignService.removeNode(db, node1.id);

      const designWithEdges = workflowDesignService.getWorkflowDesign(db, design.id);
      expect(designWithEdges!.edges).toEqual([]);
    });
  });

  describe('addEdge', () => {
    it('should add an edge between nodes', () => {
      const design = workflowDesignService.createWorkflowDesign(db, {
        name: 'Test'
      });

      const node1 = workflowDesignService.addNode(db, design.id, {
        scenarioName: 'test1',
        positionX: 0,
        positionY: 0
      });

      const node2 = workflowDesignService.addNode(db, design.id, {
        scenarioName: 'test2',
        positionX: 200,
        positionY: 0
      });

      const edge = workflowDesignService.addEdge(db, design.id, {
        sourceNodeId: node1.id,
        targetNodeId: node2.id
      });

      expect(edge.id).toBeDefined();
      expect(edge.sourceNodeId).toBe(node1.id);
      expect(edge.targetNodeId).toBe(node2.id);
    });

    it('should add an edge with document mapping', () => {
      const design = workflowDesignService.createWorkflowDesign(db, {
        name: 'Test'
      });

      const node1 = workflowDesignService.addNode(db, design.id, {
        scenarioName: 'test1',
        positionX: 0,
        positionY: 0
      });

      const node2 = workflowDesignService.addNode(db, design.id, {
        scenarioName: 'test2',
        positionX: 200,
        positionY: 0
      });

      const edge = workflowDesignService.addEdge(db, design.id, {
        sourceNodeId: node1.id,
        targetNodeId: node2.id,
        documentMapping: [
          { source: 'script', target: 'brief' }
        ]
      });

      expect(edge.documentMapping).toEqual([{ source: 'script', target: 'brief' }]);
    });

    it('should throw for self-loop', () => {
      const design = workflowDesignService.createWorkflowDesign(db, {
        name: 'Test'
      });

      const node = workflowDesignService.addNode(db, design.id, {
        scenarioName: 'test',
        positionX: 0,
        positionY: 0
      });

      expect(() => {
        workflowDesignService.addEdge(db, design.id, {
          sourceNodeId: node.id,
          targetNodeId: node.id
        });
      }).toThrow('SELF_LOOP');
    });

    it('should throw for duplicate edge', () => {
      const design = workflowDesignService.createWorkflowDesign(db, {
        name: 'Test'
      });

      const node1 = workflowDesignService.addNode(db, design.id, {
        scenarioName: 'test1',
        positionX: 0,
        positionY: 0
      });

      const node2 = workflowDesignService.addNode(db, design.id, {
        scenarioName: 'test2',
        positionX: 200,
        positionY: 0
      });

      workflowDesignService.addEdge(db, design.id, {
        sourceNodeId: node1.id,
        targetNodeId: node2.id
      });

      expect(() => {
        workflowDesignService.addEdge(db, design.id, {
          sourceNodeId: node1.id,
          targetNodeId: node2.id
        });
      }).toThrow('EDGE_EXISTS');
    });

    it('should throw for nodes from different workflows', () => {
      const design1 = workflowDesignService.createWorkflowDesign(db, {
        name: 'Test1'
      });

      const design2 = workflowDesignService.createWorkflowDesign(db, {
        name: 'Test2'
      });

      const node1 = workflowDesignService.addNode(db, design1.id, {
        scenarioName: 'test1',
        positionX: 0,
        positionY: 0
      });

      const node2 = workflowDesignService.addNode(db, design2.id, {
        scenarioName: 'test2',
        positionX: 0,
        positionY: 0
      });

      expect(() => {
        workflowDesignService.addEdge(db, design1.id, {
          sourceNodeId: node1.id,
          targetNodeId: node2.id
        });
      }).toThrow('NODE_NOT_IN_WORKFLOW');
    });
  });

  describe('removeEdge', () => {
    it('should remove an edge', () => {
      const design = workflowDesignService.createWorkflowDesign(db, {
        name: 'Test'
      });

      const node1 = workflowDesignService.addNode(db, design.id, {
        scenarioName: 'test1',
        positionX: 0,
        positionY: 0
      });

      const node2 = workflowDesignService.addNode(db, design.id, {
        scenarioName: 'test2',
        positionX: 200,
        positionY: 0
      });

      const edge = workflowDesignService.addEdge(db, design.id, {
        sourceNodeId: node1.id,
        targetNodeId: node2.id
      });

      const result = workflowDesignService.removeEdge(db, edge.id);
      expect(result).toBe(true);

      const designWithEdges = workflowDesignService.getWorkflowDesign(db, design.id);
      expect(designWithEdges!.edges).toEqual([]);
    });
  });

  describe('getEntryNodes', () => {
    it('should return nodes with no incoming edges', () => {
      const design = workflowDesignService.createWorkflowDesign(db, {
        name: 'Test'
      });

      const node1 = workflowDesignService.addNode(db, design.id, {
        scenarioName: 'test1',
        positionX: 0,
        positionY: 0
      });

      const node2 = workflowDesignService.addNode(db, design.id, {
        scenarioName: 'test2',
        positionX: 200,
        positionY: 0
      });

      workflowDesignService.addEdge(db, design.id, {
        sourceNodeId: node1.id,
        targetNodeId: node2.id
      });

      const entryNodes = workflowDesignService.getEntryNodes(db, design.id);
      expect(entryNodes).toHaveLength(1);
      expect(entryNodes[0].id).toBe(node1.id);
    });

    it('should return multiple entry nodes for branching', () => {
      const design = workflowDesignService.createWorkflowDesign(db, {
        name: 'Test'
      });

      workflowDesignService.addNode(db, design.id, {
        scenarioName: 'test1',
        positionX: 0,
        positionY: 0
      });

      workflowDesignService.addNode(db, design.id, {
        scenarioName: 'test2',
        positionX: 0,
        positionY: 100
      });

      const entryNodes = workflowDesignService.getEntryNodes(db, design.id);
      expect(entryNodes).toHaveLength(2);
    });
  });

  describe('workflow status transitions', () => {
    it('should transition from draft to ready when workflow is valid', () => {
      const design = workflowDesignService.createWorkflowDesign(db, {
        name: 'Test'
      });

      workflowDesignService.addNode(db, design.id, {
        scenarioName: 'test',
        positionX: 0,
        positionY: 0
      });

      const ready = workflowDesignService.markReady(db, design.id);
      expect(ready!.status).toBe('ready');
    });

    it('should throw when marking empty workflow as ready', () => {
      const design = workflowDesignService.createWorkflowDesign(db, {
        name: 'Test'
      });

      expect(() => {
        workflowDesignService.markReady(db, design.id);
      }).toThrow('WORKFLOW_EMPTY');
    });
  });

  describe('getAllWorkflowDesigns', () => {
    it('should return all workflow designs', () => {
      workflowDesignService.createWorkflowDesign(db, { name: 'Workflow 1' });
      workflowDesignService.createWorkflowDesign(db, { name: 'Workflow 2' });

      const designs = workflowDesignService.getAllWorkflowDesigns(db);
      expect(designs).toHaveLength(2);
    });

    it('should return designs ordered by updated_at descending', () => {
      const design1 = workflowDesignService.createWorkflowDesign(db, { name: 'Workflow 1' });
      workflowDesignService.createWorkflowDesign(db, { name: 'Workflow 2' });

      // Update design1 to make it more recent
      workflowDesignService.updateWorkflowDesign(db, design1.id, { name: 'Updated 1' });

      const designs = workflowDesignService.getAllWorkflowDesigns(db);
      expect(designs[0].name).toBe('Updated 1');
    });
  });
});
