<template>
	<div class="dc-window" ref="dcWindowRef">
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
				<!-- 编辑器操作组：撤销/重做/保存 -->
				<div class="dc-topbar-editor-group">
					<button
						class="dc-topbar-btn dc-icon-btn"
						@click="onUndo"
						:disabled="!canUndo"
						:title="t('nodes.directorConsole.undo')"
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
							<path d="M9 7L4 12l5 5M4 12h11a5 5 0 010 10h-1" />
						</svg>
					</button>
					<button
						class="dc-topbar-btn dc-icon-btn"
						@click="onRedo"
						:disabled="!canRedo"
						:title="t('nodes.directorConsole.redo')"
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
							<path d="M15 7l5 5-5 5M20 12H9a5 5 0 000 10h1" />
						</svg>
					</button>
					<button
						class="dc-topbar-btn dc-save-btn"
						:class="{ 'is-saving': saveStatus === 'saving', 'is-saved': saveStatus === 'saved' }"
						@click="onSaveButton"
						:title="t('nodes.directorConsole.save') + ' (Ctrl+S)'"
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
							<path d="M5 3h14v18H5V3zm3 0v5h8V3M8 14h8v6H8v-6z" />
						</svg>
						<span>
							{{
								saveStatus === 'saving'
									? t('nodes.directorConsole.saving')
									: saveStatus === 'saved'
										? t('nodes.directorConsole.saved')
										: t('nodes.directorConsole.save')
							}}
						</span>
					</button>
				</div>
				<div class="dc-topbar-divider"></div>
				<button
					class="dc-topbar-btn"
					@click="onToggleWhiteMode"
					:class="{ active: whiteModeEnabled }"
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
						<rect x="4" y="4" width="16" height="16" rx="1" />
						<path d="M8 4v16M16 4v16M4 8h16M4 16h16" opacity="0.4" />
					</svg>
					<span>{{ t('nodes.directorConsole.whiteMode') }}</span>
				</button>
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
				<div class="dc-tree-section">
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
							<!-- 摄像头挂在角色下时显示弹簧臂开关 -->
							<button
								v-if="node.isCamera && cameraParentId"
								class="dc-tree-springarm-btn"
								:class="{ active: springArmEnabled }"
								:title="
									springArmEnabled
										? t('nodes.directorConsole.springArmOn')
										: t('nodes.directorConsole.springArmOff')
								"
								@click.stop="onToggleSpringArm"
							>
								{{ springArmEnabled ? '🛡' : '⚙' }}
							</button>
							<button
								v-if="!node.isCamera"
								class="dc-tree-delete-btn"
								:title="t('nodes.directorConsole.removeCharacter')"
								@click.stop="onRemoveCharacter(node.id)"
							>
								✕
							</button>
						</div>
						<div v-if="treeNodes.length === 0" class="dc-tree-empty">
							{{ t('nodes.directorConsole.sceneObjectsEmpty') }}
						</div>
					</div>
				</div>
				<!-- [v4.2] 选中角色的变换输入框（移动/旋转/缩放） -->
				<div v-if="selectedCharacter" class="dc-character-transform">
					<div class="dc-tree-header">
						<span>{{ selectedCharacter.name }}</span>
					</div>
					<div class="dc-character-transform-body">
						<div
							v-for="cat in ['translate', 'rotate', 'scale'] as const"
							:key="cat"
							class="dc-transform-group"
						>
							<div class="dc-transform-group-title">
								{{
									cat === 'translate'
										? t('nodes.directorConsole.transformTranslate')
										: cat === 'rotate'
											? t('nodes.directorConsole.transformRotate')
											: t('nodes.directorConsole.transformScale')
								}}
							</div>
							<div class="dc-transform-xyz">
								<div v-for="ax in ['x', 'y', 'z'] as const" :key="ax" class="dc-transform-axis">
									<span :class="['dc-axis-tag', 'dc-axis-' + ax]">{{ ax.toUpperCase() }}</span>
									<input
										type="number"
										class="dc-transform-input"
										:value="getCharacterTransformValue(cat, ax)"
										@mousedown="(e) => onCharacterTransformDragStart(e, cat, ax)"
										@change="
											(e) =>
												onCharacterTransformInput(cat, ax, (e.target as HTMLInputElement).value)
										"
									/>
								</div>
							</div>
						</div>
					</div>
				</div>
			</aside>
		</div>
		<footer class="dc-timeline-bar">
			<DirectorTimeline
				:fps="timelineFps"
				:total-frames="timelineTotalFrames"
				:current-frame="timelineCurrentFrame"
				:is-playing="timelineIsPlaying"
				:loop="timelineLoop"
				:camera-track="currentCameraTrack"
				:characters="characters"
				:selected-object-id="selectedObjectId"
				@update:current-frame="onTimelineFrameChange"
				@update:fps="onTimelineFpsChange"
				@update:total-frames="onTimelineTotalFramesChange"
				@update:loop="onTimelineLoopChange"
				@play="onTimelinePlay"
				@pause="onTimelinePause"
				@stop="onTimelineStop"
				@add-keyframe="onTimelineAddKeyframe"
				@remove-keyframe="onTimelineRemoveKeyframe"
				@export-video="onTimelineExportVideo"
			/>
		</footer>

		<!-- [v3.0] 镜头锥形预览面板（可放大/拖拽/四角缩放） -->
		<div
			v-if="hasCamera"
			class="dc-camera-preview"
			:class="{ 'dc-camera-preview--enlarged': previewEnlarged }"
			:style="previewStyle"
		>
			<div class="dc-camera-preview-corner dc-camera-preview-corner-tl" />
			<div class="dc-camera-preview-corner dc-camera-preview-corner-br" />
			<!-- 四角缩放锚点（仅放大态显示） -->
			<template v-if="previewEnlarged">
				<div
					class="dc-camera-preview-resize dc-camera-preview-resize-tl"
					@mousedown="(e) => onPreviewResizeStart(e, 'tl')"
				/>
				<div
					class="dc-camera-preview-resize dc-camera-preview-resize-tr"
					@mousedown="(e) => onPreviewResizeStart(e, 'tr')"
				/>
				<div
					class="dc-camera-preview-resize dc-camera-preview-resize-bl"
					@mousedown="(e) => onPreviewResizeStart(e, 'bl')"
				/>
				<div
					class="dc-camera-preview-resize dc-camera-preview-resize-br"
					@mousedown="(e) => onPreviewResizeStart(e, 'br')"
				/>
			</template>
			<div class="dc-camera-preview-header" @mousedown="onPreviewHeaderMouseDown">
				<span class="dc-camera-preview-title">
					{{ t('nodes.directorConsole.cameraPreviewTitle') }}
				</span>
				<span class="dc-camera-preview-scanline" />
				<div class="dc-camera-preview-actions">
					<button
						v-if="!previewEnlarged"
						type="button"
						class="dc-camera-preview-btn"
						title="放大"
						@click.stop="onTogglePreviewEnlarge(true)"
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
							<path
								d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"
							/>
						</svg>
					</button>
					<button
						v-else
						type="button"
						class="dc-camera-preview-btn"
						title="缩小"
						@click.stop="onTogglePreviewEnlarge(false)"
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
							<path
								d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4"
							/>
						</svg>
					</button>
				</div>
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

		<!-- 操作反馈 toast（撤销/重做/保存等） -->
		<transition name="dc-toast-fade">
			<div v-if="toastMessage" class="dc-toast">{{ toastMessage }}</div>
		</transition>

		<!-- [v5.0] 导出视频进度遮罩 -->
		<transition name="dc-toast-fade">
			<div v-if="exportVisible" class="dc-export-overlay">
				<div class="dc-export-panel">
					<div class="dc-export-title">{{ t('nodes.directorConsole.exportVideo') }}</div>
					<div class="dc-export-stage">{{ exportMessage }}</div>
					<div class="dc-export-progress-track">
						<div class="dc-export-progress-bar" :style="{ width: exportPercent + '%' }" />
					</div>
					<div class="dc-export-percent">{{ exportPercent }}%</div>
				</div>
			</div>
		</transition>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from '../../i18n'
