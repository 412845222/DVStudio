import JSZip from 'jszip'
import type { WorkflowState } from '../types'
import type { WorkflowNode, WorkflowEdge } from '../types'
import type { WorkflowResource } from '../resource/types'
import type { AIWorkflowDraftSnapshot } from '../persistence/blueprintSnapshot'
import { AIWF_BLUEPRINT_SNAPSHOT_SCHEMA_VERSION } from '../persistence/blueprintSnapshot'
import { resolveBackendUrl } from '../../network/backendConfig'
import type {
	AIWorkflowProjectPackageV1,
	AIWorkflowProjectPackageAssetEntry,
	AIWorkflowProjectPackageAssetKind
} from '../../views/AIWorkflow/node-business/project/projectPackage'
import {
	AIWF_PROJECT_PACKAGE_ENTRY,
	cloneBlueprintSnapshotForPackaging,
	collectPackageReferencedResourceIds,
	collectPackageNodeAssetCandidates,
	fetchAssetBlobForPackage,
	guessAssetExtension,
	inferPackageAssetKind,
	sanitizeFileNamePart,
	setValueByJsonPointer,
	cleanupPackagedAssetUrl
} from '../../views/AIWorkflow/node-business/project/projectPackage'

const makeId = (prefix: string) => {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function deepClone<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj)) as T
}

export interface NodeBounds {
	minX: number
	minY: number
	maxX: number
	maxY: number
	width: number
	height: number
	centerX: number
	centerY: number
}

export interface TemplateMergeResult {
	nodes: WorkflowNode[]
	edges: WorkflowEdge[]
	resources: WorkflowResource[]
	nodeIdMap: Map<string, string>
	resourceIdMap: Map<string, string>
	bounds: NodeBounds
}

export interface TemplateMergeOptions {
	viewportCenter: { x: number; y: number }
	existingNodeIds: Set<string>
	existingResourceIds: Set<string>
	placementOffset?: { x: number; y: number }
}

export interface PlacementResult {
	offsetX: number
	offsetY: number
	needsPan: boolean
	targetPanX: number
	targetPanY: number
	needsZoomOut: boolean
	targetZoom: number
	boundsAfterPlacement: NodeBounds
}

export function calculateNodeBounds(nodeIds: string[], nodesById: Record<string, WorkflowNode>): NodeBounds | null {
	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	let found = false
	for (const id of nodeIds) {
		const node = nodesById[id]
		if (!node) continue
		found = true
		const halfW = (node.width || 240) / 2
		const halfH = (node.height || 160) / 2
		minX = Math.min(minX, node.worldX - halfW)
		minY = Math.min(minY, node.worldY - halfH)
		maxX = Math.max(maxX, node.worldX + halfW)
		maxY = Math.max(maxY, node.worldY + halfH)
	}
	if (!found) return null
	return {
		minX, minY, maxX, maxY,
		width: maxX - minX,
		height: maxY - minY,
		centerX: (minX + maxX) / 2,
		centerY: (minY + maxY) / 2
	}
}

