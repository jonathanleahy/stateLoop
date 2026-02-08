import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type {
  Case,
  CaseWithRelations,
  CreateCaseRequest,
  CaseOutcome,
  Message,
  FormDefinition,
  FormFieldDefinition,
  FormFieldType,
  CompletedForm
} from '../types/index.js';
import * as storage from '../storage/sqlite.js';

export function createCase(db: Database.Database, request: CreateCaseRequest): CaseWithRelations {
  const caseId = `case-${uuidv4().slice(0, 8)}`;
  const caseData = storage.createCase(db, caseId, request);
  const options = storage.getOptions(db, caseId);

  return {
    ...caseData,
    participants: storage.getParticipants(db, caseId),
    options,
    messages: [],
    bossMessages: [],
    inputDocuments: [],
    workingDocuments: []
  };
}

export function getCase(db: Database.Database, caseId: string): CaseWithRelations | null {
  return storage.getCaseWithRelations(db, caseId);
}

export function getAllCases(db: Database.Database): Case[] {
  return storage.getAllCases(db);
}

export function addMessage(
  db: Database.Database,
  caseId: string,
  author: string,
  type: string,
  content: string,
  optionId: string | null,
  thoughts: string | null = null
): Message {
  const messageId = `msg-${uuidv4().slice(0, 8)}`;
  return storage.addMessage(db, messageId, caseId, author, type, content, optionId, thoughts);
}

export function advanceTurn(db: Database.Database, caseId: string): string | null {
  const caseData = storage.getCaseWithRelations(db, caseId);
  if (!caseData) return null;

  const participants = caseData.participants;
  const currentTurn = caseData.currentTurn;

  // Find next participant
  const currentIndex = participants.findIndex(p => p.id === currentTurn);
  const nextIndex = (currentIndex + 1) % participants.length;
  const nextTurn = participants[nextIndex].id;

  storage.updateCaseTurn(db, caseId, nextTurn);
  return nextTurn;
}

export function resolveCase(
  db: Database.Database,
  caseId: string,
  outcome: CaseOutcome,
  selectedOptionId: string | null,
  summary: string | null
): CaseWithRelations | null {
  storage.resolveCase(db, caseId, outcome, selectedOptionId, summary);

  // Update agent case history with the outcome
  storage.updateAgentCaseHistoryOutcome(db, caseId, outcome);

  // Get the case data for form completion
  const caseData = storage.getCaseWithRelations(db, caseId);
  if (!caseData) return null;

  // Check if there's a form definition in the scenario
  const formDefinition = parseFormDefinition(caseData.scenario);

  if (formDefinition) {
    // Store the form definition if not already stored
    if (!caseData.formDefinition) {
      storage.setFormDefinition(db, caseId, formDefinition);
    }

    // Generate completed form from resolution data
    const completedForm = generateFormFromResolution(caseData, formDefinition, outcome, selectedOptionId);

    // Store the completed form using dedicated storage
    storage.setCompletedForm(db, caseId, completedForm);

    // Also store as taskOutput for backward compatibility
    storage.setTaskOutput(db, caseId, JSON.stringify(completedForm, null, 2));
  } else {
    // No form, use standard task output finalization
    finalizeTaskOutput(db, caseId);
  }

  return storage.getCaseWithRelations(db, caseId);
}

export function sendBossMessage(
  db: Database.Database,
  caseId: string,
  content: string,
  targetAgent: string | null
): { messageId: string; timestamp: string } {
  const messageId = `boss-${uuidv4().slice(0, 8)}`;
  const message = storage.addBossMessage(db, messageId, caseId, content, targetAgent);
  return { messageId: message.id, timestamp: message.timestamp };
}

// Generate final task output with process summary and justification
export function generateFinalOutput(db: Database.Database, caseId: string): string | null {
  const caseData = storage.getCaseWithRelations(db, caseId);
  if (!caseData) return null;

  // Get the working documents
  const workingDocs = storage.getWorkingDocuments(db, caseId);
  const scriptDoc = workingDocs.find(d => d.name === 'script');
  const notesDoc = workingDocs.find(d => d.name === 'notes');
  const decisionsDoc = workingDocs.find(d => d.name === 'decisions');

  // Generate process summary from conversation
  const messages = caseData.messages;
  const keyMoments: string[] = [];

  // Extract key moments - acceptances, proposals, and significant discussions
  for (const msg of messages) {
    if (msg.type === 'accept' || msg.type === 'proposal') {
      const participant = caseData.participants.find(p => p.id === msg.author);
      const name = participant?.name || msg.author;
      if (msg.type === 'accept') {
        keyMoments.push(`- ${name} accepted a proposal`);
      } else {
        keyMoments.push(`- ${name} proposed a new direction`);
      }
    }
  }

  // Build contributor list
  const contributors = caseData.participants
    .map(p => `- ${p.name}`)
    .join('\n');

  // Get template from working document if available
  let output = scriptDoc?.template || '';

  // Replace placeholders
  output = output.replace('{{script_content}}', scriptDoc?.content || '[No script content]');
  output = output.replace('{{process_summary}}',
    keyMoments.length > 0
      ? keyMoments.join('\n')
      : (notesDoc?.content || 'The team collaborated to develop this deliverable through iterative discussion and refinement.')
  );
  output = output.replace('{{decisions}}', decisionsDoc?.content || 'Creative decisions were made collaboratively throughout the process.');
  output = output.replace('{{contributors}}', contributors);

  return output;
}

