import { Command } from '../../graphbase/commands/Command';
import type { BlueprintScene } from '../BlueprintScene';
import type { BlueprintNodeData, ConnectionData } from '../types';

export class PasteCommand extends Command {
  private scene: BlueprintScene;
  private nodeDatas: BlueprintNodeData[];
  private edgeDatas: ConnectionData[];
  private offsetX: number;
  private offsetY: number;
  private createdNodeIds: string[] = [];
  private createdEdgeIds: string[] = [];
  private createdNodesData: BlueprintNodeData[] = [];
  private createdEdgesData: ConnectionData[] = [];

  constructor(scene: BlueprintScene, clipboardNodes: BlueprintNodeData[], clipboardEdges: ConnectionData[], offsetX: number = 50, offsetY: number = 50) {
    super('paste');
    this.scene = scene;
    this.nodeDatas = clipboardNodes.map(n => ({ ...n }));
    this.edgeDatas = clipboardEdges.map(e => ({ ...e }));
    this.offsetX = offsetX;
    this.offsetY = offsetY;
  }

  execute(): void {
    if (this.createdNodesData.length > 0) {
      this.redo();
      return;
    }

    const idMap = new Map<string, string>();

    for (const srcData of this.nodeDatas) {
      const newId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      idMap.set(srcData.id, newId);

      const newData: BlueprintNodeData = {
        ...srcData,
        id: newId,
        worldX: srcData.worldX + this.offsetX,
        worldY: srcData.worldY + this.offsetY,
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
