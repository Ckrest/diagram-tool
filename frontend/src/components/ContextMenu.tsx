/**
 * Context Menu component - right-click menu for nodes, edges, and canvas.
 *
 * Shows different options based on what was clicked:
 * - Canvas: Add Node, Paste, Select All
 * - Node: Delete, Duplicate, Start Connection, Edit
 * - Edge: Delete, Edit Label
 */

import { useEffect, useRef, useState } from 'react';

export type ContextMenuType = 'canvas' | 'node' | 'edge' | null;

interface ContextMenuProps {
  type: ContextMenuType;
  x: number;
  y: number;
  // Canvas actions
  onAddNode?: () => void;
  onPaste?: () => void;
  onSelectAll?: () => void;
  // Node actions
  onDeleteNode?: () => void;
  onDuplicateNode?: () => void;
  onStartConnection?: () => void;
  // Edge actions
  onDeleteEdge?: () => void;
  // Common
  onClose: () => void;
}

export function ContextMenu({
  type,
  x,
  y,
  onAddNode,
  onPaste,
  onSelectAll,
  onDeleteNode,
  onDuplicateNode,
  onStartConnection,
  onDeleteEdge,
  onClose,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x, y });

  // Adjust position to keep menu within viewport
  useEffect(() => {
    if (!menuRef.current || !type) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const padding = 8;

    let newX = x;
    let newY = y;

    // Prevent overflow on right
    if (x + rect.width > window.innerWidth - padding) {
      newX = window.innerWidth - rect.width - padding;
    }
    // Prevent overflow on bottom
    if (y + rect.height > window.innerHeight - padding) {
      newY = window.innerHeight - rect.height - padding;
    }
    // Prevent going off left/top edge
    newX = Math.max(padding, newX);
    newY = Math.max(padding, newY);

    if (newX !== adjustedPos.x || newY !== adjustedPos.y) {
      setAdjustedPos({ x: newX, y: newY });
    }
  }, [type, x, y, adjustedPos.x, adjustedPos.y]);

  // Reset position when menu opens at new location
  useEffect(() => {
    setAdjustedPos({ x, y });
  }, [x, y]);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (!type) return null;

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        left: adjustedPos.x,
        top: adjustedPos.y,
      }}
    >
      {type === 'canvas' && (
        <>
          <button onClick={() => handleAction(onAddNode!)}>
            <span className="icon">+</span> Add Node
          </button>
          <button onClick={() => handleAction(onPaste!)} disabled={!onPaste}>
            <span className="icon">📋</span> Paste
            <span className="shortcut">Ctrl+V</span>
          </button>
          <div className="context-menu-divider" />
          <button onClick={() => handleAction(onSelectAll!)}>
            <span className="icon">☐</span> Select All
            <span className="shortcut">Ctrl+A</span>
          </button>
        </>
      )}

      {type === 'node' && (
        <>
          <button onClick={() => handleAction(onStartConnection!)}>
            <span className="icon">→</span> Connect To...
          </button>
          <button onClick={() => handleAction(onDuplicateNode!)}>
            <span className="icon">⎘</span> Duplicate
            <span className="shortcut">Ctrl+D</span>
          </button>
          <div className="context-menu-divider" />
          <button onClick={() => handleAction(onDeleteNode!)} className="danger">
            <span className="icon">🗑</span> Delete
            <span className="shortcut">Del</span>
          </button>
        </>
      )}

      {type === 'edge' && (
        <>
          <button onClick={() => handleAction(onDeleteEdge!)} className="danger">
            <span className="icon">🗑</span> Delete Edge
            <span className="shortcut">Del</span>
          </button>
        </>
      )}
    </div>
  );
}
