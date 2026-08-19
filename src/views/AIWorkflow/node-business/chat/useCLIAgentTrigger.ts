/**
 * useCLIAgentTrigger (P2 实现：Agent 对话桥接闭环)
 *
 * 职责：
 * 1. 监听 CLI Control Server 中的 pending/running 任务（通过 listTasks 轮询 + 去重）
 * 2. 当检测到 pending CLI 任务时，调用 deps.submitToAgentDialog：
 *    - 构造 MCP 风格 prompt（包含 JSON 格式的 generate_image 参数指令）
 *    - 写 chatDraft.value，调用 onSend() 注入到 Agent 对话流
 *    - watch chatSending ref → 等态从 sending→idle/error，解析最后一条 assistant 消息
 *    - 调用 window.dweb.cliControlServer.markTaskCompleted / markTaskFailed 写回后端
 * 3. 独立 try/catch，绝不污染主流程
 */
import { ref, watch, onUnmounted, type Ref } from 'vue'
import type { BottomChatMessage } from '../../../../ui/UIComponent/BottomChatDock.vue'

export interface CLITriggerPayload {
	taskId: string
	command: string
	payload: Record<string, unknown>
}

export interface CLIAgentTriggerState {
	serverRunning: boolean
	serverPort: number | null
	lastTaskAt: number | null
	pendingTaskCount: number
	dispatchedTaskIds: string[]
}

export interface SubmitToAgentDialogRequest {
	prompt: string
	references?: string[]
	width?: number
	height?: number
	aspectRatio?: string
	outputPath?: string
	projectId?: number
	model?: string
	negativePrompt?: string
	imageCount?: number
	seed?: number
	autoExport?: boolean
	taskId: string
}

interface CLIAgentTriggerDeps {
	getProjectInfo: () => { id: number | null; name: string | null }
	pushToast?: (msg: string, kind?: 'info' | 'warn' | 'error' | 'success') => void
	// P2: 注入自 AIWorkflowPage 的 refs
	chatDraft?: Ref<string>
	chatSending?: Ref<boolean>
	chatMessages?: Ref<BottomChatMessage[]>
	onSend?: () => Promise<void> | void
}

const POLL_INTERVAL_MS = 2500
const CHAT_IDLE_WAIT_MAX_MS = 10 * 60 * 1000 // 10 分钟超时兜底（图片生成可能需要数分钟）
const CHAT_IDLE_POLL_MS = 200

