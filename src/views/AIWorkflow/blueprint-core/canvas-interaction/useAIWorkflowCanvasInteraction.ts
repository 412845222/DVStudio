import type { Ref } from 'vue'
import { hitTestNodesInWorldRect } from '../../../../aiworkflow/domain/selection/hitTestNodesInWorldRect'

export type ScreenToWorldFn = (point: { x: number; y: number }) => { x: number; y: number }

const FOCUS_ANIMATION_DURATION = 300

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)

type EngineApi = {
	moveNodesByDelta: (nodeIds: string[], dx: number, dy: number) => void
	setNodePosition: (nodeId: string, worldX: number, worldY: number) => void
	setNodeSize: (nodeId: string, width?: number, height?: number) => void
	deleteSelection: () => void
	setSelectedNode: (nodeId: string | null) => void
	setSelectedNodes: (nodeIds: string[], primaryNodeId?: string | null) => void
	clearSelection: () => void
	setEngineViewport: (zoom: number, panX: number, panY: number) => void
	focusNode: (nodeId: string) => boolean
	updateNodePositionDirect: (nodeId: string, worldX: number, worldY: number) => void
	updateNodesPositionDirect: (positions: Map<string, { x: number; y: number }>) => void
	commitNodeMovement: (
		startPositions: Map<string, { x: number; y: number }>,
		endPositions: Map<string, { x: number; y: number }>
	) => void
	getNode?: (nodeId: string) => { data: { worldX: number; worldY: number } } | null
}

type StoreLike = {
	state: {
		nodesById: Record<string, any>
		nodeOrder: string[]
		viewport: { zoom: number; panX: number; panY: number }
		selectedNodeId?: string | null
		nodeChatDialog?: { visible: boolean; nodeId?: string | null }
	}
	dispatch?: (action: string, payload?: any) => any
	commit?: (mutation: string, payload?: any) => any
}

