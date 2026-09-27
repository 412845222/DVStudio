import { workflowToPrompt } from '../workflow-converter.mjs'
import { executionGraph, validatePromptInputs } from './executionGraph.mjs'
import { FINGERPRINT_VERSION, semanticWorkflowHash } from './workflowFingerprint.mjs'
import { nodeSchemaHash, probeNodeSchema } from './capabilityProfile.mjs'
import crypto from 'node:crypto'
import {
	templateFailure,
	compareWorkflowSummary,
	RESOLVER_REVISION
} from './templateDiagnostics.mjs'
import {
	getJson,
	hashJson,
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
	let catalog
	let schema
	const warnings = []
	const details = { resolverRevision: RESOLVER_REVISION, correlationId: crypto.randomUUID() }
	const fail = (error, message, extra = {}) => {
		const result = templateFailure(error, message, base, catalog, extra)
		result.diagnostics = { ...result.diagnostics, ...details, error }
		return result
	}
	const loadCatalog = async () => (catalog ||= await scanHistory(client, base, repo))
	const finish = async (graph, workflow, entry, source, fileHash = '', association = 'direct') => {
		schema ||= await probeNodeSchema(client, base)
		if (!schema.ok) warnings.push('无法检查当前节点依赖；运行前将重新检查')
		const effective = schema.ok ? executionGraph(graph, schema.data) : graph
		const errors = schema.ok ? validatePromptInputs(effective, schema.data) : []
		if (errors.length)
			return fail(entry ? 'DEPENDENCY_CHANGED' : 'INVALID_TEMPLATE_INPUTS', errors.join('；'))
		return {
			ok: true,
			promptGraph: effective,
			nodeSchemas: schema.ok ? schema.data : null,
			workflow,
			promptId: entry?.promptId || '',
			timestamp: entry?.timestamp || 0,
			hasHistory: Boolean(entry),
			warnings: [...new Set([...warnings, ...(catalog?.warnings || [])])],
			diagnostics: {
				...details,
				stage: 'resolve',
				associationState: association,
				historyState: entry
					? 'available'
					: catalog
						? catalog.entries.length
							? 'available'
							: 'empty'
						: 'unchecked',
				readiness: schema.ok && Object.keys(schema.data).length ? 'ready' : 'unverified',
				archiveState: entry?.archiveState || (entry?.fromArchive ? 'saved' : 'not-archived'),
				scannedCount: catalog?.scannedCount || 0,
				rejectedHistory: catalog?.rejected || []
			},
			resolution: {
				contentHash: promptHash(effective),
				workflowHash: fileHash,
				semanticHash: workflow ? semanticWorkflowHash(workflow) : '',
				fingerprintVersion: FINGERPRINT_VERSION,
				nodeSchemaHash: schema.ok ? nodeSchemaHash(effective, schema.data) : '',
				snapshotId: entry?.promptId || '',
				source,
				schemaVersion: 2
			}
		}
	}
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
				if (!repo) throw new Error('archive unavailable')
				repo.save(base, entry)
				entry.archiveState = 'saved'
			} catch {
				entry.archiveState = 'failed'
				warnings.push('在线历史可用，但无法留存成功快照；请检查本地数据库')
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
			return finish(
				cached.promptGraph,
				cached.workflow,
				{ ...cached, fromArchive: true },
				'history-archive'
			)
		return fail(
			result.ok ? 'HISTORY_EMPTY' : result.error,
			result.ok ? '该记录已从 ComfyUI 移除，且尚未归档。请选择其他成功历史。' : result.message
		)
	}
	const file = await readWorkflow()
	if (!file.ok) {
		await loadCatalog()
		return fail(file.code || 'WORKFLOW_READ_FAILED', String(file.error || '读取工作流失败'))
	}
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
	await loadCatalog()
	const semanticHash = semanticWorkflowHash(workflow)
	details.fileHash = fileHash
	details.semanticHash = semanticHash
	details.candidateComparisons = catalog.entries.slice(0, 10).map((entry) => ({
		promptId: entry.promptId,
		workflowHash: entry.workflowHash,
		semanticHash: semanticWorkflowHash(entry.workflow),
		...compareWorkflowSummary(workflow, entry.workflow)
	}))
	const semanticEnabled = process.env.DVS_COMFY_SEMANTIC_MATCH !== '0'
	const candidates = catalog.entries.filter(
		(e) =>
			e.workflowHash === fileHash ||
			(semanticEnabled && semanticHash && semanticWorkflowHash(e.workflow) === semanticHash)
	)
	const picked = snapshotId ? candidates.find((e) => e.promptId === snapshotId) : candidates[0]
	if (picked)
		return finish(
			picked.promptGraph,
			workflow,
			picked,
			picked.fromArchive ? 'history-archive' : 'history-matched',
			fileHash,
			picked.workflowHash === fileHash ? 'exact' : 'semantic'
		)
	// No version-equivalent history: compile the current saved file, never combine two revisions.
	const info = (schema = await probeNodeSchema(client, base))
	if (info.ok) {
		try {
			const converted = workflowToPrompt(workflow, info.data)
			details.conversion = {
				error: converted.error || null,
				warnings: (converted.warnings || []).slice(0, 30),
				unknownTypes: [
					...new Set(
						Object.values(converted.prompt || {})
							.filter((n) => !isRecord(info.data[n.class_type]))
							.map((n) => n.class_type)
					)
				].slice(0, 30)
			}
			if (
				!converted.error &&
				!converted.warnings?.length &&
				unwrapPrompt(converted.prompt) &&
				Object.values(converted.prompt).every((n) => isRecord(info.data[n.class_type]))
			) {
				const graph = executionGraph(converted.prompt, info.data)
				const validation = validatePromptInputs(graph, info.data)
				if (validation.length) return fail('INVALID_TEMPLATE_INPUTS', validation.join('；'))
				// Frontend upgrades can add/remove widget socket descriptors and localized
				// labels while producing exactly the same API graph. Require a lossless,
				// validated conversion and equality of every executed input before reuse.
				const executionHash = promptHash(graph)
				const equivalent = catalog.entries.find(
					(entry) =>
						semanticEnabled &&
						(!snapshotId || entry.promptId === snapshotId) &&
						promptHash(executionGraph(entry.promptGraph, info.data)) === executionHash
				)
				details.executionHash = executionHash
				if (equivalent)
					return finish(
						graph,
						workflow,
						equivalent,
						equivalent.fromArchive ? 'history-archive' : 'history-matched',
						fileHash,
						'executable'
					)
				if (snapshotId)
					return fail(
						'STALE_TEMPLATE',
						'已选快照与当前文件不再一致或不可恢复，请刷新检查并重新选择'
					)
				return {
					...(await finish(graph, workflow, null, 'userdata-ui', fileHash))
				}
			}
		} catch {
			details.conversion = { error: 'CONVERSION_EXCEPTION' }
			/* Nonstandard frontend graphs can still be selected from successful history. */
		}
	} else details.schemaProbeError = info.error
	if (snapshotId)
		return fail('STALE_TEMPLATE', '已选快照与当前文件不再一致或不可恢复，请刷新检查并重新选择')
	return fail(
		catalog.failure?.error ||
			(!catalog.complete
				? 'HISTORY_SCAN_INCOMPLETE'
				: catalog.entries.length
					? 'NO_MATCHING_HISTORY'
					: 'HISTORY_EMPTY'),
		catalog.failure?.message ||
			(catalog.entries.length
				? '已找到成功记录，但与保存文件有差异；请在下方选择成功快照，或下载诊断记录查看转换原因。'
				: catalog.rejected?.length
					? '已读取历史，但记录未成功完成（失败或中断），不能作为成功快照。当前文件转换也未通过，请下载诊断记录。'
					: '当前没有可复用的成功历史，文件也未能通过转换检查。请下载诊断记录查看原因，或导入 API 格式模板。')
	)
}
