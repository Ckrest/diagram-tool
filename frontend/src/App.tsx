/**
 * Main App component - orchestrates the diagram tool.
 *
 * Layout:
 * - Header with diagram name
 * - Toolbar with file menu, undo/redo, add node
 * - Main area with Canvas (left) and SidePanel (right)
 * - Error toast for API errors
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { useDiagram } from './hooks/useDiagram';
import { Toolbar } from './components/Toolbar';
import { Canvas } from './components/Canvas';
import { SidePanel } from './components/SidePanel';
import { alignNodes, distributeNodes, updateDiagramInfo, autoLayout } from './api/diagramApi';
import './styles/diagram.css';

// Error Toast with auto-dismiss
function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div className="error-toast" onClick={onDismiss}>
      {message}
      <span style={{ marginLeft: 8, opacity: 0.7 }}>×</span>
    </div>
  );
}

// Zoom Indicator that appears briefly when zoom changes
function ZoomIndicator({ zoom, visible }: { zoom: number; visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="zoom-indicator">
      {Math.round(zoom * 100)}%
    </div>
  );
}

function App() {
  const {
    // State
    diagram,
    filePath,
    isDirty,
    canUndo,
    canRedo,
    loading,
    error,
    isConnected,
    selection,
    connection,

    // File operations
    newDiagram,
    openDiagram,
    saveDiagram,

    // Undo/redo
    undo,
    redo,

    // Node operations
    addNode,
    updateNode,
    moveNodes,
    deleteNode,
    resizeNode,
    rotateNode,

    // Edge operations
    updateEdge,
    deleteEdge,

    // Selection
    selectNode,
    selectNodes,
    selectEdge,
    getSelectedNode,
    getSelectedEdge,

    // Copy/paste
    copySelectedNodes,
    pasteNodes,

    // Connection mode
    startConnection,
    cancelConnection,
    completeConnection,

    // Utils
    clearError,
    refresh,
  } = useDiagram();

  // Zoom state (local, not persisted)
  const [zoom, setZoom] = useState(1);
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  const initialRender = useRef(true);

  // Show zoom indicator briefly when zoom changes (not on initial load)
  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    setShowZoomIndicator(true);
    const timer = setTimeout(() => setShowZoomIndicator(false), 1000);
    return () => clearTimeout(timer);
  }, [zoom]);

  // Grid state (from diagram metadata, with local fallback)
  const showGrid = diagram?.metadata?.show_grid ?? true;
  const gridSize = diagram?.metadata?.grid_size ?? 20;

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(2, z + 0.25));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(0.25, z - 0.25));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(1);
  }, []);

  // Fit to screen: calculate zoom to fit all nodes in the viewport
  const handleZoomFit = useCallback(() => {
    if (!diagram || diagram.nodes.length === 0) return;

    // Calculate diagram bounds
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const node of diagram.nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }

    // Add padding
    const PADDING = 60;
    const diagramWidth = maxX - minX + PADDING * 2;
    const diagramHeight = maxY - minY + PADDING * 2;

    // Estimate viewport size (canvas container minus side panel)
    // Side panel is ~320px, toolbar is ~48px, header is ~48px
    const viewportWidth = window.innerWidth - 320 - 20;  // 20px for scrollbar
    const viewportHeight = window.innerHeight - 48 - 48 - 40;  // header, toolbar, footer

    // Calculate zoom to fit
    const zoomX = viewportWidth / diagramWidth;
    const zoomY = viewportHeight / diagramHeight;
    const fitZoom = Math.min(zoomX, zoomY, 2);  // Cap at 200%

    // Clamp to valid range
    setZoom(Math.max(0.25, Math.min(2, fitZoom)));
  }, [diagram]);

  // Grid handlers - update diagram metadata via API
  const handleToggleGrid = useCallback(async () => {
    if (!diagram) return;
    try {
      await updateDiagramInfo({ show_grid: !showGrid });
      refresh();
    } catch (err) {
      console.error('Failed to toggle grid:', err);
    }
  }, [diagram, showGrid, refresh]);

  const handleSetGridSize = useCallback(async (size: number) => {
    if (!diagram) return;
    try {
      await updateDiagramInfo({ grid_size: size });
      refresh();
    } catch (err) {
      console.error('Failed to set grid size:', err);
    }
  }, [diagram, refresh]);

  // Align/distribute handlers
  const handleAlignNodes = useCallback(async (alignment: string) => {
    if (selection.selectedNodeIds.length < 2) return;
    try {
      await alignNodes(selection.selectedNodeIds, alignment);
      refresh();
    } catch (err) {
      console.error('Failed to align nodes:', err);
    }
  }, [selection.selectedNodeIds, refresh]);

  const handleDistributeNodes = useCallback(async (axis: string) => {
    if (selection.selectedNodeIds.length < 3) return;
    try {
      await distributeNodes(selection.selectedNodeIds, axis);
      refresh();
    } catch (err) {
      console.error('Failed to distribute nodes:', err);
    }
  }, [selection.selectedNodeIds, refresh]);

  // Auto-layout handler
  const handleAutoLayout = useCallback(async (strategy: 'grid' | 'tree' | 'force') => {
    try {
      await autoLayout(strategy);
      refresh();
    } catch (err) {
      console.error('Failed to auto-layout:', err);
    }
  }, [refresh]);

  // Handle node movement (just x, y update)
  const handleMoveNode = useCallback((nodeId: string, x: number, y: number) => {
    updateNode(nodeId, { x, y });
  }, [updateNode]);

  // Add node at a specific position
  const handleAddNodeAt = useCallback(async (x: number, y: number) => {
    const node = await addNode({ x, y });
    selectNode(node.id);
  }, [addNode, selectNode]);

  // Add node at center (from toolbar)
  const handleAddNodeFromToolbar = useCallback(async () => {
    // Position in a reasonable spot
    const x = 200 + (diagram?.nodes.length ?? 0) * 50;
    const y = 200 + (diagram?.nodes.length ?? 0) * 30;
    const node = await addNode({ x, y });
    selectNode(node.id);
  }, [addNode, selectNode, diagram?.nodes.length]);

  // Handle save
  const handleSave = useCallback(async () => {
    try {
      await saveDiagram();
    } catch {
      // Error is handled by useDiagram
    }
  }, [saveDiagram]);

  // Handle save as
  const handleSaveAs = useCallback(async (path: string) => {
    try {
      await saveDiagram(path);
    } catch {
      // Error is handled by useDiagram
    }
  }, [saveDiagram]);

  // Handle open
  const handleOpen = useCallback(async (path: string) => {
    try {
      await openDiagram(path);
    } catch {
      // Error is handled by useDiagram
    }
  }, [openDiagram]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Ctrl/Cmd shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'c':
            e.preventDefault();
            copySelectedNodes();
            break;
          case 'v':
            e.preventDefault();
            pasteNodes();
            break;
          case 'd':
            // Duplicate: need to pass nodes directly to avoid async state issue
            e.preventDefault();
            if (diagram && selection.selectedNodeIds.length > 0) {
              // Copy first, then paste after a microtask to ensure state is updated
              copySelectedNodes();
              setTimeout(() => pasteNodes(), 0);
            }
            break;
          case 'a':
            // Select all nodes
            e.preventDefault();
            if (diagram) {
              selectNodes(diagram.nodes.map(n => n.id));
            }
            break;
          case '=':
          case '+':
            // Zoom in
            e.preventDefault();
            handleZoomIn();
            break;
          case '-':
            // Zoom out
            e.preventDefault();
            handleZoomOut();
            break;
          case '0':
            // Reset zoom
            e.preventDefault();
            handleZoomReset();
            break;
        }
        return;
      }

      // Non-modifier shortcuts
      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          // Delete selected edge first, then nodes
          if (selection.selectedEdgeId) {
            deleteEdge(selection.selectedEdgeId);
          } else if (selection.selectedNodeIds.length > 0) {
            // Delete all selected nodes
            selection.selectedNodeIds.forEach(nodeId => {
              deleteNode(nodeId);
            });
          }
          break;
        case 'Escape':
          e.preventDefault();
          // Cancel connection mode or clear selection
          if (connection.isConnecting) {
            cancelConnection();
          } else {
            selectNodes([]);
            selectEdge(null);
          }
          break;
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight':
          // Nudge selected nodes with arrow keys
          if (selection.selectedNodeIds.length > 0 && diagram) {
            e.preventDefault();
            const nudgeAmount = e.shiftKey ? 10 : 1;  // Shift for larger nudge
            const dx = e.key === 'ArrowLeft' ? -nudgeAmount : e.key === 'ArrowRight' ? nudgeAmount : 0;
            const dy = e.key === 'ArrowUp' ? -nudgeAmount : e.key === 'ArrowDown' ? nudgeAmount : 0;

            const moves = selection.selectedNodeIds.map(nodeId => {
              const node = diagram.nodes.find(n => n.id === nodeId);
              if (!node) return null;
              return {
                nodeId,
                x: Math.max(0, node.x + dx),
                y: Math.max(0, node.y + dy),
              };
            }).filter(Boolean) as Array<{ nodeId: string; x: number; y: number }>;

            if (moves.length > 0) {
              moveNodes(moves);
            }
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [copySelectedNodes, pasteNodes, selection, connection, diagram, selectNodes, selectEdge, deleteNode, deleteEdge, cancelConnection, handleZoomIn, handleZoomOut, handleZoomReset, moveNodes]);

  // Mouse wheel zoom (Ctrl + wheel)
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          handleZoomIn();
        } else {
          handleZoomOut();
        }
      }
    };

    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, [handleZoomIn, handleZoomOut]);

  // Show loading state
  if (loading && !diagram) {
    return (
      <div className="app">
        <div className="loading-overlay">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="app-title">
          <h1>Diagram Tool</h1>
          {diagram && (
            <span className="diagram-name">
              {diagram.name}
              {filePath && ` — ${filePath}`}
            </span>
          )}
        </div>
      </header>

      {/* Toolbar */}
      <Toolbar
        diagramName={diagram?.name ?? null}
        filePath={filePath}
        isDirty={isDirty}
        canUndo={canUndo}
        canRedo={canRedo}
        isConnected={isConnected}
        nodes={diagram?.nodes ?? []}
        diagram={diagram}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        onZoomFit={handleZoomFit}
        showGrid={showGrid}
        gridSize={gridSize}
        onToggleGrid={handleToggleGrid}
        onSetGridSize={handleSetGridSize}
        selectedCount={selection.selectedNodeIds.length}
        onAlignNodes={handleAlignNodes}
        onDistributeNodes={handleDistributeNodes}
        onAutoLayout={handleAutoLayout}
        onNewDiagram={newDiagram}
        onOpenDiagram={handleOpen}
        onSaveDiagram={handleSave}
        onSaveAsDiagram={handleSaveAs}
        onUndo={undo}
        onRedo={redo}
        onAddNode={handleAddNodeFromToolbar}
      />

      {/* Main Content */}
      <main className="app-main">
        {diagram ? (
          <>
            <Canvas
              diagram={diagram}
              selection={selection}
              connection={connection}
              zoom={zoom}
              showGrid={showGrid}
              gridSize={gridSize}
              onSelectNode={selectNode}
              onSelectNodes={selectNodes}
              onSelectEdge={selectEdge}
              onMoveNode={handleMoveNode}
              onMoveNodes={moveNodes}
              onResizeNode={resizeNode}
              onRotateNode={rotateNode}
              onStartConnection={startConnection}
              onCompleteConnection={completeConnection}
              onCancelConnection={cancelConnection}
              onAddNode={handleAddNodeAt}
              onDeleteNode={deleteNode}
              onDuplicateNode={() => { copySelectedNodes(); pasteNodes(); }}
              onDeleteEdge={deleteEdge}
              onPaste={pasteNodes}
              onSelectAll={() => selectNodes(diagram.nodes.map(n => n.id))}
            />
            <SidePanel
              selectedNode={getSelectedNode()}
              selectedEdge={getSelectedEdge()}
              onUpdateNode={updateNode}
              onUpdateEdge={updateEdge}
              onDeleteNode={deleteNode}
              onDeleteEdge={deleteEdge}
            />
          </>
        ) : (
          <div className="welcome-screen">
            <div className="welcome-content">
              <div className="welcome-icon">📊</div>
              <h2>Welcome to Diagram Tool</h2>
              <p className="welcome-subtitle">Create flowcharts, architecture diagrams, and more</p>
              <div className="welcome-actions">
                <button className="primary-action" onClick={() => newDiagram()}>
                  + Create New Diagram
                </button>
                <span className="action-divider">or</span>
                <button className="secondary-action" onClick={() => {
                  const path = prompt('Enter diagram file path:');
                  if (path) openDiagram(path);
                }}>
                  📁 Open Existing
                </button>
              </div>
              <div className="welcome-tips">
                <h3>Quick Tips</h3>
                <ul>
                  <li><kbd>Double-click</kbd> on canvas to add nodes</li>
                  <li><kbd>Drag</kbd> from node handle to connect</li>
                  <li><kbd>Ctrl+S</kbd> to save • <kbd>Ctrl+Z</kbd> to undo</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Keyboard Shortcuts Hint */}
      {diagram && (
        <div className="shortcuts-hint">
          Double-click: Add node • Drag: Select area • Shift+Click: Multi-select • Del: Delete • Esc: Deselect • Arrows: Nudge • Ctrl+Wheel: Zoom • Ctrl+A: Select all • Ctrl+D: Duplicate • Ctrl+C/V: Copy/Paste • Ctrl+Z/Y: Undo/Redo
        </div>
      )}

      {/* Zoom Indicator */}
      {diagram && <ZoomIndicator zoom={zoom} visible={showZoomIndicator} />}

      {/* Error Toast - auto-dismiss after 5 seconds */}
      {error && (
        <ErrorToast message={error} onDismiss={clearError} />
      )}
    </div>
  );
}

export default App;
