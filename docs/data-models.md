# StateLoop Data Models

## Overview

StateLoop uses SQLite for persistence. This document describes all tables and their relationships.

## Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────────┐       ┌─────────────┐
│   cases     │───────│  participants   │       │   options   │
└─────────────┘       └─────────────────┘       └─────────────┘
       │                                               │
       │              ┌─────────────────┐              │
       └──────────────│    messages     │──────────────┘
                      └─────────────────┘
                             │
       ┌─────────────────────┴─────────────────────┐
       │                                           │
┌──────────────┐                          ┌────────────────┐
│ boss_messages│                          │  request_logs  │
└──────────────┘                          └────────────────┘
```

## Tables

### cases

The main table tracking negotiation cases.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PRIMARY KEY | Unique case identifier (e.g., "case-abc123") |
| `scenario` | TEXT NOT NULL | Description of the negotiation scenario |
| `status` | TEXT NOT NULL | Case status: "active", "resolved", "abandoned" |
| `current_turn` | TEXT | Participant ID whose turn it is |
| `outcome` | TEXT | Resolution outcome: "agreed", "failed", "abandoned" |
| `selected_option_id` | TEXT | ID of chosen option (if resolved) |
| `resolution_summary` | TEXT | Summary of how case was resolved |
| `created_at` | TEXT NOT NULL | ISO timestamp of creation |
| `updated_at` | TEXT NOT NULL | ISO timestamp of last update |
| `resolved_at` | TEXT | ISO timestamp of resolution |
| `location` | TEXT | Scenario location (park, hospital, library, office, school, cafe) |

```sql
CREATE TABLE cases (
  id TEXT PRIMARY KEY,
  scenario TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  current_turn TEXT,
  outcome TEXT,
  selected_option_id TEXT,
  resolution_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  location TEXT DEFAULT 'park'
);
```

### participants

People/agents involved in a case.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PRIMARY KEY | Unique participant ID |
| `case_id` | TEXT NOT NULL | Foreign key to cases |
| `name` | TEXT NOT NULL | Display name |
| `preferences` | TEXT | JSON array of preferences |
| `constraints` | TEXT | JSON array of constraints |
| `is_payer` | INTEGER | 1 if paying, 0 otherwise |
| `professional_role` | TEXT | Professional uniform type (nurse_scrubs, doctor_coat, police_uniform, teacher, business_suit, healthcare_assistant) |

```sql
CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  name TEXT NOT NULL,
  preferences TEXT,
  constraints TEXT,
  is_payer INTEGER DEFAULT 0,
  professional_role TEXT,
  FOREIGN KEY (case_id) REFERENCES cases(id)
);

CREATE INDEX idx_participants_case ON participants(case_id);
```

### options

Available options for a case.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PRIMARY KEY | Unique option ID |
| `case_id` | TEXT NOT NULL | Foreign key to cases |
| `name` | TEXT NOT NULL | Option name |
| `category` | TEXT | Type/category of option |
| `price_range` | TEXT | Price indicator ($, $$, $$$) |
| `features` | TEXT | JSON array of features |

```sql
CREATE TABLE options (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  price_range TEXT,
  features TEXT,
  FOREIGN KEY (case_id) REFERENCES cases(id)
);

CREATE INDEX idx_options_case ON options(case_id);
```

### messages

Conversation messages between participants.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PRIMARY KEY | Unique message ID |
| `case_id` | TEXT NOT NULL | Foreign key to cases |
| `author` | TEXT NOT NULL | Participant ID who sent message |
| `type` | TEXT NOT NULL | Message type (proposal, counter, accept, reject, message) |
| `content` | TEXT NOT NULL | Message text |
| `option_id` | TEXT | Referenced option (for proposals) |
| `timestamp` | TEXT NOT NULL | ISO timestamp |
| `agent_context` | TEXT | The private agenda/context the agent received (for debugging) |

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  author TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  option_id TEXT,
  timestamp TEXT NOT NULL,
  agent_context TEXT,
  FOREIGN KEY (case_id) REFERENCES cases(id),
  FOREIGN KEY (author) REFERENCES participants(id),
  FOREIGN KEY (option_id) REFERENCES options(id)
);

CREATE INDEX idx_messages_case ON messages(case_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
```

### boss_messages

Messages from the "boss" (system operator) to agents.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PRIMARY KEY | Unique message ID |
| `case_id` | TEXT NOT NULL | Foreign key to cases |
| `content` | TEXT NOT NULL | Message text |
| `target_agent` | TEXT | Specific agent target (null = all) |
| `read` | INTEGER | 1 if read, 0 otherwise |
| `timestamp` | TEXT NOT NULL | ISO timestamp |

