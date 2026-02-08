import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type {
  Company,
  CompanyListItem,
  CompanyWithRelations,
  CompanyBuilding,
  CompanyBuildingWithRooms,
  CompanyRoom,
  PolicyCategory,
  CompanyPolicy,
  CompanyPolicyWithCategory,
  CompanyEmployee,
  CaseCompany,
  CaseCompanyContext,
  CaseAgentRole,
  CompanySetupRequest,
  CompanySetupResponse,
  RoomType,
  EmploymentType,
  CaseRoleType,
  AccessLevel,
  CompanySize,
  LocationType
} from '../types/index.js';
import * as storage from '../storage/sqlite.js';

// ============================================
// Company operations
// ============================================

export function createCompany(db: Database.Database, name: string): Company {
  const id = `comp-${uuidv4().slice(0, 8)}`;
  return storage.createCompany(db, id, name);
}

export function getCompany(db: Database.Database, companyId: string): Company | null {
  return storage.getCompany(db, companyId);
}

export function getCompanyByName(db: Database.Database, name: string): Company | null {
  return storage.getCompanyByName(db, name);
}

export function getAllCompanies(db: Database.Database): CompanyListItem[] {
  return storage.getAllCompanies(db);
}

export function updateCompany(
  db: Database.Database,
  companyId: string,
  updates: {
    industry?: string;
    size?: CompanySize;
    description?: string;
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    metadata?: Record<string, unknown>;
  }
): Company | null {
  return storage.updateCompany(db, companyId, updates);
}

export function deleteCompany(db: Database.Database, companyId: string): boolean {
  return storage.deleteCompany(db, companyId);
}

export function getCompanyWithRelations(db: Database.Database, companyId: string): CompanyWithRelations | null {
  return storage.getCompanyWithRelations(db, companyId);
}

// ============================================
// Building operations
// ============================================

export function createBuilding(
  db: Database.Database,
  companyId: string,
  name: string,
  options?: {
    address?: string;
    city?: string;
    country?: string;
    description?: string;
    locationType?: LocationType;
    defaultFurniture?: string[];
  }
): CompanyBuilding {
  const id = `bldg-${uuidv4().slice(0, 8)}`;
  return storage.createBuilding(db, id, companyId, name, options);
}

export function getBuilding(db: Database.Database, buildingId: string): CompanyBuilding | null {
  return storage.getBuilding(db, buildingId);
}

export function getCompanyBuildings(db: Database.Database, companyId: string): CompanyBuilding[] {
  return storage.getCompanyBuildings(db, companyId);
}

export function getBuildingWithRooms(db: Database.Database, buildingId: string): CompanyBuildingWithRooms | null {
  return storage.getBuildingWithRooms(db, buildingId);
}

export function deleteBuilding(db: Database.Database, buildingId: string): boolean {
  return storage.deleteBuilding(db, buildingId);
}

// ============================================
// Room operations
// ============================================

export function createRoom(
  db: Database.Database,
  buildingId: string,
  companyId: string,
  name: string,
  roomType: RoomType,
  options?: {
    floor?: number;
    capacity?: number;
    furniture?: string[];
    description?: string;
  }
): CompanyRoom {
  const id = `room-${uuidv4().slice(0, 8)}`;
  return storage.createRoom(db, id, buildingId, companyId, name, roomType, options);
}

export function getRoom(db: Database.Database, roomId: string): CompanyRoom | null {
  return storage.getRoom(db, roomId);
}

export function getBuildingRooms(db: Database.Database, buildingId: string): CompanyRoom[] {
  return storage.getBuildingRooms(db, buildingId);
}

export function getCompanyRooms(db: Database.Database, companyId: string): CompanyRoom[] {
  return storage.getCompanyRooms(db, companyId);
}

export function deleteRoom(db: Database.Database, roomId: string): boolean {
  return storage.deleteRoom(db, roomId);
}

// ============================================
// Policy Category operations
// ============================================

