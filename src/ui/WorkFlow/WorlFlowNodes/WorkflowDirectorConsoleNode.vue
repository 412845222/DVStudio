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
			<div class="wf-director-console" @pointerdown.stop>
				<div class="wf-director-console-status" :class="`is-${statusTone}`">
					<div class="wf-director-console-status-title">{{ statusTitle }}</div>
					<div class="wf-director-console-status-copy">{{ statusCopy }}</div>
				</div>

				<div class="wf-director-console-card">
					<div class="wf-director-console-card-title">
						{{ t('nodes.directorConsole.inputLayoutJson') }}
					</div>
					<div class="wf-director-console-card-value">
						{{
							linkedJsonReady
								? t('nodes.directorConsole.connected')
								: t('nodes.directorConsole.notConnected')
						}}
					</div>
				</div>

				<div class="wf-director-console-actions">
					<button
						class="wf-director-console-btn primary"
						type="button"
						:disabled="!canOpen"
						@click.stop="onOpenConsole"
					>
						{{ t('nodes.directorConsole.openConsole') }}
					</button>
				</div>
			</div>
		</template>
	</WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import WorkflowNodeBase from '../WorkflowNodeBase.vue'
import { useI18n } from '../../../i18n'
import { isElectron } from '../../../electronBridge'
import type { WorkflowDirectorConsoleNodeSettings } from '../../../aiworkflow/types'

const { t } = useI18n()

type AnchorSpec = {
	id: string
	label?: string
	offsetY?: number
	mediaType?: 'generic' | 'image' | 'video' | 'text' | 'flow' | 'model3d' | 'audio' | 'meta'
}

type NodeType =
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
	| 'director-console'
	| 'story'
	| 'comfyui'
	| 'model3d'
	| 'meshy'
	| 'blender'

const props = defineProps<{
	nodeId: string
	title: string
	alias?: string
	nodeType: string
	subtitle?: string
	style?: Record<string, string>
	directorConsoleSettings?: WorkflowDirectorConsoleNodeSettings | null
	linkedJsonReady?: boolean
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
	(e: 'set-type', v: NodeType): void
	(e: 'resize', payload: { width: number; height: number; worldX: number; worldY: number }): void
	(e: 'open-director-console', payload: { nodeId: string }): void
}>()

const onStartLink = (payload: {
	nodeId: string
	anchorId: string
	anchorIndex: number
	event: PointerEvent
}) => {
	emit('start-link', payload)
}
const onEndLink = (payload: { nodeId: string; anchorId: string; anchorIndex: number }) => {
	emit('end-link', payload)
}
const onSetType = (type: NodeType) => {
	emit('set-type', type)
}
const onResize = (payload: { width: number; height: number; worldX: number; worldY: number }) => {
	emit('resize', payload)
}

const settings = computed(() => props.directorConsoleSettings ?? null)
const inElectron = computed(() => isElectron())
const canOpen = computed(() => inElectron.value)

const statusTone = computed<'idle' | 'ready' | 'error'>(() => {
	const s = settings.value?.status
	if (s === 'error') return 'error'
	if (s === 'ready') return 'ready'
	return 'idle'
})

const statusTitle = computed(() => {
	if (!inElectron.value) return t('nodes.directorConsole.webOnlyHint')
	if (statusTone.value === 'error') return t('nodes.directorConsole.statusError')
	if (statusTone.value === 'ready') return t('nodes.directorConsole.statusReady')
	return t('nodes.directorConsole.statusIdle')
})

const statusCopy = computed(() => {
	const msg = settings.value?.message
	if (msg) return msg
	if (settings.value?.lastOpenedAt) {
		return t('nodes.directorConsole.lastOpened', {
			time: new Date(settings.value.lastOpenedAt).toLocaleTimeString()
		})
	}
	return t('nodes.directorConsole.statusHint')
})

const onOpenConsole = () => {
	if (!canOpen.value) return
	emit('open-director-console', { nodeId: props.nodeId })
}
</script>

<style scoped>
.wf-director-console {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 8px 12px;
	width: 100%;
	height: 100%;
	box-sizing: border-box;
}

.wf-director-console-status {
	border: 1px solid var(--wf-color-border, #2a3a30);
	padding: 6px 10px;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.wf-director-console-status.is-idle {
	border-color: var(--wf-color-border-idle, #3a4a40);
}
.wf-director-console-status.is-ready {
	border-color: var(--wf-color-accent, #1f9d84);
}
.wf-director-console-status.is-error {
	border-color: #e74c3c;
}

.wf-director-console-status-title {
	font-size: 12px;
	font-weight: 600;
	color: var(--wf-color-text, #e0e0e0);
}

.wf-director-console-status-copy {
	font-size: 10px;
	color: var(--wf-color-text-dim, #888);
}

.wf-director-console-card {
	border: 1px solid var(--wf-color-border, #2a3a30);
	padding: 6px 10px;
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.wf-director-console-card-title {
	font-size: 11px;
	color: var(--wf-color-text-dim, #aaa);
}

.wf-director-console-card-value {
	font-size: 11px;
	font-weight: 600;
	color: var(--wf-color-accent, #1f9d84);
}

.wf-director-console-actions {
	display: flex;
	justify-content: center;
	padding: 4px 0;
}

.wf-director-console-btn {
	border: 1px solid var(--wf-color-accent, #1f9d84);
	background: transparent;
	color: var(--wf-color-accent, #1f9d84);
	padding: 8px 24px;
	font-size: 13px;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.15s ease;
	text-transform: none;
}

.wf-director-console-btn:hover:not(:disabled) {
	background: var(--wf-color-accent, #1f9d84);
	color: var(--wf-color-bg, #0a0f18);
}

.wf-director-console-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
	border-color: var(--wf-color-border, #3a4a40);
	color: var(--wf-color-text-dim, #666);
}
</style>
