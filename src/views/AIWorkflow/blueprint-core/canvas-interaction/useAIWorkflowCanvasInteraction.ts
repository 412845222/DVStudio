import type { Ref } from 'vue'
import type { Store } from 'vuex'
import { hitTestNodesInWorldRect } from '../../../../aiworkflow/domain/selection/hitTestNodesInWorldRect'
import type { WorkflowState } from '../../../../aiworkflow/types'

export type ScreenToWorldFn = (point: { x: number; y: number }) => { x: number; y: number }

const FOCUS_ANIMATION_DURATION = 300

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)

export const useAIWorkflowCanvasInteraction = (payload: {
	store: Store<WorkflowState>
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
}) => {
	const onCanvasPointerDown = (event: PointerEvent) => {
		if (event.button !== 0) return
		const target = event.target as HTMLElement | null
		if (!target) return
		const inUi = target.closest(
			'.wf-node, .wf-resource-panel, .wf-inspector, .ctx-menu, .aiwf-toolbar, .aiwf-inspector-toggle, .wf-sel-frame-tag-bar'
		)
		if (inUi) return
		payload.store.commit('clearSelection')
		payload.inspectorOpen.value = false
		if (payload.chatModelKey.value !== 'nanobanana' && payload.chatModelKey.value !== 'seedance') {
			payload.chatCollapsed.value = true
		}
	}

	const onNodeX = (nodeId: string, value: number) => {
		payload.markViewportMotion()
		const node = payload.store.state.nodesById[nodeId]
		if (!node) return
		const next = Number(value)
		if (!Number.isFinite(next)) return
		const dx = next - node.worldX
		if (
			payload.selectedNodeIds.value.length > 1 &&
			payload.selectedNodeIds.value.includes(nodeId)
		) {
			payload.store.commit('moveSelectedNodesByDelta', { dx, dy: 0 })
			payload.scheduleAsyncEdgeRender()
			return
		}
		payload.store.commit('setNodePosition', { nodeId, worldX: next })
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
			payload.store.commit('moveSelectedNodesByDelta', { dx: 0, dy })
			payload.scheduleAsyncEdgeRender()
			return
		}
		payload.store.commit('setNodePosition', { nodeId, worldY: next })
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
				payload.store.commit('moveSelectedNodesByDelta', { dx, dy })
			}
			payload.scheduleAsyncEdgeRender()
			return
		}
		payload.store.commit('setNodePosition', { nodeId, worldX: nextX, worldY: nextY })
		payload.scheduleAsyncEdgeRender()
	}

	const onSelectNode = (nodeId: string) => {
		if (
			payload.selectedNodeIds.value.length === 1 &&
			payload.selectedNodeIds.value[0] === nodeId &&
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
				if (
					!payload.store.state.nodeChatDialog.visible ||
					payload.store.state.nodeChatDialog.nodeId !== nodeId
				) {
					payload.store.dispatch('openNodeChatDialog', { nodeId })
				}
			}
			}
			return
		}
		if (
			payload.selectedNodeIds.value.length > 1 &&
			payload.selectedNodeIds.value.includes(nodeId)
		) {
			payload.store.commit('setSelectedNodes', {
				nodeIds: payload.selectedNodeIds.value,
				primaryNodeId: nodeId
			})
			payload.store.dispatch('closeNodeChatDialog')
			return
		}
		payload.store.commit('setSelectedNode', { nodeId })
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
				payload.store.dispatch('openNodeChatDialog', { nodeId })
			} else {
				payload.store.dispatch('closeNodeChatDialog')
			}
		}
	}

	const onSelectEdge = (edgeId: string) => {
		payload.store.commit('setSelectedEdge', { edgeId })
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
		const startWorld = { x: node.worldX, y: node.worldY }
		const moveGroup =
			payload.selectedNodeIds.value.length > 1 && payload.selectedNodeIds.value.includes(nodeId)
		let hasMoved = false
		let dragNodeIds: string[] = []
		let dragMoveRafId: number | null = null
		let latestDx = 0
		let latestDy = 0
		let lastCommittedDx = 0
		let lastCommittedDy = 0
		let pendingSingleNodeX = 0
		let pendingSingleNodeY = 0
		let hasPendingUpdate = false

		const scheduleDragMove = () => {
			if (dragMoveRafId !== null) return
			dragMoveRafId = requestAnimationFrame(() => {
				dragMoveRafId = null
				if (hasMoved && dragNodeIds.length > 0) {
					if (hasPendingUpdate) {
						hasPendingUpdate = false
						if (moveGroup) {
							const stepDx = latestDx - lastCommittedDx
							const stepDy = latestDy - lastCommittedDy
							if (Math.abs(stepDx) > 0.001 || Math.abs(stepDy) > 0.001) {
								payload.store.commit('moveSelectedNodesByDelta', { dx: stepDx, dy: stepDy })
								lastCommittedDx = latestDx
								lastCommittedDy = latestDy
							}
						} else {
							payload.store.commit('setNodePosition', {
								nodeId,
								worldX: pendingSingleNodeX,
								worldY: pendingSingleNodeY
							})
						}
						payload.scheduleAsyncEdgeRender()
					}
					payload.onNodeDragMove?.(dragNodeIds)
					payload.flushCanvasNodeLayer?.()
				}
			})
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
				dragNodeIds = moveGroup
					? payload.selectedNodeIds.value.slice()
					: [nodeId]
				lastCommittedDx = 0
				lastCommittedDy = 0
				payload.onNodeDragStart?.(dragNodeIds)
			}

			if (moveGroup) {
				latestDx = dx
				latestDy = dy
			} else {
				pendingSingleNodeX = startWorld.x + dx
				pendingSingleNodeY = startWorld.y + dy
			}
			hasPendingUpdate = true
			scheduleDragMove()
		}

		const flushPendingDragUpdate = () => {
			if (dragMoveRafId !== null) {
				cancelAnimationFrame(dragMoveRafId)
				dragMoveRafId = null
			}
			if (hasMoved && hasPendingUpdate) {
				hasPendingUpdate = false
				if (moveGroup) {
					const stepDx = latestDx - lastCommittedDx
					const stepDy = latestDy - lastCommittedDy
					if (Math.abs(stepDx) > 0.001 || Math.abs(stepDy) > 0.001) {
						payload.store.commit('moveSelectedNodesByDelta', { dx: stepDx, dy: stepDy })
						lastCommittedDx = latestDx
						lastCommittedDy = latestDy
					}
				} else {
					payload.store.commit('setNodePosition', {
						nodeId,
						worldX: pendingSingleNodeX,
						worldY: pendingSingleNodeY
					})
				}
				payload.scheduleAsyncEdgeRender()
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
		payload.store.commit('setSelectedNodes', { nodeIds: hits, primaryNodeId: hits[0] ?? null })
	}

	const onNodeSizeChange = (nodeId: string, width?: number, height?: number) => {
		payload.store.commit('setNodeSize', { nodeId, width, height })
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
		const node = payload.store.state.nodesById[nodeId]
		if (!node) return false

		cancelFocusAnimation()

		const vp = payload.store.state.viewport
		const zoom = Math.max(0.01, Number(vp.zoom) || 1)

		const nodeCenterX = node.worldX as number
		const nodeCenterY = node.worldY as number

		const targetPanX = -nodeCenterX * zoom
		const targetPanY = -nodeCenterY * zoom

		const startPanX = Number(vp.panX) || 0
		const startPanY = Number(vp.panY) || 0
		const dx = targetPanX - startPanX
		const dy = targetPanY - startPanY

		if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
			payload.store.commit('setViewport', { zoom, panX: targetPanX, panY: targetPanY })
			return true
		}

		const startTime = performance.now()

		const animate = (now: number) => {
			const elapsed = now - startTime
			const rawT = Math.min(1, elapsed / FOCUS_ANIMATION_DURATION)
			const t = easeOutCubic(rawT)

			const panX = startPanX + dx * t
			const panY = startPanY + dy * t

			payload.store.commit('setViewport', { zoom, panX, panY })

			if (rawT < 1) {
				payload.markViewportMotion()
				focusAnimationFrameId = requestAnimationFrame(animate)
			} else {
				payload.forceEndViewportMotion?.()
				focusAnimationFrameId = null
			}
		}

		focusAnimationFrameId = requestAnimationFrame(animate)
		return true
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