export function calculateTemplatePlacement(
	templateBounds: NodeBounds,
	viewport: { zoom: number; panX: number; panY: number },
	canvasSize: { width: number; height: number },
	existingNodes: WorkflowNode[]
): PlacementResult {
	const margin = 80
	const stepDistance = 120
	const maxSearchSteps = 20

	const visibleW = canvasSize.width / viewport.zoom
	const visibleH = canvasSize.height / viewport.zoom

	const viewCenterWorldX = -viewport.panX / viewport.zoom
	const viewCenterWorldY = -viewport.panY / viewport.zoom

	let needsZoomOut = false
	let targetZoom = viewport.zoom
	if (templateBounds.width * 1.2 > visibleW || templateBounds.height * 1.2 > visibleH) {
		needsZoomOut = true
		const scaleX = visibleW / (templateBounds.width * 1.3)
		const scaleY = visibleH / (templateBounds.height * 1.3)
		targetZoom = Math.min(viewport.zoom, Math.min(scaleX, scaleY) * viewport.zoom)
		targetZoom = Math.max(0.15, Math.min(targetZoom, 2))
	}

	const effVisibleW = canvasSize.width / targetZoom
	const effVisibleH = canvasSize.height / targetZoom

	function rectsOverlap(
		ax: number, ay: number, aw: number, ah: number,
		bx: number, by: number, bw: number, bh: number
	): boolean {
		return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
	}

	function checkOverlapAt(cx: number, cy: number): boolean {
		const placedMinX = cx - templateBounds.width / 2 - margin / 2
		const placedMinY = cy - templateBounds.height / 2 - margin / 2
		const placedW = templateBounds.width + margin
		const placedH = templateBounds.height + margin
		for (const node of existingNodes) {
			const nodeHalfW = (node.width || 240) / 2
			const nodeHalfH = (node.height || 160) / 2
			if (rectsOverlap(
				placedMinX, placedMinY, placedW, placedH,
				node.worldX - nodeHalfW, node.worldY - nodeHalfH, node.width || 240, node.height || 160
			)) {
				return true
			}
		}
		return false
	}

	function isVisibleAt(cx: number, cy: number): boolean {
		const placedMinX = cx - templateBounds.width / 2
		const placedMinY = cy - templateBounds.height / 2
		const effVCx = needsZoomOut ? cx : viewCenterWorldX
		const effVCy = needsZoomOut ? cy : viewCenterWorldY
		const vL = effVCx - effVisibleW / 2
		const vT = effVCy - effVisibleH / 2
		return placedMinX >= vL - 50 && placedMinY >= vT - 50 &&
			placedMinX + templateBounds.width <= vL + effVisibleW + 50 &&
			placedMinY + templateBounds.height <= vT + effVisibleH + 50
	}

	let bestCX = viewCenterWorldX
	let bestCY = viewCenterWorldY
	let hasOverlap = checkOverlapAt(bestCX, bestCY)

	if (hasOverlap || !isVisibleAt(bestCX, bestCY)) {
		const directions = [
			{ dx: 1, dy: 0 },
			{ dx: 0, dy: 1 },
			{ dx: -1, dy: 0 },
			{ dx: 0, dy: -1 },
			{ dx: 1, dy: 1 },
			{ dx: -1, dy: 1 },
		]
		let found = false
		for (let step = 1; step <= maxSearchSteps && !found; step++) {
			for (const dir of directions) {
				const cx = viewCenterWorldX + dir.dx * stepDistance * step
				const cy = viewCenterWorldY + dir.dy * stepDistance * step
				if (!checkOverlapAt(cx, cy)) {
					bestCX = cx
					bestCY = cy
					found = true
					break
				}
			}
		}
		if (!found) {
			bestCX = viewCenterWorldX + Math.max(effVisibleW, effVisibleH) * 0.6
			bestCY = viewCenterWorldY + Math.max(effVisibleW, effVisibleH) * 0.3
		}
	}

	const offsetX = bestCX - templateBounds.centerX
	const offsetY = bestCY - templateBounds.centerY

	const boundsAfterPlacement: NodeBounds = {
		minX: templateBounds.minX + offsetX,
		minY: templateBounds.minY + offsetY,
		maxX: templateBounds.maxX + offsetX,
		maxY: templateBounds.maxY + offsetY,
		width: templateBounds.width,
		height: templateBounds.height,
		centerX: bestCX,
		centerY: bestCY
	}

	const targetPanX = -bestCX * targetZoom
	const targetPanY = -bestCY * targetZoom
	const needsPan = Math.abs(targetPanX - viewport.panX) > 15 || Math.abs(targetPanY - viewport.panY) > 15

	return {
		offsetX,
		offsetY,
		needsPan,
		targetPanX,
		targetPanY,
		needsZoomOut,
		targetZoom,
		boundsAfterPlacement
	}
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
		const halfW = (node.width || 240) / 2
		const halfH = (node.height || 160) / 2
		minX = Math.min(minX, node.worldX - halfW)
		minY = Math.min(minY, node.worldY - halfH)
		maxX = Math.max(maxX, node.worldX + halfW)
		maxY = Math.max(maxY, node.worldY + halfH)
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
		const halfW = (node.width || 240) / 2
		const halfH = (node.height || 160) / 2
		minX = Math.min(minX, node.worldX - halfW)
		minY = Math.min(minY, node.worldY - halfH)
		maxX = Math.max(maxX, node.worldX + halfW)
		maxY = Math.max(maxY, node.worldY + halfH)
	}

	const templateBounds: NodeBounds = {
		minX, minY, maxX, maxY,
		width: maxX - minX,
		height: maxY - minY,
		centerX: (minX + maxX) / 2,
		centerY: (minY + maxY) / 2
	}

	let offsetX: number
	let offsetY: number
	if (options.placementOffset) {
		offsetX = options.placementOffset.x
		offsetY = options.placementOffset.y
	} else {
		offsetX = options.viewportCenter.x - templateBounds.centerX
		offsetY = options.viewportCenter.y - templateBounds.centerY
	}

	const boundsAfterPlacement: NodeBounds = {
		minX: minX + offsetX,
		minY: minY + offsetY,
		maxX: maxX + offsetX,
		maxY: maxY + offsetY,
		width: templateBounds.width,
		height: templateBounds.height,
		centerX: templateBounds.centerX + offsetX,
		centerY: templateBounds.centerY + offsetY
	}

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

	return { nodes, edges, resources, nodeIdMap, resourceIdMap, bounds: boundsAfterPlacement }
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

