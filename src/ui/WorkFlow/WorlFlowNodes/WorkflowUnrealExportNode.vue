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
		@update:world-position="(p) => emit('update:worldPosition', p)"
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

				<div v-if="isExporting || progressPercent > 0" class="wf-unreal-export-progress">
					<div class="wf-unreal-export-progress-bar">
						<div
							class="wf-unreal-export-progress-fill"
							:style="{ width: `${progressPercent}%` }"
						></div>
					</div>
					<div class="wf-unreal-export-progress-copy">{{ progressCopy }}</div>
				</div>

				<div v-if="showAssetPathSettings" class="wf-unreal-export-asset-path">
					<div class="wf-unreal-export-asset-path-row">
						<label class="wf-unreal-export-asset-path-label">资产根路径</label>
						<input
							v-model="localAssetRootPath"
							type="text"
							class="wf-unreal-export-asset-path-input"
							@change="handleSetAssetRootPath"
						/>
					</div>
				</div>

				<div class="wf-unreal-export-actions">
					<button
						v-if="showPrimaryExportButton"
						class="wf-unreal-export-btn primary"
						type="button"
						:disabled="isBusy"
						@click.stop="emit('export-unreal-scene')"
					>
						{{ isBusy ? '处理中...' : '一键导出场景' }}
					</button>

					<template v-if="isConnected">
						<button
							class="wf-unreal-export-btn"
							type="button"
							:disabled="isExporting"
							@click.stop="emit('export-unreal-scene')"
						>
							{{ isExporting ? '导出中...' : '导出场景' }}
						</button>
						<button
							class="wf-unreal-export-btn ghost"
							type="button"
							:disabled="!hasLightingInput || isExporting"
							@click.stop="emit('export-unreal-lighting')"
						>
							导出灯光
						</button>
						<button
							class="wf-unreal-export-btn danger"
							type="button"
							:disabled="isExporting"
							@click.stop="emit('disconnect-unreal')"
						>
							断开连接
						</button>
					</template>

					<button
						v-if="showRetryButton"
						class="wf-unreal-export-btn"
						type="button"
						@click.stop="emit('export-unreal-scene')"
					>
						重试
					</button>
				</div>

				<div v-if="showRestartHint" class="wf-unreal-export-guide">
					<div class="wf-unreal-export-guide-title">需要重启编辑器</div>
					<div class="wf-unreal-export-guide-text">
						插件安装成功！请重启虚幻编辑器，然后重新打开项目后点击「一键导出场景」继续。
					</div>
				</div>

				<div v-if="showConnectionGuide" class="wf-unreal-export-guide">
					<div class="wf-unreal-export-guide-title">等待虚幻插件连接</div>
					<div class="wf-unreal-export-guide-text">
						请在虚幻编辑器中打开插件面板：
						<br />
						<span class="wf-unreal-export-guide-path">Window → Dweb → Dweb Workflow Bridge</span>
						<br />
						然后点击「Connect to DVStudio」按钮建立连接。
					</div>
				</div>
			</div>
		</template>

		<template #footer>
			<div class="wf-unreal-export-footer" @pointerdown.stop>
				<div class="wf-unreal-export-grid">
					<div>布局输入</div>
					<div :class="hasLayoutInput ? 'is-ok' : 'is-empty'">{{ hasLayoutInput ? '已连接' : '未连接' }}</div>
					<div>灯光输入</div>
					<div :class="hasLightingInput ? 'is-ok' : 'is-empty'">{{ hasLightingInput ? '已连接' : '未连接' }}</div>
					<div v-if="projectNameDisplay !== '未连接'">目标工程</div>
					<div v-if="projectNameDisplay !== '未连接'">{{ projectNameDisplay }}</div>
					<div>资产路径</div>
					<div>{{ assetRootPathDisplay }}</div>
					<div v-if="lastExportJobId">最近任务</div>
					<div v-if="lastExportJobId">{{ lastExportJobId.slice(-12) }}</div>
					<div v-if="lastSlotCountText">插槽写入</div>
					<div v-if="lastSlotCountText">{{ lastSlotCountText }}</div>
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
	(e: 'update:worldPosition', p: { worldX: number; worldY: number }): void
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
	(e: 'disconnect-unreal'): void
	(e: 'set-asset-root-path', assetRootPath: string): void
}>()

