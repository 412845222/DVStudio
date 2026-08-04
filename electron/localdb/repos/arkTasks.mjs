import { getLocalDb } from '../db.mjs'
import { isoToMs, parseOptionalJson, stringifyOptionalJson } from '../json.mjs'

function rowToArkTask(row) {
	if (!row) return null
	return {
		id: row.id,
		taskId: row.task_id,
		provider: row.provider,
		apiType: row.api_type,
		apiAction: row.api_action,
		model: row.model,
		status: row.status,
		prompt: row.prompt,
		negativePrompt: row.negative_prompt,
		resultUrls: parseOptionalJson(row.result_urls),
		resultText: row.result_text,
		thumbnailUrl: row.thumbnail_url,
		errorMessage: row.error_message,
		statusText: row.status_text,
		requestPayload: parseOptionalJson(row.request_payload),
		responsePayload: parseOptionalJson(row.response_payload),
		projectId: row.project_id ? Number(row.project_id) : null,
		nodeId: row.node_id,
		remoteTaskId: row.remote_task_id,
		createdAt: isoToMs(row.created_at),
		updatedAt: isoToMs(row.updated_at)
	}
}

export function createArkTasksRepo() {
	const db = getLocalDb()

	const listStmt = db.prepare('SELECT * FROM ark_tasks ORDER BY updated_at DESC, id DESC')
	const listByProjectStmt = db.prepare(
		'SELECT * FROM ark_tasks WHERE project_id = ? ORDER BY updated_at DESC, id DESC'
	)
	const getByTaskIdStmt = db.prepare('SELECT * FROM ark_tasks WHERE task_id = ? LIMIT 1')
	const insertStmt = db.prepare(
		`INSERT INTO ark_tasks (
      task_id, provider, api_type, api_action, model, status, prompt, negative_prompt,
      result_urls, result_text, thumbnail_url, error_message, status_text,
      request_payload, response_payload, project_id, node_id, remote_task_id
    ) VALUES (
      @taskId, @provider, @apiType, @apiAction, @model, @status, @prompt, @negativePrompt,
      @resultUrls, @resultText, @thumbnailUrl, @errorMessage, @statusText,
      @requestPayload, @responsePayload, @projectId, @nodeId, @remoteTaskId
    )`
	)
	const updateStmt = db.prepare(
		`UPDATE ark_tasks SET
      provider = @provider, api_type = @apiType, api_action = @apiAction,
      model = @model, status = @status, prompt = @prompt, negative_prompt = @negativePrompt,
      result_urls = @resultUrls, result_text = @resultText, thumbnail_url = @thumbnailUrl,
      error_message = @errorMessage, status_text = @statusText,
      request_payload = @requestPayload, response_payload = @responsePayload,
      project_id = @projectId, node_id = @nodeId, remote_task_id = @remoteTaskId,
      updated_at = datetime('now')
    WHERE task_id = @taskId`
	)
	const deleteByTaskIdStmt = db.prepare('DELETE FROM ark_tasks WHERE task_id = ?')

	function normalize(input) {
		const raw = input || {}
		return {
			taskId: String(raw.taskId || raw.task_id || '').trim(),
			provider: String(raw.provider || 'bytedance').trim(),
			apiType: String(raw.apiType || raw.api_type || '').trim(),
			apiAction: String(raw.apiAction || raw.api_action || '').trim(),
			model: String(raw.model || '').trim(),
			status: String(raw.status || 'queued').trim(),
			prompt: String(raw.prompt || '').trim(),
			negativePrompt: String(raw.negativePrompt || raw.negative_prompt || '').trim(),
			resultUrls: stringifyOptionalJson(raw.resultUrls || raw.result_urls),
			resultText: String(raw.resultText || raw.result_text || '').trim(),
			thumbnailUrl: String(raw.thumbnailUrl || raw.thumbnail_url || '').trim(),
			errorMessage: String(raw.errorMessage || raw.error_message || '').trim(),
			statusText: String(raw.statusText || raw.status_text || '').trim(),
			requestPayload: stringifyOptionalJson(raw.requestPayload || raw.request_payload),
			responsePayload: stringifyOptionalJson(raw.responsePayload || raw.response_payload),
			projectId:
				raw.projectId === undefined || raw.projectId === null || raw.projectId === ''
					? null
					: Number(raw.projectId) || null,
			nodeId: String(raw.nodeId || raw.node_id || '').trim(),
			remoteTaskId: String(raw.remoteTaskId || raw.remote_task_id || '').trim()
		}
	}

	function getByTaskId(taskId) {
		const key = String(taskId || '').trim()
		if (!key) return null
		return rowToArkTask(getByTaskIdStmt.get(key))
	}

	function list({ projectId, limit } = {}) {
		let rows
		if (projectId !== undefined && projectId !== null && projectId !== '') {
			rows = listByProjectStmt.all(Number(projectId))
		} else {
			rows = listStmt.all()
		}
		const normalized = rows.map(rowToArkTask)
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
