#!/bin/bash
# Start the diagram tool backend

cd "$(dirname "$0")/backend"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt --quiet

# Start the server
echo "Starting backend server on http://127.0.0.1:8765"
echo "Press Ctrl+C to stop"
python main.py
