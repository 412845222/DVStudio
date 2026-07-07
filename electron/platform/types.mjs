/**
 * @typedef {Object} PlatformUser
 * @property {string} platformId
 * @property {string} displayName
 * @property {string} [avatarUrl]
 * @property {string} [steamId]
 */

/**
 * @typedef {Object} PlatformInitResult
 * @property {boolean} ok
 * @property {string} [errMsg]
 */

/**
 * @typedef {Object} PlatformOverlayResult
 * @property {boolean} ok
 * @property {string} [errMsg]
 */

/**
 * @typedef {Object} PlatformDlcInfo
 * @property {number} appId
 * @property {string} name
 * @property {boolean} installed
 */

/**
 * @typedef {Object} PlatformProviderInfo
 * @property {string} id
 * @property {string} displayName
 * @property {boolean} available
 * @property {boolean} initialized
 */

/**
 * @typedef {Object} PlatformStatus
 * @property {string} activePlatform
 * @property {string} activeDisplayName
 * @property {boolean} available
 * @property {boolean} initialized
 * @property {boolean} loggedIn
 * @property {PlatformUser|null} user
 * @property {boolean} overlayEnabled
 * @property {boolean} overlayActive
 * @property {PlatformDlcInfo[]} installedDlcs
 * @property {PlatformProviderInfo[]} allPlatforms
 */

/**
 * @typedef {Object} PlatformCloudFileInfo
 * @property {string} name
 * @property {number} size
 */

/**
 * @typedef {Object} PlatformCloudQuota
 * @property {number} totalBytes
 * @property {number} availableBytes
 */

/**
 * @typedef {Object} PlatformCloudResult
 * @property {boolean} ok
 * @property {string} [errMsg]
 */

/**
 * @typedef {Object} PlatformCloudReadResult
 * @property {boolean} ok
 * @property {Buffer} [buffer]
 * @property {string} [errMsg]
 */

/**
 * @typedef {Object} PlatformCloudQuotaResult
 * @property {boolean} ok
 * @property {number} [totalBytes]
 * @property {number} [availableBytes]
 */

/**
 * @typedef {Object} PlatformCloudExistsResult
 * @property {boolean} ok
 * @property {boolean} exists
 */

/**
 * @typedef {Object} PlatformCloudSizeResult
 * @property {boolean} ok
 * @property {number} size
 */

/**
 * @typedef {Object} PlatformCloudTimestampResult
 * @property {boolean} ok
 * @property {number} timestamp
 */

/**
 * @typedef {Object} PlatformCloudFileEntry
 * @property {string} name
 * @property {number} size
 */

/**
 * @interface PlatformCloud
 * @description 平台云存储能力接口
 */
export const PlatformCloud = {
	/**
	 * 获取配额信息
	 * @returns {PlatformCloudQuotaResult}
	 */
	getQuota() { return { ok: false } },

	/**
	 * 写入文件
	 * @param {string} fileName
	 * @param {Buffer} buffer
	 * @returns {PlatformCloudResult}
	 */
	fileWrite(fileName, buffer) { return { ok: false, errMsg: 'Not supported' } },

	/**
	 * 读取文件
	 * @param {string} fileName
	 * @returns {PlatformCloudReadResult}
	 */
	fileRead(fileName) { return { ok: false } },

	/**
	 * 删除文件
	 * @param {string} fileName
	 * @returns {PlatformCloudResult}
	 */
	fileDelete(fileName) { return { ok: false } },

	/**
	 * 检查文件是否存在
	 * @param {string} fileName
	 * @returns {PlatformCloudExistsResult}
	 */
	fileExists(fileName) { return { ok: false, exists: false } },

	/**
	 * 获取文件大小
	 * @param {string} fileName
	 * @returns {PlatformCloudSizeResult}
	 */
	getFileSize(fileName) { return { ok: false, size: 0 } },

	/**
	 * 获取文件时间戳
	 * @param {string} fileName
	 * @returns {PlatformCloudTimestampResult}
	 */
	getFileTimestamp(fileName) { return { ok: false, timestamp: 0 } },

	/**
	 * 获取文件数量
	 * @returns {number}
	 */
	getFileCount() { return 0 },

	/**
	 * 获取文件名和大小
	 * @param {number} index
	 * @returns {PlatformCloudFileEntry}
	 */
	getFileNameAndSize(index) { return { name: '', size: 0 } },
}

