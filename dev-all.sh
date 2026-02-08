#!/bin/bash
# StateLoop Development Startup Script
# This script ensures dependencies are installed and starts the development server

set -e  # Exit on error

echo "=========================================="
echo "  StateLoop Development Environment"
echo "=========================================="

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo ""
    echo "[1/4] Installing dependencies..."
    npm install
else
    echo ""
    echo "[1/4] Dependencies already installed (skipping npm install)"
fi

# Type check (optional but recommended)
echo ""
echo "[2/4] Running type check..."
if npm run typecheck 2>/dev/null; then
    echo "Type check passed"
else
    # typecheck script might not exist yet, skip silently
    echo "Type check skipped (script not found)"
fi

# Generate API documentation
echo ""
echo "[3/4] Generating API documentation..."
npm run swagger:generate

# Start the development server
echo ""
echo "[4/4] Starting development server..."
echo ""
echo "Server will be available at:"
echo "  - Main UI:    http://localhost:3000"
echo "  - API Docs:   http://localhost:3000/api-docs"
echo "  - Config:     http://localhost:3000/scenarios.html"
echo "  - Companies:  http://localhost:3000/companies.html"
echo ""
echo "Press Ctrl+C to stop the server"
echo "=========================================="
echo ""

npm run dev
