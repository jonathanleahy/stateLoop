import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { AgentTask, SubmitResponseRequest, DocumentUpdate } from '../types/index.js';
import * as storage from '../storage/sqlite.js';
import * as caseService from './caseService.js';

// Helper: Apply document update based on action type
function applyDocumentUpdate(
  currentContent: string,
  update: DocumentUpdate
): string {
  switch (update.action) {
    case 'append':
      return currentContent + (currentContent ? '\n' : '') + update.content;
    case 'prepend':
      return update.content + (currentContent ? '\n' : '') + currentContent;
    case 'replace':
      return update.content;
    case 'replace_section':
      if (!update.section) {
        // No section specified, treat as replace
        return update.content;
      }

      // First, try literal text replacement (for HTML, code, etc.)
      if (currentContent.includes(update.section)) {
        return currentContent.replace(update.section, update.content);
      }

      // Then, look for section markers like "## Section Name" or "# Section Name"
      const sectionPattern = new RegExp(
        `(^|\\n)(#{1,6}\\s*${escapeRegex(update.section)}[^\\n]*)\\n([\\s\\S]*?)(?=\\n#{1,6}\\s|$)`,
        'i'
      );
      const match = currentContent.match(sectionPattern);
      if (match) {
        // Replace section content while keeping the header
        const beforeSection = currentContent.substring(0, match.index! + match[1].length);
        const sectionHeader = match[2];
        const afterMatch = match.index! + match[0].length;
        const afterSection = currentContent.substring(afterMatch);
        return beforeSection + sectionHeader + '\n' + update.content + afterSection;
      }
      // Section not found - return content unchanged (don't append garbage)
      console.warn(`replace_section: Section "${update.section}" not found in document`);
      return currentContent;
    default:
      return currentContent;
  }
}

// Helper: Escape special regex characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Process document updates from agent response (exported for /run endpoint)
export function processDocumentUpdates(
  db: Database.Database,
  caseId: string,
  agentId: string,
  documentUpdates: DocumentUpdate[]
): void {
  // Get agent name from participant
  const participant = storage.getParticipant(db, agentId);
  const agentName = participant?.name || null;

  for (const update of documentUpdates) {
    // Get the working document
    const doc = storage.getWorkingDocument(db, caseId, update.document);
    if (!doc) {
      // Document doesn't exist, skip this update
      // (Alternatively, could create it - but for now we skip)
      console.warn(`Working document "${update.document}" not found for case ${caseId}`);
      continue;
    }

    const previousContent = doc.content;
    const newContent = applyDocumentUpdate(previousContent, update);

    // Update the working document
    storage.updateWorkingDocument(db, caseId, update.document, newContent, agentId);

    // Record the edit in history
    const editId = `edit-${uuidv4().slice(0, 8)}`;
    storage.addDocumentEdit(
      db,
      editId,
      doc.id,
      caseId,
      agentId,
      agentName,
      update.action,
      previousContent,
      newContent
    );
  }
}

// Store active tasks (in production, use Redis or database)
const activeTasks = new Map<string, { caseId: string; agentId: string; createdAt: Date }>();