const settings = computed(() => props.unrealExportSettings ?? null)
const hasLayoutInput = computed(() => String(props.linkedLayoutJsonText ?? '').trim().length > 0)
const hasLightingInput = computed(
	() => String(props.linkedLightingJsonText ?? '').trim().length > 0
)

const connectionStatus = computed(() => String(settings.value?.connectionStatus ?? 'idle'))
const isConnected = computed(() => connectionStatus.value === 'connected' || connectionStatus.value === 'exporting')
const isExporting = computed(() => connectionStatus.value === 'exporting')
const isBusy = computed(() => {
	const s = connectionStatus.value
	return s === 'checking-editor' || s === 'checking-plugin' || s === 'installing-plugin' ||
		s === 'waiting-connection' || s === 'activating-upstream' || s === 'creating-job' ||
		s === 'exporting'
})

const pluginStatus = computed(() => settings.value?.pluginStatus ?? 'unknown')
const editorStatus = computed(() => settings.value?.editorStatus ?? 'unknown')
const needsRestart = computed(() => pluginStatus.value === 'needs-restart')

const localAssetRootPath = ref('/Game/DVStudio')
watch(
	() => settings.value?.assetRootPath,
	(val) => {
		if (val) {
			localAssetRootPath.value = val
		}
	},
	{ immediate: true }
)

const statusTone = computed(() => {
	const s = connectionStatus.value
	if (s === 'connected') return 'connected'
	if (s === 'error') return 'error'
	if (s === 'editor-not-running') return 'error'
	if (s === 'exporting' || s === 'checking-editor' || s === 'checking-plugin' ||
		s === 'installing-plugin' || s === 'waiting-connection' || s === 'activating-upstream' ||
		s === 'creating-job') return 'waiting'
	if (s === 'needs-restart') return 'waiting'
	if (s === 'idle') return 'idle'
	return 'idle'
})

const statusTitle = computed(() => {
	const s = connectionStatus.value
	switch (s) {
		case 'connected': return '虚幻编辑器已连接'
		case 'exporting': return '导出任务进行中'
		case 'checking-editor': return '检测虚幻编辑器中...'
		case 'editor-not-running': return '虚幻编辑器未启动'
		case 'checking-plugin': return '检测插件中...'
		case 'installing-plugin': return '正在安装插件...'
		case 'needs-restart': return '插件已安装，请重启编辑器'
		case 'waiting-connection': return '等待虚幻插件连接'
		case 'activating-upstream': return '激活上游场景节点中...'
		case 'creating-job': return '创建导出任务中...'
		case 'error': return '出错了'
		case 'idle':
		default: return '准备就绪'
	}
})

const statusCopy = computed(() => {
	const s = connectionStatus.value
	const customMsg = String(settings.value?.message ?? '').trim()
	if (customMsg) return customMsg
	switch (s) {
		case 'connected': return '连接已建立，可以执行导出操作。'
		case 'exporting': return '虚幻插件正在处理导出任务...'
		case 'checking-editor': return '正在检查虚幻编辑器是否运行...'
		case 'editor-not-running': return '请先启动虚幻编辑器并打开项目。'
		case 'checking-plugin': return '正在检查项目插件状态...'
		case 'installing-plugin': return '正在自动安装 DwebWorkflowBridge 插件...'
		case 'needs-restart': return '插件安装成功！请重启虚幻编辑器。'
		case 'waiting-connection': return '请在虚幻编辑器插件面板点击 Connect 按钮...'
		case 'activating-upstream': return '正在激活场景布局预览...'
		case 'creating-job': return '正在创建导出任务...'
		case 'error': return String(settings.value?.statusText ?? '发生错误，请重试。')
		case 'idle':
		default: return '点击「一键导出场景」开始导出流程，系统会自动完成检测、连接和导出。'
	}
})

