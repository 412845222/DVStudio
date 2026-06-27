import { getErrorMessage, isRecord } from '../../../../types/utils'
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
}) => {
	const sceneUnderstandRunControllers = new Map<string, AbortController>()
	const sceneUnderstandDraftBuffers = new Map<string, string>()
	const sceneUnderstandDraftTimers = new Map<string, number>()
	const sceneUnderstandReasoningBuffers = new Map<string, string>()

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

	const getNodeRecord = (nodeId: string) =>
		options.store.state.nodesById[nodeId] as Record<string, unknown> | undefined

	const getNodeSceneUnderstandingSettings = (nodeId: string): Record<string, unknown> | null => {
		const node = getNodeRecord(nodeId)
		const settings = node?.sceneUnderstandingSettings
		return isRecord(settings) ? settings : null
	}

	const flushSceneUnderstandDraft = (nodeId: string, rawOverride?: string) => {
		const settings = getNodeSceneUnderstandingSettings(nodeId)
		const raw =
			typeof rawOverride === 'string'
				? rawOverride
				: (sceneUnderstandDraftBuffers.get(nodeId) ??
					(typeof settings?.rawOutput === 'string' ? settings.rawOutput : ''))
		sceneUnderstandDraftBuffers.set(nodeId, raw)
		options.store.commit('setNodeSceneUnderstandingSettings', {
			nodeId,
			sceneUnderstandingSettings: {
				outputJson: formatSceneUnderstandDraftOutput(raw),
				rawOutput: raw
			}
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
		options.store.commit('setNodeSceneUnderstandingSettings', {
			nodeId,
			sceneUnderstandingSettings: {
				status: 'idle',
				message: '等待运行场景理解。',
				statusText: '状态已重置，可重新发起场景理解。',
				progress: 0,
				provider: undefined,
				providerStatusText: undefined,
				remoteStatusCode: undefined,
				outputJson: '',
				rawOutput: '',
				resultSummary: '',
				reasoningText: '',
				rewriteUsed: false,
				rewriteAttempts: 0,
				mock: false
			}
		})
	}

	const onNodeCancelSceneUnderstanding = (nodeId: string) => {
		const node = getNodeRecord(nodeId)
		if (!node || node.type !== 'scene-understanding') return
		stopSceneUnderstandRun(nodeId)
		flushSceneUnderstandDraft(nodeId)
		clearSceneUnderstandDraftSchedule(nodeId)
		sceneUnderstandReasoningBuffers.delete(nodeId)
		options.store.commit('setNodeSceneUnderstandingSettings', {
			nodeId,
			sceneUnderstandingSettings: {
				status: 'canceled',
				message: '已终止当前场景理解请求。',
				statusText: 'SSE 请求已终止，可重新运行。',
				progress: 0,
				reasoningText: ''
			}
		})
	}

	const sceneUnderstandPhaseState = (phase: string, message: string, contentLength = 0) => {
		const normalized = String(phase || '')
			.trim()
			.toLowerCase()
		if (normalized === 'start') return { progress: 5, statusText: message || '任务已启动。' }
		if (normalized === 'started') return { progress: 8, statusText: message || '场景理解已开始。' }
		if (normalized === 'prepare_input')
			return { progress: 15, statusText: message || '正在规范化输入图片。' }
		if (normalized === 'connect')
			return { progress: 25, statusText: message || '正在连接模型服务。' }
		if (normalized === 'submit')
			return { progress: 35, statusText: message || '已提交请求，等待远端服务接收。' }
		if (normalized === 'thinking')
			return { progress: 40, statusText: message || '模型正在深度思考分析图片...' }
		if (normalized === 'writing')
			return { progress: 72, statusText: message || '思考完成，正在输出结构化JSON...' }
		if (normalized === 'streaming') {
			const estimatedProgress = Math.min(80, 78 + Math.min(12, Math.floor(contentLength / 200)))
			return { progress: estimatedProgress, statusText: message || '远端服务正在生成内容...' }
		}
		if (normalized === 'continue')
			return { progress: 85, statusText: message || '输出较长，正在续写后续内容...' }
		if (normalized === 'parse')
			return { progress: 90, statusText: message || '正在解析远端返回 JSON。' }
		if (normalized === 'rewrite')
			return { progress: 80, statusText: message || '正在请求模型紧凑重写 JSON。' }
		if (normalized === 'done') return { progress: 100, statusText: message || '场景理解完成。' }
		if (normalized === 'canceled') return { progress: 0, statusText: message || '场景理解已终止。' }
		if (normalized === 'error') return { progress: 100, statusText: message || '场景理解失败。' }
		return { progress: 40, statusText: message || '正在等待远端服务响应。' }
	}

	const onNodeSceneUnderstandingSettingsUpdate = (nodeId: string, payload: Record<string, unknown>) => {
		const currentSettings = getNodeSceneUnderstandingSettings(nodeId)
		const isRunning = currentSettings?.status === 'running'
		let safePayload = payload
		if (isRunning) {
			safePayload = { ...payload }
			if ('outputJson' in payload) delete safePayload.outputJson
			if ('rawOutput' in payload) delete safePayload.rawOutput
			if ('resultSummary' in payload) delete safePayload.resultSummary
			if ('message' in payload && !('statusText' in payload) && !('progress' in payload)) delete safePayload.message
			const newStatus = payload.status
			if (typeof newStatus === 'string' && !['running', 'completed', 'error', 'canceled'].includes(newStatus)) {
				delete safePayload.status
			}
		}
		options.store.commit('setNodeSceneUnderstandingSettings', {
			nodeId,
			sceneUnderstandingSettings: safePayload
		})
	}

	const onNodeRequestSceneModels = async (nodeId: string) => {
		const node = getNodeRecord(nodeId)
		if (!node || node.type !== 'scene-understanding') return
		const settings = getNodeSceneUnderstandingSettings(nodeId)
		if (settings?.status === 'running') return
		const mode = settings?.mode === 'scene-lighting' ? 'scene-lighting' : 'scene-layout'
		options.store.commit('setNodeSceneUnderstandingSettings', {
			nodeId,
			sceneUnderstandingSettings: {
				status: 'loading-models',
				message: mode === 'scene-lighting' ? '正在加载灯光理解模型列表…' : '正在加载模型列表…'
			}
		})
		try {
			const res =
				mode === 'scene-lighting'
					? await options.sceneSkillService.listSceneLightingModels()
					: await options.sceneSkillService.listSceneUnderstandModels()
			if (!res.ok) {
				options.store.commit('setNodeSceneUnderstandingSettings', {
					nodeId,
					sceneUnderstandingSettings: { status: 'error', message: res.error || '读取模型列表失败' }
				})
				options.pushToast(`场景理解模型列表读取失败：${res.error || 'unknown'}`, 'warn')
				return
			}
			const models = Array.isArray(res.models) ? res.models : []
			const fallbackModel = String(res.defaultModel || models[0]?.id || '').trim()
			options.store.commit('setNodeSceneUnderstandingSettings', {
				nodeId,
				sceneUnderstandingSettings: {
					availableModels: models,
					selectedModel: String(
						(typeof settings?.selectedModel === 'string' ? settings.selectedModel : '') ||
							fallbackModel ||
							''
					).trim(),
					status: 'idle',
					message: models.length ? `已加载 ${models.length} 个模型。` : '当前没有可用模型。',
					statusText: models.length
						? mode === 'scene-lighting'
							? '灯光理解模型列表已刷新。'
							: '模型列表已刷新，可直接发起场景理解。'
						: '未发现可用模型。'
				}
			})
		} catch (err: unknown) {
			const message = getErrorMessage(err)
			options.store.commit('setNodeSceneUnderstandingSettings', {
				nodeId,
				sceneUnderstandingSettings: { status: 'error', message }
			})
			options.pushToast(`场景理解模型列表读取失败：${message}`, 'warn')
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
		if (!imageUrl) {
			options.pushToast(
				mode === 'scene-lighting' ? '场景灯光理解节点缺少图片输入。' : '场景理解节点缺少图片输入。',
				'warn'
			)
			return
		}
		if (mode === 'scene-lighting' && !layoutJson) {
			options.pushToast('场景灯光理解需要布局 JSON，请先运行场景理解或连接外部布局 JSON 输入。', 'warn')
			return
		}
		if (!model) {
			options.pushToast(
				mode === 'scene-lighting' ? '请先选择灯光理解模型。' : '请先选择场景理解模型。',
				'warn'
			)
			return
		}

		options.store.commit('setNodeSceneUnderstandingSettings', {
			nodeId,
			sceneUnderstandingSettings: {
				status: 'running',
				message: mode === 'scene-lighting' ? '正在调用场景灯光理解技能…' : '正在调用场景理解技能…',
				statusText:
					mode === 'scene-lighting'
						? '准备上传参考图和布局 JSON 并请求远端服务…'
						: '准备上传输入图片并请求远端服务…',
				progress: 4,
				provider: 'volcengine-ark',
				providerStatusText: '请求尚未发送',
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
			}
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
				options.store.commit('setNodeSceneUnderstandingSettings', {
					nodeId,
					sceneUnderstandingSettings: { status: 'error', message: '场景理解输入图片无效。' }
				})
				options.pushToast('场景理解输入图片无效。', 'warn')
				return
			}
			const firstImage = normalizedImageInputs[0]
			const payload = {
				nodeId,
				model,
				promptText,
				...(mode === 'scene-lighting' ? { layoutJson } : {}),
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
					options.store.commit('setNodeSceneUnderstandingSettings', {
						nodeId,
						sceneUnderstandingSettings: {
							status: 'error',
							message: ev.error.message || '场景理解失败',
							statusText: 'SSE 事件解析失败。',
							progress: 100
						}
					})
					options.pushToast(
						`${mode === 'scene-lighting' ? '场景灯光理解' : '场景理解'}失败：${ev.error.message || 'unknown'}`,
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
						const displayText = nextReasoning.length > maxDisplayLen
							? `...${nextReasoning.slice(-maxDisplayLen)}`
							: nextReasoning
						options.store.commit('setNodeSceneUnderstandingSettings', {
							nodeId,
							sceneUnderstandingSettings: {
								reasoningText: displayText
							}
						})
					}
					continue
				}

				if (msg.type === 'agentToUi/taskStatus') {
					const payload = msg.payload as Record<string, unknown>
					const phase = typeof payload.phase === 'string' ? payload.phase : ''
					const phaseMessage = typeof payload.message === 'string' ? payload.message : ''
					const details = isRecord(payload.details) ? payload.details : ({} as Record<string, unknown>)
					const resetDraft = details.resetDraft === true
					const currentSettings = getNodeSceneUnderstandingSettings(nodeId)
					const draftLen = sceneUnderstandDraftBuffers.get(nodeId)?.length ?? 0
					const currentRawLen = String(currentSettings?.rawOutput ?? '').length + draftLen
					const nextState = sceneUnderstandPhaseState(phase, phaseMessage, currentRawLen)
					if (resetDraft) {
						clearSceneUnderstandDraftSchedule(nodeId)
						sceneUnderstandDraftBuffers.set(nodeId, '')
					}
					options.store.commit('setNodeSceneUnderstandingSettings', {
						nodeId,
						sceneUnderstandingSettings: {
							status:
								phase === 'done'
									? 'completed'
									: phase === 'error'
										? 'error'
										: phase === 'canceled'
											? 'canceled'
											: 'running',
							message: phaseMessage || '正在等待远端服务响应…',
							statusText: nextState.statusText,
							progress: nextState.progress,
							provider: 'volcengine-ark',
							providerStatusText: phaseMessage || '远端服务处理中',
							...(resetDraft ? { outputJson: '', rawOutput: '' } : {})
						}
					})
					continue
				}

				if (msg.type === 'agentToUi/error') {
					flushSceneUnderstandDraft(nodeId)
					clearSceneUnderstandDraftSchedule(nodeId)
					const payloadErr = msg.payload as Record<string, unknown>
					const details = isRecord(payloadErr.details) ? payloadErr.details : ({} as Record<string, unknown>)
					const settings = getNodeSceneUnderstandingSettings(nodeId)
					options.store.commit('setNodeSceneUnderstandingSettings', {
						nodeId,
						sceneUnderstandingSettings: {
							status: 'error',
							message: typeof payloadErr.message === 'string' ? payloadErr.message : '场景理解失败',
							statusText: String(
								typeof details.providerStatusText === 'string'
									? details.providerStatusText
									: payloadErr.message ?? '远端服务返回错误'
							),
							progress: 100,
							provider: typeof details.provider === 'string' ? details.provider : 'volcengine-ark',
							providerStatusText:
								typeof details.providerStatusText === 'string'
									? details.providerStatusText
									: undefined,
							remoteStatusCode: Number.isFinite(
								Number(details.remoteStatusCode ?? details.status)
							)
								? Number(details.remoteStatusCode ?? details.status)
								: undefined,
							rawOutput: typeof settings?.rawOutput === 'string' ? settings.rawOutput : ''
						}
					})
					options.pushToast(
						`${mode === 'scene-lighting' ? '场景灯光理解' : '场景理解'}失败：${String(payloadErr.message ?? 'unknown')}`,
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
						options.store.commit('setNodeSceneUnderstandingSettings', {
							nodeId,
							sceneUnderstandingSettings: {
								status: 'completed',
								message:
									typeof payloadResult.summary === 'string'
										? payloadResult.summary
										: '场景理解完成。',
								statusText:
									typeof payloadResult.providerStatusText === 'string'
										? payloadResult.providerStatusText
										: '远端服务已返回结果。',
								progress: 100,
								outputJson:
									typeof payloadResult.outputJson === 'string' ? payloadResult.outputJson : '',
								rawOutput:
									typeof payloadResult.rawOutput === 'string' ? payloadResult.rawOutput : '',
								resultSummary:
									typeof payloadResult.summary === 'string' ? payloadResult.summary : '',
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
								mock: payloadResult.mock === true
							}
						})
						options.pushToast(
							`${mode === 'scene-lighting' ? '场景灯光理解' : '场景理解'}完成${payloadResult.mock === true ? '（Mock）' : ''}。`,
							'info'
						)
					} catch (parseErr: unknown) {
						const parseMsg = getErrorMessage(parseErr)
						options.store.commit('setNodeSceneUnderstandingSettings', {
							nodeId,
							sceneUnderstandingSettings: {
								status: 'error',
								message: `场景理解结果解析失败：${parseMsg}`,
								statusText: '流式返回完成，但最终 JSON 解析失败。',
								progress: 100
							}
						})
						options.pushToast(
							`${mode === 'scene-lighting' ? '场景灯光理解' : '场景理解'}失败：结果解析失败`,
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
				options.store.commit('setNodeSceneUnderstandingSettings', {
					nodeId,
					sceneUnderstandingSettings: {
						status: 'canceled',
						message: '已终止当前场景理解请求。',
						statusText: '请求已取消。',
						progress: 0
					}
				})
				return
			}
			const message = getErrorMessage(err)
			options.store.commit('setNodeSceneUnderstandingSettings', {
				nodeId,
				sceneUnderstandingSettings: {
					status: 'error',
					message,
					statusText: '请求链路发生异常，未获得远端可解析响应。',
					progress: 100
				}
			})
			options.pushToast(
				`${mode === 'scene-lighting' ? '场景灯光理解' : '场景理解'}失败：${message}`,
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
