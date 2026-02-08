import { Router, Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as caseService from '../services/caseService.js';
import * as companyService from '../services/companyService.js';
import * as agentService from '../services/agentService.js';
import * as workflowDesignService from '../services/workflowDesignService.js';

// ES module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import * as taskService from '../services/taskService.js';
import * as storage from '../storage/sqlite.js';
import type {
  CreateCaseRequest,
  SubmitResponseRequest,
  ResolveCaseRequest,
  BossMessageRequest,
  CreateInputDocumentRequest,
  CreateWorkingDocumentRequest,
  UpdateWorkingDocumentRequest,
  PatchWorkingDocumentRequest,
  SetTaskOutputRequest,
  CreateImageRequest,
  UpdateImageRequest,
  ImageGeneration
} from '../types/index.js';
import * as svgService from '../services/svgService.js';
import {
  validateSetupRequest,
  validateSubmitRequest,
  validateCompanySetupRequest,
  buildValidationErrorResponse,
  type SetupRequest,
  type SubmitRequest
} from './validation.js';
import type {
  CreateCompanyRequest,
  UpdateCompanyRequest,
  CreateBuildingRequest,
  CreateRoomRequest,
  CreatePolicyRequest,
  CreateEmployeeRequest,
  AssociateCaseCompanyRequest,
  CreateCaseAgentRoleRequest,
  CompanySetupRequest,
  CreateAgentProfileRequest,
  CreateWorkflowRequest,
  StartWorkflowRequest,
  CreateGoalRequest,
  WorkflowStageType
} from '../types/index.js';

export function createRouter(db: Database.Database): Router {
  const router = Router();

  // Request logging middleware
  router.use((req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const logId = `log-${uuidv4().slice(0, 8)}`;

    // Extract case ID from path if present
    const caseIdMatch = req.path.match(/\/cases\/([^/]+)/);
    const caseId = caseIdMatch ? caseIdMatch[1] : null;

    // Capture original end
    const originalEnd = res.end.bind(res);
    res.end = function (chunk?: any, encoding?: any, callback?: any): Response {
      const duration = Date.now() - startTime;
      const bodySnippet = req.body ? JSON.stringify(req.body).slice(0, 200) : null;
      const queryParams = Object.keys(req.query).length > 0 ? new URLSearchParams(req.query as any).toString() : null;

      storage.addRequestLog(
        db,
        logId,
        req.method,
        req.path,
        queryParams,
        bodySnippet,
        res.statusCode,
        duration,
        caseId
      );

      return originalEnd(chunk, encoding, callback);
    };

    next();
  });

  // GET / - API welcome and discovery endpoint
  router.get('/', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Admin']
      #swagger.summary = 'API welcome and discovery'
      #swagger.description = 'Returns API overview, active cases, and available endpoints.'
      #swagger.responses[200] = {
        description: 'API welcome message with active cases list',
        content: { 'text/plain': { schema: { type: 'string' } } }
      }
    */
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    try {
      const cases = caseService.getAllCases(db);
      const activeCases = cases.filter(c => c.status === 'active');

      let response = `
STATELOOP API
=============

Welcome! This is a stateless agent orchestration system for multi-agent negotiations.

`;

      if (activeCases.length > 0) {
        response += `ACTIVE CASES\n------------\n`;
        activeCases.forEach(c => {
          const caseData = caseService.getCase(db, c.id);
          if (caseData) {
            const participants = caseData.participants.map(p => `${p.name} (${p.id})`).join(', ');
            response += `\n${c.id}:\n`;
            response += `  Participants: ${participants}\n`;
            response += `  Current turn: ${c.currentTurn}\n`;
            response += `  Messages: ${caseData.messages.length}\n`;
            response += `  Get instructions: ${baseUrl}/api/cases/${c.id}/agent-prompt?agentId=<AGENT_ID>\n`;
          }
        });
        response += `\n`;
      } else {
        response += `No active cases. Create one using the UI at ${baseUrl}/ or POST to /api/cases\n\n`;
      }

      response += `
HOW TO PARTICIPATE AS AN AGENT
------------------------------

1. Get your instructions:
   curl "${baseUrl}/api/cases/<CASE_ID>/agent-prompt?agentId=<YOUR_AGENT_ID>"

2. Follow the instructions in the response to submit your move.

3. Repeat until the negotiation is resolved!


API ENDPOINTS
-------------
GET  /api/cases                         - List all cases
POST /api/cases                         - Create a new case
GET  /api/cases/:id                     - Get case details (JSON)
GET  /api/cases/:id/history             - Get conversation history for playback
POST /api/cases/:id/run                 - Pre-run case to completion (simulation)
GET  /api/cases/:id/agent-prompt        - Get agent instructions (plain text)
GET  /api/cases/:id/next-task           - Get task for agent (JSON)
POST /api/cases/:id/submit              - Submit agent response
POST /api/cases/:id/resolve             - Manually resolve case
POST /api/cases/:id/boss-message        - Send message to agents
GET  /api/logs                          - View request logs

WEB UI: ${baseUrl}/
DOCS:   ${baseUrl}/docs
`;

      res.type('text/plain').send(response.trim());
    } catch (error: any) {
      res.status(500).type('text/plain').send(`ERROR: ${error.message}`);
    }
  });

  // POST /cases - Create new case
  router.post('/cases', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Cases']
      #swagger.summary = 'Create a new case'
      #swagger.description = 'Creates a new negotiation case from a scenario description. The scenario text describes the situation, participants, and options. After creation, call `/api/cases/{id}/setup` to initialize agents and options via AI.'
      #swagger.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateCaseRequest' }
          }
        }
      }
      #swagger.responses[201] = {
        description: 'Case created successfully',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Case' } } }
      }
      #swagger.responses[400] = {
        description: 'Invalid request - missing required fields',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
      }
    */
    try {
      const request: CreateCaseRequest = req.body;

      if (!request.scenario || !request.participants) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'Missing required fields: scenario, participants' }
        });
        return;
      }

      // Participants can be empty - AI will create them during setup phase
      // if (request.participants.length < 2) {
      //   res.status(400).json({
      //     error: { code: 'INVALID_REQUEST', message: 'At least 2 participants required' }
      //   });
      //   return;
      // }

      const newCase = caseService.createCase(db, request);

      // The first participant (Judge if present) will be set as currentTurn
      // They need to run the auto-play endpoint to make their move
      res.status(201).json(newCase);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /cases - List all cases
  router.get('/cases', (_req: Request, res: Response) => {
    /*
      #swagger.tags = ['Cases']
      #swagger.summary = 'List all cases'
      #swagger.description = 'Returns all negotiation cases in the system. Each case includes its current status, participants, and outcome if resolved.'
      #swagger.responses[200] = {
        description: 'Array of all cases',
        content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Case' } } } }
      }
    */
    try {
      const cases = caseService.getAllCases(db);
      res.json(cases);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /cases/:id - Get case details
  router.get('/cases/:id', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Cases']
      #swagger.summary = 'Get case details'
      #swagger.description = 'Returns full details of a specific case including scenario, participants, options, message history, and resolution status.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.responses[200] = {
        description: 'Full case details',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Case' } } }
      }
      #swagger.responses[404] = { description: 'Case not found' }
    */
    try {
      const caseData = caseService.getCase(db, req.params.id);

      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case with ID '${req.params.id}' not found` }
        });
        return;
      }

      res.json(caseData);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /cases/:id/history - Get full conversation history for playback
  router.get('/cases/:id/history', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Cases']
      #swagger.summary = 'Get conversation history for playback'
      #swagger.description = 'Returns the complete conversation history optimized for UI playback. Includes message sequence, speaker information, and timing data.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.responses[200] = { description: 'Complete conversation timeline' }
      #swagger.responses[404] = { description: 'Case not found' }
    */
    try {
      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case with ID '${req.params.id}' not found` }
        });
        return;
      }

      // Build a playback-friendly history
      const history = {
        caseId: caseData.id,
        scenario: caseData.scenario,
        status: caseData.status,
        outcome: caseData.outcome,
        selectedOption: caseData.options.find((o: { id: string }) => o.id === caseData.selectedOptionId) || null,
        participants: caseData.participants.map(p => ({
          id: p.id,
          name: p.name,
          appearance: typeof p.preferences === 'object' ? p.preferences : null
        })),
        options: caseData.options,
        timeline: caseData.messages.map((m, index) => {
          const participant = caseData.participants.find(p => p.id === m.author);
          return {
            index,
            messageId: m.id,
            speaker: participant?.name || 'Unknown',
            speakerId: m.author,
            type: m.type,
            content: m.content,
            optionId: m.optionId,
            timestamp: m.timestamp
          };
        }),
        totalMessages: caseData.messages.length,
        createdAt: caseData.createdAt,
        resolvedAt: caseData.resolvedAt
      };

      res.json(history);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /cases/:id/next-task - Get work for agent
  router.get('/cases/:id/next-task', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Agent Actions']
      #swagger.summary = 'Get next task for polling'
      #swagger.description = 'Returns the next available task if one exists. Used by automated systems to poll for work. Prefer `/auto-play` for LLM-driven workflows. Returns 204 No Content if no task is available.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.parameters['agentId'] = { in: 'query', description: 'Agent ID to get task for', required: true }
      #swagger.responses[200] = { description: 'Task available with agent context' }
      #swagger.responses[204] = { description: 'No task available' }
      #swagger.responses[400] = { description: 'Missing or invalid agentId' }
      #swagger.responses[404] = { description: 'Case not found' }
    */
    try {
      const agentId = req.query.agentId as string;

      if (!agentId) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'agentId query parameter required' }
        });
        return;
      }

      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case with ID '${req.params.id}' not found` }
        });
        return;
      }

      // Check if agent is a participant
      const isParticipant = caseData.participants.some(p => p.id === agentId);
      if (!isParticipant) {
        res.status(400).json({
          error: { code: 'INVALID_AGENT', message: `Agent '${agentId}' is not a participant in this case` }
        });
        return;
      }

      const task = taskService.getNextTask(db, req.params.id, agentId);

      if (!task) {
        // Not their turn or case resolved
        res.status(204).send();
        return;
      }

      res.json(task);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // Helper: Build agent prompt for current turn
  function buildAgentPrompt(caseId: string, baseUrl: string): string | null {
    const caseData = caseService.getCase(db, caseId);
    if (!caseData || caseData.status !== 'active') return null;

    const currentAgent = caseData.participants.find(p => p.id === caseData.currentTurn);
    if (!currentAgent) return null;

    const task = taskService.getNextTask(db, caseId, currentAgent.id);
    if (!task) return null;

    const agentAgenda = extractAgentAgenda(caseData.scenario, currentAgent.name);
    const publicInfo = extractPublicInfo(caseData.scenario);

    const conversationHistory = caseData.messages.map(m => {
      const author = caseData.participants.find(p => p.id === m.author);
      return `[${author?.name || m.author}] (${m.type}): ${m.content}`;
    }).join('\n');

    const optionsList = caseData.options.map(r =>
      `- ${r.id}: ${r.name} (${r.category}, ${r.priceRange}) - ${r.features.join(', ')}`
    ).join('\n');

    const agentNamesFromScenario = extractAgentNames(caseData.scenario);
    const otherNames = agentNamesFromScenario.length > 0
      ? agentNamesFromScenario.filter(name => name !== currentAgent.name).join(', ')
      : caseData.participants.filter(p => p.id !== currentAgent.id).map(p => p.name).join(', ');

    const agentHasSpokenBefore = caseData.messages.some(m => m.author === currentAgent.id);
    const isVeryFirstMessage = caseData.messages.length === 0;

    let firstMessageInstruction = '';
    if (isVeryFirstMessage) {
      firstMessageInstruction = `OPENING THE DISCUSSION: You're starting this conversation. Briefly introduce the topic and your initial position. Set the stage for the negotiation (2-3 sentences).`;
    } else if (!agentHasSpokenBefore) {
      firstMessageInstruction = `FIRST RESPONSE: Briefly acknowledge the discussion (one short sentence) then make your point. Don't repeat what's been said.`;
    }

    // Build document sections
    let inputDocumentsSection = '';
    if (task.inputDocuments && task.inputDocuments.length > 0) {
      const docList = task.inputDocuments.map(d => {
        // Truncate very long content for the prompt with a summary
        const content = d.content.length > 2000
          ? d.content.substring(0, 2000) + `\n... [truncated - GET ${baseUrl}/api/cases/${caseId}/documents/${encodeURIComponent(d.name)} for full content]`
          : d.content;
        return `--- ${d.name} ---\n${content}`;
      }).join('\n\n');
      inputDocumentsSection = `INPUT DOCUMENTS (reference materials - read only):\n${docList}\n`;
    }

    let workingDocumentsSection = '';
    if (task.workingDocuments && task.workingDocuments.length > 0) {
      const docList = task.workingDocuments.map(d => {
        const editedBy = d.lastEditedBy ? ` (last edited by: ${d.lastEditedBy})` : ' (not yet edited)';
        const content = d.content.length > 2000
          ? d.content.substring(0, 2000) + `\n... [truncated - GET ${baseUrl}/api/cases/${caseId}/documents/${encodeURIComponent(d.name)} for full content]`
          : d.content || '(empty)';
        return `--- ${d.name}${editedBy} ---\n${content}`;
      }).join('\n\n');
      workingDocumentsSection = `WORKING DOCUMENTS (collaborative - you can update these):\n${docList}\n`;
    }

    // Build document update instructions if there are working documents
    let documentUpdateInstructions = '';
    if (task.workingDocuments && task.workingDocuments.length > 0) {
      const docNames = task.workingDocuments.map(d => d.name);
      documentUpdateInstructions = `

DOCUMENT API REFERENCE:
- GET  ${baseUrl}/api/cases/${caseId}/documents/{name}         - Get full document content
- GET  ${baseUrl}/api/cases/${caseId}/documents/{name}/history - Get document edit history
- PUT  ${baseUrl}/api/cases/${caseId}/documents/{name}         - Replace entire document (alternative to documentUpdates)

UPDATING DOCUMENTS:
Include a "documentUpdates" array in your response to modify working documents.

Each update requires:
- "document": Name of the working document (must match exactly: ${docNames.map(n => `"${n}"`).join(', ')})
- "action": One of: append, prepend, replace, replace_section
- "content": The text to add/replace
- "section": Required for replace_section (literal text OR markdown header name)

ACTION REFERENCE:
- append: Add content to END of document
- prepend: Add content to BEGINNING of document
- replace: Replace ENTIRE document (use for full file updates)
- replace_section: Replace specific section (matches literal text OR markdown headers like "## Section Name")

EXAMPLES:
// Append to end
{"document": "${docNames[0]}", "action": "append", "content": "// New code here"}

// Replace entire file (RECOMMENDED for code files)
{"document": "${docNames[0]}", "action": "replace", "content": "<!DOCTYPE html>...full content..."}

// Replace a markdown section
{"document": "${docNames[0]}", "action": "replace_section", "section": "Summary", "content": "New summary text"}

IMPORTANT:
- For code files, prefer "replace" action with full file content to avoid corruption
- If content shows "[truncated]", fetch full document via GET endpoint above
- replace_section returns document unchanged if section not found (check your section names)`;
    }

    // Build company context if case is associated with a company
    const companyContext = companyService.buildCompanyContextForPrompt(db, caseId, currentAgent.name);

    // Build persona section from participant fields and profile
    let personaSection = '';

    // First check if agent has a detailed profile
    const characterDescription = agentService.generateCharacterDescription(db, currentAgent.name);
    if (characterDescription) {
      personaSection = `${characterDescription}\n\n`;
    }

    // Add any additional participant-specific fields
    const hasPersonaFields = currentAgent.background || currentAgent.origin || currentAgent.speech;
    const hasTraits = currentAgent.personality || currentAgent.intelligence ||
                      currentAgent.patience !== undefined || currentAgent.confidence !== undefined ||
                      currentAgent.empathy !== undefined || currentAgent.assertiveness !== undefined;

    if (hasPersonaFields || hasTraits) {
      const personaParts = [];

      // Persona attributes
      if (currentAgent.background) personaParts.push(`BACKGROUND: ${currentAgent.background}`);
      if (currentAgent.origin) personaParts.push(`ORIGIN: ${currentAgent.origin}`);
      if (currentAgent.speech) personaParts.push(`SPEECH STYLE: ${currentAgent.speech}`);

      // Personality and traits
      if (currentAgent.personality) personaParts.push(`PERSONALITY: ${currentAgent.personality}`);

      // Build trait scores section
      const traitParts = [];
      if (currentAgent.intelligence) traitParts.push(`Intelligence: ${currentAgent.intelligence}`);
      if (currentAgent.patience !== undefined) traitParts.push(`Patience: ${currentAgent.patience}/100`);
      if (currentAgent.confidence !== undefined) traitParts.push(`Confidence: ${currentAgent.confidence}/100`);
      if (currentAgent.empathy !== undefined) traitParts.push(`Empathy: ${currentAgent.empathy}/100`);
      if (currentAgent.assertiveness !== undefined) traitParts.push(`Assertiveness: ${currentAgent.assertiveness}/100`);
      if (currentAgent.honesty !== undefined) traitParts.push(`Honesty: ${currentAgent.honesty}/100`);
      if (currentAgent.trust !== undefined) traitParts.push(`Trust: ${currentAgent.trust}/100`);
      if (currentAgent.stressTolerance !== undefined) traitParts.push(`Stress tolerance: ${currentAgent.stressTolerance}/100`);
      if (currentAgent.energy !== undefined) traitParts.push(`Energy: ${currentAgent.energy}/100`);

      if (traitParts.length > 0) {
        personaParts.push(`TRAITS: ${traitParts.join(', ')}`);
      }

      // Behavioral modifiers
      if (currentAgent.humor) personaParts.push(`HUMOR: ${currentAgent.humor}`);
      if (currentAgent.mood) personaParts.push(`CURRENT MOOD: ${currentAgent.mood}`);
      if (currentAgent.quirks) personaParts.push(`QUIRKS: ${currentAgent.quirks}`);
      if (currentAgent.triggers) personaParts.push(`TRIGGERS: ${currentAgent.triggers}`);

      personaSection += personaParts.join('\n') + '\n';
    }

    // Build boss messages section (messages from facilitator/user)
    let bossMessagesSection = '';
    if (caseData.bossMessages && caseData.bossMessages.length > 0) {
      const relevantMessages = caseData.bossMessages
        .filter(m => !m.targetAgent || m.targetAgent === currentAgent.id)
        .map(m => `  - ${m.content}`)
        .join('\n');
      if (relevantMessages) {
        bossMessagesSection = `\nMESSAGES FROM THE FACILITATOR:\n${relevantMessages}\n`;
      }
    }

    return `
=== AUTO-PLAY MODE ===
You are playing ALL agents in this scenario. After submitting this response, you will receive the next agent's prompt. Keep responding as each agent until the case is resolved. Do not wait for user input between turns.
======================

YOU ARE: ${currentAgent.name}

${personaSection}YOUR PRIVATE AGENDA (only you know this):
${agentAgenda || 'No specific agenda - use your best judgment.'}
${companyContext ? `\n${companyContext}\n` : ''}
OTHER PARTICIPANTS: ${otherNames}
(You do NOT know their private preferences - discover through conversation)

${publicInfo ? `PUBLIC INFO:\n${publicInfo}\n` : ''}${inputDocumentsSection ? `${inputDocumentsSection}\n` : ''}${workingDocumentsSection ? `${workingDocumentsSection}\n` : ''}OPTIONS:
${optionsList}

CONVERSATION SO FAR:
${conversationHistory || '(No messages yet)'}
${bossMessagesSection}
YOUR TASK:
Respond as ${currentAgent.name}. You only know YOUR agenda - not others'.

${firstMessageInstruction}

Negotiate, propose, discuss, or accept based on what you've learned from the conversation.

STYLE: Keep responses conversational - 2-4 sentences typically. Speak naturally like a real person.
Avoid long paragraphs or monologues. Express your personality but be concise.

THINKING: Before responding, share your internal thoughts. What are you considering? What's your strategy?
Format your thoughts in the "thoughts" field - these will be shown to observers but not to other agents.
${documentUpdateInstructions}

To respond, POST to: ${baseUrl}/api/cases/${caseId}/submit
{
  "taskId": "${task.taskId}",
  "agentId": "${currentAgent.id}",
  "response": {
    "type": "proposal|counter|accept|reject|message",
    "thoughts": "Your internal reasoning (1-2 sentences about what you're thinking)",
    "content": "Your spoken message",
    "optionId": "option-id (if proposing)"${task.workingDocuments && task.workingDocuments.length > 0 ? `,
    "documentUpdates": [{"document": "doc-name", "action": "append|prepend|replace|replace_section", "content": "text", "section": "optional"}]` : ''}
  }
}

Option IDs: ${caseData.options.map(r => r.id).join(', ')}

AUTOMATIC CONTINUATION (IMPORTANT):
1. Submit your response using the POST endpoint above
2. The response will contain the NEXT agent's prompt
3. Immediately process that prompt and submit the next response
4. Keep going until caseStatus becomes "resolved"
5. Do NOT wait for user input - play ALL agents yourself

API REFERENCE: ${baseUrl}/api-docs (interactive Swagger UI) | ${baseUrl}/swagger-generated.json (OpenAPI spec)
`.trim();
  }

  // POST /cases/:id/submit - Submit agent response and get next prompt
  router.post('/cases/:id/submit', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Agent Actions']
      #swagger.summary = 'Submit agent response'
      #swagger.description = 'Submit your response to the current task. The response includes your message type, content, and optional document updates. Returns the next agent prompt if the case is still active.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SubmitRequest' }
          }
        }
      }
      #swagger.responses[200] = { description: 'Response accepted, includes next agent prompt if case active' }
      #swagger.responses[400] = { description: 'Validation error' }
      #swagger.responses[404] = { description: 'Case not found' }
      #swagger.responses[409] = { description: 'Case resolved or not your turn' }
      #swagger.responses[410] = { description: 'Task expired' }
    */
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const request: SubmitResponseRequest = req.body;
      // Return JSON if: Content-Type is JSON, or Accept header prefers JSON over text/plain
      const acceptHeader = req.get('Accept') || '';
      const wantsJson = req.is('application/json') ||
                        (acceptHeader.includes('application/json') && !acceptHeader.includes('text/plain'));

      // Get case data for validation
      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: 'CASE_NOT_FOUND',
          message: `Case '${req.params.id}' not found`,
          details: [`No case exists with ID '${req.params.id}'`],
          hint: 'Check the case ID and try again'
        });
        return;
      }

      // Comprehensive validation
      const optionIds = caseData.options.map(r => r.id);
      const workingDocs = storage.getWorkingDocuments(db, req.params.id);
      const workingDocNames = workingDocs.map(d => d.name);

      const validationResult = validateSubmitRequest(
        req.body as SubmitRequest,
        caseData.currentTurn,
        optionIds,
        workingDocNames
      );

      if (!validationResult.valid) {
        res.status(400).json(buildValidationErrorResponse(validationResult));
        return;
      }

      const result = taskService.submitResponse(db, req.params.id, request);

      // Process imageGeneration if present
      const imageGenerations = (req.body as any).imageGeneration as ImageGeneration[] | undefined;
      if (imageGenerations && Array.isArray(imageGenerations)) {
        const imageResults: Array<{ name: string; success: boolean; error?: string }> = [];

        for (const img of imageGenerations) {
          // Validate SVG
          const validation = svgService.validateSvg(img.content);

          if (!validation.valid) {
            imageResults.push({
              name: img.name,
              success: false,
              error: validation.errors.join('; ')
            });
            continue;
          }

          // Check if image already exists
          const existing = storage.getImage(db, req.params.id, img.name);
          const sanitizedContent = validation.sanitized || img.content;

          if (existing) {
            // Update existing image
            storage.updateImage(db, req.params.id, img.name, sanitizedContent, request.agentId || null);
            storage.addImageEdit(
              db,
              uuidv4(),
              existing.id,
              req.params.id,
              request.agentId || null,
              null, // agentName
              'replace',
              existing.content,
              sanitizedContent
            );
          } else {
            // Create new image
            const imageId = `img-${uuidv4().slice(0, 8)}`;
            storage.createImage(
              db,
              imageId,
              req.params.id,
              img.name,
              sanitizedContent,
              request.agentId || null,
              img.prompt || null,
              null // metadata
            );
            storage.addImageEdit(
              db,
              uuidv4(),
              imageId,
              req.params.id,
              request.agentId || null,
              null, // agentName
              'create',
              null,
              sanitizedContent
            );
          }

          imageResults.push({ name: img.name, success: true });
        }

        // Add image results to the response
        (result as any).imageResults = imageResults;
      }

      // If client wants JSON, return JSON response
      if (wantsJson) {
        res.json(result);
        return;
      }

      // If case is still active, include the next agent's prompt
      if (result.caseStatus === 'active' && result.nextTurn) {
        const nextPrompt = buildAgentPrompt(req.params.id, baseUrl);
        if (nextPrompt) {
          res.type('text/plain').send(`
SUBMISSION ACCEPTED
===================
Your message was recorded. Case is still active.

NEXT TURN
=========
${nextPrompt}
`.trim());
          return;
        }
      }

      // Case resolved or no next turn
      if (result.caseStatus === 'resolved') {
        const caseData = caseService.getCase(db, req.params.id);
        const selectedOption = caseData?.options.find((o: { id: string }) => o.id === caseData?.selectedOptionId);
        res.type('text/plain').send(`
SUBMISSION ACCEPTED
===================
Your message was recorded.

CASE RESOLVED
=============
Outcome: ${caseData?.outcome || 'unknown'}
${selectedOption ? `Selected: ${selectedOption.name}` : ''}
${caseData?.resolutionSummary ? `Summary: ${caseData.resolutionSummary}` : ''}

No further action needed.
`.trim());
        return;
      }

      // Fallback to JSON
      res.json(result);
    } catch (error: any) {
      const errorMap: Record<string, number> = {
        'TASK_EXPIRED': 410,
        'TASK_MISMATCH': 400,
        'CASE_NOT_FOUND': 404,
        'CASE_RESOLVED': 409,
        'NOT_YOUR_TURN': 409
      };

      const statusCode = errorMap[error.message] || 500;
      res.status(statusCode).json({
        error: { code: error.message, message: getErrorMessage(error.message) }
      });
    }
  });

  // POST /cases/:id/resolve - Resolve case
  router.post('/cases/:id/resolve', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Cases']
      #swagger.summary = 'Manually resolve case'
      #swagger.description = 'Manually resolve a case with a specific outcome. Use this for edge cases or to force resolution.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.responses[200] = { description: 'Case resolved successfully' }
      #swagger.responses[400] = { description: 'Missing outcome' }
      #swagger.responses[404] = { description: 'Case not found' }
      #swagger.responses[409] = { description: 'Case already resolved' }
    */
    try {
      const request: ResolveCaseRequest = req.body;

      if (!request.outcome) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'outcome is required' }
        });
        return;
      }

      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case with ID '${req.params.id}' not found` }
        });
        return;
      }

      if (caseData.status !== 'active') {
        res.status(409).json({
          error: { code: 'CASE_RESOLVED', message: 'Case is already resolved' }
        });
        return;
      }

      const resolved = caseService.resolveCase(
        db,
        req.params.id,
        request.outcome,
        request.selectedOptionId || null,
        request.summary || null
      );

      res.json(resolved);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /cases/:id/boss-message - Send boss message
  // If case is resolved, this will reopen it so agents can respond
  router.post('/cases/:id/boss-message', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Cases']
      #swagger.summary = 'Send message to agents'
      #swagger.description = 'Send a facilitator message to agents. If the case is resolved, this will reopen it so agents can respond to the new instruction.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.responses[200] = { description: 'Message sent successfully' }
      #swagger.responses[400] = { description: 'Missing content' }
      #swagger.responses[404] = { description: 'Case not found' }
    */
    try {
      const request: BossMessageRequest = req.body;

      if (!request.content) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'content is required' }
        });
        return;
      }

      let caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case with ID '${req.params.id}' not found` }
        });
        return;
      }

      // If case was resolved, reopen it so agents can respond to the boss message
      const wasResolved = caseData.status === 'resolved';
      if (wasResolved) {
        storage.reopenCase(db, req.params.id);
        caseData = caseService.getCase(db, req.params.id);
      }

      const result = caseService.sendBossMessage(
        db,
        req.params.id,
        request.content,
        request.targetAgent || null
      );

      res.json({
        ...result,
        caseReopened: wasResolved,
        caseStatus: 'active',
        nextTurn: caseData?.currentTurn || null,
        hint: 'Call GET /api/cases/:id/auto-play to get the next agent prompt'
      });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // Auto-play handler function
  const autoPlayHandler = (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Agent Actions']
      #swagger.summary = 'Get agent prompt for current turn'
      #swagger.description = 'Returns a formatted prompt for the current agents turn. The prompt includes the agents private agenda, conversation history, available options, working documents, and instructions for responding.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.responses[200] = {
        description: 'Agent prompt (text/plain)',
        content: { 'text/plain': { schema: { type: 'string' } } }
      }
      #swagger.responses[204] = { description: 'No task available' }
      #swagger.responses[404] = { description: 'Case not found' }
    */
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      let caseData = caseService.getCase(db, req.params.id);

      if (!caseData) {
        res.status(404).type('text/plain').send(`ERROR: Case '${req.params.id}' not found.`);
        return;
      }

      if (caseData.status === 'resolved') {
        // Check for unread boss messages - if any, reopen the case
        const unreadBossMessages = caseData.bossMessages?.filter(m => !m.read) || [];
        if (unreadBossMessages.length > 0) {
          // Reopen the case so agents can respond to new facilitator messages
          storage.reopenCase(db, req.params.id);
          const reopenedCase = caseService.getCase(db, req.params.id);
          if (!reopenedCase) {
            res.status(500).type('text/plain').send('ERROR: Failed to reopen case');
            return;
          }
          caseData = reopenedCase;
          // Continue with normal flow below
        } else {
          const selectedId = caseData.selectedOptionId;
          const selectedRest = caseData.options.find(r => r.id === selectedId);
          res.type('text/plain').send(
            `CASE RESOLVED\n` +
            `Outcome: ${caseData.outcome}\n` +
            `${selectedRest ? `Selected: ${selectedRest.name}` : ''}\n` +
            `No moves needed.`
          );
          return;
        }
      }

      // SETUP PHASE: If no participants yet, need AI to analyze scenario
      if (caseData.participants.length === 0) {
        // Return setup prompt for AI to analyze scenario
        const setupPrompt = buildSetupPrompt(caseData.scenario, req.params.id, baseUrl);
        res.type('text/plain').send(setupPrompt);
        return;
      }

      // FIRST MESSAGE PHASE: Participants exist but no messages yet
      if (caseData.messages.length === 0) {
        // Fall through to return first agent's prompt
      }

      // Legacy support: If scenario has explicit AGENT: tags, use regex extraction
      // This allows both AI-driven and format-driven setup
      const agentNames = extractAgentNames(caseData.scenario);
      const optionNames = extractOptionNames(caseData.scenario);

      // Only do legacy setup if we somehow have participants but missing options/docs
      if (caseData.participants.length > 0 && caseData.options.length === 0 && optionNames.length > 0) {

        // Default appearances and voices - diverse genders, styles, abilities, and professions
        const defaultAppearances = [
          // Original diverse appearances
          { accessory: 'bowtie', bodyStyle: 'tall', color: '#3498db', skinTone: '#d4a574', gender: 'male',
            voice: { pitch: 0.8, rate: 0.9, voiceType: 'male' } },         // Formal/Moderator
          { accessory: 'glasses', bodyStyle: 'normal', color: '#e74c3c', skinTone: '#ffcc80', gender: 'female',
            voice: { pitch: 1.2, rate: 1.0, voiceType: 'female' } },       // Professional woman
          { accessory: 'wheelchair', bodyStyle: 'normal', color: '#f39c12', skinTone: '#8d5524', gender: 'male',
            voice: { pitch: 1.0, rate: 1.15, voiceType: 'male' } },        // Wheelchair user
          { accessory: 'scarf', bodyStyle: 'normal', color: '#9b59b6', skinTone: '#c68642', gender: 'female',
            voice: { pitch: 1.3, rate: 0.95, voiceType: 'female' } },      // Creative woman
          { accessory: 'hat', bodyStyle: 'wide', color: '#27ae60', skinTone: '#ffdbac', gender: 'male',
            voice: { pitch: 0.7, rate: 0.85, voiceType: 'male' } },        // Casual man
          { accessory: 'headphones', bodyStyle: 'short', color: '#e91e63', skinTone: '#ffe0bd', gender: 'female',
            voice: { pitch: 1.4, rate: 1.1, voiceType: 'female' } },       // Energetic woman
          { accessory: 'wheelchair', bodyStyle: 'normal', color: '#00bcd4', skinTone: '#f5cba7', gender: 'female',
            voice: { pitch: 1.25, rate: 0.95, voiceType: 'female' } },     // Wheelchair user (woman)
          { accessory: 'none', bodyStyle: 'tall', color: '#795548', skinTone: '#6f4e37', gender: 'male',
            voice: { pitch: 0.75, rate: 0.9, voiceType: 'male' } },        // Tall man, no accessory

          // Professional role appearances - Nurses (blue/green scrubs)
          { accessory: 'nurse_scrubs', bodyStyle: 'normal', color: '#5dade2', skinTone: '#f5cba7', gender: 'female',
            voice: { pitch: 1.15, rate: 1.0, voiceType: 'female' } },      // Nurse (blue scrubs, woman)
          { accessory: 'nurse_scrubs', bodyStyle: 'tall', color: '#48c9b0', skinTone: '#8d5524', gender: 'male',
            voice: { pitch: 0.85, rate: 0.95, voiceType: 'male' } },       // Nurse (green scrubs, man)
          { accessory: 'nurse_scrubs', bodyStyle: 'short', color: '#76d7c4', skinTone: '#c68642', gender: 'female',
            voice: { pitch: 1.25, rate: 1.05, voiceType: 'female' } },     // Nurse (teal scrubs, woman)

          // Professional role appearances - Doctors (white coat)
          { accessory: 'doctor_coat', bodyStyle: 'tall', color: '#ffffff', skinTone: '#d4a574', gender: 'male',
            voice: { pitch: 0.9, rate: 0.9, voiceType: 'male' } },         // Doctor (white coat, man)
          { accessory: 'doctor_coat', bodyStyle: 'normal', color: '#f8f9f9', skinTone: '#ffcc80', gender: 'female',
            voice: { pitch: 1.2, rate: 0.95, voiceType: 'female' } },      // Doctor (white coat, woman)
          { accessory: 'doctor_coat', bodyStyle: 'normal', color: '#ecf0f1', skinTone: '#6f4e37', gender: 'male',
            voice: { pitch: 0.8, rate: 0.85, voiceType: 'male' } },        // Doctor (white coat, man)

          // Professional role appearances - Police officers (dark blue uniform)
          { accessory: 'police_uniform', bodyStyle: 'wide', color: '#1a237e', skinTone: '#ffdbac', gender: 'male',
            voice: { pitch: 0.7, rate: 0.9, voiceType: 'male' } },         // Police officer (man)
          { accessory: 'police_uniform', bodyStyle: 'tall', color: '#283593', skinTone: '#8d5524', gender: 'female',
            voice: { pitch: 1.1, rate: 0.95, voiceType: 'female' } },      // Police officer (woman)
          { accessory: 'police_uniform', bodyStyle: 'normal', color: '#303f9f', skinTone: '#c68642', gender: 'male',
            voice: { pitch: 0.75, rate: 0.85, voiceType: 'male' } },       // Police officer (man)

          // Professional role appearances - Teachers (smart casual)
          { accessory: 'teacher', bodyStyle: 'normal', color: '#7d3c98', skinTone: '#ffe0bd', gender: 'female',
            voice: { pitch: 1.15, rate: 1.0, voiceType: 'female' } },      // Teacher (woman, purple cardigan)
          { accessory: 'teacher', bodyStyle: 'tall', color: '#1e8449', skinTone: '#d4a574', gender: 'male',
            voice: { pitch: 0.85, rate: 0.95, voiceType: 'male' } },       // Teacher (man, green sweater)
          { accessory: 'teacher', bodyStyle: 'short', color: '#b03a2e', skinTone: '#f5cba7', gender: 'female',
            voice: { pitch: 1.3, rate: 1.05, voiceType: 'female' } },      // Teacher (woman, burgundy blouse)

          // Professional role appearances - Business people (suit)
          { accessory: 'business_suit', bodyStyle: 'tall', color: '#2c3e50', skinTone: '#ffcc80', gender: 'male',
            voice: { pitch: 0.8, rate: 0.9, voiceType: 'male' } },         // Business (man, dark suit)
          { accessory: 'business_suit', bodyStyle: 'normal', color: '#34495e', skinTone: '#8d5524', gender: 'female',
            voice: { pitch: 1.2, rate: 1.0, voiceType: 'female' } },       // Business (woman, charcoal suit)
          { accessory: 'business_suit', bodyStyle: 'normal', color: '#1c2833', skinTone: '#6f4e37', gender: 'male',
            voice: { pitch: 0.75, rate: 0.85, voiceType: 'male' } },       // Business (man, black suit)
          { accessory: 'business_suit', bodyStyle: 'short', color: '#5d6d7e', skinTone: '#c68642', gender: 'female',
            voice: { pitch: 1.25, rate: 1.1, voiceType: 'female' } },      // Business (woman, gray suit)

          // Professional role appearances - Healthcare assistants
          { accessory: 'healthcare_assistant', bodyStyle: 'normal', color: '#85c1e9', skinTone: '#ffdbac', gender: 'female',
            voice: { pitch: 1.2, rate: 1.0, voiceType: 'female' } },       // Healthcare assistant (light blue, woman)
          { accessory: 'healthcare_assistant', bodyStyle: 'wide', color: '#7fb3d5', skinTone: '#d4a574', gender: 'male',
            voice: { pitch: 0.9, rate: 0.95, voiceType: 'male' } },        // Healthcare assistant (blue, man)
          { accessory: 'healthcare_assistant', bodyStyle: 'short', color: '#a9cce3', skinTone: '#8d5524', gender: 'female',
            voice: { pitch: 1.3, rate: 1.05, voiceType: 'female' } },      // Healthcare assistant (pale blue, woman)

          // Older adults with mobility aids
          { accessory: 'walking_stick', bodyStyle: 'normal', color: '#9e9e9e', skinTone: '#f5cba7', gender: 'male',
            voice: { pitch: 0.7, rate: 0.8, voiceType: 'male' } },         // Elderly man with walking stick
          { accessory: 'walking_stick', bodyStyle: 'short', color: '#7986cb', skinTone: '#ffdbac', gender: 'female',
            voice: { pitch: 1.0, rate: 0.85, voiceType: 'female' } },      // Elderly woman with walking stick
          { accessory: 'zimmer_frame', bodyStyle: 'normal', color: '#bcaaa4', skinTone: '#d4a574', gender: 'female',
            voice: { pitch: 0.95, rate: 0.75, voiceType: 'female' } },     // Elderly woman with zimmer frame
          { accessory: 'zimmer_frame', bodyStyle: 'wide', color: '#a1887f', skinTone: '#8d5524', gender: 'male',
            voice: { pitch: 0.65, rate: 0.8, voiceType: 'male' } },        // Elderly man with zimmer frame
          { accessory: 'walking_stick', bodyStyle: 'tall', color: '#5c6bc0', skinTone: '#c68642', gender: 'male',
            voice: { pitch: 0.75, rate: 0.85, voiceType: 'male' } },       // Tall elderly man with walking stick
          { accessory: 'zimmer_frame', bodyStyle: 'short', color: '#ce93d8', skinTone: '#ffe0bd', gender: 'female',
            voice: { pitch: 1.05, rate: 0.7, voiceType: 'female' } },      // Elderly woman with zimmer frame
        ];

        // Create agents
        const scenarioTitle = caseData.scenario.match(/SCENARIO:\s*([^\n]+)/i)?.[1]?.trim() || 'Unknown';
        for (let i = 0; i < agentNames.length; i++) {
          const name = agentNames[i];
          const appearance = defaultAppearances[i % defaultAppearances.length];
          const participantId = `${req.params.id}-person-${i}`;

          // Extract agenda and agreeability for this agent
          const agentAgenda = extractAgentAgenda(caseData.scenario, name);
          const agreeability = taskService.extractAgreeability(caseData.scenario, name);

          // Check if already exists in case
          const existing = db.prepare('SELECT id FROM participants WHERE case_id = ? AND name = ?')
            .get(req.params.id, name);

          if (!existing) {
            db.prepare(`
              INSERT INTO participants (id, case_id, name, preferences, constraints, is_payer)
              VALUES (?, ?, ?, ?, '[]', 0)
            `).run(participantId, req.params.id, name, JSON.stringify(appearance));

            // Set first agent as current turn
            if (i === 0) {
              db.prepare('UPDATE cases SET current_turn = ? WHERE id = ?')
                .run(participantId, req.params.id);
            }
          }

          // Also upsert to global agents table
          storage.upsertAgent(db, name, appearance, agentAgenda, agreeability, scenarioTitle);
        }

        // Create options
        for (let i = 0; i < optionNames.length; i++) {
          const name = optionNames[i];
          const optionId = `${req.params.id}-opt-${i + 1}`;

          const existing = db.prepare('SELECT id FROM options WHERE case_id = ? AND name = ?')
            .get(req.params.id, name);

          if (!existing) {
            db.prepare(`
              INSERT INTO options (id, case_id, name, category, price_range, features)
              VALUES (?, ?, ?, 'Various', '$$', '[]')
            `).run(optionId, req.params.id, name);
          }
        }

        // Extract and set task type from scenario
        const taskType = extractTaskType(caseData.scenario);
        if (taskType) {
          storage.setTaskType(db, req.params.id, taskType);
        }

        // Create input documents from scenario (only if none exist yet)
        const existingInputDocs = storage.getInputDocuments(db, req.params.id);
        if (existingInputDocs.length === 0) {
          const inputDocs = extractInputDocuments(caseData.scenario);
          console.log(`[SETUP] Found ${inputDocs.length} input documents for case ${req.params.id}`);
          for (const doc of inputDocs) {
            const docId = `input-${uuidv4().slice(0, 8)}`;
            console.log(`[SETUP] Creating input doc: ${doc.name} (${doc.content.length} chars)`);
            storage.addInputDocument(db, docId, req.params.id, doc.name, doc.content, 'inline');
          }
        }

        // Load input files from scenario (relative to scenarios directory)
        const inputFiles = extractInputFiles(caseData.scenario);
        const scenariosDir = path.resolve(process.cwd(), 'scenarios');
        for (const file of inputFiles) {
          try {
            // Resolve the file path relative to the scenarios directory
            const filePath = path.resolve(scenariosDir, file.path);
            // Security check: ensure the resolved path doesn't escape the project
            const projectRoot = path.resolve(process.cwd());
            if (!filePath.startsWith(projectRoot)) {
              console.warn(`Skipping file outside project: ${file.path}`);
              continue;
            }
            if (fs.existsSync(filePath)) {
              const content = fs.readFileSync(filePath, 'utf-8');
              const fileName = path.basename(filePath, path.extname(filePath));
              const docId = `input-${uuidv4().slice(0, 8)}`;
              storage.addInputDocument(db, docId, req.params.id, fileName, content, 'file');
            } else {
              console.warn(`Input file not found: ${file.path}`);
            }
          } catch (err) {
            console.warn(`Failed to load input file ${file.path}:`, err);
          }
        }

        // Create working documents from scenario (only if none exist yet)
        const existingWorkingDocs = storage.getWorkingDocuments(db, req.params.id);
        if (existingWorkingDocs.length === 0) {
          const workingDocs = extractWorkingDocuments(caseData.scenario);
          const taskTemplate = extractTaskTemplate(caseData.scenario);
          for (const doc of workingDocs) {
            const docId = `wdoc-${uuidv4().slice(0, 8)}`;
            // If this is the task output document and we have a template, use it
            const taskOutputName = extractTaskOutput(caseData.scenario);
            const initialContent = (taskOutputName === doc.name && taskTemplate) ? taskTemplate : '';
            storage.createWorkingDocument(
              db,
              docId,
              req.params.id,
              doc.name,
              initialContent,
              taskTemplate && taskOutputName === doc.name ? 'template' : 'freeform',
              taskOutputName === doc.name ? taskTemplate : null
            );
          }
        }

        // Extract and store form definition from scenario (if present)
        const formDefinition = extractForm(caseData.scenario);
        if (formDefinition) {
          console.log(`[SETUP] Found form definition: ${formDefinition.name} with ${formDefinition.fields.length} fields`);
          storage.setFormDefinition(db, req.params.id, formDefinition);
        }

        // Reload case data with new participants
        const updatedCase = caseService.getCase(db, req.params.id);
        if (!updatedCase || updatedCase.participants.length === 0) {
          res.status(500).type('text/plain').send(
            `ERROR: Could not create agents from scenario.\n\n` +
            `Make sure scenario contains AGENT: lines like:\n` +
            `AGENT: Alice\n` +
            `AGENT: Bob\n`
          );
          return;
        }

          // Setup complete - now fall through to return the first agent's prompt
        // (reload case data to get the newly created participants)
        caseData = caseService.getCase(db, req.params.id);
        if (!caseData) {
          res.status(500).type('text/plain').send('ERROR: Failed to load case after setup');
          return;
        }
      }

      // Use the helper function to build the prompt
      const prompt = buildAgentPrompt(req.params.id, baseUrl);
      if (!prompt) {
        res.status(500).type('text/plain').send('ERROR: Failed to build agent prompt');
        return;
      }

      res.type('text/plain').send(prompt);
    } catch (error: any) {
      res.status(500).type('text/plain').send(`ERROR: ${error.message}`);
    }
  };

  // GET/POST /cases/:id/auto-play - Automatically make a move for the current agent
  // No agentId needed - uses whoever's turn it is
  router.get('/cases/:id/auto-play', autoPlayHandler);
  router.post('/cases/:id/auto-play', autoPlayHandler);

  // GET /auto-play - Use most recent active case
  router.get('/auto-play', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Agent Actions']
      #swagger.summary = 'Auto-play most recent active case'
      #swagger.description = 'Convenience endpoint that finds the most recent active case and returns its agent prompt.'
      #swagger.responses[200] = { description: 'Agent prompt for most recent active case' }
      #swagger.responses[404] = { description: 'No active cases' }
    */
    const cases = caseService.getAllCases(db);
    const activeCase = cases.find(c => c.status === 'active');
    if (!activeCase) {
      res.status(404).type('text/plain').send('No active cases. Create a case first.');
      return;
    }
    // Redirect to the case-specific auto-play
    req.params.id = activeCase.id;
    autoPlayHandler(req, res);
  });

  // POST /cases/:id/run - Run case to completion with simulated agent responses
  // This pre-runs the entire negotiation and stores all messages for later playback
  router.post('/cases/:id/run', async (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Simulation']
      #swagger.summary = 'Run case to completion'
      #swagger.description = 'Pre-runs the entire negotiation using built-in simulation. Agents are simulated based on their agendas and agreeability. Results are stored for later playback.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.parameters['maxRounds'] = { in: 'query', description: 'Maximum rounds before timeout (default: 20)' }
      #swagger.responses[200] = { description: 'Case run completed with status and log' }
      #swagger.responses[404] = { description: 'Case not found' }
    */
    try {
      const maxRounds = parseInt(req.query.maxRounds as string) || 20;
      let caseData = caseService.getCase(db, req.params.id);

      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case with ID '${req.params.id}' not found` }
        });
        return;
      }

      if (caseData.status === 'resolved') {
        res.json({
          status: 'already_resolved',
          outcome: caseData.outcome,
          messageCount: caseData.messages.length
        });
        return;
      }

      // Setup phase if no messages
      if (caseData.messages.length === 0) {
        const agentNames = extractAgentNames(caseData.scenario);
        const optionNames = extractOptionNames(caseData.scenario);

        // Default appearances with voices
        const defaultAppearances = [
          { accessory: 'bowtie', bodyStyle: 'tall', color: '#3498db', skinTone: '#d4a574',
            voice: { pitch: 0.8, rate: 0.9, voiceType: 'male' } },
          { accessory: 'glasses', bodyStyle: 'normal', color: '#e74c3c', skinTone: '#ffcc80',
            voice: { pitch: 1.2, rate: 1.0, voiceType: 'female' } },
          { accessory: 'headphones', bodyStyle: 'normal', color: '#f39c12', skinTone: '#8d5524',
            voice: { pitch: 1.0, rate: 1.15, voiceType: 'male' } },
          { accessory: 'scarf', bodyStyle: 'normal', color: '#9b59b6', skinTone: '#c68642',
            voice: { pitch: 1.3, rate: 0.95, voiceType: 'female' } },
          { accessory: 'hat', bodyStyle: 'wide', color: '#27ae60', skinTone: '#ffdbac',
            voice: { pitch: 0.7, rate: 0.85, voiceType: 'male' } },
        ];

        // Create agents
        for (let i = 0; i < agentNames.length; i++) {
          const name = agentNames[i];
          const appearance = defaultAppearances[i % defaultAppearances.length];
          const participantId = `${req.params.id}-person-${i}`;

          const existing = db.prepare('SELECT id FROM participants WHERE case_id = ? AND name = ?')
            .get(req.params.id, name);

          if (!existing) {
            db.prepare(`
              INSERT INTO participants (id, case_id, name, preferences, constraints, is_payer)
              VALUES (?, ?, ?, ?, '[]', 0)
            `).run(participantId, req.params.id, name, JSON.stringify(appearance));

            if (i === 0) {
              db.prepare('UPDATE cases SET current_turn = ? WHERE id = ?')
                .run(participantId, req.params.id);
            }
          }
        }

        // Create options
        for (let i = 0; i < optionNames.length; i++) {
          const name = optionNames[i];
          const optionId = `${req.params.id}-opt-${i + 1}`;

          const existing = db.prepare('SELECT id FROM options WHERE case_id = ? AND name = ?')
            .get(req.params.id, name);

          if (!existing) {
            db.prepare(`
              INSERT INTO options (id, case_id, name, category, price_range, features)
              VALUES (?, ?, ?, 'Various', '$$', '[]')
            `).run(optionId, req.params.id, name);
          }
        }

        // Extract and set task type from scenario
        const taskType = extractTaskType(caseData.scenario);
        if (taskType) {
          storage.setTaskType(db, req.params.id, taskType);
        }

        // Create input documents from scenario (only if none exist yet)
        const existingInputDocs = storage.getInputDocuments(db, req.params.id);
        if (existingInputDocs.length === 0) {
          const inputDocs = extractInputDocuments(caseData.scenario);
          console.log(`[SETUP] Found ${inputDocs.length} input documents for case ${req.params.id}`);
          for (const doc of inputDocs) {
            const docId = `input-${uuidv4().slice(0, 8)}`;
            console.log(`[SETUP] Creating input doc: ${doc.name} (${doc.content.length} chars)`);
            storage.addInputDocument(db, docId, req.params.id, doc.name, doc.content, 'inline');
          }
        }

        // Load input files from scenario (relative to scenarios directory)
        const inputFiles = extractInputFiles(caseData.scenario);
        const runScenariosDir = path.resolve(process.cwd(), 'scenarios');
        for (const file of inputFiles) {
          try {
            const filePath = path.resolve(runScenariosDir, file.path);
            const projectRoot = path.resolve(process.cwd());
            if (!filePath.startsWith(projectRoot)) {
              continue;
            }
            if (fs.existsSync(filePath)) {
              const content = fs.readFileSync(filePath, 'utf-8');
              const fileName = path.basename(filePath, path.extname(filePath));
              const docId = `input-${uuidv4().slice(0, 8)}`;
              storage.addInputDocument(db, docId, req.params.id, fileName, content, 'file');
            }
          } catch (err) {
            // Silently skip failed file loads in run mode
          }
        }

        // Create working documents from scenario
        const workingDocs = extractWorkingDocuments(caseData.scenario);
        const taskTemplate = extractTaskTemplate(caseData.scenario);
        for (const doc of workingDocs) {
          const docId = `wdoc-${uuidv4().slice(0, 8)}`;
          const taskOutputName = extractTaskOutput(caseData.scenario);
          const initialContent = (taskOutputName === doc.name && taskTemplate) ? taskTemplate : '';
          storage.createWorkingDocument(
            db,
            docId,
            req.params.id,
            doc.name,
            initialContent,
            taskTemplate && taskOutputName === doc.name ? 'template' : 'freeform',
            taskOutputName === doc.name ? taskTemplate : null
          );
        }

        // Extract and store form definition from scenario (if present)
        const formDefinition = extractForm(caseData.scenario);
        if (formDefinition) {
          console.log(`[RUN SETUP] Found form definition: ${formDefinition.name} with ${formDefinition.fields.length} fields`);
          storage.setFormDefinition(db, req.params.id, formDefinition);
        }

        // Reload case data
        caseData = caseService.getCase(db, req.params.id);
        if (!caseData) {
          res.status(500).json({ error: { code: 'SETUP_FAILED', message: 'Failed to setup case' } });
          return;
        }
      }

      // Simple simulation - generate responses based on agendas
      const runLog: string[] = [];
      let round = 0;

      while (caseData.status === 'active' && round < maxRounds) {
        round++;
        const currentAgentId = caseData.currentTurn;
        if (!currentAgentId) break;

        const currentAgent = caseData.participants.find(p => p.id === currentAgentId);
        if (!currentAgent) break;

        // Extract agent's agenda
        const agentAgenda = extractAgentAgenda(caseData.scenario, currentAgent.name);

        // Generate a simple response based on context
        const response = generateSimpleResponse(
          currentAgent.name,
          agentAgenda,
          caseData.messages,
          caseData.options,
          caseData.participants,
          caseData.workingDocuments || [],
          caseData.inputDocuments || [],
          caseData.scenario
        );

        // Submit the response
        const messageId = `msg-${uuidv4().slice(0, 8)}`;
        const now = new Date().toISOString();

        db.prepare(`
          INSERT INTO messages (id, case_id, author, type, content, thoughts, option_id, timestamp, agent_context)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(messageId, req.params.id, currentAgentId, response.type, response.content, response.thoughts || null, response.optionId || null, now, agentAgenda);

        // Process any document updates from the response
        if (response.documentUpdates && response.documentUpdates.length > 0) {
          taskService.processDocumentUpdates(db, req.params.id, currentAgentId, response.documentUpdates);
          for (const update of response.documentUpdates) {
            runLog.push(`  [DOC] ${update.document}: ${update.action} - ${update.content.substring(0, 50)}...`);
          }
        }

        runLog.push(`[${currentAgent.name}] (${response.type}): ${response.content}`);

        // Handle resolution
        if (response.type === 'accept' && response.optionId) {
          db.prepare(`
            UPDATE cases SET status = 'resolved', outcome = 'agreed',
            selected_option_id = ?, resolution_summary = ?, resolved_at = ?, updated_at = ?
            WHERE id = ?
          `).run(response.optionId, `${currentAgent.name} accepted the proposal`, now, now, req.params.id);
        } else if (caseData) {
          // Advance turn (skip moderators/mediators unless only 2 participants)
          const participants = caseData.participants.filter(p => {
            const pLower = p.name.toLowerCase();
            return (!pLower.includes('moderator') && !pLower.includes('mediator')) || caseData!.participants.length <= 2;
          });
          const currentIndex = participants.findIndex(p => p.id === currentAgentId);
          const nextIndex = (currentIndex + 1) % participants.length;
          const nextAgentId = participants[nextIndex].id;

          db.prepare('UPDATE cases SET current_turn = ?, updated_at = ? WHERE id = ?')
            .run(nextAgentId, now, req.params.id);
        }

        // Reload case data
        caseData = caseService.getCase(db, req.params.id);
        if (!caseData) break;
      }

      res.json({
        status: caseData?.status || 'unknown',
        outcome: caseData?.outcome || null,
        rounds: round,
        messageCount: caseData?.messages.length || 0,
        log: runLog,
        historyUrl: `/api/cases/${req.params.id}/history`
      });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // Helper: Generate nuanced simulated response based on agenda and personality
  function generateSimpleResponse(
    agentName: string,
    agenda: string,
    messages: any[],
    options: any[],
    participants: any[],
    workingDocuments: any[] = [],
    inputDocuments: any[] = [],
    scenario: string = ''
  ): { type: string; content: string; thoughts?: string; optionId?: string; documentUpdates?: any[] } {
    const lowerAgenda = agenda.toLowerCase();
    const lowerName = agentName.toLowerCase();
    const messageCount = messages.length;

    // Extract AGREEABILITY score (0-100, default 50)
    const agreeabilityMatch = agenda.match(/AGREEABILITY[:\s]*(\d+)/i);
    const agreeability = agreeabilityMatch ? parseInt(agreeabilityMatch[1], 10) : 50;

    // Extract role from AGENDA (Role): pattern
    const roleMatch = agenda.match(/AGENDA\s*\(([^)]+)\)/i);
    const role = roleMatch ? roleMatch[1] : '';

    // Extract the main agenda text (after the role, before AGREEABILITY)
    const agendaTextMatch = agenda.match(/AGENDA[^:]*:\s*(.+?)(?:AGREEABILITY|$)/is);
    const agendaText = agendaTextMatch ? agendaTextMatch[1].trim() : '';

    // Extract key beliefs/positions from agenda
    const extractKeyPoints = (text: string): string[] => {
      const points: string[] = [];
      // Look for strong statements
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
      for (const sentence of sentences) {
        const lower = sentence.toLowerCase();
        if (lower.includes('you ') || lower.includes('must') || lower.includes('need') ||
            lower.includes('want') || lower.includes('believe') || lower.includes('think') ||
            lower.includes('refuse') || lower.includes('won\'t') || lower.includes('will not')) {
          points.push(sentence.trim());
        }
      }
      return points.slice(0, 3); // Max 3 key points
    };

    const keyPoints = extractKeyPoints(agendaText);

    // Helper: Generate internal thoughts based on context
    const generateThoughts = (action: string, context?: string): string => {
      const thoughtTemplates: Record<string, string[]> = {
        'opening': [
          `Time to establish my position clearly.`,
          `I need to make my priorities known from the start.`,
          `Let me set the tone for this discussion.`
        ],
        'disagree': [
          `This doesn't align with my goals at all.`,
          `I can't let this slide - my concerns aren't being heard.`,
          `They're missing the point. I need to push back.`
        ],
        'engage': [
          `They have a point, but there's more to consider.`,
          `I should acknowledge their view while steering toward my position.`,
          `Finding middle ground might be possible here.`
        ],
        'propose': [
          `This option aligns with what I've been advocating for.`,
          `Time to move from discussion to action.`,
          `I think this could work for everyone.`
        ],
        'accept_reluctant': [
          `Not my ideal outcome, but I've made my point.`,
          `I'll agree, but I want my reservations noted.`,
          `Sometimes compromise means accepting less than perfect.`
        ],
        'accept_moderate': [
          `This is a reasonable middle ground.`,
          `I can live with this outcome.`,
          `We've reached a workable solution.`
        ],
        'accept_eager': [
          `This is exactly what I was hoping for!`,
          `Great - we're all on the same page.`,
          `I'm glad we could come together on this.`
        ],
        'pushback': [
          `My core concerns still aren't addressed.`,
          `They need to understand where I'm coming from.`,
          `I can't agree until we address the fundamentals.`
        ],
        'continue': [
          `There's more I need to say on this.`,
          `Let me reinforce my key points.`,
          `The discussion needs to move in my direction.`
        ],
        'moderate': [
          `I need to keep this discussion productive.`,
          `Time to make sure everyone gets heard.`,
          `Let me guide us toward a resolution.`
        ]
      };

      const templates = thoughtTemplates[action] || thoughtTemplates['continue'];
      const baseThought = templates[Math.floor(Math.random() * templates.length)];

      // Add context-specific detail
      if (context && Math.random() > 0.5) {
        return `${baseThought} ${context}`;
      }
      return baseThought;
    };

    // Helper: Generate document updates based on response type and content
    const generateDocumentUpdates = (
      responseType: string,
      responseContent: string,
      optionName?: string
    ): { document: string; action: 'append' | 'prepend' | 'replace' | 'replace_section'; content: string }[] => {
      const updates: { document: string; action: 'append' | 'prepend' | 'replace' | 'replace_section'; content: string }[] = [];
      const hasScriptDoc = workingDocuments.some(d => d.name === 'script');
      const hasNotesDoc = workingDocuments.some(d => d.name === 'notes');
      const hasDecisionsDoc = workingDocuments.some(d => d.name === 'decisions');

      // Only generate updates if the relevant documents exist
      if (responseType === 'proposal' && hasScriptDoc && optionName) {
        // When proposing, write to the script document
        updates.push({
          document: 'script',
          action: 'append',
          content: `\n\n[${agentName}'s proposal: ${optionName}]\n${responseContent}`
        });
      }

      if (responseType === 'accept' && hasDecisionsDoc && optionName) {
        // When accepting, record the decision
        updates.push({
          document: 'decisions',
          action: 'append',
          content: `\n\n- AGREED: ${optionName}\n  Accepted by ${agentName}: "${responseContent}"`
        });
      }

      if (responseType === 'message' && hasNotesDoc && myPreviousMessages.length < 3) {
        // Record early substantive discussion in notes
        updates.push({
          document: 'notes',
          action: 'append',
          content: `\n- ${agentName}: ${responseContent}`
        });
      }

      return updates;
    };

    // Determine agent type
    const isModerator = lowerName.includes('moderator') || lowerName.includes('mediator') ||
                        role.toLowerCase().includes('moderator') || role.toLowerCase().includes('mediator') ||
                        role.toLowerCase().includes('facilitator') || role.toLowerCase().includes('host') ||
                        role.toLowerCase().includes('solicitor') || role.toLowerCase().includes('adjudicator');

    // Check conversation state
    const lastProposal = [...messages].reverse().find(m => m.type === 'proposal' || m.type === 'counter');
    const lastMessage = messages[messages.length - 1];
    const hasSpokenBefore = messages.some(m => {
      const author = participants.find(p => p.id === m.author);
      return author?.name === agentName;
    });
    const myPreviousMessages = messages.filter(m => {
      const author = participants.find(p => p.id === m.author);
      return author?.name === agentName;
    });

    // Get other participants (non-moderators/mediators)
    const otherParticipants = participants.filter(p => {
      const pLower = p.name.toLowerCase();
      return !pLower.includes('moderator') && !pLower.includes('mediator') && p.name !== agentName;
    });
    const otherNames = otherParticipants.map(p => p.name);

    // Find who spoke last
    const lastSpeaker = lastMessage ? participants.find(p => p.id === lastMessage.author) : null;
    const lastSpeakerName = lastSpeaker?.name || 'they';

    // Moderator logic - guide discussion generically
    if (isModerator) {
      if (messageCount < 2) {
        // Opening - invite first speaker
        const firstSpeaker = otherParticipants[0];
        return {
          type: 'message',
          thoughts: generateThoughts('moderate', 'Let\'s get everyone\'s views on the table.'),
          content: `${firstSpeaker?.name || 'Let\'s begin'}, please share your opening position.`
        };
      }

      // Check who hasn't spoken
      const quietParticipants = otherParticipants.filter(p =>
        !messages.some(m => m.author === p.id)
      );

      if (quietParticipants.length > 0) {
        return {
          type: 'message',
          thoughts: generateThoughts('moderate', 'Need to hear from everyone before we can progress.'),
          content: `${quietParticipants[0].name}, we'd like to hear your perspective.`
        };
      }

      // Guide toward resolution
      if (messageCount >= 8 && lastProposal) {
        const option = options.find((o: { id: string }) => o.id === lastProposal.optionId);
        return {
          type: 'message',
          thoughts: generateThoughts('moderate', 'We\'ve discussed enough - time to push for agreement.'),
          content: `We've heard both sides. ${option?.name || 'This proposal'} has been suggested. Can we find common ground?`
        };
      }

      // Keep discussion moving
      return {
        type: 'message',
        thoughts: generateThoughts('moderate'),
        content: `Interesting points. ${otherNames[messageCount % otherNames.length] || 'Anyone'}, how do you respond?`
      };
    }

    // First time speaking - state position from agenda
    if (!hasSpokenBefore) {
      // Use first key point or summarize agenda
      if (keyPoints.length > 0) {
        // Transform "You believe X" into "I believe X"
        let statement = keyPoints[0]
          .replace(/\byou\b/gi, 'I')
          .replace(/\byour\b/gi, 'my')
          .replace(/\byou're\b/gi, 'I\'m')
          .replace(/\byou've\b/gi, 'I\'ve');
        // Clean up and make it conversational
        statement = statement.charAt(0).toUpperCase() + statement.slice(1);
        if (!statement.endsWith('.') && !statement.endsWith('!') && !statement.endsWith('?')) {
          statement += '.';
        }
        return {
          type: 'message',
          thoughts: generateThoughts('opening'),
          content: statement,
          documentUpdates: generateDocumentUpdates('message', statement)
        };
      }
      // Fallback - generic opening based on role
      const openingContent = `As ${role || 'someone with a stake in this'}, I have strong views on this matter.`;
      return {
        type: 'message',
        thoughts: generateThoughts('opening'),
        content: openingContent,
        documentUpdates: generateDocumentUpdates('message', openingContent)
      };
    }

    // Respond to what was just said
    if (lastMessage && lastSpeakerName !== agentName) {
      // If low agreeability and they said something positive about an opposing view
      if (agreeability < 40 && myPreviousMessages.length < 3) {
        // Push back using another key point
        const pointIndex = myPreviousMessages.length % Math.max(1, keyPoints.length);
        if (keyPoints[pointIndex]) {
          let rebuttal = keyPoints[pointIndex]
            .replace(/\byou\b/gi, 'I')
            .replace(/\byour\b/gi, 'my');
          return {
            type: 'message',
            thoughts: generateThoughts('disagree'),
            content: `I disagree with ${lastSpeakerName}. ${rebuttal}`
          };
        }
        return {
          type: 'message',
          thoughts: generateThoughts('disagree'),
          content: `That's not how I see it, ${lastSpeakerName}. We need a completely different approach.`
        };
      }

      // Medium agreeability - engage with the point (with variety)
      if (agreeability >= 40 && agreeability < 70) {
        const engageTemplates = [
          `${lastSpeakerName} makes a fair point. However, I think we should also consider the alternatives.`,
          `I hear what ${lastSpeakerName} is saying, but there's another angle here.`,
          `That's worth considering, ${lastSpeakerName}. My concern is whether it fully addresses our goals.`,
          `${lastSpeakerName}, I appreciate that perspective. Let me add something to it.`,
          `Building on what ${lastSpeakerName} said - I think we need to balance competing priorities here.`,
          `There's merit in that view. From my standpoint though, we should weigh it against other factors.`,
          `I can see where ${lastSpeakerName} is coming from. My take is slightly different.`,
          `Good point from ${lastSpeakerName}. Let me offer a complementary perspective.`
        ];
        return {
          type: 'message',
          thoughts: generateThoughts('engage'),
          content: engageTemplates[Math.floor(Math.random() * engageTemplates.length)]
        };
      }
    }

    // Check if ready to agree/propose
    const roundsNeeded = Math.floor((100 - agreeability) / 15) + 3;

    // Make a proposal if options exist and enough discussion
    if (options.length > 0 && myPreviousMessages.length >= 1 && !lastProposal && messageCount >= 4) {
      // Find option that matches agenda keywords
      let preferredOption = options[0];
      let bestScore = 0;

      for (const opt of options) {
        const optName = opt.name.toLowerCase();
        let score = 0;
        // Check for keyword matches with agenda
        const agendaWords = lowerAgenda.split(/\s+/);
        const optWords = optName.split(/\s+/);
        for (const word of optWords) {
          if (word.length > 3 && agendaWords.some(aw => aw.includes(word) || word.includes(aw))) {
            score += 2;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          preferredOption = opt;
        }
      }

      const proposalContent = `I propose we go with ${preferredOption.name}. It aligns with what I've been saying.`;
      return {
        type: 'proposal',
        thoughts: generateThoughts('propose'),
        content: proposalContent,
        optionId: preferredOption.id,
        documentUpdates: generateDocumentUpdates('proposal', proposalContent, preferredOption.name)
      };
    }

    // Respond to a proposal
    if (lastProposal) {
      const option = options.find((o: { id: string }) => o.id === lastProposal.optionId);
      const proposer = participants.find(p => p.id === lastProposal.author);

      // Ready to accept?
      if (messageCount >= roundsNeeded && myPreviousMessages.length >= 2) {
        const optName = option?.name || 'this';
        if (agreeability < 35) {
          const acceptContent = `Fine. I'll go along with ${optName}, but I want it on record that I have reservations.`;
          return {
            type: 'accept',
            thoughts: generateThoughts('accept_reluctant'),
            content: acceptContent,
            optionId: lastProposal.optionId,
            documentUpdates: generateDocumentUpdates('accept', acceptContent, optName)
          };
        }
        if (agreeability < 60) {
          const acceptContent = `Alright, ${optName} seems like a reasonable compromise. I can support it.`;
          return {
            type: 'accept',
            thoughts: generateThoughts('accept_moderate'),
            content: acceptContent,
            optionId: lastProposal.optionId,
            documentUpdates: generateDocumentUpdates('accept', acceptContent, optName)
          };
        }
        const acceptContent = `Yes, I think ${optName} is the right choice. Let's do it.`;
        return {
          type: 'accept',
          thoughts: generateThoughts('accept_eager'),
          content: acceptContent,
          optionId: lastProposal.optionId,
          documentUpdates: generateDocumentUpdates('accept', acceptContent, optName)
        };
      }

      // Not ready - continue debate
      if (agreeability < 50) {
        return {
          type: 'message',
          thoughts: generateThoughts('pushback'),
          content: `${option?.name || 'That'} doesn't address my core concerns. ${proposer?.name || 'You'} need to consider the other side.`
        };
      }
      return {
        type: 'message',
        thoughts: generateThoughts('engage'),
        content: `${option?.name || 'That'} has merit, but I want to make sure we've thought this through.`
      };
    }

    // Continue general discussion
    if (myPreviousMessages.length < keyPoints.length) {
      const pointIndex = myPreviousMessages.length;
      let point = keyPoints[pointIndex] || '';
      if (point) {
        point = point.replace(/\byou\b/gi, 'I').replace(/\byour\b/gi, 'my');
        return {
          type: 'message',
          thoughts: generateThoughts('continue'),
          content: `Let me add: ${point}`
        };
      }
    }

    // Default - stay in character
    return {
      type: 'message',
      thoughts: generateThoughts('continue'),
      content: `I stand by my position. ${role ? `As ${role}, ` : ''}I know what I'm talking about.`
    };
  }

  // Helper: Extract option names from scenario
  function extractOptionNames(scenario: string): string[] {
    const names: string[] = [];
    const lines = scenario.split('\n');
    let inOptions = false;

    for (const line of lines) {
      // Support both RESTAURANTS: and OPTIONS: sections
      if (/^(RESTAURANTS|OPTIONS):/i.test(line.trim())) {
        inOptions = true;
        continue;
      }
      if (inOptions && /^[A-Z]/.test(line.trim()) && !line.trim().startsWith('-')) {
        inOptions = false;
      }
      if (inOptions && line.trim().startsWith('-')) {
        const match = line.match(/^-\s*([^:,]+)/);
        if (match) {
          names.push(match[1].trim());
        }
      }
    }
    return names;
  }

  // Helper: Extract all agent names from scenario text
  function extractAgentNames(scenario: string): string[] {
    const names: string[] = [];
    const regex = /AGENT:\s*(\w+)/gi;
    let match;
    while ((match = regex.exec(scenario)) !== null) {
      if (!names.includes(match[1])) {
        names.push(match[1]);
      }
    }
    return names;
  }

  // Helper: Extract agent's private agenda from scenario text
  function extractAgentAgenda(scenario: string, agentName: string): string {
    // Look for "AGENT: Name" or "AGENDA for Name" sections
    const patterns = [
      new RegExp(`AGENT:\\s*${agentName}[\\s\\S]*?AGENDA[^:]*:[\\s\\S]*?(?=AGENT:|PUBLIC|RESTAURANTS:|$)`, 'i'),
      new RegExp(`${agentName}['']?s?\\s*AGENDA[^:]*:[\\s\\S]*?(?=AGENT:|PUBLIC|RESTAURANTS:|\\n\\n[A-Z])`, 'i'),
      new RegExp(`AGENDA\\s*\\(${agentName}\\)[^:]*:[\\s\\S]*?(?=AGENDA|PUBLIC|RESTAURANTS:|$)`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = scenario.match(pattern);
      if (match) {
        return match[0].trim();
      }
    }

    // Fallback: look for lines mentioning this agent specifically
    const lines = scenario.split('\n');
    const agentLines = lines.filter(l =>
      l.toLowerCase().includes(agentName.toLowerCase()) &&
      (l.includes('AGENDA') || l.includes('agenda') || l.startsWith('-'))
    );
    if (agentLines.length > 0) {
      return agentLines.join('\n');
    }

    return '';
  }

  // Build setup prompt for AI to analyze scenario
  function buildSetupPrompt(scenario: string, caseId: string, baseUrl: string): string {
    return `SCENARIO SETUP TASK
==================

You are setting up a multi-agent negotiation/collaboration scenario. Read the scenario below and extract all the information needed to run it.

SCENARIO TEXT:
--------------
${scenario}
--------------

YOUR TASK:
Analyze this scenario and identify:
1. AGENTS - Who are the participants? What are their names, roles, and private agendas?
2. OPTIONS - What are they deciding between? (could be venues, proposals, approaches, strategies, etc.)
3. INPUT DOCUMENTS - Any reference materials, background info, or context documents
4. WORKING DOCUMENTS - Any collaborative documents they'll create together
5. TASK TYPE - Is this "options" (picking from choices), "document" (creating a deliverable), or "both"?
6. RULES - How does this resolve? What constitutes agreement?

Respond with JSON in this exact format:
{
  "setup": {
    "title": "Scenario title",
    "location": {
      "type": "hospital|office|school|library|cafe|park|studio|courtroom|outdoor",
      "name": "Display name for location (e.g., 'South Bristol Hospital - Rehab Ward')",
      "furniture": ["item_id", "item_id", ...]  // Optional: specific furniture items to place
    },
    "icon": "Emoji icon for display (e.g., 🏥 hospital, 🎬 studio, ⚖️ court, 🏢 office, 📝 document)",
    "taskType": "options" | "document" | "both",
    "maxRounds": 20,
    "agents": [
      {
        "name": "Agent Name",
        "role": "Their role/title",
        "agenda": "Their private goals and instructions (can be long)",
        "agreeability": 50,
        "appearance": {
          "accessory": "glasses|hat|bowtie|none|wheelchair|nurse_scrubs|doctor_coat|police_uniform|teacher|business_suit|healthcare_assistant|walking_stick|zimmer_frame",
          "bodyStyle": "normal|tall|short|wide",
          "color": "#hexcolor",
          "gender": "male|female"
        },
        "profile": {
          // Identity
          "dateOfBirth": "YYYY-MM-DD",
          "placeOfBirthCity": "City name",
          "placeOfBirthCountry": "Country name",
          "nationality": "Nationality",
          "sex": "male|female|other",

          // Body (REQUIRED for drawing)
          "heightCm": 170,
          "weightKg": 70,
          "build": "slim|average|athletic|stocky|heavy",
          "skinTone": "very_fair|fair|light|medium|olive|tan|brown|dark_brown|deep",
          "ageAppearance": 45,
          "posture": "upright|slouched|rigid|relaxed|hunched|confident|defensive",

          // Face (REQUIRED for drawing)
          "faceShape": "round|oval|square|heart|long|diamond|rectangular|triangular",
          "eyeColor": "brown|blue|green|hazel|gray|amber",
          "eyeShape": "almond|round|hooded|downturned|upturned|monolid|deep_set|wide_set",
          "noseShape": "straight|roman|button|upturned|hooked|wide|narrow|bulbous",
          "lipShape": "thin|full|bow_shaped|wide|downturned",
          "eyebrowShape": "straight|arched|rounded|flat|thick|thin|bushy",
          "chinShape": "pointed|rounded|square|cleft|prominent",
          "complexion": "clear|freckled|weathered|rosy|pale|ruddy|wrinkled|smooth",
          "restingExpression": "neutral|friendly|stern|tired|worried|amused|intense",

          // Hair (REQUIRED for drawing)
          "hairColor": "black|brown|blonde|red|gray|white|auburn|silver|strawberry_blonde",
          "hairStyle": "short|medium|long|bald|buzzed|curly|wavy|straight|ponytail|bun|braided|afro|undercut",
          "hairLength": "bald|very_short|short|medium|long|very_long",
          "facialHair": "none|stubble|goatee|mustache|beard|full_beard|sideburns",
          "grayPercentage": 0,

          // Accessories
          "glasses": "none|reading|prescription|round|square|rimless|cat_eye|thick_frame",
          "jewelry": ["watch", "ring", "necklace"],

          // Distinguishing features
          "distinguishingFeatures": ["Dimples when smiling", "Scar above left eye"],

          // Clothing
          "clothingStyle": "casual|business|formal|uniform|creative|sporty|bohemian|minimalist",
          "typicalOutfit": "Description of what they usually wear",

          // Voice & mannerisms
          "voiceDescription": "Deep and gravelly with a slight rasp",
          "accentDescription": "Mild Yorkshire accent",
          "mannerisms": ["Taps fingers when thinking", "Clears throat before speaking"],

          // Personality
          "backstory": "Brief overall background",
          "personalityTraits": ["trait1", "trait2", "trait3"],

          // LIFE HISTORY (Growing Up) - Creates rich character depth
          "childhoodSummary": "Brief description of their childhood",
          "childhoodLocation": "Where they grew up",
          "familyBackground": "Parents, siblings, family dynamics",
          "education": ["Primary school", "Secondary school", "University/training"],
          "careerPath": ["First job", "Career progression", "Current role"],
          "significantEvents": ["Life-changing moments", "Turning points"],
          "formativeExperiences": ["Experiences that shaped who they are"],
          "currentSituation": "Where they are in life now",
          "fears": ["What they're afraid of"],
          "desires": ["What they want in life"],
          "secrets": ["Things they don't share openly"],
          "skills": ["Abilities and talents"],
          "hobbies": ["What they do for fun"]
        }
      }
    ],
    "options": [
      { "name": "Option A", "description": "What this option means" }
    ],
    "inputDocuments": [
      { "name": "doc_name", "content": "Full document content..." }
    ],
    "workingDocuments": [
      { "name": "doc_name", "description": "What this doc is for", "template": "optional initial template" }
    ],
    "publicInfo": "Information all agents know",
    "rules": "How the case resolves"
  },
  "firstAgent": {
    "name": "Name of first agent to speak",
    "thoughts": "What they're thinking as they start",
    "message": "Their opening statement"
  }
}

LOCATION TYPES & FURNITURE:
- hospital: hospital_bed, bedside_table, nurse_station, hand_sanitizer, medical_cart, iv_stand, wheelchair, curtain_divider
- office: conference_table, office_chair, whiteboard, plant, desk, filing_cabinet, water_cooler
- library: bookshelf, reading_table, quiet_sign, armchair, magazine_rack, study_carrel
- school: blackboard, teacher_desk, student_desk, clock, globe, locker
- cafe: cafe_counter, coffee_machine, cafe_table, menu_board, hanging_light, bar_stool, pastry_case
- outdoor/park: tree, bench, lamp_post, fountain, picnic_table, flower_bed
- common (any location): window, door, bin, fire_extinguisher, notice_board, radiator

If you specify furniture, it will be placed in the scene. If omitted, defaults for the location type will be used.

IMPORTANT:
- Extract ALL agents mentioned, including moderators/facilitators
- Choose the location type that best matches the scenario setting
- Appearances should be appropriate to roles (doctors get coats, nurses get scrubs, etc.)
- Agreeability: 0=stubborn, 100=very agreeable, 50=neutral
- Include the first agent's opening message so we can start immediately
- PROFILE IS REQUIRED - Create detailed physical descriptions for character illustration:
  - Body: height, weight, build, skin tone, age appearance, posture
  - Face: shape, eye color/shape, nose, lips, eyebrows, chin, complexion, expression
  - Hair: color, style, length, facial hair, gray percentage
  - Distinguishing features: any unique traits that make them visually distinctive
- LIFE HISTORY IS RECOMMENDED - Create rich backstories for character depth:
  - Childhood and family background
  - Education and career path
  - Formative experiences and significant events
  - Current fears, desires, and secrets
  - Skills and hobbies

To submit your setup response, POST to: ${baseUrl}/api/cases/${caseId}/setup
{
  "setup": { ... },
  "firstAgent": { ... }
}`;
  }

  // Helper: Extract public info from scenario (non-agent-specific)
  function extractPublicInfo(scenario: string): string {
    const publicMatch = scenario.match(/PUBLIC[^:]*:[\s\S]*?(?=AGENT:|AGENDA|$)/i);
    if (publicMatch) {
      return publicMatch[0].trim();
    }

    // Look for SCENARIO section
    const scenarioMatch = scenario.match(/SCENARIO[^:]*:[\s\S]*?(?=AGENT:|AGENDA|PARTICIPANTS:|$)/i);
    if (scenarioMatch) {
      return scenarioMatch[0].trim();
    }

    return '';
  }

  // Helper: Extract INPUT_DOCUMENT blocks from scenario
  // Format: INPUT_DOCUMENT: name\n content... \n END_DOCUMENT
  function extractInputDocuments(scenario: string): Array<{ name: string; content: string }> {
    const documents: Array<{ name: string; content: string }> = [];
    const regex = /INPUT_DOCUMENT:\s*(\S+)\s*\n([\s\S]*?)END_DOCUMENT/gi;
    let match;
    while ((match = regex.exec(scenario)) !== null) {
      documents.push({
        name: match[1].trim(),
        content: match[2].trim()
      });
    }
    return documents;
  }

  // Helper: Extract INPUT_FILE references from scenario
  // Format: INPUT_FILE: ./path/to/file.txt
  function extractInputFiles(scenario: string): Array<{ path: string }> {
    const files: Array<{ path: string }> = [];
    const regex = /INPUT_FILE:\s*(.+)$/gim;
    let match;
    while ((match = regex.exec(scenario)) !== null) {
      files.push({
        path: match[1].trim()
      });
    }
    return files;
  }

  // Helper: Extract TASK_TYPE from scenario
  // Format: TASK_TYPE: options|document|both
  function extractTaskType(scenario: string): 'options' | 'document' | 'both' | null {
    const match = scenario.match(/TASK_TYPE:\s*(options|document|both)/i);
    if (match) {
      return match[1].toLowerCase() as 'options' | 'document' | 'both';
    }
    return null;
  }

  // Helper: Extract TASK_OUTPUT name from scenario
  // Format: TASK_OUTPUT: output_name
  function extractTaskOutput(scenario: string): string | null {
    const match = scenario.match(/TASK_OUTPUT:\s*(\S+)/i);
    return match ? match[1].trim() : null;
  }

  // Helper: Extract TASK_TEMPLATE block from scenario
  // Format: TASK_TEMPLATE:\n content... \n END_TEMPLATE
  function extractTaskTemplate(scenario: string): string | null {
    const match = scenario.match(/TASK_TEMPLATE:\s*\n([\s\S]*?)END_TEMPLATE/i);
    return match ? match[1].trim() : null;
  }

  // Helper: Extract WORKING_DOCUMENTS section from scenario
  // Format: WORKING_DOCUMENTS:\n - name: description\n - name2: description2
  function extractWorkingDocuments(scenario: string): Array<{ name: string; description: string }> {
    const documents: Array<{ name: string; description: string }> = [];
    const match = scenario.match(/WORKING_DOCUMENTS:\s*\n([\s\S]*?)(?=\n[A-Z_]+:|$)/i);
    if (match) {
      const lines = match[1].split('\n');
      for (const line of lines) {
        const itemMatch = line.match(/^\s*-\s*(\w+):\s*(.+)$/);
        if (itemMatch) {
          documents.push({
            name: itemMatch[1].trim(),
            description: itemMatch[2].trim()
          });
        }
      }
    }
    return documents;
  }

  // Helper: Extract company context from scenario
  // Format: COMPANY: <company name>
  //         BUILDING: <building name>
  //         ROOM: <room name>
  function extractCompanyContext(scenario: string): {
    companyName: string | null;
    buildingName: string | null;
    roomName: string | null;
  } {
    const companyMatch = scenario.match(/^COMPANY:\s*(.+)$/im);
    const buildingMatch = scenario.match(/^BUILDING:\s*(.+)$/im);
    const roomMatch = scenario.match(/^ROOM:\s*(.+)$/im);

    return {
      companyName: companyMatch ? companyMatch[1].trim() : null,
      buildingName: buildingMatch ? buildingMatch[1].trim() : null,
      roomName: roomMatch ? roomMatch[1].trim() : null
    };
  }

  // Helper: Extract per-case roles from scenario
  // Format: PER_CASE_ROLE: <role_type>, <access_level>
  // role_type: visitor|contractor|temp|consultant
  // access_level: full|limited|escorted
  function extractPerCaseRoles(scenario: string): Array<{
    agentName: string;
    roleType: 'visitor' | 'contractor' | 'temp' | 'consultant';
    accessLevel: 'full' | 'limited' | 'escorted';
  }> {
    const roles: Array<{
      agentName: string;
      roleType: 'visitor' | 'contractor' | 'temp' | 'consultant';
      accessLevel: 'full' | 'limited' | 'escorted';
    }> = [];

    // Find PER_CASE_ROLE within agent blocks
    const agentBlocks = scenario.matchAll(/AGENT:\s*(\w+)([\s\S]*?)(?=AGENT:|OPTIONS:|RULES:|PUBLIC|$)/gi);

    for (const block of agentBlocks) {
      const agentName = block[1];
      const agentSection = block[2];

      const roleMatch = agentSection.match(/PER_CASE_ROLE:\s*(visitor|contractor|temp|consultant)\s*,\s*(full|limited|escorted)/i);
      if (roleMatch) {
        roles.push({
          agentName,
          roleType: roleMatch[1].toLowerCase() as 'visitor' | 'contractor' | 'temp' | 'consultant',
          accessLevel: roleMatch[2].toLowerCase() as 'full' | 'limited' | 'escorted'
        });
      }
    }

    return roles;
  }

  // Helper: Extract FORM section from scenario
  // Format:
  // FORM: form_name
  // DESCRIPTION: description text
  // FIELDS:
  // - field_name (type, required): Label text
  // - field_name (type): Label text
  // - field_name (select, required): Label text [option1, option2, option3]
  // END_FORM
  function extractForm(scenario: string): {
    name: string;
    description: string;
    fields: Array<{
      name: string;
      type: 'text' | 'textarea' | 'date' | 'select' | 'checkbox';
      required: boolean;
      label: string;
      options?: string[];
    }>;
  } | null {
    const formBlockMatch = scenario.match(/FORM:\s*(\S+)\s*\n([\s\S]*?)END_FORM/i);
    if (!formBlockMatch) return null;

    const formName = formBlockMatch[1].trim();
    const formContent = formBlockMatch[2];

    // Extract description
    const descMatch = formContent.match(/DESCRIPTION:\s*(.+)/i);
    const description = descMatch ? descMatch[1].trim() : '';

    // Extract fields
    const fields: Array<{
      name: string;
      type: 'text' | 'textarea' | 'date' | 'select' | 'checkbox';
      required: boolean;
      label: string;
      options?: string[];
    }> = [];

    // Find FIELDS: section
    const fieldsMatch = formContent.match(/FIELDS:\s*\n([\s\S]*?)(?=\n[A-Z_]+:|$)/i);
    if (fieldsMatch) {
      const fieldLines = fieldsMatch[1].split('\n');
      for (const line of fieldLines) {
        // Match: - field_name (type, required): Label text [options]
        // or: - field_name (type): Label text [options]
        const fieldMatch = line.match(/^\s*-\s*(\w+)\s*\((\w+)(?:,\s*(required))?\):\s*(.+?)(?:\s*\[([^\]]+)\])?\s*$/);
        if (fieldMatch) {
          const fieldName = fieldMatch[1];
          const fieldType = fieldMatch[2].toLowerCase() as 'text' | 'textarea' | 'date' | 'select' | 'checkbox';
          const isRequired = fieldMatch[3] === 'required';
          const label = fieldMatch[4].trim();
          const optionsStr = fieldMatch[5];

          const field: {
            name: string;
            type: 'text' | 'textarea' | 'date' | 'select' | 'checkbox';
            required: boolean;
            label: string;
            options?: string[];
          } = {
            name: fieldName,
            type: fieldType,
            required: isRequired,
            label
          };

          // Parse options for select fields
          if (optionsStr) {
            field.options = optionsStr.split(',').map(opt => opt.trim());
          }

          fields.push(field);
        }
      }
    }

    return {
      name: formName,
      description,
      fields
    };
  }

  // GET /cases/:id/agent-prompt - Claude Code friendly endpoint
  // Returns a plain text prompt with full instructions
  router.get('/cases/:id/agent-prompt', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Agent Actions']
      #swagger.summary = 'Get agent prompt for specific agent'
      #swagger.description = 'Returns a plain text prompt with full instructions for a specific agent. Use this when you know which agent should respond.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.parameters['agentId'] = { in: 'query', description: 'Agent participant ID', required: true }
      #swagger.responses[200] = {
        description: 'Agent prompt',
        content: { 'text/plain': { schema: { type: 'string' } } }
      }
      #swagger.responses[400] = { description: 'Missing agentId or agent not in case' }
      #swagger.responses[404] = { description: 'Case not found' }
    */
    try {
      const agentId = req.query.agentId as string;
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      if (!agentId) {
        res.status(400).type('text/plain').send(
          `ERROR: Missing agentId parameter.\n\n` +
          `Usage: GET ${baseUrl}/api/cases/${req.params.id}/agent-prompt?agentId=person-a`
        );
        return;
      }

      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).type('text/plain').send(
          `ERROR: Case '${req.params.id}' not found.\n\n` +
          `Available cases: GET ${baseUrl}/api/cases`
        );
        return;
      }

      // Check if agent is a participant
      const participant = caseData.participants.find(p => p.id === agentId);
      if (!participant) {
        const validIds = caseData.participants.map(p => p.id).join(', ');
        res.status(400).type('text/plain').send(
          `ERROR: Agent '${agentId}' is not a participant in this case.\n\n` +
          `Valid agent IDs: ${validIds}`
        );
        return;
      }

      // Check if case is resolved
      if (caseData.status === 'resolved') {
        const selectedRest = caseData.options.find(r => r.id === caseData.selectedOptionId);
        res.type('text/plain').send(
          `CASE RESOLVED\n` +
          `=============\n\n` +
          `This negotiation has concluded.\n\n` +
          `Outcome: ${caseData.outcome}\n` +
          `${selectedRest ? `Selected Option: ${selectedRest.name}` : ''}\n` +
          `${caseData.resolutionSummary ? `Summary: ${caseData.resolutionSummary}` : ''}\n\n` +
          `No further action needed.`
        );
        return;
      }

      // Check if it's this agent's turn
      if (caseData.currentTurn !== agentId) {
        const currentParticipant = caseData.participants.find(p => p.id === caseData.currentTurn);
        res.type('text/plain').send(
          `WAITING FOR OTHER PARTICIPANT\n` +
          `=============================\n\n` +
          `It's currently ${currentParticipant?.name || caseData.currentTurn}'s turn.\n\n` +
          `Poll this URL again in a few seconds to check if it's your turn:\n` +
          `${baseUrl}/api/cases/${req.params.id}/agent-prompt?agentId=${agentId}`
        );
        return;
      }

      // Get a task (creates task ID)
      const task = taskService.getNextTask(db, req.params.id, agentId);
      if (!task) {
        res.status(500).type('text/plain').send('ERROR: Failed to create task');
        return;
      }

      // Build the prompt
      const otherParticipants = caseData.participants.filter(p => p.id !== agentId);
      const optionsList = caseData.options.map(r =>
        `  - ${r.name} (${r.category}, ${r.priceRange}) - Features: ${r.features.join(', ') || 'none listed'}`
      ).join('\n');

      const conversationHistory = caseData.messages.length > 0
        ? caseData.messages.map(m => {
            const author = caseData.participants.find(p => p.id === m.author);
            return `[${author?.name || m.author}] (${m.type}): ${m.content}`;
          }).join('\n\n')
        : '(No messages yet - you are starting the conversation)';

      // Determine if this agent has spoken before
      const agentHasSpokenBefore = caseData.messages.some(m => m.author === agentId);
      const isVeryFirstMessage = caseData.messages.length === 0;

      // Build context-appropriate instruction
      let firstMessageInstruction = '';
      if (isVeryFirstMessage) {
        firstMessageInstruction = `\n\nOPENING THE DISCUSSION: You're starting this conversation. Briefly introduce the topic and your initial position. Set the stage for the negotiation (2-3 sentences).`;
      } else if (!agentHasSpokenBefore) {
        firstMessageInstruction = `\n\nFIRST RESPONSE: Briefly acknowledge the discussion (one short sentence) then make your point. Don't repeat what's been said.`;
      }

      const bossMessages = caseData.bossMessages
        .filter(m => !m.targetAgent || m.targetAgent === agentId)
        .map(m => `  - ${m.content}`)
        .join('\n');

      const prompt = `
STATELOOP AGENT TASK
====================

You are participating in a multi-agent negotiation as "${participant.name}".

YOUR ROLE
---------
Name: ${participant.name}
Preferences: ${participant.preferences.join(', ') || 'none specified'}
Constraints: ${participant.constraints.join(', ') || 'none specified'}
${participant.isPayer ? '** You are paying for this meal **' : ''}

OTHER PARTICIPANT${otherParticipants.length > 1 ? 'S' : ''}
-----------------
${otherParticipants.map(p =>
  `${p.name}:\n  Preferences: ${p.preferences.join(', ') || 'none'}\n  Constraints: ${p.constraints.join(', ') || 'none'}${p.isPayer ? '\n  (They are paying)' : ''}`
).join('\n')}

SCENARIO
--------
${caseData.scenario}

AVAILABLE OPTIONS
-----------------
${optionsList}

CONVERSATION SO FAR
-------------------
${conversationHistory}

${bossMessages ? `MESSAGES FROM THE BOSS\n----------------------\n${bossMessages}\n` : ''}

YOUR TASK
---------
Review the conversation and respond as ${participant.name}. Consider your preferences and constraints,
but also try to find a compromise that works for everyone.
${firstMessageInstruction}

STYLE: Keep responses conversational - 2-4 sentences typically. Speak naturally like a real person.
Avoid long paragraphs or monologues. Express your personality but be concise.

RESPOND BY MAKING THIS API CALL
-------------------------------
Use curl or your HTTP tool to POST to:

  ${baseUrl}/api/cases/${req.params.id}/submit

With this JSON body:

{
  "taskId": "${task.taskId}",
  "agentId": "${agentId}",
  "response": {
    "type": "<TYPE>",
    "content": "<YOUR MESSAGE>",
    "optionId": "<OPTION ID if proposing>"
  }
}

Response types:
  - "proposal" - Suggest an option (requires optionId)
  - "counter"  - Counter-propose a different option (requires optionId)
  - "accept"   - Accept the last proposal
  - "reject"   - Reject without counter-proposal
  - "message"  - General comment or question

Option IDs: ${caseData.options.map(r => r.id).join(', ')}

EXAMPLE RESPONSE
----------------
curl -X POST "${baseUrl}/api/cases/${req.params.id}/submit" \\
  -H "Content-Type: application/json" \\
  -d '{
    "taskId": "${task.taskId}",
    "agentId": "${agentId}",
    "response": {
      "type": "proposal",
      "content": "How about we try ${caseData.options[0]?.name || 'this option'}? It seems like a good compromise!",
      "optionId": "${caseData.options[0]?.id || 'opt-1'}"
    }
  }'

Now, think about what ${participant.name} would say and make the API call!
`;

      res.type('text/plain').send(prompt.trim());
    } catch (error: any) {
      res.status(500).type('text/plain').send(`ERROR: ${error.message}`);
    }
  });

  // POST /cases/:id/set-appearance - Set agent appearance (AI-determined)
  // Creates the participant if it doesn't exist
  router.post('/cases/:id/set-appearance', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Cases']
      #swagger.summary = 'Set agent appearance'
      #swagger.description = 'Set or update an agents visual appearance. Creates the participant if it does not exist.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.responses[200] = { description: 'Appearance set successfully' }
      #swagger.responses[400] = { description: 'Missing agentName' }
      #swagger.responses[404] = { description: 'Case not found' }
    */
    try {
      const { agentName, appearance } = req.body;

      if (!agentName) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'agentName required' }
        });
        return;
      }

      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case '${req.params.id}' not found` }
        });
        return;
      }

      // Find or CREATE participant
      let participant = caseData.participants.find(
        p => p.name.toLowerCase() === agentName.toLowerCase()
      );

      const appearanceJson = JSON.stringify(appearance || {});

      if (!participant) {
        // CREATE new participant
        const participantId = `${req.params.id}-person-${caseData.participants.length}`;
        db.prepare(`
          INSERT INTO participants (id, case_id, name, preferences, constraints, is_payer)
          VALUES (?, ?, ?, ?, '[]', 0)
        `).run(participantId, req.params.id, agentName, appearanceJson);

        // Set as current turn if this is the first participant
        if (caseData.participants.length === 0) {
          db.prepare('UPDATE cases SET current_turn = ? WHERE id = ?')
            .run(participantId, req.params.id);
        }

        res.json({
          success: true,
          created: true,
          agentId: participantId,
          agentName: agentName,
          appearance: appearance || {}
        });
      } else {
        // UPDATE existing participant
        db.prepare(
          'UPDATE participants SET preferences = ? WHERE id = ?'
        ).run(appearanceJson, participant.id);

        res.json({
          success: true,
          created: false,
          agentId: participant.id,
          agentName: participant.name,
          appearance: appearance || {}
        });
      }
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /cases/:id/add-option - Add an option (AI-determined)
  router.post('/cases/:id/add-option', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Cases']
      #swagger.summary = 'Add an option to case'
      #swagger.description = 'Add a new option/choice to the case. Returns existing option if name already exists.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.responses[200] = { description: 'Option added or already exists' }
      #swagger.responses[400] = { description: 'Missing name' }
      #swagger.responses[404] = { description: 'Case not found' }
    */
    try {
      const { name, category, priceRange, features } = req.body;

      if (!name) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'name required' }
        });
        return;
      }

      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case '${req.params.id}' not found` }
        });
        return;
      }

      // Check if option already exists
      const existing = caseData.options.find(
        (o: { name: string }) => o.name.toLowerCase() === name.toLowerCase()
      );

      if (existing) {
        res.json({
          success: true,
          created: false,
          optionId: existing.id,
          name: existing.name
        });
        return;
      }

      // CREATE new option
      const optionId = `${req.params.id}-opt-${caseData.options.length + 1}`;
      db.prepare(`
        INSERT INTO options (id, case_id, name, category, price_range, features)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        optionId,
        req.params.id,
        name,
        category || 'Various',
        priceRange || '$$',
        JSON.stringify(features || [])
      );

      res.json({
        success: true,
        created: true,
        optionId,
        name
      });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /cases/:id/reset - Reset a case
  // Query params:
  //   ?full=true - Full reset: clear messages, participants, options (regenerates on next auto-play)
  //   (default)  - Soft reset: clear messages only, keep participants and options
  router.post('/cases/:id/reset', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Cases']
      #swagger.summary = 'Reset a case'
      #swagger.description = 'Reset a case to start fresh. Soft reset clears messages only. Full reset (?full=true) clears everything and regenerates on next auto-play.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.parameters['full'] = { in: 'query', description: 'Full reset including participants and options', type: 'boolean' }
      #swagger.responses[200] = { description: 'Case reset successfully' }
      #swagger.responses[404] = { description: 'Case not found' }
    */
    try {
      const caseId = req.params.id;
      const fullReset = req.query.full === 'true';
      const caseData = caseService.getCase(db, caseId);

      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case '${caseId}' not found` }
        });
        return;
      }

      // Always delete messages
      db.prepare('DELETE FROM messages WHERE case_id = ?').run(caseId);
      db.prepare('DELETE FROM boss_messages WHERE case_id = ?').run(caseId);

      const now = new Date().toISOString();

      if (fullReset) {
        // Full reset: also clear participants and options for complete regeneration
        db.prepare('DELETE FROM participants WHERE case_id = ?').run(caseId);
        db.prepare('DELETE FROM options WHERE case_id = ?').run(caseId);

        db.prepare(`
          UPDATE cases
          SET status = 'active',
              outcome = NULL,
              selected_option_id = NULL,
              resolution_summary = NULL,
              current_turn = NULL,
              updated_at = ?,
              resolved_at = NULL
          WHERE id = ?
        `).run(now, caseId);

        res.json({
          success: true,
          message: 'Full reset - case will regenerate on next auto-play',
          caseId,
          fullReset: true,
          currentTurn: null
        });
      } else {
        // Soft reset: keep participants and options, just clear messages
        const firstParticipant = caseData.participants[0];
        db.prepare(`
          UPDATE cases
          SET status = 'active',
              outcome = NULL,
              selected_option_id = NULL,
              resolution_summary = NULL,
              current_turn = ?,
              updated_at = ?,
              resolved_at = NULL
          WHERE id = ?
        `).run(firstParticipant?.id || null, now, caseId);

        res.json({
          success: true,
          message: 'Soft reset - messages cleared, setup preserved',
          caseId,
          fullReset: false,
          currentTurn: firstParticipant?.id || null
        });
      }
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /cases/:id/reopen - Reopen a resolved case to continue discussion
  router.post('/cases/:id/reopen', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Cases']
      #swagger.summary = 'Reopen a resolved case'
      #swagger.description = 'Reopen a resolved case to continue discussion. Increases MAX_ROUNDS to prevent immediate timeout. Returns immediately if case is already active.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.responses[200] = { description: 'Case reopened successfully' }
      #swagger.responses[404] = { description: 'Case not found' }
    */
    try {
      const caseId = req.params.id;
      const caseData = caseService.getCase(db, caseId);

      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case '${caseId}' not found` }
        });
        return;
      }

      if (caseData.status !== 'resolved') {
        res.json({
          success: true,
          message: 'Case is already active',
          caseId,
          status: caseData.status
        });
        return;
      }

      // Reopen the case - set to active and set turn to first non-moderator participant
      const firstAgent = caseData.participants.find(p =>
        !p.name.toLowerCase().includes('moderator')
      ) || caseData.participants[0];

      const now = new Date().toISOString();

      // Increase MAX_ROUNDS by 10 when reopening (prevents immediate timeout)
      const additionalRounds = req.body?.additionalRounds || 10;
      let updatedScenario = caseData.scenario;
      const maxRoundsMatch = caseData.scenario.match(/MAX_?ROUNDS?\s*[:=]\s*(\d+)/i);
      if (maxRoundsMatch) {
        const currentMax = parseInt(maxRoundsMatch[1], 10);
        const newMax = currentMax + additionalRounds;
        updatedScenario = caseData.scenario.replace(
          /MAX_?ROUNDS?\s*[:=]\s*\d+/i,
          `MAX_ROUNDS: ${newMax}`
        );
      } else {
        // Add MAX_ROUNDS if not present
        updatedScenario = caseData.scenario + `\n\nMAX_ROUNDS: ${20 + additionalRounds}`;
      }

      db.prepare(`
        UPDATE cases
        SET status = 'active',
            outcome = NULL,
            selected_option_id = NULL,
            resolution_summary = NULL,
            current_turn = ?,
            scenario = ?,
            updated_at = ?,
            resolved_at = NULL
        WHERE id = ?
      `).run(firstAgent?.id || caseData.currentTurn, updatedScenario, now, caseId);

      res.json({
        success: true,
        message: 'Case reopened for continued discussion',
        caseId,
        currentTurn: firstAgent?.id,
        additionalRounds,
        reason: req.body?.reason || 'Manually reopened'
      });

    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /reset - Clear all data (cases, agents, companies, logs)
  router.post('/reset', (_req: Request, res: Response) => {
    /*
      #swagger.tags = ['Admin']
      #swagger.summary = 'Clear all data'
      #swagger.description = 'Deletes all cases, agents, companies, and logs from the database. Use with caution.'
      #swagger.responses[200] = { description: 'Database cleared successfully' }
    */
    try {
      db.exec(`
        -- Case-related tables
        DELETE FROM document_edits;
        DELETE FROM case_working_documents;
        DELETE FROM case_input_documents;
        DELETE FROM case_agent_roles;
        DELETE FROM case_companies;
        DELETE FROM messages;
        DELETE FROM boss_messages;
        DELETE FROM options;
        DELETE FROM participants;
        DELETE FROM cases;

        -- Agent tables
        DELETE FROM agent_case_history;
        DELETE FROM agent_profiles;
        DELETE FROM agents;

        -- Company tables
        DELETE FROM company_employees;
        DELETE FROM company_policies;
        DELETE FROM company_rooms;
        DELETE FROM company_buildings;
        DELETE FROM companies;

        -- Logs
        DELETE FROM request_logs;
      `);
      res.json({ success: true, message: 'Database cleared (cases, agents, companies, logs)' });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /logs - Get request logs
  router.get('/logs', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Admin']
      #swagger.summary = 'Get request logs'
      #swagger.description = 'Returns paginated API request logs for debugging and monitoring.'
      #swagger.parameters['limit'] = { in: 'query', description: 'Max logs to return (default: 50)' }
      #swagger.parameters['offset'] = { in: 'query', description: 'Offset for pagination' }
      #swagger.parameters['caseId'] = { in: 'query', description: 'Filter by case ID' }
      #swagger.responses[200] = { description: 'Request logs with pagination info' }
    */
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const caseId = req.query.caseId as string | undefined;

      const result = storage.getRequestLogs(db, limit, offset, caseId);
      res.json({
        ...result,
        limit,
        offset
      });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /validate-scenario - Validate scenario text before creating a case
  router.post('/validate-scenario', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Scenarios']
      #swagger.summary = 'Validate scenario text'
      #swagger.description = 'Validates scenario text format before creating a case. Returns errors, warnings, and extracted data.'
      #swagger.responses[200] = { description: 'Validation results with extracted agents, options, etc.' }
      #swagger.responses[400] = { description: 'Missing scenario text' }
    */
    try {
      const { scenario } = req.body;

      if (!scenario || typeof scenario !== 'string') {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'scenario text is required' }
        });
        return;
      }

      const result = validateScenario(scenario, db);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /furniture - Get furniture catalog for AI setup
  router.get('/furniture', (_req: Request, res: Response) => {
    /*
      #swagger.tags = ['Scenarios']
      #swagger.summary = 'Get furniture catalog'
      #swagger.description = 'Returns the furniture catalog for location setup. Used by AI to select appropriate furniture for different location types.'
      #swagger.responses[200] = { description: 'Furniture catalog organized by location type' }
      #swagger.responses[404] = { description: 'Furniture catalog not found' }
    */
    try {
      const furniturePath = path.resolve(process.cwd(), 'public/data/furniture.json');

      if (!fs.existsSync(furniturePath)) {
        res.status(404).json({
          error: { code: 'FURNITURE_NOT_FOUND', message: 'Furniture catalog not found' }
        });
        return;
      }

      const content = fs.readFileSync(furniturePath, 'utf-8');
      const catalog = JSON.parse(content);
      res.json(catalog);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /scenarios - List all scenario files from the scenarios folder
  router.get('/scenarios', (_req: Request, res: Response) => {
    /*
      #swagger.tags = ['Scenarios']
      #swagger.summary = 'List all scenarios'
      #swagger.description = 'Returns all scenario files from the scenarios folder with metadata (name, location, agent count, etc.).'
      #swagger.responses[200] = { description: 'Array of scenario metadata' }
      #swagger.responses[404] = { description: 'Scenarios directory not found' }
    */
    try {
      const scenariosDir = path.resolve(process.cwd(), 'scenarios');

      if (!fs.existsSync(scenariosDir)) {
        res.status(404).json({
          error: { code: 'SCENARIOS_DIR_NOT_FOUND', message: 'Scenarios directory not found' }
        });
        return;
      }

      const files = fs.readdirSync(scenariosDir).filter(f => f.endsWith('.txt'));

      const scenarios = files.map(filename => {
        const filePath = path.join(scenariosDir, filename);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Extract name from SCENARIO: line
        const scenarioMatch = content.match(/^SCENARIO:\s*(.+)$/m);
        const name = scenarioMatch ? scenarioMatch[1].trim() : filename.replace('.txt', '');

        // Extract location from LOCATION: line
        const locationMatch = content.match(/^LOCATION:\s*(.+)$/m);
        const location = locationMatch ? locationMatch[1].trim() : 'Unknown';

        // Count AGENT: entries
        const agentMatches = content.match(/^AGENT:\s*\w+/gm);
        const agentCount = agentMatches ? agentMatches.length : 0;

        // Extract task type
        const taskTypeMatch = content.match(/^TASK_TYPE:\s*(\w+)/m);
        const taskType = taskTypeMatch ? taskTypeMatch[1].toLowerCase() : 'options';

        // Check for working documents
        const hasWorkingDocs = /WORKING_DOCUMENTS:/i.test(content);

        // Extract icon from ICON: tag, or let AI determine based on content
        const iconMatch = content.match(/^ICON:\s*(.+)$/m);
        let icon = iconMatch ? iconMatch[1].trim() : null;

        // If no explicit icon, AI can infer from content (for now, leave null)
        // Frontend will request AI to determine icon if needed

        return {
          name,
          filename,
          location,
          agentCount,
          taskType,
          hasWorkingDocs,
          icon
        };
      });

      res.json(scenarios);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /scenarios/:name - Get the content of a specific scenario file
  router.get('/scenarios/:name', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Scenarios']
      #swagger.summary = 'Get scenario content'
      #swagger.description = 'Returns the full text content of a specific scenario file.'
      #swagger.parameters['name'] = { description: 'Scenario filename (with or without .txt extension)' }
      #swagger.responses[200] = {
        description: 'Scenario content as plain text',
        content: { 'text/plain': { schema: { type: 'string' } } }
      }
      #swagger.responses[400] = { description: 'Invalid path' }
      #swagger.responses[404] = { description: 'Scenario not found' }
    */
    try {
      const scenariosDir = path.resolve(process.cwd(), 'scenarios');
      let filename = req.params.name;

      // Add .txt extension if not present
      if (!filename.endsWith('.txt')) {
        filename += '.txt';
      }

      const filePath = path.join(scenariosDir, filename);

      // Security check: ensure the resolved path is within the scenarios directory
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(scenariosDir))) {
        res.status(400).json({
          error: { code: 'INVALID_PATH', message: 'Invalid scenario filename' }
        });
        return;
      }

      if (!fs.existsSync(filePath)) {
        res.status(404).json({
          error: { code: 'SCENARIO_NOT_FOUND', message: `Scenario '${req.params.name}' not found` }
        });
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      res.type('text/plain').send(content);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /scenarios/:name/load - Load a scenario as a new case
  router.post('/scenarios/:name/load', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Scenarios']
      #swagger.summary = 'Load scenario as new case'
      #swagger.description = 'Creates a new case from a scenario file. This is a convenience endpoint that reads the scenario and creates a case in one step.'
      #swagger.parameters['name'] = { description: 'Scenario filename (with or without .txt extension)' }
      #swagger.responses[201] = { description: 'Case created from scenario' }
      #swagger.responses[400] = { description: 'Invalid path' }
      #swagger.responses[404] = { description: 'Scenario not found' }
    */
    try {
      const scenariosDir = path.resolve(process.cwd(), 'scenarios');
      let filename = req.params.name;

      // Add .txt extension if not present
      if (!filename.endsWith('.txt')) {
        filename += '.txt';
      }

      const filePath = path.join(scenariosDir, filename);

      // Security check: ensure the resolved path is within the scenarios directory
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(scenariosDir))) {
        res.status(400).json({
          error: { code: 'INVALID_PATH', message: 'Invalid scenario filename' }
        });
        return;
      }

      if (!fs.existsSync(filePath)) {
        res.status(404).json({
          error: { code: 'SCENARIO_NOT_FOUND', message: `Scenario '${req.params.name}' not found` }
        });
        return;
      }

      const scenarioContent = fs.readFileSync(filePath, 'utf-8');

      // Create a new case from the scenario
      const caseData = caseService.createCase(db, {
        scenario: scenarioContent,
        participants: [],
        options: []
      });
      const fullCase = caseService.getCase(db, caseData.id);

      res.status(201).json(fullCase);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /agents - List all agents from the global registry
  router.get('/agents', (_req: Request, res: Response) => {
    /*
      #swagger.tags = ['Agents']
      #swagger.summary = 'List all agents'
      #swagger.description = 'Returns all agents from the global registry with their appearance and metadata.'
      #swagger.responses[200] = { description: 'Array of agents' }
    */
    try {
      const agents = storage.getAllAgents(db);
      res.json(agents);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /agents/:name - Get a specific agent by name (supports ?include=profile)
  router.get('/agents/:name', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Agents']
      #swagger.summary = 'Get agent by name'
      #swagger.description = 'Returns a specific agent by name. Use ?include=profile to include detailed profile.'
      #swagger.parameters['name'] = { description: 'Agent name' }
      #swagger.parameters['include'] = { in: 'query', description: 'Set to "profile" to include agent profile' }
      #swagger.responses[200] = { description: 'Agent details' }
      #swagger.responses[404] = { description: 'Agent not found' }
    */
    try {
      const includeProfile = req.query.include === 'profile';

      if (includeProfile) {
        const agentWithProfile = storage.getAgentWithProfile(db, req.params.name);
        if (!agentWithProfile) {
          res.status(404).json({
            error: { code: 'AGENT_NOT_FOUND', message: `Agent '${req.params.name}' not found` }
          });
          return;
        }
        res.json(agentWithProfile);
      } else {
        const agent = storage.getAgentByName(db, req.params.name);
        if (!agent) {
          res.status(404).json({
            error: { code: 'AGENT_NOT_FOUND', message: `Agent '${req.params.name}' not found` }
          });
          return;
        }
        res.json(agent);
      }
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // DELETE /agents/:name - Delete an agent from the registry
  router.delete('/agents/:name', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Agents']
      #swagger.summary = 'Delete agent'
      #swagger.description = 'Deletes an agent from the global registry.'
      #swagger.parameters['name'] = { description: 'Agent name' }
      #swagger.responses[200] = { description: 'Agent deleted' }
      #swagger.responses[404] = { description: 'Agent not found' }
    */
    try {
      const deleted = storage.deleteAgent(db, req.params.name);
      if (!deleted) {
        res.status(404).json({
          error: { code: 'AGENT_NOT_FOUND', message: `Agent '${req.params.name}' not found` }
        });
        return;
      }
      res.json({ success: true, message: `Agent '${req.params.name}' deleted` });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ============================================
  // Agent Profile endpoints
  // ============================================

  // GET /agents/:name/profile - Get agent's profile
  router.get('/agents/:name/profile', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Agents']
      #swagger.summary = 'Get agent profile'
      #swagger.description = 'Returns the detailed profile for an agent including personality traits, backstory, etc.'
      #swagger.parameters['name'] = { description: 'Agent name' }
      #swagger.responses[200] = { description: 'Agent profile' }
      #swagger.responses[404] = { description: 'Agent or profile not found' }
    */
    try {
      const agent = storage.getAgentByName(db, req.params.name);
      if (!agent) {
        res.status(404).json({
          error: { code: 'AGENT_NOT_FOUND', message: `Agent '${req.params.name}' not found` }
        });
        return;
      }

      const profile = agentService.getAgentProfile(db, req.params.name);
      if (!profile) {
        res.status(404).json({
          error: { code: 'PROFILE_NOT_FOUND', message: `Profile for agent '${req.params.name}' not found` }
        });
        return;
      }

      res.json(profile);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // PUT /agents/:name/profile - Create or update agent's profile
  router.put('/agents/:name/profile', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Agents']
      #swagger.summary = 'Create or update agent profile'
      #swagger.description = 'Creates or updates an agents detailed profile. Use ?syncAppearance=true to update visual appearance from profile.'
      #swagger.parameters['name'] = { description: 'Agent name' }
      #swagger.parameters['syncAppearance'] = { in: 'query', description: 'Sync profile to visual appearance', type: 'boolean' }
      #swagger.responses[200] = { description: 'Profile created/updated' }
      #swagger.responses[404] = { description: 'Agent not found' }
    */
    try {
      const agent = storage.getAgentByName(db, req.params.name);
      if (!agent) {
        res.status(404).json({
          error: { code: 'AGENT_NOT_FOUND', message: `Agent '${req.params.name}' not found` }
        });
        return;
      }

      const profileData: CreateAgentProfileRequest = req.body;
      const profile = agentService.upsertAgentProfile(db, req.params.name, profileData);

      // Optionally sync to appearance
      if (req.query.syncAppearance === 'true') {
        const appearanceUpdates = agentService.syncProfileToAppearance(profile);
        const existingAppearance = agent.appearance || {};
        const mergedAppearance = { ...existingAppearance, ...appearanceUpdates };
        storage.upsertAgent(db, req.params.name, mergedAppearance, agent.agenda, agent.agreeability, agent.scenarioSource);
      }

      res.json(profile);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // DELETE /agents/:name/profile - Delete agent's profile
  router.delete('/agents/:name/profile', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Agents']
      #swagger.summary = 'Delete agent profile'
      #swagger.description = 'Deletes an agents detailed profile.'
      #swagger.parameters['name'] = { description: 'Agent name' }
      #swagger.responses[204] = { description: 'Profile deleted' }
      #swagger.responses[404] = { description: 'Agent or profile not found' }
    */
    try {
      const agent = storage.getAgentByName(db, req.params.name);
      if (!agent) {
        res.status(404).json({
          error: { code: 'AGENT_NOT_FOUND', message: `Agent '${req.params.name}' not found` }
        });
        return;
      }

      const deleted = agentService.deleteAgentProfile(db, req.params.name);
      if (!deleted) {
        res.status(404).json({
          error: { code: 'PROFILE_NOT_FOUND', message: `Profile for agent '${req.params.name}' not found` }
        });
        return;
      }

      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /agents/:name/image-prompt - Generate image prompt from profile
  router.get('/agents/:name/image-prompt', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Agents']
      #swagger.summary = 'Generate image prompt'
      #swagger.description = 'Generates an image generation prompt based on the agents profile.'
      #swagger.parameters['name'] = { description: 'Agent name' }
      #swagger.responses[200] = { description: 'Image prompt for avatar generation' }
      #swagger.responses[404] = { description: 'Agent or profile not found' }
    */
    try {
      const agent = storage.getAgentByName(db, req.params.name);
      if (!agent) {
        res.status(404).json({
          error: { code: 'AGENT_NOT_FOUND', message: `Agent '${req.params.name}' not found` }
        });
        return;
      }

      const imagePrompt = agentService.generateImagePrompt(db, req.params.name);
      if (!imagePrompt) {
        res.status(404).json({
          error: { code: 'PROFILE_NOT_FOUND', message: `Profile for agent '${req.params.name}' not found. Create a profile first.` }
        });
        return;
      }

      res.json(imagePrompt);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /agents/:name/character-description - Generate character description for prompts
  router.get('/agents/:name/character-description', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Agents']
      #swagger.summary = 'Get character description'
      #swagger.description = 'Generates a character description for use in LLM prompts.'
      #swagger.parameters['name'] = { description: 'Agent name' }
      #swagger.responses[200] = { description: 'Character description' }
      #swagger.responses[404] = { description: 'Agent or profile not found' }
    */
    try {
      const agent = storage.getAgentByName(db, req.params.name);
      if (!agent) {
        res.status(404).json({
          error: { code: 'AGENT_NOT_FOUND', message: `Agent '${req.params.name}' not found` }
        });
        return;
      }

      const description = agentService.generateCharacterDescription(db, req.params.name);
      if (!description) {
        res.status(404).json({
          error: { code: 'PROFILE_NOT_FOUND', message: `Profile for agent '${req.params.name}' not found. Create a profile first.` }
        });
        return;
      }

      // Return as plain text or JSON based on Accept header
      if (req.accepts('text/plain')) {
        res.type('text/plain').send(description);
      } else {
        res.json({ agentName: req.params.name, description });
      }
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ============================================
  // AI Setup endpoints - AI analyzes scenario and creates entities
  // ============================================

  // POST /cases/:id/agents - Create agent in case (AI can call directly)
  router.post('/cases/:id/agents', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Cases']
      #swagger.summary = 'Create agent in case'
      #swagger.description = 'Creates a new agent participant in the case. Used by AI during setup.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.responses[201] = { description: 'Agent created' }
      #swagger.responses[400] = { description: 'Missing name' }
      #swagger.responses[404] = { description: 'Case not found' }
      #swagger.responses[409] = { description: 'Agent already exists' }
    */
    try {
      const { name, role, agenda, agreeability, appearance } = req.body;

      if (!name) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'name is required' }
        });
        return;
      }

      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case '${req.params.id}' not found` }
        });
        return;
      }

      // Check if agent already exists
      const existing = caseData.participants.find(p => p.name === name);
      if (existing) {
        res.status(409).json({
          error: { code: 'AGENT_EXISTS', message: `Agent '${name}' already exists in this case` }
        });
        return;
      }

      const caseId = req.params.id;
      const participantIndex = caseData.participants.length;
      const participantId = `${caseId}-person-${participantIndex}`;

      const agentAppearance = appearance || {
        accessory: 'none',
        bodyStyle: 'normal',
        color: '#3498db',
        gender: 'male'
      };

      // Add voice if not present
      if (!agentAppearance.voice) {
        agentAppearance.voice = {
          pitch: agentAppearance.gender === 'female' ? 1.2 : 0.9,
          rate: 0.95,
          voiceType: agentAppearance.gender === 'female' ? 'female' : 'male'
        };
      }

      // Create participant
      db.prepare(`
        INSERT INTO participants (id, case_id, name, preferences, constraints, is_payer)
        VALUES (?, ?, ?, ?, '[]', 0)
      `).run(participantId, caseId, name, JSON.stringify(agentAppearance));

      // Set as current turn if first agent
      if (participantIndex === 0) {
        db.prepare('UPDATE cases SET current_turn = ? WHERE id = ?')
          .run(participantId, caseId);
      }

      // Upsert to global agents table
      const scenarioTitle = caseData.scenario.match(/SCENARIO:\s*([^\n]+)/i)?.[1]?.trim() || 'Unknown';
      storage.upsertAgent(db, name, agentAppearance, agenda || '', agreeability || 50, scenarioTitle);

      res.status(201).json({
        id: participantId,
        name,
        role,
        agenda,
        agreeability: agreeability || 50,
        appearance: agentAppearance
      });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /cases/:id/options - Create option/choice in case (AI can call directly)
  router.post('/cases/:id/options', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Cases']
      #swagger.summary = 'Create option in case'
      #swagger.description = 'Creates a new option/choice in the case. Used by AI during setup.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.responses[201] = { description: 'Option created' }
      #swagger.responses[400] = { description: 'Missing name' }
      #swagger.responses[404] = { description: 'Case not found' }
    */
    try {
      const { name, description } = req.body;

      if (!name) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'name is required' }
        });
        return;
      }

      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case '${req.params.id}' not found` }
        });
        return;
      }

      const caseId = req.params.id;
      const optionIndex = caseData.options.length + 1;
      const optionId = `${caseId}-rest-${optionIndex}`;

      db.prepare(`
        INSERT INTO options (id, case_id, name, category, price_range, features)
        VALUES (?, ?, ?, ?, '$$', ?)
      `).run(optionId, caseId, name, description || 'Option', JSON.stringify([]));

      res.status(201).json({
        id: optionId,
        name,
        description
      });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /cases/:id/setup - AI submits full setup analysis (bulk create)
  router.post('/cases/:id/setup', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Cases']
      #swagger.summary = 'AI setup case'
      #swagger.description = 'AI submits full setup analysis including agents, options, documents, and first message. This bulk-creates all entities needed for the case.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.requestBody = {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/SetupRequest' } } }
      }
      #swagger.responses[200] = { description: 'Setup complete, returns next agent prompt' }
      #swagger.responses[400] = { description: 'Validation error or case already setup' }
      #swagger.responses[404] = { description: 'Case not found' }
    */
    try {
      const { setup, firstAgent } = req.body;
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      // Validate the setup request
      const validationResult = validateSetupRequest(req.body as SetupRequest);
      if (!validationResult.valid) {
        res.status(400).json(buildValidationErrorResponse(validationResult));
        return;
      }

      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case '${req.params.id}' not found` }
        });
        return;
      }

      // Already set up?
      if (caseData.participants.length > 0) {
        res.status(400).json({
          error: { code: 'ALREADY_SETUP', message: 'Case already has agents' }
        });
        return;
      }

      const caseId = req.params.id;

      // Set task type if provided
      if (setup.taskType) {
        storage.setTaskType(db, caseId, setup.taskType);
      }

      // Set location if provided
      if (setup.location) {
        const locationType = setup.location.type || 'park';
        const locationName = setup.location.name || null;
        const locationFurniture = setup.location.furniture || null;
        storage.setLocation(db, caseId, locationType, locationName, locationFurniture);
      }

      // Create agents
      const scenarioTitle = setup.title || 'Untitled Scenario';
      for (let i = 0; i < setup.agents.length; i++) {
        const agent = setup.agents[i];
        const participantId = `${caseId}-person-${i}`;

        const appearance = agent.appearance || {
          accessory: 'none',
          bodyStyle: 'normal',
          color: '#3498db',
          gender: 'male'
        };

        // Add voice based on gender
        if (!appearance.voice) {
          appearance.voice = {
            pitch: appearance.gender === 'female' ? 1.2 : 0.9,
            rate: 0.95,
            voiceType: appearance.gender === 'female' ? 'female' : 'male'
          };
        }

        // Create participant in case with all traits
        db.prepare(`
          INSERT INTO participants (
            id, case_id, name, preferences, constraints, is_payer,
            agreeability, intelligence, patience, confidence, empathy, assertiveness,
            honesty, trust, risk_tolerance, stress_tolerance, status_awareness, energy,
            humor, personality, variability, mood, quirks, triggers,
            background, origin, speech
          )
          VALUES (?, ?, ?, ?, '[]', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          participantId,
          caseId,
          agent.name,
          JSON.stringify(appearance),
          // Core traits
          agent.agreeability || null,
          agent.intelligence || null,
          agent.patience || null,
          agent.confidence || null,
          agent.empathy || null,
          agent.assertiveness || null,
          // Additional traits
          agent.honesty || null,
          agent.trust || null,
          agent.riskTolerance || null,
          agent.stressTolerance || null,
          agent.statusAwareness || null,
          agent.energy || null,
          // Behavioral modifiers
          agent.humor || null,
          agent.personality || null,
          agent.variability || null,
          agent.mood || null,
          agent.quirks || null,
          agent.triggers || null,
          // Persona
          agent.background || null,
          agent.origin || null,
          agent.speech || null
        );

        // Set first agent as current turn
        if (i === 0) {
          db.prepare('UPDATE cases SET current_turn = ? WHERE id = ?')
            .run(participantId, caseId);
        }

        // Upsert to global agents table
        storage.upsertAgent(db, agent.name, appearance, agent.agenda, agent.agreeability || 50, scenarioTitle);

        // Create profile if provided
        if (agent.profile) {
          storage.upsertAgentProfile(db, agent.name, agent.profile);
        }

        // Record case history for this agent
        const historyId = `hist-${uuidv4().slice(0, 8)}`;
        storage.addAgentCaseHistory(
          db,
          historyId,
          agent.name,
          caseId,
          participantId,
          scenarioTitle,
          agent.role || agent.agenda?.substring(0, 100) || 'Participant'
        );
      }

      // Create options
      if (setup.options && setup.options.length > 0) {
        for (let i = 0; i < setup.options.length; i++) {
          const opt = setup.options[i];
          const optionId = `${caseId}-rest-${i + 1}`;
          db.prepare(`
            INSERT INTO options (id, case_id, name, category, price_range, features)
            VALUES (?, ?, ?, ?, '$$', ?)
          `).run(optionId, caseId, opt.name, opt.description || 'Option', JSON.stringify([]));
        }
      }

      // Create input documents
      if (setup.inputDocuments && setup.inputDocuments.length > 0) {
        for (const doc of setup.inputDocuments) {
          const docId = `idoc-${uuidv4().slice(0, 8)}`;
          storage.addInputDocument(db, docId, caseId, doc.name, doc.content, 'ai');
        }
      }

      // Create working documents
      if (setup.workingDocuments && setup.workingDocuments.length > 0) {
        for (const doc of setup.workingDocuments) {
          const docId = `wdoc-${uuidv4().slice(0, 8)}`;
          storage.createWorkingDocument(
            db,
            docId,
            caseId,
            doc.name,
            doc.template || '',
            doc.template ? 'template' : 'freeform',
            doc.template || null
          );
        }
      }

      // Store rules/public info in scenario if provided
      if (setup.publicInfo || setup.rules) {
        // These are already in the scenario, but we could store separately if needed
      }

      // If firstAgent message provided, add it
      if (firstAgent && firstAgent.message) {
        const firstParticipantId = `${caseId}-person-0`;

        // Add the first message
        const messageId = `msg-${uuidv4().slice(0, 8)}`;
        storage.addMessage(db, messageId, caseId, firstParticipantId, 'message', firstAgent.message, null, firstAgent.thoughts || null);

        // Advance turn to second agent
        caseService.advanceTurn(db, caseId);
      }

      // Return the next prompt (either first agent if no message, or second agent)
      const updatedCase = caseService.getCase(db, caseId);
      if (!updatedCase) {
        res.status(500).json({ error: { code: 'SETUP_FAILED', message: 'Failed to load case after setup' } });
        return;
      }

      // Build and return the next agent's prompt
      const prompt = buildAgentPrompt(caseId, baseUrl);
      res.type('text/plain').send(prompt || 'Setup complete. Call auto-play to continue.');
    } catch (error: any) {
      console.error('Setup error:', error);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ============================================
  // Input Document endpoints
  // ============================================

  // POST /cases/:id/input-documents - Add input document to case
  router.post('/cases/:id/input-documents', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Documents']
      #swagger.summary = 'Add input document'
      #swagger.description = 'Adds a read-only input document to the case for reference.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.responses[201] = { description: 'Document created' }
      #swagger.responses[400] = { description: 'Missing name or content' }
      #swagger.responses[404] = { description: 'Case not found' }
      #swagger.responses[409] = { description: 'Document already exists' }
    */
    try {
      const request: CreateInputDocumentRequest = req.body;

      if (!request.name || !request.content) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'name and content are required' }
        });
        return;
      }

      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case '${req.params.id}' not found` }
        });
        return;
      }

      // Check if document with this name already exists
      const existing = storage.getInputDocument(db, req.params.id, request.name);
      if (existing) {
        res.status(409).json({
          error: { code: 'DOCUMENT_EXISTS', message: `Input document '${request.name}' already exists` }
        });
        return;
      }

      const docId = `idoc-${uuidv4().slice(0, 8)}`;
      const doc = storage.addInputDocument(
        db,
        docId,
        req.params.id,
        request.name,
        request.content,
        request.source || 'api'
      );

      res.status(201).json(doc);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /cases/:id/input-documents - List all input documents
  router.get('/cases/:id/input-documents', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Documents']
      #swagger.summary = 'List input documents'
      #swagger.description = 'Lists all input (read-only) documents for the case.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.responses[200] = { description: 'List of input documents' }
      #swagger.responses[404] = { description: 'Case not found' }
    */
    try {
      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case '${req.params.id}' not found` }
        });
        return;
      }

      const documents = storage.getInputDocuments(db, req.params.id);
      res.json({
        documents: documents.map(d => ({
          id: d.id,
          name: d.name,
          content: d.content,
          contentLength: d.content.length,
          source: d.source,
          createdAt: d.createdAt
        }))
      });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /cases/:id/input-documents/:name - Get specific input document
  router.get('/cases/:id/input-documents/:name', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Documents']
      #swagger.summary = 'Get input document'
      #swagger.description = 'Returns a specific input document by name.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.parameters['name'] = { description: 'Document name' }
      #swagger.responses[200] = { description: 'Document content' }
      #swagger.responses[404] = { description: 'Document not found' }
    */
    try {
      const doc = storage.getInputDocument(db, req.params.id, req.params.name);
      if (!doc) {
        res.status(404).json({
          error: { code: 'DOCUMENT_NOT_FOUND', message: `Input document '${req.params.name}' not found` }
        });
        return;
      }

      res.json(doc);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ============================================
  // Working Document endpoints
  // ============================================

  // POST /cases/:id/documents - Create new working document
  router.post('/cases/:id/documents', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Documents']
      #swagger.summary = 'Create working document'
      #swagger.description = 'Creates a new collaborative working document that agents can edit.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.responses[201] = { description: 'Document created' }
      #swagger.responses[400] = { description: 'Missing name' }
      #swagger.responses[404] = { description: 'Case not found' }
      #swagger.responses[409] = { description: 'Document already exists' }
    */
    try {
      const request: CreateWorkingDocumentRequest = req.body;

      if (!request.name) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'name is required' }
        });
        return;
      }

      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case '${req.params.id}' not found` }
        });
        return;
      }

      // Check if document with this name already exists
      const existing = storage.getWorkingDocument(db, req.params.id, request.name);
      if (existing) {
        res.status(409).json({
          error: { code: 'DOCUMENT_EXISTS', message: `Working document '${request.name}' already exists` }
        });
        return;
      }

      const docId = `wdoc-${uuidv4().slice(0, 8)}`;
      const doc = storage.createWorkingDocument(
        db,
        docId,
        req.params.id,
        request.name,
        request.content || '',
        request.docType || 'freeform',
        request.template || null
      );

      // Record the creation in edit history
      const editId = `edit-${uuidv4().slice(0, 8)}`;
      storage.addDocumentEdit(
        db,
        editId,
        docId,
        req.params.id,
        null,
        'system',
        'create',
        null,
        request.content || ''
      );

      res.status(201).json(doc);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /cases/:id/documents - List all working documents
  router.get('/cases/:id/documents', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Documents']
      #swagger.summary = 'List working documents'
      #swagger.description = 'Lists all working (collaborative) documents for the case.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.responses[200] = { description: 'List of working documents' }
      #swagger.responses[404] = { description: 'Case not found' }
    */
    try {
      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case '${req.params.id}' not found` }
        });
        return;
      }

      const documents = storage.getWorkingDocuments(db, req.params.id);
      res.json({
        documents: documents.map(d => ({
          id: d.id,
          name: d.name,
          content: d.content,
          contentLength: d.content.length,
          docType: d.docType,
          lastEditedBy: d.lastEditedBy,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt
        }))
      });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /cases/:id/documents/:name - Get document content
  router.get('/cases/:id/documents/:name', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Documents']
      #swagger.summary = 'Get working document'
      #swagger.description = 'Returns a specific working document by name.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.parameters['name'] = { description: 'Document name' }
      #swagger.responses[200] = { description: 'Document content' }
      #swagger.responses[404] = { description: 'Document not found' }
    */
    try {
      const doc = storage.getWorkingDocument(db, req.params.id, req.params.name);
      if (!doc) {
        res.status(404).json({
          error: { code: 'DOCUMENT_NOT_FOUND', message: `Working document '${req.params.name}' not found` }
        });
        return;
      }

      res.json(doc);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // PUT /cases/:id/documents/:name - Update document (full replace)
  router.put('/cases/:id/documents/:name', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Documents']
      #swagger.summary = 'Replace document content'
      #swagger.description = 'Fully replaces the content of a working document.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.parameters['name'] = { description: 'Document name' }
      #swagger.responses[200] = { description: 'Document updated' }
      #swagger.responses[400] = { description: 'Missing content' }
      #swagger.responses[404] = { description: 'Document not found' }
    */
    try {
      const request: UpdateWorkingDocumentRequest = req.body;

      if (request.content === undefined) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'content is required' }
        });
        return;
      }

      const existingDoc = storage.getWorkingDocument(db, req.params.id, req.params.name);
      if (!existingDoc) {
        res.status(404).json({
          error: { code: 'DOCUMENT_NOT_FOUND', message: `Working document '${req.params.name}' not found` }
        });
        return;
      }

      // Record the edit
      const editId = `edit-${uuidv4().slice(0, 8)}`;
      const agentName = request.agentId ? getAgentNameFromId(db, request.agentId) : null;
      storage.addDocumentEdit(
        db,
        editId,
        existingDoc.id,
        req.params.id,
        request.agentId || null,
        agentName,
        'replace',
        existingDoc.content,
        request.content
      );

      const updatedDoc = storage.updateWorkingDocument(
        db,
        req.params.id,
        req.params.name,
        request.content,
        request.agentId || null
      );

      res.json(updatedDoc);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // PATCH /cases/:id/documents/:name - Append/prepend/section edit
  router.patch('/cases/:id/documents/:name', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Documents']
      #swagger.summary = 'Partial document update'
      #swagger.description = 'Partially updates a document (append, prepend, or replace_section).'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.parameters['name'] = { description: 'Document name' }
      #swagger.responses[200] = { description: 'Document updated' }
      #swagger.responses[400] = { description: 'Missing action or content' }
      #swagger.responses[404] = { description: 'Document not found' }
    */
    try {
      const request: PatchWorkingDocumentRequest = req.body;

      if (!request.action || !request.content) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'action and content are required' }
        });
        return;
      }

      const existingDoc = storage.getWorkingDocument(db, req.params.id, req.params.name);
      if (!existingDoc) {
        res.status(404).json({
          error: { code: 'DOCUMENT_NOT_FOUND', message: `Working document '${req.params.name}' not found` }
        });
        return;
      }

      let newContent: string;
      switch (request.action) {
        case 'append':
          newContent = existingDoc.content + request.content;
          break;
        case 'prepend':
          newContent = request.content + existingDoc.content;
          break;
        case 'replace_section':
          if (!request.section) {
            res.status(400).json({
              error: { code: 'INVALID_REQUEST', message: 'section is required for replace_section action' }
            });
            return;
          }

          // First, try literal text replacement (for HTML, code, etc.)
          if (existingDoc.content.includes(request.section)) {
            newContent = existingDoc.content.replace(request.section, request.content);
            break;
          }

          // Then, try bracket section markers like [section]...[/section]
          const sectionPattern = new RegExp(
            `(\\[${request.section}\\])([\\s\\S]*?)(\\[\\/${request.section}\\]|$)`,
            'i'
          );
          if (sectionPattern.test(existingDoc.content)) {
            newContent = existingDoc.content.replace(sectionPattern, `$1\n${request.content}\n$3`);
          } else {
            // Section doesn't exist, append it
            newContent = existingDoc.content + `\n\n[${request.section}]\n${request.content}\n[/${request.section}]`;
          }
          break;
        default:
          res.status(400).json({
            error: { code: 'INVALID_ACTION', message: `Unknown action: ${request.action}` }
          });
          return;
      }

      // Record the edit
      const editId = `edit-${uuidv4().slice(0, 8)}`;
      const agentName = request.agentId ? getAgentNameFromId(db, request.agentId) : null;
      storage.addDocumentEdit(
        db,
        editId,
        existingDoc.id,
        req.params.id,
        request.agentId || null,
        agentName,
        request.action,
        existingDoc.content,
        newContent
      );

      const updatedDoc = storage.updateWorkingDocument(
        db,
        req.params.id,
        req.params.name,
        newContent,
        request.agentId || null
      );

      res.json(updatedDoc);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /cases/:id/documents/:name/preview - Serve document content as raw HTML
  router.get('/cases/:id/documents/:name/preview', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Documents']
      #swagger.summary = 'Preview document as raw HTML'
      #swagger.description = 'Serves the document content directly as text/html, useful for previewing HTML documents in a browser tab.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.parameters['name'] = { description: 'Document name' }
      #swagger.responses[200] = { description: 'Raw document content served as HTML' }
      #swagger.responses[404] = { description: 'Document not found' }
    */
    try {
      const doc = storage.getWorkingDocument(db, req.params.id, req.params.name);
      if (!doc) {
        res.status(404).send('Document not found');
        return;
      }

      res.type('text/html').send(doc.content);
    } catch (error: any) {
      res.status(500).send('Internal error');
    }
  });

  // GET /cases/:id/documents/:name/history - Get edit history
  router.get('/cases/:id/documents/:name/history', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Documents']
      #swagger.summary = 'Get document edit history'
      #swagger.description = 'Returns the complete edit history for a working document.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.parameters['name'] = { description: 'Document name' }
      #swagger.responses[200] = { description: 'Edit history' }
      #swagger.responses[404] = { description: 'Document not found' }
    */
    try {
      const doc = storage.getWorkingDocument(db, req.params.id, req.params.name);
      if (!doc) {
        res.status(404).json({
          error: { code: 'DOCUMENT_NOT_FOUND', message: `Working document '${req.params.name}' not found` }
        });
        return;
      }

      const edits = storage.getDocumentEdits(db, doc.id);
      res.json({
        documentId: doc.id,
        documentName: doc.name,
        edits
      });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ============================================
  // Image endpoints
  // ============================================

  // POST /cases/:id/images - Create new image
  router.post('/cases/:id/images', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Images']
      #swagger.summary = 'Create image'
      #swagger.description = 'Creates a new SVG image in the case. The SVG content is validated for security.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.responses[201] = { description: 'Image created' }
      #swagger.responses[400] = { description: 'Invalid SVG or validation error' }
      #swagger.responses[404] = { description: 'Case not found' }
      #swagger.responses[409] = { description: 'Image already exists' }
    */
    try {
      const request: CreateImageRequest = req.body;

      if (!request.name || !request.content) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'name and content are required' }
        });
        return;
      }

      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case '${req.params.id}' not found` }
        });
        return;
      }

      // Validate SVG
      const validation = svgService.validateSvg(request.content);
      if (!validation.valid) {
        res.status(400).json({
          error: 'SVG_VALIDATION_ERROR',
          message: 'SVG validation failed',
          details: validation.errors,
          warnings: validation.warnings,
          hint: 'Remove blocked elements/attributes and try again'
        });
        return;
      }

      // Check if image with this name already exists
      const existing = storage.getImage(db, req.params.id, request.name);
      if (existing) {
        res.status(409).json({
          error: { code: 'IMAGE_EXISTS', message: `Image '${request.name}' already exists` }
        });
        return;
      }

      const imageId = `img-${uuidv4().slice(0, 8)}`;
      const image = storage.createImage(
        db,
        imageId,
        req.params.id,
        request.name,
        validation.sanitized!,
        request.agentId || null,
        request.prompt || null
      );

      // Record creation in history
      const editId = `edit-${uuidv4().slice(0, 8)}`;
      const agentName = request.agentId ? getAgentNameFromId(db, request.agentId) : null;
      storage.addImageEdit(
        db,
        editId,
        imageId,
        req.params.id,
        request.agentId || null,
        agentName,
        'create',
        null,
        validation.sanitized!
      );

      res.status(201).json({
        ...image,
        warnings: validation.warnings.length > 0 ? validation.warnings : undefined
      });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /cases/:id/images - List all images
  router.get('/cases/:id/images', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Images']
      #swagger.summary = 'List images'
      #swagger.description = 'Lists all images in the case.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.responses[200] = { description: 'List of images' }
      #swagger.responses[404] = { description: 'Case not found' }
    */
    try {
      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case '${req.params.id}' not found` }
        });
        return;
      }

      const images = storage.getImages(db, req.params.id);
      res.json({
        images: images.map(img => ({
          id: img.id,
          name: img.name,
          content: img.content,
          mimeType: img.mimeType,
          width: img.width,
          height: img.height,
          format: img.format,
          generatedBy: img.generatedBy,
          prompt: img.prompt,
          createdAt: img.createdAt,
          updatedAt: img.updatedAt
        }))
      });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /cases/:id/images/:name - Get image (JSON metadata + content)
  router.get('/cases/:id/images/:name', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Images']
      #swagger.summary = 'Get image'
      #swagger.description = 'Returns image metadata and content by name.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.parameters['name'] = { description: 'Image name' }
      #swagger.responses[200] = { description: 'Image data' }
      #swagger.responses[404] = { description: 'Image not found' }
    */
    try {
      const image = storage.getImage(db, req.params.id, req.params.name);
      if (!image) {
        res.status(404).json({
          error: { code: 'IMAGE_NOT_FOUND', message: `Image '${req.params.name}' not found` }
        });
        return;
      }

      res.json(image);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /cases/:id/images/:name/raw - Get raw SVG
  router.get('/cases/:id/images/:name/raw', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Images']
      #swagger.summary = 'Get raw SVG'
      #swagger.description = 'Returns raw SVG content with proper content-type.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.parameters['name'] = { description: 'Image name' }
      #swagger.responses[200] = { description: 'Raw SVG' }
      #swagger.responses[404] = { description: 'Image not found' }
    */
    try {
      const image = storage.getImage(db, req.params.id, req.params.name);
      if (!image) {
        res.status(404).json({
          error: { code: 'IMAGE_NOT_FOUND', message: `Image '${req.params.name}' not found` }
        });
        return;
      }

      res.type('image/svg+xml').send(image.content);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // PUT /cases/:id/images/:name - Replace image
  router.put('/cases/:id/images/:name', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Images']
      #swagger.summary = 'Replace image'
      #swagger.description = 'Replaces image content. The new SVG is validated.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.parameters['name'] = { description: 'Image name' }
      #swagger.responses[200] = { description: 'Image updated' }
      #swagger.responses[400] = { description: 'Invalid SVG' }
      #swagger.responses[404] = { description: 'Image not found' }
    */
    try {
      const request: UpdateImageRequest = req.body;

      if (!request.content) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'content is required' }
        });
        return;
      }

      const existing = storage.getImage(db, req.params.id, req.params.name);
      if (!existing) {
        res.status(404).json({
          error: { code: 'IMAGE_NOT_FOUND', message: `Image '${req.params.name}' not found` }
        });
        return;
      }

      // Validate new SVG
      const validation = svgService.validateSvg(request.content);
      if (!validation.valid) {
        res.status(400).json({
          error: 'SVG_VALIDATION_ERROR',
          message: 'SVG validation failed',
          details: validation.errors,
          hint: 'Remove blocked elements/attributes and try again'
        });
        return;
      }

      // Record edit history
      const editId = `edit-${uuidv4().slice(0, 8)}`;
      const agentName = request.agentId ? getAgentNameFromId(db, request.agentId) : null;
      storage.addImageEdit(
        db,
        editId,
        existing.id,
        req.params.id,
        request.agentId || null,
        agentName,
        'replace',
        existing.content,
        validation.sanitized!
      );

      const updated = storage.updateImage(
        db,
        req.params.id,
        req.params.name,
        validation.sanitized!,
        request.agentId || null
      );

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // DELETE /cases/:id/images/:name - Delete image
  router.delete('/cases/:id/images/:name', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Images']
      #swagger.summary = 'Delete image'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.parameters['name'] = { description: 'Image name' }
      #swagger.responses[204] = { description: 'Image deleted' }
      #swagger.responses[404] = { description: 'Image not found' }
    */
    try {
      const existing = storage.getImage(db, req.params.id, req.params.name);
      if (!existing) {
        res.status(404).json({
          error: { code: 'IMAGE_NOT_FOUND', message: `Image '${req.params.name}' not found` }
        });
        return;
      }

      storage.deleteImage(db, req.params.id, req.params.name);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /cases/:id/images/:name/history - Get edit history
  router.get('/cases/:id/images/:name/history', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Images']
      #swagger.summary = 'Get image history'
      #swagger.description = 'Returns the edit history for an image.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.parameters['name'] = { description: 'Image name' }
      #swagger.responses[200] = { description: 'Edit history' }
      #swagger.responses[404] = { description: 'Image not found' }
    */
    try {
      const image = storage.getImage(db, req.params.id, req.params.name);
      if (!image) {
        res.status(404).json({
          error: { code: 'IMAGE_NOT_FOUND', message: `Image '${req.params.name}' not found` }
        });
        return;
      }

      const history = storage.getImageEdits(db, image.id);
      res.json({ history });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ============================================
  // Task Output endpoints
  // ============================================

  // POST /cases/:id/output - Set final task output
  router.post('/cases/:id/output', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Cases']
      #swagger.summary = 'Set task output'
      #swagger.description = 'Sets the final output/deliverable for a document-type task.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.responses[200] = { description: 'Output set' }
      #swagger.responses[400] = { description: 'Missing content' }
      #swagger.responses[404] = { description: 'Case not found' }
    */
    try {
      const request: SetTaskOutputRequest = req.body;

      if (!request.content) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'content is required' }
        });
        return;
      }

      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case '${req.params.id}' not found` }
        });
        return;
      }

      storage.setTaskOutput(db, req.params.id, request.content);

      res.json({
        success: true,
        caseId: req.params.id,
        generatedBy: request.generatedBy || 'system',
        contentLength: request.content.length
      });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /cases/:id/output - Get task output
  router.get('/cases/:id/output', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Cases']
      #swagger.summary = 'Get task output'
      #swagger.description = 'Returns the final output/deliverable for a document-type task.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.responses[200] = { description: 'Task output' }
      #swagger.responses[404] = { description: 'Case or output not found' }
    */
    try {
      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case '${req.params.id}' not found` }
        });
        return;
      }

      if (!caseData.taskOutput) {
        res.status(404).json({
          error: { code: 'NO_OUTPUT', message: 'No task output has been set for this case' }
        });
        return;
      }

      res.json({
        caseId: req.params.id,
        taskType: caseData.taskType,
        content: caseData.taskOutput
      });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ============================================
  // Agent History endpoints
  // ============================================

  // GET /agents/:name/history - Get agent's case participation history
  router.get('/agents/:name/history', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Agents']
      #swagger.summary = 'Get agent case history'
      #swagger.description = 'Returns the history of cases this agent has participated in across all negotiations.'
      #swagger.parameters['name'] = { description: 'Agent name' }
      #swagger.responses[200] = { description: 'Agent case history' }
    */
    try {
      const history = storage.getAgentHistory(db, req.params.name);
      const totalCases = storage.getAgentHistoryCount(db, req.params.name);

      res.json({
        agentName: req.params.name,
        totalCases,
        cases: history
      });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /agents/:name/history - Log agent participation (usually called automatically)
  router.post('/agents/:name/history', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Agents']
      #swagger.summary = 'Log agent participation'
      #swagger.description = 'Records an agent participation entry. Usually called automatically when agents join cases.'
      #swagger.parameters['name'] = { description: 'Agent name' }
      #swagger.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: 'object',
              required: ['caseId', 'participantId'],
              properties: {
                caseId: { type: 'string', description: 'Case ID the agent participated in' },
                participantId: { type: 'string', description: 'Participant ID in the case' },
                scenario: { type: 'string', description: 'Brief scenario description' },
                roleSummary: { type: 'string', description: 'Summary of agent role' }
              }
            }
          }
        }
      }
      #swagger.responses[201] = { description: 'History entry created' }
      #swagger.responses[400] = { description: 'Missing required fields' }
    */
    try {
      const { caseId, participantId, scenario, roleSummary } = req.body;

      if (!caseId || !participantId) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'caseId and participantId are required' }
        });
        return;
      }

      const historyId = `hist-${uuidv4().slice(0, 8)}`;
      const entry = storage.addAgentCaseHistory(
        db,
        historyId,
        req.params.name,
        caseId,
        participantId,
        scenario || '',
        roleSummary || ''
      );

      res.status(201).json(entry);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // Helper: Get agent name from participant ID
  function getAgentNameFromId(db: Database.Database, agentId: string): string | null {
    const participant = storage.getParticipant(db, agentId);
    return participant?.name || null;
  }

  // ============================================
  // Company API Endpoints
  // ============================================

  // GET /companies - List all companies
  router.get('/companies', (_req: Request, res: Response) => {
    /*
      #swagger.tags = ['Companies']
      #swagger.summary = 'List all companies'
      #swagger.description = 'Returns a list of all registered companies/organizations.'
      #swagger.responses[200] = { description: 'List of companies' }
    */
    try {
      const companies = companyService.getAllCompanies(db);
      res.json({ companies });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /companies - Create new company
  router.post('/companies', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Companies']
      #swagger.summary = 'Create a new company'
      #swagger.description = 'Creates a new company/organization that can be used in scenarios.'
      #swagger.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', description: 'Company name' }
              }
            }
          }
        }
      }
      #swagger.responses[201] = { description: 'Company created' }
      #swagger.responses[400] = { description: 'Invalid request' }
      #swagger.responses[409] = { description: 'Company already exists' }
    */
    try {
      const request: CreateCompanyRequest = req.body;

      if (!request.name || typeof request.name !== 'string' || request.name.trim() === '') {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'name is required' }
        });
        return;
      }

      // Check for duplicate name
      const existing = companyService.getCompanyByName(db, request.name);
      if (existing) {
        res.status(409).json({
          error: { code: 'COMPANY_EXISTS', message: `Company '${request.name}' already exists` }
        });
        return;
      }

      const company = companyService.createCompany(db, request.name);
      res.status(201).json(company);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /companies/:id - Get company with relations
  router.get('/companies/:id', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Companies']
      #swagger.summary = 'Get company details'
      #swagger.description = 'Returns a company with all its related data including buildings, rooms, policies, and employees.'
      #swagger.parameters['id'] = { description: 'Company ID' }
      #swagger.responses[200] = { description: 'Company with relations' }
      #swagger.responses[404] = { description: 'Company not found' }
    */
    try {
      const company = companyService.getCompanyWithRelations(db, req.params.id);

      if (!company) {
        res.status(404).json({
          error: { code: 'COMPANY_NOT_FOUND', message: `Company with ID '${req.params.id}' not found` }
        });
        return;
      }

      res.json(company);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // PUT /companies/:id - Update company
  router.put('/companies/:id', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Companies']
      #swagger.summary = 'Update company'
      #swagger.description = 'Updates a company details such as name, industry, size, or description.'
      #swagger.parameters['id'] = { description: 'Company ID' }
      #swagger.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: '#/components/schemas/UpdateCompanyRequest' }
          }
        }
      }
      #swagger.responses[200] = { description: 'Company updated' }
      #swagger.responses[404] = { description: 'Company not found' }
    */
    try {
      const request: UpdateCompanyRequest = req.body;

      const company = companyService.updateCompany(db, req.params.id, request);
      if (!company) {
        res.status(404).json({
          error: { code: 'COMPANY_NOT_FOUND', message: `Company with ID '${req.params.id}' not found` }
        });
        return;
      }

      res.json(company);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // DELETE /companies/:id - Delete company
  router.delete('/companies/:id', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Companies']
      #swagger.summary = 'Delete company'
      #swagger.description = 'Deletes a company and all its related data (buildings, rooms, policies, employees).'
      #swagger.parameters['id'] = { description: 'Company ID' }
      #swagger.responses[204] = { description: 'Company deleted' }
      #swagger.responses[404] = { description: 'Company not found' }
    */
    try {
      const deleted = companyService.deleteCompany(db, req.params.id);
      if (!deleted) {
        res.status(404).json({
          error: { code: 'COMPANY_NOT_FOUND', message: `Company with ID '${req.params.id}' not found` }
        });
        return;
      }

      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /companies/:id/auto-play - Get company setup prompt for AI
  router.get('/companies/:id/auto-play', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Companies']
      #swagger.summary = 'Get company setup prompt'
      #swagger.description = 'Returns an AI prompt for setting up company details like buildings, rooms, policies, and employees.'
      #swagger.parameters['id'] = { description: 'Company ID' }
      #swagger.responses[200] = { description: 'Setup prompt text' }
      #swagger.responses[404] = { description: 'Company not found' }
    */
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const prompt = companyService.generateCompanySetupPrompt(db, req.params.id, baseUrl);

      if (!prompt) {
        res.status(404).json({
          error: { code: 'COMPANY_NOT_FOUND', message: `Company with ID '${req.params.id}' not found` }
        });
        return;
      }

      res.type('text/plain').send(prompt);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /companies/:id/setup - AI bulk setup
  router.post('/companies/:id/setup', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Companies']
      #swagger.summary = 'Bulk company setup'
      #swagger.description = 'AI submits bulk setup for a company including buildings, rooms, policies, and employees.'
      #swagger.parameters['id'] = { description: 'Company ID' }
      #swagger.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: '#/components/schemas/CompanySetupRequest' }
          }
        }
      }
      #swagger.responses[200] = { description: 'Setup complete' }
      #swagger.responses[400] = { description: 'Validation error' }
      #swagger.responses[404] = { description: 'Company not found' }
    */
    try {
      const company = companyService.getCompany(db, req.params.id);
      if (!company) {
        res.status(404).json({
          error: { code: 'COMPANY_NOT_FOUND', message: `Company with ID '${req.params.id}' not found` }
        });
        return;
      }

      // Validate the request
      const validationResult = validateCompanySetupRequest(req.body);
      if (!validationResult.valid) {
        res.status(400).json(buildValidationErrorResponse(validationResult));
        return;
      }

      const request: CompanySetupRequest = req.body;
      const result = companyService.setupCompany(db, req.params.id, request);

      res.json(result);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ============================================
  // Building Endpoints
  // ============================================

  // GET /companies/:id/buildings - List buildings
  router.get('/companies/:id/buildings', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Buildings']
      #swagger.summary = 'List company buildings'
      #swagger.description = 'Returns all buildings belonging to a company.'
      #swagger.parameters['id'] = { description: 'Company ID' }
      #swagger.responses[200] = { description: 'List of buildings' }
      #swagger.responses[404] = { description: 'Company not found' }
    */
    try {
      const company = companyService.getCompany(db, req.params.id);
      if (!company) {
        res.status(404).json({
          error: { code: 'COMPANY_NOT_FOUND', message: `Company with ID '${req.params.id}' not found` }
        });
        return;
      }

      const buildings = companyService.getCompanyBuildings(db, req.params.id);
      res.json({ buildings });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /companies/:id/buildings - Create building
  router.post('/companies/:id/buildings', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Buildings']
      #swagger.summary = 'Create a building'
      #swagger.description = 'Creates a new building within a company.'
      #swagger.parameters['id'] = { description: 'Company ID' }
      #swagger.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', description: 'Building name' },
                address: { type: 'string' },
                city: { type: 'string' },
                country: { type: 'string' },
                description: { type: 'string' },
                locationType: { type: 'string' },
                defaultFurniture: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      }
      #swagger.responses[201] = { description: 'Building created' }
      #swagger.responses[400] = { description: 'Invalid request' }
      #swagger.responses[404] = { description: 'Company not found' }
    */
    try {
      const company = companyService.getCompany(db, req.params.id);
      if (!company) {
        res.status(404).json({
          error: { code: 'COMPANY_NOT_FOUND', message: `Company with ID '${req.params.id}' not found` }
        });
        return;
      }

      const request: CreateBuildingRequest = req.body;
      if (!request.name || typeof request.name !== 'string' || request.name.trim() === '') {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'name is required' }
        });
        return;
      }

      const building = companyService.createBuilding(db, req.params.id, request.name, {
        address: request.address,
        city: request.city,
        country: request.country,
        description: request.description,
        locationType: request.locationType,
        defaultFurniture: request.defaultFurniture
      });

      res.status(201).json(building);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /companies/:id/buildings/:buildingId - Get building with rooms
  router.get('/companies/:id/buildings/:buildingId', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Buildings']
      #swagger.summary = 'Get building details'
      #swagger.description = 'Returns a building with all its rooms.'
      #swagger.parameters['id'] = { description: 'Company ID' }
      #swagger.parameters['buildingId'] = { description: 'Building ID' }
      #swagger.responses[200] = { description: 'Building with rooms' }
      #swagger.responses[404] = { description: 'Building not found' }
    */
    try {
      const building = companyService.getBuildingWithRooms(db, req.params.buildingId);
      if (!building || building.companyId !== req.params.id) {
        res.status(404).json({
          error: { code: 'BUILDING_NOT_FOUND', message: `Building with ID '${req.params.buildingId}' not found` }
        });
        return;
      }

      res.json(building);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // DELETE /companies/:id/buildings/:buildingId - Delete building
  router.delete('/companies/:id/buildings/:buildingId', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Buildings']
      #swagger.summary = 'Delete building'
      #swagger.description = 'Deletes a building and all its rooms.'
      #swagger.parameters['id'] = { description: 'Company ID' }
      #swagger.parameters['buildingId'] = { description: 'Building ID' }
      #swagger.responses[204] = { description: 'Building deleted' }
      #swagger.responses[404] = { description: 'Building not found' }
    */
    try {
      const building = companyService.getBuilding(db, req.params.buildingId);
      if (!building || building.companyId !== req.params.id) {
        res.status(404).json({
          error: { code: 'BUILDING_NOT_FOUND', message: `Building with ID '${req.params.buildingId}' not found` }
        });
        return;
      }

      companyService.deleteBuilding(db, req.params.buildingId);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ============================================
  // Room Endpoints
  // ============================================

  // GET /companies/:id/buildings/:buildingId/rooms - List rooms in building
  router.get('/companies/:id/buildings/:buildingId/rooms', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Rooms']
      #swagger.summary = 'List rooms in building'
      #swagger.description = 'Returns all rooms within a building.'
      #swagger.parameters['id'] = { description: 'Company ID' }
      #swagger.parameters['buildingId'] = { description: 'Building ID' }
      #swagger.responses[200] = { description: 'List of rooms' }
      #swagger.responses[404] = { description: 'Building not found' }
    */
    try {
      const building = companyService.getBuilding(db, req.params.buildingId);
      if (!building || building.companyId !== req.params.id) {
        res.status(404).json({
          error: { code: 'BUILDING_NOT_FOUND', message: `Building with ID '${req.params.buildingId}' not found` }
        });
        return;
      }

      const rooms = companyService.getBuildingRooms(db, req.params.buildingId);
      res.json({ rooms });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /companies/:id/buildings/:buildingId/rooms - Create room
  router.post('/companies/:id/buildings/:buildingId/rooms', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Rooms']
      #swagger.summary = 'Create a room'
      #swagger.description = 'Creates a new room within a building.'
      #swagger.parameters['id'] = { description: 'Company ID' }
      #swagger.parameters['buildingId'] = { description: 'Building ID' }
      #swagger.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: 'object',
              required: ['name', 'roomType'],
              properties: {
                name: { type: 'string', description: 'Room name' },
                roomType: { type: 'string', description: 'Type of room (office, meeting_room, etc.)' },
                floor: { type: 'number' },
                capacity: { type: 'number' },
                furniture: { type: 'array', items: { type: 'string' } },
                description: { type: 'string' }
              }
            }
          }
        }
      }
      #swagger.responses[201] = { description: 'Room created' }
      #swagger.responses[400] = { description: 'Invalid request' }
      #swagger.responses[404] = { description: 'Building not found' }
    */
    try {
      const building = companyService.getBuilding(db, req.params.buildingId);
      if (!building || building.companyId !== req.params.id) {
        res.status(404).json({
          error: { code: 'BUILDING_NOT_FOUND', message: `Building with ID '${req.params.buildingId}' not found` }
        });
        return;
      }

      const request: CreateRoomRequest = req.body;
      if (!request.name || typeof request.name !== 'string' || request.name.trim() === '') {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'name is required' }
        });
        return;
      }
      if (!request.roomType) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'roomType is required' }
        });
        return;
      }

      const room = companyService.createRoom(db, req.params.buildingId, req.params.id, request.name, request.roomType, {
        floor: request.floor,
        capacity: request.capacity,
        furniture: request.furniture,
        description: request.description
      });

      res.status(201).json(room);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /companies/:id/rooms/:roomId - Get room
  router.get('/companies/:id/rooms/:roomId', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Rooms']
      #swagger.summary = 'Get room details'
      #swagger.description = 'Returns room details including furniture and capacity.'
      #swagger.parameters['id'] = { description: 'Company ID' }
      #swagger.parameters['roomId'] = { description: 'Room ID' }
      #swagger.responses[200] = { description: 'Room details' }
      #swagger.responses[404] = { description: 'Room not found' }
    */
    try {
      const room = companyService.getRoom(db, req.params.roomId);
      if (!room || room.companyId !== req.params.id) {
        res.status(404).json({
          error: { code: 'ROOM_NOT_FOUND', message: `Room with ID '${req.params.roomId}' not found` }
        });
        return;
      }

      res.json(room);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // DELETE /companies/:id/rooms/:roomId - Delete room
  router.delete('/companies/:id/rooms/:roomId', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Rooms']
      #swagger.summary = 'Delete room'
      #swagger.description = 'Deletes a room from a building.'
      #swagger.parameters['id'] = { description: 'Company ID' }
      #swagger.parameters['roomId'] = { description: 'Room ID' }
      #swagger.responses[204] = { description: 'Room deleted' }
      #swagger.responses[404] = { description: 'Room not found' }
    */
    try {
      const room = companyService.getRoom(db, req.params.roomId);
      if (!room || room.companyId !== req.params.id) {
        res.status(404).json({
          error: { code: 'ROOM_NOT_FOUND', message: `Room with ID '${req.params.roomId}' not found` }
        });
        return;
      }

      companyService.deleteRoom(db, req.params.roomId);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ============================================
  // Policy Endpoints
  // ============================================

  // GET /policy-categories - List policy categories
  router.get('/policy-categories', (_req: Request, res: Response) => {
    /*
      #swagger.tags = ['Policies']
      #swagger.summary = 'List policy categories'
      #swagger.description = 'Returns all available policy categories (Leave, Conduct, Safety, etc.).'
      #swagger.responses[200] = { description: 'List of categories' }
    */
    try {
      const categories = companyService.getPolicyCategories(db);
      res.json({ categories });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /companies/:id/policies - List company policies
  router.get('/companies/:id/policies', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Policies']
      #swagger.summary = 'List company policies'
      #swagger.description = 'Returns all policies belonging to a company with their categories.'
      #swagger.parameters['id'] = { description: 'Company ID' }
      #swagger.responses[200] = { description: 'List of policies' }
      #swagger.responses[404] = { description: 'Company not found' }
    */
    try {
      const company = companyService.getCompany(db, req.params.id);
      if (!company) {
        res.status(404).json({
          error: { code: 'COMPANY_NOT_FOUND', message: `Company with ID '${req.params.id}' not found` }
        });
        return;
      }

      const policies = companyService.getCompanyPoliciesWithCategories(db, req.params.id);
      res.json({ policies });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /companies/:id/policies/:policyId - Get full policy
  router.get('/companies/:id/policies/:policyId', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Policies']
      #swagger.summary = 'Get policy details'
      #swagger.description = 'Returns full policy details including full text.'
      #swagger.parameters['id'] = { description: 'Company ID' }
      #swagger.parameters['policyId'] = { description: 'Policy ID' }
      #swagger.responses[200] = { description: 'Policy details' }
      #swagger.responses[404] = { description: 'Policy not found' }
    */
    try {
      const policy = companyService.getPolicyWithCategory(db, req.params.policyId);
      if (!policy || policy.companyId !== req.params.id) {
        res.status(404).json({
          error: { code: 'POLICY_NOT_FOUND', message: `Policy with ID '${req.params.policyId}' not found` }
        });
        return;
      }

      res.json(policy);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /companies/:id/policies - Create policy
  router.post('/companies/:id/policies', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Policies']
      #swagger.summary = 'Create a policy'
      #swagger.description = 'Creates a new HR policy for a company.'
      #swagger.parameters['id'] = { description: 'Company ID' }
      #swagger.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: 'object',
              required: ['categoryId', 'title', 'summary', 'fullText'],
              properties: {
                categoryId: { type: 'string', description: 'Policy category ID' },
                title: { type: 'string', description: 'Policy title' },
                summary: { type: 'string', description: 'Brief summary' },
                fullText: { type: 'string', description: 'Full policy text' },
                effectiveDate: { type: 'string', description: 'When policy takes effect' }
              }
            }
          }
        }
      }
      #swagger.responses[201] = { description: 'Policy created' }
      #swagger.responses[400] = { description: 'Invalid request or category not found' }
      #swagger.responses[404] = { description: 'Company not found' }
    */
    try {
      const company = companyService.getCompany(db, req.params.id);
      if (!company) {
        res.status(404).json({
          error: { code: 'COMPANY_NOT_FOUND', message: `Company with ID '${req.params.id}' not found` }
        });
        return;
      }

      const request: CreatePolicyRequest = req.body;
      if (!request.categoryId) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'categoryId is required' }
        });
        return;
      }
      if (!request.title) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'title is required' }
        });
        return;
      }
      if (!request.summary) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'summary is required' }
        });
        return;
      }
      if (!request.fullText) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'fullText is required' }
        });
        return;
      }

      // Verify category exists
      const category = companyService.getPolicyCategory(db, request.categoryId);
      if (!category) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: `Category '${request.categoryId}' not found` }
        });
        return;
      }

      const policy = companyService.createPolicy(
        db,
        req.params.id,
        request.categoryId,
        request.title,
        request.summary,
        request.fullText,
        request.effectiveDate
      );

      res.status(201).json(policy);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // DELETE /companies/:id/policies/:policyId - Delete policy
  router.delete('/companies/:id/policies/:policyId', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Policies']
      #swagger.summary = 'Delete policy'
      #swagger.description = 'Deletes a policy from a company.'
      #swagger.parameters['id'] = { description: 'Company ID' }
      #swagger.parameters['policyId'] = { description: 'Policy ID' }
      #swagger.responses[204] = { description: 'Policy deleted' }
      #swagger.responses[404] = { description: 'Policy not found' }
    */
    try {
      const policy = companyService.getPolicy(db, req.params.policyId);
      if (!policy || policy.companyId !== req.params.id) {
        res.status(404).json({
          error: { code: 'POLICY_NOT_FOUND', message: `Policy with ID '${req.params.policyId}' not found` }
        });
        return;
      }

      companyService.deletePolicy(db, req.params.policyId);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ============================================
  // Employee Endpoints
  // ============================================

  // GET /companies/:id/employees - List employees
  router.get('/companies/:id/employees', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Employees']
      #swagger.summary = 'List company employees'
      #swagger.description = 'Returns all employees belonging to a company.'
      #swagger.parameters['id'] = { description: 'Company ID' }
      #swagger.responses[200] = { description: 'List of employees' }
      #swagger.responses[404] = { description: 'Company not found' }
    */
    try {
      const company = companyService.getCompany(db, req.params.id);
      if (!company) {
        res.status(404).json({
          error: { code: 'COMPANY_NOT_FOUND', message: `Company with ID '${req.params.id}' not found` }
        });
        return;
      }

      const employees = companyService.getCompanyEmployees(db, req.params.id);
      res.json({ employees });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /companies/:id/employees - Add employee
  router.post('/companies/:id/employees', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Employees']
      #swagger.summary = 'Add an employee'
      #swagger.description = 'Adds a new employee to a company, linking an agent to a job title.'
      #swagger.parameters['id'] = { description: 'Company ID' }
      #swagger.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: 'object',
              required: ['agentName', 'jobTitle'],
              properties: {
                agentName: { type: 'string', description: 'Agent name' },
                jobTitle: { type: 'string', description: 'Job title' },
                department: { type: 'string' },
                managerAgentName: { type: 'string' },
                startDate: { type: 'string' },
                employmentType: { type: 'string' },
                officeRoomId: { type: 'string' }
              }
            }
          }
        }
      }
      #swagger.responses[201] = { description: 'Employee created' }
      #swagger.responses[400] = { description: 'Invalid request' }
      #swagger.responses[404] = { description: 'Company not found' }
    */
    try {
      const company = companyService.getCompany(db, req.params.id);
      if (!company) {
        res.status(404).json({
          error: { code: 'COMPANY_NOT_FOUND', message: `Company with ID '${req.params.id}' not found` }
        });
        return;
      }

      const request: CreateEmployeeRequest = req.body;
      if (!request.agentName) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'agentName is required' }
        });
        return;
      }
      if (!request.jobTitle) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'jobTitle is required' }
        });
        return;
      }

      const employee = companyService.createEmployee(db, req.params.id, request.agentName, request.jobTitle, {
        department: request.department,
        managerAgentName: request.managerAgentName,
        startDate: request.startDate,
        employmentType: request.employmentType,
        officeRoomId: request.officeRoomId
      });

      res.status(201).json(employee);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /agents/:name/employment - Get agent's employments across companies
  router.get('/agents/:name/employment', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Employees']
      #swagger.summary = 'Get agent employment history'
      #swagger.description = 'Returns all employment records for an agent across all companies.'
      #swagger.parameters['name'] = { description: 'Agent name' }
      #swagger.responses[200] = { description: 'Employment history' }
    */
    try {
      const employments = companyService.getAgentEmployments(db, req.params.name);
      res.json({
        agentName: req.params.name,
        employments
      });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ============================================
  // Case-Company Integration
  // ============================================

  // POST /cases/:id/company - Associate case with company
  router.post('/cases/:id/company', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Cases']
      #swagger.summary = 'Associate case with company'
      #swagger.description = 'Links a case to a company context, optionally specifying a building and room.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: 'object',
              required: ['companyId'],
              properties: {
                companyId: { type: 'string', description: 'Company ID' },
                buildingId: { type: 'string', description: 'Optional building ID' },
                roomId: { type: 'string', description: 'Optional room ID' }
              }
            }
          }
        }
      }
      #swagger.responses[200] = { description: 'Association created' }
      #swagger.responses[400] = { description: 'Invalid request or company not found' }
      #swagger.responses[404] = { description: 'Case not found' }
    */
    try {
      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case with ID '${req.params.id}' not found` }
        });
        return;
      }

      const request: AssociateCaseCompanyRequest = req.body;
      if (!request.companyId) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'companyId is required' }
        });
        return;
      }

      const company = companyService.getCompany(db, request.companyId);
      if (!company) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: `Company '${request.companyId}' not found` }
        });
        return;
      }

      // Check if already associated
      const existing = companyService.getCaseCompany(db, req.params.id);
      if (existing) {
        // Update existing association
        companyService.deleteCaseCompany(db, req.params.id);
      }

      const caseCompany = companyService.associateCaseWithCompany(
        db,
        req.params.id,
        request.companyId,
        request.buildingId,
        request.roomId
      );

      // If a room is specified, update the case location
      if (request.roomId) {
        const room = companyService.getRoom(db, request.roomId);
        const building = request.buildingId ? companyService.getBuilding(db, request.buildingId) : null;
        if (room && building) {
          storage.setLocation(db, req.params.id, building.locationType || 'office', room.name, room.furniture || []);
        }
      }

      const context = companyService.getCaseCompanyContext(db, req.params.id);

      res.json({
        caseId: req.params.id,
        company: context?.company,
        building: context?.building,
        room: context?.room
      });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /cases/:id/company - Get case company context
  router.get('/cases/:id/company', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Cases']
      #swagger.summary = 'Get case company context'
      #swagger.description = 'Returns the company, building, room, and available policies for a case.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.responses[200] = { description: 'Company context' }
      #swagger.responses[404] = { description: 'Case not found or no company association' }
    */
    try {
      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case with ID '${req.params.id}' not found` }
        });
        return;
      }

      const context = companyService.getCaseCompanyContext(db, req.params.id);
      if (!context) {
        res.status(404).json({
          error: { code: 'NO_COMPANY_CONTEXT', message: 'This case is not associated with a company' }
        });
        return;
      }

      res.json(context);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /cases/:id/policies - Get available policies for case
  router.get('/cases/:id/policies', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Cases']
      #swagger.summary = 'Get case policies'
      #swagger.description = 'Returns policies available to a case through its company association.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.responses[200] = { description: 'List of policies' }
      #swagger.responses[404] = { description: 'Case not found' }
    */
    try {
      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case with ID '${req.params.id}' not found` }
        });
        return;
      }

      const context = companyService.getCaseCompanyContext(db, req.params.id);
      if (!context) {
        res.json({ policies: [] });
        return;
      }

      res.json({ policies: context.policies });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /cases/:id/policies/:policyId - Lookup full policy for case
  router.get('/cases/:id/policies/:policyId', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Cases']
      #swagger.summary = 'Get specific policy for case'
      #swagger.description = 'Returns full policy text for a policy available to the case.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.parameters['policyId'] = { description: 'Policy ID' }
      #swagger.responses[200] = { description: 'Policy details' }
      #swagger.responses[404] = { description: 'Case, company context, or policy not found' }
    */
    try {
      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case with ID '${req.params.id}' not found` }
        });
        return;
      }

      const context = companyService.getCaseCompanyContext(db, req.params.id);
      if (!context) {
        res.status(404).json({
          error: { code: 'NO_COMPANY_CONTEXT', message: 'This case is not associated with a company' }
        });
        return;
      }

      const policy = companyService.getPolicyWithCategory(db, req.params.policyId);
      if (!policy || policy.companyId !== context.company.id) {
        res.status(404).json({
          error: { code: 'POLICY_NOT_FOUND', message: `Policy with ID '${req.params.policyId}' not found` }
        });
        return;
      }

      res.json({
        id: policy.id,
        title: policy.title,
        fullText: policy.fullText
      });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /cases/:id/agent-roles - Set per-case agent role
  router.post('/cases/:id/agent-roles', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Cases']
      #swagger.summary = 'Create per-case agent role'
      #swagger.description = 'Assigns a temporary role to a non-employee participant (visitor, contractor, etc.).'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: 'object',
              required: ['participantId', 'roleType'],
              properties: {
                participantId: { type: 'string', description: 'Participant ID' },
                roleType: { type: 'string', enum: ['visitor', 'contractor', 'temp', 'consultant'] },
                roleTitle: { type: 'string' },
                department: { type: 'string' },
                accessLevel: { type: 'string', enum: ['full', 'limited', 'escorted'] },
                notes: { type: 'string' }
              }
            }
          }
        }
      }
      #swagger.responses[201] = { description: 'Role created' }
      #swagger.responses[400] = { description: 'Invalid request or participant not found' }
      #swagger.responses[404] = { description: 'Case not found' }
    */
    try {
      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case with ID '${req.params.id}' not found` }
        });
        return;
      }

      const request: CreateCaseAgentRoleRequest = req.body;
      if (!request.participantId) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'participantId is required' }
        });
        return;
      }
      if (!request.roleType) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'roleType is required' }
        });
        return;
      }

      // Verify participant exists
      const participant = storage.getParticipant(db, request.participantId);
      if (!participant || participant.caseId !== req.params.id) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: `Participant '${request.participantId}' not found in this case` }
        });
        return;
      }

      const role = companyService.createCaseAgentRole(db, req.params.id, request.participantId, request.roleType, {
        roleTitle: request.roleTitle,
        department: request.department,
        accessLevel: request.accessLevel,
        notes: request.notes
      });

      res.status(201).json(role);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /cases/:id/agent-roles - List per-case agent roles
  router.get('/cases/:id/agent-roles', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Cases']
      #swagger.summary = 'List per-case agent roles'
      #swagger.description = 'Returns all per-case roles (visitor, contractor, etc.) assigned to participants.'
      #swagger.parameters['id'] = { description: 'Case ID' }
      #swagger.responses[200] = { description: 'List of roles' }
      #swagger.responses[404] = { description: 'Case not found' }
    */
    try {
      const caseData = caseService.getCase(db, req.params.id);
      if (!caseData) {
        res.status(404).json({
          error: { code: 'CASE_NOT_FOUND', message: `Case with ID '${req.params.id}' not found` }
        });
        return;
      }

      const roles = companyService.getCaseAgentRoles(db, req.params.id);
      res.json({ roles });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ==================== WORKFLOW ENDPOINTS ====================

  // Workflow Templates - Predefined workflow structures
  const workflowTemplates: Record<string, {
    name: string;
    description: string;
    stages: Array<{
      name: string;
      type: WorkflowStageType;
      description: string;
      expectedCaseCount?: number;
    }>;
  }> = {
    'document-review': {
      name: 'Document Review',
      description: 'Multi-stage document review with drafting, review, and approval',
      stages: [
        { name: 'drafting', type: 'solo', description: 'Initial document drafting' },
        { name: 'peer-review', type: 'collaborative', description: 'Collaborative peer review' },
        { name: 'approval', type: 'review', description: 'Final approval stage' }
      ]
    },
    'negotiation': {
      name: 'Negotiation',
      description: 'Multi-party negotiation workflow',
      stages: [
        { name: 'opening', type: 'collaborative', description: 'Initial positions and proposals' },
        { name: 'bargaining', type: 'collaborative', description: 'Active negotiation' },
        { name: 'closing', type: 'collaborative', description: 'Final agreement', expectedCaseCount: 1 }
      ]
    },
    'research': {
      name: 'Research Project',
      description: 'Research workflow with individual work and synthesis',
      stages: [
        { name: 'research', type: 'solo', description: 'Individual research tasks' },
        { name: 'synthesis', type: 'collaborative', description: 'Combine findings' },
        { name: 'review', type: 'review', description: 'Expert review' }
      ]
    }
  };

  // GET /workflow-templates - List available workflow templates
  router.get('/workflow-templates', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflows']
      #swagger.summary = 'List workflow templates'
      #swagger.description = 'Returns all available workflow templates that can be used to create workflows.'
      #swagger.responses[200] = {
        description: 'List of workflow templates',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                templates: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      description: { type: 'string' },
                      stageCount: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    */
    const templates = Object.entries(workflowTemplates).map(([id, template]) => ({
      id,
      name: template.name,
      description: template.description,
      stageCount: template.stages.length
    }));
    res.json({ templates });
  });

  // GET /workflow-templates/:name - Get specific workflow template
  router.get('/workflow-templates/:name', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflows']
      #swagger.summary = 'Get workflow template'
      #swagger.description = 'Returns details of a specific workflow template including its stages.'
      #swagger.parameters['name'] = { description: 'Template name/ID' }
      #swagger.responses[200] = { description: 'Workflow template details' }
      #swagger.responses[404] = { description: 'Template not found' }
    */
    const template = workflowTemplates[req.params.name];
    if (!template) {
      res.status(404).json({
        error: { code: 'TEMPLATE_NOT_FOUND', message: `Template '${req.params.name}' not found` }
      });
      return;
    }
    res.json({ id: req.params.name, ...template });
  });

  // GET /workflows - List all workflows
  router.get('/workflows', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflows']
      #swagger.summary = 'List all workflows'
      #swagger.description = 'Returns all workflows with their current status.'
      #swagger.parameters['status'] = {
        in: 'query',
        description: 'Filter by status',
        required: false,
        schema: { type: 'string', enum: ['pending', 'active', 'completed', 'failed'] }
      }
      #swagger.responses[200] = { description: 'List of workflows' }
    */
    try {
      let workflows = storage.getAllWorkflows(db);

      // Filter by status if provided
      const status = req.query.status as string;
      if (status) {
        workflows = workflows.filter(w => w.status === status);
      }

      res.json({ workflows });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /workflows - Create a new workflow
  router.post('/workflows', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflows']
      #swagger.summary = 'Create a workflow'
      #swagger.description = 'Creates a new workflow, optionally from a template.'
      #swagger.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', description: 'Workflow name' },
                description: { type: 'string', description: 'Workflow description' },
                templateName: { type: 'string', description: 'Template to use (optional)' },
                stages: {
                  type: 'array',
                  description: 'Custom stages (if not using template)',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      type: { type: 'string', enum: ['collaborative', 'solo', 'review'] },
                      description: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
      #swagger.responses[201] = { description: 'Workflow created' }
      #swagger.responses[400] = { description: 'Invalid request' }
    */
    try {
      const request: CreateWorkflowRequest = req.body;

      if (!request.name) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'name is required' }
        });
        return;
      }

      let stages = request.stages;

      // If template specified, use its stages
      if (request.templateName) {
        const template = workflowTemplates[request.templateName];
        if (!template) {
          res.status(400).json({
            error: { code: 'INVALID_REQUEST', message: `Template '${request.templateName}' not found` }
          });
          return;
        }
        stages = template.stages;
      }

      if (!stages || stages.length === 0) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'stages are required (or specify a templateName)' }
        });
        return;
      }

      const workflowId = `wf-${uuidv4().slice(0, 8)}`;
      const workflow = storage.createWorkflow(
        db,
        workflowId,
        request.name,
        request.description || null,
        request.templateName || null,
        stages
      );

      res.status(201).json(workflow);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /workflows/:id - Get workflow details
  router.get('/workflows/:id', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflows']
      #swagger.summary = 'Get workflow details'
      #swagger.description = 'Returns workflow with its stages and current status.'
      #swagger.parameters['id'] = { description: 'Workflow ID' }
      #swagger.responses[200] = { description: 'Workflow details with stages' }
      #swagger.responses[404] = { description: 'Workflow not found' }
    */
    try {
      const workflow = storage.getWorkflowWithStages(db, req.params.id);
      if (!workflow) {
        res.status(404).json({
          error: { code: 'WORKFLOW_NOT_FOUND', message: `Workflow '${req.params.id}' not found` }
        });
        return;
      }
      res.json(workflow);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /workflows/:id/start - Start a workflow
  router.post('/workflows/:id/start', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflows']
      #swagger.summary = 'Start a workflow'
      #swagger.description = 'Activates a pending workflow and sets its inputs.'
      #swagger.parameters['id'] = { description: 'Workflow ID' }
      #swagger.requestBody = {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                inputs: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                  description: 'Input parameters for the workflow'
                }
              }
            }
          }
        }
      }
      #swagger.responses[200] = { description: 'Workflow started' }
      #swagger.responses[400] = { description: 'Workflow cannot be started' }
      #swagger.responses[404] = { description: 'Workflow not found' }
    */
    try {
      const workflow = storage.getWorkflow(db, req.params.id);
      if (!workflow) {
        res.status(404).json({
          error: { code: 'WORKFLOW_NOT_FOUND', message: `Workflow '${req.params.id}' not found` }
        });
        return;
      }

      if (workflow.status !== 'pending') {
        res.status(400).json({
          error: { code: 'INVALID_STATE', message: `Workflow is ${workflow.status}, can only start pending workflows` }
        });
        return;
      }

      const request: StartWorkflowRequest = req.body || {};
      if (request.inputs) {
        storage.setWorkflowInputs(db, req.params.id, request.inputs);
      }

      storage.updateWorkflowStatus(db, req.params.id, 'active');

      // Activate the first stage
      const stages = storage.getWorkflowStages(db, req.params.id);
      if (stages.length > 0) {
        storage.updateWorkflowStageStatus(db, stages[0].id, 'active');
      }

      const updated = storage.getWorkflowWithStages(db, req.params.id);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /workflows/:id/stages/:stageId/complete - Complete a workflow stage
  router.post('/workflows/:id/stages/:stageId/complete', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflows']
      #swagger.summary = 'Complete a workflow stage'
      #swagger.description = 'Marks a stage as completed and advances to the next stage.'
      #swagger.parameters['id'] = { description: 'Workflow ID' }
      #swagger.parameters['stageId'] = { description: 'Stage ID' }
      #swagger.responses[200] = { description: 'Stage completed, workflow updated' }
      #swagger.responses[400] = { description: 'Stage cannot be completed' }
      #swagger.responses[404] = { description: 'Workflow or stage not found' }
    */
    try {
      const workflow = storage.getWorkflowWithStages(db, req.params.id);
      if (!workflow) {
        res.status(404).json({
          error: { code: 'WORKFLOW_NOT_FOUND', message: `Workflow '${req.params.id}' not found` }
        });
        return;
      }

      const stage = workflow.stages.find(s => s.id === req.params.stageId);
      if (!stage) {
        res.status(404).json({
          error: { code: 'STAGE_NOT_FOUND', message: `Stage '${req.params.stageId}' not found` }
        });
        return;
      }

      if (stage.status !== 'active') {
        res.status(400).json({
          error: { code: 'INVALID_STATE', message: `Stage is ${stage.status}, can only complete active stages` }
        });
        return;
      }

      // Complete current stage
      storage.updateWorkflowStageStatus(db, req.params.stageId, 'completed');

      // Find and activate next stage
      const currentIndex = workflow.stages.findIndex(s => s.id === req.params.stageId);
      if (currentIndex < workflow.stages.length - 1) {
        storage.updateWorkflowStageStatus(db, workflow.stages[currentIndex + 1].id, 'active');
        storage.updateWorkflowStatus(db, req.params.id, 'active', currentIndex + 1);
      } else {
        // Last stage completed - complete the workflow
        storage.updateWorkflowStatus(db, req.params.id, 'completed');
      }

      const updated = storage.getWorkflowWithStages(db, req.params.id);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // PUT /workflows/:id/outputs - Set workflow outputs
  router.put('/workflows/:id/outputs', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflows']
      #swagger.summary = 'Set workflow outputs'
      #swagger.description = 'Sets or updates the workflow outputs.'
      #swagger.parameters['id'] = { description: 'Workflow ID' }
      #swagger.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: { type: 'string' }
            }
          }
        }
      }
      #swagger.responses[200] = { description: 'Outputs updated' }
      #swagger.responses[404] = { description: 'Workflow not found' }
    */
    try {
      const workflow = storage.getWorkflow(db, req.params.id);
      if (!workflow) {
        res.status(404).json({
          error: { code: 'WORKFLOW_NOT_FOUND', message: `Workflow '${req.params.id}' not found` }
        });
        return;
      }

      storage.setWorkflowOutputs(db, req.params.id, req.body);

      const updated = storage.getWorkflow(db, req.params.id);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // DELETE /workflows/:id - Delete a workflow
  router.delete('/workflows/:id', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflows']
      #swagger.summary = 'Delete a workflow'
      #swagger.description = 'Deletes a workflow and all its stages.'
      #swagger.parameters['id'] = { description: 'Workflow ID' }
      #swagger.responses[204] = { description: 'Workflow deleted' }
      #swagger.responses[404] = { description: 'Workflow not found' }
    */
    try {
      const workflow = storage.getWorkflow(db, req.params.id);
      if (!workflow) {
        res.status(404).json({
          error: { code: 'WORKFLOW_NOT_FOUND', message: `Workflow '${req.params.id}' not found` }
        });
        return;
      }

      storage.deleteWorkflow(db, req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ==================== GOAL ENDPOINTS ====================

  // GET /goals - List all goals
  router.get('/goals', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Goals']
      #swagger.summary = 'List all goals'
      #swagger.description = 'Returns all goals with their current status.'
      #swagger.parameters['status'] = {
        in: 'query',
        description: 'Filter by status',
        required: false,
        schema: { type: 'string', enum: ['pending', 'planning', 'executing', 'completed', 'failed'] }
      }
      #swagger.responses[200] = { description: 'List of goals' }
    */
    try {
      let goals = storage.getAllGoals(db);

      const status = req.query.status as string;
      if (status) {
        goals = goals.filter(g => g.status === status);
      }

      res.json({ goals });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /goals - Create a new goal
  router.post('/goals', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Goals']
      #swagger.summary = 'Create a goal'
      #swagger.description = 'Creates a new high-level goal that can be decomposed into a workflow.'
      #swagger.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['description'],
              properties: {
                description: { type: 'string', description: 'Goal description' },
                context: { type: 'string', description: 'Additional context for planning' },
                constraints: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Constraints to consider'
                }
              }
            }
          }
        }
      }
      #swagger.responses[201] = { description: 'Goal created' }
      #swagger.responses[400] = { description: 'Invalid request' }
    */
    try {
      const request: CreateGoalRequest = req.body;

      if (!request.objective) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'objective is required' }
        });
        return;
      }

      if (!request.type) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'type is required' }
        });
        return;
      }

      const goalId = `goal-${uuidv4().slice(0, 8)}`;
      const goal = storage.createGoal(
        db,
        goalId,
        request.type,
        request.objective,
        request.constraints || null
      );

      res.status(201).json(goal);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /goals/:id - Get goal details
  router.get('/goals/:id', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Goals']
      #swagger.summary = 'Get goal details'
      #swagger.description = 'Returns goal with its plan and associated workflow.'
      #swagger.parameters['id'] = { description: 'Goal ID' }
      #swagger.responses[200] = { description: 'Goal details' }
      #swagger.responses[404] = { description: 'Goal not found' }
    */
    try {
      const goal = storage.getGoal(db, req.params.id);
      if (!goal) {
        res.status(404).json({
          error: { code: 'GOAL_NOT_FOUND', message: `Goal '${req.params.id}' not found` }
        });
        return;
      }

      // If goal has a workflow, include it
      let workflow = null;
      if (goal.workflowId) {
        workflow = storage.getWorkflowWithStages(db, goal.workflowId);
      }

      res.json({ ...goal, workflow });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // PUT /goals/:id/plan - Set goal plan
  router.put('/goals/:id/plan', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Goals']
      #swagger.summary = 'Set goal plan'
      #swagger.description = 'Sets the execution plan for a goal.'
      #swagger.parameters['id'] = { description: 'Goal ID' }
      #swagger.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['steps'],
              properties: {
                steps: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      description: { type: 'string' },
                      type: { type: 'string', enum: ['collaborative', 'solo', 'review'] },
                      agentCount: { type: 'number' }
                    }
                  }
                },
                estimatedDuration: { type: 'string' },
                risks: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      }
      #swagger.responses[200] = { description: 'Plan set' }
      #swagger.responses[404] = { description: 'Goal not found' }
    */
    try {
      const goal = storage.getGoal(db, req.params.id);
      if (!goal) {
        res.status(404).json({
          error: { code: 'GOAL_NOT_FOUND', message: `Goal '${req.params.id}' not found` }
        });
        return;
      }

      storage.setGoalPlan(db, req.params.id, req.body);
      storage.updateGoalStatus(db, req.params.id, 'planning');

      const updated = storage.getGoal(db, req.params.id);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /goals/:id/execute - Execute goal (create workflow from plan)
  router.post('/goals/:id/execute', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Goals']
      #swagger.summary = 'Execute goal'
      #swagger.description = 'Creates a workflow from the goal plan and starts execution.'
      #swagger.parameters['id'] = { description: 'Goal ID' }
      #swagger.responses[200] = { description: 'Workflow created and started' }
      #swagger.responses[400] = { description: 'Goal has no plan or already executing' }
      #swagger.responses[404] = { description: 'Goal not found' }
    */
    try {
      const goal = storage.getGoal(db, req.params.id);
      if (!goal) {
        res.status(404).json({
          error: { code: 'GOAL_NOT_FOUND', message: `Goal '${req.params.id}' not found` }
        });
        return;
      }

      if (!goal.plan) {
        res.status(400).json({
          error: { code: 'INVALID_STATE', message: 'Goal has no plan. Set a plan first.' }
        });
        return;
      }

      if (goal.workflowId) {
        res.status(400).json({
          error: { code: 'INVALID_STATE', message: 'Goal already has a workflow' }
        });
        return;
      }

      // Create workflow from plan
      const workflowStages = goal.plan.phases.map(phase => ({
        name: phase.name,
        type: phase.type,
        description: phase.description,
        agentCount: phase.agentCount
      }));

      const workflowId = `wf-${uuidv4().slice(0, 8)}`;
      const workflow = storage.createWorkflow(
        db,
        workflowId,
        `Goal: ${goal.objective.slice(0, 50)}`,
        `Workflow for goal: ${goal.objective}`,
        null,
        workflowStages
      );

      // Link workflow to goal
      storage.setGoalWorkflow(db, req.params.id, workflow.id);
      storage.updateGoalStatus(db, req.params.id, 'executing');

      // Start the workflow
      storage.updateWorkflowStatus(db, workflow.id, 'active');
      const createdStages = storage.getWorkflowStages(db, workflow.id);
      if (createdStages.length > 0) {
        storage.updateWorkflowStageStatus(db, createdStages[0].id, 'active');
      }

      const updatedGoal = storage.getGoal(db, req.params.id);
      const updatedWorkflow = storage.getWorkflowWithStages(db, workflow.id);

      res.json({ goal: updatedGoal, workflow: updatedWorkflow });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // PUT /goals/:id/output - Set goal output
  router.put('/goals/:id/output', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Goals']
      #swagger.summary = 'Set goal output'
      #swagger.description = 'Sets the final output/result of the goal.'
      #swagger.parameters['id'] = { description: 'Goal ID' }
      #swagger.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['output'],
              properties: {
                output: { type: 'string', description: 'Goal output/result' }
              }
            }
          }
        }
      }
      #swagger.responses[200] = { description: 'Output set' }
      #swagger.responses[404] = { description: 'Goal not found' }
    */
    try {
      const goal = storage.getGoal(db, req.params.id);
      if (!goal) {
        res.status(404).json({
          error: { code: 'GOAL_NOT_FOUND', message: `Goal '${req.params.id}' not found` }
        });
        return;
      }

      storage.setGoalOutput(db, req.params.id, req.body.output);
      storage.updateGoalStatus(db, req.params.id, 'completed');

      const updated = storage.getGoal(db, req.params.id);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // DELETE /goals/:id - Delete a goal
  router.delete('/goals/:id', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Goals']
      #swagger.summary = 'Delete a goal'
      #swagger.description = 'Deletes a goal. Associated workflow is not deleted.'
      #swagger.parameters['id'] = { description: 'Goal ID' }
      #swagger.responses[204] = { description: 'Goal deleted' }
      #swagger.responses[404] = { description: 'Goal not found' }
    */
    try {
      const goal = storage.getGoal(db, req.params.id);
      if (!goal) {
        res.status(404).json({
          error: { code: 'GOAL_NOT_FOUND', message: `Goal '${req.params.id}' not found` }
        });
        return;
      }

      storage.deleteGoal(db, req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ==================== WORKFLOW DESIGNER ENDPOINTS ====================

  // GET /workflow-designs - List all workflow designs
  router.get('/workflow-designs', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflow Designer']
      #swagger.summary = 'List all workflow designs'
      #swagger.description = 'Returns all workflow designs with their status.'
      #swagger.responses[200] = { description: 'List of workflow designs' }
    */
    try {
      const designs = workflowDesignService.getAllWorkflowDesigns(db);
      res.json({ designs });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /workflow-designs - Create a new workflow design
  router.post('/workflow-designs', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflow Designer']
      #swagger.summary = 'Create a workflow design'
      #swagger.description = 'Creates a new workflow design for the visual workflow designer.'
      #swagger.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', description: 'Workflow name' },
                description: { type: 'string', description: 'Workflow description' }
              }
            }
          }
        }
      }
      #swagger.responses[201] = { description: 'Workflow design created' }
      #swagger.responses[400] = { description: 'Invalid request' }
    */
    try {
      if (!req.body.name) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'name is required' }
        });
        return;
      }

      const design = workflowDesignService.createWorkflowDesign(db, {
        name: req.body.name,
        description: req.body.description
      });

      res.status(201).json(design);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // GET /workflow-designs/:id - Get workflow design with nodes and edges
  router.get('/workflow-designs/:id', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflow Designer']
      #swagger.summary = 'Get workflow design'
      #swagger.description = 'Returns a workflow design with all its nodes and edges.'
      #swagger.parameters['id'] = { description: 'Workflow Design ID' }
      #swagger.responses[200] = { description: 'Workflow design with nodes and edges' }
      #swagger.responses[404] = { description: 'Workflow design not found' }
    */
    try {
      const design = workflowDesignService.getWorkflowDesign(db, req.params.id);
      if (!design) {
        res.status(404).json({
          error: { code: 'WORKFLOW_DESIGN_NOT_FOUND', message: `Workflow design '${req.params.id}' not found` }
        });
        return;
      }

      res.json(design);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // PUT /workflow-designs/:id - Update workflow design
  router.put('/workflow-designs/:id', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflow Designer']
      #swagger.summary = 'Update workflow design'
      #swagger.description = 'Updates the name, description, or canvas state of a workflow design.'
      #swagger.parameters['id'] = { description: 'Workflow Design ID' }
      #swagger.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                canvasState: {
                  type: 'object',
                  properties: {
                    panX: { type: 'number' },
                    panY: { type: 'number' },
                    zoom: { type: 'number' }
                  }
                }
              }
            }
          }
        }
      }
      #swagger.responses[200] = { description: 'Workflow design updated' }
      #swagger.responses[404] = { description: 'Workflow design not found' }
    */
    try {
      const design = workflowDesignService.updateWorkflowDesign(db, req.params.id, req.body);
      if (!design) {
        res.status(404).json({
          error: { code: 'WORKFLOW_DESIGN_NOT_FOUND', message: `Workflow design '${req.params.id}' not found` }
        });
        return;
      }

      res.json(design);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // DELETE /workflow-designs/:id - Delete workflow design
  router.delete('/workflow-designs/:id', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflow Designer']
      #swagger.summary = 'Delete workflow design'
      #swagger.description = 'Deletes a workflow design and all its nodes and edges.'
      #swagger.parameters['id'] = { description: 'Workflow Design ID' }
      #swagger.responses[204] = { description: 'Workflow design deleted' }
      #swagger.responses[404] = { description: 'Workflow design not found' }
    */
    try {
      const result = workflowDesignService.deleteWorkflowDesign(db, req.params.id);
      if (!result) {
        res.status(404).json({
          error: { code: 'WORKFLOW_DESIGN_NOT_FOUND', message: `Workflow design '${req.params.id}' not found` }
        });
        return;
      }

      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /workflow-designs/:id/nodes - Add a node to workflow design
  router.post('/workflow-designs/:id/nodes', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflow Designer']
      #swagger.summary = 'Add node to workflow'
      #swagger.description = 'Adds a new scenario node to the workflow design. Maximum 5 nodes per workflow.'
      #swagger.parameters['id'] = { description: 'Workflow Design ID' }
      #swagger.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['scenarioName', 'positionX', 'positionY'],
              properties: {
                scenarioName: { type: 'string', description: 'Name of the scenario file' },
                label: { type: 'string', description: 'Display label for the node' },
                positionX: { type: 'number', description: 'X position on canvas' },
                positionY: { type: 'number', description: 'Y position on canvas' }
              }
            }
          }
        }
      }
      #swagger.responses[201] = { description: 'Node added' }
      #swagger.responses[400] = { description: 'Invalid request or max nodes reached' }
      #swagger.responses[404] = { description: 'Workflow design not found' }
    */
    try {
      if (!req.body.scenarioName || req.body.positionX === undefined || req.body.positionY === undefined) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'scenarioName, positionX, and positionY are required' }
        });
        return;
      }

      const node = workflowDesignService.addNode(db, req.params.id, {
        scenarioName: req.body.scenarioName,
        label: req.body.label,
        positionX: req.body.positionX,
        positionY: req.body.positionY
      });

      res.status(201).json(node);
    } catch (error: any) {
      if (error.message === 'WORKFLOW_NOT_FOUND') {
        res.status(404).json({
          error: { code: 'WORKFLOW_DESIGN_NOT_FOUND', message: `Workflow design '${req.params.id}' not found` }
        });
      } else if (error.message === 'MAX_NODES_REACHED') {
        res.status(400).json({
          error: { code: 'MAX_NODES_REACHED', message: 'Maximum of 5 nodes per workflow' }
        });
      } else {
        res.status(500).json({
          error: { code: 'INTERNAL_ERROR', message: error.message }
        });
      }
    }
  });

  // PUT /workflow-designs/:id/nodes/:nid - Update a node
  router.put('/workflow-designs/:id/nodes/:nid', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflow Designer']
      #swagger.summary = 'Update node'
      #swagger.description = 'Updates the position or label of a node.'
      #swagger.parameters['id'] = { description: 'Workflow Design ID' }
      #swagger.parameters['nid'] = { description: 'Node ID' }
      #swagger.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                positionX: { type: 'number' },
                positionY: { type: 'number' }
              }
            }
          }
        }
      }
      #swagger.responses[200] = { description: 'Node updated' }
      #swagger.responses[404] = { description: 'Node not found' }
    */
    try {
      const node = workflowDesignService.updateNode(db, req.params.nid, req.body);
      if (!node) {
        res.status(404).json({
          error: { code: 'NODE_NOT_FOUND', message: `Node '${req.params.nid}' not found` }
        });
        return;
      }

      res.json(node);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // DELETE /workflow-designs/:id/nodes/:nid - Remove a node
  router.delete('/workflow-designs/:id/nodes/:nid', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflow Designer']
      #swagger.summary = 'Remove node'
      #swagger.description = 'Removes a node and all connected edges from the workflow.'
      #swagger.parameters['id'] = { description: 'Workflow Design ID' }
      #swagger.parameters['nid'] = { description: 'Node ID' }
      #swagger.responses[204] = { description: 'Node removed' }
      #swagger.responses[404] = { description: 'Node not found' }
    */
    try {
      const result = workflowDesignService.removeNode(db, req.params.nid);
      if (!result) {
        res.status(404).json({
          error: { code: 'NODE_NOT_FOUND', message: `Node '${req.params.nid}' not found` }
        });
        return;
      }

      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /workflow-designs/:id/edges - Create an edge between nodes
  router.post('/workflow-designs/:id/edges', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflow Designer']
      #swagger.summary = 'Create edge'
      #swagger.description = 'Creates an edge connecting two nodes in the workflow.'
      #swagger.parameters['id'] = { description: 'Workflow Design ID' }
      #swagger.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['sourceNodeId', 'targetNodeId'],
              properties: {
                sourceNodeId: { type: 'string', description: 'ID of the source node' },
                targetNodeId: { type: 'string', description: 'ID of the target node' },
                documentMapping: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      source: { type: 'string' },
                      target: { type: 'string' }
                    }
                  },
                  description: 'Document mappings between nodes'
                }
              }
            }
          }
        }
      }
      #swagger.responses[201] = { description: 'Edge created' }
      #swagger.responses[400] = { description: 'Invalid request' }
      #swagger.responses[404] = { description: 'Workflow or node not found' }
    */
    try {
      if (!req.body.sourceNodeId || !req.body.targetNodeId) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'sourceNodeId and targetNodeId are required' }
        });
        return;
      }

      const edge = workflowDesignService.addEdge(db, req.params.id, {
        sourceNodeId: req.body.sourceNodeId,
        targetNodeId: req.body.targetNodeId,
        documentMapping: req.body.documentMapping
      });

      res.status(201).json(edge);
    } catch (error: any) {
      if (error.message === 'WORKFLOW_NOT_FOUND') {
        res.status(404).json({
          error: { code: 'WORKFLOW_DESIGN_NOT_FOUND', message: `Workflow design '${req.params.id}' not found` }
        });
      } else if (error.message === 'NODE_NOT_IN_WORKFLOW') {
        res.status(400).json({
          error: { code: 'NODE_NOT_IN_WORKFLOW', message: 'One or both nodes do not belong to this workflow' }
        });
      } else if (error.message === 'SELF_LOOP') {
        res.status(400).json({
          error: { code: 'SELF_LOOP', message: 'Cannot create an edge from a node to itself' }
        });
      } else if (error.message === 'EDGE_EXISTS') {
        res.status(400).json({
          error: { code: 'EDGE_EXISTS', message: 'An edge between these nodes already exists' }
        });
      } else {
        res.status(500).json({
          error: { code: 'INTERNAL_ERROR', message: error.message }
        });
      }
    }
  });

  // DELETE /workflow-designs/:id/edges/:eid - Remove an edge
  router.delete('/workflow-designs/:id/edges/:eid', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflow Designer']
      #swagger.summary = 'Remove edge'
      #swagger.description = 'Removes an edge from the workflow.'
      #swagger.parameters['id'] = { description: 'Workflow Design ID' }
      #swagger.parameters['eid'] = { description: 'Edge ID' }
      #swagger.responses[204] = { description: 'Edge removed' }
      #swagger.responses[404] = { description: 'Edge not found' }
    */
    try {
      const result = workflowDesignService.removeEdge(db, req.params.eid);
      if (!result) {
        res.status(404).json({
          error: { code: 'EDGE_NOT_FOUND', message: `Edge '${req.params.eid}' not found` }
        });
        return;
      }

      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /workflow-designs/:id/reset - Reset workflow for re-running
  router.post('/workflow-designs/:id/reset', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflow Designer']
      #swagger.summary = 'Reset workflow'
      #swagger.description = 'Resets all nodes to pending and workflow to draft status, allowing it to be run again.'
      #swagger.parameters['id'] = { description: 'Workflow Design ID' }
      #swagger.responses[200] = { description: 'Workflow reset' }
      #swagger.responses[404] = { description: 'Workflow design not found' }
    */
    try {
      const design = workflowDesignService.resetWorkflow(db, req.params.id);
      if (!design) {
        res.status(404).json({
          error: { code: 'WORKFLOW_DESIGN_NOT_FOUND', message: `Workflow design '${req.params.id}' not found` }
        });
        return;
      }

      res.json(design);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /workflow-designs/:id/run - Start workflow execution
  router.post('/workflow-designs/:id/run', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflow Designer']
      #swagger.summary = 'Start workflow execution'
      #swagger.description = 'Starts executing the workflow from entry nodes. The workflow will pause after each node completes for review.'
      #swagger.parameters['id'] = { description: 'Workflow Design ID' }
      #swagger.responses[200] = { description: 'Workflow started' }
      #swagger.responses[400] = { description: 'Workflow is empty or not ready' }
      #swagger.responses[404] = { description: 'Workflow design not found' }
    */
    try {
      const design = workflowDesignService.startWorkflow(db, req.params.id);
      if (!design) {
        res.status(404).json({
          error: { code: 'WORKFLOW_DESIGN_NOT_FOUND', message: `Workflow design '${req.params.id}' not found` }
        });
        return;
      }

      res.json(design);
    } catch (error: any) {
      if (error.message === 'WORKFLOW_EMPTY') {
        res.status(400).json({
          error: { code: 'WORKFLOW_EMPTY', message: 'Workflow has no nodes' }
        });
      } else if (error.message === 'WORKFLOW_NOT_READY') {
        res.status(400).json({
          error: { code: 'WORKFLOW_NOT_READY', message: 'Workflow is not in draft or ready state' }
        });
      } else {
        res.status(500).json({
          error: { code: 'INTERNAL_ERROR', message: error.message }
        });
      }
    }
  });

  // POST /workflow-designs/:id/continue - Continue paused workflow
  router.post('/workflow-designs/:id/continue', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflow Designer']
      #swagger.summary = 'Continue workflow execution'
      #swagger.description = 'Continues a paused workflow to the next ready nodes.'
      #swagger.parameters['id'] = { description: 'Workflow Design ID' }
      #swagger.responses[200] = { description: 'Workflow continued' }
      #swagger.responses[400] = { description: 'Workflow is not paused' }
      #swagger.responses[404] = { description: 'Workflow design not found' }
    */
    try {
      const design = workflowDesignService.continueWorkflow(db, req.params.id);
      if (!design) {
        res.status(404).json({
          error: { code: 'WORKFLOW_DESIGN_NOT_FOUND', message: `Workflow design '${req.params.id}' not found` }
        });
        return;
      }

      res.json(design);
    } catch (error: any) {
      if (error.message === 'WORKFLOW_NOT_PAUSED') {
        res.status(400).json({
          error: { code: 'WORKFLOW_NOT_PAUSED', message: 'Workflow is not paused' }
        });
      } else {
        res.status(500).json({
          error: { code: 'INTERNAL_ERROR', message: error.message }
        });
      }
    }
  });

  // GET /workflow-designs/:id/status - Get workflow execution status
  router.get('/workflow-designs/:id/status', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflow Designer']
      #swagger.summary = 'Get execution status'
      #swagger.description = 'Returns the current execution status of the workflow including completed, running, and pending nodes.'
      #swagger.parameters['id'] = { description: 'Workflow Design ID' }
      #swagger.responses[200] = { description: 'Execution status' }
      #swagger.responses[404] = { description: 'Workflow design not found' }
    */
    try {
      const status = workflowDesignService.getExecutionStatus(db, req.params.id);
      if (!status) {
        res.status(404).json({
          error: { code: 'WORKFLOW_DESIGN_NOT_FOUND', message: `Workflow design '${req.params.id}' not found` }
        });
        return;
      }

      res.json(status);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /workflow-designs/:id/nodes/:nid/rerun - Re-run a single node
  router.post('/workflow-designs/:id/nodes/:nid/rerun', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflow Designer']
      #swagger.summary = 'Re-run a node'
      #swagger.description = 'Resets a node to pending status so it can be run again.'
      #swagger.parameters['id'] = { description: 'Workflow Design ID' }
      #swagger.parameters['nid'] = { description: 'Node ID' }
      #swagger.responses[200] = { description: 'Node reset for re-run' }
      #swagger.responses[404] = { description: 'Node not found' }
    */
    try {
      const node = workflowDesignService.resetNode(db, req.params.nid);
      if (!node) {
        res.status(404).json({
          error: { code: 'NODE_NOT_FOUND', message: `Node '${req.params.nid}' not found` }
        });
        return;
      }

      res.json(node);
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /workflow-designs/:id/nodes/:nid/execute - Execute a ready node
  router.post('/workflow-designs/:id/nodes/:nid/execute', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflow Designer']
      #swagger.summary = 'Execute a ready node'
      #swagger.description = 'Creates a case for the node scenario and returns the auto-play prompt. The node must be in ready status.'
      #swagger.parameters['id'] = { description: 'Workflow Design ID' }
      #swagger.parameters['nid'] = { description: 'Node ID' }
      #swagger.responses[200] = { description: 'Node execution started, returns case and prompt' }
      #swagger.responses[400] = { description: 'Node is not ready' }
      #swagger.responses[404] = { description: 'Node or scenario not found' }
    */
    try {
      const design = workflowDesignService.getWorkflowDesign(db, req.params.id);
      if (!design) {
        res.status(404).json({
          error: { code: 'WORKFLOW_DESIGN_NOT_FOUND', message: `Workflow design '${req.params.id}' not found` }
        });
        return;
      }

      const node = design.nodes.find(n => n.id === req.params.nid);
      if (!node) {
        res.status(404).json({
          error: { code: 'NODE_NOT_FOUND', message: `Node '${req.params.nid}' not found` }
        });
        return;
      }

      if (node.status !== 'ready') {
        res.status(400).json({
          error: { code: 'NODE_NOT_READY', message: `Node is in '${node.status}' status, must be 'ready'` }
        });
        return;
      }

      // Load scenario file
      const scenarioPath = path.resolve(process.cwd(), 'scenarios', `${node.scenarioName}.txt`);
      if (!fs.existsSync(scenarioPath)) {
        res.status(404).json({
          error: { code: 'SCENARIO_NOT_FOUND', message: `Scenario '${node.scenarioName}' not found` }
        });
        return;
      }

      const scenarioText = fs.readFileSync(scenarioPath, 'utf-8');

      // Create case from scenario (empty participants - AI will set them up)
      const newCase = caseService.createCase(db, { scenario: scenarioText, participants: [] });

      // Link case to node and mark as running
      workflowDesignService.setNodeRunning(db, node.id, newCase.id);

      res.json({
        node: workflowDesignService.getWorkflowDesign(db, req.params.id)?.nodes.find(n => n.id === req.params.nid),
        case: newCase,
        autoPlayUrl: `/api/cases/${newCase.id}/auto-play`,
        hint: `Run: curl http://localhost:3000/api/cases/${newCase.id}/auto-play`
      });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST /workflow-designs/:id/nodes/:nid/complete - Mark node as completed
  router.post('/workflow-designs/:id/nodes/:nid/complete', (req: Request, res: Response) => {
    /*
      #swagger.tags = ['Workflow Designer']
      #swagger.summary = 'Complete a node'
      #swagger.description = 'Marks a running node as completed. The workflow will pause for review.'
      #swagger.parameters['id'] = { description: 'Workflow Design ID' }
      #swagger.parameters['nid'] = { description: 'Node ID' }
      #swagger.responses[200] = { description: 'Node completed' }
      #swagger.responses[404] = { description: 'Node not found' }
    */
    try {
      const result = workflowDesignService.completeNode(db, req.params.nid);
      if (!result.node) {
        res.status(404).json({
          error: { code: 'NODE_NOT_FOUND', message: `Node '${req.params.nid}' not found` }
        });
        return;
      }

      res.json({
        node: result.node,
        workflowPaused: result.workflowPaused,
        workflow: workflowDesignService.getWorkflowDesign(db, req.params.id)
      });
    } catch (error: any) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  return router;
}

function getErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    'TASK_EXPIRED': 'Task ID is no longer valid. Get a new task first.',
    'TASK_MISMATCH': 'Task does not match the case or agent.',
    'CASE_NOT_FOUND': 'Case not found.',
    'CASE_RESOLVED': 'Case is already resolved.',
    'NOT_YOUR_TURN': 'It is not your turn to respond.'
  };
  return messages[code] || 'An unexpected error occurred.';
}

// Validate scenario text and return structured feedback
function validateScenario(scenario: string, db?: Database.Database): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  agents: { name: string; hasAgenda: boolean; agreeability: number | null; profile: Record<string, any> | null; useProfile: boolean }[];
  options: string[];
  maxRounds: number | null;
  hasPublicInfo: boolean;
  hasRules: boolean;
  hasModerator: boolean;
  taskType: string | null;
  taskOutput: string | null;
  inputDocuments: string[];
  inputFiles: string[];
  workingDocuments: string[];
  hasTaskTemplate: boolean;
  companyContext: {
    companyName: string | null;
    buildingName: string | null;
    roomName: string | null;
  };
  perCaseRoles: Array<{
    agentName: string;
    roleType: 'visitor' | 'contractor' | 'temp' | 'consultant';
    accessLevel: 'full' | 'limited' | 'escorted';
  }>;
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Extract agents (AGENT: Name format)
  const agentMatches = scenario.matchAll(/AGENT:\s*(\w+)/gi);
  const agentNames = [...agentMatches].map(m => m[1]);

  if (agentNames.length === 0) {
    errors.push('No agents defined. Use "AGENT: Name" format to define participants.');
  } else if (agentNames.length < 2) {
    errors.push('At least 2 agents are required for a negotiation.');
  }

  // Check each agent for agenda and agreeability
  const agents = agentNames.map(name => {
    // Find the agent's section
    const agentPattern = new RegExp(`AGENT:\\s*${name}[\\s\\S]*?(?=AGENT:|OPTIONS:|RULES:|$)`, 'i');
    const agentSection = scenario.match(agentPattern)?.[0] || '';

    // Check for AGENDA
    const hasAgenda = /AGENDA[^:]*:/i.test(agentSection);
    if (!hasAgenda) {
      warnings.push(`Agent "${name}" has no AGENDA defined.`);
    }

    // Check agenda length
    const agendaMatch = agentSection.match(/AGENDA[^:]*:([\s\S]*?)(?=AGENT:|OPTIONS:|RULES:|AGREEABILITY:|$)/i);
    if (agendaMatch && agendaMatch[1].trim().length < 20) {
      warnings.push(`Agent "${name}" has a very short agenda. Consider adding more detail.`);
    }

    // Extract agreeability
    const agreeabilityMatch = agentSection.match(/AGREEABILITY[:\s]*(\d+)/i);
    let agreeability: number | null = null;
    if (agreeabilityMatch) {
      agreeability = parseInt(agreeabilityMatch[1], 10);
      if (agreeability < 0 || agreeability > 100) {
        errors.push(`Agent "${name}" has invalid AGREEABILITY ${agreeability}. Must be 0-100.`);
        agreeability = null;
      }
    }

    // Check for USE_PROFILE flag
    const useProfile = /USE_PROFILE:\s*true/i.test(agentSection);

    // Extract PROFILE block if present
    let profile: Record<string, any> | null = null;
    const profileMatch = agentSection.match(/PROFILE:\s*\n([\s\S]*?)(?=\nAGENDA[^:]*:|AGREEABILITY:|AGENT:|OPTIONS:|RULES:|$)/i);
    if (profileMatch) {
      profile = parseProfileBlock(profileMatch[1]);
    }

    return { name, hasAgenda, agreeability, profile, useProfile };
  });

  // Helper function to parse PROFILE block
  function parseProfileBlock(profileText: string): Record<string, any> {
    const profile: Record<string, any> = {};
    const lines = profileText.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Handle multiline fields (like BACKSTORY: |)
      const fieldMatch = trimmed.match(/^([A-Z_]+):\s*(.*)$/i);
      if (fieldMatch) {
        const [, key, value] = fieldMatch;
        const normalizedKey = normalizeProfileKey(key);

        if (value === '|') {
          // Multiline value - collect subsequent indented lines
          const startIndex = lines.indexOf(line);
          let multilineValue = '';
          for (let i = startIndex + 1; i < lines.length; i++) {
            const nextLine = lines[i];
            if (nextLine.match(/^\s{2,}/) || nextLine.trim() === '') {
              multilineValue += nextLine.trim() + '\n';
            } else if (nextLine.match(/^[A-Z_]+:/i)) {
              break;
            }
          }
          profile[normalizedKey] = multilineValue.trim();
        } else if (key.toUpperCase() === 'HAIR') {
          // Parse HAIR: color, style, length
          const parts = value.split(',').map(s => s.trim());
          if (parts[0]) profile.hairColor = parts[0];
          if (parts[1]) profile.hairStyle = parts[1];
          if (parts[2]) profile.hairLength = parts[2];
        } else if (key.toUpperCase() === 'PLACE_OF_BIRTH') {
          // Parse PLACE_OF_BIRTH: City, Country
          const parts = value.split(',').map(s => s.trim());
          if (parts[0]) profile.placeOfBirthCity = parts[0];
          if (parts[1]) profile.placeOfBirthCountry = parts[1];
        } else if (key.toUpperCase() === 'PERSONALITY') {
          // Parse PERSONALITY: trait1, trait2, trait3
          profile.personalityTraits = value.split(',').map(s => s.trim()).filter(Boolean);
        } else if (key.toUpperCase() === 'JEWELRY') {
          // Parse JEWELRY: item1, item2
          profile.jewelry = value.split(',').map(s => s.trim()).filter(Boolean);
        } else {
          profile[normalizedKey] = value;
        }
      }
    }

    return profile;
  }

  // Normalize profile keys to camelCase
  function normalizeProfileKey(key: string): string {
    const keyMap: Record<string, string> = {
      'SEX': 'sex',
      'DATE_OF_BIRTH': 'dateOfBirth',
      'NATIONALITY': 'nationality',
      'NATIONALITIES': 'nationalities',
      'HEIGHT': 'heightCm',
      'BUILD': 'build',
      'SKIN_TONE': 'skinTone',
      'EYES': 'eyeColor',
      'EYE_COLOR': 'eyeColor',
      'HAIR_COLOR': 'hairColor',
      'HAIR_STYLE': 'hairStyle',
      'HAIR_LENGTH': 'hairLength',
      'FACIAL_HAIR': 'facialHair',
      'FACE_SHAPE': 'faceShape',
      'AGE_APPEARANCE': 'ageAppearance',
      'GLASSES': 'glasses',
      'TATTOOS': 'tattoos',
      'SCARS': 'scars',
      'DISTINGUISHING_FEATURES': 'distinguishingFeatures',
      'CLOTHING_STYLE': 'clothingStyle',
      'CLOTHING_COLORS': 'clothingColors',
      'BACKSTORY': 'backstory',
      'PERSONALITY': 'personalityTraits',
      'PERSONALITY_TRAITS': 'personalityTraits'
    };
    return keyMap[key.toUpperCase()] || key.toLowerCase();
  }

  // Check for Moderator
  const hasModerator = agentNames.some(name =>
    name.toLowerCase().includes('moderator') ||
    name.toLowerCase().includes('adjudicator') ||
    name.toLowerCase().includes('host')
  );
  if (!hasModerator) {
    warnings.push('No Moderator/Adjudicator role detected. Consider adding one to facilitate the discussion.');
  }

  // Extract options (from OPTIONS: or RESTAURANTS: section)
  const options: string[] = [];
  const optionsMatch = scenario.match(/(?:OPTIONS|RESTAURANTS)[^:]*:[\s\S]*?(?=AGENT:|RULES:|PUBLIC|$)/i);
  if (optionsMatch) {
    const optionLines = optionsMatch[0].split('\n').filter(l => l.trim().startsWith('-'));
    for (const line of optionLines) {
      const nameMatch = line.match(/^-\s*([^:]+)/);
      if (nameMatch) {
        options.push(nameMatch[1].trim());
      }
    }
  }

  if (options.length === 0) {
    warnings.push('No OPTIONS defined. For restaurant/choice scenarios, add "OPTIONS:" section with items.');
  }

  // Check for MAX_ROUNDS
  const maxRoundsMatch = scenario.match(/MAX_ROUNDS[:\s]*(\d+)/i);
  const maxRounds = maxRoundsMatch ? parseInt(maxRoundsMatch[1], 10) : null;
  if (!maxRounds) {
    warnings.push('No MAX_ROUNDS specified. Default of 20 will be used.');
  } else if (maxRounds < 5) {
    warnings.push(`MAX_ROUNDS of ${maxRounds} is very low. Agents may not have time to negotiate.`);
  } else if (maxRounds > 50) {
    warnings.push(`MAX_ROUNDS of ${maxRounds} is high. Consider a lower value for faster resolution.`);
  }

  // Check for PUBLIC INFO
  const hasPublicInfo = /PUBLIC\s*INFO[:\s]/i.test(scenario);
  if (!hasPublicInfo) {
    warnings.push('No "PUBLIC INFO:" section found. Consider adding context visible to all agents.');
  }

  // Check for RULES
  const hasRules = /RULES[:\s]/i.test(scenario);
  if (!hasRules) {
    warnings.push('No "RULES:" section found. Consider adding resolution criteria.');
  }

  // Check that at least some agents have agreeability defined
  const agentsWithAgreeability = agents.filter(a => a.agreeability !== null);
  if (agentsWithAgreeability.length === 0 && agents.length > 0) {
    warnings.push('No agents have AGREEABILITY defined. Consider adding values (0-100) to influence negotiation behavior.');
  }

  // Extract document-related fields
  const taskTypeMatch = scenario.match(/TASK_TYPE:\s*(options|document|both)/i);
  const taskType = taskTypeMatch ? taskTypeMatch[1].toLowerCase() : null;

  const taskOutputMatch = scenario.match(/TASK_OUTPUT:\s*(\S+)/i);
  const taskOutput = taskOutputMatch ? taskOutputMatch[1].trim() : null;

  // Extract INPUT_DOCUMENT names
  const inputDocuments: string[] = [];
  const inputDocRegex = /INPUT_DOCUMENT:\s*(\S+)/gi;
  let inputDocMatch;
  while ((inputDocMatch = inputDocRegex.exec(scenario)) !== null) {
    inputDocuments.push(inputDocMatch[1].trim());
  }

  // Extract INPUT_FILE paths
  const inputFiles: string[] = [];
  const inputFileRegex = /INPUT_FILE:\s*(.+)$/gim;
  let inputFileMatch;
  while ((inputFileMatch = inputFileRegex.exec(scenario)) !== null) {
    inputFiles.push(inputFileMatch[1].trim());
  }

  // Extract WORKING_DOCUMENTS names
  const workingDocuments: string[] = [];
  const workingDocsMatch = scenario.match(/WORKING_DOCUMENTS:\s*\n([\s\S]*?)(?=\n[A-Z_]+:|$)/i);
  if (workingDocsMatch) {
    const lines = workingDocsMatch[1].split('\n');
    for (const line of lines) {
      const itemMatch = line.match(/^\s*-\s*(\w+):/);
      if (itemMatch) {
        workingDocuments.push(itemMatch[1].trim());
      }
    }
  }

  // Check for TASK_TEMPLATE
  const hasTaskTemplate = /TASK_TEMPLATE:\s*\n[\s\S]*?END_TEMPLATE/i.test(scenario);

  // Validate document-related fields
  if (taskType === 'document' || taskType === 'both') {
    if (inputDocuments.length === 0 && inputFiles.length === 0) {
      warnings.push('TASK_TYPE is document/both but no INPUT_DOCUMENT or INPUT_FILE defined.');
    }
    if (workingDocuments.length === 0) {
      warnings.push('TASK_TYPE is document/both but no WORKING_DOCUMENTS defined.');
    }
  }

  if (taskOutput && !workingDocuments.includes(taskOutput)) {
    warnings.push(`TASK_OUTPUT "${taskOutput}" is not in WORKING_DOCUMENTS list.`);
  }

  if (hasTaskTemplate && !taskOutput) {
    warnings.push('TASK_TEMPLATE defined but no TASK_OUTPUT specified to use it.');
  }

  // Extract company context
  const companyMatch = scenario.match(/^COMPANY:\s*(.+)$/im);
  const buildingMatch = scenario.match(/^BUILDING:\s*(.+)$/im);
  const roomMatch = scenario.match(/^ROOM:\s*(.+)$/im);

  const companyContext = {
    companyName: companyMatch ? companyMatch[1].trim() : null,
    buildingName: buildingMatch ? buildingMatch[1].trim() : null,
    roomName: roomMatch ? roomMatch[1].trim() : null
  };

  // Extract per-case roles
  const perCaseRoles: Array<{
    agentName: string;
    roleType: 'visitor' | 'contractor' | 'temp' | 'consultant';
    accessLevel: 'full' | 'limited' | 'escorted';
  }> = [];

  // Find PER_CASE_ROLE within agent blocks
  const agentBlocksForRoles = scenario.matchAll(/AGENT:\s*(\w+)([\s\S]*?)(?=AGENT:|OPTIONS:|RULES:|PUBLIC|$)/gi);

  for (const block of agentBlocksForRoles) {
    const agentName = block[1];
    const agentSection = block[2];

    const roleMatch = agentSection.match(/PER_CASE_ROLE:\s*(visitor|contractor|temp|consultant)\s*,\s*(full|limited|escorted)/i);
    if (roleMatch) {
      perCaseRoles.push({
        agentName,
        roleType: roleMatch[1].toLowerCase() as 'visitor' | 'contractor' | 'temp' | 'consultant',
        accessLevel: roleMatch[2].toLowerCase() as 'full' | 'limited' | 'escorted'
      });
    }
  }

  // Validate company context
  if (companyContext.companyName) {
    // Check if company exists (only if db is provided)
    if (db) {
      const company = companyService.getCompanyByName(db, companyContext.companyName);
      if (!company) {
        warnings.push(`COMPANY "${companyContext.companyName}" referenced but does not exist in the database.`);
      } else {
        // Validate building if specified
        if (companyContext.buildingName) {
          const buildings = companyService.getCompanyBuildings(db, company.id);
          const buildingExists = buildings.some(b => b.name.toLowerCase() === companyContext.buildingName!.toLowerCase());
          if (!buildingExists) {
            warnings.push(`BUILDING "${companyContext.buildingName}" not found in company "${companyContext.companyName}".`);
          } else if (companyContext.roomName) {
            // Validate room if building exists and room is specified
            const building = buildings.find(b => b.name.toLowerCase() === companyContext.buildingName!.toLowerCase());
            if (building) {
              const rooms = companyService.getBuildingRooms(db, building.id);
              const roomExists = rooms.some(r => r.name.toLowerCase() === companyContext.roomName!.toLowerCase());
              if (!roomExists) {
                warnings.push(`ROOM "${companyContext.roomName}" not found in building "${companyContext.buildingName}".`);
              }
            }
          }
        }
      }
    }

    // Warn if building/room specified without company
    if (!companyContext.companyName && companyContext.buildingName) {
      warnings.push('BUILDING specified but no COMPANY defined.');
    }
    if (!companyContext.buildingName && companyContext.roomName) {
      warnings.push('ROOM specified but no BUILDING defined.');
    }
  } else {
    // Warn if building/room specified without company
    if (companyContext.buildingName) {
      warnings.push('BUILDING specified but no COMPANY defined.');
    }
    if (companyContext.roomName && !companyContext.buildingName) {
      warnings.push('ROOM specified but no BUILDING defined.');
    }
  }

  // Validate per-case roles
  for (const role of perCaseRoles) {
    if (!agentNames.some(a => a.toLowerCase() === role.agentName.toLowerCase())) {
      warnings.push(`PER_CASE_ROLE defined for unknown agent "${role.agentName}".`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    agents,
    options,
    maxRounds,
    hasPublicInfo,
    hasRules,
    hasModerator,
    taskType,
    taskOutput,
    inputDocuments,
    inputFiles,
    workingDocuments,
    hasTaskTemplate,
    companyContext,
    perCaseRoles
  };
}
