/**
 * Node component - renders a single draggable node on the canvas.
 *
 * Supports:
 * - Different shapes (rectangle, ellipse, diamond, pill, arrow, triangle)
 * - Rotation (0-360 degrees)
 * - Drag to move (commits only on mouseup for performance)
 * - Resize from corner handle
 * - Click to select
 * - Connection handle for creating edges
 */

import { useRef, useCallback, useState, useEffect } from 'react';
import type { DiagramNode, ConnectionSide } from '../types/diagram';

interface NodeProps {
  node: DiagramNode;
  isSelected: boolean;
  selectedNodeIds: string[];  // All selected node IDs (for group move)
  isConnecting: boolean;
  isConnectionTarget: boolean;
  gridSize: number;  // For snap-to-grid (0 = disabled)
  zoom: number;  // Current zoom level for accurate drag calculations
  allNodes: DiagramNode[];  // All nodes (for group move calculations)
  onSelect: (nodeId: string, addToSelection?: boolean) => void;
  onMove: (nodeId: string, x: number, y: number) => void;
  onMoveMultiple: (moves: Array<{ nodeId: string; x: number; y: number }>) => void;
  onResize: (nodeId: string, width: number, height: number) => void;
  onRotate: (nodeId: string, rotation: number) => void;
  onStartConnection: (nodeId: string, side: ConnectionSide) => void;
  onCompleteConnection: (nodeId: string, side: ConnectionSide) => void;
}

