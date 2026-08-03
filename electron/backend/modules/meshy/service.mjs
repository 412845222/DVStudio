import fs from 'node:fs'
import path from 'node:path'
import { getHttpClient } from '../../core/http-client.mjs'
import {
	internalError,
	invalidParamsError,
	notFoundError,
	upstreamError
} from '../../core/errors.mjs'

const MESHY_API_BASE = 'https://api.meshy.ai'

const MODEL_EXT_WHITELIST = Object.freeze([
	'glb',
	'gltf',
	'fbx',
	'obj',
	'stl',
	'dae',
	'3ds',
	'ply',
	'x3d',
	'x'
])
const IMAGE_EXT_BLACKLIST = Object.freeze([
	'png',
	'jpg',
	'jpeg',
	'gif',
	'webp',
	'bmp',
	'tiff',
	'tif',
	'svg',
	'ico',
	'heic',
	'heif'
])

// 同时提取 URL / dweb 协议 (?path= 参数) / Windows/Unix 本地路径的扩展名
const extractUrlOrPathExt = (input) => {
	if (!input) return ''
	const text = String(input).trim()
	if (!text) return ''
	const low = text.toLowerCase()
	// 1. dweb://project-assets?projectId=xx&path=assets/meshy/xxx.glb
	if (low.startsWith('dweb://') || low.startsWith('dweb:')) {
		try {
			const qStart = text.indexOf('?')
			const queryStr = qStart >= 0 ? text.slice(qStart + 1) : ''
			const params = new URLSearchParams(queryStr)
			const p = decodeURIComponent(
				params.get('path') || params.get('relativePath') || params.get('assetPath') || ''
			)
			if (p) {
				const clean = p.split('?')[0].split('#')[0]
				const d = clean.lastIndexOf('.')
				if (d >= 0) return clean.slice(d + 1).toLowerCase()
			}
		} catch {
			/* ignore */
		}
	}
	// 2. 通用提取
	try {
		const withoutQuery = text.split('?')[0].split('#')[0]
		const lastSlash = Math.max(withoutQuery.lastIndexOf('/'), withoutQuery.lastIndexOf('\\'))
		const namePart = lastSlash >= 0 ? withoutQuery.slice(lastSlash + 1) : withoutQuery
		const lastDot = namePart.lastIndexOf('.')
		if (lastDot < 0) return ''
		return namePart.slice(lastDot + 1).toLowerCase()
	} catch {
		return ''
	}
}
const isImageUrlOrPath = (input) => {
	const ext = extractUrlOrPathExt(input)
	return ext ? IMAGE_EXT_BLACKLIST.includes(ext) : false
}
const isLikely3DModelUrlOrPath = (input) => {
	const ext = extractUrlOrPathExt(input)
	if (!ext) {
		const low = String(input || '')
			.trim()
			.toLowerCase()
		return (
			low.startsWith('http://') ||
			low.startsWith('https://') ||
			low.startsWith('dweb://') ||
			low.startsWith('dweb:')
		)
	}
	if (IMAGE_EXT_BLACKLIST.includes(ext)) return false
	return MODEL_EXT_WHITELIST.includes(ext)
}

const MODE_PATH_MAP = {
	'text-to-3d': '/openapi/v2/text-to-3d',
	'image-to-3d': '/openapi/v1/image-to-3d',
	'multi-image-to-3d': '/openapi/v1/multi-image-to-3d',
	'text-to-image': '/openapi/v1/text-to-image',
	'image-to-image': '/openapi/v1/image-to-image',
	retexture: '/openapi/v1/retexture',
	remesh: '/openapi/v1/remesh',
	'uv-unwrap': '/openapi/v1/uv-unwrap'
}

function getModePath(mode) {
	const m = String(mode || '')
		.trim()
		.toLowerCase()
	if (m === 'refine') return MODE_PATH_MAP['text-to-3d']
	return MODE_PATH_MAP[m] || null
}

function getClientRootDir() {
	try {
		const electron = require('electron')
		const app = electron.app
		if (app?.getAppPath) {
			const appPath = app.getAppPath()
			if (process.resourcesPath && appPath.includes('app.asar')) {
				return path.dirname(process.execPath)
			}
			return appPath
		}
	} catch {}
	// Fallback: use CWD if DVSResource exists there (dev mode)
	const cwd = process.cwd()
	if (fs.existsSync(path.join(cwd, 'DVSResource', 'UserSettings'))) {
		return cwd
	}
	return process.cwd()
}

function getDvsResourceDir() {
	const envResourceDir = String(process.env.DWEB_RESOURCE_DIR || '').trim()
	if (envResourceDir) return path.resolve(envResourceDir)
	// Try CWD first (dev mode)
	const cwdResource = path.resolve(process.cwd(), 'DVSResource')
	if (fs.existsSync(path.join(cwdResource, 'UserSettings'))) {
		return cwdResource
	}
	return path.resolve(getClientRootDir(), 'DVSResource')
}

function getSettingsApiKey() {
	try {
		const settingsPath = path.resolve(getDvsResourceDir(), 'UserSettings', 'settings.json')
		if (fs.existsSync(settingsPath)) {
			const raw = fs.readFileSync(settingsPath, 'utf-8')
			const settings = JSON.parse(raw)
			const key = String(settings.meshyApiKey || '').trim()
			if (key) {
				console.log('[Meshy Backend] Loaded API key from settings.json')
				return key
			}
		}
	} catch (err) {
		console.warn('[Meshy Backend] Failed to read settings.json:', err.message)
	}
	return ''
}

