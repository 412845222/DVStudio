import { Command } from '../../graphbase/commands/Command'
import type { BlueprintScene } from '../BlueprintScene'
import type { SavedSelectionFrame } from '../SelectionFrame'

export class SaveSelectionFrameCommand extends Command {
	private scene: BlueprintScene
	private nodeIds: string[]
	private label: string
	private frameId: string

	constructor(scene: BlueprintScene, nodeIds: string[], label: string, frameId?: string) {
		super('save-selection-frame')
		this.scene = scene
		this.nodeIds = [...nodeIds].sort()
		this.label = label
		this.frameId = frameId ?? `frame_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
	}

	execute(): void {
		this.scene.addSelectionFrameInternal(this.nodeIds, this.label, this.frameId)
		this.scene.requestRedraw()
	}

	undo(): void {
		this.scene.removeSelectionFrameInternal(this.frameId)
		this.scene.requestRedraw()
	}
}

export class DeleteSelectionFrameCommand extends Command {
	private scene: BlueprintScene
	private frameId: string
	private deletedFrame: SavedSelectionFrame | null = null

	constructor(scene: BlueprintScene, frameId: string) {
		super('delete-selection-frame')
		this.scene = scene
		this.frameId = frameId
	}

	execute(): void {
		this.deletedFrame = this.scene.getSavedSelectionFrame(this.frameId)
		if (this.deletedFrame) {
			this.deletedFrame = {
				id: this.deletedFrame.id,
				nodeIds: [...this.deletedFrame.nodeIds],
				label: this.deletedFrame.label
			}
			this.scene.removeSelectionFrameInternal(this.frameId)
			this.scene.requestRedraw()
		}
	}

	undo(): void {
		if (this.deletedFrame) {
			this.scene.addSelectionFrameInternal(
				this.deletedFrame.nodeIds,
				this.deletedFrame.label,
				this.deletedFrame.id
			)
			this.deletedFrame = null
			this.scene.requestRedraw()
		}
	}
}

export class RenameSelectionFrameCommand extends Command {
	private scene: BlueprintScene
	private frameId: string
	private newLabel: string
	private oldLabel: string | null = null

	constructor(scene: BlueprintScene, frameId: string, newLabel: string) {
		super('rename-selection-frame')
		this.scene = scene
		this.frameId = frameId
		this.newLabel = newLabel
	}

	execute(): void {
		const frame = this.scene.getSavedSelectionFrame(this.frameId)
		if (frame) {
			this.oldLabel = frame.label
			this.scene.renameSelectionFrameInternal(this.frameId, this.newLabel)
			this.scene.requestRedraw()
		}
	}

	undo(): void {
		if (this.oldLabel !== null) {
			this.scene.renameSelectionFrameInternal(this.frameId, this.oldLabel)
			this.oldLabel = null
			this.scene.requestRedraw()
		}
	}
}
