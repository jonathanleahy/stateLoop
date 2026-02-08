/**
 * AI Response Validation
 *
 * Validates JSON responses from AI for setup and submit endpoints.
 * Returns actionable error messages so the AI can fix and retry.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  hint?: string;
}

export interface SetupRequest {
  setup?: {
    title?: string;
    location?: string;
    taskType?: string;
    maxRounds?: number;
    agents?: Array<{
      name?: string;
      role?: string;
      agenda?: string;
      agreeability?: number;
      appearance?: Record<string, any>;
    }>;
    options?: Array<{
      name?: string;
      description?: string;
    }>;
    inputDocuments?: Array<{
      name?: string;
      content?: string;
    }>;
    workingDocuments?: Array<{
      name?: string;
      description?: string;
      template?: string;
    }>;
    publicInfo?: string;
    rules?: string;
  };
  firstAgent?: {
    name?: string;
    thoughts?: string;
    message?: string;
  };
}

export interface SubmitRequest {
  taskId?: string;
  agentId?: string;
  response?: {
    type?: string;
    content?: string;
    thoughts?: string;
    optionId?: string;
    documentUpdates?: Array<{
      document?: string;
      action?: string;
      content?: string;
      section?: string;
    }>;
  };
}

const VALID_RESPONSE_TYPES = ['proposal', 'counter', 'accept', 'reject', 'message'];
const VALID_DOCUMENT_ACTIONS = ['append', 'prepend', 'replace', 'replace_section'];

/**
 * Validate setup request from AI
 */
export function validateSetupRequest(request: SetupRequest): ValidationResult {
  const errors: string[] = [];

  // Check top-level required fields
  if (!request.setup) {
    errors.push('Missing required field: setup');
  } else {
    // Validate agents
    if (!request.setup.agents) {
      errors.push('Missing required field: setup.agents');
    } else if (!Array.isArray(request.setup.agents)) {
      errors.push('setup.agents must be an array');
    } else if (request.setup.agents.length < 2) {
      errors.push(`At least 2 agents required, got ${request.setup.agents.length}`);
    } else {
      // Validate each agent
      request.setup.agents.forEach((agent, index) => {
        if (!agent.name || typeof agent.name !== 'string' || agent.name.trim() === '') {
          errors.push(`Agent at index ${index} missing required field: name`);
        }
        if (!agent.agenda || typeof agent.agenda !== 'string' || agent.agenda.trim() === '') {
          errors.push(`Agent '${agent.name || `at index ${index}`}' missing required field: agenda`);
        }
        if (agent.agreeability !== undefined) {
          if (typeof agent.agreeability !== 'number') {
            errors.push(`Agent '${agent.name || `at index ${index}`}' agreeability must be a number, got: ${typeof agent.agreeability}`);
          } else if (agent.agreeability < 0 || agent.agreeability > 100) {
            errors.push(`Agent '${agent.name || `at index ${index}`}' agreeability must be 0-100, got: ${agent.agreeability}`);
          }
        }
      });
    }

    // Validate options if taskType requires them
    const taskType = request.setup.taskType || 'options';
    if (taskType === 'options' || taskType === 'both') {
      if (!request.setup.options || !Array.isArray(request.setup.options) || request.setup.options.length === 0) {
        errors.push(`Options required for taskType '${taskType}'`);
      } else {
        request.setup.options.forEach((opt, index) => {
          if (!opt.name || typeof opt.name !== 'string' || opt.name.trim() === '') {
            errors.push(`Option at index ${index} missing required field: name`);
          }
        });
      }
    }

    // Validate input documents if provided
    if (request.setup.inputDocuments && Array.isArray(request.setup.inputDocuments)) {
      request.setup.inputDocuments.forEach((doc, index) => {
        if (!doc.name || typeof doc.name !== 'string' || doc.name.trim() === '') {
          errors.push(`Input document at index ${index} missing required field: name`);
        }
        if (!doc.content || typeof doc.content !== 'string') {
          errors.push(`Input document '${doc.name || `at index ${index}`}' missing required field: content`);
        }
      });
    }

    // Validate working documents if provided
    if (request.setup.workingDocuments && Array.isArray(request.setup.workingDocuments)) {
      request.setup.workingDocuments.forEach((doc, index) => {
        if (!doc.name || typeof doc.name !== 'string' || doc.name.trim() === '') {
          errors.push(`Working document at index ${index} missing required field: name`);
        }
      });
    }
  }

  // Validate firstAgent
  if (!request.firstAgent) {
    errors.push('Missing required field: firstAgent');
  } else {
    if (!request.firstAgent.name || typeof request.firstAgent.name !== 'string' || request.firstAgent.name.trim() === '') {
      errors.push('Missing required field: firstAgent.name');
    } else if (request.setup?.agents && Array.isArray(request.setup.agents)) {
      // Check that firstAgent.name matches an agent
      const agentNames = request.setup.agents.map(a => a.name).filter(Boolean);
      if (!agentNames.includes(request.firstAgent.name)) {
        errors.push(`firstAgent.name '${request.firstAgent.name}' does not match any agent. Available agents: ${agentNames.join(', ')}`);
      }
    }
    if (!request.firstAgent.message || typeof request.firstAgent.message !== 'string' || request.firstAgent.message.trim() === '') {
      errors.push('Missing required field: firstAgent.message');
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      hint: 'Fix the issues above and resubmit to /api/cases/:id/setup'
    };
  }

  return { valid: true, errors: [] };
}

