/**
 * SVG Validation and Sanitization Service
 *
 * Validates SVG content for security concerns:
 * - No script tags or event handlers
 * - No external resources (images, stylesheets)
 * - No foreignObject (can embed HTML)
 * - No data URIs with executable content
 */

export interface SvgValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitized?: string;
}

export interface SvgMetadata {
  width: number | null;
  height: number | null;
  viewBox: string | null;
  title: string | null;
  description: string | null;
}

// Dangerous elements that should be blocked
const BLOCKED_ELEMENTS = [
  'script',
  'foreignObject',
  'iframe',
  'embed',
  'object',
  'applet'
];

// Dangerous attributes (event handlers)
const BLOCKED_ATTRIBUTES = [
  'onload', 'onerror', 'onclick', 'onmouseover', 'onmouseout',
  'onmousedown', 'onmouseup', 'onmousemove', 'onfocus', 'onblur',
  'onchange', 'onsubmit', 'onreset', 'onselect', 'onkeydown',
  'onkeypress', 'onkeyup', 'ondblclick', 'ondrag', 'ondragend',
  'ondragenter', 'ondragleave', 'ondragover', 'ondragstart', 'ondrop',
  'onscroll', 'onwheel', 'oncopy', 'oncut', 'onpaste', 'onanimationstart',
  'onanimationend', 'onanimationiteration', 'ontransitionend'
];

// Patterns for dangerous content
const DANGEROUS_PATTERNS = [
  /javascript:/gi,
  /vbscript:/gi,
  /data:text\/html/gi,
  /data:application/gi,
  /<!\[CDATA\[/gi,
  /expression\s*\(/gi,
  /url\s*\(\s*["']?\s*data:/gi
];

// Maximum SVG size (500KB)
const MAX_SVG_SIZE = 500 * 1024;

export function validateSvg(content: string): SvgValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if it looks like SVG
  if (!content.trim().toLowerCase().includes('<svg')) {
    errors.push('Content does not appear to be valid SVG (missing <svg> tag)');
    return { valid: false, errors, warnings };
  }

  // Check for blocked elements
  for (const element of BLOCKED_ELEMENTS) {
    const regex = new RegExp(`<${element}[\\s>]`, 'gi');
    if (regex.test(content)) {
      errors.push(`Blocked element <${element}> found. This element is not allowed for security reasons.`);
    }
  }

  // Check for blocked attributes (event handlers)
  for (const attr of BLOCKED_ATTRIBUTES) {
    const regex = new RegExp(`\\s${attr}\\s*=`, 'gi');
    if (regex.test(content)) {
      errors.push(`Blocked attribute "${attr}" found. Event handlers are not allowed.`);
    }
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(content)) {
      errors.push(`Dangerous pattern found: ${pattern.source}. This content is not allowed.`);
    }
  }

  // Check for external resources (warning, not blocking)
  if (/xlink:href\s*=\s*["']https?:/gi.test(content)) {
    warnings.push('External links found. These may not load in all contexts.');
  }

  if (/<image[^>]+href\s*=\s*["']https?:/gi.test(content)) {
    warnings.push('External images found. These may not load in all contexts.');
  }

  // Check for use of external stylesheets
  if (/<\?xml-stylesheet/gi.test(content) || /@import/gi.test(content)) {
    errors.push('External stylesheets are not allowed.');
  }

  // Size check
  if (content.length > MAX_SVG_SIZE) {
    errors.push(`SVG content exceeds maximum size of ${MAX_SVG_SIZE} bytes.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sanitized: errors.length === 0 ? sanitizeSvg(content) : undefined
  };
}

/**
 * Sanitize SVG by removing potentially dangerous content
 * Only call this on already-validated SVG
 */
export function sanitizeSvg(content: string): string {
  let sanitized = content;

  // Remove XML declarations (not needed for inline SVG)
  sanitized = sanitized.replace(/<\?xml[^?]*\?>/gi, '');

  // Remove DOCTYPE declarations
  sanitized = sanitized.replace(/<!DOCTYPE[^>]*>/gi, '');

  // Remove comments (can hide malicious content)
  sanitized = sanitized.replace(/<!--[\s\S]*?-->/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Parse SVG for metadata (dimensions, title, etc.)
 */
export function parseSvgMetadata(content: string): SvgMetadata {
  const viewBoxMatch = content.match(/viewBox=["']([^"']+)["']/i);
  const widthMatch = content.match(/width=["']([^"']+)["']/i);
  const heightMatch = content.match(/height=["']([^"']+)["']/i);
  const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
  const descMatch = content.match(/<desc>([^<]+)<\/desc>/i);

  let width: number | null = null;
  let height: number | null = null;

  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].split(/\s+/);
    if (parts.length >= 4) {
      width = parseFloat(parts[2]);
      height = parseFloat(parts[3]);
    }
  }

  if (widthMatch) {
    const parsed = parseFloat(widthMatch[1]);
    if (!isNaN(parsed)) width = parsed;
  }
  if (heightMatch) {
    const parsed = parseFloat(heightMatch[1]);
    if (!isNaN(parsed)) height = parsed;
  }

  return {
    width,
    height,
    viewBox: viewBoxMatch ? viewBoxMatch[1] : null,
    title: titleMatch ? titleMatch[1] : null,
    description: descMatch ? descMatch[1] : null
  };
}

/**
 * Parse SVG dimensions from content
 */
export function parseSvgDimensions(content: string): { width: number | null; height: number | null } {
  const metadata = parseSvgMetadata(content);
  return { width: metadata.width, height: metadata.height };
}
