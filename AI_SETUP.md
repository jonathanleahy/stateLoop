# AI-Driven Case Setup

This document specifies how AI dynamically configures cases from scenario text.

## Overview

When a case is created, AI analyzes the scenario and generates all dynamic elements:
- Location and visual setting
- Furniture and room elements
- Agent appearances
- Available options
- Opening message

**No hardcoded templates** - everything is contextually generated.

---

## Setup Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    CASE CREATION FLOW                        │
└─────────────────────────────────────────────────────────────┘

1. USER SUBMITS SCENARIO
   └─> Raw scenario text (agents, options, rules, etc.)

2. AI PARSES SCENARIO
   └─> Extracts structured data:
       - Agents (names, roles)
       - Options (choices available)
       - Rules (resolution criteria)
       - Public info (shared context)

3. AI GENERATES SETUP
   └─> Creates dynamic elements:
       - Location description
       - Room/scene configuration
       - Furniture and objects
       - Agent appearances
       - Ambient details

4. AI GENERATES OPENING
   └─> First agent's opening message:
       - Contextually appropriate tone
       - Introduces the topic
       - Lists options naturally
       - Invites participation

5. CASE READY
   └─> All setup stored, conversation begins
```

---

## API Design

### POST /api/cases (Enhanced)

Request:
```json
{
  "scenario": "SCENARIO: Team dinner...\n\nAGENT: Alice\n..."
}
```

Response:
```json
{
  "id": "case-abc123",
  "status": "active",
  "setup": {
    "location": {
      "name": "South Bristol Hospital",
      "type": "hospital_ward",
      "description": "A bright rehab ward with patient beds along the walls"
    },
    "scene": {
      "furniture": ["hospital_beds", "nurses_station", "water_jugs", "chairs"],
      "ambiance": "clinical",
      "lighting": "bright_fluorescent"
    },
    "agents": [
      {
        "id": "case-abc123-person-0",
        "name": "Sam",
        "role": "ACP - Facilitator",
        "appearance": {
          "accessory": "doctor_coat",
          "bodyStyle": "normal",
          "color": "#ffffff",
          "skinTone": "#d4a574"
        }
      }
    ],
    "options": [
      {
        "id": "case-abc123-opt-1",
        "name": "Hydration Champions",
        "description": "Assign one nurse per shift as dedicated hydration lead"
      }
    ],
    "openingMessage": {
      "speaker": "Sam",
      "content": "Good morning everyone. I've called this meeting because we need to address our hydration challenge. Last week alone we had three UTIs linked to poor fluid intake. I'd like us to consider six options: Hydration Champions, Tech Solution, Patient Choice, Buddy System, Visual Prompts, and Protected Time. Let's hear from everyone."
    }
  },
  "participants": [...],
  "options": [...],
  "messages": []
}
```

### POST /api/cases/:id/reset

Reset a case to replay the conversation.

**Query Parameters:**
- `?full=true` - Full reset: clears messages, participants, AND options. Next auto-play regenerates everything.
- (default) - Soft reset: clears messages only, keeps participants and options.

**Soft Reset Response:**
```json
{
  "success": true,
  "message": "Soft reset - messages cleared, setup preserved",
  "caseId": "case-abc123",
  "fullReset": false,
  "currentTurn": "case-abc123-person-0"
}
```

**Full Reset Response:**
```json
{
  "success": true,
  "message": "Full reset - case will regenerate on next auto-play",
  "caseId": "case-abc123",
  "fullReset": true,
  "currentTurn": null
}
```

### POST /api/cases/:id/ai-setup

Separate endpoint to (re)generate setup for existing case:

Request:
```json
{
  "regenerate": ["scene", "appearances", "opening"]
}
```

Response:
```json
{
  "success": true,
  "setup": { ... }
}
```

---

## AI Setup Components

### 1. Location Analysis

AI extracts or infers:

| Field | Source | Example |
|-------|--------|---------|
| `name` | `LOCATION:` line or inferred | "South Bristol Hospital" |
| `type` | Inferred from context | "hospital_ward", "living_room", "office" |
| `description` | AI generated | "A bright rehab ward with six beds" |

**Location Types:**
- `hospital` - Medical setting
- `office` - Professional/corporate
- `school` - Educational/classroom
- `library` - Study spaces
- `cafe` - Dining/coffee shop
- `park` - Outdoor park setting
- `outdoor` - Garden, outdoor spaces
- `studio` - Creative spaces
- `courtroom` - Legal settings

### 2. Scene Configuration

AI generates visual elements based on location:

```json
{
  "scene": {
    "furniture": ["item1", "item2"],
    "ambiance": "formal|casual|clinical|cozy",
    "lighting": "bright|dim|natural|fluorescent",
    "background": "wall_color_or_type"
  }
}
```

**Furniture by Location Type:**

| Location | Possible Furniture |
|----------|-------------------|
| hospital | hospital_bed, nurse_station, iv_stand, medical_cart, curtain_divider |
| office | conference_table, office_chair, whiteboard, desk, filing_cabinet |
| school | blackboard, teacher_desk, student_desk, clock, globe, locker |
| library | bookshelf, reading_table, armchair, magazine_rack, study_carrel |
| cafe | cafe_counter, coffee_machine, cafe_table, menu_board, bar_stool |
| park | tree, bench, lamp_post, fountain, picnic_table, flower_bed |

### 3. Agent Appearances

AI determines appearance from:
1. Explicit `APPEARANCE:` line in scenario
2. Role/profession mentioned in agenda
3. Personality traits
4. Context of the scenario

**Appearance Generation Rules:**

| Context Clue | Suggested Appearance |
|--------------|---------------------|
| "nurse", "nursing" | `nurse_scrubs` |
| "doctor", "ACP", "consultant" | `doctor_coat` |
| "patient", "elderly" | Age-appropriate casual |
| "manager", "executive" | `business_suit` |
| "teacher", "professor" | `teacher` |
| "wheelchair", "mobility" | `wheelchair` accessory |
| "police", "officer" | `police_uniform` |

**Diversity Requirements:**
- Vary skin tones across agents
- Mix genders appropriately for roles
- Include accessibility (wheelchair users) where contextually appropriate
- Vary body types naturally

### 4. Agent Profiles (Optional)

AI can generate detailed character profiles for rich agent portrayal. Profiles include physical descriptions for character illustration and life history for authentic personality.

**Profile Generation:**

When creating agents, AI can include a `profile` object with:

```json
{
  "name": "Sarah Chen",
  "role": "Patient Advocate",
  "agenda": "...",
  "agreeability": 65,
  "appearance": { ... },
  "profile": {
    "dateOfBirth": "1991-03-15",
    "nationality": "British",
    "sex": "female",
    "heightCm": 165,
    "build": "average",
    "skinTone": "medium",
    "faceShape": "oval",
    "eyeColor": "brown",
    "eyeShape": "almond",
    "noseShape": "straight",
    "hairColor": "black",
    "hairStyle": "straight",
    "hairLength": "medium",
    "complexion": "clear",
    "restingExpression": "friendly",
    "glasses": "prescription",
    "clothingStyle": "business",
    "personalityTraits": ["empathetic", "professional", "detail-oriented"],
    "childhoodSummary": "Grew up in Bristol, middle-class family",
    "education": ["BSc Nursing, University of Bristol"],
    "careerPath": ["Junior Nurse", "Senior Nurse", "Patient Advocate"],
    "fears": ["Conflict", "Making wrong decisions"],
    "hobbies": ["Reading", "Gardening"]
  }
}
```

**Profile Field Categories:**

| Category | Fields |
|----------|--------|
| Identity | `dateOfBirth`, `nationality`, `sex`, `placeOfBirthCity` |
| Body | `heightCm`, `weightKg`, `build`, `skinTone`, `posture`, `gait` |
| Face | `faceShape`, `eyeColor`, `eyeShape`, `noseShape`, `lipShape`, `chinShape`, `complexion`, `restingExpression` |
| Hair | `hairColor`, `hairStyle`, `hairLength`, `facialHair`, `grayPercentage` |
| Accessories | `glasses`, `jewelry`, `tattoos`, `scars`, `distinguishingFeatures` |
| Clothing | `clothingStyle`, `primaryClothingColor`, `typicalOutfit` |
| Life History | `childhoodSummary`, `education`, `careerPath`, `significantEvents`, `fears`, `desires`, `secrets`, `hobbies` |

**Case History Tracking:**

When agents are added to a case during setup, their participation is automatically recorded. This enables agents to "remember" past negotiations and develop over time.

See `SPECIFICATION.md` for complete profile field reference.

### 5. Options Parsing

AI extracts from `OPTIONS:` section:

```json
{
  "options": [
    {
      "id": "auto-generated",
      "name": "Option Name",
      "description": "Full description from scenario",
      "category": "Inferred category",
      "attributes": {
        "cost": "inferred if mentioned",
        "time": "inferred if mentioned",
        "effort": "inferred if mentioned"
      }
    }
  ]
}
```

### 6. Document Setup

AI can create documents as part of setup:

**Input Documents** (read-only reference materials):
```json
{
  "inputDocuments": [
    {
      "name": "project_brief",
      "content": "Project Alpha aims to modernize...",
      "mimeType": "text/plain"
    }
  ]
}
```

**Working Documents** (collaborative editing):
```json
{
  "workingDocuments": [
    {
      "name": "draft_proposal",
      "description": "Shared document for the team to edit together"
    }
  ]
}
```

For document-based scenarios (`TASK_TYPE: document`), the AI should:
- Parse `INPUT_DOCUMENT:` blocks into input documents
- Create working documents from `WORKING_DOCUMENTS:` section
- Note the `TASK_OUTPUT:` template for final deliverable

### 7. Opening Message Generation

AI generates the first message based on:
- Who the first speaker is (usually Moderator)
- Their role and personality from AGENDA
- The topic being discussed
- The options available
- The tone of the scenario

**Opening Message Requirements:**
- Appropriate greeting for context
- Brief introduction of the topic/problem
- Natural mention of available options
- Invitation for others to participate
- Matches the speaker's personality

**Examples:**

*Hospital ward meeting:*
> "Good morning everyone. I've called this meeting because we need to address our hydration challenge on the ward. I've identified six possible approaches we could take. Let's discuss what might actually work for us."

*Movie night:*
> "Alright everyone, it's movie night! We've got four options to choose from. Chris, what are you in the mood for?"

*Business meeting:*
> "Thank you all for joining. We need to make a decision on the Q3 budget allocation. I've prepared three proposals for consideration. Let's review each one."

---

## Prompt Template for AI Setup

When calling AI to generate setup:

```
Analyze this scenario and generate the case setup.

