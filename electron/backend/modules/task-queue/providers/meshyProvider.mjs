import { BaseTaskProvider } from './baseProvider.mjs'
import { getHttpClient } from '../../../core/http-client.mjs'

const MESHY_API_BASE = 'https://api.meshy.ai'

const MODE_PATH_MAP = {
	'text-to-3d': '/openapi/v2/text-to-3d',
	'image-to-3d': '/openapi/v1/image-to-3d',
	'multi-image-to-3d': '/openapi/v1/multi-image-to-3d',
	'text-to-image': '/openapi/v1/text-to-image',
	'image-to-image': '/openapi/v1/image-to-image',
	'retexture': '/openapi/v1/retexture',
	'remesh': '/openapi/v1/remesh',
	'uv-unwrap': '/openapi/v1/uv-unwrap',
}

function getModePath(mode) {
	const m = String(mode || '').trim().toLowerCase()
	if (m === 'refine') return MODE_PATH_MAP['text-to-3d']
	return MODE_PATH_MAP[m] || null
}

function extractTaskId(obj) {
	if (!obj || typeof obj !== 'object') return ''
	if (typeof obj.result === 'string' && obj.result.trim()) return obj.result.trim()
	if (typeof obj.id === 'string' && obj.id.trim()) return obj.id.trim()
	if (typeof obj.task_id === 'string' && obj.task_id.trim()) return obj.task_id.trim()
	return ''
}

function pickFirstUrl(obj) {
	if (typeof obj === 'string') return obj.trim()
	if (obj && typeof obj === 'object') {
		const keys = ['glb', 'pre_remeshed_glb', 'fbx', 'obj', 'stl', 'usdz', 'rigged_character_glb_url', 'rigged_character_fbx_url', 'animation_glb_url', 'animation_fbx_url', 'processed_usdz_url', 'processed_armature_fbx_url']
		for (const key of keys) {
			const value = obj[key]
			if (typeof value === 'string' && value.trim()) return value.trim()
		}
	}
	return ''
}

function pickFirstImageUrl(obj) {
	if (typeof obj === 'string') return obj.trim()
	if (Array.isArray(obj)) {
		for (const item of obj) {
			const value = String(item || '').trim()
			if (value) return value
		}
	}
	if (obj && typeof obj === 'object') {
		const imageUrls = obj.image_urls
		if (Array.isArray(imageUrls)) {
			for (const item of imageUrls) {
				const value = String(item || '').trim()
				if (value) return value
			}
		}
		for (const key of ['image_url', 'thumbnail_url']) {
			const value = String(obj[key] || '').trim()
			if (value) return value
		}
	}
	return ''
}

function normalizeMeshyStatus(rawStatus, progress) {
	const status = String(rawStatus || '').trim().toLowerCase()
	if (['succeeded', 'success', 'completed'].includes(status)) return 'completed'
	if (['failed', 'error'].includes(status)) return 'failed'
	if (['pending', 'queued'].includes(status)) return 'running'
	if (['running', 'processing', 'in_progress'].includes(status)) return 'running'
	if (status === 'cancelled' || status === 'canceled') return 'cancelled'
	return 'running'
}

export class MeshyProvider extends BaseTaskProvider {
	constructor(deps = {}) {
		super('meshy')
		this.getApiKey = deps.getApiKey
	}

