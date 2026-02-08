# StateLoop API Design

## Base URL
```
http://localhost:3000/api
```

## API Discovery

**Endpoint:** `GET /api`

Returns API information and discovery links.

**Response:** `200 OK`
```json
{
  "name": "StateLoop API",
  "version": "1.0.0",
  "endpoints": {
    "cases": "/api/cases",
    "logs": "/api/logs",
    "scenarios": "/api/scenarios",
    "reset": "/api/reset"
  }
}
```

---

## Key Concepts

### Stateless Turn Management
The system tracks whose turn it is internally. Agents don't need to identify themselves when requesting work - the system knows who should act next.

### Private Agendas
Each agent has a private agenda extracted from the case description. When an agent acts, they only see their own private context, not other agents' instructions.

---

## Endpoints

### 1. Create Case
Creates a new negotiation case from a text description.

**Endpoint:** `POST /api/cases`

**Request Body:**
```json
{
  "scenario": "AGENT: Alice\nSECRET AGENDA: You prefer Italian...\n\nAGENT: Bob\nSECRET AGENDA: You're vegetarian...\n\nOPTIONS:\n- Olive Garden\n- Taco Town",
  "participants": [
    {
      "id": "person-0",
      "name": "Alice",
      "preferences": [],
      "constraints": [],
      "isPayer": false
    },
    {
      "id": "person-1",
      "name": "Bob",
      "preferences": [],
      "constraints": [],
      "isPayer": false
    }
  ],
  "options": [
    {
      "id": "opt-1",
      "name": "Olive Garden",
      "category": "Italian",
      "priceRange": "$$",
      "features": []
    },
    {
      "id": "opt-2",
      "name": "Taco Town",
      "category": "Mexican",
      "priceRange": "$",
      "features": []
    }
  ]
}
```

**Note:** The UI parses the scenario text to automatically populate participants and options arrays.

**Response:** `201 Created`
```json
{
  "id": "case-abc123",
  "status": "active",
  "scenario": "...",
  "currentTurn": "case-abc123-person-0",
  "participants": [...],
  "options": [...],
  "messages": [],
  "createdAt": "2024-01-15T10:30:00Z"
}
```

---

### 2. Get Case
Retrieves full case state with all relations.

**Endpoint:** `GET /api/cases/:id`

**Response:** `200 OK`
```json
{
  "id": "case-abc123",
  "status": "active",
  "scenario": "...",
  "participants": [...],
  "options": [...],
  "messages": [
    {
      "id": "msg-1",
      "author": "case-abc123-person-0",
      "type": "proposal",
      "content": "How about Olive Garden?",
      "optionId": "case-abc123-opt-1",
      "timestamp": "2024-01-15T10:35:00Z",
      "agentContext": "You are Alice. You prefer Italian..."
    }
  ],
  "bossMessages": [...],
  "currentTurn": "case-abc123-person-1",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:35:00Z"
}
```

---

### 3. List Cases
Lists all cases.

**Endpoint:** `GET /api/cases`

**Response:** `200 OK`
```json
[
  {
    "id": "case-abc123",
    "status": "active",
    "scenario": "...",
    "createdAt": "2024-01-15T10:30:00Z"
  }
]
```

---

### 4. Auto-Play (Primary Endpoint)
Executes a full turn for the current agent. This is the main endpoint used to advance the negotiation.

**Endpoints:**
- `GET /api/cases/:id/auto-play` - Auto-play for specific case
- `GET /api/auto-play` - Auto-play for most recent active case

**What it does:**
1. Identifies whose turn it is
2. Extracts that agent's private agenda from the scenario
3. Builds context with conversation history
4. Calls Claude API to generate response
5. Submits the response
6. Advances turn to next agent
7. Auto-resolves if accept received

**Response:** `200 OK`
```json
{
  "success": true,
  "message": {
    "id": "msg-2",
    "author": "case-abc123-person-1",
    "type": "counter",
    "content": "I'd prefer Taco Town since I'm vegetarian.",
    "optionId": "case-abc123-opt-2",
    "timestamp": "2024-01-15T10:36:00Z",
    "agentContext": "You are Bob. You're vegetarian..."
  },
  "caseStatus": "active",
  "nextTurn": "case-abc123-person-0"
}
```

**Response when case resolved:** `200 OK`
```json
{
  "success": true,
  "message": {...},
  "caseStatus": "resolved",
  "outcome": "agreed",
  "selectedOptionId": "case-abc123-opt-2"
}
```

---

### 5. Get Next Task (Manual Mode)
Returns work for an agent to process manually.

**Endpoint:** `GET /api/cases/:id/next-task`

**Query Parameters:**
- `agentId` (optional): Specific agent ID. If not provided, returns task for current turn agent.

**Response:** `200 OK`
```json
{
  "caseId": "case-abc123",
  "taskId": "task-xyz789",
  "role": {
    "id": "case-abc123-person-0",
    "name": "Alice",
    "preferences": [],
    "constraints": [],
    "isPayer": false
  },
  "scenario": "Overview of the negotiation...",
  "options": [...],
  "conversationHistory": [...],
  "instruction": "You are Alice. [Private agenda]. Review the conversation and respond.",
  "bossMessages": [...]
}
```

