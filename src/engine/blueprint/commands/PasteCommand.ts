import { Command } from '../../graphbase/commands/Command';
import type { BlueprintScene } from '../BlueprintScene';
import type { BlueprintNodeData, ConnectionData } from '../types';
import { Vector2 } from '../../graphbase/core/Vector2';

export class PasteCommand extends Command {
  private scene: BlueprintScene;
  private nodeDatas: BlueprintNodeData[];
  private edgeDatas: ConnectionData[];
  private targetPos: Vector2 | null;
  private offsetX: number;
  private offsetY: number;
  private createdNodeIds: string[] = [];
  private createdEdgeIds: string[] = [];
  private createdNodesData: BlueprintNodeData[] = [];
  private createdEdgesData: ConnectionData[] = [];

  constructor(
    scene: BlueprintScene,
    clipboardNodes: BlueprintNodeData[],
    clipboardEdges: ConnectionData[],
    targetWorldX?: number,
    targetWorldY?: number,
    fallbackOffsetX: number = 50,
    fallbackOffsetY: number = 50
  ) {
    super('paste');
    this.scene = scene;
    this.nodeDatas = clipboardNodes.map(n => ({ ...n }));
    this.edgeDatas = clipboardEdges.map(e => ({ ...e }));
    if (targetWorldX !== undefined && targetWorldY !== undefined) {
      this.targetPos = new Vector2(targetWorldX, targetWorldY);
      this.offsetX = 0;
      this.offsetY = 0;
    } else {
      this.targetPos = null;
      this.offsetX = fallbackOffsetX;
      this.offsetY = fallbackOffsetY;
    }
  }

  private computePasteOffset(): { dx: number; dy: number } {
    if (this.targetPos && this.nodeDatas.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of this.nodeDatas) {
        minX = Math.min(minX, n.worldX);
        minY = Math.min(minY, n.worldY);
        maxX = Math.max(maxX, n.worldX + (n.width ?? 200));
        maxY = Math.max(maxY, n.worldY + (n.height ?? 100));
      }
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      return {
        dx: this.targetPos.x - centerX,
        dy: this.targetPos.y - centerY
      };
    }
    return { dx: this.offsetX, dy: this.offsetY };
  }

  execute(): void {
    if (this.createdNodesData.length > 0) {
      this.redo();
      return;
    }

    const { dx, dy } = this.computePasteOffset();
    const idMap = new Map<string, string>();

    for (const srcData of this.nodeDatas) {
      const newId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      idMap.set(srcData.id, newId);

      const newData: BlueprintNodeData = {
        ...srcData,
        id: newId,
        worldX: srcData.worldX + dx,
        worldY: srcData.worldY + dy,
        selected: false
      };

      this.createdNodesData.push(newData);
      this.createdNodeIds.push(newId);
      this.scene.addBlueprintNode(newData);
    }

    for (const srcEdge of this.edgeDatas) {
      const newFromId = idMap.get(srcEdge.fromNodeId);
      const newToId = idMap.get(srcEdge.toNodeId);
      if (!newFromId || !newToId) continue;

      const newConnId = `conn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const newConnData: ConnectionData = {
        ...srcEdge,
        id: newConnId,
        fromNodeId: newFromId,
        toNodeId: newToId
      };

      this.createdEdgesData.push(newConnData);
      this.createdEdgeIds.push(newConnId);
      this.scene.addConnection(newConnData);
    }

    this.scene.updateAllConnectionEndpoints();
    this.scene.requestRedraw();
  }

  undo(): void {
    for (const id of this.createdEdgeIds) {
      this.scene.removeConnection(id);
    }
    for (const id of this.createdNodeIds) {
      this.scene.removeBlueprintNode(id);
    }
    this.scene.requestRedraw();
  }

  redo(): void {
    for (const data of this.createdNodesData) {
      this.scene.addBlueprintNode({ ...data });
    }
    for (const data of this.createdEdgesData) {
      this.scene.addConnection({ ...data });
    }
    this.scene.updateAllConnectionEndpoints();
    this.scene.requestRedraw();
  }

  getCreatedNodeIds(): string[] {
    return [...this.createdNodeIds];
  }
}
