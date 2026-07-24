import { Vector2 } from '../core/Vector2';
import { Matrix3 } from '../core/Matrix3';
import { Rect } from '../core/Rect';

export class Camera {
  viewport: Rect;
  position: Vector2;
  zoom: number;
  rotation: number;
  minZoom: number;
  maxZoom: number;

  private viewMatrix: Matrix3;
  private inverseViewMatrix: Matrix3;
  private dirty: boolean;

  constructor(viewport?: Rect) {
    this.viewport = viewport ?? new Rect(0, 0, 800, 600);
    this.position = new Vector2(0, 0);
    this.zoom = 1;
    this.rotation = 0;
    this.minZoom = 0.1;
    this.maxZoom = 10;
    this.viewMatrix = new Matrix3();
    this.inverseViewMatrix = new Matrix3();
    this.dirty = true;
  }

  setViewport(viewport: Rect): void {
    this.viewport = viewport.clone();
    this.dirty = true;
  }

  setZoom(zoom: number, center?: Vector2): boolean {
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
    if (Math.abs(newZoom - this.zoom) < 1e-6) return false;

    if (center) {
      const worldBefore = this.screenToWorld(center);

      this.zoom = newZoom;
      this.dirty = true;

      const screenAfter = this.worldToScreen(worldBefore);
      const dx = center.x - screenAfter.x;
      const dy = center.y - screenAfter.y;
      this.panBy(dx, dy);
    } else {
      this.zoom = newZoom;
    }
    this.dirty = true;
    return true;
  }

  zoomAt(screenPoint: Vector2, delta: number): boolean {
    const factor = Math.exp(-delta * 0.001);
    return this.setZoom(this.zoom * factor, screenPoint);
  }

  panBy(dx: number, dy: number): boolean {
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return false;
    this.position.x -= dx / this.zoom;
    this.position.y -= dy / this.zoom;
    this.dirty = true;
    return true;
  }

  panTo(x: number, y: number): void {
    this.position.set(x, y);
    this.dirty = true;
  }

  centerOn(worldPoint: Vector2): void {
    this.position.copy(worldPoint);
    this.dirty = true;
  }

  fitToWorldRect(worldRect: Rect, padding: number = 50): void {
    if (worldRect.isEmpty) return;
    const vw = this.viewport.width - padding * 2;
    const vh = this.viewport.height - padding * 2;
    const scaleX = vw / worldRect.width;
    const scaleY = vh / worldRect.height;
    const newZoom = Math.min(scaleX, scaleY);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));
    this.position.copy(worldRect.center);
    this.dirty = true;
  }

  private updateMatrices(): void {
    if (!this.dirty) return;

    const vw = this.viewport.width;
    const vh = this.viewport.height;

    this.viewMatrix.identity();
    this.viewMatrix.translate(vw / 2, vh / 2);
    this.viewMatrix.scale(this.zoom, this.zoom);
    this.viewMatrix.rotate(this.rotation);
    this.viewMatrix.translate(-this.position.x, -this.position.y);

    this.inverseViewMatrix.copy(this.viewMatrix).invert();
    this.dirty = false;
  }

  getViewMatrix(): Matrix3 {
    this.updateMatrices();
    return this.viewMatrix;
  }

  getInverseViewMatrix(): Matrix3 {
    this.updateMatrices();
    return this.inverseViewMatrix;
  }

  worldToScreen(world: Vector2): Vector2 {
    return this.getViewMatrix().transformPoint(world);
  }

  screenToWorld(screen: Vector2): Vector2 {
    return this.getInverseViewMatrix().transformPoint(screen);
  }

  screenDeltaToWorld(screenDelta: Vector2): Vector2 {
    return new Vector2(screenDelta.x / this.zoom, screenDelta.y / this.zoom);
  }

  getWorldViewport(): Rect {
    const topLeft = this.screenToWorld(new Vector2(this.viewport.left, this.viewport.top));
    const bottomRight = this.screenToWorld(new Vector2(this.viewport.right, this.viewport.bottom));
    return Rect.fromPoints(topLeft, bottomRight);
  }

  isWorldPointVisible(world: Vector2, padding: number = 0): boolean {
    const screen = this.worldToScreen(world);
    const vp = this.viewport;
    return screen.x >= vp.left - padding && screen.x <= vp.right + padding &&
           screen.y >= vp.top - padding && screen.y <= vp.bottom + padding;
  }

  isWorldRectVisible(worldRect: Rect): boolean {
    const screenRect = worldRect.transform(this.getViewMatrix());
    return this.viewport.intersects(screenRect);
  }
}
