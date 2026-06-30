<template>
	<WorkflowNodeBase
		:nodeId="nodeId"
		:title="title"
		:alias="alias"
		:nodeType="nodeType"
		:subtitle="subtitle"
		:style="style"
		:width="width"
		:height="height"
		:zoom="zoom"
		:worldX="worldX"
		:worldY="worldY"
		:inputs="inputs"
		:outputs="outputs"
		:selected="selected"
		:hoverInputAnchorId="hoverInputAnchorId"
		:hoverOutputAnchorId="hoverOutputAnchorId"
		@update:world-x="(v) => emit('update:worldX', v)"
		@update:world-y="(v) => emit('update:worldY', v)"
		@select="(id) => emit('select', id)"
		@start-link="onStartLink"
		@end-link="onEndLink"
		@copy="() => emit('copy')"
		@refresh="() => emit('refresh')"
		@delete="() => emit('delete')"
		@set-type="onSetType"
		@resize="onResize"
	>
		<template #body>
			<div class="wf-unreal-export" @pointerdown.stop>
				<div class="wf-unreal-export-status" :class="`is-${statusTone}`">
					<div class="wf-unreal-export-status-title">{{ statusTitle }}</div>
					<div class="wf-unreal-export-status-copy">{{ statusCopy }}</div>
				</div>

				<div v-if="showEditorStatus" class="wf-unreal-export-editor-status">
					<div class="wf-unreal-export-editor-row">
						<span class="wf-unreal-export-editor-label">编辑器状态</span>
						<span class="wf-unreal-export-editor-value" :class="editorStatusClass">
							{{ editorStatusText }}
						</span>
					</div>
					<div v-if="editorProcessName" class="wf-unreal-export-editor-row">
						<span class="wf-unreal-export-editor-label">项目名称</span>
						<span class="wf-unreal-export-editor-value">{{ editorProcessName }}</span>
					</div>
				</div>

				<div v-if="showPluginInstall" class="wf-unreal-export-plugin-install">
					<div class="wf-unreal-export-plugin-title">
						{{ pluginSectionTitle }}
					</div>
					<div v-if="!pluginInstalled && !isInstallingPlugin" class="wf-unreal-export-plugin-path">
						<input
							v-model="localProjectPath"
							type="text"
							class="wf-unreal-export-plugin-path-input"
							placeholder="请输入虚幻项目根路径或 .uproject 文件路径"
							@keydown.enter="handleInstallPlugin"
						/>
					</div>
					<div v-if="pluginInstallError" class="wf-unreal-export-plugin-error">
						{{ pluginInstallError }}
					</div>
				</div>

				<div class="wf-unreal-export-actions">
					<button
						v-if="showDetectButton"
						class="wf-unreal-export-btn"
						type="button"
						:disabled="isCheckingEditor"
						@click.stop="emit('detect-editor')"
					>
						{{ isCheckingEditor ? '检测中...' : '检测虚幻编辑器' }}
					</button>

					<button
						v-if="showInstallButton"
						class="wf-unreal-export-btn"
						type="button"
						:disabled="!canInstallPlugin"
						@click.stop="handleInstallPlugin"
					>
						{{ isInstallingPlugin ? '安装中...' : '安装插件' }}
					</button>

					<button
						v-if="showRefreshAfterRestart"
						class="wf-unreal-export-btn"
						type="button"
						@click.stop="emit('detect-editor')"
					>
						我已重启，重新检测
					</button>

					<button
						v-if="showWaitConnectionButton"
						class="wf-unreal-export-btn"
						type="button"
						@click.stop="emit('await-unreal-connection')"
					>
						{{ connectionButtonLabel }}
					</button>

					<button
						v-if="isConnected"
						class="wf-unreal-export-btn ghost"
						type="button"
						:disabled="!hasLightingInput"
						@click.stop="emit('export-unreal-lighting')"
					>
						导出灯光
					</button>
					<button
						v-if="isConnected"
						class="wf-unreal-export-btn ghost"
						type="button"
						:disabled="!hasLayoutInput"
						@click.stop="emit('export-unreal-scene')"
					>
						导出场景
					</button>
				</div>

				<div v-if="showOpenPluginGuide" class="wf-unreal-export-guide">
					<div class="wf-unreal-export-guide-title">操作提示</div>
					<div class="wf-unreal-export-guide-text">
						请在虚幻编辑器中打开插件面板：
						<br />
						<span class="wf-unreal-export-guide-path">Window → Dweb → Dweb Workflow Bridge</span>
						<br />
						然后点击「等待连接」按钮开始连接。
					</div>
				</div>

				<div v-if="progressVisible" class="wf-unreal-export-progress">
					<div class="wf-unreal-export-progress-bar">
						<div
							class="wf-unreal-export-progress-fill"
							:style="{ width: `${progressPercent}%` }"
						></div>
					</div>
					<div class="wf-unreal-export-progress-copy">{{ progressCopy }}</div>
				</div>
			</div>
		</template>

		<template #footer>
			<div class="wf-unreal-export-footer" @pointerdown.stop>
				<div class="wf-unreal-export-grid">
					<div>布局输入</div>
					<div>{{ hasLayoutInput ? '已连接' : '未连接' }}</div>
					<div>灯光输入</div>
					<div>{{ hasLightingInput ? '已连接' : '未连接' }}</div>
					<div>目标工程</div>
					<div>{{ projectNameDisplay }}</div>
					<div>会话</div>
					<div>{{ sessionDisplay }}</div>
					<div>保存路径</div>
					<div>{{ saveDirectoryDisplay }}</div>
					<div>资产路径</div>
					<div>{{ assetRootPathDisplay }}</div>
					<div v-if="lastLightingSummary">灯光导入</div>
					<div v-if="lastLightingSummary">{{ lastLightingSummary }}</div>
					<div v-if="lastSlotCountText">布局协议</div>
					<div v-if="lastSlotCountText">{{ lastLayoutProtocolVersionText }}</div>
					<div v-if="lastSlotCountText">插槽写入</div>
					<div v-if="lastSlotCountText">{{ lastSlotCountText }}</div>
					<div v-if="lastActorBaseClassText">Actor基类</div>
					<div v-if="lastActorBaseClassText">{{ lastActorBaseClassText }}</div>
				</div>
				<div class="wf-unreal-export-copy">{{ detailCopy }}</div>
			</div>
		</template>
	</WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import WorkflowNodeBase from '../WorkflowNodeBase.vue'