import { useSquareParticles } from '../../composables/useSquareParticles'
import { createDirectorConsoleHistory } from '../../composables/useDirectorConsoleHistory'
import { DirectorSceneViewer } from './viewers/DirectorSceneViewer'
import { directorConsoleSave } from '../../electronBridge'
import type { DirectorConsoleScenePayload } from '../../electronBridge'
import type { WorkflowDirectorCameraTrack, WorkflowDirectorCharacter } from '../../aiworkflow/types'
import { SceneLayoutPreviewViewer } from '../WorkFlow/WorlFlowNodes/sceneLayout/SceneLayoutPreviewViewer'
import DirectorTimeline from './DirectorTimeline.vue'
import { DirectorVideoExportService } from './services/DirectorVideoExportService'

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
const dcWindowRef = ref<HTMLElement | null>(null)
const currentCameraFov = ref(50)
const currentCameraPos = ref({ x: 0, y: 0, z: 0 })
const currentCameraTarget = ref({ x: 0, y: 0, z: 0 })
const currentCameraRoll = ref(0)
// [v3.0] 镜头预览面板放大/拖拽/缩放
const PREVIEW_BASE_W = 240
const PREVIEW_BASE_H = 160
const PREVIEW_SCALE = 2
const PREVIEW_ENLARGED_MIN_W = 320
const PREVIEW_ENLARGED_MAX_W = 1200
const previewEnlarged = ref(false)
const previewPos = ref({ x: 0, y: 0 })
const previewSize = ref({ w: PREVIEW_BASE_W, h: PREVIEW_BASE_H })
const previewDragging = ref(false)
const previewResizing = ref<string | null>(null)
let previewDragOffset = { x: 0, y: 0 }
let previewResizeStart = { x: 0, y: 0, w: 0, h: 0, mouseX: 0, mouseY: 0 }
const previewStyle = computed(() => {
	return {
		width: previewSize.value.w + 'px',
		height: previewSize.value.h + 'px',
		left: previewPos.value.x + 'px',
		top: previewPos.value.y + 'px'
	}
})
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
// [v1.0] 摄像头父级角色 ID（null 表示挂到场景根）
const cameraParentId = ref<string | null>(null)
// [v4.2] 弹簧臂开关状态
const springArmEnabled = ref(false)
// [v1.0] 白模模式：所有占位立方体统一白色
const whiteModeEnabled = ref(false)
// [P1] 时间轴状态
const timelineFps = ref(30)
const timelineTotalFrames = ref(150)
const timelineCurrentFrame = ref(0)
const timelineIsPlaying = ref(false)
const timelineLoop = ref(false)
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

// 撤销/重做历史栈
const canUndo = ref(false)
const canRedo = ref(false)
let history: ReturnType<typeof createDirectorConsoleHistory> | null = null

// 保存反馈状态
const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')
let saveStatusTimer: ReturnType<typeof setTimeout> | null = null

function setupHistory() {
	history = createDirectorConsoleHistory({
		captureSnapshot: () => sceneViewer?.captureState() || {},
		applySnapshot: (snap) => {
			sceneViewer?.applyState(snap)
			syncUIFromViewer()
		},
		onChanged: () => {
			canUndo.value = history?.canUndo() ?? false
			canRedo.value = history?.canRedo() ?? false
		}
	})
}

/** 从 sceneViewer 同步 UI 状态 */
function syncUIFromViewer() {
	if (!sceneViewer) return
	const track = sceneViewer.getCameraTrack()
	syncCameraStateFromTracks(track ? [track] : [])
	const chars = sceneViewer.getCharacters()
	characters.value = [...chars]
	const fps = sceneViewer.getFps()
	if (typeof fps === 'number') timelineFps.value = fps
	const total = sceneViewer.getTotalFrames()
	if (typeof total === 'number') timelineTotalFrames.value = total
}

const toastMessage = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

// [v5.0] 导出视频状态
const exportVisible = ref(false)
const exportPercent = ref(0)
const exportMessage = ref('')
let exportService: DirectorVideoExportService | null = null
function showToast(msg: string) {
	toastMessage.value = msg
	if (toastTimer) clearTimeout(toastTimer)
	toastTimer = setTimeout(() => {
		toastMessage.value = ''
		toastTimer = null
	}, 1500)
}

