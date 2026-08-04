import { getLocalDb } from '../db.mjs'

function normalizeRow(row) {
	if (!row) return null
	let extraData = {}
	try {
		extraData = row.extra_data ? JSON.parse(row.extra_data) : {}
	} catch (_) {
		extraData = {}
	}
	return {
		id: row.id,
		provider: row.provider || '',
		taskType: row.task_type || '',
		projectId: row.project_id != null ? Number(row.project_id) : null,
		nodeId: row.node_id || '',
		remoteTaskId: row.remote_task_id || '',
		clientRequestId: row.client_request_id || '',
		status: row.status || 'pending',
		progress: Number(row.progress) || 0,
		title: row.title || '',
		prompt: row.prompt || '',
		errorMessage: row.error_message || '',
		statusText: row.status_text || '',
		resultAssets: row.result_assets ? JSON.parse(row.result_assets) : [],
		backfilled: !!row.backfilled,
		extraData,
		category: extraData.category || 'custom',
		label: extraData.label || '',
		coverUrl: extraData.coverUrl || '',
		resultUrl: extraData.resultUrl || '',
		canCancel: extraData.canCancel !== false,
		startedAt: row.started_at != null ? Number(row.started_at) : null,
		completedAt: row.completed_at != null ? Number(row.completed_at) : null,
		createdAt: Number(row.created_at) || Date.now(),
		updatedAt: Number(row.updated_at) || Date.now()
	}
}

function serialize(task) {
	const now = Date.now()
	const extraData = {
		...(task.extraData || {}),
		category: task.category || 'custom',
		label: task.label || '',
		coverUrl: task.coverUrl || '',
		resultUrl: task.resultUrl || '',
		canCancel: task.canCancel !== false
	}
	return {
		id: task.id,
		provider: task.provider || '',
		task_type: task.taskType || '',
		project_id: task.projectId != null ? Number(task.projectId) : null,
		node_id: task.nodeId || '',
		remote_task_id: task.remoteTaskId || '',
		client_request_id: task.clientRequestId || '',
		status: task.status || 'pending',
		progress: Math.max(0, Math.min(100, Number(task.progress) || 0)),
		title: task.title || '',
		prompt: task.prompt || '',
		error_message: task.errorMessage || '',
		status_text: task.statusText || '',
		result_assets: task.resultAssets ? JSON.stringify(task.resultAssets) : null,
		extra_data: JSON.stringify(extraData),
		backfilled: task.backfilled ? 1 : 0,
		started_at: task.startedAt != null ? Number(task.startedAt) : null,
		completed_at: task.completedAt != null ? Number(task.completedAt) : null,
		created_at: task.createdAt || now,
		updated_at: now
	}
}

