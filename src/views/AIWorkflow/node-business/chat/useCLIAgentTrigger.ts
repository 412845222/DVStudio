/**
 * useCLIAgentTrigger (P2 实现：Agent 对话桥接闭环)
 *
 * 职责：
 * 1. 轮询 CLI Control Server 任务（listTasks，范围：最近 90s 内的 running/completed + 未分派的任务）
 *    - running → 提交到 Agent 对话框（P2 submitToAgentDialog）
 *    - completed/cancelled → 消费 task.meta 里排队的：
 *        a) createImageNodeRequests[] → createImageNodeAtCenter 创建 image 预览节点
 *        b) chatPreviewBlocks[]     → 在聊天对话框追加 assistant 图片块预览
 * 2. try/catch 隔离，绝不污染主流程
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
	// 与蓝图节点面板参数完全对齐的 Seedream Endpoint 字段
	seedreamModelVersion?: string
	imageModel?: string
	endpoint_id?: string
	negativePrompt?: string
	imageCount?: number
	seed?: number
	autoExport?: boolean
	taskId: string
}

export interface CreateImagePreviewNodeDeps {
	createImageNodeAtCenter?: (
		url: string,
		name?: string,
		opts?: {
			taskId?: string
			mode?: string
			imageGenerationSource?: string
			imageUrls?: string[]
			/** 本地绝对路径（蓝图项目目录内或外均可），若提供会据此创建 WorkflowResource。*/
			sourceLocalPath?: string
			/** sourceLocalPath 对应的文件大小（可选） */
			sourceFileSize?: number
		}
	) => string | null
}

export interface AppendChatPreviewBlockDeps {
	/** 直接追加 assistant 消息到底部聊天 */
	pushAssistantMessage?: (blocks: ChatPreviewBlock[]) => boolean | void | Promise<boolean | void>
	/** 或者给一个 chatMessages ref + pushFn，自行构造消息对象 */
	chatMessages?: Ref<any[]>
	appendAssistantMessage?: (message: any) => void
}

export type ChatPreviewBlock = {
	type: 'image_url'
	url: string
	sourceLocalPath?: string
	title?: string
	promptPreview?: string
	createdAt?: number
}

interface CLIAgentTriggerDeps {
	getProjectInfo: () => { id: number | null; name: string | null }
	pushToast?: (msg: string, kind?: 'info' | 'warn' | 'error' | 'success') => void
	// P2: 注入自 AIWorkflowPage 的 refs
	chatDraft?: Ref<string>
	chatSending?: Ref<boolean>
	chatMessages?: Ref<BottomChatMessage[]>
	onSend?: () => Promise<void> | void
	// 蓝图 image 预览节点创建（来自 createImageNodeAtCenter）
	createImagePreviewNode?: CreateImagePreviewNodeDeps
	// 聊天预览块追加
	chatPreview?: AppendChatPreviewBlockDeps
}

