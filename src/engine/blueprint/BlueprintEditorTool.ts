import { Tool } from '../graphbase/tools/Tool';
import type { GraphPointerEvent, GraphKeyboardEvent, GraphWheelEvent } from '../graphbase/input/events';
import type { HitTestResult } from '../graphbase/scene/interfaces';
import type { RenderContext } from '../graphbase/renderer/RenderContext';
import { Vector2 } from '../graphbase/core/Vector2';
import { Rect } from '../graphbase/core/Rect';
import { Port } from './Port';
import { BlueprintNode } from './BlueprintNode';
import { Connection } from './Connection';
import type { BlueprintScene } from './BlueprintScene';
import {
  computeSelectionBounds,
  drawSelectionFrame,
  pointInFrameDragArea,
  pointInSavedFrameTagBar,
  pointInSavedFrameDeleteBtn,
  type SavedSelectionFrame,
  SELECTION_FRAME_CONSTANTS
} from './SelectionFrame';

enum DragMode {
  NONE,
  NODES,
  SELECTION_FRAME,
  SAVED_FRAME
}

export class BlueprintEditorTool extends Tool {
  private dragging: boolean = false;
  private dragMoved: boolean = false;
  private connecting: boolean = false;
  private spacePanning: boolean = false;
  private rightPanning: boolean = false;
  private lastPanPos: Vector2 = new Vector2();
  private pendingFromPort: Port | null = null;
  private pendingFromNode: BlueprintNode | null = null;
  private dragMode: DragMode = DragMode.NONE;
  private dragStartScreen: Vector2 = new Vector2();
  private dragLastScreen: Vector2 = new Vector2();
  private dragSavedFrameId: string | null = null;
  private tempSelectionBounds: Rect | null = null;
  private savedFrameLabelWidths: Map<string, number> = new Map();

  constructor() {
    super('blueprint_editor', 'default');
  }

  private get bpScene(): BlueprintScene {
    return this.manager!.scene as BlueprintScene;
  }

  private findParentNode(node: any): BlueprintNode | null {
    let p = node;
    while (p) {
      if (p instanceof BlueprintNode) return p;
      p = p.parent;
    }
    return null;
  }

  private updateTempSelectionBounds(): void {
    const sel = this.manager!.selection;
    const nodes = sel.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
    this.tempSelectionBounds = computeSelectionBounds(nodes);
  }

  private measureSavedFrameLabels(): void {
    const scene = this.bpScene;
    const frames = scene.getSavedSelectionFrames();
    const ctx = scene.canvas.getContext('2d');
    if (!ctx) return;

    this.savedFrameLabelWidths.clear();
    for (const frame of frames) {
      ctx.save();
      ctx.font = `500 11px -apple-system, "Segoe UI", "PingFang SC", sans-serif`;
      const metrics = ctx.measureText(frame.label);
      this.savedFrameLabelWidths.set(frame.id, metrics.width);
      ctx.restore();
    }
  }

  private hitTestSavedFrame(screenPoint: Vector2): { frameId: string; hitDelete: boolean; hitTagBar: boolean } | null {
    const scene = this.bpScene;
    const camera = scene.camera;
    const frames = scene.getSavedSelectionFrames();

    for (let i = frames.length - 1; i >= 0; i--) {
      const frame = frames[i];
      const nodes = scene.getNodesByIds(frame.nodeIds);
      if (nodes.length < 2) continue;
      const bounds = computeSelectionBounds(nodes);
      if (!bounds) continue;

      const labelWidth = this.savedFrameLabelWidths.get(frame.id) ?? 0;
      if (pointInSavedFrameDeleteBtn(screenPoint, bounds, labelWidth, camera)) {
        return { frameId: frame.id, hitDelete: true, hitTagBar: true };
      }
      if (pointInSavedFrameTagBar(screenPoint, bounds, labelWidth, camera)) {
        return { frameId: frame.id, hitDelete: false, hitTagBar: true };
      }
    }
    return null;
  }

  private hitTestTempFrameDragArea(screenPoint: Vector2): boolean {
    if (!this.tempSelectionBounds) return false;
    const camera = this.bpScene.camera;
    return pointInFrameDragArea(screenPoint, this.tempSelectionBounds, camera);
  }