**Response:** `204 No Content` (when no work available)

---

### 6. Submit Response (Manual Mode)
Submits an agent's response manually.

**Endpoint:** `POST /api/cases/:id/submit`

**Request Body:**
```json
{
  "taskId": "task-xyz789",
  "agentId": "case-abc123-person-0",
  "agentContext": "The private agenda this agent received",
  "response": {
    "type": "accept",
    "content": "Taco Town works for me!",
    "thoughts": "This meets my vegetarian needs",
    "optionId": "case-abc123-opt-2",
    "documentUpdates": [
      {
        "document": "decisions",
        "action": "append",
        "content": "- AGREED: Taco Town selected"
      }
    ]
  }
}
```

**Response Types:**
- `proposal` - Suggest an option
- `counter` - Counter-propose a different option
- `accept` - Accept the current proposal (triggers resolution)
- `reject` - Reject without counter-proposal
- `message` - General message (question, clarification)

**Thoughts (optional):**
Include `thoughts` field to show the agent's internal reasoning. Displayed in the UI's Agent Thoughts panel but not visible to other agents.

**Document Updates (optional):**
Include `documentUpdates` array to edit working documents collaboratively:

| Action | Description |
|--------|-------------|
| `append` | Add content to end of document |
| `prepend` | Add content to beginning |
| `replace` | Replace entire document content |
| `replace_section` | Replace a named section (requires `section` field) |

**Response:** `200 OK`

The response format depends on the request's Accept header:

**JSON Response** (when `Content-Type: application/json` is sent):
```json
{
  "messageId": "msg-3",
  "caseStatus": "resolved",
  "outcome": "agreed",
  "selectedOptionId": "case-abc123-opt-2"
}
```

**Text Response** (default, for human-friendly output):