const showPrimaryExportButton = computed(() => {
	if (isConnected.value) return false
	if (needsRestart.value) return false
	if (connectionStatus.value === 'error') return false
	return true
})

const showRetryButton = computed(() => {
	return connectionStatus.value === 'error' || connectionStatus.value === 'editor-not-running'
})

const showRestartHint = computed(() => needsRestart.value)
const showConnectionGuide = computed(() => connectionStatus.value === 'waiting-connection')

const showAssetPathSettings = computed(() => isConnected.value || connectionStatus.value === 'idle')

const projectNameDisplay = computed(
	() => String(settings.value?.connectedSession?.projectName ?? settings.value?.editorProcess?.projectName ?? '').trim() || '未连接'
)

const assetRootPathDisplay = computed(
	() => String(settings.value?.assetRootPath ?? '').trim() || '/Game/DVStudio'
)

const progressPercent = computed(() => {
	const value = Number(settings.value?.lastExportProgress ?? 0)
	return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0
})
const progressCopy = computed(() => {
	const stage = String(settings.value?.lastExportStage ?? '').trim()
	const msg = String(settings.value?.lastExportMessage ?? '').trim()
	return `${stage || msg || '处理中'} · ${progressPercent.value}%`
})

const lastExportJobId = computed(() => String(settings.value?.lastExportJobId ?? '').trim())
const lastSlotCountText = computed(() => {
	const slotCount = Number(settings.value?.lastSlotCount)
	const appliedSlotCount = Number(settings.value?.lastAppliedSlotCount)
	if (!Number.isFinite(slotCount) && !Number.isFinite(appliedSlotCount)) return ''
	const parts = [
		Number.isFinite(slotCount) ? `${slotCount} slots` : '',
		Number.isFinite(appliedSlotCount) ? `${appliedSlotCount} applied` : ''
	].filter(Boolean)
	return parts.join(' · ')
})

const detailCopy = computed(() => {
	const exportStatus = String(settings.value?.lastExportStatus ?? '').trim()
	if (exportStatus === 'completed') return '上一次导出已成功完成。'
	if (exportStatus === 'failed') return `上一次导出失败：${String(settings.value?.lastExportMessage ?? 'unknown')}`
	if (!hasLayoutInput.value) return '请先连接场景布局节点的「布局JSON」输出。'
	if (isConnected.value) return '连接已就绪，点击「导出场景」开始导出。'
	return '点击「一键导出场景」，系统将自动完成编辑器检测、插件安装、连接建立和场景导出。'
})

const handleSetAssetRootPath = () => {
	const path = localAssetRootPath.value.trim()
	emit('set-asset-root-path', path)
}
</script>

