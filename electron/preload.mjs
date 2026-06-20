import { contextBridge, ipcRenderer } from 'electron'

function invoke(channel, payload) {
	return ipcRenderer.invoke(channel, payload)
}

const BACKEND_RUNTIME_CHANNEL = 'dweb:backendRuntime:changed'
const backendRuntimeListenerMap = new Map()
let backendRuntimeListenerSeed = 0

// 统一在 preload 注入 baseUrl，避免前端依赖 localStorage/same-origin。
const BACKEND_BASE_URL = await invoke('dweb:getBackendBaseUrl')
contextBridge.exposeInMainWorld('__DWEB_BACKEND_BASE_URL', BACKEND_BASE_URL)

const CLIENT_SETTINGS = await invoke('dweb:settings:get')
contextBridge.exposeInMainWorld('__DWEB_CLIENT_SETTINGS', CLIENT_SETTINGS?.ok ? CLIENT_SETTINGS.data : null)

contextBridge.exposeInMainWorld('__DWEB_AIWF_AUTO_HELLO', process.env.DWEB_AIWF_AUTO_HELLO || '')
contextBridge.exposeInMainWorld('__DWEB_AIWF_AUTO_HELLO_TEXT', process.env.DWEB_AIWF_AUTO_HELLO_TEXT || '')

// 运行环境标记：用于区分 Web 部署 vs Electron 客户端
contextBridge.exposeInMainWorld('__DWEB_RUNTIME__', {
	platform: 'electron',
	isElectron: true,
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
		registerProjectRoot: (payload) => invoke('dweb:aiworkflow:registerProjectRoot', payload || {}),
		clearProjectRoot: (payload) => invoke('dweb:aiworkflow:clearProjectRoot', payload || {}),
		getProjectRootSnapshot: () => invoke('dweb:aiworkflow:getProjectRootSnapshot'),
		getProjectRootById: (payload) => invoke('dweb:aiworkflow:getProjectRootById', payload || {}),
		downloadUrlToProjectRoot: (payload) => invoke('dweb:aiworkflow:downloadUrlToProjectRoot', payload || {}),
		// ---- 本地化存储（取代 Django 的项目/任务镜像/API key 管理） ----
		db: {
			_initState: () => invoke('dweb:localdb:getInitState'),
			_ensureInitialized: (payload) => invoke('dweb:localdb:ensureInitialized', payload || {}),
			projects: {
				list: () => invoke('dweb:localdb:projects:list'),
				get: (payload) => invoke('dweb:localdb:projects:get', payload || {}),
				save: (payload) => invoke('dweb:localdb:projects:save', payload || {}),
				load: (payload) => invoke('dweb:localdb:projects:load', payload || {}),
				delete: (payload) => invoke('dweb:localdb:projects:delete', payload || {}),
				openFolder: (payload) => invoke('dweb:localdb:projects:openFolder', payload || {}),
			},
			meshy: {
				list: (payload) => invoke('dweb:localdb:meshy:list', payload || {}),
				get: (payload) => invoke('dweb:localdb:meshy:get', payload || {}),
				upsert: (payload) => invoke('dweb:localdb:meshy:upsert', payload || {}),
				remove: (payload) => invoke('dweb:localdb:meshy:remove', payload || {}),
			},
			video: {
				list: (payload) => invoke('dweb:localdb:video:list', payload || {}),
				get: (payload) => invoke('dweb:localdb:video:get', payload || {}),
				upsert: (payload) => invoke('dweb:localdb:video:upsert', payload || {}),
				remove: (payload) => invoke('dweb:localdb:video:remove', payload || {}),
			},
			apiKeys: {
				list: () => invoke('dweb:localdb:apiKeys:list'),
				get: (payload) => invoke('dweb:localdb:apiKeys:get', payload || {}),
				set: (payload) => invoke('dweb:localdb:apiKeys:set', payload || {}),
				getPlaintext: (payload) => invoke('dweb:localdb:apiKeys:getPlaintext', payload || {}),
				remove: (payload) => invoke('dweb:localdb:apiKeys:remove', payload || {}),
			},
		},
		migrateFromDjango: (payload) => invoke('dweb:localdb:migrateFromDjango', payload || {}),
	},
	videostudio: {
		pingBackend: () => invoke('dweb:backend:ping'),
		selectExportDir: (options) => invoke('dweb:videostudio:selectExportDir', options),
	},
})
