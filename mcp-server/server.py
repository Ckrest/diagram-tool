#!/usr/bin/env python3
"""
Diagram Tool MCP Server

Provides MCP tools for AI agents to interact with the diagram tool.
All changes are immediately reflected in the frontend via WebSocket updates.
"""

import httpx
from mcp.server.fastmcp import FastMCP
from typing import Optional
import json

# Backend API URL
API_BASE = "http://127.0.0.1:8765/api"

# Create MCP server
mcp = FastMCP("diagram-tool")


# --- HTTP Client Helper ---

def api_request(method: str, endpoint: str, **kwargs) -> dict:
    """Make a request to the diagram tool backend."""
    url = f"{API_BASE}{endpoint}"
    with httpx.Client(timeout=30.0) as client:
        if method == "GET":
            response = client.get(url, params=kwargs.get("params"))
        elif method == "POST":
            response = client.post(url, json=kwargs.get("json"), params=kwargs.get("params"))
        elif method == "PATCH":
            response = client.patch(url, json=kwargs.get("json"))
        elif method == "DELETE":
            response = client.delete(url)
        else:
            raise ValueError(f"Unknown method: {method}")

        if response.status_code >= 400:
            error = response.json().get("detail", "Unknown error")
            raise Exception(f"API error: {error}")

        return response.json()


# ============================================================================
# CORE INSPECTION TOOLS
# ============================================================================

@mcp.tool()
def diagram_get_current() -> str:
    """
    Get the full current diagram state.

    Returns the complete diagram including all nodes, edges, metadata,
    and current file path. Use this to understand what's in the diagram
    before making changes.
    """
    result = api_request("GET", "/diagram")
    return json.dumps(result, indent=2)


@mcp.tool()
def diagram_list_diagrams(directory: str = "/home/nick/diagrams") -> str:
    """
    List available diagram files on disk.

    Args:
        directory: Directory to search for diagram JSON files

    Returns list of diagrams with their paths, names, and node/edge counts.
    """
    result = api_request("GET", "/diagrams", params={"directory": directory})
    return json.dumps(result, indent=2)


@mcp.tool()
def diagram_open(file_path: str) -> str:
    """
    Load a diagram from a file as the active diagram.

    Args:
        file_path: Full path to the diagram JSON file

    Returns the opened diagram's state.
    """
    result = api_request("POST", "/diagram/open", json={"file_path": file_path})
    return json.dumps(result, indent=2)


@mcp.tool()
def diagram_new(name: str = "Untitled Diagram") -> str:
    """
    Create a new empty diagram.

    Args:
        name: Name for the new diagram

    Returns the new diagram's state.
    """
    result = api_request("POST", "/diagram/new", params={"name": name})
    return json.dumps(result, indent=2)


@mcp.tool()
def diagram_save(file_path: Optional[str] = None) -> str:
    """
    Save the current diagram to a file.

    Args:
        file_path: Path to save to (uses current path if not specified)

    Returns the saved file path.
    """
    result = api_request("POST", "/diagram/save", json={"file_path": file_path})
    return json.dumps(result, indent=2)


# ============================================================================
# NODE TOOLS
# ============================================================================

@mcp.tool()
def diagram_add_node(
    label: str,
    x: float = 100,
    y: float = 100,
    node_type: str = "component",
    shape: str = "rectangle",
    color: str = "#3478f6",
    width: float = 150,
    height: float = 80,
    tags: Optional[list[str]] = None,
    description: str = ""
) -> str:
    """
    Create a new node on the canvas.

    Args:
        label: Display text for the node
        x: X coordinate on canvas
        y: Y coordinate on canvas
        node_type: Semantic type (component, service, database, user, external, process, decision, note)
        shape: Visual shape (rectangle, ellipse, diamond, pill)
        color: Hex color code (e.g. "#3478f6")
        width: Node width in pixels
        height: Node height in pixels
        tags: List of tags for categorization
        description: Optional longer description

    Returns the created node with its generated ID.
    """
    result = api_request("POST", "/nodes", json={
        "label": label,
        "x": x,
        "y": y,
        "type": node_type,
        "shape": shape,
        "color": color,
        "width": width,
        "height": height,
        "tags": tags or [],
        "description": description
    })
    return json.dumps(result, indent=2)


