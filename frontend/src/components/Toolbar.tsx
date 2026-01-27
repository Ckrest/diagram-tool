/**
 * Toolbar component - file menu, undo/redo, and add node button.
 *
 * The file menu provides New, Open, Save, and Save As operations.
 * File paths are entered via a simple modal (in a real app, you'd use
 * the native file picker via Electron or a file input).
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { validateDiagram } from '../api/diagramApi';
import type { ValidationResult } from '../api/diagramApi';
import { exportToSVG, exportToPNG, downloadFile } from '../utils/export';
import type { Diagram } from '../types/diagram';

interface DiagramNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ToolbarProps {
  diagramName: string | null;
  filePath: string | null;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isConnected: boolean;
  nodes: DiagramNode[];  // For calculating print bounds
  diagram: Diagram | null;  // Full diagram for export
  // Zoom controls
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomFit: () => void;
  // Grid controls
  showGrid: boolean;
  gridSize: number;
  onToggleGrid: () => void;
  onSetGridSize: (size: number) => void;
  // Selection info for multi-select toolbar
  selectedCount: number;
  onAlignNodes: (alignment: string) => void;
  onDistributeNodes: (axis: string) => void;
  // Auto-layout
  onAutoLayout: (strategy: 'grid' | 'tree' | 'force') => void;
  // File operations
  onNewDiagram: (name: string) => void;
  onOpenDiagram: (path: string) => void;
  onSaveDiagram: () => void;
  onSaveAsDiagram: (path: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onAddNode: () => void;
}

export function Toolbar({
  diagramName,
  filePath,
  isDirty,
  canUndo,
  canRedo,
  isConnected,
  nodes,
  diagram,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onZoomFit,
  showGrid,
  gridSize,
  onToggleGrid,
  onSetGridSize,
  selectedCount,
  onAlignNodes,
  onDistributeNodes,
  onAutoLayout,
  onNewDiagram,
  onOpenDiagram,
  onSaveDiagram,
  onSaveAsDiagram,
  onUndo,
  onRedo,
  onAddNode,
}: ToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<'new' | 'open' | 'saveAs' | 'validation' | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Handle validation
  const handleValidate = useCallback(async () => {
    setValidating(true);
    try {
      const result = await validateDiagram();
      setValidationResult(result);
      setModal('validation');
    } catch (err) {
      console.error('Validation failed:', err);
    } finally {
      setValidating(false);
    }
  }, []);

  // Export handlers
  const handleExportSVG = useCallback(() => {
    if (!diagram) return;
    setMenuOpen(false);
    const svg = exportToSVG(diagram);
    const filename = `${diagramName || 'diagram'}.svg`;
    downloadFile(svg, filename, 'image/svg+xml');
  }, [diagram, diagramName]);

  const handleExportPNG = useCallback(async () => {
    if (!diagram) return;
    setMenuOpen(false);
    try {
      const blob = await exportToPNG(diagram);
      const filename = `${diagramName || 'diagram'}.png`;
      downloadFile(blob, filename, 'image/png');
    } catch (err) {
      console.error('PNG export failed:', err);
    }
  }, [diagram, diagramName]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + key shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'n':
            e.preventDefault();
            setModal('new');
            break;
          case 'o':
            e.preventDefault();
            setModal('open');
            break;
          case 's':
            e.preventDefault();
            if (e.shiftKey) {
              setModal('saveAs');
            } else if (filePath) {
              onSaveDiagram();
            } else {
              setModal('saveAs');
            }
            break;
          case 'z':
            e.preventDefault();
            if (e.shiftKey) {
              onRedo();
            } else {
              onUndo();
            }
            break;
          case 'y':
            e.preventDefault();
            onRedo();
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [filePath, onSaveDiagram, onUndo, onRedo]);

  const handleSave = useCallback(() => {
    setMenuOpen(false);
    if (filePath) {
      onSaveDiagram();
    } else {
      setModal('saveAs');
    }
  }, [filePath, onSaveDiagram]);

  // Calculate diagram bounds for PDF export
  const diagramBounds = useMemo(() => {
    if (nodes.length === 0) {
      return { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600 };
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const node of nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }

    // Add padding
    const PADDING = 40;
    minX = Math.max(0, minX - PADDING);
    minY = Math.max(0, minY - PADDING);
    maxX += PADDING;
    maxY += PADDING;

    return {
      minX, minY, maxX, maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }, [nodes]);

  // Handle print/PDF export with proper sizing
  const handlePrint = useCallback(() => {
    setMenuOpen(false);

    const { minX, minY, width, height } = diagramBounds;

    // Create dynamic print styles
    const printStyleId = 'diagram-print-styles';
    let styleEl = document.getElementById(printStyleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = printStyleId;
      document.head.appendChild(styleEl);
    }

    // Calculate scale to fit on a page (assume letter size 8.5x11 minus margins ~7.5x10 inches at 96 DPI)
    const pageWidth = 720;  // ~7.5 inches at 96 DPI
    const pageHeight = 960; // ~10 inches at 96 DPI
    const scale = Math.min(pageWidth / width, pageHeight / height, 1);

    styleEl.textContent = `
      @media print {
        @page {
          size: auto;
          margin: 0.5in;
        }

        .canvas {
          min-width: auto !important;
          min-height: auto !important;
          width: ${width}px !important;
          height: ${height}px !important;
          transform: translate(${-minX}px, ${-minY}px) scale(${scale});
          transform-origin: top left;
        }

        .canvas-container {
          width: ${width * scale}px !important;
          height: ${height * scale}px !important;
          overflow: hidden !important;
        }
      }
    `;

    // Small delay to ensure styles are applied
    setTimeout(() => {
      window.print();
    }, 50);
  }, [diagramBounds]);

  return (
    <>
      <div className="toolbar">
        {/* File Menu */}
        <div className="toolbar-group">
          <div className="file-menu" ref={menuRef}>
            <button onClick={() => setMenuOpen(!menuOpen)}>
              File ▾
            </button>
            {menuOpen && (
              <div className="file-menu-dropdown">
                <button
                  className="file-menu-item"
                  onClick={() => { setMenuOpen(false); setModal('new'); }}
                >
                  <span>New</span>
                  <span className="shortcut">Ctrl+N</span>
                </button>
                <button
                  className="file-menu-item"
                  onClick={() => { setMenuOpen(false); setModal('open'); }}
                >
                  <span>Open...</span>
                  <span className="shortcut">Ctrl+O</span>
                </button>
                <div className="file-menu-divider" />
                <button
                  className="file-menu-item"
                  onClick={handleSave}
                  disabled={!diagramName}
                >
                  <span>Save</span>
                  <span className="shortcut">Ctrl+S</span>
                </button>
                <button
                  className="file-menu-item"
                  onClick={() => { setMenuOpen(false); setModal('saveAs'); }}
                  disabled={!diagramName}
                >
                  <span>Save As...</span>
                  <span className="shortcut">Ctrl+Shift+S</span>
                </button>
                <div className="file-menu-divider" />
                <button
                  className="file-menu-item"
                  onClick={handlePrint}
                  disabled={!diagramName}
                >
                  <span>Export PDF...</span>
                  <span className="shortcut">Ctrl+P</span>
                </button>
                <button
                  className="file-menu-item"
                  onClick={handleExportSVG}
                  disabled={!diagramName}
                >
                  <span>Export SVG</span>
                </button>
                <button
                  className="file-menu-item"
                  onClick={handleExportPNG}
                  disabled={!diagramName}
                >
                  <span>Export PNG</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Edit Operations */}
        <div className="toolbar-group">
          <button onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            ↩ Undo
          </button>
          <button onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">
            ↪ Redo
          </button>
        </div>

        {/* Add Node */}
        <div className="toolbar-group">
          <button onClick={onAddNode} disabled={!diagramName} title="Add a new node">
            + Add Node
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="toolbar-group">
          <button onClick={onZoomOut} disabled={!diagramName || zoom <= 0.25} title="Zoom Out">
            −
          </button>
          <span className="zoom-level" title="Current zoom level">
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={onZoomIn} disabled={!diagramName || zoom >= 2} title="Zoom In">
            +
          </button>
          <button onClick={onZoomReset} disabled={!diagramName || zoom === 1} title="Reset Zoom (100%)">
            ⟲
          </button>
          <button onClick={onZoomFit} disabled={!diagramName || nodes.length === 0} title="Fit to Screen">
            ⤢
          </button>
        </div>

        {/* Grid Controls */}
        <div className="toolbar-group">
          <button
            onClick={onToggleGrid}
            disabled={!diagramName}
            className={showGrid ? 'active' : ''}
            title={showGrid ? 'Hide Grid' : 'Show Grid'}
          >
            ▦ Grid
          </button>
          <select
            value={gridSize}
            onChange={(e) => onSetGridSize(Number(e.target.value))}
            disabled={!diagramName}
            title="Grid Size"
            className="grid-size-select"
          >
            <option value="10">10px</option>
            <option value="20">20px</option>
            <option value="40">40px</option>
            <option value="80">80px</option>
          </select>
        </div>

        {/* Auto-Layout */}
        <div className="toolbar-group">
          <select
            onChange={(e) => {
              if (e.target.value) {
                onAutoLayout(e.target.value as 'grid' | 'tree' | 'force');
                e.target.value = '';  // Reset to placeholder
              }
            }}
            disabled={!diagramName || nodes.length === 0}
            title="Auto-arrange all nodes"
            className="layout-select"
            defaultValue=""
          >
            <option value="" disabled>⚡ Layout</option>
            <option value="grid">Grid Layout</option>
            <option value="tree">Tree Layout</option>
            <option value="force">Force-Directed</option>
          </select>
        </div>

        {/* Validation */}
        <div className="toolbar-group">
          <button
            onClick={handleValidate}
            disabled={!diagramName || validating}
            title="Check diagram for issues"
          >
            {validating ? '⏳' : '✓'} Validate
          </button>
        </div>

        {/* Multi-select Actions (only show when multiple nodes selected) */}
        {selectedCount >= 2 && (
          <div className="toolbar-group selection-actions">
            <span className="selection-count">{selectedCount} selected</span>
            <button onClick={() => onAlignNodes('left')} title="Align Left">
              ⫷
            </button>
            <button onClick={() => onAlignNodes('center_h')} title="Align Center Horizontally">
              ⫿
            </button>
            <button onClick={() => onAlignNodes('right')} title="Align Right">
              ⫸
            </button>
            <button onClick={() => onAlignNodes('top')} title="Align Top">
              ⫠
            </button>
            <button onClick={() => onAlignNodes('center_v')} title="Align Center Vertically">
              ⫡
            </button>
            <button onClick={() => onAlignNodes('bottom')} title="Align Bottom">
              ⫢
            </button>
            {selectedCount >= 3 && (
              <>
                <span className="toolbar-separator">|</span>
                <button onClick={() => onDistributeNodes('horizontal')} title="Distribute Horizontally">
                  ⋯
                </button>
                <button onClick={() => onDistributeNodes('vertical')} title="Distribute Vertically">
                  ⋮
                </button>
              </>
            )}
          </div>
        )}

        {/* Status */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Dirty indicator */}
          {isDirty && <span className="dirty-indicator">● Unsaved changes</span>}

          {/* Connection status */}
          <div className="connection-status">
            <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </div>

      {/* Modals */}
      {modal === 'new' && (
        <NewDiagramModal
          onConfirm={(name) => { setModal(null); onNewDiagram(name); }}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === 'open' && (
        <OpenDiagramModal
          onConfirm={(path) => { setModal(null); onOpenDiagram(path); }}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === 'saveAs' && (
        <SaveAsModal
          currentPath={filePath}
          onConfirm={(path) => { setModal(null); onSaveAsDiagram(path); }}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === 'validation' && validationResult && (
        <ValidationModal
          result={validationResult}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

// --- Modals ---

interface NewDiagramModalProps {
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

function NewDiagramModal({ onConfirm, onCancel }: NewDiagramModalProps) {
  const [name, setName] = useState('Untitled Diagram');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(name.trim() || 'Untitled Diagram');
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>New Diagram</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Diagram Name</label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="cancel" onClick={onCancel}>Cancel</button>
            <button type="submit" className="confirm">Create</button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface OpenDiagramModalProps {
  onConfirm: (path: string) => void;
  onCancel: () => void;
}

function OpenDiagramModal({ onConfirm, onCancel }: OpenDiagramModalProps) {
  const [path, setPath] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (path.trim()) {
      onConfirm(path.trim());
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Open Diagram</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>File Path</label>
            <input
              ref={inputRef}
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/path/to/diagram.json"
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="cancel" onClick={onCancel}>Cancel</button>
            <button type="submit" className="confirm" disabled={!path.trim()}>Open</button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface SaveAsModalProps {
  currentPath: string | null;
  onConfirm: (path: string) => void;
  onCancel: () => void;
}

function SaveAsModal({ currentPath, onConfirm, onCancel }: SaveAsModalProps) {
  const [path, setPath] = useState(currentPath || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (!currentPath) {
      // Suggest a default path
      setPath('/home/nick/diagrams/diagram.json');
    }
  }, [currentPath]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (path.trim()) {
      onConfirm(path.trim());
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Save Diagram As</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Save to Path</label>
            <input
              ref={inputRef}
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/path/to/diagram.json"
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="cancel" onClick={onCancel}>Cancel</button>
            <button type="submit" className="confirm" disabled={!path.trim()}>Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Validation Modal ---

interface ValidationModalProps {
  result: ValidationResult;
  onClose: () => void;
}

function ValidationModal({ result, onClose }: ValidationModalProps) {
  const { summary, issues } = result;

  const getIssueIcon = (type: string) => {
    switch (type) {
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '•';
    }
  };

  const getIssueClass = (type: string) => {
    switch (type) {
      case 'error': return 'validation-error';
      case 'warning': return 'validation-warning';
      case 'info': return 'validation-info';
      default: return '';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal validation-modal" onClick={e => e.stopPropagation()}>
        <h3>
          {summary.valid ? '✅ Diagram Valid' : '⚠️ Validation Issues Found'}
        </h3>

        {/* Summary */}
        <div className="validation-summary">
          <span className={summary.errors > 0 ? 'has-issues' : ''}>
            {summary.errors} errors
          </span>
          <span className={summary.warnings > 0 ? 'has-issues' : ''}>
            {summary.warnings} warnings
          </span>
          <span>{summary.info} info</span>
        </div>

        {/* Issues list */}
        {issues.length > 0 ? (
          <ul className="validation-issues">
            {issues.map((issue, idx) => (
              <li key={idx} className={getIssueClass(issue.type)}>
                <span className="issue-icon">{getIssueIcon(issue.type)}</span>
                <span className="issue-message">{issue.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="no-issues">No issues found. Your diagram looks good!</p>
        )}

        <div className="modal-actions">
          <button className="confirm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