export function getPolicyCategories(db: Database.Database): PolicyCategory[] {
  return storage.getPolicyCategories(db);
}

export function getPolicyCategory(db: Database.Database, categoryId: string): PolicyCategory | null {
  return storage.getPolicyCategory(db, categoryId);
}

export function getPolicyCategoryByName(db: Database.Database, name: string): PolicyCategory | null {
  return storage.getPolicyCategoryByName(db, name);
}

// ============================================
// Policy operations
// ============================================

export function createPolicy(
  db: Database.Database,
  companyId: string,
  categoryId: string,
  title: string,
  summary: string,
  fullText: string,
  effectiveDate?: string
): CompanyPolicy {
  const id = `pol-${uuidv4().slice(0, 8)}`;
  return storage.createPolicy(db, id, companyId, categoryId, title, summary, fullText, effectiveDate);
}

export function getPolicy(db: Database.Database, policyId: string): CompanyPolicy | null {
  return storage.getPolicy(db, policyId);
}

export function getPolicyWithCategory(db: Database.Database, policyId: string): CompanyPolicyWithCategory | null {
  return storage.getPolicyWithCategory(db, policyId);
}

export function getCompanyPolicies(db: Database.Database, companyId: string): CompanyPolicy[] {
  return storage.getCompanyPolicies(db, companyId);
}

export function getCompanyPoliciesWithCategories(db: Database.Database, companyId: string): CompanyPolicyWithCategory[] {
  return storage.getCompanyPoliciesWithCategories(db, companyId);
}

export function deletePolicy(db: Database.Database, policyId: string): boolean {
  return storage.deletePolicy(db, policyId);
}

// ============================================
// Employee operations
// ============================================

export function createEmployee(
  db: Database.Database,
  companyId: string,
  agentName: string,
  jobTitle: string,
  options?: {
    department?: string;
    managerAgentName?: string;
    startDate?: string;
    employmentType?: EmploymentType;
    officeRoomId?: string;
  }
): CompanyEmployee {
  const id = `emp-${uuidv4().slice(0, 8)}`;
  return storage.createEmployee(db, id, companyId, agentName, jobTitle, options);
}

export function getEmployee(db: Database.Database, employeeId: string): CompanyEmployee | null {
  return storage.getEmployee(db, employeeId);
}

export function getCompanyEmployees(db: Database.Database, companyId: string): CompanyEmployee[] {
  return storage.getCompanyEmployees(db, companyId);
}

export function getEmployeeByAgentName(db: Database.Database, companyId: string, agentName: string): CompanyEmployee | null {
  return storage.getEmployeeByAgentName(db, companyId, agentName);
}

export function getAgentEmployments(db: Database.Database, agentName: string): Array<CompanyEmployee & { companyName: string }> {
  return storage.getAgentEmployments(db, agentName);
}

export function deleteEmployee(db: Database.Database, employeeId: string): boolean {
  return storage.deleteEmployee(db, employeeId);
}

// ============================================
// Case-Company operations
// ============================================

export function associateCaseWithCompany(
  db: Database.Database,
  caseId: string,
  companyId: string,
  buildingId?: string,
  roomId?: string
): CaseCompany {
  const id = `cc-${uuidv4().slice(0, 8)}`;
  return storage.associateCaseWithCompany(db, id, caseId, companyId, buildingId, roomId);
}

export function getCaseCompany(db: Database.Database, caseId: string): CaseCompany | null {
  return storage.getCaseCompany(db, caseId);
}

export function getCaseCompanyContext(db: Database.Database, caseId: string): CaseCompanyContext | null {
  return storage.getCaseCompanyContext(db, caseId);
}

export function deleteCaseCompany(db: Database.Database, caseId: string): boolean {
  return storage.deleteCaseCompany(db, caseId);
}

// ============================================
// Case Agent Role operations
// ============================================

