import { Rect } from '../core/Rect'

export class DirtyRegionManager {
	private dirtyRects: Rect[] = []
	private fullDirty: boolean = true

	markDirty(rect: Rect): void {
		if (this.fullDirty) return
		this.dirtyRects.push(rect.clone())
		if (this.dirtyRects.length > 100) {
			this.markAllDirty()
		}
	}

	markAllDirty(): void {
		this.fullDirty = true
		this.dirtyRects = []
	}

	getDirtyRegions(): Rect[] {
		if (this.fullDirty) return []
		return this.mergeRects(this.dirtyRects)
	}

	isFullyDirty(): boolean {
		return this.fullDirty
	}

	clear(): void {
		this.dirtyRects = []
		this.fullDirty = false
	}

	private mergeRects(rects: Rect[]): Rect[] {
		if (rects.length <= 1) return rects
		const merged = [...rects]
		let changed = true
		while (changed) {
			changed = false
			for (let i = 0; i < merged.length && !changed; i++) {
				for (let j = i + 1; j < merged.length && !changed; j++) {
					if (merged[i].intersects(merged[j]) || this.areClose(merged[i], merged[j])) {
						merged[i] = merged[i].union(merged[j])
						merged.splice(j, 1)
						changed = true
					}
				}
			}
		}
		return merged
	}

	private areClose(a: Rect, b: Rect, tolerance: number = 5): boolean {
		const expanded = a.inflate(tolerance, tolerance)
		return expanded.intersects(b)
	}
}
