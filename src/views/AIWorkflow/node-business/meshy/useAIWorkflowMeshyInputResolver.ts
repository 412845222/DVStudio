import type { WorkflowEdge, WorkflowNode } from '../../../../aiworkflow/types'

type ConnectedMeshyImageInput = { edge: WorkflowEdge; fromNode: WorkflowNode; fromAnchorId: string; url: string }

export const useAIWorkflowMeshyInputResolver = (options: {
	store: any
	getFirstIncomingEdge: (nodeId: string, anchorId?: string) => any
	getIncomingEdges: (nodeId: string, anchorId?: string) => any[]
	getOutgoingEdges: (nodeId: string, anchorId?: string) => any[]
	hasOutgoingEdge: (nodeId: string, anchorId: string) => boolean
	getTextOutputForNode: (nodeId: string) => string
	nodeResourceUrl: (node: WorkflowNode) => string | null
	nodeResourceName: (node: WorkflowNode) => string | null
	getMeshyEffectiveImageSource: (settings: Record<string, any> | null | undefined) => {
		preferredUrl: string
		assetUrl: string
	}
	getMeshyEffectiveModelSource: (settings: Record<string, any> | null | undefined) => {
		preferredUrl: string
		assetUrl: string
		format: 'glb' | 'gltf'
	}
	getMeshyDisplayThumbnailUrl: (settings: Record<string, any> | null | undefined) => string
	getSceneDecomposeImageUrl: (fromNode: WorkflowNode, fromAnchorId: string) => string
	getComfyImageUrl: (fromNode: WorkflowNode, fromAnchorId: string) => string
	blobToDataUrl: (blob: Blob) => Promise<string>
	resolveBackendUrl: (value: string) => string
	buildCroppedImageTransferFile: (fromNode: WorkflowNode, sourceUrl: string, fileNameBase: string) => Promise<File | null>
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

	const connectedImageOutputUrl = (fromNode: WorkflowNode, fromAnchorId: string) => {
		if (fromNode.type === 'image') return String(options.nodeResourceUrl(fromNode) ?? '').trim()
		if (fromNode.type === 'rotate-image') {
			const inputId = fromNode.inputs?.[0]?.id
			if (!inputId) return ''
			const edge = options.getFirstIncomingEdge(fromNode.id, String(inputId ?? ''))
			if (!edge) return ''
			const upstream = options.store.state.nodesById[edge.fromNodeId]
			if (!upstream) return ''
			const rid = String((upstream as any).resourceId ?? '').trim()
			if (rid) {
				const r = options.store.state.resourcesById[rid] as any
				if (r && String(r.kind ?? '').trim() === 'image') {
					const url = String(r.url ?? '').trim()
					if (url) return url
				}
			}
			if (upstream.type === 'comfyui') {
				const url = String(options.getComfyImageUrl(upstream, String((edge as any).fromAnchorId ?? '')) ?? '').trim()
				if (url) return url
			}
			return ''
		}
		if (fromNode.type === 'meshy') {
			const anchor = String(fromAnchorId ?? '').trim()
			if (/^out-image(?:-\d+)?$/.test(anchor)) {
				const effective = options.getMeshyEffectiveImageSource(fromNode.meshySettings as any)
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

	const connectedMeshyImageUrls = (nodeId: string) => {
		const incoming = options.getIncomingEdges(nodeId).filter((e: any) => /^in-image-/.test(String(e.toAnchorId ?? '')))
		return incoming
			.sort((a: any, b: any) => String(a.toAnchorId ?? '').localeCompare(String(b.toAnchorId ?? '')))
			.map((edge: any) => {
				const fromNode = options.store.state.nodesById[String(edge.fromNodeId ?? '')]
				if (!fromNode) return ''
				return connectedImageOutputUrl(fromNode, String(edge.fromAnchorId ?? ''))
			})
			.filter((url: string) => !!url)
	}

	const connectedMeshyImageInputs = (nodeId: string) => {
		const incoming = options.getIncomingEdges(nodeId).filter((e: any) => /^in-image-/.test(String(e.toAnchorId ?? '')))
		return incoming
			.sort((a: any, b: any) => String(a.toAnchorId ?? '').localeCompare(String(b.toAnchorId ?? '')))
			.map((edge: any) => {
				const fromNode = options.store.state.nodesById[String(edge.fromNodeId ?? '')]
				if (!fromNode) return null
				const fromAnchorId = String(edge.fromAnchorId ?? '')
				return {
					edge,
					fromNode,
					fromAnchorId,
					url: connectedImageOutputUrl(fromNode, fromAnchorId),
				}
			})
			.filter((item): item is ConnectedMeshyImageInput => Boolean(item?.url))
	}

	const blobToMeshyModelDataUrl = async (blob: Blob) => {
		const raw = await options.blobToDataUrl(blob)
		return raw.replace(/^data:[^;,]+(?=;base64,|,)/i, 'data:application/octet-stream')
	}

	const isPrivateMeshyHostname = (hostname: string) => {
		const host = String(hostname ?? '').trim().toLowerCase()
		if (!host) return false
		if (host === 'localhost' || host === '::1' || host === '[::1]' || host === '0.0.0.0') return true
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

		const resolved = value.startsWith('http://') || value.startsWith('https://')
			? value
			: options.resolveBackendUrl(value)

		// dweb:// 或私有主机的 http:// URL → 远程服务无法访问，必须转换为 base64
		if (resolved.startsWith('dweb://')) {
			try {
				const file = await fileFromUrl(resolved, label)
				return blobToMeshyModelDataUrl(file)
			} catch (err: any) {
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
			const settings = fromNode.meshySettings ?? {}
			const effective = options.getMeshyEffectiveModelSource(settings)
			const inputTaskId = String(settings.meshyTaskId ?? settings.meshyRelationSummary?.effectiveTaskId ?? '').trim()
			const sourceUrl = String(effective.assetUrl || effective.preferredUrl || '').trim()
			return {
				inputTaskId: inputTaskId || undefined,
				modelUrl: sourceUrl ? await normalizeMeshyModelInputValue(sourceUrl, `meshy_model_${fromNode.id}`) : '',
				sourceName: `meshy_${inputTaskId || fromNode.id}.${effective.format}`,
			}
		}

		if (fromNode.type === 'model3d') {
			const settings = fromNode.model3dSettings ?? {}
			const rawSource = String(settings.modelAssetUrl ?? settings.modelUrl ?? '').trim()
			const format = settings.modelFormat === 'gltf' ? 'gltf' : 'glb'
			return {
				inputTaskId: undefined,
				modelUrl: rawSource ? await normalizeMeshyModelInputValue(rawSource, `model3d_${fromNode.id}`) : '',
				sourceName: String(settings.modelSourceName ?? '').trim() || `model_${fromNode.id}.${format}`,
			}
		}

		if (fromNode.type === 'scene-layout' && String(fromAnchorId ?? '').trim() === 'out-selected-placeholder') {
			const generated = await options.createSceneLayoutPlaceholderModelFile(fromNode.id)
			if (!generated) return null
			const transfer = await options.resolveGeneratedModelTransferSource(generated.file)
			return {
				inputTaskId: undefined,
				modelUrl: transfer.transferUrl,
				sourceName: generated.file.name,
			}
		}

		return null
	}

	const connectedMeshyModelInput = async (nodeId: string) => {
		const edge = options.getFirstIncomingEdge(nodeId, 'in-model')
		if (!edge) return null
		const fromNode = options.store.state.nodesById[String((edge as any).fromNodeId ?? '')]
		if (!fromNode) return null
		return buildMeshyModelInputFromNode(fromNode, String((edge as any).fromAnchorId ?? ''))
	}

	const connectedMeshySourcePreview = (nodeId: string) => {
		const edge = options.getFirstIncomingEdge(nodeId, 'in-model')
		if (!edge) {
			return {
				url: '',
				label: '未连接模型输入锚点 in-model',
			}
		}
		const fromNodeId = String((edge as any).fromNodeId ?? '').trim()
		const fromAnchorId = String((edge as any).fromAnchorId ?? '').trim()
		const fromNode = options.store.state.nodesById[fromNodeId]
		if (!fromNode) {
			return {
				url: '',
				label: '来源节点不存在',
			}
		}

		if (fromNode.type === 'model3d') {
			const sourceName = String(fromNode.model3dSettings?.modelSourceName ?? fromNode.alias ?? fromNode.title ?? fromNode.id).trim()
			const snapshot = options.captureModel3DNodeCanvasPreview(fromNodeId)
			return {
				url: snapshot,
				label: snapshot
					? `3D 节点实时截图：${sourceName || fromNodeId}`
					: `3D 节点已连接：${sourceName || fromNodeId}`,
			}
		}

		if (fromNode.type === 'meshy') {
			const thumbnail = options.getMeshyDisplayThumbnailUrl(fromNode.meshySettings ?? null)
			return {
				url: thumbnail,
				label: `来源 Meshy 节点：${String(fromNode.alias ?? fromNode.title ?? fromNode.id).trim() || fromNode.id}`,
			}
		}

		if (fromNode.type === 'scene-layout' && fromAnchorId === 'out-selected-placeholder') {
			const name = String(fromNode.alias ?? fromNode.title ?? fromNode.id).trim() || fromNode.id
			return {
				url: '',
				label: `来源占位体：${name}`,
			}
		}

		return {
			url: '',
			label: `来源节点：${String(fromNode.alias ?? fromNode.title ?? fromNode.id).trim() || fromNode.id}`,
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
				height: Math.max(1, Math.floor(img.naturalHeight || img.height || 1)),
			}
		} finally {
			URL.revokeObjectURL(objectUrl)
		}
	}

	const padImageBlobToMinSize = async (blob: Blob, minSide = MESHY_SAFE_MIN_IMAGE_SIDE) => {
		const bitmap = typeof createImageBitmap === 'function' ? await createImageBitmap(blob) : null
		const width = Math.max(1, Math.floor(bitmap?.width || 0)) || (await measureBlobImageSize(blob)).width
		const height = Math.max(1, Math.floor(bitmap?.height || 0)) || (await measureBlobImageSize(blob)).height
		const targetWidth = Math.max(minSide, width)
		const targetHeight = Math.max(minSide, height)
		if (targetWidth === width && targetHeight === height) {
			if (bitmap && typeof (bitmap as any).close === 'function') (bitmap as any).close()
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
			nextBlob = await (canvas as any).convertToBlob({ type: 'image/png' })
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

		if (bitmap && typeof (bitmap as any).close === 'function') (bitmap as any).close()
		if (!nextBlob) throw new Error('expand image on canvas failed')
		return { blob: nextBlob, expanded: true, width, height, targetWidth, targetHeight }
	}

	const normalizeMeshyImageBlob = async (blob: Blob, label: string) => {
		const padded = await padImageBlobToMinSize(blob, MESHY_SAFE_MIN_IMAGE_SIDE)
		if (padded.expanded) {
			console.info(
				`[Meshy] auto-expanded reference image "${label}" from ${padded.width}x${padded.height} to ${padded.targetWidth}x${padded.targetHeight}`,
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
		// dweb://、http(s):// 等远程/本地服务URL → 统一抓取并转为data URL
		// 注意：远端 AI 服务（如火山引擎 Ark）无法访问 localhost/dweb 协议URL，
		// 必须转为 base64/data URL 才能被服务正确识别
		const resolvedUrl = options.resolveBackendUrl(value)
		try {
			const file = await fileFromUrl(resolvedUrl, label)
			// 始终转换为data URL，确保远端服务可访问
			return normalizeMeshyImageBlob(file, label)
		} catch (err: any) {
			console.warn(`[Meshy] failed to convert local asset URL to data URL: ${value} -> ${resolvedUrl}`, err)
			// 回退：尝试直接返回原始 URL（只用于已公开可访问的 http/https URL）
			if (/^https?:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(value)) {
				return value
			}
			return ''
		}
	}

	const buildMeshyImageInputFromNode = async (fromNode: WorkflowNode, fromAnchorId: string) => {
		const rawUrl = connectedImageOutputUrl(fromNode, fromAnchorId)
		if (!rawUrl) return ''

		const nameBase = String(
			options.nodeResourceName(fromNode) ??
			(fromNode as any)?.meshySettings?.meshyTaskId ??
			fromNode.alias ??
			fromNode.title ??
			'meshy_ref',
		).trim() || 'meshy_ref'

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

	const hasConnectedMeshyConsumer = (node: WorkflowNode) => {
		const target = String(node.meshySettings?.meshyTaskTarget ?? '3d')
		if (target === 'image') {
			return options.getOutgoingEdges(node.id).some(
				(e: any) =>
					e &&
					/^out-image(?:-\d+)?$/.test(String(e.fromAnchorId ?? '')) &&
					(() => {
						const toAnchorId = String(e.toAnchorId ?? '')
						return toAnchorId === 'in-image' || toAnchorId === 'in-resource'
					})(),
			)
		}
		return options.hasOutgoingEdge(node.id, 'out-model')
	}

	const meshyImageOutputCount = (settings: Record<string, any> | null | undefined) => {
		const raw = Number((settings as any)?.meshyOutputImageCount ?? 1)
		if (!Number.isFinite(raw)) return 1
		return Math.max(1, Math.min(4, Math.floor(raw)))
	}

	const missingMeshyImageOutputAnchors = (node: WorkflowNode) => {
		const expectedCount = meshyImageOutputCount(node.meshySettings as any)
		const connected = new Set(
			options.getOutgoingEdges(node.id)
				.filter(
					(e: any) =>
						e &&
						/^out-image-(\d+)$/.test(String(e.fromAnchorId ?? '')) &&
						(() => {
							const toAnchorId = String(e.toAnchorId ?? '')
							return toAnchorId === 'in-image' || toAnchorId === 'in-resource'
						})(),
				)
				.map((e: any) => String(e.fromAnchorId ?? '').trim())
				.filter(Boolean),
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
		missingMeshyImageOutputAnchors,
	}
}