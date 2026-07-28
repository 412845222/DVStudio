import { Command } from '../../graphbase/commands/Command'
import type { BlueprintScene } from '../BlueprintScene'

interface NodeChatData {
	draft?: string | null
	params?: Record<string, any> | null
	selectedRefs?: any[] | null
}

export class UpdateNodeChatDataCommand extends Command {
	private scene: BlueprintScene
	private nodeId: string
	private oldData: NodeChatData & {
		textValue?: string | null
		prompt?: string | null
		blenderSettings?: Record<string, any> | null
	}
	private newData: NodeChatData & {
		textValue?: string | null
		prompt?: string | null
		blenderSettings?: Record<string, any> | null
	}

	constructor(
		scene: BlueprintScene,
		nodeId: string,
		oldData: NodeChatData,
		newData: NodeChatData
	) {
		super('update-node-chat-data', `chat-data:${nodeId}`)
		this.mergeable = true
		this.scene = scene
		this.nodeId = nodeId
		this.oldData = { ...oldData }
		this.newData = { ...newData }
	}

	execute(): void {
		this.applyData(this.newData)
	}

	undo(): void {
		this.applyData(this.oldData)
	}

	redo(): void {
		this.applyData(this.newData)
	}

	canMergeWith(other: Command): boolean {
		if (!(other instanceof UpdateNodeChatDataCommand)) return false
		return other.nodeId === this.nodeId
	}

	mergeWith(other: Command): Command {
		if (other instanceof UpdateNodeChatDataCommand && other.nodeId === this.nodeId) {
			this.newData = { ...other.newData }
			this.applyData(this.newData)
		}
		return this
	}

	private applyData(data: NodeChatData & {
		textValue?: string | null
		prompt?: string | null
		blenderSettings?: Record<string, any> | null
	}): void {
		const node = this.scene.getBlueprintNode(this.nodeId)
		if (!node) return

		if (data.draft !== undefined) {
			node.data.nodeChatDraft = data.draft ?? undefined
			if (node.nodeType === 'text' || !node.nodeType) {
				node.data.textValue = data.draft ?? undefined
			}
			node.data.prompt = data.draft ?? undefined
		}
		if (data.params !== undefined) {
			node.data.nodeChatParams = data.params
			if (node.nodeType === 'blender' && data.params?.blender) {
				const blenderParams = data.params.blender as Record<string, unknown>
				node.data.blenderSettings = node.data.blenderSettings ?? {}
				const fields = [
					'agentBackend',
					'agentSessionId',
					'model',
					'modelId',
					'geminiTextModelVersion',
					'textModelVersion',
					'thinkingEffort'
				] as const
				for (const field of fields) {
					const val = blenderParams[field]
					if (typeof val === 'string') {
						(node.data.blenderSettings as Record<string, unknown>)[field] = val
					}
				}
			}
		}
		if (data.selectedRefs !== undefined) {
			node.data.nodeChatSelectedRefs = data.selectedRefs
		}
		if (data.textValue !== undefined) {
			node.data.textValue = data.textValue ?? undefined
		}
		if (data.prompt !== undefined) {
			node.data.prompt = data.prompt ?? undefined
		}
		if (data.blenderSettings !== undefined) {
			node.data.blenderSettings = data.blenderSettings
		}
		this.scene.requestRedraw()
	}
}