export const AIWF_TEMPLATE_COVER_ENTRY = 'cover.png'

export function generateTemplateCode(): string {
	const ts = Date.now().toString(36)
	const rand = Math.random().toString(36).slice(2, 8)
	return `tpl_${ts}_${rand}`
}

export interface TemplatePackProgress {
	percent: number
	stage: 'collecting' | 'fetching' | 'packaging' | 'compressing'
	detail?: string
}

export async function createTemplatePackageZip(
	snapshot: AIWorkflowDraftSnapshot,
	templateName: string,
	coverBlob?: Blob | null,
	templateCode?: string,
	onProgress?: (progress: TemplatePackProgress) => void
): Promise<Blob> {
	const reportProgress = (percent: number, stage: TemplatePackProgress['stage'], detail?: string) => {
		if (onProgress) {
			onProgress({ percent: Math.min(100, Math.max(0, Math.round(percent))), stage, detail })
		}
	}

	reportProgress(2, 'collecting')
	const cleanedSnapshot = cloneBlueprintSnapshotForPackaging(snapshot)
	const code = templateCode || generateTemplateCode()

	const zip = new JSZip()
	const assets: AIWorkflowProjectPackageAssetEntry[] = []
	let skipped = 0

	const referencedResourceIds = Array.from(collectPackageReferencedResourceIds(cleanedSnapshot))
	const deepSnapshotAssetCandidates = collectPackageNodeAssetCandidates(cleanedSnapshot)
	const cachedByUrl = new Map<
		string,
		{ filePath: string; blob: Blob; kind: AIWorkflowProjectPackageAssetKind }
	>()

	const totalAssets = referencedResourceIds.length * 2 + deepSnapshotAssetCandidates.length
	let processedAssets = 0

	reportProgress(8, 'fetching')
	for (const rid of referencedResourceIds) {
		const resource = cleanedSnapshot.resourcesById[rid]
		if (!resource) continue
		const kind: AIWorkflowProjectPackageAssetKind =
			resource.kind === 'video' ? 'video' : resource.kind === 'image' ? 'image' : 'file'

		const targets: Array<'url' | 'posterUrl'> = ['url', 'posterUrl']
		for (const target of targets) {
			const currentUrl = cleanupPackagedAssetUrl(
				(resource as unknown as Record<string, unknown>)[target]
			)
			if (!currentUrl || currentUrl.startsWith('package://')) {
				processedAssets++
				if (totalAssets > 0) {
					reportProgress(8 + (processedAssets / totalAssets) * 65, 'fetching')
				}
				continue
			}

			const blob = await fetchAssetBlobForPackage(currentUrl, resolveBackendUrl)
			processedAssets++
			if (!blob) {
				skipped += 1
				if (totalAssets > 0) {
					reportProgress(8 + (processedAssets / totalAssets) * 65, 'fetching')
				}
				continue
			}

			const ext = guessAssetExtension(
				currentUrl,
				blob.type,
				kind === 'image' ? 'png' : kind === 'video' ? 'mp4' : 'bin'
			)
			const filePath = `assets/${sanitizeFileNamePart(rid)}-${target}.${ext}`
			zip.file(filePath, blob)
			cachedByUrl.set(currentUrl, { filePath, blob, kind })

			assets.push({
				resourceId: rid,
				target,
				filePath,
				kind,
				name: String(resource.name || rid),
				mimeType: String(blob.type || ''),
				size: Number(blob.size || 0)
			})
			;(resource as unknown as Record<string, string>)[target] = `package://${filePath}`

			if (totalAssets > 0) {
				reportProgress(8 + (processedAssets / totalAssets) * 65, 'fetching')
			}
		}

		resource.sourcePath = undefined
		resource.posterSourcePath = undefined
		resource.localFileKey = undefined
		if ('projectRelativePath' in resource) {
			;(resource as unknown as Record<string, unknown>).projectRelativePath = undefined
		}
	}

	let snapshotAssetIndex = 0
	for (const item of deepSnapshotAssetCandidates) {
		const cleanUrl = cleanupPackagedAssetUrl(item.url)
		if (!cleanUrl || cleanUrl.startsWith('package://')) {
			processedAssets++
			if (totalAssets > 0) {
				reportProgress(8 + (processedAssets / totalAssets) * 65, 'fetching')
			}
			continue
		}

		let cached = cachedByUrl.get(cleanUrl)
		if (!cached) {
			const blob = await fetchAssetBlobForPackage(cleanUrl, resolveBackendUrl)
			processedAssets++
			if (!blob) {
				skipped += 1
				if (totalAssets > 0) {
					reportProgress(8 + (processedAssets / totalAssets) * 65, 'fetching')
				}
				continue
			}
			const guessedKind = item.kind || inferPackageAssetKind(cleanUrl, blob.type)
			const ext = guessAssetExtension(
				cleanUrl,
				blob.type,
				guessedKind === 'video' ? 'mp4' : guessedKind === 'image' ? 'png' : 'bin'
			)
			const filePath = `assets/snapshot-${snapshotAssetIndex}.${ext}`
			snapshotAssetIndex += 1
			zip.file(filePath, blob)
			cached = { filePath, blob, kind: guessedKind }
			cachedByUrl.set(cleanUrl, cached)
		} else {
			processedAssets++
		}

		setValueByJsonPointer(
			cleanedSnapshot as unknown as Record<string, unknown>,
			item.pointer,
			`package://${cached.filePath}`
		)
		assets.push({
			target: 'snapshotField',
			filePath: cached.filePath,
			kind: cached.kind,
			name: item.name,
			mimeType: String(cached.blob.type || ''),
			size: Number(cached.blob.size || 0),
			snapshotPointer: item.pointer
		})

		if (totalAssets > 0) {
			reportProgress(8 + (processedAssets / totalAssets) * 65, 'fetching')
		}
	}

	reportProgress(78, 'packaging')
	const pkg: AIWorkflowProjectPackageV1 = {
		schemaVersion: 1,
		kind: 'aiwf-project-package',
		exportedAt: Date.now(),
		projectName: templateName,
		snapshot: cleanedSnapshot,
		assets,
		templateCode: code
	}

	zip.file(AIWF_PROJECT_PACKAGE_ENTRY, JSON.stringify(pkg, null, 2))
	if (coverBlob) {
		zip.file(AIWF_TEMPLATE_COVER_ENTRY, await coverBlob.arrayBuffer())
	}

	reportProgress(85, 'compressing')
	return zip.generateAsync({
		type: 'blob',
		compression: 'DEFLATE',
		compressionOptions: { level: 6 }
	}, (metadata) => {
		if (onProgress) {
			const zipPercent = metadata.percent || 0
			reportProgress(85 + zipPercent * 0.15, 'compressing')
		}
	})
}