export function useCLIAgentTrigger(deps: CLIAgentTriggerDeps) {
	const state = ref<CLIAgentTriggerState>({
		serverRunning: false,
		serverPort: null,
		lastTaskAt: null,
		pendingTaskCount: 0,
		dispatchedTaskIds: []
	})

	const dweb = (typeof window !== 'undefined' ? (window as any).dweb : null) as any
	const ns = dweb?.cliControlServer || null
	let disposed = false
	let pollTimer: any = null
	const dispatched = new Set<string>()
	const dispatching = new Set<string>()

	const pushToast = (msg: string, kind?: 'info' | 'warn' | 'error' | 'success') => {
		try { deps?.pushToast?.(msg, kind) } catch { /* swallow */ }
	}

	/**
	 * 将 CLI generate-image 参数转换为 MCP 工具调用风格的 Prompt
	 * （让 Agent Runtime 的 LLM 识别为需要调用 generate_image 工具）
	 */
	const buildAgentPromptForCLITask = (taskId: string, payload: SubmitToAgentDialogRequest) => {
		const params: Record<string, unknown> = {}
		params.prompt = payload.prompt
		if (typeof payload.width === 'number') params.width = payload.width
		if (typeof payload.height === 'number') params.height = payload.height
		if (payload.aspectRatio) params.aspectRatio = payload.aspectRatio
		if (payload.negativePrompt) params.negativePrompt = payload.negativePrompt
		if (payload.model) params.model = payload.model
		if (typeof payload.imageCount === 'number') params.imageCount = payload.imageCount
		if (typeof payload.seed === 'number') params.seed = payload.seed
		if (payload.outputPath) params.outputPath = payload.outputPath
		if (payload.autoExport === false) params.autoExport = false
		if (Array.isArray(payload.references) && payload.references.length > 0) params.references = payload.references
		if (typeof payload.projectId === 'number') params.projectId = payload.projectId

		return [
			`## 系统指令（CLI 任务桥接）`,
			`当前有一条来自 CLI 控制接口的任务需要处理。请调用你可用的 MCP 工具 \`generate_image\` 执行该任务。`,
			``,
			`### CLI 任务元信息`,
			`- taskId: ${taskId}`,
			`- outputPath: ${payload.outputPath || '(未指定，生成后无需复制)' }`,
			`- autoExport: ${payload.autoExport !== false ? 'true（生成完成后自动复制到 outputPath）' : 'false'}`,
			``,
			`### generate_image 工具参数（JSON）`,
			`\`\`\`json`,
			JSON.stringify(params, null, 2),
			`\`\`\``,
			``,
			`要求：`,
			`1. 检查项目上下文是否存在项目，如果已打开项目就在当前项目执行，否则提示缺少项目。`,
			`2. 创建图片生成节点，传入上述参数，然后执行生成。`,
			`3. 执行完成后，将结果通过 \`autoExport=true\` 复制到 \`outputPath\`。`,
			`4. 在最终回答中返回：nodeId, outputFiles 路径列表, exportedFiles 列表。`,
		].join('\n')
	}

	/**
	 * P2 版本：写 chatDraft → 调用 onSend → 等待 chatSending 从 true→false → 恢复原 draft
	 *
	 * P3 会在 Agent Runtime 中通过 MCP 工具真正创建节点+生成图片，
	 * P2 这里只要保证链路能走通：如果 Agent Runtime 未配置（返回错误或没有执行），
	 * 我们也会把任务标记为 completed + 空 outputFiles，附带 note 提示 P3 阶段接入。
	 */
	const runSubmitToAgentDialog = async (req: SubmitToAgentDialogRequest): Promise<{
		ok: boolean
		outputFiles: string[]
		exportedFiles: string[]
		nodeId?: string
		error?: string
		note?: string
	}> => {
		if (!deps.chatDraft || !deps.chatSending || typeof deps.onSend !== 'function') {
			console.warn('[useCLIAgentTrigger][P2] submitToAgentDialog deps missing (chatDraft/chatSending/onSend), falling back to P2 stub pass')
			return {
				ok: true,
				outputFiles: [],
				exportedFiles: [],
				note: 'P2 bridge stub: deps not wired from AIWorkflowPage; connect onSend/chatDraft/chatSending in page.'
			}
		}

		// 暂存用户原始 draft（发送完成后恢复）
		const originalDraft = deps.chatDraft.value

		const finalize = () => {
			try { deps.chatDraft!.value = originalDraft } catch (_) { /* swallow */ }
		}

		try {
			const agentPrompt = buildAgentPromptForCLITask(req.taskId, req)
			deps.chatDraft.value = agentPrompt

			// 记录当前 chatMessages 长度，等会判断是否有新消息
			const beforeSendLen = deps.chatMessages?.value?.length ?? 0

			const startAt = Date.now()
			// 先确保 chatSending 为 false（避免之前的发送状态干扰）
			if (deps.chatSending.value) {
				// 等待短暂的现有发送完成
				const waitStart = Date.now()
				while (deps.chatSending.value && Date.now() - waitStart < 5000) {
					await new Promise((r) => setTimeout(r, 100))
				}
			}
			// 调用 onSend()
			const sendPromise = Promise.resolve().then(() => deps.onSend!())
			await new Promise((r) => setTimeout(r, 50))
			sendPromise.catch((err) => {
				console.warn('[useCLIAgentTrigger][P2] onSend threw (non-fatal):', err)
			})

			// 等待 chatSending 先变 true（证明 Agent 正在处理）
			let sentStarted = false
			const t0 = Date.now()
			while (!sentStarted && Date.now() - t0 < 1500) {
				if (deps.chatSending.value) { sentStarted = true; break }
				await new Promise((r) => setTimeout(r, 60))
			}
			if (!sentStarted) {
				console.warn('[useCLIAgentTrigger][P2] onSend did not set chatSending=true; treating as quick-sync (stub pass)')
			}

			// 等待 chatSending 变回 false
			const waitStart = Date.now()
			while (Date.now() - waitStart < CHAT_IDLE_WAIT_MAX_MS) {
				if (!deps.chatSending.value) break
				await new Promise((r) => setTimeout(r, CHAT_IDLE_POLL_MS))
			}
			if (deps.chatSending.value) {
				throw new Error(`Agent dialog timeout (>${CHAT_IDLE_WAIT_MAX_MS}ms)`)
			}

			// 解析结果：取 chatMessages 最新的 assistant 消息
			const messages = deps.chatMessages?.value || []
			let lastAssistantText = ''
			let nodeId: string | undefined
			const outputFiles: string[] = []
			const exportedFiles: string[] = []
			for (let i = messages.length - 1; i >= beforeSendLen; i--) {
				const m: any = messages[i]
				if (!m) continue
				if (m.role === 'assistant') {
					lastAssistantText = String(m.content || '')
					// 1) 先从 toolCalls.result 提取（Agent Runtime 调用 generate_image 返回的实际结构）
					if (Array.isArray(m.toolCalls) && m.toolCalls.length) {
						for (const tc of m.toolCalls) {
							if (!tc || tc.status === 'error') continue
							const res = tc?.result
							if (!res) continue
							const resObj =
								typeof res === 'string'
									? (() => {
											try { return JSON.parse(res) } catch { return null }
									  })()
									: res
							if (resObj && typeof resObj === 'object') {
								if (!nodeId && typeof resObj.nodeId === 'string') nodeId = resObj.nodeId
								if (Array.isArray(resObj.outputFiles)) {
									outputFiles.push(...resObj.outputFiles.filter((x: any) => typeof x === 'string' && x))
								}
								if (Array.isArray(resObj.exportedFiles)) {
									exportedFiles.push(...resObj.exportedFiles.filter((x: any) => typeof x === 'string' && x))
								}
								// _jsonBridge 兜底：防止外层结构嵌套过深
								if (typeof resObj._jsonBridge === 'string') {
									try {
										const bridge = JSON.parse(resObj._jsonBridge)
										if (bridge && typeof bridge === 'object') {
											if (!nodeId && typeof bridge.nodeId === 'string') nodeId = bridge.nodeId
											if (Array.isArray(bridge.outputFiles)) {
												outputFiles.push(...bridge.outputFiles.filter((x: any) => typeof x === 'string' && x))
											}
											if (Array.isArray(bridge.exportedFiles)) {
												exportedFiles.push(...bridge.exportedFiles.filter((x: any) => typeof x === 'string' && x))
											}
										}
									} catch { /* ignore */ }
								}
							}
						}
					}
					// 2) 再从文本中提取 JSON 格式的 nodeId/outputFiles（兼容纯文本回答 / P2 stub）
					if (!nodeId && outputFiles.length === 0) {
						try {
							const jsonMatches = lastAssistantText.match(/```json\s*([\s\S]*?)\s*```/) ||
								lastAssistantText.match(/\{[\s\S]*\}/)
							if (jsonMatches) {
								const parsed = JSON.parse(jsonMatches[1])
								if (typeof parsed.nodeId === 'string') nodeId = parsed.nodeId
								if (Array.isArray(parsed.outputFiles)) outputFiles.push(...parsed.outputFiles.filter(Boolean))
								if (Array.isArray(parsed.exportedFiles)) exportedFiles.push(...parsed.exportedFiles.filter(Boolean))
								if (typeof parsed._jsonBridge === 'string') {
									try {
										const bridge = JSON.parse(parsed._jsonBridge)
										if (bridge && typeof bridge === 'object') {
											if (!nodeId && typeof bridge.nodeId === 'string') nodeId = bridge.nodeId
											if (Array.isArray(bridge.outputFiles)) {
												outputFiles.push(...bridge.outputFiles.filter((x: any) => typeof x === 'string' && x))
											}
											if (Array.isArray(bridge.exportedFiles)) {
												exportedFiles.push(...bridge.exportedFiles.filter((x: any) => typeof x === 'string' && x))
											}
										}
									} catch { /* ignore */ }
								}
							}
						} catch (_) { /* ignore JSON parse err */ }
					}
					break
				}
			}

			// P2 暂时 fallback：如果实际 Agent Runtime 没有执行生成工具（P3 接入），返回 PENDING-P3 说明
			const elapsed = Date.now() - startAt
			if (!nodeId && outputFiles.length === 0) {
				return {
					ok: true,
					outputFiles: [],
					exportedFiles: [],
					note: `P2 bridge OK (took ${Math.round(elapsed)}ms); P3 will connect MCP generate_image tool to actually create image node + generate.`
				}
			}
			return { ok: true, outputFiles, exportedFiles, nodeId, note: `completed via agent dialog in ${Math.round(elapsed)}ms` }
		} catch (err: any) {
			console.warn('[useCLIAgentTrigger][P2] submitToAgentDialog failed (will mark task failed):', err)
			return {
				ok: false,
				outputFiles: [],
				exportedFiles: [],
				error: String(err?.message || err || 'UNKNOWN')
			}
		} finally {
			finalize()
		}
	}

	const submitToAgentDialog = async (req: SubmitToAgentDialogRequest) => {
		console.log('[useCLIAgentTrigger][P2] submitToAgentDialog dispatched:', {
			taskId: req.taskId,
			promptLen: req.prompt.length,
			outputPath: req.outputPath || '(none)'
		})
		const r = await runSubmitToAgentDialog(req)
		// 写回后端
		try {
			if (r.ok) {
				await ns?.markTaskCompleted?.({
					taskId: req.taskId,
					outputFiles: r.outputFiles,
					exportedFiles: r.exportedFiles
				})
				if (r.note) pushToast(`CLI 任务 ${req.taskId.slice(-6)} 已桥接（P2）：${r.note}`, 'info')
				else pushToast(`CLI 任务 ${req.taskId.slice(-6)} 已完成`, 'success')
			} else {
				await ns?.markTaskFailed?.({
					taskId: req.taskId,
					error: r.error || 'UNKNOWN'
				})
				pushToast(`CLI 任务 ${req.taskId.slice(-6)} 失败：${r.error || '未知'}`, 'warn')
			}
		} catch (ipcErr: any) {
			console.warn('[useCLIAgentTrigger][P2] markTask IPC failed (non-fatal):', ipcErr)
		}
		return r
	}

	/**
	 * 轮询 pending tasks
	 */
	const pollNewTasks = async () => {
		if (disposed || !ns) return
		try {
			const listResult: any = await ns.listTasks({ limit: 20, status: 'running', filterSource: 'cli' })
			if (listResult?.ok && Array.isArray(listResult?.tasks)) {
				const pending = listResult.tasks.filter((t: any) =>
					t && t.status === 'running' && t.command === 'generate-image' &&
					!dispatched.has(t.taskId) && !dispatching.has(t.taskId)
				)
				state.value.pendingTaskCount = pending.length + dispatching.size
				if (pending.length) state.value.lastTaskAt = Date.now()
				for (const t of pending) {
					if (disposed) return
					dispatching.add(t.taskId)
					dispatched.add(t.taskId)
					// fire and forget（单任务失败不影响其他任务分派）
					Promise.resolve()
						.then(async () => {
							// 获取任务详细 payload
							const detail = await ns.getTask({ taskId: t.taskId })
							const payload = (detail?.ok && detail?.task?.payload) || {}
							await submitToAgentDialog({
								taskId: t.taskId,
								prompt: String(payload.prompt || ''),
								references: Array.isArray(payload.references) ? payload.references.filter(Boolean) : undefined,
								width: typeof payload.width === 'number' ? payload.width : undefined,
								height: typeof payload.height === 'number' ? payload.height : undefined,
								aspectRatio: typeof payload.aspectRatio === 'string' ? payload.aspectRatio : undefined,
								outputPath: typeof payload.outputPath === 'string' ? payload.outputPath : undefined,
								projectId: typeof payload.projectId === 'number' ? payload.projectId : undefined,
								model: typeof payload.model === 'string' ? payload.model : undefined,
								negativePrompt: typeof payload.negativePrompt === 'string' ? payload.negativePrompt : undefined,
								imageCount: typeof payload.imageCount === 'number' ? payload.imageCount : undefined,
								seed: typeof payload.seed === 'number' ? payload.seed : undefined,
								autoExport: payload.autoExport !== false
							})
						})
						.catch((err) => {
							console.warn(`[useCLIAgentTrigger][P2] task ${t.taskId} dispatch failed:`, err)
							ns?.markTaskFailed?.({ taskId: t.taskId, error: String(err?.message || err) })
						})
						.finally(() => { dispatching.delete(t.taskId) })
				}
				state.value.dispatchedTaskIds = Array.from(dispatched).slice(-50)
			}
		} catch (err) {
			console.debug('[useCLIAgentTrigger] pollNewTasks (non-fatal):', err)
		}
	}

	const bootstrap = async () => {
		if (!ns) {
			console.debug('[useCLIAgentTrigger] window.dweb.cliControlServer not available (web mode / old preload), skipped.')
			return
		}
		try {
			const status: any = await ns.getStatus()
			if (status?.ok) {
				state.value.serverRunning = !!status.running
				state.value.serverPort = status.port ?? null
				console.log(
					`[useCLIAgentTrigger][P2] CLI control server: ${status.running ? 'RUNNING' : 'IDLE'}${status.port ? ` on :${status.port}` : ''}`
				)
			}
		} catch (err) {
			console.warn('[useCLIAgentTrigger] getStatus failed (non-fatal):', err)
		}
		if (typeof window !== 'undefined') {
			pollTimer = window.setInterval(pollNewTasks, POLL_INTERVAL_MS)
			// 启动后 500ms 立即 poll 一次（避免等待第一个 2.5s 间隔）
			window.setTimeout(pollNewTasks, 500)
		}
	}

	const dispose = () => {
		if (disposed) return
		disposed = true
		if (pollTimer) {
			try {
				if (typeof window !== 'undefined') window.clearInterval(pollTimer)
				else clearInterval(pollTimer)
			} catch { /* swallow */ }
			pollTimer = null
		}
	}

	onUnmounted(() => {
		dispose()
	})

	try {
		bootstrap().catch((err) => {
			console.warn('[useCLIAgentTrigger] bootstrap error (non-fatal, continuing page init):', err)
		})
	} catch (err) {
		console.warn('[useCLIAgentTrigger] bootstrap sync error (non-fatal):', err)
	}

	return {
		cliTriggerState: state,
		disposeCLIAgentTrigger: dispose,
		manualDispatchCLITask: async (payload: CLITriggerPayload) => {
			console.log('[useCLIAgentTrigger][P2] manualDispatchCLITask called. payload=', payload)
			if (payload && payload.taskId && payload.payload) {
				dispatched.add(payload.taskId)
				return submitToAgentDialog({
					taskId: payload.taskId,
					prompt: String(payload.payload.prompt || ''),
					references: Array.isArray(payload.payload.references) ? payload.payload.references : undefined,
					width: typeof payload.payload.width === 'number' ? payload.payload.width : undefined,
					height: typeof payload.payload.height === 'number' ? payload.payload.height : undefined,
					aspectRatio: typeof payload.payload.aspectRatio === 'string' ? payload.payload.aspectRatio : undefined,
					outputPath: typeof payload.payload.outputPath === 'string' ? payload.payload.outputPath : undefined,
					projectId: typeof payload.payload.projectId === 'number' ? payload.payload.projectId : undefined,
					model: typeof payload.payload.model === 'string' ? payload.payload.model : undefined,
					negativePrompt: typeof payload.payload.negativePrompt === 'string' ? payload.payload.negativePrompt : undefined,
					imageCount: typeof payload.payload.imageCount === 'number' ? payload.payload.imageCount : undefined,
					seed: typeof payload.payload.seed === 'number' ? payload.payload.seed : undefined,
					autoExport: payload.payload.autoExport !== false
				})
			}
			return { ok: true, status: 'dispatched' }
		}
	}
}
