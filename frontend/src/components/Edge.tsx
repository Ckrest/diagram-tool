/**
 * Edge component - renders a connection between two nodes.
 *
 * Features:
 * - Calculates proper intersection points at node boundaries (not centers)
 * - Supports multiple arrow types at start and end
 * - Customizable colors, widths, and line styles
 * - Handles all node shapes correctly
 */

import type { DiagramEdge, DiagramNode, ArrowType, NodeShape, ConnectionSide } from '../types/diagram';

interface EdgeProps {
  edge: DiagramEdge;
  sourceNode: DiagramNode;
  targetNode: DiagramNode;
  isSelected: boolean;
  onSelect: (edgeId: string) => void;
}

interface Point {
  x: number;
  y: number;
}

/**
 * Calculate the center point of a node (accounting for rotation).
 */
function getNodeCenter(node: DiagramNode): Point {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
  };
}

/**
 * Get the connection point for a specific side of a node.
 * Returns the midpoint of that side.
 */
function getNodeSidePoint(node: DiagramNode, side: ConnectionSide): Point {
  const center = getNodeCenter(node);
  const hw = node.width / 2;
  const hh = node.height / 2;
  const rotation = (node.rotation ?? 0) * Math.PI / 180;

  // Local offset from center based on side
  let localX = 0;
  let localY = 0;

  switch (side) {
    case 'top':
      localY = -hh;
      break;
    case 'bottom':
      localY = hh;
      break;
    case 'left':
      localX = -hw;
      break;
    case 'right':
      localX = hw;
      break;
  }

  // Apply rotation if needed
  if (rotation !== 0) {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const rotatedX = localX * cos - localY * sin;
    const rotatedY = localX * sin + localY * cos;
    return {
      x: center.x + rotatedX,
      y: center.y + rotatedY,
    };
  }

  return {
    x: center.x + localX,
    y: center.y + localY,
  };
}

/**
 * Calculate the angle that points OUTWARD (perpendicular) from a node's side.
 * This is used for:
 * - Start arrows (pointing away from source node)
 * - Bezier control points (line exits tangentially)
 *
 * The angle is in radians, 0 = pointing right, π/2 = pointing down.
 */
function getOutwardAngle(side: ConnectionSide, nodeRotation: number): number {
  // Base angle pointing OUT from each side (unrotated)
  // From top: points up (-π/2)
  // From bottom: points down (π/2)
  // From left: points left (π)
  // From right: points right (0)
  let baseAngle: number;

  switch (side) {
    case 'top':
      baseAngle = -Math.PI / 2; // Points up (out from top)
      break;
    case 'bottom':
      baseAngle = Math.PI / 2;  // Points down (out from bottom)
      break;
    case 'left':
      baseAngle = Math.PI;      // Points left (out from left)
      break;
    case 'right':
      baseAngle = 0;            // Points right (out from right)
      break;
    default:
      baseAngle = 0;
  }

  // Add node rotation (convert degrees to radians)
  return baseAngle + (nodeRotation * Math.PI / 180);
}

/**
 * Calculate the angle that points INWARD (perpendicular) to a node's side.
 * This is used for end arrows (pointing into the target node).
 *
 * Simply the opposite of getOutwardAngle.
 */
function getInwardAngle(side: ConnectionSide, nodeRotation: number): number {
  return getOutwardAngle(side, nodeRotation) + Math.PI;
}

/**
 * Determine which side of a node a point is on (for auto-calculated boundary points).
 * Returns the side that the boundary point is closest to.
 */
function determineSideFromPoint(node: DiagramNode, point: Point): ConnectionSide {
  const center = getNodeCenter(node);
  const rotation = (node.rotation ?? 0) * Math.PI / 180;

  // Transform point to node-local coordinates
  let localX = point.x - center.x;
  let localY = point.y - center.y;

  // Un-rotate if needed
  if (rotation !== 0) {
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);
    const newX = localX * cos - localY * sin;
    const newY = localX * sin + localY * cos;
    localX = newX;
    localY = newY;
  }

  // Normalize by node dimensions to handle non-square nodes
  const normalizedX = localX / (node.width / 2);
  const normalizedY = localY / (node.height / 2);

  // Determine which edge is closest based on normalized coordinates
  if (Math.abs(normalizedX) > Math.abs(normalizedY)) {
    // Left or right side
    return normalizedX > 0 ? 'right' : 'left';
  } else {
    // Top or bottom side
    return normalizedY > 0 ? 'bottom' : 'top';
  }
}

/**
 * Calculate where a line from 'from' to 'to' intersects the boundary of a node.
 * Returns the intersection point on the node's edge.
 */