<style scoped>
.wf-unreal-export {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.wf-unreal-export-status {
	border: 1px solid rgba(148, 163, 184, 0.28);
	border-radius: 10px;
	padding: 10px 12px;
	background: rgba(15, 23, 42, 0.68);
}

.wf-unreal-export-status.is-connected {
	border-color: rgba(74, 222, 128, 0.45);
	background: rgba(34, 197, 94, 0.1);
}

.wf-unreal-export-status.is-waiting {
	border-color: rgba(251, 191, 36, 0.45);
	background: rgba(251, 191, 36, 0.08);
}

.wf-unreal-export-status.is-error {
	border-color: rgba(248, 113, 113, 0.45);
	background: rgba(239, 68, 68, 0.08);
}

.wf-unreal-export-status-title {
	font-size: 13px;
	font-weight: 700;
	color: #e2e8f0;
}

.wf-unreal-export-status-copy {
	margin-top: 4px;
	font-size: 11px;
	line-height: 1.5;
	color: rgba(226, 232, 240, 0.78);
}

.wf-unreal-export-guide {
	border: 1px solid rgba(59, 130, 246, 0.25);
	border-radius: 8px;
	padding: 10px;
	background: rgba(59, 130, 246, 0.08);
}

.wf-unreal-export-guide-title {
	font-size: 12px;
	font-weight: 600;
	color: #60a5fa;
	margin-bottom: 4px;
}

.wf-unreal-export-guide-text {
	font-size: 11px;
	line-height: 1.6;
	color: rgba(226, 232, 240, 0.8);
}

.wf-unreal-export-guide-path {
	color: #fbbf24;
	font-family: monospace;
}

.wf-unreal-export-asset-path {
	border: 1px solid rgba(148, 163, 184, 0.15);
	border-radius: 8px;
	padding: 8px 10px;
	background: rgba(15, 23, 42, 0.4);
}

.wf-unreal-export-asset-path-row {
	display: flex;
	gap: 8px;
	align-items: center;
}

.wf-unreal-export-asset-path-label {
	font-size: 11px;
	color: rgba(148, 163, 184, 0.8);
	flex-shrink: 0;
	width: 70px;
}

.wf-unreal-export-asset-path-input {
	flex: 1;
	padding: 5px 8px;
	font-size: 11px;
	background: rgba(15, 23, 42, 0.8);
	border: 1px solid rgba(148, 163, 184, 0.3);
	border-radius: 6px;
	color: #e2e8f0;
	outline: none;
	box-sizing: border-box;
}

.wf-unreal-export-asset-path-input:focus {
	border-color: rgba(96, 165, 250, 0.6);
}

.wf-unreal-export-actions {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}

.wf-unreal-export-progress {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.wf-unreal-export-progress-bar {
	width: 100%;
	height: 6px;
	border-radius: 999px;
	overflow: hidden;
	background: rgba(148, 163, 184, 0.18);
}

.wf-unreal-export-progress-fill {
	height: 100%;
	border-radius: inherit;
	background: linear-gradient(90deg, rgba(59, 130, 246, 0.95), rgba(34, 197, 94, 0.9));
	transition: width 0.3s ease;
}

.wf-unreal-export-progress-copy {
	font-size: 11px;
	color: rgba(226, 232, 240, 0.76);
}

.wf-unreal-export-btn {
	appearance: none;
	border: 1px solid rgba(96, 165, 250, 0.35);
	background: rgba(59, 130, 246, 0.2);
	color: #dbeafe;
	border-radius: 6px;
	padding: 7px 14px;
	font-size: 12px;
	cursor: pointer;
	font-weight: 500;
}

.wf-unreal-export-btn.primary {
	background: rgba(59, 130, 246, 0.35);
	border-color: rgba(96, 165, 250, 0.5);
}

.wf-unreal-export-btn.ghost {
	border-color: rgba(148, 163, 184, 0.3);
	background: rgba(15, 23, 42, 0.5);
	color: #e2e8f0;
}

.wf-unreal-export-btn.danger {
	border-color: rgba(248, 113, 113, 0.35);
	background: rgba(239, 68, 68, 0.15);
	color: #fca5a5;
}

.wf-unreal-export-btn:disabled {
	cursor: not-allowed;
	opacity: 0.5;
}

.wf-unreal-export-footer {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.wf-unreal-export-grid {
	display: grid;
	grid-template-columns: auto 1fr;
	gap: 4px 10px;
	font-size: 11px;
	color: rgba(226, 232, 240, 0.75);
}

.wf-unreal-export-grid .is-ok {
	color: rgb(74, 222, 128);
}

.wf-unreal-export-grid .is-empty {
	color: rgba(148, 163, 184, 0.6);
}

.wf-unreal-export-copy {
	font-size: 11px;
	line-height: 1.5;
	color: rgba(226, 232, 240, 0.6);
}
</style>
