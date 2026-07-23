import { Vector2 } from '../graphbase/core/Vector2';
import { Rect } from '../graphbase/core/Rect';
import type { BlueprintNode } from './BlueprintNode';

export interface SavedSelectionFrame {
  id: string;
  nodeIds: string[];
  label: string;
  color?: string;
}

const SELECTION_FRAME_PADDING = 12;
const TEMP_FRAME_COLOR = '#5b9bd5';
const SAVED_FRAME_COLOR = '#1f9d84';
const TAG_BAR_HEIGHT = 28;
const TAG_BAR_PADDING_X = 8;
const LABEL_EDIT_PADDING = 6;

export function computeSelectionBounds(nodes: BlueprintNode[]): Rect | null {
  if (nodes.length < 2) return null;

  let bounds: Rect | null = null;
  for (const node of nodes) {
    const nodeBounds = node.getWorldBounds();
    if (!bounds) bounds = nodeBounds.clone();
    else bounds = bounds.union(nodeBounds);
  }

  if (!bounds) return null;

  return new Rect(
    bounds.x - SELECTION_FRAME_PADDING,
    bounds.y - SELECTION_FRAME_PADDING - TAG_BAR_HEIGHT,
    bounds.width + SELECTION_FRAME_PADDING * 2,
    bounds.height + SELECTION_FRAME_PADDING * 2 + TAG_BAR_HEIGHT
  );
}

