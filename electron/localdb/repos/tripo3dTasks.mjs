import { getLocalDb } from '../db.mjs'
import { isoToMs, parseOptionalJson, stringifyOptionalJson } from '../json.mjs'

function rowToTripo3dTask(row) {
	if (!row) return null
	return {
		id: row.id,
		taskId: row.task_id,
		mode: row.mode,
		status: row.status,
		progress: Number(row.progress) || 0,
		prompt: row.prompt,
		negativePrompt: row.negative_prompt,
		modelVersion: row.model_version,
		faceLimit: Number(row.face_limit) || 0,
		texture: Boolean(row.texture),
		pbr: Boolean(row.pbr),
		thumbnailUrl: row.thumbnail_url,
		modelUrl: row.model_url,
		localAssetUrl: row.local_asset_url,
		localAssetPath: row.local_asset_path,
		errorMessage: row.error_message,
		statusText: row.status_text,
		requestPayload: parseOptionalJson(row.request_payload),
		responsePayload: parseOptionalJson(row.response_payload),
		projectId: row.project_id ? Number(row.project_id) : null,
		nodeId: row.node_id,
		createdAt: isoToMs(row.created_at),
		updatedAt: isoToMs(row.updated_at),
		startedAt: isoToMs(row.started_at),
		completedAt: isoToMs(row.completed_at)
	}
}