function onUndo() {
	if (!canUndo.value) {
		showToast(t('nodes.directorConsole.nothingToUndo'))
		return
	}
	history?.undo()
	showToast(t('nodes.directorConsole.undo'))
}

function onRedo() {
	if (!canRedo.value) {
		showToast(t('nodes.directorConsole.nothingToRedo'))
		return
	}
	history?.redo()
	showToast(t('nodes.directorConsole.redo'))
}

/** 保存按钮：flush 历史 + 提交完整状态 */
function onSaveButton() {
	history?.flushPendingCapture()
	console.log('[DirectorConsole:onSaveButton] clicked', {
		hasNodeId: !!currentPayload?.nodeId,
		hasSceneViewer: !!sceneViewer,
		nodeId: currentPayload?.nodeId
	})
	if (!currentPayload?.nodeId || !sceneViewer) {
		console.warn('[DirectorConsole:onSaveButton] missing nodeId or sceneViewer, abort')
		setSaveStatus('saved')
		return
	}
	const state = sceneViewer.captureState()
	console.log('[DirectorConsole:onSaveButton] captured state', {
		charactersCount: state.characters?.length ?? 0,
		hasCameraTracks: Array.isArray(state.cameraTracks) && state.cameraTracks.length > 0
	})
	setSaveStatus('saving')
	try {
		directorConsoleSave({
			nodeId: currentPayload.nodeId,
			patch: state
		})
		console.log('[DirectorConsole:onSaveButton] directorConsoleSave IPC sent')
		// directorConsoleSave 为 fire-and-forget IPC，落盘由主窗口异步完成；
		// 这里给出即时反馈，让用户感知保存已触发。
		setSaveStatus('saved')
		showToast(t('nodes.directorConsole.saveSuccess'))
	} catch (err) {
		console.error('[DirectorConsole:onSaveButton] directorConsoleSave error', err)
		setSaveStatus('idle')
		showToast(t('nodes.directorConsole.saveFailed'))
	}
}

function setSaveStatus(status: 'idle' | 'saving' | 'saved') {
	saveStatus.value = status
	if (saveStatusTimer) {
		clearTimeout(saveStatusTimer)
		saveStatusTimer = null
	}
	if (status === 'saved') {
		saveStatusTimer = setTimeout(() => {
			saveStatus.value = 'idle'
			saveStatusTimer = null
		}, 1800)
	}
}

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

/**
 * 导演控制台窗口快捷键处理。
 * 注意：导演控制台是独立的 BrowserWindow，其 window 与主 AI 工作流蓝图窗口隔离，
 * 因此这里注册的 keydown 监听不会影响主窗口的快捷键（Ctrl+S 保存项目、Delete 删除节点等）。
 */
function onDirectorConsoleKeyDown(ev: KeyboardEvent) {
	const key = String(ev.key || '').toLowerCase()
	const mod = ev.ctrlKey || ev.metaKey
	console.log('[DirectorConsole:keydown]', {
		key,
		ctrl: ev.ctrlKey,
		shift: ev.shiftKey,
		alt: ev.altKey
	})
	if (!mod) return

	// Ctrl+S：保存
	if (key === 's') {
		ev.preventDefault()
		ev.stopPropagation()
		console.log('[DirectorConsole:shortcut] Ctrl+S -> save')
		onSaveButton()
		return
	}

	// Ctrl+Z：撤销（排除文本输入框，避免干扰原生撤销）
	if (key === 'z' && !ev.shiftKey && !ev.altKey) {
		const target = ev.target as HTMLElement | null
		if (target?.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')) return
		ev.preventDefault()
		ev.stopPropagation()
		console.log('[DirectorConsole:shortcut] Ctrl+Z -> undo', { canUndo: canUndo.value })
		onUndo()
		return
	}

	// Ctrl+Shift+Z / Ctrl+Y：重做
	if ((key === 'z' && ev.shiftKey) || key === 'y') {
		const target = ev.target as HTMLElement | null
		if (target?.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')) return
		ev.preventDefault()
		ev.stopPropagation()
		console.log('[DirectorConsole:shortcut] Ctrl+Shift+Z/Ctrl+Y -> redo', {
			canRedo: canRedo.value
		})
		onRedo()
		return
	}
}

onMounted(() => {
	window.addEventListener('keydown', onDirectorConsoleKeyDown)
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
				history?.scheduleCapture()
			},
			onSelectionChange: (itemId) => {
				// 选中对象后默认进入「移动」模式
				transformMode.value = 'translate'
				sceneViewer?.setTransformMode('translate')
				selectedObjectId.value = itemId
			},
			onCameraScaleChange: (scale) => {
				cameraScale.value = { ...scale }
				history?.scheduleCapture()
			},
			onCharactersChange: (list) => {
				characters.value = [...list]
				emitCharactersSave(list)
				history?.scheduleCapture()
			},
			onFrameChange: (frame: number) => {
				timelineCurrentFrame.value = frame
			},
			onPlayingChange: (playing: boolean) => {
				timelineIsPlaying.value = playing
			}
		})
		// 初始化历史栈
		setupHistory()
	}
	// [v3.0] hasCamera 变为 true 时,等待 DOM 渲染后设置预览 canvas 并定位到视口右下角
	// 使用 immediate 确保已存在摄像头时也能正确定位
	watch(
		hasCamera,
		(val) => {
			if (val) {
				nextTick(() => {
					if (previewCanvasRef.value && sceneViewer) {
						sceneViewer.setPreviewCanvas(previewCanvasRef.value)
					}
					// 默认对齐到 3D 编辑器右下角
					const vp = getViewportBounds()
					const win = dcWindowRef.value
					if (vp) {
						previewPos.value = {
							x: vp.right - PREVIEW_BASE_W - 16,
							y: vp.bottom - PREVIEW_BASE_H - 16
						}
					} else if (win) {
						// 回退：放在弹窗右下角
						previewPos.value = {
							x: win.clientWidth - PREVIEW_BASE_W - 16,
							y: win.clientHeight - PREVIEW_BASE_H - 16
						}
					}
				})
			}
		},
		{ immediate: true }
	)
	// 测量时间轴高度，供镜头预览定位使用
	updateTimelineHeightVar()
	const timelineBar = dcWindowRef.value?.querySelector('.dc-timeline-bar')
	if (timelineBar && typeof ResizeObserver !== 'undefined') {
		timelineResizeObserver = new ResizeObserver(() => updateTimelineHeightVar())
		timelineResizeObserver.observe(timelineBar)
	}
})

