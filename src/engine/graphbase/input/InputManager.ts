import { Vector2 } from '../core/Vector2';
import { EventEmitter } from '../core/EventEmitter';
import { Disposable } from '../core/Disposable';
import type { Scene } from '../scene/Scene';
import type { Node } from '../scene/Node';
import type { HitTestResult } from '../scene/interfaces';
import type { GraphPointerEvent, GraphKeyboardEvent, GraphWheelEvent, PointerState } from './events';

export class InputManager implements Disposable {
  private target: HTMLElement;
  private scene: Scene;
  readonly on: EventEmitter = new EventEmitter();

  private pointers: Map<number, PointerState> = new Map();
  private keys: Set<string> = new Set();
  private mousePosition: Vector2 = new Vector2();
  private primaryPointerId: number = -1;
  private clickCount: number = 0;
  private lastClickTime: number = 0;
  private lastClickPosition: Vector2 = new Vector2();
  private hoveredNode: Node | null = null;
  private disabled: boolean = false;

  private boundHandlers: Map<string, EventListener> = new Map();

  constructor(target: HTMLElement, scene: Scene) {
    this.target = target;
    this.scene = scene;
    this.attachListeners();
  }

  setDisabled(disabled: boolean): void {
    this.disabled = disabled;
  }

  private attachListeners(): void {
    const handlers: { event: string; handler: EventListener; options?: AddEventListenerOptions }[] = [
      { event: 'pointerdown', handler: this.onPointerDown as EventListener },
      { event: 'pointermove', handler: this.onPointerMove as EventListener },
      { event: 'pointerup', handler: this.onPointerUp as EventListener },
      { event: 'pointercancel', handler: this.onPointerUp as EventListener },
      { event: 'pointerleave', handler: this.onPointerLeave as EventListener },
      { event: 'contextmenu', handler: this.onContextMenu as EventListener },
      { event: 'wheel', handler: this.onWheel as EventListener, options: { passive: false } },
      { event: 'dblclick', handler: this.onDblClick as EventListener }
    ];

    for (const { event, handler, options } of handlers) {
      this.target.addEventListener(event, handler, options);
      this.boundHandlers.set(event, handler);
    }

    window.addEventListener('keydown', this.onKeyDown as EventListener);
    window.addEventListener('keyup', this.onKeyUp as EventListener);
    this.boundHandlers.set('keydown', this.onKeyDown as EventListener);
    this.boundHandlers.set('keyup', this.onKeyUp as EventListener);

    this.target.style.touchAction = 'none';
  }

  private detachListeners(): void {
    for (const [event, handler] of this.boundHandlers) {
      if (event === 'keydown' || event === 'keyup') {
        window.removeEventListener(event, handler);
      } else {
        this.target.removeEventListener(event, handler);
      }
    }
    this.boundHandlers.clear();
  }

  private getScreenPoint(e: PointerEvent | MouseEvent): Vector2 {
    const rect = this.target.getBoundingClientRect();
    return new Vector2(e.clientX - rect.left, e.clientY - rect.top);
  }

  private getOrCreatePointer(id: number, e: PointerEvent | MouseEvent): PointerState {
    let state = this.pointers.get(id);
    const screenPos = this.getScreenPoint(e);
    if (!state) {
      state = {
        id,
        position: screenPos.clone(),
        lastPosition: screenPos.clone(),
        delta: new Vector2(),
        button: (e as PointerEvent).button ?? 0,
        buttons: e.buttons,
        down: false,
        downPosition: screenPos.clone(),
        downTime: 0,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey
      };
      this.pointers.set(id, state);
    }
    return state;
  }

  private doHitTest(screenPos: Vector2): HitTestResult | null {
    const worldPos = this.scene.screenToWorld(screenPos);
    return this.scene.hitTest(worldPos);
  }

  private createPointerEvent(
    type: GraphPointerEvent['type'],
    state: PointerState,
    e: PointerEvent | MouseEvent,
    hitResult: HitTestResult | null
  ): GraphPointerEvent {
    const screenPos = state.position;
    const worldPos = this.scene.screenToWorld(screenPos);
    const isDblClick = type === 'dblclick';
    return {
      type,
      pointerId: state.id,
      screenPosition: screenPos.clone(),
      worldPosition: worldPos,
      localPosition: hitResult ? hitResult.localPoint.clone() : new Vector2(),
      delta: state.delta.clone(),
      button: state.button,
      buttons: state.buttons,
      ctrlKey: state.ctrlKey,
      shiftKey: state.shiftKey,
      altKey: state.altKey,
      metaKey: state.metaKey,
      hitResult,
      target: hitResult?.node ?? null,
      originalEvent: e as PointerEvent,
      isDoubleClick: isDblClick,
      clickCount: this.clickCount
    };
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.disabled) return;
    e.preventDefault();
    try { this.target.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    const screenPos = this.getScreenPoint(e);
    const state = this.getOrCreatePointer(e.pointerId, e);
    state.position.copy(screenPos);
    state.lastPosition.copy(screenPos);
    state.delta.set(0, 0);
    state.button = e.button;
    state.buttons = e.buttons;
    state.down = true;
    state.downPosition.copy(screenPos);
    state.downTime = performance.now();
    state.ctrlKey = e.ctrlKey;
    state.shiftKey = e.shiftKey;
    state.altKey = e.altKey;
    state.metaKey = e.metaKey;

    this.primaryPointerId = e.pointerId;
    this.mousePosition.copy(screenPos);

    const hit = this.doHitTest(screenPos);
    const event = this.createPointerEvent('pointerdown', state, e, hit);
    this.on.emit('pointerdown', event);

    this.updateHover(hit?.node ?? null, state, e);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.disabled) return;
    const screenPos = this.getScreenPoint(e);
    let state = this.pointers.get(e.pointerId);
    if (!state) {
      state = this.getOrCreatePointer(e.pointerId, e);
    }
    state.lastPosition.copy(state.position);
    state.position.copy(screenPos);
    state.delta.set(screenPos.x - state.lastPosition.x, screenPos.y - state.lastPosition.y);
    state.buttons = e.buttons;
    state.ctrlKey = e.ctrlKey;
    state.shiftKey = e.shiftKey;
    state.altKey = e.altKey;
    state.metaKey = e.metaKey;

