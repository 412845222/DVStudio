import type { Store } from 'vuex'
import type {
	WorkflowState,
	WorkflowBlenderChatMessage
} from '../../../../aiworkflow/types'
import { getAgentChatBridge } from '../../../../network/chat/AgentChatBridge'
import type { AgentBackendType, ChatAttachment, ChatStreamEvent } from '../../../../network/chat/types'
import {
	collectBlenderUpstreamInputs,
	type BlenderUpstreamInputs
} from './useBlenderUpstreamInputs'
import { getCachedAgentSettings, loadAgentSettings } from '../../../../core/agent/agentConfig'

const makeMsgId = () => `blender-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const TOOL_DISPLAY_NAMES: Record<string, string> = {
	'blender_execute_blender_code': '执行Blender代码',
	'blender_get_objects_summary': '获取场景对象概览',
	'blender_get_object_detail_summary': '获取对象详情',
	'blender_get_blendfile_summary_datablocks': '数据块统计',
	'blender_get_blendfile_summary_missing_files': '检查缺失文件',
	'blender_get_blendfile_summary_of_linked_libraries': '链接库信息',
	'blender_get_blendfile_summary_path_info': '文件路径信息',
	'blender_get_blendfile_summary_usage_guess': '用途猜测',
	'blender_get_screenshot_of_area_as_image': '区域截图',
	'blender_get_screenshot_of_window_as_image': '窗口截图',
	'blender_get_screenshot_of_window_as_json': '窗口布局JSON',
	'blender_jump_to_tab_by_name': '切换工作区',
	'blender_jump_to_tab_by_space_type': '按类型切换工作区',
	'blender_jump_to_view3d_object_by_name': '聚焦对象',
	'blender_jump_to_view3d_object_data_by_name': '按数据名聚焦对象',
	'blender_import_model': '导入模型',
}

function getToolDisplayName(toolName: string): string {
	if (TOOL_DISPLAY_NAMES[toolName]) return TOOL_DISPLAY_NAMES[toolName]
	const base = toolName.replace(/^blender_/, '').replace(/_/g, ' ')
	return base.charAt(0).toUpperCase() + base.slice(1)
}

const MAX_IMAGE_DIMENSION = 640
const MAX_IMAGE_BASE64_CHARS = 200 * 1024

async function compressImageToDataUrl(blob: Blob, maxDim: number = MAX_IMAGE_DIMENSION, quality: number = 0.5): Promise<string> {
	const bitmap = await createImageBitmap(blob)
	let { width, height } = bitmap
	if (width > maxDim || height > maxDim) {
		const scale = maxDim / Math.max(width, height)
		width = Math.round(width * scale)
		height = Math.round(height * scale)
	}
	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	const ctx = canvas.getContext('2d')
	if (!ctx) throw new Error('canvas context unavailable')
	ctx.drawImage(bitmap, 0, 0, width, height)
	bitmap.close()
	return canvas.toDataURL('image/jpeg', quality)
}

async function urlToBase64Attachment(url: string, name?: string): Promise<ChatAttachment | null> {
	if (!url) return null
	try {
		let blob: Blob
		if (url.startsWith('data:image/')) {
			const b64Len = url.length - url.indexOf(',') - 1
			if (b64Len <= MAX_IMAGE_BASE64_CHARS) {
				return { type: 'image_url', name, data: url, url }
			}
			const resp = await fetch(url)
			blob = await resp.blob()
		} else {
			const resp = await fetch(url)
			if (!resp.ok) return null
			blob = await resp.blob()
		}
		let dataUrl = await compressImageToDataUrl(blob)
		let b64Len = dataUrl.length - dataUrl.indexOf(',') - 1
		if (b64Len > MAX_IMAGE_BASE64_CHARS * 1.5) {
			dataUrl = await compressImageToDataUrl(blob, MAX_IMAGE_DIMENSION / 2, 0.5)
			b64Len = dataUrl.length - dataUrl.indexOf(',') - 1
		}
		return { type: 'image_url', name, data: dataUrl, url }
	} catch {
		return null
	}
}

async function upstreamImagesToAttachments(images: BlenderUpstreamInputs['images']): Promise<ChatAttachment[]> {
	const attachments: ChatAttachment[] = []
	for (const img of images.slice(0, 3)) {
		const name = img.url.split('/').pop()?.split('?')[0] || `image_${attachments.length + 1}.jpg`
		const att = await urlToBase64Attachment(img.url, name)
		if (att) {
			attachments.push(att)
		}
	}
	return attachments
}

export interface BlenderAgentChatDeps {
	store: Store<WorkflowState>
	pushToast?: (message: string, tone?: 'info' | 'warn' | 'error') => void
	backend?: AgentBackendType
	model?: string
	onAbortReady?: (abortFn: () => void) => void
}

function buildBlenderContext(store: Store<WorkflowState>, nodeId: string) {
	const state = store.state
	const node = state.nodesById[nodeId]

	const blenderSettings = (node?.blenderSettings ?? {}) as Record<string, unknown>
	const mcpStatus = String(blenderSettings.mcpStatus || 'unchecked')
	const connected = mcpStatus === 'connected'

	// 设计文档 §4.3：遍历 in-0（兼容 in-model）全部入边，按 text/image/model3d 聚合
	const upstream: BlenderUpstreamInputs = connected
		? collectBlenderUpstreamInputs(store, nodeId)
		: { texts: [], images: [], models: [] }

	return {
		blender: {
			connected,
			host: String(blenderSettings.mcpHost || 'localhost'),
			port: Number(blenderSettings.mcpPort || 9876),
			upstream,
			/** 兼容旧字段：第一个上游模型 */
			upstreamModel: upstream.models.length
				? {
						nodeLabel: upstream.models[0].sourceAlias,
						filePath: upstream.models[0].filePath,
						format: upstream.models[0].format
					}
				: null
		}
	}
}

function buildBlenderSystemPrompt(context: ReturnType<typeof buildBlenderContext>, toolNames: string[]): string {
	const parts: string[] = []
	parts.push('你是一个Blender 3D控制助手，通过官方Blender MCP协议连接到正在运行的Blender实例。你可以调用多种专用工具来查看和修改3D场景。')
	parts.push('')
	if (context.blender.connected) {
		parts.push(`当前Blender已连接到 ${context.blender.host}:${context.blender.port}。`)
		parts.push('')
		parts.push('## 核心工具')
		parts.push('- **blender_execute_blender_code**: 执行任意bpy Python代码。当其他专用工具无法满足需求时使用此工具。代码执行后必须设置result字典。')
		parts.push('')
		parts.push('## 场景信息工具')
		parts.push('- **blender_get_objects_summary**: 获取集合层级树和所有对象列表、材质/相机/灯光名称。开始操作前优先调用。')
		parts.push('- **blender_get_object_detail_summary**: 获取指定对象的完整详细信息（变换、修改器、约束、材质、可见性、集合等）。')
		parts.push('- **blender_get_screenshot_of_window_as_json**: 获取窗口布局、区域分布、活动对象、选中对象的JSON描述。')
		parts.push('- **blender_get_blendfile_summary_datablocks**: 获取数据块统计、渲染引擎、工作区信息。')
		parts.push('- **blender_get_blendfile_summary_path_info**: 获取文件路径、保存状态、备份信息。')
		parts.push('- **blender_get_blendfile_summary_missing_files**: 检查缺失的外部文件引用。')
		parts.push('- **blender_get_blendfile_summary_of_linked_libraries**: 查看链接库依赖。')
		parts.push('- **blender_get_blendfile_summary_usage_guess**: 猜测文件用途（建模/渲染/动画等评分）。')
		parts.push('')
		parts.push('## 截图工具')
		parts.push('- **blender_get_screenshot_of_area_as_image**: 截取指定区域截图（默认VIEW_3D），返回base64 PNG。每次修改后调用验证。')
		parts.push('- **blender_get_screenshot_of_window_as_image**: 截取整个Blender窗口截图。')
		parts.push('')
		parts.push('## 导航工具')
		parts.push('- **blender_jump_to_tab_by_name**: 按名称切换工作区标签（Modeling/Rendering/Animation等）。')
		parts.push('- **blender_jump_to_tab_by_space_type**: 按空间类型切换工作区。')
		parts.push('- **blender_jump_to_view3d_object_by_name**: 在3D视口中选中并框选聚焦到指定对象。')
		parts.push('- **blender_jump_to_view3d_object_data_by_name**: 按数据块名称聚焦对象。')
		parts.push('')
		parts.push('## 其他')
		parts.push('- **blender_import_model**: 导入3D模型文件（.glb/.gltf/.fbx/.obj/.stl）。')
		parts.push('')
		parts.push('## 使用规则')
		parts.push('1. **操作前先调用 blender_get_objects_summary 了解场景**')
		parts.push('2. **不要猜测对象名称**，先用工具获取真实名称')
		parts.push('3. **复杂操作拆分步骤**，每次少量代码，验证后继续')
		parts.push('4. **修改场景后调用截图工具验证结果**')
		parts.push('5. 代码执行后必须设置result = {...}字典')
		parts.push('6. 回复用户使用中文')
		if (toolNames.length > 0) {
			parts.push('')
			parts.push('## 当前可用工具')
			parts.push(toolNames.map(t => `- ${t}（${getToolDisplayName(t)}）`).join('\n'))
		}
		if (context.blender.upstream.models.length > 0) {
			parts.push('')
			parts.push(`## 上游模型信息（共 ${context.blender.upstream.models.length} 个）`)
			for (const m of context.blender.upstream.models) {
				parts.push(`- 来源节点：${m.sourceAlias}，文件路径：${m.filePath}，格式：${m.format}`)
			}
			parts.push('当用户说"导入上游模型"或类似要求时，直接使用blender_import_model工具依次传入上述路径。')
		}
		if (context.blender.upstream.images.length > 0) {
			parts.push('')
			parts.push(`## 上游参考图（共 ${context.blender.upstream.images.length} 张）`)
			for (const img of context.blender.upstream.images) {
				parts.push(`- 来源节点：${img.sourceAlias}，URL：${img.url}`)
			}
			parts.push('用户连接了上述参考图作为建模/材质参考。建模时尽量贴合参考图描述的形态与风格。')
		}
		if (context.blender.upstream.texts.length > 0) {
			parts.push('')
			parts.push(`## 上游文本输入（共 ${context.blender.upstream.texts.length} 段）`)
			for (const t of context.blender.upstream.texts) {
				parts.push(`### 来自节点：${t.sourceAlias}`)
				parts.push(t.text.slice(0, 4000))
			}
			parts.push('上述文本是用户通过蓝图连线提供的上下文，执行操作时优先参考。')
		}
	} else {
		parts.push('当前Blender未连接。请告诉用户：需要先在节点顶部点击"连接"按钮连接Blender后才能执行操作。')
	}
	parts.push('')
	parts.push('重要：不要询问用户任何关于工作流、蓝图、其他节点的问题，不要尝试读取或修改工作流/蓝图。专注于Blender场景操作。')
	return parts.join('\n')
}

