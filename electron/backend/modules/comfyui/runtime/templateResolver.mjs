import { workflowToPrompt } from '../workflow-converter.mjs'
import { executionGraph, validatePromptInputs } from './executionGraph.mjs'
import {
	getJson,
	hashJson,
	historyListItem,
	isRecord,
	normalizeHistoryEntry,
	promptHash,
	scanHistory,
	unwrapPrompt,
	workflowHash
} from './historyCatalog.mjs'

export async function resolveTemplate({
	client,
	base,
	workflowPath,
	repo,
	readWorkflow,
	snapshotId
}) {
	const fail = (error, message, extra = {}) => ({
		ok: false,
		error,
		message,
		baseUrl: base,
		...extra
	})
	const finish = (graph, workflow, entry, source, fileHash = '') => ({
		ok: true,
		promptGraph: graph,
		workflow,
		promptId: entry?.promptId || '',
		timestamp: entry?.timestamp || 0,
		hasHistory: Boolean(entry),
		resolution: {
			contentHash: promptHash(graph),
			workflowHash: fileHash,
			snapshotId: entry?.promptId || '',
			source,
			schemaVersion: 1
		}
	})
	if (workflowPath.startsWith('history://')) {
		const id = workflowPath.slice(10)
		const result = await getJson(client, `${base}/history/${encodeURIComponent(id)}`)
		const live = result.ok ? result.data[id] : null
		const entry = live ? normalizeHistoryEntry(id, live) : null
		if (live && !entry) return fail('INVALID_HISTORY', '所选记录不是可复用的成功执行记录')
		if (entry) {
			let archived
			try {
				archived = repo?.get(base, id)
			} catch {
				/* Live entry can still be used. */
			}
			if (archived && archived.contentHash !== entry.contentHash)
				return fail('HISTORY_ID_CONFLICT', '同一历史 ID 的执行内容已改变，请检查 ComfyUI 服务来源')
			try {
				repo?.save(base, entry)
			} catch {
				/* Online execution remains available. */
			}
			return finish(entry.promptGraph, entry.workflow, entry, 'history-live')
		}
		let cached
		try {
			cached = repo?.get(base, id)
		} catch {
			/* Report upstream failure below. */
		}
		if (cached && unwrapPrompt(cached.promptGraph))
			return finish(cached.promptGraph, cached.workflow, cached, 'history-archive')
		return fail(
			result.ok ? 'HISTORY_EMPTY' : result.error,
			result.ok ? '该记录已从 ComfyUI 移除，且尚未归档。请选择其他成功历史。' : result.message
		)
	}
	const file = await readWorkflow()
	if (!file.ok) return fail('WORKFLOW_READ_FAILED', String(file.error || '读取工作流失败'))
	const workflow = file.workflow
	const api = unwrapPrompt(workflow)
	if (api)
		return finish(
			api,
			null,
			null,
			workflowPath.startsWith('local://') ? 'local-api' : 'userdata-api',
			hashJson(workflow)
		)
	if (!Array.isArray(workflow?.nodes) || !Array.isArray(workflow.links)) {
		return fail('UNSUPPORTED_WORKFLOW_FORMAT', '工作流不是有效的 UI JSON 或 API prompt graph')
	}
	const fileHash = workflowHash(workflow)
	const catalog = await scanHistory(client, base, repo)
	const candidates = catalog.entries.filter((e) => e.workflowHash === fileHash)
	const picked = candidates.find((e) => e.promptId === snapshotId) || candidates[0]
	const info = await getJson(client, `${base}/object_info`)
	if (picked && (!info.ok || !validatePromptInputs(picked.promptGraph, info.data).length))
		return finish(
			picked.promptGraph,
			workflow,
			picked,
			picked.fromArchive ? 'history-archive' : 'history-matched',
			fileHash
		)
	// No version-equivalent history: compile the current saved file, never combine two revisions.
	if (info.ok) {
		try {
			const converted = workflowToPrompt(workflow, info.data)
			if (
				!converted.error &&
				!converted.warnings?.length &&
				unwrapPrompt(converted.prompt) &&
				Object.values(converted.prompt).every((n) => isRecord(info.data[n.class_type]))
			) {
				const graph = executionGraph(converted.prompt, info.data)
				const validation = validatePromptInputs(graph, info.data)
				if (validation.length) return fail('INVALID_TEMPLATE_INPUTS', validation.join('；'))
				return {
					...finish(graph, workflow, null, 'userdata-ui', fileHash),
					warnings: converted.warnings || []
				}
			}
		} catch {
			/* Nonstandard frontend graphs can still be selected from successful history. */
		}
	}
	return fail(
		catalog.failure?.error || (catalog.entries.length ? 'NO_MATCHING_HISTORY' : 'HISTORY_EMPTY'),
		catalog.failure?.message ||
			'没有与当前文件版本一致的成功记录，且文件无法安全转换。请从模板列表选择一条成功历史。',
		{ candidates: catalog.entries.map(historyListItem), scanComplete: catalog.complete }
	)
}
