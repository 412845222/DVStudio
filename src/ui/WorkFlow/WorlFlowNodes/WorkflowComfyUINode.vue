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
		:inputs="renderInputs"
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
			<div class="wf-comfy" @pointerdown.stop>
				<div class="wf-comfy-row">
					<div class="wf-comfy-label">{{ t('nodes.comfyui.address') }}</div>
					<input
						class="wf-comfy-input"
						type="text"
						:value="baseUrl"
						placeholder="http://127.0.0.1:8188"
						@input="onInput"
					/>
				</div>

				<div class="wf-comfy-actions">
					<button
						class="wf-comfy-btn"
						type="button"
						:disabled="!baseUrlTrimmed || status === 'connecting'"
						@click.stop="onConnect"
					>
						{{ status === 'connecting' ? t('nodes.comfyui.connecting') : t('nodes.comfyui.connect') }}
					</button>
					<div class="wf-comfy-status" :class="statusClass">
						{{ statusText }}
					</div>
				</div>

				<div v-if="status === 'connected'" class="wf-comfy-workflows">
					<div class="wf-comfy-label">{{ t('nodes.comfyui.availableWorkflows') }}</div>
					<select
						class="wf-comfy-select"
						:value="workflowPath"
						:disabled="!workflows.length"
						@change="onWorkflowChange"
					>
						<option value="" disabled>
							{{ workflows.length ? t('nodes.comfyui.selectWorkflow') : t('nodes.comfyui.noWorkflowsFound') }}
						</option>
						<option v-for="wf in workflows" :key="wf.path" :value="wf.path">
							{{ wf.name || wf.path }}
						</option>
					</select>
				</div>

				<div v-if="status === 'connected' && workflowPath" class="wf-comfy-row">
					<div class="wf-comfy-label">{{ t('nodes.comfyui.positivePrompt') }}</div>
					<div class="wf-comfy-prompt">
						<div
							v-if="positivePromptAnchorIndex >= 0"
							class="wf-comfy-anchor-hit wf-anchor-text"
							:class="{ hovered: hoverInputAnchorId === 'in-positive' }"
							:title="t('nodes.comfyui.textInputPositive')"
							:data-wf-node-id="nodeId"
							data-wf-anchor-id="in-positive"
							data-wf-dir="in"
							:data-wf-anchor-index="positivePromptAnchorIndex"
							@pointerdown.stop
							@pointerup.stop="
								emit('end-link', {
									nodeId,
									anchorId: 'in-positive',
									anchorIndex: positivePromptAnchorIndex
								})
							"
						/>
						<textarea
							class="wf-comfy-textarea"
							:value="positivePrompt"
							:placeholder="t('nodes.comfyui.leaveBlankWorkflow')"
							@input="onPositivePromptInput"
						/>
					</div>
				</div>

				<div v-if="status === 'connected' && workflowPath" class="wf-comfy-row">
					<div class="wf-comfy-label">{{ t('nodes.comfyui.negativePrompt') }}</div>
					<div class="wf-comfy-prompt">
						<div
							v-if="negativePromptAnchorIndex >= 0"
							class="wf-comfy-anchor-hit wf-anchor-text"
							:class="{ hovered: hoverInputAnchorId === 'in-negative' }"
							:title="t('nodes.comfyui.textInputNegative')"
							:data-wf-node-id="nodeId"
							data-wf-anchor-id="in-negative"
							data-wf-dir="in"
							:data-wf-anchor-index="negativePromptAnchorIndex"
							@pointerdown.stop
							@pointerup.stop="
								emit('end-link', {
									nodeId,
									anchorId: 'in-negative',
									anchorIndex: negativePromptAnchorIndex
								})
							"
						/>
						<textarea
							class="wf-comfy-textarea"
							:value="negativePrompt"
							:placeholder="t('nodes.comfyui.leaveBlankWorkflow')"
							@input="onNegativePromptInput"
						/>
					</div>
				</div>

				<div v-if="status === 'connected' && workflowPath" class="wf-comfy-run">
					<div class="wf-comfy-runbar">
						<button class="wf-comfy-btn" type="button" :disabled="runDisabled" @click.stop="onRun">
							{{ t('nodes.comfyui.run') }}
						</button>
						<button
							class="wf-comfy-btn"
							type="button"
							:disabled="cancelDisabled"
							@click.stop="onCancel"
						>
							{{ t('common.cancel') }}
						</button>
					</div>

					<div class="wf-comfy-progress">
						<div class="wf-comfy-progress-track">
							<div class="wf-comfy-progress-bar" :style="{ width: progressWidth }" />
						</div>
						<div class="wf-comfy-progress-text">{{ runStatusTextDisplay }}</div>
					</div>
				</div>

				<div v-if="mediaOutputs.length" class="wf-comfy-outputs">
					<div class="wf-comfy-label">{{ t('nodes.comfyui.outputMedia') }}</div>
					<a
						v-for="(m, idx) in mediaOutputs"
						:key="m.url + idx"
						class="wf-comfy-output-link"
						:href="m.url"
						target="_blank"
						rel="noreferrer"
						@click.stop
					>
						{{ m.kind === 'video' ? t('common.video') : t('common.image') }} · {{ m.filename || `#${idx + 1}` }}
					</a>
				</div>
			</div>
		</template>

		<template #footer>
			<div class="wf-comfy-inputs" @pointerdown.stop>
				<div class="wf-comfy-inputs-header">
					<div class="wf-comfy-inputs-title">{{ t('nodes.comfyui.workflowInputs') }}</div>
				</div>
				<div v-if="!workflowPath" class="wf-comfy-inputs-empty">
					{{ t('nodes.comfyui.workflowInputsHint') }}
				</div>
				<div v-else>
					<div v-for="(a, idx) in displayInputs" :key="a.id" class="wf-comfy-input-item">
						<div class="wf-comfy-input-index">{{ idx + 1 }}</div>
						<div class="wf-comfy-input-text">{{ a.label || a.id }}</div>
					</div>
				</div>
			</div>
		</template>
	</WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import WorkflowNodeBase from '../WorkflowNodeBase.vue'
