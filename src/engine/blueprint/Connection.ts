import { Vector2 } from '../graphbase/core/Vector2';
import { Rect } from '../graphbase/core/Rect';
import { Node } from '../graphbase/scene/Node';
import type { RenderContext } from '../graphbase/renderer/RenderContext';
import type { HitTestResult } from '../graphbase/scene/interfaces';
import { bezierPoint, bezierTangent, bezierClosestPoint } from '../graphbase/core/Bezier';
import { MEDIA_TYPE_COLORS, type MediaType } from './types';

export interface ConnectionEndpoints {
  fromWorld: Vector2;
  toWorld: Vector2;
  mediaType: MediaType;
}

export class Connection extends Node {
  fromPortId: string;
  toPortId: string;
  fromNodeId: string;
  toNodeId: string;
  private _fromPos: Vector2 = new Vector2();
  private _toPos: Vector2 = new Vector2();
  mediaType: MediaType;
  hitWidth: number = 12;

  constructor(fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string, mediaType: MediaType = 'flow', id?: string) {
    super('connection', id);
    this.fromNodeId = fromNodeId;
    this.fromPortId = fromPortId;
    this.toNodeId = toNodeId;
    this.toPortId = toPortId;
    this.mediaType = mediaType;
    this.selectable = true;
    this.draggable = false;
    this.layer = 10;
  }

  setEndpoints(fromPos: Vector2, toPos: Vector2): void {
    this._fromPos.copy(fromPos);
    this._toPos.copy(toPos);
    this.markDirty(1);
  }

  getColor(): string {
    return MEDIA_TYPE_COLORS[this.mediaType] || MEDIA_TYPE_COLORS.generic;
  }

  private getControlPoints(): { cp1: Vector2; cp2: Vector2 } {
    const dx = Math.abs(this._toPos.x - this._fromPos.x);
    const cpOffset = Math.max(50, dx * 0.4);
    return {
      cp1: new Vector2(this._fromPos.x + cpOffset, this._fromPos.y),
      cp2: new Vector2(this._toPos.x - cpOffset, this._toPos.y)
    };
  }

  getLocalBounds(): Rect {
    const minX = Math.min(this._fromPos.x, this._toPos.x) - 20;
    const minY = Math.min(this._fromPos.y, this._toPos.y) - 20;
    const maxX = Math.max(this._fromPos.x, this._toPos.x) + 20;
    const maxY = Math.max(this._fromPos.y, this._toPos.y) + 20;
    return new Rect(minX, minY, maxX - minX, maxY - minY);
  }

  getWorldBounds(): Rect {
    return this.getLocalBounds();
  }

  protected renderSelf(ctx: RenderContext): void {
    const color = this.getColor();
    const { cp1, cp2 } = this.getControlPoints();
    const from = this._fromPos;
    const to = this._toPos;

    ctx.save();

    if (this.selected || this.hovered) {
      ctx.ctx.strokeStyle = this.selected ? '#ffffff' : color + '80';
      ctx.ctx.lineWidth = this.selected ? 5 : 8;
      ctx.ctx.lineCap = 'round';
      ctx.ctx.beginPath();
      ctx.ctx.moveTo(from.x, from.y);
      ctx.ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, to.x, to.y);
      ctx.ctx.stroke();
    }

    ctx.ctx.strokeStyle = color;
    ctx.ctx.lineWidth = this.selected ? 3 : 2.5;
    ctx.ctx.lineCap = 'round';
    ctx.ctx.beginPath();
    ctx.ctx.moveTo(from.x, from.y);
    ctx.ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, to.x, to.y);
    ctx.ctx.stroke();

    const arrowSize = 8;
    const t = 0.5;
    const point = bezierPoint(t, from, cp1, cp2, to);
    const tangent = bezierTangent(t, from, cp1, cp2, to).normalize();
    const perp = new Vector2(-tangent.y, tangent.x);

    ctx.ctx.fillStyle = color;
    ctx.ctx.beginPath();
    ctx.ctx.moveTo(point.x + tangent.x * arrowSize, point.y + tangent.y * arrowSize);
    ctx.ctx.lineTo(point.x - tangent.x * arrowSize * 0.5 + perp.x * arrowSize * 0.6, point.y - tangent.y * arrowSize * 0.5 + perp.y * arrowSize * 0.6);
    ctx.ctx.lineTo(point.x - tangent.x * arrowSize * 0.5 - perp.x * arrowSize * 0.6, point.y - tangent.y * arrowSize * 0.5 - perp.y * arrowSize * 0.6);
    ctx.ctx.closePath();
    ctx.ctx.fill();

    ctx.restore();
  }

  protected hitTestSelf(localPoint: Vector2): HitTestResult | null {
    const { cp1, cp2 } = this.getControlPoints();
    const closest = bezierClosestPoint(localPoint, this._fromPos, cp1, cp2, this._toPos, 20);
    if (closest.distance <= this.hitWidth) {
      return {
        node: this,
        localPoint: localPoint.clone(),
        worldPoint: localPoint.clone()
      };
    }
    return null;
  }
}