function applyScenePayload(payload: DirectorConsoleScenePayload) {
	console.log('[DirectorConsole:applyScenePayload] received', {
		nodeId: payload?.nodeId,
		layoutItemsCount: Array.isArray(payload?.layoutItems) ? payload.layoutItems.length : 0,
		charactersCount: Array.isArray(payload?.characters) ? payload.characters.length : 0,
		cameraTracksCount: Array.isArray(payload?.cameraTracks) ? payload.cameraTracks.length : 0,
		hasLightRig: !!payload?.lightRig,
		fps: payload?.fps,
		totalFrames: payload?.totalFrames,
		directorDataVersion: payload?.directorDataVersion
	})
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
	// [v1.0] 同步摄像头父级（必须在 sceneViewer 加载角色之后由 loadScene 内部恢复）
	if (payload?.cameraParentId !== undefined) {
		cameraParentId.value = payload.cameraParentId as string | null
	}
	// [P1] 同步时间轴设置
	if (typeof payload?.fps === 'number') {
		timelineFps.value = payload.fps
		sceneViewer?.setFps(payload.fps)
	}
	if (typeof payload?.totalFrames === 'number') {
		timelineTotalFrames.value = payload.totalFrames
		sceneViewer?.setTotalFrames(payload.totalFrames)
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
			// [v1.0] 加载完成后，恢复白模模式与摄像头父级
			if (whiteModeEnabled.value) {
				sceneViewer?.setWhiteMode(true)
			}
			if (cameraParentId.value) {
				sceneViewer?.setCameraParent(cameraParentId.value)
			}
			// 初始化历史栈基线（loadScene 后 sceneViewer 才有完整状态）
			const initialState = sceneViewer?.captureState() || {}
			history?.replaceCurrent(initialState)
			canUndo.value = false
			canRedo.value = false
		})
		.catch((err) => {
			set_error(t('nodes.directorConsole.viewportLoadFailed') + ': ' + String(err))
		})
	emit('data-loaded', payload)
}

