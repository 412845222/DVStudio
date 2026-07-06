export const normalizeTripo3DTaskStatus = (raw: unknown) => {
	const status = String(raw ?? '')
		.trim()
		.toLowerCase()
	if (status === 'pending' || status === 'queued') return 'queued' as const
	if (status === 'running' || status === 'processing' || status === 'in_progress')
		return 'running' as const
	if (status === 'succeeded' || status === 'success' || status === 'completed')
		return 'succeeded' as const
	if (status === 'failed' || status === 'error') return 'failed' as const
	if (status === 'cancelled' || status === 'canceled') return 'cancelled' as const
	return 'idle' as const
}

export const fileExtensionFromUrl = (url: string, fallback = '.bin') => {
	const safeFallback = fallback.startsWith('.') ? fallback : `.${fallback}`
	try {
		const pathname = new URL(url).pathname
		const name = pathname.split('/').pop() || ''
		const idx = name.lastIndexOf('.')
		if (idx > 0 && idx < name.length - 1) return `.${name.slice(idx + 1)}`
	} catch {
		const clean = String(url).split('?')[0].split('#')[0]
		const idx = clean.lastIndexOf('.')
		if (idx >= 0 && idx < clean.length - 1) return clean.slice(idx)
	}
	return safeFallback
}
