# Diagram Tool - Edge Improvements Proposal

## Current Problems

1. **Dumb Bezier Curves**: Control points use fixed distances, creating uniform curves that don't adapt to actual path needs
2. **No Obstacle Avoidance**: Edges cross through nodes and other edges
3. **Manual Connection Sides**: User must set which side edges connect to
4. **No Orthogonal Mode**: Only curved paths, no right-angle routing
5. **No Waypoints**: Can't add intermediate control points

## Proposed MCP Edge Tools

### 1. `diagram_auto_route_edge`
Automatically find optimal path between two nodes.

```python
def diagram_auto_route_edge(
    edge_id: str,
    routing_mode: Literal["bezier", "orthogonal", "direct"] = "bezier",
    avoid_nodes: bool = True,
    avoid_edges: bool = False
) -> Edge:
    """
    Re-route an edge with smart pathfinding.

    - bezier: Smooth curves that avoid obstacles
    - orthogonal: Right-angle paths (like circuit diagrams)
    - direct: Straight line (may cross nodes)
    """
```

### 2. `diagram_add_edge_waypoint`
Add manual control points to an edge path.

```python
def diagram_add_edge_waypoint(
    edge_id: str,
    x: float,
    y: float,
    index: int = -1  # -1 = append
) -> Edge:
    """Add a waypoint to control edge routing."""
```

### 3. `diagram_set_connection_sides`
Explicitly set which sides of nodes an edge connects to.

```python
def diagram_set_connection_sides(
    edge_id: str,
    source_side: Literal["top", "right", "bottom", "left", "auto"],
    target_side: Literal["top", "right", "bottom", "left", "auto"]
) -> Edge:
    """
    Set connection points for an edge.
    'auto' = smart selection based on relative positions.
    """
```

### 4. `diagram_auto_route_all`
Re-route all edges in the diagram for optimal layout.

```python
def diagram_auto_route_all(
    routing_mode: Literal["bezier", "orthogonal", "mixed"] = "mixed",
    minimize_crossings: bool = True
) -> DiagramState:
    """
    Globally optimize all edge routing.
    'mixed' uses orthogonal for aligned nodes, bezier for diagonal.
    """
```

### 5. `diagram_bundle_edges`
Group parallel edges together for cleaner appearance.

```python
def diagram_bundle_edges(
    edge_ids: List[str],
    spacing: float = 5.0
) -> List[Edge]:
    """Bundle multiple edges that share source or target."""
```

## Backend Algorithm Requirements

### Smart Connection Side Selection
```python
def get_optimal_sides(source_node, target_node):
    """
    Determine best connection sides based on:
    1. Relative positions (if target is below, use bottom→top)
    2. Existing connections (avoid crowding one side)
    3. Edge crossing minimization
    """
    dx = target_node.x - source_node.x
    dy = target_node.y - source_node.y

    # Primary direction
    if abs(dx) > abs(dy):
        # Horizontal dominant
        source_side = "right" if dx > 0 else "left"
        target_side = "left" if dx > 0 else "right"
    else:
        # Vertical dominant
        source_side = "bottom" if dy > 0 else "top"
        target_side = "top" if dy > 0 else "bottom"

    return source_side, target_side
```

### Orthogonal Routing (A* based)
```python
def orthogonal_route(source_point, target_point, obstacles):
    """
    Find path using only horizontal and vertical segments.
    Uses A* algorithm on a grid, avoiding obstacle bounding boxes.
    Returns list of waypoints.
    """
```

### Adaptive Bezier Control Points
```python
def smart_bezier_controls(start, end, start_side, end_side):
    """
    Calculate control points that:
    1. Scale with distance (longer paths = wider curves)
    2. Account for direction changes
    3. Avoid tight loops
    """
    distance = math.hypot(end.x - start.x, end.y - start.y)
    control_distance = min(distance * 0.4, 100)  # Cap at 100px
    # ... rest of calculation
```

## Frontend Changes Needed

1. **Edge data model**: Add `waypoints: Point[]` and `routing_mode: string`
2. **Path rendering**: Support waypoint-based paths
3. **Interactive editing**: Drag waypoints to adjust paths
4. **Visual feedback**: Show connection points on hover

## Priority Order

1. **Smart connection side selection** (biggest impact, moderate effort)
2. **Adaptive bezier curves** (good impact, low effort)
3. **Orthogonal routing** (niche but valuable, high effort)
4. **Waypoints** (flexibility, moderate effort)
5. **Edge bundling** (polish, high effort)
