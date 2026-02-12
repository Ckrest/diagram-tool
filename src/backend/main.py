"""
Diagram Tool Backend - FastAPI Application

This is the main entry point for the diagram tool backend.
It provides:
- REST API for diagram operations (CRUD for nodes/edges, file ops, undo/redo)
- WebSocket endpoint for real-time updates
- Static file serving for the built frontend
- CORS configuration for local frontend development
"""
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional

# Path to built frontend (at package root, two levels up from src/backend/)
FRONTEND_DIST = Path(__file__).parent.parent.parent / "frontend" / "dist"

from core import (
    CreateNodeRequest, UpdateNodeRequest,
    CreateEdgeRequest, UpdateEdgeRequest,
    DiagramInfoRequest, NodeShape, NodeType
)
from diagram_manager import diagram_manager
from websocket_manager import ws_manager

# Hook directories: committed hooks in src/hooks/, local hooks in hooks.local/
import os
HOOKS_DIR = Path(os.environ.get(
    "DIAGRAM_TOOL_HOOKS_DIR",
    str(Path(__file__).parent.parent / "hooks")  # src/hooks/
))
HOOKS_LOCAL_DIR = Path(__file__).parent.parent.parent / "hooks.local"


def load_hooks():
    """Load and register hooks from committed and local hook directories.

    Hooks are Python modules with a register_hooks(diagram_manager) function.
    Scans both src/hooks/ (committed, general-purpose) and hooks.local/
    (uncommitted, environment-specific).
    """
    import importlib.util

    for hooks_dir in (HOOKS_DIR, HOOKS_LOCAL_DIR):
        if not hooks_dir.exists():
            continue

        for hook_file in hooks_dir.glob("*.py"):
            if hook_file.name.startswith("_"):
                continue

            try:
                spec = importlib.util.spec_from_file_location(
                    hook_file.stem, hook_file
                )
                if spec and spec.loader:
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)

                    if hasattr(module, "register_hooks"):
                        module.register_hooks(diagram_manager)
            except Exception:
                pass  # Silently skip failed hooks


# --- Async change notification ---
# Bridge between sync DiagramManager callbacks and async WebSocket broadcasts

_change_event = asyncio.Event()

def on_diagram_change():
    """Callback for diagram changes - sets event for async handler."""
    _change_event.set()

