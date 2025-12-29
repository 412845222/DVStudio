const deepCloneFallback = <T>(value: T, seen = new WeakMap<object, any>()): T => {
	// Handles plain objects/arrays (including Proxies) and breaks reference sharing.
	if (value == null) return value
	if (typeof value !== 'object') return value

	if (value instanceof Date) return new Date(value.getTime()) as any

	const obj = value as unknown as object
	const cached = seen.get(obj)
	if (cached) return cached

	if (Array.isArray(value)) {
		const out: any[] = []
		seen.set(obj, out)
		for (const item of value as any[]) out.push(deepCloneFallback(item, seen))
		return out as any
	}

	const proto = Object.getPrototypeOf(obj)
	const out: any = proto === null ? Object.create(null) : {}
	seen.set(obj, out)
	for (const k of Object.keys(obj as any)) {
		out[k] = deepCloneFallback((obj as any)[k], seen)
	}
	return out
}

export const cloneJsonSafe = <T>(v: T): T => {
	// Vuex state is reactive (Proxy). structuredClone may throw.
	// We must never return the original reference; snapshots must be frozen.
	try {
		return JSON.parse(JSON.stringify(v)) as T
	} catch {
		try {
			return (globalThis as any).structuredClone ? ((globalThis as any).structuredClone(v) as T) : deepCloneFallback(v)
		} catch {
			return deepCloneFallback(v)
		}
	}
}
