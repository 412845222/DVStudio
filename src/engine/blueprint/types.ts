export type MediaType =
	| 'generic'
	| 'image'
	| 'video'
	| 'text'
	| 'flow'
	| 'model3d'
	| 'audio'
	| 'meta'
	| 'resource'
export type NodeStatus = 'idle' | 'running' | 'success' | 'error'
export type ResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface PortSpec {
	id: string
	label?: string
	offsetY?: number
	mediaType?: MediaType
	acceptedMediaTypes?: MediaType[]
	multiInput?: boolean
}

export interface BlueprintNodeData {
	id: string
	type: string
	title: string
	subtitle?: string
	alias?: string
	worldX: number
	worldY: number
	width: number
	height: number
	sizeCustomized?: boolean
	inputs: PortSpec[]
	outputs: PortSpec[]
	color?: string
	icon?: string
	selected?: boolean
	status?: 'idle' | 'running' | 'success' | 'error'
	previewContent?: {
		kind: 'text' | 'image' | 'video' | 'model3d' | 'icon'
		text?: string
		imageUrl?: string
		icon?: string
	}
	resourceId?: string
	textValue?: string
	imageSettings?: Record<string, any> | null
	videoSettings?: Record<string, any> | null
	model3dSettings?: Record<string, any> | null
	meshySettings?: Record<string, any> | null
	tripo3dSettings?: Record<string, any> | null
	blenderSettings?: Record<string, any> | null
	storySettings?: Record<string, any> | null
	sceneUnderstandingSettings?: Record<string, any> | null
	sceneLayoutSettings?: Record<string, any> | null
	sceneDecomposeSettings?: Record<string, any> | null
	unrealExportSettings?: Record<string, any> | null
	comfyuiSettings?: Record<string, any> | null
	nodeChatDraft?: string | null
	nodeChatParams?: Record<string, any> | null
	nodeChatSelectedRefs?: any[] | null
	nodeChatVisible?: boolean
	resourcePath?: string | null
	rotatePromptText?: string | null
	textMergeItems?: any[] | null
	branches?: any[] | null
	prompt?: string | null
	createdAt?: number
	[key: string]: any
}

export interface ConnectionData {
	id: string
	fromNodeId: string
	fromAnchorId: string
	toNodeId: string
	toAnchorId: string
	selected?: boolean
	createdAt?: number
}

export interface LegacyResourceData {
	id: string
	kind: string
	name: string
	url: string
	sourcePath?: string | null
	projectRelativePath?: string | null
	size?: number
	localFileKey?: string | null
	relativePath?: string | null
	absolutePath?: string | null
	posterProjectRelativePath?: string | null
	posterUrl?: string
	[key: string]: any
}

export interface LegacySelectionTag {
	key: string
	label: string
	nodeIds: string[]
	color?: string | null
	note?: string | null
	createdAt?: number
	updatedAt?: number
}

export interface LegacyBlueprintData {
	schemaVersion: number
	savedAt?: number
	viewport?: { zoom: number; panX: number; panY: number }
	nodesById: Record<string, BlueprintNodeData>
	nodeOrder: string[]
	edgesById: Record<string, ConnectionData>
	edgeOrder: string[]
	resourcesById: Record<string, LegacyResourceData>
	resourceOrder: string[]
	selectedNodeId?: string | null
	selectedNodeIds?: string[]
	selectionTagsByKey: Record<string, LegacySelectionTag>
	savedSelectionFrames?: SavedSelectionFrameData[]
	nodeCheckboxVisible?: boolean
}

export const CURRENT_SCHEMA_VERSION = 2

export const MIN_ZOOM = 0.2
export const MAX_ZOOM = 6
export const MAX_PAN = 1e7

export function clampZoom(zoom: number): number {
	return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
}

export function clampPan(v: number): number {
	return Math.max(-MAX_PAN, Math.min(MAX_PAN, v))
}

export interface BlueprintData {
	schemaVersion?: number
	viewport: { zoom: number; panX: number; panY: number }
	nodes: BlueprintNodeData[]
	edges: ConnectionData[]
	savedSelectionFrames?: SavedSelectionFrameData[]
	legacyResources?: Record<string, LegacyResourceData>
}

export interface SavedSelectionFrameData {
	id: string
	nodeIds: string[]
	label: string
	createdAt?: number
}

export const PORT_SIZE = 24
export const PORT_INNER_SIZE = 10
export const PORT_CORNER_RADIUS = 2
export const PORT_INNER_CORNER = 3
export const PORT_HOVER_SCALE = 1.08
export const PORT_HIT_RADIUS = 22
export const PORT_GLOW_RADIUS = 14

