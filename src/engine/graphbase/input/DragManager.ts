import { Vector2 } from '../core/Vector2';
import { EventEmitter } from '../core/EventEmitter';
import type { Node } from '../scene/Node';
import type { GraphPointerEvent } from './events';

export interface DragState {
  node: Node;
  startScreen: Vector2;
  startWorld: Vector2;
  startPosition: Vector2;
  currentScreen: Vector2;
  currentWorld: Vector2;
  delta: Vector2;
  additive: boolean;
}

export class DragManager {
  private dragging: boolean = false;
  private dragState: DragState | null = null;
  private draggedNodes: Node[] = [];
  private startPositions: Map<string, Vector2> = new Map();
  readonly on: EventEmitter = new EventEmitter();

  isDragging(): boolean {
    return this.dragging;
  }

  getDragState(): DragState | null {
    return this.dragState;
  }

  getDraggedNodes(): Node[] {
    return this.draggedNodes;
  }

  startDrag(event: GraphPointerEvent, selectedNodes: Node[]): boolean {
    if (this.dragging) return false;

    const node = event.target;
    if (!node || !node.draggable) return false;

    let nodesToDrag = selectedNodes.includes(node) ? selectedNodes : [node];
    return this.startDragWithNodes(nodesToDrag, event, node);
  }

  startDragWithNodes(nodesToDrag: Node[], event: GraphPointerEvent, primaryNode: Node): boolean {
    if (this.dragging) return false;

    nodesToDrag = nodesToDrag.filter(n => n.draggable);
    if (nodesToDrag.length === 0) return false;

    this.draggedNodes = nodesToDrag;
    this.startPositions.clear();
    for (const n of nodesToDrag) {
      this.startPositions.set(n.id, new Vector2(n.transform.position.x, n.transform.position.y));
      n.onDragStart(event);
    }

    const worldPos = event.worldPosition;
    this.dragState = {
      node: primaryNode,
      startScreen: event.screenPosition.clone(),
      startWorld: worldPos.clone(),
      startPosition: new Vector2(primaryNode.transform.position.x, primaryNode.transform.position.y),
      currentScreen: event.screenPosition.clone(),
      currentWorld: worldPos.clone(),
      delta: new Vector2(),
      additive: event.ctrlKey || event.shiftKey
    };

    this.dragging = true;
    this.on.emit('dragstart', { nodes: this.draggedNodes, state: this.dragState });
    return true;
  }

  updateDrag(event: GraphPointerEvent): boolean {
    if (!this.dragging || !this.dragState) {
      return false;
    }

    this.dragState.currentScreen = event.screenPosition.clone();
    this.dragState.currentWorld = event.worldPosition.clone();
    this.dragState.delta = new Vector2(
      event.worldPosition.x - this.dragState.startWorld.x,
      event.worldPosition.y - this.dragState.startWorld.y
    );

    for (const node of this.draggedNodes) {
      const startPos = this.startPositions.get(node.id);
      if (startPos) {
        const newX = startPos.x + this.dragState.delta.x;
        const newY = startPos.y + this.dragState.delta.y;
        node.setPosition(newX, newY);
        node.onDragMove(this.dragState.delta, event);
      }
    }

    this.on.emit('dragmove', { nodes: this.draggedNodes, state: this.dragState });
    return true;
  }

  endDrag(event: GraphPointerEvent): Node[] {
    if (!this.dragging) return [];

    for (const node of this.draggedNodes) {
      node.onDragEnd(event);
    }

    const result = [...this.draggedNodes];
    this.on.emit('dragend', { nodes: result, state: this.dragState });

    this.dragging = false;
    this.dragState = null;
    this.draggedNodes = [];
    this.startPositions.clear();

    return result;
  }

  cancelDrag(): void {
    if (!this.dragging) return;

    for (const node of this.draggedNodes) {
      const startPos = this.startPositions.get(node.id);
      if (startPos) {
        node.setPosition(startPos.x, startPos.y);
      }
      node.dragging = false;
    }

    this.on.emit('dragcancel', { nodes: this.draggedNodes });
    this.dragging = false;
    this.dragState = null;
    this.draggedNodes = [];
    this.startPositions.clear();
  }
}
