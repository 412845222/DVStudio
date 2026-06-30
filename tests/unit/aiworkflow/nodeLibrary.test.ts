import { describe, it, expect } from 'vitest'
import { NEWUI2_NODE_CATALOG, NEWUI2_NODE_TOP_CATEGORIES } from '@/aiworkflow/nodeLibrary'

describe('nodeLibrary', () => {
	describe('NEWUI2_NODE_CATALOG', () => {
		it('应该包含所有定义的节点', () => {
			const actionIds = NEWUI2_NODE_CATALOG.map((item) => item.actionId)

			expect(actionIds).toContain('text-generation')
			expect(actionIds).toContain('image-generation')
			expect(actionIds).toContain('video-generation')
			expect(actionIds).toContain('model3d')
			expect(actionIds).toContain('meshy')
			expect(actionIds).toContain('unreal-export')
			expect(actionIds).toContain('scene-understanding')
			expect(actionIds).toContain('scene-layout')
			expect(actionIds).toContain('scene-decompose')
			expect(actionIds).toContain('comfyui')
			expect(actionIds).toContain('rotate-image')
		})

		it('不应该包含已删除的节点', () => {
			const actionIds = NEWUI2_NODE_CATALOG.map((item) => item.actionId)

			expect(actionIds).not.toContain('text-input')
			expect(actionIds).not.toContain('text-merge')
			expect(actionIds).not.toContain('story')
			expect(actionIds).not.toContain('base')
		})

		it('每个节点应该有唯一的actionId', () => {
			const actionIds = NEWUI2_NODE_CATALOG.map((item) => item.actionId)
			const uniqueIds = new Set(actionIds)
			expect(uniqueIds.size).toBe(actionIds.length)
		})

		it('每个节点应该有label', () => {
			NEWUI2_NODE_CATALOG.forEach((item) => {
				expect(item.label).toBeDefined()
				expect(item.label.length).toBeGreaterThan(0)
			})
		})

		it('每个节点应该有nodeType', () => {
			NEWUI2_NODE_CATALOG.forEach((item) => {
				expect(item.nodeType).toBeDefined()
			})
		})

		it('每个节点应该有inputKinds和outputKinds数组', () => {
			NEWUI2_NODE_CATALOG.forEach((item) => {
				expect(Array.isArray(item.inputKinds)).toBe(true)
				expect(Array.isArray(item.outputKinds)).toBe(true)
			})
		})

		it('每个节点应该有order排序字段', () => {
			NEWUI2_NODE_CATALOG.forEach((item) => {
				expect(typeof item.order).toBe('number')
			})
		})
	})

	describe('NEWUI2_NODE_TOP_CATEGORIES', () => {
		it('应该包含所有顶部分类', () => {
			const categoryIds = NEWUI2_NODE_TOP_CATEGORIES.map((cat) => cat.id)

			expect(categoryIds).toContain('inputs')
			expect(categoryIds).toContain('text')
			expect(categoryIds).toContain('image')
			expect(categoryIds).toContain('video')
			expect(categoryIds).toContain('scene')
			expect(categoryIds).toContain('model3d')
			expect(categoryIds).toContain('plugin')
		})

		it('每个分类应该有label和description', () => {
			NEWUI2_NODE_TOP_CATEGORIES.forEach((cat) => {
				expect(cat.label).toBeDefined()
				expect(cat.label.length).toBeGreaterThan(0)
				expect(cat.description).toBeDefined()
				expect(cat.description.length).toBeGreaterThan(0)
			})
		})

		it('每个分类应该有iconKey', () => {
			NEWUI2_NODE_TOP_CATEGORIES.forEach((cat) => {
				expect(cat.iconKey).toBeDefined()
			})
		})

		it('Basic(inputs)分类应该是第一个', () => {
			expect(NEWUI2_NODE_TOP_CATEGORIES[0].id).toBe('inputs')
			expect(NEWUI2_NODE_TOP_CATEGORIES[0].label).toBe('Basic')
		})
	})

	describe('Basic分类节点', () => {
		it('总共应该有11个节点', () => {
			expect(NEWUI2_NODE_CATALOG).toHaveLength(11)
		})

		it('文本节点应该存在', () => {
			const textNode = NEWUI2_NODE_CATALOG.find((n) => n.actionId === 'text-generation')
			expect(textNode).toBeDefined()
			expect(textNode!.label).toBe('文本节点')
		})

		it('图片节点应该存在', () => {
			const imageNode = NEWUI2_NODE_CATALOG.find((n) => n.actionId === 'image-generation')
			expect(imageNode).toBeDefined()
			expect(imageNode!.label).toBe('图片节点')
		})

		it('视频节点应该存在', () => {
			const videoNode = NEWUI2_NODE_CATALOG.find((n) => n.actionId === 'video-generation')
			expect(videoNode).toBeDefined()
			expect(videoNode!.label).toBe('视频节点')
		})

		it('3D模型节点应该存在', () => {
			const model3dNode = NEWUI2_NODE_CATALOG.find((n) => n.actionId === 'model3d')
			expect(model3dNode).toBeDefined()
			expect(model3dNode!.label).toBe('3D模型节点')
		})

		it('Unreal导出节点应该存在', () => {
			const unrealNode = NEWUI2_NODE_CATALOG.find((n) => n.actionId === 'unreal-export')
			expect(unrealNode).toBeDefined()
			expect(unrealNode!.label).toBe('Unreal导出节点')
		})
	})

	describe('各分类节点数量', () => {
		it('文本相关节点应该有1个', () => {
			const textNodes = NEWUI2_NODE_CATALOG.filter((n) => n.nodeType === 'text')
			expect(textNodes).toHaveLength(1)
			expect(textNodes[0].actionId).toBe('text-generation')
		})

		it('图片相关节点应该有3个', () => {
			const imageNodes = NEWUI2_NODE_CATALOG.filter((n) =>
				['image', 'rotate-image', 'comfyui'].includes(n.nodeType)
			)
			expect(imageNodes).toHaveLength(3)
		})

		it('视频节点应该有1个', () => {
			const videoNodes = NEWUI2_NODE_CATALOG.filter((n) => n.nodeType === 'video')
			expect(videoNodes).toHaveLength(1)
		})

		it('场景节点应该有3个', () => {
			const sceneNodes = NEWUI2_NODE_CATALOG.filter((n) =>
				['scene-understanding', 'scene-layout', 'scene-decompose'].includes(n.nodeType)
			)
			expect(sceneNodes).toHaveLength(3)
		})

		it('3D相关节点应该有2个', () => {
			const model3dNodes = NEWUI2_NODE_CATALOG.filter((n) =>
				['model3d', 'meshy'].includes(n.nodeType)
			)
			expect(model3dNodes).toHaveLength(2)
		})

		it('Unreal导出节点应该有1个', () => {
			const unrealNodes = NEWUI2_NODE_CATALOG.filter((n) => n.nodeType === 'unreal-export')
			expect(unrealNodes).toHaveLength(1)
		})
	})
})
