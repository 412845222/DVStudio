import type { WorkflowEdge, WorkflowNode } from '../../../../aiworkflow/types'
import { isString, isRecord } from '../../../../types/utils'
import type { Tripo3DNodeSettingsLike, Tripo3DStoreLike } from './types'

export const useAIWorkflowTripo3DInputResolver = (options: {
	store: Tripo3DStoreLike
	getFirstIncomingEdge: (nodeId: string, anchorId?: string) => WorkflowEdge | null | undefined
	getIncomingEdges: (nodeId: string, anchorId?: string) => WorkflowEdge[]
	getOutgoingEdges: (nodeId: string, anchorId?: string) => WorkflowEdge[]
	hasOutgoingEdge: (nodeId: string, anchorId: string) => boolean
	getTextOutputForNode: (nodeId: string) => string
	nodeResourceUrl: (node: WorkflowNode) => string | null
	getTripo3DEffectiveModelSource: (settings: Tripo3DNodeSettingsLike) => {
		preferredUrl: string
		assetUrl: string
		format: string
	}
	getTripo3DDisplayThumbnailUrl: (settings: Tripo3DNodeSettingsLike) => string
	blobToDataUrl: (blob: Blob) => Promise<string>
	resolveBackendUrl: (value: string) => string
}) => {
	const TRIPO3D_SAFE_MIN_IMAGE_SIDE = 60

	const dataUrlToBlob = (dataUrl: string): Blob => {
		const raw = String(dataUrl || '').trim()
		const m = raw.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/i)
		if (!m) return new Blob([], { type: 'application/octet-stream' })
		const mime = String(m[1] || 'application/octet-stream').trim() || 'application/octet-stream'
		const body = String(m[2] || '')
		try {
			const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
			return new Blob([bytes], { type: mime })
		} catch {
			return new Blob([], { type: mime })
		}
	}

	const extFromMime = (mime: string): string => {
		const m = String(mime || '').toLowerCase()
		if (m.includes('gltf-binary')) return '.glb'
		if (m.includes('png')) return '.png'
		if (m.includes('jpeg') || m.includes('jpg')) return '.jpg'
		if (m.includes('webp')) return '.webp'
		return ''
	}

	const fileFromUrl = async (url: string, fileNameBase?: string): Promise<File> => {
		const resp = await fetch(url)
		if (!resp.ok) throw new Error(`fetch local url failed: ${resp.status}`)
		const blob = await resp.blob()
		const ext = extFromMime(blob.type)
		const fileName = `${fileNameBase || 'resource'}${ext}`
		return new File([blob], fileName, { type: blob.type || 'application/octet-stream' })
	}

	const connectedTripo3DPrompt = (nodeId: string) => {
		const edge = options.getFirstIncomingEdge(nodeId, 'in-text')
		if (!edge) return ''
		return String(options.getTextOutputForNode(String(edge.fromNodeId ?? '')) || '').trim()
	}

	const getNodeResourceId = (node: WorkflowNode): string => {
		const settings = node as unknown as Record<string, unknown>
		const id = settings.resourceId
		return isString(id) ? id.trim() : ''
	}

	const getNodeTripo3DSettings = (node: WorkflowNode): Record<string, unknown> => {
		if (node.type === 'model3d' && isRecord(node.model3dSettings)) {
			return isRecord(node.model3dSettings.tripo3dModelSettings) ? node.model3dSettings.tripo3dModelSettings : {}
		}
		const settings = (node as unknown as Record<string, unknown>).tripo3dSettings
		return settings && typeof settings === 'object'
			? (settings as unknown as Record<string, unknown>)
			: {}
	}

	const connectedImageOutputUrl = (fromNode: WorkflowNode, fromAnchorId: string) => {
		if (fromNode.type === 'image') return String(options.nodeResourceUrl(fromNode) ?? '').trim()
		if (fromNode.type === 'tripo3d') {
			const settings = getNodeTripo3DSettings(fromNode)
			const effective = options.getTripo3DEffectiveModelSource(settings)
			return String(effective.assetUrl || effective.preferredUrl || '').trim()
		}
		return ''
	}

	const isImageInEdge = (e: WorkflowEdge) => {
		const id = String(e.toAnchorId ?? '').trim()
		return id === 'in-image' || id === 'in-resource' || id === 'in-0' || /^in-image-\d+$/.test(id)
	}

	const connectedTripo3DImageUrls = (nodeId: string) => {
		const incoming = options.getIncomingEdges(nodeId).filter(isImageInEdge)
		return incoming
			.sort((a, b) => String(a.toAnchorId ?? '').localeCompare(String(b.toAnchorId ?? '')))
			.map((edge) => {
				const fromNode = options.store.state.nodesById[String(edge.fromNodeId ?? '')]
				if (!fromNode) return ''
				return connectedImageOutputUrl(fromNode, String(edge.fromAnchorId ?? ''))
			})
			.filter((url): url is string => !!url)
	}

	const connectedTripo3DImageInputs = (nodeId: string) => {
		const incoming = options.getIncomingEdges(nodeId).filter(isImageInEdge)
		return incoming
			.sort((a, b) => String(a.toAnchorId ?? '').localeCompare(String(b.toAnchorId ?? '')))
			.map((edge) => {
				const fromNode = options.store.state.nodesById[String(edge.fromNodeId ?? '')]
				if (!fromNode) return null
				const fromAnchorId = String(edge.fromAnchorId ?? '')
				return {
					fromNode,
					fromAnchorId,
					url: connectedImageOutputUrl(fromNode, fromAnchorId)
				}
			})
			.filter((item): item is { fromNode: WorkflowNode; fromAnchorId: string; url: string } => Boolean(item?.url))
	}

	const isPrivateTripo3DHostname = (hostname: string) => {
		const host = String(hostname ?? '')
			.trim()
			.toLowerCase()
		if (!host) return false
		if (host === 'localhost' || host === '::1' || host === '[::1]' || host === '0.0.0.0')
			return true
		if (/^127\./.test(host)) return true
		if (/^10\./.test(host)) return true
		if (/^192\.168\./.test(host)) return true
		const m = /^172\.(\d{1,3})\./.exec(host)
		if (m) {
			const second = Number(m[1])
			if (Number.isFinite(second) && second >= 16 && second <= 31) return true
		}
		return false
	}

	const normalizeTripo3DImageInputValue = async (rawValue: string, label: string) => {
		const value = String(rawValue ?? '').trim()
		if (!value) return ''
		if (value.startsWith('data:')) {
			const blob = await fetch(value).then((res) => res.blob())
			return normalizeTripo3DImageBlob(blob, label)
		}
		if (value.startsWith('blob:')) {
			const file = await fileFromUrl(value, label)
			return normalizeTripo3DImageBlob(file, label)
		}
		if (value.startsWith('file:') || /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('/')) {
			return value
		}
		const resolvedUrl = options.resolveBackendUrl(value)
		try {
			const file = await fileFromUrl(resolvedUrl, label)
			return normalizeTripo3DImageBlob(file, label)
		} catch (err: unknown) {
			console.warn(
				`[Tripo3D] failed to convert local asset URL to data URL: ${value} -> ${resolvedUrl}`,
				err
			)
			if (/^https?:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(value)) {
				return value
			}
			return ''
		}
	}

	const measureBlobImageSize = async (blob: Blob) => {
		const objectUrl = URL.createObjectURL(blob)
		try {
			const img = await new Promise<HTMLImageElement>((resolve, reject) => {
				const image = new Image()
				image.onload = () => resolve(image)
				image.onerror = () => reject(new Error('load image failed'))
				image.src = objectUrl
			})
			return {
				width: Math.max(1, Math.floor(img.naturalWidth || img.width || 1)),
				height: Math.max(1, Math.floor(img.naturalHeight || img.height || 1))
			}
		} finally {
			URL.revokeObjectURL(objectUrl)
		}
	}

	const padImageBlobToMinSize = async (blob: Blob, minSide = TRIPO3D_SAFE_MIN_IMAGE_SIDE) => {
		const bitmap = typeof createImageBitmap === 'function' ? await createImageBitmap(blob) : null
		const width =
			Math.max(1, Math.floor(bitmap?.width || 0)) || (await measureBlobImageSize(blob)).width
		const height =
			Math.max(1, Math.floor(bitmap?.height || 0)) || (await measureBlobImageSize(blob)).height
		const targetWidth = Math.max(minSide, width)
		const targetHeight = Math.max(minSide, height)
		if (targetWidth === width && targetHeight === height) {
			if (bitmap && typeof bitmap.close === 'function') bitmap.close()
			return { blob, expanded: false, width, height, targetWidth, targetHeight }
		}

		const offsetX = Math.floor((targetWidth - width) / 2)
		const offsetY = Math.floor((targetHeight - height) / 2)
		let nextBlob: Blob | null = null

		if (typeof OffscreenCanvas !== 'undefined' && bitmap) {
			const canvas = new OffscreenCanvas(targetWidth, targetHeight)
			const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null
			if (!ctx) throw new Error('create offscreen canvas context failed')
			ctx.clearRect(0, 0, targetWidth, targetHeight)
			ctx.drawImage(bitmap, offsetX, offsetY, width, height)
			nextBlob = await (canvas as unknown as { convertToBlob: (options?: { type?: string; quality?: number }) => Promise<Blob> }).convertToBlob({ type: 'image/png' })
		} else {
			const objectUrl = URL.createObjectURL(blob)
			try {
				const image = await new Promise<HTMLImageElement>((resolve, reject) => {
					const img = new Image()
					img.onload = () => resolve(img)
					img.onerror = () => reject(new Error('load image failed'))
					img.src = objectUrl
				})
				const canvas = document.createElement('canvas')
				canvas.width = targetWidth
				canvas.height = targetHeight
				const ctx = canvas.getContext('2d')
				if (!ctx) throw new Error('create canvas context failed')
				ctx.clearRect(0, 0, targetWidth, targetHeight)
				ctx.drawImage(image, offsetX, offsetY, width, height)
				nextBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
			} finally {
				URL.revokeObjectURL(objectUrl)
			}
		}

		if (bitmap && typeof bitmap.close === 'function') bitmap.close()
		if (!nextBlob) throw new Error('expand image on canvas failed')
		return { blob: nextBlob, expanded: true, width, height, targetWidth, targetHeight }
	}

	const normalizeTripo3DImageBlob = async (blob: Blob, label: string) => {
		const padded = await padImageBlobToMinSize(blob, TRIPO3D_SAFE_MIN_IMAGE_SIDE)
		if (padded.expanded) {
			console.info(
				`[Tripo3D] auto-expanded reference image "${label}" from ${padded.width}x${padded.height} to ${padded.targetWidth}x${padded.targetHeight}`
			)
		}
		return options.blobToDataUrl(padded.blob)
	}

	const buildTripo3DImageInputFromNode = async (fromNode: WorkflowNode, fromAnchorId: string) => {
		const rawUrl = connectedImageOutputUrl(fromNode, fromAnchorId)
		if (!rawUrl) return ''

		const nameBase =
			String(
				fromNode.alias ??
					fromNode.title ??
					'tripo3d_ref'
			).trim() || 'tripo3d_ref'

		return normalizeTripo3DImageInputValue(rawUrl, nameBase)
	}

	const buildTripo3DModelInputFromNode = async (fromNode: WorkflowNode) => {
		if (fromNode.type === 'tripo3d') {
			const settings = getNodeTripo3DSettings(fromNode)
			const effective = options.getTripo3DEffectiveModelSource(settings)
			const sourceUrl = String(effective.assetUrl || effective.preferredUrl || '').trim()
			return {
				modelUrl: sourceUrl || '',
				sourceName: `tripo3d_${fromNode.id}.${effective.format}`
			}
		}

		if (fromNode.type === 'model3d') {
			const nodeSettings = fromNode as unknown as Record<string, unknown>
			const modelSettings = isRecord(nodeSettings.model3dSettings)
				? nodeSettings.model3dSettings
				: {}
			const rawSource = String(modelSettings.modelAssetUrl ?? modelSettings.modelUrl ?? '').trim()
			const format = modelSettings.modelFormat === 'gltf' ? 'gltf' : 'glb'
			return {
				modelUrl: rawSource || '',
				sourceName:
					String(modelSettings.modelSourceName ?? '').trim() || `model_${fromNode.id}.${format}`
			}
		}

		return null
	}

	const connectedTripo3DModelInput = async (nodeId: string) => {
		const edge = options.getFirstIncomingEdge(nodeId, 'in-model')
		if (!edge) return null
		const fromNode = options.store.state.nodesById[String(edge.fromNodeId ?? '')]
		if (!fromNode) return null
		return buildTripo3DModelInputFromNode(fromNode)
	}

	const isModelOutEdge = (e: WorkflowEdge) =>
		String(e.fromAnchorId ?? '').trim() === 'out-model'

	const hasConnectedTripo3DConsumer = (node: WorkflowNode) => {
		return options.hasOutgoingEdge(node.id, 'out-model')
	}

	return {
		connectedTripo3DPrompt,
		connectedTripo3DImageUrls,
		connectedTripo3DImageInputs,
		normalizeTripo3DImageInputValue,
		buildTripo3DImageInputFromNode,
		buildTripo3DModelInputFromNode,
		connectedTripo3DModelInput,
		hasConnectedTripo3DConsumer
	}
}
