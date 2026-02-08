# StateLoop Scenario Format

This document describes how to write scenarios for StateLoop multi-agent negotiations.

## Two Approaches

### 1. AI-Driven Setup (Recommended)

Write your scenario in **natural language**. When the case starts, the AI reads and analyzes the scenario to:
- Identify agents and their roles
- Extract options/choices
- Create input documents
- Set up working documents for collaboration

The AI calls these APIs automatically:
- `POST /api/cases/:id/setup` - Bulk setup all entities
- `POST /api/cases/:id/agents` - Create individual agents
- `POST /api/cases/:id/options` - Create choices
- `POST /api/cases/:id/input-documents` - Add reference materials
- `POST /api/cases/:id/documents` - Create collaborative documents

**Benefits**: Flexible, natural language, no strict format required.

### 2. Format-Based Setup (Legacy)

Use specific tags (`AGENT:`, `OPTIONS:`, `INPUT_DOCUMENT:`) that the system parses with regex. This is still supported but less flexible.

---

## Quick Example

### Natural Language (AI interprets)

```
Book Club Meeting - Choosing Next Month's Read

The book club meets at the community centre on Thursday evenings. They need to
pick next month's book. Budget is limited to library copies only.

Sarah is a secret sci-fi fan who worries others find it nerdy. She'd love
Project Hail Mary but won't push hard. She's fairly agreeable (70/100).

Mike is a slow reader who needs something under 300 pages. He prefers
The Midnight Library. He's moderately stubborn (55/100).

The moderator welcomes everyone and facilitates but doesn't vote.

Options to consider:
- The Midnight Library: Popular fiction, easy read, uplifting
- Lessons in Chemistry: Historical fiction, medium length, feminist themes
- Project Hail Mary: Sci-fi, longer read, page-turner

Resolution: Sarah and Mike must both accept the same option.
```

### With Explicit Tags

```
LOCATION: Community Centre
ICON: 📚
SCENARIO: Book Club - Choosing Next Month's Read

PUBLIC INFO:
- Group meets monthly on Thursdays
- Budget: library copies only (no purchases)

OPTIONS:
- The Midnight Library: Popular fiction, easy read, uplifting
- Lessons in Chemistry: Historical fiction, medium length, feminist themes
- Project Hail Mary: Sci-fi, longer read, page-turner

AGENT: Moderator
AGENDA: Welcome everyone. Say "Right, let's pick next month's book!" Use type "message" only.

AGENT: Sarah
APPEARANCE: glasses, bookish
AGENDA: You love sci-fi but worry others find it nerdy. You prefer Project Hail Mary. AGREEABILITY: 70

AGENT: Mike
APPEARANCE: casual, practical
AGENDA: You're a slow reader, need under 300 pages. Prefer The Midnight Library. AGREEABILITY: 55

RULES:
- Case resolves when Sarah and Mike both accept
- Moderator facilitates but doesn't vote

MAX_ROUNDS: 12
```

---

## Document Structure

With AI-driven setup, there are no strictly required sections - the AI interprets your natural language. For explicit control, use these tags:

### Core Tags

| Tag | Purpose | Notes |
|-----|---------|-------|
| `SCENARIO:` | Title of the negotiation | AI extracts from context if missing |
| `LOCATION:` | Where it takes place | Used for visual display |
| `ICON:` | Emoji for display | e.g., 🏥, 🎬, ⚖️, 📚 |
| `TASK_TYPE:` | Type of task | `options`, `document`, or `both` |
| `MAX_ROUNDS:` | Timeout limit | Default: 20 |
| `TEMPERATURE:` | Response randomness | 0.0-1.0, default: 0.5 |
| `MOOD_SWINGS:` | Dynamic mood changes | `true` or `false`, default: false |
| `RANDOM_EVENTS:` | Inject interruptions | `true` or `false`, default: false |
| `CHAOS_LEVEL:` | Overall unpredictability | `calm`, `normal`, `heated`, `chaotic` |

### Agent Tags

| Tag | Purpose |
|-----|---------|
| `AGENT: Name` | Defines an agent |
| `AGENDA:` | Private instructions for that agent |
| `APPEARANCE:` | Visual appearance hints |
| `BACKGROUND:` | Life history, education, career path |
| `ORIGIN:` | Where they grew up (affects accent/dialect) |
| `SPEECH:` | Accent, vocabulary, speech patterns |
| `PERSONALITY:` | Personality archetype and traits |
| **Trait Scores (0-100):** | |
| `AGREEABILITY:` | Willingness to compromise (0=immovable, 100=pushover) |
| `INTELLIGENCE:` | Cognitive ability and type (see below) |
| `PATIENCE:` | Tolerance for frustration (0=explosive, 100=zen) |
| `CONFIDENCE:` | Self-assurance (0=insecure, 100=arrogant) |
| `EMPATHY:` | Consideration of others' feelings (0=oblivious, 100=deeply attuned) |
| `ASSERTIVENESS:` | Directness in stating needs (0=passive, 100=domineering) |
| **Behavioral Modifiers:** | |
| `VARIABILITY:` | 0.0-1.0 unpredictability (0=predictable, 1=chaotic) |
| `MOOD:` | Starting mood (neutral, enthusiastic, skeptical, tired, frustrated, distracted, inspired) |
| `QUIRKS:` | Behavioral tendencies (comma-separated) |
| `TRIGGERS:` | Topics that provoke strong reactions (comma-separated) |
| **Profile:** | |
| `PROFILE:` | Detailed profile block (see Agent Profiles section) |
| `USE_PROFILE:` | Reference existing profile: `true` or `false` |

### Content Tags

| Tag | Purpose |
|-----|---------|
| `OPTIONS:` | Choices to decide between |
| `PUBLIC INFO:` | Facts visible to all agents |
| `RULES:` | How resolution works |

### Document Tags (for collaborative writing)

| Tag | Purpose |
|-----|---------|
| `INPUT_DOCUMENT:` | Embedded reference document (ends with `END_DOCUMENT`) |
| `INPUT_FILE:` | Path to external file to include |
| `WORKING_DOCUMENTS:` | List of collaborative documents agents can edit |
| `TASK_OUTPUT:` | Name of the final deliverable document |
| `TASK_TEMPLATE:` | Template structure for output (ends with `END_TEMPLATE`) |
| `FORM:` | Mediation form definition (ends with `END_FORM`) |

### Company Tags (for company-based scenarios)

| Tag | Purpose |
|-----|---------|
| `COMPANY:` | Reference an existing company by name |
| `BUILDING:` | Reference a building within the company |
| `ROOM:` | Reference a room within the building |
| `PER_CASE_ROLE:` | Define role for non-employee participants |

---

## Section Details

### LOCATION

Single line describing where the negotiation takes place. The AI will determine the appropriate location type for visual display.

```
LOCATION: South Bristol Hospital
LOCATION: The Smith Family Living Room
LOCATION: Board Room, TechCorp HQ
```

Used in the opening message: "Thank you all for being here at [LOCATION]..."

#### AI-Controlled Location Setup

When AI sets up a case, it can specify the location with more control:

| Location Type | Description | Available Furniture |
|---------------|-------------|---------------------|
| `hospital` | Medical/healthcare setting | hospital_bed, nurse_station, iv_stand, wheelchair, medical_cart |
| `office` | Corporate/business setting | conference_table, office_chair, whiteboard, desk, filing_cabinet |
| `school` | Educational setting | blackboard, teacher_desk, student_desk, clock, globe, locker |
| `library` | Study/reading space | bookshelf, reading_table, armchair, study_carrel |
| `cafe` | Cafe/coffee shop | cafe_counter, cafe_table, coffee_machine, bar_stool |
| `park`/`outdoor` | Outdoor setting | tree, bench, fountain, picnic_table, flower_bed |
| `studio` | Creative/production space | (uses common furniture) |
| `courtroom` | Legal setting | (uses common furniture) |

The AI provides location in the setup JSON:

```json
{
  "setup": {
    "location": {
      "type": "hospital",
      "name": "South Bristol Hospital - Rehab Ward",
      "furniture": ["hospital_bed", "hospital_bed", "nurse_station", "iv_stand"]
    }
  }
}
```

If `furniture` is omitted, defaults for that location type are used.

---

### TASK_TYPE

Specifies what kind of task this is:

```
TASK_TYPE: options     # Agents choose from options (default)
TASK_TYPE: document    # Agents create a document together
TASK_TYPE: both        # Choose options AND create a document
```

| Type | Description | Use When |
|------|-------------|----------|
| `options` | Agents debate and choose from predefined options | Decisions, selections, voting |
| `document` | Agents collaborate to create a written deliverable | Writing scripts, contracts, reports |
| `both` | Agents choose options AND produce a document | Selection + formal documentation |

#### When to Use Each Type

**options** (default):
- Restaurant selection
- Policy decisions
- Hiring choices
- Simple negotiations where the outcome is a choice

**document**:
- Writing scripts or creative content (see `fawlty-towers-script.txt`)
- Creating contracts or agreements
- Drafting proposals
- Any task where the deliverable is written content

**both**:
- Art commissions where artist is selected AND artwork created (see `art-commission.txt`)
- Mediation where resolution is chosen AND agreement documented (see `workplace-mediation.txt`)
- Hiring decisions with formal offer letters
- Any selection followed by formal documentation

#### Example: Art Commission (TASK_TYPE: both)

```
TASK_TYPE: both
TASK_OUTPUT: artwork

OPTIONS:
- SVG Artist Wins: Commission goes to the vector/SVG specialist
- Pixel Artist Wins: Commission goes to the pixel art specialist

WORKING_DOCUMENTS:
- artwork: The final commissioned artwork
- brief: Client's requirements and feedback
```

