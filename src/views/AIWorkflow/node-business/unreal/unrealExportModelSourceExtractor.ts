/**
 * unrealExportModelSourceExtractor.ts
 *
 * 统一的类型专用模型源提取器（导出链路与预览链路共用，消除逻辑分叉）。
 *
 * 背景（AIPlan/02_虚幻导出节点获取场景布局3D模型资源修复设计方案.md §5.2）：
 *   虚幻导出节点 buildUnrealExportPayload 的 FORCE-REBUILD 块原本使用"通用提取"
 *   （仅读 outputs / 顶层字段 / resourceId），不读 meshySettings / tripo3dSettings /
 *   model3dSettings 深嵌套字段，导致类别 A 真实静态资产路径丢失。
 *   本提取器复用预览模式 connectedSceneLayoutModelBindings 的同款类型专用提取逻辑，
 *   供 FORCE-REBUILD 补漏时调用，确保"预览能渲染的真实模型文件，导出一定能拿到"。
 *
 * 设计原则：
 *   1. meshy 节点 → 复用 getMeshyEffectiveModelSource（读 meshyRelationSummary 深字段）
 *   2. tripo3d 节点 → 复用 getTripo3DEffectiveModelSource（读 tripo3dRelationSummary 深字段）
 *   3. model3d 节点 → 复用 extractModelInfoFromSettings + 多阶段 fallback + HARDER 兜底
 *   4. 其它节点 → 通用兜底（outputs / 顶层字段 / resourceId）
 *   5. 屏蔽 meshy/tripo3d 远端 CDN URL（assets.meshy.ai / assets.tripo3d.ai）
 *   6. 复用 normalizeModelPaths 做 dvcache/dweb 路径修复，与预览完全一致
 */

import type { WorkflowModelFormat } from '../../../../aiworkflow/types'
import { isMeshyRemoteUrl, getMeshyEffectiveModelSource } from '../meshy/useAIWorkflowMeshyAssets'
import {
	extractModelInfoFromSettings,
	getTripo3DEffectiveModelSource,
	normalizeModelPaths
} from '../scene/useAIWorkflowSceneLayoutModelBindings'
import { detectModelFormatFromPath, pickBestModelUrlFromCandidates } from './unrealExportUtils'

// ===== 类型定义 =====

export interface UpstreamModelSource {
	modelUrl?: string
	modelAssetUrl?: string
	modelSourcePath?: string
	modelAssetPath?: string
	modelProjectRelativePath?: string
	modelAssetProjectRelativePath?: string
	modelSourceName?: string
	modelFormat?: WorkflowModelFormat
	modelResourceId?: string
	sourceNodeType: string
}

// ===== 辅助：Tripo3D 远端 CDN URL 屏蔽（与 useAIWorkflowSceneLayoutModelBindings.ts 同款）=====

const isTripo3DRemoteUrl = (url: string): boolean => {
	if (!url) return false
	try {
		const parsed = new URL(url)
		return /(^|\.)tripo3d\.ai$/i.test(parsed.hostname)
	} catch {
		return /https?:\/\/[^\s]*tripo3d\.ai(?:\/|$)/i.test(url)
	}
}

// ===== 辅助：从 best 路径解析出相对/绝对路径（与预览链路同款）=====

const resolveRelPathFromBest = (best: string): { relPath: string; isRel: boolean } => {
	const m1 = /\?(?:.*&)?(?:path|relativePath|assetPath|filePath)=([^&]+)/.exec(best)
	if (m1 && m1[1]) {
		try {
			return { relPath: decodeURIComponent(m1[1]).split('?')[0].split('#')[0], isRel: true }
		} catch {
			/* ignore */
		}
	}
	if (/^Content[\\/]/i.test(best)) {
		return { relPath: best.replace(/\\/g, '/'), isRel: true }
	}
	const m2 = /^file:\/\/\/+([a-zA-Z]:[\\/].+)$/.exec(best)
	if (m2 && m2[1]) {
		return { relPath: m2[1].replace(/\\/g, '/'), isRel: false }
	}
	return { relPath: best.replace(/\\/g, '/'), isRel: false }
}

// ===== 辅助：远端 CDN URL 检测（硬约束：绝对禁止使用远端 URL 读取模型）=====
//   模型已经本地下载到 Content/Media/，远端 CDN URL（assets.meshy.ai / assets.tripo3d.ai）
//   在 UE 端会因 CORS / 签名过期 / 认证失败而无法下载，必须丢弃。

