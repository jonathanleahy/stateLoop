# StateLoop - Claude Instructions

Multi-agent negotiation system where AI agents discuss and reach consensus on decisions.

## Key Documentation

| Document | Read When |
|----------|-----------|
| `SCENARIO_FORMAT.md` | Writing scenario files (FULL specification) |
| `SPECIFICATION.md` | System architecture & API details |
| `/api-docs` | Interactive API documentation (Swagger UI) |

## Scenario Quick Checklist

**Always read `SCENARIO_FORMAT.md` for full details.**

### Core Elements
- [ ] `SCENARIO:` title defined
- [ ] `LOCATION:` and `ICON:` set
- [ ] At least 2 `AGENT:` blocks with `AGENDA:` and `AGREEABILITY: 0-100`
- [ ] `OPTIONS:` section with 3-6 choices
- [ ] `RULES:` section defining resolution criteria
- [ ] `MAX_ROUNDS:` specified (default 20)
- [ ] `PUBLIC INFO:` section with shared context

### Task Types

| Task Type | Use For | Key Tags |
|-----------|---------|----------|
| `options` (default) | Choosing between options | `OPTIONS:` |
| `document` | Collaborative writing | `WORKING_DOCUMENTS`, `TASK_OUTPUT`, `TASK_TEMPLATE` |
| `both` | Options + document output | All of the above |

### Document-Based Scenarios

For collaborative writing tasks:
```
TASK_TYPE: document
TASK_OUTPUT: script

INPUT_DOCUMENT: reference_material
Content here...
END_DOCUMENT

WORKING_DOCUMENTS:
- draft: The main document agents edit together
- notes: Shared notes

TASK_TEMPLATE:
# {{title}}
{{content}}
END_TEMPLATE
```

### Forms (Mediation Agreements)

For scenarios requiring formal documentation on resolution:
```
FORM: mediation_agreement
DESCRIPTION: Agreement to be completed when resolved
FIELDS:
- date (date, required): Date of agreement
- parties (text, required): Party names
- summary (textarea, required): Summary of outcome
- consent (checkbox, required): All parties agree
END_FORM
```

**Field types:** `text`, `textarea`, `date`, `select`, `checkbox`
**Select options:** `- field (select): Label [Option1|Option2|Option3]`

See `workplace-mediation.txt` for a complete FORM example.

### Company-Based Scenarios

Reference existing companies for organizational context:
```
COMPANY: Acme Corporation
BUILDING: West Campus
ROOM: Conference Room A
```

## Example Scenarios

| Scenario | Features Demonstrated |
|----------|----------------------|
| `workplace-mediation.txt` | FORM section, mediation workflow |
| `art-commission.txt` | TASK_TYPE: document, artwork output |
| `fawlty-towers-script.txt` | INPUT_DOCUMENT, WORKING_DOCUMENTS, TASK_TEMPLATE |
| `hospital-hydration.txt` | Healthcare setting, complex personalities |
| `neighbourhood-dispute.txt` | Detailed profiles, personality traits |

## Key API Endpoints

### Core Flow
```
POST /api/cases              # Create case from scenario
GET  /api/cases/:id/auto-play # Get prompt for current agent
POST /api/cases/:id/setup    # AI submits setup + first message
POST /api/cases/:id/submit   # Submit agent response
POST /api/cases/:id/run      # Run to completion (auto-simulation)
```

### Scenarios
```
GET  /api/scenarios          # List available scenarios
GET  /api/scenarios/:name    # Get scenario content
POST /api/validate-scenario  # Validate scenario text
```

### Documents
```
POST /api/cases/:id/input-documents    # Add read-only reference
POST /api/cases/:id/documents          # Create working document
PUT  /api/cases/:id/documents/:name    # Replace document
GET  /api/cases/:id/documents/:name/history
```

### Output & Forms
```
POST /api/cases/:id/output   # Set final output
GET  /api/cases/:id/output   # Get final output
```

### Agent Profiles
```
GET  /api/agents/:name/profile
PUT  /api/agents/:name/profile
GET  /api/agents/:name/image-prompt
```

### Companies
```
GET/POST /api/companies
GET  /api/companies/:id/buildings
POST /api/companies/:id/employees
GET  /api/companies/:id/policies
```

## Key Files

- `scenarios/` - Example scenario files (30+ examples)
- `src/api/routes.ts` - API endpoints
- `src/services/taskService.ts` - Resolution logic

## Running a Scenario

```bash
# 1. Create case
curl -X POST http://localhost:3000/api/cases \
  -d '{"scenario": "..."}'

# 2. Get setup prompt
curl http://localhost:3000/api/cases/{id}/auto-play

# 3. Submit setup with first message
curl -X POST http://localhost:3000/api/cases/{id}/setup \
  -d '{"setup": {...}, "firstAgent": {...}}'

# 4. Loop: submit responses until resolved
curl -X POST http://localhost:3000/api/cases/{id}/submit \
  -d '{"taskId": "...", "agentId": "...", "response": {...}}'
```

## Agent Tips

- Give agents conflicting but reasonable goals
- Include hidden information others don't know
- Add "hard limits" they won't cross
- For moderators: use `Say "..."` for opening line, `Use type "message" only`
- Mix agreeability levels (some difficult 25-40, some moderate 45-60, some agreeable 65-80)
