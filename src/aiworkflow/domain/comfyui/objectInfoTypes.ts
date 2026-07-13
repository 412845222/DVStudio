export type ComfySocketType =
	| 'MODEL'
	| 'CLIP'
	| 'VAE'
	| 'CONDITIONING'
	| 'LATENT'
	| 'IMAGE'
	| 'MASK'
	| 'SAMPLER'
	| 'SIGMAS'
	| 'AUDIO'
	| 'VIDEO'
	| 'CLIP_VISION_OUTPUT'
	| 'CONTROL_NET'
	| 'STYLE_MODEL'
	| 'CLIP_VISION'
	| 'GLIGEN'
	| 'UPSCALE_MODEL'
	| 'INSTANTID'
	| 'FACEANALYSIS'
	| string

export type ComfyWidgetInputDef = [
	type: string | string[],
	config?: {
		default?: unknown
		min?: number
		max?: number
		step?: number
		[key: string]: unknown
	}
]

export type ComfyObjectInfoInput = {
	required?: Record<string, ComfyWidgetInputDef | [ComfySocketType]>
	optional?: Record<string, ComfyWidgetInputDef | [ComfySocketType]>
	hidden?: Record<string, unknown>
}

export type ComfyObjectInfoOutput = [
	name: string,
	type: ComfySocketType,
	config?: Record<string, unknown>
]

export type ComfyObjectInfoEntry = {
	input: ComfyObjectInfoInput
	output: ComfySocketType[]
	output_is_list?: boolean[]
	output_name?: string[]
	output_tooltips?: string[]
	name: string
	display_name: string
	description: string
	category: string
	output_node?: boolean
	python_module?: string
}

export type ComfyObjectInfo = Record<string, ComfyObjectInfoEntry>

export type ComfySystemStats = {
	system?: {
		comfyui_version?: string
		os?: string
		python_version?: string
		pytorch_version?: string
		embedded_python?: boolean
		[key: string]: unknown
	}
	devices?: Array<{
		name: string
		type?: string
		index?: number
		vram_total?: number
		vram_free?: number
		torch_vram_total?: number
		torch_vram_free?: number
		[key: string]: unknown
	}>
}

export const SOCKET_TYPE_SET = new Set<ComfySocketType>([
	'MODEL',
	'CLIP',
	'VAE',
	'CONDITIONING',
	'LATENT',
	'IMAGE',
	'MASK',
	'SAMPLER',
	'SIGMAS',
	'AUDIO',
	'VIDEO',
	'CLIP_VISION_OUTPUT',
	'CONTROL_NET',
	'STYLE_MODEL',
	'CLIP_VISION',
	'GLIGEN',
	'UPSCALE_MODEL',
	'INSTANTID',
	'FACEANALYSIS'
])

export function isSocketTypeDef(def: unknown): def is [ComfySocketType] {
	if (!Array.isArray(def) || def.length === 0) return false
	const t = def[0]
	return typeof t === 'string' && SOCKET_TYPE_SET.has(t.toUpperCase())
}

export function isWidgetDef(def: unknown): def is ComfyWidgetInputDef {
	if (!Array.isArray(def) || def.length === 0) return false
	const t = def[0]
	if (Array.isArray(t)) return true
	if (typeof t === 'string') {
		return !SOCKET_TYPE_SET.has(t.toUpperCase())
	}
	return false
}

export function getObjectInfoNodeTypes(objectInfo: unknown): Set<string> {
	if (!objectInfo || typeof objectInfo !== 'object') return new Set()
	return new Set(Object.keys(objectInfo as Record<string, unknown>))
}

export function extractInputDefs(info: unknown): Record<string, ComfyWidgetInputDef | [ComfySocketType]> {
	if (!info || typeof info !== 'object') return {}
	const entry = info as ComfyObjectInfoEntry
	const out: Record<string, ComfyWidgetInputDef | [ComfySocketType]> = {}
	if (entry.input?.required) {
		for (const [k, v] of Object.entries(entry.input.required)) out[k] = v
	}
	if (entry.input?.optional) {
		for (const [k, v] of Object.entries(entry.input.optional)) out[k] = v
	}
	return out
}

export function extractCheckpointsFromObjectInfo(objectInfo: unknown): string[] {
	if (!objectInfo || typeof objectInfo !== 'object') return []
	const ckptLoader = (objectInfo as Record<string, unknown>)['CheckpointLoaderSimple']
	if (!ckptLoader || typeof ckptLoader !== 'object') return []
	const input = (ckptLoader as ComfyObjectInfoEntry).input
	if (!input?.required?.ckpt_name) return []
	const def = input.required.ckpt_name
	if (Array.isArray(def) && Array.isArray(def[0])) {
		return (def[0] as string[]).filter((v): v is string => typeof v === 'string')
	}
	return []
}

export function detectMediaTypeFromObjectInfo(
	entry: unknown,
	nodeType: string
): 'image' | 'video' | 'generic' {
	if (!entry || typeof entry !== 'object') {
		const t = nodeType.toLowerCase()
		if (/save\s*video|load\s*video|savevideo|loadvideo|video/i.test(t)) return 'video'
		if (/save\s*image|load\s*image|preview\s*image|saveimage|loadimage|previewimage/i.test(t)) return 'image'
		return 'generic'
	}
	const info = entry as ComfyObjectInfoEntry
	const outputs = info.output || []
	const outputStr = outputs.join(' ').toLowerCase()
	if (/\bvideo\b/.test(outputStr)) return 'video'
	if (/\bimage\b/.test(outputStr)) return 'image'
	if (info.output_node === true) {
		const t = nodeType.toLowerCase()
		if (/video/i.test(t)) return 'video'
		return 'image'
	}
	const t = nodeType.toLowerCase()
	if (/save\s*video|load\s*video|savevideo|loadvideo/i.test(t)) return 'video'
	if (/save\s*image|load\s*image|preview\s*image|saveimage|loadimage|previewimage/i.test(t)) return 'image'
	return 'generic'
}