export interface ParsedTemplatePackage {
	snapshot: AIWorkflowDraftSnapshot | null
	coverBlob: Blob | null
	templateCode: string
	assets: AIWorkflowProjectPackageAssetEntry[]
	zip: JSZip | null
}

export async function parseTemplatePackageBlob(blob: Blob): Promise<ParsedTemplatePackage> {
	try {
		const zip = await JSZip.loadAsync(await blob.arrayBuffer())
		const packageFile = zip.file(AIWF_PROJECT_PACKAGE_ENTRY)
		if (!packageFile) return { snapshot: null, coverBlob: null, templateCode: '', assets: [], zip: null }

		const raw = await packageFile.async('text')
		const parsed = JSON.parse(raw) as AIWorkflowProjectPackageV1
		if (!parsed || parsed.schemaVersion !== 1 || parsed.kind !== 'aiwf-project-package') {
			return { snapshot: null, coverBlob: null, templateCode: '', assets: [], zip: null }
		}

		let coverBlob: Blob | null = null
		const coverFile = zip.file(AIWF_TEMPLATE_COVER_ENTRY)
		if (coverFile) {
			const coverBuffer = await coverFile.async('arraybuffer')
			coverBlob = new Blob([coverBuffer], { type: 'image/png' })
		}

		return {
			snapshot: parsed.snapshot,
			coverBlob,
			templateCode: String(parsed.templateCode || ''),
			assets: Array.isArray(parsed.assets) ? parsed.assets : [],
			zip
		}
	} catch {
		return { snapshot: null, coverBlob: null, templateCode: '', assets: [], zip: null }
	}
}

