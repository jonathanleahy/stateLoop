# StateLoop POC - Requirements Specification

## Overview

StateLoop is a **stateless agent orchestration system** designed to coordinate AI agents without requiring them to maintain internal state. The core principle is that "memory" lives entirely in the system state, not in the agents themselves.

## Core Principles

1. **Stateless Agents**: Agents fetch all context they need each time they request work
2. **System-Managed State**: All state persists in the central system (SQLite database)
3. **Audit Trail**: Every action is logged for full traceability
4. **Hot-Swappable**: Agents can be stopped, started, or replaced without losing progress
5. **Private Agendas**: Each agent only sees their own context/preferences, not others'

## Benefits

- **Resilience**: Stop/start agents without losing progress
- **Flexibility**: Swap agents mid-task (e.g., switch from GPT-4 to Claude)
- **Concurrency**: Multiple agents can work on the same case simultaneously
- **Debugging**: Full audit trail of all actions and decisions
- **Simplicity**: Agents don't need to maintain conversation history
- **Privacy**: Agents have private agendas visible only to them

## POC Scenario: Multi-Agent Negotiation

### Description
Multiple agents negotiate to reach consensus on a decision. Each agent has private preferences and agendas that only they can see, and they must reach a compromise through iterative proposals.

### Key Features
- **Dynamic Agents**: Agents are defined in the case description text, not hardcoded
- **Private Agendas**: Each agent has a secret agenda visible only to them
- **Turn-Based Negotiation**: System tracks whose turn it is to speak
- **Auto-Resolution**: Case resolves automatically when an agent accepts a proposal

### Participants (Defined Per-Case)
Participants are extracted from the case description using the `AGENT:` format. Each agent has:
- Name
- Private agenda/preferences (only visible to that agent)
- Public constraints (optional)

### Flow
1. Case is created with scenario text describing agents, agendas, and options
2. System parses the description to extract participants and options
3. First agent's turn is set automatically
4. The auto-play endpoint is called, which:
   - Determines whose turn it is
   - Extracts that agent's private agenda from the scenario
   - Calls Claude API to generate a response
   - Submits the response and advances the turn
5. Process repeats until an accept message is submitted
6. Case resolves automatically when consensus is reached

## Case Description Format

Cases are created using a structured text format:

```
AGENT: Alice
SECRET AGENDA: You strongly prefer Italian food. You have a $30 budget.
You should push for Olive Garden but can compromise if needed.

AGENT: Bob
SECRET AGENDA: You're vegetarian and prefer Mexican food. Price isn't
an issue. Try to get Taco Town but be willing to negotiate.

OPTIONS:
- Olive Garden: Italian, $$, vegetarian options
- Taco Town: Mexican, $, vegetarian-friendly
- Sushi Palace: Japanese, $$$, fresh fish
```

### Parsing Rules
1. `AGENT: Name` - Defines a new participant
2. Lines after `AGENT:` until next section = that agent's private agenda
3. `OPTIONS:` section lists available choices
4. Each `- Name` line creates an option

## Functional Requirements

### FR-1: Case Management
- Create new negotiation cases with scenario text
- Parse case description to extract agents and options
- Retrieve full case state including all messages
- Track case status (active, resolved, abandoned)
- Reset database to clear all cases

### FR-2: Task Distribution (Stateless)
- System determines whose turn it is (no agent ID needed)
- Include full context in each response
- Extract private agenda for current agent only
- Track which agent is currently "thinking"

### FR-3: Auto-Play Endpoint
- Single endpoint `/api/cases/:id/auto-play` handles full turn
- Calls Claude API with agent's private context
- Submits response and advances turn
- Returns result of the turn

### FR-4: Response Handling
- Accept agent responses (proposals, acceptances, rejections)
- Validate response format and content
- Update case state accordingly
- Store agent context with each message (for debugging)
- Auto-resolve when accept is submitted (if proposer != accepter)

### FR-5: Resolution
- Automatic resolution when agent accepts another's proposal
- Record final agreement with selected option
- Support manual resolution for edge cases

### FR-6: Logging
- Log all API requests with timestamps
- Store request method, path, and body snippets
- Make logs accessible via API

### FR-6.1: AI Response Validation
- Validate JSON structure on `/api/cases/:id/setup` endpoint
- Validate JSON structure on `/api/cases/:id/submit` endpoint
- Return actionable error messages when validation fails
- Include `details` array listing all validation issues found
- Include `hint` field with guidance on how to fix issues
- Return HTTP 400 for validation errors (not 500)
- Allow AI to retry after fixing validation errors
- Validate agent fields (name, agenda, agreeability range 0-100)
- Validate option fields (name, description)
- Validate response types (proposal, counter, accept, reject, message)
- Validate option IDs exist in case
- Validate document names exist for documentUpdates
- Provide clear JSON parse error messages for malformed JSON

