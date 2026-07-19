import { ref, computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import type {
	ChatContextItem,
	ImageContextItem,
	FileContextItem,
	SkillContextItem,
	NodeContextItem,
	NodeOutputContextItem,
	NodeOutputDragData,
	NodeOutputKind
} from '../../../../types/agentMention'
import { BUILTIN_SKILLS } from '../../../../ai/models/agentSkills'
import type { SkillDefinition } from '../../../../ai/models/agentSkills'
import { isString } from '../../../../types/utils'
import type { WorkflowNode } from '../../../../aiworkflow/types'

const MAX_IMAGE_SIZE = 10 * 1024 * 1024
const MAX_FILE_CONTENT_CHARS = 50000
const TEXT_FILE_EXTENSIONS = [
	'.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx', '.vue',
	'.css', '.scss', '.less', '.html', '.xml', '.yaml', '.yml',
	'.py', '.java', '.c', '.cpp', '.h', '.go', '.rs', '.sh',
	'.bat', '.ps1', '.mjs', '.cjs'
]
const MAX_CONTEXT_ITEMS = 20

function generateId(prefix: string): string {
	return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as string)
		reader.onerror = reject
		reader.readAsDataURL(file)
	})
}

function readFileAsText(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as string)
		reader.onerror = reject
		reader.readAsText(file)
	})
}

function isTextFile(file: File): boolean {
	const name = file.name.toLowerCase()
	return TEXT_FILE_EXTENSIONS.some(ext => name.endsWith(ext))
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function sanitizeNodeConfig(config: unknown): Record<string, unknown> {
	if (!config || typeof config !== 'object') return {}
	const sanitized: Record<string, unknown> = {}
	const forbiddenKeys = new Set(['resourceData', 'thumbnailData', 'previewUrl'])
	for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
		if (!forbiddenKeys.has(key)) {
			sanitized[key] = value
		}
	}
	return sanitized
}

function getNodeConnections(
	nodeId: string,
	nodes?: WorkflowNode[],
	edges?: { source?: string; target?: string; sourceHandle?: string; targetHandle?: string }[]
): NodeContextItem['connections'] {
	if (!nodes || !edges) return []
	const connections: NonNullable<NodeContextItem['connections']> = []
	const nodesById = new Map(nodes.map(n => [n.id, n]))

	for (const edge of edges) {
		if (connections.length >= 20) break
		if (edge.source === nodeId && edge.target && edge.sourceHandle) {
			const targetNode = nodesById.get(edge.target)
			connections.push({
				direction: 'out',
				nodeId: edge.target,
				nodeType: targetNode?.type,
				anchorId: edge.sourceHandle
			})
		} else if (edge.target === nodeId && edge.source && edge.targetHandle) {
			const sourceNode = nodesById.get(edge.source)
			connections.push({
				direction: 'in',
				nodeId: edge.source,
				nodeType: sourceNode?.type,
				anchorId: edge.targetHandle
			})
		}
	}
	return connections
}