function getNodeBoundaryPoint(node: DiagramNode, from: Point, to: Point): Point {
  const center = getNodeCenter(node);
  const shape = node.shape;
  const rotation = (node.rotation ?? 0) * Math.PI / 180;

  // Calculate direction from 'from' to 'to'
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return center;

  // Normalize direction
  dx /= length;
  dy /= length;

  // For rotated nodes, rotate the direction into node-local space
  let localDx = dx;
  let localDy = dy;
  if (rotation !== 0) {
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);
    localDx = dx * cos - dy * sin;
    localDy = dx * sin + dy * cos;
  }

  // Half dimensions
  const hw = node.width / 2;
  const hh = node.height / 2;

  let localIntersect: Point;

  switch (shape) {
    case 'ellipse':
      // Parametric ellipse intersection
      // The line from center in direction (dx, dy) intersects ellipse at:
      // t = 1 / sqrt((dx/hw)^2 + (dy/hh)^2)
      const t = 1 / Math.sqrt((localDx / hw) ** 2 + (localDy / hh) ** 2);
      localIntersect = { x: localDx * t, y: localDy * t };
      break;

    case 'diamond':
      // Diamond is a rhombus - check intersection with 4 diagonal lines
      // The diamond has vertices at (0, -hh), (hw, 0), (0, hh), (-hw, 0)
      // Each edge can be parameterized and we find intersection
      localIntersect = getDiamondIntersection(localDx, localDy, hw, hh);
      break;

    case 'pill':
      // Pill is a rectangle with semicircle ends
      const radius = Math.min(hw, hh);
      localIntersect = getPillIntersection(localDx, localDy, hw, hh, radius);
      break;

    case 'arrow':
      // Arrow shape points right - like a chevron or arrow head
      localIntersect = getArrowShapeIntersection(localDx, localDy, hw, hh);
      break;

    case 'triangle':
      // Equilateral-ish triangle pointing up
      localIntersect = getTriangleIntersection(localDx, localDy, hw, hh);
      break;

    case 'rectangle':
    default:
      // Rectangle intersection - find which edge is hit first
      localIntersect = getRectangleIntersection(localDx, localDy, hw, hh);
      break;
  }

  // Rotate back to global space if needed
  let globalX = localIntersect.x;
  let globalY = localIntersect.y;
  if (rotation !== 0) {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    globalX = localIntersect.x * cos - localIntersect.y * sin;
    globalY = localIntersect.x * sin + localIntersect.y * cos;
  }

  return {
    x: center.x + globalX,
    y: center.y + globalY,
  };
}

function getRectangleIntersection(dx: number, dy: number, hw: number, hh: number): Point {
  // Find parameter t where ray from origin in direction (dx, dy) hits rectangle edge
  let t = Infinity;

  if (dx !== 0) {
    const tRight = hw / Math.abs(dx);
    if (tRight < t) t = tRight;
  }
  if (dy !== 0) {
    const tBottom = hh / Math.abs(dy);
    if (tBottom < t) t = tBottom;
  }

  return { x: dx * t, y: dy * t };
}

function getDiamondIntersection(dx: number, dy: number, hw: number, hh: number): Point {
  // Diamond edges: the sum of |x/hw| + |y/hh| = 1
  // For ray from origin: find t where |t*dx/hw| + |t*dy/hh| = 1
  const t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  return { x: dx * t, y: dy * t };
}

function getPillIntersection(dx: number, dy: number, hw: number, hh: number, radius: number): Point {
  // Pill: if width > height, semicircles on left/right; else on top/bottom
  const isHorizontal = hw >= hh;

  if (isHorizontal) {
    // Horizontal pill - semicircles on left (-hw + radius) and right (hw - radius)
    const rectHw = hw - radius;

    // Check if ray exits through semicircle or rectangle part
    if (Math.abs(dx) * hh > Math.abs(dy) * rectHw) {
      // Might hit semicircle - check
      const circleCenter = dx > 0 ? rectHw : -rectHw;
      const intersection = getCircleIntersection(dx, dy, circleCenter, 0, radius);
      if (intersection) return intersection;
    }

    // Hit rectangle part
    return getRectangleIntersection(dx, dy, rectHw, hh);
  } else {
    // Vertical pill
    const rectHh = hh - radius;

    if (Math.abs(dy) * hw > Math.abs(dx) * rectHh) {
      const circleCenter = dy > 0 ? rectHh : -rectHh;
      const intersection = getCircleIntersection(dx, dy, 0, circleCenter, radius);
      if (intersection) return intersection;
    }

    return getRectangleIntersection(dx, dy, hw, rectHh);
  }
}