async def change_broadcaster():
    """Background task that broadcasts changes to WebSocket clients."""
    while True:
        await _change_event.wait()
        _change_event.clear()

        diagram_id = None
        if diagram_manager.diagram:
            diagram_id = diagram_manager.diagram.id

        await ws_manager.notify_diagram_updated(diagram_id)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan handler for startup/shutdown tasks."""
    # Register change callback
    diagram_manager.on_change(on_diagram_change)

    # Load external hooks
    load_hooks()

    # Start background broadcaster
    broadcaster_task = asyncio.create_task(change_broadcaster())

    yield

    # Cleanup
    broadcaster_task.cancel()
    try:
        await broadcaster_task
    except asyncio.CancelledError:
        pass


# --- FastAPI App ---

app = FastAPI(
    title="Diagram Tool API",
    description="Backend API for the Figma-like diagram tool",
    version="1.0.0",
    lifespan=lifespan
)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Health Check ---

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "connections": ws_manager.connection_count}


# --- Diagram State ---

@app.get("/api/diagram")
async def get_diagram():
    """Get the current diagram state."""
    return diagram_manager.get_state()


@app.patch("/api/diagram")
async def update_diagram(request: DiagramInfoRequest):
    """Update diagram metadata (name, grid settings)."""
    try:
        diagram = diagram_manager.update_diagram_info(
            name=request.name,
            grid_size=request.grid_size,
            show_grid=request.show_grid
        )
        return {"success": True, "diagram": diagram.to_json_dict()}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- File Operations ---

@app.post("/api/diagram/new")
async def new_diagram(name: str = Query(default="Untitled Diagram")):
    """Create a new empty diagram."""
    diagram = diagram_manager.new_diagram(name=name)
    return {"success": True, "diagram": diagram.to_json_dict()}


class OpenDiagramRequest(BaseModel):
    file_path: str


@app.post("/api/diagram/open")
async def open_diagram(request: OpenDiagramRequest):
    """Open a diagram from a JSON file."""
    try:
        diagram = diagram_manager.open_diagram(request.file_path)
        return {
            "success": True,
            "diagram": diagram.to_json_dict(),
            "file_path": str(diagram_manager.file_path)
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to open diagram: {e}")


class SaveDiagramRequest(BaseModel):
    file_path: Optional[str] = None


@app.post("/api/diagram/save")
async def save_diagram(request: SaveDiagramRequest):
    """Save the diagram to a JSON file."""
    try:
        path = diagram_manager.save_diagram(request.file_path)
        return {"success": True, "file_path": str(path)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save: {e}")


# --- Undo/Redo ---

@app.post("/api/undo")
async def undo():
    """Undo the last action."""
    diagram = diagram_manager.undo()
    if diagram:
        return {"success": True, "diagram": diagram.to_json_dict()}
    return {"success": False, "message": "Nothing to undo"}


@app.post("/api/redo")
async def redo():
    """Redo the last undone action."""
    diagram = diagram_manager.redo()
    if diagram:
        return {"success": True, "diagram": diagram.to_json_dict()}
    return {"success": False, "message": "Nothing to redo"}


# --- Node Operations ---

@app.post("/api/nodes")
async def create_node(request: CreateNodeRequest):
    """Create a new node."""
    try:
        node = diagram_manager.add_node(
            label=request.label,
            type=request.type,
            shape=request.shape,
            color=request.color,
            x=request.x,
            y=request.y,
            width=request.width,
            height=request.height,
            tags=request.tags,
            description=request.description,
            border_style=request.border_style,
            fill_opacity=request.fill_opacity,
            z_index=request.z_index
        )
        return {"success": True, "node": node.model_dump()}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# Search endpoint MUST be before the parameterized route
@app.get("/api/nodes/search")
async def search_nodes(
    label: Optional[str] = Query(default=None),
    tag: Optional[str] = Query(default=None),
    node_type: Optional[str] = Query(default=None, alias="type")
):
    """Search nodes by label, tag, or type."""
    nodes = diagram_manager.search_nodes(label=label, tag=tag, node_type=node_type)
    return {"success": True, "nodes": [n.model_dump() for n in nodes]}


@app.get("/api/nodes/{node_id}")
async def get_node(node_id: str):
    """Get a specific node."""
    node = diagram_manager.get_node(node_id)
    if node:
        return {"success": True, "node": node.model_dump()}
    raise HTTPException(status_code=404, detail="Node not found")


@app.patch("/api/nodes/{node_id}")
async def update_node(node_id: str, request: UpdateNodeRequest):
    """Update a node."""
    try:
        node = diagram_manager.update_node(
            node_id,
            label=request.label,
            type=request.type,
            shape=request.shape,
            color=request.color,
            x=request.x,
            y=request.y,
            width=request.width,
            height=request.height,
            tags=request.tags,
            description=request.description,
            border_style=request.border_style,
            fill_opacity=request.fill_opacity,
            z_index=request.z_index,
            rotation=request.rotation
        )
        if node:
            return {"success": True, "node": node.model_dump()}
        raise HTTPException(status_code=404, detail="Node not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/nodes/{node_id}")
async def delete_node(node_id: str):
    """Delete a node and its connected edges."""
    try:
        success = diagram_manager.delete_node(node_id)
        if success:
            return {"success": True}
        raise HTTPException(status_code=404, detail="Node not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- Edge Operations ---

@app.post("/api/edges")
async def create_edge(request: CreateEdgeRequest):
    """Create a new edge."""
    try:
        edge = diagram_manager.add_edge(
            source=request.source,
            target=request.target,
            label=request.label,
            source_side=request.source_side,
            target_side=request.target_side
        )
        return {
            "success": True,
            "edge": edge.to_json_dict()
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/edges/{edge_id}")
async def get_edge(edge_id: str):
    """Get a specific edge."""
    edge = diagram_manager.get_edge(edge_id)
    if edge:
        return {
            "success": True,
            "edge": edge.to_json_dict()
        }
    raise HTTPException(status_code=404, detail="Edge not found")


@app.patch("/api/edges/{edge_id}")
async def update_edge(edge_id: str, request: UpdateEdgeRequest):
    """Update an edge."""
    try:
        edge = diagram_manager.update_edge(
            edge_id,
            label=request.label,
            color=request.color,
            width=request.width,
            style=request.style,
            arrow_start=request.arrow_start,
            arrow_end=request.arrow_end,
            arrow_size=request.arrow_size,
            source_side=request.source_side,
            target_side=request.target_side
        )
        if edge:
            return {
                "success": True,
                "edge": edge.to_json_dict()
            }
        raise HTTPException(status_code=404, detail="Edge not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/edges/{edge_id}")
async def delete_edge(edge_id: str):
    """Delete an edge."""
    try:
        success = diagram_manager.delete_edge(edge_id)
        if success:
            return {"success": True}
        raise HTTPException(status_code=404, detail="Edge not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- Enums for Frontend ---

@app.get("/api/enums/shapes")
async def get_shapes():
    """Get available node shapes."""
    return {"shapes": [s.value for s in NodeShape]}


@app.get("/api/enums/types")
async def get_types():
    """Get available node types."""
    return {"types": [t.value for t in NodeType]}


# --- Bulk Operations ---

class BulkTagRequest(BaseModel):
    node_ids: list[str]
    add_tags: Optional[list[str]] = None
    remove_tags: Optional[list[str]] = None


@app.post("/api/nodes/bulk-tags")
async def bulk_update_tags(request: BulkTagRequest):
    """Add or remove tags from multiple nodes."""
    try:
        nodes = diagram_manager.bulk_update_tags(
            node_ids=request.node_ids,
            add_tags=request.add_tags,
            remove_tags=request.remove_tags
        )
        return {"success": True, "updated": len(nodes), "nodes": [n.model_dump() for n in nodes]}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- Snapshots ---

class CreateSnapshotRequest(BaseModel):
    name: str


@app.post("/api/snapshots")
async def create_snapshot(request: CreateSnapshotRequest):
    """Create a named snapshot."""
    try:
        diagram_manager.create_snapshot(request.name)
        return {"success": True, "name": request.name}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/snapshots")
async def list_snapshots():
    """List all named snapshots."""
    return {"success": True, "snapshots": diagram_manager.list_snapshots()}


@app.post("/api/snapshots/{name}/restore")
async def restore_snapshot(name: str):
    """Restore a named snapshot."""
    diagram = diagram_manager.restore_snapshot(name)
    if diagram:
        return {"success": True, "diagram": diagram.to_json_dict()}
    raise HTTPException(status_code=404, detail="Snapshot not found")


@app.delete("/api/snapshots/{name}")
async def delete_snapshot(name: str):
    """Delete a named snapshot."""
    if diagram_manager.delete_snapshot(name):
        return {"success": True}
    raise HTTPException(status_code=404, detail="Snapshot not found")


# --- Layout ---

class AutoLayoutRequest(BaseModel):
    strategy: str = "grid"  # grid, tree, force


@app.post("/api/layout/auto")
async def auto_layout(request: AutoLayoutRequest):
    """Automatically arrange nodes."""
    try:
        success = diagram_manager.auto_layout(strategy=request.strategy)
        if success:
            return {"success": True, "strategy": request.strategy}
        raise HTTPException(status_code=400, detail="No nodes to layout")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class AlignNodesRequest(BaseModel):
    node_ids: list[str]
    alignment: str = "left"  # left, right, top, bottom, center_h, center_v


@app.post("/api/layout/align")
async def align_nodes(request: AlignNodesRequest):
    """Align nodes along an edge."""
    try:
        success = diagram_manager.align_nodes(
            node_ids=request.node_ids,
            alignment=request.alignment
        )
        if success:
            return {"success": True}
        raise HTTPException(status_code=400, detail="Need at least 2 nodes to align")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class DistributeNodesRequest(BaseModel):
    node_ids: list[str]
    axis: str = "horizontal"  # horizontal, vertical


@app.post("/api/layout/distribute")
async def distribute_nodes(request: DistributeNodesRequest):
    """Distribute nodes evenly along an axis."""
    try:
        success = diagram_manager.distribute_nodes(
            node_ids=request.node_ids,
            axis=request.axis
        )
        if success:
            return {"success": True}
        raise HTTPException(status_code=400, detail="Need at least 3 nodes to distribute")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- List Diagrams ---

@app.get("/api/diagrams")
async def list_diagrams(directory: str = Query(default=os.path.expanduser("~/diagrams"))):
    """List diagram files in a directory."""
    from pathlib import Path
    path = Path(directory)
    if not path.exists():
        return {"success": True, "diagrams": []}

    diagrams = []
    for f in path.glob("*.json"):
        try:
            import json
            with open(f) as file:
                data = json.load(file)
                diagrams.append({
                    "path": str(f),
                    "name": data.get("name", f.stem),
                    "nodes": len(data.get("nodes", [])),
                    "edges": len(data.get("edges", []))
                })
        except Exception:
            continue

    return {"success": True, "diagrams": diagrams}


# --- Analysis & Validation ---

from core.validation import validate_diagram, validation_summary
from core.analysis import summarize_diagram


@app.get("/api/diagram/validate")
async def validate_current_diagram():
    """
    Validate the current diagram for structural issues.

    Returns a list of issues (errors, warnings, info) and a summary.
    """
    if diagram_manager.diagram is None:
        raise HTTPException(status_code=400, detail="No diagram open")

    issues = validate_diagram(diagram_manager.diagram)
    summary = validation_summary(issues)

    return {
        "success": True,
        "issues": [issue.to_dict() for issue in issues],
        "summary": summary
    }


@app.get("/api/diagram/summary")
async def summarize_current_diagram():
    """
    Get a structural summary of the current diagram.

    Returns node counts by type/shape, tags, connected components,
    and most connected nodes.
    """
    if diagram_manager.diagram is None:
        raise HTTPException(status_code=400, detail="No diagram open")

    summary = summarize_diagram(diagram_manager.diagram)

    return {
        "success": True,
        "summary": summary.to_dict()
    }


# --- WebSocket ---

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time updates.

    Clients connect here to receive diagram_updated events.
    """
    await ws_manager.connect(websocket)

    try:
        while True:
            # Keep connection alive, handle incoming messages if needed
            data = await websocket.receive_text()
            # Could handle client messages here (e.g., ping/pong)
            if data == "ping":
                await websocket.send_text('{"type": "pong"}')
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)
    except Exception:
        await ws_manager.disconnect(websocket)


