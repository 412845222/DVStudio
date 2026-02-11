import { createStore, type Store } from 'vuex'
import type { InjectionKey } from 'vue'
import type {
	WorkflowEdge,
	WorkflowNode,
	WorkflowState,
	WorkflowViewport,
	WorkflowStoryBranch,
} from '../../aiworkflow/types'
import type { WorkflowResource, ResourceKind } from '../../aiworkflow/resource/types'

const clamp = (v: unknown, min: number, max: number) => {
	const n = Number(v)
	if (!Number.isFinite(n)) return min
	return Math.max(min, Math.min(max, n))
}

const clampZoom = (v: unknown) => {
	// 与 BlueprintCanvas 的交互 clamp 保持一致
	const n = Number(v)
	if (!Number.isFinite(n)) return 1
	return Math.max(0.2, Math.min(6, n))
}

export const createDefaultAIWorkflowState = (): WorkflowState => {
	const demo: WorkflowNode = {
		id: 'demo',
		type: 'base',
		title: '工作流节点（示意）',
		alias: '工作流节点',
		subtitle: '入口参数 / 出口结果',
		worldX: 120,
		worldY: -40,
		width: 240,
		height: 160,
		sizeCustomized: false,
		resourceId: null,
		inputs: [{ id: 'in-0', label: '入口' }],
		outputs: [{ id: 'out-0', label: '出口' }],
		createdAt: Date.now(),
	}
	return {
		viewport: { zoom: 1, panX: 0, panY: 0 },
		nodesById: { [demo.id]: demo },
		nodeOrder: [demo.id],
		edgesById: {},
		edgeOrder: [],
		resourcesById: {},
		resourceOrder: [],
		selectedNodeId: demo.id,
		selectedNodeIds: [demo.id],
		selectedEdgeId: null,
		clipboardNode: null,
		clipboardNodes: null,
		clipboardPrimaryNodeId: null,
		chatDraft: '',
	}
}

const uniq = <T>(arr: T[]) => Array.from(new Set(arr))

const normalizeNodeIds = (state: WorkflowState, ids: string[]) => {
	const out: string[] = []
	for (const id of ids) {
		if (typeof id !== 'string') continue
		const key = id.trim()
		if (!key) continue
		if (!state.nodesById[key]) continue
		out.push(key)
	}
	return uniq(out)
}

