"""
Diagram validation - Check diagrams for structural issues.

Provides validation that can be used by both the backend and MCP tools
to ensure diagram integrity.
"""

from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .models import Diagram


class IssueSeverity(str, Enum):
    """Severity levels for validation issues."""
    ERROR = "error"      # Invalid state, must be fixed
    WARNING = "warning"  # Potential problem, should review
    INFO = "info"        # Informational, may be intentional


@dataclass
class ValidationIssue:
    """A single validation issue found in a diagram."""
    severity: IssueSeverity
    message: str
    node_id: str | None = None
    edge_id: str | None = None

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        result = {
            "type": self.severity.value,
            "message": self.message
        }
        if self.node_id:
            result["node_id"] = self.node_id
        if self.edge_id:
            result["edge_id"] = self.edge_id
        return result


def validate_diagram(diagram: "Diagram") -> list[ValidationIssue]:
    """
    Validate a diagram and return a list of issues.

    Checks for:
    - Orphan nodes (no connections) - WARNING
    - Missing labels - WARNING
    - Duplicate edges (same source->target) - WARNING
    - Invalid edge references (source/target doesn't exist) - ERROR
    - Self-referencing edges - WARNING
    - Empty diagram - INFO

    Args:
        diagram: The diagram to validate

    Returns:
        List of ValidationIssue objects
    """
    issues: list[ValidationIssue] = []

    nodes = diagram.nodes
    edges = diagram.edges

    # Quick lookup sets
    node_ids = {n.id for n in nodes}

    # Check for empty diagram
    if not nodes:
        issues.append(ValidationIssue(
            severity=IssueSeverity.INFO,
            message="Diagram has no nodes"
        ))
        return issues

    # Find connected nodes
    connected_nodes: set[str] = set()
    for edge in edges:
        connected_nodes.add(edge.source)
        connected_nodes.add(edge.target)

    # Check for orphan nodes (no connections)
    orphans = node_ids - connected_nodes
    if orphans:
        # Get labels for better messages
        orphan_labels = []
        for node in nodes:
            if node.id in orphans:
                orphan_labels.append(f"{node.label} ({node.id})")

        issues.append(ValidationIssue(
            severity=IssueSeverity.WARNING,
            message=f"Orphan nodes (no connections): {', '.join(orphan_labels)}"
        ))

    # Check for missing labels
    for node in nodes:
        if not node.label or node.label.strip() == "" or node.label == "New Node":
            issues.append(ValidationIssue(
                severity=IssueSeverity.WARNING,
                message=f"Node has default or empty label",
                node_id=node.id
            ))

    # Check for invalid edge references
    for edge in edges:
        if edge.source not in node_ids:
            issues.append(ValidationIssue(
                severity=IssueSeverity.ERROR,
                message=f"Edge references non-existent source node: {edge.source}",
                edge_id=edge.id
            ))
        if edge.target not in node_ids:
            issues.append(ValidationIssue(
                severity=IssueSeverity.ERROR,
                message=f"Edge references non-existent target node: {edge.target}",
                edge_id=edge.id
            ))

    # Check for self-referencing edges
    for edge in edges:
        if edge.source == edge.target:
            issues.append(ValidationIssue(
                severity=IssueSeverity.WARNING,
                message=f"Self-referencing edge (node points to itself)",
                edge_id=edge.id,
                node_id=edge.source
            ))

    # Check for duplicate edges (same source->target)
    seen_pairs: set[tuple[str, str]] = set()
    for edge in edges:
        pair = (edge.source, edge.target)
        if pair in seen_pairs:
            issues.append(ValidationIssue(
                severity=IssueSeverity.WARNING,
                message=f"Duplicate edge from {edge.source} to {edge.target}",
                edge_id=edge.id
            ))
        else:
            seen_pairs.add(pair)

    return issues


def validation_summary(issues: list[ValidationIssue]) -> dict:
    """
    Create a summary of validation issues.

    Args:
        issues: List of validation issues

    Returns:
        Dictionary with counts by severity
    """
    return {
        "total": len(issues),
        "errors": len([i for i in issues if i.severity == IssueSeverity.ERROR]),
        "warnings": len([i for i in issues if i.severity == IssueSeverity.WARNING]),
        "info": len([i for i in issues if i.severity == IssueSeverity.INFO]),
        "valid": len([i for i in issues if i.severity == IssueSeverity.ERROR]) == 0
    }
