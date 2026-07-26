import { Command } from './Command';
import { Vector2 } from '../core/Vector2';

export class CompositeCommand extends Command {
  private commands: Command[] = [];

  constructor(commands: Command[] = []) {
    super('composite');
    this.commands = commands;
  }

  add(command: Command): void {
    this.commands.push(command);
  }

  execute(): void {
    for (const cmd of this.commands) {
      cmd.execute();
    }
  }

  undo(): void {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }

  redo(): void {
    for (const cmd of this.commands) {
      cmd.redo();
    }
  }
}

export abstract class AddNodeCommand extends Command {
  constructor(type: string) {
    super(type);
  }
}

export abstract class RemoveNodeCommand extends Command {
  constructor(type: string) {
    super(type);
  }
}

export class MoveNodeCommand extends Command {
  private startPositions: Map<string, Vector2>;
  private endPositions: Map<string, Vector2>;
  private moveFn: (id: string, pos: Vector2) => void;

  constructor(
    startPositions: Map<string, Vector2>,
    endPositions: Map<string, Vector2>,
    moveFn: (id: string, pos: Vector2) => void
  ) {
    super('move-node');
    this.mergeable = false;
    this.startPositions = new Map(startPositions);
    this.endPositions = new Map(endPositions);
    this.moveFn = moveFn;
  }

  execute(): void {
    for (const [id, pos] of this.endPositions) {
      this.moveFn(id, pos);
    }
  }

  undo(): void {
    for (const [id, pos] of this.startPositions) {
      this.moveFn(id, pos);
    }
  }

  canMergeWith(other: Command): boolean {
    return other instanceof MoveNodeCommand;
  }

  mergeWith(other: Command): Command {
    if (other instanceof MoveNodeCommand) {
      for (const [id, pos] of other.endPositions) {
        this.endPositions.set(id, pos);
      }
    }
    return this;
  }
}
