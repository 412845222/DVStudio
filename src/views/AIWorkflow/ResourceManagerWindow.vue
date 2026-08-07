<template>
	<div class="rmw-root">
		<!-- 加载阶段：只显示进度条，不显示面板内容 -->
		<template v-if="loading">
			<div class="rmw-loading-mask">
				<StartupProgressBar :state="progressState" />
			</div>
		</template>

		<!-- 加载完成后：显示资源管理器面板 -->
		<template v-else>
			<div class="rmw-content">
				<ResourceManagerPanel
					:open="true"
					:resources="resources"
					:nodes-by-id="nodesById"
					:node-order="nodeOrder"
					@close="handleClose"
					@remove="handleRemove"
					@remove-with-warning="handleRemoveWithWarning"
					@preview="handlePreview"
					@refresh-missing="handleRefreshMissing"
					@drop-to-node="handleDropToNode"
					@focus-node="handleFocusNode"
				/>

				<!-- 删除确认对话框（仅在"已使用"资源删除时显示） -->
				<div v-if="confirmDialog.visible" class="rmw-confirm-mask" @click.self="onCancelRemove">
					<div
						class="rmw-confirm-dialog"
						role="dialog"
						aria-modal="true"
						aria-labelledby="rmw-confirm-title"
					>
						<div class="rmw-confirm-header" id="rmw-confirm-title">
							<span class="rmw-confirm-icon">⚠</span>
							<span class="rmw-confirm-title-text">
								{{ t('aiworkflow.page.resourceManager.confirmTitle') }}
							</span>
						</div>
						<div class="rmw-confirm-body">
							<p>
								{{
									t('aiworkflow.page.resourceManager.usedBy', {
										count: String(confirmDialog.usedBy.length)
									})
								}}
							</p>
							<ul class="rmw-confirm-list">
								<li v-for="(u, idx) in confirmDialog.usedBy.slice(0, 10)" :key="idx">
									<span class="rmw-confirm-node-type">[{{ u.nodeType }}]</span>
									<span class="rmw-confirm-node-title">{{ u.nodeTitle || u.nodeId }}</span>
									<span v-if="u.description" class="rmw-confirm-node-desc">
										— {{ u.description }}
									</span>
								</li>
								<li v-if="confirmDialog.usedBy.length > 10" class="rmw-confirm-more">
									{{
										t('aiworkflow.page.resourceManager.andMoreNodes', {
											count: String(confirmDialog.usedBy.length - 10)
										})
									}}
								</li>
							</ul>
							<p class="rmw-confirm-hint">{{ t('aiworkflow.page.resourceManager.deleteHint') }}</p>
						</div>
						<div class="rmw-confirm-footer">
							<button class="rmw-confirm-btn rmw-confirm-cancel" @click="onCancelRemove">
								{{ t('aiworkflow.page.resourceManager.cancel') }}
							</button>
							<button class="rmw-confirm-btn rmw-confirm-danger" @click="onConfirmRemove">
								{{ t('aiworkflow.page.resourceManager.confirmDelete') }}
							</button>
						</div>
					</div>
				</div>

				<!-- Toast 提示 -->
				<div v-if="toastMessage" class="rmw-toast" :class="`rmw-toast-${toastMessage.tone}`">
					{{ toastMessage.text }}
				</div>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from '../../i18n'
import { getErrorMessage } from '../../types/utils'
import { useStore } from 'vuex'
import type {
	StartupProgressState,
	StartupProgressStep
} from '../../ui/UIComponent/StartupProgressBar.vue'
import { useStartupProgress } from '../../composables/useStartupProgress'
import ResourceManagerPanel from '../../ui/WorkFlow/ResourceManagerPanel.vue'
import { AIWorkflowKey } from '../../store/aiworkflow'
import type { WorkflowState, WorkflowResource, WorkflowNode } from '../../aiworkflow/types'
import { BlueprintProjectService } from '../../network/BlueprintProjectService'
import { openFolderForPath, registerProjectRoot } from '../../electronBridge'
import { useAIWorkflowResourceRecordCleanup } from './assets/useAIWorkflowResourceRecordCleanup'
import { isStaticAssetResource } from './assets/useAIWorkflowResourceUrlClassifier'

type RmDataPayload = {
	resources?: unknown[]
	nodesById?: Record<string, unknown>
	nodeOrder?: string[]
}
type RmEventPayload = { event: string; data?: unknown }

