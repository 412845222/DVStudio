let _nextId = 1

export function generateId(prefix = 'node'): string {
	return `${prefix}_${_nextId++}`
}

export function resetIdCounter(): void {
	_nextId = 1
}
