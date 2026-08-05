/**
 * @typedef {Object} CloudFileInfo
 * @property {string} name
 * @property {number} size
 * @property {number} timestamp
 */

/**
 * @typedef {Object} CloudQuotaInfo
 * @property {number} totalBytes
 * @property {number} availableBytes
 */

/**
 * @typedef {Object} CloudResult
 * @property {boolean} ok
 * @property {string} [errMsg]
 */

/**
 * @typedef {Object} CloudReadResult
 * @property {boolean} ok
 * @property {Buffer} [buffer]
 * @property {string} [errMsg]
 */

/**
 * @typedef {Object} CloudListResult
 * @property {boolean} ok
 * @property {CloudFileInfo[]} [items]
 * @property {string} [errMsg]
 */

/**
 * @typedef {Object} CloudQuotaResult
 * @property {boolean} ok
 * @property {CloudQuotaInfo} [quota]
 * @property {string} [errMsg]
 */

/**
 * @class CloudAdapter
 * @description 平台云存储适配器基类 - 所有平台适配器必须继承此类
 */
export class CloudAdapter {
	/**
	 * @param {Object} options
	 * @param {string} [options.pathPrefix]
	 */
	constructor(options = {}) {
		this._pathPrefix = options.pathPrefix || ''
		this._provider = options.provider || null
	}

	/**
	 * 获取平台标识
	 * @returns {string}
	 */
	getPlatformId() {
		return 'base'
	}

	/**
	 * 获取平台显示名称
	 * @returns {string}
	 */
	getPlatformName() {
		return 'Base'
	}

	/**
	 * 云存储是否可用
	 * @returns {boolean}
	 */
	isAvailable() {
		return false
	}

	/**
	 * 获取云存储配额信息
	 * @returns {Promise<CloudQuotaResult>}
	 */
	async getQuota() {
		return { ok: false, errMsg: 'Not implemented' }
	}

	/**
	 * 写入文件到云端
	 * @param {string} fileName - 文件路径（包含路径前缀）
	 * @param {Buffer} buffer - 文件内容
	 * @returns {Promise<CloudResult>}
	 */
	async fileWrite(fileName, buffer) {
		return { ok: false, errMsg: 'Not implemented' }
	}

	/**
	 * 从云端读取文件
	 * @param {string} fileName - 文件路径
	 * @returns {Promise<CloudReadResult>}
	 */
	async fileRead(fileName) {
		return { ok: false, errMsg: 'Not implemented' }
	}

	/**
	 * 删除云端文件
	 * @param {string} fileName - 文件路径
	 * @returns {Promise<CloudResult>}
	 */
	async fileDelete(fileName) {
		return { ok: false, errMsg: 'Not implemented' }
	}

	/**
	 * 检查文件是否存在
	 * @param {string} fileName - 文件路径
	 * @returns {Promise<{ ok: boolean, exists: boolean }>}
	 */
	async fileExists(fileName) {
		return { ok: false, exists: false }
	}

	/**
	 * 获取文件大小
	 * @param {string} fileName - 文件路径
	 * @returns {Promise<{ ok: boolean, size: number }>}
	 */
	async getFileSize(fileName) {
		return { ok: false, size: 0 }
	}

	/**
	 * 获取文件时间戳
	 * @param {string} fileName - 文件路径
	 * @returns {Promise<{ ok: boolean, timestamp: number }>}
	 */
	async getFileTimestamp(fileName) {
		return { ok: false, timestamp: 0 }
	}

	/**
	 * 获取云端文件数量
	 * @returns {number}
	 */
	getFileCount() {
		return 0
	}

	/**
	 * 通过索引获取文件名和大小
	 * @param {number} index - 文件索引
	 * @returns {CloudFileInfo|null}
	 */
	getFileNameAndSize(index) {
		return null
	}

	/**
	 * 列出指定前缀的文件
	 * @param {string} [prefix] - 文件路径前缀过滤
	 * @returns {Promise<CloudListResult>}
	 */
	async listFiles(prefix) {
		return { ok: false, items: [], errMsg: 'Not implemented' }
	}
}