// Store the final generated output when case resolves
export function finalizeTaskOutput(db: Database.Database, caseId: string): void {
  const output = generateFinalOutput(db, caseId);
  if (output) {
    storage.setTaskOutput(db, caseId, output);
  }
}

// Parse form definition from scenario text
// Format:
// FORM: form_name
// DESCRIPTION: description text
// FIELDS:
// - field_name (type, required): Label text
// END_FORM
export function parseFormDefinition(scenario: string): FormDefinition | null {
  const formMatch = scenario.match(/FORM:\s*(\w+)\s*\n([\s\S]*?)END_FORM/i);
  if (!formMatch) return null;

  const formName = formMatch[1].trim();
  const formContent = formMatch[2];

  // Extract description
  const descMatch = formContent.match(/DESCRIPTION:\s*(.+?)(?:\n|$)/i);
  const description = descMatch ? descMatch[1].trim() : '';

  // Extract fields section
  const fieldsMatch = formContent.match(/FIELDS:\s*\n([\s\S]*?)(?=\n\s*(?:END_FORM|$))/i);
  if (!fieldsMatch) return null;

  const fieldsText = fieldsMatch[1];
  const fields: FormFieldDefinition[] = [];

  // Parse each field line
  // Format: - field_name (type, required): Label text {placeholder}
  // Or:     - field_name (type): Label text [Option1|Option2|Option3]
  const fieldLines = fieldsText.split('\n').filter(line => line.trim().startsWith('-'));

  for (const line of fieldLines) {
    const fieldMatch = line.match(/^-\s*(\w+)\s*\(([^)]+)\)\s*:\s*(.+?)(?:\s*\{([^}]*)\})?\s*(?:\[([^\]]*)\])?\s*$/);
    if (!fieldMatch) continue;

    const [, fieldName, typeInfo, labelWithOptions, placeholder, inlineOptions] = fieldMatch;

    // Parse type and required flag
    const typeParts = typeInfo.split(',').map(s => s.trim().toLowerCase());
    const fieldType = typeParts[0] as FormFieldType;
    const required = typeParts.includes('required');

    // Extract label (may contain [options] for select)
    let label = labelWithOptions.trim();
    let options: string[] | undefined;

    // Check for options in label text [Option1|Option2]
    const labelOptionsMatch = label.match(/^(.+?)\s*\[([^\]]+)\]\s*$/);
    if (labelOptionsMatch) {
      label = labelOptionsMatch[1].trim();
      options = labelOptionsMatch[2].split('|').map(o => o.trim());
    } else if (inlineOptions) {
      options = inlineOptions.split('|').map(o => o.trim());
    }

    fields.push({
      name: fieldName,
      type: fieldType,
      required,
      label,
      options,
      placeholder: placeholder || undefined
    });
  }

  if (fields.length === 0) return null;

  return {
    name: formName,
    description,
    fields
  };
}

// Generate completed form data from case resolution
export function generateFormFromResolution(
  caseData: CaseWithRelations,
  formDefinition: FormDefinition,
  outcome: CaseOutcome,
  selectedOptionId: string | null
): CompletedForm {
  const now = new Date().toISOString();
  const data: Record<string, string | boolean> = {};

  // Get selected option name if available
  const selectedOption = selectedOptionId
    ? caseData.options.find(o => o.id === selectedOptionId)
    : null;

  // Get participant names
  const participantNames = caseData.participants.map(p => p.name).join(', ');

  // Get a summary of the discussion from messages
  const discussionSummary = summarizeDiscussion(caseData.messages, caseData.participants);

  // Auto-fill form fields based on field names and available data
  for (const field of formDefinition.fields) {
    const fieldNameLower = field.name.toLowerCase();

    if (field.type === 'checkbox') {
      // For checkboxes, default to true if outcome is 'agreed' and field suggests consent/agreement
      if (fieldNameLower.includes('consent') || fieldNameLower.includes('agree')) {
        data[field.name] = outcome === 'agreed';
      } else {
        data[field.name] = false;
      }
    } else if (field.type === 'date') {
      // Date fields get today's date
      data[field.name] = now.split('T')[0];
    } else if (field.type === 'select' && field.options && field.options.length > 0) {
      // For select, choose first option as default (can be refined later)
      data[field.name] = field.options[0];
    } else {
      // Text/textarea fields - try to auto-fill based on field name patterns
      data[field.name] = autoFillTextField(
        field.name,
        fieldNameLower,
        caseData,
        outcome,
        selectedOption?.name || null,
        participantNames,
        discussionSummary
      );
    }
  }

  return {
    formName: formDefinition.name,
    completedBy: 'system', // Could be an agent ID in future
    completedAt: now,
    data,
    caseOutcome: outcome,
    selectedOption: selectedOption?.name
  };
}