export function drawSelectionFrame(
  ctx: CanvasRenderingContext2D,
  worldRect: Rect,
  cameraZoom: number,
  isSaved: boolean,
  label?: string,
  nodeCount?: number
): void {
  const lineWidth = isSaved ? 2 / cameraZoom : 1.5 / cameraZoom;
  const dashPattern = isSaved ? [] : [6 / cameraZoom, 4 / cameraZoom];
  const color = isSaved ? SAVED_FRAME_COLOR : TEMP_FRAME_COLOR;
  const bgAlpha = isSaved ? 0.08 : 0.06;
  const strokeAlpha = isSaved ? 0.85 : 0.7;

  ctx.save();

  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dashPattern);
  ctx.strokeStyle = hexToRgba(color, strokeAlpha);
  ctx.fillStyle = hexToRgba(color, bgAlpha);

  const tagBarHeight = TAG_BAR_HEIGHT;
  const x = worldRect.x;
  const y = worldRect.y;
  const w = worldRect.width;
  const h = worldRect.height;

  roundRect(ctx, x, y + tagBarHeight, w, h - tagBarHeight, 4 / cameraZoom);
  ctx.fill();
  ctx.stroke();

  ctx.setLineDash([]);

  if (isSaved && label) {
    const labelText = label;
    ctx.font = `500 ${11 / cameraZoom}px -apple-system, "Segoe UI", "PingFang SC", sans-serif`;
    const textMetrics = ctx.measureText(labelText);
    const labelWidth = textMetrics.width + LABEL_EDIT_PADDING * 2 / cameraZoom;
    const tagX = x;
    const tagY = y;
    const tagW = Math.min(labelWidth + 24 / cameraZoom, w);
    const tagH = tagBarHeight;

    ctx.fillStyle = hexToRgba(color, 0.9);
    roundRect(ctx, tagX, tagY, tagW, tagH, 4 / cameraZoom);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(labelText, tagX + TAG_BAR_PADDING_X / cameraZoom, tagY + tagH / 2);

    const deleteBtnX = tagX + tagW - 18 / cameraZoom;
    const deleteBtnY = tagY + tagH / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = `12px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('×', deleteBtnX, deleteBtnY);
  } else if (!isSaved && nodeCount !== undefined) {
    const countText = `${nodeCount} 个节点`;
    ctx.font = `500 ${11 / cameraZoom}px -apple-system, "Segoe UI", "PingFang SC", sans-serif`;
    const textMetrics = ctx.measureText(countText);
    const labelWidth = textMetrics.width;
    const tagX = x;
    const tagY = y;
    const tagW = Math.min(labelWidth + 60 / cameraZoom, w);
    const tagH = tagBarHeight;

    ctx.fillStyle = hexToRgba(color, 0.85);
    roundRect(ctx, tagX, tagY, tagW, tagH, 4 / cameraZoom);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(countText, tagX + TAG_BAR_PADDING_X / cameraZoom, tagY + tagH / 2);
  }

  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
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

function hexToRgba(hex: string, alpha: number): string {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function pointInFrameRect(screenPoint: Vector2, worldRect: Rect, camera: { zoom: number; worldToScreen(p: Vector2): Vector2 }): boolean {
  const screenTopLeft = camera.worldToScreen(new Vector2(worldRect.x, worldRect.y));
  const screenBottomRight = camera.worldToScreen(new Vector2(worldRect.x + worldRect.width, worldRect.y + worldRect.height));
  const screenRect = new Rect(
    Math.min(screenTopLeft.x, screenBottomRight.x),
    Math.min(screenTopLeft.y, screenBottomRight.y),
    Math.abs(screenBottomRight.x - screenTopLeft.x),
    Math.abs(screenBottomRight.y - screenTopLeft.y)
  );
  return screenRect.containsPoint(screenPoint);
}

export function pointInFrameDragArea(screenPoint: Vector2, worldRect: Rect, camera: { zoom: number; worldToScreen(p: Vector2): Vector2 }): boolean {
  const screenTopLeft = camera.worldToScreen(new Vector2(worldRect.x, worldRect.y));
  const screenBottomRight = camera.worldToScreen(new Vector2(worldRect.x + worldRect.width, worldRect.y + worldRect.height));
  const tagBarH = TAG_BAR_HEIGHT * camera.zoom;
  const screenRect = new Rect(
    Math.min(screenTopLeft.x, screenBottomRight.x),
    Math.min(screenTopLeft.y, screenBottomRight.y) + tagBarH,
    Math.abs(screenBottomRight.x - screenTopLeft.x),
    Math.abs(screenBottomRight.y - screenTopLeft.y) - tagBarH
  );
  return screenRect.containsPoint(screenPoint);
}

export function pointInSavedFrameTagBar(screenPoint: Vector2, worldRect: Rect, labelWidth: number, camera: { zoom: number; worldToScreen(p: Vector2): Vector2 }): boolean {
  const screenTopLeft = camera.worldToScreen(new Vector2(worldRect.x, worldRect.y));
  const tagBarH = TAG_BAR_HEIGHT * camera.zoom;
  const tagW = Math.min(labelWidth + 24 * camera.zoom, worldRect.width * camera.zoom);
  const screenRect = new Rect(
    screenTopLeft.x,
    screenTopLeft.y,
    tagW,
    tagBarH
  );
  return screenRect.containsPoint(screenPoint);
}

export function pointInSavedFrameDeleteBtn(screenPoint: Vector2, worldRect: Rect, labelWidth: number, camera: { zoom: number; worldToScreen(p: Vector2): Vector2 }): boolean {
  const screenTopLeft = camera.worldToScreen(new Vector2(worldRect.x, worldRect.y));
  const tagBarH = TAG_BAR_HEIGHT * camera.zoom;
  const tagW = Math.min(labelWidth + 24 * camera.zoom, worldRect.width * camera.zoom);
  const btnX = screenTopLeft.x + tagW - 18 * camera.zoom;
  const btnY = screenTopLeft.y + tagBarH / 2;
  const btnRadius = 10 * camera.zoom;
  const dx = screenPoint.x - btnX;
  const dy = screenPoint.y - btnY;
  return dx * dx + dy * dy <= btnRadius * btnRadius;
}

export const SELECTION_FRAME_CONSTANTS = {
  PADDING: SELECTION_FRAME_PADDING,
  TAG_BAR_HEIGHT,
  TEMP_COLOR: TEMP_FRAME_COLOR,
  SAVED_COLOR: SAVED_FRAME_COLOR
};
