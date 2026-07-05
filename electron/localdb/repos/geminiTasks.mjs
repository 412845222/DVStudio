import { getLocalDb } from '../db.mjs'
import { isoToMs, parseOptionalJson, stringifyOptionalJson } from '../json.mjs'

function rowToGeminiTask(row) {
	if (!row) return null
	return {
		id: row.id,
		taskId: row.task_id,
		model: row.model,
		modelLabel: row.model_label,
		status: row.status,
		progress: Number(row.progress) || 0,
		prompt: row.prompt,
		negativePrompt: row.negative_prompt,
		aspectRatio: row.aspect_ratio,
		numImages: Number(row.num_images) || 1,
		resultImages: parseOptionalJson(row.result_images),
		thumbnailUrl: row.thumbnail_url,
		errorMessage: row.error_message,
		errorCode: row.error_code,
		statusText: row.status_text,
		requestPayload: parseOptionalJson(row.request_payload),
		responsePayload: parseOptionalJson(row.response_payload),
		projectId: row.project_id ? Number(row.project_id) : null,
		nodeId: row.node_id,
		createdAt: isoToMs(row.created_at),
		startedAt: isoToMs(row.started_at),
		completedAt: isoToMs(row.completed_at),
		updatedAt: isoToMs(row.updated_at)
	}
}