import { useI18n } from '../../../i18n'

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
	comfyuiSettings?: {
		baseUrl?: string
		status?: 'idle' | 'connecting' | 'connected' | 'error'
		message?: string
		lastCheckedAt?: number
		workflows?: { path: string; name: string }[]
		workflowPath?: string
		positivePrompt?: string
		negativePrompt?: string
		outputs?: Array<{
			kind: 'image' | 'video'
			url: string
			filename?: string
			anchorId?: string
			nodeId?: string
			sourcePath?: string
			subfolder?: string
			type?: string
		}>
		runStatus?: 'idle' | 'running' | 'canceling' | 'completed' | 'failed' | 'cancelled'
		promptId?: string
		progress?: number
		statusText?: string
		lastUpdateAt?: number
	} | null
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
		payload: {
			nodeId: string
			anchorId: string
			anchorIndex: number
			event: PointerEvent
		}
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
	(
		e: 'update-comfyui-settings',
		payload: { baseUrl?: string; positivePrompt?: string; negativePrompt?: string }
	): void
	(e: 'connect-comfyui', payload: { baseUrl: string }): void
	(e: 'select-workflow', payload: { workflowPath: string }): void
	(e: 'run-comfyui'): void
	(e: 'cancel-comfyui'): void
}>()

const baseUrl = computed(() => String(props.comfyuiSettings?.baseUrl ?? ''))
const baseUrlTrimmed = computed(() => baseUrl.value.trim())
const status = computed(
	() => (props.comfyuiSettings?.status ?? 'idle') as 'idle' | 'connecting' | 'connected' | 'error'
)
const message = computed(() => String(props.comfyuiSettings?.message ?? ''))

const workflows = computed(() =>
	Array.isArray(props.comfyuiSettings?.workflows) ? props.comfyuiSettings!.workflows! : []
)
const workflowPath = computed(() => String(props.comfyuiSettings?.workflowPath ?? ''))
const positivePrompt = computed(() => String(props.comfyuiSettings?.positivePrompt ?? ''))
const negativePrompt = computed(() => String(props.comfyuiSettings?.negativePrompt ?? ''))
const allInputs = computed(() => (Array.isArray(props.inputs) ? props.inputs : []))
const renderInputs = computed(() =>
	allInputs.value.filter((a) => a.id !== 'in-positive' && a.id !== 'in-negative')
)
const displayInputs = computed(() => renderInputs.value)

