import { Vector2 } from '../core/Vector2';
import { Rect } from '../core/Rect';
import { GraphObject } from './GraphObject';
import type { RenderContext } from '../renderer/RenderContext';
import type { HitTestResult, Renderable, HitTestable, Selectable, Draggable } from './interfaces';

export abstract class Node extends GraphObject implements Renderable, HitTestable {
  fill: string | CanvasGradient | CanvasPattern | null = null;
  stroke: string | CanvasGradient | CanvasPattern | null = null;
  strokeWidth: number = 1;
  shadowColor: string | null = null;
  shadowBlur: number = 0;
  shadowOffsetX: number = 0;
  shadowOffsetY: number = 0;

  selected: boolean = false;
  hovered: boolean = false;
  selectable: boolean = true;
  draggable: boolean = false;
  dragging: boolean = false;

  layer: number = 30;
  alpha: number = 1;

  constructor(type: string, id?: string) {
    super(type, id);
  }

  getLocalBounds(): Rect {
    return new Rect(0, 0, 0, 0);
  }

  getHitBounds(): Rect {
    return this.getLocalBounds();
  }

  getRenderBounds(): Rect {
    return this.getLocalBounds();
  }

  protected applyStyle(ctx: RenderContext): void {
    if (this.fill !== null) {
      ctx.ctx.fillStyle = this.fill;
    }
    if (this.stroke !== null) {
      ctx.ctx.strokeStyle = this.stroke;
      ctx.ctx.lineWidth = this.strokeWidth;
    }
    if (this.shadowColor !== null) {
      ctx.ctx.shadowColor = this.shadowColor;
      ctx.ctx.shadowBlur = this.shadowBlur;
      ctx.ctx.shadowOffsetX = this.shadowOffsetX;
      ctx.ctx.shadowOffsetY = this.shadowOffsetY;
    }
    ctx.ctx.globalAlpha = this.opacity * this.alpha;
  }

  protected clearShadow(ctx: RenderContext): void {
    ctx.ctx.shadowColor = 'transparent';
    ctx.ctx.shadowBlur = 0;
    ctx.ctx.shadowOffsetX = 0;
    ctx.ctx.shadowOffsetY = 0;
  }

  protected abstract renderSelf(ctx: RenderContext): void;
  protected abstract hitTestSelf(localPoint: Vector2): HitTestResult | null;

  render(ctx: RenderContext): void {
    if (!this.visible) return;

    const worldMatrix = this.getWorldMatrix();
    const worldBounds = this.getWorldBounds();
    if (ctx.camera && !ctx.camera.isWorldRectVisible(worldBounds)) {
      return;
    }

    ctx.save();
    ctx.ctx.transform(
      worldMatrix.elements[0],
      worldMatrix.elements[1],
      worldMatrix.elements[3],
      worldMatrix.elements[4],
      worldMatrix.elements[6],
      worldMatrix.elements[7]
    );
    this.applyStyle(ctx);
    this.renderSelf(ctx);
    this.clearShadow(ctx);

    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      if (child.visible) {
        child.render(ctx);
      }
    }

    ctx.restore();
  }

  hitTest(localPoint: Vector2): HitTestResult | null {
    if (!this.visible) return null;

    for (let i = this.children.length - 1; i >= 0; i--) {
      const child = this.children[i];
      if (child.visible && 'hitTest' in child) {
        const childLocal = child.worldToLocal(this.localToWorld(localPoint));
        const childHit = (child as unknown as HitTestable).hitTest(childLocal);
        if (childHit) return childHit;
      }
    }

    const hitBounds = this.getHitBounds();
    if (!hitBounds.containsPoint(localPoint)) return null;

    const selfHit = this.hitTestSelf(localPoint);
    if (selfHit) return selfHit;

    if (this.selectable || this.draggable) {
      return {
        node: this,
        localPoint: localPoint.clone(),
        worldPoint: this.localToWorld(localPoint)
      };
    }

    return null;
  }

  onSelect(): void {
    this.selected = true;
    this.markDirty();
    this.on.emit('select');
  }

  onDeselect(): void {
    this.selected = false;
    this.markDirty();
    this.on.emit('deselect');
  }

  onHoverStart(): void {
    this.hovered = true;
    this.markDirty();
    this.on.emit('hoverstart');
  }

  onHoverEnd(): void {
    this.hovered = false;
    this.markDirty();
    this.on.emit('hoverend');
  }

  onDragStart(_event: unknown): void {
    this.dragging = true;
    this.on.emit('dragstart');
  }

  onDragMove(_delta: Vector2, _event: unknown): void {
    this.on.emit('dragmove');
  }

  onDragEnd(_event: unknown): void {
    this.dragging = false;
    this.on.emit('dragend');
  }

  dispose(): void {
    super.dispose();
  }
}