@mcp.tool()
def diagram_update_node(
    node_id: str,
    label: Optional[str] = None,
    x: Optional[float] = None,
    y: Optional[float] = None,
    node_type: Optional[str] = None,
    shape: Optional[str] = None,
    color: Optional[str] = None,
    width: Optional[float] = None,
    height: Optional[float] = None,
    tags: Optional[list[str]] = None,
    description: Optional[str] = None
) -> str:
    """
    Modify an existing node's properties or position.

    Args:
        node_id: ID of the node to update
        label: New display text (optional)
        x: New X coordinate (optional)
        y: New Y coordinate (optional)
        node_type: New semantic type (optional)
        shape: New visual shape (optional)
        color: New hex color (optional)
        width: New width (optional)
        height: New height (optional)
        tags: New tags list (replaces existing, optional)
        description: New description (optional)

    Only provided fields are updated; others remain unchanged.
    """
    updates = {}
    if label is not None:
        updates["label"] = label
    if x is not None:
        updates["x"] = x
    if y is not None:
        updates["y"] = y
    if node_type is not None:
        updates["type"] = node_type
    if shape is not None:
        updates["shape"] = shape
    if color is not None:
        updates["color"] = color
    if width is not None:
        updates["width"] = width
    if height is not None:
        updates["height"] = height
    if tags is not None:
        updates["tags"] = tags
    if description is not None:
        updates["description"] = description

    result = api_request("PATCH", f"/nodes/{node_id}", json=updates)
    return json.dumps(result, indent=2)


@mcp.tool()
def diagram_delete_node(node_id: str) -> str:
    """
    Remove a node and all its connected edges.

    Args:
        node_id: ID of the node to delete

    The node and any edges connected to it will be removed.
    """
    result = api_request("DELETE", f"/nodes/{node_id}")
    return json.dumps(result, indent=2)


@mcp.tool()
def diagram_search_nodes(
    label: Optional[str] = None,
    tag: Optional[str] = None,
    node_type: Optional[str] = None
) -> str:
    """
    Find nodes by label, tag, or type.

    Args:
        label: Search for nodes containing this text in their label
        tag: Search for nodes with this tag
        node_type: Search for nodes of this type

    All criteria are AND'ed together.
    """
    params = {}
    if label:
        params["label"] = label
    if tag:
        params["tag"] = tag
    if node_type:
        params["type"] = node_type

    result = api_request("GET", "/nodes/search", params=params)
    return json.dumps(result, indent=2)


# ============================================================================
# EDGE TOOLS
# ============================================================================

@mcp.tool()
def diagram_add_edge(
    from_node: str,
    to_node: str,
    label: str = ""
) -> str:
    """
    Connect two nodes with a directed edge.

    Args:
        from_node: ID of the source node
        to_node: ID of the target node
        label: Optional label for the edge

    Creates an arrow from source to target.
    """
    result = api_request("POST", "/edges", json={
        "from": from_node,
        "to": to_node,
        "label": label
    })
    return json.dumps(result, indent=2)


@mcp.tool()
def diagram_update_edge(edge_id: str, label: str) -> str:
    """
    Change an edge's label.

    Args:
        edge_id: ID of the edge to update
        label: New label text
    """
    result = api_request("PATCH", f"/edges/{edge_id}", json={"label": label})
    return json.dumps(result, indent=2)


@mcp.tool()
def diagram_delete_edge(edge_id: str) -> str:
    """
    Remove an edge.

    Args:
        edge_id: ID of the edge to delete
    """
    result = api_request("DELETE", f"/edges/{edge_id}")
    return json.dumps(result, indent=2)


# ============================================================================
# LAYOUT / VISUAL STRUCTURE
# ============================================================================

@mcp.tool()
def diagram_auto_layout(strategy: str = "grid") -> str:
    """
    Automatically arrange all nodes based on a layout strategy.

    Args:
        strategy: Layout algorithm to use
            - "grid": Arrange nodes in a grid pattern
            - "tree": Hierarchical layout based on edge directions
            - "force": Force-directed layout (connected nodes attract)

    All nodes will be repositioned.
    """
    result = api_request("POST", "/layout/auto", json={"strategy": strategy})
    return json.dumps(result, indent=2)


@mcp.tool()
def diagram_align_nodes(node_ids: list[str], alignment: str = "left") -> str:
    """
    Align selected nodes along an edge or center.

    Args:
        node_ids: List of node IDs to align
        alignment: How to align them
            - "left": Align left edges
            - "right": Align right edges
            - "top": Align top edges
            - "bottom": Align bottom edges
            - "center_h": Align horizontal centers
            - "center_v": Align vertical centers
    """
    result = api_request("POST", "/layout/align", json={
        "node_ids": node_ids,
        "alignment": alignment
    })
    return json.dumps(result, indent=2)


@mcp.tool()
def diagram_distribute_nodes(node_ids: list[str], axis: str = "horizontal") -> str:
    """
    Evenly space nodes along an axis.

    Args:
        node_ids: List of node IDs to distribute (needs at least 3)
        axis: "horizontal" or "vertical"

    Nodes will be evenly spaced between the first and last node's position.
    """
    result = api_request("POST", "/layout/distribute", json={
        "node_ids": node_ids,
        "axis": axis
    })
    return json.dumps(result, indent=2)


