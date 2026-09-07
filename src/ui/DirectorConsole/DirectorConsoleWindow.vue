<template>
	<div class="dc-window">
		<!-- [v1.0] 顶部工具条 -->
		<div class="dc-topbar">
			<div class="dc-topbar-title">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
					<path d="M12 2L2 7l10 5 10-5-10-5Z" />
					<path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
				</svg>
				<span>导演控制台</span>
			</div>
			<div class="dc-topbar-actions">
				<button class="dc-topbar-btn" @click="colorPickerOpen = !colorPickerOpen">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
						<circle cx="12" cy="12" r="9" />
						<path d="M12 8v8M8 12h8" />
					</svg>
					<span>{{ t('nodes.directorConsole.addCharacter') }}</span>
				</button>
				<!-- 颜色选择弹层 -->
				<div v-if="colorPickerOpen" class="dc-color-picker">
					<div class="dc-color-picker-header">
						<span>{{ t('nodes.directorConsole.selectCharacterColor') }}</span>
						<button class="dc-color-picker-close" @click="colorPickerOpen = false">×</button>
					</div>
					<div class="dc-color-picker-presets">
						<button
							v-for="c in characterColorPresets"
							:key="c"
							class="dc-color-swatch"
							:class="{ active: newCharacterColor === c }"
							:style="{ background: c }"
							@click="newCharacterColor = c"
						/>
					</div>
					<div class="dc-color-picker-custom">
						<input type="color" v-model="newCharacterColor" />
					</div>
					<button class="dc-color-picker-confirm" @click="confirmAddCharacter">
						{{ t('nodes.directorConsole.confirm') }}
					</button>
				</div>
			</div>
		</div>
		<div class="dc-window-body">
			<aside class="dc-sidebar">
				<div class="sq-container dc-sidebar-particles">
					<span
						v-for="p in sidebarParticles"
						:key="p.id"
						class="sq-particle"
						:style="p.style"
					></span>
				</div>
				<div class="dc-sidebar-section">
					<div class="dc-section-header">
						<span class="dc-section-title">{{ t('nodes.directorConsole.cameraTrackTitle') }}</span>
						<span class="dc-section-scanline" />
					</div>
					<!-- [v2.0] 摄像头操作按钮：未存在时显示「拖拽放置摄像头」，存在时显示「删除摄像头」 -->
					<button
						v-if="!hasCamera"
						type="button"
						class="dc-camera-btn"
						draggable="true"
						@dragstart="onCameraDragStart"
						@click="onAddCameraClick"
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
							<path d="M23 7l-7 5 7 5V7z" />
							<rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
						</svg>
						<span>{{ t('nodes.directorConsole.dragToAddCamera') }}</span>
					</button>
					<button class="dc-camera-btn dc-camera-remove" @click="onRemoveCamera">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
							<path
								d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
							/>
						</svg>
						<span>{{ t('nodes.directorConsole.removeCamera') }}</span>
					</button>
					<!-- [v1.0] 按视图摆放：将摄像头对齐到当前编辑器视角 -->
					<button
						v-if="hasCamera"
						class="dc-camera-btn dc-camera-align-view"
						@click="onAlignCameraToView"
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
							<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
							<circle cx="12" cy="12" r="3" />
						</svg>
						<span>{{ t('nodes.directorConsole.alignToView') }}</span>
					</button>
					<div v-if="hasCamera" class="dc-camera-info">
						<span class="dc-camera-info-label">
							{{ t('nodes.directorConsole.cameraNameLabel') }}
						</span>
						<span class="dc-camera-info-value">{{ currentCameraName }}</span>
					</div>
					<!-- [v1.0] 摄像头变换输入框：位移/旋转/缩放（与右侧工具条模式联动） -->
					<div v-if="hasCamera" class="dc-transform-section">
						<div class="dc-transform-row">
							<span class="dc-transform-label">
								{{
									transformMode === 'translate'
										? t('nodes.directorConsole.transformTranslate')
										: transformMode === 'rotate'
											? t('nodes.directorConsole.transformRotate')
											: t('nodes.directorConsole.transformScale')
								}}
							</span>
						</div>
						<div class="dc-transform-xyz">
							<div v-for="ax in ['x', 'y', 'z'] as const" :key="ax" class="dc-transform-axis">
								<span :class="['dc-axis-tag', 'dc-axis-' + ax]">{{ ax.toUpperCase() }}</span>
								<input
									type="number"
									class="dc-transform-input"
									:value="
										transformMode === 'translate'
											? currentCameraPos[ax].toFixed(2)
											: transformMode === 'rotate'
												? getCameraRotationDeg()[ax].toFixed(1)
												: cameraScale[ax].toFixed(2)
									"
									@mousedown="
										(e) =>
											onTransformDragStart(
												e,
												transformMode === 'translate'
													? 'position'
													: transformMode === 'rotate'
														? 'rotation'
														: 'scale',
												ax
											)
									"
									@change="
										(e) =>
											onTransformInput(
												transformMode === 'translate'
													? 'position'
													: transformMode === 'rotate'
														? 'rotation'
														: 'scale',
												ax,
												(e.target as HTMLInputElement).value
											)
									"
								/>
							</div>
						</div>
						<!-- FOV 输入框 -->
						<div class="dc-transform-row">
							<span class="dc-transform-label">FOV</span>
							<input
								type="number"
								class="dc-transform-input dc-fov-input"
								:value="currentCameraFov.toFixed(1)"
								min="1"
								max="179"
								@mousedown="(e) => onTransformDragStart(e, 'fov', 'x')"
								@change="(e) => onFovInput((e.target as HTMLInputElement).value)"
							/>
							<span class="dc-transform-unit">°</span>
						</div>
					</div>
				</div>
				<div class="dc-sidebar-divider" />
				<div class="dc-sidebar-section">
					<div class="dc-section-header">
						<span class="dc-section-title">{{ t('nodes.directorConsole.lightRigTitle') }}</span>
						<span class="dc-section-scanline" />
					</div>
					<div class="dc-sidebar-empty">
						{{ t('nodes.directorConsole.lightRigEmpty') }}
					</div>
				</div>
			</aside>
			<div
				class="dc-viewport"
				:class="{ 'dc-viewport-dragover': isCameraDragOver }"
				@dragover.prevent="onViewportDragOver"
				@dragenter.prevent="onViewportDragEnter"
				@dragleave.prevent="onViewportDragLeave"
				@drop.prevent="onViewportDrop"
			>
				<div class="sq-container dc-viewport-particles">
					<span
						v-for="p in viewportParticles"
						:key="p.id"
						class="sq-particle"
						:style="p.style"
					></span>
				</div>
				<div class="dc-viewport-corner dc-viewport-corner-tl" />
				<div class="dc-viewport-corner dc-viewport-corner-tr" />
				<div class="dc-viewport-corner dc-viewport-corner-bl" />
				<div class="dc-viewport-corner dc-viewport-corner-br" />
				<canvas ref="canvasRef" class="dc-viewport-canvas"></canvas>

				<!-- [v3.0] 右下角镜头锥形预览面板 -->
				<div v-if="hasCamera" class="dc-camera-preview">
					<div class="dc-camera-preview-corner dc-camera-preview-corner-tl" />
					<div class="dc-camera-preview-corner dc-camera-preview-corner-br" />
					<div class="dc-camera-preview-header">
						<span class="dc-camera-preview-title">
							{{ t('nodes.directorConsole.cameraPreviewTitle') }}
						</span>
						<span class="dc-camera-preview-scanline" />
					</div>
					<canvas ref="previewCanvasRef" class="dc-camera-preview-canvas"></canvas>
					<div class="dc-camera-preview-info">
						<span class="dc-camera-preview-info-item">
							<span class="dc-camera-preview-info-label">
								{{ t('nodes.directorConsole.cameraPreviewFov') }}
							</span>
							<span class="dc-camera-preview-info-value">{{ currentCameraFov }}°</span>
						</span>
						<span class="dc-camera-preview-info-item">
							<span class="dc-camera-preview-info-label">
								{{ t('nodes.directorConsole.cameraPreviewPos') }}
							</span>
							<span class="dc-camera-preview-info-value">{{ formatVec(currentCameraPos) }}</span>
						</span>
					</div>
				</div>

				<div class="dc-toolbar">
					<div class="dc-toolbar-corner dc-toolbar-corner-tl" />
					<div class="dc-toolbar-corner dc-toolbar-corner-br" />
					<div class="dc-toolbar-scanline" />

					<div class="dc-toolbar-group">
						<span class="dc-toolbar-label">
							{{ t('nodes.directorConsole.toolbarTransparency') }}
						</span>
						<button
							type="button"
							class="dc-tool-btn"
							:class="{ active: placeholderMode === 'transparent' }"
							@click="onTogglePlaceholder('transparent')"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
								<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 3" />
								<circle cx="12" cy="12" r="3" opacity="0.6" />
							</svg>
							<span>{{ t('nodes.directorConsole.placeholderTransparent') }}</span>
						</button>
						<button
							type="button"
							class="dc-tool-btn"
							:class="{ active: placeholderMode === 'opaque' }"
							@click="onTogglePlaceholder('opaque')"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
								<rect x="4" y="4" width="16" height="16" rx="1" />
								<circle cx="12" cy="12" r="3" />
							</svg>
							<span>{{ t('nodes.directorConsole.placeholderOpaque') }}</span>
						</button>
					</div>

					<div class="dc-toolbar-divider" />

					<div class="dc-toolbar-group">
						<span class="dc-toolbar-label">{{ t('nodes.directorConsole.toolbarLighting') }}</span>
						<button
							type="button"
							class="dc-tool-btn dc-tool-toggle"
							:class="{ active: lightingEnabled }"
							@click="onToggleLighting"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
								<path d="M9 18h6" />
								<path d="M10 22h4" />
								<path
									d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"
								/>
							</svg>
							<span>
								{{
									lightingEnabled
										? t('nodes.directorConsole.lightingOn')
										: t('nodes.directorConsole.lightingOff')
								}}
							</span>
						</button>
						<template v-if="lightingEnabled">
							<button
								v-for="lt in lightTypes"
								:key="lt"
								type="button"
								class="dc-tool-btn dc-tool-add"
								:title="lightTypeLabel(lt)"
								@click="onAddLight(lt)"
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
									<circle cx="12" cy="12" r="3" />
									<path
										d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"
									/>
								</svg>
								<span>{{ lightTypeLabel(lt) }}</span>
							</button>
						</template>
					</div>

					<div class="dc-toolbar-divider" />

					<div class="dc-toolbar-group">
						<span class="dc-toolbar-label">{{ t('nodes.directorConsole.toolbarWireframe') }}</span>
						<button
							type="button"
							class="dc-tool-btn dc-tool-toggle"
							:class="{ active: wireframeEnabled }"
							@click="onToggleWireframe"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
								<path d="M12 2 2 7l10 5 10-5-10-5z" />
								<path d="M2 17l10 5 10-5" />
								<path d="M2 12l10 5 10-5" />
							</svg>
							<span>
								{{
									wireframeEnabled
										? t('nodes.directorConsole.wireframeOn')
										: t('nodes.directorConsole.wireframeOff')
								}}
							</span>
						</button>
					</div>

					<div class="dc-toolbar-divider" />

					<div class="dc-toolbar-group">
						<span class="dc-toolbar-label">{{ t('nodes.directorConsole.toolbarTransform') }}</span>
						<button
							type="button"
							class="dc-tool-btn"
							:class="{ active: transformMode === 'translate' }"
							@click="onToggleTransformMode('translate')"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
								<path d="M12 2v20M2 12h20" />
								<path
									d="M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"
								/>
							</svg>
							<span>{{ t('nodes.directorConsole.transformTranslate') }}</span>
						</button>
						<button
							type="button"
							class="dc-tool-btn"
							:class="{ active: transformMode === 'rotate' }"
							@click="onToggleTransformMode('rotate')"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
								<path d="M3 12a9 9 0 1 0 9-9" />
								<path d="M3 12l3-3M3 12l3 3" />
								<path d="M12 3l3 3M12 3L9 6" opacity="0.5" />
							</svg>
							<span>{{ t('nodes.directorConsole.transformRotate') }}</span>
						</button>
						<button
							type="button"
							class="dc-tool-btn"
							:class="{ active: transformMode === 'scale' }"
							@click="onToggleTransformMode('scale')"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
								<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
								<rect x="9" y="9" width="6" height="6" />
							</svg>
							<span>{{ t('nodes.directorConsole.transformScale') }}</span>
						</button>
					</div>
				</div>

				<div v-if="loading" class="dc-viewport-loading">
					<div class="dc-loading-text">{{ loadingText }}</div>
				</div>
				<div v-else-if="error" class="dc-viewport-error">
					<div class="dc-error-text">{{ error }}</div>
				</div>
				<div v-else-if="!hasData" class="dc-viewport-empty">
					<div class="dc-empty-text">{{ t('nodes.directorConsole.viewportEmpty') }}</div>
				</div>
			</div>
			<!-- [v1.0] 右侧层级树 -->
			<aside class="dc-tree-panel">
				<div class="dc-tree-header">
					<span>{{ t('nodes.directorConsole.sceneObjects') }}</span>
					<span class="dc-tree-count">{{ treeNodes.length }}</span>
				</div>
				<div class="dc-tree-body" @dragover.prevent @drop="onTreeDropToRoot($event)">
					<div
						v-for="node in treeNodes"
						:key="node.id"
						class="dc-tree-node"
						:class="{ active: selectedObjectId === node.id, 'is-camera': node.isCamera }"
						:style="{ paddingLeft: node.depth * 16 + 8 + 'px' }"
						draggable="true"
						@click="onSelectTreeNode(node.id)"
						@dragstart="onTreeNodeDragStart(node.id, $event)"
						@dragover.prevent.stop="onTreeNodeDragOver(node.id, $event)"
						@drop.stop="onTreeNodeDrop(node.id, $event)"
					>
						<span class="dc-tree-icon" :style="{ color: node.isCamera ? '#60a5fa' : node.color }">
							{{ node.isCamera ? '📷' : '●' }}
						</span>
						<span class="dc-tree-name">{{ node.name }}</span>
					</div>
					<div v-if="treeNodes.length === 0" class="dc-tree-empty">
						{{ t('nodes.directorConsole.sceneObjectsEmpty') }}
					</div>
				</div>
			</aside>
		</div>
		<footer class="dc-timeline-bar">
			<div class="dc-timeline-corner dc-timeline-corner-tl" />
			<div class="dc-timeline-corner dc-timeline-corner-br" />
			<div class="dc-timeline-placeholder">
				{{ t('nodes.directorConsole.timelinePlaceholder') }}
			</div>
		</footer>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from '../../i18n'
