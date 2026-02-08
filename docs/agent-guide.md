# StateLoop Agent Guide

## Overview

This guide explains how to run AI agents against the StateLoop system. Agents are stateless participants that poll for work, receive context, and submit responses.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        AGENT LOOP                                │
│                                                                  │
│   1. Poll for work ──────────────> GET /next-task               │
│                                          │                       │
│   2. Receive context <───────────────────┘                       │
│      (scenario, history, role)                                   │
│                                                                  │
│   3. Think and decide                                            │
│      (AI generates response)                                     │
│                                                                  │
│   4. Submit response ─────────────> POST /submit                │
│                                          │                       │
│   5. Repeat ──────────────────────<──────┘                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Getting a Task

### Request
```bash
curl "http://localhost:3000/api/cases/CASE_ID/next-task?agentId=person-a"
```

### Response Structure
```json
{
  "caseId": "case-abc123",
  "taskId": "task-xyz789",
  "role": {
    "id": "person-a",
    "name": "Alice",
    "preferences": ["Italian", "Japanese"],
    "constraints": ["budget under $30", "no seafood"],
    "isPayer": true
  },
  "scenario": "Choose an approach for the project",
  "options": [
    {
      "id": "opt-1",
      "name": "Olive Garden",
      "category": "Italian",
      "priceRange": "$$",
      "features": ["vegetarian options"]
    }
  ],
  "conversationHistory": [
    {
      "author": "person-a",
      "authorName": "Alice",
      "type": "proposal",
      "content": "How about Olive Garden?",
      "timestamp": "2024-01-15T10:35:00Z"
    }
  ],
  "instruction": "You are Alice. Review the conversation and respond.",
  "bossMessages": []
}
```

### When There's No Work
If it's not your turn, you'll receive `204 No Content`. Wait and poll again.

## Submitting a Response

### Request
```bash
curl -X POST "http://localhost:3000/api/cases/CASE_ID/submit" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "task-xyz789",
    "agentId": "person-a",
    "response": {
      "type": "proposal",
      "content": "I suggest Olive Garden - it has Italian food and vegetarian options.",
      "optionId": "opt-1"
    }
  }'
```

### Response Types

| Type | Description | optionId |
|------|-------------|----------|
| `proposal` | Suggest an option | Required |
| `counter` | Counter with different option | Required |
| `accept` | Accept current proposal | Optional |
| `reject` | Reject without alternative | Not used |
| `message` | General comment/question | Not used |


## Auto-Play Mode (Recommended)

The simplest way to run agents is using the auto-play endpoint, which handles the full turn cycle automatically:

### Single Turn
```bash
curl -X POST "http://localhost:3000/api/cases/CASE_ID/auto-play"
```

This will:
1. Determine whose turn it is
2. Extract that agent's private agenda
3. Call Claude API to generate a response (if API key configured)
4. Submit the response and advance the turn
5. Return the result

### Run to Completion
```bash
curl -X POST "http://localhost:3000/api/cases/CASE_ID/run?maxRounds=20"
```

This runs auto-play repeatedly until the case resolves or max rounds reached.

**Document Writing:** The `/run` endpoint automatically writes to working documents:
- Proposals → append to `script` document
- Accepts → append to `decisions` document
- Early messages → append to `notes` document

The response log includes `[DOC]` entries showing document updates.

### Automatic Continuation

When you submit a response and the case is still active, the response automatically includes the NEXT agent's prompt:

```
SUBMISSION ACCEPTED
===================
Your message was recorded. Case is still active.

NEXT TURN
=========
YOU ARE: Bob
...
```

This enables Claude to process multiple turns automatically without waiting for user input. Just keep submitting responses until `caseStatus` becomes `"resolved"`.

### Response Format
```
YOU ARE: Alice

YOUR PRIVATE AGENDA (only you know this):
You strongly prefer Italian food. Budget is $30.

OTHER PARTICIPANTS: Bob, Charlie

CONVERSATION SO FAR:
[Previous messages...]

YOUR TASK: Respond to the conversation...
```

---

## Running an Agent with Claude

### Manual Method (Copy-Paste)

1. **Start the StateLoop server**
   ```bash
   npm run dev
   ```

2. **Create a case** (via UI or API)

3. **Get a task** by calling the API:
   ```bash
   curl "http://localhost:3000/api/cases/CASE_ID/next-task?agentId=person-a"
   ```

4. **Give context to Claude** by pasting the response:
   ```
   You are participating in a multi-agent negotiation. Here is your current task:

   [PASTE THE JSON RESPONSE HERE]

   Based on your role, preferences, and the conversation history,
   provide your response in this format:
   {
     "type": "proposal|counter|accept|reject|message",
     "content": "Your message here",
     "optionId": "opt-id (if proposing)"
   }
   ```

