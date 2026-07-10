import type { Store } from 'vuex'
import type { WorkflowState, WorkflowNode } from '../../../../aiworkflow/types'

/**
 * Blender 节点上游输入聚合（设计文档 §4.3 / §4.4）。
 *
 * 遍历 `in-0` 锚点的全部入边（兼容旧锚点 `in-model`），按上游产物媒体类型
 * 聚合为 text / image / model3d 三组，供两处共用：
 * 1. 对话提交时构建 BlenderAgentContext（useBlenderAgentChat）
 * 2. 节点底部对话框的参考图回显（BlenderUpstreamRefsPanel）
 */

export type BlenderUpstreamText = {
	sourceNodeId: string
	sourceAlias: string
	text: string
}

export type BlenderUpstreamImage = {
	sourceNodeId: string
	sourceAlias: string
	/** 可直接用于 <img> 展示的 URL（dweb:// 或 http(s)） */
	url: string
	resourceId?: string
}

export type BlenderUpstreamModel = {
	sourceNodeId: string
	sourceAlias: string
	/** 本机文件绝对路径（供 blender_import_model 使用） */
	filePath: string
	format: string
}

export type BlenderUpstreamInputs = {
	texts: BlenderUpstreamText[]
	images: BlenderUpstreamImage[]
	models: BlenderUpstreamModel[]
}

const MODEL_EXTS = ['.glb', '.gltf', '.fbx', '.obj', '.stl', '.dae', '.usd', '.usdz', '.blend']

const nodeAlias = (node: WorkflowNode): string =>
	String((node as { alias?: string }).alias || node.title || node.type || '').trim()

const detectModelFormat = (filePath: string): string => {
	const lower = filePath.toLowerCase()
	for (const ext of MODEL_EXTS) {
		if (lower.endsWith(ext)) return ext.slice(1)
	}
	return ''
}

const resolveProjectPath = (store: Store<WorkflowState>, relPath: string): string => {
	const projectRoot = (store.state as { projectRootPath?: string }).projectRootPath
	if (!projectRoot) return ''
	const normalizedRoot = String(projectRoot).replace(/[/\\]+$/, '')
	const normalizedRel = String(relPath).replace(/^[/\\]+/, '')
	return `${normalizedRoot}/${normalizedRel}`
}

/** 从上游节点解析文本产物 */
const resolveUpstreamText = (node: WorkflowNode): string => {
	const direct = String((node as { textValue?: string }).textValue ?? '').trim()
	if (direct) return direct
	// scene-* 类节点：常见 JSON/文本输出字段
	const sceneUnderstanding = (node as { sceneUnderstandingSettings?: Record<string, unknown> })
		.sceneUnderstandingSettings
	if (sceneUnderstanding) {
		const out = String(
			(sceneUnderstanding.lastResultText as string) ??
				(sceneUnderstanding.resultJson as string) ??
				''
		).trim()
		if (out) return out
	}
	const sceneLayout = (node as { sceneLayoutSettings?: Record<string, unknown> })
		.sceneLayoutSettings
	if (sceneLayout) {
		const out = String((sceneLayout.layoutJson as string) ?? '').trim()
		if (out) return out
	}
	return ''
}

/** 从上游节点解析图片产物 URL */
const resolveUpstreamImageUrl = (
	store: Store<WorkflowState>,
	node: WorkflowNode
): { url: string; resourceId?: string } => {
	const state = store.state
	const resourceRid = String((node as { resourceId?: string }).resourceId ?? '').trim()
	if (resourceRid) {
		const res = state.resourcesById[resourceRid]
		const resUrl = typeof res?.url === 'string' ? String(res.url).trim() : ''
		if (resUrl) return { url: resUrl, resourceId: resourceRid }
	}
	const imageSettings = (node as { imageSettings?: Record<string, unknown> }).imageSettings ?? {}
	const lastGenerated = String(
		(imageSettings.lastGeneratedImageUrl as string) ?? ''
	).trim()
	if (lastGenerated) return { url: lastGenerated }
	return { url: '' }
}