```sql
CREATE TABLE boss_messages (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  content TEXT NOT NULL,
  target_agent TEXT,
  read INTEGER DEFAULT 0,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id)
);

CREATE INDEX idx_boss_messages_case ON boss_messages(case_id);
```

### request_logs

API request audit log.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PRIMARY KEY | Unique log ID |
| `method` | TEXT NOT NULL | HTTP method |
| `path` | TEXT NOT NULL | Request path |
| `query_params` | TEXT | Query string |
| `body_snippet` | TEXT | First 200 chars of body |
| `status_code` | INTEGER | Response status code |
| `duration_ms` | INTEGER | Request duration |
| `case_id` | TEXT | Related case ID (if applicable) |
| `timestamp` | TEXT NOT NULL | ISO timestamp |

```sql
CREATE TABLE request_logs (
  id TEXT PRIMARY KEY,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  query_params TEXT,
  body_snippet TEXT,
  status_code INTEGER,
  duration_ms INTEGER,
  case_id TEXT,
  timestamp TEXT NOT NULL
);

CREATE INDEX idx_logs_timestamp ON request_logs(timestamp);
CREATE INDEX idx_logs_case ON request_logs(case_id);
```

## TypeScript Interfaces

```typescript
interface Case {
  id: string;
  scenario: string;
  status: 'active' | 'resolved' | 'abandoned';
  currentTurn: string | null;
  outcome: 'agreed' | 'failed' | 'abandoned' | null;
  selectedOptionId: string | null;
  resolutionSummary: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  location: 'park' | 'hospital' | 'library' | 'office' | 'school' | 'cafe';

  // Populated relations
  participants?: Participant[];
  options?: Option[];
  messages?: Message[];
}

// Supported scenario locations
type Location = 'park' | 'hospital' | 'library' | 'office' | 'school' | 'cafe';

// Professional role uniforms for agents
type ProfessionalRole =
  | 'none'
  | 'nurse_scrubs'      // Blue/green medical scrubs
  | 'doctor_coat'       // White lab coat with stethoscope
  | 'police_uniform'    // Dark blue with badge
  | 'teacher'           // Cardigan, smart casual
  | 'business_suit'     // Formal suit and tie
  | 'healthcare_assistant'; // Light blue uniform

interface Participant {
  id: string;
  caseId: string;
  name: string;
  preferences: string[];
  constraints: string[];
  isPayer: boolean;
  professionalRole: ProfessionalRole | null;
}

interface Option {
  id: string;
  caseId: string;
  name: string;
  category: string;
  priceRange: string;
  features: string[];
}

interface Message {
  id: string;
  caseId: string;
  author: string;
  type: 'proposal' | 'counter' | 'accept' | 'reject' | 'message';
  content: string;
  optionId: string | null;
  timestamp: string;
  agentContext: string | null; // The private agenda the agent received
}

interface BossMessage {
  id: string;
  caseId: string;
  content: string;
  targetAgent: string | null;
  read: boolean;
  timestamp: string;
}

interface RequestLog {
  id: string;
  method: string;
  path: string;
  queryParams: string | null;
  bodySnippet: string | null;
  statusCode: number;
  durationMs: number;
  caseId: string | null;
  timestamp: string;
}
```

## Data Flow

### Creating a Case
1. Insert row into `cases` (with location if specified or auto-detected)
2. Insert rows into `participants` (one per participant, with professional roles)
3. Insert rows into `options` (one per option)
4. Set `current_turn` to first participant

### Location Detection
When creating a case, the location is determined by:
1. Explicit `LOCATION:` field in scenario text (highest priority)
2. Auto-detection from scenario keywords:
   - "hospital", "patient", "nurse", "doctor", "ward" → hospital
   - "library", "books", "reading", "librarian" → library
   - "office", "meeting", "conference", "corporate" → office
   - "school", "classroom", "student", "teacher" → school
   - "cafe", "coffee", "barista" → cafe
3. Default to "park" if no location detected

### Submitting a Response
1. Insert row into `messages`
2. Update `cases.current_turn` to next participant
3. Update `cases.updated_at`

### Resolving a Case
1. Update `cases.status` to "resolved"
2. Update `cases.outcome`
3. Update `cases.selected_option_id`
4. Update `cases.resolution_summary`
5. Update `cases.resolved_at`

## Migrations

For the POC, tables are created on startup if they don't exist. In production, use a migration system like `umzug` or `db-migrate`.
