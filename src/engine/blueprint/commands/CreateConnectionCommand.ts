import { Command } from '../../graphbase/commands/Command'
import type { BlueprintScene } from '../BlueprintScene'
import type { ConnectionData } from '../types'

export class CreateConnectionCommand extends Command {
	private scene: BlueprintScene
	private data: ConnectionData
	private createdConnectionId: string | null = null
	private wasExisting: boolean = false

	constructor(scene: BlueprintScene, data: ConnectionData) {
		super('create-connection')
		this.scene = scene
		this.data = { ...data }
	}

	private findExistingConnectionId(): string | null {
		for (const conn of this.scene.getAllConnections()) {
			if (
				conn.data.fromNodeId === this.data.fromNodeId &&
				conn.data.fromAnchorId === this.data.fromAnchorId &&
				conn.data.toNodeId === this.data.toNodeId &&
				conn.data.toAnchorId === this.data.toAnchorId
			) {
				return conn.id
			}
		}
		return null
	}

	execute(): void {
		const existing = this.findExistingConnectionId()
		if (existing) {
			this.wasExisting = true
			this.createdConnectionId = existing
			return
		}
		const conn = this.scene.addConnection(this.data)
		this.createdConnectionId = conn ? conn.id : null
		this.wasExisting = false
	}

	undo(): void {
		if (this.createdConnectionId && !this.wasExisting) {
			this.scene.removeConnection(this.createdConnectionId)
		}
		this.createdConnectionId = null
	}
}
