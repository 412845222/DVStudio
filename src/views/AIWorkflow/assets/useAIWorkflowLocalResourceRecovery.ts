import { nextTick } from 'vue'
import { t } from '../../../i18n'

type RecoveryStats = {
	totalNeedRecover: number
	recovered: number
	missingHandle: number
	permissionDenied: number
	fileReadFailed: number
	rebound: number
}

export const useAIWorkflowLocalResourceRecovery = (payload: {
	store: {
		state: {
			resourceOrder: string[]
			resourcesById: Record<string, unknown>
			nodeOrder: string[]
			nodesById: Record<string, unknown>
		}
		commit: (type: string, value: unknown) => void
	}
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	setObjectUrl: (key: string, url: string) => void
	autoSizeMediaNode: (nodeId: string, url: string, kind: 'image' | 'video') => void
	getLocalFileHandle: (key: string) => Promise<unknown | null>
	ensureReadPermission: (handle: unknown) => Promise<boolean>
	canUseFileSystemHandles: () => boolean
	collectDroppedFilesFromHandle: (
		handle: unknown,
		pathPrefix?: string
	) => Promise<Array<{ file?: File; fsHandle?: unknown }>>
	putLocalFileHandle: (key: string, handle: unknown) => Promise<boolean>
}) => {
	const recoverLocalResourcesFromHandles = async (opts?: {
		silent?: boolean
	}): Promise<RecoveryStats> => {
		const silent = Boolean(opts?.silent)

		const stats: RecoveryStats = {
			totalNeedRecover: 0,
			recovered: 0,
			missingHandle: 0,
			permissionDenied: 0,
			fileReadFailed: 0,
			rebound: 0
		}

		const missing: Array<{ rid: string; key: string; name: string; kind: 'image' | 'video' }> = []
		const denied: Array<{ rid: string; key: string; name: string; kind: 'image' | 'video' }> = []

		const pendingPatches: Array<{ resourceId: string; patch: Record<string, unknown> }> = []
		const pendingSizeTasks: Array<{ nodeId: string; url: string; kind: 'image' | 'video' }> = []

		const flushPending = async () => {
			if (!pendingPatches.length) return
			const patches = pendingPatches.splice(0, pendingPatches.length)
			const tasks = pendingSizeTasks.splice(0, pendingSizeTasks.length)
			payload.store.commit('patchResourcesBatch', { patches })
			await nextTick()
			for (const t of tasks) {
				if (!payload.store.state.nodesById[t.nodeId]) continue
				void payload.autoSizeMediaNode(t.nodeId, t.url, t.kind)
			}
		}

		for (const rid of payload.store.state.resourceOrder) {
			const r = payload.store.state.resourcesById[rid] as Record<string, unknown>
			if (!r) continue

			const url = typeof r.url === 'string' ? String(r.url).trim() : ''
			if (url) continue

			const key = typeof r.localFileKey === 'string' ? String(r.localFileKey).trim() : ''
			if (!key) continue

			stats.totalNeedRecover += 1

			const handle = await payload.getLocalFileHandle(key)
			if (!handle) {
				stats.missingHandle += 1
				missing.push({
					rid,
					key,
					name: String(r.name || rid),
					kind: r.kind === 'video' ? 'video' : 'image'
				})
				continue
			}

			const ok = await payload.ensureReadPermission(handle)
			if (!ok) {
				stats.permissionDenied += 1
				denied.push({
					rid,
					key,
					name: String(r.name || rid),
					kind: r.kind === 'video' ? 'video' : 'image'
				})
				continue
			}

			let file: File
			try {
				file = await (handle as FileSystemFileHandle).getFile()
			} catch {
				stats.fileReadFailed += 1
				continue
			}

			const objectUrl = URL.createObjectURL(file)
			payload.setObjectUrl(rid, objectUrl)

			pendingPatches.push({
				resourceId: rid,
				patch: {
					url: objectUrl,
					name: r.name || file.name
				}
			})

			stats.recovered += 1

			const kind = (r.kind === 'video' ? 'video' : 'image') as 'image' | 'video'
			for (const nodeId of payload.store.state.nodeOrder) {
				const n = payload.store.state.nodesById[nodeId] as Record<string, unknown>
				if (!n || n.resourceId !== rid) continue
				pendingSizeTasks.push({ nodeId, url: objectUrl, kind })
			}

			if (pendingPatches.length >= 20) {
				await flushPending()
			}
		}

		await flushPending()

		if (!silent && payload.canUseFileSystemHandles() && (missing.length || denied.length)) {
			const total = missing.length + denied.length
			const ok = window.confirm(
				t('aiworkflow.toast.localResourceRecoveryConfirm', { count: String(total) })
			)
			if (ok) {
				try {
					const showDirectoryPicker = (window as unknown as Record<string, unknown>)
						.showDirectoryPicker as (() => Promise<FileSystemDirectoryHandle>) | undefined
					const dir = await showDirectoryPicker?.()
					if (dir) {
						const dropped = await payload.collectDroppedFilesFromHandle(dir, '')
						const byName = new Map<string, unknown>()
						for (const it of dropped) {
							if (!it?.file || !it?.fsHandle) continue
							const nm = String(it.file.name || '').trim()
							if (!nm) continue
							if (!byName.has(nm)) byName.set(nm, it.fsHandle)
						}

						const tryBindList = [...missing, ...denied]
						for (const item of tryBindList) {
							const h = byName.get(String(item.name || '').trim())
							if (!h) continue
							const saved = await payload.putLocalFileHandle(item.key, h)
							if (saved) stats.rebound += 1
						}

						if (stats.rebound > 0) {
							await recoverLocalResourcesFromHandles({ silent: true })
							payload.pushToast(
								t('aiworkflow.toast.localResourceRebound', { count: stats.rebound }),
								'info'
							)
							return stats
						}
					}
				} catch {
					// user cancelled picker
				}
			}
		}

		if (
			!silent &&
			stats.totalNeedRecover > 0 &&
			stats.recovered === 0 &&
			(stats.missingHandle || stats.permissionDenied)
		) {
			payload.pushToast(
				t('aiworkflow.toast.localResourceNotRecovered', {
					handle: stats.missingHandle,
					perm: stats.permissionDenied
				}),
				'warn'
			)
		}

		return stats
	}

	return {
		recoverLocalResourcesFromHandles
	}
}
