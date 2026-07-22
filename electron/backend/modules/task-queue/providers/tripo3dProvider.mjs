import { BaseTaskProvider } from './baseProvider.mjs'
import { getHttpClient } from '../../../core/http-client.mjs'

const TRIPO3D_API_BASE = 'https://api.tripo3d.ai/v2/openapi'

const ENDPOINT_MAP = {
	text_to_model: '/generation/text-to-model',
	image_to_model: '/generation/image-to-model',
	multiview_to_model: '/generation/multiview-to-model',
	texture: '/models/texture',
	refine: '/models/refine',
	mesh_segment: '/mesh/segment',
	mesh_smartsegment: '/mesh/smartsegment',
	mesh_complete: '/mesh/complete',
	mesh_decimate: '/mesh/decimate',
	models_convert: '/models/convert',
	text_to_image: '/generation/text-to-image',
	image_to_image: '/generation/image-to-image',
	image_to_multiview: '/generation/multiview-to-image',
}

function normalizeTripoStatus(rawStatus, progress) {
	const status = String(rawStatus || '').trim().toLowerCase()
	if (status === 'success' || status === 'succeeded' || status === 'completed') return 'completed'
	if (status === 'failed' || status === 'error') return 'failed'
	if (status === 'cancelled' || status === 'canceled') return 'cancelled'
	if (status === 'queued' || status === 'pending') return 'running'
	if (status === 'running' || status === 'processing' || status === 'in_progress') return 'running'
	return 'running'
}

function extractResultAssets(taskData) {
	const assets = []

	if (taskData.model && typeof taskData.model === 'object') {
		const modelUrls = taskData.model
		const formats = ['glb', 'fbx', 'obj', 'stl', 'usdz', 'gltf']
		for (const fmt of formats) {
			if (modelUrls[fmt] && typeof modelUrls[fmt] === 'string' && modelUrls[fmt].trim()) {
				assets.push({
					type: 'model',
					format: fmt,
					url: modelUrls[fmt].trim(),
					thumbnailUrl: taskData.rendered_image?.url || taskData.thumbnail || '',
				})
				break
			}
		}
		if (modelUrls.url && typeof modelUrls.url === 'string') {
			assets.push({
				type: 'model',
				url: modelUrls.url,
				thumbnailUrl: taskData.rendered_image?.url || taskData.thumbnail || '',
			})
		}
	}

	if (taskData.rendered_image?.url) {
		assets.push({ type: 'image', url: taskData.rendered_image.url, thumbnailUrl: taskData.rendered_image.url })
	}

	if (Array.isArray(taskData.images)) {
		for (const img of taskData.images) {
			if (img && (img.url || img.image_url)) {
				const url = img.url || img.image_url
				assets.push({ type: 'image', url, thumbnailUrl: url })
			}
		}
	}

	if (Array.isArray(taskData.image_urls)) {
		for (const url of taskData.image_urls) {
			if (url && typeof url === 'string') {
				assets.push({ type: 'image', url, thumbnailUrl: url })
			}
		}
	}

	if (taskData.thumbnail && typeof taskData.thumbnail === 'string') {
		assets.push({ type: 'image', url: taskData.thumbnail, thumbnailUrl: taskData.thumbnail })
	}

	return assets
}

export class Tripo3DProvider extends BaseTaskProvider {
	constructor(deps = {}) {
		super('tripo3d')
		this.getApiKey = deps.getApiKey
	}

