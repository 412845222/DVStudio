import { Vector2 } from './Vector2';
import { Matrix3 } from './Matrix3';

export class Rect {
  x: number;
  y: number;
  width: number;
  height: number;

  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  get left(): number {
    return this.x;
  }

  get top(): number {
    return this.y;
  }

  get right(): number {
    return this.x + this.width;
  }

  get bottom(): number {
    return this.y + this.height;
  }

  get center(): Vector2 {
    return new Vector2(this.x + this.width / 2, this.y + this.height / 2);
  }

  get size(): Vector2 {
    return new Vector2(this.width, this.height);
  }

  get topLeft(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  get topRight(): Vector2 {
    return new Vector2(this.right, this.y);
  }

  get bottomLeft(): Vector2 {
    return new Vector2(this.x, this.bottom);
  }

  get bottomRight(): Vector2 {
    return new Vector2(this.right, this.bottom);
  }

  get isEmpty(): boolean {
    return this.width <= 0 || this.height <= 0;
  }

  get area(): number {
    return this.width * this.height;
  }

  set(x: number, y: number, width: number, height: number): this {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    return this;
  }

  clone(): Rect {
    return new Rect(this.x, this.y, this.width, this.height);
  }

  copy(r: Rect): this {
    this.x = r.x;
    this.y = r.y;
    this.width = r.width;
    this.height = r.height;
    return this;
  }

  contains(x: number, y: number): boolean {
    return x >= this.x && x <= this.right && y >= this.y && y <= this.bottom;
  }

  containsPoint(p: Vector2): boolean {
    return this.contains(p.x, p.y);
  }

  containsRect(r: Rect): boolean {
    return r.x >= this.x && r.right <= this.right &&
           r.y >= this.y && r.bottom <= this.bottom;
  }

  intersects(r: Rect): boolean {
    return !(r.x > this.right || r.right < this.x ||
             r.y > this.bottom || r.bottom < this.y);
  }

  intersection(r: Rect): Rect | null {
    if (!this.intersects(r)) return null;
    const x = Math.max(this.x, r.x);
    const y = Math.max(this.y, r.y);
    const right = Math.min(this.right, r.right);
    const bottom = Math.min(this.bottom, r.bottom);
    return new Rect(x, y, right - x, bottom - y);
  }

  union(r: Rect): Rect {
    if (this.isEmpty) return r.clone();
    if (r.isEmpty) return this.clone();
    const x = Math.min(this.x, r.x);
    const y = Math.min(this.y, r.y);
    const right = Math.max(this.right, r.right);
    const bottom = Math.max(this.bottom, r.bottom);
    return new Rect(x, y, right - x, bottom - y);
  }

  inflate(dx: number, dy: number): Rect {
    return new Rect(
      this.x - dx,
      this.y - dy,
      this.width + dx * 2,
      this.height + dy * 2
    );
  }

  offset(dx: number, dy: number): Rect {
    return new Rect(this.x + dx, this.y + dy, this.width, this.height);
  }

  transform(m: Matrix3): Rect {
    const p1 = m.transformPoint(new Vector2(this.x, this.y));
    const p2 = m.transformPoint(new Vector2(this.right, this.y));
    const p3 = m.transformPoint(new Vector2(this.right, this.bottom));
    const p4 = m.transformPoint(new Vector2(this.x, this.bottom));

    const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
    const minY = Math.min(p1.y, p2.y, p3.y, p4.y);
    const maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
    const maxY = Math.max(p1.y, p2.y, p3.y, p4.y);

    return new Rect(minX, minY, maxX - minX, maxY - minY);
  }

  equals(r: Rect, epsilon = 1e-6): boolean {
    return Math.abs(this.x - r.x) < epsilon &&
           Math.abs(this.y - r.y) < epsilon &&
           Math.abs(this.width - r.width) < epsilon &&
           Math.abs(this.height - r.height) < epsilon;
  }

  toString(): string {
    return `Rect(x:${this.x.toFixed(1)}, y:${this.y.toFixed(1)}, w:${this.width.toFixed(1)}, h:${this.height.toFixed(1)})`;
  }

  static fromPoints(p1: Vector2, p2: Vector2): Rect {
    const minX = Math.min(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxX = Math.max(p1.x, p2.x);
    const maxY = Math.max(p1.y, p2.y);
    return new Rect(minX, minY, maxX - minX, maxY - minY);
  }

  static fromCenter(center: Vector2, width: number, height: number): Rect {
    return new Rect(
      center.x - width / 2,
      center.y - height / 2,
      width,
      height
    );
  }

  static unionRects(rects: Rect[]): Rect {
    if (rects.length === 0) return new Rect();
    let result = rects[0].clone();
    for (let i = 1; i < rects.length; i++) {
      result = result.union(rects[i]);
    }
    return result;
  }

  static empty(): Rect {
    return new Rect(0, 0, 0, 0);
  }
}
