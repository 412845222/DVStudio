import { ref, toRaw } from 'vue'
import type { TemplateItem, TemplateCategory } from './types'
import {
	getWorkshopTemplatesPlatform,
	queryWorkshopTemplates,
	downloadWorkshopTemplate,
	getWorkshopTemplatesDownloadProgress,
	getWorkshopTemplatesInstallInfo,
} from '../../electronBridge'
import { useTemplatePersistence } from './useTemplatePersistence'

console.log('[workshop-templates] Module loaded, electronBridge available:', !!window?.dweb?.workshopTemplates)

const workshopPlatformState = ref<{
	ok: boolean
	platformAvailable: boolean
	platformId?: string
	platformName?: string
} | null>(null)

const workshopTemplates = ref<TemplateItem[]>([])
const loadingWorkshopTemplates = ref(false)
const downloadingTemplateId = ref<string | null>(null)
const downloadProgress = ref<Record<string, { progress: number; state: string }>>({})

let _workshopInitialized = false

const { saveUserTemplate } = useTemplatePersistence()

export function useWorkshopTemplates() {
	async function ensureWorkshopAvailable(): Promise<boolean> {
		try {
			console.log('[workshop-templates] Checking workshop platform availability...')
			const platform = await getWorkshopTemplatesPlatform()
			console.log('[workshop-templates] Platform result:', platform)
			if (!platform?.ok) {
				console.warn('[workshop-templates] Workshop platform query failed:', platform?.errMsg || 'unknown error')
				workshopPlatformState.value = null
				return false
			}
			workshopPlatformState.value = platform
			console.log('[workshop-templates] Workshop platform info:', platform.platformId, platform.platformName, 'available:', platform.platformAvailable)
			return true
		} catch (err) {
			console.error('[workshop-templates] ensureWorkshopAvailable error:', err)
			workshopPlatformState.value = null
			return false
		}
	}

	async function loadWorkshopTemplates(options: { tag?: string; limit?: number; offset?: number } = {}): Promise<TemplateItem[]> {
		loadingWorkshopTemplates.value = true
		try {
			const available = await ensureWorkshopAvailable()
			if (!available) {
				workshopTemplates.value = []
				_workshopInitialized = true
				return []
			}

			console.log('[workshop-templates] Calling queryWorkshopTemplates with options:', options)
			const result = await queryWorkshopTemplates(options)
			console.log('[workshop-templates] queryWorkshopTemplates result:', result?.ok ? `${result.items?.length || 0} items` : `error: ${result?.errMsg || 'null result'}`)

			if (!result?.ok || !result.items) {
				console.warn('[workshop-templates] queryWorkshopTemplates failed:', result?.errMsg || 'null result')
				workshopTemplates.value = []
				_workshopInitialized = true
				return []
			}

			const items: TemplateItem[] = result.items.map((item) => ({
				id: item.publishedFileId,
				name: item.title,
				description: item.description || '',
				category: (item.tags?.find(t => t !== 'official') || 'other') as TemplateCategory,
				source: 'steam-workshop',
				tags: item.tags || [],
				createdAt: item.createdAt,
				updatedAt: item.updatedAt,
				author: item.author || '官方',
				isOfficial: item.isOfficial,
				workshopAuthor: item.author,
				workshopItemId: item.publishedFileId,
				thumbnail: item.previewUrl,
			}))

			workshopTemplates.value = items
			_workshopInitialized = true
			console.log('[workshop-templates] Workshop templates loaded:', items.length)
			return items
		} catch (err) {
			console.error('[workshop-templates] loadWorkshopTemplates error:', err)
			workshopTemplates.value = []
			_workshopInitialized = true
			return []
		} finally {
			loadingWorkshopTemplates.value = false
		}
	}

	async function downloadTemplateFromWorkshop(publishedFileId: string): Promise<{
		meta: TemplateItem
		zipBlob: Blob
		coverBlob: Blob | null
		savedTemplate: TemplateItem | null
	} | null> {
		downloadingTemplateId.value = publishedFileId
		try {
			console.log('[workshop-templates] Starting download:', publishedFileId)
			const result = await downloadWorkshopTemplate({ publishedFileId })
			console.log('[workshop-templates] downloadWorkshopTemplate result:', result?.ok ? 'success' : `error: ${result?.errMsg || 'unknown'}`)

			if (!result?.ok || !result.zipData) {
				console.error('[workshop-templates] Download failed:', result?.errMsg || 'no zip data')
				return null
			}

			const zipBlob = new Blob([result.zipData], { type: 'application/zip' })
			const coverBlob = result.coverData ? new Blob([result.coverData], { type: 'image/png' }) : null

			const templateItem = workshopTemplates.value.find(t => t.id === publishedFileId)
			const metaData = result.metadata as Record<string, string> | undefined

			const meta: TemplateItem = {
				id: result.publishedFileId,
				name: templateItem?.name || metaData?.name || '未命名模板',
				description: templateItem?.description || metaData?.description || '',
				category: (templateItem?.category || metaData?.category || 'other') as TemplateCategory,
				source: 'user',
				tags: templateItem?.tags || [],
				createdAt: templateItem?.createdAt || Date.now(),
				updatedAt: Date.now(),
				author: templateItem?.author || metaData?.author || '官方',
				isOfficial: templateItem?.isOfficial || true,
				workshopItemId: result.publishedFileId,
			}

			console.log('[workshop-templates] Saving downloaded template to local database:', meta.name)
			const savedTemplate = await saveUserTemplate({
				name: meta.name,
				description: meta.description,
				category: meta.category,
				tags: meta.tags,
				blob: zipBlob,
				coverBlob,
			})

			console.log('[workshop-templates] Template saved to local database:', savedTemplate ? savedTemplate.id : 'failed')

			return { meta, zipBlob, coverBlob, savedTemplate }
		} catch (err) {
			console.error('[workshop-templates] downloadTemplateFromWorkshop error:', err)
			return null
		} finally {
			downloadingTemplateId.value = null
			delete downloadProgress.value[publishedFileId]
		}
	}

	async function getDownloadProgress(publishedFileId: string): Promise<{ progress: number; state: string } | null> {
		try {
			const result = await getWorkshopTemplatesDownloadProgress({ publishedFileId })
			if (!result?.ok) return null
			return result.progress || null
		} catch (err) {
			console.error('[workshop-templates] getDownloadProgress error:', err)
			return null
		}
	}

	async function getInstallInfo(publishedFileId: string): Promise<{ installed: boolean; installPath?: string } | null> {
		try {
			const result = await getWorkshopTemplatesInstallInfo({ publishedFileId })
			if (!result?.ok) return null
			return { installed: result.installed || false, installPath: result.installPath }
		} catch (err) {
			console.error('[workshop-templates] getInstallInfo error:', err)
			return null
		}
	}

	return {
		workshopTemplates,
		loadingWorkshopTemplates,
		downloadingTemplateId,
		downloadProgress,
		workshopPlatform: workshopPlatformState,
		workshopInitialized: _workshopInitialized,
		ensureWorkshopAvailable,
		loadWorkshopTemplates,
		downloadTemplateFromWorkshop,
		getDownloadProgress,
		getInstallInfo,
	}
}