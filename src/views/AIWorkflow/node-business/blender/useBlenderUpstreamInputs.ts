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

const hasModelExt = (p: string): boolean => {
	if (!p) return false
	let testPath = p
	if (/^dweb:\/\//i.test(p)) {
		try {
			const u = new URL(p)
			const dwebPath = u.searchParams.get('path')
			if (dwebPath) testPath = dwebPath
		} catch { /* ignore */ }
	} else if (/^file:\/\//i.test(p)) {
		try {
			const u = new URL(p)
			testPath = decodeURIComponent(u.pathname)
		} catch { /* ignore */ }
	}
	const lower = testPath.split('?')[0].split('#')[0].toLowerCase()
	return MODEL_EXTS.some((ext) => lower.endsWith(ext))
}

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

const resolveDwebToLocalPath = (url: string, projectRoot: string | undefined): string => {
	if (!url) return ''
	if (url.startsWith('file://')) {
		try {
			const u = new URL(url)
			let p = decodeURIComponent(u.pathname)
			if (/^\/[A-Za-z]:[\\/]/.test(p)) p = p.slice(1)
			return p
		} catch { return '' }
	}
	if (url.startsWith('dweb://')) {
		try {
			const u = new URL(url)
			const p = u.searchParams.get('path')
			if (p && projectRoot) {
				const normalizedRoot = String(projectRoot).replace(/[/\\]+$/, '')
				const normalizedRel = decodeURIComponent(p).replace(/^[/\\]+/, '')
				return `${normalizedRoot}/${normalizedRel}`
			}
		} catch { /* ignore */ }
	}
	return ''
}

/** 从上游节点解析 3D 模型产物路径。
 *  候选字段仅限真正的模型输出路径；输入图片路径（lastInputSourcePath/localPath等）
 *  会被排除，最终通过扩展名校验确认文件为 3D 模型格式。 */
const resolveUpstreamModelPath = (
	store: Store<WorkflowState>,
	node: WorkflowNode
): string => {
	const state = store.state
	const projectRoot = (state as { projectRootPath?: string }).projectRootPath

	const resolveCandidate = (raw: string): string => {
		const c = String(raw ?? '').trim()
		if (!c) return ''
		if (/^https?:\/\//i.test(c)) return ''
		// absolute local path
		if (/^[A-Za-z]:[\\/]|^\//.test(c)) return hasModelExt(c) ? c : ''
		// dweb:// or file:// URL
		const resolved = resolveDwebToLocalPath(c, projectRoot)
		if (resolved && hasModelExt(resolved)) return resolved
		// project-relative path
		if (projectRoot && !c.includes('://')) {
			const normalizedRoot = String(projectRoot).replace(/[/\\]+$/, '')
			const normalizedRel = c.replace(/^[/\\]+/, '')
			const joined = `${normalizedRoot}/${normalizedRel}`
			if (hasModelExt(joined)) return joined
		}
		// fallback: literal string
		if (hasModelExt(c)) return c
		return ''
	}

	const trySettingsCandidates = (settings: Record<string, unknown> | undefined): string => {
		if (!settings) return ''
		const s = settings as any
		const candidates = [
			s.modelSourcePath,
			s.modelAssetPath,
			s.modelProjectRelativePath,
			s.modelAssetProjectRelativePath,
			s.persistedModelPath,
			s.tripo3dOutputAssetPath,
			s.tripo3dModelUrl,
			s.outputAssetPath,
			s.modelUrl,
			s.modelAssetUrl
		]
		for (const raw of candidates) {
			const resolved = resolveCandidate(String(raw ?? ''))
			if (resolved) return resolved
		}
		return ''
	}

	const settings =
		node.type === 'model3d'
			? ((node as { model3dSettings?: Record<string, unknown> }).model3dSettings ?? undefined)
			: node.type === 'meshy'
				? ((node as { meshySettings?: Record<string, unknown> }).meshySettings ?? undefined)
				: node.type === 'tripo3d'
					? ((node as { tripo3dSettings?: Record<string, unknown> }).tripo3dSettings ?? undefined)
					: undefined

	let candidate = trySettingsCandidates(settings)
	if (!candidate && node.type === 'model3d' && settings) {
		const m3d = settings as any
		candidate = trySettingsCandidates(m3d.meshyModelSettings)
			|| trySettingsCandidates(m3d.tripo3dModelSettings)
	}
	if (candidate) return candidate

	const resourceRid = String((node as { resourceId?: string }).resourceId ?? '').trim()
	if (resourceRid) {
		const resource = state.resourcesById[resourceRid]
		if (resource) {
			const resCandidates: (string | null | undefined)[] = [
				(resource as { sourcePath?: string }).sourcePath,
			]
			const rel = String(
				(resource as { projectRelativePath?: string }).projectRelativePath ?? ''
			).trim()
			if (rel) resCandidates.push(resolveProjectPath(store, rel))
			const resUrl = String((resource as { url?: string }).url ?? '').trim()
			if (resUrl) resCandidates.push(resolveDwebToLocalPath(resUrl, projectRoot))
			for (const raw of resCandidates) {
				const resolved = resolveCandidate(String(raw ?? ''))
				if (resolved) return resolved
			}
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
