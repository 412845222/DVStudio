type CacheEntry = {
	bitmap: ImageBitmap
	lastAccess: number
}

export class VideoFrameCache {
	private cache = new Map<string, CacheEntry>()
	private maxEntries: number

	constructor(maxEntries = 16) {
		this.maxEntries = maxEntries
	}

	private key(videoId: string, frameIndex: number): string {
		return `${videoId}:${frameIndex}`
	}

	get(videoId: string, frameIndex: number): ImageBitmap | null {
		const k = this.key(videoId, frameIndex)
		const entry = this.cache.get(k)
		if (!entry) return null
		entry.lastAccess = performance.now()
		return entry.bitmap
	}

	set(videoId: string, frameIndex: number, bitmap: ImageBitmap): void {
		const k = this.key(videoId, frameIndex)
		const existing = this.cache.get(k)
		if (existing) {
			existing.bitmap.close()
		}
		this.cache.set(k, { bitmap, lastAccess: performance.now() })
		this.evictIfNeeded()
	}

	has(videoId: string, frameIndex: number): boolean {
		return this.cache.has(this.key(videoId, frameIndex))
	}

	invalidate(videoId: string): void {
		const prefix = `${videoId}:`
		for (const [k, entry] of this.cache) {
			if (k.startsWith(prefix)) {
				entry.bitmap.close()
				this.cache.delete(k)
			}
		}
	}

	clear(): void {
		for (const entry of this.cache.values()) {
			entry.bitmap.close()
		}
		this.cache.clear()
	}

	private evictIfNeeded(): void {
		while (this.cache.size > this.maxEntries) {
			let oldestKey: string | null = null
			let oldestTime = Infinity
			for (const [k, entry] of this.cache) {
				if (entry.lastAccess < oldestTime) {
					oldestTime = entry.lastAccess
					oldestKey = k
				}
			}
			if (oldestKey) {
				const entry = this.cache.get(oldestKey)!
				entry.bitmap.close()
				this.cache.delete(oldestKey)
			} else {
				break
			}
		}
	}

	get size(): number {
		return this.cache.size
	}
}
