# StateLoop Feature Specifications

## Overview

This document describes the features implemented in the StateLoop UI enhancement update.

---

## 0. Consistent Header & Navigation

### Description
All pages share a consistent header with the StateLoop branding and navigation.

### Header Elements
- **Logo**: StateLoop icon with gradient background (clickable, links to home)
- **Title**: "StateLoop" with tagline "Stateless Agent Orchestration"
- **Config Button**: Gear icon button linking to scenarios/config page
- **Page Controls**: Context-specific controls (case selector, tabs, etc.)

### Main Page (`/index.html`)
- Case selector dropdown
- New Case button
- Clear database button
- **Config** button (gear icon) → links to `/scenarios.html`
- Theme toggle

### Config Page (`/scenarios.html`)
- Tab navigation: Scenarios, Furniture, Locations, Agents
- Home link → links to `/index.html`
- Docs link

---

## 1. Furniture Store

### Location
`/scenarios.html` - Furniture tab

### Description
A visual catalog of furniture items that can be used in scenarios. Each item is rendered on a canvas with selectable 2D or 3D view.

### Features
- **2D/3D View Toggle**: Switch between top-down 2D view and isometric 3D view
- **Canvas Previews**: Each furniture item has a 120x80 canvas showing visual representation
- **Categorized Display**: Items grouped by category (Hospital, Office, Library, School, Cafe, Outdoor, Common)
- **Item Details**: Shows name, description, and size (width x height)

### Data Source
`/data/furniture.json`

### Supported Items (with custom rendering)
- Hospital: bed, nurse station, wheelchair, IV stand
- Office: conference table, office chair, desk
- Library: bookshelf, reading table
- School: blackboard, student desk
- Cafe: cafe table, cafe counter, coffee machine
- Outdoor: tree, bench
- Common: window, door

### Interactive Furniture Viewer

Click on any furniture item to open a detailed viewer modal:
- **Rotation Controls**: Rotate the item 45° left or right
- **Zoom Controls**: Zoom in/out for detail inspection
- **Grid Background**: Reference grid for size estimation
- **Item Info**: Name, description, and dimensions displayed

**Implementation Note**: The furniture viewer uses the same isometric rendering approach as the location viewer:
- `toIso(x, y, z)` function with rotation built into coordinate transformation
- `drawIsoBox()` helper for rendering 3D boxes
- Rotation affects world coordinates, not the canvas itself

### Furniture Rendering Details

All furniture items have detailed 3D isometric rendering:

**Hospital Bed** (`drawIsoBed`):
- Metal frame with legs and side rails
- Mattress with quilting lines
- Pillow with indent detail
- Blanket fold at foot
- Headboard

**Bookshelf** (`drawIsoBookshelf`):
- Dark wood frame with back panel
- Three shelf dividers
- Individual books with varied heights, widths, and colors
- Top decorative molding

**Table** (`drawIsoTable`):
- Four legs with proper isometric depth
- Tabletop with edge highlight
- Wood grain effect

**Chair** (`drawIsoChair`):
- Four legs
- Seat cushion with padding highlight
- Back rest with cushion

**Tree** (`drawIsoTree`):
- Shadow on ground
- Trunk with bark texture lines
- Multi-layered foliage (5 layers)
- Highlight on top

**Window** (`drawIsoWindow`):
- Frame with shadow
- Glass with gradient effect
- Reflection highlight
- Cross muntins

---

## 2. Location Showroom

### Location
`/scenarios.html` - Locations tab

### Description
Visual preview of all available scenario locations with 2D top-down and 3D isometric views. Locations use furniture items from the Furniture Warehouse.

### Features
- **2D/3D View Toggle**: Switch between views for all locations
- **6 Locations**: Hospital Ward, Library, Office, School, Cafe, Park
- **Warehouse Integration**: Furniture items are fetched from the furniture data and rendered using shared drawing functions
- **Location-specific styling**: Floor textures, wall colors, and layouts per location
- **Click to View**: Click any location card to open the interactive viewer

