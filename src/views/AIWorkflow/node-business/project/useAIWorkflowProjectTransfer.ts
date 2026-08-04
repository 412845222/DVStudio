import JSZip from 'jszip'
import type { AIWorkflowDraftSnapshot } from '../../../../aiworkflow/persistence/blueprintSnapshot'
import { getErrorMessage } from '../../../../types/utils'
import { t } from '../../../../i18n'
import type {
	AIWorkflowProjectPackageAssetTarget,
	AIWorkflowProjectPackageV1
} from './projectPackage'

export const useAIWorkflowProjectTransfer = (payload: {
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	buildPersistableSnapshotWithOptions: (opts: {
		uploadLocalResources: boolean
	}) => Promise<AIWorkflowDraftSnapshot>
	currentProjectName: { value: string }
	currentProjectId?: { value: number | null }
	AIWF_PROJECT_PACKAGE_ENTRY: string
	isValidBlueprintSnapshot: (snapshot: unknown) => boolean
	store: {
		state: {
			resourceOrder: string[]
		}
	}
	revokeTrackedObjectUrlsForResource: (resourceId: string) => void
	getTrackedObjectUrlEntries: () => Array<[string, string]>
	revokeObjectUrl: (key: string) => void
	stripUnrealExportRuntimeFromSnapshot: (
		snapshot: AIWorkflowDraftSnapshot
	) => AIWorkflowDraftSnapshot
	getObjectUrl: (key: string) => string | undefined
	setObjectUrl: (key: string, url: string) => void
	setValueByJsonPointer: (root: Record<string, unknown>, pointer: string, value: unknown) => boolean
	sanitizeBlueprintSnapshotForRuntime: (
		snapshot: Record<string, unknown>
	) => AIWorkflowDraftSnapshot
	hydrateBlueprintSnapshotSafely: (
		snapshot: AIWorkflowDraftSnapshot,
		sourceLabel: string
	) => boolean
	resetCurrentUnrealExportNodeRuntimeState: () => void
	setUnsavedProject: (name?: string) => void
	setSavedProject?: (
		project: { id?: unknown; name?: unknown; rootPath?: unknown },
		fallbackName?: string
	) => Promise<void>
	createProjectForImport?: (name: string) => Promise<{ id: number; rootPath: string } | null>
	saveImportedSnapshot?: () => Promise<void>
	importAssetFromBuffer?: (
		projectId: number,
		buffer: ArrayBuffer,
		fileName: string,
		mimeType?: string,
		subPath?: string,
		bucket?: string
	) => Promise<{ url: string; relativePath: string; absolutePath?: string } | null>
	sanitizeFileNamePart: (value: string) => string
	recoverComfyUIRunStates: (opts?: { silent?: boolean }) => Promise<void>
}) => {
	const onRequestImportProjectPackage = async (request: {
		file: File
		templateCode?: string
		subPath?: string
	}) => {
		const file = request?.file
		if (!file) return

		try {
			const zip = await JSZip.loadAsync(await file.arrayBuffer())
			const packageFile = zip.file(payload.AIWF_PROJECT_PACKAGE_ENTRY)
			if (!packageFile) {
				payload.pushToast(t('aiworkflow.runtime.importPackageMissingEntry'), 'error')
				return
			}

			const raw = await packageFile.async('text')
			const parsed = JSON.parse(raw) as AIWorkflowProjectPackageV1
			if (!parsed || parsed.schemaVersion !== 1 || parsed.kind !== 'aiwf-project-package') {
				payload.pushToast(t('aiworkflow.runtime.importPackageIncompatible'), 'error')
				return
			}
			if (!payload.isValidBlueprintSnapshot(parsed.snapshot)) {
				payload.pushToast(t('aiworkflow.runtime.importPackageInvalidSnapshot'), 'error')
				return
			}

			for (const rid of payload.store.state.resourceOrder) {
				payload.revokeTrackedObjectUrlsForResource(rid)
			}
			for (const [key, value] of payload.getTrackedObjectUrlEntries()) {
				if (!String(key || '').startsWith('wf-pkg:')) continue
				try {
					URL.revokeObjectURL(value)
				} catch {
					// ignore
				}
				payload.revokeObjectUrl(key)
			}

			const nextSnapshot = payload.stripUnrealExportRuntimeFromSnapshot(parsed.snapshot)
			const missingAssets: string[] = []
			const assetList = Array.isArray(parsed.assets) ? parsed.assets : []

			const resolvedSubPath =
				request.subPath || (parsed.templateCode ? `template/${parsed.templateCode}` : undefined)
			const resolvedBucket = 'assets'

			for (const asset of assetList) {
				const rid = String(asset?.resourceId || '').trim()
				const target = String(asset?.target || '').trim() as AIWorkflowProjectPackageAssetTarget
				const filePath = String(asset?.filePath || '').trim()
				const snapshotPointer = String(asset.snapshotPointer || '').trim()
				if (!filePath || (target !== 'url' && target !== 'posterUrl' && target !== 'snapshotField'))
					continue

				const resource = rid ? nextSnapshot.resourcesById?.[rid] : null
				if (target !== 'snapshotField' && !resource) continue

				const zf = zip.file(filePath)
				if (!zf) {
					missingAssets.push(filePath)
					continue
				}

				const blob = await zf.async('blob')
				const rawProjectId = payload.currentProjectId?.value

				// 尝试将资源落盘并注册为 dweb:// URL（需要有效的 projectId）
				const activeProjectId =
					typeof rawProjectId === 'number' && rawProjectId > 0 ? rawProjectId : null
				const shouldPersistAsset = Boolean(
					payload.importAssetFromBuffer && activeProjectId !== null
				)

				if (shouldPersistAsset) {
					// ── 落盘路径：写入项目文件夹并通过 IPC 注册 dweb:// URL ──
					const arrayBuffer = await blob.arrayBuffer()
					const assetFileName = filePath.startsWith('assets/')
						? filePath.slice(7)
						: `${rid}-${target}.${guessExtFromBlob(blob, target)}`
					const imported = await payload.importAssetFromBuffer!(
						activeProjectId!,
						arrayBuffer,
						assetFileName,
						blob.type,
						resolvedSubPath,
						resolvedBucket
					)

					if (target === 'snapshotField') {
						const objectKey = `wf-pkg:${snapshotPointer || filePath}`
						const previous = payload.getObjectUrl(objectKey)
						if (previous) {
							try {
								URL.revokeObjectURL(previous)
							} catch {
								/* ignore */
							}
						}
						const resolvedUrl = imported?.url ?? `package://${filePath}`
						if (
							!snapshotPointer ||
							!payload.setValueByJsonPointer(
								nextSnapshot as Record<string, unknown>,
								snapshotPointer,
								resolvedUrl
							)
						) {
							missingAssets.push(`${filePath}#${snapshotPointer || 'pointer-missing'}`)
							continue
						}
						payload.setObjectUrl(objectKey, resolvedUrl)
					} else {
						const objectKey = target === 'posterUrl' ? `wf-poster:${rid}` : rid
						const previous = payload.getObjectUrl(objectKey)
						if (previous) {
							try {
								URL.revokeObjectURL(previous)
							} catch {
								/* ignore */
							}
						}
						const resolvedUrl = imported?.url ?? `package://${filePath}`
						payload.setObjectUrl(objectKey, resolvedUrl)
						if (resource) {
							resource[target] = resolvedUrl
							if (target === 'url') {
								resource.sourcePath = imported?.absolutePath ?? imported?.relativePath ?? undefined
								resource.projectRelativePath = imported?.relativePath ?? undefined
							} else if (target === 'posterUrl') {
								resource.posterSourcePath =
									imported?.absolutePath ?? imported?.relativePath ?? undefined
							}
							resource.localFileKey = undefined
						}
					}
				} else {
					// ── 回退路径：使用浏览器临时 blob URL（Web 模式或无 projectId）──
					const objectUrl = URL.createObjectURL(blob)
					if (target === 'snapshotField') {
						const objectKey = `wf-pkg:${snapshotPointer || filePath}`
						const previous = payload.getObjectUrl(objectKey)
						if (previous) {
							try {
								URL.revokeObjectURL(previous)
							} catch {
								/* ignore */
							}
						}
						if (
							!snapshotPointer ||
							!payload.setValueByJsonPointer(
								nextSnapshot as Record<string, unknown>,
								snapshotPointer,
								objectUrl
							)
						) {
							try {
								URL.revokeObjectURL(objectUrl)
							} catch {
								/* ignore */
							}
							missingAssets.push(`${filePath}#${snapshotPointer || 'pointer-missing'}`)
							continue
						}
						payload.setObjectUrl(objectKey, objectUrl)
					} else {
						const objectKey = target === 'posterUrl' ? `wf-poster:${rid}` : rid
						const previous = payload.getObjectUrl(objectKey)
						if (previous) {
							try {
								URL.revokeObjectURL(previous)
							} catch {
								/* ignore */
							}
						}
						payload.setObjectUrl(objectKey, objectUrl)
						if (resource) {
							resource[target] = objectUrl
							resource.sourcePath = undefined
							resource.posterSourcePath = undefined
							resource.localFileKey = undefined
						}
					}
				}
			}

			// ── 导入后项目身份设置：先确定身份，再做运行时清洗 ──
			const importName = payload.sanitizeFileNamePart(
				String(parsed.projectName || file.name || 'blueprint_project').replace(/\.zip$/i, '')
			)

			const existingProjectId =
				typeof payload.currentProjectId?.value === 'number' && payload.currentProjectId.value > 0
					? payload.currentProjectId.value
					: null

			if (existingProjectId) {
				// 场景A：已有项目 → 保持当前项目身份不变
				if (payload.setSavedProject) {
					await payload.setSavedProject(
						{ id: existingProjectId, name: payload.currentProjectName.value },
						payload.currentProjectName.value
					)
				}
				// 导入到已有项目后，自动保存快照以持久化导入内容
				try {
					await payload.saveImportedSnapshot?.()
				} catch {
					/* non-critical */
				}
			} else if (payload.createProjectForImport && payload.setSavedProject) {
				// 场景B：无已有项目 → 创建新项目记录
				const created = await payload.createProjectForImport(importName)
				if (created && created.id > 0) {
					await payload.setSavedProject(
						{ id: created.id, name: importName, rootPath: created.rootPath },
						importName
					)
				} else {
					payload.setUnsavedProject(importName)
				}
			} else {
				payload.setUnsavedProject(importName)
			}

			// 此时 currentProjectId 已是最终值 → 运行时清洗能构建正确的 dweb:// URL
			const runtimeSafeSnapshot = payload.sanitizeBlueprintSnapshotForRuntime(nextSnapshot)
			if (
				!payload.hydrateBlueprintSnapshotSafely(
					runtimeSafeSnapshot,
					t('aiworkflow.runtime.importProjectPackageSource')
				)
			)
				return
			payload.resetCurrentUnrealExportNodeRuntimeState()

			await payload.recoverComfyUIRunStates({ silent: true })

			if (missingAssets.length > 0) {
				payload.pushToast(
					t('aiworkflow.toast.projectImportIncomplete', { count: missingAssets.length }),
					'warn'
				)
			} else {
				payload.pushToast(t('aiworkflow.runtime.projectPackageImportSuccess'), 'info')
			}
		} catch (err: unknown) {
			payload.pushToast(
				t('aiworkflow.runtime.projectPackageImportFailed', { error: getErrorMessage(err) }),
				'error'
			)
		}
	}

	const onRequestExportProject = async () => {
		try {
			const snapshot = await payload.buildPersistableSnapshotWithOptions({
				uploadLocalResources: true
			})
			const content = JSON.stringify(snapshot, null, 2)
			const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
			const url = URL.createObjectURL(blob)
			const name = String(payload.currentProjectName.value || 'blueprint_project')
				.trim()
				.replace(/[\\/:*?"<>|]+/g, '_')
			const a = document.createElement('a')
			a.href = url
			a.download = `${name || 'blueprint_project'}.json`
			document.body.appendChild(a)
			a.click()
			a.remove()
			URL.revokeObjectURL(url)
			payload.pushToast(t('aiworkflow.runtime.blueprintJsonExported'), 'info')
		} catch (err: unknown) {
			payload.pushToast(
				t('aiworkflow.runtime.exportFailedWithError', { error: getErrorMessage(err) }),
				'error'
			)
		}
	}

	return {
		onRequestImportProjectPackage,
		onRequestExportProject
	}
}

/** 根据 Blob 的 MIME 类型猜测文件扩展名 */
function guessExtFromBlob(blob: Blob, target: string): string {
	const mime = String(blob.type || '')
		.toLowerCase()
		.trim()
	const extMap: Record<string, string> = {
		'image/png': 'png',
		'image/jpeg': 'jpg',
		'image/webp': 'webp',
		'image/gif': 'gif',
		'video/mp4': 'mp4',
		'video/quicktime': 'mov',
		'video/webm': 'webm',
		'audio/mpeg': 'mp3',
		'audio/wav': 'wav'
	}
	if (extMap[mime]) return extMap[mime]
	// 按 target 类型回退
	if (target === 'posterUrl') return 'png'
	return mime.startsWith('video') ? 'mp4' : mime.startsWith('image') ? 'png' : 'bin'
}
