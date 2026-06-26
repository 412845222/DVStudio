import { contextBridge, ipcRenderer } from 'electron'

function invoke(channel, payload) {
	return ipcRenderer.invoke(channel, payload)
}

function createInvokeStream(baseChannel) {
	return function invokeStream(payload) {
		const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
		const dataChannel = `${baseChannel}:data`
		const endChannel = `${baseChannel}:end`
		const errorChannel = `${baseChannel}:error`
		const streamChannel = `${baseChannel}:stream`

		let registered = false
		let buffer = []
		let done = false
		let error = null
		let resolveNext = null
		let rejectNext = null

		function onData(_event, rid, chunk) {
			if (rid !== requestId) return
			let parsed
			try {
				parsed = typeof chunk === 'string' ? JSON.parse(chunk) : chunk
			} catch {
				parsed = chunk
			}
			if (resolveNext) {
				const res = resolveNext
				resolveNext = null
				rejectNext = null
				res({ value: parsed, done: false })
			} else {
				buffer.push(parsed)
			}
		}

		function onEnd(_event, rid) {
			if (rid !== requestId) return
			cleanup()
			done = true
			if (resolveNext) {
				const res = resolveNext
				resolveNext = null
				rejectNext = null
				res({ value: undefined, done: true })
			}
		}

		function onError(_event, rid, err) {
			if (rid !== requestId) return
			cleanup()
			error = err?.error || err?.message || String(err)
			if (rejectNext) {
				const rej = rejectNext
				resolveNext = null
				rejectNext = null
				rej(new Error(error))
			}
		}

		function cleanup() {
			if (!registered) return
			registered = false
			ipcRenderer.removeListener(dataChannel, onData)
			ipcRenderer.removeListener(endChannel, onEnd)
			ipcRenderer.removeListener(errorChannel, onError)
		}

		ipcRenderer.on(dataChannel, onData)
		ipcRenderer.on(endChannel, onEnd)
		ipcRenderer.on(errorChannel, onError)
		registered = true

		invoke(streamChannel, { requestId, ...payload }).catch(err => {
			cleanup()
			error = err?.message || String(err)
			done = true
			if (rejectNext) {
				const rej = rejectNext
				resolveNext = null
				rejectNext = null
				rej(new Error(error))
			}
		})

		const generator = {
			[Symbol.asyncIterator]() { return this },
			next() {
				if (error) return Promise.reject(new Error(error))
				if (buffer.length > 0) return Promise.resolve({ value: buffer.shift(), done: false })
				if (done) return Promise.resolve({ value: undefined, done: true })
				return new Promise((resolve, reject) => {
					resolveNext = resolve
					rejectNext = reject
				})
			},
			return() {
				cleanup()
				done = true
				return Promise.resolve({ value: undefined, done: true })
			},
			throw(err) {
				cleanup()
				error = err?.message || String(err)
				return Promise.reject(err)
			},
		}

		return { generator, requestId }
	}
}

const BACKEND_RUNTIME_CHANNEL = 'dweb:backendRuntime:changed'
const backendRuntimeListenerMap = new Map()
let backendRuntimeListenerSeed = 0

const platformListenerMap = new Map()
let platformListenerSeed = 0

// ===== 资源管理器窗口：预注册监听器 + 数据缓存 =====
// 关键：在 preload 脚本加载时（早于 Vue 挂载）就注册 IPC 监听器
// 避免主窗口推送数据时 Vue 组件尚未挂载导致消息丢失
const RESOURCE_MANAGER_DATA_CHANNEL = 'dweb:resource-manager:data'
let resourceManagerLatestData = null
const resourceManagerDataHandlers = new Map()
let resourceManagerDataListenerSeed = 0

ipcRenderer.on(RESOURCE_MANAGER_DATA_CHANNEL, (_event, payload) => {
	try {
		const resCount = Array.isArray(payload?.resources) ? payload.resources.length : 0
		console.log(`[preload:resource-manager] received data: ${resCount} resources, nodesById=${payload?.nodesById ? typeof payload.nodesById : 'missing'}, nodeOrder=${Array.isArray(payload?.nodeOrder) ? payload.nodeOrder.length : 'N/A'}`)
		resourceManagerLatestData = payload
		// 通知所有已注册的 Vue 侧处理器
		for (const handler of resourceManagerDataHandlers.values()) {
			try { handler(payload) } catch (err) { console.warn('[preload:resource-manager] handler error:', err) }
		}
	} catch (err) {
		console.warn('[preload:resource-manager] failed to process data:', err)
	}
})