/** 从上游节点解析 3D 模型产物路径（沿用 useBlenderAgentChat 既有候选字段策略） */
const resolveUpstreamModelPath = (
	store: Store<WorkflowState>,
	node: WorkflowNode
): string => {
	const state = store.state
	const candidatesFromSettings = (settings: Record<string, unknown> | undefined): string[] => {
		if (!settings) return []
		return [
			String(settings.modelSourcePath ?? ''),
			String(settings.modelAssetPath ?? ''),
			String(settings.persistedModelPath ?? ''),
			String(settings.localPath ?? '')
		]
	}
	const settings =
		node.type === 'model3d'
			? ((node as { model3dSettings?: Record<string, unknown> }).model3dSettings ?? undefined)
			: node.type === 'meshy'
				? ((node as { meshySettings?: Record<string, unknown> }).meshySettings ?? undefined)
				: undefined
	for (const c of candidatesFromSettings(settings)) {
		if (c && c.trim()) return c.trim()
	}
	const resourceRid = String((node as { resourceId?: string }).resourceId ?? '').trim()
	if (resourceRid) {
		const resource = state.resourcesById[resourceRid]
		if (resource) {
			const sourcePath = String(
				(resource as { sourcePath?: string }).sourcePath ?? ''
			).trim()
			if (sourcePath) return sourcePath
			const rel = String(
				(resource as { projectRelativePath?: string }).projectRelativePath ?? ''
			).trim()
			if (rel) return resolveProjectPath(store, rel)
		}
	}
	return ''
}

const isImageLikeNode = (node: WorkflowNode): boolean =>
	node.type === 'image' || node.type === 'rotate-image' || node.type === 'comfyui'

const isModelLikeNode = (node: WorkflowNode): boolean =>
	node.type === 'model3d' || node.type === 'meshy' || node.type === 'tripo3d'

/**
 * 聚合 Blender 节点 `in-0` 锚点的全部上游输入。
 * 兼容旧快照中尚未迁移的 `in-model` 锚点 ID。
 */
export function collectBlenderUpstreamInputs(
	store: Store<WorkflowState>,
	nodeId: string
): BlenderUpstreamInputs {
	const state = store.state
	const result: BlenderUpstreamInputs = { texts: [], images: [], models: [] }
	const node = state.nodesById[nodeId]
	if (!node || node.type !== 'blender') return result

	const seenSource = new Set<string>()
	for (const edgeId of state.edgeOrder) {
		const edge = state.edgesById[edgeId]
		if (!edge) continue
		if (String(edge.toNodeId) !== String(nodeId)) continue
		const toAnchorId = String(edge.toAnchorId ?? '').trim()
		if (toAnchorId !== 'in-0' && toAnchorId !== 'in-model') continue

		const fromNode = state.nodesById[String(edge.fromNodeId)]
		if (!fromNode) continue
		const sourceKey = `${fromNode.id}:${String(edge.fromAnchorId ?? '')}`
		if (seenSource.has(sourceKey)) continue
		seenSource.add(sourceKey)

		const alias = nodeAlias(fromNode)

		if (isModelLikeNode(fromNode)) {
			const filePath = resolveUpstreamModelPath(store, fromNode)
			if (filePath) {
				result.models.push({
					sourceNodeId: fromNode.id,
					sourceAlias: alias,
					filePath,
					format: detectModelFormat(filePath)
				})
				continue
			}
		}

		if (isImageLikeNode(fromNode)) {
			const { url, resourceId } = resolveUpstreamImageUrl(store, fromNode)
			if (url) {
				result.images.push({
					sourceNodeId: fromNode.id,
					sourceAlias: alias,
					url,
					resourceId
				})
				continue
			}
		}

		const text = resolveUpstreamText(fromNode)
		if (text) {
			result.texts.push({
				sourceNodeId: fromNode.id,
				sourceAlias: alias,
				text
			})
		}
	}
	return result
}
