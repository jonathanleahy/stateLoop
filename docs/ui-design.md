# StateLoop UI Design - Thronglet 2D Map

## Overview

The Thronglet UI is a 2D visualization of agent interactions, styled like a retro pixel-art game. It provides real-time feedback on the negotiation process with dynamic agents that have varied appearances.

## Layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│  StateLoop             [Case Selector ▼]  [New Case]  [Reset]  [🌙/☀️]    │
├────────────────────────────────────────┬───────────────────────────────────┤
│                                        │ Case Info              [Active]   │
│                                        │ ─────────────────────────────     │
│         2D MAP CANVAS                  │ Status: Active                    │
│                                        │ Turn: Alice                       │
│    [Dynamic agents with varied         │ Messages: 3                       │
│     appearances, trees, path,          │                                   │
│     options (only when case            │ Participants:                     │
│     loaded), speech bubbles]           │ ┌─────────────────────────────┐   │
│                                        │ │ 🔴 Alice                    │   │
│                                        │ │ [Italian] [Budget: $30]     │   │
│                                        │ └─────────────────────────────┘   │
│                                        │ ┌─────────────────────────────┐   │
│                                        │ │ 🔵 Bob                      │   │
│                                        │ │ [Vegetarian] [Mexican]      │   │
│                                        │ └─────────────────────────────┘   │
├────────────────────────────────────────┼───────────────────────────────────┤
│      Conversation Thread               │      Boss Messages                │
│  ───────────────────────────────────   │  ─────────────────────────────    │
│  🔴 Alice: How about Olive Garden?     │  [Message input]  [Send]          │
│  🔵 Bob: I'd prefer Taco Town...       │                                   │
│  🔴 Alice: That works for me!          │  > Remember the deadline!         │
│                                        │  > Try to compromise              │
├────────────────────────────────────────┴───────────────────────────────────┤
│  Agent Prompt                                                              │
│  ─────────────────────────────────────────────────────────────────────     │
│  Current Turn: Alice          curl "http://localhost:3000/api/cases/..."   │
│                                                                [Copy]      │
├────────────────────────────────────────────────────────────────────────────┤
│  Request Log                                                    [Expand]   │
│  10:35:00  GET  /api/cases/abc/auto-play  200  1234ms                     │
│  10:35:12  GET  /api/cases/abc            200  12ms                        │
└────────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Header Bar
- Title: "StateLoop" with tagline "Stateless Agent Orchestration"
- Case selector dropdown
- "New Case" button - opens modal with text area
- "Reset" button - clears database
- "Replay" button - replays all messages from beginning
- Audio toggle button (on by default)
- View Mode toggle (2D/3D)
- Config button (gear icon) - links to /scenarios.html
- Theme toggle (dark/light mode)

### Replay Button
Replays all existing messages from the beginning without resetting or regenerating:
1. Stops current speech
2. Clears message queue
3. Resets display tracking
4. Re-queues all messages
5. Starts playback from first message

### Audio Features
Text-to-speech is enabled by default:
- **Toggle**: Audio button in header toggles speech on/off
- **Default**: Audio is ON when page loads
- **Voice variety**: Each agent has unique pitch (0.7-1.4), rate (0.85-1.15), and voice type (male/female)
- **Speech sync**: Message display waits for speech to complete
- **Polling pause**: Case polling pauses during speech playback
- **Message queue**: Messages are queued and spoken one at a time in sequence
- **Voice persistence**: Voice settings are determined during setup phase and stored with agent appearance

### 2. 2D Map Canvas (Main Area)

#### Location Title Display
When a location is set, a title bar appears at the top of the canvas:
- Location name in large text (e.g., "Hospital Ward")
- Optional subtitle for additional context
- Semi-transparent background for readability

#### Environment
The background changes based on the scenario location:

