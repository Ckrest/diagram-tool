"""
Layout algorithms for diagram nodes.

Provides various layout strategies that can be applied to diagrams:
- Grid: Simple grid arrangement
- Tree: Hierarchical layout based on edge directions
- Force: Force-directed layout using spring physics

All layout functions modify nodes in-place and return the modified list.
"""

import math
from collections import defaultdict
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .models import Node, Edge


# Default layout parameters
DEFAULT_SPACING_X = 200
DEFAULT_SPACING_Y = 150
DEFAULT_START_X = 100
DEFAULT_START_Y = 100


def grid_layout(
    nodes: list["Node"],
    spacing_x: float = DEFAULT_SPACING_X,
    spacing_y: float = DEFAULT_SPACING_Y,
    start_x: float = DEFAULT_START_X,
    start_y: float = DEFAULT_START_Y,
    columns: int | None = None
) -> list["Node"]:
    """
    Arrange nodes in a grid pattern.

    Args:
        nodes: List of nodes to arrange
        spacing_x: Horizontal spacing between nodes
        spacing_y: Vertical spacing between nodes
        start_x: X coordinate of first node
        start_y: Y coordinate of first node
        columns: Number of columns (auto-calculated if None)

    Returns:
        The same list of nodes (modified in-place)
    """
    if not nodes:
        return nodes

    # Auto-calculate columns based on node count
    if columns is None:
        columns = max(3, int(len(nodes) ** 0.5) + 1)

    for i, node in enumerate(nodes):
        row = i // columns
        col = i % columns
        node.x = start_x + col * spacing_x
        node.y = start_y + row * spacing_y

    return nodes


def tree_layout(
    nodes: list["Node"],
    edges: list["Edge"],
    spacing_x: float = DEFAULT_SPACING_X,
    spacing_y: float = DEFAULT_SPACING_Y,
    start_x: float = DEFAULT_START_X,
    start_y: float = DEFAULT_START_Y,
    orientation: str = "vertical"  # "vertical" or "horizontal"
) -> list["Node"]:
    """
    Arrange nodes in a hierarchical tree layout based on edge directions.

    Nodes with no incoming edges are placed at the root level.
    Children are positioned below their parents.

    Args:
        nodes: List of nodes to arrange
        edges: List of edges defining the hierarchy
        spacing_x: Horizontal spacing between nodes
        spacing_y: Vertical spacing between levels
        start_x: X coordinate of first node
        start_y: Y coordinate of first node
        orientation: "vertical" (top-to-bottom) or "horizontal" (left-to-right)

    Returns:
        The same list of nodes (modified in-place)
    """
    if not nodes:
        return nodes

    # Build adjacency list (parent -> children)
    children: dict[str, list[str]] = {n.id: [] for n in nodes}
    has_parent: set[str] = set()

    for edge in edges:
        if edge.source in children and edge.target in children:
            children[edge.source].append(edge.target)
            has_parent.add(edge.target)

    # Find roots (nodes with no incoming edges)
    roots = [n.id for n in nodes if n.id not in has_parent]
    if not roots:
        # No clear roots, use first node
        roots = [nodes[0].id] if nodes else []

    # BFS to assign levels
    levels: dict[str, int] = {}
    queue = [(r, 0) for r in roots]

    while queue:
        node_id, level = queue.pop(0)
        if node_id in levels:
            continue
        levels[node_id] = level
        for child in children.get(node_id, []):
            queue.append((child, level + 1))

    # Handle disconnected nodes
    for node in nodes:
        if node.id not in levels:
            levels[node.id] = 0

    # Assign positions by level
    level_counts: dict[int, int] = defaultdict(int)
    node_map = {n.id: n for n in nodes}

    for node in nodes:
        level = levels[node.id]
        idx = level_counts[level]
        level_counts[level] += 1

        if orientation == "vertical":
            node.x = start_x + idx * spacing_x
            node.y = start_y + level * spacing_y
        else:  # horizontal
            node.x = start_x + level * spacing_x
            node.y = start_y + idx * spacing_y

    return nodes


def force_layout(
    nodes: list["Node"],
    edges: list["Edge"],
    iterations: int = 100,
    repulsion: float = 5000,
    attraction: float = 0.01,
    damping: float = 0.1,
    min_distance: float = 50
) -> list["Node"]:
    """
    Arrange nodes using a force-directed layout algorithm.

    Simulates physical forces:
    - All nodes repel each other (like charged particles)
    - Connected nodes attract each other (like springs)

    Args:
        nodes: List of nodes to arrange
        edges: List of edges (connected nodes attract)
        iterations: Number of simulation iterations
        repulsion: Strength of repulsion between all nodes
        attraction: Strength of attraction along edges
        damping: Factor to reduce movement each iteration
        min_distance: Minimum distance to clamp forces

    Returns:
        The same list of nodes (modified in-place)
    """
    if len(nodes) < 2:
        return nodes

    # Build node lookup
    node_map = {n.id: n for n in nodes}

    # Initialize with circular layout for better starting positions
    center_x, center_y = 400, 400
    radius = 200
    for i, node in enumerate(nodes):
        angle = 2 * math.pi * i / len(nodes)
        node.x = center_x + radius * math.cos(angle)
        node.y = center_y + radius * math.sin(angle)

    # Run simulation
    for iteration in range(iterations):
        # Calculate forces for each node
        forces: dict[str, tuple[float, float]] = {n.id: (0.0, 0.0) for n in nodes}

        # Repulsion between all node pairs
        for i, n1 in enumerate(nodes):
            for j, n2 in enumerate(nodes):
                if i >= j:
                    continue

                dx = n1.x - n2.x
                dy = n1.y - n2.y
                dist = max(min_distance, math.sqrt(dx * dx + dy * dy))

                # Coulomb's law: F = k * q1 * q2 / r^2
                force = repulsion / (dist * dist)
                fx = force * dx / dist
                fy = force * dy / dist

                # Apply equal and opposite forces
                f1x, f1y = forces[n1.id]
                f2x, f2y = forces[n2.id]
                forces[n1.id] = (f1x + fx, f1y + fy)
                forces[n2.id] = (f2x - fx, f2y - fy)

        # Attraction along edges (Hooke's law)
        for edge in edges:
            source = node_map.get(edge.source)
            target = node_map.get(edge.target)
            if not source or not target:
                continue

            dx = target.x - source.x
            dy = target.y - source.y
            dist = max(min_distance, math.sqrt(dx * dx + dy * dy))

            # Hooke's law: F = -k * x
            force = dist * attraction
            fx = force * dx / dist
            fy = force * dy / dist

            # Pull nodes toward each other
            f1x, f1y = forces[source.id]
            f2x, f2y = forces[target.id]
            forces[source.id] = (f1x + fx, f1y + fy)
            forces[target.id] = (f2x - fx, f2y - fy)

        # Apply forces with damping
        for node in nodes:
            fx, fy = forces[node.id]
            node.x = max(min_distance, node.x + fx * damping)
            node.y = max(min_distance, node.y + fy * damping)

    return nodes


