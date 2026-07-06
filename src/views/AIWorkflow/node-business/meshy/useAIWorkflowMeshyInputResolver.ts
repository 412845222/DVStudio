import type { WorkflowEdge, WorkflowNode } from '../../../../aiworkflow/types'
import { isString, isRecord } from '../../../../types/utils'
import { t } from '../../../../i18n'
import type { MeshyNodeSettingsLike, ConnectedMeshyImageInput, MeshyStoreLike } from './types'

export const useAIWorkflowMeshyInputResolver = (options: {
	store: MeshyStoreLike
	getFirstIncomingEdge: (nodeId: string, anchorId?: string) => WorkflowEdge | null | undefined
	getIncomingEdges: (nodeId: string, anchorId?: string) => WorkflowEdge[]
	getOutgoingEdges: (nodeId: string, anchorId?: string) => WorkflowEdge[]
	hasOutgoingEdge: (nodeId: string, anchorId: string) => boolean
	getTextOutputForNode: (nodeId: string) => string
	nodeResourceUrl: (node: WorkflowNode) => string | null
	nodeResourceName: (node: WorkflowNode) => string | null
	getMeshyEffectiveImageSource: (settings: MeshyNodeSettingsLike) => {
		preferredUrl: string
		assetUrl: string
	}
	getMeshyEffectiveModelSource: (settings: MeshyNodeSettingsLike) => {
		preferredUrl: string
		assetUrl: string
		format: 'glb' | 'gltf'
	}
	getMeshyDisplayThumbnailUrl: (settings: MeshyNodeSettingsLike) => string
	getSceneDecomposeImageUrl: (fromNode: WorkflowNode, fromAnchorId: string) => string
	getComfyImageUrl: (fromNode: WorkflowNode, fromAnchorId: string) => string
	blobToDataUrl: (blob: Blob) => Promise<string>
	resolveBackendUrl: (value: string) => string
	buildCroppedImageTransferFile: (
		fromNode: WorkflowNode,
		sourceUrl: string,
		fileNameBase: string
	) => Promise<File | null>
	createSceneLayoutPlaceholderModelFile: (nodeId: string) => Promise<{
		file: File
		signature: string
		placeholderId?: string
		placeholderJson?: string
		placeholderName: string
	} | null>
	resolveGeneratedModelTransferSource: (file: File) => Promise<{ transferUrl: string }>
	captureModel3DNodeCanvasPreview: (nodeId: string) => string
}) => {
	const MESHY_SAFE_MIN_IMAGE_SIDE = 60

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
		if (m.includes('gltf+json')) return '.gltf'
		if (m.includes('model/gltf')) return '.gltf'
		if (m.includes('png')) return '.png'
		if (m.includes('jpeg') || m.includes('jpg')) return '.jpg'
		if (m.includes('webp')) return '.webp'
		if (m.includes('gif')) return '.gif'
		if (m.includes('bmp')) return '.bmp'
		if (m.includes('svg')) return '.svg'
		if (m.includes('mp4')) return '.mp4'
		if (m.includes('webm')) return '.webm'
		if (m.includes('quicktime')) return '.mov'
		if (m.includes('ogg')) return '.ogg'
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

	const connectedMeshyPrompt = (nodeId: string) => {
		const edge = options.getFirstIncomingEdge(nodeId, 'in-text')
		if (!edge) return ''
		return String(options.getTextOutputForNode(String(edge.fromNodeId ?? '')) || '').trim()
	}

	const getNodeResourceId = (node: WorkflowNode): string => {
		const settings = node as unknown as Record<string, unknown>
		const id = settings.resourceId
		return isString(id) ? id.trim() : ''
	}

	const getNodeMeshySettings = (node: WorkflowNode): Record<string, unknown> => {
		const settings = node.meshySettings
		return settings && typeof settings === 'object'
			? (settings as unknown as Record<string, unknown>)
			: {}
	}

	const connectedImageOutputUrl = (fromNode: WorkflowNode, fromAnchorId: string) => {
		if (fromNode.type === 'image') return String(options.nodeResourceUrl(fromNode) ?? '').trim()
		if (fromNode.type === 'rotate-image') {
			const inputId = fromNode.inputs?.[0]?.id
			if (!inputId) return ''
			const edge = options.getFirstIncomingEdge(fromNode.id, String(inputId ?? ''))
			if (!edge) return ''
			const upstream = options.store.state.nodesById[edge.fromNodeId]
			if (!upstream) return ''
			const rid = getNodeResourceId(upstream)
			if (rid) {
				const r = options.store.state.resourcesById[rid]
				if (r && String(r.kind ?? '').trim() === 'image') {
					const url = String(r.url ?? '').trim()
					if (url) return url
				}
			}
			if (upstream.type === 'comfyui') {
				const url = String(
					options.getComfyImageUrl(upstream, String(edge.fromAnchorId ?? '')) ?? ''
				).trim()
				if (url) return url
			}
			return ''
		}
		if (fromNode.type === 'meshy') {
			const anchor = String(fromAnchorId ?? '').trim()
			if (/^out-image(?:-\d+)?$/.test(anchor)) {
				const effective = options.getMeshyEffectiveImageSource(getNodeMeshySettings(fromNode))
				return String(effective.assetUrl || effective.preferredUrl || '').trim()
			}
			return ''
		}
		if (fromNode.type === 'scene-decompose') {
			return String(options.getSceneDecomposeImageUrl(fromNode, fromAnchorId) ?? '').trim()
		}
		if (fromNode.type === 'comfyui') {
			return String(options.getComfyImageUrl(fromNode, fromAnchorId) ?? '').trim()
		}
		return ''
	}

	const isImageInEdge = (e: WorkflowEdge) => {
		const id = String(e.toAnchorId ?? '').trim()
		return id === 'in-image' || id === 'in-resource' || id === 'in-0' || /^in-image-\d+$/.test(id)
	}

	const connectedMeshyImageUrls = (nodeId: string) => {
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

	const connectedMeshyImageInputs = (nodeId: string) => {
		const incoming = options.getIncomingEdges(nodeId).filter(isImageInEdge)
		return incoming
			.sort((a, b) => String(a.toAnchorId ?? '').localeCompare(String(b.toAnchorId ?? '')))
			.map((edge) => {
				const fromNode = options.store.state.nodesById[String(edge.fromNodeId ?? '')]
				if (!fromNode) return null
				const fromAnchorId = String(edge.fromAnchorId ?? '')
				return {
					edge,
					fromNode,
					fromAnchorId,
					url: connectedImageOutputUrl(fromNode, fromAnchorId)
				}
			})
			.filter((item): item is ConnectedMeshyImageInput => Boolean(item?.url))
	}

	const blobToMeshyModelDataUrl = async (blob: Blob) => {
		const raw = await options.blobToDataUrl(blob)
		return raw.replace(/^data:[^;,]+(?=;base64,|,)/i, 'data:application/octet-stream')
	}

	const isPrivateMeshyHostname = (hostname: string) => {
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

	const normalizeMeshyModelInputValue = async (rawValue: string, label: string) => {
		const value = String(rawValue ?? '').trim()
		if (!value) return ''
		if (value.startsWith('data:')) {
			const blob = dataUrlToBlob(value)
			return blobToMeshyModelDataUrl(blob)
		}
		if (value.startsWith('blob:')) {
			const file = await fileFromUrl(value, label)
			return blobToMeshyModelDataUrl(file)
		}

		const resolved =
			value.startsWith('http://') || value.startsWith('https://')
				? value
				: options.resolveBackendUrl(value)

		if (resolved.startsWith('dweb://')) {
			try {
				const file = await fileFromUrl(resolved, label)
				return blobToMeshyModelDataUrl(file)
			} catch (err: unknown) {
				console.warn(`[Meshy] failed to convert dweb model URL to data URL: ${resolved}`, err)
				return ''
			}
		}

		if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
			try {
				const parsed = new URL(resolved)
				if (isPrivateMeshyHostname(parsed.hostname)) {
					const file = await fileFromUrl(resolved, label)
					return blobToMeshyModelDataUrl(file)
				}
			} catch {
				// keep resolved url
			}
			return resolved
		}

		return resolved
	}

	const buildMeshyModelInputFromNode = async (fromNode: WorkflowNode, fromAnchorId: string) => {
		if (fromNode.type === 'meshy') {
			const settings = getNodeMeshySettings(fromNode)
			const effective = options.getMeshyEffectiveModelSource(settings)
			const relationSummary = isRecord(settings.meshyRelationSummary)
				? settings.meshyRelationSummary
				: {}
			const inputTaskId = String(
				settings.meshyTaskId ?? relationSummary.effectiveTaskId ?? ''
			).trim()
			const sourceUrl = String(effective.assetUrl || effective.preferredUrl || '').trim()
			return {
				inputTaskId: inputTaskId || undefined,
				modelUrl: sourceUrl
					? await normalizeMeshyModelInputValue(sourceUrl, `meshy_model_${fromNode.id}`)
					: '',
				sourceName: `meshy_${inputTaskId || fromNode.id}.${effective.format}`
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
				inputTaskId: undefined,
				modelUrl: rawSource
					? await normalizeMeshyModelInputValue(rawSource, `model3d_${fromNode.id}`)
					: '',
				sourceName:
					String(modelSettings.modelSourceName ?? '').trim() || `model_${fromNode.id}.${format}`
			}
		}

		if (
			fromNode.type === 'scene-layout' &&
			String(fromAnchorId ?? '').trim() === 'out-selected-placeholder'
		) {
			const generated = await options.createSceneLayoutPlaceholderModelFile(fromNode.id)
			if (!generated) return null
			const transfer = await options.resolveGeneratedModelTransferSource(generated.file)
			return {
				inputTaskId: undefined,
				modelUrl: transfer.transferUrl,
				sourceName: generated.file.name
			}
		}

		return null
	}

	const connectedMeshyModelInput = async (nodeId: string) => {
		const edge = options.getFirstIncomingEdge(nodeId, 'in-model')
		if (!edge) return null
		const fromNode = options.store.state.nodesById[String(edge.fromNodeId ?? '')]
		if (!fromNode) return null
		return buildMeshyModelInputFromNode(fromNode, String(edge.fromAnchorId ?? ''))
	}

	const connectedMeshySourcePreview = (nodeId: string) => {
		const edge = options.getFirstIncomingEdge(nodeId, 'in-model')
		if (!edge) {
			return {
				url: '',
				label: t('tasks.meshy.modelInputNotConnected')
			}
		}
		const fromNodeId = String(edge.fromNodeId ?? '').trim()
		const fromAnchorId = String(edge.fromAnchorId ?? '').trim()
		const fromNode = options.store.state.nodesById[fromNodeId]
		if (!fromNode) {
			return {
				url: '',
				label: t('tasks.meshy.sourceNodeNotExist')
			}
		}

		if (fromNode.type === 'model3d') {
			const sourceName = String(
				fromNode.model3dSettings?.modelSourceName ?? fromNode.alias ?? fromNode.title ?? fromNode.id
			).trim()
			const snapshot = options.captureModel3DNodeCanvasPreview(fromNodeId)
			const displayName = sourceName || fromNodeId
			return {
				url: snapshot,
				label: snapshot
					? t('tasks.meshy.3dNodeRealtimeScreenshot', { name: displayName })
					: t('tasks.meshy.3dNodeConnected', { name: displayName })
			}
		}

		if (fromNode.type === 'meshy') {
			const thumbnail = options.getMeshyDisplayThumbnailUrl(getNodeMeshySettings(fromNode))
			const displayName = String(fromNode.alias ?? fromNode.title ?? fromNode.id).trim() || fromNode.id
			return {
				url: thumbnail,
				label: t('tasks.meshy.sourceMeshyNode', { name: displayName })
			}
		}

		if (fromNode.type === 'scene-layout' && fromAnchorId === 'out-selected-placeholder') {
			const name = String(fromNode.alias ?? fromNode.title ?? fromNode.id).trim() || fromNode.id
			return {
				url: '',
				label: t('tasks.meshy.sourcePlaceholder', { name })
			}
		}

		const displayName = String(fromNode.alias ?? fromNode.title ?? fromNode.id).trim() || fromNode.id
		return {
			url: '',
			label: t('tasks.meshy.sourceNode', { name: displayName })
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

	interface OffscreenCanvasConvertable extends OffscreenCanvas {
		convertToBlob?: (options?: { type?: string; quality?: number }) => Promise<Blob>
	}

	const padImageBlobToMinSize = async (blob: Blob, minSide = MESHY_SAFE_MIN_IMAGE_SIDE) => {
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
			const canvas = new OffscreenCanvas(targetWidth, targetHeight) as OffscreenCanvasConvertable
			const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null
			if (!ctx) throw new Error('create offscreen canvas context failed')
			ctx.clearRect(0, 0, targetWidth, targetHeight)
			ctx.drawImage(bitmap, offsetX, offsetY, width, height)
			if (typeof canvas.convertToBlob === 'function') {
				nextBlob = await canvas.convertToBlob({ type: 'image/png' })
			}
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

	const normalizeMeshyImageBlob = async (blob: Blob, label: string) => {
		const padded = await padImageBlobToMinSize(blob, MESHY_SAFE_MIN_IMAGE_SIDE)
		if (padded.expanded) {
			console.info(
				`[Meshy] auto-expanded reference image "${label}" from ${padded.width}x${padded.height} to ${padded.targetWidth}x${padded.targetHeight}`
			)
		}
		return options.blobToDataUrl(padded.blob)
	}

	const normalizeMeshyImageInputValue = async (rawValue: string, label: string) => {
		const value = String(rawValue ?? '').trim()
		if (!value) return ''
		if (value.startsWith('data:')) {
			const blob = await fetch(value).then((res) => res.blob())
			return normalizeMeshyImageBlob(blob, label)
		}
		if (value.startsWith('blob:')) {
			const file = await fileFromUrl(value, label)
			return normalizeMeshyImageBlob(file, label)
		}
		if (value.startsWith('file:') || /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('/')) {
			return value
		}
		const resolvedUrl = options.resolveBackendUrl(value)
		try {
			const file = await fileFromUrl(resolvedUrl, label)
			return normalizeMeshyImageBlob(file, label)
		} catch (err: unknown) {
			console.warn(
				`[Meshy] failed to convert local asset URL to data URL: ${value} -> ${resolvedUrl}`,
				err
			)
			if (/^https?:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(value)) {
				return value
			}
			return ''
		}
	}

	const buildMeshyImageInputFromNode = async (fromNode: WorkflowNode, fromAnchorId: string) => {
		const rawUrl = connectedImageOutputUrl(fromNode, fromAnchorId)
		if (!rawUrl) return ''

		const nodeSettings = fromNode as unknown as Record<string, unknown>
		const meshySettings = getNodeMeshySettings(fromNode)
		const nameBase =
			String(
				options.nodeResourceName(fromNode) ??
					meshySettings.meshyTaskId ??
					fromNode.alias ??
					fromNode.title ??
					'meshy_ref'
			).trim() || 'meshy_ref'
		void nodeSettings

		if (fromNode.type === 'image') {
			try {
				const croppedFile = await options.buildCroppedImageTransferFile(fromNode, rawUrl, nameBase)
				if (croppedFile) return normalizeMeshyImageBlob(croppedFile, nameBase)
			} catch {
				// fallback below
			}
		}

		return normalizeMeshyImageInputValue(rawUrl, nameBase)
	}

	const isImageOutEdge = (e: WorkflowEdge) =>
		/^out-image(?:-\d+)?$/.test(String(e.fromAnchorId ?? '')) &&
		(() => {
			const toAnchorId = String(e.toAnchorId ?? '').trim()
			return toAnchorId === 'in-image' || toAnchorId === 'in-resource' || toAnchorId === 'in-0' || /^in-image-\d+$/.test(toAnchorId)
		})()

	const hasConnectedMeshyConsumer = (node: WorkflowNode) => {
		const settings = getNodeMeshySettings(node)
		const target = String(settings.meshyTaskTarget ?? '3d')
		if (target === 'image') {
			return options.getOutgoingEdges(node.id).some(isImageOutEdge)
		}
		return options.hasOutgoingEdge(node.id, 'out-model')
	}

	const meshyImageOutputCount = (settings: MeshyNodeSettingsLike) => {
		const record = isRecord(settings) ? settings : {}
		const raw = Number(record.meshyOutputImageCount ?? 1)
		if (!Number.isFinite(raw)) return 1
		return Math.max(1, Math.min(4, Math.floor(raw)))
	}

	const isImageOutputEdge = (e: WorkflowEdge) =>
		/^out-image-(\d+)$/.test(String(e.fromAnchorId ?? '')) &&
		(() => {
			const toAnchorId = String(e.toAnchorId ?? '').trim()
			return toAnchorId === 'in-image' || toAnchorId === 'in-resource' || toAnchorId === 'in-0' || /^in-image-\d+$/.test(toAnchorId)
		})()

	const missingMeshyImageOutputAnchors = (node: WorkflowNode) => {
		const expectedCount = meshyImageOutputCount(node.meshySettings)
		const connected = new Set(
			options
				.getOutgoingEdges(node.id)
				.filter(isImageOutputEdge)
				.map((e) => String(e.fromAnchorId ?? '').trim())
				.filter(Boolean)
		)
		const missing: string[] = []
		for (let i = 1; i <= expectedCount; i += 1) {
			const anchorId = `out-image-${i}`
			if (!connected.has(anchorId)) missing.push(anchorId)
		}
		return missing
	}

	return {
		connectedMeshyPrompt,
		connectedImageOutputUrl,
		connectedMeshyImageUrls,
		connectedMeshyImageInputs,
		normalizeMeshyModelInputValue,
		buildMeshyModelInputFromNode,
		connectedMeshyModelInput,
		connectedMeshySourcePreview,
		normalizeMeshyImageInputValue,
		buildMeshyImageInputFromNode,
		hasConnectedMeshyConsumer,
		meshyImageOutputCount,
		missingMeshyImageOutputAnchors
	}
}
