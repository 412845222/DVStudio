import type { AIWorkflowDraftSnapshot } from '../../../../aiworkflow/persistence/blueprintSnapshot'
import { getErrorMessage } from '../../../../types/utils'
import {
	sanitizeWorkflowMediaUrl,
	sanitizeWorkflowUrlFieldsDeep,
	sanitizeResourceName,
	sanitizeLocalFilePath,
	isFileProtocolUrl
} from '../../../../aiworkflow/domain/resource/safeWorkflowUrl'

export const useAIWorkflowProjectSnapshotRuntime = (payload: {
	store: {
		commit: (type: string, value: any) => void
	}
	currentProjectId: { value: number | null }
	isElectronRuntime: boolean
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
}) => {
	const buildProjectAssetRuntimeUrl = (
		projectId: number,
		projectRelativePath: string,
		fallbackUrl?: string
	) => {
		const pid = Number(projectId)
		const rel = String(projectRelativePath || '').trim()
		if (payload.isElectronRuntime && Number.isFinite(pid) && pid > 0 && rel) {
			return `dweb://project-assets?projectId=${encodeURIComponent(String(Math.floor(pid)))}&path=${encodeURIComponent(rel)}`
		}
		return String(fallbackUrl || '').trim()
	}

	const sanitizeBlueprintSnapshotForRuntime = (snapshot: any): AIWorkflowDraftSnapshot => {
		let cloned: any = snapshot
		try {
			cloned = JSON.parse(JSON.stringify(snapshot))
		} catch {
			// keep original object when deep clone fails
		}

		if (!cloned || typeof cloned !== 'object') return snapshot as AIWorkflowDraftSnapshot

		const nodesById =
			cloned.nodesById && typeof cloned.nodesById === 'object' ? cloned.nodesById : {}
		const nodeOrder = Array.isArray(cloned.nodeOrder) ? cloned.nodeOrder : Object.keys(nodesById)
		for (const rawNodeId of nodeOrder) {
			const nodeId = String(rawNodeId ?? '').trim()
			if (!nodeId) continue
			const node = nodesById[nodeId]
			if (!node || typeof node !== 'object') continue
			const nodeType = String((node as any).type ?? '')
				.trim()
				.toLowerCase()

			if (nodeType === 'scene-decompose') {
				const settings = (node as any).sceneDecomposeSettings
				const outputs = Array.isArray(settings?.outputs) ? settings.outputs : []
				;(node as any).sceneDecomposeSettings = {
					...(settings && typeof settings === 'object' ? settings : {}),
					outputs: outputs
						.filter((item: any) => item && typeof item === 'object')
						.map((item: any, index: number) => {
							const fallbackId = `legacy-${index + 1}`
							const id =
								String(item.id ?? item.objectId ?? item.name ?? fallbackId).trim() || fallbackId
							return {
								...item,
								id,
								objectId: String(item.objectId ?? id).trim() || id,
								name:
									String(item.name ?? item.objectName ?? `obj_${index + 1}`).trim() ||
									`obj_${index + 1}`,
								imageAnchorId:
									String(item.imageAnchorId ?? `out-image-${id}`).trim() || `out-image-${id}`,
								textAnchorId:
									String(item.textAnchorId ?? `out-text-${id}`).trim() || `out-text-${id}`
							}
						})
				}
				continue
			}

			if (nodeType === 'scene-layout') {
				const settings = (node as any).sceneLayoutSettings
				const manualModelBindings = Array.isArray(settings?.manualModelBindings)
					? settings.manualModelBindings.filter((item: any) => item && typeof item === 'object')
					: []
				const layoutItems = Array.isArray(settings?.layoutItems)
					? settings.layoutItems.filter((item: any) => item && typeof item === 'object')
					: []
				;(node as any).sceneLayoutSettings = {
					...(settings && typeof settings === 'object' ? settings : {}),
					layoutItems,
					manualModelBindings
				}
			}
		}

		const resourcesById =
			cloned.resourcesById && typeof cloned.resourcesById === 'object' ? cloned.resourcesById : {}
		const runtimeProjectId = Number(payload.currentProjectId?.value ?? 0)

		// 清洗与规范化所有资源引用
		// 1. 确保资源名称不包含中文/非法字符
		// 2. 确保不使用 file:// 协议
		// 3. 优先使用 projectRelativePath 构建 dweb://project-assets URL
		for (const [resourceId, resource] of Object.entries(resourcesById)) {
			if (!resource || typeof resource !== 'object') continue

			const kind =
				String((resource as any).kind ?? '').toLowerCase() === 'video' ? 'video' : 'image'

			// 清洗资源名称：去除中文等非法字符
			const safeName = sanitizeResourceName((resource as any).name, `${kind}_${resourceId}`)

			const projectRelativePath = String(
				(resource as any).projectRelativePath ?? (resource as any).relativePath ?? ''
			).trim()
			const posterProjectRelativePath = String(
				(resource as any).posterProjectRelativePath ?? ''
			).trim()
			const sourcePath = sanitizeLocalFilePath((resource as any).sourcePath)
			const rawUrl = String((resource as any).url ?? '').trim()

			// 检测并清理 file:// 协议 URL
			const urlIsFileProtocol = isFileProtocolUrl(rawUrl)
			const originalUrl = urlIsFileProtocol ? '' : sanitizeWorkflowMediaUrl(rawUrl)

			// 从 dweb://project-assets URL 中解析 projectRelativePath
			let resolvedRelPath = projectRelativePath
			if (
				!resolvedRelPath &&
				originalUrl &&
				originalUrl.toLowerCase().startsWith('dweb://project-assets')
			) {
				try {
					const urlObj = new URL(originalUrl)
					const pathFromUrl = urlObj.searchParams.get('path')
					if (pathFromUrl) {
						resolvedRelPath = decodeURIComponent(pathFromUrl)
					}
				} catch {
					// ignore
				}
			}

			// 如果 URL 是 file:// 协议但有 sourcePath，尝试从 sourcePath 推断 projectRelativePath
			// 注意：此处无法获取 projectRootPath，留到后续 hydrate 阶段处理
			let runtimeUrl: string
			if (resolvedRelPath) {
				runtimeUrl = buildProjectAssetRuntimeUrl(runtimeProjectId, resolvedRelPath, originalUrl)
			} else if (originalUrl && !isFileProtocolUrl(originalUrl)) {
				runtimeUrl = originalUrl
			} else {
				runtimeUrl = ''
			}

			// 海报 URL 同样处理
			const rawPosterUrl = String((resource as any).posterUrl ?? '').trim()
			const posterUrlIsFileProtocol = isFileProtocolUrl(rawPosterUrl)
			const originalPosterUrl = posterUrlIsFileProtocol
				? ''
				: sanitizeWorkflowMediaUrl(rawPosterUrl)

			let resolvedPosterRelPath = posterProjectRelativePath
			if (
				!resolvedPosterRelPath &&
				originalPosterUrl &&
				originalPosterUrl.toLowerCase().startsWith('dweb://project-assets')
			) {
				try {
					const urlObj = new URL(originalPosterUrl)
					const pathFromUrl = urlObj.searchParams.get('path')
					if (pathFromUrl) {
						resolvedPosterRelPath = decodeURIComponent(pathFromUrl)
					}
				} catch {
					// ignore
				}
			}

			let runtimePosterUrl: string
			if (resolvedPosterRelPath) {
				runtimePosterUrl = buildProjectAssetRuntimeUrl(
					runtimeProjectId,
					resolvedPosterRelPath,
					originalPosterUrl
				)
			} else if (originalPosterUrl && !isFileProtocolUrl(originalPosterUrl)) {
				runtimePosterUrl = originalPosterUrl
			} else {
				runtimePosterUrl = ''
			}

			;(resourcesById as any)[resourceId] = {
				...(resource as any),
				id: String((resource as any).id ?? resourceId),
				name: safeName,
				projectRelativePath: resolvedRelPath || undefined,
				posterProjectRelativePath: resolvedPosterRelPath || undefined,
				sourcePath: sourcePath || undefined,
				url: runtimeUrl,
				posterUrl: runtimePosterUrl
			}
		}

		sanitizeWorkflowUrlFieldsDeep(cloned.nodesById)

		return cloned as AIWorkflowDraftSnapshot
	}

	const hydrateBlueprintSnapshotSafely = (
		snapshot: AIWorkflowDraftSnapshot,
		sourceLabel: string
	) => {
		try {
			payload.store.commit('hydrateDraft', { snapshot })
			return true
		} catch (err: unknown) {
			const message = getErrorMessage(err)
			payload.pushToast(`${sourceLabel}: blueprint data compatibility failed (${message})`, 'error')
			return false
		}
	}

	return {
		sanitizeBlueprintSnapshotForRuntime,
		hydrateBlueprintSnapshotSafely
	}
}