export function useChatContext(options?: {
	getNodePreviewUrl?: (node: WorkflowNode) => { url: string | null; kind: NodeOutputKind } | null
	getNodeResourceUrl?: (node: WorkflowNode) => string | null
}) {
	const items: Ref<ChatContextItem[]> = ref([])
	const nodeOutputRefs: Ref<NodeOutputContextItem[]> = ref([])
	const isPickingNode: Ref<boolean> = ref(false)

	const allItems: ComputedRef<ChatContextItem[]> = computed(() => [
		...items.value,
		...nodeOutputRefs.value
	])

	const hasContext: ComputedRef<boolean> = computed(() => allItems.value.length > 0)

	const contextCount: ComputedRef<number> = computed(() => allItems.value.length)

	async function addImage(fileOrData: File | { name: string; mimeType?: string; size?: number; dataUrl?: string; url?: string; thumbnailUrl?: string }): Promise<void> {
		if (items.value.length >= MAX_CONTEXT_ITEMS) return
		let item: ImageContextItem
		if (fileOrData instanceof File) {
			const file = fileOrData
			const dataUrl = await readFileAsDataUrl(file)
			item = {
				id: generateId('img'),
				type: 'image',
				addedAt: Date.now(),
				name: file.name,
				mimeType: file.type || 'application/octet-stream',
				size: file.size,
				dataUrl
			}
		} else {
			item = {
				id: generateId('img'),
				type: 'image',
				addedAt: Date.now(),
				name: fileOrData.name,
				mimeType: fileOrData.mimeType || 'application/octet-stream',
				size: fileOrData.size || 0,
				dataUrl: fileOrData.dataUrl,
				url: fileOrData.url,
				thumbnailUrl: fileOrData.thumbnailUrl
			}
		}
		items.value.push(item)
	}

	async function addFile(fileOrData: File | { name: string; mimeType?: string; size?: number; path?: string; content?: string; truncated?: boolean; lines?: number }): Promise<void> {
		if (items.value.length >= MAX_CONTEXT_ITEMS) return
		let item: FileContextItem
		if (fileOrData instanceof File) {
			const file = fileOrData
			let content: string | undefined
			let truncated = false

			if (isTextFile(file)) {
				const text = await readFileAsText(file)
				if (text.length > MAX_FILE_CONTENT_CHARS) {
					content = text.slice(0, MAX_FILE_CONTENT_CHARS)
					truncated = true
				} else {
					content = text
				}
			} else {
				content = `[Binary file: ${file.name} (${formatFileSize(file.size)})]`
			}

			item = {
				id: generateId('file'),
				type: 'file',
				addedAt: Date.now(),
				name: file.name,
				mimeType: file.type || 'application/octet-stream',
				size: file.size,
				content,
				truncated
			}
		} else {
			item = {
				id: generateId('file'),
				type: 'file',
				addedAt: Date.now(),
				name: fileOrData.name,
				mimeType: fileOrData.mimeType || 'application/octet-stream',
				size: fileOrData.size || 0,
				path: fileOrData.path,
				content: fileOrData.content,
				truncated: fileOrData.truncated
			}
		}
		items.value.push(item)
	}

	function addSkill(skillId: string): void {
		const skill = BUILTIN_SKILLS.find((s: SkillDefinition) => s.id === skillId)
		if (!skill) return
		if (items.value.some(item => item.type === 'skill' && item.skillId === skillId)) return
		const item: SkillContextItem = {
			id: generateId('skill'),
			type: 'skill',
			addedAt: Date.now(),
			skillId: skill.id,
			name: skill.name,
			description: skill.description,
			prompt: skill.prompt,
			icon: skill.icon,
			category: skill.category
		}
		items.value.push(item)
	}

	function addNode(
		node: WorkflowNode,
		addOptions?: {
			includeConnections?: boolean
			allNodes?: WorkflowNode[]
			allEdges?: { source?: string; target?: string; sourceHandle?: string; targetHandle?: string }[]
		}
	): void {
		if (items.value.some(item => item.type === 'node' && item.nodeId === node.id)) return
		const includeConnections = addOptions?.includeConnections ?? false
		const connections = includeConnections
			? getNodeConnections(node.id, addOptions?.allNodes, addOptions?.allEdges)
			: undefined
		const label = isString(node.title) && node.title.length > 0
			? node.title
			: isString(node.alias) && node.alias.length > 0
				? node.alias
				: node.type

		let previewUrl: string | undefined
		let resourceUrl: string | undefined
		let thumbKind: NodeOutputKind | undefined
		let mainOutputAnchorId: string | undefined
		let mainOutputText: string | undefined

		if (options?.getNodePreviewUrl) {
			const preview = options.getNodePreviewUrl(node)
			if (preview) {
				previewUrl = preview.url || undefined
				thumbKind = preview.kind
			}
		}

		if (options?.getNodeResourceUrl) {
			resourceUrl = options.getNodeResourceUrl(node) || undefined
		}

		if (!previewUrl) {
			const nodeAny = node as Record<string, any>
			const previewOutputs = nodeAny._previewOutputs || nodeAny._lastOutputs || {}
			const outputs = (nodeAny.outputs as any[]) || []

			if (outputs.length > 0) {
				const anchor = outputs[0]
				if (anchor && anchor.id) {
					mainOutputAnchorId = anchor.id
					const kindMap: Record<string, NodeContextItem['thumbKind']> = {
						text: 'text',
						image: 'image',
						video: 'video',
						model3d: 'model3d',
						audio: 'audio',
						blender: 'blender'
					}
					const kind = kindMap[anchor.kind || anchor.type] || (anchor.isImage ? 'image' : 'text')
					thumbKind = kind
					const previewData = previewOutputs[anchor.id]
					if (previewData) {
						if (typeof previewData === 'string' && kind === 'text') {
							mainOutputText = previewData.slice(0, 2000)
						} else if (previewData && typeof previewData === 'object') {
							previewUrl = previewData.url || previewData.previewUrl || previewData.src
							mainOutputText = previewData.text
						}
					}
					if (!previewUrl && kind === 'image') {
						for (let i = 1; i < outputs.length; i++) {
							const a = outputs[i]
							if (!a || !a.id) continue
							const ak = kindMap[a.kind || a.type] || (a.isImage ? 'image' : 'text')
							if (ak === 'image') {
								const pd = previewOutputs[a.id]
								if (pd && typeof pd === 'object') {
									previewUrl = pd.url || pd.previewUrl || pd.src
									if (previewUrl) {
										mainOutputAnchorId = a.id
										thumbKind = 'image'
										break
									}
								}
							}
						}
					}
				}
			}
		}

		if (!thumbKind) {
			if (node.type === 'image' || node.type === 'rotate-image') {
				thumbKind = 'image'
			} else if (node.type === 'video') {
				thumbKind = 'video'
			} else if (node.type === 'text' || node.type === 'text-merge' || node.type === 'story') {
				thumbKind = 'text'
			} else if (node.type === 'model3d') {
				thumbKind = 'model3d'
			} else if (node.type === 'blender') {
				thumbKind = 'blender'
			} else {
				thumbKind = 'node'
			}
		}

		const item: NodeContextItem = {
			id: generateId('node'),
			type: 'node',
			addedAt: Date.now(),
			nodeId: node.id,
			nodeType: node.type,
			label,
			config: sanitizeNodeConfig(node),
			includeConnections,
			connections,
			previewUrl,
			resourceUrl,
			thumbKind,
			mainOutputAnchorId,
			mainOutputText
		}
		items.value.push(item)
	}

	function addNodeOutputRef(data: NodeOutputDragData): NodeOutputContextItem | null {
		const exists = nodeOutputRefs.value.some(
			item => item.nodeId === data.nodeId && item.anchorId === data.anchorId
		)
		if (exists) return null
		const item: NodeOutputContextItem = {
			id: generateId('nout'),
			type: 'nodeOutput',
			addedAt: Date.now(),
			kind: data.kind,
			nodeId: data.nodeId,
			nodeType: data.nodeType,
			anchorId: data.anchorId,
			label: data.label,
			name: data.name,
			text: data.text,
			previewUrl: data.previewUrl,
			meta: data.meta
		}
		nodeOutputRefs.value.push(item)
		return item
	}

	function removeItem(itemId: string): void {
		items.value = items.value.filter(item => item.id !== itemId)
	}

	function removeNodeOutputRef(itemId: string): void {
		nodeOutputRefs.value = nodeOutputRefs.value.filter(item => item.id !== itemId)
	}

	function clearAll(): void {
		items.value = []
		nodeOutputRefs.value = []
		isPickingNode.value = false
	}

	function enterNodePickMode(): void {
		isPickingNode.value = true
	}

	function exitNodePickMode(): void {
		isPickingNode.value = false
	}

	function onNodePicked(
		node: WorkflowNode,
		options?: Parameters<typeof addNode>[1]
	): void {
		addNode(node, options)
		exitNodePickMode()
	}

	async function imageUrlToBase64(url: string): Promise<string | null> {
		if (!url) return null
		if (/^data:/i.test(url)) return url
		return await new Promise<string | null>((resolve) => {
			const img = new Image()
			img.crossOrigin = 'anonymous'
			img.onload = () => {
				try {
					const canvas = document.createElement('canvas')
					canvas.width = img.naturalWidth || img.width
					canvas.height = img.naturalHeight || img.height
					const ctx = canvas.getContext('2d')
					if (!ctx) {
						resolve(null)
						return
					}
					ctx.drawImage(img, 0, 0)
					const dataUrl = canvas.toDataURL('image/png')
					resolve(dataUrl && dataUrl !== 'data:,' ? dataUrl : null)
				} catch {
					resolve(null)
				}
			}
			img.onerror = () => resolve(null)
			img.src = url
		})
	}

	async function toAttachments(): Promise<{ type: string; name?: string; url?: string; data?: string; mimeType?: string }[]> {
		const attachments: { type: string; name?: string; url?: string; data?: string; mimeType?: string }[] = []
		for (const item of items.value) {
			if (item.type === 'image' && item.dataUrl) {
				attachments.push({
					type: 'image_url',
					name: item.name,
					data: item.dataUrl,
					mimeType: item.mimeType
				})
			} else if (item.type === 'node' && item.thumbKind === 'image') {
				const imageUrl = item.resourceUrl || item.previewUrl
				if (imageUrl) {
					if (/^https?:\/\//i.test(imageUrl)) {
						attachments.push({
							type: 'image_url',
							name: item.label,
							url: imageUrl,
							mimeType: 'image/*'
						})
					} else {
						const base64 = await imageUrlToBase64(imageUrl)
						if (base64) {
							attachments.push({
								type: 'image_url',
								name: item.label,
								data: base64,
								mimeType: 'image/*'
							})
						}
					}
				}
			}
		}
		for (const ref of nodeOutputRefs.value) {
			if (ref.kind === 'image' && ref.previewUrl) {
				if (/^https?:\/\//i.test(ref.previewUrl)) {
					attachments.push({
						type: 'image_url',
						name: ref.label,
						url: ref.previewUrl,
						mimeType: 'image/*'
					})
				} else {
					const base64 = await imageUrlToBase64(ref.previewUrl)
					if (base64) {
						attachments.push({
							type: 'image_url',
							name: ref.label,
							data: base64,
							mimeType: 'image/*'
						})
					}
				}
			}
		}
		return attachments
	}

	function toReferences(): { kind?: string; name?: string; path?: string; content?: string; nodeId?: string; anchorId?: string; previewUrl?: string }[] {
		const references: { kind?: string; name?: string; path?: string; content?: string; nodeId?: string; anchorId?: string; previewUrl?: string }[] = []
		for (const item of items.value) {
			if (item.type === 'file') {
				references.push({
					kind: 'file',
					name: item.name,
					path: item.path,
					content: item.content
				})
			}
		}
		for (const ref of nodeOutputRefs.value) {
			references.push({
				kind: ref.kind,
				name: ref.name || ref.label,
				nodeId: ref.nodeId,
				anchorId: ref.anchorId,
				content: ref.text,
				previewUrl: ref.previewUrl
			})
		}
		return references
	}

	function toSkillHints(): string[] {
		return items.value
			.filter((item): item is SkillContextItem => item.type === 'skill')
			.map(item => item.skillId)
	}

	function getNodeContexts(): NodeContextItem[] {
		return items.value.filter((item): item is NodeContextItem => item.type === 'node')
	}

	function getNodeOutputContexts(): NodeOutputContextItem[] {
		return [...nodeOutputRefs.value]
	}

	function getReferencedNodeIds(): string[] {
		return items.value
			.filter((item): item is NodeContextItem => item.type === 'node')
			.map(item => item.nodeId)
	}

	function getActiveSkills(): { id: string; name: string; description: string; prompt: string }[] {
		return items.value
			.filter((item): item is SkillContextItem => item.type === 'skill')
			.map(item => ({
				id: item.skillId,
				name: item.name,
				description: item.description || '',
				prompt: item.prompt || ''
			}))
	}

	return {
		items,
		nodeOutputRefs,
		isPickingNode,
		allItems,
		hasContext,
		contextCount,
		addImage,
		addFile,
		addSkill,
		addNode,
		addNodeOutputRef,
		removeItem,
		removeNodeOutputRef,
		clearAll,
		enterNodePickMode,
		exitNodePickMode,
		onNodePicked,
		toAttachments,
		toReferences,
		toSkillHints,
		getNodeContexts,
		getNodeOutputContexts,
		getReferencedNodeIds,
		getActiveSkills
	}
}

export default useChatContext