export function createGeminiTasksRepo() {
	const db = getLocalDb()

	const listStmt = db.prepare('SELECT * FROM gemini_tasks ORDER BY updated_at DESC, id DESC')
	const listByProjectStmt = db.prepare(
		'SELECT * FROM gemini_tasks WHERE project_id = ? ORDER BY updated_at DESC, id DESC'
	)
	const listByProjectAndStatusStmt = db.prepare(
		'SELECT * FROM gemini_tasks WHERE project_id = ? AND status = ? ORDER BY updated_at DESC, id DESC'
	)
	const listByStatusStmt = db.prepare(
		'SELECT * FROM gemini_tasks WHERE status = ? ORDER BY updated_at DESC, id DESC'
	)
	const getByTaskIdStmt = db.prepare('SELECT * FROM gemini_tasks WHERE task_id = ? LIMIT 1')
	const insertStmt = db.prepare(
		`INSERT INTO gemini_tasks (
      task_id, model, model_label, status, progress, prompt, negative_prompt, aspect_ratio, num_images,
      result_images, thumbnail_url, error_message, error_code, status_text,
      request_payload, response_payload, project_id, node_id, started_at, completed_at
    ) VALUES (
      @taskId, @model, @modelLabel, @status, @progress, @prompt, @negativePrompt, @aspectRatio, @numImages,
      @resultImages, @thumbnailUrl, @errorMessage, @errorCode, @statusText,
      @requestPayload, @responsePayload, @projectId, @nodeId, @startedAt, @completedAt
    )`
	)
	const updateStmt = db.prepare(
		`UPDATE gemini_tasks SET
      model = @model, model_label = @modelLabel, status = @status, progress = @progress,
      prompt = @prompt, negative_prompt = @negativePrompt, aspect_ratio = @aspectRatio, num_images = @numImages,
      result_images = @resultImages, thumbnail_url = @thumbnailUrl,
      error_message = @errorMessage, error_code = @errorCode, status_text = @statusText,
      request_payload = @requestPayload, response_payload = @responsePayload,
      project_id = @projectId, node_id = @nodeId,
      started_at = @startedAt, completed_at = @completedAt,
      updated_at = datetime('now')
    WHERE task_id = @taskId`
	)
	const deleteByTaskIdStmt = db.prepare('DELETE FROM gemini_tasks WHERE task_id = ?')
	const deleteCompletedByProjectStmt = db.prepare(
		'DELETE FROM gemini_tasks WHERE project_id = ? AND status IN (?, ?)'
	)

	function normalize(input) {
		const raw = input || {}
		return {
			taskId: String(raw.taskId || raw.task_id || '').trim(),
			model: String(raw.model || '').trim(),
			modelLabel: String(raw.modelLabel || raw.model_label || '').trim(),
			status: String(raw.status || 'submitting').trim(),
			progress: Number(raw.progress) || 0,
			prompt: String(raw.prompt || '').trim(),
			negativePrompt: String(raw.negativePrompt || raw.negative_prompt || '').trim(),
			aspectRatio: String(raw.aspectRatio || raw.aspect_ratio || '1:1').trim(),
			numImages: Number(raw.numImages || raw.num_images) || 1,
			resultImages: stringifyOptionalJson(raw.resultImages),
			thumbnailUrl: String(raw.thumbnailUrl || raw.thumbnail_url || '').trim(),
			errorMessage: String(raw.errorMessage || raw.error_message || '').trim(),
			errorCode: String(raw.errorCode || raw.error_code || '').trim(),
			statusText: String(raw.statusText || raw.status_text || '').trim(),
			requestPayload: stringifyOptionalJson(raw.requestPayload),
			responsePayload: stringifyOptionalJson(raw.responsePayload),
			projectId:
				raw.projectId === undefined || raw.projectId === null || raw.projectId === ''
					? null
					: Number(raw.projectId) || null,
			nodeId: String(raw.nodeId || raw.node_id || '').trim(),
			startedAt: raw.startedAt || raw.started_at || null,
			completedAt: raw.completedAt || raw.completed_at || null
		}
	}

	function getByTaskId(taskId) {
		const key = String(taskId || '').trim()
		if (!key) return null
		return rowToGeminiTask(getByTaskIdStmt.get(key))
	}

	function list({ projectId, status, limit } = {}) {
		let rows
		if (projectId !== undefined && projectId !== null && projectId !== '') {
			if (status && status !== 'all') {
				rows = listByProjectAndStatusStmt.all(Number(projectId), String(status))
			} else {
				rows = listByProjectStmt.all(Number(projectId))
			}
		} else if (status && status !== 'all') {
			rows = listByStatusStmt.all(String(status))
		} else {
			rows = listStmt.all()
		}
		const normalized = rows.map(rowToGeminiTask)
		if (limit && Number(limit) > 0) return normalized.slice(0, Number(limit))
		return normalized
	}

	function existingRowToParams(row) {
		return {
			taskId: String(row.task_id || '').trim(),
			model: String(row.model || '').trim(),
			modelLabel: String(row.model_label || '').trim(),
			status: String(row.status || 'submitting').trim(),
			progress: Number(row.progress) || 0,
			prompt: String(row.prompt || '').trim(),
			negativePrompt: String(row.negative_prompt || '').trim(),
			aspectRatio: String(row.aspect_ratio || '1:1').trim(),
			numImages: Number(row.num_images) || 1,
			resultImages: row.result_images ?? null,
			thumbnailUrl: String(row.thumbnail_url || '').trim(),
			errorMessage: String(row.error_message || '').trim(),
			errorCode: String(row.error_code || '').trim(),
			statusText: String(row.status_text || '').trim(),
			requestPayload: row.request_payload ?? null,
			responsePayload: row.response_payload ?? null,
			projectId: row.project_id ? Number(row.project_id) : null,
			nodeId: String(row.node_id || '').trim(),
			startedAt: row.started_at || null,
			completedAt: row.completed_at || null
		}
	}

	function upsert(input) {
		const raw = input || {}
		const params = normalize(raw)
		if (!params.taskId) return { ok: false, error: 'taskId is required' }
		const existing = getByTaskIdStmt.get(params.taskId)
		if (existing) {
			const existingParams = existingRowToParams(existing)
			const hasKey = (camel, snake) => (camel in raw) || (snake in raw)
			const merged = {
				taskId: params.taskId,
				model: hasKey('model', 'model') ? params.model : existingParams.model,
				modelLabel: hasKey('modelLabel', 'model_label') ? params.modelLabel : existingParams.modelLabel,
				status: hasKey('status', 'status') ? params.status : existingParams.status,
				progress: hasKey('progress', 'progress') ? params.progress : existingParams.progress,
				prompt: hasKey('prompt', 'prompt') ? params.prompt : existingParams.prompt,
				negativePrompt: hasKey('negativePrompt', 'negative_prompt') ? params.negativePrompt : existingParams.negativePrompt,
				aspectRatio: hasKey('aspectRatio', 'aspect_ratio') ? params.aspectRatio : existingParams.aspectRatio,
				numImages: hasKey('numImages', 'num_images') ? params.numImages : existingParams.numImages,
				resultImages: hasKey('resultImages', 'result_images') ? params.resultImages : existingParams.resultImages,
				thumbnailUrl: hasKey('thumbnailUrl', 'thumbnail_url') ? params.thumbnailUrl : existingParams.thumbnailUrl,
				errorMessage: hasKey('errorMessage', 'error_message') ? params.errorMessage : existingParams.errorMessage,
				errorCode: hasKey('errorCode', 'error_code') ? params.errorCode : existingParams.errorCode,
				statusText: hasKey('statusText', 'status_text') ? params.statusText : existingParams.statusText,
				requestPayload: hasKey('requestPayload', 'request_payload') ? params.requestPayload : existingParams.requestPayload,
				responsePayload: hasKey('responsePayload', 'response_payload') ? params.responsePayload : existingParams.responsePayload,
				projectId: hasKey('projectId', 'project_id') ? params.projectId : existingParams.projectId,
				nodeId: hasKey('nodeId', 'node_id') ? params.nodeId : existingParams.nodeId,
				startedAt: hasKey('startedAt', 'started_at') ? params.startedAt : existingParams.startedAt,
				completedAt: hasKey('completedAt', 'completed_at') ? params.completedAt : existingParams.completedAt
			}
			updateStmt.run(merged)
		} else {
			insertStmt.run(params)
		}
		return { ok: true, task: getByTaskId(params.taskId) }
	}

	function remove(taskId) {
		const key = String(taskId || '').trim()
		if (!key) return { ok: false, error: 'taskId is required' }
		deleteByTaskIdStmt.run(key)
		return { ok: true, taskId: key }
	}

	function clearCompleted(projectId) {
		if (projectId !== undefined && projectId !== null && projectId !== '') {
			deleteCompletedByProjectStmt.run(Number(projectId), 'completed', 'failed')
		}
		return { ok: true }
	}

	return { list, getByTaskId, upsert, remove, clearCompleted }
}
