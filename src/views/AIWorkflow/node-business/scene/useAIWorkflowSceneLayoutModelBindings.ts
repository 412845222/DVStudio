import type {
	WorkflowSceneLayoutManualModelBinding,
	WorkflowSceneLayoutModelBinding,
	WorkflowMeshyNodeSettings,
	WorkflowModelFormat
} from '../../../../aiworkflow/types'
import type { SceneDecomposeInputItem } from './sceneDecomposeShared'
import { isMeshyRemoteUrl, getMeshyEffectiveModelSource } from '../meshy/useAIWorkflowMeshyAssets'
import { isRecord, isString } from '../../../../types/utils'
import { t } from '../../../../i18n'

export const SUPPORTED_MODEL_EXTENSIONS = ['.glb', '.gltf', '.fbx', '.obj', '.stl', '.dae']

// ===== 参考 WorkflowModel3DNode 同款策略：候选 URL/路径必须命中模型白名单，避免被缩略图污染
const MODEL_EXT_WHITELIST = Object.freeze([
	'glb',
	'gltf',
	'fbx',
	'obj',
	'stl',
	'usdz',
	'dae',
	'3ds',
	'ply',
	'x3d',
	'x',
	'json'
])
const IMAGE_EXT_BLACKLIST = Object.freeze([
	'png',
	'jpg',
	'jpeg',
	'webp',
	'gif',
	'bmp',
	'tiff',
	'tif',
	'svg',
	'heic',
	'ico',
	'webm',
	'json'
])
const extractUrlExt = (urlOrPath: string | undefined | null): string => {
	if (!urlOrPath) return ''
	let s = String(urlOrPath).trim()
	if (!s) return ''
	const hashIdx = s.indexOf('#')
	if (hashIdx >= 0) s = s.substring(0, hashIdx)
	const qIdx = s.indexOf('?')
	if (qIdx >= 0) s = s.substring(0, qIdx)
	const lastDot = s.lastIndexOf('.')
	if (lastDot < 0) return ''
	const ext = s.substring(lastDot + 1)
	return ext ? ext.toLowerCase() : ''
}
const isImageExtension = (ext: string): boolean => {
	if (!ext) return false
	return IMAGE_EXT_BLACKLIST.includes(ext.toLowerCase())
}
const isImageUrlOrPath = (input: string): boolean => isImageExtension(extractUrlExt(input))
const isLikely3DModelUrl = (url: string): boolean => {
	if (!url) return false
	const ext = extractUrlExt(url)
	if (!ext) return false
	if (IMAGE_EXT_BLACKLIST.includes(ext)) return false
	if (MODEL_EXT_WHITELIST.includes(ext)) return true
	return false
}
const isTripo3DRemoteUrl = (url: string): boolean => {
	if (!url) return false
	try {
		const parsed = new URL(url)
		return /(^|\.)tripo3d\.ai$/i.test(parsed.hostname)
	} catch {
		return /https?:\/\/[^\s]*tripo3d\.ai(?:\/|$)/i.test(url)
	}
}
type CandidateQuality = 1 | 2 | 3 | 4 | 5
const candidateQuality = (u0: string): CandidateQuality => {
	const t = String(u0 ?? '').trim()
	if (!t) return 1
	const low = t.toLowerCase()
	if (low.startsWith('file://')) return 5
	if (/^[a-zA-Z]:[\\/]/.test(t) || t.startsWith('\\\\') || t.startsWith('/')) return 5
	if (low.startsWith('dweb://') || low.startsWith('dweb:')) return 4
	if (low.startsWith('http://') || low.startsWith('https://')) return 2
	return 3
}
const normalizeCandidate = (u: string): string => {
	let t = String(u ?? '').trim()
	if (!t) return ''
	if (t.toLowerCase().startsWith('file://')) return t
	const low = t.toLowerCase()
	if (!low.startsWith('http') && !/^[a-zA-Z]:[\\/]/.test(t) && !t.startsWith('\\\\') && !t.startsWith('/')) {
		t = t.replace(/\\/g, '/')
	}
	return t
}

const recoverImageExtToModel = (input: string, targetExt: string = 'glb'): string[] => {
	const results: string[] = []
	const u = String(input ?? '').trim()
	if (!u) return results
	const origExt = extractUrlExt(u)
	const isImage = origExt ? isImageExtension(origExt) : false
	const isBinLow = origExt === 'bin'
	if (!isImage && !isBinLow) return results
	try {
		if (u.toLowerCase().startsWith('dweb://project-assets') || u.toLowerCase().startsWith('dweb:')) {
			const qStart = u.indexOf('?')
			if (qStart >= 0) {
				const base = u.substring(0, qStart + 1)
				const queryStr = u.substring(qStart + 1)
				const origParams = new URLSearchParams(queryStr)
				for (const key of ['path', 'relativePath', 'assetPath', 'filePath']) {
					const raw = origParams.get(key)
					if (!raw) continue
					const clean = decodeURIComponent(raw).split('?')[0].split('#')[0]
					const lastSlash = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
					const namePart = lastSlash >= 0 ? clean.substring(lastSlash + 1) : clean
					const d = namePart.lastIndexOf('.')
					if (d < 0) continue
					const cleanPrefix = clean.slice(0, lastSlash + 1) + namePart.slice(0, d)
					const newClean = cleanPrefix + '.' + targetExt
					const p = new URLSearchParams(queryStr)
					p.set(key, encodeURIComponent(newClean))
					results.push(base + p.toString())
				}
			}
		}
	} catch { /* ignore */ }
	const withoutQuery = u.split('?')[0].split('#')[0]
	const lastDot = withoutQuery.lastIndexOf('.')
	if (lastDot < 0) return results
	const base = withoutQuery.substring(0, lastDot)
	const rest = u.substring(withoutQuery.length)
	for (const e of [targetExt, 'gltf']) results.push(base + '.' + e + rest)
	return results
}