import { useSquareParticles } from '../../composables/useSquareParticles'
import { DirectorSceneViewer } from './viewers/DirectorSceneViewer'
import { directorConsoleSave } from '../../electronBridge'
import type { DirectorConsoleScenePayload } from '../../electronBridge'
import type { WorkflowDirectorCameraTrack, WorkflowDirectorCharacter } from '../../aiworkflow/types'
import { SceneLayoutPreviewViewer } from '../WorkFlow/WorlFlowNodes/sceneLayout/SceneLayoutPreviewViewer'

defineProps<{
	title: string
}>()

const emit = defineEmits<{
	(e: 'data-loaded', payload: DirectorConsoleScenePayload): void
}>()

const { t } = useI18n()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const loading = ref(true)
const loadingText = ref('')
const error = ref('')
const hasData = ref(false)
const placeholderMode = ref<'transparent' | 'opaque'>('transparent')
const lightingEnabled = ref(false)
const wireframeEnabled = ref(false)
// [v2.0] 摄像头状态
const hasCamera = ref(false)
const currentCameraName = ref('')
const currentCameraTrack = ref<WorkflowDirectorCameraTrack | null>(null)
const isCameraDragOver = ref(false)
// [v3.0] 右下角预览面板状态
const previewCanvasRef = ref<HTMLCanvasElement | null>(null)
const currentCameraFov = ref(50)
const currentCameraPos = ref({ x: 0, y: 0, z: 0 })
const currentCameraTarget = ref({ x: 0, y: 0, z: 0 })
const currentCameraRoll = ref(0)
// [v1.0] 变换输入框状态（与右侧工具条模式联动）
const cameraScale = ref({ x: 1, y: 1, z: 1 })
// [v3.0] TransformControls 模式（translate=移动 / rotate=旋转 / scale=缩放）
const transformMode = ref<'translate' | 'rotate' | 'scale'>('translate')
const CAMERA_DRAG_MIME = 'application/x-director-camera'
// [v1.0] 角色状态
const characters = ref<WorkflowDirectorCharacter[]>([])
const selectedObjectId = ref('')
const colorPickerOpen = ref(false)
const newCharacterColor = ref('#ff6b6b')
const characterColorPresets = [
	'#ff6b6b',
	'#4ecdc4',
	'#ffe66d',
	'#a8e6cf',
	'#c7a8ff',
	'#ffa8a8',
	'#74c0fc',
	'#8ce99a'
]
const lightTypes: ('point' | 'directional' | 'spot' | 'hemisphere')[] = [
	'point',
	'directional',
	'spot',
	'hemisphere'
]

