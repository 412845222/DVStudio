import { Vector2 } from './Vector2';

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function inverseLerp(a: number, b: number, value: number): number {
  if (Math.abs(b - a) < 1e-6) return 0;
  return (value - a) / (b - a);
}

export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  const t = inverseLerp(inMin, inMax, value);
  return lerp(outMin, outMax, clamp(t, 0, 1));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function pingPong(t: number, length: number): number {
  const mod = t % (length * 2);
  return mod < length ? mod : length * 2 - mod;
}

export function distanceToLineSegment(
  point: Vector2,
  a: Vector2,
  b: Vector2
): { distance: number; point: Vector2; t: number } {
  const ab = b.sub(a);
  const ap = point.sub(a);
  const abLenSq = ab.lengthSq();

  if (abLenSq < 1e-8) {
    return { distance: point.distanceTo(a), point: a.clone(), t: 0 };
  }

  let t = ap.dot(ab) / abLenSq;
  t = clamp(t, 0, 1);
  const closest = a.add(ab.mul(t));
  return {
    distance: point.distanceTo(closest),
    point: closest,
    t
  };
}

export function degrees(rad: number): number {
  return rad * RAD2DEG;
}

export function radians(deg: number): number {
  return deg * DEG2RAD;
}

export function snapToGrid(value: number, gridSize: number): number {
  if (gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

export function snapPointToGrid(point: Vector2, gridSize: number): Vector2 {
  return new Vector2(
    snapToGrid(point.x, gridSize),
    snapToGrid(point.y, gridSize)
  );
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function isPointInPolygon(point: Vector2, polygon: Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function now(): number {
  return performance.now();
}

export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  let lastArgs: Parameters<T> | null = null;
  return function (this: unknown, ...args: Parameters<T>) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs) {
          fn.apply(this, lastArgs);
          lastArgs = null;
        }
      }, limit);
    } else {
      lastArgs = args;
    }
  };
}

export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return function (this: unknown, ...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      fn.apply(this, args);
      timeout = null;
    }, wait);
  };
}
