"""
Core data models for diagrams.

These models define the canonical schema for diagrams:
- Nodes with visual and semantic properties
- Edges connecting nodes (using source/target naming convention)
- Metadata for timestamps and grid settings

Field Naming Convention:
- Edges use `source` and `target` (industry standard from D3, Cytoscape, etc.)
- JSON serialization outputs `source`/`target` for consistency
- For backward compatibility, `from`/`to` are accepted on input and converted
"""

from datetime import datetime
from enum import Enum
from typing import Optional, Any
from pydantic import BaseModel, Field, field_validator, model_validator
import uuid


class NodeShape(str, Enum):
    """Visual shapes for nodes on the canvas."""
    RECTANGLE = "rectangle"
    ELLIPSE = "ellipse"
    DIAMOND = "diamond"
    PILL = "pill"
    ARROW = "arrow"
    TRIANGLE = "triangle"


class BorderStyle(str, Enum):
    """Border styles for nodes."""
    SOLID = "solid"
    DASHED = "dashed"
    DOTTED = "dotted"


class EdgeStyle(str, Enum):
    """Line styles for edges."""
    SOLID = "solid"
    DASHED = "dashed"
    DOTTED = "dotted"


class ArrowType(str, Enum):
    """Arrow types for edge endpoints."""
    NONE = "none"
    ARROW = "arrow"       # Open V shape
    FILLED = "filled"     # Filled triangle
    DIAMOND = "diamond"   # Diamond shape
    CIRCLE = "circle"     # Circle shape


class NodeType(str, Enum):
    """Logical types for nodes (semantic meaning)."""
    COMPONENT = "component"
    SERVICE = "service"
    DATABASE = "database"
    USER = "user"
    EXTERNAL = "external"
    PROCESS = "process"
    DECISION = "decision"
    NOTE = "note"
    ZONE = "zone"  # Container/grouping area


def generate_node_id() -> str:
    """Generate a unique node ID."""
    return f"n{uuid.uuid4().hex[:8]}"


def generate_edge_id() -> str:
    """Generate a unique edge ID."""
    return f"e{uuid.uuid4().hex[:8]}"


class Node(BaseModel):
    """A node in the diagram."""
    id: str = Field(default_factory=generate_node_id)
    label: str = "New Node"
    type: str = NodeType.COMPONENT.value
    shape: str = NodeShape.RECTANGLE.value
    color: str = "#3478f6"
    x: float = 100
    y: float = 100
    width: float = 150
    height: float = 80
    tags: list[str] = Field(default_factory=list)
    description: str = ""
    # Zone/container support
    border_style: str = BorderStyle.SOLID.value
    fill_opacity: float = 1.0  # 0.0 = hollow/transparent, 1.0 = solid fill
    z_index: int = 0  # Lower = further back (zones should use negative values)
    # Rotation in degrees (0-360)
    rotation: float = 0.0

    def center(self) -> tuple[float, float]:
        """Get the center point of the node."""
        return (self.x + self.width / 2, self.y + self.height / 2)

    def bounds(self) -> tuple[float, float, float, float]:
        """Get the bounding box (x, y, right, bottom)."""
        return (self.x, self.y, self.x + self.width, self.y + self.height)


class Edge(BaseModel):
    """
    An edge connecting two nodes.

    Uses `source` and `target` as canonical field names.
    Accepts `from`/`to` on input for backward compatibility.
    """
    id: str = Field(default_factory=generate_edge_id)
    source: str  # Source node ID
    target: str  # Target node ID
    label: str = ""
    # Connection sides (which side of each node the edge connects to)
    source_side: Optional[str] = None  # "top", "right", "bottom", "left", or None for auto
    target_side: Optional[str] = None  # "top", "right", "bottom", "left", or None for auto
    # Edge styling
    color: str = "#666666"           # Line color
    width: float = 2.0               # Line width in pixels
    style: str = EdgeStyle.SOLID.value  # Line style (solid/dashed/dotted)
    arrow_start: str = ArrowType.NONE.value   # Arrow at source end
    arrow_end: str = ArrowType.FILLED.value   # Arrow at target end
    arrow_size: float = 12.0         # Arrow head size in pixels

    @model_validator(mode='before')
    @classmethod
    def convert_legacy_fields(cls, data: Any) -> Any:
        """Convert legacy 'from'/'to' fields to 'source'/'target'."""
        if isinstance(data, dict):
            # Handle 'from' -> 'source' (from is a Python keyword)
            if 'from' in data and 'source' not in data:
                data['source'] = data.pop('from')
            if 'from_node' in data and 'source' not in data:
                data['source'] = data.pop('from_node')
            # Handle 'to' -> 'target'
            if 'to' in data and 'target' not in data:
                data['target'] = data.pop('to')
            if 'to_node' in data and 'target' not in data:
                data['target'] = data.pop('to_node')
        return data

    def to_json_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        result = {
            "id": self.id,
            "source": self.source,
            "target": self.target,
            "label": self.label,
            "color": self.color,
            "width": self.width,
            "style": self.style,
            "arrow_start": self.arrow_start,
            "arrow_end": self.arrow_end,
            "arrow_size": self.arrow_size,
        }
        # Only include sides if they're set
        if self.source_side:
            result["source_side"] = self.source_side
        if self.target_side:
            result["target_side"] = self.target_side
        return result


