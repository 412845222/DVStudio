import { EventEmitter } from 'node:events'

export class PlatformEventBus extends EventEmitter {
	constructor() {
		super()
		this.setMaxListeners(50)
	}
}

export const platformEvents = new PlatformEventBus()
