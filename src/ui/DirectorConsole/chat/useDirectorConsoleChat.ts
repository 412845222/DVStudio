import { ref, onUnmounted } from 'vue'
import { getAgentChatBridge } from '../../../network/chat/AgentChatBridge'
import { DSHAgentChatService } from '../../../network/chat/DSHAgentChatService'
import type { ChatStreamEvent } from '../../../network/chat/types'
import { hasDeepSeekHarness, deepseekHarness } from '../../../electronBridge'
import { DIRECTOR_CONSOLE_SYSTEM_PROMPT } from './directorConsoleSystemPrompt'

/** 聊天消息类型 */
export interface ChatMessage {
	id: string
	role: 'user' | 'assistant'
	content: string
	/** 用户消息附带的图片（base64 data URL） */
	images?: string[]
	/** 助手消息中的工具调用记录 */
	toolCalls?: ToolCallRecord[]
	status?: 'streaming' | 'done' | 'error'
	/** 思考过程累积文本（reasoning-delta） */
	thinkingContent?: string
	/** 是否正在流式思考 */
	isStreamingThinking?: boolean
	/** 思考块是否折叠（默认展开流式时，完成后可折叠） */
	thinkingCollapsed?: boolean
}

export interface ToolCallRecord {
	toolCallId: string
	tool: string
	input?: unknown
	output?: unknown
	status: 'running' | 'done' | 'error'
	error?: string
}

export interface UploadedAttachment {
	name: string
	type: string
	size: number
	dataUrl: string
}

/**
 * 导演控制台聊天逻辑 composable。
 * 复用蓝图右下角 DSH Agent 对话框相同的服务与会话机制。
 */
