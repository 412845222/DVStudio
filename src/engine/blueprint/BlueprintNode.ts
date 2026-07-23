import { Vector2 } from '../graphbase/core/Vector2';
import { Rect } from '../graphbase/core/Rect';
import { Node } from '../graphbase/scene/Node';
import type { RenderContext } from '../graphbase/renderer/RenderContext';
import type { HitTestResult } from '../graphbase/scene/interfaces';
import { Port } from './Port';
import {
  NODE_CORNER_RADIUS,
  NODE_HEADER_HEIGHT,
  NODE_BRACKET_SIZE,
  NODE_BRACKET_WIDTH,
  NODE_BORDER_WIDTH,
  NODE_INNER_PADDING,
  PORT_SPACING,
  PORT_TOP_OFFSET,
  WF_TEXT,
  WF_TEXT_MUTED,
  WF_NODE_BG,
  WF_HEADER_BG,
  WF_PRIMARY,
  NODE_STATUS_COLORS,
  MEDIA_TYPE_COLORS,
  PORT_SIZE,
  type BlueprintNodeData,
  type PortSpec,
  type MediaType
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

  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  protected renderSelf(ctx: RenderContext): void {
    const c = ctx.ctx;
    const w = this.data.width;
    const h = this.data.height;
    const colors = this.getStatusColors();

    c.save();

    c.shadowColor = colors.glow;
    c.shadowBlur = 16;
    c.shadowOffsetX = 0;
    c.shadowOffsetY = 0;

    c.fillStyle = WF_NODE_BG;
    c.strokeStyle = colors.border;
    c.lineWidth = NODE_BORDER_WIDTH;
    this.drawRoundedRect(c, 0, 0, w, h, NODE_CORNER_RADIUS);
    c.fill();
    c.stroke();

    c.shadowColor = 'transparent';
    c.shadowBlur = 0;

    c.fillStyle = WF_HEADER_BG;
    this.drawRoundedRect(c, 0, 0, w, NODE_HEADER_HEIGHT, NODE_CORNER_RADIUS);
    c.fill();
    c.fillRect(0, NODE_HEADER_HEIGHT - NODE_CORNER_RADIUS, w, NODE_CORNER_RADIUS);

    c.strokeStyle = this.hexToRgba(colors.bracket, 0.3);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, NODE_HEADER_HEIGHT);
    c.lineTo(w, NODE_HEADER_HEIGHT);
    c.stroke();

    c.strokeStyle = colors.bracket;
    c.lineWidth = NODE_BRACKET_WIDTH;
    c.lineCap = 'round';
    c.beginPath();
    const bs = NODE_BRACKET_SIZE;
    const bw = NODE_BRACKET_WIDTH;
    c.moveTo(bw / 2, bs);
    c.lineTo(bw / 2, bw / 2);
    c.lineTo(bs, bw / 2);
    c.moveTo(w - bs, bw / 2);
    c.lineTo(w - bw / 2, bw / 2);
    c.lineTo(w - bw / 2, bs);
    c.moveTo(bw / 2, h - bs);
    c.lineTo(bw / 2, h - bw / 2);
    c.lineTo(bs, h - bw / 2);
    c.moveTo(w - bs, h - bw / 2);
    c.lineTo(w - bw / 2, h - bw / 2);
    c.lineTo(w - bw / 2, h - bs);
    c.stroke();
    c.lineCap = 'butt';

    const titleX = NODE_INNER_PADDING;
    c.fillStyle = WF_TEXT;
    c.font = '500 12px -apple-system, "Segoe UI", "PingFang SC", sans-serif';
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillText(this.alias || this.title, titleX, NODE_HEADER_HEIGHT / 2);

    const typeColor = this.getNodeTypeColor();
    c.fillStyle = colors.badge;
    const statusDotX = w - NODE_INNER_PADDING - 16;
    const statusDotY = NODE_HEADER_HEIGHT / 2;
    c.beginPath();
    c.arc(statusDotX, statusDotY, 4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = typeColor;
    c.beginPath();
    c.arc(statusDotX, statusDotY, 2.5, 0, Math.PI * 2);
    c.fill();

    this.renderPortLabels(c);
    this.renderPreviewArea(c, w, h);

    c.restore();
  }

  private getNodeTypeColor(): string {
    if (this.data.status === 'error') return '#cf5a46';
    if (this.data.status === 'running') return '#e5b567';
    return WF_PRIMARY;
  }

  private renderPortLabels(c: CanvasRenderingContext2D): void {
    c.font = '11px -apple-system, "Segoe UI", "PingFang SC", sans-serif';
    c.textBaseline = 'middle';

    this.inputPorts.forEach(port => {
      const y = PORT_TOP_OFFSET + this.inputPorts.indexOf(port) * PORT_SPACING;
      c.fillStyle = WF_TEXT_MUTED;
      c.textAlign = 'left';
      const label = port.spec.label || port.spec.id;
      c.fillText(label, PORT_SIZE / 2 + NODE_INNER_PADDING / 2, y);
    });

    this.outputPorts.forEach(port => {
      const y = PORT_TOP_OFFSET + this.outputPorts.indexOf(port) * PORT_SPACING;
      c.fillStyle = WF_TEXT_MUTED;
      c.textAlign = 'right';
      const label = port.spec.label || port.spec.id;
      c.fillText(label, this.data.width - PORT_SIZE / 2 - NODE_INNER_PADDING / 2, y);
    });
  }

  private renderPreviewArea(c: CanvasRenderingContext2D, w: number, h: number): void {
    const previewTop = PORT_TOP_OFFSET + Math.max(
      this.inputPorts.length,
      this.outputPorts.length
    ) * PORT_SPACING + 8;
    const previewBottom = h - NODE_INNER_PADDING;

    if (previewBottom - previewTop < 40) return;

    const previewX = NODE_INNER_PADDING;
    const previewW = w - NODE_INNER_PADDING * 2;
    const previewH = previewBottom - previewTop;

    c.fillStyle = 'rgba(255,255,255,0.03)';
    this.drawRoundedRect(c, previewX, previewTop, previewW, previewH, 4);
    c.fill();

    const previewKind = this.data.previewContent?.kind;
    if (previewKind === 'icon' || !previewKind) {
      this.renderIconPreview(c, previewX, previewTop, previewW, previewH);
    } else if (previewKind === 'text') {
      this.renderTextPreview(c, previewX, previewTop, previewW, previewH);
    } else if (previewKind === 'image') {
      this.renderImagePlaceholder(c, previewX, previewTop, previewW, previewH);
    }
  }

  private renderIconPreview(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    const cx = x + w / 2;
    const cy = y + h / 2;
    c.strokeStyle = 'rgba(31, 157, 132, 0.3)';
    c.lineWidth = 1;
    const iconSize = Math.min(36, Math.min(w, h) * 0.5);
    this.drawRoundedRect(c, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize, 4);
    c.stroke();
    c.fillStyle = 'rgba(31, 157, 132, 0.5)';
    c.font = '18px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const icon = this.icon || this.getDefaultIcon();
    c.fillText(icon, cx, cy);

    if (this.subtitle) {
      c.fillStyle = WF_TEXT_MUTED;
      c.font = '10px -apple-system, "Segoe UI", sans-serif';
      c.fillText(this.subtitle, cx, cy + iconSize / 2 + 14);
    }
  }

  private getDefaultIcon(): string {
    const icons: Record<string, string> = {
      text: 'T',
      image: '🖼',
      'rotate-image': '🔄',
      video: '🎬',
      'scene-understanding': '👁',
      'scene-layout': '📐',
      'scene-decompose': '✂',
      comfyui: '⚡',
      model3d: '🧊',
      'unreal-export': 'U',
      blender: 'B'
    };
    return icons[this.nodeType] || '◆';
  }

  private renderTextPreview(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    const padding = 8;
    const text = this.previewText || '';
    c.fillStyle = WF_TEXT_MUTED;
    c.font = '10px -apple-system, "Segoe UI", sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'top';
    const lines = this.wrapText(c, text, w - padding * 2);
    const lineHeight = 14;
    const maxLines = Math.floor((h - padding * 2) / lineHeight);
    for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
      c.fillText(lines[i], x + padding, y + padding + i * lineHeight);
    }
  }

  private renderImagePlaceholder(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    c.fillStyle = 'rgba(155, 89, 182, 0.1)';
    this.drawRoundedRect(c, x + 4, y + 4, w - 8, h - 8, 4);
    c.fill();
    c.strokeStyle = 'rgba(155, 89, 182, 0.2)';
    c.lineWidth = 1;
    c.stroke();
    c.fillStyle = 'rgba(155, 89, 182, 0.4)';
    c.font = '24px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('🖼', x + w / 2, y + h / 2);
  }

  private wrapText(c: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const test = current ? current + ' ' + word : word;
      if (c.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
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
