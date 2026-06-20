export function parseOptionalJson(raw) {
	if (raw === null || raw === undefined) return null
	const text = String(raw).trim()
	if (!text) return null
	try {
		return JSON.parse(text)
	} catch (_) {
		return null
	}
}

export function stringifyOptionalJson(value) {
	if (value === null || value === undefined) return null
	return JSON.stringify(value)
}

export function msToIso(ms) {
	if (!ms) return null
	const v = Number(ms)
	if (!Number.isFinite(v)) return null
	return new Date(v).toISOString()
}

export function isoToMs(iso) {
	if (!iso) return null
	const t = new Date(String(iso)).getTime()
	return Number.isFinite(t) ? t : null
}