import type { WorkflowUnrealExportNodeSettings } from '../../../aiworkflow/types'

type AnchorSpec = {
	id: string
	label?: string
	offsetY?: number
	mediaType?: 'generic' | 'image' | 'video' | 'text' | 'flow'
}

const props = defineProps<{
	nodeId: string
	title: string
	alias?: string
	nodeType: string
	subtitle?: string
	style?: Record<string, string>
	unrealExportSettings?: WorkflowUnrealExportNodeSettings | null
	linkedLayoutJsonText?: string
	linkedLightingJsonText?: string
	width: number
	height: number
	zoom: number
	worldX: number
	worldY: number
	inputs?: AnchorSpec[]
	outputs?: AnchorSpec[]
	selected?: boolean
	hoverInputAnchorId?: string | null
	hoverOutputAnchorId?: string | null
}>()

const onStartLink = (payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }) => { emit('start-link', payload) }
const onEndLink = (payload: { nodeId: string; anchorId: string; anchorIndex: number }) => { emit('end-link', payload) }
const onSetType = (type: 'base' | 'text' | 'text-merge' | 'image' | 'rotate-image' | 'video' | 'scene-understanding' | 'scene-decompose' | 'scene-layout' | 'unreal-export' | 'story' | 'comfyui' | 'model3d' | 'meshy') => { emit('set-type', type) }
const onResize = (payload: { width: number; height: number; worldX: number; worldY: number }) => { emit('resize', payload) }

const emit = defineEmits<{
	(e: 'update:worldX', v: number): void
	(e: 'update:worldY', v: number): void
	(e: 'select', nodeId: string): void
	(
		e: 'start-link',
		payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }
	): void
	(e: 'end-link', payload: { nodeId: string; anchorId: string; anchorIndex: number }): void
	(e: 'copy'): void
	(e: 'refresh'): void
	(e: 'delete'): void
	(
		e: 'set-type',
		v:
			| 'base'
			| 'text'
			| 'text-merge'
			| 'image'
			| 'rotate-image'
			| 'video'
			| 'scene-understanding'
			| 'scene-decompose'
			| 'scene-layout'
			| 'unreal-export'
			| 'story'
			| 'comfyui'
			| 'model3d'
			| 'meshy'
	): void
	(e: 'resize', payload: { width: number; height: number; worldX: number; worldY: number }): void
	(e: 'detect-editor'): void
	(e: 'check-plugin', projectPath: string): void
	(e: 'install-plugin', projectPath: string): void
	(e: 'await-unreal-connection'): void
	(e: 'export-unreal-lighting'): void
	(e: 'export-unreal-scene'): void
}>()

