import type { WorkflowState, WorkflowNode, WorkflowResource } from '../../../aiworkflow/types'
import {
	useAIWorkflowComfyRuntime,
	type ComfyService
} from '../node-business/comfy/useAIWorkflowComfyRuntime'
import type { ComfyBridgeMedia } from '../node-business/comfy/comfyOutputResolver'
import { buildDesiredComfyMediaFilename } from '../node-business/comfy/useAIWorkflowComfyOutputRouter'

export type FrameComfyResult = { node: WorkflowNode; outputs: Record<string, WorkflowResource> }
export type FrameComfyContext = {
	state: WorkflowState
	anchors: string[]
	submissionScope?: string
	assertActive: () => void
	onSubmitting: () => void
	onRegistered: (promptId: string, baseUrl: string) => Promise<void>
	onSettled: () => void
}
export type FrameComfyDeps = {
	service: ComfyService
	persist: (
		media: ComfyBridgeMedia,
		name: string
	) => Promise<{ url: string; absolutePath?: string; projectRelativePath?: string } | null>
	wait?: () => Promise<void>
	timeoutMs?: number
}
/** Uses the ordinary node's input binding/submission code with a private store, never its UI poll/router. */
export async function executeFrameComfy(
	nodeId: string,
	context: FrameComfyContext,
	deps: FrameComfyDeps
): Promise<FrameComfyResult> {
	const { state, assertActive } = context
	assertActive()
	const node = state.nodesById[nodeId]
	if (
		!context.anchors.length ||
		context.anchors.some((id) => !node.outputs.some((p) => p.id === id))
	)
		throw new Error('ComfyUI 输出接口已失效，请重新设置组合输出')
	const settings = node.comfyuiSettings
	if (!settings?.templateResolution?.snapshotId || !settings.baseUrl || !settings.workflowPath)
		throw new Error('ComfyUI 模板尚未就绪，请刷新检查后重试')
	// The historical run state is not a request to reconnect to its old task.
	node.comfyuiSettings = {
		...settings,
		runStatus: 'idle',
		promptId: '',
		outputs: [],
		confirmRetry: false
	}
	let message = ''
	const runtime = useAIWorkflowComfyRuntime({
		submissionOnly: true,
		store: {
			state,
			commit: (type, value) => {
				assertActive()
				if (type !== 'setNodeComfyUISettings')
					throw new Error('Unexpected automation mutation: ' + type)
				const patch = value as { nodeId: string; comfyuiSettings: WorkflowNode['comfyuiSettings'] }
				const target = state.nodesById[patch.nodeId]
				target.comfyuiSettings = { ...target.comfyuiSettings, ...patch.comfyuiSettings }
			}
		},
		comfyService: {
			...deps.service,
			run: async (...args) => {
				assertActive()
				context.onSubmitting()
				const [baseUrl, workflowPath, files, options] = args
				const result = await deps.service.run(baseUrl, workflowPath, files, {
					...options,
					submissionScope: context.submissionScope || 'frame:' + crypto.randomUUID()
				})
				if (!result.ok && result.error !== 'SUBMISSION_UNKNOWN') context.onSettled()
				if (result.ok && result.promptId)
					await context.onRegistered(result.promptId, settings.baseUrl!)
				assertActive()
				return result
			}
		},
		pushToast: (text) => {
			message = text
		},
		clearComfyRouteCache: () => {},
		routeComfyOutputsToConnectedNodes: async () => ({ alerts: [], outputs: [] }),
		getTextOutputForNode: (id) => state.nodesById[id]?.textValue || '',
		getIncomingTextValue: (id, anchor) =>
			Object.values(state.edgesById)
				.filter((e) => e.toNodeId === id && e.toAnchorId === anchor)
				.map((e) => state.nodesById[e.fromNodeId]?.textValue || '')
				.filter(Boolean)
				.join('\n\n')
	})
	let submitted: Awaited<ReturnType<ComfyService['run']>> | undefined
	try {
		submitted = await runtime.onComfyUIRun(nodeId)
	} finally {
		runtime.disposeComfyRuntime()
	}
	if (!submitted?.ok || !submitted.promptId)
		throw new Error(
			submitted && !submitted.ok
				? submitted.message || submitted.error
				: message || 'ComfyUI 未返回任务 ID，无法确认提交结果'
		)
	const promptId = submitted.promptId
	const deadline = Date.now() + (deps.timeoutMs ?? 6 * 60 * 60 * 1000)
	while (true) {
		assertActive()
		const reply = await deps.service.job(settings.baseUrl, promptId)
		assertActive()
		const raw = reply.result
		const job =
			raw &&
			((typeof raw.status === 'string' ? raw : raw[promptId]) as
				| Record<string, unknown>
				| undefined)
		if (!reply.ok || !job) throw new Error('无法确认 ComfyUI 任务状态，请核对任务 ' + promptId)
		const status = String(job.status || '').toLowerCase()
		if (['failed', 'cancelled', 'error'].includes(status)) {
			context.onSettled()
			throw new Error(
				'ComfyUI 任务 ' + promptId + ' ' + status + ': ' + String(job.error || job.message || '')
			)
		}
		if (status === 'completed') {
			context.onSettled()
			break
		}
		if (!['pending', 'in_progress', 'running', 'queued'].includes(status))
			throw new Error('ComfyUI 任务状态无法确认: ' + status + ' (' + promptId + ')')
		if (Date.now() > deadline) throw new Error('ComfyUI 等待超时，请核对任务 ' + promptId)
		await (deps.wait?.() ?? new Promise((resolve) => setTimeout(resolve, 1000)))
	}
	const reply = await deps.service.outputs(settings.baseUrl, promptId)
	assertActive()
	if (!reply.ok) throw new Error('ComfyUI 输出读取失败: ' + (reply.error || promptId))
	const outputs: Record<string, WorkflowResource> = {}
	const localized: NonNullable<WorkflowNode['comfyuiSettings']>['outputs'] = []
	for (const anchorId of new Set(context.anchors)) {
		const port = node.outputs.find((p) => p.id === anchorId)
		const candidates = (reply.media || []).filter(
			(m) =>
				m.url &&
				(!['image', 'video', 'model3d'].includes(port?.mediaType || '') ||
					m.kind === port?.mediaType) &&
				(anchorId === 'out'
					? node.outputs.length === 1
					: String(m.nodeId) === anchorId.replace(/^out-/, ''))
		)
		const media = candidates[0]
		if (!media) throw new Error('本次 ComfyUI 任务缺少输出 ' + anchorId + ' (' + promptId + ')')
		const name = buildDesiredComfyMediaFilename({ ...media })
		const persisted = await deps.persist(media, name)
		assertActive()
		if (!persisted?.url || !persisted.projectRelativePath)
			throw new Error('ComfyUI 输出尚未保存到项目: ' + anchorId)
		const resource: WorkflowResource = {
			id: 'frame-comfy-' + crypto.randomUUID(),
			kind: media.kind,
			name,
			url: persisted.url,
			sourcePath: persisted.absolutePath,
			projectRelativePath: persisted.projectRelativePath,
			createdAt: Date.now()
		}
		outputs[anchorId] = resource
		localized.push({ ...media, url: resource.url, sourcePath: resource.sourcePath, anchorId })
	}
	node.comfyuiSettings = {
		...node.comfyuiSettings,
		promptId,
		outputs: localized,
		runStatus: 'completed',
		progress: 100,
		statusText: '组合任务产物已保存'
	}
	return { node, outputs }
}

