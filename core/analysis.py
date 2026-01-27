"""
Diagram analysis - Graph analysis and summarization utilities.

Provides analysis functions that can be used by both the backend and MCP tools
to understand diagram structure.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .models import Diagram, Node


@dataclass
class ConnectedComponent:
    """A connected component in the diagram graph."""
    node_ids: list[str] = field(default_factory=list)
    edge_count: int = 0

    @property
    def size(self) -> int:
        return len(self.node_ids)


@dataclass
class NodeConnectionInfo:
    """Connection information for a single node."""
    node_id: str
    label: str
    incoming: int = 0   # Edges pointing to this node
    outgoing: int = 0   # Edges pointing from this node

    @property
    def total(self) -> int:
        return self.incoming + self.outgoing


@dataclass
class DiagramSummary:
    """Complete summary of a diagram's structure."""
    name: str
    total_nodes: int
    total_edges: int
    nodes_by_type: dict[str, int]
    nodes_by_shape: dict[str, int]
    tags_in_use: list[str]
    connected_components: int
    most_connected_nodes: list[NodeConnectionInfo]
    orphan_count: int

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "name": self.name,
            "total_nodes": self.total_nodes,
            "total_edges": self.total_edges,
            "nodes_by_type": self.nodes_by_type,
            "nodes_by_shape": self.nodes_by_shape,
            "tags_in_use": self.tags_in_use,
            "connected_components": self.connected_components,
            "most_connected_nodes": [
                {
                    "id": n.node_id,
                    "label": n.label,
                    "connections": n.total,
                    "incoming": n.incoming,
                    "outgoing": n.outgoing
                }
                for n in self.most_connected_nodes
            ],
            "orphan_count": self.orphan_count
        }


def find_connected_components(diagram: "Diagram") -> list[ConnectedComponent]:
    """
    Find all connected components in the diagram using BFS.

    A connected component is a set of nodes where every node is reachable
    from every other node (treating edges as undirected).

    Args:
        diagram: The diagram to analyze

    Returns:
        List of ConnectedComponent objects
    """
    if not diagram.nodes:
        return []

    node_ids = [n.id for n in diagram.nodes]

    # Build adjacency list (undirected)
    adjacency: dict[str, set[str]] = {nid: set() for nid in node_ids}
    edge_counts: dict[str, int] = defaultdict(int)

    for edge in diagram.edges:
        if edge.source in adjacency and edge.target in adjacency:
            adjacency[edge.source].add(edge.target)
            adjacency[edge.target].add(edge.source)
            edge_counts[edge.source] += 1
            edge_counts[edge.target] += 1

    # BFS to find components
    visited: set[str] = set()
    components: list[ConnectedComponent] = []

    for start_node in node_ids:
        if start_node in visited:
            continue

        # BFS from this node
        component_nodes: list[str] = []
        component_edges = 0
        queue = [start_node]

        while queue:
            current = queue.pop(0)
            if current in visited:
                continue

            visited.add(current)
            component_nodes.append(current)

            for neighbor in adjacency[current]:
                if neighbor not in visited:
                    queue.append(neighbor)
                    component_edges += 1

        components.append(ConnectedComponent(
            node_ids=component_nodes,
            edge_count=component_edges
        ))

    return components


def calculate_node_connections(diagram: "Diagram") -> dict[str, NodeConnectionInfo]:
    """
    Calculate connection counts for all nodes.

    Args:
        diagram: The diagram to analyze

    Returns:
        Dictionary mapping node_id to NodeConnectionInfo
    """
    # Initialize with node labels
    connections: dict[str, NodeConnectionInfo] = {}
    for node in diagram.nodes:
        connections[node.id] = NodeConnectionInfo(
            node_id=node.id,
            label=node.label
        )

    # Count connections
    for edge in diagram.edges:
        if edge.source in connections:
            connections[edge.source].outgoing += 1
        if edge.target in connections:
            connections[edge.target].incoming += 1

    return connections


