import type { Vector2 } from '../core/Vector2';
import type { Rect } from '../core/Rect';
import type { RenderContext } from '../renderer/RenderContext';
import type { Node } from './Node';

export interface Renderable {
  visible: boolean;
  render(ctx: RenderContext): void;
  getRenderBounds(): Rect;
  isVisibleInViewport?(camera: { worldToScreen: (p: Vector2) => Vector2; screenToWorld: (p: Vector2) => Vector2; getWorldViewport: () => Rect }): boolean;
}

export interface HitTestable {
  hitTest(localPoint: Vector2, ctx?: RenderContext): HitTestResult | null;
  getHitBounds(): Rect;
}

export interface HitTestResult {
  node: Node;
  localPoint: Vector2;
  worldPoint: Vector2;
  data?: Record<string, unknown>;
  cursor?: string;
}

export interface Selectable {
  selected: boolean;
  selectable: boolean;
  onSelect(): void;
  onDeselect(): void;
}

export interface Draggable {
  draggable: boolean;
  dragging: boolean;
  onDragStart(event: unknown): void;
  onDragMove(delta: Vector2, event: unknown): void;
  onDragEnd(event: unknown): void;
}

export interface Connectable {
  connectionType: 'input' | 'output' | 'both';
  getConnectionPoint(): Vector2;
  canConnectTo(other: Connectable): boolean;
}