/** Project each output into a run-local source, preserving edge IDs used by ComfyUI input bindings. */
export function applyFrameComfyResult(
	state: WorkflowState,
	nodeId: string,
	result: FrameComfyResult
) {
	state.nodesById[nodeId] = JSON.parse(JSON.stringify(result.node))
	for (const [anchorId, resource] of Object.entries(result.outputs)) {
		state.resourcesById[resource.id] = JSON.parse(JSON.stringify(resource))
		const id = '__frame_output_' + nodeId + '_' + anchorId
		state.nodesById[id] = {
			...result.node,
			id,
			type: resource.kind,
			resourceId: resource.id,
			comfyuiSettings: undefined,
			inputs: [],
			outputs: [{ id: anchorId, mediaType: resource.kind }]
		}
		state.nodeOrder = Object.keys(state.nodesById)
		state.resourceOrder = Object.keys(state.resourcesById)
		for (const edge of Object.values(state.edgesById))
			if (edge.fromNodeId === nodeId && edge.fromAnchorId === anchorId) edge.fromNodeId = id
	}
}

/** Publish only the result; editing live template settings must not be undone by a finished run. */
export function frameComfyOutputPatch(node: WorkflowNode): WorkflowNode['comfyuiSettings'] {
	const s = node.comfyuiSettings
	return {
		outputs: s?.outputs,
		promptId: s?.promptId,
		runStatus: 'completed',
		progress: 100,
		statusText: '组合任务产物已保存',
		lastUpdateAt: Date.now()
	}
}