/**
 * Validate submit request from AI
 */
export function validateSubmitRequest(
  request: SubmitRequest,
  currentTurn: string | null,
  optionIds: string[],
  workingDocNames: string[]
): ValidationResult {
  const errors: string[] = [];

  // Check top-level required fields
  if (!request.taskId || typeof request.taskId !== 'string' || request.taskId.trim() === '') {
    errors.push('Missing required field: taskId');
  }

  if (!request.agentId || typeof request.agentId !== 'string' || request.agentId.trim() === '') {
    errors.push('Missing required field: agentId');
  } else if (currentTurn && request.agentId !== currentTurn) {
    errors.push(`Not this agent's turn. Expected: ${currentTurn}, got: ${request.agentId}`);
  }

  if (!request.response) {
    errors.push('Missing required field: response');
  } else {
    // Validate response type
    if (!request.response.type || typeof request.response.type !== 'string') {
      errors.push('Missing required field: response.type');
    } else if (!VALID_RESPONSE_TYPES.includes(request.response.type)) {
      errors.push(`Invalid response type: '${request.response.type}'. Must be one of: ${VALID_RESPONSE_TYPES.join(', ')}`);
    }

    // Validate content
    if (!request.response.content || typeof request.response.content !== 'string' || request.response.content.trim() === '') {
      errors.push('Missing required field: response.content');
    }

    // Validate optionId for proposal/counter types
    if (request.response.type === 'proposal' || request.response.type === 'counter') {
      if (!request.response.optionId || typeof request.response.optionId !== 'string') {
        errors.push(`optionId required for type '${request.response.type}'`);
      } else if (!optionIds.includes(request.response.optionId)) {
        errors.push(`Option ID '${request.response.optionId}' not found in case. Available: ${optionIds.join(', ')}`);
      }
    }

    // Validate documentUpdates if present
    if (request.response.documentUpdates !== undefined) {
      if (!Array.isArray(request.response.documentUpdates)) {
        errors.push('documentUpdates must be an array');
      } else {
        request.response.documentUpdates.forEach((update, index) => {
          if (!update.document || typeof update.document !== 'string') {
            errors.push(`documentUpdates[${index}] missing required field: document`);
          } else if (!workingDocNames.includes(update.document)) {
            errors.push(`Document '${update.document}' not found. Available: ${workingDocNames.join(', ') || '(none)'}`);
          }

          if (!update.action || typeof update.action !== 'string') {
            errors.push(`documentUpdates[${index}] missing required field: action`);
          } else if (!VALID_DOCUMENT_ACTIONS.includes(update.action)) {
            errors.push(`documentUpdates[${index}] invalid action '${update.action}'. Must be: ${VALID_DOCUMENT_ACTIONS.join(', ')}`);
          }

          if (!update.content || typeof update.content !== 'string') {
            errors.push(`documentUpdates[${index}] missing required field: content`);
          }

          if (update.action === 'replace_section' && (!update.section || typeof update.section !== 'string')) {
            errors.push(`documentUpdates[${index}] requires 'section' field for action 'replace_section'`);
          }
        });
      }
    }
  }

  if (errors.length > 0) {
    const hints: string[] = ['Fix the issues above and resubmit.'];
    if (optionIds.length > 0) {
      hints.push(`Available option IDs: ${optionIds.join(', ')}`);
    }
    if (workingDocNames.length > 0) {
      hints.push(`Available documents: ${workingDocNames.join(', ')}`);
    }
    return {
      valid: false,
      errors,
      hint: hints.join(' ')
    };
  }

  return { valid: true, errors: [] };
}

/**
 * Build a validation error response object
 */
export function buildValidationErrorResponse(result: ValidationResult): {
  error: string;
  message: string;
  details: string[];
  hint: string;
} {
  return {
    error: 'VALIDATION_ERROR',
    message: 'Validation failed',
    details: result.errors,
    hint: result.hint || 'Fix the issues and resubmit'
  };
}

// ============================================
// Company Validation
// ============================================

export interface CompanySetupValidationRequest {
  setup?: {
    industry?: string;
    size?: string;
    description?: string;
    primaryColor?: string;
    secondaryColor?: string;
    buildings?: Array<{
      name?: string;
      address?: string;
      city?: string;
      country?: string;
      description?: string;
      locationType?: string;
      rooms?: Array<{
        name?: string;
        roomType?: string;
        floor?: number;
        capacity?: number;
        furniture?: string[];
        description?: string;
      }>;
    }>;
    policies?: Array<{
      category?: string;
      title?: string;
      summary?: string;
      fullText?: string;
      effectiveDate?: string;
    }>;
    employees?: Array<{
      agentName?: string;
      jobTitle?: string;
      department?: string;
      managerAgentName?: string;
      employmentType?: string;
    }>;
  };
}