export interface TemplateAssetImportResult {
	/** Map from asset filePath (in zip) -> imported local dweb:// URL */
	fileUrlMap: Map<string, string>
	/** Map from asset filePath -> relativePath in project */
	filePathMap: Map<string, string>
	/** Map from asset filePath -> absolutePath in project */
	fileAbsPathMap: Map<string, string>
	/** Missing assets that failed to import */
	missing: string[]
}

export interface ImportAssetFromBufferFn {
	(projectId: number, buffer: ArrayBuffer, fileName: string, mimeType?: string, subPath?: string, bucket?: string): Promise<{ url: string; relativePath: string; absolutePath?: string } | null>
}

export async function importTemplateAssetsToProject(
	parsed: ParsedTemplatePackage,
	projectId: number,
	importAssetFromBuffer: ImportAssetFromBufferFn
): Promise<TemplateAssetImportResult> {
	const fileUrlMap = new Map<string, string>()
	const filePathMap = new Map<string, string>()
	const fileAbsPathMap = new Map<string, string>()
	const missing: string[] = []

	if (!parsed.zip || !parsed.snapshot) {
		return { fileUrlMap, filePathMap, fileAbsPathMap, missing }
	}

	const subDir = parsed.templateCode ? `template/${parsed.templateCode}` : undefined

	for (const asset of parsed.assets) {
		const filePath = String(asset?.filePath || '').trim()
		if (!filePath) continue

		const zf = parsed.zip.file(filePath)
		if (!zf) {
			missing.push(filePath)
			continue
		}

		try {
			const blob = await zf.async('blob')
			const arrayBuffer = await blob.arrayBuffer()
			const assetFileName = filePath.startsWith('assets/') ? filePath.slice(7) : filePath
			const bucket = 'assets'
			const imported = await importAssetFromBuffer(
				projectId,
				arrayBuffer,
				assetFileName,
				blob.type || asset.mimeType,
				subDir,
				bucket
			)

			if (imported?.url) {
				fileUrlMap.set(filePath, imported.url)
				if (imported.relativePath) {
					filePathMap.set(filePath, imported.relativePath)
				}
				if (imported.absolutePath) {
					fileAbsPathMap.set(filePath, imported.absolutePath)
				}
			} else {
				missing.push(filePath)
			}
		} catch {
			missing.push(filePath)
		}
	}

	return { fileUrlMap, filePathMap, fileAbsPathMap, missing }
}

