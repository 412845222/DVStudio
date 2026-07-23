import { Vector2 } from '../core/Vector2';
import { Rect } from '../core/Rect';
import { Node } from '../scene/Node';
import type { RenderContext } from '../renderer/RenderContext';
import type { HitTestResult } from '../scene/interfaces';

export interface RectangleNodeOptions {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  draggable?: boolean;
  selectable?: boolean;
  label?: string;
}

export class RectangleNode extends Node {
  width: number;
  height: number;
  cornerRadius: number;
  label: string;

  constructor(options: RectangleNodeOptions = {}, id?: string) {
    super('rectangle', id);
    this.width = options.width ?? 120;
    this.height = options.height ?? 80;
    this.fill = options.fill ?? '#1f9d84';
    this.stroke = options.stroke ?? '#2dd4bf';
    this.strokeWidth = options.strokeWidth ?? 2;
    this.cornerRadius = options.cornerRadius ?? 8;
    this.draggable = options.draggable ?? true;
    this.selectable = options.selectable ?? true;
    this.label = options.label ?? '';
    this.transform.setPosition(options.x ?? 0, options.y ?? 0);
    this.transform.setAnchor(0, 0);
  }

  getLocalBounds(): Rect {
    return new Rect(0, 0, this.width, this.height);
  }

  getHitBounds(): Rect {
    return this.getLocalBounds();
  }

  protected renderSelf(ctx: RenderContext): void {
    const selected = this.selected;
    const hovered = this.hovered;

    ctx.drawRoundedRect(
      new Rect(0, 0, this.width, this.height),
      this.cornerRadius,
      this.fill ?? undefined,
      selected ? '#ffffff' : (hovered ? '#5eead4' : (this.stroke ?? undefined)),
      selected ? 3 : this.strokeWidth
    );

    if (selected) {
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(new Rect(-3, -3, this.width + 6, this.height + 6));
      ctx.setLineDash([]);
    }

    if (this.label) {
      ctx.setTextAlign('center');
      ctx.setTextBaseline('middle');
      ctx.setFont('14px system-ui, sans-serif');
      ctx.drawText(this.label, new Vector2(this.width / 2, this.height / 2), '#ffffff');
    }
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
}

export interface CircleNodeOptions {
  x?: number;
  y?: number;
  radius?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  draggable?: boolean;
  selectable?: boolean;
  label?: string;
}

export class CircleNode extends Node {
  radius: number;
  label: string;

  constructor(options: CircleNodeOptions = {}, id?: string) {
    super('circle', id);
    this.radius = options.radius ?? 40;
    this.fill = options.fill ?? '#8b5cf6';
    this.stroke = options.stroke ?? '#a78bfa';
    this.strokeWidth = options.strokeWidth ?? 2;
    this.draggable = options.draggable ?? true;
    this.selectable = options.selectable ?? true;
    this.label = options.label ?? '';
    this.transform.setPosition(options.x ?? 0, options.y ?? 0);
    this.transform.setAnchor(this.radius, this.radius);
  }

  getLocalBounds(): Rect {
    return new Rect(0, 0, this.radius * 2, this.radius * 2);
  }

  getHitBounds(): Rect {
    return this.getLocalBounds();
  }

  protected renderSelf(ctx: RenderContext): void {
    const selected = this.selected;
    const hovered = this.hovered;
    const center = new Vector2(this.radius, this.radius);

    ctx.drawCircle(
      center,
      this.radius,
      this.fill ?? undefined,
      selected ? '#ffffff' : (hovered ? '#c4b5fd' : (this.stroke ?? undefined)),
      selected ? 3 : this.strokeWidth
    );

    if (selected) {
      ctx.setLineDash([6, 4]);
      ctx.drawCircle(center, this.radius + 4, undefined, '#ffffff', 2);
      ctx.setLineDash([]);
    }

    if (this.label) {
      ctx.setTextAlign('center');
      ctx.setTextBaseline('middle');
      ctx.setFont('12px system-ui, sans-serif');
      ctx.drawText(this.label, center, '#ffffff');
    }
  }

  protected hitTestSelf(localPoint: Vector2): HitTestResult | null {
    const center = new Vector2(this.radius, this.radius);
    const dist = localPoint.distanceTo(center);
    if (dist <= this.radius) {
      return {
        node: this,
        localPoint: localPoint.clone(),
        worldPoint: this.localToWorld(localPoint)
      };
    }
    return null;
  }
}

export interface GridBackgroundOptions {
  gridSize?: number;
  majorGridSize?: number;
  minorColor?: string;
  majorColor?: string;
  backgroundColor?: string;
}

export class GridBackground extends Node {
  gridSize: number;
  majorGridSize: number;
  minorColor: string;
  majorColor: string;

  constructor(options: GridBackgroundOptions = {}) {
    super('grid', 'grid_background');
    this.selectable = false;
    this.draggable = false;
    this.gridSize = options.gridSize ?? 20;
    this.majorGridSize = options.majorGridSize ?? 100;
    this.minorColor = options.minorColor ?? 'rgba(255,255,255,0.05)';
    this.majorColor = options.majorColor ?? 'rgba(255,255,255,0.1)';
    this.layer = 0;
  }

  getLocalBounds(): Rect {
    return new Rect(-100000, -100000, 200000, 200000);
  }

  protected renderSelf(ctx: RenderContext): void {
    const camera = ctx.camera;
    const worldVp = camera.getWorldViewport();

    const startX = Math.floor(worldVp.x / this.gridSize) * this.gridSize;
    const endX = worldVp.right + this.gridSize;
    const startY = Math.floor(worldVp.y / this.gridSize) * this.gridSize;
    const endY = worldVp.bottom + this.gridSize;

    ctx.ctx.strokeStyle = this.minorColor;
    ctx.ctx.lineWidth = 1;
    ctx.ctx.beginPath();

    for (let x = startX; x <= endX; x += this.gridSize) {
      const isMajor = Math.abs(x % this.majorGridSize) < 0.1;
      if (isMajor) continue;
      ctx.ctx.moveTo(x, startY);
      ctx.ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += this.gridSize) {
      const isMajor = Math.abs(y % this.majorGridSize) < 0.1;
      if (isMajor) continue;
      ctx.ctx.moveTo(startX, y);
      ctx.ctx.lineTo(endX, y);
    }
    ctx.ctx.stroke();

    ctx.ctx.strokeStyle = this.majorColor;
    ctx.ctx.lineWidth = 1;
    ctx.ctx.beginPath();

    for (let x = startX; x <= endX; x += this.gridSize) {
      const isMajor = Math.abs(x % this.majorGridSize) < 0.1;
      if (!isMajor) continue;
      ctx.ctx.moveTo(x, startY);
      ctx.ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += this.gridSize) {
      const isMajor = Math.abs(y % this.majorGridSize) < 0.1;
      if (!isMajor) continue;
      ctx.ctx.moveTo(startX, y);
      ctx.ctx.lineTo(endX, y);
    }
    ctx.ctx.stroke();

    ctx.ctx.strokeStyle = 'rgba(31,157,132,0.5)';
    ctx.ctx.lineWidth = 2;
    ctx.ctx.beginPath();
    ctx.ctx.moveTo(worldVp.x, 0);
    ctx.ctx.lineTo(worldVp.right, 0);
    ctx.ctx.moveTo(0, worldVp.y);
    ctx.ctx.lineTo(0, worldVp.bottom);
    ctx.ctx.stroke();
  }

  protected hitTestSelf(_localPoint: Vector2): HitTestResult | null {
    return null;
  }
}
