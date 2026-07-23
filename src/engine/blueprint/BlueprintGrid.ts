import { Vector2 } from '../graphbase/core/Vector2';
import { Rect } from '../graphbase/core/Rect';
import { Node } from '../graphbase/scene/Node';
import type { RenderContext } from '../graphbase/renderer/RenderContext';
import { GRID_STEP, GRID_MAJOR_EVERY, GRID_COLOR, GRID_MAJOR_COLOR, BACKGROUND_COLOR } from './types';

export class BlueprintGrid extends Node {
  constructor() {
    super('grid');
    this.selectable = false;
    this.draggable = false;
    this.layer = -9999;
  }

  render(ctx: RenderContext): void {
    if (!this.visible) return;

    const localMatrix = this.transform.getLocalMatrix();

    ctx.save();
    ctx.ctx.transform(
      localMatrix.elements[0],
      localMatrix.elements[1],
      localMatrix.elements[3],
      localMatrix.elements[4],
      localMatrix.elements[6],
      localMatrix.elements[7]
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

  protected renderSelf(ctx: RenderContext): void {
    const c = ctx.ctx;
    const camera = ctx.camera;
    const worldVp = camera.getWorldViewport();

    c.fillStyle = BACKGROUND_COLOR;
    c.fillRect(worldVp.left, worldVp.top, worldVp.width, worldVp.height);

    if (camera.zoom * GRID_STEP < 6) {
      return;
    }

    const startX = Math.floor(worldVp.left / GRID_STEP) * GRID_STEP;
    const endX = Math.ceil(worldVp.right / GRID_STEP) * GRID_STEP;
    const startY = Math.floor(worldVp.top / GRID_STEP) * GRID_STEP;
    const endY = Math.ceil(worldVp.bottom / GRID_STEP) * GRID_STEP;

    c.lineWidth = 1 / camera.zoom;

    c.beginPath();
    c.strokeStyle = GRID_COLOR;
    for (let x = startX; x <= endX; x += GRID_STEP) {
      const col = Math.round(x / GRID_STEP);
      if (col % GRID_MAJOR_EVERY === 0) continue;
      c.moveTo(x, worldVp.top);
      c.lineTo(x, worldVp.bottom);
    }
    for (let y = startY; y <= endY; y += GRID_STEP) {
      const row = Math.round(y / GRID_STEP);
      if (row % GRID_MAJOR_EVERY === 0) continue;
      c.moveTo(worldVp.left, y);
      c.lineTo(worldVp.right, y);
    }
    c.stroke();

    c.beginPath();
    c.strokeStyle = GRID_MAJOR_COLOR;
    for (let x = startX; x <= endX; x += GRID_STEP) {
      const col = Math.round(x / GRID_STEP);
      if (col % GRID_MAJOR_EVERY !== 0) continue;
      c.moveTo(x, worldVp.top);
      c.lineTo(x, worldVp.bottom);
    }
    for (let y = startY; y <= endY; y += GRID_STEP) {
      const row = Math.round(y / GRID_STEP);
      if (row % GRID_MAJOR_EVERY !== 0) continue;
      c.moveTo(worldVp.left, y);
      c.lineTo(worldVp.right, y);
    }
    c.stroke();
  }

  getLocalBounds(): Rect {
    return new Rect(0, 0, 0, 0);
  }

  getWorldBounds(): Rect {
    return new Rect(0, 0, 0, 0);
  }

  protected hitTestSelf(_localPoint: Vector2): null {
    return null;
  }
}
