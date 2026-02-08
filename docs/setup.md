# StateLoop Setup Guide

## Prerequisites

- **Node.js** 18.x or higher
- **npm** 9.x or higher
- A modern web browser (Chrome, Firefox, Safari, Edge)

## Quick Start

### 1. Clone/Download the Project

```bash
cd /path/to/stateLoop
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start the Development Server

```bash
npm run dev
```

The server will start at `http://localhost:3000`

### 4. Open the UI

Navigate to `http://localhost:3000` in your browser.

## Available Pages

| URL | Description |
|-----|-------------|
| `http://localhost:3000` | Main Thronglet UI with 2D/3D agent visualization |
| `http://localhost:3000/scenarios.html` | Scenario library, agent customizer, location viewer |
| `http://localhost:3000/api-docs` | Interactive API documentation (Swagger UI) |
| `http://localhost:3000/swagger-generated.json` | OpenAPI specification (auto-generated) |
| `http://localhost:3000/docs` | Documentation browser |

## Project Structure

```
stateLoop/
├── docs/                    # Documentation
│   ├── requirements.md      # Project requirements (FR-1 to FR-13)
│   ├── api-design.md        # API specification
│   ├── data-models.md       # Database schema
│   ├── ui-design.md         # UI specification
│   ├── thronglet-spec.md    # Agent rendering specification
│   ├── SPEC.md              # Complete system specification
│   ├── agent-guide.md       # How to run agents
│   └── setup.md             # This file
├── src/
│   ├── api/
│   │   └── routes.ts        # Express route handlers
│   ├── services/
│   │   ├── caseService.ts   # Case management logic
│   │   └── taskService.ts   # Task distribution logic
│   ├── storage/
│   │   └── sqlite.ts        # Database operations
│   ├── types/
│   │   └── index.ts         # TypeScript interfaces
│   └── index.ts             # Application entry point
├── public/
│   ├── js/
│   │   └── thronglet.js     # Frontend JavaScript (2D/3D rendering)
│   ├── css/
│   │   └── styles.css       # Styles
│   ├── data/
│   │   └── furniture.json   # Furniture catalog for locations
│   ├── assets/              # Sprites and images
│   ├── index.html           # Main Thronglet page
│   └── scenarios.html       # Scenario library & agent customizer
├── tests/
│   └── api.test.ts          # API tests (15 tests)
├── package.json
├── tsconfig.json
└── stateloop.db             # SQLite database (created on first run)
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run the compiled application |
| `npm test` | Run test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint issues automatically |

## Configuration

### Environment Variables

Create a `.env` file in the project root (optional):

```bash
# Server port (default: 3000)
PORT=3000

# Database file path (default: ./stateloop.db)
DATABASE_PATH=./stateloop.db

# Log level: debug, info, warn, error (default: info)
LOG_LEVEL=info
```

### Database

The SQLite database is created automatically on first run. The database file is stored at `./stateloop.db` by default.

To reset the database:
```bash
rm stateloop.db
npm run dev
```

## Development Workflow

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- tests/caseService.test.ts

# Run with coverage
npm run test:coverage
```

### Adding a New Endpoint

1. Define the route in `src/api/routes.ts`
2. Add business logic in `src/services/`
3. Add database operations in `src/storage/sqlite.ts`
4. Write tests in `tests/`
5. Update API documentation in `docs/api-design.md`

### Modifying the UI

1. Edit `public/index.html` for structure
2. Edit `public/css/styles.css` for styling
3. Edit `public/js/thronglet.js` for behavior
4. Add sprites to `public/assets/`

## Testing with Agents

### Manual Testing

1. Start the server: `npm run dev`
2. Open `http://localhost:3000` in browser
3. Click "New Case" to create a test case
4. Use curl or the agent guide to interact with the API

### Sample API Calls

**Create a case:**
```bash
curl -X POST http://localhost:3000/api/cases \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "Choose an option",
    "participants": [
      {"id": "person-a", "name": "Alice", "preferences": ["Italian"], "constraints": [], "isPayer": true},
      {"id": "person-b", "name": "Bob", "preferences": ["Mexican"], "constraints": [], "isPayer": false}
    ],
    "options": [
      {"id": "opt-1", "name": "Olive Garden", "category": "Italian", "priceRange": "$$", "features": []},
      {"id": "opt-2", "name": "Taco Bell", "category": "Mexican", "priceRange": "$", "features": []}
    ]
  }'
```

**Get next task:**
```bash
curl "http://localhost:3000/api/cases/CASE_ID/next-task?agentId=person-a"
```

**Submit response:**
```bash
curl -X POST http://localhost:3000/api/cases/CASE_ID/submit \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "TASK_ID",
    "agentId": "person-a",
    "response": {
      "type": "proposal",
      "content": "Lets go to Olive Garden!",
      "optionId": "opt-1"
    }
  }'
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 PID

# Or use a different port
PORT=3001 npm run dev
```

### Database Locked

This can happen if multiple processes try to access the database:

```bash
# Kill all node processes
pkill -f node

# Restart the server
npm run dev
```

### TypeScript Errors

```bash
# Clean and rebuild
rm -rf dist/
npm run build
```

### Dependencies Issues

```bash
# Clean install
rm -rf node_modules/
rm package-lock.json
npm install
```

## Production Deployment

For production use:

1. Build the application:
   ```bash
   npm run build
   ```

2. Set environment variables:
   ```bash
   export NODE_ENV=production
   export PORT=8080
   ```

3. Start the server:
   ```bash
   npm start
   ```

Consider using a process manager like PM2:
```bash
npm install -g pm2
pm2 start dist/index.js --name stateloop
```

## Getting Help

- Read the documentation in `/docs`
- Check the request logs in the UI
- Enable debug logging: `DEBUG=stateloop:* npm run dev`
- File issues at the project repository