5. **Submit Claude's response**:
   ```bash
   curl -X POST "http://localhost:3000/api/cases/CASE_ID/submit" \
     -H "Content-Type: application/json" \
     -d '{
       "taskId": "TASK_ID",
       "agentId": "person-a",
       "response": CLAUDE_RESPONSE_JSON
     }'
   ```

6. **Repeat** for the other agent until resolution

### Automated Method (Script)

Create a script that automates the loop:

```javascript
// agent-runner.js
const AGENT_ID = process.argv[2]; // e.g., "person-a"
const CASE_ID = process.argv[3];
const BASE_URL = "http://localhost:3000/api";

async function runAgent() {
  while (true) {
    // 1. Poll for work
    const taskRes = await fetch(
      `${BASE_URL}/cases/${CASE_ID}/next-task?agentId=${AGENT_ID}`
    );

    if (taskRes.status === 204) {
      console.log("Not my turn, waiting...");
      await sleep(2000);
      continue;
    }

    const task = await taskRes.json();
    console.log("Got task:", task.taskId);

    // 2. Call Claude API (you'd use the Anthropic SDK here)
    const response = await callClaude(task);

    // 3. Submit response
    await fetch(`${BASE_URL}/cases/${CASE_ID}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: task.taskId,
        agentId: AGENT_ID,
        response: response
      })
    });

    console.log("Response submitted");

    // 4. Check if resolved
    const caseRes = await fetch(`${BASE_URL}/cases/${CASE_ID}`);
    const caseData = await caseRes.json();
    if (caseData.status === "resolved") {
      console.log("Case resolved!");
      break;
    }

    await sleep(1000);
  }
}

runAgent();
```

## Prompting Best Practices

### System Prompt Template
```
You are {NAME}, participating in a multi-agent negotiation.

YOUR PROFILE:
- Preferences: {PREFERENCES}
- Constraints: {CONSTRAINTS}

RULES:
1. Stay in character as {NAME}
2. Be collaborative but advocate for your preferences
3. Consider the other participants' constraints
4. Work toward a compromise everyone can accept
5. If you agree, use type "accept"
6. If you disagree, explain why and counter-propose

Respond ONLY with valid JSON in this format:
{
  "type": "proposal|counter|accept|reject|message",
  "content": "Your conversational response",
  "optionId": "option-id (required for proposal/counter)"
}
```

### Good Response Examples

**Proposal:**
```json
{
  "type": "proposal",
  "content": "How about we try Olive Garden? It has Italian food which I love, and they have plenty of vegetarian options for you!",
  "optionId": "opt-1"
}
```

**Counter:**
```json
{
  "type": "counter",
  "content": "I appreciate the suggestion, but Olive Garden is a bit pricey. What about Taco Town instead? It's walking distance and very affordable.",
  "optionId": "opt-3"
}
```

**Accept:**
```json
{
  "type": "accept",
  "content": "You make a good point about the location. Taco Town works for me - they have good vegetarian options too!",
  "optionId": "opt-3"
}
```

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `CASE_NOT_FOUND` | Invalid case ID | Check the case ID |
| `INVALID_AGENT` | Agent not in case | Use correct agent ID |
| `NOT_YOUR_TURN` | Submitted out of turn | Wait for your turn |
| `TASK_EXPIRED` | Task ID outdated | Get a new task first |

### Retry Logic
```javascript
async function submitWithRetry(response, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await submit(response);
      return result;
    } catch (err) {
      if (err.code === "TASK_EXPIRED") {
        // Get fresh task and try again
        const task = await getNextTask();
        response.taskId = task.taskId;
      } else {
        throw err;
      }
    }
  }
}
```

## Tips for Success

1. **Check boss messages**: They may contain hints or urgency indicators
2. **Reference conversation history**: Acknowledge what others said
3. **Explain your reasoning**: Don't just say "no", say why
4. **Be flexible**: Look for creative compromises
5. **Know when to accept**: If a proposal meets your constraints, accept it

## Testing Your Agent

1. Create a test case with known preferences
2. Run your agent against a predictable scenario
3. Check that responses are valid JSON
4. Verify the conversation makes sense
5. Ensure eventual resolution (no infinite loops)

## Debugging

Enable verbose logging:
```bash
DEBUG=stateloop:* npm run dev
```

Check the request log in the UI or via API:
```bash
curl "http://localhost:3000/api/logs?limit=10"
```
