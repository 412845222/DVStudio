import { normalizeResolvedLayoutSlots, buildSlotsFromModelBindings, getUnrealConnectionPollInterval } from './unrealExportUtils'
import { t } from '../../../../i18n'

export const useAIWorkflowUnrealExportActions = (payload: {
	store: {
		state: {
			nodesById: Record<string, unknown>
			projectRootPath?: string
		}
		commit: (type: string, value: unknown) => void
	}
	unrealExportService: {
		listSessions: () => Promise<{
			ok: boolean
			sessions?: Array<Record<string, unknown>>
			error?: string
		}>
		createJob: (input: {
			targetSessionId: string
			sourceNodeId: string
			sceneName: string
			assetRootPath?: string
			exportPayload: Record<string, unknown>
		}) => Promise<Record<string, unknown>>
		getJob: (jobId: string) => Promise<{
			ok: boolean
			job?: Record<string, unknown> | null
			error?: string
		}>
		detectEditor: () => Promise<{
			ok: boolean
			running: boolean
			processes: Array<{ pid: number; projectPath: string; projectName: string }>
			error?: string
		}>
		checkPlugin: (projectPath: string) => Promise<{
			ok: boolean
			installed: boolean
			pluginVersion?: string
			pluginPath?: string
			projectRoot?: string
			projectName?: string
			error?: string
		}>
		installPlugin: (projectPath: string) => Promise<{
			ok: boolean
			installed: boolean
			pluginPath?: string
			pluginVersion?: string
			projectRoot?: string
			projectName?: string
			needsRestart?: boolean
			error?: string
		}>
		disconnectSession: (sessionId: string) => Promise<{ ok: boolean; error?: string }>
	}
	connectedTextInputValue: (nodeId: string, inputId: string) => string
	getUnrealExportSourceSceneLayoutNode: (nodeId: string) => unknown
	getResolvedLayoutForUnreal: (
		sceneLayoutNodeId: string
	) => Promise<{ ok: true; exportData: unknown } | { ok: false; error: string }>
	connectedSceneLayoutModelBindings: (nodeId: string) => unknown[]
	validateModelBindings?: (bindings: unknown[]) => {
		valid: unknown[]
		invalid: Array<{ binding: unknown; reason: string }>
		warnings: string[]
	}
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	activateSceneLayoutPreview?: (nodeId: string) => void
	waitForNextTick?: () => Promise<void>
}) => {
	let progressPollingTimer: ReturnType<typeof setInterval> | null = null
	const stopProgressPolling = () => {
		if (progressPollingTimer) {
			clearInterval(progressPollingTimer)
			progressPollingTimer = null
		}
	}

	const setNodeStatus = (nodeId: string, status: string, extra: Record<string, unknown> = {}) => {
		payload.store.commit('setNodeUnrealExportSettings', {
			nodeId,
			unrealExportSettings: {
				connectionStatus: status,
				...extra
			}
		})
	}

	const waitForConnection = async (nodeId: string, timeoutMs: number = 60000): Promise<string | null> => {
		const startTime = Date.now()
		setNodeStatus(nodeId, 'waiting-connection', {
			statusText: t('aiworkflow.runtime.unrealWaitingConnection'),
			message: t('aiworkflow.runtime.unrealWaitingConnectionMessage')
		})

		let pollCount = 0
		while (Date.now() - startTime < timeoutMs) {
			const pollInterval = getUnrealConnectionPollInterval(pollCount)
			await new Promise((r) => setTimeout(r, pollInterval))
			pollCount++
			const sessionsRes = await payload.unrealExportService.listSessions()
			if (sessionsRes.ok && Array.isArray(sessionsRes.sessions) && sessionsRes.sessions.length > 0) {
				const active = sessionsRes.sessions.find(
					(s) => String(s?.status ?? 'connected') !== 'stale'
				)
				if (active) {
					const sessionId = String(active.sessionId ?? '')
					if (sessionId) {
						payload.store.commit('setNodeUnrealExportSettings', {
							nodeId,
							unrealExportSettings: {
								connectionStatus: 'connected',
								statusText: t('aiworkflow.runtime.unrealConnected'),
								message: t('aiworkflow.runtime.unrealConnectedProject', { project: String(active.projectName || '') }),
								connectedSession: active,
								targetSessionId: sessionId
							}
						})
						return sessionId
					}
				}
			}
		}
		return null
	}

	const pollJobProgress = async (nodeId: string, jobId: string) => {
		stopProgressPolling()
		const poll = async () => {
			try {
				const res = await payload.unrealExportService.getJob(jobId)
				if (!res.ok || !res.job) {
					return
				}
				const job = res.job as Record<string, unknown>
				const status = String(job.status ?? 'unknown')
				const resultData = (job.resultData as Record<string, unknown>) || {}
				const progress = Number(resultData.progress ?? 0)
				const stage = String(resultData.stage ?? '')
				const message = String(job.message ?? resultData.message ?? '')
				const importedAssetCount = Number(resultData.importedAssetCount ?? 0)
				const spawnedActorCount = Number(resultData.spawnedActorCount ?? 0)
				const blueprintAssetPath = String(resultData.blueprintAssetPath ?? '')
				const modelsAssetPath = String(resultData.modelsAssetPath ?? '')

				if (status === 'completed') {
					stopProgressPolling()
					const assetCount = importedAssetCount || spawnedActorCount
					payload.store.commit('setNodeUnrealExportSettings', {
						nodeId,
						unrealExportSettings: {
							connectionStatus: 'connected',
							statusText: t('aiworkflow.runtime.unrealExportStatusComplete'),
							message: t('aiworkflow.runtime.unrealExportSuccessCount', { count: String(assetCount) }),
							lastExportStatus: 'completed',
							lastExportProgress: 100,
							lastExportStage: t('aiworkflow.runtime.unrealExportStageComplete'),
							lastExportMessage: message || t('aiworkflow.runtime.unrealExportSuccessMessage'),
							lastBlueprintAssetPath: blueprintAssetPath,
							lastModelsAssetPath: modelsAssetPath,
							lastImportedAssetCount: importedAssetCount,
							lastSpawnedActorCount: spawnedActorCount
						}
					})
					payload.pushToast(t('aiworkflow.toast.unrealExportSuccess'), 'info')
					return
				}

				if (status === 'failed') {
					stopProgressPolling()
					const errMsg = String(job.error ?? message ?? t('aiworkflow.runtime.unrealExportStatusFailed'))
					payload.store.commit('setNodeUnrealExportSettings', {
						nodeId,
						unrealExportSettings: {
							connectionStatus: 'error',
							statusText: t('aiworkflow.runtime.unrealExportStatusFailed'),
							message: errMsg,
							lastExportStatus: 'failed',
							lastExportMessage: errMsg
						}
					})
					payload.pushToast(t('aiworkflow.toast.unrealExportFailed', { error: errMsg }), 'error')
					return
				}

				const currentStage = stage || getStageText(status)
				payload.store.commit('setNodeUnrealExportSettings', {
					nodeId,
					unrealExportSettings: {
						connectionStatus: 'exporting',
						lastExportStatus: status,
						lastExportProgress: Math.max(5, Math.min(99, progress || 5)),
						lastExportStage: currentStage,
						lastExportMessage: message || currentStage,
						statusText: t('aiworkflow.runtime.unrealExportStatusExporting'),
						message: t('aiworkflow.runtime.unrealStageProcessing', { stage: currentStage })
					}
				})
			} catch (err) {
				console.warn('[UnrealExport] poll job progress error:', err)
			}
		}
		await poll()
		progressPollingTimer = setInterval(poll, 1500)
	}

	const getStageText = (status: string): string => {
		switch (status) {
			case 'pending': return t('aiworkflow.runtime.unrealStagePending')
			case 'picked': return t('aiworkflow.runtime.unrealStagePicked')
			case 'downloading': return t('aiworkflow.runtime.unrealStageDownloading')
			case 'importing': return t('aiworkflow.runtime.unrealStageImporting')
			case 'assembling-actor': return t('aiworkflow.runtime.unrealStageAssemblingActor')
			case 'applying-lighting': return t('aiworkflow.runtime.unrealStageApplyingLighting')
			default: return t('aiworkflow.runtime.processing')
		}
	}

	const buildUnrealExportPayload = async (
		nodeId: string,
		exportMode: 'scene-layout' | 'lighting-only' = 'scene-layout'
	) => {
		const node = payload.store.state.nodesById[nodeId] as Record<string, unknown>
		if (!node || node.type !== 'unreal-export') return { ok: false as const, error: t('aiworkflow.runtime.unrealNodeNotExist') }

		const sourceNode = payload.getUnrealExportSourceSceneLayoutNode(nodeId) as Record<string, unknown> | null
		const sourceSceneLayoutSettings = sourceNode?.sceneLayoutSettings as Record<string, unknown> | null
		const modelBindings = sourceNode && sourceNode.id ? payload.connectedSceneLayoutModelBindings(String(sourceNode.id)) : []
		const sourceSceneLayoutNodeId =
			sourceNode?.type === 'scene-layout' ? String(sourceNode.id ?? '').trim() : ''

		if (exportMode === 'scene-layout') {
			if (!sourceSceneLayoutNodeId) {
				return { ok: false as const, error: t('aiworkflow.runtime.unrealNoSceneLayoutConnected') }
			}

			const connectedModelBindings = Array.isArray(modelBindings)
				? modelBindings.filter((item: unknown) => {
						if (!item || typeof item !== 'object') return false
						const obj = item as Record<string, unknown>
						if (!obj.connected) return false
						const hasAnyPath = !!(
							String(obj.modelUrl ?? '').trim() ||
							String(obj.modelAssetUrl ?? '').trim() ||
							String(obj.modelSourcePath ?? '').trim() ||
							String(obj.modelAssetPath ?? '').trim()
						)
						return hasAnyPath
					})
				: []
			if (connectedModelBindings.length <= 0) {
				return {
					ok: false as const,
					error: t('aiworkflow.runtime.unrealNoModelBindings')
				}
			}

			if (payload.validateModelBindings) {
				const validation = payload.validateModelBindings(connectedModelBindings)
				if (validation.invalid && validation.invalid.length > 0) {
					const detailLines = validation.invalid.map((item, idx) => {
						const b = item.binding as Record<string, unknown>
						const name = String(b.objectName ?? b.objectId ?? t('aiworkflow.runtime.modelNumber', { num: String(idx + 1) })).trim()
						const path = String(b.modelSourcePath ?? b.modelAssetPath ?? b.modelUrl ?? b.modelAssetUrl ?? t('aiworkflow.runtime.unrealNoPath')).trim()
						return t('aiworkflow.runtime.unrealInvalidModelLine', { name, reason: item.reason, path })
					}).join('\n')
					return {
						ok: false as const,
						error: t('aiworkflow.runtime.unrealPrecheckFailed', { count: String(validation.invalid.length), details: detailLines })
					}
				}
				if (validation.warnings && validation.warnings.length > 0) {
					const warnMsg = t('aiworkflow.runtime.unrealValidationWarning', { warnings: validation.warnings.join('；') })
					payload.pushToast(warnMsg, 'warn')
				}
				payload.pushToast(t('aiworkflow.toast.unrealPrecheckPass', { count: String(connectedModelBindings.length) }), 'info')
			}

			const totalLayoutItems = Array.isArray(sourceSceneLayoutSettings?.layoutItems)
				? sourceSceneLayoutSettings!.layoutItems.length
				: 0
			if (totalLayoutItems > 0 && connectedModelBindings.length < totalLayoutItems) {
				payload.pushToast(t('aiworkflow.toast.unrealPrecheckWarning', { total: String(totalLayoutItems), bound: String(connectedModelBindings.length) }), 'warn')
			}

			setNodeStatus(nodeId, 'activating-upstream', {
				statusText: t('aiworkflow.runtime.unrealActivatingUpstream'),
				message: t('aiworkflow.runtime.unrealEnsuringPreview')
			})

			if (payload.activateSceneLayoutPreview) {
				payload.activateSceneLayoutPreview(sourceSceneLayoutNodeId)
			}

			let resolvedResult: Awaited<ReturnType<typeof payload.getResolvedLayoutForUnreal>> | null = null
			let lastResolveError = ''
			for (let attempt = 0; attempt < 5; attempt++) {
				if (attempt > 0) {
					if (payload.activateSceneLayoutPreview) {
						payload.activateSceneLayoutPreview(sourceSceneLayoutNodeId)
					}
					await new Promise((r) => setTimeout(r, 600))
					if (payload.waitForNextTick) {
						await payload.waitForNextTick()
					}
				}
				const r = await payload.getResolvedLayoutForUnreal(sourceSceneLayoutNodeId)
				if (r.ok) {
					resolvedResult = r
					break
				}
				lastResolveError = r.error || 'unknown'
			}

			const exportData =
				resolvedResult?.exportData && typeof resolvedResult.exportData === 'object'
					? (resolvedResult.exportData as Record<string, unknown>)
					: null
			const rawSlots = exportData && Array.isArray(exportData.slots) ? (exportData.slots as unknown[]) : []
			const resolvedSlotMap = normalizeResolvedLayoutSlots(rawSlots)
			const resolvedLayoutWarnings = exportData && Array.isArray(exportData.warnings)
				? (exportData.warnings as unknown[]).map((item: unknown) => String(item ?? '').trim()).filter(Boolean)
				: []
			const resolvedActorOrigin =
				exportData?.actorOrigin && typeof exportData.actorOrigin === 'object'
					? { ...(exportData.actorOrigin as Record<string, unknown>) }
					: null

			const layoutItems = Array.isArray(sourceSceneLayoutSettings?.layoutItems)
				? (sourceSceneLayoutSettings?.layoutItems as unknown[] ?? [])
				: []
			const manualModelBindings = Array.isArray(sourceSceneLayoutSettings?.manualModelBindings)
				? (sourceSceneLayoutSettings?.manualModelBindings as unknown[] ?? [])
				: []

			const resolvedLayoutSlots = buildSlotsFromModelBindings(connectedModelBindings, resolvedSlotMap, layoutItems)
			const generatedSlotCount = resolvedLayoutSlots.filter((s: Record<string, unknown>) => s.generatedFromBinding).length
			if (generatedSlotCount > 0) {
				resolvedLayoutWarnings.push(t('aiworkflow.runtime.modelBindingGeneratedDefault', { count: String(generatedSlotCount) }))
			}

			if (resolvedLayoutSlots.length <= 0) {
				return {
					ok: false as const,
					error: t('aiworkflow.runtime.unrealFailedToGenerateLayout')
				}
			}

			return {
				ok: true as const,
				payload: {
					exportVersion: 6,
					layoutProtocolVersion: 4,
					exportMode,
					sceneName:
						String(
							sourceNode?.alias ?? sourceNode?.title ?? node.alias ?? node.title ?? 'DwebSceneExport'
						).trim() || 'DwebSceneExport',
					generatedAt: Date.now(),
					sourceNodeId: String(sourceNode?.id ?? nodeId),
					sourceSceneLayoutNodeId,
					sourceNodeType: String(sourceNode?.type ?? 'unreal-export'),
					dwebProjectRootPath: String(payload.store.state.projectRootPath ?? '').trim() || undefined,
					resolvedLayoutSlots,
					resolvedSlotCount: resolvedLayoutSlots.length,
					resolvedLayoutWarnings,
					resolvedActorOrigin,
					resolvedSourceItemCount: connectedModelBindings.length,
					layoutItems,
					modelBindings: connectedModelBindings,
					manualModelBindings,
					layoutItemCount: layoutItems.length,
					modelBindingCount: connectedModelBindings.length,
					manualModelBindingCount: manualModelBindings.length
				}
			}
		}

		return {
			ok: true as const,
			payload: {
				exportVersion: 5,
				layoutProtocolVersion: 4,
				exportMode,
				sceneName: String(node.alias ?? node.title ?? 'DwebLightingExport').trim() || 'DwebLightingExport',
				generatedAt: Date.now(),
				sourceNodeId: nodeId
			}
		}
	}

	const ensureConnected = async (nodeId: string): Promise<string | null> => {
		const node = payload.store.state.nodesById[nodeId] as Record<string, unknown>
		const settings = (node?.unrealExportSettings as Record<string, unknown>) ?? {}
		const existingSessionId = String(settings.targetSessionId ?? '').trim()

		if (existingSessionId) {
			const sessionsRes = await payload.unrealExportService.listSessions()
			if (sessionsRes.ok && Array.isArray(sessionsRes.sessions)) {
				const found = sessionsRes.sessions.find(
					(s) => String(s.sessionId ?? '') === existingSessionId && String(s.status ?? 'connected') !== 'stale'
				)
				if (found) return existingSessionId
			}
		}

		const sessionsRes = await payload.unrealExportService.listSessions()
		if (sessionsRes.ok && Array.isArray(sessionsRes.sessions) && sessionsRes.sessions.length > 0) {
			const active = sessionsRes.sessions.find(
				(s) => String(s?.status ?? 'connected') !== 'stale'
			)
			if (active) {
				const sid = String(active.sessionId ?? '')
				if (sid) {
					payload.store.commit('setNodeUnrealExportSettings', {
						nodeId,
						unrealExportSettings: {
							connectionStatus: 'connected',
							targetSessionId: sid,
							connectedSession: active,
							statusText: t('aiworkflow.runtime.unrealConnected'),
							message: t('aiworkflow.runtime.unrealConnectedProject', { project: String(active.projectName || '') })
						}
					})
					return sid
				}
			}
		}

		setNodeStatus(nodeId, 'checking-editor', {
			statusText: t('aiworkflow.runtime.unrealCheckingEditor'),
			message: t('aiworkflow.runtime.unrealCheckingEditorMessage'),
			editorStatus: 'checking'
		})

		const detectResult = await payload.unrealExportService.detectEditor()
		if (!detectResult.ok || !detectResult.running || detectResult.processes.length === 0) {
			setNodeStatus(nodeId, 'editor-not-running', {
				statusText: t('aiworkflow.runtime.unrealEditorNotDetected'),
				message: t('aiworkflow.runtime.unrealEditorNotDetectedMessage'),
				editorStatus: 'not-running'
			})
			payload.pushToast(t('aiworkflow.toast.unrealEditorNotRunning'), 'warn')
			return null
		}

		const firstProcess = detectResult.processes[0]
		const projectPath = firstProcess.projectPath

		payload.store.commit('setNodeUnrealExportSettings', {
			nodeId,
			unrealExportSettings: {
				editorStatus: 'running',
				editorProcess: firstProcess,
				editorProcesses: detectResult.processes
			}
		})

		setNodeStatus(nodeId, 'checking-plugin', {
			statusText: t('aiworkflow.runtime.unrealCheckingPlugin'),
			message: t('aiworkflow.runtime.unrealCheckingPluginMessage'),
			pluginStatus: 'checking'
		})

		const pluginResult = await payload.unrealExportService.checkPlugin(projectPath)
		if (!pluginResult.ok || !pluginResult.installed) {
			setNodeStatus(nodeId, 'installing-plugin', {
				statusText: t('aiworkflow.runtime.unrealInstallingPlugin'),
				message: t('aiworkflow.runtime.unrealInstallingPluginMessage'),
				pluginStatus: 'installing',
				pluginInstallConfig: { targetProjectPath: pluginResult.projectRoot || projectPath }
			})

			const installResult = await payload.unrealExportService.installPlugin(pluginResult.projectRoot || projectPath)
			if (!installResult.ok || !installResult.installed) {
				setNodeStatus(nodeId, 'error', {
					statusText: t('aiworkflow.runtime.unrealPluginInstallFailed'),
					message: installResult.error || t('aiworkflow.runtime.unrealPluginInstallFailedMessage'),
					pluginStatus: 'install-error',
					pluginInstallError: installResult.error
				})
				payload.pushToast(t('aiworkflow.toast.unrealPluginInstallFailed', { error: String(installResult.error || 'unknown') }), 'error')
				return null
			}

			setNodeStatus(nodeId, 'needs-restart', {
				statusText: t('aiworkflow.runtime.unrealPluginNeedsRestart'),
				message: t('aiworkflow.runtime.unrealPluginNeedsRestartMessage'),
				pluginStatus: 'needs-restart',
				pluginVersion: installResult.pluginVersion
			})
			payload.pushToast(t('aiworkflow.toast.unrealPluginInstalled'), 'info')
			return null
		}

		payload.store.commit('setNodeUnrealExportSettings', {
			nodeId,
			unrealExportSettings: {
				pluginStatus: 'installed',
				pluginVersion: pluginResult.pluginVersion
			}
		})

		const sessionId = await waitForConnection(nodeId, 90000)
		if (!sessionId) {
			setNodeStatus(nodeId, 'error', {
				statusText: t('aiworkflow.runtime.unrealConnectionTimeoutStatus'),
				message: t('aiworkflow.runtime.unrealConnectionTimeoutMessage')
			})
			payload.pushToast(t('aiworkflow.runtime.unrealConnectionTimeout'), 'warn')
			return null
		}

		return sessionId
	}

	const performExport = async (nodeId: string, exportMode: 'scene-layout' | 'lighting-only') => {
		stopProgressPolling()

		const node = payload.store.state.nodesById[nodeId] as Record<string, unknown>
		if (!node || node.type !== 'unreal-export') return

		const settings = (node.unrealExportSettings as Record<string, unknown>) ?? {}
		const assetRootPath = String(settings.assetRootPath ?? '/Game/DVStudio').trim() || '/Game/DVStudio'

		try {
			const sessionId = await ensureConnected(nodeId)
			if (!sessionId) return

			const built = await buildUnrealExportPayload(nodeId, exportMode)
			if (!built.ok) {
				setNodeStatus(nodeId, 'error', {
					statusText: t('aiworkflow.runtime.unrealPrepareFailed'),
					message: built.error
				})
				payload.pushToast(built.error, 'warn')
				return
			}

			setNodeStatus(nodeId, 'creating-job', {
				statusText: t('aiworkflow.runtime.unrealCreatingJob'),
				message: t('aiworkflow.runtime.unrealCreatingJobMessage')
			})

			const res = (await payload.unrealExportService.createJob({
				targetSessionId: sessionId,
				sourceNodeId: built.payload.sourceNodeId,
				sceneName: built.payload.sceneName,
				assetRootPath,
				exportPayload: built.payload
			})) as Record<string, unknown>

			if (!res.ok) {
				setNodeStatus(nodeId, 'error', {
					statusText: t('aiworkflow.runtime.unrealJobCreateFailed'),
					message: String(res.error || 'unknown')
				})
				payload.pushToast(t('aiworkflow.toast.unrealJobCreateFailed', { error: String(res.error || 'unknown') }), 'warn')
				return
			}

			const job = res.job as Record<string, unknown>
			const jobId = String(job.jobId ?? '')
			const createdToastKey = exportMode === 'lighting-only'
				? 'aiworkflow.runtime.unrealLightingJobCreatedToast'
				: 'aiworkflow.runtime.unrealSceneJobCreatedToast'

			payload.store.commit('setNodeUnrealExportSettings', {
				nodeId,
				unrealExportSettings: {
					connectionStatus: 'exporting',
					statusText: t('aiworkflow.runtime.unrealJobCreatedStatus'),
					message: t('aiworkflow.runtime.unrealJobCreatedMessage'),
					lastExportMode: exportMode,
					lastExportJobId: jobId,
					lastExportStatus: 'pending',
					lastExportStage: t('aiworkflow.runtime.unrealStagePending'),
					lastExportProgress: 5,
					lastExportMessage: t('aiworkflow.runtime.unrealWaitingForPull'),
					lastLayoutProtocolVersion: 4,
					lastSlotCount: Number.isFinite(Number(built.payload.resolvedSlotCount))
						? Number(built.payload.resolvedSlotCount)
						: undefined,
					lastExportAt: Date.now(),
					assetRootPath
				}
			})

			payload.pushToast(t(createdToastKey), 'info')

			await new Promise((r) => setTimeout(r, 1000))
			await pollJobProgress(nodeId, jobId)
		} catch (err) {
			const errMsg = (err as Error).message || 'unknown'
			setNodeStatus(nodeId, 'error', {
				statusText: t('aiworkflow.runtime.unrealExportException'),
				message: errMsg
			})
			payload.pushToast(t('aiworkflow.runtime.unrealExportError', { error: errMsg }), 'error')
		}
	}

	const onNodeExportUnrealScene = async (nodeId: string) => {
		await performExport(nodeId, 'scene-layout')
	}

	const onNodeExportUnrealLighting = async (nodeId: string) => {
		await performExport(nodeId, 'lighting-only')
	}

	const onNodeDisconnect = async (nodeId: string) => {
		const node = payload.store.state.nodesById[nodeId] as Record<string, unknown>
		if (!node || node.type !== 'unreal-export') return

		const settings = (node.unrealExportSettings as Record<string, unknown>) ?? {}
		const sessionId = String(settings.targetSessionId ?? '').trim()

		stopProgressPolling()

		if (sessionId) {
			try {
				await payload.unrealExportService.disconnectSession(sessionId)
			} catch (err) {
				console.warn('[UnrealExport] disconnect session error:', err)
			}
		}

		payload.store.commit('setNodeUnrealExportSettings', {
			nodeId,
			unrealExportSettings: {
				connectionStatus: 'idle',
				statusText: t('aiworkflow.runtime.unrealNotConnected'),
				message: t('aiworkflow.runtime.unrealNotConnectedMessage'),
				targetSessionId: '',
				connectedSession: null,
				editorStatus: 'unknown',
				pluginStatus: 'unknown',
				lastExportJobId: '',
				lastExportProgress: 0
			}
		})
		payload.pushToast(t('aiworkflow.runtime.disconnectedFromUnreal'), 'info')
	}

	const onNodeDetectEditor = async (nodeId: string) => {
		await performExport(nodeId, 'scene-layout')
	}

	const onNodeCheckPlugin = async (_nodeId: string, _projectPath: string) => {}
	const onNodeInstallPlugin = async (_nodeId: string, _projectPath: string) => {}

	const onNodeSetAssetRootPath = async (nodeId: string, assetRootPath: string) => {
		const node = payload.store.state.nodesById[nodeId] as Record<string, unknown>
		if (!node || node.type !== 'unreal-export') return

		const trimmedPath = String(assetRootPath || '').trim()
		if (!trimmedPath) {
			payload.pushToast(t('aiworkflow.runtime.assetPathEmpty'), 'warn')
			return
		}

		if (!trimmedPath.startsWith('/Game/') && !trimmedPath.startsWith('/Game')) {
			payload.pushToast(t('aiworkflow.runtime.assetPathInvalid'), 'warn')
			return
		}

		payload.store.commit('setNodeUnrealExportSettings', {
			nodeId,
			unrealExportSettings: {
				assetRootPath: trimmedPath,
				assetPathValidation: 'valid',
				assetPathValidationError: undefined
			}
		})

		payload.pushToast(t('aiworkflow.runtime.assetPathSet', { path: trimmedPath }), 'info')
	}

	return {
		buildUnrealExportPayload,
		onNodeExportUnrealScene,
		onNodeExportUnrealLighting,
		onNodeDisconnect,
		onNodeDetectEditor,
		onNodeCheckPlugin,
		onNodeInstallPlugin,
		onNodeSetAssetRootPath
	}
}
