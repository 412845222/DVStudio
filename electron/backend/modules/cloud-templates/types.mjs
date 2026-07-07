/**
 * @typedef {Object} CloudTemplateMeta
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} category
 * @property {string[]} tags
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {number} nodeCount
 * @property {string} packageFileName
 * @property {string} coverFileName
 */

/**
 * @typedef {Object} CloudTemplateIndex
 * @property {number} version
 * @property {CloudTemplateMeta[]} templates
 * @property {number} lastSyncedAt
 */

/**
 * @typedef {Object} CloudTemplateListResult
 * @property {boolean} ok
 * @property {CloudTemplateMeta[]} [items]
 * @property {number} [lastSyncedAt]
 * @property {Object} [quota]
 * @property {string} [errMsg]
 */

/**
 * @typedef {Object} CloudTemplateUploadOptions
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} category
 * @property {string[]} tags
 * @property {number} nodeCount
 * @property {Buffer} zipBuffer
 * @property {Buffer|null} coverBuffer
 */

/**
 * @typedef {Object} CloudTemplateDownloadResult
 * @property {boolean} ok
 * @property {CloudTemplateMeta} [meta]
 * @property {Buffer} [zipBuffer]
 * @property {Buffer|null} [coverBuffer]
 * @property {string} [errMsg]
 */

export const CLOUD_TEMPLATE_PATH_PREFIX = 'usertemplates/'
export const CLOUD_TEMPLATE_INDEX_FILE = `${CLOUD_TEMPLATE_PATH_PREFIX}index.json`
