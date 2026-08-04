import { ref } from 'vue'
import type { TemplateItem, TemplateCategory } from './types'

async function ensureDbReady(): Promise<boolean> {
	const db = window?.dweb?.aiworkflow?.db
	if (!db) return false
	try {
		const state = await db._initState?.()
		if (state?.ok === true) return true
		const retry = await db._ensureInitialized?.()
		return retry?.ok === true
	} catch {
		return false
	}
}

function getTemplatesDb() {
	return window?.dweb?.aiworkflow?.db?.templates
}

export function useTemplatePersistence() {
	const userTemplates = ref<TemplateItem[]>([])
	const loadingUserTemplates = ref(false)

	async function loadUserTemplates(): Promise<TemplateItem[]> {
		loadingUserTemplates.value = true
		try {
			await ensureDbReady()
			const db = getTemplatesDb()
			if (!db?.list) {
				userTemplates.value = []
				return []
			}
			const result = await db.list()
			if (!result?.ok || !result.value) {
				userTemplates.value = []
				return []
			}
			const items = result.value
			const templateItems: TemplateItem[] = items.map((item) => ({
				id: item.id,
				name: item.name,
				description: item.description,
				category: item.category as TemplateCategory,
				source: 'user',
				tags: item.tags,
				createdAt: item.createdAt,
				updatedAt: item.updatedAt,
				nodeCount: item.nodeCount,
				coverPath: item.coverPath || '',
				author: 'User'
			}))
			templateItems.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
			userTemplates.value = templateItems
			return templateItems
		} catch {
			userTemplates.value = []
			return []
		} finally {
			loadingUserTemplates.value = false
		}
	}

	async function saveUserTemplate(options: {
		id?: string
		name: string
		description?: string
		category: TemplateCategory
		tags?: string[]
		blob: Blob
		nodeCount?: number
		coverBlob?: Blob | null
	}): Promise<TemplateItem | null> {
		try {
			await ensureDbReady()
			const db = getTemplatesDb()
			if (!db?.save) return null
			const arrayBuffer = await options.blob.arrayBuffer()
			let coverArrayBuffer: ArrayBuffer | null = null
			if (options.coverBlob) {
				coverArrayBuffer = await options.coverBlob.arrayBuffer()
			}
			const result = await db.save({
				id: options.id,
				name: options.name,
				description: options.description,
				category: options.category,
				tags: options.tags,
				nodeCount: options.nodeCount,
				zipBuffer: arrayBuffer,
				coverBuffer: coverArrayBuffer
			})
			if (!result?.ok || !result.template) return null
			const t = result.template as {
				id: string
				name: string
				description: string
				category: string
				tags: string[]
				nodeCount: number
				coverPath?: string
				createdAt: number
				updatedAt: number
			}
			const newTemplate: TemplateItem = {
				id: t.id,
				name: t.name,
				description: t.description,
				category: t.category as TemplateCategory,
				source: 'user',
				tags: t.tags,
				createdAt: t.createdAt,
				updatedAt: t.updatedAt,
				nodeCount: t.nodeCount,
				coverPath: t.coverPath || '',
				author: 'User'
			}
			userTemplates.value = [newTemplate, ...userTemplates.value]
			return newTemplate
		} catch {
			return null
		}
	}

	async function deleteUserTemplate(templateId: string): Promise<boolean> {
		try {
			await ensureDbReady()
			const db = getTemplatesDb()
			if (!db?.remove) return false
			const result = await db.remove({ id: templateId })
			if (!result?.ok) return false
			userTemplates.value = userTemplates.value.filter((t) => t.id !== templateId)
			return true
		} catch {
			return false
		}
	}

	async function loadTemplateBlob(templateId: string): Promise<Blob | null> {
		try {
			await ensureDbReady()
			const db = getTemplatesDb()
			if (!db?.getBlob) return null
			const result = await db.getBlob({ id: templateId })
			if (!result?.ok || !result.buffer) return null
			return new Blob([result.buffer], { type: 'application/zip' })
		} catch {
			return null
		}
	}

	async function loadTemplateCoverBlob(templateId: string): Promise<Blob | null> {
		try {
			await ensureDbReady()
			const db = getTemplatesDb()
			if (!db?.getCover) return null
			const result = await db.getCover({ id: templateId })
			if (!result?.ok || !result.buffer) return null
			return new Blob([result.buffer], { type: result.mimeType || 'image/png' })
		} catch {
			return null
		}
	}

	return {
		userTemplates,
		loadingUserTemplates,
		loadUserTemplates,
		saveUserTemplate,
		deleteUserTemplate,
		loadTemplateBlob,
		loadTemplateCoverBlob
	}
}