const settings = computed(() => props.unrealExportSettings ?? null)
const hasLayoutInput = computed(() => String(props.linkedLayoutJsonText ?? '').trim().length > 0)
const hasLightingInput = computed(
	() => String(props.linkedLightingJsonText ?? '').trim().length > 0
)
const isConnected = computed(() => settings.value?.connectionStatus === 'connected')

const editorStatus = computed(() => settings.value?.editorStatus ?? 'unknown')
const pluginStatus = computed(() => settings.value?.pluginStatus ?? 'unknown')
const isCheckingEditor = computed(() => editorStatus.value === 'checking')
const isEditorRunning = computed(() => editorStatus.value === 'running')
const isEditorNotRunning = computed(() => editorStatus.value === 'not-running')

const isCheckingPlugin = computed(() => pluginStatus.value === 'checking')
const isInstallingPlugin = computed(() => pluginStatus.value === 'installing')
const pluginInstalled = computed(() => pluginStatus.value === 'installed')
const pluginNotInstalled = computed(() => pluginStatus.value === 'not-installed')
const pluginNeedsRestart = computed(() => pluginStatus.value === 'needs-restart')
const pluginInstallError = computed(() => settings.value?.pluginInstallError ?? '')

const editorProcessName = computed(() => settings.value?.editorProcess?.projectName ?? '')
const editorProcessPath = computed(() => settings.value?.editorProcess?.projectPath ?? '')

const localProjectPath = ref('')
watch(
	() => settings.value?.pluginInstallConfig?.targetProjectPath,
	(val) => {
		if (val && !localProjectPath.value) {
			localProjectPath.value = val
		}
	},
	{ immediate: true }
)
watch(
	() => editorProcessPath.value,
	(val) => {
		if (val && !localProjectPath.value) {
			localProjectPath.value = val
		}
	}
)

const canInstallPlugin = computed(() => {
	if (isInstallingPlugin.value) return false
	const trimmed = localProjectPath.value.trim()
	return trimmed.length > 0
})

const statusTone = computed(() => {
	const connStatus = String(settings.value?.connectionStatus ?? 'idle')
	if (connStatus === 'connected') return 'connected'
	if (connStatus === 'error') return 'error'
	if (connStatus === 'waiting' || connStatus === 'exporting') return 'waiting'

	if (isInstallingPlugin.value) return 'waiting'
	if (pluginNeedsRestart.value) return 'waiting'
	if (pluginNotInstalled.value) return 'error'
	if (isEditorNotRunning.value) return 'error'
	if (isCheckingEditor.value || isCheckingPlugin.value) return 'waiting'
	if (pluginInstalled.value && isEditorRunning.value) return 'idle'
	return 'idle'
})

const statusTitle = computed(() => {
	const connStatus = String(settings.value?.connectionStatus ?? 'idle')
	if (connStatus === 'connected') return '虚幻编辑器已连接'
	if (connStatus === 'waiting') return '等待虚幻插件连接'
	if (connStatus === 'exporting') return '导出任务已发送'
	if (connStatus === 'error') return '连接失败'

	if (isInstallingPlugin.value) return '正在安装插件...'
	if (pluginNeedsRestart.value) return '插件已安装，请重启编辑器'
	if (pluginNotInstalled.value) return '插件未安装'
	if (isEditorNotRunning.value) return '虚幻编辑器未启动'
	if (isCheckingEditor.value) return '正在检测虚幻编辑器...'
	if (isCheckingPlugin.value) return '正在检测插件...'
	if (pluginInstalled.value && isEditorRunning.value) return '插件已就绪，请打开插件面板'
	return '未建立连接'
})

