import { Vector2 } from '../graphbase/core/Vector2';
import { Rect } from '../graphbase/core/Rect';
import { Node } from '../graphbase/scene/Node';
import type { RenderContext } from '../graphbase/renderer/RenderContext';
import type { HitTestResult } from '../graphbase/scene/interfaces';
import type { Camera } from '../graphbase/renderer/Camera';
import { MEDIA_TYPE_COLORS, WF_PRIMARY } from './types';

const LINE_WIDTH = 2.5;
const LINE_WIDTH_SELECTED = 3;
const LINE_WIDTH_HOVER = 3;
const BEZIER_CONTROL_DISTANCE = 60;
const HIT_WIDTH = 10;

export interface ConnectionEndpoints {
  fromWorld: Vector2;
  toWorld: Vector2;
  mediaType?: string;
  color?: string;
}

export class Connection extends Node {
  data: { id: string; fromNodeId: string; fromAnchorId: string; toNodeId: string; toAnchorId: string };
  selected: boolean = false;
  private _endpoints: ConnectionEndpoints | null = null;
  private _mediaType: string = 'generic';

  constructor(data: { id: string; fromNodeId: string; fromAnchorId: string; toNodeId: string; toAnchorId: string }) {
    super('connection', data.id);
    this.data = data;
    this.selectable = true;
    this.draggable = false;
    this.layer = 5;
  }

  setEndpoints(endpoints: ConnectionEndpoints): void {
    this._endpoints = endpoints;
    if (endpoints.mediaType) {
      this._mediaType = endpoints.mediaType;
    }
    this.markDirty(1);
  }

  updateEndpoints(fromNode: any, toNode: any): void {
    const fromPort = fromNode.getOutputPort(this.data.fromAnchorId);
    const toPort = toNode.getInputPort(this.data.toAnchorId);
    if (fromPort && toPort) {
      this._endpoints = {
        fromWorld: fromPort.getWorldPosition(),
        toWorld: toPort.getWorldPosition(),
        mediaType: fromPort.mediaType
      };
      this._mediaType = fromPort.mediaType || 'generic';
      this.markDirty(1);
    }
  }

  private getColor(): string {
    return MEDIA_TYPE_COLORS[this._mediaType as keyof typeof MEDIA_TYPE_COLORS] || WF_PRIMARY;
  }

  private hexToRgba(hex: string, alpha: number): string {
    if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private getBezierPoints(from: Vector2, to: Vector2): { cp1: Vector2; cp2: Vector2 } {
    const dx = Math.abs(to.x - from.x);
    const controlDist = Math.max(BEZIER_CONTROL_DISTANCE, dx * 0.5);
    return {
      cp1: new Vector2(from.x + controlDist, from.y),
      cp2: new Vector2(to.x - controlDist, to.y)
    };
  }

  private getScreenBounds(camera: Camera): { from: Vector2; to: Vector2; cp1: Vector2; cp2: Vector2 } | null {
    if (!this._endpoints) return null;
    const from = camera.worldToScreen(this._endpoints.fromWorld);
    const to = camera.worldToScreen(this._endpoints.toWorld);
    const { cp1, cp2 } = this.getBezierPoints(
      camera.worldToScreen(this._endpoints.fromWorld),
      camera.worldToScreen(this._endpoints.toWorld)
    );
    return { from, to, cp1, cp2 };
  }

  protected renderSelf(ctx: RenderContext): void {
    const c = ctx.ctx;
    if (!this._endpoints) return;

    const from = this._endpoints.fromWorld;
    const to = this._endpoints.toWorld;
    const color = this.getColor();
    const { cp1, cp2 } = this.getBezierPoints(from, to);

    let lineWidth = LINE_WIDTH;
    let alpha = 0.7;
    let glowAlpha = 0;

    if (this.selected) {
      lineWidth = LINE_WIDTH_SELECTED;
      alpha = 1;
      glowAlpha = 0.35;
    } else if (this.hovered) {
      lineWidth = LINE_WIDTH_HOVER;
      alpha = 0.9;
      glowAlpha = 0.2;
    }

    c.save();

    if (glowAlpha > 0) {
      c.shadowColor = color;
      c.shadowBlur = 12;
      c.strokeStyle = this.hexToRgba(color, glowAlpha);
      c.lineWidth = lineWidth + 4;
      c.beginPath();
      c.moveTo(from.x, from.y);
      c.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, to.x, to.y);
      c.stroke();
      c.shadowBlur = 0;
    }

    c.strokeStyle = this.hexToRgba(color, alpha);
    c.lineWidth = lineWidth;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(from.x, from.y);
    c.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, to.x, to.y);
    c.stroke();

