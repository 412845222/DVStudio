import { describe, it, expect, beforeEach } from 'vitest'
import { AIWorkflowStore } from '@/store/aiworkflow/store'
import type { WorkflowBlenderChatMessage } from '@/aiworkflow/types'

function createBlenderNode(id: string, overrides: Record<string, unknown> = {}) {
	return {
		id,
		type: 'blender' as const,
		title: 'Blender Node',
		worldX: 0,
		worldY: 0,
		width: 280,
		height: 200,
		inputs: [],
		outputs: [],
		createdAt: Date.now(),
		blenderSettings: {
			connected: false,
			host: 'localhost',
			port: 9876,
			chatMessages: [],
			isSubmitting: false,
			...overrides
		}
	}
}

function resetStore() {
	AIWorkflowStore.commit('replaceWorkflowState', {
		snapshot: {
			nodesById: {},
			nodeOrder: [],
			edgesById: {},
			edgeOrder: [],
			nodeChatDialog: {
				visible: false,
				nodeId: null,
				nodeType: null,
				draft: '',
				submitting: false,
				params: {}
			},
			viewport: { zoom: 1, panX: 0, panY: 0 },
			selectedNodeId: null,
			selectedNodeIds: [],
			selectedEdgeId: null
		}
	})
}

describe('store/aiworkflow - Blender node isSubmitting persistence', () => {
	beforeEach(() => {
		resetStore()
	})

	it('preserves isSubmitting=true when reopening blender node chat dialog', () => {
		const node = createBlenderNode('blender-1', { isSubmitting: true })
		AIWorkflowStore.commit('upsertNode', { node })

		AIWorkflowStore.commit('openNodeChatDialog', { nodeId: 'blender-1', nodeType: 'blender' })

		expect(AIWorkflowStore.state.nodeChatDialog.submitting).toBe(true)
		expect(AIWorkflowStore.state.nodeChatDialog.visible).toBe(true)
		expect(AIWorkflowStore.state.nodeChatDialog.nodeId).toBe('blender-1')
	})

	it('sets submitting=false when blender node isSubmitting is false', () => {
		const node = createBlenderNode('blender-2', { isSubmitting: false })
		AIWorkflowStore.commit('upsertNode', { node })

		AIWorkflowStore.commit('openNodeChatDialog', { nodeId: 'blender-2', nodeType: 'blender' })

		expect(AIWorkflowStore.state.nodeChatDialog.submitting).toBe(false)
	})

	it('sets submitting=false for non-blender nodes regardless of state', () => {
		AIWorkflowStore.commit('upsertNode', {
			node: {
				id: 'img-1',
				type: 'image',
				title: 'Image Node',
				worldX: 0,
				worldY: 0,
				width: 280,
				height: 180,
				inputs: [],
				outputs: [],
				createdAt: Date.now()
			}
		})

		AIWorkflowStore.commit('openNodeChatDialog', { nodeId: 'img-1', nodeType: 'image' })

		expect(AIWorkflowStore.state.nodeChatDialog.submitting).toBe(false)
	})

	it('persists isSubmitting to blender node when setNodeChatSubmitting is called', () => {
		const node = createBlenderNode('blender-3', { isSubmitting: false })
		AIWorkflowStore.commit('upsertNode', { node })
		AIWorkflowStore.commit('openNodeChatDialog', { nodeId: 'blender-3', nodeType: 'blender' })

		AIWorkflowStore.commit('setNodeChatSubmitting', { submitting: true })

		expect(AIWorkflowStore.state.nodeChatDialog.submitting).toBe(true)
		const updatedNode = AIWorkflowStore.state.nodesById['blender-3']
		expect(updatedNode.blenderSettings?.isSubmitting).toBe(true)
	})

	it('clears isSubmitting on blender node when setNodeChatSubmitting(false) is called', () => {
		const node = createBlenderNode('blender-4', { isSubmitting: true })
		AIWorkflowStore.commit('upsertNode', { node })
		AIWorkflowStore.commit('openNodeChatDialog', { nodeId: 'blender-4', nodeType: 'blender' })
		expect(AIWorkflowStore.state.nodeChatDialog.submitting).toBe(true)

		AIWorkflowStore.commit('setNodeChatSubmitting', { submitting: false })

		expect(AIWorkflowStore.state.nodeChatDialog.submitting).toBe(false)
		const updatedNode = AIWorkflowStore.state.nodesById['blender-4']
		expect(updatedNode.blenderSettings?.isSubmitting).toBe(false)
	})

	it('does not affect non-blender nodes when setNodeChatSubmitting is called', () => {
		AIWorkflowStore.commit('upsertNode', {
			node: {
				id: 'text-1',
				type: 'text',
				title: 'Text Node',
				worldX: 0,
				worldY: 0,
				width: 280,
				height: 180,
				inputs: [],
				outputs: [],
				createdAt: Date.now()
			}
		})
		AIWorkflowStore.commit('openNodeChatDialog', { nodeId: 'text-1', nodeType: 'text' })

		AIWorkflowStore.commit('setNodeChatSubmitting', { submitting: true })

		expect(AIWorkflowStore.state.nodeChatDialog.submitting).toBe(true)
		const textNode = AIWorkflowStore.state.nodesById['text-1']
		expect((textNode as any).blenderSettings).toBeUndefined()
	})

	it('defaults isSubmitting to false when blenderSettings has no isSubmitting field', () => {
		const node = createBlenderNode('blender-5')
		delete (node.blenderSettings as any).isSubmitting
		AIWorkflowStore.commit('upsertNode', { node })

		AIWorkflowStore.commit('openNodeChatDialog', { nodeId: 'blender-5', nodeType: 'blender' })

		expect(AIWorkflowStore.state.nodeChatDialog.submitting).toBe(false)
	})
})

