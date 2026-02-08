// Case status
export type CaseStatus = 'active' | 'resolved' | 'abandoned';

// Resolution outcomes
export type CaseOutcome = 'agreed' | 'failed' | 'abandoned';

// Message types
export type MessageType = 'proposal' | 'counter' | 'accept' | 'reject' | 'message';

// Participant in a case
export interface Participant {
  id: string;
  caseId: string;
  name: string;
  preferences: string[];
  constraints: string[];
  isPayer: boolean;

  // Core trait scores (0-100)
  agreeability?: number;     // Willingness to compromise (0=immovable, 100=pushover)
  intelligence?: string;     // Score + type, e.g. "75, practical" or "90, analytical"
  patience?: number;         // Tolerance for frustration (0=explosive, 100=zen)
  confidence?: number;       // Self-assurance (0=insecure, 100=arrogant)
  empathy?: number;          // Consideration of others (0=oblivious, 100=deeply attuned)
  assertiveness?: number;    // Directness in stating needs (0=passive, 100=domineering)

  // Additional trait scores (0-100)
  honesty?: number;          // Truthfulness (0=manipulative, 100=bluntly honest)
  trust?: number;            // How easily they trust others (0=paranoid, 100=naive)
  riskTolerance?: number;    // Comfort with uncertainty (0=risk-averse, 100=reckless)
  stressTolerance?: number;  // Function under pressure (0=fragile, 100=ice cold)
  statusAwareness?: number;  // Care about hierarchy (0=status-blind, 100=obsessed)
  energy?: number;           // Baseline energy (0=low energy, 100=intense)

  // Behavioral modifiers
  humor?: string;            // none, dry, warm, nervous, cutting, self-deprecating
  personality?: string;      // Archetype and traits description
  variability?: number;      // 0.0-1.0 unpredictability
  mood?: string;             // Starting mood
  quirks?: string;           // Behavioral tendencies
  triggers?: string;         // Topics that provoke strong reactions

  // Persona attributes for authentic character portrayal
  background?: string;       // Life history, education, career path
  origin?: string;           // Where they grew up (affects accent/dialect)
  speech?: string;           // Accent markers, vocabulary, speech patterns
}

// Available option for negotiation
export interface Option {
  id: string;
  caseId: string;
  name: string;
  category: string;      // e.g., "Italian", "Position A", "Agree"
  priceRange: string;    // or other ranking/level indicator
  features: string[];
}

// Conversation message
export interface Message {
  id: string;
  caseId: string;
  author: string;
  type: MessageType;
  content: string;
  thoughts: string | null;     // Agent's internal reasoning (shown to observers, not other agents)
  optionId: string | null;     // The option being proposed/discussed
  timestamp: string;
  agentContext: string | null; // The private agenda/context the agent received
}

// Boss message to agents
export interface BossMessage {
  id: string;
  caseId: string;
  content: string;
  targetAgent: string | null;
  read: boolean;
  timestamp: string;
}

// Location type for visual display
export type LocationType = 'hospital' | 'office' | 'school' | 'library' | 'cafe' | 'park' | 'studio' | 'courtroom' | 'outdoor';

// Source of scenario content
export type ScenarioSource = 'file' | 'text' | 'api';