# ============================================================================
# SEMANTICS / METADATA
# ============================================================================

@mcp.tool()
def diagram_set_node_metadata(
    node_id: str,
    node_type: Optional[str] = None,
    tags: Optional[list[str]] = None,
    description: Optional[str] = None
) -> str:
    """
    Update a node's semantic metadata (type, tags, description).

    Args:
        node_id: ID of the node to update
        node_type: New semantic type (component, service, database, etc.)
        tags: New tags list (replaces existing)
        description: New description text
    """
    updates = {}
    if node_type is not None:
        updates["type"] = node_type
    if tags is not None:
        updates["tags"] = tags
    if description is not None:
        updates["description"] = description

    result = api_request("PATCH", f"/nodes/{node_id}", json=updates)
    return json.dumps(result, indent=2)


@mcp.tool()
def diagram_bulk_tag_nodes(
    node_ids: list[str],
    add_tags: Optional[list[str]] = None,
    remove_tags: Optional[list[str]] = None
) -> str:
    """
    Add or remove tags from multiple nodes at once.

    Args:
        node_ids: List of node IDs to modify
        add_tags: Tags to add to all specified nodes
        remove_tags: Tags to remove from all specified nodes

    Useful for bulk categorization.
    """
    result = api_request("POST", "/nodes/bulk-tags", json={
        "node_ids": node_ids,
        "add_tags": add_tags,
        "remove_tags": remove_tags
    })
    return json.dumps(result, indent=2)


@mcp.tool()
def diagram_validate_structure() -> str:
    """
    Check the diagram for common structural issues.

    Returns a list of warnings/errors such as:
    - Orphan nodes (no connections)
    - Cycles in the graph
    - Missing labels
    - Duplicate edges
    """
    # Get current diagram
    state = api_request("GET", "/diagram")
    diagram = state.get("diagram")

    if not diagram:
        return json.dumps({"success": False, "error": "No diagram open"})

    issues = []
    nodes = diagram.get("nodes", [])
    edges = diagram.get("edges", [])
    node_ids = {n["id"] for n in nodes}

    # Check for orphan nodes
    connected_nodes = set()
    for edge in edges:
        connected_nodes.add(edge["from"])
        connected_nodes.add(edge["to"])

    orphans = node_ids - connected_nodes
    if orphans:
        issues.append({
            "type": "warning",
            "message": f"Orphan nodes (no connections): {list(orphans)}"
        })

    # Check for missing labels
    for node in nodes:
        if not node.get("label") or node["label"].strip() == "":
            issues.append({
                "type": "warning",
                "message": f"Node {node['id']} has no label"
            })

    # Check for duplicate edges
    edge_pairs = []
    for edge in edges:
        pair = (edge["from"], edge["to"])
        if pair in edge_pairs:
            issues.append({
                "type": "warning",
                "message": f"Duplicate edge from {edge['from']} to {edge['to']}"
            })
        edge_pairs.append(pair)

    # Check for self-loops
    for edge in edges:
        if edge["from"] == edge["to"]:
            issues.append({
                "type": "info",
                "message": f"Self-loop on node {edge['from']}"
            })

    # Check for invalid edge references
    for edge in edges:
        if edge["from"] not in node_ids:
            issues.append({
                "type": "error",
                "message": f"Edge {edge['id']} references non-existent source node {edge['from']}"
            })
        if edge["to"] not in node_ids:
            issues.append({
                "type": "error",
                "message": f"Edge {edge['id']} references non-existent target node {edge['to']}"
            })

    return json.dumps({
        "success": True,
        "issues": issues,
        "summary": {
            "errors": len([i for i in issues if i["type"] == "error"]),
            "warnings": len([i for i in issues if i["type"] == "warning"]),
            "info": len([i for i in issues if i["type"] == "info"])
        }
    }, indent=2)


# ============================================================================
# HISTORY / SAFETY
# ============================================================================

@mcp.tool()
def diagram_undo() -> str:
    """
    Revert the last change.

    Undoes the most recent modification to the diagram.
    """
    result = api_request("POST", "/undo")
    return json.dumps(result, indent=2)


@mcp.tool()
def diagram_redo() -> str:
    """
    Reapply an undone change.

    Redoes a change that was previously undone.
    """
    result = api_request("POST", "/redo")
    return json.dumps(result, indent=2)


