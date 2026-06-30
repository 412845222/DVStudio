import type {
	WorkflowSceneLayoutManualModelBinding,
	WorkflowSceneLayoutModelBinding,
	WorkflowMeshyNodeSettings,
	WorkflowModelFormat
} from '../../../../aiworkflow/types'
import type { SceneDecomposeInputItem } from './sceneDecomposeShared'
import { isMeshyRemoteUrl } from '../meshy/useAIWorkflowMeshyAssets'

const SUPPORTED_MODEL_EXTENSIONS = ['.glb', '.gltf', '.fbx', '.obj', '.stl', '.dae']

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

const detectModelFormatFromPath = (pathOrUrl: string): WorkflowModelFormat | undefined => {
	if (!pathOrUrl) return undefined
	const lower = String(pathOrUrl).toLowerCase().trim()
	const queryIndex = lower.indexOf('?')
	const pathWithoutQuery = queryIndex >= 0 ? lower.substring(0, queryIndex) : lower
	for (const ext of SUPPORTED_MODEL_EXTENSIONS) {
		if (pathWithoutQuery.endsWith(ext)) {
			return ext.substring(1) as WorkflowModelFormat
		}
	}
	return undefined
}

const extractModelInfoFromSettings = (
	settings: Record<string, unknown> | null | undefined,
	resourcesById?: Record<string, Record<string, unknown>>
): {
	modelUrl?: string
	modelAssetUrl?: string
	modelSourcePath?: string
	modelAssetPath?: string
	modelProjectRelativePath?: string
	modelAssetProjectRelativePath?: string
	modelSourceName?: string
	modelFormat?: WorkflowModelFormat
} => {
	if (!settings) return {}
	const modelAssetUrl = String(settings.modelAssetUrl ?? '').trim()
	const modelUrl = String(settings.modelUrl ?? modelAssetUrl ?? '').trim()
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
		modelFormat
	}

	const resourceId = String((settings as Record<string, unknown>).resourceId ?? '').trim()
	if (resourcesById && resourceId && (!modelUrl && !modelAssetUrl && !modelSourcePath && !modelAssetPath)) {
		const resource = resourcesById[resourceId]
		if (resource) {
			const resourceUrl = String(resource.url ?? '').trim()
			const resourceSourcePath = String(resource.sourcePath ?? '').trim()
			const resourceProjectRelativePath = String(resource.projectRelativePath ?? '').trim()
			const resourceAssetPath = String(resource.absolutePath ?? '').trim()
			const resourceName = String(resource.name ?? '').trim()
			if (resourceUrl) {
				result.modelUrl = resourceUrl
				result.modelAssetUrl = resourceUrl
			}
			if (resourceSourcePath || resourceAssetPath) {
				const finalSourcePath = resourceAssetPath || resourceSourcePath
				result.modelSourcePath = finalSourcePath
				result.modelAssetPath = finalSourcePath
			}
			if (resourceProjectRelativePath) {
				result.modelProjectRelativePath = resourceProjectRelativePath
				result.modelAssetProjectRelativePath = resourceProjectRelativePath
			}
			if (resourceName) {
				result.modelSourceName = resourceName
			}
			if (!result.modelFormat) {
				result.modelFormat = detectModelFormatFromPath(resourceUrl || resourceSourcePath || resourceAssetPath || resourceName) || 'glb'
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
			if (!binding || !binding.connected) return
			const objectId = String(binding.objectId ?? '').trim()
			if (!objectId) return
			const existing = bindingMap.get(objectId)
			if (existing) {
				if (!existing.modelUrl && binding.modelUrl) existing.modelUrl = binding.modelUrl
				if (!existing.modelAssetUrl && binding.modelAssetUrl) existing.modelAssetUrl = binding.modelAssetUrl
				if (!existing.modelSourcePath && binding.modelSourcePath) existing.modelSourcePath = binding.modelSourcePath
				if (!existing.modelAssetPath && binding.modelAssetPath) existing.modelAssetPath = binding.modelAssetPath
				if (!existing.modelSourceName && binding.modelSourceName) existing.modelSourceName = binding.modelSourceName
				if (!existing.modelFormat && binding.modelFormat) existing.modelFormat = binding.modelFormat
				if (!existing.objectName && binding.objectName) existing.objectName = binding.objectName
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
			if (fromNodeType !== 'model3d' && fromNodeType !== 'meshy') continue

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

			let extractedInfo: ReturnType<typeof extractModelInfoFromSettings> | null = null

			const settingsToCheck: Array<Record<string, unknown> | null | undefined> = [
				fromNode.model3dSettings as Record<string, unknown> | undefined,
				fromNode.settings as Record<string, unknown> | undefined,
				fromNode
			]
			
			for (const settings of settingsToCheck) {
				const info = extractModelInfoFromSettings(settings, options.store.state.resourcesById)
				if (info.modelUrl || info.modelAssetUrl || info.modelSourcePath || info.modelAssetPath) {
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
						const resourceName = String(resource.name ?? '').trim()
						const finalPath = resourceAssetPath || resourceSourcePath
						if (resourceUrl || finalPath) {
							extractedInfo = extractModelInfoFromSettings({
								modelUrl: resourceUrl,
								modelAssetUrl: resourceUrl,
								modelSourcePath: finalPath,
								modelAssetPath: finalPath,
								modelSourceName: resourceName
							})
						}
					}
				}
			}
			
			if (extractedInfo && (extractedInfo.modelUrl || extractedInfo.modelAssetUrl || extractedInfo.modelSourcePath || extractedInfo.modelAssetPath)) {
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
				invalid.push({ binding, reason: `[${objectName}] 未连接模型节点` })
				continue
			}

			const modelUrl = String(binding.modelUrl ?? '').trim()
			const modelAssetUrl = String(binding.modelAssetUrl ?? '').trim()
			const modelSourcePath = String(binding.modelSourcePath ?? '').trim()
			const modelAssetPath = String(binding.modelAssetPath ?? '').trim()

			const anyPath = modelUrl || modelAssetUrl || modelSourcePath || modelAssetPath
			if (!anyPath) {
				invalid.push({ binding, reason: `[${objectName}] 已连接但未找到模型文件路径` })
				continue
			}

			const finalPath = modelSourcePath || modelAssetPath || modelUrl || modelAssetUrl
			const format = binding.modelFormat || detectModelFormatFromPath(finalPath)
			if (!format) {
				warnings.push(`[${objectName}] 无法识别模型格式，将按glb处理: ${finalPath}`)
			} else if (!SUPPORTED_MODEL_EXTENSIONS.includes(`.${format}`)) {
				warnings.push(`[${objectName}] 模型格式 ${format} 可能不受支持: ${finalPath}`)
			}

			const looksLikeHttp = /^https?:\/\//i.test(finalPath)
			const looksLikeLocalFile = /[a-zA-Z]:[\\/]/.test(finalPath) || finalPath.startsWith('/')
			if (!looksLikeHttp && !looksLikeLocalFile) {
				warnings.push(`[${objectName}] 路径格式无法识别为URL或本地文件: ${finalPath}`)
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