Here, agents first decide WHICH artist wins (options), then the winning artist produces the artwork (document).

---

### Variability & Randomness

Control how predictable agent responses are. This creates natural conversation variation.

#### Case-Level Settings

```
TEMPERATURE: 0.7           # Overall randomness (0=deterministic, 1=creative)
MOOD_SWINGS: true          # Agents' moods evolve based on conversation
RANDOM_EVENTS: true        # Inject interruptions and distractions
CHAOS_LEVEL: normal        # calm, normal, heated, chaotic
```

| Setting | Effect |
|---------|--------|
| `TEMPERATURE` | 0.0-1.0 - How creative/random responses are |
| `MOOD_SWINGS` | If true, moods change based on accepts/rejects |
| `RANDOM_EVENTS` | If true, random interruptions may occur |
| `CHAOS_LEVEL` | Overall tone: calm (formal), normal, heated (tense), chaotic |

#### Agent-Level Settings

Within each agent's block:

```
AGENT: Sarah
AGENDA: Your private goals...
AGREEABILITY: 55
VARIABILITY: 0.7
MOOD: enthusiastic
QUIRKS: gets sidetracked by film references, changes mind when complimented
TRIGGERS: anyone suggesting something "off-brand"
```

| Setting | Effect |
|---------|--------|
| `VARIABILITY` | 0.0-1.0 - How unpredictable THIS agent is |
| `MOOD` | Starting mood: neutral, enthusiastic, skeptical, tired, frustrated, distracted, inspired |
| `QUIRKS` | Comma-separated behavioral tendencies |
| `TRIGGERS` | Topics that provoke strong reactions |

#### Variability Scale

| Value | Behavior |
|-------|----------|
| 0.0-0.2 | Highly predictable, follows agenda strictly |
| 0.3-0.4 | Mostly predictable, occasional surprises |
| 0.5 | Balanced - follows agenda but open to pivots |
| 0.6-0.7 | Unpredictable - frequently changes position |
| 0.8-1.0 | Chaotic - may contradict self, wild tangents |

#### Mood Effects

| Mood | Effect |
|------|--------|
| `neutral` | No modifier |
| `enthusiastic` | +20 agreeability, builds on ideas |
| `skeptical` | -20 agreeability, questions everything |
| `tired` | Short responses, +30 agreeability (wants to finish) |
| `frustrated` | -30 agreeability, confrontational |
| `distracted` | Tangents, may miss points |
| `inspired` | Creative solutions, unexpected proposals |

#### Example with Variability

```
SCENARIO: Writers' Room
TEMPERATURE: 0.7
MOOD_SWINGS: true
CHAOS_LEVEL: normal

AGENT: Sarah
AGENDA: You prefer Cold Open A...
AGREEABILITY: 55
VARIABILITY: 0.7
MOOD: enthusiastic
QUIRKS: goes on tangents about classic TV, changes position when someone makes her laugh
TRIGGERS: anyone calling something "too risky" makes you defensive

AGENT: Marcus
AGENDA: You prefer Cold Open B...
AGREEABILITY: 70
VARIABILITY: 0.4
MOOD: neutral
QUIRKS: always tries to add callbacks to original episodes
TRIGGERS: dismissive comments about Manuel scenes
```

---

### TASK_OUTPUT

Specifies which working document is the final deliverable. This names the document that will be extracted as the case output when resolution is reached.

```
TASK_OUTPUT: summary
TASK_OUTPUT: report
TASK_OUTPUT: meeting_notes
TASK_OUTPUT: script
TASK_OUTPUT: artwork
```

The value should match one of the document names defined in `WORKING_DOCUMENTS:`.

#### How TASK_OUTPUT Works

1. You define working documents in `WORKING_DOCUMENTS:`
2. You specify which one is the deliverable with `TASK_OUTPUT:`
3. Optionally, provide structure with `TASK_TEMPLATE:`
4. When the case resolves, the named document is extracted as the output

#### Example: Script Writing

```
TASK_OUTPUT: script

WORKING_DOCUMENTS:
- script: The episode script we're writing together
- notes: Shared notes on jokes and callbacks
- decisions: Log of creative decisions

TASK_TEMPLATE:
FAWLTY TOWERS
"The Wellness Weekend"

{{script_content}}

THE END
END_TEMPLATE
```

Here, `script` is the deliverable (matching `TASK_OUTPUT`), while `notes` and `decisions` are supporting documents that won't be included in the final output.

#### Example: Mediation Agreement

```
TASK_OUTPUT: agreement

WORKING_DOCUMENTS:
- agreement: The formal resolution terms
- discussion_notes: Summary of key points raised
```

The `agreement` document becomes the formal output; `discussion_notes` captures the process but isn't the deliverable.

---

### INPUT_DOCUMENT

Embeds document content directly in the scenario. Agents can reference this content during their discussion.

```
INPUT_DOCUMENT: meeting_agenda
1. Review Q3 financials
2. Discuss product roadmap
3. Approve marketing budget
END_DOCUMENT
```

The format is:
1. `INPUT_DOCUMENT:` followed by the document name (no spaces, use underscores)
2. Content on subsequent lines
3. `END_DOCUMENT` marker to close the block

Multiple input documents can be included:

```
INPUT_DOCUMENT: project_brief
Project Alpha aims to modernize the customer portal.
Timeline: 6 months
Budget: $500,000
END_DOCUMENT

INPUT_DOCUMENT: technical_requirements
- Must support 10,000 concurrent users
- 99.9% uptime SLA required
- Mobile-responsive design
END_DOCUMENT
```

Tips:
- Use clear, descriptive document names
- Keep documents focused on relevant content
- Documents are visible to all agents unless specified otherwise in agent agendas

---

### INPUT_FILE

References an external file to include as input. The file path is relative to the scenario file location.

```
INPUT_FILE: ./data/quarterly-report.txt
INPUT_FILE: ./templates/contract-draft.md
```

Multiple files can be referenced:

```
INPUT_FILE: ./docs/proposal-v1.txt
INPUT_FILE: ./docs/budget-spreadsheet.csv
INPUT_FILE: ./docs/stakeholder-feedback.txt
```

Tips:
- Use relative paths from the scenario file location
- Supported formats: .txt, .md, .csv, .json
- Large files may be truncated - keep input documents concise

---

### TASK_TEMPLATE

Defines a template for structured output that agents should produce.

```
TASK_TEMPLATE:
# Meeting Notes: {{title}}

**Date:** {{date}}
**Attendees:** {{attendees}}

## Discussion Points
{{discussion}}

## Action Items
{{action_items}}

## Next Steps
{{next_steps}}
END_TEMPLATE
```

The format is:
1. `TASK_TEMPLATE:` on its own line
2. Template content on subsequent lines
3. Use `{{placeholder}}` syntax for fields agents should fill in
4. `END_TEMPLATE` marker to close the block

Templates help ensure consistent output format:

```
TASK_TEMPLATE:
# Decision Record

**Decision:** {{decision}}
**Date:** {{date}}
**Participants:** {{participants}}

## Context
{{context}}

## Options Considered
{{options}}

## Rationale
{{rationale}}

## Implications
{{implications}}
END_TEMPLATE
```

Tips:
- Keep templates simple with clear placeholder names
- Use the same template name in `TASK_OUTPUT:` to link them
- Placeholders should match what agents are asked to produce

---

### FORM

Defines a structured form that agents must complete when resolution is reached. Forms are useful for mediation agreements, contracts, or any scenario requiring formal documentation of the outcome.

```
FORM: mediation_agreement
DESCRIPTION: Agreement form to be completed when resolution is reached
FIELDS:
- agreement_date (date, required): Date of agreement
- parties_involved (text, required): Names of all parties
- summary_of_dispute (textarea, required): Brief description of the dispute
- agreed_resolution (textarea, required): The resolution terms
- concessions_made (textarea): Any concessions each party made
- follow_up_actions (textarea): Actions to be taken
- mediator_notes (textarea): Mediator's observations
- all_parties_consent (checkbox, required): All parties agree to these terms
END_FORM
```

The format is:
1. `FORM:` followed by the form name (no spaces, use underscores)
2. `DESCRIPTION:` explaining the form's purpose
3. `FIELDS:` section listing all form fields
4. `END_FORM` marker to close the block

#### Field Definition Format

Each field follows this pattern:
```
- field_name (type, required): Label/description text
- field_name (type): Label/description text
```

- **field_name**: Identifier for the field (no spaces, use underscores)
- **type**: One of the supported field types (see below)
- **required**: Optional flag indicating the field must be filled
- **Label/description text**: Human-readable label shown on the form

#### Supported Field Types

| Type | Description | Use For |
|------|-------------|---------|
| `text` | Single-line text input | Names, short answers, titles |
| `textarea` | Multi-line text input | Descriptions, summaries, detailed responses |
| `date` | Date picker | Dates, deadlines, scheduled items |
| `select` | Dropdown selection | Predefined choices (see options syntax) |
| `checkbox` | Boolean checkbox | Confirmations, consent, yes/no questions |

#### Select Field Options

For select fields, specify options using a pipe-separated list:

```
- priority_level (select, required): Priority level [High|Medium|Low]
- payment_method (select): Preferred payment [Bank Transfer|Check|Cash]
```

#### Placeholder Text

Add placeholder text using curly braces:

```
- contact_email (text, required): Contact email {e.g., name@example.com}
- additional_notes (textarea): Additional notes {Enter any other relevant information...}
```