export const NODE_CORNER_RADIUS = 2
export const NODE_HEADER_HEIGHT = 32
export const NODE_BRACKET_SIZE = 10
export const NODE_BRACKET_WIDTH = 2
export const NODE_BORDER_WIDTH = 1
export const NODE_INNER_PADDING = 12

export const PORT_SPACING = 28
export const PORT_TOP_OFFSET = NODE_HEADER_HEIGHT + 20
export const PORT_MIN_MARGIN_TOP = 16
export const PORT_MIN_MARGIN_BOTTOM = 16

export const GRID_STEP = 80
export const GRID_MAJOR_EVERY = 5

export const MEDIA_TYPE_COLORS: Record<MediaType, string> = {
	generic: '#1f9d84',
	image: '#9b59b6',
	video: '#27ae60',
	text: '#f1c40f',
	flow: '#e67e22',
	model3d: '#3498db',
	audio: '#e91e63',
	meta: '#7f8c8d',
	resource: '#3498db'
}

export const DEFAULT_NODE_SIZES: Record<string, { width: number; height: number }> = {
	base: { width: 240, height: 160 },
	text: { width: 360, height: 320 },
	'text-merge': { width: 420, height: 360 },
	image: { width: 380, height: 520 },
	'rotate-image': { width: 380, height: 520 },
	video: { width: 380, height: 520 },
	story: { width: 480, height: 360 },
	'scene-understanding': { width: 520, height: 680 },
	'scene-layout': { width: 520, height: 720 },
	'scene-decompose': { width: 480, height: 520 },
	comfyui: { width: 520, height: 420 },
	model3d: { width: 420, height: 560 },
	meshy: { width: 480, height: 500 },
	'unreal-export': { width: 480, height: 340 },
	blender: { width: 500, height: 520 },
	'director-console': { width: 420, height: 260 }
}

