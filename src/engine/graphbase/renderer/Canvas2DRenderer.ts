import { Rect } from '../core/Rect';
import { Disposable } from '../core/Disposable';
import { EventEmitter } from '../core/EventEmitter';
import { Camera } from './Camera';
import { RenderContext } from './RenderContext';
import { DirtyRegionManager } from './DirtyRegionManager';
import type { Scene } from '../scene/Scene';

export interface RendererOptions {
  dpr?: number;
  backgroundColor?: string | null;
  autoResize?: boolean;
  doubleBuffer?: boolean;
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
  private backBufferContext: RenderContext | null = null;
  private dirtyManager: DirtyRegionManager = new DirtyRegionManager();
  private fullRedraw: boolean = true;
  private dpr: number = 1;
  private backgroundColor: string | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private backBuffer: HTMLCanvasElement | null = null;
  private backCtx: CanvasRenderingContext2D | null = null;
  private useDoubleBuffer: boolean = true;
  private needsRedraw: boolean = true;
  private forceContinuousFrames: number = 0;
  private idleFrames: number = 0;
  private static readonly MAX_IDLE_FRAMES = 5;

  constructor(canvas: HTMLCanvasElement, options?: RendererOptions) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;

    const rect = canvas.getBoundingClientRect();
    this.camera = new Camera(new Rect(0, 0, rect.width, rect.height));

    this.dpr = options?.dpr ?? (window.devicePixelRatio || 1);
    this.backgroundColor = options?.backgroundColor ?? null;
    this.useDoubleBuffer = options?.doubleBuffer !== false;
    this.resize(rect.width, rect.height);

    if (options?.autoResize === true) {
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

    if (this.useDoubleBuffer) {
      if (!this.backBuffer
          || this.backBuffer.width !== displayWidth
          || this.backBuffer.height !== displayHeight) {
        this.backBuffer = document.createElement('canvas');
        this.backBuffer.width = displayWidth;
        this.backBuffer.height = displayHeight;
        this.backCtx = this.backBuffer.getContext('2d', { alpha: true });
        this.backBufferContext = null;
      }
    } else {
      this.backBuffer = null;
      this.backCtx = null;
      this.backBufferContext = null;
    }

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
    this.idleFrames = 0;
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
    this.needsRedraw = true;
    this.idleFrames = 0;
    if (fullRedraw) {
      this.fullRedraw = true;
      this.dirtyManager.markAllDirty();
    }
    if (!this.running) {
      this.start();
    }
  }

  requestRedrawRect(worldRect: Rect): void {
    this.needsRedraw = true;
    this.idleFrames = 0;
    if (this.fullRedraw) return;
    const screenRect = worldRect.transform(this.camera.getViewMatrix());
    const padded = screenRect.inflate(4, 4);
    this.dirtyManager.markDirty(padded);
    if (!this.running) {
      this.start();
    }
  }

  requestContinuousFrames(frames: number = 3): void {
    this.forceContinuousFrames = Math.max(this.forceContinuousFrames, frames);
    this.idleFrames = 0;
    if (!this.running) {
      this.start();
    }
  }

  private tick = (time: number): void => {
    if (!this.running) return;
    const deltaTime = (time - this.lastTime) / 1000;
    this.lastTime = time;

    this.rafId = requestAnimationFrame(this.tick);

    let didRender = false;
    try {
      didRender = this.render(deltaTime);
      if (didRender) {
        this.on.emit('render', { deltaTime });
      }
    } catch (e) {
      console.error('[Canvas2DRenderer] Render error:', e);
    }

    const hasContinuousFrames = this.forceContinuousFrames > 0;
    if (this.forceContinuousFrames > 0) {
      this.forceContinuousFrames--;
    }

    if (!this.needsRedraw && !hasContinuousFrames && !didRender) {
      this.idleFrames++;
      if (this.idleFrames >= Canvas2DRenderer.MAX_IDLE_FRAMES) {
        this.stop();
      }
    } else {
      this.idleFrames = 0;
    }
  };

  private render(deltaTime: number): boolean {
    if (!this.scene) return false;

    if (this.scene.update) {
      this.scene.update(deltaTime);
    }

    const hasContinuousFrames = this.forceContinuousFrames > 0;

    if (!this.needsRedraw && !hasContinuousFrames) {
      return false;
    }
    this.needsRedraw = false;

    const vp = this.camera.viewport;

    if (this.useDoubleBuffer && this.backBuffer && this.backCtx) {
      this.renderToBackBuffer(vp);
    } else {
      this.renderToMain(vp);
    }

    this.fullRedraw = false;
    this.dirtyManager.clear();
    return true;
  }

  private renderToMain(vp: Rect): void {
    const ctx = this.ctx;

    if (!this.renderContext) {
      this.renderContext = new RenderContext(ctx, this.camera);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.renderContext.save();
    this.scene!.render(this.renderContext);
    this.renderContext.restore();
  }

  private renderToBackBuffer(vp: Rect): void {
    const frontCtx = this.ctx;
    const backCtx = this.backCtx!;
    const back = this.backBuffer!;

    if (!this.backBufferContext) {
      this.backBufferContext = new RenderContext(backCtx, this.camera);
    }

    backCtx.setTransform(1, 0, 0, 1, 0, 0);
    backCtx.clearRect(0, 0, back.width, back.height);

    backCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.backBufferContext.save();
    this.scene!.render(this.backBufferContext);
    this.backBufferContext.restore();

    frontCtx.setTransform(1, 0, 0, 1, 0, 0);
    frontCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    frontCtx.drawImage(back, 0, 0);
  }

  dispose(): void {
    this.stop();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.backBuffer = null;
    this.backCtx = null;
    this.backBufferContext = null;
    this.renderContext = null;
    this.scene = null;
    this.on.removeAllListeners();
  }
}