// Main case entity
export interface Case {
  id: string;
  scenario: string;
  scenarioName: string | null;         // Name/title of the scenario (from SCENARIO: tag or filename)
  scenarioSource: ScenarioSource | null; // Where scenario came from: file, text input, or API
  status: CaseStatus;
  currentTurn: string | null;
  outcome: CaseOutcome | null;
  selectedOptionId: string | null;
  resolutionSummary: string | null;
  maxRounds?: number;                  // max message rounds before timeout (default: unlimited)
  taskType: TaskType | null;           // "options", "document", or "both"
  taskOutput: string | null;           // final output document
  locationType: LocationType | null;   // AI-determined location type for visual display
  locationName: string | null;         // Display name for location (e.g., "South Bristol Hospital")
  locationFurniture: string[] | null;  // Array of furniture item IDs to display
  formDefinition: FormDefinition | null; // Form schema if case uses forms
  completedForm: CompletedForm | null;   // Submitted form data
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

// Case with all relations populated
export interface CaseWithRelations extends Case {
  participants: Participant[];
  options: Option[];
  messages: Message[];
  bossMessages: BossMessage[];
  inputDocuments: InputDocument[];
  workingDocuments: WorkingDocument[];
}

// API request log
export interface RequestLog {
  id: string;
  method: string;
  path: string;
  queryParams: string | null;
  bodySnippet: string | null;
  statusCode: number;
  durationMs: number;
  caseId: string | null;
  timestamp: string;
}

// Create case request
export interface CreateCaseRequest {
  scenario: string;
  participants: Array<{
    id: string;
    name: string;
    preferences: string[];
    constraints: string[];
    isPayer: boolean;
  }>;
  options?: Array<{
    id: string;
    name: string;
    category: string;
    priceRange: string;
    features: string[];
  }>;
}

// Task returned to agent
export interface AgentTask {
  caseId: string;
  taskId: string;
  role: Participant;
  scenario: string;
  options: Option[];
  conversationHistory: Array<{
    author: string;
    authorName: string;
    type: MessageType;
    content: string;
    optionId: string | null;
    timestamp: string;
  }>;
  instruction: string;
  bossMessages: Array<{
    content: string;
    timestamp: string;
  }>;
  inputDocuments: Array<{
    name: string;
    content: string;
  }>;
  workingDocuments: Array<{
    name: string;
    content: string;
    lastEditedBy: string | null;
  }>;
}

// Submit response request
export interface SubmitResponseRequest {
  taskId: string;
  agentId: string;
  agentContext?: string; // The agenda/context the agent received (for debugging)
  response: {
    type: MessageType;
    content: string;
    thoughts?: string;     // Internal reasoning (shown to observers, not other agents)
    optionId?: string;
  };
}

// Resolve case request
export interface ResolveCaseRequest {
  outcome: CaseOutcome;
  selectedOptionId?: string;
  summary?: string;
}

// Boss message request
export interface BossMessageRequest {
  content: string;
  targetAgent?: string;
}

// Error response
export interface ApiError {
  code: string;
  message: string;
}

// Input document - context provided to a case
export interface InputDocument {
  id: string;
  caseId: string;
  name: string;
  content: string;
  source: 'inline' | 'file' | 'api' | 'url' | 'ai';
  createdAt: string;
}

// Working document - collaborative doc agents read/write during negotiation
export interface WorkingDocument {
  id: string;
  caseId: string;
  name: string;
  content: string;
  docType: 'freeform' | 'template';
  template: string | null;
  createdAt: string;
  updatedAt: string;
  lastEditedBy: string | null;
}

// Document edit history entry
export interface DocumentEdit {
  id: string;
  documentId: string;
  caseId: string;
  agentId: string | null;
  agentName: string | null;
  editType: 'create' | 'append' | 'prepend' | 'replace' | 'replace_section';
  contentBefore: string | null;
  contentAfter: string;
  timestamp: string;
}

// Agent case history - tracks agent participation across cases
export interface AgentCaseHistory {
  id: string;
  agentName: string;
  caseId: string;
  participantId: string;
  scenario: string;
  roleSummary: string;
  outcome: string | null;
  createdAt: string;
}

// Document update in agent response
export interface DocumentUpdate {
  document: string;
  action: 'append' | 'prepend' | 'replace' | 'replace_section';
  content: string;
  section?: string;
}

// Task type for cases
export type TaskType = 'options' | 'document' | 'both';

// Extended submit response request with document updates
export interface SubmitResponseWithDocsRequest extends SubmitResponseRequest {
  response: SubmitResponseRequest['response'] & {
    documentUpdates?: DocumentUpdate[];
  };
}

// Create input document request
export interface CreateInputDocumentRequest {
  name: string;
  content: string;
  source?: 'inline' | 'file' | 'api' | 'url';
}

// Create working document request
export interface CreateWorkingDocumentRequest {
  name: string;
  content?: string;
  docType?: 'freeform' | 'template';
  template?: string;
}

// Update working document request (full replace)
export interface UpdateWorkingDocumentRequest {
  content: string;
  agentId?: string;
}

// Patch working document request (append/prepend/section)
export interface PatchWorkingDocumentRequest {
  action: 'append' | 'prepend' | 'replace_section';
  content: string;
  section?: string;
  agentId?: string;
}

// Set task output request
export interface SetTaskOutputRequest {
  content: string;
  generatedBy?: string;
}

// ============================================
// Image Types
// ============================================

// Image format types
export type ImageFormat = 'svg' | 'png' | 'webp';
export type ImageMimeType = 'image/svg+xml' | 'image/png' | 'image/webp';

// Case image - SVG or raster image attached to a case
export interface CaseImage {
  id: string;
  caseId: string;
  name: string;
  content: string;
  mimeType: ImageMimeType;
  width: number | null;
  height: number | null;
  format: ImageFormat;
  generatedBy: string | null;
  prompt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// Image edit history
export interface ImageEdit {
  id: string;
  imageId: string;
  caseId: string;
  agentId: string | null;
  agentName: string | null;
  editType: 'create' | 'replace' | 'delete';
  contentBefore: string | null;
  contentAfter: string;
  timestamp: string;
}

// Create image request
export interface CreateImageRequest {
  name: string;
  content: string;
  prompt?: string;
  agentId?: string;
}

// Update image request
export interface UpdateImageRequest {
  content: string;
  agentId?: string;
}

// Image generation in agent response
export interface ImageGeneration {
  name: string;
  content: string;
  prompt?: string;
}

// ============================================
// Company Types
// ============================================

// Company size classification
export type CompanySize = 'small' | 'medium' | 'large' | 'enterprise';

// Room types within buildings
export type RoomType = 'office' | 'meeting_room' | 'break_room' | 'studio' | 'reception' | 'storage' | 'lab' | 'other';

// Employment types
export type EmploymentType = 'full_time' | 'part_time' | 'contractor';

// Per-case role types for non-employees
export type CaseRoleType = 'visitor' | 'contractor' | 'temp' | 'consultant';

// Access levels for per-case roles
export type AccessLevel = 'full' | 'limited' | 'escorted';

// Company entity
export interface Company {
  id: string;
  name: string;
  industry: string | null;
  size: CompanySize | null;
  description: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// Company with counts for list views
export interface CompanyListItem extends Company {
  buildingCount: number;
  employeeCount: number;
  policyCount: number;
}

// Company with all relations
export interface CompanyWithRelations extends Company {
  buildings: CompanyBuilding[];
  policies: CompanyPolicy[];
  employees: CompanyEmployee[];
}

// Building within a company
export interface CompanyBuilding {
  id: string;
  companyId: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  description: string | null;
  locationType: LocationType | null;
  defaultFurniture: string[] | null;
  createdAt: string;
}

// Building with rooms
export interface CompanyBuildingWithRooms extends CompanyBuilding {
  rooms: CompanyRoom[];
}

// Room within a building
export interface CompanyRoom {
  id: string;
  buildingId: string;
  companyId: string;
  name: string;
  roomType: RoomType;
  floor: number | null;
  capacity: number | null;
  furniture: string[] | null;
  description: string | null;
  createdAt: string;
}

// Policy category (seeded reference data)
export interface PolicyCategory {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
}

// Company HR policy
export interface CompanyPolicy {
  id: string;
  companyId: string;
  categoryId: string;
  title: string;
  summary: string;
  fullText: string;
  effectiveDate: string | null;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Policy with category info
export interface CompanyPolicyWithCategory extends CompanyPolicy {
  category: PolicyCategory;
}

// Employee (agent-company link)
export interface CompanyEmployee {
  id: string;
  companyId: string;
  agentName: string;
  jobTitle: string;
  department: string | null;
  managerAgentName: string | null;
  startDate: string | null;
  employmentType: EmploymentType;
  officeRoomId: string | null;
  createdAt: string;
}

// Employee with room info
export interface CompanyEmployeeWithRoom extends CompanyEmployee {
  officeRoom: CompanyRoom | null;
}

// Case-company association
export interface CaseCompany {
  id: string;
  caseId: string;
  companyId: string;
  buildingId: string | null;
  roomId: string | null;
  createdAt: string;
}

// Case company context for prompts
export interface CaseCompanyContext {
  company: Company;
  building: CompanyBuilding | null;
  room: CompanyRoom | null;
  policies: Array<{
    id: string;
    title: string;
    summary: string;
    category: string;
  }>;
}

// Per-case agent role (for non-employees)
export interface CaseAgentRole {
  id: string;
  caseId: string;
  participantId: string;
  roleType: CaseRoleType;
  roleTitle: string | null;
  department: string | null;
  accessLevel: AccessLevel;
  notes: string | null;
  createdAt: string;
}

// ============================================
// Company API Request Types
// ============================================

// Create company request
export interface CreateCompanyRequest {
  name: string;
}

// Update company request
export interface UpdateCompanyRequest {
  industry?: string;
  size?: CompanySize;
  description?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  metadata?: Record<string, unknown>;
}

// Create building request
export interface CreateBuildingRequest {
  name: string;
  address?: string;
  city?: string;
  country?: string;
  description?: string;
  locationType?: LocationType;
  defaultFurniture?: string[];
}

// Create room request
export interface CreateRoomRequest {
  name: string;
  roomType: RoomType;
  floor?: number;
  capacity?: number;
  furniture?: string[];
  description?: string;
}

// Create policy request
export interface CreatePolicyRequest {
  categoryId: string;
  title: string;
  summary: string;
  fullText: string;
  effectiveDate?: string;
}

// Create employee request
export interface CreateEmployeeRequest {
  agentName: string;
  jobTitle: string;
  department?: string;
  managerAgentName?: string;
  startDate?: string;
  employmentType?: EmploymentType;
  officeRoomId?: string;
}

// Associate case with company request
export interface AssociateCaseCompanyRequest {
  companyId: string;
  buildingId?: string;
  roomId?: string;
}

// Create case agent role request
export interface CreateCaseAgentRoleRequest {
  participantId: string;
  roleType: CaseRoleType;
  roleTitle?: string;
  department?: string;
  accessLevel?: AccessLevel;
  notes?: string;
}

// Company setup request (AI bulk creation)
export interface CompanySetupRequest {
  setup: {
    industry?: string;
    size?: CompanySize;
    description?: string;
    primaryColor?: string;
    secondaryColor?: string;
    buildings?: Array<{
      name: string;
      address?: string;
      city?: string;
      country?: string;
      description?: string;
      locationType?: LocationType;
      rooms?: Array<{
        name: string;
        roomType: RoomType;
        floor?: number;
        capacity?: number;
        furniture?: string[];
        description?: string;
      }>;
    }>;
    policies?: Array<{
      category: string;
      title: string;
      summary: string;
      fullText: string;
      effectiveDate?: string;
    }>;
    employees?: Array<{
      agentName: string;
      jobTitle: string;
      department?: string;
      managerAgentName?: string;
      employmentType?: EmploymentType;
    }>;
  };
}

// Company setup response
export interface CompanySetupResponse {
  company: CompanyWithRelations;
  created: {
    buildings: number;
    rooms: number;
    policies: number;
    employees: number;
  };
}

// ============================================
// Agent Profile Types
// ============================================

// Physical characteristics
export type Sex = 'male' | 'female' | 'other';
export type Build = 'slim' | 'average' | 'athletic' | 'stocky' | 'heavy';
export type EyeColor = 'brown' | 'blue' | 'green' | 'hazel' | 'gray' | 'amber';
export type HairColor = 'black' | 'brown' | 'blonde' | 'red' | 'gray' | 'white' | 'auburn' | 'strawberry_blonde' | 'silver' | 'platinum';
export type HairStyle = 'short' | 'medium' | 'long' | 'bald' | 'buzzed' | 'curly' | 'wavy' | 'straight' | 'ponytail' | 'bun' | 'braided' | 'dreadlocks' | 'afro' | 'mohawk' | 'undercut';
export type HairLength = 'bald' | 'very_short' | 'short' | 'medium' | 'long' | 'very_long';
export type FacialHair = 'none' | 'stubble' | 'goatee' | 'mustache' | 'beard' | 'full_beard' | 'sideburns' | 'mutton_chops';
export type FaceShape = 'round' | 'oval' | 'square' | 'heart' | 'long' | 'diamond' | 'rectangular' | 'triangular';
export type Glasses = 'none' | 'reading' | 'prescription' | 'sunglasses' | 'round' | 'square' | 'rimless' | 'cat_eye' | 'aviator' | 'thick_frame';
export type JewelryItem = 'earrings' | 'necklace' | 'rings' | 'watch' | 'bracelet' | 'piercing' | 'nose_ring' | 'eyebrow_ring';
export type ClothingStyle = 'casual' | 'business' | 'formal' | 'uniform' | 'creative' | 'sporty' | 'bohemian' | 'punk' | 'vintage' | 'minimalist';

// Additional facial features for drawing
export type NoseShape = 'straight' | 'roman' | 'button' | 'upturned' | 'hooked' | 'wide' | 'narrow' | 'bulbous';
export type LipShape = 'thin' | 'full' | 'bow_shaped' | 'wide' | 'downturned' | 'asymmetric';
export type EyebrowShape = 'straight' | 'arched' | 'rounded' | 'flat' | 'S_shaped' | 'thick' | 'thin' | 'bushy';
export type EyeShape = 'almond' | 'round' | 'hooded' | 'downturned' | 'upturned' | 'monolid' | 'deep_set' | 'wide_set' | 'close_set';
export type ChinShape = 'pointed' | 'rounded' | 'square' | 'cleft' | 'double' | 'receding' | 'prominent';
export type Complexion = 'clear' | 'freckled' | 'weathered' | 'rosy' | 'pale' | 'ruddy' | 'acne_scarred' | 'wrinkled' | 'smooth';
export type Posture = 'upright' | 'slouched' | 'rigid' | 'relaxed' | 'hunched' | 'confident' | 'defensive';
export type Gait = 'confident_stride' | 'shuffle' | 'brisk' | 'slow' | 'limping' | 'bouncy' | 'graceful' | 'heavy';
export type RestingExpression = 'neutral' | 'friendly' | 'stern' | 'tired' | 'worried' | 'amused' | 'intense' | 'dreamy';
export type SkinTone = 'very_fair' | 'fair' | 'light' | 'medium' | 'olive' | 'tan' | 'brown' | 'dark_brown' | 'deep';

// Tattoo/scar with location
export interface DistinguishingMark {
  description: string;
  location: string;          // e.g., 'left arm', 'neck', 'face'
  visible: boolean;          // Visible in normal attire?
}

// Agent profile
export interface AgentProfile {
  id: string;
  agentName: string;

