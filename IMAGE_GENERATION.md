# Image Generation for Agents

## Overview

Allow agents to create actual images as deliverables during scenarios. When an artist agent wins a commission, they can generate real artwork.

## Agent Actions

### New Response Type: `create_image`

```json
{
  "type": "accept",
  "content": "I'll create that rocket now!",
  "imageGeneration": {
    "tool": "pixel_art | dalle | svg",
    "prompt": "A cute pixel art rocket with blue body, orange flame, and stars",
    "size": "128x128",
    "style": "pixel_art",
    "outputDocument": "artwork"
  }
}
```

### Tools Available to Agents

| Tool | Best For | How It Works |
|------|----------|--------------|
| `pixel_art` | Retro icons, game sprites | Generates pixel art from prompt using simple rules or AI |
| `dalle` | Any image style | Calls OpenAI DALL-E API |
| `svg` | Vector graphics, logos | Generates SVG code programmatically |
| `stable_diffusion` | Detailed art | Calls SD API (local or cloud) |

## Implementation Options

### Option 1: Built-in Pixel Art Generator (Simple)

A lightweight pixel art generator that doesn't need external APIs:

```typescript
// Agent provides color palette + description
{
  "tool": "pixel_art",
  "canvas": "128x128",
  "palette": {
    "body": "#1E3A5F",
    "flame": "#FF6B35",
    "window": "#FFFFFF",
    "stars": "#FFE66D"
  },
  "elements": [
    { "type": "rocket", "position": "center", "size": "large" },
    { "type": "flame", "position": "bottom", "colors": ["#FF6B35", "#FFD93D"] },
    { "type": "stars", "count": 3, "scattered": true }
  ]
}
```

The system has pre-built pixel art primitives (rocket shapes, flames, stars) that it combines.

### Option 2: AI Image Generation (DALL-E)

```typescript
// src/services/imageService.ts
import OpenAI from 'openai';

export async function generateImage(prompt: string, options: ImageOptions): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt: `${options.style} style: ${prompt}`,
    n: 1,
    size: "1024x1024", // DALL-E sizes, we resize after
    response_format: "b64_json"
  });

  // Resize to requested size (128x128)
  const resized = await resizeImage(response.data[0].b64_json, options.size);

  return resized; // base64 PNG
}
```

### Option 3: SVG Generation (No API needed)

Agent writes SVG code directly:

```json
{
  "tool": "svg",
  "code": "<svg viewBox='0 0 128 128'>...</svg>",
  "outputDocument": "artwork"
}
```

The system validates and stores the SVG. UI renders it directly.

## Storage

### Images in Documents

```typescript
interface WorkingDocument {
  id: string;
  name: string;
  content: string;        // Text/markdown content
  images?: DocumentImage[]; // NEW: attached images
}

interface DocumentImage {
  id: string;
  filename: string;
  mimeType: "image/png" | "image/svg+xml";
  data: string;           // base64 encoded
  width: number;
  height: number;
  generatedBy: string;    // agent ID
  prompt?: string;        // generation prompt
  createdAt: string;
}
```

### File Storage (Alternative)

Store images as files, reference by URL:

```
/public/uploads/cases/{caseId}/images/{imageId}.png
```

Document references: `![Rocket]({{IMAGE:img-abc123}})`

## API Endpoints

### POST /api/cases/:id/generate-image

Called by agent during response submission:

```json
{
  "tool": "pixel_art",
  "prompt": "Cute rocket with orange flame",
  "size": "128x128",
  "palette": ["#1E3A5F", "#FF6B35", "#FFFFFF"],
  "targetDocument": "artwork"
}
```

Response:
```json
{
  "imageId": "img-abc123",
  "url": "/api/cases/case-xyz/images/img-abc123",
  "mimeType": "image/png",
  "size": "128x128"
}
```

### GET /api/cases/:id/images/:imageId

Returns the image file.

## UI Changes

### Document Rendering

When a document contains `{{IMAGE:img-xxx}}` or has attached images:

```html
<div class="document-content">
  <p>Here's the commissioned artwork:</p>
  <img src="/api/cases/case-xyz/images/img-abc123"
       alt="Pixel art rocket"
       class="max-w-full rounded-lg shadow-lg" />
</div>
```

### Output Tab Enhancement

For resolved cases with image deliverables:

```html
<div class="output-deliverable">
  <h3>Final Artwork</h3>
  <img src="..." class="artwork-preview" />
  <div class="artwork-meta">
    <span>128x128 PNG</span>
    <span>Created by Pixel Pete</span>
    <button>Download</button>
  </div>
</div>
```

## Agent Prompt Addition

When agents have image generation capability, add to their prompt:

```
IMAGE GENERATION: You can create images! Include an "imageGeneration" object in your response:
{
  "imageGeneration": {
    "tool": "pixel_art",
    "prompt": "Description of what to create",
    "size": "128x128",
    "outputDocument": "artwork"
  }
}
Available tools: pixel_art, svg, dalle (if API key configured)
```

## Scenario Format Addition

```
AGENT_CAPABILITIES:
- image_generation: pixel_art, svg

DELIVERABLE_TYPE: image
DELIVERABLE_FORMAT: 128x128 PNG
```

## Implementation Plan

### Phase 1: SVG Support (No external dependencies)
1. Add SVG validation and storage
2. Agents can output raw SVG code
3. UI renders SVG in documents
4. Export to PNG via canvas

### Phase 2: Built-in Pixel Art
1. Create pixel art primitives library (shapes, palettes)
2. Simple composition engine
3. Agents describe what they want, system assembles

### Phase 3: AI Image Generation
1. Optional DALL-E integration
2. Optional Stable Diffusion support
3. Cost tracking per case

## Example Scenario Flow

```
1. Alex: "I need a rocket icon"
2. Pixel Pete pitches pixel art approach
3. Alex chooses Pete
4. Pete accepts with imageGeneration:
   {
     "type": "accept",
     "content": "Creating your rocket now!",
     "imageGeneration": {
       "tool": "pixel_art",
       "prompt": "Chunky blue rocket with orange flame and stars",
       "size": "128x128",
       "outputDocument": "artwork"
     }
   }
5. System generates image, attaches to artwork document
6. Case resolves with actual image in Output tab
7. Alex can download the PNG
```

## Configuration

```env
# .env
IMAGE_GENERATION_ENABLED=true
IMAGE_STORAGE_PATH=./public/uploads
OPENAI_API_KEY=sk-xxx           # For DALL-E
STABILITY_API_KEY=xxx           # For Stable Diffusion
MAX_IMAGE_SIZE_MB=5
```