export const useAIWorkflowCanvasInteraction = (payload: {
	store: StoreLike
	engineApi: EngineApi
	selectedNodeIds: Ref<string[]>
	inspectorOpen: Ref<boolean>
	chatModelKey: Ref<string>
	chatCollapsed: Ref<boolean>
	markViewportMotion: () => void
	forceEndViewportMotion?: () => void
	scheduleAsyncEdgeRender: () => void
	canvasViewportSize: Ref<{ width: number; height: number }>
	flushCanvasNodeLayer?: () => void
	onNodeDragStart?: (nodeIds: string[]) => void
	onNodeDragMove?: (nodeIds: string[]) => void
	onNodeDragEnd?: (nodeIds: string[]) => void
	onOpenNodeChat?: (nodeId: string) => void
	onCloseNodeChat?: () => void
	onSetInspectorOpen?: (open: boolean) => void
	onSetChatCollapsed?: (collapsed: boolean) => void
}) => {
	const { engineApi } = payload

	const onCanvasPointerDown = (event: PointerEvent) => {
		if (event.button !== 0) return
		const target = event.target as HTMLElement | null
		if (!target) return
		const inUi = target.closest(
			'.wf-node, .wf-resource-panel, .wf-inspector, .ctx-menu, .aiwf-toolbar, .aiwf-inspector-toggle, .wf-sel-frame-tag-bar'
		)
		if (inUi) return
		engineApi.clearSelection()
		if (payload.onSetInspectorOpen) {
			payload.onSetInspectorOpen(false)
		} else {
			payload.inspectorOpen.value = false
		}
		if (payload.chatModelKey.value !== 'nanobanana' && payload.chatModelKey.value !== 'seedance') {
			if (payload.onSetChatCollapsed) {
				payload.onSetChatCollapsed(true)
			} else {
				payload.chatCollapsed.value = true
			}
		}
	}

	const onNodeX = (nodeId: string, value: number) => {
		payload.markViewportMotion()
		const node = payload.store.state.nodesById[nodeId]
		if (!node) return
		const next = Number(value)
		if (!Number.isFinite(next)) return
		const dy = 0
		const dx = next - node.worldX
		if (
			payload.selectedNodeIds.value.length > 1 &&
			payload.selectedNodeIds.value.includes(nodeId)
		) {
			engineApi.moveNodesByDelta(payload.selectedNodeIds.value, dx, dy)
			payload.scheduleAsyncEdgeRender()
			return
		}
		engineApi.setNodePosition(nodeId, next, node.worldY)
		payload.scheduleAsyncEdgeRender()
	}

	const onNodeY = (nodeId: string, value: number) => {
		payload.markViewportMotion()
		const node = payload.store.state.nodesById[nodeId]
		if (!node) return
		const next = Number(value)
		if (!Number.isFinite(next)) return
		const dy = next - node.worldY
		if (
			payload.selectedNodeIds.value.length > 1 &&
			payload.selectedNodeIds.value.includes(nodeId)
		) {
			engineApi.moveNodesByDelta(payload.selectedNodeIds.value, 0, dy)
			payload.scheduleAsyncEdgeRender()
			return
		}
		engineApi.setNodePosition(nodeId, node.worldX, next)
		payload.scheduleAsyncEdgeRender()
	}

	const onNodeDragPosition = (nodeId: string, pos: { worldX: number; worldY: number }) => {
		payload.markViewportMotion()
		const node = payload.store.state.nodesById[nodeId]
		if (!node) return
		const nextX = Number(pos.worldX)
		const nextY = Number(pos.worldY)
		if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return
		const dx = nextX - node.worldX
		const dy = nextY - node.worldY
		if (
			payload.selectedNodeIds.value.length > 1 &&
			payload.selectedNodeIds.value.includes(nodeId)
		) {
			if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) {
				engineApi.moveNodesByDelta(payload.selectedNodeIds.value, dx, dy)
			}
			payload.scheduleAsyncEdgeRender()
			return
		}
		engineApi.setNodePosition(nodeId, nextX, nextY)
		payload.scheduleAsyncEdgeRender()
	}

	const onSelectNode = (nodeId: string) => {
		const selectedIds = payload.selectedNodeIds.value
		if (
			selectedIds.length === 1 &&
			selectedIds[0] === nodeId &&
			payload.store.state.selectedNodeId === nodeId
		) {
			const node = payload.store.state.nodesById[nodeId]
			if (node) {
				const nodeType = node.type
				if (
					nodeType === 'text' ||
					nodeType === 'image' ||
					nodeType === 'video' ||
					nodeType === 'model3d' ||
					nodeType === 'blender'
				) {
					if (payload.onOpenNodeChat) {
						payload.onOpenNodeChat(nodeId)
					} else if (payload.store.dispatch) {
						payload.store.dispatch('openNodeChatDialog', { nodeId })
					}
				}
			}
			return
		}
		if (selectedIds.length > 1 && selectedIds.includes(nodeId)) {
			engineApi.setSelectedNodes(selectedIds, nodeId)
			if (payload.onCloseNodeChat) {
				payload.onCloseNodeChat()
			} else if (payload.store.dispatch) {
				payload.store.dispatch('closeNodeChatDialog')
			}
			return
		}
		engineApi.setSelectedNode(nodeId)
		const node = payload.store.state.nodesById[nodeId]
		if (node) {
			const nodeType = node.type
			if (
				nodeType === 'text' ||
				nodeType === 'image' ||
				nodeType === 'video' ||
				nodeType === 'model3d' ||
				nodeType === 'blender'
			) {
				if (payload.onOpenNodeChat) {
					payload.onOpenNodeChat(nodeId)
				} else if (payload.store.dispatch) {
					payload.store.dispatch('openNodeChatDialog', { nodeId })
				}
			} else {
				if (payload.onCloseNodeChat) {
					payload.onCloseNodeChat()
				} else if (payload.store.dispatch) {
					payload.store.dispatch('closeNodeChatDialog')
				}
			}
		}
	}

	const onSelectEdge = (edgeId: string) => {
		// Edge selection is handled via engine selection in future
	}

	const onCompactNodePointerDown = (
		nodeId: string,
		event: PointerEvent,
		screenToWorld: ScreenToWorldFn
	) => {
		if (event.button !== 0) return
		const node = payload.store.state.nodesById[nodeId]
		if (!node) return

		event.preventDefault()
		event.stopPropagation()
		onSelectNode(nodeId)

		const target = event.currentTarget as HTMLElement | null
		if (target?.setPointerCapture && Number.isFinite(event.pointerId)) {
			try {
				target.setPointerCapture(event.pointerId)
			} catch {
				// ignore pointer capture failure
			}
		}

		const startClient = { x: event.clientX, y: event.clientY }
		const startWorldPositions = new Map<string, { x: number; y: number }>()
		const primaryStartWorld = (() => {
			const engineNode = engineApi.getNode?.(nodeId)
			return engineNode
				? { x: engineNode.data.worldX, y: engineNode.data.worldY }
				: { x: node.worldX, y: node.worldY }
		})()
		startWorldPositions.set(nodeId, primaryStartWorld)

		const moveGroup =
			payload.selectedNodeIds.value.length > 1 && payload.selectedNodeIds.value.includes(nodeId)
		let hasMoved = false
		let dragNodeIds: string[] = []
		let dragMoveRafId: number | null = null
		let latestDx = 0
		let latestDy = 0
		let pendingPositions: Map<string, { x: number; y: number }> | null = null

		const scheduleDragMove = () => {
			if (dragMoveRafId !== null) return
			dragMoveRafId = requestAnimationFrame(() => {
				dragMoveRafId = null
				if (hasMoved && pendingPositions && pendingPositions.size > 0) {
					engineApi.updateNodesPositionDirect(pendingPositions)
					payload.scheduleAsyncEdgeRender()
					payload.onNodeDragMove?.(dragNodeIds)
					payload.flushCanvasNodeLayer?.()
				}
			})
		}

		const initDragGroup = () => {
			dragNodeIds = moveGroup ? payload.selectedNodeIds.value.slice() : [nodeId]
			startWorldPositions.clear()
			for (const id of dragNodeIds) {
				const engineN = engineApi.getNode?.(id)
				const storeN = payload.store.state.nodesById[id]
				if (engineN) {
					startWorldPositions.set(id, { x: engineN.data.worldX, y: engineN.data.worldY })
				} else if (storeN) {
					startWorldPositions.set(id, { x: storeN.worldX, y: storeN.worldY })
				}
			}
		}

		const onMove = (moveEvent: PointerEvent) => {
			moveEvent.preventDefault()
			const fromWorld = screenToWorld(startClient)
			const toWorld = screenToWorld({ x: moveEvent.clientX, y: moveEvent.clientY })
			const dx = toWorld.x - fromWorld.x
			const dy = toWorld.y - fromWorld.y
			payload.markViewportMotion()

			if (!hasMoved && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
				hasMoved = true
				initDragGroup()
				payload.onNodeDragStart?.(dragNodeIds)
			}

			if (hasMoved) {
				latestDx = dx
				latestDy = dy
				pendingPositions = new Map()
				for (const [id, startPos] of startWorldPositions) {
					pendingPositions.set(id, { x: startPos.x + dx, y: startPos.y + dy })
				}
				scheduleDragMove()
			}
		}

		const flushPendingDragUpdate = () => {
			if (dragMoveRafId !== null) {
				cancelAnimationFrame(dragMoveRafId)
				dragMoveRafId = null
			}
		}

		const cleanup = () => {
			if (dragMoveRafId !== null) {
				cancelAnimationFrame(dragMoveRafId)
				dragMoveRafId = null
			}
			flushPendingDragUpdate()
			window.removeEventListener('pointermove', onMove, true)
			window.removeEventListener('pointerup', onUp, true)
			window.removeEventListener('pointercancel', onUp, true)
			if (target?.releasePointerCapture && Number.isFinite(event.pointerId)) {
				try {
					target.releasePointerCapture(event.pointerId)
				} catch {
					// ignore release failure
				}
			}
		}

		const onUp = () => {
			cleanup()
			if (hasMoved && dragNodeIds.length > 0) {
				if (Math.abs(latestDx) > 0.001 || Math.abs(latestDy) > 0.001) {
					const endPositions = new Map<string, { x: number; y: number }>()
					for (const [id, startPos] of startWorldPositions) {
						endPositions.set(id, { x: startPos.x + latestDx, y: startPos.y + latestDy })
					}
					engineApi.commitNodeMovement(startWorldPositions, endPositions)
					payload.scheduleAsyncEdgeRender()
				}
				payload.onNodeDragEnd?.(dragNodeIds)
			}
		}

		window.addEventListener('pointermove', onMove, { capture: true, passive: false })
		window.addEventListener('pointerup', onUp, true)
		window.addEventListener('pointercancel', onUp, true)
	}

	const onBoxSelect = (boxPayload: {
		worldRect: { x0: number; y0: number; x1: number; y1: number }
	}) => {
		const worldRect = boxPayload?.worldRect
		if (!worldRect) return
		const hits = hitTestNodesInWorldRect(payload.store.state, worldRect)
		engineApi.setSelectedNodes(hits, hits[0] ?? null)
	}

	const onNodeSizeChange = (nodeId: string, width?: number, height?: number) => {
		engineApi.setNodeSize(nodeId, width, height)
		payload.scheduleAsyncEdgeRender()
	}

	let focusAnimationFrameId: number | null = null

	const cancelFocusAnimation = () => {
		if (focusAnimationFrameId !== null) {
			cancelAnimationFrame(focusAnimationFrameId)
			focusAnimationFrameId = null
		}
	}

	const onFocusNode = (nodeId: string): boolean => {
		return engineApi.focusNode(nodeId)
	}

	return {
		onCanvasPointerDown,
		onNodeX,
		onNodeY,
		onNodeDragPosition,
		onSelectNode,
		onSelectEdge,
		onCompactNodePointerDown,
		onBoxSelect,
		onNodeSizeChange,
		onFocusNode,
		cancelFocusAnimation
	}
}