  // Passport-like identity
  dateOfBirth: string | null;          // YYYY-MM-DD
  placeOfBirthCity: string | null;
  placeOfBirthCountry: string | null;
  nationality: string | null;
  nationalities: string[] | null;      // For multiple nationalities
  sex: Sex | null;

  // Physical features - Body
  heightCm: number | null;
  weightKg: number | null;
  build: Build | null;
  skinTone: SkinTone | string | null;
  ageAppearance: number | null;       // Apparent age (may differ from DOB)
  posture: Posture | null;
  gait: Gait | null;

  // Physical features - Face
  faceShape: FaceShape | null;
  eyeColor: EyeColor | null;
  eyeShape: EyeShape | null;
  noseShape: NoseShape | null;
  lipShape: LipShape | null;
  eyebrowShape: EyebrowShape | null;
  chinShape: ChinShape | null;
  complexion: Complexion | null;
  restingExpression: RestingExpression | null;

  // Physical features - Hair
  hairColor: HairColor | null;
  hairStyle: HairStyle | null;
  hairLength: HairLength | null;
  facialHair: FacialHair | null;
  hairTexture: string | null;         // e.g., 'fine', 'coarse', 'wiry'
  grayPercentage: number | null;      // 0-100, for aging

  // Glasses & Jewelry
  glasses: Glasses | null;
  jewelry: JewelryItem[] | null;

