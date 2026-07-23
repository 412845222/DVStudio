import { Vector2 } from '../core/Vector2';
import { Matrix3 } from '../core/Matrix3';
import { Rect } from '../core/Rect';
import { Camera } from './Camera';

interface RenderState {
  transform: Matrix3;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  globalAlpha: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  miterLimit: number;
}

export class RenderContext {
  readonly ctx: CanvasRenderingContext2D;
  readonly camera: Camera;
  readonly viewport: Rect;
  private stateStack: RenderState[] = [];
  private currentTransform: Matrix3;

  constructor(ctx: CanvasRenderingContext2D, camera: Camera) {
    this.ctx = ctx;
    this.camera = camera;
    this.viewport = camera.viewport;
    this.currentTransform = new Matrix3();
  }

  save(): void {
    this.ctx.save();
    this.stateStack.push({
      transform: this.currentTransform.clone(),
      fillStyle: this.ctx.fillStyle as string,
      strokeStyle: this.ctx.strokeStyle as string,
      lineWidth: this.ctx.lineWidth,
      globalAlpha: this.ctx.globalAlpha,
      font: this.ctx.font,
      textAlign: this.ctx.textAlign,
      textBaseline: this.ctx.textBaseline,
      shadowColor: this.ctx.shadowColor,
      shadowBlur: this.ctx.shadowBlur,
      shadowOffsetX: this.ctx.shadowOffsetX,
      shadowOffsetY: this.ctx.shadowOffsetY,
      lineCap: this.ctx.lineCap,
      lineJoin: this.ctx.lineJoin,
      miterLimit: this.ctx.miterLimit
    });
  }

  restore(): void {
    if (this.stateStack.length > 0) {
      this.ctx.restore();
      const state = this.stateStack.pop()!;
      this.currentTransform = state.transform;
    }
  }

  setTransform(matrix: Matrix3): void {
    this.currentTransform.copy(matrix);
    this.applyTransformToContext();
  }

  private applyTransformToContext(): void {
    const e = this.currentTransform.elements;
    this.ctx.setTransform(e[0], e[1], e[3], e[4], e[6], e[7]);
  }

  translate(x: number, y: number): void {
    this.ctx.translate(x, y);
  }

  rotate(angle: number): void {
    this.ctx.rotate(angle);
  }

  scale(sx: number, sy: number): void {
    this.ctx.scale(sx, sy);
  }

  getWorldTransform(): Matrix3 {
    return this.currentTransform.clone();
  }

  applyFill(style: string | CanvasGradient | CanvasPattern): void {
    this.ctx.fillStyle = style;
  }

  applyStroke(style: string | CanvasGradient | CanvasPattern, width?: number): void {
    this.ctx.strokeStyle = style;
    if (width !== undefined) {
      this.ctx.lineWidth = width;
    }
  }

  applyShadow(color: string, blur: number = 0, offsetX: number = 0, offsetY: number = 0): void {
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = blur;
    this.ctx.shadowOffsetX = offsetX;
    this.ctx.shadowOffsetY = offsetY;
  }

  clearShadow(): void {
    this.ctx.shadowColor = 'transparent';
    this.ctx.shadowBlur = 0;
    this.ctx.shadowOffsetX = 0;
    this.ctx.shadowOffsetY = 0;
  }

  setFont(font: string): void {
    this.ctx.font = font;
  }

  setTextAlign(align: CanvasTextAlign): void {
    this.ctx.textAlign = align;
  }

  setTextBaseline(baseline: CanvasTextBaseline): void {
    this.ctx.textBaseline = baseline;
  }

  setGlobalAlpha(alpha: number): void {
    this.ctx.globalAlpha = alpha;
  }

  beginClip(rect: Rect): void {
    this.ctx.beginPath();
    this.ctx.rect(rect.x, rect.y, rect.width, rect.height);
    this.ctx.clip();
  }

  beginPath(): void {
    this.ctx.beginPath();
  }

  closePath(): void {
    this.ctx.closePath();
  }

  fill(): void {
    this.ctx.fill();
  }

  stroke(): void {
    this.ctx.stroke();
  }

