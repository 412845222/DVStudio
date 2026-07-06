import { ref, toRaw } from 'vue'
import type { TemplateItem, TemplateCategory, CloudSyncStatus } from './types'
import {
	getCloudTemplatesPlatform,
	getCloudTemplatesQuota,
	listCloudTemplates,
	uploadCloudTemplate,
	downloadCloudTemplate,
	deleteCloudTemplate as deleteCloudTemplateApi,
} from '../../electronBridge'

const cloudPlatformState = ref<{
	ok: boolean
	platformId?: string
	platformName?: string
} | null>(null)

const cloudQuotaState = ref<{
	totalBytes: number
	availableBytes: number
} | null>(null)

const cloudSyncingState = ref(false)
const cloudLastSyncedAt = ref<number | null>(null)

export function useCloudTemplatePersistence() {
	const cloudTemplates = ref<TemplateItem[]>([])
	const loadingCloudTemplates = ref(false)
	const uploadingTemplateId = ref<string | null>(null)
	const downloadingTemplateId = ref<string | null>(null)

	async function ensureCloudAvailable(): Promise<boolean> {
		try {
			console.log('[cloud-templates] Checking cloud platform availability...')
			const platform = await getCloudTemplatesPlatform()
			console.log('[cloud-templates] Platform result:', platform)
			if (!platform?.ok) {
				console.warn('[cloud-templates] Cloud platform not available:', platform?.errMsg || 'unknown error')
				return false
			}
			cloudPlatformState.value = platform
			console.log('[cloud-templates] Cloud platform available:', platform.platformId, platform.platformName)
			return true
		} catch (err) {
			console.error('[cloud-templates] ensureCloudAvailable error:', err)
			return false
		}
	}

	async function loadCloudQuota(): Promise<boolean> {
		try {
			const quota = await getCloudTemplatesQuota()
			if (!quota?.ok || !quota.quota) return false
			cloudQuotaState.value = quota.quota
			return true
		} catch {
			return false
		}
	}

	async function loadCloudTemplates(): Promise<TemplateItem[]> {
		loadingCloudTemplates.value = true
		try {
			const available = await ensureCloudAvailable()
			if (!available) {
				cloudTemplates.value = []
				return []
			}

			await loadCloudQuota()

			const result = await listCloudTemplates()
			if (!result?.ok || !result.items) {
				cloudTemplates.value = []
				return []
			}

			cloudLastSyncedAt.value = result.lastSyncedAt || null

			const items: TemplateItem[] = result.items.map((meta) => ({
				id: meta.id,
				name: meta.name,
				description: meta.description || '',
				category: (meta.category || 'other') as TemplateCategory,
				source: 'steam-user',
				tags: meta.tags || [],
				createdAt: meta.createdAt,
				updatedAt: meta.updatedAt,
				nodeCount: meta.nodeCount,
				steamFileId: meta.packageFileName,
				cloudSyncStatus: 'synced' as CloudSyncStatus,
				lastSyncAt: meta.updatedAt,
				author: cloudPlatformState.value?.platformName || 'Cloud',
			}))

			cloudTemplates.value = items
			return items
		} catch {
			cloudTemplates.value = []
			return []
		} finally {
			loadingCloudTemplates.value = false
		}
	}

	async function uploadTemplateToCloud(template: TemplateItem, zipBlob: Blob, coverBlob?: Blob | null): Promise<boolean> {
		uploadingTemplateId.value = template.id
		const rawTemplate = toRaw(template)
		console.log('[cloud-templates] Starting upload:', rawTemplate.id, rawTemplate.name, 'zipSize:', zipBlob.size, 'hasCover:', !!coverBlob)
		try {
			const available = await ensureCloudAvailable()
			if (!available) {
				console.error('[cloud-templates] Upload aborted: cloud not available')
				return false
			}

			const zipData = await zipBlob.arrayBuffer()
			let coverData: ArrayBuffer | null = null
			if (coverBlob) {
				coverData = await coverBlob.arrayBuffer()
			}

			console.log('[cloud-templates] Sending upload request to backend...')
			const result = await uploadCloudTemplate({
				id: rawTemplate.id,
				name: rawTemplate.name,
				description: rawTemplate.description || '',
				category: rawTemplate.category,
				tags: [...(rawTemplate.tags || [])],
				nodeCount: rawTemplate.nodeCount || 0,
				zipData,
				coverData,
			})

			console.log('[cloud-templates] Upload result:', result)
			if (!result?.ok) {
				console.error('[cloud-templates] Upload failed:', result?.errMsg || 'unknown error')
				return false
			}

			await loadCloudTemplates()
			console.log('[cloud-templates] Upload complete, templates reloaded')
			return true
		} catch (err) {
			console.error('[cloud-templates] uploadTemplateToCloud error:', err)
			return false
		} finally {
			uploadingTemplateId.value = null
		}
	}

	async function downloadTemplateFromCloud(templateId: string): Promise<{
		meta: TemplateItem
		zipBlob: Blob
		coverBlob: Blob | null
	} | null> {
		downloadingTemplateId.value = templateId
		try {
			const result = await downloadCloudTemplate({ id: templateId })
			if (!result?.ok || !result.zipData || !result.meta) return null

			const zipBlob = new Blob([result.zipData], { type: 'application/zip' })
			const coverBlob = result.coverData ? new Blob([result.coverData], { type: 'image/png' }) : null

			const meta: TemplateItem = {
				id: result.meta.id,
				name: result.meta.name,
				description: result.meta.description || '',
				category: (result.meta.category || 'other') as TemplateCategory,
				source: 'steam-user',
				tags: result.meta.tags || [],
				createdAt: result.meta.createdAt,
				updatedAt: result.meta.updatedAt,
				nodeCount: result.meta.nodeCount,
				steamFileId: result.meta.packageFileName,
				cloudSyncStatus: 'synced',
				lastSyncAt: result.meta.updatedAt,
				author: cloudPlatformState.value?.platformName || 'Cloud',
			}

			return { meta, zipBlob, coverBlob }
		} catch {
			return null
		} finally {
			downloadingTemplateId.value = null
		}
	}

	async function deleteCloudTemplate(templateId: string): Promise<boolean> {
		try {
			const result = await deleteCloudTemplateApi({ id: templateId })
			if (!result?.ok) return false
			cloudTemplates.value = cloudTemplates.value.filter((t) => t.id !== templateId)
			return true
		} catch {
			return false
		}
	}

	async function refreshCloudSync() {
		cloudSyncingState.value = true
		try {
			await loadCloudTemplates()
			await loadCloudQuota()
		} finally {
			cloudSyncingState.value = false
		}
	}

	return {
		cloudTemplates,
		loadingCloudTemplates,
		uploadingTemplateId,
		downloadingTemplateId,
		cloudPlatform: cloudPlatformState,
		cloudQuota: cloudQuotaState,
		cloudSyncing: cloudSyncingState,
		cloudLastSyncedAt,
		ensureCloudAvailable,
		loadCloudQuota,
		loadCloudTemplates,
		uploadTemplateToCloud,
		downloadTemplateFromCloud,
		deleteCloudTemplate,
		refreshCloudSync,
	}
}