const statusCopy = computed(() => {
	const connStatus = String(settings.value?.connectionStatus ?? 'idle')
	if (connStatus === 'connected') {
		return settings.value?.statusText ?? '连接已建立，可以执行导出操作。'
	}
	if (connStatus === 'waiting') {
		return settings.value?.statusText ?? '正在等待虚幻插件连接...'
	}
	if (connStatus === 'exporting') {
		return settings.value?.statusText ?? '导出任务正在处理中...'
	}
	if (connStatus === 'error') {
		return settings.value?.message ?? '连接失败，请检查后重试。'
	}

	if (isInstallingPlugin.value) return '正在将 DwebWorkflowBridge 插件安装到目标项目...'
	if (pluginNeedsRestart.value) return '安装完成！请重启虚幻编辑器以加载插件，然后点击下方按钮重新检测。'
	if (pluginNotInstalled.value) return '当前项目未检测到 DwebWorkflowBridge 插件，请输入项目路径后点击安装。'
	if (isEditorNotRunning.value) return '未检测到正在运行的 Unreal Editor，请先启动虚幻编辑器并打开项目。'
	if (isCheckingEditor.value) return '正在检测系统中运行的虚幻编辑器进程...'
	if (isCheckingPlugin.value) return '正在检查项目是否安装了 DwebWorkflowBridge 插件...'
	if (pluginInstalled.value && isEditorRunning.value) return '检测到虚幻编辑器已运行且插件已安装，请打开插件面板后点击连接。'
	return String(settings.value?.message ?? '点击「检测虚幻编辑器」开始检查状态。').trim()
})

const connectionButtonLabel = computed(() => (isConnected.value ? '已连接' : '等待连接'))

const showDetectButton = computed(() => {
	const connStatus = String(settings.value?.connectionStatus ?? 'idle')
	if (connStatus === 'connected') return false
	return !isConnected.value
})

const showEditorStatus = computed(() => {
	return editorStatus.value !== 'unknown'
})

const editorStatusText = computed(() => {
	if (isCheckingEditor.value) return '检测中'
	if (isEditorRunning.value) return '已运行'
	if (isEditorNotRunning.value) return '未运行'
	return '未检测'
})

const editorStatusClass = computed(() => {
	if (isCheckingEditor.value) return 'is-checking'
	if (isEditorRunning.value) return 'is-running'
	if (isEditorNotRunning.value) return 'is-not-running'
	return ''
})

const showPluginInstall = computed(() => {
	if (isConnected.value) return false
	if (pluginInstalled.value) return false
	if (isEditorNotRunning.value && pluginStatus.value === 'unknown') return false
	return pluginNotInstalled.value || isCheckingPlugin.value || isInstallingPlugin.value || pluginNeedsRestart.value || pluginStatus.value === 'install-error'
})

const pluginSectionTitle = computed(() => {
	if (isInstallingPlugin.value) return '插件安装中'
	if (pluginNeedsRestart.value) return '安装完成'
	if (pluginNotInstalled.value) return '安装 DwebWorkflowBridge 插件'
	if (isCheckingPlugin.value) return '检测插件状态'
	if (pluginStatus.value === 'install-error') return '安装失败'
	return '插件管理'
})

const showInstallButton = computed(() => {
	if (isConnected.value) return false
	return pluginNotInstalled.value || pluginStatus.value === 'install-error'
})

const showRefreshAfterRestart = computed(() => {
	if (isConnected.value) return false
	return pluginNeedsRestart.value
})

const showWaitConnectionButton = computed(() => {
	if (isConnected.value) return false
	return pluginInstalled.value && isEditorRunning.value
})

const showOpenPluginGuide = computed(() => {
	if (isConnected.value) return false
	return pluginInstalled.value && isEditorRunning.value
})

