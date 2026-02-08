import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  Case,
  CaseWithRelations,
  Participant,
  Option,
  Message,
  BossMessage,
  RequestLog,
  CreateCaseRequest,
  CaseOutcome,
  InputDocument,
  WorkingDocument,
  DocumentEdit,
  AgentCaseHistory,
  TaskType,
  ScenarioSource,
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
  CompanyEmployeeWithRoom,
  CaseCompany,
  CaseCompanyContext,
  CaseAgentRole,
  RoomType,
  EmploymentType,
  CaseRoleType,
  AccessLevel,
  CompanySize,
  LocationType,
  AgentProfile,
  CreateAgentProfileRequest,
  DistinguishingMark,
  JewelryItem,
  Workflow,
  WorkflowWithStages,
  WorkflowStage,
  WorkflowStatus,
  WorkflowStageStatus,
  WorkflowStageType,
  WorkflowProgress,
  WorkflowOutput,
  Goal,
  GoalType,
  GoalStatus,
  GoalPlan,
  FormDefinition,
  CompletedForm
} from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Safe JSON parse helper - returns default value on parse error
function safeJsonParse<T>(json: string | null | undefined, defaultValue: T): T {
  if (!json) return defaultValue;
  try {
    return JSON.parse(json) as T;
  } catch {
    console.warn('Failed to parse JSON, using default:', json?.substring(0, 50));
    return defaultValue;
  }
}

// Migrate legacy 'restaurants' table to 'options'
function migrateRestaurantsToOptions(db: Database.Database): void {
  // Check if old 'restaurants' table exists
  const hasRestaurants = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='restaurants'"
  ).get();

  if (hasRestaurants) {
    console.log('Migrating restaurants table to options...');

    // Create new options table
    db.exec(`
      CREATE TABLE IF NOT EXISTS options (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT,
        price_range TEXT,
        features TEXT,
        FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
      )
    `);

    // Copy data from restaurants to options (cuisine → category)
    db.exec(`
      INSERT OR IGNORE INTO options (id, case_id, name, category, price_range, features)
      SELECT id, case_id, name, cuisine, price_range, features FROM restaurants
    `);

    // Drop old table and index
    db.exec(`DROP TABLE IF EXISTS restaurants`);
    db.exec(`DROP INDEX IF EXISTS idx_restaurants_case`);

    // Create new index
    db.exec(`CREATE INDEX IF NOT EXISTS idx_options_case ON options(case_id)`);

    console.log('Migration complete: restaurants → options');
  }

  // Migrate cases.selected_restaurant_id to selected_option_id
  const casesInfo = db.prepare("PRAGMA table_info(cases)").all() as any[];
  const hasOldColumn = casesInfo.some((col: any) => col.name === 'selected_restaurant_id');
  const hasNewColumn = casesInfo.some((col: any) => col.name === 'selected_option_id');

  if (hasOldColumn && !hasNewColumn) {
    console.log('Migrating cases.selected_restaurant_id to selected_option_id...');
    db.exec(`ALTER TABLE cases RENAME COLUMN selected_restaurant_id TO selected_option_id`);
  }

  // Migrate messages.restaurant_id to option_id
  const messagesInfo = db.prepare("PRAGMA table_info(messages)").all() as any[];
  const hasOldMsgColumn = messagesInfo.some((col: any) => col.name === 'restaurant_id');
  const hasNewMsgColumn = messagesInfo.some((col: any) => col.name === 'option_id');

  if (hasOldMsgColumn && !hasNewMsgColumn) {
    console.log('Migrating messages.restaurant_id to option_id...');
    db.exec(`ALTER TABLE messages RENAME COLUMN restaurant_id TO option_id`);
  }
}

