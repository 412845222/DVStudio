<template>
	<div v-if="visible" class="bso-mask" @pointerdown.stop>
		<div class="bso-panel" @pointerdown.stop>
			<div class="bso-sq-container" aria-hidden="true">
				<span
					v-for="p in particles"
					:key="p.id"
					class="sq-particle"
					:class="particleStateClasses"
					:style="p.style"
				/>
			</div>
			<div class="bso-frame" aria-hidden="true">
				<span class="bso-corner tl"></span>
				<span class="bso-corner tr"></span>
				<span class="bso-corner bl"></span>
				<span class="bso-corner br"></span>
				<span class="bso-edge-top"></span>
				<span class="bso-edge-bottom"></span>
				<span class="bso-edge-left"></span>
				<span class="bso-edge-right"></span>
			</div>

			<div class="bso-scanline" aria-hidden="true"></div>

			<div class="bso-header">
				<div class="bso-title">
					<span class="bso-title-indicator"></span>
					{{ title }}
				</div>
				<div class="bso-percent">{{ Math.round(clampedProgress * 100) }}%</div>
			</div>

			<div class="bso-bar-wrap" role="progressbar" :aria-valuenow="Math.round(clampedProgress * 100)">
				<div class="bso-bar" :style="{ width: Math.round(clampedProgress * 100) + '%' }">
					<div class="bso-bar-glow"></div>
				</div>
			</div>

			<div class="bso-steps">
				<div
					v-for="step in steps"
					:key="step.key"
					class="bso-step"
					:class="`bso-step-${step.status}`"
				>
					<span class="bso-step-icon">
						<span v-if="step.status === 'ok'" class="bso-icon-ok"></span>
						<span v-else-if="step.status === 'running'" class="bso-icon-running"></span>
						<span v-else-if="step.status === 'warn'" class="bso-icon-warn">!</span>
						<span v-else-if="step.status === 'error'" class="bso-icon-error">✕</span>
						<span v-else class="bso-icon-idle"></span>
					</span>
					<span class="bso-step-label">{{ step.label }}</span>
					<span v-if="step.subProgress" class="bso-step-sub">
						{{ step.subProgress.current }}/{{ step.subProgress.total }}
					</span>
					<span v-if="step.status === 'running'" class="bso-step-spinner"></span>
				</div>
			</div>

			<div v-if="error" class="bso-error">
				<div class="bso-error-text">{{ error }}</div>
				<button v-if="canSkipError" class="bso-skip-btn" type="button" @click.stop="emit('skip-error')">
					{{ skipText }}
				</button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSquareParticles } from '../../composables/useSquareParticles'
import type { StartupStep } from './types'

const props = withDefaults(
	defineProps<{
		visible: boolean
		title: string
		overallProgress: number
		steps: StartupStep[]
		error?: string | null
		canSkipError?: boolean
		skipText?: string
	}>(),
	{
		error: null,
		canSkipError: false,
		skipText: '跳过并继续进入'
	}
)

const emit = defineEmits<{
	(e: 'skip-error'): void
}>()

const { particles } = useSquareParticles({ count: 8, minSize: 2, maxSize: 6, seed: 42 })
const particleStateClasses = ['sq-running']

const clampedProgress = computed(() => {
	const p = Number(props.overallProgress)
	if (!Number.isFinite(p)) return 0
	return Math.max(0, Math.min(1, p))
})
</script>

<style scoped>
.bso-mask {
	position: fixed;
	left: 0;
	right: 0;
	bottom: 0;
	top: 0;
	z-index: 20000;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(10, 12, 17, 0.92);
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);
}

