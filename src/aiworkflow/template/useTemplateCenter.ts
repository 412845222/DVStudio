import { computed, ref } from 'vue'
import type { TemplateItem, TemplateCategory, TemplateSource, TemplateViewMode } from './types'
import { getBuiltinTemplates, generateBuiltinTemplateBlob } from './builtinTemplates'
import { useTemplatePersistence } from './useTemplatePersistence'
import { useCloudTemplatePersistence } from './useCloudTemplatePersistence'
import { parseTemplatePackageBlob, createCloudTemplatePackageZip } from './useTemplateMerge'

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
const coverUrlCache = new Map<string, string>()
let initialized = false

export function useTemplateCenter() {
	const persistence = useTemplatePersistence()
	const cloudPersistence = useCloudTemplatePersistence()

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

	const allSources: Array<{ value: TemplateSource | 'all'; label: string }> = [
		{ value: 'all', label: '全部' },
		{ value: 'builtin', label: '内置' },
		{ value: 'user', label: '我的' },
	]

	const cloudAvailable = computed(() => {
		return cloudPersistence.cloudPlatform.value?.ok === true
	})

	const cloudSources = computed(() => {
		if (!cloudAvailable.value) return allSources
		return [
			...allSources,
			{ value: 'steam-user' as TemplateSource, label: cloudPersistence.cloudPlatform.value?.platformName || '云端' },
		]
	})

	async function loadTemplates(options: { forceCloudRefresh?: boolean } = {}) {
		const { forceCloudRefresh = false } = options
		
		if (initialized && templatesState.value.length > 0) {
			const userTemplates = await persistence.loadUserTemplates()
			const cloudTemplates = await cloudPersistence.loadCloudTemplates({ forceRefresh: forceCloudRefresh })
			const builtinOnly = templatesState.value.filter((t) => t.source === 'builtin')
			templatesState.value = [...builtinOnly, ...userTemplates, ...cloudTemplates]
			markSyncStatus()
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
			const cloudTemplates = await cloudPersistence.loadCloudTemplates({ forceRefresh: true })
			templatesState.value = [...builtinTemplates, ...userTemplates, ...cloudTemplates]
			markSyncStatus()
			initialized = true
		} finally {
			loadingState.value = false
		}
	}

	function markSyncStatus() {
		const cloudIdSet = new Set<string>()
		templatesState.value.forEach((t) => {
			if (t.source === 'steam-user') {
				t.cloudSyncStatus = 'synced'
				cloudIdSet.add(t.id)
			}
		})

		templatesState.value.forEach((t) => {
			if (t.source === 'user') {
				const hasCloudVersion = cloudIdSet.has(t.id)
				t.cloudSyncStatus = hasCloudVersion ? 'synced' : 'local-only'
				if (hasCloudVersion) {
					const cloudVersion = templatesState.value.find((ct) => ct.source === 'steam-user' && ct.id === t.id)
					t.lastSyncAt = cloudVersion?.updatedAt
				} else {
					t.lastSyncAt = undefined
				}
			}
		})
	}

	async function loadTemplatePackage(template: TemplateItem): Promise<Blob | null> {
		if (template.packageData) {
			return template.packageData
		}

		loadingPackageState.value = true
		try {
			if (template.source === 'user') {
				console.log('[loadTemplatePackage] loading user template blob, id:', template.id)
				const blob = await persistence.loadTemplateBlob(template.id)
				if (blob) {
					template.packageData = blob
					console.log('[loadTemplatePackage] user template blob loaded, size:', blob.size)
				} else {
					console.error('[loadTemplatePackage] user template blob is null, id:', template.id)
				}
				return blob
			}

			if (template.source === 'steam-user') {
				console.log('[loadTemplatePackage] downloading cloud template, id:', template.id)
				const result = await cloudPersistence.downloadTemplateFromCloud(template.id)
				if (result) {
					template.packageData = result.zipBlob
					console.log('[loadTemplatePackage] cloud template downloaded, size:', result.zipBlob?.size)
				} else {
					console.error('[loadTemplatePackage] cloud template download returned null, id:', template.id)
				}
				return result?.zipBlob || null
			}

			if (template.packagePath?.startsWith('builtin:')) {
				console.log('[loadTemplatePackage] generating builtin template blob, path:', template.packagePath)
				const blob = await generateBuiltinTemplateBlob(template.packagePath)
				if (blob) {
					template.packageData = blob
					console.log('[loadTemplatePackage] builtin template blob generated, size:', blob.size)
				} else {
					console.error('[loadTemplatePackage] builtin template blob generation failed, path:', template.packagePath)
				}
				return blob
			}

			if (!template.packagePath) {
				console.error('[loadTemplatePackage] no packagePath for template:', template.id, template.name)
				return null
			}

			console.log('[loadTemplatePackage] fetching template from path:', template.packagePath)
			const response = await fetch(template.packagePath)
			if (!response.ok) {
				console.error('[loadTemplatePackage] fetch failed, status:', response.status, 'path:', template.packagePath)
				return null
			}
			const blob = await response.blob()
			template.packageData = blob
			console.log('[loadTemplatePackage] template fetched, size:', blob.size)
			return blob
		} catch (err) {
			console.error('[loadTemplatePackage] error loading template package, id:', template.id, 'name:', template.name, 'source:', template.source, 'error:', err)
			return null
		} finally {
			loadingPackageState.value = false
		}
	}

	async function loadTemplateCover(template: TemplateItem): Promise<string | null> {
		if (template.source === 'builtin' && template.thumbnail) {
			return template.thumbnail
		}
		if (coverUrlCache.has(template.id)) {
			return coverUrlCache.get(template.id)!
		}
		if (template.source === 'user') {
			try {
				const blob = await persistence.loadTemplateCoverBlob(template.id)
				if (!blob) return null
				const url = URL.createObjectURL(blob)
				coverUrlCache.set(template.id, url)
				template.coverUrl = url
				return url
			} catch {
				return null
			}
		}
		if (template.source === 'steam-user') {
			try {
				const result = await cloudPersistence.downloadTemplateFromCloud(template.id)
				if (!result?.coverBlob) return null
				const url = URL.createObjectURL(result.coverBlob)
				coverUrlCache.set(template.id, url)
				template.coverUrl = url
				return url
			} catch {
				return null
			}
		}
		return null
	}

	function revokeTemplateCover(templateId: string) {
		const url = coverUrlCache.get(templateId)
		if (url) {
			URL.revokeObjectURL(url)
			coverUrlCache.delete(templateId)
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
		markSyncStatus()
	}

	async function deleteTemplate(template: TemplateItem): Promise<boolean> {
		if (template.source === 'user') {
			const ok = await persistence.deleteUserTemplate(template.id)
			if (ok) {
				revokeTemplateCover(template.id)
				templatesState.value = templatesState.value.filter((t) => !(t.source === 'user' && t.id === template.id))
				if (selectedTemplateState.value?.id === template.id && selectedTemplateState.value?.source === 'user') {
					selectedTemplateState.value = null
				}
				markSyncStatus()
			}
			return ok
		}
		if (template.source === 'steam-user') {
			const ok = await cloudPersistence.deleteCloudTemplate(template.id)
			if (ok) {
				revokeTemplateCover(template.id)
				templatesState.value = templatesState.value.filter((t) => !(t.source === 'steam-user' && t.id === template.id))
				if (selectedTemplateState.value?.id === template.id && selectedTemplateState.value?.source === 'steam-user') {
					selectedTemplateState.value = null
				}
				await cloudPersistence.loadCloudQuota()
				markSyncStatus()
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
		coverBlob?: Blob | null
	}): Promise<TemplateItem | null> {
		const saved = await persistence.saveUserTemplate(options)
		if (saved) {
			await addUserTemplate(saved)
		}
		return saved
	}

	async function uploadToCloud(template: TemplateItem): Promise<{ ok: boolean; errMsg?: string }> {
		console.log('[template-center] uploadToCloud called for:', template.id, template.name, 'source:', template.source)
		if (template.source !== 'user') {
			console.warn('[template-center] Cannot upload: template source is not user:', template.source)
			return { ok: false, errMsg: 'Only local templates can be uploaded' }
		}

		console.log('[template-center] Loading template blob...')
		const localZipBlob = await persistence.loadTemplateBlob(template.id)
		if (!localZipBlob) {
			console.error('[template-center] Failed to load template blob for:', template.id)
			return { ok: false, errMsg: 'Failed to load template data' }
		}
		console.log('[template-center] Local template blob loaded, size:', localZipBlob.size)

		const coverBlob = await persistence.loadTemplateCoverBlob(template.id)
		console.log('[template-center] Cover blob:', coverBlob ? 'loaded' : 'not found')

		console.log('[template-center] Parsing local template to extract blueprint...')
		const parsed = await parseTemplatePackageBlob(localZipBlob)
		if (!parsed.snapshot) {
			console.error('[template-center] Failed to parse template package')
			return { ok: false, errMsg: 'Failed to parse template data' }
		}

		console.log('[template-center] Creating cloud-optimized package (no assets)...')
		const cloudZipBlob = await createCloudTemplatePackageZip(
			parsed.snapshot,
			template.name,
			coverBlob,
			parsed.templateCode || template.id
		)
		console.log('[template-center] Cloud package created, size:', cloudZipBlob.size, '(original:', localZipBlob.size, ')')

		const ok = await cloudPersistence.uploadTemplateToCloud(template, cloudZipBlob, coverBlob)
		if (ok) {
			template.cloudSyncStatus = 'synced'
			template.lastSyncAt = Date.now()
			const newCloudTemplates = await cloudPersistence.loadCloudTemplates()
			templatesState.value = [
				...templatesState.value.filter((t) => t.source !== 'steam-user'),
				...newCloudTemplates,
			]
			markSyncStatus()
			console.log('[template-center] Upload successful')
			return { ok: true }
		}
		console.error('[template-center] Upload failed')
		return { ok: false, errMsg: 'Upload failed, check console for details' }
	}

	async function downloadFromCloud(template: TemplateItem): Promise<TemplateItem | null> {
		if (template.source !== 'steam-user') return null

		const result = await cloudPersistence.downloadTemplateFromCloud(template.id)
		if (!result) return null

		const saved = await persistence.saveUserTemplate({
			id: result.meta.id,
			name: result.meta.name,
			description: result.meta.description,
			category: result.meta.category,
			tags: result.meta.tags,
			blob: result.zipBlob,
			nodeCount: result.meta.nodeCount,
			coverBlob: result.coverBlob,
		})
		if (saved) {
			saved.cloudSyncStatus = 'synced'
			saved.lastSyncAt = result.meta.updatedAt
			templatesState.value = templatesState.value.filter((t) => !(t.source === 'user' && t.id === saved.id))
			templatesState.value = [saved, ...templatesState.value]
			markSyncStatus()
		}
		return saved
	}

	async function refreshCloud() {
		await cloudPersistence.refreshCloudSync()
		const userTemplates = await persistence.loadUserTemplates()
		const builtinOnly = templatesState.value.filter((t) => t.source === 'builtin')
		templatesState.value = [...builtinOnly, ...userTemplates, ...cloudPersistence.cloudTemplates.value]
		markSyncStatus()
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
		availableSources: cloudSources,
		cloudAvailable,
		cloudPlatform: cloudPersistence.cloudPlatform,
		cloudQuota: cloudPersistence.cloudQuota,
		cloudSyncing: cloudPersistence.cloudSyncing,
		cloudLastSyncedAt: cloudPersistence.cloudLastSyncedAt,
		uploadingTemplateId: cloudPersistence.uploadingTemplateId,
		downloadingTemplateId: cloudPersistence.downloadingTemplateId,
		loadTemplates,
		loadTemplatePackage,
		loadTemplateCover,
		revokeTemplateCover,
		selectTemplate,
		setViewMode,
		clearFilters,
		addUserTemplate,
		deleteTemplate,
		saveUserTemplateFromBlob,
		uploadToCloud,
		downloadFromCloud,
		refreshCloud,
	}
}