const positivePromptAnchorIndex = computed(() =>
	allInputs.value.findIndex((a) => a.id === 'in-positive')
)
const negativePromptAnchorIndex = computed(() =>
	allInputs.value.findIndex((a) => a.id === 'in-negative')
)

type ComfyUiOutput = {
	kind: 'image' | 'video'
	url: string
	filename?: string
	anchorId?: string
	nodeId?: string
	sourcePath?: string
	subfolder?: string
	type?: string
}

const hoverInputAnchorId = computed(() => props.hoverInputAnchorId ?? null)
const mediaOutputs = computed(() => {
	const arr = props.comfyuiSettings?.outputs
	if (!Array.isArray(arr)) return []
	return arr
		.map((m: ComfyUiOutput) => ({
			kind: String(m?.kind ?? '') === 'video' ? ('video' as const) : ('image' as const),
			url: String(m?.url ?? '').trim(),
			filename: typeof m?.filename === 'string' ? m.filename : '',
			anchorId: typeof m?.anchorId === 'string' ? m.anchorId : ''
		}))
		.filter((m: { url: string }) => m.url)
})

const runStatus = computed(
	() =>
		(props.comfyuiSettings?.runStatus ?? 'idle') as
			| 'idle'
			| 'running'
			| 'canceling'
			| 'completed'
			| 'failed'
			| 'cancelled'
)
const promptId = computed(() => String(props.comfyuiSettings?.promptId ?? ''))
const progress = computed(() => {
	const n = Number(props.comfyuiSettings?.progress)
	if (!Number.isFinite(n)) return 0
	return Math.max(0, Math.min(100, n))
})
const runStatusText = computed(() => String(props.comfyuiSettings?.statusText ?? ''))

const runDisabled = computed(() => {
	if (status.value !== 'connected') return true
	if (!workflowPath.value) return true
	return runStatus.value === 'running' || runStatus.value === 'canceling'
})

const cancelDisabled = computed(() => {
	if (status.value !== 'connected') return true
	if (runStatus.value !== 'running' && runStatus.value !== 'canceling') return true
	return !promptId.value
})

const progressWidth = computed(() => `${progress.value}%`)

const runStatusTextFallback = computed(() => {
	if (runStatus.value === 'running') return t('nodes.comfyui.running')
	if (runStatus.value === 'canceling') return t('nodes.comfyui.statusCanceling')
	if (runStatus.value === 'completed') return t('nodes.comfyui.statusCompleted')
	if (runStatus.value === 'failed') return t('nodes.comfyui.statusFailed')
	if (runStatus.value === 'cancelled') return t('nodes.comfyui.statusCancelled')
	return t('nodes.comfyui.statusNotRunning')
})

const runStatusTextDisplay = computed(() => {
	return runStatusText.value || runStatusTextFallback.value
})

const statusText = computed(() => {
	if (!baseUrlTrimmed.value) return t('nodes.comfyui.connNoAddress')
	if (status.value === 'connecting') return t('nodes.comfyui.connConnecting')
	if (status.value === 'connected') return t('nodes.comfyui.connConnected')
	if (status.value === 'error') return message.value ? t('nodes.comfyui.connFailed', { message: message.value }) : t('nodes.comfyui.connFailed', { message: '' })
	return t('nodes.comfyui.connNotConnected')
})

const onRun = () => {
	emit('run-comfyui')
}

const onCancel = () => {
	emit('cancel-comfyui')
}

const statusClass = computed(() => {
	if (status.value === 'connected') return 'ok'
	if (status.value === 'error') return 'err'
	if (status.value === 'connecting') return 'pending'
	return 'idle'
})

const onInput = (e: Event) => {
	const v = (e.target as HTMLInputElement).value
	emit('update-comfyui-settings', { baseUrl: v })
}

const onConnect = () => {
	const v = baseUrlTrimmed.value
	if (!v) return
	emit('connect-comfyui', { baseUrl: v })
}

const onWorkflowChange = (e: Event) => {
	const v = String((e.target as HTMLSelectElement).value ?? '').trim()
	if (!v) return
	emit('select-workflow', { workflowPath: v })
}

const onPositivePromptInput = (e: Event) => {
	const v = String((e.target as HTMLTextAreaElement).value ?? '')
	emit('update-comfyui-settings', { positivePrompt: v })
}

