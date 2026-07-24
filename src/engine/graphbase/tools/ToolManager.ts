import { EventEmitter } from '../core/EventEmitter';
import { Disposable } from '../core/Disposable';
import type { Scene } from '../scene/Scene';
import type { InputManager } from '../input/InputManager';
import type { SelectionManager } from '../input/SelectionManager';
import type { DragManager } from '../input/DragManager';
import type { GraphPointerEvent, GraphKeyboardEvent, GraphWheelEvent } from '../input/events';
import type { HitTestResult } from '../scene/interfaces';
import type { RenderContext } from '../renderer/RenderContext';
import { Tool } from './Tool';

export class ToolManager implements Disposable {
  private tools: Map<string, Tool> = new Map();
  private activeTool: Tool | null = null;
  private defaultTool: Tool | null = null;
  private cursorElement: HTMLElement | null = null;
  private currentCursor: string = 'default';
  readonly on: EventEmitter = new EventEmitter();

  readonly scene: Scene;
  readonly input: InputManager;
  readonly selection: SelectionManager;
  readonly drag: DragManager;

  private unsubscribeInput: (() => void)[] = [];

  constructor(scene: Scene, input: InputManager, selection: SelectionManager, drag: DragManager) {
    this.scene = scene;
    this.input = input;
    this.selection = selection;
    this.drag = drag;
    this.attachInput();
  }

  setCursorElement(el: HTMLElement | null): void {
    this.cursorElement = el;
  }

  setCursor(cursor: string): void {
    this.currentCursor = cursor;
    if (this.cursorElement) {
      this.cursorElement.style.cursor = cursor;
    }
  }

  registerTool(tool: Tool): void {
    tool.manager = this;
    this.tools.set(tool.name, tool);
    if (!this.defaultTool) {
      this.setDefaultTool(tool.name);
    }
  }

  getTool<T extends Tool>(name: string): T | null {
    return (this.tools.get(name) as T) ?? null;
  }

  setActiveTool(name: string): void {
    const tool = this.tools.get(name);
    if (!tool || !tool.enabled) return;
    if (this.activeTool === tool) return;

    if (this.activeTool) {
      this.activeTool.active = false;
      this.activeTool.onDeactivate();
    }

    this.activeTool = tool;
    tool.active = true;
    this.setCursor(tool.cursor);
    tool.onActivate();
    this.scene.requestRedraw();
    this.on.emit('tool-changed', { tool: name });
  }

  getActiveTool(): Tool | null {
    return this.activeTool;
  }

  getActiveToolName(): string | null {
    return this.activeTool?.name ?? null;
  }

  setDefaultTool(name: string): void {
    this.defaultTool = this.tools.get(name) ?? null;
    if (!this.activeTool && this.defaultTool) {
      this.setActiveTool(name);
    }
  }

  resetToDefault(): void {
    if (this.defaultTool) {
      this.setActiveTool(this.defaultTool.name);
    }
  }

  private attachInput(): void {
    const unsub1 = this.input.on.on('pointerdown', (e: unknown) => {
      const evt = e as GraphPointerEvent;
      this.activeTool?.onPointerDown(evt, evt.hitResult);
    });
    const unsub2 = this.input.on.on('pointermove', (e: unknown) => {
      const evt = e as GraphPointerEvent;
      this.activeTool?.onPointerMove(evt, evt.hitResult);
    });
    const unsub3 = this.input.on.on('pointerup', (e: unknown) => {
      const evt = e as GraphPointerEvent;
      this.activeTool?.onPointerUp(evt, evt.hitResult);
    });
    const unsub4 = this.input.on.on('wheel', (e: unknown) => {
      this.activeTool?.onWheel(e as GraphWheelEvent);
    });
    const unsub5 = this.input.on.on('keydown', (e: unknown) => {
      this.activeTool?.onKeyDown(e as GraphKeyboardEvent);
    });
    const unsub6 = this.input.on.on('keyup', (e: unknown) => {
      this.activeTool?.onKeyUp(e as GraphKeyboardEvent);
    });

    this.unsubscribeInput.push(unsub1, unsub2, unsub3, unsub4, unsub5, unsub6);
  }

  renderUnderlay(ctx: RenderContext): void {
    this.activeTool?.onPreRender(ctx);
  }

  render(ctx: RenderContext): void {
    this.activeTool?.onRender(ctx);
  }

  dispose(): void {
    for (const unsub of this.unsubscribeInput) {
      unsub();
    }
    this.unsubscribeInput = [];
    for (const tool of this.tools.values()) {
      if (tool.active) {
        tool.onDeactivate();
        tool.active = false;
      }
      tool.manager = null;
    }
    this.tools.clear();
    this.activeTool = null;
    this.defaultTool = null;
    this.on.removeAllListeners();
  }
}