async function fetchBlenderToolNames(): Promise<string[]> {
	try {
		const status = await window.dweb?.blender?.mcpStatus?.()
		if (status && Array.isArray(status.tools) && status.tools.length > 0) {
			return status.tools
		}
	} catch {}
	return []
}

function extractResultText(output: unknown): string {
	if (!output) return ''
	if (typeof output === 'string') return output
	try {
		return JSON.stringify(output, null, 2)
	} catch {
		return String(output)
	}
}

function extractStdoutStderr(output: unknown): { stdout: string; stderr: string; result: string } {
	if (!output) return { stdout: '', stderr: '', result: '' }
	let outStr = typeof output === 'string' ? output : JSON.stringify(output)
	let stdout = ''
	let stderr = ''
	let result = ''
	try {
		const parsed = typeof output === 'string' ? JSON.parse(output) : output
		if (parsed && typeof parsed === 'object') {
			const rec = parsed as Record<string, unknown>
			if ('stdout' in rec) stdout = String(rec.stdout ?? '')
			if ('stderr' in rec) stderr = String(rec.stderr ?? '')
			if ('result' in rec) {
				const r = rec.result
				result = typeof r === 'string' ? r : JSON.stringify(r, null, 2)
			}
		}
	} catch {
		stdout = outStr
	}
	return { stdout, stderr, result }
}

