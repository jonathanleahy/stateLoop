import type Database from 'better-sqlite3';
import type {
  AgentProfile,
  CreateAgentProfileRequest,
  AgentImagePrompt,
  Sex,
  Build,
  HairColor,
  HairStyle,
  HairLength,
  EyeColor,
  FacialHair,
  Glasses,
  ClothingStyle
} from '../types/index.js';
import * as storage from '../storage/sqlite.js';

/**
 * Get an agent's profile
 */
export function getAgentProfile(db: Database.Database, agentName: string): AgentProfile | null {
  return storage.getAgentProfile(db, agentName);
}

/**
 * Create or update an agent's profile
 */
export function upsertAgentProfile(
  db: Database.Database,
  agentName: string,
  profile: CreateAgentProfileRequest
): AgentProfile {
  // Verify agent exists first
  const agent = storage.getAgentByName(db, agentName);
  if (!agent) {
    throw new Error(`Agent '${agentName}' not found`);
  }

  return storage.upsertAgentProfile(db, agentName, profile);
}

/**
 * Delete an agent's profile
 */
export function deleteAgentProfile(db: Database.Database, agentName: string): boolean {
  return storage.deleteAgentProfile(db, agentName);
}

/**
 * Get agent with profile included
 */
export function getAgentWithProfile(db: Database.Database, agentName: string) {
  return storage.getAgentWithProfile(db, agentName);
}

/**
 * Calculate age from date of birth
 */
