import type { AIWorkflowDraftSnapshot } from '../../../../aiworkflow/persistence/blueprintSnapshot'

export type AIWorkflowProjectPackageAssetTarget = 'url' | 'posterUrl' | 'snapshotField'

export type AIWorkflowProjectPackageAssetKind = 'image' | 'video' | 'file'

export type AIWorkflowProjectPackageAssetEntry = {
	resourceId?: string
	target: AIWorkflowProjectPackageAssetTarget
	filePath: string
	kind: AIWorkflowProjectPackageAssetKind
	name: string
	mimeType: string
	size: number
	snapshotPointer?: string
}

export type AIWorkflowProjectPackageSnapshotAssetCandidate = {
	pointer: string
	url: string
	kind: AIWorkflowProjectPackageAssetKind
	name: string
}

export type AIWorkflowProjectPackageV1 = {
	schemaVersion: 1
	kind: 'aiwf-project-package'
	exportedAt: number
	projectName: string
	snapshot: AIWorkflowDraftSnapshot
	assets: AIWorkflowProjectPackageAssetEntry[]
	templateCode?: string
}

export const AIWF_PROJECT_PACKAGE_ENTRY = 'aiwf-project-package.json'

// ==============================================================
// ZIP 打包离线守卫临时开关（方案 §八 回滚策略）
// ==============================================================
const ENABLE_PACKAGE_OFFLINE_GUARD = true

const AIWF_MEDIA_EXTENSIONS = new Set([
	'png',
	'jpg',
	'jpeg',
	'webp',
	'gif',
	'bmp',
	'svg',
	'mp4',
	'webm',
	'mov',
	'mpeg',
	'mpg',
	'ogg',
	'glb',
	'gltf',
	'obj',
	'fbx',
	'usdz'
])

// ==============================================================
// 第 0 层：ZIP 打包离线守卫 - 协议 / 域名白名单（方案 §三 第 0 层）
// ==============================================================

/**
 * 判断一个 URL 是否属于"本地资源"（可用于 ZIP 打包时的 fetch）。
 * 只有返回 ok=true 的 URL 才允许进入 fetch。
 * 这是 §0 硬性约束的最终防线。
 */
const isPackageAllowedLocalUrl = (raw: string): { ok: boolean; reason?: string } => {
	if (!ENABLE_PACKAGE_OFFLINE_GUARD) return { ok: true, reason: 'guard_disabled' }
	const url = String(raw ?? '').trim()
	if (!url) return { ok: false, reason: 'empty' }

	// 1. 浏览器内部 blob / data URL —— 放行
	if (url.startsWith('blob:') || url.startsWith('data:')) {
		return { ok: true }
	}
	// 2. 项目本地资产协议 —— 放行
	if (url.toLowerCase().startsWith('dweb://')) {
		return { ok: true }
	}
	// 3. 本地文件协议 —— 放行
	if (url.toLowerCase().startsWith('file:///')) {
		return { ok: true }
	}

	// 4. http(s) 协议 → 只允许 127.0.0.1 / localhost / ::1 / 私网网段
	if (/^https?:\/\//i.test(url)) {
		try {
			const u = new URL(url)
			const host = u.hostname.toLowerCase()
			if (
				host === '127.0.0.1' ||
				host === 'localhost' ||
				host === '::1' ||
				/^10\./.test(host) ||
				/^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
				/^192\.168\./.test(host)
			) {
				return { ok: true }
			}
			return { ok: false, reason: `remote_http_denied:${host}` }
		} catch {
			return { ok: false, reason: 'malformed_http_url' }
		}
	}

	// 5. 其他未知协议 → 交给 resolveUrl 后再判断
	return { ok: true, reason: 'unknown_protocol_passthrough' }
}

/**
 * Meshy/Tripo3D 远端 CDN URL 检测（用于在 push 候选时就剔除，不必走到 fetch 守卫）。
 * 返回 true 表示"这是远端 URL，不能直接打包"。
 */
export const isRemoteModelCdnUrl = (value: unknown): boolean => {
	const text = String(value ?? '').trim()
	if (!text) return false
	if (/assets\.meshy\.ai/i.test(text)) return true
	if (/assets\.tripo3d\.ai/i.test(text)) return true
	try {
		const u = new URL(text, window.location.origin)
		const host = u.hostname.toLowerCase()
		if (
			/^https?:$/i.test(u.protocol) &&
			host !== '127.0.0.1' &&
			host !== 'localhost' &&
			host !== '::1' &&
			!/^10\./.test(host) &&
			!/^172\.(1[6-9]|2\d|3[01])\./.test(host) &&
			!/^192\.168\./.test(host)
		) {
			return true
		}
	} catch {
		/* ignore parse fail, 交由 isPackageAllowedLocalUrl 兜底 */
	}
	return false
}

