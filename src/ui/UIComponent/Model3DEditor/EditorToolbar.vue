<template>
	<div class="m3de-toolbar">
		<div class="sq-container">
			<span v-for="p in particles" :key="p.id" class="sq-particle" :style="p.style" />
		</div>
		<div class="m3de-corner m3de-corner-tl" />
		<div class="m3de-corner m3de-corner-br" />
		<div class="m3de-toolbar-scanline" />

		<div class="m3de-toolbar-groups">
			<div class="m3de-toolbar-group">
				<span class="m3de-toolbar-group-label">{{ renderModeLabel }}</span>
				<button
					v-for="mode in renderModes"
					:key="mode.value"
					class="m3de-toolbar-btn"
					:class="{ active: currentRenderMode === mode.value }"
					@click="$emit('update:renderMode', mode.value)"
				>
					{{ mode.label }}
				</button>
			</div>

			<div class="m3de-toolbar-divider" />

			<div class="m3de-toolbar-group">
				<span class="m3de-toolbar-group-label">{{ lightingLabel }}</span>
				<button
					v-for="preset in lightingPresets"
					:key="preset.value"
					class="m3de-toolbar-btn"
					:class="{ active: currentLighting === preset.value }"
					@click="$emit('update:lighting', preset.value)"
				>
					{{ preset.label }}
				</button>
			</div>

			<div class="m3de-toolbar-divider" />

			<div class="m3de-toolbar-group">
				<span class="m3de-toolbar-group-label">{{ transformLabel }}</span>
				<button
					v-for="mode in transformModes"
					:key="mode.value"
					class="m3de-toolbar-btn m3de-transform-btn"
					:class="{ active: currentTransformMode === mode.value }"
					:title="mode.tooltip"
					@click="$emit('update:transformMode', mode.value)"
				>
					{{ mode.label }}
				</button>
			</div>

			<div class="m3de-toolbar-divider" />

			<div class="m3de-toolbar-group">
				<span class="m3de-toolbar-group-label">{{ displayLabel }}</span>
				<label class="m3de-toolbar-checkbox">
					<input
						type="checkbox"
						:checked="shadowsEnabled"
						@change="$emit('update:shadowsEnabled', ($event.target as HTMLInputElement).checked)"
					/>
					<span class="m3de-checkbox-indicator" />
					<span>{{ shadowsLabel }}</span>
				</label>
				<label class="m3de-toolbar-checkbox">
					<input
						type="checkbox"
						:checked="gridVisible"
						@change="$emit('update:gridVisible', ($event.target as HTMLInputElement).checked)"
					/>
					<span class="m3de-checkbox-indicator" />
					<span>{{ gridLabel }}</span>
				</label>
				<label class="m3de-toolbar-checkbox">
					<input
						type="checkbox"
						:checked="axesVisible"
						@change="$emit('update:axesVisible', ($event.target as HTMLInputElement).checked)"
					/>
					<span class="m3de-checkbox-indicator" />
					<span>{{ axesLabel }}</span>
				</label>
				<label class="m3de-toolbar-checkbox">
					<input
						type="checkbox"
						:checked="bloomEnabled"
						@change="$emit('update:bloomEnabled', ($event.target as HTMLInputElement).checked)"
					/>
					<span class="m3de-checkbox-indicator" />
					<span>{{ bloomLabel }}</span>
				</label>
				<label class="m3de-toolbar-checkbox">
					<input
						type="checkbox"
						:checked="wireframeOverlay"
						@change="$emit('update:wireframeOverlay', ($event.target as HTMLInputElement).checked)"
					/>
					<span class="m3de-checkbox-indicator" />
					<span>{{ wireframeLabel }}</span>
				</label>
			</div>
		</div>

		<div class="m3de-toolbar-actions">
			<button
				class="m3de-toolbar-action-btn"
				@click="$emit('resetCamera')"
				:title="resetCameraLabel"
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
					<path d="M3 3v5h5" />
				</svg>
				<span>{{ resetCameraLabel }}</span>
			</button>
			<button class="m3de-toolbar-action-btn" @click="$emit('screenshot')" :title="screenshotLabel">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path
						d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"
					/>
					<circle cx="12" cy="13" r="3" />
				</svg>
				<span>{{ screenshotLabel }}</span>
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '../../../i18n'
import { useSquareParticles } from '../../../composables/useSquareParticles'
import type {
	RenderMode,
	LightingPreset,
	TransformMode
} from '../../WorkFlow/WorlFlowNodes/model3d/editor/types'

const { t } = useI18n()

const { particles } = useSquareParticles({
	count: 4,
	baseOpacity: 0.3,
	minSize: 2,
	maxSize: 4,
	seed: 31337
})