SCENARIO:
{scenario_text}

Generate a JSON response with:

1. location: {name, type, description}
2. scene: {furniture (array), ambiance, lighting}
3. agents: For each AGENT in the scenario:
   - Determine appropriate appearance based on their role/profession
   - Include: accessory, bodyStyle, color (clothing), skinTone
   - Ensure diversity across agents
4. options: Parse all options with names and descriptions
5. inputDocuments: Any INPUT_DOCUMENT blocks as {name, content, mimeType}
6. workingDocuments: Any WORKING_DOCUMENTS items as {name, description}
7. taskOutput: If TASK_OUTPUT specified, include {templateName, description}
8. openingMessage: Generate the first speaker's opening that:
   - Fits their personality from their AGENDA
   - Introduces the topic naturally
   - Mentions the options conversationally
   - Invites participation

Return valid JSON only.
```

---

## Storage Schema

### cases table (extended)

```sql
ALTER TABLE cases ADD COLUMN setup_json TEXT;
```

Stores the full AI-generated setup as JSON.

### Document Tables

```sql
-- Read-only reference materials
CREATE TABLE input_documents (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  mime_type TEXT DEFAULT 'text/plain',
  created_at TEXT NOT NULL
);

-- Collaborative documents with version history
CREATE TABLE working_documents (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  mime_type TEXT DEFAULT 'text/plain',
  version INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE working_document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  author TEXT,
  timestamp TEXT NOT NULL
);

