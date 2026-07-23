import { Rect } from '../core/Rect';
import { Disposable } from '../core/Disposable';
import { EventEmitter } from '../core/EventEmitter';
import { Camera } from './Camera';
import { RenderContext } from './RenderContext';
import { DirtyRegionManager } from './DirtyRegionManager';
import type { Scene } from '../scene/Scene';
import type { Node } from '../scene/Node';

export interface RendererOptions {
  dpr?: number;
  backgroundColor?: string | null;
  autoResize?: boolean;
}

export class Canvas2DRenderer implements Disposable {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly camera: Camera;
  readonly on: EventEmitter = new EventEmitter();

  private scene: Scene | null = null;
  private rafId: number | null = null;
  private running: boolean = false;
  private lastTime: number = 0;
  private renderContext: RenderContext | null = null;
  private dirtyManager: DirtyRegionManager = new DirtyRegionManager();
  private fullRedraw: boolean = true;
  private dpr: number = 1;
  private backgroundColor: string | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement, options?: RendererOptions) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;

    const rect = canvas.getBoundingClientRect();
    this.camera = new Camera(new Rect(0, 0, rect.width, rect.height));

    this.dpr = options?.dpr ?? (window.devicePixelRatio || 1);
    this.backgroundColor = options?.backgroundColor ?? null;
    this.resize(rect.width, rect.height);

    if (options?.autoResize !== false) {
      this.setupAutoResize();
    }
  }

  private setupAutoResize(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            this.resize(width, height);
          }
        }
      });
      this.resizeObserver.observe(this.canvas);
    }
  }

  setScene(scene: Scene): void {
    this.scene = scene;
    this.requestRedraw(true);
  }

  setDPR(dpr: number): void {
    if (this.dpr !== dpr) {
      this.dpr = dpr;
      const rect = this.canvas.getBoundingClientRect();
      this.resize(rect.width, rect.height);
    }
  }

  setBackgroundColor(color: string | null): void {
    this.backgroundColor = color;
    this.requestRedraw(true);
  }

  resize(width: number, height: number): void {
    const displayWidth = Math.floor(width * this.dpr);
    const displayHeight = Math.floor(height * this.dpr);

    if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
      this.canvas.width = displayWidth;
      this.canvas.height = displayHeight;
    }

    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.camera.setViewport(new Rect(0, 0, width, height));

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.requestRedraw(true);
  }

  getSize(): { width: number; height: number } {
    return {
      width: this.canvas.width / this.dpr,
      height: this.canvas.height / this.dpr
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.tick(this.lastTime);
    this.on.emit('start');
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.on.emit('stop');
  }

  requestRedraw(fullRedraw: boolean = false): void {
    if (fullRedraw) {
      this.fullRedraw = true;
      this.dirtyManager.markAllDirty();
    }
  }

  requestRedrawRect(_worldRect: Rect): void {
    this.dirtyManager.markAllDirty();
  }

  private tick = (time: number): void => {
    if (!this.running) return;
    const deltaTime = (time - this.lastTime) / 1000;
    this.lastTime = time;

    try {
      this.render(deltaTime);
    } catch (e) {
      console.error('[Canvas2DRenderer] Render error:', e);
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  private render(deltaTime: number): void {
    if (!this.scene) return;

    const ctx = this.ctx;
    const vp = this.camera.viewport;

    if (!this.renderContext) {
      this.renderContext = new RenderContext(ctx, this.camera);
    }

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, vp.width, vp.height);

    this.renderContext.save();
    this.scene.update(deltaTime);
    this.scene.render(this.renderContext);
    this.renderContext.restore();

    this.fullRedraw = false;
    this.dirtyManager.clear();
    this.on.emit('render', { deltaTime });
  }

  private renderScene(ctx: RenderContext): void {
    if (!this.scene) return;

    const nodes = this.scene.getAllNodes();
    nodes.sort((a, b) => (a as Node).layer - (b as Node).layer);

    for (const node of nodes) {
      if (node.visible) {
        node.render(ctx);
      }
    }

    this.scene.render(ctx);
  }

  dispose(): void {
    this.stop();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.scene = null;
    this.on.removeAllListeners();
  }
}
