import crypto from 'node:crypto'

export const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
export const isSocket = (v) =>
	Array.isArray(v) &&
	v.length === 2 &&
	(typeof v[0] === 'string' || typeof v[0] === 'number') &&
	Number.isInteger(v[1])

export function unwrapPrompt(value) {
	const graph = isRecord(value?.prompt) ? value.prompt : value
	if (!isRecord(graph) || Array.isArray(graph.nodes) || !Object.keys(graph).length) return null
	for (const node of Object.values(graph)) {
		if (
			!isRecord(node) ||
			typeof node.class_type !== 'string' ||
			!node.class_type.trim() ||
			!isRecord(node.inputs)
		)
			return null
		for (const input of Object.values(node.inputs)) {
			if (isSocket(input) && (!Object.hasOwn(graph, String(input[0])) || input[1] < 0)) return null
		}
	}
	return graph
}

function canonical(value) {
	if (Array.isArray(value)) return value.map(canonical)
	if (!isRecord(value)) return value
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.filter((k) => value[k] !== undefined)
			.map((k) => [k, canonical(value[k])])
	)
}

export function hashJson(value) {
	return crypto
		.createHash('sha256')
		.update(JSON.stringify(canonical(value)))
		.digest('hex')
}

export function promptHash(graph) {
	return hashJson(
		Object.fromEntries(
			Object.entries(graph).map(([id, n]) => [id, { class_type: n.class_type, inputs: n.inputs }])
		)
	)
}

// A workflow id identifies a family, not a saved revision. Layout and notes do not execute.
export function workflowHash(workflow) {
	if (!Array.isArray(workflow?.nodes)) return ''
	const notes = new Set(['Note', 'MarkdownNote'])
	const nodes = workflow.nodes
		.filter((n) => !notes.has(n.type))
		.map((n) => ({
			id: String(n.id),
			type: n.type,
			mode: n.mode ?? 0,
			inputs: n.inputs,
			widgets_values: n.widgets_values,
			properties: n.properties
		}))
		.sort((a, b) => a.id.localeCompare(b.id))
	const ids = new Set(nodes.map((n) => n.id))
	const links = (workflow.links || []).filter(
		(l) => !Array.isArray(l) || (ids.has(String(l[1])) && ids.has(String(l[3])))
	)
	return hashJson({ nodes, links, definitions: workflow.definitions })
}

export function historyTimestamp(entry) {
	const ms = (v) =>
		Number.isFinite(Number(v)) && Number(v) > 0
			? Number(v) < 1e11
				? Number(v) * 1000
				: Number(v)
			: 0
	const messages = entry?.status?.messages || []
	const success = messages.find((m) => m?.[0] === 'execution_success')
	return (
		ms(success?.[1]?.timestamp) ||
		ms(entry?.prompt?.[3]?.create_time) ||
		Math.max(0, ...messages.map((m) => ms(m?.[1]?.timestamp) || ms(m?.[0])))
	)
}

export function normalizeHistoryEntry(promptId, entry) {
	const status = entry?.status
	const messages = Array.isArray(status?.messages) ? status.messages : []
	if (messages.some((m) => /execution_error|execution_interrupted/.test(String(m?.[0]))))
		return null
	if (status?.status_str !== 'success' && !(status?.completed === true && !status.status_str))
		return null
	const graph = unwrapPrompt(entry?.prompt?.[2])
	if (!graph) return null
	const workflow = entry.prompt[3]?.extra_pnginfo?.workflow || null
	return {
		promptId,
		promptGraph: graph,
		workflow,
		timestamp: historyTimestamp(entry),
		contentHash: promptHash(graph),
		workflowHash: workflowHash(workflow),
		workflowId: String(workflow?.id || ''),
		schemaVersion: 1
	}
}

