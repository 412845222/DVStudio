import { Command } from '../../graphbase/commands/Command';
import type { BlueprintScene } from '../BlueprintScene';
import type { BlueprintNodeData, ConnectionData } from '../types';

export class DeleteSelectionCommand extends Command {
  private scene: BlueprintScene;
  private deletedNodes: BlueprintNodeData[] = [];
  private deletedConnections: ConnectionData[] = [];
  private deletedNodeIds: string[] = [];

  constructor(scene: BlueprintScene, nodeIds: string[], connectionIds: string[]) {
    super('delete-selection');
    this.scene = scene;

    const nodeIdSet = new Set(nodeIds);

    for (const id of connectionIds) {
      const conn = scene.getConnection(id);
      if (conn) {
        this.deletedConnections.push({ ...conn.data });
      }
    }

    for (const id of nodeIds) {
      const node = scene.getBlueprintNode(id);
      if (node) {
        this.deletedNodes.push({ ...node.data });
        this.deletedNodeIds.push(id);
        for (const conn of scene.getAllConnections()) {
          if ((conn.data.fromNodeId === id || conn.data.toNodeId === id) && !this.deletedConnections.some(dc => dc.id === conn.id)) {
            this.deletedConnections.push({ ...conn.data });
          }
        }
      }
    }
  }

  execute(): void {
    for (const id of this.deletedNodeIds) {
      this.scene.removeBlueprintNode(id);
    }
    const nodeIdSet = new Set(this.deletedNodeIds);
    for (const connData of this.deletedConnections) {
      if (!nodeIdSet.has(connData.fromNodeId) && !nodeIdSet.has(connData.toNodeId)) {
        this.scene.removeConnection(connData.id);
      }
    }
  }

  undo(): void {
    for (const nodeData of this.deletedNodes) {
      this.scene.addBlueprintNode({ ...nodeData });
    }
    for (const connData of this.deletedConnections) {
      this.scene.addConnection({ ...connData });
    }
    this.scene.updateAllConnectionEndpoints();
    this.scene.requestRedraw();
  }
}
