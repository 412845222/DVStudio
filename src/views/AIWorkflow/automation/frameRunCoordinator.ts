import {
	applyFrameComfyResult,
	type FrameComfyContext,
	type FrameComfyResult
} from './frameComfyExecutor'
import type { WorkflowState, WorkflowNodeGenerationTask } from '../../../aiworkflow/types'
import { frameAutomationRequest } from '../../../electronBridge/frameAutomation'
import { clone, createFrameExecutionState, type FrameRecipe } from './frameExecutionContext'

export type FrameRunEvent = { seq: number; type: string; payload: Record<string, unknown> }
export type FrameRunRecord = {
	id: string
	status: string
	recipeHash: string
	recipe: FrameRecipe
	events: FrameRunEvent[]
}
export type FrameRunSummary = { id: string; status: string; createdAt: number; recipeHash: string }
export type FrameExecutionInput = {
	state: WorkflowState
	assertActive: () => void
	onTaskRegistered: (task: WorkflowNodeGenerationTask) => Promise<void>
	onTextResult?: (nodeId: string, text: string) => void
	onResourceResult?: (resource: WorkflowState['resourcesById'][string]) => void
}
export type FrameOutput = {
	portId: string
	nodeId: string
	anchorId: string
	node: WorkflowState['nodesById'][string]
	resource?: WorkflowState['resourcesById'][string]
}
export type FrameRunDeps = {
	state: () => WorkflowState
	projectId: () => number | null
	submit: (nodeId: string, context: FrameExecutionInput) => Promise<boolean>
	executeComfy?: (nodeId: string, context: FrameComfyContext) => Promise<FrameComfyResult>
	changed: (message: string) => void
	publish?: (outputs: FrameOutput[]) => void
}
const eventLabels: Record<string, string> = {
	RunCreated: '正在检查流程和素材',
	PreflightPassed: '素材检查通过',
	SourceReady: '已准备输入素材',
	StepSubmitStarted: '正在提交生成任务',
	StepRegistered: '任务已登记',
	StepAccepted: '任务已接受，等待产物',
	StepSucceeded: '本步骤产物已保存',
	StepReused: '已复用成功步骤',
	IterationCompleted: '本轮已完成',
	RunCompleted: '组合运行成功',
	RunCancelled: '已停止后续步骤',
	RunStopped: '组合运行已停止'
}
export function createFrameRunCoordinator(deps: FrameRunDeps) {
	let disposed = false
	let terminateActive: (() => void) | undefined
	return {
		stop: () => terminateActive?.(),
		dispose: () => {
			disposed = true
			terminateActive?.()
		},
		async run(recipe: FrameRecipe, parentRunId?: string, resume?: FrameRunRecord) {
			const projectId = deps.projectId()
			if (disposed) throw new Error('SESSION_CHANGED')
			if (!projectId) throw new Error('请先保存项目')
			terminateActive?.()
			for (const id of recipe.order) {
				const liveNode = deps.state().nodesById[id],
					savedNode = recipe.nodes.find((n) => n.id === id)
				if (!liveNode || !savedNode || liveNode.type !== savedNode.type)
					throw new Error('记录中的成员已删除或类型已改变，无法重执行')
				if (
					savedNode.inputs.some((p) => !liveNode.inputs.some((q) => q.id === p.id)) ||
					savedNode.outputs.some((p) => !liveNode.outputs.some((q) => q.id === p.id))
				)
					throw new Error('成员接口已改变，请创建新的运行配置')
			}
			let runId = '',
				inFlight = false
			let closed = false
			let rejectClosed!: (error: Error) => void
			const cancellation = new Promise<never>((_, reject) => {
				rejectClosed = reject
			})
			// A session may close while create() is pending, before a race is installed.
			void cancellation.catch(() => {})
			const wait = <T>(operation: Promise<T>) => Promise.race([operation, cancellation])
			let termination: Promise<unknown> | undefined
			const persistTermination = () => {
				if (!runId) return Promise.resolve()
				return (termination ||= frameAutomationRequest('append', {
					projectId,
					runId,
					eventId: crypto.randomUUID(),
					type: 'RunCancelled',
					payload: { reason: 'session_closed', remoteTaskCancelled: false },
					status: 'cancelled'
				}).catch((error) =>
					console.warn('[FrameAutomation] termination record failed', { runId, error })
				))
			}
			const terminate = () => {
				if (closed) return
				closed = true
				rejectClosed(new Error('FRAME_SESSION_CLOSED'))
				void persistTermination()
				if (terminateActive === terminate) terminateActive = undefined
			}
			terminateActive = terminate
			const emit = async (type: string, payload: object = {}, status?: string) => {
				if (closed) throw new Error('FRAME_SESSION_CLOSED')
				await frameAutomationRequest('append', {
					projectId,
					runId,
					eventId: crypto.randomUUID(),
					type,
					payload,
					status
				})
				if (closed) throw new Error('FRAME_SESSION_CLOSED')
				console.info('[FrameAutomation]', {
					runId,
					type,
					status,
					...(['StepRegistered', 'RunStopped'].includes(type) ? payload : {})
				})
				if (!closed) deps.changed(eventLabels[type] || type)
			}
			const ensureSession = () => {
				if (closed) throw new Error('FRAME_SESSION_CLOSED')
				if (disposed || deps.projectId() !== projectId) throw new Error('SESSION_CHANGED')
			}
			try {
				const created = await frameAutomationRequest<{ id: string }>('create', {
					projectId,
					frameId: recipe.frame.id,
					recipe,
					parentRunId
				})
				runId = created.id
				if (closed) {
					await persistTermination()
					return { runId, status: 'cancelled' as const }
				}
				await emit('RunCreated', {}, 'running')
				const sourceIds = new Set([
					...recipe.sources.map((id) => recipe.replacements[id] || id),
					...recipe.nodes.filter((n) => !recipe.order.includes(n.id)).map((n) => n.id)
				])
				const inputResources = recipe.nodes
					.filter((n) => sourceIds.has(n.id) && n.resourceId)
					.map((n) => recipe.resources[n.resourceId!])
				if (inputResources.some((r) => !r)) throw new Error('输入素材已失效')
				const expected = resume?.events.find((e) => e.type === 'PreflightPassed')?.payload.manifest
				const manifest = await frameAutomationRequest('validateAssets', {
					projectId,
					resources: inputResources,
					expected
				})
				await emit('PreflightPassed', { manifest })
				if (resume) {
					for (const event of resume.events.filter((e) =>
						['StepSucceeded', 'StepReused'].includes(e.type)
					)) {
						if (event.payload.resource || event.payload.comfyOutputs)
							await frameAutomationRequest('validateAssets', {
								projectId,
								resources: event.payload.comfyOutputs
									? Object.values(event.payload.comfyOutputs)
									: [event.payload.resource],
								expected: event.payload.manifest
							})
					}
				}
				const loops = Math.min(99, Math.max(1, recipe.frame.automation?.loopCount || 1))
				for (let iteration = 1; iteration <= loops; iteration++) {
					const state = createFrameExecutionState(deps.state(), recipe)
					const comfyResults: Record<string, FrameComfyResult['outputs']> = {}
					for (const nodeId of recipe.order) {
						ensureSession()
						if (closed) {
							await emit('RunCancelled', {}, 'cancelled')
							return { runId, status: 'cancelled' as const }
						}
						const reusable = resume?.events.find(
							(e) =>
								['StepSucceeded', 'StepReused'].includes(e.type) &&
								e.payload.nodeId === nodeId &&
								e.payload.iteration === iteration
						)
						if (reusable) {
							const node = reusable.payload.node as WorkflowState['nodesById'][string]
							const resource = reusable.payload.resource as
								| WorkflowState['resourcesById'][string]
								| undefined
							const comfyOutputs = reusable.payload.comfyOutputs as
								| FrameComfyResult['outputs']
								| undefined
							if (!node || (node.type !== 'text' && !resource && !comfyOutputs))
								throw new Error('历史产物不可恢复，请重新执行')
							state.nodesById[nodeId] = clone(node)
							if (resource) state.resourcesById[resource.id] = clone(resource)
							if (comfyOutputs) {
								comfyResults[nodeId] = clone(comfyOutputs)
								applyFrameComfyResult(state, nodeId, {
									node: clone(node),
									outputs: comfyResults[nodeId]
								})
							}
							await emit('StepReused', {
								iteration,
								nodeId,
								sourceRunId: resume?.id,
								node,
								resource,
								comfyOutputs,
								manifest: reusable.payload.manifest
							})
							continue
						}
						if (recipe.sources.includes(nodeId)) {
							await emit('SourceReady', { iteration, nodeId })
							continue
						}
						if (state.nodesById[nodeId].type === 'comfyui') {
							if (!deps.executeComfy) throw new Error('ComfyUI 执行适配器未初始化')
							await emit('StepSubmitStarted', { iteration, nodeId, attempt: 1, adapter: 'comfyui' })
							const anchors = [
								...new Set([
									...(recipe.frame.automation?.outputBindings || [])
										.filter((b) => b.nodeId === nodeId)
										.map((b) => b.anchorId),
									...Object.values(state.edgesById)
										.filter((e) => e.fromNodeId === nodeId)
										.map((e) => e.fromAnchorId)
								])
							]
							const submissionScope = `frame:${runId}:${iteration}:${nodeId}`
							const result = await wait(
								deps.executeComfy(nodeId, {
									state,
									anchors,
									submissionScope,
									assertActive: ensureSession,
									onSubmitting: () => {
										ensureSession()
										inFlight = true
									},
									onSettled: () => {
										inFlight = false
									},
									onRegistered: async (promptId, baseUrl) => {
										await emit('StepRegistered', {
											iteration,
											nodeId,
											promptId,
											baseUrl,
											adapter: 'comfyui',
											submissionScope,
											template: state.nodesById[nodeId].comfyuiSettings?.templateResolution,
											inputBindings: state.nodesById[nodeId].comfyuiSettings?.inputBindings
										})
									}
								})
							)
							ensureSession()
							const manifest = await frameAutomationRequest('validateAssets', {
								projectId,
								resources: Object.values(result.outputs)
							})
							comfyResults[nodeId] = clone(result.outputs)
							applyFrameComfyResult(state, nodeId, result)
							await emit('StepSucceeded', {
								iteration,
								nodeId,
								node: result.node,
								comfyOutputs: result.outputs,
								manifest
							})
							continue
						}
						await emit('StepSubmitStarted', { iteration, nodeId, attempt: 1 })
						inFlight = true
						let taskId = ''
						let textResult: string | undefined
						let persistedResult: WorkflowState['resourcesById'][string] | undefined
						const ok = await wait(
							deps.submit(nodeId, {
								state,
								assertActive: ensureSession,
								onResourceResult: (resource) => {
									ensureSession()
									if (!persistedResult && resource.kind === state.nodesById[nodeId].type)
										persistedResult = clone(resource)
								},
								onTextResult: (id, text) => {
									ensureSession()
									if (id === nodeId) textResult = text
								},
								onTaskRegistered: async (task) => {
									taskId = task.id
									await emit('StepRegistered', {
										iteration,
										nodeId,
										taskId,
										globalTaskId: task.globalTaskId,
										clientRequestId: task.clientRequestId
									})
								}
							})
						)
						ensureSession()
						if (!taskId) throw new Error('没有任务回执，不能确认提交结果')
						if (ok) await emit('StepAccepted', { iteration, nodeId, taskId })
						const deadline = Date.now() + 6 * 60 * 60 * 1000
						while (true) {
							ensureSession()
							const task = deps.state().nodeGenerationTasksById[taskId]
							if (task && ['completed', 'error', 'cancelled'].includes(task.status)) {
								inFlight = false
								if (!ok || task.status !== 'completed')
									throw new Error(task.errorMessage || '节点任务失败')
								break
							}
							if (Date.now() > deadline) throw new Error('任务完成等待超时，请先核对任务状态')
							await wait(new Promise((resolve) => setTimeout(resolve, 250)))
						}
						const current = clone(state.nodesById[nodeId])
						if (!current) throw new Error('执行过程中节点被删除')
						const task = deps.state().nodeGenerationTasksById[taskId]
						if (task.nodeId !== nodeId) throw new Error('任务回执节点不匹配')
						// Select the first persisted task output explicitly, never a node's previous preview.
						const resource = persistedResult
						if (current.type === 'text') {
							if (textResult === undefined) throw new Error('缺少本次文本产物回执')
							current.textValue = textResult
						} else {
							if (!resource) throw new Error('本次任务产物尚未保存到项目，不能传给下游')
							current.resourceId = resource.id
						}
						const manifest = await frameAutomationRequest('validateAssets', {
							projectId,
							resources: resource ? [resource] : []
						})
						state.nodesById[nodeId] = current
						if (resource) state.resourcesById[resource.id] = clone(resource)
						await emit('StepSucceeded', {
							iteration,
							nodeId,
							taskId,
							node: state.nodesById[nodeId],
							manifest,
							resource
						})
					}
					if (closed) {
						await emit('RunCancelled', {}, 'cancelled')
						return { runId, status: 'cancelled' as const }
					}
					const outputs = (recipe.frame.automation?.outputBindings || []).map((binding) => ({
						portId: binding.id,
						nodeId: binding.nodeId,
						anchorId: binding.anchorId,
						node: state.nodesById[binding.nodeId],
						resource:
							comfyResults[binding.nodeId]?.[binding.anchorId] ||
							state.resourcesById[state.nodesById[binding.nodeId]?.resourceId || '']
					}))
					await emit('IterationCompleted', { iteration, outputs })
					ensureSession()
					deps.publish?.(outputs)
				}
				await emit('RunCompleted', {}, 'succeeded')
				return { runId, status: 'succeeded' as const }
			} catch (err) {
				if (closed) {
					await persistTermination()
					return { runId, status: 'cancelled' as const }
				}
				if (runId)
					await emit(
						'RunStopped',
						{ message: err instanceof Error ? err.message : String(err) },
						inFlight
							? 'submission_unknown'
							: disposed || deps.projectId() !== projectId
								? 'interrupted'
								: 'failed'
					)
				throw err
			} finally {
				if (terminateActive === terminate) terminateActive = undefined
			}
		}
	}
}