function formatToolResultDisplay(output: unknown): { summary: string; detail: string } {
	if (!output) return { summary: '', detail: '' }

	if (typeof output === 'object' && output !== null) {
		const out = output as Record<string, unknown> & { content?: unknown[]; ok?: boolean; error?: unknown }
		if (Array.isArray(out.content)) {
			const textParts: string[] = []
			for (const part of out.content) {
				if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
					textParts.push(part.text)
				}
			}
			if (textParts.length > 0) {
				const fullText = textParts.join('\n')
				const lines = fullText.trim().split('\n')
				const firstLine = lines[0] || ''
				return {
					summary: firstLine.slice(0, 100),
					detail: fullText.slice(0, 5000)
				}
			}
		}
		if (out.ok === false && out.error) {
			return { summary: String(out.error).slice(0, 100), detail: String(out.error) }
		}
		if (out.value && typeof out.value === 'object') {
			const valStr = JSON.stringify(out.value, null, 2)
			return { summary: '操作完成', detail: valStr.slice(0, 5000) }
		}
	}

	const { stdout, stderr, result } = extractStdoutStderr(output)
	const parts: string[] = []
	if (stdout && stdout.trim()) parts.push(`📤 输出:\n${stdout.trim()}`)
	if (stderr && stderr.trim()) parts.push(`⚠️ 错误:\n${stderr.trim()}`)
	if (result && result.trim()) {
		try {
			const parsed = JSON.parse(result)
			parts.push(`📋 结果:\n${JSON.stringify(parsed, null, 2)}`)
		} catch {
			parts.push(`📋 结果:\n${result.trim()}`)
		}
	}
	const rawText = extractResultText(output)
	const detail = parts.length > 0 ? parts.join('\n\n') : rawText.slice(0, 3000)
	let summary = '操作完成'
	if (stderr && stderr.trim()) {
		summary = '执行出错'
	} else if (result && result.trim()) {
		try {
			JSON.parse(result)
			summary = '操作成功'
		} catch {
			summary = result.trim().split('\n')[0].slice(0, 80)
		}
	} else if (stdout && stdout.trim().length > 0) {
		const firstLine = stdout.trim().split('\n')[0].slice(0, 80)
		summary = firstLine
	}
	return { summary, detail }
}

