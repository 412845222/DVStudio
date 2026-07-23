import { Vector2 } from '../graphbase/core/Vector2';
import { Rect } from '../graphbase/core/Rect';
import { Node } from '../graphbase/scene/Node';
import type { RenderContext } from '../graphbase/renderer/RenderContext';
import type { HitTestResult } from '../graphbase/scene/interfaces';
import { Port } from './Port';
import {
  NODE_HEADER_HEIGHT,
  NODE_BRACKET_SIZE,
  NODE_BORDER_WIDTH,
  NODE_INNER_PADDING,
  PORT_SPACING,
  PORT_TOP_OFFSET,
  WF_TEXT,
  WF_TEXT_MUTED,
  WF_PRIMARY,
  NODE_STATUS_COLORS,
  PORT_SIZE,
  RESIZE_HANDLE_SIZE,
  RESIZE_HANDLE_HIT_SIZE,
  RESIZE_HANDLE_OFFSET,
  MIN_NODE_WIDTH,
  MIN_NODE_HEIGHT,
  type BlueprintNodeData,
  type PortSpec,
  type ResizeCorner
} from './types';

export class BlueprintNode extends Node {
  data: BlueprintNodeData;
  inputPorts: Port[] = [];
  outputPorts: Port[] = [];
  nodeType: string;
  title: string;
  subtitle?: string;
  alias?: string;
  icon?: string;
  previewText?: string;
  hoveredResizeCorner: ResizeCorner | null = null;

  constructor(data: BlueprintNodeData) {
    super('node', data.id);
    this.data = data;
    this.nodeType = data.type;
    this.title = data.title;
    this.subtitle = data.subtitle;
    this.alias = data.alias;
    this.icon = data.icon;
    this.previewText = data.previewContent?.text;
    this.draggable = true;
    this.layer = 10;
    this.transform.setAnchor(0, 0);
    this.transform.setPosition(data.worldX, data.worldY);
    this.selected = data.selected ?? false;
    this.rebuildPorts();
  }

  setData(data: Partial<BlueprintNodeData>): void {
    if (data.title !== undefined) this.title = data.title;
    if (data.subtitle !== undefined) this.subtitle = data.subtitle;
    if (data.alias !== undefined) this.alias = data.alias;
    if (data.icon !== undefined) this.icon = data.icon;
    if (data.previewContent?.text !== undefined) this.previewText = data.previewContent.text;
    const newX = data.worldX ?? this.data.worldX;
    const newY = data.worldY ?? this.data.worldY;
    if (data.worldX !== undefined || data.worldY !== undefined) {
      this.transform.setPosition(newX, newY);
    }
    if (data.width !== undefined || data.height !== undefined) {
      if (data.width !== undefined) this.data.width = data.width;
      if (data.height !== undefined) this.data.height = data.height;
      this.rebuildPorts();
    }
    if (data.selected !== undefined) {
      this.selected = data.selected;
    }
    this.data.worldX = this.transform.position.x;
    this.data.worldY = this.transform.position.y;
    this.markDirty(1);
  }

  updateSize(width: number, height: number): void {
    this.data.width = width;
    this.data.height = height;
    this.inputPorts.forEach(p => p.updateNodeSize(width, height));
    this.outputPorts.forEach(p => p.updateNodeSize(width, height));
    this.markDirty(1);
  }

  rebuildPorts(): void {
    for (const child of [...this.children]) {
      this.removeChild(child);
    }
    this.inputPorts = [];
    this.outputPorts = [];

    const w = this.data.width;
    const h = this.data.height;

    this.data.inputs.forEach((spec: PortSpec, i: number) => {
      const port = new Port(
        { ...spec, offsetY: PORT_TOP_OFFSET + i * PORT_SPACING },
        true, w, h, `${this.id}-in-${spec.id}`
      );
      this.inputPorts.push(port);
      this.addChild(port);
    });

    this.data.outputs.forEach((spec: PortSpec, i: number) => {
      const port = new Port(
        { ...spec, offsetY: PORT_TOP_OFFSET + i * PORT_SPACING },
        false, w, h, `${this.id}-out-${spec.id}`
      );
      this.outputPorts.push(port);
      this.addChild(port);
    });

    this.markDirty(1);
  }

  getPort(portId: string): Port | null {
    return this.inputPorts.find(p => p.spec.id === portId)
      || this.outputPorts.find(p => p.spec.id === portId)
      || null;
  }