// Auto-fill text fields based on common patterns
function autoFillTextField(
  fieldName: string,
  fieldNameLower: string,
  caseData: CaseWithRelations,
  outcome: CaseOutcome,
  selectedOptionName: string | null,
  participantNames: string,
  discussionSummary: string
): string {
  // Common field patterns and their auto-fill logic
  if (fieldNameLower.includes('parties') || fieldNameLower.includes('participants') || fieldNameLower.includes('attendees')) {
    return participantNames;
  }

  if (fieldNameLower.includes('resolution') || fieldNameLower.includes('outcome') || fieldNameLower.includes('agreed')) {
    if (outcome === 'agreed' && selectedOptionName) {
      return `Agreement reached: ${selectedOptionName}`;
    } else if (outcome === 'agreed') {
      return 'Parties reached mutual agreement';
    } else if (outcome === 'failed') {
      return 'Negotiation did not reach agreement';
    }
    return `Outcome: ${outcome}`;
  }

  if (fieldNameLower.includes('summary') || fieldNameLower.includes('description') || fieldNameLower.includes('dispute')) {
    return discussionSummary;
  }

  if (fieldNameLower.includes('case') && fieldNameLower.includes('reference')) {
    return caseData.id;
  }

  if (fieldNameLower.includes('notes') || fieldNameLower.includes('observations')) {
    return `Case resolved with outcome: ${outcome}. ${caseData.resolutionSummary || ''}`.trim();
  }

  if (fieldNameLower.includes('concession')) {
    return extractConcessions(caseData.messages, caseData.participants);
  }

  if (fieldNameLower.includes('action') || fieldNameLower.includes('follow')) {
    return extractActionItems(caseData.messages);
  }

  // Default: empty string for unknown fields
  return '';
}

// Summarize discussion from messages
function summarizeDiscussion(messages: Message[], participants: CaseWithRelations['participants']): string {
  if (messages.length === 0) return 'No discussion recorded.';

  const participantMap = new Map(participants.map(p => [p.id, p.name]));
  const keyPoints: string[] = [];

  // Extract key discussion points from proposals and important messages
  for (const msg of messages) {
    if (msg.type === 'proposal' || msg.type === 'counter') {
      const authorName = participantMap.get(msg.author) || msg.author;
      // Get first sentence or first 100 chars
      const summary = msg.content.split('.')[0].slice(0, 100);
      keyPoints.push(`${authorName}: ${summary}`);
    }
  }

  if (keyPoints.length === 0) {
    return `Discussion between ${participants.map(p => p.name).join(', ')}.`;
  }

  return keyPoints.slice(0, 5).join('. ') + '.';
}

// Extract concessions from the conversation
function extractConcessions(messages: Message[], participants: CaseWithRelations['participants']): string {
  const participantMap = new Map(participants.map(p => [p.id, p.name]));
  const concessions: string[] = [];

  // Look for accept messages that indicate concessions
  for (const msg of messages) {
    if (msg.type === 'accept') {
      const authorName = participantMap.get(msg.author) || msg.author;
      concessions.push(`${authorName} accepted the proposal`);
    }
  }

  return concessions.length > 0 ? concessions.join('; ') : 'No explicit concessions recorded.';
}

// Extract action items from messages
function extractActionItems(messages: Message[]): string {
  // Look for messages mentioning actions, next steps, or follow-up
  const actionKeywords = ['will', 'shall', 'need to', 'must', 'should', 'action', 'next', 'follow'];

  for (const msg of messages.slice().reverse()) {
    const contentLower = msg.content.toLowerCase();
    if (actionKeywords.some(kw => contentLower.includes(kw))) {
      // Get the sentence containing the action keyword
      const sentences = msg.content.split(/[.!?]+/);
      for (const sentence of sentences) {
        if (actionKeywords.some(kw => sentence.toLowerCase().includes(kw))) {
          return sentence.trim();
        }
      }
    }
  }

  return 'To be determined based on agreement terms.';
}
