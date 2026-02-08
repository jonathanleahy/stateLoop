# StateLoop Development Guide

This guide covers the architecture, development workflow, and key concepts for contributing to StateLoop.

## Quick Start

```bash
# One-command development startup (recommended)
./dev-all.sh

# Or manually:
npm install          # Install dependencies
npm run dev          # Start development server (with hot reload)

# Other useful commands:
npm test             # Run tests
npm run typecheck    # Type check without building
npm run build        # Build for production
npm start            # Run production server (after build)
```

### Startup Scripts

| Script | Purpose |
|--------|---------|
| `./dev-all.sh` | Install deps, type check, start dev server with hot reload |
| `./prod-all.sh` | Install deps, type check, build, start production server |

### Available URLs

Once the server is running:

| URL | Description |
|-----|-------------|
| http://localhost:3000 | Main UI - negotiation visualization |
| http://localhost:3000/api-docs | Interactive API documentation (Swagger UI) |
| http://localhost:3000/scenarios.html | Scenario browser and agent customizer |
| http://localhost:3000/companies.html | Company/organization management |
| http://localhost:3000/docs | Documentation viewer |

## Architecture Overview

```
stateLoop/
├── src/
│   ├── index.ts          # Express server entry point
│   ├── api/
│   │   ├── routes.ts     # All API endpoints
│   │   └── validation.ts # Request validation
│   ├── services/
│   │   ├── caseService.ts    # Case lifecycle management
│   │   ├── taskService.ts    # Agent task/response handling
│   │   └── companyService.ts # Company/org management
│   ├── storage/
│   │   └── sqlite.ts     # Database operations
│   └── types/
│       └── index.ts      # TypeScript type definitions
├── public/
│   ├── index.html              # Main UI
│   ├── scenarios.html          # Scenario browser
│   ├── companies.html          # Company management UI
│   ├── swagger-generated.json  # Auto-generated OpenAPI spec
│   ├── api-spec.yaml           # Original OpenAPI spec (reference)
│   ├── js/thronglet.js         # Canvas rendering engine
│   ├── css/styles.css          # UI styles
│   └── data/furniture.json     # Furniture catalog
├── scripts/
│   ├── swagger-generate.ts     # Swagger generation script
│   └── swagger-compare.ts      # Spec comparison tool
├── scenarios/            # Pre-made scenario files
├── workflows/            # Workflow template YAML files
├── docs/                 # Additional documentation
├── tests/
│   └── api.test.ts       # API integration tests
├── dev-all.sh            # Development startup script
└── prod-all.sh           # Production build and start script
```

## Core Concepts

### Cases
A **Case** is a negotiation session containing:
- **Scenario**: The situation description with agent agendas
- **Participants**: Agents with private agendas and appearance
- **Options**: Choices to negotiate between
- **Messages**: The conversation history
- **Documents**: Input (read-only) and Working (collaborative)

### Agent Turn Flow
1. System determines whose turn it is (`currentTurn`)
2. Agent calls `GET /api/cases/{id}/auto-play` to get their prompt
3. Agent processes prompt and submits response via `POST /api/cases/{id}/submit`
4. System records message, checks for resolution, advances turn
5. Response includes next agent's prompt (if case still active)

### Resolution
Cases resolve when:
- An agent accepts a proposal from another agent
- All non-moderator agents accept (consensus)
- Max rounds reached (timeout → failed)
- Too many rejections (3 rejects → failed)

### Companies
Persistent organizational structures that can be reused across scenarios:
- **Company**: Organization with industry, size, branding
- **Buildings**: Physical locations within a company
- **Rooms**: Spaces within buildings (offices, meeting rooms, studios)
- **Policies**: HR policies organized by category
- **Employees**: Agent assignments to companies with job titles

### Workflows
Multi-stage task orchestration:
- **Workflow**: Sequence of stages that produce a final output
- **Stage**: Individual task within a workflow (collaborative or solo)
- **Document Flow**: Output from one stage becomes input for the next
- **Templates**: YAML-defined reusable workflow patterns (in `workflows/`)

### Goals
Goal-driven dynamic workflows:
- Define high-level objectives instead of explicit task sequences
- AI generates execution plan based on goal type
- Adaptive execution can add, skip, or retry phases
- Goal types: `creative_writing`, `decision_making`, `problem_solving`, `document_creation`, `review_feedback`

## Key Files

### `src/api/routes.ts`
All API endpoints. Key sections:
- Case CRUD operations
- Agent task/submit flow
- Document management
- Scenario parsing and validation

### `src/services/taskService.ts`
Handles agent turns:
- `getNextTask()` - Builds the agent's task with context
- `submitResponse()` - Processes agent response, checks resolution
- `processDocumentUpdates()` - Applies document edits