function lightTypeLabel(type: string): string {
	const key = 'nodes.directorConsole.lightType_' + type
	const val = t(key)
	return val === key ? type : val
}
let sceneViewer: DirectorSceneViewer | null = null
let currentPayload: DirectorConsoleScenePayload | null = null

const { particles: viewportParticles } = useSquareParticles({
	count: 8,
	baseOpacity: 0.15,
	minSize: 1,
	maxSize: 3,
	seed: 73121,
	minDuration: 12,
	maxDuration: 20
})

const { particles: sidebarParticles } = useSquareParticles({
	count: 6,
	baseOpacity: 0.18,
	minSize: 1,
	maxSize: 2,
	seed: 41207,
	minDuration: 10,
	maxDuration: 16
})

onMounted(() => {
	if (canvasRef.value) {
		sceneViewer = new DirectorSceneViewer(canvasRef.value, {
			onError: (msg) => {
				set_error(msg)
			},
			onReady: () => {
				loading.value = false
			},
			onCameraTrackChange: (tracks) => {
				syncCameraStateFromTracks(tracks)
				emitCameraTrackSave(tracks)
			},
			onSelectionChange: (itemId) => {
				// 选中对象后默认进入「移动」模式
				transformMode.value = 'translate'
				sceneViewer?.setTransformMode('translate')
				selectedObjectId.value = itemId
			},
			onCameraScaleChange: (scale) => {
				cameraScale.value = { ...scale }
			},
			onCharactersChange: (list) => {
				characters.value = [...list]
				emitCharactersSave(list)
			}
		})
	}
	// [v3.0] hasCamera 变为 true 时,等待 DOM 渲染后设置预览 canvas
	watch(hasCamera, (val) => {
		if (val) {
			nextTick(() => {
				if (previewCanvasRef.value && sceneViewer) {
					sceneViewer.setPreviewCanvas(previewCanvasRef.value)
				}
			})
		}
	})
})

function applyScenePayload(payload: DirectorConsoleScenePayload) {
	currentPayload = payload
	// [v2.0] 同步摄像头状态
	const tracks = Array.isArray(payload?.cameraTracks)
		? (payload.cameraTracks as WorkflowDirectorCameraTrack[])
		: []
	syncCameraStateFromTracks(tracks)
	// [v1.0] 同步角色列表
	if (Array.isArray(payload?.characters)) {
		characters.value = [...(payload.characters as WorkflowDirectorCharacter[])]
	}
	const layoutCount = Array.isArray(payload?.layoutItems) ? payload.layoutItems.length : 0
	if (layoutCount === 0) {
		loading.value = false
		hasData.value = false
		return
	}
	loading.value = true
	loadingText.value = t('nodes.directorConsole.viewportLoading')
	hasData.value = true
	sceneViewer
		?.loadScene(payload, { transparent: placeholderMode.value === 'transparent' })
		.then(() => {
			loading.value = false
		})
		.catch((err) => {
			set_error(t('nodes.directorConsole.viewportLoadFailed') + ': ' + String(err))
		})
	emit('data-loaded', payload)
}

