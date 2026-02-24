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
	},
	videostudio: {
		pingBackend: () => invoke('dweb:backend:ping'),
		selectExportDir: (options) => invoke('dweb:videostudio:selectExportDir', options),
	},
})
