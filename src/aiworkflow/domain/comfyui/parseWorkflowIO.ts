import type { WorkflowAnchorSpec } from '../../types'
import { isString, isNumber, isRecord, isArray, hasKey } from '../../../types/utils'
import type { ComfyObjectInfo } from './objectInfoTypes'
import {
	detectMediaTypeFromObjectInfo,
	extractInputDefs,
	isWidgetDef
} from './objectInfoTypes'

export type ComfyInputRequirement = {
	min: number
	max: number
	nodeIds: string[]
}

export type ComfyTextRequirement = {
	required: boolean
	nodeIds: string[]
}

export type ComfyInputRequirements = {
	images: ComfyInputRequirement
	videos: ComfyInputRequirement
	models: ComfyInputRequirement
	positivePrompt: ComfyTextRequirement
	negativePrompt: ComfyTextRequirement
}

export type ComfyWorkflowIO = {
	inputs: Array<Pick<WorkflowAnchorSpec, 'id' | 'label' | 'mediaType'>>
	outputs: Array<Pick<WorkflowAnchorSpec, 'id' | 'label' | 'mediaType'>>
	warnings: string[]
	inputRequirements: ComfyInputRequirements
}

type ComfyNodeLike = Record<string, unknown>

const normalizeNodeId = (id: unknown): string => {
	if (id == null) return ''
	const s = String(id).trim()
	if (!s || s === 'undefined' || s === 'null' || s === 'NaN') return ''
	return s
}

const getNodeText = (node: ComfyNodeLike): string => {
	const type = hasKey(node, 'type') && isString(node.type) ? node.type : ''
	const title = hasKey(node, 'title') && isString(node.title) ? node.title : ''
	return `${type} ${title}`.toLowerCase()
}

const getNodeType = (node: unknown): string => {
	const n = isRecord(node) ? node : {}
	return hasKey(n, 'type') && isString(n.type) ? n.type : ''
}

const getNodePos = (node: unknown): [number, number] => {
	const n = isRecord(node) ? node : {}
	const pos = hasKey(n, 'pos') && isArray(n.pos) ? n.pos : null
	if (pos && pos.length >= 2) {
		const x = Number(pos[0])
		const y = Number(pos[1])
		if (Number.isFinite(x) && Number.isFinite(y)) return [x, y]
	}
	return [0, 0]
}

const detectComfyNodeMediaType = (node: unknown): WorkflowAnchorSpec['mediaType'] => {
	const n = isRecord(node) ? node : {}
	const text = getNodeText(n)
	if (/save\s*video|load\s*video|savevideo|loadvideo/.test(text)) return 'video'
	if (/save\s*image|load\s*image|preview\s*image|saveimage|loadimage|previewimage/.test(text))
		return 'image'
	if (/save\s*3d|load\s*3d|save.*glb|load.*glb|save.*fbx|load.*fbx|save.*gltf|load.*gltf|save.*obj|load.*obj/.test(text))
		return 'model3d'
	return 'generic'
}

const detectMediaTypeFromPorts = (node: unknown): WorkflowAnchorSpec['mediaType'] => {
	const n = isRecord(node) ? node : {}
	const outputs = isArray(n.outputs) ? n.outputs : []
	const inputs = isArray(n.inputs) ? n.inputs : []
	const tokens = [
		...outputs.map((o: unknown) => {
			if (isRecord(o) && hasKey(o, 'type') && isString(o.type)) return o.type
			return ''
		}),
		...inputs.map((i: unknown) => {
			if (isRecord(i) && hasKey(i, 'type') && isString(i.type)) return i.type
			return ''
		})
	]
		.join(' ')
		.toLowerCase()

	if (/\b(model3d|3d|glb|gltf|fbx|obj|mesh)\b/.test(tokens)) return 'model3d'
	if (/\b(video|audio\s*video|gif)\b/.test(tokens)) return 'video'
	if (/\bimage\b/.test(tokens)) return 'image'
	return detectComfyNodeMediaType(node)
}

const getNodeIdStr = (node: unknown): string => {
	const n = isRecord(node) ? node : {}
	return normalizeNodeId(n.id)
}

const getLinkNodeIdStr = (link: unknown, ...keys: string[]): string | null => {
	if (isRecord(link)) {
		for (const key of keys) {
			if (hasKey(link, key)) {
				const val = link[key]
				const s = normalizeNodeId(val)
				if (s) return s
			}
		}
	}
	return null
}