	async submit(task, input) {
		try {
			const apiKey = this.getApiKey ? this.getApiKey() : ''
			if (!apiKey) return { ok: false, error: 'Meshy API key not configured' }

			const client = getHttpClient()
			const mode = String(input.mode || input.family || 'text-to-3d').trim().toLowerCase()
			const endpoint = getModePath(mode)
			if (!endpoint) return { ok: false, error: `Invalid mode: ${mode}` }

			const url = `${MESHY_API_BASE}${endpoint}`
			const body = {
				prompt: input.prompt || '',
				negative_prompt: input.negativePrompt || input.negative_prompt || '',
				...(input.requestBody || {}),
			}

			const res = await client.post(url, body, {
				headers: { Authorization: `Bearer ${apiKey}` },
				timeout: 45000,
			})

			if (!res.ok) {
				const errMsg = typeof res.body === 'object' && res.body?.message ? res.body.message : `HTTP ${res.status}`
				return { ok: false, error: errMsg }
			}

			const remoteTaskId = extractTaskId(res.body)
			if (!remoteTaskId) return { ok: false, error: 'No task_id in response' }

			return {
				ok: true,
				remoteTaskId,
				statusText: 'Meshy：任务已提交',
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
			if (!apiKey) return { ok: false, error: 'Meshy API key not configured' }

			const client = getHttpClient()
			const mode = task.extraData?.mode || 'text-to-3d'
			const endpoint = getModePath(mode)
			if (!endpoint) return { ok: false, error: `Invalid mode: ${mode}` }

			const url = `${MESHY_API_BASE}${endpoint}/${encodeURIComponent(task.remoteTaskId)}`
			const res = await client.get(url, {
				headers: { Authorization: `Bearer ${apiKey}` },
				timeout: 30000,
			})

			if (!res.ok) {
				if (res.status === 404) return { ok: true, status: 'failed', errorMessage: 'Task not found' }
				const errMsg = typeof res.body === 'object' && res.body?.message ? res.body.message : `HTTP ${res.status}`
				return { ok: false, error: errMsg }
			}

			const obj = res.body
			const rawStatus = String(obj.status || '').trim().toLowerCase()
			const progress = Math.max(0, Math.min(100, parseInt(String(obj.progress || '0'), 10)))
			const status = normalizeMeshyStatus(rawStatus, progress)

			const resultObj = obj.result && typeof obj.result === 'object' ? obj.result : {}
			const thumbnailUrl = String(obj.thumbnail_url || resultObj.thumbnail_url || '').trim()

			let modelUrls = obj.model_urls && typeof obj.model_urls === 'object' ? obj.model_urls : {}
			if (!Object.keys(modelUrls).length && resultObj.model_urls && typeof resultObj.model_urls === 'object') {
				modelUrls = resultObj.model_urls
			}
			modelUrls = Object.fromEntries(
				Object.entries(modelUrls).filter(([_, v]) => String(v || '').trim()).map(([k, v]) => [k, String(v).trim()])
			)
			const preferredModelUrl = pickFirstUrl(modelUrls)

			const collectImageUrls = (source) => {
				const urls = []
				if (!source || typeof source !== 'object') return urls
				if (Array.isArray(source.image_urls)) {
					for (const u of source.image_urls) {
						const s = String(u || '').trim()
						if (s) urls.push(s)
					}
				}
				for (const key of ['image_url', 'thumbnail_url', 'preferred_image_url', 'preferredImageUrl']) {
					const s = String(source[key] || '').trim()
					if (s) urls.push(s)
				}
				return urls
			}

			const allFoundUrls = []
			const urlSet = new Set()
			for (const source of [obj, resultObj]) {
				for (const u of collectImageUrls(source)) {
					if (!urlSet.has(u)) {
						urlSet.add(u)
						allFoundUrls.push(u)
					}
				}
			}

			const imageUrls = allFoundUrls.length > 0 ? allFoundUrls : (Array.isArray(obj.image_urls) ? obj.image_urls.map(x => String(x || '').trim()).filter(x => x) : [])
			const preferredImageUrl = imageUrls.length > 0 ? imageUrls[0] : thumbnailUrl

			const taskErrorRaw = obj.task_error && typeof obj.task_error === 'object' ? obj.task_error : {}
			const errorMessage = String(taskErrorRaw.message || obj.error || '').trim()

			let statusText = ''
			if (status === 'completed') statusText = 'Meshy：生成完成'
			else if (status === 'failed') statusText = errorMessage || 'Meshy：生成失败'
			else if (status === 'cancelled') statusText = 'Meshy：任务已取消'
			else if (['pending', 'queued'].includes(rawStatus)) statusText = 'Meshy：任务排队中'
			else statusText = `Meshy：生成中 ${progress}%`

			const resultAssets = []
			if (preferredModelUrl) {
				resultAssets.push({ type: 'model', url: preferredModelUrl, thumbnailUrl: preferredImageUrl || thumbnailUrl })
			} else if (preferredImageUrl) {
				resultAssets.push({ type: 'image', url: preferredImageUrl, thumbnailUrl: preferredImageUrl })
			}
			for (const imgUrl of imageUrls) {
				if (imgUrl !== preferredImageUrl) {
					resultAssets.push({ type: 'image', url: imgUrl, thumbnailUrl: imgUrl })
				}
			}

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
		return { ok: true }
	}
}
