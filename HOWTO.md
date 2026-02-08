# StateLoop Getting Started Guide

Welcome to StateLoop! This guide will walk you through everything you need to know to get started, from installation to running your first multi-agent negotiation. We'll explain concepts as we go, so you don't need any prior experience with agent systems.

## What is StateLoop?

StateLoop is a system that lets multiple AI agents have conversations and make decisions together. Imagine you want to simulate a meeting where three coworkers need to agree on a project approach - StateLoop handles all the coordination, turn-taking, and record-keeping so you can focus on defining the scenario.

The "stateless" part means the AI agents don't need to remember anything themselves. Instead, StateLoop keeps track of everything - the conversation history, who said what, and what decisions were made. This makes the system reliable and easy to debug.

## Installation

Before you begin, make sure you have Node.js installed on your computer. You can check by opening a terminal and typing `node --version`. If you see a version number (like v18.0.0), you're good to go. If not, download Node.js from nodejs.org.

### Step 1: Get the Code

If you received StateLoop as a zip file, extract it to a folder on your computer. If you're using git, clone the repository:

```bash
git clone <repository-url>
cd stateLoop
```

### Step 2: Start the Server

Open a terminal in the StateLoop folder and run the startup script:

```bash
./dev-all.sh
```

This script does everything for you:
1. Installs dependencies (if needed)
2. Runs a type check
3. Starts the development server

You'll see URLs displayed showing where to access different parts of the system. Keep this terminal window open - the server needs to keep running while you use StateLoop.

**Alternative:** If you prefer to run steps manually:
```bash
npm install          # Install dependencies
npm run dev          # Start development server
```

### Step 4: Open the Web Interface

Open your web browser and go to:

```
http://localhost:3000
```

You should see the StateLoop interface with a canvas area for visualizing agents and panels for managing cases.

## Understanding the Interface

When you first open StateLoop, you'll see several areas:

**The Map Area (center-left)** - This is where you'll see animated characters representing the AI agents. They'll move around and display speech bubbles when they talk.

**The Conversation Panel (right side)** - Shows the text of what each agent has said, like a chat log.

**The Header Bar (top)** - Contains buttons for creating new cases, accessing configuration, managing companies, and viewing API documentation.

**The Boss Message Panel (below the map)** - Lets you inject messages into the conversation, like a supervisor giving direction.

## Creating Your First Case

A "case" in StateLoop is a negotiation session. Let's create one to see how it works.

### Step 1: Click "New Case"

Click the "New Case" button in the top-right corner. A dialog will appear with a text area.

### Step 2: Write Your Scenario

The text area contains a default scenario. You can modify it or replace it entirely. Here's what the parts mean:

**PUBLIC INFO** - Information that all agents can see. This sets the scene.

**OPTIONS** - The choices the agents will discuss. Each option should have a name and description.

**AGENT sections** - Each AGENT block defines one participant. The AGENDA section contains their private instructions - information only that agent will know.

Here's a simple example:

```
PUBLIC INFO:
Three friends are deciding where to go for dinner.

OPTIONS:
- Pizza Palace: Great pizza, $15 per person, 10 minute walk
- Sushi Spot: Fresh sushi, $30 per person, 5 minute drive
- Taco Town: Mexican food, $12 per person, right next door

AGENT: Alex
AGENDA: You love pizza and you're on a tight budget this week. Try to convince the others, but be friendly about it.
AGREEABILITY: 60

AGENT: Sam
AGENDA: You've been craving sushi all week. You're willing to pay more for quality. You'll compromise if pizza is the only affordable option for your friends.
AGREEABILITY: 50

AGENT: Jordan
AGENDA: You don't have strong preferences about food, but you hate long walks. Try to find common ground between your friends.
AGREEABILITY: 70

RULES:
The case resolves when at least two agents accept the same option.
```

### Step 3: Create the Case

Click "Create Case". StateLoop will parse your scenario, extract the agents and options, and set up the negotiation.

## Running the Negotiation

After creating a case, you have two ways to make the agents talk:

### Option A: Manual Mode (Using the Terminal)

StateLoop can work with any AI that speaks HTTP. The interface shows you curl commands you can copy and run in your terminal. This is useful for testing and debugging.

Look for the "Run Agent" card on the right side. It shows a command like:

```bash
curl http://localhost:3000/api/cases/abc123/auto-play
```

Copy and run this command. It will tell the first agent it's their turn, generate their response, and return what they said. Run it again for the next agent, and so on.

### Option B: Automated Mode (LLM Integration)

For real AI-powered conversations, you'll typically write a script that:

1. Creates a case
2. Calls `/api/cases/{id}/auto-play` to get the current agent's prompt
3. Sends that prompt to an AI (like Claude)
4. Submits the AI's response via `/api/cases/{id}/submit`
5. Repeats until the case resolves