export function initializeDatabase(dbPath?: string): Database.Database {
  const actualPath = dbPath || process.env.DATABASE_PATH || path.join(__dirname, '../../stateloop.db');
  const db = new Database(actualPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create tables with new schema (options instead of restaurants)
  db.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      scenario TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      current_turn TEXT,
      outcome TEXT,
      selected_option_id TEXT,
      resolution_summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      name TEXT NOT NULL,
      preferences TEXT,
      constraints TEXT,
      is_payer INTEGER DEFAULT 0,
      -- Persona attributes
      background TEXT,
      origin TEXT,
      speech TEXT,
      -- Core trait scores (0-100)
      agreeability INTEGER,
      intelligence TEXT,
      patience INTEGER,
      confidence INTEGER,
      empathy INTEGER,
      assertiveness INTEGER,
      -- Additional trait scores
      honesty INTEGER,
      trust INTEGER,
      risk_tolerance INTEGER,
      stress_tolerance INTEGER,
      status_awareness INTEGER,
      energy INTEGER,
      -- Behavioral modifiers
      humor TEXT,
      personality TEXT,
      variability REAL,
      mood TEXT,
      quirks TEXT,
      triggers TEXT,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS options (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      price_range TEXT,
      features TEXT,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      author TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      thoughts TEXT,
      option_id TEXT,
      timestamp TEXT NOT NULL,
      agent_context TEXT,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS boss_messages (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      content TEXT NOT NULL,
      target_agent TEXT,
      read INTEGER DEFAULT 0,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS request_logs (
      id TEXT PRIMARY KEY,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      query_params TEXT,
      body_snippet TEXT,
      status_code INTEGER,
      duration_ms INTEGER,
      case_id TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      appearance TEXT,
      agenda TEXT,
      agreeability INTEGER,
      scenario_source TEXT,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_participants_case ON participants(case_id);
    CREATE INDEX IF NOT EXISTS idx_options_case ON options(case_id);
    CREATE INDEX IF NOT EXISTS idx_messages_case ON messages(case_id);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_boss_messages_case ON boss_messages(case_id);
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON request_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_logs_case ON request_logs(case_id);
    CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);

    -- Input documents provided as context to a case
    CREATE TABLE IF NOT EXISTS case_input_documents (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT DEFAULT 'inline',
      created_at TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    );

    -- Shared working documents agents collaborate on
    CREATE TABLE IF NOT EXISTS case_working_documents (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT DEFAULT '',
      doc_type TEXT DEFAULT 'freeform',
      template TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_edited_by TEXT,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    );

    -- History of edits to working documents
    CREATE TABLE IF NOT EXISTS document_edits (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      agent_id TEXT,
      agent_name TEXT,
      edit_type TEXT NOT NULL,
      previous_content TEXT,
      new_content TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES case_working_documents(id) ON DELETE CASCADE,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    );

    -- Images created by agents (SVG, etc.)
    CREATE TABLE IF NOT EXISTS case_images (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'image/svg+xml',
      width INTEGER,
      height INTEGER,
      format TEXT NOT NULL DEFAULT 'svg',
      generated_by TEXT,
      prompt TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
      FOREIGN KEY (generated_by) REFERENCES participants(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_case_images_case ON case_images(case_id);
    CREATE INDEX IF NOT EXISTS idx_case_images_name ON case_images(case_id, name);

    -- History of edits to images
    CREATE TABLE IF NOT EXISTS image_edits (
      id TEXT PRIMARY KEY,
      image_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      agent_id TEXT,
      agent_name TEXT,
      edit_type TEXT NOT NULL,
      content_before TEXT,
      content_after TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (image_id) REFERENCES case_images(id) ON DELETE CASCADE,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_image_edits_image ON image_edits(image_id);

    -- Agent participation history
    CREATE TABLE IF NOT EXISTS agent_case_history (
      id TEXT PRIMARY KEY,
      agent_name TEXT NOT NULL,
      case_id TEXT NOT NULL,
      participant_id TEXT,
      scenario TEXT,
      role_summary TEXT,
      outcome TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_input_docs_case ON case_input_documents(case_id);
    CREATE INDEX IF NOT EXISTS idx_working_docs_case ON case_working_documents(case_id);
    CREATE INDEX IF NOT EXISTS idx_doc_edits_document ON document_edits(document_id);
    CREATE INDEX IF NOT EXISTS idx_doc_edits_case ON document_edits(case_id);
    CREATE INDEX IF NOT EXISTS idx_agent_history_name ON agent_case_history(agent_name);
    CREATE INDEX IF NOT EXISTS idx_agent_history_case ON agent_case_history(case_id);

    -- ============================================
    -- Company Tables
    -- ============================================

    -- Core company table
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      industry TEXT,
      size TEXT,
      description TEXT,
      logo_url TEXT,
      primary_color TEXT,
      secondary_color TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Buildings within a company
    CREATE TABLE IF NOT EXISTS company_buildings (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      country TEXT,
      description TEXT,
      location_type TEXT,
      default_furniture TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    -- Rooms within buildings
    CREATE TABLE IF NOT EXISTS company_rooms (
      id TEXT PRIMARY KEY,
      building_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      room_type TEXT NOT NULL,
      floor INTEGER,
      capacity INTEGER,
      furniture TEXT,
      description TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (building_id) REFERENCES company_buildings(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    -- Policy categories (seeded reference data)
    CREATE TABLE IF NOT EXISTS policy_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      icon TEXT,
      description TEXT
    );

    -- Company HR policies
    CREATE TABLE IF NOT EXISTS company_policies (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      full_text TEXT NOT NULL,
      effective_date TEXT,
      version INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES policy_categories(id)
    );

    -- Permanent employees (agent-company link)
    CREATE TABLE IF NOT EXISTS company_employees (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      job_title TEXT NOT NULL,
      department TEXT,
      manager_agent_name TEXT,
      start_date TEXT,
      employment_type TEXT DEFAULT 'full_time',
      office_room_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (office_room_id) REFERENCES company_rooms(id) ON DELETE SET NULL
    );

    -- Case-company association
    CREATE TABLE IF NOT EXISTS case_companies (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL UNIQUE,
      company_id TEXT NOT NULL,
      building_id TEXT,
      room_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    -- Per-case agent roles (for non-employees)
    CREATE TABLE IF NOT EXISTS case_agent_roles (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      role_type TEXT NOT NULL,
      role_title TEXT,
      department TEXT,
      access_level TEXT DEFAULT 'limited',
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
      FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
    );

    -- Company indexes
    CREATE INDEX IF NOT EXISTS idx_company_buildings_company ON company_buildings(company_id);
    CREATE INDEX IF NOT EXISTS idx_company_rooms_building ON company_rooms(building_id);
    CREATE INDEX IF NOT EXISTS idx_company_rooms_company ON company_rooms(company_id);
    CREATE INDEX IF NOT EXISTS idx_company_policies_company ON company_policies(company_id);
    CREATE INDEX IF NOT EXISTS idx_company_policies_category ON company_policies(category_id);
    CREATE INDEX IF NOT EXISTS idx_company_employees_company ON company_employees(company_id);
    CREATE INDEX IF NOT EXISTS idx_company_employees_agent ON company_employees(agent_name);
    CREATE INDEX IF NOT EXISTS idx_case_companies_case ON case_companies(case_id);
    CREATE INDEX IF NOT EXISTS idx_case_companies_company ON case_companies(company_id);
    CREATE INDEX IF NOT EXISTS idx_case_agent_roles_case ON case_agent_roles(case_id);
    CREATE INDEX IF NOT EXISTS idx_case_agent_roles_participant ON case_agent_roles(participant_id);

    -- ============================================
    -- Agent Profile Tables
    -- ============================================

    -- Extended agent profiles with passport-like identity and physical features
    CREATE TABLE IF NOT EXISTS agent_profiles (
      id TEXT PRIMARY KEY,
      agent_name TEXT NOT NULL UNIQUE,

      -- Passport-like Identity
      date_of_birth TEXT,
      place_of_birth_city TEXT,
      place_of_birth_country TEXT,
      nationality TEXT,
      nationalities TEXT,
      sex TEXT,

      -- Physical Features
      height_cm INTEGER,
      build TEXT,
      skin_tone TEXT,
      eye_color TEXT,
      hair_color TEXT,
      hair_style TEXT,
      hair_length TEXT,
      facial_hair TEXT,
      face_shape TEXT,
      age_appearance INTEGER,

      -- Glasses & Jewelry
      glasses TEXT,
      jewelry TEXT,

      -- Distinguishing Marks
      tattoos TEXT,
      scars TEXT,
      distinguishing_features TEXT,

      -- Clothing Defaults
      clothing_style TEXT,
      primary_clothing_color TEXT,
      secondary_clothing_color TEXT,

      -- Backstory
      backstory TEXT,
      personality_traits TEXT,

      -- Photo/Avatar
      photo_url TEXT,
      photo_prompt TEXT,

      -- Extended data (JSON for additional fields: face details, life history, etc.)
      extended_data TEXT,

      -- Metadata
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,

      FOREIGN KEY (agent_name) REFERENCES agents(name) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_agent_profiles_name ON agent_profiles(agent_name);
  `);

  // Seed policy categories if not present
  const categoryCount = db.prepare('SELECT COUNT(*) as count FROM policy_categories').get() as any;
  if (categoryCount.count === 0) {
    const seedCategories = db.prepare(`
      INSERT INTO policy_categories (id, name, icon, description) VALUES (?, ?, ?, ?)
    `);
    const categories = [
      ['cat-leave', 'Leave', '🏖️', 'Annual leave, sick leave, parental leave'],
      ['cat-conduct', 'Code of Conduct', '📜', 'Professional behavior and ethics'],
      ['cat-grievance', 'Grievance', '⚖️', 'Complaint and dispute resolution'],
      ['cat-benefits', 'Benefits', '💰', 'Health insurance, pension, perks'],
      ['cat-remote', 'Remote Work', '🏠', 'Work from home, flexible working'],
      ['cat-safety', 'Health & Safety', '🦺', 'Workplace safety and wellbeing'],
      ['cat-it', 'IT & Security', '🔒', 'Technology use and data security'],
      ['cat-expenses', 'Expenses', '🧾', 'Reimbursement and spending']
    ];
    for (const cat of categories) {
      seedCategories.run(cat[0], cat[1], cat[2], cat[3]);
    }
  }

  // Add new columns to cases table if they don't exist
  try {
    db.exec(`ALTER TABLE cases ADD COLUMN task_type TEXT`);
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE cases ADD COLUMN task_output TEXT`);
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE cases ADD COLUMN location_type TEXT`);
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE cases ADD COLUMN location_name TEXT`);
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE cases ADD COLUMN location_furniture TEXT`);
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE cases ADD COLUMN scenario_name TEXT`);
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE cases ADD COLUMN scenario_source TEXT`);
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE cases ADD COLUMN form_definition TEXT`);
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE cases ADD COLUMN completed_form TEXT`);
  } catch (e) {
    // Column already exists
  }

  // Add persona columns to participants table
  try {
    db.exec(`ALTER TABLE participants ADD COLUMN background TEXT`);
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE participants ADD COLUMN origin TEXT`);
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE participants ADD COLUMN speech TEXT`);
  } catch (e) {
    // Column already exists
  }

  // Add new trait columns to participants table
  const newParticipantColumns = [
    'intelligence TEXT',
    'patience INTEGER',
    'confidence INTEGER',
    'empathy INTEGER',
    'assertiveness INTEGER',
    'honesty INTEGER',
    'trust INTEGER',
    'risk_tolerance INTEGER',
    'stress_tolerance INTEGER',
    'status_awareness INTEGER',
    'energy INTEGER',
    'humor TEXT',
    'personality TEXT',
    'variability REAL',
    'mood TEXT',
    'quirks TEXT',
    'triggers TEXT'
  ];
  for (const col of newParticipantColumns) {
    try {
      db.exec(`ALTER TABLE participants ADD COLUMN ${col}`);
    } catch (e) {
      // Column already exists
    }
  }

  // Add extended_data column to agent_profiles table
  try {
    db.exec(`ALTER TABLE agent_profiles ADD COLUMN extended_data TEXT`);
  } catch (e) {
    // Column already exists
  }

  // Create workflow and goal tables
  db.exec(`
    -- ============================================
    -- Workflow Tables
    -- ============================================

    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      template_name TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      current_stage_index INTEGER NOT NULL DEFAULT 0,
      inputs TEXT,
      outputs TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS workflow_stages (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      stage_index INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL DEFAULT 'collaborative',
      status TEXT NOT NULL DEFAULT 'pending',
      case_id TEXT,
      agent_count INTEGER NOT NULL DEFAULT 2,
      input_documents TEXT,
      output_document TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_stages_workflow ON workflow_stages(workflow_id);

    -- ============================================
    -- Goal Tables
    -- ============================================

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      objective TEXT NOT NULL,
      constraints TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      workflow_id TEXT,
      plan TEXT,
      output TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_goals_workflow ON goals(workflow_id);

    -- ============================================
    -- Workflow Designer Tables
    -- ============================================

    CREATE TABLE IF NOT EXISTS workflow_designs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      canvas_state TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_design_nodes (
      id TEXT PRIMARY KEY,
      workflow_design_id TEXT NOT NULL,
      scenario_name TEXT NOT NULL,
      label TEXT,
      position_x REAL NOT NULL DEFAULT 0,
      position_y REAL NOT NULL DEFAULT 0,
      case_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      FOREIGN KEY (workflow_design_id) REFERENCES workflow_designs(id) ON DELETE CASCADE,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_design_edges (
      id TEXT PRIMARY KEY,
      workflow_design_id TEXT NOT NULL,
      source_node_id TEXT NOT NULL,
      target_node_id TEXT NOT NULL,
      document_mapping TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (workflow_design_id) REFERENCES workflow_designs(id) ON DELETE CASCADE,
      FOREIGN KEY (source_node_id) REFERENCES workflow_design_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (target_node_id) REFERENCES workflow_design_nodes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_design_nodes_workflow ON workflow_design_nodes(workflow_design_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_design_edges_workflow ON workflow_design_edges(workflow_design_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_design_edges_source ON workflow_design_edges(source_node_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_design_edges_target ON workflow_design_edges(target_node_id);
  `);

  // Run migrations for legacy databases
  migrateRestaurantsToOptions(db);

  return db;
}

// Case operations
export function createCase(db: Database.Database, caseId: string, request: CreateCaseRequest): Case {
  const now = new Date().toISOString();
  // Make IDs case-specific to avoid conflicts
  const firstParticipantId = `${caseId}-${request.participants[0]?.id || 'p0'}`;

  const insertCase = db.prepare(`
    INSERT INTO cases (id, scenario, status, current_turn, created_at, updated_at)
    VALUES (?, ?, 'active', ?, ?, ?)
  `);

  const insertParticipant = db.prepare(`
    INSERT INTO participants (id, case_id, name, preferences, constraints, is_payer)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertOption = db.prepare(`
    INSERT INTO options (id, case_id, name, category, price_range, features)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    insertCase.run(caseId, request.scenario, firstParticipantId, now, now);

    for (const p of request.participants) {
      // Prefix participant ID with case ID to make it unique
      const participantId = `${caseId}-${p.id}`;
      insertParticipant.run(
        participantId,
        caseId,
        p.name,
        JSON.stringify(p.preferences),
        JSON.stringify(p.constraints),
        p.isPayer ? 1 : 0
      );
    }

    // Handle options
    const optionsList = request.options || [];
    for (const opt of optionsList) {
      // Prefix option ID with case ID to make it unique
      const optId = `${caseId}-${opt.id}`;
      insertOption.run(
        optId,
        caseId,
        opt.name,
        (opt as any).category || (opt as any).cuisine || 'Various',
        opt.priceRange,
        JSON.stringify(opt.features)
      );
    }
  });

  transaction();

  return {
    id: caseId,
    scenario: request.scenario,
    scenarioName: null,
    scenarioSource: null,
    status: 'active',
    currentTurn: firstParticipantId,
    outcome: null,
    selectedOptionId: null,
    resolutionSummary: null,
    taskType: null,
    taskOutput: null,
    locationType: null,
    locationName: null,
    locationFurniture: null,
    formDefinition: null,
    completedForm: null,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null
  };
}

export function getCase(db: Database.Database, caseId: string): Case | null {
  const row = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as any;
  if (!row) return null;

  return {
    id: row.id,
    scenarioName: row.scenario_name,
    scenarioSource: row.scenario_source,
    scenario: row.scenario,
    status: row.status,
    currentTurn: row.current_turn,
    outcome: row.outcome,
    selectedOptionId: row.selected_option_id,
    resolutionSummary: row.resolution_summary,
    taskType: row.task_type as any,
    taskOutput: row.task_output,
    locationType: row.location_type as any,
    locationName: row.location_name,
    locationFurniture: safeJsonParse<string[] | null>(row.location_furniture, null),
    formDefinition: safeJsonParse<FormDefinition | null>(row.form_definition, null),
    completedForm: safeJsonParse<CompletedForm | null>(row.completed_form, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at
  };
}

export function getCaseWithRelations(db: Database.Database, caseId: string): CaseWithRelations | null {
  const caseData = getCase(db, caseId);
  if (!caseData) return null;

  const participants = getParticipants(db, caseId);
  const options = getOptions(db, caseId);
  const messages = getMessages(db, caseId);
  const bossMessages = getBossMessages(db, caseId);
  const inputDocuments = getInputDocuments(db, caseId);
  const workingDocuments = getWorkingDocuments(db, caseId);

  return {
    ...caseData,
    participants,
    options,
    messages,
    bossMessages,
    inputDocuments,
    workingDocuments
  };
}

export function getAllCases(db: Database.Database): Case[] {
  const rows = db.prepare('SELECT * FROM cases ORDER BY created_at DESC').all() as any[];
  return rows.map(row => ({
    id: row.id,
    scenario: row.scenario,
    scenarioName: row.scenario_name,
    scenarioSource: row.scenario_source,
    status: row.status,
    currentTurn: row.current_turn,
    outcome: row.outcome,
    selectedOptionId: row.selected_option_id,
    resolutionSummary: row.resolution_summary,
    taskType: row.task_type as any,
    taskOutput: row.task_output,
    locationType: row.location_type as any,
    locationName: row.location_name,
    locationFurniture: safeJsonParse<string[] | null>(row.location_furniture, null),
    formDefinition: safeJsonParse<FormDefinition | null>(row.form_definition, null),
    completedForm: safeJsonParse<CompletedForm | null>(row.completed_form, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at
  }));
}

export function updateCaseTurn(db: Database.Database, caseId: string, nextTurn: string): void {
  const now = new Date().toISOString();
  db.prepare('UPDATE cases SET current_turn = ?, updated_at = ? WHERE id = ?').run(nextTurn, now, caseId);
}

export function resolveCase(
  db: Database.Database,
  caseId: string,
  outcome: CaseOutcome,
  selectedOptionId: string | null,
  summary: string | null
): void {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE cases
    SET status = 'resolved', outcome = ?, selected_option_id = ?, resolution_summary = ?, updated_at = ?, resolved_at = ?
    WHERE id = ?
  `).run(outcome, selectedOptionId, summary, now, now, caseId);
}

export function reopenCase(
  db: Database.Database,
  caseId: string
): void {
  const now = new Date().toISOString();
  // Get participants to set next turn
  const participants = getParticipants(db, caseId);
  const nextTurn = participants.length > 0 ? participants[0].id : null;

  db.prepare(`
    UPDATE cases
    SET status = 'active', outcome = NULL, selected_option_id = NULL, resolution_summary = NULL,
        resolved_at = NULL, current_turn = ?, updated_at = ?
    WHERE id = ?
  `).run(nextTurn, now, caseId);
}

// Participant operations
export function getParticipants(db: Database.Database, caseId: string): Participant[] {
  const rows = db.prepare('SELECT * FROM participants WHERE case_id = ?').all(caseId) as any[];
  return rows.map(row => mapRowToParticipant(row));
}

export function getParticipant(db: Database.Database, participantId: string): Participant | null {
  const row = db.prepare('SELECT * FROM participants WHERE id = ?').get(participantId) as any;
  if (!row) return null;
  return mapRowToParticipant(row);
}

// Helper to map database row to Participant with all traits
function mapRowToParticipant(row: any): Participant {
  return {
    id: row.id,
    caseId: row.case_id,
    name: row.name,
    preferences: safeJsonParse<string[]>(row.preferences, []),
    constraints: safeJsonParse<string[]>(row.constraints, []),
    isPayer: row.is_payer === 1,
    // Core traits
    agreeability: row.agreeability ?? undefined,
    intelligence: row.intelligence ?? undefined,
    patience: row.patience ?? undefined,
    confidence: row.confidence ?? undefined,
    empathy: row.empathy ?? undefined,
    assertiveness: row.assertiveness ?? undefined,
    // Additional traits
    honesty: row.honesty ?? undefined,
    trust: row.trust ?? undefined,
    riskTolerance: row.risk_tolerance ?? undefined,
    stressTolerance: row.stress_tolerance ?? undefined,
    statusAwareness: row.status_awareness ?? undefined,
    energy: row.energy ?? undefined,
    // Behavioral modifiers
    humor: row.humor ?? undefined,
    personality: row.personality ?? undefined,
    variability: row.variability ?? undefined,
    mood: row.mood ?? undefined,
    quirks: row.quirks ?? undefined,
    triggers: row.triggers ?? undefined,
    // Persona
    background: row.background ?? undefined,
    origin: row.origin ?? undefined,
    speech: row.speech ?? undefined
  };
}

// Option operations
export function getOptions(db: Database.Database, caseId: string): Option[] {
  const rows = db.prepare('SELECT * FROM options WHERE case_id = ?').all(caseId) as any[];
  return rows.map(row => ({
    id: row.id,
    caseId: row.case_id,
    name: row.name,
    category: row.category || 'Various',
    priceRange: row.price_range,
    features: safeJsonParse<string[]>(row.features, [])
  }));
}

export function getOption(db: Database.Database, optionId: string): Option | null {
  const row = db.prepare('SELECT * FROM options WHERE id = ?').get(optionId) as any;
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    name: row.name,
    category: row.category || 'Various',
    priceRange: row.price_range,
    features: safeJsonParse<string[]>(row.features, [])
  };
}

// Message operations
export function getMessages(db: Database.Database, caseId: string): Message[] {
  const rows = db.prepare('SELECT * FROM messages WHERE case_id = ? ORDER BY timestamp ASC').all(caseId) as any[];
  return rows.map(row => ({
    id: row.id,
    caseId: row.case_id,
    author: row.author,
    type: row.type,
    content: row.content,
    thoughts: row.thoughts || null,
    optionId: row.option_id,
    timestamp: row.timestamp,
    agentContext: row.agent_context || null
  }));
}

export function addMessage(
  db: Database.Database,
  messageId: string,
  caseId: string,
  author: string,
  type: string,
  content: string,
  optionId: string | null,
  thoughts: string | null = null,
  agentContext: string | null = null
): Message {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO messages (id, case_id, author, type, content, thoughts, option_id, timestamp, agent_context)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(messageId, caseId, author, type, content, thoughts, optionId, now, agentContext);

  // Update case timestamp
  db.prepare('UPDATE cases SET updated_at = ? WHERE id = ?').run(now, caseId);

  return {
    id: messageId,
    caseId,
    author,
    type: type as any,
    content,
    thoughts,
    optionId,
    timestamp: now,
    agentContext
  };
}

// Boss message operations
export function getBossMessages(db: Database.Database, caseId: string, targetAgent?: string): BossMessage[] {
  let query = 'SELECT * FROM boss_messages WHERE case_id = ?';
  const params: any[] = [caseId];

  if (targetAgent) {
    query += ' AND (target_agent IS NULL OR target_agent = ?)';
    params.push(targetAgent);
  }

  query += ' ORDER BY timestamp ASC';

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(row => ({
    id: row.id,
    caseId: row.case_id,
    content: row.content,
    targetAgent: row.target_agent,
    read: row.read === 1,
    timestamp: row.timestamp
  }));
}

export function addBossMessage(
  db: Database.Database,
  messageId: string,
  caseId: string,
  content: string,
  targetAgent: string | null
): BossMessage {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO boss_messages (id, case_id, content, target_agent, read, timestamp)
    VALUES (?, ?, ?, ?, 0, ?)
  `).run(messageId, caseId, content, targetAgent, now);

  return {
    id: messageId,
    caseId,
    content,
    targetAgent,
    read: false,
    timestamp: now
  };
}

// Request log operations
export function addRequestLog(
  db: Database.Database,
  logId: string,
  method: string,
  path: string,
  queryParams: string | null,
  bodySnippet: string | null,
  statusCode: number,
  durationMs: number,
  caseId: string | null
): RequestLog {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO request_logs (id, method, path, query_params, body_snippet, status_code, duration_ms, case_id, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(logId, method, path, queryParams, bodySnippet, statusCode, durationMs, caseId, now);

  return {
    id: logId,
    method,
    path,
    queryParams,
    bodySnippet,
    statusCode,
    durationMs,
    caseId,
    timestamp: now
  };
}

export function getRequestLogs(
  db: Database.Database,
  limit: number = 50,
  offset: number = 0,
  caseId?: string
): { logs: RequestLog[]; total: number } {
  let countQuery = 'SELECT COUNT(*) as count FROM request_logs';
  let query = 'SELECT * FROM request_logs';
  const params: any[] = [];

  if (caseId) {
    countQuery += ' WHERE case_id = ?';
    query += ' WHERE case_id = ?';
    params.push(caseId);
  }

  query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';

  const totalRow = db.prepare(countQuery).get(...params.slice(0, caseId ? 1 : 0)) as any;
  const total = totalRow?.count || 0;

  const rows = db.prepare(query).all(...params, limit, offset) as any[];
  const logs = rows.map(row => ({
    id: row.id,
    method: row.method,
    path: row.path,
    queryParams: row.query_params,
    bodySnippet: row.body_snippet,
    statusCode: row.status_code,
    durationMs: row.duration_ms,
    caseId: row.case_id,
    timestamp: row.timestamp
  }));

  return { logs, total };
}

// Agent operations (global agent registry)
export interface Agent {
  id: string;
  name: string;
  appearance: any;
  agenda: string | null;
  agreeability: number | null;
  scenarioSource: string | null;
  createdAt: string;
  lastUsedAt: string;
}

export function upsertAgent(
  db: Database.Database,
  name: string,
  appearance: any,
  agenda: string | null,
  agreeability: number | null,
  scenarioSource: string | null
): Agent {
  const now = new Date().toISOString();
  const id = `agent-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  // Try to update existing agent
  const existing = db.prepare('SELECT id FROM agents WHERE name = ?').get(name) as any;

  if (existing) {
    db.prepare(`
      UPDATE agents SET appearance = ?, agenda = ?, agreeability = ?, scenario_source = ?, last_used_at = ?
      WHERE name = ?
    `).run(JSON.stringify(appearance), agenda, agreeability, scenarioSource, now, name);
  } else {
    db.prepare(`
      INSERT INTO agents (id, name, appearance, agenda, agreeability, scenario_source, created_at, last_used_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, JSON.stringify(appearance), agenda, agreeability, scenarioSource, now, now);
  }

  return {
    id: existing?.id || id,
    name,
    appearance,
    agenda,
    agreeability,
    scenarioSource,
    createdAt: now,
    lastUsedAt: now
  };
}

export function getAllAgents(db: Database.Database): Agent[] {
  const rows = db.prepare('SELECT * FROM agents ORDER BY last_used_at DESC').all() as any[];
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    appearance: safeJsonParse<Record<string, unknown> | null>(row.appearance, null),
    agenda: row.agenda,
    agreeability: row.agreeability,
    scenarioSource: row.scenario_source,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at
  }));
}

export function getAgentByName(db: Database.Database, name: string): Agent | null {
  const row = db.prepare('SELECT * FROM agents WHERE name = ?').get(name) as any;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    appearance: safeJsonParse<Record<string, unknown> | null>(row.appearance, null),
    agenda: row.agenda,
    agreeability: row.agreeability,
    scenarioSource: row.scenario_source,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at
  };
}

export function deleteAgent(db: Database.Database, name: string): boolean {
  const result = db.prepare('DELETE FROM agents WHERE name = ?').run(name);
  return result.changes > 0;
}

// ============================================
// Input Document operations
// ============================================

export function getInputDocuments(db: Database.Database, caseId: string): InputDocument[] {
  const rows = db.prepare('SELECT * FROM case_input_documents WHERE case_id = ? ORDER BY created_at ASC').all(caseId) as any[];
  return rows.map(row => ({
    id: row.id,
    caseId: row.case_id,
    name: row.name,
    content: row.content,
    source: row.source as InputDocument['source'],
    createdAt: row.created_at
  }));
}

export function getInputDocument(db: Database.Database, caseId: string, name: string): InputDocument | null {
  const row = db.prepare('SELECT * FROM case_input_documents WHERE case_id = ? AND name = ?').get(caseId, name) as any;
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    name: row.name,
    content: row.content,
    source: row.source as InputDocument['source'],
    createdAt: row.created_at
  };
}

export function addInputDocument(
  db: Database.Database,
  docId: string,
  caseId: string,
  name: string,
  content: string,
  source: InputDocument['source'] = 'inline'
): InputDocument {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO case_input_documents (id, case_id, name, content, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(docId, caseId, name, content, source, now);

  return {
    id: docId,
    caseId,
    name,
    content,
    source,
    createdAt: now
  };
}

export function deleteInputDocument(db: Database.Database, caseId: string, name: string): boolean {
  const result = db.prepare('DELETE FROM case_input_documents WHERE case_id = ? AND name = ?').run(caseId, name);
  return result.changes > 0;
}

// ============================================
// Working Document operations
// ============================================

export function getWorkingDocuments(db: Database.Database, caseId: string): WorkingDocument[] {
  const rows = db.prepare('SELECT * FROM case_working_documents WHERE case_id = ? ORDER BY created_at ASC').all(caseId) as any[];
  return rows.map(row => ({
    id: row.id,
    caseId: row.case_id,
    name: row.name,
    content: row.content || '',
    docType: row.doc_type as WorkingDocument['docType'],
    template: row.template,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastEditedBy: row.last_edited_by
  }));
}

export function getWorkingDocument(db: Database.Database, caseId: string, name: string): WorkingDocument | null {
  const row = db.prepare('SELECT * FROM case_working_documents WHERE case_id = ? AND name = ?').get(caseId, name) as any;
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    name: row.name,
    content: row.content || '',
    docType: row.doc_type as WorkingDocument['docType'],
    template: row.template,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastEditedBy: row.last_edited_by
  };
}

export function getWorkingDocumentById(db: Database.Database, docId: string): WorkingDocument | null {
  const row = db.prepare('SELECT * FROM case_working_documents WHERE id = ?').get(docId) as any;
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    name: row.name,
    content: row.content || '',
    docType: row.doc_type as WorkingDocument['docType'],
    template: row.template,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastEditedBy: row.last_edited_by
  };
}

export function createWorkingDocument(
  db: Database.Database,
  docId: string,
  caseId: string,
  name: string,
  content: string = '',
  docType: WorkingDocument['docType'] = 'freeform',
  template: string | null = null
): WorkingDocument {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO case_working_documents (id, case_id, name, content, doc_type, template, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(docId, caseId, name, content, docType, template, now, now);

  return {
    id: docId,
    caseId,
    name,
    content,
    docType,
    template,
    createdAt: now,
    updatedAt: now,
    lastEditedBy: null
  };
}

export function updateWorkingDocument(
  db: Database.Database,
  caseId: string,
  name: string,
  content: string,
  agentId: string | null = null
): WorkingDocument | null {
  const now = new Date().toISOString();
  const doc = getWorkingDocument(db, caseId, name);
  if (!doc) return null;

  db.prepare(`
    UPDATE case_working_documents
    SET content = ?, updated_at = ?, last_edited_by = ?
    WHERE case_id = ? AND name = ?
  `).run(content, now, agentId, caseId, name);

  return {
    ...doc,
    content,
    updatedAt: now,
    lastEditedBy: agentId
  };
}

export function deleteWorkingDocument(db: Database.Database, caseId: string, name: string): boolean {
  const result = db.prepare('DELETE FROM case_working_documents WHERE case_id = ? AND name = ?').run(caseId, name);
  return result.changes > 0;
}

// ============================================
// Document Edit History operations
// ============================================

export function addDocumentEdit(
  db: Database.Database,
  editId: string,
  documentId: string,
  caseId: string,
  agentId: string | null,
  agentName: string | null,
  editType: DocumentEdit['editType'],
  previousContent: string | null,
  newContent: string
): DocumentEdit {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO document_edits (id, document_id, case_id, agent_id, agent_name, edit_type, previous_content, new_content, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(editId, documentId, caseId, agentId, agentName, editType, previousContent, newContent, now);

  return {
    id: editId,
    documentId,
    caseId,
    agentId,
    agentName,
    editType,
    contentBefore: previousContent,
    contentAfter: newContent,
    timestamp: now
  };
}

export function getDocumentEdits(db: Database.Database, documentId: string): DocumentEdit[] {
  const rows = db.prepare('SELECT * FROM document_edits WHERE document_id = ? ORDER BY timestamp ASC').all(documentId) as any[];
  return rows.map(row => ({
    id: row.id,
    documentId: row.document_id,
    caseId: row.case_id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    editType: row.edit_type as DocumentEdit['editType'],
    contentBefore: row.previous_content,
    contentAfter: row.new_content,
    timestamp: row.timestamp
  }));
}

// ============================================
// Image operations
// ============================================

import type { CaseImage, ImageEdit } from '../types/index.js';
import { parseSvgDimensions } from '../services/svgService.js';

export function getImages(db: Database.Database, caseId: string): CaseImage[] {
  const rows = db.prepare('SELECT * FROM case_images WHERE case_id = ? ORDER BY created_at ASC').all(caseId) as any[];
  return rows.map(row => ({
    id: row.id,
    caseId: row.case_id,
    name: row.name,
    content: row.content,
    mimeType: row.mime_type as CaseImage['mimeType'],
    width: row.width,
    height: row.height,
    format: row.format as CaseImage['format'],
    generatedBy: row.generated_by,
    prompt: row.prompt,
    metadata: safeJsonParse(row.metadata, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export function getImage(db: Database.Database, caseId: string, name: string): CaseImage | null {
  const row = db.prepare('SELECT * FROM case_images WHERE case_id = ? AND name = ?').get(caseId, name) as any;
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    name: row.name,
    content: row.content,
    mimeType: row.mime_type as CaseImage['mimeType'],
    width: row.width,
    height: row.height,
    format: row.format as CaseImage['format'],
    generatedBy: row.generated_by,
    prompt: row.prompt,
    metadata: safeJsonParse(row.metadata, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function getImageById(db: Database.Database, imageId: string): CaseImage | null {
  const row = db.prepare('SELECT * FROM case_images WHERE id = ?').get(imageId) as any;
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    name: row.name,
    content: row.content,
    mimeType: row.mime_type as CaseImage['mimeType'],
    width: row.width,
    height: row.height,
    format: row.format as CaseImage['format'],
    generatedBy: row.generated_by,
    prompt: row.prompt,
    metadata: safeJsonParse(row.metadata, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createImage(
  db: Database.Database,
  imageId: string,
  caseId: string,
  name: string,
  content: string,
  generatedBy: string | null = null,
  prompt: string | null = null,
  metadata: Record<string, unknown> | null = null
): CaseImage {
  const now = new Date().toISOString();
  const dimensions = parseSvgDimensions(content);

  db.prepare(`
    INSERT INTO case_images (id, case_id, name, content, mime_type, width, height, format, generated_by, prompt, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'image/svg+xml', ?, ?, 'svg', ?, ?, ?, ?, ?)
  `).run(imageId, caseId, name, content, dimensions.width, dimensions.height, generatedBy, prompt, metadata ? JSON.stringify(metadata) : null, now, now);

  return {
    id: imageId,
    caseId,
    name,
    content,
    mimeType: 'image/svg+xml',
    width: dimensions.width,
    height: dimensions.height,
    format: 'svg',
    generatedBy,
    prompt,
    metadata,
    createdAt: now,
    updatedAt: now
  };
}

export function updateImage(
  db: Database.Database,
  caseId: string,
  name: string,
  content: string,
  agentId: string | null = null
): CaseImage | null {
  const now = new Date().toISOString();
  const existing = getImage(db, caseId, name);
  if (!existing) return null;

  const dimensions = parseSvgDimensions(content);

  db.prepare(`
    UPDATE case_images
    SET content = ?, width = ?, height = ?, updated_at = ?
    WHERE case_id = ? AND name = ?
  `).run(content, dimensions.width, dimensions.height, now, caseId, name);

  return {
    ...existing,
    content,
    width: dimensions.width,
    height: dimensions.height,
    updatedAt: now
  };
}

export function deleteImage(db: Database.Database, caseId: string, name: string): boolean {
  const result = db.prepare('DELETE FROM case_images WHERE case_id = ? AND name = ?').run(caseId, name);
  return result.changes > 0;
}

export function addImageEdit(
  db: Database.Database,
  editId: string,
  imageId: string,
  caseId: string,
  agentId: string | null,
  agentName: string | null,
  editType: 'create' | 'replace' | 'delete',
  contentBefore: string | null,
  contentAfter: string
): ImageEdit {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO image_edits (id, image_id, case_id, agent_id, agent_name, edit_type, content_before, content_after, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(editId, imageId, caseId, agentId, agentName, editType, contentBefore, contentAfter, now);

  return {
    id: editId,
    imageId,
    caseId,
    agentId,
    agentName,
    editType,
    contentBefore,
    contentAfter,
    timestamp: now
  };
}

export function getImageEdits(db: Database.Database, imageId: string): ImageEdit[] {
  const rows = db.prepare('SELECT * FROM image_edits WHERE image_id = ? ORDER BY timestamp ASC').all(imageId) as any[];
  return rows.map(row => ({
    id: row.id,
    imageId: row.image_id,
    caseId: row.case_id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    editType: row.edit_type as ImageEdit['editType'],
    contentBefore: row.content_before,
    contentAfter: row.content_after,
    timestamp: row.timestamp
  }));
}

// ============================================
// Agent Case History operations
// ============================================

export function addAgentCaseHistory(
  db: Database.Database,
  id: string,
  agentName: string,
  caseId: string,
  participantId: string,
  scenario: string,
  roleSummary: string
): AgentCaseHistory {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO agent_case_history (id, agent_name, case_id, participant_id, scenario, role_summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, agentName, caseId, participantId, scenario, roleSummary, now);

  return {
    id,
    agentName,
    caseId,
    participantId,
    scenario,
    roleSummary,
    outcome: null,
    createdAt: now
  };
}

export function updateAgentCaseHistoryOutcome(
  db: Database.Database,
  caseId: string,
  outcome: string
): void {
  db.prepare('UPDATE agent_case_history SET outcome = ? WHERE case_id = ?').run(outcome, caseId);
}

export function getAgentHistory(db: Database.Database, agentName: string): AgentCaseHistory[] {
  const rows = db.prepare(`
    SELECT * FROM agent_case_history
    WHERE agent_name = ?
    ORDER BY created_at DESC
  `).all(agentName) as any[];

  return rows.map(row => ({
    id: row.id,
    agentName: row.agent_name,
    caseId: row.case_id,
    participantId: row.participant_id,
    scenario: row.scenario,
    roleSummary: row.role_summary,
    outcome: row.outcome,
    createdAt: row.created_at
  }));
}

export function getAgentHistoryCount(db: Database.Database, agentName: string): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM agent_case_history WHERE agent_name = ?').get(agentName) as any;
  return row?.count || 0;
}

// ============================================
// Task Output operations
// ============================================

export function setTaskOutput(
  db: Database.Database,
  caseId: string,
  taskOutput: string
): void {
  const now = new Date().toISOString();
  db.prepare('UPDATE cases SET task_output = ?, updated_at = ? WHERE id = ?').run(taskOutput, now, caseId);
}

export function setTaskType(
  db: Database.Database,
  caseId: string,
  taskType: TaskType
): void {
  const now = new Date().toISOString();
  db.prepare('UPDATE cases SET task_type = ?, updated_at = ? WHERE id = ?').run(taskType, now, caseId);
}

export function getTaskType(
  db: Database.Database,
  caseId: string
): TaskType | null {
  const row = db.prepare('SELECT task_type FROM cases WHERE id = ?').get(caseId) as { task_type: string | null } | undefined;
  return row?.task_type as TaskType | null;
}

// ============================================
// Scenario Reference operations
// ============================================

export function setScenarioReference(
  db: Database.Database,
  caseId: string,
  scenarioName: string | null,
  scenarioSource: ScenarioSource | null
): void {
  const now = new Date().toISOString();
  db.prepare('UPDATE cases SET scenario_name = ?, scenario_source = ?, updated_at = ? WHERE id = ?').run(
    scenarioName, scenarioSource, now, caseId
  );
}

// ============================================
// Location operations
// ============================================

export function setLocation(
  db: Database.Database,
  caseId: string,
  locationType: string,
  locationName: string | null,
  locationFurniture: string[] | null
): void {
  const now = new Date().toISOString();
  const furnitureJson = locationFurniture ? JSON.stringify(locationFurniture) : null;
  db.prepare(`
    UPDATE cases
    SET location_type = ?, location_name = ?, location_furniture = ?, updated_at = ?
    WHERE id = ?
  `).run(locationType, locationName, furnitureJson, now, caseId);
}

// ============================================
// Form operations
// ============================================

export function setFormDefinition(
  db: Database.Database,
  caseId: string,
  formDefinition: FormDefinition
): void {
  const now = new Date().toISOString();
  const formJson = JSON.stringify(formDefinition);
  db.prepare('UPDATE cases SET form_definition = ?, updated_at = ? WHERE id = ?').run(formJson, now, caseId);
}

export function getFormDefinition(
  db: Database.Database,
  caseId: string
): FormDefinition | null {
  const row = db.prepare('SELECT form_definition FROM cases WHERE id = ?').get(caseId) as { form_definition: string | null } | undefined;
  if (!row?.form_definition) return null;
  try {
    return JSON.parse(row.form_definition);
  } catch {
    return null;
  }
}

export function setCompletedForm(
  db: Database.Database,
  caseId: string,
  completedForm: CompletedForm
): void {
  const now = new Date().toISOString();
  const formJson = JSON.stringify(completedForm);
  db.prepare('UPDATE cases SET completed_form = ?, updated_at = ? WHERE id = ?').run(formJson, now, caseId);
}

export function getCompletedForm(
  db: Database.Database,
  caseId: string
): CompletedForm | null {
  const row = db.prepare('SELECT completed_form FROM cases WHERE id = ?').get(caseId) as { completed_form: string | null } | undefined;
  if (!row?.completed_form) return null;
  try {
    return JSON.parse(row.completed_form);
  } catch {
    return null;
  }
}

// ============================================
// Company operations
// ============================================

export function createCompany(
  db: Database.Database,
  id: string,
  name: string
): Company {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO companies (id, name, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(id, name, now, now);

  return {
    id,
    name,
    industry: null,
    size: null,
    description: null,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    metadata: null,
    createdAt: now,
    updatedAt: now
  };
}

export function getCompany(db: Database.Database, companyId: string): Company | null {
  const row = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId) as any;
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    size: row.size as CompanySize | null,
    description: row.description,
    logoUrl: row.logo_url,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    metadata: safeJsonParse<Record<string, unknown> | null>(row.metadata, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function getCompanyByName(db: Database.Database, name: string): Company | null {
  const row = db.prepare('SELECT * FROM companies WHERE name = ?').get(name) as any;
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    size: row.size as CompanySize | null,
    description: row.description,
    logoUrl: row.logo_url,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    metadata: safeJsonParse<Record<string, unknown> | null>(row.metadata, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function getAllCompanies(db: Database.Database): CompanyListItem[] {
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM company_buildings WHERE company_id = c.id) as building_count,
      (SELECT COUNT(*) FROM company_employees WHERE company_id = c.id) as employee_count,
      (SELECT COUNT(*) FROM company_policies WHERE company_id = c.id) as policy_count
    FROM companies c
    ORDER BY c.created_at DESC
  `).all() as any[];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    industry: row.industry,
    size: row.size as CompanySize | null,
    description: row.description,
    logoUrl: row.logo_url,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    metadata: safeJsonParse<Record<string, unknown> | null>(row.metadata, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    buildingCount: row.building_count,
    employeeCount: row.employee_count,
    policyCount: row.policy_count
  }));
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
  const now = new Date().toISOString();
  const company = getCompany(db, companyId);
  if (!company) return null;

  const fields: string[] = ['updated_at = ?'];
  const values: any[] = [now];

  if (updates.industry !== undefined) {
    fields.push('industry = ?');
    values.push(updates.industry);
  }
  if (updates.size !== undefined) {
    fields.push('size = ?');
    values.push(updates.size);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.logoUrl !== undefined) {
    fields.push('logo_url = ?');
    values.push(updates.logoUrl);
  }
  if (updates.primaryColor !== undefined) {
    fields.push('primary_color = ?');
    values.push(updates.primaryColor);
  }
  if (updates.secondaryColor !== undefined) {
    fields.push('secondary_color = ?');
    values.push(updates.secondaryColor);
  }
  if (updates.metadata !== undefined) {
    fields.push('metadata = ?');
    values.push(JSON.stringify(updates.metadata));
  }

  values.push(companyId);
  db.prepare(`UPDATE companies SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getCompany(db, companyId);
}

export function deleteCompany(db: Database.Database, companyId: string): boolean {
  const result = db.prepare('DELETE FROM companies WHERE id = ?').run(companyId);
  return result.changes > 0;
}

export function getCompanyWithRelations(db: Database.Database, companyId: string): CompanyWithRelations | null {
  const company = getCompany(db, companyId);
  if (!company) return null;

  const buildings = getCompanyBuildings(db, companyId);
  const policies = getCompanyPolicies(db, companyId);
  const employees = getCompanyEmployees(db, companyId);

  return {
    ...company,
    buildings,
    policies,
    employees
  };
}

// ============================================
// Building operations
// ============================================

export function createBuilding(
  db: Database.Database,
  id: string,
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
  const now = new Date().toISOString();
  const furnitureJson = options?.defaultFurniture ? JSON.stringify(options.defaultFurniture) : null;

  db.prepare(`
    INSERT INTO company_buildings (id, company_id, name, address, city, country, description, location_type, default_furniture, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    companyId,
    name,
    options?.address || null,
    options?.city || null,
    options?.country || null,
    options?.description || null,
    options?.locationType || null,
    furnitureJson,
    now
  );

  return {
    id,
    companyId,
    name,
    address: options?.address || null,
    city: options?.city || null,
    country: options?.country || null,
    description: options?.description || null,
    locationType: options?.locationType || null,
    defaultFurniture: options?.defaultFurniture || null,
    createdAt: now
  };
}

export function getBuilding(db: Database.Database, buildingId: string): CompanyBuilding | null {
  const row = db.prepare('SELECT * FROM company_buildings WHERE id = ?').get(buildingId) as any;
  if (!row) return null;

  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    address: row.address,
    city: row.city,
    country: row.country,
    description: row.description,
    locationType: row.location_type as LocationType | null,
    defaultFurniture: safeJsonParse<string[] | null>(row.default_furniture, null),
    createdAt: row.created_at
  };
}

export function getCompanyBuildings(db: Database.Database, companyId: string): CompanyBuilding[] {
  const rows = db.prepare('SELECT * FROM company_buildings WHERE company_id = ? ORDER BY created_at ASC').all(companyId) as any[];

  return rows.map(row => ({
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    address: row.address,
    city: row.city,
    country: row.country,
    description: row.description,
    locationType: row.location_type as LocationType | null,
    defaultFurniture: safeJsonParse<string[] | null>(row.default_furniture, null),
    createdAt: row.created_at
  }));
}

export function getBuildingWithRooms(db: Database.Database, buildingId: string): CompanyBuildingWithRooms | null {
  const building = getBuilding(db, buildingId);
  if (!building) return null;

  const rooms = getBuildingRooms(db, buildingId);

  return {
    ...building,
    rooms
  };
}

export function deleteBuilding(db: Database.Database, buildingId: string): boolean {
  const result = db.prepare('DELETE FROM company_buildings WHERE id = ?').run(buildingId);
  return result.changes > 0;
}

// ============================================
// Room operations
// ============================================

export function createRoom(
  db: Database.Database,
  id: string,
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
  const now = new Date().toISOString();
  const furnitureJson = options?.furniture ? JSON.stringify(options.furniture) : null;

  db.prepare(`
    INSERT INTO company_rooms (id, building_id, company_id, name, room_type, floor, capacity, furniture, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    buildingId,
    companyId,
    name,
    roomType,
    options?.floor ?? null,
    options?.capacity ?? null,
    furnitureJson,
    options?.description || null,
    now
  );

  return {
    id,
    buildingId,
    companyId,
    name,
    roomType,
    floor: options?.floor ?? null,
    capacity: options?.capacity ?? null,
    furniture: options?.furniture || null,
    description: options?.description || null,
    createdAt: now
  };
}

export function getRoom(db: Database.Database, roomId: string): CompanyRoom | null {
  const row = db.prepare('SELECT * FROM company_rooms WHERE id = ?').get(roomId) as any;
  if (!row) return null;

  return {
    id: row.id,
    buildingId: row.building_id,
    companyId: row.company_id,
    name: row.name,
    roomType: row.room_type as RoomType,
    floor: row.floor,
    capacity: row.capacity,
    furniture: safeJsonParse<string[] | null>(row.furniture, null),
    description: row.description,
    createdAt: row.created_at
  };
}

export function getBuildingRooms(db: Database.Database, buildingId: string): CompanyRoom[] {
  const rows = db.prepare('SELECT * FROM company_rooms WHERE building_id = ? ORDER BY floor, name').all(buildingId) as any[];

  return rows.map(row => ({
    id: row.id,
    buildingId: row.building_id,
    companyId: row.company_id,
    name: row.name,
    roomType: row.room_type as RoomType,
    floor: row.floor,
    capacity: row.capacity,
    furniture: safeJsonParse<string[] | null>(row.furniture, null),
    description: row.description,
    createdAt: row.created_at
  }));
}

export function getCompanyRooms(db: Database.Database, companyId: string): CompanyRoom[] {
  const rows = db.prepare('SELECT * FROM company_rooms WHERE company_id = ? ORDER BY building_id, floor, name').all(companyId) as any[];

  return rows.map(row => ({
    id: row.id,
    buildingId: row.building_id,
    companyId: row.company_id,
    name: row.name,
    roomType: row.room_type as RoomType,
    floor: row.floor,
    capacity: row.capacity,
    furniture: safeJsonParse<string[] | null>(row.furniture, null),
    description: row.description,
    createdAt: row.created_at
  }));
}

export function deleteRoom(db: Database.Database, roomId: string): boolean {
  const result = db.prepare('DELETE FROM company_rooms WHERE id = ?').run(roomId);
  return result.changes > 0;
}

// ============================================
// Policy Category operations
// ============================================

export function getPolicyCategories(db: Database.Database): PolicyCategory[] {
  const rows = db.prepare('SELECT * FROM policy_categories ORDER BY name').all() as any[];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    description: row.description
  }));
}

export function getPolicyCategory(db: Database.Database, categoryId: string): PolicyCategory | null {
  const row = db.prepare('SELECT * FROM policy_categories WHERE id = ?').get(categoryId) as any;
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    description: row.description
  };
}

export function getPolicyCategoryByName(db: Database.Database, name: string): PolicyCategory | null {
  const row = db.prepare('SELECT * FROM policy_categories WHERE name = ?').get(name) as any;
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    description: row.description
  };
}

// ============================================
// Policy operations
// ============================================

export function createPolicy(
  db: Database.Database,
  id: string,
  companyId: string,
  categoryId: string,
  title: string,
  summary: string,
  fullText: string,
  effectiveDate?: string
): CompanyPolicy {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO company_policies (id, company_id, category_id, title, summary, full_text, effective_date, version, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
  `).run(id, companyId, categoryId, title, summary, fullText, effectiveDate || null, now, now);

  return {
    id,
    companyId,
    categoryId,
    title,
    summary,
    fullText,
    effectiveDate: effectiveDate || null,
    version: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now
  };
}

export function getPolicy(db: Database.Database, policyId: string): CompanyPolicy | null {
  const row = db.prepare('SELECT * FROM company_policies WHERE id = ?').get(policyId) as any;
  if (!row) return null;

  return {
    id: row.id,
    companyId: row.company_id,
    categoryId: row.category_id,
    title: row.title,
    summary: row.summary,
    fullText: row.full_text,
    effectiveDate: row.effective_date,
    version: row.version,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function getPolicyWithCategory(db: Database.Database, policyId: string): CompanyPolicyWithCategory | null {
  const row = db.prepare(`
    SELECT p.*, c.name as category_name, c.icon as category_icon, c.description as category_description
    FROM company_policies p
    JOIN policy_categories c ON p.category_id = c.id
    WHERE p.id = ?
  `).get(policyId) as any;
  if (!row) return null;

  return {
    id: row.id,
    companyId: row.company_id,
    categoryId: row.category_id,
    title: row.title,
    summary: row.summary,
    fullText: row.full_text,
    effectiveDate: row.effective_date,
    version: row.version,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category: {
      id: row.category_id,
      name: row.category_name,
      icon: row.category_icon,
      description: row.category_description
    }
  };
}

export function getCompanyPolicies(db: Database.Database, companyId: string): CompanyPolicy[] {
  const rows = db.prepare('SELECT * FROM company_policies WHERE company_id = ? ORDER BY title').all(companyId) as any[];

  return rows.map(row => ({
    id: row.id,
    companyId: row.company_id,
    categoryId: row.category_id,
    title: row.title,
    summary: row.summary,
    fullText: row.full_text,
    effectiveDate: row.effective_date,
    version: row.version,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export function getCompanyPoliciesWithCategories(db: Database.Database, companyId: string): CompanyPolicyWithCategory[] {
  const rows = db.prepare(`
    SELECT p.*, c.name as category_name, c.icon as category_icon, c.description as category_description
    FROM company_policies p
    JOIN policy_categories c ON p.category_id = c.id
    WHERE p.company_id = ?
    ORDER BY p.title
  `).all(companyId) as any[];

  return rows.map(row => ({
    id: row.id,
    companyId: row.company_id,
    categoryId: row.category_id,
    title: row.title,
    summary: row.summary,
    fullText: row.full_text,
    effectiveDate: row.effective_date,
    version: row.version,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category: {
      id: row.category_id,
      name: row.category_name,
      icon: row.category_icon,
      description: row.category_description
    }
  }));
}

export function deletePolicy(db: Database.Database, policyId: string): boolean {
  const result = db.prepare('DELETE FROM company_policies WHERE id = ?').run(policyId);
  return result.changes > 0;
}

// ============================================
// Employee operations
// ============================================

export function createEmployee(
  db: Database.Database,
  id: string,
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
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO company_employees (id, company_id, agent_name, job_title, department, manager_agent_name, start_date, employment_type, office_room_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    companyId,
    agentName,
    jobTitle,
    options?.department || null,
    options?.managerAgentName || null,
    options?.startDate || null,
    options?.employmentType || 'full_time',
    options?.officeRoomId || null,
    now
  );

  return {
    id,
    companyId,
    agentName,
    jobTitle,
    department: options?.department || null,
    managerAgentName: options?.managerAgentName || null,
    startDate: options?.startDate || null,
    employmentType: options?.employmentType || 'full_time',
    officeRoomId: options?.officeRoomId || null,
    createdAt: now
  };
}

export function getEmployee(db: Database.Database, employeeId: string): CompanyEmployee | null {
  const row = db.prepare('SELECT * FROM company_employees WHERE id = ?').get(employeeId) as any;
  if (!row) return null;

  return {
    id: row.id,
    companyId: row.company_id,
    agentName: row.agent_name,
    jobTitle: row.job_title,
    department: row.department,
    managerAgentName: row.manager_agent_name,
    startDate: row.start_date,
    employmentType: row.employment_type as EmploymentType,
    officeRoomId: row.office_room_id,
    createdAt: row.created_at
  };
}

export function getCompanyEmployees(db: Database.Database, companyId: string): CompanyEmployee[] {
  const rows = db.prepare('SELECT * FROM company_employees WHERE company_id = ? ORDER BY agent_name').all(companyId) as any[];

  return rows.map(row => ({
    id: row.id,
    companyId: row.company_id,
    agentName: row.agent_name,
    jobTitle: row.job_title,
    department: row.department,
    managerAgentName: row.manager_agent_name,
    startDate: row.start_date,
    employmentType: row.employment_type as EmploymentType,
    officeRoomId: row.office_room_id,
    createdAt: row.created_at
  }));
}

export function getEmployeeByAgentName(db: Database.Database, companyId: string, agentName: string): CompanyEmployee | null {
  const row = db.prepare('SELECT * FROM company_employees WHERE company_id = ? AND agent_name = ?').get(companyId, agentName) as any;
  if (!row) return null;

  return {
    id: row.id,
    companyId: row.company_id,
    agentName: row.agent_name,
    jobTitle: row.job_title,
    department: row.department,
    managerAgentName: row.manager_agent_name,
    startDate: row.start_date,
    employmentType: row.employment_type as EmploymentType,
    officeRoomId: row.office_room_id,
    createdAt: row.created_at
  };
}

export function getAgentEmployments(db: Database.Database, agentName: string): Array<CompanyEmployee & { companyName: string }> {
  const rows = db.prepare(`
    SELECT e.*, c.name as company_name
    FROM company_employees e
    JOIN companies c ON e.company_id = c.id
    WHERE e.agent_name = ?
    ORDER BY e.created_at DESC
  `).all(agentName) as any[];

  return rows.map(row => ({
    id: row.id,
    companyId: row.company_id,
    agentName: row.agent_name,
    jobTitle: row.job_title,
    department: row.department,
    managerAgentName: row.manager_agent_name,
    startDate: row.start_date,
    employmentType: row.employment_type as EmploymentType,
    officeRoomId: row.office_room_id,
    createdAt: row.created_at,
    companyName: row.company_name
  }));
}

export function deleteEmployee(db: Database.Database, employeeId: string): boolean {
  const result = db.prepare('DELETE FROM company_employees WHERE id = ?').run(employeeId);
  return result.changes > 0;
}

// ============================================
// Case-Company operations
// ============================================

export function associateCaseWithCompany(
  db: Database.Database,
  id: string,
  caseId: string,
  companyId: string,
  buildingId?: string,
  roomId?: string
): CaseCompany {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO case_companies (id, case_id, company_id, building_id, room_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, caseId, companyId, buildingId || null, roomId || null, now);

  return {
    id,
    caseId,
    companyId,
    buildingId: buildingId || null,
    roomId: roomId || null,
    createdAt: now
  };
}

export function getCaseCompany(db: Database.Database, caseId: string): CaseCompany | null {
  const row = db.prepare('SELECT * FROM case_companies WHERE case_id = ?').get(caseId) as any;
  if (!row) return null;

  return {
    id: row.id,
    caseId: row.case_id,
    companyId: row.company_id,
    buildingId: row.building_id,
    roomId: row.room_id,
    createdAt: row.created_at
  };
}

export function getCaseCompanyContext(db: Database.Database, caseId: string): CaseCompanyContext | null {
  const caseCompany = getCaseCompany(db, caseId);
  if (!caseCompany) return null;

  const company = getCompany(db, caseCompany.companyId);
  if (!company) return null;

  const building = caseCompany.buildingId ? getBuilding(db, caseCompany.buildingId) : null;
  const room = caseCompany.roomId ? getRoom(db, caseCompany.roomId) : null;

  // Get active policy summaries
  const policies = db.prepare(`
    SELECT p.id, p.title, p.summary, c.name as category
    FROM company_policies p
    JOIN policy_categories c ON p.category_id = c.id
    WHERE p.company_id = ? AND p.is_active = 1
    ORDER BY p.title
  `).all(caseCompany.companyId) as any[];

  return {
    company,
    building,
    room,
    policies: policies.map(p => ({
      id: p.id,
      title: p.title,
      summary: p.summary,
      category: p.category
    }))
  };
}

export function deleteCaseCompany(db: Database.Database, caseId: string): boolean {
  const result = db.prepare('DELETE FROM case_companies WHERE case_id = ?').run(caseId);
  return result.changes > 0;
}

// ============================================
// Case Agent Role operations
// ============================================

export function createCaseAgentRole(
  db: Database.Database,
  id: string,
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
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO case_agent_roles (id, case_id, participant_id, role_type, role_title, department, access_level, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    caseId,
    participantId,
    roleType,
    options?.roleTitle || null,
    options?.department || null,
    options?.accessLevel || 'limited',
    options?.notes || null,
    now
  );

  return {
    id,
    caseId,
    participantId,
    roleType,
    roleTitle: options?.roleTitle || null,
    department: options?.department || null,
    accessLevel: options?.accessLevel || 'limited',
    notes: options?.notes || null,
    createdAt: now
  };
}

export function getCaseAgentRoles(db: Database.Database, caseId: string): CaseAgentRole[] {
  const rows = db.prepare('SELECT * FROM case_agent_roles WHERE case_id = ?').all(caseId) as any[];

  return rows.map(row => ({
    id: row.id,
    caseId: row.case_id,
    participantId: row.participant_id,
    roleType: row.role_type as CaseRoleType,
    roleTitle: row.role_title,
    department: row.department,
    accessLevel: row.access_level as AccessLevel,
    notes: row.notes,
    createdAt: row.created_at
  }));
}

export function getCaseAgentRole(db: Database.Database, caseId: string, participantId: string): CaseAgentRole | null {
  const row = db.prepare('SELECT * FROM case_agent_roles WHERE case_id = ? AND participant_id = ?').get(caseId, participantId) as any;
  if (!row) return null;

  return {
    id: row.id,
    caseId: row.case_id,
    participantId: row.participant_id,
    roleType: row.role_type as CaseRoleType,
    roleTitle: row.role_title,
    department: row.department,
    accessLevel: row.access_level as AccessLevel,
    notes: row.notes,
    createdAt: row.created_at
  };
}

export function deleteCaseAgentRole(db: Database.Database, roleId: string): boolean {
  const result = db.prepare('DELETE FROM case_agent_roles WHERE id = ?').run(roleId);
  return result.changes > 0;
}

// ============================================
// Agent Profile operations
// ============================================

export function getAgentProfile(db: Database.Database, agentName: string): AgentProfile | null {
  const row = db.prepare('SELECT * FROM agent_profiles WHERE agent_name = ?').get(agentName) as any;
  if (!row) return null;

  // Parse extended data if stored (new fields stored in JSON column)
  const extendedData = safeJsonParse<Record<string, any> | null>(row.extended_data, null) || {};

  return {
    id: row.id,
    agentName: row.agent_name,
    dateOfBirth: row.date_of_birth,
    placeOfBirthCity: row.place_of_birth_city,
    placeOfBirthCountry: row.place_of_birth_country,
    nationality: row.nationality,
    nationalities: safeJsonParse<string[] | null>(row.nationalities, null),
    sex: row.sex,

    // Body
    heightCm: row.height_cm,
    weightKg: extendedData.weightKg ?? null,
    build: row.build,
    skinTone: row.skin_tone,
    ageAppearance: row.age_appearance,
    posture: extendedData.posture ?? null,
    gait: extendedData.gait ?? null,

    // Face
    faceShape: row.face_shape,
    eyeColor: row.eye_color,
    eyeShape: extendedData.eyeShape ?? null,
    noseShape: extendedData.noseShape ?? null,
    lipShape: extendedData.lipShape ?? null,
    eyebrowShape: extendedData.eyebrowShape ?? null,
    chinShape: extendedData.chinShape ?? null,
    complexion: extendedData.complexion ?? null,
    restingExpression: extendedData.restingExpression ?? null,

    // Hair
    hairColor: row.hair_color,
    hairStyle: row.hair_style,
    hairLength: row.hair_length,
    facialHair: row.facial_hair,
    hairTexture: extendedData.hairTexture ?? null,
    grayPercentage: extendedData.grayPercentage ?? null,

    // Accessories
    glasses: row.glasses,
    jewelry: safeJsonParse<JewelryItem[] | null>(row.jewelry, null),

    // Distinguishing marks
    tattoos: safeJsonParse<DistinguishingMark[] | null>(row.tattoos, null),
    scars: safeJsonParse<DistinguishingMark[] | null>(row.scars, null),
    birthmarks: extendedData.birthmarks ?? null,
    distinguishingFeatures: safeJsonParse<string[] | null>(row.distinguishing_features, null),

    // Clothing
    clothingStyle: row.clothing_style,
    primaryClothingColor: row.primary_clothing_color,
    secondaryClothingColor: row.secondary_clothing_color,
    typicalOutfit: extendedData.typicalOutfit ?? null,

    // Voice & mannerisms
    voiceDescription: extendedData.voiceDescription ?? null,
    accentDescription: extendedData.accentDescription ?? null,
    mannerisms: extendedData.mannerisms ?? null,

    // Backstory
    backstory: row.backstory,
    personalityTraits: safeJsonParse<string[] | null>(row.personality_traits, null),

    // Life History
    childhoodSummary: extendedData.childhoodSummary ?? null,
    childhoodLocation: extendedData.childhoodLocation ?? null,
    familyBackground: extendedData.familyBackground ?? null,
    education: extendedData.education ?? null,
    careerPath: extendedData.careerPath ?? null,
    significantEvents: extendedData.significantEvents ?? null,
    relationships: extendedData.relationships ?? null,
    formativeExperiences: extendedData.formativeExperiences ?? null,
    currentSituation: extendedData.currentSituation ?? null,
    fears: extendedData.fears ?? null,
    desires: extendedData.desires ?? null,
    secrets: extendedData.secrets ?? null,
    skills: extendedData.skills ?? null,
    hobbies: extendedData.hobbies ?? null,

    // Photo
    photoUrl: row.photo_url,
    photoPrompt: row.photo_prompt,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createAgentProfile(
  db: Database.Database,
  agentName: string,
  profile: CreateAgentProfileRequest
): AgentProfile {
  const now = new Date().toISOString();
  const id = `profile-${agentName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  // Collect extended data fields (new fields stored in JSON column)
  const extendedData: Record<string, any> = {};
  if (profile.weightKg != null) extendedData.weightKg = profile.weightKg;
  if (profile.posture) extendedData.posture = profile.posture;
  if (profile.gait) extendedData.gait = profile.gait;
  if (profile.eyeShape) extendedData.eyeShape = profile.eyeShape;
  if (profile.noseShape) extendedData.noseShape = profile.noseShape;
  if (profile.lipShape) extendedData.lipShape = profile.lipShape;
  if (profile.eyebrowShape) extendedData.eyebrowShape = profile.eyebrowShape;
  if (profile.chinShape) extendedData.chinShape = profile.chinShape;
  if (profile.complexion) extendedData.complexion = profile.complexion;
  if (profile.restingExpression) extendedData.restingExpression = profile.restingExpression;
  if (profile.hairTexture) extendedData.hairTexture = profile.hairTexture;
  if (profile.grayPercentage != null) extendedData.grayPercentage = profile.grayPercentage;
  if (profile.birthmarks) extendedData.birthmarks = profile.birthmarks;
  if (profile.typicalOutfit) extendedData.typicalOutfit = profile.typicalOutfit;
  if (profile.voiceDescription) extendedData.voiceDescription = profile.voiceDescription;
  if (profile.accentDescription) extendedData.accentDescription = profile.accentDescription;
  if (profile.mannerisms) extendedData.mannerisms = profile.mannerisms;
  // Life history
  if (profile.childhoodSummary) extendedData.childhoodSummary = profile.childhoodSummary;
  if (profile.childhoodLocation) extendedData.childhoodLocation = profile.childhoodLocation;
  if (profile.familyBackground) extendedData.familyBackground = profile.familyBackground;
  if (profile.education) extendedData.education = profile.education;
  if (profile.careerPath) extendedData.careerPath = profile.careerPath;
  if (profile.significantEvents) extendedData.significantEvents = profile.significantEvents;
  if (profile.relationships) extendedData.relationships = profile.relationships;
  if (profile.formativeExperiences) extendedData.formativeExperiences = profile.formativeExperiences;
  if (profile.currentSituation) extendedData.currentSituation = profile.currentSituation;
  if (profile.fears) extendedData.fears = profile.fears;
  if (profile.desires) extendedData.desires = profile.desires;
  if (profile.secrets) extendedData.secrets = profile.secrets;
  if (profile.skills) extendedData.skills = profile.skills;
  if (profile.hobbies) extendedData.hobbies = profile.hobbies;

  db.prepare(`
    INSERT INTO agent_profiles (
      id, agent_name,
      date_of_birth, place_of_birth_city, place_of_birth_country,
      nationality, nationalities, sex,
      height_cm, build, skin_tone, eye_color, hair_color, hair_style, hair_length,
      facial_hair, face_shape, age_appearance,
      glasses, jewelry,
      tattoos, scars, distinguishing_features,
      clothing_style, primary_clothing_color, secondary_clothing_color,
      backstory, personality_traits,
      extended_data,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    agentName,
    profile.dateOfBirth || null,
    profile.placeOfBirthCity || null,
    profile.placeOfBirthCountry || null,
    profile.nationality || null,
    profile.nationalities ? JSON.stringify(profile.nationalities) : null,
    profile.sex || null,
    profile.heightCm ?? null,
    profile.build || null,
    profile.skinTone || null,
    profile.eyeColor || null,
    profile.hairColor || null,
    profile.hairStyle || null,
    profile.hairLength || null,
    profile.facialHair || null,
    profile.faceShape || null,
    profile.ageAppearance ?? null,
    profile.glasses || null,
    profile.jewelry ? JSON.stringify(profile.jewelry) : null,
    profile.tattoos ? JSON.stringify(profile.tattoos) : null,
    profile.scars ? JSON.stringify(profile.scars) : null,
    profile.distinguishingFeatures ? JSON.stringify(profile.distinguishingFeatures) : null,
    profile.clothingStyle || null,
    profile.primaryClothingColor || null,
    profile.secondaryClothingColor || null,
    profile.backstory || null,
    profile.personalityTraits ? JSON.stringify(profile.personalityTraits) : null,
    Object.keys(extendedData).length > 0 ? JSON.stringify(extendedData) : null,
    now,
    now
  );

  return getAgentProfile(db, agentName)!;
}

export function updateAgentProfile(
  db: Database.Database,
  agentName: string,
  profile: CreateAgentProfileRequest
): AgentProfile | null {
  const existing = getAgentProfile(db, agentName);
  if (!existing) return null;

  const now = new Date().toISOString();

  // Build extended data by merging existing with new
  const extendedData: Record<string, any> = {};
  // Preserve existing extended fields
  if (existing.weightKg != null) extendedData.weightKg = existing.weightKg;
  if (existing.posture) extendedData.posture = existing.posture;
  if (existing.gait) extendedData.gait = existing.gait;
  if (existing.eyeShape) extendedData.eyeShape = existing.eyeShape;
  if (existing.noseShape) extendedData.noseShape = existing.noseShape;
  if (existing.lipShape) extendedData.lipShape = existing.lipShape;
  if (existing.eyebrowShape) extendedData.eyebrowShape = existing.eyebrowShape;
  if (existing.chinShape) extendedData.chinShape = existing.chinShape;
  if (existing.complexion) extendedData.complexion = existing.complexion;
  if (existing.restingExpression) extendedData.restingExpression = existing.restingExpression;
  if (existing.hairTexture) extendedData.hairTexture = existing.hairTexture;
  if (existing.grayPercentage != null) extendedData.grayPercentage = existing.grayPercentage;
  if (existing.birthmarks) extendedData.birthmarks = existing.birthmarks;
  if (existing.typicalOutfit) extendedData.typicalOutfit = existing.typicalOutfit;
  if (existing.voiceDescription) extendedData.voiceDescription = existing.voiceDescription;
  if (existing.accentDescription) extendedData.accentDescription = existing.accentDescription;
  if (existing.mannerisms) extendedData.mannerisms = existing.mannerisms;
  if (existing.childhoodSummary) extendedData.childhoodSummary = existing.childhoodSummary;
  if (existing.childhoodLocation) extendedData.childhoodLocation = existing.childhoodLocation;
  if (existing.familyBackground) extendedData.familyBackground = existing.familyBackground;
  if (existing.education) extendedData.education = existing.education;
  if (existing.careerPath) extendedData.careerPath = existing.careerPath;
  if (existing.significantEvents) extendedData.significantEvents = existing.significantEvents;
  if (existing.relationships) extendedData.relationships = existing.relationships;
  if (existing.formativeExperiences) extendedData.formativeExperiences = existing.formativeExperiences;
  if (existing.currentSituation) extendedData.currentSituation = existing.currentSituation;
  if (existing.fears) extendedData.fears = existing.fears;
  if (existing.desires) extendedData.desires = existing.desires;
  if (existing.secrets) extendedData.secrets = existing.secrets;
  if (existing.skills) extendedData.skills = existing.skills;
  if (existing.hobbies) extendedData.hobbies = existing.hobbies;

  // Override with new values
  if (profile.weightKg != null) extendedData.weightKg = profile.weightKg;
  if (profile.posture) extendedData.posture = profile.posture;
  if (profile.gait) extendedData.gait = profile.gait;
  if (profile.eyeShape) extendedData.eyeShape = profile.eyeShape;
  if (profile.noseShape) extendedData.noseShape = profile.noseShape;
  if (profile.lipShape) extendedData.lipShape = profile.lipShape;
  if (profile.eyebrowShape) extendedData.eyebrowShape = profile.eyebrowShape;
  if (profile.chinShape) extendedData.chinShape = profile.chinShape;
  if (profile.complexion) extendedData.complexion = profile.complexion;
  if (profile.restingExpression) extendedData.restingExpression = profile.restingExpression;
  if (profile.hairTexture) extendedData.hairTexture = profile.hairTexture;
  if (profile.grayPercentage != null) extendedData.grayPercentage = profile.grayPercentage;
  if (profile.birthmarks) extendedData.birthmarks = profile.birthmarks;
  if (profile.typicalOutfit) extendedData.typicalOutfit = profile.typicalOutfit;
  if (profile.voiceDescription) extendedData.voiceDescription = profile.voiceDescription;
  if (profile.accentDescription) extendedData.accentDescription = profile.accentDescription;
  if (profile.mannerisms) extendedData.mannerisms = profile.mannerisms;
  if (profile.childhoodSummary) extendedData.childhoodSummary = profile.childhoodSummary;
  if (profile.childhoodLocation) extendedData.childhoodLocation = profile.childhoodLocation;
  if (profile.familyBackground) extendedData.familyBackground = profile.familyBackground;
  if (profile.education) extendedData.education = profile.education;
  if (profile.careerPath) extendedData.careerPath = profile.careerPath;
  if (profile.significantEvents) extendedData.significantEvents = profile.significantEvents;
  if (profile.relationships) extendedData.relationships = profile.relationships;
  if (profile.formativeExperiences) extendedData.formativeExperiences = profile.formativeExperiences;
  if (profile.currentSituation) extendedData.currentSituation = profile.currentSituation;
  if (profile.fears) extendedData.fears = profile.fears;
  if (profile.desires) extendedData.desires = profile.desires;
  if (profile.secrets) extendedData.secrets = profile.secrets;
  if (profile.skills) extendedData.skills = profile.skills;
  if (profile.hobbies) extendedData.hobbies = profile.hobbies;

  db.prepare(`
    UPDATE agent_profiles SET
      date_of_birth = ?,
      place_of_birth_city = ?,
      place_of_birth_country = ?,
      nationality = ?,
      nationalities = ?,
      sex = ?,
      height_cm = ?,
      build = ?,
      skin_tone = ?,
      eye_color = ?,
      hair_color = ?,
      hair_style = ?,
      hair_length = ?,
      facial_hair = ?,
      face_shape = ?,
      age_appearance = ?,
      glasses = ?,
      jewelry = ?,
      tattoos = ?,
      scars = ?,
      distinguishing_features = ?,
      clothing_style = ?,
      primary_clothing_color = ?,
      secondary_clothing_color = ?,
      backstory = ?,
      personality_traits = ?,
      extended_data = ?,
      updated_at = ?
    WHERE agent_name = ?
  `).run(
    profile.dateOfBirth ?? existing.dateOfBirth,
    profile.placeOfBirthCity ?? existing.placeOfBirthCity,
    profile.placeOfBirthCountry ?? existing.placeOfBirthCountry,
    profile.nationality ?? existing.nationality,
    profile.nationalities ? JSON.stringify(profile.nationalities) : (existing.nationalities ? JSON.stringify(existing.nationalities) : null),
    profile.sex ?? existing.sex,
    profile.heightCm ?? existing.heightCm,
    profile.build ?? existing.build,
    profile.skinTone ?? existing.skinTone,
    profile.eyeColor ?? existing.eyeColor,
    profile.hairColor ?? existing.hairColor,
    profile.hairStyle ?? existing.hairStyle,
    profile.hairLength ?? existing.hairLength,
    profile.facialHair ?? existing.facialHair,
    profile.faceShape ?? existing.faceShape,
    profile.ageAppearance ?? existing.ageAppearance,
    profile.glasses ?? existing.glasses,
    profile.jewelry ? JSON.stringify(profile.jewelry) : (existing.jewelry ? JSON.stringify(existing.jewelry) : null),
    profile.tattoos ? JSON.stringify(profile.tattoos) : (existing.tattoos ? JSON.stringify(existing.tattoos) : null),
    profile.scars ? JSON.stringify(profile.scars) : (existing.scars ? JSON.stringify(existing.scars) : null),
    profile.distinguishingFeatures ? JSON.stringify(profile.distinguishingFeatures) : (existing.distinguishingFeatures ? JSON.stringify(existing.distinguishingFeatures) : null),
    profile.clothingStyle ?? existing.clothingStyle,
    profile.primaryClothingColor ?? existing.primaryClothingColor,
    profile.secondaryClothingColor ?? existing.secondaryClothingColor,
    profile.backstory ?? existing.backstory,
    profile.personalityTraits ? JSON.stringify(profile.personalityTraits) : (existing.personalityTraits ? JSON.stringify(existing.personalityTraits) : null),
    Object.keys(extendedData).length > 0 ? JSON.stringify(extendedData) : null,
    now,
    agentName
  );

  return getAgentProfile(db, agentName);
}

export function upsertAgentProfile(
  db: Database.Database,
  agentName: string,
  profile: CreateAgentProfileRequest
): AgentProfile {
  const existing = getAgentProfile(db, agentName);
  if (existing) {
    return updateAgentProfile(db, agentName, profile)!;
  } else {
    return createAgentProfile(db, agentName, profile);
  }
}

export function deleteAgentProfile(db: Database.Database, agentName: string): boolean {
  const result = db.prepare('DELETE FROM agent_profiles WHERE agent_name = ?').run(agentName);
  return result.changes > 0;
}

export function getAgentWithProfile(db: Database.Database, agentName: string): (Agent & { profile: AgentProfile | null }) | null {
  const agent = getAgentByName(db, agentName);
  if (!agent) return null;

  const profile = getAgentProfile(db, agentName);

  return {
    ...agent,
    profile
  };
}

export function setAgentProfilePhoto(
  db: Database.Database,
  agentName: string,
  photoUrl: string | null,
  photoPrompt: string | null
): boolean {
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE agent_profiles SET photo_url = ?, photo_prompt = ?, updated_at = ?
    WHERE agent_name = ?
  `).run(photoUrl, photoPrompt, now, agentName);
  return result.changes > 0;
}

// ============================================
// Workflow Storage Functions
// ============================================

export function createWorkflow(
  db: Database.Database,
  id: string,
  name: string,
  description: string | null,
  templateName: string | null,
  stages: Array<{
    name: string;
    description?: string;
    type: WorkflowStageType;
    agentCount?: number;
    outputDocument?: string;
  }>
): WorkflowWithStages {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO workflows (id, name, description, template_name, status, current_stage_index, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)
  `).run(id, name, description, templateName, now, now);

  const insertStage = db.prepare(`
    INSERT INTO workflow_stages (id, workflow_id, stage_index, name, description, type, status, agent_count, output_document, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `);

  const createdStages: WorkflowStage[] = [];
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const stageId = `${id}-stage-${i}`;
    insertStage.run(
      stageId,
      id,
      i,
      stage.name,
      stage.description || null,
      stage.type,
      stage.agentCount || 2,
      stage.outputDocument || null,
      now
    );
    createdStages.push({
      id: stageId,
      workflowId: id,
      stageIndex: i,
      name: stage.name,
      description: stage.description || null,
      type: stage.type,
      status: 'pending',
      caseId: null,
      agentCount: stage.agentCount || 2,
      inputDocuments: null,
      outputDocument: stage.outputDocument || null,
      createdAt: now,
      completedAt: null
    });
  }

  return {
    id,
    name,
    description,
    templateName,
    status: 'pending',
    currentStageIndex: 0,
    inputs: null,
    outputs: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    stages: createdStages
  };
}

export function getWorkflow(db: Database.Database, workflowId: string): Workflow | null {
  const row = db.prepare('SELECT * FROM workflows WHERE id = ?').get(workflowId) as any;
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    templateName: row.template_name,
    status: row.status as WorkflowStatus,
    currentStageIndex: row.current_stage_index,
    inputs: safeJsonParse(row.inputs, null),
    outputs: safeJsonParse(row.outputs, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

export function getWorkflowWithStages(db: Database.Database, workflowId: string): WorkflowWithStages | null {
  const workflow = getWorkflow(db, workflowId);
  if (!workflow) return null;

  const stages = getWorkflowStages(db, workflowId);
  return { ...workflow, stages };
}

export function getWorkflowStages(db: Database.Database, workflowId: string): WorkflowStage[] {
  const rows = db.prepare('SELECT * FROM workflow_stages WHERE workflow_id = ? ORDER BY stage_index').all(workflowId) as any[];

  return rows.map(row => ({
    id: row.id,
    workflowId: row.workflow_id,
    stageIndex: row.stage_index,
    name: row.name,
    description: row.description,
    type: row.type as WorkflowStageType,
    status: row.status as WorkflowStageStatus,
    caseId: row.case_id,
    agentCount: row.agent_count,
    inputDocuments: safeJsonParse(row.input_documents, null),
    outputDocument: row.output_document,
    createdAt: row.created_at,
    completedAt: row.completed_at
  }));
}

export function getAllWorkflows(db: Database.Database): Workflow[] {
  const rows = db.prepare('SELECT * FROM workflows ORDER BY created_at DESC').all() as any[];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    templateName: row.template_name,
    status: row.status as WorkflowStatus,
    currentStageIndex: row.current_stage_index,
    inputs: safeJsonParse(row.inputs, null),
    outputs: safeJsonParse(row.outputs, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  }));
}

export function updateWorkflowStatus(
  db: Database.Database,
  workflowId: string,
  status: WorkflowStatus,
  currentStageIndex?: number
): boolean {
  const now = new Date().toISOString();
  const completedAt = status === 'completed' || status === 'failed' ? now : null;

  if (currentStageIndex !== undefined) {
    const result = db.prepare(`
      UPDATE workflows SET status = ?, current_stage_index = ?, updated_at = ?, completed_at = ?
      WHERE id = ?
    `).run(status, currentStageIndex, now, completedAt, workflowId);
    return result.changes > 0;
  } else {
    const result = db.prepare(`
      UPDATE workflows SET status = ?, updated_at = ?, completed_at = ?
      WHERE id = ?
    `).run(status, now, completedAt, workflowId);
    return result.changes > 0;
  }
}

export function updateWorkflowStageStatus(
  db: Database.Database,
  stageId: string,
  status: WorkflowStageStatus,
  caseId?: string
): boolean {
  const now = new Date().toISOString();
  const completedAt = status === 'completed' || status === 'skipped' ? now : null;

  if (caseId !== undefined) {
    const result = db.prepare(`
      UPDATE workflow_stages SET status = ?, case_id = ?, completed_at = ?
      WHERE id = ?
    `).run(status, caseId, completedAt, stageId);
    return result.changes > 0;
  } else {
    const result = db.prepare(`
      UPDATE workflow_stages SET status = ?, completed_at = ?
      WHERE id = ?
    `).run(status, completedAt, stageId);
    return result.changes > 0;
  }
}

export function setWorkflowInputs(db: Database.Database, workflowId: string, inputs: Record<string, string>): boolean {
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE workflows SET inputs = ?, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(inputs), now, workflowId);
  return result.changes > 0;
}

export function setWorkflowOutputs(db: Database.Database, workflowId: string, outputs: Record<string, string>): boolean {
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE workflows SET outputs = ?, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(outputs), now, workflowId);
  return result.changes > 0;
}

export function deleteWorkflow(db: Database.Database, workflowId: string): boolean {
  const result = db.prepare('DELETE FROM workflows WHERE id = ?').run(workflowId);
  return result.changes > 0;
}

// ============================================
// Goal Storage Functions
// ============================================

export function createGoal(
  db: Database.Database,
  id: string,
  type: GoalType,
  objective: string,
  constraints: string[] | null
): Goal {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO goals (id, type, objective, constraints, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?)
  `).run(id, type, objective, constraints ? JSON.stringify(constraints) : null, now, now);

  return {
    id,
    type,
    objective,
    constraints,
    status: 'pending',
    workflowId: null,
    plan: null,
    output: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null
  };
}

export function getGoal(db: Database.Database, goalId: string): Goal | null {
  const row = db.prepare('SELECT * FROM goals WHERE id = ?').get(goalId) as any;
  if (!row) return null;

  return {
    id: row.id,
    type: row.type as GoalType,
    objective: row.objective,
    constraints: safeJsonParse(row.constraints, null),
    status: row.status as GoalStatus,
    workflowId: row.workflow_id,
    plan: safeJsonParse(row.plan, null),
    output: row.output,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

export function getAllGoals(db: Database.Database): Goal[] {
  const rows = db.prepare('SELECT * FROM goals ORDER BY created_at DESC').all() as any[];

  return rows.map(row => ({
    id: row.id,
    type: row.type as GoalType,
    objective: row.objective,
    constraints: safeJsonParse(row.constraints, null),
    status: row.status as GoalStatus,
    workflowId: row.workflow_id,
    plan: safeJsonParse(row.plan, null),
    output: row.output,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  }));
}

export function updateGoalStatus(db: Database.Database, goalId: string, status: GoalStatus): boolean {
  const now = new Date().toISOString();
  const completedAt = status === 'completed' || status === 'failed' ? now : null;
  const result = db.prepare(`
    UPDATE goals SET status = ?, updated_at = ?, completed_at = ?
    WHERE id = ?
  `).run(status, now, completedAt, goalId);
  return result.changes > 0;
}

export function setGoalPlan(db: Database.Database, goalId: string, plan: GoalPlan): boolean {
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE goals SET plan = ?, status = 'planning', updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(plan), now, goalId);
  return result.changes > 0;
}

export function setGoalWorkflow(db: Database.Database, goalId: string, workflowId: string): boolean {
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE goals SET workflow_id = ?, status = 'executing', updated_at = ?
    WHERE id = ?
  `).run(workflowId, now, goalId);
  return result.changes > 0;
}

export function setGoalOutput(db: Database.Database, goalId: string, output: string): boolean {
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE goals SET output = ?, status = 'completed', updated_at = ?, completed_at = ?
    WHERE id = ?
  `).run(output, now, now, goalId);
  return result.changes > 0;
}

export function deleteGoal(db: Database.Database, goalId: string): boolean {
  const result = db.prepare('DELETE FROM goals WHERE id = ?').run(goalId);
  return result.changes > 0;
}

// ============================================
// Workflow Design Storage Functions
// ============================================

import type {
  WorkflowDesign,
  WorkflowDesignWithRelations,
  WorkflowNode,
  WorkflowEdge,
  WorkflowDesignStatus,
  WorkflowNodeStatus,
  CanvasState,
  DocumentMapping
} from '../types/index.js';

export function createWorkflowDesign(
  db: Database.Database,
  id: string,
  name: string,
  description: string | null
): WorkflowDesign {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO workflow_designs (id, name, description, status, created_at, updated_at)
    VALUES (?, ?, ?, 'draft', ?, ?)
  `).run(id, name, description, now, now);

  return {
    id,
    name,
    description,
    status: 'draft',
    canvasState: null,
    createdAt: now,
    updatedAt: now
  };
}

export function getWorkflowDesign(db: Database.Database, workflowDesignId: string): WorkflowDesign | null {
  const row = db.prepare('SELECT * FROM workflow_designs WHERE id = ?').get(workflowDesignId) as any;
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status as WorkflowDesignStatus,
    canvasState: safeJsonParse<CanvasState | null>(row.canvas_state, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function getWorkflowDesignWithRelations(db: Database.Database, workflowDesignId: string): WorkflowDesignWithRelations | null {
  const design = getWorkflowDesign(db, workflowDesignId);
  if (!design) return null;

  const nodes = getWorkflowDesignNodes(db, workflowDesignId);
  const edges = getWorkflowDesignEdges(db, workflowDesignId);

  return { ...design, nodes, edges };
}

export function getAllWorkflowDesigns(db: Database.Database): WorkflowDesign[] {
  const rows = db.prepare('SELECT * FROM workflow_designs ORDER BY updated_at DESC').all() as any[];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status as WorkflowDesignStatus,
    canvasState: safeJsonParse<CanvasState | null>(row.canvas_state, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export function updateWorkflowDesign(
  db: Database.Database,
  workflowDesignId: string,
  updates: {
    name?: string;
    description?: string;
    canvasState?: CanvasState;
    status?: WorkflowDesignStatus;
  }
): WorkflowDesign | null {
  const existing = getWorkflowDesign(db, workflowDesignId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const fields: string[] = ['updated_at = ?'];
  const values: any[] = [now];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.canvasState !== undefined) {
    fields.push('canvas_state = ?');
    values.push(JSON.stringify(updates.canvasState));
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }

  values.push(workflowDesignId);
  db.prepare(`UPDATE workflow_designs SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getWorkflowDesign(db, workflowDesignId);
}

export function deleteWorkflowDesign(db: Database.Database, workflowDesignId: string): boolean {
  const result = db.prepare('DELETE FROM workflow_designs WHERE id = ?').run(workflowDesignId);
  return result.changes > 0;
}

// ============================================
// Workflow Design Node Storage Functions
// ============================================

export function createWorkflowDesignNode(
  db: Database.Database,
  id: string,
  workflowDesignId: string,
  scenarioName: string,
  positionX: number,
  positionY: number,
  label: string | null = null
): WorkflowNode {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO workflow_design_nodes (id, workflow_design_id, scenario_name, label, position_x, position_y, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(id, workflowDesignId, scenarioName, label, positionX, positionY, now);

  // Update the workflow design's updated_at
  db.prepare('UPDATE workflow_designs SET updated_at = ? WHERE id = ?').run(now, workflowDesignId);

  return {
    id,
    workflowDesignId,
    scenarioName,
    label,
    positionX,
    positionY,
    caseId: null,
    status: 'pending'
  };
}

export function getWorkflowDesignNode(db: Database.Database, nodeId: string): WorkflowNode | null {
  const row = db.prepare('SELECT * FROM workflow_design_nodes WHERE id = ?').get(nodeId) as any;
  if (!row) return null;

  return {
    id: row.id,
    workflowDesignId: row.workflow_design_id,
    scenarioName: row.scenario_name,
    label: row.label,
    positionX: row.position_x,
    positionY: row.position_y,
    caseId: row.case_id,
    status: row.status as WorkflowNodeStatus
  };
}

export function getWorkflowDesignNodes(db: Database.Database, workflowDesignId: string): WorkflowNode[] {
  const rows = db.prepare('SELECT * FROM workflow_design_nodes WHERE workflow_design_id = ? ORDER BY created_at ASC').all(workflowDesignId) as any[];

  return rows.map(row => ({
    id: row.id,
    workflowDesignId: row.workflow_design_id,
    scenarioName: row.scenario_name,
    label: row.label,
    positionX: row.position_x,
    positionY: row.position_y,
    caseId: row.case_id,
    status: row.status as WorkflowNodeStatus
  }));
}

export function updateWorkflowDesignNode(
  db: Database.Database,
  nodeId: string,
  updates: {
    label?: string;
    positionX?: number;
    positionY?: number;
    caseId?: string | null;
    status?: WorkflowNodeStatus;
  }
): WorkflowNode | null {
  const existing = getWorkflowDesignNode(db, nodeId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.label !== undefined) {
    fields.push('label = ?');
    values.push(updates.label);
  }
  if (updates.positionX !== undefined) {
    fields.push('position_x = ?');
    values.push(updates.positionX);
  }
  if (updates.positionY !== undefined) {
    fields.push('position_y = ?');
    values.push(updates.positionY);
  }
  if (updates.caseId !== undefined) {
    fields.push('case_id = ?');
    values.push(updates.caseId);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }

  if (fields.length === 0) return existing;

  values.push(nodeId);
  db.prepare(`UPDATE workflow_design_nodes SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  // Update the workflow design's updated_at
  db.prepare('UPDATE workflow_designs SET updated_at = ? WHERE id = ?').run(now, existing.workflowDesignId);

  return getWorkflowDesignNode(db, nodeId);
}

export function deleteWorkflowDesignNode(db: Database.Database, nodeId: string): boolean {
  const existing = getWorkflowDesignNode(db, nodeId);
  if (!existing) return false;

  const now = new Date().toISOString();
  const result = db.prepare('DELETE FROM workflow_design_nodes WHERE id = ?').run(nodeId);

  if (result.changes > 0) {
    // Update the workflow design's updated_at
    db.prepare('UPDATE workflow_designs SET updated_at = ? WHERE id = ?').run(now, existing.workflowDesignId);
    return true;
  }
  return false;
}

// ============================================
// Workflow Design Edge Storage Functions
// ============================================

export function createWorkflowDesignEdge(
  db: Database.Database,
  id: string,
  workflowDesignId: string,
  sourceNodeId: string,
  targetNodeId: string,
  documentMapping: DocumentMapping[] | null = null
): WorkflowEdge {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO workflow_design_edges (id, workflow_design_id, source_node_id, target_node_id, document_mapping, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, workflowDesignId, sourceNodeId, targetNodeId, documentMapping ? JSON.stringify(documentMapping) : null, now);

  // Update the workflow design's updated_at
  db.prepare('UPDATE workflow_designs SET updated_at = ? WHERE id = ?').run(now, workflowDesignId);

  return {
    id,
    workflowDesignId,
    sourceNodeId,
    targetNodeId,
    documentMapping
  };
}

export function getWorkflowDesignEdge(db: Database.Database, edgeId: string): WorkflowEdge | null {
  const row = db.prepare('SELECT * FROM workflow_design_edges WHERE id = ?').get(edgeId) as any;
  if (!row) return null;

  return {
    id: row.id,
    workflowDesignId: row.workflow_design_id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    documentMapping: safeJsonParse<DocumentMapping[] | null>(row.document_mapping, null)
  };
}

export function getWorkflowDesignEdges(db: Database.Database, workflowDesignId: string): WorkflowEdge[] {
  const rows = db.prepare('SELECT * FROM workflow_design_edges WHERE workflow_design_id = ? ORDER BY created_at ASC').all(workflowDesignId) as any[];

  return rows.map(row => ({
    id: row.id,
    workflowDesignId: row.workflow_design_id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    documentMapping: safeJsonParse<DocumentMapping[] | null>(row.document_mapping, null)
  }));
}

export function getEdgesFromNode(db: Database.Database, nodeId: string): WorkflowEdge[] {
  const rows = db.prepare('SELECT * FROM workflow_design_edges WHERE source_node_id = ?').all(nodeId) as any[];

  return rows.map(row => ({
    id: row.id,
    workflowDesignId: row.workflow_design_id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    documentMapping: safeJsonParse<DocumentMapping[] | null>(row.document_mapping, null)
  }));
}

export function getEdgesToNode(db: Database.Database, nodeId: string): WorkflowEdge[] {
  const rows = db.prepare('SELECT * FROM workflow_design_edges WHERE target_node_id = ?').all(nodeId) as any[];

  return rows.map(row => ({
    id: row.id,
    workflowDesignId: row.workflow_design_id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    documentMapping: safeJsonParse<DocumentMapping[] | null>(row.document_mapping, null)
  }));
}

export function updateWorkflowDesignEdge(
  db: Database.Database,
  edgeId: string,
  updates: {
    documentMapping?: DocumentMapping[] | null;
  }
): WorkflowEdge | null {
  const existing = getWorkflowDesignEdge(db, edgeId);
  if (!existing) return null;

  if (updates.documentMapping !== undefined) {
    const now = new Date().toISOString();
    db.prepare(`UPDATE workflow_design_edges SET document_mapping = ? WHERE id = ?`)
      .run(updates.documentMapping ? JSON.stringify(updates.documentMapping) : null, edgeId);

    // Update the workflow design's updated_at
    db.prepare('UPDATE workflow_designs SET updated_at = ? WHERE id = ?').run(now, existing.workflowDesignId);
  }

  return getWorkflowDesignEdge(db, edgeId);
}

export function deleteWorkflowDesignEdge(db: Database.Database, edgeId: string): boolean {
  const existing = getWorkflowDesignEdge(db, edgeId);
  if (!existing) return false;

  const now = new Date().toISOString();
  const result = db.prepare('DELETE FROM workflow_design_edges WHERE id = ?').run(edgeId);

  if (result.changes > 0) {
    // Update the workflow design's updated_at
    db.prepare('UPDATE workflow_designs SET updated_at = ? WHERE id = ?').run(now, existing.workflowDesignId);
    return true;
  }
  return false;
}

// Helper: Get entry nodes (nodes with no incoming edges)
export function getEntryNodes(db: Database.Database, workflowDesignId: string): WorkflowNode[] {
  const rows = db.prepare(`
    SELECT n.* FROM workflow_design_nodes n
    WHERE n.workflow_design_id = ?
    AND n.id NOT IN (
      SELECT target_node_id FROM workflow_design_edges WHERE workflow_design_id = ?
    )
    ORDER BY n.created_at ASC
  `).all(workflowDesignId, workflowDesignId) as any[];

  return rows.map(row => ({
    id: row.id,
    workflowDesignId: row.workflow_design_id,
    scenarioName: row.scenario_name,
    label: row.label,
    positionX: row.position_x,
    positionY: row.position_y,
    caseId: row.case_id,
    status: row.status as WorkflowNodeStatus
  }));
}

// Helper: Get nodes that are ready to run (all upstream nodes completed)
export function getReadyNodes(db: Database.Database, workflowDesignId: string): WorkflowNode[] {
  const rows = db.prepare(`
    SELECT n.* FROM workflow_design_nodes n
    WHERE n.workflow_design_id = ?
    AND n.status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM workflow_design_edges e
      JOIN workflow_design_nodes upstream ON e.source_node_id = upstream.id
      WHERE e.target_node_id = n.id
      AND upstream.status != 'completed'
    )
    ORDER BY n.created_at ASC
  `).all(workflowDesignId) as any[];

  return rows.map(row => ({
    id: row.id,
    workflowDesignId: row.workflow_design_id,
    scenarioName: row.scenario_name,
    label: row.label,
    positionX: row.position_x,
    positionY: row.position_y,
    caseId: row.case_id,
    status: row.status as WorkflowNodeStatus
  }));
}
