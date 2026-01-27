/**
 * Diagram export utilities - PNG and SVG export.
 */

import type { Diagram } from '../types/diagram';

interface ExportBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/**
 * Calculate the bounding box of a diagram with padding.
 */
export function calculateBounds(diagram: Diagram, padding = 40): ExportBounds {
  if (diagram.nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600 };
  }

  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const node of diagram.nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  // Add padding
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX += padding;
  maxY += padding;

  return {
    minX, minY, maxX, maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Calculate text color based on background brightness.
 */
function getTextColor(bgColor: string): string {
  const hex = bgColor.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? '#000000' : '#ffffff';
}

/**
 * Export diagram as SVG string.
 */
export function exportToSVG(diagram: Diagram): string {
  const bounds = calculateBounds(diagram);
  const { minX, minY, width, height } = bounds;

  // Start SVG
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="${minX} ${minY} ${width} ${height}"
     width="${width}" height="${height}">
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7"
            refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#666"/>
    </marker>
  </defs>

  <!-- Background -->
  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#1e1e1e"/>

`;

  // Draw edges first (below nodes)
  for (const edge of diagram.edges) {
    const source = diagram.nodes.find(n => n.id === edge.source);
    const target = diagram.nodes.find(n => n.id === edge.target);
    if (!source || !target) continue;

    const x1 = source.x + source.width / 2;
    const y1 = source.y + source.height / 2;
    const x2 = target.x + target.width / 2;
    const y2 = target.y + target.height / 2;

    // Bezier control points
    const dx = x2 - x1;
    const dy = y2 - y1;
    let cx1: number, cy1: number, cx2: number, cy2: number;

    if (Math.abs(dx) > Math.abs(dy)) {
      cx1 = x1 + dx * 0.25;
      cy1 = y1;
      cx2 = x2 - dx * 0.25;
      cy2 = y2;
    } else {
      cx1 = x1;
      cy1 = y1 + dy * 0.25;
      cx2 = x2;
      cy2 = y2 - dy * 0.25;
    }

    svg += `  <!-- Edge: ${edge.id} -->
  <path d="M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}"
        fill="none" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>
`;

    // Edge label
    if (edge.label) {
      const labelX = (x1 + x2) / 2;
      const labelY = (y1 + y2) / 2 - 10;
      svg += `  <text x="${labelX}" y="${labelY}" text-anchor="middle"
        fill="#999" font-family="system-ui, sans-serif" font-size="12">${escapeXml(edge.label)}</text>
`;
    }
  }

  // Draw nodes (sorted by z_index so zones render behind)
  const sortedNodesSvg = [...diagram.nodes].sort((a, b) => (a.z_index ?? 0) - (b.z_index ?? 0));
  for (const node of sortedNodesSvg) {
    const textColor = getTextColor(node.color);
    const opacity = node.fill_opacity ?? 1;
    const borderStyle = node.border_style === 'dashed' ? 'stroke-dasharray="5,5"' : '';

    svg += `  <!-- Node: ${node.label} -->
  <g>
`;

    // Node shape
    switch (node.shape) {
      case 'ellipse':
        svg += `    <ellipse cx="${node.x + node.width / 2}" cy="${node.y + node.height / 2}"
             rx="${node.width / 2}" ry="${node.height / 2}"
             fill="${node.color}" fill-opacity="${opacity}"
             stroke="${node.color}" stroke-width="2" ${borderStyle}/>
`;
        break;
      case 'diamond':
        const cx = node.x + node.width / 2;
        const cy = node.y + node.height / 2;
        svg += `    <polygon points="${cx},${node.y} ${node.x + node.width},${cy} ${cx},${node.y + node.height} ${node.x},${cy}"
             fill="${node.color}" fill-opacity="${opacity}"
             stroke="${node.color}" stroke-width="2" ${borderStyle}/>
`;
        break;
      case 'pill':
        const radius = Math.min(node.width, node.height) / 2;
        svg += `    <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"
             rx="${radius}" ry="${radius}"
             fill="${node.color}" fill-opacity="${opacity}"
             stroke="${node.color}" stroke-width="2" ${borderStyle}/>
`;
        break;
      default: // rectangle
        svg += `    <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"
             rx="4" ry="4"
             fill="${node.color}" fill-opacity="${opacity}"
             stroke="${node.color}" stroke-width="2" ${borderStyle}/>
`;
    }

    // Node label
    svg += `    <text x="${node.x + node.width / 2}" y="${node.y + node.height / 2}"
          text-anchor="middle" dominant-baseline="middle"
          fill="${opacity < 0.5 ? node.color : textColor}"
          font-family="system-ui, sans-serif" font-size="14" font-weight="500">${escapeXml(node.label)}</text>
  </g>
`;
  }

  svg += `</svg>`;
  return svg;
}

/**
 * Export diagram as PNG using Canvas.
 */
export async function exportToPNG(diagram: Diagram, scale = 2): Promise<Blob> {
  const bounds = calculateBounds(diagram);
  const { minX, minY, width, height } = bounds;

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;

  // Scale for retina
  ctx.scale(scale, scale);
  ctx.translate(-minX, -minY);

  // Background
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(minX, minY, width, height);

  // Draw edges
  for (const edge of diagram.edges) {
    const source = diagram.nodes.find(n => n.id === edge.source);
    const target = diagram.nodes.find(n => n.id === edge.target);
    if (!source || !target) continue;

    const x1 = source.x + source.width / 2;
    const y1 = source.y + source.height / 2;
    const x2 = target.x + target.width / 2;
    const y2 = target.y + target.height / 2;

    // Bezier control points
    const dx = x2 - x1;
    const dy = y2 - y1;
    let cx1: number, cy1: number, cx2: number, cy2: number;

    if (Math.abs(dx) > Math.abs(dy)) {
      cx1 = x1 + dx * 0.25;
      cy1 = y1;
      cx2 = x2 - dx * 0.25;
      cy2 = y2;
    } else {
      cx1 = x1;
      cy1 = y1 + dy * 0.25;
      cx2 = x2;
      cy2 = y2 - dy * 0.25;
    }

    // Draw path
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x2, y2);
    ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(y2 - cy2, x2 - cx2);
    const arrowSize = 10;
    ctx.fillStyle = '#666';
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - arrowSize * Math.cos(angle - 0.4), y2 - arrowSize * Math.sin(angle - 0.4));
    ctx.lineTo(x2 - arrowSize * Math.cos(angle + 0.4), y2 - arrowSize * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();

    // Edge label
    if (edge.label) {
      ctx.fillStyle = '#999';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(edge.label, (x1 + x2) / 2, (y1 + y2) / 2 - 10);
    }
  }

  // Draw nodes (sorted by z_index so zones render behind)
  const sortedNodesPng = [...diagram.nodes].sort((a, b) => (a.z_index ?? 0) - (b.z_index ?? 0));
  for (const node of sortedNodesPng) {
    const textColor = getTextColor(node.color);
    const opacity = node.fill_opacity ?? 1;

    ctx.globalAlpha = opacity;
    ctx.fillStyle = node.color;
    ctx.strokeStyle = node.color;
    ctx.lineWidth = 2;

    // Draw shape
    switch (node.shape) {
      case 'ellipse':
        ctx.beginPath();
        ctx.ellipse(
          node.x + node.width / 2,
          node.y + node.height / 2,
          node.width / 2,
          node.height / 2,
          0, 0, Math.PI * 2
        );
        ctx.fill();
        ctx.stroke();
        break;
      case 'diamond':
        const cx = node.x + node.width / 2;
        const cy = node.y + node.height / 2;
        ctx.beginPath();
        ctx.moveTo(cx, node.y);
        ctx.lineTo(node.x + node.width, cy);
        ctx.lineTo(cx, node.y + node.height);
        ctx.lineTo(node.x, cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      case 'pill':
        const radius = Math.min(node.width, node.height) / 2;
        ctx.beginPath();
        ctx.roundRect(node.x, node.y, node.width, node.height, radius);
        ctx.fill();
        ctx.stroke();
        break;
      default: // rectangle
        ctx.beginPath();
        ctx.roundRect(node.x, node.y, node.width, node.height, 4);
        ctx.fill();
        ctx.stroke();
    }

    ctx.globalAlpha = 1;

    // Node label
    ctx.fillStyle = opacity < 0.5 ? node.color : textColor;
    ctx.font = '500 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.label, node.x + node.width / 2, node.y + node.height / 2);
  }

  // Convert to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create PNG blob'));
      }
    }, 'image/png');
  });
}

/**
 * Download a file with the given content.
 */
export function downloadFile(content: string | Blob, filename: string, mimeType: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Escape special XML characters.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
