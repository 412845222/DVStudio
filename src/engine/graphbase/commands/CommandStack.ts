import { EventEmitter } from '../core/EventEmitter';
import { Command } from './Command';

export class CommandStack {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxSize: number;
  readonly on: EventEmitter = new EventEmitter();
  private mergeTimeout: number | null = null;
  private lastMergeKey: string | null = null;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  execute(command: Command): void {
    if (this.mergeTimeout !== null) {
      clearTimeout(this.mergeTimeout);
      this.mergeTimeout = null;
    }

    if (command.mergeable && command.mergeKey && command.mergeKey === this.lastMergeKey && this.undoStack.length > 0) {
      const last = this.undoStack[this.undoStack.length - 1];
      if (last.canMergeWith(command)) {
        last.mergeWith(command);
        this.redoStack = [];
        this.on.emit('change', { type: 'merge', command: last });
        return;
      }
    }

    command.execute();
    this.undoStack.push(command);
    this.redoStack = [];

    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }

    if (command.mergeable && command.mergeKey) {
      this.lastMergeKey = command.mergeKey;
      this.mergeTimeout = window.setTimeout(() => {
        this.lastMergeKey = null;
        this.mergeTimeout = null;
      }, 500);
    } else {
      this.lastMergeKey = null;
    }

    this.on.emit('execute', { command });
    this.on.emit('change', { type: 'execute', command });
  }

  undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) return false;

    command.undo();
    this.redoStack.push(command);
    this.lastMergeKey = null;
    this.on.emit('undo', { command });
    this.on.emit('change', { type: 'undo', command });
    return true;
  }

  redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) return false;

    command.redo();
    this.undoStack.push(command);
    this.lastMergeKey = null;
    this.on.emit('redo', { command });
    this.on.emit('change', { type: 'redo', command });
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  getUndoCount(): number {
    return this.undoStack.length;
  }

  getRedoCount(): number {
    return this.redoStack.length;
  }

  peekUndo(): Command | null {
    return this.undoStack[this.undoStack.length - 1] ?? null;
  }

  peekRedo(): Command | null {
    return this.redoStack[this.redoStack.length - 1] ?? null;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.lastMergeKey = null;
    if (this.mergeTimeout !== null) {
      clearTimeout(this.mergeTimeout);
      this.mergeTimeout = null;
    }
    this.on.emit('change', { type: 'clear' });
  }
}
