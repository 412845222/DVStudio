import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useChatContext } from '../../../../src/views/AIWorkflow/node-business/chat/useChatContext'
import type { WorkflowNode } from '../../../../src/aiworkflow/types'

function makeImageNode(overrides: Partial<WorkflowNode> = {}): WorkflowNode {
	return {
		id: 'node-img-1',
		type: 'image',
		title: 'Test Image',
		alias: '',
		x: 0,
		y: 0,
		width: 200,
		height: 200,
		config: {},
		inputs: [],
		outputs: [],
		...overrides
	} as WorkflowNode
}

function makeTextNode(overrides: Partial<WorkflowNode> = {}): WorkflowNode {
	return {
		id: 'node-text-1',
		type: 'text',
		title: 'Test Text',
		alias: '',
		x: 0,
		y: 0,
		width: 200,
		height: 100,
		config: {},
		inputs: [],
		outputs: [],
		...overrides
	} as WorkflowNode
}

describe('useChatContext', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	describe('basic state', () => {
		it('starts with empty items and refs', () => {
			const { items, nodeOutputRefs, hasContext, contextCount } = useChatContext()
			expect(items.value).toEqual([])
			expect(nodeOutputRefs.value).toEqual([])
			expect(hasContext.value).toBe(false)
			expect(contextCount.value).toBe(0)
		})
	})

	describe('addImage', () => {
		it('adds an image from data object with dataUrl', async () => {
			const { addImage, items, contextCount } = useChatContext()
			await addImage({
				name: 'photo.png',
				mimeType: 'image/png',
				size: 1234,
				dataUrl: 'data:image/png;base64,abc123'
			})
			expect(contextCount.value).toBe(1)
			expect(items.value).toHaveLength(1)
			const item = items.value[0]
			expect(item.type).toBe('image')
			if (item.type === 'image') {
				expect(item.name).toBe('photo.png')
				expect(item.mimeType).toBe('image/png')
				expect(item.dataUrl).toBe('data:image/png;base64,abc123')
			}
		})
	})

	describe('addSkill', () => {
		it('adds a builtin skill and deduplicates', () => {
			const { addSkill, items, getActiveSkills } = useChatContext()
			addSkill('scene-understand')
			addSkill('scene-understand')
			const skillItems = items.value.filter((i) => i.type === 'skill')
			expect(skillItems).toHaveLength(1)
			const skills = getActiveSkills()
			expect(skills).toHaveLength(1)
			expect(skills[0].id).toBe('scene-understand')
		})

		it('ignores unknown skill id', () => {
			const { addSkill, items } = useChatContext()
			addSkill('nonexistent-skill')
			expect(items.value.filter((i) => i.type === 'skill')).toHaveLength(0)
		})
	})

	describe('addNode', () => {
		it('adds an image node with previewUrl and resourceUrl', () => {
			const node = makeImageNode()
			const { addNode, items, getNodeContexts, getReferencedNodeIds } = useChatContext({
				getNodePreviewUrl: () => ({ url: 'dweb://project-assets/thumb.png', kind: 'image' }),
				getNodeResourceUrl: () => 'dweb://project-assets/full.png'
			})
			addNode(node)
			expect(items.value).toHaveLength(1)
			const nodeItem = items.value[0]
			expect(nodeItem.type).toBe('node')
			if (nodeItem.type === 'node') {
				expect(nodeItem.nodeId).toBe('node-img-1')
				expect(nodeItem.label).toBe('Test Image')
				expect(nodeItem.thumbKind).toBe('image')
				expect(nodeItem.previewUrl).toBe('dweb://project-assets/thumb.png')
				expect(nodeItem.resourceUrl).toBe('dweb://project-assets/full.png')
			}
			expect(getNodeContexts()).toHaveLength(1)
			expect(getReferencedNodeIds()).toEqual(['node-img-1'])
		})

		it('deduplicates nodes by id', () => {
			const node = makeImageNode()
			const { addNode, items } = useChatContext({
				getNodePreviewUrl: () => ({ url: null, kind: 'image' }),
				getNodeResourceUrl: () => null
			})
			addNode(node)
			addNode(node)
			expect(items.value.filter((i) => i.type === 'node')).toHaveLength(1)
		})

		it('falls back thumbKind for image node when no preview', () => {
			const node = makeImageNode()
			const { addNode, items } = useChatContext()
			addNode(node)
			const nodeItem = items.value[0]
			if (nodeItem.type === 'node') {
				expect(nodeItem.thumbKind).toBe('image')
			}
		})

		it('uses node alias as label when title is empty', () => {
			const node = makeImageNode({ title: '', alias: 'My Alias' })
			const { addNode, items } = useChatContext()
			addNode(node)
			const nodeItem = items.value[0]
			if (nodeItem.type === 'node') {
				expect(nodeItem.label).toBe('My Alias')
			}
		})

		it('uses node type as label when no title/alias', () => {
			const node = makeImageNode({ title: '', alias: '' })
			const { addNode, items } = useChatContext()
			addNode(node)
			const nodeItem = items.value[0]
			if (nodeItem.type === 'node') {
				expect(nodeItem.label).toBe('image')
			}
		})

		it('sanitizes node config removing forbidden keys', () => {
			const node = makeTextNode({
				config: {
					text: 'hello',
					resourceData: 'secret',
					thumbnailData: 'secret2',
					previewUrl: 'http://x'
				}
			})
			const { addNode, items } = useChatContext()
			addNode(node)
			const nodeItem = items.value[0]
			if (nodeItem.type === 'node') {
				const cfg = nodeItem.config as Record<string, unknown>
				expect(cfg).not.toHaveProperty('resourceData')
				expect(cfg).not.toHaveProperty('thumbnailData')
				expect(cfg).not.toHaveProperty('previewUrl')
				expect(cfg.id).toBe('node-text-1')
				expect(cfg.type).toBe('text')
			}
		})
	})

	describe('addNodeOutputRef', () => {
		it('adds output ref and deduplicates by nodeId+anchorId', () => {
			const { addNodeOutputRef, nodeOutputRefs, getNodeOutputContexts } = useChatContext()
			const ref1 = addNodeOutputRef({
				type: 'workflow-node-output',
				nodeId: 'n1',
				nodeType: 'image',
				anchorId: 'out-1',
				kind: 'image',
				label: 'Image Out',
				previewUrl: 'data:image/png;base64,aaa'
			})
			const ref2 = addNodeOutputRef({
				type: 'workflow-node-output',
				nodeId: 'n1',
				nodeType: 'image',
				anchorId: 'out-1',
				kind: 'image',
				label: 'Image Out',
				previewUrl: 'data:image/png;base64,aaa'
			})
			expect(ref1).not.toBeNull()
			expect(ref2).toBeNull()
			expect(nodeOutputRefs.value).toHaveLength(1)
			expect(getNodeOutputContexts()).toHaveLength(1)
		})
	})

	describe('removeItem / removeNodeOutputRef / clearAll', () => {
		it('removes items and refs correctly', () => {
			const ctx = useChatContext()
			ctx.addSkill('scene-understand')
			ctx.addNode(makeImageNode())
			ctx.addNodeOutputRef({
				type: 'workflow-node-output',
				nodeId: 'n1',
				nodeType: 'image',
				anchorId: 'a1',
				kind: 'image',
				label: 'out',
				previewUrl: 'data:,'
			})
			expect(ctx.contextCount.value).toBe(3)
			const nodeItemId = ctx.items.value.find((i) => i.type === 'node')!.id
			ctx.removeItem(nodeItemId)
			expect(ctx.items.value.filter((i) => i.type === 'node')).toHaveLength(0)
			const nrefId = ctx.nodeOutputRefs.value[0].id
			ctx.removeNodeOutputRef(nrefId)
			expect(ctx.nodeOutputRefs.value).toHaveLength(0)
			ctx.clearAll()
			expect(ctx.contextCount.value).toBe(0)
			expect(ctx.isPickingNode.value).toBe(false)
		})
	})

	describe('node pick mode', () => {
		it('enter and exit pick mode, onNodePicked adds node and exits', () => {
			const { enterNodePickMode, exitNodePickMode, isPickingNode, onNodePicked, items } =
				useChatContext()
			enterNodePickMode()
			expect(isPickingNode.value).toBe(true)
			const node = makeImageNode()
			onNodePicked(node)
			expect(isPickingNode.value).toBe(false)
			expect(items.value.filter((i) => i.type === 'node')).toHaveLength(1)
			exitNodePickMode()
			expect(isPickingNode.value).toBe(false)
		})
	})

	describe('toAttachments', () => {
		it('returns image_url attachment for image items with dataUrl', async () => {
			const { addImage, toAttachments } = useChatContext()
			await addImage({
				name: 'img.png',
				mimeType: 'image/png',
				dataUrl: 'data:image/png;base64,xyz'
			})
			const attachments = await toAttachments()
			expect(attachments).toHaveLength(1)
			expect(attachments[0].type).toBe('image_url')
			expect(attachments[0].data).toBe('data:image/png;base64,xyz')
			expect(attachments[0].url).toBeUndefined()
		})

		it('passes http/https URLs directly without base64 conversion for image nodes', async () => {
			const node = makeImageNode()
			const { addNode, toAttachments } = useChatContext({
				getNodePreviewUrl: () => ({ url: 'https://example.com/thumb.jpg', kind: 'image' }),
				getNodeResourceUrl: () => 'https://example.com/full.jpg'
			})
			addNode(node)
			const attachments = await toAttachments()
			expect(attachments).toHaveLength(1)
			expect(attachments[0].type).toBe('image_url')
			expect(attachments[0].url).toBe('https://example.com/full.jpg')
			expect(attachments[0].data).toBeUndefined()
		})

		it('passes http URLs directly for node output refs', async () => {
			const { addNodeOutputRef, toAttachments } = useChatContext()
			addNodeOutputRef({
				type: 'workflow-node-output',
				nodeId: 'n1',
				nodeType: 'image',
				anchorId: 'a1',
				kind: 'image',
				label: 'out',
				previewUrl: 'http://example.com/out.png'
			})
			const attachments = await toAttachments()
			expect(attachments).toHaveLength(1)
			expect(attachments[0].url).toBe('http://example.com/out.png')
			expect(attachments[0].data).toBeUndefined()
		})

		it('uses previewUrl as fallback when resourceUrl is null for image nodes', async () => {
			const node = makeImageNode()
			const { addNode, toAttachments } = useChatContext({
				getNodePreviewUrl: () => ({ url: 'https://cdn.example.com/thumb.jpg', kind: 'image' }),
				getNodeResourceUrl: () => null
			})
			addNode(node)
			const attachments = await toAttachments()
			expect(attachments).toHaveLength(1)
			expect(attachments[0].url).toBe('https://cdn.example.com/thumb.jpg')
		})

		it('does not include non-image nodes as attachments', async () => {
			const node = makeTextNode()
			const { addNode, toAttachments } = useChatContext({
				getNodePreviewUrl: () => ({ url: null, kind: 'text' }),
				getNodeResourceUrl: () => null
			})
			addNode(node)
			const attachments = await toAttachments()
			expect(attachments).toHaveLength(0)
		})

		it('does not include non-image node output refs', async () => {
			const { addNodeOutputRef, toAttachments } = useChatContext()
			addNodeOutputRef({
				type: 'workflow-node-output',
				nodeId: 'n1',
				nodeType: 'text',
				anchorId: 'a1',
				kind: 'text',
				label: 'text out',
				text: 'hello'
			})
			const attachments = await toAttachments()
			expect(attachments).toHaveLength(0)
		})

		it('returns empty attachments when nothing added', async () => {
			const { toAttachments } = useChatContext()
			const attachments = await toAttachments()
			expect(attachments).toEqual([])
		})
	})

	describe('toReferences', () => {
		it('includes file references and node output refs', async () => {
			const { addFile, addNodeOutputRef, toReferences } = useChatContext()
			await addFile({
				name: 'readme.md',
				mimeType: 'text/markdown',
				content: '# Hello',
				path: '/docs/readme.md'
			})
			addNodeOutputRef({
				type: 'workflow-node-output',
				nodeId: 'n1',
				nodeType: 'text',
				anchorId: 'a1',
				kind: 'text',
				label: 'Text Out',
				text: 'output text',
				previewUrl: undefined
			})
			const refs = toReferences()
			expect(refs).toHaveLength(2)
			expect(refs[0].kind).toBe('file')
			expect(refs[0].name).toBe('readme.md')
			expect(refs[0].content).toBe('# Hello')
			expect(refs[1].kind).toBe('text')
			expect(refs[1].nodeId).toBe('n1')
			expect(refs[1].content).toBe('output text')
		})
	})

	describe('toSkillHints', () => {
		it('returns skill ids for added skills', () => {
			const { addSkill, toSkillHints } = useChatContext()
			addSkill('scene-understand')
			addSkill('scene-lighting')
			expect(toSkillHints()).toEqual(['scene-understand', 'scene-lighting'])
		})
	})

	describe('imageUrlToBase64 via toAttachments', () => {
		let originalImage: typeof Image
		let originalCreateElement: typeof document.createElement
		let drawImageMock: ReturnType<typeof vi.fn>
		let toDataURLMock: ReturnType<typeof vi.fn>
		let getContextMock: ReturnType<typeof vi.fn>
		let imageInstances: Array<{
			crossOrigin?: string
			onload?: () => void
			onerror?: () => void
			src?: string
		}>

		beforeEach(() => {
			originalImage = global.Image
			originalCreateElement = document.createElement.bind(document)
			imageInstances = []
			drawImageMock = vi.fn()
			toDataURLMock = vi.fn(() => 'data:image/png;base64,converted')
			getContextMock = vi.fn((type: string) => {
				if (type === '2d') return { drawImage: drawImageMock }
				return null
			})
			const FakeImage = vi.fn(function (this: {
				crossOrigin?: string
				onload?: () => void
				onerror?: () => void
				src?: string
			}) {
				imageInstances.push(this)
				return this
			}) as unknown as typeof Image
			Object.defineProperty(global, 'Image', {
				value: FakeImage,
				writable: true,
				configurable: true
			})
			document.createElement = vi.fn((tag: string) => {
				if (tag === 'canvas') {
					return {
						width: 0,
						height: 0,
						getContext: getContextMock,
						toDataURL: toDataURLMock
					} as unknown as HTMLCanvasElement
				}
				return originalCreateElement(tag)
			})
		})

		afterEach(() => {
			Object.defineProperty(global, 'Image', {
				value: originalImage,
				writable: true,
				configurable: true
			})
			document.createElement = originalCreateElement
		})

		it('converts non-http/non-data URL to base64 data URL via canvas for image nodes', async () => {
			const node = makeImageNode()
			const { addNode, toAttachments } = useChatContext({
				getNodePreviewUrl: () => ({ url: null, kind: 'image' }),
				getNodeResourceUrl: () => 'dweb://project-assets/img.png'
			})
			addNode(node)
			const attachmentsPromise = toAttachments()
			await vi.runAllTimersAsync()
			for (const inst of imageInstances) {
				if (inst.src === 'dweb://project-assets/img.png' && inst.onload) {
					;(inst as any).naturalWidth = 100
					;(inst as any).naturalHeight = 100
					inst.onload()
				}
			}
			const attachments = await attachmentsPromise
			expect(attachments).toHaveLength(1)
			expect(attachments[0].type).toBe('image_url')
			expect(attachments[0].data).toBe('data:image/png;base64,converted')
			expect(drawImageMock).toHaveBeenCalled()
			expect(toDataURLMock).toHaveBeenCalledWith('image/png')
		})

		it('returns no attachment when image fails to load', async () => {
			const node = makeImageNode()
			const { addNode, toAttachments } = useChatContext({
				getNodePreviewUrl: () => ({ url: null, kind: 'image' }),
				getNodeResourceUrl: () => 'dweb://project-assets/bad.png'
			})
			addNode(node)
			const attachmentsPromise = toAttachments()
			await vi.runAllTimersAsync()
			for (const inst of imageInstances) {
				if (inst.src === 'dweb://project-assets/bad.png' && inst.onerror) {
					inst.onerror()
				}
			}
			const attachments = await attachmentsPromise
			expect(attachments).toHaveLength(0)
		})

		it('directly returns data: URLs without canvas conversion for image items', async () => {
			const { addImage, toAttachments } = useChatContext()
			await addImage({
				name: 'i.png',
				mimeType: 'image/png',
				dataUrl: 'data:image/png;base64,alreadybase64'
			})
			const attachments = await toAttachments()
			expect(attachments[0].data).toBe('data:image/png;base64,alreadybase64')
			expect(drawImageMock).not.toHaveBeenCalled()
		})
	})
})
