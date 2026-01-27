#!/bin/bash
# Start the diagram tool frontend

cd "$(dirname "$0")/frontend"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start the development server
echo "Starting frontend on http://localhost:5173"
echo "Press Ctrl+C to stop"
npm run dev