export function createCaseAgentRole(
  db: Database.Database,
  caseId: string,
  participantId: string,
  roleType: CaseRoleType,
  options?: {
    roleTitle?: string;
    department?: string;
    accessLevel?: AccessLevel;
    notes?: string;
  }
): CaseAgentRole {
  const id = `role-${uuidv4().slice(0, 8)}`;
  return storage.createCaseAgentRole(db, id, caseId, participantId, roleType, options);
}

export function getCaseAgentRoles(db: Database.Database, caseId: string): CaseAgentRole[] {
  return storage.getCaseAgentRoles(db, caseId);
}

export function getCaseAgentRole(db: Database.Database, caseId: string, participantId: string): CaseAgentRole | null {
  return storage.getCaseAgentRole(db, caseId, participantId);
}

export function deleteCaseAgentRole(db: Database.Database, roleId: string): boolean {
  return storage.deleteCaseAgentRole(db, roleId);
}

// ============================================
// AI Setup - Bulk entity creation
// ============================================

export function setupCompany(
  db: Database.Database,
  companyId: string,
  request: CompanySetupRequest
): CompanySetupResponse {
  const { setup } = request;
  const counts = {
    buildings: 0,
    rooms: 0,
    policies: 0,
    employees: 0
  };

  // Update company details
  storage.updateCompany(db, companyId, {
    industry: setup.industry,
    size: setup.size,
    description: setup.description,
    primaryColor: setup.primaryColor,
    secondaryColor: setup.secondaryColor
  });

  // Create buildings and rooms
  if (setup.buildings) {
    for (const bldg of setup.buildings) {
      const building = createBuilding(db, companyId, bldg.name, {
        address: bldg.address,
        city: bldg.city,
        country: bldg.country,
        description: bldg.description,
        locationType: bldg.locationType
      });
      counts.buildings++;

      // Create rooms in this building
      if (bldg.rooms) {
        for (const rm of bldg.rooms) {
          createRoom(db, building.id, companyId, rm.name, rm.roomType, {
            floor: rm.floor,
            capacity: rm.capacity,
            furniture: rm.furniture,
            description: rm.description
          });
          counts.rooms++;
        }
      }
    }
  }

  // Create policies
  if (setup.policies) {
    for (const pol of setup.policies) {
      // Find category by name
      let category = getPolicyCategoryByName(db, pol.category);
      if (!category) {
        // Default to first category if not found
        const categories = getPolicyCategories(db);
        category = categories[0];
      }
      if (category) {
        createPolicy(db, companyId, category.id, pol.title, pol.summary, pol.fullText, pol.effectiveDate);
        counts.policies++;
      }
    }
  }

  // Create employees
  if (setup.employees) {
    for (const emp of setup.employees) {
      createEmployee(db, companyId, emp.agentName, emp.jobTitle, {
        department: emp.department,
        managerAgentName: emp.managerAgentName,
        employmentType: emp.employmentType
      });
      counts.employees++;
    }
  }

  const company = getCompanyWithRelations(db, companyId);
  if (!company) {
    throw new Error('COMPANY_NOT_FOUND');
  }

  return {
    company,
    created: counts
  };
}

// ============================================
// Generate Company Setup Prompt
// ============================================

