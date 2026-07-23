export interface Disposable {
  dispose(): void;
}

export function isDisposable(obj: unknown): obj is Disposable {
  return typeof obj === 'object' && obj !== null && typeof (obj as Disposable).dispose === 'function';
}

export class DisposableGroup implements Disposable {
  private disposables: Disposable[] = [];

  add(disposable: Disposable): void {
    this.disposables.push(disposable);
  }

  dispose(): void {
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch (e) {
        console.error('Error disposing:', e);
      }
    }
    this.disposables = [];
  }
}
