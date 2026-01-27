/**
 * Main diagram state hook.
 *
 * This hook manages:
 * - Fetching and caching diagram state
 * - Mutations (add/update/delete nodes/edges)
 * - File operations (new/open/save)
 * - Undo/redo
 * - WebSocket sync for real-time updates
 */

import { useState, useCallback, useEffect } from 'react';
import type {
  DiagramState,
  DiagramNode,
  DiagramEdge,
  CreateNodeRequest,
  UpdateNodeRequest,
  CreateEdgeRequest,
  UpdateEdgeRequest,
  SelectionState,
  ConnectionState,
  ConnectionSide,
} from '../types/diagram';
import * as api from '../api/diagramApi';
import { useWebSocket } from './useWebSocket';

export function useDiagram() {
  const [state, setState] = useState<DiagramState>({
    diagram: null,
    file_path: null,
    is_dirty: false,
    can_undo: false,
    can_redo: false,
  });

  const [selection, setSelection] = useState<SelectionState>({
    selectedNodeIds: [],
    selectedEdgeId: null,
  });

  const [connection, setConnection] = useState<ConnectionState>({
    isConnecting: false,
    sourceNodeId: null,
    sourceSide: null,
  });

  // Clipboard for copy/paste
  const [clipboard, setClipboard] = useState<DiagramNode[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch current state from backend
  const refresh = useCallback(async () => {
    try {
      const newState = await api.getDiagram();
      setState(newState);
      setError(null);
    } catch (e) {
      console.error('[useDiagram] refresh() error:', e);
      setError(e instanceof Error ? e.message : 'Failed to fetch diagram');
    } finally {
      setLoading(false);
    }
  }, []);

  // WebSocket connection for real-time updates
  const { isConnected } = useWebSocket({
    onDiagramUpdated: () => {
      refresh();
    },
    onDiagramClosed: () => {
      setState({
        diagram: null,
        file_path: null,
        is_dirty: false,
        can_undo: false,
        can_redo: false,
      });
      setSelection({ selectedNodeIds: [], selectedEdgeId: null });
    },
  });

  // Initial fetch
  useEffect(() => {
    refresh();
  }, [refresh]);

  // --- File Operations ---

  const newDiagram = useCallback(async (name = 'Untitled Diagram') => {
    try {
      setLoading(true);
      await api.newDiagram(name);
      await refresh();
      setSelection({ selectedNodeIds: [], selectedEdgeId: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create diagram');
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const openDiagram = useCallback(async (filePath: string) => {
    try {
      setLoading(true);
      await api.openDiagram(filePath);
      await refresh();
      setSelection({ selectedNodeIds: [], selectedEdgeId: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open diagram');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const saveDiagram = useCallback(async (filePath?: string) => {
    try {
      const result = await api.saveDiagram(filePath);
      await refresh();
      return result.file_path;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save diagram');
      throw e;
    }
  }, [refresh]);

  const updateDiagramName = useCallback(async (name: string) => {
    try {
      await api.updateDiagramInfo({ name });
      // WebSocket will trigger refresh
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update diagram');
    }
  }, []);

  // --- Undo/Redo ---

  const undo = useCallback(async () => {
    try {
      await api.undo();
      // WebSocket will trigger refresh
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Undo failed');
    }
  }, []);

  const redo = useCallback(async () => {
    try {
      await api.redo();
      // WebSocket will trigger refresh
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Redo failed');
    }
  }, []);

  // --- Node Operations ---

  const addNode = useCallback(async (request: CreateNodeRequest = {}) => {
    try {
      const result = await api.createNode(request);
      // WebSocket will trigger refresh
      return result.node;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add node');
      throw e;
    }
  }, []);

  const updateNode = useCallback(async (nodeId: string, request: UpdateNodeRequest) => {
    try {
      await api.updateNode(nodeId, request);
      // WebSocket will trigger refresh
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update node');
    }
  }, []);

  // Move multiple nodes at once (for group drag)
  const moveNodes = useCallback(async (moves: Array<{ nodeId: string; x: number; y: number }>) => {
    try {
      // Update all nodes in parallel
      await Promise.all(
        moves.map(move => api.updateNode(move.nodeId, { x: move.x, y: move.y }))
      );
      // WebSocket will trigger refresh
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to move nodes');
    }
  }, []);

  const deleteNode = useCallback(async (nodeId: string) => {
    try {
      await api.deleteNode(nodeId);
      // Remove deleted node from selection
      if (selection.selectedNodeIds.includes(nodeId)) {
        setSelection(prev => ({
          ...prev,
          selectedNodeIds: prev.selectedNodeIds.filter(id => id !== nodeId),
        }));
      }
      // WebSocket will trigger refresh
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete node');
    }
  }, [selection.selectedNodeIds]);

  const resizeNode = useCallback(async (nodeId: string, width: number, height: number) => {
    try {
      await api.updateNode(nodeId, { width, height });
      // WebSocket will trigger refresh
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resize node');
    }
  }, []);

  const rotateNode = useCallback(async (nodeId: string, rotation: number) => {
    try {
      await api.updateNode(nodeId, { rotation });
      // WebSocket will trigger refresh
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rotate node');
    }
  }, []);

  // --- Edge Operations ---

  const addEdge = useCallback(async (request: CreateEdgeRequest) => {
    try {
      const result = await api.createEdge(request);
      // WebSocket will trigger refresh
      return result.edge;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add edge');
      throw e;
    }
  }, []);

  const updateEdge = useCallback(async (edgeId: string, request: UpdateEdgeRequest) => {
    try {
      await api.updateEdge(edgeId, request);
      // WebSocket will trigger refresh
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update edge');
    }
  }, []);

  const deleteEdge = useCallback(async (edgeId: string) => {
    try {
      await api.deleteEdge(edgeId);
      // Clear selection if deleted edge was selected
      if (selection.selectedEdgeId === edgeId) {
        setSelection({ selectedNodeIds: [], selectedEdgeId: null });
      }
      // WebSocket will trigger refresh
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete edge');
    }
  }, [selection.selectedEdgeId]);

  // --- Selection ---

  // Select a single node (replaces selection unless shift is held)
  const selectNode = useCallback((nodeId: string | null, addToSelection = false) => {
    if (nodeId === null) {
      setSelection({ selectedNodeIds: [], selectedEdgeId: null });
    } else if (addToSelection) {
      // Toggle node in/out of selection
      setSelection(prev => {
        const isSelected = prev.selectedNodeIds.includes(nodeId);
        return {
          selectedNodeIds: isSelected
            ? prev.selectedNodeIds.filter(id => id !== nodeId)
            : [...prev.selectedNodeIds, nodeId],
          selectedEdgeId: null,
        };
      });
    } else {
      // Replace selection with this node
      setSelection({ selectedNodeIds: [nodeId], selectedEdgeId: null });
    }
    // Exit connection mode when selecting
    setConnection({ isConnecting: false, sourceNodeId: null, sourceSide: null });
  }, []);

  // Select multiple nodes at once (from selection box)
  const selectNodes = useCallback((nodeIds: string[]) => {
    setSelection({ selectedNodeIds: nodeIds, selectedEdgeId: null });
    setConnection({ isConnecting: false, sourceNodeId: null, sourceSide: null });
  }, []);

  const selectEdge = useCallback((edgeId: string | null) => {
    setSelection({ selectedNodeIds: [], selectedEdgeId: edgeId });
    setConnection({ isConnecting: false, sourceNodeId: null, sourceSide: null });
  }, []);

  const clearSelection = useCallback(() => {
    setSelection({ selectedNodeIds: [], selectedEdgeId: null });
    setConnection({ isConnecting: false, sourceNodeId: null, sourceSide: null });
  }, []);

  // --- Copy/Paste ---

  // Copy selected nodes to clipboard
  const copySelectedNodes = useCallback(() => {
    if (!state.diagram || selection.selectedNodeIds.length === 0) return;
    const nodesToCopy = state.diagram.nodes.filter(n => selection.selectedNodeIds.includes(n.id));
    setClipboard(nodesToCopy);
  }, [state.diagram, selection.selectedNodeIds]);

  // Paste nodes from clipboard (offset by 20px)
  const pasteNodes = useCallback(async () => {
    if (clipboard.length === 0) return;

    const PASTE_OFFSET = 20;
    const newNodeIds: string[] = [];

    try {
      for (const node of clipboard) {
        const result = await api.createNode({
          label: node.label,
          type: node.type,
          shape: node.shape,
          color: node.color,
          x: node.x + PASTE_OFFSET,
          y: node.y + PASTE_OFFSET,
          width: node.width,
          height: node.height,
          tags: [...node.tags],
          description: node.description,
          border_style: node.border_style,
          fill_opacity: node.fill_opacity,
          z_index: node.z_index,
        });
        newNodeIds.push(result.node.id);
      }

      // Select the newly pasted nodes
      setSelection({ selectedNodeIds: newNodeIds, selectedEdgeId: null });

      // Update clipboard positions for next paste
      setClipboard(prev => prev.map(n => ({ ...n, x: n.x + PASTE_OFFSET, y: n.y + PASTE_OFFSET })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to paste nodes');
    }
  }, [clipboard]);

  // --- Connection Mode (for creating edges) ---

  const startConnection = useCallback((sourceNodeId: string, sourceSide: ConnectionSide) => {
    setConnection({ isConnecting: true, sourceNodeId, sourceSide });
    setSelection({ selectedNodeIds: [sourceNodeId], selectedEdgeId: null });
  }, []);

  const cancelConnection = useCallback(() => {
    setConnection({ isConnecting: false, sourceNodeId: null, sourceSide: null });
  }, []);

  const completeConnection = useCallback(async (targetNodeId: string, targetSide: ConnectionSide) => {
    if (!connection.sourceNodeId || connection.sourceNodeId === targetNodeId) {
      setConnection({ isConnecting: false, sourceNodeId: null, sourceSide: null });
      return;
    }

    try {
      await addEdge({
        source: connection.sourceNodeId,
        target: targetNodeId,
        source_side: connection.sourceSide || undefined,
        target_side: targetSide,
        label: '',
      });
    } finally {
      setConnection({ isConnecting: false, sourceNodeId: null, sourceSide: null });
    }
  }, [connection.sourceNodeId, connection.sourceSide, addEdge]);

  // --- Helpers ---

  // Returns the first selected node (for SidePanel - only shows one at a time)
  const getSelectedNode = useCallback((): DiagramNode | null => {
    if (!state.diagram || selection.selectedNodeIds.length === 0) return null;
    // Return first selected node
    return state.diagram.nodes.find(n => n.id === selection.selectedNodeIds[0]) ?? null;
  }, [state.diagram, selection.selectedNodeIds]);

  // Returns all selected nodes
  const getSelectedNodes = useCallback((): DiagramNode[] => {
    if (!state.diagram) return [];
    return state.diagram.nodes.filter(n => selection.selectedNodeIds.includes(n.id));
  }, [state.diagram, selection.selectedNodeIds]);

  const getSelectedEdge = useCallback((): DiagramEdge | null => {
    if (!state.diagram || !selection.selectedEdgeId) return null;
    return state.diagram.edges.find(e => e.id === selection.selectedEdgeId) ?? null;
  }, [state.diagram, selection.selectedEdgeId]);

  return {
    // State
    diagram: state.diagram,
    filePath: state.file_path,
    isDirty: state.is_dirty,
    canUndo: state.can_undo,
    canRedo: state.can_redo,
    loading,
    error,
    isConnected,
    selection,
    connection,

    // File operations
    newDiagram,
    openDiagram,
    saveDiagram,
    updateDiagramName,

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
    addEdge,
    updateEdge,
    deleteEdge,

    // Selection
    selectNode,
    selectNodes,
    selectEdge,
    clearSelection,
    getSelectedNode,
    getSelectedNodes,
    getSelectedEdge,

    // Copy/paste
    copySelectedNodes,
    pasteNodes,
    hasClipboard: clipboard.length > 0,

    // Connection mode
    startConnection,
    cancelConnection,
    completeConnection,

    // Utils
    refresh,
    clearError: () => setError(null),
  };
}