### `src/services/caseService.ts`
Case lifecycle:
- `createCase()` - Initialize new negotiation
- `addMessage()` - Record agent message
- `resolveCase()` - Mark case as agreed/failed
- `advanceTurn()` - Move to next agent

### `src/storage/sqlite.ts`
Database layer with SQLite:
- Schema creation and migrations
- CRUD operations for all entities
- Transaction support

### `src/types/index.ts`
TypeScript definitions:
- `Case`, `Participant`, `Option`, `Message`
- `InputDocument`, `WorkingDocument`
- `Company`, `Building`, `Room`, `Policy`, `Employee`
- `Workflow`, `WorkflowStage`, `Goal`
- Request/response types

### `src/services/companyService.ts`
Company management:
- `createCompany()` - Create new organization
- `setupCompany()` - Bulk create company structure
- Building, room, policy, and employee CRUD

## API Documentation

Interactive API docs available at: `http://localhost:3000/api-docs`

The OpenAPI spec is auto-generated in `public/swagger-generated.json` (original reference: `public/api-spec.yaml`).

## Scenario Format

Scenarios use a markdown-like format. Key elements:

```
SCENARIO: Title

AGENT: AgentName
AGENDA (Role):
Private instructions for this agent...
AGREEABILITY: 50
APPEARANCE: nurse_scrubs

OPTIONS:
- Option 1: Description
- Option 2: Description

PUBLIC INFO:
Information visible to all agents.

RULES:
How resolution works.
```

See `SCENARIO_FORMAT.md` for complete specification.

## Location Types

Valid location types for `locationType`:
- `hospital` - Medical setting
- `office` - Corporate/business
- `school` - Educational
- `library` - Study spaces
- `cafe` - Cafe/coffee shop
- `park` - Outdoor park
- `outdoor` - Garden/outdoor spaces
- `studio` - Creative spaces
- `courtroom` - Legal settings

## Appearance Options

Agent accessories:
- Basic: `none`, `hat`, `glasses`, `bowtie`, `headphones`, `scarf`
- Professional: `nurse_scrubs`, `doctor_coat`, `police_uniform`, `teacher`, `business_suit`
- Mobility: `wheelchair`, `walking_stick`, `zimmer_frame`

Body styles: `normal`, `tall`, `short`, `wide`

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- tests/api.test.ts
```

Tests use Vitest and cover:
- Case creation and retrieval
- Agent task/submit flow
- Resolution logic
- Document operations

## Database

SQLite database stored at `data/stateloop.db`.

### Reset Database
```bash
curl -X POST http://localhost:3000/api/reset
```

### Migrations
Automatic migrations in `initializeDatabase()`:
- Adds new columns with `ALTER TABLE` if missing
- Handles legacy table renames

## Common Tasks

### Add New Endpoint
1. Add route in `src/api/routes.ts` with swagger-autogen comments
2. Add types in `src/types/index.ts` if needed
3. Add storage functions in `src/storage/sqlite.ts` if needed
4. Run `npm run swagger:generate` to update API documentation
5. Add tests in `tests/api.test.ts`

#### API Documentation with swagger-autogen

API documentation is auto-generated from inline comments in `src/api/routes.ts` using [swagger-autogen](https://github.com/swagger-autogen/swagger-autogen).

**Add comments inside route handlers:**

```typescript
router.get('/example/:id', (req: Request, res: Response) => {
  /*
    #swagger.tags = ['Category']
    #swagger.summary = 'Short one-line description'
    #swagger.description = 'Detailed explanation of what this endpoint does.'
    #swagger.parameters['id'] = { description: 'Resource ID' }
    #swagger.responses[200] = { description: 'Success response' }
    #swagger.responses[404] = { description: 'Resource not found' }
  */
  // ... implementation
});
```

**For request bodies:**

```typescript
router.post('/example', (req: Request, res: Response) => {
  /*
    #swagger.tags = ['Category']
    #swagger.summary = 'Create example'
    #swagger.requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string', description: 'Name of the resource' },
              description: { type: 'string' }
            }
          }
        }
      }
    }
    #swagger.responses[201] = { description: 'Created' }
  */
  // ... implementation
});
```

**Available comment directives:**

| Directive | Purpose |
|-----------|---------|
| `#swagger.tags = ['Tag']` | Categorize endpoint |
| `#swagger.summary = '...'` | Short description (shown in list) |
| `#swagger.description = '...'` | Detailed description |
| `#swagger.parameters['name'] = {...}` | Document path/query parameter |
| `#swagger.requestBody = {...}` | Document request body |
| `#swagger.responses[200] = {...}` | Document response |
| `#swagger.ignore = true` | Exclude from docs |