.bso-panel {
	position: relative;
	width: min(520px, calc(100vw - 64px));
	max-height: min(620px, calc(100vh - 80px));
	overflow: hidden;
	border: 1px solid color-mix(in srgb, var(--vscode-charts-green, #1f9d84) 45%, transparent);
	background: linear-gradient(
		160deg,
		color-mix(in srgb, rgba(15, 20, 28, 0.96) 80%, transparent),
		color-mix(in srgb, rgba(8, 11, 16, 0.98) 90%, transparent)
	);
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--vscode-charts-green, #1f9d84) 15%, transparent),
		0 24px 80px rgba(0, 0, 0, 0.6),
		0 0 60px color-mix(in srgb, var(--vscode-charts-green, #1f9d84) 8%, transparent);
	padding: 24px 28px;
	box-sizing: border-box;
}

.bso-sq-container {
	position: absolute;
	inset: 0;
	overflow: hidden;
	pointer-events: none;
	z-index: 0;
}

.bso-frame {
	position: absolute;
	inset: 0;
	z-index: 1;
	pointer-events: none;
}

.bso-corner {
	position: absolute;
	width: 14px;
	height: 14px;
}

.bso-corner.tl {
	top: 6px;
	left: 6px;
	border-top: 2px solid var(--vscode-charts-green, #27b99c);
	border-left: 2px solid var(--vscode-charts-green, #27b99c);
}

.bso-corner.tr {
	top: 6px;
	right: 6px;
	border-top: 2px solid var(--vscode-charts-green, #27b99c);
	border-right: 2px solid var(--vscode-charts-green, #27b99c);
}

.bso-corner.bl {
	bottom: 6px;
	left: 6px;
	border-bottom: 2px solid var(--vscode-charts-green, #27b99c);
	border-left: 2px solid var(--vscode-charts-green, #27b99c);
}

.bso-corner.br {
	bottom: 6px;
	right: 6px;
	border-bottom: 2px solid var(--vscode-charts-green, #27b99c);
	border-right: 2px solid var(--vscode-charts-green, #27b99c);
}

.bso-edge-top,
.bso-edge-bottom,
.bso-edge-left,
.bso-edge-right {
	position: absolute;
	background: color-mix(in srgb, var(--vscode-charts-green, #1f9d84) 20%, transparent);
}

.bso-edge-top {
	top: 0;
	left: 24px;
	right: 24px;
	height: 1px;
}

.bso-edge-bottom {
	bottom: 0;
	left: 24px;
	right: 24px;
	height: 1px;
}

.bso-edge-left {
	left: 0;
	top: 24px;
	bottom: 24px;
	width: 1px;
}

.bso-edge-right {
	right: 0;
	top: 24px;
	bottom: 24px;
	width: 1px;
}

.bso-scanline {
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	height: 2px;
	background: linear-gradient(
		90deg,
		transparent,
		color-mix(in srgb, var(--vscode-charts-green, #27b99c) 70%, transparent) 50%,
		transparent
	);
	animation: bso-scan 3s ease-in-out infinite;
	z-index: 1;
	pointer-events: none;
}

@keyframes bso-scan {
	0%, 100% { transform: translateY(0); opacity: 0.4; }
	50% { transform: translateY(calc(var(--panel-height, 400px) - 2px)); opacity: 0.8; }
}

.bso-header {
	position: relative;
	z-index: 2;
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 16px;
}

.bso-title {
	display: flex;
	align-items: center;
	gap: 10px;
	font-size: 16px;
	font-weight: 700;
	color: #e8f5f2;
	letter-spacing: 0.04em;
	text-shadow: 0 0 12px color-mix(in srgb, var(--vscode-charts-green, #27b99c) 40%, transparent);
}

.bso-title-indicator {
	display: inline-block;
	width: 8px;
	height: 8px;
	background: var(--vscode-charts-green, #27b99c);
	box-shadow:
		0 0 8px var(--vscode-charts-green, #27b99c),
		0 0 16px color-mix(in srgb, var(--vscode-charts-green, #27b99c) 60%, transparent);
	animation: bso-pulse 1.6s ease-in-out infinite;
}

@keyframes bso-pulse {
	0%, 100% { opacity: 1; transform: scale(1); }
	50% { opacity: 0.6; transform: scale(0.85); }
}

.bso-percent {
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
	font-size: 22px;
	font-weight: 700;
	color: var(--vscode-charts-green, #27b99c);
	text-shadow: 0 0 10px color-mix(in srgb, var(--vscode-charts-green, #27b99c) 50%, transparent);
	letter-spacing: 0.02em;
}

.bso-bar-wrap {
	position: relative;
	z-index: 2;
	height: 6px;
	background: color-mix(in srgb, rgba(255, 255, 255, 0.06) 100%, transparent);
	border: 1px solid color-mix(in srgb, var(--vscode-charts-green, #1f9d84) 25%, transparent);
	overflow: hidden;
	margin-bottom: 20px;
}

.bso-bar {
	position: relative;
	height: 100%;
	background: linear-gradient(
		90deg,
		var(--vscode-charts-green, #1f9d84),
		#27b99c 50%,
		#3aa8b4
	);
	transition: width 200ms cubic-bezier(0.22, 0.61, 0.36, 1);
	box-shadow: 0 0 12px color-mix(in srgb, var(--vscode-charts-green, #27b99c) 60%, transparent);
}

.bso-bar-glow {
	position: absolute;
	right: 0;
	top: -3px;
	bottom: -3px;
	width: 20px;
	background: linear-gradient(
		90deg,
		transparent,
		color-mix(in srgb, var(--vscode-charts-green, #27b99c) 80%, transparent),
		#fff
	);
	filter: blur(4px);
	animation: bso-bar-shimmer 1.2s ease-in-out infinite;
}

@keyframes bso-bar-shimmer {
	0%, 100% { opacity: 0.7; }
	50% { opacity: 1; }
}

.bso-steps {
	position: relative;
	z-index: 2;
	max-height: 320px;
	overflow-y: auto;
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-right: 4px;
}

.bso-steps::-webkit-scrollbar {
	width: 4px;
}

.bso-steps::-webkit-scrollbar-track {
	background: transparent;
}

.bso-steps::-webkit-scrollbar-thumb {
	background: color-mix(in srgb, var(--vscode-charts-green, #1f9d84) 30%, transparent);
	border-radius: 2px;
}

.bso-step {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px 10px;
	font-size: 13px;
	color: color-mix(in srgb, rgba(232, 245, 242, 0.5) 100%, transparent);
	transition: color 200ms ease, background 200ms ease;
	border-radius: 2px;
}

.bso-step-idle {
	opacity: 0.45;
}

.bso-step-running {
	color: #e8f5f2;
	background: color-mix(in srgb, var(--vscode-charts-green, #1f9d84) 8%, transparent);
	border-left: 2px solid var(--vscode-charts-green, #27b99c);
	padding-left: 8px;
}

.bso-step-ok {
	color: color-mix(in srgb, var(--vscode-charts-green, #27b99c) 85%, #fff);
}

.bso-step-warn {
	color: color-mix(in srgb, #e5b567 85%, #fff);
	background: color-mix(in srgb, #e5b567 8%, transparent);
}

.bso-step-error {
	color: color-mix(in srgb, #ff6b6b 85%, #fff);
	background: color-mix(in srgb, #ff6b6b 8%, transparent);
}

.bso-step-icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 16px;
	height: 16px;
	flex-shrink: 0;
}

.bso-icon-idle {
	display: block;
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: color-mix(in srgb, rgba(255, 255, 255, 0.2) 100%, transparent);
}

.bso-icon-ok {
	display: block;
	width: 10px;
	height: 6px;
	border-left: 2px solid var(--vscode-charts-green, #27b99c);
	border-bottom: 2px solid var(--vscode-charts-green, #27b99c);
	transform: rotate(-45deg);
	margin-top: -2px;
}

.bso-icon-running {
	display: block;
	width: 12px;
	height: 12px;
	border: 2px solid color-mix(in srgb, var(--vscode-charts-green, #27b99c) 30%, transparent);
	border-top-color: var(--vscode-charts-green, #27b99c);
	border-radius: 50%;
	animation: bso-spin 0.8s linear infinite;
}

@keyframes bso-spin {
	to { transform: rotate(360deg); }
}

.bso-icon-warn {
	font-size: 11px;
	font-weight: 700;
	color: #e5b567;
}

.bso-icon-error {
	font-size: 10px;
	font-weight: 700;
	color: #ff6b6b;
}

.bso-step-label {
	flex: 1;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.bso-step-sub {
	font-family: 'JetBrains Mono', ui-monospace, monospace;
	font-size: 11px;
	color: color-mix(in srgb, var(--vscode-charts-green, #27b99c) 70%, transparent);
	flex-shrink: 0;
}

.bso-step-running .bso-step-sub {
	color: var(--vscode-charts-green, #27b99c);
}

.bso-step-spinner {
	display: none;
}

.bso-error {
	position: relative;
	z-index: 2;
	margin-top: 16px;
	padding: 12px;
	border: 1px solid color-mix(in srgb, #ff6b6b 35%, transparent);
	background: color-mix(in srgb, #ff6b6b 8%, transparent);
	border-radius: 2px;
}

.bso-error-text {
	font-size: 12px;
	color: color-mix(in srgb, #ff9f9f 90%, #fff);
	line-height: 1.5;
	word-break: break-all;
	margin-bottom: 10px;
}

.bso-skip-btn {
	padding: 6px 14px;
	border: 1px solid color-mix(in srgb, #ff6b6b 40%, transparent);
	background: color-mix(in srgb, #ff6b6b 10%, transparent);
	color: color-mix(in srgb, #ff9f9f 90%, #fff);
	font-size: 12px;
	cursor: pointer;
	border-radius: 2px;
	letter-spacing: 0.03em;
	transition: background 200ms ease, border-color 200ms ease;
}

.bso-skip-btn:hover {
	background: color-mix(in srgb, #ff6b6b 18%, transparent);
	border-color: color-mix(in srgb, #ff6b6b 60%, transparent);
}

@media (prefers-reduced-motion: reduce) {
	.bso-scanline,
	.bso-title-indicator,
	.bso-bar-glow,
	.bso-icon-running,
	.sq-particle {
		animation: none !important;
	}
}
</style>
