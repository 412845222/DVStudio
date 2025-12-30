export const clamp01 = (v: unknown, fallback: number) => {
	const n = Number(v)
	if (!Number.isFinite(n)) return fallback
	return Math.max(0, Math.min(1, n))
}

export const clampPx = (v: unknown, fallback: number) => {
	const n = Math.floor(Number(v))
	if (!Number.isFinite(n)) return fallback
	return Math.max(1, n)
}

export const toNumber = (v: unknown, fallback: number) => {
	const n = Number(v)
	if (!Number.isFinite(n)) return fallback
	return n
}