function makeTaskId(prefix = 'gtask') {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createGlobalTasksRepo() {
	const db = getLocalDb()

	const insertStmt = db.prepare(`
    INSERT INTO global_tasks (
      id, provider, task_type, project_id, node_id, remote_task_id, client_request_id,
      status, progress, title, prompt, error_message, status_text,
      result_assets, extra_data, backfilled, started_at, completed_at, created_at, updated_at
    ) VALUES (
      @id, @provider, @task_type, @project_id, @node_id, @remote_task_id, @client_request_id,
      @status, @progress, @title, @prompt, @error_message, @status_text,
      @result_assets, @extra_data, @backfilled, @started_at, @completed_at, @created_at, @updated_at
    )
  `)

	const updateStmt = db.prepare(`
    UPDATE global_tasks SET
      provider = @provider,
      task_type = @task_type,
      project_id = @project_id,
      node_id = @node_id,
      remote_task_id = @remote_task_id,
      client_request_id = @client_request_id,
      status = @status,
      progress = @progress,
      title = @title,
      prompt = @prompt,
      error_message = @error_message,
      status_text = @status_text,
      result_assets = @result_assets,
      extra_data = @extra_data,
      backfilled = @backfilled,
      started_at = @started_at,
      completed_at = @completed_at,
      updated_at = @updated_at
    WHERE id = @id
  `)

	const getByIdStmt = db.prepare('SELECT * FROM global_tasks WHERE id = ?')
	const getByRemoteTaskIdStmt = db.prepare(
		'SELECT * FROM global_tasks WHERE project_id = ? AND provider = ? AND remote_task_id = ? LIMIT 1'
	)
	const getByRemoteTaskIdAnyProjectStmt = db.prepare(
		'SELECT * FROM global_tasks WHERE provider = ? AND remote_task_id = ? LIMIT 1'
	)
	const getByClientRequestIdStmt = db.prepare(
		'SELECT * FROM global_tasks WHERE project_id = ? AND client_request_id = ? LIMIT 1'
	)
	const getByClientRequestIdAnyProjectStmt = db.prepare(
		'SELECT * FROM global_tasks WHERE client_request_id = ? LIMIT 1'
	)
	const getByNodeIdStmt = db.prepare(
		"SELECT * FROM global_tasks WHERE node_id = ? AND status IN ('submitting', 'queued', 'running') ORDER BY created_at DESC LIMIT 1"
	)
	const deleteStmt = db.prepare('DELETE FROM global_tasks WHERE id = ?')
	const countActiveStmt = db.prepare(
		"SELECT COUNT(*) as count FROM global_tasks WHERE status IN ('pending', 'submitting', 'queued', 'running')"
	)
	const listActiveStmt = db.prepare(
		"SELECT * FROM global_tasks WHERE status IN ('pending', 'submitting', 'queued', 'running') AND backfilled = 0 ORDER BY created_at DESC"
	)
	const listAllStmt = db.prepare(
		'SELECT * FROM global_tasks ORDER BY created_at DESC LIMIT ? OFFSET ?'
	)
	const listFilteredStmt = db.prepare(
		'SELECT * FROM global_tasks WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
	)
	const listByProjectStmt = db.prepare(
		'SELECT * FROM global_tasks WHERE project_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
	)
	const listUnbackfilledCompletedStmt = db.prepare(
		"SELECT * FROM global_tasks WHERE project_id = ? AND status = 'completed' AND backfilled = 0 ORDER BY completed_at DESC"
	)
	const dismissStmt = db.prepare(
		"UPDATE global_tasks SET status = 'dismissed', updated_at = ? WHERE id = ?"
	)
	const markBackfilledStmt = db.prepare(
		'UPDATE global_tasks SET backfilled = 1, updated_at = ? WHERE id = ?'
	)

	function findExistingByUniqueKey(projectId, provider, remoteTaskId) {
		if (!provider || !remoteTaskId) return null
		if (projectId != null) {
			const row = getByRemoteTaskIdStmt.get(Number(projectId), provider, remoteTaskId)
			if (row) return normalizeRow(row)
		}
		const row = getByRemoteTaskIdAnyProjectStmt.get(provider, remoteTaskId)
		return normalizeRow(row)
	}

	function findByClientRequestId(projectId, clientRequestId) {
		if (!clientRequestId) return null
		if (projectId != null) {
			const row = getByClientRequestIdStmt.get(Number(projectId), clientRequestId)
			if (row) return normalizeRow(row)
		}
		const row = getByClientRequestIdAnyProjectStmt.get(clientRequestId)
		return normalizeRow(row)
	}

	function upsert(input) {
		if (!input || !input.provider) return { ok: false, error: 'provider is required' }

		if (input.remoteTaskId) {
			const existing = findExistingByUniqueKey(input.projectId, input.provider, input.remoteTaskId)
			if (existing) {
				const merged = { ...existing, ...input, id: existing.id }
				if (merged.status === 'running' && !merged.startedAt) merged.startedAt = Date.now()
				if (
					(merged.status === 'completed' ||
						merged.status === 'failed' ||
						merged.status === 'cancelled') &&
					!merged.completedAt
				) {
					merged.completedAt = Date.now()
				}
				if (merged.status === 'completed') merged.progress = 100
				const params = serialize(merged)
				updateStmt.run(params)
				return { ok: true, task: normalizeRow(getByIdStmt.get(existing.id)), created: false }
			}
		}

		if (input.clientRequestId) {
			const existingByClient = findByClientRequestId(input.projectId, input.clientRequestId)
			if (existingByClient) {
				const merged = { ...existingByClient, ...input, id: existingByClient.id }
				if (merged.status === 'running' && !merged.startedAt) merged.startedAt = Date.now()
				if (
					(merged.status === 'completed' ||
						merged.status === 'failed' ||
						merged.status === 'cancelled') &&
					!merged.completedAt
				) {
					merged.completedAt = Date.now()
				}
				if (merged.status === 'completed') merged.progress = 100
				const params = serialize(merged)
				updateStmt.run(params)
				return {
					ok: true,
					task: normalizeRow(getByIdStmt.get(existingByClient.id)),
					created: false
				}
			}
		}

		const id = input.id || makeTaskId(input.provider)
		const now = Date.now()
		const task = {
			createdAt: now,
			updatedAt: now,
			status: 'pending',
			backfilled: false,
			...input,
			id
		}
		if (task.status === 'running' && !task.startedAt) task.startedAt = now
		const params = serialize(task)
		try {
			insertStmt.run(params)
		} catch (err) {
			if (String(err?.message || '').includes('UNIQUE')) {
				const existing = findExistingByUniqueKey(
					input.projectId,
					input.provider,
					input.remoteTaskId
				)
				if (existing) {
					const merged = { ...existing, ...input, id: existing.id }
					const upParams = serialize(merged)
					updateStmt.run(upParams)
					return { ok: true, task: normalizeRow(getByIdStmt.get(existing.id)), created: false }
				}
				if (input.clientRequestId) {
					const existingByClient = findByClientRequestId(input.projectId, input.clientRequestId)
					if (existingByClient) {
						const merged = { ...existingByClient, ...input, id: existingByClient.id }
						const upParams = serialize(merged)
						updateStmt.run(upParams)
						return {
							ok: true,
							task: normalizeRow(getByIdStmt.get(existingByClient.id)),
							created: false
						}
					}
				}
			}
			throw err
		}
		return { ok: true, task: normalizeRow(getByIdStmt.get(id)), created: true }
	}

	return {
		create(input) {
			if (!input || !input.id) return { ok: false, error: 'id is required' }
			const params = serialize({ createdAt: Date.now(), updatedAt: Date.now(), ...input })
			insertStmt.run(params)
			return { ok: true, task: normalizeRow(getByIdStmt.get(params.id)) }
		},

		upsert,

		update(id, patch) {
			if (!id) return { ok: false, error: 'id is required' }
			const existing = getByIdStmt.get(id)
			if (!existing) return { ok: false, error: `Task ${id} not found` }
			const current = normalizeRow(existing)
			const merged = { ...current, ...patch, id }
			if (merged.status === 'running' && !merged.startedAt) merged.startedAt = Date.now()
			if (
				(merged.status === 'completed' ||
					merged.status === 'failed' ||
					merged.status === 'cancelled' ||
					merged.status === 'dismissed') &&
				!merged.completedAt
			) {
				merged.completedAt = Date.now()
			}
			if (merged.status === 'completed') merged.progress = 100
			const params = serialize(merged)
			updateStmt.run(params)
			return { ok: true, task: normalizeRow(getByIdStmt.get(id)) }
		},

		getById(id) {
			if (!id) return null
			const row = getByIdStmt.get(id)
			return normalizeRow(row)
		},

		findByUniqueKey(projectId, provider, remoteTaskId) {
			return findExistingByUniqueKey(projectId, provider, remoteTaskId)
		},

		findByClientRequestId(projectId, clientRequestId) {
			return findByClientRequestId(projectId, clientRequestId)
		},

		findActiveByNodeId(nodeId) {
			if (!nodeId) return null
			const row = getByNodeIdStmt.get(nodeId)
			return normalizeRow(row)
		},

		getByRemoteTaskId(provider, remoteTaskId, projectId = null) {
			return findExistingByUniqueKey(projectId, provider, remoteTaskId)
		},

		delete(id) {
			if (!id) return { ok: false, error: 'id is required' }
			const result = deleteStmt.run(id)
			return { ok: true, changes: result.changes }
		},

		dismiss(id) {
			if (!id) return { ok: false, error: 'id is required' }
			dismissStmt.run(Date.now(), id)
			return { ok: true, task: normalizeRow(getByIdStmt.get(id)) }
		},

		markBackfilled(id) {
			if (!id) return { ok: false, error: 'id is required' }
			markBackfilledStmt.run(Date.now(), id)
			return { ok: true, task: normalizeRow(getByIdStmt.get(id)) }
		},

		list(options = {}) {
			const { status, limit = 100, offset = 0 } = options
			const lim = Math.max(1, Math.min(500, Number(limit) || 100))
			const off = Math.max(0, Number(offset) || 0)
			let rows
			if (status) {
				rows = listFilteredStmt.all(status, lim, off)
			} else {
				rows = listAllStmt.all(lim, off)
			}
			return rows.map(normalizeRow)
		},

		listByProject(projectId, options = {}) {
			if (projectId == null) return this.list(options)
			const { limit = 100, offset = 0 } = options
			const lim = Math.max(1, Math.min(500, Number(limit) || 100))
			const off = Math.max(0, Number(offset) || 0)
			const rows = listByProjectStmt.all(Number(projectId), lim, off)
			return rows.map(normalizeRow)
		},

		listUnbackfilledCompleted(projectId) {
			if (projectId == null) return []
			const rows = listUnbackfilledCompletedStmt.all(Number(projectId))
			return rows.map(normalizeRow)
		},

		listActive() {
			const rows = listActiveStmt.all()
			return rows.map(normalizeRow)
		},

		countActive() {
			const row = countActiveStmt.get()
			return Number(row?.count) || 0
		}
	}
}
