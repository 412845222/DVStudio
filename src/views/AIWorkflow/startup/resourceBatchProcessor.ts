export interface BatchProcessorOptions<T> {
	items: T[]
	batchSize?: number
	processItem: (item: T, index: number) => Promise<void>
	onProgress?: (current: number, total: number, item: T) => void
	onBatchComplete?: (batchIndex: number, batchCount: number) => Promise<void>
}

const DEFAULT_BATCH_SIZE = 8

const yieldToMain = (): Promise<void> => {
	return new Promise((resolve) => {
		requestAnimationFrame(() => resolve())
	})
}

export async function processInBatches<T>(options: BatchProcessorOptions<T>): Promise<void> {
	const { items, batchSize = DEFAULT_BATCH_SIZE, processItem, onProgress, onBatchComplete } = options
	const total = items.length
	if (total === 0) return

	const batchCount = Math.ceil(total / batchSize)

	for (let batchIdx = 0; batchIdx < batchCount; batchIdx++) {
		const start = batchIdx * batchSize
		const end = Math.min(start + batchSize, total)
		const batch = items.slice(start, end)

		for (let i = 0; i < batch.length; i++) {
			const itemIdx = start + i
			await processItem(batch[i], itemIdx)
			onProgress?.(itemIdx + 1, total, batch[i])
		}

		if (onBatchComplete && batchIdx < batchCount - 1) {
			await onBatchComplete(batchIdx, batchCount)
		} else if (batchIdx < batchCount - 1) {
			await yieldToMain()
		}
	}
}