export function generateCompanySetupPrompt(db: Database.Database, companyId: string, baseUrl: string): string | null {
  const company = getCompany(db, companyId);
  if (!company) return null;

  const categories = getPolicyCategories(db);
  const categoryList = categories.map(c => `- ${c.name}: ${c.description}`).join('\n');

  return `
COMPANY SETUP TASK
==================

You are setting up a company for StateLoop scenarios. The company has been created with just a name, and you need to provide the full organizational structure.

COMPANY: ${company.name}

Your task is to create a realistic, detailed company profile including:
1. Company details (industry, size, description, brand colors)
2. Buildings (physical locations with addresses)
3. Rooms in each building (offices, meeting rooms, studios, etc.)
4. HR Policies (using the available policy categories)
5. Key employees (agents who work at this company)

AVAILABLE POLICY CATEGORIES:
${categoryList}

ROOM TYPES: office, meeting_room, break_room, studio, reception, storage, lab, other

LOCATION TYPES (for buildings): hospital, office, school, library, cafe, park, studio, courtroom, outdoor

EMPLOYMENT TYPES: full_time, part_time, contractor

COMPANY SIZES: small, medium, large, enterprise

FURNITURE CATALOG: View at ${baseUrl}/api/furniture (includes office furniture, studio equipment, etc.)

Submit your setup by POSTing to: ${baseUrl}/api/companies/${companyId}/setup

EXPECTED JSON FORMAT:
{
  "setup": {
    "industry": "string - e.g., 'Media & Broadcasting', 'Healthcare', 'Technology'",
    "size": "small | medium | large | enterprise",
    "description": "1-2 paragraph description of the company",
    "primaryColor": "#hex color for branding",
    "secondaryColor": "#hex color for branding",
    "buildings": [
      {
        "name": "Building Name",
        "address": "Street Address",
        "city": "City",
        "country": "Country",
        "description": "Brief description of this building",
        "locationType": "office | studio | etc.",
        "rooms": [
          {
            "name": "Room Name",
            "roomType": "office | meeting_room | studio | etc.",
            "floor": 1,
            "capacity": 8,
            "furniture": ["desk", "office_chair", "whiteboard"],
            "description": "Description of room purpose"
          }
        ]
      }
    ],
    "policies": [
      {
        "category": "Leave",
        "title": "Annual Leave Policy",
        "summary": "Brief 1-2 sentence summary for quick reference",
        "fullText": "Full policy text with sections, rules, and details",
        "effectiveDate": "2024-01-01"
      }
    ],
    "employees": [
      {
        "agentName": "Agent Name",
        "jobTitle": "Head Writer",
        "department": "Comedy",
        "employmentType": "full_time"
      }
    ]
  }
}

GUIDELINES:
- Create 2-4 buildings for enterprise companies, 1-2 for smaller ones
- Include 3-8 rooms per building (mix of offices, meeting rooms, common areas)
- Create at least 3-5 HR policies covering different categories
- Add 4-10 key employees with realistic job titles for the industry
- Use realistic addresses for the company's likely location
- Policies should be detailed enough to reference during negotiations

Submit the complete JSON to proceed.
`.trim();
}

// ============================================
// Build Company Context for Agent Prompts
// ============================================

export function buildCompanyContextForPrompt(
  db: Database.Database,
  caseId: string,
  agentName: string
): string | null {
  const context = getCaseCompanyContext(db, caseId);
  if (!context) return null;

  const lines: string[] = [];
  lines.push('COMPANY CONTEXT:');
  lines.push(`You work at ${context.company.name}${context.company.industry ? ` (${context.company.industry})` : ''}.`);

  // Check if agent is an employee
  const employee = getEmployeeByAgentName(db, context.company.id, agentName);
  if (employee) {
    let roleDesc = `Your role: ${employee.jobTitle}`;
    if (employee.department) {
      roleDesc += ` in ${employee.department} department`;
    }
    lines.push(roleDesc + '.');
  } else {
    // Check for per-case role
    const caseCompany = getCaseCompany(db, caseId);
    if (caseCompany) {
      // We'd need participant ID to look up role - this will be enhanced in routes
    }
  }

  // Location info
  if (context.building || context.room) {
    let location = 'LOCATION: ';
    if (context.building) {
      location += context.building.name;
    }
    if (context.room) {
      location += context.building ? ' - ' : '';
      location += context.room.name;
    }
    lines.push('');
    lines.push(location);
  }

  // Policy summaries
  if (context.policies.length > 0) {
    lines.push('');
    lines.push('AVAILABLE HR POLICIES:');
    for (const policy of context.policies) {
      lines.push(`- ${policy.title}: ${policy.summary}`);
    }
    lines.push('');
    lines.push('(To look up full policy details during conversation, use the policy lookup endpoint)');
  }

  return lines.join('\n');
}