  onPointerDown(event: GraphPointerEvent, hit: HitTestResult | null): void {
    const scene = this.bpScene;
    const sel = this.manager!.selection;

    this.updateTempSelectionBounds();
    this.measureSavedFrameLabels();

    if (event.button === 2) {
      this.rightPanning = true;
      this.lastPanPos.copy(event.screenPosition);
      this.setCursor('grabbing');
      scene.requestRedraw();
      return;
    }

    const savedFrameHit = this.hitTestSavedFrame(event.screenPosition);
    if (savedFrameHit) {
      if (savedFrameHit.hitDelete) {
        scene.deleteSavedSelectionFrame(savedFrameHit.frameId);
        scene.requestRedraw();
        return;
      }
      if (savedFrameHit.hitTagBar) {
        this.dragMode = DragMode.SAVED_FRAME;
        this.dragSavedFrameId = savedFrameHit.frameId;
        this.dragging = true;
        this.dragMoved = false;
        this.dragStartScreen.copy(event.screenPosition);
        this.dragLastScreen.copy(event.screenPosition);
        const frame = scene.getSavedSelectionFrame(savedFrameHit.frameId);
        if (frame) {
          const nodeIds = frame.nodeIds;
          if (!event.shiftKey && !event.ctrlKey) {
            sel.clearSelection();
          }
          for (const id of nodeIds) {
            sel.selectById(id, true);
          }
        }
        this.setCursor('grabbing');
        scene.requestRedraw();
        return;
      }
    }

    if (hit && hit.node instanceof Port) {
      const port = hit.node;
      const parentNode = this.findParentNode(port);
      if (parentNode && !port.isInput) {
        this.connecting = true;
        this.pendingFromPort = port;
        this.pendingFromNode = parentNode;
        port.setArmed(true);
        const worldPos = scene.screenToWorld(event.screenPosition);
        scene.startPendingConnection(parentNode, port, worldPos);
        this.setCursor('crosshair');
        scene.requestRedraw();
        return;
      }
      return;
    }

    if (this.spacePanning || event.button === 1) {
      this.spacePanning = true;
      this.lastPanPos.copy(event.screenPosition);
      this.setCursor('grabbing');
      return;
    }

    if (hit) {
      const node = hit.node;
      if (node.selectable) {
        if (event.shiftKey || event.ctrlKey) {
          sel.toggleSelect(node);
        } else if (!sel.isSelected(node)) {
          sel.select(node, false);
        }

        this.updateTempSelectionBounds();

        if (node.draggable && sel.isSelected(node) && node instanceof BlueprintNode) {
          this.manager!.drag.startDrag(event, sel.getSelection());
          this.dragMode = DragMode.NODES;
          this.dragging = true;
          this.dragMoved = false;
        }
      }
    } else {
      if (this.hitTestTempFrameDragArea(event.screenPosition)) {
        this.dragMode = DragMode.SELECTION_FRAME;
        this.dragging = true;
        this.dragMoved = false;
        this.dragStartScreen.copy(event.screenPosition);
        this.dragLastScreen.copy(event.screenPosition);
        this.setCursor('grabbing');
      } else {
        if (!event.shiftKey && !event.ctrlKey) {
          sel.clearSelection();
        }
        sel.startMarquee(event.screenPosition);
        this.dragMode = DragMode.NONE;
        this.dragging = true;
        this.dragMoved = false;
      }
    }
    scene.requestRedraw();
  }

