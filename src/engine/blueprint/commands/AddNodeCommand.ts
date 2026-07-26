import { Command } from '../../graphbase/commands/Command';
import type { BlueprintScene } from '../BlueprintScene';
import type { BlueprintNodeData } from '../types';

export class AddNodeCommand extends Command {
  private scene: BlueprintScene;
  private data: BlueprintNodeData;
  private addedNodeId: string | null = null;

  constructor(scene: BlueprintScene, data: BlueprintNodeData) {
    super('add-node');
    this.scene = scene;
    this.data = { ...data };
  }

  execute(): void {
    const node = this.scene.addBlueprintNode(this.data);
    this.addedNodeId = node.id;
  }

  undo(): void {
    if (this.addedNodeId) {
      this.scene.removeBlueprintNode(this.addedNodeId);
      this.addedNodeId = null;
    }
  }
}
