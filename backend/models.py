"""
Pydantic models for diagram schema.

These models define the JSON structure for diagrams, matching the spec:
- Nodes with id, label, type, shape, color, position, tags, description
- Edges with id, from, to, label
- Metadata for timestamps
"""
from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field
import uuid


class NodeShape(str, Enum):
    """Visual shapes for nodes on the canvas."""
    RECTANGLE = "rectangle"
    ELLIPSE = "ellipse"
    DIAMOND = "diamond"
    PILL = "pill"


class BorderStyle(str, Enum):
    """Border styles for nodes."""
    SOLID = "solid"
    DASHED = "dashed"
    DOTTED = "dotted"


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


class Node(BaseModel):
    """A node in the diagram."""
    id: str = Field(default_factory=lambda: f"n{uuid.uuid4().hex[:8]}")
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
    border_style: str = BorderStyle.SOLID.value  # solid, dashed, dotted
    fill_opacity: float = 1.0  # 0.0 = hollow/transparent, 1.0 = solid fill
    z_index: int = 0  # Lower = further back (zones should use negative values)


class Edge(BaseModel):
    """An edge connecting two nodes."""
    id: str = Field(default_factory=lambda: f"e{uuid.uuid4().hex[:8]}")
    from_node: str = Field(alias="from")  # 'from' is reserved in Python
    to_node: str = Field(alias="to")
    label: str = ""

    class Config:
        populate_by_name = True  # Allow both 'from' and 'from_node'


class DiagramMetadata(BaseModel):
    """Metadata about the diagram."""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    grid_size: int = 20  # Snap-to-grid size in pixels (0 = disabled)
    show_grid: bool = False  # Whether to display grid lines


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
        data = self.model_dump()
        # Convert edges to use 'from' and 'to' instead of 'from_node' and 'to_node'
        for edge in data['edges']:
            edge['from'] = edge.pop('from_node')
            edge['to'] = edge.pop('to_node')
        # Convert datetime to ISO format
        data['metadata']['created_at'] = self.metadata.created_at.isoformat()
        data['metadata']['updated_at'] = self.metadata.updated_at.isoformat()
        return data


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


class CreateEdgeRequest(BaseModel):
    """Request to create a new edge."""
    from_node: str = Field(alias="from")
    to_node: str = Field(alias="to")
    label: str = ""

    class Config:
        populate_by_name = True


class UpdateEdgeRequest(BaseModel):
    """Request to update an existing edge."""
    label: Optional[str] = None


class DiagramInfoRequest(BaseModel):
    """Request to update diagram metadata."""
    name: Optional[str] = None
