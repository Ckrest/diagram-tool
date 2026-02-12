#!/usr/bin/env python3
"""Diagram tool MCP CLI - 28 subcommands for the diagram editor."""

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error
import urllib.parse

API_BASE = "http://127.0.0.1:8765/api"
FRONTEND_URL = "http://localhost:8765"


def _json_out(data):
    print(json.dumps(data))
    sys.exit(0)


def _api_request(method, endpoint, data=None, params=None):
    """Make a request to the diagram tool backend."""
    url = f"{API_BASE}{endpoint}"

    if params:
        filtered = {k: v for k, v in params.items() if v is not None}
        if filtered:
            url = f"{url}?{urllib.parse.urlencode(filtered)}"

    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode() if data else None

    req = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        try:
            error_data = json.loads(error_body)
            _json_out({"status": "error", "error": f"API error: {error_data.get('detail', 'Unknown error')}"})
        except json.JSONDecodeError:
            _json_out({"status": "error", "error": f"API error ({e.code}): {error_body}"})
    except urllib.error.URLError as e:
        _json_out({"status": "error", "error": f"Connection failed: {e.reason}. Is diagram-tool-backend running?"})


def _ensure_running():
    """Ensure the diagram service is running."""
    subprocess.run(["systemctl", "--user", "start", "diagram-tool.service"],
                   capture_output=True, timeout=10)
    for _ in range(30):
        try:
            req = urllib.request.Request(f"{API_BASE}/health", method="GET")
            with urllib.request.urlopen(req, timeout=3) as response:
                if response.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def _get_optimal_sides(source_node, target_node):
    """Calculate optimal connection sides based on relative node positions."""
    sx = source_node['x'] + source_node['width'] / 2
    sy = source_node['y'] + source_node['height'] / 2
    tx = target_node['x'] + target_node['width'] / 2
    ty = target_node['y'] + target_node['height'] / 2

    dx = tx - sx
    dy = ty - sy

    if abs(dx) > abs(dy):
        return ('right', 'left') if dx > 0 else ('left', 'right')
    else:
        return ('bottom', 'top') if dy > 0 else ('top', 'bottom')


def _parse_list_arg(value):
    """Parse a list argument from JSON string or return None."""
    if value is None:
        return None
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return None


# ── Service ──────────────────────────────────────────────────────────────────

