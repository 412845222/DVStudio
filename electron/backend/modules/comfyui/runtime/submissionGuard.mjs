import crypto from 'node:crypto'
import { getJson, hashJson } from './historyCatalog.mjs'

const transient = new WeakMap()
const submitting = new WeakMap()

export async function withSubmissionLock(client, key, run) {
	let active = submitting.get(client)
	if (!active) submitting.set(client, (active = new Set()))
	if (active.has(key))
		return {
			ok: false,
			error: 'SUBMISSION_IN_PROGRESS',
			message: '此模板正在提交，请等待当前请求完成'
		}
	active.add(key)
	try {
		return await run()
	} finally {
		active.delete(key)
	}
}

// Persist only request identity/status, never the prompt or uploaded bytes.
export function normalizeSubmissionScope(value) {
	return typeof value === 'string' && /^frame:[a-zA-Z0-9:_-]{1,180}$/.test(value) ? value : ''
}
export function submissionGuard(ctx, base, workflowPath, scope = '') {
	const identity = [base, workflowPath]
	if (normalizeSubmissionScope(scope)) identity.push(scope)
	const key = 'comfy-submit-' + hashJson(identity)
	const repo = ctx.localdb?.comfyuiJobs
	let memory = transient.get(ctx.httpClient)
	if (!memory) transient.set(ctx.httpClient, (memory = new Map()))
	const read = () => (repo ? repo.get(key) : memory.get(key))
	const write = (status, outputs) => {
		if (repo) {
			if (!repo.get(key)) {
				const created = repo.create({ id: key })
				if (!created.ok) throw new Error('无法保存 ComfyUI 提交记录')
			}
			const result = repo.updateStatus(key, { status, outputs })
			if (!result.ok) throw new Error('无法保存 ComfyUI 提交状态')
		} else memory.set(key, { status, outputs })
	}
	return {
		async reconcile(confirmRetry = false) {
			const previous = read()
			if (!['submitting', 'submission_unknown'].includes(previous?.status)) return null
			const requestId = previous.outputs.requestId
			const [history, queue] = await Promise.all([
				getJson(ctx.httpClient, base + '/history?max_items=200'),
				getJson(ctx.httpClient, base + '/queue')
			])
			const matches = (p) =>
				Array.isArray(p) && (p[1] === requestId || p[3]?.dvstudio_request_id === requestId)
			const completed = Object.values(history.data || {}).find((e) => matches(e.prompt))
			const queued = [
				...(queue.data?.queue_running || []),
				...(queue.data?.queue_pending || [])
			].find(matches)
			const promptId = completed?.prompt?.[1] || queued?.[1]
			if (promptId) {
				write('submitted', { requestId, promptId })
				return { ok: true, promptId, recovered: true, baseUrl: base }
			}
			if (confirmRetry && history.ok && queue.ok) {
				write('abandoned', { requestId })
				return null
			}
			return {
				ok: false,
				error: 'SUBMISSION_UNKNOWN',
				message:
					'上次提交结果未知。请先检查 ComfyUI 队列/历史；再次运行会先尝试找回任务，确认未执行后才可重新提交。'
			}
		},
		begin() {
			const requestId = crypto.randomUUID()
			write('submitting', { requestId })
			return requestId
		},
		finish(requestId, status, promptId = '') {
			write(status, { requestId, promptId })
		}
	}
}
