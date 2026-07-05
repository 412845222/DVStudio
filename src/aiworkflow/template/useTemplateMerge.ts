import JSZip from 'jszip'
import type { WorkflowState } from '../types'
import type { WorkflowNode, WorkflowEdge } from '../types'
import type { WorkflowResource } from '../resource/types'
import type { AIWorkflowDraftSnapshot } from '../persistence/blueprintSnapshot'
import { AIWF_BLUEPRINT_SNAPSHOT_SCHEMA_VERSION } from '../persistence/blueprintSnapshot'
import type { AIWorkflowProjectPackageV1 } from '../../views/AIWorkflow/node-business/project/projectPackage'
import { AIWF_PROJECT_PACKAGE_ENTRY, cloneBlueprintSnapshotForPackaging } from '../../views/AIWorkflow/node-business/project/projectPackage'

const makeId = (prefix: string) => {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function deepClone<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj)) as T
}

export interface TemplateMergeResult {
	nodes: WorkflowNode[]
	edges: WorkflowEdge[]
	resources: WorkflowResource[]
	nodeIdMap: Map<string, string>
	resourceIdMap: Map<string, string>
}

export interface TemplateMergeOptions {
	viewportCenter: { x: number; y: number }
	existingNodeIds: Set<string>
	existingResourceIds: Set<string>
}

export function buildSnapshotFromSelection(
	state: Pick<WorkflowState, 'nodesById' | 'nodeOrder' | 'edgesById' | 'edgeOrder' | 'resourcesById' | 'resourceOrder' | 'viewport'>,
	selectedNodeIds: string[]
): AIWorkflowDraftSnapshot {
	const nodeIds = new Set(selectedNodeIds.filter((id) => state.nodesById[id]))

	const referencedResourceIds = new Set<string>()
	for (const nid of nodeIds) {
		const node = state.nodesById[nid]
		if (node.resourceId) {
			referencedResourceIds.add(node.resourceId)
		}
	}

	const nodeIdSet = new Set(nodeIds)
	const validEdges: WorkflowEdge[] = []
	for (const eid of state.edgeOrder) {
		const edge = state.edgesById[eid]
		if (!edge) continue
		if (nodeIdSet.has(edge.fromNodeId) && nodeIdSet.has(edge.toNodeId)) {
			validEdges.push(edge)
		}
	}

	const nodesById: Record<string, WorkflowNode> = {}
	const nodeOrder: string[] = []
	for (const nid of state.nodeOrder) {
		if (nodeIds.has(nid)) {
			nodesById[nid] = deepClone(state.nodesById[nid])
			nodeOrder.push(nid)
		}
	}

	const edgesById: Record<string, WorkflowEdge> = {}
	const edgeOrder: string[] = []
	for (const edge of validEdges) {
		edgesById[edge.id] = deepClone(edge)
		edgeOrder.push(edge.id)
	}

	const resourcesById: Record<string, WorkflowResource> = {}
	const resourceOrder: string[] = []
	for (const rid of state.resourceOrder) {
		if (referencedResourceIds.has(rid) && state.resourcesById[rid]) {
			resourcesById[rid] = deepClone(state.resourcesById[rid])
			resourceOrder.push(rid)
		}
	}

	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	for (const nid of nodeIds) {
		const node = state.nodesById[nid]
		minX = Math.min(minX, node.worldX)
		minY = Math.min(minY, node.worldY)
		maxX = Math.max(maxX, node.worldX + node.width)
		maxY = Math.max(maxY, node.worldY + node.height)
	}

	const centerX = (minX + maxX) / 2
	const centerY = (minY + maxY) / 2
	const offsetX = -centerX
	const offsetY = -centerY

	for (const nid of nodeOrder) {
		nodesById[nid].worldX += offsetX
		nodesById[nid].worldY += offsetY
	}

	return {
		schemaVersion: AIWF_BLUEPRINT_SNAPSHOT_SCHEMA_VERSION,
		savedAt: Date.now(),
		viewport: { zoom: 1, panX: 0, panY: 0 },
		nodesById,
		nodeOrder,
		edgesById,
		edgeOrder,
		resourcesById,
		resourceOrder,
		selectedNodeId: null,
		selectedNodeIds: []
	}
}