### FR-14: Process Flows (Workflows)
- Support chaining multiple tasks/cases together in a workflow
- Output documents from one task become input documents for the next
- Each task has a defined purpose and expected output
- Tasks can be collaborative (multi-agent) or solo (single agent)
- Workflow tracks progress across all constituent tasks
- Final workflow output aggregates deliverables from all tasks

### FR-15: Goal-Driven Workflows
- Define high-level goals rather than explicit task sequences
- AI analyzes goal and generates appropriate execution plan
- Plan determines number and type of tasks dynamically
- Adaptive execution can add, skip, or retry phases
- Progress tracked toward goal completion, not just task completion

### FR-16: Document Flow Between Tasks
- Tasks produce working documents as their output
- Designated output document from Task N becomes input to Task N+1
- Input documents are read-only references for the receiving task
- Working documents can be carried forward for continued editing
- Document versioning preserved across task boundaries
- Clear provenance tracking: which task created which document
- Support for multiple document outputs feeding into next task

### FR-17: Workflow Definition (Config-Driven)
- Workflows defined in YAML files or via API
- No visual editor required for workflow creation
- YAML format supports: stages, inputs, outputs, agent configuration
- Workflow templates for common patterns (creative writing, decision making)
- API endpoints to list, load, and start workflow templates
- Workflows stored in `workflows/` directory
- Version control friendly (plain text files)

### FR-18: Workflow Visualization (Diagram Preview)
- Auto-generate Mermaid diagrams from workflow definitions
- Read-only visualization showing task flow and document routing
- Endpoint returns Mermaid source or rendered SVG
- Diagrams show: inputs, stages, document flow, outputs
- Linear progress view showing current stage and completion status
- Stage detail view linking to underlying case
- No React required - uses Mermaid.js or D3.js for rendering

### FR-19: Workflow Progress UI
- Linear step indicator showing workflow stages
- Visual status: pending (○), active (▶), completed (✓)
- Current stage details panel
- Input/output document preview
- Links to view full case conversation
- Replay functionality for completed stages
- Progress percentage calculation

### FR-20: Agent Variability
- Each agent has a `variability` parameter (0.0 - 1.0)
- Low variability = predictable, follows agenda strictly
- High variability = unpredictable, tangents, position changes
- Agents can have `quirks` - behavioral tendencies affecting responses
- Agents can have `triggers` - topics that provoke strong reactions
- Variability guidance included in LLM prompts

### FR-21: Agent Mood System
- Agents have a `mood` state (neutral, enthusiastic, skeptical, tired, frustrated, distracted, inspired)
- Mood affects effective agreeability and response style
- When `moodSwings: true`, mood evolves based on conversation events
- Mood modifiers: acceptance → enthusiastic, rejection → frustrated, long debate → tired
- Mood displayed in agent info for observers

### FR-22: Case-Level Temperature
- Cases have a `temperature` parameter (0.0 - 1.0)
- Affects overall randomness of all agent responses
- Low temperature = deterministic, high = creative/chaotic
- `chaosLevel` setting: calm, normal, heated, chaotic
- Temperature passed to LLM API calls when using Claude integration

### FR-23: Random Events
- When `randomEvents: true`, system may inject interruptions
- Event types: phone interruption, coffee break, external deadline, misunderstanding
- Events affect agent mood and response patterns
- Events logged in conversation for observers
- Configurable event frequency

### FR-24: Detailed Agent Profiles (for Character Illustration)
- Comprehensive physical descriptions for drawing/rendering agents
- **Body attributes**: height, weight, build, skin tone, posture, gait
- **Facial features**: face shape, eye color/shape, nose shape, lip shape, eyebrow shape, chin shape, complexion, resting expression
- **Hair details**: color, style, length, facial hair, texture, gray percentage
- **Distinguishing marks**: tattoos, scars, birthmarks with location and visibility
- **Voice & mannerisms**: voice description, accent, behavioral tics
- Profiles stored persistently and reused across cases
- Image generation prompts auto-generated from profile data

### FR-25: Agent Life History (Growing Up)
- Rich character backstory for authentic personality portrayal
- **Childhood**: summary, location, family background
- **Education**: schools, degrees, certifications
- **Career**: job history in chronological order
- **Life events**: significant events, formative experiences
- **Relationships**: key people who shaped them
- **Current state**: situation, fears, desires, secrets
- **Abilities**: skills, talents, hobbies
- History influences agent behavior and decision-making
- Provides context for AI to roleplay authentically

