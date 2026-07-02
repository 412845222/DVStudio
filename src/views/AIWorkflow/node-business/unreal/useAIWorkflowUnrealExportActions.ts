import { normalizeResolvedLayoutSlots, buildSlotsFromModelBindings, getUnrealConnectionPollInterval } from './unrealExportUtils'

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
			statusText: '等待虚幻插件连接',
			message: '请在虚幻编辑器中打开 Dweb Workflow Bridge 插件面板并点击 Connect 按钮...'
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
								statusText: '虚幻编辑器已连接',
								message: `已连接到项目：${active.projectName || ''}`,
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
					payload.store.commit('setNodeUnrealExportSettings', {
						nodeId,
						unrealExportSettings: {
							connectionStatus: 'connected',
							statusText: '导出完成',
							message: `成功导入 ${importedAssetCount || spawnedActorCount} 个资产`,
							lastExportStatus: 'completed',
							lastExportProgress: 100,
							lastExportStage: '完成',
							lastExportMessage: message || '导出成功',
							lastBlueprintAssetPath: blueprintAssetPath,
							lastModelsAssetPath: modelsAssetPath,
							lastImportedAssetCount: importedAssetCount,
							lastSpawnedActorCount: spawnedActorCount
						}
					})
					payload.pushToast('Unreal 导出完成！', 'info')
					return
				}

				if (status === 'failed') {
					stopProgressPolling()
					const errMsg = String(job.error ?? message ?? '导出失败')
					payload.store.commit('setNodeUnrealExportSettings', {
						nodeId,
						unrealExportSettings: {
							connectionStatus: 'error',
							statusText: '导出失败',
							message: errMsg,
							lastExportStatus: 'failed',
							lastExportMessage: errMsg
						}
					})
					payload.pushToast(`Unreal 导出失败：${errMsg}`, 'error')
					return
				}

				payload.store.commit('setNodeUnrealExportSettings', {
					nodeId,
					unrealExportSettings: {
						connectionStatus: 'exporting',
						lastExportStatus: status,
						lastExportProgress: Math.max(5, Math.min(99, progress || 5)),
						lastExportStage: stage || getStageText(status),
						lastExportMessage: message || getStageText(status),
						statusText: '导出中',
						message: `${getStageText(status)}...`
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
			case 'pending': return '等待虚幻插件接收任务'
			case 'picked': return '虚幻插件已接收任务'
			case 'downloading': return '下载模型资产中'
			case 'importing': return '导入资产到虚幻中'
			case 'assembling-actor': return '组装Actor中'
			case 'applying-lighting': return '应用灯光设置中'
			default: return '处理中'
		}
	}

	const buildUnrealExportPayload = async (
		nodeId: string,
		exportMode: 'scene-layout' | 'lighting-only' = 'scene-layout'
	) => {
		const node = payload.store.state.nodesById[nodeId] as Record<string, unknown>
		if (!node || node.type !== 'unreal-export') return { ok: false as const, error: '节点不存在' }

		const sourceNode = payload.getUnrealExportSourceSceneLayoutNode(nodeId) as Record<string, unknown> | null
		const sourceSceneLayoutSettings = sourceNode?.sceneLayoutSettings as Record<string, unknown> | null
		const modelBindings = sourceNode && sourceNode.id ? payload.connectedSceneLayoutModelBindings(String(sourceNode.id)) : []
		const sourceSceneLayoutNodeId =
			sourceNode?.type === 'scene-layout' ? String(sourceNode.id ?? '').trim() : ''

		if (exportMode === 'scene-layout') {
			if (!sourceSceneLayoutNodeId) {
				return { ok: false as const, error: '当前 Unreal 导出节点未连接场景布局节点。' }
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
					error: '当前场景没有可导入的真实模型绑定（glb/gltf/fbx等）。请先连接模型资源后再导出。'
				}
			}

			if (payload.validateModelBindings) {
				const validation = payload.validateModelBindings(connectedModelBindings)
				if (validation.invalid && validation.invalid.length > 0) {
					const invalidReasons = validation.invalid.map(item => item.reason).join('；')
					const detailLines = validation.invalid.map((item, idx) => {
						const b = item.binding as Record<string, unknown>
						const name = String(b.objectName ?? b.objectId ?? `模型${idx + 1}`).trim()
						const path = String(b.modelSourcePath ?? b.modelAssetPath ?? b.modelUrl ?? b.modelAssetUrl ?? '无路径').trim()
						return `  × ${name}: ${item.reason} (路径: ${path})`
					}).join('\n')
					return {
						ok: false as const,
						error: `资产预检查失败（${validation.invalid.length} 个模型未通过验证）：\n${detailLines}\n\n请修复以上问题后再执行导出。`
					}
				}
				if (validation.warnings && validation.warnings.length > 0) {
					const warnMsg = `资产验证警告：${validation.warnings.join('；')}`
					payload.pushToast(warnMsg, 'warn')
				}
				payload.pushToast(`资产预检查通过：共 ${connectedModelBindings.length} 个模型验证绿灯`, 'info')
			}

			const totalLayoutItems = Array.isArray(sourceSceneLayoutSettings?.layoutItems)
				? sourceSceneLayoutSettings!.layoutItems.length
				: 0
			if (totalLayoutItems > 0 && connectedModelBindings.length < totalLayoutItems) {
				payload.pushToast(`注意：场景布局有 ${totalLayoutItems} 个占位体，但只有 ${connectedModelBindings.length} 个已绑定模型`, 'warn')
			}

			setNodeStatus(nodeId, 'activating-upstream', {
				statusText: '激活上游场景布局节点',
				message: '正在确保场景布局预览模式已激活...'
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
				resolvedLayoutWarnings.push(`${generatedSlotCount} 个模型通过绑定直接生成，可能缺少精确的场景变换，将使用默认位置。`)
			}

			if (resolvedLayoutSlots.length <= 0) {
				return {
					ok: false as const,
					error: '未能生成场景布局数据，请确保模型绑定可用。'
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
							statusText: '虚幻编辑器已连接',
							message: `已连接到项目：${active.projectName || ''}`
						}
					})
					return sid
				}
			}
		}

		setNodeStatus(nodeId, 'checking-editor', {
			statusText: '检测虚幻编辑器',
			message: '正在检查虚幻编辑器是否运行...',
			editorStatus: 'checking'
		})

		const detectResult = await payload.unrealExportService.detectEditor()
		if (!detectResult.ok || !detectResult.running || detectResult.processes.length === 0) {
			setNodeStatus(nodeId, 'editor-not-running', {
				statusText: '未检测到虚幻编辑器',
				message: '请先启动虚幻编辑器并打开项目，然后重新点击导出。',
				editorStatus: 'not-running'
			})
			payload.pushToast('未检测到正在运行的虚幻编辑器，请先启动编辑器并打开项目。', 'warn')
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
			statusText: '检测插件状态',
			message: '正在检查项目是否安装了 DwebWorkflowBridge 插件...',
			pluginStatus: 'checking'
		})

		const pluginResult = await payload.unrealExportService.checkPlugin(projectPath)
		if (!pluginResult.ok || !pluginResult.installed) {
			setNodeStatus(nodeId, 'installing-plugin', {
				statusText: '正在安装插件',
				message: '检测到插件未安装，正在自动安装 DwebWorkflowBridge 插件...',
				pluginStatus: 'installing',
				pluginInstallConfig: { targetProjectPath: pluginResult.projectRoot || projectPath }
			})

			const installResult = await payload.unrealExportService.installPlugin(pluginResult.projectRoot || projectPath)
			if (!installResult.ok || !installResult.installed) {
				setNodeStatus(nodeId, 'error', {
					statusText: '插件安装失败',
					message: installResult.error || '自动安装插件失败，请手动安装。',
					pluginStatus: 'install-error',
					pluginInstallError: installResult.error
				})
				payload.pushToast(`插件安装失败：${installResult.error || 'unknown'}`, 'error')
				return null
			}

			setNodeStatus(nodeId, 'needs-restart', {
				statusText: '插件已安装，请重启编辑器',
				message: 'DwebWorkflowBridge 插件安装成功！请重启虚幻编辑器以加载插件，然后重新点击导出。',
				pluginStatus: 'needs-restart',
				pluginVersion: installResult.pluginVersion
			})
			payload.pushToast('插件安装成功！请重启虚幻编辑器，然后重新点击导出按钮。', 'info')
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
				statusText: '连接超时',
				message: '等待虚幻插件连接超时，请确保在虚幻编辑器中打开了插件面板并点击了 Connect 按钮。'
			})
			payload.pushToast('等待虚幻插件连接超时，请检查插件是否已连接。', 'warn')
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
					statusText: '准备导出数据失败',
					message: built.error
				})
				payload.pushToast(built.error, 'warn')
				return
			}

			setNodeStatus(nodeId, 'creating-job', {
				statusText: '创建导出任务',
				message: '正在创建导出任务...'
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
					statusText: '创建任务失败',
					message: String(res.error || 'unknown')
				})
				payload.pushToast(`创建 Unreal 导出任务失败：${res.error || 'unknown'}`, 'warn')
				return
			}

			const job = res.job as Record<string, unknown>
			const jobId = String(job.jobId ?? '')

			payload.store.commit('setNodeUnrealExportSettings', {
				nodeId,
				unrealExportSettings: {
					connectionStatus: 'exporting',
					statusText: '导出任务已创建',
					message: '虚幻插件正在自动接收并处理任务...',
					lastExportMode: exportMode,
					lastExportJobId: jobId,
					lastExportStatus: 'pending',
					lastExportStage: '等待虚幻插件接收任务',
					lastExportProgress: 5,
					lastExportMessage: '等待虚幻插件拉取任务',
					lastLayoutProtocolVersion: 4,
					lastSlotCount: Number.isFinite(Number(built.payload.resolvedSlotCount))
						? Number(built.payload.resolvedSlotCount)
						: undefined,
					lastExportAt: Date.now(),
					assetRootPath
				}
			})

			payload.pushToast(`Unreal ${exportMode === 'lighting-only' ? '灯光' : '场景'}导出任务已创建，虚幻插件将自动处理。`, 'info')

			await new Promise((r) => setTimeout(r, 1000))
			await pollJobProgress(nodeId, jobId)
		} catch (err) {
			const errMsg = (err as Error).message || 'unknown'
			setNodeStatus(nodeId, 'error', {
				statusText: '导出异常',
				message: errMsg
			})
			payload.pushToast(`导出异常：${errMsg}`, 'error')
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
				statusText: '未连接',
				message: '点击导出按钮开始一键导出流程',
				targetSessionId: '',
				connectedSession: null,
				editorStatus: 'unknown',
				pluginStatus: 'unknown',
				lastExportJobId: '',
				lastExportProgress: 0
			}
		})
		payload.pushToast('已断开与虚幻编辑器的连接', 'info')
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
			payload.pushToast('资产根路径不能为空', 'warn')
			return
		}

		if (!trimmedPath.startsWith('/Game/') && !trimmedPath.startsWith('/Game')) {
			payload.pushToast('资产根路径必须以 /Game/ 开头（例如 /Game/DVStudio）', 'warn')
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

		payload.pushToast(`资产根路径已设置为: ${trimmedPath}`, 'info')
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
