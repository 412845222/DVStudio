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
						<label class="wf-unreal-export-asset-path-label">{{ t('nodes.unreal.assetRootPath') }}</label>
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
						{{ isBusy ? t('nodes.unreal.processing') : t('nodes.unreal.title') }}
					</button>

					<template v-if="isConnected">
						<button
							class="wf-unreal-export-btn"
							type="button"
							:disabled="isExporting"
							@click.stop="emit('export-unreal-scene')"
						>
							{{ isExporting ? t('nodes.unreal.exporting') : t('nodes.unreal.export') }}
						</button>
						<button
							class="wf-unreal-export-btn ghost"
							type="button"
							:disabled="!hasLightingInput || isExporting"
							@click.stop="emit('export-unreal-lighting')"
						>
							{{ t('nodes.unreal.exportLights') }}
						</button>
						<button
							class="wf-unreal-export-btn danger"
							type="button"
							:disabled="isExporting"
							@click.stop="emit('disconnect-unreal')"
						>
							{{ t('nodes.unreal.disconnect') }}
						</button>
					</template>

					<button
						v-if="showRetryButton"
						class="wf-unreal-export-btn"
						type="button"
						@click.stop="emit('export-unreal-scene')"
					>
						{{ t('nodes.unreal.retry') }}
					</button>
				</div>

				<div v-if="showRestartHint" class="wf-unreal-export-guide">
					<div class="wf-unreal-export-guide-title">{{ t('nodes.unreal.needsRestartTitle') }}</div>
					<div class="wf-unreal-export-guide-text">
						{{ t('nodes.unreal.needsRestartText') }}
					</div>
				</div>

				<div v-if="showConnectionGuide" class="wf-unreal-export-guide">
					<div class="wf-unreal-export-guide-title">{{ t('nodes.unreal.waitingConnectionTitle') }}</div>
					<div class="wf-unreal-export-guide-text">
						{{ t('nodes.unreal.waitingConnectionText1') }}
						<br />
						<span class="wf-unreal-export-guide-path">Window → Dweb → Dweb Workflow Bridge</span>
						<br />
						{{ t('nodes.unreal.waitingConnectionText2') }}
					</div>
				</div>
			</div>
		</template>

		<template #footer>
			<div class="wf-unreal-export-footer" @pointerdown.stop>
				<div class="wf-unreal-export-grid">
					<div>{{ t('nodes.unreal.layoutInput') }}</div>
					<div :class="hasLayoutInput ? 'is-ok' : 'is-empty'">{{ hasLayoutInput ? t('nodes.unreal.connected') : t('nodes.unreal.notConnected') }}</div>
					<div>{{ t('nodes.unreal.lightingInput') }}</div>
					<div :class="hasLightingInput ? 'is-ok' : 'is-empty'">{{ hasLightingInput ? t('nodes.unreal.connected') : t('nodes.unreal.notConnected') }}</div>
					<div v-if="hasProjectName">{{ t('nodes.unreal.targetProject') }}</div>
					<div v-if="hasProjectName">{{ projectNameDisplayText }}</div>
					<div>{{ t('nodes.unreal.assetPath') }}</div>
					<div>{{ assetRootPathDisplay }}</div>
					<div v-if="lastExportJobId">{{ t('nodes.unreal.recentJob') }}</div>
					<div v-if="lastExportJobId">{{ lastExportJobId.slice(-12) }}</div>
					<div v-if="lastSlotCountText">{{ t('nodes.unreal.slotWrite') }}</div>
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
import { useI18n } from '../../../i18n'
import type { WorkflowUnrealExportNodeSettings } from '../../../aiworkflow/types'

const { t } = useI18n()

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
const onSetType = (type: 'base' | 'text' | 'text-merge' | 'image' | 'rotate-image' | 'video' | 'scene-understanding' | 'scene-decompose' | 'scene-layout' | 'unreal-export' | 'story' | 'comfyui' | 'model3d' | 'meshy' | 'blender') => { emit('set-type', type) }
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
			| 'blender'
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
		case 'connected': return t('nodes.unreal.statusConnected')
		case 'exporting': return t('nodes.unreal.statusExporting')
		case 'checking-editor': return t('nodes.unreal.statusCheckingEditor')
		case 'editor-not-running': return t('nodes.unreal.statusEditorNotRunning')
		case 'checking-plugin': return t('nodes.unreal.statusCheckingPlugin')
		case 'installing-plugin': return t('nodes.unreal.statusInstallingPlugin')
		case 'needs-restart': return t('nodes.unreal.statusNeedsRestart')
		case 'waiting-connection': return t('nodes.unreal.statusWaitingConnection')
		case 'activating-upstream': return t('nodes.unreal.statusActivatingUpstream')
		case 'creating-job': return t('nodes.unreal.statusCreatingJob')
		case 'error': return t('nodes.unreal.statusError')
		case 'idle':
		default: return t('nodes.unreal.statusReady')
	}
})

const statusCopy = computed(() => {
	const s = connectionStatus.value
	const customMsg = String(settings.value?.message ?? '').trim()
	if (customMsg) return customMsg
	switch (s) {
		case 'connected': return t('nodes.unreal.detailConnected')
		case 'exporting': return t('nodes.unreal.detailExporting')
		case 'checking-editor': return t('nodes.unreal.detailCheckingEditor')
		case 'editor-not-running': return t('nodes.unreal.detailEditorNotRunning')
		case 'checking-plugin': return t('nodes.unreal.detailCheckingPlugin')
		case 'installing-plugin': return t('nodes.unreal.detailInstallingPlugin')
		case 'needs-restart': return t('nodes.unreal.detailNeedsRestart')
		case 'waiting-connection': return t('nodes.unreal.detailWaitingConnection')
		case 'activating-upstream': return t('nodes.unreal.detailActivatingUpstream')
		case 'creating-job': return t('nodes.unreal.detailCreatingJob')
		case 'error': return String(settings.value?.statusText ?? t('nodes.unreal.detailError'))
		case 'idle':
		default: return t('nodes.unreal.detailIdle')
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

const projectNameRaw = computed(
	() => String(settings.value?.connectedSession?.projectName ?? settings.value?.editorProcess?.projectName ?? '').trim()
)
const hasProjectName = computed(() => projectNameRaw.value !== '')
const projectNameDisplay = computed(() => projectNameRaw.value)
const projectNameDisplayText = computed(() => hasProjectName.value ? projectNameDisplay.value : t('nodes.unreal.notConnected'))

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
	return t('nodes.unreal.processingProgress', { stage: stage || msg || t('common.running'), percent: progressPercent.value })
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
	if (exportStatus === 'completed') return t('nodes.unreal.lastExportSuccess')
	if (exportStatus === 'failed') return t('nodes.unreal.lastExportFailed', { error: String(settings.value?.lastExportMessage ?? 'unknown') })
	if (!hasLayoutInput.value) return t('nodes.unreal.needLayoutInput')
	if (isConnected.value) return t('nodes.unreal.readyToExport')
	return t('nodes.unreal.detailReady')
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