// ============ 1. Store & Services ============
const store = useStore<WorkflowState>(AIWorkflowKey)
const { t } = useI18n()
const blueprintProjectService = new BlueprintProjectService()

// ============ 1b. 本地缓存的资源数据（从主窗口接收） ============
const localResources = ref<WorkflowResource[]>([])
const localNodesById = ref<Record<string, WorkflowNode>>({})
const localNodeOrder = ref<string[]>([])
const dataReceived = ref(false)

// ============ 2. URL Query 解析 ============
const defaultTitle = t('aiworkflow.page.resourceManager.defaultTitle')
const routeParams = (() => {
	const raw = window.location.hash || ''
	const qIdx = raw.indexOf('?')
	if (qIdx < 0) return { projectId: null as number | null, title: '' as string }
	const params = new URLSearchParams(raw.slice(qIdx + 1))
	const rawId = params.get('projectId')
	const projectId = rawId != null ? (Number.isFinite(Number(rawId)) ? Number(rawId) : null) : null
	const title = decodeURIComponent(params.get('title') || defaultTitle)
	return { projectId, title }
})()

// ============ 3. 资源列表（优先从本地缓存读取，回退到store） ============
const resources = computed(() => {
	let list: Array<WorkflowResource> = []
	if (dataReceived.value) {
		// 已从主窗口接收到数据，直接使用（即使是空数组）
		list = (localResources.value as Array<WorkflowResource>) || []
	} else {
		const byId = store.state.resourcesById
		const order = store.state.resourceOrder
		if (Array.isArray(order)) {
			list = order.map((id) => byId[id]).filter(Boolean) as Array<WorkflowResource>
		}
	}
	/* ============ 整改方案 O3.1：资源管理器面板只展示真正的静态资产。
	 * 预热截图缓存、临时资源占位符等不展示；
	 * 从源头就不会渲染出"幽灵资源"，也就不会触发缩略图加载失败 → refreshMissing → 删除。
	 * （ResourceManagerPanel.vue sortedResources computed 中做了同样的防御性过滤）
	 */
	return list.filter((r) => isStaticAssetResource(r))
})

// ============ 3b. 节点数据（优先从本地缓存读取，回退到store） ============
const nodesById = computed(() => {
	if (dataReceived.value) {
		return localNodesById.value
	}
	const byId = store.state.nodesById
	return byId ?? {}
})
const nodeOrder = computed(() => {
	if (dataReceived.value) {
		return localNodeOrder.value
	}
	const order = store.state.nodeOrder
	return Array.isArray(order) ? order : []
})

// ============ 4. 当前项目 ID（从 store 读取） ============
const currentProjectId = computed(() => {
	const id = store.state.projectId
	return id != null && Number.isFinite(id) ? id : null
})

// ============ 5. Toast 提示（资源管理器窗口内简单实现） ============
const toastMessage = ref<{ text: string; tone: 'info' | 'warn' | 'error' } | null>(null)
let toastTimer: number | null = null

const pushToast = (text: string, tone: 'info' | 'warn' | 'error' = 'info') => {
	if (toastTimer !== null) {
		clearTimeout(toastTimer)
		toastTimer = null
	}
	toastMessage.value = { text, tone }
	toastTimer = window.setTimeout(() => {
		toastMessage.value = null
		toastTimer = null
	}, 3000)
}

// ============ 6. 资源清理 composable ============
const { onRemoveResource, onRefreshMissingResourceRecords } = useAIWorkflowResourceRecordCleanup({
	store,
	currentProjectId,
	blueprintProjectService,
	pushToast,
	isComfyForwardResource: (resource) => {
		const forwardUrls = ['result.image', 'image.upscaled.image', 'images.output', '.intermediate.']
		const url = String((resource as { url?: string })?.url || '').toLowerCase()
		return forwardUrls.some((u) => url.includes(u)) && url.includes('comfyui')
	},
	isDjangoManagedResource: (resource) => {
		const url = String((resource as { url?: string })?.url || '').trim()
		if (!url) return false
		if (url.startsWith('dweb://')) return true
		if (url.startsWith('file://') || url.startsWith('blob:')) return false
		return true
	},
	mediaRelativePathFromUrl: (rawUrl: string) => {
		const url = String(rawUrl || '').trim()
		if (!url) return ''
		try {
			const u = new URL(url)
			const path = decodeURIComponent(u.pathname || '')
			const parts = path.split('/').filter(Boolean)
			return parts.slice(-3).join('/')
		} catch {
			return ''
		}
	},
	removeResourceRecordOnly: (resourceId: string) => {
		store.commit('removeResource', { resourceId: String(resourceId || '').trim() })
	}
})

