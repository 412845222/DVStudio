import { Vector2 } from '../graphbase/core/Vector2';
import { Rect } from '../graphbase/core/Rect';
import { Node } from '../graphbase/scene/Node';
import type { RenderContext } from '../graphbase/renderer/RenderContext';
import type { HitTestResult } from '../graphbase/scene/interfaces';
import {
  PORT_SIZE,
  PORT_INNER_SIZE,
  PORT_HOVER_SCALE,
  PORT_HIT_RADIUS,
  MEDIA_TYPE_COLORS,
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

  private drawSquare(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number
  ): void {
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }

  protected renderSelf(ctx: RenderContext): void {
    const c = ctx.ctx;
    const color = this.getColor();
    const isHovered = this.hovered;
    const isArmed = this.armed;
    const isSnapped = this.snapped;
    const invZoom = 1 / ctx.camera.zoom;
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
      c.save();
      c.shadowColor = color;
      c.shadowBlur = 8;
      c.fillStyle = this.hexToRgba(color, 0.2);
      c.fillRect(-halfOuter - 4, -halfOuter - 4, (halfOuter + 4) * 2, (halfOuter + 4) * 2);
      c.restore();
    }

    if (isSnapped) {
      c.save();
      c.shadowColor = glowColor;
      c.shadowBlur = 18;
      c.fillStyle = glowColor;
      const glowSize = halfOuter + 8;
      c.fillRect(-glowSize, -glowSize, glowSize * 2, glowSize * 2);
      c.restore();
    } else if (isArmed || isHovered) {
      c.save();
      c.shadowColor = glowColor;
      c.shadowBlur = 12;
      c.fillStyle = glowColor;
      const glowSize = halfOuter + 4;
      c.fillRect(-glowSize, -glowSize, glowSize * 2, glowSize * 2);
      c.restore();
    }

    c.save();
    c.fillStyle = 'rgba(21, 24, 28, 0.9)';
    c.strokeStyle = borderColor;
    c.lineWidth = 1.5;
    c.fillRect(-halfOuter, -halfOuter, halfOuter * 2, halfOuter * 2);
    c.strokeRect(-halfOuter, -halfOuter, halfOuter * 2, halfOuter * 2);
    c.restore();

    c.save();
    if (isSnapped) {
      c.shadowColor = borderColor;
      c.shadowBlur = 10;
    }
    c.fillStyle = isSnapped && this.compatible !== false ? (this.connected ? '#ffffff' : color) : color;
    c.fillRect(-halfInner, -halfInner, halfInner * 2, halfInner * 2);
    c.restore();

    if (this.spec.label && ctx.camera.zoom >= 0.3) {
      c.save();
      c.font = `11px -apple-system, "Segoe UI", "PingFang SC", sans-serif`;
      c.fillStyle = 'rgba(237, 242, 244, 0.75)';
      c.textBaseline = 'middle';
      const labelOffset = halfOuter + 8;
      if (this.isInput) {
        c.textAlign = 'right';
        c.fillText(this.spec.label, -labelOffset, 0);
      } else {
        c.textAlign = 'left';
        c.fillText(this.spec.label, labelOffset, 0);
      }
      c.restore();
    }
  }

  private hexToRgba(hex: string, alpha: number): string {
    if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  protected hitTestSelf(localPoint: Vector2): HitTestResult | null {
    const half = PORT_HIT_RADIUS;
    if (Math.abs(localPoint.x) <= half && Math.abs(localPoint.y) <= half) {
      return {
        node: this,
        localPoint: localPoint.clone(),
        worldPoint: this.localToWorld(localPoint)
      };
    }
    return null;
  }
}
