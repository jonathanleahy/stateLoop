import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { marked } from 'marked';
import swaggerUi from 'swagger-ui-express';
import { initializeDatabase } from './storage/sqlite.js';
import { createRouter } from './api/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// JSON parse error handler - provides actionable error messages for AI
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: 'JSON_PARSE_ERROR',
      message: 'Invalid JSON in request body',
      details: err.message,
      hint: 'Ensure the request body is valid JSON. Common issues: unescaped quotes, trailing commas, single quotes instead of double quotes.'
    });
    return;
  }
  next(err);
});

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Initialize database
const db = initializeDatabase();

// API routes
app.use('/api', createRouter(db));

// Swagger UI for API documentation
// Use auto-generated swagger spec from swagger-autogen
const swaggerSpecPath = path.join(__dirname, '../public/swagger-generated.json');
const apiSpec = JSON.parse(fs.readFileSync(swaggerSpecPath, 'utf-8'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(apiSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'StateLoop API Documentation'
}));

// Documentation viewer
app.get('/docs', (req, res) => {
  const docsDir = path.join(__dirname, '../docs');
  const files = fs.readdirSync(docsDir).filter(f => f.endsWith('.md'));

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StateLoop Documentation</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #eee;
      min-height: 100vh;
    }
    .container {
      display: flex;
      min-height: 100vh;
    }
    .sidebar {
      width: 250px;
      background: #16213e;
      padding: 20px;
      border-right: 1px solid #0f3460;
    }
    .sidebar h1 {
      font-size: 1.2rem;
      color: #e94560;
      margin-bottom: 20px;
    }
    .sidebar a {
      display: block;
      color: #aaa;
      text-decoration: none;
      padding: 10px;
      border-radius: 5px;
      margin-bottom: 5px;
      transition: all 0.2s;
    }
    .sidebar a:hover, .sidebar a.active {
      background: #0f3460;
      color: #fff;
    }
    .content {
      flex: 1;
      padding: 40px;
      max-width: 900px;
      overflow-y: auto;
    }
    .content h1 { color: #e94560; margin-bottom: 20px; }
    .content h2 { color: #0f4c75; margin: 30px 0 15px; border-bottom: 1px solid #333; padding-bottom: 10px; }
    .content h3 { color: #3282b8; margin: 25px 0 10px; }
    .content p { line-height: 1.7; margin-bottom: 15px; }
    .content ul, .content ol { margin: 15px 0 15px 30px; }
    .content li { margin-bottom: 8px; line-height: 1.6; }
    .content code {
      background: #0f3460;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.9em;
    }
    .content pre {
      background: #0f3460;
      padding: 15px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 15px 0;
    }
    .content pre code {
      background: none;
      padding: 0;
    }
    .content table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .content th, .content td {
      border: 1px solid #333;
      padding: 10px;
      text-align: left;
    }
    .content th { background: #0f3460; }
    .content blockquote {
      border-left: 4px solid #e94560;
      padding-left: 20px;
      margin: 20px 0;
      color: #aaa;
    }
    .welcome {
      text-align: center;
      padding: 60px 20px;
    }
    .welcome h1 { font-size: 2.5rem; margin-bottom: 20px; }
    .welcome p { font-size: 1.2rem; color: #aaa; }
  </style>
</head>
<body>
  <div class="container">
    <nav class="sidebar">
      <h1>StateLoop Docs</h1>
      ${files.map(f => `<a href="/docs/${f.replace('.md', '')}">${f.replace('.md', '').replace(/-/g, ' ')}</a>`).join('')}
      <hr style="margin: 20px 0; border-color: #333;">
      <a href="/">Back to App</a>
    </nav>
    <main class="content">
      <div class="welcome">
        <h1>StateLoop Documentation</h1>
        <p>Select a document from the sidebar to get started.</p>
      </div>
    </main>
  </div>
</body>
</html>
  `;
  res.send(html);
});

app.get('/docs/:name', (req, res) => {
  const docsDir = path.join(__dirname, '../docs');
  const files = fs.readdirSync(docsDir).filter(f => f.endsWith('.md'));
  const fileName = req.params.name + '.md';

  if (!files.includes(fileName)) {
    res.status(404).send('Document not found');
    return;
  }

  const content = fs.readFileSync(path.join(docsDir, fileName), 'utf-8');
  const htmlContent = marked(content);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${req.params.name} - StateLoop Docs</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #eee;
      min-height: 100vh;
    }
    .container {
      display: flex;
      min-height: 100vh;
    }
    .sidebar {
      width: 250px;
      background: #16213e;
      padding: 20px;
      border-right: 1px solid #0f3460;
      position: fixed;
      height: 100vh;
      overflow-y: auto;
    }
    .sidebar h1 {
      font-size: 1.2rem;
      color: #e94560;
      margin-bottom: 20px;
    }
    .sidebar a {
      display: block;
      color: #aaa;
      text-decoration: none;
      padding: 10px;
      border-radius: 5px;
      margin-bottom: 5px;
      transition: all 0.2s;
      text-transform: capitalize;
    }
    .sidebar a:hover, .sidebar a.active {
      background: #0f3460;
      color: #fff;
    }
    .content {
      flex: 1;
      padding: 40px;
      max-width: 900px;
      margin-left: 250px;
      overflow-y: auto;
    }
    .content h1 { color: #e94560; margin-bottom: 20px; font-size: 2rem; }
    .content h2 { color: #bbe1fa; margin: 30px 0 15px; border-bottom: 1px solid #333; padding-bottom: 10px; }
    .content h3 { color: #3282b8; margin: 25px 0 10px; }
    .content h4 { color: #aaa; margin: 20px 0 10px; }
    .content p { line-height: 1.7; margin-bottom: 15px; }
    .content ul, .content ol { margin: 15px 0 15px 30px; }
    .content li { margin-bottom: 8px; line-height: 1.6; }
    .content code {
      background: #0f3460;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.9em;
    }
    .content pre {
      background: #0f3460;
      padding: 15px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 15px 0;
    }
    .content pre code {
      background: none;
      padding: 0;
    }
    .content table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .content th, .content td {
      border: 1px solid #333;
      padding: 10px;
      text-align: left;
    }
    .content th { background: #0f3460; }
    .content blockquote {
      border-left: 4px solid #e94560;
      padding-left: 20px;
      margin: 20px 0;
      color: #aaa;
    }
    .content a { color: #3282b8; }
    .content hr { border: none; border-top: 1px solid #333; margin: 30px 0; }
  </style>
</head>
<body>
  <div class="container">
    <nav class="sidebar">
      <h1>StateLoop Docs</h1>
      ${files.map(f => {
        const name = f.replace('.md', '');
        const isActive = name === req.params.name;
        return `<a href="/docs/${name}" class="${isActive ? 'active' : ''}">${name.replace(/-/g, ' ')}</a>`;
      }).join('')}
      <hr style="margin: 20px 0; border-color: #333;">
      <a href="/">Back to App</a>
    </nav>
    <main class="content">
      ${htmlContent}
    </main>
  </div>
</body>
</html>
  `;
  res.send(html);
});

// Start server
app.listen(PORT, () => {
  console.log(`StateLoop server running at http://localhost:${PORT}`);
  console.log(`API Documentation at http://localhost:${PORT}/api-docs`);
  console.log(`Project Documentation at http://localhost:${PORT}/docs`);
});