# --- Static File Serving ---
# Mount static files for production frontend (must be after API routes)

if FRONTEND_DIST.exists():
    # Serve static assets (JS, CSS, etc.)
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    # SPA catch-all: serve index.html for any non-API route
    @app.get("/{path:path}")
    async def serve_spa(request: Request, path: str):
        """Serve the SPA frontend for any non-API route."""
        # Don't serve index.html for API or WebSocket routes
        if path.startswith("api/") or path == "ws":
            raise HTTPException(status_code=404, detail="Not found")

        # Check if it's a static file request
        file_path = FRONTEND_DIST / path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)

        # Otherwise serve index.html for SPA routing
        index_path = FRONTEND_DIST / "index.html"
        if index_path.exists():
            return FileResponse(index_path)

        raise HTTPException(status_code=404, detail="Frontend not built")

    # Root route
    @app.get("/")
    async def serve_root():
        """Serve the frontend index.html."""
        index_path = FRONTEND_DIST / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
        return HTMLResponse("<h1>Diagram Tool</h1><p>Frontend not built. Run 'npm run build' in frontend directory.</p>")
else:
    @app.get("/")
    async def no_frontend():
        """Placeholder when frontend isn't built."""
        return HTMLResponse("<h1>Diagram Tool API</h1><p>Frontend not built. Run 'npm run build' in frontend directory.</p>")


# --- Run with uvicorn ---

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8765)
