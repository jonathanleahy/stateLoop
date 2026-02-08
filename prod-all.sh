#!/bin/bash
# StateLoop Production Build and Start Script
# This script builds the TypeScript code and starts the production server

set -e  # Exit on error

echo "=========================================="
echo "  StateLoop Production Build"
echo "=========================================="

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo ""
    echo "[1/5] Installing dependencies..."
    npm install --production=false
else
    echo ""
    echo "[1/5] Dependencies already installed"
fi

# Type check
echo ""
echo "[2/5] Running type check..."
npm run typecheck

# Generate API documentation
echo ""
echo "[3/5] Generating API documentation..."
npm run swagger:generate

# Build TypeScript
echo ""
echo "[4/5] Building TypeScript..."
npm run build

# Start the production server
echo ""
echo "[5/5] Starting production server..."
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

npm start
