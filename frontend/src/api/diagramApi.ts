/**
 * API client for the diagram tool backend.
 * All HTTP communication with the backend goes through here.
 */

import type {
  DiagramState,
  Diagram,
  DiagramNode,
  DiagramEdge,
  CreateNodeRequest,
  UpdateNodeRequest,
  CreateEdgeRequest,
  UpdateEdgeRequest,
} from '../types/diagram';

// Use relative URL to go through Vite proxy (same origin)
const API_BASE = '/api';

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `API error: ${response.status}`);
  }

  return response.json();
}

// --- Diagram State ---

export async function getDiagram(): Promise<DiagramState> {
  return apiRequest<DiagramState>('/diagram');
}

interface DiagramInfoUpdate {
  name?: string;
  grid_size?: number;
  show_grid?: boolean;
}

export async function updateDiagramInfo(update: DiagramInfoUpdate): Promise<{ success: boolean; diagram: Diagram }> {
  return apiRequest('/diagram', {
    method: 'PATCH',
    body: JSON.stringify(update),
  });
}

// --- File Operations ---

export async function newDiagram(name = 'Untitled Diagram'): Promise<{ success: boolean; diagram: Diagram }> {
  return apiRequest(`/diagram/new?name=${encodeURIComponent(name)}`, {
    method: 'POST',
  });
}

export async function openDiagram(filePath: string): Promise<{ success: boolean; diagram: Diagram; file_path: string }> {
  return apiRequest('/diagram/open', {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath }),
  });
}

export async function saveDiagram(filePath?: string): Promise<{ success: boolean; file_path: string }> {
  return apiRequest('/diagram/save', {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath ?? null }),
  });
}

// --- Undo/Redo ---

export async function undo(): Promise<{ success: boolean; diagram?: Diagram; message?: string }> {
  return apiRequest('/undo', { method: 'POST' });
}

export async function redo(): Promise<{ success: boolean; diagram?: Diagram; message?: string }> {
  return apiRequest('/redo', { method: 'POST' });
}

// --- Node Operations ---

export async function createNode(request: CreateNodeRequest = {}): Promise<{ success: boolean; node: DiagramNode }> {
  return apiRequest('/nodes', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getNode(nodeId: string): Promise<{ success: boolean; node: DiagramNode }> {
  return apiRequest(`/nodes/${nodeId}`);
}

export async function updateNode(
  nodeId: string,
  request: UpdateNodeRequest
): Promise<{ success: boolean; node: DiagramNode }> {
  return apiRequest(`/nodes/${nodeId}`, {
    method: 'PATCH',
    body: JSON.stringify(request),
  });
}

export async function deleteNode(nodeId: string): Promise<{ success: boolean }> {
  return apiRequest(`/nodes/${nodeId}`, { method: 'DELETE' });
}

// --- Edge Operations ---

export async function createEdge(request: CreateEdgeRequest): Promise<{ success: boolean; edge: DiagramEdge }> {
  return apiRequest('/edges', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getEdge(edgeId: string): Promise<{ success: boolean; edge: DiagramEdge }> {
  return apiRequest(`/edges/${edgeId}`);
}

export async function updateEdge(
  edgeId: string,
  request: UpdateEdgeRequest
): Promise<{ success: boolean; edge: DiagramEdge }> {
  return apiRequest(`/edges/${edgeId}`, {
    method: 'PATCH',
    body: JSON.stringify(request),
  });
}

export async function deleteEdge(edgeId: string): Promise<{ success: boolean }> {
  return apiRequest(`/edges/${edgeId}`, { method: 'DELETE' });
}

// --- Enums ---

export async function getShapes(): Promise<{ shapes: string[] }> {
  return apiRequest('/enums/shapes');
}

export async function getTypes(): Promise<{ types: string[] }> {
  return apiRequest('/enums/types');
}

// --- Layout Operations ---

export async function alignNodes(
  nodeIds: string[],
  alignment: string
): Promise<{ success: boolean }> {
  return apiRequest('/layout/align', {
    method: 'POST',
    body: JSON.stringify({ node_ids: nodeIds, alignment }),
  });
}

export async function distributeNodes(
  nodeIds: string[],
  axis: string
): Promise<{ success: boolean }> {
  return apiRequest('/layout/distribute', {
    method: 'POST',
    body: JSON.stringify({ node_ids: nodeIds, axis }),
  });
}

// --- Auto Layout ---

export async function autoLayout(
  strategy: 'grid' | 'tree' | 'force' = 'grid'
): Promise<{ success: boolean }> {
  return apiRequest('/layout/auto', {
    method: 'POST',
    body: JSON.stringify({ strategy }),
  });
}

// --- Validation ---

export interface ValidationIssue {
  type: 'error' | 'warning' | 'info';
  message: string;
  node_id?: string;
  edge_id?: string;
}

export interface ValidationSummary {
  total: number;
  errors: number;
  warnings: number;
  info: number;
  valid: boolean;
}

export interface ValidationResult {
  success: boolean;
  issues: ValidationIssue[];
  summary: ValidationSummary;
}

export async function validateDiagram(): Promise<ValidationResult> {
  return apiRequest('/diagram/validate');
}
