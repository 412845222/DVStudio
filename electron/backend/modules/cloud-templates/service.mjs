import { getActiveCloudAdapter } from './adapters/factory.mjs'
import { getManager } from '../../../platform/manager.mjs'

const TEMPLATE_PATH_PREFIX = 'usertemplates/'
const INDEX_FILE = `${TEMPLATE_PATH_PREFIX}index.json`

export class CloudTemplatesService {
    constructor() {
        this._adapter = null
        this._platformManager = null
        this._cachedIndex = null
        this._indexLoaded = false
    }

    _ensureManager() {
        if (!this._platformManager) {
            this._platformManager = getManager()
        }
        return this._platformManager
    }

    _initAdapter() {
        const mgr = this._ensureManager()
        this._adapter = getActiveCloudAdapter(mgr, {
            pathPrefix: TEMPLATE_PATH_PREFIX,
        })
        console.log('[cloud-templates] adapter initialized:', this._adapter?.getPlatformId?.(), 'available:', this._adapter?.isAvailable?.())
    }

    getAdapter() {
        if (!this._adapter?.isAvailable()) {
            this._initAdapter()
        }
        return this._adapter
    }

    getPlatformId() {
        const adapter = this.getAdapter()
        return adapter.getPlatformId()
    }

    getPlatformName() {
        const adapter = this.getAdapter()
        return adapter.getPlatformName()
    }

    async getQuota() {
        return this.getAdapter().getQuota()
    }

    async _loadIndexFromCloud() {
        console.log('[cloud-templates] Reading index from cloud:', INDEX_FILE)
        const adapter = this.getAdapter()
        
        try {
            // First, list all files in cloud to see what's actually there
            console.log('[cloud-templates] Listing all files in cloud storage...')
            const allFilesResult = await adapter.listFiles('')
            if (allFilesResult.ok && allFilesResult.items) {
                console.log('[cloud-templates] Total files in cloud:', allFilesResult.items.length)
                for (const f of allFilesResult.items) {
                    console.log('[cloud-templates]  -', f.name, f.size, 'bytes')
                }
            } else {
                console.log('[cloud-templates] Could not list files:', allFilesResult.errMsg || 'unknown error')
            }

            // Also list files with our prefix
            const prefixFilesResult = await adapter.listFiles(TEMPLATE_PATH_PREFIX)
            if (prefixFilesResult.ok && prefixFilesResult.items) {
                console.log('[cloud-templates] Files under usertemplates/:', prefixFilesResult.items.length)
                for (const f of prefixFilesResult.items) {
                    console.log('[cloud-templates]  -', f.name, f.size, 'bytes')
                }
            }

            const existsResult = await adapter.fileExists(INDEX_FILE)
            console.log('[cloud-templates] Index file exists check for', INDEX_FILE, ':', JSON.stringify(existsResult))
            
            const fileExists = existsResult.ok && existsResult.exists
            if (!fileExists) {
                console.log('[cloud-templates] Index file does not exist in cloud, returning empty index')
                
                // If index doesn't exist but we have template files, log a warning
                if (prefixFilesResult.ok && prefixFilesResult.items && prefixFilesResult.items.length > 0) {
                    console.warn('[cloud-templates] WARNING: Template files exist but index.json is missing! Files:', 
                        prefixFilesResult.items.map(f => f.name).join(', '))
                }
                
                return { ok: true, index: this._createEmptyIndex(), fromCloud: false }
            }

            console.log('[cloud-templates] Index file exists, reading...')
            const result = await adapter.fileRead(INDEX_FILE)
            console.log('[cloud-templates] fileRead result:', result.ok ? `buffer size: ${result.buffer?.length || 0}` : `error: ${result.errMsg}`)
            
            if (!result.ok) {
                console.error('[cloud-templates] Failed to read index file - result not ok:', result.errMsg)
                return { ok: true, index: null, fromCloud: false, error: result.errMsg }
            }
            
            if (!result.buffer || result.buffer.length === 0) {
                console.error('[cloud-templates] Failed to read index file - buffer is empty or null')
                return { ok: true, index: null, fromCloud: false, error: 'Empty buffer returned' }
            }

            const content = result.buffer.toString('utf8')
            console.log('[cloud-templates] Index content length:', content.length, 'first 500 chars:', content.substring(0, 500))
            
            if (!content.trim()) {
                console.warn('[cloud-templates] Index file is empty')
                return { ok: true, index: null, fromCloud: false, error: 'Empty file content' }
            }

            let index
            try {
                index = JSON.parse(content)
            } catch (parseErr) {
                console.error('[cloud-templates] Failed to parse index JSON:', parseErr.message)
                return { ok: true, index: null, fromCloud: false, error: 'JSON parse error: ' + parseErr.message }
            }
            
            if (!index || !Array.isArray(index.templates)) {
                console.warn('[cloud-templates] Invalid index structure, resetting. templates field:', typeof index?.templates)
                return { ok: true, index: null, fromCloud: false, error: 'Invalid index structure' }
            }
            
            console.log('[cloud-templates] Parsed index from cloud, templates count:', index.templates.length)
            for (const t of index.templates) {
                console.log('[cloud-templates]  - cloud template:', t.id, t.name, 'package:', t.packageFileName)
            }
            return { ok: true, index, fromCloud: true }
        } catch (err) {
            console.error('[cloud-templates] Error loading index from cloud:', err.message, err.stack)
            return { ok: true, index: null, fromCloud: false, error: err.message }
        }
    }

