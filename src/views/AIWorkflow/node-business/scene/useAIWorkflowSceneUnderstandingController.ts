import { getErrorMessage, isRecord } from '../../../../types/utils'
import { t } from '../../../../i18n'
import type {
	SceneUnderstandModelsResponse,
	SceneLightingModelsResponse,
	SceneUnderstandStreamEvent,
	SceneLightingStreamEvent,
	SceneUnderstandImageInput
} from '../../../../network/SceneSkillService'
import type { AgentToUiMessage } from '../../../../core/agentToUI/types'

export const useAIWorkflowSceneUnderstandingController = (options: {
	store: {
		state: {
			nodesById: Record<string, unknown>
		}
		commit: (type: string, value: unknown) => void
	}
	sceneSkillService: {
		listSceneUnderstandModels: () => Promise<SceneUnderstandModelsResponse>
		listSceneLightingModels: () => Promise<SceneLightingModelsResponse>
		streamSceneUnderstand: (
			payload: {
				nodeId: string
				model: string
				promptText: string
				imageUrl?: string
				imageDataUrl?: string
				imageInputs?: SceneUnderstandImageInput[]
				sceneType?: 'auto' | 'indoor' | 'outdoor'
			},
			signal?: AbortSignal
		) => AsyncIterable<SceneUnderstandStreamEvent>
		streamSceneLighting: (
			payload: {
				nodeId: string
				model: string
				promptText: string
				layoutJson: string
				imageUrl?: string
				imageDataUrl?: string
				imageInputs?: SceneUnderstandImageInput[]
			},
			signal?: AbortSignal
		) => AsyncIterable<SceneLightingStreamEvent>
	}
	connectedSceneUnderstandImageInputs: (
		nodeId: string
	) => Array<{ url: string; width?: number; height?: number }>
	connectedImageInputUrl: (nodeId: string, anchorId: string) => string | null
	connectedTextInputValue: (nodeId: string, anchorId: string) => string
	normalizeMeshyImageInputValue: (value: string, defaultName: string) => Promise<string>
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	updateNodeData: (nodeId: string, patch: Record<string, any>) => void
}) => {
	const sceneUnderstandRunControllers = new Map<string, AbortController>()
	const sceneUnderstandDraftBuffers = new Map<string, string>()
	const sceneUnderstandDraftTimers = new Map<string, number>()
	const sceneUnderstandReasoningBuffers = new Map<string, string>()

	const getNodeRecord = (nodeId: string) =>
		options.store.state.nodesById[nodeId] as Record<string, unknown> | undefined

	const getNodeSceneUnderstandingSettings = (nodeId: string): Record<string, unknown> | null => {
		const node = getNodeRecord(nodeId)
		const settings = node?.sceneUnderstandingSettings
		return isRecord(settings) ? settings : null
	}

	const applySettingsPatch = (nodeId: string, patch: Record<string, unknown>) => {
		const currentSettings = getNodeSceneUnderstandingSettings(nodeId) ?? {}
		const mergedSettings = { ...currentSettings, ...patch }
		const patchKeys = Object.keys(patch)

		console.log('[SceneUnderstandingController] applySettingsPatch', {
			nodeId,
			patchKeys,
			newStatus: typeof patch.status === 'string' ? patch.status : undefined,
			modelsCount: Array.isArray(patch.availableModels) ? patch.availableModels.length : undefined,
			selectedModel: typeof patch.selectedModel === 'string' ? patch.selectedModel : undefined,
			mode: typeof patch.mode === 'string' ? patch.mode : undefined,
			sceneType: typeof patch.sceneType === 'string' ? patch.sceneType : undefined
		})

		options.store.commit('setNodeSceneUnderstandingSettings', {
			nodeId,
			sceneUnderstandingSettings: mergedSettings
		})

		try {
			options.updateNodeData(nodeId, { sceneUnderstandingSettings: mergedSettings })
		} catch (err) {
			console.error('[SceneUnderstandingController] updateNodeData failed', err)
		}
	}

	const clearSceneUnderstandDraftSchedule = (nodeId: string) => {
		const timer = sceneUnderstandDraftTimers.get(nodeId)
		if (timer != null) {
			window.clearTimeout(timer)
			sceneUnderstandDraftTimers.delete(nodeId)
		}
	}

	const formatJsonLikeDraft = (raw: string) => {
		const text = String(raw ?? '')
			.replace(/\r\n/g, '\n')
			.replace(/\r/g, '\n')
			.trim()
		if (!text) return ''
		try {
			return JSON.stringify(JSON.parse(text), null, 2)
		} catch {
			let out = ''
			let indent = 0
			let inString = false
			let escaped = false
			const indentText = () => '  '.repeat(Math.max(0, indent))
			const trimTrailingSpaces = () => {
				while (out.endsWith(' ') || out.endsWith('\t')) out = out.slice(0, -1)
			}
			const ensureLineStart = () => {
				trimTrailingSpaces()
				if (!out || out.endsWith('\n')) return
				out += '\n'
			}
			for (let index = 0; index < text.length; index += 1) {
				const ch = text[index]
				if (inString) {
					out += ch
					if (escaped) {
						escaped = false
					} else if (ch === '\\') {
						escaped = true
					} else if (ch === '"') {
						inString = false
					}
					continue
				}
				if (ch === '"') {
					inString = true
					out += ch
					continue
				}
				if (ch === '{' || ch === '[') {
					out += ch
					indent += 1
					out += '\n' + indentText()
					continue
				}
				if (ch === '}' || ch === ']') {
					indent = Math.max(0, indent - 1)
					ensureLineStart()
					out += indentText() + ch
					continue
				}
				if (ch === ',') {
					out += ',\n' + indentText()
					continue
				}
				if (ch === ':') {
					out += ': '
					continue
				}
				if (ch === '\n') {
					ensureLineStart()
					out += indentText()
					continue
				}
				out += ch
			}
			return out
		}
	}

	const formatSceneUnderstandDraftOutput = (raw: string) => formatJsonLikeDraft(String(raw ?? ''))

	const flushSceneUnderstandDraft = (nodeId: string, rawOverride?: string) => {
		const settings = getNodeSceneUnderstandingSettings(nodeId)
		const raw =
			typeof rawOverride === 'string'
				? rawOverride
				: (sceneUnderstandDraftBuffers.get(nodeId) ??
					(typeof settings?.rawOutput === 'string' ? settings.rawOutput : ''))
		sceneUnderstandDraftBuffers.set(nodeId, raw)
		applySettingsPatch(nodeId, {
			outputJson: formatSceneUnderstandDraftOutput(raw),
			rawOutput: raw
		})
	}

	const scheduleSceneUnderstandDraftFlush = (nodeId: string, raw: string, immediate = false) => {
		sceneUnderstandDraftBuffers.set(nodeId, raw)
		if (immediate) {
			clearSceneUnderstandDraftSchedule(nodeId)
			flushSceneUnderstandDraft(nodeId, raw)
			return
		}
		if (sceneUnderstandDraftTimers.has(nodeId)) return
		const timer = window.setTimeout(() => {
			sceneUnderstandDraftTimers.delete(nodeId)
			flushSceneUnderstandDraft(nodeId)
		}, 90)
		sceneUnderstandDraftTimers.set(nodeId, timer)
	}

	const stopSceneUnderstandRun = (nodeId: string) => {
		const controller = sceneUnderstandRunControllers.get(nodeId)
		if (controller) {
			controller.abort()
			sceneUnderstandRunControllers.delete(nodeId)
		}
	}

	const resetSceneUnderstandingNodeState = (nodeId: string) => {
		const node = getNodeRecord(nodeId)
		if (!node || node.type !== 'scene-understanding') return
		stopSceneUnderstandRun(nodeId)
		clearSceneUnderstandDraftSchedule(nodeId)
		sceneUnderstandDraftBuffers.delete(nodeId)
		sceneUnderstandReasoningBuffers.delete(nodeId)
		const currentSettings = getNodeSceneUnderstandingSettings(nodeId)
		const currentSceneType = (currentSettings?.sceneType as 'auto' | 'indoor' | 'outdoor') || 'auto'
		const currentMode = (currentSettings?.mode as string) || 'scene-layout'
		const currentSelectedModel = (currentSettings?.selectedModel as string) || ''
		const currentAvailableModels = Array.isArray(currentSettings?.availableModels)
			? (currentSettings?.availableModels as any[])
			: []
		applySettingsPatch(nodeId, {
			status: 'idle',
			message: t('aiworkflow.runtime.understandingWaitRun'),
			statusText: t('aiworkflow.runtime.understandingResetStatus'),
			progress: 0,
			provider: undefined,
			providerStatusText: undefined,
			remoteStatusCode: undefined,
			outputJson: '',
			rawOutput: '',
			resultSummary: '',
			reasoningText: '',
			sceneType: currentSceneType,
			mode: currentMode,
			selectedModel: currentSelectedModel,
			availableModels: currentAvailableModels,
			detectedSceneType: undefined,
			sceneTypeConfidence: undefined,
			rewriteUsed: false,
			rewriteAttempts: 0,
			mock: false
		})
	}

	const onNodeCancelSceneUnderstanding = (nodeId: string) => {
		const node = getNodeRecord(nodeId)
		if (!node || node.type !== 'scene-understanding') return
		stopSceneUnderstandRun(nodeId)
		flushSceneUnderstandDraft(nodeId)
		clearSceneUnderstandDraftSchedule(nodeId)
		sceneUnderstandReasoningBuffers.delete(nodeId)
		applySettingsPatch(nodeId, {
			status: 'canceled',
			message: t('aiworkflow.runtime.understandingCanceledMessage'),
			statusText: t('aiworkflow.runtime.understandingCanceledStatus'),
			progress: 0,
			reasoningText: ''
		})
	}

	const sceneUnderstandPhaseState = (phase: string, message: string, contentLength = 0) => {
		const normalized = String(phase || '')
			.trim()
			.toLowerCase()
		if (normalized === 'start')
			return { progress: 5, statusText: message || t('aiworkflow.runtime.understandingPhaseStart') }
		if (normalized === 'started')
			return {
				progress: 8,
				statusText: message || t('aiworkflow.runtime.understandingPhaseStarted')
			}
		if (normalized === 'prepare_input')
			return {
				progress: 15,
				statusText: message || t('aiworkflow.runtime.understandingPhasePrepareInput')
			}
		if (normalized === 'connect')
			return {
				progress: 25,
				statusText: message || t('aiworkflow.runtime.understandingPhaseConnect')
			}
		if (normalized === 'submit')
			return {
				progress: 35,
				statusText: message || t('aiworkflow.runtime.understandingPhaseSubmit')
			}
		if (normalized === 'thinking')
			return {
				progress: 40,
				statusText: message || t('aiworkflow.runtime.understandingPhaseThinking')
			}
		if (normalized === 'writing')
			return {
				progress: 72,
				statusText: message || t('aiworkflow.runtime.understandingPhaseWriting')
			}
		if (normalized === 'streaming') {
			const estimatedProgress = Math.min(80, 78 + Math.min(12, Math.floor(contentLength / 200)))
			return {
				progress: estimatedProgress,
				statusText: message || t('aiworkflow.runtime.understandingPhaseStreaming')
			}
		}
		if (normalized === 'continue')
			return {
				progress: 85,
				statusText: message || t('aiworkflow.runtime.understandingPhaseContinue')
			}
		if (normalized === 'parse')
			return {
				progress: 90,
				statusText: message || t('aiworkflow.runtime.understandingPhaseParse')
			}
		if (normalized === 'rewrite')
			return {
				progress: 80,
				statusText: message || t('aiworkflow.runtime.understandingPhaseRewrite')
			}
		if (normalized === 'done')
			return {
				progress: 100,
				statusText: message || t('aiworkflow.runtime.understandingPhaseDone')
			}
		if (normalized === 'canceled')
			return {
				progress: 0,
				statusText: message || t('aiworkflow.runtime.understandingPhaseCanceledStatus')
			}
		if (normalized === 'error')
			return {
				progress: 100,
				statusText: message || t('aiworkflow.runtime.understandingPhaseError')
			}
		return {
			progress: 40,
			statusText: message || t('aiworkflow.runtime.understandingPhaseWaiting')
		}
	}

	const onNodeSceneUnderstandingSettingsUpdate = (
		nodeId: string,
		payload: Record<string, unknown>
	) => {
		const currentSettings = getNodeSceneUnderstandingSettings(nodeId)
		const isRunning = currentSettings?.status === 'running'
		let safePayload = { ...payload }
		if (isRunning) {
			if ('outputJson' in safePayload) delete safePayload.outputJson
			if ('rawOutput' in safePayload) delete safePayload.rawOutput
			if ('resultSummary' in safePayload) delete safePayload.resultSummary
			if (
				'message' in safePayload &&
				!('statusText' in safePayload) &&
				!('progress' in safePayload)
			)
				delete safePayload.message
			const newStatus = safePayload.status
			if (
				typeof newStatus === 'string' &&
				!['running', 'completed', 'error', 'canceled'].includes(newStatus)
			) {
				delete safePayload.status
			}
		}
		console.log('[SceneUnderstandingController] onNodeSceneUnderstandingSettingsUpdate', {
			nodeId,
			payloadKeys: Object.keys(payload),
			safePayloadKeys: Object.keys(safePayload),
			modeChanged: 'mode' in payload,
			modelChanged: 'selectedModel' in payload,
			sceneTypeChanged: 'sceneType' in payload
		})
		applySettingsPatch(nodeId, safePayload)
	}

	const onNodeRequestSceneModels = async (nodeId: string) => {
		const node = getNodeRecord(nodeId)
		if (!node || node.type !== 'scene-understanding') return
		const settings = getNodeSceneUnderstandingSettings(nodeId)
		if (settings?.status === 'running') return
		const mode = settings?.mode === 'scene-lighting' ? 'scene-lighting' : 'scene-layout'

		console.log('[SceneUnderstandingController] requesting models', {
			nodeId,
			mode,
			currentModel: settings?.selectedModel
		})

		applySettingsPatch(nodeId, {
			status: 'loading-models',
			message: t(
				mode === 'scene-lighting'
					? 'aiworkflow.runtime.understandingLoadingLightingModels'
					: 'aiworkflow.runtime.understandingLoadingModels'
			)
		})

		try {
			const res =
				mode === 'scene-lighting'
					? await options.sceneSkillService.listSceneLightingModels()
					: await options.sceneSkillService.listSceneUnderstandModels()

			console.log('[SceneUnderstandingController] models response', {
				nodeId,
				ok: res.ok,
				modelsCount: Array.isArray((res as any).models) ? (res as any).models.length : 0,
				defaultModel: (res as any).defaultModel
			})

			if (!res.ok) {
				applySettingsPatch(nodeId, {
					status: 'error',
					message: res.error || t('aiworkflow.runtime.understandingLoadModelsFailed')
				})
				options.pushToast(
					t('aiworkflow.toast.sceneModelListFailed', { error: String(res.error || 'unknown') }),
					'warn'
				)
				return
			}
			const models = Array.isArray(res.models) ? res.models : []
			const fallbackModel = String(res.defaultModel || models[0]?.id || '').trim()
			const prevSelectedModel = String(
				typeof settings?.selectedModel === 'string' ? settings.selectedModel : ''
			).trim()
			// 保持之前选择的模型（如果还在列表中），否则用默认模型
			let selectedModel = prevSelectedModel
			if (selectedModel && !models.find((m: any) => m.id === selectedModel)) {
				selectedModel = fallbackModel
			} else if (!selectedModel) {
				selectedModel = fallbackModel
			}
			applySettingsPatch(nodeId, {
				availableModels: models,
				selectedModel,
				status: 'idle',
				message: models.length
					? t('aiworkflow.runtime.understandingLoadedModels', { count: String(models.length) })
					: t('aiworkflow.runtime.understandingNoModelsAvailable'),
				statusText: models.length
					? mode === 'scene-lighting'
						? t('aiworkflow.runtime.understandingLightingModelsRefreshed')
						: t('aiworkflow.runtime.understandingModelsRefreshed')
					: t('aiworkflow.runtime.understandingNoModelsFound')
			})
		} catch (err: unknown) {
			const message = getErrorMessage(err)
			console.error('[SceneUnderstandingController] request models failed', err)
			applySettingsPatch(nodeId, {
				status: 'error',
				message
			})
			options.pushToast(t('aiworkflow.toast.sceneModelListFailed', { error: message }), 'warn')
		}
	}

	const onNodeRunSceneUnderstanding = async (nodeId: string) => {
		const node = getNodeRecord(nodeId)
		if (!node || node.type !== 'scene-understanding') return
		const settings = getNodeSceneUnderstandingSettings(nodeId)
		const mode = settings?.mode === 'scene-lighting' ? 'scene-lighting' : 'scene-layout'
		const rawImageInputs = options.connectedSceneUnderstandImageInputs(nodeId)
		const imageUrl = String(
			rawImageInputs[0]?.url ?? options.connectedImageInputUrl(nodeId, 'in-image') ?? ''
		).trim()
		const promptText = String(options.connectedTextInputValue(nodeId, 'in-text') ?? '').trim()
		const externalLayoutJson = String(
			options.connectedTextInputValue(nodeId, 'in-layout-json') ?? ''
		).trim()
		const selfOutputJson = String(settings?.outputJson ?? '').trim()
		const layoutJson = externalLayoutJson || selfOutputJson
		const model = String(
			typeof settings?.selectedModel === 'string' ? settings.selectedModel : ''
		).trim()
		const sceneType: 'auto' | 'indoor' | 'outdoor' =
			settings?.sceneType === 'indoor' || settings?.sceneType === 'outdoor'
				? settings.sceneType
				: 'auto'
		if (!imageUrl) {
			options.pushToast(
				t(
					mode === 'scene-lighting'
						? 'aiworkflow.runtime.understandingLightingMissingImage'
						: 'aiworkflow.runtime.understandingMissingImage'
				),
				'warn'
			)
			return
		}
		if (mode === 'scene-lighting' && !layoutJson) {
			options.pushToast(t('aiworkflow.runtime.understandingLightingNeedsJson'), 'warn')
			return
		}
		if (!model) {
			options.pushToast(
				t(
					mode === 'scene-lighting'
						? 'aiworkflow.runtime.understandingSelectLightingModel'
						: 'aiworkflow.runtime.understandingSelectModel'
				),
				'warn'
			)
			return
		}

		console.log('[SceneUnderstandingController] starting run', {
			nodeId,
			mode,
			model,
			sceneType,
			imageInputsCount: rawImageInputs.length,
			hasPromptText: !!promptText,
			hasLayoutJson: !!layoutJson
		})

		applySettingsPatch(nodeId, {
			status: 'running',
			message: t(
				mode === 'scene-lighting'
					? 'aiworkflow.runtime.understandingRunningLighting'
					: 'aiworkflow.runtime.understandingRunning'
			),
			statusText:
				mode === 'scene-lighting'
					? t('aiworkflow.runtime.understandingPreparingLighting')
					: t('aiworkflow.runtime.understandingPreparing'),
			progress: 4,
			provider: 'volcengine-ark',
			providerStatusText: t('aiworkflow.runtime.understandingRequestNotSent'),
			remoteStatusCode: undefined,
			outputJson: '',
			rawOutput: '',
			reasoningText: '',
			rewriteUsed: false,
			rewriteAttempts: 0,
			lastInputImageUrl: imageUrl,
			lastInputImageUrls: rawImageInputs.map((item) => item.url),
			lastInputPrompt: promptText,
			lastInputLayoutJson: layoutJson
		})

		let controller: AbortController | null = null
		try {
			const normalizedImageInputs: Array<{
				imageUrl?: string
				imageDataUrl?: string
				width?: number
				height?: number
			}> = []
			for (let index = 0; index < rawImageInputs.length; index += 1) {
				const rawInput = rawImageInputs[index]
				const normalizedImageInput = await options.normalizeMeshyImageInputValue(
					rawInput.url,
					`scene_understand_input_${index + 1}`
				)
				if (!normalizedImageInput) continue
				normalizedImageInputs.push(
					normalizedImageInput.startsWith('data:')
						? { imageDataUrl: normalizedImageInput, width: rawInput.width, height: rawInput.height }
						: { imageUrl: normalizedImageInput, width: rawInput.width, height: rawInput.height }
				)
			}
			if (!normalizedImageInputs.length) {
				applySettingsPatch(nodeId, {
					status: 'error',
					message: t('aiworkflow.runtime.understandingInvalidImage')
				})
				options.pushToast(t('aiworkflow.runtime.understandingInvalidImage'), 'warn')
				return
			}
			const firstImage = normalizedImageInputs[0]
			const payload = {
				nodeId,
				model,
				promptText,
				...(mode === 'scene-lighting' ? { layoutJson } : {}),
				...(mode === 'scene-layout' ? { sceneType } : {}),
				...(firstImage?.imageDataUrl ? { imageDataUrl: firstImage.imageDataUrl } : {}),
				...(firstImage?.imageUrl ? { imageUrl: firstImage.imageUrl } : {}),
				imageInputs: normalizedImageInputs
			}
			stopSceneUnderstandRun(nodeId)
			controller = new AbortController()
			sceneUnderstandRunControllers.set(nodeId, controller)
			sceneUnderstandReasoningBuffers.set(nodeId, '')

			const stream =
				mode === 'scene-lighting'
					? options.sceneSkillService.streamSceneLighting(
							{
								nodeId: payload.nodeId,
								model: payload.model,
								promptText: payload.promptText,
								layoutJson,
								...(firstImage?.imageDataUrl ? { imageDataUrl: firstImage.imageDataUrl } : {}),
								...(firstImage?.imageUrl ? { imageUrl: firstImage.imageUrl } : {}),
								imageInputs: normalizedImageInputs
							},
							controller.signal
						)
					: options.sceneSkillService.streamSceneUnderstand(payload, controller.signal)
			for await (const ev of stream) {
				if (ev.type === 'done') break
				if (ev.type === 'error') {
					const errorMsg = ev.error.message || 'unknown'
					applySettingsPatch(nodeId, {
						status: 'error',
						message:
							ev.error.message ||
							t(
								mode === 'scene-lighting'
									? 'aiworkflow.runtime.understandingPhaseLightingError'
									: 'aiworkflow.runtime.understandingPhaseError'
							),
						statusText: t('aiworkflow.runtime.understandingSseParseFailed'),
						progress: 100
					})
					options.pushToast(
						t(
							mode === 'scene-lighting'
								? 'aiworkflow.runtime.lightingFailedWithError'
								: 'aiworkflow.runtime.understandingFailedWithError',
							{ error: errorMsg }
						),
						'warn'
					)
					break
				}

				const msg = ev.message
				if (msg.type === 'agentToUi/text') {
					const payload = msg.payload as Record<string, unknown>
					const deltaText = typeof payload.text === 'string' ? payload.text : ''
					if (deltaText) {
						const settings = getNodeSceneUnderstandingSettings(nodeId)
						const prevRaw =
							sceneUnderstandDraftBuffers.get(nodeId) ??
							(typeof settings?.rawOutput === 'string' ? settings.rawOutput : '')
						const nextRaw = `${prevRaw}${deltaText}`
						scheduleSceneUnderstandDraftFlush(nodeId, nextRaw)
					}
					continue
				}

				if (msg.type === 'agentToUi/reasoning') {
					const payload = msg.payload as Record<string, unknown>
					const deltaText = typeof payload.text === 'string' ? payload.text : ''
					if (deltaText) {
						const prevReasoning = sceneUnderstandReasoningBuffers.get(nodeId) ?? ''
						const nextReasoning = `${prevReasoning}${deltaText}`
						sceneUnderstandReasoningBuffers.set(nodeId, nextReasoning)
						const maxDisplayLen = 2000
						const displayText =
							nextReasoning.length > maxDisplayLen
								? `...${nextReasoning.slice(-maxDisplayLen)}`
								: nextReasoning
						applySettingsPatch(nodeId, {
							reasoningText: displayText
						})
					}
					continue
				}

				if (msg.type === 'agentToUi/taskStatus') {
					const payload = msg.payload as Record<string, unknown>
					const phase = typeof payload.phase === 'string' ? payload.phase : ''
					const phaseMessage = typeof payload.message === 'string' ? payload.message : ''
					const details = isRecord(payload.details)
						? payload.details
						: ({} as Record<string, unknown>)
					const resetDraft = details.resetDraft === true
					const currentSettings = getNodeSceneUnderstandingSettings(nodeId)
					const draftLen = sceneUnderstandDraftBuffers.get(nodeId)?.length ?? 0
					const currentRawLen = String(currentSettings?.rawOutput ?? '').length + draftLen
					const nextState = sceneUnderstandPhaseState(phase, phaseMessage, currentRawLen)
					if (resetDraft) {
						clearSceneUnderstandDraftSchedule(nodeId)
						sceneUnderstandDraftBuffers.set(nodeId, '')
					}
					applySettingsPatch(nodeId, {
						status:
							phase === 'done'
								? 'completed'
								: phase === 'error'
									? 'error'
									: phase === 'canceled'
										? 'canceled'
										: 'running',
						message: phaseMessage || t('aiworkflow.runtime.understandingProcessing'),
						statusText: nextState.statusText,
						progress: nextState.progress,
						provider: 'volcengine-ark',
						providerStatusText: phaseMessage || t('aiworkflow.runtime.understandingProcessing'),
						...(resetDraft ? { outputJson: '', rawOutput: '' } : {})
					})
					continue
				}

				if (msg.type === 'agentToUi/error') {
					flushSceneUnderstandDraft(nodeId)
					clearSceneUnderstandDraftSchedule(nodeId)
					const payloadErr = msg.payload as Record<string, unknown>
					const details = isRecord(payloadErr.details)
						? payloadErr.details
						: ({} as Record<string, unknown>)
					const settings = getNodeSceneUnderstandingSettings(nodeId)
					const errorMsg = String(payloadErr.message ?? 'unknown')
					applySettingsPatch(nodeId, {
						status: 'error',
						message:
							typeof payloadErr.message === 'string'
								? payloadErr.message
								: t(
										mode === 'scene-lighting'
											? 'aiworkflow.runtime.understandingPhaseLightingError'
											: 'aiworkflow.runtime.understandingPhaseError'
									),
						statusText: String(
							typeof details.providerStatusText === 'string'
								? details.providerStatusText
								: (payloadErr.message ?? t('aiworkflow.runtime.understandingRemoteError'))
						),
						progress: 100,
						provider: typeof details.provider === 'string' ? details.provider : 'volcengine-ark',
						providerStatusText:
							typeof details.providerStatusText === 'string'
								? details.providerStatusText
								: undefined,
						remoteStatusCode: Number.isFinite(Number(details.remoteStatusCode ?? details.status))
							? Number(details.remoteStatusCode ?? details.status)
							: undefined,
						rawOutput: typeof settings?.rawOutput === 'string' ? settings.rawOutput : ''
					})
					options.pushToast(
						t(
							mode === 'scene-lighting'
								? 'aiworkflow.runtime.lightingFailedWithError'
								: 'aiworkflow.runtime.understandingFailedWithError',
							{ error: errorMsg }
						),
						'warn'
					)
					break
				}

				if (msg.type === 'agentToUi/chatMessage') {
					try {
						clearSceneUnderstandDraftSchedule(nodeId)
						sceneUnderstandDraftBuffers.delete(nodeId)
						const payloadRaw = msg.payload as Record<string, unknown>
						const contentStr = typeof payloadRaw.content === 'string' ? payloadRaw.content : '{}'
						const payloadResult = JSON.parse(contentStr) as Record<string, unknown>
						const isMock = payloadResult.mock === true
						let parsedSceneType: 'indoor' | 'outdoor' | 'semi-outdoor' | undefined
						let sceneConfidence: number | undefined
						const outputJsonStr =
							typeof payloadResult.outputJson === 'string' ? payloadResult.outputJson : ''
						if (outputJsonStr) {
							try {
								const parsedJson = JSON.parse(outputJsonStr) as Record<string, unknown>
								const st = typeof parsedJson.sceneType === 'string' ? parsedJson.sceneType : ''
								if (st === 'indoor' || st === 'outdoor' || st === 'semi-outdoor') {
									parsedSceneType = st
								}
								const conf = Number(parsedJson.sceneTypeConfidence)
								if (Number.isFinite(conf) && conf >= 0 && conf <= 1) {
									sceneConfidence = conf
								}
							} catch {}
						}
						console.log('[SceneUnderstandingController] run completed', {
							nodeId,
							isMock,
							hasOutputJson: !!outputJsonStr,
							detectedSceneType: parsedSceneType
						})
						applySettingsPatch(nodeId, {
							status: 'completed',
							message:
								typeof payloadResult.summary === 'string'
									? payloadResult.summary
									: t(
											mode === 'scene-lighting'
												? 'aiworkflow.runtime.understandingLightingCompleted'
												: 'aiworkflow.runtime.understandingCompleted'
										),
							statusText:
								typeof payloadResult.providerStatusText === 'string'
									? payloadResult.providerStatusText
									: t('aiworkflow.runtime.understandingResultReady'),
							progress: 100,
							outputJson: outputJsonStr,
							rawOutput: typeof payloadResult.rawOutput === 'string' ? payloadResult.rawOutput : '',
							resultSummary: typeof payloadResult.summary === 'string' ? payloadResult.summary : '',
							provider:
								typeof payloadResult.provider === 'string'
									? payloadResult.provider
									: 'volcengine-ark',
							providerStatusText:
								typeof payloadResult.providerStatusText === 'string'
									? payloadResult.providerStatusText
									: undefined,
							remoteStatusCode: Number.isFinite(Number(payloadResult.remoteStatusCode))
								? Number(payloadResult.remoteStatusCode)
								: undefined,
							lastRunAt: Date.now(),
							rewriteUsed: payloadResult.rewriteUsed === true,
							rewriteAttempts: Number.isFinite(Number(payloadResult.rewriteAttempts))
								? Number(payloadResult.rewriteAttempts)
								: 0,
							detectedSceneType: parsedSceneType,
							sceneTypeConfidence: sceneConfidence,
							mock: isMock
						})
						options.pushToast(
							t(
								mode === 'scene-lighting'
									? 'aiworkflow.runtime.lightingCompleteToast'
									: 'aiworkflow.runtime.understandingCompleteToast',
								{ mock: isMock ? t('aiworkflow.runtime.mockSuffix') : '' }
							),
							'info'
						)
					} catch (parseErr: unknown) {
						const parseMsg = getErrorMessage(parseErr)
						console.error('[SceneUnderstandingController] parse result failed', parseErr)
						applySettingsPatch(nodeId, {
							status: 'error',
							message: t('aiworkflow.runtime.understandingResultParseFailed', { error: parseMsg }),
							statusText: t('aiworkflow.runtime.understandingResultParseFailedStatus'),
							progress: 100
						})
						options.pushToast(
							t(
								mode === 'scene-lighting'
									? 'aiworkflow.runtime.lightingParseFailedToast'
									: 'aiworkflow.runtime.understandingParseFailedToast'
							),
							'warn'
						)
					}
				}
			}
		} catch (err: unknown) {
			flushSceneUnderstandDraft(nodeId)
			clearSceneUnderstandDraftSchedule(nodeId)
			const abortName = err instanceof Error ? err.name : ''
			if (abortName === 'AbortError') {
				applySettingsPatch(nodeId, {
					status: 'canceled',
					message: t('aiworkflow.runtime.understandingCanceledMessage'),
					statusText: t('aiworkflow.runtime.understandingRequestCanceled'),
					progress: 0
				})
				return
			}
			const message = getErrorMessage(err)
			console.error('[SceneUnderstandingController] run failed', err)
			applySettingsPatch(nodeId, {
				status: 'error',
				message,
				statusText: t('aiworkflow.runtime.understandingRequestError'),
				progress: 100
			})
			options.pushToast(
				t(
					mode === 'scene-lighting'
						? 'aiworkflow.runtime.lightingFailedWithError'
						: 'aiworkflow.runtime.understandingFailedWithError',
					{ error: message }
				),
				'warn'
			)
		} finally {
			if (controller && sceneUnderstandRunControllers.get(nodeId) === controller) {
				sceneUnderstandRunControllers.delete(nodeId)
			}
		}
	}

	const cleanupSceneUnderstandingRuntime = () => {
		for (const timer of sceneUnderstandDraftTimers.values()) window.clearTimeout(timer)
		sceneUnderstandDraftTimers.clear()
		sceneUnderstandDraftBuffers.clear()
		sceneUnderstandReasoningBuffers.clear()
		for (const controller of sceneUnderstandRunControllers.values()) controller.abort()
		sceneUnderstandRunControllers.clear()
	}

	return {
		resetSceneUnderstandingNodeState,
		onNodeCancelSceneUnderstanding,
		onNodeSceneUnderstandingSettingsUpdate,
		onNodeRequestSceneModels,
		onNodeRunSceneUnderstanding,
		cleanupSceneUnderstandingRuntime
	}
}
