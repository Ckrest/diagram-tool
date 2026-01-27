#!/bin/bash
# Setup script for the Diagram Tool MCP Server

cd "$(dirname "$0")"

echo "Setting up Diagram Tool MCP Server..."

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate and install
source venv/bin/activate
pip install -r requirements.txt

echo ""
echo "Setup complete!"
echo ""
echo "To add to Claude Code, add this to your settings:"
echo ""
echo '  "mcpServers": {'
echo '    "diagram-tool": {'
echo '      "command": "'$(pwd)/venv/bin/python'",'
echo '      "args": ["'$(pwd)/server.py'"]'
echo '    }'
echo '  }'
echo ""
echo "Or run: claude mcp add diagram-tool $(pwd)/venv/bin/python $(pwd)/server.py"