    async _getIndex(options = {}) {
        const { forceRefresh = false } = options
        
        if (this._cachedIndex && this._indexLoaded && !forceRefresh) {
            console.log('[cloud-templates] Using cached index, templates:', this._cachedIndex.templates.length)
            return { ok: true, index: this._cachedIndex }
        }

        const result = await this._loadIndexFromCloud()
        if (result.fromCloud && result.index) {
            console.log('[cloud-templates] Caching index from cloud, templates:', result.index.templates.length)
            this._cachedIndex = result.index
            this._indexLoaded = true
        } else {
            console.log('[cloud-templates] Not caching index - failed to load from cloud:', result.error)
        }
        return { ok: true, index: result.index || this._cachedIndex || this._createEmptyIndex() }
    }

    _createEmptyIndex() {
        return {
            version: 1,
            templates: [],
            lastSyncedAt: Date.now(),
        }
    }

    async _saveIndex(index) {
        const content = JSON.stringify(index, null, 2)
        const buffer = Buffer.from(content, 'utf8')
        console.log('[cloud-templates] Saving index to cloud, size:', buffer.length, 'bytes, templates:', index.templates?.length || 0)
        
        const adapter = this.getAdapter()
        const result = await adapter.fileWrite(INDEX_FILE, buffer)
        
        if (result.ok) {
            this._cachedIndex = index
            this._indexLoaded = true
            console.log('[cloud-templates] Index saved successfully')
            
            const verifyExists = await adapter.fileExists(INDEX_FILE)
            console.log('[cloud-templates] Index file exists after write:', JSON.stringify(verifyExists))
            
            if (verifyExists.ok && verifyExists.exists) {
                const readBack = await adapter.fileRead(INDEX_FILE)
                if (readBack.ok && readBack.buffer && readBack.buffer.length > 0) {
                    try {
                        const verified = JSON.parse(readBack.buffer.toString('utf8'))
                        console.log('[cloud-templates] Index verified after write, templates:', verified.templates?.length || 0)
                    } catch (e) {
                        console.error('[cloud-templates] Index verification failed - parse error:', e.message, 'content length:', readBack.buffer.length)
                    }
                } else {
                    console.error('[cloud-templates] Index verification failed - could not read back:', readBack.errMsg, 'buffer:', readBack.buffer?.length || 0)
                }
            } else {
                console.error('[cloud-templates] Index verification failed - file does not exist after write!')
            }
        } else {
            console.error('[cloud-templates] Failed to save index:', result.errMsg)
        }
        return result
    }

    async uploadTemplate(options) {
        const { id, name, description, category, tags, nodeCount, zipBuffer, coverBuffer } = options

        console.log('[cloud-templates] service.uploadTemplate:', { id, name, zipSize: zipBuffer?.length, hasCover: !!(coverBuffer?.length) })

        const adapter = this.getAdapter()
        console.log('[cloud-templates] using adapter:', adapter.getPlatformId(), adapter.getPlatformName())

        const packageFileName = `${TEMPLATE_PATH_PREFIX}${id}.zip`
        const coverFileName = coverBuffer && coverBuffer.length > 0 ? `${TEMPLATE_PATH_PREFIX}${id}_cover.png` : ''

        console.log('[cloud-templates] writing package file:', packageFileName, 'size:', zipBuffer.length)
        const writeResult = await adapter.fileWrite(packageFileName, zipBuffer)
        if (!writeResult.ok) {
            console.error('[cloud-templates] failed to write package:', writeResult.errMsg)
            return { ok: false, errMsg: writeResult.errMsg || 'Failed to write template package' }
        }
        console.log('[cloud-templates] Package file written successfully')

        if (coverFileName) {
            console.log('[cloud-templates] writing cover file:', coverFileName, 'size:', coverBuffer.length)
            const coverResult = await adapter.fileWrite(coverFileName, coverBuffer)
            if (!coverResult.ok) {
                console.warn('[cloud-templates] Failed to write cover:', coverResult.errMsg)
            } else {
                console.log('[cloud-templates] Cover file written successfully')
            }
        }

        const { index } = await this._getIndex()
        const now = Date.now()
        const meta = {
            id,
            name,
            description: description || '',
            category: category || 'other',
            tags: Array.isArray(tags) ? [...tags] : [],
            createdAt: now,
            updatedAt: now,
            nodeCount: nodeCount || 0,
            packageFileName,
            coverFileName,
            packageSize: zipBuffer.length,
        }

        const existingIdx = index.templates.findIndex(t => t.id === id)
        if (existingIdx >= 0) {
            meta.createdAt = index.templates[existingIdx].createdAt
            index.templates[existingIdx] = meta
        } else {
            index.templates.push(meta)
        }
        index.lastSyncedAt = now

        console.log('[cloud-templates] Saving updated index with', index.templates.length, 'templates')
        const indexResult = await this._saveIndex(index)
        if (!indexResult.ok) {
            console.error('[cloud-templates] failed to save index:', indexResult.errMsg)
            return { ok: false, errMsg: 'Failed to update index' }
        }

        console.log('[cloud-templates] upload complete for:', id)

        try {
            const listResult = await adapter.listFiles(TEMPLATE_PATH_PREFIX)
            if (listResult.ok) {
                console.log('[cloud-templates] Files in cloud storage after upload:', listResult.items.length)
                for (const f of listResult.items) {
                    console.log('[cloud-templates]  -', f.name, f.size, 'bytes')
                }
            }
        } catch (e) {
            console.warn('[cloud-templates] Could not list files after upload:', e.message)
        }

        return { ok: true }
    }