| Location | Background | Key Visual Elements |
|----------|------------|---------------------|
| park (default) | Grass texture (#4a7c59) | Trees, tan dirt path (#c9b896) |
| hospital | Light blue/white sterile environment | Hospital beds, nurse station, medical equipment, IV stands |
| library | Warm wood tones | Tall bookshelves, reading tables, study lamps, quiet atmosphere |
| office | Neutral corporate colors | Conference table, office chairs, whiteboard, potted plants |
| school | Classroom environment | Blackboard/chalkboard, student desks, teacher's desk, educational posters |
| cafe | Warm amber lighting | Coffee counter, small tables, pendant lights, menu boards |

**Default Environment (park):**
- **Background**: Grass texture (#4a7c59)
- **Trees**: Scattered decorative trees (collision obstacles)
- **Path**: Tan dirt path connecting areas (#c9b896)

#### Agents (Thronglets)
- Pixelated humanoid characters with **varied appearances**
- Each agent has:
  - Distinct body color
  - Different shirt patterns/accessories
  - Unique idle animations
- Name label below character
- Dynamically positioned based on participant count
- First agent (if adjudicator) sits higher on map

#### Agent Variety
Agents are visually distinguished by:
- Body color (red, blue, purple, green, orange, teal)
- Accessory (hat, glasses, bowtie, headphones, scarf)
- Body style (normal, tall, short, wide, athletic)
- Body shape (box, cylinder, oval) - in 3D mode
- Age group (child, teen, adult, middle, elderly)
- Skin tone (6 presets from light to dark)
- Hair color (black, brown, auburn, blonde, gray, white, red)
- Mobility aids (wheelchair, walking_stick, zimmer_frame)
- Animation personality (bouncier, calmer, etc.)
- Professional role uniforms (see below)

#### Body Shapes (3D Mode)
In 3D rendering mode, agents can have different body shapes:
- **Box**: Default isometric cube-like shape with flat faces
- **Cylinder**: Rounded cylindrical body with curved sides for softer appearance
- **Oval**: Egg-shaped elliptical body for stocky characters

#### Age Groups
Agents can be configured with different age groups affecting their appearance:

| Age Group | Scale | Visual Changes |
|-----------|-------|----------------|
| child | 70% | Smaller proportions, rounder features |
| teen | 85% | Slightly smaller than adult |
| adult | 100% | Standard proportions |
| middle | 100% | Subtle aging details |
| elderly | 95% | Gray hair option, slight stoop |

#### Skin Tone Presets
Six preset skin tones for diverse representation:
1. Light/Fair (#ffe0bd)
2. Light-Medium (#f5d0b0)
3. Medium (#d4a574)
4. Medium-Dark (#c68642)
5. Dark (#8d5524)
6. Deep (#5c3317)

#### Hair Colors
Available hair colors:
- black, brown, auburn, blonde, gray, white, red

#### Mobility Options
Agents can use mobility aids:
- **standing**: Default upright position
- **wheelchair**: Seated in wheelchair (with wheels rendered)
- **walking_stick**: Using a walking cane
- **zimmer_frame**: Using a walking frame/zimmer

#### Professional Role Appearances
Agents can wear professional uniforms appropriate to their role:

| Role | Visual Description |
|------|-------------------|
| nurse_scrubs | Blue or green medical scrubs, practical footwear |
| doctor_coat | White lab coat over clothes, stethoscope accessory |
| police_uniform | Dark blue uniform with badge, utility belt |
| teacher | Cardigan or blazer, smart casual professional look |
| business_suit | Formal suit and tie, polished appearance |
| healthcare_assistant | Light blue uniform, name badge |

Professional roles are auto-detected from scenario context or explicitly set via the appearance API.

#### Agent States
| State | Visual | Description |
|-------|--------|-------------|
| Idle | Various behaviors | Waiting - can wander, check phone, wave, sit, etc. |
| Thinking | Orange dot indicator | Currently processing/their turn |
| Speaking | Speech bubble visible | Just sent a message |
| Agreed | Checkmark emote | Accepted a proposal |
| Rejected | X emote | Rejected a proposal |

#### Idle Behaviors
Agents perform random idle actions when not their turn:
- Standing
- Looking around
- Wandering (with collision avoidance)
- Checking phone (📱 emote)
- Stretching (💪 emote)
- Waving (👋 emote)
- Looking at option (🤔 emote)
- Yawning (😴 emote)
- Tapping foot
- Scratching head
- Crossing arms
- Looking at watch
- Humming (🎵 emote)
- Pacing
- Jumping
- Sitting on log
- Daydreaming (💭 emote)
- Chitchat (💬 bubble)

#### Collision Avoidance
Agents avoid walking into:
- Trees (50px radius)
- Options (60px radius)
- Canvas boundaries
- Path boundaries (stay between y=180 and y=500)
- Speech bubbles (move away when another agent speaks)

#### Speaker Positioning System
When an agent speaks, the system automatically repositions agents for optimal visibility:

**Speaker Movement:**
- Speaking agent moves to a clear center-left position (35% across canvas, y=380)
- Original position is stored so they can return after speaking
- Movement is animated smoothly via the `speaking_move` idle action (speed: 2.5x)
- Speaker's original position is restored when their message completes

**Other Agents Clear the Way:**
- Non-speaking agents automatically move away from the speech bubble area
- Agents on the left of the speaker move further left
- Agents on the right of the speaker move further right
- All non-speakers move down slightly for clear visual separation
- Movement uses the `avoiding` idle action with faster speed (2.0x) for 5 seconds

**Positioning Diagram:**
```
┌─────────────────────────────────────────────────┐
│                                                 │
│         ┌─────────────────────┐                 │
│         │   Speech Bubble     │                 │
│         │      (320px)        │                 │
│         └──────────┬──────────┘                 │
│                    │                            │
│                ╔═══╧═══╗                        │
│                ║Speaker║  ← At 35% across,      │
│                ╚═══════╝      y=380             │
│   ○ ←──────                ──────→ ○            │
│ Agent A                          Agent B        │
│ (clears left)                 (clears right)   │
└─────────────────────────────────────────────────┘
```

**Benefits:**
- Speaker is always clearly visible without overlap
- Speech bubble doesn't obscure other agents
- Conversation flow is visually clear
- Agents return to natural positions between messages

#### View Mode Toggle (2D/3D)
The canvas supports two rendering modes:
- **2D Mode**: Classic pixelated top-down view
- **3D Mode**: Isometric pseudo-3D rendering with depth

**Toggle Features:**
- Toggle button in the map header switches between modes
- Both modes support all agent accessories and professional roles
- Body shapes (box, cylinder, oval) only affect 3D rendering
- Location furniture renders with 3D depth and transparent backgrounds
- Smooth transition when switching modes

**3D Furniture Rendering:**
Location furniture now has proper type-specific rendering in 3D mode:
- **Full 3D items**: hospital_bed, bookshelf, conference_table, reading_table, cafe_table, office_chair, armchair, bar_stool, tree, window
- **Box-style items**: cafe_counter, coffee_machine, pastry_case (rendered as styled boxes)
- **Wall-mounted items**: menu_board, hanging_light, quiet_sign, clock, notice_board (skipped in furniture placement, drawn as part of location)
- Unknown furniture types are no longer rendered as gray boxes

#### Speech Bubbles
- Appear above speaking agent
- Show **full message text** (wrapped)
- White background with colored accent bar (type indicator)
- Type colors:
  - Proposal: Green (#27ae60)
  - Counter: Orange (#f39c12)
  - Accept: Green (#27ae60)
  - Reject: Red (#e74c3c)
  - Message: Blue (#3498db)
- Only shown for active cases

#### Thought Bubbles
When agents include internal reasoning, a distinctive thought bubble appears alongside the speech bubble:
- **Shape**: Scalloped cloud with bumpy edges (overlapping circles creating classic comic cloud)
- **Color**: Light lavender fill (#f5f0ff) with purple border (#9b59b6) and subtle shadow
- **Label**: "💭 thinking..." text in purple with emoji
- **Position**: To the side of the agent (switches sides based on screen position)
- **Trailing Dots**: Three progressively smaller circles connecting to agent (classic comic style)
- **Content**: Italic text (13px) showing agent's internal reasoning
- **Visibility**: Shown to observers during playback, not shared with other agents

**Visual distinction**: Thought bubbles are clearly different from speech bubbles - cloud shape vs rectangular, trailing circles vs pointed tail.

#### Chitchat Bubbles
- Smaller bubbles for idle conversation
- Appear to the side of agent
- Random casual messages
- White background with shadow

#### Options
- **Only drawn when a case is loaded**
- Building icons with peaked roofs (or appropriate visual for option type)
- Name label below
- Visual states:
  - Normal: Brown (#795548)
  - Proposed: Blue (#3498db)
  - Selected: Orange (#f39c12) with checkmark

#### Resolved Overlay
When case is resolved:
- Subtle radial darkening at edges
- White banner in center: "AGREED!"
- Shows selected option name
- Speech bubble hidden

### 3. Case Info Panel (Right Side)

Displays:
- Status indicator (green=active, purple=resolved)
- Current turn participant name
- Message count
- Participant cards with:
  - Color indicator
  - Name
  - Preference tags (green)
  - Constraint tags (orange)
  - Payer indicator (yellow badge)

### 4. Conversation Thread Panel (Below Map)

- Scrollable message history
- Messages styled like chat:
  - Avatar with first letter
  - Name and timestamp
  - Message content in colored bubble
  - Left-aligned for first participants
  - Right-aligned for others
- Auto-scrolls to bottom on new message

### 5. Boss Messages Panel (Right Side)

- Text input for sending messages
- "Send" button
- List of previous messages with timestamps
- Messages sent to all agents

### 6. Agent Prompt Card

- Shows current turn agent name
- Displays curl command for auto-play endpoint
- Copy button for curl command
- Hidden when case resolved

### 7. Request Log Panel (Bottom)

- Collapsible (toggle button)
- Scrollable log of API requests
- Columns: Time, Method, Path, Status, Duration
- Color coding:
  - GET: Green
  - POST: Yellow
  - 2xx: Green
  - 4xx: Yellow
  - 5xx: Red

## New Case Modal

Single text area for case description:
```
AGENT: Alice
SECRET AGENDA: You strongly prefer Italian food...

AGENT: Bob
SECRET AGENDA: You're vegetarian...

OPTIONS:
- Olive Garden: Italian
- Taco Town: Mexican
```

The UI parses this text to:
1. Extract agents from `AGENT:` lines
2. Extract options from `OPTIONS:` section
3. Create the case with full scenario text

## Visual Style

### Color Palette

**Park Environment (Default):**
```
Background Grass:  #4a7c59
Dark Grass:        #3d6b4a
Trees:             #2e7d32, #388e3c
Tree Trunk:        #5d4037
Path:              #c9b896
```

**Location-Specific Palettes:**
```
Hospital:          #e8f4f8 (walls), #ffffff (floors), #4a90a4 (accents)
Library:           #8b7355 (wood), #f5f0e6 (paper), #2d4a3e (leather)
Office:            #f0f0f0 (walls), #4a5568 (furniture), #3182ce (accents)
School:            #2d5016 (chalkboard), #d4a574 (desks), #f5f5dc (walls)
Cafe:              #3d2314 (wood), #f5deb3 (walls), #ff9500 (warm lighting)
```

**Agent and UI Colors:**
```
Agent Colors:      #e74c3c, #3498db, #9b59b6, #27ae60, #f39c12, #1abc9c
UI Dark:           #1e293b (slate-800)
UI Panel:          #334155 (slate-700)
Text Light:        #e2e8f0 (slate-200)
Text Muted:        #94a3b8 (slate-400)
Success:           #27ae60
Warning:           #f39c12
Error:             #e74c3c
```

**Professional Uniform Colors:**
```
Nurse Scrubs:      #4a90a4 (blue), #2e7d32 (green)
Doctor Coat:       #ffffff (coat), #c0c0c0 (stethoscope)
Police Uniform:    #1a365d (dark blue), #ffd700 (badge)
Teacher:           #8b4513 (cardigan), #2f4f4f (blazer)
Business Suit:     #2c3e50 (navy), #1a1a1a (black)
Healthcare Asst:   #87ceeb (light blue)
```

### Typography
- UI: System sans-serif
- Logs: Monospace (font-mono)
- Agent names: Bold, scaled with thronglet size

### Thronglet Scale
Default scale: 1.6x (160% of base size)
- Allows for visible detail
- Clear name labels
- Visible emotes

## Auto-Refresh Behavior

- Poll case data every 2 seconds (when active)
- Poll logs every 5 seconds
- Idle behavior updates every 100ms
- Render loop: requestAnimationFrame (60fps)

## Theme Support

### Dark Mode (Default)
- Dark slate backgrounds
- Light text
- Grass canvas colors unchanged

### Light Mode
- White/gray backgrounds
- Dark text
- Same canvas colors

Theme persists in localStorage.

## Responsive Considerations

Current implementation optimized for desktop (1024px+).
Canvas minimum: 700x550px recommended.

## State Management

### Global State
- `currentCase`: Full case data from API
- `agents`: Visual state for each agent (position, animation, etc.)
- `pollInterval`: Active polling timer
- `logPollInterval`: Log polling timer

### Agent State (per agent)
```javascript
{
  x, y,           // Current position
  homeX, homeY,   // Default position
  color,          // Body color
  state,          // 'idle' | 'thinking'
  name,           // Display name
  message,        // Current speech
  messageType,    // proposal, counter, etc.
  idleAction,     // Current idle behavior
  idleTimer,      // Time until next action
  targetX, targetY, // Movement target
  lookDirection,  // Eye direction
  emote,          // Current emote emoji
  emoteTimer,     // Time until emote fades
  accessories,    // Visual distinguishing features
}
```

## Agent Customizer (scenarios.html)

The Scenarios page includes a comprehensive agent customizer for designing agent appearances with live preview.

### Customization Controls

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

### Live Preview Features
- Real-time 2D/3D preview canvas showing configured agent
- JSON code output panel for copying configuration to scenarios
- Instant updates when any setting is changed
- Toggle between 2D and 3D preview modes

### Using the Customizer
1. Select options using the control panel
2. Preview updates in real-time on the canvas
3. Copy the generated JSON from the output panel
4. Paste into scenario AGENT definition

## Agent Personas Gallery (scenarios.html)

Below the Agent Customizer, the Agents tab includes a gallery of pre-built character personas ready for use in scenarios.

### Persona Card Contents
Each persona card displays:
- **Visual Preview**: Canvas rendering of the character appearance
- **Name & Role**: Character name and their position/job title
- **Backstory**: Detailed background explaining personality, motivations, and constraints
- **Traits**: Personality trait tags (e.g., "Diplomatic", "Skeptical", "Practical")
- **Agreeability Score**: 0-100 scale indicating willingness to compromise
- **Appearance Code**: Copy-paste ready JSON for scenario configuration

### Persona Categories

| Category | Personas |
|----------|----------|
| Hospital Staff | Dr. Sam Chen (ACP), Bev Thompson (Senior Nurse), Jordan Williams (Junior Nurse), Priya Sharma (HCA) |
| Patients | Derek Morrison, Margaret Ellis, Anil Kapoor, Doris May, Keith Barnes |
| Moderators | The Moderator (Discussion Facilitator) |
| Education | Sarah Mitchell (Teacher) |
| Emergency Services | PC James Carter (Police) |
| Corporate | David Armstrong (Executive) |

### Using Personas
1. Browse the gallery to find a suitable character
2. Read their backstory to understand their motivations
3. Copy the appearance JSON code
4. Paste into your scenario's AGENT definition
5. Customize the agenda to fit your scenario

### Persona Data Structure
```javascript
{
  id: 'persona_id',
  name: 'Character Name',
  role: 'Job Title / Role',
  category: 'hospital_staff', // or 'patient', 'moderator', etc.
  backstory: 'Detailed character background...',
  traits: ['Trait1', 'Trait2', 'Trait3'],
  agreeability: 75, // 0-100 scale
  appearance: {
    age: 'adult',
    gender: 'female',
    skinTone: 3,
    shirtColor: '#4a90a4',
    accessory: 'nurse_scrubs',
    bodyStyle: 'normal'
  }
}
```

## Location Viewer (scenarios.html)

The Scenarios page includes an interactive 3D location viewer for previewing scenario environments with mouse-based rotation.

### Rotation Controls

| Control | Action | Description |
|---------|--------|-------------|
| Mouse drag left/right | Rotate room | Click and drag horizontally to rotate the room view |
| Rotation resets | On location change | Rotation returns to default when selecting a new location |

### Isometric 3D Projection

The location viewer uses true isometric 3D projection:
- **Proper 3D rotation**: The room rotates in 3D space, not just 2D canvas rotation
- **Perspective preservation**: Isometric angles are maintained during rotation
- **Smooth animation**: Rotation follows mouse movement smoothly

### 4-Wall Visibility Culling

The room is rendered with 4 walls that are selectively shown/hidden based on rotation angle:

| Wall Position | Default Visibility | Culling Behavior |
|---------------|-------------------|------------------|
| Front wall | Hidden (culled) | Always hidden to show room interior |
| Back wall | Visible | Hidden when rotated to face viewer |
| Left wall | Visible | Hidden when rotation angle makes it face viewer |
| Right wall | Visible | Hidden when rotation angle makes it face viewer |

**Culling Algorithm:**
- Front-facing walls (based on rotation angle) are culled to reveal interior
- Back-facing walls remain visible as room backdrop
- This creates a "cutaway" view that always shows the room contents

### Zoom Controls

| Control | Description |
|---------|-------------|
| Zoom In (+) | Increases view scale for detail inspection |
| Zoom Out (-) | Decreases view scale to see more of the environment |
| Reset | Returns to default zoom level |

## Scenario "Use This" Integration

When clicking "Use This" on a scenario in the Config page:

### Flow
1. User views scenario in `/scenarios.html`
2. Clicks "Use This" button on scenario card
3. API creates new case from scenario
4. Browser redirects to `/?case={caseId}`
5. Main page reads URL parameter and selects case
6. Case loads and displays immediately
7. URL parameter cleared (clean `/`)

### Implementation
- `useScenario()` function handles case creation
- Uses `history.replaceState()` to clean URL after loading
- Dropdown automatically selects the new case

## Furniture Viewer Modal (scenarios.html)

Click any furniture item to open the detailed viewer:

### Features
- **Large 3D Preview**: Expanded view of the furniture item
- **Rotation**: Rotate 45° left or right using buttons
- **Zoom**: Zoom in/out for detail inspection
- **Grid Background**: Reference grid for size estimation
- **Item Info**: Name, description, and dimensions

### Shared Rendering
Uses the same `toIso()` transformation as the location viewer:
- Rotation affects world coordinates, not canvas
- Items rendered using `drawIsoBox()` helper
- Consistent isometric projection across all viewers

## Accessibility

### Visual Accessibility
- **Theme toggle**: Light/dark mode for visual preference
- **Color contrast**: All text meets WCAG AA contrast ratios
- **Text alternatives**: Agent names and labels clearly visible
- **Color-blind support**: Message types use both color and position indicators

### Keyboard Navigation
- **Tab navigation**: All interactive elements are focusable
- **Form controls**: Dropdowns, buttons, and inputs keyboard-accessible
- **Modal dialogs**: Escape key closes modals, focus trapped within
- **Canvas**: Not keyboard-navigable (visual display only)

### Audio Accessibility
- **Audio toggle**: Speech can be disabled for users who prefer visual-only
- **Reading time**: When audio off, messages display long enough to read
- **No auto-play audio**: Audio only starts after user interaction (browser policy)

### Screen Reader Considerations
- Canvas animations are decorative; essential info shown in text panels
- Conversation thread provides full text history
- Status indicators use text labels alongside visual cues

---

## Error Handling

### Common Error Scenarios

| Error | Cause | User Feedback |
|-------|-------|---------------|
| Case not found | Invalid case ID or deleted | Alert shown, dropdown refreshed |
| Network error | Server unreachable | Console warning, polling continues |
| Speech synthesis unavailable | Browser doesn't support TTS | Audio button hidden |
| Case resolved during playback | Another client resolved | "AGREED!" overlay shown |

### Graceful Degradation
- **No audio support**: System works fully without speech synthesis
- **Network interruption**: Polling resumes when connection restored
- **Invalid scenario**: Validation errors shown before case creation
- **Missing furniture data**: Items render as simple shapes

### Error Recovery
- **Replay button**: Re-watch messages if playback interrupted
- **Case selector**: Switch cases if current case has issues
- **Reset button**: Clear all data and start fresh (with confirmation)

---

## Responsive Considerations

### Desktop Optimized
Current implementation optimized for desktop displays:
- **Minimum viewport**: 1024px width recommended
- **Canvas size**: 700x550px minimum for proper rendering
- **Side panels**: Fixed width, may overlap on small screens

### Tablet Support (Limited)
- Landscape orientation required for full layout
- Touch events supported for canvas interaction
- Some controls may require scrolling

### Mobile Limitations
- Layout not optimized for portrait orientation
- Canvas may be too small for detailed agent rendering
- Side panels stack vertically (may require scrolling)
- Touch targets may be too small for precise interaction

### Future Responsive Plans
- Collapsible side panels for smaller screens
- Responsive canvas scaling
- Touch-friendly control sizes
- Portrait mode layout option