When case is still active (includes next agent's prompt for automatic continuation):
```
SUBMISSION ACCEPTED
===================
Your message was recorded. Case is still active.

NEXT TURN
=========
YOU ARE: Bob

YOUR PRIVATE AGENDA (only you know this):
...

[Full prompt for next agent]
```

When case is resolved:
```
SUBMISSION ACCEPTED
===================
Your message was recorded.

CASE RESOLVED
=============
Outcome: agreed
Selected: Taco Town
```

**Automatic Continuation:** When the case is still active, the text response includes the complete prompt for the next agent. This enables Claude to automatically process multiple turns without waiting for user input - just keep submitting responses until `caseStatus` becomes `"resolved"`.

---

### 7. Resolve Case (Manual)
Manually marks a case as resolved.

**Endpoint:** `POST /api/cases/:id/resolve`

**Request Body:**
```json
{
  "outcome": "agreed",
  "selectedOption": "case-abc123-opt-2",
  "summary": "Both parties agreed on Taco Town"
}
```

**Outcome Types:**
- `agreed` - Consensus reached
- `failed` - Unable to reach agreement
- `abandoned` - Case abandoned

**Response:** `200 OK`
```json
{
  "id": "case-abc123",
  "status": "resolved",
  "outcome": "agreed",
  "selectedOptionId": "case-abc123-opt-2",
  "resolvedAt": "2024-01-15T10:40:00Z"
}
```

---

### 8. Send Boss Message
Sends a message from the operator to agents.

**Endpoint:** `POST /api/cases/:id/boss-message`

**Request Body:**
```json
{
  "content": "Please try to reach a decision soon!",
  "targetAgent": "case-abc123-person-0"
}
```

**Response:** `200 OK`
```json
{
  "messageId": "boss-msg-1",
  "timestamp": "2024-01-15T10:38:00Z"
}
```

---

### 9. Get Request Logs
Retrieves API request logs for auditing.

**Endpoint:** `GET /api/logs`

**Query Parameters:**
- `limit` (optional): Number of logs to return (default: 50)
- `offset` (optional): Pagination offset
- `caseId` (optional): Filter by case ID

**Response:** `200 OK`
```json
{
  "logs": [
    {
      "id": "log-1",
      "method": "GET",
      "path": "/api/cases/abc123/auto-play",
      "statusCode": 200,
      "timestamp": "2024-01-15T10:35:00Z",
      "durationMs": 1234
    }
  ],
  "total": 156
}
```

---

### 10. Reset Database
Clears all data for testing.

**Endpoint:** `POST /api/reset`

**Response:** `200 OK`
```json
{
  "message": "Database reset successfully"
}
```

---

### 11. Set Agent Appearance
Sets visual appearance for an agent (typically called by AI during setup phase).

**Endpoint:** `POST /api/cases/:id/set-appearance`

**Request Body:**
```json
{
  "agentName": "Alice",
  "appearance": {
    "accessory": "glasses",
    "bodyStyle": "normal",
    "color": "#3498db",
    "skinTone": "#d4a574",
    "gender": "female",
    "professionalRole": "nurse_scrubs",
    "voice": {
      "pitch": 1.1,
      "rate": 0.95,
      "voiceType": "female"
    }
  }
}
```

**Appearance Properties:**
| Property | Options | Description |
|----------|---------|-------------|
| age | child, teen, adult, middle, elderly | Age group affecting size/scale |
| gender | male, female | Gender presentation |
| bodyStyle | normal, tall, short, wide, athletic | Body proportions |
| shapeType | box, cylinder, oval | 3D body shape (3D mode only) |
| skinTone | Hex color or preset (1-6) | Skin color |
| hairColor | black, brown, auburn, blonde, gray, white, red | Hair color |
| color | Hex color | Clothing color |
| accessory | none, hat, glasses, bowtie, headphones, scarf | Agent accessory |
| professionalRole | none, nurse_scrubs, doctor_coat, police_uniform, teacher, business_suit, healthcare_assistant | Professional uniform |
| mobility | standing, wheelchair, walking_stick, zimmer_frame | Mobility aid |
| voice | { pitch, rate, voiceType } | Text-to-speech settings |

**Response:** `200 OK`
```json
{
  "success": true,
  "agentId": "case-abc123-person-0",
  "appearance": {...}
}
```

---

### 12. Get Case History
Returns conversation history optimized for playback.

**Endpoint:** `GET /api/cases/:id/history`

**Response:** `200 OK`
```json
{
  "caseId": "case-abc123",
  "scenario": "...",
  "status": "resolved",
  "outcome": "agreed",
  "participants": [...],
  "options": [...],
  "timeline": [
    {
      "index": 0,
      "messageId": "msg-1",
      "speaker": "Alice",
      "speakerId": "case-abc123-person-0",
      "type": "proposal",
      "content": "How about Zen?",
      "timestamp": "2024-01-01T12:00:00Z"
    }
  ],
  "totalMessages": 5
}
```

---

### 13. Run Case to Completion
Pre-runs a case to completion using simulated responses.

**Endpoint:** `POST /api/cases/:id/run`

**Query Parameters:**
- `maxRounds` (optional): Maximum rounds before stopping (default: 20)

**Document Writing:**
The endpoint automatically writes to working documents during simulation:
- **Proposals** → Appends to `script` document
- **Accepts** → Appends to `decisions` document
- **Early messages** → Appends to `notes` document

**Response:** `200 OK`
```json
{
  "status": "resolved",
  "outcome": "agreed",
  "rounds": 6,
  "messageCount": 6,
  "log": [
    "  [DOC] notes: append - Opening position...",
    "[Alice] (message): I believe we should...",
    "  [DOC] script: append - [Alice's proposal]...",
    "[Alice] (proposal): I propose Option A.",
    "  [DOC] decisions: append - AGREED: Option A...",
    "[Bob] (accept): Let's do it."
  ],
  "historyUrl": "/api/cases/case-abc123/history"
}
```

The log includes `[DOC]` entries showing document updates.

---

### 14. Reopen Case
Reopens a resolved case for continued discussion. Automatically increases MAX_ROUNDS to prevent immediate timeout.

**Endpoint:** `POST /api/cases/:id/reopen`

**Request Body:**
```json
{
  "reason": "Let's reconsider the options.",
  "additionalRounds": 10
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `reason` | string | "Manually reopened" | Reason for reopening |
| `additionalRounds` | number | 10 | Extra rounds added to MAX_ROUNDS |

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Case reopened for continued discussion",
  "caseId": "case-abc123",
  "currentTurn": "case-abc123-person-0",
  "additionalRounds": 10,
  "reason": "Let's reconsider the options."
}
```

**Behavior:**
- Sets case status back to `active`
- Clears outcome, selected option, and resolution summary
- Increases `MAX_ROUNDS` in scenario by `additionalRounds` (default 10)
- If no MAX_ROUNDS existed, adds `MAX_ROUNDS: 30`

---

### 15. List Scenarios
Lists available pre-made scenario files.

**Endpoint:** `GET /api/scenarios`

**Response:** `200 OK`
```json
{
  "scenarios": [
    {
      "name": "hospital-hydration",
      "title": "Hospital Hydration Discussion"
    }
  ]
}
```

---

### 16. Load Scenario
Creates a new case from a pre-made scenario file.

**Endpoint:** `POST /api/scenarios/:name/load`

**Response:** `201 Created`
```json
{
  "caseId": "case-xyz789",
  "scenario": "..."
}
```

---

### 17. Get Scenario Content
Retrieves the content of a specific scenario file.

**Endpoint:** `GET /api/scenarios/:name`

**Response:** `200 OK`
```json
{
  "name": "hospital-hydration",
  "content": "LOCATION: hospital\n\nPUBLIC INFO:\n..."
}
```

---

### 18. Reset Case
Resets a case to restart the negotiation.

**Endpoint:** `POST /api/cases/:id/reset`

**Query Parameters:**
- `full` (optional): If "true", performs a full reset including regenerating agents

**Request Body (optional):**
```json
{
  "keepAgents": true
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "caseId": "case-abc123",
  "status": "active",
  "messageCount": 0
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "CASE_NOT_FOUND",
    "message": "Case with ID 'case-xyz' not found"
  }
}
```

### Error Codes
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `CASE_NOT_FOUND` | 404 | Case does not exist |
| `INVALID_AGENT` | 400 | Agent ID not in case participants |
| `NOT_YOUR_TURN` | 409 | Agent submitted out of turn |
| `CASE_RESOLVED` | 409 | Case is already resolved |
| `INVALID_RESPONSE` | 400 | Response format invalid |
| `TASK_EXPIRED` | 410 | Task ID no longer valid |
| `VALIDATION_ERROR` | 400 | Missing required fields or invalid values |
| `JSON_PARSE_ERROR` | 400 | Request body is not valid JSON |

### AI Response Validation Errors

When an AI submits malformed or invalid JSON to `/api/cases/:id/setup` or `/api/cases/:id/submit`, the backend returns actionable error messages:

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Setup validation failed",
  "details": [
    "Agent at index 2 missing required field: agenda",
    "Agent 'Bob' agreeability must be 0-100, got: 150",
    "firstAgent.name 'Carol' does not match any agent"
  ],
  "hint": "Fix the issues above and resubmit to /api/cases/:id/setup"
}
```

**Validation checks for `/api/cases/:id/setup`:**
- `setup` object is required
- `setup.agents` must have at least 2 agents
- Each agent needs `name` and `agenda` fields
- `agreeability` must be 0-100 if specified
- `options` required if taskType includes option selection
- `firstAgent` must reference a valid agent name

**Validation checks for `/api/cases/:id/submit`:**
- `taskId` and `agentId` are required
- `agentId` must match the current turn
- `response.type` must be: proposal, counter, accept, reject, or message
- `response.content` is required
- `optionId` required for proposal/counter types
- `optionId` must exist in the case
- `documentUpdates` array entries must reference existing documents

The `details` array lists all issues found (not just the first). The `hint` field provides guidance for fixing. This allows AI to correct all issues in one retry.

---

## Private Agenda Extraction

When the auto-play endpoint runs, it extracts the current agent's private agenda using these patterns:

1. `AGENT: Name` followed by content until next `AGENT:` or section
2. Sections like `SECRET AGENDA:`, `PRIVATE:`, `AGENDA:` within agent block
3. All text between an agent's name and the next agent/section

Example extraction for "Alice" from:
```
AGENT: Alice
SECRET AGENDA: You prefer Italian food and have a $30 budget.