-- Final task output
CREATE TABLE task_outputs (
  id TEXT PRIMARY KEY,
  case_id TEXT UNIQUE NOT NULL,
  template_name TEXT,
  content TEXT NOT NULL,
  rendered_output TEXT,
  created_at TEXT NOT NULL
);
```

### Accessing Setup

```typescript
interface CaseSetup {
  location: {
    name: string;
    type: string;
    description: string;
  };
  scene: {
    furniture: string[];
    ambiance: string;
    lighting: string;
  };
  agents: AgentAppearance[];
  options: OptionDetail[];
  inputDocuments?: InputDocumentSetup[];
  workingDocuments?: WorkingDocumentSetup[];
  taskOutput?: {
    templateName: string;
    description: string;
  };
  openingMessage: {
    speaker: string;
    content: string;
  };
}

interface InputDocumentSetup {
  name: string;
  content: string;
  mimeType?: string;
}

interface WorkingDocumentSetup {
  name: string;
  description: string;
}
```

---

## UI Integration

### Scene Rendering

The UI reads `setup.scene` to render:
- Background based on `location.type`
- Furniture items positioned in the room
- Lighting/ambiance effects
- Props relevant to the scenario

### Agent Positioning

Agents positioned based on:
- Their role (moderator at front/center)
- Number of agents (spread evenly)
- Furniture (seated on chairs, behind desk, etc.)

---

## Migration Path

### Phase 1: Remove Hardcoded Templates
- Remove template-based opening message generation
- First agent turn handled like any other turn

### Phase 2: Add AI Setup Endpoint
- New endpoint `/api/cases/:id/ai-setup`
- Calls AI to generate setup JSON
- Stores in `setup_json` column

### Phase 3: Integrate with Case Creation
- Case creation triggers AI setup automatically
- Setup data returned in case response
- UI uses setup for rendering

### Phase 4: Scene Rendering
- UI interprets `scene.furniture` array
- Renders appropriate background/items
- Positions agents contextually

---

## Example: Complete Setup

**Input Scenario:**
```
LOCATION: South Bristol Hospital
SCENARIO: Rehab Ward - Hydration Challenge