const projectNameDisplay = computed(
	() => String(settings.value?.connectedSession?.projectName ?? '').trim() || editorProcessName.value || '未连接'
)
const sessionDisplay = computed(
	() =>
		String(
			settings.value?.connectedSession?.sessionId ?? settings.value?.targetSessionId ?? ''
		).trim() || '未分配'
)
const saveDirectoryDisplay = computed(
	() => String(settings.value?.connectedSession?.saveDirectory ?? '').trim() || '未设置'
)
const assetRootPathDisplay = computed(
	() =>
		String(
			settings.value?.connectedSession?.assetRootPath ??
				settings.value?.lastBlueprintAssetPath ??
				''
		).trim() || '/Game/DwebWorkflowExports'
)
const progressPercent = computed(() => {
	const value = Number(settings.value?.lastExportProgress ?? 0)
	return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0
})
const progressVisible = computed(() => progressPercent.value > 0 && progressPercent.value < 100)
const progressCopy = computed(() => {
	const stage = String(settings.value?.lastExportStage ?? '').trim()
	return `${stage || '准备导入资产'} · ${progressPercent.value}%`
})
const lastActorBaseClassText = computed(() =>
	String(settings.value?.lastActorBaseClass ?? '').trim()
)
const lastLightingSummary = computed(() => {
	const lightCount = Number(settings.value?.lastSpawnedLightCount)
	const actorLabel = String(settings.value?.lastLightingTargetActor ?? '').trim()
	if (!Number.isFinite(lightCount) && !actorLabel) return ''
	const parts = [
		Number.isFinite(lightCount) ? `${lightCount} lights` : '',
		actorLabel ? `目标Actor：${actorLabel}` : ''
	].filter(Boolean)
	return parts.join(' · ')
})
const lastLayoutProtocolVersionText = computed(() => {
	const value = Number(settings.value?.lastLayoutProtocolVersion)
	return Number.isFinite(value) ? `v${value}` : ''
})
const lastSlotCountText = computed(() => {
	const slotCount = Number(settings.value?.lastSlotCount)
	const appliedSlotCount = Number(settings.value?.lastAppliedSlotCount)
	const materialOverrideCount = Number(settings.value?.lastMaterialOverrideCount)
	if (!Number.isFinite(slotCount) && !Number.isFinite(appliedSlotCount)) return ''
	const parts = [
		Number.isFinite(slotCount) ? `${slotCount} slots` : '',
		Number.isFinite(appliedSlotCount) ? `${appliedSlotCount} applied` : '',
		Number.isFinite(materialOverrideCount) && materialOverrideCount > 0
			? `${materialOverrideCount} material overrides`
			: ''
	].filter(Boolean)
	return parts.join(' · ')
})
const detailCopy = computed(() => {
	const exportJobId = String(settings.value?.lastExportJobId ?? '').trim()
	const exportStatus = String(settings.value?.lastExportStatus ?? '').trim()
	const exportMessage = String(settings.value?.lastExportMessage ?? '').trim()
	const blueprintAssetPath = String(settings.value?.lastBlueprintAssetPath ?? '').trim()
	const modelsAssetPath = String(settings.value?.lastModelsAssetPath ?? '').trim()
	if (exportJobId) {
		const pathSummary =
			blueprintAssetPath || modelsAssetPath ? ` · ${blueprintAssetPath || modelsAssetPath}` : ''
		return `最近任务 ${exportJobId}${exportStatus ? ` · ${exportStatus}` : ''}${exportMessage ? ` · ${exportMessage}` : ''}${pathSummary}`
	}
	if (!hasLayoutInput.value) return '请先把场景布局节点的"布局JSON"输出接入当前节点。'
	if (!hasLightingInput.value) return '当前没有灯光 JSON 输入，导出时会按纯布局场景处理。'
	return '连接建立后，当前节点会把布局、灯光和模型绑定信息打包成导出任务。'
})

const handleInstallPlugin = () => {
	const path = localProjectPath.value.trim()
	if (!path) return
	emit('install-plugin', path)
}
</script>

<style scoped>
.wf-unreal-export {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.wf-unreal-export-status {
	border: 1px solid rgba(148, 163, 184, 0.28);
	border-radius: 12px;
	padding: 12px;
	background: rgba(15, 23, 42, 0.68);
}

.wf-unreal-export-status.is-connected {
	border-color: rgba(74, 222, 128, 0.45);
}

.wf-unreal-export-status.is-waiting,
.wf-unreal-export-status.is-exporting {
	border-color: rgba(251, 191, 36, 0.45);
}

.wf-unreal-export-status.is-error {
	border-color: rgba(248, 113, 113, 0.45);
}

.wf-unreal-export-status-title {
	font-size: 13px;
	font-weight: 700;
	color: #e2e8f0;
}

.wf-unreal-export-status-copy {
	margin-top: 6px;
	font-size: 12px;
	line-height: 1.5;
	color: rgba(226, 232, 240, 0.78);
}

.wf-unreal-export-editor-status {
	border: 1px solid rgba(148, 163, 184, 0.15);
	border-radius: 8px;
	padding: 10px;
	background: rgba(15, 23, 42, 0.4);
}

.wf-unreal-export-editor-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	font-size: 12px;
	gap: 8px;
}