export function buildFullSnapshot(
	state: Pick<WorkflowState, 'nodesById' | 'nodeOrder' | 'edgesById' | 'edgeOrder' | 'resourcesById' | 'resourceOrder' | 'viewport' | 'selectedNodeId' | 'selectedNodeIds' | 'selectionTagsByKey' | 'savedSelectionFrames' | 'nodeCheckboxVisible'>
): AIWorkflowDraftSnapshot {
	const snapshot: AIWorkflowDraftSnapshot = {
		schemaVersion: AIWF_BLUEPRINT_SNAPSHOT_SCHEMA_VERSION,
		savedAt: Date.now(),
		viewport: deepClone(state.viewport),
		nodesById: deepClone(state.nodesById),
		nodeOrder: [...state.nodeOrder],
		edgesById: deepClone(state.edgesById),
		edgeOrder: [...state.edgeOrder],
		resourcesById: deepClone(state.resourcesById),
		resourceOrder: [...state.resourceOrder],
		selectedNodeId: state.selectedNodeId,
		selectedNodeIds: [...(state.selectedNodeIds || [])]
	}

	if (state.selectionTagsByKey && Object.keys(state.selectionTagsByKey).length) {
		snapshot.selectionTagsByKey = deepClone(state.selectionTagsByKey)
	}
	if (state.savedSelectionFrames && state.savedSelectionFrames.length) {
		snapshot.savedSelectionFrames = deepClone(state.savedSelectionFrames)
	}
	if (state.nodeCheckboxVisible !== undefined) {
		snapshot.nodeCheckboxVisible = state.nodeCheckboxVisible
	}

	return snapshot
}

export function mergeTemplateSnapshot(
	snapshot: AIWorkflowDraftSnapshot,
	options: TemplateMergeOptions
): TemplateMergeResult {
	const nodeIdMap = new Map<string, string>()
	const resourceIdMap = new Map<string, string>()

	const templateNodeIds = Array.isArray(snapshot.nodeOrder) ? snapshot.nodeOrder : Object.keys(snapshot.nodesById || {})
	const templateResourceIds = Array.isArray(snapshot.resourceOrder) ? snapshot.resourceOrder : Object.keys(snapshot.resourcesById || {})
	const templateEdgeIds = Array.isArray(snapshot.edgeOrder) ? snapshot.edgeOrder : Object.keys(snapshot.edgesById || {})

	for (const oldId of templateNodeIds) {
		if (!snapshot.nodesById[oldId]) continue
		let newId = makeId('wf-node')
		while (options.existingNodeIds.has(newId)) {
			newId = makeId('wf-node')
		}
		nodeIdMap.set(oldId, newId)
		options.existingNodeIds.add(newId)
	}

	for (const oldId of templateResourceIds) {
		if (!snapshot.resourcesById[oldId]) continue
		let newId = makeId('wf-res')
		while (options.existingResourceIds.has(newId)) {
			newId = makeId('wf-res')
		}
		resourceIdMap.set(oldId, newId)
		options.existingResourceIds.add(newId)
	}

	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	for (const oldId of templateNodeIds) {
		const node = snapshot.nodesById[oldId]
		if (!node) continue
		minX = Math.min(minX, node.worldX)
		minY = Math.min(minY, node.worldY)
		maxX = Math.max(maxX, node.worldX + node.width)
		maxY = Math.max(maxY, node.worldY + node.height)
	}

	const templateCenterX = (minX + maxX) / 2
	const templateCenterY = (minY + maxY) / 2
	const offsetX = options.viewportCenter.x - templateCenterX
	const offsetY = options.viewportCenter.y - templateCenterY

	const nodes: WorkflowNode[] = []
	for (const oldId of templateNodeIds) {
		const srcNode = snapshot.nodesById[oldId]
		if (!srcNode) continue
		const newId = nodeIdMap.get(oldId)!
		const newNode: WorkflowNode = {
			...deepClone(srcNode),
			id: newId,
			worldX: srcNode.worldX + offsetX,
			worldY: srcNode.worldY + offsetY,
			createdAt: Date.now()
		}

		if (newNode.resourceId && resourceIdMap.has(newNode.resourceId)) {
			newNode.resourceId = resourceIdMap.get(newNode.resourceId)!
		}

		remapGeneratedResourceIds(newNode, resourceIdMap)

		nodes.push(newNode)
	}

	const edges: WorkflowEdge[] = []
	for (const oldEdgeId of templateEdgeIds) {
		const srcEdge = snapshot.edgesById[oldEdgeId]
		if (!srcEdge) continue
		const newFromId = nodeIdMap.get(srcEdge.fromNodeId)
		const newToId = nodeIdMap.get(srcEdge.toNodeId)
		if (!newFromId || !newToId) continue
		const newEdge: WorkflowEdge = {
			...deepClone(srcEdge),
			id: makeId('wf-edge'),
			fromNodeId: newFromId,
			toNodeId: newToId,
			createdAt: Date.now()
		}
		edges.push(newEdge)
	}

	const resources: WorkflowResource[] = []
	for (const oldResId of templateResourceIds) {
		const srcRes = snapshot.resourcesById[oldResId]
		if (!srcRes) continue
		const newId = resourceIdMap.get(oldResId)!
		const newRes: WorkflowResource = {
			...deepClone(srcRes),
			id: newId,
			createdAt: Date.now()
		}
		resources.push(newRes)
	}

	return { nodes, edges, resources, nodeIdMap, resourceIdMap }
}