export function getNextTask(db: Database.Database, caseId: string, agentId: string): AgentTask | null {
  const caseData = storage.getCaseWithRelations(db, caseId);
  if (!caseData) return null;

  // Check if case is resolved
  if (caseData.status !== 'active') return null;

  // Check if it's this agent's turn
  if (caseData.currentTurn !== agentId) return null;

  // Find the participant
  const participant = caseData.participants.find(p => p.id === agentId);
  if (!participant) return null;

  // Create task ID
  const taskId = `task-${uuidv4().slice(0, 8)}`;
  activeTasks.set(taskId, { caseId, agentId, createdAt: new Date() });

  // Build conversation history with author names
  const participantMap = new Map(caseData.participants.map(p => [p.id, p.name]));
  const conversationHistory = caseData.messages.map(m => ({
    author: m.author,
    authorName: participantMap.get(m.author) || m.author,
    type: m.type,
    content: m.content,
    optionId: m.optionId,
    timestamp: m.timestamp
  }));

  // Get boss messages for this agent
  const bossMessages = caseData.bossMessages
    .filter(m => !m.targetAgent || m.targetAgent === agentId)
    .map(m => ({ content: m.content, timestamp: m.timestamp }));

  // Get documents for the agent task
  const inputDocuments = storage.getInputDocuments(db, caseId).map(d => ({
    name: d.name,
    content: d.content
  }));
  const workingDocuments = storage.getWorkingDocuments(db, caseId).map(d => ({
    name: d.name,
    content: d.content,
    lastEditedBy: d.lastEditedBy
  }));

  // Build instruction
  const lastMessage = caseData.messages[caseData.messages.length - 1];
  let instruction = `You are ${participant.name}. `;

  if (caseData.messages.length === 0) {
    instruction += 'You are starting the conversation. Make an initial proposal.';
  } else if (lastMessage) {
    const otherName = participantMap.get(lastMessage.author) || lastMessage.author;
    instruction += `Review ${otherName}'s ${lastMessage.type} and respond. You can: accept their proposal, make a counter-proposal, or continue discussing.`;
  }

  return {
    caseId,
    taskId,
    role: participant,
    scenario: caseData.scenario,
    options: caseData.options,
    conversationHistory,
    instruction,
    bossMessages,
    inputDocuments,
    workingDocuments
  };
}

