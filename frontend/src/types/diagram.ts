/**
 * TypeScript types for the diagram tool.
 * These match the backend JSON schema exactly.
 */

export type NodeShape = 'rectangle' | 'ellipse' | 'diamond' | 'pill' | 'arrow' | 'triangle';

export type BorderStyle = 'solid' | 'dashed' | 'dotted';

export type EdgeStyle = 'solid' | 'dashed' | 'dotted';

export type ArrowType = 'none' | 'arrow' | 'filled' | 'diamond' | 'circle';

export type NodeType =
  | 'component'
  | 'service'
  | 'database'
  | 'user'
  | 'external'
  | 'process'
  | 'decision'
  | 'note'
  | 'zone';

export interface DiagramNode {
  id: string;
  label: string;
  type: NodeType;
  shape: NodeShape;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tags: string[];
  description: string;
  // Zone/container support
  border_style: BorderStyle;
  fill_opacity: number;  // 0.0 = hollow/transparent, 1.0 = solid
  z_index: number;  // Lower = further back
  // Rotation in degrees (0-360)
  rotation?: number;
}

export interface DiagramEdge {
  id: string;
  source: string;  // Source node ID (renamed from 'from')
  target: string;  // Target node ID (renamed from 'to')
  label: string;
  // Connection sides (which side of each node the edge connects to)
  source_side?: ConnectionSide;  // Which side of source node (default: auto-calculated)
  target_side?: ConnectionSide;  // Which side of target node (default: auto-calculated)
  // Edge styling
  color?: string;        // Edge color (default: #666)
  width?: number;        // Line width in pixels (default: 2)
  style?: EdgeStyle;     // Line style (default: solid)
  arrow_start?: ArrowType;  // Arrow at source end (default: none)
  arrow_end?: ArrowType;    // Arrow at target end (default: filled)
  arrow_size?: number;      // Arrow head size in pixels (default: 12)
}

export interface DiagramMetadata {
  created_at: string;
  updated_at: string;
  grid_size: number;  // Snap-to-grid size in pixels (0 = disabled)
  show_grid: boolean;  // Whether to display grid lines
}

export interface Diagram {
  id: string;
  name: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  metadata: DiagramMetadata;
}

export interface DiagramState {
  diagram: Diagram | null;
  file_path: string | null;
  is_dirty: boolean;
  can_undo: boolean;
  can_redo: boolean;
}

// API Request types
export interface CreateNodeRequest {
  label?: string;
  type?: NodeType;
  shape?: NodeShape;
  color?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  tags?: string[];
  description?: string;
  border_style?: BorderStyle;
  fill_opacity?: number;
  z_index?: number;
}

export interface UpdateNodeRequest {
  label?: string;
  type?: NodeType;
  shape?: NodeShape;
  color?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  tags?: string[];
  description?: string;
  border_style?: BorderStyle;
  fill_opacity?: number;
  z_index?: number;
  rotation?: number;
}

export interface CreateEdgeRequest {
  source: string;  // Source node ID
  target: string;  // Target node ID
  label?: string;
  source_side?: ConnectionSide;
  target_side?: ConnectionSide;
  color?: string;
  width?: number;
  style?: EdgeStyle;
  arrow_start?: ArrowType;
  arrow_end?: ArrowType;
}

export interface UpdateEdgeRequest {
  label?: string;
  color?: string;
  width?: number;
  style?: EdgeStyle;
  arrow_start?: ArrowType;
  arrow_end?: ArrowType;
  arrow_size?: number;
}

// WebSocket message types
export interface WebSocketMessage {
  type: 'diagram_updated' | 'diagram_closed' | 'pong';
  diagram_id?: string;
}

// UI State types
export interface SelectionState {
  selectedNodeIds: string[];  // Multiple nodes can be selected
  selectedEdgeId: string | null;
}

// Selection box for drag-select
export interface SelectionBox {
  isSelecting: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export type ConnectionSide = 'top' | 'right' | 'bottom' | 'left';

export interface ConnectionState {
  isConnecting: boolean;
  sourceNodeId: string | null;
  sourceSide: ConnectionSide | null;  // Which side the connection started from
}