  // Distinguishing Marks
  tattoos: DistinguishingMark[] | null;
  scars: DistinguishingMark[] | null;
  birthmarks: DistinguishingMark[] | null;
  distinguishingFeatures: string[] | null;  // Free text for unique features

  // Clothing
  clothingStyle: ClothingStyle | null;
  primaryClothingColor: string | null;
  secondaryClothingColor: string | null;
  typicalOutfit: string | null;       // Description of what they usually wear

  // Voice & Mannerisms
  voiceDescription: string | null;    // e.g., 'deep and gravelly', 'high and nasal'
  accentDescription: string | null;
  mannerisms: string[] | null;        // e.g., 'taps fingers', 'clears throat often'

  // Backstory
  backstory: string | null;
  personalityTraits: string[] | null;

  // Life History (Growing Up)
  childhoodSummary: string | null;       // Brief description of childhood
  childhoodLocation: string | null;       // Where they grew up
  familyBackground: string | null;        // Parents, siblings, family situation
  education: string[] | null;             // Schools, degrees, certifications
  careerPath: string[] | null;            // Job history in chronological order
  significantEvents: string[] | null;     // Life events that shaped them
  relationships: string[] | null;         // Key relationships (not necessarily romantic)
  formativeExperiences: string[] | null;  // Experiences that defined their personality
  currentSituation: string | null;        // Where they are in life now
  fears: string[] | null;                 // What they're afraid of
  desires: string[] | null;               // What they want in life
  secrets: string[] | null;               // Things they don't share openly
  skills: string[] | null;                // Abilities and talents
  hobbies: string[] | null;               // What they do for fun