/**
 * @interface PlatformProvider
 * @description 所有平台Provider必须实现的统一接口
 */
export const PlatformProvider = {
	/**
	 * 平台唯一标识 (e.g., 'steam', 'mock', 'epic')
	 * @type {string}
	 */
	id: '',

	/**
	 * 平台显示名称 (e.g., 'Steam', 'Epic Games')
	 * @type {string}
	 */
	displayName: '',

	/**
	 * 云存储能力
	 * @type {PlatformCloud|null}
	 */
	cloud: null,

	/**
	 * 预启动检查 - 在app.whenReady前调用
	 * @returns {boolean} 返回true表示需要重启应用（如未通过Steam启动）
	 */
	preflightCheck() { return false },

	/**
	 * 初始化平台
	 * @returns {Promise<PlatformInitResult>}
	 */
	async init() { return { ok: true } },

	/**
	 * 关闭平台
	 */
	shutdown() {},

	/**
	 * 处理平台回调（定时调用）
	 */
	runCallbacks() {},

	/**
	 * 平台客户端是否可用/运行中
	 * @returns {boolean}
	 */
	isAvailable() { return false },

	/**
	 * 是否已初始化
	 * @returns {boolean}
	 */
	isInitialized() { return false },

	/**
	 * 用户是否已登录
	 * @returns {boolean}
	 */
	isLoggedIn() { return false },

	/**
	 * 是否拥有指定App
	 * @param {number} [appId]
	 * @returns {boolean}
	 */
	isOwned(appId) { return false },

	/**
	 * 获取当前用户信息
	 * @returns {PlatformUser|null}
	 */
	getUserInfo() { return null },

	/**
	 * 获取用户头像URL
	 * @returns {string|null}
	 */
	getUserAvatarUrl() { return null },

	/**
	 * Overlay是否可用
	 * @returns {boolean}
	 */
	isOverlayEnabled() { return false },

	/**
	 * Overlay是否当前激活
	 * @returns {boolean}
	 */
	isOverlayActive() { return false },

	/**
	 * 在Overlay中打开URL
	 * @param {string} url
	 * @returns {PlatformOverlayResult}
	 */
	overlayOpenUrl(url) { return { ok: false, errMsg: 'Not supported' } },

	/**
	 * 激活游戏Overlay
	 * @param {string} [dialog] - 打开指定对话框（如'friends', 'achievements'等）
	 * @returns {PlatformOverlayResult}
	 */
	overlayActivateGameOverlay(dialog) { return { ok: false, errMsg: 'Not supported' } },

	/**
	 * 查询指定DLC是否已安装
	 * @param {number} dlcAppId
	 * @returns {boolean}
	 */
	isDlcInstalled(dlcAppId) { return false },

	/**
	 * 获取所有已安装DLC列表
	 * @returns {PlatformDlcInfo[]}
	 */
	getInstalledDlcs() { return [] },

	/**
	 * 添加事件监听
	 * @param {string} event
	 * @param {Function} listener
	 * @returns {this}
	 */
	on(event, listener) { return this },

	/**
	 * 移除事件监听
	 * @param {string} event
	 * @param {Function} listener
	 * @returns {this}
	 */
	off(event, listener) { return this },
}

export const PlatformEvents = {
	OVERLAY_ACTIVATED: 'overlay-activated',
	OVERLAY_DEACTIVATED: 'overlay-deactivated',
	DISCONNECTED: 'disconnected',
	USER_CHANGED: 'user-changed',
}
