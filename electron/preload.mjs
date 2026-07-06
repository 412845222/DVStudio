import { contextBridge, ipcRenderer } from 'electron'
import { APP_NAME, APP_ID, APP_VERSION, APP_COPYRIGHT, APP_LICENSE, APP_HOMEPAGE, APP_REPO_URL, APP_BILIBILI_URL, APP_ISSUES_URL } from './config.mjs'

function invoke(channel, payload) {
	return ipcRenderer.invoke(channel, payload)
}

const BACKEND_RUNTIME_CHANNEL = 'dweb:backendRuntime:changed'
const backendRuntimeListenerMap = new Map()
let backendRuntimeListenerSeed = 0

const platformListenerMap = new Map()
let platformListenerSeed = 0

const builtinToolListenerMap = new Map()
let builtinToolListenerSeed = 0

function createIpcStreamGenerator(baseChannel, payload) {
	const requestId = (payload && payload.requestId) || Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
	const dataChannel = baseChannel + ':data'
	const endChannel = baseChannel + ':end'
	const errorChannel = baseChannel + ':error'
	const streamPayload = Object.assign({}, payload || {}, { requestId })

	let done = false
	let error = null
	const queue = []
	let resolvePush = null
	let resolvePull = null

	const onData = (_event, rid, chunk) => {
		if (rid !== requestId) return
		if (done) return
		queue.push({ value: chunk, done: false })
		if (resolvePull) {
			const r = resolvePull
			resolvePull = null
			r()
		}
	}

	const onEnd = (_event, rid) => {
		if (rid !== requestId) return
		if (done) return
		done = true
		queue.push({ value: undefined, done: true })
		cleanup()
		if (resolvePull) {
			const r = resolvePull
			resolvePull = null
			r()
		}
	}

	const onError = (_event, rid, err) => {
		if (rid !== requestId) return
		if (done) return
		done = true
		error = err
		queue.push({ value: undefined, done: true, error: err })
		cleanup()
		if (resolvePull) {
			const r = resolvePull
			resolvePull = null
			r()
		}
	}

	const cleanup = () => {
		ipcRenderer.removeListener(dataChannel, onData)
		ipcRenderer.removeListener(endChannel, onEnd)
		ipcRenderer.removeListener(errorChannel, onError)
	}

	ipcRenderer.on(dataChannel, onData)
	ipcRenderer.on(endChannel, onEnd)
	ipcRenderer.on(errorChannel, onError)

	const startInvoke = invoke(baseChannel + ':stream', streamPayload).catch((err) => {
		if (!done) {
			done = true
			error = err
			queue.push({ value: undefined, done: true, error: err })
			cleanup()
			if (resolvePull) {
				const r = resolvePull
				resolvePull = null
				r()
			}
		}
	})

	return {
		[Symbol.asyncIterator]() {
			return this
		},
		async next() {
			if (queue.length > 0) {
				const item = queue.shift()
				if (item.error) throw new Error(item.error?.error || item.error?.message || String(item.error))
				return item
			}
			if (done) return { value: undefined, done: true }
			await new Promise((r) => { resolvePull = r })
			if (queue.length > 0) {
				const item = queue.shift()
				if (item.error) throw new Error(item.error?.error || item.error?.message || String(item.error))
				return item
			}
			return { value: undefined, done: true }
		},
		async return() {
			done = true
			cleanup()
			return { value: undefined, done: true }
		},
		async throw(err) {
			done = true
			error = err
			cleanup()
			throw err
		},
	}
}

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
// 性能优化：IPC 模式下 baseUrl 总是空字符串，无需阻塞等待
contextBridge.exposeInMainWorld('__DWEB_BACKEND_BASE_URL', '')
contextBridge.exposeInMainWorld('__DWEB_BACKEND_BASE_URL__', '')

// Client settings: 不阻塞 preload，先设置 null，异步加载后更新
contextBridge.exposeInMainWorld('__DWEB_CLIENT_SETTINGS', null)
invoke('dweb:settings:get')
	.then((result) => {
		if (result?.ok && result.data) {
			try {
				const desc = Object.getOwnPropertyDescriptor(window, '__DWEB_CLIENT_SETTINGS')
				const canAssign = !desc || ('writable' in desc ? Boolean(desc.writable) : typeof desc.set === 'function')
				if (canAssign) window.__DWEB_CLIENT_SETTINGS = result.data
			} catch {}
		}
	})
	.catch(() => {})

