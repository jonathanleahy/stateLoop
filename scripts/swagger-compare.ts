import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface OpenAPISpec {
  openapi: string;
  info: object;
  paths: Record<string, Record<string, {
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: object[];
    requestBody?: object;
    responses?: Record<string, object>;
  }>>;
  components?: {
    schemas?: Record<string, object>;
    parameters?: Record<string, object>;
    responses?: Record<string, object>;
  };
  tags?: Array<{ name: string; description?: string }>;
}

// Load original YAML spec
const originalPath = path.resolve(__dirname, '../public/api-spec.yaml');
const generatedPath = path.resolve(__dirname, '../public/swagger-generated.json');

if (!fs.existsSync(originalPath)) {
  console.error('Original spec not found:', originalPath);
  process.exit(1);
}

if (!fs.existsSync(generatedPath)) {
  console.error('Generated spec not found:', generatedPath);
  console.error('Run `npm run swagger:generate` first');
  process.exit(1);
}

const originalSpec: OpenAPISpec = YAML.parse(fs.readFileSync(originalPath, 'utf-8'));
const generatedSpec: OpenAPISpec = JSON.parse(fs.readFileSync(generatedPath, 'utf-8'));

console.log('='.repeat(60));
console.log('SWAGGER SPECIFICATION COMPARISON');
console.log('='.repeat(60));
console.log();

// Compare paths
const originalPaths = Object.keys(originalSpec.paths || {}).sort();
const generatedPaths = Object.keys(generatedSpec.paths || {}).sort();

console.log('PATH COMPARISON');
console.log('-'.repeat(40));
console.log(`Original spec: ${originalPaths.length} paths`);
console.log(`Generated spec: ${generatedPaths.length} paths`);
console.log();

// Find missing paths (in original but not in generated)
const missing = originalPaths.filter(p => !generatedPaths.includes(p));
if (missing.length > 0) {
  console.log('MISSING FROM GENERATED (routes not detected):');
  missing.forEach(p => console.log(`  - ${p}`));
  console.log();
}

// Find extra paths (in generated but not in original)
const extra = generatedPaths.filter(p => !originalPaths.includes(p));
if (extra.length > 0) {
  console.log('EXTRA IN GENERATED (undocumented routes):');
  extra.forEach(p => console.log(`  + ${p}`));
  console.log();
}

// Compare methods for matching paths
console.log('METHOD COMPARISON');
console.log('-'.repeat(40));

let methodMismatches = 0;
const commonPaths = originalPaths.filter(p => generatedPaths.includes(p));

for (const path of commonPaths) {
  const origMethods = Object.keys(originalSpec.paths[path] || {}).filter(m => m !== 'parameters').sort();
  const genMethods = Object.keys(generatedSpec.paths[path] || {}).filter(m => m !== 'parameters').sort();

  const missingMethods = origMethods.filter(m => !genMethods.includes(m));
  const extraMethods = genMethods.filter(m => !origMethods.includes(m));

  if (missingMethods.length > 0 || extraMethods.length > 0) {
    console.log(`${path}:`);
    if (missingMethods.length > 0) {
      console.log(`  Missing: ${missingMethods.join(', ')}`);
      methodMismatches++;
    }
    if (extraMethods.length > 0) {
      console.log(`  Extra: ${extraMethods.join(', ')}`);
    }
  }
}

if (methodMismatches === 0) {
  console.log('All matching paths have correct methods');
}
console.log();

// Compare descriptions
console.log('DESCRIPTION COMPARISON');
console.log('-'.repeat(40));

let missingDescriptions = 0;
let missingSummaries = 0;

for (const path of commonPaths) {
  for (const method of Object.keys(originalSpec.paths[path] || {})) {
    if (method === 'parameters') continue;

    const orig = originalSpec.paths[path][method];
    const gen = generatedSpec.paths[path]?.[method];

    if (!gen) continue;

    if (orig.summary && !gen.summary) {
      console.log(`Missing summary: ${method.toUpperCase()} ${path}`);
      missingSummaries++;
    }

    if (orig.description && !gen.description) {
      console.log(`Missing description: ${method.toUpperCase()} ${path}`);
      missingDescriptions++;
    }
  }
}

if (missingDescriptions === 0 && missingSummaries === 0) {
  console.log('All endpoints have summaries and descriptions');
}
console.log();

// Compare tags
console.log('TAG COMPARISON');
console.log('-'.repeat(40));

const origTags = (originalSpec.tags || []).map(t => t.name).sort();
const genTags = (generatedSpec.tags || []).map(t => t.name).sort();

const missingTags = origTags.filter(t => !genTags.includes(t));
const extraTags = genTags.filter(t => !origTags.includes(t));

console.log(`Original: ${origTags.length} tags`);
console.log(`Generated: ${genTags.length} tags`);

if (missingTags.length > 0) {
  console.log(`Missing tags: ${missingTags.join(', ')}`);
}
if (extraTags.length > 0) {
  console.log(`Extra tags: ${extraTags.join(', ')}`);
}
console.log();

// Summary
console.log('='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));

const issues = missing.length + extra.length + methodMismatches + missingDescriptions + missingSummaries;

if (issues === 0) {
  console.log('Generated spec matches original spec!');
  console.log('Ready to switch to auto-generated documentation.');
  process.exit(0);
} else {
  console.log(`Found ${issues} issue(s):`);
  if (missing.length > 0) console.log(`  - ${missing.length} missing paths`);
  if (extra.length > 0) console.log(`  - ${extra.length} extra/undocumented paths`);
  if (methodMismatches > 0) console.log(`  - ${methodMismatches} method mismatches`);
  if (missingSummaries > 0) console.log(`  - ${missingSummaries} missing summaries`);
  if (missingDescriptions > 0) console.log(`  - ${missingDescriptions} missing descriptions`);
  console.log();
  console.log('Add swagger-autogen comments to routes.ts to fix these issues.');
  process.exit(1);
}
