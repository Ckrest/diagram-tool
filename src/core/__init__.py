"""
Diagram Tool Core - Shared models, validation, analysis, and layout algorithms.

This module provides the core functionality used by both the backend API
and the MCP tools, ensuring a single source of truth for all diagram logic.
"""

from .models import (
    # Enums
    NodeShape,
    NodeType,
    BorderStyle,
    # Core models
    Node,
    Edge,
    DiagramMetadata,
    Diagram,
    # Request models (for API)
    CreateNodeRequest,
    UpdateNodeRequest,
    CreateEdgeRequest,
    UpdateEdgeRequest,
    DiagramInfoRequest,
)

from .validation import validate_diagram, ValidationIssue, IssueSeverity
from .analysis import summarize_diagram, find_connected_components
from .layout import grid_layout, tree_layout, force_layout, align_nodes, distribute_nodes

__all__ = [
    # Enums
    "NodeShape",
    "NodeType",
    "BorderStyle",
    # Models
    "Node",
    "Edge",
    "DiagramMetadata",
    "Diagram",
    # Request models
    "CreateNodeRequest",
    "UpdateNodeRequest",
    "CreateEdgeRequest",
    "UpdateEdgeRequest",
    "DiagramInfoRequest",
    # Validation
    "validate_diagram",
    "ValidationIssue",
    "IssueSeverity",
    # Analysis
    "summarize_diagram",
    "find_connected_components",
    # Layout
    "grid_layout",
    "tree_layout",
    "force_layout",
    "align_nodes",
    "distribute_nodes",
]