const isRemoteCdnUrl = (url: string): boolean => {
	if (!url) return false
	const lower = url.toLowerCase()
	if (lower.includes('meshy.ai') || lower.includes('tripo3d.ai')) return true
	if (lower.startsWith('http://') || lower.startsWith('https://')) {
		try {
			const parsed = new URL(url)
			const host = parsed.hostname.toLowerCase()
			if (host === 'localhost' || host === '127.0.0.1') return false
			return true
		} catch {
			return true
		}
	}
	return false
}

// ===== 辅助：清除 UpstreamModelSource 中的远端 CDN URL（硬约束执行）=====
//   modelUrl / modelAssetUrl 如果是远端 CDN URL，强制设为 undefined。
//   本地路径字段（modelSourcePath / modelAssetPath / modelProjectRelativePath /
//   modelAssetProjectRelativePath）保持不变，它们来自 resourcesById 或 model3dSettings 本地字段。

const sanitizeRemoteUrls = (source: UpstreamModelSource): UpstreamModelSource => {
	const cleaned = { ...source }
	if (cleaned.modelUrl && isRemoteCdnUrl(cleaned.modelUrl)) {
		cleaned.modelUrl = undefined
	}
	if (cleaned.modelAssetUrl && isRemoteCdnUrl(cleaned.modelAssetUrl)) {
		cleaned.modelAssetUrl = undefined
	}
	return cleaned
}

// ===== 辅助：通用兜底提取（outputs / 顶层字段 / resourceId）=====
//   与 FORCE-REBUILD 原通用提取逻辑一致，供"非 meshy/tripo3d/model3d"节点类型使用，
//   也作为 model3d 分支 HARDER 兜底的候选源。

const collectGenericCandidates = (
	fromNode: Record<string, unknown>,
	resourcesById: Record<string, Record<string, unknown>> | undefined
): { candidates: Array<string | null | undefined>; fallbackFormat: WorkflowModelFormat } => {
	const candidates: Array<string | null | undefined> = []
	let fallbackFormat: WorkflowModelFormat = 'glb'

	// ① outputs 所有锚点的 resolved / cached / value
	if (Array.isArray(fromNode.outputs)) {
		for (const out of fromNode.outputs as unknown[]) {
			if (!out || typeof out !== 'object') continue
			const o = out as Record<string, unknown>
			for (const src of [o.resolved, o.cached, o.value]) {
				if (!src) continue
				if (typeof src === 'string') {
					candidates.push(src)
				} else if (typeof src === 'object') {
					const s = src as Record<string, unknown>
					candidates.push(
						String(s.modelAssetProjectRelativePath ?? s.modelProjectRelativePath ?? '').trim() ||
							null
					)
					candidates.push(String(s.modelAssetPath ?? s.modelSourcePath ?? '').trim() || null)
					candidates.push(String(s.modelAssetUrl ?? s.modelUrl ?? '').trim() || null)
					candidates.push(
						String(s.projectRelativePath ?? s.absolutePath ?? s.sourcePath ?? '').trim() || null
					)
					candidates.push(String(s.assetUrl ?? s.preferredUrl ?? s.url ?? '').trim() || null)
					const fmt = detectModelFormatFromPath(
						String(s.modelAssetProjectRelativePath ?? s.modelAssetUrl ?? s.url ?? '')
					)
					if (fmt) fallbackFormat = fmt
				}
			}
		}
	}

	// ② 节点顶层字段
	const topKeys = [
		'modelAssetProjectRelativePath',
		'modelProjectRelativePath',
		'modelAssetUrl',
		'modelUrl',
		'modelAssetPath',
		'modelSourcePath',
		'resolvedModelPath',
		'localAssetUrl',
		'localAssetPath'
	] as const
	for (const k of topKeys) {
		const v = String(fromNode[k] ?? '').trim()
		if (v) candidates.push(v)
		const fmt = detectModelFormatFromPath(v)
		if (fmt) fallbackFormat = fmt
	}

	// ③ resourceId → resourcesById（查全部嵌套 resourceId，与 FORCE-REBUILD 第 748 行一致）
	const fnResId = String(
		fromNode.resourceId ??
			(fromNode.model3dSettings as Record<string, unknown> | undefined)?.resourceId ??
			(fromNode.tripo3dSettings as Record<string, unknown> | undefined)?.resourceId ??
			(fromNode.meshySettings as Record<string, unknown> | undefined)?.resourceId ??
			''
	).trim()
	if (fnResId && resourcesById && resourcesById[fnResId]) {
		const r = resourcesById[fnResId] as Record<string, unknown>
		candidates.push(String(r.projectRelativePath ?? '').trim() || null)
		candidates.push(String(r.absolutePath ?? '').trim() || null)
		candidates.push(String(r.sourcePath ?? '').trim() || null)
		candidates.push(String(r.url ?? '').trim() || null)
		candidates.push(String(r.assetUrl ?? '').trim() || null)
		candidates.push(String(r.localUrl ?? '').trim() || null)
		const fmt = detectModelFormatFromPath(
			String(r.projectRelativePath ?? r.url ?? r.absolutePath ?? '')
		)
		if (fmt) fallbackFormat = fmt
	}

	return { candidates, fallbackFormat }
}

