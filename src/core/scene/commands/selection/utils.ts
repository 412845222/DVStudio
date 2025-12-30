export const toCleanIdList = (ids: unknown): string[] => {
	if (!Array.isArray(ids)) return []
	const out: string[] = []
	const seen = new Set<string>()
	for (const raw of ids) {
		const id = String(raw || '').trim()
		if (!id) continue
		if (seen.has(id)) continue
		seen.add(id)
		out.push(id)
	}
	return out
}
