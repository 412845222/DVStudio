import { Vector2 } from '../graphbase/core/Vector2';
import { Rect } from '../graphbase/core/Rect';
import { Group } from '../graphbase/scene/Group';
import type { RenderContext } from '../graphbase/renderer/RenderContext';
import type { HitTestResult } from '../graphbase/scene/interfaces';
import { Port } from './Port';
import { NODE_HEADER_HEIGHT, NODE_CORNER_RADIUS, NODE_TYPE_COLORS, PORT_SPACING, PORT_TOP_OFFSET, type BlueprintNodeData, type PortSpec } from './types';

export class BlueprintNode extends Group {
  data: BlueprintNodeData;
  inputPorts: Port[] = [];
  outputPorts: Port[] = [];
  private _colors: { bg: string; border: string; header: string };

  constructor(data: BlueprintNodeData) {
    super('blueprint_node', data.id);
    this.data = data;
    this.draggable = true;
    this.selectable = true;
    this.layer = 20;
    this._colors = NODE_TYPE_COLORS[data.type] || NODE_TYPE_COLORS.default;
    this.transform.setPosition(data.worldX, data.worldY);
    this.transform.setAnchor(0, 0);
    this.setupPorts();
  }

  private setupPorts(): void {
    for (const child of [...this.children]) {
      this.removeChild(child);
    }
    this.inputPorts = [];
    this.outputPorts = [];

    for (let i = 0; i < this.data.inputs.length; i++) {
      const spec = { ...this.data.inputs[i] };
      const yOffset = PORT_TOP_OFFSET + i * PORT_SPACING;
      spec.offsetY = yOffset;
      const port = new Port(spec, true, this.data.width, `${this.id}_in_${spec.id}`);
      this.inputPorts.push(port);
      this.addChild(port);
    }

    for (let i = 0; i < this.data.outputs.length; i++) {
      const spec = { ...this.data.outputs[i] };
      const yOffset = PORT_TOP_OFFSET + i * PORT_SPACING;
      spec.offsetY = yOffset;
      const port = new Port(spec, false, this.data.width, `${this.id}_out_${spec.id}`);
      this.outputPorts.push(port);
      this.addChild(port);
    }
  }

  get title(): string {
    return this.data.title;
  }

  get subtitle(): string {
    return this.data.subtitle || '';
  }

  get nodeWidth(): number {
    return this.data.width;
  }

  get nodeHeight(): number {
    return this.data.height;
  }

  getInputPortById(portId: string): Port | null {
    return this.inputPorts.find(p => p.spec.id === portId) ?? null;
  }

  getOutputPortById(portId: string): Port | null {
    return this.outputPorts.find(p => p.spec.id === portId) ?? null;
  }

  getPortById(portId: string): Port | null {
    return this.getInputPortById(portId) ?? this.getOutputPortById(portId);
  }

  getInputPortWorldPosition(portId: string): Vector2 | null {
    const port = this.getInputPortById(portId);
    return port ? port.getWorldPosition() : null;
  }

  getOutputPortWorldPosition(portId: string): Vector2 | null {
    const port = this.getOutputPortById(portId);
    return port ? port.getWorldPosition() : null;
  }

  setConnectionStatus(portId: string, connected: boolean): void {
    const port = this.getPortById(portId);
    if (port) {
      port.connected = connected;
    }
  }

  getLocalBounds(): Rect {
    return new Rect(0, 0, this.data.width, this.data.height);
  }

  getWorldBounds(): Rect {
    return new Rect(
      this.data.worldX,
      this.data.worldY,
      this.data.width,
      this.data.height
    );
  }

  protected renderSelf(ctx: RenderContext): void {
    const w = this.data.width;
    const h = this.data.height;
    const r = NODE_CORNER_RADIUS;
    const headerH = NODE_HEADER_HEIGHT;
    const selected = this.selected;
    const hovered = this.hovered;
    const colors = this._colors;

    ctx.ctx.save();

    if (selected) {
      ctx.ctx.shadowColor = colors.border;
      ctx.ctx.shadowBlur = 16;
    }

    ctx.drawRoundedRect(
      new Rect(0, 0, w, h),
      r,
      colors.bg,
      selected ? '#ffffff' : (hovered ? colors.border : colors.border + 'cc'),
      selected ? 2.5 : 1.5
    );

    ctx.ctx.beginPath();
    ctx.ctx.moveTo(r, 0);
    ctx.ctx.lineTo(w - r, 0);
    ctx.ctx.quadraticCurveTo(w, 0, w, r);
    ctx.ctx.lineTo(w, headerH);
    ctx.ctx.lineTo(0, headerH);
    ctx.ctx.lineTo(0, r);
    ctx.ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.ctx.closePath();
    ctx.ctx.fillStyle = colors.header;
    ctx.ctx.fill();

    ctx.ctx.shadowColor = 'transparent';
    ctx.ctx.shadowBlur = 0;

    ctx.setTextAlign('left');
    ctx.setTextBaseline('middle');

    ctx.setFont('bold 13px system-ui, -apple-system, sans-serif');
    ctx.drawText(this.data.title, new Vector2(16, headerH / 2), '#ffffff');

    if (this.data.subtitle) {
      ctx.setTextAlign('right');
      ctx.setFont('11px system-ui, -apple-system, sans-serif');
      ctx.ctx.globalAlpha = 0.6;
      ctx.drawText(this.data.subtitle, new Vector2(w - 12, headerH / 2), '#e2e8f0');
      ctx.ctx.globalAlpha = 1;
    }

    ctx.setFont('11px system-ui, -apple-system, sans-serif');
    ctx.setTextAlign('left');
    for (let i = 0; i < this.inputPorts.length; i++) {
      const y = PORT_TOP_OFFSET + i * PORT_SPACING;
      const label = this.inputPorts[i].spec.label || this.inputPorts[i].spec.id;
      ctx.setTextAlign('left');
      ctx.drawText(label, new Vector2(20, y), '#cbd5e1');
    }

    for (let i = 0; i < this.outputPorts.length; i++) {
      const y = PORT_TOP_OFFSET + i * PORT_SPACING;
      const label = this.outputPorts[i].spec.label || this.outputPorts[i].spec.id;
      ctx.setTextAlign('right');
      ctx.drawText(label, new Vector2(w - 20, y), '#cbd5e1');
    }

    if (selected) {
      ctx.save();
      ctx.setLineDash([5, 3]);
      ctx.ctx.strokeStyle = '#ffffff';
      ctx.ctx.lineWidth = 1;
      ctx.ctx.strokeRect(-3, -3, w + 6, h + 6);
      ctx.setLineDash([]);
      ctx.restore();
    }

    ctx.ctx.restore();
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

  onDragMove(_delta: Vector2, _event: unknown): void {
  }

  onDragEnd(_event: unknown): void {
    this.data.worldX = this.transform.position.x;
    this.data.worldY = this.transform.position.y;
  }

  updateData(data: Partial<BlueprintNodeData>): void {
    Object.assign(this.data, data);
    if (data.worldX !== undefined || data.worldY !== undefined) {
      this.transform.setPosition(this.data.worldX, this.data.worldY);
    }
    if (data.inputs || data.outputs || data.width || data.height) {
      this.setupPorts();
    }
    this.markDirty(1);
  }
}
