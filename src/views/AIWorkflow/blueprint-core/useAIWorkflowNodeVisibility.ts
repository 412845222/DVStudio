import { computed, type Ref } from 'vue'
import type { WorkflowNode } from '../../../aiworkflow/types'
import { t } from '../../../i18n'

const GRID_CELL_SIZE = 1000
const SPATIAL_INDEX_THRESHOLD = 80

interface GridCell {
	nodeIds: string[]
}

export const useAIWorkflowNodeVisibility = (payload: {
	nodes: Ref<WorkflowNode[]>
	viewport: Ref<{ zoom: number; panX: number; panY: number }>
	canvasViewportSize: Ref<{ width: number; height: number }>
	selectedNodeIds: Ref<string[]>
	hiddenNodeIds?: string[]
	compactZoomThreshold?: number | Ref<number>
	screenMargin?: number
	viewportMotionActive?: Ref<boolean>
	motionRecomputeMinIntervalMs?: number
	forceRenderNodeIds?: Ref<Set<string>>
}) => {
	const hiddenNodeIdSet = new Set(
		(payload.hiddenNodeIds ?? []).map((id) => String(id || '').trim()).filter(Boolean)
	)
	const compactRenderStateByNodeId = new Map<string, boolean>()

	const resolveCompactZoomThreshold = () => {
		const raw =
			typeof payload.compactZoomThreshold === 'object'
				? payload.compactZoomThreshold?.value
				: payload.compactZoomThreshold
		return Number.isFinite(Number(raw)) ? Number(raw) : 0.3
	}
	const screenMargin = Number.isFinite(Number(payload.screenMargin))
		? Number(payload.screenMargin)
		: 360
	const MAX_WORLD_MARGIN = 1800
	const motionRecomputeMinIntervalMs = Number.isFinite(Number(payload.motionRecomputeMinIntervalMs))
		? Math.max(16, Number(payload.motionRecomputeMinIntervalMs))
		: 90

	let lastVisibleIds: string[] = []
	let lastVisibleIdSet = new Set<string>()
	let lastViewLeft = 0
	let lastViewTop = 0
	let lastViewRight = 0
	let lastViewBottom = 0
	let lastZoom = 1
	let lastNodeCount = -1
	let lastSelectedCount = -1
	let lastComputeAt = 0
	let lastResultWasCapped = false

	const gridIndex = new Map<string, GridCell>()
	let lastGridHash = -1
	let gridNodesById: Map<string, WorkflowNode> | null = null

	const computeSpatialHash = (nodes: WorkflowNode[]) => {
		const count = nodes.length
		if (!count) return 0
		let hash = count * 131
		const sampleStep = Math.max(1, Math.floor(count / 20))
		for (let i = 0; i < count; i += sampleStep) {
			const node = nodes[i]
			const id = String(node.id ?? '')
			for (let j = 0; j < id.length; j++) {
				hash = (hash * 31 + id.charCodeAt(j)) % 2147483647
			}
			hash = (hash + Math.round((Number(node.worldX) || 0) * 0.1)) % 2147483647
			hash = (hash + Math.round((Number(node.worldY) || 0) * 0.1)) % 2147483647
			hash = (hash + Math.round((Number(node.width) || 0) * 0.1)) % 2147483647
			hash = (hash + Math.round((Number(node.height) || 0) * 0.1)) % 2147483647
		}
		return hash
	}

	const buildGridIndex = (nodes: WorkflowNode[]) => {
		const hash = computeSpatialHash(nodes)
		if (hash === lastGridHash && gridNodesById) return gridNodesById
		gridIndex.clear()
		const byId = new Map<string, WorkflowNode>()
		const count = nodes.length

		for (let i = 0; i < count; i++) {
			const node = nodes[i]
			byId.set(node.id, node)
			const halfWidth = Math.max(0, Number(node.width) || 0) / 2
			const halfHeight = Math.max(0, Number(node.height) || 0) / 2
			const left = node.worldX - halfWidth
			const right = node.worldX + halfWidth
			const top = node.worldY - halfHeight
			const bottom = node.worldY + halfHeight

			const minCol = (left / GRID_CELL_SIZE) | 0
			const maxCol = (right / GRID_CELL_SIZE) | 0
			const minRow = (top / GRID_CELL_SIZE) | 0
			const maxRow = (bottom / GRID_CELL_SIZE) | 0

			for (let col = minCol; col <= maxCol; col++) {
				for (let row = minRow; row <= maxRow; row++) {
					const key = col + ',' + row
					let cell = gridIndex.get(key)
					if (!cell) {
						cell = { nodeIds: [] }
						gridIndex.set(key, cell)
					}
					cell.nodeIds.push(node.id)
				}
			}
		}
		lastGridHash = hash
		gridNodesById = byId
		return byId
	}

	const queryGridIndex = (
		viewLeft: number,
		viewTop: number,
		viewRight: number,
		viewBottom: number,
		out: string[]
	) => {
		const minCol = (viewLeft / GRID_CELL_SIZE) | 0
		const maxCol = (viewRight / GRID_CELL_SIZE) | 0
		const minRow = (viewTop / GRID_CELL_SIZE) | 0
		const maxRow = (viewBottom / GRID_CELL_SIZE) | 0

		for (let col = minCol; col <= maxCol; col++) {
			for (let row = minRow; row <= maxRow; row++) {
				const cell = gridIndex.get(col + ',' + row)
				if (cell) {
					const ids = cell.nodeIds
					for (let i = 0; i < ids.length; i++) {
						out.push(ids[i])
					}
				}
			}
		}
	}

	const renderNodes = computed(() =>
		payload.nodes.value.filter((node) => !hiddenNodeIdSet.has(node.id))
	)

	const compactNodeTypeLabel = (nodeType: string) => {
		if (nodeType === 'text') return t('aiworkflow.toast.nodeVisibilityText')
		if (nodeType === 'text-merge') return t('aiworkflow.toast.nodeVisibilityMerge')
		if (nodeType === 'image') return t('aiworkflow.toast.nodeVisibilityImage')
		if (nodeType === 'rotate-image') return t('aiworkflow.toast.nodeVisibilityRotate')
		if (nodeType === 'video') return t('aiworkflow.toast.nodeVisibilityVideo')
		if (nodeType === 'scene-understanding') return t('aiworkflow.toast.nodeVisibilityUnderstanding')
		if (nodeType === 'scene-decompose') return t('aiworkflow.toast.nodeVisibilityDecompose')
		if (nodeType === 'scene-layout') return t('aiworkflow.toast.nodeVisibilityLayout')
		if (nodeType === 'story') return t('aiworkflow.toast.nodeVisibilityStory')
		if (nodeType === 'comfyui') return 'Comfy'
		if (nodeType === 'model3d') return '3D'
		if (nodeType === 'meshy') return 'Meshy'
		return t('aiworkflow.toast.nodeVisibilityDefault')
	}

	const compactNodeDisplayName = (node: WorkflowNode) =>
		String(node.alias ?? node.title ?? '').trim() || compactNodeTypeLabel(node.type)
	const compactNodeBadge = (node: WorkflowNode) => compactNodeTypeLabel(node.type)

	const compactNodeMeta = (node: WorkflowNode) => {
		const inputCount = Array.isArray(node.inputs) ? node.inputs.length : 0
		const outputCount = Array.isArray(node.outputs) ? node.outputs.length : 0
		if (node.type === 'model3d' || node.type === 'scene-layout') return t('aiworkflow.toast.heavyPreviewCollapsed')
		if (node.type === 'image' || node.type === 'video')
			return t('aiworkflow.toast.nodeAnchorsInOut', { input: inputCount, output: outputCount })
		if (node.type === 'scene-understanding' || node.type === 'scene-decompose')
			return t('aiworkflow.toast.nodeOutputAnchors', { count: outputCount })
		return t('aiworkflow.toast.nodeAnchorsInOut', { input: inputCount, output: outputCount })
	}

	const compactNodeTooltip = (node: WorkflowNode) => {
		const name = compactNodeDisplayName(node)
		const meta = compactNodeMeta(node)
		return t('aiworkflow.toast.nodeCompactLabel', { name, meta })
	}

	const compactNodeClass = (node: WorkflowNode) => ({
		'is-selected': payload.selectedNodeIds.value.includes(node.id),
		'is-media': node.type === 'image' || node.type === 'video' || node.type === 'rotate-image',
		'is-scene':
			node.type === 'scene-understanding' ||
			node.type === 'scene-decompose' ||
			node.type === 'scene-layout',
		'is-3d': node.type === 'model3d' || node.type === 'meshy',
		'is-story': node.type === 'story'
	})

	const shouldRenderCompactNode = (_zoom: number, node: WorkflowNode) => {
		const nodeId = String(node?.id ?? '').trim()
		if (!nodeId) return false
		compactRenderStateByNodeId.set(nodeId, false)
		return false
	}

	const candidateIdBuf: string[] = []

	const computeVisibleNodeIds = (
		nodesForRender: WorkflowNode[],
		viewLeft: number,
		viewTop: number,
		viewRight: number,
		viewBottom: number,
		selectedIds: Set<string>,
		out: string[]
	) => {
		out.length = 0

		selectedIds.forEach((id) => {
			out.push(id)
		})

		const nodeCount = nodesForRender.length

		if (nodeCount <= SPATIAL_INDEX_THRESHOLD) {
			for (let i = 0; i < nodeCount; i++) {
				const node = nodesForRender[i]
				const id = node.id
				if (selectedIds.has(id)) continue
				const halfWidth = Math.max(0, Number(node.width) || 0) / 2
				const halfHeight = Math.max(0, Number(node.height) || 0) / 2
				const left = node.worldX - halfWidth
				const right = node.worldX + halfWidth
				const top = node.worldY - halfHeight
				const bottom = node.worldY + halfHeight
				if (right >= viewLeft && left <= viewRight && bottom >= viewTop && top <= viewBottom) {
					out.push(id)
				}
			}
		} else {
			const nodesById = buildGridIndex(nodesForRender)
			candidateIdBuf.length = 0
			queryGridIndex(viewLeft, viewTop, viewRight, viewBottom, candidateIdBuf)

			for (let i = 0; i < candidateIdBuf.length; i++) {
				const id = candidateIdBuf[i]
				if (selectedIds.has(id)) continue
				const node = nodesById.get(id)
				if (!node) continue
				const halfWidth = Math.max(0, Number(node.width) || 0) / 2
				const halfHeight = Math.max(0, Number(node.height) || 0) / 2
				const left = node.worldX - halfWidth
				const right = node.worldX + halfWidth
				const top = node.worldY - halfHeight
				const bottom = node.worldY + halfHeight
				if (right >= viewLeft && left <= viewRight && bottom >= viewTop && top <= viewBottom) {
					out.push(id)
				}
			}
		}
	}

	const idArrayToSet = (arr: string[], set: Set<string>) => {
		set.clear()
		for (let i = 0; i < arr.length; i++) {
			set.add(arr[i])
		}
		return set
	}

	const lastVisibleIdArr: string[] = []
	const tmpVisibleIdArr: string[] = []
	const tmpSelectedSet = new Set<string>()

	const visibleRenderNodeIds = computed(() => {
		const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
		const viewportWidth = payload.canvasViewportSize.value.width
		const viewportHeight = payload.canvasViewportSize.value.height
		const nodesForRender = renderNodes.value
		const selectedIdsRaw = payload.selectedNodeIds.value ?? []
		const nodeCount = nodesForRender.length
		const selectedCount = selectedIdsRaw.length
		const motionActive = payload.viewportMotionActive?.value === true

		if (viewportWidth <= 0 || viewportHeight <= 0) {
			lastVisibleIdArr.length = 0
			for (let i = 0; i < nodeCount; i++) {
				lastVisibleIdArr.push(nodesForRender[i].id)
			}
			idArrayToSet(lastVisibleIdArr, lastVisibleIdSet)
			lastNodeCount = nodeCount
			lastSelectedCount = selectedCount
			lastComputeAt = now
			lastViewLeft = 0
			lastViewTop = 0
			lastViewRight = 0
			lastViewBottom = 0
			lastZoom = 1
			return lastVisibleIdSet
		}

		const zoom = Math.max(0.01, Number(payload.viewport.value.zoom) || 1)
		const worldMargin = Math.min(MAX_WORLD_MARGIN, screenMargin / zoom)
		const centerX = viewportWidth / 2
		const centerY = viewportHeight / 2
		const viewLeft = (-centerX - payload.viewport.value.panX) / zoom - worldMargin
		const viewRight = (viewportWidth - centerX - payload.viewport.value.panX) / zoom + worldMargin
		const viewTop = (-centerY - payload.viewport.value.panY) / zoom - worldMargin
		const viewBottom = (viewportHeight - centerY - payload.viewport.value.panY) / zoom + worldMargin

		const viewUnchanged =
			lastVisibleIdArr.length > 0 &&
			lastNodeCount === nodeCount &&
			lastSelectedCount === selectedCount &&
			lastZoom === zoom &&
			lastViewLeft === viewLeft &&
			lastViewTop === viewTop &&
			lastViewRight === viewRight &&
			lastViewBottom === viewBottom

		if (viewUnchanged) {
			return lastVisibleIdSet
		}

		if (
			motionActive &&
			lastVisibleIdArr.length > 0 &&
			lastNodeCount === nodeCount &&
			lastSelectedCount === selectedCount &&
			Math.abs(lastZoom - zoom) < 0.001 &&
			now - lastComputeAt < motionRecomputeMinIntervalMs
		) {
			return lastVisibleIdSet
		}

		tmpSelectedSet.clear()
		for (let i = 0; i < selectedCount; i++) {
			tmpSelectedSet.add(selectedIdsRaw[i])
		}

		computeVisibleNodeIds(
			nodesForRender,
			viewLeft,
			viewTop,
			viewRight,
			viewBottom,
			tmpSelectedSet,
			tmpVisibleIdArr
		)

		lastVisibleIdArr.length = 0
		for (let i = 0; i < tmpVisibleIdArr.length; i++) {
			lastVisibleIdArr.push(tmpVisibleIdArr[i])
		}
		idArrayToSet(lastVisibleIdArr, lastVisibleIdSet)

		lastNodeCount = nodeCount
		lastSelectedCount = selectedCount
		lastZoom = zoom
		lastViewLeft = viewLeft
		lastViewTop = viewTop
		lastViewRight = viewRight
		lastViewBottom = viewBottom
		lastComputeAt = now

		return new Set(lastVisibleIdSet)
	})

	const visibleRenderNodes = computed(() => {
		const idSet = visibleRenderNodeIds.value
		const extraIds = payload.forceRenderNodeIds?.value
		const result: WorkflowNode[] = []
		const allNodes = renderNodes.value
		for (let i = 0; i < allNodes.length; i++) {
			const node = allNodes[i]
			if (idSet.has(node.id) || (extraIds && extraIds.has(node.id))) {
				result.push(node)
			}
		}
		return result
	})

	const renderNodeIdSet = computed(
		() => new Set(renderNodes.value.map((node) => String(node.id ?? '').trim()).filter(Boolean))
	)

	const pruneCompactRenderState = () => {
		if (!compactRenderStateByNodeId.size) return
		const validIds = renderNodeIdSet.value
		compactRenderStateByNodeId.forEach((_, nodeId) => {
			if (!validIds.has(nodeId)) compactRenderStateByNodeId.delete(nodeId)
		})
	}

	const compactVisibleNodeCount = computed(() => {
		pruneCompactRenderState()
		return visibleRenderNodes.value.filter((node) =>
			shouldRenderCompactNode(payload.viewport.value.zoom, node)
		).length
	})
	const fullVisibleNodeCount = computed(() =>
		Math.max(0, visibleRenderNodes.value.length - compactVisibleNodeCount.value)
	)

	return {
		renderNodes,
		visibleRenderNodeIds,
		visibleRenderNodes,
		compactNodeDisplayName,
		compactNodeBadge,
		compactNodeMeta,
		compactNodeTooltip,
		compactNodeClass,
		shouldRenderCompactNode,
		compactRenderStateByNodeId,
		compactVisibleNodeCount,
		fullVisibleNodeCount
	}
}