// Snap value to grid
const snapToGrid = (value: number, gridSize: number): number => {
  if (gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
};

// Convert border_style to CSS
const getBorderStyle = (style: string): string => {
  switch (style) {
    case 'dashed': return '3px dashed';
    case 'dotted': return '3px dotted';
    default: return '2px solid';
  }
};

export function Node({
  node,
  isSelected,
  selectedNodeIds,
  isConnecting,
  isConnectionTarget,
  gridSize,
  zoom = 1,
  allNodes,
  onSelect,
  onMove,
  onMoveMultiple,
  onResize,
  onRotate,
  onStartConnection,
  onCompleteConnection,
}: NodeProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isRotating, setIsRotating] = useState(false);

  // Local state for smooth dragging/resizing/rotating (not sent to backend until mouseup)
  const [localPos, setLocalPos] = useState({ x: node.x, y: node.y });
  const [localSize, setLocalSize] = useState({ w: node.width, h: node.height });
  const [localRotation, setLocalRotation] = useState(node.rotation ?? 0);

  const dragStart = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0, nodeW: 0, nodeH: 0, rotation: 0 });

  // Sync local state when node prop changes (from backend updates)
  useEffect(() => {
    if (!isDragging) {
      setLocalPos({ x: node.x, y: node.y });
    }
  }, [node.x, node.y, isDragging]);

  useEffect(() => {
    if (!isResizing) {
      setLocalSize({ w: node.width, h: node.height });
    }
  }, [node.width, node.height, isResizing]);

  useEffect(() => {
    if (!isRotating) {
      setLocalRotation(node.rotation ?? 0);
    }
  }, [node.rotation, isRotating]);

  // Determine which side a handle belongs to from its class
  const getSideFromElement = (el: HTMLElement): ConnectionSide => {
    if (el.classList.contains('top')) return 'top';
    if (el.classList.contains('bottom')) return 'bottom';
    if (el.classList.contains('left')) return 'left';
    return 'right';  // Default
  };

  // Handle mouseUp for connection completion (when dragging from another node)
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isConnectionTarget) {
      e.stopPropagation();
      const target = e.target as HTMLElement;
      // Determine which side was targeted based on the handle class
      const side = target.classList.contains('node-handle')
        ? getSideFromElement(target)
        : 'right';  // Default if clicking node body
      onCompleteConnection(node.id, side);
    }
  }, [isConnectionTarget, node.id, onCompleteConnection]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // If in connection mode and this is a target, complete the connection
    // (Also handled on mouseUp for drag-release completion)
    if (isConnectionTarget) {
      e.stopPropagation();
      const target = e.target as HTMLElement;
      const side = target.classList.contains('node-handle')
        ? getSideFromElement(target)
        : 'right';
      onCompleteConnection(node.id, side);
      return;
    }

    // Don't start drag from handles
    if ((e.target as HTMLElement).classList.contains('node-handle') ||
        (e.target as HTMLElement).classList.contains('node-resize-handle')) {
      return;
    }

    e.stopPropagation();

    // Check if this is a multi-select operation (shift held)
    const addToSelection = e.shiftKey;

    // If this node is already selected and we're in multi-select mode,
    // don't change selection, just start the group drag
    const isGroupDrag = isSelected && selectedNodeIds.length > 1;

    // Update selection
    if (!isGroupDrag) {
      onSelect(node.id, addToSelection);
    }

    // Determine which nodes to move (all selected if group drag, otherwise just this one)
    const nodesToMove = isGroupDrag ? selectedNodeIds : [node.id];

    // Get starting positions for all nodes being moved
    const startPositions = new Map<string, { x: number; y: number }>();
    for (const id of nodesToMove) {
      const n = allNodes.find(n => n.id === id);
      if (n) {
        startPositions.set(id, { x: n.x, y: n.y });
      }
    }

    // Start drag
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      nodeX: localPos.x,
      nodeY: localPos.y,
      nodeW: localSize.w,
      nodeH: localSize.h,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Divide by zoom to convert screen pixels to canvas units
      const dx = (moveEvent.clientX - dragStart.current.x) / zoom;
      const dy = (moveEvent.clientY - dragStart.current.y) / zoom;
      let newX = Math.max(0, dragStart.current.nodeX + dx);
      let newY = Math.max(0, dragStart.current.nodeY + dy);
      // Apply snap-to-grid
      newX = snapToGrid(newX, gridSize);
      newY = snapToGrid(newY, gridSize);
      // Update LOCAL state only (no backend call)
      setLocalPos({ x: newX, y: newY });
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      // Calculate delta from original position (divide by zoom for canvas units)
      const dx = (upEvent.clientX - dragStart.current.x) / zoom;
      const dy = (upEvent.clientY - dragStart.current.y) / zoom;

      // Skip if no actual movement
      if (dx === 0 && dy === 0) return;

      if (isGroupDrag && nodesToMove.length > 1) {
        // Group move - calculate new positions for all selected nodes
        const moves: Array<{ nodeId: string; x: number; y: number }> = [];
        for (const id of nodesToMove) {
          const startPos = startPositions.get(id);
          if (startPos) {
            let newX = Math.max(0, startPos.x + dx);
            let newY = Math.max(0, startPos.y + dy);
            newX = snapToGrid(newX, gridSize);
            newY = snapToGrid(newY, gridSize);
            moves.push({ nodeId: id, x: newX, y: newY });
          }
        }
        if (moves.length > 0) {
          onMoveMultiple(moves);
        }
      } else {
        // Single node move
        let finalX = Math.max(0, dragStart.current.nodeX + dx);
        let finalY = Math.max(0, dragStart.current.nodeY + dy);
        finalX = snapToGrid(finalX, gridSize);
        finalY = snapToGrid(finalY, gridSize);

        // Only commit if position actually changed
        if (finalX !== dragStart.current.nodeX || finalY !== dragStart.current.nodeY) {
          onMove(node.id, finalX, finalY);
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [node.id, localPos.x, localPos.y, localSize.w, localSize.h, isSelected, selectedNodeIds, allNodes, isConnectionTarget, gridSize, zoom, onSelect, onMove, onMoveMultiple, onCompleteConnection]);

  const handleConnectionStart = useCallback((side: ConnectionSide) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onStartConnection(node.id, side);
  }, [node.id, onStartConnection]);

  // Resize handle (bottom-right corner)
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      nodeX: localPos.x,
      nodeY: localPos.y,
      nodeW: localSize.w,
      nodeH: localSize.h,
    };

    const handleResizeMove = (moveEvent: MouseEvent) => {
      // Divide by zoom to convert screen pixels to canvas units
      const dx = (moveEvent.clientX - dragStart.current.x) / zoom;
      const dy = (moveEvent.clientY - dragStart.current.y) / zoom;
      let newW = Math.max(60, dragStart.current.nodeW + dx);
      let newH = Math.max(40, dragStart.current.nodeH + dy);
      // Apply snap-to-grid for sizes
      newW = snapToGrid(newW, gridSize) || newW;
      newH = snapToGrid(newH, gridSize) || newH;
      // Update LOCAL state only (no backend call)
      setLocalSize({ w: newW, h: newH });
    };

    const handleResizeEnd = (upEvent: MouseEvent) => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);

      // Calculate final size and COMMIT to backend (divide by zoom)
      const dx = (upEvent.clientX - dragStart.current.x) / zoom;
      const dy = (upEvent.clientY - dragStart.current.y) / zoom;
      let finalW = Math.max(60, dragStart.current.nodeW + dx);
      let finalH = Math.max(40, dragStart.current.nodeH + dy);
      finalW = snapToGrid(finalW, gridSize) || finalW;
      finalH = snapToGrid(finalH, gridSize) || finalH;

      // Only commit if size actually changed
      if (finalW !== dragStart.current.nodeW || finalH !== dragStart.current.nodeH) {
        onResize(node.id, finalW, finalH);
      }
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  }, [node.id, localPos.x, localPos.y, localSize.w, localSize.h, gridSize, zoom, onResize]);

  // Rotation handle (top center, above the node)
  const handleRotateStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsRotating(true);

    // Get the node's center position in screen coordinates
    const nodeElement = nodeRef.current;
    if (!nodeElement) return;

    const nodeRect = nodeElement.getBoundingClientRect();
    const nodeCenterX = nodeRect.left + nodeRect.width / 2;
    const nodeCenterY = nodeRect.top + nodeRect.height / 2;

    const startRotation = localRotation;
    let finalRotation = localRotation;  // Track the final rotation value

    const handleRotateMove = (moveEvent: MouseEvent) => {
      // Calculate angle from node center to mouse position
      const dx = moveEvent.clientX - nodeCenterX;
      const dy = moveEvent.clientY - nodeCenterY;
      // atan2 gives angle from positive x-axis, we want angle from positive y-axis (pointing up)
      // So we swap arguments and add 90 degrees
      let angle = Math.atan2(dx, -dy) * (180 / Math.PI);
      // Normalize to 0-360
      if (angle < 0) angle += 360;
      // Snap to 15-degree increments by default, hold Shift for free rotation
      if (!moveEvent.shiftKey) {
        angle = Math.round(angle / 15) * 15;
      }
      finalRotation = angle;  // Update the tracked value
      setLocalRotation(angle);
    };

    const handleRotateEnd = () => {
      setIsRotating(false);
      document.removeEventListener('mousemove', handleRotateMove);
      document.removeEventListener('mouseup', handleRotateEnd);

      // Commit the final rotation to backend (use finalRotation, not stale localRotation)
      if (finalRotation !== startRotation) {
        onRotate(node.id, finalRotation);
      }
    };

    document.addEventListener('mousemove', handleRotateMove);
    document.addEventListener('mouseup', handleRotateEnd);
  }, [node.id, localRotation, onRotate]);

  // Calculate text color based on background brightness
  const getTextColor = (bgColor: string): string => {
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#000000' : '#ffffff';
  };

  // Convert hex color to rgba with opacity
  const getBackgroundColor = (color: string, opacity: number): string => {
    if (opacity >= 1) return color;
    const hex = color.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };

  const className = [
    'node',
    node.shape,
    node.type === 'zone' && 'zone',
    isSelected && 'selected',
    isConnecting && 'connecting',
    isConnectionTarget && 'connection-target',
    isDragging && 'dragging',
    isResizing && 'resizing',
    isRotating && 'rotating',
  ].filter(Boolean).join(' ');

  // Apply defaults for backward compatibility
  const fillOpacity = node.fill_opacity ?? 1;
  const borderStyle = node.border_style ?? 'solid';
  const zIndex = node.z_index ?? 0;
  // Use local rotation when actively rotating for smooth feedback
  const rotation = isRotating ? localRotation : (node.rotation ?? 0);

  const isZone = node.type === 'zone' || fillOpacity < 1;

  // Generate clip-path for special shapes
  const getClipPath = (): string | undefined => {
    switch (node.shape) {
      case 'arrow':
        // Arrow pointing right
        return 'polygon(0% 20%, 60% 20%, 60% 0%, 100% 50%, 60% 100%, 60% 80%, 0% 80%)';
      case 'triangle':
        // Triangle pointing up
        return 'polygon(50% 0%, 100% 100%, 0% 100%)';
      default:
        return undefined;
    }
  };

  const clipPath = getClipPath();

  // Use local position/size during drag/resize for smooth animation
  const displayX = isDragging ? localPos.x : node.x;
  const displayY = isDragging ? localPos.y : node.y;
  const displayW = isResizing ? localSize.w : node.width;
  const displayH = isResizing ? localSize.h : node.height;

  // Build transform string - rotation is applied around center
  const getTransform = (): string | undefined => {
    const transforms: string[] = [];

    // Diamond shape uses CSS rotation (45deg) - add to node rotation
    if (node.shape === 'diamond') {
      transforms.push(`rotate(${45 + rotation}deg)`);
    } else if (rotation !== 0) {
      transforms.push(`rotate(${rotation}deg)`);
    }

    return transforms.length > 0 ? transforms.join(' ') : undefined;
  };

  // For diamond, the label needs counter-rotation
  const getLabelTransform = (): string | undefined => {
    if (node.shape === 'diamond') {
      return `rotate(${-45 - rotation}deg)`;
    } else if (rotation !== 0) {
      return `rotate(${-rotation}deg)`;
    }
    return undefined;
  };

  // For clip-path shapes (arrow, triangle), we need a wrapper structure
  // so handles aren't clipped
  const hasClipPath = !!clipPath;

  return (
    <div
      ref={nodeRef}
      className={className}
      data-node-id={node.id}
      style={{
        left: displayX,
        top: displayY,
        width: displayW,
        height: displayH,
        // Only apply visual styles if not using clip-path
        backgroundColor: hasClipPath ? 'transparent' : getBackgroundColor(node.color, fillOpacity),
        color: fillOpacity < 0.5 ? node.color : getTextColor(node.color),
        border: hasClipPath ? 'none' : `${getBorderStyle(borderStyle)} ${node.color}`,
        zIndex: zIndex,
        transform: getTransform(),
        transformOrigin: 'center center',
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      {/* Inner shape div for clip-path shapes - this gets clipped, handles stay outside */}
      {hasClipPath && (
        <div
          className="node-shape-inner"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: getBackgroundColor(node.color, fillOpacity),
            clipPath: clipPath,
            // Border simulation via box-shadow doesn't work well with clip-path
            // Use a filter or accept borderless for these shapes
          }}
        />
      )}

      <span
        className="node-label"
        style={{ transform: getLabelTransform(), position: 'relative', zIndex: 1 }}
      >
        {node.label}
      </span>

      {/* Connection handles on all four sides - CSS controls visibility */}
      {!isZone && (
        <>
          <div
            className="node-handle top"
            onMouseDown={isConnectionTarget ? undefined : handleConnectionStart('top')}
            title={isConnectionTarget ? "Drop here to connect" : "Drag to connect"}
          />
          <div
            className="node-handle right"
            onMouseDown={isConnectionTarget ? undefined : handleConnectionStart('right')}
            title={isConnectionTarget ? "Drop here to connect" : "Drag to connect"}
          />
          <div
            className="node-handle bottom"
            onMouseDown={isConnectionTarget ? undefined : handleConnectionStart('bottom')}
            title={isConnectionTarget ? "Drop here to connect" : "Drag to connect"}
          />
          <div
            className="node-handle left"
            onMouseDown={isConnectionTarget ? undefined : handleConnectionStart('left')}
            title={isConnectionTarget ? "Drop here to connect" : "Drag to connect"}
          />
        </>
      )}

      {/* Resize handle (visible when selected) */}
      {isSelected && (
        <div
          className="node-resize-handle"
          onMouseDown={handleResizeStart}
          title="Drag to resize"
        />
      )}

      {/* Rotation handle (visible when selected, positioned above node) */}
      {isSelected && !isZone && (
        <>
          {/* Line connecting node to rotation handle */}
          <div className="node-rotate-line" />
          {/* The draggable rotation handle */}
          <div
            className="node-rotate-handle"
            onMouseDown={handleRotateStart}
            title="Drag to rotate (snaps to 15°, hold Shift for free rotation)"
          />
        </>
      )}
    </div>
  );
}