class DiagramMetadata(BaseModel):
    """Metadata about the diagram."""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    grid_size: int = 20  # Snap-to-grid size in pixels (0 = disabled)
    show_grid: bool = True  # Whether to display grid lines


class Diagram(BaseModel):
    """
    The complete diagram structure.
    This is what gets saved to/loaded from JSON files.
    """
    id: str = Field(default_factory=lambda: f"diagram-{uuid.uuid4().hex[:8]}")
    name: str = "Untitled Diagram"
    nodes: list[Node] = Field(default_factory=list)
    edges: list[Edge] = Field(default_factory=list)
    metadata: DiagramMetadata = Field(default_factory=DiagramMetadata)

    def to_json_dict(self) -> dict:
        """Convert to JSON-serializable dict with proper field names."""
        return {
            "id": self.id,
            "name": self.name,
            "nodes": [n.model_dump() for n in self.nodes],
            "edges": [e.to_json_dict() for e in self.edges],
            "metadata": {
                "created_at": self.metadata.created_at.isoformat(),
                "updated_at": self.metadata.updated_at.isoformat(),
                "grid_size": self.metadata.grid_size,
                "show_grid": self.metadata.show_grid,
            }
        }

    @classmethod
    def from_json_dict(cls, data: dict) -> "Diagram":
        """Create a Diagram from a JSON dict (handles legacy formats)."""
        # Parse edges (handles both old from/to and new source/target)
        edges = [Edge(**e) for e in data.get('edges', [])]

        # Parse nodes
        nodes = [Node(**n) for n in data.get('nodes', [])]

        # Parse metadata
        meta_data = data.get('metadata', {})
        metadata = DiagramMetadata(
            created_at=datetime.fromisoformat(meta_data['created_at']) if 'created_at' in meta_data else datetime.utcnow(),
            updated_at=datetime.fromisoformat(meta_data['updated_at']) if 'updated_at' in meta_data else datetime.utcnow(),
            grid_size=meta_data.get('grid_size', 20),
            show_grid=meta_data.get('show_grid', False)
        )

        return cls(
            id=data.get('id', f"diagram-{uuid.uuid4().hex[:8]}"),
            name=data.get('name', 'Untitled Diagram'),
            nodes=nodes,
            edges=edges,
            metadata=metadata
        )

    def get_node(self, node_id: str) -> Optional[Node]:
        """Get a node by ID (O(n) - use DiagramManager for indexed access)."""
        for node in self.nodes:
            if node.id == node_id:
                return node
        return None

    def get_edge(self, edge_id: str) -> Optional[Edge]:
        """Get an edge by ID (O(n) - use DiagramManager for indexed access)."""
        for edge in self.edges:
            if edge.id == edge_id:
                return edge
        return None


# --- API Request/Response Models ---

class CreateNodeRequest(BaseModel):
    """Request to create a new node."""
    label: str = "New Node"
    type: str = NodeType.COMPONENT.value
    shape: str = NodeShape.RECTANGLE.value
    color: str = "#3478f6"
    x: float = 100
    y: float = 100
    width: float = 150
    height: float = 80
    tags: list[str] = Field(default_factory=list)
    description: str = ""
    border_style: str = BorderStyle.SOLID.value
    fill_opacity: float = 1.0
    z_index: int = 0


class UpdateNodeRequest(BaseModel):
    """Request to update an existing node (partial update)."""
    label: Optional[str] = None
    type: Optional[str] = None
    shape: Optional[str] = None
    color: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    tags: Optional[list[str]] = None
    description: Optional[str] = None
    border_style: Optional[str] = None
    fill_opacity: Optional[float] = None
    z_index: Optional[int] = None
    rotation: Optional[float] = None


class CreateEdgeRequest(BaseModel):
    """Request to create a new edge."""
    source: str = ""
    target: str = ""
    label: str = ""
    source_side: Optional[str] = None  # "top", "right", "bottom", "left"
    target_side: Optional[str] = None  # "top", "right", "bottom", "left"

    @model_validator(mode='before')
    @classmethod
    def convert_legacy_fields(cls, data: Any) -> Any:
        """Convert legacy 'from'/'to' fields to 'source'/'target'."""
        if isinstance(data, dict):
            if 'from' in data and 'source' not in data:
                data['source'] = data.pop('from')
            if 'from_node' in data and 'source' not in data:
                data['source'] = data.pop('from_node')
            if 'to' in data and 'target' not in data:
                data['target'] = data.pop('to')
            if 'to_node' in data and 'target' not in data:
                data['target'] = data.pop('to_node')
        return data


class UpdateEdgeRequest(BaseModel):
    """Request to update an existing edge."""
    label: Optional[str] = None
    color: Optional[str] = None
    width: Optional[float] = None
    style: Optional[str] = None
    arrow_start: Optional[str] = None
    arrow_end: Optional[str] = None
    arrow_size: Optional[float] = None
    source_side: Optional[str] = None  # "top", "right", "bottom", "left"
    target_side: Optional[str] = None  # "top", "right", "bottom", "left"


class DiagramInfoRequest(BaseModel):
    """Request to update diagram metadata."""
    name: Optional[str] = None
    grid_size: Optional[int] = None
    show_grid: Optional[bool] = None