def align_nodes(
    nodes: list["Node"],
    node_ids: list[str],
    alignment: str = "left"
) -> bool:
    """
    Align selected nodes along an edge or center.

    Args:
        nodes: All nodes in the diagram
        node_ids: IDs of nodes to align
        alignment: One of "left", "right", "top", "bottom", "center_h", "center_v"

    Returns:
        True if alignment was performed, False if insufficient nodes
    """
    # Find target nodes
    targets = [n for n in nodes if n.id in node_ids]
    if len(targets) < 2:
        return False

    if alignment == "left":
        min_x = min(n.x for n in targets)
        for n in targets:
            n.x = min_x

    elif alignment == "right":
        max_x = max(n.x + n.width for n in targets)
        for n in targets:
            n.x = max_x - n.width

    elif alignment == "top":
        min_y = min(n.y for n in targets)
        for n in targets:
            n.y = min_y

    elif alignment == "bottom":
        max_y = max(n.y + n.height for n in targets)
        for n in targets:
            n.y = max_y - n.height

    elif alignment == "center_h":
        center_x = sum(n.x + n.width / 2 for n in targets) / len(targets)
        for n in targets:
            n.x = center_x - n.width / 2

    elif alignment == "center_v":
        center_y = sum(n.y + n.height / 2 for n in targets) / len(targets)
        for n in targets:
            n.y = center_y - n.height / 2

    else:
        return False

    return True


def distribute_nodes(
    nodes: list["Node"],
    node_ids: list[str],
    axis: str = "horizontal"
) -> bool:
    """
    Evenly distribute nodes along an axis.

    Args:
        nodes: All nodes in the diagram
        node_ids: IDs of nodes to distribute
        axis: "horizontal" or "vertical"

    Returns:
        True if distribution was performed, False if insufficient nodes
    """
    # Find target nodes
    targets = [n for n in nodes if n.id in node_ids]
    if len(targets) < 3:
        return False

    if axis == "horizontal":
        targets.sort(key=lambda n: n.x)
        min_x = targets[0].x
        max_x = targets[-1].x
        spacing = (max_x - min_x) / (len(targets) - 1)
        for i, n in enumerate(targets):
            n.x = min_x + i * spacing

    elif axis == "vertical":
        targets.sort(key=lambda n: n.y)
        min_y = targets[0].y
        max_y = targets[-1].y
        spacing = (max_y - min_y) / (len(targets) - 1)
        for i, n in enumerate(targets):
            n.y = min_y + i * spacing

    else:
        return False

    return True


def snap_to_grid(
    nodes: list["Node"],
    grid_size: int = 20
) -> list["Node"]:
    """
    Snap all nodes to the nearest grid position.

    Args:
        nodes: Nodes to snap
        grid_size: Grid cell size in pixels

    Returns:
        The same list of nodes (modified in-place)
    """
    if grid_size <= 0:
        return nodes

    for node in nodes:
        node.x = round(node.x / grid_size) * grid_size
        node.y = round(node.y / grid_size) * grid_size

    return nodes


def pack_nodes(
    nodes: list["Node"],
    padding: float = 20,
    start_x: float = DEFAULT_START_X,
    start_y: float = DEFAULT_START_Y
) -> list["Node"]:
    """
    Pack nodes tightly using a simple bin-packing algorithm.

    Useful for compacting diagrams after removing nodes.

    Args:
        nodes: Nodes to pack
        padding: Space between nodes
        start_x: Starting X coordinate
        start_y: Starting Y coordinate

    Returns:
        The same list of nodes (modified in-place)
    """
    if not nodes:
        return nodes

    # Sort by area (largest first for better packing)
    sorted_nodes = sorted(nodes, key=lambda n: n.width * n.height, reverse=True)

    # Simple row-based packing
    current_x = start_x
    current_y = start_y
    row_height = 0
    max_width = 1200  # Max row width before wrapping

    for node in sorted_nodes:
        if current_x + node.width > max_width and current_x > start_x:
            # Start new row
            current_x = start_x
            current_y += row_height + padding
            row_height = 0

        node.x = current_x
        node.y = current_y
        current_x += node.width + padding
        row_height = max(row_height, node.height)

    return nodes
