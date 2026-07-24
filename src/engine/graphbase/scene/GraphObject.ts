import { Vector2 } from '../core/Vector2';
import { Matrix3 } from '../core/Matrix3';
import { Rect } from '../core/Rect';
import { EventEmitter } from '../core/EventEmitter';
import { generateId } from '../core/ID';
import { Disposable } from '../core/Disposable';
import { Transform } from './Transform';
import { DirtyFlag } from './Layer';
import type { HitTestResult } from './interfaces';
import type { RenderContext } from '../renderer/RenderContext';
import type { Group } from './Group';

export abstract class GraphObject implements Disposable {
  readonly id: string;
  readonly type: string;

  parent: Group | null = null;
  readonly children: GraphObject[] = [];

  visible: boolean = true;
  zIndex: number = 0;
  opacity: number = 1;

  readonly transform: Transform = new Transform();
  private _worldMatrix: Matrix3 = new Matrix3();
  private _worldMatrixDirty: boolean = true;

  protected _dirtyFlags: number = DirtyFlag.ALL;
  protected _localBoundsCache: Rect | null = null;
  protected _worldBoundsCache: Rect | null = null;

  readonly on: EventEmitter = new EventEmitter();
  protected _disposed: boolean = false;

  constructor(type: string, id?: string) {
    this.type = type;
    this.id = id ?? generateId(type);
  }

  get disposed(): boolean {
    return this._disposed;
  }

  markDirty(flags: number = DirtyFlag.ALL): void {
    this._dirtyFlags |= flags;
    if (flags & DirtyFlag.TRANSFORM) {
      this._worldMatrixDirty = true;
      this._worldBoundsCache = null;
      for (const child of this.children) {
        child.markDirty(DirtyFlag.TRANSFORM);
      }
    }
    if (flags & DirtyFlag.CHILDREN) {
      this._localBoundsCache = null;
      this._worldBoundsCache = null;
      if (this.parent) {
        this.parent.markDirty(DirtyFlag.CHILDREN);
      }
    }
    if (this.parent && !(flags & DirtyFlag.CHILDREN)) {
      this.parent.markDirty(DirtyFlag.CHILDREN);
    }
    this.on.emit('dirty', flags);
  }

  clearDirty(): void {
    this._dirtyFlags = DirtyFlag.NONE;
    this._localBoundsCache = null;
  }

  isDirty(flag: number = DirtyFlag.ALL): boolean {
    return (this._dirtyFlags & flag) !== 0;
  }

  getWorldMatrix(): Matrix3 {
    if (this._worldMatrixDirty || this.transform.isDirty()) {
      const localMatrix = this.transform.getLocalMatrix();
      if (this.parent) {
        this._worldMatrix.copy(this.parent.getWorldMatrix()).multiply(localMatrix);
      } else {
        this._worldMatrix.copy(localMatrix);
      }
      this._worldMatrixDirty = false;
    }
    return this._worldMatrix;
  }

  getWorldPosition(): Vector2 {
    const m = this.getWorldMatrix();
    return new Vector2(m.elements[6], m.elements[7]);
  }

  localToWorld(local: Vector2): Vector2 {
    return this.getWorldMatrix().transformPoint(local);
  }

  worldToLocal(world: Vector2): Vector2 {
    const inv = this.getWorldMatrix().clone().invert();
    return inv.transformPoint(world);
  }

  addChild(child: GraphObject): void {
    if (child.parent) {
      child.parent.removeChild(child);
    }
    child.parent = this as unknown as Group;
    this.children.push(child);
    child._worldMatrixDirty = true;
    this.markDirty(DirtyFlag.CHILDREN);
    child.on.emit('added', this);
    this.on.emit('child-added', child);
  }

  removeChild(child: GraphObject): void {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parent = null;
      this.markDirty(DirtyFlag.CHILDREN);
      child.on.emit('removed', this);
      this.on.emit('child-removed', child);
    }
  }

  removeFromParent(): void {
    if (this.parent) {
      this.parent.removeChild(this);
    }
  }

  setPosition(x: number, y: number): this {
    this.transform.setPosition(x, y);
    this.markDirty(DirtyFlag.TRANSFORM);
    return this;
  }

  setRotation(angle: number): this {
    this.transform.setRotation(angle);
    this.markDirty(DirtyFlag.TRANSFORM);
    return this;
  }

  setScale(sx: number, sy?: number): this {
    this.transform.setScale(sx, sy);
    this.markDirty(DirtyFlag.TRANSFORM);
    return this;
  }

  translate(dx: number, dy: number): this {
    this.transform.translate(dx, dy);
    this.markDirty(DirtyFlag.TRANSFORM);
    return this;
  }

  abstract getLocalBounds(): Rect;

  getWorldBounds(): Rect {
    if (!this._worldBoundsCache) {
      this._worldBoundsCache = this.getLocalBounds().transform(this.getWorldMatrix());
    }
    return this._worldBoundsCache;
  }

  update(deltaTime: number): void {
    for (const child of this.children) {
      if (child.visible) {
        child.update(deltaTime);
      }
    }
  }

  abstract render(ctx: RenderContext): void;

  hitTest(_localPoint: Vector2): HitTestResult | null {
    return null;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    for (const child of [...this.children]) {
      child.dispose();
    }
    this.children.length = 0;
    this.parent = null;
    this.on.removeAllListeners();
  }
}
