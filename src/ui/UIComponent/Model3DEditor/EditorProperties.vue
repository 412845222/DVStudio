<template>
	<div class="editor-properties">
		<div class="properties-header">
			<span class="properties-title">属性面板</span>
		</div>
		<div class="properties-content">
			<div v-if="!selectedObject" class="properties-empty">
				<svg
					class="empty-icon"
					viewBox="0 0 24 24"
					width="32"
					height="32"
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
				<span class="empty-text">选择一个物体查看属性</span>
			</div>

			<template v-else>
				<div class="prop-section">
					<div class="prop-section-title">变换</div>
					<div class="prop-grid">
						<div class="prop-row">
							<span class="prop-label">位置</span>
							<div class="prop-vector3">
								<input
									type="number"
									class="prop-input"
									step="0.1"
									:value="position.x"
									@change="onPositionChange('x', $event)"
								/>
								<input
									type="number"
									class="prop-input"
									step="0.1"
									:value="position.y"
									@change="onPositionChange('y', $event)"
								/>
								<input
									type="number"
									class="prop-input"
									step="0.1"
									:value="position.z"
									@change="onPositionChange('z', $event)"
								/>
							</div>
						</div>
						<div class="prop-row">
							<span class="prop-label">旋转</span>
							<div class="prop-vector3">
								<input
									type="number"
									class="prop-input"
									step="1"
									:value="rotation.x"
									@change="onRotationChange('x', $event)"
								/>
								<input
									type="number"
									class="prop-input"
									step="1"
									:value="rotation.y"
									@change="onRotationChange('y', $event)"
								/>
								<input
									type="number"
									class="prop-input"
									step="1"
									:value="rotation.z"
									@change="onRotationChange('z', $event)"
								/>
							</div>
						</div>
						<div class="prop-row">
							<span class="prop-label">缩放</span>
							<div class="prop-vector3">
								<input
									type="number"
									class="prop-input"
									step="0.1"
									min="0.01"
									:value="scale.x"
									@change="onScaleChange('x', $event)"
								/>
								<input
									type="number"
									class="prop-input"
									step="0.1"
									min="0.01"
									:value="scale.y"
									@change="onScaleChange('y', $event)"
								/>
								<input
									type="number"
									class="prop-input"
									step="0.1"
									min="0.01"
									:value="scale.z"
									@change="onScaleChange('z', $event)"
								/>
							</div>
						</div>
					</div>
				</div>

				<div class="prop-section">
					<div class="prop-section-title">可见性</div>
					<div class="prop-grid">
						<label class="prop-toggle">
							<input
								type="checkbox"
								:checked="visible"
								@change="$emit('setVisibility', ($event.target as HTMLInputElement).checked)"
							/>
							<span>显示物体</span>
						</label>
						<label class="prop-toggle">
							<input
								type="checkbox"
								:checked="wireframe"
								@change="$emit('setWireframe', ($event.target as HTMLInputElement).checked)"
							/>
							<span>线框模式</span>
						</label>
					</div>
				</div>

				<div class="prop-section" v-if="materialInfo">
					<div class="prop-section-title">材质</div>
					<div class="prop-grid">
						<div class="prop-row">
							<span class="prop-label">颜色</span>
							<input
								type="color"
								class="prop-color"
								:value="materialInfo.color"
								@change="$emit('setColor', ($event.target as HTMLInputElement).value)"
							/>
						</div>
						<div class="prop-row" v-if="materialInfo.metalness !== undefined">
							<span class="prop-label">金属度</span>
							<input
								type="range"
								class="prop-slider"
								min="0"
								max="1"
								step="0.01"
								:value="materialInfo.metalness"
								@input="
									$emit('setMetalness', parseFloat(($event.target as HTMLInputElement).value))
								"
							/>
							<span class="prop-value">{{ materialInfo.metalness.toFixed(2) }}</span>
						</div>
						<div class="prop-row" v-if="materialInfo.roughness !== undefined">
							<span class="prop-label">粗糙度</span>
							<input
								type="range"
								class="prop-slider"
								min="0"
								max="1"
								step="0.01"
								:value="materialInfo.roughness"
								@input="
									$emit('setRoughness', parseFloat(($event.target as HTMLInputElement).value))
								"
							/>
							<span class="prop-value">{{ materialInfo.roughness.toFixed(2) }}</span>
						</div>
					</div>
				</div>

				<div class="prop-section">
					<div class="prop-section-title">信息</div>
					<div class="prop-info">
						<div class="info-row">
							<span class="info-label">名称</span>
							<span class="info-value">{{ selectedObject.name || '未命名' }}</span>
						</div>
						<div class="info-row">
							<span class="info-label">类型</span>
							<span class="info-value">{{ selectedObject.type }}</span>
						</div>
						<div class="info-row" v-if="triangleCount !== undefined">
							<span class="info-label">三角面</span>
							<span class="info-value">{{ formatNumber(triangleCount) }}</span>
						</div>
					</div>
				</div>
			</template>
		</div>
	</div>
</template>

