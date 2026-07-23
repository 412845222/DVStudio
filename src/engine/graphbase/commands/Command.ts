export abstract class Command {
  readonly id: string;
  readonly type: string;
  readonly timestamp: number;

  mergeable: boolean = false;
  readonly mergeKey?: string;

  constructor(type: string, mergeKey?: string) {
    this.id = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.type = type;
    this.timestamp = Date.now();
    this.mergeKey = mergeKey;
  }

  abstract execute(): void;
  abstract undo(): void;

  redo(): void {
    this.execute();
  }

  canMergeWith(_other: Command): boolean {
    return false;
  }

  mergeWith(_other: Command): Command {
    return this;
  }
}
