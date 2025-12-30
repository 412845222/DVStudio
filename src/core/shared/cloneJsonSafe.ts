const deepCloneFallback = (value: unknown, seen: WeakMap<object, unknown>): unknown => {
	// Handles plain objects/arrays (including Proxies) and breaks reference sharing.
	if (value == null) return value
	if (typeof value !== 'object') return value

	if (value instanceof Date) return new Date(value.getTime())

	const obj = value as object
	const cached = seen.get(obj)
	if (cached) return cached

	if (Array.isArray(value)) {
		const out: unknown[] = []
		seen.set(obj, out)
		for (const item of value) out.push(deepCloneFallback(item, seen))
		return out
	}

	const proto = Object.getPrototypeOf(obj)
	const out: Record<string, unknown> = proto === null ? Object.create(null) : {}
	seen.set(obj, out)
	for (const k of Object.keys(obj)) {
		out[k] = deepCloneFallback((obj as Record<string, unknown>)[k], seen)
	}
	return out
}

export const cloneJsonSafe = <T>(v: T): T => {
	// Vuex state is reactive (Proxy). structuredClone may throw.
	// Must never return original reference; snapshots must be immutable-by-convention.
	try {
		return JSON.parse(JSON.stringify(v)) as T
	} catch {
		try {
			const sc = (globalThis as { structuredClone?: (value: unknown) => unknown }).structuredClone
			if (typeof sc === 'function') return sc(v) as T
			return deepCloneFallback(v, new WeakMap<object, unknown>()) as T
		} catch {
			return deepCloneFallback(v, new WeakMap<object, unknown>()) as T
		}
	}
}