**Swagger scripts:**

```bash
npm run swagger:generate  # Generate swagger-generated.json
npm run swagger:compare   # Compare with original api-spec.yaml
npm run swagger:migrate   # Generate and compare
```

**Important:** The server uses `public/swagger-generated.json` for the Swagger UI at `/api-docs`. This file is auto-generated on `npm run dev` and `npm run build`. The file `public/api-spec.yaml` is deprecated and kept only for human-readable reference. Always update the `#swagger` comments in routes.ts rather than editing api-spec.yaml directly.

Schema definitions are in `scripts/swagger-generate.ts`.

### Add New Entity Type
1. Define types in `src/types/index.ts`
2. Add table creation in `src/storage/sqlite.ts`
3. Add CRUD functions in storage
4. Add API endpoints in routes
5. Update API spec

### Modify Scenario Parsing
Parsing logic is in `src/api/routes.ts`:
- `extractAgentNames()` - Find agent names
- `extractAgendaForAgent()` - Get private agenda
- `extractOptionNames()` - Parse OPTIONS section
- Validation in `POST /api/validate-scenario`

## Debugging

### Request Logs
```bash
curl http://localhost:3000/api/logs
```

### Agent Prompts
```bash
# Get current agent's prompt
curl http://localhost:3000/api/cases/{id}/auto-play

# Get raw prompt for specific agent
curl http://localhost:3000/api/cases/{id}/agent-prompt?agentId=case-xxx-person-0
```

### Case State
```bash
curl http://localhost:3000/api/cases/{id}
```

## Code Style

- TypeScript strict mode enabled
- ESLint for linting
- Prefer explicit types over `any`
- Use async/await over callbacks
- Keep functions focused and small

## API Endpoint Categories

The API is organized into these categories (see `/api-docs` for full details):

| Category | Endpoints | Purpose |
|----------|-----------|---------|
| Cases | `/api/cases/*` | Case CRUD, agent tasks, resolution |
| Documents | `/api/cases/:id/documents/*` | Input and working documents |
| Scenarios | `/api/scenarios/*` | Scenario library and validation |
| Companies | `/api/companies/*` | Organization management |
| Buildings/Rooms | `/api/companies/:id/buildings/*` | Physical locations |
| Policies | `/api/companies/:id/policies/*` | HR policy management |
| Employees | `/api/companies/:id/employees/*` | Staff assignment |
| Workflows | `/api/workflows/*` | Multi-stage orchestration |
| Workflow Templates | `/api/workflow-templates/*` | YAML template management |
| Goals | `/api/goals/*` | Goal-driven dynamic workflows |
| Agents | `/api/agents/*` | Agent templates and history |
| Admin | `/api/reset`, `/api/logs` | Maintenance |

## Company-Based Scenarios

To set a scenario within a company context:

```
SCENARIO: Performance Review

COMPANY: Acme Corporation
BUILDING: Headquarters
ROOM: HR Meeting Room

AGENT: Sarah
AGENDA (Manager):
Review team member performance...
```

The scenario automatically inherits company policies and employee relationships.

## Workflow Templates

Workflows are defined in YAML (stored in `workflows/` directory):

```yaml
name: screenplay-writing
title: Collaborative Screenplay
description: Multi-stage screenplay creation
version: 1

inputs:
  - name: premise
    description: Story premise
    required: true

stages:
  - name: brainstorm
    type: collaborative
    agentCount: 3
    output: outline

  - name: draft
    type: solo
    output: script

  - name: review
    type: collaborative
    agentCount: 2
    output: final_script

output:
  primary: final_script
  include: [outline]
```

## Policy Categories

Available policy categories (from `/api/policy-categories`):
- Leave (vacation, sick, parental)
- Conduct (workplace behavior, ethics)
- Safety (health and safety)
- Remote Work (WFH policies)
- Expenses (reimbursement)
- Training (professional development)
- Diversity (inclusion policies)
- Data (privacy, security)

## Room Types

Available room types for buildings:
- `office` - Standard office
- `meeting_room` - Conference/meeting space
- `break_room` - Kitchen/break area
- `studio` - Recording/creative studio
- `reception` - Reception/lobby
- `storage` - Storage area
- `lab` - Laboratory/research space
- `other` - Custom type

## Related Documentation

- `HOWTO.md` - Beginner-friendly getting started guide
- `CLAUDE.md` - AI assistant instructions
- `SCENARIO_FORMAT.md` - Scenario file specification
- `AI_SETUP.md` - AI case setup process
- `SPECIFICATION.md` - Full system specification
- `docs/requirements.md` - Functional requirements
- `docs/` - Additional design documents
- `/api-docs` - Interactive API documentation (Swagger UI)