PUBLIC INFO:
- Ward has 5 patients struggling with hydration
- Nurses are busy with medications and documentation

OPTIONS:
- Hydration Champions: Dedicated nurse per shift
- Protected Time: 15-min hydration rounds

AGENT: Sam
AGENDA (ACP): You've analysed the data. 3 UTIs last week. Be diplomatic but firm.

AGENT: Bev
AGENDA (Senior Nurse): 25 years nursing. Skeptical of initiatives. Need realistic solutions.
```

**AI-Generated Setup:**
```json
{
  "location": {
    "name": "South Bristol Hospital",
    "type": "hospital_ward",
    "description": "A rehabilitation ward with patient beds, a nurses' station, and a small meeting area"
  },
  "scene": {
    "furniture": ["hospital_beds", "nurses_station", "plastic_chairs", "water_jugs", "whiteboard"],
    "ambiance": "clinical",
    "lighting": "bright_fluorescent"
  },
  "agents": [
    {
      "name": "Sam",
      "role": "ACP - Facilitator",
      "appearance": {
        "accessory": "doctor_coat",
        "bodyStyle": "normal",
        "color": "#ffffff",
        "skinTone": "#d4a574",
        "gender": "male"
      }
    },
    {
      "name": "Bev",
      "role": "Senior Nurse",
      "appearance": {
        "accessory": "nurse_scrubs",
        "bodyStyle": "normal",
        "color": "#5dade2",
        "skinTone": "#8d5524",
        "gender": "female"
      }
    }
  ],
  "options": [
    {
      "name": "Hydration Champions",
      "description": "Dedicated nurse per shift for hydration"
    },
    {
      "name": "Protected Time",
      "description": "15-min hydration rounds with no interruptions"
    }
  ],
  "openingMessage": {
    "speaker": "Sam",
    "content": "Thank you for coming, Bev. I wanted to discuss our fluid intake numbers - we had three UTIs last week alone, and I believe they're linked to poor hydration. I've been looking at two possible approaches: having a Hydration Champion each shift, or implementing Protected Time for drink rounds. What's your take from the nursing perspective?"
  }
}
```

---

## Benefits

1. **No hardcoded templates** - Every scenario gets contextually appropriate setup
2. **Visual variety** - Different locations render different scenes
3. **Natural openings** - AI generates fitting first messages
4. **Consistent appearances** - AI ensures diversity and role-appropriate looks
5. **Extensible** - Easy to add new location types, furniture, accessories