export async function getJson(client, url) {
	try {
		const res = await client.get(url, { timeout: 10000 })
		if (!res.ok)
			return {
				ok: false,
				error: [401, 403].includes(res.status)
					? 'HISTORY_ACCESS_DENIED'
					: res.status === 404
						? 'HISTORY_NOT_SUPPORTED'
						: 'HISTORY_UNREACHABLE',
				message: `ComfyUI HTTP ${res.status}`
			}
		const data = typeof res.body === 'string' ? JSON.parse(res.body) : res.body
		if (!isRecord(data))
			return {
				ok: false,
				error: 'HISTORY_INVALID_RESPONSE',
				message: 'ComfyUI history is not an object'
			}
		return { ok: true, data }
	} catch (err) {
		return {
			ok: false,
			error: err instanceof SyntaxError ? 'HISTORY_INVALID_RESPONSE' : 'HISTORY_UNREACHABLE',
			message: String(err.message || err)
		}
	}
}

const scans = new WeakMap()
export function scanHistory(client, base, repo) {
	let pending = scans.get(client)
	if (!pending) scans.set(client, (pending = new Map()))
	if (pending.has(base)) return pending.get(base)
	const promise = collectHistory(client, base, repo).finally(() => pending.delete(base))
	pending.set(base, promise)
	return promise
}

async function collectHistory(client, base, repo) {
	const entries = new Map()
	const seen = new Set()
	const warnings = []
	if (!repo) warnings.push('本地历史归档暂不可用；当前仍可读取 ComfyUI 在线历史')
	let complete = false
	let failure = null
	try {
		for (const entry of repo?.list(base) || [])
			entries.set(entry.promptId, { ...entry, fromArchive: true })
	} catch {
		warnings.push('无法读取已归档的 ComfyUI 历史')
	}
	const accept = (data) => {
		let added = 0
		for (const [id, value] of Object.entries(data)) {
			if (!seen.has(id)) added++
			seen.add(id)
			const entry = normalizeHistoryEntry(id, value)
			if (!entry) continue
			if (entries.has(id) && entries.get(id).contentHash !== entry.contentHash) {
				warnings.push('历史 ID 内容冲突，已保留归档版本：' + id)
				continue
			}
			entries.set(id, entry)
			try {
				repo?.save(base, entry)
			} catch {
				if (!warnings.includes('无法留存 ComfyUI 成功快照'))
					warnings.push('无法留存 ComfyUI 成功快照')
			}
		}
		return added
	}
	const start = Date.now()
	for (let offset = 0; offset < 20000 && Date.now() - start < 30000; offset += 200) {
		const result = await getJson(client, `${base}/history?max_items=200&offset=${offset}`)
		if (!result.ok) {
			failure = result
			break
		}
		const count = Object.keys(result.data).length
		const added = accept(result.data)
		if (count < 200) {
			complete = true
			break
		}
		if (!added) break // Older servers may ignore offset; never spin forever.
	}
	if (complete && seen.size >= 200) {
		const tail = await getJson(client, `${base}/history?max_items=200`)
		if (tail.ok) accept(tail.data)
		else {
			complete = false
			failure = tail
		}
	}
	if (!complete)
		warnings.push('历史扫描未完成；刷新可重新扫描，上游已清空的记录只能从已归档快照读取')
	return {
		entries: [...entries.values()].sort(
			(a, b) => b.timestamp - a.timestamp || a.promptId.localeCompare(b.promptId)
		),
		complete,
		scannedCount: seen.size,
		warnings,
		failure
	}
}

export function historyListItem(entry) {
	const time = entry.timestamp
		? new Date(entry.timestamp).toLocaleString('zh-CN', { hour12: false })
		: '时间未知'
	const name =
		Object.values(entry.promptGraph).find((n) => /Save|Combine|Preview/.test(n.class_type))
			?.class_type || '工作流'
	return {
		path: `history://${entry.promptId}`,
		name: `[${entry.fromArchive ? '已归档' : '成功历史'}] ${name} · ${time} · ${entry.promptId.slice(0, 8)}`,
		source: 'history',
		promptId: entry.promptId,
		timestamp: entry.timestamp
	}
}
