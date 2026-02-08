import swaggerAutogen from 'swagger-autogen';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const doc = {
  info: {
    title: 'StateLoop API',
    version: '1.0.0',
    description: `Stateless agent orchestration API for multi-party negotiations.

## Core Concepts
- **Cases**: Negotiation sessions with participants and options
- **Participants**: Agents with private agendas
- **Messages**: Proposals, counters, accepts, rejects
- **Working Documents**: Collaborative documents agents can edit
- **Input Documents**: Read-only reference materials

## Agent Workflow
1. GET \`/api/cases/{id}/auto-play\` - Get your task prompt
2. Process the prompt and decide your response
3. POST \`/api/cases/{id}/submit\` - Submit your response
4. Repeat until case resolves

## Documentation Resources
- **API Docs (Swagger UI)**: [/api-docs](/api-docs) - Interactive API documentation
- **Main UI**: [/](/index.html) - Negotiation visualization interface
- **Config**: [/scenarios.html](/scenarios.html) - Scenario browser and agent customizer
- **Companies**: [/companies.html](/companies.html) - Organization management
- **Docs Viewer**: [/docs](/docs) - Markdown documentation browser`,
    contact: {
      name: 'StateLoop'
    }
  },
  servers: [
    {
      url: 'http://localhost:3000/api',
      description: 'Local development server'
    }
  ],
  tags: [
    { name: 'Cases', description: 'Negotiation case management' },
    { name: 'Agent Actions', description: 'Agent task and response handling' },
    { name: 'Documents', description: 'Working and input documents' },
    { name: 'Scenarios', description: 'Scenario files and validation' },
    { name: 'Simulation', description: 'Automated case simulation' },
    { name: 'Agents', description: 'Agent registry and profiles' },
    { name: 'Companies', description: 'Organization management' },
    { name: 'Buildings', description: 'Company building management' },
    { name: 'Rooms', description: 'Building room management' },
    { name: 'Policies', description: 'Company policy management' },
    { name: 'Employees', description: 'Employee management' },
    { name: 'Workflows', description: 'Multi-stage workflow orchestration' },
    { name: 'Goals', description: 'Goal-driven dynamic workflows' },
    { name: 'Admin', description: 'System administration and logging' }
  ],
  components: {
    schemas: {
      Case: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique case identifier' },
          scenario: { type: 'string', description: 'Scenario description text' },
          status: { type: 'string', enum: ['active', 'resolved'], description: 'Case status' },
          outcome: { type: 'string', nullable: true, description: 'Resolution outcome (agreed, failed, etc.)' },
          currentTurn: { type: 'string', nullable: true, description: 'ID of participant whose turn it is' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          resolvedAt: { type: 'string', format: 'date-time', nullable: true }
        }
      },
      Participant: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique participant identifier' },
          name: { type: 'string', description: 'Agent name' },
          preferences: { type: 'object', description: 'Appearance and voice settings' },
          constraints: { type: 'array', items: { type: 'string' } },
          isPayer: { type: 'boolean' },
          agreeability: { type: 'number', minimum: 0, maximum: 100, nullable: true }
        }
      },
      Option: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique option identifier' },
          name: { type: 'string', description: 'Option name' },
          category: { type: 'string' },
          priceRange: { type: 'string' },
          features: { type: 'array', items: { type: 'string' } }
        }
      },
      Message: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          author: { type: 'string', description: 'Participant ID of message author' },
          type: { type: 'string', enum: ['proposal', 'counter', 'accept', 'reject', 'message'] },
          content: { type: 'string', description: 'Message content' },
          thoughts: { type: 'string', nullable: true, description: 'Agent internal reasoning' },
          optionId: { type: 'string', nullable: true, description: 'Referenced option ID' },
          timestamp: { type: 'string', format: 'date-time' }
        }
      },
      CreateCaseRequest: {
        type: 'object',
        required: ['scenario', 'participants'],
        properties: {
          scenario: { type: 'string', description: 'Scenario description text' },
          participants: { type: 'array', items: { type: 'object' }, description: 'Initial participants (can be empty for AI setup)' }
        }
      },
      SubmitRequest: {
        type: 'object',
        required: ['taskId', 'agentId', 'response'],
        properties: {
          taskId: { type: 'string', description: 'Task ID from auto-play prompt' },
          agentId: { type: 'string', description: 'Participant ID submitting response' },
          response: {
            type: 'object',
            required: ['type', 'content'],
            properties: {
              type: { type: 'string', enum: ['proposal', 'counter', 'accept', 'reject', 'message'] },
              content: { type: 'string', description: 'Spoken message content' },
              thoughts: { type: 'string', description: 'Internal reasoning (visible to observers)' },
              optionId: { type: 'string', description: 'Option ID if proposing/accepting' }
            }
          },
          documentUpdates: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                document: { type: 'string' },
                action: { type: 'string', enum: ['append', 'prepend', 'replace', 'replace_section'] },
                content: { type: 'string' },
                section: { type: 'string' }
              }
            }
          }
        }
      },
      SetupRequest: {
        type: 'object',
        required: ['setup', 'firstAgent'],
        properties: {
          setup: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              location: { type: 'object' },
              icon: { type: 'string' },
              taskType: { type: 'string', enum: ['options', 'document', 'both'] },
              maxRounds: { type: 'number' },
              agents: { type: 'array', items: { type: 'object' } },
              options: { type: 'array', items: { type: 'object' } },
              inputDocuments: { type: 'array', items: { type: 'object' } },
              workingDocuments: { type: 'array', items: { type: 'object' } },
              publicInfo: { type: 'string' },
              rules: { type: 'string' }
            }
          },
          firstAgent: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              thoughts: { type: 'string' },
              message: { type: 'string' }
            }
          }
        }
      },
      Company: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          industry: { type: 'string', nullable: true },
          size: { type: 'string', nullable: true },
          description: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      Building: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          companyId: { type: 'string' },
          name: { type: 'string' },
          address: { type: 'string', nullable: true },
          city: { type: 'string', nullable: true },
          locationType: { type: 'string', nullable: true }
        }
      },
      Room: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          buildingId: { type: 'string' },
          companyId: { type: 'string' },
          name: { type: 'string' },
          roomType: { type: 'string' },
          floor: { type: 'number', nullable: true },
          capacity: { type: 'number', nullable: true }
        }
      },
      Policy: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          companyId: { type: 'string' },
          categoryId: { type: 'string' },
          title: { type: 'string' },
          summary: { type: 'string' },
          fullText: { type: 'string' },
          effectiveDate: { type: 'string', nullable: true }
        }
      },
      Employee: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          companyId: { type: 'string' },
          agentName: { type: 'string' },
          jobTitle: { type: 'string' },
          department: { type: 'string', nullable: true },
          employmentType: { type: 'string', nullable: true }
        }
      },
      WorkingDocument: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          caseId: { type: 'string' },
          name: { type: 'string' },
          content: { type: 'string' },
          docType: { type: 'string' },
          lastEditedBy: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      InputDocument: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          caseId: { type: 'string' },
          name: { type: 'string' },
          content: { type: 'string' },
          source: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' }
            }
          }
        }
      },
      ValidationError: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
          details: { type: 'array', items: { type: 'string' } },
          hint: { type: 'string' }
        }
      }
    },
    parameters: {
      CaseId: {
        name: 'id',
        in: 'path',
        required: true,
        description: 'Case ID',
        schema: { type: 'string' }
      },
      CompanyId: {
        name: 'id',
        in: 'path',
        required: true,
        description: 'Company ID',
        schema: { type: 'string' }
      },
      AgentName: {
        name: 'name',
        in: 'path',
        required: true,
        description: 'Agent name',
        schema: { type: 'string' }
      }
    },
    responses: {
      CaseNotFound: {
        description: 'Case not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      CompanyNotFound: {
        description: 'Company not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      ValidationError: {
        description: 'Validation error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ValidationError' }
          }
        }
      }
    }
  }
};

const outputFile = path.resolve(__dirname, '../public/swagger-generated.json');
const endpointsFiles = [path.resolve(__dirname, '../src/api/routes.ts')];

console.log('Generating Swagger documentation...');
console.log('Output file:', outputFile);
console.log('Scanning:', endpointsFiles);

swaggerAutogen({ openapi: '3.0.3' })(outputFile, endpointsFiles, doc)
  .then((result: { success: boolean; data?: object }) => {
    if (result.success) {
      console.log('Swagger documentation generated successfully!');
      console.log('File written to:', outputFile);
    } else {
      console.error('Failed to generate Swagger documentation');
      process.exit(1);
    }
  })
  .catch((error: Error) => {
    console.error('Error generating Swagger documentation:', error);
    process.exit(1);
  });