def cmd_start(args):
    if _ensure_running():
        try:
            subprocess.Popen(["xdg-open", FRONTEND_URL],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
        _json_out({"status": "started", "message": "Diagram tool is running", "url": FRONTEND_URL})
    _json_out({"status": "error", "error": "Service failed to start after 15 seconds"})


def cmd_stop(args):
    try:
        result = subprocess.run(
            ["systemctl", "--user", "stop", "diagram-tool.service"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            _json_out({"status": "stopped", "message": "Diagram tool stopped"})
        else:
            _json_out({"status": "error", "error": result.stderr})
    except Exception as e:
        _json_out({"status": "error", "error": str(e)})


# ── Core ─────────────────────────────────────────────────────────────────────

def cmd_get_current(args):
    _json_out(_api_request("GET", "/diagram"))


def cmd_list_diagrams(args):
    _json_out(_api_request("GET", "/diagrams", params={"directory": args.directory}))


def cmd_open(args):
    _json_out(_api_request("POST", "/diagram/open", data={"file_path": args.file_path}))


def cmd_new(args):
    _json_out(_api_request("POST", "/diagram/new", params={"name": args.name}))


def cmd_save(args):
    file_path = args.file_path if args.file_path else None
    _json_out(_api_request("POST", "/diagram/save", data={"file_path": file_path}))


# ── Nodes ────────────────────────────────────────────────────────────────────

def cmd_add_node(args):
    tags = _parse_list_arg(args.tags) or []
    _json_out(_api_request("POST", "/nodes", data={
        "label": args.label,
        "x": args.x,
        "y": args.y,
        "type": args.node_type,
        "shape": args.shape,
        "color": args.color,
        "width": args.width,
        "height": args.height,
        "tags": tags,
        "description": args.description or ""
    }))


def cmd_update_node(args):
    updates = {}
    if args.label is not None:
        updates["label"] = args.label
    if args.x is not None:
        updates["x"] = args.x
    if args.y is not None:
        updates["y"] = args.y
    if args.node_type is not None:
        updates["type"] = args.node_type
    if args.shape is not None:
        updates["shape"] = args.shape
    if args.color is not None:
        updates["color"] = args.color
    if args.width is not None:
        updates["width"] = args.width
    if args.height is not None:
        updates["height"] = args.height
    tags = _parse_list_arg(args.tags)
    if tags is not None:
        updates["tags"] = tags
    if args.description is not None:
        updates["description"] = args.description

    _json_out(_api_request("PATCH", f"/nodes/{args.node_id}", data=updates))


def cmd_delete_node(args):
    _json_out(_api_request("DELETE", f"/nodes/{args.node_id}"))


def cmd_search_nodes(args):
    params = {}
    if args.label:
        params["label"] = args.label
    if args.tag:
        params["tag"] = args.tag
    if args.node_type:
        params["type"] = args.node_type
    _json_out(_api_request("GET", "/nodes/search", params=params))


# ── Edges ────────────────────────────────────────────────────────────────────

def cmd_add_edge(args):
    edge_data = {
        "from": args.from_node,
        "to": args.to_node,
        "label": args.label or ""
    }

    if args.source_side:
        edge_data["source_side"] = args.source_side
    if args.target_side:
        edge_data["target_side"] = args.target_side

    # Auto-route if enabled and no explicit sides
    auto_route = str(args.auto_route).lower() not in ("false", "0", "no")
    if auto_route and not args.source_side and not args.target_side:
        try:
            state = _api_request("GET", "/diagram")
            nodes_by_id = {n['id']: n for n in state.get('diagram', {}).get('nodes', [])}
            if args.from_node in nodes_by_id and args.to_node in nodes_by_id:
                src_side, tgt_side = _get_optimal_sides(
                    nodes_by_id[args.from_node], nodes_by_id[args.to_node])
                edge_data["source_side"] = src_side
                edge_data["target_side"] = tgt_side
        except Exception:
            pass

    _json_out(_api_request("POST", "/edges", data=edge_data))


def cmd_update_edge(args):
    updates = {}
    if args.label is not None:
        updates["label"] = args.label
    if args.color is not None:
        updates["color"] = args.color
    if args.width is not None:
        updates["width"] = args.width
    if args.style is not None:
        updates["style"] = args.style
    if args.arrow_start is not None:
        updates["arrow_start"] = args.arrow_start
    if args.arrow_end is not None:
        updates["arrow_end"] = args.arrow_end

    _json_out(_api_request("PATCH", f"/edges/{args.edge_id}", data=updates))


def cmd_set_edge_sides(args):
    updates = {}
    if args.source_side:
        updates["source_side"] = args.source_side
    if args.target_side:
        updates["target_side"] = args.target_side

    _json_out(_api_request("PATCH", f"/edges/{args.edge_id}", data=updates))


def cmd_auto_route_all(args):
    state = _api_request("GET", "/diagram")
    diagram = state.get('diagram', {})
    nodes = diagram.get('nodes', [])
    edges = diagram.get('edges', [])

    if not edges:
        _json_out({"success": True, "message": "No edges to route", "updated": 0})

    nodes_by_id = {n['id']: n for n in nodes}
    updated_count = 0

    for edge in edges:
        source_id = edge.get('source')
        target_id = edge.get('target')

        if source_id in nodes_by_id and target_id in nodes_by_id:
            src_side, tgt_side = _get_optimal_sides(
                nodes_by_id[source_id], nodes_by_id[target_id])
            try:
                _api_request("PATCH", f"/edges/{edge['id']}", data={
                    "source_side": src_side, "target_side": tgt_side
                })
                updated_count += 1
            except Exception:
                pass

    _json_out({"success": True, "message": f"Re-routed {updated_count} edges", "updated": updated_count})


def cmd_delete_edge(args):
    _json_out(_api_request("DELETE", f"/edges/{args.edge_id}"))


# ── Layout ───────────────────────────────────────────────────────────────────

def cmd_auto_layout(args):
    _json_out(_api_request("POST", "/layout/auto", data={"strategy": args.strategy}))


def cmd_align_nodes(args):
    node_ids = _parse_list_arg(args.node_ids) or []
    _json_out(_api_request("POST", "/layout/align", data={
        "node_ids": node_ids,
        "alignment": args.alignment
    }))


def cmd_distribute_nodes(args):
    node_ids = _parse_list_arg(args.node_ids) or []
    _json_out(_api_request("POST", "/layout/distribute", data={
        "node_ids": node_ids,
        "axis": args.axis
    }))


# ── Metadata ─────────────────────────────────────────────────────────────────

def cmd_set_node_metadata(args):
    updates = {}
    if args.node_type is not None:
        updates["type"] = args.node_type
    tags = _parse_list_arg(args.tags)
    if tags is not None:
        updates["tags"] = tags
    if args.description is not None:
        updates["description"] = args.description

    _json_out(_api_request("PATCH", f"/nodes/{args.node_id}", data=updates))


def cmd_bulk_tag_nodes(args):
    node_ids = _parse_list_arg(args.node_ids) or []
    add_tags = _parse_list_arg(args.add_tags)
    remove_tags = _parse_list_arg(args.remove_tags)

    _json_out(_api_request("POST", "/nodes/bulk-tags", data={
        "node_ids": node_ids,
        "add_tags": add_tags,
        "remove_tags": remove_tags
    }))


# ── History ──────────────────────────────────────────────────────────────────

def cmd_undo(args):
    _json_out(_api_request("POST", "/undo"))


def cmd_redo(args):
    _json_out(_api_request("POST", "/redo"))


def cmd_create_snapshot(args):
    _json_out(_api_request("POST", "/snapshots", data={"name": args.name}))


def cmd_list_snapshots(args):
    _json_out(_api_request("GET", "/snapshots"))


def cmd_restore_snapshot(args):
    _json_out(_api_request("POST", f"/snapshots/{args.name}/restore"))


# ── Analysis ─────────────────────────────────────────────────────────────────

def cmd_validate_structure(args):
    from core.models import Diagram
    from core.validation import validate_diagram, validation_summary

    state = _api_request("GET", "/diagram")
    diagram_data = state.get("diagram")

    if not diagram_data:
        _json_out({"success": False, "error": "No diagram open"})

    diagram = Diagram.from_json_dict(diagram_data)
    issues = validate_diagram(diagram)
    summary = validation_summary(issues)

    _json_out({
        "success": True,
        "issues": [issue.to_dict() for issue in issues],
        "summary": summary
    })


def cmd_summarize(args):
    from core.models import Diagram
    from core.analysis import summarize_diagram

    state = _api_request("GET", "/diagram")
    diagram_data = state.get("diagram")

    if not diagram_data:
        _json_out({"success": False, "error": "No diagram open"})

    diagram = Diagram.from_json_dict(diagram_data)
    summary = summarize_diagram(diagram)

    _json_out({
        "success": True,
        "summary": summary.to_dict()
    })


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Diagram tool CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    # Service
    sub.add_parser("start")
    sub.add_parser("stop")

    # Core
    sub.add_parser("get-current")

    p = sub.add_parser("list-diagrams")
    p.add_argument("--directory", default=os.path.expanduser("~/diagrams"))

    p = sub.add_parser("open")
    p.add_argument("--file-path", required=True)

    p = sub.add_parser("new")
    p.add_argument("--name", default="Untitled Diagram")

    p = sub.add_parser("save")
    p.add_argument("--file-path", default=None)

    # Nodes
    p = sub.add_parser("add-node")
    p.add_argument("--label", required=True)
    p.add_argument("--x", type=float, default=100)
    p.add_argument("--y", type=float, default=100)
    p.add_argument("--node-type", default="component")
    p.add_argument("--shape", default="rectangle")
    p.add_argument("--color", default="#3478f6")
    p.add_argument("--width", type=float, default=150)
    p.add_argument("--height", type=float, default=80)
    p.add_argument("--tags", default=None)
    p.add_argument("--description", default="")

    p = sub.add_parser("update-node")
    p.add_argument("--node-id", required=True)
    p.add_argument("--label", default=None)
    p.add_argument("--x", type=float, default=None)
    p.add_argument("--y", type=float, default=None)
    p.add_argument("--node-type", default=None)
    p.add_argument("--shape", default=None)
    p.add_argument("--color", default=None)
    p.add_argument("--width", type=float, default=None)
    p.add_argument("--height", type=float, default=None)
    p.add_argument("--tags", default=None)
    p.add_argument("--description", default=None)

    p = sub.add_parser("delete-node")
    p.add_argument("--node-id", required=True)

    p = sub.add_parser("search-nodes")
    p.add_argument("--label", default=None)
    p.add_argument("--tag", default=None)
    p.add_argument("--node-type", default=None)

    # Edges
    p = sub.add_parser("add-edge")
    p.add_argument("--from-node", required=True)
    p.add_argument("--to-node", required=True)
    p.add_argument("--label", default="")
    p.add_argument("--auto-route", default="true")
    p.add_argument("--source-side", default=None)
    p.add_argument("--target-side", default=None)

    p = sub.add_parser("update-edge")
    p.add_argument("--edge-id", required=True)
    p.add_argument("--label", default=None)
    p.add_argument("--color", default=None)
    p.add_argument("--width", type=float, default=None)
    p.add_argument("--style", default=None)
    p.add_argument("--arrow-start", default=None)
    p.add_argument("--arrow-end", default=None)

    p = sub.add_parser("set-edge-sides")
    p.add_argument("--edge-id", required=True)
    p.add_argument("--source-side", default=None)
    p.add_argument("--target-side", default=None)

    sub.add_parser("auto-route-all")

    p = sub.add_parser("delete-edge")
    p.add_argument("--edge-id", required=True)

    # Layout
    p = sub.add_parser("auto-layout")
    p.add_argument("--strategy", default="grid")

    p = sub.add_parser("align-nodes")
    p.add_argument("--node-ids", required=True)
    p.add_argument("--alignment", default="left")

    p = sub.add_parser("distribute-nodes")
    p.add_argument("--node-ids", required=True)
    p.add_argument("--axis", default="horizontal")

    # Metadata
    p = sub.add_parser("set-node-metadata")
    p.add_argument("--node-id", required=True)
    p.add_argument("--node-type", default=None)
    p.add_argument("--tags", default=None)
    p.add_argument("--description", default=None)

    p = sub.add_parser("bulk-tag-nodes")
    p.add_argument("--node-ids", required=True)
    p.add_argument("--add-tags", default=None)
    p.add_argument("--remove-tags", default=None)

    # History
    sub.add_parser("undo")
    sub.add_parser("redo")

    p = sub.add_parser("create-snapshot")
    p.add_argument("--name", required=True)

    sub.add_parser("list-snapshots")

    p = sub.add_parser("restore-snapshot")
    p.add_argument("--name", required=True)

    # Analysis
    sub.add_parser("validate-structure")
    sub.add_parser("summarize")

    args = parser.parse_args()

    cmd_map = {
        "start": cmd_start,
        "stop": cmd_stop,
        "get-current": cmd_get_current,
        "list-diagrams": cmd_list_diagrams,
        "open": cmd_open,
        "new": cmd_new,
        "save": cmd_save,
        "add-node": cmd_add_node,
        "update-node": cmd_update_node,
        "delete-node": cmd_delete_node,
        "search-nodes": cmd_search_nodes,
        "add-edge": cmd_add_edge,
        "update-edge": cmd_update_edge,
        "set-edge-sides": cmd_set_edge_sides,
        "auto-route-all": cmd_auto_route_all,
        "delete-edge": cmd_delete_edge,
        "auto-layout": cmd_auto_layout,
        "align-nodes": cmd_align_nodes,
        "distribute-nodes": cmd_distribute_nodes,
        "set-node-metadata": cmd_set_node_metadata,
        "bulk-tag-nodes": cmd_bulk_tag_nodes,
        "undo": cmd_undo,
        "redo": cmd_redo,
        "create-snapshot": cmd_create_snapshot,
        "list-snapshots": cmd_list_snapshots,
        "restore-snapshot": cmd_restore_snapshot,
        "validate-structure": cmd_validate_structure,
        "summarize": cmd_summarize,
    }
    cmd_map[args.command](args)


if __name__ == "__main__":
    main()