  onPointerMove(event: GraphPointerEvent, hit: HitTestResult | null): void {
    const scene = this.bpScene;
    const sel = this.manager!.selection;
    const drag = this.manager!.drag;

    if (this.connecting) {
      const worldPos = scene.screenToWorld(event.screenPosition);
      let hoveredPort: Port | null = null;
      let hoveredNode: BlueprintNode | null = null;
      let compatible: boolean | null = null;

      if (hit && hit.node instanceof Port) {
        hoveredPort = hit.node;
        hoveredNode = this.findParentNode(hoveredPort);
        if (hoveredPort.isInput && hoveredNode !== this.pendingFromNode) {
          compatible = true;
        } else {
          compatible = false;
        }
      }

      for (const node of scene.getAllBlueprintNodes()) {
        for (const p of [...node.inputPorts, ...node.outputPorts]) {
          p.setSnapped(p === hoveredPort, compatible);
        }
      }

      scene.updatePendingConnection(worldPos, hoveredPort, compatible);
      scene.requestRedraw();
      return;
    }

    if (this.spacePanning || this.rightPanning) {
      const dx = event.screenPosition.x - this.lastPanPos.x;
      const dy = event.screenPosition.y - this.lastPanPos.y;
      scene.camera.panBy(dx, dy);
      this.lastPanPos.copy(event.screenPosition);
      scene.onViewportChanged();
      scene.requestRedraw();
      return;
    }

    if (this.dragMode === DragMode.NODES && drag.isDragging()) {
      drag.updateDrag(event);
      this.dragMoved = true;
      this.updateTempSelectionBounds();
      scene.updateAllConnectionEndpoints();
      scene.requestRedraw();
    } else if (this.dragMode === DragMode.SELECTION_FRAME) {
      const dx = event.screenPosition.x - this.dragLastScreen.x;
      const dy = event.screenPosition.y - this.dragLastScreen.y;
      const worldDelta = scene.camera.screenDeltaToWorld(new Vector2(dx, dy));
      sel.moveSelection(worldDelta);
      this.dragLastScreen.copy(event.screenPosition);
      this.dragMoved = true;
      this.updateTempSelectionBounds();
      scene.updateAllConnectionEndpoints();
      scene.requestRedraw();
    } else if (this.dragMode === DragMode.SAVED_FRAME && this.dragSavedFrameId) {
      const dx = event.screenPosition.x - this.dragLastScreen.x;
      const dy = event.screenPosition.y - this.dragLastScreen.y;
      const worldDelta = scene.camera.screenDeltaToWorld(new Vector2(dx, dy));
      sel.moveSelection(worldDelta);
      this.dragLastScreen.copy(event.screenPosition);
      this.dragMoved = true;
      this.updateTempSelectionBounds();
      scene.updateAllConnectionEndpoints();
      scene.requestRedraw();
    } else if (sel.isMarqueeing()) {
      sel.updateMarquee(event.screenPosition);
      this.dragMoved = true;
      scene.requestRedraw();
    } else {
      this.updateTempSelectionBounds();
      this.measureSavedFrameLabels();

      const savedFrameHit = this.hitTestSavedFrame(event.screenPosition);
      if (savedFrameHit && savedFrameHit.hitDelete) {
        this.setCursor('pointer');
      } else if (savedFrameHit && savedFrameHit.hitTagBar) {
        this.setCursor('grab');
      } else if (this.hitTestTempFrameDragArea(event.screenPosition)) {
        this.setCursor('grab');
      } else if (hit && hit.node instanceof Port) {
        this.setCursor('crosshair');
      } else if (hit && hit.node instanceof BlueprintNode) {
        this.setCursor('grab');
      } else if (hit && hit.node instanceof Connection) {
        this.setCursor('pointer');
      } else {
        this.setCursor('default');
      }
    }
  }

  onPointerUp(event: GraphPointerEvent, hit: HitTestResult | null): void {
    const scene = this.bpScene;
    const sel = this.manager!.selection;
    const drag = this.manager!.drag;

    if (this.connecting) {
      this.connecting = false;
      if (this.pendingFromPort) {
        this.pendingFromPort.setArmed(false);
      }
      for (const node of scene.getAllBlueprintNodes()) {
        for (const p of [...node.inputPorts, ...node.outputPorts]) {
          p.setSnapped(false);
        }
      }

      let completed = false;
      if (hit && hit.node instanceof Port) {
        const targetPort = hit.node;
        const targetNode = this.findParentNode(targetPort);
        if (
          targetNode &&
          this.pendingFromNode &&
          this.pendingFromPort &&
          targetPort.isInput &&
          !this.pendingFromPort.isInput &&
          targetNode !== this.pendingFromNode
        ) {
          scene.completePendingConnection(targetNode, targetPort);
          completed = true;
        }
      }
      if (!completed) {
        scene.cancelPendingConnection();
      }
      this.pendingFromPort = null;
      this.pendingFromNode = null;
      this.setCursor('default');
      scene.requestRedraw();
      return;
    }

    if (this.spacePanning || this.rightPanning) {
      this.spacePanning = false;
      this.rightPanning = false;
      this.setCursor('default');
      return;
    }

    if (this.dragMode === DragMode.NODES) {
      if (drag.isDragging()) {
        drag.endDrag(event);
      }
    } else if (this.dragMode === DragMode.SELECTION_FRAME) {
      if (!this.dragMoved && this.tempSelectionBounds) {
        sel.clearSelection();
      }
    } else if (this.dragMode === DragMode.SAVED_FRAME) {
      this.dragSavedFrameId = null;
    } else if (sel.isMarqueeing()) {
      const additive = event.shiftKey || event.ctrlKey;
      sel.endMarquee(additive);
    }

    this.dragging = false;
    this.dragMoved = false;
    this.dragMode = DragMode.NONE;
    this.updateTempSelectionBounds();
    scene.updateAllConnectionEndpoints();
    scene.requestRedraw();
  }