const POLL_INTERVAL_MS = 2500
const CHAT_IDLE_WAIT_MAX_MS = 10 * 60 * 1000
const CHAT_IDLE_POLL_MS = 200
const RECENT_COMPLETED_WINDOW_MS = 90 * 1000 // 最近 90s 内的 completed/cancelled 任务也拿回来（用于消费预览请求）

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
	const previewConsumed = new Set<string>() // <taskId>|<reqId>

	const pushToast = (msg: string, kind?: 'info' | 'warn' | 'error' | 'success') => {
		try {
			deps?.pushToast?.(msg, kind)
		} catch {
			/* swallow */
		}
	}

	const DEFAULT_SEEDREAM_MODEL = 'doubao-seedream-4-5-251128'

	// Provider-only 短名（与 builtinTools.mjs / service.mjs 完全对齐，避免把这些显示名当作真实 Endpoint ID）
	const PROVIDER_ONLY_SHORT_NAMES = new Set([
		'seedream',
		'gemini',
		'nanobanana',
		'meshy',
		'tripo3d',
		'seedance',
		'jimeng',
		'bytedance',
		'volcengine',
		'doubao',
		'ark',
		'openai',
		'coze'
	])

	// 判断字符串是否"看起来像"一个真实可调用的 Doubao Ark Seedream Endpoint ID
	// 逻辑与 builtinTools.mjs looksLikeRealSeedreamEndpointId 完全一致
	const looksLikeRealSeedreamEndpointId = (m: string | undefined | null): boolean => {
		if (!m) return false
		const raw = String(m).trim()
		if (!raw) return false
		const s = raw.toLowerCase()
		if (PROVIDER_ONLY_SHORT_NAMES.has(s)) return false
		if (s.startsWith('ep-')) return true
		if (s.startsWith('doubao-') && s.length >= 15) return true
		if (s.startsWith('jimeng-') && s.length >= 12) return true
		if (s.startsWith('seedance-') && s.length >= 12) return true
		if (s.startsWith('seedream-') && s.length >= 15) return true
		if (s.startsWith('bytedance-') && s.length >= 15) return true
		if (s.length >= 10 && (s.includes('-') || s.includes('_'))) return true
		return false
	}

	// 与 builtinTools.mjs resolveSeedreamEndpointFromArgs / service.mjs resolveSeedreamEndpointFromPayload 优先级完全一致：
	//   seedreamModelVersion > imageModel > endpoint_id > model
	const resolveSeedreamEndpoint = (payload: SubmitToAgentDialogRequest): string => {
		const candidates = [
			payload.seedreamModelVersion,
			payload.imageModel,
			payload.endpoint_id,
			payload.model
		]
		for (const raw of candidates) {
			const s = String(raw || '').trim()
			if (!s) continue
			if (looksLikeRealSeedreamEndpointId(s)) return s
		}
		return DEFAULT_SEEDREAM_MODEL
	}

	const buildAgentPromptForCLITask = (taskId: string, payload: SubmitToAgentDialogRequest) => {
		const params: Record<string, unknown> = {}
		params.prompt = payload.prompt
		if (typeof payload.width === 'number') params.width = payload.width
		if (typeof payload.height === 'number') params.height = payload.height
		if (payload.aspectRatio) params.aspectRatio = payload.aspectRatio
		if (payload.negativePrompt) params.negativePrompt = payload.negativePrompt

		// 与蓝图节点面板参数结构完全对齐：
		//   1) model / imageModel = provider 短名 'seedream'，用于 normalizeImageModel 的 kind 路由分支
		//   2) seedreamModelVersion = 真实 Doubao Ark Endpoint ID，由 normalizeImageModel(rawModel==='seedream') 分支读取
		const resolvedEndpoint = resolveSeedreamEndpoint(payload)
		params.model = 'seedream'
		params.imageModel = 'seedream'
		params.seedreamModelVersion = resolvedEndpoint

		if (typeof payload.imageCount === 'number') params.imageCount = payload.imageCount
		if (typeof payload.seed === 'number') params.seed = payload.seed
		if (payload.outputPath) params.outputPath = payload.outputPath
		if (payload.autoExport === false) params.autoExport = false
		if (Array.isArray(payload.references) && payload.references.length > 0)
			params.references = payload.references
		if (typeof payload.projectId === 'number') params.projectId = payload.projectId

		return [
			`## 系统指令（CLI 任务桥接）`,
			`当前有一条来自 CLI 控制接口的任务需要处理。请调用你可用的 MCP 工具 \`generate_image\` 执行该任务。`,
			``,
			`### CLI 任务元信息`,
			`- taskId: ${taskId}`,
			`- outputPath: ${payload.outputPath || '(未指定，自动落到 <项目>/generated_media/<项目名>/images/)'}`,
			`- autoExport: ${payload.autoExport !== false ? 'true（生成完成后自动复制到 outputPath）' : 'false'}`,
			`- seedreamModelVersion: ${resolvedEndpoint}（与蓝图图片节点参数面板的 "Seedream model version" 下拉完全一致）`,
			``,
			`### generate_image 工具参数（JSON）`,
			`\`\`\`json`,
			JSON.stringify(params, null, 2),
			`\`\`\``,
			``,
			`要求：`,
			`1. 检查项目上下文，如果已打开蓝图项目就在当前项目执行。`,
			`2. 调用 generate_image 工具（优先使用字节方舟 Seedream）生成图片。`,
			`3. autoExport=true 时，把生成的图片复制到 outputPath。若 outputPath 为空，工具会自动落到 <项目根>/generated_media/<项目名>/images/。`,
			`4. 在最终回答中返回：nodeId, outputFiles 路径列表, exportedFiles 列表。`,
			`5. 在蓝图上创建 image 类型预览节点（createImageNodeAtCenter），并在 assistant 回答中附上图片预览块（image_url）。`
		].join('\n')
	}

	const runSubmitToAgentDialog = async (
		req: SubmitToAgentDialogRequest
	): Promise<{
		ok: boolean
		outputFiles: string[]
		exportedFiles: string[]
		nodeId?: string
		error?: string
		note?: string
	}> => {
		if (!deps.chatDraft || !deps.chatSending || typeof deps.onSend !== 'function') {
			const missing: string[] = []
			if (!deps.chatDraft) missing.push('chatDraft')
			if (!deps.chatSending) missing.push('chatSending')
			if (typeof deps.onSend !== 'function') missing.push('onSend')
			const msg = `[useCLIAgentTrigger][P2] Agent 对话桥接依赖缺失（${missing.join('、')}），无法在 Agent 对话框中发起会话。请打开蓝图界面的 AI 聊天面板后重试。`
			console.warn(msg)
			pushToast(
				`CLI 任务 ${req.taskId.slice(-6)} 未能发起 Agent 会话：${missing.join('/')} 未绑定。请先打开蓝图的聊天面板。`,
				'warn'
			)
			return {
				ok: false,
				outputFiles: [],
				exportedFiles: [],
				error: `AGENT_BRIDGE_DEPS_MISSING:${missing.join(',')}`,
				note: msg
			}
		}

		const originalDraft = deps.chatDraft.value
		const finalize = () => {
			try {
				deps.chatDraft!.value = originalDraft
			} catch (_) {
				/* swallow */
			}
		}

		try {
			const agentPrompt = buildAgentPromptForCLITask(req.taskId, req)
			deps.chatDraft.value = agentPrompt

			const beforeSendLen = deps.chatMessages?.value?.length ?? 0
			const startAt = Date.now()

			if (deps.chatSending.value) {
				const waitStart = Date.now()
				while (deps.chatSending.value && Date.now() - waitStart < 5000) {
					await new Promise((r) => setTimeout(r, 100))
				}
			}
			const sendPromise = Promise.resolve().then(() => deps.onSend!())
			await new Promise((r) => setTimeout(r, 50))
			sendPromise.catch((err) => {
				console.warn('[useCLIAgentTrigger][P2] onSend threw (non-fatal):', err)
			})

			let sentStarted = false
			const t0 = Date.now()
			while (!sentStarted && Date.now() - t0 < 1500) {
				if (deps.chatSending.value) {
					sentStarted = true
					break
				}
				await new Promise((r) => setTimeout(r, 60))
			}

			const waitStart = Date.now()
			while (Date.now() - waitStart < CHAT_IDLE_WAIT_MAX_MS) {
				if (!deps.chatSending.value) break
				await new Promise((r) => setTimeout(r, CHAT_IDLE_POLL_MS))
			}
			if (deps.chatSending.value) {
				throw new Error(`Agent dialog timeout (>${CHAT_IDLE_WAIT_MAX_MS}ms)`)
			}

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
					if (Array.isArray(m.toolCalls) && m.toolCalls.length) {
						for (const tc of m.toolCalls) {
							if (!tc || tc.status === 'error') continue
							const res = tc?.result
							if (!res) continue
							const resObj =
								typeof res === 'string'
									? (() => {
											try {
												return JSON.parse(res)
											} catch {
												return null
											}
										})()
									: res
							if (resObj && typeof resObj === 'object') {
								if (!nodeId && typeof resObj.nodeId === 'string') nodeId = resObj.nodeId
								if (Array.isArray(resObj.outputFiles)) {
									outputFiles.push(
										...resObj.outputFiles.filter((x: any) => typeof x === 'string' && x)
									)
								}
								if (Array.isArray(resObj.exportedFiles)) {
									exportedFiles.push(
										...resObj.exportedFiles.filter((x: any) => typeof x === 'string' && x)
									)
								}
								if (typeof resObj._jsonBridge === 'string') {
									try {
										const bridge = JSON.parse(resObj._jsonBridge)
										if (bridge && typeof bridge === 'object') {
											if (!nodeId && typeof bridge.nodeId === 'string') nodeId = bridge.nodeId
											if (Array.isArray(bridge.outputFiles)) {
												outputFiles.push(
													...bridge.outputFiles.filter((x: any) => typeof x === 'string' && x)
												)
											}
											if (Array.isArray(bridge.exportedFiles)) {
												exportedFiles.push(
													...bridge.exportedFiles.filter((x: any) => typeof x === 'string' && x)
												)
											}
										}
									} catch {
										/* ignore */
									}
								}
							}
						}
					}
					if (!nodeId && outputFiles.length === 0) {
						try {
							const jsonMatches =
								lastAssistantText.match(/```json\s*([\s\S]*?)\s*```/) ||
								lastAssistantText.match(/\{[\s\S]*\}/)
							if (jsonMatches) {
								const parsed = JSON.parse(jsonMatches[1])
								if (typeof parsed.nodeId === 'string') nodeId = parsed.nodeId
								if (Array.isArray(parsed.outputFiles))
									outputFiles.push(...parsed.outputFiles.filter(Boolean))
								if (Array.isArray(parsed.exportedFiles))
									exportedFiles.push(...parsed.exportedFiles.filter(Boolean))
								if (typeof parsed._jsonBridge === 'string') {
									try {
										const bridge = JSON.parse(parsed._jsonBridge)
										if (bridge && typeof bridge === 'object') {
											if (!nodeId && typeof bridge.nodeId === 'string') nodeId = bridge.nodeId
											if (Array.isArray(bridge.outputFiles)) {
												outputFiles.push(
													...bridge.outputFiles.filter((x: any) => typeof x === 'string' && x)
												)
											}
											if (Array.isArray(bridge.exportedFiles)) {
												exportedFiles.push(
													...bridge.exportedFiles.filter((x: any) => typeof x === 'string' && x)
												)
											}
										}
									} catch {
										/* ignore */
									}
								}
							}
						} catch (_) {
							/* ignore */
						}
					}
					break
				}
			}

			const elapsed = Date.now() - startAt
			if (!nodeId && outputFiles.length === 0) {
				return {
					ok: true,
					outputFiles: [],
					exportedFiles: [],
					note: `P2 bridge OK (took ${Math.round(elapsed)}ms); preview nodes + chat blocks will be consumed from task.meta by poll loop.`
				}
			}
			return {
				ok: true,
				outputFiles,
				exportedFiles,
				nodeId,
				note: `completed via agent dialog in ${Math.round(elapsed)}ms`
			}
		} catch (err: any) {
			console.warn(
				'[useCLIAgentTrigger][P2] submitToAgentDialog failed (will mark task failed):',
				err
			)
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
			outputPath: req.outputPath || '(auto project generated_media/images)'
		})
		const r = await runSubmitToAgentDialog(req)
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

	// ===== 消费 task.meta 里排队的预览请求（蓝图 image 节点 & 对话框图片块）=====
	const _consumeQueuedPreviewRequestsForTask = async (task: any) => {
		if (!task || !task.taskId) return
		const meta = task.meta || {}

		// 1) createImageNodeRequests → 蓝图 image 预览节点
		if (Array.isArray(meta.createImageNodeRequests) && meta.createImageNodeRequests.length > 0) {
			const factory = deps.createImagePreviewNode?.createImageNodeAtCenter
			const pending = meta.createImageNodeRequests.filter(
				(r: any) => r && r.status !== 'consumed' && r.status !== 'failed'
			)
			const createdNodeIds: string[] = []
			// 按任务内的 sourceLocalPath / imageUrl 做二级去重（即使 req.id 不同，只要文件相同就不重复建节点）
			const seenByPath = new Set<string>()
			for (const req of pending) {
				const key = `${task.taskId}|n:${req.id}`
				if (previewConsumed.has(key)) continue
				// 二级幂等键：sourceLocalPath > imageUrl（优先用实际文件路径）
				const rawSource = String(req.sourceLocalPath || '').trim()
				const rawUrl = String(req.imageUrl || '').trim()
				const dedupeKey = rawSource
					? `${task.taskId}|npath:${rawSource.toLowerCase().replace(/\\/g, '/')}`
					: rawUrl
						? `${task.taskId}|nurl:${rawUrl}`
						: null
				if (dedupeKey && seenByPath.has(dedupeKey)) {
					// 已为这个文件路径/URL 创建过节点：把本请求标记 consumed，但不实际新建节点，避免重
					previewConsumed.add(key)
					req.status = 'consumed'
					req.consumedAt = Date.now()
					req.note = 'deduplicated by sourcePath/url'
					continue
				}
				if (dedupeKey) seenByPath.add(dedupeKey)
				previewConsumed.add(key)
				if (!factory) {
					console.debug(
						'[useCLIAgentTrigger][preview] createImageNodeAtCenter not wired from AIWorkflowPage, skip node creation'
					)
					break
				}
				try {
					const primaryUrl = rawUrl || rawSource
					if (!primaryUrl && !rawSource) continue
					const nodeId = factory(primaryUrl, String(req.name || 'cli-gen-image').slice(0, 80), {
						taskId: task.taskId,
						mode: 'text_to_image',
						imageGenerationSource: req.imageGenerationSource || 'seedream-cli',
						imageUrls: Array.isArray(req.imageUrl)
							? [req.imageUrl]
							: primaryUrl
								? [primaryUrl]
								: [],
						// 传 sourceLocalPath：createImageNodeAtCenter 会据此创建 WorkflowResource，
						// 走 dweb://project-assets 协议，并让「右键 → 文件夹打开」能正确解析到本地绝对路径
						sourceLocalPath: rawSource || undefined,
						sourceFileSize: typeof req.size === 'number' ? req.size : undefined
					})
					if (nodeId) {
						createdNodeIds.push(nodeId)
						req.status = 'consumed'
						req.nodeId = nodeId
						req.consumedAt = Date.now()
					} else {
						req.status = 'failed'
						req.error = 'createImageNodeAtCenter returned null'
					}
				} catch (err: any) {
					req.status = 'failed'
					req.error = String(err?.message || err)
					console.warn(
						`[useCLIAgentTrigger][preview] create image node failed (task=${task.taskId}):`,
						err
					)
				}
			}
			if (createdNodeIds.length > 0) {
				try {
					await ns?.acknowledgeTaskMeta?.({
						taskId: task.taskId,
						patch: {
							createImageNodeRequests: meta.createImageNodeRequests,
							_createdImageNodeIds: createdNodeIds
						}
					})
				} catch {
					/* ignore ack fail（不阻塞用户体验，taskStore 内存里已更新是次要的）*/
				}
				console.log(
					`[useCLIAgentTrigger][preview] created ${createdNodeIds.length} image preview nodes for task ${task.taskId}`,
					createdNodeIds
				)
				pushToast(
					`CLI 任务 ${task.taskId.slice(-6)} 已在蓝图创建 ${createdNodeIds.length} 个图片预览节点`,
					'success'
				)
			}
		}

		// 2) chatPreviewBlocks → 在 Agent 对话框显示图片预览块（无需等用户按发送）
		if (Array.isArray(meta.chatPreviewBlocks) && meta.chatPreviewBlocks.length > 0) {
			const blocks = meta.chatPreviewBlocks
			const unconsumed = blocks.filter((b: any, i: number) => {
				const key = `${task.taskId}|c:${i}:${b.url || b.sourceLocalPath}`
				if (previewConsumed.has(key)) return false
				previewConsumed.add(key)
				return true
			}) as ChatPreviewBlock[]
			if (unconsumed.length > 0) {
				let delivered = false
				// 优先 pushAssistantMessage 注入
				if (typeof deps.chatPreview?.pushAssistantMessage === 'function') {
					try {
						const r = await deps.chatPreview.pushAssistantMessage(unconsumed)
						delivered = r !== false
					} catch (err) {
						console.warn(
							'[useCLIAgentTrigger][preview] pushAssistantMessage failed (harmless):',
							err
						)
					}
				}
				// 兜底：直接操作 chatMessages ref，append assistant 消息
				if (!delivered) {
					const msgs = deps.chatPreview?.chatMessages
					const append = deps.chatPreview?.appendAssistantMessage
					if (msgs && append) {
						try {
							// 构造带 image_url 块的 assistant 消息；content 里把图 URL 列出来
							const contentLines = [
								`已生成 ${unconsumed.length} 张图片（CLI 任务 ${String(task.taskId || '').slice(-6)}）：`
							]
							for (const b of unconsumed) {
								if (b.title) contentLines.push(`- ${b.title}  (${b.sourceLocalPath || b.url})`)
							}
							const assistantMsg: any = {
								id: 'cli-assistant-preview-' + Date.now().toString(36),
								role: 'assistant',
								content: contentLines.join('\n'),
								createdAt: Date.now(),
								blocks: unconsumed.map((b) => ({ ...b })),
								fromCLITaskId: task.taskId
							}
							append(assistantMsg)
							delivered = true
						} catch (err) {
							console.warn(
								'[useCLIAgentTrigger][preview] append assistant message failed (harmless):',
								err
							)
						}
					}
				}
				if (delivered) {
					console.log(
						`[useCLIAgentTrigger][preview] delivered ${unconsumed.length} chat preview blocks for task ${task.taskId}`
					)
				}
			}
		}
	}

	const pollNewTasks = async () => {
		if (disposed || !ns) return
		try {
			// 抓"所有 cli 任务，最近 90 秒内创建过的"（范围比 running 大，保证 P3 完成后排队的预览请求也能消费）
			const createdSince = Date.now() - RECENT_COMPLETED_WINDOW_MS
			const listResult: any = await ns.listTasks({ limit: 50, filterSource: 'cli' })
			if (listResult?.ok && Array.isArray(listResult?.tasks)) {
				const recentTasks = (listResult.tasks as any[]).filter(
					(t) => t && typeof t.taskId === 'string' && Number(t.createdAt || 0) >= createdSince
				)

				// A) 分派 running 的任务到 Agent 对话框（P2 分派前先检查 P3 pipelinePhase，避免 P3/P2 双执行）
				const prePending = recentTasks.filter(
					(t: any) =>
						t.status === 'running' &&
						t.command === 'generate-image' &&
						!dispatched.has(t.taskId) &&
						!dispatching.has(t.taskId)
				)
				// 对 prePending 逐个再查一次 getTask（task.meta.pipelinePhase 可能最近被 P3 标记），过滤掉不需要进入 P2 的
				const pending: typeof prePending = []
				// P2 明确允许接管的 phase：未执行、或 P3 已明确宣布失败并回退给 P2
				const ACCEPT_PHASES_FOR_P2 = new Set([
					'',
					'p3-direct-pending',
					'p2-frontend-dispatch',
					'p3-direct-failed-fallback-to-p2'
				])
				// P3 正在执行或已经执行完的 phase：P2 不插手
				const SKIP_PHASES_P3_OWNED = new Set([
					'p3-direct-running',
					'p3-direct-completed',
					'p2-runtime-completed',
					'p1-node-completed'
				])
				for (const t of prePending) {
					try {
						const detail = await ns.getTask({ taskId: t.taskId })
						const taskDetail = detail?.ok ? detail?.task : null
						const phase = String(
							taskDetail?.meta?.pipelinePhase || t.meta?.pipelinePhase || ''
						).trim()
						const startedAt =
							Number(taskDetail?.meta?.cliDirectStartedAt || t.meta?.cliDirectStartedAt || 0) || 0

						if (SKIP_PHASES_P3_OWNED.has(phase)) {
							console.debug(
								`[useCLIAgentTrigger][P2] skip dispatch task ${t.taskId} (pipelinePhase=${phase}, P3-owned)`
							)
							dispatched.add(t.taskId)
							continue
						}

						// 关键修复：即便 cliDirectStartedAt>0，只要 phase 明确声明回退到 P2 就允许接管；
						// 只有 startedAt>0 且 phase 不明（既不在 accept 也不在 skip）时才保守等 P3。
						if (startedAt > 0 && !ACCEPT_PHASES_FOR_P2.has(phase)) {
							console.debug(
								`[useCLIAgentTrigger][P2] skip dispatch task ${t.taskId} (cliDirectStartedAt set, phase=${phase}, waiting P3)`
							)
							dispatched.add(t.taskId)
							continue
						}

						pending.push(t)
					} catch (e) {
						// getTask 失败就按原任务加入 pending（兜底）
						pending.push(t)
					}
				}
				state.value.pendingTaskCount = pending.length + dispatching.size
				if (pending.length) state.value.lastTaskAt = Date.now()

				for (const t of pending) {
					if (disposed) return
					dispatching.add(t.taskId)
					dispatched.add(t.taskId)
					Promise.resolve()
						.then(async () => {
							const detail = await ns.getTask({ taskId: t.taskId })
							const payload = (detail?.ok && detail?.task?.payload) || {}
							// 再做一次 double-check（避免竞态中 P3 刚完成）
							const phase = String(
								detail?.ok ? detail?.task?.meta?.pipelinePhase || '' : t.meta?.pipelinePhase || ''
							).trim()
							if (
								phase === 'p3-direct-running' ||
								phase === 'p3-direct-completed' ||
								phase === 'p2-runtime-completed' ||
								phase === 'p1-node-completed'
							) {
								console.debug(
									`[useCLIAgentTrigger][P2] double-check skip task ${t.taskId} (pipelinePhase=${phase})`
								)
								return
							}
							await submitToAgentDialog({
								taskId: t.taskId,
								prompt: String(payload.prompt || ''),
								references: Array.isArray(payload.references)
									? payload.references.filter(Boolean)
									: undefined,
								width: typeof payload.width === 'number' ? payload.width : undefined,
								height: typeof payload.height === 'number' ? payload.height : undefined,
								aspectRatio:
									typeof payload.aspectRatio === 'string' ? payload.aspectRatio : undefined,
								outputPath: typeof payload.outputPath === 'string' ? payload.outputPath : undefined,
								projectId: typeof payload.projectId === 'number' ? payload.projectId : undefined,
								model: typeof payload.model === 'string' ? payload.model : undefined,
								seedreamModelVersion:
									typeof payload.seedreamModelVersion === 'string'
										? payload.seedreamModelVersion
										: undefined,
								imageModel: typeof payload.imageModel === 'string' ? payload.imageModel : undefined,
								endpoint_id:
									typeof payload.endpoint_id === 'string' ? payload.endpoint_id : undefined,
								negativePrompt:
									typeof payload.negativePrompt === 'string' ? payload.negativePrompt : undefined,
								imageCount: typeof payload.imageCount === 'number' ? payload.imageCount : undefined,
								seed: typeof payload.seed === 'number' ? payload.seed : undefined,
								autoExport: payload.autoExport !== false
							})
						})
						.catch((err) => {
							console.warn(`[useCLIAgentTrigger][P2] task ${t.taskId} dispatch failed:`, err)
							ns?.markTaskFailed?.({ taskId: t.taskId, error: String(err?.message || err) })
						})
						.finally(() => {
							dispatching.delete(t.taskId)
						})
				}

				// B) 消费最近任务的预览请求（不区分 running/completed/cancelled，createdAt 窗口内都处理）
				//    同时：对 failed/cancelled 且带有 error 或 meta.errorPreview 的任务，通过 toast 做一次可见提醒（每个 task 只提醒一次）。
				const errorNotifiedKey = (id: string) => `err-notified:${id}`
				for (const t of recentTasks) {
					try {
						const st = String(t.status || '').toLowerCase()
						if (
							(st === 'failed' || st === 'cancelled' || st === 'rejected') &&
							!previewConsumed.has(errorNotifiedKey(t.taskId))
						) {
							const taskErrorMsg =
								typeof t.error === 'string'
									? t.error
									: t.error && typeof t.error === 'object'
										? String(t.error.message || t.error.code || '')
										: ''
							const metaMsg = String(t?.meta?.errorPreview || t?.meta?.note || t?.note || '').trim()
							const finalMsg =
								taskErrorMsg ||
								metaMsg ||
								(st === 'failed'
									? '任务执行失败'
									: st === 'cancelled'
										? '任务已取消'
										: '任务被拒绝')
							if (finalMsg) {
								const code =
									t.error && typeof t.error === 'object' && t.error.code
										? String(t.error.code)
										: t?.meta?.errorCode || ''
								const display = code ? `${code}: ${finalMsg}` : finalMsg
								const toastKind: 'warn' | 'error' =
									st === 'rejected' || st === 'failed' ? 'error' : 'warn'
								pushToast(
									`CLI 任务 ${String(t.taskId || '').slice(-6)} ${st === 'failed' ? '失败' : st === 'cancelled' ? '已取消' : '被拒绝'}：${display.slice(0, 180)}`,
									toastKind
								)
							}
							previewConsumed.add(errorNotifiedKey(t.taskId))
						}
						await _consumeQueuedPreviewRequestsForTask(t)
					} catch (err) {
						console.debug(
							`[useCLIAgentTrigger][preview] consume task=${t.taskId} (non-fatal):`,
							err
						)
					}
				}

				state.value.dispatchedTaskIds = Array.from(dispatched).slice(-50)
			}
		} catch (err) {
			console.debug('[useCLIAgentTrigger] pollNewTasks (non-fatal):', err)
		}
	}

	const bootstrap = async () => {
		if (!ns) {
			console.debug(
				'[useCLIAgentTrigger] window.dweb.cliControlServer not available (web mode / old preload), skipped.'
			)
			return
		}
		try {
			const status: any = await ns.getStatus()
			if (status?.ok) {
				state.value.serverRunning = !!status.running
				state.value.serverPort = status.port ?? null
				console.log(
					`[useCLIAgentTrigger][P2] CLI control server: ${status.running ? 'RUNNING' : 'IDLE'}${status.port ? ` on :${status.port}` : ''}`,
					status?.app?.defaultOutputs
						? ` default images dir: ${status.app.defaultOutputs.images}`
						: ''
				)
			}
		} catch (err) {
			console.warn('[useCLIAgentTrigger] getStatus failed (non-fatal):', err)
		}
		if (typeof window !== 'undefined') {
			pollTimer = window.setInterval(pollNewTasks, POLL_INTERVAL_MS)
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
			} catch {
				/* swallow */
			}
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
					references: Array.isArray(payload.payload.references)
						? payload.payload.references
						: undefined,
					width: typeof payload.payload.width === 'number' ? payload.payload.width : undefined,
					height: typeof payload.payload.height === 'number' ? payload.payload.height : undefined,
					aspectRatio:
						typeof payload.payload.aspectRatio === 'string'
							? payload.payload.aspectRatio
							: undefined,
					outputPath:
						typeof payload.payload.outputPath === 'string' ? payload.payload.outputPath : undefined,
					projectId:
						typeof payload.payload.projectId === 'number' ? payload.payload.projectId : undefined,
					model: typeof payload.payload.model === 'string' ? payload.payload.model : undefined,
					negativePrompt:
						typeof payload.payload.negativePrompt === 'string'
							? payload.payload.negativePrompt
							: undefined,
					imageCount:
						typeof payload.payload.imageCount === 'number' ? payload.payload.imageCount : undefined,
					seed: typeof payload.payload.seed === 'number' ? payload.payload.seed : undefined,
					autoExport: payload.payload.autoExport !== false
				})
			}
			return { ok: true, status: 'dispatched' }
		}
	}
}