/** [v2.0] 从轨道列表同步摄像头 UI 状态 */
function syncCameraStateFromTracks(tracks: WorkflowDirectorCameraTrack[]) {
	if (tracks.length > 0) {
		currentCameraTrack.value = tracks[0]
		hasCamera.value = true
		currentCameraName.value = tracks[0].name || 'Camera 01'
		// [v3.0] 同步预览面板状态
		const kf = tracks[0].keyframes?.[0]
		if (kf) {
			currentCameraFov.value = Number(kf.fov) || 50
			currentCameraPos.value = { ...kf.position }
			currentCameraTarget.value = { ...kf.target }
			currentCameraRoll.value = Number(kf.roll) || 0
		}
	} else {
		currentCameraTrack.value = null
		hasCamera.value = false
		currentCameraName.value = ''
		currentCameraRoll.value = 0
	}
}

/** [v3.0] 格式化向量显示 */
function formatVec(v: { x: number; y: number; z: number }): string {
	const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '0.0')
	return `${fmt(v.x)}, ${fmt(v.y)}, ${fmt(v.z)}`
}

// ===== [v1.0] 变换输入框拖拽步进 =====
type DragAxis = 'x' | 'y' | 'z'
type DragKind = 'position' | 'rotation' | 'scale' | 'fov'
const dragState = {
	active: false,
	dragging: false,
	kind: '' as DragKind | '',
	axis: '' as DragAxis | '',
	startX: 0,
	startValue: 0
}

function getDragStep(kind: DragKind): number {
	switch (kind) {
		case 'position':
			return 0.05
		case 'rotation':
			return 0.5
		case 'scale':
			return 0.01
		case 'fov':
			return 0.5
	}
}

function onTransformDragStart(event: MouseEvent, kind: DragKind, axis: DragAxis) {
	// 不调用 preventDefault，让输入框可以获得焦点进行手动输入
	dragState.active = true
	dragState.dragging = false
	dragState.kind = kind
	dragState.axis = axis
	dragState.startX = event.clientX
	if (kind === 'position') dragState.startValue = currentCameraPos.value[axis]
	else if (kind === 'rotation') {
		dragState.startValue = getCameraRotationDeg()[axis]
	} else if (kind === 'scale') dragState.startValue = cameraScale.value[axis]
	else if (kind === 'fov') dragState.startValue = currentCameraFov.value
	window.addEventListener('mousemove', onTransformDragMove)
	window.addEventListener('mouseup', onTransformDragEnd)
}

const DRAG_THRESHOLD = 3

function onTransformDragMove(event: MouseEvent) {
	if (!dragState.active) return
	const delta = event.clientX - dragState.startX
	// 移动超过阈值才进入拖拽模式，避免误触
	if (!dragState.dragging && Math.abs(delta) < DRAG_THRESHOLD) return
	if (!dragState.dragging) {
		dragState.dragging = true
		// 进入拖拽后阻止文本选中
		event.preventDefault()
	}
	const step = getDragStep(dragState.kind as DragKind)
	const newValue = dragState.startValue + delta * step
	const axis = dragState.axis as DragAxis
	if (dragState.kind === 'position') {
		currentCameraPos.value[axis] = parseFloat(newValue.toFixed(3))
		sceneViewer?.updateCameraPosition(axis, currentCameraPos.value[axis])
	} else if (dragState.kind === 'rotation') {
		sceneViewer?.updateCameraRotation(axis, parseFloat(newValue.toFixed(2)))
	} else if (dragState.kind === 'scale') {
		const v = Math.max(0.01, parseFloat(newValue.toFixed(3)))
		cameraScale.value[axis] = v
		sceneViewer?.setCameraActorScale(axis, v)
	} else if (dragState.kind === 'fov') {
		const v = Math.max(1, Math.min(179, parseFloat(newValue.toFixed(1))))
		currentCameraFov.value = v
		sceneViewer?.updateCameraFov(v)
	}
}

function onTransformDragEnd() {
	dragState.active = false
	dragState.dragging = false
	dragState.kind = ''
	dragState.axis = ''
	window.removeEventListener('mousemove', onTransformDragMove)
	window.removeEventListener('mouseup', onTransformDragEnd)
}

/** [v1.0] 输入框直接输入数值 */
function onTransformInput(kind: DragKind, axis: DragAxis, raw: string) {
	const value = parseFloat(raw)
	if (Number.isNaN(value)) return
	if (kind === 'position') {
		currentCameraPos.value[axis] = value
		sceneViewer?.updateCameraPosition(axis, value)
	} else if (kind === 'rotation') {
		sceneViewer?.updateCameraRotation(axis, value)
	} else if (kind === 'scale') {
		const v = Math.max(0.01, value)
		cameraScale.value[axis] = v
		sceneViewer?.setCameraActorScale(axis, v)
	}
}

function onFovInput(raw: string) {
	const value = parseFloat(raw)
	if (Number.isNaN(value)) return
	const v = Math.max(1, Math.min(179, value))
	currentCameraFov.value = v
	sceneViewer?.updateCameraFov(v)
}

/** [v1.0] 计算当前旋转角度（从 position→target 方向推导 yaw/pitch） */
function getCameraRotationDeg(): { x: number; y: number; z: number } {
	const pos = currentCameraPos.value
	const tgt = currentCameraTarget.value
	const dx = tgt.x - pos.x
	const dy = tgt.y - pos.y
	const dz = tgt.z - pos.z
	const dist = Math.max(0.001, Math.sqrt(dx * dx + dy * dy + dz * dz))
	const yaw = (Math.atan2(dx / dist, dz / dist) * 180) / Math.PI
	const pitch =
		(Math.atan2(dy / dist, Math.sqrt((dx / dist) ** 2 + (dz / dist) ** 2)) * 180) / Math.PI
	const roll = currentCameraRoll.value
	return { x: pitch, y: yaw, z: roll }
}

/** [v2.0] 通过 directorConsoleSave 将摄像头变更回流到节点 settings */
function emitCameraTrackSave(tracks: WorkflowDirectorCameraTrack[]) {
	if (!currentPayload?.nodeId) return
	const activeCameraTrackId = tracks.length > 0 ? tracks[0].id : undefined
	directorConsoleSave({
		nodeId: currentPayload.nodeId,
		patch: {
			cameraTracks: tracks,
			activeCameraTrackId
		}
	})
}

// ===== [v1.0] 角色与层级树 =====

const treeNodes = computed(() => {
	type TreeNode = { id: string; name: string; color: string; depth: number; isCamera: boolean }
	const nodes: TreeNode[] = []
	const byParent = new Map<string | null, WorkflowDirectorCharacter[]>()
	for (const c of characters.value) {
		const key = c.parentId || null
		if (!byParent.has(key)) byParent.set(key, [])
		byParent.get(key)!.push(c)
	}
	const walk = (parentId: string | null, depth: number) => {
		const children = byParent.get(parentId) || []
		for (const c of children) {
			nodes.push({ id: c.id, name: c.name, color: c.color, depth, isCamera: false })
			walk(c.id, depth + 1)
		}
	}
	walk(null, 0)
	// 摄像头作为独立根节点（v1.0 不支持拖拽为子级）
	if (hasCamera.value) {
		nodes.push({
			id: SceneLayoutPreviewViewer.CAMERA_SELECTION_ID,
			name: t('nodes.directorConsole.cameraTrackTitle'),
			color: '#60a5fa',
			depth: 0,
			isCamera: true
		})
	}
	return nodes
})