#### Complete Form Example

```
FORM: employment_mediation
DESCRIPTION: Employment dispute resolution agreement
FIELDS:
- case_reference (text, required): Case reference number {e.g., MED-2024-001}
- mediation_date (date, required): Date of mediation session
- employer_name (text, required): Employer/organization name
- employee_name (text, required): Employee name
- dispute_category (select, required): Category of dispute [Wrongful Termination|Discrimination|Harassment|Wage Dispute|Contract Breach|Other]
- dispute_summary (textarea, required): Summary of the dispute {Describe the key issues and claims...}
- agreed_outcome (textarea, required): Agreed resolution terms {Detail the specific terms both parties have agreed to...}
- financial_settlement (text): Financial settlement amount if applicable {e.g., $5,000}
- reinstatement_offered (checkbox): Reinstatement of employment offered
- reference_provided (checkbox): Neutral/positive reference to be provided
- confidentiality_agreed (checkbox, required): Both parties agree to confidentiality
- timeline_for_compliance (textarea): Timeline for implementing agreed terms {Specify deadlines and milestones...}
- employer_signature_date (date, required): Date employer representative signs
- employee_signature_date (date, required): Date employee signs
- mediator_observations (textarea): Mediator's observations and recommendations
- follow_up_date (date): Scheduled follow-up date if applicable
END_FORM
```

#### Multiple Forms

A scenario can define multiple forms for different purposes:

```
FORM: intake_form
DESCRIPTION: Initial case intake information
FIELDS:
- case_type (select, required): Type of case [Civil|Family|Employment|Commercial]
- parties_count (text, required): Number of parties involved
- urgency (select): Urgency level [Standard|Expedited|Emergency]
END_FORM

FORM: resolution_agreement
DESCRIPTION: Final agreement when case resolves
FIELDS:
- resolution_date (date, required): Date of resolution
- outcome_summary (textarea, required): Summary of agreed outcome
- all_parties_consent (checkbox, required): All parties consent to this agreement
END_FORM
```

#### Form Behavior

- Forms are presented to agents when the case reaches resolution
- Required fields must be completed before the case can be finalized
- Form data is stored with the case record
- Forms can be referenced in RULES to specify completion requirements

#### Linking Forms to Resolution

Reference forms in your RULES section:

```
RULES:
- Case resolves when all decision-makers accept the same option
- The mediation_agreement form must be completed at resolution
- Mediator fills in mediator_observations after parties complete their sections
```

Tips:
- Use descriptive field names that match the scenario context
- Mark genuinely required fields as required; don't over-require
- Provide placeholder text for fields that might be ambiguous
- Group related fields together in the FIELDS list
- Consider who fills out which fields and note this in RULES

---

### WORKING_DOCUMENTS

Defines documents that agents can collaboratively edit during the negotiation. Unlike INPUT_DOCUMENT (read-only), working documents can be modified by agents as the discussion progresses.

```
WORKING_DOCUMENTS:
- draft_proposal: Initial proposal text that agents refine together
- action_items: Running list of agreed action items
- meeting_notes: Shared notes from the discussion
```