export function remapTemplateAssetUrls(
	snapshot: AIWorkflowDraftSnapshot,
	assets: AIWorkflowProjectPackageAssetEntry[],
	fileUrlMap: Map<string, string>,
	filePathMap: Map<string, string>,
	fileAbsPathMap?: Map<string, string>
): void {
	for (const asset of assets) {
		const filePath = String(asset?.filePath || '').trim()
		if (!filePath) continue

		const resolvedUrl = fileUrlMap.get(filePath)
		if (!resolvedUrl) continue

		if (asset.target === 'snapshotField' && asset.snapshotPointer) {
			setValueByJsonPointer(
				snapshot as unknown as Record<string, unknown>,
				asset.snapshotPointer,
				resolvedUrl
			)
		} else if (asset.resourceId) {
			const resource = snapshot.resourcesById?.[asset.resourceId]
			if (resource) {
				if (asset.target === 'url' || asset.target === 'posterUrl') {
					(resource as unknown as Record<string, string>)[asset.target] = resolvedUrl
				}
				const relPath = filePathMap.get(filePath)
				const absPath = fileAbsPathMap?.get(filePath)
				const sourceForOpen = absPath || relPath
				if (relPath) {
					if (asset.target === 'url') {
						resource.sourcePath = sourceForOpen
						resource.projectRelativePath = relPath
					} else if (asset.target === 'posterUrl') {
						resource.posterSourcePath = sourceForOpen
					}
				}
				resource.localFileKey = undefined
			}
		}
	}
}

export function getViewportCenterInWorld(
	viewport: { zoom: number; panX: number; panY: number },
	_canvasWidth: number,
	_canvasHeight: number
): { x: number; y: number } {
	return {
		x: -viewport.panX / viewport.zoom,
		y: -viewport.panY / viewport.zoom
	}
}

export interface NodeScreenshotLike {
	nodeId: string
	dataUrl: string
	width: number
	height: number
	padding?: number
}

export const TEMPLATE_COVER_WIDTH = 480
export const TEMPLATE_COVER_HEIGHT = 270
export const TEMPLATE_COVER_PADDING_RATIO = 0.12

export async function captureNodesAsCoverBlob(
	nodeIds: string[],
	nodesById: Record<string, WorkflowNode>,
	screenshotMap: Map<string, NodeScreenshotLike>,
	bgColor?: string
): Promise<Blob | null> {
	const bounds = calculateNodeBounds(nodeIds, nodesById)
	if (!bounds) return null

	const coverW = TEMPLATE_COVER_WIDTH
	const coverH = TEMPLATE_COVER_HEIGHT
	const padding = Math.min(coverW, coverH) * TEMPLATE_COVER_PADDING_RATIO
	const availableW = coverW - padding * 2
	const availableH = coverH - padding * 2

	const scaleX = availableW / bounds.width
	const scaleY = availableH / bounds.height
	const scale = Math.min(scaleX, scaleY, 2)

	const canvas = document.createElement('canvas')
	canvas.width = coverW
	canvas.height = coverH
	const ctx = canvas.getContext('2d')
	if (!ctx) return null

	if (bgColor) {
		ctx.fillStyle = bgColor
		ctx.fillRect(0, 0, coverW, coverH)
	}

	const contentW = bounds.width * scale
	const contentH = bounds.height * scale
	const offsetX = (coverW - contentW) / 2
	const offsetY = (coverH - contentH) / 2

	const loadImage = (url: string): Promise<HTMLImageElement | null> => {
		return new Promise((resolve) => {
			const img = new Image()
			img.onload = () => resolve(img)
			img.onerror = () => resolve(null)
			img.src = url
		})
	}

	const drawPromises: Promise<void>[] = []
	const sortedNodeIds = [...nodeIds]

	for (const nid of sortedNodeIds) {
		const node = nodesById[nid]
		if (!node) continue
		const entry = screenshotMap.get(nid)
		if (!entry?.dataUrl) continue

		drawPromises.push(
			loadImage(entry.dataUrl).then((img) => {
				if (!img) return
				const x = offsetX + (node.worldX - bounds.minX) * scale
				const y = offsetY + (node.worldY - bounds.minY) * scale
				const w = node.width * scale
				const h = node.height * scale
				const pad = (entry.padding ?? 0) * scale
				ctx.drawImage(img, x - pad, y - pad, w + pad * 2, h + pad * 2)
			})
		)
	}

	await Promise.all(drawPromises)

	return new Promise<Blob | null>((resolve) => {
		canvas.toBlob((blob) => resolve(blob), 'image/png', 0.9)
	})
}