contextBridge.exposeInMainWorld('__DWEB_AIWF_AUTO_HELLO', process.env.DWEB_AIWF_AUTO_HELLO || '')
contextBridge.exposeInMainWorld('__DWEB_AIWF_AUTO_HELLO_TEXT', process.env.DWEB_AIWF_AUTO_HELLO_TEXT || '')

// 运行环境标记：用于区分 Web 部署 vs Electron 客户端
contextBridge.exposeInMainWorld('__DWEB_RUNTIME__', {
	platform: 'electron',
	isElectron: true,
	appName: APP_NAME,
	appVersion: APP_VERSION,
})

// 后端模式标记：表示后端已迁移到 Electron IPC，不再依赖 Django HTTP
contextBridge.exposeInMainWorld('__DWEB_BACKEND_MODE__', 'migration')

/**
 * 上下文桥设计：
 * - window.dweb.aiworkflow：供 / (AIWorkflow) 页面使用
 * - window.dweb.videostudio：供 /studio (VideoStudio) 页面使用
 * - window.dweb.common：通用能力
 */
contextBridge.exposeInMainWorld('dweb', {
	common: {
		getAppInfo: () => ({
			appName: APP_NAME,
			appId: APP_ID,
			appVersion: APP_VERSION,
			copyright: APP_COPYRIGHT,
			license: APP_LICENSE,
			homepage: APP_HOMEPAGE,
			repoUrl: APP_REPO_URL,
			bilibiliUrl: APP_BILIBILI_URL,
			issuesUrl: APP_ISSUES_URL,
		}),
		checkForUpdate: () => invoke('dweb:system:check-update'),
		isSteamVersion: () => invoke('dweb:system:is-steam'),
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
		openExternalUrl: (payload) => invoke('dweb:app:openExternalUrl', payload),
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
			tripo3d: {
				list: (payload) => invoke('dweb:localdb:tripo3d:list', payload || {}),
				get: (payload) => invoke('dweb:localdb:tripo3d:get', payload || {}),
				upsert: (payload) => invoke('dweb:localdb:tripo3d:upsert', payload || {}),
				remove: (payload) => invoke('dweb:localdb:tripo3d:remove', payload || {}),
			},
			apiKeys: {
				list: () => invoke('dweb:localdb:apiKeys:list'),
				get: (payload) => invoke('dweb:localdb:apiKeys:get', payload || {}),
				set: (payload) => invoke('dweb:localdb:apiKeys:set', payload || {}),
				getPlaintext: (payload) => invoke('dweb:localdb:apiKeys:getPlaintext', payload || {}),
				remove: (payload) => invoke('dweb:localdb:apiKeys:remove', payload || {}),
			},
			templates: {
				list: () => invoke('dweb:localdb:aiworkflowTemplates:list'),
				getBlob: (payload) => invoke('dweb:localdb:aiworkflowTemplates:getBlob', payload || {}),
				getCover: (payload) => invoke('dweb:localdb:aiworkflowTemplates:getCover', payload || {}),
				save: (payload) => invoke('dweb:localdb:aiworkflowTemplates:save', payload || {}),
				remove: (payload) => invoke('dweb:localdb:aiworkflowTemplates:remove', payload || {}),
			},
		},
		projectAssets: {
			repairAll: (payload) => invoke('dweb:aiworkflow:projectAssets:repairAll', payload || {}),
		},
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
	// ===== 第三方API（图片/视频生成） =====
	thirdParty: {
		nanobanana: {
			refCache: (payload) => invoke('dweb:third-party:nanobanana:ref-cache', payload || {}),
			generate: (payload) => invoke('dweb:third-party:nanobanana:generate', payload || {}),
			generateStream: (payload) => createIpcStreamGenerator('dweb:third-party:nanobanana:generate', payload || {}),
		},
		seedream: {
			refCache: (payload) => invoke('dweb:third-party:seedream:ref-cache', payload || {}),
			generateStream: (payload) => createIpcStreamGenerator('dweb:third-party:seedream:generate', payload || {}),
		},
		gemini: {
			imageGenerateStream: (payload) => createIpcStreamGenerator('dweb:third-party:gemini:image:generate', payload || {}),
		},
		jimeng: {
			imageGenerateStream: (payload) => createIpcStreamGenerator('dweb:third-party:jimeng:image:generate', payload || {}),
			videoGenerateStream: (payload) => createIpcStreamGenerator('dweb:third-party:jimeng:video:generate', payload || {}),
		},
		blueprint: {
			chat: (payload) => invoke('dweb:third-party:blueprint:chat', payload || {}),
			chatStream: (payload) => createIpcStreamGenerator('dweb:third-party:blueprint:chat', payload || {}),
		},
	},
	// ===== Meshy 3D 模型生成 =====
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
	// ===== Tripo3D 3D 模型生成 =====
	tripo3d: {
		health: () => invoke('dweb:tripo3d:health'),
		generate: (payload) => invoke('dweb:tripo3d:generate', payload || {}),
		getTask: (payload) => invoke('dweb:tripo3d:get-task', payload || {}),
		listTasks: (payload) => invoke('dweb:tripo3d:list-tasks', payload || {}),
		taskDetail: (payload) => invoke('dweb:tripo3d:task-detail', payload || {}),
		stop: (payload) => invoke('dweb:tripo3d:stop', payload || {}),
		deleteTask: (payload) => invoke('dweb:tripo3d:delete', payload || {}),
		balance: () => invoke('dweb:tripo3d:balance'),
		uploadFile: (payload) => invoke('dweb:tripo3d:upload-file', payload || {}),
	},
	// ===== Gemini 图片生成任务 =====
	gemini: {
		health: () => invoke('dweb:gemini:health'),
		getTask: (payload) => invoke('dweb:gemini:get-task', payload || {}),
		listTasks: (payload) => invoke('dweb:gemini:list-tasks', payload || {}),
		cancel: (payload) => invoke('dweb:gemini:cancel', payload || {}),
		deleteTask: (payload) => invoke('dweb:gemini:delete', payload || {}),
		clearCompleted: (payload) => invoke('dweb:gemini:clear-completed', payload || {}),
		getImagePath: (payload) => invoke('dweb:gemini:get-image-path', payload || {}),
	},
	// ===== Seedance 视频生成 =====
	seedance: {
		health: () => invoke('dweb:seedance:health'),
		generateStream: (payload) => createIpcStreamGenerator('dweb:seedance:generate', payload || {}),
		list: (payload) => invoke('dweb:seedance:list', payload || {}),
		taskDetail: (payload) => invoke('dweb:seedance:task-detail', payload || {}),
		sync: (payload) => invoke('dweb:seedance:sync', payload || {}),
		taskDetailRemote: (payload) => invoke('dweb:seedance:task-detail-remote', payload || {}),
		downloadAsset: (payload) => invoke('dweb:seedance:download-asset', payload || {}),
		listAllRemote: (payload) => invoke('dweb:seedance:list-all-remote', payload || {}),
	},
	// ===== 火山方舟（ARK）任务面板 =====
	ark: {
		listTasks: (payload) => invoke('dweb.ark.listTasks', payload || {}),
		getTaskDetail: (payload) => invoke('dweb.ark.getTaskDetail', payload || {}),
		deleteTask: (payload) => invoke('dweb.ark.deleteTask', payload || {}),
		recordTask: (payload) => invoke('dweb.ark.recordTask', payload || {}),
	},
	// ===== ComfyUI =====
	comfyui: {
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
	// ===== Codex 编程助手 =====
	codex: {
		health: () => invoke('dweb:codex:health'),
		listSessions: (payload) => invoke('dweb:codex:list-sessions', payload || {}),
		createSession: (payload) => invoke('dweb:codex:create-session', payload || {}),
		listMessages: (payload) => invoke('dweb:codex:list-messages', payload || {}),
		updateSession: (payload) => invoke('dweb:codex:update-session', payload || {}),
		deleteSession: (payload) => invoke('dweb:codex:delete-session', payload || {}),
		submitApproval: (payload) => invoke('dweb:codex:submit-approval', payload || {}),
		sendMessageStream: (payload) => createIpcStreamGenerator('dweb:codex:send-message', payload || {}),
		cancel: (payload) => invoke('dweb:codex:cancel', payload || {}),
	},
	// ===== Agent 执行器 =====
	agent: {
		stream: (payload) => createIpcStreamGenerator('dweb:agent', payload || {}),
		getContext: (payload) => invoke('dweb:agent:context', payload || {}),
		abort: (payload) => invoke('dweb:agent:abort', payload || {}),
	},
	// ===== Agent Skills =====
	agentSkills: {
		sceneUnderstand: {
			models: () => invoke('dweb:agent-skills:scene-understand:models'),
			run: (payload) => invoke('dweb:agent-skills:scene-understand:run', payload || {}),
			runStream: (payload) => createIpcStreamGenerator('dweb:agent-skills:scene-understand:run', payload || {}),
		},
		sceneLighting: {
			models: () => invoke('dweb:agent-skills:scene-lighting:models'),
			run: (payload) => invoke('dweb:agent-skills:scene-lighting:run', payload || {}),
			runStream: (payload) => createIpcStreamGenerator('dweb:agent-skills:scene-lighting:run', payload || {}),
		},
		sceneLayout: {
			run: (payload) => invoke('dweb:agent-skills:scene-layout:run', payload || {}),
		},
		unreal: {
			sessions: () => invoke('dweb:agent-skills:unreal:sessions'),
			register: (payload) => invoke('dweb:agent-skills:unreal:register', payload || {}),
			sessionDetail: (payload) => invoke('dweb:agent-skills:unreal:session-detail', payload || {}),
			createJob: (payload) => invoke('dweb:agent-skills:unreal:create-job', payload || {}),
			jobDetail: (payload) => invoke('dweb:agent-skills:unreal:job-detail', payload || {}),
			heartbeat: (payload) => invoke('dweb:agent-skills:unreal:heartbeat', payload || {}),
			pickJob: (payload) => invoke('dweb:agent-skills:unreal:pick-job', payload || {}),
			getHttpPort: () => invoke('dweb:agent-skills:unreal:get-http-port'),
			detectEditor: () => invoke('dweb:agent-skills:unreal:detect-editor'),
			checkPlugin: (payload) => invoke('dweb:agent-skills:unreal:check-plugin', payload || {}),
			installPlugin: (payload) => invoke('dweb:agent-skills:unreal:install-plugin', payload || {}),
			getPluginInfo: () => invoke('dweb:agent-skills:unreal:get-plugin-info'),
			disconnectSession: (payload) => invoke('dweb:agent-skills:unreal:disconnect-session', payload || {}),
		},
	},
	// ===== MCP 工具 =====
	mcp: {
		connect: (payload) => invoke('dweb:mcp:connect', payload || {}),
		disconnect: (payload) => invoke('dweb:mcp:disconnect', payload || {}),
		listTools: (payload) => invoke('dweb:mcp:list-tools', payload || {}),
		callTool: (payload) => invoke('dweb:mcp:call-tool', payload || {}),
		registerBuiltin: (payload) => invoke('dweb:mcp:register-builtin', payload || {}),
		onBuiltinToolCall: (handler) => {
			if (typeof handler !== 'function') return -1
			const id = ++builtinToolListenerSeed
			const wrapped = (_event, payload) => {
				try { handler(payload) } catch {}
			}
			builtinToolListenerMap.set(id, wrapped)
			ipcRenderer.on('dweb:builtin-tool:call', wrapped)
			return id
		},
		offBuiltinToolCall: (listenerId) => {
			const id = Number(listenerId || 0)
			const wrapped = builtinToolListenerMap.get(id)
			if (!wrapped) return { ok: false }
			ipcRenderer.removeListener('dweb:builtin-tool:call', wrapped)
			builtinToolListenerMap.delete(id)
			return { ok: true }
		},
		respondBuiltinTool: (requestId, result) => {
			ipcRenderer.send(`dweb:builtin-tool:${requestId}:response`, { result })
		},
	},
	// ===== CLI 适配器 =====
	cli: {
		checkAvailability: (payload) => invoke('dweb:cli:check-availability', payload || {}),
		listAdapters: () => invoke('dweb:cli:list-adapters'),
		startSession: (payload) => invoke('dweb:cli:start-session', payload || {}),
		stopSession: (payload) => invoke('dweb:cli:stop-session', payload || {}),
		sendMessage: (payload) => createIpcStreamGenerator('dweb:cli:send-message', payload || {}),
		cancel: (payload) => invoke('dweb:cli:cancel', payload || {}),
		getSession: (payload) => invoke('dweb:cli:get-session', payload || {}),
		listSessions: () => invoke('dweb:cli:list-sessions'),
		checkEnvironment: (payload) => invoke('dweb:cli:check-environment', payload || {}),
		listModels: (payload) => invoke('dweb:cli:list-models', payload || {}),
		getConfig: (payload) => invoke('dweb:cli:get-config', payload || {}),
		saveConfig: (payload) => invoke('dweb:cli:save-config', payload || {}),
		runFix: (payload) => invoke('dweb:cli:run-fix', payload || {}),
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
