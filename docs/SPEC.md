# StateLoop - Complete System Specification

## 1. Overview

**StateLoop** is a stateless agent orchestration system for coordinating AI agents in multi-party negotiations. Agents negotiate to reach consensus on decisions - from policy debates to project approaches to resource allocation.

### 1.1 Core Philosophy

The system implements a "stateless agent" pattern where:
- **Agents have no memory** - All context is fetched fresh each turn
- **State lives in the system** - SQLite database holds all state
- **Private agendas** - Each agent only sees their own preferences
- **Hot-swappable** - Agents can be stopped/started without losing progress
- **AI-driven setup** - AI analyzes scenarios, determines appearances, identifies speakers

### 1.2 Key Benefits

| Benefit | Description |
|---------|-------------|
| Resilience | Stop/restart agents without data loss |
| Flexibility | Swap agent implementations mid-negotiation |
| Auditability | Full request log of all actions |
| Privacy | Agents don't see others' private instructions |
| Simplicity | No conversation history management needed |

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Web Browser                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Thronglet UI                          │    │
│  │  - 2D Canvas visualization                               │    │
│  │  - Conversation thread                                   │    │
│  │  - Case management                                       │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │ HTTP/REST
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Express.js Server                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Routes     │  │   Services   │  │   Storage    │          │
│  │  (REST API)  │──│  (Business)  │──│  (SQLite)    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │ HTTP (auto-play)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Claude API                                  │
│  - Generates agent responses                                     │
│  - Receives private agenda per agent                            │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 18+ |
| Language | TypeScript |
| Database | SQLite (better-sqlite3) |
| Web Server | Express.js |
| Frontend | Vanilla JS + Canvas |
| AI | Claude API (Anthropic) |

---

## 3. Data Models

### 3.1 Case
The main entity representing a negotiation session.

```typescript
interface Case {
  id: string;                    // e.g., "case-a4573814"
  scenario: string;              // Full case description text
  status: 'active' | 'resolved' | 'abandoned';
  currentTurn: string | null;    // Participant ID whose turn it is
  outcome: 'agreed' | 'failed' | 'abandoned' | null;
  selectedOptionId: string | null;
  resolutionSummary: string | null;
  createdAt: string;             // ISO timestamp
  updatedAt: string;
  resolvedAt: string | null;
}
```

### 3.2 Participant
An agent/person in the negotiation.

```typescript
interface Participant {
  id: string;                    // e.g., "case-abc-person-0"
  caseId: string;
  name: string;                  // Display name, e.g., "Alice"
  preferences: string[];         // Public preferences (optional)
  constraints: string[];         // Public constraints (optional)
  isPayer: boolean;              // Whether this person is paying
}
```

### 3.3 Option
An option to be negotiated.

```typescript
interface Option {
  id: string;                    // e.g., "case-abc-opt-1"
  caseId: string;
  name: string;
  category: string;
  priceRange: string;            // $, $$, $$$
  features: string[];
}
```

### 3.4 Message
A message in the conversation.

```typescript
interface Message {
  id: string;
  caseId: string;
  author: string;                // Participant ID
  type: 'proposal' | 'counter' | 'accept' | 'reject' | 'message';
  content: string;
  optionId: string | null;       // For proposals
  timestamp: string;
  agentContext: string | null;   // Private agenda shown to agent (debug)
}
```

### 3.5 BossMessage
An instruction from the system operator.

```typescript
interface BossMessage {
  id: string;
  caseId: string;
  content: string;
  targetAgent: string | null;    // null = all agents
  read: boolean;
  timestamp: string;
}
```

---

## 4. Case Description Format

Cases are created using a structured text format that defines agents, their private agendas, and negotiation options.

### 4.1 Format Specification

```
PUBLIC INFO:
[Optional public scenario description visible to all]

AGENT: <Name>
AGENDA: [Private instructions only this agent sees]
[Additional lines of private context...]

AGENT: <Name2>
AGENDA: [Different private instructions...]

OPTIONS:
- <Option Name>: <Category>, <Price>, <Features>
- <Option Name2>: ...
```

### 4.2 Example

```
PUBLIC INFO:
Scenario: Team decision on project approach.
Participants: Moderator, Alice, Bob

AGENT: Moderator
AGENDA: You introduce the case. Say "Welcome! You need to pick
an approach for the project. Alice, please start."

AGENT: Alice
AGENDA: You STRONGLY prefer the structured approach.
Budget is $40k max. You're willing to compromise but push for
Approach A first.

AGENT: Bob
AGENDA: You need flexibility. You prefer approaches that allow
for iteration. Try to get Approach B.

OPTIONS:
- Approach A: Structured, $$$, reliable, established process
- Approach B: Agile, $$, flexible, iterative development
- Approach C: Hybrid, $, balanced, combines both methods
```

### 4.3 Parsing Rules

