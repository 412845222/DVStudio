import { contextBridge, ipcRenderer } from 'electron'

function invoke(channel, payload) {
	return ipcRenderer.invoke(channel, payload)
}

const BACKEND_RUNTIME_CHANNEL = 'dweb:backendRuntime:changed'
const backendRuntimeListenerMap = new Map()
let backendRuntimeListenerSeed = 0

// 统一在 preload 注入 baseUrl，避免前端依赖 localStorage/same-origin。
// 使用闭包暴露 getter，确保每次读取都拿到最新值（解决窗口创建早于 Django 启动的时序问题）。
let __DWEB_BACKEND_BASE_URL_MUTABLE__ = await invoke('dweb:getBackendBaseUrl')
let __DWEB_CLIENT_SETTINGS_MUTABLE__ = await invoke('dweb:settings:get')

const __DWEB_AIWF_AUTO_HELLO_VAL__ = process.env.DWEB_AIWF_AUTO_HELLO || ''
const __DWEB_AIWF_AUTO_HELLO_TEXT_VAL__ = process.env.DWEB_AIWF_AUTO_HELLO_TEXT || ''

// 暴露一个带 getter 的对象：
// - 前端可以通过 `window.__DWEB_BACKEND_BASE_URL__.get()` 获取最新值
// - 前端也可以通过 `String(window.__DWEB_BACKEND_BASE_URL__)` 拿到当前值（通过 toString/valueOf）
// 注意：contextBridge 只允许暴露函数、数组、简单对象/基本类型，不支持 Symbol
contextBridge.exposeInMainWorld('__DWEB_BACKEND_BASE_URL__', {
	get: () => __DWEB_BACKEND_BASE_URL_MUTABLE__,
	set: (v) => {
		if (typeof v === 'string') __DWEB_BACKEND_BASE_URL_MUTABLE__ = v
	},
	valueOf: () => __DWEB_BACKEND_BASE_URL_MUTABLE__,
	toString: () => String(__DWEB_BACKEND_BASE_URL_MUTABLE__ || ''),
})

contextBridge.exposeInMainWorld('__DWEB_CLIENT_SETTINGS__', {
	get: () => __DWEB_CLIENT_SETTINGS_MUTABLE__,
	set: (v) => {
		__DWEB_CLIENT_SETTINGS_MUTABLE__ = v ?? __DWEB_CLIENT_SETTINGS_MUTABLE__
	},
})

contextBridge.exposeInMainWorld('__DWEB_AIWF_AUTO_HELLO', __DWEB_AIWF_AUTO_HELLO_VAL__)
contextBridge.exposeInMainWorld('__DWEB_AIWF_AUTO_HELLO_TEXT', __DWEB_AIWF_AUTO_HELLO_TEXT_VAL__)

// 运行环境标记：用于区分 Web 部署 vs Electron 客户端
contextBridge.exposeInMainWorld('__DWEB_RUNTIME__', {
	platform: 'electron',
	isElectron: true,
})

// 当主进程广播后端就绪状态时，主动更新后端地址和客户端设置。
// 解决"窗口创建早于 Django 启动"导致初始 URL 为空字符串的时序问题。
ipcRenderer.on(BACKEND_RUNTIME_CHANNEL, (_event, payload) => {
	if (!payload || typeof payload !== 'object') return
	const newBaseUrl = String(payload.baseUrl || '')
	if (newBaseUrl) __DWEB_BACKEND_BASE_URL_MUTABLE__ = newBaseUrl
	const newPort = Number(payload.port || 0)
	if (newPort > 0 && !__DWEB_BACKEND_BASE_URL_MUTABLE__) {
		__DWEB_BACKEND_BASE_URL_MUTABLE__ = `http://127.0.0.1:${newPort}`
	}
})

/**
 * 上下文桥设计：
 * - window.dweb.aiworkflow：供 / (AIWorkflow) 页面使用
 * - window.dweb.videostudio：供 /studio (VideoStudio) 页面使用
 * - window.dweb.common：通用能力
 */
contextBridge.exposeInMainWorld('dweb', {
	common: {
		getBackendBaseUrl: () => invoke('dweb:getBackendBaseUrl'),
		getBackendRuntimeState: () => invoke('dweb:backendRuntime:getState'),
		onBackendRuntimeStateChanged: (handler) => {
			if (typeof handler !== 'function') return -1
			const id = ++backendRuntimeListenerSeed
			const wrapped = (_event, payload) => {
				try {
					handler(payload)
				} catch {
					// ignore
				}
			}
			backendRuntimeListenerMap.set(id, wrapped)
			ipcRenderer.on(BACKEND_RUNTIME_CHANNEL, wrapped)
			return id
		},
		offBackendRuntimeStateChanged: async (listenerId) => {
			const id = Number(listenerId || 0)
			const wrapped = backendRuntimeListenerMap.get(id)
			if (!wrapped) return { ok: false }
			ipcRenderer.removeListener(BACKEND_RUNTIME_CHANNEL, wrapped)
			backendRuntimeListenerMap.delete(id)
			return { ok: true }
		},
		getClientSettings: () => invoke('dweb:settings:get'),
		saveClientSettings: (payload) => invoke('dweb:settings:save', payload),
		getBackendStatus: () => invoke('dweb:backend:getStatus'),
		getSetupState: () => invoke('dweb:setup:getState'),
		runSetupWorkflow: (payload) => invoke('dweb:setup:run', payload),
		cleanupOldProject: () => invoke('dweb:setup:cleanupOldProject'),
		startBackend: () => invoke('dweb:backend:start'),
		pingBackend: () => invoke('dweb:backend:ping'),
		restartBackend: () => invoke('dweb:backend:restart'),
		getBackendLogs: (options) => invoke('dweb:backend:getLogs', options),
		clearBackendLogs: () => invoke('dweb:backend:clearLogs'),
		collectDiagnostics: () => invoke('dweb:diagnostics:collect'),
		revealUserDataDir: () => invoke('dweb:app:revealUserDataDir'),
		openFolderForPath: (payload) => invoke('dweb:app:openFolderForPath', payload),
		runBootstrapInstaller: () => invoke('dweb:bootstrap:install'),
	},
	window: {
		minimize: () => invoke('dweb:window:minimize'),
		toggleMaximize: () => invoke('dweb:window:toggleMaximize'),
		isMaximized: () => invoke('dweb:window:isMaximized'),
		reload: () => invoke('dweb:window:reload'),
		openDevTools: () => invoke('dweb:window:openDevTools'),
		close: () => invoke('dweb:window:close'),
	},
	aiworkflow: {
		pingBackend: () => invoke('dweb:backend:ping'),
		selectMediaFiles: (options) => invoke('dweb:aiworkflow:selectMediaFiles', options),
		selectProjectFolder: () => invoke('dweb:aiworkflow:selectProjectFolder'),
	},
	videostudio: {
		pingBackend: () => invoke('dweb:backend:ping'),
		selectExportDir: (options) => invoke('dweb:videostudio:selectExportDir', options),
	},
})