  onWheel(event: GraphWheelEvent): void {
    const scene = this.bpScene;
    event.preventDefault();
    scene.camera.zoomAt(event.screenPosition, event.deltaY);
    scene.onViewportChanged();
    scene.requestRedraw();
  }

  onKeyDown(event: GraphKeyboardEvent): void {
    const scene = this.bpScene;
    const sel = this.manager!.selection;
    const key = event.key.toLowerCase();

    if (key === ' ' && !event.repeat && !this.connecting) {
      this.spacePanning = true;
      this.setCursor('grab');
      return;
    }

    if ((key === 'delete' || key === 'backspace') && !event.repeat) {
      const selected = sel.getSelection();
      const nodeIdsToRemove: string[] = [];
      const connIdsToRemove: string[] = [];
      for (const node of selected) {
        if (node instanceof BlueprintNode) {
          nodeIdsToRemove.push(node.id);
        } else if (node instanceof Connection) {
          connIdsToRemove.push(node.id);
        }
      }
      for (const id of connIdsToRemove) {
        scene.removeConnection(id);
      }
      for (const id of nodeIdsToRemove) {
        scene.removeBlueprintNode(id);
      }
      sel.clearSelection();
    }
    if (key === 'a' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      sel.selectAll();
    }
    if (key === 'g' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      const selectedNodes = sel.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
      if (selectedNodes.length >= 2) {
        const defaultLabel = `分组 ${scene.getSavedSelectionFrames().length + 1}`;
        scene.saveSelectionFrame(selectedNodes.map(n => n.id), defaultLabel);
      }
    }
    if (key === 'escape') {
      if (this.connecting) {
        scene.cancelPendingConnection();
        this.connecting = false;
        if (this.pendingFromPort) this.pendingFromPort.setArmed(false);
        this.pendingFromPort = null;
        this.pendingFromNode = null;
        for (const node of scene.getAllBlueprintNodes()) {
          for (const p of [...node.inputPorts, ...node.outputPorts]) {
            p.setSnapped(false);
          }
        }
        this.setCursor('default');
      }
      sel.clearSelection();
      sel.cancelMarquee();
      this.manager!.drag.cancelDrag();
      this.dragMode = DragMode.NONE;
    }
    this.updateTempSelectionBounds();
    scene.requestRedraw();
  }

  onKeyUp(event: GraphKeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (key === ' ') {
      this.spacePanning = false;
      this.setCursor('default');
    }
  }

  onRender(ctx: RenderContext): void {
    const sel = this.manager!.selection;
    const scene = this.bpScene;
    const camera = scene.camera;
    const marqueeRect = sel.getMarqueeRect();

    this.measureSavedFrameLabels();

    for (const frame of scene.getSavedSelectionFrames()) {
      const nodes = scene.getNodesByIds(frame.nodeIds);
      if (nodes.length < 2) continue;
      const bounds = computeSelectionBounds(nodes);
      if (bounds) {
        drawSelectionFrame(ctx.ctx, bounds, camera.zoom, true, frame.label);
      }
    }

    this.updateTempSelectionBounds();
    if (this.tempSelectionBounds && !sel.isMarqueeing()) {
      const selectedNodes = sel.getSelection().filter(n => n instanceof BlueprintNode);
      if (selectedNodes.length >= 2) {
        drawSelectionFrame(ctx.ctx, this.tempSelectionBounds, camera.zoom, false, undefined, selectedNodes.length);
      }
    }

    if (marqueeRect) {
      ctx.save();
      const lineWidth = 1 / camera.zoom;
      ctx.ctx.lineWidth = lineWidth;
      ctx.ctx.setLineDash([4 / camera.zoom, 4 / camera.zoom]);
      ctx.ctx.fillStyle = 'rgba(91, 155, 213, 0.08)';
      ctx.ctx.strokeStyle = 'rgba(91, 155, 213, 0.7)';
      ctx.ctx.fillRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height);
      ctx.ctx.strokeRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height);
      ctx.ctx.setLineDash([]);
      ctx.restore();
    }
  }
}
