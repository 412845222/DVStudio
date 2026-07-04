import { computed, type Ref } from 'vue'
import type { WorkflowNode } from '../../../../aiworkflow/types'

export const useAIWorkflowResourceActions = (payload: {
	store: {
		state: {
			nodesById: Record<string, WorkflowNode>
			resourcesById: Record<string, {
				sourcePath?: string
				projectRelativePath?: string
				url?: string
			}>
		}
	}
	selectedNodeId: Ref<string | null>
	isElectron: () => boolean
	nodeResourceName: (node: WorkflowNode) => string | null
	getProjectId?: () => number | null
	getProjectRootPath?: (projectId?: number) => string
}) => {
	const getMimeTypeFromFilename = (filename: string): string => {
		const ext = filename.split('.').pop()?.toLowerCase() || ''
		const mimeMap: Record<string, string> = {
			png: 'image/png',
			jpg: 'image/jpeg',
			jpeg: 'image/jpeg',
			gif: 'image/gif',
			webp: 'image/webp',
			bmp: 'image/bmp',
			svg: 'image/svg+xml',
			mp4: 'video/mp4',
			webm: 'video/webm',
			mov: 'video/quicktime',
			avi: 'video/x-msvideo',
			glb: 'model/gltf-binary',
			gltf: 'model/gltf+json',
			fbx: 'application/octet-stream',
			obj: 'text/plain',
			stl: 'application/sla',
			usdz: 'model/vnd.usdz+zip'
		}
		return mimeMap[ext] || 'application/octet-stream'
	}

	const triggerDownloadObjectUrl = (objectUrl: string, filename: string) => {
		const a = document.createElement('a')
		a.href = objectUrl
		a.download = filename
		a.rel = 'noopener'
		document.body.appendChild(a)
		a.click()
		a.remove()
	}

	const downloadUrlAsBlob = async (url: string, filename: string) => {
		const res = await fetch(url, { credentials: 'include' })
		if (!res.ok) throw new Error(`HTTP ${res.status}`)
		const originalBlob = await res.blob()
		let mimeType = getMimeTypeFromFilename(filename)
		const contentType = res.headers.get('content-type')
		if (contentType && contentType.includes('/')) {
			const ct = contentType.split(';')[0].trim()
			if (ct && ct !== 'application/octet-stream') {
				mimeType = ct
			}
		}
		if (originalBlob.type && originalBlob.type !== 'application/octet-stream') {
			mimeType = originalBlob.type
		}
		const blob = originalBlob.type === mimeType
			? originalBlob
			: new Blob([originalBlob], { type: mimeType })
		const objectUrl = URL.createObjectURL(blob)
		try {
			triggerDownloadObjectUrl(objectUrl, filename)
		} finally {
			setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
		}
	}

	const getExtensionFromUrl = (url: string): string => {
		const u = String(url || '').trim()
		if (!u) return ''
		try {
			if (u.startsWith('data:')) {
				const m = /^data:image\/(\w+);base64,/.exec(u)
				if (m) return m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase()
			}
			let pathname = u
			if (u.startsWith('file://')) {
				pathname = decodeURIComponent(new URL(u).pathname).replace(/^\/+([a-zA-Z]:)/, '$1')
			} else if (/^https?:\/\//i.test(u)) {
				pathname = new URL(u).pathname
			}
			const ext = pathname.split('.').pop()?.toLowerCase() || ''
			if (/^(png|jpe?g|gif|webp|bmp|svg|mp4|webm|mov|avi|glb|gltf|fbx|obj|stl|usdz)$/i.test(ext)) {
				return ext === 'jpeg' ? 'jpg' : ext
			}
		} catch {}
		return ''
	}

	const inferSelectedResourceFilename = (node: WorkflowNode) => {
		const raw =
			node.type === 'model3d'
				? String(node.model3dSettings?.modelSourceName ?? '').trim()
				: String(payload.nodeResourceName(node) ?? '').trim()
		const safe = raw.replace(/[\\/:*?"<>|]+/g, '_')
		if (safe && /\.\w{2,5}$/.test(safe)) return safe

		let ext = ''
		if (node.type === 'image') {
			const rid = String(node.resourceId || '').trim()
			if (rid) {
				const resource = payload.store.state.resourcesById[rid]
				if (resource) {
					const sourcePath = String(resource?.sourcePath ?? '').trim()
					const url = String(resource?.url ?? '').trim()
					const projectRelativePath = String(resource?.projectRelativePath ?? '').trim()
					ext = getExtensionFromUrl(sourcePath) || getExtensionFromUrl(url) || getExtensionFromUrl(projectRelativePath)
				}
			}
			if (!ext && node.imageSettings?.outputFormat) {
				const fmt = String(node.imageSettings.outputFormat).toLowerCase()
				ext = fmt === 'jpeg' ? 'jpg' : fmt
			}
			if (!ext) ext = 'png'
			return safe ? `${safe}.${ext}` : `image-${node.id}.${ext}`
		}

		if (node.type === 'model3d') {
			const fmt = String(node.model3dSettings?.modelFormat ?? 'glb').trim() || 'glb'
			return safe ? `${safe}.${fmt}` : `model-${node.id}.${fmt}`
		}

		if (node.type === 'video') {
			const rid = String(node.resourceId || '').trim()
			if (rid) {
				const resource = payload.store.state.resourcesById[rid]
				if (resource) {
					const sourcePath = String(resource?.sourcePath ?? '').trim()
					const url = String(resource?.url ?? '').trim()
					ext = getExtensionFromUrl(sourcePath) || getExtensionFromUrl(url)
				}
			}
			if (!ext) ext = 'mp4'
			return safe ? `${safe}.${ext}` : `video-${node.id}.${ext}`
		}

		return safe || `resource-${node.id}`
	}

	const isAbsoluteLocalPath = (value: string) => {
		const v = String(value || '').trim()
		if (!v) return false
		if (/^https?:\/\//i.test(v)) return false
		return (
			/^[a-zA-Z]:[\\/]/.test(v) ||
			v.startsWith('/') ||
			v.startsWith('\\\\') ||
			v.startsWith('file://')
		)
	}

	const resolveFromProjectRelativePath = (projectRelativePath: string, projectId?: number) => {
		const rel = String(projectRelativePath || '').trim()
		if (!rel) return ''
		const root = payload.getProjectRootPath ? payload.getProjectRootPath(projectId) : ''
		if (root) {
			const normalizedRoot = root.endsWith('/') || root.endsWith('\\') ? root.slice(0, -1) : root
			const normalizedRel = rel.replace(/^[\\/]+/, '')
			if (normalizedRoot && normalizedRel) {
				return `${normalizedRoot}/${normalizedRel}`
			}
		}
		return rel
	}

	const resolveFromDwebProjectAssetUrl = (rawUrl: string) => {
		const urlLower = String(rawUrl || '').trim()
		if (!urlLower.startsWith('dweb://project-assets')) return ''
		try {
			const urlObj = new URL(rawUrl)
			const params = urlObj.searchParams
			const parsedPath = params.get('path') || ''
			if (!parsedPath) return ''
			const pid = Number(params.get('projectId') || params.get('project') || '0') || 0
			const root = payload.getProjectRootPath ? payload.getProjectRootPath(pid) : ''
			if (root) {
				const normalizedRoot = root.endsWith('/') || root.endsWith('\\') ? root.slice(0, -1) : root
				const normalizedPath = parsedPath.replace(/^[\\/]+/, '')
				return `${normalizedRoot}/${normalizedPath}`
			}
			return parsedPath
		} catch {
			return ''
		}
	}

	const isBinCachePath = (value: string) => {
		const v = String(value || '').trim().toLowerCase().replace(/\\/g, '/')
		if (!v) return false
		if (v.endsWith('.bin')) return true
		return v.includes('/.dvcache/bin/')
	}

	const toFolderIfBin = (value: string) => {
		if (!value) return ''
		if (isBinCachePath(value)) {
			const sep = value.lastIndexOf('/')
			const sepWin = value.lastIndexOf('\\')
			const lastSep = Math.max(sep, sepWin)
			if (lastSep > 0) {
				return value.slice(0, lastSep)
			}
		}
		return value
	}

	const pickPreferredMediaPath = (candidates: (string | null | undefined)[]) => {
		const valid = candidates.map((c) => String(c || '').trim()).filter(Boolean)
		if (!valid.length) return ''
		const nonBin = valid.find((p) => !isBinCachePath(p))
		return toFolderIfBin(nonBin || valid[0])
	}

	const selectedNodeLocalResourcePath = computed(() => {
		if (!payload.selectedNodeId.value) return ''
		const node = payload.store.state.nodesById[payload.selectedNodeId.value]
		if (!node) return ''

		if (node.type === 'model3d') {
			const msettings = node.model3dSettings ?? {}
			const candidates: (string | null | undefined)[] = []

			const rid = String(node.resourceId || '').trim()
			if (rid) {
				const resource = payload.store.state.resourcesById[rid]
				if (resource) {
					const resourceSourcePath = String(resource?.sourcePath ?? '').trim()
					candidates.push(resourceSourcePath)

					const resourceProjectRelativePath = String(resource?.projectRelativePath ?? '').trim()
					if (resourceProjectRelativePath) {
						const pid = payload.getProjectId?.() ?? undefined
						const resolved = resolveFromProjectRelativePath(resourceProjectRelativePath, pid)
						candidates.push(resolved)
					}

					const resourceUrl = String(resource?.url ?? '').trim()
					if (resourceUrl) {
						if (/^file:\/\//i.test(resourceUrl)) {
							try {
								const urlObj = new URL(resourceUrl)
								candidates.push(decodeURIComponent(urlObj.pathname).replace(/^\/+([a-zA-Z]:)/, '$1'))
							} catch {}
						}
						if (resourceUrl.toLowerCase().startsWith('dweb://project-assets')) {
							const fromDweb = resolveFromDwebProjectAssetUrl(resourceUrl)
							candidates.push(fromDweb)
						}
					}

					const localAssetPath = String((resource as Record<string, unknown>)?.localAssetPath ?? '').trim()
					candidates.push(localAssetPath)

					const absolutePath = String((resource as Record<string, unknown>)?.absolutePath ?? '').trim()
					candidates.push(absolutePath)
				}
			}

			const assetPath = String(msettings.modelAssetPath ?? '').trim()
			if (!/^https?:\/\//i.test(assetPath)) {
				candidates.push(assetPath)
			}

			const sourcePath = String(msettings.modelSourcePath ?? '').trim()
			if (!/^https?:\/\//i.test(sourcePath)) {
				candidates.push(sourcePath)
			}

			const projectRelativePath = String(
				msettings.modelAssetProjectRelativePath ?? msettings.modelProjectRelativePath ?? ''
			).trim()
			if (projectRelativePath) {
				const pid = payload.getProjectId?.() ?? undefined
				const resolved = resolveFromProjectRelativePath(projectRelativePath, pid)
				candidates.push(resolved)
			}

			const rawUrl = String(msettings.modelUrl ?? msettings.modelAssetUrl ?? '').trim()
			if (rawUrl) {
				if (/^file:\/\//i.test(rawUrl)) {
					try {
						const urlObj = new URL(rawUrl)
						candidates.push(decodeURIComponent(urlObj.pathname).replace(/^\/+([a-zA-Z]:)/, '$1'))
					} catch {}
				}
				if (rawUrl.toLowerCase().startsWith('dweb://project-assets')) {
					const fromDweb = resolveFromDwebProjectAssetUrl(rawUrl)
					candidates.push(fromDweb)
				}
			}

			const result = pickPreferredMediaPath(candidates)
			if (result && isAbsoluteLocalPath(result)) return result
			if (result) return result
			return ''
		}

		if (node.type !== 'image' && node.type !== 'video') return ''

		const rid = String(node.resourceId || '').trim()
		if (!rid) return ''
		const resource = payload.store.state.resourcesById[rid]
		if (!resource) return ''

		const candidates: (string | null | undefined)[] = []

		const sourcePath = String(resource?.sourcePath ?? '').trim()
		candidates.push(sourcePath)

		const projectRelativePath = String(resource?.projectRelativePath ?? '').trim()
		if (projectRelativePath) {
			const pid = payload.getProjectId?.() ?? undefined
			const resolved = resolveFromProjectRelativePath(projectRelativePath, pid)
			candidates.push(resolved)
		}

		const rawUrl = String(resource?.url ?? '').trim()
		if (rawUrl) {
			if (/^file:\/\//i.test(rawUrl)) {
				try {
					const urlObj = new URL(rawUrl)
					candidates.push(decodeURIComponent(urlObj.pathname).replace(/^\/+([a-zA-Z]:)/, '$1'))
				} catch {}
			}
			if (rawUrl.toLowerCase().startsWith('dweb://project-assets')) {
				const fromDweb = resolveFromDwebProjectAssetUrl(rawUrl)
				candidates.push(fromDweb)
			}
		}

		const localAssetPath = String((resource as Record<string, unknown>)?.localAssetPath ?? '').trim()
		candidates.push(localAssetPath)

		const absolutePath = String((resource as Record<string, unknown>)?.absolutePath ?? '').trim()
		candidates.push(absolutePath)

		const result = pickPreferredMediaPath(candidates)
		if (result && isAbsoluteLocalPath(result)) return result
		return result
	})

	const canOpenSelectedNodeFolder = computed(() => {
		return Boolean(payload.isElectron() && selectedNodeLocalResourcePath.value)
	})

	return {
		downloadUrlAsBlob,
		inferSelectedResourceFilename,
		selectedNodeLocalResourcePath,
		canOpenSelectedNodeFolder
	}
}