function getApiKey(ctx) {
	// 1. 先尝试从localdb加密存储读取
	const repo = ctx.localdb?.apiKeys
	if (repo) {
		try {
			const result = repo.getPlaintext('meshy')
			if (result.ok) {
				const key = String(result.plaintext || '').trim()
				if (key) return key
			}
		} catch (err) {
			console.warn('[Meshy Backend] Failed to read from localdb:', err.message)
		}
	}

	// 2. fallback: 从settings.json明文字段读取
	const settingsKey = getSettingsApiKey()
	if (settingsKey) return settingsKey

	throw invalidParamsError('meshy api key is not configured')
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
		const keys = [
			'glb',
			'pre_remeshed_glb',
			'fbx',
			'obj',
			'stl',
			'usdz',
			'rigged_character_glb_url',
			'rigged_character_fbx_url',
			'animation_glb_url',
			'animation_fbx_url',
			'processed_usdz_url',
			'processed_armature_fbx_url'
		]
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

function normalizeTask(mode, taskId, obj) {
	if (!obj || typeof obj !== 'object') {
		return {
			ok: true,
			mode,
			taskId,
			status: 'unknown',
			progress: 0,
			thumbnailUrl: '',
			modelUrls: {},
			preferredModelUrl: '',
			statusText: 'invalid response'
		}
	}

	const rawStatus = String(obj.status || '')
		.trim()
		.toLowerCase()
	const status = rawStatus || 'unknown'
	let progress = 0
	try {
		progress = Math.max(0, Math.min(100, parseInt(String(obj.progress || '0'), 10)))
	} catch {
		progress = 0
	}

	const resultObj = obj.result && typeof obj.result === 'object' ? obj.result : {}
	const thumbnailUrl = String(obj.thumbnail_url || resultObj.thumbnail_url || '').trim()
	let modelUrls = obj.model_urls && typeof obj.model_urls === 'object' ? obj.model_urls : {}
	if (
		!Object.keys(modelUrls).length &&
		resultObj.model_urls &&
		typeof resultObj.model_urls === 'object'
	) {
		modelUrls = resultObj.model_urls
	}
	modelUrls = Object.fromEntries(
		Object.entries(modelUrls)
			.filter(([_, v]) => String(v || '').trim())
			.map(([k, v]) => [k, String(v).trim()])
	)
	const preferredModelUrl = pickFirstUrl(modelUrls)

	let imageUrlsRaw = obj.image_urls
	if (!Array.isArray(imageUrlsRaw)) imageUrlsRaw = resultObj.image_urls

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

	const imageUrls =
		allFoundUrls.length > 0
			? allFoundUrls
			: Array.isArray(imageUrlsRaw)
				? imageUrlsRaw.map((x) => String(x || '').trim()).filter((x) => x)
				: []
	const preferredImageUrl = imageUrls.length > 0 ? imageUrls[0] : ''
	const hasModelUrls = !!preferredModelUrl
	const resolvedPreferredModelUrl = preferredModelUrl
	const resolvedSourceModelUrl = preferredModelUrl
	const resolvedSourceImageUrl = preferredImageUrl

	console.log(`[Meshy Backend] normalizeTask for ${mode}/${taskId}:`, {
		status,
		progress,
		imageUrlsCount: imageUrls.length,
		preferredImageUrl,
		hasModelUrls,
		preferredModelUrl: resolvedPreferredModelUrl,
		hasResultObj: !!obj.result,
		resultObjKeys: resultObj ? Object.keys(resultObj) : [],
		topLevelKeys: Object.keys(obj).filter(
			(k) => typeof obj[k] !== 'object' || Array.isArray(obj[k])
		)
	})

	const taskErrorRaw = obj.task_error && typeof obj.task_error === 'object' ? obj.task_error : {}
	const errorMessage = String(taskErrorRaw.message || obj.error || '').trim()

	let statusText = String(obj.status_text || '').trim()
	if (!statusText) {
		if (status === 'pending' || status === 'queued') statusText = 'Meshy：任务排队中'
		else if (status === 'running' || status === 'processing' || status === 'in_progress')
			statusText = `Meshy：生成中 ${progress}%`
		else if (status === 'succeeded' || status === 'success' || status === 'completed')
			statusText = 'Meshy：生成完成'
		else if (status === 'failed' || status === 'error')
			statusText = errorMessage || 'Meshy：生成失败'
	}

	return {
		ok: true,
		mode,
		taskId,
		status,
		progress,
		thumbnailUrl,
		modelUrls,
		imageUrls,
		preferredImageUrl,
		sourceImageUrl: resolvedSourceImageUrl,
		preferredModelUrl: resolvedPreferredModelUrl,
		sourceModelUrl: resolvedSourceModelUrl,
		hasModelUrls,
		statusText,
		errorMessage,
		raw: obj
	}
}

function serializeRepoTask(row) {
	if (!row) return null
	const msCreatedAt = Number(row.createdAt)
	const msUpdatedAt = Number(row.updatedAt)
	const msSyncedAt = Number(row.syncedAt || row.updatedAt)
	return {
		id: row.id,
		taskId: row.taskId,
		mode: row.mode,
		target: row.taskTarget || '3d',
		family: row.taskFamily || row.mode,
		relationKind: row.relationKind || 'model',
		rootTaskId: row.rootTaskId || row.taskId,
		parentTaskId: row.parentTaskId || '',
		capabilities: Array.isArray(row.capabilities) ? row.capabilities : ['model'],
		status: row.status || 'idle',
		progress: Number(row.progress) || 0,
		prompt: row.prompt || '',
		negativePrompt: row.negativePrompt || '',
		imageCount: Number(row.imageCount) || 0,
		thumbnailUrl: row.thumbnailUrl || '',
		preferredModelUrl: row.preferredModelUrl || '',
		localAssetUrl: row.localAssetUrl || '',
		localAssetPath: row.localAssetPath || '',
		sourceModelUrl: row.sourceModelUrl || '',
		errorMessage: row.errorMessage || '',
		statusText: row.statusText || '',
		lastNodeId: row.lastNodeId || '',
		projectId: row.projectId ?? null,
		remoteCreatedAt: row.remoteCreatedAt || null,
		remoteFinishedAt: row.remoteFinishedAt || '',
		createdAt: msCreatedAt ? new Date(msCreatedAt).toISOString() : new Date().toISOString(),
		updatedAt: msUpdatedAt ? new Date(msUpdatedAt).toISOString() : new Date().toISOString(),
		syncedAt: msSyncedAt ? new Date(msSyncedAt).toISOString() : new Date().toISOString(),
		requestPayload:
			row.requestPayload && typeof row.requestPayload === 'object' ? row.requestPayload : {},
		responsePayload:
			row.responsePayload && typeof row.responsePayload === 'object' ? row.responsePayload : {},
		children: []
	}
}

function computeEffectiveFields(item) {
	const child = (kind) => {
		if (!Array.isArray(item.children)) return null
		return (
			item.children.find(
				(c) =>
					c.relationKind === kind &&
					c.status &&
					['succeeded', 'success', 'completed'].includes(String(c.status).toLowerCase())
			) || null
		)
	}
	const textureChild = child('texture')
	const riggingChild = child('rigging')
	const animationChild = child('animation')
	const remeshChild = child('remesh')
	item.hasTextureChild = !!textureChild
	item.hasRiggingChild = !!riggingChild
	item.hasAnimationChild = !!animationChild

	let effectiveTaskId = item.taskId
	let effectiveRelationKind = item.relationKind
	let effectiveStatus = item.status
	let effectiveProgress = item.progress
	let effectivePreferredModelUrl = item.preferredModelUrl
	let effectiveLocalAssetUrl = item.localAssetUrl
	let effectiveLocalAssetPath = item.localAssetPath
	let effectiveThumbnailUrl = item.thumbnailUrl

	if (textureChild) {
		effectiveTaskId = textureChild.taskId
		effectiveRelationKind = 'texture'
		effectiveStatus = textureChild.status
		effectiveProgress = textureChild.progress
		effectivePreferredModelUrl = textureChild.preferredModelUrl || effectivePreferredModelUrl
		effectiveLocalAssetUrl = textureChild.localAssetUrl || effectiveLocalAssetUrl
		effectiveLocalAssetPath = textureChild.localAssetPath || effectiveLocalAssetPath
		effectiveThumbnailUrl = textureChild.thumbnailUrl || effectiveThumbnailUrl
	}
	if (remeshChild) {
		effectiveTaskId = remeshChild.taskId
		effectiveRelationKind = 'remesh'
		effectiveStatus = remeshChild.status
		effectiveProgress = remeshChild.progress
		effectivePreferredModelUrl = remeshChild.preferredModelUrl || effectivePreferredModelUrl
		effectiveLocalAssetUrl = remeshChild.localAssetUrl || effectiveLocalAssetUrl
		effectiveLocalAssetPath = remeshChild.localAssetPath || effectiveLocalAssetPath
	}
	if (riggingChild) {
		effectiveTaskId = riggingChild.taskId
		effectiveRelationKind = 'rigging'
		effectiveStatus = riggingChild.status
		effectiveProgress = riggingChild.progress
		effectivePreferredModelUrl = riggingChild.preferredModelUrl || effectivePreferredModelUrl
		effectiveLocalAssetUrl = riggingChild.localAssetUrl || effectiveLocalAssetUrl
		effectiveLocalAssetPath = riggingChild.localAssetPath || effectiveLocalAssetPath
	}
	if (animationChild) {
		effectiveTaskId = animationChild.taskId
		effectiveRelationKind = 'animation'
		effectiveStatus = animationChild.status
		effectiveProgress = animationChild.progress
		effectivePreferredModelUrl = animationChild.preferredModelUrl || effectivePreferredModelUrl
		effectiveLocalAssetUrl = animationChild.localAssetUrl || effectiveLocalAssetUrl
		effectiveLocalAssetPath = animationChild.localAssetPath || effectiveLocalAssetPath
	}

	item.effectiveTaskId = effectiveTaskId
	item.effectiveRelationKind = effectiveRelationKind
	item.effectiveStatus = effectiveStatus
	item.effectiveProgress = effectiveProgress
	item.effectivePreferredModelUrl = effectivePreferredModelUrl
	item.effectiveLocalAssetUrl = effectiveLocalAssetUrl
	item.effectiveLocalAssetPath = effectiveLocalAssetPath
	item.effectiveThumbnailUrl = effectiveThumbnailUrl

	if (Array.isArray(item.children)) {
		for (const c of item.children) {
			computeEffectiveFields(c)
		}
	}
	return item
}

function buildTaskTree(rows) {
	const items = rows.map(serializeRepoTask).filter(Boolean)
	const nodeMap = new Map()
	const roots = []

	for (const item of items) {
		const tid = String(item.taskId || '').trim()
		if (!tid) continue
		nodeMap.set(tid, { ...item, children: [] })
	}

	for (const item of items) {
		const tid = String(item.taskId || '').trim()
		if (!tid) continue
		const node = nodeMap.get(tid)
		if (!node) continue
		const parentId = String(item.parentTaskId || '').trim()
		const rootId = String(item.rootTaskId || tid).trim()
		node.rootTaskId = rootId
		if (parentId && nodeMap.has(parentId) && parentId !== tid) {
			nodeMap.get(parentId).children.push(node)
		} else {
			roots.push(node)
		}
	}

	for (const root of roots) {
		root.children.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
		computeEffectiveFields(root)
	}
	roots.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
	return roots
}

function childOrder(a, b) {
	const orderMap = { texture: 0, remesh: 1, rigging: 2, animation: 3, model: 4 }
	const oa = orderMap[a.relationKind] ?? 99
	const ob = orderMap[b.relationKind] ?? 99
	if (oa !== ob) return oa - ob
	return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
}

function targetAndFamily(mode, payload) {
	const rawTarget = String((payload || {}).target || '')
		.trim()
		.toLowerCase()
	const rawFamily = String((payload || {}).family || '')
		.trim()
		.toLowerCase()
	if (rawFamily) {
		if (rawFamily === 'text-to-image' || rawFamily === 'image-to-image') return ['image', rawFamily]
		return ['3d', rawFamily]
	}
	if (mode === 'text-to-image') return ['image', 'text-to-image']
	if (mode === 'image-to-image') return ['image', 'image-to-image']
	if (rawTarget === 'image') return ['image', 'text-to-image']
	if (mode === 'image-to-3d') return ['3d', 'image-to-3d']
	if (mode === 'multi-image-to-3d') return ['3d', 'multi-image-to-3d']
	if (mode === 'retexture') return ['3d', 'retexture']
	if (mode === 'remesh') return ['3d', 'remesh']
	if (mode === 'uv-unwrap') return ['3d', 'uv-unwrap']
	return ['3d', 'text-to-3d']
}

function imageCount(payload) {
	if (!payload || typeof payload !== 'object') return 0
	if (Array.isArray(payload.image_urls)) {
		const count = payload.image_urls.map((x) => String(x || '').trim()).filter((x) => x).length
		if (count > 0) return count
	}
	if (Array.isArray(payload.reference_image_urls)) {
		const count = payload.reference_image_urls
			.map((x) => String(x || '').trim())
			.filter((x) => x).length
		if (count > 0) return count
	}
	return String(payload.image_url || '').trim() ? 1 : 0
}

function firstNonEmptyStr(payload, keys) {
	if (!payload || typeof payload !== 'object') return ''
	for (const key of keys) {
		const value = String(payload[key] || '').trim()
		if (value) return value
	}
	return ''
}

function relationKindForFamily(family) {
	const raw = String(family || '')
		.trim()
		.toLowerCase()
	if (raw === 'retexture' || raw === 'texture' || raw === 'textured') return 'texture'
	if (raw === 'rigging' || raw === 'rig' || raw === 'bind-skeleton' || raw === 'skeleton')
		return 'rigging'
	if (raw === 'animation' || raw === 'bind-animation' || raw === 'motion') return 'animation'
	if (raw === 'remesh') return 'remesh'
	return 'model'
}

function capabilitiesForRelation(relationKind) {
	const caps = ['model']
	if (relationKind === 'texture') caps.push('textured')
	if (relationKind === 'rigging') caps.push('rigged')
	if (relationKind === 'animation') caps.push('animated')
	return caps
}

function buildCreatePayload(payload) {
	// Log the ENTIRE raw payload first for debugging
	console.log(
		'[Meshy Backend] buildCreatePayload received raw payload:',
		JSON.stringify(payload, null, 2)
	)

	let mode = String(payload.mode || payload.family || '')
		.trim()
		.toLowerCase()
	if (mode === 'refine') mode = 'text-to-3d'
	if (mode === 'animations') mode = 'animation'
	if (mode === 'rigging' || mode === 'animation') return [null, null, 'mode is not supported yet']

	const endpoint = getModePath(mode)
	if (!endpoint) return [null, null, 'mode is invalid']

	const body = {}
	const prompt = String(payload.prompt || '').trim()

	// Define valid aspect ratios per model (per official docs)
	const NANO_BANANA_ASPECT_RATIOS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4'])
	const GPT_IMAGE_2_ASPECT_RATIOS = new Set(['1:1', '3:2', '2:3'])

	if (mode === 'text-to-3d') {
		if (!prompt) return [null, null, 'prompt is required']
		body.prompt = prompt
		const stage = String(payload.stage || 'preview').trim()
		if (stage === 'preview' || stage === 'refine') body.mode = stage
		const previewTaskId = String(payload.preview_task_id || '').trim()
		if (previewTaskId) body.preview_task_id = previewTaskId
		const negativePrompt = String(payload.negative_prompt || '').trim()
		if (negativePrompt) body.negative_prompt = negativePrompt
	} else if (mode === 'image-to-3d') {
		const imageUrl = String(payload.image_url || '').trim()
		if (!imageUrl) return [null, null, 'image_url is required']
		body.image_url = imageUrl
		if (prompt) body.prompt = prompt
	} else if (mode === 'multi-image-to-3d') {
		const imageUrls = Array.isArray(payload.image_urls)
			? payload.image_urls
					.map((x) => String(x || '').trim())
					.filter((x) => x)
					.slice(0, 4)
			: []
		if (!imageUrls.length) return [null, null, 'image_urls is required']
		body.image_urls = imageUrls
		if (prompt) body.prompt = prompt
	} else if (mode === 'text-to-image') {
		if (!prompt) return [null, null, 'prompt is required']

		// Normalize ai_model - try multiple possible keys
		let aiModel = String(payload.ai_model || payload.aiModel || payload.model || '')
			.trim()
			.toLowerCase()
		if (!['nano-banana', 'nano-banana-2', 'nano-banana-pro', 'gpt-image-2'].includes(aiModel)) {
			// Try to infer from model string
			if (aiModel.includes('gpt-image-2') || aiModel.includes('gptimage2')) {
				aiModel = 'gpt-image-2'
			} else if (aiModel.includes('nano-banana-2') || aiModel.includes('nanobanana2')) {
				aiModel = 'nano-banana-2'
			} else if (aiModel.includes('pro')) {
				aiModel = 'nano-banana-pro'
			} else if (aiModel.includes('nano-banana') || aiModel.includes('nanobanana')) {
				aiModel = 'nano-banana'
			} else {
				aiModel = 'nano-banana'
			}
		}
		body.ai_model = aiModel
		body.prompt = prompt

		console.log(`[Meshy Backend] text-to-image raw params:`, {
			ai_model_raw: payload.ai_model,
			aspect_ratio_raw: payload.aspect_ratio,
			generate_multi_view_raw: payload.generate_multi_view,
			generate_multi_view_type: typeof payload.generate_multi_view,
			pose_mode_raw: payload.pose_mode
		})

		// Normalize generate_multi_view to boolean FIRST (mutual exclusion with aspect_ratio)
		let generateMultiView = payload.generate_multi_view
		if (typeof generateMultiView === 'string') {
			const gvStr = generateMultiView.toLowerCase().trim()
			generateMultiView = gvStr === 'true' || gvStr === '1'
		} else if (typeof generateMultiView === 'number') {
			generateMultiView = generateMultiView !== 0
		} else {
			generateMultiView = Boolean(generateMultiView)
		}

		// Handle aspect_ratio ONLY IF generate_multi_view is false
		if (!generateMultiView) {
			// Try multiple possible keys for aspect ratio
			let aspectRatio = String(payload.aspect_ratio || payload.aspectRatio || '1:1').trim()

			if (!aspectRatio) {
				aspectRatio = '1:1'
			}

			// Validate aspect ratio for the selected model
			let validRatio = '1:1'
			if (aiModel === 'gpt-image-2') {
				validRatio = GPT_IMAGE_2_ASPECT_RATIOS.has(aspectRatio) ? aspectRatio : '1:1'
			} else {
				validRatio = NANO_BANANA_ASPECT_RATIOS.has(aspectRatio) ? aspectRatio : '1:1'
			}

			body.aspect_ratio = validRatio
			console.log(
				`[Meshy Backend] text-to-image aspect_ratio set to: ${validRatio} (requested: ${aspectRatio}, model: ${aiModel})`
			)
		} else {
			body.generate_multi_view = true
			body.output_image_count = 4
			console.log(
				`[Meshy Backend] text-to-image generate_multi_view is TRUE - aspect_ratio will NOT be sent, output_image_count forced to 4`
			)
		}

		// Handle pose_mode
		const poseMode = String(payload.pose_mode || '').trim()
		if (poseMode && ['a-pose', 't-pose'].includes(poseMode)) {
			body.pose_mode = poseMode
		}

		// Handle negative_prompt
		const negativePrompt = String(payload.negative_prompt || '').trim()
		if (negativePrompt) body.negative_prompt = negativePrompt

		// Handle output_image_count
		const outputCount = Number(payload.output_image_count || payload.outputImageCount)
		if (Number.isFinite(outputCount) && outputCount > 0 && outputCount <= 4) {
			body.output_image_count = Math.floor(outputCount)
		}

		// Handle seed
		const seed = Number(payload.seed)
		if (Number.isFinite(seed) && seed >= 0) {
			body.seed = Math.floor(seed)
		}

		console.log(`[Meshy Backend] ===== text-to-image FINAL request body =====`)
		console.log(`[Meshy Backend] ${JSON.stringify(body, null, 2)}`)
		console.log(`[Meshy Backend] ==============================================`)
	} else if (mode === 'image-to-image') {
		if (!prompt) return [null, null, 'prompt is required']

		// Normalize ai_model
		let aiModel = String(payload.ai_model || payload.aiModel || payload.model || '')
			.trim()
			.toLowerCase()
		if (!['nano-banana', 'nano-banana-2', 'nano-banana-pro', 'gpt-image-2'].includes(aiModel)) {
			if (aiModel.includes('gpt-image-2') || aiModel.includes('gptimage2')) {
				aiModel = 'gpt-image-2'
			} else if (aiModel.includes('nano-banana-2') || aiModel.includes('nanobanana2')) {
				aiModel = 'nano-banana-2'
			} else if (aiModel.includes('pro')) {
				aiModel = 'nano-banana-pro'
			} else if (aiModel.includes('nano-banana') || aiModel.includes('nanobanana')) {
				aiModel = 'nano-banana'
			} else {
				aiModel = 'nano-banana'
			}
		}

		let refsAny = payload.reference_image_urls
		if (!Array.isArray(refsAny)) refsAny = payload.image_urls
		const refs = Array.isArray(refsAny)
			? refsAny
					.map((x) => String(x || '').trim())
					.filter((x) => x)
					.slice(0, 5)
			: []
		if (!refs.length) return [null, null, 'reference_image_urls is required']
		body.ai_model = aiModel
		body.prompt = prompt
		body.reference_image_urls = refs

		console.log(`[Meshy Backend] image-to-image raw params:`, {
			ai_model_raw: payload.ai_model,
			aspect_ratio_raw: payload.aspect_ratio,
			generate_multi_view_raw: payload.generate_multi_view,
			generate_multi_view_type: typeof payload.generate_multi_view,
			pose_mode_raw: payload.pose_mode
		})

		// Normalize generate_multi_view to boolean FIRST (mutual exclusion with aspect_ratio)
		let generateMultiView = payload.generate_multi_view
		if (typeof generateMultiView === 'string') {
			const gvStr = generateMultiView.toLowerCase().trim()
			generateMultiView = gvStr === 'true' || gvStr === '1'
		} else if (typeof generateMultiView === 'number') {
			generateMultiView = generateMultiView !== 0
		} else {
			generateMultiView = Boolean(generateMultiView)
		}

		// NOTE: Per Meshy official API docs, /image-to-image endpoint does NOT support aspect_ratio parameter.
		// We still send it if provided in case API supports it silently, but it may be ignored.
		if (!generateMultiView) {
			// Try multiple possible keys for aspect ratio
			let aspectRatio = String(payload.aspect_ratio || payload.aspectRatio || '').trim()

			if (aspectRatio) {
				// Validate aspect ratio for the selected model
				let validRatio = null
				if (aiModel === 'gpt-image-2') {
					validRatio = GPT_IMAGE_2_ASPECT_RATIOS.has(aspectRatio) ? aspectRatio : null
				} else {
					validRatio = NANO_BANANA_ASPECT_RATIOS.has(aspectRatio) ? aspectRatio : null
				}

				if (validRatio) {
					body.aspect_ratio = validRatio
					console.log(
						`[Meshy Backend] image-to-image: passing aspect_ratio=${validRatio} (API may ignore this parameter per docs)`
					)
				} else {
					console.log(
						`[Meshy Backend] image-to-image: aspect_ratio ${aspectRatio} not valid for model ${aiModel} (or API may not support aspect_ratio at all)`
					)
				}
			}
		} else {
			body.generate_multi_view = true
			body.output_image_count = 4
			console.log(
				`[Meshy Backend] image-to-image generate_multi_view is TRUE - output_image_count forced to 4`
			)
		}

		// Handle pose_mode (send it, API may ignore)
		const poseMode = String(payload.pose_mode || '').trim()
		if (poseMode && ['a-pose', 't-pose'].includes(poseMode)) {
			body.pose_mode = poseMode
		}

		// Handle negative_prompt (send it, API may ignore)
		const negativePrompt = String(payload.negative_prompt || '').trim()
		if (negativePrompt) body.negative_prompt = negativePrompt

		// Handle output_image_count
		const outputCount = Number(payload.output_image_count || payload.outputImageCount)
		if (Number.isFinite(outputCount) && outputCount > 0 && outputCount <= 4) {
			body.output_image_count = Math.floor(outputCount)
		}

		// Handle seed
		const seed = Number(payload.seed)
		if (Number.isFinite(seed) && seed >= 0) {
			body.seed = Math.floor(seed)
		}

		console.log(`[Meshy Backend] ===== image-to-image FINAL request body =====`)
		console.log(
			`[Meshy Backend] ${JSON.stringify({ ...body, reference_image_urls: `[${refs.length} images]` }, null, 2)}`
		)
		console.log(`[Meshy Backend] ==================================================`)
	} else if (mode === 'retexture') {
		const inputTaskId = String(payload.input_task_id || payload.preview_task_id || '').trim()
		const modelUrl = String(payload.model_url || '').trim()
		if (inputTaskId) body.input_task_id = inputTaskId
		else if (modelUrl) body.model_url = modelUrl
		else return [null, null, 'input_task_id or model_url is required']
		let textStylePrompt = String(payload.text_style_prompt || payload.texture_prompt || '').trim()
		const imageStyleUrl = String(payload.image_style_url || payload.texture_image_url || '').trim()
		if (!textStylePrompt && prompt) textStylePrompt = prompt
		if (!textStylePrompt && !imageStyleUrl)
			return [null, null, 'text_style_prompt or image_style_url is required']
		if (textStylePrompt) body.text_style_prompt = textStylePrompt
		if (imageStyleUrl) body.image_style_url = imageStyleUrl
		let aiModel = String(payload.ai_model || '')
			.trim()
			.toLowerCase()
		if (!['meshy-5', 'meshy-6', 'latest'].includes(aiModel)) aiModel = 'latest'
		body.ai_model = aiModel
	} else if (mode === 'remesh') {
		const inputTaskId = String(payload.input_task_id || payload.preview_task_id || '').trim()
		const modelUrl = String(payload.model_url || '').trim()
		if (inputTaskId) body.input_task_id = inputTaskId
		else if (modelUrl) body.model_url = modelUrl
		else return [null, null, 'input_task_id or model_url is required']
	} else if (mode === 'uv-unwrap') {
		const inputTaskId = String(payload.input_task_id || payload.preview_task_id || '').trim()
		const modelUrl = String(payload.model_url || '').trim()
		if (inputTaskId) body.input_task_id = inputTaskId
		else if (modelUrl) body.model_url = modelUrl
		else return [null, null, 'input_task_id or model_url is required']
	}

	// For 3D modes, still process extra keys
	let extraKeys = []
	if (['text-to-3d', 'image-to-3d', 'multi-image-to-3d'].includes(mode)) {
		extraKeys = [
			'ai_model',
			'model_type',
			'topology',
			'target_polycount',
			'symmetry_mode',
			'should_remesh',
			'save_pre_remeshed_model',
			'should_texture',
			'enable_pbr',
			'pose_mode',
			'texture_prompt',
			'texture_image_url',
			'moderation',
			'image_enhancement',
			'remove_lighting',
			'target_formats',
			'negative_prompt'
		]
	} else if (mode === 'retexture') {
		extraKeys = [
			'ai_model',
			'enable_original_uv',
			'enable_pbr',
			'hd_texture',
			'remove_lighting',
			'target_formats',
			'alpha_thumbnail'
		]
	} else if (mode === 'remesh') {
		extraKeys = [
			'target_formats',
			'topology',
			'target_polycount',
			'decimation_mode',
			'resize_height',
			'origin_at',
			'convert_format_only'
		]
	}
	// Note: text-to-image and image-to-image params are handled explicitly above with validation

	const boolKeys = new Set([
		'generate_multi_view',
		'should_remesh',
		'save_pre_remeshed_model',
		'should_texture',
		'enable_pbr',
		'enable_original_uv',
		'hd_texture',
		'remove_lighting',
		'alpha_thumbnail'
	])

	for (const key of extraKeys) {
		if (key in body) continue
		let value = payload[key]
		if (value === undefined || value === null) continue
		if (typeof value === 'string' && !value.trim()) continue
		if (Array.isArray(value) && !value.length) continue
		if (boolKeys.has(key)) {
			if (typeof value === 'string') {
				value = value.toLowerCase() === 'true' || value === '1'
			} else {
				value = Boolean(value)
			}
		}
		body[key] = value
	}

	return [mode, body, null]
}

export async function generateModel(ctx, payload) {
	const apiKey = getApiKey(ctx)
	const client = getHttpClient()
	const repo = ctx.localdb?.meshyTasks
	if (!repo) throw internalError('meshyTasks repo not available')

	console.log('[Meshy Backend] 接收到生成请求 payload:', JSON.stringify(payload, null, 2))

	const [mode, body, buildErr] = buildCreatePayload(payload || {})
	if (buildErr) throw invalidParamsError(buildErr)

	console.log('[Meshy Backend] 构建的请求 body (mode=' + mode + '):', JSON.stringify(body, null, 2))

	const endpoint = getModePath(mode)
	const url = `${MESHY_API_BASE}${endpoint}`

	console.log('[Meshy Backend] 请求端点:', url)

	const res = await client.post(url, body, {
		headers: { Authorization: `Bearer ${apiKey}` },
		timeout: 45000
	})

	if (!res.ok) {
		const errMsg =
			typeof res.body === 'object' && res.body?.message ? res.body.message : `HTTP ${res.status}`
		throw upstreamError(`meshy generate failed: ${errMsg}`)
	}

	const taskId = extractTaskId(res.body)
	if (!taskId) throw upstreamError('meshy generate failed: no task_id in response')

	const [target, family] = targetAndFamily(mode, payload)
	const relationKind = relationKindForFamily(family)
	const parentTaskId = firstNonEmptyStr(payload, [
		'parentTaskId',
		'parent_task_id',
		'sourceTaskId',
		'source_task_id',
		'upstreamTaskId',
		'upstream_task_id',
		'preview_task_id'
	])
	const rootTaskId =
		firstNonEmptyStr(payload, ['rootTaskId', 'root_task_id']) || parentTaskId || taskId
	const capabilities = capabilitiesForRelation(relationKind)

	const recordedPayload = {
		...(payload || {}),
		_requestBody: body,
		_requestUrl: url,
		_submittedAt: new Date().toISOString()
	}

	repo.upsert({
		taskId,
		mode,
		taskTarget: target,
		taskFamily: family,
		relationKind,
		rootTaskId,
		parentTaskId,
		capabilities,
		status: 'pending',
		progress: 0,
		prompt: body.prompt || '',
		negativePrompt: body.negative_prompt || '',
		imageCount: imageCount(payload),
		thumbnailUrl: '',
		preferredModelUrl: '',
		sourceModelUrl: '',
		errorMessage: '',
		statusText: 'Meshy：任务已创建',
		requestPayload: recordedPayload,
		responsePayload: res.body,
		projectId: payload?.projectId,
		lastNodeId: payload?.nodeId || payload?.lastNodeId || '',
		remoteCreatedAt: new Date().toISOString(),
		remoteFinishedAt: ''
	})

	return { ok: true, mode, taskId, status: 'pending', raw: res.body }
}

export async function getTask(ctx, payload) {
	const apiKey = getApiKey(ctx)
	const client = getHttpClient()
	const repo = ctx.localdb?.meshyTasks
	if (!repo) throw internalError('meshyTasks repo not available')

	const taskId = String(payload?.taskId || payload?.id || '').trim()
	const mode = String(payload?.mode || 'text-to-3d').trim()
	if (!taskId) throw invalidParamsError('taskId is required')

	const endpoint = getModePath(mode)
	if (!endpoint) throw invalidParamsError('invalid mode')

	const url = `${MESHY_API_BASE}${endpoint}/${encodeURIComponent(taskId)}`

	const res = await client.get(url, {
		headers: { Authorization: `Bearer ${apiKey}` },
		timeout: 30000
	})

	if (!res.ok) {
		if (res.status === 404) throw notFoundError('meshy task not found')
		const errMsg =
			typeof res.body === 'object' && res.body?.message ? res.body.message : `HTTP ${res.status}`
		throw upstreamError(`meshy getTask failed: ${errMsg}`)
	}

	const normalized = normalizeTask(mode, taskId, res.body)

	const [target, family] = targetAndFamily(mode, normalized.raw)

	// 保留已有记录中的绑定节点和本地资产信息，不被轮询刷新覆盖
	const existing = repo.getByTaskId(taskId)

	const localAssetUrl = existing?.localAssetUrl || ''
	const localAssetPath = existing?.localAssetPath || ''
	const lastNodeId = existing?.lastNodeId || ''

	repo.upsert({
		taskId,
		mode,
		taskTarget: target,
		taskFamily: family,
		status: normalized.status,
		progress: normalized.progress,
		thumbnailUrl: normalized.thumbnailUrl,
		preferredModelUrl: normalized.preferredModelUrl,
		sourceModelUrl: normalized.sourceModelUrl,
		errorMessage: normalized.errorMessage,
		statusText: normalized.statusText,
		responsePayload: normalized.raw,
		remoteFinishedAt: ['succeeded', 'success', 'completed', 'failed', 'error'].includes(
			normalized.status
		)
			? new Date().toISOString()
			: '',
		lastNodeId,
		localAssetUrl,
		localAssetPath
	})

	return {
		...normalized,
		localAssetUrl,
		localAssetPath,
		lastNodeId
	}
}

export async function listTasks(ctx, payload) {
	const repo = ctx.localdb?.meshyTasks
	if (!repo) throw internalError('meshyTasks repo not available')

	let rows = repo.list()

	if (payload?.status) {
		const targetStatus = String(payload.status).trim().toLowerCase()
		rows = rows.filter((item) => item.status === targetStatus)
	}
	if (payload?.target && payload.target !== 'all') {
		rows = rows.filter((item) => item.taskTarget === payload.target)
	}
	if (payload?.family) {
		const targetFamily = String(payload.family).trim().toLowerCase()
		rows = rows.filter((item) => item.taskFamily === targetFamily)
	}

	const rootIds = new Set()
	for (const row of rows) {
		rootIds.add(String(row.rootTaskId || row.taskId).trim() || String(row.taskId))
	}
	const merged = new Map()
	for (const row of rows) {
		merged.set(String(row.taskId), row)
	}
	for (const rootId of rootIds) {
		if (!merged.has(rootId)) {
			const rootRow = repo.getByTaskId(rootId)
			if (rootRow) merged.set(rootId, rootRow)
		}
	}
	const allRows = Array.from(merged.values())

	let items = buildTaskTree(allRows)

	if (payload?.limit) {
		const limit = Math.max(1, Math.min(200, Number(payload.limit) || 80))
		items = items.slice(0, limit)
	}

	return { ok: true, items }
}

export async function getTaskDetail(ctx, payload) {
	const taskId = String(payload?.taskId || payload?.id || '').trim()
	if (!taskId) throw invalidParamsError('taskId is required')

	const repo = ctx.localdb?.meshyTasks
	if (!repo) throw internalError('meshyTasks repo not available')

	const local = repo.getByTaskId(taskId)
	if (!local) {
		throw notFoundError('meshy task not found')
	}

	const mode = local.mode || 'text-to-3d'

	let normalized
	try {
		normalized = await getTask(ctx, { taskId, mode })
	} catch {
		normalized = null
	}

	const rootTaskId = String(local.rootTaskId || taskId).trim() || taskId
	const rows = []
	const rootRow = repo.getByTaskId(rootTaskId)
	if (rootRow) rows.push(rootRow)

	const allRows = repo.list()
	for (const row of allRows) {
		if (String(row.rootTaskId || '') === rootTaskId && String(row.taskId) !== rootTaskId) {
			rows.push(row)
		}
	}

	const items = buildTaskTree(rows)
	let item = items[0] || serializeRepoTask(local)
	if (item) {
		item.selectedTaskId = taskId
	}

	return { ok: true, item: item || { ok: false, error: 'task not found' } }
}

export async function stopTask(ctx, payload) {
	const apiKey = getApiKey(ctx)
	const client = getHttpClient()
	const repo = ctx.localdb?.meshyTasks
	if (!repo) throw internalError('meshyTasks repo not available')

	const taskId = String(payload?.taskId || '').trim()
	const mode = String(payload?.mode || 'text-to-3d').trim()
	if (!taskId) throw invalidParamsError('taskId is required')

	const endpoint = getModePath(mode)
	if (!endpoint) throw invalidParamsError('invalid mode')

	const url = `${MESHY_API_BASE}${endpoint}/${encodeURIComponent(taskId)}/cancel`

	let stopOk = true
	try {
		const res = await client.post(
			url,
			{},
			{
				headers: { Authorization: `Bearer ${apiKey}` },
				timeout: 15000
			}
		)
		if (!res.ok) stopOk = false
	} catch {
		stopOk = false
	}

	repo.upsert({
		taskId,
		mode,
		status: 'cancelled',
		statusText: 'Meshy：任务已停止',
		errorMessage: stopOk ? '' : 'stop request failed, marked as cancelled locally'
	})

	return { ok: true, taskId, status: 'cancelled' }
}

export async function deleteTask(ctx, payload) {
	const repo = ctx.localdb?.meshyTasks
	if (!repo) throw internalError('meshyTasks repo not available')

	const taskId = String(payload?.taskId || '').trim()
	if (!taskId) throw invalidParamsError('taskId is required')

	const existing = repo.getByTaskId(taskId)
	if (!existing) throw notFoundError('meshy task not found')

	const allRows = repo.list()
	const rootId = String(existing.rootTaskId || taskId).trim()
	const toDelete = []
	for (const row of allRows) {
		const rid = String(row.rootTaskId || row.taskId).trim()
		if (rid === rootId || String(row.taskId) === taskId) {
			toDelete.push(String(row.taskId))
		}
	}

	for (const tid of toDelete) {
		repo.remove(tid)
	}

	return { ok: true, taskId, deleted: true }
}

export async function getBalance(ctx) {
	try {
		console.log('[Meshy Backend] getBalance called')

		let apiKey = ''
		try {
			apiKey = getApiKey(ctx)
		} catch (err) {
			console.log('[Meshy Backend] API key not available:', err.message)
			return {
				ok: true,
				available: false,
				configured: false,
				displayText: '未配置Meshy API Key',
				detail: err.message
			}
		}

		console.log('[Meshy Backend] api key found, key prefix:', apiKey.slice(0, 8) + '...')
		const client = getHttpClient()
		const url = `${MESHY_API_BASE}/openapi/v1/balance`
		console.log('[Meshy Backend] fetching balance from:', url)

		const res = await client.get(url, {
			headers: { Authorization: `Bearer ${apiKey}` },
			timeout: 30000
		})

		console.log('[Meshy Backend] balance response status:', res.status, 'ok:', res.ok)

		if (!res.ok) {
			let errDetail = `HTTP ${res.status}`
			try {
				if (res.body && typeof res.body === 'object') {
					errDetail = JSON.stringify(res.body)
				} else if (typeof res.body === 'string') {
					errDetail = res.body
				}
			} catch {}
			console.warn('[Meshy Backend] balance query failed:', errDetail)
			return {
				ok: true,
				available: false,
				configured: true,
				displayText: '无法查询余额',
				detail: errDetail
			}
		}

		const balance = res.body
		console.log(
			'[Meshy Backend] balance response body:',
			typeof balance === 'object' ? JSON.stringify(balance) : balance
		)
		const balanceValue =
			typeof balance === 'object' && balance !== null
				? typeof balance.balance === 'number'
					? balance.balance
					: null
				: null
		const displayText =
			balanceValue !== null ? `余额: ${balanceValue} credits` : '余额查询成功（无法解析余额数值）'

		return { ok: true, available: true, configured: true, displayText, detail: balance }
	} catch (err) {
		console.error('[Meshy Backend] getBalance error:', err?.message || String(err), err?.stack)
		return {
			ok: true,
			available: false,
			configured: true,
			displayText: '余额查询失败',
			detail: err?.message || String(err)
		}
	}
}

export async function health(ctx) {
	try {
		const apiKey = getApiKey(ctx)
		return { ok: true, configured: !!apiKey }
	} catch {
		return { ok: true, configured: false }
	}
}

export async function updateTaskLocalAsset(ctx, payload) {
	const repo = ctx.localdb?.meshyTasks
	if (!repo) throw internalError('meshyTasks repo not available')

	const taskId = String(payload?.taskId || '').trim()
	if (!taskId) throw invalidParamsError('taskId is required')

	const existing = repo.getByTaskId(taskId)
	if (!existing) throw notFoundError('meshy task not found')

	// ===== 硬防护：localAssetUrl/localAssetPath 扩展名必须是模型格式，禁止缩略图(PNG等)污染 DB =====
	const rawLocalAssetUrl = String(payload?.localAssetUrl || '').trim()
	const rawLocalAssetPath = String(payload?.localAssetPath || '').trim()
	const urlIsImage = rawLocalAssetUrl && isImageUrlOrPath(rawLocalAssetUrl)
	const pathIsImage = rawLocalAssetPath && isImageUrlOrPath(rawLocalAssetPath)
	if (urlIsImage || pathIsImage) {
		console.warn(
			`[Meshy Backend] updateTaskLocalAsset 收到疑似缩略图污染请求(扩展名是图片)，已拒绝写入：`,
			{
				taskId,
				localAssetUrl: rawLocalAssetUrl || undefined,
				localAssetPath: rawLocalAssetPath || undefined,
				urlIsImage,
				pathIsImage
			}
		)
	}
	const safeLocalAssetUrl =
		rawLocalAssetUrl && !urlIsImage && isLikely3DModelUrlOrPath(rawLocalAssetUrl)
			? rawLocalAssetUrl
			: String(existing?.localAssetUrl || '')
	const safeLocalAssetPath =
		rawLocalAssetPath && !pathIsImage ? rawLocalAssetPath : String(existing?.localAssetPath || '')

	repo.upsert({
		taskId,
		localAssetUrl: safeLocalAssetUrl,
		localAssetPath: safeLocalAssetPath,
		lastNodeId: String(payload?.lastNodeId || existing?.lastNodeId || '')
	})

	return { ok: true, taskId }
}