def summarize_diagram(diagram: "Diagram", top_n: int = 5) -> DiagramSummary:
    """
    Generate a comprehensive summary of a diagram.

    Args:
        diagram: The diagram to summarize
        top_n: Number of top connected nodes to include

    Returns:
        DiagramSummary object with all analysis results
    """
    nodes = diagram.nodes
    edges = diagram.edges

    # Count by type
    type_counts: dict[str, int] = defaultdict(int)
    for node in nodes:
        type_counts[node.type] += 1

    # Count by shape
    shape_counts: dict[str, int] = defaultdict(int)
    for node in nodes:
        shape_counts[node.shape] += 1

    # Collect all tags
    all_tags: set[str] = set()
    for node in nodes:
        all_tags.update(node.tags)

    # Find connected components
    components = find_connected_components(diagram)

    # Calculate node connections
    connections = calculate_node_connections(diagram)

    # Find most connected nodes
    sorted_by_connections = sorted(
        connections.values(),
        key=lambda x: x.total,
        reverse=True
    )
    most_connected = [n for n in sorted_by_connections[:top_n] if n.total > 0]

    # Count orphans (nodes with no connections)
    orphan_count = sum(1 for n in connections.values() if n.total == 0)

    return DiagramSummary(
        name=diagram.name,
        total_nodes=len(nodes),
        total_edges=len(edges),
        nodes_by_type=dict(type_counts),
        nodes_by_shape=dict(shape_counts),
        tags_in_use=sorted(list(all_tags)),
        connected_components=len(components),
        most_connected_nodes=most_connected,
        orphan_count=orphan_count
    )


def find_paths(
    diagram: "Diagram",
    source_id: str,
    target_id: str,
    max_depth: int = 10
) -> list[list[str]]:
    """
    Find all paths between two nodes using DFS.

    Args:
        diagram: The diagram to search
        source_id: Starting node ID
        target_id: Ending node ID
        max_depth: Maximum path length to search

    Returns:
        List of paths, where each path is a list of node IDs
    """
    # Build directed adjacency list
    adjacency: dict[str, list[str]] = defaultdict(list)
    for edge in diagram.edges:
        adjacency[edge.source].append(edge.target)

    paths: list[list[str]] = []

    def dfs(current: str, path: list[str], visited: set[str]):
        if len(path) > max_depth:
            return

        if current == target_id:
            paths.append(path.copy())
            return

        for neighbor in adjacency[current]:
            if neighbor not in visited:
                visited.add(neighbor)
                path.append(neighbor)
                dfs(neighbor, path, visited)
                path.pop()
                visited.remove(neighbor)

    dfs(source_id, [source_id], {source_id})
    return paths


def find_cycles(diagram: "Diagram") -> list[list[str]]:
    """
    Find all cycles in the diagram using DFS.

    Args:
        diagram: The diagram to search

    Returns:
        List of cycles, where each cycle is a list of node IDs
    """
    adjacency: dict[str, list[str]] = defaultdict(list)
    for edge in diagram.edges:
        adjacency[edge.source].append(edge.target)

    cycles: list[list[str]] = []
    visited_global: set[str] = set()

    def dfs(start: str, current: str, path: list[str], visited: set[str]):
        for neighbor in adjacency[current]:
            if neighbor == start and len(path) > 1:
                # Found a cycle
                cycles.append(path.copy() + [start])
            elif neighbor not in visited:
                visited.add(neighbor)
                path.append(neighbor)
                dfs(start, neighbor, path, visited)
                path.pop()
                visited.remove(neighbor)

    for node in diagram.nodes:
        if node.id not in visited_global:
            visited_global.add(node.id)
            dfs(node.id, node.id, [node.id], {node.id})

    # Remove duplicate cycles (same cycle starting from different nodes)
    unique_cycles: list[list[str]] = []
    seen: set[frozenset[str]] = set()
    for cycle in cycles:
        cycle_set = frozenset(cycle[:-1])  # Exclude repeated start node
        if cycle_set not in seen:
            seen.add(cycle_set)
            unique_cycles.append(cycle)

    return unique_cycles
