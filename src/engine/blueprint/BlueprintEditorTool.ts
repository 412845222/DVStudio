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
import { MoveNodeCommand } from '../graphbase/commands/CompositeCommand';
import { ResizeNodeCommand } from './commands/ResizeNodeCommand';
import { CreateConnectionCommand } from './commands/CreateConnectionCommand';
import { DeleteSelectionCommand } from './commands/DeleteSelectionCommand';
import {
  computeSelectionBounds,
  drawSelectionFrame,
  pointInFrameDragArea,
  pointInSavedFrameTagBar,
  pointInSavedFrameDeleteBtn,
  pointInTempFrameInput,
  pointInTempFrameSaveBtn,
  type FrameEditState,
  SELECTION_FRAME_CONSTANTS
} from './SelectionFrame';
import { MIN_NODE_WIDTH, MIN_NODE_HEIGHT, type ResizeCorner } from './types';

enum DragMode {
  NONE,
  NODES,
  SELECTION_FRAME,
  SAVED_FRAME,
  RESIZE
}

const ANCHOR_MAGNET_DISTANCE = 15;
const DRAG_BOUNDARY = 100000;
const DOUBLE_CLICK_MS = 300;
const CLICK_DRAG_THRESHOLD = 4;
const RIGHT_PAN_THRESHOLD_DIST = 4;

export class BlueprintEditorTool extends Tool {
  private dragging: boolean = false;
  private dragMoved: boolean = false;
  private connecting: boolean = false;
  private spacePanning: boolean = false;
  private rightPanning: boolean = false;
  private rightDownPos: Vector2 = new Vector2();
  private rightPanStarted: boolean = false;
  private suppressContextMenu: boolean = false;
  private lastPanPos: Vector2 = new Vector2();
  private pendingFromPort: Port | null = null;
  private pendingFromNode: BlueprintNode | null = null;
  private magnetedPort: Port | null = null;
  private dragMode: DragMode = DragMode.NONE;
  private dragStartScreen: Vector2 = new Vector2();
  private dragLastScreen: Vector2 = new Vector2();
  private dragSavedFrameId: string | null = null;
  private tempSelectionBounds: Rect | null = null;
  private savedFrameLabelWidths: Map<string, number> = new Map();
  private resizeNode: BlueprintNode | null = null;
  private resizeCorner: ResizeCorner | null = null;
  private resizeStartWidth: number = 0;
  private resizeStartHeight: number = 0;
  private resizeStartX: number = 0;
  private resizeStartY: number = 0;
  private moveStartPositions: Map<string, Vector2> = new Map();

  private editingTempInput: boolean = false;
  private editingSavedFrameId: string | null = null;
  private editText: string = '';
  private lastClickTime: number = 0;
  private lastClickScreen: Vector2 = new Vector2();
  private pendingClickNode: BlueprintNode | null = null;
  private clickDownScreen: Vector2 = new Vector2();

  constructor() {
    super('blueprint_editor', 'default');
  }

  private get bpScene(): BlueprintScene {
    return this.manager!.scene as BlueprintScene;
  }

  private getEditState(cameraZoom: number): FrameEditState {
    const time = performance.now();
    return {
      editingTempInput: this.editingTempInput,
      editingFrameId: this.editingSavedFrameId,
      editText: this.editText,
      cursorBlink: Math.floor(time / 500) % 2 === 0
    };
  }

  private startEditTempInput(defaultText: string = ''): void {
    this.editingTempInput = true;
    this.editingSavedFrameId = null;
    this.editText = defaultText;
  }

  private startEditSavedFrame(frameId: string, currentLabel: string): void {
    this.editingSavedFrameId = frameId;
    this.editingTempInput = false;
    this.editText = currentLabel;
  }

  private cancelEdit(): void {
    this.editingTempInput = false;
    this.editingSavedFrameId = null;
    this.editText = '';
  }

  private commitTempEdit(): void {
    const scene = this.bpScene;
    const sel = this.manager!.selection;
    const selectedNodes = sel.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
    if (selectedNodes.length >= 2) {
      const label = this.editText.trim() || `分组 ${scene.getSavedSelectionFrames().length + 1}`;
      scene.saveSelectionFrame(selectedNodes.map(n => n.id), label);
    }
    this.cancelEdit();
  }