    c.strokeStyle = 'rgba(255,255,255,0.15)';
    c.lineWidth = Math.max(1, lineWidth - 1.5);
    c.beginPath();
    c.moveTo(from.x, from.y);
    c.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, to.x, to.y);
    c.stroke();

    c.restore();
  }

  private distanceToBezier(point: Vector2, from: Vector2, cp1: Vector2, cp2: Vector2, to: Vector2): number {
    let minDist = Infinity;
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const x = mt * mt * mt * from.x + 3 * mt * mt * t * cp1.x + 3 * mt * t * t * cp2.x + t * t * t * to.x;
      const y = mt * mt * mt * from.y + 3 * mt * mt * t * cp1.y + 3 * mt * t * t * cp2.y + t * t * t * to.y;
      const dist = Math.hypot(point.x - x, point.y - y);
      if (dist < minDist) minDist = dist;
    }
    return minDist;
  }

  getLocalBounds(): Rect {
    if (!this._endpoints) return new Rect(0, 0, 0, 0);
    const minX = Math.min(this._endpoints.fromWorld.x, this._endpoints.toWorld.x) - 20;
    const minY = Math.min(this._endpoints.fromWorld.y, this._endpoints.toWorld.y) - 20;
    const maxX = Math.max(this._endpoints.fromWorld.x, this._endpoints.toWorld.x) + 20;
    const maxY = Math.max(this._endpoints.fromWorld.y, this._endpoints.toWorld.y) + 20;
    return Rect.fromPoints(new Vector2(minX, minY), new Vector2(maxX, maxY));
  }

  getHitBounds(): Rect {
    return this.getLocalBounds();
  }

  isInFrustum(camera: Camera): boolean {
    if (!this._endpoints) return false;
    return camera.isWorldPointVisible(this._endpoints.fromWorld, 50) ||
           camera.isWorldPointVisible(this._endpoints.toWorld, 50);
  }

  protected hitTestSelf(localPoint: Vector2): HitTestResult | null {
    if (!this._endpoints) return null;
    const from = this._endpoints.fromWorld;
    const to = this._endpoints.toWorld;
    const { cp1, cp2 } = this.getBezierPoints(from, to);
    const dist = this.distanceToBezier(localPoint, from, cp1, cp2, to);
    if (dist <= HIT_WIDTH) {
      return {
        node: this,
        localPoint: localPoint.clone(),
        worldPoint: localPoint.clone()
      };
    }
    return null;
  }

  onSelect(): void {
    this.selected = true;
    this.markDirty(1);
  }

  onDeselect(): void {
    this.selected = false;
    this.markDirty(1);
  }
}

export class TempConnection extends Node {
  fromWorld: Vector2 | null = null;
  toWorld: Vector2 | null = null;
  mediaType: string = 'generic';
  valid: boolean = true;

  constructor() {
    super('tempconnection', 'temp-connection');
    this.selectable = false;
    this.draggable = false;
    this.layer = 4;
  }

  setPoints(from: Vector2, to: Vector2, mediaType: string = 'generic', valid: boolean = true): void {
    this.fromWorld = from.clone();
    this.toWorld = to.clone();
    this.mediaType = mediaType;
    this.valid = valid;
    this.markDirty(1);
  }

  clear(): void {
    this.fromWorld = null;
    this.toWorld = null;
    this.markDirty(1);
  }

  private hexToRgba(hex: string, alpha: number): string {
    if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  protected renderSelf(ctx: RenderContext): void {
    const c = ctx.ctx;
    if (!this.fromWorld || !this.toWorld) return;

    const color = this.valid
      ? (MEDIA_TYPE_COLORS[this.mediaType as keyof typeof MEDIA_TYPE_COLORS] || WF_PRIMARY)
      : '#e74c3c';
    const dx = Math.abs(this.toWorld.x - this.fromWorld.x);
    const controlDist = Math.max(BEZIER_CONTROL_DISTANCE, dx * 0.5);
    const cp1 = new Vector2(this.fromWorld.x + controlDist, this.fromWorld.y);
    const cp2 = new Vector2(this.toWorld.x - controlDist, this.toWorld.y);

    c.save();
    c.strokeStyle = this.hexToRgba(color, 0.7);
    c.lineWidth = LINE_WIDTH;
    c.lineCap = 'round';
    c.setLineDash([6, 4]);
    c.beginPath();
    c.moveTo(this.fromWorld.x, this.fromWorld.y);
    c.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, this.toWorld.x, this.toWorld.y);
    c.stroke();
    c.setLineDash([]);
    c.restore();
  }

  getLocalBounds(): Rect {
    if (!this.fromWorld || !this.toWorld) return new Rect(0, 0, 0, 0);
    const minX = Math.min(this.fromWorld.x, this.toWorld.x) - 20;
    const minY = Math.min(this.fromWorld.y, this.toWorld.y) - 20;
    const maxX = Math.max(this.fromWorld.x, this.toWorld.x) + 20;
    const maxY = Math.max(this.fromWorld.y, this.toWorld.y) + 20;
    return Rect.fromPoints(new Vector2(minX, minY), new Vector2(maxX, maxY));
  }

  getHitBounds(): Rect {
    return new Rect(0, 0, 0, 0);
  }

  isInFrustum(camera: Camera): boolean {
    if (!this.fromWorld || !this.toWorld) return false;
    return camera.isWorldPointVisible(this.fromWorld, 50) ||
           camera.isWorldPointVisible(this.toWorld, 50);
  }

  protected hitTestSelf(_localPoint: Vector2): HitTestResult | null {
    return null;
  }
}
