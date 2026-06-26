<script setup lang="ts">
import { computed, ref, watch } from 'vue'

export type StartupProgressStep = {
	key: string
	label: string
	status: 'idle' | 'running' | 'ok' | 'warn' | 'error'
	detail?: string
}

export type StartupProgressState = {
	visible: boolean
	title: string
	steps: StartupProgressStep[]
	autoHideMs?: number | null
}

const props = defineProps<{
	state: StartupProgressState
}>()

const emit = defineEmits<{
	(e: 'dismiss'): void
}>()

const localVisible = ref(Boolean(props.state.visible))
const fadeTimer = ref<number | null>(null)

const completedCount = computed(() => props.state.steps.filter((s) => s.status === 'ok').length)

const totalCount = computed(() => Math.max(1, props.state.steps.length))

const percent = computed(() => Math.round((completedCount.value / totalCount.value) * 100))

const hasFailure = computed(() => props.state.steps.some((s) => s.status === 'error'))

const primaryText = computed(() => {
	if (props.state.title) return props.state.title
	if (hasFailure.value) return '启动过程中出现异常'
	if (percent.value >= 100) return '启动检查完成'
	return '启动检查中…'
})

const pixelBubbles = computed(() => {
	// Generate pixel bubble positions for the fill area
	const bubbles: { x: number; size: number; delay: number; duration: number; hue: number }[] = []
	for (let i = 0; i < 14; i++) {
		bubbles.push({
			x: (i * 7.3) % 100,
			size: 2 + (i % 4) * 2,
			delay: (i * 0.17) % 3,
			duration: 2.2 + (i % 5) * 0.4,
			hue: 210 + (i % 6) * 12
		})
	}
	return bubbles
})

watch(
	() => props.state.visible,
	(v) => {
		localVisible.value = Boolean(v)
		if (fadeTimer.value) {
			window.clearTimeout(fadeTimer.value)
			fadeTimer.value = null
		}
		if (Boolean(v) && typeof props.state.autoHideMs === 'number' && props.state.autoHideMs > 0) {
			fadeTimer.value = window.setTimeout(() => {
				localVisible.value = false
				emit('dismiss')
			}, props.state.autoHideMs)
		}
	},
	{ immediate: true }
)

watch(
	() => percent.value >= 100 && !hasFailure.value,
	(done) => {
		if (
			done &&
			typeof props.state.autoHideMs === 'number' &&
			props.state.autoHideMs > 0 &&
			!fadeTimer.value
		) {
			fadeTimer.value = window.setTimeout(() => {
				localVisible.value = false
				emit('dismiss')
			}, props.state.autoHideMs)
		}
	}
)

function statusIcon(status: StartupProgressStep['status']) {
	switch (status) {
		case 'running':
			return '■'
		case 'ok':
			return '■'
		case 'warn':
			return '■'
		case 'error':
			return '■'
		default:
			return '□'
	}
}
</script>

<template>
	<div v-if="localVisible" class="startup-progress-bar" role="status" aria-live="polite">
		<div class="startup-progress-bar-header">
			<div class="startup-progress-bar-title">{{ primaryText }}</div>
			<button
				class="startup-progress-bar-close"
				type="button"
				@click="localVisible = false; $emit('dismiss')"
				aria-label="关闭"
			>
				■
			</button>
		</div>
		<div class="startup-progress-bar-meter" aria-hidden="true">
			<div
				class="startup-progress-bar-meter-fill"
				:style="{ width: percent + '%' }"
				:class="{ 'is-error': hasFailure }"
			>
				<div
					v-for="(b, idx) in pixelBubbles"
					:key="idx"
					class="pixel-bubble"
					:style="{
						left: b.x + '%',
						width: b.size + 'px',
						height: b.size + 'px',
						animationDelay: b.delay + 's',
						animationDuration: b.duration + 's',
						background: `hsl(${b.hue}, 80%, 68%)`
					}"
				/>
				<div class="pixel-shimmer" />
			</div>
			<div class="startup-progress-bar-meter-label">{{ percent }}%</div>
		</div>
		<ul class="startup-progress-bar-steps">
			<li
				v-for="step in state.steps"
				:key="step.key"
				class="startup-progress-bar-step"
				:class="'is-' + step.status"
			>
				<span class="startup-progress-bar-step-icon" aria-hidden="true">
					{{ statusIcon(step.status) }}
				</span>
				<span class="startup-progress-bar-step-text">
					<span class="startup-progress-bar-step-label">{{ step.label }}</span>
					<span v-if="step.detail" class="startup-progress-bar-step-detail">{{ step.detail }}</span>
				</span>
			</li>
		</ul>
	</div>
</template>