function calculateAge(dateOfBirth: string): number {
  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/**
 * Generate an image prompt from agent profile
 */
export function generateImagePrompt(db: Database.Database, agentName: string): AgentImagePrompt | null {
  const profile = storage.getAgentProfile(db, agentName);
  if (!profile) return null;

  const parts: string[] = [];

  // Start with portrait type
  parts.push('Portrait of');

  // Age
  let age: number | null = profile.ageAppearance;
  if (!age && profile.dateOfBirth) {
    age = calculateAge(profile.dateOfBirth);
  }
  if (age) {
    parts.push(`a ${age}-year-old`);
  } else {
    parts.push('a');
  }

  // Nationality/ethnicity
  if (profile.nationality) {
    parts.push(profile.nationality);
  }

  // Sex/gender
  const genderTerm = getGenderTerm(profile.sex);
  parts.push(genderTerm);

  // Physical features
  const physicalFeatures: string[] = [];

  if (profile.eyeColor) {
    physicalFeatures.push(`${profile.eyeColor} eyes`);
  }

  // Hair description
  const hairDesc = buildHairDescription(profile.hairColor, profile.hairStyle, profile.hairLength);
  if (hairDesc) {
    physicalFeatures.push(hairDesc);
  }

  // Build
  if (profile.build) {
    physicalFeatures.push(`${profile.build} build`);
  }

  // Height
  if (profile.heightCm) {
    const heightDesc = profile.heightCm < 160 ? 'short stature' :
                       profile.heightCm > 185 ? 'tall stature' : '';
    if (heightDesc) {
      physicalFeatures.push(heightDesc);
    }
  }

  // Face shape
  if (profile.faceShape) {
    physicalFeatures.push(`${profile.faceShape} face`);
  }

  // Facial hair
  if (profile.facialHair && profile.facialHair !== 'none') {
    physicalFeatures.push(formatFacialHair(profile.facialHair));
  }

  // Skin tone
  if (profile.skinTone) {
    // Only add if it's a descriptive term, not a hex color
    if (!profile.skinTone.startsWith('#')) {
      physicalFeatures.push(`${profile.skinTone} skin`);
    }
  }

  if (physicalFeatures.length > 0) {
    parts.push(`with ${physicalFeatures.join(', ')}`);
  }

  // Glasses
  if (profile.glasses && profile.glasses !== 'none') {
    parts.push(`wearing ${formatGlasses(profile.glasses)}`);
  }

  // Clothing
  const clothingDesc = buildClothingDescription(
    profile.clothingStyle,
    profile.primaryClothingColor,
    profile.secondaryClothingColor
  );
  if (clothingDesc) {
    parts.push(clothingDesc);
  }

  // Distinguishing features
  const visibleTattoos = profile.tattoos?.filter(t => t.visible) || [];
  if (visibleTattoos.length > 0) {
    const tattooDescs = visibleTattoos.slice(0, 2).map(t => `${t.description} tattoo on ${t.location}`);
    parts.push(`with ${tattooDescs.join(' and ')}`);
  }

  // Jewelry
  if (profile.jewelry && profile.jewelry.length > 0) {
    const jewelryItems = profile.jewelry.slice(0, 3);
    parts.push(`wearing ${jewelryItems.join(', ')}`);
  }

  const prompt = parts.join(' ');

  // Build negative prompt
  const negativePrompt = buildNegativePrompt();

  return {
    agentName,
    prompt,
    negativePrompt,
    style: 'realistic portrait'
  };
}

function getGenderTerm(sex: Sex | null): string {
  switch (sex) {
    case 'male': return 'man';
    case 'female': return 'woman';
    case 'other': return 'person';
    default: return 'person';
  }
}

function buildHairDescription(
  color: HairColor | null,
  style: HairStyle | null,
  length: HairLength | null
): string | null {
  const parts: string[] = [];

  if (color) {
    parts.push(color);
  }

  if (style && style !== 'bald') {
    // Convert style to readable form
    const styleMap: Record<HairStyle, string> = {
      short: 'short',
      medium: 'medium-length',
      long: 'long',
      bald: '',
      buzzed: 'buzzed',
      curly: 'curly',
      wavy: 'wavy',
      straight: 'straight',
      ponytail: 'ponytail',
      bun: 'bun',
      braided: 'braided',
      dreadlocks: 'dreadlocks',
      afro: 'afro',
      mohawk: 'mohawk',
      undercut: 'undercut'
    };
    if (styleMap[style]) {
      parts.push(styleMap[style]);
    }
  }

  if (length && length !== 'bald' && !style) {
    // Only add length if style doesn't already imply it
    const lengthMap: Record<HairLength, string> = {
      bald: '',
      very_short: 'very short',
      short: 'short',
      medium: 'medium-length',
      long: 'long',
      very_long: 'very long'
    };
    if (lengthMap[length]) {
      parts.push(lengthMap[length]);
    }
  }

  if (style === 'bald' || length === 'bald') {
    return 'bald';
  }

  if (parts.length > 0) {
    parts.push('hair');
    return parts.join(' ');
  }

  return null;
}

function formatFacialHair(facialHair: FacialHair): string {
  const map: Record<FacialHair, string> = {
    none: '',
    stubble: 'light stubble',
    goatee: 'a goatee',
    mustache: 'a mustache',
    beard: 'a beard',
    full_beard: 'a full beard',
    sideburns: 'sideburns',
    mutton_chops: 'mutton chops'
  };
  return map[facialHair] || facialHair;
}

function formatGlasses(glasses: Glasses): string {
  const map: Record<Glasses, string> = {
    none: '',
    reading: 'reading glasses',
    prescription: 'glasses',
    sunglasses: 'sunglasses',
    round: 'round glasses',
    square: 'square-framed glasses',
    rimless: 'rimless glasses',
    cat_eye: 'cat-eye glasses',
    aviator: 'aviator glasses',
    thick_frame: 'thick-framed glasses'
  };
  return map[glasses] || glasses;
}

function buildClothingDescription(
  style: ClothingStyle | null,
  primaryColor: string | null,
  _secondaryColor: string | null
): string | null {
  if (!style) return null;

  const styleDescriptions: Record<ClothingStyle, string> = {
    casual: 'casual clothing',
    business: 'business attire',
    formal: 'formal attire',
    uniform: 'a uniform',
    creative: 'creative/artistic clothing',
    sporty: 'sporty attire',
    bohemian: 'bohemian clothing',
    punk: 'punk attire',
    vintage: 'vintage clothing',
    minimalist: 'minimalist attire'
  };

  let desc = styleDescriptions[style] || `${style} clothing`;

  if (primaryColor) {
    // Convert hex to color name or use as-is
    const colorName = hexToColorName(primaryColor);
    desc = `${colorName} ${desc}`;
  }

  return `wearing ${desc}`;
}

function hexToColorName(hex: string): string {
  // Common color mappings
  const colors: Record<string, string> = {
    '#000000': 'black',
    '#ffffff': 'white',
    '#ff0000': 'red',
    '#00ff00': 'green',
    '#0000ff': 'blue',
    '#ffff00': 'yellow',
    '#ff00ff': 'magenta',
    '#00ffff': 'cyan',
    '#2c3e50': 'navy blue',
    '#3498db': 'blue',
    '#e74c3c': 'red',
    '#2ecc71': 'green',
    '#f1c40f': 'gold',
    '#9b59b6': 'purple',
    '#1abc9c': 'teal',
    '#e67e22': 'orange',
    '#95a5a6': 'gray',
    '#34495e': 'dark gray'
  };

  const normalizedHex = hex.toLowerCase();
  if (colors[normalizedHex]) {
    return colors[normalizedHex];
  }

  // Return hex as-is if no match (AI models can interpret hex colors)
  return hex;
}

function buildNegativePrompt(): string {
  return [
    'blurry',
    'distorted',
    'disfigured',
    'bad anatomy',
    'wrong proportions',
    'extra limbs',
    'missing limbs',
    'floating limbs',
    'disconnected limbs',
    'mutation',
    'ugly',
    'duplicate',
    'morbid',
    'mutilated',
    'poorly drawn face',
    'deformed',
    'low quality',
    'watermark',
    'text'
  ].join(', ');
}

/**
 * Generate a character description for use in prompts
 */
export function generateCharacterDescription(db: Database.Database, agentName: string): string | null {
  const profile = storage.getAgentProfile(db, agentName);
  if (!profile) return null;

  const lines: string[] = [];

  lines.push(`CHARACTER PROFILE:`);
  lines.push(`Name: ${agentName}`);

  // Age
  let age: number | null = profile.ageAppearance;
  if (profile.dateOfBirth) {
    const actualAge = calculateAge(profile.dateOfBirth);
    const birthDate = new Date(profile.dateOfBirth);
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const formattedDate = `${monthNames[birthDate.getMonth()]} ${birthDate.getDate()}, ${birthDate.getFullYear()}`;

    if (profile.ageAppearance && profile.ageAppearance !== actualAge) {
      lines.push(`Age: ${profile.ageAppearance} (appears), ${actualAge} (born ${formattedDate})`);
    } else {
      lines.push(`Age: ${actualAge} (born ${formattedDate})`);
      age = actualAge;
    }
  } else if (profile.ageAppearance) {
    lines.push(`Age: ${profile.ageAppearance}`);
  }

  // Nationality and birthplace
  if (profile.nationality || profile.placeOfBirthCity || profile.placeOfBirthCountry) {
    let locationParts: string[] = [];
    if (profile.nationality) {
      locationParts.push(profile.nationality);
    }
    if (profile.placeOfBirthCity || profile.placeOfBirthCountry) {
      const birthplace = [profile.placeOfBirthCity, profile.placeOfBirthCountry]
        .filter(Boolean).join(', ');
      locationParts.push(`(from ${birthplace})`);
    }
    lines.push(`Nationality: ${locationParts.join(' ')}`);
  }

  // Physical description
  const physicalParts: string[] = [];
  if (profile.build) physicalParts.push(`${profile.build} build`);
  if (profile.heightCm) physicalParts.push(`${profile.heightCm}cm tall`);
  if (profile.eyeColor) physicalParts.push(`${profile.eyeColor} eyes`);

  const hairDesc = buildHairDescription(profile.hairColor, profile.hairStyle, profile.hairLength);
  if (hairDesc) physicalParts.push(hairDesc);

  if (physicalParts.length > 0) {
    lines.push(`Physical: ${physicalParts.join(', ')}`);
  }

  // Backstory
  if (profile.backstory) {
    lines.push('');
    lines.push(`Background: ${profile.backstory}`);
  }

  // Personality
  if (profile.personalityTraits && profile.personalityTraits.length > 0) {
    lines.push('');
    lines.push(`Personality: ${profile.personalityTraits.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Sync profile data to agent appearance (for visual rendering)
 * Maps profile fields to the existing appearance JSON structure
 */
export function syncProfileToAppearance(profile: AgentProfile): Record<string, unknown> {
  const appearance: Record<string, unknown> = {};

  // Gender mapping
  if (profile.sex) {
    appearance.gender = profile.sex;
  }

  // Body style mapping
  if (profile.build) {
    const buildMap: Record<Build, string> = {
      slim: 'normal',
      average: 'normal',
      athletic: 'normal',
      stocky: 'wide',
      heavy: 'wide'
    };
    appearance.bodyStyle = buildMap[profile.build] || 'normal';
  }

  // Skin tone
  if (profile.skinTone) {
    appearance.skinTone = profile.skinTone;
  }

  // Hair color
  if (profile.hairColor) {
    appearance.hairColor = profile.hairColor;
  }

  // Glasses -> accessory
  if (profile.glasses && profile.glasses !== 'none') {
    if (['reading', 'prescription', 'round', 'square', 'rimless'].includes(profile.glasses)) {
      appearance.accessory = 'glasses';
    } else if (profile.glasses === 'sunglasses') {
      appearance.accessory = 'glasses'; // or could be 'sunglasses' if supported
    }
  }

  // Clothing color
  if (profile.primaryClothingColor) {
    appearance.color = profile.primaryClothingColor;
  }

  // Age appearance -> age category
  if (profile.ageAppearance) {
    if (profile.ageAppearance < 13) {
      appearance.age = 'child';
    } else if (profile.ageAppearance < 20) {
      appearance.age = 'teen';
    } else if (profile.ageAppearance < 40) {
      appearance.age = 'adult';
    } else if (profile.ageAppearance < 60) {
      appearance.age = 'middle';
    } else {
      appearance.age = 'elderly';
    }
  }

  // Clothing style -> professional role
  if (profile.clothingStyle) {
    const styleMap: Record<ClothingStyle, string | undefined> = {
      casual: undefined,
      business: 'business_suit',
      formal: 'business_suit',
      uniform: undefined,  // Would need context for specific uniform
      creative: undefined,
      sporty: undefined,
      bohemian: undefined,
      punk: undefined,
      vintage: undefined,
      minimalist: undefined
    };
    const role = styleMap[profile.clothingStyle];
    if (role) {
      appearance.professionalRole = role;
    }
  }

  return appearance;
}
