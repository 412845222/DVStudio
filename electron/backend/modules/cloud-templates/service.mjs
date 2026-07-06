import { getActiveCloudAdapter } from './adapters/factory.mjs'
import { getManager } from '../../platform/manager.mjs'

const TEMPLATE_PATH_PREFIX = 'usertemplates/'
const INDEX_FILE = `${TEMPLATE_PATH_PREFIX}index.json`

export class CloudTemplatesService {
    constructor() {
        this._adapter = null
        this._platformManager = getManager()
        this._initAdapter()
    }

    _initAdapter() {
        this._adapter = getActiveCloudAdapter(this._platformManager, {
            pathPrefix: TEMPLATE_PATH_PREFIX,
        })
    }

    getAdapter() {
        if (!this._adapter?.isAvailable()) {
            this._initAdapter()
        }
        return this._adapter
    }

    getPlatformId() {
        return this.getAdapter().getPlatformId()
    }

    getPlatformName() {
        return this.getAdapter().getPlatformName()
    }

    async getQuota() {
        return this.getAdapter().getQuota()
    }

    async _getIndex() {
        const result = await this.getAdapter().fileRead(INDEX_FILE)
        if (!result.ok) {
            return { ok: true, index: this._createEmptyIndex() }
        }
        try {
            return { ok: true, index: JSON.parse(result.buffer.toString('utf8')) }
        } catch {
            return { ok: true, index: this._createEmptyIndex() }
        }
    }

    _createEmptyIndex() {
        return {
            version: 1,
            templates: [],
            lastSyncedAt: Date.now(),
        }
    }

    async _saveIndex(index) {
        const buffer = Buffer.from(JSON.stringify(index), 'utf8')
        return this.getAdapter().fileWrite(INDEX_FILE, buffer)
    }

    async uploadTemplate(options) {
        const { id, name, description, category, tags, nodeCount, zipBuffer, coverBuffer } = options

        const adapter = this.getAdapter()

        const packageFileName = `${TEMPLATE_PATH_PREFIX}${id}.zip`
        const coverFileName = coverBuffer ? `${TEMPLATE_PATH_PREFIX}${id}_cover.png` : ''

        const writeResult = await adapter.fileWrite(packageFileName, zipBuffer)
        if (!writeResult.ok) {
            return { ok: false, errMsg: writeResult.errMsg || 'Failed to write template package' }
        }

        if (coverBuffer && coverBuffer.length > 0) {
            const coverResult = await adapter.fileWrite(coverFileName, coverBuffer)
            if (!coverResult.ok) {
                console.warn('[cloud-templates] Failed to write cover:', coverResult.errMsg)
            }
        }

        const { index } = await this._getIndex()
        const now = Date.now()
        const meta = {
            id,
            name,
            description,
            category,
            tags: tags || [],
            createdAt: now,
            updatedAt: now,
            nodeCount,
            packageFileName,
            coverFileName,
        }

        const existingIdx = index.templates.findIndex(t => t.id === id)
        if (existingIdx >= 0) {
            meta.createdAt = index.templates[existingIdx].createdAt
            index.templates[existingIdx] = meta
        } else {
            index.templates.push(meta)
        }
        index.lastSyncedAt = now

        const indexResult = await this._saveIndex(index)
        if (!indexResult.ok) {
            return { ok: false, errMsg: 'Failed to update index' }
        }

        return { ok: true }
    }

    async downloadTemplate(templateId) {
        const { index } = await this._getIndex()
        const meta = index.templates.find(t => t.id === templateId)
        if (!meta) {
            return { ok: false, errMsg: 'Template not found' }
        }

        const adapter = this.getAdapter()

        const packageResult = await adapter.fileRead(meta.packageFileName)
        if (!packageResult.ok || !packageResult.buffer) {
            return { ok: false, errMsg: 'Failed to read template package' }
        }

        let coverBuffer = null
        if (meta.coverFileName) {
            const coverResult = await adapter.fileRead(meta.coverFileName)
            if (coverResult.ok && coverResult.buffer) {
                coverBuffer = coverResult.buffer
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

        await adapter.fileDelete(meta.packageFileName)
        if (meta.coverFileName) {
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

    async listTemplates() {
        try {
            const { index } = await this._getIndex()
            const quota = await this.getQuota()

            return {
                ok: true,
                items: index.templates,
                lastSyncedAt: index.lastSyncedAt,
                quota: quota.ok ? quota.quota : null,
            }
        } catch (err) {
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