function emitCharactersSave(list: WorkflowDirectorCharacter[]) {
	if (!currentPayload?.nodeId) return
	directorConsoleSave({
		nodeId: currentPayload.nodeId,
		patch: { characters: list }
	})
}

function confirmAddCharacter() {
	if (!sceneViewer) return
	sceneViewer.addCharacter(newCharacterColor.value)
	colorPickerOpen.value = false
}

function onSelectTreeNode(id: string) {
	sceneViewer?.selectObject(id)
}

let draggingNodeId = ''
function onTreeNodeDragStart(id: string, event: DragEvent) {
	draggingNodeId = id
	if (event.dataTransfer) {
		event.dataTransfer.effectAllowed = 'move'
		event.dataTransfer.setData('text/plain', id)
	}
}
function onTreeNodeDragOver(_id: string, _event: DragEvent) {
	/* prevent 已在模板中处理 */
}
function onTreeNodeDrop(targetId: string, _event: DragEvent) {
	if (!draggingNodeId || draggingNodeId === targetId) return
	// 摄像头不可作为子级（v1.0 限制）
	if (targetId === SceneLayoutPreviewViewer.CAMERA_SELECTION_ID) return
	if (draggingNodeId === SceneLayoutPreviewViewer.CAMERA_SELECTION_ID) return
	sceneViewer?.setCharacterParent(draggingNodeId, targetId)
	draggingNodeId = ''
}
function onTreeDropToRoot(_event: DragEvent) {
	if (!draggingNodeId) return
	if (draggingNodeId === SceneLayoutPreviewViewer.CAMERA_SELECTION_ID) return
	sceneViewer?.setCharacterParent(draggingNodeId, null)
	draggingNodeId = ''
}

/** [v2.0] 拖拽开始：设置自定义 MIME，供 viewport drop 时识别 */
function onCameraDragStart(event: DragEvent) {
	if (!event.dataTransfer) return
	event.dataTransfer.effectAllowed = 'copyMove'
	try {
		event.dataTransfer.setData(CAMERA_DRAG_MIME, 'director-camera')
	} catch {
		// 某些环境对自定义 MIME 不友好，降级用 text/plain
		event.dataTransfer.setData('text/plain', 'director-camera')
	}
}

/** [v2.0] 点击按钮降级添加：放置在当前镜头目标点附近 */
async function onAddCameraClick() {
	if (!sceneViewer || hasCamera.value) return
	const ok = await sceneViewer.addCameraAtCenter()
	if (!ok) {
		set_error(t('nodes.directorConsole.cameraAlreadyExists'))
	}
}

/** [v2.0] 删除场景中唯一摄像头 */
async function onRemoveCamera() {
	if (!sceneViewer || !hasCamera.value) return
	await sceneViewer.removeCamera()
}

function onAlignCameraToView() {
	if (!sceneViewer || !hasCamera.value) return
	sceneViewer.alignCameraToView()
}