/** [v2.0] 从轨道列表同步摄像头 UI 状态 */
function syncCameraStateFromTracks(tracks: WorkflowDirectorCameraTrack[]) {
	if (tracks.length > 0) {
		// 创建浅拷贝，确保 ref 值变化触发 Vue 响应式更新
		// （否则同一对象引用赋值不会被 Object.is 检测到变化）
		currentCameraTrack.value = { ...tracks[0] }
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

// ===== [v3.0] 镜头预览面板：放大/缩小/拖拽/四角缩放 =====
// 获取视口（3D 编辑器）相对弹窗的边界，用于小预览对齐与拖拽约束
function getViewportBounds() {
	const win = dcWindowRef.value
	if (!win) return null
	const viewport = win.querySelector('.dc-viewport') as HTMLElement | null
	if (!viewport) return null
	const winRect = win.getBoundingClientRect()
	const vpRect = viewport.getBoundingClientRect()
	return {
		left: vpRect.left - winRect.left,
		top: vpRect.top - winRect.top,
		right: vpRect.right - winRect.left,
		bottom: vpRect.bottom - winRect.top,
		width: vpRect.width,
		height: vpRect.height
	}
}

// 获取时间轴顶部相对弹窗的 y 坐标（放大预览拖拽/缩放的下边界）
function getTimelineTop() {
	const win = dcWindowRef.value
	if (!win) return 0
	const timelineBar = win.querySelector('.dc-timeline-bar') as HTMLElement | null
	return timelineBar ? timelineBar.offsetTop : win.clientHeight - 160
}

function onTogglePreviewEnlarge(enlarge: boolean) {
	previewEnlarged.value = enlarge
	const vp = getViewportBounds()
	if (enlarge) {
		const w = PREVIEW_BASE_W * PREVIEW_SCALE
		const h = PREVIEW_BASE_H * PREVIEW_SCALE
		previewSize.value = { w, h }
		sceneViewer?.setPreviewSize(w, h)
		// 默认放在视口右下，约束在时间轴上方
		if (vp) {
			const timelineTop = getTimelineTop()
			const x = Math.max(vp.left + 8, vp.right - w - 16)
			const y = Math.max(vp.top + 8, Math.min(timelineTop - h - 8, vp.bottom - h - 16))
			previewPos.value = { x, y }
		}
	} else {
		const w = PREVIEW_BASE_W
		const h = PREVIEW_BASE_H
		previewSize.value = { w, h }
		sceneViewer?.setPreviewSize(w, h)
		// 缩小后对齐到 3D 编辑器右下角
		if (vp) {
			const x = vp.right - w - 16
			const y = vp.bottom - h - 16
			previewPos.value = { x, y }
		}
	}
}

function onPreviewHeaderMouseDown(e: MouseEvent) {
	// 点击按钮时不触发拖拽
	if ((e.target as HTMLElement).closest('.dc-camera-preview-btn')) return
	if ((e.target as HTMLElement).closest('.dc-camera-preview-resize')) return
	e.preventDefault()
	const win = dcWindowRef.value
	if (!win) return
	const rect = win.getBoundingClientRect()
	previewDragOffset = {
		x: e.clientX - rect.left - previewPos.value.x,
		y: e.clientY - rect.top - previewPos.value.y
	}
	previewDragging.value = true
	window.addEventListener('mousemove', onPreviewMouseMove)
	window.addEventListener('mouseup', onPreviewMouseUp)
}

function onPreviewMouseMove(e: MouseEvent) {
	if (!previewDragging.value) return
	const win = dcWindowRef.value
	if (!win) return
	const rect = win.getBoundingClientRect()
	const { w, h } = previewSize.value
	let x = e.clientX - rect.left - previewDragOffset.x
	let y = e.clientY - rect.top - previewDragOffset.y
	if (previewEnlarged.value) {
		// 放大态：约束在弹窗范围内，且不能覆盖时间轴
		const topbarH = 48
		const timelineTop = getTimelineTop()
		x = Math.max(0, Math.min(rect.width - w, x))
		y = Math.max(topbarH, Math.min(timelineTop - h, y))
	} else {
		// 小态：约束在 3D 视口范围内，避免遮挡侧边栏
		const vp = getViewportBounds()
		if (vp) {
			x = Math.max(vp.left, Math.min(vp.right - w, x))
			y = Math.max(vp.top, Math.min(vp.bottom - h, y))
		}
	}
	previewPos.value = { x, y }
}

function onPreviewMouseUp() {
	previewDragging.value = false
	previewResizing.value = null
	window.removeEventListener('mousemove', onPreviewMouseMove)
	window.removeEventListener('mouseup', onPreviewMouseUp)
}

// 四角锚点缩放（保持 3:2 比例）
function onPreviewResizeStart(e: MouseEvent, corner: string) {
	if (!previewEnlarged.value) return
	e.preventDefault()
	e.stopPropagation()
	const win = dcWindowRef.value
	if (!win) return
	const rect = win.getBoundingClientRect()
	previewResizeStart = {
		x: previewPos.value.x,
		y: previewPos.value.y,
		w: previewSize.value.w,
		h: previewSize.value.h,
		mouseX: e.clientX - rect.left,
		mouseY: e.clientY - rect.top
	}
	previewResizing.value = corner
	window.addEventListener('mousemove', onPreviewResizeMove)
	window.addEventListener('mouseup', onPreviewMouseUp)
}

function onPreviewResizeMove(e: MouseEvent) {
	if (!previewResizing.value) return
	const win = dcWindowRef.value
	if (!win) return
	const rect = win.getBoundingClientRect()
	const corner = previewResizing.value
	const start = previewResizeStart
	const aspect = PREVIEW_BASE_W / PREVIEW_BASE_H
	const mouseX = e.clientX - rect.left
	const mouseY = e.clientY - rect.top
	const dx = mouseX - start.mouseX
	const dy = mouseY - start.mouseY

	// 根据锚点计算新的宽度（保持比例：用 dx 和 dy 中变化较大的方向主导）
	let newW = start.w
	let newH = start.h
	let newX = start.x
	let newY = start.y

	if (corner === 'br') {
		// 右下角：以 dx 为主，保持比例
		newW = Math.max(PREVIEW_ENLARGED_MIN_W, Math.min(PREVIEW_ENLARGED_MAX_W, start.w + dx))
		newH = newW / aspect
	} else if (corner === 'bl') {
		// 左下角
		newW = Math.max(PREVIEW_ENLARGED_MIN_W, Math.min(PREVIEW_ENLARGED_MAX_W, start.w - dx))
		newH = newW / aspect
		newX = start.x + (start.w - newW)
	} else if (corner === 'tr') {
		// 右上角
		newW = Math.max(PREVIEW_ENLARGED_MIN_W, Math.min(PREVIEW_ENLARGED_MAX_W, start.w + dx))
		newH = newW / aspect
		newY = start.y + (start.h - newH)
	} else if (corner === 'tl') {
		// 左上角
		newW = Math.max(PREVIEW_ENLARGED_MIN_W, Math.min(PREVIEW_ENLARGED_MAX_W, start.w - dx))
		newH = newW / aspect
		newX = start.x + (start.w - newW)
		newY = start.y + (start.h - newH)
	}

	// 约束不超出弹窗且不覆盖时间轴
	const topbarH = 48
	const timelineTop = getTimelineTop()
	const maxX = rect.width - newW
	const maxY = timelineTop - newH
	newX = Math.max(0, Math.min(maxX, newX))
	newY = Math.max(topbarH, Math.min(maxY, newY))
	// 若被边界约束住，同步收缩尺寸避免越界
	if (newX + newW > rect.width) newW = rect.width - newX
	if (newY + newH > timelineTop) newH = timelineTop - newY
	if (newY < topbarH) {
		newH = newH - (topbarH - newY)
		newY = topbarH
	}
	if (newX < 0) {
		newW = newW - newX
		newX = 0
	}
	// 重新按比例校正高度
	newH = newW / aspect

	previewPos.value = { x: newX, y: newY }
	previewSize.value = { w: newW, h: newH }
	sceneViewer?.setPreviewSize(newW, newH)
}

// 测量时间轴高度，用于镜头预览小状态时的 bottom 定位（不覆盖时间轴）
let timelineResizeObserver: ResizeObserver | null = null
function updateTimelineHeightVar() {
	const win = dcWindowRef.value
	if (!win) return
	const timelineBar = win.querySelector('.dc-timeline-bar') as HTMLElement | null
	if (timelineBar) {
		win.style.setProperty('--dc-timeline-h', timelineBar.offsetHeight + 'px')
	} else {
		win.style.setProperty('--dc-timeline-h', '160px')
	}
}

// ===== [v1.0] 变换输入框拖拽步进 =====
type DragAxis = 'x' | 'y' | 'z'
type DragKind = 'position' | 'rotation' | 'scale' | 'fov'
type DragTarget = 'camera' | 'character'
const dragState = {
	active: false,
	dragging: false,
	kind: '' as DragKind | '',
	axis: '' as DragAxis | '',
	target: '' as DragTarget | '',
	characterId: '' as string,
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
	dragState.target = 'camera'
	dragState.characterId = ''
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
	if (dragState.target === 'character' && dragState.characterId) {
		const kind = dragState.kind as 'position' | 'rotation' | 'scale'
		if (kind === 'scale') {
			sceneViewer?.updateCharacterTransform(
				dragState.characterId,
				kind,
				axis,
				Math.max(0.01, parseFloat(newValue.toFixed(3)))
			)
		} else {
			sceneViewer?.updateCharacterTransform(
				dragState.characterId,
				kind,
				axis,
				parseFloat(newValue.toFixed(kind === 'rotation' ? 2 : 3))
			)
		}
		return
	}
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
	dragState.target = ''
	dragState.characterId = ''
	window.removeEventListener('mousemove', onTransformDragMove)
	window.removeEventListener('mouseup', onTransformDragEnd)
	history?.scheduleCapture()
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

// ===== [v4.2] 选中角色的变换输入框 =====
const selectedCharacter = computed<WorkflowDirectorCharacter | null>(() => {
	if (!selectedObjectId.value) return null
	return characters.value.find((c) => c.id === selectedObjectId.value) ?? null
})

/** 获取选中角色的指定变换分量值（用于输入框显示） */
function getCharacterTransformValue(cat: 'translate' | 'rotate' | 'scale', axis: DragAxis): string {
	const ch = selectedCharacter.value
	if (!ch) return '0'
	if (cat === 'translate') {
		return (ch.position?.[axis] ?? 0).toFixed(2)
	}
	if (cat === 'rotate') {
		const rot = ch.rotation ?? {}
		const key = axis === 'x' ? 'pitch' : axis === 'y' ? 'yaw' : 'roll'
		return (rot[key] ?? 0).toFixed(1)
	}
	// scale
	const s = ch.scale ?? { x: 1, y: 1, z: 1 }
	return (s[axis] ?? 1).toFixed(2)
}

/** 角色变换拖拽开始 */
function onCharacterTransformDragStart(
	event: MouseEvent,
	cat: 'translate' | 'rotate' | 'scale',
	axis: DragAxis
) {
	const ch = selectedCharacter.value
	if (!ch) return
	const kind: DragKind = cat === 'translate' ? 'position' : cat === 'rotate' ? 'rotation' : 'scale'
	dragState.active = true
	dragState.dragging = false
	dragState.kind = kind
	dragState.axis = axis
	dragState.target = 'character'
	dragState.characterId = ch.id
	dragState.startX = event.clientX
	dragState.startValue = parseFloat(getCharacterTransformValue(cat, axis))
	window.addEventListener('mousemove', onTransformDragMove)
	window.addEventListener('mouseup', onTransformDragEnd)
}

/** 角色变换输入框直接输入数值 */
function onCharacterTransformInput(
	cat: 'translate' | 'rotate' | 'scale',
	axis: DragAxis,
	raw: string
) {
	const ch = selectedCharacter.value
	if (!ch) return
	const value = parseFloat(raw)
	if (Number.isNaN(value)) return
	const kind: 'position' | 'rotation' | 'scale' =
		cat === 'translate' ? 'position' : cat === 'rotate' ? 'rotation' : 'scale'
	sceneViewer?.updateCharacterTransform(ch.id, kind, axis, value)
	history?.scheduleCapture()
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
			activeCameraTrackId,
			cameraParentId: cameraParentId.value
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
	const cameraId = SceneLayoutPreviewViewer.CAMERA_SELECTION_ID
	const walk = (parentId: string | null, depth: number) => {
		const children = byParent.get(parentId) || []
		for (const c of children) {
			nodes.push({ id: c.id, name: c.name, color: c.color, depth, isCamera: false })
			walk(c.id, depth + 1)
			// 摄像头作为该角色的子级（跟随移动）
			if (hasCamera.value && cameraParentId.value === c.id) {
				nodes.push({
					id: cameraId,
					name: t('nodes.directorConsole.cameraTrackTitle'),
					color: '#60a5fa',
					depth: depth + 1,
					isCamera: true
				})
			}
		}
	}
	walk(null, 0)
	// 摄像头挂在根级（无父级角色）
	if (hasCamera.value && !cameraParentId.value) {
		nodes.push({
			id: cameraId,
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

function onRemoveCharacter(id: string) {
	if (!sceneViewer) return
	sceneViewer.removeCharacter(id)
	history?.scheduleCapture()
}

/** [v4.2] 切换弹簧臂（摄像头挂在角色下时避免穿墙） */
function onToggleSpringArm() {
	springArmEnabled.value = !springArmEnabled.value
	sceneViewer?.setSpringArmEnabled(springArmEnabled.value)
	history?.scheduleCapture()
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
	const cameraId = SceneLayoutPreviewViewer.CAMERA_SELECTION_ID
	// 摄像头不可作为父级（不能让角色跟随摄像头）
	if (targetId === cameraId) return
	if (draggingNodeId === cameraId) {
		// 摄像头拖到角色上：挂为该角色子级
		cameraParentId.value = targetId
		sceneViewer?.setCameraParent(targetId)
	} else {
		// 角色拖到角色上：建立父子关系
		sceneViewer?.setCharacterParent(draggingNodeId, targetId)
	}
	draggingNodeId = ''
}
function onTreeDropToRoot(_event: DragEvent) {
	if (!draggingNodeId) return
	const cameraId = SceneLayoutPreviewViewer.CAMERA_SELECTION_ID
	if (draggingNodeId === cameraId) {
		// 摄像头拖到根：解除父子关系
		cameraParentId.value = null
		sceneViewer?.setCameraParent(null)
	} else {
		sceneViewer?.setCharacterParent(draggingNodeId, null)
	}
	draggingNodeId = ''
}

/** [v1.0] 白模模式切换 */
function onToggleWhiteMode() {
	whiteModeEnabled.value = sceneViewer?.setWhiteMode(!whiteModeEnabled.value) ?? false
}

// ===== [P1] 时间轴事件 =====

function onTimelinePlay() {
	sceneViewer?.play({ fromFrame: timelineCurrentFrame.value })
	timelineIsPlaying.value = true
}
function onTimelinePause() {
	sceneViewer?.pause()
	timelineIsPlaying.value = false
}
function onTimelineStop() {
	sceneViewer?.stop()
	timelineCurrentFrame.value = 0
	timelineIsPlaying.value = false
}
function onTimelineFrameChange(frame: number) {
	timelineCurrentFrame.value = frame
	sceneViewer?.setCurrentFrame(frame)
}
function onTimelineFpsChange(fps: number) {
	timelineFps.value = fps
	sceneViewer?.setFps(fps)
	emitTimelineSettingsSave()
}
function onTimelineTotalFramesChange(n: number) {
	timelineTotalFrames.value = n
	sceneViewer?.setTotalFrames(n)
	emitTimelineSettingsSave()
}
function onTimelineLoopChange(loop: boolean) {
	timelineLoop.value = loop
	if (currentCameraTrack.value) {
		currentCameraTrack.value.loop = loop
		emitCameraTrackSave(currentCameraTrack.value ? [currentCameraTrack.value] : [])
	}
}
function onTimelineAddKeyframe(target: { type: 'camera' | 'character'; id?: string }) {
	const frame = timelineCurrentFrame.value
	if (target.type === 'camera') {
		sceneViewer?.addCameraKeyframe(frame)
	} else if (target.id) {
		sceneViewer?.addCharacterKeyframe(target.id, frame)
	}
	history?.scheduleCapture()
}
function onTimelineRemoveKeyframe(target: {
	type: 'camera' | 'character'
	id?: string
	keyframeId: string
}) {
	sceneViewer?.removeKeyframe(target)
	history?.scheduleCapture()
}

// [v5.0] 导出视频
async function onTimelineExportVideo() {
	if (!sceneViewer || !currentPayload?.nodeId) return
	if (exportVisible.value) return
	exportVisible.value = true
	exportPercent.value = 0
	exportMessage.value = t('nodes.directorConsole.exportPreparing')
	if (!exportService) {
		exportService = new DirectorVideoExportService(sceneViewer)
	}
	const result = await exportService.exportVideo({
		fps: timelineFps.value,
		totalFrames: timelineTotalFrames.value,
		nodeId: currentPayload.nodeId,
		projectId: currentPayload.projectId,
		onProgress: (p) => {
			exportPercent.value = p.percent
			exportMessage.value = p.message || ''
		}
	})
	if (result.ok) {
		exportMessage.value = t('nodes.directorConsole.exportDone')
		showToast(t('nodes.directorConsole.exportDone'))
	} else {
		exportMessage.value = result.error || t('nodes.directorConsole.exportFailed')
		showToast(result.error || t('nodes.directorConsole.exportFailed'))
	}
	// 短暂展示完成状态后关闭遮罩
	setTimeout(() => {
		exportVisible.value = false
	}, 1200)
}
function emitTimelineSettingsSave() {
	if (!currentPayload?.nodeId) return
	directorConsoleSave({
		nodeId: currentPayload.nodeId,
		patch: {
			fps: timelineFps.value,
			totalFrames: timelineTotalFrames.value
		}
	})
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
	// [v1.0] 清除摄像头父级关系
	cameraParentId.value = null
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
	window.removeEventListener('keydown', onDirectorConsoleKeyDown)
	window.removeEventListener('mousemove', onPreviewMouseMove)
	window.removeEventListener('mouseup', onPreviewMouseUp)
	if (timelineResizeObserver) {
		timelineResizeObserver.disconnect()
		timelineResizeObserver = null
	}
	if (saveStatusTimer) {
		clearTimeout(saveStatusTimer)
		saveStatusTimer = null
	}
	if (toastTimer) {
		clearTimeout(toastTimer)
		toastTimer = null
	}
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
.dc-topbar-btn.active {
	border-color: color-mix(in srgb, var(--wf-primary, #27b99c) 70%, transparent);
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 22%, transparent);
	box-shadow: inset 0 0 12px color-mix(in srgb, var(--wf-primary, #27b99c) 25%, transparent);
}
.dc-topbar-editor-group {
	display: flex;
	align-items: center;
	gap: 4px;
}
.dc-topbar-divider {
	width: 1px;
	height: 20px;
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 30%, transparent);
	margin: 0 4px;
}
.dc-icon-btn {
	padding: 6px 8px;
}
.dc-icon-btn:disabled {
	opacity: 0.35;
	cursor: not-allowed;
}
.dc-icon-btn:disabled:hover {
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 10%, transparent);
}
.dc-save-btn {
	border-color: color-mix(in srgb, var(--wf-primary, #27b99c) 55%, transparent);
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 16%, transparent);
}
.dc-save-btn:hover {
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 28%, transparent);
	box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #27b99c) 30%, transparent);
}
.dc-save-btn.is-saving {
	opacity: 0.7;
}
.dc-save-btn.is-saved {
	border-color: color-mix(in srgb, #4ade80 60%, transparent);
	background: color-mix(in srgb, #4ade80 18%, transparent);
	color: #4ade80;
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
	width: 220px;
	flex-shrink: 0;
	display: flex;
	flex-direction: column;
	border-left: 1px solid
		color-mix(in srgb, var(--wf-primary, #27b99c) 22%, var(--wf-border-subtle, transparent));
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 4%, var(--wf-page-bg, #0a0f14));
}
/* 上半部分：场景对象树 */
.dc-tree-section {
	flex: 1;
	min-height: 0;
	display: flex;
	flex-direction: column;
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
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.dc-tree-delete-btn {
	flex-shrink: 0;
	width: 18px;
	height: 18px;
	display: none;
	align-items: center;
	justify-content: center;
	padding: 0;
	border: none;
	border-radius: 3px;
	background: transparent;
	color: var(--wf-text-muted, #8899aa);
	font-size: 11px;
	line-height: 1;
	cursor: pointer;
	transition:
		background 0.12s,
		color 0.12s;
}
.dc-tree-node:hover .dc-tree-delete-btn {
	display: flex;
}
.dc-tree-delete-btn:hover {
	background: color-mix(in srgb, #ef4444 30%, transparent);
	color: #fca5a5;
}
.dc-tree-springarm-btn {
	flex-shrink: 0;
	width: 20px;
	height: 18px;
	display: none;
	align-items: center;
	justify-content: center;
	padding: 0;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 40%, transparent);
	border-radius: 3px;
	background: transparent;
	color: var(--wf-text-muted, #8899aa);
	font-size: 11px;
	line-height: 1;
	cursor: pointer;
	transition: all 0.12s;
}
.dc-tree-node:hover .dc-tree-springarm-btn {
	display: flex;
}
.dc-tree-springarm-btn.active {
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 25%, transparent);
	color: var(--wf-primary, #27b99c);
	border-color: var(--wf-primary, #27b99c);
}
.dc-tree-springarm-btn:hover {
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 40%, transparent);
}
.dc-tree-empty {
	padding: 16px 12px;
	font-size: 11px;
	color: var(--wf-text-muted, #64748b);
	text-align: center;
}

/* ===== [v4.2] 选中角色变换面板（右侧边栏下半部分） ===== */
.dc-character-transform {
	flex-shrink: 0;
	border-top: 1px solid
		color-mix(in srgb, var(--wf-primary, #27b99c) 18%, var(--wf-border-subtle, transparent));
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 3%, var(--wf-page-bg, #0a0f14));
}
.dc-character-transform-body {
	padding: 8px 10px 12px;
	overflow-y: auto;
}
.dc-transform-group {
	margin-bottom: 10px;
}
.dc-transform-group:last-child {
	margin-bottom: 0;
}
.dc-transform-group-title {
	font-size: 11px;
	font-weight: 600;
	color: var(--wf-primary, #27b99c);
	margin-bottom: 4px;
	opacity: 0.85;
}
.dc-character-transform .dc-transform-xyz {
	display: flex;
	flex-direction: column;
	gap: 3px;
}
.dc-character-transform .dc-transform-axis {
	display: flex;
	align-items: center;
	gap: 4px;
}
.dc-character-transform .dc-axis-tag {
	width: 16px;
	font-size: 10px;
	font-weight: 700;
	text-align: center;
	flex-shrink: 0;
}
.dc-character-transform .dc-transform-input {
	flex: 1;
	min-width: 0;
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

/* [v3.0] 镜头锥形预览面板（小状态：固定在视口右下，时间轴上方） */
.dc-camera-preview {
	position: absolute;
	background: var(--wf-surface-glass, rgba(21, 24, 28, 0.82));
	border: 1px solid var(--wf-border-subtle, rgba(255, 255, 255, 0.04));
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
	z-index: 10;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	transition: box-shadow 0.2s;
}

.dc-camera-preview--enlarged {
	z-index: 50;
	box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
}

/* 四角缩放锚点 */
.dc-camera-preview-resize {
	position: absolute;
	width: 14px;
	height: 14px;
	z-index: 2;
}
.dc-camera-preview-resize-tl {
	top: -1px;
	left: -1px;
	cursor: nwse-resize;
}
.dc-camera-preview-resize-tr {
	top: -1px;
	right: -1px;
	cursor: nesw-resize;
}
.dc-camera-preview-resize-bl {
	bottom: -1px;
	left: -1px;
	cursor: nesw-resize;
}
.dc-camera-preview-resize-br {
	bottom: -1px;
	right: -1px;
	cursor: nwse-resize;
}
/* 锚点视觉标记 */
.dc-camera-preview-resize::after {
	content: '';
	position: absolute;
	width: 8px;
	height: 8px;
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 80%, transparent);
	border: 1px solid #0a0f14;
	border-radius: 1px;
}
.dc-camera-preview-resize-tl::after {
	top: 2px;
	left: 2px;
}
.dc-camera-preview-resize-tr::after {
	top: 2px;
	right: 2px;
}
.dc-camera-preview-resize-bl::after {
	bottom: 2px;
	left: 2px;
}
.dc-camera-preview-resize-br::after {
	bottom: 2px;
	right: 2px;
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
	gap: 8px;
	cursor: move;
	user-select: none;
}

.dc-camera-preview-title {
	flex-shrink: 0;
}

.dc-camera-preview-actions {
	display: flex;
	align-items: center;
	gap: 2px;
	margin-left: auto;
}

.dc-camera-preview-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 18px;
	height: 18px;
	padding: 0;
	border: 1px solid transparent;
	border-radius: 3px;
	background: transparent;
	color: var(--wf-text-muted, #8899aa);
	cursor: pointer;
	transition: all 0.15s;
}

.dc-camera-preview-btn svg {
	width: 12px;
	height: 12px;
}

.dc-camera-preview-btn:hover {
	color: var(--wf-text, #c5d4e3);
	border-color: var(--wf-border-subtle, rgba(255, 255, 255, 0.12));
	background: rgba(255, 255, 255, 0.06);
}

.dc-camera-preview-scanline {
	display: inline-block;
	flex: 1;
	min-width: 20px;
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
	flex-shrink: 0;
	display: flex;
	flex-direction: column;
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 4%, var(--wf-page-bg, #0a0f14));
	backdrop-filter: blur(10px) saturate(140%);
	-webkit-backdrop-filter: blur(10px) saturate(140%);
	border-top: 1px solid
		color-mix(in srgb, var(--wf-primary, #27b99c) 22%, var(--wf-border-subtle, transparent));
	position: relative;
	max-height: 160px;
	overflow: hidden;
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

/* 操作反馈 toast */
.dc-toast {
	position: fixed;
	top: 60px;
	left: 50%;
	transform: translateX(-50%);
	padding: 8px 18px;
	border-radius: 8px;
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 85%, #000);
	color: #fff;
	font-size: 13px;
	font-weight: 500;
	letter-spacing: 0.02em;
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
	z-index: 9999;
	pointer-events: none;
	white-space: nowrap;
}
.dc-toast-fade-enter-active,
.dc-toast-fade-leave-active {
	transition:
		opacity 0.2s ease,
		transform 0.2s ease;
}
.dc-toast-fade-enter-from,
.dc-toast-fade-leave-to {
	opacity: 0;
	transform: translateX(-50%) translateY(-8px);
}

/* [v5.0] 导出视频进度遮罩 */
.dc-export-overlay {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.55);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 10000;
	backdrop-filter: blur(3px);
}
.dc-export-panel {
	background: var(--wf-bg-1, #1e2a30);
	border: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 40%, transparent);
	border-radius: 12px;
	padding: 24px 32px;
	min-width: 340px;
	box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
}
.dc-export-title {
	color: #fff;
	font-size: 16px;
	font-weight: 600;
	margin-bottom: 8px;
}
.dc-export-stage {
	color: var(--wf-text-2, #b8c5cc);
	font-size: 13px;
	margin-bottom: 12px;
	min-height: 18px;
}
.dc-export-progress-track {
	width: 100%;
	height: 8px;
	background: rgba(255, 255, 255, 0.08);
	border-radius: 4px;
	overflow: hidden;
}
.dc-export-progress-bar {
	height: 100%;
	background: linear-gradient(90deg, var(--wf-primary, #27b99c), #4ad8b8);
	border-radius: 4px;
	transition: width 0.15s ease;
}
.dc-export-percent {
	color: var(--wf-primary, #27b99c);
	font-size: 12px;
	text-align: right;
	margin-top: 6px;
}
</style>