// ===== 辅助：从 best 路径构造 UpstreamModelSource =====

const buildSourceFromBest = (
	best: string,
	fallbackFormat: WorkflowModelFormat,
	fromNode: Record<string, unknown>,
	objectName: string | undefined,
	resourceId: string,
	sourceNodeType: string
): UpstreamModelSource => {
	const overrideFormat = detectModelFormatFromPath(best) || fallbackFormat
	const { relPath, isRel } = resolveRelPathFromBest(best)
	return normalizeModelPaths({
		sourceNodeType,
		modelUrl: best,
		modelAssetUrl: best,
		modelSourcePath: !isRel ? relPath : undefined,
		modelAssetPath: !isRel ? relPath : undefined,
		modelProjectRelativePath: isRel ? relPath : undefined,
		modelAssetProjectRelativePath: isRel ? relPath : undefined,
		modelSourceName:
			String(
				fromNode.modelSourceName ?? fromNode.alias ?? fromNode.title ?? objectName ?? ''
			).trim() || undefined,
		modelFormat: overrideFormat,
		modelResourceId: resourceId || undefined
	})
}

// ===== 主入口：从上游 3D 模型节点提取模型源信息 =====
//   与 connectedSceneLayoutModelBindings 的提取逻辑完全一致，消除分叉。
//   返回 null 表示该节点没有真实静态资产（占位体等待填充）。