// ============ 7. 进度条 ============
const {
	state: progressStateRaw,
	show,
	beginStep,
	markStepOk,
	markStepError,
	updateStep
} = useStartupProgress()

const progressState = computed<StartupProgressState>(() => ({
	visible: true,
	title: progressStateRaw.value.title || t('aiworkflow.page.resourceManager.loadingTitle'),
	steps: progressStateRaw.value.steps.map((s: StartupProgressStep) => ({
		key: s.key,
		label: s.label,
		status: s.status,
		detail: s.detail || undefined
	})),
	autoHideMs: null
}))

// ============ 8. 事件处理 ============
const handleClose = async () => {
	try {
		if (
			window.dweb?.aiworkflow &&
			typeof window.dweb.aiworkflow.closeResourceManager === 'function'
		) {
			await window.dweb.aiworkflow.closeResourceManager()
			return
		}
	} catch {
		// ignore
	}
	// Web 环境 fallback：尝试关闭当前窗口
	try {
		window.close()
	} catch {
		// ignore
	}
}

const handleRemove = async (resourceId: string) => {
	await onRemoveResource(resourceId)
	// 通知主窗口资源已删除
	broadcastToMainWindow('remove', { resourceId })
}

// ============ 8b. 删除已使用资源的确认流程 ============
const confirmDialog = ref<{
	visible: boolean
	resourceId: string
	usedBy: Array<{ nodeId: string; nodeTitle: string; nodeType: string; description?: string }>
}>({
	visible: false,
	resourceId: '',
	usedBy: []
})

const handleRemoveWithWarning = async (payload: {
	resourceId: string
	usedBy: Array<{ nodeId: string; nodeTitle: string; nodeType: string; description?: string }>
}) => {
	confirmDialog.value = {
		visible: true,
		resourceId: payload.resourceId,
		usedBy: payload.usedBy ?? []
	}
}

const onCancelRemove = () => {
	confirmDialog.value = { visible: false, resourceId: '', usedBy: [] }
}

const onConfirmRemove = async () => {
	const rid = confirmDialog.value.resourceId
	confirmDialog.value = { visible: false, resourceId: '', usedBy: [] }
	if (rid) {
		await onRemoveResource(rid)
		broadcastToMainWindow('remove', { resourceId: rid })
	}
}

const handlePreview = async (resourceId: string) => {
	const rid = String(resourceId || '').trim()
	if (!rid) return

	let r: WorkflowResource | null = null
	if (dataReceived.value) {
		r = localResources.value.find((item: WorkflowResource) => String(item?.id) === rid) ?? null
	}
	if (!r) {
		r = store.state.resourcesById?.[rid] ?? null
	}
	if (!r) {
		pushToast(t('aiworkflow.page.resourceManager.toastNotExist'), 'warn')
		return
	}

	const projectRoot = String(store.state.projectRootPath || '').trim()

	const tryOpenPath = async (p: string): Promise<boolean> => {
		const target = String(p || '').trim()
		if (!target) return false
		try {
			const res = await openFolderForPath(target)
			return !!res?.ok
		} catch {
			// ignore
		}
		return false
	}

	const sourcePath = String(r.sourcePath || '').trim()
	if (sourcePath) {
		const ok = await tryOpenPath(sourcePath)
		if (ok) {
			broadcastToMainWindow('preview', { resourceId: rid })
			return
		}
	}

	const projectRelativePath = String(r.projectRelativePath || '').trim()
	if (projectRelativePath && projectRoot) {
		const fullPath = `${projectRoot}/${projectRelativePath}`.replace(/\\/g, '/')
		const ok = await tryOpenPath(fullPath)
		if (ok) {
			broadcastToMainWindow('preview', { resourceId: rid })
			return
		}
	}

	const url = String(r.url || r.posterUrl || '').trim()
	if (url) {
		try {
			window.open(url, '_blank')
			broadcastToMainWindow('preview', { resourceId: rid })
			return
		} catch {
			// ignore
		}
	}

	pushToast(t('aiworkflow.page.resourceManager.toastCannotLocate'), 'warn')
}

const handleRefreshMissing = async (resourceIds: string[]) => {
	await onRefreshMissingResourceRecords(resourceIds)
}

const handleDropToNode = async (resourceId: string) => {
	// 广播到主窗口，由主窗口在蓝图光标位置创建节点
	broadcastToMainWindow('drop-to-node', { resourceId, position: null })
}

