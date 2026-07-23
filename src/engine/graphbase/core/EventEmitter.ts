export type EventHandler<T = unknown> = (data: T) => void;

interface EventHandlerEntry {
  handler: EventHandler;
  once: boolean;
}

export class EventEmitter {
  private handlers: Map<string, EventHandlerEntry[]> = new Map();

  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push({ handler: handler as EventHandler, once: false });
    return () => this.off(event, handler);
  }

  once<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push({ handler: handler as EventHandler, once: true });
    return () => this.off(event, handler);
  }

  off<T = unknown>(event: string, handler: EventHandler<T>): void {
    const entries = this.handlers.get(event);
    if (!entries) return;
    const idx = entries.findIndex(e => e.handler === handler);
    if (idx !== -1) entries.splice(idx, 1);
    if (entries.length === 0) this.handlers.delete(event);
  }

  emit<T = unknown>(event: string, data?: T): void {
    const entries = this.handlers.get(event);
    if (!entries) return;
    const toRemove: number[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      try {
        entry.handler(data as T);
      } catch (e) {
        console.error(`Error in event handler for "${event}":`, e);
      }
      if (entry.once) toRemove.push(i);
    }
    for (let i = toRemove.length - 1; i >= 0; i--) {
      entries.splice(toRemove[i], 1);
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.length ?? 0;
  }
}
