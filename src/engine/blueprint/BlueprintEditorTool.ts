import { Tool } from '../graphbase/tools/Tool';
import type { GraphPointerEvent, GraphKeyboardEvent, GraphWheelEvent } from '../graphbase/input/events';
import type { HitTestResult } from '../graphbase/scene/interfaces';
import type { RenderContext } from '../graphbase/renderer/RenderContext';
import { Vector2 } from '../graphbase/core/Vector2';
import { Port } from './Port';
import { BlueprintNode } from './BlueprintNode';
import { Connection } from './Connection';
import type { BlueprintScene } from './BlueprintScene';

export class BlueprintEditorTool extends Tool {
  private dragging: boolean = false;
  private dragMoved: boolean = false;
  private connecting: boolean = false;
  private spacePanning: boolean = false;
  private rightPanning: boolean = false;
  private lastPanPos: Vector2 = new Vector2();
  private pendingFromPort: Port | null = null;
  private pendingFromNode: BlueprintNode | null = null;

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

  onPointerDown(event: GraphPointerEvent, hit: HitTestResult | null): void {
    const scene = this.bpScene;
    const sel = this.manager!.selection;

    if (event.button === 2) {
      this.rightPanning = true;
      this.lastPanPos.copy(event.screenPosition);
      this.setCursor('grabbing');
      scene.requestRedraw();
      return;
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

        if (node.draggable && sel.isSelected(node) && node instanceof BlueprintNode) {
          this.manager!.drag.startDrag(event, sel.getSelection());
          this.dragging = true;
          this.dragMoved = false;
        }
      }
    } else {
      if (!event.shiftKey && !event.ctrlKey) {
        sel.clearSelection();
      }
      sel.startMarquee(event.screenPosition);
      this.dragging = true;
      this.dragMoved = false;
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

    if (drag.isDragging()) {
      drag.updateDrag(event);
      this.dragMoved = true;
      scene.updateAllConnectionEndpoints();
      scene.requestRedraw();
    } else if (sel.isMarqueeing()) {
      sel.updateMarquee(event.screenPosition);
      this.dragMoved = true;
      scene.requestRedraw();
    } else {
      if (hit && hit.node instanceof Port) {
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

    if (drag.isDragging()) {
      drag.endDrag(event);
      this.dragging = false;
    } else if (sel.isMarqueeing()) {
      const additive = event.shiftKey || event.ctrlKey;
      sel.endMarquee(additive);
    }

    this.dragging = false;
    this.dragMoved = false;
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
    }
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
    const marqueeRect = sel.getMarqueeRect();
    if (marqueeRect) {
      const camera = this.manager!.scene.camera;
      ctx.save();
      const lineWidth = 1 / camera.zoom;
      ctx.ctx.lineWidth = lineWidth;
      ctx.ctx.setLineDash([4 / camera.zoom, 4 / camera.zoom]);
      ctx.ctx.fillStyle = 'rgba(31, 157, 132, 0.08)';
      ctx.ctx.strokeStyle = 'rgba(31, 157, 132, 0.7)';
      ctx.ctx.fillRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height);
      ctx.ctx.strokeRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height);
      ctx.ctx.setLineDash([]);
      ctx.restore();
    }
  }
}