export async function runBlenderAgentChat(
	deps: BlenderAgentChatDeps,
	nodeId: string,
	prompt: string
) {
	const { store } = deps
	const node = store.state.nodesById[nodeId]
	if (!node) return

	const settings = (node.blenderSettings ?? {}) as Record<string, unknown>
	const backendCandidate = String(
		deps.backend || settings.agentBackend || 'dvsagent'
	).trim()
	const backend = (
		backendCandidate === 'codex' || backendCandidate === 'copilot' ? backendCandidate : 'dvsagent'
	) as AgentBackendType
	// 参数面板存放位置（nodeChatConfig blender 分支）：
	// dvsagent → model(gemini|bytedance) + geminiTextModelVersion/textModelVersion；codex/copilot → modelId
	const resolveModelFromSettings = (): string => {
		if (backend === 'dvsagent') {
			const apiSource = String(settings.model || '').trim()
			if (apiSource === 'gemini') return String(settings.geminiTextModelVersion || '').trim()
			if (apiSource === 'bytedance') return String(settings.textModelVersion || '').trim()
			return ''
		}
		return String(settings.modelId || '').trim()
	}
	const rawModel = deps.model || resolveModelFromSettings()
	const model = (!rawModel || rawModel === 'auto') ? undefined : rawModel

	const history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = []
	const existingChat = Array.isArray(settings.chatMessages) ? settings.chatMessages : []
	for (const msg of existingChat) {
		if (msg.role === 'user') {
			history.push({ role: 'user', content: msg.content })
		} else if (msg.role === 'assistant' && msg.content && !msg.isError) {
			history.push({ role: 'assistant', content: msg.content })
		}
	}

	const userMsg: WorkflowBlenderChatMessage = {
		id: makeMsgId(),
		role: 'user',
		content: prompt,
		timestamp: Date.now()
	}
	store.commit('appendBlenderChatMessage', { nodeId, message: userMsg })

	let currentAssistantMsgId: string = makeMsgId()
	let currentContent = ''
	const createAssistantMsg = () => {
		currentAssistantMsgId = makeMsgId()
		currentContent = ''
		const msg: WorkflowBlenderChatMessage = {
			id: currentAssistantMsgId,
			role: 'assistant',
			content: '',
			timestamp: Date.now(),
			isThinking: true
		}
		store.commit('appendBlenderChatMessage', { nodeId, message: msg })
	}
	createAssistantMsg()
	store.commit('setBlenderResponding', { nodeId, responding: true })

	const abortController = new AbortController()
	deps.onAbortReady?.(() => {
		abortController.abort()
	})

	let disconnected = false
	let prevStatus: string | undefined
	const unsubscribeWatch = store.watch(
		(state) => state.nodesById[nodeId]?.blenderSettings?.mcpStatus,
		(newStatus: string | undefined) => {
			const wasConnected = prevStatus === 'connected'
			prevStatus = newStatus
			const isDisconnectedState = newStatus === 'disconnected' || newStatus === 'error'
			if (wasConnected && isDisconnectedState && !disconnected) {
				disconnected = true
				abortController.abort()
				const sysMsgId = makeMsgId()
				store.commit('appendBlenderChatMessage', {
					nodeId,
					message: {
						id: sysMsgId,
						role: 'system',
						content: '⚠️ Blender连接已断开，会话中断',
						timestamp: Date.now(),
						isError: true
					}
				})
			}
		}
	)

	const finishCurrentAssistant = (patch: Partial<WorkflowBlenderChatMessage> = {}) => {
		store.commit('updateBlenderChatMessage', {
			nodeId,
			messageId: currentAssistantMsgId,
			patch: { isThinking: false, isStreaming: false, ...patch }
		})
	}

	const discardCurrentAssistant = () => {
		store.commit('removeBlenderChatMessage', { nodeId, messageId: currentAssistantMsgId })
		currentAssistantMsgId = ''
		currentContent = ''
	}

	const toolMsgMap = new Map<string, string>()
	const activeToolCalls = new Map<string, { msgId: string; name: string }>()

	// 产物捕获（设计文档 §4.5）：视口截图 + 最终文本，会话结束写入 lastOutputs
	let capturedScreenshotUrl = ''
	const tryCaptureScreenshot = (toolName: string, output: unknown) => {
		if (!toolName.includes('screenshot')) return
		if (!output || typeof output !== 'object') return
		const content = (output as { content?: unknown }).content
		if (!Array.isArray(content)) return
		for (const part of content) {
			if (
				part &&
				typeof part === 'object' &&
				(part as { type?: string }).type === 'image' &&
				typeof (part as { data?: string }).data === 'string' &&
				(part as { data: string }).data
			) {
				const mime = String((part as { mimeType?: string }).mimeType || 'image/png')
				capturedScreenshotUrl = `data:${mime};base64,${(part as { data: string }).data}`
				return
			}
		}
	}

	try {
		const chatBridge = getAgentChatBridge()
		const context = buildBlenderContext(store, nodeId)
		const toolNames = context.blender.connected ? await fetchBlenderToolNames() : []
		const effectiveTools = toolNames.length > 0 ? toolNames : ['blender_get_objects_summary', 'blender_execute_blender_code']
		const systemPrompt = buildBlenderSystemPrompt(context, effectiveTools)
		const attachments = context.blender.connected && context.blender.upstream.images.length > 0
			? await upstreamImagesToAttachments(context.blender.upstream.images)
			: []

		let globalAgentSettings = getCachedAgentSettings()
		try {
			globalAgentSettings = await loadAgentSettings()
		} catch {}

		const rawThinking = String(settings.thinkingEffort || '').trim()
		const thinkingEffort = (['disabled', 'low', 'medium', 'high'].includes(rawThinking)
			? rawThinking
			: 'medium') as 'disabled' | 'low' | 'medium' | 'high'

		const session = await chatBridge.createSession(backend, {
			title: prompt.slice(0, 24),
			model,
			projectId: store.state.projectId ?? null
		})
		const sessionId = session.id

		let receivedAnyContent = false
		let receivedError = false
		let aborted = false
		let lastContextUsage: { tokenCount: number; budget: number; usage: number; truncated: boolean } | null = null

		for await (const ev of chatBridge.sendMessage(
			backend,
			sessionId,
			{
				content: prompt,
				model,
				history,
				systemPrompt,
				tools: effectiveTools,
				attachments,
				thinkingEffort,
				maxToolCalls: globalAgentSettings.maxToolCalls,
				enableToolCallWarning: globalAgentSettings.enableToolCallWarning !== false
			},
			abortController.signal
		) as AsyncGenerator<ChatStreamEvent, void, void>) {
			if (abortController.signal.aborted) {
				aborted = true
				break
			}
			if (ev.type === 'done' || ev.type === 'turn_done') break
			if (ev.type === 'error') {
				receivedError = true
				const errText = currentContent + (currentContent ? '\n\n' : '') + `❌ 错误：${ev.message}`
				finishCurrentAssistant({ content: errText, isError: true })
				deps.pushToast?.(`Blender Agent错误：${ev.message}`, 'error')
				break
			}
			if (ev.type === 'text_delta') {
				receivedAnyContent = true
				currentContent += ev.content
				store.commit('updateBlenderChatMessage', {
					nodeId,
					messageId: currentAssistantMsgId,
					patch: { content: currentContent, isThinking: false, isStreaming: true }
				})
				continue
			}
			if (ev.type === 'thinking_delta' || ev.type === 'thought') {
				continue
			}
			if (ev.type === 'tool_call_start') {
				const tcId = ev.toolCallId || `tool-${ev.tool}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
				const toolName = ev.tool || 'unknown'
				const toolDisplay = getToolDisplayName(toolName)
				const toolMsgId = makeMsgId()
				const toolMsg: WorkflowBlenderChatMessage = {
					id: toolMsgId,
					role: 'tool_call',
					content: `🔧 ${toolDisplay}...`,
					timestamp: Date.now(),
					toolName,
					toolArgs: (ev.input as Record<string, unknown>) || {},
					toolCallId: tcId,
					status: 'running',
					collapsed: true
				}
				if (currentContent.trim()) {
					finishCurrentAssistant()
				} else {
					discardCurrentAssistant()
				}
				store.commit('appendBlenderChatMessage', { nodeId, message: toolMsg })
				toolMsgMap.set(tcId, toolMsgId)
				activeToolCalls.set(tcId, { msgId: toolMsgId, name: toolName })
				continue
			}
			if (ev.type === 'tool_call_end') {
				const tcId = ev.toolCallId || Array.from(activeToolCalls.keys()).pop() || ''
				const toolMsgId = toolMsgMap.get(tcId)
				const activeTc = tcId ? activeToolCalls.get(tcId) : null
				const toolName = ev.tool || activeTc?.name || 'unknown'
				const toolDisplay = getToolDisplayName(toolName)
				tryCaptureScreenshot(toolName, ev.output)
				const { summary, detail } = formatToolResultDisplay(ev.output)
				const outRec = (ev.output && typeof ev.output === 'object') ? ev.output as Record<string, unknown> : null
				const hasError = !!(outRec && (
					('isError' in outRec && outRec.isError) ||
					('ok' in outRec && outRec.ok === false)
				))
				if (toolMsgId) {
					store.commit('updateBlenderChatMessage', {
						nodeId,
						messageId: toolMsgId,
						patch: {
							content: `${hasError ? '❌' : '✅'} ${toolDisplay}${summary ? ' — ' + summary : ''}`,
							toolResult: ev.output,
							toolError: hasError ? (detail || '执行出错') : undefined,
							status: hasError ? 'error' : 'completed',
							isError: hasError,
							collapsed: !hasError
						}
					})
					activeToolCalls.delete(tcId)
				}
				createAssistantMsg()
				continue
			}
			if (ev.type === 'tool_call_error') {
				const tcId = ev.toolCallId || Array.from(activeToolCalls.keys()).pop() || ''
				const toolMsgId = toolMsgMap.get(tcId)
				const toolName = ev.tool || (tcId ? activeToolCalls.get(tcId)?.name : null) || 'unknown'
				const toolDisplay = getToolDisplayName(toolName)
				const errDetail = ev.error || '未知错误'
				if (toolMsgId) {
					store.commit('updateBlenderChatMessage', {
						nodeId,
						messageId: toolMsgId,
						patch: {
							content: `❌ ${toolDisplay}失败：${errDetail.slice(0, 200)}`,
							toolError: errDetail,
							status: 'error',
							isError: true,
							collapsed: false
						}
					})
					activeToolCalls.delete(tcId)
				} else {
					const errMsg: WorkflowBlenderChatMessage = {
						id: makeMsgId(),
						role: 'tool_result',
						content: `❌ ${toolDisplay}失败：${errDetail}`,
						timestamp: Date.now(),
						toolName,
						toolError: errDetail,
						toolCallId: tcId,
						status: 'error',
						isError: true
					}
					store.commit('appendBlenderChatMessage', { nodeId, message: errMsg })
				}
				createAssistantMsg()
				continue
			}
			if (ev.type === 'context_usage') {
				lastContextUsage = {
					tokenCount: Number(ev.tokenCount) || 0,
					budget: Number(ev.budget) || 0,
					usage: Number(ev.usage) || 0,
					truncated: !!ev.truncated
				}
				store.commit('setBlenderChatContextUsage', { nodeId, usage: lastContextUsage })
				continue
			}
			if (ev.type === 'assistant_done') {
				if (ev.content && ev.content.trim()) {
					currentContent = ev.content
					store.commit('updateBlenderChatMessage', {
						nodeId,
						messageId: currentAssistantMsgId,
						patch: { content: currentContent, isThinking: false, isStreaming: false }
					})
				}
				continue
			}
		}

		if (aborted) {
			if (currentAssistantMsgId) {
				if (currentContent.trim()) {
					finishCurrentAssistant({
						content: currentContent + '\n\n⏹ 已停止生成'
					})
				} else {
					store.commit('updateBlenderChatMessage', {
						nodeId,
						messageId: currentAssistantMsgId,
						patch: { content: '⏹ 已停止生成', isThinking: false, isStreaming: false }
					})
				}
			} else {
				const stopMsg: WorkflowBlenderChatMessage = {
					id: makeMsgId(),
					role: 'assistant',
					content: '⏹ 已停止生成',
					timestamp: Date.now()
				}
				store.commit('appendBlenderChatMessage', { nodeId, message: stopMsg })
			}
			for (const info of activeToolCalls.values()) {
				store.commit('updateBlenderChatMessage', {
					nodeId,
					messageId: info.msgId,
					patch: { content: `⏹ ${info.name} 已中止`, status: 'error', isError: true, collapsed: false }
				})
			}
			activeToolCalls.clear()
		} else if (!receivedError && !receivedAnyContent && !currentContent.trim()) {
			if (currentAssistantMsgId) {
				finishCurrentAssistant({
					content: '（Agent未返回有效内容，请检查Blender连接状态或重试）',
					isError: true
				})
			}
		} else {
			if (currentAssistantMsgId) {
				if (currentContent.trim()) {
					finishCurrentAssistant()
				} else {
					discardCurrentAssistant()
				}
			}
			// 会话正常结束：归档产物供 out-0 下游取数（设计文档 §4.5）
			const outputs: { text?: string; imageUrl?: string } = {}
			if (currentContent.trim()) outputs.text = currentContent.trim()
			if (capturedScreenshotUrl) outputs.imageUrl = capturedScreenshotUrl
			if (outputs.text || outputs.imageUrl) {
				store.commit('setBlenderLastOutputs', { nodeId, outputs })
			}
		}
	} catch (err) {
		const e = err as { name?: string; message?: string }
		if (e?.name === 'AbortError' || abortController.signal.aborted) {
			if (currentAssistantMsgId) {
				finishCurrentAssistant({
					content: currentContent + (currentContent ? '\n\n' : '') + '⏹ 已停止生成'
				})
			} else {
				const stopMsg: WorkflowBlenderChatMessage = {
					id: makeMsgId(),
					role: 'assistant',
					content: '⏹ 已停止生成',
					timestamp: Date.now()
				}
				store.commit('appendBlenderChatMessage', { nodeId, message: stopMsg })
			}
			for (const info of activeToolCalls.values()) {
				store.commit('updateBlenderChatMessage', {
					nodeId,
					messageId: info.msgId,
					patch: { content: `⏹ ${info.name} 已中止`, status: 'error', isError: true, collapsed: false }
				})
			}
			activeToolCalls.clear()
		} else {
			const errMsg = e?.message || String(err)
			if (currentAssistantMsgId) {
				finishCurrentAssistant({
					content: currentContent + (currentContent ? '\n\n' : '') + `❌ 错误：${errMsg}`,
					isError: true
				})
			} else {
				const errChatMsg: WorkflowBlenderChatMessage = {
					id: makeMsgId(),
					role: 'assistant',
					content: `❌ 错误：${errMsg}`,
					timestamp: Date.now(),
					isError: true
				}
				store.commit('appendBlenderChatMessage', { nodeId, message: errChatMsg })
			}
			deps.pushToast?.(`Blender Agent错误：${errMsg}`, 'error')
		}
	} finally {
		unsubscribeWatch()
		store.commit('setBlenderResponding', { nodeId, responding: false })
		deps.onAbortReady?.(() => {})
	}
}
