import { Vector2 } from '../graphbase/core/Vector2';
import { Rect } from '../graphbase/core/Rect';
import { Node } from '../graphbase/scene/Node';
import type { RenderContext } from '../graphbase/renderer/RenderContext';
import type { HitTestResult } from '../graphbase/scene/interfaces';
import { PORT_RADIUS, PORT_HOVER_RADIUS, MEDIA_TYPE_COLORS, type PortSpec, type MediaType } from './types';

export class Port extends Node {
  spec: PortSpec;
  isInput: boolean;
  connected: boolean = false;
  private _nodeWidth: number = 0;

  constructor(spec: PortSpec, isInput: boolean, nodeWidth: number, id?: string) {
    super('port', id);
    this.spec = spec;
    this.isInput = isInput;
    this.selectable = false;
    this.draggable = false;
    this._nodeWidth = nodeWidth;
    this.updatePosition();
  }

  updateNodeSize(width: number): void {
    this._nodeWidth = width;
    this.updatePosition();
  }

  private updatePosition(): void {
    const y = (this.spec.offsetY ?? 0);
    const x = this.isInput ? 0 : this._nodeWidth;
    this.transform.setPosition(x, y);
    this.transform.setAnchor(0, 0);
    this.markDirty(1);
  }

  get mediaType(): MediaType {
    return this.spec.mediaType ?? 'generic';
  }

  getColor(): string {
    return MEDIA_TYPE_COLORS[this.mediaType] || MEDIA_TYPE_COLORS.generic;
  }

  getWorldPosition(): Vector2 {
    return this.localToWorld(new Vector2(0, 0));
  }

  getLocalBounds(): Rect {
    const r = PORT_HOVER_RADIUS + 4;
    return new Rect(-r, -r, r * 2, r * 2);
  }

  getHitBounds(): Rect {
    return this.getLocalBounds();
  }

  protected renderSelf(ctx: RenderContext): void {
    const color = this.getColor();
    const isHovered = this.hovered;
    const actualR = isHovered ? PORT_HOVER_RADIUS : PORT_RADIUS;
    const center = new Vector2(0, 0);

    if (this.connected || isHovered) {
      ctx.drawCircle(center, actualR + 4, color + '33');
    }

    ctx.drawCircle(center, actualR, color, isHovered ? '#ffffff' : color, isHovered ? 2 : 1);

    ctx.drawCircle(center, actualR * 0.4, this.connected ? '#ffffff' : color);
  }

  protected hitTestSelf(localPoint: Vector2): HitTestResult | null {
    const r = PORT_HOVER_RADIUS + 4;
    const dist = localPoint.length();
    if (dist <= r) {
      return {
        node: this,
        localPoint: localPoint.clone(),
        worldPoint: this.localToWorld(localPoint)
      };
    }
    return null;
  }
}
