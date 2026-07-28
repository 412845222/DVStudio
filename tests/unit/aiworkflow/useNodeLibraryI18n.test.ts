import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useNodeLibraryI18n } from '@/aiworkflow/useNodeLibraryI18n'
import { I18nStore } from '@/store/i18n/store'
import { NEWUI2_NODE_CATALOG_CATEGORIES, NEWUI2_NODE_TOP_CATEGORIES, NEWUI2_NODE_SPECIAL_GROUPS, NEWUI2_NODE_CATALOG } from '@/aiworkflow/nodeLibrary'

describe('useNodeLibraryI18n', () => {
	beforeEach(() => {
		I18nStore.commit('SET_LOCALE', 'zh-CN')
	})

	afterEach(() => {
		I18nStore.commit('SET_LOCALE', 'zh-CN')
	})

	it('should return translated categories with Chinese locale', () => {
		const { categories } = useNodeLibraryI18n()

		expect(categories.value).toHaveLength(NEWUI2_NODE_CATALOG_CATEGORIES.length)

		const basicCategory = categories.value.find((c) => c.id === 'basic')
		expect(basicCategory).toBeDefined()
		expect(basicCategory!.label).toBe('基础')
		expect(basicCategory!.description).toBe('文本、图片、视频、音频和3D流程的通用入口节点。')

		const image2dCategory = categories.value.find((c) => c.id === 'image2d')
		expect(image2dCategory).toBeDefined()
		expect(image2dCategory!.label).toBe('2D图片')
	})

	it('should return translated topCategories with Chinese locale', () => {
		const { topCategories } = useNodeLibraryI18n()

		expect(topCategories.value).toHaveLength(NEWUI2_NODE_TOP_CATEGORIES.length)

		const inputsCategory = topCategories.value.find((c) => c.id === 'inputs')
		expect(inputsCategory).toBeDefined()
		expect(inputsCategory!.label).toBe('基础')
		expect(inputsCategory!.description).toBe('文本输入、画布、便签和基础工作流节点。')

		const textCategory = topCategories.value.find((c) => c.id === 'text')
		expect(textCategory).toBeDefined()
		expect(textCategory!.label).toBe('文本')
	})

	it('should return translated specialGroups', () => {
		const { specialGroups } = useNodeLibraryI18n()

		expect(specialGroups.value).toHaveLength(NEWUI2_NODE_SPECIAL_GROUPS.length)
	})

	it('should return translated catalogItems with Chinese locale', () => {
		const { catalogItems } = useNodeLibraryI18n()

		expect(catalogItems.value).toHaveLength(NEWUI2_NODE_CATALOG.length)

		const textNode = catalogItems.value.find((n) => n.actionId === 'text-generation')
		expect(textNode).toBeDefined()
		expect(textNode!.label).toBe('文本节点')
		expect(textNode!.description).toBe('用于输入、编辑和输出提示词或说明文本。支持多语言输入，可作为其他节点的文本来源。')
		expect(textNode!.searchAliases).toEqual(['文本', 'prompt', 'llm'])

		const imageNode = catalogItems.value.find((n) => n.actionId === 'image-generation')
		expect(imageNode).toBeDefined()
		expect(imageNode!.label).toBe('图片节点')

		const unrealNode = catalogItems.value.find((n) => n.actionId === 'unreal-export')
		expect(unrealNode).toBeDefined()
		expect(unrealNode!.label).toBe('Unreal导出节点')
	})

	it('should return English translations when locale is en-US', () => {
		I18nStore.commit('SET_LOCALE', 'en-US')

		const { categories, topCategories, catalogItems } = useNodeLibraryI18n()

		const basicCategory = categories.value.find((c) => c.id === 'basic')
		expect(basicCategory!.label).toBe('Basic')
		expect(basicCategory!.description).toBe('General entry nodes for text, image, video, audio, and 3D workflows.')

		const inputsCategory = topCategories.value.find((c) => c.id === 'inputs')
		expect(inputsCategory!.label).toBe('Basic')

		const textNode = catalogItems.value.find((n) => n.actionId === 'text-generation')
		expect(textNode!.label).toBe('Text Node')
		expect(textNode!.description).toBe('Input, edit, and output prompts or descriptive text.')
		expect(textNode!.searchAliases).toEqual(['text', 'prompt', 'llm'])

		const imageNode = catalogItems.value.find((n) => n.actionId === 'image-generation')
		expect(imageNode!.label).toBe('Image Node')
	})

	it('should return translated searchAliases when available', () => {
		I18nStore.commit('SET_LOCALE', 'en-US')

		const { catalogItems } = useNodeLibraryI18n()

		const textNode = catalogItems.value.find((n) => n.actionId === 'text-generation')
		expect(textNode!.searchAliases).toEqual(['text', 'prompt', 'llm'])

		const imageNode = catalogItems.value.find((n) => n.actionId === 'image-generation')
		expect(imageNode!.searchAliases).toEqual(['image', 'picture', 'img'])
	})

	it('should preserve non-translated fields on catalog items', () => {
		const { catalogItems } = useNodeLibraryI18n()

		const textNode = catalogItems.value.find((n) => n.actionId === 'text-generation')
		expect(textNode!.actionId).toBe('text-generation')
		expect(textNode!.nodeType).toBe('text')
		expect(textNode!.inputKinds).toEqual(['text', 'image', 'video', 'model3d', 'audio', 'resource'])
		expect(textNode!.outputKinds).toEqual(['text'])
		expect(textNode!.order).toBe(10)
	})

	it('should preserve non-translated fields on categories', () => {
		const { categories } = useNodeLibraryI18n()

		const basicCategory = categories.value.find((c) => c.id === 'basic')
		expect(basicCategory!.id).toBe('basic')
	})

	it('should preserve non-translated fields on topCategories', () => {
		const { topCategories } = useNodeLibraryI18n()

		const inputsCategory = topCategories.value.find((c) => c.id === 'inputs')
		expect(inputsCategory!.id).toBe('inputs')
		expect(inputsCategory!.iconKey).toBe('inputs')
	})

	it('should be reactive to locale changes', () => {
		const { categories, topCategories, catalogItems } = useNodeLibraryI18n()

		const basicCategoryZh = categories.value.find((c) => c.id === 'basic')
		expect(basicCategoryZh!.label).toBe('基础')

		const textNodeZh = catalogItems.value.find((n) => n.actionId === 'text-generation')
		expect(textNodeZh!.label).toBe('文本节点')

		I18nStore.commit('SET_LOCALE', 'en-US')

		const basicCategoryEn = categories.value.find((c) => c.id === 'basic')
		expect(basicCategoryEn!.label).toBe('Basic')

		const textNodeEn = catalogItems.value.find((n) => n.actionId === 'text-generation')
		expect(textNodeEn!.label).toBe('Text Node')

		I18nStore.commit('SET_LOCALE', 'zh-CN')

		const basicCategoryZh2 = categories.value.find((c) => c.id === 'basic')
		expect(basicCategoryZh2!.label).toBe('基础')
	})

	it('should have consistent structure between original and translated catalog', () => {
		const { catalogItems } = useNodeLibraryI18n()

		expect(catalogItems.value.length).toBe(NEWUI2_NODE_CATALOG.length)

		catalogItems.value.forEach((item, index) => {
			const original = NEWUI2_NODE_CATALOG[index]
			expect(item.actionId).toBe(original.actionId)
			expect(item.nodeType).toBe(original.nodeType)
			expect(item.order).toBe(original.order)
			expect(item.inputKinds).toEqual(original.inputKinds)
			expect(item.outputKinds).toEqual(original.outputKinds)
		})
	})
})