const handleFocusNode = async (payload: { nodeId: string }) => {
	const nodeId = String(payload?.nodeId || '').trim()
	if (!nodeId) return

	if (dataReceived.value && localNodesById.value) {
		if (!localNodesById.value[nodeId]) {
			pushToast(t('aiworkflow.page.resourceManager.toastNodeDeleted'), 'warn')
			return
		}
	} else {
		const storeNodes = store.state.nodesById
		if (storeNodes && !storeNodes[nodeId]) {
			pushToast(t('aiworkflow.page.resourceManager.toastNodeDeleted'), 'warn')
			return
		}
	}

	broadcastToMainWindow('focus-node', { nodeId })
}

// ============ 9. IPC 广播到主窗口 ============
const broadcastToMainWindow = async (event: string, data?: unknown) => {
	try {
		if (
			window.dweb?.aiworkflow &&
			typeof window.dweb.aiworkflow.broadcastResourceEvent === 'function'
		) {
			await window.dweb.aiworkflow.broadcastResourceEvent({ event, data })
		}
	} catch {
		// ignore
	}
}

// ============ 10. 监听来自主窗口的通知 ============
let mainWindowNotifyListenerId: number | null = null
let mainWindowDataListenerId: number | null = null

const onMainWindowNotify = (payload: RmEventPayload) => {
	if (!payload?.event) return
	// 主窗口通知：资源列表可能已变化，触发刷新
	if (payload.event === 'resources-changed') {
		// store 已是响应式的，resources computed 会自动更新
		// 但如果需要强制刷新，可以在这里触发
	}
}

// 处理主窗口发送的资源数据
const applyResourceData = (payload: RmDataPayload | null | undefined) => {
	if (!payload) {
		console.warn('[ResourceManagerWindow] applyResourceData: payload is null/undefined')
		return false
	}
	const resIsArray = Array.isArray(payload.resources)
	const resCount = resIsArray ? payload.resources!.length : 0
	const hasNodes = payload.nodesById && typeof payload.nodesById === 'object'
	const hasNodeOrder = Array.isArray(payload.nodeOrder)
	const nodeOrderLen = hasNodeOrder ? payload.nodeOrder!.length : 0
	console.log(
		`[ResourceManagerWindow] applyResourceData: resources=${resIsArray ? `array[${resCount}]` : typeof payload.resources}, nodesById=${hasNodes ? 'ok' : 'N/A'}, nodeOrder=${hasNodeOrder ? `array[${nodeOrderLen}]` : 'N/A'}`
	)

	if (resIsArray) {
		localResources.value = payload.resources as WorkflowResource[]
		dataReceived.value = true
		if (localResources.value.length > 0) {
			const first = localResources.value[0]
			console.log('[ResourceManagerWindow] first resource:', {
				id: first?.id,
				kind: first?.kind,
				name: first?.name,
				hasUrl: typeof first?.url === 'string' && first.url.length > 0,
				sourcePath: first?.sourcePath,
				projectRelativePath: first?.projectRelativePath
			})
		}
	} else if (payload.resources !== undefined) {
		console.warn(
			'[ResourceManagerWindow] payload.resources is not an array, type:',
			typeof payload.resources
		)
	}

	if (hasNodes) {
		localNodesById.value = payload.nodesById as Record<string, WorkflowNode>
	}
	if (hasNodeOrder) {
		localNodeOrder.value = payload.nodeOrder as string[]
	}
	return dataReceived.value
}

// onResourceManagerData 回调（push 更新）
const onMainWindowData = (payload: RmDataPayload) => {
	applyResourceData(payload)
}

