#!/bin/bash
# Diagram Tool - Combined startup script for systemd service
# Starts backend, frontend, and opens browser

TOOL_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$TOOL_DIR/src/backend"
FRONTEND_DIR="$TOOL_DIR/frontend"
BACKEND_URL="http://127.0.0.1:8765"
FRONTEND_URL="http://localhost:5173"

# Cleanup function
cleanup() {
    echo "Shutting down diagram-tool..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}
trap cleanup SIGTERM SIGINT

# Start backend
echo "Starting backend..."
cd "$BACKEND_DIR"
source venv/bin/activate
python main.py &
BACKEND_PID=$!

# Wait for backend to be ready
echo "Waiting for backend..."
for i in {1..30}; do
    if curl -s "$BACKEND_URL/api/health" > /dev/null 2>&1; then
        echo "Backend ready!"
        break
    fi
    sleep 0.5
done

# Start frontend
echo "Starting frontend..."
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!

# Wait for frontend to be ready
echo "Waiting for frontend..."
for i in {1..30}; do
    if curl -s "$FRONTEND_URL" > /dev/null 2>&1; then
        echo "Frontend ready!"
        break
    fi
    sleep 0.5
done

# Open browser
echo "Opening browser..."
xdg-open "$FRONTEND_URL" 2>/dev/null &

echo "Diagram tool running at $FRONTEND_URL"
echo "Backend PID: $BACKEND_PID, Frontend PID: $FRONTEND_PID"

# Wait for either process to exit
wait $BACKEND_PID $FRONTEND_PID
