#!/bin/bash
# Start both backend and frontend for the diagram tool

cd "$(dirname "$0")"

echo "========================================"
echo "       Diagram Tool Launcher"
echo "========================================"
echo ""

# Check if tmux is available for split view
if command -v tmux &> /dev/null; then
    echo "Starting in tmux split view..."
    tmux new-session -d -s diagram-tool
    tmux send-keys -t diagram-tool "./start-backend.sh" Enter
    tmux split-window -h -t diagram-tool
    tmux send-keys -t diagram-tool "./start-frontend.sh" Enter
    tmux attach -t diagram-tool
else
    # Fallback: run backend in background
    echo "Starting backend in background..."
    ./start-backend.sh &
    BACKEND_PID=$!

    # Give backend time to start
    sleep 2

    echo "Starting frontend..."
    ./start-frontend.sh

    # Cleanup
    kill $BACKEND_PID 2>/dev/null
fi