const getIncomingOutgoingCount = (workflow: unknown) => {
	const incoming = new Map<string, number>()
	const outgoing = new Map<string, number>()
	const wf = isRecord(workflow) ? workflow : {}
	const links = isArray(wf.links) ? wf.links : []
	for (const link of links) {
		if (isArray(link) && link.length >= 5) {
			const from = normalizeNodeId(link[1])
			const to = normalizeNodeId(link[3])
			if (from) outgoing.set(from, (outgoing.get(from) ?? 0) + 1)
			if (to) incoming.set(to, (incoming.get(to) ?? 0) + 1)
			continue
		}
		if (isRecord(link)) {
			const from = getLinkNodeIdStr(link, 'origin_id', 'from', 'from_node_id')
			const to = getLinkNodeIdStr(link, 'target_id', 'to', 'to_node_id')
			if (from) outgoing.set(from, (outgoing.get(from) ?? 0) + 1)
			if (to) incoming.set(to, (incoming.get(to) ?? 0) + 1)
		}
	}
	return { incoming, outgoing }
}

const isFileInputNode = (nodeType: string, objectInfo: ComfyObjectInfo | null): 'image' | 'video' | 'model3d' | null => {
	if (!objectInfo) return null
	const entry = objectInfo[nodeType]
	if (!entry) return null
	const inputDefs = extractInputDefs(entry)
	const nameLower = nodeType.toLowerCase()
	let detected: 'image' | 'video' | 'model3d' | null = null

	if (/video|vhs/.test(nameLower)) detected = 'video'
	else if (/3d|glb|gltf|fbx|obj|model|mesh/.test(nameLower)) detected = 'model3d'
	else if (/image|load/.test(nameLower)) detected = 'image'

	for (const [name, def] of Object.entries(inputDefs)) {
		if (isWidgetDef(def)) {
			const paramLower = name.toLowerCase()
			if (/video|vhs/.test(paramLower)) {
				detected = 'video'
				break
			}
			if (/model|3d|glb|gltf|fbx|obj|mesh/.test(paramLower)) {
				detected = 'model3d'
				break
			}
			if (/image|img|photo/.test(paramLower)) {
				detected = 'image'
			}
		}
	}
	return detected
}

const isOutputNodeByObjectInfo = (nodeType: string, objectInfo: ComfyObjectInfo | null): boolean => {
	if (!objectInfo) return false
	const entry = objectInfo[nodeType]
	return entry?.output_node === true
}

const sortNodesByPosition = <T extends { pos: [number, number] }>(nodes: T[]): T[] => {
	return [...nodes].sort((a, b) => {
		if (a.pos[0] !== b.pos[0]) return a.pos[0] - b.pos[0]
		return a.pos[1] - b.pos[1]
	})
}