onMounted(async () => {
	const dweb = window.dweb

	// Step 0: 注册监听主窗口通知（push 模型）
	if (dweb?.aiworkflow && typeof dweb.aiworkflow.onResourceManagerNotify === 'function') {
		mainWindowNotifyListenerId = dweb.aiworkflow.onResourceManagerNotify(onMainWindowNotify)
	}

	// 加载流程 — 进度条分阶段反馈
	show(t('aiworkflow.page.resourceManager.loadingTitle'), null)

	// Step 1: 注册项目资产根目录
	beginStep('register-root', t('aiworkflow.page.resourceManager.stepRegisterRoot'))
	try {
		const projectId = currentProjectId.value
		const rootPath = store.state.projectRootPath
		if (projectId != null && rootPath) {
			await registerProjectRoot(projectId, rootPath)
		}
		markStepOk('register-root')
	} catch (err: unknown) {
		markStepError('register-root', getErrorMessage(err))
	}

	// Step 2: 从 preload 缓存读取资源数据（关键：数据可能在 Vue 挂载前就到达）
	beginStep('read-cache', t('aiworkflow.page.resourceManager.stepReadCache'))
	let readFromCache = false
	if (dweb?.aiworkflow && typeof dweb.aiworkflow.getResourceManagerData === 'function') {
		const cached = dweb.aiworkflow.getResourceManagerData()
		console.log('[ResourceManagerWindow] cached data from preload:', cached)
		if (cached) {
			const applied = applyResourceData(cached)
			readFromCache = applied
		}
	}

	// Step 3: 注册 push 监听器（用于后续数据推送/更新）
	// 注意：onResourceManagerData 在注册时如果已有缓存会立即回调
	if (dweb?.aiworkflow && typeof dweb.aiworkflow.onResourceManagerData === 'function') {
		mainWindowDataListenerId = dweb.aiworkflow.onResourceManagerData(onMainWindowData)
	}

	// Step 4: 如果仍无数据，主动请求主窗口发送一次（最多等待2秒）
	if (
		!dataReceived.value &&
		dweb?.aiworkflow &&
		typeof dweb.aiworkflow.requestResourceManagerData === 'function'
	) {
		try {
			const response = await dweb.aiworkflow.requestResourceManagerData()
			console.log('[ResourceManagerWindow] request-data response:', response)
			// 优先处理直接返回的数据
			if (response && response.data) {
				applyResourceData(response.data)
			}
			// 同时等待可能的 push 通知（最多 2 秒）
			if (!dataReceived.value) {
				const waitStart = Date.now()
				while (!dataReceived.value && Date.now() - waitStart < 2000) {
					await new Promise((resolve) => setTimeout(resolve, 50))
				}
			}
		} catch (err: unknown) {
			console.warn('[ResourceManagerWindow] request data failed:', err)
		}
	}

	const readStatus = dataReceived.value
		? t('aiworkflow.page.resourceManager.statusReadCount', {
				count: String(localResources.value.length)
			})
		: readFromCache
			? t('aiworkflow.page.resourceManager.statusNoCache')
			: t('aiworkflow.page.resourceManager.statusNoData')
	markStepOk('read-cache', readStatus)

	// Step 5: 解析资源记录
	beginStep('resolve-assets', t('aiworkflow.page.resourceManager.stepResolveAssets'))
	const total = resources.value.length
	markStepOk(
		'resolve-assets',
		t('aiworkflow.page.resourceManager.statusTotalCount', { count: String(total) })
	)

	// Step 6: 等待首帧渲染（DOM ready）
	beginStep('render', t('aiworkflow.page.resourceManager.stepRender'))
	await new Promise<void>((resolve) =>
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
	)
	markStepOk('render', t('aiworkflow.page.resourceManager.statusRenderDone'))

	// Step 7: 准备就绪
	beginStep('ready', t('aiworkflow.page.resourceManager.stepReady'))
	markStepOk('ready')

	// 微小延迟确保进度条动画可见，避免快速切换闪烁
	await new Promise<void>((resolve) => setTimeout(resolve, 300))

	// 更新文档标题
	document.title = `DVStudio · ${routeParams.title}`

	loading.value = false
})

onBeforeUnmount(() => {
	if (toastTimer !== null) {
		clearTimeout(toastTimer)
		toastTimer = null
	}
	const dweb = window.dweb
	if (mainWindowNotifyListenerId !== null && dweb?.aiworkflow?.offResourceManagerNotify) {
		dweb.aiworkflow.offResourceManagerNotify(mainWindowNotifyListenerId)
		mainWindowNotifyListenerId = null
	}
	if (mainWindowDataListenerId !== null && dweb?.aiworkflow?.offResourceManagerData) {
		dweb.aiworkflow.offResourceManagerData(mainWindowDataListenerId)
		mainWindowDataListenerId = null
	}
})

// ============ 11. 加载状态 ============
const loading = ref(true)
</script>

<style scoped>
.rmw-root {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	background: var(--theme-bg-primary);
	overflow: hidden;
	position: relative;
}

.rmw-loading-mask {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--theme-bg-primary);
	z-index: 100;
}

.rmw-content {
	flex: 1;
	display: flex;
	flex-direction: column;
	min-height: 0;
	overflow: hidden;
}