  // Photo
  photoUrl: string | null;
  photoPrompt: string | null;

  createdAt: string;
  updatedAt: string;
}

// Create/update profile request
export interface CreateAgentProfileRequest {
  // Identity
  dateOfBirth?: string;
  placeOfBirthCity?: string;
  placeOfBirthCountry?: string;
  nationality?: string;
  nationalities?: string[];
  sex?: Sex;

  // Body
  heightCm?: number;
  weightKg?: number;
  build?: Build;
  skinTone?: SkinTone | string;
  ageAppearance?: number;
  posture?: Posture;
  gait?: Gait;

  // Face
  faceShape?: FaceShape;
  eyeColor?: EyeColor;
  eyeShape?: EyeShape;
  noseShape?: NoseShape;
  lipShape?: LipShape;
  eyebrowShape?: EyebrowShape;
  chinShape?: ChinShape;
  complexion?: Complexion;
  restingExpression?: RestingExpression;

  // Hair
  hairColor?: HairColor;
  hairStyle?: HairStyle;
  hairLength?: HairLength;
  facialHair?: FacialHair;
  hairTexture?: string;
  grayPercentage?: number;

  // Accessories
  glasses?: Glasses;
  jewelry?: JewelryItem[];

  // Distinguishing marks
  tattoos?: DistinguishingMark[];
  scars?: DistinguishingMark[];
  birthmarks?: DistinguishingMark[];
  distinguishingFeatures?: string[];

