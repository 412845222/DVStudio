import { Vector2 } from '../core/Vector2';
import { Tool } from './Tool';
import type { GraphPointerEvent, GraphWheelEvent, GraphKeyboardEvent } from '../input/events';
import type { HitTestResult } from '../scene/interfaces';
import type { RenderContext } from '../renderer/RenderContext';

export class PanTool extends Tool {
  private panning: boolean = false;
  private lastPos: Vector2 = new Vector2();

  constructor() {
    super('pan', 'grab');
  }

  onActivate(): void {
    this.panning = false;
  }

  onDeactivate(): void {
    this.panning = false;
  }

  onPointerDown(event: GraphPointerEvent, _hit: HitTestResult | null): void {
    if (event.button === 0 || event.button === 1) {
      this.panning = true;
      this.lastPos.copy(event.screenPosition);
      this.setCursor('grabbing');
    }
  }

  onPointerMove(event: GraphPointerEvent, _hit: HitTestResult | null): void {
    if (this.panning) {
      const dx = event.screenPosition.x - this.lastPos.x;
      const dy = event.screenPosition.y - this.lastPos.y;
      this.manager!.scene.camera.panBy(dx, dy);
      this.lastPos.copy(event.screenPosition);
      this.manager!.scene.requestRedraw();
    }
  }

  onPointerUp(_event: GraphPointerEvent, _hit: HitTestResult | null): void {
    this.panning = false;
    this.setCursor('grab');
  }

  onWheel(event: GraphWheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      this.manager!.scene.camera.zoomAt(event.screenPosition, event.deltaY);
    } else {
      this.manager!.scene.camera.panBy(-event.deltaX, -event.deltaY);
    }
    this.manager!.scene.requestRedraw();
  }

  onKeyDown(event: GraphKeyboardEvent): void {
    if (event.key === ' ' && !event.repeat) {
      this.setCursor('grab');
    }
  }

  onKeyUp(event: GraphKeyboardEvent): void {
    if (event.key === ' ') {
      this.setCursor('grab');
    }
  }

  onRender(_ctx: RenderContext): void {}
}
