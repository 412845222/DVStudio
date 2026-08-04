import { Command } from '../../graphbase/commands/Command'
import type { BlueprintScene } from '../BlueprintScene'

export class SetNodeChatVisibleCommand extends Command {
	private scene: BlueprintScene
	private nodeId: string
	private oldVisible: boolean
	private newVisible: boolean

	constructor(scene: BlueprintScene, nodeId: string, oldVisible: boolean, newVisible: boolean) {
		super('set-node-chat-visible', `chat-visible:${nodeId}`)
		this.mergeable = false
		this.scene = scene
		this.nodeId = nodeId
		this.oldVisible = oldVisible
		this.newVisible = newVisible
	}

	execute(): void {
		this.applyVisible(this.newVisible)
	}

	undo(): void {
		this.applyVisible(this.oldVisible)
	}

	redo(): void {
		this.applyVisible(this.newVisible)
	}

	private applyVisible(visible: boolean): void {
		const node = this.scene.getBlueprintNode(this.nodeId)
		if (!node) return
		node.data.nodeChatVisible = visible
		this.scene.requestRedraw()
	}
}
