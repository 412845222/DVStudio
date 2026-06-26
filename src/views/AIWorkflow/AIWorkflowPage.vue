<template>
	<div class="aiwf-page">
		<div v-if="noProjectSelected" class="no-project-guide">
			<div class="no-project-card">
				<h2>请先选择或新建项目</h2>
				<p>从左侧「项目列表」选择已有项目，或点击「新建项目」创建一个新项目。</p>
				<button
				@click="noProjectSelected = false; void $router.push({ name: 'ProjectList' })"
			>
					去项目列表
				</button>
			</div>
		</div>
		<!-- 蓝图节点容器 -->
		<div class="aiwf-blueprint-container">
			<BlueprintCanvas
				class="aiwf-canvas"
				:viewport="viewport"
				:selection-frame="{
					visible: selectionFrame.visible.value,
					worldRect: selectionFrame.worldRect.value,
					label: selectionFrame.label.value,
					nodeCount: selectionFrame.nodeCount.value,
					nodeIds: selectionFrame.nodeIds.value
				}"
				:saved-frames="selectionFrame.savedFrames.value"
				:nodes-by-id="store.state.nodesById"
				@update:viewport="onViewportUpdate"
				@canvas-contextmenu="onCanvasContextMenu"
				@canvas-dblclick="onCanvasDblClick"
				@box-select="onBoxSelect"
				@canvas-panning-start="onCanvasPanningStart"
				@canvas-panning-end="onCanvasPanningEnd"
				@pointerdown="onCanvasPointerDown"
				@dragover.prevent="onCanvasDragOver"
				@drop.prevent="onCanvasDrop"
				@selection-frame-tag-save="(label: string) => tagEditor.commitTag(label)"
				@selection-frame-delete="onDeleteSelectionFrame"
				@selection-frame-drag="onSelectionFrameDrag"
				@selection-frame-delete-selected="onDeleteSelectedNodes"
				v-slot="vp"
			>
				<WorkflowEdgeLayer
					:edges="asyncEdgeRenders"
					:selectedEdgeId="selectedEdgeId"
					:draft="asyncDraftRender"
					:motionActive="viewportMotionActive"
					:zoom="viewport.zoom"
					@select-edge="onSelectEdge"
				/>

				<div
					v-for="node in safeVisibleRenderNodes"
					:key="node.id"
					class="aiwf-node-host"
					:class="{ 'aiwf-node-host-offscreen': isWarmingUpScreenshots }"
					:ref="
						(el: Element | null) => {
							if (el) nodeHostRefs.set(node.id, el as HTMLElement)
							else nodeHostRefs.delete(node.id)
						}
					"
				>
					<!-- Screenshot node (static image + real anchors + particles) -->
					<div
						v-if="!fullRenderNodeIds.has(node.id) && nodeScreenshotMap.get(node.id)"
						class="aiwf-node-screenshot-host"
						:class="[
							{ 'aiwf-node-offscreen': isWarmingUpScreenshots },
							{ 'is-primary-selected': selectedNodeIds.length === 1 && selectedNodeId === node.id },
							{ 'wf-node-running': resolveNodeRuntimeVisualState(node) === 'running' },
							{ 'wf-node-error': resolveNodeRuntimeVisualState(node) === 'error' },
							{ 'is-anchors-hidden': !screenshotAnchorsEnabled },
							{ 'is-particles-hidden': !screenshotParticlesEnabled },
							{ 'is-near-drag': !screenshotAnchorsEnabled && nearDragNodeIds.has(node.id) }
						]"
						:style="
							screenshotNodeStyle(
								vp.worldToScreen,
								node.worldX,
								node.worldY,
								vp.zoom,
								node.width,
								node.height
							)
						"
						:title="compactNodeDisplayName(node)"
						:data-node-type="node.type"
						@pointerdown="onCompactNodePointerDown(node.id, $event, vp.screenToWorld)"
					>
						<img
							class="aiwf-node-screenshot-img"
							:src="nodeScreenshotMap.get(node.id)?.dataUrl"
							:style="screenshotImageStyle(nodeScreenshotMap.get(node.id))"
							:alt="node.title || node.type"
							draggable="false"
						/>
						<div class="wf-node-particles" aria-hidden="true">
							<span
								v-for="p in getScreenshotParticles(node.id).particles"
								:key="p.id"
								class="sq-particle"
								:class="
									getScreenshotParticles(node.id).buildHoverStateClass(false, {
										running: resolveNodeRuntimeVisualState(node) === 'running',
										error: resolveNodeRuntimeVisualState(node) === 'error'
									})
								"
								:style="p.style"
							/>
						</div>
						<div class="wf-anchors wf-anchors-in" aria-label="入口锚点">
							<div
								v-for="a in resolveScreenshotAnchors(node, 'in')"
								:key="'in-' + a.id"
								class="wf-anchor-hit"
								:class="screenshotAnchorClass(a.mediaType)"
								:style="screenshotAnchorTopStyle(a.offsetY)"
								:title="a.label || '入口'"
								:data-wf-node-id="node.id"
								:data-wf-anchor-id="a.id"
								data-wf-dir="in"
								data-anchor-direction="in"
								data-anchor-side="left"
								:data-wf-anchor-index="a.index"
							/>
						</div>
						<div class="wf-anchors wf-anchors-out" aria-label="出口锚点">
							<div
								v-for="a in resolveScreenshotAnchors(node, 'out')"
								:key="'out-' + a.id"
								class="wf-anchor-hit"
								:class="screenshotAnchorClass(a.mediaType)"
								:style="screenshotAnchorTopStyle(a.offsetY)"
								:title="a.label || '出口'"
								:data-wf-node-id="node.id"
								:data-wf-anchor-id="a.id"
								data-wf-dir="out"
								data-anchor-direction="out"
								data-anchor-side="right"
								:data-wf-anchor-index="a.index"
								@pointerdown.stop.prevent="
									onStartLink(
										{ nodeId: node.id, anchorId: a.id, anchorIndex: a.index, event: $event },
										vp.screenToWorld
									)
								"
							/>
						</div>
					</div>

					<component
						v-else
						:is="nodeComponent(node)"
						:ref="setWorkflowNodeComponentRef(node.id, node.type)"
						:alias="node.alias"
						:height="node.height"
						:sizeCustomized="node.sizeCustomized"
						:autoHeight="true"
						:hoverInputAnchorId="hoverInputAnchorId(node.id)"
						:hoverOutputAnchorId="hoverOutputAnchorId(node.id)"
						:anchor-compatibility="anchorCompatibility"
						:is-linking="isLinking"
						:inputs="node.inputs"
						:nodeId="node.id"
						:nodeType="node.type"
						:outputs="node.outputs"
						:selected="selectedNodeIds.includes(node.id)"
						:isPrimarySelected="selectedNodeIds.length === 1 && selectedNodeId === node.id"
						:isSecondarySelected="
							selectedNodeIds.length === 1 &&
							selectedNodeIds.includes(node.id) &&
							selectedNodeId !== node.id
						"
						:visualStatus="resolveNodeRuntimeVisualState(node)"
						:node-chat-visible="
							nodeChatDialog.visible &&
							nodeChatDialog.nodeId === node.id &&
							selectedNodeId === node.id
						"
						:node-chat-node-type="
							nodeChatDialog.nodeId === node.id ? nodeChatDialog.nodeType : null
						"
						:node-chat-draft="nodeChatDialog.nodeId === node.id ? nodeChatDialog.draft : ''"
						:node-chat-submitting="
							nodeChatDialog.nodeId === node.id ? nodeChatDialog.submitting : false
						"
						:node-chat-params="nodeChatDialog.nodeId === node.id ? nodeChatDialog.params : {}"
						:node-chat-node-width="node.width"
						:node-generation-task="latestGenerationTaskByNodeId(node.id)"
						:style="
							nodeStyle(
								vp.worldToScreen,
								node.worldX,
								node.worldY,
								vp.zoom,
								node.width,
								node.height
							)
						"
						:subtitle="node.subtitle"
						:title="node.title"
						:width="node.width"
						:worldX="node.worldX"
						:worldY="node.worldY"
						:zoom="vp.zoom"
						v-bind="nodeExtraProps(node)"
						@add-branch="onStoryBranchAdd(node.id)"
						@add-merge-item="onTextMergeItemAdd(node.id)"
						@await-unreal-connection="onNodeAwaitUnrealConnection(node.id)"
						@cancel-comfyui="onComfyUICancel(node.id)"
						@cancel-scene-understanding="onNodeCancelSceneUnderstanding(node.id)"
						@clear-resource="onNodeClearResource(node.id)"
						@clear-scene-layout-model-binding="
							onNodeClearSceneLayoutModelBinding(node.id, $event.objectId)
						"
						@connect-comfyui="onComfyUIConnect(node.id, $event)"
						@copy="() => onNodeCopy(node.id)"
						@clear-node="() => onNodeClear(node.id)"
						@delete="() => onNodeDelete(node.id)"
						@delete-meshy-task="onNodeDeleteMeshyTask(node.id)"
						@end-link="onEndLink"
						@export-unreal-lighting="onNodeExportUnrealLighting(node.id)"
						@export-unreal-scene="onNodeExportUnrealScene(node.id)"
						@generate-meshy="onNodeGenerateMeshy(node.id)"
						@media-ready="onNodeMediaReady(node.id)"
						@invalidate-screenshot="onNodeInvalidateScreenshot(node.id)"
						@move-merge-item="onTextMergeItemMove(node.id, $event)"
						@preview-contextmenu="onNodePreviewContextMenu(node.id, $event)"
						@preview-request="onNodeImagePreviewRequestInline(node.id, $event)"
						@pull-meshy-output="onNodePullMeshyOutput(node.id)"
						@refresh="() => onNodeRefresh(node.id)"
						@refresh-meshy-task="onNodeRefreshMeshyTask(node.id)"
						@remove-branch="onStoryBranchRemove(node.id, $event)"
						@remove-merge-item="onTextMergeItemRemove(node.id, $event)"
						@request-scene-models="onNodeRequestSceneModels(node.id)"
						@resize="onNodeResize(node.id, $event)"
						@auto-resize="(h: number) => onNodeAutoResize(node.id, h)"
						@restart-meshy-task="onNodeRestartMeshyTask(node.id)"
						@run-comfyui="onComfyUIRun(node.id)"
						@run-followup-meshy="onNodeRunMeshyFollowup(node.id, $event)"
						@run-scene-decompose="onNodeRunSceneDecompose(node.id)"
						@run-scene-layout="onNodeRunSceneLayout(node.id)"
						@run-scene-understanding="onNodeRunSceneUnderstanding(node.id)"
						@screenshot="onVideoScreenshot(node.id, $event)"
						@select="onSelectNode"
						@select-workflow="onComfyUISelectWorkflow(node.id, $event)"
						@set-selected-placeholder-output="
							onNodeSceneLayoutSelectedPlaceholderOutput(node.id, $event)
						"
						@set-type="onNodeSetType(node.id, $event)"
						@open-node-library="onNodeOpenLibrary(node.id)"
						@start-link="onStartLink($event, vp.screenToWorld)"
						@stop-meshy-task="onNodeStopMeshyTask(node.id)"
						@start-three-preview="onNodeStartThreePreview(node.id)"
						@retry-meshy-fetch="onNodeRetryMeshyFetch(node.id)"
						@open-meshy-task-panel="onOpenMeshyTaskPanel"
						@three-preview-progress="onNodeThreePreviewProgress(node.id, $event)"
						@three-preview-ready="onNodeThreePreviewReady(node.id)"
						@three-preview-error="onNodeThreePreviewError(node.id)"
						@node-chat-update-draft="onNodeChatDraftUpdate"
						@node-chat-update-params="onNodeChatParamsUpdate"
						@node-chat-close="onNodeChatClose"
						@node-chat-submit="onNodeChatSubmit"
						@node-chat-remove-param-ref="onNodeChatRemoveParamRef"
						@update-branch="onStoryBranchUpdate(node.id, $event)"
						@update-comfyui-settings="onComfyUISettingsUpdate(node.id, $event)"
						@update-hide-placeholder-cubes="
							onNodeSceneLayoutHidePlaceholdersUpdate(node.id, $event)
						"
						@update-image-settings="onNodeImageSettingsUpdate(node.id, $event)"
						@update-layout-items="onNodeSceneLayoutItemsUpdate(node.id, $event)"
						@update-lighting-controls="onNodeSceneLayoutLightingControlsUpdate(node.id, $event)"
						@update-lighting-debug="onNodeSceneLayoutLightingDebugUpdate(node.id, $event)"
						@update-lighting-preview="onNodeSceneLayoutLightingPreviewUpdate(node.id, $event)"
						@update-meshy-settings="onNodeMeshySettingsUpdate(node.id, $event)"
						@update-model3d-settings="onNodeModel3DSettingsUpdate(node.id, $event)"
						@update-preview-mode="onNodeSceneLayoutPreviewModeUpdate(node.id, $event)"
						@update-preview-settings="onStoryPreviewSettingsUpdate(node.id, $event)"
						@update-rotate-output="onRotateImageOutput(node.id, $event)"
						@update-scene-understanding-settings="
							onNodeSceneUnderstandingSettingsUpdate(node.id, $event)
						"
						@update-selected-layout-item="onNodeSceneLayoutSelectedItemUpdate(node.id, $event)"
						@update-text-value="onNodeTextValueUpdate(node.id, $event)"
						@update-video-settings="onNodeVideoSettingsUpdate(node.id, $event)"
						@update:world-x="onNodeX(node.id, $event)"
						@update:world-y="onNodeY(node.id, $event)"
						@upload-model-file="onNodeUploadModel3DFile(node.id, $event.file)"
						@upload-resource="onNodeUploadResource(node.id, $event.file, $event.kind)"
						@upload-scene-layout-model-file="
							onNodeUploadSceneLayoutModelFile(node.id, $event.file, $event.objectId)
						"
					/>
				</div>

				<ContextMenu
					:visible="contextMenu.open"
					:x="contextMenu.x"
					:y="contextMenu.y"
					:sections="contextMenuSections"
					@select="onContextMenuSelect"
				/>

				<DwebCanvasNodeSearchMenu
					:visible="nodeSearchMenuVisible"
					:items="NEWUI2_NODE_CATALOG"
					:categories="NEWUI2_NODE_CATALOG_CATEGORIES"
					:top-categories="NEWUI2_NODE_TOP_CATEGORIES"
					:special-groups="NEWUI2_NODE_SPECIAL_GROUPS"
					@select="onNodeSearchMenuSelect"
					@upload-file="onNodeSearchMenuUploadFile"
					@close="closeNodeSearchMenu"
				/>

				<!-- 标签编辑器 -->
				<WorkflowTagEditor
					:visible="tagEditor.visible.value"
					:screenX="tagEditor.screenX.value"
					:screenY="tagEditor.screenY.value"
					:initialLabel="tagEditor.initialLabel.value"
					@commit="tagEditor.commitTag($event)"
					@cancel="tagEditor.closeEditor()"
					@update:visible="tagEditor.visible.value = $event"
				/>
			</BlueprintCanvas>
		</div>

		<!-- UI按钮容器 -->
		<div class="aiwf-ui-container">
			<BottomChatDock
				class="aiwf-chat-dock"
				v-model="chatDraft"
				:messages="chatMessages"
				:sending="chatSending"
				:runState="chatRunState"
				:collapsed="chatCollapsed"
				:taskStatus="chatTaskStatus"
				placement="right-drawer"
				:panelMode="chatPanelMode"
				:agentMode="agentConversationMode"
				:localExecStreamMode="localExecStreamMode"
				:agentWorkingDirectory="agentWorkingDirectory"
				:modelKey="chatModelKey"
				:nanoPreviewUrls="nanoPreviewUrls"
				:nanoPreviewFallbackUrls="nanoPreviewFallbackUrls"
				:nanoPreviewSourcePaths="nanoPreviewSourcePaths"
				:nanoPreviewLoadingStates="nanoPreviewLoadingStates"
				:nanoPreviewDownloadStatuses="nanoPreviewDownloadStatuses"
				:nanoPreviewDownloadProgresses="nanoPreviewDownloadProgresses"
				:nanoPreviewLocalReadyStates="nanoPreviewLocalReadyStates"
				:nanoPreviewUrl="nanoPreviewUrl"
				:nanoStatus="nanoStatus"
				:nanoDetail="nanoDetail"
				:nanoBilling="nanoBilling"
				:nanoModelUsed="nanoModelUsed"
				:nanoAnchorNodeId="NANO_ANCHOR_NODE_ID"
				:nanoRefAnchors="nanoRefDockAnchors"
				:nanoHoverAnchorId="nanoHoverAnchorId"
				:codexSessions="codexSessions"
				:codexActiveSessionId="codexActiveSessionId"
				:codexFlowEvents="codexFlowEvents"
				@send="onSend"
				@stop="onStop"
				@update:panel-mode="chatPanelMode = $event"
				@update:agent-mode="agentConversationMode = $event"
				@update:local-exec-stream-mode="localExecStreamMode = $event"
				@update:model-key="
					(v: unknown) => {
						if (
							typeof v === 'string' &&
							['deepseek', 'nanobanana', 'seedance', 'codex'].includes(v)
						)
							chatModelKey = v as typeof chatModelKey
					}
				"
				@update:active-model-id="chatModelId = $event"
				@nanobanana-generate="onNanoBananaGenerate"
				@seedance-generate="onSeedanceGenerate"
				@codex-create-session="onCodexCreateSession"
				@codex-select-session="onCodexSelectSession"
				@codex-delete-session="onCodexDeleteSession"
				@codex-rename-session="onCodexRenameSession"
				@codex-approval="onCodexApproval"
				@workflow-end-link="onEndLink"
				@request-expand="chatCollapsed = false"
				@request-collapse="chatCollapsed = true"
				@focus-input="chatCollapsed = false"
				@layout-changed="onDockLayoutChanged"
				@safe-area-changed="onDockSafeAreaChanged"
			/>

			<div class="aiwf-overlay-top-left">
				<BlueprintProjectToolbar
					ref="projectToolbarRef"
					:projects="projectList"
					:currentProjectName="currentProjectName"
					:performancePriorityMode="performancePriorityMode"
					:screenshotAnchorsEnabled="screenshotAnchorsEnabled"
					:screenshotParticlesEnabled="screenshotParticlesEnabled"
					:resources="resources"
					:nodes-by-id="store.state.nodesById"
					:node-order="store.state.nodeOrder"
					:current-project-id="currentProjectId"
					:nodeLibraryOpen="false"
					:backendLogOpen="blueprintLogPanelOpen"
					:electronReady="isElectron()"
					:show-repair-assets="true"
					@quick-add="onRailQuickAdd"
					@toggle-node-library="onRailToggleNodeLibrary"
					@toggle-backend-log="onRailToggleBackendLog"
					@open-resource-manager="openResourceDialog"
					@focus-node="onToolbarFocusNode"
					@request-repair-assets="onRequestRepairProjectAssets"
					@request-toggle-performance-priority="performancePriorityMode = !performancePriorityMode"
					@request-toggle-screenshot-anchors="screenshotAnchorsEnabled = !screenshotAnchorsEnabled"
					@request-toggle-screenshot-particles="
						screenshotParticlesEnabled = !screenshotParticlesEnabled
					"
					@request-export-performance-diagnostics="onExportPerfDiagnostics"
					@request-save="onRequestSaveProject"
					@request-load-list="refreshProjectList"
					@request-load-project="onRequestLoadProject"
					@request-delete-project="onRequestDeleteProject"
					@request-import-local="onRequestImportLocalProject"
					@request-import-package="onRequestImportProjectPackage"
					@request-export="onRequestExportProject"
					@request-export-package="onRequestExportProjectPackage"
					@open-meshy-task-panel="onOpenMeshyTaskPanel"
					@open-gemini-task-panel="() => {}"
					@open-seedream-task-panel="() => {}"
				/>

				<div v-if="performancePriorityMode" class="aiwf-perf-stats-panel">
					<div class="aiwf-perf-stats-title">性能监控</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">FPS</span>
						<span class="aiwf-perf-stats-value">{{ perfFpsText }}</span>
					</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">帧耗时</span>
						<span class="aiwf-perf-stats-value">{{ perfFrameText }}</span>
					</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">平均帧</span>
						<span class="aiwf-perf-stats-value">{{ perfAvgFrameText }}</span>
					</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">最差帧</span>
						<span class="aiwf-perf-stats-value">{{ perfWorstFrameText }}</span>
					</div>
					<div class="aiwf-perf-stats-row aiwf-perf-stats-sep">
						<span class="aiwf-perf-stats-label">边计算</span>
						<span class="aiwf-perf-stats-value">{{ perfEdgeComputeText }}</span>
					</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">输入边</span>
						<span class="aiwf-perf-stats-value">{{ perfEdgeInputCountText }}</span>
					</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">渲染边</span>
						<span class="aiwf-perf-stats-value">{{ perfEdgeRenderedText }}</span>
					</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">裁剪边</span>
						<span class="aiwf-perf-stats-value">{{ perfEdgeCulledText }}</span>
					</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">裁剪率</span>
						<span class="aiwf-perf-stats-value">{{ perfEdgeCullHitRateText }}</span>
					</div>
					<div class="aiwf-perf-stats-row aiwf-perf-stats-sep">
						<span class="aiwf-perf-stats-label">节点</span>
						<span class="aiwf-perf-stats-value">{{ perfNodeSummary }}</span>
					</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">长任务</span>
						<span class="aiwf-perf-stats-value">{{ perfLongTaskSummary }}</span>
					</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">缩放</span>
						<span class="aiwf-perf-stats-value">{{ perfZoomText }}</span>
					</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">状态</span>
						<span
							class="aiwf-perf-stats-value"
							:class="
								perfHealthLabel === '稳定'
									? 'is-good'
									: perfHealthLabel === '轻微掉帧'
										? 'is-warn'
										: 'is-bad'
							"
						>
							{{ perfHealthLabel }}
						</span>
					</div>
				</div>
			</div>

			<div class="aiwf-overlay-top-right" :style="overlayTopRightStyle">
				<button
					class="aiwf-inspector-toggle"
					type="button"
					@pointerdown.stop
					@click.stop="toggleInspector"
				>
					属性
				</button>
			</div>

			<div class="aiwf-overlay-floating">
				<WorkflowInspectorPanel
					:open="inspectorOpen"
					:selectedNode="selectedNode"
					:selectedEdge="selectedEdge"
					:selectedNodeResource="selectedNodeResource"
					:actions="selectionActions"
					@update-alias="onAliasChange"
					@update-size="onNodeSizeChange"
					@upload-resource="onInspectorUploadResource"
					@clear-resource="onInspectorClearResource"
					@focus-node="onFocusNode"
					@add-branch="onStoryBranchAdd"
					@remove-branch="onStoryBranchRemove"
					@update-branch="onStoryBranchUpdateFromInspector"
					@action="applyAction"
				/>
			</div>

			<div class="aiwf-overlay-floating aiwf-overlay-floating-utility">
				<MeshyTaskPanel
					:open="meshyTaskDialogOpen"
					:tasks="meshyTaskItems"
					:data-status-text="meshyTaskPanelStatusText"
					:balance-text="meshyBalanceText"
					:balance-detail="meshyBalanceDetail"
					:balance-tone="meshyBalanceTone"
					:refresh-busy="meshyTaskRemoteLoading"
					:detail-task-id="meshyTaskDetailTaskId"
					:detail-task="meshyTaskDetail"
					:detail-loading="meshyTaskDetailLoading"
					:action-busy-task-id="meshyTaskActionBusyTaskId"
					:action-busy-type="meshyTaskActionBusyType"
					@close="closeMeshyTaskDialog"
					@refresh="onRefreshMeshyTaskPanel"
					@preview-task="onPreviewMeshyTask"
					@task-action="onMeshyTaskPanelAction"
				/>

				<VideoTaskPanel
					:open="videoTaskDialogOpen"
					:tasks="videoTaskItems"
					:data-status-text="videoTaskPanelStatusText"
					:refresh-busy="videoTaskLoading"
					:sync-busy="videoTaskSyncing"
					:detail-task-id="videoTaskDetailTaskId"
					:detail-task="videoTaskDetail"
					:detail-loading="videoTaskDetailLoading"
					@close="closeVideoTaskDialog"
					@refresh="refreshVideoTaskItems"
					@sync-remote="syncRemoteVideoTasks"
					@select-task="selectVideoTask"
					@media-error="onVideoTaskPanelMediaError"
				/>

				<ToastStack :items="toasts" @close="removeToast" @hover="setToastHovering" />
			</div>

			<div class="aiwf-overlay-alerts" :style="overlayAlertStyle">
				<div v-if="importLimitAlertMessage" class="aiwf-import-limit-alert" @pointerdown.stop>
					<div class="aiwf-import-limit-alert-title">批量导入超限</div>
					<div class="aiwf-import-limit-alert-body">{{ importLimitAlertMessage }}</div>
					<div class="aiwf-import-limit-alert-actions">
						<button
							class="aiwf-import-limit-alert-btn"
							type="button"
							@click="onConfirmImportLimitAlert"
						>
							确认
						</button>
					</div>
				</div>

				<div v-if="reuseRecordConfirm" class="aiwf-reuse-alert" @pointerdown.stop>
					<div class="aiwf-reuse-alert-title">检测到 Django 记录可复用</div>
					<div class="aiwf-reuse-alert-body">
						模板：{{ reuseRecordConfirm.workflowName || '未知模板' }}
						<br />
						记录时间：{{ formatReuseRecordTime(reuseRecordConfirm.savedAt) }}
					</div>
					<div class="aiwf-reuse-alert-actions">
						<button class="aiwf-reuse-alert-btn" type="button" @click="onCancelReuseRecord">
							取消
						</button>
						<button
							class="aiwf-reuse-alert-btn primary"
							type="button"
							@click="onConfirmReuseRecord"
						>
							确认复用并运行
						</button>
					</div>
				</div>

				<div v-if="meshyTextureConfirm" class="aiwf-reuse-alert" @pointerdown.stop>
					<div class="aiwf-reuse-alert-title">生成贴图前确认</div>
					<div class="aiwf-reuse-alert-body">
						当前未检测到新的贴图提示词或贴图参考图。
						<br />
						若继续提交，将复用当前主模型已有提示词和任务结果来发起贴图。
					</div>
					<div class="aiwf-reuse-alert-actions">
						<button class="aiwf-reuse-alert-btn" type="button" @click="cancelMeshyTextureConfirm">
							取消
						</button>
						<button
							class="aiwf-reuse-alert-btn primary"
							type="button"
							@click="confirmMeshyTextureFollowup"
						>
							确认复用并贴图
						</button>
					</div>
				</div>
			</div>

			<FullscreenProgressOverlay
				:open="importOverlayOpen"
				:title="importOverlayTitle"
				:detail="importOverlayDetail"
				:progress="importOverlayProgress"
				:cancellable="true"
				@cancel="onCancelImportOverlay"
			/>

			<FullscreenProgressOverlay
				:open="recoveryOverlayOpen"
				:title="recoveryOverlayTitle"
				:detail="recoveryOverlayDetail"
				:progress="recoveryOverlayProgress"
				:cancellable="false"
			/>

			<FullscreenProgressOverlay
				:open="screenshotWarmupOpen"
				title="正在生成节点预览缓存"
				:detail="screenshotWarmupDetail || '请稍候，正在为所有节点生成截图缓存以提升蓝图流畅度...'"
				:progress="screenshotWarmupProgress"
				:cancellable="false"
			/>
		</div>
		<BlueprintLogPanel v-model:open="blueprintLogPanelOpen" />
		<AIWorkflowDebugPanel v-if="isWebEnvironment()" :store="store" />
		<AnchorTooltip
			:visible="tooltipState?.visible ?? false"
			:type="tooltipState?.type ?? 'resource'"
			:direction="tooltipState?.direction ?? 'in'"
			:label="tooltipState?.label"
			:accepted-types="tooltipState?.acceptedTypes"
			:compatible="tooltipState?.compatible"
			:position="tooltipState?.position ?? { x: 0, y: 0 }"
		/>

		<!-- 缺失资产确认对话框 -->
		<ModalDialog
			:open="missingAssetDialogOpen"
			title="资源缺失：文件不存在"
			confirmText="移除失效引用"
			closeText="暂不处理"
			@confirm="onConfirmRemoveMissingAsset"
			@close="onCancelMissingAssetDialog"
		>
			<div v-if="missingAssetDialogPending" class="aiwf-missing-asset-dialog">
				<p style="margin-top: 0">
					系统检测到以下静态资源在磁盘上已不存在，但项目数据中仍存在对它的引用。
					这可能是由于文件被手动移动或删除，或从其他设备迁移项目时文件未同步。
				</p>
				<div class="aiwf-missing-asset-info">
					<div class="aiwf-missing-asset-row">
						<span class="aiwf-missing-asset-label">资产名称：</span>
						<span class="aiwf-missing-asset-value">
							<strong>{{ missingAssetDialogPending.assetName }}</strong>
						</span>
					</div>
					<div class="aiwf-missing-asset-row">
						<span class="aiwf-missing-asset-label">请求路径：</span>
						<span class="aiwf-missing-asset-value aiewf-mono">
							{{ missingAssetDialogPending.requestedPath }}
						</span>
					</div>
					<div v-if="missingAssetDialogPending.absolutePath" class="aiwf-missing-asset-row">
						<span class="aiwf-missing-asset-label">磁盘路径：</span>
						<span class="aiwf-missing-asset-value aiewf-mono" style="word-break: break-all">
							{{ missingAssetDialogPending.absolutePath }}
						</span>
					</div>
				</div>

				<div
					v-if="missingAssetDialogPending.sources && missingAssetDialogPending.sources.length > 0"
					class="aiwf-missing-asset-sources"
				>
					<div class="aiwf-missing-asset-sources-title">
						错误调用来源（{{ missingAssetDialogPending.sources.length }} 处引用）：
					</div>
					<ul class="aiwf-missing-asset-source-list">
						<li v-for="(s, i) in missingAssetDialogPending.sources" :key="i">
							<span class="aiwf-source-tag">{{ sourceTypeLabel(s.type) }}</span>
							<span v-if="s.nodeId">
								节点
								<code>{{ s.nodeId }}</code>
								<span v-if="s.nodeType">（{{ s.nodeType }}）</span>
							</span>
							<span v-if="s.resourceId">
								资源
								<code>{{ s.resourceId }}</code>
							</span>
							<span v-if="s.field">
								字段
								<code>{{ s.field }}</code>
							</span>
							<span v-if="s.detail" class="aiwf-source-detail">— {{ s.detail }}</span>
						</li>
					</ul>
				</div>

				<p class="aiwf-missing-asset-tip">
					点击「移除失效引用」将从项目数据中清除上述引用（不会删除磁盘上的其他文件），操作可撤销。
					点击「暂不处理」将保留引用，稍后您可以通过右键菜单或重新导入来修复。
				</p>
			</div>
		</ModalDialog>

		<!-- 撤销最近移除操作的浮动按钮 -->
		<button
			v-if="lastRemovedUndoAvailable"
			type="button"
			class="aiwf-undo-remove-btn"
			@click="onUndoLastRemove"
		>
			↶ 撤销最近一次移除
		</button>
	</div>
</template>

<script setup lang="ts">
import {
	getErrorMessage,
	isRecord,
	isString,
	isNumber,
	isArray,
	hasKey,
	safeGetString,
	safeGetNumber,
	safeGetArray,
	safeGetRecord
} from '../../types/utils'
import * as THREE from 'three'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStore } from 'vuex'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import BlueprintCanvas from '../../ui/BluePrint/BlueprintCanvas.vue'
import WorkflowEdgeLayer from '../../ui/WorkFlow/WorkflowEdgeLayer.vue'
import AnchorTooltip from '../../ui/WorkFlow/AnchorTooltip.vue'
import BlueprintProjectToolbar, {
	type BlueprintProjectListItem
} from '../../ui/WorkFlow/BlueprintProjectToolbar.vue'
import MeshyTaskPanel, {
	type MeshyTaskPanelAction,
	type MeshyTaskPanelDetail,
	type MeshyTaskPanelItem
} from '../../ui/WorkFlow/MeshyTaskPanel.vue'
import VideoTaskPanel from '../../ui/WorkFlow/VideoTaskPanel.vue'
import WorkflowInspectorPanel from '../../ui/UIComponent/WorkflowInspectorPanel.vue'
import BottomChatDock, {
	type BottomChatMessage,
	type ChatPanelMode,
	type LocalExecFlowEvent,
	type LocalExecSessionItem,
	type NanoBananaConfig,
	type SeedanceConfig
} from '../../ui/UIComponent/BottomChatDock.vue'
import ContextMenu from '../../ui/UIComponent/ContextMenu.vue'
import ToastStack from '../../ui/UIComponent/ToastStack.vue'
import FullscreenProgressOverlay from '../../ui/UIComponent/FullscreenProgressOverlay.vue'
import ImageMarkupDialog from '../../ui/WorkFlow/WorlFlowNodes/ImageMarkupDialog.vue'
import DwebCanvasNodeSearchMenu from '../../ui/UIComponent/DwebCanvasNodeSearchMenu.vue'
import { buildDeleteAction, type WorkflowAction } from '../../aiworkflow/actions'
import { exportWorkflowImageOutputPng } from '../../aiworkflow/imageOutput'
import {
	exportWorkflowImageEnforcedPng,
	uvCropToPixelRect,
	type PixelRect
} from '../../aiworkflow/imageCropEnforcer'
import type {
	WorkflowAnchorSpec,
	WorkflowEdge,
	WorkflowImageCrop,
	WorkflowModel3DNodeSettings,
	WorkflowUnrealExportNodeSettings,
	WorkflowUnrealResolvedLayoutExport,
	WorkflowNode,
	WorkflowNodeChatParams,
	WorkflowNodeChatSubmitPayload,
	WorkflowSceneDecomposeOutput,
	WorkflowSelectionTarget,
	WorkflowState
} from '../../aiworkflow/types'
import type { WorkflowResource } from '../../aiworkflow/resource/types'
import {
	buildSnapshotFromState,
	isValidBlueprintSnapshot,
	normalizeSnapshotResourceUrls
} from '../../aiworkflow/persistence/blueprintSnapshot'
import type { AIWorkflowDraftSnapshot } from '../../aiworkflow/persistence/blueprintSnapshot'
import type { AnchorKind } from '../../aiworkflow/domain/link/anchorKinds'
import { AIWorkflowKey } from '../../store/aiworkflow'
import { createDefaultAIWorkflowState } from '../../store/aiworkflow/store'
import { aiWorkflowHistory, ensureAIWorkflowHistory } from '../../adapters/aiWorkflowPersistence'
import { ComfyUIBridgeService } from '../../network/ComfyUIBridgeService'
import type { SeedanceTaskMirrorItem } from '../../network/ComfyUIBridgeService'
import { createLocalExecChatService } from '../../network/LocalExecChatService'
import {
	BlueprintProjectService,
	type BlueprintAssetKind
} from '../../network/BlueprintProjectService'
import { SceneSkillService } from '../../network/SceneSkillService'
import {
	UnrealExportService,
	type UnrealExportJobInfo,
	type UnrealExportSessionInfo
} from '../../network/UnrealExportService'
import { MediaResourceImportManager } from '../../aiworkflow/MediaResourceImportManager'
import { VideoMetadataReadQueue } from '../../aiworkflow/VideoMetadataReadQueue'
import { createVideoFirstFrameThumbnail } from '../../aiworkflow/domain/resource/createVideoFirstFrameThumbnail'
import {
	canUseFileSystemHandles,
	ensureReadPermission,
	getLocalFileHandle,
	putLocalFileHandle
} from '../../aiworkflow/localFileHandleDb'
import {
	resolveBackendUrl,
	resolveBackendFetchUrl,
	isWorkflowLocalAssetUrl,
	getBackendBaseUrl
} from '../../network/backendConfig'
import {
	isElectron,
	openFolderForPath,
	downloadUrlToProjectRoot,
	copyFileToProjectRoot,
	fetchAsArrayBuffer,
	registerProjectRoot,
	repairAllProjectAssets,
	uploadProjectAsset,
	importProjectAsset
} from '../../electronBridge'
import ModalDialog from '../../ui/UIComponent/ModalDialog.vue'
import {
	useAIWorkflow404Fallback,
	type PendingMissingAsset
} from './assets/useAIWorkflow404Fallback'
import { getRuntimePlatform } from '../../network/runtimePlatform'
import AIWorkflowDebugPanel from './ui/AIWorkflowDebugPanel.vue'
import BlueprintLogPanel from '../../ui/WorkFlow/BlueprintLogPanel.vue'
import { blueprintLog } from './blueprint-core/blueprintLog'
import { useAIWorkflowEdgeRenderer } from './blueprint-core/useAIWorkflowEdgeRenderer'
import { useAIWorkflowEdgeIndex } from './blueprint-core/useAIWorkflowEdgeIndex'
import { useAIWorkflowNodeVisibility } from './blueprint-core/useAIWorkflowNodeVisibility'
import { useAIWorkflowCanvasInteraction } from './blueprint-core/canvas-interaction/useAIWorkflowCanvasInteraction'
import { useAIWorkflowLinking } from './blueprint-core/linking/useAIWorkflowLinking'
import { useAIWorkflowNodePresentation } from './node-business/presentation/useAIWorkflowNodePresentation'
import {
	createNodeScreenshotPool,
	SCREENSHOT_PADDING,
	type ScreenshotCacheEntry,
	type ScreenshotPriority
} from './node-screenshot'
import {
	loadAllScreenshotsForBlueprint,
	saveScreenshotToDisk,
	cleanupOldScreenshots
} from './node-screenshot/nodeScreenshotPersistentCache'
import { useSquareParticles } from '../../composables/useSquareParticles'
import { useAIWorkflowRotateImageOutput } from './node-business/presentation/useAIWorkflowRotateImageOutput'
import { useAIWorkflowVideoScreenshot } from './node-business/presentation/useAIWorkflowVideoScreenshot'
import { useAIWorkflowPerfMonitor } from './blueprint-core/useAIWorkflowPerfMonitor'
import { useAIWorkflowSelectionState } from './blueprint-core/useAIWorkflowSelectionState'
import { useAIWorkflowThreejsLifecycleManager } from './blueprint-core/useAIWorkflowThreejsLifecycleManager'
import { useAIWorkflowToastState } from './bridge/feedback/useAIWorkflowToastState'
import { useAIWorkflowViewport } from './blueprint-core/useAIWorkflowViewport'
import { useAIWorkflowContextMenu } from './bridge/component-events/useAIWorkflowContextMenu'
import { useAIWorkflowKeyboardAndResize } from './bridge/component-events/useAIWorkflowKeyboardAndResize'
import { useAIWorkflowNodePreviewContextMenu } from './bridge/component-events/useAIWorkflowNodePreviewContextMenu'
import { useAIWorkflowResourceActions } from './bridge/component-events/useAIWorkflowResourceActions'
import { useAIWorkflowAssetPersistence } from './assets/useAIWorkflowAssetPersistence'
import { useAIWorkflowObjectUrlRegistry } from './assets/useAIWorkflowObjectUrlRegistry'
import { useAIWorkflowImportRecoveryState } from './assets/useAIWorkflowImportRecoveryState'
import { useAIWorkflowNodeAssetBinding } from './assets/useAIWorkflowNodeAssetBinding'
import { useAIWorkflowBatchMediaImport } from './assets/useAIWorkflowBatchMediaImport'
import { useAIWorkflowDropAssets } from './assets/useAIWorkflowDropAssets'
import { useAIWorkflowLocalResourceRecovery } from './assets/useAIWorkflowLocalResourceRecovery'
import { useAIWorkflowNodeResourceCleanup } from './assets/useAIWorkflowNodeResourceCleanup'
import { useAIWorkflowResourceRecordCleanup } from './assets/useAIWorkflowResourceRecordCleanup'
import { useAIWorkflowResourceMigration } from './assets/useAIWorkflowResourceMigration'
import { useAIWorkflowSceneLayoutModelBinding } from './assets/useAIWorkflowSceneLayoutModelBinding'
import {
	buildMeshyNodePresentationSettings,
	getMeshyDisplayThumbnailUrl,
	getMeshyEffectiveImageSource,
	getMeshyEffectiveModelSource,
	isMeshyRemoteUrl,
	pickMeshyEffectiveOutput,
	pickMeshyPreferredFormat,
	pickMeshyPreferredImageUrl,
	pickMeshyPreferredModelUrl
} from './node-business/meshy/useAIWorkflowMeshyAssets'
import { useAIWorkflowMeshyDrop } from './node-business/meshy/useAIWorkflowMeshyDrop'
import { useAIWorkflowMeshyCommands } from './node-business/meshy/useAIWorkflowMeshyCommands'
import { useAIWorkflowMeshyInputResolver } from './node-business/meshy/useAIWorkflowMeshyInputResolver'
import { useAIWorkflowMeshyRequest } from './node-business/meshy/useAIWorkflowMeshyRequest'
import { useAIWorkflowMeshyTaskPanelController } from './node-business/meshy/useAIWorkflowMeshyTaskPanelController'
import { useAIWorkflowMeshyRuntime } from './node-business/meshy/useAIWorkflowMeshyRuntime'
import { useAIWorkflowVideoTaskPanelController } from './node-business/chat/useAIWorkflowVideoTaskPanelController'
import {
	fileExtensionFromUrl,
	normalizeMeshyTaskStatus
} from './node-business/meshy/meshyRuntimeUtils'
import {
	AIWF_PROJECT_PACKAGE_ENTRY,
	sanitizeFileNamePart,
	setValueByJsonPointer
} from './node-business/project/projectPackage'
import { useAIWorkflowProjectIdentity } from './node-business/project/useAIWorkflowProjectIdentity'
import { useAIWorkflowProjectPersistence } from './node-business/project/useAIWorkflowProjectPersistence'
import { useAIWorkflowProjectCatalogImport } from './node-business/project/useAIWorkflowProjectCatalogImport'
import { useAIWorkflowProjectPackageExport } from './node-business/project/useAIWorkflowProjectPackageExport'
import { useAIWorkflowProjectRequests } from './node-business/project/useAIWorkflowProjectRequests'
import { useAIWorkflowProjectSnapshotBuilder } from './node-business/project/useAIWorkflowProjectSnapshotBuilder'
import { useAIWorkflowProjectSnapshotRuntime } from './node-business/project/useAIWorkflowProjectSnapshotRuntime'
import { useAIWorkflowProjectTransfer } from './node-business/project/useAIWorkflowProjectTransfer'
import { useAIWorkflowProjectUnrealSnapshot } from './node-business/project/useAIWorkflowProjectUnrealSnapshot'
import { useAIWorkflowUnrealExportActions } from './node-business/unreal/useAIWorkflowUnrealExportActions'
import { useAIWorkflowChatGeneration } from './node-business/chat/useAIWorkflowChatGeneration'
import {
	comfyOutputForAnchor,
	type ComfyLocalizedOutput
} from './node-business/comfy/comfyOutputResolver'
import { useAIWorkflowComfyConnection } from './node-business/comfy/useAIWorkflowComfyConnection'
import { useAIWorkflowComfyOutputRouter } from './node-business/comfy/useAIWorkflowComfyOutputRouter'
import { useAIWorkflowComfyRuntime } from './node-business/comfy/useAIWorkflowComfyRuntime'
import { useAIWorkflowNodeRefresh } from './node-business/useAIWorkflowNodeRefresh'
import { useAIWorkflowNodeActions } from './node-business/useAIWorkflowNodeActions'
import { useAIWorkflowNodeSettings } from './node-business/useAIWorkflowNodeSettings'
import { useAIWorkflowTextMergeCommands } from './node-business/useAIWorkflowTextMergeCommands'
import { useAIWorkflowMediaPreviewSources } from './node-business/presentation/useAIWorkflowMediaPreviewSources'
import { useAIWorkflowNodeExtraProps } from './node-business/presentation/useAIWorkflowNodeExtraProps'
import {
	useAIWorkflowTextOutputResolver,
	type InputParamPreviewRef
} from './node-business/presentation/useAIWorkflowTextOutputResolver'
import { useAIWorkflowSelectionFrame } from './blueprint-core/selection/useAIWorkflowSelectionFrame'
import { useAIWorkflowTagEditor } from './blueprint-core/selection/useAIWorkflowTagEditor'
import WorkflowTagEditor from '../../ui/WorkFlow/selection/WorkflowTagEditor.vue'
import SelectionFrameOverlay from '../../ui/WorkFlow/selection/SelectionFrameOverlay.vue'
import { isSceneLayoutModelTargetItem } from './node-business/scene/sceneDecomposeShared'
import { useAIWorkflowSceneDecomposeAutoExpand } from './node-business/scene/useAIWorkflowSceneDecomposeAutoExpand'
import { useAIWorkflowSceneDecomposeController } from './node-business/scene/useAIWorkflowSceneDecomposeController'
import { useAIWorkflowSceneImageInputs } from './node-business/scene/useAIWorkflowSceneImageInputs'
import { slugSceneLayoutPlaceholderModelName } from './node-business/scene/sceneLayoutPlaceholderModelUtils'
import { useAIWorkflowSceneLayoutModelBindings } from './node-business/scene/useAIWorkflowSceneLayoutModelBindings'
import { useAIWorkflowSceneLayoutMetadata } from './node-business/scene/useAIWorkflowSceneLayoutMetadata'
import { useAIWorkflowSceneLayoutController } from './node-business/scene/useAIWorkflowSceneLayoutController'
import { useAIWorkflowSceneLayoutSettings } from './node-business/scene/useAIWorkflowSceneLayoutSettings'
import { useAIWorkflowSceneUnderstandingController } from './node-business/scene/useAIWorkflowSceneUnderstandingController'
import type { WorkflowThreePreviewProgressPayload } from '../../ui/WorkFlow/WorlFlowNodes/three-preview/types'
import { useStartupProgress } from '../../composables/useStartupProgress'

interface GeneratedResourceBase {
	id: string
	kind: 'image' | 'video' | 'model3d'
	name: string
	url: string
	projectRelativePath?: string
	sourcePath?: string
	size?: number
	contentType?: string
	format?: string
	sourceFingerprint?: string
	localFileKey?: string
	sourceName?: string
	sourceSize?: number
	sourceLastModified?: number
}

interface UnrealExportJob {
	jobId?: string
	status?: string
	message?: string
	resultData?: {
		stage?: string
		progress?: number
		blueprintAssetPath?: string
		modelsAssetPath?: string
		actorBaseClass?: string
		spawnedLightCount?: number
		lightingTargetActorLabel?: string
		lightingTargetActorPath?: string
		layoutProtocolVersion?: number
		slotCount?: number
		appliedSlotCount?: number
		materialOverrideCount?: number
	}
	exportPayload?: {
		exportMode?: string
	}
	updatedAt?: number
	createdAt?: number
}

interface MissingAssetDialogPending {
	assetName: string
	requestedPath: string
	absolutePath?: string
	sources: Array<{
		type: string
		nodeId?: string
		nodeType?: string
		resourceId?: string
		field?: string
		detail?: string
	}>
}

interface DwebRuntimeWindow {
	__DWEB_RUNTIME__?: {
		isElectron?: boolean
	}
	__DWEB_AIWF_AUTO_HELLO?: string
	__DWEB_AIWF_AUTO_HELLO_TEXT?: string
	__DWEB_LOCAL_EXEC_BASE_PATH?: string
	__DWEB_LOCAL_EXEC_STREAM_MODE?: string
	dweb?: {
		aiworkflow?: {
			onImageMarkupExported?: (callback: (payload: unknown) => void) => number
			offImageMarkupExported?: (listenerId: number) => void
		}
	}
}

interface ElectronFile extends File {
	path?: string
}

interface AssetImportResult {
	ok: boolean
	asset?: {
		url?: string
		absolutePath?: string
		projectRelativePath?: string
		relativePath?: string
		contentType?: string
		size?: number
		sourcePath?: string
	}
}

type PersistedAsset = NonNullable<AssetImportResult['asset']>

interface VideoMetadataResult {
	width?: number
	height?: number
}

interface CodexSessionRow {
	id?: string
	title?: string
	status?: string
	model_name?: string
}

interface CodexMessageRow {
	id?: string
	role?: string
	content?: string
}

interface WorkflowChatMessage extends BottomChatMessage {
	message?: string
	tone?: 'info' | 'warn' | 'error'
	createdAt?: number
}

interface LocalExecListResult {
	items?: unknown[]
	error?: string
}

const router = useRouter()
const route = useRoute()
const startupProgress = useStartupProgress()

const store = useStore<WorkflowState>(AIWorkflowKey)
ensureAIWorkflowHistory()

const AIWF_LAST_PROJECT_STORAGE_KEY = 'dweb.aiworkflow.lastProjectId.v1'

const { viewport, onViewportUpdate, viewportMotionActive, markViewportMotion, canvasViewportSize } =
	useAIWorkflowViewport(store, {
		canvasSelector: '.aiwf-canvas',
		motionResetMs: 140
	})

const performancePriorityMode = ref(false)
const screenshotAnchorsEnabled = ref(true)
const screenshotParticlesEnabled = ref(true)
const compactThresholdNormal = 0.3
const compactThresholdPerf = 0.35
const compactThreshold = computed(() => {
	if (!performancePriorityMode.value) return compactThresholdNormal
	const count = nodes.value.length
	if (count >= 320) return Math.max(compactThresholdPerf, 0.65)
	if (count >= 220) return compactThresholdPerf
	return 0.48
})

const shouldCollapseChatDrawerByViewport = () => true

// NOTE: must be declared before any watch/computed that references it.
const chatModelKey = ref<'deepseek' | 'nanobanana' | 'seedance' | 'codex'>('codex')
const chatModelId = ref<string>('auto')
const chatPanelMode = ref<ChatPanelMode>('regular')
const agentConversationMode = ref<'agent' | 'ask' | 'plan'>('agent')
const chatCollapsed = ref(shouldCollapseChatDrawerByViewport())

const nodes = computed(() =>
	store.state.nodeOrder.map((id) => store.state.nodesById[id]).filter(Boolean)
)
const NANO_ANCHOR_NODE_ID = 'wf-nanobanana-ref-input'
const NANO_REF_IMAGE_MAX = 14

const {
	selectedNodeId,
	selectedNodeIds,
	selectedEdgeId,
	selectedNode,
	selectedEdge,
	selectedNodeResource,
	active3DPreviewNodeId
} = useAIWorkflowSelectionState(store)

// 多选框选框状态管理（Canvas绘制）
const selectionFrame = useAIWorkflowSelectionFrame({
	store,
	selectedNodeIds
})

// 标签编辑器（复用SelectionFrame的坐标）
const tagEditor = useAIWorkflowTagEditor({
	store,
	selectedNodeIds
})

const openSelectionTagEditor = () => {
	if (selectionFrame.worldRect.value && selectionFrame.visible.value) {
		const rect = selectionFrame.worldRect.value
		const canvasW = canvasViewportSize.value?.width ?? 0
		const canvasH = canvasViewportSize.value?.height ?? 0
		const zoom = viewport.value.zoom
		const panX = viewport.value.panX
		const panY = viewport.value.panY
		const centerX = (rect.x0 + rect.x1) / 2
		const centerY = rect.y0
		const screenX = canvasW / 2 + panX + centerX * zoom
		const screenY = canvasH / 2 + panY + centerY * zoom
		tagEditor.openEditor({ screenX: screenX - 90, screenY: screenY - 60 })
	} else {
		tagEditor.openEditor()
	}
}

const {
	getNodePreviewState,
	startPreviewSession,
	updatePreviewProgress,
	completePreviewSession,
	failPreviewSession
} = useAIWorkflowThreejsLifecycleManager({
	active3DPreviewNodeId,
	selectedNodeIds
})

const {
	nodeStyle,
	compactNodeShellStyle,
	nodeComponent,
	nodeImagePreviewUrl,
	nodeImagePreviewVersion,
	nodeResourceUrl,
	nodeResourceName,
	compactNodeImageUrl,
	compactNodeTypeColor,
	compactNodeTypeChinese,
	compactNodeTypeGradient,
	compactNodeTypeCode
} = useAIWorkflowNodePresentation(store)

const clampNodeScale = (zoom: number) => Math.max(0.2, Math.min(6, Number(zoom) || 1))

const screenshotAnchorDefaultOffsets = (idx: number, count: number) => {
	const gap = 24
	const start = -((count - 1) * gap) / 2
	return start + idx * gap
}

const resolveScreenshotAnchors = (node: WorkflowNode, direction: 'in' | 'out') => {
	const raw = direction === 'in' ? node.inputs : node.outputs
	const fallbackId = direction === 'in' ? 'in-0' : 'out-0'
	const fallbackLabel = direction === 'in' ? '入口' : '出口'
	const list =
		Array.isArray(raw) && raw.length > 0 ? raw : [{ id: fallbackId } as WorkflowAnchorSpec]
	return list.map((a, index) => {
		const offsetY =
			typeof a.offsetY === 'number' ? a.offsetY : screenshotAnchorDefaultOffsets(index, list.length)
		return {
			id: String(a.id ?? `${direction}-${index}`),
			index,
			offsetY,
			mediaType: (a.mediaType ?? 'resource') as string,
			label: String(a.label ?? fallbackLabel)
		}
	})
}

const screenshotAnchorTopStyle = (offsetY: number): Record<string, string> => ({
	top: `calc(50% + ${offsetY}px)`
})

const screenshotAnchorClass = (mediaType: string | undefined) => {
	if (mediaType === 'image') return 'wf-anchor-image'
	if (mediaType === 'video') return 'wf-anchor-video'
	if (mediaType === 'text') return 'wf-anchor-text'
	if (mediaType === 'model3d') return 'wf-anchor-model3d'
	if (mediaType === 'flow') return 'wf-anchor-flow'
	if (mediaType === 'audio') return 'wf-anchor-audio'
	if (mediaType === 'meta') return 'wf-anchor-meta'
	return 'wf-anchor-resource'
}

const screenshotNodeStyle = (
	worldToScreen: (point: { x: number; y: number }) => { x: number; y: number },
	worldX: number,
	worldY: number,
	zoom: number,
	width: number,
	height: number
) => {
	const point = worldToScreen({ x: worldX, y: worldY })
	const nodeW = Math.max(80, Math.round(width) || 240)
	const nodeH = Math.max(80, Math.round(height) || 160)
	return {
		left: `${point.x}px`,
		top: `${point.y}px`,
		width: `${nodeW}px`,
		height: `${nodeH}px`,
		transform: `translate(-50%, -50%) scale(${clampNodeScale(zoom)})`
	} as Record<string, string>
}

const screenshotImageStyle = (entry: ScreenshotCacheEntry | undefined) => {
	const padding = entry?.padding ?? SCREENSHOT_PADDING
	return {
		width: `calc(100% + ${padding * 2}px)`,
		height: `calc(100% + ${padding * 2}px)`,
		marginLeft: `${-padding}px`,
		marginTop: `${-padding}px`
	} as Record<string, string>
}

const _screenshotParticleCache = new Map<string, ReturnType<typeof useSquareParticles>>()
const getScreenshotParticles = (nodeId: string) => {
	let cached = _screenshotParticleCache.get(nodeId)
	if (!cached) {
		const seed = Array.from(nodeId).reduce((s, c, i) => s + c.charCodeAt(0) * (i + 1), 0)
		cached = useSquareParticles({ count: 6, seed })
		_screenshotParticleCache.set(nodeId, cached)
	}
	return cached
}

const ensureNanoAnchorNode = () => {
	const existing = store.state.nodesById[NANO_ANCHOR_NODE_ID]
	const inputs: WorkflowAnchorSpec[] = Array.from({ length: NANO_REF_IMAGE_MAX }, (_, i) => ({
		id: `ref-${i + 1}`,
		label: `参考图 ${i + 1}`,
		mediaType: 'image'
	}))
	const node: WorkflowNode = {
		id: NANO_ANCHOR_NODE_ID,
		type: existing?.type || 'base',
		title: 'NanoBanana 参考图输入',
		alias: existing?.alias,
		subtitle: '仅用于对话面板参考图锚点（不在画布显示）',
		worldX: existing?.worldX ?? 0,
		worldY: existing?.worldY ?? 0,
		width: existing?.width ?? 240,
		height: existing?.height ?? 160,
		sizeCustomized: true,
		resourceId: null,
		inputs,
		outputs: [],
		createdAt: existing?.createdAt ?? Date.now()
	}
	store.commit('upsertNode', { node })
}

watch(
	() => chatModelKey.value,
	() => {
		// Ensure the pseudo node exists so edges can be created/persisted.
		ensureNanoAnchorNode()
	},
	{ immediate: true }
)

const isWarmingUpScreenshots = ref(false)
const screenshotWarmupProgress = ref(0)
const screenshotWarmupOpen = ref(false)
const screenshotWarmupDetail = ref('')
const warmupForceRenderNodeIds = ref<Set<string>>(new Set())
const warmupExitingFullRender = ref(false)
const nearDragNodeIds = ref<Set<string>>(new Set())

const autoWireInProgress = ref(false)
const autoWireSourceNodeId = ref<string | null>(null)
const autoWireCreatedNodeIds = ref<string[]>([])

const onAutoWireStart = (sourceNodeId: string) => {
	autoWireInProgress.value = true
	autoWireSourceNodeId.value = sourceNodeId
	autoWireCreatedNodeIds.value = []
	screenshotWarmupOpen.value = true
	screenshotWarmupProgress.value = 0
	screenshotWarmupDetail.value = '正在生成下游节点，请稍候...'
}

const onAutoWireNodeCreated = (nodeId: string) => {
	autoWireCreatedNodeIds.value.push(nodeId)
	const count = autoWireCreatedNodeIds.value.length
	screenshotWarmupDetail.value = `正在生成下游节点... 已创建 ${count} 个节点`
}

const onAutoWireEnd = async () => {
	await warmupAutoWireNodes()
	autoWireInProgress.value = false
	autoWireSourceNodeId.value = null
	autoWireCreatedNodeIds.value = []
}

const {
	renderNodes,
	visibleRenderNodeIds,
	visibleRenderNodes,
	compactNodeDisplayName,
	compactNodeBadge,
	compactNodeMeta,
	compactNodeTooltip,
	compactNodeClass,
	shouldRenderCompactNode,
	compactVisibleNodeCount,
	fullVisibleNodeCount
} = useAIWorkflowNodeVisibility({
	nodes,
	viewport,
	canvasViewportSize,
	selectedNodeIds,
	viewportMotionActive,
	hiddenNodeIds: [NANO_ANCHOR_NODE_ID],
	compactZoomThreshold: compactThreshold,
	screenMargin: 360,
	motionRecomputeMinIntervalMs: 90,
	forceRenderNodeIds: warmupForceRenderNodeIds
})

const safeVisibleSeenSet = new Set<string>()
const safeVisibleResult: WorkflowNode[] = []

const safeVisibleRenderNodes = computed(() => {
	const source = visibleRenderNodes.value
	const sourceLen = source.length

	safeVisibleSeenSet.clear()
	safeVisibleResult.length = 0

	for (let i = 0; i < sourceLen; i++) {
		const node = source[i]
		const nodeId = String(node?.id ?? '').trim()
		if (!nodeId || safeVisibleSeenSet.has(nodeId)) continue
		safeVisibleSeenSet.add(nodeId)
		safeVisibleResult.push(node)
	}

	return safeVisibleResult.slice()
})

const nodeHostRefs = new Map<string, HTMLElement>()
const nodeScreenshotMap = shallowRef(new Map<string, ScreenshotCacheEntry>())
const screenshotPool = createNodeScreenshotPool()
const upstreamCroppedImageUrls = new Map<string, string>()

const getUpstreamCroppedImageUrl = (node: WorkflowNode): string | null => {
	if (node.type !== 'image') return null
	if (node.resourceId) return null
	const inEdge =
		getFirstIncomingEdge(node.id, 'in-image') || getFirstIncomingEdge(node.id, 'in-resource')
	if (!inEdge) return null
	const fromNode = store.state.nodesById[inEdge.fromNodeId] as WorkflowNode | undefined
	if (!fromNode || fromNode.type !== 'image') return null
	const fromResourceId = String(fromNode.resourceId ?? '').trim()
	if (!fromResourceId) return null
	const fromResource = store.state.resourcesById[fromResourceId]
	if (!fromResource) return null
	const src = String(fromResource.url ?? '').trim()
	if (!src) return null
	const fromSettings = fromNode.imageSettings
	if (!fromSettings?.cropEnabled || !fromSettings?.crop) return null
	const ow = Math.max(
		1,
		Math.floor(Number(fromSettings.outputWidth ?? fromSettings.naturalWidth ?? 0))
	)
	const oh = Math.max(
		1,
		Math.floor(Number(fromSettings.outputHeight ?? fromSettings.naturalHeight ?? 0))
	)
	if (!ow || !oh) return null
	return `cropped:${src}|${ow}|${oh}|${JSON.stringify(fromSettings.crop)}`
}

const getCroppedImageUrl = async (rawUrl: string): Promise<string | null> => {
	if (!rawUrl.startsWith('cropped:')) return null
	const parts = rawUrl.slice(9).split('|')
	if (parts.length < 4) return null
	const [src, owStr, ohStr, cropJson] = parts
	const ow = parseInt(owStr, 10)
	const oh = parseInt(ohStr, 10)
	const cropParsed: unknown = JSON.parse(cropJson)
	const isValidCrop = (c: unknown): c is WorkflowImageCrop => {
		if (!isRecord(c)) return false
		return isNumber(c.x) && isNumber(c.y) && isNumber(c.width) && isNumber(c.height)
	}
	if (!src || !ow || !oh || !isValidCrop(cropParsed)) return null
	try {
		const blob = await exportWorkflowImageOutputPng({
			src,
			outputWidth: ow,
			outputHeight: oh,
			crop: cropParsed
		})
		if (!blob) return null
		return URL.createObjectURL(blob)
	} catch {
		return null
	}
}

const clearUpstreamCroppedImageUrl = (nodeId: string) => {
	const cachedUrl = upstreamCroppedImageUrls.get(nodeId)
	if (cachedUrl && cachedUrl.startsWith('blob:')) {
		URL.revokeObjectURL(cachedUrl)
	}
	upstreamCroppedImageUrls.delete(nodeId)
}

watch(
	() => nodes.value,
	(newNodes) => {
		const currentNodeIds = new Set(newNodes.map((n) => String(n?.id ?? '').trim()).filter(Boolean))
		upstreamCroppedImageUrls.forEach((url, nodeId) => {
			if (!currentNodeIds.has(nodeId)) {
				clearUpstreamCroppedImageUrl(nodeId)
			}
		})
	},
	{ deep: true }
)

watch(
	() => store.state.nodesById,
	() => {
		nodes.value.forEach((node) => {
			if (node.type !== 'image') return
			const newCmd = getUpstreamCroppedImageUrl(node)
			const currentUrl = upstreamCroppedImageUrls.get(String(node.id))
			if (newCmd && currentUrl && newCmd !== currentUrl) {
				clearUpstreamCroppedImageUrl(String(node.id))
			}
		})
	},
	{ deep: true }
)

/**
 * 判断节点的几何边界是否与当前视口矩形相交（纯几何计算，不依赖渲染状态）
 */
const isNodeInViewport = (node: WorkflowNode): boolean => {
	const vp = viewport.value
	const { width: vpWidth, height: vpHeight } = canvasViewportSize.value
	if (vpWidth <= 0 || vpHeight <= 0) return true

	const zoom = Math.max(0.01, Number(vp.zoom) || 1)
	const halfW = Math.max(0, Number(node.width) || 0) / 2
	const halfH = Math.max(0, Number(node.height) || 0) / 2
	const nodeLeft = Number(node.worldX) - halfW
	const nodeRight = Number(node.worldX) + halfW
	const nodeTop = Number(node.worldY) - halfH
	const nodeBottom = Number(node.worldY) + halfH

	const centerX = vpWidth / 2
	const centerY = vpHeight / 2
	const viewLeft = (-centerX - vp.panX) / zoom
	const viewRight = (vpWidth - centerX - vp.panX) / zoom
	const viewTop = (-centerY - vp.panY) / zoom
	const viewBottom = (vpHeight - centerY - vp.panY) / zoom

	return (
		nodeRight >= viewLeft && nodeLeft <= viewRight && nodeBottom >= viewTop && nodeTop <= viewBottom
	)
}

const fullRenderNodeIds = computed<Set<string>>(() => {
	// ==========================================
	// Step 1: 核心激活节点（用户直接交互的节点）
	// 这些节点无论是否在视口内，都必须完整渲染
	// ==========================================
	const coreIds = new Set<string>()

	for (const id of selectedNodeIds.value) {
		const nid = String(id ?? '').trim()
		if (nid) coreIds.add(nid)
	}

	const linkFromId = linkingFromNodeId.value
	if (linkFromId) coreIds.add(String(linkFromId))

	const linkHoverId = linkingHoverNodeId.value
	if (linkHoverId) {
		const nid = String(linkHoverId).trim()
		if (nid) coreIds.add(nid)
	}

	if (coreIds.size === 0) return coreIds

	// ==========================================
	// Step 2: 直接邻居节点（仅一层，绝不传递）
	// 必须满足：
	//   1. 与核心节点直接有线连接
	//   2. 节点真正在视口几何范围内
	// ==========================================
	const result = new Set<string>(coreIds)
	const nodesById = store.state.nodesById as Record<string, WorkflowNode | undefined>

	for (const edge of edges.value) {
		const fromId = String(edge?.fromNodeId ?? '').trim()
		const toId = String(edge?.toNodeId ?? '').trim()
		if (!fromId || !toId) continue

		// 注意：只检查 coreIds，不检查 result（防止传递）
		// 邻居的邻居不会被加入，实现"仅直接连接"的需求
		if (coreIds.has(fromId)) {
			const toNode = nodesById[toId]
			if (toNode && isNodeInViewport(toNode)) {
				result.add(toId)
			}
		}
		if (coreIds.has(toId)) {
			const fromNode = nodesById[fromId]
			if (fromNode && isNodeInViewport(fromNode)) {
				result.add(fromId)
			}
		}
	}

	for (const id of warmupForceRenderNodeIds.value) {
		const nid = String(id ?? '').trim()
		if (nid) result.add(nid)
	}

	return result
})

const getNodeScreenshotVersion = (node: WorkflowNode): string => {
	const parts: string[] = []
	parts.push(`t:${node.title || ''}`)
	parts.push(`a:${node.alias || ''}`)
	parts.push(`w:${node.width || 240}`)
	parts.push(`h:${node.height || 160}`)
	parts.push(`tp:${node.type || ''}`)
	parts.push(`st:${resolveNodeRuntimeVisualState(node)}`)

	if (node.subtitle) parts.push(`sub:${node.subtitle}`)

	if (node.type === 'image' && !node.resourceId) {
		const inEdge =
			getFirstIncomingEdge(node.id, 'in-image') || getFirstIncomingEdge(node.id, 'in-resource')
		if (inEdge) {
			const fromNode = store.state.nodesById[inEdge.fromNodeId] as WorkflowNode | undefined
			if (fromNode && fromNode.type === 'image' && fromNode.resourceId) {
				parts.push(`ptfrom:${fromNode.id}`)
				const fromPreviewVer = nodeImagePreviewVersion(fromNode)
				if (fromPreviewVer) parts.push(`ptpv:${fromPreviewVer}`)
				const fromSettings = fromNode.imageSettings
				if (fromSettings) {
					parts.push(`ptiw:${fromSettings.outputWidth || 0}`)
					parts.push(`ptih:${fromSettings.outputHeight || 0}`)
					parts.push(`ptice:${fromSettings.cropEnabled ? '1' : '0'}`)
					if (fromSettings.crop) {
						const c = fromSettings.crop
						parts.push(`pticx:${Math.round((c.x || 0) * 1000) / 1000}`)
						parts.push(`pticy:${Math.round((c.y || 0) * 1000) / 1000}`)
						parts.push(`pticw:${Math.round((c.width || 1) * 1000) / 1000}`)
						parts.push(`ptich:${Math.round((c.height || 1) * 1000) / 1000}`)
					}
				}
			}
		}
	}

	const imageSettings = node.imageSettings
	if (imageSettings) {
		parts.push(`img:${imageSettings.outputWidth || 0}`)
		parts.push(`imh:${imageSettings.outputHeight || 0}`)
		parts.push(`imce:${imageSettings.cropEnabled ? '1' : '0'}`)
		if (imageSettings.crop) {
			const c = imageSettings.crop
			parts.push(`imcx:${Math.round((c.x || 0) * 1000) / 1000}`)
			parts.push(`imcy:${Math.round((c.y || 0) * 1000) / 1000}`)
			parts.push(`imcw:${Math.round((c.width || 1) * 1000) / 1000}`)
			parts.push(`imch:${Math.round((c.height || 1) * 1000) / 1000}`)
		}
	}

	const videoSettings = node.videoSettings
	if (videoSettings) {
		parts.push(`vw:${videoSettings.outputWidth || 0}`)
		parts.push(`vh:${videoSettings.outputHeight || 0}`)
	}

	const textValue = node.textValue
	if (textValue) parts.push(`txt:${String(textValue).slice(0, 100)}`)

	const previewVer = nodeImagePreviewVersion(node)
	if (previewVer) parts.push(`pv:${previewVer}`)

	return parts.join('|')
}

const findNodeElementForScreenshot = (hostEl: HTMLElement): HTMLElement | null => {
	if (!hostEl) return null
	const children = Array.from(hostEl.children)
	for (const child of children) {
		if (child.classList.contains('aiwf-node-compact')) continue
		if (child.classList.contains('aiwf-node-screenshot-host')) continue
		if (child instanceof HTMLElement) {
			return child
		}
	}
	if (hostEl.classList.contains('wf-node')) return hostEl
	return hostEl.querySelector('.wf-node') as HTMLElement | null
}

const scheduleNodeScreenshot = async (
	node: WorkflowNode,
	retryCount: number = 0,
	priority: ScreenshotPriority = 'normal'
) => {
	const nodeId = String(node?.id ?? '').trim()
	if (!nodeId) return
	if (selectedNodeIds.value.includes(nodeId)) return
	if (fullRenderNodeIds.value.has(nodeId)) return

	const hostEl = nodeHostRefs.get(nodeId)
	if (!hostEl) {
		if (retryCount < 3) {
			setTimeout(() => scheduleNodeScreenshot(node, retryCount + 1, priority), 100)
		}
		return
	}

	const version = getNodeScreenshotVersion(node)
	if (screenshotPool.hasCachedScreenshot(nodeId, version)) {
		const cached = screenshotPool.getCachedScreenshot(nodeId, version)
		if (cached) {
			const newMap = new Map(nodeScreenshotMap.value)
			newMap.set(nodeId, cached)
			nodeScreenshotMap.value = newMap
		}
		return
	}

	let nodeEl = findNodeElementForScreenshot(hostEl)
	if (!nodeEl) {
		if (retryCount < 5) {
			await nextTick()
			await waitForFrames(2)
			nodeEl = findNodeElementForScreenshot(hostEl)
			if (!nodeEl) {
				setTimeout(() => scheduleNodeScreenshot(node, retryCount + 1, priority), 150)
				return
			}
		} else {
			return
		}
	}

	let croppedImageUrl: string | null = upstreamCroppedImageUrls.get(nodeId) || null
	if (!croppedImageUrl) {
		const croppedCmd = getUpstreamCroppedImageUrl(node)
		if (croppedCmd) {
			const generatedUrl = await getCroppedImageUrl(croppedCmd)
			if (generatedUrl) {
				croppedImageUrl = generatedUrl
				upstreamCroppedImageUrls.set(nodeId, generatedUrl)
			}
		}
	}

	const originalImgSrcs: Map<HTMLImageElement, string> = new Map()
	if (croppedImageUrl) {
		const imgEls = nodeEl.querySelectorAll('.wf-media-img')
		imgEls.forEach((img) => {
			if (img instanceof HTMLImageElement && img.src && !img.src.startsWith('data:')) {
				originalImgSrcs.set(img, img.src)
				img.src = croppedImageUrl as string
			}
		})
	}

	try {
		const width = Math.max(80, Math.round(node.width) || 240)
		const height = Math.max(80, Math.round(node.height) || 160)
		const entry = await screenshotPool.queueScreenshot(
			nodeId,
			nodeEl,
			version,
			width,
			height,
			SCREENSHOT_PADDING,
			priority
		)
		if (entry?.dataUrl) {
			const newMap = new Map(nodeScreenshotMap.value)
			newMap.set(nodeId, entry)
			nodeScreenshotMap.value = newMap
			const cacheCtx = getScreenshotCacheContext()
			void saveScreenshotToDisk(
				cacheCtx.projectId,
				cacheCtx.blueprintId,
				nodeId,
				version,
				entry.dataUrl,
				entry.width,
				entry.height
			)
		}
	} catch (err) {
		console.warn('[Screenshot] failed for node:', nodeId, err)
	} finally {
		originalImgSrcs.forEach((src, img) => {
			img.src = src
		})
	}
}

let screenshotScheduleTimer: ReturnType<typeof setTimeout> | null = null
const scheduleVisibleNodeScreenshots = () => {
	if (screenshotScheduleTimer) {
		clearTimeout(screenshotScheduleTimer)
	}
	screenshotScheduleTimer = setTimeout(() => {
		screenshotScheduleTimer = null
		if (viewportMotionActive.value) return

		const visibleNodes = safeVisibleRenderNodes.value
		const fullRenderSet = fullRenderNodeIds.value
		const unselectedNodes = visibleNodes.filter((n) => {
			const nid = String(n?.id ?? '').trim()
			return nid && !selectedNodeIds.value.includes(nid) && !fullRenderSet.has(nid)
		})

		let scheduled = 0
		for (const node of unselectedNodes) {
			if (scheduled >= 3) break
			const nodeId = node.id
			const version = getNodeScreenshotVersion(node)
			const cached = screenshotPool.getCachedScreenshot(nodeId, version)
			if (cached) {
				const newMap = new Map(nodeScreenshotMap.value)
				newMap.set(nodeId, cached)
				nodeScreenshotMap.value = newMap
				continue
			}
			if (!screenshotPool.hasCachedScreenshot(nodeId, version)) {
				const hostEl = nodeHostRefs.get(nodeId)
				if (hostEl) {
					const nodeEl = findNodeElementForScreenshot(hostEl)
					if (nodeEl) {
						void scheduleNodeScreenshot(node, 0, 'high')
						scheduled++
					}
				}
			}
		}
	}, 250)
}

const getScreenshotCacheContext = () => {
	const pid = String(currentProjectId.value || 'default')
	const bpId = String(route.path || 'main')
	return { projectId: pid, blueprintId: bpId }
}

const warmupAllNodeScreenshots = async () => {
	const allNodes = nodes.value.filter((n) => {
		const nodeId = String(n?.id ?? '').trim()
		return nodeId
	})
	if (allNodes.length === 0) return

	const validNodeIds = new Set(allNodes.map((n) => String(n.id)))
	screenshotPool.pruneToValidNodes(validNodeIds)

	screenshotWarmupOpen.value = true
	screenshotWarmupProgress.value = 0
	screenshotWarmupDetail.value = '准备中...'

	const cacheCtx = getScreenshotCacheContext()
	void cleanupOldScreenshots(7 * 24 * 60 * 60 * 1000)

	await nextTick()

	const visibleNodeIds = new Set(safeVisibleRenderNodes.value.map((n) => String(n.id)))

	const newMap = new Map<string, ScreenshotCacheEntry>()

	let diskLoadedCount = 0
	screenshotWarmupProgress.value = 0.05
	screenshotWarmupDetail.value = '正在加载磁盘缓存...'
	try {
		const diskCache = await loadAllScreenshotsForBlueprint(cacheCtx.projectId, cacheCtx.blueprintId)
		for (const node of allNodes) {
			const nodeId = node.id
			if (selectedNodeIds.value.includes(nodeId)) continue
			const version = getNodeScreenshotVersion(node)
			const diskEntry = diskCache.get(nodeId)
			if (diskEntry && diskEntry.version === version && diskEntry.dataUrl) {
				const screenshotEntry: ScreenshotCacheEntry = {
					nodeId,
					version,
					dataUrl: diskEntry.dataUrl,
					width: diskEntry.width,
					height: diskEntry.height,
					padding: SCREENSHOT_PADDING,
					capturedAt: Date.now()
				}
				newMap.set(nodeId, screenshotEntry)
				screenshotPool.prefillCache(
					nodeId,
					version,
					diskEntry.dataUrl,
					diskEntry.width,
					diskEntry.height,
					SCREENSHOT_PADDING
				)
				diskLoadedCount++
			}
		}
	} catch (err) {
		console.warn('[Screenshot Warmup] load from disk failed:', err)
	}

	const nodesNeedingCapture: WorkflowNode[] = []
	for (const node of allNodes) {
		const nodeId = node.id
		if (selectedNodeIds.value.includes(nodeId)) continue
		const version = getNodeScreenshotVersion(node)
		if (screenshotPool.hasCachedScreenshot(nodeId, version)) {
			const cached = screenshotPool.getCachedScreenshot(nodeId, version)
			if (cached) newMap.set(nodeId, cached)
			continue
		}
		if (newMap.has(nodeId)) continue
		nodesNeedingCapture.push(node)
	}

	nodesNeedingCapture.sort((a, b) => {
		const aVisible = visibleNodeIds.has(String(a.id))
		const bVisible = visibleNodeIds.has(String(b.id))
		if (aVisible && !bVisible) return -1
		if (!aVisible && bVisible) return 1
		return 0
	})

	const total = nodesNeedingCapture.length
	const cachedCount = allNodes.length - total - selectedNodeIds.value.length

	nodeScreenshotMap.value = newMap

	if (total === 0) {
		await nextTick()
		await waitForFrames(1)
		screenshotWarmupOpen.value = false
		screenshotWarmupDetail.value = ''
		return
	}

	warmupForceRenderNodeIds.value = new Set(nodesNeedingCapture.map((n) => String(n.id)))
	isWarmingUpScreenshots.value = true

	screenshotPool.setConcurrency(screenshotPool.getWarmupConcurrency())
	screenshotPool.setBurstMode(true)

	await waitForFrames(2)

	screenshotWarmupProgress.value = 0.1
	screenshotWarmupDetail.value = `共 ${allNodes.length - selectedNodeIds.value.length} 个节点，${cachedCount + diskLoadedCount} 个已缓存（磁盘${diskLoadedCount}），准备截图...`

	let screenshotStarted = 0
	let screenshotCompleted = 0
	const nodeElMap = new Map<string, HTMLElement>()
	const startedSet = new Set<string>()
	const promises: Promise<void>[] = []

	const startScreenshot = (node: WorkflowNode, nodeEl: HTMLElement | null) => {
		const nodeId = String(node.id ?? '').trim()
		if (startedSet.has(nodeId)) return
		startedSet.add(nodeId)
		screenshotStarted++

		const isVisible = visibleNodeIds.has(nodeId)
		const promise = (async () => {
			let entry: ScreenshotCacheEntry | null = null
			try {
				const version = getNodeScreenshotVersion(node)
				let el: HTMLElement | null = nodeEl
				if (!el) {
					let retries = 0
					while (retries < 5 && !el) {
						await nextTick()
						await waitForFrames(2)
						const hostEl = nodeHostRefs.get(nodeId)
						if (hostEl) {
							el = findNodeElementForScreenshot(hostEl)
						}
						retries++
					}
				}
				if (el) {
					const width = Math.max(80, Math.round(node.width) || 240)
					const height = Math.max(80, Math.round(node.height) || 160)
					const priority: ScreenshotPriority = isVisible ? 'high' : 'normal'
					entry = await screenshotPool.queueScreenshot(
						nodeId,
						el,
						version,
						width,
						height,
						SCREENSHOT_PADDING,
						priority
					)
					if (entry?.dataUrl) {
						newMap.set(nodeId, entry)
						void saveScreenshotToDisk(
							cacheCtx.projectId,
							cacheCtx.blueprintId,
							nodeId,
							version,
							entry.dataUrl,
							entry.width,
							entry.height
						)
					}
				}
			} catch (err) {
				console.warn('[Screenshot Warmup] failed for node:', nodeId, err)
			}

			screenshotCompleted++
			const ratio = screenshotCompleted / total
			screenshotWarmupProgress.value = 0.1 + ratio * 0.9
			screenshotWarmupDetail.value = `共 ${allNodes.length - selectedNodeIds.value.length} 个节点，正在截图 ${screenshotCompleted}/${total}...`
		})()
		promises.push(promise)
	}

	let waitFrames = 0
	const MAX_WAIT_FRAMES = 30
	while (screenshotStarted < total && waitFrames < MAX_WAIT_FRAMES) {
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
		waitFrames++

		for (const node of nodesNeedingCapture) {
			const nodeId = String(node.id ?? '').trim()
			if (startedSet.has(nodeId)) continue
			const hostEl = nodeHostRefs.get(nodeId)
			if (hostEl) {
				const nodeEl = findNodeElementForScreenshot(hostEl)
				if (nodeEl) {
					nodeElMap.set(nodeId, nodeEl)
					startScreenshot(node, nodeEl)
				}
			}
		}

		if (screenshotCompleted === total) break

		if (screenshotStarted > 0) {
			const ratio = screenshotStarted / total
			screenshotWarmupProgress.value = 0.1 + ratio * 0.15 + (screenshotCompleted / total) * 0.75
			screenshotWarmupDetail.value = `共 ${allNodes.length - selectedNodeIds.value.length} 个节点，正在截图 ${screenshotCompleted}/${total}（渲染就绪 ${screenshotStarted}）...`
		}
	}

	for (const node of nodesNeedingCapture) {
		const nodeId = String(node.id ?? '').trim()
		if (startedSet.has(nodeId)) continue
		const hostEl = nodeHostRefs.get(nodeId)
		const nodeEl = hostEl ? findNodeElementForScreenshot(hostEl) : null
		startScreenshot(node, nodeEl)
	}

	await Promise.all(promises)

	screenshotPool.setBurstMode(false)
	screenshotPool.resetConcurrency()

	nodeScreenshotMap.value = newMap
	isWarmingUpScreenshots.value = false
	warmupExitingFullRender.value = true
	warmupForceRenderNodeIds.value = new Set()
	await nextTick()
	warmupExitingFullRender.value = false
	screenshotWarmupDetail.value = `截图完成，共 ${allNodes.length - selectedNodeIds.value.length} 个节点（磁盘缓存${diskLoadedCount}）`
	await waitForFrames(2)
	screenshotWarmupOpen.value = false
	screenshotWarmupDetail.value = ''
}

const warmupAutoWireNodes = async (): Promise<void> => {
	const newNodeIds = autoWireCreatedNodeIds.value
	if (newNodeIds.length === 0) return

	const newNodes = newNodeIds
		.map((id) => store.state.nodesById[id])
		.filter(Boolean) as WorkflowNode[]
	if (newNodes.length === 0) return

	isWarmingUpScreenshots.value = true
	screenshotWarmupOpen.value = true
	screenshotWarmupProgress.value = 0
	screenshotWarmupDetail.value = `正在渲染 ${newNodes.length} 个新节点...`

	warmupForceRenderNodeIds.value = new Set(newNodeIds)

	await waitForFrames(2)

	const newMap = new Map(nodeScreenshotMap.value)
	const nodesNeedingCapture: WorkflowNode[] = []

	for (const node of newNodes) {
		const nodeId = String(node.id ?? '').trim()
		if (!nodeId) continue
		if (selectedNodeIds.value.includes(nodeId)) continue
		const version = getNodeScreenshotVersion(node)
		if (screenshotPool.hasCachedScreenshot(nodeId, version)) {
			const cached = screenshotPool.getCachedScreenshot(nodeId, version)
			if (cached) newMap.set(nodeId, cached)
			continue
		}
		nodesNeedingCapture.push(node)
	}

	const total = nodesNeedingCapture.length
	if (total === 0) {
		nodeScreenshotMap.value = newMap
		isWarmingUpScreenshots.value = false
		warmupExitingFullRender.value = true
		warmupForceRenderNodeIds.value = new Set()
		await nextTick()
		warmupExitingFullRender.value = false
		await waitForFrames(1)
		screenshotWarmupOpen.value = false
		screenshotWarmupDetail.value = ''
		return
	}

	screenshotPool.setConcurrency(screenshotPool.getWarmupConcurrency())
	screenshotPool.setBurstMode(true)

	screenshotWarmupProgress.value = 0.02
	screenshotWarmupDetail.value = `正在生成新节点预览 0/${total}...`

	let screenshotStarted = 0
	let screenshotCompleted = 0
	const nodeElMap = new Map<string, HTMLElement>()
	const startedSet = new Set<string>()
	const promises: Promise<void>[] = []

	const startScreenshot = (node: WorkflowNode, nodeEl: HTMLElement) => {
		const nodeId = String(node.id ?? '').trim()
		if (startedSet.has(nodeId)) return
		startedSet.add(nodeId)
		screenshotStarted++

		const promise = (async () => {
			let entry: ScreenshotCacheEntry | null = null
			try {
				const version = getNodeScreenshotVersion(node)
				let el: HTMLElement | null = nodeEl
				if (!el) {
					let retries = 0
					while (retries < 8 && !el) {
						await nextTick()
						await waitForFrames(2)
						const hostEl = nodeHostRefs.get(nodeId)
						if (hostEl) {
							el = findNodeElementForScreenshot(hostEl)
						}
						retries++
					}
				}
				if (el) {
					const width = Math.max(80, Math.round(node.width) || 240)
					const height = Math.max(80, Math.round(node.height) || 160)
					entry = await screenshotPool.queueScreenshot(
						nodeId,
						el,
						version,
						width,
						height,
						SCREENSHOT_PADDING,
						'high'
					)
					if (entry?.dataUrl) {
						newMap.set(nodeId, entry)
						const cacheCtx = getScreenshotCacheContext()
						void saveScreenshotToDisk(
							cacheCtx.projectId,
							cacheCtx.blueprintId,
							nodeId,
							version,
							entry.dataUrl,
							entry.width,
							entry.height
						)
					}
				}
			} catch (err) {
				console.warn('[AutoWire Warmup] failed for node:', nodeId, err)
			}

			screenshotCompleted++
			screenshotWarmupProgress.value = screenshotCompleted / total
			screenshotWarmupDetail.value = `正在生成新节点预览 ${screenshotCompleted}/${total}...`
		})()
		promises.push(promise)
	}

	let waitFrames = 0
	const MAX_WAIT_FRAMES = 30
	while (screenshotStarted < total && waitFrames < MAX_WAIT_FRAMES) {
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
		waitFrames++

		for (const node of nodesNeedingCapture) {
			const nodeId = String(node.id ?? '').trim()
			if (startedSet.has(nodeId)) continue
			const hostEl = nodeHostRefs.get(nodeId)
			if (hostEl) {
				const nodeEl = findNodeElementForScreenshot(hostEl)
				if (nodeEl) {
					nodeElMap.set(nodeId, nodeEl)
					startScreenshot(node, nodeEl)
				}
			}
		}

		if (screenshotCompleted === total) break

		if (screenshotStarted === 0) {
			screenshotWarmupProgress.value = 0.02 + (waitFrames / MAX_WAIT_FRAMES) * 0.08
			screenshotWarmupDetail.value = `正在等待节点渲染...`
		} else {
			const pending = screenshotStarted - screenshotCompleted
			screenshotWarmupProgress.value =
				(screenshotStarted / total) * 0.15 + (screenshotCompleted / total) * 0.85
			screenshotWarmupDetail.value = `正在生成新节点预览 ${screenshotCompleted}/${total}（渲染中 ${pending}）...`
		}
	}

	for (const node of nodesNeedingCapture) {
		const nodeId = String(node.id ?? '').trim()
		if (startedSet.has(nodeId)) continue
		const hostEl = nodeHostRefs.get(nodeId)
		const nodeEl = hostEl ? findNodeElementForScreenshot(hostEl) : null
		startScreenshot(node, nodeEl as HTMLElement)
	}

	await Promise.all(promises)

	screenshotPool.setBurstMode(false)
	screenshotPool.resetConcurrency()

	nodeScreenshotMap.value = newMap
	isWarmingUpScreenshots.value = false
	warmupExitingFullRender.value = true
	warmupForceRenderNodeIds.value = new Set()
	await nextTick()
	warmupExitingFullRender.value = false
	screenshotWarmupDetail.value = `新节点预热完成，共 ${newNodes.length} 个节点`
	await waitForFrames(2)
	screenshotWarmupOpen.value = false
	screenshotWarmupDetail.value = ''
}

const waitForFrames = (count = 2): Promise<void> => {
	return new Promise((resolve) => {
		let remaining = count
		const tick = () => {
			if (--remaining <= 0) resolve()
			else requestAnimationFrame(tick)
		}
		requestAnimationFrame(tick)
	})
}

watch(
	() => [viewport.value.zoom, viewport.value.panX, viewport.value.panY],
	() => {
		nextTick(() => {
			scheduleVisibleNodeScreenshots()
		})
	},
	{ flush: 'post' }
)

watch(
	() => viewportMotionActive.value,
	(isActive) => {
		if (!isActive) {
			nextTick(() => {
				scheduleVisibleNodeScreenshots()
			})
		}
	},
	{ flush: 'post' }
)

watch(
	() => safeVisibleRenderNodes.value,
	() => {
		nextTick(() => {
			scheduleVisibleNodeScreenshots()
		})
	},
	{ deep: true, flush: 'post' }
)

const previousNodeSizes = new Map<string, { w: number; h: number }>()
const nodesNeedingScreenshotRefresh = new Set<string>()
watch(
	() => nodes.value.map((n) => ({ id: n.id, w: n.width, h: n.height })),
	(newSizes) => {
		const currentFullRenderIds = fullRenderNodeIds.value
		const resizedNodes: WorkflowNode[] = []
		for (const s of newSizes) {
			const nodeId = String(s.id ?? '').trim()
			if (!nodeId) continue
			const prev = previousNodeSizes.get(nodeId)
			const w = Math.max(80, Math.round(s.w || 240))
			const h = Math.max(80, Math.round(s.h || 160))
			if (prev && (Math.abs(prev.w - w) >= 1 || Math.abs(prev.h - h) >= 1)) {
				const node = nodes.value.find((n) => String(n.id) === nodeId)
				if (node) {
					screenshotPool.invalidateScreenshot(nodeId)
					if (currentFullRenderIds.has(nodeId)) {
						nodesNeedingScreenshotRefresh.add(nodeId)
					} else {
						resizedNodes.push(node)
					}
					const newMap = new Map(nodeScreenshotMap.value)
					newMap.delete(nodeId)
					nodeScreenshotMap.value = newMap
				}
			}
			previousNodeSizes.set(nodeId, { w, h })
		}
		if (resizedNodes.length > 0) {
			nextTick(() => {
				setTimeout(() => {
					for (const node of resizedNodes) {
						void scheduleNodeScreenshot(node, 0, 'normal')
					}
				}, 200)
			})
		}
	},
	{ deep: true, flush: 'post' }
)

watch(
	() => selectedNodeIds.value,
	() => {
		nextTick(() => {
			scheduleVisibleNodeScreenshots()
		})
	},
	{ deep: true, flush: 'post' }
)

let hasWarmedUp = false
watch(
	() => nodes.value.length,
	(count, prevCount) => {
		if (
			count > 0 &&
			(!prevCount || prevCount === 0) &&
			!hasWarmedUp &&
			!isWarmingUpScreenshots.value
		) {
			hasWarmedUp = true
			setTimeout(() => {
				warmupAllNodeScreenshots().catch((err) => {
					console.warn('[Screenshot Warmup] failed:', err)
					isWarmingUpScreenshots.value = false
					screenshotWarmupOpen.value = false
				})
			}, 150)
		}
	},
	{ immediate: true, flush: 'post' }
)

onMounted(() => {
	setTimeout(() => {
		scheduleVisibleNodeScreenshots()
	}, 1000)
})

type NodeRuntimeVisualState = 'idle' | 'running' | 'error'

const normalizeRuntimeStatus = (value: unknown): NodeRuntimeVisualState => {
	const raw = String(value ?? '')
		.trim()
		.toLowerCase()
	if (!raw) return 'idle'
	if (raw === 'error' || raw === 'failed') return 'error'
	if (
		raw === 'running' ||
		raw === 'loading-models' ||
		raw === 'connecting' ||
		raw === 'waiting' ||
		raw === 'exporting' ||
		raw === 'pending' ||
		raw === 'downloading' ||
		raw === 'importing' ||
		raw === 'assembling-actor' ||
		raw === 'applying-lighting' ||
		raw === 'canceling'
	) {
		return 'running'
	}
	return 'idle'
}

const resolveNodeRuntimeVisualState = (node: WorkflowNode): NodeRuntimeVisualState => {
	const statuses: NodeRuntimeVisualState[] = []
	statuses.push(normalizeRuntimeStatus(node.sceneUnderstandingSettings?.status))
	statuses.push(normalizeRuntimeStatus(node.sceneLayoutSettings?.status))
	statuses.push(normalizeRuntimeStatus(node.sceneDecomposeSettings?.status))
	statuses.push(normalizeRuntimeStatus(node.unrealExportSettings?.connectionStatus))
	statuses.push(normalizeRuntimeStatus(node.unrealExportSettings?.lastExportStatus))
	statuses.push(normalizeRuntimeStatus(node.comfyuiSettings?.status))
	statuses.push(normalizeRuntimeStatus(node.comfyuiSettings?.runStatus))
	statuses.push(normalizeRuntimeStatus(node.meshySettings?.meshyTaskStatus))
	if (statuses.includes('error')) return 'error'
	if (statuses.includes('running')) return 'running'
	return 'idle'
}

const compactNodeStateClass = (node: WorkflowNode) => {
	const isPrimarySelected = selectedNodeId.value === node.id
	const isSelected = selectedNodeIds.value.includes(node.id)
	const state = resolveNodeRuntimeVisualState(node)
	return {
		'is-primary-selected': isPrimarySelected,
		'is-secondary-selected': isSelected && !isPrimarySelected,
		'is-running': state === 'running',
		'is-error': state === 'error'
	}
}

const compactNodeStateLabel = (node: WorkflowNode) => {
	const state = resolveNodeRuntimeVisualState(node)
	if (state === 'running') return '运行中'
	if (state === 'error') return '异常'
	return ''
}

const edgeWorkerMutationEpoch = computed(() => {
	const selectedIds = selectedNodeIds.value
	const visibleNodes = safeVisibleRenderNodes.value
	let hash = (selectedIds.length * 131 + visibleNodes.length * 977) % 2147483647
	for (let i = 0; i < selectedIds.length; i++) {
		const id = selectedIds[i]
		for (let j = 0; j < id.length; j++) {
			hash = (hash * 31 + id.charCodeAt(j)) % 2147483647
		}
	}
	const sampleStep = Math.max(1, Math.floor(visibleNodes.length / 16))
	for (let i = 0; i < visibleNodes.length; i += sampleStep) {
		const node = visibleNodes[i]
		const id = String(node.id ?? '')
		for (let j = 0; j < id.length; j++) {
			hash = (hash * 31 + id.charCodeAt(j)) % 2147483647
		}
		const type = String(node.type ?? '')
		for (let j = 0; j < type.length; j++) {
			hash = (hash * 17 + type.charCodeAt(j)) % 2147483647
		}
	}
	return String(hash)
})

const {
	edges,
	renderEdges,
	getIncomingEdges,
	getOutgoingEdges,
	getFirstIncomingEdge,
	hasIncomingEdge,
	hasOutgoingEdge,
	hasExactEdge
} = useAIWorkflowEdgeIndex({
	store,
	visibleRenderNodeIds,
	chatModelKey,
	chatCollapsed,
	nanoAnchorNodeId: NANO_ANCHOR_NODE_ID
})

const hasNanoDockEdge = computed(() =>
	edges.value.some(
		(edge) => edge.toNodeId === NANO_ANCHOR_NODE_ID || edge.fromNodeId === NANO_ANCHOR_NODE_ID
	)
)
const edgeWorkerEnabled = computed(
	() =>
		!hasNanoDockEdge.value &&
		viewportMotionActive.value === true &&
		selectedNodeIds.value.length === 0
)

const chatDraft = computed({
	get: () => store.state.chatDraft ?? '',
	set: (v: string) => store.commit('setChatDraft', { text: v })
})

const nodeChatDialog = computed(() => store.state.nodeChatDialog)

const onNodeChatDraftUpdate = (text: string) => {
	store.commit('setNodeChatDraft', { text })
}

const onNodeChatParamsUpdate = (params: WorkflowNodeChatParams) => {
	store.commit('setNodeChatParams', { params })
}

const onNodeChatClose = () => {
	store.dispatch('closeNodeChatDialog')
}

const toFileUrlFromSourcePath = (): string => {
	return ''
}

const isStrictLocalRenderableUrl = (rawUrl: string): boolean => {
	const text = String(rawUrl || '').trim()
	if (!text) return false
	if (text.toLowerCase().startsWith('dweb://project-assets')) return true
	return false
}

const finalizeGeneratedResourceLocalUrl = (base: GeneratedResourceBase, pid: number) => {
	const relRaw = base?.projectRelativePath
	const rel = String(typeof relRaw === 'string' && relRaw ? relRaw : '').trim()
	const sourcePath = String(base?.sourcePath || '').trim()
	const currentUrl = String(base?.url || '').trim()

	console.log('[finalizeGeneratedResourceLocalUrl] input:', {
		relRaw,
		rel,
		sourcePath,
		currentUrl,
		currentProjectRootPath: currentProjectRootPath.value
	})

	if (rel && rel !== 'undefined' && rel !== 'null') {
		base.url = `dweb://project-assets?projectId=${pid}&path=${encodeURIComponent(rel)}`
		console.log('[finalizeGeneratedResourceLocalUrl] using rel:', base.url)
		return
	}
	if (currentUrl.toLowerCase().startsWith('dweb://project-assets')) {
		base.url = currentUrl
		console.log('[finalizeGeneratedResourceLocalUrl] keeping existing dweb url:', base.url)
		return
	}
	if (sourcePath && isElectron()) {
		const rootPath = String(currentProjectRootPath.value || '').trim()
		if (rootPath) {
			try {
				const normalizedSource = sourcePath.replace(/\\/g, '/').replace(/\/+$/, '')
				const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '')
				if (normalizedSource.startsWith(normalizedRoot + '/')) {
					const inferredRel = normalizedSource.slice(normalizedRoot.length + 1)
					base.projectRelativePath = inferredRel
					base.url = `dweb://project-assets?projectId=${pid}&path=${encodeURIComponent(inferredRel)}`
					console.log('[finalizeGeneratedResourceLocalUrl] inferred from sourcePath:', base.url)
					return
				}
			} catch {
				// ignore
			}
		}
	}
	base.url = ''
	console.log('[finalizeGeneratedResourceLocalUrl] failed, base.url set to empty')
}

const downloadAssetViaElectron = async (
	projectId: number,
	sourceUrl: string,
	desiredFilename: string
): Promise<{
	sourcePath: string
	projectRelativePath: string
	url: string
	size: number
} | null> => {
	if (!isElectron()) return null
	const pid = Number(projectId)
	const url = String(sourceUrl || '').trim()
	if (!Number.isFinite(pid) || pid <= 0 || !url) return null
	try {
		const dl = await downloadUrlToProjectRoot(pid, url, desiredFilename)
		const relPath = String(dl?.relativePath || '').trim()
		const absolutePath = String(dl?.absolutePath || '').trim()
		if (!dl?.ok || !relPath || !absolutePath) return null
		return {
			sourcePath: absolutePath,
			projectRelativePath: relPath,
			url: `dweb://project-assets?projectId=${pid}&path=${encodeURIComponent(relPath)}`,
			size: Number(dl?.size || 0)
		}
	} catch {
		return null
	}
}

const ensureActiveProjectRootRegistered = async (projectId: number): Promise<string> => {
	const pid = Number(projectId)
	if (!Number.isFinite(pid) || pid <= 0) return ''

	let rootPath = String(currentProjectRootPath.value || '').trim()

	// Use localdb-backed project list as authoritative source to avoid stale in-memory rootPath.
	try {
		const listed = await blueprintProjectService.listProjects()
		if (listed.ok && Array.isArray(listed.projects)) {
			const hit = listed.projects.find((p) => Number(p?.id) === pid)
			const listedRoot = String(hit?.rootPath || '').trim()
			if (listedRoot && listedRoot !== rootPath) {
				console.warn('[AIWorkflow] project root corrected by projectId', {
					projectId: pid,
					previousRoot: rootPath,
					correctedRoot: listedRoot
				})
				rootPath = listedRoot
				currentProjectRootPath.value = listedRoot
			}
		}
	} catch {
		// ignore and keep current in-memory rootPath
	}

	if (isElectron() && rootPath) {
		try {
			await registerProjectRoot(pid, rootPath)
		} catch {
			// ignore
		}
	}

	return rootPath
}

const onNodeChatSubmit = async (payload: WorkflowNodeChatSubmitPayload) => {
	// 当 draft 为空时，尝试从连接的文本节点获取 prompt
	let resolvedPrompt = payload.prompt
	if (!resolvedPrompt.trim() && payload.nodeType !== 'model3d') {
		const refs = getInputParamPreviewRefs(payload.nodeId)
		const textRef = refs.find((r) => r.kind === 'text' && r.text)
		if (textRef && textRef.text) {
			resolvedPrompt = textRef.text
		}
	}
	const finalPayload = { ...payload, prompt: resolvedPrompt }
	store.dispatch('submitNodeChat', finalPayload)
	const { runNodeGenerationTask } = await import('./node-business/chat/useAIWorkflowNodeGeneration')
	const castPayload = finalPayload as unknown as Parameters<typeof runNodeGenerationTask>[1]
	const result = await runNodeGenerationTask(
		{
			store,
			comfyService,
			resolveBackendUrl,
			resolveBackendFetchUrl,
			pushToast: (message: string, tone: 'info' | 'warn' | 'error' = 'info') => {
				chatMessages.value = [
					...chatMessages.value,
					{
						id: `sys-${Date.now()}`,
						role: 'system',
						content: message,
						message,
						tone,
						createdAt: Date.now()
					}
				]
			},
			bindTextResultToNode: (nodeId: string, text: string) => {
				store.commit('setNodeTextValue', { nodeId, textValue: text })
			},
			bindImageResultToNode: async (nodeId: string, url: string) => {
				const node = store.state.nodesById[nodeId]
				if (!node) return false
				const resourceId = `gen-img-${nodeId}-${Date.now()}`
				const resourceName = `gen_image_${resourceId.slice(-6)}`
				const base: GeneratedResourceBase = {
					id: resourceId,
					kind: 'image',
					name: resourceName,
					url: ''
				}
				const pid = Number(currentProjectId.value ?? 0)
				const sourceUrl = String(url || '').trim()

				// 如果已经是 dweb:// URL，直接使用
				if (sourceUrl.toLowerCase().startsWith('dweb://project-assets')) {
					base.url = sourceUrl
					// 尝试从 dweb URL 中提取 projectRelativePath
					try {
						const u = new URL(sourceUrl)
						const path = u.searchParams.get('path')
						if (path) {
							base.projectRelativePath = decodeURIComponent(path)
						}
					} catch {
						// ignore
					}
					finalizeGeneratedResourceLocalUrl(base, pid)
					base.url = String(base.url || '').trim()
					if (
						!base.url ||
						!isStrictLocalRenderableUrl(base.url) ||
						!isWorkflowLocalAssetUrl(base.url)
					) {
						pushToast('图片资源导入失败：未得到可渲染的本地资产地址。', 'error')
						return false
					}
					store.commit('addResource', base)
					store.commit('setNodeResource', { nodeId, resourceId })
					return true
				}

				if (!(pid > 0) || !sourceUrl) {
					pushToast('图片生成结果未导入到当前项目，本次不允许远程地址渲染。', 'warn')
					return false
				}
				const rootPath = await ensureActiveProjectRootRegistered(pid)
				if (isElectron() && !rootPath) {
					pushToast('图片导入失败：当前项目根目录未绑定，已阻止写入错误目录。', 'error')
					return false
				}
				if (pid > 0 && sourceUrl) {
					let downloaded = false

					// Electron: localdb authoritative. Prefer main-process download to local project root.
					if (!downloaded && isElectron()) {
						const dl = await downloadAssetViaElectron(pid, sourceUrl, resourceName)
						if (dl) {
							base.sourcePath = dl.sourcePath
							base.projectRelativePath = dl.projectRelativePath
							base.url = dl.url
							base.size = dl.size
							downloaded = true
						}
					}

					// 方案一：通过 Django 后端代理下载，绕过 CDN 的 CORS 限制
					if (!downloaded && !isElectron()) {
						try {
							const importResult = (await blueprintProjectService.importAsset({
								projectId: pid,
								kind: 'image',
								sourceUrl,
								name: resourceName,
								bucket: 'assets'
							})) as AssetImportResult
							if (importResult?.ok && importResult.asset) {
								base.sourcePath = String(
									importResult.asset.sourcePath || importResult.asset.absolutePath || ''
								)
								base.projectRelativePath = String(
									importResult.asset.projectRelativePath || importResult.asset.relativePath || ''
								)
								base.url = String(importResult.asset.url || '')
								base.contentType = String(importResult.asset.contentType || '')
								base.size = Number(importResult.asset.size || 0)
								downloaded = true
							}
						} catch {
							// ignore
						}
					}

					// 如果下载成功但没有 dweb URL，手动构建
					if (downloaded && !base.url && base.projectRelativePath) {
						base.url = `dweb://project-assets?projectId=${pid}&path=${encodeURIComponent(base.projectRelativePath)}`
					}
				}

				finalizeGeneratedResourceLocalUrl(base, pid)
				base.url = String(base.url || '').trim()
				if (
					!base.url ||
					!isStrictLocalRenderableUrl(base.url) ||
					!isWorkflowLocalAssetUrl(base.url)
				) {
					pushToast('图片资源导入失败：未得到可渲染的本地资产地址。', 'error')
					return false
				}
				store.commit('addResource', base)
				store.commit('setNodeResource', { nodeId, resourceId })
				return true
			},
			bindVideoResultToNode: async (nodeId: string, url: string) => {
				const node = store.state.nodesById[nodeId]
				if (!node) return false
				const resourceId = `gen-video-${nodeId}-${Date.now()}`
				const resourceName = `gen_video_${resourceId.slice(-6)}`
				const base: GeneratedResourceBase = {
					id: resourceId,
					kind: 'video',
					name: resourceName,
					url: ''
				}
				const pid = Number(currentProjectId.value ?? 0)
				const sourceUrl = String(url || '').trim()
				if (!(pid > 0) || !sourceUrl) {
					pushToast('视频生成结果未导入到当前项目，本次不允许远程地址渲染。', 'warn')
					return false
				}
				const rootPath = await ensureActiveProjectRootRegistered(pid)
				if (isElectron() && !rootPath) {
					pushToast('视频导入失败：当前项目根目录未绑定，已阻止写入错误目录。', 'error')
					return false
				}
				if (pid > 0 && sourceUrl) {
					let downloaded = false

					// Electron: localdb authoritative. Prefer main-process download to local project root.
					if (!downloaded && isElectron()) {
						const dl = await downloadAssetViaElectron(pid, sourceUrl, resourceName)
						if (dl) {
							base.sourcePath = dl.sourcePath
							base.projectRelativePath = dl.projectRelativePath
							base.url = dl.url
							base.size = dl.size
							downloaded = true
						}
					}

					// 方案一：通过 Django 后端代理下载，绕过 CDN 的 CORS 限制
					if (!downloaded && !isElectron()) {
						try {
							const result = (await blueprintProjectService.importAsset({
								projectId: pid,
								kind: 'video',
								sourceUrl,
								name: resourceName,
								bucket: 'assets'
							})) as AssetImportResult
							if (result?.ok && result.asset) {
								base.sourcePath = String(result.asset.sourcePath || result.asset.absolutePath || '')
								base.projectRelativePath = String(
									result.asset.projectRelativePath || result.asset.relativePath || ''
								)
								base.url = String(result.asset.url || '')
								base.contentType = String(result.asset.contentType || '')
								base.size = Number(result.asset.size || 0)
								downloaded = true
							}
						} catch {
							// ignore
						}
					}

					// 如果下载成功但没有 dweb URL，手动构建
					if (downloaded && !base.url && base.projectRelativePath) {
						base.url = `dweb://project-assets?projectId=${pid}&path=${encodeURIComponent(base.projectRelativePath)}`
					}
				}

				finalizeGeneratedResourceLocalUrl(base, pid)
				base.url = String(base.url || '').trim()
				if (
					!base.url ||
					!isStrictLocalRenderableUrl(base.url) ||
					!isWorkflowLocalAssetUrl(base.url)
				) {
					pushToast('视频资源导入失败：未得到可渲染的本地资产地址。', 'error')
					return false
				}
				store.commit('addResource', base)
				store.commit('setNodeResource', { nodeId, resourceId })
				return true
			},
			bindModel3dResultToNode: async (nodeId: string, url: string, format?: string) => {
				const node = store.state.nodesById[nodeId]
				if (!node) return false
				const resourceId = `gen-model3d-${nodeId}-${Date.now()}`
				const resourceName = `gen_model3d_${resourceId.slice(-6)}`
				const base: GeneratedResourceBase = {
					id: resourceId,
					kind: 'model3d',
					name: resourceName,
					url: '',
					format: format || 'glb'
				}
				const pid = Number(currentProjectId.value ?? 0)
				const sourceUrl = String(url || '').trim()

				if (sourceUrl.toLowerCase().startsWith('dweb://project-assets')) {
					base.url = sourceUrl
					try {
						const u = new URL(sourceUrl)
						const path = u.searchParams.get('path')
						if (path) {
							base.projectRelativePath = decodeURIComponent(path)
						}
					} catch {
						// ignore
					}
					finalizeGeneratedResourceLocalUrl(base, pid)
					base.url = String(base.url || '').trim()
					if (!base.url) {
						pushToast('3D 模型资源导入失败：未得到有效的本地资产地址。', 'error')
						return false
					}
					store.commit('addResource', base)
					store.commit('setNodeResource', { nodeId, resourceId })
					return true
				}

				if (!(pid > 0) || !sourceUrl) {
					pushToast('3D 模型生成结果未导入到当前项目，本次不允许远程地址渲染。', 'warn')
					return false
				}
				const rootPath = await ensureActiveProjectRootRegistered(pid)
				if (isElectron() && !rootPath) {
					pushToast('3D 模型导入失败：当前项目根目录未绑定，已阻止写入错误目录。', 'error')
					return false
				}
				if (pid > 0 && sourceUrl) {
					let downloaded = false

					if (!downloaded && isElectron()) {
						const dl = await downloadAssetViaElectron(pid, sourceUrl, resourceName)
						if (dl) {
							base.sourcePath = dl.sourcePath
							base.projectRelativePath = dl.projectRelativePath
							base.url = dl.url
							base.size = dl.size
							downloaded = true
						}
					}

					if (!downloaded && !isElectron()) {
						try {
							const result = (await blueprintProjectService.importAsset({
								projectId: pid,
								kind: 'file',
								sourceUrl,
								name: resourceName,
								bucket: 'assets'
							})) as AssetImportResult
							if (result?.ok && result.asset) {
								base.sourcePath = String(result.asset.sourcePath || result.asset.absolutePath || '')
								base.projectRelativePath = String(
									result.asset.projectRelativePath || result.asset.relativePath || ''
								)
								base.url = String(result.asset.url || '')
								base.contentType = String(result.asset.contentType || '')
								base.size = Number(result.asset.size || 0)
								downloaded = true
							}
						} catch {
							// ignore
						}
					}

					if (downloaded && !base.url && base.projectRelativePath) {
						base.url = `dweb://project-assets?projectId=${pid}&path=${encodeURIComponent(base.projectRelativePath)}`
					}
				}

				finalizeGeneratedResourceLocalUrl(base, pid)
				base.url = String(base.url || '').trim()
				if (!base.url) {
					pushToast('3D 模型资源导入失败：未得到有效的本地资产地址。', 'error')
					return false
				}
				store.commit('addResource', base)
				store.commit('setNodeResource', { nodeId, resourceId })
				return true
			},
			downloadUrlAsBlob: async (url: string): Promise<Blob | null> => {
				const pid = Number(currentProjectId.value ?? 0)
				if (pid > 0 && url) {
					const dl = await downloadAssetViaElectron(pid, url, `blob-${Date.now()}`)
					if (dl) {
						try {
							const r = await fetchAsArrayBuffer(dl.sourcePath)
							if (r?.ok && r.buffer) {
								return new Blob([r.buffer], { type: r.mime || 'application/octet-stream' })
							}
						} catch {
							// ignore
						}
					}
				}

				if (isElectron()) {
					try {
						const r = await fetchAsArrayBuffer(url)
						if (r?.ok && r.buffer) {
							return new Blob([r.buffer], { type: r.mime || 'application/octet-stream' })
						}
					} catch {
						// ignore
					}
				}

				return null
			},
			persistExternalAssetToProject
		},
		castPayload
	)

	if (result.ok && result.taskType === 'meshy-3d' && result.taskId && result.mode) {
		startMeshyPoll(payload.nodeId, result.taskId, result.mode)
	}
}

const onNodeChatRemoveParamRef = (item: InputParamPreviewRef) => {
	if (item.edgeId) {
		store.dispatch('removeEdge', item.edgeId)
	} else if (item.fromNodeId && item.fromAnchorId) {
		const edge = getFirstIncomingEdge(item.fromNodeId, item.fromAnchorId)
		if (edge?.id) {
			store.dispatch('removeEdge', edge.id)
		}
	}
}

watch(
	() =>
		[
			selectedNodeId.value,
			store.state.nodeChatDialog.visible,
			store.state.nodeChatDialog.nodeId
		] as const,
	([selectedId, visible, chatNodeId]) => {
		if (!visible) return
		if (!chatNodeId || selectedId !== chatNodeId) {
			store.dispatch('closeNodeChatDialog')
			return
		}
		const node = store.state.nodesById[chatNodeId]
		const type = node?.type
		if (type !== 'text' && type !== 'image' && type !== 'video' && type !== 'model3d') {
			store.dispatch('closeNodeChatDialog')
		}
	}
)

const chatMessages = ref<WorkflowChatMessage[]>([])
const chatSending = ref(false)
const chatRunState = ref<'idle' | 'sending' | 'stopping' | 'error'>('idle')
const codexSessions = ref<LocalExecSessionItem[]>([])
const codexActiveSessionId = ref<string>('')
const codexFlowEvents = ref<LocalExecFlowEvent[]>([])

const nanoPreviewUrl = ref<string>('')
const nanoPreviewUrls = ref<string[]>([])
const nanoPreviewFallbackUrls = ref<string[]>([])
const nanoPreviewSourcePaths = ref<string[]>([])
const nanoPreviewLoadingStates = ref<boolean[]>([])
const nanoPreviewDownloadStatuses = ref<string[]>([])
const nanoPreviewDownloadProgresses = ref<number[]>([])
const nanoPreviewLocalReadyStates = ref<boolean[]>([])
const nanoStatus = ref<string>('')
const nanoBilling = ref<string>('')
const nanoModelUsed = ref<string>('')
const nanoDetail = ref<string>('')
const nodeMediaReloadTokenById = ref<Record<string, number>>({})

const nodeMediaReloadToken = (nodeId: string) => {
	const id = String(nodeId || '').trim()
	if (!id) return 0
	return Number(nodeMediaReloadTokenById.value[id] || 0)
}

const forceRefreshCurrentMediaNode = (nodeId: string) => {
	const id = String(nodeId || '').trim()
	if (!id) return
	nodeMediaReloadTokenById.value = {
		...nodeMediaReloadTokenById.value,
		[id]: Number(nodeMediaReloadTokenById.value[id] || 0) + 1
	}
}

const disconnectNanoRefEdges = () => {
	const removeIds: string[] = []
	for (const edgeId of store.state.edgeOrder.slice()) {
		const e = store.state.edgesById[edgeId]
		if (!e) continue
		if (e.toNodeId === NANO_ANCHOR_NODE_ID || e.fromNodeId === NANO_ANCHOR_NODE_ID)
			removeIds.push(edgeId)
	}
	for (const edgeId of removeIds) store.commit('removeEdge', { edgeId })
}

const onDockLayoutChanged = () => {
	if (chatModelKey.value !== 'nanobanana' && chatModelKey.value !== 'seedance') return
	if (chatCollapsed.value) return
	scheduleAsyncEdgeRender()
}

const dockSafeArea = ref<{ width: number; height: number; right: number; top: number } | null>(null)
const onDockSafeAreaChanged = (rect: {
	width: number
	height: number
	right: number
	top: number
}) => {
	dockSafeArea.value = rect
	// Future: Notify BlueprintCanvas to adjust safe interaction zone
	// This prevents drawer from obscuring critical nodes when expanded in right-drawer mode
}

const overlaySafeRight = computed(() => {
	const safeWidth = Number(dockSafeArea.value?.width ?? 0)
	if (!Number.isFinite(safeWidth)) return 0
	return Math.max(0, Math.round(safeWidth))
})

const overlayTopRightStyle = computed(() => {
	const right = overlaySafeRight.value > 0 ? overlaySafeRight.value + 12 : 16
	return {
		right: `${right}px`
	} as Record<string, string>
})

const overlayAlertStyle = computed(() => {
	const right = overlaySafeRight.value > 0 ? overlaySafeRight.value + 20 : 20
	return {
		right: `${right}px`
	} as Record<string, string>
})

const parseCssPx = (raw: string) => {
	const text = String(raw || '').trim()
	const parsed = Number.parseFloat(text)
	if (!Number.isFinite(parsed)) return 0
	return Math.max(0, parsed)
}

const resolveAppShellTitlebarHeight = () => {
	const shell = document.querySelector('.app-shell') as HTMLElement | null
	if (!shell) return 0
	return parseCssPx(getComputedStyle(shell).getPropertyValue('--titlebar-height'))
}

const syncGlobalSafeAreaCssVars = () => {
	const titlebarTop = resolveAppShellTitlebarHeight()
	const dockTopRaw = Number(dockSafeArea.value?.top ?? 0)
	const dockTop = Number.isFinite(dockTopRaw) ? Math.max(0, dockTopRaw) : 0
	const safeTop = Math.max(titlebarTop, dockTop)
	document.documentElement.style.setProperty('--aiwf-safe-top', `${Math.round(safeTop)}px`)
	document.documentElement.style.setProperty('--aiwf-safe-right', `${overlaySafeRight.value}px`)
}

watch(
	() => [overlaySafeRight.value, Number(dockSafeArea.value?.top ?? 0)],
	() => {
		syncGlobalSafeAreaCssVars()
	},
	{ immediate: true }
)

onMounted(() => {
	syncGlobalSafeAreaCssVars()
	window.addEventListener('resize', syncGlobalSafeAreaCssVars, { passive: true })
	try {
		const w = window as Window & DwebRuntimeWindow
		if (
			w.dweb &&
			w.dweb.aiworkflow &&
			typeof w.dweb.aiworkflow.onImageMarkupExported === 'function'
		) {
			const id = w.dweb.aiworkflow.onImageMarkupExported((payload: unknown) => {
				const isMarkupPayload = (
					p: unknown
				): p is { dataUrl: string; width: number; height: number; sourceName?: string | null } => {
					return isRecord(p) && isString(p.dataUrl) && isNumber(p.width) && isNumber(p.height)
				}
				if (isMarkupPayload(payload)) {
					handleImageMarkupExported(payload)
				}
			})
			imageMarkupExportListenerId = Number(id || 0) || null
		}
	} catch (err) {
		console.warn('[AIWorkflowPage] registerImageMarkupExportListener failed', err)
	}
})

onBeforeUnmount(() => {
	window.removeEventListener('resize', syncGlobalSafeAreaCssVars)
	const fallbackTop = resolveAppShellTitlebarHeight()
	document.documentElement.style.setProperty('--aiwf-safe-top', `${Math.round(fallbackTop)}px`)
	document.documentElement.style.setProperty('--aiwf-safe-right', '0px')
	if (imageMarkupExportListenerId != null) {
		try {
			const w = window as Window & DwebRuntimeWindow
			if (
				w.dweb &&
				w.dweb.aiworkflow &&
				typeof w.dweb.aiworkflow.offImageMarkupExported === 'function'
			) {
				w.dweb.aiworkflow.offImageMarkupExported(imageMarkupExportListenerId)
			}
		} catch {
			/* ignore */
		}
		imageMarkupExportListenerId = null
	}
})

watch(
	() => chatModelKey.value,
	(mk, prev) => {
		const wasVisual = prev === 'nanobanana' || prev === 'seedance'
		const isVisual = mk === 'nanobanana' || mk === 'seedance'
		if (wasVisual && !isVisual) disconnectNanoRefEdges()
	}
)

watch(
	() => chatCollapsed.value,
	(v) => {
		if (v && (chatModelKey.value === 'nanobanana' || chatModelKey.value === 'seedance'))
			disconnectNanoRefEdges()
	}
)

const nanoRefDockAnchors = computed(() => {
	const pseudo = store.state.nodesById[NANO_ANCHOR_NODE_ID]
	const ins = Array.isArray(pseudo?.inputs) ? pseudo!.inputs : []
	return ins.map((a, idx) => {
		const edge = getFirstIncomingEdge(NANO_ANCHOR_NODE_ID, String(a.id ?? ''))
		const fromNode = edge ? store.state.nodesById[edge.fromNodeId] : null
		const fromTitle = fromNode ? String(fromNode.alias || fromNode.title || fromNode.id) : ''
		return {
			id: a.id,
			label: a.label || `参考图 ${idx + 1}`,
			connected: !!edge,
			connectedFrom: fromTitle
		}
	})
})

const chatTaskStatusText = ref('')
const chatTaskStatus = computed(() => {
	if (chatTaskStatusText.value) return chatTaskStatusText.value
	if (chatRunState.value === 'stopping') return 'AI 任务：正在停止…'
	if (chatRunState.value === 'error') return 'AI 任务：错误'
	return chatSending.value ? 'AI 任务：生成中…' : 'AI 任务：空闲'
})

const isElectronRuntime =
	(window as Window & DwebRuntimeWindow)?.__DWEB_RUNTIME__?.isElectron === true

const buildProjectAssetRuntimeUrl = (
	projectId: number,
	projectRelativePath: string,
	fallbackUrl?: string
) => {
	const pid = Number(projectId)
	const rel = String(projectRelativePath || '').trim()
	if (isElectronRuntime && Number.isFinite(pid) && pid > 0 && rel) {
		return `dweb://project-assets?projectId=${encodeURIComponent(String(Math.floor(pid)))}&path=${encodeURIComponent(rel)}`
	}
	return String(fallbackUrl || '').trim()
}
const shouldAutoHelloOnLaunch = (() => {
	const envFlag = String(import.meta.env.VITE_AIWF_AUTO_HELLO || '')
		.trim()
		.toLowerCase()
	if (envFlag === '1' || envFlag === 'true' || envFlag === 'yes' || envFlag === 'on') return true
	const winFlag = String((window as Window & DwebRuntimeWindow)?.__DWEB_AIWF_AUTO_HELLO || '')
		.trim()
		.toLowerCase()
	if (winFlag === '1' || winFlag === 'true' || winFlag === 'yes' || winFlag === 'on') return true
	return false
})()
const resolveAutoHelloText = () => {
	const envText = String(import.meta.env.VITE_AIWF_AUTO_HELLO_TEXT || '').trim()
	if (envText) return envText
	const winText = String(
		(window as Window & DwebRuntimeWindow)?.__DWEB_AIWF_AUTO_HELLO_TEXT || ''
	).trim()
	if (winText) return winText
	return '你好'
}
let autoHelloSent = false

const mapCodexSession = (row: CodexSessionRow): LocalExecSessionItem => ({
	id: String(row?.id || '').trim(),
	title: String(row?.title || 'Copilot CLI 会话').trim() || 'Copilot CLI 会话',
	status: String(row?.status || 'active').trim() || 'active',
	modelName: String(row?.model_name || '').trim(),
	source: 'copilot-cli'
})

let _saveProjectToBackend:
	| ((name?: string, opts?: { silent?: boolean }) => Promise<boolean>)
	| null = null

function ensureProjectForLocalExec(opts?: { silent?: boolean }): Promise<number | null> {
	const existing = Number(currentProjectId.value ?? 0)
	if (Number.isFinite(existing) && existing > 0) return Promise.resolve(existing)

	const fallbackName = String(currentProjectName.value || '').trim() || 'AI Workflow Auto Session'
	currentProjectName.value = fallbackName
	if (!_saveProjectToBackend) return Promise.resolve(null)
	return _saveProjectToBackend(fallbackName, { silent: Boolean(opts?.silent) }).then((ok) => {
		if (!ok) return null
		const nextId = Number(currentProjectId.value ?? 0)
		if (Number.isFinite(nextId) && nextId > 0) return nextId
		return null
	})
}

const loadCodexSessions = async () => {
	const projectId = await ensureProjectForLocalExec({ silent: true })
	if (projectId == null) {
		codexSessions.value = []
		codexActiveSessionId.value = ''
		return
	}
	try {
		const res = (await localExecChatService.localExecListSessions(projectId)) as LocalExecListResult
		const items = Array.isArray(res?.items) ? res.items : []
		codexSessions.value = items
			.map((item: unknown) => mapCodexSession(item as CodexSessionRow))
			.filter((s: LocalExecSessionItem) => !!s.id)
		if (!codexActiveSessionId.value && codexSessions.value.length) {
			codexActiveSessionId.value = codexSessions.value[0].id
		}
	} catch {
		codexSessions.value = []
	}
}

const onCodexCreateSession = async () => {
	const projectId = await ensureProjectForLocalExec()
	if (projectId == null) {
		pushToast('无法创建 Copilot CLI 会话：自动保存项目失败。', 'warn')
		return
	}
	try {
		const created = (await localExecChatService.localExecCreateSession({
			title: 'AI Workflow Copilot CLI 会话',
			model: chatModelId.value,
			projectId
		})) as LocalExecListResult
		if (created?.error) {
			pushToast('创建 Copilot CLI 会话失败：' + String(created.error), 'warn')
			return
		}
		const item = mapCodexSession(created as unknown as CodexSessionRow)
		if (!item.id) {
			pushToast('创建 Copilot CLI 会话失败：返回会话ID为空', 'warn')
			return
		}
		codexSessions.value = [item, ...codexSessions.value.filter((s) => s.id !== item.id)]
		codexActiveSessionId.value = item.id
		chatMessages.value = []
	} catch (err: unknown) {
		pushToast('创建 Copilot CLI 会话失败：' + getErrorMessage(err), 'warn')
	}
}

const onCodexSelectSession = async (sessionId: string) => {
	const projectId = await ensureProjectForLocalExec()
	if (projectId == null) {
		pushToast('无法加载会话：自动保存项目失败。', 'warn')
		return
	}
	const sid = String(sessionId || '').trim()
	if (!sid) return
	codexActiveSessionId.value = sid
	codexFlowEvents.value = []
	try {
		const data = (await localExecChatService.localExecListMessages(
			sid,
			projectId
		)) as LocalExecListResult
		const items = Array.isArray(data?.items) ? data.items : []
		chatMessages.value = items.map((m: unknown) => {
			const msg = m as CodexMessageRow
			return {
				id: String(msg?.id || makeChatId()),
				role: msg?.role === 'assistant' || msg?.role === 'system' ? msg.role : 'user',
				content: String(msg?.content || '')
			} as WorkflowChatMessage
		})
	} catch {
		chatMessages.value = []
	}
}

const onCodexApproval = async (payloadValue: {
	messageId: string
	decision: 'accept' | 'decline'
}) => {
	const projectId = await ensureProjectForLocalExec()
	if (projectId == null) {
		pushToast('无法提交审批：自动保存项目失败。', 'warn')
		return
	}
	const sid = String(codexActiveSessionId.value || '').trim()
	if (!sid) {
		pushToast('请先选择 Copilot CLI 会话。', 'warn')
		return
	}
	try {
		const result = (await localExecChatService.localExecSubmitApproval({
			sessionId: sid,
			messageId: payloadValue.messageId,
			decision: payloadValue.decision,
			projectId
		})) as LocalExecListResult
		if (result?.error) {
			pushToast('审批提交失败：' + String(result.error), 'warn')
			return
		}
		pushToast('审批已提交。', 'info')
	} catch (err: unknown) {
		pushToast('审批提交失败：' + getErrorMessage(err), 'warn')
	}
}

const onCodexDeleteSession = async (sessionId: string) => {
	const projectId = await ensureProjectForLocalExec()
	if (projectId == null) {
		pushToast('无法删除会话：自动保存项目失败。', 'warn')
		return
	}
	const sid = String(sessionId || '').trim()
	if (!sid) return
	const ok = window.confirm('确认删除该 Copilot CLI 会话吗？')
	if (!ok) return
	const result = (await localExecChatService.localExecDeleteSession({
		sessionId: sid,
		projectId
	})) as LocalExecListResult
	if (result?.error) {
		pushToast('删除会话失败：' + String(result.error), 'warn')
		return
	}
	codexSessions.value = codexSessions.value.filter((s) => s.id !== sid)
	if (codexActiveSessionId.value === sid) {
		codexActiveSessionId.value = codexSessions.value[0]?.id || ''
		if (codexActiveSessionId.value) {
			void onCodexSelectSession(codexActiveSessionId.value)
		} else {
			chatMessages.value = []
			codexFlowEvents.value = []
		}
	}
}

const onCodexRenameSession = async (payloadValue: { sessionId: string; title: string }) => {
	const projectId = await ensureProjectForLocalExec()
	if (projectId == null) {
		pushToast('无法重命名会话：自动保存项目失败。', 'warn')
		return
	}
	const sid = String(payloadValue.sessionId || '').trim()
	const title = String(payloadValue.title || '').trim()
	if (!sid || !title) return
	const result = (await localExecChatService.localExecUpdateSession({
		sessionId: sid,
		projectId,
		title
	})) as LocalExecListResult
	if (result?.error) {
		pushToast('会话改名失败：' + String(result.error), 'warn')
		return
	}
	codexSessions.value = codexSessions.value.map((s) => (s.id === sid ? { ...s, title } : s))
}

const makeChatId = () =>
	`aiwf-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

let removeResourceByPolicyBridge:
	| null
	| ((
			resourceId: string,
			opts?: { silent?: boolean }
	  ) => Promise<{ removed: boolean; reason: 'record' | 'django-file' | 'skip' | 'error' }>) = null
let revokeNodeModel3DObjectUrlBridge = (_nodeId: string) => {}
let revokeSceneLayoutManualModelObjectUrlBridge = (_nodeId: string, _objectId?: string) => {}

const { resourceUsed, removeSelectedNodesWithResourceCleanup, setNodeResourceWithCleanup } =
	useAIWorkflowNodeResourceCleanup({
		store,
		selectedNodeIds,
		revokeNodeModel3DObjectUrl: (nodeId) => {
			revokeNodeModel3DObjectUrlBridge(nodeId)
		},
		revokeSceneLayoutManualModelObjectUrl: (nodeId, objectId) => {
			revokeSceneLayoutManualModelObjectUrlBridge(nodeId, objectId)
		},
		removeResourceByPolicy: (resourceId, opts) => {
			if (!removeResourceByPolicyBridge) {
				return Promise.resolve({ removed: false, reason: 'skip' as const })
			}
			return removeResourceByPolicyBridge(resourceId, opts)
		}
	})

const normalizePastedNodeResources = (nodeIds: string[]) => {
	const ids = Array.from(
		new Set((nodeIds ?? []).map((id) => String(id || '').trim()).filter(Boolean))
	)
	if (!ids.length) return

	const canonicalByUniqueKey = new Map<string, string>()
	for (const rid of store.state.resourceOrder) {
		const r = store.state.resourcesById[rid] as WorkflowResource | undefined
		if (!r) continue
		const key = resourceUniqueIndexKey({
			kind: r.kind,
			sourcePath: r.sourcePath,
			url: r.url,
			sourceFingerprint: r.sourceFingerprint,
			localFileKey: r.localFileKey,
			sourceName: r.sourceName,
			sourceSize: r.sourceSize,
			sourceLastModified: r.sourceLastModified
		})
		if (!key) continue
		if (!canonicalByUniqueKey.has(key)) canonicalByUniqueKey.set(key, rid)
	}

	const maybeRedundantResourceIds = new Set<string>()

	for (const nodeId of ids) {
		const node = store.state.nodesById[nodeId]
		if (!node || (node.type !== 'image' && node.type !== 'video')) continue
		const resourceId = String(node.resourceId ?? '').trim()
		if (!resourceId) continue
		const resource = store.state.resourcesById[resourceId] as WorkflowResource | undefined
		if (!resource) continue

		const key = resourceUniqueIndexKey({
			kind: resource.kind,
			sourcePath: resource.sourcePath,
			url: resource.url,
			sourceFingerprint: resource.sourceFingerprint,
			localFileKey: resource.localFileKey,
			sourceName: resource.sourceName,
			sourceSize: resource.sourceSize,
			sourceLastModified: resource.sourceLastModified
		})
		if (!key) continue

		const canonicalResourceId = canonicalByUniqueKey.get(key) ?? resourceId
		if (!canonicalByUniqueKey.has(key)) canonicalByUniqueKey.set(key, resourceId)

		if (canonicalResourceId !== resourceId) {
			store.commit('setNodeResource', { nodeId, resourceId: canonicalResourceId })
			maybeRedundantResourceIds.add(resourceId)
		}
	}

	for (const rid of maybeRedundantResourceIds) {
		if (!resourceUsed(rid)) removeResourceRecordOnly(rid)
	}
}

const pasteNodesWithResourceDedupe = (payload?: { worldX?: number; worldY?: number }) => {
	store.commit('pasteNode', payload ?? {})
	// Keep resources unique per pasted node.
}

const inferMediaKindFromUrlOrName = (input: string): 'image' | 'video' | null => {
	const text = String(input || '')
		.trim()
		.toLowerCase()
	if (!text) return null
	const cleanUrl = text.split('?')[0].split('#')[0]
	const extMatch = cleanUrl.match(/\.([a-z0-9]{1,6})$/)
	const ext = extMatch ? extMatch[1] : ''
	const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']
	const videoExts = ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi', 'flv', 'wmv']
	if (imageExts.includes(ext)) return 'image'
	if (videoExts.includes(ext)) return 'video'
	return null
}

const buildProjectAssetUrl = (projectId: number, relativePath: string): string => {
	const pid = Number(projectId)
	const rel = String(relativePath || '').trim()
	if (!(pid > 0) || !rel) return ''
	return `dweb://project-assets?projectId=${pid}&path=${encodeURIComponent(rel)}`
}

const pasteMediaData = async (clipboardData: DataTransfer | null): Promise<boolean> => {
	if (!clipboardData) return false
	const projectId = Number(currentProjectId.value ?? 0)
	if (!(projectId > 0)) {
		pushToast('请先保存项目后，再粘贴媒体资源到蓝图。', 'warn')
		return false
	}

	const inferMediaKindFromFileLocal = (file: File): 'image' | 'video' | null => {
		const mime = String(file.type || '').toLowerCase()
		if (mime.startsWith('image/')) return 'image'
		if (mime.startsWith('video/')) return 'video'
		const name = String(file.name || '').toLowerCase()
		const ext = name.split('.').pop() || ''
		const imgExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']
		const vidExts = ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi', 'flv', 'wmv']
		if (imgExts.includes(ext)) return 'image'
		if (vidExts.includes(ext)) return 'video'
		return null
	}

	const items = Array.from(clipboardData.items ?? [])
	const files: Array<{ file: ElectronFile; sourcePath: string }> = []

	for (const item of items) {
		if (item.kind !== 'file') continue
		const file = item.getAsFile() as ElectronFile | null
		if (!file) continue
		const sourcePath = typeof file.path === 'string' ? String(file.path).trim() : ''
		files.push({ file, sourcePath })
	}

	if (files.length > 0) {
		const mediaFiles = files.filter((f) => {
			const mime = String(f.file.type || '').toLowerCase()
			if (mime.startsWith('image/') || mime.startsWith('video/')) return true
			return !!inferMediaKindFromFileLocal(f.file)
		})

		if (mediaFiles.length > 0) {
			const { worldX, worldY } = getCanvasCenterWorld()
			const createdNodeIds: string[] = []
			let offset = 0

			for (const { file, sourcePath } of mediaFiles) {
				const mime = String(file.type || '').toLowerCase()
				let kind: 'image' | 'video' | null = null
				if (mime.startsWith('image/')) kind = 'image'
				if (mime.startsWith('video/')) kind = 'video'
				if (!kind) kind = inferMediaKindFromFileLocal(file)
				if (!kind) continue

				const fileName = String(file.name || (kind === 'image' ? 'image.png' : 'video.mp4'))

				let created = false
				let assetUrl = ''
				let assetRelPath = ''
				let assetAbsPath = ''

				if (sourcePath && isElectron()) {
					try {
						const result = await copyFileToProjectRoot(projectId, sourcePath, fileName)
						if (result && result.ok) {
							assetRelPath = String(result.relativePath || '').trim()
							assetAbsPath = String(result.absolutePath || '').trim()
							assetUrl = buildProjectAssetUrl(projectId, assetRelPath)
							created = true
						}
					} catch {
						// 失败则回退
					}
				}

				if (!created && isElectron()) {
					try {
						const arrayBuffer = await file.arrayBuffer()
						const uploaded = await uploadProjectAsset({
							projectId,
							kind,
							name: fileName,
							arrayBuffer,
							contentType: file.type || (kind === 'image' ? 'image/png' : 'video/mp4')
						})

						if (uploaded && uploaded.ok && uploaded.asset) {
							const asset = uploaded.asset
							assetRelPath = String(asset.projectRelativePath || asset.relativePath || '').trim()
							assetAbsPath = String(asset.absolutePath || '').trim()
							assetUrl = buildProjectAssetUrl(projectId, assetRelPath)
							created = true
						}
					} catch {
						// 上传失败
					}
				}

				if (!created) {
					assetUrl = URL.createObjectURL(file)
					assetAbsPath = sourcePath
				}

				const finalDisplayUrl =
					assetUrl && assetUrl.toLowerCase().startsWith('dweb://')
						? resolveBackendUrl(assetUrl)
						: assetUrl
				store.commit('addNodeAt', {
					worldX: worldX + offset,
					worldY: worldY + offset,
					title: kind === 'image' ? '图片' : '视频'
				})
				const nodeId = store.state.selectedNodeId
				if (nodeId) {
					store.commit('setNodeType', { nodeId, type: kind })
					bindMediaResourceToNode(nodeId, kind, finalDisplayUrl || assetUrl, fileName, {
						sourcePath: assetAbsPath || undefined,
						projectRelativePath: assetRelPath || undefined
					})
					autoSizeMediaNode(nodeId, finalDisplayUrl || assetUrl, kind)
					createdNodeIds.push(nodeId)
				}
				offset += 40
			}

			if (createdNodeIds.length > 0) {
				store.commit('setSelectedNodes', {
					nodeIds: createdNodeIds,
					primaryNodeId: createdNodeIds[0]
				})
				return true
			}
		}
	}

	const urlText = (
		clipboardData.getData('text/uri-list') ||
		clipboardData.getData('text/plain') ||
		''
	).trim()
	if (urlText && /^https?:\/\//i.test(urlText)) {
		const urlKind = inferMediaKindFromUrlOrName(urlText)
		if (urlKind) {
			const center = getCanvasCenterWorld()
			const fileName = `paste-${Date.now()}`
			const pid = Number(currentProjectId.value ?? 0)

			try {
				const result = await downloadUrlToProjectRoot(pid, urlText, fileName)
				if (result && result.ok) {
					const relPath = String(result.relativePath || '').trim()
					const absPath = String(result.absolutePath || '').trim()
					const assetUrl = buildProjectAssetUrl(pid, relPath)
					const finalDisplayUrl = assetUrl ? resolveBackendUrl(assetUrl) : ''

					store.commit('addNodeAt', {
						worldX: center.worldX,
						worldY: center.worldY,
						title: urlKind === 'image' ? '图片' : '视频'
					})
					const nodeId = store.state.selectedNodeId
					if (nodeId) {
						store.commit('setNodeType', { nodeId, type: urlKind })
						bindMediaResourceToNode(nodeId, urlKind, finalDisplayUrl || assetUrl, fileName, {
							sourcePath: absPath || undefined,
							projectRelativePath: relPath || undefined
						})
						autoSizeMediaNode(nodeId, finalDisplayUrl || assetUrl, urlKind)
						return true
					}
				}
			} catch {
				store.commit('addNodeAt', {
					worldX: center.worldX,
					worldY: center.worldY,
					title: urlKind === 'image' ? '图片' : '视频'
				})
				const nodeId = store.state.selectedNodeId
				if (nodeId) {
					store.commit('setNodeType', { nodeId, type: urlKind })
					bindMediaResourceToNode(nodeId, urlKind, urlText, fileName)
					autoSizeMediaNode(nodeId, urlText, urlKind)
					return true
				}
			}
		}
	}

	return false
}

const { onNodeCopy, onNodePaste, onNodeDelete, onNodeSetType } = useAIWorkflowNodeActions({
	store,
	selectedNodeIds,
	pasteNodesWithResourceDedupe,
	removeSelectedNodesWithResourceCleanup
})

const makeResourceId = () =>
	`wf-res-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const {
	getObjectUrl,
	setObjectUrl,
	revokeObjectUrl,
	revokeObjectUrlsByPrefix,
	revokeTrackedObjectUrlsForResource,
	getEntries: getTrackedObjectUrlEntries,
	clearAllObjectUrls
} = useAIWorkflowObjectUrlRegistry()

const normalizeSourcePathKey = (raw: unknown) => {
	const v = String(raw ?? '').trim()
	if (!v) return ''
	return v.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase()
}

const normalizeFileSignatureKey = (
	rawName: unknown,
	rawSize: unknown,
	rawLastModified: unknown
) => {
	const name = String(rawName ?? '')
		.trim()
		.toLowerCase()
	const size = Number(rawSize)
	const lastModified = Number(rawLastModified)
	if (!name) return ''
	if (!Number.isFinite(size) || size < 0) return ''
	if (!Number.isFinite(lastModified) || lastModified < 0) return ''
	return `${name}|${Math.floor(size)}|${Math.floor(lastModified)}`
}

const normalizeStableUrlKey = (raw: unknown) => {
	const v = String(raw ?? '').trim()
	if (!v) return ''
	if (v.startsWith('blob:') || v.startsWith('data:')) return ''
	try {
		const u = new URL(v, window.location.origin)
		u.hash = ''
		// drop common cache-busting params
		u.searchParams.delete('t')
		u.searchParams.delete('ts')
		u.searchParams.delete('_t')
		u.searchParams.delete('_ts')
		return `${u.origin}${u.pathname}${u.search}`.toLowerCase()
	} catch {
		return v.toLowerCase()
	}
}

const resourceUniqueIndexKey = (input: {
	kind?: string
	sourcePath?: unknown
	url?: unknown
	sourceFingerprint?: unknown
	localFileKey?: unknown
	sourceName?: unknown
	sourceSize?: unknown
	sourceLastModified?: unknown
}) => {
	const kind = String(input.kind ?? '')
		.trim()
		.toLowerCase()
	const sourcePathKey = normalizeSourcePathKey(input.sourcePath)
	if (sourcePathKey) return `${kind}|p:${sourcePathKey}`
	const urlKey = normalizeStableUrlKey(input.url)
	if (urlKey) return `${kind}|u:${urlKey}`
	const sourceFingerprint = String(input.sourceFingerprint ?? '')
		.trim()
		.toLowerCase()
	if (sourceFingerprint) return `${kind}|f:${sourceFingerprint}`
	const localFileKey = String(input.localFileKey ?? '')
		.trim()
		.toLowerCase()
	if (localFileKey) return `${kind}|k:${localFileKey}`
	const fileSig = normalizeFileSignatureKey(
		input.sourceName,
		input.sourceSize,
		input.sourceLastModified
	)
	if (fileSig) return `${kind}|s:${fileSig}`
	return ''
}

const findExistingResourceIdByUniqueIndex = (input: {
	kind?: string
	sourcePath?: unknown
	url?: unknown
	sourceFingerprint?: unknown
	localFileKey?: unknown
	sourceName?: unknown
	sourceSize?: unknown
	sourceLastModified?: unknown
}) => {
	const key = resourceUniqueIndexKey(input)
	if (!key) return null
	for (const rid of store.state.resourceOrder) {
		const r = store.state.resourcesById[rid] as WorkflowResource | undefined
		if (!r) continue
		const cur = resourceUniqueIndexKey({
			kind: r.kind,
			sourcePath: r.sourcePath,
			url: r.url,
			sourceFingerprint: r.sourceFingerprint,
			localFileKey: r.localFileKey,
			sourceName: r.sourceName,
			sourceSize: r.sourceSize,
			sourceLastModified: r.sourceLastModified
		})
		if (cur && cur === key) return rid
	}
	return null
}

const isComfyForwardResource = (resource: Pick<WorkflowResource, 'url'> | null | undefined) => {
	const url = String(resource?.url ?? '')
		.trim()
		.toLowerCase()
	return /\/api\/workflow\/(view|outputs)(\?|$)/.test(url)
}

const isDjangoManagedResource = (resource: WorkflowResource | null | undefined) => {
	if (!resource) return false
	if (isComfyForwardResource(resource)) return false
	const sp = normalizeSourcePathKey(resource?.sourcePath)
	if (sp.includes('/media/')) return true
	const projectRelativePath = String(resource?.projectRelativePath ?? '').trim()
	if (projectRelativePath) return true
	const url = String(resource?.url ?? '').trim()
	if (!url) return false
	if (url.toLowerCase().startsWith('dweb://project-assets')) return true
	try {
		const u = new URL(url, window.location.origin)
		if (/\/media\//.test(u.pathname)) return true
		if (/\/api\/workflow\/projects\/assets\/local(\?|$)/.test(u.pathname + u.search)) return true
	} catch {
		if (/\/media\//.test(url)) return true
	}
	return false
}

const mediaImportManager = new MediaResourceImportManager({
	batchSize: 50,
	maxWorkers: 16,
	// Spec: if exceeding 16*10, queue the rest.
	maxInFlight: 16 * 10
})

let videoMetadataQueue: VideoMetadataReadQueue | null = new VideoMetadataReadQueue({
	concurrency: 2,
	timeoutMs: 8000
})

const autoSizeVideoNodeFromDims = (nodeId: string, w: number, h: number) => {
	const node = store.state.nodesById[nodeId]
	if (!node || node.sizeCustomized) return
	const width = Math.max(1, Math.floor(Number(w) || 1))
	const height = Math.max(1, Math.floor(Number(h) || 1))
	const targetWidth = 450
	const chromeHeight = 140
	const aspect = width && height ? width / height : 1
	const previewHeight = Math.round(targetWidth / Math.max(0.1, aspect))
	const nextH = Math.max(220, previewHeight + chromeHeight)
	store.commit('setNodeSize', { nodeId, width: targetWidth, height: nextH, customized: false })
}

const scheduleVideoMetadataRead = (payload: {
	sessionId?: string
	resourceId: string
	nodeId: string
	url: string
}) => {
	if (!payload.url) return
	if (!videoMetadataQueue) {
		videoMetadataQueue = new VideoMetadataReadQueue({ concurrency: 2, timeoutMs: 8000 })
	}
	const localQueue = videoMetadataQueue

	localQueue.enqueue([
		{
			id: payload.resourceId,
			url: payload.url,
			onResult: (res: VideoMetadataResult) => {
				if (!store.state.nodesById[payload.nodeId]) return

				const w = Number(res.width)
				const h = Number(res.height)
				if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return

				const ww = Math.max(1, Math.floor(w))
				const hh = Math.max(1, Math.floor(h))
				store.commit('setNodeVideoSettings', {
					nodeId: payload.nodeId,
					videoSettings: {
						outputWidth: ww,
						outputHeight: hh,
						naturalWidth: ww,
						naturalHeight: hh
					}
				})
				autoSizeVideoNodeFromDims(payload.nodeId, ww, hh)
				void ensureVideoResourcePoster(payload.resourceId, payload.url)
			}
		}
	])
}

const cancelActiveImportSession = (opts?: { cleanupUnresolved?: boolean }) => {
	clearActiveImportSession({
		onBeforeClear: (session) => {
			mediaImportManager.cancel()
			try {
				videoMetadataQueue?.cancel()
			} catch {
				// ignore
			}
			videoMetadataQueue = new VideoMetadataReadQueue({ concurrency: 2, timeoutMs: 8000 })

			if (!opts?.cleanupUnresolved) return
			for (const [rid, info] of session.resourceIdToNode.entries()) {
				const st = session.resourceState.get(rid)
				if (st?.done) continue

				if (store.state.nodesById[info.nodeId]) store.commit('removeNode', { nodeId: info.nodeId })
				if (store.state.resourcesById[rid]) {
					revokeTrackedObjectUrlsForResource(rid)
					store.commit('removeResource', { resourceId: rid })
				}
			}
		}
	})
}

const onCancelImportOverlay = () => {
	cancelActiveImportSession({ cleanupUnresolved: true })
	pushToast('已取消导入：保留已完成的节点/资源，清理未完成项。', 'info')
}

const autoSizeMediaNode = (nodeId: string, url: string, kind: 'image' | 'video') => {
	const node = store.state.nodesById[nodeId]
	if (!node || node.sizeCustomized) return
	const targetWidth = 450
	// Node height includes header/body/footer paddings + action buttons + footer toolbar.
	// We add a small constant so the visible preview area matches the media aspect.
	const chromeHeight = 140
	if (kind === 'image') {
		const img = new Image()
		img.onload = () => {
			const w = Math.max(1, Math.floor(img.naturalWidth || img.width || 1))
			const h = Math.max(1, Math.floor(img.naturalHeight || img.height || 1))
			const aspect = w && h ? w / h : 1
			const previewHeight = Math.round(targetWidth / Math.max(0.1, aspect))
			const height = Math.max(220, previewHeight + chromeHeight)
			store.commit('setNodeSize', { nodeId, width: targetWidth, height, customized: false })
		}
		img.src = url
		return
	}
	// video: use limited-concurrency metadata queue to avoid mass <video> allocations.
	const rid = String(store.state.nodesById[nodeId]?.resourceId ?? '').trim()
	scheduleVideoMetadataRead({ resourceId: rid || nodeId, nodeId, url })
}

const autoSizeImageNodeFromDims = (nodeId: string, w: number, h: number) => {
	const node = store.state.nodesById[nodeId]
	if (!node || node.sizeCustomized) return
	const width = Math.max(1, Math.floor(Number(w) || 1))
	const height = Math.max(1, Math.floor(Number(h) || 1))
	const targetWidth = 450
	const chromeHeight = 140
	const aspect = width && height ? width / height : 1
	const previewHeight = Math.round(targetWidth / Math.max(0.1, aspect))
	const nextH = Math.max(220, previewHeight + chromeHeight)
	store.commit('setNodeSize', { nodeId, width: targetWidth, height: nextH, customized: false })
}

const onNodeClearResource = (nodeId: string) => {
	const node = store.state.nodesById[nodeId]
	if (!node) return
	if (node.type === 'model3d') {
		revokeNodeModel3DObjectUrl(nodeId)
		store.commit('setNodeModel3DSettings', {
			nodeId,
			model3dSettings: {
				modelUrl: '',
				modelSourceName: '',
				modelSourcePath: '',
				modelAssetUrl: '',
				modelAssetPath: '',
				lastInputSignature: '',
				lastInputNodeId: '',
				lastInputSourceUrl: '',
				lastInputSourcePath: '',
				lastInputSourceName: ''
			}
		})
		return
	}
	if (!node.resourceId) return
	setNodeResourceWithCleanup({ nodeId, resourceId: null })
}

const onNodeClear = (nodeId: string) => {
	const node = store.state.nodesById[nodeId]
	if (!node) return
	if (node.type === 'text') {
		store.commit('setNodeTextValue', { nodeId, textValue: '' })
		return
	}
	if (
		node.type === 'image' ||
		node.type === 'video' ||
		node.type === 'rotate-image' ||
		node.type === 'model3d'
	) {
		onNodeClearResource(nodeId)
	}
}

const revokeNodeModel3DObjectUrl = (nodeId: string) => {
	const objectKey = `model3d:${nodeId}`
	revokeObjectUrl(objectKey)
}

const sceneLayoutManualModelObjectKey = (nodeId: string, objectId: string) =>
	`scene-layout-model:${nodeId}:${objectId}`

const revokeSceneLayoutManualModelObjectUrl = (nodeId: string, objectId?: string) => {
	const normalizedNodeId = String(nodeId ?? '').trim()
	if (!normalizedNodeId) return
	const normalizedObjectId = String(objectId ?? '').trim()
	if (normalizedObjectId) {
		const key = sceneLayoutManualModelObjectKey(normalizedNodeId, normalizedObjectId)
		revokeObjectUrl(key)
		return
	}

	const prefix = `scene-layout-model:${normalizedNodeId}:`
	revokeObjectUrlsByPrefix(prefix)
}
revokeNodeModel3DObjectUrlBridge = revokeNodeModel3DObjectUrl
revokeSceneLayoutManualModelObjectUrlBridge = revokeSceneLayoutManualModelObjectUrl

const buildCroppedImageTransferFile = async (
	fromNode: WorkflowNode,
	sourceUrl: string,
	sourceName: string
): Promise<File | null> => {
	if (fromNode.type !== 'image') return null
	const imageSettings = fromNode.imageSettings
	if (!imageSettings?.cropEnabled || !imageSettings.crop) return null
	const outputWidth = Math.max(
		1,
		Math.floor(Number(imageSettings.outputWidth ?? imageSettings.naturalWidth ?? 0))
	)
	const outputHeight = Math.max(
		1,
		Math.floor(Number(imageSettings.outputHeight ?? imageSettings.naturalHeight ?? 0))
	)
	if (!outputWidth || !outputHeight) return null

	const blob = await exportWorkflowImageOutputPng({
		src: sourceUrl,
		outputWidth,
		outputHeight,
		crop: imageSettings.crop
	})
	if (!blob) return null

	const baseName = String(sourceName || 'image').replace(/\.[^./\\]+$/, '')
	return new File([blob], `${baseName}_crop.png`, { type: 'image/png' })
}

const buildImageTransferFileFromCrop = async (payload: {
	sourceUrl: string
	sourceName: string
	crop: WorkflowImageCrop
	outputWidth?: number
	outputHeight?: number
	suffix?: string
	sourceWidth?: number
	sourceHeight?: number
	enforceLandscape?: boolean
}) => {
	if (payload.enforceLandscape) {
		const srcW = Math.max(1, Math.floor(Number(payload.sourceWidth ?? 0) || 1))
		const srcH = Math.max(1, Math.floor(Number(payload.sourceHeight ?? 0) || 1))
		const pixelCrop = uvCropToPixelRect(srcW, srcH, payload.crop)
		const blob = await exportWorkflowImageEnforcedPng({
			src: payload.sourceUrl,
			crop: pixelCrop,
			minWidth: 350
		})
		if (!blob) return null
		const baseName = String(payload.sourceName || 'image').replace(/\.[^./\\]+$/, '') || 'image'
		const suffix = String(payload.suffix || 'crop').trim() || 'crop'
		return new File([blob], `${baseName}_${suffix}.png`, { type: 'image/png' })
	}

	const outputWidth = Math.max(1, Math.floor(Number(payload.outputWidth ?? 0) || 1))
	const outputHeight = Math.max(1, Math.floor(Number(payload.outputHeight ?? 0) || 1))
	const blob = await exportWorkflowImageOutputPng({
		src: payload.sourceUrl,
		outputWidth,
		outputHeight,
		crop: payload.crop
	})
	if (!blob) return null
	const baseName = String(payload.sourceName || 'image').replace(/\.[^./\\]+$/, '') || 'image'
	const suffix = String(payload.suffix || 'crop').trim() || 'crop'
	return new File([blob], `${baseName}_${suffix}.png`, { type: 'image/png' })
}

const addGeneratedImageResource = (file: File) => {
	const resourceId = makeResourceId()
	const url = URL.createObjectURL(file)
	setObjectUrl(resourceId, url)
	store.commit('addResource', {
		id: resourceId,
		kind: 'image',
		name: file.name || 'scene_decompose.png',
		url,
		createdAt: Date.now()
	})
	return { resourceId, url }
}

const connectedImageTargetsFromImageNode = (fromNodeId: string) => {
	const outIds = store.state.nodesById[fromNodeId]?.outputs?.map((o) => o.id) ?? []
	if (!outIds.length) return [] as string[]
	const outSet = new Set(outIds)
	const targets: string[] = []
	for (const e of edges.value) {
		if (e.fromNodeId !== fromNodeId) continue
		if (!outSet.has(e.fromAnchorId)) continue
		const to = store.state.nodesById[e.toNodeId]
		if (to?.type === 'image') targets.push(to.id)
	}
	return Array.from(new Set(targets))
}

const autoDistributeImageOutputToConnectedNodes = async (fromNodeId: string) => {
	const fromNode = store.state.nodesById[fromNodeId]
	if (!fromNode || fromNode.type !== 'image') return
	const targets = connectedImageTargetsFromImageNode(fromNodeId)
	if (!targets.length) return

	const rid = String(fromNode.resourceId ?? '').trim()
	if (!rid) return
	const sourceResource = store.state.resourcesById[rid] as WorkflowResource | undefined
	if (!sourceResource || sourceResource.kind !== 'image') return

	const sourceUrl = String(sourceResource.url ?? '').trim()
	if (!sourceUrl) return
	const sourceName = String(sourceResource.name ?? 'image')

	let croppedFile: File | null = null
	try {
		croppedFile = await buildCroppedImageTransferFile(fromNode, sourceUrl, sourceName)
	} catch {
		croppedFile = null
	}

	for (const targetId of targets) {
		if (targetId === fromNodeId) continue
		if (croppedFile) {
			const cloned = new File([croppedFile], croppedFile.name, {
				type: croppedFile.type || 'image/png'
			})
			onNodeUploadResource(targetId, cloned, 'image', { autoDistribute: false })
			continue
		}
		try {
			const cloned = await fileFromUrl(sourceUrl, sourceName.replace(/\.[^.]+$/, '') || 'image')
			onNodeUploadResource(targetId, cloned, 'image', { autoDistribute: false })
			autoSizeMediaNode(targetId, sourceUrl, 'image')
		} catch {
			// ignore clone failures for downstream copy
		}
	}
}

const pendingImageDistributeNodeIds = new Set<string>()

const flushPendingImageDistribute = () => {
	if (!pendingImageDistributeNodeIds.size) return
	const ids = Array.from(pendingImageDistributeNodeIds)
	pendingImageDistributeNodeIds.clear()
	for (const id of ids) {
		void autoDistributeImageOutputToConnectedNodes(id)
	}
}

const queueImageDistributeOnPointerUp = (nodeId: string) => {
	pendingImageDistributeNodeIds.add(nodeId)
}

const {
	onNodeResize,
	onNodeAutoResize,
	onNodeTextValueUpdate,
	onNodeImageSettingsUpdate,
	onNodeVideoSettingsUpdate,
	onNodeModel3DSettingsUpdate,
	onNodeMeshySettingsUpdate
} = useAIWorkflowNodeSettings({
	store,
	markViewportMotion,
	scheduleAsyncEdgeRender: () => scheduleAsyncEdgeRender(),
	queueImageDistributeOnPointerUp,
	autoDistributeImageOutputToConnectedNodes
})

const { onTextMergeItemAdd, onTextMergeItemRemove, onTextMergeItemMove } =
	useAIWorkflowTextMergeCommands({
		store
	})

interface SceneLayoutPlaceholderPayload {
	size?: { width?: unknown; height?: unknown; depth?: unknown }
	scale?: { x?: unknown; y?: unknown; z?: unknown }
	rotation?: { yaw?: unknown; pitch?: unknown; roll?: unknown }
	objectId?: string
	name?: string
	color?: string
}

const createSceneLayoutPlaceholderModelFile = async (nodeId: string) => {
	const placeholderPayload = getSceneLayoutSelectedPlaceholderPayload(
		nodeId
	) as SceneLayoutPlaceholderPayload | null
	if (!placeholderPayload) return null

	const positive = (value: unknown, fallback: number) => {
		const next = Number(value)
		return Number.isFinite(next) && next > 0 ? next : fallback
	}
	const signed = (value: unknown, fallback = 0) => {
		const next = Number(value)
		return Number.isFinite(next) ? next : fallback
	}

	const width = Math.max(
		0.05,
		positive(placeholderPayload?.size?.width, 1) *
			Math.max(0.01, Math.abs(signed(placeholderPayload?.scale?.x, 1)))
	)
	const height = Math.max(
		0.05,
		positive(placeholderPayload?.size?.height, 1) *
			Math.max(0.01, Math.abs(signed(placeholderPayload?.scale?.y, 1)))
	)
	const depth = Math.max(
		0.05,
		positive(placeholderPayload?.size?.depth, 1) *
			Math.max(0.01, Math.abs(signed(placeholderPayload?.scale?.z, 1)))
	)
	const yaw = signed(placeholderPayload?.rotation?.yaw, 0)
	const pitch = signed(placeholderPayload?.rotation?.pitch, 0)
	const roll = signed(placeholderPayload?.rotation?.roll, 0)
	const placeholderId = String(placeholderPayload?.objectId ?? '').trim()
	const placeholderName =
		String(placeholderPayload?.name ?? placeholderId ?? 'placeholder').trim() || 'placeholder'
	const placeholderJson = serializeSceneLayoutSelectedPlaceholder(nodeId)
	const signature = `${nodeId}:placeholder-glb:${placeholderId}:${placeholderJson}`

	const geometry = new THREE.BoxGeometry(width, height, depth)
	const material = new THREE.MeshStandardMaterial({
		color: String(placeholderPayload?.color ?? '').trim() || '#94a3b8',
		roughness: 0.88,
		metalness: 0.08
	})
	const mesh = new THREE.Mesh(geometry, material)
	mesh.name = placeholderName
	mesh.position.set(0, height * 0.5, 0)
	mesh.rotation.set((pitch * Math.PI) / 180, (yaw * Math.PI) / 180, (roll * Math.PI) / 180, 'XYZ')

	const root = new THREE.Group()
	root.name = placeholderName
	root.userData = {
		source: 'scene-layout-placeholder',
		nodeId,
		objectId: placeholderId
	}
	root.add(mesh)
	root.updateMatrixWorld(true)

	const exporter = new GLTFExporter()
	try {
		const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
			exporter.parse(
				root,
				(result: unknown) => {
					if (result instanceof ArrayBuffer) {
						resolve(result)
						return
					}
					reject(new Error('placeholder glb export returned non-binary payload'))
				},
				(error: unknown) =>
					reject(
						error instanceof Error
							? error
							: new Error(String(error ?? 'placeholder glb export failed'))
					),
				{ binary: true, onlyVisible: true }
			)
		})

		const fileName = `${slugSceneLayoutPlaceholderModelName(`${placeholderName}-${placeholderId || 'placeholder'}`)}.glb`
		const file = new File([arrayBuffer], fileName, { type: 'model/gltf-binary' })
		return {
			file,
			signature,
			placeholderId,
			placeholderJson,
			placeholderName
		}
	} finally {
		geometry.dispose()
		material.dispose()
	}
}

const blobToDataUrl = (blob: Blob) =>
	new Promise<string>((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => {
			const result = String(reader.result ?? '')
			if (result.startsWith('data:')) {
				resolve(result)
				return
			}
			reject(new Error('read blob as data url failed'))
		}
		reader.onerror = () => reject(reader.error ?? new Error('read blob failed'))
		reader.readAsDataURL(blob)
	})

const resolveGeneratedModelTransferSource = async (file: File) => {
	let assetUrl = ''
	let assetPath = ''

	try {
		const projectId = Number(currentProjectId.value ?? 0)
		if (projectId > 0) {
			const uploaded = (await blueprintProjectService.uploadAsset(file, 'file', {
				projectId
			})) as AssetImportResult
			if (uploaded.ok) {
				const asset = uploaded.asset ?? {}
				assetUrl = resolveBackendUrl(String(asset.url || ''))
				assetPath = String(asset.absolutePath || '').trim()
			}
		}
	} catch {
		// fall back to local data url below
	}

	return {
		transferUrl: assetUrl || (await blobToDataUrl(file)),
		assetUrl,
		assetPath
	}
}

const escapeAttrSelectorValue = (value: string) => String(value ?? '').replace(/"/g, '\\"')

const captureModel3DNodeCanvasPreview = (nodeId: string) => {
	const safeNodeId = escapeAttrSelectorValue(String(nodeId ?? '').trim())
	if (!safeNodeId) return ''
	const canvas = document.querySelector(
		`canvas[data-wf-model3d-canvas-node-id="${safeNodeId}"]`
	) as HTMLCanvasElement | null
	if (!canvas) return ''
	const width = Number(canvas.width ?? 0)
	const height = Number(canvas.height ?? 0)
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		return ''
	}
	try {
		return canvas.toDataURL('image/png')
	} catch {
		return ''
	}
}

const {
	connectedMeshyPrompt,
	connectedImageOutputUrl,
	connectedMeshyImageUrls,
	connectedMeshyImageInputs,
	connectedMeshyModelInput,
	connectedMeshySourcePreview,
	normalizeMeshyImageInputValue,
	buildMeshyImageInputFromNode,
	hasConnectedMeshyConsumer,
	meshyImageOutputCount,
	missingMeshyImageOutputAnchors
} = useAIWorkflowMeshyInputResolver({
	store,
	getFirstIncomingEdge,
	getIncomingEdges,
	getOutgoingEdges,
	hasOutgoingEdge,
	getTextOutputForNode: (nodeId) => getTextOutputForNode(nodeId),
	nodeResourceUrl,
	nodeResourceName,
	getMeshyEffectiveImageSource,
	getMeshyEffectiveModelSource,
	getMeshyDisplayThumbnailUrl,
	getSceneDecomposeImageUrl: (fromNode, fromAnchorId) => {
		const settings = fromNode.sceneDecomposeSettings
		const rawOutputs = settings?.outputs
		const outputs: WorkflowSceneDecomposeOutput[] = Array.isArray(rawOutputs) ? rawOutputs : []
		const item = outputs.find((entry) => String(entry?.imageAnchorId ?? '') === fromAnchorId)
		if (!item?.generatedResourceId) return ''
		const resource = store.state.resourcesById[item.generatedResourceId] as
			| WorkflowResource
			| undefined
		return String(resource?.url ?? '').trim()
	},
	getComfyImageUrl: (fromNode, fromAnchorId) => {
		const outputs = Array.isArray(fromNode.comfyuiSettings?.outputs)
			? (fromNode.comfyuiSettings!.outputs! as ComfyLocalizedOutput[])
			: []
		const media = comfyOutputForAnchor(
			outputs,
			fromAnchorId,
			'image'
		) as ComfyLocalizedOutput | null
		return String(media?.url ?? '').trim()
	},
	blobToDataUrl,
	resolveBackendUrl,
	buildCroppedImageTransferFile,
	createSceneLayoutPlaceholderModelFile,
	resolveGeneratedModelTransferSource,
	captureModel3DNodeCanvasPreview
})

const { buildMeshyRequestPayload } = useAIWorkflowMeshyRequest({
	connectedMeshyPrompt,
	connectedMeshyImageInputs,
	connectedMeshyModelInput,
	buildMeshyImageInputFromNode,
	normalizeMeshyImageInputValue,
	hasConnectedMeshyConsumer,
	missingMeshyImageOutputAnchors,
	meshyImageOutputCount
})

const syncModel3DInputFromUpstream = async (nodeId: string, opts?: { warn?: boolean }) => {
	const node = store.state.nodesById[nodeId]
	if (!node || node.type !== 'model3d') return false

	const incoming = getIncomingEdges(nodeId, 'in-resource')
	for (const edge of incoming) {
		const fromNode = store.state.nodesById[String(edge.fromNodeId ?? '')]
		if (!fromNode) continue
		const fromAnchorId = String(edge.fromAnchorId ?? '').trim()

		if (fromNode.type === 'meshy') {
			const settings = fromNode.meshySettings ?? {}
			const effective = getMeshyEffectiveModelSource(settings)
			const sourceUrl = effective.preferredUrl || effective.assetUrl
			if (!sourceUrl) continue
			const format = effective.format
			const name = `meshy_${String(settings.meshyTaskId ?? fromNode.id).trim() || fromNode.id}.${format}`
			const persisted = (await persistExternalAssetToProject({
				kind: 'file',
				name,
				sourceUrl,
				sourcePath: effective.assetPath || undefined
			})) as PersistedAsset | null
			revokeNodeModel3DObjectUrl(nodeId)
			const finalModelUrl = String(persisted?.url || effective.assetUrl || sourceUrl)
			if (isMeshyRemoteUrl(finalModelUrl)) {
				console.warn(
					'[DVS:syncModel3D] meshy asset not yet localized, skipping commit — node:',
					nodeId
				)
				continue
			}
			store.commit('setNodeModel3DSettings', {
				nodeId,
				model3dSettings: {
					modelUrl: finalModelUrl,
					modelFormat: format,
					modelSourceName: name,
					modelSourcePath:
						String(persisted?.absolutePath || effective.assetPath || '').trim() || undefined,
					modelProjectRelativePath:
						String(persisted?.projectRelativePath || '').trim() || undefined,
					modelAssetUrl: String(persisted?.url || ''),
					modelAssetPath: String(persisted?.absolutePath || '').trim() || undefined,
					modelAssetProjectRelativePath:
						String(persisted?.projectRelativePath || '').trim() || undefined,
					lastInputSignature: `${fromNode.id}:${String(settings.meshyTaskId ?? '')}:${sourceUrl}`,
					lastInputNodeId: fromNode.id,
					lastInputSourceUrl: sourceUrl,
					lastInputSourcePath: effective.assetPath || undefined,
					lastInputSourceName: name
				}
			})
			return true
		}

		if (fromNode.type === 'model3d') {
			const settings: WorkflowModel3DNodeSettings = fromNode.model3dSettings ?? {}
			const preferredUrl = String(settings.modelAssetUrl ?? settings.modelUrl ?? '').trim()
			if (!preferredUrl) continue
			const format = settings.modelFormat === 'gltf' ? 'gltf' : 'glb'
			const name = String(settings.modelSourceName ?? '').trim() || `model_${fromNode.id}.${format}`
			const persisted = (await persistExternalAssetToProject({
				kind: 'file',
				name,
				sourceUrl: preferredUrl,
				sourcePath:
					String(settings.modelAssetPath ?? settings.modelSourcePath ?? '').trim() || undefined
			})) as PersistedAsset | null
			revokeNodeModel3DObjectUrl(nodeId)
			store.commit('setNodeModel3DSettings', {
				nodeId,
				model3dSettings: {
					modelUrl: String(persisted?.url || preferredUrl),
					modelFormat: format,
					modelSourceName: name,
					modelSourcePath:
						String(
							persisted?.absolutePath || settings.modelAssetPath || settings.modelSourcePath || ''
						).trim() || undefined,
					modelProjectRelativePath:
						String(
							persisted?.projectRelativePath ||
								settings.modelAssetProjectRelativePath ||
								settings.modelProjectRelativePath ||
								''
						).trim() || undefined,
					modelAssetUrl: String(persisted?.url || ''),
					modelAssetPath: String(persisted?.absolutePath || '').trim() || undefined,
					modelAssetProjectRelativePath:
						String(
							persisted?.projectRelativePath ||
								settings.modelAssetProjectRelativePath ||
								settings.modelProjectRelativePath ||
								''
						).trim() || undefined,
					lastInputSignature: `${fromNode.id}:${preferredUrl}`,
					lastInputNodeId: fromNode.id,
					lastInputSourceUrl: preferredUrl,
					lastInputSourcePath:
						String(settings.modelAssetPath ?? settings.modelSourcePath ?? '').trim() || undefined,
					lastInputSourceName: name
				}
			})
			return true
		}

		if (fromNode.type === 'scene-layout' && fromAnchorId === 'out-selected-placeholder') {
			const generated = await createSceneLayoutPlaceholderModelFile(fromNode.id)
			if (!generated) continue
			const nextSignature = generated.signature
			const currentSettings = node.model3dSettings ?? {}
			if (
				String(currentSettings.lastInputSignature ?? '').trim() === nextSignature &&
				String(currentSettings.modelUrl ?? '').trim()
			) {
				return true
			}

			const objectUrl = URL.createObjectURL(generated.file)
			const transfer = await resolveGeneratedModelTransferSource(generated.file)
			revokeNodeModel3DObjectUrl(nodeId)
			setObjectUrl(`model3d:${nodeId}`, objectUrl)
			store.commit('setNodeModel3DSettings', {
				nodeId,
				model3dSettings: {
					modelUrl: String(transfer.assetUrl || objectUrl),
					modelFormat: 'glb',
					modelSourceName: generated.file.name,
					modelSourcePath: String(transfer.assetPath || '').trim() || undefined,
					modelAssetUrl: transfer.transferUrl,
					modelAssetPath: String(transfer.assetPath || '').trim() || undefined,
					lastInputSignature: nextSignature,
					lastInputNodeId: fromNode.id,
					lastInputSourceUrl: transfer.transferUrl,
					lastInputSourcePath: String(transfer.assetPath || '').trim() || undefined,
					lastInputSourceName: `占位体 ${generated.placeholderName}`,
					lastInputPlaceholderId: generated.placeholderId || undefined,
					lastInputPlaceholderJson: generated.placeholderJson || undefined
				}
			})
			return true
		}
	}

	if (opts?.warn) pushToast('未找到可用的上游模型输出。', 'warn')
	return false
}

const syncConnectedModel3DTargets = async (fromNodeId: string) => {
	const targets = getOutgoingEdges(fromNodeId)
		.filter((e: WorkflowEdge) => String(e.toAnchorId ?? '') === 'in-resource')
		.map((e: WorkflowEdge) => String(e.toNodeId ?? '').trim())
		.filter((id: string, index: number, arr: string[]) => !!id && arr.indexOf(id) === index)

	for (const nodeId of targets) {
		await syncModel3DInputFromUpstream(nodeId)
	}
}

const syncConnectedImageTargetsFromMeshy = async (fromNodeId: string) => {
	const fromNode = store.state.nodesById[fromNodeId]
	if (!fromNode) return false

	// 根据节点类型读取 meshy 图片设置
	interface MeshyImageSettingsNode extends WorkflowNode {
		imageSettings?: { meshyImageSettings?: Record<string, unknown> }
		model3dSettings?: { meshyModelSettings?: Record<string, unknown> }
		meshySettings?: Record<string, unknown>
	}
	const getMeshyImageSettings = (node: MeshyImageSettingsNode): Record<string, unknown> => {
		if (node.type === 'image') return node.imageSettings?.meshyImageSettings ?? {}
		if (node.type === 'model3d') return node.model3dSettings?.meshyModelSettings ?? {}
		return node.meshySettings ?? {}
	}
	const settings = getMeshyImageSettings(fromNode as MeshyImageSettingsNode)

	// 从 outputSummary 或直接字段获取图片 URL
	const outputSummary = (settings.outputSummary ?? {}) as {
		imageUrls?: unknown[]
		assetUrl?: string
		preferredUrl?: string
		assetPath?: string
	}
	const imageUrls = Array.isArray(outputSummary.imageUrls)
		? outputSummary.imageUrls
				.map((x: unknown) => String(x ?? '').trim())
				.filter(Boolean)
				.slice(0, 4)
		: []
	const fallbackUrl = String(
		outputSummary.assetUrl ||
			outputSummary.preferredUrl ||
			(settings.outputAssetUrl as string) ||
			''
	).trim()
	if (!imageUrls.length && !fallbackUrl) return false

	const outputEdges = getOutgoingEdges(fromNodeId).filter((e: WorkflowEdge) => {
		if (!e) return false
		const fromAnchorId = String(e.fromAnchorId ?? '')
		const toAnchorId = String(e.toAnchorId ?? '')
		return (
			/^out-image(?:-\d+)?$/.test(fromAnchorId) &&
			(toAnchorId === 'in-image' || toAnchorId === 'in-resource')
		)
	})
	if (!outputEdges.length) return false

	const resolveOutputUrlByAnchor = (fromAnchorId: string) => {
		const m = /^out-image-(\d+)$/.exec(String(fromAnchorId))
		const idx = m ? Math.max(1, Math.min(4, Number(m[1]) || 1)) - 1 : 0
		const fromList = imageUrls[idx]
		return String(fromList || fallbackUrl || imageUrls[0] || '').trim()
	}

	for (const e of outputEdges) {
		const targetNodeId = String(e.toNodeId ?? '').trim()
		const targetNode = store.state.nodesById[targetNodeId]
		if (!targetNode || targetNode.type !== 'image') continue

		const sourceUrl = resolveOutputUrlByAnchor(String(e.fromAnchorId ?? ''))
		if (!sourceUrl) continue

		const ext = fileExtensionFromUrl(sourceUrl, '.png')
		const anchorSuffix = String(e.fromAnchorId ?? 'out-image').replace(/[^a-zA-Z0-9_-]/g, '_')
		const fileNameBase = `meshy_${String((settings.taskId as string) ?? fromNode.id).trim() || fromNode.id}_${anchorSuffix}_${targetNodeId}`
		const fileName = `${fileNameBase}${ext}`

		let cloned: File | null = null
		try {
			cloned = await fileFromUrl(sourceUrl, fileNameBase)
		} catch {
			cloned = null
		}

		if (!cloned) {
			const persisted = (await persistExternalAssetToProject({
				kind: 'image',
				name: fileName,
				sourceUrl,
				sourcePath: outputSummary.assetPath || (settings.outputAssetPath as string) || undefined
			})) as PersistedAsset | null
			const outputUrl = String(persisted?.url || sourceUrl).trim()
			const outputPath = String(
				persisted?.absolutePath ||
					outputSummary.assetPath ||
					(settings.outputAssetPath as string) ||
					''
			).trim()
			if (!outputUrl) continue

			try {
				cloned = await fileFromUrl(outputUrl, fileNameBase)
			} catch {
				cloned = null
			}

			if (!cloned) {
				bindMediaResourceToNode(targetNodeId, 'image', outputUrl, fileName, {
					sourcePath: outputPath || undefined,
					projectRelativePath: String(persisted?.projectRelativePath || '').trim() || undefined
				})
				autoSizeMediaNode(targetNodeId, outputUrl, 'image')
				continue
			}
		}

		onNodeUploadResource(targetNodeId, cloned, 'image', { autoDistribute: false })
	}
	return true
}

const mediaReadyDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const onNodeMediaReady = (nodeId: string) => {
	markNodeMediaReady(nodeId)

	const existing = mediaReadyDebounceTimers.get(nodeId)
	if (existing) clearTimeout(existing)

	mediaReadyDebounceTimers.set(
		nodeId,
		setTimeout(() => {
			mediaReadyDebounceTimers.delete(nodeId)
			if (selectedNodeIds.value.includes(nodeId)) return
			if (fullRenderNodeIds.value.has(nodeId)) return

			const node = store.state.nodesById[nodeId]
			if (!node) return

			const version = getNodeScreenshotVersion(node)
			if (!screenshotPool.hasCachedScreenshot(nodeId, version)) {
				screenshotPool.invalidateScreenshot(nodeId)
				const newMap = new Map(nodeScreenshotMap.value)
				newMap.delete(nodeId)
				nodeScreenshotMap.value = newMap
				void scheduleNodeScreenshot(node, 0, 'normal')
			}
		}, 350)
	)
}

const onNodeInvalidateScreenshot = (nodeId: string) => {
	if (selectedNodeIds.value.includes(nodeId)) return
	if (fullRenderNodeIds.value.has(nodeId)) return
	screenshotPool.invalidateScreenshot(nodeId)
	const newMap = new Map(nodeScreenshotMap.value)
	newMap.delete(nodeId)
	nodeScreenshotMap.value = newMap
	nextTick(() => {
		const node = store.state.nodesById[nodeId]
		if (node) void scheduleNodeScreenshot(node, 0, 'normal')
	})
}

const videoPosterGenerating = new Set<string>()
let posterAutoSaveTimer: ReturnType<typeof setTimeout> | number | null = null
let posterAutoSaveQueued = false
let posterAutoSaveRunning = false

const flushPosterAutoSave = async () => {
	if (posterAutoSaveRunning) return
	if (!posterAutoSaveQueued) return
	if (!currentProjectId.value || !String(currentProjectName.value || '').trim()) {
		posterAutoSaveQueued = false
		return
	}
	posterAutoSaveRunning = true
	try {
		while (posterAutoSaveQueued) {
			posterAutoSaveQueued = false
			await saveProjectToBackend(currentProjectName.value, { silent: true })
		}
	} finally {
		posterAutoSaveRunning = false
	}
}

const scheduleAutoSaveAfterPosterReady = () => {
	if (!currentProjectId.value || !String(currentProjectName.value || '').trim()) return
	posterAutoSaveQueued = true
	if (posterAutoSaveTimer) {
		window.clearTimeout(posterAutoSaveTimer)
		posterAutoSaveTimer = null
	}
	posterAutoSaveTimer = window.setTimeout(() => {
		posterAutoSaveTimer = null
		void flushPosterAutoSave()
	}, 700)
}

const ensureVideoResourcePoster = async (resourceId: string, url: string) => {
	const rid = String(resourceId || '').trim()
	const rawUrl = String(url || '').trim()
	if (!rid || !rawUrl) return
	if (videoPosterGenerating.has(rid)) return

	const cur = store.state.resourcesById?.[rid]
	const existedPoster = typeof cur?.posterUrl === 'string' ? String(cur.posterUrl).trim() : ''
	if (existedPoster) return

	videoPosterGenerating.add(rid)
	try {
		const thumb = await createVideoFirstFrameThumbnail({
			url: rawUrl,
			targetWidth: 360,
			mime: 'image/jpeg',
			quality: 0.86,
			timeoutMs: 12000
		})

		let nextPosterUrl = ''
		let nextPosterSourcePath = ''
		try {
			const file = new File([thumb.blob], `thumb_${rid}.jpg`, { type: thumb.mime || 'image/jpeg' })
			const uploaded = await blueprintProjectService.uploadAsset(file, 'image', {
				projectId: currentProjectId.value,
				bucket: 'thumbnails'
			})
			if (uploaded.ok) {
				const asset = uploaded.asset
				nextPosterUrl = resolveBackendUrl(String(asset?.url || ''))
				nextPosterSourcePath = String(asset?.absolutePath || '').trim()
				const nextPosterProjectRelativePath = String(
					asset?.projectRelativePath || asset?.relativePath || ''
				).trim()
				if (nextPosterProjectRelativePath) {
					store.commit('patchResource', {
						resourceId: rid,
						patch: {
							posterProjectRelativePath: nextPosterProjectRelativePath
						}
					})
				}
			}
		} catch {
			// fallback to local objectURL below
		}

		if (!nextPosterUrl) {
			try {
				nextPosterUrl = URL.createObjectURL(thumb.blob)
				setObjectUrl(`wf-poster:${rid}`, nextPosterUrl)
			} catch {
				nextPosterUrl = ''
			}
		}

		if (nextPosterUrl) {
			const prevPoster = String(store.state.resourcesById?.[rid]?.posterUrl || '').trim()
			if (prevPoster && prevPoster.startsWith('blob:') && prevPoster !== nextPosterUrl) {
				try {
					URL.revokeObjectURL(prevPoster)
				} catch {
					// ignore
				}
			}
			store.commit('patchResource', {
				resourceId: rid,
				patch: {
					posterUrl: nextPosterUrl,
					posterSourcePath: nextPosterSourcePath || undefined
				}
			})
		}
	} catch {
		// ignore thumbnail failures; resource itself remains usable
	} finally {
		videoPosterGenerating.delete(rid)
		if (!videoPosterGenerating.size) {
			scheduleAutoSaveAfterPosterReady()
		}
	}
}

const onStoryBranchUpdate = (nodeId: string, payload: { branchId: string; text: string }) => {
	store.commit('updateStoryBranch', { nodeId, branchId: payload.branchId, text: payload.text })
}

const onStoryBranchAdd = (nodeId: string) => {
	store.commit('addStoryBranch', { nodeId })
}

const onStoryBranchRemove = (nodeId: string, branchId: string) => {
	store.commit('removeStoryBranch', { nodeId, branchId })
}

const onStoryBranchUpdateFromInspector = (nodeId: string, branchId: string, text: string) => {
	store.commit('updateStoryBranch', { nodeId, branchId, text })
}

const onInspectorUploadResource = async (nodeId: string, file: File, kind: 'image' | 'video') => {
	await onNodeUploadResource(nodeId, file, kind)
}

const onInspectorClearResource = (nodeId: string) => {
	onNodeClearResource(nodeId)
}

const {
	downloadUrlAsBlob,
	inferSelectedResourceFilename,
	selectedNodeLocalResourcePath,
	canOpenSelectedNodeFolder
} = useAIWorkflowResourceActions({
	store,
	selectedNodeId,
	isElectron,
	nodeResourceName,
	getProjectId: () => currentProjectId.value,
	getProjectRootPath: (_projectId?: number) => currentProjectRootPath.value
})

const isWebEnvironment = () => getRuntimePlatform() === 'web'

const { storyPreview, rotateImagePreviewUrl, connectedImageInputUrl, connectedImageInputSource } =
	useAIWorkflowMediaPreviewSources({
		store,
		getFirstIncomingEdge,
		nodeResourceUrl,
		connectedImageOutputUrl,
		comfyOutputForAnchor
	})

const {
	connectedSceneUnderstandImageInputs,
	connectedSceneUnderstandImageInputRefs,
	connectedSceneDecomposeImageInputs,
	connectedSceneDecomposeImageInputRefs,
	sceneDecomposeImageInputAnchorId,
	connectedSceneDecomposeImageInputAt,
	connectedSceneDecomposeImageInputRefAt
} = useAIWorkflowSceneImageInputs({
	store,
	getFirstIncomingEdge,
	connectedImageInputSource
})

const { sceneLayoutModelInputAnchorId, connectedSceneLayoutModelBindings } =
	useAIWorkflowSceneLayoutModelBindings({
		store,
		isSceneLayoutModelTargetItem,
		getIncomingEdges,
		getMeshyEffectiveModelSource
	})

const {
	extractSceneLayoutSourceItems,
	parseSceneLayoutMetadataItems,
	mergeSceneLayoutItemsWithMetadata,
	getSceneLayoutSelectedPlaceholderPayload,
	serializeSceneLayoutSelectedPlaceholder,
	serializeSceneLayoutOutput
} = useAIWorkflowSceneLayoutMetadata({
	store
})

const {
	connectedTextInputValue,
	sceneDecomposeTextOutputForAnchor,
	getTextOutputForNode,
	computeMergedText,
	getInputParamPreviewRefs
} = useAIWorkflowTextOutputResolver({
	store,
	getFirstIncomingEdge,
	getIncomingEdges,
	serializeSceneLayoutSelectedPlaceholder,
	serializeSceneLayoutOutput,
	nodeResourceUrl,
	nodeImagePreviewUrl
})

const { nodeExtraProps } = useAIWorkflowNodeExtraProps({
	store,
	connectedTextInputValue,
	computeMergedText,
	getInputParamPreviewRefs,
	storyPreview,
	nodeImagePreviewUrl,
	nodeImagePreviewVersion,
	nodeResourceUrl,
	nodeResourceName,
	connectedImageTargetsFromVideo: (videoNodeId) => connectedImageTargetsFromVideo(videoNodeId),
	rotateImagePreviewUrl,
	connectedSceneUnderstandImageInputs,
	connectedImageInputUrl,
	connectedImageInputSource,
	connectedSceneDecomposeImageInputs,
	connectedSceneLayoutModelBindings,
	viewportMotionActive,
	active3DPreviewNodeId,
	getThreePreviewState: getNodePreviewState,
	performancePriorityMode,
	nodeCount: computed(() => nodes.value.length),
	connectedMeshySourcePreview,
	buildMeshyNodePresentationSettings,
	connectedMeshyPrompt,
	connectedMeshyImageUrls,
	nodeMediaReloadToken,
	getFirstIncomingEdge,
	getUpstreamCroppedImageUrl
})

const latestGenerationTaskByNodeId = (nodeId: string) => {
	const ids = store.state.nodeGenerationTaskIdsByNodeId?.[nodeId]
	if (!Array.isArray(ids) || !ids.length) return null
	const firstId = ids[0]
	const task = store.state.nodeGenerationTasksById?.[firstId] || null
	return task
}

const onNodeStartThreePreview = (nodeId: string) => {
	startPreviewSession(nodeId)
}

const onNodeThreePreviewProgress = (
	nodeId: string,
	payloadValue?: WorkflowThreePreviewProgressPayload
) => {
	updatePreviewProgress(nodeId, payloadValue)
}

const onNodeThreePreviewReady = (nodeId: string) => {
	completePreviewSession(nodeId)
	screenshotPool.invalidateScreenshot(nodeId)
	const newMap = new Map(nodeScreenshotMap.value)
	newMap.delete(nodeId)
	nodeScreenshotMap.value = newMap
	nextTick(() => {
		setTimeout(() => {
			const node = store.state.nodesById[nodeId]
			if (node) void scheduleNodeScreenshot(node, 0, 'normal')
		}, 300)
	})
}

const onNodeThreePreviewError = (nodeId: string) => {
	failPreviewSession(nodeId)
}

const resolveLocalExecBasePath = () => {
	const fromWindow =
		typeof window?.__DWEB_LOCAL_EXEC_BASE_PATH === 'string'
			? String(window.__DWEB_LOCAL_EXEC_BASE_PATH)
			: ''
	const fromEnv = String(import.meta.env.VITE_LOCAL_EXEC_BASE_PATH || '')
	const fromStorage = String(localStorage.getItem('dweb.localExecBasePath') || '')
	if (!fromWindow && !fromEnv && fromStorage.trim().toLowerCase() === 'codex') return 'copilot'
	const candidate = String(fromWindow || fromEnv || fromStorage || 'copilot').trim()
	return candidate || 'copilot'
}

const resolveLocalExecStreamMode = (): 'real' | 'mock' => {
	const fromWindow =
		typeof window?.__DWEB_LOCAL_EXEC_STREAM_MODE === 'string'
			? String(window.__DWEB_LOCAL_EXEC_STREAM_MODE)
			: ''
	const fromEnv = String(import.meta.env.VITE_LOCAL_EXEC_STREAM_MODE || '')
	const fromStorage = String(localStorage.getItem('dweb.localExecStreamMode') || '')
	const candidate = String(fromWindow || fromEnv || fromStorage || 'real')
		.trim()
		.toLowerCase()
	return candidate === 'mock' ? 'mock' : 'real'
}

const comfyService = new ComfyUIBridgeService({
	localExecBasePath: resolveLocalExecBasePath(),
	// web 模式下不写 baseUrl，让路径保持相对路径走 Vite proxy (/api/* → http://127.0.0.1:5800)，
	// 避免浏览器因跨域而在测试环境出现 "Failed to fetch"。
	baseUrl: getRuntimePlatform() === 'web' ? '' : getBackendBaseUrl()
})
const localExecChatService = createLocalExecChatService(comfyService)
const localExecStreamMode = ref<'real' | 'mock'>(resolveLocalExecStreamMode())
localExecChatService.setLocalExecStreamMode(localExecStreamMode.value)
watch(
	() => localExecStreamMode.value,
	(mode) => {
		localExecChatService.setLocalExecStreamMode(mode)
		try {
			localStorage.setItem('dweb.localExecStreamMode', mode)
		} catch {
			// ignore storage failures
		}
	},
	{ immediate: true }
)
const sceneSkillService = new SceneSkillService()
const blueprintProjectService = new BlueprintProjectService()
const unrealExportService = new UnrealExportService()
let unrealExportPollTimer: number | null = null
let unrealExportSyncRunning = false
let unrealExportPollStopped = false
let unrealExportPollConsecutiveFailures = 0

const UNREAL_EXPORT_POLL_BASE_MS = 3000
const UNREAL_EXPORT_POLL_MAX_MS = 30000
const UNREAL_EXPORT_POLL_IDLE_EXTRA_MS = 1000
const UNREAL_EXPORT_POLL_JITTER_MS = 400

const buildResetUnrealExportSettings = (settings?: Record<string, unknown> | null) => {
	const autoPollVal = settings?.autoPoll
	return {
		connectionStatus: 'idle' as const,
		statusText: '未建立连接',
		message: '已清除旧项目中的 Unreal 会话与任务状态，请重新点击“等待连接”。',
		targetSessionId: undefined,
		connectedSession: null,
		lastHeartbeatAt: undefined,
		lastExportMode: undefined,
		lastExportJobId: undefined,
		lastExportStatus: undefined,
		lastExportStage: undefined,
		lastExportProgress: undefined,
		lastExportMessage: undefined,
		lastBlueprintAssetPath: undefined,
		lastModelsAssetPath: undefined,
		lastSpawnedLightCount: undefined,
		lastLightingTargetActor: undefined,
		lastExportAt: undefined,
		autoPoll: autoPollVal !== false
	}
}

const { stripUnrealExportRuntimeFromNodes, stripUnrealExportRuntimeFromSnapshot } =
	useAIWorkflowProjectUnrealSnapshot({
		buildResetUnrealExportSettings
	})

const resetCurrentUnrealExportNodeRuntimeState = () => {
	for (const nodeId of store.state.nodeOrder) {
		const node = store.state.nodesById[nodeId]
		if (!node || node.type !== 'unreal-export') continue
		store.commit('setNodeUnrealExportSettings', {
			nodeId,
			unrealExportSettings: buildResetUnrealExportSettings(node.unrealExportSettings ?? null)
		})
	}
}

const getUnrealExportSourceSceneLayoutNode = (nodeId: string) => {
	const edge = getFirstIncomingEdge(nodeId, 'in-layout-json')
	if (!edge) return null
	const fromNode = store.state.nodesById[String(edge.fromNodeId ?? '')]
	if (!fromNode || fromNode.type !== 'scene-layout') return null
	return fromNode
}

const syncUnrealExportNodesInternal = async (opts?: { silent?: boolean; nodeId?: string }) => {
	const targetNodeId = String(opts?.nodeId ?? '').trim()
	const nodesToSync = renderNodes.value.filter(
		(node) => node.type === 'unreal-export' && (!targetNodeId || node.id === targetNodeId)
	)
	if (!nodesToSync.length || unrealExportSyncRunning) {
		return { ok: true, hasRunningJob: false, skipped: true }
	}
	let hasRunningJob = false
	unrealExportSyncRunning = true
	try {
		const res = await unrealExportService.listSessions()
		if (!res.ok) {
			if (!opts?.silent) pushToast(`读取虚幻连接列表失败：${res.error || 'unknown'}`, 'warn')
			return { ok: false, hasRunningJob: false, skipped: false }
		}
		const sessions: UnrealExportSessionInfo[] = Array.isArray(res.sessions) ? res.sessions : []
		const activeSessions = sessions.filter(
			(item) => String(item?.status ?? 'connected') !== 'stale'
		)
		const latestConnected = activeSessions[0] ?? sessions[0] ?? null
		for (const node of nodesToSync) {
			const current: Partial<WorkflowUnrealExportNodeSettings> = node.unrealExportSettings ?? {}
			const lastExportJobId = safeGetString(current, 'lastExportJobId')?.trim() ?? ''
			const targetSessionId = safeGetString(current, 'targetSessionId')?.trim() ?? ''
			const currentProjectPath =
				safeGetString(current.connectedSession ?? {}, 'projectPath')?.trim() ?? ''
			const currentProjectName =
				safeGetString(current.connectedSession ?? {}, 'projectName')?.trim() ?? ''
			const exactSession = targetSessionId
				? (sessions.find((item) => String(item?.sessionId ?? '') === targetSessionId) ?? null)
				: null
			const replacementSession =
				activeSessions.find((item) => {
					const itemProjectPath = String(item?.projectPath ?? '').trim()
					const itemProjectName = String(item?.projectName ?? '').trim()
					if (currentProjectPath && itemProjectPath && itemProjectPath === currentProjectPath)
						return true
					if (currentProjectName && itemProjectName && itemProjectName === currentProjectName)
						return true
					return false
				}) ?? latestConnected
			const matchedSession =
				exactSession && String(exactSession.status ?? 'connected') !== 'stale'
					? exactSession
					: replacementSession
			let latestJob: UnrealExportJobInfo | null = null
			let latestJobMissing = false
			if (lastExportJobId) {
				const jobRes = await unrealExportService.getJob(lastExportJobId)
				if (jobRes.ok) latestJob = jobRes.job
				else if (jobRes.status === 404) latestJobMissing = true
			}
			if (matchedSession && String(matchedSession.status ?? 'connected') !== 'stale') {
				const latestJobStatus = String(latestJob?.status ?? '').trim()
				const latestJobMessage = String(latestJob?.message ?? '').trim()
				const latestJobResult =
					latestJob?.resultData && typeof latestJob.resultData === 'object'
						? (latestJob.resultData as Record<string, unknown>)
						: null
				const nodeHasRunningJob =
					latestJobStatus === 'queued' ||
					latestJobStatus === 'picked' ||
					latestJobStatus === 'downloading' ||
					latestJobStatus === 'importing' ||
					latestJobStatus === 'assembling-actor' ||
					latestJobStatus === 'applying-lighting'
				const hasFailedJob = latestJobStatus === 'failed'
				if (nodeHasRunningJob) hasRunningJob = true
				const resultProgress = latestJobResult ? Number(latestJobResult.progress) : NaN
				const resultSpawnedLightCount = latestJobResult
					? Number(latestJobResult.spawnedLightCount)
					: NaN
				const resultLayoutProtocolVersion = latestJobResult
					? Number(latestJobResult.layoutProtocolVersion)
					: NaN
				const resultSlotCount = latestJobResult ? Number(latestJobResult.slotCount) : NaN
				const resultAppliedSlotCount = latestJobResult
					? Number(latestJobResult.appliedSlotCount)
					: NaN
				const resultMaterialOverrideCount = latestJobResult
					? Number(latestJobResult.materialOverrideCount)
					: NaN
				store.commit('setNodeUnrealExportSettings', {
					nodeId: node.id,
					unrealExportSettings: {
						connectionStatus: hasFailedJob
							? 'error'
							: nodeHasRunningJob
								? 'exporting'
								: 'connected',
						statusText: hasFailedJob
							? '导出任务执行失败'
							: nodeHasRunningJob
								? '虚幻插件正在执行导出任务'
								: `已连接 ${String(matchedSession.projectName ?? matchedSession.displayName ?? matchedSession.sessionId).trim() || matchedSession.sessionId}`,
						targetSessionId: String(matchedSession.sessionId ?? '').trim(),
						connectedSession: matchedSession,
						lastHeartbeatAt: Number(matchedSession.lastSeenAt ?? 0) || undefined,
						message: latestJobMissing
							? '旧导出任务已不存在，已清理历史轮询状态。'
							: latestJobMessage ||
								(nodeHasRunningJob
									? '虚幻插件已拉取任务，正在生成场景。'
									: '虚幻插件已在线，可直接发送导出任务。'),
						lastExportMode: latestJobMissing
							? undefined
							: String(latestJob?.exportPayload?.exportMode ?? '').trim() === 'lighting-only'
								? 'lighting-only'
								: 'scene-layout',
						lastExportJobId: latestJobMissing
							? undefined
							: (latestJob?.jobId ?? current.lastExportJobId),
						lastExportStatus: latestJobMissing
							? undefined
							: latestJobStatus || current.lastExportStatus,
						lastExportStage: latestJobMissing
							? undefined
							: String(latestJobResult?.stage ?? '').trim() || current.lastExportStage,
						lastExportProgress: latestJobMissing
							? undefined
							: Number.isFinite(resultProgress)
								? resultProgress
								: current.lastExportProgress,
						lastExportMessage: latestJobMissing
							? undefined
							: latestJobMessage || current.lastExportMessage,
						lastBlueprintAssetPath: latestJobMissing
							? undefined
							: String(latestJobResult?.blueprintAssetPath ?? '').trim() ||
								current.lastBlueprintAssetPath,
						lastModelsAssetPath: latestJobMissing
							? undefined
							: String(latestJobResult?.modelsAssetPath ?? '').trim() ||
								current.lastModelsAssetPath,
						lastActorBaseClass: latestJobMissing
							? undefined
							: String(latestJobResult?.actorBaseClass ?? '').trim() || current.lastActorBaseClass,
						lastSpawnedLightCount: latestJobMissing
							? undefined
							: Number.isFinite(resultSpawnedLightCount)
								? resultSpawnedLightCount
								: current.lastSpawnedLightCount,
						lastLightingTargetActor: latestJobMissing
							? undefined
							: String(
									latestJobResult?.lightingTargetActorLabel ??
										latestJobResult?.lightingTargetActorPath ??
										''
								).trim() || current.lastLightingTargetActor,
						lastLayoutProtocolVersion: latestJobMissing
							? undefined
							: Number.isFinite(resultLayoutProtocolVersion)
								? resultLayoutProtocolVersion
								: current.lastLayoutProtocolVersion,
						lastSlotCount: latestJobMissing
							? undefined
							: Number.isFinite(resultSlotCount)
								? resultSlotCount
								: current.lastSlotCount,
						lastAppliedSlotCount: latestJobMissing
							? undefined
							: Number.isFinite(resultAppliedSlotCount)
								? resultAppliedSlotCount
								: current.lastAppliedSlotCount,
						lastMaterialOverrideCount: latestJobMissing
							? undefined
							: Number.isFinite(resultMaterialOverrideCount)
								? resultMaterialOverrideCount
								: current.lastMaterialOverrideCount,
						lastExportAt: latestJobMissing
							? undefined
							: Number(latestJob?.updatedAt ?? latestJob?.createdAt ?? current.lastExportAt ?? 0) ||
								current.lastExportAt
					}
				})
				continue
			}
			if (
				current.connectionStatus === 'waiting' ||
				current.connectionStatus === 'connected' ||
				current.connectionStatus === 'exporting' ||
				current.connectionStatus === 'error'
			) {
				store.commit('setNodeUnrealExportSettings', {
					nodeId: node.id,
					unrealExportSettings: {
						connectionStatus: 'waiting',
						statusText: '等待虚幻插件连接',
						connectedSession: null,
						message: '请在 Unreal 插件面板点击“连接工作流”。',
						targetSessionId: undefined,
						lastHeartbeatAt: undefined,
						lastExportJobId: undefined,
						lastExportStatus: undefined,
						lastExportStage: undefined,
						lastExportProgress: undefined,
						lastExportMessage: undefined,
						lastBlueprintAssetPath: undefined,
						lastModelsAssetPath: undefined,
						lastExportAt: undefined
					}
				})
			}
		}
		return { ok: true, hasRunningJob, skipped: false }
	} catch (err: unknown) {
		if (!opts?.silent) pushToast(`读取虚幻连接列表失败：${getErrorMessage(err)}`, 'warn')
		return { ok: false, hasRunningJob: false, skipped: false }
	} finally {
		unrealExportSyncRunning = false
	}
}

const syncUnrealExportNodes = async (opts?: { silent?: boolean; nodeId?: string }) => {
	await syncUnrealExportNodesInternal(opts)
}

const getNextUnrealExportPollDelayMs = (opts?: { hasRunningJob?: boolean }) => {
	const exp = Math.min(4, Math.max(0, unrealExportPollConsecutiveFailures))
	const baseDelay = Math.min(
		UNREAL_EXPORT_POLL_MAX_MS,
		UNREAL_EXPORT_POLL_BASE_MS * Math.pow(2, exp)
	)
	const idleExtra = opts?.hasRunningJob ? 0 : UNREAL_EXPORT_POLL_IDLE_EXTRA_MS
	const jitter = Math.round((Math.random() * 2 - 1) * UNREAL_EXPORT_POLL_JITTER_MS)
	return Math.max(1000, baseDelay + idleExtra + jitter)
}

const clearUnrealExportPollTimer = () => {
	if (unrealExportPollTimer != null) {
		window.clearTimeout(unrealExportPollTimer)
		unrealExportPollTimer = null
	}
}

const scheduleUnrealExportPoll = (delayMs: number) => {
	clearUnrealExportPollTimer()
	if (unrealExportPollStopped) return
	unrealExportPollTimer = window.setTimeout(
		() => {
			void runUnrealExportPollLoop()
		},
		Math.max(0, delayMs)
	)
}

const runUnrealExportPollLoop = async () => {
	if (unrealExportPollStopped) return
	const result = await syncUnrealExportNodesInternal({ silent: true })
	if (!result.ok) unrealExportPollConsecutiveFailures += 1
	else if (!result.skipped) unrealExportPollConsecutiveFailures = 0
	scheduleUnrealExportPoll(getNextUnrealExportPollDelayMs({ hasRunningJob: result.hasRunningJob }))
}

const startUnrealExportPolling = () => {
	unrealExportPollStopped = false
	unrealExportPollConsecutiveFailures = 0
	scheduleUnrealExportPoll(0)
}

const stopUnrealExportPolling = () => {
	unrealExportPollStopped = true
	clearUnrealExportPollTimer()
}

const onNodeAwaitUnrealConnection = async (nodeId: string) => {
	const node = store.state.nodesById[nodeId]
	if (!node || node.type !== 'unreal-export') return
	store.commit('setNodeUnrealExportSettings', {
		nodeId,
		unrealExportSettings: {
			connectionStatus: 'waiting',
			statusText: '等待虚幻插件连接',
			message: '请在 Unreal 编辑器中打开 DwebWorkflowBridge 插件并点击“连接工作流”。',
			autoPoll: true
		}
	})
	await syncUnrealExportNodes({ silent: true, nodeId })
}

type SceneLayoutNodeExpose = {
	getResolvedLayoutForUnreal: () => Promise<
		{ ok: true; exportData: WorkflowUnrealResolvedLayoutExport } | { ok: false; error: string }
	>
}

const sceneLayoutNodeComponentRefs = new Map<string, SceneLayoutNodeExpose>()

const setWorkflowNodeComponentRef = (nodeId: string, nodeType: string) => {
	return (instance: unknown | null) => {
		if (nodeType !== 'scene-layout') return
		if (
			instance &&
			typeof (instance as SceneLayoutNodeExpose).getResolvedLayoutForUnreal === 'function'
		) {
			sceneLayoutNodeComponentRefs.set(nodeId, instance as SceneLayoutNodeExpose)
			return
		}
		sceneLayoutNodeComponentRefs.delete(nodeId)
	}
}

const getResolvedLayoutForUnreal = async (sceneLayoutNodeId: string) => {
	const normalizedNodeId = String(sceneLayoutNodeId ?? '').trim()
	if (!normalizedNodeId) {
		return { ok: false as const, error: '缺少 scene-layout 节点 ID。' }
	}
	const instance = sceneLayoutNodeComponentRefs.get(normalizedNodeId)
	if (!instance || typeof instance.getResolvedLayoutForUnreal !== 'function') {
		return { ok: false as const, error: '未找到场景布局预览实例，请先打开并完成预览加载。' }
	}
	try {
		return await instance.getResolvedLayoutForUnreal()
	} catch (err: unknown) {
		return { ok: false as const, error: getErrorMessage(err) }
	}
}

const projectToolbarRef = ref<InstanceType<typeof BlueprintProjectToolbar> | null>(null)
const projectList = ref<BlueprintProjectListItem[]>([])
const currentProjectId = ref<number | null>(null)
const currentProjectName = ref('')
const currentProjectRootPath = ref('')
const noProjectSelected = ref(false)
const agentWorkingDirectory = computed(() => {
	const projectName = String(currentProjectName.value || '').trim()
	if (projectName) return `/Users/dweb/Desktop/dweb-video-studio · ${projectName}`
	return '/Users/dweb/Desktop/dweb-video-studio'
})

watch(
	() => chatModelKey.value,
	(v, prev) => {
		if (v === 'codex') {
			chatPanelMode.value = 'agent'
		} else if (prev === 'codex') {
			chatPanelMode.value = 'regular'
		}
	},
	{ immediate: true }
)

watch(
	() => chatModelKey.value,
	(v) => {
		if (v !== 'codex') return
		void loadCodexSessions()
	},
	{ immediate: true }
)

watch(
	() => currentProjectId.value,
	() => {
		if (chatPanelMode.value !== 'agent') return
		void loadCodexSessions()
	}
)

const { setSavedProject, setUnsavedProject, readLastProjectId, forgetLastProjectId } =
	useAIWorkflowProjectIdentity({
		currentProjectId,
		currentProjectName,
		currentProjectRootPath,
		lastProjectStorageKey: AIWF_LAST_PROJECT_STORAGE_KEY
	})

let pushToastBridge = (_message: string, _tone?: 'info' | 'warn' | 'error') => {}

const { onComfyUISettingsUpdate, onComfyUIConnect, onComfyUISelectWorkflow } =
	useAIWorkflowComfyConnection({
		store,
		comfyService,
		pushToast: (message, tone) => pushToastBridge(message, tone)
	})

const {
	onNodeSceneLayoutLightingPreviewUpdate,
	onNodeSceneLayoutLightingDebugUpdate,
	onNodeSceneLayoutLightingControlsUpdate,
	onNodeSceneLayoutPreviewModeUpdate,
	onNodeSceneLayoutSelectedItemUpdate,
	onNodeSceneLayoutHidePlaceholdersUpdate
} = useAIWorkflowSceneLayoutSettings({
	store
})

const {
	onNodeRunSceneLayout,
	onNodeSceneLayoutItemsUpdate,
	onNodeSceneLayoutSelectedPlaceholderOutput
} = useAIWorkflowSceneLayoutController({
	store,
	connectedTextInputValue,
	extractSceneLayoutSourceItems,
	parseSceneLayoutMetadataItems,
	mergeSceneLayoutItemsWithMetadata,
	runSceneLayout: ({ nodeId, inputJson }) =>
		sceneSkillService.runSceneLayout({ nodeId, inputJson }),
	syncConnectedModel3DTargets,
	pushToast: (message, tone) => pushToast(message, tone)
})

const { autoExpandSceneDecomposeOutputs } = useAIWorkflowSceneDecomposeAutoExpand({
	store,
	getIncomingEdges,
	connectedTextInputValue,
	hasExactEdge,
	onNodeRunSceneLayout,
	sceneLayoutModelInputAnchorId,
	connectedSceneDecomposeImageInputRefAt,
	onNodeUploadResource: (nodeId, file, kind, opts) =>
		onNodeUploadResource(nodeId, file, kind, opts),
	onAutoWireNodeCreated: (nodeId) => onAutoWireNodeCreated(nodeId)
})

const comfyAnchorAssignments = new Map<string, Map<string, string>>()
const comfyAnchorLocalizedOutputs = new Map<string, Map<string, ComfyLocalizedOutput>>()
const clearComfyRouteCache = (nodeId: string) => {
	comfyAnchorAssignments.delete(nodeId)
	comfyAnchorLocalizedOutputs.delete(nodeId)
}

const { routeComfyOutputsToConnectedNodes } = useAIWorkflowComfyOutputRouter({
	store,
	getOutgoingEdges,
	comfyAnchorAssignments,
	comfyAnchorLocalizedOutputs,
	blueprintProjectService,
	currentProjectId,
	isElectron: () => isElectron(),
	downloadUrlToProjectRoot: (projectId, url, desiredFilename) =>
		downloadUrlToProjectRoot(projectId, url, desiredFilename),
	resolveBackendUrl,
	bindMediaResourceToNode: (nodeId, kind, url, name, meta) =>
		bindMediaResourceToNode(nodeId, kind, url, name, meta),
	pushToast: (message, tone) => pushToast(message, tone)
})

const getIncomingTextValue = (toNodeId: string, toAnchorId: string) => {
	for (const e of edges.value) {
		if (e.toNodeId !== toNodeId) continue
		if (e.toAnchorId !== toAnchorId) continue
		return getTextOutputForNode(e.fromNodeId)
	}
	return ''
}

const {
	reuseRecordConfirm,
	formatReuseRecordTime,
	onCancelReuseRecord,
	onConfirmReuseRecord,
	onComfyUIRun,
	onComfyUICancel,
	recoverComfyUIRunStates,
	disposeComfyRuntime
} = useAIWorkflowComfyRuntime({
	store,
	comfyService,
	pushToast: (message, tone) => pushToastBridge(message, tone),
	routeComfyOutputsToConnectedNodes,
	clearComfyRouteCache,
	getIncomingTextValue
})

const onStoryPreviewSettingsUpdate = (
	nodeId: string,
	payload: { previewWidth?: number; previewHeight?: number }
) => {
	store.commit('setNodeStorySettings', { nodeId, storySettings: payload })
}

const NODE_WIDTH = 240
const ANCHOR_GAP = 24

// NOTE: anchors are rendered as DOM elements (absolute positioned + scaled with node).
// To avoid fragile "magic" offsets (like 25), we will resolve the exact anchor center
// from DOM (getBoundingClientRect) and convert it into BlueprintCanvas-local coords.
// The constants below are only used as a fallback when the DOM is not available.
const ANCHOR_SIDE_INSET_PX = 0
const ANCHOR_IN_SIZE = 0
const ANCHOR_OUT_SIZE = 0
const STORY_ANCHOR_IN_SIZE = 0
const STORY_ANCHOR_OUT_SIZE = 0

const ANCHOR_IN_X_OFFSET = -ANCHOR_SIDE_INSET_PX + ANCHOR_IN_SIZE / 2
const ANCHOR_OUT_X_OFFSET = ANCHOR_SIDE_INSET_PX + ANCHOR_OUT_SIZE / 2
const STORY_ANCHOR_IN_X_OFFSET = -ANCHOR_SIDE_INSET_PX + STORY_ANCHOR_IN_SIZE / 2
const STORY_ANCHOR_OUT_X_OFFSET = ANCHOR_SIDE_INSET_PX - STORY_ANCHOR_OUT_SIZE / 2

const getCanvasWrapRect = () => {
	const el = document.querySelector<HTMLElement>('.bp-wrap.aiwf-canvas')
	return el?.getBoundingClientRect() ?? null
}

const clientToCanvasPoint = (client: { x: number; y: number }) => {
	const r = getCanvasWrapRect()
	if (!r) return null
	return { x: client.x - r.left, y: client.y - r.top }
}

const escapeAttrValue = (raw: string) =>
	String(raw ?? '')
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')

const queryWorkflowAnchorElement = (nodeId: string, anchorId: string, dir: 'in' | 'out') => {
	const nid = String(nodeId ?? '').trim()
	const aid = String(anchorId ?? '').trim()
	if (!nid || !aid) return null
	const selector = `[data-wf-node-id="${escapeAttrValue(nid)}"][data-wf-anchor-id="${escapeAttrValue(aid)}"][data-wf-dir="${dir}"]`
	const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector))
	if (!candidates.length) return null
	for (const el of candidates) {
		const rect = el.getBoundingClientRect()
		if (rect.width > 0 && rect.height > 0) return el
	}
	return candidates[0] ?? null
}

const resolveAnchorCanvasPointByDom = (nodeId: string, anchorId: string, dir: 'in' | 'out') => {
	const anchorEl = queryWorkflowAnchorElement(nodeId, anchorId, dir)
	const wrapRect = getCanvasWrapRect()
	if (!anchorEl || !wrapRect) return null
	const rect = anchorEl.getBoundingClientRect()
	return {
		x: rect.left + rect.width / 2 - wrapRect.left,
		y: rect.top + rect.height / 2 - wrapRect.top
	}
}

const anchorWorld = (
	node: WorkflowNode,
	kind: 'in' | 'out',
	anchorIndex: number,
	anchorCount: number,
	anchor?: { offsetY?: number }
) => {
	const count = Math.max(1, anchorCount)
	const start = -((count - 1) * ANCHOR_GAP) / 2
	const offset =
		typeof anchor?.offsetY === 'number' ? anchor.offsetY : start + anchorIndex * ANCHOR_GAP
	const y = node.worldY + offset
	const width = Number.isFinite(node.width) ? node.width : NODE_WIDTH
	const xOffset =
		kind === 'in'
			? node.type === 'story'
				? STORY_ANCHOR_IN_X_OFFSET
				: ANCHOR_IN_X_OFFSET
			: node.type === 'story'
				? STORY_ANCHOR_OUT_X_OFFSET
				: ANCHOR_OUT_X_OFFSET
	const x = node.worldX + (kind === 'out' ? width / 2 : -width / 2) + xOffset
	return { x, y }
}

const buildPath = (start: { x: number; y: number }, end: { x: number; y: number }) => {
	const dx = Math.max(80, Math.abs(end.x - start.x) * 0.5)
	const c1 = { x: start.x + dx, y: start.y }
	const c2 = { x: end.x - dx, y: end.y }
	return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`
}

const EDGE_VIEWPORT_CULL_MARGIN_PX = 240

const shouldCullEdgeByViewport = (
	start: { x: number; y: number },
	end: { x: number; y: number },
	viewportWidth: number,
	viewportHeight: number,
	marginPx: number
) => {
	if (viewportWidth <= 0 || viewportHeight <= 0) return false
	const left = -marginPx
	const top = -marginPx
	const right = viewportWidth + marginPx
	const bottom = viewportHeight + marginPx
	const curveSlackX = Math.max(80, Math.abs(end.x - start.x) * 0.5)
	const minX = Math.min(start.x, end.x) - curveSlackX
	const maxX = Math.max(start.x, end.x) + curveSlackX
	const minY = Math.min(start.y, end.y)
	const maxY = Math.max(start.y, end.y)
	return maxX < left || minX > right || maxY < top || minY > bottom
}

const anchorIndexByNodeId = computed(() => {
	const next = new Map<string, { input: Map<string, number>; output: Map<string, number> }>()
	for (const node of renderNodes.value) {
		const input = new Map<string, number>()
		const output = new Map<string, number>()
		const ins = Array.isArray(node.inputs) ? node.inputs : []
		const outs = Array.isArray(node.outputs) ? node.outputs : []
		for (let i = 0; i < ins.length; i += 1) input.set(String(ins[i]?.id ?? ''), i)
		for (let i = 0; i < outs.length; i += 1) output.set(String(outs[i]?.id ?? ''), i)
		next.set(node.id, { input, output })
	}
	return next
})

const edgeRenders = (worldToScreen: (p: { x: number; y: number }) => { x: number; y: number }) => {
	const edges = renderEdges.value
	const result: Array<{
		id: string
		start: { x: number; y: number }
		end: { x: number; y: number }
		path: string
		stroke?: string
		strokeWidth?: number
	}> = []
	const viewportWidth = canvasViewportSize.value.width
	const viewportHeight = canvasViewportSize.value.height
	const keepEdgeId = String(store.state.selectedEdgeId ?? '').trim()

	for (let i = 0; i < edges.length; i++) {
		const e = edges[i]
		const edgeId = String(e.id ?? '')
		const fromNode = store.state.nodesById[e.fromNodeId]
		const toNode = store.state.nodesById[e.toNodeId]
		const fromAnchorIndex = anchorIndexByNodeId.value.get(String(e.fromNodeId ?? ''))
		const toAnchorIndex = anchorIndexByNodeId.value.get(String(e.toNodeId ?? ''))
		const fromIndex = fromAnchorIndex?.output.get(String(e.fromAnchorId ?? '')) ?? 0
		const toIndex = toAnchorIndex?.input.get(String(e.toAnchorId ?? '')) ?? 0
		const fromAnchor = fromNode?.outputs?.[Math.max(0, fromIndex)]
		const toAnchor = toNode?.inputs?.[Math.max(0, toIndex)]
		const start = fromNode
			? ((e.fromNodeId === NANO_ANCHOR_NODE_ID
					? resolveAnchorCanvasPointByDom(e.fromNodeId, String(e.fromAnchorId ?? ''), 'out')
					: null) ??
				worldToScreen(
					anchorWorld(fromNode, 'out', Math.max(0, fromIndex), fromNode.outputs.length, fromAnchor)
				))
			: { x: 0, y: 0 }
		const end = toNode
			? ((e.toNodeId === NANO_ANCHOR_NODE_ID
					? resolveAnchorCanvasPointByDom(e.toNodeId, String(e.toAnchorId ?? ''), 'in')
					: null) ??
				worldToScreen(
					anchorWorld(toNode, 'in', Math.max(0, toIndex), toNode.inputs.length, toAnchor)
				))
			: { x: 0, y: 0 }

		if (
			edgeId !== keepEdgeId &&
			shouldCullEdgeByViewport(
				start,
				end,
				viewportWidth,
				viewportHeight,
				EDGE_VIEWPORT_CULL_MARGIN_PX
			)
		) {
			continue
		}

		const isStory = fromNode?.type === 'story'
		result.push({
			id: e.id,
			start,
			end,
			path: buildPath(start, end),
			stroke: isStory ? '#f29d38' : undefined,
			strokeWidth: isStory ? 3.5 : undefined
		})
	}
	return result
}

const buildEdgeWorkerInput = () => {
	const nodeIds = new Set<string>()
	for (const edge of renderEdges.value) {
		const fromNodeId = String(edge.fromNodeId ?? '').trim()
		const toNodeId = String(edge.toNodeId ?? '').trim()
		if (fromNodeId) nodeIds.add(fromNodeId)
		if (toNodeId) nodeIds.add(toNodeId)
	}

	const nodes = Array.from(nodeIds)
		.map((id) => store.state.nodesById[id])
		.filter(Boolean)
		.map((node) => ({
			id: String(node.id ?? ''),
			type: String(node.type ?? ''),
			worldX: Number(node.worldX) || 0,
			worldY: Number(node.worldY) || 0,
			width: Number(node.width) || NODE_WIDTH,
			inputs: (Array.isArray(node.inputs) ? node.inputs : []).map((anchor) => ({
				id: String(anchor?.id ?? ''),
				offsetY: typeof anchor?.offsetY === 'number' ? Number(anchor.offsetY) : undefined
			})),
			outputs: (Array.isArray(node.outputs) ? node.outputs : []).map((anchor) => ({
				id: String(anchor?.id ?? ''),
				offsetY: typeof anchor?.offsetY === 'number' ? Number(anchor.offsetY) : undefined
			}))
		}))

	const edges = renderEdges.value.map((edge) => ({
		id: String(edge.id ?? ''),
		fromNodeId: String(edge.fromNodeId ?? ''),
		fromAnchorId: String(edge.fromAnchorId ?? ''),
		toNodeId: String(edge.toNodeId ?? ''),
		toAnchorId: String(edge.toAnchorId ?? '')
	}))

	return { nodes, edges }
}

const { toasts, pushToast, removeToast, setToastHovering } = useAIWorkflowToastState({
	durationMs: 2600
})
pushToastBridge = pushToast

// ===== 404 兜底恢复系统 =====
const missingAssetDialogOpen = ref(false)
const missingAssetDialogPending = ref<PendingMissingAsset | null>(null)
const lastRemovedUndoAvailable = ref(false)

const {
	pendingMissingAssets,
	installGlobalErrorHandlers,
	confirmRemoveMissingAsset,
	undoLastRemove,
	cancelMissingAsset
} = useAIWorkflow404Fallback({
	getCurrentProjectId: () => currentProjectId.value,
	getCurrentProjectRootPath: () => currentProjectRootPath.value || null,
	getStore: () => store,
	pushToast,
	batchWindowMs: 600,
	onRecovered: ({ url, newUrl, assetName, newAsset }) => {
		// 资源已自动恢复：更新资源缓存中的 URL，触发资源引用节点重渲染
		try {
			const resourcesById = store.state.resourcesById
			const patches: Record<string, Partial<WorkflowResource>> = {}
			for (const [rid, res] of Object.entries(resourcesById)) {
				if (!res) continue
				const patch: Partial<WorkflowResource> = {}
				let touched = false
				if (res.url === url) {
					patch.url = newUrl
					touched = true
				}
				if (res.previewUrl === url) {
					patch.previewUrl = newUrl
					touched = true
				}
				if (res.posterUrl === url) {
					patch.posterUrl = newUrl
					touched = true
				}
				if (touched) {
					// 如果诊断结果提供了新的资源路径信息，同步更新
					if (newAsset && isRecord(newAsset)) {
						const projRelPath =
							safeGetString(newAsset, 'projectRelativePath') ??
							safeGetString(newAsset, 'relativePath')
						if (projRelPath) patch.projectRelativePath = projRelPath
						const absPath = safeGetString(newAsset, 'absolutePath')
						const sourcePathFromAsset = safeGetString(newAsset, 'sourcePath')
						const finalSourcePath = sourcePathFromAsset || absPath
						if (finalSourcePath) patch.sourcePath = finalSourcePath
						if (!patch.url) patch.url = newUrl
					}
					patches[rid] = patch
				}
			}
			if (Object.keys(patches).length > 0) {
				store.commit('patchResourcesBatch', { patches })
			}
			// 通知节点刷新（触发重新渲染）
			void nextTick(() => {
				blueprintLog.append(`资源自动恢复成功：${assetName}`, {
					category: 'system',
					level: 'INFO',
					tag: 'asset-recovery'
				})
			})
		} catch (err) {
			console.warn('[AIWorkflowPage] onRecovered hook error:', err)
		}
	},
	onMissingAsset: (pending) => {
		// 已有对话框打开时，先入队；否则直接打开对话框
		if (!missingAssetDialogOpen.value) {
			missingAssetDialogPending.value = pending
			missingAssetDialogOpen.value = true
		}
	}
})

// 缺失资产确认对话框操作
const onConfirmRemoveMissingAsset = () => {
	const p = missingAssetDialogPending.value
	if (!p) {
		missingAssetDialogOpen.value = false
		return
	}
	const result = confirmRemoveMissingAsset(p.id)
	lastRemovedUndoAvailable.value = !!result.undoAvailable
	missingAssetDialogOpen.value = false
	missingAssetDialogPending.value = null
	// 若还有其他待处理的缺失资产，打开下一个
	const next = pendingMissingAssets.value[0]
	if (next) {
		setTimeout(() => {
			missingAssetDialogPending.value = next
			missingAssetDialogOpen.value = true
		}, 300)
	}
}
const onCancelMissingAssetDialog = () => {
	const p = missingAssetDialogPending.value
	if (p) cancelMissingAsset(p.id)
	missingAssetDialogOpen.value = false
	missingAssetDialogPending.value = null
	// 继续处理队列中下一个
	const next = pendingMissingAssets.value[0]
	if (next) {
		setTimeout(() => {
			missingAssetDialogPending.value = next
			missingAssetDialogOpen.value = true
		}, 300)
	}
}
const onUndoLastRemove = () => {
	if (undoLastRemove()) {
		lastRemovedUndoAvailable.value = false
	}
}

function sourceTypeLabel(type: string): string {
	switch (type) {
		case 'resource':
			return '[资源记录]'
		case 'node_input':
			return '[节点输入]'
		case 'node_output':
			return '[节点输出]'
		case 'node_param':
			return '[节点参数]'
		case 'preview':
			return '[预览图]'
		case 'poster':
			return '[封面图]'
		case 'unknown':
			return '[未知位置]'
		default:
			return `[${type}]`
	}
}

const { buildUnrealExportPayload, onNodeExportUnrealScene, onNodeExportUnrealLighting } =
	useAIWorkflowUnrealExportActions({
		store,
		unrealExportService,
		connectedTextInputValue,
		getUnrealExportSourceSceneLayoutNode,
		getResolvedLayoutForUnreal,
		connectedSceneLayoutModelBindings,
		pushToast
	})

const {
	resetSceneUnderstandingNodeState,
	onNodeCancelSceneUnderstanding,
	onNodeSceneUnderstandingSettingsUpdate,
	onNodeRequestSceneModels,
	onNodeRunSceneUnderstanding,
	cleanupSceneUnderstandingRuntime
} = useAIWorkflowSceneUnderstandingController({
	store,
	sceneSkillService,
	connectedSceneUnderstandImageInputs,
	connectedImageInputUrl,
	connectedTextInputValue,
	normalizeMeshyImageInputValue,
	pushToast
})

const { onNodeRunSceneDecompose } = useAIWorkflowSceneDecomposeController({
	store,
	connectedTextInputValue,
	connectedSceneDecomposeImageInputs,
	connectedSceneDecomposeImageInputAt,
	buildImageTransferFileFromCrop,
	addGeneratedImageResource,
	autoExpandSceneDecomposeOutputs,
	pushToast,
	onAutoWireStart: (sourceNodeId) => onAutoWireStart(sourceNodeId),
	onAutoWireEnd: () => onAutoWireEnd()
})

const {
	importOverlayOpen,
	importOverlayTitle,
	importOverlayDetail,
	importOverlayProgress,
	activeImportSession,
	recoveryOverlayOpen,
	recoveryOverlayTitle,
	recoveryOverlayDetail,
	recoveryOverlayProgress,
	activeRecoverySession,
	startImportSession,
	updateImportProgressIfNeeded,
	cancelActiveImportSession: clearActiveImportSession,
	cancelActiveRecoverySession,
	refreshRecoveryUrlReady,
	finalizeRecoverySessionAfterUrlRecoveryAttempt,
	startRecoverySessionFromCurrentState,
	markNodeMediaReady
} = useAIWorkflowImportRecoveryState({
	pushToast: (message, tone) => pushToast(message, tone)
})

const { uploadNodeResource, bindMediaResourceToNode, uploadNodeModel3DFile } =
	useAIWorkflowNodeAssetBinding({
		store,
		makeResourceId,
		setObjectUrl,
		revokeTrackedObjectUrlsForResource,
		resolveBackendUrl,
		blueprintProjectService,
		getCurrentProjectId: () => currentProjectId.value,
		setNodeResourceWithCleanup,
		autoSizeMediaNode,
		autoSizeImageNodeFromDims,
		scheduleVideoMetadataRead,
		ensureVideoResourcePoster,
		revokeNodeModel3DObjectUrl,
		isDjangoManagedResource
	})

const { onNodeUploadSceneLayoutModelFile, onNodeClearSceneLayoutModelBinding } =
	useAIWorkflowSceneLayoutModelBinding({
		store,
		pushToast,
		revokeSceneLayoutManualModelObjectUrl,
		sceneLayoutManualModelObjectKey,
		setObjectUrl,
		currentProjectId,
		blueprintProjectService,
		resolveBackendUrl
	})

const {
	createNodeFromDraggedResource,
	createNodeFromNanoPreview,
	inferMediaKindFromFile,
	collectDroppedFilesFromHandle,
	onCanvasDragOver,
	onCanvasDrop
} = useAIWorkflowDropAssets({
	store,
	makeResourceId,
	setObjectUrl,
	resolveBackendUrl,
	autoSizeMediaNode,
	bindMediaResourceToNode,
	resolveDropWorldFromEvent: (e) => {
		const wrap = e.currentTarget as HTMLElement | null
		const rect = wrap?.getBoundingClientRect() ?? null
		if (!rect) return null

		const z = Number(viewport.value.zoom) || 1
		const panX = Number(viewport.value.panX) || 0
		const panY = Number(viewport.value.panY) || 0
		const sx = e.clientX - rect.left
		const sy = e.clientY - rect.top
		const cx = rect.width / 2
		const cy = rect.height / 2
		return {
			worldX: (sx - cx - panX) / z,
			worldY: (sy - cy - panY) / z
		}
	},
	createBatchMediaNodesFromFiles: (payload) => createBatchMediaNodesFromFiles(payload),
	createNodeFromDraggedMeshyTask: (payload) => createNodeFromDraggedMeshyTask(payload),
	pushToast: (message, tone) => pushToast(message, tone)
})

const { recoverLocalResourcesFromHandles } = useAIWorkflowLocalResourceRecovery({
	store,
	pushToast,
	setObjectUrl,
	autoSizeMediaNode,
	getLocalFileHandle,
	ensureReadPermission,
	canUseFileSystemHandles,
	collectDroppedFilesFromHandle,
	putLocalFileHandle
})

const { createNodeFromDraggedMeshyTask } = useAIWorkflowMeshyDrop({
	store,
	pushToast: (message, tone) => pushToast(message, tone)
})

const { stopMeshyPoll, applyMeshyTaskResult, startMeshyPoll, clearMeshyRuntime } =
	useAIWorkflowMeshyRuntime({
		store,
		getComfyService: () => comfyService,
		pushToast: (message, tone) => pushToast(message, tone),
		normalizeMeshyTaskStatus,
		pickMeshyPreferredModelUrl,
		pickMeshyPreferredFormat,
		fileExtensionFromUrl,
		persistExternalAssetToProject: (payload) => persistExternalAssetToProject(payload),
		syncConnectedImageTargetsFromMeshy: (nodeId) => syncConnectedImageTargetsFromMeshy(nodeId),
		syncConnectedModel3DTargets: (nodeId) => syncConnectedModel3DTargets(nodeId),
		refreshMeshyTaskItems: (opts) => refreshMeshyTaskItems(opts),
		shouldRefreshMeshyTaskItems: () => meshyTaskDialogOpen.value || meshyTaskRemoteLoaded.value
	})

const {
	meshyTextureConfirm,
	cancelMeshyTextureConfirm,
	confirmMeshyTextureFollowup,
	onNodeGenerateMeshy,
	onNodeRunMeshyFollowup,
	onNodeRestartMeshyTask
} = useAIWorkflowMeshyCommands({
	store,
	getComfyService: () => comfyService,
	pushToast: (message, tone) => pushToast(message, tone),
	stopMeshyPoll,
	startMeshyPoll,
	buildMeshyRequestPayload,
	hasIncomingEdge,
	connectedMeshyImageUrls,
	normalizeMeshyTaskStatus,
	refreshMeshyTaskItems: (opts) => refreshMeshyTaskItems(opts),
	shouldRefreshMeshyTaskItems: () => meshyTaskDialogOpen.value || meshyTaskRemoteLoaded.value
})

const importLimitAlertMessage = ref('')
const MAX_BATCH_IMPORT_MEDIA_COUNT = 100

const onNodeUploadResource = async (
	nodeId: string,
	file: File,
	kind: 'image' | 'video',
	opts?: { autoDistribute?: boolean }
) => {
	await uploadNodeResource(nodeId, file, kind, {
		autoDistribute: opts?.autoDistribute,
		onAfterBind: () => {
			if (kind === 'image' && opts?.autoDistribute === true) {
				void autoDistributeImageOutputToConnectedNodes(nodeId)
			}
		}
	})
}

const onNodeUploadModel3DFile = async (nodeId: string, file: File) => {
	await uploadNodeModel3DFile(nodeId, file)
}

const onConfirmImportLimitAlert = () => {
	importLimitAlertMessage.value = ''
}

const { createMediaNodesFromFiles: createBatchMediaNodesFromFiles } = useAIWorkflowBatchMediaImport(
	{
		store,
		makeResourceId,
		maxBatchImportMediaCount: MAX_BATCH_IMPORT_MEDIA_COUNT,
		inferMediaKindFromFile,
		normalizeFileSignatureKey,
		putLocalFileHandle,
		cancelActiveImportSession,
		startImportSession,
		getActiveImportSession: () => activeImportSession.value,
		updateImportProgressIfNeeded,
		mediaImportManager,
		setObjectUrl,
		scheduleVideoMetadataRead,
		autoSizeImageNodeFromDims,
		onLimitExceeded: (count, limit) => {
			importLimitAlertMessage.value = `本次检测到 ${count} 个媒体文件，超过批量导入上限 ${limit} 个。请减少后再导入。`
		},
		getProjectId: () => Number(currentProjectId.value ?? 0) || null,
		copyFileToProjectRoot: (projectId, sourcePath, desiredFilename) =>
			copyFileToProjectRoot(projectId, sourcePath, desiredFilename),
		uploadProjectAsset,
		resolveBackendUrl
	}
)

const extFromMime = (mime: string): string => {
	const m = String(mime || '').toLowerCase()
	if (m.includes('gltf-binary')) return '.glb'
	if (m.includes('gltf+json')) return '.gltf'
	if (m.includes('model/gltf')) return '.gltf'
	if (m.includes('png')) return '.png'
	if (m.includes('jpeg') || m.includes('jpg')) return '.jpg'
	if (m.includes('webp')) return '.webp'
	if (m.includes('gif')) return '.gif'
	if (m.includes('bmp')) return '.bmp'
	if (m.includes('svg')) return '.svg'
	if (m.includes('mp4')) return '.mp4'
	if (m.includes('webm')) return '.webm'
	if (m.includes('quicktime')) return '.mov'
	if (m.includes('ogg')) return '.ogg'
	return ''
}

const fileFromUrl = async (url: string, fileNameBase: string): Promise<File> => {
	const resp = await fetch(url)
	if (!resp.ok) throw new Error(`fetch local url failed: ${resp.status}`)
	const blob = await resp.blob()
	const ext = extFromMime(blob.type)
	const fileName = `${fileNameBase || 'resource'}${ext}`
	return new File([blob], fileName, { type: blob.type || 'application/octet-stream' })
}

const dataUrlToBlob = (dataUrl: string): Blob => {
	const raw = String(dataUrl || '').trim()
	const m = raw.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/i)
	if (!m) return new Blob([], { type: 'application/octet-stream' })
	const mime = String(m[1] || 'application/octet-stream').trim() || 'application/octet-stream'
	const body = String(m[2] || '')
	try {
		const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
		return new Blob([bytes], { type: mime })
	} catch {
		return new Blob([], { type: mime })
	}
}

const { onRotateImageOutput } = useAIWorkflowRotateImageOutput({
	getNode: (nodeId) => store.state.nodesById[nodeId],
	getResource: (resourceId) => store.state.resourcesById[resourceId],
	getEdges: () => edges.value,
	commitSetRotatePromptText: ({ nodeId, text }) => {
		store.commit('setNodeRotatePromptText', { nodeId, text })
	},
	makeResourceId,
	setNodeResourceWithCleanup,
	onNodeUploadResource,
	autoSizeMediaNode,
	dataUrlToBlob,
	commitPatchResource: ({ resourceId, patch }) => {
		store.commit('patchResource', { resourceId, patch })
	},
	commitAddResource: (resource) => {
		store.commit('addResource', resource)
	}
})

const { connectedImageTargetsFromVideo, onVideoScreenshot } = useAIWorkflowVideoScreenshot({
	getNode: (nodeId) => store.state.nodesById[nodeId],
	getEdges: () => edges.value,
	dataUrlToBlob,
	onNodeUploadResource,
	autoSizeMediaNode,
	commitSetNodeImageSettings: ({ nodeId, imageSettings }) => {
		store.commit('setNodeImageSettings', { nodeId, imageSettings })
	}
})

const { uploadLocalResourceAndGetUrl, persistExternalAssetToProject } =
	useAIWorkflowAssetPersistence({
		blueprintProjectService,
		getCurrentProjectId: () => currentProjectId.value,
		resolveBackendUrl,
		fileFromUrl,
		importAssetIntoProjectScope: (payload) => importAssetIntoProjectScope(payload)
	})

const { onSend, onStop, onNanoBananaGenerate, onSeedanceGenerate } = useAIWorkflowChatGeneration({
	store,
	chatModelKey,
	chatDraft,
	chatModelId,
	chatMessages,
	chatSending,
	chatRunState,
	chatTaskStatusText,
	localExecStreamMode,
	agentConversationMode,
	codexSessions,
	codexActiveSessionId,
	codexFlowEvents,
	nanoPreviewUrl,
	nanoPreviewUrls,
	nanoPreviewFallbackUrls,
	nanoPreviewSourcePaths,
	nanoPreviewLoadingStates,
	nanoPreviewDownloadStatuses,
	nanoPreviewDownloadProgresses,
	nanoPreviewLocalReadyStates,
	nanoStatus,
	nanoBilling,
	nanoModelUsed,
	nanoDetail,
	currentProjectId,
	ensureProjectId: ensureProjectForLocalExec,
	NANO_ANCHOR_NODE_ID,
	NANO_REF_IMAGE_MAX,
	pushToast,
	getFirstIncomingEdge,
	nodeResourceUrl,
	nodeResourceName,
	buildCroppedImageTransferFile,
	fileFromUrl,
	uploadLocalResourceAndGetUrl,
	resolveBackendUrl,
	getChatService: () => localExecChatService as any,
	onSeedanceTaskObserved
})

const { buildPersistableSnapshotWithOptions } = useAIWorkflowProjectSnapshotBuilder({
	store,
	currentProjectId,
	resolveBackendUrl,
	uploadLocalResourceAndGetUrl,
	toProjectAssetRuntimeUrl: buildProjectAssetRuntimeUrl,
	persistExternalAssetToProject,
	pushToast,
	stripUnrealExportRuntimeFromNodes
} as any)

const { sanitizeBlueprintSnapshotForRuntime, hydrateBlueprintSnapshotSafely } =
	useAIWorkflowProjectSnapshotRuntime({
		store,
		currentProjectId,
		isElectronRuntime,
		pushToast
	})

const { refreshProjectList, onRequestImportLocalProject } = useAIWorkflowProjectCatalogImport({
	blueprintProjectService,
	pushToast,
	projectList,
	isValidBlueprintSnapshot,
	stripUnrealExportRuntimeFromSnapshot,
	sanitizeBlueprintSnapshotForRuntime,
	hydrateBlueprintSnapshotSafely,
	resetCurrentUnrealExportNodeRuntimeState,
	setUnsavedProject,
	recoverComfyUIRunStates
})

const repairProjectAssetsBeforeHydrate = async (
	projectId: number,
	snapshot: AIWorkflowDraftSnapshot
): Promise<AIWorkflowDraftSnapshot> => {
	if (!isElectron()) return snapshot
	const pid = Number(projectId)
	if (!Number.isFinite(pid) || pid <= 0) return snapshot
	const snapshotRec = isRecord(snapshot) ? snapshot : {}
	const resourcesById = safeGetRecord(snapshotRec, 'resourcesById') ?? {}
	try {
		const repaired = await repairAllProjectAssets({ projectId: pid, resourcesById })
		if (!repaired?.ok || !repaired.patches || Object.keys(repaired.patches).length === 0)
			return snapshot
		return {
			...snapshot,
			resourcesById: {
				...(snapshot.resourcesById || {}),
				...repaired.patches
			}
		} as AIWorkflowDraftSnapshot
	} catch {
		return snapshot
	}
}

const {
	loadProjectById,
	saveProjectToBackend: _saveProjectToBackendFn,
	tryAutoLoadLastProject,
	repairProjectAssetsNow
} = useAIWorkflowProjectPersistence({
	blueprintProjectService,
	currentProjectId,
	currentProjectName,
	setSavedProject,
	readLastProjectId,
	forgetLastProjectId,
	refreshProjectList,
	pushToast,
	isValidBlueprintSnapshot,
	stripUnrealExportRuntimeFromSnapshot,
	normalizeSnapshotResourceUrls,
	sanitizeBlueprintSnapshotForRuntime,
	hydrateBlueprintSnapshotSafely,
	resetCurrentUnrealExportNodeRuntimeState,
	resolveBackendUrl,
	toProjectAssetRuntimeUrl: buildProjectAssetRuntimeUrl,
	cancelActiveRecoverySession,
	startRecoverySessionFromCurrentState,
	refreshRecoveryUrlReady,
	finalizeRecoverySessionAfterUrlRecoveryAttempt,
	recoverLocalResourcesFromHandles,
	migrateCurrentResourcesToProjectScope: (...args) =>
		migrateCurrentResourcesToProjectScope(...args),
	repairAllProjectAssetsBeforeHydrate: repairProjectAssetsBeforeHydrate,
	buildPersistableSnapshotWithOptions,
	isElectron,
	activeRecoverySession,
	store,
	uploadLocalResourceAndGetUrl,
	getCurrentProjectRootPath: () => String(currentProjectRootPath.value || '').trim()
})

const saveProjectToBackend = _saveProjectToBackendFn
_saveProjectToBackend = _saveProjectToBackendFn

const {
	onRequestSaveProject,
	onRequestNewProject,
	onRequestNewProjectFromPath,
	onRequestLoadProject,
	onRequestDeleteProject,
	onRequestRepairProjectAssets
} = useAIWorkflowProjectRequests({
	activeRecoverySession,
	pushToast,
	cancelActiveRecoverySession,
	createEmptyDraftSnapshot: () => buildSnapshotFromState(createDefaultAIWorkflowState()),
	store,
	setUnsavedProject,
	reuseRecordConfirm,
	resetComfyRuntime: disposeComfyRuntime,
	comfyAnchorAssignments,
	comfyAnchorLocalizedOutputs,
	loadProjectById,
	recoverComfyUIRunStates,
	blueprintProjectService,
	currentProjectId,
	refreshProjectList,
	saveProjectToBackend,
	currentProjectName,
	repairProjectAssetsNow
})

const onPreviewResource = async (resourceId: string) => {
	const r = store.state.resourcesById?.[String(resourceId)]
	if (!r) return

	// Prefer opening the project folder if the asset is stored locally
	const sourcePath = String(r.sourcePath || '').trim()
	const projectRelativePath = String(r.projectRelativePath || '').trim()
	if (isElectron()) {
		if (sourcePath) {
			try {
				await openFolderForPath(sourcePath)
				return
			} catch {
				// ignore
			}
		}
		if (projectRelativePath) {
			const root = String(currentProjectRootPath.value || '').trim()
			if (root) {
				try {
					const fullPath = `${root}/${projectRelativePath}`.replace(/\\/g, '/')
					await openFolderForPath(fullPath)
					return
				} catch {
					// ignore
				}
			}
		}
	}

	// Fallback: open the URL in a new window/tab
	const kind = String(r.kind || '').toLowerCase()
	const url =
		kind === 'video'
			? String(r.url || '').trim() || String(r.posterUrl || '').trim()
			: String(r.url || '').trim()
	if (!url) {
		pushToast('资源预览失败：URL 为空。', 'warn')
		return
	}
	try {
		window.open(url, '_blank')
	} catch {
		// ignore
	}
}

const { onRequestExportProjectPackage } = useAIWorkflowProjectPackageExport({
	pushToast,
	buildPersistableSnapshotWithOptions,
	stripUnrealExportRuntimeFromSnapshot,
	currentProjectName
})

const { onRequestImportProjectPackage, onRequestExportProject } = useAIWorkflowProjectTransfer({
	pushToast,
	buildPersistableSnapshotWithOptions,
	currentProjectName,
	currentProjectId,
	AIWF_PROJECT_PACKAGE_ENTRY,
	isValidBlueprintSnapshot,
	store,
	revokeTrackedObjectUrlsForResource,
	getTrackedObjectUrlEntries,
	revokeObjectUrl,
	stripUnrealExportRuntimeFromSnapshot,
	getObjectUrl,
	setObjectUrl,
	setValueByJsonPointer,
	sanitizeBlueprintSnapshotForRuntime,
	hydrateBlueprintSnapshotSafely,
	resetCurrentUnrealExportNodeRuntimeState,
	setUnsavedProject,
	setSavedProject,
	sanitizeFileNamePart,
	recoverComfyUIRunStates,
	createProjectForImport: async (name: string) => {
		try {
			const snapshot = await buildPersistableSnapshotWithOptions({ uploadLocalResources: false })
			const result = await blueprintProjectService.saveProject({ name, snapshot })
			if (result?.ok && result?.project?.id > 0) {
				return {
					id: Number(result.project.id),
					rootPath: String(result.project.rootPath || '')
				}
			}
			return null
		} catch (err) {
			console.error('[AIWF] createProjectForImport failed:', err)
			return null
		}
	},
	importAssetFromBuffer: async (projectId, buffer, fileName, mimeType) => {
		if (!isElectron()) return null
		try {
			const result = await uploadProjectAsset({
				projectId,
				kind: mimeType?.startsWith('image')
					? 'image'
					: mimeType?.startsWith('video')
						? 'video'
						: 'file',
				name: fileName,
				arrayBuffer: buffer,
				contentType: mimeType
			})
			return result?.ok && result?.asset
				? { url: result.asset.url, relativePath: result.asset.relativePath }
				: null
		} catch (err) {
			console.error('[AIWF] importAssetFromBuffer failed:', err)
			return null
		}
	},
	saveImportedSnapshot: async () => {
		await saveProjectToBackend()
	}
})

const onGlobalShortcutSave = async (ev: Event) => {
	// Only take over save behavior on AIWorkflow route.
	if (route.name !== 'AIWorkflow') return
	ev.preventDefault?.()
	const evRec = ev as unknown as Record<string, unknown>
	const stopProp = evRec.stopImmediatePropagation
	if (typeof stopProp === 'function') {
		stopProp.call(ev)
	}

	// Ctrl/Cmd+S: persist blueprint project to backend (DB + JSON file).
	await onRequestSaveProject()
}

const getCanvasCenterWorld = () => {
	const r = getCanvasWrapRect()
	if (!r) return { worldX: 0, worldY: 0 }
	const z = Number(viewport.value.zoom) || 1
	const panX = Number(viewport.value.panX) || 0
	const panY = Number(viewport.value.panY) || 0
	const sx = r.width / 2
	const sy = r.height / 2
	const cx = r.width / 2
	const cy = r.height / 2
	const worldX = (sx - cx - panX) / z
	const worldY = (sy - cy - panY) / z
	return { worldX, worldY }
}

const noopWorkflowWorldToCanvas = (point: { x: number; y: number }) => point
let getLinkWorkflowWorldToCanvas = () => noopWorkflowWorldToCanvas
let scheduleLinkEdgeRender = () => {}

const { mountWindowEvents, unmountWindowEvents } = useAIWorkflowKeyboardAndResize({
	isRouteActive: () => route.name === 'AIWorkflow',
	getSelectedNodeIds: () => selectedNodeIds.value,
	getSelectedEdgeId: () => selectedEdgeId.value,
	selectAllNodes: () => {
		const ids = store.state.nodeOrder.slice()
		store.commit('setSelectedNodes', { nodeIds: ids, primaryNodeId: ids[0] ?? null })
	},
	pasteNodesAtCanvasCenter: () => {
		const { worldX, worldY } = getCanvasCenterWorld()
		pasteNodesWithResourceDedupe({ worldX, worldY })
	},
	pasteMediaData: (clipboardData) => pasteMediaData(clipboardData),
	copySelectedNodes: (primaryNodeId) => {
		store.commit('copyNode', { nodeId: primaryNodeId })
	},
	undo: () => {
		aiWorkflowHistory.undo()
	},
	redo: () => {
		aiWorkflowHistory.redo()
	},
	removeSelectedNodes: (nodeIds) => {
		void removeSelectedNodesWithResourceCleanup(nodeIds)
	},
	removeSelectedEdge: (edgeId) => {
		store.commit('removeEdge', { edgeId })
	},
	scheduleAsyncEdgeRender: () => scheduleLinkEdgeRender()
})

const applyAction = (action: WorkflowAction) => {
	if (action.id === 'delete') {
		if (selectedNodeIds.value.length) {
			void removeSelectedNodesWithResourceCleanup(selectedNodeIds.value)
			return
		}
		if (selectedEdgeId.value) store.commit('removeEdge', { edgeId: selectedEdgeId.value })
	}
}

const selectionActions = computed<WorkflowAction[]>(() => {
	if (selectedNodeIds.value.length) {
		return [
			{
				id: 'delete',
				label:
					selectedNodeIds.value.length > 1
						? `删除所选节点（${selectedNodeIds.value.length}）`
						: '删除',
				target: { kind: 'none' }
			}
		]
	}
	const target: WorkflowSelectionTarget = selectedEdgeId.value
		? { kind: 'edge', id: selectedEdgeId.value }
		: { kind: 'none' }
	const del = buildDeleteAction(target)
	return del ? [del] : []
})

const {
	contextMenu,
	inspectorOpen,
	toggleInspector,
	onCanvasContextMenu,
	onContextMenuSelect,
	contextMenuSections,
	nodeSearchMenuVisible,
	nodeSearchMenuPosition,
	closeNodeSearchMenu,
	onNodeSearchMenuSelect,
	onNodeSearchMenuUploadFile,
	onLinkDropOnCanvas,
	openNodeSearchMenu,
	NEWUI2_NODE_CATALOG,
	NEWUI2_NODE_CATALOG_CATEGORIES,
	NEWUI2_NODE_TOP_CATEGORIES,
	NEWUI2_NODE_SPECIAL_GROUPS
} = useAIWorkflowContextMenu({
	store,
	selectedNodeId,
	selectedNodeIds,
	selectedEdgeId,
	canOpenSelectedNodeFolder,
	selectedNodeLocalResourcePath,
	selectionActions,
	nodeResourceUrl,
	inferSelectedResourceFilename,
	downloadUrlAsBlob,
	pasteNodesWithResourceDedupe,
	applyAction,
	pushToast,
	openFolderForPath
})

const linkInteraction = useAIWorkflowLinking({
	store,
	nodes,
	chatModelKey,
	nanoAnchorNodeId: NANO_ANCHOR_NODE_ID,
	scheduleAsyncEdgeRender: () => scheduleLinkEdgeRender(),
	clientToCanvasPoint,
	getWorkflowWorldToCanvas: () => getLinkWorkflowWorldToCanvas(),
	resolveInputAnchorCanvasPoint: ({ nodeId, anchorId }) => {
		if (nodeId !== NANO_ANCHOR_NODE_ID) return null
		return resolveAnchorCanvasPointByDom(nodeId, anchorId, 'in')
	},
	anchorWorld,
	buildPath,
	pushToast,
	onLinkConnected: ({ fromNodeId, fromAnchorId, toNodeId, toAnchorId }) => {
		const fromNode = store.state.nodesById[fromNodeId]
		const toNode = store.state.nodesById[toNodeId]
		if (
			fromNode &&
			toNode &&
			fromNode.type === 'rotate-image' &&
			fromAnchorId === 'out-image' &&
			toNode.type === 'image'
		) {
			const rid = String(fromNode.resourceId ?? '').trim()
			if (rid) {
				const resource = store.state.resourcesById[rid]
				const url = String(resource?.url ?? '').trim()
				if (url) {
					void (async () => {
						const fallbackName =
							String(resource?.name || `rotate_${fromNodeId}_${toNodeId}.png`).trim() ||
							`rotate_${fromNodeId}_${toNodeId}.png`
						try {
							const cloned = await fileFromUrl(
								url,
								fallbackName.replace(/\.[^.]+$/, '') || `rotate_${fromNodeId}_${toNodeId}`
							)
							onNodeUploadResource(toNodeId, cloned, 'image', { autoDistribute: false })
							return
						} catch {
							// fallback below
						}
						const sourcePath = String(resource?.sourcePath ?? '').trim()
						bindMediaResourceToNode(toNodeId, 'image', url, fallbackName, {
							sourcePath: sourcePath || undefined,
							projectRelativePath: String(resource?.projectRelativePath || '').trim() || undefined
						})
						autoSizeMediaNode(toNodeId, url, 'image')
					})()
				}
			}
		}

		if (toNode && toNode.type === 'model3d' && toAnchorId === 'in-resource') {
			void syncModel3DInputFromUpstream(toNodeId)
		}
		if (
			fromNode &&
			fromNode.type === 'meshy' &&
			/^out-image(?:-\d+)?$/.test(String(fromAnchorId ?? '')) &&
			toNode &&
			toNode.type === 'image' &&
			(toAnchorId === 'in-image' || toAnchorId === 'in-resource')
		) {
			void syncConnectedImageTargetsFromMeshy(fromNodeId)
		}
	},
	onLinkDropOnCanvas
})

const {
	asyncEdgeRenders,
	asyncDraftRender,
	perfEdgeComputeMs,
	perfEdgeCulledCount,
	perfEdgeRenderedCount,
	perfEdgeInputCount,
	workflowWorldToCanvas,
	scheduleAsyncEdgeRender
} = useAIWorkflowEdgeRenderer({
	viewport,
	canvasViewportSize,
	viewportMotionActive,
	renderEdges,
	edgeRenders,
	draftRender: linkInteraction.draftRender,
	keepEdgeIds: computed(() => {
		const ids: string[] = []
		const selectedEdgeId = String(store.state.selectedEdgeId ?? '').trim()
		if (selectedEdgeId) ids.push(selectedEdgeId)
		const selectedNodeSet = new Set(
			selectedNodeIds.value.map((id) => String(id ?? '').trim()).filter(Boolean)
		)
		if (!selectedNodeSet.size) return ids
		for (const edge of edges.value) {
			const fromId = String(edge.fromNodeId ?? '').trim()
			const toId = String(edge.toNodeId ?? '').trim()
			if (!fromId || !toId) continue
			if (!selectedNodeSet.has(fromId) && !selectedNodeSet.has(toId)) continue
			const edgeId = String(edge.id ?? '').trim()
			if (!edgeId) continue
			ids.push(edgeId)
		}
		return Array.from(new Set(ids))
	}),
	preferWorker: edgeWorkerEnabled,
	workerMutationEpoch: edgeWorkerMutationEpoch,
	buildEdgeWorkerInput
})
getLinkWorkflowWorldToCanvas = () => workflowWorldToCanvas
scheduleLinkEdgeRender = scheduleAsyncEdgeRender

let nearDragRafId: number | null = null
let nearDragLastPointer: { x: number; y: number } | null = null

const computeNearDragNodes = () => {
	nearDragRafId = null
	if (!nearDragLastPointer) return
	if (!linkInteraction.isLinking.value || screenshotAnchorsEnabled.value) {
		if (nearDragNodeIds.value.size > 0) nearDragNodeIds.value = new Set()
		return
	}
	const { x: px, y: py } = nearDragLastPointer
	const HIT_RADIUS = 80
	const next = new Set<string>()
	const hosts = document.querySelectorAll<HTMLElement>('.aiwf-node-screenshot-host')
	for (const host of Array.from(hosts)) {
		const nodeId = host.querySelector('[data-wf-node-id]')?.getAttribute('data-wf-node-id')
		if (!nodeId) continue
		const r = host.getBoundingClientRect()
		if (r.width <= 0 || r.height <= 0) continue
		const dx = Math.max(r.left - px, 0, px - r.right)
		const dy = Math.max(r.top - py, 0, py - r.bottom)
		const dist = Math.sqrt(dx * dx + dy * dy)
		if (
			dist <= HIT_RADIUS ||
			(px >= r.left - HIT_RADIUS &&
				px <= r.right + HIT_RADIUS &&
				py >= r.top - HIT_RADIUS &&
				py <= r.bottom + HIT_RADIUS)
		) {
			next.add(nodeId)
		}
	}
	nearDragNodeIds.value = next
}

const onNearDragPointerMove = (e: PointerEvent) => {
	if (!linkInteraction.isLinking.value || screenshotAnchorsEnabled.value) {
		nearDragLastPointer = null
		if (nearDragNodeIds.value.size > 0) nearDragNodeIds.value = new Set()
		return
	}
	nearDragLastPointer = { x: e.clientX, y: e.clientY }
	if (nearDragRafId == null) {
		nearDragRafId = requestAnimationFrame(computeNearDragNodes)
	}
}

const onNearDragPointerUp = () => {
	nearDragLastPointer = null
	nearDragNodeIds.value = new Set()
}

watch(linkInteraction.isLinking, (isLinking) => {
	if (isLinking && !screenshotAnchorsEnabled.value) {
		window.addEventListener('pointermove', onNearDragPointerMove, { passive: true })
		window.addEventListener('pointerup', onNearDragPointerUp, { once: true })
		window.addEventListener('pointercancel', onNearDragPointerUp, { once: true })
	} else {
		window.removeEventListener('pointermove', onNearDragPointerMove)
		window.removeEventListener('pointerup', onNearDragPointerUp)
		window.removeEventListener('pointercancel', onNearDragPointerUp)
		nearDragLastPointer = null
		nearDragNodeIds.value = new Set()
		if (nearDragRafId != null) {
			cancelAnimationFrame(nearDragRafId)
			nearDragRafId = null
		}
	}
})

watch(screenshotAnchorsEnabled, (enabled) => {
	if (enabled) {
		nearDragNodeIds.value = new Set()
		nearDragLastPointer = null
	}
})

const {
	perfFpsText,
	perfFrameText,
	perfAvgFrameText,
	perfWorstFrameText,
	perfLongTaskSummary,
	perfNodeSummary,
	perfEdgeSummary,
	perfEdgeComputeText,
	perfEdgeInputCountText,
	perfEdgeRenderedText,
	perfEdgeCulledText,
	perfEdgeCullHitRateText,
	perfZoomText,
	perfHealthLabel,
	buildPerfDiagnosticPayload
} = useAIWorkflowPerfMonitor({
	nodesCount: computed(() => nodes.value.length),
	visibleNodesCount: computed(() => visibleRenderNodes.value.length),
	compactVisibleNodeCount: compactVisibleNodeCount,
	fullVisibleNodeCount: fullVisibleNodeCount,
	renderEdgesCount: computed(() => renderEdges.value.length),
	edgesCount: computed(() => edges.value.length),
	zoom: computed(() => Number(viewport.value.zoom) || 0),
	edgeComputeMs: perfEdgeComputeMs,
	edgeInputCount: perfEdgeInputCount,
	edgeRenderedCount: perfEdgeRenderedCount,
	edgeCulledCount: perfEdgeCulledCount
})

const onExportPerfDiagnostics = () => {
	try {
		const payload = buildPerfDiagnosticPayload()
		const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const stamp = new Date().toISOString().replace(/[:.]/g, '-')
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = `aiworkflow-perf-${stamp}.json`
		anchor.click()
		setTimeout(() => {
			URL.revokeObjectURL(url)
		}, 0)
		pushToast('已导出性能诊断日志。', 'info')
	} catch (err: unknown) {
		pushToast(`导出性能诊断日志失败：${getErrorMessage(err)}`, 'warn')
	}
}

const blueprintLogPanelOpen = ref(false)
const resources = computed(() =>
	store.state.resourceOrder.map((id) => store.state.resourcesById[id]).filter(Boolean)
)

const imageMarkupContext = ref<{ nodeId: string | null; url: string | null; name: string | null }>({
	nodeId: null,
	url: null,
	name: null
})

let imageMarkupExportListenerId: number | null = null

const onNodeImagePreviewRequestInline = (nodeId: string, ev: unknown) => {
	const evRec = isRecord(ev) ? ev : {}
	const imageUrl = safeGetString(evRec, 'imageUrl') ?? ''
	onNodeImagePreviewRequest(nodeId, imageUrl)
}

const onNodeImagePreviewRequest = (nodeId: string, imageUrl: string) => {
	console.log('[AIWorkflowPage] onNodeImagePreviewRequest → nodeId:', nodeId, 'imageUrl:', imageUrl)
	if (!imageUrl) {
		pushToast('该图片节点暂无图像资源可预览。', 'warn')
		return
	}
	imageMarkupContext.value = { nodeId, url: imageUrl, name: null }
	try {
		const w = window as unknown as Record<string, unknown>
		const dweb = safeGetRecord(w, 'dweb')
		const dwebAiworkflow = dweb ? safeGetRecord(dweb, 'aiworkflow') : undefined
		console.log(
			'[AIWorkflowPage] dweb available:',
			!!dweb,
			'dweb.aiworkflow:',
			!!dwebAiworkflow,
			'openImageMarkupPreview:',
			typeof dwebAiworkflow?.openImageMarkupPreview
		)
		if (dwebAiworkflow && typeof dwebAiworkflow.openImageMarkupPreview === 'function') {
			console.log('[AIWorkflowPage] calling openImageMarkupPreview with:', {
				url: imageUrl,
				name: nodeId
			})
			const openPreview = dwebAiworkflow.openImageMarkupPreview as (args: {
				url: string
				name: string
			}) => void
			openPreview({ url: imageUrl, name: nodeId })
			return
		}
		pushToast('当前环境未提供图片预览原生窗口，请在 DVStudio Electron 客户端中使用。', 'warn')
	} catch (err) {
		console.warn('[AIWorkflowPage] openImageMarkupPreview failed', err)
		pushToast('打开图片预览窗口失败。', 'warn')
	}
}

const closeImageMarkupDialog = () => {
	imageMarkupContext.value = { nodeId: null, url: null, name: null }
}

const handleImageMarkupExported = (payload: {
	dataUrl: string
	width: number
	height: number
	sourceName?: string | null
}) => {
	const fromNodeId = imageMarkupContext.value.nodeId
	const baseName = (
		imageMarkupContext.value.name ||
		payload.sourceName ||
		'marked-image.png'
	).replace(/\.[^.]+$/, '')
	if (!fromNodeId) {
		pushToast('找不到源图片节点，无法生成新节点。', 'warn')
		return
	}
	try {
		const fromNode = store.state.nodesById[fromNodeId]
		if (!fromNode) return

		const baseX = Number(fromNode.worldX || 0)
		const baseY = Number(fromNode.worldY || 0)
		const title = `${fromNode.title ? fromNode.title + ' ' : ''}标记图像`

		store.commit('addNodeAt', { worldX: baseX + 400, worldY: baseY, title })
		const newNodeId = String(store.state.selectedNodeId || '').trim()
		if (!newNodeId || !store.state.nodesById[newNodeId]) {
			pushToast('创建标记图像节点失败。', 'error')
			return
		}

		const resourceId = `res-markup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
		const resourceName = `${baseName}-marked-${Date.now()}.png`.slice(0, 200)
		const newResource: WorkflowResource = {
			id: resourceId,
			kind: 'image',
			name: resourceName,
			url: payload.dataUrl,
			localFileKey: `markup:${newNodeId}`,
			createdAt: Date.now()
		}
		store.commit('addResource', newResource)

		store.commit('setNodeType', { nodeId: newNodeId, type: 'image' })
		store.commit('setNodeResource', { nodeId: newNodeId, resourceId })

		const w = Math.max(1, Math.floor(Number(payload.width) || 1))
		const h = Math.max(1, Math.floor(Number(payload.height) || 1))
		store.commit('setNodeImageSettings', {
			nodeId: newNodeId,
			imageSettings: {
				outputWidth: w,
				outputHeight: h,
				naturalWidth: w,
				naturalHeight: h,
				cropEnabled: false,
				crop: { x: 0, y: 0, width: 1, height: 1 }
			}
		})

		const fromAnchors = fromNode.outputs
		const fromAnchor =
			fromAnchors?.find(
				(a) => String(a.mediaType || '') === 'image' || /^out-image/.test(String(a.id || ''))
			) || fromAnchors?.[0]
		if (fromAnchor) {
			store.commit('addEdge', {
				fromNodeId,
				fromAnchorId: String(fromAnchor.id),
				toNodeId: newNodeId,
				toAnchorId: 'in-0'
			})
		}

		closeImageMarkupDialog()
		pushToast('已在当前图片节点右侧生成新的图片节点，并自动连接原节点。', 'info')
	} catch (err) {
		console.warn('[AIWorkflowPage] handleImageMarkupExported failed', err)
		pushToast('生成标记图像节点失败。', 'error')
	}
}

const onNodeExportMarkupImage = (payload: {
	file: File
	dataUrl: string
	width: number
	height: number
}) => {
	handleImageMarkupExported({
		dataUrl: payload.dataUrl,
		width: payload.width,
		height: payload.height
	})
}

const {
	meshyTaskDialogOpen,
	meshyTaskItems,
	meshyTaskPanelStatusText,
	meshyBalanceText,
	meshyBalanceDetail,
	meshyBalanceTone,
	meshyTaskRemoteLoaded,
	meshyTaskRemoteLoading,
	meshyTaskDetail,
	meshyTaskDetailTaskId,
	meshyTaskDetailLoading,
	meshyTaskActionBusyTaskId,
	meshyTaskActionBusyType,
	openMeshyTaskDialog,
	closeMeshyTaskDialog,
	onRefreshMeshyTaskPanel,
	onMeshyTaskPanelAction,
	onPreviewMeshyTask,
	onNodeRefreshMeshyTask,
	onNodePullMeshyOutput,
	onNodeStopMeshyTask,
	onNodeDeleteMeshyTask,
	refreshMeshyTaskItems,
	refreshMeshyBalance,
	refreshMeshyTaskToNode,
	onMeshyTaskDialogOpenChanged
} = useAIWorkflowMeshyTaskPanelController({
	store,
	renderNodes,
	comfyService,
	pushToast,
	getMeshyDisplayThumbnailUrl,
	pickMeshyEffectiveOutput,
	applyMeshyTaskResult,
	stopMeshyPoll
})

const onOpenMeshyTaskPanel = () => {
	openMeshyTaskDialog()
}

const onNodeRetryMeshyFetch = async (nodeId: string) => {
	const node = store.state.nodesById[nodeId]
	if (!node || node.type !== 'model3d') return
	const settings = node.model3dSettings?.meshyModelSettings
	const taskId = String(settings?.taskId ?? '').trim()
	const mode = String(settings?.taskFamily ?? 'text-to-3d').trim()
	if (!taskId) {
		pushToast('当前节点没有可重试的 Meshy 任务 ID。', 'warn')
		return
	}
	try {
		const res = await comfyService.meshyTask(taskId, mode)
		if (!res?.ok) {
			pushToast('拉取失败：' + String(res?.error ?? 'unknown'), 'error')
			return
		}
		const finalStatus = await applyMeshyTaskResult(nodeId, res as unknown)
		if (finalStatus === 'succeeded') {
			pushToast('模型文件拉取成功。', 'info')
		} else {
			pushToast('任务尚未完成，当前状态：' + finalStatus, 'warn')
		}
	} catch (e: unknown) {
		pushToast('拉取异常：' + getErrorMessage(e), 'error')
	}
}

const {
	videoTaskDialogOpen,
	videoTaskItems,
	videoTaskLoading,
	videoTaskSyncing,
	videoTaskDetail,
	videoTaskDetailTaskId,
	videoTaskDetailLoading,
	videoTaskPanelStatusText,
	openVideoTaskDialog,
	closeVideoTaskDialog,
	refreshVideoTaskItems,
	syncRemoteVideoTasks,
	recoverVideoTaskMedia,
	selectVideoTask,
	onVideoTaskDialogOpenChanged
} = useAIWorkflowVideoTaskPanelController({
	comfyService,
	pushToast,
	getCurrentProjectId: () => currentProjectId.value
})

async function onSeedanceTaskObserved(taskId: string, stage: 'created' | 'completed') {
	const nextTaskId = String(taskId || '').trim()
	if (!nextTaskId) return
	await refreshVideoTaskItems({ silent: true })
	if (videoTaskDialogOpen.value || stage === 'completed') {
		await selectVideoTask(nextTaskId, { silent: true })
	}
	currentSeedancePreviewTaskId.value = nextTaskId
	await syncSeedancePreviewFromTaskId(nextTaskId)
}

const currentSeedancePreviewTaskId = ref('')
let seedancePreviewPollTimer = 0

const clearSeedancePreviewPoll = () => {
	if (!seedancePreviewPollTimer) return
	window.clearTimeout(seedancePreviewPollTimer)
	seedancePreviewPollTimer = 0
}

const syncSeedancePreviewFromTaskItem = (item: SeedanceTaskMirrorItem | null | undefined) => {
	if (!item) return false
	const remoteUrl = resolveBackendUrl(String(item.videoUrlRemote || '').trim())
	const localUrl = resolveBackendUrl(String(item.videoUrlLocal || '').trim())
	const sourcePath = String(item.videoSourcePathLocal || '').trim()
	const status = String(item.downloadStatus || '').trim() || 'pending'
	const progressRaw = Number(item.downloadProgress ?? 0)
	const progress = Number.isFinite(progressRaw)
		? Math.max(0, Math.min(100, Math.round(progressRaw)))
		: 0
	const localReady = !!localUrl && status === 'ready'
	const displayUrl = localReady ? localUrl : remoteUrl || localUrl
	nanoPreviewUrls.value = [displayUrl]
	nanoPreviewFallbackUrls.value = [remoteUrl]
	nanoPreviewSourcePaths.value = [localReady ? sourcePath : '']
	nanoPreviewLoadingStates.value = [!displayUrl]
	nanoPreviewDownloadStatuses.value = [status]
	nanoPreviewDownloadProgresses.value = [progress]
	nanoPreviewLocalReadyStates.value = [localReady]
	if (displayUrl) nanoPreviewUrl.value = displayUrl
	return status === 'pending' || status === 'downloading' || (!localReady && !!remoteUrl)
}

const scheduleSeedancePreviewPoll = (taskId: string, delay = 1200) => {
	clearSeedancePreviewPoll()
	const nextTaskId = String(taskId || '').trim()
	if (!nextTaskId) return
	seedancePreviewPollTimer = window.setTimeout(() => {
		void syncSeedancePreviewFromTaskId(nextTaskId)
	}, delay)
}

const syncSeedancePreviewFromTaskId = async (taskId: string) => {
	const nextTaskId = String(taskId || '').trim()
	if (!nextTaskId) return
	try {
		const res = await comfyService.seedanceTaskDetail(nextTaskId)
		const resRec = isRecord(res) ? (res as Record<string, unknown> & { ok?: boolean }) : {}
		if (!resRec.ok || !hasKey(resRec, 'item')) {
			scheduleSeedancePreviewPoll(nextTaskId, 1500)
			return
		}
		const shouldContinue = syncSeedancePreviewFromTaskItem(resRec.item as SeedanceTaskMirrorItem)
		if (currentSeedancePreviewTaskId.value === nextTaskId && shouldContinue) {
			scheduleSeedancePreviewPoll(nextTaskId)
			return
		}
		clearSeedancePreviewPoll()
	} catch {
		if (currentSeedancePreviewTaskId.value === nextTaskId) {
			scheduleSeedancePreviewPoll(nextTaskId, 1800)
		}
	}
}

onBeforeUnmount(() => {
	clearSeedancePreviewPoll()
	// 清理资源管理器窗口事件监听
	if (resourceManagerEventListenerId !== null) {
		const w = window as unknown as Record<string, unknown>
		const dweb = safeGetRecord(w, 'dweb')
		const dwebAiworkflow = dweb ? safeGetRecord(dweb, 'aiworkflow') : undefined
		const offEvent = dwebAiworkflow?.offResourceManagerEvent
		if (typeof offEvent === 'function') {
			;(offEvent as (id: number) => void)(resourceManagerEventListenerId)
		}
		resourceManagerEventListenerId = null
	}
})

// ============ 资源管理器窗口 → 蓝图节点拖放 ============
const onResourceDraggedToBlueprint = (
	resourceId: string,
	screenPosition?: { x: number; y: number } | null
) => {
	const resource = store.state.resourcesById?.[String(resourceId)]
	if (!resource) {
		pushToast('未找到该资源记录。', 'warn')
		return
	}
	// 计算世界坐标
	const vp = viewport.value
	const screenX = screenPosition?.x ?? window.innerWidth / 2
	const screenY = screenPosition?.y ?? window.innerHeight / 2
	const worldX = (screenX - vp.panX) / vp.zoom
	const worldY = (screenY - vp.panY) / vp.zoom

	const title = String(resource.name || resourceId || '资源节点').slice(0, 200)
	store.commit('addNodeAt', { worldX, worldY, title })
	const newNodeId = String(store.state.selectedNodeId || '').trim()
	if (!newNodeId || !store.state.nodesById[newNodeId]) {
		pushToast('创建资源节点失败。', 'error')
		return
	}
	// 将资源绑定到新节点
	store.commit('nodeFieldUpdate', {
		nodeId: newNodeId,
		field: 'image',
		value: resource.url || ''
	})
	pushToast(`已将「${title}」添加到蓝图。`, 'info')
}

const onVideoTaskPanelMediaError = (taskId: string) => {
	void recoverVideoTaskMedia(taskId)
}

const onRailQuickAdd = (event: MouseEvent) => {
	const worldX = (event.clientX - viewport.value.panX) / viewport.value.zoom
	const worldY = (event.clientY - viewport.value.panY) / viewport.value.zoom
	store.commit('addNodeAt', { worldX, worldY })
}

const onDeleteSelectedNodes = () => {
	if (!selectedNodeIds.value.length) return
	void removeSelectedNodesWithResourceCleanup(selectedNodeIds.value)
}

const onDeleteSelectionFrame = (payload?: { frameId?: string }) => {
	if (payload?.frameId) {
		const frame = store.state.savedSelectionFrames?.find((f) => f.id === payload.frameId)
		if (frame) {
			store.dispatch('removeSavedSelectionFrame', { id: payload.frameId })
			const sortedIds = [...frame.nodeIds].sort()
			const tagKey = `ids:${sortedIds.join('|')}`
			store.dispatch('removeSelectionTag', { key: tagKey })
		}
	}
	tagEditor.clearSelectionOnly()
}

const onRailToggleNodeLibrary = () => {
	const wrapEl = document.querySelector('.bp-wrap')
	if (wrapEl) {
		const rect = wrapEl.getBoundingClientRect()
		const screenCenter = { x: rect.width / 2, y: rect.height / 2 }
		const z = viewport.value.zoom
		const worldX = (screenCenter.x - screenCenter.x - viewport.value.panX) / z
		const worldY = (screenCenter.y - screenCenter.y - viewport.value.panY) / z
		openNodeSearchMenu({
			clientX: rect.left + rect.width / 2,
			clientY: rect.top + rect.height / 2,
			worldX,
			worldY
		})
	}
}

const onNodeOpenLibrary = (nodeId: string) => {
	const node = store.state.nodesById[nodeId]
	if (!node) return
	const wrapEl = document.querySelector('.bp-wrap')
	if (wrapEl) {
		const rect = wrapEl.getBoundingClientRect()
		const z = viewport.value.zoom
		const screenX = node.worldX * z + viewport.value.panX + rect.left
		const screenY = node.worldY * z + viewport.value.panY + rect.top
		openNodeSearchMenu({
			clientX: screenX,
			clientY: screenY,
			worldX: node.worldX,
			worldY: node.worldY
		})
	}
}

const onRailToggleBackendLog = () => {
	blueprintLogPanelOpen.value = !blueprintLogPanelOpen.value
}

const { onNodeRefresh } = useAIWorkflowNodeRefresh({
	store,
	pushToast,
	resetSceneUnderstandingNodeState,
	getIncomingEdges,
	syncModel3DInputFromUpstream,
	refreshMeshyTaskToNode,
	connectedTextInputValue,
	onNodeRunSceneLayout,
	syncUnrealExportNodes,
	setNodeResourceWithCleanup,
	autoSizeMediaNode,
	buildCroppedImageTransferFile,
	onNodeUploadResource,
	fileFromUrl,
	forceRefreshCurrentMediaNode,
	bindMediaResourceToNode,
	comfyOutputForAnchor,
	connectedImageOutputUrl
})

// ============ 资源管理器窗口事件监听 ============
// 主窗口监听来自资源管理器独立窗口的事件广播
let resourceManagerEventListenerId: number | null = null

const pushSystemToast = (message: string, tone: 'info' | 'warn' | 'error' = 'warn') => {
	chatMessages.value = [
		...chatMessages.value,
		{
			id: `sys-focus-${Date.now()}`,
			role: 'system',
			content: message,
			message,
			tone,
			createdAt: Date.now()
		}
	]
}

const tryFocusNodeById = (nodeIdRaw: unknown): boolean => {
	const nodeId = String(nodeIdRaw || '').trim()
	if (!nodeId) return false
	const exists = !!store.state.nodesById?.[nodeId]
	if (!exists) return false
	const ok = canvasInteraction.onFocusNode(nodeId)
	if (ok) {
		store.commit('setSelectedNode', { nodeId })
	}
	return ok
}

const onToolbarFocusNode = (p: unknown) => {
	const pRec = isRecord(p) ? p : {}
	const nodeId = safeGetString(pRec, 'nodeId')?.trim() ?? ''
	if (!nodeId) return
	const ok = tryFocusNodeById(nodeId)
	if (!ok) {
		pushSystemToast('引用节点已删除，无法定位。', 'warn')
	}
}

const onResourceManagerWindowEvent = (payload: { event: string; data: unknown }) => {
	const { event, data } = payload || {}
	if (!event) return
	const dataRec = isRecord(data) ? data : {}
	switch (String(event)) {
		case 'remove':
			// 资源管理器窗口中删除了资源，同步到蓝图页面
			if (dataRec.resourceId) {
				void onRemoveResource(String(dataRec.resourceId))
			}
			break
		case 'preview':
			// 资源管理器窗口中预览了资源
			if (dataRec.resourceId) {
				void onPreviewResource(String(dataRec.resourceId))
			}
			break
		case 'refresh-missing':
			// 资源管理器窗口中触发了缺失刷新
			const resourceIdsRaw = safeGetArray(dataRec, 'resourceIds', isString)
			if (resourceIdsRaw) {
				void onRefreshMissingResourceRecords(resourceIdsRaw)
			}
			break
		case 'drop-to-node':
			// 资源管理器窗口中拖拽资源到蓝图节点
			if (dataRec.resourceId) {
				const position = safeGetRecord(dataRec, 'position')
				const posX = safeGetNumber(position ?? {}, 'x')
				const posY = safeGetNumber(position ?? {}, 'y')
				void onResourceDraggedToBlueprint(
					String(dataRec.resourceId),
					posX !== undefined && posY !== undefined ? { x: posX, y: posY } : null
				)
			}
			break
		case 'focus-node':
			// 资源管理器窗口中请求定位到节点
			if (dataRec.nodeId) {
				const ok = tryFocusNodeById(String(dataRec.nodeId))
				if (!ok) {
					pushSystemToast('引用节点已删除，无法定位。', 'warn')
				}
			}
			break
		default:
			console.log('[AIWorkflowPage][resource-manager] unknown event:', event, data)
	}
}

const registerResourceManagerEventListener = () => {
	const w = window as unknown as Record<string, unknown>
	const runtime = safeGetRecord(w, '__DWEB_RUNTIME__')
	const isElectronRuntime = runtime?.isElectron === true
	const dweb = safeGetRecord(w, 'dweb')
	const dwebAiworkflow = dweb ? safeGetRecord(dweb, 'aiworkflow') : undefined
	const onEvent = dwebAiworkflow?.onResourceManagerEvent
	if (!isElectronRuntime || typeof onEvent !== 'function') return
	resourceManagerEventListenerId = (
		onEvent as (cb: (payload: { event: string; data: unknown }) => void) => number
	)(onResourceManagerWindowEvent)
}

const openResourceDialog = async () => {
	const w = window as unknown as Record<string, unknown>
	const runtime = safeGetRecord(w, '__DWEB_RUNTIME__')
	const isElectronRuntime = runtime?.isElectron === true
	const dweb = safeGetRecord(w, 'dweb')
	const dwebAiworkflow = dweb ? safeGetRecord(dweb, 'aiworkflow') : undefined
	const openManager = dwebAiworkflow?.openResourceManager
	// Electron 环境：打开原生窗口
	if (isElectronRuntime && typeof openManager === 'function') {
		try {
			const projectId = currentProjectId.value
			const title = currentProjectName.value || '资源管理器'
			const result = await (
				openManager as (args: {
					projectId: number | null
					title: string
				}) => Promise<{ ok?: boolean }>
			)({ projectId, title })
			console.log('[AIWorkflowPage] openResourceManager result:', JSON.stringify(result))

			// 发送资源数据到资源管理器窗口
			if (result?.ok) {
				// 将Vue响应式对象转换为普通对象（通过JSON序列化脱壳）
				// 注意：必须使用这种方式，因为Electron IPC无法序列化Vue Proxy对象
				const resourcesData = JSON.parse(JSON.stringify(resources.value))
				const nodesData = JSON.parse(JSON.stringify(store.state.nodesById))
				const nodeOrderData = JSON.parse(JSON.stringify(store.state.nodeOrder))
				const sendData = dwebAiworkflow?.sendResourceManagerData
				if (typeof sendData === 'function') {
					await (
						sendData as (args: {
							resources: unknown
							nodesById: unknown
							nodeOrder: unknown
						}) => Promise<void>
					)({
						resources: resourcesData,
						nodesById: nodesData,
						nodeOrder: nodeOrderData
					})
				}
				console.log('[AIWorkflowPage] sent resources to resource manager:', resourcesData.length)
			}
			return
		} catch (err) {
			console.warn('[AIWorkflowPage] openResourceManager IPC failed:', err)
		}
	}
	// Web 环境或 Electron 降级：显示提示
	// 资源管理器需要 Electron 原生窗口，Web 模式暂不支持
	pushToast('资源管理器仅在 Electron 客户端中可用', 'warn')
}

watch(meshyTaskDialogOpen, (open) => {
	onMeshyTaskDialogOpenChanged(open)
})
watch(videoTaskDialogOpen, (open) => {
	onVideoTaskDialogOpenChanged(open)
})

let syncNodesToManagerTimer: number | null = null
const syncNodesToResourceManager = () => {
	if (syncNodesToManagerTimer !== null) {
		clearTimeout(syncNodesToManagerTimer)
	}
	syncNodesToManagerTimer = window.setTimeout(() => {
		syncNodesToManagerTimer = null
		const w = window as unknown as Record<string, unknown>
		const runtime = safeGetRecord(w, '__DWEB_RUNTIME__')
		const isElectronRuntime = runtime?.isElectron === true
		const dweb = safeGetRecord(w, 'dweb')
		const dwebAiworkflow = dweb ? safeGetRecord(dweb, 'aiworkflow') : undefined
		const sendData = dwebAiworkflow?.sendResourceManagerData
		if (!isElectronRuntime || typeof sendData !== 'function') return
		try {
			const resourcesData = JSON.parse(JSON.stringify(resources.value))
			const nodesData = JSON.parse(JSON.stringify(store.state.nodesById))
			const nodeOrderData = JSON.parse(JSON.stringify(store.state.nodeOrder))
			void (
				sendData as (args: {
					resources: unknown
					nodesById: unknown
					nodeOrder: unknown
				}) => Promise<void>
			)({
				resources: resourcesData,
				nodesById: nodesData,
				nodeOrder: nodeOrderData
			})
		} catch {
			// ignore
		}
	}, 500)
}

watch(
	() => store.state.nodeOrder?.length ?? 0,
	() => {
		syncNodesToResourceManager()
	}
)

const removeResourceRecordOnly = (resourceId: string) => {
	revokeTrackedObjectUrlsForResource(resourceId)
	store.commit('removeResource', { resourceId })
}

const importAssetIntoProjectScope = async (payload: {
	kind: BlueprintAssetKind
	name: string
	projectId: number
	sourcePath?: string
	sourceUrl?: string
	bucket?: 'assets' | 'thumbnails'
}) => {
	const sourcePath = String(payload.sourcePath || '').trim()
	const sourceUrl = String(payload.sourceUrl || '').trim()
	if (!sourcePath && !sourceUrl) return null

	if (sourcePath) {
		if (isElectron()) {
			const copied = await copyFileToProjectRoot(payload.projectId, sourcePath, payload.name)
			const rel = String(copied?.relativePath || '').trim()
			const abs = String(copied?.absolutePath || '').trim()
			if (copied?.ok && rel && abs) {
				return {
					kind: payload.kind,
					name: payload.name,
					size: Number(copied?.size || 0),
					projectRelativePath: rel,
					relativePath: rel,
					absolutePath: abs,
					sourcePath: abs,
					url: `dweb://project-assets?projectId=${payload.projectId}&path=${encodeURIComponent(rel)}`
				}
			}
			return null
		}

		const byPath = await blueprintProjectService.importAsset({
			kind: payload.kind,
			name: payload.name,
			sourcePath,
			projectId: payload.projectId,
			bucket: payload.bucket
		})
		const byPathRec = isRecord(byPath) ? (byPath as Record<string, unknown> & { ok?: boolean }) : {}
		if (byPathRec.ok) {
			const asset = safeGetRecord(byPathRec, 'asset')
			return asset ? (asset as unknown as PendingMissingAsset) : null
		}
	}

	if (sourceUrl) {
		if (isElectron()) {
			const dl = await downloadAssetViaElectron(payload.projectId, sourceUrl, payload.name)
			if (dl) {
				return {
					kind: payload.kind,
					name: payload.name,
					size: dl.size,
					projectRelativePath: dl.projectRelativePath,
					relativePath: dl.projectRelativePath,
					absolutePath: dl.sourcePath,
					sourcePath: dl.sourcePath,
					url: dl.url
				}
			}
			return null
		}

		const byUrl = await blueprintProjectService.importAsset({
			kind: payload.kind,
			name: payload.name,
			sourceUrl,
			projectId: payload.projectId,
			bucket: payload.bucket
		})
		const byUrlRec = isRecord(byUrl) ? (byUrl as Record<string, unknown> & { ok?: boolean }) : {}
		if (byUrlRec.ok) {
			const asset = safeGetRecord(byUrlRec, 'asset')
			return asset ? (asset as unknown as PendingMissingAsset) : null
		}
	}

	return null
}

const { mediaRelativePathFromUrl, migrateCurrentResourcesToProjectScope } =
	useAIWorkflowResourceMigration({
		store,
		resolveBackendUrl,
		normalizeSourcePathKey,
		isDjangoManagedResource,
		importAssetIntoProjectScope: (payload) => importAssetIntoProjectScope(payload),
		deleteAsset: (payload) => blueprintProjectService.deleteAsset(payload),
		pushToast
	})

const { removeResourceByPolicy, onRemoveResource, onRefreshMissingResourceRecords } =
	useAIWorkflowResourceRecordCleanup({
		store,
		currentProjectId,
		blueprintProjectService,
		pushToast,
		isComfyForwardResource,
		isDjangoManagedResource,
		mediaRelativePathFromUrl,
		removeResourceRecordOnly
	})
removeResourceByPolicyBridge = removeResourceByPolicy

const onAliasChange = (nodeId: string, alias: string) => {
	store.commit('setNodeAlias', { nodeId, alias })
}

const onCanvasDblClick = (payload: {
	clientX: number
	clientY: number
	worldX: number
	worldY: number
}) => {
	openNodeSearchMenu(payload)
}

const { onNodePreviewContextMenu } = useAIWorkflowNodePreviewContextMenu({
	enabled: true,
	getNodeWorld: (nodeId) => {
		const node = store.state.nodesById[nodeId]
		return node ? { worldX: node.worldX, worldY: node.worldY } : null
	},
	onCanvasContextMenu
})

const canvasInteraction = useAIWorkflowCanvasInteraction({
	store,
	selectedNodeIds,
	inspectorOpen,
	chatModelKey,
	chatCollapsed,
	markViewportMotion,
	scheduleAsyncEdgeRender,
	canvasViewportSize
})

const onStartLink = linkInteraction.onStartLink
const onEndLink = linkInteraction.onEndLink
const nanoHoverAnchorId = linkInteraction.nanoHoverAnchorId
const hoverInputAnchorId = linkInteraction.hoverInputAnchorId
const hoverOutputAnchorId = linkInteraction.hoverOutputAnchorId
const tooltipState = linkInteraction.tooltipState
const anchorCompatibility = linkInteraction.anchorCompatibility
const isLinking = linkInteraction.isLinking
const linkingFromNodeId = linkInteraction.linkingFromNodeId
const linkingHoverNodeId = linkInteraction.linkingHoverNodeId

watch(
	() => Array.from(fullRenderNodeIds.value),
	(newIds, oldIds) => {
		const newSet = new Set(newIds)
		const oldSet = new Set(oldIds || [])
		const nodesExitingFullRender: string[] = []
		for (const nodeId of oldSet) {
			if (!newSet.has(nodeId)) {
				nodesExitingFullRender.push(nodeId)
			}
		}
		if (nodesExitingFullRender.length > 0) {
			const isWarmupExit = warmupExitingFullRender.value
			const visibleExiting: WorkflowNode[] = []
			const offscreenExiting: WorkflowNode[] = []
			const reused: WorkflowNode[] = []
			for (const nodeId of nodesExitingFullRender) {
				const node = nodes.value.find((n) => String(n.id) === nodeId)
				if (!node) continue
				nodesNeedingScreenshotRefresh.delete(nodeId)
				const version = getNodeScreenshotVersion(node)
				const existingCached = screenshotPool.getCachedScreenshot(nodeId, version)
				const currentMapEntry = nodeScreenshotMap.value.get(nodeId)
				const mapEntryValid = currentMapEntry && currentMapEntry.version === version

				if (isWarmupExit && (existingCached || mapEntryValid)) {
					if (existingCached && !mapEntryValid) {
						const newMap = new Map(nodeScreenshotMap.value)
						newMap.set(nodeId, existingCached)
						nodeScreenshotMap.value = newMap
					}
					reused.push(node)
					continue
				}

				if (!isWarmupExit) {
					screenshotPool.invalidateScreenshot(nodeId)
					const newMap = new Map(nodeScreenshotMap.value)
					newMap.delete(nodeId)
					nodeScreenshotMap.value = newMap
				}

				if (isNodeInViewport(node)) {
					visibleExiting.push(node)
				} else {
					offscreenExiting.push(node)
				}
			}

			const captureExiting = (
				list: WorkflowNode[],
				delayMs: number,
				priority: ScreenshotPriority
			) => {
				if (list.length === 0) return
				nextTick(() => {
					setTimeout(() => {
						for (const node of list) {
							void scheduleNodeScreenshot(node, 0, priority)
						}
					}, delayMs)
				})
			}

			captureExiting(visibleExiting, isWarmupExit ? 0 : 80, 'high')
			captureExiting(offscreenExiting, isWarmupExit ? 50 : 300, 'low')
		}
		nextTick(() => {
			scheduleVisibleNodeScreenshots()
		})
	},
	{ deep: true, flush: 'post' }
)

watch(
	() => nodes.value.map((n) => String(n.id)),
	(newNodeIds) => {
		const validNodeIds = new Set(newNodeIds.filter(Boolean))
		const screenshotMap = nodeScreenshotMap.value
		let hasChanges = false
		const newMap = new Map(screenshotMap)
		for (const cachedId of screenshotMap.keys()) {
			if (!validNodeIds.has(cachedId)) {
				newMap.delete(cachedId)
				screenshotPool.invalidateScreenshot(cachedId)
				nodesNeedingScreenshotRefresh.delete(cachedId)
				previousNodeSizes.delete(cachedId)
				hasChanges = true
			}
		}
		if (hasChanges) {
			nodeScreenshotMap.value = newMap
		}
	},
	{ deep: true, flush: 'post' }
)

const onCanvasPanningStart = () => {
	canvasInteraction.cancelFocusAnimation()
	linkInteraction.setPanning(true)
}

const onCanvasPanningEnd = () => {
	linkInteraction.setPanning(false)
}

const onCanvasPointerDown = canvasInteraction.onCanvasPointerDown
const onNodeX = canvasInteraction.onNodeX
const onNodeY = canvasInteraction.onNodeY
const onSelectNode = canvasInteraction.onSelectNode
const onSelectEdge = canvasInteraction.onSelectEdge
const onCompactNodePointerDown = canvasInteraction.onCompactNodePointerDown
const onBoxSelect = canvasInteraction.onBoxSelect
const onNodeSizeChange = canvasInteraction.onNodeSizeChange
const onFocusNode = canvasInteraction.onFocusNode

const onSelectionFrameDrag = (payload: { dx: number; dy: number; nodeIds: string[] }) => {
	store.dispatch('moveNodesBy', payload)
}

onBeforeUnmount(() => {
	cancelActiveImportSession({ cleanupUnresolved: false })
	mediaImportManager.dispose()
	try {
		videoMetadataQueue?.cancel()
	} catch {
		// ignore
	}
	window.removeEventListener('dvs:shortcut/save', onGlobalShortcutSave, true)
	unmountWindowEvents()
	window.removeEventListener('pointerup', flushPendingImageDistribute, true)
	window.removeEventListener('pointercancel', flushPendingImageDistribute, true)
	disposeComfyRuntime()
	cleanupSceneUnderstandingRuntime()
	clearMeshyRuntime()
	stopUnrealExportPolling()
	if (posterAutoSaveTimer) {
		window.clearTimeout(posterAutoSaveTimer)
		posterAutoSaveTimer = null
	}
	posterAutoSaveQueued = false
	posterAutoSaveRunning = false
	pendingImageDistributeNodeIds.clear()
	clearAllObjectUrls()
	for (const timer of mediaReadyDebounceTimers.values()) {
		clearTimeout(timer)
	}
	mediaReadyDebounceTimers.clear()
	if (screenshotScheduleTimer) {
		clearTimeout(screenshotScheduleTimer)
		screenshotScheduleTimer = null
	}
	try {
		screenshotPool.cleanup()
	} catch {}
	// 卸载全局 404 错误拦截器
	try {
		uninstallGlobal404Handlers?.()
	} catch {
		/* ignore */
	}
})

let uninstallGlobal404Handlers: (() => void) | null = null

onMounted(() => {
	// Take over global Ctrl/Cmd+S only on this page.
	window.addEventListener('dvs:shortcut/save', onGlobalShortcutSave, true)
	mountWindowEvents()
	window.addEventListener('pointerup', flushPendingImageDistribute, true)
	window.addEventListener('pointercancel', flushPendingImageDistribute, true)
	// 安装全局 404 错误拦截器（覆盖 img/video/script/link/fetch 错误）
	uninstallGlobal404Handlers = installGlobalErrorHandlers()
	startUnrealExportPolling()
	registerResourceManagerEventListener()
	void refreshProjectList()
	blueprintLog.append('蓝图页面已加载，日志面板就绪', {
		category: 'system',
		level: 'INFO',
		tag: 'init'
	})

	const rawProjectId = String((route.query as Record<string, unknown>)?.projectId ?? '').trim()
	const parsedProjectId = Number(rawProjectId)
	const hasNewProjectQuery =
		String((route.query as Record<string, unknown>)?.newProject ?? '').trim() === '1'
	const rawRootPath = String((route.query as Record<string, unknown>)?.rootPath ?? '').trim()

	const resolvedProjectId =
		Number.isFinite(parsedProjectId) && parsedProjectId > 0 ? Math.floor(parsedProjectId) : null

	void (async () => {
		if (resolvedProjectId) {
			await runProjectEnterSequence({ kind: 'open', projectId: resolvedProjectId })
			return
		}
		if (hasNewProjectQuery && rawRootPath) {
			// 直接用 newProject query 进入已不再支持，跳回项目列表
			noProjectSelected.value = true
			return
		}
		await tryAutoLoadLastProject()
		await recoverComfyUIRunStates({ silent: true })
		if (!currentProjectId.value) {
			noProjectSelected.value = true
		}
	})()

	if (isElectronRuntime) {
		chatModelKey.value = 'codex'
		agentConversationMode.value = 'agent'
	}

	if (isElectronRuntime && shouldAutoHelloOnLaunch && !autoHelloSent) {
		autoHelloSent = true
		window.setTimeout(() => {
			if (chatSending.value) return
			if (chatModelKey.value !== 'codex') chatModelKey.value = 'codex'
			agentConversationMode.value = 'agent'
			chatCollapsed.value = false
			chatPanelMode.value = 'agent'
			if (!String(chatDraft.value || '').trim()) {
				store.commit('setChatDraft', { text: resolveAutoHelloText() })
			}
			void onSend()
		}, 900)
	}
})

async function runProjectEnterSequence(
	request: { kind: 'open'; projectId: number } | { kind: 'new'; rootPath: string }
) {
	if (isElectron()) {
		startupProgress.show('进入蓝图项目', 2500)
		startupProgress.reset('进入蓝图项目')
	}

	// Step 1. 读取本地项目数据
	let projectReady = false
	if (request.kind === 'open') {
		await startupProgress.runStep(
			'project.load',
			'读取项目数据',
			async () => {
				const ok = await loadProjectById(request.projectId)
				if (!ok) throw new Error('项目数据加载失败')
				projectReady = true
				return true
			},
			{ errorDetailOnFailure: true }
		)
	} else {
		await startupProgress.runStep(
			'project.new',
			'初始化项目',
			async () => {
				await onRequestNewProjectFromPath(request.rootPath)
				projectReady = true
				return true
			},
			{ errorDetailOnFailure: true }
		)
	}

	// Step 2. 加载静态资产（根据当前快照中的资源记录做一次运行状态梳理）
	if (projectReady) {
		await startupProgress.runStep(
			'project.assets',
			'加载静态资产',
			async () => {
				try {
					await recoverComfyUIRunStates({ silent: true })
				} catch {
					// 资源恢复失败不阻断主流程，仅记录
				}
				const resourcesTotal =
					store.state.resourceOrder?.length ?? Object.keys(store.state.resourcesById ?? {}).length
				return resourcesTotal
			},
			{ errorDetailOnFailure: true }
		)
	}
}
</script>

<style scoped>
.aiwf-page {
	height: 100%;
	position: relative;
	overflow: hidden;
	background: var(--aiwf-page-background, var(--dweb-defualt));
}

.no-project-guide {
	position: absolute;
	inset: 0;
	z-index: 9999;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(13, 15, 21, 0.82);
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
}

.no-project-card {
	background: var(--dweb-defualt-dark);
	border: 1px solid var(--vscode-border);
	border-radius: 12px;
	padding: 32px 40px;
	max-width: 420px;
	text-align: center;
	box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
}

.no-project-card h2 {
	margin: 0 0 12px 0;
	font-size: 18px;
	font-weight: 600;
	color: var(--vscode-fg);
}

.no-project-card p {
	margin: 0 0 20px 0;
	font-size: 13px;
	color: var(--vscode-fg-muted);
	line-height: 1.6;
}

.no-project-card button {
	padding: 8px 20px;
	background: var(--vscode-border-accent);
	border: 1px solid var(--vscode-border-accent);
	color: #fff;
	font-size: 13px;
	cursor: pointer;
	border-radius: 4px;
}

.no-project-card button:hover {
	opacity: 0.9;
}

.aiwf-blueprint-container {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: var(--aiwf-canvas-z-index, 1);
}

.aiwf-ui-container {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: var(--aiwf-overlay-z-index, 10);
	pointer-events: none;
}

.aiwf-overlay-top-left,
.aiwf-overlay-top-right,
.aiwf-overlay-floating,
.aiwf-overlay-alerts {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.aiwf-overlay-top-left {
	z-index: var(--aiwf-chrome-z-index, 20);
}

.aiwf-overlay-top-right {
	z-index: var(--aiwf-chrome-z-index, 20);
}

.aiwf-overlay-floating {
	z-index: var(--aiwf-floating-z-index, 101);
}

.aiwf-overlay-floating-utility {
	z-index: var(--aiwf-overlay-utility-z-index, 80);
}

.aiwf-overlay-alerts {
	z-index: var(--aiwf-alert-z-index, 130);
}

.aiwf-overlay-top-left > *,
.aiwf-overlay-top-right > *,
.aiwf-overlay-floating > *,
.aiwf-overlay-alerts > * {
	pointer-events: auto;
}

.aiwf-chat-dock {
	pointer-events: auto;
}

/* 智能位置调整 */
.bp-toolbar-wrap {
	left: 88px;
}

.aiwf-canvas {
	position: absolute;
	inset: 0;
}

.aiwf-node-host {
	display: contents;
}

.aiwf-node-host-offscreen {
	position: fixed !important;
	left: -99999px !important;
	top: 0 !important;
	opacity: 0 !important;
	pointer-events: none !important;
}

.aiwf-node-screenshot-host {
	position: absolute;
	will-change: transform;
	cursor: pointer;
	margin: 0;
	padding: 0;
	transform-origin: center center;
	overflow: visible;
	z-index: 2;
	background: transparent;
	background-color: transparent;
}

.aiwf-node-screenshot-host.is-primary-selected {
	z-index: 30;
}

.aiwf-node-screenshot-host.is-anchors-hidden .wf-anchors {
	opacity: 0;
	pointer-events: none;
}

.aiwf-node-screenshot-host.is-anchors-hidden.is-near-drag .wf-anchors {
	opacity: 1;
	pointer-events: auto;
}

.aiwf-node-screenshot-host.is-particles-hidden .wf-node-particles {
	display: none !important;
}

.aiwf-node-screenshot-img {
	display: block;
	object-fit: fill;
	pointer-events: none;
	user-select: none;
	-webkit-user-drag: none;
	image-rendering: -webkit-optimize-contrast;
	background: transparent;
	background-color: transparent;
}

.aiwf-node-skeleton {
	position: absolute;
	pointer-events: none;
	transform-origin: top left;
	background: rgba(30, 34, 44, 0.6);
	border: 1px dashed rgba(120, 130, 150, 0.3);
	border-radius: 10px;
}

.aiwf-inspector-toggle {
	position: absolute;
	top: var(--aiwf-inspector-toggle-top, 16px);
	right: 0;
	z-index: var(--aiwf-floating-z-index, 101);
	border: 1px solid var(--aiwf-inspector-toggle-border, var(--vscode-border));
	background: var(--aiwf-inspector-toggle-bg, var(--dweb-defualt-dark));
	color: var(--aiwf-inspector-toggle-text, var(--vscode-fg));
	padding: 6px 10px;
	cursor: pointer;
	box-shadow: var(--aiwf-inspector-toggle-shadow, var(--vscode-shadow));
}

.aiwf-inspector-toggle:hover {
	border-color: var(--aiwf-inspector-toggle-border-hover, var(--vscode-hover-border));
	background: var(--aiwf-inspector-toggle-bg-hover, var(--vscode-hover-bg));
}

.aiwf-package-progress {
	position: absolute;
	top: 56px;
	right: 0;
	z-index: var(--aiwf-floating-z-index, 101);
	width: min(320px, calc(100vw - 32px));
	padding: 12px 12px 10px;
	border: 1px solid var(--wf-panel-border, rgba(255, 255, 255, 0.12));
	background: var(--wf-panel-bg-solid, rgba(8, 11, 16, 0.94));
	backdrop-filter: blur(var(--wf-overlay-blur, 10px));
	box-shadow: var(--wf-panel-shadow, 0 16px 40px rgba(0, 0, 0, 0.28));
}

.aiwf-package-progress-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.aiwf-package-progress-title {
	font-size: 12px;
	font-weight: 700;
	color: var(--vscode-fg);
}

.aiwf-package-progress-percent {
	font-size: 12px;
	color: #9ad1ff;
}

.aiwf-package-progress-stage {
	margin-top: 8px;
	font-size: 12px;
	color: var(--vscode-fg);
}

.aiwf-package-progress-bar {
	margin-top: 8px;
	height: 8px;
	border-radius: 0;
	overflow: hidden;
	background: rgba(255, 255, 255, 0.08);
}

.aiwf-package-progress-fill {
	height: 100%;
	border-radius: inherit;
	background: linear-gradient(90deg, #4cb1ff, #7ef0c4);
	transition: width 0.18s ease;
}

.aiwf-package-progress-detail {
	margin-top: 8px;
	font-size: 11px;
	color: var(--vscode-fg-muted);
}

.aiwf-perf-badge {
	display: inline-flex;
	align-items: center;
	min-height: 22px;
	padding: 0 8px;
	border-radius: 0;
	font-size: 11px;
	border: 1px solid rgba(255, 255, 255, 0.12);
}

.aiwf-perf-badge.is-good {
	color: #bbf7d0;
	background: rgba(22, 101, 52, 0.24);
}

.aiwf-perf-badge.is-warn {
	color: #fde68a;
	background: rgba(133, 77, 14, 0.26);
}

.aiwf-perf-badge.is-bad {
	color: #fecaca;
	background: rgba(127, 29, 29, 0.28);
}

.aiwf-perf-grid {
	display: grid;
	grid-template-columns: auto 1fr;
	gap: 6px 12px;
	font-size: 12px;
	line-height: 1.35;
	color: var(--vscode-fg-muted);
}

.aiwf-perf-grid > div:nth-child(2n) {
	color: var(--vscode-fg);
	word-break: break-word;
}

.aiwf-node-compact {
	position: absolute;
	z-index: 4;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 6px;
	padding: 6px;
	border: 1px solid var(--wf-node-border);
	border-radius: 8px;
	background: var(--wf-node-bg);
	box-shadow: var(--wf-node-shadow);
	pointer-events: auto;
	cursor: grab;
	touch-action: none;
	overflow: hidden;
	will-change: transform;
}

.aiwf-node-compact:active {
	cursor: grabbing;
}

.aiwf-node-compact.is-selected {
	border-color: var(--wf-state-selected-border);
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--wf-state-selected-border) 32%, transparent),
		var(--wf-node-shadow-selected);
}

.aiwf-node-compact.is-primary-selected {
	border-color: var(--wf-state-selected-border);
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--wf-state-selected-border) 36%, transparent),
		var(--wf-node-shadow-selected);
}

.aiwf-node-compact.is-secondary-selected {
	border-color: color-mix(in srgb, var(--wf-state-selected-border) 68%, transparent);
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--wf-state-selected-border) 26%, transparent),
		var(--wf-node-shadow);
}

.aiwf-node-compact-preview {
	width: 100%;
	max-height: 80px;
	object-fit: contain;
	border-radius: 4px;
	opacity: 0.95;
}

.aiwf-node-compact.is-running {
	border-color: var(--wf-state-running-border);
}

.aiwf-node-compact.is-error {
	border-color: var(--wf-state-error-border);
}

.aiwf-node-compact.is-media {
	background:
		linear-gradient(
			180deg,
			color-mix(in srgb, var(--wf-info) 20%, transparent),
			rgba(255, 255, 255, 0.02)
		),
		var(--wf-node-bg);
}

.aiwf-node-compact.is-scene {
	background:
		linear-gradient(
			180deg,
			color-mix(in srgb, var(--wf-warning) 20%, transparent),
			rgba(255, 255, 255, 0.02)
		),
		var(--wf-node-bg);
}

.aiwf-node-compact.is-3d {
	background:
		linear-gradient(
			180deg,
			color-mix(in srgb, var(--wf-primary) 18%, transparent),
			rgba(255, 255, 255, 0.02)
		),
		var(--wf-node-bg);
}

.aiwf-node-compact.is-story {
	background:
		linear-gradient(
			180deg,
			color-mix(in srgb, var(--wf-accent) 22%, transparent),
			rgba(255, 255, 255, 0.02)
		),
		var(--wf-node-bg);
}

.aiwf-node-compact-chip {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-height: 18px;
	padding: 0 7px;
	border-radius: 0;
	background: color-mix(in srgb, var(--wf-text) 12%, transparent);
	color: var(--wf-text);
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 0.04em;
	text-transform: uppercase;
}

.aiwf-node-compact-title {
	width: 100%;
	color: var(--wf-text);
	font-size: 12px;
	font-weight: 600;
	line-height: 1.2;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.aiwf-node-compact-meta {
	width: 100%;
	color: var(--wf-text-muted);
	font-size: 10px;
	line-height: 1.2;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.aiwf-node-compact-state {
	display: inline-flex;
	align-items: center;
	min-height: 16px;
	padding: 0 6px;
	border-radius: 0;
	background: color-mix(in srgb, var(--wf-text) 12%, transparent);
	color: var(--wf-text);
	font-size: 10px;
	font-weight: 600;
	line-height: 1;
}

.aiwf-node-compact.is-running .aiwf-node-compact-state {
	background: var(--wf-state-running-bg);
	color: var(--wf-text);
}

.aiwf-node-compact.is-error .aiwf-node-compact-state {
	background: var(--wf-state-error-bg);
	color: var(--wf-text);
}

.aiwf-node-compact-thumb {
	width: 100%;
	aspect-ratio: 4/3;
	border-radius: 4px;
	overflow: hidden;
	background: color-mix(in srgb, var(--wf-text) 6%, transparent);
	flex-shrink: 0;
}

.aiwf-node-compact-thumb-img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
}

.aiwf-node-compact-body {
	display: flex;
	flex-direction: column;
	gap: 3px;
	width: 100%;
}

.aiwf-reuse-alert {
	position: absolute;
	right: 0;
	bottom: 20px;
	z-index: var(--aiwf-alert-z-index, 130);
	width: min(360px, 68vw);
	border: 1px solid var(--dweb-orange);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	box-shadow: var(--vscode-shadow);
	padding: 12px;
}

.aiwf-reuse-alert-title {
	font-size: 13px;
	font-weight: 600;
	margin-bottom: 8px;
}

.aiwf-reuse-alert-body {
	font-size: 12px;
	line-height: 1.5;
	color: var(--vscode-fg-muted);
}

.aiwf-reuse-alert-actions {
	margin-top: 10px;
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}

.aiwf-reuse-alert-btn {
	border: 1px solid var(--vscode-border);
	background: transparent;
	color: var(--vscode-fg);
	padding: 6px 10px;
	cursor: pointer;
}

.aiwf-reuse-alert-btn.primary {
	border-color: var(--dweb-orange);
	color: var(--vscode-fg);
}

.aiwf-reuse-alert-btn:hover {
	border-color: var(--vscode-hover-border);
	background: var(--vscode-hover-bg);
}

.aiwf-import-limit-alert {
	position: absolute;
	right: 0;
	bottom: 20px;
	z-index: var(--aiwf-alert-z-index, 130);
	width: min(380px, 72vw);
	border: 1px solid rgba(220, 86, 86, 0.78);
	background: rgba(220, 86, 86, 0.14);
	color: var(--vscode-fg);
	box-shadow: var(--vscode-shadow);
	padding: 12px;
}

.aiwf-import-limit-alert-title {
	font-size: 13px;
	font-weight: 700;
	margin-bottom: 8px;
}

.aiwf-import-limit-alert-body {
	font-size: 12px;
	line-height: 1.5;
	color: var(--vscode-fg);
}

.aiwf-import-limit-alert-actions {
	margin-top: 10px;
	display: flex;
	justify-content: flex-end;
}

.aiwf-import-limit-alert-btn {
	border: 1px solid rgba(220, 86, 86, 0.9);
	background: transparent;
	color: var(--vscode-fg);
	padding: 6px 12px;
	cursor: pointer;
}

.aiwf-import-limit-alert-btn:hover {
	border-color: var(--vscode-hover-border);
	background: var(--vscode-hover-bg);
}

.aiwf-perf-stats-panel {
	position: absolute;
	top: 52px;
	right: 8px;
	min-width: 180px;
	padding: 8px 10px;
	background: var(--aiwf-perf-panel-bg, var(--dweb-defualt-dark));
	border: 1px solid var(--aiwf-perf-panel-border, var(--vscode-border));
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
	pointer-events: auto;
	font-size: 11px;
	line-height: 1.5;
	color: var(--aiwf-perf-panel-text, var(--vscode-fg));
	user-select: none;
}

.aiwf-perf-stats-title {
	font-weight: 600;
	margin-bottom: 6px;
	padding-bottom: 4px;
	border-bottom: 1px solid var(--aiwf-perf-panel-border, var(--vscode-border));
	font-size: 12px;
}

.aiwf-perf-stats-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 12px;
	padding: 2px 0;
}

.aiwf-perf-stats-sep {
	margin-top: 4px;
	padding-top: 4px;
	border-top: 1px solid var(--aiwf-perf-panel-border, var(--vscode-border));
}

.aiwf-perf-stats-label {
	color: var(--aiwf-perf-panel-label, var(--vscode-fg-dim));
	flex-shrink: 0;
}

.aiwf-perf-stats-value {
	text-align: right;
	font-variant-numeric: tabular-nums;
	font-weight: 500;
}

.aiwf-perf-stats-value.is-good {
	color: var(--aiwf-perf-good, #4ec9b0);
}

.aiwf-perf-stats-value.is-warn {
	color: var(--aiwf-perf-warn, #dcdcaa);
}

.aiwf-perf-stats-value.is-bad {
	color: var(--aiwf-perf-bad, #f14c4c);
}

/* ===== 缺失资产对话框 ===== */
.aiwf-missing-asset-dialog {
	font-size: 13px;
	line-height: 1.6;
	color: var(--vscode-fg);
}
.aiwf-missing-asset-info {
	margin: 10px 0;
	padding: 10px 12px;
	background: var(--vscode-input-background, rgba(0, 0, 0, 0.15));
	border: 1px solid var(--vscode-border);
	border-radius: 4px;
}
.aiwf-missing-asset-row {
	display: flex;
	gap: 6px;
	margin: 4px 0;
	font-size: 12.5px;
}
.aiwf-missing-asset-label {
	flex-shrink: 0;
	color: var(--vscode-descriptionForeground, #888);
	min-width: 70px;
}
.aiwf-missing-asset-value {
	word-break: break-all;
}
.aiewf-mono {
	font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
	font-size: 12px;
}
.aiwf-missing-asset-sources {
	margin: 12px 0;
}
.aiwf-missing-asset-sources-title {
	font-weight: 600;
	margin-bottom: 6px;
}
.aiwf-missing-asset-source-list {
	margin: 0;
	padding-left: 18px;
	max-height: 180px;
	overflow-y: auto;
}
.aiwf-missing-asset-source-list li {
	margin: 3px 0;
	font-size: 12.5px;
}
.aiwf-missing-asset-source-list code {
	font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
	background: var(--vscode-textCodeBlock-background, rgba(0, 0, 0, 0.2));
	padding: 1px 5px;
	border-radius: 3px;
	font-size: 11.5px;
}
.aiwf-source-tag {
	display: inline-block;
	padding: 1px 6px;
	border-radius: 3px;
	background: var(--vscode-badge-background, #4d4d4d);
	color: var(--vscode-badge-foreground, #fff);
	font-size: 11px;
	margin-right: 4px;
}
.aiwf-source-detail {
	color: var(--vscode-descriptionForeground, #888);
	font-size: 11.5px;
}
.aiwf-missing-asset-tip {
	margin: 12px 0 0;
	padding: 8px 10px;
	background: var(--vscode-textBlockQuote-background, rgba(255, 255, 0, 0.05));
	border-left: 3px solid var(--vscode-textBlockQuote-border, #cca700);
	font-size: 12px;
	color: var(--vscode-descriptionForeground, #aaa);
}

/* 撤销移除按钮 */
.aiwf-undo-remove-btn {
	position: fixed;
	bottom: 60px;
	right: 24px;
	z-index: 9999;
	appearance: none;
	-webkit-appearance: none;
	border: 1px solid var(--vscode-button-background, #0e639c);
	background: var(--vscode-button-background, #0e639c);
	color: var(--vscode-button-foreground, #fff);
	padding: 8px 16px;
	border-radius: 6px;
	font-size: 13px;
	cursor: pointer;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	transition: all 0.15s;
}
.aiwf-undo-remove-btn:hover {
	background: var(--vscode-button-hoverBackground, #1177bb);
	transform: translateY(-1px);
}
</style>
