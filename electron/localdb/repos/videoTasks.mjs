import { getLocalDb } from '../db.mjs'
import { isoToMs, parseOptionalJson, stringifyOptionalJson } from '../json.mjs'

function rowToVideoTask(row) {
	if (!row) return null
	return {
		id: row.id,
		remoteTaskId: row.remote_task_id,
		provider: row.provider,
		model: row.model,
		taskType: row.task_type,
		source: row.source,
		status: row.status,
		prompt: row.prompt,
		ratio: row.ratio,
		resolution: row.resolution,
		duration: Number(row.duration) || 0,
		seed: row.seed === null || row.seed === undefined ? null : Number(row.seed),
		generateAudio: Boolean(row.generate_audio),
		watermark: Boolean(row.watermark),
		cameraFixed: Boolean(row.camera_fixed),
		serviceTier: row.service_tier,
		tools: parseOptionalJson(row.tools),
		usage: parseOptionalJson(row.usage),
		requestPayload: parseOptionalJson(row.request_payload),
		responsePayload: parseOptionalJson(row.response_payload),
		videoUrlRemote: row.video_url_remote,
		videoUrlLocal: row.video_url_local,
		videoSourcePathLocal: row.video_source_path_local,
		lastFrameUrlRemote: row.last_frame_url_remote,
		lastFrameUrlLocal: row.last_frame_url_local,
		lastFrameSourcePathLocal: row.last_frame_source_path_local,
		downloadStatus: row.download_status,
		downloadProgress: Number(row.download_progress) || 0,
		downloadError: row.download_error,
		errorMessage: row.error_message,
		statusText: row.status_text,
		projectId: row.project_id ? Number(row.project_id) : null,
		remoteCreatedAt:
			row.remote_created_at === null || row.remote_created_at === undefined
				? null
				: Number(row.remote_created_at),
		remoteUpdatedAt:
			row.remote_updated_at === null || row.remote_updated_at === undefined
				? null
				: Number(row.remote_updated_at),
		syncedAt: isoToMs(row.synced_at),
		createdAt: isoToMs(row.created_at),
		updatedAt: isoToMs(row.updated_at),
		refImageUrls: parseOptionalJson(row.ref_image_urls),
		refVideoUrls: parseOptionalJson(row.ref_video_urls),
		refAudioUrls: parseOptionalJson(row.ref_audio_urls),
	}
}