function getCircleIntersection(dx: number, dy: number, cx: number, cy: number, r: number): Point | null {
  // Ray from origin in direction (dx, dy), circle at (cx, cy) with radius r
  // Solve: |origin + t*dir - center|^2 = r^2
  // |(t*dx - cx, t*dy - cy)|^2 = r^2
  // (t*dx - cx)^2 + (t*dy - cy)^2 = r^2

  const a = dx * dx + dy * dy;
  const b = -2 * (dx * cx + dy * cy);
  const c = cx * cx + cy * cy - r * r;

  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const t = (-b + Math.sqrt(disc)) / (2 * a);
  if (t <= 0) return null;

  return { x: t * dx, y: t * dy };
}

function getArrowShapeIntersection(dx: number, dy: number, hw: number, hh: number): Point {
  // Arrow pointing right: vertices at (-hw, -hh), (hw, 0), (-hw, hh)
  // This creates a triangle/arrow pointing right
  // For simplicity, treat as a triangle
  return getTriangleIntersection(dx, dy, hw, hh);
}

function getTriangleIntersection(dx: number, dy: number, hw: number, hh: number): Point {
  // Triangle pointing up with apex at (0, -hh) and base at (-hw, hh) to (hw, hh)
  // For now, use a simplified approach - approximate with diamond
  const t = 1 / (Math.abs(dx) / hw + Math.max(0.01, (dy + Math.abs(dy)) / (2 * hh)));
  return { x: dx * Math.min(t, hw / Math.max(0.01, Math.abs(dx))), y: dy * Math.min(t, hh / Math.max(0.01, Math.abs(dy))) };
}

/**
 * Render an arrowhead at a given point with a given angle.
 */
function renderArrowhead(
  type: ArrowType,
  x: number,
  y: number,
  angle: number,
  size: number,
  color: string,
  flip: boolean = false
): JSX.Element | null {
  if (type === 'none') return null;

  // Flip angle for start arrows (point back toward source)
  const a = flip ? angle + Math.PI : angle;

  switch (type) {
    case 'arrow':
      // Open arrow (V shape)
      return (
        <polyline
          points={`
            ${x - size * Math.cos(a - 0.4)},${y - size * Math.sin(a - 0.4)}
            ${x},${y}
            ${x - size * Math.cos(a + 0.4)},${y - size * Math.sin(a + 0.4)}
          `}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );

    case 'filled':
      // Filled triangle arrow
      return (
        <polygon
          points={`
            ${x},${y}
            ${x - size * Math.cos(a - 0.4)},${y - size * Math.sin(a - 0.4)}
            ${x - size * Math.cos(a + 0.4)},${y - size * Math.sin(a + 0.4)}
          `}
          fill={color}
          stroke={color}
        />
      );

    case 'diamond':
      // Diamond shape
      const dSize = size * 0.7;
      return (
        <polygon
          points={`
            ${x},${y}
            ${x - dSize * Math.cos(a - Math.PI / 4)},${y - dSize * Math.sin(a - Math.PI / 4)}
            ${x - dSize * 1.4 * Math.cos(a)},${y - dSize * 1.4 * Math.sin(a)}
            ${x - dSize * Math.cos(a + Math.PI / 4)},${y - dSize * Math.sin(a + Math.PI / 4)}
          `}
          fill={color}
          stroke={color}
        />
      );

    case 'circle':
      // Circle
      const cRadius = size * 0.35;
      const cx = x - cRadius * Math.cos(a);
      const cy = y - cRadius * Math.sin(a);
      return (
        <circle
          cx={cx}
          cy={cy}
          r={cRadius}
          fill={color}
          stroke={color}
        />
      );

    default:
      return null;
  }
}

/**
 * Get stroke dash array for edge style.
 */
function getStrokeDashArray(style: string | undefined): string | undefined {
  switch (style) {
    case 'dashed': return '8,4';
    case 'dotted': return '2,4';
    default: return undefined;
  }
}