1. `AGENT: Name` - Creates a new participant
2. Lines after `AGENT:` until next `AGENT:` or section marker = private agenda
3. `PUBLIC INFO:` section = visible to everyone (optional)
4. `OPTIONS:` section = list of choices to negotiate
5. Each `- Name` line creates an option entry
6. `LOCATION: <location>` - Sets the scenario location (optional)
7. `SCENARIO: <title>` - Sets the scenario title (optional)
8. `AGENDA (<Role>):` - Sets the agent's display role title
9. `AGREEABILITY: <0-100>` - Sets how quickly agent agrees (default: 50)
10. `APPEARANCE: <type>` - Sets professional appearance (nurse_scrubs, doctor_coat, etc.)
11. `MAX_ROUNDS: <n>` - Maximum rounds before timeout

### 4.4 Location-Based Environments

The system supports different visual backgrounds based on scenario location. Location can be specified explicitly or auto-detected from scenario keywords.

**Explicit Location:**
```
LOCATION: hospital

PUBLIC INFO:
A medical team discusses patient care options...
```

**Supported Locations:**
| Location | Description | Visual Elements |
|----------|-------------|-----------------|
| park | Default outdoor setting | Grass, trees, path |
| hospital | Medical ward environment | Beds, nurse station, medical equipment |
| library | Quiet reading space | Bookshelves, reading tables, quiet atmosphere |
| office | Corporate meeting room | Conference table, chairs, whiteboard |
| school | Classroom setting | Blackboard, student desks |
| cafe | Coffee shop | Counter, tables, warm lighting |

**Auto-Detection:**
The system analyzes scenario keywords to auto-detect appropriate location:
- "hospital", "patient", "nurse", "doctor" → hospital
- "library", "books", "reading" → library
- "office", "meeting", "conference" → office
- "school", "classroom", "student", "teacher" → school
- "cafe", "coffee", "barista" → cafe

**Location Title Display:**
When a location is set, the canvas displays a title bar at the top showing:
- Location name (e.g., "Hospital Ward")
- Optional subtitle based on scenario context

---

## 4.5 AI Setup Phase

When a new case is created and auto-play is called for the first time (no messages yet), the system enters a **Setup Phase** where AI:

### 4.5.1 Determines Agent Appearances

AI analyzes each agent's personality and role to determine their visual appearance on the Thronglet map:

```bash
POST /api/cases/:id/set-appearance
{
  "agentName": "Alice",
  "appearance": {
    "accessory": "glasses",
    "bodyStyle": "normal",
    "color": "#3498db",
    "skinTone": "#ffcc80",
    "professionalRole": "nurse_scrubs"
  }
}
```

**Appearance Options:**
| Property | Options |
|----------|---------|
| accessory | none, hat, glasses, bowtie, headphones, scarf, wheelchair |
| bodyStyle | normal, tall, short, wide, athletic |
| shapeType | box (default), cylinder, oval |
| color | Any hex color for clothes |
| skinTone | Any hex color for skin |
| gender | male, female |
| voice | { pitch, rate, voiceType } for text-to-speech |
| professionalRole | none, nurse_scrubs, doctor_coat, police_uniform, teacher, business_suit, healthcare_assistant |

**Body Shape Types (3D Mode):**
| Shape | Description |
|-------|-------------|
| box | Default isometric box shape with flat sides |
| cylinder | Rounded cylindrical body with curved sides |
| oval | Egg-shaped body, good for wide/stocky characters |

**Body Style Dimensions:**
| Style | Width | Height | Description |
|-------|-------|--------|-------------|
| normal | 25 | 35 | Standard proportions |
| tall | 22 | 45 | Taller, thinner build |
| short | 28 | 28 | Shorter, wider build |
| wide | 35 | 32 | Broad, stocky build |
| athletic | 26 | 40 | Taller with moderate width |

**Professional Role Appearances:**
Agents can have professional uniforms that override default clothing:
| Role | Description |
|------|-------------|
| nurse_scrubs | Blue or green medical scrubs |
| doctor_coat | White lab coat with stethoscope |
| police_uniform | Dark blue uniform with badge |
| teacher | Cardigan, smart casual attire |
| business_suit | Formal suit and tie |
| healthcare_assistant | Light blue uniform |

**Diversity in Agent Appearances:**
The system supports diverse agent representations including:
- Different genders (male/female)
- Physical disabilities (wheelchair users)
- Various skin tones
- Multiple accessory styles
- Professional uniforms

