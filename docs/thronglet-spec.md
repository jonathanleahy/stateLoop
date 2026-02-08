# Thronglet Specification

## Overview

Thronglets are the visual representation of agents in the StateLoop system. They are pixelated, game-style characters that appear on a 2D map canvas and interact through the negotiation process.

## Visual Design

### Rendering Modes

The system supports two rendering modes:

| Mode | Description | Use Case |
|------|-------------|----------|
| 2D | Classic pixelated top-down view | Default, familiar game-style |
| 3D | Isometric pseudo-3D with depth | Enhanced visual appeal |

Toggle between modes using the View Mode button in the map header.

### Character Appearance
- **Style**: Pixelated, low-res game characters
- **Scale**: 1.6x base size (configurable via `THRONGLET_SCALE`)
- **Components**:
  - Head: Circular, skin-toned (#ffcc80)
  - Body: Colored rectangle (Person A: red #e74c3c, Person B: blue #3498db)
  - Arms: Animated based on action
  - Legs: Animated when walking
  - Eyes: Follow look direction
  - Shadow: Ellipse below character

### 3D Mode Specifics
In 3D mode, Thronglets are rendered with isometric depth:
- **Body**: Multiple shape types available (see below)
- **Head**: Ellipse with shading for 3D effect
- **Professional roles**: Rendered with appropriate uniforms (lab coats, scrubs, etc.)
- **Accessories**: Glasses, hats, etc. rendered in 3D perspective

### Body Shape Types (3D Mode)
Agents can have different body shapes beyond the default box:

| Shape Type | Description | Best For |
|------------|-------------|----------|
| `box` | Default isometric box with flat faces | Most characters |
| `cylinder` | Rounded cylindrical body with curved sides | Softer, friendlier look |
| `oval` | Egg-shaped elliptical body | Wide/stocky characters |

### Body Style Dimensions
Body styles affect the proportions:

| Style | Width | Height | Depth | Visual |
|-------|-------|--------|-------|--------|
| `normal` | 25 | 35 | 15 | Standard build |
| `tall` | 22 | 45 | 12 | Tall, thin |
| `short` | 28 | 28 | 16 | Short, compact |
| `wide` | 35 | 32 | 20 | Broad, stocky |
| `athletic` | 26 | 40 | 14 | Tall, fit |

Example configurations:
- Elderly patient: `bodyStyle: 'short', shapeType: 'oval'`
- Tall doctor: `bodyStyle: 'tall', shapeType: 'box'`
- Friendly nurse: `bodyStyle: 'normal', shapeType: 'cylinder'`

### Age Groups
Age affects overall scale and appearance details:

| Age Group | Scale | Visual Changes |
|-----------|-------|----------------|
| `child` | 70% | Smaller proportions, rounder features |
| `teen` | 85% | Slightly smaller than adult |
| `adult` | 100% | Standard proportions |
| `middle` | 100% | Subtle aging details |
| `elderly` | 95% | Gray hair option, slight stoop |

### Skin Tone Presets
Six preset skin tones for diverse representation:

| Preset | Hex Value | Description |
|--------|-----------|-------------|
| 1 | #ffe0bd | Light/Fair |
| 2 | #f5d0b0 | Light-Medium |
| 3 | #d4a574 | Medium |
| 4 | #c68642 | Medium-Dark |
| 5 | #8d5524 | Dark |
| 6 | #5c3317 | Deep |

### Hair Colors
Available hair color options:

| Color | Hex Value |
|-------|-----------|
| black | #1a1a1a |
| brown | #654321 |
| auburn | #922724 |
| blonde | #f0e68c |
| gray | #808080 |
| white | #f5f5f5 |
| red | #b22222 |

### Accessories
Visual accessories that can be added to agents:

| Accessory | Description |
|-----------|-------------|
| none | No accessory |
| hat | Cap or hat on head |
| glasses | Eyeglasses on face |
| bowtie | Formal bowtie at neck |
| headphones | Over-ear headphones |
| scarf | Neck scarf |

### Professional Roles
Agents can wear professional uniforms:

| Role | Visual Description |
|------|-------------------|
| nurse_scrubs | Blue or green medical scrubs |
| doctor_coat | White lab coat with stethoscope |
| police_uniform | Dark blue uniform with badge |
| teacher | Cardigan or blazer, smart casual |
| business_suit | Formal suit and tie |
| healthcare_assistant | Light blue uniform with name badge |

### Mobility Options
Agents can use different mobility aids:

| Mobility | Description | Rendering Notes |
|----------|-------------|-----------------|
| standing | Default upright position | Normal leg rendering |
| wheelchair | Seated in wheelchair | Wheels rendered below, legs hidden |
| walking_stick | Using a walking cane | Cane held in hand, adjusted stance |
| zimmer_frame | Using a walking frame | Frame rendered in front, slower movement |

### Colors
- Person A: Red (#e74c3c)
- Person B: Blue (#3498db)
- Skin: #ffcc80
- Legs/Details: #333

## States

### Primary States
| State | Description | Visual Indicator |
|-------|-------------|------------------|
| `idle` | Waiting, not their turn | Performs idle animations |
| `thinking` | It's their turn to respond | Animated dots (💭) above head |

### Idle Actions
When in `idle` state, Thronglets cycle through these behaviors:

| Action | Duration | Animation | Emote |
|--------|----------|-----------|-------|
| `standing` | 2-5s | Slight bob | - |
| `looking` | 1-3s | Head rotation | - |
| `wandering` | 3-5s | Walk to random nearby point | - |
| `checking_phone` | 2-5s | Head tilt down | 📱 |
| `stretching` | 1.5-2.5s | Arms up | 💪 |
| `waving` | 1-1.5s | Arm wave | 👋 |
| `looking_at_option` | 2-4s | Look toward option | 🤔 |
| `yawning` | 1.5-2.5s | Mouth open, head back | 😴 |
| `tapping_foot` | 2-4s | Leg animation | - |
| `scratching_head` | 1.5-2.5s | Arm to head | 🤨 |
| `crossing_arms` | 3-5s | Arms crossed | - |
| `looking_at_watch` | 1-1.5s | Look at wrist | ⌚ |
| `humming` | 2-4s | Gentle sway | 🎵 |
| `pacing` | 2-3.5s | Walk back and forth | - |
| `jumping` | 0.8s | Jump animation | ⬆️ |
| `sitting` | 5-10s | Sit on a log | - |
| `daydreaming` | 3-6s | Space out | 💭 |
| `chitchat` | 3-6s | Talk about news/weather | 💬 |

### Chitchat System (NEW)
When idle, Thronglets can engage in chitchat about:
- Current weather
- Latest news headlines
- Random observations
- Small talk topics

Chitchat bubbles appear as smaller, grayed speech bubbles that fade quickly.

## Speech Bubbles

### Negotiation Messages
- **Width**: 250px
- **Max Height**: 120px
- **Text Length**: Up to 150 characters (truncated with ...)
- **Line Wrap**: 35 characters per line
- **Fade**: Starts fading after message, minimum 40% opacity
- **Color Indicator**: Left border colored by message type:
  - Proposal: Green (#27ae60)
  - Counter: Orange (#f39c12)
  - Accept: Green (#27ae60)
  - Reject: Red (#e74c3c)
  - Message: Blue (#3498db)

### Chitchat Bubbles
- **Width**: 150px
- **Opacity**: 60%
- **Duration**: 3-5 seconds
- **Position**: Offset to side, smaller than main bubbles
- **Style**: Lighter, more casual appearance

## Emotes

Emotes appear as floating emoji above the Thronglet's head:
- Duration: 1-3 seconds depending on action
- Position: Offset to upper-right of head
- Size: Scaled with Thronglet

## Positioning

### Default Positions (600px canvas height)
- Person A: x=180, y=320 (left side of path)
- Person B: x=520, y=320 (right side of path)
- Agents face each other (Person A looks right, Person B looks left)

### Wandering Bounds
- X: ±60px from home position
- Y: 270-370px (stay on path area)

### Speaker Positioning System
When an agent speaks, automatic repositioning occurs for optimal visibility:

**Speaker Movement:**
- Speaking agent moves to clear center-left position (35% across canvas, y=380)
- Original position is stored for return after speaking
- Movement animated via `speaking_move` action (speed: 2.5x)

**Non-Speaker Clearing:**
- Other agents automatically move away from speech bubble zone
- Agents on left of speaker move further left
- Agents on right of speaker move further right
- All non-speakers move down for clear separation
- Uses `avoiding` action (speed: 2.0x) for 5 seconds

**Return Behavior:**
- When speech completes, speaker returns to original position
- Smooth animated transition back to home location

```
Speech Positioning Diagram:
┌─────────────────────────────────────────────┐
│         ┌─────────────────┐                 │
│         │  Speech Bubble  │                 │
│         └────────┬────────┘                 │
│              ╔═══╧═══╗                      │
│              ║Speaker║  ← Center-left       │
│              ╚═══════╝                      │
│   ○ ←──────              ──────→ ○          │
│ (clears left)         (clears right)       │
└─────────────────────────────────────────────┘
```

## Animation

### Bob Animation
- Frequency: 300ms cycle
- Amplitude: 2px × scale

### Walk Animation
- Leg alternation: 100ms cycle
- Speed: 0.5 (normal), 0.8 (pacing)

### Jump Animation
- Frequency: 100ms cycle
- Height: 15px × scale

## Integration Points

### Data Flow
1. `updateAgentStates()` - Called when case data updates
2. `updateIdleBehaviors()` - Called every 100ms
3. `render()` - Called every animation frame

### Events That Trigger Updates
- Case loaded/refreshed
- Message submitted
- Turn changed
- Case resolved

## Text-to-Speech and Audio System

Thronglets can speak their messages using browser speech synthesis.

### Audio Settings
- **Default**: Audio is ON when page loads
- **Toggle**: Header button to enable/disable speech
- **Voice Assignment**: Each agent gets unique voice settings during setup phase
- **Persistence**: Voice settings stored with agent appearance data

### Voice Properties
| Property | Range | Description |
|----------|-------|-------------|
| pitch | 0.7 - 1.4 | Voice pitch (higher = higher voice) |
| rate | 0.85 - 1.15 | Speech rate (higher = faster) |
| voiceType | male/female | Browser voice selection |

### Speech Behavior
- Message display syncs with speech completion
- Polling pauses during speech to avoid interruptions
- Speech bubble remains visible for 15 seconds after audio ends
- Auto-advance to next message when speech completes
- 500ms pause between messages for natural pacing

## Message Queue System

Messages are displayed one at a time using a queue with speech synchronization:

### Queue Processing
1. **Queueing**: New messages added to queue as they arrive from API
2. **Display**: One message shown at a time on speaking agent
3. **Speech**: If audio enabled, message is spoken aloud using agent's unique voice
4. **Sync**: Display waits for speech to complete before advancing
5. **Completion**: Message marked complete, next message processed
6. **Pause**: 1 second pause between messages for natural pacing

### Speech Synchronization
- Message bubble remains visible while speech plays
- Polling for new case updates is paused during speech
- Speech bubble stays visible for minimum 15 seconds after audio ends
- Next message only begins after current speech completes
- Audio toggle immediately stops current speech when disabled

### Reading Time (Audio Disabled)
When audio is disabled, message display time is calculated based on content:
- **Minimum**: 3 seconds for short messages
- **Per-word**: 300ms additional per word (average reading speed)
- **Maximum**: 15 seconds for very long messages

### Replay Functionality
The replay button allows re-watching completed conversations:
1. Stops any current speech
2. Clears the message queue
3. Resets all display tracking
4. Re-queues all messages from the case
5. Starts sequential playback from first message

## Thought Bubbles

Agents can display internal reasoning through thought bubbles:

### Appearance
- **Shape**: Scalloped cloud shape with bumpy edges (overlapping circles)
- **Color**: Light lavender fill (#f5f0ff) with purple border (#9b59b6)
- **Shadow**: Subtle purple-tinted shadow for depth
- **Label**: "💭 thinking..." text in purple
- **Text**: Italic font (13px) showing internal reasoning
- **Trailing Dots**: Three progressively smaller circles (14px, 10px, 6px) connecting bubble to agent

### Visual Distinction from Speech Bubbles
| Feature | Speech Bubble | Thought Bubble |
|---------|---------------|----------------|
| Shape | Rectangular with rounded corners | Scalloped cloud edges |
| Tail | Pointed triangle | Trailing circles |
| Border | Colored by message type | Purple (#9b59b6) |
| Background | White | Light lavender |
| Text style | Normal | Italic |

### Positioning
- **Default**: To the right side of the speaking agent
- **Edge handling**: Moves to left side if agent is near right edge
- **Offset**: Positioned above and to the side of the agent

### Display Behavior
- Shown simultaneously with speech bubble during playback
- Only appears when message includes a `thoughts` field
- Observers see both what agent says and what they're thinking
- Thoughts are NOT shared with other agents in the negotiation

## 2D/3D View Toggle

The canvas supports switching between two rendering modes:

### 2D Mode
- Classic pixelated top-down view
- Simpler rendering, lower resource usage
- All accessories and professional roles supported

### 3D Mode
- Isometric pseudo-3D rendering with depth
- Body shapes (box, cylinder, oval) affect rendering
- Enhanced visual appeal with shading and perspective
- Location furniture rendered with 3D depth
- Transparent backgrounds for furniture sprites

### Toggle Behavior
- Toggle button in the map header switches between modes
- Mode preference persisted in localStorage
- Smooth visual transition when switching
- Both modes support all agent customization options

## Location Furniture (3D Rendering)

Location-specific furniture is rendered with improved 3D visuals:

### 3D Rendering Features
- Transparent PNG backgrounds for all furniture sprites
- Proper depth sorting for layered rendering
- Isometric perspective matching agent rendering
- Shadow and lighting effects for visual consistency
- Dynamic scaling based on canvas size
- Type-specific rendering instead of generic gray boxes
- Unknown furniture items are skipped rather than rendered as gray boxes

### Supported Furniture Item Types

Furniture items now have proper type-specific rendering in 3D mode:

| Category | Item Types | Rendering Style |
|----------|------------|-----------------|
| Beds | hospital_bed | Full 3D with headboard, mattress, frame |
| Storage | bookshelf | Tall unit with shelves and books |
| Tables | conference_table, reading_table, cafe_table | Flat surfaces with legs/base |
| Seating | office_chair, armchair, bar_stool | Chair with appropriate style |
| Nature | tree | Trunk with foliage canopy |
| Windows | window | Frame with glass panes |
| Cafe Equipment | cafe_counter, coffee_machine, pastry_case | Rendered as boxes with appropriate styling |

### Wall-Mounted Items

The following items are considered wall-mounted and are skipped during furniture placement since they are drawn as part of the location background:

- `menu_board` - Cafe menu display
- `hanging_light` - Pendant/ceiling lights
- `quiet_sign` - Library quiet zone signage
- `clock` - Wall clocks
- `notice_board` - Bulletin/notice boards

These items do not require floor placement and are rendered as part of the location's visual environment.

### Furniture Categories by Location
| Location | Example Items |
|----------|---------------|
| hospital | Hospital beds, IV stands, nurse stations |
| office | Conference tables, whiteboards, office chairs |
| library | Bookshelves, reading tables, study lamps |
| school | Blackboards, student desks, teacher's desk |
| cafe | Counter, coffee machine, cafe tables, pastry case |
| outdoor | Trees, benches, lamp posts |

## Location Viewer (scenarios.html)

The scenarios page includes an interactive location viewer with mouse-based rotation for previewing scenario environments.

### Mouse-Based Rotation

The location viewer supports intuitive mouse drag rotation:

| Interaction | Action |
|-------------|--------|
| Click + drag left | Rotate room counter-clockwise |
| Click + drag right | Rotate room clockwise |
| Release | Stop rotation at current angle |

**Rotation Characteristics:**
- Smooth, responsive rotation following mouse movement
- True 3D rotation in isometric space (not 2D canvas rotation)
- Isometric projection angles preserved during rotation
- Furniture and agents remain properly positioned

### 4-Wall Visibility Culling System

The room is rendered with 4 walls using a visibility culling system:

```
Room Structure:
        ┌─────────────┐
        │  Back Wall  │
        │  (visible)  │
   ┌────┤             ├────┐
   │Left│   ROOM      │Right│
   │Wall│  INTERIOR   │Wall │
   └────┤             ├────┘
        │ Front Wall  │
        │  (culled)   │
        └─────────────┘
```

**Culling Rules:**
1. **Front wall**: Always culled to show room interior
2. **Other walls**: Culled when rotation angle makes them face the viewer
3. **Dynamic culling**: Wall visibility updates in real-time as rotation changes

**Benefits:**
- Room interior always visible regardless of rotation angle
- Creates intuitive "cutaway" view of the environment
- Walls that would obscure the view are automatically hidden

### Zoom Controls

The viewer includes zoom controls for detailed inspection:
- **Zoom In (+)**: Increase scale for detail view
- **Zoom Out (-)**: Decrease scale for overview
- **Reset**: Return to default zoom level

## URL Parameter Case Loading

Cases can be loaded directly via URL parameter:

### Flow
1. Navigate to `/?case={caseId}`
2. Main page reads `URLSearchParams` on load
3. Case is automatically selected in dropdown
4. Case data is loaded and displayed
5. URL parameter is cleared via `history.replaceState()`

### Use Case
Used by the "Use This" button in scenarios.html to redirect after creating a case.

## Furniture Viewer (scenarios.html)

The furniture tab includes an interactive 3D viewer for individual items:

### Opening the Viewer
- Click any furniture item card to open the viewer modal
- Modal displays enlarged 3D view with controls

### Controls
| Control | Action |
|---------|--------|
| Rotate Left (↶) | Rotate item 45° counter-clockwise |
| Rotate Right (↷) | Rotate item 45° clockwise |
| Zoom In (+) | Increase scale |
| Zoom Out (-) | Decrease scale |

### Rendering Approach
The furniture viewer uses the same isometric rendering as the location viewer:

```javascript
// Shared toIso transformation with rotation
function toIso(x, y, z) {
  const rx = x * Math.cos(rotRad) - y * Math.sin(rotRad);
  const ry = x * Math.sin(rotRad) + y * Math.cos(rotRad);
  return {
    x: originX + (rx - ry) * Math.cos(isoAngle) * scale,
    y: originY + (rx + ry) * Math.sin(isoAngle) * scale - z * scale
  };
}
```

### Visual Features
- Grid background for size reference
- Shadow on ground plane
- Item-specific 3D rendering (beds, tables, chairs, etc.)
- Rotation hint text at bottom

## Error Handling

### Speech Synthesis Errors
| Error | Handling |
|-------|----------|
| Voice not available | Falls back to default system voice |
| Speech interrupted | Marks message complete, advances queue |
| Browser blocks audio | Shows "click to enable audio" prompt |
| TTS not supported | Audio toggle hidden, visual-only mode |

### Rendering Errors
| Error | Handling |
|-------|----------|
| Invalid agent appearance | Uses default appearance values |
| Missing furniture type | Skips item (no gray box fallback) |
| Canvas context unavailable | Logs error, UI panels still functional |
| Animation frame dropped | Continues at next frame, no visible glitch |

### Data Errors
| Error | Handling |
|-------|----------|
| Case data missing | Clears canvas, shows empty state |
| Invalid message format | Skips message, continues queue |
| Agent ID not found | Creates placeholder agent |
| Missing thoughts field | No thought bubble shown (normal) |

---

## Performance Considerations

### Canvas Rendering
- **Frame rate**: Targets 60fps via requestAnimationFrame
- **Idle updates**: Every 100ms (not every frame)
- **Collision checks**: Limited to active wandering agents
- **Draw calls**: Batched where possible

### Memory Management
- **Message queue**: Processed sequentially, cleared on case change
- **Agent state**: Only active case agents in memory
- **Speech objects**: Destroyed after playback complete
- **Image assets**: Reused across render cycles

### Network Optimization
- **Polling interval**: 2 seconds (case), 5 seconds (logs)
- **Polling pause**: During speech playback
- **Request deduplication**: Same case not re-fetched while processing

---

## Future Enhancements

1. **Custom Avatars**: Allow users to customize Thronglet appearance
2. **More Idle Actions**: Dancing, sitting, reading
3. **Interaction Animations**: High-five when agreeing
4. **Sound Effects**: Optional audio for actions
5. **Particle Effects**: Sparkles on agreement, etc.
6. **Mobile Support**: Responsive canvas and touch controls
7. **Accessibility**: Keyboard navigation for canvas elements
8. **Performance**: WebGL rendering for complex scenes