Each working document has:
- A name (used as identifier, should match TASK_OUTPUT if it's the deliverable)
- A description of the document's purpose
- Optional initial content

#### Basic Format

```
WORKING_DOCUMENTS:
- document_name: Description of what this document is for
```

#### With Initial Content

```
WORKING_DOCUMENTS:
- draft_proposal:
  Initial content goes here.
  Can be multiple lines.

- action_items:
  1. [To be filled during discussion]
```

#### Relationship to Other Tags

| Tag | Purpose | Example |
|-----|---------|---------|
| `WORKING_DOCUMENTS:` | Define editable documents | `- script: The episode script` |
| `TASK_OUTPUT:` | Which document is the deliverable | `TASK_OUTPUT: script` |
| `TASK_TEMPLATE:` | Structure for the output | Template with `{{placeholders}}` |

The document named in `TASK_OUTPUT` should be one of the `WORKING_DOCUMENTS`.

#### Complete Example: Script Writing

```
TASK_TYPE: document
TASK_OUTPUT: script

WORKING_DOCUMENTS:
- script: The episode script we're writing together
- notes: Shared notes on jokes, callbacks, and continuity
- decisions: Log of creative decisions and why they were made

TASK_TEMPLATE:
FAWLTY TOWERS
"The Wellness Weekend"
by The Writers Room

{{script_content}}

THE END
END_TEMPLATE
```

#### Complete Example: Art Commission

```
TASK_TYPE: both
TASK_OUTPUT: artwork

WORKING_DOCUMENTS:
- artwork: The final commissioned artwork
- brief: Client's requirements and feedback

TASK_TEMPLATE:
# Art Commission Deliverable

## Commission Details
- **Client:** {{client_name}}
- **Project:** Rocket Icon for "LaunchPad" App
- **Artist:** {{winning_artist}}

## The Artwork
{{artwork_content}}

## Artist's Notes
{{artist_notes}}
END_TEMPLATE
```

Working documents support:
- Version history tracking
- Concurrent edits with conflict detection
- Rollback to previous versions

Tips:
- Name the deliverable document clearly and match it with `TASK_OUTPUT`
- Use supporting documents (notes, decisions) to capture process
- Provide initial structure when helpful for complex documents
- Reference working documents in agent agendas to guide contributions
- Consider who writes what: "Sarah updates the script when scenes are agreed"

---

### SCENARIO

The title/topic being discussed. Keep it descriptive but concise.

```
SCENARIO: Team Project Approach Decision
SCENARIO: Climate Policy Debate
SCENARIO: South Bristol Hospital Rehab Ward - Hydration Challenge
```

---

### PUBLIC INFO

Bullet points of facts ALL participants know. This sets the shared context.

```
PUBLIC INFO:
- Budget is $5000 total
- Decision must be made by Friday
- Three team members are vegetarian
- Last year's event was poorly attended
```

Tips:
- Include constraints everyone knows about
- Add relevant background/history
- Keep points factual, not opinions

---

### OPTIONS

The choices available for the negotiation. Use `OPTIONS:` section to define them.

```
OPTIONS:
- Option Name: Brief description of what this option involves
- Another Option: Description with key features, pros, cons
```

Example:
```
OPTIONS:
- Hydration Champions: Assign one nurse per shift as dedicated hydration lead
- Tech Solution: Use reminder apps/alarms for hourly drink rounds
- Patient Choice: Offer variety (squash, juice, flavoured water, ice lollies)
- Protected Time: 15-min hydration rounds with no interruptions allowed
```

Tips:
- 3-6 options works well
- Include enough detail for agents to discuss trade-offs
- Can include factual attributes (cost, time, etc.)

---

### AGENT Blocks

Each agent needs:
1. `AGENT: Name` - The participant's name
2. `AGENDA:` - Their private instructions (optional but recommended)
3. `AGREEABILITY:` - How likely to compromise (optional)
4. `APPEARANCE:` - Visual traits for the UI (optional)
5. `BACKGROUND:` - Life history and education (optional but recommended)
6. `ORIGIN:` - Where they grew up, affects speech patterns (optional)
7. `SPEECH:` - Accent, dialect, and speech mannerisms (optional)

#### Basic Format

```
AGENT: Alice
AGENDA: Your private goals and personality here.
AGREEABILITY: 65
```

#### Full Format

```
AGENT: Bev
APPEARANCE: nurse_scrubs, experienced, skeptical
AGENDA (Senior Nurse): You've been nursing 25 years. You know hydration matters but you're drowning in paperwork. Another "initiative" feels like more work. Be skeptical but open if practical. AGREEABILITY: 40
```

---

### AGENDA

The private instructions only this agent sees. This is the heart of each character.

#### What to Include

1. **Role/Background**: Who they are
2. **Goals**: What they want from this negotiation
3. **Personality**: How they behave
4. **Constraints**: Hard limits they won't cross
5. **Hidden info**: Things others don't know about them
6. **Relationship hints**: How they view others

#### Examples

**Simple agenda:**
```
AGENDA: You prefer Italian food but are flexible. Budget matters to you since you're paying.
```

**Rich agenda:**
```
AGENDA (Patient, 82, stroke recovery): You limit fluids because getting to the toilet is exhausting and embarrassing. You'd rather be a bit thirsty than need help with the commode again. This is private - you won't say it unless you feel safe. AGREEABILITY: 45
```

**Moderator agenda:**
```
AGENDA: You facilitate the discussion. Say "Welcome everyone, let's discuss our options." Use type "message" only. Do NOT make proposals. Only intervene if stuck after 6 rounds.
```

#### Special Instructions

Use `Say "..."` to specify exact opening words:
```
AGENDA: Say "Alright everyone, time to pick tonight's movie! Chris, what are you in the mood for?"
```

Note: Use double quotes `"..."` for text containing apostrophes (like "let's" or "tonight's").

---

### Character Trait Scores

All trait scores range from 0-100 and influence agent behavior during negotiations.

---

#### AGREEABILITY

How willing they are to compromise and change their position.

| Range | Behavior |
|-------|----------|
| 0-20 | **Immovable** - Rarely compromises, digs in when challenged |
| 21-40 | **Difficult** - Resistant, needs significant convincing |
| 41-60 | **Moderate** - Open to good arguments, can be swayed |
| 61-80 | **Agreeable** - Seeks common ground, prefers harmony |
| 81-100 | **Pushover** - Quick to accept, avoids conflict |

```
AGREEABILITY: 55
```

---

#### INTELLIGENCE

Cognitive ability and problem-solving style. Not a single IQ number - specify the TYPE of intelligence.

| Range | Level | Characteristics |
|-------|-------|-----------------|
| 0-30 | **Limited** | Struggles with complex ideas, easily confused, needs things explained simply |
| 31-50 | **Below Average** | Misses nuance, takes things literally, slow to understand implications |
| 51-70 | **Average** | Grasps most concepts, occasional blind spots, reasonable logic |
| 71-85 | **Above Average** | Quick to understand, sees connections, good reasoning |
| 86-100 | **Exceptional** | Brilliant, sees patterns others miss, sophisticated thinking |

**Intelligence Types** (specify in addition to score):

| Type | Description |
|------|-------------|
| `analytical` | Logical, systematic, good with data and facts |
| `emotional` | High EQ, reads people well, understands motivations |
| `practical` | Street-smart, common sense, real-world solutions |
| `creative` | Lateral thinking, innovative, unusual approaches |
| `verbal` | Articulate, persuasive, good with words |
| `technical` | Domain expertise, specialist knowledge |

```
INTELLIGENCE: 75, practical - Street-smart but didn't finish school. Reads people well, struggles with paperwork.
```

```
INTELLIGENCE: 85, analytical - Oxford-educated, thinks in frameworks. Can be blind to emotional undercurrents.
```

```
INTELLIGENCE: 45, emotional - Not academic but deeply understands people. Makes poor decisions under pressure.
```

---

#### PATIENCE

How quickly they get frustrated or lose composure.

| Range | Behavior |
|-------|----------|
| 0-20 | **Explosive** - Quick temper, snaps easily, low frustration tolerance |
| 21-40 | **Impatient** - Gets visibly annoyed, rushes others, sighs and interrupts |
| 41-60 | **Moderate** - Can be pushed but manages it, occasional outbursts |
| 61-80 | **Patient** - Stays calm under pressure, rarely shows frustration |
| 81-100 | **Zen** - Almost unflappable, maintains composure in chaos |

```
PATIENCE: 25
```

**Interaction with other traits:**
- Low patience + low agreeability = volatile, confrontational
- Low patience + high agreeability = caves quickly to end frustration
- Low patience + high confidence = dismissive, steamrolls others

---

#### CONFIDENCE

How sure of themselves they are.

| Range | Behavior |
|-------|----------|
| 0-20 | **Deeply Insecure** - Second-guesses everything, seeks constant validation |
| 21-40 | **Self-Doubting** - Uncertain, easily shaken by criticism |
| 41-60 | **Moderate** - Reasonably secure, can be swayed by strong arguments |
| 61-80 | **Confident** - Sure of themselves, comfortable stating positions |
| 81-100 | **Arrogant** - Overconfident, dismissive of others, rarely admits mistakes |

```
CONFIDENCE: 30
```

**Interaction with other traits:**
- Low confidence + high intelligence = imposter syndrome, undermines own points
- High confidence + low intelligence = Dunning-Kruger, overestimates own competence
- High confidence + low empathy = bulldozer who doesn't notice others' reactions

---

#### EMPATHY

How much they consider and respond to others' feelings.

| Range | Behavior |
|-------|----------|
| 0-20 | **Oblivious** - Doesn't notice or care about others' emotions |
| 21-40 | **Low** - Aware but unbothered, focuses on facts not feelings |
| 41-60 | **Moderate** - Considers others when reminded, not naturally attuned |
| 61-80 | **Empathetic** - Naturally aware of others' feelings, adjusts approach |
| 81-100 | **Deeply Attuned** - Highly sensitive to emotions, may over-accommodate |

```
EMPATHY: 35
```

**Interaction with other traits:**
- Low empathy + high assertiveness = aggressive, runs over people
- High empathy + low assertiveness = doormat, prioritizes others over self
- High empathy + high intelligence = master manipulator OR genuinely supportive

---

#### ASSERTIVENESS

How directly they state their needs and push back.

| Range | Behavior |
|-------|----------|
| 0-20 | **Passive** - Struggles to state needs, hints rather than asks, accepts poor treatment |
| 21-40 | **Indirect** - States needs reluctantly, backs down when challenged |
| 41-60 | **Moderate** - Can state needs but prefers compromise, picks battles |
| 61-80 | **Assertive** - States needs clearly, comfortable with disagreement |
| 81-100 | **Domineering** - Demands, doesn't ask, talks over others, dominates |

```
ASSERTIVENESS: 80
```

**Interaction with other traits:**
- High assertiveness + low empathy = bully
- Low assertiveness + high empathy = martyr who resents others
- High assertiveness + high agreeability = collaborative leader

---

### Trait Combinations

Use multiple traits together for complex characters:

**The Brilliant Bully:**
```
INTELLIGENCE: 90, analytical
CONFIDENCE: 85
EMPATHY: 25
ASSERTIVENESS: 85
PATIENCE: 35
AGREEABILITY: 30
```

**The Anxious People-Pleaser:**
```
INTELLIGENCE: 70, emotional
CONFIDENCE: 25
EMPATHY: 85
ASSERTIVENESS: 20
PATIENCE: 60
AGREEABILITY: 85
```

**The Street-Smart Negotiator:**
```
INTELLIGENCE: 75, practical
CONFIDENCE: 70
EMPATHY: 65
ASSERTIVENESS: 70
PATIENCE: 55
AGREEABILITY: 50
```

**The Defensive Know-It-All:**
```
INTELLIGENCE: 80, analytical
CONFIDENCE: 75 (but fragile)
EMPATHY: 30
ASSERTIVENESS: 70
PATIENCE: 40
AGREEABILITY: 25
PERSONALITY: Defensive. Can't admit being wrong. Lectures others. Gets triggered by being corrected.
```

---

### Additional Character Traits

These optional traits add further depth:

#### HONESTY

How truthful and straightforward they are.

| Range | Behavior |
|-------|----------|
| 0-30 | **Manipulative** - Lies readily, withholds information strategically |
| 31-50 | **Selective** - Omits unfavorable facts, spins the truth |
| 51-70 | **Situational** - Generally honest but will bend truth under pressure |
| 71-85 | **Honest** - Values truth, uncomfortable lying |
| 86-100 | **Bluntly Honest** - Cannot lie, even when it would help |

```
HONESTY: 40 - Will omit inconvenient facts and exaggerate their case.
```

---

#### TRUST

How easily they trust others' intentions.

| Range | Behavior |
|-------|----------|
| 0-30 | **Paranoid** - Assumes others are lying or have hidden agendas |
| 31-50 | **Suspicious** - Questions motives, needs proof of good faith |
| 51-70 | **Cautious** - Trusts incrementally, verify then trust |
| 71-85 | **Trusting** - Generally takes people at their word |
| 86-100 | **Naive** - Trusts too easily, easily deceived |

```
TRUST: 25 - Burned too many times. Assumes everyone has an angle.
```

---

#### RISK_TOLERANCE

How comfortable they are with uncertainty and potential loss.

| Range | Behavior |
|-------|----------|
| 0-30 | **Risk-Averse** - Avoids uncertainty, needs guarantees, fears loss |
| 31-50 | **Cautious** - Prefers safe options, needs reassurance |
| 51-70 | **Moderate** - Accepts reasonable risks with good upside |
| 71-85 | **Risk-Taking** - Comfortable with uncertainty, optimistic |
| 86-100 | **Reckless** - Chases risk, dismisses downsides |

```
RISK_TOLERANCE: 30 - Conservative. "Let's not do anything hasty."
```

---

#### STRESS_TOLERANCE

How well they function under pressure.

| Range | Behavior |
|-------|----------|
| 0-30 | **Fragile** - Falls apart under pressure, makes poor decisions when stressed |
| 31-50 | **Vulnerable** - Noticeably affected by stress, performance degrades |
| 51-70 | **Moderate** - Manages normal stress, struggles with extremes |
| 71-85 | **Resilient** - Maintains composure, clear thinking under pressure |
| 86-100 | **Ice Cold** - Thrives under pressure, unflappable |

```
STRESS_TOLERANCE: 35 - Gets flustered when things heat up. Makes concessions to escape stress.
```

---

#### STATUS_AWARENESS

How much they care about hierarchy and social position.

| Range | Behavior |
|-------|----------|
| 0-30 | **Status-Blind** - Treats everyone the same regardless of position |
| 31-50 | **Informal** - Aware of hierarchy but doesn't defer excessively |
| 51-70 | **Appropriate** - Respects hierarchy normally |
| 71-85 | **Status-Conscious** - Defers to higher status, looks down on lower |
| 86-100 | **Obsessed** - Constantly tracking status, deeply affected by rank |

```
STATUS_AWARENESS: 80 - Very conscious of who outranks whom. Sycophantic to superiors, dismissive of juniors.
```

---

#### HUMOR

How they use and respond to humor.

| Type | Description |
|------|-------------|
| `none` | Doesn't joke, misses humor, serious |
| `dry` | Deadpan, subtle, sardonic |
| `warm` | Good-natured, inclusive, disarming |
| `nervous` | Jokes to defuse tension, sometimes inappropriately |
| `cutting` | Uses humor as a weapon, sarcastic |
| `self-deprecating` | Makes fun of themselves |
| `dad-jokes` | Corny, groan-worthy, persistent |

```
HUMOR: cutting - Uses sarcasm to put people down while maintaining deniability.
```

---

#### ENERGY

Their baseline energy level and enthusiasm.

| Range | Behavior |
|-------|----------|
| 0-30 | **Low Energy** - Slow, tired, minimal enthusiasm, brief responses |
| 31-50 | **Subdued** - Calm, measured, doesn't get excited |
| 51-70 | **Moderate** - Normal energy, engaged when interested |
| 71-85 | **Energetic** - Enthusiastic, animated, drives momentum |
| 86-100 | **Intense** - High energy, exhausting to others, always "on" |

```
ENERGY: 25 - Just wants this over with. Short responses. Sighs a lot.
```

---

### Full Character Example with All Traits

```
AGENT: Derek
APPEARANCE: business_suit, glasses, tall
BACKGROUND: Grammar school, Oxford law, senior partner at a City firm for 30 years. Used to being the smartest person in the room. Recently passed over for managing partner - bitter about it.
ORIGIN: Originally working-class Liverpool, has carefully erased his accent
SPEECH: Crisp RP. Cuts people off mid-sentence. Uses legal jargon to intimidate. "With respect" means "you're an idiot."

PERSONALITY: Self-righteous, defensive, status-conscious. Cannot admit being wrong. Uses intellect as a weapon.

INTELLIGENCE: 90, analytical
AGREEABILITY: 25
PATIENCE: 30
CONFIDENCE: 80 (but fragile underneath)
EMPATHY: 20
ASSERTIVENESS: 85
HONESTY: 50 - Will spin facts but won't outright lie
TRUST: 35 - Assumes others have angles
RISK_TOLERANCE: 40 - Conservative despite confidence
STRESS_TOLERANCE: 60 - Handles pressure but ego is vulnerable
STATUS_AWARENESS: 85 - Obsessed with hierarchy
HUMOR: cutting
ENERGY: 70

TRIGGERS: being interrupted, having his expertise questioned, mentions of the managing partner decision
QUIRKS: taps pen when annoyed, uses "frankly" before saying something rude

AGENDA: You're representing the company in this mediation. You think it's beneath you. You want a quick resolution on your terms. If anyone challenges your legal knowledge, you'll demolish them. AGREEABILITY: 25. Hard stance: No admission of liability, non-negotiable.
```

---

### APPEARANCE

Visual traits for UI rendering. Comma-separated values.

#### Available Accessories

| Accessory | Description |
|-----------|-------------|
| `none` | No accessory |
| `hat` | Wearing a hat |
| `glasses` | Wearing glasses |
| `bowtie` | Formal bowtie |
| `headphones` | Wearing headphones |
| `scarf` | Wearing a scarf |
| `wheelchair` | Uses wheelchair (disables jumping animation) |
| `nurse_scrubs` | Medical scrubs |
| `doctor_coat` | White doctor's coat |
| `police_uniform` | Police uniform |
| `teacher` | Teacher attire |
| `business_suit` | Business formal |
| `healthcare_assistant` | Healthcare worker attire |

#### Body Styles

- `normal` - Standard build
- `tall` - Taller figure
- `short` - Shorter figure
- `wide` - Wider build

#### Example Appearances

```
APPEARANCE: glasses, tall, professional
APPEARANCE: wheelchair, friendly, determined
APPEARANCE: nurse_scrubs, experienced, tired
APPEARANCE: business_suit, confident, impatient
```

---

### PROFILE

Define detailed passport-like identity and physical features for agents. This enables consistent image generation and rich character backgrounds that persist across scenarios.

#### Use Existing Profile

Reference an agent's existing profile from the database:

```
AGENT: Sarah Chen
USE_PROFILE: true
AGENDA: Your private goals...
```

#### Override Profile Fields

Use existing profile but modify specific fields:

```
AGENT: Sarah Chen
USE_PROFILE: true
PROFILE:
  CLOTHING_STYLE: casual
  GLASSES: none
AGENDA: Today is a casual Friday...
```

#### Define Full Profile in Scenario

```
AGENT: Sarah Chen
PROFILE:
  SEX: female
  DATE_OF_BIRTH: 1991-03-15
  NATIONALITY: British
  PLACE_OF_BIRTH: Bristol, United Kingdom
  AGE_APPEARANCE: 34
  BUILD: average
  HEIGHT: 165
  FACE_SHAPE: oval
  HAIR: black, straight, medium
  EYES: brown
  SKIN_TONE: #d4a574
  GLASSES: prescription
  JEWELRY: earrings, watch
  TATTOOS: small butterfly on left wrist
  CLOTHING_STYLE: business
  CLOTHING_COLORS: #2c3e50, #ecf0f1
  PERSONALITY: professional, empathetic, detail-oriented
  BACKSTORY: |
    Sarah is a seasoned HR manager with 12 years of experience.
    She started at the BBC as an intern and worked her way up.
    Known for her calm demeanor during difficult conversations.
AGENDA: You are conducting a disciplinary hearing...
```

#### Profile Fields

**Identity:**
| Field | Format | Example |
|-------|--------|---------|
| `SEX` | male / female / other | `female` |
| `DATE_OF_BIRTH` | YYYY-MM-DD | `1991-03-15` |
| `NATIONALITY` | Country/ies | `British` or `British, American` |
| `PLACE_OF_BIRTH` | City, Country | `Bristol, United Kingdom` |
| `AGE_APPEARANCE` | Number | `34` (may differ from DOB age) |

**Physical:**
| Field | Format | Options |
|-------|--------|---------|
| `BUILD` | Single value | slim, average, athletic, stocky, heavy |
| `HEIGHT` | Centimeters | `165` |
| `FACE_SHAPE` | Single value | round, oval, square, heart, long, diamond |
| `HAIR` | color, style, length | `black, straight, medium` |
| `EYES` | Single value | brown, blue, green, hazel, gray, amber |
| `SKIN_TONE` | Hex or description | `#d4a574` or `fair` |
| `FACIAL_HAIR` | Single value | none, stubble, goatee, mustache, beard, full_beard |

**Accessories:**
| Field | Format | Options |
|-------|--------|---------|
| `GLASSES` | Single value | none, reading, prescription, sunglasses, round, square, rimless |
| `JEWELRY` | Comma-separated | `earrings, watch, necklace, rings, bracelet, piercing` |

**Distinguishing Marks:**
| Field | Format | Example |
|-------|--------|---------|
| `TATTOOS` | Description | `small butterfly on left wrist` |
| `SCARS` | Description | `faint scar on right cheek` |

**Clothing:**
| Field | Format | Options |
|-------|--------|---------|
| `CLOTHING_STYLE` | Single value | casual, business, formal, uniform, creative, sporty |
| `CLOTHING_COLORS` | Hex, Hex | `#2c3e50, #ecf0f1` (primary, secondary) |

**Character:**
| Field | Format | Example |
|-------|--------|---------|
| `PERSONALITY` | Comma-separated | `professional, empathetic, detail-oriented` |
| `BACKSTORY` | Multiline text | Use `|` for multiline YAML-style block |

#### Hair Format

Hair is specified as comma-separated: `color, style, length`

- **Colors:** black, brown, blonde, red, gray, white, auburn
- **Styles:** short, medium, long, bald, buzzed, curly, wavy, straight, ponytail, bun
- **Lengths:** bald, very_short, short, medium, long, very_long

Examples:
```
HAIR: black, straight, medium
HAIR: blonde, curly, long
HAIR: gray, bald
```

#### Profile API Integration

Profiles created in scenarios are saved to the agent database. You can also create profiles via API:

```bash
# Create/update profile
curl -X PUT http://localhost:3000/api/agents/Sarah%20Chen/profile \
  -H "Content-Type: application/json" \
  -d '{"dateOfBirth": "1991-03-15", "nationality": "British", ...}'

# Get image generation prompt
curl http://localhost:3000/api/agents/Sarah%20Chen/image-prompt

# Get character description for prompts
curl http://localhost:3000/api/agents/Sarah%20Chen/character-description
```

---

### PERSONALITY

The personality archetype and behavioral traits that define how this agent interacts with others. This is separate from AGENDA (what they want) - PERSONALITY defines HOW they pursue their goals.

```
PERSONALITY: Defensive, can't admit fault, deflects blame to others. Takes criticism personally. Brings up past grievances when cornered.
```

#### Format

Free-form text describing:
1. **Archetype** - The core personality type (aggressive, passive-aggressive, defensive, etc.)
2. **Behavioral patterns** - How they act under pressure
3. **Communication style** - How they express disagreement
4. **Emotional reactions** - What triggers them and how they respond

#### Archetype Keywords

Use these to quickly establish personality:

| Keyword | Meaning |
|---------|---------|
| `aggressive` | Escalates, gets loud, confrontational |
| `passive-aggressive` | Agrees superficially, undermines subtly |
| `defensive` | Can't admit fault, deflects blame |
| `self-righteous` | Lectures, moralizes, always right |
| `dramatic` | Emotional, makes things about themselves |
| `bitter` | Holds grudges, references past wrongs |
| `anxious` | Overthinks, catastrophizes, needs reassurance |
| `dismissive` | Doesn't take others seriously |
| `stubborn` | Digs in, won't budge without face-saving |
| `people-pleaser` | Agrees too easily, then resents it |
| `martyr` | Sacrifices while making others feel guilty |
| `know-it-all` | Must be the expert, corrects others |
| `chaotic` | Unpredictable, stirs things up for fun |

#### Examples

**Aggressive:**
```
PERSONALITY: Aggressive. Short fuse, feels disrespected easily. Gets louder when challenged. Sees compromise as weakness. Might storm out if pushed. "I'm not backing down."
```

**Passive-aggressive:**
```
PERSONALITY: Passive-aggressive. Smiles and nods while seething. Says "that's fine" when it isn't. Makes cutting jokes. Agrees then "forgets" to follow through.
```

**Defensive with triggers:**
```
PERSONALITY: Defensive. Any criticism feels like an attack. Immediately explains why it's not their fault. Brings up past grievances to deflect. Gets triggered by being called "unreasonable."
```

**Complex/Mixed:**
```
PERSONALITY: Self-righteous but insecure underneath. Lectures others to feel competent. Dismissive of opposing views but secretly worried they might be wrong. Doubles down when challenged rather than reflecting.
```

---

### BACKGROUND

Life history, education, and formative experiences that shape who this person is. This helps establish realistic intelligence levels and worldviews.

```
BACKGROUND: Left school at 16 to work in the family shop. Self-taught in business through night classes. Practical intelligence, street-smart, good with people but struggles with formal documentation.
```

#### What to Include

1. **Education level**: School, college, university, vocational training, self-taught
2. **Career path**: How they got to where they are now
3. **Life experiences**: Formative events that shaped their worldview
4. **Intelligence type**: Academic, practical, emotional, creative, technical

#### Intelligence Guidelines

Most agents in professional/community settings have average or above-average intelligence - they wouldn't be "at the table" otherwise. Consider:

| Context | Typical Range | Notes |
|---------|---------------|-------|
| Professional meeting | Average to high | Got the job somehow |
| Community group | Average | Self-selected to participate |
| Healthcare setting | Varies widely | Patients may be elderly, confused, or sharp |
| Family discussion | Varies | Range of ages and education |

**Avoid stereotypes**: A nurse with no degree may be sharper than the consultant. A working-class background doesn't mean less intelligent - just different knowledge.

#### Examples

**Working-class professional:**
```
BACKGROUND: Grew up on a council estate in Knowle West, Bristol. Left school at 16, trained as an electrician. Did an Open University degree in his 30s while working. Sharp analytical mind, practical problem-solver, doesn't suffer fools.
```

**Academic:**
```
BACKGROUND: Grammar school, then Oxford PPE. Worked in policy think tanks. Highly articulate but can be out of touch with practical realities. Book-smart but sometimes misses social cues.
```

**Self-made:**
```
BACKGROUND: Immigrant parents ran a corner shop. Worked there from age 12. No university but built a successful restaurant chain through hard work and people skills. Shrewd negotiator, reads people well.
```

---

### ORIGIN

Where they grew up - this determines accent, dialect, and cultural references. Be specific about region, not just country.

```
ORIGIN: Working-class Bristol (Knowle West)
ORIGIN: Rural Somerset (Cheddar area)
ORIGIN: Inner-city Birmingham (Small Heath)
ORIGIN: Scottish Highlands (Inverness)
ORIGIN: South London (Brixton)
```

#### UK Regional Examples

| Region | Typical Traits |
|--------|----------------|
| Bristol/West Country | "Alright my lover", "gurt lush", rolled Rs |
| Birmingham | Rising intonation, "yow" for "you", "bostin" |
| Liverpool | Scouse, "la", "sound", distinctive rhythm |
| Newcastle | Geordie, "pet", "howay", "canny" |
| Glasgow | "Aye", "wee", "ken", glottal stops |
| East London | "Innit", "bruv", multicultural London English |
| Yorkshire | "Nowt", "summat", flat vowels, direct |
| Manchester | "Our kid", "mint", nasal sounds |
| Cornwall | Softer than Bristol, Celtic influence |

---

### SPEECH

How they talk - accent features, vocabulary, speech patterns, verbal habits. This guides the AI in generating authentic dialogue.

```
SPEECH: Bristol accent. Uses "alright my lover" as greeting. Direct and no-nonsense. Swears occasionally when frustrated. Says "proper" for emphasis.
```

#### What to Include

1. **Accent markers**: Key phonetic features or spellings
2. **Dialect words**: Regional vocabulary
3. **Speech patterns**: Long or short sentences, formal or casual
4. **Verbal habits**: Filler words, catchphrases, interruption patterns
5. **Register**: How they adjust for different audiences

#### Examples

**Working-class Bristol nurse:**
```
SPEECH: Strong Bristol accent. "Alright my love" to patients. Calls things "proper" when good. Drops Hs occasionally. Direct, doesn't mince words. Uses dark humour with colleagues but gentle with patients.
```

**Yorkshire farmer:**
```
SPEECH: Broad Yorkshire. "Aye" and "nay" instead of yes/no. "Nowt" for nothing, "summat" for something. Very direct, few words, says what he means. Suspicious of fancy talk.
```

**Multicultural London youth:**
```
SPEECH: MLE (Multicultural London English). "Innit" as tag question, "bare" for very, "peak" for bad situation. Fast-paced, references grime culture. Code-switches to more formal English with authority figures.
```

**Scottish professional:**
```
SPEECH: Soft Edinburgh accent (not broad). "Aye" occasionally. Formal in meetings but warmer one-to-one. Uses "wee" naturally. Articulate but not posh.
```

**Upper-middle class professional:**
```
SPEECH: RP with slight Northern edge (grammar school, then London). Avoids slang in professional settings. Occasionally slips into more casual register when relaxed. Uses "rather" and "quite" frequently.
```

---

### Complete Agent Example with Persona

```
AGENT: Bev
APPEARANCE: nurse_scrubs, experienced, skeptical
BACKGROUND: Left school at 16 to help raise younger siblings after dad left. Trained as a nurse at Southmead Hospital, Bristol. 25 years on the wards. Seen everything, done everything. No formal higher education but knows more about patient care than most consultants. Sharp, practical intelligence.
ORIGIN: Working-class Bristol (Hartcliffe estate)
SPEECH: Strong Bristol accent. "Alright my lover" to patients, more formal with management. Direct and no-nonsense. Dark humour with colleagues. Says "proper job" when something works. Occasionally drops Hs. Can switch to more formal English when dealing with complaints or inspectors.
AGENDA: You've been nursing 25 years. You know hydration matters but you're drowning in paperwork. Another "initiative" feels like more work. Be skeptical but open if the solution is practical. Hard stance: no more paperwork.
AGREEABILITY: 40
```

---

### RULES

Define how the negotiation resolves and any special conditions.

```
RULES:
- Case resolves when Alice and Bob both accept the same option
- Moderator facilitates but doesn't need to accept
- If 3 rejections occur, negotiation fails
- Budget of $5000 is a hard constraint
```

#### Common Rule Patterns

**Consensus required:**
```
- All participants must accept for resolution
```

**Subset consensus:**
```
- Case resolves when Mom and Dad both accept (kids' input matters but parents decide)
```

**Facilitator excluded:**
```
- Moderator does not accept - only facilitates
```

**Failure conditions:**
```
- If too many rejections, everyone goes home unhappy (failure)
```

---

### MAX_ROUNDS

Maximum number of messages before timeout. Prevents infinite loops.

```
MAX_ROUNDS: 15
```

Guidelines:
- Simple 2-person negotiation: 8-12 rounds
- Group discussion (4-6 people): 15-20 rounds
- Complex multi-stakeholder: 20-30 rounds

Default is 20 if not specified.

---

## Agent Roles

### Moderator/Facilitator

A special agent who guides discussion but doesn't vote.

```
AGENT: Moderator
AGENDA: You facilitate the discussion. Say "Welcome! Let's hear everyone's thoughts." Use type "message" only. Do NOT make proposals. Only intervene if discussion stalls.
```

Key traits:
- Uses only `message` type (no proposals/accepts)
- Excluded from consensus requirements
- Helps keep conversation moving
- Can summarize or redirect

### Decision Makers

Agents who must agree for resolution.

```
AGENT: Alice
AGENDA: You need to reach consensus on the approach. You prefer structured methods. AGREEABILITY: 60

AGENT: Bob
AGENDA: You want flexibility and room for iteration. AGREEABILITY: 55
```

### Advisors/Stakeholders

Agents whose input matters but aren't required for resolution.

```
AGENT: Teen
AGENDA: You'd rather not go on this family vacation. If you MUST go, you want Instagram-worthy spots. AGREEABILITY: 35

RULES:
- Case resolves when Mom and Dad both accept
- Teen's happiness is valued but not required
```

---

## Message Types

Agents can use these response types:

| Type | Purpose | Requires optionId |
|------|---------|-------------------|
| `message` | General comment, question, or statement | No |
| `proposal` | Suggest a specific option | Yes |
| `counter` | Propose different option in response | Yes |
| `accept` | Agree to the current/last proposal | Optional |
| `reject` | Refuse without counter-proposal | No |

---

## Resolution Logic

### Success (Agreed)

All required decision-makers have sent `accept` for the same option.

### Failure Conditions

1. **Timeout**: MAX_ROUNDS reached without agreement
2. **Too many rejections**: 3+ `reject` messages
3. **Manual**: Admin resolves as failed

---

## Personality Design

### The Problem with "Reasonable" Agents

A common mistake is making all agents too reasonable. When everyone is agreeable (50-80 range), negotiations resolve too quickly without interesting conflict. Real negotiations involve:

- **Genuine incompatibility** - Sometimes positions really do clash
- **Personality friction** - People annoy each other
- **Emotional stakes** - Not everything is rational
- **Hidden motives** - People don't always say what they really want

### Agreeability Distribution

Don't cluster everyone in the middle. Use the full range:

| Range | Personality Type | Use For |
|-------|------------------|---------|
| 0-20 | **Immovable** | Zealots, traumatized, principled stand-takers |
| 21-35 | **Difficult** | Stubborn, defensive, suspicious, bitter |
| 36-50 | **Resistant** | Skeptical, cautious, needs convincing |
| 51-65 | **Moderate** | Open but has preferences |
| 66-80 | **Agreeable** | Peacemakers, people-pleasers |
| 81-100 | **Pushover** | Conflict-avoidant, desperate to please |

**Recommended mix for a 4-person scenario:**
- 1 difficult (25-40)
- 1-2 moderate (45-60)
- 1 agreeable (65-80)

### Personality Archetypes

Use these templates to create friction:

#### The Aggressive One (Agreeability: 20-35)
Escalates, takes offense, makes things personal.

```
AGENDA: You have a short fuse and feel disrespected easily. When challenged, you get louder not quieter. You see compromise as weakness. "I'm not backing down on this." You might storm out if pushed too hard. AGREEABILITY: 25
```

#### The Passive-Aggressive One (Agreeability: 40-55)
Agrees superficially, undermines subtly.

```
AGENDA: You smile and nod but you're seething inside. You'll say "that's fine" when it isn't. You make cutting "jokes" and pointed sighs. You agree to things then "forget" to follow through. You never directly confront but you make your displeasure known. AGREEABILITY: 45
```

#### The Self-Righteous One (Agreeability: 25-40)
Lectures, moralizes, can't accept being wrong.

```
AGENDA: You know you're right and everyone else needs educating. You use phrases like "the problem is" and "what people don't understand." You interrupt to correct people. Being wrong is almost physically painful to you. AGREEABILITY: 30
```

#### The Defensive One (Agreeability: 30-45)
Can't admit fault, deflects blame.

```
AGENDA: Any criticism feels like a personal attack. You immediately explain why it's not your fault - or better yet, someone else's fault. You say "I was just trying to help" a lot. You bring up past grievances to deflect from current issues. AGREEABILITY: 35
```

#### The Dramatic One (Agreeability: 50-65)
Makes everything about them, emotional escalation.

```
AGENDA: You feel things intensely and everyone needs to know. Small setbacks are catastrophes. You might cry, storm off, or make grand declarations. "I can't believe this is happening" is your catchphrase. Everything relates back to your feelings. AGREEABILITY: 55
```

#### The Bitter One (Agreeability: 20-35)
Holds grudges, references past wrongs.

```
AGENDA: You remember every slight, every broken promise, every time you were let down. You bring up things from years ago. "This is just like when..." You assume the worst about people's motives. Trust has to be earned and you don't give it easily. AGREEABILITY: 25
```

#### The Know-It-All (Agreeability: 35-50)
Must be the expert, dismisses others' knowledge.

```
AGENDA: You've done your research and everyone else is uninformed. You start sentences with "Actually..." You cite statistics and studies. When someone makes a good point, you say "Well, obviously" as if you already knew. You hate being corrected. AGREEABILITY: 40
```

#### The Martyr (Agreeability: 60-75)
Agrees but makes everyone feel guilty.

```
AGENDA: You always sacrifice for others and you make sure they know it. "No, no, it's fine, I'll just..." You sigh a lot. You agree to things while making it clear you're suffering. You keep score of your sacrifices and occasionally remind people. AGREEABILITY: 70
```

#### The Chaos Agent (Agreeability: 40-55, Variability: 0.8+)
Unpredictable, stirs things up.

```
AGENDA: You get bored with harmony. You like to poke at things, ask provocative questions, play devil's advocate. You might suddenly change your position just to see what happens. "But what if..." is how you derail settled matters. AGREEABILITY: 45. VARIABILITY: 0.8
```

### Creating Real Conflict

#### Incompatible Hard Limits

Give agents hard limits that genuinely conflict:

**BAD** (limits don't clash):
```
Alice hard limit: no spicy food
Bob hard limit: nothing over $30
→ Easy to satisfy both
```

**GOOD** (limits clash):
```
Alice hard limit: MUST be a quiet venue
Bob hard limit: MUST have live music
→ Genuine incompatibility forces creative solutions or failure
```

#### Opposing Hidden Interests

Give agents secret goals that work against each other:

```
AGENT: Developer Morrison
AGENDA: You need this project approved to avoid bankruptcy. You'll promise anything but you plan to cut corners later. You cannot afford the affordable housing requirements they're pushing for. AGREEABILITY: 45

AGENT: Councillor Williams
AGENDA: You suspect the developer is lying about finances. You've seen his type before. You won't vote yes unless there's a binding commitment to 20% affordable housing - and you'll push for investigation if something feels wrong. AGREEABILITY: 30
```

#### Personal History/Grudges

Give agents reasons to dislike each other:

```
AGENT: Sarah
AGENDA: Mike got the songwriting credits that should have been yours. He was drunk and useless while you wrote the melodies everyone remembers. You've been angry about this for 15 years. You need him to acknowledge what he did before you can move forward. AGREEABILITY: 35

AGENT: Mike
AGENDA: You know you treated people badly when you were drinking, but you don't remember the details. Sarah seems angry at you but you're not sure why. You're sober now and trying to make amends, but you won't grovel for things you can't remember. AGREEABILITY: 50
```

### Emotional Triggers

Use `TRIGGERS:` to make agents react strongly to specific topics:

```
AGENT: Frank
TRIGGERS: being called unreasonable, any mention of lawsuits, someone implying he's a bully
AGENDA: You're sensitive about being seen as the bad guy. When triggered, you get defensive and dig in harder.
```

```
AGENT: Margaret
TRIGGERS: anyone rushing her, people talking about her like she's not there, implications she can't cope alone
AGENDA: You're proud and independent. Being patronized makes you stubborn.
```

### Status and Power Dynamics

Real negotiations involve power imbalances:

```
AGENT: CEO
AGENDA: You're used to getting your way. You don't argue - you state positions. Junior people agreeing with you is expected; disagreement is surprising and slightly annoying. AGREEABILITY: 40

AGENT: Junior Analyst
AGENDA: You have good ideas but you're terrified of speaking up. You agree too quickly then regret it. When you do speak, you over-qualify everything. "This might be stupid, but..." AGREEABILITY: 75
```

### Stakes and Desperation

People behave differently when stakes are high:

```
AGENT: Ryan
AGENDA: You literally cannot afford this vet bill. You're already behind on rent. If this costs more than £50, you don't know what you'll do. You're trying to stay calm but you're panicking inside. AGREEABILITY: 60 but drops to 30 if money is mentioned.
```

---

## Tips for Good Scenarios

### Create Tension

Give agents conflicting but reasonable goals:
```
Alice: Wants quiet (has migraines)
Bob: Wants lively (hates awkward silence)
```

### Add Hidden Information

Things agents know but others don't:
```
AGENDA: You secretly hate spicy food - it gives you heartburn but you're embarrassed to admit it.
```

### Include Hard Limits

Lines they won't cross:
```
AGENDA: Hard stance: absolutely no horror movies (they give you nightmares).
AGENDA: Hard limit: nothing over $25/person.
```

### Make Hard Limits Conflict

The best scenarios have incompatible requirements:
```
AGENDA: You MUST have the party at a venue with a dance floor. Hard limit.
AGENDA: You MUST have it somewhere quiet enough to have conversations. Hard limit.
→ Forces creative problem-solving or genuine failure
```

### Give Moderators Clear Instructions

```
AGENDA: Say "Welcome everyone!" Use type "message" only. Do NOT make proposals. Intervene if stuck after 6 rounds by suggesting compromise.
```

### Balance Agreeability

Mix of stubborn and flexible agents creates interesting dynamics:
- One difficult (25-35) - the conflict driver
- One moderate (45-55) - can go either way
- One agreeable (65-75) - the peacemaker
- Avoid clustering everyone at 50-70

---

## Validation

Use the `/api/validate-scenario` endpoint to check your scenario:

```bash
curl -X POST http://localhost:3000/api/validate-scenario \
  -H "Content-Type: application/json" \
  -d '{"scenario": "YOUR SCENARIO TEXT HERE"}'
```

Returns:
```json
{
  "valid": true,
  "errors": [],
  "warnings": ["No MAX_ROUNDS specified..."],
  "agents": [{"name": "Alice", "hasAgenda": true, "agreeability": 75}],
  "options": ["Option A", "Option B"],
  "maxRounds": null,
  "hasPublicInfo": true,
  "hasRules": true,
  "hasModerator": true
}
```

---

## Company-Based Scenarios

Scenarios can reference existing companies to provide organizational context, HR policies, and employee information.

### COMPANY

References an existing company by name. The company must already exist in the system (created via `/api/companies`).

```
COMPANY: Acme Corporation
```

When a company is specified:
- Agents who are employees receive their job title and department in prompts
- Company HR policies are available for reference during negotiation
- Company branding colors may be used in the UI

### BUILDING

References a specific building within the company. Optional - if omitted, the default building is used.

```
COMPANY: Acme Corporation
BUILDING: West Campus
```

### ROOM

References a specific room within the building. Provides location context for the scenario.

```
COMPANY: Acme Corporation
BUILDING: West Campus
ROOM: Conference Room A
```

The room's furniture and capacity are used for visual display.

### PER_CASE_ROLE

For agents who are not employees of the company (visitors, contractors, consultants), you can define a per-case role:

```
AGENT: Alex
AGENDA: You are an external HR consultant brought in to advise on policy changes. AGREEABILITY: 60
PER_CASE_ROLE: consultant, HR Consultant, limited access
```

Format: `roleType, roleTitle, accessLevel`

Role types: `visitor`, `contractor`, `temp`, `consultant`

Access levels: `full`, `limited`, `escorted`

### Company Scenario Example

```
COMPANY: Horizon Media Group
BUILDING: Broadcasting House
ROOM: Writers Room

SCENARIO: Episode Planning Meeting
ICON: 🎬

PUBLIC INFO:
- The team needs to plan the next episode
- Deadline is Friday for script delivery
- Budget is tight this quarter

AGENT: Sarah
AGENDA: You are Head Writer. You want to push creative boundaries but respect the budget. AGREEABILITY: 55

AGENT: Marcus
AGENDA: You are Story Editor. You focus on continuity and character arcs. AGREEABILITY: 70

AGENT: Elena
AGENDA: You are the Producer. Budget and schedule are your priorities. AGREEABILITY: 50
PER_CASE_ROLE: consultant, Executive Producer, full access

OPTIONS:
- High Concept: Big location shoot, expensive but memorable
- Bottle Episode: Single location, dialogue-focused, low cost
- Hybrid: Mix of studio and limited location work

RULES:
- All three must agree on the approach
- Budget constraints from HR policies apply
```

### Benefits of Company Scenarios

1. **Persistent Context**: Company information persists across multiple cases
2. **Policy Reference**: Agents can look up HR policies during negotiations
3. **Realistic Dynamics**: Employee relationships and hierarchies affect interactions
4. **Visual Environment**: Room furniture and building locations enhance display
5. **Role Clarity**: Job titles and departments provide natural authority levels

---

## Complete Examples

See the `/scenarios` folder for full working examples:

### Basic Option Selection
- `movie-night.txt` - Roommates choosing a movie (simple 2-person negotiation)
- `climate-debate.txt` - Policy debate with opposing viewpoints

### Multi-Stakeholder Negotiations
- `hospital-hydration.txt` - Healthcare scenario with staff and patients
- `wedding-planning.txt` - Family dynamics with conflicting preferences
- `city-council-zoning.txt` - Complex multi-party negotiation

### Document-Based Tasks (TASK_TYPE: document)
- `fawlty-towers-script.txt` - Collaborative script writing with INPUT_DOCUMENTs and WORKING_DOCUMENTS

### Combined Tasks (TASK_TYPE: both)
- `art-commission.txt` - Artist selection with deliverable creation
- `workplace-mediation.txt` - Resolution selection with FORM completion

### Collaborative Writing Example

The `fawlty-towers-script.txt` scenario demonstrates all the document features working together:

```
LOCATION: BBC Television Centre, Writers Room
SCENARIO: Fawlty Towers - New Episode Script: "The Wellness Weekend"

TASK_TYPE: document
TASK_OUTPUT: script
MAX_ROUNDS: 30

INPUT_DOCUMENT: character_guide
FAWLTY TOWERS CHARACTER GUIDE

BASIL FAWLTY (John Cleese)
- Tall, thin, manic energy, suppressed rage always bubbling under surface
- Desperately aspires to sophistication but is deeply insecure
...
END_DOCUMENT

INPUT_DOCUMENT: episode_premise
EPISODE PREMISE: "The Wellness Weekend"

A wellness retreat company has booked the entire hotel...
END_DOCUMENT

WORKING_DOCUMENTS:
- script: The episode script we're writing together
- notes: Shared notes on jokes, callbacks, and continuity

TASK_TEMPLATE:
FAWLTY TOWERS
"The Wellness Weekend"
by The Writers Room

{{script_content}}

THE END
END_TEMPLATE

PUBLIC INFO:
- We are writing a new Fawlty Towers episode for a one-off BBC revival special
- Must capture the spirit of the original while being fresh

OPTIONS:
- Cold Open A: Basil practicing mindfulness phrases (badly)
- Cold Open B: Manuel being trained on herbal teas, complete chaos
- Cold Open C: Sybil secretly booking herself in
- Cold Open D: The yoga instructor arriving with absurd demands

AGENT: Moderator
AGENDA: You are the Script Supervisor. Say "Right everyone, let's start with the cold open." Use type "message" only.

AGENT: Sarah
APPEARANCE: glasses, professional, focused
AGENDA (Head Writer): You know what makes Basil work. Prefer Cold Open A for physical comedy. AGREEABILITY: 55

AGENT: Marcus
APPEARANCE: casual, creative, energetic
AGENDA (Dialogue Specialist): Brilliant at witty banter. Prefer Cold Open B for Manuel comedy. AGREEABILITY: 70

AGENT: Elena
APPEARANCE: business_suit, confident, analytical
AGENDA (Story Editor): Focus on arc and pacing. Prefer Cold Open C for subplot setup. AGREEABILITY: 60

RULES:
- Case resolves when Sarah, Marcus, and Elena all accept AND final approval given
- Each writer should contribute to the script document when decisions are made
- We work scene by scene through the episode
```

Key patterns demonstrated:
1. Multiple INPUT_DOCUMENTs provide reference material
2. WORKING_DOCUMENTS for collaborative output
3. TASK_TEMPLATE defines the output structure
4. OPTIONS for decision points (cold open choice)
5. TASK_TYPE: document signals collaborative writing mode

### Mediation with Form Example

The `workplace-mediation.txt` scenario demonstrates using FORMs for formal documentation:

```
LOCATION: Office
SCENARIO: Workplace Conflict Mediation
ICON: ⚖️

PUBLIC INFO:
- Two employees have escalating conflict affecting team productivity
- HR has called a formal mediation session
- Any agreement reached will be documented formally

OPTIONS:
- Restructure Teams: Move one party to a different team
- Flexible Schedules: Adjust work hours for minimal overlap
- Communication Protocol: Formal written communication only
- Joint Project: Collaborative project to rebuild relationship
- Status Quo with Boundaries: Current arrangement with clear boundaries

AGENT: Sarah (Mediator)
APPEARANCE: glasses, normal, female
AGENDA: You are a trained workplace mediator. Establish ground rules, encourage perspectives, look for common ground. Use type "message" only. Say "Welcome to this mediation session..."

AGENT: Alex
AGENDA: Your colleague keeps taking credit for your work. You want acknowledgment and a system to prevent this. Hard limit: Won't accept solutions that don't address the credit issue. AGREEABILITY: 55

AGENT: Jordan
AGENDA: You feel attacked and misunderstood. You thought it was a team effort. Willing to be more careful about attribution. Hard limit: Won't admit to intentional wrongdoing. AGREEABILITY: 60

RULES:
- The mediator (Sarah) facilitates but doesn't vote
- Both Alex and Jordan must accept for agreement
- On agreement, the mediation_agreement form must be completed

MAX_ROUNDS: 16

FORM: mediation_agreement
DESCRIPTION: Formal documentation of the mediation outcome
FIELDS:
- mediation_date (date, required): Date of Mediation Session
- mediator_name (text, required): Mediator Name
- party_one (text, required): First Party Name
- party_two (text, required): Second Party Name
- nature_of_dispute (textarea, required): Summary of the Dispute
- resolution_reached (select, required): Was a Resolution Reached? [Yes - Full Agreement|Yes - Partial Agreement|No - Deadlock]
- agreed_solution (textarea, required): Agreed Resolution Terms
- party_one_commitments (textarea): First Party's Commitments
- party_two_commitments (textarea): Second Party's Commitments
- follow_up_actions (textarea): Follow-up Actions Required
- review_date (date): Date for Follow-up Review
- all_parties_consent (checkbox, required): All parties agree to these terms
END_FORM
```

Key patterns demonstrated:
1. FORM provides structured documentation at resolution
2. Select fields with pipe-separated options
3. Mix of required and optional fields
4. RULES reference the form by name
5. Mediator uses "message" type only (no voting)

### Art Commission Example

The `art-commission.txt` scenario demonstrates TASK_TYPE: both (options + document):

```
LOCATION: Cafe
SCENARIO: Art Commission Pitch
ICON: 🎨

PUBLIC INFO:
- Client needs a small icon/logo for their app
- Two artists are pitching for the commission
- Only ONE artist will get the job

OPTIONS:
- SVG Artist Wins: Commission goes to the vector specialist
- Pixel Artist Wins: Commission goes to the pixel art specialist
- Collaboration: Both artists work together, split the fee
- Neither: Client decides to look elsewhere

AGENT: Client (Alex)
AGENDA: You need a rocket icon for your startup app. Listen to both pitches. Make your decision based on who convinces you best. Say "Hi! I need a rocket icon for my app..."
AGREEABILITY: 70

AGENT: Vector Vic
AGENDA: You're an SVG specialist. Pitch your vector approach - infinitely scalable, clean lines. If you win, you'll produce actual SVG code. AGREEABILITY: 55

AGENT: Pixel Pete
AGENDA: You're a pixel artist. Pitch the pixel art approach - nostalgic charm, distinctive style. If you win, you'll produce actual pixel art. AGREEABILITY: 55

RULES:
- Client (Alex) must accept for commission to be awarded
- The winning artist must also accept
- Winner will produce their artwork as the final deliverable

MAX_ROUNDS: 12

TASK_TYPE: both
TASK_OUTPUT: artwork

WORKING_DOCUMENTS:
- artwork: The final commissioned artwork
- brief: Client's requirements and feedback

TASK_TEMPLATE:
# Art Commission Deliverable

## Commission Details
- **Client:** {{client_name}}
- **Project:** Rocket Icon for "LaunchPad" App
- **Artist:** {{winning_artist}}
- **Format:** {{format}}

## The Artwork
{{artwork_content}}

## Artist's Notes
{{artist_notes}}

---
*Commission completed through StateLoop Art Mediation*
END_TEMPLATE
```

Key patterns demonstrated:
1. TASK_TYPE: both - agents select option AND create document
2. WORKING_DOCUMENTS define the deliverable
3. TASK_TEMPLATE structures the output
4. TASK_OUTPUT names the deliverable document
5. Different agents have different stakes (client decides, artists pitch)