    async downloadTemplate(templateId) {
        const { index } = await this._getIndex()
        const meta = index.templates.find(t => t.id === templateId)
        if (!meta) {
            console.error('[cloud-templates] Template not found in index:', templateId)
            return { ok: false, errMsg: 'Template not found' }
        }

        const adapter = this.getAdapter()

        console.log('[cloud-templates] Reading package:', meta.packageFileName)
        const packageResult = await adapter.fileRead(meta.packageFileName)
        if (!packageResult.ok || !packageResult.buffer || packageResult.buffer.length === 0) {
            console.error('[cloud-templates] Failed to read package:', packageResult.errMsg, 'buffer size:', packageResult.buffer?.length || 0)
            return { ok: false, errMsg: 'Failed to read template package' }
        }
        console.log('[cloud-templates] Package read, size:', packageResult.buffer.length)

        let coverBuffer = null
        if (meta.coverFileName) {
            const coverResult = await adapter.fileRead(meta.coverFileName)
            if (coverResult.ok && coverResult.buffer && coverResult.buffer.length > 0) {
                coverBuffer = coverResult.buffer
                console.log('[cloud-templates] Cover read, size:', coverBuffer.length)
            } else {
                console.warn('[cloud-templates] Failed to read cover:', coverResult.errMsg)
            }
        }

        return {
            ok: true,
            meta,
            zipBuffer: packageResult.buffer,
            coverBuffer,
        }
    }

    async deleteTemplate(templateId) {
        const { index } = await this._getIndex()
        const meta = index.templates.find(t => t.id === templateId)
        if (!meta) {
            return { ok: false, errMsg: 'Template not found' }
        }

        const adapter = this.getAdapter()

        console.log('[cloud-templates] Deleting package:', meta.packageFileName)
        await adapter.fileDelete(meta.packageFileName)
        if (meta.coverFileName) {
            console.log('[cloud-templates] Deleting cover:', meta.coverFileName)
            await adapter.fileDelete(meta.coverFileName)
        }

        index.templates = index.templates.filter(t => t.id !== templateId)
        index.lastSyncedAt = Date.now()

        const indexResult = await this._saveIndex(index)
        if (!indexResult.ok) {
            return { ok: false, errMsg: 'Failed to update index' }
        }

        return { ok: true }
    }

    async refreshIndex() {
        console.log('[cloud-templates] Forcing index refresh from cloud')
        this._cachedIndex = null
        this._indexLoaded = false
        return this._getIndex()
    }

    async listTemplates(options = {}) {
        try {
            const { forceRefresh = false } = options
            if (forceRefresh) {
                console.log('[cloud-templates] Force refreshing index from cloud')
                await this.refreshIndex()
            }
            
            const adapter = this.getAdapter()
            console.log('[cloud-templates] listTemplates using adapter:', adapter?.getPlatformId?.(), 'available:', adapter?.isAvailable?.())

            const { index } = await this._getIndex()
            const quotaResult = await this.getQuota()

            console.log('[cloud-templates] Returning', index.templates?.length || 0, 'templates, quota:', quotaResult.ok ? `${JSON.stringify(quotaResult.quota)}` : quotaResult.errMsg)

            return {
                ok: true,
                items: index.templates || [],
                lastSyncedAt: index.lastSyncedAt,
                quota: quotaResult.ok ? quotaResult.quota : null,
            }
        } catch (err) {
            console.error('[cloud-templates] listTemplates error:', err)
            return { ok: false, errMsg: err.message, items: [] }
        }
    }
}

let _service = null

export function getCloudTemplatesService() {
    if (!_service) {
        _service = new CloudTemplatesService()
    }
    return _service
}
