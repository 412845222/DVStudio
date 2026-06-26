import { computed, type Ref } from 'vue'
import type { WorkflowNode } from '../../../../aiworkflow/types'

export const useAIWorkflowResourceActions = (payload: {
	store: {
		state: {
			nodesById: Record<string, any>
			resourcesById: Record<string, any>
		}
	}
	selectedNodeId: Ref<string | null>
	isElectron: () => boolean
	nodeResourceName: (node: WorkflowNode) => string | null
	getProjectId?: () => number | null
	getProjectRootPath?: (projectId?: number) => string
}) => {
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
		const blob = await res.blob()
		const objectUrl = URL.createObjectURL(blob)
		try {
			triggerDownloadObjectUrl(objectUrl, filename)
		} finally {
			// Give the browser a moment to start the download before revoking.
			setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
		}
	}

	const inferSelectedResourceFilename = (node: WorkflowNode) => {
		const raw =
			node.type === 'model3d'
				? String(node.model3dSettings?.modelSourceName ?? '').trim()
				: String(payload.nodeResourceName(node) ?? '').trim()
		const safe = raw.replace(/[\\/:*?"<>|]+/g, '_')
		if (safe) return safe
		if (node.type === 'model3d') {
			const fmt = String(node.model3dSettings?.modelFormat ?? 'glb').trim() || 'glb'
			return `model-${node.id}.${fmt}`
		}
		if (node.type === 'video') return `video-${node.id}.mp4`
		return `image-${node.id}.png`
	}

	const isAbsoluteLocalPath = (value: string) => {
		const v = String(value || '').trim()
		if (!v) return false
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
			const assetPath = String(node.model3dSettings?.modelAssetPath ?? '').trim()
			const sourcePath = String(node.model3dSettings?.modelSourcePath ?? '').trim()
			const result = pickPreferredMediaPath([assetPath, sourcePath])
			if (result && isAbsoluteLocalPath(result)) return result
			if (result) return result
			return ''
		}

		if (node.type !== 'image' && node.type !== 'video') return ''

		const rid = String(node.resourceId || '').trim()
		if (!rid) return ''
		const resource = payload.store.state.resourcesById[rid] as any
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

		const localAssetPath = String(resource?.localAssetPath ?? '').trim()
		candidates.push(localAssetPath)

		const absolutePath = String(resource?.absolutePath ?? '').trim()
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