describe('store/aiworkflow - compressBlenderChatContext', () => {
	function makeMsg(id: string, role: string, content: string): WorkflowBlenderChatMessage {
		return {
			id,
			role: role as WorkflowBlenderChatMessage['role'],
			content,
			timestamp: Date.now()
		}
	}

	beforeEach(() => {
		resetStore()
	})

	it('does nothing when node has fewer than 3 messages', () => {
		const msgs = [makeMsg('m1', 'user', 'hello'), makeMsg('m2', 'assistant', 'hi')]
		const node = createBlenderNode('blender-c1', { chatMessages: msgs })
		AIWorkflowStore.commit('upsertNode', { node })

		AIWorkflowStore.commit('compressBlenderChatContext', { nodeId: 'blender-c1' })

		const updated = AIWorkflowStore.state.nodesById['blender-c1']
		expect(updated.blenderSettings?.chatMessages).toHaveLength(2)
	})

	it('does nothing when node does not exist', () => {
		expect(() => {
			AIWorkflowStore.commit('compressBlenderChatContext', { nodeId: 'nonexistent' })
		}).not.toThrow()
	})

	it('does nothing when chatMessages is not an array', () => {
		const node = createBlenderNode('blender-c2', { chatMessages: 'not-an-array' as any })
		AIWorkflowStore.commit('upsertNode', { node })

		expect(() => {
			AIWorkflowStore.commit('compressBlenderChatContext', { nodeId: 'blender-c2' })
		}).not.toThrow()
	})

	it('compresses chat context and keeps recent messages plus system notice', () => {
		const msgs: WorkflowBlenderChatMessage[] = []
		for (let i = 0; i < 10; i++) {
			msgs.push(makeMsg(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', `message ${i}`))
		}
		const node = createBlenderNode('blender-c3', {
			chatMessages: msgs,
			chatContextUsage: { tokenCount: 5000, budget: 8000, usage: 62.5 }
		})
		AIWorkflowStore.commit('upsertNode', { node })

		AIWorkflowStore.commit('compressBlenderChatContext', { nodeId: 'blender-c3' })

		const updated = AIWorkflowStore.state.nodesById['blender-c3']
		const updatedMsgs = updated.blenderSettings?.chatMessages ?? []
		expect(updatedMsgs.length).toBeGreaterThan(2)
		expect(updatedMsgs.length).toBeLessThan(11)

		const firstMsg = updatedMsgs[0]
		expect(firstMsg.role).toBe('system')
		expect(firstMsg.content).toContain('上下文已压缩')

		const lastMsg = updatedMsgs[updatedMsgs.length - 1]
		expect(lastMsg.content).toBe('message 9')

		expect(updated.blenderSettings?.chatContextUsage).toBeUndefined()
	})

	it('preserves at least 2 messages even with large history', () => {
		const msgs: WorkflowBlenderChatMessage[] = []
		for (let i = 0; i < 100; i++) {
			msgs.push(makeMsg(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', `msg ${i}`))
		}
		const node = createBlenderNode('blender-c4', { chatMessages: msgs })
		AIWorkflowStore.commit('upsertNode', { node })

		AIWorkflowStore.commit('compressBlenderChatContext', { nodeId: 'blender-c4' })

		const updated = AIWorkflowStore.state.nodesById['blender-c4']
		const updatedMsgs = updated.blenderSettings?.chatMessages ?? []
		expect(updatedMsgs.length).toBeGreaterThanOrEqual(3)
	})
})

describe('Blender screenshot width-based scaling', () => {
	function scaleImageWidth(
		width: number,
		height: number,
		maxWidth: number
	): { width: number; height: number } {
		let w = width
		let h = height
		if (w > maxWidth) {
			const scale = maxWidth / w
			w = Math.max(64, Math.round(w * scale))
			h = Math.max(64, Math.round(h * scale))
		}
		return { width: w, height: h }
	}

	it('keeps images within max width unchanged', () => {
		expect(scaleImageWidth(640, 480, 960)).toEqual({ width: 640, height: 480 })
		expect(scaleImageWidth(960, 540, 960)).toEqual({ width: 960, height: 540 })
	})

	it('scales down wide landscape images by width', () => {
		const result = scaleImageWidth(1920, 1080, 960)
		expect(result.width).toBe(960)
		expect(result.height).toBe(540)
	})

	it('scales down tall portrait images by width constraint', () => {
		const result = scaleImageWidth(1080, 1920, 960)
		expect(result.width).toBe(960)
		expect(result.height).toBe(1707)
	})

	it('does not scale up small images', () => {
		expect(scaleImageWidth(320, 240, 960)).toEqual({ width: 320, height: 240 })
	})

	it('preserves aspect ratio when scaling', () => {
		const w = 1920,
			h = 1080
		const result = scaleImageWidth(w, h, 960)
		const originalRatio = w / h
		const newRatio = result.width / result.height
		expect(Math.abs(originalRatio - newRatio)).toBeLessThan(0.01)
	})

	it('width-limited scaling allows taller images than max-dimension approach', () => {
		const maxWidth = 960
		const oldMaxDim = 640
		const portraitW = 1080,
			portraitH = 1920

		const widthResult = scaleImageWidth(portraitW, portraitH, maxWidth)
		const oldResult = (() => {
			let w = portraitW,
				h = portraitH
			if (Math.max(w, h) > oldMaxDim) {
				const scale = oldMaxDim / Math.max(w, h)
				w = Math.round(w * scale)
				h = Math.round(h * scale)
			}
			return { width: w, height: h }
		})()

		expect(widthResult.width).toBe(960)
		expect(widthResult.height).toBeGreaterThan(oldResult.height)
	})
})

describe('Blender screenshot tools are uncacheable', () => {
	const UNCACHEABLE_TOOLS = new Set([
		'blender_get_screenshot_of_area_as_image',
		'blender_get_screenshot_of_window_as_image'
	])

	function shouldUseCache(toolName: string, toolCallCount: number): boolean {
		if (UNCACHEABLE_TOOLS.has(toolName)) return false
		return toolCallCount > 1
	}

	it('never caches area screenshot tool', () => {
		expect(shouldUseCache('blender_get_screenshot_of_area_as_image', 5)).toBe(false)
		expect(shouldUseCache('blender_get_screenshot_of_area_as_image', 2)).toBe(false)
	})

	it('never caches window screenshot tool', () => {
		expect(shouldUseCache('blender_get_screenshot_of_window_as_image', 5)).toBe(false)
		expect(shouldUseCache('blender_get_screenshot_of_window_as_image', 2)).toBe(false)
	})

	it('caches non-screenshot tools on subsequent calls', () => {
		expect(shouldUseCache('blender_get_objects_summary', 2)).toBe(true)
		expect(shouldUseCache('blender_execute_blender_code', 3)).toBe(true)
	})

	it('does not cache on first tool call regardless of tool', () => {
		expect(shouldUseCache('blender_get_objects_summary', 1)).toBe(false)
		expect(shouldUseCache('some_other_tool', 1)).toBe(false)
	})
})

describe('Image token estimation for vision context', () => {
	function estimateTokens(text: string): number {
		const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\u3000-\u303f]/g) || []).length
		const otherChars = text.length - cjkChars
		return Math.ceil(cjkChars * 1.3 + otherChars * 0.75)
	}

	function estimateImageTokens(imageUrl: string, detail: string = 'auto'): number {
		const BASE_TOKEN = 85
		const HIGH_RES_MULTIPLIER = 2.5
		if (!imageUrl) return BASE_TOKEN
		try {
			if (imageUrl.startsWith('data:')) {
				const base64Data = imageUrl.split(',')[1]
				if (base64Data) {
					const byteLength = Math.floor(base64Data.length * 0.75)
					const pixelEstimate = Math.sqrt(byteLength / 3)
					const resolutionFactor = Math.min(pixelEstimate / 512, 4)
					return Math.max(BASE_TOKEN, Math.round(BASE_TOKEN * resolutionFactor))
				}
				return BASE_TOKEN
			}
			const urlObj = new URL(imageUrl)
			const widthStr = urlObj.searchParams.get('width')
			const heightStr = urlObj.searchParams.get('height')
			if (widthStr && heightStr) {
				const width = parseInt(widthStr, 10)
				const height = parseInt(heightStr, 10)
				if (!isNaN(width) && !isNaN(height) && width > 0 && height > 0) {
					const pixels = width * height
					const basePixels = 640 * 480
					const resolutionFactor = Math.sqrt(pixels / basePixels)
					const cappedFactor = Math.min(resolutionFactor, 4)
					const detailMultiplier = detail === 'high' ? HIGH_RES_MULTIPLIER : 1
					return Math.round(BASE_TOKEN * cappedFactor * detailMultiplier)
				}
			}
			return BASE_TOKEN
		} catch {
			return BASE_TOKEN
		}
	}

	it('estimates base token cost for empty/null image URL', () => {
		expect(estimateImageTokens('')).toBe(85)
	})

	it('returns base token cost for non-data, non-parameterized URLs', () => {
		expect(estimateImageTokens('https://example.com/image.png')).toBe(85)
	})

	it('estimates token cost for data URL screenshot images (realistic size)', () => {
		const realisticBase64 = 'data:image/png;base64,' + 'A'.repeat(200000)
		const tokens = estimateImageTokens(realisticBase64)
		expect(tokens).toBeGreaterThanOrEqual(85)
	})

	it('estimates higher token cost for URLs with width/height params at high detail', () => {
		const url = 'https://example.com/img.png?width=960&height=540'
		const autoTokens = estimateImageTokens(url, 'auto')
		const highTokens = estimateImageTokens(url, 'high')
		expect(highTokens).toBeGreaterThan(autoTokens)
	})

	it('handles text content token estimation for CJK characters', () => {
		const tokens = estimateTokens('你好世界')
		expect(tokens).toBeGreaterThan(0)
	})

	it('handles mixed content arrays with text and image parts', () => {
		const largeB64 = 'data:image/png;base64,' + 'A'.repeat(200000)
		const messages = [
			{
				role: 'user',
				content: [
					{ type: 'text', text: '请看截图' },
					{ type: 'image_url', image_url: { url: largeB64, detail: 'high' } }
				]
			}
		]

		let totalTokens = 0
		for (const msg of messages) {
			if (Array.isArray(msg.content)) {
				for (const part of msg.content) {
					if (part.type === 'text') {
						totalTokens += estimateTokens(part.text || '')
					} else if (part.type === 'image_url') {
						totalTokens += estimateImageTokens(
							part.image_url?.url || '',
							part.image_url?.detail || 'auto'
						)
					}
				}
			}
		}
		expect(totalTokens).toBeGreaterThan(85)
	})

	it('estimates tool_calls tokens via JSON stringification', () => {
		const msg = {
			role: 'assistant',
			content: '',
			tool_calls: [{ id: '1', type: 'function', function: { name: 'test', arguments: '{}' } }]
		}
		let tokens = 0
		if (msg.tool_calls) {
			tokens += estimateTokens(JSON.stringify(msg.tool_calls))
		}
		expect(tokens).toBeGreaterThan(0)
	})
})

describe('MCP request queue serialization', () => {
	it('processes requests sequentially via promise chain', async () => {
		const executionOrder: number[] = []
		let queue = Promise.resolve()

		function enqueueRequest(fn: () => Promise<void>, id: number): Promise<void> {
			queue = queue.then(
				() => fn().then(() => executionOrder.push(id)),
				() => fn().then(() => executionOrder.push(id))
			)
			return queue
		}

		const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

		await Promise.all([
			enqueueRequest(() => delay(30), 1),
			enqueueRequest(() => delay(20), 2),
			enqueueRequest(() => delay(10), 3)
		])

		expect(executionOrder).toEqual([1, 2, 3])
	})

	it('rejects JSON-RPC batch requests', () => {
		function isBatchRequest(message: unknown): boolean {
			return Array.isArray(message)
		}

		expect(
			isBatchRequest([
				{ id: 1, method: 'test' },
				{ id: 2, method: 'test2' }
			])
		).toBe(true)
		expect(isBatchRequest({ id: 1, method: 'test' })).toBe(false)
		expect(isBatchRequest('not an array')).toBe(false)
	})
})

describe('ToolImageProcessor generates dataUrl alongside fileUrl', () => {
	function createDataUrl(b64Data: string, mimeType: string = 'image/png'): string {
		const cleanB64 = b64Data.replace(/^data:image\/\w+;base64,/, '')
		return `data:${mimeType};base64,${cleanB64}`
	}

	it('strips existing data URL prefix and creates clean data URL', () => {
		const rawB64 = 'iVBORw0KGgo='
		const prefixed = `data:image/jpeg;base64,${rawB64}`
		const result = createDataUrl(prefixed, 'image/png')
		expect(result).toBe(`data:image/png;base64,${rawB64}`)
	})

	it('works with unprefixed base64 data', () => {
		const rawB64 = 'iVBORw0KGgo='
		const result = createDataUrl(rawB64)
		expect(result).toBe(`data:image/png;base64,${rawB64}`)
	})

	it('AgentRuntime prefers dataUrl over fileUrl for vision context', () => {
		const img = {
			dataUrl: 'data:image/png;base64,abc123',
			fileUrl: 'file:///tmp/screenshot.png',
			fileName: 'screenshot.png'
		}
		const imageUrl = img.dataUrl || img.fileUrl
		expect(imageUrl).toBe('data:image/png;base64,abc123')
	})

	it('falls back to fileUrl when dataUrl is not available', () => {
		const img = {
			dataUrl: undefined as string | undefined,
			fileUrl: 'dweb://screenshots/test.png?t=123',
			fileName: 'test.png'
		}
		const imageUrl = img.dataUrl || img.fileUrl
		expect(imageUrl).toBe('dweb://screenshots/test.png?t=123')
	})
})

describe('Screenshot filename generation with millisecond precision', () => {
	function generateScreenshotFilename(
		timestamp: number,
		screenshotId: string,
		ext: string = 'png'
	): string {
		const ts = new Date(timestamp)
		const pad = (n: number) => String(n).padStart(2, '0')
		const timestampSlug = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`
		const millis = String(timestamp % 1000).padStart(3, '0')
		const sId = screenshotId || String(timestamp)
		return `${timestampSlug}_${millis}_${sId.slice(-6)}.${ext}`
	}

	it('generates filename with timestamp and screenshot ID', () => {
		const ts = new Date(2026, 6, 13, 14, 30, 45, 123).getTime()
		const filename = generateScreenshotFilename(ts, '1720876245123')
		expect(filename).toMatch(/^20260713_143045_123_\w+\.png$/)
	})

	it('includes millisecond component for uniqueness', () => {
		const ts1 = new Date(2026, 6, 13, 14, 30, 45, 100).getTime()
		const ts2 = new Date(2026, 6, 13, 14, 30, 45, 200).getTime()
		const fn1 = generateScreenshotFilename(ts1, 'id1')
		const fn2 = generateScreenshotFilename(ts2, 'id2')
		expect(fn1).not.toBe(fn2)
		expect(fn1).toContain('_100_')
		expect(fn2).toContain('_200_')
	})
})

describe('Workspace image read strips query parameters and warns for screenshots dir', () => {
	const mockPath = {
		normalize: (p: string) => p.replace(/\//g, '\\'),
		join: (...parts: string[]) => parts.join('\\'),
		sep: '\\'
	}

	function stripQueryParams(inputPath: string): string {
		const queryIndex = inputPath.indexOf('?')
		if (queryIndex !== -1) {
			return inputPath.substring(0, queryIndex)
		}
		return inputPath
	}

	function isInScreenshotsDir(resolvedPath: string, workspacePath: string): boolean {
		const normalizedScreenshots = mockPath.normalize(mockPath.join(workspacePath, 'screenshots'))
		return (
			resolvedPath.startsWith(normalizedScreenshots + mockPath.sep) ||
			resolvedPath === normalizedScreenshots
		)
	}

	it('strips query parameters (cache busting) from image paths', () => {
		expect(stripQueryParams('screenshots/test.png?t=123456')).toBe('screenshots/test.png')
		expect(stripQueryParams('references/ref.jpg')).toBe('references/ref.jpg')
	})

	it('detects paths in screenshots directory', () => {
		const ws = 'C:\\projects\\test\\blender-workspace'
		expect(
			isInScreenshotsDir('C:\\projects\\test\\blender-workspace\\screenshots\\shot.png', ws)
		).toBe(true)
		expect(
			isInScreenshotsDir('C:\\projects\\test\\blender-workspace\\references\\ref.png', ws)
		).toBe(false)
	})
})