AGENT: Bob
SECRET AGENDA: You're vegetarian.
```

Alice receives: "You prefer Italian food and have a $30 budget."
Bob receives: "You're vegetarian."

Neither agent sees the other's agenda.

---

## Variability & Randomness (Planned)

> **Note:** Variability features are planned but not yet implemented. This section documents the intended API design.

Control how predictable agent responses are to create natural conversation variation.

### Case-Level Variability Settings

Set when creating a case or via setup:

```json
{
  "setup": {
    "temperature": 0.7,
    "moodSwings": true,
    "randomEvents": false,
    "chaosLevel": "normal"
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `temperature` | number | 0.5 | Overall randomness (0=deterministic, 1=creative) |
| `moodSwings` | boolean | false | Moods evolve based on conversation |
| `randomEvents` | boolean | false | Inject random interruptions |
| `chaosLevel` | string | "normal" | calm, normal, heated, chaotic |

### Agent-Level Variability Settings

Set per agent in setup:

```json
{
  "agents": [
    {
      "name": "Sarah",
      "agreeability": 55,
      "variability": 0.7,
      "mood": "enthusiastic",
      "quirks": ["goes on tangents", "changes mind when complimented"],
      "triggers": ["dismissive comments about her ideas"]
    }
  ]
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `variability` | number | 0.5 | How unpredictable (0=predictable, 1=chaotic) |
| `mood` | string | "neutral" | Current emotional state |
| `quirks` | string[] | [] | Behavioral tendencies |
| `triggers` | string[] | [] | Topics provoking strong reactions |

### Mood Values

| Mood | Agreeability Effect | Behavior |
|------|---------------------|----------|
| `neutral` | 0 | Default behavior |
| `enthusiastic` | +20 | Builds on ideas, supportive |
| `skeptical` | -20 | Questions everything |
| `tired` | +30 | Short responses, wants to finish |
| `frustrated` | -30 | Confrontational |
| `distracted` | 0 | Tangents, misses points |
| `inspired` | 0 | Creative solutions |

### Variability in Prompts

When `temperature > 0` or agent has `variability > 0.5`, the prompt includes:

```
VARIABILITY GUIDANCE:
With variability 0.7, you should:
- Sometimes agree with ideas you wouldn't normally support
- Occasionally go on brief tangents
- React emotionally to trigger topics
- Propose unexpected combinations
- Don't always push your stated preference
```

### Update Agent Mood

`PATCH /api/cases/:id/participants/:participantId`

```json
{
  "mood": "frustrated"
}
```

This allows dynamic mood changes during a case.

---

## Process Flows / Workflows (Planned)

> **Note:** Workflow features are planned but not yet implemented. This section documents the intended API design.

StateLoop will support chaining tasks together where output from one task becomes input to the next.

### 19. Create Workflow

Creates a new workflow with defined stages.

**Endpoint:** `POST /api/workflows`

**Request Body:**
```json
{
  "name": "Script Development",
  "description": "Generate ideas, then write the full script",
  "stages": [
    {
      "name": "Writers' Room",
      "scenarioTemplate": "{{scenario_brief}}",
      "outputDocument": "episode_structure"
    },
    {
      "name": "Script Writing",
      "scenarioTemplate": "Write a script based on:\n\n{{episode_structure}}",
      "inputMapping": [
        {
          "sourceStage": 1,
          "sourceDocument": "episode_structure",
          "targetDocument": "episode_structure",
          "targetType": "input"
        }
      ],
      "outputDocument": "final_script"
    }
  ]
}
```

**Response:** `201 Created`
```json
{
  "id": "workflow-abc123",
  "name": "Script Development",
  "status": "pending",
  "stages": [...],
  "currentStageIndex": 0
}
```

---

### 20. Get Workflow

Retrieves workflow details and progress.

**Endpoint:** `GET /api/workflows/:id`

**Response:** `200 OK`
```json
{
  "id": "workflow-abc123",
  "name": "Script Development",
  "status": "active",
  "progress": {
    "totalStages": 2,
    "completedStages": 1,
    "currentStageName": "Script Writing",
    "percentComplete": 50
  },
  "stages": [
    {
      "name": "Writers' Room",
      "status": "completed",
      "caseId": "case-xyz789",
      "outputPreview": "COLD OPEN: Basil practicing mindfulness..."
    },
    {
      "name": "Script Writing",
      "status": "active",
      "caseId": "case-abc456",
      "outputPreview": null
    }
  ]
}
```

---

### 21. Start Workflow

Begins workflow execution by creating the first stage's case.

**Endpoint:** `POST /api/workflows/:id/start`

**Request Body:**
```json
{
  "inputs": {
    "scenario_brief": "Write a 15-minute Fawlty Towers episode about a wellness weekend"
  }
}
```

**Response:** `200 OK`
```json
{
  "workflowId": "workflow-abc123",
  "currentStage": {
    "stageIndex": 1,
    "name": "Writers' Room",
    "caseId": "case-xyz789"
  },
  "prompt": "You are in a Writers' Room for a new Fawlty Towers episode..."
}
```

---

### 22. Advance Workflow

Moves to the next stage. Called automatically when a case resolves.

**Endpoint:** `POST /api/workflows/:id/advance`

**Response:** `200 OK`
```json
{
  "previousStage": {
    "stageIndex": 1,
    "name": "Writers' Room",
    "status": "completed"
  },
  "currentStage": {
    "stageIndex": 2,
    "name": "Script Writing",
    "caseId": "case-abc456"
  },
  "prompt": "You are a professional scriptwriter..."
}
```

---

### 23. Get Workflow Output

Retrieves the final output once workflow is complete.

**Endpoint:** `GET /api/workflows/:id/output`

**Response:** `200 OK`
```json
{
  "workflowId": "workflow-abc123",
  "status": "completed",
  "deliverables": [
    {
      "name": "episode_structure",
      "content": "COLD OPEN: Basil practicing mindfulness...",
      "producedBy": "Writers' Room"
    },
    {
      "name": "final_script",
      "content": "FAWLTY TOWERS\n\"The Wellness Weekend\"...",
      "producedBy": "Script Writing"
    }
  ],
  "summary": {
    "totalStages": 2,
    "totalDocuments": 2,
    "contributors": ["Sarah", "Mike", "Terry", "Scriptwriter"]
  }
}
```

---

## Goal-Driven Workflows (Planned)

> **Note:** Goal-driven workflows are planned but not yet implemented.

For dynamic workflows where the system plans the stages based on a high-level goal.

### 24. Create Goal

Creates a goal-driven workflow.

**Endpoint:** `POST /api/goals`

**Request Body:**
```json
{
  "goal": "Write a 15-minute Fawlty Towers episode",
  "goalType": "creative_writing",
  "outputRequirements": {
    "format": "script",
    "requirements": ["15 minutes", "Cold open + 3 acts"]
  },
  "resources": [
    { "name": "premise", "type": "constraint", "content": "Wellness weekend..." }
  ]
}
```

**Response:** `201 Created`
```json
{
  "id": "goal-abc123",
  "goal": "Write a 15-minute Fawlty Towers episode",
  "status": "planning"
}
```

---

### 25. Generate Plan

AI analyzes the goal and creates an execution plan.

**Endpoint:** `POST /api/goals/:id/plan`

**Response:** `200 OK`
```json
{
  "goalId": "goal-abc123",
  "plan": {
    "approach": "Collaborative ideation followed by focused writing",
    "phases": [
      { "name": "Creative Development", "type": "collaborative", "participantCount": 3 },
      { "name": "Script Drafting", "type": "solo", "participantCount": 1 }
    ]
  },
  "status": "ready"
}
```

---

### 26. Start Goal Execution

Begins executing the goal's plan.

**Endpoint:** `POST /api/goals/:id/start`

**Response:** `200 OK`
```json
{
  "goalId": "goal-abc123",
  "currentPhase": "Creative Development",
  "caseId": "case-xyz789",
  "prompt": "You are in a creative development session..."
}
```

---

## Document Flow

Documents flow between tasks automatically based on configuration.

### Document Source Types

| Source | Description |
|--------|-------------|
| `workflow_input` | Initial inputs provided when starting workflow |
| `previous_task` | Output document from the previous task |
| `static` | Inline content defined in workflow config |

### Document Target Types

| Target | Description |
|--------|-------------|
| `input` | Read-only reference document |
| `working` | Editable working document |

### Example Flow

```
Task 1 creates → "structure" (working doc)
                     ↓
Task 2 receives ← "structure" (as input doc, read-only)
Task 2 creates → "script" (working doc)
                     ↓
Task 3 receives ← "script" (as input doc)
Task 3 creates → "final_script" (working doc)
                     ↓
Workflow output ← "final_script"
```

---

## Workflow Error Handling

| Error Code | Description |
|------------|-------------|
| `WORKFLOW_NOT_FOUND` | Workflow ID does not exist |
| `WORKFLOW_NOT_STARTED` | Cannot advance a workflow that hasn't started |
| `WORKFLOW_COMPLETE` | Workflow already finished |
| `STAGE_FAILED` | Current stage case failed |
| `MISSING_INPUT` | Required input document not available |
| `GOAL_NOT_PLANNED` | Cannot start goal without generating plan first |

---

## Workflow Templates (YAML-Defined)

Workflows can be defined in YAML files and loaded via API.

### 27. List Workflow Templates

Lists available workflow template files.

**Endpoint:** `GET /api/workflow-templates`

**Response:** `200 OK`
```json
{
  "templates": [
    {
      "name": "script-development",
      "title": "Script Development Pipeline",
      "description": "Generate ideas collaboratively, then write the full script",
      "stages": 3,
      "inputCount": 3
    },
    {
      "name": "business-proposal",
      "title": "Business Proposal Workflow",
      "description": "Research, draft, review, and finalize proposals",
      "stages": 4,
      "inputCount": 2
    }
  ]
}
```

---

### 28. Get Workflow Template

Retrieves a specific workflow template with full details.

**Endpoint:** `GET /api/workflow-templates/:name`

**Response:** `200 OK`
```json
{
  "name": "script-development",
  "title": "Script Development Pipeline",
  "description": "Generate ideas collaboratively, then write the full script",
  "version": 1,
  "inputs": [
    { "name": "premise", "description": "The episode premise", "required": true },
    { "name": "format_guide", "description": "Style guidelines", "required": false }
  ],
  "stages": [
    {
      "name": "Writers' Room",
      "type": "collaborative",
      "agentCount": 3,
      "output": "structure"
    },
    {
      "name": "Script Drafting",
      "type": "solo",
      "agentCount": 1,
      "output": "script"
    }
  ],
  "output": {
    "primary": "reviewed_script",
    "include": ["structure", "review_notes"]
  }
}
```

---

### 29. Start Workflow from Template

Creates and starts a workflow from a template.

**Endpoint:** `POST /api/workflow-templates/:name/start`

**Request Body:**
```json
{
  "inputs": {
    "premise": "Fawlty Towers hosts a wellness weekend retreat...",
    "format_guide": "BBC sitcom format: Cold open, 3 acts...",
    "character_guide": "BASIL FAWLTY: Pompous hotel owner..."
  }
}
```

**Response:** `201 Created`
```json
{
  "workflowId": "workflow-abc123",
  "templateName": "script-development",
  "status": "active",
  "currentStage": {
    "stageIndex": 1,
    "name": "Writers' Room",
    "caseId": "case-xyz789"
  },
  "prompt": "You are in a Writers' Room session..."
}
```

---

## Workflow Diagrams

Visual representation of workflow structure.

### 30. Get Workflow Diagram (Mermaid Source)

Returns Mermaid diagram source for rendering.

**Endpoint:** `GET /api/workflows/:id/diagram`

**Query Parameters:**
- `format` (optional): `mermaid` (default) or `json`

**Response:** `200 OK`
```json
{
  "format": "mermaid",
  "source": "flowchart LR\n    subgraph Inputs\n        P[premise]\n        F[format_guide]\n    end\n    subgraph S1[Writers Room]\n        S1A[3 Agents]\n        S1D[(structure)]\n    end\n    P --> S1\n    S1 --> S2[Script Drafting]\n    S2 --> Output([final_script])"
}
```

---

### 31. Get Workflow Diagram (Rendered SVG)

Returns rendered SVG image of workflow.

**Endpoint:** `GET /api/workflows/:id/diagram.svg`

**Response:** `200 OK` (Content-Type: image/svg+xml)

Returns SVG markup for direct embedding in HTML.

---

### 32. Get Template Diagram

Returns diagram for a workflow template (before starting).

**Endpoint:** `GET /api/workflow-templates/:name/diagram`

**Response:** `200 OK`
```json
{
  "format": "mermaid",
  "source": "flowchart LR..."
}
```

---

## Workflow Progress

### 33. Get Workflow Progress

Returns detailed progress information.

**Endpoint:** `GET /api/workflows/:id/progress`

**Response:** `200 OK`
```json
{
  "workflowId": "workflow-abc123",
  "name": "Script Development Pipeline",
  "status": "active",
  "progress": {
    "percentComplete": 33,
    "totalStages": 3,
    "completedStages": 1,
    "currentStage": "Script Drafting"
  },
  "stages": [
    {
      "index": 1,
      "name": "Writers' Room",
      "status": "completed",
      "caseId": "case-xyz789",
      "duration": "8 minutes",
      "turns": 12,
      "outputDocument": "structure",
      "outputPreview": "COLD OPEN: Basil practicing mindfulness..."
    },
    {
      "index": 2,
      "name": "Script Drafting",
      "status": "active",
      "caseId": "case-abc456",
      "duration": null,
      "turns": 3,
      "outputDocument": "script",
      "outputPreview": null
    },
    {
      "index": 3,
      "name": "Review",
      "status": "pending",
      "caseId": null,
      "duration": null,
      "turns": null,
      "outputDocument": "reviewed_script",
      "outputPreview": null
    }
  ],
  "documents": [
    { "name": "premise", "source": "input", "stage": 0 },
    { "name": "structure", "source": "Writers' Room", "stage": 1 },
    { "name": "script", "source": "Script Drafting", "stage": 2, "inProgress": true }
  ]
}
```

---

## Agent Profiles

Agents can have detailed profiles with passport-like identity data, physical features for character illustration, and life history (backstory).

### 34. Get Agent Profile

Retrieves an agent's detailed profile including physical description and life history.

**Endpoint:** `GET /api/agents/:name/profile`

**Response:** `200 OK`
```json
{
  "id": "profile-jamie-wilson",
  "agentName": "Jamie Wilson",
  "dateOfBirth": "1992-03-15",
  "placeOfBirthCity": "Manchester",
  "placeOfBirthCountry": "United Kingdom",
  "nationality": "British",
  "sex": "male",
  "heightCm": 178,
  "weightKg": 75,
  "build": "average",
  "skinTone": "fair",
  "ageAppearance": 32,
  "posture": "relaxed",
  "gait": "confident_stride",
  "faceShape": "oval",
  "eyeColor": "blue",
  "eyeShape": "almond",
  "noseShape": "straight",
  "lipShape": "full",
  "eyebrowShape": "arched",
  "chinShape": "rounded",
  "complexion": "clear",
  "restingExpression": "friendly",
  "hairColor": "brown",
  "hairStyle": "short",
  "hairLength": "short",
  "hairTexture": "fine",
  "facialHair": "stubble",
  "grayPercentage": 5,
  "glasses": "none",
  "jewelry": ["watch"],
  "tattoos": [],
  "scars": [],
  "birthmarks": [],
  "distinguishingFeatures": ["dimples when smiling"],
  "clothingStyle": "casual",
  "primaryClothingColor": "#3498db",
  "typicalOutfit": "Jeans and button-down shirts",
  "voiceDescription": "Warm baritone",
  "accentDescription": "Slight Northern English accent",
  "mannerisms": ["runs hand through hair when thinking"],
  "backstory": "Software developer who moved to London for work",
  "personalityTraits": ["introverted", "organized", "thoughtful"],
  "childhoodSummary": "Quiet suburban childhood in Manchester",
  "childhoodLocation": "Manchester, UK",
  "familyBackground": "Middle-class family, one younger sister",
  "education": ["BSc Computer Science, University of Leeds"],
  "careerPath": ["Junior Developer at TechCorp", "Senior Developer at StartupX"],
  "significantEvents": ["Moved to London 2018"],
  "formativeExperiences": ["First computer at age 8 sparked passion for coding"],
  "relationships": ["Close with sister", "Small group of childhood friends"],
  "currentSituation": "Looking for a quiet flatmate",
  "fears": ["Loud environments", "Conflict"],
  "desires": ["Peace and quiet", "Work-life balance"],
  "secrets": ["Sometimes works remotely from cafes to escape noise"],
  "skills": ["Programming", "Problem-solving"],
  "hobbies": ["Gaming", "Reading sci-fi"],
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

---

### 35. Create/Update Agent Profile

Creates or updates an agent's detailed profile.

**Endpoint:** `PUT /api/agents/:name/profile`

**Query Parameters:**
- `syncAppearance` (optional): If "true", also updates agent's visual appearance from profile data

**Request Body:**
```json
{
  "dateOfBirth": "1992-03-15",
  "nationality": "British",
  "sex": "male",
  "heightCm": 178,
  "build": "average",
  "skinTone": "fair",
  "faceShape": "oval",
  "eyeColor": "blue",
  "hairColor": "brown",
  "hairStyle": "short",
  "personalityTraits": ["introverted", "organized"],
  "childhoodSummary": "Quiet suburban childhood",
  "fears": ["Noise"],
  "hobbies": ["Gaming"]
}
```

All fields are optional. Only include fields you want to set/update.

**Response:** `200 OK`
```json
{
  "id": "profile-jamie-wilson",
  "agentName": "Jamie Wilson",
  ...
}
```

---

### 36. Get Character Description

Generates a natural language character description from the profile, suitable for use in prompts.

**Endpoint:** `GET /api/agents/:name/character-description`

**Response:** `200 OK`
```json
{
  "agentName": "Jamie Wilson",
  "description": "Jamie Wilson is a 32-year-old British male, 178cm tall with an average build. They have fair skin, blue almond-shaped eyes, and short brown hair with slight stubble. Their oval face has a friendly resting expression. Jamie typically wears casual clothing - jeans and button-down shirts. They speak with a warm baritone voice and a slight Northern English accent, often running their hand through hair when thinking. Known for being introverted, organized, and thoughtful."
}
```

---

### 37. Get Image Generation Prompt

Generates a prompt suitable for AI image generation from the profile.

**Endpoint:** `GET /api/agents/:name/image-prompt`

**Response:** `200 OK`
```json
{
  "agentName": "Jamie Wilson",
  "prompt": "Portrait of a 32-year-old British man with fair skin, blue eyes, short brown hair, stubble, oval face, friendly expression, wearing casual clothing in blue tones, relaxed posture"
}
```

---

## Agent Case History

Tracks which cases each agent has participated in.

### 38. Get Agent Case History

Retrieves an agent's participation history across all cases.

**Endpoint:** `GET /api/agents/:name/history`

**Response:** `200 OK`
```json
{
  "agentName": "Jamie Wilson",
  "caseCount": 3,
  "history": [
    {
      "id": "hist-abc12345",
      "caseId": "case-d455c4fd",
      "participantId": "case-d455c4fd-person-0",
      "scenarioTitle": "Flatmate Interview",
      "role": "Tenant",
      "outcome": "agreed",
      "joinedAt": "2024-01-15T10:30:00Z"
    },
    {
      "id": "hist-def67890",
      "caseId": "case-xyz78901",
      "participantId": "case-xyz78901-person-2",
      "scenarioTitle": "Book Club Selection",
      "role": "Member",
      "outcome": "pending",
      "joinedAt": "2024-01-16T14:00:00Z"
    }
  ]
}
```

---

### 39. Add Case History Entry

Manually adds a case history entry for an agent. (Usually done automatically during setup.)

**Endpoint:** `POST /api/agents/:name/history`

**Request Body:**
```json
{
  "caseId": "case-abc123",
  "participantId": "case-abc123-person-0",
  "scenarioTitle": "Team Decision",
  "role": "Team Lead"
}
```

**Response:** `201 Created`
```json
{
  "id": "hist-xyz12345",
  "agentName": "Jamie Wilson",
  "caseId": "case-abc123",
  "scenarioTitle": "Team Decision",
  "role": "Team Lead",
  "outcome": "pending",
  "joinedAt": "2024-01-17T09:00:00Z"
}
```

---

## Job Matching & Agent Vetting (Planned)

> **Note:** This feature is planned but not yet implemented.

A future feature for matching agent personalities to job requirements before including them in cases.

### Concept

When creating a new case with specific roles, the system will:
1. Allow defining job descriptions with required personality traits
2. Suggest agents whose profiles match job requirements
3. Show a "fit score" and highlight mismatches
4. Let users review and approve agents before case creation
5. Enable agents to "apply" for roles they're suited for

### Planned Endpoints

#### List Job Openings

**Endpoint:** `GET /api/jobs`

Returns available job descriptions for upcoming scenarios.

```json
{
  "jobs": [
    {
      "id": "job-nurse-001",
      "title": "Healthcare Assistant",
      "scenario": "Hospital Hydration Discussion",
      "requiredTraits": ["empathetic", "patient", "detail-oriented"],
      "preferredAgreeability": { "min": 60, "max": 85 },
      "requiredSkills": ["patient care", "communication"],
      "status": "open"
    }
  ]
}
```

#### Get Matching Agents

**Endpoint:** `GET /api/jobs/:id/matches`

Returns agents ranked by their fit for the job.

```json
{
  "jobId": "job-nurse-001",
  "matches": [
    {
      "agentName": "Sarah Chen",
      "fitScore": 92,
      "matchedTraits": ["empathetic", "patient"],
      "missingTraits": [],
      "agreeabilityFit": true,
      "recommendation": "excellent_match"
    },
    {
      "agentName": "Mike Thompson",
      "fitScore": 65,
      "matchedTraits": ["patient"],
      "missingTraits": ["detail-oriented"],
      "agreeabilityFit": false,
      "recommendation": "partial_match"
    }
  ]
}
```

#### Agent Applies for Job

**Endpoint:** `POST /api/jobs/:id/applications`

```json
{
  "agentName": "Sarah Chen",
  "coverNote": "I have 5 years of healthcare experience..."
}
```

#### Approve/Reject Application

**Endpoint:** `PATCH /api/jobs/:id/applications/:applicationId`

```json
{
  "status": "approved",
  "notes": "Great fit for this role"
}
```

### Match Criteria

| Criteria | Weight | Description |
|----------|--------|-------------|
| Personality Traits | 40% | Required traits present in profile |
| Agreeability Range | 20% | Within specified min/max range |
| Skills Match | 20% | Required skills present |
| Experience | 10% | Relevant case history |
| Availability | 10% | Not in conflicting active case |

### UI Flow (Planned)

1. **Create Scenario** → Define roles with requirements
2. **View Candidates** → System shows matching agents ranked by fit
3. **Review Applications** → Agents can "apply" with interest
4. **Vet & Approve** → User reviews fit scores, approves roster
5. **Launch Case** → Approved agents join the negotiation
