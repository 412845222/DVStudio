export const inferMediaKind = (
	media: { kind?: string; filename?: string; url?: string } | null | undefined
): 'image' | 'video' | 'model3d' | null => {
	if (!media) return null
	const rawKind = String(media.kind ?? '')
		.toLowerCase()
		.trim()
	if (rawKind === 'image' || rawKind === 'video' || rawKind === 'model3d') return rawKind
	const url = String(media.url ?? '').trim()
	let filenameFromQuery = ''
	if (url) {
		try {
			const parsed = new URL(url, window.location.origin)
			filenameFromQuery = decodeURIComponent(
				String(parsed.searchParams.get('filename') ?? '')
			).trim()
		} catch {
			filenameFromQuery = ''
		}
	}
	const ref = `${String(media.filename ?? '')} ${filenameFromQuery} ${url}`.toLowerCase()
	if (/\.(mp4|webm|mov|mkv|avi|gif|m4v|wmv|flv)([?#&]|$)/.test(ref)) return 'video'
	if (/\.(png|jpg|jpeg|webp|bmp|tiff?)([?#&]|$)/.test(ref)) return 'image'
	if (/\.(glb|gltf|fbx|obj|stl|dae|ply|3ds|usdz?|blend|step|iges)([?#&]|$)/.test(ref))
		return 'model3d'
	return null
}

export type ComfyBridgeMedia = {
	kind: 'image' | 'video' | 'model3d'
	url: string
	filename?: string
	nodeId?: string
	subfolder?: string
	type?: string
}

export type ComfyLocalizedOutput = {
	kind: 'image' | 'video' | 'model3d'
	url: string
	filename?: string
	anchorId?: string
	nodeId?: string
	sourcePath?: string
	subfolder?: string
	type?: string
}

export const comfyAnchorNodeIdFromAnchorId = (anchorId: string): string => {
	const raw = String(anchorId || '').trim()
	if (!raw) return ''
	if (raw === 'out') return ''
	if (!raw.startsWith('out-')) return ''
	return raw.slice(4).trim()
}

export const comfyOutputForAnchor = (
	outputs: ComfyLocalizedOutput[],
	anchorId: string,
	expectedKind: 'image' | 'video' | 'model3d'
) => {
	const byAnchorAndKind = outputs.find(
		(media) =>
			String(media?.anchorId ?? '') === anchorId &&
			String(media?.url ?? '').trim() &&
			inferMediaKind(media) === expectedKind
	)
	if (byAnchorAndKind) return byAnchorAndKind

	const byAnchorAny = outputs.find(
		(media) => String(media?.anchorId ?? '') === anchorId && String(media?.url ?? '').trim()
	)
	if (byAnchorAny && inferMediaKind(byAnchorAny) === expectedKind) return byAnchorAny

	return outputs.find(
		(media) => String(media?.url ?? '').trim() && inferMediaKind(media) === expectedKind
	)
}