export function extractModelSourceFromUpstreamNode(
	fromNode: Record<string, unknown> | null | undefined,
	resourcesById?: Record<string, Record<string, unknown>> | null
): UpstreamModelSource | null {
	if (!fromNode || typeof fromNode !== 'object') return null

	const fromNodeType = String(fromNode.type ?? '').trim()
	const objectName = String(fromNode.alias ?? fromNode.title ?? '').trim() || undefined
	const safeResourcesById =
		resourcesById && typeof resourcesById === 'object'
			? (resourcesById as Record<string, Record<string, unknown>>)
			: undefined

	// ========================================================================
	// 分支 1：meshy 节点 → 复用 getMeshyEffectiveModelSource
	//   读取 meshyRelationSummary.effectiveLocalAssetUrl / meshyOutputAssetUrl /
	//   meshyOutputSummary.assetUrl 等深嵌套字段
	// ========================================================================
	if (fromNodeType === 'meshy') {
		const effective = getMeshyEffectiveModelSource(
			fromNode.meshySettings as Record<string, unknown> | undefined
		)
		const modelAssetUrl = String(effective.assetUrl ?? '').trim()
		const rawModelUrl = String(effective.preferredUrl ?? modelAssetUrl ?? '').trim()
		const modelAssetPath = String(effective.assetPath ?? '').trim()
		// 屏蔽 meshy 远端 CDN URL（硬约束：禁止直接加载外部 URL）
		const modelUrl = isMeshyRemoteUrl(rawModelUrl) ? '' : rawModelUrl
		const safeAssetUrl = isMeshyRemoteUrl(modelAssetUrl) ? '' : modelAssetUrl
		const format: WorkflowModelFormat = effective.format === 'gltf' ? 'gltf' : 'glb'
		const hasModel = !!(modelUrl || safeAssetUrl || modelAssetPath)
		if (!hasModel) return null
		return sanitizeRemoteUrls(
			normalizeModelPaths({
				sourceNodeType: 'meshy',
				modelUrl: modelUrl || undefined,
				modelAssetUrl: safeAssetUrl || undefined,
				modelSourceName: objectName,
				modelSourcePath: modelAssetPath || undefined,
				modelAssetPath: modelAssetPath || undefined,
				modelFormat: format
			})
		)
	}

	// ========================================================================
	// 分支 2：tripo3d 节点 → 复用 getTripo3DEffectiveModelSource
	//   读取 tripo3dRelationSummary.effectiveLocalAssetUrl / tripo3dOutputAssetUrl 等
	// ========================================================================
	if (fromNodeType === 'tripo3d') {
		const effective = getTripo3DEffectiveModelSource(
			fromNode.tripo3dSettings as Record<string, unknown> | undefined
		)
		const modelAssetUrl = String(effective.assetUrl ?? '').trim()
		const rawModelUrl = String(effective.preferredUrl ?? modelAssetUrl ?? '').trim()
		const modelAssetPath = String(effective.assetPath ?? '').trim()
		// 屏蔽 tripo3d 远端 CDN URL（硬约束：禁止直接加载外部 URL）
		const modelUrl = isTripo3DRemoteUrl(rawModelUrl) ? '' : rawModelUrl
		const safeAssetUrl = isTripo3DRemoteUrl(modelAssetUrl) ? '' : modelAssetUrl
		const format: WorkflowModelFormat = effective.format === 'gltf' ? 'gltf' : 'glb'
		const hasModel = !!(modelUrl || safeAssetUrl || modelAssetPath)
		if (!hasModel) return null
		return sanitizeRemoteUrls(
			normalizeModelPaths({
				sourceNodeType: 'tripo3d',
				modelUrl: modelUrl || undefined,
				modelAssetUrl: safeAssetUrl || undefined,
				modelSourceName: objectName,
				modelSourcePath: modelAssetPath || undefined,
				modelAssetPath: modelAssetPath || undefined,
				modelFormat: format
			})
		)
	}

	// ========================================================================
	// 分支 3：model3d 节点 → 复用 extractModelInfoFromSettings + 多阶段 fallback + HARDER 兜底
	//   与 connectedSceneLayoutModelBindings 第 687-894 行完全一致
	// ========================================================================
	if (fromNodeType === 'model3d' || fromNodeType === '') {
		// 阶段 1：extractModelInfoFromSettings 多 settings 源尝试
		const settingsToCheck: Array<Record<string, unknown> | null | undefined> = [
			fromNode.model3dSettings as Record<string, unknown> | undefined,
			fromNode.settings as Record<string, unknown> | undefined,
			fromNode
		]

		let extractedInfo: ReturnType<typeof extractModelInfoFromSettings> | null = null
		for (const settings of settingsToCheck) {
			const info = extractModelInfoFromSettings(
				settings,
				safeResourcesById,
				String(fromNode.resourceId ?? '')
			)
			if (
				info.modelUrl ||
				info.modelAssetUrl ||
				info.modelSourcePath ||
				info.modelAssetPath ||
				info.modelProjectRelativePath
			) {
				extractedInfo = info
				break
			}
		}

		// 阶段 2：fallback fromNode.meshySettings（model3d 节点内嵌 meshy 子设置）
		if (!extractedInfo && fromNode.meshySettings) {
			const effective = getMeshyEffectiveModelSource(
				fromNode.meshySettings as Record<string, unknown>
			)
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
					modelSourceName: objectName,
					modelFormat: effective.format === 'gltf' ? 'gltf' : 'glb'
				})
			}
		}

		// 阶段 3：fallback model3dSettings.meshyModelSettings（内嵌 meshy 模型设置）
		if (!extractedInfo) {
			const m3dSettings = fromNode.model3dSettings as Record<string, unknown> | undefined
			const innerMeshy = m3dSettings?.meshyModelSettings as Record<string, unknown> | undefined
			if (innerMeshy) {
				const effective = getMeshyEffectiveModelSource(innerMeshy)
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
						modelSourceName: objectName,
						modelFormat: effective.format === 'gltf' ? 'gltf' : 'glb'
					})
				}
			}
		}

		// 阶段 4：fallback resourceId → resourcesById 直接构造
		if (!extractedInfo) {
			const nodeResourceId = String(fromNode.resourceId ?? '').trim()
			if (nodeResourceId && safeResourcesById) {
				const resource = safeResourcesById[nodeResourceId]
				if (resource) {
					const resourceUrl = String(resource.url ?? '').trim()
					const resourceSourcePath = String(resource.sourcePath ?? '').trim()
					const resourceAssetPath = String(resource.absolutePath ?? '').trim()
					const resourceProjectRelativePath = String(resource.projectRelativePath ?? '').trim()
					const resourceName = String(resource.name ?? '').trim()
					const finalPath = resourceAssetPath || resourceSourcePath
					if (resourceUrl || finalPath || resourceProjectRelativePath) {
						extractedInfo = extractModelInfoFromSettings(
							{
								modelUrl: resourceUrl,
								modelAssetUrl: resourceUrl,
								modelSourcePath: finalPath,
								modelAssetPath: finalPath,
								modelProjectRelativePath: resourceProjectRelativePath,
								modelSourceName: resourceName,
								resourceId: nodeResourceId
							},
							safeResourcesById,
							nodeResourceId
						)
					}
				}
			}
		}

		// 阶段 5：HARDER 兜底 —— outputs / 顶层字段 / resourceId → pickBestModelUrlFromCandidates
		const hasExtractedPaths = !!(
			extractedInfo &&
			(extractedInfo.modelUrl ||
				extractedInfo.modelAssetUrl ||
				extractedInfo.modelSourcePath ||
				extractedInfo.modelAssetPath ||
				extractedInfo.modelProjectRelativePath ||
				extractedInfo.modelAssetProjectRelativePath)
		)
		if (!hasExtractedPaths) {
			const { candidates, fallbackFormat } = collectGenericCandidates(fromNode, safeResourcesById)
			const best = pickBestModelUrlFromCandidates(candidates as Array<string | null | undefined>)
			if (best) {
				const nodeResourceId = String(fromNode.resourceId ?? '').trim()
				const ridFromSettings = String(
					((fromNode.model3dSettings ?? fromNode.settings ?? fromNode) as Record<string, unknown>)
						.resourceId ?? ''
				).trim()
				const finalResourceId = nodeResourceId || ridFromSettings
				return sanitizeRemoteUrls(
					buildSourceFromBest(
						best,
						fallbackFormat,
						fromNode,
						objectName,
						finalResourceId,
						'model3d'
					)
				)
			}
		}

		if (extractedInfo) {
			const finalHasPaths = !!(
				extractedInfo.modelUrl ||
				extractedInfo.modelAssetUrl ||
				extractedInfo.modelSourcePath ||
				extractedInfo.modelAssetPath ||
				extractedInfo.modelProjectRelativePath ||
				extractedInfo.modelAssetProjectRelativePath
			)
			if (finalHasPaths) {
				return sanitizeRemoteUrls(
					normalizeModelPaths({
						sourceNodeType: 'model3d',
						modelUrl: extractedInfo.modelUrl,
						modelAssetUrl: extractedInfo.modelAssetUrl,
						modelSourceName: extractedInfo.modelSourceName || objectName,
						modelSourcePath: extractedInfo.modelSourcePath,
						modelAssetPath: extractedInfo.modelAssetPath,
						modelProjectRelativePath: extractedInfo.modelProjectRelativePath,
						modelAssetProjectRelativePath: extractedInfo.modelAssetProjectRelativePath,
						modelFormat: extractedInfo.modelFormat,
						modelResourceId: extractedInfo.modelResourceId
					})
				)
			}
		}

		// model3d 节点无真实资产 → 返回 null（占位体等待填充）
		return null
	}

	// ========================================================================
	// 分支 4：其它节点类型 → 通用兜底（outputs / 顶层字段 / resourceId）
	//   保留 FORCE-REBUILD 原通用提取逻辑，作为防御性兜底
	// ========================================================================
	const { candidates, fallbackFormat } = collectGenericCandidates(fromNode, safeResourcesById)
	const best = pickBestModelUrlFromCandidates(candidates as Array<string | null | undefined>)
	if (!best) return null

	const fnResId = String(
		fromNode.resourceId ??
			(fromNode.model3dSettings as Record<string, unknown> | undefined)?.resourceId ??
			(fromNode.tripo3dSettings as Record<string, unknown> | undefined)?.resourceId ??
			(fromNode.meshySettings as Record<string, unknown> | undefined)?.resourceId ??
			''
	).trim()
	return sanitizeRemoteUrls(
		buildSourceFromBest(
			best,
			fallbackFormat,
			fromNode,
			objectName,
			fnResId,
			fromNodeType || 'model3d'
		)
	)
}