const onNegativePromptInput = (e: Event) => {
	const v = String((e.target as HTMLTextAreaElement).value ?? '')
	emit('update-comfyui-settings', { negativePrompt: v })
}

onMounted(() => {
	if (!baseUrlTrimmed.value) {
		emit('update-comfyui-settings', { baseUrl: 'http://127.0.0.1:8188' })
	}
})
</script>

<style scoped>
.wf-comfy {
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.wf-comfy-row {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.wf-comfy-label {
	font-size: 12px;
	color: var(--vscode-foreground);
	opacity: 0.9;
}

.wf-comfy-input {
	width: 100%;
	box-sizing: border-box;
	padding: 6px 8px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-foreground);
	border-radius: 0;
	outline: none;
}

.wf-comfy-textarea {
	width: 100%;
	box-sizing: border-box;
	min-height: 56px;
	padding: 6px 8px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-foreground);
	border-radius: 0;
	outline: none;
	resize: vertical;
	font-family: inherit;
	font-size: 12px;
}

.wf-comfy-prompt {
	display: flex;
	align-items: flex-start;
	gap: 8px;
}

.wf-comfy-anchor-hit {
	width: 18px;
	height: 18px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border-radius: 0;
	cursor: crosshair;
	flex: 0 0 auto;
	margin-top: 4px;
}

.wf-comfy-anchor-hit::before {
	content: '';
	width: 10px;
	height: 10px;
	border-radius: 0;
	background: var(--dweb-yellow);
	border: 1px solid transparent;
	box-sizing: border-box;
}

.wf-comfy-anchor-hit:hover::before,
.wf-comfy-anchor-hit.hovered::before {
	border-color: #ffffff;
}

.wf-comfy-textarea:focus {
	border-color: var(--vscode-border-accent);
}

.wf-comfy-input:focus {
	border-color: var(--vscode-border-accent);
}

.wf-comfy-actions {
	display: flex;
	align-items: center;
	gap: 10px;
}

.wf-comfy-workflows {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.wf-comfy-select {
	width: 100%;
	box-sizing: border-box;
	padding: 6px 8px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-foreground);
	border-radius: 0;
	outline: none;
}

.wf-comfy-run {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.wf-comfy-runbar {
	display: flex;
	gap: 10px;
	align-items: center;
}

.wf-comfy-progress {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.wf-comfy-progress-track {
	width: 100%;
	height: 8px;
	border-radius: 0;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	overflow: hidden;
}

.wf-comfy-progress-bar {
	height: 100%;
	background: var(--vscode-border-accent);
}

.wf-comfy-progress-text {
	font-size: 12px;
	color: var(--vscode-foreground);
	opacity: 0.85;
}

.wf-comfy-outputs {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.wf-comfy-output-link {
	color: var(--vscode-link);
	font-size: 11px;
	text-decoration: none;
	word-break: break-all;
}

.wf-comfy-output-link:hover {
	text-decoration: underline;
}

.wf-comfy-select:focus {
	border-color: var(--vscode-border-accent);
}

.wf-comfy-btn {
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-foreground);
	padding: 6px 10px;
	border-radius: 0;
	cursor: pointer;
}

.wf-comfy-btn:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.wf-comfy-status {
	font-size: 12px;
	color: var(--vscode-foreground);
	opacity: 0.9;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	flex: 1;
}

.wf-comfy-status.ok {
	opacity: 1;
}

.wf-comfy-status.err {
	opacity: 1;
}

.wf-comfy-inputs {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.wf-comfy-inputs-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.wf-comfy-inputs-title {
	font-size: 12px;
	color: var(--vscode-foreground);
	opacity: 0.9;
}

.wf-comfy-inputs-empty {
	font-size: 11px;
	color: var(--vscode-fg-muted);
	opacity: 0.9;
}

.wf-comfy-input-item {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 8px;
	border: 1px solid var(--vscode-border);
	border-radius: 0;
	background: var(--dweb-defualt-dark);
}

.wf-comfy-input-index {
	width: 18px;
	height: 18px;
	border-radius: 0;
	border: 1px solid var(--vscode-border);
	display: inline-flex;
	align-items: center;
	justify-content: center;
	font-size: 11px;
	color: var(--vscode-foreground);
	opacity: 0.9;
}

.wf-comfy-input-text {
	font-size: 12px;
	color: var(--vscode-foreground);
	opacity: 0.95;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
</style>
