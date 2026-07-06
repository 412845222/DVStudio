import { getCloudTemplatesService } from './service.mjs'

export const handlers = {
    async getPlatform() {
        try {
            const service = getCloudTemplatesService()
            return {
                ok: true,
                platformId: service.getPlatformId(),
                platformName: service.getPlatformName(),
            }
        } catch (err) {
            return { ok: false, errMsg: err.message }
        }
    },

    async getQuota() {
        try {
            const service = getCloudTemplatesService()
            return await service.getQuota()
        } catch (err) {
            return { ok: false, errMsg: err.message }
        }
    },

    async listTemplates() {
        try {
            const service = getCloudTemplatesService()
            return await service.listTemplates()
        } catch (err) {
            return { ok: false, errMsg: err.message, items: [] }
        }
    },

    async uploadTemplate(_evt, data) {
        try {
            const service = getCloudTemplatesService()
            const zipBuffer = Buffer.from(data.zipData)
            const coverBuffer = data.coverData ? Buffer.from(data.coverData) : null
            return await service.uploadTemplate({
                ...data,
                zipBuffer,
                coverBuffer,
            })
        } catch (err) {
            return { ok: false, errMsg: err.message }
        }
    },

    async downloadTemplate(_evt, data) {
        try {
            const service = getCloudTemplatesService()
            const result = await service.downloadTemplate(data.id)
            if (!result.ok) return result

            const zipBuffer = result.zipBuffer
            const coverBuffer = result.coverBuffer

            return {
                ok: true,
                meta: result.meta,
                zipData: zipBuffer.buffer.slice(
                    zipBuffer.byteOffset,
                    zipBuffer.byteOffset + zipBuffer.byteLength
                ),
                coverData: coverBuffer ? coverBuffer.buffer.slice(
                    coverBuffer.byteOffset,
                    coverBuffer.byteOffset + coverBuffer.byteLength
                ) : null,
            }
        } catch (err) {
            return { ok: false, errMsg: err.message }
        }
    },

    async deleteTemplate(_evt, data) {
        try {
            const service = getCloudTemplatesService()
            return await service.deleteTemplate(data.id)
        } catch (err) {
            return { ok: false, errMsg: err.message }
        }
    },
}