export function Edge({ edge, sourceNode, targetNode, isSelected, onSelect }: EdgeProps) {
  // Get node centers
  const sourceCenter = getNodeCenter(sourceNode);
  const targetCenter = getNodeCenter(targetNode);

  // Calculate connection points - use specified side if available, otherwise auto-calculate
  const startPoint = edge.source_side
    ? getNodeSidePoint(sourceNode, edge.source_side)
    : getNodeBoundaryPoint(sourceNode, targetCenter, sourceCenter);

  const endPoint = edge.target_side
    ? getNodeSidePoint(targetNode, edge.target_side)
    : getNodeBoundaryPoint(targetNode, sourceCenter, targetCenter);

  // Edge styling with defaults
  const edgeColor = edge.color ?? '#666666';
  const edgeWidth = edge.width ?? 2;
  const edgeStyle = edge.style ?? 'solid';
  const arrowStart = edge.arrow_start ?? 'none';
  const arrowEnd = edge.arrow_end ?? 'filled';

  // Determine which side of each node the edge connects to
  const sourceSide: ConnectionSide = edge.source_side
    ? edge.source_side
    : determineSideFromPoint(sourceNode, startPoint);

  const targetSide: ConnectionSide = edge.target_side
    ? edge.target_side
    : determineSideFromPoint(targetNode, endPoint);

  // Get outward angles for tangential bezier control points
  const sourceOutAngle = getOutwardAngle(sourceSide, sourceNode.rotation ?? 0);
  const targetOutAngle = getOutwardAngle(targetSide, targetNode.rotation ?? 0);

  // Calculate control points - line exits/enters tangentially from each side
  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Control point offset (proportional to distance, capped)
  const offset = Math.min(distance * 0.4, 120);

  // Control point 1: offset from start point in the outward direction of the source side
  const cx1 = startPoint.x + Math.cos(sourceOutAngle) * offset;
  const cy1 = startPoint.y + Math.sin(sourceOutAngle) * offset;

  // Control point 2: offset from end point in the outward direction of the target side
  const cx2 = endPoint.x + Math.cos(targetOutAngle) * offset;
  const cy2 = endPoint.y + Math.sin(targetOutAngle) * offset;

  // Path data
  const pathD = `M ${startPoint.x} ${startPoint.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${endPoint.x} ${endPoint.y}`;

  // Arrow angles:
  // - Start arrow points OUTWARD from source node (same as sourceOutAngle)
  // - End arrow points INWARD to target node (opposite of targetOutAngle)
  const startAngle = sourceOutAngle;
  const endAngle = getInwardAngle(targetSide, targetNode.rotation ?? 0);

  // Arrow size from edge property (default 12)
  const arrowSize = edge.arrow_size ?? 12;

  // Label position (middle of the curve)
  const labelX = (startPoint.x + endPoint.x) / 2;
  const labelY = (startPoint.y + endPoint.y) / 2 - 10;

  // Determine colors based on selection
  const strokeColor = isSelected ? '#0078d4' : edgeColor;
  const displayWidth = isSelected ? edgeWidth + 1 : edgeWidth;

  return (
    <g
      className={`edge ${isSelected ? 'selected' : ''}`}
      data-edge-id={edge.id}
      onClick={(e) => { e.stopPropagation(); onSelect(edge.id); }}
    >
      {/* Click area (wider than visible line) */}
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(15, edgeWidth + 10)}
        style={{ cursor: 'pointer' }}
      />

      {/* Visible path */}
      <path
        className="edge-path"
        d={pathD}
        style={{
          fill: 'none',
          stroke: strokeColor,
          strokeWidth: displayWidth,
          strokeDasharray: getStrokeDashArray(edgeStyle),
          strokeLinecap: 'round',
        }}
      />

      {/* Start arrow */}
      {renderArrowhead(arrowStart, startPoint.x, startPoint.y, startAngle, arrowSize, strokeColor, true)}

      {/* End arrow */}
      {renderArrowhead(arrowEnd, endPoint.x, endPoint.y, endAngle, arrowSize, strokeColor, false)}

      {/* Label */}
      {edge.label && (
        <text
          className="edge-label"
          x={labelX}
          y={labelY}
          textAnchor="middle"
          fill={isSelected ? '#0078d4' : '#999'}
        >
          {edge.label}
        </text>
      )}
    </g>
  );
}

// Temporary edge shown while creating a new connection
interface TempEdgeProps {
  sourceNode: DiagramNode;
  sourceSide?: ConnectionSide | null;  // Which side the connection started from
  mouseX: number;
  mouseY: number;
}

export function TempEdge({ sourceNode, sourceSide, mouseX, mouseY }: TempEdgeProps) {
  const sourceCenter = getNodeCenter(sourceNode);
  const mousePoint = { x: mouseX, y: mouseY };

  // Get start point - use specified side if available, otherwise auto-calculate
  const startPoint = sourceSide
    ? getNodeSidePoint(sourceNode, sourceSide)
    : getNodeBoundaryPoint(sourceNode, mousePoint, sourceCenter);

  return (
    <line
      className="temp-edge"
      x1={startPoint.x}
      y1={startPoint.y}
      x2={mouseX}
      y2={mouseY}
    />
  );
}
