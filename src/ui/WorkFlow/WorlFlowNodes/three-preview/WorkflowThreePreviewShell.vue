<template>
	<div class="wf-three-shell" data-wf-node-drag-ignore="true" @pointerdown.stop>
		<slot />
		<img
			v-if="snapshotUrl"
			class="wf-three-shell-snapshot"
			:class="{ visible: showSnapshot }"
			:src="snapshotUrl"
			alt="preview snapshot"
			draggable="false"
		/>
		<div v-if="empty" class="wf-three-shell-overlay empty">
			<div class="wf-three-shell-title">{{ emptyTitle }}</div>
			<div class="wf-three-shell-text">{{ emptyText }}</div>
		</div>
		<div v-else-if="phase === 'loading'" class="wf-three-shell-overlay loading">
			<div class="wf-three-shell-title">{{ loadingTitle }}</div>
			<div class="wf-three-shell-progress-track">
				<div class="wf-three-shell-progress-fill" :style="progressStyle" />
			</div>
			<div class="wf-three-shell-text">{{ progressLabel }}</div>
		</div>
		<div v-else-if="showMaskedOverlay" class="wf-three-shell-overlay masked">
			<div class="wf-three-shell-title">{{ maskedTitle }}</div>
			<div class="wf-three-shell-text">{{ maskedText }}</div>
			<button
				v-if="canStart"
				class="wf-three-shell-start"
				type="button"
				@click.stop="emit('start')"
			>
				{{ startLabel }}
			</button>
		</div>
		<div v-else-if="showMaskedDock" class="wf-three-shell-dock masked">
			<button
				v-if="canStart"
				class="wf-three-shell-start"
				type="button"
				@click.stop="emit('start')"
			>
				{{ startLabel }}
			</button>
			<div class="wf-three-shell-dock-copy">{{ maskedTitle }}</div>
		</div>
		<slot name="overlay" />
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WorkflowThreePreviewState } from './types'

const props = withDefaults(
	defineProps<{
		state?: WorkflowThreePreviewState | null
		snapshotUrl?: string
		empty?: boolean
		emptyTitle?: string
		emptyText?: string
		startLabel?: string
		loadingTitle?: string
		maskedTitle?: string
		maskedText?: string
	}>(),
	{
		state: null,
		snapshotUrl: '',
		empty: false,
		emptyTitle: '预览未就绪',
		emptyText: '当前节点还没有可渲染内容。',
		startLabel: '开启渲染',
		loadingTitle: '正在准备渲染',
		maskedTitle: '预览已暂停',
		maskedText: '选中当前节点后，可手动开启实时渲染。'
	}
)

const emit = defineEmits<{
	(e: 'start'): void
}>()

const phase = computed(() => props.state?.phase ?? 'masked')
const canStart = computed(() => props.state?.canStart === true)
const showSnapshot = computed(() => phase.value !== 'interactive')
const hasSnapshot = computed(() => String(props.snapshotUrl ?? '').trim().length > 0)
const showMaskedOverlay = computed(
	() => phase.value === 'masked' && !props.empty && !hasSnapshot.value
)
const showMaskedDock = computed(() => phase.value === 'masked' && !props.empty && hasSnapshot.value)
const progressValue = computed(() => {
	const raw = Number(props.state?.progress ?? 0)
	if (!Number.isFinite(raw)) return 0
	return Math.max(0, Math.min(1, raw))
})
const progressStyle = computed(() => ({ width: `${Math.round(progressValue.value * 100)}%` }))
const progressLabel = computed(() => {
	const label = String(props.state?.label ?? '').trim()
	if (label) return `${Math.round(progressValue.value * 100)}% · ${label}`
	return `${Math.round(progressValue.value * 100)}%`
})
</script>

<style scoped>
.wf-three-shell {
	position: relative;
	width: 100%;
	height: 100%;
	overflow: hidden;
}

.wf-three-shell-snapshot {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	object-fit: cover;
	opacity: 0;
	pointer-events: none;
	transition: opacity 140ms ease;
}

.wf-three-shell-snapshot.visible {
	opacity: 1;
}

.wf-three-shell-overlay {
	position: absolute;
	inset: 0;
	z-index: 2;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 10px;
	padding: 18px;
	text-align: center;
	background: linear-gradient(180deg, rgba(7, 12, 20, 0.38), rgba(7, 12, 20, 0.84));
	backdrop-filter: blur(8px);
}

.wf-three-shell-overlay.loading {
	gap: 12px;
}

.wf-three-shell-dock {
	position: absolute;
	left: 12px;
	bottom: 12px;
	z-index: 2;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid rgba(148, 163, 184, 0.18);
	border-radius: 14px;
	background: rgba(7, 12, 20, 0.62);
	backdrop-filter: blur(8px);
}

.wf-three-shell-dock-copy {
	font-size: 12px;
	color: rgba(226, 232, 240, 0.88);
}

.wf-three-shell-title {
	font-size: 13px;
	font-weight: 600;
	color: rgba(241, 245, 249, 0.96);
}

.wf-three-shell-text {
	font-size: 12px;
	line-height: 1.5;
	color: rgba(226, 232, 240, 0.82);
}

.wf-three-shell-start {
	border: 1px solid rgba(148, 163, 184, 0.32);
	border-radius: 0;
	padding: 8px 16px;
	font-size: 12px;
	color: #ecfeff;
	background: linear-gradient(135deg, rgba(13, 148, 136, 0.9), rgba(14, 116, 144, 0.88));
	cursor: pointer;
}

.wf-three-shell-progress-track {
	width: min(240px, 100%);
	height: 8px;
	border-radius: 0;
	overflow: hidden;
	background: rgba(148, 163, 184, 0.16);
}

.wf-three-shell-progress-fill {
	height: 100%;
	border-radius: inherit;
	background: linear-gradient(90deg, #22c55e, #38bdf8);
	transition: width 120ms ease;
}
</style>
