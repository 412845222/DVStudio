export const useAIWorkflowUnrealExportActions = (payload: {
	store: {
		state: {
			nodesById: Record<string, unknown>
		}
		commit: (type: string, value: unknown) => void
	}
	unrealExportService: {
		createJob: (input: {
			targetSessionId: string
			sourceNodeId: string
			sceneName: string
			exportPayload: Record<string, unknown>
		}) => Promise<Record<string, unknown>>
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
	}
	connectedTextInputValue: (nodeId: string, inputId: string) => string
	getUnrealExportSourceSceneLayoutNode: (nodeId: string) => unknown
	getResolvedLayoutForUnreal: (
		sceneLayoutNodeId: string
	) => Promise<{ ok: true; exportData: unknown } | { ok: false; error: string }>
	connectedSceneLayoutModelBindings: (nodeId: string) => unknown[]
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
}) => {
	const normalizeResolvedLayoutSlots = (slots: unknown[]) => {
		return slots
			.filter((slot) => {
				if (!slot || typeof slot !== 'object') return false
				const slotObj = slot as Record<string, unknown>
				const slotId = String(slotObj.slotId ?? '').trim()
				const sourceObjectId = String(slotObj.sourceObjectId ?? '').trim()
				if (!slotId || !sourceObjectId) return false
				if (!slotObj.previewInstanceTransform || typeof slotObj.previewInstanceTransform !== 'object')
					return false
				if (!slotObj.modelBinding || typeof slotObj.modelBinding !== 'object') return false
				return true
			})
			.map((slot) => ({ ...(slot as Record<string, unknown>) }))
			.sort((a, b) =>
				String((a as Record<string, unknown>).slotId ?? '').localeCompare(
					String((b as Record<string, unknown>).slotId ?? '')
				)
			)
	}

	const buildUnrealExportPayload = async (
		nodeId: string,
		exportMode: 'scene-layout' | 'lighting-only' = 'scene-layout'
	) => {
		const node = payload.store.state.nodesById[nodeId] as Record<string, unknown>
		if (!node || node.type !== 'unreal-export') return { ok: false as const, error: '节点不存在' }
		const layoutJson = String(
			payload.connectedTextInputValue(nodeId, 'in-layout-json') ?? ''
		).trim()
		if (exportMode === 'scene-layout' && !layoutJson)
			return { ok: false as const, error: '当前节点缺少布局 JSON 输入。' }
		const lightingJson = String(
			payload.connectedTextInputValue(nodeId, 'in-lighting-json') ?? ''
		).trim()
		if (exportMode === 'lighting-only' && !lightingJson)
			return { ok: false as const, error: '当前节点缺少灯光 JSON 输入。' }
		const sourceNode = payload.getUnrealExportSourceSceneLayoutNode(nodeId) as Record<string, unknown> | null
		const sourceSceneLayoutSettings = sourceNode?.sceneLayoutSettings as Record<string, unknown> | null
		const modelBindings = sourceNode && sourceNode.id ? payload.connectedSceneLayoutModelBindings(String(sourceNode.id)) : []
		const layoutItems = Array.isArray(sourceSceneLayoutSettings?.layoutItems)
			? (sourceSceneLayoutSettings?.layoutItems as unknown[] ?? [])
			: []
		const manualModelBindings = Array.isArray(sourceSceneLayoutSettings?.manualModelBindings)
			? (sourceSceneLayoutSettings?.manualModelBindings as unknown[] ?? [])
			: []
		const sourceSceneLayoutNodeId =
			sourceNode?.type === 'scene-layout' ? String(sourceNode.id ?? '').trim() : ''
		if (exportMode === 'scene-layout' && !sourceSceneLayoutNodeId) {
			return { ok: false as const, error: '当前 Unreal 导出节点未连接场景布局节点。' }
		}
		const connectedModelBindings = Array.isArray(modelBindings)
			? modelBindings.filter((item: unknown) => (item as Record<string, unknown>)?.connected)
			: []
		if (exportMode === 'scene-layout' && connectedModelBindings.length <= 0) {
			return {
				ok: false as const,
				error: '当前场景没有可导入的真实模型绑定（glb/gltf）。请先连接模型资源后再导出。'
			}
		}

		let resolvedLayoutSlots: unknown[] = []
		let resolvedLayoutWarnings: string[] = []
		let resolvedActorOrigin: Record<string, unknown> | null = null
		let resolvedSourceItemCount = 0
		if (exportMode === 'scene-layout') {
			const resolvedResult = await payload.getResolvedLayoutForUnreal(sourceSceneLayoutNodeId)
			if (!resolvedResult.ok) {
				return {
					ok: false as const,
					error: `获取场景布局 resolved slots 失败：${resolvedResult.error || 'unknown'}`
				}
			}
			const exportData =
				resolvedResult.exportData && typeof resolvedResult.exportData === 'object'
					? (resolvedResult.exportData as Record<string, unknown>)
					: null
			const rawSlots = exportData && Array.isArray(exportData.slots) ? (exportData.slots as unknown[]) : []
			resolvedLayoutSlots = normalizeResolvedLayoutSlots(rawSlots)
			resolvedLayoutWarnings = exportData && Array.isArray(exportData.warnings)
				? (exportData.warnings as unknown[]).map((item: unknown) => String(item ?? '').trim()).filter(Boolean)
				: []
			resolvedActorOrigin =
				exportData?.actorOrigin && typeof exportData.actorOrigin === 'object'
					? { ...(exportData.actorOrigin as Record<string, unknown>) }
					: null
			resolvedSourceItemCount = exportData && Number.isFinite(Number(exportData.sourceItemCount))
				? Number(exportData.sourceItemCount)
				: 0
			if (resolvedLayoutSlots.length <= 0) {
				return {
					ok: false as const,
					error: 'resolved slots 为空，无法执行场景导出。请先确保场景布局预览完成并且模型绑定可用。'
				}
			}
		}

		return {
			ok: true as const,
			payload: {
				exportVersion: 5,
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
				layoutJson,
				lightingJson,
				resolvedLayoutSlots,
				resolvedSlotCount: resolvedLayoutSlots.length,
				resolvedLayoutWarnings,
				resolvedActorOrigin,
				resolvedSourceItemCount,
				layoutItems,
				modelBindings: connectedModelBindings,
				manualModelBindings,
				layoutItemCount: layoutItems.length,
				modelBindingCount: connectedModelBindings.length,
				manualModelBindingCount: manualModelBindings.length
			}
		}
	}

	const onNodeExportUnrealScene = async (nodeId: string) => {
		const node = payload.store.state.nodesById[nodeId] as Record<string, unknown>
		if (!node || node.type !== 'unreal-export') return
		const settings = (node.unrealExportSettings as Record<string, unknown>) ?? {}
		const targetSessionId = String(
			settings.targetSessionId ?? (settings.connectedSession as Record<string, unknown>)?.sessionId ?? ''
		).trim()
		if (!targetSessionId) {
			payload.pushToast('当前 Unreal 导出节点尚未连接虚幻插件。', 'warn')
			return
		}
		const built = await buildUnrealExportPayload(nodeId, 'scene-layout')
		if (!built.ok) {
			payload.pushToast(built.error, 'warn')
			return
		}
		payload.store.commit('setNodeUnrealExportSettings', {
			nodeId,
			unrealExportSettings: {
				connectionStatus: 'exporting',
				statusText: '正在创建导出任务',
				message: '正在把场景布局数据发送给 Django 后端。',
				lastExportMode: 'scene-layout',
				lastSlotCount: Number.isFinite(Number(built.payload.resolvedSlotCount))
					? Number(built.payload.resolvedSlotCount)
					: undefined
			}
		})
		const res = (await payload.unrealExportService.createJob({
			targetSessionId,
			sourceNodeId: built.payload.sourceNodeId,
			sceneName: built.payload.sceneName,
			exportPayload: built.payload
		})) as Record<string, unknown>
		if (!res.ok) {
			payload.store.commit('setNodeUnrealExportSettings', {
				nodeId,
				unrealExportSettings: {
					connectionStatus: 'error',
					statusText: '导出任务创建失败',
					message: (res.error as string) || 'unknown'
				}
			})
			payload.pushToast(`创建 Unreal 导出任务失败：${res.error || 'unknown'}`, 'warn')
			return
		}
		const job = res.job as Record<string, unknown>
		payload.store.commit('setNodeUnrealExportSettings', {
			nodeId,
			unrealExportSettings: {
				connectionStatus: 'connected',
				statusText: '已连接，导出任务已入队',
				message: '请在虚幻插件中点击“接收布局数据”。',
				lastExportMode: 'scene-layout',
				lastExportJobId: job.jobId,
				lastExportStatus: 'queued',
				lastExportStage: '导出任务已入队',
				lastExportProgress: 5,
				lastExportMessage: String(job.message ?? '').trim() || '等待插件拉取',
				lastLayoutProtocolVersion: 4,
				lastSlotCount: Number.isFinite(Number(built.payload.resolvedSlotCount))
					? Number(built.payload.resolvedSlotCount)
					: undefined,
				lastExportAt: Number(job.createdAt ?? Date.now()) || Date.now()
			}
		})
		payload.pushToast(`Unreal 导出任务已创建：${job.jobId}`, 'info')
	}

	const onNodeExportUnrealLighting = async (nodeId: string) => {
		const node = payload.store.state.nodesById[nodeId] as Record<string, unknown>
		if (!node || node.type !== 'unreal-export') return
		const settings = (node.unrealExportSettings as Record<string, unknown>) ?? {}
		const targetSessionId = String(
			settings.targetSessionId ?? (settings.connectedSession as Record<string, unknown>)?.sessionId ?? ''
		).trim()
		if (!targetSessionId) {
			payload.pushToast('当前 Unreal 导出节点尚未连接虚幻插件。', 'warn')
			return
		}
		const built = await buildUnrealExportPayload(nodeId, 'lighting-only')
		if (!built.ok) {
			payload.pushToast(built.error, 'warn')
			return
		}
		payload.store.commit('setNodeUnrealExportSettings', {
			nodeId,
			unrealExportSettings: {
				connectionStatus: 'exporting',
				statusText: '正在创建灯光任务',
				message: '正在把灯光布局信息发送给 Django 后端。',
				lastExportMode: 'lighting-only'
			}
		})
		const res = (await payload.unrealExportService.createJob({
			targetSessionId,
			sourceNodeId: built.payload.sourceNodeId,
			sceneName: built.payload.sceneName,
			exportPayload: built.payload
		})) as Record<string, unknown>
		if (!res.ok) {
			payload.store.commit('setNodeUnrealExportSettings', {
				nodeId,
				unrealExportSettings: {
					connectionStatus: 'error',
					statusText: '灯光任务创建失败',
					message: (res.error as string) || 'unknown'
				}
			})
			payload.pushToast(`创建 Unreal 灯光任务失败：${res.error || 'unknown'}`, 'warn')
			return
		}
		const job = res.job as Record<string, unknown>
		payload.store.commit('setNodeUnrealExportSettings', {
			nodeId,
			unrealExportSettings: {
				connectionStatus: 'connected',
				statusText: '已连接，灯光任务已入队',
				message: '请在虚幻插件中选择场景Actor并点击“接收灯光数据”。',
				lastExportMode: 'lighting-only',
				lastExportJobId: job.jobId,
				lastExportStatus: 'queued',
				lastExportStage: '灯光任务已入队',
				lastExportProgress: 5,
				lastExportMessage: String(job.message ?? '').trim() || '等待插件拉取',
				lastExportAt: Number(job.createdAt ?? Date.now()) || Date.now()
			}
		})
		payload.pushToast(`Unreal 灯光任务已创建：${job.jobId}`, 'info')
	}

	const onNodeDetectEditor = async (nodeId: string) => {
		const node = payload.store.state.nodesById[nodeId] as Record<string, unknown>
		if (!node || node.type !== 'unreal-export') return

		payload.store.commit('setNodeUnrealExportSettings', {
			nodeId,
			unrealExportSettings: {
				editorStatus: 'checking',
				editorCheckedAt: Date.now()
			}
		})

		try {
			const result = await payload.unrealExportService.detectEditor()
			if (!result.ok) {
				payload.store.commit('setNodeUnrealExportSettings', {
					nodeId,
					unrealExportSettings: {
						editorStatus: 'unknown',
						editorCheckedAt: Date.now(),
						editorProcess: null,
						editorProcesses: []
					}
				})
				payload.pushToast(`检测虚幻编辑器失败: ${result.error || 'unknown'}`, 'warn')
				return
			}

			const firstProcess = result.processes?.[0] || null
			payload.store.commit('setNodeUnrealExportSettings', {
				nodeId,
				unrealExportSettings: {
					editorStatus: result.running ? 'running' : 'not-running',
					editorCheckedAt: Date.now(),
					editorProcess: firstProcess
						? {
								pid: firstProcess.pid,
								projectPath: firstProcess.projectPath,
								projectName: firstProcess.projectName
							}
						: null,
					editorProcesses: result.processes || []
				}
			})

			if (result.running && firstProcess?.projectPath) {
				onNodeCheckPlugin(nodeId, firstProcess.projectPath)
			}
		} catch (err) {
			payload.store.commit('setNodeUnrealExportSettings', {
				nodeId,
				unrealExportSettings: {
					editorStatus: 'unknown',
					editorCheckedAt: Date.now()
				}
			})
			payload.pushToast(`检测虚幻编辑器异常: ${(err as Error).message || 'unknown'}`, 'warn')
		}
	}

	const onNodeCheckPlugin = async (nodeId: string, projectPath: string) => {
		const node = payload.store.state.nodesById[nodeId] as Record<string, unknown>
		if (!node || node.type !== 'unreal-export') return

		const trimmedPath = String(projectPath || '').trim()
		if (!trimmedPath) {
			payload.pushToast('请先指定虚幻项目路径', 'warn')
			return
		}

		payload.store.commit('setNodeUnrealExportSettings', {
			nodeId,
			unrealExportSettings: {
				pluginStatus: 'checking',
				pluginCheckedAt: Date.now(),
				pluginInstallConfig: {
					targetProjectPath: trimmedPath
				}
			}
		})

		try {
			const result = await payload.unrealExportService.checkPlugin(trimmedPath)
			if (!result.ok) {
				payload.store.commit('setNodeUnrealExportSettings', {
					nodeId,
					unrealExportSettings: {
						pluginStatus: 'unknown',
						pluginCheckedAt: Date.now(),
						pluginInstallError: result.error
					}
				})
				payload.pushToast(`检测插件失败: ${result.error || 'unknown'}`, 'warn')
				return
			}

			payload.store.commit('setNodeUnrealExportSettings', {
				nodeId,
				unrealExportSettings: {
					pluginStatus: result.installed ? 'installed' : 'not-installed',
					pluginCheckedAt: Date.now(),
					pluginVersion: result.pluginVersion,
					pluginInstallConfig: {
						targetProjectPath: result.projectRoot || trimmedPath
					}
				}
			})
		} catch (err) {
			payload.store.commit('setNodeUnrealExportSettings', {
				nodeId,
				unrealExportSettings: {
					pluginStatus: 'unknown',
					pluginCheckedAt: Date.now(),
					pluginInstallError: (err as Error).message
				}
			})
			payload.pushToast(`检测插件异常: ${(err as Error).message || 'unknown'}`, 'warn')
		}
	}

	const onNodeInstallPlugin = async (nodeId: string, projectPath: string) => {
		const node = payload.store.state.nodesById[nodeId] as Record<string, unknown>
		if (!node || node.type !== 'unreal-export') return

		const trimmedPath = String(projectPath || '').trim()
		if (!trimmedPath) {
			payload.pushToast('请先指定虚幻项目路径', 'warn')
			return
		}

		payload.store.commit('setNodeUnrealExportSettings', {
			nodeId,
			unrealExportSettings: {
				pluginStatus: 'installing',
				pluginInstallConfig: {
					targetProjectPath: trimmedPath
				}
			}
		})

		try {
			const result = await payload.unrealExportService.installPlugin(trimmedPath)
			if (!result.ok) {
				payload.store.commit('setNodeUnrealExportSettings', {
					nodeId,
					unrealExportSettings: {
						pluginStatus: 'install-error',
						pluginInstallError: result.error
					}
				})
				payload.pushToast(`插件安装失败: ${result.error || 'unknown'}`, 'error')
				return
			}

			payload.store.commit('setNodeUnrealExportSettings', {
				nodeId,
				unrealExportSettings: {
					pluginStatus: 'needs-restart',
					pluginVersion: result.pluginVersion,
					pluginInstallConfig: {
						targetProjectPath: result.projectRoot || trimmedPath
					}
				}
			})
			payload.pushToast('插件安装成功！请重启虚幻编辑器以加载插件', 'info')
		} catch (err) {
			payload.store.commit('setNodeUnrealExportSettings', {
				nodeId,
				unrealExportSettings: {
					pluginStatus: 'install-error',
					pluginInstallError: (err as Error).message
				}
			})
			payload.pushToast(`插件安装异常: ${(err as Error).message || 'unknown'}`, 'error')
		}
	}

	return {
		buildUnrealExportPayload,
		onNodeExportUnrealScene,
		onNodeExportUnrealLighting,
		onNodeDetectEditor,
		onNodeCheckPlugin,
		onNodeInstallPlugin
	}
}