  private commitSavedFrameEdit(): void {
    if (this.editingSavedFrameId) {
      const newLabel = this.editText.trim();
      if (newLabel) {
        this.bpScene.renameSavedSelectionFrame(this.editingSavedFrameId, newLabel);
      }
    }
    this.cancelEdit();
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

  private clampSelectionToBoundary(): void {
    const sel = this.manager!.selection;
    const nodes = sel.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
    if (nodes.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes) {
      const b = node.getWorldBounds();
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.width > maxX) maxX = b.x + b.width;
      if (b.y + b.height > maxY) maxY = b.y + b.height;
    }

    let adjustX = 0, adjustY = 0;
    if (minX < -DRAG_BOUNDARY) adjustX = -DRAG_BOUNDARY - minX;
    if (maxX > DRAG_BOUNDARY) adjustX = DRAG_BOUNDARY - maxX;
    if (minY < -DRAG_BOUNDARY) adjustY = -DRAG_BOUNDARY - minY;
    if (maxY > DRAG_BOUNDARY) adjustY = DRAG_BOUNDARY - maxY;

    if (adjustX !== 0 || adjustY !== 0) {
      for (const node of nodes) {
        node.translate(adjustX, adjustY);
      }
    }
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

  private hitTestTempFrameInput(screenPoint: Vector2): boolean {
    if (!this.tempSelectionBounds) return false;
    const camera = this.bpScene.camera;
    const sel = this.manager!.selection;
    const count = sel.getSelection().filter(n => n instanceof BlueprintNode).length;
    if (count < 2) return false;
    return pointInTempFrameInput(screenPoint, this.tempSelectionBounds, count, camera);
  }

  private hitTestTempFrameSaveBtn(screenPoint: Vector2): boolean {
    if (!this.tempSelectionBounds) return false;
    const camera = this.bpScene.camera;
    const sel = this.manager!.selection;
    const count = sel.getSelection().filter(n => n instanceof BlueprintNode).length;
    if (count < 2) return false;
    return pointInTempFrameSaveBtn(screenPoint, this.tempSelectionBounds, count, camera);
  }

  private hitTestResizeHandle(screenPoint: Vector2): { node: BlueprintNode; corner: ResizeCorner } | null {
    const scene = this.bpScene;
    const camera = scene.camera;
    const invZoom = 1 / camera.zoom;
    const worldPoint = camera.screenToWorld(screenPoint);

    const allNodes = scene.getAllBlueprintNodes();
    for (let i = allNodes.length - 1; i >= 0; i--) {
      const node = allNodes[i];
      if (!node.selected && !node.hoveredResizeCorner) continue;
      const localPoint = node.worldToLocal(worldPoint);
      const corner = node.getResizeCornerAtPoint(localPoint, invZoom);
      if (corner) {
        return { node, corner };
      }
    }
    return null;
  }

  private isDoubleClick(screenPoint: Vector2): boolean {
    const now = performance.now();
    const dt = now - this.lastClickTime;
    const dist = Math.hypot(screenPoint.x - this.lastClickScreen.x, screenPoint.y - this.lastClickScreen.y);
    this.lastClickTime = now;
    this.lastClickScreen.copy(screenPoint);
    return dt < DOUBLE_CLICK_MS && dist < 5;
  }

  onPointerDown(event: GraphPointerEvent, hit: HitTestResult | null): void {
    const scene = this.bpScene;
    const sel = this.manager!.selection;
    const drag = this.manager!.drag;

    if (scene.isDomInteractionLocked) {
      return;
    }

    this.pendingClickNode = null;
    this.dragging = false;
    this.dragMoved = false;
    this.dragMode = DragMode.NONE;
    this.resizeNode = null;
    this.resizeCorner = null;
    this.connecting = false;
    this.dragSavedFrameId = null;
    this.pendingFromPort = null;
    this.pendingFromNode = null;
    this.magnetedPort = null;
    this.rightPanning = false;
    this.rightPanStarted = false;
    this.suppressContextMenu = false;
    this.moveStartPositions.clear();
    drag.cancelDrag();

    if (this.editingTempInput || this.editingSavedFrameId) {
      const inTempInput = this.hitTestTempFrameInput(event.screenPosition);
      const inTempSave = this.hitTestTempFrameSaveBtn(event.screenPosition);
      const savedHit = this.hitTestSavedFrame(event.screenPosition);
      const inEditingSavedTag = savedHit && savedHit.hitTagBar && savedHit.frameId === this.editingSavedFrameId;

      if (inTempSave) {
        this.commitTempEdit();
        scene.requestRedraw();
        return;
      }
      if (inEditingSavedTag && !savedHit!.hitDelete) {
      } else if (!inTempInput && !inEditingSavedTag) {
        if (this.editingTempInput) {
          this.commitTempEdit();
        } else if (this.editingSavedFrameId) {
          this.commitSavedFrameEdit();
        }
        scene.requestRedraw();
      }
    }

    this.updateTempSelectionBounds();
    this.measureSavedFrameLabels();

    if (event.button === 2) {
      this.rightPanning = true;
      this.rightPanStarted = false;
      this.suppressContextMenu = false;
      this.rightDownPos.copy(event.screenPosition);
      this.lastPanPos.copy(event.screenPosition);
      this.setCursor('grab');
      scene.isViewportPanning = false;
      scene.requestRedraw();
      return;
    }

    if (event.button === 0) {
      const resizeHit = this.hitTestResizeHandle(event.screenPosition);
      if (resizeHit) {
        this.resizeNode = resizeHit.node;
        this.resizeCorner = resizeHit.corner;
        this.resizeStartWidth = resizeHit.node.data.width;
        this.resizeStartHeight = resizeHit.node.data.height;
        this.resizeStartX = resizeHit.node.transform.position.x;
        this.resizeStartY = resizeHit.node.transform.position.y;
        this.dragMode = DragMode.RESIZE;
        this.dragging = true;
        this.dragMoved = false;
        this.dragStartScreen.copy(event.screenPosition);
        this.dragLastScreen.copy(event.screenPosition);
        this.setCursor(resizeHit.node.getResizeCursor(resizeHit.corner));
        scene.requestRedraw();
        return;
      }

      const tempSaveHit = this.hitTestTempFrameSaveBtn(event.screenPosition);
      if (tempSaveHit) {
        this.commitTempEdit();
        scene.requestRedraw();
        return;
      }

      const tempInputHit = this.hitTestTempFrameInput(event.screenPosition);
      if (tempInputHit) {
        this.startEditTempInput(this.editText);
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
          const isDblClick = this.isDoubleClick(event.screenPosition);
          if (isDblClick) {
            const frame = scene.getSavedSelectionFrame(savedFrameHit.frameId);
            if (frame) {
              this.startEditSavedFrame(savedFrameHit.frameId, frame.label);
              scene.requestRedraw();
              return;
            }
          }

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
          this.moveStartPositions.clear();
          for (const n of sel.getSelection()) {
            if (n instanceof BlueprintNode) {
              this.moveStartPositions.set(n.id, new Vector2(n.transform.position.x, n.transform.position.y));
            }
          }
          this.setCursor('grabbing');
          scene.requestRedraw();
          return;
        }
      }

      const isDblClickOnTempCount = this.tempSelectionBounds && (() => {
        const screenTopLeft = scene.camera.worldToScreen(new Vector2(this.tempSelectionBounds!.x, this.tempSelectionBounds!.y));
        const tagBarH = SELECTION_FRAME_CONSTANTS.TAG_BAR_HEIGHT * scene.camera.zoom;
        const countRect = new Rect(screenTopLeft.x, screenTopLeft.y, 100, tagBarH);
        return countRect.containsPoint(event.screenPosition);
      })();
      if (isDblClickOnTempCount && this.tempSelectionBounds) {
        const selectedNodes = sel.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
        if (selectedNodes.length >= 2) {
          this.startEditTempInput(`分组 ${scene.getSavedSelectionFrames().length + 1}`);
          scene.requestRedraw();
          return;
        }
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
      scene.isViewportPanning = true;
      this.lastPanPos.copy(event.screenPosition);
      this.setCursor('grabbing');
      return;
    }

    if (hit) {
      const node = hit.node;
      if (node instanceof BlueprintNode) {
        this.pendingClickNode = node;
        this.clickDownScreen.copy(event.screenPosition);
      } else {
        this.pendingClickNode = null;
      }
      if (node.selectable) {
        if (event.shiftKey || event.ctrlKey) {
          sel.toggleSelect(node);
        } else if (!sel.isSelected(node)) {
          sel.select(node, false);
        }

        this.updateTempSelectionBounds();

        if (node.draggable && node instanceof BlueprintNode && !event.shiftKey && !event.ctrlKey) {
          const targetIsSelected = sel.isSelected(node);
          this.dragMode = DragMode.NODES;
          this.dragging = true;
          this.dragMoved = false;
          this.moveStartPositions.clear();
          const nodesToRecord = targetIsSelected
            ? sel.getSelection().filter(n => n instanceof BlueprintNode && n.draggable)
            : [node];
          for (const n of nodesToRecord) {
            this.moveStartPositions.set(n.id, new Vector2(n.transform.position.x, n.transform.position.y));
          }
          const actualNodesToDrag = targetIsSelected && nodesToRecord.length > 0
            ? nodesToRecord
            : [node];
          drag.startDragWithNodes(actualNodesToDrag, event, node);
          scene.isEngineDragging = true;
          console.log('[DRAG-DIAG] pointerdown: start node drag, nodeId=', node.id, 'startPos=', node.transform.position.x, node.transform.position.y, 'isEngineDragging=true');
        }
      }
    } else {
      this.pendingClickNode = null;
      if (this.hitTestTempFrameDragArea(event.screenPosition)) {
        this.dragMode = DragMode.SELECTION_FRAME;
        this.dragging = true;
        this.dragMoved = false;
        this.dragStartScreen.copy(event.screenPosition);
        this.dragLastScreen.copy(event.screenPosition);
        this.moveStartPositions.clear();
        for (const n of sel.getSelection()) {
          if (n instanceof BlueprintNode) {
            this.moveStartPositions.set(n.id, new Vector2(n.transform.position.x, n.transform.position.y));
          }
        }
        scene.isEngineDragging = true;
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
        if (hoveredPort.isInput && hoveredNode !== this.pendingFromNode && this.pendingFromPort) {
          compatible = scene.isPortCompatible(this.pendingFromPort, hoveredPort);
        } else {
          compatible = false;
        }
      }

      let nearestPort: Port | null = null;
      let nearestDist = ANCHOR_MAGNET_DISTANCE;
      for (const node of scene.getAllBlueprintNodes()) {
        if (node === this.pendingFromNode) continue;
        for (const inputPort of node.inputPorts) {
          const portWorldPos = inputPort.getWorldPosition();
          const dist = Math.hypot(worldPos.x - portWorldPos.x, worldPos.y - portWorldPos.y);
          if (dist < nearestDist && this.pendingFromPort) {
            if (scene.isPortCompatible(this.pendingFromPort, inputPort)) {
              nearestDist = dist;
              nearestPort = inputPort;
            }
          }
        }
      }

      if (nearestPort) {
        hoveredPort = nearestPort;
        compatible = true;
      }

      this.magnetedPort = hoveredPort;

      for (const node of scene.getAllBlueprintNodes()) {
        for (const p of [...node.inputPorts, ...node.outputPorts]) {
          p.setSnapped(p === hoveredPort, compatible);
        }
      }

      if (hoveredPort && compatible) {
        const snappedWorldPos = hoveredPort.getWorldPosition();
        scene.updatePendingConnection(snappedWorldPos, hoveredPort, compatible);
      } else {
        scene.updatePendingConnection(worldPos, hoveredPort, compatible);
      }
      scene.requestRedraw();
      return;
    }

    if (this.spacePanning) {
      const dx = event.screenPosition.x - this.lastPanPos.x;
      const dy = event.screenPosition.y - this.lastPanPos.y;
      scene.panBy(dx, dy);
      this.lastPanPos.copy(event.screenPosition);
      return;
    }

    if (this.rightPanning) {
      if (!this.rightPanStarted) {
        const dx = event.screenPosition.x - this.rightDownPos.x;
        const dy = event.screenPosition.y - this.rightDownPos.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < RIGHT_PAN_THRESHOLD_DIST * RIGHT_PAN_THRESHOLD_DIST) {
          return;
        }
        this.rightPanStarted = true;
        scene.isViewportPanning = true;
        this.setCursor('grabbing');
      }
      const dx = event.screenPosition.x - this.lastPanPos.x;
      const dy = event.screenPosition.y - this.lastPanPos.y;
      scene.panBy(dx, dy);
      this.lastPanPos.copy(event.screenPosition);
      return;
    }

    if (this.editingTempInput || this.editingSavedFrameId) {
      scene.requestRedraw();
      return;
    }

    if (this.dragMode === DragMode.NODES) {
      if (drag.isDragging()) {
        const dx = event.screenPosition.x - this.clickDownScreen.x;
        const dy = event.screenPosition.y - this.clickDownScreen.y;
        const distSq = dx * dx + dy * dy;
        if (distSq >= CLICK_DRAG_THRESHOLD * CLICK_DRAG_THRESHOLD) {
          if (!this.dragMoved) {
            this.dragMoved = true;
            this.setCursor('grabbing');
            console.log('[DRAG-DIAG] pointermove: threshold exceeded, dragMoved=true, distSq=', distSq);
          }
        }
        if (this.dragMoved) {
          const firstDraggedNode = drag.getDraggedNodes()[0];
          const posBefore = firstDraggedNode ? { x: firstDraggedNode.transform.position.x, y: firstDraggedNode.transform.position.y } : null;
          drag.updateDrag(event);
          const posAfter = firstDraggedNode ? { x: firstDraggedNode.transform.position.x, y: firstDraggedNode.transform.position.y } : null;
          this.clampSelectionToBoundary();
          this.updateTempSelectionBounds();
          scene.updateAllConnectionEndpoints();
          if (posBefore && posAfter && (posBefore.x !== posAfter.x || posBefore.y !== posAfter.y)) {
            // 仅在第一次有位移时输出，避免日志过多
          }
        }
        scene.requestRedraw();
      } else {
        console.log('[DRAG-DIAG] pointermove: dragMode=NODES but drag.isDragging()=false');
      }
    } else if (this.dragMode === DragMode.RESIZE && this.resizeNode && this.resizeCorner) {
      const mouseWorld = scene.camera.screenToWorld(event.screenPosition);

      let newWidth: number;
      let newHeight: number;
      let newX: number;
      let newY: number;

      switch (this.resizeCorner) {
        case 'bottom-right': {
          newX = this.resizeStartX;
          newY = this.resizeStartY;
          newWidth = Math.max(MIN_NODE_WIDTH, mouseWorld.x - this.resizeStartX);
          newHeight = Math.max(MIN_NODE_HEIGHT, mouseWorld.y - this.resizeStartY);
          break;
        }
        case 'bottom-left': {
          newY = this.resizeStartY;
          const rightEdge = this.resizeStartX + this.resizeStartWidth;
          newWidth = Math.max(MIN_NODE_WIDTH, rightEdge - mouseWorld.x);
          newHeight = Math.max(MIN_NODE_HEIGHT, mouseWorld.y - this.resizeStartY);
          newX = rightEdge - newWidth;
          break;
        }
        case 'top-right': {
          newX = this.resizeStartX;
          const bottomEdge = this.resizeStartY + this.resizeStartHeight;
          newWidth = Math.max(MIN_NODE_WIDTH, mouseWorld.x - this.resizeStartX);
          newHeight = Math.max(MIN_NODE_HEIGHT, bottomEdge - mouseWorld.y);
          newY = bottomEdge - newHeight;
          break;
        }
        case 'top-left': {
          const rightEdge = this.resizeStartX + this.resizeStartWidth;
          const bottomEdge = this.resizeStartY + this.resizeStartHeight;
          newWidth = Math.max(MIN_NODE_WIDTH, rightEdge - mouseWorld.x);
          newHeight = Math.max(MIN_NODE_HEIGHT, bottomEdge - mouseWorld.y);
          newX = rightEdge - newWidth;
          newY = bottomEdge - newHeight;
          break;
        }
      }

      this.resizeNode.setPosition(newX, newY);
      this.resizeNode.updateSize(newWidth, newHeight);
      this.resizeNode.data.sizeCustomized = true;
      this.resizeNode.hoveredResizeCorner = this.resizeCorner;

      this.dragMoved = true;
      this.setCursor(this.resizeNode.getResizeCursor(this.resizeCorner));
      scene.updateAllConnectionEndpoints();
      scene.requestRedraw();
    } else if (this.dragMode === DragMode.SELECTION_FRAME) {
      const dx = event.screenPosition.x - this.dragLastScreen.x;
      const dy = event.screenPosition.y - this.dragLastScreen.y;
      const worldDelta = scene.camera.screenDeltaToWorld(new Vector2(dx, dy));
      sel.moveSelection(worldDelta);
      this.clampSelectionToBoundary();
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
      this.clampSelectionToBoundary();
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

      for (const node of scene.getAllBlueprintNodes()) {
        node.hoveredResizeCorner = null;
      }

      const resizeHit = this.hitTestResizeHandle(event.screenPosition);
      if (resizeHit) {
        resizeHit.node.hoveredResizeCorner = resizeHit.corner;
        this.setCursor(resizeHit.node.getResizeCursor(resizeHit.corner));
      } else {
        const tempSaveHit = this.hitTestTempFrameSaveBtn(event.screenPosition);
        const tempInputHit = this.hitTestTempFrameInput(event.screenPosition);
        const savedFrameHit = this.hitTestSavedFrame(event.screenPosition);
        if (tempSaveHit || tempInputHit) {
          this.setCursor(tempSaveHit ? 'pointer' : 'text');
        } else if (savedFrameHit && savedFrameHit.hitDelete) {
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
      scene.requestRedraw();
    }
  }

  onPointerUp(event: GraphPointerEvent, hit: HitTestResult | null): void {
    const scene = this.bpScene;
    const sel = this.manager!.selection;
    const drag = this.manager!.drag;

    if (scene.isDomInteractionLocked) {
      this.dragging = false;
      this.dragMoved = false;
      this.dragMode = DragMode.NONE;
      this.pendingClickNode = null;
      scene.isEngineDragging = false;
      return;
    }

    if (this.connecting) {
      this.connecting = false;
      scene.isEngineDragging = false;
      if (this.pendingFromPort) {
        this.pendingFromPort.setArmed(false);
      }
      for (const node of scene.getAllBlueprintNodes()) {
        for (const p of [...node.inputPorts, ...node.outputPorts]) {
          p.setSnapped(false);
        }
      }

      let completed = false;
      let targetPort: Port | null = this.magnetedPort;
      if (!targetPort && hit && hit.node instanceof Port) {
        targetPort = hit.node;
      }

      if (targetPort) {
        const targetNode = this.findParentNode(targetPort);
        if (
          targetNode &&
          this.pendingFromNode &&
          this.pendingFromPort &&
          targetPort.isInput &&
          !this.pendingFromPort.isInput &&
          targetNode !== this.pendingFromNode
        ) {
          const connData = scene.completePendingConnection(targetNode, targetPort);
          if (connData) {
            scene.executeCommand(new CreateConnectionCommand(scene, connData));
          }
          completed = true;
        }
      }
      if (!completed) {
        const clientX = event.originalEvent.clientX;
        const clientY = event.originalEvent.clientY;
        scene.on.emit('link-drop-on-canvas', {
          clientX,
          clientY,
          worldX: event.worldPosition.x,
          worldY: event.worldPosition.y,
          fromNodeId: this.pendingFromNode?.id ?? '',
          fromAnchorId: this.pendingFromPort?.spec.id ?? ''
        });
        scene.cancelPendingConnection();
      }
      this.pendingFromPort = null;
      this.pendingFromNode = null;
      this.magnetedPort = null;
      this.dragging = false;
      this.dragMoved = false;
      this.dragMode = DragMode.NONE;
      this.pendingClickNode = null;
      this.moveStartPositions.clear();
      scene.isEngineDragging = false;
      drag.cancelDrag();
      this.setCursor('default');
      scene.requestRedraw();
      return;
    }

    if (this.spacePanning) {
      this.spacePanning = false;
      this.dragging = false;
      this.dragMoved = false;
      this.dragMode = DragMode.NONE;
      this.pendingClickNode = null;
      this.moveStartPositions.clear();
      scene.isEngineDragging = false;
      scene.isViewportPanning = false;
      drag.cancelDrag();
      this.setCursor('default');
      return;
    }

    if (this.rightPanning) {
      if (this.rightPanStarted) {
        this.suppressContextMenu = true;
      }
      this.rightPanning = false;
      this.rightPanStarted = false;
      this.dragging = false;
      this.dragMoved = false;
      this.dragMode = DragMode.NONE;
      this.pendingClickNode = null;
      this.moveStartPositions.clear();
      scene.isEngineDragging = false;
      scene.isViewportPanning = false;
      drag.cancelDrag();
      this.setCursor('default');
      return;
    }

    if (this.dragMode === DragMode.NODES) {
      const totalDist = this.pendingClickNode
        ? Math.hypot(event.screenPosition.x - this.clickDownScreen.x, event.screenPosition.y - this.clickDownScreen.y)
        : 0;
      const isClick = totalDist < CLICK_DRAG_THRESHOLD;

      if (drag.isDragging()) {
        if (isClick) {
          console.log('[DRAG-DIAG] pointerup: isClick=true (dist=' + totalDist.toFixed(1) + '), cancelDrag');
          drag.cancelDrag();
          scene.isEngineDragging = false;
        } else {
          const draggedNodes = drag.getDraggedNodes().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
          drag.endDrag(event);
          if (draggedNodes.length > 0 && this.moveStartPositions.size > 0) {
            const endPositions = new Map<string, Vector2>();
            for (const n of draggedNodes) {
              endPositions.set(n.id, new Vector2(n.transform.position.x, n.transform.position.y));
              const start = this.moveStartPositions.get(n.id);
              console.log('[DRAG-DIAG] pointerup: drag end, nodeId=', n.id, 'start=', start?.x, start?.y, 'end=', n.transform.position.x, n.transform.position.y);
            }
            const moveFn = (id: string, pos: Vector2) => {
              const node = scene.getBlueprintNode(id);
              if (node) {
                node.setPosition(pos.x, pos.y);
              }
            };
            scene.isEngineDragging = false;
            console.log('[DRAG-DIAG] pointerup: isEngineDragging=false before executeCommand');
            scene.executeCommand(new MoveNodeCommand(this.moveStartPositions, endPositions, moveFn));
            scene.updateAllConnectionEndpoints();
            console.log('[DRAG-DIAG] pointerup: MoveNodeCommand executed, about to emitChange');
          }
        }
      } else {
        console.log('[DRAG-DIAG] pointerup: dragMode=NODES but drag.isDragging()=false');
      }
      this.moveStartPositions.clear();
      this.dragMoved = !isClick;
    } else if (this.dragMode === DragMode.RESIZE) {
      if (this.resizeNode && this.dragMoved) {
        const node = this.resizeNode;
        scene.isEngineDragging = false;
        scene.executeCommand(new ResizeNodeCommand(
          scene,
          node,
          this.resizeStartX,
          this.resizeStartY,
          this.resizeStartWidth,
          this.resizeStartHeight,
          node.transform.position.x,
          node.transform.position.y,
          node.data.width,
          node.data.height
        ));
      }
      this.resizeNode = null;
      this.resizeCorner = null;
    } else if (this.dragMode === DragMode.SELECTION_FRAME) {
      if (this.dragMoved && this.moveStartPositions.size > 0) {
        const selectedNodes = sel.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
        const endPositions = new Map<string, Vector2>();
        for (const n of selectedNodes) {
          endPositions.set(n.id, new Vector2(n.transform.position.x, n.transform.position.y));
        }
        const moveFn = (id: string, pos: Vector2) => {
          const node = scene.getBlueprintNode(id);
          if (node) {
            node.setPosition(pos.x, pos.y);
          }
        };
        scene.isEngineDragging = false;
        scene.executeCommand(new MoveNodeCommand(this.moveStartPositions, endPositions, moveFn));
        scene.updateAllConnectionEndpoints();
      } else if (!this.dragMoved && this.tempSelectionBounds) {
        sel.clearSelection();
      }
      this.moveStartPositions.clear();
    } else if (this.dragMode === DragMode.SAVED_FRAME) {
      if (this.dragMoved && this.moveStartPositions.size > 0) {
        const selectedNodes = sel.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
        const endPositions = new Map<string, Vector2>();
        for (const n of selectedNodes) {
          endPositions.set(n.id, new Vector2(n.transform.position.x, n.transform.position.y));
        }
        const moveFn = (id: string, pos: Vector2) => {
          const node = scene.getBlueprintNode(id);
          if (node) {
            node.setPosition(pos.x, pos.y);
          }
        };
        scene.isEngineDragging = false;
        scene.executeCommand(new MoveNodeCommand(this.moveStartPositions, endPositions, moveFn));
        scene.updateAllConnectionEndpoints();
      }
      this.dragSavedFrameId = null;
      this.moveStartPositions.clear();
    } else if (sel.isMarqueeing()) {
      const additive = event.shiftKey || event.ctrlKey;
      const direction = sel.getMarqueeDirection();
      const mode = direction === 'left-to-right' ? 'contain' : 'intersect';
      sel.endMarquee(additive, mode);
    }

    if (!this.dragMoved && this.pendingClickNode) {
      scene.on.emit('node-click', this.pendingClickNode);
    }

    this.dragging = false;
    this.dragMoved = false;
    this.dragMode = DragMode.NONE;
    scene.isEngineDragging = false;
    this.pendingClickNode = null;
    this.resizeNode = null;
    this.resizeCorner = null;
    this.dragSavedFrameId = null;
    this.moveStartPositions.clear();
    drag.cancelDrag();
    this.updateTempSelectionBounds();
    scene.updateAllConnectionEndpoints();
    scene.requestRedraw();
  }

  onContextMenu(_event: GraphPointerEvent, _hit: HitTestResult | null): boolean {
    if (this.suppressContextMenu) {
      this.suppressContextMenu = false;
      return true;
    }
    return false;
  }

  onWheel(event: GraphWheelEvent): void {
    const scene = this.bpScene;
    event.preventDefault();
    scene.zoomAt(event.screenPosition, event.deltaY);
  }

  onKeyDown(event: GraphKeyboardEvent): void {
    const scene = this.bpScene;
    const sel = this.manager!.selection;
    const key = event.key.toLowerCase();

    const activeEl = document.activeElement as HTMLElement | null;
    const isInputFocused = !!(
      activeEl &&
      (activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable ||
        activeEl.closest('.bp-node-chat-dialog'))
    );

    if (isInputFocused && !this.editingTempInput && !this.editingSavedFrameId) {
      if (key === 'escape' && !event.repeat) {
        (activeEl as HTMLElement).blur();
      }
      return;
    }

    if (this.editingTempInput || this.editingSavedFrameId) {
      if (key === 'enter' && !event.repeat) {
        event.preventDefault();
        if (this.editingTempInput) {
          this.commitTempEdit();
        } else {
          this.commitSavedFrameEdit();
        }
        scene.requestRedraw();
        return;
      }
      if (key === 'escape' && !event.repeat) {
        event.preventDefault();
        this.cancelEdit();
        scene.requestRedraw();
        return;
      }
      if (key === 'backspace' && !event.repeat) {
        event.preventDefault();
        this.editText = this.editText.slice(0, -1);
        scene.requestRedraw();
        return;
      }
      if (key === 'delete' && !event.repeat) {
        return;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        this.editText += event.key;
        scene.requestRedraw();
        return;
      }
      return;
    }

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
      if (nodeIdsToRemove.length > 0 || connIdsToRemove.length > 0) {
        scene.executeCommand(new DeleteSelectionCommand(scene, nodeIdsToRemove, connIdsToRemove));
        sel.clearSelection();
        scene.updateAllConnectionEndpoints();
      }
    }
    if ((key === 'z') && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.repeat) {
      event.preventDefault();
      scene.undo();
      scene.updateAllConnectionEndpoints();
      scene.requestRedraw();
      return;
    }
    if ((key === 'z') && (event.ctrlKey || event.metaKey) && event.shiftKey && !event.repeat) {
      event.preventDefault();
      scene.redo();
      scene.updateAllConnectionEndpoints();
      scene.requestRedraw();
      return;
    }
    if ((key === 'y') && (event.ctrlKey || event.metaKey) && !event.repeat) {
      event.preventDefault();
      scene.redo();
      scene.updateAllConnectionEndpoints();
      scene.requestRedraw();
      return;
    }
    if (key === 'a' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      sel.selectAll();
    }
    if (key === 'c' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      const selectedNodes = sel.getSelection().filter(n => n instanceof BlueprintNode) as BlueprintNode[];
      scene.copySelection(selectedNodes);
    }
    if (key === 'v' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (scene.hasClipboardData()) {
        scene.executePaste(50, 50);
      }
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
    if ((key === '=' || key === '+' || key === 'numpadadd') && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      const camera = scene.camera;
      const center = new Vector2(camera.viewport.width / 2, camera.viewport.height / 2);
      scene.setZoom(camera.zoom * 1.1, center);
    }
    if ((key === '-' || key === '_' || key === 'numpadsubtract') && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      const camera = scene.camera;
      const center = new Vector2(camera.viewport.width / 2, camera.viewport.height / 2);
      scene.setZoom(camera.zoom / 1.1, center);
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

  onPreRender(ctx: RenderContext): void {
    const scene = this.bpScene;
    const camera = scene.camera;

    this.measureSavedFrameLabels();

    const editState = this.getEditState(camera.zoom);

    for (const frame of scene.getSavedSelectionFrames()) {
      const nodes = scene.getNodesByIds(frame.nodeIds);
      if (nodes.length < 2) continue;
      const bounds = computeSelectionBounds(nodes);
      if (bounds) {
        drawSelectionFrame(ctx.ctx, bounds, camera.zoom, true, frame.label, undefined, editState);
      }
    }
  }

  onRender(ctx: RenderContext): void {
    const sel = this.manager!.selection;
    const scene = this.bpScene;
    const camera = scene.camera;
    const marqueeRect = sel.getMarqueeRect();

    this.updateTempSelectionBounds();
    if (this.tempSelectionBounds && !sel.isMarqueeing()) {
      const selectedNodes = sel.getSelection().filter(n => n instanceof BlueprintNode);
      if (selectedNodes.length >= 2) {
        const editState = this.getEditState(camera.zoom);
        drawSelectionFrame(ctx.ctx, this.tempSelectionBounds, camera.zoom, false, undefined, selectedNodes.length, editState);
      }
    }

    if (marqueeRect) {
      ctx.save();
      const lineWidth = 1 / camera.zoom;
      ctx.ctx.lineWidth = lineWidth;
      const direction = sel.getMarqueeDirection();
      if (direction === 'left-to-right') {
        ctx.ctx.setLineDash([]);
        ctx.ctx.fillStyle = 'rgba(91, 155, 213, 0.08)';
        ctx.ctx.strokeStyle = 'rgba(91, 155, 213, 0.8)';
      } else {
        ctx.ctx.setLineDash([4 / camera.zoom, 4 / camera.zoom]);
        ctx.ctx.fillStyle = 'rgba(46, 204, 113, 0.08)';
        ctx.ctx.strokeStyle = 'rgba(46, 204, 113, 0.8)';
      }
      ctx.ctx.fillRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height);
      ctx.ctx.strokeRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height);
      ctx.ctx.setLineDash([]);
      ctx.restore();
    }
  }
}