    this.mousePosition.copy(screenPos);

    const hit = this.doHitTest(screenPos);
    const event = this.createPointerEvent('pointermove', state, e, hit);
    this.on.emit('pointermove', event);

    if (!state.down) {
      this.updateHover(hit?.node ?? null, state, e);
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.disabled) return;
    const state = this.pointers.get(e.pointerId);
    if (!state) return;

    const screenPos = this.getScreenPoint(e);
    state.position.copy(screenPos);
    state.down = false;
    state.buttons = e.buttons;

    const hit = this.doHitTest(screenPos);
    const event = this.createPointerEvent('pointerup', state, e, hit);
    this.on.emit('pointerup', event);

    const dragDist = state.downPosition.distanceTo(screenPos);
    const now = performance.now();
    const isClick = dragDist < 5 && (now - state.downTime) < 500;

    if (isClick) {
      const timeSinceLastClick = now - this.lastClickTime;
      const posDist = state.downPosition.distanceTo(this.lastClickPosition);
      if (timeSinceLastClick < 300 && posDist < 5) {
        this.clickCount++;
      } else {
        this.clickCount = 1;
      }
      this.lastClickTime = now;
      this.lastClickPosition.copy(state.downPosition);

      const clickEvent = this.createPointerEvent('click', state, e, hit);
      clickEvent.clickCount = this.clickCount;
      this.on.emit('click', clickEvent);

      if (this.clickCount === 2) {
        const dblEvent = this.createPointerEvent('dblclick', state, e, hit);
        this.on.emit('dblclick', dblEvent);
        this.clickCount = 0;
      }
    }

    if (this.primaryPointerId === e.pointerId) {
      this.primaryPointerId = -1;
    }
    this.pointers.delete(e.pointerId);

    try {
      this.target.releasePointerCapture(e.pointerId);
    } catch {}

    this.updateHover(hit?.node ?? null, state, e);
  };

  private onPointerLeave = (e: PointerEvent): void => {
    if (this.disabled) return;
    this.updateHover(null, null, e);
  };

  private onContextMenu = (e: MouseEvent): void => {
    if (this.disabled) return;
    e.preventDefault();
    const screenPos = this.getScreenPoint(e);
    const hit = this.doHitTest(screenPos);
    const state = this.getOrCreatePointer(-1, e as PointerEvent);
    state.position.copy(screenPos);
    const event = this.createPointerEvent('contextmenu', state, e, hit);
    this.on.emit('contextmenu', event);
  };

  private onDblClick = (e: MouseEvent): void => {
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.disabled) return;
    e.preventDefault();
    const screenPos = this.getScreenPoint(e);
    const worldPos = this.scene.screenToWorld(screenPos);

    const event: GraphWheelEvent = {
      type: 'wheel',
      screenPosition: screenPos.clone(),
      worldPosition: worldPos,
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      deltaMode: e.deltaMode,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      originalEvent: e,
      preventDefault: () => e.preventDefault()
    };
    this.on.emit('wheel', event);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.disabled) return;
    const event: GraphKeyboardEvent = {
      type: 'keydown',
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      repeat: e.repeat,
      originalEvent: e,
      preventDefault: () => e.preventDefault()
    };
    this.keys.add(e.key.toLowerCase());
    this.on.emit('keydown', event);

    const target = e.target as HTMLElement;
    if (target === this.target || this.target.contains(target)) {
      if (['delete', 'backspace', 'escape'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (this.disabled) return;
    const event: GraphKeyboardEvent = {
      type: 'keyup',
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      repeat: e.repeat,
      originalEvent: e,
      preventDefault: () => e.preventDefault()
    };
    this.keys.delete(e.key.toLowerCase());
    this.on.emit('keyup', event);
  };

  private updateHover(node: Node | null, _state: PointerState | null, _e: Event): void {
    if (node !== this.hoveredNode) {
      if (this.hoveredNode) {
        this.hoveredNode.onHoverEnd();
      }
      this.hoveredNode = node;
      if (this.hoveredNode) {
        this.hoveredNode.onHoverStart();
      }
      this.scene.requestRedraw();
    }
  }

  getMousePosition(): Vector2 {
    return this.mousePosition.clone();
  }

  getWorldMousePosition(): Vector2 {
    return this.scene.screenToWorld(this.mousePosition);
  }

  isKeyDown(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }

  getHoveredNode(): Node | null {
    return this.hoveredNode;
  }

  dispose(): void {
    this.detachListeners();
    this.pointers.clear();
    this.keys.clear();
    this.hoveredNode = null;
    this.on.removeAllListeners();
  }
}
