let seq = 0

export const genStableId = (prefix: string): string => {
	seq = (seq + 1) % 1_000_000
	return `${prefix}-${Date.now()}-${seq}`
}