  getInputPort(portId: string): Port | null {
    return this.inputPorts.find(p => p.spec.id === portId) || null;
  }

  getOutputPort(portId: string): Port | null {
    return this.outputPorts.find(p => p.spec.id === portId) || null;
  }

  updateConnectionState(): void {
    for (const p of this.inputPorts) p.connected = false;
    for (const p of this.outputPorts) p.connected = false;
  }

  markPortConnected(portId: string, isInput: boolean): void {
    const ports = isInput ? this.inputPorts : this.outputPorts;
    const port = ports.find(p => p.spec.id === portId);
    if (port) port.connected = true;
  }

  getLocalBounds(): Rect {
    return new Rect(0, 0, this.data.width, this.data.height);
  }

  getHitBounds(): Rect {
    return this.getLocalBounds();
  }

  private getStatusColors() {
    if (this.data.status === 'error') return NODE_STATUS_COLORS.error;
    if (this.data.status === 'running') return NODE_STATUS_COLORS.running;
    if (this.selected) return NODE_STATUS_COLORS.selected;
    if (this.hovered) return NODE_STATUS_COLORS.hovered;
    return NODE_STATUS_COLORS.idle;
  }

  private hexToRgba(hex: string, alpha: number): string {
    if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private drawLCorner(
    c: CanvasRenderingContext2D,
    x: number, y: number,
    dirX: number, dirY: number,
    length: number,
    color: string,
    lineWidth: number
  ): void {
    c.save();
    c.strokeStyle = color;
    c.lineWidth = lineWidth;
    c.lineCap = 'square';
    c.beginPath();
    c.moveTo(x, y + dirY * length);
    c.lineTo(x, y);
    c.lineTo(x + dirX * length, y);
    c.stroke();
    c.restore();
  }

  private drawParticleDots(
    c: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    color: string
  ): void {
    const dotSize = 2;
    const spacing = 20;
    c.save();
    c.fillStyle = color;
    for (let px = x + spacing; px < x + w; px += spacing) {
      c.fillRect(px, y, dotSize, dotSize);
      c.fillRect(px, y + h - dotSize, dotSize, dotSize);
    }
    for (let py = y + spacing; py < y + h; py += spacing) {
      c.fillRect(x, py, dotSize, dotSize);
      c.fillRect(x + w - dotSize, py, dotSize, dotSize);
    }
    c.restore();
  }

  protected renderSelf(ctx: RenderContext): void {
    const c = ctx.ctx;
    const w = this.data.width;
    const h = this.data.height;
    const colors = this.getStatusColors();
    const invZoom = 1 / ctx.camera.zoom;

    c.save();

    if (this.selected) {
      c.shadowColor = colors.glow;
      c.shadowBlur = 20 * invZoom;
      c.shadowOffsetX = 0;
      c.shadowOffsetY = 0;
    }

    const bgGradient = c.createLinearGradient(0, 0, 0, h);
    bgGradient.addColorStop(0, 'rgba(20, 30, 28, 0.85)');
    bgGradient.addColorStop(1, 'rgba(15, 23, 22, 0.92)');
    c.fillStyle = bgGradient;
    c.fillRect(0, 0, w, h);

    c.shadowColor = 'transparent';
    c.shadowBlur = 0;

    const headerGradient = c.createLinearGradient(0, 0, 0, NODE_HEADER_HEIGHT);
    headerGradient.addColorStop(0, 'rgba(31, 157, 132, 0.15)');
    headerGradient.addColorStop(1, 'rgba(31, 157, 132, 0.05)');
    c.fillStyle = headerGradient;
    c.fillRect(0, 0, w, NODE_HEADER_HEIGHT);

    c.strokeStyle = this.hexToRgba(colors.border, 0.6);
    c.lineWidth = NODE_BORDER_WIDTH * invZoom;
    c.strokeRect(0, 0, w, h);

    this.drawLCorner(c, 0, 0, 1, 1, NODE_BRACKET_SIZE * invZoom, colors.bracket, NODE_BORDER_WIDTH * 1.5 * invZoom);
    this.drawLCorner(c, w, 0, -1, 1, NODE_BRACKET_SIZE * invZoom, colors.bracket, NODE_BORDER_WIDTH * 1.5 * invZoom);
    this.drawLCorner(c, 0, h, 1, -1, NODE_BRACKET_SIZE * invZoom, colors.bracket, NODE_BORDER_WIDTH * 1.5 * invZoom);
    this.drawLCorner(c, w, h, -1, -1, NODE_BRACKET_SIZE * invZoom, colors.bracket, NODE_BORDER_WIDTH * 1.5 * invZoom);

    if (this.selected) {
      this.drawParticleDots(c, 2 * invZoom, 2 * invZoom, w - 4 * invZoom, h - 4 * invZoom, this.hexToRgba(WF_PRIMARY, 0.3));
    }

    c.strokeStyle = this.hexToRgba(WF_PRIMARY, 0.2);
    c.lineWidth = 1 * invZoom;
    c.beginPath();
    c.moveTo(0, NODE_HEADER_HEIGHT);
    c.lineTo(w, NODE_HEADER_HEIGHT);
    c.stroke();

    const titleX = NODE_INNER_PADDING;
    c.fillStyle = WF_TEXT;
    c.font = `500 ${12 * Math.max(invZoom, 0.8)}px -apple-system, "Segoe UI", "PingFang SC", sans-serif`;
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillText(this.alias || this.title, titleX, NODE_HEADER_HEIGHT / 2);

    const statusDotX = w - NODE_INNER_PADDING - 8;
    const statusDotY = NODE_HEADER_HEIGHT / 2;
    c.fillStyle = colors.badge;
    const dotSize = 4 * invZoom;
    c.fillRect(statusDotX - dotSize / 2, statusDotY - dotSize / 2, dotSize, dotSize);

    this.renderPortLabels(c, invZoom);
    this.renderPreviewArea(c, w, h, invZoom);

    if (this.selected || this.hoveredResizeCorner) {
      this.renderResizeHandles(c, w, h, invZoom);
    }

    c.restore();
  }

  private getResizeHandleRect(corner: ResizeCorner, invZoom: number): Rect {
    const w = this.data.width;
    const h = this.data.height;
    const handleSize = RESIZE_HANDLE_SIZE * invZoom;
    const offset = RESIZE_HANDLE_OFFSET * invZoom;

    let x: number, y: number;
    switch (corner) {
      case 'top-left':
        x = -offset - handleSize / 2;
        y = -offset - handleSize / 2;
        break;
      case 'top-right':
        x = w + offset - handleSize / 2;
        y = -offset - handleSize / 2;
        break;
      case 'bottom-left':
        x = -offset - handleSize / 2;
        y = h + offset - handleSize / 2;
        break;
      case 'bottom-right':
        x = w + offset - handleSize / 2;
        y = h + offset - handleSize / 2;
        break;
    }
    return new Rect(x, y, handleSize, handleSize);
  }

  private renderResizeHandles(c: CanvasRenderingContext2D, w: number, h: number, invZoom: number): void {
    const corners: ResizeCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const handleSize = RESIZE_HANDLE_SIZE * invZoom;

    c.save();
    c.fillStyle = WF_PRIMARY;
    c.strokeStyle = '#ffffff';
    c.lineWidth = 1.5 * invZoom;

    for (const corner of corners) {
      const rect = this.getResizeHandleRect(corner, invZoom);
      c.fillRect(rect.x, rect.y, rect.width, rect.height);
      c.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }

    if (this.hoveredResizeCorner) {
      const hoveredRect = this.getResizeHandleRect(this.hoveredResizeCorner, invZoom);
      c.shadowColor = WF_PRIMARY;
      c.shadowBlur = 8 * invZoom;
      c.fillRect(hoveredRect.x, hoveredRect.y, hoveredRect.width, hoveredRect.height);
      c.shadowBlur = 0;
    }

    c.restore();
  }

  getResizeCornerAtPoint(localPoint: Vector2, invZoom: number): ResizeCorner | null {
    const corners: ResizeCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const hitSize = RESIZE_HANDLE_HIT_SIZE * invZoom;
    const halfHit = hitSize / 2;

    for (const corner of corners) {
      const rect = this.getResizeHandleRect(corner, invZoom);
      const expandedRect = new Rect(
        rect.x + rect.width / 2 - halfHit,
        rect.y + rect.height / 2 - halfHit,
        hitSize,
        hitSize
      );
      if (expandedRect.containsPoint(localPoint)) {
        return corner;
      }
    }
    return null;
  }

  getResizeCursor(corner: ResizeCorner): string {
    switch (corner) {
      case 'top-left':
      case 'bottom-right':
        return 'nwse-resize';
      case 'top-right':
      case 'bottom-left':
        return 'nesw-resize';
    }
  }

  private renderPortLabels(c: CanvasRenderingContext2D, invZoom: number): void {
    c.font = `${11 * Math.max(invZoom, 0.8)}px -apple-system, "Segoe UI", "PingFang SC", sans-serif`;
    c.textBaseline = 'middle';

    this.inputPorts.forEach((port, i) => {
      const y = PORT_TOP_OFFSET + i * PORT_SPACING;
      c.fillStyle = WF_TEXT_MUTED;
      c.textAlign = 'left';
      const label = port.spec.label || port.spec.id;
      c.fillText(label, PORT_SIZE / 2 + NODE_INNER_PADDING / 2, y);
    });

    this.outputPorts.forEach((port, i) => {
      const y = PORT_TOP_OFFSET + i * PORT_SPACING;
      c.fillStyle = WF_TEXT_MUTED;
      c.textAlign = 'right';
      const label = port.spec.label || port.spec.id;
      c.fillText(label, this.data.width - PORT_SIZE / 2 - NODE_INNER_PADDING / 2, y);
    });
  }

  private getPreviewKind(): 'text' | 'image' | 'video' | 'model3d' | 'icon' {
    if (this.data.previewContent?.kind) return this.data.previewContent.kind as any;
    switch (this.nodeType) {
      case 'text': return 'text';
      case 'image':
      case 'rotate-image': return 'image';
      case 'video': return 'video';
      case 'model3d': return 'model3d';
      default: return 'icon';
    }
  }

  private getNodeTypeColor(): string {
    switch (this.nodeType) {
      case 'text': return '#f1c40f';
      case 'image':
      case 'rotate-image': return '#9b59b6';
      case 'video': return '#27ae60';
      case 'model3d': return '#3498db';
      case 'comfyui': return '#e67e22';
      case 'blender': return '#e67e22';
      case 'unreal-export': return '#3498db';
      case 'scene-understanding':
      case 'scene-layout':
      case 'scene-decompose': return '#1f9d84';
      default: return WF_PRIMARY;
    }
  }

  private getDefaultIcon(): string {
    const icons: Record<string, string> = {
      text: '📝',
      image: '🖼️',
      'rotate-image': '🔄',
      video: '🎬',
      'scene-understanding': '👁️',
      'scene-layout': '📐',
      'scene-decompose': '🔍',
      comfyui: '⚡',
      model3d: '🧊',
      'unreal-export': '🎮',
      blender: '🎨'
    };
    return icons[this.nodeType] || '◇';
  }

  private renderPreviewArea(c: CanvasRenderingContext2D, w: number, h: number, invZoom: number): void {
    const maxPorts = Math.max(this.inputPorts.length, this.outputPorts.length);
    const previewTop = PORT_TOP_OFFSET + maxPorts * PORT_SPACING + 8;
    const previewBottom = h - NODE_INNER_PADDING;

    if (previewBottom - previewTop < 40) return;

    const previewX = NODE_INNER_PADDING;
    const previewW = w - NODE_INNER_PADDING * 2;
    const previewH = previewBottom - previewTop;

    const kind = this.getPreviewKind();
    const accentColor = this.getNodeTypeColor();

    c.save();
    c.fillStyle = this.hexToRgba(accentColor, 0.04);
    c.fillRect(previewX, previewTop, previewW, previewH);
    c.strokeStyle = this.hexToRgba(accentColor, 0.15);
    c.lineWidth = 1 * invZoom;
    c.strokeRect(previewX, previewTop, previewW, previewH);

    if (kind === 'text') {
      this.renderTextPreview(c, previewX, previewTop, previewW, previewH, invZoom);
    } else if (kind === 'image') {
      this.renderImagePreview(c, previewX, previewTop, previewW, previewH, invZoom, accentColor);
    } else if (kind === 'video') {
      this.renderVideoPreview(c, previewX, previewTop, previewW, previewH, invZoom, accentColor);
    } else if (kind === 'model3d') {
      this.renderModel3DPreview(c, previewX, previewTop, previewW, previewH, invZoom, accentColor);
    } else {
      this.renderIconPreview(c, previewX, previewTop, previewW, previewH, invZoom, accentColor);
    }

    c.restore();
  }

  private renderIconPreview(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, invZoom: number, accentColor: string): void {
    const cx = x + w / 2;
    const cy = y + h / 2 - 8;
    const iconSize = Math.min(40, Math.min(w, h) * 0.45);

    c.save();
    c.fillStyle = this.hexToRgba(accentColor, 0.1);
    c.beginPath();
    c.arc(cx, cy, iconSize * 0.7, 0, Math.PI * 2);
    c.fill();

    c.font = `${iconSize * 0.7}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const icon = this.icon || this.getDefaultIcon();
    c.fillText(icon, cx, cy);

    if (this.subtitle) {
      c.fillStyle = WF_TEXT_MUTED;
      c.font = `${10 * Math.max(invZoom, 0.8)}px -apple-system, "Segoe UI", "PingFang SC", sans-serif`;
      c.fillText(this.subtitle, cx, cy + iconSize * 0.5 + 16);
    }
    c.restore();
  }

  private renderTextPreview(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, invZoom: number): void {
    const padding = 10;
    const text = this.previewText || '暂无文本内容';
    const fontSize = Math.max(10, 11 * Math.max(invZoom, 0.85));
    const lineHeight = Math.ceil(fontSize * 1.5);
    c.fillStyle = WF_TEXT_MUTED;
    c.font = `${fontSize}px -apple-system, "Segoe UI", "PingFang SC", sans-serif`;
    c.textAlign = 'left';
    c.textBaseline = 'top';

    const maxWidth = w - padding * 2;
    const maxLines = Math.floor((h - padding * 2) / lineHeight);
    const lines = this.wrapTextChinese(c, text, maxWidth);

    for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
      let line = lines[i];
      if (i === maxLines - 1 && lines.length > maxLines) {
        while (c.measureText(line + '...').width > maxWidth && line.length > 0) {
          line = line.slice(0, -1);
        }
        line += '...';
      }
      c.fillText(line, x + padding, y + padding + i * lineHeight);
    }
  }

  private renderImagePreview(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, invZoom: number, accentColor: string): void {
    const margin = 6;
    const px = x + margin;
    const py = y + margin;
    const pw = w - margin * 2;
    const ph = h - margin * 2;

    c.fillStyle = this.hexToRgba(accentColor, 0.08);
    c.fillRect(px, py, pw, ph);

    const cx = px + pw / 2;
    const cy = py + ph / 2;
    const iconSize = Math.min(pw, ph) * 0.35;

    c.beginPath();
    c.moveTo(px + pw * 0.15, py + ph * 0.75);
    c.lineTo(px + pw * 0.35, py + ph * 0.45);
    c.lineTo(px + pw * 0.55, py + ph * 0.65);
    c.lineTo(px + pw * 0.7, py + ph * 0.35);
    c.lineTo(px + pw * 0.85, py + ph * 0.75);
    c.closePath();
    c.fillStyle = this.hexToRgba(accentColor, 0.25);
    c.fill();

    c.beginPath();
    c.arc(px + pw * 0.7, py + ph * 0.28, iconSize * 0.12, 0, Math.PI * 2);
    c.fillStyle = this.hexToRgba(accentColor, 0.4);
    c.fill();

    c.strokeStyle = this.hexToRgba(accentColor, 0.3);
    c.lineWidth = 1 * invZoom;
    c.strokeRect(px, py, pw, ph);

    if (this.nodeType === 'rotate-image') {
      c.save();
      c.translate(cx, py + ph * 0.15);
      c.strokeStyle = this.hexToRgba(accentColor, 0.5);
      c.lineWidth = 1.5 * invZoom;
      c.beginPath();
      c.arc(0, 0, 8 * invZoom, 0.3, Math.PI * 1.7);
      c.stroke();
      c.beginPath();
      c.moveTo(0, -10 * invZoom);
      c.lineTo(3 * invZoom, -6 * invZoom);
      c.lineTo(-3 * invZoom, -6 * invZoom);
      c.closePath();
      c.fillStyle = this.hexToRgba(accentColor, 0.6);
      c.fill();
      c.restore();
    }
  }

  private renderVideoPreview(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, invZoom: number, accentColor: string): void {
    const margin = 6;
    const px = x + margin;
    const py = y + margin;
    const pw = w - margin * 2;
    const ph = h - margin * 2;

    c.fillStyle = this.hexToRgba(accentColor, 0.08);
    c.fillRect(px, py, pw, ph);

    const cx = px + pw / 2;
    const cy = py + ph / 2;
    const playSize = Math.min(pw, ph) * 0.25;

    c.beginPath();
    c.moveTo(cx - playSize * 0.4, cy - playSize * 0.5);
    c.lineTo(cx + playSize * 0.6, cy);
    c.lineTo(cx - playSize * 0.4, cy + playSize * 0.5);
    c.closePath();
    c.fillStyle = this.hexToRgba(accentColor, 0.5);
    c.fill();

    c.strokeStyle = this.hexToRgba(accentColor, 0.3);
    c.lineWidth = 1 * invZoom;
    c.strokeRect(px, py, pw, ph);

    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.fillRect(px, py + ph - 14 * invZoom, pw, 14 * invZoom);
    c.fillStyle = this.hexToRgba(accentColor, 0.7);
    c.fillRect(px + 4, py + ph - 10 * invZoom, pw * 0.35, 4 * invZoom);
    c.beginPath();
    c.arc(px + pw - 12 * invZoom, py + ph - 8 * invZoom, 4 * invZoom, 0, Math.PI * 2);
    c.fillStyle = this.hexToRgba(accentColor, 0.6);
    c.fill();
  }

  private renderModel3DPreview(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, invZoom: number, accentColor: string): void {
    const cx = x + w / 2;
    const cy = y + h / 2 - 5;
    const size = Math.min(w, h) * 0.3;

    c.save();
    c.strokeStyle = this.hexToRgba(accentColor, 0.5);
    c.lineWidth = 1.5 * invZoom;
    c.fillStyle = this.hexToRgba(accentColor, 0.1);

    const offset = size * 0.35;
    const top = cy - size * 0.6;
    const bottom = cy + size * 0.4;
    const left = cx - size * 0.5;
    const right = cx + size * 0.5;
    const back = cy - size * 0.2;

    c.beginPath();
    c.moveTo(cx, top);
    c.lineTo(right, cy - size * 0.1);
    c.lineTo(right, bottom);
    c.lineTo(cx, cy + size * 0.1);
    c.closePath();
    c.fillStyle = this.hexToRgba(accentColor, 0.15);
    c.fill();
    c.stroke();

    c.beginPath();
    c.moveTo(cx, top);
    c.lineTo(left, cy - size * 0.1);
    c.lineTo(left, bottom);
    c.lineTo(cx, cy + size * 0.1);
    c.closePath();
    c.fillStyle = this.hexToRgba(accentColor, 0.08);
    c.fill();
    c.stroke();

    c.beginPath();
    c.moveTo(cx, top);
    c.lineTo(right, cy - size * 0.1);
    c.lineTo(right, bottom);
    c.lineTo(cx, cy + size * 0.1);
    c.lineTo(left, bottom);
    c.lineTo(left, cy - size * 0.1);
    c.closePath();
    c.strokeStyle = this.hexToRgba(accentColor, 0.3);
    c.stroke();

    c.beginPath();
    c.moveTo(left, cy - size * 0.1);
    c.lineTo(cx, back - size * 0.1);
    c.lineTo(right, cy - size * 0.1);
    c.strokeStyle = this.hexToRgba(accentColor, 0.25);
    c.stroke();
    c.beginPath();
    c.moveTo(cx, back - size * 0.1);
    c.lineTo(cx, top - offset * 0.3);
    c.stroke();

    if (this.subtitle) {
      c.fillStyle = WF_TEXT_MUTED;
      c.font = `${10 * Math.max(invZoom, 0.8)}px -apple-system, "Segoe UI", "PingFang SC", sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'top';
      c.fillText(this.subtitle, cx, bottom + 12);
    }
    c.restore();
  }

  private wrapTextChinese(c: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    let current = '';

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '\n') {
        lines.push(current);
        current = '';
        continue;
      }
      const test = current + char;
      if (c.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = char;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [text.substring(0, 20)];
  }

  protected hitTestSelf(localPoint: Vector2): HitTestResult | null {
    const bounds = this.getLocalBounds();
    if (bounds.containsPoint(localPoint)) {
      return {
        node: this,
        localPoint: localPoint.clone(),
        worldPoint: this.localToWorld(localPoint)
      };
    }
    return null;
  }

  onDragMove(_delta: Vector2): void {
    this.data.worldX = this.transform.position.x;
    this.data.worldY = this.transform.position.y;
    this.on.emit('nodemoved', { id: this.id, x: this.data.worldX, y: this.data.worldY });
  }
}