interface Props {
	currentRenderMode: RenderMode
	currentLighting: LightingPreset
	currentTransformMode: TransformMode
	shadowsEnabled: boolean
	gridVisible: boolean
	axesVisible: boolean
	bloomEnabled: boolean
	wireframeOverlay: boolean
}

defineProps<Props>()

defineEmits<{
	'update:renderMode': [mode: RenderMode]
	'update:lighting': [preset: LightingPreset]
	'update:transformMode': [mode: TransformMode]
	'update:shadowsEnabled': [enabled: boolean]
	'update:gridVisible': [visible: boolean]
	'update:axesVisible': [visible: boolean]
	'update:bloomEnabled': [enabled: boolean]
	'update:wireframeOverlay': [enabled: boolean]
	resetCamera: []
	screenshot: []
}>()

const renderModes = computed(() => [
	{ value: 'pbr' as RenderMode, label: t('nodes.model3d.renderPBR') },
	{ value: 'solid-white' as RenderMode, label: t('nodes.model3d.renderWhite') },
	{ value: 'normal' as RenderMode, label: t('nodes.model3d.renderNormal') },
	{ value: 'unlit' as RenderMode, label: t('nodes.model3d.renderUnlit') }
])

const lightingPresets = computed(() => [
	{ value: 'studio' as LightingPreset, label: t('nodes.model3d.lightStudio') },
	{ value: 'soft-studio' as LightingPreset, label: t('nodes.model3d.lightSoftStudio') },
	{ value: 'outdoor' as LightingPreset, label: t('nodes.model3d.lightOutdoor') },
	{ value: 'dark' as LightingPreset, label: t('nodes.model3d.lightDark') },
	{ value: 'no-light' as LightingPreset, label: t('nodes.model3d.lightNone') },
	{ value: 'custom' as LightingPreset, label: '自定义' }
])

const transformModes = computed(() => [
	{ value: 'translate' as TransformMode, label: t('nodes.model3d.transformMove'), tooltip: 'W' },
	{ value: 'rotate' as TransformMode, label: t('nodes.model3d.transformRotate'), tooltip: 'E' },
	{ value: 'scale' as TransformMode, label: t('nodes.model3d.transformScale'), tooltip: 'R' }
])

const renderModeLabel = computed(() => t('nodes.model3d.renderMode'))
const lightingLabel = computed(() => t('nodes.model3d.lighting'))
const transformLabel = computed(() => t('nodes.model3d.transform'))
const displayLabel = computed(() => t('nodes.model3d.display'))
const shadowsLabel = computed(() => t('nodes.model3d.shadows'))
const gridLabel = computed(() => t('nodes.model3d.grid'))
const axesLabel = computed(() => t('nodes.model3d.axes'))
const bloomLabel = computed(() => t('nodes.model3d.bloom'))
const wireframeLabel = computed(() => t('nodes.model3d.wireframe'))
const resetCameraLabel = computed(() => t('nodes.model3d.resetCamera'))
const screenshotLabel = computed(() => t('nodes.model3d.screenshot'))
</script>

<style scoped>
.m3de-toolbar {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 10px 16px;
	background: var(
		--wf-surface-glass,
		linear-gradient(135deg, rgba(29, 34, 39, 0.9), rgba(21, 24, 28, 0.95))
	);
	backdrop-filter: blur(12px) saturate(140%);
	-webkit-backdrop-filter: blur(12px) saturate(140%);
	border-bottom: 1px solid
		color-mix(in srgb, var(--wf-primary) 25%, var(--wf-border-subtle, transparent));
	box-shadow:
		inset 0 1px 0 color-mix(in srgb, #fff 8%, transparent),
		0 1px 12px color-mix(in srgb, var(--wf-shadow, rgba(0, 0, 0, 0.3)) 50%, transparent);
	overflow: hidden;
}

.m3de-toolbar-scanline {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 1px;
	background: linear-gradient(
		90deg,
		transparent 0%,
		color-mix(in srgb, var(--wf-primary) 0%, transparent) 5%,
		color-mix(in srgb, var(--wf-primary) 60%, transparent) 50%,
		color-mix(in srgb, var(--wf-primary) 0%, transparent) 95%,
		transparent 100%
	);
	box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary) 40%, transparent);
	animation: m3de-scanline-pulse 4s ease-in-out infinite;
	pointer-events: none;
	z-index: 1;
}

@keyframes m3de-scanline-pulse {
	0%,
	100% {
		opacity: 0.5;
	}
	50% {
		opacity: 1;
	}
}

.m3de-corner {
	position: absolute;
	width: 10px;
	height: 10px;
	border: 2px solid color-mix(in srgb, var(--wf-primary) 65%, transparent);
	box-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary) 30%, transparent);
	pointer-events: none;
	z-index: 2;
}

.m3de-corner-tl {
	top: 4px;
	left: 4px;
	border-right: none;
	border-bottom: none;
}