	async submit(task, input) {
		try {
			const apiKey = this.getApiKey ? this.getApiKey() : ''
			if (!apiKey) return { ok: false, error: 'Tripo3D API key not configured' }

			const client = getHttpClient()
			const mode = String(input.mode || 'text_to_model').trim().toLowerCase()
			const endpoint = ENDPOINT_MAP[mode] || ENDPOINT_MAP.text_to_model
			const url = `${TRIPO3D_API_BASE}${endpoint}`

			const body = {
				prompt: input.prompt || '',
				negative_prompt: input.negativePrompt || input.negative_prompt || '',
				...(input.requestBody || {}),
			}
			if (body.model_version && !body.model) {
				body.model = body.model_version
				delete body.model_version
			}

			const res = await client.post(url, body, {
				headers: { Authorization: `Bearer ${apiKey}` },
				timeout: 60000,
			})

			if (!res.ok) {
				let errMsg = `HTTP ${res.status}`
				if (typeof res.body === 'object' && res.body) {
					errMsg = res.body.message || res.body.error || res.body.msg || errMsg
				}
				return { ok: false, error: errMsg }
			}

			let taskId = ''
			const responseData = res.body
			if (responseData && typeof responseData === 'object') {
				if (responseData.code === 0 && responseData.data && typeof responseData.data === 'object') {
					taskId = String(responseData.data.task_id || '').trim()
				} else {
					taskId = String(responseData.task_id || responseData.id || '').trim()
				}
			}

			if (!taskId) return { ok: false, error: 'No task_id in response' }

			return {
				ok: true,
				remoteTaskId: taskId,
				statusText: 'Tripo3D：任务已提交',
				data: { mode, requestBody: body },
			}
		} catch (err) {
			return { ok: false, error: err.message || String(err) }
		}
	}

	async poll(task) {
		try {
			if (!task.remoteTaskId) return { ok: false, error: 'No remote task ID' }

			const apiKey = this.getApiKey ? this.getApiKey() : ''
			if (!apiKey) return { ok: false, error: 'Tripo3D API key not configured' }

			const client = getHttpClient()
			const url = `${TRIPO3D_API_BASE}/tasks/${encodeURIComponent(task.remoteTaskId)}`

			const res = await client.get(url, {
				headers: { Authorization: `Bearer ${apiKey}` },
				timeout: 30000,
			})

			if (!res.ok) {
				if (res.status === 404) return { ok: true, status: 'failed', errorMessage: 'Task not found' }
				let errMsg = `HTTP ${res.status}`
				if (typeof res.body === 'object' && res.body) {
					errMsg = res.body.message || res.body.error || errMsg
				}
				return { ok: false, error: errMsg }
			}

			let taskData = res.body
			if (taskData && typeof taskData === 'object' && taskData.code === 0 && taskData.data) {
				taskData = taskData.data
			}

			const rawStatus = String(taskData.status || '').trim().toLowerCase()
			let progress = 0
			try {
				progress = Math.max(0, Math.min(100, parseInt(String(taskData.progress || '0'), 10)))
			} catch {
				progress = 0
			}
			if (rawStatus === 'success' || rawStatus === 'succeeded' || rawStatus === 'completed') progress = 100

			const status = normalizeTripoStatus(rawStatus, progress)
			const errorMessage = String(taskData.error?.message || taskData.error_message || taskData.message || '').trim()

			let statusText = ''
			if (status === 'completed') statusText = 'Tripo3D：生成完成'
			else if (status === 'failed') statusText = errorMessage || 'Tripo3D：生成失败'
			else if (status === 'cancelled') statusText = 'Tripo3D：任务已取消'
			else if (rawStatus === 'queued' || rawStatus === 'pending') statusText = 'Tripo3D：任务排队中'
			else statusText = `Tripo3D：生成中 ${progress}%`

			const resultAssets = extractResultAssets(taskData)

			return {
				ok: true,
				status,
				progress: status === 'completed' ? 100 : progress,
				statusText,
				errorMessage: status === 'failed' ? errorMessage : '',
				resultAssets: resultAssets.length > 0 ? resultAssets : undefined,
			}
		} catch (err) {
			return { ok: false, error: err.message || String(err) }
		}
	}

	async cancel(task) {
		try {
			const apiKey = this.getApiKey ? this.getApiKey() : ''
			if (!apiKey || !task.remoteTaskId) return { ok: true }

			const client = getHttpClient()
			const url = `${TRIPO3D_API_BASE}/tasks/${encodeURIComponent(task.remoteTaskId)}/cancel`
			await client.post(url, {}, {
				headers: { Authorization: `Bearer ${apiKey}` },
				timeout: 15000,
			})
			return { ok: true }
		} catch {
			return { ok: true }
		}
	}
}
