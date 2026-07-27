import { Command } from '../../graphbase/commands/Command'
import type { BlueprintScene } from '../BlueprintScene'

export class UpdateNodeTextCommand extends Command {
	private scene: BlueprintScene
	private nodeId: string
	private oldText: string
	private newText: string

	constructor(scene: BlueprintScene, nodeId: string, oldText: string, newText: string) {
		super('update-text', `text:${nodeId}`)
		this.mergeable = true
		this.scene = scene
		this.nodeId = nodeId
		this.oldText = oldText
		this.newText = newText
	}

	execute(): void {
		this.applyText(this.newText)
	}

	undo(): void {
		this.applyText(this.oldText)
	}

	redo(): void {
		this.applyText(this.newText)
	}

	canMergeWith(other: Command): boolean {
		if (!(other instanceof UpdateNodeTextCommand)) return false
		return other.nodeId === this.nodeId
	}

	mergeWith(other: Command): Command {
		if (other instanceof UpdateNodeTextCommand && other.nodeId === this.nodeId) {
			this.newText = other.newText
			this.applyText(this.newText)
		}
		return this
	}

	private applyText(text: string): void {
		const node = this.scene.getBlueprintNode(this.nodeId)
		if (!node) return
		node.setData({ textValue: text })
	}
}