// ===== WorkflowModel3DNode 同款策略：从任意 URL / 路径里挑出优先级最高的"真实 3D 模型源，
// 直接丢弃 meshy/tripo3d 远端 CDN URL；还会恢复被缩略图污染成 .png / .bin 的路径回退 glb 再进入候选。
export const pickBestModelUrlFromCandidates = (rawCandidates: Array<string | null | undefined>): string => {
	const validList: Array<{ url: string; q: CandidateQuality }> = []
	const pushOne = (raw: string) => {
		const u0 = String(raw ?? '').trim()
		if (!u0) return
		if (isMeshyRemoteUrl(u0)) return
		if (isTripo3DRemoteUrl(u0)) return
		const u1 = fixDwebUrlPath(fixDvcacheBinPath(u0))
		const tryList = [u1]
		for (const r of recoverImageExtToModel(u1)) tryList.push(r)
		for (const u of tryList) {
			if (!u) continue
			if (isMeshyRemoteUrl(u) || isTripo3DRemoteUrl(u)) continue
			if (isImageUrlOrPath(u)) continue
			if (!isLikely3DModelUrl(u)) continue
			const norm = normalizeCandidate(u)
			if (!norm) continue
			validList.push({ url: norm, q: candidateQuality(norm) })
		}
	}
	for (const raw of rawCandidates) {
		const u = String(raw ?? '').trim()
		if (!u) continue
		pushOne(u)
	}
	if (validList.length === 0) return ''
	validList.sort((a, b) => Number(b.q) - Number(a.q))
	return validList[0].url
}

// ===== Tripo3D 节点 settings 对应的 effective 来源（对齐 getMeshyEffectiveModelSource 同款）
export const getTripo3DEffectiveModelSource = (
	settings: Record<string, unknown> | null | undefined
): { preferredUrl: string; assetUrl: string; assetPath: string; format: 'glb' | 'gltf' } => {
	const value = isRecord(settings) ? settings : {}
	const output = isRecord(value.tripo3dOutputSummary) ? value.tripo3dOutputSummary : {}
	const relation = isRecord(value.tripo3dRelationSummary) ? value.tripo3dRelationSummary : {}
	const modelUrls = isRecord(value.tripo3dModelUrls) ? value.tripo3dModelUrls : {}
	const assetUrl = String(
		relation.effectiveLocalAssetUrl ??
		value.tripo3dOutputAssetUrl ??
		output.assetUrl ??
		''
	).trim()
	const assetPath = String(
		relation.effectiveLocalAssetPath ??
		value.tripo3dOutputAssetPath ??
		output.assetPath ??
		''
	).trim()
	const preferredUrl =
		String(relation.effectivePreferredModelUrl ?? output.preferredUrl ?? '').trim() || assetUrl
	const format = String(output.format ?? '').trim().toLowerCase() === 'gltf' ? 'gltf' as const : 'glb' as const
	return { preferredUrl, assetUrl, assetPath, format }
}

