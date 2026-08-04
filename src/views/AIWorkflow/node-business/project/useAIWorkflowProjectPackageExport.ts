import JSZip from 'jszip'
import { onBeforeUnmount, ref } from 'vue'
import { getErrorMessage } from '../../../../types/utils'
import { t } from '../../../../i18n'
import { resolveBackendUrl } from '../../../../network/backendConfig'
import {
	AIWF_PROJECT_PACKAGE_ENTRY,
	cleanupPackagedAssetUrl,
	cloneBlueprintSnapshotForPackaging,
	collectPackageNodeAssetCandidates,
	collectPackageReferencedResourceIds,
	fetchAssetBlobForPackage,
	guessAssetExtension,
	inferPackageAssetKind,
	isRemoteModelCdnUrl,
	sanitizeFileNamePart,
	setValueByJsonPointer,
	type AIWorkflowProjectPackageAssetEntry,
	type AIWorkflowProjectPackageAssetKind,
	type AIWorkflowProjectPackageAssetTarget,
	type AIWorkflowProjectPackageV1
} from './projectPackage'

import type { AIWorkflowDraftSnapshot } from '../../../../aiworkflow/persistence/blueprintSnapshot'

export const useAIWorkflowProjectPackageExport = (payload: {
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	buildPersistableSnapshotWithOptions: (opts: {
		uploadLocalResources: boolean
	}) => Promise<AIWorkflowDraftSnapshot>
	stripUnrealExportRuntimeFromSnapshot: (
		snapshot: AIWorkflowDraftSnapshot
	) => AIWorkflowDraftSnapshot
	currentProjectName: { value: string }
}) => {
	const packageExportProgress = ref({ active: false, progress: 0, stage: '', detail: '' })
	let packageExportProgressHideTimer = 0

	const clearPackageExportProgressHideTimer = () => {
		if (!packageExportProgressHideTimer) return
		window.clearTimeout(packageExportProgressHideTimer)
		packageExportProgressHideTimer = 0
	}

	const setPackageExportProgress = (stage: string, progress: number, detail = '') => {
		clearPackageExportProgressHideTimer()
		packageExportProgress.value = {
			active: true,
			progress: Math.max(0, Math.min(100, Number(progress) || 0)),
			stage: String(stage || '').trim() || t('aiworkflow.runtime.processing'),
			detail: String(detail || '').trim()
		}
	}

	const finishPackageExportProgress = (stage: string, detail = '') => {
		clearPackageExportProgressHideTimer()
		packageExportProgress.value = {
			active: true,
			progress: 100,
			stage: String(stage || '').trim() || t('aiworkflow.runtime.complete'),
			detail: String(detail || '').trim()
		}
		packageExportProgressHideTimer = window.setTimeout(() => {
			packageExportProgress.value = { active: false, progress: 0, stage: '', detail: '' }
			packageExportProgressHideTimer = 0
		}, 1400)
	}

	const resetPackageExportProgress = () => {
		clearPackageExportProgressHideTimer()
		packageExportProgress.value = { active: false, progress: 0, stage: '', detail: '' }
	}

	const onRequestExportProjectPackage = async () => {
		if (packageExportProgress.value.active) {
			payload.pushToast(t('aiworkflow.runtime.projectPackageExporting'), 'warn')
			return
		}
		try {
			setPackageExportProgress(
				t('aiworkflow.runtime.preparingSnapshot'),
				2,
				t('aiworkflow.runtime.packageDetailPreparingSnapshot')
			)
			const baseSnapshot = await payload.buildPersistableSnapshotWithOptions({
				uploadLocalResources: true
			})
			const snapshot = payload.stripUnrealExportRuntimeFromSnapshot(
				cloneBlueprintSnapshotForPackaging(baseSnapshot)
			)
			const zip = new JSZip()
			const assets: AIWorkflowProjectPackageAssetEntry[] = []
			let skipped = 0
			const referencedResourceIds = Array.from(collectPackageReferencedResourceIds(snapshot))
			const deepSnapshotAssetCandidates = collectPackageNodeAssetCandidates(snapshot)
			const cachedByUrl = new Map<
				string,
				{ filePath: string; blob: Blob; kind: AIWorkflowProjectPackageAssetKind }
			>()
			const totalResourceFetches = referencedResourceIds.reduce((count, rid) => {
				const resource = snapshot.resourcesById[rid]
				if (!resource) return count
				return (
					count +
					(cleanupPackagedAssetUrl(resource?.url) ? 1 : 0) +
					(cleanupPackagedAssetUrl(resource?.posterUrl) ? 1 : 0)
				)
			}, 0)
			const totalFetchSteps = Math.max(1, totalResourceFetches + deepSnapshotAssetCandidates.length)
			let processedFetchSteps = 0
			const updateFetchProgress = (stage: string, detail: string) => {
				const progress = 8 + (processedFetchSteps / totalFetchSteps) * 72
				setPackageExportProgress(stage, progress, detail)
			}

			for (const rid of referencedResourceIds) {
				const resource = snapshot.resourcesById[rid]
				if (!resource) continue
				// ============== 第 1 层：资源池 kind 修复（方案 §三 1.1） ==============
				const rawKind = String(resource.kind || '')
					.trim()
					.toLowerCase() as 'image' | 'video' | 'model3d'
				const kind: 'video' | 'image' | 'file' =
					rawKind === 'video'
						? 'video'
						: rawKind === 'image'
							? 'image'
							: rawKind === 'model3d'
								? 'file'
								: (null as unknown as 'video' | 'image' | 'file')
				if (!kind) continue

				const targets: AIWorkflowProjectPackageAssetTarget[] = ['url', 'posterUrl']
				for (const target of targets) {
					const rawUrl = cleanupPackagedAssetUrl(resource[target as keyof typeof resource])
					if (!rawUrl || rawUrl.startsWith('package://')) continue

					// ============== 第 1 层：本地优先解析 + 远端 HARD SKIP（方案 §三 1.2） ==============
					let resolvedUrl = rawUrl
					const urlIsRemote = isRemoteModelCdnUrl(resolvedUrl)
					let resolvedFromRemoteFallback = false

					if (urlIsRemote) {
						// 远端 URL：在当前 resource 内找本地替代
						const tryLocal: string[] = []
						// 优先：projectRelativePath / sourcePath（绝对路径 → resolveBackendUrl 会处理）
						if (resource.projectRelativePath) {
							tryLocal.push(String(resource.projectRelativePath))
						}
						if (resource.sourcePath) {
							tryLocal.push(String(resource.sourcePath))
						}
						// posterUrl 专用：posterProjectRelativePath / posterSourcePath
						if (target === 'posterUrl') {
							if (resource.posterProjectRelativePath) {
								tryLocal.push(String(resource.posterProjectRelativePath))
							}
							if (resource.posterSourcePath) {
								tryLocal.push(String(resource.posterSourcePath))
							}
						}

						let replaced = ''
						for (const candidate of tryLocal) {
							if (candidate && !isRemoteModelCdnUrl(candidate)) {
								replaced = candidate
								break
							}
						}

						if (replaced) {
							resolvedUrl = replaced
							resolvedFromRemoteFallback = true
							console.warn(
								`[package-export][resource-pool] 远端 URL → 替换为本地: ${replaced.substring(0, 120)}`
							)
						} else {
							// ❌ 远端 URL 且无本地替代 → 不调用 fetch，直接 skipped
							skipped += 1
							const resourceName = String(resource.name || rid)
							processedFetchSteps += 1
							updateFetchProgress(
								t('aiworkflow.runtime.collectingPoolAssets'),
								t('aiworkflow.runtime.packageDetailSkipped', {
									step: String(processedFetchSteps),
									total: String(totalFetchSteps),
									name: resourceName
								})
							)
							continue
						}
					}
					// ============== 本地优先解析结束 ==============

					const resourceName = String(resource.name || rid)
					updateFetchProgress(
						t('aiworkflow.runtime.collectingPoolAssets'),
						t('aiworkflow.runtime.packageDetailProgress', {
							step: String(processedFetchSteps + 1),
							total: String(totalFetchSteps),
							name: resourceName
						})
					)

					const blob = await fetchAssetBlobForPackage(resolvedUrl, resolveBackendUrl)
					processedFetchSteps += 1
					if (!blob) {
						skipped += 1
						updateFetchProgress(
							t('aiworkflow.runtime.collectingPoolAssets'),
							t('aiworkflow.runtime.packageDetailSkipped', {
								step: String(processedFetchSteps),
								total: String(totalFetchSteps),
								name: resourceName
							})
						)
						continue
					}

					// ============== 第 1 层：guess fallback 按 kind 区分（方案 §三 1.3） ==============
					const fallbackExt = kind === 'image' ? 'png' : kind === 'video' ? 'mp4' : 'glb'
					const ext = guessAssetExtension(resolvedUrl, blob.type, fallbackExt)
					const filePath = `assets/${sanitizeFileNamePart(rid)}-${target}.${ext}`
					zip.file(filePath, blob)
					cachedByUrl.set(rawUrl, { filePath, blob, kind })
					if (resolvedFromRemoteFallback) {
						cachedByUrl.set(resolvedUrl, { filePath, blob, kind })
					}

					assets.push({
						resourceId: rid,
						target,
						filePath,
						kind,
						name: resourceName,
						mimeType: String(blob.type || ''),
						size: Number(blob.size || 0)
					})
					;(resource as unknown as Record<string, string>)[target] = `package://${filePath}`
					updateFetchProgress(
						t('aiworkflow.runtime.collectingPoolAssets'),
						t('aiworkflow.runtime.packageDetailPackaged', {
							step: String(processedFetchSteps),
							total: String(totalFetchSteps),
							name: resourceName
						})
					)
				}

				resource.sourcePath = undefined
				resource.posterSourcePath = undefined
				resource.localFileKey = undefined
			}

			let snapshotAssetIndex = 0
			for (const item of deepSnapshotAssetCandidates) {
				const cleanUrl = cleanupPackagedAssetUrl(item.url)
				if (!cleanUrl || cleanUrl.startsWith('package://')) continue
				const itemName = item.name

				updateFetchProgress(
					t('aiworkflow.runtime.collectingNodeAssets'),
					t('aiworkflow.runtime.packageDetailProgress', {
						step: String(processedFetchSteps + 1),
						total: String(totalFetchSteps),
						name: itemName
					})
				)

				let cached = cachedByUrl.get(cleanUrl)
				if (!cached) {
					// ============== 节点候选：远端 URL HARD SKIP（简化版） ==============
					// 若为远端 CDN URL 且无已缓存本地替代，则直接 skipped（避免走到 fetch 层守卫时的冗余检查）
					// 深嵌套本地路径的候选推送会在方案第 2 层补齐，此处仅兜底不发起公网请求
					if (isRemoteModelCdnUrl(cleanUrl)) {
						skipped += 1
						processedFetchSteps += 1
						updateFetchProgress(
							t('aiworkflow.runtime.collectingNodeAssets'),
							t('aiworkflow.runtime.packageDetailSkipped', {
								step: String(processedFetchSteps),
								total: String(totalFetchSteps),
								name: itemName
							})
						)
						console.warn(
							`[package-export][snapshot-field] 远端 URL → 无本地替代，skipped (${itemName}): ${cleanUrl.substring(0, 120)}`
						)
						continue
					}

					const blob = await fetchAssetBlobForPackage(cleanUrl, resolveBackendUrl)
					processedFetchSteps += 1
					if (!blob) {
						skipped += 1
						updateFetchProgress(
							t('aiworkflow.runtime.collectingNodeAssets'),
							t('aiworkflow.runtime.packageDetailSkipped', {
								step: String(processedFetchSteps),
								total: String(totalFetchSteps),
								name: itemName
							})
						)
						continue
					}
					const guessedKind = item.kind || inferPackageAssetKind(cleanUrl, blob.type)
					const fallbackExt =
						guessedKind === 'image' ? 'png' : guessedKind === 'video' ? 'mp4' : 'glb'
					const ext = guessAssetExtension(cleanUrl, blob.type, fallbackExt)
					const filePath = `assets/snapshot-${snapshotAssetIndex}.${ext}`
					snapshotAssetIndex += 1
					zip.file(filePath, blob)
					cached = { filePath, blob, kind: guessedKind }
					cachedByUrl.set(cleanUrl, cached)
					updateFetchProgress(
						t('aiworkflow.runtime.collectingNodeAssets'),
						t('aiworkflow.runtime.packageDetailPackaged', {
							step: String(processedFetchSteps),
							total: String(totalFetchSteps),
							name: itemName
						})
					)
				} else {
					processedFetchSteps += 1
					updateFetchProgress(
						t('aiworkflow.runtime.collectingNodeAssets'),
						t('aiworkflow.runtime.packageDetailReused', {
							step: String(processedFetchSteps),
							total: String(totalFetchSteps),
							name: itemName
						})
					)
				}

				setValueByJsonPointer(
					snapshot as Record<string, unknown>,
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
			}

			const pkg: AIWorkflowProjectPackageV1 = {
				schemaVersion: 1,
				kind: 'aiwf-project-package',
				exportedAt: Date.now(),
				projectName:
					String(payload.currentProjectName.value || 'blueprint_project').trim() ||
					'blueprint_project',
				snapshot,
				assets
			}

			zip.file(AIWF_PROJECT_PACKAGE_ENTRY, JSON.stringify(pkg, null, 2))
			const assetCount = assets.length
			setPackageExportProgress(
				t('aiworkflow.runtime.compressingPackage'),
				84,
				t('aiworkflow.runtime.packageDetailTotalAssets', { count: String(assetCount) })
			)
			const blob = await zip.generateAsync(
				{ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
				(metadata) => {
					const percent = 84 + Math.max(0, Math.min(14, Number(metadata.percent || 0) * 0.14))
					setPackageExportProgress(
						t('aiworkflow.runtime.compressingPackage'),
						percent,
						t('aiworkflow.runtime.packageDetailCompressProgress', {
							percent: String(Math.round(Number(metadata.percent || 0))),
							count: String(assetCount)
						})
					)
				}
			)
			const sizeMb = Math.round(blob.size / 1024 / 1024)
			setPackageExportProgress(
				t('aiworkflow.runtime.writingZip'),
				99,
				t('aiworkflow.runtime.packageDetailSizeMb', { size: String(sizeMb) })
			)
			const url = URL.createObjectURL(blob)
			const name = sanitizeFileNamePart(pkg.projectName) || 'blueprint_project'
			const a = document.createElement('a')
			a.href = url
			a.download = `${name}.zip`
			document.body.appendChild(a)
			a.click()
			a.remove()
			URL.revokeObjectURL(url)

			if (skipped > 0) {
				finishPackageExportProgress(
					t('aiworkflow.runtime.exportComplete'),
					t('aiworkflow.runtime.packageDetailSkippedAssets', { count: String(skipped) })
				)
				payload.pushToast(
					t('aiworkflow.toast.projectExportDone', { count: String(skipped) }),
					'warn'
				)
			} else {
				finishPackageExportProgress(
					t('aiworkflow.runtime.exportComplete'),
					t('aiworkflow.runtime.packageDetailWrittenAssets', { count: String(assetCount) })
				)
				payload.pushToast(t('aiworkflow.toast.projectExportSuccess'), 'info')
			}
		} catch (err: unknown) {
			resetPackageExportProgress()
			payload.pushToast(
				t('aiworkflow.toast.projectExportFailed', { error: getErrorMessage(err) }),
				'error'
			)
		}
	}

	onBeforeUnmount(() => {
		clearPackageExportProgressHideTimer()
	})

	return {
		packageExportProgress,
		onRequestExportProjectPackage
	}
}