<style scoped>
.startup-progress-bar {
	position: fixed;
	top: 56px;
	right: 24px;
	z-index: 9999;
	width: 320px;
	max-width: calc(100vw - 48px);
	background: rgba(18, 20, 24, 0.82);
	border: 1px solid rgba(255, 255, 255, 0.12);
	color: var(--vscode-fg, #e6e6e6);
	box-shadow:
		0 12px 48px rgba(0, 0, 0, 0.65),
		inset 0 1px 0 rgba(255, 255, 255, 0.04);
	padding: 16px 18px;
	font-size: 12px;
	line-height: 1.6;
	font-family: 'Cascadia Code', 'Consolas', 'Menlo', 'PingFang SC', 'Microsoft YaHei', monospace;
	backdrop-filter: blur(24px) saturate(140%);
	-webkit-backdrop-filter: blur(24px) saturate(140%);
	animation: startup-progress-bar-fade-in 280ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

@keyframes startup-progress-bar-fade-in {
	from {
		opacity: 0;
		transform: translateY(-8px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

.startup-progress-bar-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-bottom: 12px;
}

.startup-progress-bar-title {
	font-size: 13px;
	font-weight: 600;
	color: #e6e6e6;
	letter-spacing: 0.02em;
}

.startup-progress-bar-close {
	appearance: none;
	-webkit-appearance: none;
	background: transparent;
	border: none;
	color: var(--vscode-fg-muted, #8a8f98);
	font-size: 14px;
	line-height: 1;
	cursor: pointer;
	padding: 0 4px;
	transition: color 160ms ease;
	font-family: inherit;
}

.startup-progress-bar-close:hover {
	color: #e6e6e6;
}

.startup-progress-bar-meter {
	position: relative;
	height: 12px;
	background: rgba(255, 255, 255, 0.04);
	border: 1px solid rgba(255, 255, 255, 0.08);
	overflow: hidden;
	margin-bottom: 14px;
}

.startup-progress-bar-meter-fill {
	position: relative;
	height: 100%;
	background: linear-gradient(
		90deg,
		#2b4fa0 0%,
		#3d6bc8 25%,
		#4f8cff 50%,
		#6aa9ff 75%,
		#4f8cff 100%
	);
	background-size: 200% 100%;
	animation: bar-shimmer 2.2s linear infinite;
	transition: width 380ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

@keyframes bar-shimmer {
	0% {
		background-position: 200% 0;
	}
	100% {
		background-position: -200% 0;
	}
}

.pixel-shimmer {
	position: absolute;
	inset: 0;
	background-image: linear-gradient(
		45deg,
		rgba(255, 255, 255, 0.18) 25%,
		transparent 25%,
		transparent 50%,
		rgba(255, 255, 255, 0.18) 50%,
		rgba(255, 255, 255, 0.18) 75%,
		transparent 75%,
		transparent
	);
	background-size: 8px 8px;
	opacity: 0.35;
	animation: pixel-drift 1.2s linear infinite;
	pointer-events: none;
}

@keyframes pixel-drift {
	from {
		background-position: 0 0;
	}
	to {
		background-position: 8px 0;
	}
}

.pixel-bubble {
	position: absolute;
	bottom: -4px;
	opacity: 0;
	animation: bubble-float 2.8s ease-in-out infinite;
	box-shadow: 0 0 2px rgba(255, 255, 255, 0.3);
}

@keyframes bubble-float {
	0% {
		bottom: -6px;
		opacity: 0;
		transform: translateX(0) scale(0.6);
	}
	15% {
		opacity: 1;
		transform: translateX(2px) scale(1);
	}
	50% {
		transform: translateX(-3px) scale(1.1);
	}
	85% {
		opacity: 0.9;
		transform: translateX(1px) scale(0.9);
	}
	100% {
		bottom: calc(100% + 4px);
		opacity: 0;
		transform: translateX(0) scale(0.7);
	}
}

.startup-progress-bar-meter-fill.is-error {
	background: linear-gradient(
		90deg,
		#7a2828 0%,
		#a03636 25%,
		#e06c75 50%,
		#ff8a8a 75%,
		#e06c75 100%
	);
	background-size: 200% 100%;
	animation: bar-shimmer 2.2s linear infinite;
}

.startup-progress-bar-meter-fill.is-error .pixel-bubble {
	filter: hue-rotate(-200deg);
}

.startup-progress-bar-meter-label {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: flex-end;
	padding-right: 10px;
	font-size: 10px;
	color: rgba(255, 255, 255, 0.7);
	letter-spacing: 0.04em;
	text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
	pointer-events: none;
}

.startup-progress-bar-steps {
	list-style: none;
	padding: 0;
	margin: 0;
	display: flex;
	flex-direction: column;
	gap: 6px;
	max-height: 180px;
	overflow: auto;
}

.startup-progress-bar-step {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	color: var(--vscode-fg-muted, #8a8f98);
}

.startup-progress-bar-step.is-running {
	color: var(--vscode-fg, #e6e6e6);
}

.startup-progress-bar-step.is-running .startup-progress-bar-step-icon {
	animation: pixel-pulse 1.1s ease-in-out infinite;
	color: #6aa9ff;
}

@keyframes pixel-pulse {
	0%,
	100% {
		opacity: 1;
		transform: scale(1);
	}
	50% {
		opacity: 0.4;
		transform: scale(0.75);
	}
}

.startup-progress-bar-step.is-ok {
	color: #98c379;
}

.startup-progress-bar-step.is-ok .startup-progress-bar-step-icon {
	animation: pixel-pop 320ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes pixel-pop {
	from {
		opacity: 0;
		transform: scale(0.4);
	}
	to {
		opacity: 1;
		transform: scale(1);
	}
}

.startup-progress-bar-step.is-warn {
	color: #e5c07b;
}

.startup-progress-bar-step.is-error {
	color: #e06c75;
}

.startup-progress-bar-step-icon {
	width: 12px;
	text-align: center;
	flex-shrink: 0;
	font-size: 10px;
	line-height: 1.6;
	font-family: inherit;
}

.startup-progress-bar-step-text {
	flex: 1;
	display: flex;
	flex-direction: column;
}

.startup-progress-bar-step-label {
	font-size: 12px;
}

.startup-progress-bar-step-detail {
	font-size: 11px;
	opacity: 0.85;
	word-break: break-word;
}
</style>
