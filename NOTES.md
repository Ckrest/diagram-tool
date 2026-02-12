# Notes - diagram-tool

## Build / Run

**Backend:**
```bash
cd backend
pip install -r requirements.txt
python main.py  # Starts on localhost:8765
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev    # Development at localhost:5173
npm run build  # Production build to dist/
```

**Via systemd:**
```bash
systemctl --user start diagram-tool
```

## Path Dependencies

| Path | Purpose |
|------|---------|
| `~/diagrams/` | Default diagram save location |
| `hooks/` | Optional integration hooks (loaded at startup) |
| Port 8765 | Backend API |

## Hooks System

Supports optional callback hooks for external integration:

1. Place Python modules in `hooks/` directory
2. Each module should define `register_hooks(diagram_manager)`
3. Register callbacks via `diagram_manager.on_save(callback)`

Callback signature: `callback(path: Path, diagram_info: dict)`

## Integration with Systems

The diagram-tool includes optional Systems integration via hooks:
- `hooks/systems_integration.py` provides Systems registry integration
- This hook is optional - the tool works standalone without it
- When installed in Systems, the hook provides additional integration features