<script setup lang="ts">
import * as THREE from 'three'
import { computed } from 'vue'

interface MaterialInfo {
	color: string
	metalness?: number
	roughness?: number
}

const props = defineProps<{
	selectedObject: any | null
	position: { x: number; y: number; z: number }
	rotation: { x: number; y: number; z: number }
	scale: { x: number; y: number; z: number }
	visible: boolean
	wireframe: boolean
	materialInfo?: MaterialInfo | null
	triangleCount?: number
}>()

defineEmits<{
	setPosition: [axis: 'x' | 'y' | 'z', value: number]
	setRotation: [axis: 'x' | 'y' | 'z', value: number]
	setScale: [axis: 'x' | 'y' | 'z', value: number]
	setVisibility: [visible: boolean]
	setWireframe: [wireframe: boolean]
	setColor: [color: string]
	setMetalness: [value: number]
	setRoughness: [value: number]
}>()

function onPositionChange(axis: 'x' | 'y' | 'z', event: Event) {
	const target = event.target as HTMLInputElement
	const value = parseFloat(target.value) || 0
}

function onRotationChange(axis: 'x' | 'y' | 'z', event: Event) {
	const target = event.target as HTMLInputElement
	const value = parseFloat(target.value) || 0
}

function onScaleChange(axis: 'x' | 'y' | 'z', event: Event) {
	const target = event.target as HTMLInputElement
	const value = parseFloat(target.value) || 1
}

function formatNumber(n: number): string {
	if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M'
	if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
	return String(Math.floor(n))
}
</script>

<style scoped>
.editor-properties {
	display: flex;
	flex-direction: column;
	height: 100%;
	background: rgba(10, 15, 24, 0.92);
	backdrop-filter: blur(12px);
	border-left: 1px solid var(--theme-border, #1e3a5f);
	width: 280px;
	flex-shrink: 0;
}

.properties-header {
	padding: 10px 12px;
	border-bottom: 1px solid var(--theme-border, #1e3a5f);
}

.properties-title {
	font-size: 11px;
	color: var(--theme-text-secondary, #6b8299);
	text-transform: uppercase;
	letter-spacing: 1px;
	font-weight: 600;
}

.properties-content {
	flex: 1;
	overflow-y: auto;
	padding: 8px 0;
}

.properties-empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 40px 20px;
	gap: 12px;
	color: var(--theme-text-muted, #4a5f75);
}

.empty-icon {
	opacity: 0.4;
}

.empty-text {
	font-size: 12px;
}

.prop-section {
	padding: 0 12px 12px;
	border-bottom: 1px solid rgba(30, 58, 95, 0.5);
	margin-bottom: 8px;
}

.prop-section:last-child {
	border-bottom: none;
}

.prop-section-title {
	font-size: 10px;
	color: var(--theme-accent, #5bb6ff);
	text-transform: uppercase;
	letter-spacing: 0.8px;
	font-weight: 600;
	padding: 8px 0;
}

.prop-grid {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.prop-row {
	display: flex;
	align-items: center;
	gap: 8px;
}

.prop-label {
	font-size: 11px;
	color: var(--theme-text-secondary, #8fa3b8);
	min-width: 48px;
	flex-shrink: 0;
}

.prop-vector3 {
	display: flex;
	gap: 4px;
	flex: 1;
}

.prop-input {
	flex: 1;
	width: 0;
	padding: 4px 6px;
	font-size: 11px;
	color: var(--theme-text-primary, #c5d4e3);
	background: rgba(0, 0, 0, 0.3);
	border: 1px solid var(--theme-border, #1e3a5f);
	border-radius: 0;
	font-family: 'Consolas', 'Monaco', monospace;
}

.prop-input:focus {
	outline: none;
	border-color: var(--theme-accent, #5bb6ff);
	box-shadow: 0 0 0 1px rgba(91, 182, 255, 0.3);
}

.prop-color {
	width: 32px;
	height: 24px;
	padding: 0;
	border: 1px solid var(--theme-border, #1e3a5f);
	border-radius: 0;
	background: transparent;
	cursor: pointer;
}

.prop-slider {
	flex: 1;
	accent-color: var(--theme-success, #38b98c);
	height: 4px;
}

.prop-value {
	font-size: 10px;
	color: var(--theme-text-muted, #4a5f75);
	font-family: 'Consolas', 'Monaco', monospace;
	min-width: 32px;
	text-align: right;
}

.prop-toggle {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 11px;
	color: var(--theme-text-secondary, #8fa3b8);
	cursor: pointer;
	user-select: none;
}

.prop-toggle input[type='checkbox'] {
	accent-color: var(--theme-success, #38b98c);
	width: 13px;
	height: 13px;
}

.prop-info {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.info-row {
	display: flex;
	justify-content: space-between;
	font-size: 11px;
}

.info-label {
	color: var(--theme-text-muted, #4a5f75);
}

.info-value {
	color: var(--theme-text-primary, #c5d4e3);
	font-family: 'Consolas', 'Monaco', monospace;
	max-width: 140px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