function onViewportDragOver(event: DragEvent) {
	if (hasCamera.value) return
	if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function onViewportDragEnter(event: DragEvent) {
	if (hasCamera.value) return
	// 仅识别来自摄像头按钮的拖拽（兼容自定义 MIME 与 text/plain 降级）
	const types = event.dataTransfer?.types ? Array.from(event.dataTransfer.types) : []
	if (types.includes(CAMERA_DRAG_MIME) || types.includes('text/plain')) {
		isCameraDragOver.value = true
	}
}

function onViewportDragLeave(event: DragEvent) {
	// dragleave 在子元素之间切换时也会触发，简单清零即可（dragover 会重新置位）
	void event
	isCameraDragOver.value = false
}

async function onViewportDrop(event: DragEvent) {
	isCameraDragOver.value = false
	if (!sceneViewer || hasCamera.value) return
	const sx = event.clientX
	const sy = event.clientY
	await sceneViewer.addCameraAt(sx, sy)
}

function set_loading(msg: string) {
	loading.value = true
	loadingText.value = msg
}

function set_error(msg: string) {
	loading.value = false
	error.value = msg
}

function onTogglePlaceholder(mode: 'transparent' | 'opaque') {
	if (placeholderMode.value === mode) return
	placeholderMode.value = mode
	sceneViewer?.setPlaceholderOpacity(mode)
}

function onToggleLighting() {
	lightingEnabled.value = sceneViewer?.setLightingEnabled(!lightingEnabled.value) ?? false
}

function onAddLight(type: 'point' | 'directional' | 'spot' | 'hemisphere') {
	sceneViewer?.addDirectorLight(type)
}

function onToggleWireframe() {
	wireframeEnabled.value = sceneViewer?.setWireframeEnabled(!wireframeEnabled.value) ?? false
}

function onToggleTransformMode(mode: 'translate' | 'rotate' | 'scale') {
	if (transformMode.value === mode) return
	transformMode.value = mode
	sceneViewer?.setTransformMode(mode)
	// 切换到缩放模式时，同步摄像头 Actor 当前缩放值
	if (mode === 'scale' && sceneViewer) {
		cameraScale.value = sceneViewer.getCameraActorScale()
	}
}

onBeforeUnmount(() => {
	sceneViewer?.dispose()
	sceneViewer = null
	currentPayload = null
	currentCameraTrack.value = null
	hasCamera.value = false
	isCameraDragOver.value = false
})

defineExpose({
	canvasRef,
	applyScenePayload,
	set_loading,
	set_error
})
</script>

<style scoped>
.dc-window {
	display: flex;
	flex-direction: column;
	width: 100%;
	height: 100%;
	overflow: hidden;
	background: var(--wf-page-bg, #0a0f14);
	color: var(--wf-text, #c5d4e3);
	font-family: 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif;
	position: absolute;
	inset: 0;
}

.dc-window-body {
	flex: 1;
	display: flex;
	overflow: hidden;
	min-height: 0;
}

/* ===== [v1.0] 顶部工具条 ===== */
.dc-topbar {
	height: 48px;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0 16px;
	border-bottom: 1px solid
		color-mix(in srgb, var(--wf-primary, #27b99c) 22%, var(--wf-border-subtle, transparent));
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 5%, var(--wf-page-bg, #0a0f14));
}
.dc-topbar-title {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 14px;
	font-weight: 600;
	color: var(--wf-text, #c5d4e3);
}
.dc-topbar-title svg {
	width: 18px;
	height: 18px;
	color: var(--wf-primary, #27b99c);
}
.dc-topbar-actions {
	position: relative;
	display: flex;
	align-items: center;
	gap: 8px;
}
.dc-topbar-btn {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 6px 12px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 40%, transparent);
	border-radius: 6px;
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 10%, transparent);
	color: var(--wf-text, #c5d4e3);
	font-size: 12px;
	cursor: pointer;
	transition: all 0.15s;
}
.dc-topbar-btn svg {
	width: 14px;
	height: 14px;
	color: var(--wf-primary, #27b99c);
}
.dc-topbar-btn:hover {
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 20%, transparent);
}
.dc-color-picker {
	position: absolute;
	top: 42px;
	right: 0;
	z-index: 100;
	width: 220px;
	padding: 12px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 30%, transparent);
	border-radius: 8px;
	background: var(--wf-page-bg, #0a0f14);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}
.dc-color-picker-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 10px;
	font-size: 12px;
	color: var(--wf-text, #c5d4e3);
}
.dc-color-picker-close {
	background: none;
	border: none;
	color: var(--wf-text, #c5d4e3);
	font-size: 18px;
	cursor: pointer;
	line-height: 1;
}
.dc-color-picker-presets {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 6px;
	margin-bottom: 10px;
}
.dc-color-swatch {
	width: 100%;
	aspect-ratio: 1;
	border: 2px solid transparent;
	border-radius: 4px;
	cursor: pointer;
	padding: 0;
}
.dc-color-swatch.active {
	border-color: #fff;
	box-shadow: 0 0 0 1px var(--wf-primary, #27b99c);
}
.dc-color-picker-custom {
	display: flex;
	justify-content: center;
	margin-bottom: 10px;
}
.dc-color-picker-custom input[type='color'] {
	width: 100%;
	height: 32px;
	border: none;
	border-radius: 4px;
	cursor: pointer;
	background: transparent;
}
.dc-color-picker-confirm {
	width: 100%;
	padding: 6px;
	border: none;
	border-radius: 4px;
	background: var(--wf-primary, #27b99c);
	color: #fff;
	font-size: 12px;
	cursor: pointer;
}

/* ===== [v1.0] 右侧层级树 ===== */
.dc-tree-panel {
	width: 200px;
	flex-shrink: 0;
	display: flex;
	flex-direction: column;
	border-left: 1px solid
		color-mix(in srgb, var(--wf-primary, #27b99c) 22%, var(--wf-border-subtle, transparent));
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 4%, var(--wf-page-bg, #0a0f14));
}
.dc-tree-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 12px;
	font-size: 12px;
	font-weight: 600;
	color: var(--wf-text, #c5d4e3);
	border-bottom: 1px solid
		color-mix(in srgb, var(--wf-primary, #27b99c) 15%, var(--wf-border-subtle, transparent));
}
.dc-tree-count {
	font-size: 11px;
	color: var(--wf-text-muted, #64748b);
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 15%, transparent);
	padding: 1px 6px;
	border-radius: 8px;
}
.dc-tree-body {
	flex: 1;
	overflow-y: auto;
	padding: 4px 0;
}
.dc-tree-node {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 6px 8px;
	cursor: pointer;
	font-size: 12px;
	color: var(--wf-text, #c5d4e3);
	border-left: 2px solid transparent;
	transition: background 0.12s;
}
.dc-tree-node:hover {
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 8%, transparent);
}
.dc-tree-node.active {
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 15%, transparent);
	border-left-color: var(--wf-primary, #27b99c);
}
.dc-tree-node.is-camera {
	color: #60a5fa;
}
.dc-tree-icon {
	font-size: 10px;
	flex-shrink: 0;
}
.dc-tree-name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.dc-tree-empty {
	padding: 16px 12px;
	font-size: 11px;
	color: var(--wf-text-muted, #64748b);
	text-align: center;
}

.dc-sidebar {
	width: 300px;
	flex-shrink: 0;
	display: flex;
	flex-direction: column;
	position: relative;
	border-right: 1px solid
		color-mix(in srgb, var(--wf-primary, #27b99c) 22%, var(--wf-border-subtle, transparent));
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 4%, var(--wf-page-bg, #0a0f14));
	backdrop-filter: blur(10px) saturate(140%);
	-webkit-backdrop-filter: blur(10px) saturate(140%);
	overflow-y: auto;
}

.dc-sidebar-particles {
	position: absolute;
	inset: 0;
	pointer-events: none;
	z-index: 0;
	opacity: 0.5;
}

.dc-sidebar-section {
	padding: 14px 12px;
	position: relative;
	z-index: 1;
}

.dc-sidebar-divider {
	height: 1px;
	background: linear-gradient(
		90deg,
		transparent,
		color-mix(in srgb, var(--wf-primary, #27b99c) 24%, transparent),
		transparent
	);
	margin: 0 12px;
}

.dc-section-header {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 10px;
	position: relative;
}

.dc-section-title {
	font-size: 11px;
	color: var(--wf-primary, #27b99c);
	letter-spacing: 1.2px;
	text-transform: uppercase;
	font-weight: 600;
}

.dc-section-scanline {
	flex: 1;
	height: 1px;
	background: linear-gradient(
		90deg,
		color-mix(in srgb, var(--wf-primary, #27b99c) 40%, transparent),
		transparent
	);
	opacity: 0.6;
}

.dc-sidebar-empty {
	font-size: 12px;
	color: var(--wf-text-muted, #8899aa);
	padding: 10px;
	border: 1px dashed
		color-mix(in srgb, var(--wf-primary, #27b99c) 30%, var(--wf-border-subtle, transparent));
	text-align: center;
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 3%, transparent);
}

/* [v2.0] 摄像头操作按钮 */
.dc-camera-btn {
	display: flex;
	align-items: center;
	gap: 6px;
	width: 100%;
	padding: 10px 12px;
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 6%, transparent);
	border: 1px solid
		color-mix(in srgb, var(--wf-primary, #27b99c) 35%, var(--wf-border-subtle, transparent));
	color: var(--wf-text, #c5d4e3);
	font-size: 11px;
	font-weight: 600;
	letter-spacing: 0.5px;
	cursor: pointer;
	font-family: inherit;
	transition: all 180ms cubic-bezier(0.22, 0.61, 0.36, 1);
	position: relative;
	text-align: left;
}

.dc-camera-btn svg {
	width: 14px;
	height: 14px;
	flex-shrink: 0;
	color: var(--wf-primary, #27b99c);
}

.dc-camera-btn:hover {
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 12%, transparent);
	border-color: color-mix(in srgb, var(--wf-primary, #27b99c) 55%, transparent);
	box-shadow: inset 0 0 12px color-mix(in srgb, var(--wf-primary, #27b99c) 18%, transparent);
}

.dc-camera-btn:active {
	transform: translateY(1px);
}

.dc-camera-btn[draggable='true'] {
	-webkit-user-drag: element;
	user-select: none;
}

.dc-camera-remove {
	border-color: color-mix(in srgb, #ff6b6b 40%, var(--wf-border-subtle, transparent));
	color: var(--wf-text, #c5d4e3);
}

.dc-camera-remove svg {
	color: #ff6b6b;
}

.dc-camera-remove:hover {
	background: color-mix(in srgb, #ff6b6b 10%, transparent);
	border-color: color-mix(in srgb, #ff6b6b 60%, transparent);
	box-shadow: inset 0 0 12px color-mix(in srgb, #ff6b6b 18%, transparent);
}

.dc-camera-align-view {
	border-color: color-mix(in srgb, #4ecdc4 40%, var(--wf-border-subtle, transparent));
	color: var(--wf-text, #c5d4e3);
}

.dc-camera-align-view svg {
	color: #4ecdc4;
}

.dc-camera-align-view:hover {
	background: color-mix(in srgb, #4ecdc4 10%, transparent);
	border-color: color-mix(in srgb, #4ecdc4 60%, transparent);
	box-shadow: inset 0 0 12px color-mix(in srgb, #4ecdc4 18%, transparent);
}

.dc-camera-info {
	display: flex;
	align-items: center;
	gap: 6px;
	margin-top: 8px;
	padding: 6px 8px;
	font-size: 10px;
	color: var(--wf-text-muted, #8899aa);
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 4%, transparent);
	border-left: 2px solid color-mix(in srgb, var(--wf-primary, #27b99c) 45%, transparent);
}

.dc-camera-info-label {
	letter-spacing: 0.5px;
	text-transform: uppercase;
	font-weight: 600;
	opacity: 0.7;
}

.dc-camera-info-value {
	color: var(--wf-text, #c5d4e3);
	font-weight: 500;
}

/* [v1.0] 摄像头变换输入框 */
.dc-transform-section {
	margin-top: 8px;
	padding: 8px;
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 4%, transparent);
	border-left: 2px solid color-mix(in srgb, var(--wf-primary, #27b99c) 45%, transparent);
}

.dc-transform-row {
	display: flex;
	align-items: center;
	gap: 6px;
	margin-bottom: 6px;
}

.dc-transform-row:last-child {
	margin-bottom: 0;
}

.dc-transform-label {
	font-size: 10px;
	font-weight: 600;
	letter-spacing: 0.5px;
	text-transform: uppercase;
	color: var(--wf-text-muted, #8899aa);
	min-width: 36px;
}

.dc-transform-xyz {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin-bottom: 8px;
}

.dc-transform-axis {
	display: flex;
	align-items: center;
	gap: 6px;
}

.dc-axis-tag {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 18px;
	height: 18px;
	font-size: 10px;
	font-weight: 700;
	border-radius: 3px;
	color: #fff;
	flex-shrink: 0;
}

.dc-axis-x {
	background: #e05555;
}
.dc-axis-y {
	background: #55b85a;
}
.dc-axis-z {
	background: #4a8fe0;
}

.dc-transform-input {
	flex: 1;
	min-width: 0;
	height: 22px;
	padding: 0 6px;
	font-size: 11px;
	font-family: inherit;
	color: var(--wf-text, #c5d4e3);
	background: rgba(0, 0, 0, 0.35);
	border: 1px solid rgba(255, 255, 255, 0.12);
	border-radius: 3px;
	outline: none;
	cursor: ew-resize;
	transition: border-color 0.15s;
}

.dc-transform-input:focus {
	border-color: color-mix(in srgb, var(--wf-primary, #27b99c) 70%, transparent);
	cursor: text;
}

.dc-transform-input::-webkit-inner-spin-button,
.dc-transform-input::-webkit-outer-spin-button {
	-webkit-appearance: none;
	margin: 0;
}

.dc-fov-input {
	max-width: 70px;
}

.dc-transform-unit {
	font-size: 11px;
	color: var(--wf-text-muted, #8899aa);
}

.dc-viewport {
	flex: 1;
	position: relative;
	overflow: hidden;
	background: #484848;
	min-width: 0;
}

/* [v2.0] 拖拽放置摄像头时 viewport 视觉反馈 */
.dc-viewport-dragover::after {
	content: '';
	position: absolute;
	inset: 0;
	pointer-events: none;
	z-index: 8;
	border: 2px dashed color-mix(in srgb, var(--wf-primary, #27b99c) 60%, transparent);
	box-shadow: inset 0 0 32px color-mix(in srgb, var(--wf-primary, #27b99c) 18%, transparent);
}

/* [v3.0] 右下角镜头锥形预览面板 */
.dc-camera-preview {
	position: absolute;
	right: 16px;
	bottom: 16px;
	width: 240px;
	height: 160px;
	background: var(--wf-surface-glass, rgba(21, 24, 28, 0.82));
	border: 1px solid var(--wf-border-subtle, rgba(255, 255, 255, 0.04));
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
	z-index: 10;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.dc-camera-preview-canvas {
	flex: 1;
	width: 100%;
	background: #484848;
	display: block;
}

.dc-camera-preview-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 4px 8px;
	font-size: 10px;
	color: var(--wf-text-muted, #8899aa);
	border-bottom: 1px solid var(--wf-border-subtle, rgba(255, 255, 255, 0.04));
	letter-spacing: 0.5px;
	text-transform: uppercase;
	font-weight: 600;
}

.dc-camera-preview-scanline {
	display: inline-block;
	width: 40px;
	height: 1px;
	background: linear-gradient(
		90deg,
		transparent,
		color-mix(in srgb, var(--wf-primary, #27b99c) 70%, transparent),
		transparent
	);
}

.dc-camera-preview-info {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	padding: 4px 8px;
	font-size: 10px;
	color: var(--wf-text-muted, #8899aa);
	font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
	border-top: 1px solid var(--wf-border-subtle, rgba(255, 255, 255, 0.04));
}

.dc-camera-preview-info-item {
	display: flex;
	align-items: center;
	gap: 4px;
	min-width: 0;
}

.dc-camera-preview-info-label {
	opacity: 0.7;
	flex-shrink: 0;
}

.dc-camera-preview-info-value {
	color: var(--wf-text, #c5d4e3);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

/* L 边角装饰 */
.dc-camera-preview-corner {
	position: absolute;
	width: 10px;
	height: 10px;
	border-color: color-mix(in srgb, var(--wf-primary, #27b99c) 60%, transparent);
	border-style: solid;
	border-width: 0;
	pointer-events: none;
}

.dc-camera-preview-corner-tl {
	top: -1px;
	left: -1px;
	border-top-width: 1px;
	border-left-width: 1px;
}

.dc-camera-preview-corner-br {
	bottom: -1px;
	right: -1px;
	border-bottom-width: 1px;
	border-right-width: 1px;
}

.dc-viewport-particles {
	position: absolute;
	inset: 0;
	pointer-events: none;
	z-index: 2;
}

.dc-viewport-corner {
	position: absolute;
	width: 20px;
	height: 20px;
	border: 2px solid color-mix(in srgb, var(--wf-primary, #27b99c) 45%, transparent);
	box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #27b99c) 18%, transparent);
	pointer-events: none;
	z-index: 3;
}

.dc-viewport-corner-tl {
	top: 12px;
	left: 12px;
	border-right: none;
	border-bottom: none;
}
.dc-viewport-corner-tr {
	top: 12px;
	right: 12px;
	border-left: none;
	border-bottom: none;
}
.dc-viewport-corner-bl {
	bottom: 12px;
	left: 12px;
	border-right: none;
	border-top: none;
}
.dc-viewport-corner-br {
	bottom: 12px;
	right: 12px;
	border-left: none;
	border-top: none;
}

.dc-viewport-canvas {
	width: 100%;
	height: 100%;
	display: block;
	position: absolute;
	inset: 0;
	z-index: 1;
}

.dc-toolbar {
	position: absolute;
	top: 12px;
	left: 50%;
	transform: translateX(-50%);
	z-index: 10;
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 6px 10px;
	background: var(--wf-surface-glass, rgba(21, 24, 28, 0.82));
	backdrop-filter: blur(14px) saturate(150%);
	-webkit-backdrop-filter: blur(14px) saturate(150%);
	border: 1px solid
		color-mix(in srgb, var(--wf-primary, #27b99c) 35%, var(--wf-border-subtle, transparent));
	box-shadow:
		0 6px 24px color-mix(in srgb, var(--wf-shadow, rgba(0, 0, 0, 0.5)) 55%, transparent),
		0 0 18px color-mix(in srgb, var(--wf-primary, #27b99c) 12%, transparent),
		inset 0 1px 0 color-mix(in srgb, #fff 6%, transparent);
	overflow: hidden;
}

.dc-toolbar-corner {
	position: absolute;
	width: 7px;
	height: 7px;
	border: 1.5px solid var(--wf-primary, #27b99c);
	box-shadow: 0 0 5px color-mix(in srgb, var(--wf-primary, #27b99c) 35%, transparent);
	pointer-events: none;
	z-index: 2;
}

.dc-toolbar-corner-tl {
	top: 3px;
	left: 3px;
	border-right: none;
	border-bottom: none;
}

.dc-toolbar-corner-br {
	bottom: 3px;
	right: 3px;
	border-left: none;
	border-top: none;
}

.dc-toolbar-scanline {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 1px;
	background: linear-gradient(
		90deg,
		transparent,
		color-mix(in srgb, var(--wf-primary, #27b99c) 60%, transparent) 50%,
		transparent
	);
	box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #27b99c) 40%, transparent);
	animation: dc-toolbar-scan 4s ease-in-out infinite;
	pointer-events: none;
	z-index: 1;
	opacity: 0.6;
}

@keyframes dc-toolbar-scan {
	0%,
	100% {
		opacity: 0.35;
	}
	50% {
		opacity: 0.9;
	}
}

.dc-toolbar-group {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	position: relative;
	z-index: 2;
}

.dc-toolbar-label {
	font-size: 9px;
	color: var(--wf-primary, #27b99c);
	letter-spacing: 0.8px;
	text-transform: uppercase;
	font-weight: 600;
	opacity: 0.7;
	margin-right: 2px;
	white-space: nowrap;
}

.dc-toolbar-divider {
	width: 1px;
	height: 18px;
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 25%, transparent);
	margin: 0 4px;
}

.dc-tool-btn {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 4px 8px;
	background: transparent;
	border: 1px solid transparent;
	color: var(--wf-text-muted, #8899aa);
	font-size: 9px;
	font-weight: 600;
	letter-spacing: 0.5px;
	text-transform: uppercase;
	cursor: pointer;
	font-family: inherit;
	transition: all 180ms cubic-bezier(0.22, 0.61, 0.36, 1);
	white-space: nowrap;
}

.dc-tool-btn svg {
	width: 13px;
	height: 13px;
	flex-shrink: 0;
}

.dc-tool-btn:hover {
	color: var(--wf-primary, #27b99c);
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 8%, transparent);
}

.dc-tool-btn.active {
	color: var(--wf-primary, #27b99c);
	border-color: color-mix(in srgb, var(--wf-primary, #27b99c) 45%, transparent);
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 12%, transparent);
	box-shadow: inset 0 0 10px color-mix(in srgb, var(--wf-primary, #27b99c) 18%, transparent);
}

.dc-tool-add {
	font-size: 8px;
	padding: 4px 6px;
}

.dc-tool-add:hover {
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 14%, transparent);
}

.dc-viewport-loading,
.dc-viewport-error,
.dc-viewport-empty {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 5;
	background: color-mix(in srgb, var(--wf-page-bg, #0a0f14) 55%, transparent);
	backdrop-filter: blur(4px);
	-webkit-backdrop-filter: blur(4px);
}

.dc-loading-text,
.dc-error-text,
.dc-empty-text {
	font-size: 13px;
	color: var(--wf-text, #c5d4e3);
	letter-spacing: 0.5px;
	padding: 8px 16px;
	background: var(--wf-surface-glass, rgba(21, 24, 28, 0.82));
	border: 1px solid
		color-mix(in srgb, var(--wf-primary, #27b99c) 25%, var(--wf-border-subtle, transparent));
}

.dc-error-text {
	color: #ff6b6b;
	border-color: color-mix(in srgb, #ff6b6b 45%, transparent);
}

.dc-timeline-bar {
	height: 40px;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	padding: 0 12px;
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 4%, var(--wf-page-bg, #0a0f14));
	backdrop-filter: blur(10px) saturate(140%);
	-webkit-backdrop-filter: blur(10px) saturate(140%);
	border-top: 1px solid
		color-mix(in srgb, var(--wf-primary, #27b99c) 22%, var(--wf-border-subtle, transparent));
	position: relative;
}

.dc-timeline-corner {
	position: absolute;
	width: 8px;
	height: 8px;
	border-color: var(--wf-primary, #27b99c);
	pointer-events: none;
}

.dc-timeline-corner-tl {
	top: 0;
	left: 0;
	border-top: 1px solid var(--wf-primary, #27b99c);
	border-left: 1px solid var(--wf-primary, #27b99c);
}

.dc-timeline-corner-br {
	bottom: 0;
	right: 0;
	border-bottom: 1px solid var(--wf-primary, #27b99c);
	border-right: 1px solid var(--wf-primary, #27b99c);
}

.dc-timeline-placeholder {
	font-size: 11px;
	color: var(--wf-text-muted, #8899aa);
	letter-spacing: 0.5px;
}

.sq-container {
	position: absolute;
	inset: 0;
	overflow: hidden;
	pointer-events: none;
}

.sq-particle {
	position: absolute;
	display: block;
	pointer-events: none;
	will-change: transform, opacity;
}
</style>
