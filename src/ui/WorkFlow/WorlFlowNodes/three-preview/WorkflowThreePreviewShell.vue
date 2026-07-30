<template>
	<!-- 【BUGFIX 2026-07】在根容器上统一 @contextmenu.prevent.stop，防止从3D预览区任何子元素（slot默认slot、empty/loading/masked覆盖层、snapshot图、overlay slot、dock）
	     右键事件冒泡到 WorkflowNodeWrapper 触发节点右键菜单。3D预览区右键应当只用于镜头平移，不弹任何节点菜单。 -->
	<div class="wf-three-shell" data-wf-node-drag-ignore="true" @contextmenu.prevent.stop>
		<slot />
		<!--
			【关键修复】snapshot 图只在它需要显示的阶段（showSnapshot=true，即 phase!='interactive'）才挂载到DOM，
			在 interactive 阶段完全不在DOM中，从根上杜绝它覆盖在 canvas 上方拦截鼠标事件。
			同时保留内联 style="pointer-events:none" 作为双重保险（防止 Scoped CSS 被覆盖时的兜底），
			并显式加 data-wf-node-drag-ignore / @pointerdown.stop 避免它成为事件路径上的意外拦截点。
		-->
		<img
			v-if="snapshotUrl && showSnapshot"
			class="wf-three-shell-snapshot"
			:class="{ visible: true }"
			:src="snapshotUrl"
			alt="preview snapshot"
			draggable="false"
			style="pointer-events: none"
			data-wf-node-drag-ignore="true"
			@pointerdown.stop
			@contextmenu.prevent
		/>
		<!-- 注意：empty / loading / masked 这几种 overlay 本身就带着 v-if，只在非 interactive 阶段才存在，不遮挡 canvas 交互 -->
		<div v-if="empty" class="wf-three-shell-overlay empty">
			<div class="wf-three-shell-title">{{ displayEmptyTitle }}</div>
			<div class="wf-three-shell-text">{{ displayEmptyText }}</div>
		</div>
		<div v-else-if="phase === 'loading'" class="wf-three-shell-overlay loading">
			<div class="wf-three-shell-title">{{ displayLoadingTitle }}</div>
			<div class="wf-three-shell-progress-track">
				<div class="wf-three-shell-progress-fill" :style="progressStyle" />
			</div>
			<div class="wf-three-shell-text">{{ progressLabel }}</div>
		</div>
		<div v-else-if="showMaskedOverlay" class="wf-three-shell-overlay masked">
			<div class="wf-three-shell-title">{{ displayMaskedTitle }}</div>
			<div class="wf-three-shell-text">{{ displayMaskedText }}</div>
			<button
				v-if="canStart"
				class="wf-three-shell-start"
				type="button"
				@click.stop="emit('start')"
			>
				{{ displayStartLabel }}
			</button>
		</div>
		<div v-else-if="showMaskedDock" class="wf-three-shell-dock masked">
			<button
				v-if="canStart"
				class="wf-three-shell-start"
				type="button"
				@click.stop="emit('start')"
			>
				{{ displayStartLabel }}
			</button>
			<div class="wf-three-shell-dock-copy">{{ displayMaskedTitle }}</div>
		</div>
		<slot name="overlay" />
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '../../../../i18n'
import type { WorkflowThreePreviewState } from './types'

const { t } = useI18n()

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
		emptyTitle: undefined,
		emptyText: undefined,
		startLabel: undefined,
		loadingTitle: undefined,
		maskedTitle: undefined,
		maskedText: undefined
	}
)

const emit = defineEmits<{
	(e: 'start'): void
}>()

const phase = computed(() => props.state?.phase ?? 'masked')
const canStart = computed(() => {
	if (props.state?.canStart === false) return false
	return phase.value === 'masked' && !props.empty
})
const showSnapshot = computed(() => phase.value !== 'interactive')
const hasSnapshot = computed(() => String(props.snapshotUrl ?? '').trim().length > 0)
const showMaskedOverlay = computed(
	() => phase.value === 'masked' && !props.empty && !canStart.value
)
const showMaskedDock = computed(() => phase.value === 'masked' && !props.empty && canStart.value)
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

const displayEmptyTitle = computed(() => props.emptyTitle || t('ui.preview.notReadyTitle'))
const displayEmptyText = computed(() => props.emptyText || t('ui.preview.notReadyText'))
const displayStartLabel = computed(() => props.startLabel || t('ui.preview.startRender'))
const displayLoadingTitle = computed(() => props.loadingTitle || t('ui.preview.preparingTitle'))
const displayMaskedTitle = computed(() => props.maskedTitle || t('ui.preview.pausedTitle'))
const displayMaskedText = computed(() => props.maskedText || t('ui.preview.pausedText'))
</script>

<style scoped>
.wf-three-shell {
	position: relative;
	width: 100%;
	height: 100%;
	overflow: hidden;
	pointer-events: auto;
}

.wf-three-shell-snapshot {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	object-fit: cover;
	opacity: 0;
	/* ========== 关键：无论何时，snapshot 本身都不该接收鼠标事件（它是预览图，不该挡住下面的 canvas） ========== */
	/* 用户实际互动的目标：
	   - masked 阶段：点击"开始渲染"按钮（在 .wf-three-shell-overlay / dock 上，z-index=2 在 snapshot 之上，不冲突）
	   - interactive 阶段：snapshot 不在DOM（由 v-if 控制），不会遮挡 canvas
	   - loading 阶段：用户不该操作（loading overlay 本身也有 inset:0 + z-index=2 覆盖）
	*/
	pointer-events: none !important;
	/* 用户选择也禁用，避免拖拽时产生浏览器默认的"拖拽图片"行为（虽已 draggable=false，这里双重保险） */
	user-select: none;
	-webkit-user-drag: none;
	transition: opacity 140ms ease;
}

.wf-three-shell-snapshot.visible {
	opacity: 1;
	/* visible 状态也明确保留 pointer-events:none */
	pointer-events: none !important;
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