export const parseComfyWorkflowIO = (
	workflow: unknown,
	objectInfo: ComfyObjectInfo | null = null
): ComfyWorkflowIO => {
	const wf = isRecord(workflow) ? workflow : {}
	const nodes = isArray(wf.nodes) ? wf.nodes : []
	const { incoming, outgoing } = getIncomingOutgoingCount(workflow)
	const warnings: string[] = []

	const FRONTEND_ONLY = new Set([
		'MarkdownNote', 'Note', 'Reroute', 'PrimitiveNode',
		'GroupNode', 'SubgraphNode', 'ComfyNote', 'NoteNode',
		'NodeNote', 'Comment', 'Annotation', 'Label',
		'WidgetNode', 'Converter', 'RelayNode', 'RerouteNode',
		'FrontendNode', 'VirtualNode', 'PlaceholderNode',
		'QuickNodes', 'TextNote', 'StickyNote'
	])

	const isImageInputType = (nodeType: string): boolean => {
		const t = nodeType.toLowerCase()
		return /loadimage|load_image|loadimagefromurl|load_image_mask|loadimagemask/.test(t)
	}

	const isVideoInputType = (nodeType: string): boolean => {
		const t = nodeType.toLowerCase()
		return /vhs_loadvideo|loadvideo|load_video|videoload|loadvideoupload/.test(t)
	}

	const isModelInputType = (nodeType: string): boolean => {
		const t = nodeType.toLowerCase()
		return /loadglb|load_gltf|load3d|load_3d|loadmodel|load_model|trellisload|loadmesh|load_mesh|loadfbx|loadobj/.test(t)
	}

	const isPositiveTextNode = (title: string): boolean => {
		const tl = title.toLowerCase()
		return !tl.includes('negative') && !tl.includes('负')
	}

	const imageNodes: Array<{ nodeId: string; classType: string; title: string; inputKey: string; pos: [number, number] }> = []
	const videoNodes: Array<{ nodeId: string; classType: string; title: string; inputKey: string; pos: [number, number] }> = []
	const modelNodes: Array<{ nodeId: string; classType: string; title: string; inputKey: string; pos: [number, number] }> = []
	const positiveTextNodes: Array<{ nodeId: string; title: string; pos: [number, number] }> = []
	const negativeTextNodes: Array<{ nodeId: string; title: string; pos: [number, number] }> = []

	for (const node of nodes) {
		if (!isRecord(node)) continue
		const nodeType = getNodeType(node)
		if (!nodeType || FRONTEND_ONLY.has(nodeType)) continue
		const idStr = getNodeIdStr(node)
		if (!idStr) continue
		const pos = getNodePos(node)
		const titleVal = node.title
		const title = isString(titleVal) ? titleVal : (nodeType || '')
		const text = getNodeText(node)
		const inCount = incoming.get(idStr) ?? 0

		if (nodeType === 'CLIPTextEncode') {
			if (isPositiveTextNode(title)) {
				positiveTextNodes.push({ nodeId: idStr, title, pos })
			} else {
				negativeTextNodes.push({ nodeId: idStr, title, pos })
			}
			continue
		}

		let detectedKind: 'image' | 'video' | 'model3d' | null = null
		let inputKey = 'image'

		if (isImageInputType(nodeType)) {
			detectedKind = 'image'
			inputKey = 'image'
		} else if (isVideoInputType(nodeType)) {
			detectedKind = 'video'
			inputKey = 'video'
		} else if (isModelInputType(nodeType)) {
			detectedKind = 'model3d'
			inputKey = 'model'
		} else if (objectInfo) {
			const fi = isFileInputNode(nodeType, objectInfo)
			if (fi) {
				detectedKind = fi
				inputKey = fi === 'image' ? 'image' : fi === 'video' ? 'video' : 'model'
			}
		}

		if (!detectedKind && inCount === 0) {
			const mediaType = objectInfo && nodeType
				? detectMediaTypeFromObjectInfo(objectInfo[nodeType], nodeType)
				: detectMediaTypeFromPorts(node)
			const inputsArr = isArray(node.inputs) ? node.inputs : []
			const hasPathLikeWidget = inputsArr.some((i: unknown) => {
				if (!isRecord(i)) return false
				const name = hasKey(i, 'name') && isString(i.name) ? i.name.toLowerCase() : ''
				const widget = hasKey(i, 'widget') ? i.widget : undefined
				return /image|video|file|path|filename|model|glb|gltf|fbx|obj/.test(name) && Boolean(widget)
			})
			if (hasPathLikeWidget) {
				if (mediaType === 'video') {
					detectedKind = 'video'
					inputKey = 'video'
				} else if (mediaType === 'model3d') {
					detectedKind = 'model3d'
					inputKey = 'model'
				} else if (mediaType === 'image' || /image|img|photo/.test(text)) {
					detectedKind = 'image'
					inputKey = 'image'
				}
			}
		}

		if (detectedKind === 'image') {
			imageNodes.push({ nodeId: idStr, classType: nodeType, title, inputKey, pos })
		} else if (detectedKind === 'video') {
			videoNodes.push({ nodeId: idStr, classType: nodeType, title, inputKey, pos })
		} else if (detectedKind === 'model3d') {
			modelNodes.push({ nodeId: idStr, classType: nodeType, title, inputKey, pos })
		}
	}

	const sortedImageNodes = sortNodesByPosition(imageNodes)
	const sortedVideoNodes = sortNodesByPosition(videoNodes)
	const sortedModelNodes = sortNodesByPosition(modelNodes)
	const sortedPositiveText = sortNodesByPosition(positiveTextNodes)
	const sortedNegativeText = sortNodesByPosition(negativeTextNodes)

	const isOutputNode = (node: unknown): boolean => {
		if (!isRecord(node)) return false
		const nodeType = getNodeType(node)
		if (FRONTEND_ONLY.has(nodeType)) return false
		const text = getNodeText(node)
		if (/save\s*image|saveimage|preview\s*image/.test(text)) return true
		if (/save\s*video|savevideo|video\s*combine|vhs/.test(text)) return true
		if (/save\s*3d|export.*model|save.*glb|save.*fbx|preview.*3d|export.*glb|export.*fbx/.test(text)) return true

		if (objectInfo && nodeType && isOutputNodeByObjectInfo(nodeType, objectInfo)) {
			return true
		}

		const idStr = getNodeIdStr(node)
		const outCount = idStr ? (outgoing.get(idStr) ?? 0) : 0
		if (outCount === 0) {
			const mediaType = objectInfo && nodeType
				? detectMediaTypeFromObjectInfo(objectInfo[nodeType], nodeType)
				: detectMediaTypeFromPorts(node)
			if (mediaType === 'image' || mediaType === 'video' || mediaType === 'model3d') return true
		}

		return false
	}

	const outputNodes = nodes.filter((n: unknown) => isOutputNode(n))

	const outputs = [{
		id: 'out',
		label: '输出',
		mediaType: 'generic' as WorkflowAnchorSpec['mediaType']
	}]

	let outputTypeSummary = 'generic'
	const imageOutputCount = outputNodes.filter((n: unknown) => {
		if (!isRecord(n)) return false
		const t = getNodeType(n)
		const text = getNodeText(n)
		const mt = objectInfo && t
			? detectMediaTypeFromObjectInfo(objectInfo[t], t)
			: detectMediaTypeFromPorts(n)
		return mt === 'image' || /save\s*image|saveimage|preview\s*image/.test(text)
	}).length
	const videoOutputCount = outputNodes.filter((n: unknown) => {
		if (!isRecord(n)) return false
		const t = getNodeType(n)
		const text = getNodeText(n)
		const mt = objectInfo && t
			? detectMediaTypeFromObjectInfo(objectInfo[t], t)
			: detectMediaTypeFromPorts(n)
		return mt === 'video' || /save\s*video|savevideo|video\s*combine|vhs/.test(text)
	}).length
	const modelOutputCount = outputNodes.filter((n: unknown) => {
		if (!isRecord(n)) return false
		const t = getNodeType(n)
		const text = getNodeText(n)
		const mt = objectInfo && t
			? detectMediaTypeFromObjectInfo(objectInfo[t], t)
			: detectMediaTypeFromPorts(n)
		return mt === 'model3d' || /save\s*3d|export.*model|save.*glb|export.*glb|save.*fbx|export.*fbx/.test(text)
	}).length

	if (imageOutputCount > 0 && videoOutputCount === 0 && modelOutputCount === 0) {
		outputTypeSummary = 'image'
	} else if (videoOutputCount > 0 && imageOutputCount === 0 && modelOutputCount === 0) {
		outputTypeSummary = 'video'
	} else if (modelOutputCount > 0 && imageOutputCount === 0 && videoOutputCount === 0) {
		outputTypeSummary = 'model3d'
	}

	if (outputTypeSummary !== 'generic') {
		outputs[0].mediaType = outputTypeSummary as WorkflowAnchorSpec['mediaType']
	}

	if (outputNodes.length > 1) {
		warnings.push(
			`检测到 ${outputNodes.length} 个输出节点，工作流执行后将自动导入所有产物。`
		)
	}

	const inputRequirements = {
		images: {
			min: 0,
			max: sortedImageNodes.length,
			nodeIds: sortedImageNodes.map(n => n.nodeId)
		},
		videos: {
			min: 0,
			max: sortedVideoNodes.length,
			nodeIds: sortedVideoNodes.map(n => n.nodeId)
		},
		models: {
			min: 0,
			max: sortedModelNodes.length,
			nodeIds: sortedModelNodes.map(n => n.nodeId)
		},
		positivePrompt: {
			required: sortedPositiveText.length > 0,
			nodeIds: sortedPositiveText.map(n => n.nodeId)
		},
		negativePrompt: {
			required: sortedNegativeText.length > 0,
			nodeIds: sortedNegativeText.map(n => n.nodeId)
		}
	}

	return {
		inputs: [],
		outputs,
		warnings,
		inputRequirements
	}
}
