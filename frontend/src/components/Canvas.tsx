/**
 * Canvas component - the main drawing area for the diagram.
 *
 * Renders:
 * - Grid background
 * - All edges (as SVG)
 * - All nodes (as positioned divs)
 * - Temporary connection line when creating edges
 * - Selection box when drag-selecting
 *
 * Handles:
 * - Double-click to create new node
 * - Click on empty space to deselect
 * - Mouse tracking for connection line
 * - Drag on empty space to draw selection box
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Diagram, ConnectionState, SelectionState, SelectionBox, DiagramNode, ConnectionSide } from '../types/diagram';
import { Node } from './Node';
import { Edge, TempEdge } from './Edge';
import { ContextMenu } from './ContextMenu';
import type { ContextMenuType } from './ContextMenu';

interface CanvasProps {
  diagram: Diagram;
  selection: SelectionState;
  connection: ConnectionState;
  zoom?: number;  // Zoom level (1 = 100%, 0.5 = 50%, 2 = 200%)
  showGrid?: boolean;  // Whether to show grid lines
  gridSize?: number;   // Grid cell size in pixels
  onSelectNode: (nodeId: string | null, addToSelection?: boolean) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onMoveNode: (nodeId: string, x: number, y: number) => void;
  onMoveNodes: (moves: Array<{ nodeId: string; x: number; y: number }>) => void;
  onResizeNode: (nodeId: string, width: number, height: number) => void;
  onRotateNode: (nodeId: string, rotation: number) => void;
  onStartConnection: (nodeId: string, side: ConnectionSide) => void;
  onCompleteConnection: (nodeId: string, side: ConnectionSide) => void;
  onCancelConnection: () => void;
  onAddNode: (x: number, y: number) => void;
  // Context menu actions
  onDeleteNode?: (nodeId: string) => void;
  onDuplicateNode?: () => void;
  onDeleteEdge?: (edgeId: string) => void;
  onPaste?: () => void;
  onSelectAll?: () => void;
}

// Check if a node intersects with a selection box
function nodeIntersectsBox(node: DiagramNode, box: { x1: number; y1: number; x2: number; y2: number }): boolean {
  const nodeRight = node.x + node.width;
  const nodeBottom = node.y + node.height;
  return !(node.x > box.x2 || nodeRight < box.x1 || node.y > box.y2 || nodeBottom < box.y1);
}

export function Canvas({
  diagram,
  selection,
  connection,
  zoom = 1,
  showGrid = true,
  gridSize = 20,
  onSelectNode,
  onSelectNodes,
  onSelectEdge,
  onMoveNode,
  onMoveNodes,
  onResizeNode,
  onRotateNode,
  onStartConnection,
  onCompleteConnection,
  onCancelConnection,
  onAddNode,
  onDeleteNode,
  onDuplicateNode,
  onDeleteEdge,
  onPaste,
  onSelectAll,
}: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    type: ContextMenuType;
    x: number;
    y: number;
    targetId?: string;  // Node or edge ID when applicable
    canvasX?: number;   // Canvas coords for adding node
    canvasY?: number;
  }>({ type: null, x: 0, y: 0 });

  // Selection box state
  const [selectionBox, setSelectionBox] = useState<SelectionBox>({
    isSelecting: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });

  // Ref to track if we just finished a selection (to prevent click handler from clearing)
  const justFinishedSelectionRef = useRef(false);

  // Track mouse position for temp edge and selection box
  // Note: positions are adjusted for zoom level
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    // Divide by zoom to convert screen coords to canvas coords
    const x = (e.clientX - rect.left + canvasRef.current.scrollLeft) / zoom;
    const y = (e.clientY - rect.top + canvasRef.current.scrollTop) / zoom;

    if (connection.isConnecting) {
      setMousePos({ x, y });
    }

    if (selectionBox.isSelecting) {
      setSelectionBox(prev => ({ ...prev, currentX: x, currentY: y }));
    }
  }, [connection.isConnecting, selectionBox.isSelecting, zoom]);

  // Start selection box on mousedown on empty canvas
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start selection box on empty canvas (not on nodes)
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('canvas')) {
      if (connection.isConnecting) return; // Don't start box while connecting

      const rect = canvasRef.current!.getBoundingClientRect();
      // Divide by zoom to convert screen coords to canvas coords
      const x = (e.clientX - rect.left + canvasRef.current!.scrollLeft) / zoom;
      const y = (e.clientY - rect.top + canvasRef.current!.scrollTop) / zoom;

      setSelectionBox({
        isSelecting: true,
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
      });
    }
  }, [connection.isConnecting, zoom]);

  // End selection box on mouseup
  useEffect(() => {
    const handleMouseUp = () => {
      if (selectionBox.isSelecting) {
        // Calculate which nodes are inside the selection box
        const x1 = Math.min(selectionBox.startX, selectionBox.currentX);
        const y1 = Math.min(selectionBox.startY, selectionBox.currentY);
        const x2 = Math.max(selectionBox.startX, selectionBox.currentX);
        const y2 = Math.max(selectionBox.startY, selectionBox.currentY);

        // Only select if box has some size (not just a click)
        if (x2 - x1 > 5 || y2 - y1 > 5) {
          const selectedIds = diagram.nodes
            .filter(node => nodeIntersectsBox(node, { x1, y1, x2, y2 }))
            .map(node => node.id);
          onSelectNodes(selectedIds);

          // Mark that we just finished a selection (to prevent click handler from clearing)
          justFinishedSelectionRef.current = true;
          setTimeout(() => { justFinishedSelectionRef.current = false; }, 0);
        }

        setSelectionBox(prev => ({ ...prev, isSelecting: false }));
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [selectionBox, diagram.nodes, onSelectNodes]);

  // Click on empty canvas to deselect or cancel connection
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('canvas')) {
      if (connection.isConnecting) {
        onCancelConnection();
      } else if (!selectionBox.isSelecting && !justFinishedSelectionRef.current) {
        // Only deselect if not doing selection box and didn't just finish one
        onSelectNode(null);
        onSelectEdge(null);
      }
    }
  }, [connection.isConnecting, selectionBox.isSelecting, onCancelConnection, onSelectNode, onSelectEdge]);

  // Double-click to create node
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('canvas')) {
      const rect = canvasRef.current!.getBoundingClientRect();
      // Divide by zoom to convert screen coords to canvas coords, then center the node
      const x = (e.clientX - rect.left + canvasRef.current!.scrollLeft) / zoom - 75;
      const y = (e.clientY - rect.top + canvasRef.current!.scrollTop) / zoom - 40;
      onAddNode(Math.max(0, x), Math.max(0, y));
    }
  }, [onAddNode, zoom]);

  // Cancel connection on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && connection.isConnecting) {
        onCancelConnection();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [connection.isConnecting, onCancelConnection]);

  // Context menu handler
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();

    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();

    // Calculate canvas coordinates (for adding nodes)
    const canvasX = (e.clientX - rect.left + canvasRef.current.scrollLeft) / zoom;
    const canvasY = (e.clientY - rect.top + canvasRef.current.scrollTop) / zoom;

    // Check what was clicked - look for data attributes on target or parents
    const target = e.target as HTMLElement;

    // Check if clicked on a node
    const nodeElement = target.closest('[data-node-id]');
    if (nodeElement) {
      const nodeId = nodeElement.getAttribute('data-node-id');
      if (nodeId) {
        // Select the node if not already selected
        if (!selection.selectedNodeIds.includes(nodeId)) {
          onSelectNode(nodeId);
        }
        setContextMenu({
          type: 'node',
          x: e.clientX,
          y: e.clientY,
          targetId: nodeId,
        });
        return;
      }
    }

    // Check if clicked on an edge
    const edgeElement = target.closest('[data-edge-id]');
    if (edgeElement) {
      const edgeId = edgeElement.getAttribute('data-edge-id');
      if (edgeId) {
        onSelectEdge(edgeId);
        setContextMenu({
          type: 'edge',
          x: e.clientX,
          y: e.clientY,
          targetId: edgeId,
        });
        return;
      }
    }

    // Canvas context menu
    setContextMenu({
      type: 'canvas',
      x: e.clientX,
      y: e.clientY,
      canvasX,
      canvasY,
    });
  }, [zoom, selection.selectedNodeIds, onSelectNode, onSelectEdge]);

  const closeContextMenu = useCallback(() => {
    setContextMenu({ type: null, x: 0, y: 0 });
  }, []);

  // Get source node for temp edge
  const sourceNode = connection.sourceNodeId
    ? diagram.nodes.find(n => n.id === connection.sourceNodeId)
    : null;

  // Calculate selection box dimensions
  const boxX = Math.min(selectionBox.startX, selectionBox.currentX);
  const boxY = Math.min(selectionBox.startY, selectionBox.currentY);
  const boxW = Math.abs(selectionBox.currentX - selectionBox.startX);
  const boxH = Math.abs(selectionBox.currentY - selectionBox.startY);

  return (
    <div
      ref={canvasRef}
      className="canvas-container"
      onMouseMove={handleMouseMove}
      onMouseDown={handleCanvasMouseDown}
      onClick={handleCanvasClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <div
        className={`canvas ${connection.isConnecting ? 'connecting' : ''}`}
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          // Dynamic grid background
          backgroundImage: showGrid
            ? `linear-gradient(var(--canvas-grid) 1px, transparent 1px),
               linear-gradient(90deg, var(--canvas-grid) 1px, transparent 1px)`
            : 'none',
          backgroundSize: showGrid ? `${gridSize}px ${gridSize}px` : undefined,
        }}
      >
        {/* SVG layer for edges - renders BEHIND nodes */}
        <svg className="edges-layer">
          {/* Render all edges */}
          {diagram.edges.map(edge => {
            const source = diagram.nodes.find(n => n.id === edge.source);
            const target = diagram.nodes.find(n => n.id === edge.target);
            if (!source || !target) return null;

            return (
              <Edge
                key={edge.id}
                edge={edge}
                sourceNode={source}
                targetNode={target}
                isSelected={selection.selectedEdgeId === edge.id}
                onSelect={onSelectEdge}
              />
            );
          })}

          {/* Temporary edge while connecting */}
          {connection.isConnecting && sourceNode && (
            <TempEdge
              sourceNode={sourceNode}
              sourceSide={connection.sourceSide}
              mouseX={mousePos.x}
              mouseY={mousePos.y}
            />
          )}
        </svg>

        {/* Node layer - all nodes render ABOVE edges, sorted by z_index internally */}
        <div className="nodes-layer">
          {[...diagram.nodes]
            .sort((a, b) => (a.z_index || 0) - (b.z_index || 0))
            .map(node => (
            <Node
              key={node.id}
              node={node}
              isSelected={selection.selectedNodeIds.includes(node.id)}
              selectedNodeIds={selection.selectedNodeIds}
              isConnecting={connection.isConnecting && connection.sourceNodeId === node.id}
              isConnectionTarget={connection.isConnecting && connection.sourceNodeId !== node.id}
              gridSize={diagram.metadata.grid_size || 0}
              zoom={zoom}
              allNodes={diagram.nodes}
              onSelect={onSelectNode}
              onMove={onMoveNode}
              onMoveMultiple={onMoveNodes}
              onResize={onResizeNode}
              onRotate={onRotateNode}
              onStartConnection={onStartConnection}
              onCompleteConnection={onCompleteConnection}
            />
          ))}
        </div>

        {/* Selection box */}
        {selectionBox.isSelecting && (
          <div
            className="selection-box"
            style={{
              left: boxX,
              top: boxY,
              width: boxW,
              height: boxH,
            }}
          />
        )}
      </div>

      {/* Context Menu */}
      <ContextMenu
        type={contextMenu.type}
        x={contextMenu.x}
        y={contextMenu.y}
        onAddNode={() => {
          if (contextMenu.canvasX !== undefined && contextMenu.canvasY !== undefined) {
            onAddNode(contextMenu.canvasX, contextMenu.canvasY);
          }
        }}
        onPaste={onPaste}
        onSelectAll={onSelectAll}
        onDeleteNode={() => {
          if (contextMenu.targetId && onDeleteNode) {
            onDeleteNode(contextMenu.targetId);
          }
        }}
        onDuplicateNode={onDuplicateNode}
        onStartConnection={() => {
          if (contextMenu.targetId) {
            onStartConnection(contextMenu.targetId, 'right');  // Default to right side from context menu
          }
        }}
        onDeleteEdge={() => {
          if (contextMenu.targetId && onDeleteEdge) {
            onDeleteEdge(contextMenu.targetId);
          }
        }}
        onClose={closeContextMenu}
      />
    </div>
  );
}
