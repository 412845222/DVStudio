import { Vector2 } from '../core/Vector2';
import { Rect } from '../core/Rect';
import { Bounds } from '../core/Bounds';
import { Node } from './Node';
import type { RenderContext } from '../renderer/RenderContext';
import type { HitTestResult } from './interfaces';
import { Layer } from './Layer';

export class Group extends Node {
  constructor(type: string = 'group', id?: string) {
    super(type, id);
    this.layer = Layer.NODES;
  }

  addChild(child: Node): void {
    super.addChild(child);
    this.sortChildren();
  }

  sortChildren(): void {
    this.children.sort((a, b) => {
      const aNode = a as Node;
      const bNode = b as Node;
      return aNode.zIndex - bNode.zIndex;
    });
  }

  getLocalBounds(): Rect {
    if (this.children.length === 0) {
      return new Rect(0, 0, 0, 0);
    }
    const bounds = new Bounds();
    for (const child of this.children) {
      if (child.visible) {
        const childBounds = child.getWorldBounds();
        bounds.addRect(childBounds);
      }
    }
    if (bounds.isEmpty()) return new Rect(0, 0, 0, 0);
    const worldPos = this.getWorldPosition();
    return new Rect(
      bounds.min.x - worldPos.x,
      bounds.min.y - worldPos.y,
      bounds.size.x,
      bounds.size.y
    );
  }

  protected renderSelf(_ctx: RenderContext): void {
  }

  protected hitTestSelf(_localPoint: Vector2): HitTestResult | null {
    return null;
  }

  getNodeById<T extends Node>(id: string): T | null {
    if (this.id === id) return this as unknown as T;
    for (const child of this.children) {
      if (child.id === id) return child as T;
      if (child instanceof Group) {
        const found = child.getNodeById(id);
        if (found) return found as T;
      }
    }
    return null;
  }

  getNodesByType<T extends Node>(type: string): T[] {
    const result: T[] = [];
    this.collectNodesByType(type, result);
    return result;
  }

  private collectNodesByType<T extends Node>(type: string, result: T[]): void {
    for (const child of this.children) {
      if (child.type === type) {
        result.push(child as T);
      }
      if (child instanceof Group) {
        child.collectNodesByType(type, result);
      }
    }
  }

  getAllNodes(): Node[] {
    const result: Node[] = [];
    this.collectAllNodes(result);
    return result;
  }

  private collectAllNodes(result: Node[]): void {
    for (const child of this.children) {
      result.push(child as Node);
      if (child instanceof Group) {
        child.collectAllNodes(result);
      }
    }
  }

  removeAllChildren(): void {
    for (const child of [...this.children]) {
      this.removeChild(child);
    }
  }

  render(ctx: RenderContext): void {
    if (!this.visible) return;

    const worldBounds = this.getWorldBounds();
    if (ctx.camera && !ctx.camera.isWorldRectVisible(worldBounds)) {
      return;
    }

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
}