The API documentation at `/api-docs` explains all the endpoints in detail.

## Watching the Conversation

As agents take turns, you'll see:

- Characters moving around the map
- Speech bubbles appearing with their messages
- The conversation log filling up in the side panel
- Agents' internal "thoughts" (if available) in the purple panel

The case continues until the agents reach an agreement or hit the maximum number of rounds.

## Understanding Resolution

A case "resolves" when the agents reach a decision. This happens when:

- One agent accepts another agent's proposal
- All agents agree on the same option
- The moderator (if present) declares a decision

When resolved, you'll see a banner showing "AGREED!" along with what option was selected.

If agents can't agree after many rounds, the case may fail - this is realistic, as not all negotiations succeed!

## Adding Documents

StateLoop supports documents that agents can read and edit during negotiation. There are two types:

**Input Documents** - Read-only reference materials. Agents can see these but can't change them. Good for background information, policies, or data.

**Working Documents** - Collaborative documents that agents can edit. Changes are tracked with version history. Good for drafting agreements, plans, or shared notes.

You can add documents after creating a case using the API, or include them in your scenario definition.

## Using Companies and Organizations

For more complex scenarios, you can set up reusable company structures:

1. Click "Companies" in the header
2. Create a company with buildings, rooms, and employees
3. Define policies (HR rules, guidelines)
4. Reference the company in your scenarios

This is useful for simulating workplace situations where company policies affect the negotiation.

## Exploring the API

StateLoop is API-first, meaning everything you can do in the interface, you can also do programmatically. This is powerful for:

- Building custom interfaces
- Integrating with other tools
- Running automated tests
- Creating complex multi-step workflows

Click "API Docs" in the header to open the interactive Swagger documentation. You can try out any endpoint directly from your browser.

Key endpoint categories:

- **Cases** - Create, read, and manage negotiation sessions
- **Agents** - Work with agent templates and profiles
- **Companies** - Manage organizational structures
- **Workflows** - Chain multiple cases together
- **Scenarios** - Browse and load pre-made scenarios

## Customizing Agent Appearance

Want your agents to look different? Click "Config" in the header to access the scenario editor and agent customizer.

You can configure:
- Age (child, teen, adult, elderly)
- Body type (normal, tall, short, wide)
- Skin tone
- Hair color
- Accessories (glasses, hat, headphones)
- Professional attire (nurse, doctor, business suit)
- Mobility aids (wheelchair, walking stick)

The customizer shows a live preview. Once you're happy, copy the JSON and use it in your scenario's APPEARANCE field.

## Working with Workflows

A workflow chains multiple cases together. For example, a "creative writing" workflow might:

1. Brainstorm ideas (collaborative case with 3 agents)
2. Write a draft (solo case with 1 agent)
3. Review and edit (collaborative case with 2 agents)

Output from one stage becomes input for the next. You define workflows in YAML files in the `workflows/` folder, or use the built-in templates.

## Tips for Writing Good Scenarios

**Give agents conflicting but reasonable goals.** The negotiation is more interesting when agents have different priorities, not when they all want the same thing.

**Include hidden information.** The AGENDA section is private - use it for secrets, constraints, and preferences that the agent shouldn't reveal directly.

**Set appropriate agreeability.** This number (0-100) affects how easily an agent will compromise. Lower numbers mean more stubborn agents.

**Add a moderator.** A moderator agent can facilitate the discussion, keep things on track, and declare decisions. Give them instructions like "Use type message only" so they don't make proposals themselves.

**Keep options balanced.** If one option is obviously better than all others, there's nothing to negotiate.

## Troubleshooting

**The page is blank or shows an error**
- Make sure the server is running (`npm run dev`)
- Check the terminal for error messages
- Try refreshing the page

**Agents aren't talking**
- Check that you've created a case (not just opened the page)
- If using manual mode, run the curl command shown in "Run Agent"
- Check the API logs at the bottom of the page

**The case resolved too quickly**
- Check agent agreeability settings (lower = more stubborn)
- Make sure agents have conflicting goals
- Add more complexity to the scenario

**I see "No case selected"**
- Click on a case in the dropdown, or create a new one

## Next Steps

Now that you understand the basics:

1. **Explore the example scenarios** - Click "Config" and browse the Scenarios tab
2. **Read the API documentation** - Click "API Docs" to see all available endpoints
3. **Try workflows** - Check out the workflow templates for multi-stage processes
4. **Build integrations** - Use the API to connect StateLoop to your own tools

## Getting Help

- **API Reference**: Interactive docs at `/api-docs`
- **Technical Details**: See `DEVELOPMENT.md` for code architecture
- **Scenario Format**: See `SCENARIO_FORMAT.md` for complete syntax
- **System Design**: See `SPECIFICATION.md` for full technical specification

Happy negotiating!
