import { Vector2 } from '../graphbase/core/Vector2';
import { Rect } from '../graphbase/core/Rect';
import { Node } from '../graphbase/scene/Node';
import type { RenderContext } from '../graphbase/renderer/RenderContext';
import type { HitTestResult } from '../graphbase/scene/interfaces';
import {
  PORT_SIZE,
  PORT_INNER_SIZE,
  PORT_CORNER_RADIUS,
  PORT_INNER_CORNER,
  PORT_HOVER_SCALE,
  PORT_HIT_RADIUS,
  MEDIA_TYPE_COLORS,
  WF_NODE_BG,
  WF_PRIMARY,
  type PortSpec,
  type MediaType
} from './types';

export class Port extends Node {
  spec: PortSpec;
  isInput: boolean;
  connected: boolean = false;
  armed: boolean = false;
  snapped: boolean = false;
  compatible: boolean | null = null;
  private _nodeWidth: number = 0;
  private _nodeHeight: number = 0;

  constructor(spec: PortSpec, isInput: boolean, nodeWidth: number, nodeHeight: number, id?: string) {
    super('port', id);
    this.spec = spec;
    this.isInput = isInput;
    this.selectable = false;
    this.draggable = false;
    this._nodeWidth = nodeWidth;
    this._nodeHeight = nodeHeight;
    this.updatePosition();
  }

  updateNodeSize(width: number, height: number): void {
    this._nodeWidth = width;
    this._nodeHeight = height;
    this.updatePosition();
  }

  setArmed(armed: boolean, compatible: boolean | null = null): void {
    this.armed = armed;
    if (compatible !== null) {
      this.compatible = compatible;
    }
    if (!armed) {
      this.compatible = null;
      this.snapped = false;
    }
    this.markDirty(1);
  }

  setSnapped(snapped: boolean, compatible: boolean | null = null): void {
    this.snapped = snapped;
    if (compatible !== null) {
      this.compatible = compatible;
    }
    if (!snapped) {
      this.compatible = null;
    }
    this.markDirty(1);
  }

  private updatePosition(): void {
    const half = PORT_SIZE / 2;
    const y = (this.spec.offsetY ?? 0);
    const x = this.isInput ? -half : this._nodeWidth + half;
    this.transform.setPosition(x, y);
    this.transform.setAnchor(0, 0);
    this.markDirty(1);
  }

  get mediaType(): MediaType {
    return this.spec.mediaType ?? 'generic';
  }

  getColor(): string {
    return MEDIA_TYPE_COLORS[this.mediaType] || MEDIA_TYPE_COLORS.generic;
  }

  getWorldPosition(): Vector2 {
    return this.localToWorld(new Vector2(0, 0));
  }

  getLocalBounds(): Rect {
    const r = PORT_HIT_RADIUS;
    return new Rect(-r, -r, r * 2, r * 2);
  }

  getHitBounds(): Rect {
    return this.getLocalBounds();
  }

  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  protected renderSelf(ctx: RenderContext): void {
    const color = this.getColor();
    const isHovered = this.hovered;
    const isArmed = this.armed;
    const isSnapped = this.snapped;
    const scale = (isHovered || isArmed || isSnapped) ? PORT_HOVER_SCALE : 1;
    const halfOuter = (PORT_SIZE / 2) * scale;
    const halfInner = (PORT_INNER_SIZE / 2) * (isSnapped ? 1.15 : scale);

    let borderColor = `rgba(31, 157, 132, 0.45)`;
    let glowColor = `rgba(31, 157, 132, 0.12)`;

    if (isSnapped) {
      if (this.compatible === false) {
        borderColor = '#e74c3c';
        glowColor = 'rgba(231, 76, 60, 0.40)';
      } else if (this.compatible === true) {
        borderColor = '#27ae60';
        glowColor = 'rgba(39, 174, 96, 0.40)';
      } else {
        borderColor = color;
        glowColor = this.hexToRgba(color, 0.4);
      }
    } else if (isArmed || isHovered) {
      borderColor = color;
      glowColor = this.hexToRgba(color, 0.25);
    }

    if (this.connected) {
      ctx.ctx.save();
      ctx.ctx.shadowColor = color;
      ctx.ctx.shadowBlur = 8;
      ctx.ctx.fillStyle = this.hexToRgba(color, 0.2);
      this.drawRoundedRect(ctx.ctx, -halfOuter - 4, -halfOuter - 4, (halfOuter + 4) * 2, (halfOuter + 4) * 2, PORT_CORNER_RADIUS * 1.5);
      ctx.ctx.fill();
      ctx.ctx.restore();
    }

    if (isSnapped) {
      ctx.ctx.save();
      ctx.ctx.shadowColor = glowColor;
      ctx.ctx.shadowBlur = 18;
      ctx.ctx.fillStyle = glowColor;
      const glowSize = halfOuter + 8;
      this.drawRoundedRect(ctx.ctx, -glowSize, -glowSize, glowSize * 2, glowSize * 2, PORT_CORNER_RADIUS * 2);
      ctx.ctx.fill();
      ctx.ctx.restore();
    } else if (isArmed || isHovered) {
      ctx.ctx.save();
      ctx.ctx.shadowColor = glowColor;
      ctx.ctx.shadowBlur = 12;
      ctx.ctx.fillStyle = glowColor;
      const glowSize = halfOuter + 4;
      this.drawRoundedRect(ctx.ctx, -glowSize, -glowSize, glowSize * 2, glowSize * 2, PORT_CORNER_RADIUS * 1.5);
      ctx.ctx.fill();
      ctx.ctx.restore();
    }

    ctx.ctx.save();
    ctx.ctx.fillStyle = WF_NODE_BG;
    ctx.ctx.strokeStyle = borderColor;
    ctx.ctx.lineWidth = 1;
    this.drawRoundedRect(ctx.ctx, -halfOuter, -halfOuter, halfOuter * 2, halfOuter * 2, PORT_CORNER_RADIUS);
    ctx.ctx.fill();
    ctx.ctx.stroke();
    ctx.ctx.restore();

    ctx.ctx.save();
    if (isSnapped) {
      ctx.ctx.shadowColor = borderColor;
      ctx.ctx.shadowBlur = 10;
    }
    ctx.ctx.fillStyle = isSnapped && this.compatible !== false ? (this.connected ? '#ffffff' : color) : color;
    this.drawRoundedRect(ctx.ctx, -halfInner, -halfInner, halfInner * 2, halfInner * 2, PORT_INNER_CORNER);
    ctx.ctx.fill();
    ctx.ctx.restore();
  }

  private hexToRgba(hex: string, alpha: number): string {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  protected hitTestSelf(localPoint: Vector2): HitTestResult | null {
    const dist = Math.max(Math.abs(localPoint.x), Math.abs(localPoint.y));
    if (dist <= PORT_HIT_RADIUS) {
      return {
        node: this,
        localPoint: localPoint.clone(),
        worldPoint: this.localToWorld(localPoint)
      };
    }
    return null;
  }
}
