export type EventHandler<T> = (payload: T) => void

export class TypedEventBus<Events extends Record<string, unknown>> {
	private listeners = new Map<keyof Events, Set<EventHandler<unknown>>>()

	on<K extends keyof Events>(eventName: K, handler: EventHandler<Events[K]>): () => void {
		let set = this.listeners.get(eventName)
		if (!set) {
			set = new Set()
			this.listeners.set(eventName, set)
		}
		set.add(handler as EventHandler<unknown>)
		return () => this.off(eventName, handler)
	}

	off<K extends keyof Events>(eventName: K, handler: EventHandler<Events[K]>): void {
		this.listeners.get(eventName)?.delete(handler as EventHandler<unknown>)
	}

	emit<K extends keyof Events>(eventName: K, payload: Events[K]): void {
		const set = this.listeners.get(eventName)
		if (!set || set.size === 0) return
		for (const handler of Array.from(set)) {
			;(handler as EventHandler<Events[K]>)(payload)
		}
	}
}