export const DEFAULT_NODE_PORTS: Record<string, { inputs: PortSpec[]; outputs: PortSpec[] }> = {
	base: {
		inputs: [{ id: 'in-0', label: '入口' }],
		outputs: [{ id: 'out-0', label: '出口' }]
	},
	text: {
		inputs: [
			{
				id: 'in-0',
				label: '多模态输入',
				mediaType: 'generic',
				acceptedMediaTypes: ['text', 'image', 'video', 'model3d', 'audio'],
				multiInput: true
			}
		],
		outputs: [{ id: 'out-0', label: '文本输出', mediaType: 'text' }]
	},
	image: {
		inputs: [
			{
				id: 'in-0',
				label: '多模态输入',
				mediaType: 'generic',
				acceptedMediaTypes: ['text', 'image', 'video', 'model3d', 'audio'],
				multiInput: true
			}
		],
		outputs: [{ id: 'out-image', label: '图片输出', mediaType: 'image' }]
	},
	'rotate-image': {
		inputs: [{ id: 'in-0', label: '图片输入', mediaType: 'image' }],
		outputs: [{ id: 'out-0', label: '旋转图片', mediaType: 'image' }]
	},
	video: {
		inputs: [
			{ id: 'in-text', label: '提示词输入', mediaType: 'text' },
			{ id: 'in-image', label: '参考图输入', multiInput: true, mediaType: 'image' },
			{ id: 'in-video', label: '参考视频输入', multiInput: true, mediaType: 'video' }
		],
		outputs: [
			{ id: 'out-resource', label: '资源输出', mediaType: 'resource' },
			{ id: 'out-video', label: '视频输出', mediaType: 'video' }
		]
	},
	model3d: {
		inputs: [
			{ id: 'in-model', label: '模型输入', mediaType: 'model3d' },
			{ id: 'in-text', label: '提示词', mediaType: 'text' },
			{ id: 'in-image-1', label: '参考图 1', mediaType: 'image' },
			{ id: 'in-image-2', label: '参考图 2', mediaType: 'image' },
			{ id: 'in-image-3', label: '参考图 3', mediaType: 'image' },
			{ id: 'in-image-4', label: '参考图 4', mediaType: 'image' }
		],
		outputs: [
			{ id: 'out-model', label: '模型输出', mediaType: 'model3d' },
			{ id: 'out-image', label: '预览图', mediaType: 'image' }
		]
	},
	'text-merge': {
		inputs: [
			{ id: 'in-0', label: '文本输入1', mediaType: 'text' },
			{ id: 'in-1', label: '文本输入2', mediaType: 'text', multiInput: true }
		],
		outputs: [{ id: 'out-0', label: '合并文本', mediaType: 'text' }]
	},
	story: {
		inputs: [
			{ id: 'in-text', label: '剧情提示', mediaType: 'text' },
			{ id: 'in-image', label: '参考图', mediaType: 'image', multiInput: true }
		],
		outputs: [{ id: 'out-text', label: '剧情输出', mediaType: 'text' }]
	},
	'scene-understanding': {
		inputs: [
			{ id: 'in-image', label: '参考图 1', mediaType: 'image' },
			{ id: 'in-image-2', label: '参考图 2', mediaType: 'image' },
			{ id: 'in-image-3', label: '参考图 3', mediaType: 'image' },
			{ id: 'in-image-4', label: '参考图 4', mediaType: 'image' },
			{ id: 'in-text', label: '补充说明', mediaType: 'text' }
		],
		outputs: [{ id: 'out-0', label: '分析结果', mediaType: 'text' }]
	},
	'scene-layout': {
		inputs: [
			{ id: 'in-image', label: '参考图 1', mediaType: 'image' },
			{ id: 'in-image-2', label: '参考图 2', mediaType: 'image' },
			{ id: 'in-image-3', label: '参考图 3', mediaType: 'image' },
			{ id: 'in-image-4', label: '参考图 4', mediaType: 'image' },
			{ id: 'in-json', label: '布局JSON', mediaType: 'text' }
		],
		outputs: [{ id: 'out-0', label: '布局输出', mediaType: 'text' }]
	},
	'scene-decompose': {
		inputs: [
			{ id: 'in-image', label: '参考图 1', mediaType: 'image' },
			{ id: 'in-image-2', label: '参考图 2', mediaType: 'image' },
			{ id: 'in-image-3', label: '参考图 3', mediaType: 'image' },
			{ id: 'in-image-4', label: '参考图 4', mediaType: 'image' },
			{ id: 'in-json', label: '场景 JSON', mediaType: 'text' }
		],
		outputs: [{ id: 'out-0', label: '拆解输出', mediaType: 'image' }]
	},
	comfyui: {
		inputs: [{ id: 'in-0', label: '工作流输入', mediaType: 'generic', multiInput: true }],
		outputs: [
			{ id: 'out-image', label: '图片输出', mediaType: 'image' },
			{ id: 'out-video', label: '视频输出', mediaType: 'video' },
			{ id: 'out-model3d', label: '模型输出', mediaType: 'model3d' }
		]
	},
	meshy: {
		inputs: [
			{ id: 'in-text', label: '提示词', mediaType: 'text' },
			{ id: 'in-image', label: '参考图', mediaType: 'image' }
		],
		outputs: [
			{ id: 'out-model', label: '模型输出', mediaType: 'model3d' },
			{ id: 'out-image', label: '预览图', mediaType: 'image' }
		]
	},
	'unreal-export': {
		inputs: [
			{ id: 'in-scene', label: '场景数据', mediaType: 'text' },
			{ id: 'in-settings', label: '导出设置', mediaType: 'text' }
		],
		outputs: []
	},
	blender: {
		inputs: [
			{ id: 'in-resource', label: '资源输入', mediaType: 'resource' },
			{ id: 'in-image', label: '参考图', mediaType: 'image' },
			{ id: 'in-text', label: '指令/脚本', mediaType: 'text' }
		],
		outputs: [
			{ id: 'out-resource', label: '资源输出', mediaType: 'resource' },
			{ id: 'out-image', label: '截图输出', mediaType: 'image' },
			{ id: 'out-text', label: '结果输出', mediaType: 'text' }
		]
	},
	'director-console': {
		inputs: [{ id: 'in-json', label: '布局JSON', mediaType: 'text' }],
		outputs: []
	}
}

export function getDefaultNodeData(
	type: string,
	id: string,
	x: number,
	y: number,
	title?: string
): BlueprintNodeData {
	const defaultSize = DEFAULT_NODE_SIZES[type] ||
		DEFAULT_NODE_SIZES.base || { width: 240, height: 160 }
	// eslint-disable-next-line no-console
	console.info(
		`[WFSize][create] type=${type} id=${id} w=${defaultSize.width} h=${defaultSize.height}`
	)
	const defaultPorts = DEFAULT_NODE_PORTS[type] ||
		DEFAULT_NODE_PORTS.base || {
			inputs: [{ id: 'in-0', label: '入口' }],
			outputs: [{ id: 'out-0', label: '出口' }]
		}
	return {
		id,
		type,
		title: title || type,
		worldX: x,
		worldY: y,
		width: defaultSize.width,
		height: defaultSize.height,
		inputs: defaultPorts.inputs.map((p) => ({ ...p })),
		outputs: defaultPorts.outputs.map((p) => ({ ...p })),
		status: 'idle',
		createdAt: Date.now()
	}
}

export const RESIZE_HANDLE_SIZE = 12
export const RESIZE_HANDLE_HIT_SIZE = 16
export const RESIZE_HANDLE_OFFSET = 4
export const MIN_NODE_WIDTH = 180
export const MIN_NODE_HEIGHT = 120