const isLikelyBinaryAssetBlob = (blob: Blob) => {
	const mt = String(blob?.type || '').toLowerCase()
	if (!mt) return true
	if (mt.startsWith('image/') || mt.startsWith('video/') || mt.startsWith('audio/')) return true
	if (mt.includes('model') || mt.includes('octet-stream') || mt.includes('gltf')) return true
	return false
}

export const cleanupPackagedAssetUrl = (raw: unknown) => {
	let value = String(raw ?? '').trim()
	if (!value) return ''
	value = value
		.replace(/&quot;/gi, '"')
		.replace(/&#34;/g, '"')
		.replace(/&#39;/g, "'")
		.trim()
	value = value.replace(/^['"]+|['"]+$/g, '').trim()
	return value
}

const pathSegmentToPointer = (segment: string | number) => {
	return String(segment).replace(/~/g, '~0').replace(/\//g, '~1')
}

const pointerToPathSegment = (segment: string) => {
	return String(segment).replace(/~1/g, '/').replace(/~0/g, '~')
}

const encodeJsonPointer = (path: Array<string | number>) => {
	if (!Array.isArray(path) || !path.length) return ''
	return '/' + path.map(pathSegmentToPointer).join('/')
}

const decodeJsonPointer = (pointer: string) => {
	const raw = String(pointer || '').trim()
	if (!raw || raw === '/') return [] as string[]
	return raw.replace(/^\//, '').split('/').map(pointerToPathSegment)
}

export const setValueByJsonPointer = (root: Record<string, unknown>, pointer: string, value: unknown) => {
	const path = decodeJsonPointer(pointer)
	if (!path.length) return false
	let cur: Record<string, unknown> = root
	for (let i = 0; i < path.length - 1; i += 1) {
		const key = path[i]
		if (cur == null || typeof cur !== 'object' || !(key in cur)) return false
		const next = cur[key]
		if (next == null || typeof next !== 'object') return false
		cur = next as Record<string, unknown>
	}
	const lastKey = path[path.length - 1]
	if (cur == null || typeof cur !== 'object' || !(lastKey in cur)) return false
	cur[lastKey] = value
	return true
}

export const inferPackageAssetKind = (
	url: string,
	mimeType?: string
): AIWorkflowProjectPackageAssetKind => {
	const mt = String(mimeType || '').toLowerCase()
	if (mt.startsWith('image/')) return 'image'
	if (mt.startsWith('video/')) return 'video'
	if (mt.includes('model') || mt.includes('gltf') || mt.includes('octet-stream')) return 'file'
	const cleanUrl = cleanupPackagedAssetUrl(url).toLowerCase()
	if (/\.(png|jpe?g|webp|gif|bmp|svg|avif)(\?|#|$)/i.test(cleanUrl)) return 'image'
	if (/\.(mp4|webm|mov|m4v|mkv|avi|ogg|mpeg|mpg)(\?|#|$)/i.test(cleanUrl)) return 'video'
	return 'file'
}

const pushPackageSnapshotAssetCandidate = (
	out: AIWorkflowProjectPackageSnapshotAssetCandidate[],
	seenPointer: Set<string>,
	path: Array<string | number>,
	rawUrl: unknown,
	kind: AIWorkflowProjectPackageAssetKind,
	name: string
) => {
	const url = cleanupPackagedAssetUrl(rawUrl)
	if (!url || url.startsWith('package://')) return
	const pointer = encodeJsonPointer(path)
	if (!pointer || seenPointer.has(pointer)) return
	seenPointer.add(pointer)
	out.push({ pointer, url, kind, name })
}

export const collectPackageReferencedResourceIds = (snapshot: AIWorkflowDraftSnapshot) => {
	const out = new Set<string>()
	const nodeOrder = Array.isArray(snapshot?.nodeOrder) ? snapshot.nodeOrder : []
	const nodesById =
		snapshot?.nodesById && typeof snapshot.nodesById === 'object'
			? (snapshot.nodesById as Record<string, unknown>)
			: ({} as Record<string, unknown>)
	const resourcesById =
		snapshot?.resourcesById && typeof snapshot.resourcesById === 'object'
			? (snapshot.resourcesById as Record<string, unknown>)
			: ({} as Record<string, unknown>)

	for (const rawNodeId of nodeOrder) {
		const nodeId = String(rawNodeId || '').trim()
		if (!nodeId) continue
		const node = nodesById?.[nodeId]
		if (!node || typeof node !== 'object') continue
		const nodeObj = node as Record<string, unknown>

		const resourceId = String(nodeObj.resourceId ?? '').trim()
		if (resourceId && resourcesById?.[resourceId]) out.add(resourceId)

		if (
			String(nodeObj.type || '')
				.trim()
				.toLowerCase() !== 'scene-decompose'
		)
			continue
		const settings = nodeObj.sceneDecomposeSettings
		const settingsObj = settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : null
		const outputs = Array.isArray(settingsObj?.outputs)
			? (settingsObj?.outputs as unknown[])
			: []
		for (const item of outputs) {
			const itemObj = item && typeof item === 'object' ? (item as Record<string, unknown>) : null
			const generatedResourceId = String(itemObj?.generatedResourceId ?? '').trim()
			if (generatedResourceId && resourcesById?.[generatedResourceId])
				out.add(generatedResourceId)
		}
	}

	return out
}

export const collectPackageNodeAssetCandidates = (snapshot: unknown) => {
	const out: AIWorkflowProjectPackageSnapshotAssetCandidate[] = []
	const seenPointer = new Set<string>()
	const snapObj = snapshot && typeof snapshot === 'object' ? (snapshot as Record<string, unknown>) : null
	const nodeOrder = Array.isArray(snapObj?.nodeOrder) ? (snapObj?.nodeOrder as unknown[]) : []
	const nodesById =
		snapObj?.nodesById && typeof snapObj.nodesById === 'object'
			? (snapObj.nodesById as Record<string, unknown>)
			: ({} as Record<string, unknown>)

	for (const rawNodeId of nodeOrder) {
		const nodeId = String(rawNodeId || '').trim()
		if (!nodeId) continue
		const node = nodesById?.[nodeId]
		if (!node || typeof node !== 'object') continue
		const nodeObj = node as Record<string, unknown>
		const nodeType = String(nodeObj.type || '')
			.trim()
			.toLowerCase()

		if (nodeType === 'model3d') {
			const settings = nodeObj.model3dSettings
			if (!settings || typeof settings !== 'object') continue
			const settingsObj = settings as Record<string, unknown>
			const name =
				String(settingsObj.modelSourceName || nodeObj.alias || nodeObj.title || nodeId).trim() || nodeId
			pushPackageSnapshotAssetCandidate(
				out,
				seenPointer,
				['nodesById', nodeId, 'model3dSettings', 'modelUrl'],
				settingsObj.modelUrl,
				'file',
				name
			)
			pushPackageSnapshotAssetCandidate(
				out,
				seenPointer,
				['nodesById', nodeId, 'model3dSettings', 'modelAssetUrl'],
				settingsObj.modelAssetUrl,
				'file',
				name
			)
			continue
		}

		if (nodeType === 'scene-layout') {
			const settings = nodeObj.sceneLayoutSettings
			const settingsObj = settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : null
			const bindings = Array.isArray(settingsObj?.manualModelBindings)
				? (settingsObj?.manualModelBindings as unknown[])
				: []
			for (let i = 0; i < bindings.length; i += 1) {
				const binding = bindings[i]
				if (!binding || typeof binding !== 'object') continue
				const bindingObj = binding as Record<string, unknown>
				const objectId = String(bindingObj.objectId || '').trim() || `binding_${i}`
				const name = String(bindingObj.modelSourceName || objectId).trim() || objectId
				pushPackageSnapshotAssetCandidate(
					out,
					seenPointer,
					['nodesById', nodeId, 'sceneLayoutSettings', 'manualModelBindings', i, 'modelUrl'],
					bindingObj.modelUrl,
					'file',
					name
				)
				pushPackageSnapshotAssetCandidate(
					out,
					seenPointer,
					['nodesById', nodeId, 'sceneLayoutSettings', 'manualModelBindings', i, 'modelAssetUrl'],
					bindingObj.modelAssetUrl,
					'file',
					name
				)
			}
			continue
		}

		if (nodeType === 'meshy') {
			const settings = nodeObj.meshySettings
			if (!settings || typeof settings !== 'object') continue
			const settingsObj = settings as Record<string, unknown>
			const name = String(nodeObj.alias || nodeObj.title || nodeId).trim() || nodeId
			pushPackageSnapshotAssetCandidate(
				out,
				seenPointer,
				['nodesById', nodeId, 'meshySettings', 'meshyThumbnailUrl'],
				settingsObj.meshyThumbnailUrl,
				'image',
				`${name}_thumbnail`
			)
			pushPackageSnapshotAssetCandidate(
				out,
				seenPointer,
				['nodesById', nodeId, 'meshySettings', 'meshyOutputAssetUrl'],
				settingsObj.meshyOutputAssetUrl,
				'file',
				`${name}_model`
			)
		}
	}

	return out
}

export const sanitizeFileNamePart = (value: string) => {
	return String(value || '')
		.replace(/[\\/:*?"<>|]+/g, '_')
		.trim()
}

export const cloneBlueprintSnapshotForPackaging = (
	snapshot: AIWorkflowDraftSnapshot
): AIWorkflowDraftSnapshot => {
	const serialized = JSON.stringify(snapshot, (_key, value) => {
		if (typeof value === 'function' || typeof value === 'symbol') return undefined
		if (!value || typeof value !== 'object') return value
		if (typeof Blob !== 'undefined' && value instanceof Blob) return undefined
		if (typeof File !== 'undefined' && value instanceof File) return undefined
		if (typeof Window !== 'undefined' && value instanceof Window) return undefined
		return value
	})
	return JSON.parse(serialized) as AIWorkflowDraftSnapshot
}

export const guessAssetExtension = (url: string, mimeType: string, fallback: string) => {
	const cleanFallback = sanitizeFileNamePart(fallback || '').replace(/^\.+/, '')
	if (cleanFallback) return cleanFallback
	const cleanUrl = String(url || '').trim()
	if (cleanUrl) {
		try {
			const parsed = new URL(cleanUrl, window.location.origin)
			const name = parsed.pathname.split('/').pop() || ''
			const ext = name.includes('.') ? name.split('.').pop() : ''
			const normalized = sanitizeFileNamePart(String(ext || ''))
			if (normalized) return normalized
		} catch {
			// ignore url parse failure
		}
	}
	const mt = String(mimeType || '').toLowerCase()
	// 3D 模型 MIME → 扩展名（方案 §三 第 5 层）
	if (mt.includes('model/gltf-binary')) return 'glb'
	if (mt.includes('model/gltf+json')) return 'gltf'
	if (mt.includes('model/obj')) return 'obj'
	if (mt.includes('application/vnd.usdz+zip')) return 'usdz'
	if (mt.includes('model/stl') || mt.includes('application/x-trimesh-stl')) return 'stl'
	if (mt.includes('application/octet-stream') && /\.fbx(\?|#|$)/i.test(cleanUrl)) return 'fbx'
	// image/video MIME 映射
	if (mt.includes('png')) return 'png'
	if (mt.includes('jpeg')) return 'jpg'
	if (mt.includes('webp')) return 'webp'
	if (mt.includes('gif')) return 'gif'
	if (mt.includes('bmp')) return 'bmp'
	if (mt.includes('svg')) return 'svg'
	if (mt.includes('mp4')) return 'mp4'
	if (mt.includes('webm')) return 'webm'
	if (mt.includes('quicktime')) return 'mov'
	if (mt.includes('mpeg')) return 'mpeg'
	if (mt.includes('ogg')) return 'ogg'
	return 'bin'
}

export const fetchAssetBlobForPackage = async (
	url: string,
	resolveUrl: (value: string) => string
) => {
	const raw = cleanupPackagedAssetUrl(url)
	if (!raw) return null

	// ============== 第 0 层：离线 HARD GUARD ==============
	// ① 先做一次原始 URL 的白名单检查
	const guard0 = isPackageAllowedLocalUrl(raw)
	if (!guard0.ok) {
		console.warn(
			`[package-export][HARD-BLOCK] 拒绝远端 URL (${guard0.reason}): ` +
				raw.substring(0, 120)
		)
		return null
	}

	// ② 应用 resolveBackendUrl（dweb/相对路径 → 本地后端 URL）
	const normalizedUrl =
		/^https?:\/\//i.test(raw) || raw.startsWith('blob:') || raw.startsWith('data:')
			? raw
			: resolveUrl(raw)

	// ③ 解析后的 URL 再次过白名单（防止 resolveUrl 意外拼出公网地址）
	const guard1 = isPackageAllowedLocalUrl(normalizedUrl)
	if (!guard1.ok) {
		console.warn(
			`[package-export][HARD-BLOCK] resolve 后仍为远端 (${guard1.reason}): ` +
				normalizedUrl.substring(0, 120)
		)
		return null
	}

	try {
		const res = await fetch(normalizedUrl, { cache: 'no-store' })
		if (!res.ok) return null
		const blob = await res.blob()
		if (!isLikelyBinaryAssetBlob(blob)) return null
		return blob
	} catch (err) {
		console.warn(
			`[package-export][fetch-fail] 本地资源读取失败: ${normalizedUrl.substring(0, 120)}`,
			err
		)
		return null
	}
}
