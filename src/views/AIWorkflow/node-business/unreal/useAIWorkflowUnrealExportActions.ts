import {
	prepareResolvedSlotsForExport,
	getUnrealConnectionPollInterval,
	mergeViewerResolvedIntoFinalBindings,
	isConnectedTruthy,
	hasAnyPathExtended,
	tryBackfillBindingPathsFromStore,
	isRemoteCdnUrl,
	buildDirectScanAbsPathByObjectId
} from './unrealExportUtils'
import { extractModelSourceFromUpstreamNode } from './unrealExportModelSourceExtractor'
import { t } from '../../../../i18n'

export const useAIWorkflowUnrealExportActions = (payload: {
	store: {
		state: {
			nodesById: Record<string, unknown>
			edgesById?: Record<string, unknown>
			resourcesById?: Record<string, unknown>
			projectRootPath?: string
		}
		commit: (type: string, value: unknown) => void
	}
	getCurrentProjectRootPath?: () => string | null
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
	startSceneLayoutPreview?: (nodeId: string) => void
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
				const mergedInvalid = [...(validation.invalid ?? []), ...trulyInvalidFromLenient]
				const mergedWarnings = [...(validation.warnings ?? []), ...warnFromLenient]
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
			// 2026-08-03 恢复 viewer 激活链路：
			//   viewer 的 fitMode 缩放（fitBoundModelToPlaceholderWorld）依赖 Three.js
			//   加载模型后的 bounding box。如果不激活 viewer，getResolvedLayoutForUnreal
			//   内部的 viewer enrich 会被跳过（canvasRef=null），导出的 transform
			//   只有 layoutItem 原始 scale（默认 1,1,1，无 fit 计算）。
			//
			//   激活步骤：
			//   ① forceNodeFullRender(nodeId, true) — 确保节点在 DOM 中完整渲染
			//   ② selectNode — 选中节点
			//   ③ activateSceneLayoutPreview — 设置 previewMode=true，canvas 显示
			//   ④ startSceneLayoutPreview — 触发 lifecycle manager 的 startPreviewSession
			//   ⑤ 轮询 getThreePreviewState 等待 phase='interactive'
			// ========================================================================
			console.info('[UnrealExport] Activating scene layout viewer for fit scale calculation...')
			if (payload.forceNodeFullRender) {
				payload.forceNodeFullRender(sourceSceneLayoutNodeId, true)
			}
			if (payload.selectNode) {
				payload.selectNode(sourceSceneLayoutNodeId)
			}
			if (payload.waitForNextTick) {
				await payload.waitForNextTick()
			}
			if (payload.activateSceneLayoutPreview) {
				payload.activateSceneLayoutPreview(sourceSceneLayoutNodeId)
			}
			if (payload.startSceneLayoutPreview) {
				payload.startSceneLayoutPreview(sourceSceneLayoutNodeId)
			}
			// 轮询等待 viewer 进入 interactive（最多 40 次 × 200ms = 8 秒）
			let viewerInteractive = false
			if (payload.getThreePreviewState) {
				for (let i = 0; i < 40; i++) {
					await new Promise((r) => setTimeout(r, 200))
					const state = payload.getThreePreviewState(sourceSceneLayoutNodeId, 'scene-layout')
					if (state && state.phase === 'interactive') {
						viewerInteractive = true
						break
					}
				}
			}
			console.info(`[UnrealExport] Viewer activation result: interactive=${viewerInteractive}`)
			console.warn('[UNREAL-EXPORT-TRACE] #1 Precheck summary')
			console.warn(
				`connectedModelBindings = ${connectedModelBindings.length}`,
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
			console.warn(`layoutItems (from store) = ${totalLayoutItems}`)
			console.warn(`viewerInteractive = ${viewerInteractive}`)

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
						(exportData as { sceneLayoutResolvedModelBindings?: unknown[] })
							?.sceneLayoutResolvedModelBindings
					)
						? (exportData as { sceneLayoutResolvedModelBindings: unknown[] })
								.sceneLayoutResolvedModelBindings.length
						: 0
					// 2026-08-03 修复：sourceItemCount 直接读 exportData.sourceItemCount，
					//   不再被错误的 Array.isArray(slots) 条件包住。
					const layoutItemCount =
						Number((exportData as Record<string, unknown>).sourceItemCount ?? 0) || 0
					console.info(
						`[UnrealExport] Export attempt ${attempt + 1} succeeded, slotCount: ${slotCount}, ` +
							`sceneLayoutResolvedBindings: ${bindingCount}, sourceItemCount: ${layoutItemCount}`
					)
					console.warn(
						`[UNREAL-EXPORT-TRACE] #2 Attempt ${attempt + 1} getResolvedLayoutForUnreal result`
					)
					console.warn(
						`slotCount = ${slotCount}, bindingCount (sceneLayoutResolved) = ${bindingCount}, layoutItemCount = ${layoutItemCount}`
					)
					if (Array.isArray(exportData.slots) && exportData.slots.length > 0) {
						console.warn(
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
					if (
						Array.isArray((exportData as { warnings?: unknown[] }).warnings) &&
						(exportData as { warnings: unknown[] }).warnings.length > 0
					) {
						console.warn(`warnings =`, (exportData as { warnings: unknown[] }).warnings)
					}
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
			let { finalBindingsSource } = mergeViewerResolvedIntoFinalBindings(
				exportData,
				Array.isArray(connectedModelBindings) ? connectedModelBindings : []
			)
			// usedViewerResolvedBindings 在下方 FORCE-REBUILD 块中固定为 false
			// （FORCE-REBUILD 完全覆盖 viewer resolved，不再使用 viewer 返回的绑定）
			let usedViewerResolvedBindings = false
			// ========================================================================
			// 2026-08-03 FORCE-REBUILD 重构（AIPlan/02 方案 §5.2-5.3）：
			//   原 FORCE-REBUILD 用【通用提取】完全覆盖 finalBindingsSource，导致：
			//     - 类别 A：不读 meshySettings/tripo3dSettings/model3dSettings 深字段 →
			//               真实静态资产路径丢失
			//     - 类别 B：pushBinding 按 objectId 去重 → 手动上传模型路径被丢弃
			//   ——重构为【仅补漏 + 类型专用提取 + 路径合并】：
			//     1. 以 Step3 的 finalBindingsSource（基底=connectedSceneLayoutModelBindings，
			//        含类型专用提取的正确路径）为权威基底
			//     2. manualModelBindings 优先合并（类别 B 保障）：用路径合并补充进基底
			//     3. 扫描 edgesById 找 in-model-* 入边（类别 A 补漏）：
			//        a. objectId 已在基底 → 跳过（不覆盖、不去重丢弃）
			//        b. objectId 不在基底 → 用 extractModelSourceFromUpstreamNode
			//           （类型专用提取，与预览同款）新建 binding
			//     4. finalBindingsSource = 基底（含手动合并）+ 补漏数组（不再覆盖）
			// ========================================================================
			{
				const nodesById = payload.store.state.nodesById || {}
				const resourcesById =
					payload.store.state.resourcesById && typeof payload.store.state.resourcesById === 'object'
						? (payload.store.state.resourcesById as Record<string, unknown>)
						: {}
				const edgesById =
					payload.store.state.edgesById && typeof payload.store.state.edgesById === 'object'
						? (payload.store.state.edgesById as Record<string, unknown>)
						: {}

				// 路径合并：只在 existing 的字段为空时，从 incoming 抄过来（不覆盖已有值）。
				//   与 mergeViewerResolvedIntoFinalBindings 的 TEXTURE_COPY_KEYS 逻辑一致。
				const PATH_MERGE_KEYS = [
					'modelUrl',
					'modelAssetUrl',
					'modelSourcePath',
					'modelAssetPath',
					'modelProjectRelativePath',
					'modelAssetProjectRelativePath',
					'modelSourceName',
					'modelFormat',
					'modelResourceId',
					'sourceNodeId',
					'sourceNodeType',
					'inputAnchorId',
					'anchorSuffix',
					'textureRefs',
					'modelMaterialOverrides',
					'objectName'
				] as const
				const mergePathFields = (
					existing: Record<string, unknown>,
					incoming: Record<string, unknown>
				) => {
					for (const k of PATH_MERGE_KEYS) {
						const exVal = existing[k]
						const exEmpty =
							exVal === null ||
							exVal === undefined ||
							(Array.isArray(exVal) && exVal.length === 0) ||
							(typeof exVal === 'string' && !String(exVal).trim())
						if (!exEmpty) continue // existing 有值就坚决不覆盖
						const inVal = incoming[k]
						if (inVal === null || inVal === undefined) continue
						if (Array.isArray(inVal)) {
							if (inVal.length > 0) existing[k] = [...inVal]
						} else if (typeof inVal === 'object') {
							existing[k] = { ...(inVal as Record<string, unknown>) }
						} else {
							const s = String(inVal ?? '').trim()
							if (s) existing[k] = s
						}
					}
					// connected 只能升级为 true，不能降级
					if (!isConnectedTruthy(existing) && isConnectedTruthy(incoming)) {
						existing.connected = true
					}
				}

				// 建立基底索引：finalBindingsSource（来自 Step3 mergeViewerResolvedIntoFinalBindings，
				//   基底=connectedSceneLayoutModelBindings，含类型专用提取的正确路径）
				const baseByObjectId = new Map<string, Record<string, unknown>>()
				const baseBindings: Array<Record<string, unknown>> = []
				for (const raw of Array.isArray(finalBindingsSource) ? finalBindingsSource : []) {
					if (!raw || typeof raw !== 'object') continue
					const b = { ...(raw as Record<string, unknown>) }
					const objectId = String(b.objectId ?? '').trim()
					const anchorId = String((b as { inputAnchorId?: unknown }).inputAnchorId ?? '').trim()
					const key = objectId || anchorId
					if (key && baseByObjectId.has(key)) {
						// 基底内部去重也用路径合并（保留两条中各自的非空字段）
						mergePathFields(baseByObjectId.get(key)!, b)
					} else {
						if (key) baseByObjectId.set(key, b)
						baseBindings.push(b)
					}
				}

				// 补漏数组与索引
				const patchedBindings: Array<Record<string, unknown>> = []
				const patchedByObjectId = new Map<string, Record<string, unknown>>()

				const pushPatch = (obj: Record<string, unknown>) => {
					const objectId = String(obj.objectId ?? '').trim()
					const anchorId = String((obj as { inputAnchorId?: unknown }).inputAnchorId ?? '').trim()
					const key = objectId || anchorId
					if (!key) {
						patchedBindings.push(obj)
						return
					}
					// 若已在基底 → 路径合并（不丢弃，解决类别 B 手动上传模型被去重丢弃）
					if (baseByObjectId.has(key)) {
						mergePathFields(baseByObjectId.get(key)!, obj)
						return
					}
					// 若已在补漏数组 → 路径合并
					if (patchedByObjectId.has(key)) {
						mergePathFields(patchedByObjectId.get(key)!, obj)
						return
					}
					patchedByObjectId.set(key, obj)
					patchedBindings.push(obj)
				}

				let manualMergedCount = 0
				let edgePatchedCount = 0
				let pathMergedCount = 0

				// 1) manualModelBindings 优先合并（类别 B 保障）
				//    占位体既有连线又有手动上传时，手动上传路径必须合并进 binding（不被 edge 无路径 binding 覆盖）
				if (Array.isArray(manualModelBindings) && manualModelBindings.length > 0) {
					for (const mb of manualModelBindings) {
						if (!mb || typeof mb !== 'object') continue
						const m = tryBackfillBindingPathsFromStore(
							{ ...(mb as Record<string, unknown>), connected: true },
							nodesById,
							resourcesById
						)
						const objectId = String(m.objectId ?? '').trim()
						const wasInBase = objectId && baseByObjectId.has(objectId)
						pushPatch(m)
						if (wasInBase) {
							manualMergedCount++
							pathMergedCount++
						}
					}
				}

				// 2) 扫描 edgesById 找 in-model-* 入边（类别 A 补漏 + 类型专用提取）
				//    只为基底漏掉的 objectId 补充，且使用 extractModelSourceFromUpstreamNode
				//    （与预览 connectedSceneLayoutModelBindings 同款类型专用提取）
				const targetNode = String(sourceSceneLayoutNodeId ?? '').trim()
				for (const edge of Object.values(edgesById)) {
					if (!edge || typeof edge !== 'object') continue
					const e = edge as Record<string, unknown>
					const toNode = String(e.targetNodeId ?? e.toNodeId ?? '').trim()
					if (!toNode || toNode !== targetNode) continue
					const anchorId = String(e.toAnchorId ?? e.targetAnchorId ?? e.inputAnchorId ?? '').trim()
					// 只关心 3D 模型输入相关锚（in-model-xxx / in-model / in-0）
					const isModelAnchor =
						anchorId === 'in-model' ||
						anchorId === 'in-0' ||
						/^in-model[_-]/.test(anchorId) ||
						/^in-(?:model|resource)[_-]/.test(anchorId)
					if (!isModelAnchor) continue
					const fromNodeId = String(e.sourceNodeId ?? e.fromNodeId ?? '').trim()
					if (!fromNodeId) continue
					const fromNode = (nodesById as Record<string, unknown>)[fromNodeId] as
						| Record<string, unknown>
						| undefined
					// anchorSuffix：例如 in-model-stool_left → stool_left
					let anchorSuffix = ''
					const m = /^in-(?:model|resource)[_-](.+)$/.exec(anchorId)
					if (m && m[1]) anchorSuffix = m[1]
					// objectId 优先使用 anchorSuffix，否则 fromNodeId
					const objectId = anchorSuffix || fromNodeId

					// 若 objectId 已在基底或补漏数组 → 跳过（不覆盖、不去重丢弃）
					if (baseByObjectId.has(objectId) || patchedByObjectId.has(objectId)) continue

					// 用类型专用提取器新建 binding（与预览 connectedSceneLayoutModelBindings 同款）
					const source = extractModelSourceFromUpstreamNode(
						fromNode,
						resourcesById as Record<string, Record<string, unknown>> | undefined
					)
					const b: Record<string, unknown> = {
						objectId,
						objectName: objectId,
						inputAnchorId: anchorId,
						anchorSuffix,
						connected: !!source,
						sourceNodeId: fromNodeId,
						sourceNodeType: String(fromNode?.type ?? 'model3d') || 'model3d'
					}
					if (source) {
						b.modelUrl = source.modelUrl
						b.modelAssetUrl = source.modelAssetUrl
						b.modelSourcePath = source.modelSourcePath
						b.modelAssetPath = source.modelAssetPath
						b.modelProjectRelativePath = source.modelProjectRelativePath
						b.modelAssetProjectRelativePath = source.modelAssetProjectRelativePath
						b.modelSourceName = source.modelSourceName
						b.modelFormat = source.modelFormat
						b.modelResourceId = source.modelResourceId
					}
					// 最后再跑一次 Ultimate Backfill（万一提取器没挑到但 resourcesById 里真的有）
					const finalB = tryBackfillBindingPathsFromStore(b, nodesById, resourcesById)
					pushPatch(finalB)
					edgePatchedCount++
				}

				// 3) 合并基底 + 补漏数组（不再覆盖 finalBindingsSource）
				// usedViewerResolvedBindings 保持初始 false（FORCE-REBUILD 完全覆盖 viewer resolved）
				finalBindingsSource = [...baseBindings, ...patchedBindings]
				console.info(
					`[UNREAL-EXPORT-TRACE] #4a FORCE-REBUILD 补漏模式 | base=${baseBindings.length} | manualMerged=${manualMergedCount} | edgePatched=${edgePatchedCount} | pathMerged=${pathMergedCount} | final=${finalBindingsSource.length}`
				)
			}
			console.info(
				`[UnrealExport] Final bindings after FORCE-REBUILD (from edgesById + manualBindings + legacy): count=${finalBindingsSource.length}, viewerUsed=${usedViewerResolvedBindings}`
			)
			// 2026-08-03 新链路诊断日志：每个 binding 的关键路径字段（最多前 10 条），
			// 便于 DevTools Console 肉眼检查"模型数量是否对、贴图路径是否透传"。
			if (Array.isArray(finalBindingsSource) && finalBindingsSource.length > 0) {
				console.warn(
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
			console.info(
				`[UnrealExport] Raw slots from viewer: ${rawSlots.length} (distinct sourceObjectId=${rawSourceObjectIds.size})`
			)

			// Step 2 / finalConnected 过滤：【完全不要任何门槛】
			//   用户现场痛点：inRawWhitelist 来自 viewer 返回的 slots，viewer 经常只有 1 个，
			//   导致 27 条真实 in-model-* 绑定被过滤到只剩 1 个。
			//   现在规则改为 —— 【只要 binding 有 objectId 就进 finalConnected】，
			//   路径字段空不空没关系，Ultimate Backfill 后面再兜底；
			//   真正的出口过滤交给 prepareResolvedSlotsForExport 的 per-slot hasAnyPathExtended
			//   （那是最后一英里，漏掉的永远是"真没任何路径"的，不会误杀）。
			const finalConnectedModelBindings: unknown[] = []
			const finalFilteredLog: Record<string, unknown>[] = []
			if (Array.isArray(finalBindingsSource) && finalBindingsSource.length > 0) {
				for (const item of finalBindingsSource) {
					if (!item || typeof item !== 'object') continue
					const obj = item as Record<string, unknown>
					const objectId = String(obj.objectId ?? '').trim()
					if (!objectId) continue // 唯一门槛：必须有 objectId，否则连占位体都对不上
					const inRawWhitelist = rawSourceObjectIds.has(objectId)
					const hasAnyPath = hasAnyPathExtended(obj)
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
						pass: true
					})
					finalConnectedModelBindings.push(item)
				}
			}

			console.warn('[UNREAL-EXPORT-TRACE] #3 Bindings merge + finalConnected filter (放宽)')
			console.warn(
				`mergeViewerResolvedIntoFinalBindings: usedViewerResolvedBindings=${usedViewerResolvedBindings}, finalBindingsSource=${finalBindingsSource.length}`
			)
			console.warn(`finalBindingsSource summary:`, finalFilteredLog)
			console.warn(
				`finalConnectedModelBindings (after inRawWhitelist=${rawSourceObjectIds.size} white + hasAnyPath OR filter) = ${finalConnectedModelBindings.length}`
			)
			console.warn(
				`finalConnectedModelBindings summary:`,
				finalConnectedModelBindings.map((x: unknown) => ({
					objectId: String((x as Record<string, unknown>)?.objectId ?? ''),
					sourceNodeType: String((x as Record<string, unknown>)?.sourceNodeType ?? ''),
					modelAssetProjectRelativePath: String(
						(x as Record<string, unknown>)?.modelAssetProjectRelativePath ?? ''
					),
					modelAssetUrl: String((x as Record<string, unknown>)?.modelAssetUrl ?? '')
				}))
			)
			// [单行非折叠摘要] —— 保证复制到 log.md 也能直接看：
			console.warn(
				`[UNREAL-EXPORT-TRACE][SUMMARY] #3 | finalBindingsSource=${finalBindingsSource.length} | rawSlots.distinctObjectId=${rawSourceObjectIds.size}[${Array.from(rawSourceObjectIds).join(',')}] | finalConnected=${finalConnectedModelBindings.length}[${finalConnectedModelBindings
					.map((x) => String((x as Record<string, unknown>)?.objectId ?? ''))
					.filter(Boolean)
					.join(',')}] | rawSlots.count=${rawSlots.length}`
			)

			console.warn('[UNREAL-EXPORT-TRACE] #4 Raw slots (from SceneLayoutNode) + synthesized fill')
			console.warn(`rawSlots = ${rawSlots.length}`)
			console.warn(
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
						pos:
							obj.worldTransform && typeof obj.worldTransform === 'object'
								? (obj.worldTransform as Record<string, unknown>).position
								: obj.slotTransform && typeof obj.slotTransform === 'object'
									? (obj.slotTransform as Record<string, unknown>).position
									: null
					}
				})
			)
			// [单行非折叠摘要]
			console.warn(
				`[UNREAL-EXPORT-TRACE][SUMMARY] #4 | rawSlots=${rawSlots.length} | sourceObjectIdList=${Array.from(rawSourceObjectIds).join(',')} | slotIds=${rawSlots
					.map((s) => String((s as Record<string, unknown>)?.slotId ?? ''))
					.filter(Boolean)
					.join('|')}`
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
				const synthesizedFailures: Array<{ objectId: string; error: string }> = []
				for (const bindingObj of finalConnectedModelBindings) {
					const b = bindingObj as Record<string, unknown>
					const objectId = String(b.objectId ?? '').trim()
					if (!objectId) continue
					try {
						if (coveredByRaw.has(objectId)) continue
						// 兼容 objectId 带 __clone_N 后缀的情况（CHAIN DIAG 里常见 bar_main__clone_2），
						//   exact 找不到 layoutItem 时，去掉 clone 后缀再找一次源占位体的 transform。
						let item: Record<string, unknown> | undefined = itemById.get(objectId)
						if (!item) {
							const stripped = objectId.replace(/__clone_[0-9]+$/i, '')
							if (stripped && stripped !== objectId) {
								item = itemById.get(stripped)
							}
						}
						const fillModeVal: string =
							item &&
							(item.fillMode === 'fill-x' ||
								item.fillMode === 'fill-y' ||
								item.fillMode === 'fill-z')
								? String(item.fillMode)
								: 'single'
						const fillCountRaw = Math.max(
							1,
							Number((item as { fillCount?: unknown })?.fillCount ?? 1) || 1
						)
						const cloneCount = fillModeVal === 'single' ? 1 : fillCountRaw
						const fillAxisScaleRaw =
							Number((item as { fillAxisScale?: unknown })?.fillAxisScale ?? 1) || 1
						const itemPos =
							item && item.position && typeof item.position === 'object'
								? (item.position as Record<string, unknown>)
								: null
						const itemRot =
							item && item.rotation && typeof item.rotation === 'object'
								? (item.rotation as Record<string, unknown>)
								: null
						const itemScl =
							item && item.scale && typeof item.scale === 'object'
								? (item.scale as Record<string, unknown>)
								: null
						const itemQat =
							item && item.quaternion && typeof item.quaternion === 'object'
								? (item.quaternion as Record<string, unknown>)
								: null
						const basePosition = {
							x: Number(itemPos?.x ?? 0) || 0,
							y: Number(itemPos?.y ?? 0) || 0,
							z: Number(itemPos?.z ?? 0) || 0
						}
						const baseRotation = {
							yaw: Number(itemRot?.yaw ?? 0) || 0,
							pitch: Number(itemRot?.pitch ?? 0) || 0,
							roll: Number(itemRot?.roll ?? 0) || 0
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
								fillModeVal === 'fill-x'
									? 'x'
									: fillModeVal === 'fill-y'
										? 'y'
										: fillModeVal === 'fill-z'
											? 'z'
											: 'x'
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
							const displayName = isClone
								? `${sourceName} [${index + 1}/${cloneCount}]`
								: sourceName
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
									? (item?.materialOverrides as unknown[]).map((e) => ({
											...(e as Record<string, unknown>)
										}))
									: undefined,
								relationTags:
									item && Array.isArray(item.relationTags)
										? [...(item.relationTags as unknown[])]
										: undefined,
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
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err ?? 'unknown')
						console.warn(
							`[UnrealExport] synthesizeSlots 单条失败（跳过本条，继续其它）: objectId=${objectId}`,
							err
						)
						synthesizedFailures.push({ objectId, error: msg })
						continue
					}
				}
				if (synthesizedFailures.length > 0) {
					resolvedLayoutWarnings.push(
						`synthesizedSlots per-binding failures: ${synthesizedFailures.length}. ` +
							synthesizedFailures.map((f) => `${f.objectId}=${f.error}`).join('; ')
					)
				}
				if (synthesizedSlots.length > 0) {
					console.warn(
						`[UnrealExport] Raw slots did not cover all bindings (raw=${rawSlots.length}, ` +
							`required-object-ids=${bindingById.size}, synthesized=${synthesizedSlots.length}); ` +
							`filling missing slots directly from layoutItems + finalConnectedModelBindings (no render required)`
					)
					console.warn(
						'[UNREAL-EXPORT-TRACE] #4b Synthesized slots (rawSlots did not cover all bindings)'
					)
					console.warn(`synthesizedSlots = ${synthesizedSlots.length}`)
					console.warn(
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
					rawSlots.push(...synthesizedSlots)
				}
			}
			console.info(
				`[UnrealExport] Raw slots (with synthesized fill): ${rawSlots.length} (required bindings=${requiredBindingsCount})`
			)

			// 使用prepareResolvedSlotsForExport直接使用viewer返回的slots（保留完整变换数据）
			// 传入 finalConnectedModelBindings：已对齐 SceneLayout 预览渲染真实使用的 resolvedBindings
			const {
				slots: resolvedLayoutSlots,
				warnings: slotWarnings,
				placeholderCount
			} = prepareResolvedSlotsForExport(rawSlots, finalConnectedModelBindings, layoutItems)
			if (slotWarnings.length > 0) {
				resolvedLayoutWarnings.push(...slotWarnings)
			}
			console.info(`[UnrealExport] Prepared slots for export: ${resolvedLayoutSlots.length}`)
			console.warn('[UNREAL-EXPORT-TRACE] #5 Prepared slots (after prepareResolvedSlotsForExport)')
			console.warn(`resolvedLayoutSlots = ${resolvedLayoutSlots.length}`)
			console.warn(
				`resolvedLayoutSlots[].objectId + path + pos summary:`,
				resolvedLayoutSlots.map((s: unknown) => {
					const obj = (s ?? {}) as Record<string, unknown>
					const mb = (obj.modelBinding ?? {}) as Record<string, unknown>
					const wt = (obj.worldTransform ?? obj.slotTransform ?? {}) as Record<string, unknown>
					return {
						slotId: String(obj.slotId ?? ''),
						sourceObjectId: String(obj.sourceObjectId ?? ''),
						displayName: String(obj.displayName ?? ''),
						pos:
							wt && typeof wt.position === 'object'
								? (wt as Record<string, unknown>).position
								: null,
						mb_objectId: String(mb.objectId ?? ''),
						mb_sourceNodeType: String(mb.sourceNodeType ?? ''),
						mb_modelAssetProjectRelativePath: String(mb.modelAssetProjectRelativePath ?? ''),
						mb_modelAssetUrl: String(mb.modelAssetUrl ?? ''),
						mb_modelAssetPath: String(mb.modelAssetPath ?? ''),
						mb_modelUrl: String(mb.modelUrl ?? ''),
						mb_textureRefsCount: Array.isArray(mb.textureRefs) ? mb.textureRefs.length : 0,
						textureIntegrity: (TEXTURE_INTEGRITY_KEYS as unknown as string[]).every(
							(k) => k in mb && mb[k]
						)
							? 'COMPLETE'
							: 'MISSING_KEYS'
					}
				})
			)
			if (resolvedLayoutWarnings.length > 0) {
				console.warn(`resolvedLayoutWarnings[] =`, resolvedLayoutWarnings)
			}

			if (resolvedLayoutSlots.length <= 0) {
				console.error('[UnrealExport] No resolved layout slots after preparation')
				return {
					ok: false as const,
					error: t('aiworkflow.runtime.unrealFailedToGenerateLayout')
				}
			}

			// 2026-08-04 CRITICAL FIX：payload 顶层 modelBindings（UE 端用来导入 StaticMesh 资产的主数据源）
			//   之前完全没有做路径对齐回填，导致 4 个 UE 识别路径字段（modelSourcePath/modelAssetPath/modelAssetUrl/modelUrl）
			//   仍然是 meshy 远端 CDN URL / dweb:// / 空字符串，
			//   UE 端 ResolveBindingLocalModelSourcePath 无法匹配到 Content/Media/ 下本地模型文件，
			//   最终表现为「成功导入 0 个资产」—— 这是本次用户截图的根因。
			//
			//   修复（三层）：
			//   ① 拿 prepareResolvedSlotsForExport 已经对齐过的 slot.modelBinding 作为权威数据源，
			//     用 objectId 做 key，把对齐后的 4 个路径字段同步回 finalConnectedModelBindings。
			//   ② 终极兜底：如果路径仍然为空，用 modelResourceId 查 resourcesById，
			//     获取 projectRelativePath（Content/Media/xxx.glb）。
			//   ③ 绝对路径转换：把相对路径用 projectRootPath 拼接成绝对路径，
			//     直接写入 4 个标准字段 —— 这样 UE 端 TrySetValidSourcePath → FPaths::FileExists
			//     直接命中，完全不依赖 dwebProjectRootPath / TryResolvePathWithProjectRoot。
			const slotAlignedBindingByObjectId = new Map<string, Record<string, unknown>>()
			for (const s of resolvedLayoutSlots) {
				const mb = (s.modelBinding ?? null) as Record<string, unknown> | null
				if (!mb || typeof mb !== 'object') continue
				const oid = String(mb.objectId ?? '').trim()
				if (!oid) continue
				if (!slotAlignedBindingByObjectId.has(oid)) {
					slotAlignedBindingByObjectId.set(oid, mb)
				}
			}
			const UE_4_PATH_FIELDS = [
				'modelSourcePath',
				'modelAssetPath',
				'modelAssetUrl',
				'modelUrl'
			] as const
			const projectRootPath =
				String(payload.store.state.projectRootPath ?? '').trim() ||
				String(payload.getCurrentProjectRootPath?.() ?? '').trim()
			const payloadResourcesById = (payload.store.state.resourcesById ?? {}) as Record<
				string,
				Record<string, unknown>
			>
			const isRemoteOrDwebUrl = (u: string): boolean => {
				if (!u) return false
				const low = u.toLowerCase()
				if (low.startsWith('http://') || low.startsWith('https://')) return true
				if (low.startsWith('dweb://')) return true
				return false
			}
			const isAbsolutePath = (p: string): boolean => {
				if (!p) return false
				if (/^[a-zA-Z]:[\\/]/.test(p)) return true
				if (p.startsWith('\\\\') || p.startsWith('/')) return true
				return false
			}
			let syncAlignedCount = 0
			let resourceIdBackfillCount = 0
			let absPathConvertCount = 0
			for (const rawBinding of finalConnectedModelBindings) {
				if (!rawBinding || typeof rawBinding !== 'object') continue
				const rb = rawBinding as Record<string, unknown>
				const oid = String(rb.objectId ?? '').trim()
				if (!oid) continue
				const aligned = slotAlignedBindingByObjectId.get(oid)
				let touched = false
				// ① 从 aligned slot.modelBinding 同步路径
				if (aligned) {
					for (const f of UE_4_PATH_FIELDS) {
						const alignedVal = String(aligned[f] ?? '').trim()
						if (alignedVal) {
							const before = String(rb[f] ?? '').trim()
							if (before !== alignedVal) {
								rb[f] = alignedVal
								touched = true
							}
						}
					}
					const relAligned = String(aligned.modelAssetProjectRelativePath ?? '').trim()
					if (relAligned) {
						const beforeRel = String(rb.modelAssetProjectRelativePath ?? '').trim()
						if (beforeRel !== relAligned) {
							rb.modelAssetProjectRelativePath = relAligned
							touched = true
						}
					}
				}
				// ② 终极兜底：如果 modelAssetProjectRelativePath 仍为空，用 modelResourceId 查 resourcesById
				let relPath = String(rb.modelAssetProjectRelativePath ?? '').trim()
				if (!relPath) {
					const rid =
						String(rb.modelResourceId ?? '').trim() || String(aligned?.modelResourceId ?? '').trim()
					if (rid && payloadResourcesById) {
						const resource = payloadResourcesById[rid]
						if (resource) {
							relPath = String(resource.projectRelativePath ?? '').trim()
							if (relPath) {
								rb.modelAssetProjectRelativePath = relPath
								rb.modelProjectRelativePath = relPath
								touched = true
								resourceIdBackfillCount++
							}
						}
					}
				}
				// ③ 绝对路径转换：把相对路径用 projectRootPath 拼接成绝对路径，写入 4 个标准字段
				//   UE 端 TrySetValidSourcePath → NormalizeLocalFilePath → FPaths::FileExists 直接命中
				if (relPath && projectRootPath) {
					const cleanRoot = projectRootPath.replace(/[\\/]+$/, '')
					const cleanRel = relPath.replace(/^[\\/]+/, '').replace(/\//g, '\\')
					const absPath = cleanRoot + '\\' + cleanRel
					// 把 4 个标准字段中"空 / 远端URL / dweb:// / 相对路径"的统一替换为绝对路径
					for (const f of UE_4_PATH_FIELDS) {
						const cur = String(rb[f] ?? '').trim()
						if (!cur || isRemoteOrDwebUrl(cur) || !isAbsolutePath(cur)) {
							rb[f] = absPath
							touched = true
						}
					}
					absPathConvertCount++
				}
				if (touched) syncAlignedCount++
			}

			// 2026-08-04 ④ 蓝图直扫：完全绕过 model3dSettings 的路径声明，
			//   直接从 edgesById 找场景布局节点的 in-model-* 入边 → 上游 model3d 节点 →
			//   nodeId.resourceId → resourcesById[resourceId].projectRelativePath →
			//   projectRootPath 拼接成绝对路径 → 直接覆盖 binding 的 4 个标准字段。
			//   用户要求：不要理会 3D 模型节点对模型来源的声明（远端 URL / 空字段），
			//   按照静态文件落盘位置直接导入静态网格。
			{
				// 直扫映射建立委托给纯函数 buildDirectScanAbsPathByObjectId（便于单测）
				const directAbsPathByObjectId = buildDirectScanAbsPathByObjectId({
					edgesById: payload.store.state.edgesById,
					nodesById: payload.store.state.nodesById,
					resourcesById: payload.store.state.resourcesById,
					sourceSceneLayoutNodeId,
					projectRootPath
				})
				// 用直扫结果直接覆盖 finalConnectedModelBindings 的 4 个标准字段
				let directScanCount = 0
				for (const rawBinding of finalConnectedModelBindings) {
					if (!rawBinding || typeof rawBinding !== 'object') continue
					const rb = rawBinding as Record<string, unknown>
					const oid = String(rb.objectId ?? '').trim()
					if (!oid) continue
					const absPath = directAbsPathByObjectId.get(oid)
					if (!absPath) continue
					// 直接覆盖 4 个标准字段为绝对路径，不管之前是什么值
					for (const f of UE_4_PATH_FIELDS) {
						rb[f] = absPath
					}
					directScanCount++
				}
				console.warn(
					`[UNREAL-EXPORT-TRACE][SUMMARY] ④ DIRECT-SCAN | edges→model3d→resourcesById→absPath: ${directAbsPathByObjectId.size} objectIds found, ${directScanCount} bindings updated with absolute local file path`
				)
			}
			console.warn(
				`[UNREAL-EXPORT-TRACE][SUMMARY] CRITICAL FIX | slot-sync=${syncAlignedCount}/${finalConnectedModelBindings.length} | resourceId-backfill=${resourceIdBackfillCount} | absPath-convert=${absPathConvertCount} | projectRoot=${projectRootPath || '(empty)'}`
			)

			// 2026-08-04 第 4 层：离线守卫 — 清理 modelBindings 中的远端 URL
			// 确保发给 UE 的 payload 中没有任何公网 URL（meshy/tripo3d CDN 等）。
			// 远端 URL 有本地替代时替换为本地路径；无本地替代时标记 binding 为占位。
			const ENABLE_OFFLINE_GUARD = true
			let offlineGuardReplaced = 0
			let offlineGuardBlocked = 0
			const finalModelBindings = ENABLE_OFFLINE_GUARD
				? (finalConnectedModelBindings as Record<string, unknown>[]).map((binding) => {
						const cleaned = { ...binding }
						const pathFields = ['modelUrl', 'modelAssetUrl', 'modelSourcePath', 'modelAssetPath']
						let hasRemote = false
						let hasLocalAlt = false
						for (const field of pathFields) {
							const value = String(cleaned[field] ?? '').trim()
							if (value && isRemoteCdnUrl(value)) {
								hasRemote = true
								// 尝试用 modelAssetProjectRelativePath 替换
								const relPath = String(cleaned.modelAssetProjectRelativePath ?? '').trim()
								if (relPath && !isRemoteCdnUrl(relPath)) {
									cleaned[field] = relPath
									hasLocalAlt = true
								} else {
									// 尝试用 modelResourceId 查 resourcesById
									const rid = String(cleaned.modelResourceId ?? '').trim()
									if (rid && payload.store.state.resourcesById) {
										const resource = payload.store.state.resourcesById[rid] as
											| Record<string, unknown>
											| undefined
										if (resource) {
											const resUrl = String(resource.url ?? '').trim()
											const resRelPath = String(resource.projectRelativePath ?? '').trim()
											if (resUrl && !isRemoteCdnUrl(resUrl)) {
												cleaned[field] = resUrl
												hasLocalAlt = true
											} else if (resRelPath && !isRemoteCdnUrl(resRelPath)) {
												cleaned[field] = resRelPath
												hasLocalAlt = true
											}
										}
									}
								}
								if (!hasLocalAlt) {
									cleaned[field] = '' // 清空远端 URL，UE 端会标记为占位
								}
							}
						}
						if (hasRemote && hasLocalAlt) {
							offlineGuardReplaced += 1
							console.warn(
								`[unreal-export][offline-guard] 远端 URL 已替换为本地: ${String(cleaned.objectId ?? '')}`
							)
						} else if (hasRemote && !hasLocalAlt) {
							offlineGuardBlocked += 1
							cleaned.isPlaceholder = true
							cleaned.placeholderReason = 'remote-url-no-local'
							console.warn(
								`[unreal-export][offline-guard] 远端 URL 无本地替代，标记为占位: ${String(cleaned.objectId ?? '')}`
							)
						}
						return cleaned
					})
				: (finalConnectedModelBindings as Record<string, unknown>[])

			if (offlineGuardBlocked > 0) {
				resolvedLayoutWarnings.push(
					`离线守卫: ${offlineGuardBlocked} 个 binding 因远端 URL 无本地替代被标记为占位`
				)
			}
			if (offlineGuardReplaced > 0) {
				resolvedLayoutWarnings.push(
					`离线守卫: ${offlineGuardReplaced} 个 binding 的远端 URL 已替换为本地路径`
				)
			}

			// 2026-08-04 第 2 层：payload 结构增强
			// exportVersion 6→7：新增占位 slot 支持
			// layoutProtocolVersion 4→5：占位 slot 协议
			const modelSlotCount = resolvedLayoutSlots.length - placeholderCount
			return {
				ok: true as const,
				payload: {
					exportVersion: 7,
					layoutProtocolVersion: 5,
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
					placeholderSlotCount: placeholderCount,
					modelSlotCount,
					resolvedLayoutWarnings,
					resolvedActorOrigin,
					resolvedSourceItemCount: finalModelBindings.length,
					layoutItems,
					modelBindings: finalModelBindings,
					manualModelBindings,
					layoutItemCount: layoutItems.length,
					modelBindingCount: finalModelBindings.length,
					manualModelBindingCount: manualModelBindings.length,
					offlineGuardSummary: {
						replaced: offlineGuardReplaced,
						blocked: offlineGuardBlocked
					}
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
			console.warn('[UNREAL-EXPORT-TRACE] #6 FINAL createJob payload (before sending to UE)')
			console.warn(`exportMode = ${exportMode}`)
			console.warn(`resolvedSlotCount = ${built.payload.resolvedSlotCount}`)
			console.warn(`resolvedSourceItemCount = ${built.payload.resolvedSourceItemCount}`)
			console.warn(`layoutItemCount = ${built.payload.layoutItemCount}`)
			console.warn(`modelBindingCount = ${built.payload.modelBindingCount}`)
			console.warn(
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
						position:
							wt && typeof wt.position === 'object'
								? (wt as Record<string, unknown>).position
								: null,
						modelBinding: mb
							? {
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
								}
							: null
					}
				})
			)
			console.warn(`exportPayload (raw, for deep inspection) =`, built.payload)

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