const fixDvcacheBinPath = (p: string): string => {
	if (!p) return p
	let result = p
	const lower = result.toLowerCase().replace(/\//g, '\\')
	const dvcachePattern = /\.dvcache[\\/]bin[\\/](meshy(?:-3d)?)[_-]([a-f0-9-]+)\.bin$/i
	const match = lower.match(dvcachePattern)
	if (match) {
		const meshyId = match[2]
		const correctPath = `Content\\Media\\meshy-3d-${meshyId}.glb`
		result = result.replace(/\.dvcache[\\/]bin[\\/](meshy(?:-3d)?)[_-]([a-f0-9-]+)\.bin$/i, correctPath.replace(/\\/g, p.includes('/') ? '/' : '\\'))
	}
	return result
}

const fixDwebUrlPath = (url: string): string => {
	if (!url) return url
	if (!url.startsWith('dweb://project-assets')) return url
	try {
		const qIndex = url.indexOf('?')
		if (qIndex < 0) return url
		const base = url.substring(0, qIndex + 1)
		const query = url.substring(qIndex + 1)
		const params = new URLSearchParams(query)
		const pathParam = params.get('path')
		if (pathParam) {
			const decodedPath = decodeURIComponent(pathParam)
			const lower = decodedPath.toLowerCase().replace(/\//g, '\\')
			if (lower.includes('.dvcache\\bin\\') && lower.endsWith('.bin')) {
				const dvcachePattern = /\.dvcache\/bin\/(meshy(?:-3d)?)[_-]([a-f0-9-]+)\.bin$/i
				const m = decodedPath.replace(/\\/g, '/').match(dvcachePattern)
				if (m) {
					const meshyId = m[2]
					const correctPath = `Content/Media/meshy-3d-${meshyId}.glb`
					params.set('path', correctPath)
					return base + params.toString()
				}
			}
		}
	} catch {}
	return url
}

const normalizeModelPaths = <T extends {
	modelUrl?: string
	modelAssetUrl?: string
	modelSourcePath?: string
	modelAssetPath?: string
	modelProjectRelativePath?: string
	modelAssetProjectRelativePath?: string
	modelFormat?: WorkflowModelFormat
}>(info: T): T => {
	const result = { ...info }
	if (result.modelUrl) result.modelUrl = fixDwebUrlPath(fixDvcacheBinPath(result.modelUrl))
	if (result.modelAssetUrl) result.modelAssetUrl = fixDwebUrlPath(fixDvcacheBinPath(result.modelAssetUrl))
	if (result.modelSourcePath) result.modelSourcePath = fixDvcacheBinPath(result.modelSourcePath)
	if (result.modelAssetPath) result.modelAssetPath = fixDvcacheBinPath(result.modelAssetPath)
	if (result.modelProjectRelativePath) result.modelProjectRelativePath = fixDvcacheBinPath(result.modelProjectRelativePath.replace(/\//g, '\\')).replace(/\\/g, '/')
	if (result.modelAssetProjectRelativePath) result.modelAssetProjectRelativePath = fixDvcacheBinPath(result.modelAssetProjectRelativePath.replace(/\//g, '\\')).replace(/\\/g, '/')
	
	const finalPath = result.modelSourcePath || result.modelAssetPath || result.modelUrl || result.modelAssetUrl
	if (finalPath && !result.modelFormat) {
		result.modelFormat = detectModelFormatFromPath(finalPath) || 'glb'
	} else if (result.modelFormat === 'glb' && finalPath) {
		const detected = detectModelFormatFromPath(finalPath)
		if (detected) result.modelFormat = detected
	}
	return result
}

export const detectModelFormatFromPath = (pathOrUrl: string): WorkflowModelFormat | undefined => {
	if (!pathOrUrl) return undefined
	const lower = String(pathOrUrl).toLowerCase().trim()

	const detectFromPathString = (p: string): WorkflowModelFormat | undefined => {
		for (const ext of SUPPORTED_MODEL_EXTENSIONS) {
			if (p.endsWith(ext)) {
				return ext.substring(1) as WorkflowModelFormat
			}
		}
		return undefined
	}

	const queryIndex = lower.indexOf('?')
	const pathWithoutQuery = queryIndex >= 0 ? lower.substring(0, queryIndex) : lower
	const directResult = detectFromPathString(pathWithoutQuery)
	if (directResult) return directResult

	if (lower.startsWith('dweb://') && queryIndex >= 0) {
		try {
			const queryStr = lower.substring(queryIndex + 1)
			const params = new URLSearchParams(queryStr)
			const pathParam = params.get('path')
			if (pathParam) {
				const decodedPath = decodeURIComponent(pathParam).toLowerCase()
				const pathQueryIndex = decodedPath.indexOf('?')
				const innerPath = pathQueryIndex >= 0 ? decodedPath.substring(0, pathQueryIndex) : decodedPath
				return detectFromPathString(innerPath)
			}
		} catch {}
	}

	return undefined
}

const extractModelInfoFromSettings = (
	settings: Record<string, unknown> | null | undefined,
	resourcesById?: Record<string, Record<string, unknown>>,
	nodeResourceId?: string
): {
	modelUrl?: string
	modelAssetUrl?: string
	modelSourcePath?: string
	modelAssetPath?: string
	modelProjectRelativePath?: string
	modelAssetProjectRelativePath?: string
	modelSourceName?: string
	modelFormat?: WorkflowModelFormat
	modelResourceId?: string
} => {
	if (!settings) return {}
	const modelAssetUrl = String(settings.modelAssetUrl ?? '').trim()
	const rawModelUrl = String(settings.modelUrl ?? '').trim()
	const modelUrl = (() => {
		if (modelAssetUrl && !isMeshyRemoteUrl(modelAssetUrl)) return modelAssetUrl
		if (rawModelUrl && !isMeshyRemoteUrl(rawModelUrl)) return rawModelUrl
		return modelAssetUrl || rawModelUrl
	})()
	const modelAssetPath = String(settings.modelAssetPath ?? '').trim()
	const modelSourcePath = String(settings.modelSourcePath ?? '').trim()
	const modelProjectRelativePath = String(settings.modelProjectRelativePath ?? '').trim()
	const modelAssetProjectRelativePath = String(settings.modelAssetProjectRelativePath ?? '').trim()
	const modelSourceName = String(settings.modelSourceName ?? '').trim()
	const rawFormat = settings.modelFormat as string | undefined

	let modelFormat: WorkflowModelFormat | undefined
	if (rawFormat && SUPPORTED_MODEL_EXTENSIONS.includes(`.${rawFormat.toLowerCase()}`)) {
		modelFormat = rawFormat.toLowerCase() as WorkflowModelFormat
	}

	if (!modelFormat) {
		modelFormat = detectModelFormatFromPath(modelUrl || modelAssetUrl || modelSourcePath || modelAssetPath)
	}

	if (!modelFormat && (modelUrl || modelAssetUrl || modelSourcePath || modelAssetPath)) {
		modelFormat = 'glb'
	}

	const result = {
		modelUrl: modelUrl || undefined,
		modelAssetUrl: modelAssetUrl || undefined,
		modelSourcePath: modelSourcePath || undefined,
		modelAssetPath: modelAssetPath || undefined,
		modelProjectRelativePath: modelProjectRelativePath || undefined,
		modelAssetProjectRelativePath: modelAssetProjectRelativePath || undefined,
		modelSourceName: modelSourceName || undefined,
		modelFormat,
		modelResourceId: String((settings as Record<string, unknown>).resourceId ?? '').trim() || String(nodeResourceId ?? '').trim() || undefined
	}

	const resourceId =
		String(result.modelResourceId ?? '').trim() ||
		String((settings as Record<string, unknown>).resourceId ?? '').trim()
	// 【BUGFIX 2026-08】只要有 resourceId 就优先从 resourcesById 补全 projectRelativePath 等本地字段；
	// 因为上游 Meshy/Tripo3D 节点的 modelUrl/modelAssetUrl 常常还残留远端 URL，
	// 若只在"全空"时才回退 resourcesById，就会漏掉真正可用的本地项目相对路径，
	// 导致 SceneLayoutNode 预览时只能拿到远端 URL 被 skipRemote，占位立方渲染。
	if (resourcesById && resourceId) {
		const resource = resourcesById[resourceId]
		if (resource) {
			const resourceUrl = String(resource.url ?? '').trim()
			const resourceSourcePath = String(resource.sourcePath ?? '').trim()
			const resourceProjectRelativePath = String(resource.projectRelativePath ?? '').trim()
			const resourceAssetPath = String(resource.absolutePath ?? '').trim()
			const resourceName = String(resource.name ?? '').trim()

			if (resourceProjectRelativePath && !result.modelProjectRelativePath) {
				result.modelProjectRelativePath = resourceProjectRelativePath
			}
			if (resourceProjectRelativePath && !result.modelAssetProjectRelativePath) {
				result.modelAssetProjectRelativePath = resourceProjectRelativePath
			}
			if (!result.modelUrl && resourceUrl) {
				result.modelUrl = resourceUrl
			}
			if (!result.modelAssetUrl && resourceUrl) {
				result.modelAssetUrl = resourceUrl
			}
			if ((resourceSourcePath || resourceAssetPath) && !result.modelSourcePath && !result.modelAssetPath) {
				const finalSourcePath = resourceAssetPath || resourceSourcePath
				result.modelSourcePath = finalSourcePath
				result.modelAssetPath = finalSourcePath
			}
			if (!result.modelSourceName && resourceName) {
				result.modelSourceName = resourceName
			}
			if (!result.modelFormat) {
				result.modelFormat =
					detectModelFormatFromPath(
						resourceProjectRelativePath ||
							resourceUrl ||
							resourceSourcePath ||
							resourceAssetPath ||
							resourceName
					) || 'glb'
			}
			if (!result.modelResourceId) {
				result.modelResourceId = resourceId
			}
		}
	}
	if (resourcesById && resourceId && (!modelUrl && !modelAssetUrl && !modelSourcePath && !modelAssetPath && !modelProjectRelativePath)) {
		const resource = resourcesById[resourceId]
		if (resource) {
			const resourceUrl = String(resource.url ?? '').trim()
			const resourceSourcePath = String(resource.sourcePath ?? '').trim()
			const resourceProjectRelativePath = String(resource.projectRelativePath ?? '').trim()
			const resourceAssetPath = String(resource.absolutePath ?? '').trim()
			const resourceName = String(resource.name ?? '').trim()
			if (resourceUrl && !result.modelUrl) {
				result.modelUrl = resourceUrl
			}
			if (resourceUrl && !result.modelAssetUrl) {
				result.modelAssetUrl = resourceUrl
			}
			if ((resourceSourcePath || resourceAssetPath) && !result.modelSourcePath) {
				const finalSourcePath = resourceAssetPath || resourceSourcePath
				result.modelSourcePath = finalSourcePath
			}
			if ((resourceSourcePath || resourceAssetPath) && !result.modelAssetPath) {
				const finalSourcePath = resourceAssetPath || resourceSourcePath
				result.modelAssetPath = finalSourcePath
			}
			if (resourceProjectRelativePath && !result.modelProjectRelativePath) {
				result.modelProjectRelativePath = resourceProjectRelativePath
			}
			if (resourceProjectRelativePath && !result.modelAssetProjectRelativePath) {
				result.modelAssetProjectRelativePath = resourceProjectRelativePath
			}
			if (resourceName && !result.modelSourceName) {
				result.modelSourceName = resourceName
			}
			if (!result.modelFormat) {
				result.modelFormat = detectModelFormatFromPath(resourceUrl || resourceSourcePath || resourceAssetPath || resourceName) || 'glb'
			}
			if (!result.modelResourceId) {
				result.modelResourceId = resourceId
			}
		}
	}

	return normalizeModelPaths(result)
}

const parseObjectIdFromAnchorId = (anchorId: string): string => {
	const trimmed = String(anchorId ?? '').trim()
	if (trimmed.startsWith('in-model-')) {
		return trimmed.slice('in-model-'.length)
	}
	return trimmed
}

export const useAIWorkflowSceneLayoutModelBindings = (options: {
	store: {
		state: {
			nodesById: Record<string, Record<string, unknown>>
			resourcesById?: Record<string, Record<string, unknown>>
		}
	}
	isSceneLayoutModelTargetItem: (item: SceneDecomposeInputItem) => boolean
	getIncomingEdges: (nodeId: string, anchorId?: string) => unknown[]
	getMeshyEffectiveModelSource: (settings: WorkflowMeshyNodeSettings | Record<string, unknown> | null | undefined) => {
		preferredUrl?: string | null
		assetUrl?: string | null
		assetPath?: string | null
		format?: 'gltf' | 'glb' | null
	}
}) => {
	const sceneLayoutModelInputAnchorId = (objectId: string) =>
		`in-model-${String(objectId ?? '').trim()}`

	const connectedSceneLayoutModelBindings = (nodeId: string): WorkflowSceneLayoutModelBinding[] => {
		const node = options.store.state.nodesById[nodeId] as Record<string, unknown>
		if (!node || node.type !== 'scene-layout') return []
		const sceneLayoutSettings = node.sceneLayoutSettings as Record<string, unknown> | undefined
		const allLayoutItems = Array.isArray(sceneLayoutSettings?.layoutItems)
			? (sceneLayoutSettings!.layoutItems as unknown[]).filter((item: unknown) =>
					String((item as Record<string, unknown>)?.id ?? '').trim()
				)
			: []

		const itemMap = new Map<string, Record<string, unknown>>()
		const itemNameMap = new Map<string, string>()
		for (const item of allLayoutItems) {
			const itemRecord = item as Record<string, unknown>
			const objectId = String(itemRecord.id ?? '').trim()
			if (objectId) {
				itemMap.set(objectId, itemRecord)
				const name = String(itemRecord.name ?? '').trim()
				if (name) itemNameMap.set(objectId, name)
			}
		}

		const manualBindingsMap = new Map<string, WorkflowSceneLayoutManualModelBinding>()
		const rawManualBindings = Array.isArray(sceneLayoutSettings?.manualModelBindings)
			? (sceneLayoutSettings!.manualModelBindings as unknown[])
			: []
		for (const item of rawManualBindings) {
			const itemRecord = item as Record<string, unknown>
			const objectId = String(itemRecord?.objectId ?? '').trim()
			if (!objectId) continue
			const modelUrl = String(itemRecord?.modelUrl ?? '').trim()
			const modelAssetUrl = String(itemRecord?.modelAssetUrl ?? '').trim()
			const modelSourcePath = String(itemRecord?.modelSourcePath ?? '').trim()
			const modelAssetPath = String(itemRecord?.modelAssetPath ?? '').trim()
			if (!modelUrl && !modelAssetUrl && !modelSourcePath && !modelAssetPath) continue
			const rawFormat = itemRecord?.modelFormat as string | undefined
			let format: WorkflowModelFormat | undefined
			if (rawFormat && SUPPORTED_MODEL_EXTENSIONS.includes(`.${rawFormat.toLowerCase()}`)) {
				format = rawFormat.toLowerCase() as WorkflowModelFormat
			}
			if (!format) {
				format = detectModelFormatFromPath(modelUrl || modelAssetUrl || modelSourcePath || modelAssetPath)
			}
			manualBindingsMap.set(objectId, {
				objectId,
				modelUrl: modelUrl || undefined,
				modelAssetUrl: modelAssetUrl || undefined,
				modelSourceName:
					typeof itemRecord?.modelSourceName === 'string' ? itemRecord.modelSourceName : undefined,
				modelSourcePath: modelSourcePath || undefined,
				modelAssetPath: modelAssetPath || undefined,
				modelProjectRelativePath: typeof itemRecord?.modelProjectRelativePath === 'string'
					? itemRecord.modelProjectRelativePath : undefined,
				modelAssetProjectRelativePath: typeof itemRecord?.modelAssetProjectRelativePath === 'string'
					? itemRecord.modelAssetProjectRelativePath : undefined,
				modelFormat: format
			})
		}

		const bindingMap = new Map<string, WorkflowSceneLayoutModelBinding>()

		const addOrMergeBinding = (binding: WorkflowSceneLayoutModelBinding) => {
			// 2026-08-03 关键修复：移除 !binding.connected 强门槛。
			//   用户现场：CHAIN DIAG 显示 27 条 in-model-* 真实入边（都是通过 Vuex 真正连线的），
			//   但 18 条新链路 decompose 产出的 model3d 节点因 extractModelInfoFromSettings
			//   初值未命中→connected=false→这里直接 return，永远不进入 bindingMap。
			//   导致下游 buildPureDataSlots + synthesize + merge 全部只能基于 9 个过期 binding 工作，
			//   最终 validSlots 只有 7，用户感知"虚幻只导入了第一个旧模型"。
			//   ——修复思路：connected 只做标记，不做收录硬门槛。
			//     只要有 objectId 就收录进 bindingMap，让下游 hasAnyPathExtended 再做
			//     最终出口的 6 路径字段判断。这样 27 条边都有机会被 HARDER 路径兜底找到真实资源。
			if (!binding) return
			const objectId = String(binding.objectId ?? '').trim()
			if (!objectId) return
			const existing = bindingMap.get(objectId)
			if (existing) {
				// 合并策略：已有值优先级 > 新传入值（避免空值覆盖有效值；但 connected 只能"升级成 true"不能降级）
				if (binding.connected === true && existing.connected !== true) existing.connected = true
				if (!existing.modelUrl && binding.modelUrl) existing.modelUrl = binding.modelUrl
				if (!existing.modelAssetUrl && binding.modelAssetUrl) existing.modelAssetUrl = binding.modelAssetUrl
				if (!existing.modelSourcePath && binding.modelSourcePath) existing.modelSourcePath = binding.modelSourcePath
				if (!existing.modelAssetPath && binding.modelAssetPath) existing.modelAssetPath = binding.modelAssetPath
				if (!existing.modelProjectRelativePath && binding.modelProjectRelativePath) existing.modelProjectRelativePath = binding.modelProjectRelativePath
				if (!existing.modelAssetProjectRelativePath && binding.modelAssetProjectRelativePath) existing.modelAssetProjectRelativePath = binding.modelAssetProjectRelativePath
				if (!existing.modelSourceName && binding.modelSourceName) existing.modelSourceName = binding.modelSourceName
				if (!existing.modelFormat && binding.modelFormat) existing.modelFormat = binding.modelFormat
				if (!existing.objectName && binding.objectName) existing.objectName = binding.objectName
				if (!existing.sourceNodeId && binding.sourceNodeId) existing.sourceNodeId = binding.sourceNodeId
				if (!existing.sourceNodeType && binding.sourceNodeType) existing.sourceNodeType = binding.sourceNodeType
				if (!existing.inputAnchorId && binding.inputAnchorId) existing.inputAnchorId = binding.inputAnchorId
				if (!existing.modelResourceId && binding.modelResourceId) existing.modelResourceId = binding.modelResourceId
				return
			}
			bindingMap.set(objectId, { ...binding })
		}

		for (const [objectId, manualBinding] of manualBindingsMap) {
			const modelAssetUrl = String(manualBinding.modelAssetUrl ?? '').trim()
			const modelUrl = String(manualBinding.modelUrl ?? modelAssetUrl ?? '').trim()
			const modelSourcePath = typeof manualBinding.modelSourcePath === 'string'
				? String(manualBinding.modelSourcePath).trim() || undefined
				: undefined
			const modelAssetPath = typeof manualBinding.modelAssetPath === 'string'
				? String(manualBinding.modelAssetPath).trim() || undefined
				: undefined
			const hasModel = !!(modelUrl || modelAssetUrl || modelSourcePath || modelAssetPath)
			addOrMergeBinding({
				objectId,
				objectName: itemNameMap.get(objectId) || manualBinding.modelSourceName || objectId,
				inputAnchorId: sceneLayoutModelInputAnchorId(objectId),
				connected: hasModel,
				sourceNodeId: nodeId,
				sourceNodeType: 'manual',
				modelUrl: modelUrl || undefined,
				modelAssetUrl: modelAssetUrl || undefined,
				modelSourceName: manualBinding.modelSourceName || undefined,
				modelSourcePath,
				modelAssetPath,
				modelProjectRelativePath: manualBinding.modelProjectRelativePath,
				modelAssetProjectRelativePath: manualBinding.modelAssetProjectRelativePath,
				modelFormat: manualBinding.modelFormat
			})
		}

		const allIncomingEdges = options.getIncomingEdges(nodeId)
		for (const edge of allIncomingEdges) {
			if (!edge || typeof edge !== 'object') continue
			const edgeObj = edge as Record<string, unknown>
			const fromNodeId = String(edgeObj.fromNodeId ?? '').trim()
			const toAnchorId = String(edgeObj.toAnchorId ?? '').trim()
			if (!fromNodeId) continue

			const fromNode = options.store.state.nodesById[fromNodeId] as Record<string, unknown>
			if (!fromNode) continue

			const fromNodeType = String(fromNode.type ?? '').trim()
			if (fromNodeType !== 'model3d' && fromNodeType !== 'meshy' && fromNodeType !== 'tripo3d') continue

			const objectId = parseObjectIdFromAnchorId(toAnchorId)
			if (!objectId) continue

			const objectName = itemNameMap.get(objectId)
				|| String(fromNode.alias ?? fromNode.title ?? '').trim()
				|| objectId

			if (fromNodeType === 'meshy') {
				const effective = options.getMeshyEffectiveModelSource(fromNode.meshySettings as Record<string, unknown>)
				const modelAssetUrl = String(effective.assetUrl ?? '').trim()
				const rawModelUrl = String(effective.preferredUrl ?? modelAssetUrl ?? '').trim()
				const modelAssetPath = String(effective.assetPath ?? '').trim()
				const modelUrl = isMeshyRemoteUrl(rawModelUrl) ? '' : rawModelUrl
				const safeAssetUrl = isMeshyRemoteUrl(modelAssetUrl) ? '' : modelAssetUrl
				const meshyFormat = effective.format === 'gltf' ? 'gltf' as const : 'glb' as const
				const hasModel = !!(modelUrl || safeAssetUrl || modelAssetPath)
				addOrMergeBinding(normalizeModelPaths({
					objectId,
					objectName,
					inputAnchorId: toAnchorId || sceneLayoutModelInputAnchorId(objectId),
					connected: hasModel,
					sourceNodeId: fromNodeId,
					sourceNodeType: 'meshy',
					modelUrl: modelUrl || undefined,
					modelAssetUrl: safeAssetUrl || undefined,
					modelSourceName: String(fromNode.alias ?? fromNode.title ?? objectName).trim() || undefined,
					modelSourcePath: modelAssetPath || undefined,
					modelAssetPath: modelAssetPath || undefined,
					modelFormat: meshyFormat
				}))
				continue
			}

			if (fromNodeType === 'tripo3d') {
				const effective = getTripo3DEffectiveModelSource(fromNode.tripo3dSettings as Record<string, unknown>)
				const modelAssetUrl = String(effective.assetUrl ?? '').trim()
				const rawModelUrl = String(effective.preferredUrl ?? modelAssetUrl ?? '').trim()
				const modelAssetPath = String(effective.assetPath ?? '').trim()
				// Tripo3D 远端 CDN URL 同样屏蔽，只留本地路径
				const isTripoRemote = (u: string) => {
					if (!u) return false
					try {
						const p = new URL(u)
						return /(^|\.)tripo3d\.ai$/i.test(p.hostname)
					} catch {
						return /https?:\/\/[^\s]*tripo3d\.ai(?:\/|$)/i.test(u)
					}
				}
				const modelUrl = isTripoRemote(rawModelUrl) ? '' : rawModelUrl
				const safeAssetUrl = isTripoRemote(modelAssetUrl) ? '' : modelAssetUrl
				const tripoFormat = effective.format === 'gltf' ? 'gltf' as const : 'glb' as const
				const hasModel = !!(modelUrl || safeAssetUrl || modelAssetPath)
				addOrMergeBinding(normalizeModelPaths({
					objectId,
					objectName,
					inputAnchorId: toAnchorId || sceneLayoutModelInputAnchorId(objectId),
					connected: hasModel,
					sourceNodeId: fromNodeId,
					sourceNodeType: 'tripo3d',
					modelUrl: modelUrl || undefined,
					modelAssetUrl: safeAssetUrl || undefined,
					modelSourceName: String(fromNode.alias ?? fromNode.title ?? objectName).trim() || undefined,
					modelSourcePath: modelAssetPath || undefined,
					modelAssetPath: modelAssetPath || undefined,
					modelFormat: tripoFormat
				}))
				continue
			}

			let extractedInfo: ReturnType<typeof extractModelInfoFromSettings> | null = null

			const settingsToCheck: Array<Record<string, unknown> | null | undefined> = [
				fromNode.model3dSettings as Record<string, unknown> | undefined,
				fromNode.settings as Record<string, unknown> | undefined,
				fromNode
			]
			
			for (const settings of settingsToCheck) {
				const info = extractModelInfoFromSettings(settings, options.store.state.resourcesById, String(fromNode.resourceId ?? ''))
				if (info.modelUrl || info.modelAssetUrl || info.modelSourcePath || info.modelAssetPath || info.modelProjectRelativePath) {
					extractedInfo = info
					break
				}
			}

			if (!extractedInfo && fromNode.meshySettings) {
				const effective = options.getMeshyEffectiveModelSource(fromNode.meshySettings as Record<string, unknown>)
				const modelAssetUrl = String(effective.assetUrl ?? '').trim()
				const rawModelUrl = String(effective.preferredUrl ?? modelAssetUrl ?? '').trim()
				const modelAssetPath = String(effective.assetPath ?? '').trim()
				const modelUrl = isMeshyRemoteUrl(rawModelUrl) ? '' : rawModelUrl
				const safeAssetUrl = isMeshyRemoteUrl(modelAssetUrl) ? '' : modelAssetUrl
				if (modelUrl || safeAssetUrl || modelAssetPath) {
					extractedInfo = normalizeModelPaths({
						modelUrl: modelUrl || undefined,
						modelAssetUrl: safeAssetUrl || undefined,
						modelSourcePath: modelAssetPath || undefined,
						modelAssetPath: modelAssetPath || undefined,
						modelSourceName:
							String(fromNode.alias ?? fromNode.title ?? objectName).trim() || undefined,
						modelFormat: effective.format === 'gltf' ? 'gltf' : 'glb'
					})
				}
			}

			if (!extractedInfo) {
				const m3dSettings = fromNode.model3dSettings as Record<string, unknown> | undefined
				const innerMeshy = m3dSettings?.meshyModelSettings as Record<string, unknown> | undefined
				if (innerMeshy) {
					const effective = options.getMeshyEffectiveModelSource(innerMeshy)
					const modelAssetUrl = String(effective.assetUrl ?? '').trim()
					const rawModelUrl = String(effective.preferredUrl ?? modelAssetUrl ?? '').trim()
					const modelAssetPath = String(effective.assetPath ?? '').trim()
					const modelUrl = isMeshyRemoteUrl(rawModelUrl) ? '' : rawModelUrl
					const safeAssetUrl = isMeshyRemoteUrl(modelAssetUrl) ? '' : modelAssetUrl
					if (modelUrl || safeAssetUrl || modelAssetPath) {
						extractedInfo = normalizeModelPaths({
							modelUrl: modelUrl || undefined,
							modelAssetUrl: safeAssetUrl || undefined,
							modelSourcePath: modelAssetPath || undefined,
							modelAssetPath: modelAssetPath || undefined,
							modelSourceName:
								String(fromNode.alias ?? fromNode.title ?? objectName).trim() || undefined,
							modelFormat: effective.format === 'gltf' ? 'gltf' : 'glb'
						})
					}
				}
			}

			if (!extractedInfo) {
				const nodeResourceId = String(fromNode.resourceId ?? '').trim()
				if (nodeResourceId && options.store.state.resourcesById) {
					const resource = options.store.state.resourcesById[nodeResourceId]
					if (resource) {
						const resourceUrl = String(resource.url ?? '').trim()
						const resourceSourcePath = String(resource.sourcePath ?? '').trim()
						const resourceAssetPath = String(resource.absolutePath ?? '').trim()
						const resourceProjectRelativePath = String(resource.projectRelativePath ?? '').trim()
						const resourceName = String(resource.name ?? '').trim()
						const finalPath = resourceAssetPath || resourceSourcePath
						if (resourceUrl || finalPath || resourceProjectRelativePath) {
							extractedInfo = extractModelInfoFromSettings({
								modelUrl: resourceUrl,
								modelAssetUrl: resourceUrl,
								modelSourcePath: finalPath,
								modelAssetPath: finalPath,
								modelProjectRelativePath: resourceProjectRelativePath,
								modelSourceName: resourceName,
								resourceId: nodeResourceId
							})
						}
					}
				}
			}

			// ========================================================================
			// 2026-08-03 HARDER 路径兜底（对应现场：CHAIN DIAG 27 条 in-model-* 边，
			//   标准 5 层查找后仍然只有 9 条命中 extractedInfo，剩下 18 条
			//   decompose 产出的 model3d 节点全部走 connected:false → 以前被
			//   addOrMergeBinding 的 connected 门槛丢弃，永远没机会被下游找到）。
			//   ——这里不再"如果没找到就算了"，改"只要有任何模糊线索就硬试"：
			//     ① fromNode.outputs 所有 out-* 锚点的 resolved / cached / value；
			//     ② fromNode 顶层任一字段（modelXxxPath / assetXxx）；
			//     ③ resourceId 再走一次 pickBestModelUrlFromCandidates（含缩略图恢复）；
			//     ④ 把 pickBestModelUrlFromCandidates 的结果喂回 extractModelInfoFromSettings。
			// ========================================================================
			const hasExtractedPaths = !!(
				extractedInfo && (
					extractedInfo.modelUrl ||
					extractedInfo.modelAssetUrl ||
					extractedInfo.modelSourcePath ||
					extractedInfo.modelAssetPath ||
					extractedInfo.modelProjectRelativePath ||
					extractedInfo.modelAssetProjectRelativePath
				)
			)
			if (!hasExtractedPaths) {
				const harderCandidates: Array<string | null | undefined> = []
				// ① outputs 里的 out-* 锚点（主要是 out-model），它的 resolved / cached / value
				if (Array.isArray(fromNode.outputs)) {
					for (const out of fromNode.outputs as unknown[]) {
						if (!out || typeof out !== 'object') continue
						const o = out as Record<string, unknown>
						const anchorId = String(o.anchorId ?? o.id ?? '').trim()
						const isOutModel = /^out-?model/i.test(anchorId) || /model/i.test(anchorId)
						const resolved = o.resolved
						const cached = o.cached
						const val = o.value
						for (const src of [resolved, cached, val]) {
							if (!src) continue
							if (typeof src === 'string') {
								if (isOutModel) harderCandidates.push(src)
								else harderCandidates.push(src)
							} else if (typeof src === 'object') {
								const s = src as Record<string, unknown>
								harderCandidates.push(
									String(s.modelAssetProjectRelativePath ?? s.modelProjectRelativePath ?? '').trim() || null,
									String(s.modelAssetPath ?? s.modelSourcePath ?? '').trim() || null,
									String(s.modelAssetUrl ?? s.modelUrl ?? '').trim() || null,
									String(s.projectRelativePath ?? s.absolutePath ?? s.sourcePath ?? '').trim() || null,
									String(s.assetUrl ?? s.preferredUrl ?? s.url ?? '').trim() || null
								)
							}
						}
						// out-model 锚点还会额外读取 format / sourceNodeType 等（如果后面要用到）
					}
				}
				// ② fromNode 顶层任一字段（兼容新链路 decompose 把路径直接塞进节点顶层）
				const rawTopCandidates = [
					(fromNode as Record<string, unknown>).modelAssetProjectRelativePath,
					(fromNode as Record<string, unknown>).modelProjectRelativePath,
					(fromNode as Record<string, unknown>).modelAssetUrl,
					(fromNode as Record<string, unknown>).modelUrl,
					(fromNode as Record<string, unknown>).modelAssetPath,
					(fromNode as Record<string, unknown>).modelSourcePath,
					(fromNode as Record<string, unknown>).resolvedModelPath,
					(fromNode as Record<string, unknown>).localAssetUrl,
					(fromNode as Record<string, unknown>).localAssetPath
				]
				for (const c of rawTopCandidates) harderCandidates.push(c ? String(c).trim() : null)
				// ③ 再拿 resourceId 硬扫 resourcesById（这次不挑字段，全扔给 pickBestModelUrlFromCandidates）
				const nodeResourceId = String(fromNode.resourceId ?? '').trim()
				const ridFromSettings = String(
					((fromNode.model3dSettings ?? fromNode.settings ?? fromNode) as Record<string, unknown>).resourceId ?? ''
				).trim()
				const finalResourceId = nodeResourceId || ridFromSettings
				if (finalResourceId && options.store.state.resourcesById) {
					const r = options.store.state.resourcesById[finalResourceId]
					if (r) {
						harderCandidates.push(
							String(r.projectRelativePath ?? '').trim() || null,
							String(r.absolutePath ?? '').trim() || null,
							String(r.sourcePath ?? '').trim() || null,
							String(r.url ?? '').trim() || null,
							String(r.assetUrl ?? '').trim() || null,
							String(r.localUrl ?? '').trim() || null,
							String(r.name ?? '').trim() || null
						)
					}
				}
				const best = pickBestModelUrlFromCandidates(harderCandidates as Array<string | null | undefined>)
				if (best) {
					// 有候选 → 用 best 路径再做一次 extractModelInfoFromSettings（这次应该能命中了，
					//   因为 pickBestModelUrlFromCandidates 已经做了 isLikely3DModelUrl + 缩略图恢复）
					const overrideFormat = detectModelFormatFromPath(best)
					const relPath = (() => {
						// 如果 best 是 dweb://...?path=Content/Media/xxx.glb → 抽成相对路径
						const m1 = /\?(?:.*&)?(?:path|relativePath|assetPath|filePath)=([^&]+)/.exec(best)
						if (m1 && m1[1]) {
							try { return decodeURIComponent(m1[1]).split('?')[0].split('#')[0] } catch { /* ignore */ }
						}
						// 如果是 Content/Media/xxx.glb 相对路径就直接用
						if (/^Content[\\/]/i.test(best)) return best.replace(/\\/g, '/')
						// 如果是 file:/// 去掉前缀
						const m2 = /^file:\/\/\/+([a-zA-Z]:[\\/].+)$/.exec(best)
						if (m2 && m2[1]) return m2[1].replace(/\\/g, '/')
						// 绝对路径直接用
						return best.replace(/\\/g, '/')
					})()
					const isRel = /^Content[\\/]/i.test(relPath)
					extractedInfo = normalizeModelPaths({
						modelUrl: best,
						modelAssetUrl: best,
						modelSourcePath: !isRel ? relPath : undefined,
						modelAssetPath: !isRel ? relPath : undefined,
						modelProjectRelativePath: isRel ? relPath : undefined,
						modelAssetProjectRelativePath: isRel ? relPath : undefined,
						modelSourceName:
							String(
								(fromNode as Record<string, unknown>).modelSourceName ??
								fromNode.alias ?? fromNode.title ?? objectName
							).trim() || undefined,
						modelFormat: overrideFormat || 'glb',
						modelResourceId: finalResourceId || undefined
					})
				}
			}

			const finalHasPaths = !!(
				extractedInfo && (
					extractedInfo.modelUrl ||
					extractedInfo.modelAssetUrl ||
					extractedInfo.modelSourcePath ||
					extractedInfo.modelAssetPath ||
					extractedInfo.modelProjectRelativePath ||
					extractedInfo.modelAssetProjectRelativePath
				)
			)
			if (extractedInfo && finalHasPaths) {
				addOrMergeBinding(normalizeModelPaths({
					objectId,
					objectName,
					inputAnchorId: toAnchorId || sceneLayoutModelInputAnchorId(objectId),
					connected: true,
					sourceNodeId: fromNodeId,
					sourceNodeType: 'model3d',
					modelUrl: extractedInfo.modelUrl,
					modelAssetUrl: extractedInfo.modelAssetUrl,
					modelSourceName:
						extractedInfo.modelSourceName ||
						String(fromNode.alias ?? fromNode.title ?? objectName).trim() || undefined,
					modelSourcePath: extractedInfo.modelSourcePath,
					modelAssetPath: extractedInfo.modelAssetPath,
					modelProjectRelativePath: extractedInfo.modelProjectRelativePath,
					modelAssetProjectRelativePath: extractedInfo.modelAssetProjectRelativePath,
					modelFormat: extractedInfo.modelFormat
				}))
				continue
			}

			// 2026-08-03：就算到这里还没找到路径，也不放弃——把 binding 以 connected=false 的形式
			//   写入 bindingMap（addOrMergeBinding 已移除 !connected 门槛）。
			//   下游 buildPureDataSlotsForUnreal / prepareResolvedSlotsForExport 会再做
			//   一轮 resourcesById 按 sourceNodeId / modelResourceId 的终极兜底查找，
			//   保证"只要蓝图连线存在 → 这个 objectId 在 bindingMap 里至少有一条记录"。
			addOrMergeBinding({
				objectId,
				objectName,
				inputAnchorId: toAnchorId || sceneLayoutModelInputAnchorId(objectId),
				connected: false,
				sourceNodeId: fromNodeId,
				sourceNodeType: 'model3d'
			})
		}

		for (const item of allLayoutItems) {
			const itemRecord = item as Record<string, unknown>
			const objectId = String(itemRecord.id ?? '').trim()
			if (!objectId) continue
			if (bindingMap.has(objectId)) continue
			const inputAnchorId = sceneLayoutModelInputAnchorId(objectId)
			const edges = options.getIncomingEdges(nodeId, inputAnchorId)
			if (edges && edges.length > 0) continue
			bindingMap.set(objectId, {
				objectId,
				objectName: itemNameMap.get(objectId) || objectId,
				inputAnchorId,
				connected: false
			})
		}

		const results: WorkflowSceneLayoutModelBinding[] = []
		for (const [, binding] of bindingMap) {
			results.push(binding)
		}

		return results.sort((a, b) =>
			String(a.objectId ?? '').localeCompare(String(b.objectId ?? ''))
		)
	}

	const validateModelBindings = (
		bindings: unknown[]
	): {
		valid: WorkflowSceneLayoutModelBinding[]
		invalid: Array<{ binding: WorkflowSceneLayoutModelBinding; reason: string }>
		warnings: string[]
	} => {
		const valid: WorkflowSceneLayoutModelBinding[] = []
		const invalid: Array<{ binding: WorkflowSceneLayoutModelBinding; reason: string }> = []
		const warnings: string[] = []

		for (const item of bindings) {
			if (!item || typeof item !== 'object') continue
			const binding = item as WorkflowSceneLayoutModelBinding
			const objectId = String(binding.objectId ?? '').trim()
			const objectName = String(binding.objectName ?? objectId).trim()

			if (!binding.connected) {
				invalid.push({ binding, reason: t('aiworkflow.runtime.modelBindingNotConnected', { name: objectName }) })
				continue
			}

			const modelUrl = String(binding.modelUrl ?? '').trim()
			const modelAssetUrl = String(binding.modelAssetUrl ?? '').trim()
			const modelSourcePath = String(binding.modelSourcePath ?? '').trim()
			const modelAssetPath = String(binding.modelAssetPath ?? '').trim()

			const anyPath = modelUrl || modelAssetUrl || modelSourcePath || modelAssetPath
			if (!anyPath) {
				invalid.push({ binding, reason: t('aiworkflow.runtime.modelBindingNoPath', { name: objectName }) })
				continue
			}

			const finalPath = modelSourcePath || modelAssetPath || modelUrl || modelAssetUrl
			const format = binding.modelFormat || detectModelFormatFromPath(finalPath)
			if (!format) {
				warnings.push(t('aiworkflow.runtime.modelBindingUnknownFormat', { name: objectName, path: finalPath }))
			} else if (!SUPPORTED_MODEL_EXTENSIONS.includes(`.${format}`)) {
				warnings.push(t('aiworkflow.runtime.modelBindingUnsupportedFormat', { name: objectName, format, path: finalPath }))
			}

			const looksLikeHttp = /^https?:\/\//i.test(finalPath)
			const looksLikeLocalFile = /[a-zA-Z]:[\\/]/.test(finalPath) || finalPath.startsWith('/')
			if (!looksLikeHttp && !looksLikeLocalFile) {
				warnings.push(t('aiworkflow.runtime.modelBindingUnrecognizedPath', { name: objectName, path: finalPath }))
			}

			valid.push(binding)
		}

		return { valid, invalid, warnings }
	}

	return {
		sceneLayoutModelInputAnchorId,
		connectedSceneLayoutModelBindings,
		validateModelBindings,
		detectModelFormatFromPath,
		SUPPORTED_MODEL_EXTENSIONS
	}
}