const makeId = (prefix: string) => {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const defaultAliasForType = (type: string) => {
	switch (type) {
		case 'image':
			return '图片节点'
		case 'video':
			return '视频节点'
		case 'story':
			return '剧情节点'
		case 'base':
		default:
			return '工作流节点'
	}
}

const anchorKindFor = (node: WorkflowNode, anchorId: string, direction: 'in' | 'out') => {
	if (node.type === 'story') {
		if (direction === 'in') return anchorId === 'in-resource' ? 'resource' : 'flow'
		return 'flow'
	}
	if (node.type === 'image' || node.type === 'video') return 'resource'
	return 'resource'
}

const hasAnchor = (node: WorkflowNode, direction: 'in' | 'out', anchorId: string) => {
	const list = direction === 'in' ? node.inputs : node.outputs
	return Array.isArray(list) && list.some((a) => a.id === anchorId)
}

const STORY_BRANCH_ROW = 32
const STORY_BRANCH_GAP = 6
const STORY_BRANCH_PAD = 8
const STORY_INPUT_SIZE = 9
const STORY_INPUT_GAP = 6
const NODE_PADDING_BOTTOM = 10

const storyBranchOffset = (index: number, count: number, height: number) => {
	const rows = Math.max(1, count)
	const footerHeight = STORY_BRANCH_PAD * 2 + rows * STORY_BRANCH_ROW + (rows - 1) * STORY_BRANCH_GAP
	const footerTop = height / 2 - NODE_PADDING_BOTTOM - footerHeight
	return footerTop + STORY_BRANCH_PAD + STORY_BRANCH_ROW / 2 + index * (STORY_BRANCH_ROW + STORY_BRANCH_GAP)
}

const ensureStoryBranches = (node: WorkflowNode) => {
	if (!node.branches || !node.branches.length) {
		node.branches = [{ id: makeId('branch'), text: '剧情分支' }]
	}
}

const syncStoryAnchors = (node: WorkflowNode) => {
	ensureStoryBranches(node)
	const height = Number.isFinite(node.height) ? node.height : 160
	const inputOffset = (STORY_INPUT_SIZE + STORY_INPUT_GAP) / 2
	node.inputs = [
		{ id: 'in-flow', label: '剧情流程', offsetY: -inputOffset },
		{ id: 'in-resource', label: '资源来源', offsetY: inputOffset },
	]
	node.outputs = node.branches!.map((b, idx) => ({
		id: `out-${b.id}`,
		label: b.text ? b.text : `分支${idx + 1}`,
		offsetY: storyBranchOffset(idx, node.branches!.length, height),
	}))
}

export const AIWorkflowKey: InjectionKey<Store<WorkflowState>> = Symbol('AIWorkflowStore')

export const AIWorkflowStore = createStore<WorkflowState>({
	state: createDefaultAIWorkflowState,
	mutations: {
		hydrateDraft(state, payload: { snapshot: any }) {
			const s = payload?.snapshot
			if (!s || typeof s !== 'object') return

			// viewport
			if (s.viewport && typeof s.viewport === 'object') {
				state.viewport.zoom = clampZoom((s.viewport as any).zoom)
				state.viewport.panX = clamp((s.viewport as any).panX, -1e9, 1e9)
				state.viewport.panY = clamp((s.viewport as any).panY, -1e9, 1e9)
			}

			// nodes
			const nextNodesById: Record<string, WorkflowNode> = {}
			const rawNodesById = (s.nodesById && typeof s.nodesById === 'object') ? (s.nodesById as Record<string, any>) : {}
			for (const [id, raw] of Object.entries(rawNodesById)) {
				const nodeId = String(id ?? '').trim()
				if (!nodeId) continue
				if (!raw || typeof raw !== 'object') continue
				const n = raw as any
				const type = String(n.type ?? 'base')
				let alias = typeof n.alias === 'string' ? n.alias : ''
				if (!alias.trim()) alias = defaultAliasForType(type)
				const rawImg = (n as any).imageSettings
				const imageSettings = rawImg && typeof rawImg === 'object'
					? {
						outputWidth: Number.isFinite(Number((rawImg as any).outputWidth)) ? Math.max(1, Math.floor(Number((rawImg as any).outputWidth))) : undefined,
						outputHeight: Number.isFinite(Number((rawImg as any).outputHeight)) ? Math.max(1, Math.floor(Number((rawImg as any).outputHeight))) : undefined,
						naturalWidth: Number.isFinite(Number((rawImg as any).naturalWidth)) ? Math.max(1, Math.floor(Number((rawImg as any).naturalWidth))) : undefined,
						naturalHeight: Number.isFinite(Number((rawImg as any).naturalHeight)) ? Math.max(1, Math.floor(Number((rawImg as any).naturalHeight))) : undefined,
						crop: (rawImg as any).crop && typeof (rawImg as any).crop === 'object'
							? {
								x: Number.isFinite(Number((rawImg as any).crop.x)) ? Math.max(0, Math.min(1, Number((rawImg as any).crop.x))) : 0,
								y: Number.isFinite(Number((rawImg as any).crop.y)) ? Math.max(0, Math.min(1, Number((rawImg as any).crop.y))) : 0,
								width: Number.isFinite(Number((rawImg as any).crop.width)) ? Math.max(0, Math.min(1, Number((rawImg as any).crop.width))) : 1,
								height: Number.isFinite(Number((rawImg as any).crop.height)) ? Math.max(0, Math.min(1, Number((rawImg as any).crop.height))) : 1,
							}
							: undefined,
					}
					: undefined
				nextNodesById[nodeId] = {
					id: nodeId,
					type,
					title: String(n.title ?? '工作流节点'),
					alias,
					subtitle: typeof n.subtitle === 'string' ? n.subtitle : '',
					imageSettings,
					worldX: Number.isFinite(Number(n.worldX)) ? Number(n.worldX) : 0,
					worldY: Number.isFinite(Number(n.worldY)) ? Number(n.worldY) : 0,
					width: Number.isFinite(Number(n.width)) ? Math.max(80, Math.min(1000, Number(n.width))) : 240,
					height: Number.isFinite(Number(n.height)) ? Math.max(80, Math.min(1000, Number(n.height))) : 160,
					sizeCustomized: Boolean(n.sizeCustomized),
					resourceId: typeof n.resourceId === 'string' ? n.resourceId : null,
					branches: Array.isArray(n.branches)
						? n.branches
							.map((b: any) => ({ id: String(b?.id ?? '').trim(), text: String(b?.text ?? '') }))
							.filter((b: any) => b.id)
						: undefined,
					inputs: Array.isArray(n.inputs)
						? n.inputs.map((a: any) => ({ id: String(a?.id ?? '').trim(), label: typeof a?.label === 'string' ? a.label : undefined, offsetY: typeof a?.offsetY === 'number' ? a.offsetY : undefined })).filter((a: any) => a.id)
						: [{ id: 'in-0', label: '入口' }],
					outputs: Array.isArray(n.outputs)
						? n.outputs.map((a: any) => ({ id: String(a?.id ?? '').trim(), label: typeof a?.label === 'string' ? a.label : undefined, offsetY: typeof a?.offsetY === 'number' ? a.offsetY : undefined })).filter((a: any) => a.id)
						: [{ id: 'out-0', label: '出口' }],
					createdAt: Number.isFinite(Number(n.createdAt)) ? Number(n.createdAt) : Date.now(),
				}
				if (nextNodesById[nodeId].type === 'story') syncStoryAnchors(nextNodesById[nodeId])
			}

			const rawNodeOrder = Array.isArray(s.nodeOrder) ? (s.nodeOrder as any[]) : []
			const nextNodeOrder = normalizeNodeIds({ ...state, nodesById: nextNodesById } as any, rawNodeOrder.map((x) => String(x ?? '')))
			// if order missing, fall back to object keys
			const nodeOrder = nextNodeOrder.length ? nextNodeOrder : Object.keys(nextNodesById)

			state.nodesById = nextNodesById
			state.nodeOrder = nodeOrder

			// resources (drop blob: urls; they can't survive refresh)
			const nextResourcesById: any = {}
			const nextResourceOrder: string[] = []
			const rawResourcesById = (s.resourcesById && typeof s.resourcesById === 'object') ? (s.resourcesById as Record<string, any>) : {}
			const rawResourceOrder = Array.isArray(s.resourceOrder) ? (s.resourceOrder as any[]) : []
			for (const ridRaw of rawResourceOrder.length ? rawResourceOrder : Object.keys(rawResourcesById)) {
				const rid = String(ridRaw ?? '').trim()
				if (!rid) continue
				const r = rawResourcesById[rid]
				if (!r || typeof r !== 'object') continue
				const url = typeof (r as any).url === 'string' ? String((r as any).url) : ''
				if (url.startsWith('blob:')) continue
				nextResourcesById[rid] = { ...(r as any), id: rid, url }
				nextResourceOrder.push(rid)
			}
			state.resourcesById = nextResourcesById
			state.resourceOrder = uniq(nextResourceOrder)

			// edges
			const nextEdgesById: Record<string, WorkflowEdge> = {}
			const rawEdgesById = (s.edgesById && typeof s.edgesById === 'object') ? (s.edgesById as Record<string, any>) : {}
			for (const [edgeIdRaw, raw] of Object.entries(rawEdgesById)) {
				const edgeId = String(edgeIdRaw ?? '').trim()
				if (!edgeId) continue
				if (!raw || typeof raw !== 'object') continue
				const e = raw as any
				const fromNodeId = String(e.fromNodeId ?? '').trim()
				const toNodeId = String(e.toNodeId ?? '').trim()
				if (!fromNodeId || !toNodeId) continue
				if (!state.nodesById[fromNodeId] || !state.nodesById[toNodeId]) continue
				nextEdgesById[edgeId] = {
					id: edgeId,
					fromNodeId,
					fromAnchorId: String(e.fromAnchorId ?? 'out-0'),
					toNodeId,
					toAnchorId: String(e.toAnchorId ?? 'in-0'),
					createdAt: Number.isFinite(Number(e.createdAt)) ? Number(e.createdAt) : Date.now(),
				}
			}
			const rawEdgeOrder = Array.isArray(s.edgeOrder) ? (s.edgeOrder as any[]) : []
			let edgeOrder = rawEdgeOrder.map((x) => String(x ?? '').trim()).filter((id) => !!id && !!nextEdgesById[id])
			if (!edgeOrder.length) edgeOrder = Object.keys(nextEdgesById)

			// Remove edges with missing anchors or kind mismatch.
			for (const edgeId of edgeOrder.slice()) {
				const e = nextEdgesById[edgeId]
				if (!e) continue
				const fromNode = state.nodesById[e.fromNodeId]
				const toNode = state.nodesById[e.toNodeId]
				if (!fromNode || !toNode) {
					delete nextEdgesById[edgeId]
					continue
				}
				if (!hasAnchor(fromNode, 'out', e.fromAnchorId) || !hasAnchor(toNode, 'in', e.toAnchorId)) {
					delete nextEdgesById[edgeId]
					continue
				}
				const fromKind = anchorKindFor(fromNode, e.fromAnchorId, 'out')
				const toKind = anchorKindFor(toNode, e.toAnchorId, 'in')
				if (fromKind !== toKind) delete nextEdgesById[edgeId]
			}
			state.edgesById = nextEdgesById
			state.edgeOrder = edgeOrder.filter((id) => !!state.edgesById[id])

			// selection
			const ids = normalizeNodeIds(state, Array.isArray(s.selectedNodeIds) ? (s.selectedNodeIds as any[]).map((x) => String(x ?? '')) : [])
			const primaryRaw = typeof s.selectedNodeId === 'string' ? s.selectedNodeId : null
			state.selectedNodeIds = ids
			state.selectedNodeId = primaryRaw && ids.includes(primaryRaw) ? primaryRaw : (ids[0] ?? state.nodeOrder[0] ?? null)
			state.selectedEdgeId = null
			state.clipboardNode = null
			state.clipboardNodes = null
			state.clipboardPrimaryNodeId = null
			state.chatDraft = ''
		},
		setChatDraft(state, payload: { text: string }) {
			state.chatDraft = typeof payload?.text === 'string' ? payload.text : String(payload?.text ?? '')
		},
		resetViewport(state) {
			state.viewport = { zoom: 1, panX: 0, panY: 0 }
		},
		setViewport(state, payload: Partial<WorkflowViewport>) {
			const nextZoom = payload.zoom == null ? state.viewport.zoom : clampZoom(payload.zoom)
			const nextPanX = payload.panX == null ? state.viewport.panX : clamp(payload.panX, -1e9, 1e9)
			const nextPanY = payload.panY == null ? state.viewport.panY : clamp(payload.panY, -1e9, 1e9)
			state.viewport.zoom = nextZoom
			state.viewport.panX = nextPanX
			state.viewport.panY = nextPanY
		},
		setSelectedNode(state, payload: { nodeId: string | null }) {
			const id = payload?.nodeId
			state.selectedNodeId = typeof id === 'string' && id.trim() ? id : null
			state.selectedNodeIds = state.selectedNodeId ? normalizeNodeIds(state, [state.selectedNodeId]) : []
			if (state.selectedNodeId) state.selectedEdgeId = null
		},
		setSelectedNodes(state, payload: { nodeIds: string[]; primaryNodeId?: string | null }) {
			const ids = normalizeNodeIds(state, Array.isArray(payload?.nodeIds) ? payload.nodeIds : [])
			state.selectedNodeIds = ids
			const primaryRaw = payload?.primaryNodeId
			const primary = typeof primaryRaw === 'string' && primaryRaw.trim() ? primaryRaw.trim() : null
			state.selectedNodeId = primary && ids.includes(primary) ? primary : (ids[0] ?? null)
			if (ids.length) state.selectedEdgeId = null
		},
		setSelectedEdge(state, payload: { edgeId: string | null }) {
			const id = payload?.edgeId
			state.selectedEdgeId = typeof id === 'string' && id.trim() ? id : null
			if (state.selectedEdgeId) {
				state.selectedNodeId = null
				state.selectedNodeIds = []
			}
		},
		addResource(state, payload: WorkflowResource) {
			const id = String(payload?.id ?? '').trim()
			if (!id) return
			state.resourcesById[id] = payload
			if (!state.resourceOrder.includes(id)) state.resourceOrder.push(id)
		},
		removeResource(state, payload: { resourceId: string }) {
			const id = String(payload?.resourceId ?? '').trim()
			if (!id) return
			delete state.resourcesById[id]
			state.resourceOrder = state.resourceOrder.filter((x) => x !== id)
			for (const node of Object.values(state.nodesById)) {
				if (node.resourceId === id) node.resourceId = null
			}
		},
		setNodeAlias(state, payload: { nodeId: string; alias: string }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n) return
			n.alias = String(payload?.alias ?? '')
		},
		setNodeType(state, payload: { nodeId: string; type: 'base' | 'image' | 'video' | 'story' }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n) return
			if (payload.type !== 'base' && payload.type !== 'image' && payload.type !== 'video' && payload.type !== 'story') return
			const prevType = String(n.type ?? 'base')
			const prevDefaultAlias = defaultAliasForType(prevType)
			n.type = payload.type
			if (payload.type !== 'image') n.imageSettings = undefined
			if (payload.type === 'base') n.resourceId = null
			if (payload.type !== 'story') {
				n.branches = undefined
				n.inputs = [{ id: 'in-0', label: '入口' }]
				n.outputs = [{ id: 'out-0', label: '出口' }]
			}
			if (payload.type === 'story') syncStoryAnchors(n)
			if (!String(n.alias ?? '').trim() || String(n.alias) === prevDefaultAlias) {
				n.alias = defaultAliasForType(payload.type)
			}
			if (!n.sizeCustomized) {
				if (payload.type === 'image' || payload.type === 'video' || payload.type === 'story') {
					n.width = 450
					n.height = 300
				} else {
					n.width = 240
					n.height = 160
				}
			}

			const removeIds: string[] = []
			for (const edgeId of state.edgeOrder) {
				const e = state.edgesById[edgeId]
				if (!e) continue
				if (e.fromNodeId !== id && e.toNodeId !== id) continue
				const fromNode = state.nodesById[e.fromNodeId]
				const toNode = state.nodesById[e.toNodeId]
				if (!fromNode || !toNode) {
					removeIds.push(edgeId)
					continue
				}
				if (!hasAnchor(fromNode, 'out', e.fromAnchorId) || !hasAnchor(toNode, 'in', e.toAnchorId)) {
					removeIds.push(edgeId)
					continue
				}
				const fromKind = anchorKindFor(fromNode, e.fromAnchorId, 'out')
				const toKind = anchorKindFor(toNode, e.toAnchorId, 'in')
				if (fromKind !== toKind) removeIds.push(edgeId)
			}
			if (removeIds.length) {
				for (const edgeId of removeIds) delete state.edgesById[edgeId]
				state.edgeOrder = state.edgeOrder.filter((edgeId) => !!state.edgesById[edgeId])
				if (state.selectedEdgeId && !state.edgesById[state.selectedEdgeId]) state.selectedEdgeId = null
			}
		},
		setNodeImageSettings(
			state,
			payload: {
				nodeId: string
				imageSettings: {
					outputWidth?: number
					outputHeight?: number
					naturalWidth?: number
					naturalHeight?: number
					crop?: { x: number; y: number; width: number; height: number }
				}
			}
		) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n) return
			if (n.type !== 'image') return
			const next = payload?.imageSettings
			if (!next || typeof next !== 'object') return

			const outW = next.outputWidth != null ? Math.max(1, Math.floor(Number(next.outputWidth) || 1)) : undefined
			const outH = next.outputHeight != null ? Math.max(1, Math.floor(Number(next.outputHeight) || 1)) : undefined
			const natW = next.naturalWidth != null ? Math.max(1, Math.floor(Number(next.naturalWidth) || 1)) : undefined
			const natH = next.naturalHeight != null ? Math.max(1, Math.floor(Number(next.naturalHeight) || 1)) : undefined

			const cropRaw = next.crop
			const crop =
				cropRaw && typeof cropRaw === 'object'
					? {
						x: Math.max(0, Math.min(1, Number(cropRaw.x) || 0)),
						y: Math.max(0, Math.min(1, Number(cropRaw.y) || 0)),
						width: Math.max(0, Math.min(1, Number(cropRaw.width) || 0)),
						height: Math.max(0, Math.min(1, Number(cropRaw.height) || 0)),
					}
					: undefined

			n.imageSettings = {
				...(n.imageSettings ?? {}),
				...(outW != null ? { outputWidth: outW } : {}),
				...(outH != null ? { outputHeight: outH } : {}),
				...(natW != null ? { naturalWidth: natW } : {}),
				...(natH != null ? { naturalHeight: natH } : {}),
				...(crop ? { crop } : {}),
			}
		},
		setNodeResource(state, payload: { nodeId: string; resourceId: string | null }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n) return
			const rid = payload?.resourceId
			n.resourceId = rid ? String(rid) : null
		},
		setNodeSize(state, payload: { nodeId: string; width?: number; height?: number; customized?: boolean }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n) return
			if (payload.width != null) {
				const w = Number(payload.width)
				if (Number.isFinite(w)) n.width = Math.max(80, Math.min(1000, w))
			}
			if (payload.height != null) {
				const h = Number(payload.height)
				if (Number.isFinite(h)) n.height = Math.max(80, Math.min(1000, h))
			}
			if (payload.customized !== false) n.sizeCustomized = true
			if (n.type === 'story') syncStoryAnchors(n)
		},
		addStoryBranch(state, payload: { nodeId: string }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'story') return
			ensureStoryBranches(n)
			n.branches!.push({ id: makeId('branch'), text: '剧情分支' })
			syncStoryAnchors(n)
		},
		removeStoryBranch(state, payload: { nodeId: string; branchId: string }) {
			const id = String(payload?.nodeId ?? '').trim()
			const branchId = String(payload?.branchId ?? '').trim()
			if (!id || !branchId) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'story' || !n.branches) return
			const anchorId = `out-${branchId}`
			for (const edgeId of state.edgeOrder.slice()) {
				const e = state.edgesById[edgeId]
				if (!e) continue
				if (e.fromNodeId === id && e.fromAnchorId === anchorId) {
					delete state.edgesById[edgeId]
				}
			}
			state.edgeOrder = state.edgeOrder.filter((edgeId) => !!state.edgesById[edgeId])
			n.branches = n.branches.filter((b) => b.id !== branchId)
			ensureStoryBranches(n)
			syncStoryAnchors(n)
		},
		updateStoryBranch(state, payload: { nodeId: string; branchId: string; text: string }) {
			const id = String(payload?.nodeId ?? '').trim()
			const branchId = String(payload?.branchId ?? '').trim()
			if (!id || !branchId) return
			const n = state.nodesById[id]
			if (!n || n.type !== 'story' || !n.branches) return
			const branch = n.branches.find((b) => b.id === branchId)
			if (!branch) return
			branch.text = String(payload?.text ?? '')
			syncStoryAnchors(n)
		},
		copyNode(state, payload: { nodeId: string }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const selected = state.selectedNodeIds.includes(id) ? state.selectedNodeIds : [id]
			const ids = normalizeNodeIds(state, selected)
			if (!ids.length) return
			if (ids.length === 1) {
				const n = state.nodesById[ids[0]]
				if (!n) return
				state.clipboardNode = { ...n, inputs: [...n.inputs], outputs: [...n.outputs] }
				state.clipboardNodes = null
				state.clipboardPrimaryNodeId = null
				return
			}
			state.clipboardNodes = ids
				.map((nid) => state.nodesById[nid])
				.filter(Boolean)
				.map((n) => ({ ...n, inputs: [...n.inputs], outputs: [...n.outputs] }))
			state.clipboardPrimaryNodeId = state.selectedNodeId && ids.includes(state.selectedNodeId)
				? state.selectedNodeId
				: ids[0]
			state.clipboardNode = null
		},
		pasteNode(state, payload: { worldX?: number; worldY?: number }) {
			if (Array.isArray(state.clipboardNodes) && state.clipboardNodes.length >= 2) {
				const srcNodes = state.clipboardNodes
				const primaryId = state.clipboardPrimaryNodeId
				const primary = (primaryId && srcNodes.find((n) => n.id === primaryId)) ?? srcNodes[0]
				if (!primary) return
				const dx = 20
				const dy = 20
				const targetX = payload?.worldX != null ? Number(payload.worldX) : primary.worldX + dx
				const targetY = payload?.worldY != null ? Number(payload.worldY) : primary.worldY + dy
				if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return
				const shiftX = targetX - primary.worldX
				const shiftY = targetY - primary.worldY

				const newIds: string[] = []
				for (const src of srcNodes) {
					const id = makeId('wf-node')
					const node: WorkflowNode = {
						...src,
						id,
						worldX: src.worldX + shiftX,
						worldY: src.worldY + shiftY,
						createdAt: Date.now(),
					}
					state.nodesById[id] = node
					state.nodeOrder.push(id)
					newIds.push(id)
				}
				state.selectedNodeIds = newIds
				state.selectedNodeId = newIds[0] ?? null
				state.selectedEdgeId = null
				return
			}

			const src = state.clipboardNode
			if (!src) return
			const id = makeId('wf-node')
			const dx = 20
			const dy = 20
			const nextX = payload?.worldX != null ? Number(payload.worldX) : src.worldX + dx
			const nextY = payload?.worldY != null ? Number(payload.worldY) : src.worldY + dy
			const node: WorkflowNode = {
				...src,
				id,
				alias: src.alias ? `${src.alias}` : src.alias,
				worldX: Number.isFinite(nextX) ? nextX : src.worldX + dx,
				worldY: Number.isFinite(nextY) ? nextY : src.worldY + dy,
				createdAt: Date.now(),
			}
			state.nodesById[id] = node
			state.nodeOrder.push(id)
			state.selectedNodeId = id
			state.selectedNodeIds = [id]
			state.selectedEdgeId = null
		},
		clearSelection(state) {
			state.selectedNodeId = null
			state.selectedNodeIds = []
			state.selectedEdgeId = null
		},
		moveSelectedNodesByDelta(state, payload: { dx?: number; dy?: number }) {
			const dx = payload?.dx != null ? Number(payload.dx) : 0
			const dy = payload?.dy != null ? Number(payload.dy) : 0
			if (!Number.isFinite(dx) && !Number.isFinite(dy)) return
			const moveX = Number.isFinite(dx) ? dx : 0
			const moveY = Number.isFinite(dy) ? dy : 0
			const ids = normalizeNodeIds(state, state.selectedNodeIds)
			if (!ids.length) return
			for (const id of ids) {
				const n = state.nodesById[id]
				if (!n) continue
				n.worldX += moveX
				n.worldY += moveY
			}
		},
		removeSelectedNodes(state) {
			const ids = normalizeNodeIds(state, state.selectedNodeIds)
			if (!ids.length) return
			for (const id of ids) {
				delete state.nodesById[id]
			}
			state.nodeOrder = state.nodeOrder.filter((x) => !!state.nodesById[x])
			for (const edgeId of state.edgeOrder.slice()) {
				const e = state.edgesById[edgeId]
				if (!e) continue
				if (!state.nodesById[e.fromNodeId] || !state.nodesById[e.toNodeId]) {
					delete state.edgesById[edgeId]
				}
			}
			state.edgeOrder = state.edgeOrder.filter((edgeId) => !!state.edgesById[edgeId])
			state.selectedNodeId = state.nodeOrder[0] ?? null
			state.selectedNodeIds = state.selectedNodeId ? [state.selectedNodeId] : []
			if (state.selectedEdgeId && !state.edgesById[state.selectedEdgeId]) state.selectedEdgeId = null
		},
		upsertNode(state, payload: { node: WorkflowNode }) {
			const n = payload?.node
			if (!n || typeof n !== 'object') return
			const id = String((n as any).id ?? '').trim()
			if (!id) return
			const prev = state.nodesById[id]
			state.nodesById[id] = {
				...(prev ?? {}),
				...n,
				id,
				worldX: Number.isFinite(Number((n as any).worldX)) ? Number((n as any).worldX) : Number((prev as any)?.worldX ?? 0),
				worldY: Number.isFinite(Number((n as any).worldY)) ? Number((n as any).worldY) : Number((prev as any)?.worldY ?? 0),
				inputs: Array.isArray((n as any).inputs) ? ((n as any).inputs as any) : (prev?.inputs ?? []),
				outputs: Array.isArray((n as any).outputs) ? ((n as any).outputs as any) : (prev?.outputs ?? []),
				createdAt: Number.isFinite(Number((n as any).createdAt)) ? Number((n as any).createdAt) : (prev?.createdAt ?? Date.now()),
			}
			const next = state.nodesById[id]
			if (next.type === 'story') syncStoryAnchors(next)
			if (!state.nodeOrder.includes(id)) state.nodeOrder.push(id)
		},
		addNodeAt(state, payload: { worldX: number; worldY: number; title?: string }) {
			const id = makeId('wf-node')
			const title = String(payload?.title ?? '工作流节点')
			const node: WorkflowNode = {
				id,
				type: 'base',
				title,
				alias: defaultAliasForType('base'),
				subtitle: '入口参数 / 出口结果',
				worldX: Number(payload?.worldX ?? 0) || 0,
				worldY: Number(payload?.worldY ?? 0) || 0,
				width: 240,
				height: 160,
				sizeCustomized: false,
				resourceId: null,
				inputs: [{ id: 'in-0', label: '入口' }],
				outputs: [{ id: 'out-0', label: '出口' }],
				createdAt: Date.now(),
			}
			state.nodesById[id] = node
			state.nodeOrder.push(id)
			state.selectedNodeId = id
			state.selectedEdgeId = null
		},
		setNodePosition(state, payload: { nodeId: string; worldX?: number; worldY?: number }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			const n = state.nodesById[id]
			if (!n) return
			if (payload.worldX != null) {
				const x = Number(payload.worldX)
				if (Number.isFinite(x)) n.worldX = x
			}
			if (payload.worldY != null) {
				const y = Number(payload.worldY)
				if (Number.isFinite(y)) n.worldY = y
			}
		},
		removeNode(state, payload: { nodeId: string }) {
			const id = String(payload?.nodeId ?? '').trim()
			if (!id) return
			delete state.nodesById[id]
			state.nodeOrder = state.nodeOrder.filter((x) => x !== id)
			// 清理关联连线
			for (const edgeId of state.edgeOrder.slice()) {
				const e = state.edgesById[edgeId]
				if (!e) continue
				if (e.fromNodeId === id || e.toNodeId === id) {
					delete state.edgesById[edgeId]
				}
			}
			state.edgeOrder = state.edgeOrder.filter((edgeId) => !!state.edgesById[edgeId])
			state.selectedNodeIds = state.selectedNodeIds.filter((x) => x !== id)
			if (state.selectedNodeId === id) state.selectedNodeId = state.nodeOrder[0] ?? null
			if (state.selectedNodeId && !state.selectedNodeIds.includes(state.selectedNodeId)) {
				state.selectedNodeIds = [state.selectedNodeId]
			}
		},
		addEdge(state, payload: { fromNodeId: string; fromAnchorId: string; toNodeId: string; toAnchorId: string }) {
			const fromNodeId = String(payload?.fromNodeId ?? '').trim()
			const toNodeId = String(payload?.toNodeId ?? '').trim()
			if (!fromNodeId || !toNodeId) return
			if (!state.nodesById[fromNodeId] || !state.nodesById[toNodeId]) return
			const id = makeId('wf-edge')
			const edge: WorkflowEdge = {
				id,
				fromNodeId,
				fromAnchorId: String(payload?.fromAnchorId ?? 'out-0'),
				toNodeId,
				toAnchorId: String(payload?.toAnchorId ?? 'in-0'),
				createdAt: Date.now(),
			}
			state.edgesById[id] = edge
			state.edgeOrder.push(id)
			state.selectedEdgeId = id
			state.selectedNodeId = null
			state.selectedNodeIds = []
		},
		removeEdge(state, payload: { edgeId: string }) {
			const id = String(payload?.edgeId ?? '').trim()
			if (!id) return
			delete state.edgesById[id]
			state.edgeOrder = state.edgeOrder.filter((x) => x !== id)
			if (state.selectedEdgeId === id) state.selectedEdgeId = null
		},
		removeEdgesFromAnchor(state, payload: { nodeId: string; anchorId: string }) {
			const nodeId = String(payload?.nodeId ?? '').trim()
			const anchorId = String(payload?.anchorId ?? '').trim()
			if (!nodeId || !anchorId) return
			for (const edgeId of state.edgeOrder.slice()) {
				const e = state.edgesById[edgeId]
				if (!e) continue
				if (e.fromNodeId === nodeId && e.fromAnchorId === anchorId) {
					delete state.edgesById[edgeId]
				}
			}
			state.edgeOrder = state.edgeOrder.filter((edgeId) => !!state.edgesById[edgeId])
			if (state.selectedEdgeId && !state.edgesById[state.selectedEdgeId]) state.selectedEdgeId = null
		},
	},
	actions: {
		setChatDraft({ commit }, payload: { text: string }) {
			commit('setChatDraft', payload)
		},
		resetViewport({ commit }) {
			commit('resetViewport')
		},
		setViewport({ commit }, payload: Partial<WorkflowViewport>) {
			commit('setViewport', payload)
		},
		upsertNode({ commit }, payload: { node: WorkflowNode }) {
			commit('upsertNode', payload)
		},
		addNodeAt({ commit }, payload: { worldX: number; worldY: number; title?: string }) {
			commit('addNodeAt', payload)
		},
		setNodePosition({ commit }, payload: { nodeId: string; worldX?: number; worldY?: number }) {
			commit('setNodePosition', payload)
		},
		removeNode({ commit }, payload: { nodeId: string }) {
			commit('removeNode', payload)
		},
		setSelectedNode({ commit }, payload: { nodeId: string | null }) {
			commit('setSelectedNode', payload)
		},
		setSelectedEdge({ commit }, payload: { edgeId: string | null }) {
			commit('setSelectedEdge', payload)
		},
		addEdge(
			{ commit },
			payload: { fromNodeId: string; fromAnchorId: string; toNodeId: string; toAnchorId: string }
		) {
			commit('addEdge', payload)
		},
		removeEdge({ commit }, payload: { edgeId: string }) {
			commit('removeEdge', payload)
		},
	},
})