### Interactive Location Viewer
Click on any location to open a detailed viewer modal:
- **Rotation Controls**: Rotate the location view 30° left or right (buttons or drag)
- **Drag to Rotate**: Click and drag on the canvas to rotate smoothly
- **Zoom Controls**: Zoom in/out to see details
- **Full 3D View**: See the complete location with furniture
- **Furniture Positioning**: Furniture items are positioned using isometric transformation that accounts for room rotation
- **Wall Visibility**: Walls automatically show/hide based on rotation angle for proper depth
- **Location Info**: Name and description displayed

**Shared Rendering Approach**: Both the furniture viewer and location viewer use the same isometric rendering pattern:
```javascript
// Rotate point around origin in XY plane, then apply isometric projection
function toIso(x, y, z) {
  const rx = x * Math.cos(rotRad) - y * Math.sin(rotRad);
  const ry = x * Math.sin(rotRad) + y * Math.cos(rotRad);
  return {
    x: originX + (rx - ry) * Math.cos(isoAngle) * scale,
    y: originY + (rx + ry) * Math.sin(isoAngle) * scale - z * scale
  };
}
```
This ensures rotation is applied to world coordinates, keeping furniture and room elements properly aligned.

---

## 3. Agent Appearances & Personas

### Location
`/scenarios.html` - Agents tab

### Description
The Agents tab provides two features:
1. **Agent Customizer** - Live preview tool to design custom agent appearances
2. **Agent Personas** - Pre-built characters with backstories ready for use in scenarios

### Agent Customizer
Interactive tool with live 2D/3D preview allowing customization of:
- Age group (child, teen, adult, middle-aged, elderly)
- Gender
- Body style (normal, tall, short, wide, athletic)
- Skin tone
- Shirt/clothing color
- Accessories and professional roles
- Mobility aids

### Agent Personas Gallery
Pre-built characters organized by category with:
- **Visual preview** - Canvas rendering showing the character
- **Name and role** - Character name and their position/role
- **Backstory** - Detailed background explaining their personality, motivations, and constraints
- **Traits** - Personality trait tags (e.g., "Diplomatic", "Skeptical", "Practical")
- **Agreeability** - 0-100 scale indicating willingness to compromise
- **Appearance code** - Copy-paste ready appearance settings for scenarios

#### Persona Categories
- **Hospital Staff**: Dr. Sam Chen (ACP), Bev Thompson (Senior Nurse), Jordan Williams (Junior Nurse), Priya Sharma (HCA)
- **Patients**: Derek Morrison, Margaret Ellis, Anil Kapoor, Doris May, Keith Barnes
- **Moderators**: The Moderator (Discussion Facilitator)
- **Education**: Sarah Mitchell (Teacher)
- **Emergency Services**: PC James Carter (Police)
- **Corporate**: David Armstrong (Executive)

### Appearance Options

#### Basic Accessories
- `none` - Default appearance
- `hat` - Casual cap
- `glasses` - Spectacles
- `bowtie` - Formal/moderator
- `headphones` - Music lover
- `scarf` - Creative style

#### Professional Roles
- `nurse_scrubs` - Medical nursing staff (blue/teal scrubs)
- `doctor_coat` - Medical doctor (white coat)
- `police_uniform` - Police officer (dark blue)
- `teacher` - Education professional (cardigan)
- `business_suit` - Corporate professional
- `healthcare_assistant` - Healthcare support staff

#### Mobility Aids
- `wheelchair` - Wheelchair user
- `walking_stick` - Uses walking cane (elderly)
- `zimmer_frame` - Uses walking frame (elderly)

### Body Styles
- `normal` - Standard body type
- `tall` - Taller stature
- `short` - Shorter stature
- `wide` - Broader build

### Voice Settings
Each agent can have customized voice properties:
```javascript
voice: {
  pitch: 0.7-1.4,    // Voice pitch
  rate: 0.7-1.15,    // Speech rate
  voiceType: 'male' | 'female'
}
```

