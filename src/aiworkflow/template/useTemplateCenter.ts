import { computed, ref } from 'vue'
import type { TemplateItem, TemplateCategory, TemplateSource, TemplateViewMode } from './types'
import { getBuiltinTemplates, generateBuiltinTemplateBlob } from './builtinTemplates'
import { useTemplatePersistence } from './useTemplatePersistence'

export type TemplateSortBy = 'newest' | 'name'

const templatesState = ref<TemplateItem[]>([])
const loadingState = ref(false)
const loadingPackageState = ref(false)
const searchKeywordState = ref('')
const selectedCategoryState = ref<TemplateCategory | 'all'>('all')
const selectedSourceState = ref<TemplateSource | 'all'>('all')
const sortByState = ref<TemplateSortBy>('newest')
const viewModeState = ref<TemplateViewMode>('grid-large')
const selectedTemplateState = ref<TemplateItem | null>(null)
let initialized = false

export function useTemplateCenter() {
	const persistence = useTemplatePersistence()

	const filteredTemplates = computed(() => {
		let result = [...templatesState.value]

		if (searchKeywordState.value.trim()) {
			const keyword = searchKeywordState.value.toLowerCase().trim()
			result = result.filter(
				(t) =>
					t.name.toLowerCase().includes(keyword) ||
					t.description.toLowerCase().includes(keyword) ||
					t.tags?.some((tag) => tag.toLowerCase().includes(keyword))
			)
		}

		if (selectedCategoryState.value !== 'all') {
			result = result.filter((t) => t.category === selectedCategoryState.value)
		}

		if (selectedSourceState.value !== 'all') {
			result = result.filter((t) => t.source === selectedSourceState.value)
		}

		if (sortByState.value === 'name') {
			result.sort((a, b) => a.name.localeCompare(b.name))
		} else {
			result.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
		}

		return result
	})

	async function loadTemplates() {
		if (initialized && templatesState.value.length > 0) {
			const userTemplates = await persistence.loadUserTemplates()
			const builtinOnly = templatesState.value.filter((t) => t.source === 'builtin')
			templatesState.value = [...builtinOnly, ...userTemplates]
			return
		}

		loadingState.value = true
		try {
			const builtinConfigs = getBuiltinTemplates()
			const builtinTemplates: TemplateItem[] = builtinConfigs.map((config) => ({
				id: config.id,
				name: config.name,
				description: config.description,
				category: config.category,
				source: 'builtin',
				thumbnail: config.thumbnail,
				packagePath: config.packagePath,
				author: config.author,
				version: config.version,
				tags: config.tags,
				nodeCount: config.nodeCount,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}))

			const userTemplates = await persistence.loadUserTemplates()
			templatesState.value = [...builtinTemplates, ...userTemplates]
			initialized = true
		} finally {
			loadingState.value = false
		}
	}

	async function loadTemplatePackage(template: TemplateItem): Promise<Blob | null> {
		if (template.packageData) {
			return template.packageData
		}

		loadingPackageState.value = true
		try {
			if (template.source === 'user') {
				const blob = await persistence.loadTemplateBlob(template.id)
				if (blob) {
					template.packageData = blob
				}
				return blob
			}

			if (template.packagePath?.startsWith('builtin:')) {
				const blob = await generateBuiltinTemplateBlob(template.packagePath)
				if (blob) {
					template.packageData = blob
				}
				return blob
			}

			if (!template.packagePath) {
				return null
			}

			const response = await fetch(template.packagePath)
			if (!response.ok) {
				return null
			}
			const blob = await response.blob()
			template.packageData = blob
			return blob
		} catch {
			return null
		} finally {
			loadingPackageState.value = false
		}
	}

	function selectTemplate(template: TemplateItem | null) {
		selectedTemplateState.value = template
	}

	function setViewMode(mode: TemplateViewMode) {
		viewModeState.value = mode
	}

	function clearFilters() {
		searchKeywordState.value = ''
		selectedCategoryState.value = 'all'
		selectedSourceState.value = 'all'
		sortByState.value = 'newest'
	}

	async function addUserTemplate(template: TemplateItem) {
		templatesState.value = [template, ...templatesState.value.filter((t) => t.source !== 'user' || t.id !== template.id)]
	}

	async function deleteTemplate(template: TemplateItem): Promise<boolean> {
		if (template.source === 'user') {
			const ok = await persistence.deleteUserTemplate(template.id)
			if (ok) {
				templatesState.value = templatesState.value.filter((t) => t.id !== template.id)
				if (selectedTemplateState.value?.id === template.id) {
					selectedTemplateState.value = null
				}
			}
			return ok
		}
		return false
	}

	async function saveUserTemplateFromBlob(options: {
		name: string
		description?: string
		category: TemplateCategory
		tags?: string[]
		blob: Blob
		nodeCount?: number
	}): Promise<TemplateItem | null> {
		const saved = await persistence.saveUserTemplate(options)
		if (saved) {
			await addUserTemplate(saved)
		}
		return saved
	}

	return {
		templates: templatesState,
		loading: loadingState,
		loadingPackage: loadingPackageState,
		searchKeyword: searchKeywordState,
		selectedCategory: selectedCategoryState,
		selectedSource: selectedSourceState,
		sortBy: sortByState,
		viewMode: viewModeState,
		selectedTemplate: selectedTemplateState,
		filteredTemplates,
		loadTemplates,
		loadTemplatePackage,
		selectTemplate,
		setViewMode,
		clearFilters,
		addUserTemplate,
		deleteTemplate,
		saveUserTemplateFromBlob,
	}
}
