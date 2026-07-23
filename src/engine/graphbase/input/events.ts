import { Vector2 } from '../core/Vector2';
import type { Node } from '../scene/Node';
import type { HitTestResult } from '../scene/interfaces';

export interface PointerState {
  id: number;
  position: Vector2;
  lastPosition: Vector2;
  delta: Vector2;
  button: number;
  buttons: number;
  down: boolean;
  downPosition: Vector2;
  downTime: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export type PointerEventType = 'pointerdown' | 'pointermove' | 'pointerup' | 'pointerenter' | 'pointerleave' | 'click' | 'dblclick' | 'contextmenu';
export type KeyboardEventType = 'keydown' | 'keyup';
export type WheelEventType = 'wheel';

export interface GraphPointerEvent {
  type: PointerEventType;
  pointerId: number;
  screenPosition: Vector2;
  worldPosition: Vector2;
  localPosition: Vector2;
  delta: Vector2;
  button: number;
  buttons: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  hitResult: HitTestResult | null;
  target: Node | null;
  originalEvent: PointerEvent | MouseEvent;
  isDoubleClick: boolean;
  clickCount: number;
}

export interface GraphKeyboardEvent {
  type: KeyboardEventType;
  key: string;
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  repeat: boolean;
  originalEvent: KeyboardEvent;
  preventDefault: () => void;
}

export interface GraphWheelEvent {
  type: WheelEventType;
  screenPosition: Vector2;
  worldPosition: Vector2;
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  originalEvent: WheelEvent;
  preventDefault: () => void;
}