function remapGeneratedResourceIds(node: WorkflowNode, resourceIdMap: Map<string, string>) {
	if (node.type === 'scene-decompose' && node.sceneDecomposeSettings?.outputs) {
		for (const output of node.sceneDecomposeSettings.outputs) {
			if (output.generatedResourceId && resourceIdMap.has(output.generatedResourceId)) {
				output.generatedResourceId = resourceIdMap.get(output.generatedResourceId)!
			}
		}
	}
}

export async function createTemplatePackageZip(
	snapshot: AIWorkflowDraftSnapshot,
	templateName: string
): Promise<Blob> {
	const cleanedSnapshot = cloneBlueprintSnapshotForPackaging(snapshot)
	const pkg: AIWorkflowProjectPackageV1 = {
		schemaVersion: 1,
		kind: 'aiwf-project-package',
		exportedAt: Date.now(),
		projectName: templateName,
		snapshot: cleanedSnapshot,
		assets: []
	}

	const zip = new JSZip()
	zip.file(AIWF_PROJECT_PACKAGE_ENTRY, JSON.stringify(pkg, null, 2))
	return zip.generateAsync({
		type: 'blob',
		compression: 'DEFLATE',
		compressionOptions: { level: 6 }
	})
}

export async function parseTemplatePackageBlob(blob: Blob): Promise<AIWorkflowDraftSnapshot | null> {
	try {
		const zip = await JSZip.loadAsync(await blob.arrayBuffer())
		const packageFile = zip.file(AIWF_PROJECT_PACKAGE_ENTRY)
		if (!packageFile) return null

		const raw = await packageFile.async('text')
		const parsed = JSON.parse(raw) as AIWorkflowProjectPackageV1
		if (!parsed || parsed.schemaVersion !== 1 || parsed.kind !== 'aiwf-project-package') {
			return null
		}
		return parsed.snapshot
	} catch {
		return null
	}
}

export function getViewportCenterInWorld(
	viewport: { zoom: number; panX: number; panY: number },
	canvasWidth: number,
	canvasHeight: number
): { x: number; y: number } {
	const screenCenterX = canvasWidth / 2
	const screenCenterY = canvasHeight / 2
	return {
		x: (screenCenterX - viewport.panX) / viewport.zoom,
		y: (screenCenterY - viewport.panY) / viewport.zoom
	}
}
