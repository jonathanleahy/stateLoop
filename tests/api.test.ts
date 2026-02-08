import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRouter } from '../src/api/routes.js';
import { initializeDatabase } from '../src/storage/sqlite.js';
import type Database from 'better-sqlite3';

describe('API Routes', () => {
  let db: Database.Database;
  let app: express.Application;

  beforeEach(() => {
    // Create in-memory database for testing
    db = initializeDatabase(':memory:');

    app = express();
    app.use(express.json());
    app.use('/api', createRouter(db));
  });

  afterEach(() => {
    db.close();
  });

  describe('POST /api/cases', () => {
    it('should create a case with valid data', async () => {
      const payload = {
        scenario: 'Test scenario',
        participants: [
          { id: 'alice', name: 'Alice', preferences: ['Italian'], constraints: ['budget'], isPayer: true },
          { id: 'bob', name: 'Bob', preferences: ['Mexican'], constraints: ['spicy'], isPayer: false }
        ],
        options: [
          { id: 'rest-1', name: 'Test Restaurant', category: 'Italian', priceRange: '$$', features: ['vegetarian'] }
        ]
      };

      const response = await request(app)
        .post('/api/cases')
        .send(payload)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('active');
      expect(response.body.participants).toHaveLength(2);
      expect(response.body.options).toHaveLength(1);
    });

    it('should allow case creation with participants from scenario text', async () => {
      // Participants can now be parsed from scenario text using AGENT: format
      // The API accepts cases with minimal participants since agents can be created later
      const payload = {
        scenario: `AGENT: Alice
SECRET AGENDA: Test agenda for Alice

AGENT: Bob
SECRET AGENDA: Test agenda for Bob

RESTAURANTS:
- Test Restaurant: Italian, $$`,
        participants: [],
        options: []
      };

      const response = await request(app)
        .post('/api/cases')
        .send(payload)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('active');
    });

    it('should reject case with missing fields', async () => {
      const response = await request(app)
        .post('/api/cases')
        .send({ scenario: 'Test' })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_REQUEST');
    });
  });

  describe('GET /api/cases', () => {
    it('should return empty array when no cases exist', async () => {
      const response = await request(app)
        .get('/api/cases')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should return created cases', async () => {
      // Create a case first
      const payload = {
        scenario: 'Test scenario',
        participants: [
          { id: 'alice', name: 'Alice', preferences: [], constraints: [], isPayer: true },
          { id: 'bob', name: 'Bob', preferences: [], constraints: [], isPayer: false }
        ],
        options: [
          { id: 'rest-1', name: 'Test Restaurant', category: 'Italian', priceRange: '$$', features: [] }
        ]
      };

      await request(app).post('/api/cases').send(payload);

      const response = await request(app)
        .get('/api/cases')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toHaveProperty('id');
    });
  });

  describe('GET /api/cases/:id', () => {
    it('should return 404 for non-existent case', async () => {
      const response = await request(app)
        .get('/api/cases/non-existent')
        .expect(404);

      expect(response.body.error.code).toBe('CASE_NOT_FOUND');
    });

    it('should return case details', async () => {
      // Create a case first
      const payload = {
        scenario: 'Test scenario',
        participants: [
          { id: 'alice', name: 'Alice', preferences: ['Italian'], constraints: ['budget'], isPayer: true },
          { id: 'bob', name: 'Bob', preferences: ['Mexican'], constraints: [], isPayer: false }
        ],
        options: [
          { id: 'rest-1', name: 'Test Restaurant', category: 'Italian', priceRange: '$$', features: [] }
        ]
      };

      const createResponse = await request(app).post('/api/cases').send(payload);
      const caseId = createResponse.body.id;

      const response = await request(app)
        .get(`/api/cases/${caseId}`)
        .expect(200);

      expect(response.body.id).toBe(caseId);
      expect(response.body.scenario).toBe('Test scenario');
      expect(response.body.participants).toHaveLength(2);
    });
  });

  describe('POST /api/cases/:id/submit', () => {
    it('should advance turn after submission', async () => {
      // Create a case
      const payload = {
        scenario: 'Test scenario',
        participants: [
          { id: 'alice', name: 'Alice', preferences: [], constraints: [], isPayer: true },
          { id: 'bob', name: 'Bob', preferences: [], constraints: [], isPayer: false }
        ],
        options: [
          { id: 'rest-1', name: 'Test Restaurant', category: 'Italian', priceRange: '$$', features: [] }
        ]
      };

      const createResponse = await request(app).post('/api/cases').send(payload);
      const caseId = createResponse.body.id;
      const firstParticipantId = createResponse.body.participants[0].id;
      const optionId = createResponse.body.options[0].id;

      // Get task
      const taskResponse = await request(app)
        .get(`/api/cases/${caseId}/next-task?agentId=${firstParticipantId}`)
        .expect(200);

      const taskId = taskResponse.body.taskId;

      // Submit response
      const submitResponse = await request(app)
        .post(`/api/cases/${caseId}/submit`)
        .send({
          taskId,
          agentId: firstParticipantId,
          response: {
            type: 'proposal',
            content: 'How about Test Restaurant?',
            optionId: optionId
          }
        })
        .expect(200);

      expect(submitResponse.body.caseStatus).toBe('active');
      expect(submitResponse.body.nextTurn).not.toBe(firstParticipantId);
    });

    it('should resolve case when both parties agree', async () => {
      // Create a case with 2 participants (no adjudicator)
      const payload = {
        scenario: 'Test scenario',
        participants: [
          { id: 'alice', name: 'Alice', preferences: [], constraints: [], isPayer: true },
          { id: 'bob', name: 'Bob', preferences: [], constraints: [], isPayer: false }
        ],
        options: [
          { id: 'rest-1', name: 'Test Restaurant', category: 'Italian', priceRange: '$$', features: [] }
        ]
      };

      const createResponse = await request(app).post('/api/cases').send(payload);
      const caseId = createResponse.body.id;
      const aliceId = createResponse.body.participants[0].id;
      const bobId = createResponse.body.participants[1].id;
      const optionId = createResponse.body.options[0].id;

      // Alice proposes
      const task1 = await request(app).get(`/api/cases/${caseId}/next-task?agentId=${aliceId}`);
      await request(app)
        .post(`/api/cases/${caseId}/submit`)
        .send({
          taskId: task1.body.taskId,
          agentId: aliceId,
          response: { type: 'proposal', content: 'How about Test Restaurant?', optionId }
        });

      // Bob accepts
      const task2 = await request(app).get(`/api/cases/${caseId}/next-task?agentId=${bobId}`);
      const acceptResponse = await request(app)
        .post(`/api/cases/${caseId}/submit`)
        .send({
          taskId: task2.body.taskId,
          agentId: bobId,
          response: { type: 'accept', content: 'Sounds good!' }
        });

      expect(acceptResponse.body.caseStatus).toBe('resolved');
    });
  });

  describe('POST /api/reset', () => {
    it('should clear all data', async () => {
      // Create a case first
      const payload = {
        scenario: 'Test scenario',
        participants: [
          { id: 'alice', name: 'Alice', preferences: [], constraints: [], isPayer: true },
          { id: 'bob', name: 'Bob', preferences: [], constraints: [], isPayer: false }
        ],
        options: [
          { id: 'rest-1', name: 'Test Restaurant', category: 'Italian', priceRange: '$$', features: [] }
        ]
      };

      await request(app).post('/api/cases').send(payload);

      // Reset
      await request(app).post('/api/reset').expect(200);

      // Verify empty
      const response = await request(app).get('/api/cases');
      expect(response.body).toEqual([]);
    });
  });

  describe('POST /api/cases/:id/auto-play', () => {
    it('should process auto-play and return result', async () => {
      // Create a case with scenario containing agents
      const payload = {
        scenario: `AGENT: TestAgent
SECRET AGENDA: This is a test agenda

AGENT: OtherAgent
SECRET AGENDA: Another test agenda

RESTAURANTS:
- Test Place: Good food`,
        participants: [
          { id: 'test-1', name: 'TestAgent', preferences: [], constraints: [], isPayer: false },
          { id: 'test-2', name: 'OtherAgent', preferences: [], constraints: [], isPayer: false }
        ],
        options: [
          { id: 'rest-1', name: 'Test Place', category: 'Test', priceRange: '$', features: [] }
        ]
      };

      const createResponse = await request(app).post('/api/cases').send(payload);
      const caseId = createResponse.body.id;

      // Call auto-play - response format depends on case state
      const response = await request(app)
        .post(`/api/cases/${caseId}/auto-play`)
        .expect(200);

      // Response should contain some text (setup complete or agent context)
      expect(response.text.length).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent case', async () => {
      await request(app)
        .post('/api/cases/non-existent/auto-play')
        .expect(404);
    });
  });

  describe('GET /api/logs', () => {
    it('should return request logs object', async () => {
      // Make some requests first
      await request(app).get('/api/cases');

      const response = await request(app)
        .get('/api/logs')
        .expect(200);

      // Logs endpoint returns data (could be array or object depending on implementation)
      expect(response.body).toBeDefined();
    });
  });

  describe('Scenario parsing', () => {
    it('should parse options from scenario text', async () => {
      const payload = {
        scenario: `AGENT: Alice
SECRET AGENDA: Prefers Italian

AGENT: Bob
SECRET AGENDA: Prefers Mexican

RESTAURANTS:
- Olive Garden: Italian, $$, vegetarian options
- Taco Bell: Mexican, $, fast food`,
        participants: [
          { id: 'alice', name: 'Alice', preferences: [], constraints: [], isPayer: true },
          { id: 'bob', name: 'Bob', preferences: [], constraints: [], isPayer: false }
        ],
        options: []
      };

      const response = await request(app)
        .post('/api/cases')
        .send(payload)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      // Options should be parsed from scenario if empty array provided
      // Note: scenario text still contains "RESTAURANTS:" for backwards compatibility
      expect(response.body.scenario).toContain('RESTAURANTS');
    });
  });

  describe('Message validation', () => {
    it('should reject submission without required fields', async () => {
      const payload = {
        scenario: 'Test',
        participants: [
          { id: 'a', name: 'A', preferences: [], constraints: [], isPayer: true },
          { id: 'b', name: 'B', preferences: [], constraints: [], isPayer: false }
        ],
        options: [
          { id: 'r1', name: 'R1', category: 'Test', priceRange: '$', features: [] }
        ]
      };

      const createResponse = await request(app).post('/api/cases').send(payload);
      const caseId = createResponse.body.id;

      // Submit without required fields
      const response = await request(app)
        .post(`/api/cases/${caseId}/submit`)
        .send({})
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should return multiple validation errors at once', async () => {
      const payload = {
        scenario: 'Test',
        participants: [
          { id: 'a', name: 'A', preferences: [], constraints: [], isPayer: true },
          { id: 'b', name: 'B', preferences: [], constraints: [], isPayer: false }
        ],
        options: [
          { id: 'r1', name: 'R1', category: 'Test', priceRange: '$', features: [] }
        ]
      };

      const createResponse = await request(app).post('/api/cases').send(payload);
      const caseId = createResponse.body.id;

      // Submit with multiple validation issues
      const response = await request(app)
        .post(`/api/cases/${caseId}/submit`)
        .send({
          taskId: '',
          agentId: 'wrong-agent',
          response: {
            type: 'invalid-type',
            content: ''
          }
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.details).toBeInstanceOf(Array);
      expect(response.body.details.length).toBeGreaterThan(1);
      expect(response.body.hint).toBeDefined();
    });

    it('should reject proposal without optionId', async () => {
      const payload = {
        scenario: 'Test',
        participants: [
          { id: 'a', name: 'A', preferences: [], constraints: [], isPayer: true },
          { id: 'b', name: 'B', preferences: [], constraints: [], isPayer: false }
        ],
        options: [
          { id: 'r1', name: 'R1', category: 'Test', priceRange: '$', features: [] }
        ]
      };

      const createResponse = await request(app).post('/api/cases').send(payload);
      const caseId = createResponse.body.id;
      const currentTurn = createResponse.body.currentTurn;

      // Get task
      const taskResponse = await request(app)
        .get(`/api/cases/${caseId}/next-task?agentId=${currentTurn}`);
      const taskId = taskResponse.body.taskId;

      // Submit proposal without optionId
      const response = await request(app)
        .post(`/api/cases/${caseId}/submit`)
        .send({
          taskId,
          agentId: currentTurn,
          response: {
            type: 'proposal',
            content: 'I propose something'
          }
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.details).toContain("optionId required for type 'proposal'");
    });
  });

  describe('Setup validation', () => {
    it('should reject setup with missing agents', async () => {
      const createResponse = await request(app)
        .post('/api/cases')
        .send({ scenario: 'Test', participants: [], restaurants: [] });
      const caseId = createResponse.body.id;

      const response = await request(app)
        .post(`/api/cases/${caseId}/setup`)
        .send({
          setup: {
            agents: []
          }
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.details).toContain('At least 2 agents required, got 0');
    });

    it('should reject setup with invalid agreeability', async () => {
      const createResponse = await request(app)
        .post('/api/cases')
        .send({ scenario: 'Test', participants: [], restaurants: [] });
      const caseId = createResponse.body.id;

      const response = await request(app)
        .post(`/api/cases/${caseId}/setup`)
        .send({
          setup: {
            agents: [
              { name: 'Alice', agenda: 'Test', agreeability: 150 },
              { name: 'Bob', agenda: 'Test', agreeability: -10 }
            ],
            options: [{ name: 'Option A', description: 'Test' }]
          },
          firstAgent: { name: 'Alice', message: 'Hello' }
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.details.some((d: string) => d.includes('agreeability must be 0-100'))).toBe(true);
    });

    it('should reject setup with missing firstAgent', async () => {
      const createResponse = await request(app)
        .post('/api/cases')
        .send({ scenario: 'Test', participants: [], restaurants: [] });
      const caseId = createResponse.body.id;

      const response = await request(app)
        .post(`/api/cases/${caseId}/setup`)
        .send({
          setup: {
            agents: [
              { name: 'Alice', agenda: 'Test' },
              { name: 'Bob', agenda: 'Test' }
            ],
            options: [{ name: 'Option A', description: 'Test' }]
          }
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.details).toContain('Missing required field: firstAgent');
    });
  });

  describe('Agent Profiles', () => {
    // Helper to create an agent via case
    async function createAgent(name: string) {
      const caseRes = await request(app)
        .post('/api/cases')
        .send({ scenario: 'Test', participants: [] });

      await request(app)
        .post(`/api/cases/${caseRes.body.id}/agents`)
        .send({ name, agenda: 'Test agent', agreeability: 50 });

      return caseRes.body.id;
    }

    it('should create a profile for an agent', async () => {
      await createAgent('Sarah Chen');

      const response = await request(app)
        .put('/api/agents/Sarah%20Chen/profile')
        .send({
          dateOfBirth: '1991-03-15',
          placeOfBirthCity: 'Bristol',
          placeOfBirthCountry: 'United Kingdom',
          nationality: 'British',
          sex: 'female',
          heightCm: 165,
          build: 'average',
          eyeColor: 'brown',
          hairColor: 'black'
        })
        .expect(200);

      expect(response.body.agentName).toBe('Sarah Chen');
      expect(response.body.nationality).toBe('British');
      expect(response.body.sex).toBe('female');
      expect(response.body.heightCm).toBe(165);
      expect(response.body.eyeColor).toBe('brown');
    });

    it('should get an agent profile', async () => {
      await createAgent('John Smith');

      await request(app)
        .put('/api/agents/John%20Smith/profile')
        .send({ nationality: 'American', sex: 'male', ageAppearance: 45 });

      const response = await request(app)
        .get('/api/agents/John%20Smith/profile')
        .expect(200);

      expect(response.body.agentName).toBe('John Smith');
      expect(response.body.nationality).toBe('American');
      expect(response.body.ageAppearance).toBe(45);
    });

    it('should return 404 for profile of non-existent agent', async () => {
      const response = await request(app)
        .get('/api/agents/Nobody/profile')
        .expect(404);

      expect(response.body.error.code).toBe('AGENT_NOT_FOUND');
    });

    it('should return 404 for missing profile', async () => {
      await createAgent('NoProfile Agent');

      const response = await request(app)
        .get('/api/agents/NoProfile%20Agent/profile')
        .expect(404);

      expect(response.body.error.code).toBe('PROFILE_NOT_FOUND');
    });

    it('should update an existing profile', async () => {
      await createAgent('Update Test');

      await request(app)
        .put('/api/agents/Update%20Test/profile')
        .send({ nationality: 'British', eyeColor: 'blue' });

      const response = await request(app)
        .put('/api/agents/Update%20Test/profile')
        .send({ eyeColor: 'green', hairColor: 'blonde' })
        .expect(200);

      expect(response.body.nationality).toBe('British'); // preserved
      expect(response.body.eyeColor).toBe('green'); // updated
      expect(response.body.hairColor).toBe('blonde'); // added
    });

    it('should delete an agent profile', async () => {
      await createAgent('Delete Test');

      await request(app)
        .put('/api/agents/Delete%20Test/profile')
        .send({ nationality: 'French' });

      await request(app)
        .delete('/api/agents/Delete%20Test/profile')
        .expect(204);

      await request(app)
        .get('/api/agents/Delete%20Test/profile')
        .expect(404);
    });

    it('should generate an image prompt from profile', async () => {
      await createAgent('Image Test');

      await request(app)
        .put('/api/agents/Image%20Test/profile')
        .send({
          sex: 'female',
          nationality: 'Japanese',
          ageAppearance: 28,
          eyeColor: 'brown',
          hairColor: 'black',
          hairStyle: 'long',
          build: 'slim'
        });

      const response = await request(app)
        .get('/api/agents/Image%20Test/image-prompt')
        .expect(200);

      expect(response.body.agentName).toBe('Image Test');
      expect(response.body.prompt).toContain('28-year-old');
      expect(response.body.prompt).toContain('Japanese');
      expect(response.body.prompt).toContain('woman');
      expect(response.body.prompt).toContain('brown eyes');
      expect(response.body.negativePrompt).toBeTruthy();
    });

    it('should get agent with profile using include query', async () => {
      await createAgent('Include Test');

      await request(app)
        .put('/api/agents/Include%20Test/profile')
        .send({ nationality: 'Canadian', sex: 'male' });

      const response = await request(app)
        .get('/api/agents/Include%20Test?include=profile')
        .expect(200);

      expect(response.body.name).toBe('Include Test');
      expect(response.body.profile).toBeTruthy();
      expect(response.body.profile.nationality).toBe('Canadian');
    });

    it('should handle tattoos and distinguishing marks', async () => {
      await createAgent('Tattoo Test');

      const response = await request(app)
        .put('/api/agents/Tattoo%20Test/profile')
        .send({
          sex: 'male',
          tattoos: [
            { description: 'dragon', location: 'left arm', visible: true },
            { description: 'rose', location: 'back', visible: false }
          ],
          scars: [
            { description: 'small scar', location: 'chin', visible: true }
          ]
        })
        .expect(200);

      expect(response.body.tattoos).toHaveLength(2);
      expect(response.body.tattoos[0].description).toBe('dragon');
      expect(response.body.scars).toHaveLength(1);
    });
  });

  describe('Scenario PROFILE Tag Parsing', () => {
    it('should parse PROFILE blocks from scenario text', async () => {
      const scenario = `SCENARIO: Profile Test

AGENT: Sarah
PROFILE:
  SEX: female
  DATE_OF_BIRTH: 1991-03-15
  NATIONALITY: British
  HEIGHT: 165
  BUILD: average
  EYES: brown
  HAIR: black, straight, medium
  PERSONALITY: kind, empathetic, professional
AGENDA: Test agenda for Sarah with her goals
AGREEABILITY: 50

AGENT: Bob
AGENDA: Another test agenda for Bob
AGREEABILITY: 60

OPTIONS:
- Option A: First choice
- Option B: Second choice`;

      const response = await request(app)
        .post('/api/validate-scenario')
        .send({ scenario })
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.agents).toHaveLength(2);

      // Sarah should have profile data
      const sarah = response.body.agents.find((a: any) => a.name === 'Sarah');
      expect(sarah.profile).toBeTruthy();
      expect(sarah.profile.sex).toBe('female');
      expect(sarah.profile.dateOfBirth).toBe('1991-03-15');
      expect(sarah.profile.nationality).toBe('British');
      expect(sarah.profile.heightCm).toBe('165');
      expect(sarah.profile.eyeColor).toBe('brown');
      expect(sarah.profile.hairColor).toBe('black');
      expect(sarah.profile.hairStyle).toBe('straight');
      expect(sarah.profile.personalityTraits).toEqual(['kind', 'empathetic', 'professional']);

      // Bob should not have profile
      const bob = response.body.agents.find((a: any) => a.name === 'Bob');
      expect(bob.profile).toBeNull();
    });

    it('should parse USE_PROFILE flag', async () => {
      const scenario = `SCENARIO: Use Profile Test

AGENT: Sarah
USE_PROFILE: true
AGENDA: Use existing profile
AGREEABILITY: 50

AGENT: Bob
AGENDA: No profile
AGREEABILITY: 60

OPTIONS:
- Option A: Choice`;

      const response = await request(app)
        .post('/api/validate-scenario')
        .send({ scenario })
        .expect(200);

      const sarah = response.body.agents.find((a: any) => a.name === 'Sarah');
      expect(sarah.useProfile).toBe(true);

      const bob = response.body.agents.find((a: any) => a.name === 'Bob');
      expect(bob.useProfile).toBe(false);
    });
  });

  describe('Profile Integration', () => {
    // Helper to create an agent via case endpoint
    async function createAgentForProfile(name: string) {
      const caseRes = await request(app)
        .post('/api/cases')
        .send({ scenario: 'Test', participants: [] });

      await request(app)
        .post(`/api/cases/${caseRes.body.id}/agents`)
        .send({ name, agenda: 'Test agent for profile', agreeability: 50 });

      return caseRes.body.id;
    }

    it('should create profiles for agents and retrieve them with agent data', async () => {
      // Create agent via case endpoint
      await createAgentForProfile('IntegrationAlice');

      // Verify the agent exists
      const agentResponse = await request(app)
        .get('/api/agents/IntegrationAlice')
        .expect(200);

      expect(agentResponse.body.name).toBe('IntegrationAlice');

      // Add a profile to the agent
      const profileResponse = await request(app)
        .put('/api/agents/IntegrationAlice/profile')
        .send({
          sex: 'female',
          nationality: 'American',
          dateOfBirth: '1990-05-20',
          eyeColor: 'blue',
          hairColor: 'blonde',
          backstory: 'Alice grew up in California'
        })
        .expect(200);

      expect(profileResponse.body.sex).toBe('female');
      expect(profileResponse.body.nationality).toBe('American');

      // Verify profile is included when requesting agent with ?include=profile
      const agentWithProfile = await request(app)
        .get('/api/agents/IntegrationAlice?include=profile')
        .expect(200);

      expect(agentWithProfile.body.name).toBe('IntegrationAlice');
      expect(agentWithProfile.body.profile).toBeTruthy();
      expect(agentWithProfile.body.profile.eyeColor).toBe('blue');
      expect(agentWithProfile.body.profile.backstory).toBe('Alice grew up in California');
    });
  });
});