### Agent Graphics
Agents are rendered with realistic proportions including:
- **Articulated arms**: Upper arm (sleeved), forearm (skin), and hands
- **Articulated legs**: Thigh, calf, and shoes with walking animation
- **Rounded body**: Torso with rounded corners for natural appearance
- **Neck**: Visible neck connecting head to body
- **Skin tones**: Customizable skin color for hands, arms, and face

---

## 4. Main Map 2D/3D View Toggle

### Location
Main UI toolbar - "2D" / "3D" button

### Description
Toggle between 2D top-down view and 3D isometric view of the negotiation scene.

### Features
- **2D Mode**: Top-down view with simple 2D furniture and agent rendering
- **3D Mode**: Isometric view with 3D furniture and agent rendering
- **Consistent View**: Both furniture and agents render in the same style based on view mode
- **Depth Sorting**: Agents sorted by Y position for proper layering in 3D mode

### Implementation
- `viewMode` variable: `'2d'` or `'3d'`
- `drawBackground()`: Checks viewMode and calls 2D or isometric background
- `drawIsometricBackground()`: Draws 3D room with floor, walls, window (centered in view)
- `drawIsometricDecorations()`: Location-specific 3D decorations (beds, tables, bookshelves with detailed books)
- `drawIsoBox()`: Helper for rendering 3D boxes in isometric projection
- `drawRoomFurniture()`: Checks viewMode and calls appropriate drawing function
- `draw2DFurniture()`: Simple top-down furniture rendering
- `drawIsometricFurniture()`: 3D isometric furniture rendering
- `drawBookshelf()`: Detailed 2D bookshelf with varied book sizes and colors
- Agents use `drawAgent()` for 2D and `drawAgent3D()` for 3D

---

## 5. Message Queue System

### Location
`/js/thronglet.js`

### Description
Displays messages sequentially instead of skipping to the latest message. When multiple messages arrive (e.g., during auto-play), each message is displayed one at a time with proper speech synthesis if audio is enabled.

### Key Behaviors
- Messages display one at a time in order
- Speech bubble shows current message being displayed
- Audio (if enabled) plays for each message before advancing
- 1 second gap after speech ends before next message starts
- When audio is disabled, display time is calculated based on message length:
  - Minimum: 3 seconds
  - Additional: 300ms per word (based on average reading speed)
  - Maximum: 15 seconds (for very long messages)
- "AGREED!" overlay only shows after all messages have been displayed
- Polling pauses while queue is processing
- No speech bubbles shown during setup phase (no agents)

---

## 6. Replay Button

### Location
Main UI toolbar (above the negotiation map)

### Description
Replays all existing messages from the beginning without resetting or regenerating the case. Useful for re-watching a completed conversation.

### Behavior
1. Stops any current speech
2. Clears the message queue
3. Resets all display tracking
4. Re-queues all messages from the case
5. Starts sequential playback from first message

---

## 7. Agent Thoughts/Internal Reasoning

### Location
API response format in `/src/api/routes.ts`

### Description
Agents can now share their internal reasoning process through a "thoughts" field. These thoughts are displayed to observers (the UI) but not shared with other agents in the negotiation.

### Response Format
```json
{
  "taskId": "task-id",
  "agentId": "agent-id",
  "response": {
    "type": "proposal|counter|accept|reject|message",
    "thoughts": "Your internal reasoning (1-2 sentences about what you're thinking)",
    "content": "Your spoken message",
    "optionId": "option-id (if proposing)"
  }
}
```

### Prompt Instructions
The auto-play prompt now includes:
- `THINKING:` section instructing agents to share internal thoughts
- Explanation that thoughts are shown to observers but not other agents
- Example format for the "thoughts" field

