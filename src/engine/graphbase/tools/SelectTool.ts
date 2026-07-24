import { Tool } from './Tool';
import type { GraphPointerEvent, GraphWheelEvent, GraphKeyboardEvent } from '../input/events';
import type { HitTestResult } from '../scene/interfaces';
import type { RenderContext } from '../renderer/RenderContext';
import { Rect } from '../core/Rect';

export class SelectTool extends Tool {
  private dragging: boolean = false;
  private dragMoved: boolean = false;

  constructor() {
    super('select', 'default');
  }

  onPointerDown(event: GraphPointerEvent, hit: HitTestResult | null): void {
    const sel = this.manager!.selection;

    if (event.button === 2) {
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
    this.manager!.scene.requestRedraw();
  }

  onPointerMove(event: GraphPointerEvent, _hit: HitTestResult | null): void {
    const sel = this.manager!.selection;
    const drag = this.manager!.drag;

    if (drag.isDragging()) {
      drag.updateDrag(event);
      this.dragMoved = true;
      this.manager!.scene.requestRedraw();
    } else if (sel.isMarqueeing()) {
      sel.updateMarquee(event.screenPosition);
      this.dragMoved = true;
    }
  }

  onPointerUp(event: GraphPointerEvent, hit: HitTestResult | null): void {
    const sel = this.manager!.selection;
    const drag = this.manager!.drag;

    if (drag.isDragging()) {
      drag.endDrag(event);
      this.dragging = false;
    } else if (sel.isMarqueeing()) {
      const additive = event.shiftKey || event.ctrlKey;
      sel.endMarquee(additive);
    }

    if (hit && !this.dragMoved && event.button === 0) {
    }

    this.dragging = false;
    this.dragMoved = false;
    this.manager!.scene.requestRedraw();
  }

  onWheel(event: GraphWheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      this.manager!.scene.zoomAt(event.screenPosition, event.deltaY);
    } else {
      this.manager!.scene.panBy(-event.deltaX, -event.deltaY);
    }
  }

  onKeyDown(event: GraphKeyboardEvent): void {
    const key = event.key.toLowerCase();
    const sel = this.manager!.selection;

    if ((key === 'delete' || key === 'backspace') && !event.repeat) {
      sel.deleteSelection();
    }
    if (key === 'a' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      sel.selectAll();
    }
    if (key === 'escape') {
      sel.clearSelection();
      sel.cancelMarquee();
      this.manager!.drag.cancelDrag();
    }
    this.manager!.scene.requestRedraw();
  }

  onKeyUp(_event: GraphKeyboardEvent): void {}

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
