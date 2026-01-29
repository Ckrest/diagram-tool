"""
Diagram Manager - Core logic for diagram state, persistence, and history.

This module implements:
- Single diagram state management (one diagram open at a time)
- O(1) node/edge lookups via index dictionaries
- Linear undo/redo history using snapshots
- JSON file persistence
- Layout operations delegated to core.layout module
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional, Callable
import sys

# Add parent directory to path for core module access
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.models import Diagram, Node, Edge, DiagramMetadata
from core.layout import (
    grid_layout, tree_layout, force_layout,
    align_nodes as core_align_nodes,
    distribute_nodes as core_distribute_nodes
)


class DiagramManager:
    """
    Manages a single diagram's state, history, and persistence.

    Features:
    - O(1) node/edge lookups via index dictionaries
    - Snapshot-based undo/redo history
    - Named snapshots for manual restore points
    - Change callbacks for real-time sync

    The history system works via snapshots:
    - Each mutation creates a full snapshot of the diagram state
    - Undo restores the previous snapshot
    - Redo re-applies a snapshot from the future stack
    """

    def __init__(self, max_history: int = 100):
        self._diagram: Optional[Diagram] = None
        self._file_path: Optional[Path] = None
        self._history: list[dict] = []  # Past states (snapshots)
        self._future: list[dict] = []   # Future states (for redo)
        self._max_history = max_history
        self._dirty = False  # True if unsaved changes exist
        self._on_change_callbacks: list[Callable] = []
        self._on_save_callbacks: list[Callable] = []  # Called after successful save

        # O(1) lookup indexes
        self._node_index: dict[str, Node] = {}          # node_id -> Node
        self._edge_index: dict[str, Edge] = {}          # edge_id -> Edge
        self._tag_index: dict[str, set[str]] = {}       # tag -> set of node_ids
        self._type_index: dict[str, set[str]] = {}      # type -> set of node_ids
        self._edges_by_node: dict[str, set[str]] = {}   # node_id -> set of edge_ids

    # --- Index Management ---

    def _rebuild_indexes(self):
        """Rebuild all indexes from the current diagram state."""
        self._node_index.clear()
        self._edge_index.clear()
        self._tag_index.clear()
        self._type_index.clear()
        self._edges_by_node.clear()

        if self._diagram is None:
            return

        # Index nodes
        for node in self._diagram.nodes:
            self._node_index[node.id] = node
            # Tag index
            for tag in node.tags:
                if tag not in self._tag_index:
                    self._tag_index[tag] = set()
                self._tag_index[tag].add(node.id)
            # Type index
            if node.type not in self._type_index:
                self._type_index[node.type] = set()
            self._type_index[node.type].add(node.id)

        # Index edges
        for edge in self._diagram.edges:
            self._edge_index[edge.id] = edge
            # Edges by node (both source and target)
            if edge.source not in self._edges_by_node:
                self._edges_by_node[edge.source] = set()
            self._edges_by_node[edge.source].add(edge.id)
            if edge.target not in self._edges_by_node:
                self._edges_by_node[edge.target] = set()
            self._edges_by_node[edge.target].add(edge.id)

    def _index_node(self, node: Node):
        """Add a node to the indexes."""
        self._node_index[node.id] = node
        for tag in node.tags:
            if tag not in self._tag_index:
                self._tag_index[tag] = set()
            self._tag_index[tag].add(node.id)
        if node.type not in self._type_index:
            self._type_index[node.type] = set()
        self._type_index[node.type].add(node.id)

    def _unindex_node(self, node: Node):
        """Remove a node from the indexes."""
        self._node_index.pop(node.id, None)
        for tag in node.tags:
            if tag in self._tag_index:
                self._tag_index[tag].discard(node.id)
        if node.type in self._type_index:
            self._type_index[node.type].discard(node.id)

    def _index_edge(self, edge: Edge):
        """Add an edge to the indexes."""
        self._edge_index[edge.id] = edge
        if edge.source not in self._edges_by_node:
            self._edges_by_node[edge.source] = set()
        self._edges_by_node[edge.source].add(edge.id)
        if edge.target not in self._edges_by_node:
            self._edges_by_node[edge.target] = set()
        self._edges_by_node[edge.target].add(edge.id)

    def _unindex_edge(self, edge: Edge):
        """Remove an edge from the indexes."""
        self._edge_index.pop(edge.id, None)
        if edge.source in self._edges_by_node:
            self._edges_by_node[edge.source].discard(edge.id)
        if edge.target in self._edges_by_node:
            self._edges_by_node[edge.target].discard(edge.id)

    # --- Properties ---

    @property
    def diagram(self) -> Optional[Diagram]:
        """Get the current diagram."""
        return self._diagram

    @property
    def file_path(self) -> Optional[Path]:
        """Get the current file path."""
        return self._file_path

    @property
    def is_dirty(self) -> bool:
        """Check if there are unsaved changes."""
        return self._dirty

    @property
    def can_undo(self) -> bool:
        """Check if undo is available."""
        return len(self._history) > 0

    @property
    def can_redo(self) -> bool:
        """Check if redo is available."""
        return len(self._future) > 0

    # --- Change Callbacks ---

    def on_change(self, callback: Callable):
        """Register a callback for diagram changes."""
        self._on_change_callbacks.append(callback)

    def _notify_change(self):
        """Notify all registered callbacks of a change."""
        for callback in self._on_change_callbacks:
            callback()

    # --- Save Callbacks ---

    def on_save(self, callback: Callable):
        """Register a callback for diagram saves.

        Callback receives (path: Path, diagram_info: dict) where diagram_info contains:
        - name: diagram name
        - node_count: number of nodes
        - edge_count: number of edges
        """
        self._on_save_callbacks.append(callback)

    def _notify_save(self, path: Path):
        """Notify all registered callbacks of a successful save."""
        if not self._on_save_callbacks or self._diagram is None:
            return

        diagram_info = {
            "name": self._diagram.name,
            "node_count": len(self._diagram.nodes),
            "edge_count": len(self._diagram.edges),
        }

        for callback in self._on_save_callbacks:
            try:
                callback(path, diagram_info)
            except Exception:
                pass  # Don't let callback failures affect save operation

    # --- History Management ---

    def _save_to_history(self):
        """Save current state to history before a mutation."""
        if self._diagram is None:
            return

        # Clear future (new action invalidates redo stack)
        self._future.clear()

        # Save current state
        snapshot = self._diagram.to_json_dict()
        self._history.append(snapshot)

        # Trim history if too long
        if len(self._history) > self._max_history:
            self._history.pop(0)

    def _restore_from_snapshot(self, snapshot: dict) -> Diagram:
        """Restore a diagram from a snapshot dict."""
        return Diagram.from_json_dict(snapshot)

    # --- File Operations ---

    def new_diagram(self, name: str = "Untitled Diagram") -> Diagram:
        """Create a new empty diagram."""
        self._diagram = Diagram(name=name)
        self._file_path = None
        self._history.clear()
        self._future.clear()
        self._dirty = False
        self._rebuild_indexes()
        self._notify_change()
        return self._diagram

    def open_diagram(self, file_path: str | Path) -> Diagram:
        """Open a diagram from a JSON file."""
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Diagram file not found: {path}")

        with open(path, 'r') as f:
            data = json.load(f)

        self._diagram = Diagram.from_json_dict(data)
        self._file_path = path
        self._history.clear()
        self._future.clear()
        self._dirty = False
        self._rebuild_indexes()
        self._notify_change()
        return self._diagram

    def save_diagram(self, file_path: Optional[str | Path] = None) -> Path:
        """
        Save the diagram to a JSON file.

        If file_path is provided, save to that path (Save As).
        Otherwise, save to the current file_path.
        """
        if self._diagram is None:
            raise ValueError("No diagram to save")

        if file_path:
            path = Path(file_path)
        elif self._file_path:
            path = self._file_path
        else:
            raise ValueError("No file path specified and no current file path")

        # Update timestamp
        self._diagram.metadata.updated_at = datetime.utcnow()

        # Ensure parent directory exists
        path.parent.mkdir(parents=True, exist_ok=True)

        # Write JSON
        with open(path, 'w') as f:
            json.dump(self._diagram.to_json_dict(), f, indent=2)

        self._file_path = path
        self._dirty = False

        # Notify save callbacks (for external integrations)
        self._notify_save(path)

        return path

    # --- Undo/Redo ---

    def undo(self) -> Optional[Diagram]:
        """Undo the last action."""
        if not self.can_undo or self._diagram is None:
            return None

        # Save current state to future
        self._future.append(self._diagram.to_json_dict())

        # Restore previous state
        snapshot = self._history.pop()
        self._diagram = self._restore_from_snapshot(snapshot)
        self._dirty = True
        self._rebuild_indexes()
        self._notify_change()
        return self._diagram

    def redo(self) -> Optional[Diagram]:
        """Redo the last undone action."""
        if not self.can_redo or self._diagram is None:
            return None

        # Save current state to history
        self._history.append(self._diagram.to_json_dict())

        # Restore future state
        snapshot = self._future.pop()
        self._diagram = self._restore_from_snapshot(snapshot)
        self._dirty = True
        self._rebuild_indexes()
        self._notify_change()
        return self._diagram

    # --- Node Operations (with O(1) lookups) ---

    def add_node(self, **kwargs) -> Node:
        """Add a new node to the diagram."""
        if self._diagram is None:
            raise ValueError("No diagram open")

        self._save_to_history()

        node = Node(**kwargs)
        self._diagram.nodes.append(node)
        self._index_node(node)
        self._dirty = True
        self._notify_change()
        return node

    def update_node(self, node_id: str, **kwargs) -> Optional[Node]:
        """Update an existing node."""
        if self._diagram is None:
            raise ValueError("No diagram open")

        # O(1) lookup
        node = self._node_index.get(node_id)
        if node is None:
            return None

        self._save_to_history()

        # Track old values for index updates
        old_tags = set(node.tags)
        old_type = node.type

        # Update only provided fields
        for key, value in kwargs.items():
            if value is not None and hasattr(node, key):
                setattr(node, key, value)

        # Update indexes if tags or type changed
        new_tags = set(node.tags)
        if old_tags != new_tags:
            # Remove from old tags
            for tag in old_tags - new_tags:
                if tag in self._tag_index:
                    self._tag_index[tag].discard(node_id)
            # Add to new tags
            for tag in new_tags - old_tags:
                if tag not in self._tag_index:
                    self._tag_index[tag] = set()
                self._tag_index[tag].add(node_id)

        if old_type != node.type:
            if old_type in self._type_index:
                self._type_index[old_type].discard(node_id)
            if node.type not in self._type_index:
                self._type_index[node.type] = set()
            self._type_index[node.type].add(node_id)

        self._dirty = True
        self._notify_change()
        return node

    def delete_node(self, node_id: str) -> bool:
        """Delete a node and all connected edges."""
        if self._diagram is None:
            raise ValueError("No diagram open")

        # O(1) lookup
        node = self._node_index.get(node_id)
        if node is None:
            return False

        self._save_to_history()

        # Remove the node from the list
        self._diagram.nodes = [n for n in self._diagram.nodes if n.id != node_id]
        self._unindex_node(node)

        # Remove all edges connected to this node
        connected_edge_ids = self._edges_by_node.get(node_id, set()).copy()
        for edge_id in connected_edge_ids:
            edge = self._edge_index.get(edge_id)
            if edge:
                self._diagram.edges = [e for e in self._diagram.edges if e.id != edge_id]
                self._unindex_edge(edge)

        self._dirty = True
        self._notify_change()
        return True

    def get_node(self, node_id: str) -> Optional[Node]:
        """Get a node by ID (O(1) lookup)."""
        return self._node_index.get(node_id)

    # --- Edge Operations (with O(1) lookups) ---

    def add_edge(self, source: str = None, target: str = None,
                 from_node: str = None, to_node: str = None,
                 label: str = "",
                 source_side: Optional[str] = None,
                 target_side: Optional[str] = None) -> Edge:
        """
        Add a new edge between two nodes.

        Accepts both new (source/target) and legacy (from_node/to_node) parameter names.
        source_side/target_side specify which side of the node to connect to
        ("top", "right", "bottom", "left") or None for auto-placement.
        """
        if self._diagram is None:
            raise ValueError("No diagram open")

        # Handle both old and new parameter names
        actual_source = source or from_node
        actual_target = target or to_node

        if not actual_source or not actual_target:
            raise ValueError("Both source and target nodes must be specified")

        # Validate nodes exist (O(1) lookup)
        if actual_source not in self._node_index:
            raise ValueError(f"Source node not found: {actual_source}")
        if actual_target not in self._node_index:
            raise ValueError(f"Target node not found: {actual_target}")

        self._save_to_history()

        edge = Edge(
            source=actual_source,
            target=actual_target,
            label=label,
            source_side=source_side,
            target_side=target_side
        )
        self._diagram.edges.append(edge)
        self._index_edge(edge)
        self._dirty = True
        self._notify_change()
        return edge

    def update_edge(self, edge_id: str, **kwargs) -> Optional[Edge]:
        """Update an existing edge."""
        if self._diagram is None:
            raise ValueError("No diagram open")

        # O(1) lookup
        edge = self._edge_index.get(edge_id)
        if edge is None:
            return None

        self._save_to_history()

        for key, value in kwargs.items():
            if value is not None and hasattr(edge, key):
                setattr(edge, key, value)

        self._dirty = True
        self._notify_change()
        return edge

    def delete_edge(self, edge_id: str) -> bool:
        """Delete an edge."""
        if self._diagram is None:
            raise ValueError("No diagram open")

        # O(1) lookup
        edge = self._edge_index.get(edge_id)
        if edge is None:
            return False

        self._save_to_history()
        self._diagram.edges = [e for e in self._diagram.edges if e.id != edge_id]
        self._unindex_edge(edge)
        self._dirty = True
        self._notify_change()
        return True

    def get_edge(self, edge_id: str) -> Optional[Edge]:
        """Get an edge by ID (O(1) lookup)."""
        return self._edge_index.get(edge_id)

    # --- Diagram Info ---

    def update_diagram_info(
        self,
        name: Optional[str] = None,
        grid_size: Optional[int] = None,
        show_grid: Optional[bool] = None
    ) -> Diagram:
        """Update diagram metadata (name, grid settings)."""
        if self._diagram is None:
            raise ValueError("No diagram open")

        self._save_to_history()

        if name is not None:
            self._diagram.name = name
        if grid_size is not None:
            self._diagram.metadata.grid_size = grid_size
        if show_grid is not None:
            self._diagram.metadata.show_grid = show_grid

        self._dirty = True
        self._notify_change()
        return self._diagram

    def get_state(self) -> dict:
        """Get the full current state for API responses."""
        if self._diagram is None:
            return {
                "diagram": None,
                "file_path": None,
                "is_dirty": False,
                "can_undo": False,
                "can_redo": False
            }

        return {
            "diagram": self._diagram.to_json_dict(),
            "file_path": str(self._file_path) if self._file_path else None,
            "is_dirty": self._dirty,
            "can_undo": self.can_undo,
            "can_redo": self.can_redo
        }

    # --- Search (now uses indexes) ---

    def search_nodes(
        self,
        label: Optional[str] = None,
        tag: Optional[str] = None,
        node_type: Optional[str] = None
    ) -> list[Node]:
        """
        Search nodes by label, tag, or type.

        Uses indexes for tag and type lookups when possible.
        """
        if self._diagram is None:
            return []

        # Start with candidates based on most restrictive filter
        if tag and tag in self._tag_index:
            candidate_ids = self._tag_index[tag]
            candidates = [self._node_index[nid] for nid in candidate_ids if nid in self._node_index]
        elif node_type and node_type in self._type_index:
            candidate_ids = self._type_index[node_type]
            candidates = [self._node_index[nid] for nid in candidate_ids if nid in self._node_index]
        else:
            candidates = self._diagram.nodes

        # Filter results
        results = []
        for node in candidates:
            match = True

            if label and label.lower() not in node.label.lower():
                match = False
            if tag and tag not in node.tags:
                match = False
            if node_type and node.type != node_type:
                match = False

            if match:
                results.append(node)

        return results

    def get_nodes_by_tag(self, tag: str) -> list[Node]:
        """Get all nodes with a specific tag (O(1) index lookup)."""
        if tag not in self._tag_index:
            return []
        return [self._node_index[nid] for nid in self._tag_index[tag] if nid in self._node_index]

    def get_nodes_by_type(self, node_type: str) -> list[Node]:
        """Get all nodes of a specific type (O(1) index lookup)."""
        if node_type not in self._type_index:
            return []
        return [self._node_index[nid] for nid in self._type_index[node_type] if nid in self._node_index]

    def get_edges_for_node(self, node_id: str) -> list[Edge]:
        """Get all edges connected to a node (O(1) index lookup)."""
        if node_id not in self._edges_by_node:
            return []
        return [self._edge_index[eid] for eid in self._edges_by_node[node_id] if eid in self._edge_index]

    # --- Bulk Operations ---

    def bulk_update_tags(
        self,
        node_ids: list[str],
        add_tags: Optional[list[str]] = None,
        remove_tags: Optional[list[str]] = None
    ) -> list[Node]:
        """Add or remove tags from multiple nodes at once."""
        if self._diagram is None:
            raise ValueError("No diagram open")

        self._save_to_history()
        updated = []

        for node_id in node_ids:
            node = self._node_index.get(node_id)
            if node is None:
                continue

            if add_tags:
                for tag in add_tags:
                    if tag not in node.tags:
                        node.tags.append(tag)
                        # Update index
                        if tag not in self._tag_index:
                            self._tag_index[tag] = set()
                        self._tag_index[tag].add(node_id)

            if remove_tags:
                for tag in remove_tags:
                    if tag in node.tags:
                        node.tags.remove(tag)
                        # Update index
                        if tag in self._tag_index:
                            self._tag_index[tag].discard(node_id)

            updated.append(node)

        if updated:
            self._dirty = True
            self._notify_change()

        return updated

    # --- Named Snapshots ---

    _snapshots: dict[str, dict] = {}

    def create_snapshot(self, name: str) -> bool:
        """Create a named snapshot of the current diagram."""
        if self._diagram is None:
            raise ValueError("No diagram open")

        DiagramManager._snapshots[name] = {
            "diagram": self._diagram.to_json_dict(),
            "file_path": str(self._file_path) if self._file_path else None,
            "created_at": datetime.utcnow().isoformat()
        }
        return True

    def list_snapshots(self) -> list[dict]:
        """List all named snapshots."""
        return [
            {"name": name, "created_at": data["created_at"]}
            for name, data in DiagramManager._snapshots.items()
        ]

    def restore_snapshot(self, name: str) -> Optional[Diagram]:
        """Restore a named snapshot."""
        if name not in DiagramManager._snapshots:
            return None

        self._save_to_history()

        snapshot_data = DiagramManager._snapshots[name]
        self._diagram = Diagram.from_json_dict(snapshot_data["diagram"])

        if snapshot_data["file_path"]:
            self._file_path = Path(snapshot_data["file_path"])

        self._dirty = True
        self._rebuild_indexes()
        self._notify_change()
        return self._diagram

    def delete_snapshot(self, name: str) -> bool:
        """Delete a named snapshot."""
        if name in DiagramManager._snapshots:
            del DiagramManager._snapshots[name]
            return True
        return False

    # --- Layout Operations (delegated to core.layout) ---

    def auto_layout(self, strategy: str = "grid") -> bool:
        """
        Automatically arrange nodes.

        Strategies:
        - grid: Simple grid layout
        - tree: Tree/hierarchy layout (based on edges)
        - force: Force-directed layout
        """
        if self._diagram is None or not self._diagram.nodes:
            return False

        self._save_to_history()

        if strategy == "grid":
            grid_layout(self._diagram.nodes)
        elif strategy == "tree":
            tree_layout(self._diagram.nodes, self._diagram.edges)
        elif strategy == "force":
            force_layout(self._diagram.nodes, self._diagram.edges)
        else:
            grid_layout(self._diagram.nodes)

        self._dirty = True
        self._notify_change()
        return True

    def align_nodes(self, node_ids: list[str], alignment: str = "left") -> bool:
        """Align nodes along an edge."""
        if self._diagram is None:
            return False

        self._save_to_history()
        success = core_align_nodes(self._diagram.nodes, node_ids, alignment)

        if success:
            self._dirty = True
            self._notify_change()

        return success

    def distribute_nodes(self, node_ids: list[str], axis: str = "horizontal") -> bool:
        """Evenly distribute nodes along an axis."""
        if self._diagram is None:
            return False

        self._save_to_history()
        success = core_distribute_nodes(self._diagram.nodes, node_ids, axis)

        if success:
            self._dirty = True
            self._notify_change()

        return success


# Global instance for the application
diagram_manager = DiagramManager()