.m3de-corner-br {
	bottom: 4px;
	right: 4px;
	border-left: none;
	border-top: none;
}

.m3de-toolbar-groups {
	display: flex;
	align-items: center;
	gap: 4px;
	flex-wrap: wrap;
}

.m3de-toolbar-group {
	display: flex;
	align-items: center;
	gap: 4px;
}

.m3de-toolbar-group-label {
	position: relative;
	padding-left: 12px;
	margin-right: 6px;
	color: var(--wf-primary);
	font-size: 10px;
	font-weight: 600;
	letter-spacing: 0.1em;
	text-transform: uppercase;
	text-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary) 45%, transparent);
	white-space: nowrap;
}

.m3de-toolbar-group-label::before {
	content: '';
	position: absolute;
	left: 0;
	top: 50%;
	transform: translateY(-50%);
	width: 5px;
	height: 5px;
	background: var(--wf-primary);
	box-shadow: 0 0 8px var(--wf-primary);
}

.m3de-toolbar-divider {
	width: 1px;
	height: 22px;
	margin: 0 8px;
	background: linear-gradient(
		180deg,
		transparent,
		color-mix(in srgb, var(--wf-primary) 35%, transparent) 50%,
		transparent
	);
	box-shadow: 0 0 4px color-mix(in srgb, var(--wf-primary) 15%, transparent);
}

.m3de-toolbar-btn {
	position: relative;
	padding: 5px 10px;
	border: 1px solid transparent;
	background: transparent;
	color: var(--wf-text-muted);
	font-size: 11px;
	font-family: inherit;
	cursor: pointer;
	transition: all 160ms ease;
	white-space: nowrap;
}

.m3de-toolbar-btn:hover {
	color: var(--wf-text);
	background: color-mix(in srgb, var(--wf-primary) 8%, transparent);
	border-color: color-mix(in srgb, var(--wf-primary) 30%, transparent);
}

.m3de-toolbar-btn.active {
	color: var(--wf-primary);
	background: color-mix(in srgb, var(--wf-primary) 14%, transparent);
	border-color: color-mix(in srgb, var(--wf-primary) 55%, transparent);
	text-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary) 40%, transparent);
	box-shadow:
		inset 0 0 12px color-mix(in srgb, var(--wf-primary) 8%, transparent),
		0 0 8px color-mix(in srgb, var(--wf-primary) 15%, transparent);
}

.m3de-transform-btn {
	display: inline-flex;
	align-items: center;
	gap: 4px;
}

.m3de-btn-icon {
	width: 12px;
	height: 12px;
}

.m3de-toolbar-checkbox {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 4px 8px;
	cursor: pointer;
	font-size: 11px;
	color: var(--wf-text-muted);
	transition: color 160ms ease;
}

.m3de-toolbar-checkbox:hover {
	color: var(--wf-text);
}

.m3de-toolbar-checkbox input {
	display: none;
}

.m3de-checkbox-indicator {
	width: 14px;
	height: 14px;
	border: 1px solid color-mix(in srgb, var(--wf-primary) 40%, var(--wf-control-border, transparent));
	background: var(--wf-control-bg, rgba(0, 0, 0, 0.3));
	position: relative;
	transition: all 160ms ease;
	flex-shrink: 0;
}

.m3de-checkbox-indicator::after {
	content: '';
	position: absolute;
	top: 2px;
	left: 2px;
	width: 8px;
	height: 8px;
	background: var(--wf-primary);
	opacity: 0;
	transform: scale(0.5);
	transition: all 160ms ease;
	box-shadow: 0 0 6px var(--wf-primary);
}

.m3de-toolbar-checkbox input:checked + .m3de-checkbox-indicator {
	border-color: var(--wf-primary);
	box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary) 30%, transparent);
}

.m3de-toolbar-checkbox input:checked + .m3de-checkbox-indicator::after {
	opacity: 1;
	transform: scale(1);
}

.m3de-toolbar-actions {
	display: flex;
	align-items: center;
	gap: 6px;
}

.m3de-toolbar-action-btn {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 5px 10px;
	border: 1px solid color-mix(in srgb, var(--wf-primary) 30%, transparent);
	background: color-mix(in srgb, var(--wf-primary) 6%, transparent);
	color: var(--wf-text);
	font-size: 11px;
	font-family: inherit;
	cursor: pointer;
	transition: all 160ms ease;
	white-space: nowrap;
}

.m3de-toolbar-action-btn svg {
	width: 13px;
	height: 13px;
}

.m3de-toolbar-action-btn:hover {
	border-color: var(--wf-primary);
	background: color-mix(in srgb, var(--wf-primary) 12%, transparent);
	box-shadow: 0 0 12px color-mix(in srgb, var(--wf-primary) 20%, transparent);
}
</style>
