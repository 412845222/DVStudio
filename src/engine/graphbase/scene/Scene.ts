import { Vector2 } from '../core/Vector2';
import { Rect } from '../core/Rect';
import { EventEmitter } from '../core/EventEmitter';
import { Disposable } from '../core/Disposable';
import { Group } from './Group';
import { Node } from './Node';
import { Canvas2DRenderer, type RendererOptions } from '../renderer/Canvas2DRenderer';
import type { Camera } from '../renderer/Camera';
import { InputManager } from '../input/InputManager';
import { SelectionManager } from '../input/SelectionManager';
import { DragManager } from '../input/DragManager';
import { ToolManager } from '../tools/ToolManager';
import { PanTool } from '../tools/PanTool';
import { SelectTool } from '../tools/SelectTool';
import { CommandStack } from '../commands/CommandStack';

export interface SceneOptions extends RendererOptions {
  enableDefaultTools?: boolean;
  background?: string;
}

export class Scene extends Group implements Disposable {
  readonly renderer: Canvas2DRenderer;
  readonly camera: Camera;
  readonly input: InputManager;
  readonly selection: SelectionManager;
  readonly drag: DragManager;
  readonly tools: ToolManager;
  readonly commands: CommandStack;
  readonly on: EventEmitter = new EventEmitter();

  background: string | null = null;
  private _started: boolean = false;
  private _canvas: HTMLCanvasElement;
  private _pendingViewportEmit: boolean = false;
  private _viewportEmitRAF: number = 0;

  constructor(canvas: HTMLCanvasElement, options?: SceneOptions) {
    super('scene', 'scene_root');
    this._canvas = canvas;
    this.renderer = new Canvas2DRenderer(canvas, {
      ...options,
      backgroundColor: options?.background
    });
    this.camera = this.renderer.camera;
    this.renderer.setScene(this);

    this.input = new InputManager(canvas, this);
    this.selection = new SelectionManager(this);
    this.drag = new DragManager();
    this.tools = new ToolManager(this, this.input, this.selection, this.drag);
    this.commands = new CommandStack();

    if (options?.background) {
      this.background = options.background;
    }

    if (options?.enableDefaultTools !== false) {
      this.tools.registerTool(new SelectTool());
      this.tools.registerTool(new PanTool());
      this.tools.setDefaultTool('select');
    }

    this.tools.setCursorElement(canvas);

    this.setupKeyboardShortcuts();
    if (options?.enableDefaultTools !== false) {
      this.setupWheelZoom();
    }
  }

  get started(): boolean {
    return this._started;
  }

  get canvas(): HTMLCanvasElement {
    return this._canvas;
  }

