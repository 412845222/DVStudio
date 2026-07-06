import { ref } from 'vue'
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
			const platform = await getCloudTemplatesPlatform()
			if (!platform?.ok) return false
			cloudPlatformState.value = platform
			return true
		} catch {
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
		try {
			const available = await ensureCloudAvailable()
			if (!available) return false

			const zipData = await zipBlob.arrayBuffer()
			let coverData: ArrayBuffer | null = null
			if (coverBlob) {
				coverData = await coverBlob.arrayBuffer()
			}

			const result = await uploadCloudTemplate({
				id: template.id,
				name: template.name,
				description: template.description,
				category: template.category,
				tags: template.tags,
				nodeCount: template.nodeCount,
				zipData,
				coverData,
			})

			if (!result?.ok) return false

			await loadCloudTemplates()
			return true
		} catch {
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
