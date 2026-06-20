import { getLocalDb } from '../db.mjs'
import { isoToMs, parseOptionalJson, stringifyOptionalJson } from '../json.mjs'

function rowToMeshyTask(row) {
	if (!row) return null
	return {
		id: row.id,
		taskId: row.task_id,
		mode: row.mode,
		taskTarget: row.task_target,
		taskFamily: row.task_family,
		relationKind: row.relation_kind,
		rootTaskId: row.root_task_id,
		parentTaskId: row.parent_task_id,
		capabilities: parseOptionalJson(row.capabilities),
		status: row.status,
		progress: Number(row.progress) || 0,
		prompt: row.prompt,
		negativePrompt: row.negative_prompt,
		imageCount: Number(row.image_count) || 0,
		thumbnailUrl: row.thumbnail_url,
		preferredModelUrl: row.preferred_model_url,
		localAssetUrl: row.local_asset_url,
		localAssetPath: row.local_asset_path,
		sourceModelUrl: row.source_model_url,
		errorMessage: row.error_message,
		statusText: row.status_text,
		requestPayload: parseOptionalJson(row.request_payload),
		responsePayload: parseOptionalJson(row.response_payload),
		projectId: row.project_id ? Number(row.project_id) : null,
		lastNodeId: row.last_node_id,
		remoteCreatedAt: row.remote_created_at,
		remoteFinishedAt: row.remote_finished_at,
		createdAt: isoToMs(row.created_at),
		updatedAt: isoToMs(row.updated_at),
	}
}

export function createMeshyTasksRepo() {
	const db = getLocalDb()

	const listStmt = db.prepare('SELECT * FROM meshy_tasks ORDER BY updated_at DESC, id DESC')
	const listByProjectStmt = db.prepare(
		'SELECT * FROM meshy_tasks WHERE project_id = ? ORDER BY updated_at DESC, id DESC',
	)
	const getByTaskIdStmt = db.prepare('SELECT * FROM meshy_tasks WHERE task_id = ? LIMIT 1')
	const insertStmt = db.prepare(
		`INSERT INTO meshy_tasks (
      task_id, mode, task_target, task_family, relation_kind, root_task_id, parent_task_id,
      capabilities, status, progress, prompt, negative_prompt, image_count,
      thumbnail_url, preferred_model_url, local_asset_url, local_asset_path, source_model_url,
      error_message, status_text, request_payload, response_payload, project_id, last_node_id,
      remote_created_at, remote_finished_at
    ) VALUES (
      @taskId, @mode, @taskTarget, @taskFamily, @relationKind, @rootTaskId, @parentTaskId,
      @capabilities, @status, @progress, @prompt, @negativePrompt, @imageCount,
      @thumbnailUrl, @preferredModelUrl, @localAssetUrl, @localAssetPath, @sourceModelUrl,
      @errorMessage, @statusText, @requestPayload, @responsePayload, @projectId, @lastNodeId,
      @remoteCreatedAt, @remoteFinishedAt
    )`,
	)
	const updateStmt = db.prepare(
		`UPDATE meshy_tasks SET
      mode = @mode, task_target = @taskTarget, task_family = @taskFamily,
      relation_kind = @relationKind, root_task_id = @rootTaskId, parent_task_id = @parentTaskId,
      capabilities = @capabilities, status = @status, progress = @progress, prompt = @prompt,
      negative_prompt = @negativePrompt, image_count = @imageCount,
      thumbnail_url = @thumbnailUrl, preferred_model_url = @preferredModelUrl,
      local_asset_url = @localAssetUrl, local_asset_path = @localAssetPath,
      source_model_url = @sourceModelUrl, error_message = @errorMessage, status_text = @statusText,
      request_payload = @requestPayload, response_payload = @responsePayload,
      project_id = @projectId, last_node_id = @lastNodeId,
      remote_created_at = @remoteCreatedAt, remote_finished_at = @remoteFinishedAt,
      updated_at = datetime('now')
    WHERE task_id = @taskId`,
	)
	const deleteByTaskIdStmt = db.prepare('DELETE FROM meshy_tasks WHERE task_id = ?')

	function normalize(input) {
		const raw = input || {}
		return {
			taskId: String(raw.taskId || raw.task_id || '').trim(),
			mode: String(raw.mode || '').trim(),
			taskTarget: String(raw.taskTarget || raw.task_target || '').trim(),
			taskFamily: String(raw.taskFamily || raw.task_family || '').trim(),
			relationKind: String(raw.relationKind || raw.relation_kind || '').trim(),
			rootTaskId: String(raw.rootTaskId || raw.root_task_id || '').trim(),
			parentTaskId: String(raw.parentTaskId || raw.parent_task_id || '').trim(),
			capabilities: stringifyOptionalJson(raw.capabilities),
			status: String(raw.status || 'idle').trim(),
			progress: Number(raw.progress) || 0,
			prompt: String(raw.prompt || '').trim(),
			negativePrompt: String(raw.negativePrompt || raw.negative_prompt || '').trim(),
			imageCount: Number(raw.imageCount || raw.image_count) || 0,
			thumbnailUrl: String(raw.thumbnailUrl || raw.thumbnail_url || '').trim(),
			preferredModelUrl: String(raw.preferredModelUrl || raw.preferred_model_url || '').trim(),
			localAssetUrl: String(raw.localAssetUrl || raw.local_asset_url || '').trim(),
			localAssetPath: String(raw.localAssetPath || raw.local_asset_path || '').trim(),
			sourceModelUrl: String(raw.sourceModelUrl || raw.source_model_url || '').trim(),
			errorMessage: String(raw.errorMessage || raw.error_message || '').trim(),
			statusText: String(raw.statusText || raw.status_text || '').trim(),
			requestPayload: stringifyOptionalJson(raw.requestPayload || raw.request_payload),
			responsePayload: stringifyOptionalJson(raw.responsePayload || raw.response_payload),
			projectId: raw.projectId === undefined || raw.projectId === null || raw.projectId === ''
				? null
				: Number(raw.projectId) || null,
			lastNodeId: String(raw.lastNodeId || raw.last_node_id || '').trim(),
			remoteCreatedAt: String(raw.remoteCreatedAt || raw.remote_created_at || '').trim(),
			remoteFinishedAt: String(raw.remoteFinishedAt || raw.remote_finished_at || '').trim(),
		}
	}

	function getByTaskId(taskId) {
		const key = String(taskId || '').trim()
		if (!key) return null
		return rowToMeshyTask(getByTaskIdStmt.get(key))
	}

	function list({ projectId, limit } = {}) {
		let rows
		if (projectId !== undefined && projectId !== null && projectId !== '') {
			rows = listByProjectStmt.all(Number(projectId))
		} else {
			rows = listStmt.all()
		}
		const normalized = rows.map(rowToMeshyTask)
		if (limit && Number(limit) > 0) return normalized.slice(0, Number(limit))
		return normalized
	}

	function upsert(input) {
		const params = normalize(input)
		if (!params.taskId) return { ok: false, error: 'taskId is required' }
		const existing = getByTaskIdStmt.get(params.taskId)
		if (existing) updateStmt.run(params)
		else insertStmt.run(params)
		return { ok: true, task: getByTaskId(params.taskId) }
	}

	function remove(taskId) {
		const key = String(taskId || '').trim()
		if (!key) return { ok: false, error: 'taskId is required' }
		deleteByTaskIdStmt.run(key)
		return { ok: true, taskId: key }
	}

	return { list, getByTaskId, upsert, remove }
}