  fillRect(rect: Rect): void {
    this.ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  strokeRect(rect: Rect): void {
    this.ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  }

  drawRect(rect: Rect, fill?: string | CanvasGradient | CanvasPattern, stroke?: string | CanvasGradient | CanvasPattern, lineWidth?: number): void {
    this.ctx.beginPath();
    this.ctx.rect(rect.x, rect.y, rect.width, rect.height);
    if (fill) {
      this.ctx.fillStyle = fill;
      this.ctx.fill();
    }
    if (stroke) {
      this.ctx.strokeStyle = stroke;
      if (lineWidth) this.ctx.lineWidth = lineWidth;
      this.ctx.stroke();
    }
  }

  drawRoundedRect(rect: Rect, radius: number, fill?: string | CanvasGradient | CanvasPattern, stroke?: string | CanvasGradient | CanvasPattern, lineWidth?: number): void {
    const r = Math.min(radius, rect.width / 2, rect.height / 2);
    this.ctx.beginPath();
    this.ctx.moveTo(rect.x + r, rect.y);
    this.ctx.lineTo(rect.x + rect.width - r, rect.y);
    this.ctx.quadraticCurveTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + r);
    this.ctx.lineTo(rect.x + rect.width, rect.y + rect.height - r);
    this.ctx.quadraticCurveTo(rect.x + rect.width, rect.y + rect.height, rect.x + rect.width - r, rect.y + rect.height);
    this.ctx.lineTo(rect.x + r, rect.y + rect.height);
    this.ctx.quadraticCurveTo(rect.x, rect.y + rect.height, rect.x, rect.y + rect.height - r);
    this.ctx.lineTo(rect.x, rect.y + r);
    this.ctx.quadraticCurveTo(rect.x, rect.y, rect.x + r, rect.y);
    this.ctx.closePath();
    if (fill) {
      this.ctx.fillStyle = fill;
      this.ctx.fill();
    }
    if (stroke) {
      this.ctx.strokeStyle = stroke;
      if (lineWidth) this.ctx.lineWidth = lineWidth;
      this.ctx.stroke();
    }
  }

  drawCircle(center: Vector2, radius: number, fill?: string | CanvasGradient | CanvasPattern, stroke?: string | CanvasGradient | CanvasPattern, lineWidth?: number): void {
    this.ctx.beginPath();
    this.ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    if (fill) {
      this.ctx.fillStyle = fill;
      this.ctx.fill();
    }
    if (stroke) {
      this.ctx.strokeStyle = stroke;
      if (lineWidth) this.ctx.lineWidth = lineWidth;
      this.ctx.stroke();
    }
  }

  drawLine(p1: Vector2, p2: Vector2, stroke?: string | CanvasGradient | CanvasPattern, lineWidth?: number): void {
    this.ctx.beginPath();
    this.ctx.moveTo(p1.x, p1.y);
    this.ctx.lineTo(p2.x, p2.y);
    if (stroke) {
      this.ctx.strokeStyle = stroke;
      if (lineWidth) this.ctx.lineWidth = lineWidth;
      this.ctx.stroke();
    }
  }

  drawBezier(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, stroke?: string | CanvasGradient | CanvasPattern, lineWidth?: number): void {
    this.ctx.beginPath();
    this.ctx.moveTo(p0.x, p0.y);
    this.ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    if (stroke) {
      this.ctx.strokeStyle = stroke;
      if (lineWidth) this.ctx.lineWidth = lineWidth;
      this.ctx.stroke();
    }
  }

  drawPath(path: Path2D, fill?: string | CanvasGradient | CanvasPattern, stroke?: string | CanvasGradient | CanvasPattern, lineWidth?: number): void {
    if (fill) {
      this.ctx.fillStyle = fill;
      this.ctx.fill(path);
    }
    if (stroke) {
      this.ctx.strokeStyle = stroke;
      if (lineWidth) this.ctx.lineWidth = lineWidth;
      this.ctx.stroke(path);
    }
  }

  drawText(text: string, position: Vector2, fill?: string | CanvasGradient | CanvasPattern, font?: string, align?: CanvasTextAlign, baseline?: CanvasTextBaseline): void {
    if (font) this.ctx.font = font;
    if (align) this.ctx.textAlign = align;
    if (baseline) this.ctx.textBaseline = baseline;
    if (fill) this.ctx.fillStyle = fill;
    this.ctx.fillText(text, position.x, position.y);
  }

  measureText(text: string, font?: string): TextMetrics {
    if (font) this.ctx.font = font;
    return this.ctx.measureText(text);
  }

  clear(rect: Rect): void {
    this.ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
  }

  setLineDash(segments: number[]): void {
    this.ctx.setLineDash(segments);
  }

  setLineCap(cap: CanvasLineCap): void {
    this.ctx.lineCap = cap;
  }

  setLineJoin(join: CanvasLineJoin): void {
    this.ctx.lineJoin = join;
  }

  drawImage(image: CanvasImageSource, x: number, y: number, width?: number, height?: number): void {
    if (width !== undefined && height !== undefined) {
      this.ctx.drawImage(image, x, y, width, height);
    } else {
      this.ctx.drawImage(image, x, y);
    }
  }
}
