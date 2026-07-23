import { Tool } from '../graphbase/tools/Tool';
import type { GraphPointerEvent, GraphKeyboardEvent, GraphWheelEvent } from '../graphbase/input/events';
import type { HitTestResult } from '../graphbase/scene/interfaces';
import type { RenderContext } from '../graphbase/renderer/RenderContext';
import { Vector2 } from '../graphbase/core/Vector2';
import { Port } from './Port';
import { BlueprintNode } from './BlueprintNode';
import type { BlueprintScene } from './BlueprintScene';

export class BlueprintEditorTool extends Tool {
  private dragging: boolean = false;
  private dragMoved: boolean = false;
  private connecting: boolean = false;
  private spacePanning: boolean = false;
  private lastPanPos: Vector2 = new Vector2();

  constructor() {
    super('blueprint_editor', 'default');
  }

  private get bpScene(): BlueprintScene {
    return this.manager!.scene as BlueprintScene;
  }

  onPointerDown(event: GraphPointerEvent, hit: HitTestResult | null): void {
    const scene = this.bpScene;
    const sel = this.manager!.selection;

    if (event.button === 2) {
      return;
    }

    if (hit && hit.node instanceof Port) {
      const port = hit.node;
      let parentNode: BlueprintNode | null = null;
      let p: any = port.parent;
      while (p) {
        if (p instanceof BlueprintNode) {
          parentNode = p;
          break;
        }
        p = p.parent;
      }
      if (parentNode) {
        this.connecting = true;
        const worldPos = scene.screenToWorld(event.screenPosition);
        scene.startPendingConnection(parentNode, port, worldPos);
        this.setCursor('crosshair');
        scene.requestRedraw();
        return;
      }
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

        if (node.draggable && sel.isSelected(node)) {
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
      if (hit && hit.node instanceof Port) {
        hoveredPort = hit.node;
      }
      scene.updatePendingConnection(worldPos, hoveredPort);
      return;
    }

    if (this.spacePanning) {
      const dx = event.screenPosition.x - this.lastPanPos.x;
      const dy = event.screenPosition.y - this.lastPanPos.y;
      scene.camera.panBy(-dx, -dy);
      this.lastPanPos.copy(event.screenPosition);
      scene.requestRedraw();
      return;
    }

    if (drag.isDragging()) {
      drag.updateDrag(event);
      this.dragMoved = true;
      scene.requestRedraw();
    } else if (sel.isMarqueeing()) {
      sel.updateMarquee(event.screenPosition);
      this.dragMoved = true;
    } else {
      if (hit && hit.node instanceof Port) {
        this.setCursor('crosshair');
      } else if (hit && hit.node instanceof BlueprintNode) {
        this.setCursor('grab');
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
      this.setCursor('default');
      if (hit && hit.node instanceof Port) {
        const targetPort = hit.node;
        let targetNode: BlueprintNode | null = null;
        let p: any = targetPort.parent;
        while (p) {
          if (p instanceof BlueprintNode) {
            targetNode = p;
            break;
          }
          p = p.parent;
        }
        const pending = scene.getPendingConnection();
        if (targetNode && pending && targetPort !== pending.fromPort && targetPort.isInput !== pending.fromPort.isInput) {
          scene.completePendingConnection(targetNode, targetPort);
        } else {
          scene.cancelPendingConnection();
        }
      } else {
        scene.cancelPendingConnection();
      }
      scene.requestRedraw();
      return;
    }

    if (this.spacePanning) {
      this.spacePanning = false;
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
    scene.requestRedraw();
  }

  onWheel(event: GraphWheelEvent): void {
    const scene = this.bpScene;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      scene.camera.zoomAt(event.screenPosition, event.deltaY);
    } else {
      scene.camera.panBy(-event.deltaX, -event.deltaY);
    }
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
      for (const node of selected) {
        if (node instanceof BlueprintNode) {
          nodeIdsToRemove.push(node.id);
        }
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
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.drawRect(marqueeRect, 'rgba(31, 157, 132, 0.1)', 'rgba(31, 157, 132, 0.8)', 1);
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
}