.wf-unreal-export-editor-row + .wf-unreal-export-editor-row {
	margin-top: 4px;
}

.wf-unreal-export-editor-label {
	color: rgba(148, 163, 184, 0.8);
	flex-shrink: 0;
}

.wf-unreal-export-editor-value {
	color: #e2e8f0;
	text-align: right;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.wf-unreal-export-editor-value.is-running {
	color: rgb(74, 222, 128);
}

.wf-unreal-export-editor-value.is-not-running {
	color: rgb(248, 113, 113);
}

.wf-unreal-export-editor-value.is-checking {
	color: rgb(251, 191, 36);
}

.wf-unreal-export-plugin-install {
	border: 1px solid rgba(251, 191, 36, 0.2);
	border-radius: 8px;
	padding: 10px;
	background: rgba(251, 191, 36, 0.08);
}

.wf-unreal-export-plugin-title {
	font-size: 12px;
	font-weight: 600;
	color: #fbbf24;
	margin-bottom: 8px;
}

.wf-unreal-export-plugin-path-input {
	width: 100%;
	padding: 6px 10px;
	font-size: 12px;
	background: rgba(15, 23, 42, 0.8);
	border: 1px solid rgba(148, 163, 184, 0.3);
	border-radius: 6px;
	color: #e2e8f0;
	outline: none;
	box-sizing: border-box;
}

.wf-unreal-export-plugin-path-input:focus {
	border-color: rgba(96, 165, 250, 0.6);
}

.wf-unreal-export-plugin-error {
	margin-top: 6px;
	font-size: 11px;
	color: rgb(248, 113, 113);
	line-height: 1.4;
}

.wf-unreal-export-guide {
	border: 1px solid rgba(96, 165, 250, 0.2);
	border-radius: 8px;
	padding: 10px;
	background: rgba(59, 130, 246, 0.08);
}

.wf-unreal-export-guide-title {
	font-size: 12px;
	font-weight: 600;
	color: #60a5fa;
	margin-bottom: 6px;
}

.wf-unreal-export-guide-text {
	font-size: 12px;
	line-height: 1.6;
	color: rgba(226, 232, 240, 0.8);
}

.wf-unreal-export-guide-path {
	color: #fbbf24;
	font-family: monospace;
}

.wf-unreal-export-actions {
	display: flex;
	gap: 10px;
	flex-wrap: wrap;
}

.wf-unreal-export-progress {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.wf-unreal-export-progress-bar {
	width: 100%;
	height: 8px;
	border-radius: 999px;
	overflow: hidden;
	background: rgba(148, 163, 184, 0.18);
}

.wf-unreal-export-progress-fill {
	height: 100%;
	border-radius: inherit;
	background: linear-gradient(90deg, rgba(59, 130, 246, 0.95), rgba(34, 197, 94, 0.9));
}

.wf-unreal-export-progress-copy {
	font-size: 12px;
	color: rgba(226, 232, 240, 0.76);
}

.wf-unreal-export-btn {
	appearance: none;
	border: 1px solid rgba(96, 165, 250, 0.35);
	background: rgba(59, 130, 246, 0.18);
	color: #dbeafe;
	border-radius: 0;
	padding: 8px 12px;
	font-size: 12px;
	cursor: pointer;
}

.wf-unreal-export-btn.ghost {
	border-color: rgba(148, 163, 184, 0.3);
	background: rgba(15, 23, 42, 0.42);
	color: #e2e8f0;
}

.wf-unreal-export-btn:disabled {
	cursor: not-allowed;
	opacity: 0.55;
}

.wf-unreal-export-footer {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.wf-unreal-export-grid {
	display: grid;
	grid-template-columns: auto 1fr;
	gap: 6px 12px;
	font-size: 12px;
	color: rgba(226, 232, 240, 0.8);
}

.wf-unreal-export-copy {
	font-size: 12px;
	line-height: 1.5;
	color: rgba(226, 232, 240, 0.72);
}
</style>