// 统一在 preload 注入 baseUrl，避免前端依赖 localStorage/same-origin。
const BACKEND_BASE_URL = await invoke('dweb:getBackendBaseUrl')
const BACKEND_RUNTIME_STATE = await invoke('dweb:backendRuntime:getState')
contextBridge.exposeInMainWorld('__DWEB_BACKEND_BASE_URL', BACKEND_BASE_URL)
contextBridge.exposeInMainWorld('__DWEB_BACKEND_MODE__', BACKEND_RUNTIME_STATE?.mode || 'normal')

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
		health: () => invoke('dweb:system:health'),
		echo: (payload) => invoke('dweb:system:echo', payload),
		getUserAgreement: () => invoke('dweb:system:legal:agreement'),
		getMigrationStatus: () => invoke('dweb:system:migration-status'),
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
		openExternalUrl: (payload) => invoke('dweb:app:openExternalUrl', payload),
		openFolderForPath: (payload) => invoke('dweb:app:openFolderForPath', payload),
		runBootstrapInstaller: () => invoke('dweb:bootstrap:install'),
		invokeStream: (baseChannel, payload) => {
			const { generator } = createInvokeStream(baseChannel)(payload)
			return generator
		},
	},
	meshy: {
		health: () => invoke('dweb:meshy:health'),
		generate: (payload) => invoke('dweb:meshy:generate', payload || {}),
		getTask: (payload) => invoke('dweb:meshy:get-task', payload || {}),
		listTasks: (payload) => invoke('dweb:meshy:list-tasks', payload || {}),
		taskDetail: (payload) => invoke('dweb:meshy:task-detail', payload || {}),
		stop: (payload) => invoke('dweb:meshy:stop', payload || {}),
		deleteTask: (payload) => invoke('dweb:meshy:delete', payload || {}),
		balance: () => invoke('dweb:meshy:balance'),
	},
	seedance: {
		health: () => invoke('dweb:seedance:health'),
		generateStream: (payload) => {
			const { generator } = createInvokeStream('dweb:seedance:generate')(payload || {})
			return generator
		},
		list: (payload) => invoke('dweb:seedance:list', payload || {}),
		taskDetail: (payload) => invoke('dweb:seedance:task-detail', payload || {}),
		sync: (payload) => invoke('dweb:seedance:sync', payload || {}),
	},
	chat: {
		conversations: {
			list: () => invoke('dweb:chat:conversations:list'),
			create: (payload) => invoke('dweb:chat:conversations:create', payload || {}),
			get: (payload) => invoke('dweb:chat:conversations:get', payload || {}),
			delete: (payload) => invoke('dweb:chat:conversations:delete', payload || {}),
			updateTitle: (payload) => invoke('dweb:chat:conversations:update-title', payload || {}),
		},
		messages: {
			send: (payload) => invoke('dweb:chat:messages:send', payload || {}),
			stream: (payload) => {
				const { generator } = createInvokeStream('dweb:chat:messages')(payload || {})
				return generator
			},
		},
	},
	export: {
		jobs: {
			create: (payload) => invoke('dweb:export:jobs:create', payload || {}),
			get: (payload) => invoke('dweb:export:jobs:get', payload || {}),
			listByProject: (payload) => invoke('dweb:export:jobs:list-by-project', payload || {}),
			stream: (payload) => {
				const { generator } = createInvokeStream('dweb:export:jobs')(payload || {})
				return generator
			},
			finalize: (payload) => invoke('dweb:export:jobs:finalize', payload || {}),
			file: (payload) => invoke('dweb:export:jobs:file', payload || {}),
		},
		frames: {
			upload: (payload) => invoke('dweb:export:frames:upload', payload || {}),
			uploadRaw: (payload) => invoke('dweb:export:frames:upload-raw', payload || {}),
			uploadBatch: (payload) => invoke('dweb:export:frames:upload-batch', payload || {}),
		},
	},
	editor: {
		components: {
			list: (payload) => invoke('dweb:editor:components:list', payload || {}),
			get: (payload) => invoke('dweb:editor:components:get', payload || {}),
			save: (payload) => invoke('dweb:editor:components:save', payload || {}),
			delete: (payload) => invoke('dweb:editor:components:delete', payload || {}),
			import: (payload) => invoke('dweb:editor:components:import', payload || {}),
		},
	},
	comfyui: {
		proxy: (payload) => invoke('dweb:comfyui:proxy', payload || {}),
		workflows: {
			list: (payload) => invoke('dweb:comfyui:workflows:list', payload || {}),
			get: (payload) => invoke('dweb:comfyui:workflows:get', payload || {}),
			save: (payload) => invoke('dweb:comfyui:workflows:save', payload || {}),
			delete: (payload) => invoke('dweb:comfyui:workflows:delete', payload || {}),
		},
		jobs: {
			list: (payload) => invoke('dweb:comfyui:jobs:list', payload || {}),
			get: (payload) => invoke('dweb:comfyui:jobs:get', payload || {}),
			create: (payload) => invoke('dweb:comfyui:jobs:create', payload || {}),
			cancel: (payload) => invoke('dweb:comfyui:jobs:cancel', payload || {}),
		},
		runtime: {
			ping: (payload) => invoke('dweb:comfyui:runtime:ping', payload || {}),
			workflows: {
				list: (payload) => invoke('dweb:comfyui:runtime:workflows:list', payload || {}),
				get: (payload) => invoke('dweb:comfyui:runtime:workflows:get', payload || {}),
			},
			run: (payload) => invoke('dweb:comfyui:runtime:run', payload || {}),
			outputs: (payload) => invoke('dweb:comfyui:runtime:outputs', payload || {}),
			cancel: (payload) => invoke('dweb:comfyui:runtime:cancel', payload || {}),
			job: (payload) => invoke('dweb:comfyui:runtime:job', payload || {}),
		},
	},
	thirdParty: {
		nanobanana: {
			refCache: (payload) => invoke('dweb:third-party:nanobanana:ref-cache', payload || {}),
			generate: (payload) => invoke('dweb:third-party:nanobanana:generate', payload || {}),
			generateStream: (payload) => {
				const { generator } = createInvokeStream('dweb:third-party:nanobanana:generate')(payload || {})
				return generator
			},
		},
		seedream: {
			refCache: (payload) => invoke('dweb:third-party:seedream:ref-cache', payload || {}),
			generateStream: (payload) => {
				const { generator } = createInvokeStream('dweb:third-party:seedream:generate')(payload || {})
				return generator
			},
		},
		jimeng: {
			imageGenerateStream: (payload) => {
				const { generator } = createInvokeStream('dweb:third-party:jimeng:image:generate')(payload || {})
				return generator
			},
			videoGenerateStream: (payload) => {
				const { generator } = createInvokeStream('dweb:third-party:jimeng:video:generate')(payload || {})
				return generator
			},
		},
		blueprint: {
			chat: (payload) => invoke('dweb:third-party:blueprint:chat', payload || {}),
			chatStream: (payload) => {
				const { generator } = createInvokeStream('dweb:third-party:blueprint:chat')(payload || {})
				return generator
			},
		},
	},
	projects: {
		list: () => invoke('dweb:projects:list'),
		save: (payload) => invoke('dweb:projects:save', payload || {}),
		load: (payload) => invoke('dweb:projects:load', payload || {}),
		delete: (payload) => invoke('dweb:projects:delete', payload || {}),
		openFolder: (payload) => invoke('dweb:projects:open-folder', payload || {}),
	},
	projectAssets: {
		health: () => invoke('dweb:project-assets:health'),
		upload: (payload) => invoke('dweb:project-assets:upload', payload || {}),
		import: (payload) => invoke('dweb:project-assets:import', payload || {}),
		delete: (payload) => invoke('dweb:project-assets:delete', payload || {}),
		resolve: (payload) => invoke('dweb:project-assets:resolve', payload || {}),
		repair: (payload) => invoke('dweb:project-assets:repair', payload || {}),
		repairAll: (payload) => invoke('dweb:project-assets:repair-all', payload || {}),
		registerRoot: (payload) => invoke('dweb:project-assets:register-root', payload || {}),
		clearRoot: (payload) => invoke('dweb:project-assets:clear-root', payload || {}),
		validateRoot: (payload) => invoke('dweb:project-assets:validate-root', payload || {}),
		rootSnapshot: () => invoke('dweb:project-assets:root-snapshot'),
		diagnose: (payload) => invoke('dweb:project-assets:diagnose', payload || {}),
		accessLogs: (payload) => invoke('dweb:project-assets:access-logs', payload || {}),
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
		copyFileToProjectRoot: (payload) => invoke('dweb:aiworkflow:copyFileToProjectRoot', payload || {}),
		fetchAsArrayBuffer: (payload) => invoke('dweb:aiworkflow:fetchAsArrayBuffer', payload || {}),

		// ---- 静态资产管理（纯本地；取代 Django assets/* API） ----
		uploadProjectAsset: (payload) => invoke('dweb:aiworkflow:uploadProjectAsset', payload || {}),
		importProjectAsset: (payload) => invoke('dweb:aiworkflow:importProjectAsset', payload || {}),
		deleteProjectAsset: (payload) => invoke('dweb:aiworkflow:deleteProjectAsset', payload || {}),
		resolveProjectAsset: (payload) => invoke('dweb:aiworkflow:resolveProjectAsset', payload || {}),
		repairProjectAsset: (payload) => invoke('dweb:aiworkflow:repairProjectAsset', payload || {}),
		diagnoseAsset: (payload) => invoke('dweb:aiworkflow:diagnoseAsset', payload || {}),
		validateProjectRoot: (payload) => invoke('dweb:aiworkflow:validateProjectRoot', payload || {}),
		getAssetAccessLogs: (payload) => invoke('dweb:aiworkflow:getAssetAccessLogs', payload || {}),
		getCacheStats: (payload) => invoke('dweb:project-cache:stats', payload || {}),
		clearCache: (payload) => invoke('dweb:project-cache:clear', payload || {}),

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
		projectAssets: {
			repairAll: (payload) => invoke('dweb:aiworkflow:projectAssets:repairAll', payload || {}),
		},
		migrateFromDjango: (payload) => invoke('dweb:localdb:migrateFromDjango', payload || {}),
		// ---- 图片预览原生窗口（Electron BrowserWindow） ----
		openImageMarkupPreview: (payload) => {
			console.log('[preload] openImageMarkupPreview called with:', JSON.stringify(payload))
			return invoke('dweb:image-markup:open', payload || {})
		},
		exportImageMarkup: (payload) => invoke('dweb:image-markup:export', payload || {}),
		onImageMarkupExported: (handler) => {
			if (typeof handler !== 'function') return -1
			const CHANNEL = 'dweb:image-markup:exported'
			const id = ++backendRuntimeListenerSeed
			const wrapped = (_event, payload) => {
				try { handler(payload) } catch { /* ignore */ }
			}
			backendRuntimeListenerMap.set(id, wrapped)
			ipcRenderer.on(CHANNEL, wrapped)
			return id
		},
		offImageMarkupExported: (listenerId) => {
			const CHANNEL = 'dweb:image-markup:exported'
			const id = Number(listenerId || 0)
			const wrapped = backendRuntimeListenerMap.get(id)
			if (!wrapped) return { ok: false }
			ipcRenderer.removeListener(CHANNEL, wrapped)
			backendRuntimeListenerMap.delete(id)
			return { ok: true }
		},

		// ===== 资源管理器原生窗口 =====
		openResourceManager: (payload) => {
			return invoke('dweb:resource-manager:open', payload || {})
		},
		closeResourceManager: () => invoke('dweb:resource-manager:close'),
		focusResourceManager: () => invoke('dweb:resource-manager:focus'),
		sendResourceManagerData: (payload) => {
			return invoke('dweb:resource-manager:send-data', payload || {})
		},
		broadcastResourceEvent: (payload) => invoke('dweb:resource-manager:broadcast', payload || {}),
		notifyResourceEvent: (payload) => invoke('dweb:resource-manager:notify', payload || {}),
		// 资源管理器窗口：读取已缓存的资源数据（数据可能在 Vue 挂载前就到达了）
		getResourceManagerData: () => resourceManagerLatestData,
		// 资源管理器窗口：主动向主窗口请求最新的资源数据
		requestResourceManagerData: () => invoke('dweb:resource-manager:request-data', {}),

		// 监听主窗口发来的事件（如资源被删除/添加后通知刷新）
		onResourceManagerEvent: (handler) => {
			if (typeof handler !== 'function') return -1
			const CHANNEL = 'dweb:resource-manager:event'
			const id = ++backendRuntimeListenerSeed
			const wrapped = (_event, payload) => {
				try { handler(payload) } catch { /* ignore */ }
			}
			backendRuntimeListenerMap.set(id, wrapped)
			ipcRenderer.on(CHANNEL, wrapped)
			return id
		},
		offResourceManagerEvent: (listenerId) => {
			const CHANNEL = 'dweb:resource-manager:event'
			const id = Number(listenerId || 0)
			const wrapped = backendRuntimeListenerMap.get(id)
			if (!wrapped) return { ok: false }
			ipcRenderer.removeListener(CHANNEL, wrapped)
			backendRuntimeListenerMap.delete(id)
			return { ok: true }
		},

		// 监听主窗口发来的通知（如其他操作改变了资源列表）
		onResourceManagerNotify: (handler) => {
			if (typeof handler !== 'function') return -1
			const CHANNEL = 'dweb:resource-manager:notify'
			const id = ++backendRuntimeListenerSeed
			const wrapped = (_event, payload) => {
				try { handler(payload) } catch { /* ignore */ }
			}
			backendRuntimeListenerMap.set(id, wrapped)
			ipcRenderer.on(CHANNEL, wrapped)
			return id
		},
		offResourceManagerNotify: (listenerId) => {
			const CHANNEL = 'dweb:resource-manager:notify'
			const id = Number(listenerId || 0)
			const wrapped = backendRuntimeListenerMap.get(id)
			if (!wrapped) return { ok: false }
			ipcRenderer.removeListener(CHANNEL, wrapped)
			backendRuntimeListenerMap.delete(id)
			return { ok: true }
		},
		// 监听主窗口推送的资源数据（Vue 挂载后注册，用于后续更新）
		onResourceManagerData: (handler) => {
			if (typeof handler !== 'function') return -1
			const id = ++resourceManagerDataListenerSeed
			resourceManagerDataHandlers.set(id, handler)
			// 如果已有缓存数据，立即回调一次
			if (resourceManagerLatestData !== null) {
				try { handler(resourceManagerLatestData) } catch { /* ignore */ }
			}
			return id
		},
		offResourceManagerData: (listenerId) => {
			const id = Number(listenerId || 0)
			if (!resourceManagerDataHandlers.has(id)) return { ok: false }
			resourceManagerDataHandlers.delete(id)
			return { ok: true }
		},
	},
	videostudio: {
		pingBackend: () => invoke('dweb:backend:ping'),
		selectExportDir: (options) => invoke('dweb:videostudio:selectExportDir', options),
	},
	platform: {
		getStatus: () => invoke('platform:get-status'),
		getActive: () => invoke('platform:get-active'),
		getUser: () => invoke('platform:get-user'),
		isAvailable: () => invoke('platform:is-available'),
		overlayIsEnabled: () => invoke('platform:overlay:is-enabled'),
		overlayIsActive: () => invoke('platform:overlay:is-active'),
		overlayOpenUrl: (url) => invoke('platform:overlay:open-url', url),
		overlayActivate: (dialog) => invoke('platform:overlay:activate', dialog),
		dlcIsInstalled: (dlcAppId) => invoke('platform:dlc:is-installed', dlcAppId),
		dlcGetInstalled: () => invoke('platform:dlc:get-installed'),
		onEvent: (handler) => {
			if (typeof handler !== 'function') return -1
			const id = ++platformListenerSeed
			const wrapped = (_event, payload) => {
				try { handler(payload) } catch {}
			}
			platformListenerMap.set(id, wrapped)
			ipcRenderer.on('platform:event', wrapped)
			invoke('platform:request-status')
			return id
		},
		offEvent: (listenerId) => {
			const id = Number(listenerId || 0)
			const wrapped = platformListenerMap.get(id)
			if (!wrapped) return { ok: false }
			ipcRenderer.removeListener('platform:event', wrapped)
			platformListenerMap.delete(id)
			return { ok: true }
		},
	},
})
