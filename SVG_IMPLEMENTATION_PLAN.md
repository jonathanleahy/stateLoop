# SVG Implementation Plan for StateLoop

## Overview

Enable agents to create actual SVG images as deliverables. When an artist agent wins a commission, they write SVG code that gets validated, stored, and rendered.

## Summary

| Component | Changes |
|-----------|---------|
| Database | 2 new tables: `case_images`, `image_edits` |
| Types | New interfaces: `CaseImage`, `ImageEdit`, `ImageGeneration` |
| API | 7 new endpoints for image CRUD |
| Service | New `svgService.ts` for validation/sanitization |
| Submit | Process `imageGeneration` in agent responses |
| UI | New "Images" tab, image rendering in documents |

## 1. Database Schema

```sql
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
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

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
  FOREIGN KEY (image_id) REFERENCES case_images(id) ON DELETE CASCADE
);
```

## 2. Agent Response Format

Agents can create images by including `imageGeneration` in their response:

```json
{
  "type": "accept",
  "content": "Here's your rocket icon!",
  "imageGeneration": [
    {
      "name": "rocket",
      "content": "<svg viewBox='0 0 128 128'>...</svg>",
      "prompt": "Pixel-style rocket with orange flame"
    }
  ]
}
```

## 3. API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/cases/:id/images` | Create image |
| GET | `/cases/:id/images` | List images |
| GET | `/cases/:id/images/:name` | Get image (JSON) |
| GET | `/cases/:id/images/:name/raw` | Get raw SVG |
| PUT | `/cases/:id/images/:name` | Replace image |
| DELETE | `/cases/:id/images/:name` | Delete image |
| GET | `/cases/:id/images/:name/history` | Edit history |

## 4. SVG Validation

Security checks:
- No `<script>` tags
- No event handlers (`onclick`, `onload`, etc.)
- No `<foreignObject>` (can embed HTML)
- No `javascript:` or `data:text/html` URIs
- No external resources
- Size limit (500KB default)

## 5. UI Changes

### New "Images" Tab
Shows all images created in the case with:
- Preview thumbnail
- Creator name
- Dimensions
- Download button

### Image References in Documents
Support `{{IMAGE:name}}` syntax in document content to embed images inline.

## 6. Implementation Files

| File | Changes |
|------|---------|
| `src/storage/sqlite.ts` | Add tables, CRUD functions |
| `src/types/index.ts` | Add image types |
| `src/services/svgService.ts` | NEW - validation service |
| `src/api/routes.ts` | Add endpoints, update submit |
| `src/api/validation.ts` | Add imageGeneration validation |
| `public/js/thronglet.js` | Add Images tab, rendering |
| `public/index.html` | Add Images tab button |

## 7. Example Flow

```
1. Alex: "I need a rocket icon"
2. Pixel Pete wins commission
3. Pete's accept response:
   {
     "type": "accept",
     "content": "Creating your rocket!",
     "imageGeneration": [{
       "name": "rocket",
       "content": "<svg viewBox='0 0 128 128'>
         <rect fill='#1E3A5F' x='44' y='16' width='40' height='64'/>
         <circle fill='#FFF' cx='64' cy='36' r='8'/>
         <path fill='#FF6B35' d='M52 80 L64 110 L76 80 Z'/>
       </svg>",
       "prompt": "Blue rocket with orange flame"
     }]
   }
4. System validates & stores SVG
5. UI shows image in Images tab
6. Case resolves with actual artwork deliverable
```

## 8. Agent Prompt Addition

When scenarios involve images:
```
IMAGE GENERATION: You can create SVG images!
Include "imageGeneration" in your response:
{
  "imageGeneration": [{
    "name": "artwork",
    "content": "<svg viewBox='0 0 100 100'>...</svg>",
    "prompt": "Description"
  }]
}
- Only SVG format
- Keep it simple (no scripts, no external resources)
- Use viewBox for sizing
```
