import { Command } from '../../graphbase/commands/Command';
import type { BlueprintScene } from '../BlueprintScene';
import type { BlueprintNode } from '../BlueprintNode';

export class ResizeNodeCommand extends Command {
  private scene: BlueprintScene;
  private nodeId: string;
  private startX: number;
  private startY: number;
  private startWidth: number;
  private startHeight: number;
  private endX: number;
  private endY: number;
  private endWidth: number;
  private endHeight: number;

  constructor(
    scene: BlueprintScene,
    node: BlueprintNode,
    startX: number,
    startY: number,
    startWidth: number,
    startHeight: number,
    endX: number,
    endY: number,
    endWidth: number,
    endHeight: number
  ) {
    super('resize-node');
    this.mergeable = false;
    this.scene = scene;
    this.nodeId = node.id;
    this.startX = startX;
    this.startY = startY;
    this.startWidth = startWidth;
    this.startHeight = startHeight;
    this.endX = endX;
    this.endY = endY;
    this.endWidth = endWidth;
    this.endHeight = endHeight;
  }

  private apply(x: number, y: number, w: number, h: number): void {
    const node = this.scene.getBlueprintNode(this.nodeId);
    if (!node) return;
    node.setPosition(x, y);
    node.updateSize(w, h);
    node.data.sizeCustomized = true;
    this.scene.updateAllConnectionEndpoints();
    this.scene.requestRedraw();
  }

  execute(): void {
    this.apply(this.endX, this.endY, this.endWidth, this.endHeight);
  }

  undo(): void {
    this.apply(this.startX, this.startY, this.startWidth, this.startHeight);
  }

  canMergeWith(other: Command): boolean {
    return other instanceof ResizeNodeCommand && other.nodeId === this.nodeId;
  }

  mergeWith(other: Command): Command {
    if (other instanceof ResizeNodeCommand) {
      this.endX = other.endX;
      this.endY = other.endY;
      this.endWidth = other.endWidth;
      this.endHeight = other.endHeight;
    }
    return this;
  }
}