### UI Display
When a message has thoughts, a distinctive cloud-shaped thought bubble appears alongside the speech bubble:
- **Shape**: Scalloped cloud shape (overlapping circles creating bumpy edges)
- **Position**: To the right side of the speaking agent (or left if near edge)
- **Style**: Light lavender fill (#f5f0ff) with purple border (#9b59b6) and subtle shadow
- **Indicator**: "💭 thinking..." label in purple
- **Text**: Italic text showing the agent's internal reasoning
- **Trailing Dots**: Three progressively smaller circles connecting the bubble to the agent (classic comic thought bubble style)

The thought bubble is visually distinct from speech bubbles:
- Speech bubbles: Rectangular with rounded corners, pointed tail
- Thought bubbles: Cloud-shaped with scalloped edges, trailing circles

The thought bubble is displayed simultaneously with the speech bubble, allowing observers to see both what the agent says and what they're thinking.

---

## 8. Scenario "Use This" Integration

### Description
When clicking "Use This" on a scenario in the Config page, the system creates a new case and navigates to the main page with that case automatically selected.

### Flow
1. User views scenario in `/scenarios.html`
2. Clicks "Use This" button
3. API creates new case from scenario
4. Browser redirects to `/?case={caseId}`
5. Main page reads URL parameter
6. Case is automatically selected in dropdown and loaded
7. URL parameter is cleared (replaced with clean `/`)

### Implementation
- `useScenario()` in scenarios.html creates case and redirects with `?case=` parameter
- Main page checks `URLSearchParams` on load
- If `case` parameter exists, selects and loads that case
- `history.replaceState()` clears the parameter after loading

---

## 9. Audio/Speech System

### Features
- Toggle audio on/off via toolbar button
- Per-agent voice settings (pitch, rate, voice type)
- Speech synthesis with browser TTS
- Bubble lingers 15 seconds after speech ends
- Speech end triggers next message after 1 second delay
- Proper handling of interrupted/canceled speech events

---

## Files Modified

| File | Changes |
|------|---------|
| `/public/js/thronglet.js` | Message queue, replay, 2D/3D view toggle, isometric backgrounds, improved agent graphics (arms, legs, hands), improved furniture (beds, bookcases, tables, chairs, trees, windows, cafe counter with stools), mobility aids, speech bubble fixes, reading-time display, thought bubble display, URL parameter case loading |
| `/public/index.html` | Consistent header, replay button, moved agent prompt card to sidebar |
| `/public/scenarios.html` | Consistent header, furniture store with clickable viewer modal, Location showroom with rotatable 3D viewer, Agent customizer, Agent personas gallery with backstories |
| `/src/api/routes.ts` | Agent appearances, agent thoughts, AI setup endpoint, document CRUD endpoints, task output endpoints, agent history endpoints, document updates in submit |
| `/src/storage/sqlite.ts` | Input documents table, working documents table, document versions table, task output table, agent history table |
| `/src/types/index.ts` | InputDocument, WorkingDocument, WorkingDocumentVersion, TaskOutput, AgentHistoryEntry, DocumentUpdate interfaces |

---

## API Endpoints

### LLM-Driven Auto-play
```bash
# Get prompt for current agent's turn
curl "http://localhost:3000/api/cases/{id}/auto-play"

# Submit response - receive next agent's prompt
curl -X POST "http://localhost:3000/api/cases/{id}/submit" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "task-xxx",
    "agentId": "case-xxx-person-0",
    "response": {
      "type": "message",
      "thoughts": "Internal reasoning...",
      "content": "Spoken message"
    }
  }'

# Simple simulation (rule-based, auto-writes to script/notes/decisions documents)
curl -X POST "http://localhost:3000/api/cases/{id}/run?maxRounds=20"
```

---

## 10. AI-Driven Setup

### Description
The AI reads the scenario and sets up all entities (agents, options, documents) in a single structured submission.

### Flow
1. `POST /api/cases` - Create case with scenario text
2. `GET /api/cases/:id/auto-play` - Returns SETUP prompt
3. `POST /api/cases/:id/setup` - AI submits structured setup + first message
4. Continue with regular submit flow

### Setup Payload
```json
{
  "setup": {
    "title": "Scenario Title",
    "location": "office",
    "taskType": "options",
    "maxRounds": 15,
    "agents": [{ "name": "...", "agenda": "...", "agreeability": 75 }],
    "options": [{ "name": "...", "description": "..." }],
    "inputDocuments": [{ "name": "...", "content": "..." }],
    "workingDocuments": [{ "name": "...", "description": "..." }]
  },
  "firstAgent": {
    "name": "Moderator",
    "message": "Opening statement..."
  }
}
```

---

## 11. Document System

### Input Documents
Read-only reference materials for agents:
- `POST /api/cases/:id/input-documents` - Add document
- `GET /api/cases/:id/input-documents` - List all
- `GET /api/cases/:id/input-documents/:name` - Get content

### Working Documents
Collaborative documents agents edit together:
- `POST /api/cases/:id/documents` - Create
- `PUT /api/cases/:id/documents/:name` - Replace
- `PATCH /api/cases/:id/documents/:name` - Partial update
- `GET /api/cases/:id/documents/:name/history` - Version history

### Document Updates in Submit
Agents can update documents when submitting:
```json
{
  "response": { ... },
  "documentUpdates": [
    { "documentName": "draft", "content": "...", "operation": "replace" },
    { "documentName": "notes", "content": "...", "operation": "append" }
  ]
}
```

### Document Viewer UI
The Working Documents panel in the UI displays document cards with the following actions:

| Button | Icon | Description |
|--------|------|-------------|
| **Copy** | Clipboard | Copies document content to clipboard |
| **Download** | Down arrow | Downloads document as a file with original filename |
| **Open** | External link | Opens document in new browser tab (useful for HTML files) |
| **Collapse/Expand** | Chevron | Toggle visibility of long documents |

Each document card shows:
- Document type badge (input, working, output)
- Document name
- Last edited by (for working documents)
- Syntax-highlighted content

---

## 12. Task Output

### Description
Final deliverable produced by agents, often using templates.

### Endpoints
- `POST /api/cases/:id/output` - Set output
- `GET /api/cases/:id/output` - Get output

### Output Structure
```json
{
  "templateName": "decision_record",
  "content": { "decision": "...", "rationale": "..." },
  "renderedOutput": "# Decision Record\n\n..."
}
```

---

## 13. Agent History

### Description
Track agent activity across multiple cases.

### Endpoints
- `GET /api/agents/:name/history` - Get history
- `POST /api/agents/:name/history` - Add entry

---

## Testing Checklist

### Main Map View Toggle
- [ ] Click "2D" button - furniture and agents show top-down
- [ ] Click "3D" button - furniture and agents show isometric with 3D room
- [ ] 3D mode shows floor with grid, back wall, left wall, window
- [ ] 3D room is fully visible and centered in the view
- [ ] Location-specific 3D decorations appear (beds, tables, detailed bookshelves)
- [ ] View mode is consistent (no mixing 2D and 3D elements)

### Agent Graphics
- [ ] Agents have articulated arms (upper arm, forearm, hands)
- [ ] Agents have articulated legs (thigh, calf, shoes)
- [ ] Walking animation shows leg movement
- [ ] Waving animation shows arm movement
- [ ] Skin tone visible on hands and forearms

### Message Display Timing (Audio Off)
- [ ] Short messages display for ~3 seconds
- [ ] Longer messages display proportionally longer (based on word count)
- [ ] Messages don't feel rushed when reading

### Header & Navigation
- [ ] Main page has Config button with gear icon
- [ ] Config button links to /scenarios.html
- [ ] Scenarios page has consistent header with logo
- [ ] Logo clicks link back to home
- [ ] Tab navigation works (Scenarios, Furniture, Locations, Agents)

### Furniture Store
- [ ] Open /scenarios.html → Furniture tab
- [ ] Verify items display with canvas previews
- [ ] Toggle 2D/3D view works
- [ ] Click furniture item opens viewer modal
- [ ] Viewer has rotate left/right buttons
- [ ] Viewer has zoom in/out buttons
- [ ] Close button works

### Location Showroom
- [ ] Locations tab shows 6 locations
- [ ] Toggle 2D/3D view works
- [ ] Furniture items from warehouse render correctly
- [ ] Click location card opens viewer modal
- [ ] Viewer has rotate left/right buttons
- [ ] Drag on canvas rotates the view smoothly
- [ ] Viewer has zoom in/out buttons
- [ ] Furniture positions update when room rotates
- [ ] Walls show/hide based on rotation angle
- [ ] Close button works

### Agent Appearances
- [ ] Agents tab shows all accessories
- [ ] Mobility aids visible (walking stick, zimmer frame)

### Message Queue
- [ ] Messages display one at a time
- [ ] No speech bubbles during setup phase
- [ ] "AGREED!" only shows after all messages displayed

### Replay Button
- [ ] Click "Replay" replays all messages from beginning
- [ ] Audio plays for each message (if enabled)

### Agent Thoughts
- [ ] When message has thoughts, cloud-shaped thought bubble appears
- [ ] Thought bubble positioned to side of agent
- [ ] "thinking..." label visible in purple
- [ ] Thought text displayed in italics
- [ ] Three trailing dots connect bubble to agent

### Agent Personas
- [ ] Agents tab shows customizer at top
- [ ] Agent Personas gallery shows below customizer
- [ ] Each persona has visual preview, name, role, backstory
- [ ] Trait tags displayed for each persona
- [ ] Agreeability score shown
- [ ] Appearance code shown for copy-paste

### Scenario "Use This" Button
- [ ] Click "Use This" on a scenario creates the case
- [ ] Redirects to main page with case selected in dropdown
- [ ] Case loads and displays immediately

### AI-Driven Setup
- [ ] `GET /auto-play` on new case returns SETUP prompt
- [ ] `POST /setup` with valid payload creates agents and options
- [ ] `POST /setup` returns next agent's prompt
- [ ] Setup validation returns helpful error messages

### Document System
- [ ] `POST /input-documents` creates read-only document
- [ ] `GET /input-documents` lists all input documents
- [ ] `POST /documents` creates working document
- [ ] `PUT /documents/:name` replaces document, increments version
- [ ] `PATCH /documents/:name` applies partial updates
- [ ] `GET /documents/:name/history` shows version history
- [ ] Submit with `documentUpdates` updates documents

### Task Output
- [ ] `POST /output` sets task output
- [ ] `GET /output` retrieves task output
- [ ] Template rendering works correctly

---

## Accessibility Features

### Visual
- Theme toggle (dark/light mode)
- High contrast text colors
- Message types use color + position indicators

### Audio
- Audio toggle to disable speech
- Reading time calculation when audio off
- No auto-play (requires user interaction)

### Keyboard
- Tab navigation for all controls
- Escape to close modals
- Enter to submit forms

---

## Error Handling

### Graceful Degradation
| Feature | Fallback |
|---------|----------|
| Speech synthesis | Visual-only mode, timed display |
| Network error | Polling continues, console warning |
| Invalid furniture | Skipped (no gray boxes) |
| Missing thoughts | No thought bubble (normal) |

### User Feedback
- Network errors logged to console
- Invalid scenario shows validation errors
- Case resolution shows overlay banner

---

## Known Limitations

1. **Browser TTS**: Speech synthesis quality varies by browser and OS
2. **Furniture Items**: Not all items have custom 2D rendering - fallback to generic box
3. **Queue Polling**: Polling pauses during playback - new server messages wait
4. **Simple Simulation**: The `/run` endpoint uses rule-based responses (auto-writes to documents: script, notes, decisions)
5. **Desktop Only**: UI optimized for 1024px+ viewport, limited mobile support
6. **Canvas Not Accessible**: Visual display only, not keyboard-navigable
7. **Documents API-Only**: Document features accessible via API only, no UI yet
8. **Task Output API-Only**: Output/template system accessible via API only
