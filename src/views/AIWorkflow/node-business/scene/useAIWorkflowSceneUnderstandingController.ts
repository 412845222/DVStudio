import { getErrorMessage, isRecord } from '../../../../types/utils'
import { t } from '../../../../i18n'
import type {
	SceneUnderstandModelsResponse,
	SceneLightingModelsResponse,
	SceneUnderstandStreamEvent,
	SceneLightingStreamEvent,
	SceneUnderstandImageInput,
	SceneDirectorInput
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
				sceneType?: 'auto' | 'indoor' | 'outdoor' | 'director-multi-scene'
				sceneInputs?: SceneDirectorInput[]
				/** 导演两阶段：'shell' 户型壳 | 'room-detail' 单房间物体 */
				directorPhase?: 'shell' | 'room-detail'
				/** room-detail 阶段房间固定信息 */
				roomContext?: {
					roomId: string
					label: string
					sourceSceneIndex: number
					roomShell: Record<string, unknown>
					openings: unknown[]
				}
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
	/** 导演多场景工作台：按场景（房间）分组收集图片 */
	connectedDirectorSceneInputs: (nodeId: string) => Array<{
		sceneIndex: number
		anchorId: string
		label?: string
		images: Array<{ url: string; width?: number; height?: number }>
	}>
	connectedImageInputUrl: (nodeId: string, anchorId: string) => string | null
	connectedTextInputValue: (nodeId: string, anchorId: string) => string
	normalizeMeshyImageInputValue: (value: string, defaultName: string) => Promise<string>
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	updateNodeData: (nodeId: string, patch: Record<string, any>) => void
	/** 获取当前项目 ID（用于硬存盘） */
	getProjectId: () => number | undefined
	/** 上传资源到项目目录（用于硬存盘写入 JSON 文件） */
	uploadProjectAsset?: (payload: {
		projectId: number
		name: string
		arrayBuffer: ArrayBuffer
		contentType?: string
		subPath?: string
	}) => Promise<{ ok: boolean; error?: string } | null>
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

	const applySettingsPatch = (
		nodeId: string,
		patch: Record<string, unknown>,
		skipEngineUpdate = false
	) => {
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

		// P2 修复：流式期间高频 flush 时跳过 updateNodeData，
		// 避免引擎 change 事件触发 hydrateDraft 反向覆盖 Vuex 中最新的 rawOutput
		if (!skipEngineUpdate) {
			try {
				options.updateNodeData(nodeId, { sceneUnderstandingSettings: mergedSettings })
			} catch (err) {
				console.error('[SceneUnderstandingController] updateNodeData failed', err)
			}
		}
	}

	/**
	 * 构造硬存盘文件的完整磁盘路径
	 * 与后端 resolveAssetTargetDir 一致：{projectRoot}/Content/Media/scene-understanding/{nodeId}/{taskId}.json
	 */
	const buildPersistFilePath = (projectRoot: string, nodeId: string, taskId: string): string => {
		const sep = '\\'
		return [projectRoot, 'Content', 'Media', 'scene-understanding', nodeId, `${taskId}.json`].join(
			sep
		)
	}

	/**
	 * 将场景理解识别结果硬存盘到项目目录
	 * 路径：{projectRoot}/Content/Media/scene-understanding/{nodeId}/{taskId}.json
	 */
	const persistSceneUnderstandingJson = async (
		nodeId: string,
		taskId: string,
		payload: Record<string, unknown>
	): Promise<{ ok: boolean; error?: string }> => {
		const projectId = options.getProjectId?.()
		if (!projectId) {
			return { ok: false, error: 'no projectId' }
		}
		if (typeof options.uploadProjectAsset !== 'function') {
			return { ok: false, error: 'uploadProjectAsset not available' }
		}
		try {
			const textEncoder = new TextEncoder()
			const jsonString = JSON.stringify(payload, null, 2)
			const arrayBuffer = textEncoder.encode(jsonString).buffer

			const result = await options.uploadProjectAsset({
				projectId,
				name: `${taskId}.json`,
				arrayBuffer,
				contentType: 'application/json',
				subPath: `scene-understanding/${nodeId}`
			})

			if (!result) {
				return { ok: false, error: 'uploadProjectAsset unavailable (dweb not ready)' }
			}
			return { ok: result.ok, error: result.error }
		} catch (err) {
			return { ok: false, error: getErrorMessage(err) }
		}
	}

	/** 节流：避免高频 flush 时频繁写盘 */
	const persistThrottleTimers = new Map<string, number>()
	const lastPersistedRawLen = new Map<string, number>()

	/** 导演工作区：构造工作区内某文件的磁盘路径 */
	const buildWorkspaceFilePath = (
		projectRoot: string,
		nodeId: string,
		fileName: string
	): string => {
		const sep = '\\'
		return [
			projectRoot,
			'Content',
			'Media',
			'scene-understanding',
			nodeId,
			'workspace',
			fileName
		].join(sep)
	}

	/** 导演工作区：解析项目根目录（带缓存） */
	const projectRootCache = new Map<number, string>()
	const resolveProjectRoot = async (projectId: number): Promise<string> => {
		const cached = projectRootCache.get(projectId)
		if (cached) return cached
		try {
			const root = await window.dweb?.aiworkflow?.getProjectRootById?.({ projectId })
			if (root) {
				projectRootCache.set(projectId, root as string)
				return root as string
			}
		} catch (e) {
			console.warn('[SceneUnderstandingController] getProjectRootById failed', e)
		}
		return ''
	}

	/** 导演工作区：写入一个工作区文件（shell.json / room-*.json） */
	const persistWorkspaceFile = async (
		nodeId: string,
		fileName: string,
		payload: Record<string, unknown>
	): Promise<{ ok: boolean; error?: string }> => {
		const projectId = options.getProjectId?.()
		if (!projectId) return { ok: false, error: 'no projectId' }
		if (typeof options.uploadProjectAsset !== 'function')
			return { ok: false, error: 'uploadProjectAsset not available' }
		try {
			const textEncoder = new TextEncoder()
			const arrayBuffer = textEncoder.encode(JSON.stringify(payload, null, 2)).buffer
			const result = await options.uploadProjectAsset({
				projectId,
				name: fileName,
				arrayBuffer,
				contentType: 'application/json',
				subPath: `scene-understanding/${nodeId}/workspace`
			})
			if (!result) return { ok: false, error: 'uploadProjectAsset unavailable' }
			return { ok: result.ok, error: result.error }
		} catch (err) {
			return { ok: false, error: getErrorMessage(err) }
		}
	}

	const throttledPersist = (
		nodeId: string,
		taskId: string,
		payload: Record<string, unknown>,
		minDelta = 500
	) => {
		const rawLen = typeof payload.rawOutput === 'string' ? payload.rawOutput.length : 0
		const lastLen = lastPersistedRawLen.get(nodeId) ?? 0
		// 只有当 rawOutput 变化超过 minDelta 时才真正写盘
		if (Math.abs(rawLen - lastLen) < minDelta) return

		const existing = persistThrottleTimers.get(nodeId)
		if (existing != null) window.clearTimeout(existing)

		const timer = window.setTimeout(async () => {
			persistThrottleTimers.delete(nodeId)
			lastPersistedRawLen.set(nodeId, rawLen)
			const r = await persistSceneUnderstandingJson(nodeId, taskId, payload)
			if (!r.ok) {
				console.warn('[SceneUnderstandingController] persistSceneUnderstandingJson failed', r.error)
			}
		}, 300)
		persistThrottleTimers.set(nodeId, timer)
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

	/**
	 * 修复被截断的 JSON 文本，尽可能挽救已生成的部分数据。
	 * 策略：
	 * 1. 找到第一个 '{' 或 '[' 作为 JSON 起始
	 * 2. 从后往前移除不完整的键值对/字符串
	 * 3. 补全未闭合的括号和引号
	 */
	const repairTruncatedJson = (raw: string): string | null => {
		const text = String(raw ?? '')
			.replace(/\r\n/g, '\n')
			.replace(/\r/g, '\n')
			.trim()
		if (!text) return null
		// 找到 JSON 起始位置
		const firstBrace = text.indexOf('{')
		const firstBracket = text.indexOf('[')
		let start = -1
		if (firstBrace === -1) start = firstBracket
		else if (firstBracket === -1) start = firstBrace
		else start = Math.min(firstBrace, firstBracket)
		if (start === -1) return null
		let candidate = text.slice(start)

		// 最多尝试修复 50 次（每次回退一步）
		for (let attempt = 0; attempt < 50 && candidate.length > 0; attempt += 1) {
			try {
				JSON.parse(candidate)
				return candidate
			} catch {
				// 尝试补全括号
				const openBraces = (candidate.match(/{/g) || []).length
				const closeBraces = (candidate.match(/}/g) || []).length
				const openBrackets = (candidate.match(/\[/g) || []).length
				const closeBrackets = (candidate.match(/\]/g) || []).length
				const quoteCount = (candidate.match(/"/g) || []).length
				let repaired = candidate

				// 如果在字符串内部（引号数为奇数），先闭合字符串
				if (quoteCount % 2 === 1) {
					// 找到最后一个引号的位置，截断到那里
					const lastQuote = repaired.lastIndexOf('"')
					if (lastQuote > 0) {
						repaired = repaired.slice(0, lastQuote) + '"'
					}
				}

				// 补全方括号
				const needBrackets = openBrackets - closeBrackets
				if (needBrackets > 0) {
					repaired = repaired + ']'.repeat(needBrackets)
				}
				// 补全花括号
				const needBraces = openBraces - closeBraces
				if (needBraces > 0) {
					repaired = repaired + '}'.repeat(needBraces)
				}

				try {
					JSON.parse(repaired)
					return repaired
				} catch {
					// 回退：移除末尾不完整的 token
					// 先去掉末尾的逗号、冒号等
					let trimmed = repaired.replace(/[,:[\s]+$/, '')
					// 如果末尾是不完整的字符串（以 " 开头但没闭合），截断到最后一个完整引号
					if (/^"[^"]*$/.test(trimmed.slice(-20))) {
						const lastQuote = trimmed.lastIndexOf('"')
						if (lastQuote > 0) trimmed = trimmed.slice(0, lastQuote) + '"'
					}
					// 如果末尾是不完整的键值对，截断到最后一个完整的逗号或括号
					const lastComma = trimmed.lastIndexOf(',')
					const lastColon = trimmed.lastIndexOf(':')
					const cutPoint = Math.max(lastComma, lastColon)
					if (cutPoint > 0 && cutPoint < trimmed.length - 1) {
						trimmed = trimmed.slice(0, cutPoint)
					}
					candidate = trimmed
				}
			}
		}
		return null
	}

	const flushSceneUnderstandDraft = (nodeId: string, rawOverride?: string) => {
		const settings = getNodeSceneUnderstandingSettings(nodeId)
		const raw =
			typeof rawOverride === 'string'
				? rawOverride
				: (sceneUnderstandDraftBuffers.get(nodeId) ??
					(typeof settings?.rawOutput === 'string' ? settings.rawOutput : ''))
		sceneUnderstandDraftBuffers.set(nodeId, raw)
		// P2 修复：流式 flush 只更新 Vuex，不触发引擎更新，避免反向覆盖 rawOutput
		applySettingsPatch(
			nodeId,
			{
				outputJson: formatSceneUnderstandDraftOutput(raw),
				rawOutput: raw
			},
			true
		)

		// 硬存盘：流式期间增量写盘（节流，避免频繁 IO）
		const taskId =
			typeof settings?.persistedTaskId === 'string' ? settings.persistedTaskId : undefined
		if (taskId && settings?.persistJsonToDisk) {
			throttledPersist(nodeId, taskId, {
				taskId,
				nodeId,
				status: 'running',
				rawOutput: raw
			})
		}
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

	const onNodeSceneUnderstandingSettingsUpdate = async (
		nodeId: string,
		payload: Record<string, unknown>
	) => {
		// 清空信号：重置 taskId 和文件内容
		if (payload._persistClear === true) {
			const currentSettings = getNodeSceneUnderstandingSettings(nodeId)
			const existingTaskId =
				typeof currentSettings?.persistedTaskId === 'string'
					? currentSettings.persistedTaskId
					: undefined
			const existingFilePath =
				typeof currentSettings?.persistedFilePath === 'string'
					? currentSettings.persistedFilePath
					: undefined

			// 不创建新文件，直接覆写当前文件内容为空，保持 taskId 和文件名不变
			if (existingTaskId) {
				persistSceneUnderstandingJson(nodeId, existingTaskId, {
					taskId: existingTaskId,
					nodeId,
					clearedAt: Date.now(),
					status: 'idle',
					rawOutput: '',
					outputJson: ''
				})
			}
			// 清空 settings 中的输出数据，但保留 taskId 和 filePath
			applySettingsPatch(
				nodeId,
				{
					rawOutput: '',
					outputJson: '',
					directorRooms: undefined,
					directorConnections: undefined
				},
				true
			)
			return
		}

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
		// 修复：persistJsonToDisk 是纯 UI 状态，不需要同步到引擎，
		// 否则引擎 hydrateDraft 会用不含该字段的旧数据反向覆盖 store，导致按钮状态丢失
		const isPureUiToggle =
			Object.keys(safePayload).length === 1 && 'persistJsonToDisk' in safePayload
		applySettingsPatch(nodeId, safePayload, isPureUiToggle)

		// 硬存盘：点击开启时立即创建文件，而非等待 run 开始
		if (isPureUiToggle && safePayload.persistJsonToDisk === true) {
			// 如果已有 taskId，不新建，复用已有文件
			const existingSettings = getNodeSceneUnderstandingSettings(nodeId)
			const existingTaskId =
				typeof existingSettings?.persistedTaskId === 'string'
					? existingSettings.persistedTaskId
					: undefined
			const existingFilePath =
				typeof existingSettings?.persistedFilePath === 'string'
					? existingSettings.persistedFilePath
					: undefined
			const taskId = existingTaskId || `task_${Date.now()}`
			let filePath = existingFilePath || ''

			if (!filePath) {
				const projectId = options.getProjectId?.()
				if (projectId && typeof window?.dweb?.aiworkflow?.getProjectRootById === 'function') {
					try {
						const root = await window.dweb.aiworkflow.getProjectRootById({ projectId })
						if (root) filePath = buildPersistFilePath(root, nodeId, taskId)
					} catch (e) {
						console.warn('[SceneUnderstandingController] getProjectRootById failed (toggle)', e)
					}
				}
				if (!filePath) filePath = `scene-understanding/${nodeId}/${taskId}.json`
			}

			applySettingsPatch(nodeId, { persistedTaskId: taskId, persistedFilePath: filePath }, true)
			const currentSettings = getNodeSceneUnderstandingSettings(nodeId) ?? {}
			const currentRaw =
				typeof currentSettings.rawOutput === 'string' ? currentSettings.rawOutput : ''
			persistSceneUnderstandingJson(nodeId, taskId, {
				taskId,
				nodeId,
				createdAt: Date.now(),
				status: currentSettings.status === 'running' ? 'running' : 'idle',
				rawOutput: currentRaw,
				outputJson: typeof currentSettings.outputJson === 'string' ? currentSettings.outputJson : ''
			}).then((r) => {
				if (r.ok) {
					console.log('[SceneUnderstandingController] persist file ready', {
						nodeId,
						taskId,
						filePath
					})
				} else {
					console.warn('[SceneUnderstandingController] persist file creation failed', r.error)
				}
			})
		}
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

	/** 房间局部坐标 → 全局坐标（与后端 applyRoomTransform 一致，绕 Y 轴旋转后平移） */
	const applyDirectorRoomTransform = (
		lx: number,
		lz: number,
		origin: { x?: number; z?: number },
		yawDeg: number
	): { x: number; z: number } => {
		const ox = Number(origin?.x ?? 0) || 0
		const oz = Number(origin?.z ?? 0) || 0
		const theta = ((Number(yawDeg) || 0) * Math.PI) / 180
		const cos = Math.cos(theta)
		const sin = Math.sin(theta)
		const x = Number(lx) || 0
		const z = Number(lz) || 0
		return { x: ox + x * cos + z * sin, z: oz - x * sin + z * cos }
	}
	const applyDirectorRoomYaw = (localYaw: number, roomYaw: number): number => {
		let yaw = (Number(localYaw) || 0) + (Number(roomYaw) || 0)
		while (yaw > 180) yaw -= 360
		while (yaw < -180) yaw += 360
		return yaw
	}

	/**
	 * 导演两阶段中的单阶段流式执行：累积文本，返回解析结果。
	 * 不做最终 completed 设置（由编排方统一处理）。
	 */
	const runDirectorPhase = async (
		nodeId: string,
		payload: Parameters<typeof options.sceneSkillService.streamSceneUnderstand>[0],
		opts: { statusText: string; progress: number }
	): Promise<{ parsed: Record<string, unknown> | null; raw: string; outputJson: string }> => {
		clearSceneUnderstandDraftSchedule(nodeId)
		sceneUnderstandDraftBuffers.set(nodeId, '')
		sceneUnderstandReasoningBuffers.set(nodeId, '')
		applySettingsPatch(nodeId, {
			status: 'running',
			statusText: opts.statusText,
			message: opts.statusText,
			progress: opts.progress
		})

		const controller = new AbortController()
		sceneUnderstandRunControllers.set(nodeId, controller)
		const stream = options.sceneSkillService.streamSceneUnderstand(payload, controller.signal)

		let chatParsed: Record<string, unknown> | null = null
		let chatOutputJson = ''
		let phaseError: Error | null = null

		for await (const ev of stream) {
			if (ev.type === 'done') break
			if (ev.type === 'error') {
				phaseError = new Error(ev.error?.message || 'director phase error')
				break
			}
			if (ev.type !== 'msg') continue
			const msg = ev.message
			if (msg.type === 'agentToUi/reasoning') {
				// 思考过程累积并显示
				const payloadRec = msg.payload as Record<string, unknown>
				const deltaText = typeof payloadRec.text === 'string' ? payloadRec.text : ''
				if (deltaText) {
					const prevReasoning = sceneUnderstandReasoningBuffers.get(nodeId) ?? ''
					const nextReasoning = `${prevReasoning}${deltaText}`
					sceneUnderstandReasoningBuffers.set(nodeId, nextReasoning)
					const maxDisplayLen = 2000
					const displayText =
						nextReasoning.length > maxDisplayLen
							? `...${nextReasoning.slice(-maxDisplayLen)}`
							: nextReasoning
					applySettingsPatch(
						nodeId,
						{
							status: 'running',
							statusText: opts.statusText,
							reasoningText: displayText
						},
						true
					)
				}
				continue
			}
			if (msg.type === 'agentToUi/taskStatus') {
				// 后端阶段状态消息：更新进度提示，但不覆盖两阶段的整体状态
				const payloadRec = msg.payload as Record<string, unknown>
				const phaseMessage = typeof payloadRec.message === 'string' ? payloadRec.message : ''
				if (phaseMessage) {
					applySettingsPatch(
						nodeId,
						{
							status: 'running',
							statusText: opts.statusText,
							providerStatusText: phaseMessage
						},
						true
					)
				}
				continue
			}
			if (msg.type === 'agentToUi/text') {
				const payloadRec = msg.payload as Record<string, unknown>
				const deltaText = typeof payloadRec.text === 'string' ? payloadRec.text : ''
				if (deltaText) {
					const prev =
						sceneUnderstandDraftBuffers.get(nodeId) ??
						(typeof getNodeSceneUnderstandingSettings(nodeId)?.rawOutput === 'string'
							? (getNodeSceneUnderstandingSettings(nodeId)?.rawOutput as string)
							: '')
					scheduleSceneUnderstandDraftFlush(nodeId, `${prev}${deltaText}`)
				}
				continue
			}
			if (msg.type === 'agentToUi/chatMessage') {
				const payloadRec = msg.payload as Record<string, unknown>
				const contentStr = typeof payloadRec.content === 'string' ? payloadRec.content : '{}'
				try {
					const result = JSON.parse(contentStr) as Record<string, unknown>
					const oj = typeof result.outputJson === 'string' ? result.outputJson : ''
					if (oj) {
						try {
							chatParsed = JSON.parse(oj) as Record<string, unknown>
							chatOutputJson = oj
						} catch {
							chatParsed = null
						}
					}
				} catch {
					/* 忽略 content 解析失败，走 raw 兜底 */
				}
				continue
			}
			if (msg.type === 'agentToUi/error') {
				const payloadRec = msg.payload as Record<string, unknown>
				phaseError = new Error(String(payloadRec.message ?? 'director phase error'))
				break
			}
		}

		flushSceneUnderstandDraft(nodeId)
		const accumulatedRaw = sceneUnderstandDraftBuffers.get(nodeId) ?? ''

		if (phaseError) {
			if (phaseError.name === 'AbortError') throw phaseError
			throw phaseError
		}

		// 多级兜底：chatMessage outputJson → 累积 raw → repair
		let parsed = chatParsed
		let outputJson = chatOutputJson
		if (!parsed && accumulatedRaw) {
			try {
				parsed = JSON.parse(accumulatedRaw) as Record<string, unknown>
				outputJson = accumulatedRaw
			} catch {
				const repaired = repairTruncatedJson(accumulatedRaw)
				if (repaired) {
					try {
						parsed = JSON.parse(repaired) as Record<string, unknown>
						outputJson = repaired
					} catch {
						parsed = null
					}
				}
			}
		}
		return { parsed, raw: accumulatedRaw || outputJson, outputJson }
	}

	/**
	 * 导演工作台「工作区分步流水线」：
	 * 阶段一 shell：多图 → 房间壳（存 shell.json），完成即停，等待用户逐房间触发
	 * 阶段二 room-detail：用户点击某房间 → 该房间物体（存 room-*.json）
	 * 交付 JSON 由 shell + 已完成房间动态拼接（内存/锚点，不单独落文件）
	 */
	type DirectorGroup = {
		sceneIndex: number
		anchorId?: string
		label?: string
		images: Array<{ url: string; width?: number; height?: number }>
	}
	const directorShellCache = new Map<
		string,
		{
			parsed: Record<string, unknown>
			rooms: Array<Record<string, unknown>>
			connections: unknown[]
		}
	>()
	const directorRoomCache = new Map<
		string,
		Map<string, { objects: Array<Record<string, unknown>> }>
	>()

	/** 归一化导演分组图片，返回可发送的 sceneInputs 与全局图片编号范围 */
	const normalizeDirectorGroups = async (groups: DirectorGroup[]) => {
		const sceneInputs: SceneDirectorInput[] = []
		const ranges: Array<{
			sceneIndex: number
			globalStart: number
			imageCount: number
			label?: string
		}> = []
		let acc = 1
		for (const group of groups) {
			const images: SceneUnderstandImageInput[] = []
			for (let i = 0; i < group.images.length; i += 1) {
				const raw = group.images[i]
				const normalized = await options.normalizeMeshyImageInputValue(
					raw.url,
					`director_scene_${group.sceneIndex}_${i + 1}`
				)
				if (!normalized) continue
				images.push(
					normalized.startsWith('data:')
						? { imageDataUrl: normalized, width: raw.width, height: raw.height }
						: { imageUrl: normalized, width: raw.width, height: raw.height }
				)
			}
			if (images.length) {
				sceneInputs.push({ sceneIndex: group.sceneIndex, label: group.label, images })
				ranges.push({
					sceneIndex: group.sceneIndex,
					globalStart: acc,
					imageCount: images.length,
					label: group.label
				})
				acc += images.length
			}
		}
		return { sceneInputs, ranges }
	}

	/** 依据分组原始图片数计算每个场景的全局图片起始编号（不需要网络归一化） */
	const computeGlobalStarts = (groups: DirectorGroup[]): Map<number, number> => {
		const map = new Map<number, number>()
		let acc = 1
		for (const g of groups) {
			map.set(g.sceneIndex, acc)
			acc += g.images.length
		}
		return map
	}

	/** 从已交付 outputJson 重建 shell/房间缓存（刷新后兜底） */
	const ensureDirectorShell = (nodeId: string): boolean => {
		if (directorShellCache.has(nodeId)) return true
		const settings = getNodeSceneUnderstandingSettings(nodeId)
		const raw = typeof settings?.outputJson === 'string' ? settings.outputJson : ''
		if (!raw) return false
		try {
			const parsed = JSON.parse(raw) as Record<string, unknown>
			const rooms = Array.isArray(parsed.rooms)
				? (parsed.rooms as Array<Record<string, unknown>>)
				: []
			if (rooms.length < 1) return false
			const connections = Array.isArray(parsed.connections) ? parsed.connections : []
			let roomMap = directorRoomCache.get(nodeId)
			if (!roomMap) {
				roomMap = new Map()
				directorRoomCache.set(nodeId, roomMap)
			}
			for (const room of rooms) {
				const rid = String(room.roomId ?? '')
				if (rid && Array.isArray(room.objects) && room.objects.length) {
					roomMap.set(rid, { objects: room.objects as Array<Record<string, unknown>> })
				}
			}
			directorShellCache.set(nodeId, { parsed, rooms, connections })
			return true
		} catch {
			return false
		}
	}

	/** 更新单个房间流水线状态 */
	const patchDirectorRoomStatus = (
		nodeId: string,
		roomId: string,
		patch: Record<string, unknown>
	) => {
		const settings = getNodeSceneUnderstandingSettings(nodeId)
		const current = isRecord(settings?.directorRoomStatus)
			? (settings!.directorRoomStatus as Record<string, unknown>)
			: {}
		const prev = isRecord(current[roomId]) ? (current[roomId] as Record<string, unknown>) : {}
		const next = { ...current, [roomId]: { ...prev, ...patch } }
		applySettingsPatch(nodeId, { directorRoomStatus: next }, true)
	}

	/** 动态拼接交付 JSON：shell + 已完成房间 → 完整成品（内存/锚点，不单独落文件） */
	const composeDirectorWorkbench = (nodeId: string): boolean => {
		if (!ensureDirectorShell(nodeId)) return false
		const shell = directorShellCache.get(nodeId)!
		const roomMap =
			directorRoomCache.get(nodeId) ??
			new Map<string, { objects: Array<Record<string, unknown>> }>()
		// 壳/门洞只取 shell；objects 取房间详情（局部坐标）
		const mergedRooms: Array<Record<string, unknown>> = shell.rooms.map((room) => {
			const rid = String(room.roomId ?? '')
			const detail = rid ? roomMap.get(rid) : undefined
			return { ...room, objects: detail?.objects ?? [] }
		})
		const globalObjects: Array<Record<string, unknown>> = []
		for (const room of shell.rooms) {
			const rid = String(room.roomId ?? '')
			const origin = (room.origin ?? { x: 0, z: 0 }) as { x?: number; z?: number }
			const yaw = Number(room.rotationYaw ?? 0) || 0
			const detail = rid ? roomMap.get(rid) : undefined
			for (const o of detail?.objects ?? []) {
				const pos = (o.position ?? {}) as Record<string, unknown>
				const g = applyDirectorRoomTransform(
					Number(pos.x ?? 0) || 0,
					Number(pos.z ?? 0) || 0,
					origin,
					yaw
				)
				const rot = (o.rotation ?? {}) as Record<string, unknown>
				globalObjects.push({
					...o,
					position: { x: g.x, y: Number(pos.y ?? 0) || 0, z: g.z },
					rotation: { ...rot, yaw: applyDirectorRoomYaw(Number(rot.yaw ?? 0) || 0, yaw) }
				})
			}
		}
		const finalParsed: Record<string, unknown> = {
			workbenchType: 'director-multi-scene',
			sceneType: 'indoor',
			sceneSummary:
				typeof shell.parsed.sceneSummary === 'string'
					? shell.parsed.sceneSummary
					: `共 ${mergedRooms.length} 个房间`,
			globalCoordinateSystem: shell.parsed.globalCoordinateSystem ?? {
				unit: 'meter',
				up: 'y',
				groundY: 0
			},
			rooms: mergedRooms,
			connections: shell.connections,
			objects: globalObjects
		}
		const finalJson = JSON.stringify(finalParsed, null, 2)
		applySettingsPatch(nodeId, {
			status: 'completed',
			progress: 100,
			message: t('aiworkflow.runtime.understandingResultReady'),
			statusText: t('aiworkflow.runtime.understandingResultReady'),
			outputJson: finalJson,
			rawOutput: finalJson,
			directorRooms: mergedRooms,
			directorConnections: shell.connections
		})
		return true
	}

	/** 阶段一：户型壳识别（多图），完成即停 */
	const runDirectorShellPhase = async (
		nodeId: string,
		params: { model: string; promptText: string; directorGroups: DirectorGroup[] }
	): Promise<void> => {
		const { model, promptText, directorGroups } = params
		const { sceneInputs, ranges } = await normalizeDirectorGroups(directorGroups)
		if (sceneInputs.length < 2) {
			options.pushToast(t('aiworkflow.runtime.understandingDirectorNeedScenes'), 'warn')
			return
		}
		const allImages = sceneInputs.flatMap((g) => g.images)
		const firstImage = allImages[0]
		const shellStatusText = t('aiworkflow.runtime.understandingDirectorShellPhase')
		const result = await runDirectorPhase(
			nodeId,
			{
				nodeId,
				model,
				promptText,
				sceneType: 'director-multi-scene',
				directorPhase: 'shell',
				sceneInputs,
				...(firstImage?.imageDataUrl ? { imageDataUrl: firstImage.imageDataUrl } : {}),
				...(firstImage?.imageUrl ? { imageUrl: firstImage.imageUrl } : {}),
				imageInputs: allImages
			},
			{ statusText: shellStatusText, progress: 8 }
		)
		const shellParsed = result.parsed
		const rooms = Array.isArray(shellParsed?.rooms)
			? (shellParsed!.rooms as Array<Record<string, unknown>>)
			: []
		if (rooms.length < 2) {
			throw new Error(t('aiworkflow.runtime.understandingDirectorShellFailed'))
		}
		const connections = Array.isArray(shellParsed?.connections) ? shellParsed!.connections : []

		directorShellCache.set(nodeId, { parsed: shellParsed!, rooms, connections })
		directorRoomCache.set(nodeId, new Map())

		// 写工作区 shell.json
		persistWorkspaceFile(nodeId, 'shell.json', {
			savedAt: Date.now(),
			shell: shellParsed,
			sceneImageRanges: ranges
		})

		// 工作区文件夹路径
		const projectId = options.getProjectId?.()
		let workspaceDir = ''
		if (projectId) {
			const root = await resolveProjectRoot(projectId)
			if (root) {
				workspaceDir = ['Content', 'Media', 'scene-understanding', nodeId, 'workspace'].reduce(
					(acc, seg) => `${acc}\\${seg}`,
					root
				)
			}
		}

		// 逐房间状态（默认待识别）
		const roomStatus: Record<string, unknown> = {}
		rooms.forEach((room, i) => {
			const rid = String(room.roomId ?? `room-${i + 1}`)
			roomStatus[rid] = {
				roomId: rid,
				label: String(room.label ?? `房间${i + 1}`),
				sourceSceneIndex: Number(room.sourceSceneIndex ?? i + 1),
				state: 'pending'
			}
		})

		applySettingsPatch(nodeId, {
			status: 'completed',
			progress: 100,
			message: t('aiworkflow.runtime.understandingDirectorShellCompleted'),
			statusText: t('aiworkflow.runtime.understandingDirectorShellCompleted'),
			directorShellCompleted: true,
			directorRoomStatus: roomStatus,
			directorWorkspacePath: workspaceDir || undefined,
			directorScenes: directorGroups.map((g) => ({
				sceneIndex: g.sceneIndex,
				anchorId: g.anchorId,
				label: g.label,
				imageCount: g.images.length
			}))
		})

		composeDirectorWorkbench(nodeId)
		sceneUnderstandDraftBuffers.delete(nodeId)
		sceneUnderstandRunControllers.delete(nodeId)
		options.pushToast(t('aiworkflow.runtime.understandingDirectorShellCompletedToast'), 'info')
	}

	/** 阶段二：单个房间内部物体识别（基于壳约束，无墙/地/天花） */
	const runSingleDirectorRoom = async (
		nodeId: string,
		roomId: string,
		params: { model: string; promptText: string; directorGroups: DirectorGroup[] },
		opts: { keepRunning?: boolean } = {}
	): Promise<boolean> => {
		if (!ensureDirectorShell(nodeId)) {
			options.pushToast(t('aiworkflow.runtime.understandingDirectorShellFirst'), 'warn')
			return false
		}
		const shell = directorShellCache.get(nodeId)!
		const roomIndex = shell.rooms.findIndex((r) => String(r.roomId) === roomId)
		const room = shell.rooms[roomIndex]
		if (!room) {
			return false
		}
		const { model, promptText, directorGroups } = params
		const label = String(room.label ?? roomId)
		const sourceSceneIndex = Number(room.sourceSceneIndex ?? roomIndex + 1)
		const group =
			directorGroups.find((g) => g.sceneIndex === sourceSceneIndex) ??
			directorGroups[Math.min(roomIndex, directorGroups.length - 1)]
		if (!group || !group.images.length) {
			options.pushToast(t('aiworkflow.runtime.understandingDirectorRoomNoImage', { label }), 'warn')
			return false
		}
		const { sceneInputs } = await normalizeDirectorGroups([group])
		const grp = sceneInputs[0]
		if (!grp) return false

		const total = shell.rooms.length
		const statusText = t('aiworkflow.runtime.understandingDirectorRoomPhase', {
			current: roomIndex + 1,
			total,
			label
		})
		patchDirectorRoomStatus(nodeId, roomId, { state: 'running' })
		applySettingsPatch(nodeId, { status: 'running', message: statusText, statusText }, true)

		try {
			const result = await runDirectorPhase(
				nodeId,
				{
					nodeId,
					model,
					promptText,
					sceneType: 'director-multi-scene',
					directorPhase: 'room-detail',
					roomContext: {
						roomId,
						label,
						sourceSceneIndex,
						roomShell: (room.roomShell ?? {}) as Record<string, unknown>,
						openings: Array.isArray(room.openings) ? room.openings : []
					},
					sceneInputs: [grp],
					...(grp.images[0]?.imageDataUrl ? { imageDataUrl: grp.images[0].imageDataUrl } : {}),
					...(grp.images[0]?.imageUrl ? { imageUrl: grp.images[0].imageUrl } : {}),
					imageInputs: grp.images
				},
				{ statusText, progress: 40 + Math.round((roomIndex / Math.max(1, total)) * 55) }
			)
			let objects = Array.isArray(result.parsed?.objects)
				? (result.parsed!.objects as Array<Record<string, unknown>>)
				: []

			// 局部图片编号 → 全局编号
			const starts = computeGlobalStarts(directorGroups)
			const globalStart = starts.get(grp.sceneIndex) ?? 1
			const remap = (idx: unknown): number => {
				const n = Number(idx)
				if (!Number.isFinite(n) || n < 1) return globalStart
				return globalStart + Math.floor(n) - 1
			}
			objects = objects.map((o, oi) => ({
				...o,
				id: String(o.id ?? `${roomId}-obj-${oi + 1}`),
				roomId,
				sourceSceneIndex,
				sourceImageIndex: o.sourceImageIndex != null ? remap(o.sourceImageIndex) : undefined,
				observedImageIndices: Array.isArray(o.observedImageIndices)
					? (o.observedImageIndices as unknown[]).map(remap)
					: undefined
			}))

			let roomMap = directorRoomCache.get(nodeId)
			if (!roomMap) {
				roomMap = new Map()
				directorRoomCache.set(nodeId, roomMap)
			}
			roomMap.set(roomId, { objects })

			// 单独存房间 JSON
			await persistWorkspaceFile(nodeId, `room-${roomId}.json`, {
				roomId,
				label,
				sourceSceneIndex,
				status: 'done',
				finishedAt: Date.now(),
				objectCount: objects.length,
				objects
			})

			patchDirectorRoomStatus(nodeId, roomId, {
				state: 'done',
				objectCount: objects.length,
				updatedAt: Date.now()
			})
			composeDirectorWorkbench(nodeId)
			return true
		} catch (err) {
			const isAbort = err instanceof Error && err.name === 'AbortError'
			patchDirectorRoomStatus(nodeId, roomId, { state: 'error' })
			if (isAbort) throw err
			console.warn('[SceneUnderstandingController] room detail failed', { roomId, err })
			options.pushToast(t('aiworkflow.runtime.understandingDirectorRoomFailed', { label }), 'warn')
			composeDirectorWorkbench(nodeId)
			return false
		} finally {
			sceneUnderstandDraftBuffers.delete(nodeId)
			sceneUnderstandRunControllers.delete(nodeId)
			// 单房间调用结束后把 status 从 running 归位为 completed，
			// 否则流水线按钮会因 running=true 被禁用，无法再次点击识别/重新识别。
			// 批量模式（runAllDirectorRooms）由调用方统一控制状态，传入 keepRunning 跳过此处。
			if (!opts.keepRunning) {
				applySettingsPatch(nodeId, { status: 'completed' }, true)
			}
		}
	}

	/** 一键串行识别所有未完成房间 */
	const runAllDirectorRooms = async (
		nodeId: string,
		params: { model: string; promptText: string; directorGroups: DirectorGroup[] }
	) => {
		if (!ensureDirectorShell(nodeId)) {
			await runDirectorShellPhase(nodeId, params)
			return
		}
		const shell = directorShellCache.get(nodeId)!
		// 批量模式下统一把 status 置为 running，避免每个房间结束时归位导致按钮闪烁/可并发点击
		applySettingsPatch(nodeId, { status: 'running' }, true)
		try {
			for (const room of shell.rooms) {
				const rid = String(room.roomId ?? '')
				const st = (
					getNodeSceneUnderstandingSettings(nodeId)?.directorRoomStatus as
						| Record<string, { state?: string }>
						| undefined
				)?.[rid]?.state
				if (st === 'done') continue
				await runSingleDirectorRoom(nodeId, rid, params, { keepRunning: true })
			}
		} finally {
			applySettingsPatch(nodeId, { status: 'completed' }, true)
		}
	}

	/** 导演工作台主入口：未完成壳 → 跑壳；已完成 → 识别剩余房间 */
	const runDirectorWorkbench = async (
		nodeId: string,
		params: { model: string; promptText: string; directorGroups: DirectorGroup[] }
	) => {
		const settings = getNodeSceneUnderstandingSettings(nodeId)
		if (settings?.directorShellCompleted === true && ensureDirectorShell(nodeId)) {
			await runAllDirectorRooms(nodeId, params)
		} else {
			await runDirectorShellPhase(nodeId, params)
		}
	}

	/** UI 触发：识别单个房间（流水线按钮） */
	const onNodeRunDirectorRoom = async (nodeId: string, roomId: string) => {
		const node = getNodeRecord(nodeId)
		if (!node || node.type !== 'scene-understanding') {
			return
		}
		const settings = getNodeSceneUnderstandingSettings(nodeId)
		const model = String(settings?.selectedModel ?? '').trim()
		if (!model) {
			options.pushToast(t('aiworkflow.runtime.understandingSelectModel'), 'warn')
			return
		}
		const directorGroups = options
			.connectedDirectorSceneInputs(nodeId)
			.filter((g) => Array.isArray(g.images) && g.images.length > 0) as DirectorGroup[]
		try {
			await runSingleDirectorRoom(nodeId, roomId, {
				model,
				promptText: '',
				directorGroups
			})
		} catch (err) {
			if (!(err instanceof Error && err.name === 'AbortError')) {
				console.error('[SceneUnderstandingController] run director room failed', err)
			}
		}
	}

	const onNodeRunSceneUnderstanding = async (nodeId: string) => {
		const node = getNodeRecord(nodeId)
		if (!node || node.type !== 'scene-understanding') return
		const settings = getNodeSceneUnderstandingSettings(nodeId)
		const mode = settings?.mode === 'scene-lighting' ? 'scene-lighting' : 'scene-layout'
		// 导演多场景工作台：按场景（房间）分组收集图片
		const isDirector = mode === 'scene-layout' && settings?.sceneType === 'director-multi-scene'
		const directorGroups = isDirector
			? options
					.connectedDirectorSceneInputs(nodeId)
					.filter((g) => Array.isArray(g.images) && g.images.length > 0)
			: []
		if (isDirector && directorGroups.length < 2) {
			options.pushToast(t('aiworkflow.runtime.understandingDirectorNeedScenes'), 'warn')
			return
		}
		const rawImageInputs = isDirector
			? directorGroups.flatMap((g) => g.images)
			: options.connectedSceneUnderstandImageInputs(nodeId)
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
		const sceneType: 'auto' | 'indoor' | 'outdoor' | 'director-multi-scene' = isDirector
			? 'director-multi-scene'
			: settings?.sceneType === 'indoor' || settings?.sceneType === 'outdoor'
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

		// 导演多场景：工作区分步流水线（户型壳 → 逐房间），独立于单阶段流程
		if (isDirector) {
			try {
				await runDirectorWorkbench(nodeId, { model, promptText, directorGroups })
			} catch (err) {
				const isAbort = err instanceof Error && err.name === 'AbortError'
				if (!isAbort) {
					const msg = getErrorMessage(err)
					console.error('[SceneUnderstandingController] director workbench failed', err)
					applySettingsPatch(
						nodeId,
						{
							status: 'error',
							message: msg,
							statusText: t('aiworkflow.runtime.understandingRequestError'),
							progress: 100
						},
						true
					)
					options.pushToast(msg, 'warn')
				}
			}
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

		// 硬存盘：复用 toggle 时已创建的 taskId，或新建
		const settingsBefore = getNodeSceneUnderstandingSettings(nodeId)
		const persistEnabled = settingsBefore?.persistJsonToDisk === true
		const existingTaskId =
			typeof settingsBefore?.persistedTaskId === 'string'
				? settingsBefore.persistedTaskId
				: undefined
		const taskId = persistEnabled ? existingTaskId || `task_${Date.now()}` : undefined
		let persistedFilePath: string | undefined

		if (taskId && !existingTaskId) {
			// 首次 run（toggle 时未创建文件的情况）
			const projectId = options.getProjectId?.()
			if (projectId && typeof window?.dweb?.aiworkflow?.getProjectRootById === 'function') {
				try {
					const root = await window.dweb.aiworkflow.getProjectRootById({ projectId })
					if (root) {
						persistedFilePath = buildPersistFilePath(root, nodeId, taskId)
					}
				} catch (e) {
					console.warn('[SceneUnderstandingController] getProjectRootById failed', e)
				}
			}
			if (!persistedFilePath) {
				persistedFilePath = `scene-understanding/${nodeId}/${taskId}.json`
			}
		} else if (existingTaskId) {
			// 复用已有路径
			persistedFilePath =
				typeof settingsBefore?.persistedFilePath === 'string'
					? settingsBefore.persistedFilePath
					: undefined
		}

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
			lastInputLayoutJson: layoutJson,
			...(isDirector
				? {
						directorScenes: directorGroups.map((g) => ({
							sceneIndex: g.sceneIndex,
							anchorId: g.anchorId,
							label: g.label,
							imageCount: g.images.length
						})),
						directorRooms: undefined,
						directorConnections: undefined
					}
				: {}),
			...(taskId ? { persistedTaskId: taskId } : {}),
			...(persistedFilePath ? { persistedFilePath } : {})
		})

		if (taskId) {
			lastPersistedRawLen.set(nodeId, 0)
			persistSceneUnderstandingJson(nodeId, taskId, {
				taskId,
				nodeId,
				startedAt: Date.now(),
				status: 'running',
				mode,
				sceneType,
				model,
				rawOutput: '',
				inputSummary: {
					imageCount: rawImageInputs.length,
					sceneCount: isDirector ? directorGroups.length : undefined
				}
			}).then((r) => {
				if (!r.ok) {
					console.warn('[SceneUnderstandingController] initial persist failed', r.error)
				}
			})
		}

		let controller: AbortController | null = null
		try {
			const normalizedImageInputs: Array<{
				imageUrl?: string
				imageDataUrl?: string
				width?: number
				height?: number
			}> = []
			const directorSceneInputs: SceneDirectorInput[] = []
			if (isDirector) {
				// 导演模式：按场景分组归一化，保留分组信息随 payload 发送
				for (const group of directorGroups) {
					const images: SceneUnderstandImageInput[] = []
					for (let index = 0; index < group.images.length; index += 1) {
						const rawInput = group.images[index]
						const normalizedImageInput = await options.normalizeMeshyImageInputValue(
							rawInput.url,
							`director_scene_${group.sceneIndex}_${index + 1}`
						)
						if (!normalizedImageInput) continue
						const entry = normalizedImageInput.startsWith('data:')
							? {
									imageDataUrl: normalizedImageInput,
									width: rawInput.width,
									height: rawInput.height
								}
							: { imageUrl: normalizedImageInput, width: rawInput.width, height: rawInput.height }
						images.push(entry)
						normalizedImageInputs.push(entry)
					}
					if (images.length) {
						directorSceneInputs.push({
							sceneIndex: group.sceneIndex,
							label: group.label,
							images
						})
					}
				}
			} else {
				for (let index = 0; index < rawImageInputs.length; index += 1) {
					const rawInput = rawImageInputs[index]
					const normalizedImageInput = await options.normalizeMeshyImageInputValue(
						rawInput.url,
						`scene_understand_input_${index + 1}`
					)
					if (!normalizedImageInput) continue
					normalizedImageInputs.push(
						normalizedImageInput.startsWith('data:')
							? {
									imageDataUrl: normalizedImageInput,
									width: rawInput.width,
									height: rawInput.height
								}
							: { imageUrl: normalizedImageInput, width: rawInput.width, height: rawInput.height }
					)
				}
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
				...(isDirector ? { sceneInputs: directorSceneInputs } : {}),
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
						// P0 修复：不立即删除缓冲区，先读取流式期间累积的完整文本
						// 避免 chatMessage 未携带 rawOutput 时丢失之前的识别记录
						const accumulatedRaw = sceneUnderstandDraftBuffers.get(nodeId) ?? ''
						const currentSettings = getNodeSceneUnderstandingSettings(nodeId)
						const storedRaw =
							typeof currentSettings?.rawOutput === 'string' ? currentSettings.rawOutput : ''
						// 取最长的作为 rawOutput 兜底，避免丢失流式期间已累积的内容
						const bestRaw = accumulatedRaw.length >= storedRaw.length ? accumulatedRaw : storedRaw

						const payloadRaw = msg.payload as Record<string, unknown>
						const contentStr = typeof payloadRaw.content === 'string' ? payloadRaw.content : '{}'
						const payloadResult = JSON.parse(contentStr) as Record<string, unknown>
						const isMock = payloadResult.mock === true
						const outputJsonFromPayload =
							typeof payloadResult.outputJson === 'string' ? payloadResult.outputJson : ''
						const rawOutputFromPayload =
							typeof payloadResult.rawOutput === 'string' ? payloadResult.rawOutput : ''

						// P0 修复：多级兜底解析 outputJson
						// 1. 优先用 payload 的 outputJson
						// 2. 失败则用累积的 bestRaw
						// 3. 再失败则用 repairTruncatedJson 修复截断的 JSON
						let parsedSceneType: 'indoor' | 'outdoor' | 'semi-outdoor' | undefined
						let sceneConfidence: number | undefined
						let directorRooms: unknown[] | undefined
						let directorConnections: unknown[] | undefined
						let finalOutputJson = outputJsonFromPayload
						let finalRawOutput = rawOutputFromPayload || bestRaw
						let outputTruncated = false
						let parsedJson: Record<string, unknown> | null = null

						if (outputJsonFromPayload) {
							try {
								parsedJson = JSON.parse(outputJsonFromPayload) as Record<string, unknown>
							} catch {
								parsedJson = null
							}
						}
						// 如果 payload 的 outputJson 解析失败，尝试用累积的 rawOutput 解析
						if (!parsedJson && bestRaw) {
							try {
								parsedJson = JSON.parse(bestRaw) as Record<string, unknown>
								finalOutputJson = bestRaw
								finalRawOutput = bestRaw
							} catch {
								// 尝试修复截断的 JSON
								const repaired = repairTruncatedJson(bestRaw)
								if (repaired) {
									try {
										parsedJson = JSON.parse(repaired) as Record<string, unknown>
										finalOutputJson = repaired
										finalRawOutput = bestRaw
										outputTruncated = true
									} catch {
										parsedJson = null
									}
								}
							}
						}
						// 如果 payload 的 outputJson 本身解析成功但比累积的 rawOutput 短，可能被截断
						// 注意：只有当解析后的数据不完整时才认为截断，避免因 rawOutput 含额外说明文字而误报
						let dataLooksComplete = false
						if (parsedJson) {
							if (isDirector) {
								dataLooksComplete = Array.isArray(parsedJson.rooms) && parsedJson.rooms.length > 0
							} else {
								const st = typeof parsedJson.sceneType === 'string' ? parsedJson.sceneType : ''
								dataLooksComplete = st === 'indoor' || st === 'outdoor' || st === 'semi-outdoor'
							}
						}
						if (
							parsedJson &&
							outputJsonFromPayload &&
							bestRaw.length > outputJsonFromPayload.length + 100 &&
							!dataLooksComplete
						) {
							outputTruncated = true
						}

						// 从解析结果中提取字段
						if (parsedJson) {
							const st = typeof parsedJson.sceneType === 'string' ? parsedJson.sceneType : ''
							if (st === 'indoor' || st === 'outdoor' || st === 'semi-outdoor') {
								parsedSceneType = st
							}
							const conf = Number(parsedJson.sceneTypeConfidence)
							if (Number.isFinite(conf) && conf >= 0 && conf <= 1) {
								sceneConfidence = conf
							}
							if (Array.isArray(parsedJson.rooms)) {
								directorRooms = parsedJson.rooms
							}
							if (Array.isArray(parsedJson.connections)) {
								directorConnections = parsedJson.connections
							}
						}

						console.log('[SceneUnderstandingController] run completed', {
							nodeId,
							isMock,
							hasOutputJson: !!finalOutputJson,
							outputTruncated,
							usedAccumulatedRaw: finalOutputJson === bestRaw,
							detectedSceneType: parsedSceneType,
							directorRoomsCount: directorRooms?.length ?? 0,
							directorConnectionsCount: directorConnections?.length ?? 0
						})

						applySettingsPatch(nodeId, {
							status: outputTruncated ? 'completed' : 'completed',
							message:
								typeof payloadResult.summary === 'string'
									? payloadResult.summary
									: t(
											mode === 'scene-lighting'
												? 'aiworkflow.runtime.understandingLightingCompleted'
												: 'aiworkflow.runtime.understandingCompleted'
										),
							statusText: outputTruncated
								? t('aiworkflow.runtime.understandingResultTruncated')
								: typeof payloadResult.providerStatusText === 'string'
									? payloadResult.providerStatusText
									: t('aiworkflow.runtime.understandingResultReady'),
							progress: 100,
							outputJson: finalOutputJson,
							rawOutput: finalRawOutput,
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
							outputTruncated,
							...(isDirector
								? {
										// P0 修复：解析失败时保持 undefined 而非空数组，让 UI 能区分"无数据"和"解析失败"
										directorRooms: directorRooms,
										directorConnections: directorConnections
									}
								: {}),
							mock: isMock
						})

						// P1 修复：截断时提示用户
						if (outputTruncated) {
							const persistOn =
								getNodeSceneUnderstandingSettings(nodeId)?.persistJsonToDisk === true
							options.pushToast(
								persistOn
									? t('aiworkflow.runtime.understandingOutputTruncatedPersistedToast')
									: t('aiworkflow.runtime.understandingOutputTruncatedToast'),
								persistOn ? 'info' : 'warn'
							)
						} else {
							options.pushToast(
								t(
									mode === 'scene-lighting'
										? 'aiworkflow.runtime.lightingCompleteToast'
										: 'aiworkflow.runtime.understandingCompleteToast',
									{ mock: isMock ? t('aiworkflow.runtime.mockSuffix') : '' }
								),
								'info'
							)
						}

						// 硬存盘：写入最终完整结果
						const finalTaskId = getNodeSceneUnderstandingSettings(nodeId)?.persistedTaskId
						if (typeof finalTaskId === 'string' && finalTaskId) {
							const throttleTimer = persistThrottleTimers.get(nodeId)
							if (throttleTimer != null) {
								window.clearTimeout(throttleTimer)
								persistThrottleTimers.delete(nodeId)
							}
							persistSceneUnderstandingJson(nodeId, finalTaskId, {
								taskId: finalTaskId,
								nodeId,
								finishedAt: Date.now(),
								status: 'completed',
								rawOutput: finalRawOutput,
								outputJson: finalOutputJson,
								...(isDirector
									? {
											directorRooms: directorRooms ?? [],
											directorConnections: directorConnections ?? []
										}
									: {}),
								truncated: outputTruncated
							}).then((r) => {
								if (r.ok) {
									console.log('[SceneUnderstandingController] final persist ok', {
										nodeId,
										taskId: finalTaskId
									})
								} else {
									console.warn('[SceneUnderstandingController] final persist failed', r.error)
								}
							})
						}

						// 最后再删除缓冲区
						sceneUnderstandDraftBuffers.delete(nodeId)
					} catch (parseErr: unknown) {
						const parseMsg = getErrorMessage(parseErr)
						console.error('[SceneUnderstandingController] parse result failed', parseErr)
						// 出错时也保留累积的 rawOutput，不丢失已识别的内容
						const accumulatedRaw = sceneUnderstandDraftBuffers.get(nodeId) ?? ''
						applySettingsPatch(nodeId, {
							status: 'error',
							message: t('aiworkflow.runtime.understandingResultParseFailed', { error: parseMsg }),
							statusText: t('aiworkflow.runtime.understandingResultParseFailedStatus'),
							progress: 100,
							rawOutput: accumulatedRaw
						})
						// 硬存盘：出错时也写入已累积的内容
						const errTaskId = getNodeSceneUnderstandingSettings(nodeId)?.persistedTaskId
						if (typeof errTaskId === 'string' && errTaskId) {
							persistSceneUnderstandingJson(nodeId, errTaskId, {
								taskId: errTaskId,
								nodeId,
								finishedAt: Date.now(),
								status: 'error',
								rawOutput: accumulatedRaw,
								error: parseMsg
							})
						}
						sceneUnderstandDraftBuffers.delete(nodeId)
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
		onNodeRunDirectorRoom,
		cleanupSceneUnderstandingRuntime
	}
}
