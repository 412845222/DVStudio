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
	buildPersistableSnapshotWithOptions: (opts: { uploadLocalResources: boolean }) => Promise<AIWorkflowDraftSnapshot>
	stripUnrealExportRuntimeFromSnapshot: (snapshot: AIWorkflowDraftSnapshot) => AIWorkflowDraftSnapshot
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
			setPackageExportProgress(t('aiworkflow.runtime.preparingSnapshot'), 2, t('aiworkflow.runtime.packageDetailPreparingSnapshot'))
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
				const kind =
					resource.kind === 'video' ? 'video' : resource.kind === 'image' ? 'image' : null
				if (!kind) continue

				const targets: AIWorkflowProjectPackageAssetTarget[] = ['url', 'posterUrl']
				for (const target of targets) {
					const currentUrl = cleanupPackagedAssetUrl(resource[target as keyof typeof resource])
					if (!currentUrl || currentUrl.startsWith('package://')) continue

					const resourceName = String(resource.name || rid)
					updateFetchProgress(
						t('aiworkflow.runtime.collectingPoolAssets'),
						t('aiworkflow.runtime.packageDetailProgress', { step: String(processedFetchSteps + 1), total: String(totalFetchSteps), name: resourceName })
					)

					const blob = await fetchAssetBlobForPackage(currentUrl, resolveBackendUrl)
					processedFetchSteps += 1
					if (!blob) {
						skipped += 1
						updateFetchProgress(
							t('aiworkflow.runtime.collectingPoolAssets'),
							t('aiworkflow.runtime.packageDetailSkipped', { step: String(processedFetchSteps), total: String(totalFetchSteps), name: resourceName })
						)
						continue
					}

					const ext = guessAssetExtension(currentUrl, blob.type, kind === 'image' ? 'png' : 'mp4')
					const filePath = `assets/${sanitizeFileNamePart(rid)}-${target}.${ext}`
					zip.file(filePath, blob)
					cachedByUrl.set(currentUrl, { filePath, blob, kind })

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
						t('aiworkflow.runtime.packageDetailPackaged', { step: String(processedFetchSteps), total: String(totalFetchSteps), name: resourceName })
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
					t('aiworkflow.runtime.packageDetailProgress', { step: String(processedFetchSteps + 1), total: String(totalFetchSteps), name: itemName })
				)

				let cached = cachedByUrl.get(cleanUrl)
				if (!cached) {
					const blob = await fetchAssetBlobForPackage(cleanUrl, resolveBackendUrl)
					processedFetchSteps += 1
					if (!blob) {
						skipped += 1
						updateFetchProgress(
							t('aiworkflow.runtime.collectingNodeAssets'),
							t('aiworkflow.runtime.packageDetailSkipped', { step: String(processedFetchSteps), total: String(totalFetchSteps), name: itemName })
						)
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
					updateFetchProgress(
						t('aiworkflow.runtime.collectingNodeAssets'),
						t('aiworkflow.runtime.packageDetailPackaged', { step: String(processedFetchSteps), total: String(totalFetchSteps), name: itemName })
					)
				} else {
					processedFetchSteps += 1
					updateFetchProgress(
						t('aiworkflow.runtime.collectingNodeAssets'),
						t('aiworkflow.runtime.packageDetailReused', { step: String(processedFetchSteps), total: String(totalFetchSteps), name: itemName })
					)
				}

				setValueByJsonPointer(snapshot as Record<string, unknown>, item.pointer, `package://${cached.filePath}`)
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
			setPackageExportProgress(t('aiworkflow.runtime.compressingPackage'), 84, t('aiworkflow.runtime.packageDetailTotalAssets', { count: String(assetCount) }))
			const blob = await zip.generateAsync(
				{ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
				(metadata) => {
					const percent = 84 + Math.max(0, Math.min(14, Number(metadata.percent || 0) * 0.14))
					setPackageExportProgress(
						t('aiworkflow.runtime.compressingPackage'),
						percent,
						t('aiworkflow.runtime.packageDetailCompressProgress', { percent: String(Math.round(Number(metadata.percent || 0))), count: String(assetCount) })
					)
				}
			)
			const sizeMb = Math.round(blob.size / 1024 / 1024)
			setPackageExportProgress(t('aiworkflow.runtime.writingZip'), 99, t('aiworkflow.runtime.packageDetailSizeMb', { size: String(sizeMb) }))
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
				finishPackageExportProgress(t('aiworkflow.runtime.exportComplete'), t('aiworkflow.runtime.packageDetailSkippedAssets', { count: String(skipped) }))
				payload.pushToast(t('aiworkflow.toast.projectExportDone', { count: String(skipped) }), 'warn')
			} else {
				finishPackageExportProgress(t('aiworkflow.runtime.exportComplete'), t('aiworkflow.runtime.packageDetailWrittenAssets', { count: String(assetCount) }))
				payload.pushToast(t('aiworkflow.toast.projectExportSuccess'), 'info')
			}
		} catch (err: unknown) {
			resetPackageExportProgress()
			payload.pushToast(t('aiworkflow.toast.projectExportFailed', { error: getErrorMessage(err) }), 'error')
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
