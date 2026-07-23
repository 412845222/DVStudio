import { Vector2 } from '../core/Vector2';
import { Rect } from '../core/Rect';
import { EventEmitter } from '../core/EventEmitter';
import type { Scene } from '../scene/Scene';
import { Node } from '../scene/Node';

export class SelectionManager {
  private scene: Scene;
  private selected: Set<string> = new Set();
  private marqueeStart: Vector2 | null = null;
  private marqueeEnd: Vector2 | null = null;
  private marqueeRect: Rect | null = null;
  readonly on: EventEmitter = new EventEmitter();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  select(node: Node, additive: boolean = false): void {
    if (!node.selectable) return;

    if (!additive) {
      this.clearSelection();
    }

    if (!this.selected.has(node.id)) {
      this.selected.add(node.id);
      node.onSelect();
      this.on.emit('select', { nodes: this.getSelection(), added: [node] });
      this.scene.requestRedraw();
    }
  }

  selectById(nodeId: string, additive: boolean = false): void {
    const node = this.scene.getNodeById(nodeId);
    if (node) {
      this.select(node, additive);
    }
  }

  deselect(node: Node): void {
    if (this.selected.has(node.id)) {
      this.selected.delete(node.id);
      node.onDeselect();
      this.on.emit('deselect', { nodes: this.getSelection(), removed: [node] });
      this.scene.requestRedraw();
    }
  }

  toggleSelect(node: Node): void {
    if (this.selected.has(node.id)) {
      this.deselect(node);
    } else {
      this.select(node, true);
    }
  }

  selectAll(): void {
    const allNodes = this.scene.getAllNodes().filter(n => n.selectable && n.draggable);
    for (const node of allNodes) {
      if (!this.selected.has(node.id)) {
        this.selected.add(node.id);
        node.onSelect();
      }
    }
    this.on.emit('select', { nodes: this.getSelection(), added: allNodes });
    this.scene.requestRedraw();
  }

  clearSelection(): void {
    if (this.selected.size === 0) return;
    const deselected: Node[] = [];
    for (const id of this.selected) {
      const node = this.scene.getNodeById(id);
      if (node) {
        node.onDeselect();
        deselected.push(node);
      }
    }
    this.selected.clear();
    this.on.emit('deselect', { nodes: [], removed: deselected });
    this.scene.requestRedraw();
  }

  setSelection(ids: string[]): void {
    this.clearSelection();
    for (const id of ids) {
      this.selectById(id, true);
    }
  }

  getSelection(): Node[] {
    const nodes: Node[] = [];
    for (const id of this.selected) {
      const node = this.scene.getNodeById<Node>(id);
      if (node) nodes.push(node);
    }
    return nodes;
  }

  getSelectedIds(): string[] {
    return Array.from(this.selected);
  }

  isSelected(node: Node): boolean {
    return this.selected.has(node.id);
  }

  isSelectedById(nodeId: string): boolean {
    return this.selected.has(nodeId);
  }

  getSelectionCount(): number {
    return this.selected.size;
  }

  isEmpty(): boolean {
    return this.selected.size === 0;
  }

  getSelectionBounds(): Rect | null {
    const nodes = this.getSelection();
    if (nodes.length === 0) return null;
    let bounds: Rect | null = null;
    for (const node of nodes) {
      const nodeBounds = node.getWorldBounds();
      if (!bounds) bounds = nodeBounds;
      else bounds = bounds.union(nodeBounds);
    }
    return bounds;
  }

  startMarquee(screenPoint: Vector2): void {
    this.marqueeStart = screenPoint.clone();
    this.marqueeEnd = screenPoint.clone();
    this.marqueeRect = null;
    this.on.emit('marquee-start', { start: this.marqueeStart });
  }

  updateMarquee(screenPoint: Vector2): Rect | null {
    if (!this.marqueeStart) return null;
    this.marqueeEnd = screenPoint.clone();
    const worldStart = this.scene.screenToWorld(this.marqueeStart);
    const worldEnd = this.scene.screenToWorld(this.marqueeEnd);
    this.marqueeRect = Rect.fromPoints(worldStart, worldEnd);
    this.scene.requestRedraw();
    return this.marqueeRect;
  }

  endMarquee(additive: boolean = false): Node[] {
    if (!this.marqueeRect) {
      this.marqueeStart = null;
      this.marqueeEnd = null;
      return [];
    }

    if (!additive) {
      this.clearSelection();
    }

    const selected: Node[] = [];
    const allNodes = this.scene.getAllNodes().filter(n => n.selectable && n.draggable);
    for (const node of allNodes) {
      const bounds = node.getWorldBounds();
      if (this.marqueeRect.containsRect(bounds) || this.marqueeRect.intersects(bounds)) {
        if (!this.selected.has(node.id)) {
          this.selected.add(node.id);
          node.onSelect();
          selected.push(node);
        }
      }
    }

    this.on.emit('marquee-end', { nodes: selected, rect: this.marqueeRect });
    this.marqueeStart = null;
    this.marqueeEnd = null;
    this.marqueeRect = null;
    this.scene.requestRedraw();
    return selected;
  }

  cancelMarquee(): void {
    this.marqueeStart = null;
    this.marqueeEnd = null;
    this.marqueeRect = null;
    this.scene.requestRedraw();
  }

  getMarqueeRect(): Rect | null {
    return this.marqueeRect;
  }

  isMarqueeing(): boolean {
    return this.marqueeStart !== null;
  }

  moveSelection(delta: Vector2): void {
    const nodes = this.getSelection().filter(n => n.draggable);
    for (const node of nodes) {
      node.translate(delta.x, delta.y);
      if (node instanceof Node) {
        node.onDragMove(delta, null);
      }
    }
    if (nodes.length > 0) {
      this.scene.requestRedraw();
      this.on.emit('selection-move', { nodes, delta });
    }
  }

  deleteSelection(): Node[] {
    const deleted = this.getSelection();
    for (const node of deleted) {
      this.scene.removeChild(node);
    }
    this.selected.clear();
    this.scene.requestRedraw();
    this.on.emit('selection-delete', { nodes: deleted });
    return deleted;
  }

  dispose(): void {
    this.selected.clear();
    this.marqueeStart = null;
    this.marqueeEnd = null;
    this.marqueeRect = null;
    this.on.removeAllListeners();
  }
}