const VALID_COMPANY_SIZES = ['small', 'medium', 'large', 'enterprise'];
const VALID_ROOM_TYPES = ['office', 'meeting_room', 'break_room', 'studio', 'reception', 'storage', 'lab', 'other'];
const VALID_LOCATION_TYPES = ['hospital', 'office', 'school', 'library', 'cafe', 'park', 'studio', 'courtroom', 'outdoor'];
const VALID_EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contractor'];

/**
 * Validate company setup request from AI
 */
export function validateCompanySetupRequest(request: CompanySetupValidationRequest): ValidationResult {
  const errors: string[] = [];

  if (!request.setup) {
    errors.push('Missing required field: setup');
    return {
      valid: false,
      errors,
      hint: 'Provide a setup object with company details'
    };
  }

  const { setup } = request;

  // Validate size if provided
  if (setup.size && !VALID_COMPANY_SIZES.includes(setup.size)) {
    errors.push(`Invalid company size: '${setup.size}'. Must be one of: ${VALID_COMPANY_SIZES.join(', ')}`);
  }

  // Validate buildings
  if (setup.buildings && Array.isArray(setup.buildings)) {
    setup.buildings.forEach((building, bIndex) => {
      if (!building.name || typeof building.name !== 'string' || building.name.trim() === '') {
        errors.push(`Building at index ${bIndex} missing required field: name`);
      }
      if (building.locationType && !VALID_LOCATION_TYPES.includes(building.locationType)) {
        errors.push(`Building '${building.name || `at index ${bIndex}`}' has invalid locationType: '${building.locationType}'. Must be one of: ${VALID_LOCATION_TYPES.join(', ')}`);
      }

      // Validate rooms within building
      if (building.rooms && Array.isArray(building.rooms)) {
        building.rooms.forEach((room, rIndex) => {
          if (!room.name || typeof room.name !== 'string' || room.name.trim() === '') {
            errors.push(`Room at index ${rIndex} in building '${building.name || bIndex}' missing required field: name`);
          }
          if (!room.roomType || typeof room.roomType !== 'string') {
            errors.push(`Room '${room.name || `at index ${rIndex}`}' in building '${building.name || bIndex}' missing required field: roomType`);
          } else if (!VALID_ROOM_TYPES.includes(room.roomType)) {
            errors.push(`Room '${room.name || `at index ${rIndex}`}' has invalid roomType: '${room.roomType}'. Must be one of: ${VALID_ROOM_TYPES.join(', ')}`);
          }
          if (room.furniture && !Array.isArray(room.furniture)) {
            errors.push(`Room '${room.name || `at index ${rIndex}`}' furniture must be an array of strings`);
          }
        });
      }
    });
  }

  // Validate policies
  if (setup.policies && Array.isArray(setup.policies)) {
    setup.policies.forEach((policy, pIndex) => {
      if (!policy.category || typeof policy.category !== 'string' || policy.category.trim() === '') {
        errors.push(`Policy at index ${pIndex} missing required field: category`);
      }
      if (!policy.title || typeof policy.title !== 'string' || policy.title.trim() === '') {
        errors.push(`Policy at index ${pIndex} missing required field: title`);
      }
      if (!policy.summary || typeof policy.summary !== 'string' || policy.summary.trim() === '') {
        errors.push(`Policy '${policy.title || `at index ${pIndex}`}' missing required field: summary`);
      }
      if (!policy.fullText || typeof policy.fullText !== 'string' || policy.fullText.trim() === '') {
        errors.push(`Policy '${policy.title || `at index ${pIndex}`}' missing required field: fullText`);
      }
    });
  }

  // Validate employees
  if (setup.employees && Array.isArray(setup.employees)) {
    setup.employees.forEach((emp, eIndex) => {
      if (!emp.agentName || typeof emp.agentName !== 'string' || emp.agentName.trim() === '') {
        errors.push(`Employee at index ${eIndex} missing required field: agentName`);
      }
      if (!emp.jobTitle || typeof emp.jobTitle !== 'string' || emp.jobTitle.trim() === '') {
        errors.push(`Employee '${emp.agentName || `at index ${eIndex}`}' missing required field: jobTitle`);
      }
      if (emp.employmentType && !VALID_EMPLOYMENT_TYPES.includes(emp.employmentType)) {
        errors.push(`Employee '${emp.agentName || `at index ${eIndex}`}' has invalid employmentType: '${emp.employmentType}'. Must be one of: ${VALID_EMPLOYMENT_TYPES.join(', ')}`);
      }
    });
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      hint: 'Fix the issues above and resubmit to /api/companies/:id/setup'
    };
  }

  return { valid: true, errors: [] };
}