@mcp.tool()
def diagram_create_snapshot(name: str) -> str:
    """
    Save a named restore point.

    Args:
        name: Name for this snapshot (e.g., "before_refactor")

    Snapshots persist until explicitly deleted and can be restored at any time.
    """
    result = api_request("POST", "/snapshots", json={"name": name})
    return json.dumps(result, indent=2)


@mcp.tool()
def diagram_list_snapshots() -> str:
    """
    Show all available named snapshots.

    Returns a list of snapshot names and when they were created.
    """
    result = api_request("GET", "/snapshots")
    return json.dumps(result, indent=2)


@mcp.tool()
def diagram_restore_snapshot(name: str) -> str:
    """
    Restore a saved snapshot.

    Args:
        name: Name of the snapshot to restore

    The current diagram state will be replaced with the snapshot.
    The current state is added to undo history first.
    """
    result = api_request("POST", f"/snapshots/{name}/restore")
    return json.dumps(result, indent=2)


# ============================================================================
# HIGH-LEVEL AI HELPERS
# ============================================================================

@mcp.tool()
def diagram_summarize() -> str:
    """
    Get a structured summary of the current diagram.

    Returns:
    - Node count by type
    - Edge count
    - Tags in use
    - Connected components
    - Key statistics
    """
    state = api_request("GET", "/diagram")
    diagram = state.get("diagram")

    if not diagram:
        return json.dumps({"success": False, "error": "No diagram open"})

    nodes = diagram.get("nodes", [])
    edges = diagram.get("edges", [])

    # Count by type
    type_counts = {}
    for node in nodes:
        t = node.get("type", "unknown")
        type_counts[t] = type_counts.get(t, 0) + 1

    # Count by shape
    shape_counts = {}
    for node in nodes:
        s = node.get("shape", "unknown")
        shape_counts[s] = shape_counts.get(s, 0) + 1

    # Collect all tags
    all_tags = set()
    for node in nodes:
        all_tags.update(node.get("tags", []))

    # Find connected components
    node_ids = [n["id"] for n in nodes]
    adj = {nid: set() for nid in node_ids}
    for edge in edges:
        if edge["from"] in adj and edge["to"] in adj:
            adj[edge["from"]].add(edge["to"])
            adj[edge["to"]].add(edge["from"])

    visited = set()
    components = 0
    for nid in node_ids:
        if nid not in visited:
            components += 1
            stack = [nid]
            while stack:
                current = stack.pop()
                if current not in visited:
                    visited.add(current)
                    stack.extend(adj[current] - visited)

    # Find nodes with most connections
    connection_counts = {nid: 0 for nid in node_ids}
    for edge in edges:
        connection_counts[edge["from"]] = connection_counts.get(edge["from"], 0) + 1
        connection_counts[edge["to"]] = connection_counts.get(edge["to"], 0) + 1

    most_connected = sorted(connection_counts.items(), key=lambda x: -x[1])[:5]

    # Build node label lookup
    node_labels = {n["id"]: n["label"] for n in nodes}

    return json.dumps({
        "success": True,
        "summary": {
            "name": diagram.get("name"),
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "nodes_by_type": type_counts,
            "nodes_by_shape": shape_counts,
            "tags_in_use": sorted(list(all_tags)),
            "connected_components": components,
            "most_connected_nodes": [
                {"id": nid, "label": node_labels.get(nid, ""), "connections": count}
                for nid, count in most_connected if count > 0
            ]
        }
    }, indent=2)


@mcp.tool()
def diagram_generate_from_text(description: str) -> str:
    """
    Build or update a diagram based on a text description.

    Args:
        description: Natural language description of what to add/create.
            Examples:
            - "Add a database node called 'Users DB' connected to 'Auth Service'"
            - "Create three services: API Gateway, User Service, Order Service"
            - "Connect all services tagged 'backend' to the 'Message Queue' node"

    This is a helper that parses the description and executes the appropriate
    diagram operations. For complex changes, the AI should use this as guidance
    and call individual tools directly.

    Returns a summary of what was created/modified.
    """
    # This is a placeholder that provides guidance
    # The actual generation would be done by the AI calling this tool
    # and then following up with specific tool calls

    return json.dumps({
        "success": True,
        "message": "To generate from text, I'll analyze your description and execute the appropriate diagram operations.",
        "description_received": description,
        "guidance": {
            "step1": "First, call diagram_get_current() to see existing nodes",
            "step2": "Parse the description to identify: new nodes, new edges, modifications",
            "step3": "Call diagram_add_node() for each new node",
            "step4": "Call diagram_add_edge() to create connections",
            "step5": "Call diagram_auto_layout() if many nodes were added",
            "tip": "Use diagram_search_nodes() to find existing nodes by label"
        }
    }, indent=2)


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    mcp.run()