### FR-26: Case History Tracking
- Automatic recording when agents join cases
- Track: case ID, scenario title, role played, timestamp
- Update outcome when cases resolve (agreed/failed/abandoned)
- History accessible via `GET /api/agents/:name/history`
- Enables "experienced" agents who remember past negotiations
- Foundation for agent reputation and relationship systems

### FR-27: Job Matching & Agent Vetting (Planned)
- Define job descriptions with required personality traits
- System suggests agents whose profiles match job requirements
- Match criteria: skills, experience, personality traits, agreeability range
- User reviews and approves agents before case creation
- Agents can "apply" for roles they're suited for
- Vetting UI shows fit score and highlights mismatches
- Enables role-appropriate casting for scenarios
- Future: AI-generated agents to fill gaps in roster

### FR-7: Visualization (Thronglet UI)
- 2D/3D rendering modes (toggle between views)
- Agents dynamically positioned based on participant count
- Speech bubbles with full message text
- Real-time updates via polling
- Conversation thread panel showing message history
- Collision avoidance (agents don't walk into trees/options)
- Idle behaviors (wandering, checking phone, chitchat)
- Option cards only appear after case is created
- Speaker positioning (speaker moves to front at 35% across, y=380)
- Other agents clear away from speech bubble area when someone speaks
- Speaker returns to original position after speaking
- Text-to-speech for agent messages (enabled by default)
- Zoom mode to focus on speaking agents
- Message replay functionality
- Professional role appearances (nurse_scrubs, doctor_coat, police_uniform, teacher, business_suit, healthcare_assistant)
- Location furniture with 3D rendering and transparent backgrounds

### FR-8: Audio Features
- Text-to-speech for all agent messages
- Audio enabled (ON) by default on page load
- Toggle button in header to enable/disable audio
- Unique voice per agent with configurable pitch (0.7-1.4), rate (0.85-1.15), and voice type (male/female)
- Message display syncs with speech completion
- Polling pauses during speech playback
- Speech bubble remains visible for 15 seconds after audio ends

### FR-9: Message Queue System
- Messages added to queue as they arrive from API
- Messages displayed one at a time in sequence
- Each message shown for minimum duration with speech sync
- Speech completion triggers next message (500ms pause between)
- Replay functionality to review conversation from start
- Speaker moves to visible position (35% across, y=380) during their message
- Other agents clear away from speech bubble area

### FR-10: Agent Customizer (scenarios.html)
The agent customizer provides comprehensive appearance configuration:

**Age Groups:**
- child (70% scale), teen (85% scale), adult (100%), middle (100%), elderly (95%)

**Body Styles:**
- normal, tall, short, wide, athletic (each with distinct width/height proportions)

**Body Shapes (3D Mode):**
- box (default isometric), cylinder (rounded), oval (egg-shaped)

**Skin Tones:**
- 6 preset tones from light (#ffe0bd) to dark (#5c3317)

**Hair Colors:**
- black, brown, auburn, blonde, gray, white, red

**Accessories:**
- none, hat, glasses, bowtie, headphones, scarf

**Professional Roles:**
- nurse_scrubs, doctor_coat, police_uniform, teacher, business_suit, healthcare_assistant

**Mobility Options:**
- standing, wheelchair, walking_stick, zimmer_frame

**Live Preview:**
- Real-time 2D/3D preview canvas
- JSON code output for copying to scenarios
- Instant updates on any setting change

### FR-11: 2D/3D View Toggle
- Toggle button in map header to switch between 2D and 3D rendering modes
- 2D Mode: Classic pixelated top-down view
- 3D Mode: Isometric pseudo-3D rendering with depth
- Body shapes (box, cylinder, oval) only affect 3D rendering
- Both modes support all agent accessories and professional roles
- Mode preference persisted in localStorage

### FR-12: Location Furniture Improvements
- 3D rendering for location-specific furniture
- Transparent PNG backgrounds for furniture sprites
- Proper depth sorting for layered rendering
- Isometric perspective matching agent rendering
- Shadow and lighting effects for visual consistency
- Dynamic scaling based on canvas size
- Type-specific rendering for supported furniture items:
  - Full 3D rendering: hospital_bed, bookshelf, conference_table, reading_table, cafe_table, office_chair, armchair, bar_stool, tree, window
  - Box rendering: cafe_counter, coffee_machine, pastry_case
  - Wall-mounted (skipped in placement): menu_board, hanging_light, quiet_sign, clock, notice_board
- Unknown furniture item types are no longer rendered as gray boxes

### FR-13: Location Viewer Rotation (scenarios.html)
- Mouse drag rotation for location preview
  - Drag left/right to rotate the room view
  - Smooth, responsive rotation following mouse movement
- 4-wall room structure with visibility culling
  - Room has 4 walls (front, back, left, right)
  - Front wall is culled by default to show room interior
  - Walls facing the viewer are automatically hidden based on rotation angle
  - Creates a "cutaway" view that always reveals room contents
- True isometric 3D projection
  - Room rotates properly in 3D space (not just 2D canvas rotation)
  - Isometric perspective is maintained during rotation
  - Furniture and agents remain properly positioned as room rotates
- Zoom controls for location preview
  - Zoom in/out buttons for scale adjustment
  - Reset button to return to default zoom level

## Non-Functional Requirements

### NFR-1: Simplicity
- Beginner-friendly codebase
- Clear separation of concerns
- Comprehensive documentation
- Single text box for case creation

### NFR-2: Testability
- TDD approach with API tests
- Unit tests for all services
- Integration tests for API endpoints

### NFR-3: Performance
- Sub-second response times for API calls
- Efficient polling (2 second intervals)
- Lightweight database operations

### NFR-4: Portability
- Standard Node.js/TypeScript stack
- SQLite for zero-config persistence
- No external service dependencies (except Claude API)

### NFR-5: Code Quality
- TypeScript for type safety
- 15 automated API tests with in-memory database isolation
- Clean code with no unused variables
- Comprehensive documentation (SPEC.md, requirements.md, api-design.md, ui-design.md, thronglet-spec.md)
- Consistent error handling patterns
- Safe JSON parsing for resilience against malformed database data
- Content-type aware API responses (JSON for programmatic access, text for human readability)

### NFR-6: API Documentation
- Auto-generated OpenAPI 3.0 specification using swagger-autogen
- Generated spec stored in `public/swagger-generated.json`
- Original reference spec preserved in `public/api-spec.yaml`
- Interactive Swagger UI available at `/api-docs`
- Documentation auto-generated from inline comments in `src/api/routes.ts`
- Schema definitions maintained in `scripts/swagger-generate.ts`
- All endpoints must include swagger-autogen comments
- Comparison tool validates generated spec against original

#### API Documentation Standards
When adding or modifying endpoints, add swagger-autogen comments inside the route handler:

```typescript
router.get('/example/:id', (req: Request, res: Response) => {
  /*
    #swagger.tags = ['Category']
    #swagger.summary = 'Short description'
    #swagger.description = 'Detailed explanation of what this endpoint does.'
    #swagger.parameters['id'] = { description: 'Resource ID' }
    #swagger.responses[200] = { description: 'Success' }
    #swagger.responses[404] = { description: 'Not found' }
  */
  // ... implementation
});
```

**Required comment directives:**
1. `#swagger.tags` - Categorize the endpoint
2. `#swagger.summary` - Short one-line description
3. `#swagger.description` - Detailed explanation
4. `#swagger.parameters['name']` - Document path/query parameters
5. `#swagger.requestBody` - Document POST/PUT request bodies
6. `#swagger.responses[code]` - Document response codes

**Swagger scripts:**
- `npm run swagger:generate` - Generate `swagger-generated.json`
- `npm run swagger:compare` - Compare against original spec
- `npm run swagger:migrate` - Generate and compare

### NFR-7: Startup Scripts
- `dev-all.sh` - One-command development startup (install, typecheck, swagger generate, run with hot reload)
- `prod-all.sh` - One-command production build and start (install, typecheck, swagger generate, build, run)
- Scripts handle dependency installation automatically
- Scripts regenerate API documentation on each startup
- Scripts display available URLs on startup
- All scripts executable and work on Linux/macOS

## Privacy Requirements

### PR-1: Private Agendas
- Each agent's agenda is extracted from their `AGENT:` section only
- Agents never see other agents' private instructions
- Agent context is stored with messages for debugging
- UI can optionally show what context each agent received

### PR-2: Information Boundaries
- Agents see: scenario overview, options, conversation history, their own agenda
- Agents don't see: other agents' agendas, system instructions for other agents

## Success Criteria

1. Multiple Claude agents can successfully negotiate and reach consensus
2. Each agent only sees their own private agenda
3. Full conversation history is preserved and accessible
4. UI updates in real-time as agents interact
5. Agents display as distinct characters on the Thronglet map
6. Complete audit trail available in logs
7. System can be stopped and restarted without data loss
8. Single auto-play endpoint handles full agent turn cycle
9. Text-to-speech provides audible agent messages (audio on by default)
10. Speaking agent is clearly visible (moves to front at 35% across, y=380)
11. Other agents clear away from speech bubble when someone speaks
12. 2D/3D view toggle allows different visual presentations
13. Message replay allows reviewing completed conversations
14. Agent customizer provides full appearance configuration (age, body, skin, hair, accessories, roles, mobility)
15. Location furniture renders with 3D depth and transparent backgrounds
16. Each agent has unique voice settings (pitch, rate, voice type)
17. Message queue with speech sync ensures orderly message display