  // Clothing
  clothingStyle?: ClothingStyle;
  primaryClothingColor?: string;
  secondaryClothingColor?: string;
  typicalOutfit?: string;

  // Voice & mannerisms
  voiceDescription?: string;
  accentDescription?: string;
  mannerisms?: string[];

  // Background
  backstory?: string;
  personalityTraits?: string[];

  // Life History (Growing Up)
  childhoodSummary?: string;
  childhoodLocation?: string;
  familyBackground?: string;
  education?: string[];
  careerPath?: string[];
  significantEvents?: string[];
  relationships?: string[];
  formativeExperiences?: string[];
  currentSituation?: string;
  fears?: string[];
  desires?: string[];
  secrets?: string[];
  skills?: string[];
  hobbies?: string[];
}

// Image prompt response
export interface AgentImagePrompt {
  agentName: string;
  prompt: string;
  negativePrompt: string;
  style: string;
}

// ============================================
// Workflow Types
// ============================================

// Workflow status
export type WorkflowStatus = 'pending' | 'active' | 'completed' | 'failed';

// Workflow stage type
export type WorkflowStageType = 'collaborative' | 'solo' | 'review';

// Workflow stage status
export type WorkflowStageStatus = 'pending' | 'active' | 'completed' | 'skipped';

// Workflow entity
export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  templateName: string | null;
  status: WorkflowStatus;
  currentStageIndex: number;
  inputs: Record<string, string> | null;
  outputs: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

// Workflow stage
export interface WorkflowStage {
  id: string;
  workflowId: string;
  stageIndex: number;
  name: string;
  description: string | null;
  type: WorkflowStageType;
  status: WorkflowStageStatus;
  caseId: string | null;
  agentCount: number;
  inputDocuments: string[] | null;
  outputDocument: string | null;
  createdAt: string;
  completedAt: string | null;
}

// Workflow with stages
export interface WorkflowWithStages extends Workflow {
  stages: WorkflowStage[];
}

// Workflow progress
export interface WorkflowProgress {
  workflowId: string;
  name: string;
  status: WorkflowStatus;
  currentStageIndex: number;
  totalStages: number;
  percentComplete: number;
  stages: Array<{
    name: string;
    status: WorkflowStageStatus;
    type: WorkflowStageType;
  }>;
}

// Workflow output
export interface WorkflowOutput {
  workflowId: string;
  status: WorkflowStatus;
  outputs: Record<string, string>;
  stages: Array<{
    name: string;
    output: string | null;
  }>;
}

// Workflow diagram
export interface WorkflowDiagram {
  workflowId: string;
  format: 'mermaid' | 'json';
  content: string;
}

// Create workflow request
export interface CreateWorkflowRequest {
  name: string;
  description?: string;
  templateName?: string;
  stages: Array<{
    name: string;
    description?: string;
    type: WorkflowStageType;
    agentCount?: number;
    outputDocument?: string;
  }>;
}

// Start workflow request
export interface StartWorkflowRequest {
  inputs?: Record<string, string>;
}

// ============================================
// Workflow Template Types
// ============================================

// Workflow template (loaded from YAML)
export interface WorkflowTemplate {
  name: string;
  title: string;
  description: string | null;
  version: number;
  inputs: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
  stages: Array<{
    name: string;
    type: WorkflowStageType;
    description?: string;
    agentCount?: number;
    output?: string;
  }>;
  output: {
    primary: string;
    include?: string[];
  };
}

// ============================================
// Goal Types
// ============================================

// Goal type
export type GoalType = 'creative_writing' | 'decision_making' | 'problem_solving' | 'document_creation' | 'review_feedback';

// Goal status
export type GoalStatus = 'pending' | 'planning' | 'executing' | 'completed' | 'failed';

// Goal entity
export interface Goal {
  id: string;
  type: GoalType;
  objective: string;
  constraints: string[] | null;
  status: GoalStatus;
  workflowId: string | null;
  plan: GoalPlan | null;
  output: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

// Goal execution plan
export interface GoalPlan {
  phases: Array<{
    name: string;
    description: string;
    type: WorkflowStageType;
    agentCount: number;
  }>;
  estimatedDuration: string | null;
  reasoning: string;
}

// Create goal request
export interface CreateGoalRequest {
  type: GoalType;
  objective: string;
  constraints?: string[];
}

// ============================================
// Form Types
// ============================================

// Form field types
export type FormFieldType = 'text' | 'textarea' | 'date' | 'select' | 'checkbox';

// Form field definition (from scenario)
export interface FormFieldDefinition {
  name: string;
  type: FormFieldType;
  required: boolean;
  label: string;
  options?: string[];  // for select fields
  placeholder?: string;
}

// Form definition (from scenario)
export interface FormDefinition {
  name: string;
  description: string;
  fields: FormFieldDefinition[];
}

// Completed form data
export interface CompletedForm {
  formName: string;
  completedBy: string;  // agent ID or name
  completedAt: string;
  data: Record<string, string | boolean>;  // field name -> value
  caseOutcome: CaseOutcome;
  selectedOption?: string;
}

// ============================================
// Workflow Designer Types
// ============================================

// Workflow design status
export type WorkflowDesignStatus = 'draft' | 'ready' | 'running' | 'paused' | 'completed' | 'failed';

// Workflow node status
export type WorkflowNodeStatus = 'pending' | 'ready' | 'running' | 'paused' | 'completed' | 'failed';

// Canvas state for pan/zoom
export interface CanvasState {
  panX: number;
  panY: number;
  zoom: number;
}

// Document mapping between workflow nodes
export interface DocumentMapping {
  source: string;
  target: string;
}

// Workflow design - the overall workflow
export interface WorkflowDesign {
  id: string;
  name: string;
  description: string | null;
  status: WorkflowDesignStatus;
  canvasState: CanvasState | null;
  createdAt: string;
  updatedAt: string;
}

// Workflow design with nodes and edges
export interface WorkflowDesignWithRelations extends WorkflowDesign {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// Workflow node - a scenario in the workflow
export interface WorkflowNode {
  id: string;
  workflowDesignId: string;
  scenarioName: string;
  label: string | null;
  positionX: number;
  positionY: number;
  caseId: string | null;
  status: WorkflowNodeStatus;
}

// Workflow node with scenario info
export interface WorkflowNodeWithScenario extends WorkflowNode {
  scenarioIcon?: string;
  scenarioLocation?: string;
  agentCount?: number;
}

// Workflow edge - connection between nodes
export interface WorkflowEdge {
  id: string;
  workflowDesignId: string;
  sourceNodeId: string;
  targetNodeId: string;
  documentMapping: DocumentMapping[] | null;
}

// Workflow execution status
export interface WorkflowExecutionStatus {
  workflowId: string;
  status: WorkflowDesignStatus;
  currentNodeId: string | null;
  completedNodes: string[];
  failedNodes: string[];
  pendingNodes: string[];
}

// ============================================
// Workflow Designer API Request Types
// ============================================

// Create workflow design request
export interface CreateWorkflowDesignRequest {
  name: string;
  description?: string;
}

// Update workflow design request
export interface UpdateWorkflowDesignRequest {
  name?: string;
  description?: string;
  canvasState?: CanvasState;
}

// Create workflow node request
export interface CreateWorkflowNodeRequest {
  scenarioName: string;
  label?: string;
  positionX: number;
  positionY: number;
}

// Update workflow node request
export interface UpdateWorkflowNodeRequest {
  label?: string;
  positionX?: number;
  positionY?: number;
}

// Create workflow edge request
export interface CreateWorkflowEdgeRequest {
  sourceNodeId: string;
  targetNodeId: string;
  documentMapping?: DocumentMapping[];
}

// Update workflow edge request
export interface UpdateWorkflowEdgeRequest {
  documentMapping?: DocumentMapping[];
}

// Run workflow request
export interface RunWorkflowRequest {
  // Optional inputs to pass to entry nodes
  inputs?: Record<string, string>;
}

// Continue workflow request
export interface ContinueWorkflowRequest {
  // Node to continue from (optional, continues from paused node if not specified)
  nodeId?: string;
}
