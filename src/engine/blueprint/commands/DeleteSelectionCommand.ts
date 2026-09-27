import { Command } from '../../graphbase/commands/Command'
import type { BlueprintScene } from '../BlueprintScene'
import type { BlueprintNodeData, ConnectionData } from '../types'
import type { FrameAutomationData } from '../frame-automation/FrameAutomationTypes'

function deepClone<T>(obj: T): T {
	if (obj === null || typeof obj !== 'object') return obj
	if (Array.isArray(obj)) return obj.map((item) => deepClone(item)) as unknown as T
	const cloned: Record<string, any> = {}
	for (const key of Object.keys(obj as Record<string, any>)) {
		cloned[key] = deepClone((obj as Record<string, any>)[key])
	}
	return cloned as T
}

export class DeleteSelectionCommand extends Command {
	private scene: BlueprintScene
	private deletedNodes: BlueprintNodeData[] = []
	private deletedConnections: ConnectionData[] = []
	private deletedNodeIds: string[] = []
	/** 受影响绿框的自动化配置快照（删除成员时剔除绑定，undo 时整份恢复） */
	private automationSnapshots: Map<string, FrameAutomationData | undefined> = new Map()

	constructor(scene: BlueprintScene, nodeIds: string[], connectionIds: string[]) {
		super('delete-selection')
		this.scene = scene

		const nodeIdSet = new Set(nodeIds)
		const collectedConnIds = new Set<string>()

		for (const id of connectionIds) {
			const conn = scene.getConnection(id)
			if (conn && !collectedConnIds.has(id)) {
				this.deletedConnections.push(deepClone(conn.data))
				collectedConnIds.add(id)
			}
		}

		for (const id of nodeIds) {
			const node = scene.getBlueprintNode(id)
			if (node) {
				this.deletedNodes.push(deepClone(node.data))
				this.deletedNodeIds.push(id)

				for (const conn of scene.getAllConnections()) {
					if (
						(conn.data.fromNodeId === id || conn.data.toNodeId === id) &&
						!collectedConnIds.has(conn.id)
					) {
						this.deletedConnections.push(deepClone(conn.data))
						collectedConnIds.add(conn.id)
					}
				}
			}
		}

		// 快照包含待删成员的绿框自动化配置
		const deletedSet = new Set(this.deletedNodeIds)
		for (const frame of scene.getSavedSelectionFrames()) {
			if (frame.nodeIds.some((id) => deletedSet.has(id))) {
				this.automationSnapshots.set(frame.id, deepClone(frame.automation))
			}
		}
	}

	execute(): void {
		for (const connData of this.deletedConnections) {
			this.scene.removeConnection(connData.id)
		}

		for (const id of this.deletedNodeIds) {
			this.scene.pruneFrameAutomationForNode(id)
			this.scene.removeBlueprintNode(id)
		}

		this.scene.updateAllConnectionEndpoints()
		this.scene.requestRedraw()
	}

	undo(): void {
		for (const nodeData of this.deletedNodes) {
			const existing = this.scene.getBlueprintNode(nodeData.id)
			if (!existing) {
				this.scene.addBlueprintNode(deepClone(nodeData))
			}
		}

		for (const connData of this.deletedConnections) {
			const existing = this.scene.getConnection(connData.id)
			if (!existing) {
				const fromNode = this.scene.getBlueprintNode(connData.fromNodeId)
				const toNode = this.scene.getBlueprintNode(connData.toNodeId)
				if (fromNode && toNode) {
					this.scene.addConnection(deepClone(connData))
				}
			}
		}

		// 恢复被剔除的门户绑定（整份快照覆盖）
		this.scene.restoreFrameAutomationSnapshot(
			new Map(Array.from(this.automationSnapshots.entries()).map(([k, v]) => [k, deepClone(v)]))
		)

		this.scene.updateAllConnectionEndpoints()
		this.scene.requestRedraw()
	}
}