export function createTripo3dTasksRepo() {
	const db = getLocalDb()

	const listStmt = db.prepare('SELECT * FROM tripo3d_tasks ORDER BY updated_at DESC, id DESC')
	const listByProjectStmt = db.prepare(
		'SELECT * FROM tripo3d_tasks WHERE project_id = ? ORDER BY updated_at DESC, id DESC'
	)
	const getByTaskIdStmt = db.prepare('SELECT * FROM tripo3d_tasks WHERE task_id = ? LIMIT 1')
	const insertStmt = db.prepare(
		`INSERT INTO tripo3d_tasks (
      task_id, mode, status, progress, prompt, negative_prompt, model_version, face_limit,
      texture, pbr, thumbnail_url, model_url, local_asset_url, local_asset_path,
      error_message, status_text, request_payload, response_payload, project_id, node_id,
      started_at, completed_at
    ) VALUES (
      @taskId, @mode, @status, @progress, @prompt, @negativePrompt, @modelVersion, @faceLimit,
      @texture, @pbr, @thumbnailUrl, @modelUrl, @localAssetUrl, @localAssetPath,
      @errorMessage, @statusText, @requestPayload, @responsePayload, @projectId, @nodeId,
      @startedAt, @completedAt
    )`
	)
	const updateStmt = db.prepare(
		`UPDATE tripo3d_tasks SET
      mode = @mode, status = @status, progress = @progress, prompt = @prompt,
      negative_prompt = @negativePrompt, model_version = @modelVersion, face_limit = @faceLimit,
      texture = @texture, pbr = @pbr, thumbnail_url = @thumbnailUrl, model_url = @modelUrl,
      local_asset_url = @localAssetUrl, local_asset_path = @localAssetPath,
      error_message = @errorMessage, status_text = @statusText,
      request_payload = @requestPayload, response_payload = @responsePayload,
      project_id = @projectId, node_id = @nodeId,
      started_at = @startedAt, completed_at = @completedAt,
      updated_at = datetime('now')
    WHERE task_id = @taskId`
	)
	const deleteByTaskIdStmt = db.prepare('DELETE FROM tripo3d_tasks WHERE task_id = ?')

	function normalize(input) {
		const raw = input || {}
		return {
			taskId: String(raw.taskId || raw.task_id || '').trim(),
			mode: String(raw.mode || '').trim(),
			status: String(raw.status || 'queued').trim(),
			progress: Number(raw.progress) || 0,
			prompt: String(raw.prompt || '').trim(),
			negativePrompt: String(raw.negativePrompt || raw.negative_prompt || '').trim(),
			modelVersion: String(raw.modelVersion || raw.model_version || '').trim(),
			faceLimit: Number(raw.faceLimit || raw.face_limit) || 0,
			texture: raw.texture === undefined || raw.texture === null ? 1 : raw.texture ? 1 : 0,
			pbr: raw.pbr === undefined || raw.pbr === null ? 1 : raw.pbr ? 1 : 0,
			thumbnailUrl: String(raw.thumbnailUrl || raw.thumbnail_url || '').trim(),
			modelUrl: String(raw.modelUrl || raw.model_url || '').trim(),
			localAssetUrl: String(raw.localAssetUrl || raw.local_asset_url || '').trim(),
			localAssetPath: String(raw.localAssetPath || raw.local_asset_path || '').trim(),
			errorMessage: String(raw.errorMessage || raw.error_message || '').trim(),
			statusText: String(raw.statusText || raw.status_text || '').trim(),
			requestPayload: stringifyOptionalJson(raw.requestPayload || raw.request_payload),
			responsePayload: stringifyOptionalJson(raw.responsePayload || raw.response_payload),
			projectId:
				raw.projectId === undefined || raw.projectId === null || raw.projectId === ''
					? null
					: Number(raw.projectId) || null,
			nodeId: String(raw.nodeId || raw.node_id || '').trim(),
			startedAt: String(raw.startedAt || raw.started_at || '').trim() || null,
			completedAt: String(raw.completedAt || raw.completed_at || '').trim() || null
		}
	}

	function getByTaskId(taskId) {
		const key = String(taskId || '').trim()
		if (!key) return null
		return rowToTripo3dTask(getByTaskIdStmt.get(key))
	}

	function list({ projectId, limit } = {}) {
		let rows
		if (projectId !== undefined && projectId !== null && projectId !== '') {
			rows = listByProjectStmt.all(Number(projectId))
		} else {
			rows = listStmt.all()
		}
		const normalized = rows.map(rowToTripo3dTask)
		if (limit && Number(limit) > 0) return normalized.slice(0, Number(limit))
		return normalized
	}

	function existingRowToParams(row) {
		return {
			taskId: String(row.task_id || '').trim(),
			mode: String(row.mode || '').trim(),
			status: String(row.status || 'queued').trim(),
			progress: Number(row.progress) || 0,
			prompt: String(row.prompt || '').trim(),
			negativePrompt: String(row.negative_prompt || '').trim(),
			modelVersion: String(row.model_version || '').trim(),
			faceLimit: Number(row.face_limit) || 0,
			texture: row.texture ? 1 : 0,
			pbr: row.pbr ? 1 : 0,
			thumbnailUrl: String(row.thumbnail_url || '').trim(),
			modelUrl: String(row.model_url || '').trim(),
			localAssetUrl: String(row.local_asset_url || '').trim(),
			localAssetPath: String(row.local_asset_path || '').trim(),
			errorMessage: String(row.error_message || '').trim(),
			statusText: String(row.status_text || '').trim(),
			requestPayload: row.request_payload ?? null,
			responsePayload: row.response_payload ?? null,
			projectId: row.project_id ? Number(row.project_id) : null,
			nodeId: String(row.node_id || '').trim(),
			startedAt: row.started_at,
			completedAt: row.completed_at
		}
	}

	function upsert(input) {
		const raw = input || {}
		const params = normalize(raw)
		if (!params.taskId) return { ok: false, error: 'taskId is required' }
		const existing = getByTaskIdStmt.get(params.taskId)
		if (existing) {
			const existingParams = existingRowToParams(existing)
			const hasKey = (camel, snake) => camel in raw || snake in raw
			const merged = {
				taskId: params.taskId,
				mode: hasKey('mode', 'mode') ? params.mode : existingParams.mode,
				status: hasKey('status', 'status') ? params.status : existingParams.status,
				progress: hasKey('progress', 'progress') ? params.progress : existingParams.progress,
				prompt: hasKey('prompt', 'prompt') ? params.prompt : existingParams.prompt,
				negativePrompt: hasKey('negativePrompt', 'negative_prompt')
					? params.negativePrompt
					: existingParams.negativePrompt,
				modelVersion: hasKey('modelVersion', 'model_version')
					? params.modelVersion
					: existingParams.modelVersion,
				faceLimit: hasKey('faceLimit', 'face_limit') ? params.faceLimit : existingParams.faceLimit,
				texture: hasKey('texture', 'texture') ? params.texture : existingParams.texture,
				pbr: hasKey('pbr', 'pbr') ? params.pbr : existingParams.pbr,
				thumbnailUrl: hasKey('thumbnailUrl', 'thumbnail_url')
					? params.thumbnailUrl
					: existingParams.thumbnailUrl,
				modelUrl: hasKey('modelUrl', 'model_url') ? params.modelUrl : existingParams.modelUrl,
				localAssetUrl: hasKey('localAssetUrl', 'local_asset_url')
					? params.localAssetUrl
					: existingParams.localAssetUrl,
				localAssetPath: hasKey('localAssetPath', 'local_asset_path')
					? params.localAssetPath
					: existingParams.localAssetPath,
				errorMessage: hasKey('errorMessage', 'error_message')
					? params.errorMessage
					: existingParams.errorMessage,
				statusText: hasKey('statusText', 'status_text')
					? params.statusText
					: existingParams.statusText,
				requestPayload: hasKey('requestPayload', 'request_payload')
					? params.requestPayload
					: existingParams.requestPayload,
				responsePayload: hasKey('responsePayload', 'response_payload')
					? params.responsePayload
					: existingParams.responsePayload,
				projectId: hasKey('projectId', 'project_id') ? params.projectId : existingParams.projectId,
				nodeId: hasKey('nodeId', 'node_id') ? params.nodeId : existingParams.nodeId,
				startedAt: hasKey('startedAt', 'started_at') ? params.startedAt : existingParams.startedAt,
				completedAt: hasKey('completedAt', 'completed_at')
					? params.completedAt
					: existingParams.completedAt
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

	return { list, getByTaskId, upsert, remove }
}