export function createVideoTasksRepo() {
	const db = getLocalDb()

	const listStmt = db.prepare('SELECT * FROM video_tasks ORDER BY updated_at DESC, id DESC')
	const listByProjectStmt = db.prepare(
		'SELECT * FROM video_tasks WHERE project_id = ? ORDER BY updated_at DESC, id DESC'
	)
	const getByRemoteTaskIdStmt = db.prepare(
		'SELECT * FROM video_tasks WHERE remote_task_id = ? LIMIT 1'
	)
	const insertStmt = db.prepare(
		`INSERT INTO video_tasks (
      remote_task_id, provider, model, task_type, source, status, prompt, ratio, resolution,
      duration, seed, generate_audio, watermark, camera_fixed, service_tier,
      tools, usage, request_payload, response_payload,
      video_url_remote, video_url_local, video_source_path_local,
      last_frame_url_remote, last_frame_url_local, last_frame_source_path_local,
      download_status, download_progress, download_error, error_message, status_text,
      project_id, remote_created_at, remote_updated_at,
      ref_image_urls, ref_video_urls, ref_audio_urls
    ) VALUES (
      @remoteTaskId, @provider, @model, @taskType, @source, @status, @prompt, @ratio, @resolution,
      @duration, @seed, @generateAudio, @watermark, @cameraFixed, @serviceTier,
      @tools, @usage, @requestPayload, @responsePayload,
      @videoUrlRemote, @videoUrlLocal, @videoSourcePathLocal,
      @lastFrameUrlRemote, @lastFrameUrlLocal, @lastFrameSourcePathLocal,
      @downloadStatus, @downloadProgress, @downloadError, @errorMessage, @statusText,
      @projectId, @remoteCreatedAt, @remoteUpdatedAt,
      @refImageUrls, @refVideoUrls, @refAudioUrls
    )`
	)
	const updateStmt = db.prepare(
		`UPDATE video_tasks SET
      provider = @provider, model = @model, task_type = @taskType, source = @source,
      status = @status, prompt = @prompt, ratio = @ratio, resolution = @resolution,
      duration = @duration, seed = @seed, generate_audio = @generateAudio, watermark = @watermark,
      camera_fixed = @cameraFixed, service_tier = @serviceTier, tools = @tools, usage = @usage,
      request_payload = @requestPayload, response_payload = @responsePayload,
      video_url_remote = @videoUrlRemote, video_url_local = @videoUrlLocal,
      video_source_path_local = @videoSourcePathLocal,
      last_frame_url_remote = @lastFrameUrlRemote, last_frame_url_local = @lastFrameUrlLocal,
      last_frame_source_path_local = @lastFrameSourcePathLocal,
      download_status = @downloadStatus, download_progress = @downloadProgress,
      download_error = @downloadError, error_message = @errorMessage, status_text = @statusText,
      project_id = @projectId, remote_created_at = @remoteCreatedAt, remote_updated_at = @remoteUpdatedAt,
      ref_image_urls = @refImageUrls, ref_video_urls = @refVideoUrls, ref_audio_urls = @refAudioUrls,
      synced_at = datetime('now'), updated_at = datetime('now')
    WHERE remote_task_id = @remoteTaskId`
	)
	const deleteStmt = db.prepare('DELETE FROM video_tasks WHERE remote_task_id = ?')

	function normalize(input) {
		const raw = input || {}
		const toBool = (v) =>
			v === true || v === 1 || (typeof v === 'string' && v.toLowerCase() === 'true')
		const toNullableInt = (v) => (v === null || v === undefined || v === '' ? null : Number(v))
		const toJsonArray = (v) => {
			if (v === null || v === undefined) return '[]'
			if (Array.isArray(v)) return JSON.stringify(v)
			if (typeof v === 'string') return v
			return JSON.stringify(v)
		}
		return {
			remoteTaskId: String(raw.remoteTaskId || raw.remote_task_id || '').trim(),
			provider: String(raw.provider || 'seedance').trim(),
			model: String(raw.model || '').trim(),
			taskType: String(raw.taskType || raw.task_type || '').trim(),
			source: String(raw.source || 'bottom-chat').trim(),
			status: String(raw.status || 'queued').trim(),
			prompt: String(raw.prompt || '').trim(),
			ratio: String(raw.ratio || '').trim(),
			resolution: String(raw.resolution || '').trim(),
			duration: Number(raw.duration) || 0,
			seed: toNullableInt(raw.seed),
			generateAudio: toBool(raw.generateAudio || raw.generate_audio) ? 1 : 0,
			watermark: toBool(raw.watermark) ? 1 : 0,
			cameraFixed: toBool(raw.cameraFixed || raw.camera_fixed) ? 1 : 0,
			serviceTier: String(raw.serviceTier || raw.service_tier || '').trim(),
			tools: stringifyOptionalJson(raw.tools) || 'null',
			usage: stringifyOptionalJson(raw.usage) || 'null',
			requestPayload: stringifyOptionalJson(raw.requestPayload || raw.request_payload) || '{}',
			responsePayload: stringifyOptionalJson(raw.responsePayload || raw.response_payload) || '{}',
			videoUrlRemote: String(raw.videoUrlRemote || raw.video_url_remote || '').trim(),
			videoUrlLocal: String(raw.videoUrlLocal || raw.video_url_local || '').trim(),
			videoSourcePathLocal: String(
				raw.videoSourcePathLocal || raw.video_source_path_local || ''
			).trim(),
			lastFrameUrlRemote: String(raw.lastFrameUrlRemote || raw.last_frame_url_remote || '').trim(),
			lastFrameUrlLocal: String(raw.lastFrameUrlLocal || raw.last_frame_url_local || '').trim(),
			lastFrameSourcePathLocal: String(
				raw.lastFrameSourcePathLocal || raw.last_frame_source_path_local || ''
			).trim(),
			downloadStatus: String(raw.downloadStatus || raw.download_status || 'idle').trim(),
			downloadProgress: Number(raw.downloadProgress || raw.download_progress) || 0,
			downloadError: String(raw.downloadError || raw.download_error || '').trim(),
			errorMessage: String(raw.errorMessage || raw.error_message || '').trim(),
			statusText: String(raw.statusText || raw.status_text || '').trim(),
			projectId:
				raw.projectId === undefined || raw.projectId === null || raw.projectId === ''
					? null
					: Number(raw.projectId) || null,
			remoteCreatedAt: toNullableInt(raw.remoteCreatedAt || raw.remote_created_at),
			remoteUpdatedAt: toNullableInt(raw.remoteUpdatedAt || raw.remote_updated_at),
			refImageUrls: toJsonArray(raw.refImageUrls || raw.ref_image_urls),
			refVideoUrls: toJsonArray(raw.refVideoUrls || raw.ref_video_urls),
			refAudioUrls: toJsonArray(raw.refAudioUrls || raw.ref_audio_urls),
		}
	}

	function getByRemoteTaskId(remoteTaskId) {
		const key = String(remoteTaskId || '').trim()
		if (!key) return null
		return rowToVideoTask(getByRemoteTaskIdStmt.get(key))
	}

	function list({ projectId, limit } = {}) {
		let rows
		if (projectId !== undefined && projectId !== null && projectId !== '') {
			rows = listByProjectStmt.all(Number(projectId))
		} else {
			rows = listStmt.all()
		}
		const normalized = rows.map(rowToVideoTask)
		if (limit && Number(limit) > 0) return normalized.slice(0, Number(limit))
		return normalized
	}

	function upsert(input) {
		const raw = input || {}
		const remoteTaskId = String(raw.remoteTaskId || raw.remote_task_id || '').trim()
		if (!remoteTaskId) return { ok: false, error: 'remoteTaskId is required' }
		const existing = getByRemoteTaskIdStmt.get(remoteTaskId)
		let params
		if (existing) {
			const merged = {
				remoteTaskId,
				provider: raw.provider !== undefined ? raw.provider : existing.provider,
				model: raw.model !== undefined ? raw.model : existing.model,
				taskType: raw.taskType !== undefined ? raw.taskType : existing.task_type,
				source: raw.source !== undefined ? raw.source : existing.source,
				status: raw.status !== undefined ? raw.status : existing.status,
				prompt: raw.prompt !== undefined ? raw.prompt : existing.prompt,
				ratio: raw.ratio !== undefined ? raw.ratio : existing.ratio,
				resolution: raw.resolution !== undefined ? raw.resolution : existing.resolution,
				duration: raw.duration !== undefined ? raw.duration : existing.duration,
				seed: raw.seed !== undefined ? raw.seed : existing.seed,
				generateAudio: raw.generateAudio !== undefined ? raw.generateAudio : Boolean(existing.generate_audio),
				watermark: raw.watermark !== undefined ? raw.watermark : Boolean(existing.watermark),
				cameraFixed: raw.cameraFixed !== undefined ? raw.cameraFixed : Boolean(existing.camera_fixed),
				serviceTier: raw.serviceTier !== undefined ? raw.serviceTier : existing.service_tier,
				tools: raw.tools !== undefined ? raw.tools : parseOptionalJson(existing.tools),
				usage: raw.usage !== undefined ? raw.usage : parseOptionalJson(existing.usage),
				requestPayload: raw.requestPayload !== undefined ? raw.requestPayload : (raw.request_payload !== undefined ? raw.request_payload : parseOptionalJson(existing.request_payload)),
				responsePayload: raw.responsePayload !== undefined ? raw.responsePayload : (raw.response_payload !== undefined ? raw.response_payload : parseOptionalJson(existing.response_payload)),
				videoUrlRemote: raw.videoUrlRemote !== undefined ? raw.videoUrlRemote : existing.video_url_remote,
				videoUrlLocal: raw.videoUrlLocal !== undefined ? raw.videoUrlLocal : existing.video_url_local,
				videoSourcePathLocal: raw.videoSourcePathLocal !== undefined ? raw.videoSourcePathLocal : existing.video_source_path_local,
				lastFrameUrlRemote: raw.lastFrameUrlRemote !== undefined ? raw.lastFrameUrlRemote : existing.last_frame_url_remote,
				lastFrameUrlLocal: raw.lastFrameUrlLocal !== undefined ? raw.lastFrameUrlLocal : existing.last_frame_url_local,
				lastFrameSourcePathLocal: raw.lastFrameSourcePathLocal !== undefined ? raw.lastFrameSourcePathLocal : existing.last_frame_source_path_local,
				downloadStatus: raw.downloadStatus !== undefined ? raw.downloadStatus : existing.download_status,
				downloadProgress: raw.downloadProgress !== undefined ? raw.downloadProgress : existing.download_progress,
				downloadError: raw.downloadError !== undefined ? raw.downloadError : existing.download_error,
				errorMessage: raw.errorMessage !== undefined ? raw.errorMessage : existing.error_message,
				statusText: raw.statusText !== undefined ? raw.statusText : existing.status_text,
				projectId: raw.projectId !== undefined ? raw.projectId : (existing.project_id ? Number(existing.project_id) : null),
				remoteCreatedAt: raw.remoteCreatedAt !== undefined ? raw.remoteCreatedAt : (existing.remote_created_at ? Number(existing.remote_created_at) : null),
				remoteUpdatedAt: raw.remoteUpdatedAt !== undefined ? raw.remoteUpdatedAt : (existing.remote_updated_at ? Number(existing.remote_updated_at) : null),
				refImageUrls: raw.refImageUrls !== undefined ? raw.refImageUrls : (raw.ref_image_urls !== undefined ? raw.ref_image_urls : parseOptionalJson(existing.ref_image_urls)),
				refVideoUrls: raw.refVideoUrls !== undefined ? raw.refVideoUrls : (raw.ref_video_urls !== undefined ? raw.ref_video_urls : parseOptionalJson(existing.ref_video_urls)),
				refAudioUrls: raw.refAudioUrls !== undefined ? raw.refAudioUrls : (raw.ref_audio_urls !== undefined ? raw.ref_audio_urls : parseOptionalJson(existing.ref_audio_urls)),
			}
			params = normalize(merged)
			updateStmt.run(params)
		} else {
			params = normalize(raw)
			insertStmt.run(params)
		}
		return { ok: true, task: getByRemoteTaskId(remoteTaskId) }
	}

	function remove(remoteTaskId) {
		const key = String(remoteTaskId || '').trim()
		if (!key) return { ok: false, error: 'remoteTaskId is required' }
		deleteStmt.run(key)
		return { ok: true, remoteTaskId: key }
	}

	return { list, getByRemoteTaskId, upsert, remove }
}
