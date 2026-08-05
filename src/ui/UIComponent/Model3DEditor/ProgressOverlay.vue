<template>
	<div v-if="visible" class="progress-overlay">
		<div class="progress-container">
			<div class="progress-glow"></div>
			<div class="progress-header">
				<svg
					class="progress-icon"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path
						d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
					/>
					<polyline points="3.27 6.96 12 12.01 20.73 6.96" />
					<line x1="12" y1="22.08" x2="12" y2="12" />
				</svg>
				<span class="progress-title">{{ title }}</span>
			</div>
			<div class="progress-bar-track">
				<div class="progress-bar-fill" :style="{ width: `${progress * 100}%` }"></div>
				<div class="progress-bar-glow" :style="{ left: `${progress * 100}%` }"></div>
			</div>
			<div class="progress-message">{{ message }}</div>
			<div class="progress-percent">{{ Math.round(progress * 100) }}%</div>
		</div>
	</div>
</template>

<script setup lang="ts">
defineProps<{
	visible: boolean
	title?: string
	message: string
	progress: number
}>()
</script>

<style scoped>
.progress-overlay {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--wf-overlay-bg, rgba(8, 12, 16, 0.85));
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);
	z-index: 100;
}

.progress-container {
	width: 320px;
	padding: 28px 32px;
	position: relative;
	background: var(
		--wf-surface-glass,
		linear-gradient(
			135deg,
			color-mix(in srgb, var(--wf-primary, #27b99c) 4%, rgba(21, 24, 28, 0.9)),
			rgba(21, 24, 28, 0.95)
		)
	);
	border: 1px solid
		color-mix(in srgb, var(--wf-primary, #27b99c) 25%, var(--wf-border-subtle, transparent));
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
	box-shadow: var(--wf-panel-shadow-strong, 0 12px 36px rgba(0, 0, 0, 0.18));
}

.progress-glow {
	position: absolute;
	inset: -20px;
	background: radial-gradient(
		ellipse at center,
		color-mix(in srgb, var(--wf-primary, #27b99c) 8%, transparent) 0%,
		transparent 70%
	);
	pointer-events: none;
}

.progress-header {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-bottom: 16px;
}

.progress-icon {
	width: 20px;
	height: 20px;
	color: var(--wf-primary, #27b99c);
	animation: float 2s ease-in-out infinite;
	filter: drop-shadow(0 0 6px color-mix(in srgb, var(--wf-primary, #27b99c) 40%, transparent));
}

@keyframes float {
	0%,
	100% {
		transform: translateY(0);
	}
	50% {
		transform: translateY(-3px);
	}
}

.progress-title {
	font-size: 14px;
	font-weight: 600;
	color: var(--wf-text, #e0ecf8);
	letter-spacing: 0.5px;
	text-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #27b99c) 20%, transparent);
}

.progress-bar-track {
	position: relative;
	height: 3px;
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 10%, rgba(255, 255, 255, 0.04));
	overflow: hidden;
	margin-bottom: 12px;
}

.progress-bar-fill {
	position: absolute;
	left: 0;
	top: 0;
	height: 100%;
	background: linear-gradient(90deg, var(--wf-primary, #27b99c), #3aa8b4);
	transition: width 0.3s ease-out;
	box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #27b99c) 40%, transparent);
}

.progress-bar-glow {
	position: absolute;
	top: -4px;
	width: 16px;
	height: 11px;
	background: radial-gradient(
		ellipse,
		color-mix(in srgb, #fff 70%, transparent) 0%,
		transparent 70%
	);
	transform: translateX(-50%);
	transition: left 0.3s ease-out;
	filter: blur(2px);
}

.progress-message {
	font-size: 12px;
	color: var(--wf-text-muted, #8fa3b8);
	margin-bottom: 4px;
}

.progress-percent {
	font-size: 11px;
	color: var(--wf-primary, #27b99c);
	font-family: 'Consolas', 'Monaco', monospace;
	letter-spacing: 1px;
	text-align: right;
	text-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary, #27b99c) 30%, transparent);
}
</style>