export function submitResponse(
  db: Database.Database,
  caseId: string,
  request: SubmitResponseRequest
): { messageId: string; caseStatus: string; nextTurn: string | null } {
  // Validate task
  const task = activeTasks.get(request.taskId);
  if (!task) {
    throw new Error('TASK_EXPIRED');
  }

  if (task.caseId !== caseId || task.agentId !== request.agentId) {
    throw new Error('TASK_MISMATCH');
  }

  // Get case
  const caseData = storage.getCaseWithRelations(db, caseId);
  if (!caseData) {
    throw new Error('CASE_NOT_FOUND');
  }

  if (caseData.status !== 'active') {
    throw new Error('CASE_RESOLVED');
  }

  if (caseData.currentTurn !== request.agentId) {
    throw new Error('NOT_YOUR_TURN');
  }

  // Add message
  const selectedOptionId = request.response.optionId || null;
  const thoughts = request.response.thoughts || null;
  const message = caseService.addMessage(
    db,
    caseId,
    request.agentId,
    request.response.type,
    request.response.content,
    selectedOptionId,
    thoughts
  );

  // Process document updates if present
  const documentUpdates = (request.response as any).documentUpdates as DocumentUpdate[] | undefined;
  if (documentUpdates && Array.isArray(documentUpdates) && documentUpdates.length > 0) {
    processDocumentUpdates(db, caseId, request.agentId, documentUpdates);
  }

  // Clear the task
  activeTasks.delete(request.taskId);

  // Get messages and participants for resolution checks
  const messages = storage.getMessages(db, caseId);
  const participants = storage.getParticipants(db, caseId);
  const maxRounds = extractMaxRounds(caseData.scenario) || 20; // default 20 rounds

  // Auto-resolve if rejected too many times (3 rejects = failed)
  if (request.response.type === 'reject') {
    const rejectCount = messages.filter(m => m.type === 'reject').length;
    if (rejectCount >= 3) {
      caseService.resolveCase(db, caseId, 'failed', null, 'Negotiation failed - too many rejections');
      return {
        messageId: message.id,
        caseStatus: 'resolved',
        nextTurn: null
      };
    }
  }

  // Auto-resolve if accepted
  if (request.response.type === 'accept') {
    // Get task type to determine resolution behavior
    const taskType = storage.getTaskType(db, caseId);
    const isDocumentTask = taskType === 'document' || taskType === 'both';

    // Find the last proposal/counter
    const lastProposal = [...messages].reverse().find(m => m.type === 'proposal' || m.type === 'counter');
    const lastProposalOptionId = lastProposal?.optionId;

    // For document tasks, check if this is a "finalize" accept
    // A finalize accept has content containing "finalize" or "complete" or "done"
    const content = request.response.content?.toLowerCase() || '';
    const isFinalizeAccept = content.includes('finalize') ||
                             content.includes('complete') ||
                             content.includes('final draft') ||
                             content.includes('lock it in') ||
                             content.includes('wrap up');

    // Document tasks: only resolve on explicit finalize, not regular accepts
    if (isDocumentTask && !isFinalizeAccept) {
      // For document tasks, treat accept as agreement to a proposal/section
      // but don't resolve the case - continue working on the document
      const nextTurn = caseService.advanceTurn(db, caseId);
      return {
        messageId: message.id,
        caseStatus: 'active',
        nextTurn
      };
    }

    // Check for consensus on a specific option (multiple agents accepting same optionId)
    const currentOptionId = request.response.optionId;
    if (currentOptionId) {
      // Count all accepts for this specific option
      const acceptsForOption = messages.filter(m =>
        m.type === 'accept' && m.optionId === currentOptionId
      );
      const acceptingParticipantIds = new Set(acceptsForOption.map(m => m.author));

      // Get non-moderator participants
      const negotiators = participants.filter(p => {
        const name = p.name.toLowerCase();
        return !name.includes('moderator') && !name.includes('adjudicator');
      });

      // Count how many negotiators have accepted this option
      const acceptCount = negotiators.filter(p => acceptingParticipantIds.has(p.id)).length;

      // Resolve if majority of negotiators accept same option (or all if <= 3 participants)
      const threshold = negotiators.length <= 3 ? negotiators.length : Math.ceil(negotiators.length / 2) + 1;
      if (acceptCount >= threshold) {
        caseService.resolveCase(db, caseId, 'agreed', currentOptionId, 'Majority reached agreement');
        return {
          messageId: message.id,
          caseStatus: 'resolved',
          nextTurn: null
        };
      }
    }

    if (lastProposalOptionId) {
      // Option-based resolution: proposer + accepter agree
      if (lastProposal.author !== request.agentId) {
        caseService.resolveCase(db, caseId, 'agreed', lastProposalOptionId, 'Parties reached agreement');
        return {
          messageId: message.id,
          caseStatus: 'resolved',
          nextTurn: null
        };
      }
    } else if (!request.response.optionId) {
      // Debate-style resolution: check if ALL participants have accepted
      // (for cases without options)
      const acceptMessages = messages.filter(m => m.type === 'accept');
      const acceptingParticipants = new Set(acceptMessages.map(m => m.author));

      // Get non-moderator participants (moderators don't need to accept)
      const negotiators = participants.filter(p => {
        const name = p.name.toLowerCase();
        return !name.includes('moderator') && !name.includes('adjudicator');
      });

      // If all negotiators have accepted, resolve
      const allAccepted = negotiators.every(p => acceptingParticipants.has(p.id));

      if (allAccepted && negotiators.length >= 2) {
        caseService.resolveCase(db, caseId, 'agreed', null, 'All participants reached consensus');
        return {
          messageId: message.id,
          caseStatus: 'resolved',
          nextTurn: null
        };
      }
    }
  }

  // Check for timeout AFTER resolution checks (max rounds reached without agreement)
  if (messages.length >= maxRounds) {
    caseService.resolveCase(db, caseId, 'failed', null, `Negotiation timed out after ${maxRounds} rounds`);
    return {
      messageId: message.id,
      caseStatus: 'resolved',
      nextTurn: null
    };
  }

  // Advance turn
  const nextTurn = caseService.advanceTurn(db, caseId);

  return {
    messageId: message.id,
    caseStatus: 'active',
    nextTurn
  };
}

// Helper: Extract max rounds from scenario text
function extractMaxRounds(scenario: string): number | null {
  // Look for "MAX_ROUNDS: N" or "maxRounds: N" in scenario
  const match = scenario.match(/MAX_?ROUNDS?\s*[:=]\s*(\d+)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

// Helper: Extract agreeability from scenario for a participant
export function extractAgreeability(scenario: string, participantName: string): number | null {
  // Look for "AGREEABILITY: N" or "agreeability: N%" near the agent's section
  const agentSection = scenario.match(new RegExp(`AGENT:\\s*${participantName}[\\s\\S]*?(?=AGENT:|$)`, 'i'));
  if (agentSection) {
    const match = agentSection[0].match(/AGREEABILIT[Y]?\s*[:=]\s*(\d+)/i);
    if (match) {
      return Math.min(100, Math.max(0, parseInt(match[1], 10)));
    }
  }
  return null; // default: no specific agreeability
}