**Personality → Appearance Mapping:**
| Personality | Suggested Appearance |
|-------------|---------------------|
| Formal/Moderator | bowtie, tall, blue (#3498db), male |
| Professional | glasses, normal, red (#e74c3c), female |
| Wheelchair User | wheelchair, normal, orange (#f39c12), any gender |
| Creative/Artistic | scarf, normal, purple (#9b59b6), female |
| Casual/Relaxed | hat, wide, green (#27ae60), male |
| Energetic | headphones, short, pink (#e91e63), female |
| Medical Staff | nurse_scrubs or doctor_coat, appropriate colors |
| Law Enforcement | police_uniform, dark blue |
| Educator | teacher, cardigan style |
| Corporate | business_suit, formal colors |

### 4.5.2 Identifies First Speaker

The system automatically determines who speaks first based on `currentTurn` in the database. The setup prompt tells AI exactly who should make the opening move.

### 4.5.3 Makes Opening Move

AI submits the first message as the identified speaker, kicking off the negotiation.

---

## 5. API Specification

### 5.1 Endpoint Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api` | API info and discovery |
| GET | `/api/cases` | List all cases |
| POST | `/api/cases` | Create new case |
| GET | `/api/cases/:id` | Get case details |
| GET | `/api/cases/:id/history` | Get conversation history for playback |
| POST | `/api/cases/:id/run` | Pre-run case to completion (simulation) |
| POST | `/api/cases/:id/reset` | Reset case (soft or full) |
| GET | `/api/cases/:id/auto-play` | Execute turn for current agent |
| GET | `/api/auto-play` | Execute turn on most recent active case |
| POST | `/api/cases/:id/set-appearance` | Set agent appearance (AI-determined) |
| GET | `/api/cases/:id/next-task` | Get task (manual mode) |
| POST | `/api/cases/:id/submit` | Submit response (manual mode) |
| POST | `/api/cases/:id/resolve` | Manually resolve case |
| POST | `/api/cases/:id/reopen` | Reopen resolved case (adds +10 rounds) |
| POST | `/api/cases/:id/boss-message` | Send operator message |
| GET | `/api/scenarios` | List available scenario files |
| GET | `/api/scenarios/:name` | Get scenario file content |
| POST | `/api/scenarios/:name/load` | Create case from scenario |
| GET | `/api/logs` | View request logs |
| POST | `/api/reset` | Clear database |

### Company/Building Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/companies` | List all companies |
| POST | `/api/companies` | Create a company |
| GET | `/api/companies/:id` | Get company with relations |
| PUT | `/api/companies/:id` | Update company |
| DELETE | `/api/companies/:id` | Delete company |
| GET | `/api/companies/:id/auto-play` | Get AI setup prompt |
| POST | `/api/companies/:id/setup` | AI bulk setup |
| GET | `/api/companies/:id/buildings` | List buildings |
| POST | `/api/companies/:id/buildings` | Create building |
| GET | `/api/companies/:id/buildings/:buildingId` | Get building with rooms |
| DELETE | `/api/companies/:id/buildings/:buildingId` | Delete building |
| GET | `/api/companies/:id/buildings/:buildingId/rooms` | List rooms |
| POST | `/api/companies/:id/buildings/:buildingId/rooms` | Create room |
| GET | `/api/companies/:id/rooms/:roomId` | Get room |
| DELETE | `/api/companies/:id/rooms/:roomId` | Delete room |
| GET | `/api/companies/:id/policies` | List policies |
| POST | `/api/companies/:id/policies` | Create policy |
| GET | `/api/companies/:id/policies/:policyId` | Get policy |
| DELETE | `/api/companies/:id/policies/:policyId` | Delete policy |
| GET | `/api/companies/:id/employees` | List employees |
| POST | `/api/companies/:id/employees` | Add employee |
| GET | `/api/agents/:name/employment` | Get agent's employments across companies |
| GET | `/api/policy-categories` | List policy categories |
| GET | `/api/cases/:id/agent-roles` | Get agent roles for case |
| POST | `/api/cases/:id/agent-roles` | Set agent roles for case |
| GET | `/api/cases/:id/company` | Get company associated with case |
| GET | `/api/cases/:id/policies` | Get policies for case |
| GET | `/api/cases/:id/policies/:policyId` | Get specific policy for case |

### Agent Profile Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents/:name/profile` | Get agent's detailed profile |
| PUT | `/api/agents/:name/profile` | Create/update agent profile |
| GET | `/api/agents/:name/character-description` | Get natural language description |
| GET | `/api/agents/:name/image-prompt` | Get AI image generation prompt |
| GET | `/api/agents/:name/history` | Get agent's case participation history |
| POST | `/api/agents/:name/history` | Add case history entry |

### 5.2 Auto-Play Endpoint (Primary)

The main endpoint for advancing the negotiation.

**`GET /api/cases/:id/auto-play`** or **`GET /api/auto-play`**

**What it does:**
1. Identifies whose turn it is
2. Extracts that agent's private agenda from scenario
3. Builds prompt with conversation history
4. Returns plain text prompt for Claude

**Response (text/plain):**
```
YOU ARE: Alice

YOUR PRIVATE AGENDA (only you know this):
You STRONGLY prefer Japanese food...

OTHER PARTICIPANTS: Moderator, Bob
(You do NOT know their private preferences)

OPTIONS:
- case-abc-opt-1: Approach A (Structured, $$$) - reliable, established

CONVERSATION SO FAR:
[Moderator] (message): Welcome! Please start...

YOUR TASK:
Respond as Alice. Negotiate based on your agenda.

To respond, POST to: http://localhost:3000/api/cases/abc/submit
{...}
```

### 5.3 Submit Response

**`POST /api/cases/:id/submit`**

**Request:**
```json
{
  "taskId": "task-xyz",
  "agentId": "case-abc-person-0",
  "agentContext": "Private agenda text (optional, for debug)",
  "response": {
    "type": "proposal",
    "thoughts": "This aligns with my goals",
    "content": "How about Approach A?",
    "optionId": "case-abc-opt-1",
    "documentUpdates": [
      { "document": "notes", "action": "append", "content": "Proposed Approach A" }
    ]
  }
}
```

**Response Fields:**
- `type` - Required: proposal, counter, accept, reject, or message
- `content` - Required: The spoken message
- `thoughts` - Optional: Internal reasoning (shown in UI, not to other agents)
- `optionId` - Required for proposal/counter types
- `documentUpdates` - Optional: Array of document edits

**Response Types:**
- `proposal` - Suggest an option (requires optionId)
- `counter` - Counter-proposal (requires optionId)
- `accept` - Accept the last proposal (auto-resolves case)
- `reject` - Reject without alternative
- `message` - General comment

**Automatic Continuation:**

When case is still active, the submit response includes the NEXT agent's prompt, enabling continuous processing without user intervention:

```
SUBMISSION ACCEPTED
===================
Your message was recorded. Case is still active.

NEXT TURN
=========
YOU ARE: Bob
...
```

This allows Claude to automatically continue processing turns until the case resolves, without waiting for user input between turns.

**JSON Response** (when `Content-Type: application/json` is set):
```json
{
  "messageId": "msg-3",
  "caseStatus": "active",
  "nextTurn": "case-abc-person-1"
}
```

### 5.4 Auto-Resolution

When an agent submits `type: "accept"`:
1. System checks if there's a pending proposal
2. If the accepter is different from the proposer
3. Case automatically resolves with `outcome: "agreed"`

### 5.5 History Endpoint

**`GET /api/cases/:id/history`**

Returns full conversation history optimized for playback:
```json
{
  "caseId": "case-abc",
  "scenario": "...",
  "status": "resolved",
  "outcome": "agreed",
  "participants": [
    { "id": "...", "name": "Alice", "appearance": {...} }
  ],
  "options": [...],
  "timeline": [
    {
      "index": 0,
      "messageId": "msg-xyz",
      "speaker": "Alice",
      "speakerId": "case-abc-person-1",
      "type": "proposal",
      "content": "How about Zen?",
      "timestamp": "2024-01-01T12:00:00Z"
    }
  ],
  "totalMessages": 5
}
```

### 5.6 Run-to-Completion Endpoint

**`POST /api/cases/:id/run`**

Pre-runs a case to completion using simulated agent responses. Useful for:
- Testing scenarios quickly
- Pre-generating content for playback
- Batch processing multiple negotiations

**Query Parameters:**
- `maxRounds` (optional): Maximum rounds before stopping (default: 20)

**Document Writing:**
The `/run` endpoint automatically writes to working documents as agents interact:
- **Proposals** → Appends to `script` document with the proposed option
- **Accepts** → Appends to `decisions` document with the agreed outcome
- **Early messages** → Appends to `notes` document (first 3 messages per agent)

This enables automatic content generation during simulation runs.

**Response:**
```json
{
  "status": "resolved",
  "outcome": "agreed",
  "rounds": 6,
  "messageCount": 6,
  "log": [
    "  [DOC] notes: append - Alice's opening position...",
    "[Alice] (message): I believe we should...",
    "  [DOC] script: append - [Alice's proposal: Option A]...",
    "[Alice] (proposal): I propose we go with Option A.",
    "  [DOC] decisions: append - AGREED: Option A...",
    "[Bob] (accept): Yes, let's do it."
  ],
  "historyUrl": "/api/cases/case-abc/history"
}
```

The log includes `[DOC]` entries showing document updates alongside agent messages.

### 5.7 Working Documents

Cases can have collaborative working documents that agents update during the negotiation:

**Document Types:**
- **Input Documents** - Read-only reference materials (character guides, style guides)
- **Working Documents** - Collaborative documents agents can edit (scripts, notes, decisions)

**Document Update Actions:**
| Action | Description |
|--------|-------------|
| `append` | Add content to end of document |
| `prepend` | Add content to beginning |
| `replace` | Replace entire document content |
| `replace_section` | Replace a named section |

**Example Document Update:**
```json
{
  "taskId": "task-abc",
  "agentId": "case-123-person-0",
  "response": {
    "type": "message",
    "content": "I've drafted the opening scene",
    "documentUpdates": [
      {
        "document": "script",
        "action": "append",
        "content": "INT. LOBBY - DAY\n\nBasil enters, practicing deep breaths..."
      }
    ]
  }
}
```

### 5.8 Swagger API Documentation

Full interactive API documentation is available at:
- **Swagger UI**: `http://localhost:3000/api-docs`
- **OpenAPI Spec**: `http://localhost:3000/swagger-generated.json` (auto-generated)

The Swagger documentation is auto-generated using swagger-autogen from inline comments in `src/api/routes.ts`. It includes:
- All endpoints with request/response schemas
- Example payloads for each operation
- Schema definitions for all data types

To regenerate documentation: `npm run swagger:generate`

---

## 6. UI Specification (Thronglet)

### 6.1 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Header: Logo, Case Selector, New Case, Reset, Audio, 2D/3D,    │
│          Replay, Config, Theme Toggle                            │
├─────────────────────────────────┬───────────────────────────────┤
│                                 │  Conversation Thread          │
│    2D Canvas Map                │  - Chat-style messages        │
│    - Agents (varied looks)      ├───────────────────────────────┤
│    - Trees, Path                │  Agent Thoughts (collapsible) │
│    - Options (when case         │  - Internal reasoning         │
│      loaded)                    │  - Synced with speaker        │
│    - Speech bubbles             ├───────────────────────────────┤
│                                 │  Case Info Panel              │
│                                 │  - Participant cards          │
│                                 ├───────────────────────────────┤
│                                 │  Boss Messages Panel          │
├─────────────────────────────────┴───────────────────────────────┤
│  Agent Prompt Card - Curl command for auto-play                 │
├─────────────────────────────────────────────────────────────────┤
│  Request Log - Collapsible API request history                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.1.1 Agent Thoughts Panel

The Agent Thoughts panel displays the internal reasoning of each agent:

- **Location:** Sidebar, below Conversation Thread
- **Collapsible:** Click header to expand/collapse
- **Auto-expand:** Opens automatically when new thoughts arrive
- **Synced:** Shows thoughts from the currently speaking agent
- **Styling:** Purple theme to distinguish from public speech

This allows observers to see what agents are "thinking" separately from what they say publicly.

### 6.2 Agent Visualization

**Visual Variety:**
Each agent has distinct features:
- Body color (red, blue, purple, green, orange, teal, pink, cyan)
- Accessory (none, hat, glasses, bowtie, headphones, scarf, wheelchair)
- Gender representation (different voice types)
- Skin tone diversity
- Body style (normal, tall, short, wide)
- Skin tone variation
- Animation speed variation

**States:**
- Idle: Various behaviors (standing, wandering, checking phone, etc.)
- Thinking: Orange indicator dot
- Speaking: Speech bubble visible

**Collision Avoidance:**
Agents don't walk into:
- Trees (50px radius)
- Options (60px radius)
- Canvas boundaries
- Speech bubbles (move away)

### 6.3 Idle Behaviors

Agents perform random actions when idle:
- Standing, looking, wandering
- Checking phone, looking at watch
- Stretching, waving, yawning
- Tapping foot, scratching head
- Crossing arms, humming
- Pacing, jumping, sitting
- Daydreaming, chitchat

### 6.4 Options

- Only drawn when a case is loaded
- Icons appropriate to option type
- Name labels below
- Color states:
  - Normal: Brown
  - Proposed: Blue glow
  - Selected: Orange with checkmark

### 6.5 Text-to-Speech and Audio System

The UI supports text-to-speech for agent messages with a comprehensive audio system:

**Audio System Features:**
- Audio is enabled by default on page load
- Toggle audio on/off via button in header
- Each agent has a unique voice (pitch, rate, voice type)
- Voice settings are determined during AI setup phase
- Speech bubble stays visible for 15 seconds after audio ends
- Polling pauses while speech is playing to avoid interruptions

**Voice Settings:**
| Property | Range | Description |
|----------|-------|-------------|
| pitch | 0.7 - 1.4 | Voice pitch (higher = higher voice) |
| rate | 0.85 - 1.15 | Speech rate (higher = faster) |
| voiceType | male/female | Browser voice selection |

**Message Queue with Speech Sync:**
1. Messages are added to a queue as they arrive
2. One message is displayed at a time
3. If audio is enabled, the message is spoken aloud
4. Next message is processed only after speech completes
5. 500ms pause between messages for natural pacing
6. Polling for new messages pauses during speech playback

### 6.6 Speaker Positioning

When an agent speaks, the system automatically repositions agents for optimal visibility:

**Speaker Movement:**
- Speaking agent moves to a clear center-left position (35% across canvas, y=380)
- Original position is stored so they can return after speaking
- Movement is animated smoothly via the `speaking_move` idle action
- Speaker's original position is restored when their message completes

**Other Agents Clear the Way:**
- Non-speaking agents automatically move away from the speech bubble area
- Agents on the left of the speaker move further left
- Agents on the right of the speaker move further right
- All non-speakers move down slightly for clear visual separation
- Movement uses the `avoiding` idle action with faster speed (2.0x)

**Positioning Logic:**
```
Speech Bubble Zone:
┌─────────────────────────────────────────────┐
│                                             │
│         ┌─────────────────┐                 │
│         │  Speech Bubble  │                 │
│         │     (320px)     │                 │
│         └────────┬────────┘                 │
│                  │                          │
│              ╔═══╧═══╗                      │
│              ║Speaker║  ← Moves to y=380    │
│              ╚═══════╝                      │
│   ○ ←──────              ──────→ ○          │
│ Agent A                        Agent B      │
│ (moves left)               (moves right)   │
└─────────────────────────────────────────────┘
```

**Benefits:**
- Speaker is always clearly visible without overlap
- Speech bubble doesn't obscure other agents
- Conversation flow is visually clear
- Agents return to natural positions between messages

### 6.7 Interactive Features

**Agent Selection:**
- Click on agents in the canvas to select them
- Click on participant cards in the side panel
- Selected agent shows expanded details (ID, gender, accessory, voice)
- Selection highlighted with colored border

**Zoom Controls:**
- "Zoom In" button activates focused view mode
- When zoomed in, camera frames current speaker + previous 2 speakers
- Dynamic zoom level adjusts to fit all 3 agents with padding
- Smooth pan/zoom animation with camera lerping

**Reset & Replay:**
- "Reset & Replay" button in the map header
- Soft reset: Clears messages, keeps agents and options
- Full reset: Regenerates entire case setup
- Automatically runs simulation after reset

**Idle Behavior:**
- Agents perform idle animations when not their turn
- Chitchat disabled during active negotiations
- Agents avoid walking into speech bubbles

### 6.8 2D/3D View Toggle

The canvas supports switching between two rendering modes:

**2D Mode:**
- Classic pixelated top-down view
- Simpler rendering, lower resource usage
- All accessories and professional roles supported

**3D Mode:**
- Isometric pseudo-3D rendering with depth
- Body shapes (box, cylinder, oval) affect rendering
- Enhanced visual appeal with shading and perspective
- Location furniture rendered with 3D depth
- Transparent backgrounds for furniture sprites

**Toggle Features:**
- Toggle button in the map header switches between modes
- Mode preference persisted in localStorage
- Smooth visual transition when switching
- Both modes support all agent customization options

### 6.9 Location Viewer (scenarios.html)

The scenarios page includes an interactive location viewer for previewing scenario environments.

**Mouse-Based Rotation:**
- Click and drag horizontally to rotate the room view
- Smooth, responsive rotation following mouse movement
- True 3D rotation in isometric space (not 2D canvas rotation)

**4-Wall Visibility Culling:**
- Room has 4 walls (front, back, left, right)
- Front wall is always culled to show room interior
- Other walls are culled when rotation makes them face the viewer
- Creates an intuitive "cutaway" view that always shows room contents

**Zoom Controls:**
- Zoom In (+): Increase scale for detail view
- Zoom Out (-): Decrease scale for overview
- Reset: Return to default zoom level

---

## 7. Privacy Model

### 7.1 Information Boundaries

| Information | Alice Sees | Bob Sees |
|-------------|------------|----------|
| Alice's agenda | Yes | No |
| Bob's agenda | No | Yes |
| Option list | Yes | Yes |
| Conversation history | Yes | Yes |
| Public scenario info | Yes | Yes |
| Other agents' names | Yes | Yes |

### 7.2 Agenda Extraction

The system extracts each agent's private agenda from the case description:

1. Find `AGENT: <Name>` block
2. Extract text until next `AGENT:` or section marker
3. Include only in that agent's prompt
4. Store with message for debugging (`agentContext` field)

---

## 8. Resolution Logic

### 8.1 Automatic Resolution

When an `accept` message is submitted:
1. Find the last proposal/counter in conversation
2. Verify accepter != proposer
3. Update case status to "resolved"
4. Set outcome to "agreed"
5. Set selectedOptionId from the accepted proposal

### 8.2 Manual Resolution

Operators can resolve via:
```
POST /api/cases/:id/resolve
{
  "outcome": "agreed" | "failed" | "abandoned",
  "selectedOption": "opt-id",
  "summary": "Resolution notes"
}
```

---

## 9. Testing

### 9.1 API Tests

Located in `/tests/api.test.ts` (15 tests):

| Test Suite | Tests | Description |
|------------|-------|-------------|
| POST /api/cases | 3 | Case creation, scenario parsing, validation |
| GET /api/cases | 2 | List cases, return created cases |
| GET /api/cases/:id | 2 | Case details, 404 handling |
| POST /api/cases/:id/submit | 2 | Turn advancement, case resolution |
| POST /api/cases/:id/auto-play | 2 | Auto-play processing, 404 handling |
| GET /api/logs | 1 | Request log retrieval |
| POST /api/reset | 1 | Database reset |
| Scenario parsing | 1 | Option parsing from text |
| Message validation | 1 | Submit field validation |

### 9.2 Running Tests

```bash
npm test
```

All tests use an in-memory SQLite database for isolation.

---

## 10. Configuration

### 10.1 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| DATABASE_PATH | ./stateloop.db | SQLite database location |

### 10.2 Server Setup

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run production
npm start

# Run tests
npm test
```

---

## 11. Example Workflow

### 11.1 Creating a Case

1. Open UI at `http://localhost:3000`
2. Click "New Case"
3. Enter case description with AGENT sections
4. Submit to create case

### 11.2 Running Negotiation

1. Copy curl command from Agent Prompt card
2. Execute to get agent's prompt
3. Feed prompt to Claude API
4. Submit Claude's response to the submit endpoint
5. Repeat until case resolves

### 11.3 Using Auto-Play

Simply call:
```bash
curl "http://localhost:3000/api/auto-play"
```

This returns a prompt for the current agent, ready to send to Claude.

---

## 12. Files and Structure

```
stateLoop/
├── src/
│   ├── index.ts           # Entry point
│   ├── api/
│   │   └── routes.ts      # REST endpoints
│   ├── services/
│   │   ├── caseService.ts # Business logic
│   │   └── taskService.ts # Task management
│   ├── storage/
│   │   └── sqlite.ts      # Database operations
│   └── types/
│       └── index.ts       # TypeScript interfaces
├── public/
│   ├── index.html         # Main UI
│   ├── css/
│   │   └── styles.css     # Styling
│   └── js/
│       └── thronglet.js   # Canvas UI logic
├── scenarios/             # Pre-made scenario library
│   └── *.txt              # Scenario definition files
├── tests/
│   └── api.test.ts        # API tests
├── docs/
│   ├── SPEC.md            # This document
│   ├── requirements.md    # Requirements
│   ├── api-design.md      # API details
│   ├── data-models.md     # Data schemas
│   └── ui-design.md       # UI specification
├── package.json
└── tsconfig.json
```

---

## 13. Scenarios Library

### 13.1 Pre-made Scenarios

The system includes a library of pre-made scenarios in the `/scenarios` directory.

**Accessing Scenarios:**
- Web UI: `/scenarios.html` page with tabs for Scenarios, Furniture, Locations
- API: `GET /api/scenarios` lists available scenarios
- Loading: `POST /api/scenarios/:name/load` creates a case from a scenario

**Scenario File Format:**
Scenarios are `.txt` files in the `/scenarios` directory following the standard case description format.

**Example Scenarios:**
| Name | Description | Agents |
|------|-------------|--------|
| hospital-hydration | Hospital ward discussing patient hydration solutions | 9 (ACP, nurses, patients) |
| spain-trip-gcse | Teenagers negotiating a Spain trip with parents | 6 (Mrs. Patterson, Jake, Chloe, Marcus, Priya, Destiny) |
| movie-night | Roommates deciding on a movie | 4 (Moderator, Chris, Pat, Morgan) |
| wedding-planning | Two families planning a wedding | 5 (Sophie, James, Margaret, Richard, Claire) |

### 13.2 Furniture Catalog

The furniture catalog (`/public/data/furniture.json`) provides location-appropriate furniture items:

**Categories:**
| Category | Items |
|----------|-------|
| hospital | Hospital bed, bedside table, nurse station, IV stand, wheelchair |
| office | Conference table, office chair, whiteboard, desk, filing cabinet |
| library | Bookshelf, reading table, armchair, magazine rack, study carrel |
| school | Blackboard, teacher desk, student desk, globe, lockers |
| cafe | Service counter, coffee machine, cafe table, bar stool, pastry case |
| outdoor | Tree, park bench, lamp post, fountain, picnic table |
| common | Window, door, waste bin, fire extinguisher, notice board |

**3D Furniture Rendering:**
Location furniture is rendered in 3D with the following improvements:
- Transparent backgrounds for PNG furniture sprites
- Proper depth sorting for layered rendering
- Isometric perspective matching agent rendering
- Shadow and lighting effects for visual consistency
- Dynamic scaling based on canvas size

### 13.3 Enhanced Simulation

The `/run` endpoint uses intelligent response generation based on agent roles:

**AGREEABILITY Score (0-100):**
- Low (< 45): Skeptical, raises concerns, needs more discussion rounds
- Medium (45-70): Open to discussion, will agree after reasonable debate
- High (> 70): Agreeable, quick to accept proposals

**Role-Based Responses:**
| Role | Behavior |
|------|----------|
| Facilitator/ACP | Opens discussion, prompts quiet participants, guides to resolution |
| Patient | Shares specific barriers from their agenda |
| Skeptical Nurse | Raises practical workload concerns |
| HCA | Shares domain knowledge about individual preferences |
| Junior Staff | Eager to learn, asks for techniques |

**Rounds Calculation:**
Rounds needed = `(100 - agreeability) / 10 + 5`

**Automatic Document Writing:**
When working documents exist (`script`, `notes`, `decisions`), the simulation automatically:

| Event | Document | Action |
|-------|----------|--------|
| Agent makes proposal | `script` | Append proposal with option name |
| Agent accepts proposal | `decisions` | Append agreed decision |
| Agent speaks (first 3 messages) | `notes` | Append discussion point |

This enables the `/run` endpoint to generate complete collaborative documents during simulation.

---

## 14. Agent Customizer (scenarios.html)

The Scenarios page includes a comprehensive agent customizer for designing agent appearances.

### 14.1 Customization Options

| Property | Options | Description |
|----------|---------|-------------|
| Age Group | child, teen, adult, middle, elderly | Affects size and appearance details |
| Gender | male, female | Affects voice and style |
| Body Style | normal, tall, short, wide, athletic | Proportions and build |
| Body Shape (3D) | box, cylinder, oval | 3D rendering shape |
| Skin Tone | 6 preset tones from light to dark | Diversity representation |
| Hair Color | black, brown, auburn, blonde, gray, white, red | Hair appearance |
| Clothing Color | Color picker | Main body color |
| Accessory | none, hat, glasses, bowtie, headphones, scarf | Visual additions |
| Professional Role | none, nurse_scrubs, doctor_coat, police_uniform, teacher, business_suit, healthcare_assistant | Uniform/outfit |
| Mobility | standing, wheelchair, walking_stick, zimmer_frame | Movement aids |

### 14.1.1 Age Groups

| Age Group | Scale | Visual Changes |
|-----------|-------|----------------|
| child | 70% | Smaller proportions, rounder features |
| teen | 85% | Slightly smaller than adult |
| adult | 100% | Standard proportions |
| middle | 100% | Subtle aging details |
| elderly | 95% | Gray hair option, slight stoop |

### 14.1.2 Body Styles

| Style | Width | Height | Description |
|-------|-------|--------|-------------|
| normal | 25 | 35 | Standard proportions |
| tall | 22 | 45 | Taller, thinner build |
| short | 28 | 28 | Shorter, compact build |
| wide | 35 | 32 | Broad, stocky build |
| athletic | 26 | 40 | Taller with moderate width |

### 14.1.3 Body Shapes (3D Mode)

| Shape | Description | Best For |
|-------|-------------|----------|
| box | Default isometric box shape with flat faces | Most characters |
| cylinder | Rounded cylindrical body with curved sides | Softer, friendlier appearance |
| oval | Egg-shaped elliptical body | Wide/stocky characters |

### 14.1.4 Skin Tone Presets

The system provides 6 preset skin tones for diverse representation:
1. Light/Fair (#ffe0bd)
2. Light-Medium (#f5d0b0)
3. Medium (#d4a574)
4. Medium-Dark (#c68642)
5. Dark (#8d5524)
6. Deep (#5c3317)

### 14.1.5 Hair Colors

| Color | Hex Value |
|-------|-----------|
| black | #1a1a1a |
| brown | #654321 |
| auburn | #922724 |
| blonde | #f0e68c |
| gray | #808080 |
| white | #f5f5f5 |
| red | #b22222 |

### 14.1.6 Accessories

| Accessory | Description |
|-----------|-------------|
| none | No accessory |
| hat | Cap or hat on head |
| glasses | Eyeglasses |
| bowtie | Formal bowtie |
| headphones | Over-ear headphones |
| scarf | Neck scarf |

### 14.1.7 Professional Roles

| Role | Visual Description |
|------|-------------------|
| nurse_scrubs | Blue or green medical scrubs |
| doctor_coat | White lab coat with stethoscope |
| police_uniform | Dark blue uniform with badge |
| teacher | Cardigan or blazer, smart casual |
| business_suit | Formal suit and tie |
| healthcare_assistant | Light blue uniform with name badge |

### 14.1.8 Mobility Options

| Mobility | Description |
|----------|-------------|
| standing | Default upright position |
| wheelchair | Seated in wheelchair |
| walking_stick | Using a walking cane |
| zimmer_frame | Using a walking frame/zimmer |

### 14.2 Live Preview

The customizer includes:
- Real-time 2D/3D preview canvas
- JSON code output for copying to scenarios
- Instant updates on any setting change

### 14.3 Age-Based Adjustments

| Age | Scale | Visual Changes |
|-----|-------|----------------|
| child | 70% | Smaller proportions |
| teen | 85% | Slightly smaller |
| adult | 100% | Standard |
| middle | 100% | Subtle wrinkles |
| elderly | 95% | Gray hair, wrinkles |

---

## 15. Implemented Features

1. **Automatic Continuation** - Submit responses include next agent's prompt, enabling Claude to process multiple turns automatically
2. **Replay Mode** - History endpoint and UI replay functionality for scrubbing through conversations
3. **Agent Personas** - Agent customizer with age, body, skin, hair, accessories, professional roles, and mobility options
4. **Content-Type Aware Responses** - JSON for programmatic access, text for human readability

## 16. Future Enhancements

1. **Claude API Auto-Call** - Direct Claude API calls from auto-play endpoint
2. **WebSocket Updates** - Real-time UI updates without polling
3. **Multi-Round Voting** - Support voting mechanisms
4. **Mobile UI** - Responsive design for mobile devices

### 16.1 Planned: Workflows

Multi-stage workflows where output from one task feeds into the next:
- **Workflow Templates** - YAML-defined reusable workflow patterns
- **Stage Chaining** - Documents flow automatically between stages
- **Progress Tracking** - Visual progress through workflow stages
- **Mermaid Diagrams** - Auto-generated workflow visualizations

See `docs/api-design.md` section "Process Flows / Workflows" for detailed API design.

### 16.2 Planned: Goal-Driven Workflows

AI-planned workflows based on high-level goals:
- **Goal Definition** - Specify desired outcome and constraints
- **Auto-Planning** - AI generates execution plan
- **Dynamic Stages** - Stages created based on goal requirements

### 16.3 Planned: Variability & Randomness

Control agent behavior unpredictability:
- **Temperature** - Overall randomness (0=deterministic, 1=creative)
- **Mood Swings** - Moods evolve based on conversation
- **Quirks & Triggers** - Per-agent behavioral tendencies
- **Chaos Levels** - calm, normal, heated, chaotic

See `docs/api-design.md` section "Variability & Randomness" for detailed API design.