  private setupKeyboardShortcuts(): void {
    this.input.on.on('keydown', (e: unknown) => {
      const evt = e as { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; preventDefault: () => void };
      if ((evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 'z' && !evt.shiftKey) {
        evt.preventDefault();
        this.commands.undo();
        this.requestRedraw();
      }
      if ((evt.ctrlKey || evt.metaKey) && (evt.key.toLowerCase() === 'y' || (evt.shiftKey && evt.key.toLowerCase() === 'z'))) {
        evt.preventDefault();
        this.commands.redo();
        this.requestRedraw();
      }
      if (evt.key === ' ' && !evt.shiftKey) {
        const activeName = this.tools.getActiveToolName();
        if (activeName !== 'pan') {
          this.tools.setActiveTool('pan');
        }
      }
    });

    this.input.on.on('keyup', (e: unknown) => {
      const evt = e as { key: string };
      if (evt.key === ' ') {
        this.tools.resetToDefault();
      }
    });
  }

  private setupWheelZoom(): void {
    this.input.on.on('wheel', (e: unknown) => {
      const evt = e as { ctrlKey: boolean; metaKey: boolean; deltaY: number; screenPosition: Vector2; preventDefault: () => void };
      if (evt.ctrlKey || evt.metaKey) {
        evt.preventDefault();
        this.zoomAt(evt.screenPosition, evt.deltaY);
      }
    });
  }

  start(): void {
    if (this._started) return;
    this._started = true;
    this.renderer.start();
    this.on.emit('start');
  }

  stop(): void {
    if (!this._started) return;
    this._started = false;
    this.renderer.stop();
    this.on.emit('stop');
  }

  requestRedraw(fullRedraw: boolean = true): void {
    this.renderer.requestRedraw(fullRedraw);
  }

  screenToWorld(screenPoint: Vector2): Vector2 {
    return this.camera.screenToWorld(screenPoint);
  }

  worldToScreen(worldPoint: Vector2): Vector2 {
    return this.camera.worldToScreen(worldPoint);
  }

  setZoom(zoom: number, center?: Vector2): void {
    const changed = this.camera.setZoom(zoom, center);
    if (changed) {
      this.requestRedraw();
      this.scheduleViewportEmit();
    }
  }

  zoomAt(screenPoint: Vector2, delta: number): void {
    const changed = this.camera.zoomAt(screenPoint, delta);
    if (changed) {
      this.requestRedraw();
      this.scheduleViewportEmit();
    }
  }

  panBy(dx: number, dy: number): void {
    const changed = this.camera.panBy(dx, dy);
    if (changed) {
      this.requestRedraw();
      this.scheduleViewportEmit();
    }
  }

  panTo(x: number, y: number): void {
    this.camera.panTo(x, y);
    this.requestRedraw();
    this.scheduleViewportEmit();
  }

  centerOn(worldPoint: Vector2): void {
    this.camera.centerOn(worldPoint);
    this.requestRedraw();
    this.scheduleViewportEmit();
  }

  fitToContent(padding: number = 50): void {
    const bounds = this.getWorldBounds();
    if (!bounds.isEmpty) {
      this.camera.fitToWorldRect(bounds, padding);
      this.requestRedraw();
      this.flushViewportEmit();
    }
  }

  getViewport() {
    return {
      zoom: this.camera.zoom,
      panX: -this.camera.position.x * this.camera.zoom,
      panY: -this.camera.position.y * this.camera.zoom
    };
  }

  private scheduleViewportEmit(): void {
    if (this._pendingViewportEmit) return;
    this._pendingViewportEmit = true;
    this._viewportEmitRAF = requestAnimationFrame(() => {
      this._pendingViewportEmit = false;
      this._viewportEmitRAF = 0;
      this.on.emit('viewport-change', this.getViewport());
    });
  }

  private flushViewportEmit(): void {
    if (this._pendingViewportEmit) {
      cancelAnimationFrame(this._viewportEmitRAF);
      this._pendingViewportEmit = false;
      this._viewportEmitRAF = 0;
      this.on.emit('viewport-change', this.getViewport());
    }
  }

  setViewport(vp: { zoom?: number; panX?: number; panY?: number }): void {
    const oldZoom = this.camera.zoom;
    const oldPosX = this.camera.position.x;
    const oldPosY = this.camera.position.y;

    if (vp.zoom !== undefined) {
      this.camera.setZoomDirect(vp.zoom);
    }
    const safeZoom = Math.max(this.camera.zoom, 1e-6);
    if (vp.panX !== undefined) this.camera.setPositionDirect(-vp.panX / safeZoom, this.camera.position.y);
    if (vp.panY !== undefined) this.camera.setPositionDirect(this.camera.position.x, -vp.panY / safeZoom);

    const posChanged = Math.abs(this.camera.position.x - oldPosX) > 1e-6 ||
                       Math.abs(this.camera.position.y - oldPosY) > 1e-6;
    const zoomChanged = Math.abs(this.camera.zoom - oldZoom) > 1e-6;

    if (posChanged || zoomChanged) {
      this.requestRedraw();
      this.flushViewportEmit();
    }
  }

  hitTestPoint(screenPoint: Vector2): Node | null {
    const worldPoint = this.screenToWorld(screenPoint);
    const result = this.hitTest(worldPoint);
    return result?.node ?? null;
  }

  hitTest(worldPoint: Vector2) {
    const sortedChildren = [...this.children].sort((a, b) => (b as Node).layer - (a as Node).layer);
    for (let i = 0; i < sortedChildren.length; i++) {
      const child = sortedChildren[i] as Node;
      if (!child.visible) continue;
      const childLocal = child.worldToLocal(worldPoint);
      const hit = child.hitTest(childLocal);
      if (hit) return hit;
    }
    return null;
  }

  getNodeById<T extends Node>(id: string): T | null {
    return super.getNodeById(id) as T | null;
  }

  getAllNodes(): Node[] {
    return super.getAllNodes() as Node[];
  }

  addNode(node: Node): void {
    this.addChild(node);
    this.requestRedraw();
  }

  removeNode(node: Node): void {
    this.removeChild(node);
    this.requestRedraw();
  }

  clearAllNodes(): void {
    for (const child of [...this.children]) {
      this.removeChild(child);
    }
    this.selection.clearSelection();
    this.requestRedraw();
  }

  resize(width: number, height: number): void {
    this.renderer.resize(width, height);
  }

  render(ctx: import('../renderer/RenderContext').RenderContext): void {
    const dpr = (this.renderer as any).dpr || 1;
    const vm = this.camera.getViewMatrix();
    ctx.save();
    ctx.ctx.transform(
      vm.elements[0],
      vm.elements[1],
      vm.elements[3],
      vm.elements[4],
      vm.elements[6],
      vm.elements[7]
    );

    if (this.background) {
      const vp = this.camera.getWorldViewport();
      ctx.ctx.fillStyle = this.background;
      ctx.ctx.fillRect(vp.x, vp.y, vp.width, vp.height);
    }

    this.tools.renderUnderlay(ctx);

    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      if (child.visible) {
        child.render(ctx);
      }
    }

    this.tools.render(ctx);
    ctx.restore();
  }

  dispose(): void {
    this.stop();
    if (this._viewportEmitRAF) {
      cancelAnimationFrame(this._viewportEmitRAF);
      this._viewportEmitRAF = 0;
      this._pendingViewportEmit = false;
    }
    this.drag.cancelDrag();
    this.tools.dispose();
    this.selection.dispose();
    this.input.dispose();
    this.renderer.dispose();
    super.dispose();
    this.on.removeAllListeners();
  }
}