export function useDirectorConsoleChat() {
	const messages = ref<ChatMessage[]>([])
	const isLoading = ref(false)
	const isStreaming = ref(false)
	const serviceReady = ref(false)
	let sessionId = ''
	const abortController = new AbortController()

	/** 检查 DSH 服务是否就绪 */
	async function checkServiceReady(): Promise<boolean> {
		if (!hasDeepSeekHarness()) {
			serviceReady.value = false
			return false
		}
		try {
			const snap = await deepseekHarness.snapshot()
			const st = snap?.status
			serviceReady.value = Boolean(st?.ready && st.lifecycle === 'running' && st.runId)
		} catch {
			serviceReady.value = false
		}
		return serviceReady.value
	}

	/**
	 * 创建 DSH 会话。
	 *
	 * 重要：每次发送消息都创建新 session（与 AIWorkflow 的 blender agent 一致），
	 * 不复用旧 session。原因：DSH session/prompt 不支持独立 systemMessage 字段，
	 * systemPrompt 作为 content 的一部分传入。如果复用 session，第二次请求时
	 * 模型会把 [系统指令] 当作用户输入复述。每次新 session 能让模型正确理解
	 * system prompt 是指令而非用户输入。
	 */
	async function createSession(): Promise<string> {
		const bridge = getAgentChatBridge()
		const dshService = bridge.getService('dshagent') as DSHAgentChatService
		dshService.setBaseUrl('http://127.0.0.1:3080')
		const session = await bridge.createSession('dshagent', {
			title: '导演控制台分镜助手'
		})
		sessionId = session.id
		return sessionId
	}

	/**
	 * 发送消息（支持文本 + 图片）。
	 *
	 * 关键改动：不再把 DIRECTOR_CONSOLE_SYSTEM_PROMPT 拼到 content 里，
	 * 而是通过 options.systemPrompt 单独传递；构建 history 传入 options.history，
	 * 让 DSH 侧能区分系统指令和用户输入，避免重复输出介绍文本。
	 */
	async function sendMessage(text: string, attachments: UploadedAttachment[] = []) {
		if (!text.trim() && attachments.length === 0) return
		if (!(await checkServiceReady())) {
			pushUserMessage(text, attachments)
			pushAssistantMessage('DeepSeek-Harness 服务未运行，请先在服务页启动。', 'error')
			return
		}

		isLoading.value = true
		pushUserMessage(text, attachments)
		const assistantId = 'assistant-' + Date.now()
		pushAssistantMessage('', 'streaming', assistantId)

		try {
			const sid = await createSession()
			const bridge = getAgentChatBridge()
			const dshService = bridge.getService('dshagent') as DSHAgentChatService

			// 构建 history：从已完成的消息中提取多轮对话
			// 排除当前正在流式中的 assistant 消息（assistantId）
			// 排除 status=error 的消息
			const history = messages.value
				.filter(
					(m) =>
						m.id !== assistantId &&
						m.status !== 'error' &&
						(m.role === 'user' || m.status === 'done')
				)
				.map((m) => ({
					role: m.role as 'user' | 'assistant',
					content: m.content
				}))

			// content 只包含本次用户输入 + 附件，不再包含 system prompt
			const contentParts: any[] = [{ type: 'text', text }]
			for (const att of attachments) {
				if (att.type.startsWith('image/')) {
					// dataUrl: data:image/png;base64,xxxx
					const commaIdx = att.dataUrl.indexOf(',')
					const b64 = commaIdx >= 0 ? att.dataUrl.slice(commaIdx + 1) : att.dataUrl
					contentParts.push({
						type: 'image',
						mediaType: att.type,
						data: b64,
						name: att.name
					})
				} else if (att.type.startsWith('text/') || att.name.match(/\.(txt|md|json)$/i)) {
					// 文本文件内容作为文本追加
					try {
						const decoded = atob(att.dataUrl.split(',')[1] || att.dataUrl)
						contentParts.push({ type: 'text', text: `[附件 ${att.name}]\n${decoded}` })
					} catch {
						contentParts.push({ type: 'text', text: `[附件 ${att.name}]` })
					}
				}
			}

			isStreaming.value = true
			// 通过 options.systemPrompt 和 options.history 传递，content 只含本次用户输入
			for await (const ev of dshService.sendMessage(
				sid,
				{
					content: contentParts as any,
					systemPrompt: DIRECTOR_CONSOLE_SYSTEM_PROMPT,
					history
				},
				abortController.signal
			)) {
				handleStreamEvent(ev, assistantId)
			}
			isStreaming.value = false
			updateAssistantStatus(assistantId, 'done')
			// 思考完成，停止流式思考标记
			setThinkingStreaming(assistantId, false)
		} catch (err: any) {
			updateAssistantStatus(assistantId, 'error')
			setThinkingStreaming(assistantId, false)
			appendAssistantText(assistantId, '\n\n[错误] ' + (err?.message || String(err)))
		} finally {
			isLoading.value = false
			isStreaming.value = false
		}
	}

	/** 处理流式事件 */
	function handleStreamEvent(ev: ChatStreamEvent, assistantId: string) {
		// 诊断日志：输出事件类型（文本/思考增量只打印长度，不打印内容）
		const contentLen = 'content' in ev ? (ev.content as string)?.length || 0 : 0
		console.log('[DC-Chat] stream event:', ev.type, contentLen > 0 ? `len=${contentLen}` : '')
		switch (ev.type) {
			case 'text_delta':
				appendAssistantText(assistantId, ev.content)
				break
			case 'thinking_delta':
				// 流式思考过程累积到 thinkingContent
				appendAssistantThinking(assistantId, ev.content)
				break
			case 'tool_call_start':
				addToolCall(assistantId, {
					toolCallId: ev.toolCallId,
					tool: ev.tool,
					input: ev.input,
					status: 'running'
				})
				break
			case 'tool_call_end':
				updateToolCall(assistantId, ev.toolCallId, {
					output: ev.output,
					status: 'done'
				})
				break
			case 'tool_call_error':
				updateToolCall(assistantId, ev.toolCallId, {
					error: ev.error,
					status: 'error'
				})
				break
			case 'error':
				appendAssistantText(assistantId, '\n\n[错误] ' + ev.message)
				break
		}
	}

	function pushUserMessage(text: string, attachments: UploadedAttachment[]) {
		messages.value.push({
			id: 'user-' + Date.now(),
			role: 'user',
			content: text,
			images: attachments.filter((a) => a.type.startsWith('image/')).map((a) => a.dataUrl)
		})
	}

	function pushAssistantMessage(
		content: string,
		status: ChatMessage['status'] = 'streaming',
		id?: string
	) {
		messages.value.push({
			id: id || 'assistant-' + Date.now(),
			role: 'assistant',
			content,
			toolCalls: [],
			status,
			thinkingContent: '',
			isStreamingThinking: false,
			thinkingCollapsed: false
		})
	}

	function appendAssistantText(id: string, delta: string) {
		const msg = messages.value.find((m) => m.id === id)
		if (msg) msg.content += delta
	}

	function appendAssistantThinking(id: string, delta: string) {
		const msg = messages.value.find((m) => m.id === id)
		if (msg) {
			if (!msg.thinkingContent) msg.thinkingContent = ''
			msg.thinkingContent += delta
			msg.isStreamingThinking = true
		}
	}

	function setThinkingStreaming(id: string, streaming: boolean) {
		const msg = messages.value.find((m) => m.id === id)
		if (msg) msg.isStreamingThinking = streaming
	}

	function updateAssistantStatus(id: string, status: ChatMessage['status']) {
		const msg = messages.value.find((m) => m.id === id)
		if (msg) msg.status = status
	}

	function addToolCall(assistantId: string, record: ToolCallRecord) {
		const msg = messages.value.find((m) => m.id === assistantId)
		if (msg) {
			msg.toolCalls = msg.toolCalls || []
			msg.toolCalls.push(record)
		}
	}

	function updateToolCall(assistantId: string, toolCallId: string, patch: Partial<ToolCallRecord>) {
		const msg = messages.value.find((m) => m.id === assistantId)
		const tc = msg?.toolCalls?.find((t) => t.toolCallId === toolCallId)
		if (tc) Object.assign(tc, patch)
	}

	/** 切换思考块折叠状态 */
	function toggleThinkingCollapsed(id: string) {
		const msg = messages.value.find((m) => m.id === id)
		if (msg) msg.thinkingCollapsed = !msg.thinkingCollapsed
	}

	/** 停止当前流式输出 */
	function stopStreaming() {
		abortController.abort()
		isStreaming.value = false
	}

	/** 清空对话 */
	function clearChat() {
		messages.value = []
		sessionId = ''
	}

	onUnmounted(() => {
		abortController.abort()
	})

	return {
		messages,
		isLoading,
		isStreaming,
		serviceReady,
		checkServiceReady,
		sendMessage,
		stopStreaming,
		clearChat,
		toggleThinkingCollapsed
	}
}
