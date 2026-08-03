import {
	prepareResolvedSlotsForExport,
	getUnrealConnectionPollInterval,
	mergeViewerResolvedIntoFinalBindings,
	isConnectedTruthy,
	hasAnyPathExtended
} from './unrealExportUtils'
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
	getThreePreviewState?: (
		nodeId: string,
		nodeType: string
	) => { phase?: string; canStart?: boolean } | null
	selectNode?: (nodeId: string) => void
	forceNodeFullRender?: (nodeId: string, enable: boolean) => void
	focusNode?: (nodeId: string) => void
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

	const waitForConnection = async (
		nodeId: string,
		timeoutMs: number = 60000
	): Promise<string | null> => {
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
			if (
				sessionsRes.ok &&
				Array.isArray(sessionsRes.sessions) &&
				sessionsRes.sessions.length > 0
			) {
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
								message: t('aiworkflow.runtime.unrealConnectedProject', {
									project: String(active.projectName || '')
								}),
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
							message: t('aiworkflow.runtime.unrealExportSuccessCount', {
								count: String(assetCount)
							}),
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
					const errMsg = String(
						job.error ?? message ?? t('aiworkflow.runtime.unrealExportStatusFailed')
					)
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
			case 'pending':
				return t('aiworkflow.runtime.unrealStagePending')
			case 'picked':
				return t('aiworkflow.runtime.unrealStagePicked')
			case 'downloading':
				return t('aiworkflow.runtime.unrealStageDownloading')
			case 'importing':
				return t('aiworkflow.runtime.unrealStageImporting')
			case 'assembling-actor':
				return t('aiworkflow.runtime.unrealStageAssemblingActor')
			case 'applying-lighting':
				return t('aiworkflow.runtime.unrealStageApplyingLighting')
			default:
				return t('aiworkflow.runtime.processing')
		}
	}

	const buildUnrealExportPayload = async (
		nodeId: string,
		exportMode: 'scene-layout' | 'lighting-only' = 'scene-layout'
	) => {
		const node = payload.store.state.nodesById[nodeId] as Record<string, unknown>
		if (!node || node.type !== 'unreal-export')
			return { ok: false as const, error: t('aiworkflow.runtime.unrealNodeNotExist') }

		const sourceNode = payload.getUnrealExportSourceSceneLayoutNode(nodeId) as Record<
			string,
			unknown
		> | null
		const sourceSceneLayoutSettings = sourceNode?.sceneLayoutSettings as Record<
			string,
			unknown
		> | null
		const rawModelBindingsFallback =
			sourceNode && sourceNode.id
				? payload.connectedSceneLayoutModelBindings(String(sourceNode.id))
				: []
		const sourceSceneLayoutNodeId =
			sourceNode?.type === 'scene-layout' ? String(sourceNode.id ?? '').trim() : ''

		if (exportMode === 'scene-layout') {
			if (!sourceSceneLayoutNodeId) {
				return { ok: false as const, error: t('aiworkflow.runtime.unrealNoSceneLayoutConnected') }
			}

			// ========================================================================
			// 2026-08-03 预校验层修复：Precheck 不再使用 (connected && hasAnyPath) 这种
			//   会把 18/27 个新链路 decompose 模型全部过滤掉的"严卡门槛"。
			// ——用户现场：
			//   CHAIN DIAG 观测到 27 条真实 in-model-* 入边，但 connected=false
			//   （或路径字段没正确回填到 6 个标准字段里）的条目直接 return false，
			//   导致 connectedModelBindings 基底只有 9 个，mergeViewerResolved 之后
			//   finalBindingsSource 永远只有 9 → buildPureDataSlots 也只能拿到
			//   9 个 objectId 的 binding → validSlots 只有 7 → 用户感知"只导入了
			//   第 1 个旧链路 bar_main，后面 23 个有真实蓝图连线的模型全部被跳过"。
			// ——修复思路：
			//   ① 这里的 Precheck 只筛"有 objectId 的 binding（不管 connected 真假、
			//     不管当前 6 路径字段是不是空），全部纳入基底"；
			//   ② 真正的"这个 binding 到底有没有可导出资产"留给两层下游去做：
			//      - buildPureDataSlotsForUnreal / prepareResolvedSlotsForExport 里
			//        的 resourcesById + sourceNodeId 终极兜底；
			//      - prepareResolvedSlotsForExport 最末尾的 last-mile hasAnyPath
			//        出口过滤（只在即将发送给 UE 插件前才真正丢弃）。
			//   这样 27 条入边的 objectId 都能"活到"兜底层，兜底层只要从 outputs /
			//   顶层字段 / resourceId 找到任一路径，就会回填 6 路径字段 + 放行。
			// ========================================================================
			const _precheckRaw = Array.isArray(rawModelBindingsFallback)
				? rawModelBindingsFallback.filter((item: unknown) => {
						if (!item || typeof item !== 'object') return false
						const obj = item as Record<string, unknown>
						const objectId = String(obj.objectId ?? '').trim()
						if (!objectId) return false
						// 只过滤掉"连 objectId 都没有的纯空 binding"，其它全部收下。
						// connected / hasAnyPath 不再作为硬门槛，完全交给下游兜底 + 出口过滤。
						return true
					})
				: []
			// 快速失败保护：至少要有 1 个带 objectId 的 binding，否则直接报错
			// （这等同于"SceneLayout 节点上完全没有任何 in-model-* 入边"的极端 case）
			const connectedModelBindings = _precheckRaw
			if (connectedModelBindings.length <= 0) {
				return {
					ok: false as const,
					error: t('aiworkflow.runtime.unrealNoModelBindings')
				}
			}

			if (payload.validateModelBindings) {
				// ========================================================================
				// 2026-08-03 修复：validateModelBindings 的"invalid.connected=false / noPath"
				//   判定是为了严格校验旧链路模型，现在 connectedModelBindings 基底已经
				//   放宽到 27 条（含 18 条 connected=false 但有真实蓝图入边的新链路模型），
				//   如果直接把 27 条都丢给 validateModelBindings，会把 18 条全部判成
				//   invalid → 直接 return ok=false error → 导出永远失败。
				// ——做法：
				//   ① validateModelBindings 只传"已经有路径的那 9 条旧链路模型"，
				//     保证原有严格验证逻辑还能发现真正的问题（路径错、格式不支持等）；
				//   ② 对 18 条"放宽进基底但还没路径"的新链路模型，单独做 LENIENT 验证：
				//     - 只要 sourceNodeId / inputAnchorId 任一存在（表明有蓝图入边），
				//       就只打 WARNING 不判 INVALID（因为 buildPureDataSlots +
				//       prepareResolvedSlots 兜底会从 outputs / 顶层 / resourceId 找路径）；
				//     - 只有"连 sourceNodeId / inputAnchorId 都没有"的 binding 才真正
				//       判 INVALID 且加入 error detail。
				// ========================================================================
				const strictlyValidable = connectedModelBindings.filter((item) => {
					if (!item || typeof item !== 'object') return false
					const obj = item as Record<string, unknown>
					const c = isConnectedTruthy(obj)
					const p = hasAnyPathExtended(obj)
					return c && p
				})
				const lenientOnes = connectedModelBindings.filter((item) => {
					if (!item || typeof item !== 'object') return false
					const obj = item as Record<string, unknown>
					const c = isConnectedTruthy(obj)
					const p = hasAnyPathExtended(obj)
					return !(c && p)
				})
				const validation = payload.validateModelBindings(strictlyValidable)
				// ---- lenient 侧：把真正空的 binding 挑出来算进真·invalid ----
				const trulyInvalidFromLenient: Array<{ binding: unknown; reason: string }> = []
				const warnFromLenient: string[] = []
				for (const item of lenientOnes) {
					const obj = item as Record<string, unknown>
					const objectId = String(obj.objectId ?? '').trim()
					const objectName = String(obj.objectName ?? objectId).trim()
					const hasSourceNodeId = !!String(obj.sourceNodeId ?? '').trim()
					const hasAnchor = !!String(obj.inputAnchorId ?? '').trim()
					const hasResourceId = !!String(obj.modelResourceId ?? '').trim()
					if (!hasSourceNodeId && !hasAnchor && !hasResourceId) {
						trulyInvalidFromLenient.push({
							binding: item,
							reason:
								t('aiworkflow.runtime.modelBindingNoPath', { name: objectName }) +
								'（且无法从蓝图边/资源ID兜底）'
						})
					} else {
						warnFromLenient.push(
							t('aiworkflow.runtime.modelBindingNotConnected', { name: objectName }) +
							'，将在导出阶段从节点 outputs / resourceId 兜底查找路径。'
						)
					}
				}
				const mergedInvalid = [
					...(validation.invalid ?? []),
					...trulyInvalidFromLenient
				]
				const mergedWarnings = [
					...(validation.warnings ?? []),
					...warnFromLenient
				]
				if (mergedInvalid.length > 0) {
					const detailLines = mergedInvalid
						.map((item, idx) => {
							const b = item.binding as Record<string, unknown>
							const name = String(
								b.objectName ??
									b.objectId ??
									t('aiworkflow.runtime.modelNumber', { num: String(idx + 1) })
							).trim()
							const path = String(
								b.modelSourcePath ??
									b.modelAssetPath ??
									b.modelUrl ??
									b.modelAssetUrl ??
									t('aiworkflow.runtime.unrealNoPath')
							).trim()
							return t('aiworkflow.runtime.unrealInvalidModelLine', {
								name,
								reason: item.reason,
								path
							})
						})
						.join('\n')
					return {
						ok: false as const,
						error: t('aiworkflow.runtime.unrealPrecheckFailed', {
							count: String(mergedInvalid.length),
							details: detailLines
						})
					}
				}
				if (mergedWarnings.length > 0) {
					const warnMsg = t('aiworkflow.runtime.unrealValidationWarning', {
						warnings: mergedWarnings.join('；')
					})
					payload.pushToast(warnMsg, 'warn')
				}
				payload.pushToast(
					t('aiworkflow.toast.unrealPrecheckPass', {
						count: String(connectedModelBindings.length)
					}) +
						`（严格校验 ${strictlyValidable.length} 条，放宽基底 ${lenientOnes.length} 条，导出阶段兜底路径）`,
					'info'
				)
			}

			const totalLayoutItems = Array.isArray(sourceSceneLayoutSettings?.layoutItems)
				? sourceSceneLayoutSettings!.layoutItems.length
				: 0
			if (totalLayoutItems > 0 && connectedModelBindings.length < totalLayoutItems) {
				payload.pushToast(
					t('aiworkflow.toast.unrealPrecheckWarning', {
						total: String(totalLayoutItems),
						bound: String(connectedModelBindings.length)
					}),
					'warn'
				)
			}

			setNodeStatus(nodeId, 'activating-upstream', {
				statusText: t('aiworkflow.runtime.unrealActivatingUpstream'),
				message: t('aiworkflow.runtime.unrealPureDataModeHint')
			})

			// ========================================================================
			// 2026-08-03 纯数据模式：SceneLayoutNode.vue 内部的 getResolvedLayoutForUnreal
			//   已经改成"纯数据构造器永远优先执行"，
			//   layoutItems.value + resolvedModelBindings.value → 直接生成 N 条 slots，
			//   不依赖 Three.js viewer 渲染、不依赖 canvasRef 是否挂载、
			//   不依赖 preview 是否进入 interactive。
			//
			// 因此这里不再执行旧链路：
			//   forceNodeFullRender → selectNode → focusNode → activateSceneLayoutPreview
			//   → 等待 40 次 × 200ms 轮询 phase === 'interactive'
			// 只做：
			//   ① 轻量确保节点被选中（方便用户肉眼看到正在导出哪个上游节点）
			//   ② 等 1~2 个 nextTick 让 Vue 响应式稳定，立刻调用 getResolvedLayoutForUnreal
			//     （其内部纯数据构造器会瞬间返回所有 slots，viewer 仅作为可选 enrich）
			// ========================================================================
			console.info(
				'[UnrealExport] Pure-data mode: skipping Three.js preview activation; ' +
					'SceneLayoutNode.buildPureDataSlotsForUnreal will generate slots directly from ' +
					'layoutItems × resolvedModelBindings (no render required). Source:',
				sourceSceneLayoutNodeId
			)
			console.groupCollapsed('[UNREAL-EXPORT-TRACE] #1 Precheck summary')
			console.log(`connectedModelBindings = ${connectedModelBindings.length}`,
				connectedModelBindings.map((x: unknown) => ({
					objectId: String((x as Record<string, unknown>)?.objectId ?? ''),
					sourceNodeType: String((x as Record<string, unknown>)?.sourceNodeType ?? ''),
					connected: (x as Record<string, unknown>)?.connected,
					path: String(
						(x as Record<string, unknown>)?.modelAssetUrl ??
						(x as Record<string, unknown>)?.modelAssetPath ??
						(x as Record<string, unknown>)?.modelUrl ??
						''
					)
				}))
			)
			console.log(`layoutItems (from store) = ${totalLayoutItems}`)
			console.groupEnd()
			if (payload.selectNode) {
				payload.selectNode(sourceSceneLayoutNodeId)
			}
			// 轻量等待：等 1 个 nextTick + 50ms，保证响应式数据已经到位
			if (payload.waitForNextTick) {
				await payload.waitForNextTick()
			}
			await new Promise((r) => setTimeout(r, 50))

			let resolvedResult: Awaited<ReturnType<typeof payload.getResolvedLayoutForUnreal>> | null =
				null
			let lastResolveError = ''
			// ========================================================================
			// 2026-08-03 纯数据模式：由于 SceneLayoutNode 内部已改为"纯数据构造器永远优先"，
			//   第 1 次调用 getResolvedLayoutForUnreal 就必然返回 slotCount ≥ 绑定模型数。
			//   所以重试次数从 10 降到 3，重试也不再强制预览激活/渲染（纯数据根本不需要），
			//   也不再渐进等待，直接短间隔重试。
			// ========================================================================
			for (let attempt = 0; attempt < 3; attempt++) {
				console.info(`[UnrealExport] Export attempt ${attempt + 1}/3 (pure-data mode)`)
				if (attempt > 0) {
					// 重试时只选节点 + 轻量 nextTick，不碰 Three.js 预览
					if (payload.selectNode) {
						payload.selectNode(sourceSceneLayoutNodeId)
					}
					if (payload.waitForNextTick) {
						await payload.waitForNextTick()
					}
					const waitTime = 150 + attempt * 150
					console.info(`[UnrealExport] Waiting ${waitTime}ms before retry...`)
					await new Promise((r) => setTimeout(r, waitTime))
				}
				const r = await payload.getResolvedLayoutForUnreal(sourceSceneLayoutNodeId)
				if (r.ok) {
					const exportData = r.exportData as Record<string, unknown>
					const slotCount = Array.isArray(exportData?.slots) ? exportData.slots.length : 0
					const bindingCount = Array.isArray(
						(exportData as { sceneLayoutResolvedModelBindings?: unknown[] })?.sceneLayoutResolvedModelBindings
					)
						? ((exportData as { sceneLayoutResolvedModelBindings: unknown[] }).sceneLayoutResolvedModelBindings
								.length)
						: 0
					// 2026-08-03 修复：sourceItemCount 直接读 exportData.sourceItemCount，
					//   不再被错误的 Array.isArray(slots) 条件包住。
					const layoutItemCount = Number(
						(exportData as Record<string, unknown>).sourceItemCount ?? 0
					) || 0
					console.info(
						`[UnrealExport] Export attempt ${attempt + 1} succeeded, slotCount: ${slotCount}, ` +
							`sceneLayoutResolvedBindings: ${bindingCount}, sourceItemCount: ${layoutItemCount}`
					)
					console.groupCollapsed(`[UNREAL-EXPORT-TRACE] #2 Attempt ${attempt + 1} getResolvedLayoutForUnreal result`)
					console.log(`slotCount = ${slotCount}, bindingCount (sceneLayoutResolved) = ${bindingCount}, layoutItemCount = ${layoutItemCount}`)
					if (Array.isArray(exportData.slots) && exportData.slots.length > 0) {
						console.log(
							`slots[].objectId summary:`,
							(exportData.slots as unknown[]).map((s: unknown) => {
								const obj = (s ?? {}) as Record<string, unknown>
								const mb = (obj.modelBinding ?? {}) as Record<string, unknown>
								return {
									slotId: String(obj.slotId ?? ''),
									sourceObjectId: String(obj.sourceObjectId ?? ''),
									displayName: String(obj.displayName ?? ''),
									modelBinding_objectId: String(mb.objectId ?? ''),
									modelBinding_sourceNodeType: String(mb.sourceNodeType ?? ''),
									modelBinding_connected: mb.connected,
									modelBinding_path: String(
										mb.modelAssetUrl ??
										mb.modelAssetProjectRelativePath ??
										mb.modelAssetPath ??
										mb.modelUrl ??
										''
									)
								}
							})
						)
					}
					if (Array.isArray((exportData as { warnings?: unknown[] }).warnings) &&
						(exportData as { warnings: unknown[] }).warnings.length > 0) {
						console.log(`warnings =`, (exportData as { warnings: unknown[] }).warnings)
					}
					console.groupEnd()
					// 合格标准：slotCount ≥ max(绑定模型数的下限, layoutItems数)。
					//   注意 bindingCount 可能包含未 connected/未 path 的 binding，
					//   所以这里也允许 slotCount >= layoutItemCount (只导出已绑定模型)。
					const expectedSlotFloor = Math.max(
						// 只取"真正 connected + 有路径"的 bindings 数量（纯数据构造器只处理这些）
						Math.min(bindingCount, layoutItemCount || 0),
						layoutItemCount || 0
					)
					if (slotCount > 0) {
						resolvedResult = r
						if (slotCount >= layoutItemCount || slotCount >= bindingCount) {
							// 完全覆盖
							break
						}
						if (attempt === 2) {
							// 最后一次尝试：只要 slotCount > 0 就接受（兜底策略）
							break
						}
					}
					lastResolveError =
						`slots below expected (slots=${slotCount}, expected>=${expectedSlotFloor}, ` +
						`bindings=${bindingCount}, sourceItems=${layoutItemCount}); continuing retry`
					console.warn(`[UnrealExport] ${lastResolveError}`)
				} else {
					lastResolveError = r.error || 'unknown'
					console.warn(`[UnrealExport] Export attempt ${attempt + 1} failed:`, lastResolveError)
				}
			}

			if (!resolvedResult) {
				console.error('[UnrealExport] All export attempts failed, last error:', lastResolveError)
				return {
					ok: false as const,
					error:
						t('aiworkflow.runtime.unrealFailedToGenerateLayout') +
						(lastResolveError ? `: ${lastResolveError}` : '')
				}
			}

			const exportData =
				resolvedResult?.exportData && typeof resolvedResult.exportData === 'object'
					? (resolvedResult.exportData as Record<string, unknown>)
					: null
			const resolvedLayoutWarnings: string[] =
				exportData && Array.isArray(exportData.warnings)
					? (exportData.warnings as unknown[])
							.map((item: unknown) => String(item ?? '').trim())
							.filter(Boolean)
					: []
			const resolvedActorOrigin =
				exportData?.actorOrigin && typeof exportData.actorOrigin === 'object'
					? { ...(exportData.actorOrigin as Record<string, unknown>) }
					: null

			const layoutItems = Array.isArray(sourceSceneLayoutSettings?.layoutItems)
				? ((sourceSceneLayoutSettings?.layoutItems as unknown[]) ?? [])
				: []
			const manualModelBindings = Array.isArray(sourceSceneLayoutSettings?.manualModelBindings)
				? ((sourceSceneLayoutSettings?.manualModelBindings as unknown[]) ?? [])
				: []

			// ========================================================================
			// 2026-08-03 新链路对齐：SceneLayout 预览里能渲染的真实模型，
			//   才是 Unreal 导出真正应该使用的模型绑定源。
			//
			// - 最高优先级：exportData.sceneLayoutResolvedModelBindings
			//   （WorkflowSceneLayoutNode.vue 在返回时，直接拼入的 resolvedModelBindings.value）
			//   → 这份 bindings 的 modelUrl/modelAssetUrl/modelAssetPath 已经是
			//     projectRoot + Content/Media/**.glb 拼出来的 file:/// 绝对路径，
			//     与预览里 Three.js GLTFLoader 实际加载的路径完全一致。
			//
			// - 回退优先级：connectedModelBindings（connectedSceneLayoutModelBindings 原始值，
			//   仅在旧项目 viewer 未返回 sceneLayoutResolvedModelBindings 时保留兼容）
			// ========================================================================
			const { finalBindingsSource, usedViewerResolvedBindings } = mergeViewerResolvedIntoFinalBindings(
				exportData,
				Array.isArray(connectedModelBindings) ? connectedModelBindings : []
			)
			console.info(
				`[UnrealExport] Using ${usedViewerResolvedBindings ? 'viewer sceneLayoutResolvedModelBindings' : 'fallback connectedSceneLayoutModelBindings'}, count=${finalBindingsSource.length}`
			)
			// 2026-08-03 新链路诊断日志：每个 binding 的关键路径字段（最多前 10 条），
			// 便于 DevTools Console 肉眼检查"模型数量是否对、贴图路径是否透传"。
			if (Array.isArray(finalBindingsSource) && finalBindingsSource.length > 0) {
				console.groupCollapsed(
					`[UnrealExport] finalBindingsSource[0..${Math.min(finalBindingsSource.length - 1, 9)}]`
				)
				finalBindingsSource.slice(0, 10).forEach((b, i) => {
					const obj = (b ?? {}) as Record<string, unknown>
					console.info(`  [${i + 1}] objectId=${String(obj.objectId ?? 'N/A')}`, {
						connected: obj.connected,
						sourceNodeType: obj.sourceNodeType,
						modelAssetUrl: String(obj.modelAssetUrl ?? ''),
						modelAssetProjectRelativePath: String(obj.modelAssetProjectRelativePath ?? ''),
						textureRefs: Array.isArray(obj.textureRefs) ? obj.textureRefs.length : 0,
						modelMaterialOverrides: Array.isArray(obj.modelMaterialOverrides)
							? obj.modelMaterialOverrides.length
							: 0
					})
				})
				console.groupEnd()
			}
			// 2026-08-03 贴图完整性 trace 用常量（与 unrealExportUtils.prepareResolvedSlotsForExport 对齐）
			const TEXTURE_INTEGRITY_KEYS = [
				'modelAssetProjectRelativePath',
				'modelProjectRelativePath',
				'textureRefs',
				'modelMaterialOverrides',
				'modelFormat'
			] as const

			// =========================================================================
			// 2026-08-03 Step 1 / 先拿 rawSlots，提取 SceneLayout 真实渲染用了的 sourceObjectId
			//   ——这是最权威的"场景布局里可以渲染的模型"白名单，
			//     既避免 9 个历史残留记录被错误纳入，也避免把连接着但没实际放 SceneLayout
			//     上的模型给放行。
			// =========================================================================
			const rawSlots =
				exportData && Array.isArray(exportData.slots) ? (exportData.slots as unknown[]) : []
			const rawSourceObjectIds = new Set<string>()
			for (const s of rawSlots) {
				const id = String((s as Record<string, unknown>)?.sourceObjectId ?? '').trim()
				if (id) rawSourceObjectIds.add(id)
			}
			console.info(`[UnrealExport] Raw slots from viewer: ${rawSlots.length} (distinct sourceObjectId=${rawSourceObjectIds.size})`)

			// Step 2 / finalConnected 过滤：**不要那么多门槛**
			//   只要 binding 的 objectId 在 SceneLayout 实际使用白名单(rawSourceObjectIds)里
			//   OR binding 本身任一路径字段有非空值(hasAnyPathExtended)就放行。
			//   connected 字段仅用于日志，不再作为硬门槛。
			const finalConnectedModelBindings: unknown[] = []
			const finalFilteredLog: Record<string, unknown>[] = []
			if (Array.isArray(finalBindingsSource) && finalBindingsSource.length > 0) {
				for (const item of finalBindingsSource) {
					if (!item || typeof item !== 'object') continue
					const obj = item as Record<string, unknown>
					const objectId = String(obj.objectId ?? '').trim()
					const inRawWhitelist = objectId !== '' && rawSourceObjectIds.has(objectId)
					const hasAnyPath = hasAnyPathExtended(obj)
					const pass = inRawWhitelist || hasAnyPath
					finalFilteredLog.push({
						objectId,
						inRawWhitelist,
						connectedTruthy: isConnectedTruthy(obj),
						connected: obj.connected,
						hasAnyPath,
						modelAssetProjectRelativePath: String(obj.modelAssetProjectRelativePath ?? ''),
						modelAssetUrl: String(obj.modelAssetUrl ?? ''),
						modelAssetPath: String(obj.modelAssetPath ?? ''),
						modelUrl: String(obj.modelUrl ?? ''),
						modelSourcePath: String(obj.modelSourcePath ?? ''),
						modelProjectRelativePath: String(obj.modelProjectRelativePath ?? ''),
						pass
					})
					if (pass) finalConnectedModelBindings.push(item)
				}
			}

			console.groupCollapsed('[UNREAL-EXPORT-TRACE] #3 Bindings merge + finalConnected filter (放宽)')
			console.log(`mergeViewerResolvedIntoFinalBindings: usedViewerResolvedBindings=${usedViewerResolvedBindings}, finalBindingsSource=${finalBindingsSource.length}`)
			console.log(
				`finalBindingsSource summary:`,
				finalFilteredLog
			)
			console.log(`finalConnectedModelBindings (after inRawWhitelist=${rawSourceObjectIds.size} white + hasAnyPath OR filter) = ${finalConnectedModelBindings.length}`)
			console.log(
				`finalConnectedModelBindings summary:`,
				finalConnectedModelBindings.map((x: unknown) => ({
					objectId: String((x as Record<string, unknown>)?.objectId ?? ''),
					sourceNodeType: String((x as Record<string, unknown>)?.sourceNodeType ?? ''),
					modelAssetProjectRelativePath: String((x as Record<string, unknown>)?.modelAssetProjectRelativePath ?? ''),
					modelAssetUrl: String((x as Record<string, unknown>)?.modelAssetUrl ?? '')
				}))
			)
			console.groupEnd()
			// [单行非折叠摘要] —— 保证复制到 log.md 也能直接看：
			console.log(`[UNREAL-EXPORT-TRACE][SUMMARY] #3 | finalBindingsSource=${finalBindingsSource.length} | rawSlots.distinctObjectId=${rawSourceObjectIds.size}[${Array.from(rawSourceObjectIds).join(',')}] | finalConnected=${finalConnectedModelBindings.length}[${finalConnectedModelBindings.map((x) => String((x as Record<string, unknown>)?.objectId ?? '')).filter(Boolean).join(',')}] | rawSlots.count=${rawSlots.length}`)

			console.groupCollapsed('[UNREAL-EXPORT-TRACE] #4 Raw slots (from SceneLayoutNode) + synthesized fill')
			console.log(`rawSlots = ${rawSlots.length}`)
			console.log(
				`rawSlots[].sourceObjectId summary:`,
				rawSlots.map((s: unknown) => {
					const obj = (s ?? {}) as Record<string, unknown>
					const mb = (obj.modelBinding ?? {}) as Record<string, unknown>
					return {
						slotId: String(obj.slotId ?? ''),
						sourceObjectId: String(obj.sourceObjectId ?? ''),
						hasModelBinding: !!obj.modelBinding,
						mb_objectId: String(mb.objectId ?? ''),
						mb_connected: mb.connected,
						mb_path: String(
							mb.modelAssetUrl ??
							mb.modelAssetProjectRelativePath ??
							mb.modelAssetPath ??
							mb.modelUrl ??
							''
						),
						pos: (obj.worldTransform && typeof obj.worldTransform === 'object')
							? (obj.worldTransform as Record<string, unknown>).position
							: (obj.slotTransform && typeof obj.slotTransform === 'object')
								? (obj.slotTransform as Record<string, unknown>).position
								: null
					}
				})
			)
			console.groupEnd()
			// [单行非折叠摘要]
			console.log(
				`[UNREAL-EXPORT-TRACE][SUMMARY] #4 | rawSlots=${rawSlots.length} | sourceObjectIdList=${Array.from(rawSourceObjectIds).join(',')} | slotIds=${rawSlots.map((s) => String((s as Record<string, unknown>)?.slotId ?? '')).filter(Boolean).join('|')}`
			)

			// ========================================================================
			// 2026-08-03：3 层兜底最后一层 —— 即使 viewer 返回 slots=1、
			//   SceneLayoutNode.vue 兜底因为某些边界条件没命中，这里再做一次
			//   "覆盖数不足的 objectId 直接当场用 (layoutItems + finalConnected)
			//    合成缺失的 slot"，保证 resolvedLayoutSlots.length 永远 ≥
			//    finalConnectedModelBindings.length，再也不会出现"右下角显示
			//    获取了 4 个，但实际导入只有 1 个"。
			// ========================================================================
			const requiredBindingsCount = finalConnectedModelBindings.length
			if (requiredBindingsCount > 0) {
				const coveredByRaw = new Set<string>()
				for (const slot of rawSlots) {
					const id = String((slot as Record<string, unknown>)?.sourceObjectId ?? '').trim()
					if (id) coveredByRaw.add(id)
				}
				const itemById = new Map<string, Record<string, unknown>>()
				for (const it of layoutItems) {
					const id = String((it as Record<string, unknown>)?.id ?? '').trim()
					if (id) itemById.set(id, it as Record<string, unknown>)
				}
				const bindingById = new Map<string, Record<string, unknown>>()
				for (const b of finalConnectedModelBindings) {
					const id = String((b as Record<string, unknown>)?.objectId ?? '').trim()
					if (id) bindingById.set(id, b as Record<string, unknown>)
				}
				const synthesizedSlots: unknown[] = []
				for (const bindingObj of finalConnectedModelBindings) {
					const b = bindingObj as Record<string, unknown>
					const objectId = String(b.objectId ?? '').trim()
					if (!objectId) continue
					if (coveredByRaw.has(objectId)) continue
					const item = itemById.get(objectId)
					const fillModeVal: string =
						item && (item.fillMode === 'fill-x' || item.fillMode === 'fill-y' || item.fillMode === 'fill-z')
							? String(item.fillMode)
							: 'single'
					const fillCountRaw = Math.max(1, Number((item as { fillCount?: unknown })?.fillCount ?? 1) || 1)
					const cloneCount = fillModeVal === 'single' ? 1 : fillCountRaw
					const fillAxisScaleRaw = Number((item as { fillAxisScale?: unknown })?.fillAxisScale ?? 1) || 1
					// 2026-08-03 修复：WorkflowSceneLayoutItem 没有 .transform 字段，
					//   position/rotation/scale 是 item 顶层属性。否则 synthesized slot
					//   的变换会全部变成 identity。
					const itemPos = item && item.position && typeof item.position === 'object'
						? (item.position as Record<string, unknown>)
						: null
					const itemRot = item && item.rotation && typeof item.rotation === 'object'
						? (item.rotation as Record<string, unknown>)
						: null
					const itemScl = item && item.scale && typeof item.scale === 'object'
						? (item.scale as Record<string, unknown>)
						: null
					const itemQat = item && item.quaternion && typeof item.quaternion === 'object'
						? (item.quaternion as Record<string, unknown>)
						: null
					const basePosition = {
						x: Number(itemPos?.x ?? 0) || 0,
						y: Number(itemPos?.y ?? 0) || 0,
						z: Number(itemPos?.z ?? 0) || 0
					}
					const baseRotation = {
						yaw:   Number(itemRot?.yaw   ?? 0) || 0,
						pitch: Number(itemRot?.pitch ?? 0) || 0,
						roll:  Number(itemRot?.roll  ?? 0) || 0
					}
					const baseScale = {
						x: Number(itemScl?.x ?? 1) || 1,
						y: Number(itemScl?.y ?? 1) || 1,
						z: Number(itemScl?.z ?? 1) || 1
					}
					const baseQuat = itemQat
						? {
								x: Number(itemQat.x ?? 0) || 0,
								y: Number(itemQat.y ?? 0) || 0,
								z: Number(itemQat.z ?? 0) || 0,
								w: Number(itemQat.w ?? 1) || 1
							}
						: { x: 0, y: 0, z: 0, w: 1 }
					for (let index = 0; index < cloneCount; index += 1) {
						const isClone = cloneCount > 1
						const offsetAxis: 'x' | 'y' | 'z' =
							fillModeVal === 'fill-x' ? 'x' : fillModeVal === 'fill-y' ? 'y' : fillModeVal === 'fill-z' ? 'z' : 'x'
						const offsetValue = isClone ? (index - (cloneCount - 1) / 2) * fillAxisScaleRaw : 0
						const instancePosition = {
							...basePosition,
							[offsetAxis]: (basePosition as Record<string, number>)[offsetAxis] + offsetValue
						}
						const worldT = {
							position: instancePosition,
							rotation: baseRotation,
							quaternion: baseQuat,
							scale: baseScale
						}
						const relativeT = {
							position: {
								x: instancePosition.x,
								y: instancePosition.y,
								z: instancePosition.z
							},
							rotation: baseRotation,
							quaternion: baseQuat,
							scale: baseScale
						}
						const slotId = isClone ? `${objectId}__clone_${index + 1}` : objectId
						const sourceName = String(item?.name ?? objectId).trim() || objectId
						const displayName = isClone ? `${sourceName} [${index + 1}/${cloneCount}]` : sourceName
						synthesizedSlots.push({
							slotId,
							sourceSlotId: objectId,
							sourceObjectId: objectId,
							objectName: sourceName,
							displayName,
							cloneIndex: index,
							cloneCount,
							isClone,
							fitMode: (item?.fitMode ?? 'normal') as 'normal' | 'oriented' | 'filled' | 'forced',
							fillMode: fillModeVal as 'single' | 'fill-x' | 'fill-y' | 'fill-z',
							fillCount: fillModeVal !== 'single' ? fillCountRaw : undefined,
							fillAxisScale: fillModeVal !== 'single' ? fillAxisScaleRaw : undefined,
							materialOverrides: Array.isArray(item?.materialOverrides)
								? (item?.materialOverrides as unknown[]).map((e) => ({ ...(e as Record<string, unknown>) }))
								: undefined,
							relationTags: item && Array.isArray(item.relationTags) ? [...(item.relationTags as unknown[])] : undefined,
							notes: String(item?.fitMessage ?? item?.description ?? '').trim() || undefined,
							modelBinding: { ...b },
							slotTransform: worldT,
							meshTransform: worldT,
							previewInstanceTransform: relativeT,
							previewInstanceWorldTransform: worldT,
							worldTransform: worldT,
							relativeTransform: relativeT,
							worldBounds: null,
							placeholderTransform: null,
							placeholderBounds: null
						})
					}
				}
				if (synthesizedSlots.length > 0) {
					console.warn(
						`[UnrealExport] Raw slots did not cover all bindings (raw=${rawSlots.length}, ` +
							`required-object-ids=${bindingById.size}, synthesized=${synthesizedSlots.length}); ` +
							`filling missing slots directly from layoutItems + finalConnectedModelBindings (no render required)`
					)
					console.groupCollapsed('[UNREAL-EXPORT-TRACE] #4b Synthesized slots (rawSlots did not cover all bindings)')
					console.log(`synthesizedSlots = ${synthesizedSlots.length}`)
					console.log(
						`synthesizedSlots[].sourceObjectId + pos summary:`,
						synthesizedSlots.map((s: unknown) => {
							const obj = (s ?? {}) as Record<string, unknown>
							const mb = (obj.modelBinding ?? {}) as Record<string, unknown>
							const wt = (obj.worldTransform ?? {}) as Record<string, unknown>
							return {
								slotId: String(obj.slotId ?? ''),
								sourceObjectId: String(obj.sourceObjectId ?? ''),
								isClone: obj.isClone,
								cloneIndex: obj.cloneIndex,
								cloneCount: obj.cloneCount,
								pos: wt.position,
								mb_objectId: String(mb.objectId ?? ''),
								mb_path: String(
									mb.modelAssetUrl ??
									mb.modelAssetProjectRelativePath ??
									mb.modelAssetPath ??
									mb.modelUrl ??
									''
								)
							}
						})
					)
					console.groupEnd()
					rawSlots.push(...synthesizedSlots)
				}
			}
			console.info(`[UnrealExport] Raw slots (with synthesized fill): ${rawSlots.length} (required bindings=${requiredBindingsCount})`)

			// 使用prepareResolvedSlotsForExport直接使用viewer返回的slots（保留完整变换数据）
			// 传入 finalConnectedModelBindings：已对齐 SceneLayout 预览渲染真实使用的 resolvedBindings
			const { slots: resolvedLayoutSlots, warnings: slotWarnings } = prepareResolvedSlotsForExport(
				rawSlots,
				finalConnectedModelBindings,
				layoutItems
			)
			if (slotWarnings.length > 0) {
				resolvedLayoutWarnings.push(...slotWarnings)
			}
			console.info(`[UnrealExport] Prepared slots for export: ${resolvedLayoutSlots.length}`)
			console.groupCollapsed('[UNREAL-EXPORT-TRACE] #5 Prepared slots (after prepareResolvedSlotsForExport)')
			console.log(`resolvedLayoutSlots = ${resolvedLayoutSlots.length}`)
			console.log(
				`resolvedLayoutSlots[].objectId + path + pos summary:`,
				resolvedLayoutSlots.map((s: unknown) => {
					const obj = (s ?? {}) as Record<string, unknown>
					const mb = (obj.modelBinding ?? {}) as Record<string, unknown>
					const wt = (obj.worldTransform ?? obj.slotTransform ?? {}) as Record<string, unknown>
					return {
						slotId: String(obj.slotId ?? ''),
						sourceObjectId: String(obj.sourceObjectId ?? ''),
						displayName: String(obj.displayName ?? ''),
						pos: (wt && typeof wt.position === 'object')
							? (wt as Record<string, unknown>).position
							: null,
						mb_objectId: String(mb.objectId ?? ''),
						mb_sourceNodeType: String(mb.sourceNodeType ?? ''),
						mb_modelAssetProjectRelativePath: String(mb.modelAssetProjectRelativePath ?? ''),
						mb_modelAssetUrl: String(mb.modelAssetUrl ?? ''),
						mb_modelAssetPath: String(mb.modelAssetPath ?? ''),
						mb_modelUrl: String(mb.modelUrl ?? ''),
						mb_textureRefsCount: Array.isArray(mb.textureRefs) ? mb.textureRefs.length : 0,
						textureIntegrity: (TEXTURE_INTEGRITY_KEYS as unknown as string[]).every(k => (k in mb) && mb[k]) ? 'COMPLETE' : 'MISSING_KEYS'
					}
				})
			)
			if (resolvedLayoutWarnings.length > 0) {
				console.log(`resolvedLayoutWarnings[] =`, resolvedLayoutWarnings)
			}
			console.groupEnd()

			if (resolvedLayoutSlots.length <= 0) {
				console.error('[UnrealExport] No resolved layout slots after preparation')
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
							sourceNode?.alias ??
								sourceNode?.title ??
								node.alias ??
								node.title ??
								'DwebSceneExport'
						).trim() || 'DwebSceneExport',
					generatedAt: Date.now(),
					sourceNodeId: String(sourceNode?.id ?? nodeId),
					sourceSceneLayoutNodeId,
					sourceNodeType: String(sourceNode?.type ?? 'unreal-export'),
					dwebProjectRootPath:
						String(payload.store.state.projectRootPath ?? '').trim() || undefined,
					resolvedLayoutSlots,
					resolvedSlotCount: resolvedLayoutSlots.length,
					resolvedLayoutWarnings,
					resolvedActorOrigin,
					resolvedSourceItemCount: finalConnectedModelBindings.length,
					layoutItems,
					modelBindings: finalConnectedModelBindings,
					manualModelBindings,
					layoutItemCount: layoutItems.length,
					modelBindingCount: finalConnectedModelBindings.length,
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
				sceneName:
					String(node.alias ?? node.title ?? 'DwebLightingExport').trim() || 'DwebLightingExport',
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
					(s) =>
						String(s.sessionId ?? '') === existingSessionId &&
						String(s.status ?? 'connected') !== 'stale'
				)
				if (found) return existingSessionId
			}
		}

		const sessionsRes = await payload.unrealExportService.listSessions()
		if (sessionsRes.ok && Array.isArray(sessionsRes.sessions) && sessionsRes.sessions.length > 0) {
			const active = sessionsRes.sessions.find((s) => String(s?.status ?? 'connected') !== 'stale')
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
							message: t('aiworkflow.runtime.unrealConnectedProject', {
								project: String(active.projectName || '')
							})
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

			const installResult = await payload.unrealExportService.installPlugin(
				pluginResult.projectRoot || projectPath
			)
			if (!installResult.ok || !installResult.installed) {
				setNodeStatus(nodeId, 'error', {
					statusText: t('aiworkflow.runtime.unrealPluginInstallFailed'),
					message: installResult.error || t('aiworkflow.runtime.unrealPluginInstallFailedMessage'),
					pluginStatus: 'install-error',
					pluginInstallError: installResult.error
				})
				payload.pushToast(
					t('aiworkflow.toast.unrealPluginInstallFailed', {
						error: String(installResult.error || 'unknown')
					}),
					'error'
				)
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
		const assetRootPath =
			String(settings.assetRootPath ?? '/Game/DVStudio').trim() || '/Game/DVStudio'

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

			// 2026-08-03 最后一英里 trace：发送到 UE 之前完整打印 resolvedLayoutSlots
			//   和 payload 摘要。如果这里已经是 4 个但 UE 只导入 1 个，那就是 UE 插件侧问题；
			//   如果这里就只有 1 个，那就是前端链路问题。
			console.groupCollapsed('[UNREAL-EXPORT-TRACE] #6 FINAL createJob payload (before sending to UE)')
			console.log(`exportMode = ${exportMode}`)
			console.log(`resolvedSlotCount = ${built.payload.resolvedSlotCount}`)
			console.log(`resolvedSourceItemCount = ${built.payload.resolvedSourceItemCount}`)
			console.log(`layoutItemCount = ${built.payload.layoutItemCount}`)
			console.log(`modelBindingCount = ${built.payload.modelBindingCount}`)
			console.log(
				`resolvedLayoutSlots[${built.payload.resolvedSlotCount}] FULL DUMP:`,
				(built.payload.resolvedLayoutSlots as unknown[]).map((s: unknown) => {
					const obj = (s ?? {}) as Record<string, unknown>
					const mb = (obj.modelBinding ?? {}) as Record<string, unknown>
					const wt = (obj.worldTransform ?? obj.slotTransform ?? {}) as Record<string, unknown>
					return {
						slotId: obj.slotId,
						sourceObjectId: obj.sourceObjectId,
						displayName: obj.displayName,
						isClone: obj.isClone,
						cloneIndex: obj.cloneIndex,
						cloneCount: obj.cloneCount,
						position: (wt && typeof wt.position === 'object')
							? (wt as Record<string, unknown>).position
							: null,
						modelBinding: mb ? {
							objectId: mb.objectId,
							sourceNodeType: mb.sourceNodeType,
							connected: mb.connected,
							modelAssetProjectRelativePath: mb.modelAssetProjectRelativePath,
							modelAssetUrl: mb.modelAssetUrl,
							modelAssetPath: mb.modelAssetPath,
							modelUrl: mb.modelUrl,
							modelSourcePath: mb.modelSourcePath,
							textureRefs: mb.textureRefs,
							modelMaterialOverrides: mb.modelMaterialOverrides,
							packagedTextureBasePath: mb.packagedTextureBasePath
						} : null
					}
				})
			)
			console.log(`exportPayload (raw, for deep inspection) =`, built.payload)
			console.groupEnd()

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
				payload.pushToast(
					t('aiworkflow.toast.unrealJobCreateFailed', { error: String(res.error || 'unknown') }),
					'warn'
				)
				return
			}

			const job = res.job as Record<string, unknown>
			const jobId = String(job.jobId ?? '')
			const createdToastKey =
				exportMode === 'lighting-only'
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
