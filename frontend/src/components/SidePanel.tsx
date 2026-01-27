/**
 * SidePanel component - property editor for nodes and edges.
 *
 * When a node is selected: edit label, color, shape, type, tags, description
 * When an edge is selected: edit label
 * When nothing is selected: show diagram info or empty state
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { DiagramNode, DiagramEdge, NodeShape, NodeType, BorderStyle, EdgeStyle, ArrowType, UpdateEdgeRequest } from '../types/diagram';

interface SidePanelProps {
  selectedNode: DiagramNode | null;
  selectedEdge: DiagramEdge | null;
  onUpdateNode: (nodeId: string, updates: Partial<DiagramNode>) => void;
  onUpdateEdge: (edgeId: string, updates: UpdateEdgeRequest) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
}

const SHAPES: { value: NodeShape; label: string }[] = [
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'pill', label: 'Pill' },
  { value: 'arrow', label: 'Arrow' },
  { value: 'triangle', label: 'Triangle' },
];

const TYPES: { value: NodeType; label: string }[] = [
  { value: 'component', label: 'Component' },
  { value: 'service', label: 'Service' },
  { value: 'database', label: 'Database' },
  { value: 'user', label: 'User' },
  { value: 'external', label: 'External' },
  { value: 'process', label: 'Process' },
  { value: 'decision', label: 'Decision' },
  { value: 'note', label: 'Note' },
  { value: 'zone', label: 'Zone (Container)' },
];

const BORDER_STYLES: { value: BorderStyle; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
];

const EDGE_STYLES: { value: EdgeStyle; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
];

const ARROW_TYPES: { value: ArrowType; label: string }[] = [
  { value: 'filled', label: 'Arrow (Filled)' },
  { value: 'arrow', label: 'Arrow (Open)' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'circle', label: 'Circle' },
  { value: 'none', label: 'None' },
];

const PRESET_COLORS = [
  '#3478f6', // Blue
  '#34c759', // Green
  '#ff9500', // Orange
  '#ff3b30', // Red
  '#af52de', // Purple
  '#5856d6', // Indigo
  '#00c7be', // Teal
  '#ff2d55', // Pink
  '#8e8e93', // Gray
];

export function SidePanel({
  selectedNode,
  selectedEdge,
  onUpdateNode,
  onUpdateEdge,
  onDeleteNode,
  onDeleteEdge,
}: SidePanelProps) {
  // Node editing
  if (selectedNode) {
    return (
      <NodeEditor
        node={selectedNode}
        onUpdate={(updates) => onUpdateNode(selectedNode.id, updates)}
        onDelete={() => onDeleteNode(selectedNode.id)}
      />
    );
  }

  // Edge editing
  if (selectedEdge) {
    return (
      <EdgeEditor
        edge={selectedEdge}
        onUpdate={(updates) => onUpdateEdge(selectedEdge.id, updates)}
        onDelete={() => onDeleteEdge(selectedEdge.id)}
      />
    );
  }

  // Empty state
  return (
    <div className="side-panel">
      <div className="side-panel-header">
        <h2>Properties</h2>
      </div>
      <div className="side-panel-content">
        <div className="empty-state">
          <p>Select a node or edge to edit its properties.</p>
          <p>Double-click on canvas to create a new node.</p>
        </div>
      </div>
    </div>
  );
}

// --- Node Editor ---

interface NodeEditorProps {
  node: DiagramNode;
  onUpdate: (updates: Partial<DiagramNode>) => void;
  onDelete: () => void;
}

function NodeEditor({ node, onUpdate, onDelete }: NodeEditorProps) {
  const [label, setLabel] = useState(node.label);
  const [color, setColor] = useState(node.color);
  const [description, setDescription] = useState(node.description);
  const [tagInput, setTagInput] = useState('');
  const [width, setWidth] = useState(node.width);
  const [height, setHeight] = useState(node.height);
  const [fillOpacity, setFillOpacity] = useState(node.fill_opacity ?? 1);
  const [rotation, setRotation] = useState(node.rotation ?? 0);

  // Ref to track node ID - prevents blur handlers from updating wrong node
  const nodeIdRef = useRef(node.id);
  useEffect(() => {
    nodeIdRef.current = node.id;
  }, [node.id]);

  // Sync local state when node changes
  useEffect(() => {
    setLabel(node.label);
    setColor(node.color);
    setDescription(node.description);
    setWidth(node.width);
    setHeight(node.height);
    setFillOpacity(node.fill_opacity ?? 1);
    setRotation(node.rotation ?? 0);
  }, [node.id, node.label, node.color, node.description, node.width, node.height, node.fill_opacity, node.rotation]);

  const handleLabelBlur = useCallback(() => {
    // Only update if we're still editing the same node
    if (nodeIdRef.current !== node.id) return;
    if (label !== node.label) {
      onUpdate({ label });
    }
  }, [label, node.id, node.label, onUpdate]);

  const handleColorChange = useCallback((newColor: string) => {
    setColor(newColor);
    onUpdate({ color: newColor });
  }, [onUpdate]);

  const handleShapeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdate({ shape: e.target.value as NodeShape });
  }, [onUpdate]);

  const handleTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value as NodeType;
    // If changing to zone, set some defaults for zone styling
    if (newType === 'zone') {
      onUpdate({ type: newType, fill_opacity: 0.15, border_style: 'dashed', z_index: -10 });
      setFillOpacity(0.15);
    } else {
      onUpdate({ type: newType });
    }
  }, [onUpdate]);

  const handleDescriptionBlur = useCallback(() => {
    // Only update if we're still editing the same node
    if (nodeIdRef.current !== node.id) return;
    if (description !== node.description) {
      onUpdate({ description });
    }
  }, [description, node.id, node.description, onUpdate]);

  const handleAddTag = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      const newTag = tagInput.trim().toLowerCase();
      if (!node.tags.includes(newTag)) {
        onUpdate({ tags: [...node.tags, newTag] });
      }
      setTagInput('');
    }
  }, [tagInput, node.tags, onUpdate]);

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    onUpdate({ tags: node.tags.filter(t => t !== tagToRemove) });
  }, [node.tags, onUpdate]);

  // Size handlers (commit on blur)
  const handleWidthBlur = useCallback(() => {
    if (nodeIdRef.current !== node.id) return;
    const newWidth = Math.max(60, width);
    if (newWidth !== node.width) {
      onUpdate({ width: newWidth });
    }
  }, [width, node.id, node.width, onUpdate]);

  const handleHeightBlur = useCallback(() => {
    if (nodeIdRef.current !== node.id) return;
    const newHeight = Math.max(40, height);
    if (newHeight !== node.height) {
      onUpdate({ height: newHeight });
    }
  }, [height, node.id, node.height, onUpdate]);

  // Border style handler
  const handleBorderStyleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdate({ border_style: e.target.value as BorderStyle });
  }, [onUpdate]);

  // Fill opacity handler
  const handleFillOpacityChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newOpacity = parseFloat(e.target.value);
    setFillOpacity(newOpacity);
  }, []);

  const handleFillOpacityCommit = useCallback(() => {
    if (nodeIdRef.current !== node.id) return;
    if (fillOpacity !== (node.fill_opacity ?? 1)) {
      onUpdate({ fill_opacity: fillOpacity });
    }
  }, [fillOpacity, node.id, node.fill_opacity, onUpdate]);

  // Rotation handler - commits immediately on change for real-time feedback
  const handleRotationChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newRotation = parseInt(e.target.value) || 0;
    const normalizedRotation = ((newRotation % 360) + 360) % 360;  // Normalize to 0-359
    setRotation(normalizedRotation);
    // Commit immediately for slider (real-time rotation)
    if (nodeIdRef.current === node.id) {
      onUpdate({ rotation: normalizedRotation });
    }
  }, [node.id, onUpdate]);

  // For number input, commit on blur
  const handleRotationBlur = useCallback(() => {
    if (nodeIdRef.current !== node.id) return;
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    if (normalizedRotation !== (node.rotation ?? 0)) {
      onUpdate({ rotation: normalizedRotation });
    }
  }, [rotation, node.id, node.rotation, onUpdate]);

  // Z-index handlers (keep within -10 to 100 range)
  const MIN_Z_INDEX = -10;  // Floor for zones to sit behind normal nodes
  const MAX_Z_INDEX = 100;

  const handleSendBackward = useCallback(() => {
    const currentZ = node.z_index ?? 0;
    onUpdate({ z_index: Math.max(MIN_Z_INDEX, currentZ - 1) });
  }, [node.z_index, onUpdate]);

  const handleBringForward = useCallback(() => {
    const currentZ = node.z_index ?? 0;
    onUpdate({ z_index: Math.min(MAX_Z_INDEX, currentZ + 1) });
  }, [node.z_index, onUpdate]);

  const handleSendToBack = useCallback(() => {
    onUpdate({ z_index: MIN_Z_INDEX });
  }, [onUpdate]);

  const handleBringToFront = useCallback(() => {
    onUpdate({ z_index: MAX_Z_INDEX });
  }, [onUpdate]);

  return (
    <div className="side-panel">
      <div className="side-panel-header">
        <h2>Node Properties</h2>
      </div>
      <div className="side-panel-content">
        {/* Label */}
        <div className="form-group">
          <label>Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleLabelBlur}
            onKeyDown={(e) => e.key === 'Enter' && handleLabelBlur()}
          />
        </div>

        {/* Shape */}
        <div className="form-group">
          <label>Shape</label>
          <select value={node.shape} onChange={handleShapeChange}>
            {SHAPES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Type */}
        <div className="form-group">
          <label>Type</label>
          <select value={node.type} onChange={handleTypeChange}>
            {TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Size */}
        <div className="form-group">
          <label>Size</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <input
                type="number"
                value={width}
                onChange={(e) => setWidth(parseInt(e.target.value) || 60)}
                onBlur={handleWidthBlur}
                onKeyDown={(e) => e.key === 'Enter' && handleWidthBlur()}
                min={60}
                step={20}
                style={{ width: '100%' }}
              />
              <span style={{ fontSize: 10, color: '#969696' }}>Width</span>
            </div>
            <div style={{ flex: 1 }}>
              <input
                type="number"
                value={height}
                onChange={(e) => setHeight(parseInt(e.target.value) || 40)}
                onBlur={handleHeightBlur}
                onKeyDown={(e) => e.key === 'Enter' && handleHeightBlur()}
                min={40}
                step={20}
                style={{ width: '100%' }}
              />
              <span style={{ fontSize: 10, color: '#969696' }}>Height</span>
            </div>
          </div>
        </div>

        {/* Rotation */}
        <div className="form-group">
          <label>Rotation: {rotation}°</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="range"
              min="0"
              max="360"
              step="15"
              value={rotation}
              onChange={handleRotationChange}
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min="0"
              max="360"
              value={rotation}
              onChange={handleRotationChange}
              onBlur={handleRotationBlur}
              onKeyDown={(e) => e.key === 'Enter' && handleRotationBlur()}
              style={{ width: 60 }}
            />
          </div>
        </div>

        {/* Color */}
        <div className="form-group">
          <label>Color</label>
          <div className="color-input-wrapper">
            <input
              type="color"
              value={color}
              onChange={(e) => handleColorChange(e.target.value)}
            />
            <input
              type="text"
              value={color}
              onChange={(e) => handleColorChange(e.target.value)}
              pattern="^#[0-9A-Fa-f]{6}$"
            />
          </div>
          {/* Color presets */}
          <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => handleColorChange(c)}
                style={{
                  width: 24,
                  height: 24,
                  backgroundColor: c,
                  border: c === color ? '2px solid white' : '2px solid transparent',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </div>

        {/* Border Style */}
        <div className="form-group">
          <label>Border Style</label>
          <select value={node.border_style ?? 'solid'} onChange={handleBorderStyleChange}>
            {BORDER_STYLES.map(b => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        </div>

        {/* Fill Opacity */}
        <div className="form-group">
          <label>Fill Opacity: {Math.round(fillOpacity * 100)}%</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={fillOpacity}
            onChange={handleFillOpacityChange}
            onMouseUp={handleFillOpacityCommit}
            onTouchEnd={handleFillOpacityCommit}
            style={{ width: '100%' }}
          />
        </div>

        {/* Z-Index / Layer Controls */}
        <div className="form-group">
          <label>Layer (z-index: {node.z_index ?? 0})</label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button
              onClick={handleSendToBack}
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: 11,
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Send to Back
            </button>
            <button
              onClick={handleSendBackward}
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: 11,
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Send Backward
            </button>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            <button
              onClick={handleBringForward}
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: 11,
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Bring Forward
            </button>
            <button
              onClick={handleBringToFront}
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: 11,
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Bring to Front
            </button>
          </div>
        </div>

        {/* Tags */}
        <div className="form-group">
          <label>Tags</label>
          <div className="tags-input">
            {node.tags.map(tag => (
              <span key={tag} className="tag">
                {tag}
                <button onClick={() => handleRemoveTag(tag)}>&times;</button>
              </span>
            ))}
            <input
              type="text"
              placeholder="Add tag..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
            />
          </div>
        </div>

        {/* Description */}
        <div className="form-group">
          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={handleDescriptionBlur}
            placeholder="Optional description..."
          />
        </div>

        {/* Delete */}
        <button className="delete-button" onClick={onDelete}>
          Delete Node
        </button>
      </div>
    </div>
  );
}

// --- Edge Editor ---

interface EdgeEditorProps {
  edge: DiagramEdge;
  onUpdate: (updates: UpdateEdgeRequest) => void;
  onDelete: () => void;
}

function EdgeEditor({ edge, onUpdate, onDelete }: EdgeEditorProps) {
  const [label, setLabel] = useState(edge.label);
  const [color, setColor] = useState(edge.color ?? '#666666');
  const [width, setWidth] = useState(edge.width ?? 2);
  const [arrowSize, setArrowSize] = useState(edge.arrow_size ?? 12);

  // Ref to track edge ID - prevents blur handlers from updating wrong edge
  const edgeIdRef = useRef(edge.id);
  useEffect(() => {
    edgeIdRef.current = edge.id;
  }, [edge.id]);

  useEffect(() => {
    setLabel(edge.label);
    setColor(edge.color ?? '#666666');
    setWidth(edge.width ?? 2);
    setArrowSize(edge.arrow_size ?? 12);
  }, [edge.id, edge.label, edge.color, edge.width, edge.arrow_size]);

  const handleLabelBlur = useCallback(() => {
    if (edgeIdRef.current !== edge.id) return;
    if (label !== edge.label) {
      onUpdate({ label });
    }
  }, [label, edge.id, edge.label, onUpdate]);

  const handleColorChange = useCallback((newColor: string) => {
    setColor(newColor);
    onUpdate({ color: newColor });
  }, [onUpdate]);

  // Line width - commit immediately on change for real-time feedback
  const handleWidthChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newWidth = Math.max(1, Math.min(10, parseInt(e.target.value) || 2));
    setWidth(newWidth);
    if (edgeIdRef.current === edge.id) {
      onUpdate({ width: newWidth });
    }
  }, [edge.id, onUpdate]);

  // Arrow size - commit immediately on change for real-time feedback
  const handleArrowSizeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = Math.max(4, Math.min(30, parseInt(e.target.value) || 12));
    setArrowSize(newSize);
    if (edgeIdRef.current === edge.id) {
      onUpdate({ arrow_size: newSize });
    }
  }, [edge.id, onUpdate]);

  const handleStyleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdate({ style: e.target.value as EdgeStyle });
  }, [onUpdate]);

  const handleArrowStartChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdate({ arrow_start: e.target.value as ArrowType });
  }, [onUpdate]);

  const handleArrowEndChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdate({ arrow_end: e.target.value as ArrowType });
  }, [onUpdate]);

  return (
    <div className="side-panel">
      <div className="side-panel-header">
        <h2>Edge Properties</h2>
      </div>
      <div className="side-panel-content">
        {/* Label */}
        <div className="form-group">
          <label>Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleLabelBlur}
            onKeyDown={(e) => e.key === 'Enter' && handleLabelBlur()}
            placeholder="Optional label..."
          />
        </div>

        {/* Line Style */}
        <div className="form-group">
          <label>Line Style</label>
          <select value={edge.style ?? 'solid'} onChange={handleStyleChange}>
            {EDGE_STYLES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Line Width */}
        <div className="form-group">
          <label>Line Width: {width}px</label>
          <input
            type="range"
            min="1"
            max="10"
            value={width}
            onChange={handleWidthChange}
            style={{ width: '100%' }}
          />
        </div>

        {/* Color */}
        <div className="form-group">
          <label>Color</label>
          <div className="color-input-wrapper">
            <input
              type="color"
              value={color}
              onChange={(e) => handleColorChange(e.target.value)}
            />
            <input
              type="text"
              value={color}
              onChange={(e) => handleColorChange(e.target.value)}
              pattern="^#[0-9A-Fa-f]{6}$"
            />
          </div>
          {/* Color presets */}
          <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => handleColorChange(c)}
                style={{
                  width: 24,
                  height: 24,
                  backgroundColor: c,
                  border: c === color ? '2px solid white' : '2px solid transparent',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </div>

        {/* Arrow Start */}
        <div className="form-group">
          <label>Arrow Start (Source)</label>
          <select value={edge.arrow_start ?? 'none'} onChange={handleArrowStartChange}>
            {ARROW_TYPES.map(a => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>

        {/* Arrow End */}
        <div className="form-group">
          <label>Arrow End (Target)</label>
          <select value={edge.arrow_end ?? 'filled'} onChange={handleArrowEndChange}>
            {ARROW_TYPES.map(a => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>

        {/* Arrow Size */}
        <div className="form-group">
          <label>Arrow Size: {arrowSize}px</label>
          <input
            type="range"
            min="4"
            max="30"
            value={arrowSize}
            onChange={handleArrowSizeChange}
            style={{ width: '100%' }}
          />
        </div>

        {/* Connection info */}
        <div className="form-group">
          <label>Connection</label>
          <p style={{ fontSize: 12, color: '#969696', margin: 0 }}>
            Source: {edge.source}<br />
            Target: {edge.target}
          </p>
        </div>

        {/* Delete */}
        <button className="delete-button" onClick={onDelete}>
          Delete Edge
        </button>
      </div>
    </div>
  );
}