.rmw-content :deep(.wf-resource-panel) {
	position: relative;
	top: auto;
	left: auto;
	width: 100%;
	height: 100%;
	border: none;
	box-shadow: none;
	border-radius: 0;
}

.rmw-confirm-mask {
	position: absolute;
	inset: 0;
	background: color-mix(in srgb, black 55%, transparent);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 1000;
	animation: rmw-fade-in 150ms ease;
}

.rmw-confirm-dialog {
	width: 420px;
	max-width: 90vw;
	max-height: 80vh;
	background: var(--theme-bg-secondary);
	border: 1px solid var(--theme-border);
	border-radius: 8px;
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
	display: flex;
	flex-direction: column;
	animation: rmw-pop-in 180ms ease;
	overflow: hidden;
}

.rmw-confirm-header {
	padding: 14px 18px;
	border-bottom: 1px solid var(--theme-border);
	display: flex;
	align-items: center;
	gap: 10px;
	background: color-mix(in srgb, var(--theme-error) 15%, var(--theme-bg-secondary));
}

.rmw-confirm-icon {
	font-size: 18px;
	color: var(--theme-warning, #f0ad4e);
}

.rmw-confirm-title-text {
	font-size: 14px;
	color: var(--theme-text-primary);
	font-weight: 500;
}

.rmw-confirm-body {
	padding: 16px 18px;
	color: var(--theme-text-primary);
	font-size: 13px;
	line-height: 1.6;
	overflow-y: auto;
	flex: 1;
	min-height: 0;
}

.rmw-confirm-body p {
	margin: 0 0 10px;
}

.rmw-confirm-body strong {
	color: var(--theme-warning, #f0ad4e);
}

.rmw-confirm-list {
	margin: 10px 0;
	padding-left: 18px;
	max-height: 200px;
	overflow-y: auto;
	list-style: disc;
}

.rmw-confirm-list li {
	margin: 4px 0;
	font-size: 12px;
	color: var(--theme-text-secondary);
}

.rmw-confirm-node-type {
	color: var(--theme-accent);
	margin-right: 6px;
}

.rmw-confirm-node-title {
	color: var(--theme-text-primary);
}

.rmw-confirm-node-desc {
	color: var(--theme-text-secondary);
	margin-left: 4px;
}

.rmw-confirm-more {
	color: var(--theme-text-secondary);
	font-size: 11px;
}

.rmw-confirm-hint {
	margin-top: 10px;
	padding-top: 10px;
	border-top: 1px dashed var(--theme-border);
	color: var(--theme-text-secondary);
	font-size: 12px;
	text-align: center;
}

.rmw-confirm-footer {
	padding: 12px 18px;
	border-top: 1px solid var(--theme-border);
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	background: var(--theme-bg-tertiary);
}

.rmw-confirm-btn {
	padding: 6px 14px;
	font-size: 12px;
	color: var(--theme-text-primary);
	border-radius: 4px;
	cursor: pointer;
	border: 1px solid var(--theme-border);
	background: var(--theme-bg-tertiary);
	transition: all 120ms ease;
}

.rmw-confirm-btn:hover {
	background: var(--theme-hover-bg);
	border-color: var(--theme-hover-border);
}

.rmw-confirm-cancel {
	background: var(--theme-bg-secondary);
}

.rmw-confirm-danger {
	background: var(--theme-error);
	border-color: var(--theme-error);
	color: #fff;
}

.rmw-confirm-danger:hover {
	background: color-mix(in srgb, var(--theme-error) 85%, white);
	border-color: color-mix(in srgb, var(--theme-error) 85%, white);
}

.rmw-toast {
	position: fixed;
	top: 18px;
	left: 50%;
	transform: translateX(-50%);
	z-index: 1200;
	padding: 10px 16px;
	border-radius: 4px;
	font-size: 13px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
	animation: rmw-fade-in 180ms ease;
}

.rmw-toast-info {
	background: color-mix(in srgb, var(--theme-accent) 80%, var(--theme-bg-tertiary));
	color: #fff;
}

.rmw-toast-warn {
	background: var(--theme-warning, #8a6a2a);
	color: #fff;
}

.rmw-toast-error {
	background: var(--theme-error);
	color: #fff;
}

@keyframes rmw-fade-in {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

@keyframes rmw-pop-in {
	from {
		opacity: 0;
		transform: translateY(6px) scale(0.98);
	}
	to {
		opacity: 1;
		transform: translateY(0) scale(1);
	}
}
</style>
