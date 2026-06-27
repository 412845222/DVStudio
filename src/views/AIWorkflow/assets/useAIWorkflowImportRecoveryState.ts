import { ref, shallowRef } from 'vue'

export type AIWorkflowImportResourceState = {
	kind: 'image' | 'video'
	urlReady: boolean
	nodeReady: boolean
	done: boolean
}

export type AIWorkflowRecoveryNodeState = {
	resourceId: string
	kind: 'image' | 'video'
	urlReady: boolean
	nodeReady: boolean
	done: boolean
}

export type ActiveImportSession = {
	id: string
	cancelled: boolean
	resourceIdToNode: Map<string, { nodeId: string; kind: 'image' | 'video' }>
	nodeIdToResourceId: Map<string, string>
	resourceState: Map<string, AIWorkflowImportResourceState>
	total: number
	processed: number
}

export type ActiveRecoverySession = {
	id: string
	nodeState: Map<string, AIWorkflowRecoveryNodeState>
	total: number
	processed: number
}

export const useAIWorkflowImportRecoveryState = (payload: {
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
}) => {
	const importOverlayOpen = ref(false)
	const importOverlayTitle = ref('正在导入资源…')
	const importOverlayDetail = ref('')
	const importOverlayProgress = ref(0)
	const activeImportSession = shallowRef<ActiveImportSession | null>(null)

	const recoveryOverlayOpen = ref(false)
	const recoveryOverlayTitle = ref('正在恢复资源…')
	const recoveryOverlayDetail = ref('')
	const recoveryOverlayProgress = ref(0)
	const activeRecoverySession = shallowRef<ActiveRecoverySession | null>(null)

	const updateImportProgressIfNeeded = (sessionId: string, resourceId: string) => {
		const session = activeImportSession.value
		if (!session || session.id !== sessionId || session.cancelled) return
		const state = session.resourceState.get(resourceId)
		if (!state || state.done) return

		const ready = Boolean(state.urlReady && state.nodeReady)
		if (!ready) return

		state.done = true
		session.processed += 1
		importOverlayProgress.value =
			session.total > 0 ? Math.max(0, Math.min(1, session.processed / session.total)) : 0
		importOverlayDetail.value = `${Math.min(session.processed, session.total)} / ${session.total}`
		if (session.processed >= session.total) {
			importOverlayProgress.value = 1
			importOverlayOpen.value = false
			activeImportSession.value = null
		}
	}

	const startImportSession = (
		session: Omit<ActiveImportSession, 'cancelled' | 'processed'> & {
			cancelled?: boolean
			processed?: number
			title?: string
		}
	) => {
		activeImportSession.value = {
			...session,
			cancelled: Boolean(session.cancelled),
			processed: Number(session.processed ?? 0)
		}
		if (session.total > 0) {
			importOverlayTitle.value = String(session.title ?? '正在导入资源…')
			importOverlayOpen.value = true
			importOverlayProgress.value = 0
			importOverlayDetail.value = `0 / ${session.total}`
		} else {
			importOverlayOpen.value = false
			importOverlayProgress.value = 0
			importOverlayDetail.value = ''
		}
		return activeImportSession.value?.id ?? null
	}

	const cancelActiveImportSession = (payload?: {
		onBeforeClear?: (session: ActiveImportSession) => void
	}) => {
		const session = activeImportSession.value
		importOverlayOpen.value = false
		importOverlayProgress.value = 0
		importOverlayDetail.value = ''
		if (!session) return
		session.cancelled = true
		payload?.onBeforeClear?.(session)
		activeImportSession.value = null
	}

	const cancelActiveRecoverySession = () => {
		recoveryOverlayOpen.value = false
		recoveryOverlayProgress.value = 0
		recoveryOverlayDetail.value = ''
		activeRecoverySession.value = null
	}

	const updateRecoveryProgressIfNeeded = (sessionId: string, nodeId: string) => {
		const session = activeRecoverySession.value
		if (!session || session.id !== sessionId) return
		const state = session.nodeState.get(nodeId)
		if (!state || state.done) return

		const ready = Boolean(state.urlReady)
		if (!ready) return

		state.done = true
		session.processed += 1
		recoveryOverlayProgress.value =
			session.total > 0 ? Math.max(0, Math.min(1, session.processed / session.total)) : 0
		recoveryOverlayDetail.value = `${Math.min(session.processed, session.total)} / ${session.total}`
		if (session.processed >= session.total) {
			recoveryOverlayProgress.value = 1
			recoveryOverlayOpen.value = false
			activeRecoverySession.value = null
		}
	}

	const refreshRecoveryUrlReady = (
		sessionId: string,
		getResourceUrl: (resourceId: string) => string
	) => {
		const session = activeRecoverySession.value
		if (!session || session.id !== sessionId) return
		for (const [nodeId, state] of session.nodeState.entries()) {
			if (state.done) continue
			state.urlReady = Boolean(getResourceUrl(state.resourceId))
			updateRecoveryProgressIfNeeded(sessionId, nodeId)
		}
	}

	const finalizeRecoverySessionAfterUrlRecoveryAttempt = (
		sessionId: string,
		getResourceUrl: (resourceId: string) => string
	) => {
		const session = activeRecoverySession.value
		if (!session || session.id !== sessionId) return

		let missingUrl = 0
		for (const [nodeId, state] of session.nodeState.entries()) {
			if (state.done) continue
			state.urlReady = Boolean(getResourceUrl(state.resourceId))
			if (state.urlReady) {
				updateRecoveryProgressIfNeeded(sessionId, nodeId)
				continue
			}
			state.done = true
			missingUrl += 1
			session.processed += 1
		}

		recoveryOverlayProgress.value =
			session.total > 0 ? Math.max(0, Math.min(1, session.processed / session.total)) : 0
		recoveryOverlayDetail.value = `${Math.min(session.processed, session.total)} / ${session.total}`
		if (missingUrl > 0) {
			recoveryOverlayDetail.value = `${Math.min(session.processed, session.total)} / ${session.total}（缺失 ${missingUrl}）`
		}
		if (session.processed >= session.total) {
			recoveryOverlayProgress.value = 1
			recoveryOverlayOpen.value = false
			activeRecoverySession.value = null
			if (missingUrl > 0) {
				payload.pushToast(
					`有 ${missingUrl} 个本地资源无法自动恢复（缺失 URL）。可在“加载项目”时选择文件夹重新绑定/授权。`,
					'warn'
				)
			}
		}
	}

	const startRecoverySessionFromCurrentState = (payload: {
		nodesById: Record<string, unknown>
		nodeOrder: string[]
		resourcesById: Record<string, unknown>
		title?: string
	}) => {
		cancelActiveRecoverySession()

		const nodeState = new Map<string, AIWorkflowRecoveryNodeState>()
		for (const nodeId of payload.nodeOrder) {
			const node = payload.nodesById?.[nodeId] as Record<string, unknown> | undefined
			if (!node) continue
			const type = String(node.type ?? '').toLowerCase()
			if (type !== 'image' && type !== 'video') continue
			const resourceId = String(node.resourceId ?? '').trim()
			if (!resourceId) continue
			const resource = payload.resourcesById?.[resourceId] as Record<string, unknown> | undefined
			if (!resource) continue
			const kind = String(resource.kind ?? '').toLowerCase()
			if (kind !== 'image' && kind !== 'video') continue
			const url = typeof resource.url === 'string' ? String(resource.url).trim() : ''
			nodeState.set(String(nodeId), {
				resourceId,
				kind: kind as 'image' | 'video',
				urlReady: Boolean(url),
				nodeReady: false,
				done: false
			})
		}

		const total = nodeState.size
		if (!total) return null

		const sessionId = `recover-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
		activeRecoverySession.value = {
			id: sessionId,
			nodeState,
			total,
			processed: 0
		}
		recoveryOverlayTitle.value = String(payload.title ?? '正在恢复资源…')
		recoveryOverlayOpen.value = true
		recoveryOverlayProgress.value = 0
		recoveryOverlayDetail.value = `0 / ${total}`
		return sessionId
	}

	const markNodeMediaReady = (nodeId: string) => {
		const importSession = activeImportSession.value
		if (importSession && !importSession.cancelled) {
			const resourceId = importSession.nodeIdToResourceId.get(nodeId)
			if (resourceId) {
				const state = importSession.resourceState.get(resourceId)
				if (state) {
					state.nodeReady = true
					updateImportProgressIfNeeded(importSession.id, resourceId)
				}
			}
		}

		const recoverySession = activeRecoverySession.value
		if (!recoverySession) return
		const state = recoverySession.nodeState.get(nodeId)
		if (!state) return
		state.nodeReady = true
		updateRecoveryProgressIfNeeded(recoverySession.id, nodeId)
	}

	return {
		importOverlayOpen,
		importOverlayTitle,
		importOverlayDetail,
		importOverlayProgress,
		activeImportSession,
		recoveryOverlayOpen,
		recoveryOverlayTitle,
		recoveryOverlayDetail,
		recoveryOverlayProgress,
		activeRecoverySession,
		startImportSession,
		updateImportProgressIfNeeded,
		cancelActiveImportSession,
		cancelActiveRecoverySession,
		refreshRecoveryUrlReady,
		updateRecoveryProgressIfNeeded,
		finalizeRecoverySessionAfterUrlRecoveryAttempt,
		startRecoverySessionFromCurrentState,
		markNodeMediaReady
	}
}
