<template>
	<div class="aiwf-page">
		<div v-if="noProjectSelected" class="no-project-guide">
			<div class="no-project-card">
				<h2>{{ t('aiworkflow.page.noProject.title') }}</h2>
				<p>{{ t('aiworkflow.page.noProject.description') }}</p>
				<button
				@click="noProjectSelected = false; void $router.push({ name: 'ProjectList' })"
			>
					{{ t('aiworkflow.page.noProject.goToList') }}
				</button>
			</div>
		</div>
		<!-- 蓝图节点容器 -->
		<div class="aiwf-blueprint-container" :class="{ 'aiwf-viewport-motion': viewportMotionActive }">
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
				@selection-frame-save-template="onSaveSelectionAsTemplate"
				@selection-frame-drag-start="onSelectionFrameDragStart"
				@selection-frame-drag="onSelectionFrameDrag"
				@selection-frame-drag-end="onSelectionFrameDragEnd"
				@selection-frame-delete-selected="onDeleteSelectedNodes"
				v-slot="vp"
			>
				<!-- Canvas2D节点渲染层 (截图节点Canvas渲染) -->
				<NodeCanvasLayer
					ref="nodeCanvasLayerRef"
					:nodes="canvasNodeEntries"
					:viewport="viewport"
					:motion-active="viewportMotionActive"
					:screenshot-pool-provider="canvasScreenshotPoolProvider"
					:theme="themeStore.state.mode"
					@node-click="onCanvasNodeClick"
				/>

				<CanvasAnchorLayer
					:nodes="canvasNodeEntries"
					:viewport="viewport"
					:selected-node-ids="selectedNodeIds"
					:hide-visuals="true"
					:motion-active="viewportMotionActive"
					@start-link="onStartLink($event, vp.screenToWorld)"
					@end-link="onEndLink"
				/>

				<WorkflowEdgeLayer
					:edges="asyncEdgeRenders"
					:selectedEdgeId="selectedEdgeId"
					:draft="asyncDraftRender"
					:motionActive="viewportMotionActive"
					:zoom="viewport.zoom"
					:anchors="canvasAnchorRenderList"
					@select-edge="onSelectEdge"
					@anchor-pointerdown="onCanvasAnchorPointerDown"
				/>

				<div
					v-for="node in safeVisibleRenderNodes"
					:key="node.id"
					class="aiwf-node-host"
					:class="{ 'aiwf-node-host-offscreen': isWarmingUpScreenshots && warmupForceRenderNodeIds.has(String(node.id)) }"
					:ref="
						(el: any) => {
							if (el) nodeHostRefs.set(node.id, el as HTMLElement)
							else nodeHostRefs.delete(node.id)
						}
					"
				>
					<!-- 渲染模式: canvas(由NodeCanvasLayer) | full(选中/激活节点) -->
					<!-- 注意：已移除 'dom-screenshot' 模式，因为它会导致CSS transform在缩放时生效 -->

					<!-- Full node component (用于选中/激活/无截图的节点) -->
					<component
						v-if="getNodeRenderMode(node.id) === 'full'"
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
						@update-model-bindings="onNodeUpdateSceneLayoutModelBindings(node.id, $event)"
						@connect-comfyui="onComfyUIConnect(node.id, $event)"
						@copy="() => onNodeCopy(node.id)"
						@clear-node="() => onNodeClear(node.id)"
						@delete="() => onNodeDelete(node.id)"
						@delete-meshy-task="onNodeDeleteMeshyTask(node.id)"
						@detect-editor="onNodeDetectEditor(node.id)"
						@check-plugin="onNodeCheckPlugin(node.id, $event)"
						@install-plugin="onNodeInstallPlugin(node.id, $event)"
						@set-asset-root-path="onNodeSetAssetRootPath(node.id, $event)"
						@disconnect-unreal="onNodeDisconnect(node.id)"
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
						@open-ark-task-panel="onOpenArkTaskPanel"
						@open-gemini-task-panel="onOpenGeminiTaskPanel"
						@open-tripo3d-task-panel="onOpenTripo3DTaskPanel"
						@generate-tripo3d="onNodeGenerateTripo3D(node.id)"
						@refresh-tripo3d-task="onNodeRefreshTripo3DTask(node.id)"
						@pull-tripo3d-output="onNodePullTripo3DOutput(node.id)"
						@stop-tripo3d-task="onNodeStopTripo3DTask(node.id)"
						@delete-tripo3d-task="onNodeDeleteTripo3DTask(node.id)"
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
						@update:world-position="onNodeDragPosition(node.id, $event)"
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
					:items="i18nCatalogItems"
					:categories="i18nCategories"
					:top-categories="i18nTopCategories"
					:special-groups="i18nSpecialGroups"
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
				:agentMode="agentConversationMode"
				:agentBackend="agentBackend"
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
				:thinkingEffort="chatThinkingEffort"
				:contextUsage="chatContextUsage"
				@send="onSend"
				@stop="onStop"
				@update:agent-mode="agentConversationMode = $event"
				@update:agent-backend="agentBackend = $event"
				@update:local-exec-stream-mode="localExecStreamMode = $event"
				@update:thinking-effort="chatThinkingEffort = $event"
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
				@user-choice-select="handleUserChoiceSelect($event.messageId, $event.choiceIndex, $event.choiceText)"
				@workflow-end-link="onEndLink"
				@request-expand="chatCollapsed = false"
				@request-collapse="chatCollapsed = true"
				@focus-input="chatCollapsed = false"
				@layout-changed="onDockLayoutChanged"
				@safe-area-changed="onDockSafeAreaChanged"
				@locate-node="onFocusNode"
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
					@open-ark-task-panel="onOpenArkTaskPanel"
				@open-gemini-task-panel="onOpenGeminiTaskPanel"
					@open-tripo3d-task-panel="onOpenTripo3DTaskPanel"
					@open-template-center="onOpenTemplateCenter"
				/>

				<TemplateCenterDialog
					v-model:open="templateCenterOpen"
					@apply-template="onTemplateSelectForApply"
					@delete-template="onDeleteTemplate"
					@save-template="onSaveTemplateFromCenter"
				/>

				<TemplateApplyDialog
					v-model:open="templateApplyDialogOpen"
					:template="selectedTemplateForApply"
					@confirm="onConfirmApplyTemplate"
				/>

				<SaveTemplateDialog
					v-model:open="saveTemplateDialogOpen"
					:scope="saveTemplateScope"
					:node-ids="saveTemplateNodeIds"
					:prefill-name="saveTemplatePrefillName"
					:auto-cover-blob="saveTemplateAutoCoverBlob"
					:saving="saveTemplateSaving"
					:progress="saveTemplateProgress"
					@confirm="onConfirmSaveTemplate"
				/>

				<div v-if="performancePriorityMode" class="aiwf-perf-stats-panel">
					<div class="aiwf-perf-stats-title">{{ t('aiworkflow.page.perf.title') }}</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">FPS</span>
						<span class="aiwf-perf-stats-value">{{ perfFpsText }}</span>
					</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">{{ t('aiworkflow.page.perf.frameTime') }}</span>
						<span class="aiwf-perf-stats-value">{{ perfFrameText }}</span>
					</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">{{ t('aiworkflow.page.perf.avgFrame') }}</span>
						<span class="aiwf-perf-stats-value">{{ perfAvgFrameText }}</span>
					</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">{{ t('aiworkflow.page.perf.worstFrame') }}</span>
						<span class="aiwf-perf-stats-value">{{ perfWorstFrameText }}</span>
					</div>
					<div class="aiwf-perf-stats-row aiwf-perf-stats-sep">
						<span class="aiwf-perf-stats-label">{{ t('aiworkflow.page.perf.edgeCompute') }}</span>
						<span class="aiwf-perf-stats-value">{{ perfEdgeComputeText }}</span>
					</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">{{ t('aiworkflow.page.perf.inputEdges') }}</span>
						<span class="aiwf-perf-stats-value">{{ perfEdgeInputCountText }}</span>
					</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">{{ t('aiworkflow.page.perf.renderedEdges') }}</span>
						<span class="aiwf-perf-stats-value">{{ perfEdgeRenderedText }}</span>
					</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">{{ t('aiworkflow.page.perf.culledEdges') }}</span>
						<span class="aiwf-perf-stats-value">{{ perfEdgeCulledText }}</span>
					</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">{{ t('aiworkflow.page.perf.cullRate') }}</span>
						<span class="aiwf-perf-stats-value">{{ perfEdgeCullHitRateText }}</span>
					</div>
					<div class="aiwf-perf-stats-row aiwf-perf-stats-sep">
						<span class="aiwf-perf-stats-label">{{ t('aiworkflow.page.perf.nodes') }}</span>
						<span class="aiwf-perf-stats-value">{{ perfNodeSummary }}</span>
					</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">{{ t('aiworkflow.page.perf.longTasks') }}</span>
						<span class="aiwf-perf-stats-value">{{ perfLongTaskSummary }}</span>
					</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">{{ t('aiworkflow.page.perf.zoom') }}</span>
						<span class="aiwf-perf-stats-value">{{ perfZoomText }}</span>
					</div>
					<div class="aiwf-perf-stats-row">
						<span class="aiwf-perf-stats-label">{{ t('aiworkflow.page.perf.status') }}</span>
						<span
							class="aiwf-perf-stats-value"
							:class="perfHealthClass"
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
					{{ t('aiworkflow.page.inspector.toggle') }}
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

				<Tripo3DTaskPanel
					:open="tripo3dTaskDialogOpen"
					:tasks="tripo3dTaskItems"
					:data-status-text="tripo3dTaskPanelStatusText"
					:balance-text="tripo3dBalanceText"
					:balance-detail="tripo3dBalanceDetail"
					:balance-tone="tripo3dBalanceTone"
					:refresh-busy="tripo3dTaskRemoteLoading"
					:detail-task-id="tripo3dTaskDetailTaskId"
					:detail-task="tripo3dTaskDetail"
					:detail-loading="tripo3dTaskDetailLoading"
					:action-busy-task-id="tripo3dTaskActionBusyTaskId"
					:action-busy-type="tripo3dTaskActionBusyType"
					@close="closeTripo3DTaskDialog"
					@refresh="onRefreshTripo3DTaskPanel"
					@preview-task="onPreviewTripo3DTask"
					@task-action="onTripo3DTaskPanelAction"
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

				<ArkTaskPanel
					:open="arkTaskDialogOpen"
					:tasks="arkTaskItems"
					:refresh-busy="arkTaskRefreshBusy"
					:detail-task-id="arkTaskDetailTaskId"
					:detail-task="arkTaskDetail"
					:detail-loading="arkTaskDetailLoading"
					:downloading-ids="arkTaskDownloading"
					:data-status-text="arkTaskDataStatusText"
					@close="closeArkTaskDialog"
					@refresh="onRefreshArkTaskPanel"
					@preview-task="onPreviewArkTask"
					@task-action="onArkTaskPanelAction"
				/>

				<GeminiTaskPanel
					:open="geminiTaskDialogOpen"
					:tasks="geminiTaskItems"
					:configured="geminiConfigured"
					:refresh-busy="geminiTaskLoading"
					:detail-task-id="geminiTaskDetailTaskId"
					:detail-task="geminiTaskDetail"
					:detail-loading="geminiTaskDetailLoading"
					:action-busy-task-id="geminiTaskActionBusyTaskId"
					:action-busy-type="geminiTaskActionBusyType"
					:data-status-text="geminiTaskPanelStatusText"
					@close="closeGeminiTaskDialog"
					@refresh="onRefreshGeminiTaskPanel"
					@preview-task="onPreviewGeminiTask"
					@task-action="onGeminiTaskPanelAction"
				/>

				<ToastStack :items="toasts" @close="removeToast" @hover="setToastHovering" />
			</div>

			<div class="aiwf-overlay-bottom-left">
				<WorkflowMinimap
					:nodes-by-id="store.state.nodesById"
					:viewport="viewport"
					:canvas-size="canvasViewportSize"
					@update:viewport="onViewportUpdate"
				/>
			</div>

			<div class="aiwf-overlay-alerts" :style="overlayAlertStyle">
				<div v-if="importLimitAlertMessage" class="aiwf-import-limit-alert" @pointerdown.stop>
					<div class="aiwf-import-limit-alert-title">{{ t('aiworkflow.page.importLimit.title') }}</div>
					<div class="aiwf-import-limit-alert-body">{{ importLimitAlertMessage }}</div>
					<div class="aiwf-import-limit-alert-actions">
						<button
							class="aiwf-import-limit-alert-btn"
							type="button"
							@click="onConfirmImportLimitAlert"
						>
							{{ t('aiworkflow.page.importLimit.confirm') }}
						</button>
					</div>
				</div>

				<div v-if="reuseRecordConfirm" class="aiwf-reuse-alert" @pointerdown.stop>
					<div class="aiwf-reuse-alert-title">{{ t('aiworkflow.page.reuseRecord.title') }}</div>
					<div class="aiwf-reuse-alert-body">
						{{ t('aiworkflow.page.reuseRecord.template', { name: reuseRecordConfirm.workflowName || t('aiworkflow.page.reuseRecord.unknownTemplate') }) }}
						<br />
						{{ t('aiworkflow.page.reuseRecord.savedAt', { time: formatReuseRecordTime(reuseRecordConfirm.savedAt) }) }}
					</div>
					<div class="aiwf-reuse-alert-actions">
						<button class="aiwf-reuse-alert-btn" type="button" @click="onCancelReuseRecord">
							{{ t('aiworkflow.page.reuseRecord.cancel') }}
						</button>
						<button
							class="aiwf-reuse-alert-btn primary"
							type="button"
							@click="onConfirmReuseRecord"
						>
							{{ t('aiworkflow.page.reuseRecord.confirm') }}
						</button>
					</div>
				</div>

				<div v-if="meshyTextureConfirm" class="aiwf-reuse-alert" @pointerdown.stop>
					<div class="aiwf-reuse-alert-title">{{ t('aiworkflow.page.meshyTexture.title') }}</div>
					<div class="aiwf-reuse-alert-body">
						{{ t('aiworkflow.page.meshyTexture.noNewPrompt') }}
						<br />
						{{ t('aiworkflow.page.meshyTexture.willReuse') }}
					</div>
					<div class="aiwf-reuse-alert-actions">
						<button class="aiwf-reuse-alert-btn" type="button" @click="cancelMeshyTextureConfirm">
							{{ t('aiworkflow.page.reuseRecord.cancel') }}
						</button>
						<button
							class="aiwf-reuse-alert-btn primary"
							type="button"
							@click="confirmMeshyTextureFollowup"
						>
							{{ t('aiworkflow.page.meshyTexture.confirm') }}
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
				:title="t('aiworkflow.page.screenshotWarmup.title')"
				:detail="screenshotWarmupDetail || t('aiworkflow.page.screenshotWarmup.detail')"
				:progress="screenshotWarmupProgress"
				:cancellable="false"
			/>

			<ThemeWarmupProgress
				:visible="themeWarmupOpen"
				:title="t('aiworkflow.page.themeWarmup.title', { theme: themeWarmupThemeLabel })"
				:detail="themeWarmupDetail"
				:progress="themeWarmupProgress"
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

		<ModalDialog
			:open="warmupConfirmDialogOpen"
			:title="t('aiworkflow.page.warmupConfirm.title')"
			:confirmText="t('aiworkflow.page.warmupConfirm.confirmText')"
			:closeText="t('aiworkflow.page.warmupConfirm.closeText')"
			:zIndex="10000"
			@confirm="onConfirmForceWarmup"
			@close="onCancelUseCache"
		>
			<div class="aiwf-warmup-confirm-dialog">
				<p style="margin-top: 0">
					{{ t('aiworkflow.page.warmupConfirm.question') }}
				</p>
				<p style="margin-bottom: 0; color: var(--text-secondary, #666); font-size: 13px;">
					{{ t('aiworkflow.page.warmupConfirm.yesDesc') }}<br/>
					{{ t('aiworkflow.page.warmupConfirm.noDesc') }}
				</p>
			</div>
		</ModalDialog>

		<!-- 缺失资产确认对话框 -->
		<ModalDialog
			:open="missingAssetDialogOpen"
			:title="t('aiworkflow.page.missingAsset.title')"
			:confirmText="t('aiworkflow.page.missingAsset.confirmText')"
			:closeText="t('aiworkflow.page.missingAsset.closeText')"
			@confirm="onConfirmRemoveMissingAsset"
			@close="onCancelMissingAssetDialog"
		>
			<div v-if="missingAssetDialogPending" class="aiwf-missing-asset-dialog">
				<p style="margin-top: 0">
					{{ t('aiworkflow.page.missingAsset.description1') }}
					{{ t('aiworkflow.page.missingAsset.description2') }}
				</p>
				<div class="aiwf-missing-asset-info">
					<div class="aiwf-missing-asset-row">
						<span class="aiwf-missing-asset-label">{{ t('aiworkflow.page.missingAsset.assetName') }}</span>
						<span class="aiwf-missing-asset-value">
							<strong>{{ missingAssetDialogPending.assetName }}</strong>
						</span>
					</div>
					<div class="aiwf-missing-asset-row">
						<span class="aiwf-missing-asset-label">{{ t('aiworkflow.page.missingAsset.requestedPath') }}</span>
						<span class="aiwf-missing-asset-value aiewf-mono">
							{{ missingAssetDialogPending.requestedPath }}
						</span>
					</div>
					<div v-if="missingAssetDialogPending.absolutePath" class="aiwf-missing-asset-row">
						<span class="aiwf-missing-asset-label">{{ t('aiworkflow.page.missingAsset.absolutePath') }}</span>
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
						{{ t('aiworkflow.page.missingAsset.sourcesTitle', { count: String(missingAssetDialogPending.sources.length) }) }}
					</div>
					<ul class="aiwf-missing-asset-source-list">
						<li v-for="(s, i) in missingAssetDialogPending.sources" :key="i">
							<span class="aiwf-source-tag">{{ sourceTypeLabel(s.type) }}</span>
							<span v-if="s.nodeId">
								{{ t('aiworkflow.page.missingAsset.node') }}
								<code>{{ s.nodeId }}</code>
								<span v-if="s.nodeType">（{{ s.nodeType }}）</span>
							</span>
							<span v-if="s.resourceId">
								{{ t('aiworkflow.page.missingAsset.resource') }}
								<code>{{ s.resourceId }}</code>
							</span>
							<span v-if="s.field">
								{{ t('aiworkflow.page.missingAsset.field') }}
								<code>{{ s.field }}</code>
							</span>
							<span v-if="s.detail" class="aiwf-source-detail">— {{ s.detail }}</span>
						</li>
					</ul>
				</div>

				<p class="aiwf-missing-asset-tip">
					{{ t('aiworkflow.page.missingAsset.tipRemove') }}
					{{ t('aiworkflow.page.missingAsset.tipLater') }}
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
			{{ t('aiworkflow.page.undoRemove') }}
		</button>
	</div>
</template>

<script setup lang="ts">
import { useI18n } from '../../i18n'
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
import NodeCanvasLayer from './components/NodeCanvasLayer.vue'
import ThemeWarmupProgress from './components/ThemeWarmupProgress.vue'
import CanvasAnchorLayer from './components/CanvasAnchorLayer.vue'
import WorkflowMinimap from './components/WorkflowMinimap.vue'
import AnchorTooltip from '../../ui/WorkFlow/AnchorTooltip.vue'
import BlueprintProjectToolbar, {
	type BlueprintProjectListItem
} from '../../ui/WorkFlow/BlueprintProjectToolbar.vue'
import TemplateCenterDialog from '../../ui/WorkFlow/TemplateCenterDialog.vue'
import TemplateApplyDialog from '../../ui/WorkFlow/TemplateApplyDialog.vue'
import SaveTemplateDialog from '../../ui/WorkFlow/SaveTemplateDialog.vue'
import type { SaveTemplateConfirmPayload } from '../../ui/WorkFlow/SaveTemplateDialog.vue'
import type { TemplateItem, TemplateApplyOptions } from '../../aiworkflow/template/types'
import { useTemplateCenter } from '../../aiworkflow/template/useTemplateCenter'
import {
	buildSnapshotFromSelection,
	buildFullSnapshot,
	mergeTemplateSnapshot,
	createTemplatePackageZip,
	parseTemplatePackageBlob,
	getViewportCenterInWorld,
	calculateTemplatePlacement,
	calculateNodeBounds,
	captureNodesAsCoverBlob,
	importTemplateAssetsToProject,
	remapTemplateAssetUrls
} from '../../aiworkflow/template/useTemplateMerge'
import MeshyTaskPanel, {
	type MeshyTaskPanelAction,
	type MeshyTaskPanelDetail,
	type MeshyTaskPanelItem
} from '../../ui/WorkFlow/MeshyTaskPanel.vue'
import Tripo3DTaskPanel from '../../ui/WorkFlow/Tripo3DTaskPanel.vue'
import type {
	Tripo3DTaskPanelAction,
	Tripo3DTaskPanelDetail,
	Tripo3DTaskPanelItem
} from './node-business/tripo3d/types'
import VideoTaskPanel from '../../ui/WorkFlow/VideoTaskPanel.vue'
import ArkTaskPanel, {
	type ArkTaskPanelDetail,
	type ArkTaskPanelItem
} from '../../ui/WorkFlow/ArkTaskPanel.vue'
import GeminiTaskPanel, {
	type GeminiTaskPanelAction,
	type GeminiTaskPanelDetail,
	type GeminiTaskPanelItem
} from '../../ui/WorkFlow/GeminiTaskPanel.vue'
import WorkflowInspectorPanel from '../../ui/UIComponent/WorkflowInspectorPanel.vue'
import BottomChatDock, {
	type BottomChatMessage,
	type LocalExecFlowEvent,
	type LocalExecSessionItem,
	type NanoBananaConfig,
	type SeedanceConfig,
	type AgentBackendType
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
	WorkflowSceneLayoutManualModelBinding,
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
import { ThemeKey } from '../../store/theme'
import type { ThemeMode } from '../../store/theme'
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
	agentListConversations,
	agentCreateConversation,
	agentDeleteConversation,
	agentGetConversationMessages
} from '../../network/AgentChatService'
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
	invalidateDocumentStyleCache,
	SCREENSHOT_PADDING,
	type ScreenshotCacheEntry,
	type ScreenshotPriority,
	type VisibleNodeEntry
} from './node-screenshot'
// Canvas2D渲染模块
import { useAIWorkflowCanvasScreenshot } from './blueprint-core/useAIWorkflowCanvasScreenshot'
import {
	loadAllScreenshotsForBlueprint,
	saveScreenshotToDisk,
	cleanupOldScreenshots,
	makeDiskCacheKey
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
import {
	buildTripo3DNodePresentationSettings,
	getTripo3DDisplayThumbnailUrl,
	getTripo3DEffectiveModelSource,
	isTripo3DRemoteUrl,
	pickTripo3DEffectiveOutput,
	pickTripo3DPreferredModelUrl
} from './node-business/tripo3d/useAIWorkflowTripo3DAssets'
import { useAIWorkflowMeshyDrop } from './node-business/meshy/useAIWorkflowMeshyDrop'
import { useAIWorkflowMeshyCommands } from './node-business/meshy/useAIWorkflowMeshyCommands'
import { useAIWorkflowMeshyInputResolver } from './node-business/meshy/useAIWorkflowMeshyInputResolver'
import { useAIWorkflowMeshyRequest } from './node-business/meshy/useAIWorkflowMeshyRequest'
import { useAIWorkflowMeshyTaskPanelController } from './node-business/meshy/useAIWorkflowMeshyTaskPanelController'
import { useAIWorkflowMeshyRuntime } from './node-business/meshy/useAIWorkflowMeshyRuntime'
import { useAIWorkflowTripo3DTaskPanelController } from './node-business/tripo3d/useAIWorkflowTripo3DTaskPanelController'
import { useAIWorkflowTripo3DCommands } from './node-business/tripo3d/useAIWorkflowTripo3DCommands'
import { useAIWorkflowTripo3DRuntime } from './node-business/tripo3d/useAIWorkflowTripo3DRuntime'
import { useAIWorkflowTripo3DRequest } from './node-business/tripo3d/useAIWorkflowTripo3DRequest'
import { useAIWorkflowTripo3DInputResolver } from './node-business/tripo3d/useAIWorkflowTripo3DInputResolver'
import { useAIWorkflowVideoTaskPanelController } from './node-business/chat/useAIWorkflowVideoTaskPanelController'
import { useAIWorkflowArkTaskPanel } from './node-business/ark/useAIWorkflowArkTaskPanel'
import { useAIWorkflowGeminiTaskPanelController } from './node-business/gemini/useAIWorkflowGeminiTaskPanelController'
import {
	fileExtensionFromUrl,
	normalizeMeshyTaskStatus
} from './node-business/meshy/meshyRuntimeUtils'
import { normalizeTripo3DTaskStatus, fileExtensionFromUrl as tripo3dFileExtensionFromUrl } from './node-business/tripo3d/tripo3dRuntimeUtils'
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
import { useAgentToolBridge, type ToolApprovalItem } from './node-business/chat/useAgentToolBridge'
import { useNodeLibraryI18n } from '../../aiworkflow/useNodeLibraryI18n'
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
		agent?: {
			stream?: (payload: unknown) => AsyncGenerator<unknown>
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
const { t } = useI18n()
const {
	categories: i18nCategories,
	topCategories: i18nTopCategories,
	specialGroups: i18nSpecialGroups,
	catalogItems: i18nCatalogItems,
} = useNodeLibraryI18n()
const themeStore = useStore<{ mode: ThemeMode }>(ThemeKey)
ensureAIWorkflowHistory()

const AIWF_LAST_PROJECT_STORAGE_KEY = 'dweb.aiworkflow.lastProjectId.v1'

const { viewport, onViewportUpdate, viewportMotionActive, markViewportMotion, forceEndViewportMotion, canvasViewportSize } =
	useAIWorkflowViewport(store, {
		canvasSelector: '.aiwf-canvas',
		motionResetMs: 140
	})

const performancePriorityMode = ref(false)
const screenshotAnchorsEnabled = ref(true)
const screenshotParticlesEnabled = ref(true)
// Canvas2D截图渲染开关 (默认开启)
const canvasScreenshotEnabled = ref(true)
const canvasScreenshotDebugMode = ref(false)
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
const chatThinkingEffort = ref<'disabled' | 'low' | 'medium' | 'high'>('medium')
const chatContextUsage = ref<{ tokenCount: number; budget: number; usage: number; truncated?: boolean } | null>(null)
const agentConversationMode = ref<'agent' | 'ask' | 'plan'>('agent')
const agentBackend = ref<AgentBackendType>('dvsagent')
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
	const fallbackLabel = direction === 'in' ? t('aiworkflow.page.anchor.input') : t('aiworkflow.page.anchor.output')
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
		label: t('aiworkflow.page.nanoAnchor.refImageLabel', { index: String(i + 1) }),
		mediaType: 'image'
	}))
	const node: WorkflowNode = {
		id: NANO_ANCHOR_NODE_ID,
		type: existing?.type || 'base',
		title: t('aiworkflow.page.nanoAnchor.title'),
		alias: existing?.alias,
		subtitle: t('aiworkflow.page.nanoAnchor.subtitle'),
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
const pendingScreenshotNodeIds = ref<Set<string>>(new Set())
const nearDragNodeIds = ref<Set<string>>(new Set())
const panningFullRenderSnapshot = ref<Set<string> | null>(null)
const selectionFrameDragging = ref(false)
const selectionFrameDragNodeIds = ref<Set<string>>(new Set())
const selectionDragFullRenderIds = ref<Set<string>>(new Set())
const selectionDragMoveTick = ref(0)
const stableLinkHoverNodeId = ref<string>('')
let linkHoverStableTimer: ReturnType<typeof setTimeout> | null = null
const LINK_HOVER_STABLE_DELAY_MS = 400
const MAX_SELECTED_NODES_FOR_FULL_RENDER = 40

const warmupConfirmDialogOpen = ref(false)

const themeWarmupOpen = ref(false)
const themeWarmupProgress = ref(0)
const themeWarmupDetail = ref('')
const themeWarmupTargetTheme = ref<'dark' | 'light'>('dark')
const themeWarmupThemeLabel = computed(() =>
	t(themeWarmupTargetTheme.value === 'light' ? 'aiworkflow.page.themeWarmup.lightLabel' : 'aiworkflow.page.themeWarmup.darkLabel')
)
let themeWarmupAbortController: AbortController | null = null

const autoWireInProgress = ref(false)
const autoWireSourceNodeId = ref<string | null>(null)
const autoWireCreatedNodeIds = ref<string[]>([])

const onAutoWireStart = (sourceNodeId: string) => {
	autoWireInProgress.value = true
	autoWireSourceNodeId.value = sourceNodeId
	autoWireCreatedNodeIds.value = []
	screenshotWarmupOpen.value = true
	screenshotWarmupProgress.value = 0
	screenshotWarmupDetail.value = t('aiworkflow.page.autoWire.generating')
}

const onAutoWireNodeCreated = (nodeId: string) => {
	autoWireCreatedNodeIds.value.push(nodeId)
	const count = autoWireCreatedNodeIds.value.length
	screenshotWarmupDetail.value = t('aiworkflow.page.autoWire.progress', { count: String(count) })
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
	forceRenderNodeIds: warmupForceRenderNodeIds,
	invalidateTick: selectionDragMoveTick
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

// Canvas2D截图渲染模块
const {
	state: canvasScreenshotState,
	init: initCanvasScreenshot,
	warmupAll: warmupCanvasAll,
	hasBitmap,
	getBitmap,
	getEntry: getCanvasEntry,
	invalidate: invalidateCanvasScreenshot,
	clearAll: clearAllCanvasScreenshots,
	cancelPending: cancelCanvasWarmup,
	loadScreenshot: loadScreenshotToCanvas,
	dispose: disposeCanvasScreenshot,
	setActiveTheme: setCanvasActiveTheme
} = useAIWorkflowCanvasScreenshot({
	maxBitmapCount: 500,
	maxMemoryMB: 200,
	concurrency: (() => {
		try {
			const cores = navigator.hardwareConcurrency || 4
			return Math.min(12, Math.max(6, cores))
		} catch {
			return 8
		}
	})()
})

// NodeCanvasLayer组件引用
const nodeCanvasLayerRef = ref<InstanceType<typeof NodeCanvasLayer> | null>(null)

// Canvas截图池引用 (用于传递给NodeCanvasLayer)
// 注意：始终有值，不会为null
const canvasScreenshotPool = shallowRef<{
	getEntry: (nodeId: string, theme?: 'dark' | 'light') => { bitmap: ImageBitmap | HTMLCanvasElement; width: number; height: number } | null
	setActiveTheme: (theme: 'dark' | 'light') => void
}>({
	getEntry: () => null,
	setActiveTheme: () => {}
})

const canvasScreenshotPoolProvider = () => canvasScreenshotPool.value

// 初始化Canvas截图池引用
const initCanvasScreenshotPool = () => {
	const currentTheme = themeStore.state.mode as 'dark' | 'light'
	screenshotPool.setActiveTheme(currentTheme)
	setCanvasActiveTheme(currentTheme)
	canvasScreenshotPool.value = {
		getEntry: (nodeId: string, theme?: 'dark' | 'light') => {
			const entry = getCanvasEntry(nodeId, theme)
			if (!entry) return null
			return {
				bitmap: entry.bitmap,
				width: entry.width,
				height: entry.height
			}
		},
		setActiveTheme: (theme: 'dark' | 'light') => {
			screenshotPool.setActiveTheme(theme)
			setCanvasActiveTheme(theme)
		}
	}
}

// Canvas节点数据 (用于NodeCanvasLayer渲染)
const canvasScreenshotRefreshTick = ref(0)
let cachedCanvasNodeEntries: Array<{
	id: string
	worldX: number
	worldY: number
	width: number
	height: number
	radius?: number
	inputs?: WorkflowAnchorSpec[]
	outputs?: WorkflowAnchorSpec[]
}> = []
let lastCanvasEntriesSignature = ''

const buildCanvasNodeEntriesSignature = () => {
	const fullRenderIds = Array.from(effectiveFullRenderNodeIds.value).sort().join('|')
	const dragIds = Array.from(selectionFrameDragNodeIds.value).sort().join('|')
	return `${canvasScreenshotRefreshTick.value}:${fullRenderIds}:${renderNodes.value.length}:${canvasScreenshotEnabled.value}:${selectionDragMoveTick.value}:${dragIds}:${selectionFrameDragging.value ? '1' : '0'}`
}

const canvasNodeEntries = computed(() => {
	void canvasScreenshotRefreshTick.value
	void selectionDragMoveTick.value
	if (!canvasScreenshotEnabled.value) return []

	const signature = buildCanvasNodeEntriesSignature()
	if (signature === lastCanvasEntriesSignature && cachedCanvasNodeEntries.length > 0) {
		return cachedCanvasNodeEntries
	}

	const allNodes = renderNodes.value
	const fullRenderSet = effectiveFullRenderNodeIds.value
	const dragNodeIds = selectionFrameDragNodeIds.value
	const isDragging = selectionFrameDragging.value && dragNodeIds.size > 0
	const result: typeof cachedCanvasNodeEntries = []

	const vp = viewport.value
	const vpWidth = canvasViewportSize.value.width
	const vpHeight = canvasViewportSize.value.height
	const zoom = Math.max(0.01, Number(vp.zoom) || 1)
	const centerX = vpWidth / 2
	const centerY = vpHeight / 2
	const viewLeft = (-centerX - vp.panX) / zoom - 50 / zoom
	const viewRight = (vpWidth - centerX - vp.panX) / zoom + 50 / zoom
	const viewTop = (-centerY - vp.panY) / zoom - 50 / zoom
	const viewBottom = (vpHeight - centerY - vp.panY) / zoom + 50 / zoom

	const isInViewport = (node: WorkflowNode) => {
		const halfW = Math.max(0, Number(node.width) || 240) / 2
		const halfH = Math.max(0, Number(node.height) || 160) / 2
		const nl = node.worldX - halfW
		const nr = node.worldX + halfW
		const nt = node.worldY - halfH
		const nb = node.worldY + halfH
		return nr >= viewLeft && nl <= viewRight && nb >= viewTop && nt <= viewBottom
	}

	for (const node of allNodes) {
		const nodeId = String(node.id ?? '').trim()
		if (!nodeId) continue

		const isDraggedNode = isDragging && dragNodeIds.has(nodeId)
		const draggedNodeInViewport = isDraggedNode && isInViewport(node)

		if (fullRenderSet.has(nodeId) && !draggedNodeInViewport) continue

		result.push({
			id: nodeId,
			worldX: node.worldX,
			worldY: node.worldY,
			width: node.width || 240,
			height: node.height || 160,
			radius: 8,
			inputs: node.inputs,
			outputs: node.outputs
		})
	}

	cachedCanvasNodeEntries = result
	lastCanvasEntriesSignature = signature
	return result
})

// 刷新Canvas节点层，强制全量重绘
const refreshCanvasNodeLayer = () => {
	canvasScreenshotRefreshTick.value++
	nextTick(() => {
		nodeCanvasLayerRef.value?.markDirty()
	})
}

// 判断节点是否有Canvas截图可以用于Canvas渲染
const hasCanvasScreenshot = (nodeId: string): boolean => {
	return canvasScreenshotEnabled.value && hasBitmap(nodeId)
}

// 节点渲染模式: 'canvas' | 'full'
// 注意：已移除 'dom-screenshot' 模式，因为它会导致CSS transform在缩放时生效
type NodeRenderMode = 'canvas' | 'full'

// 判断节点应该使用哪种渲染模式
const getNodeRenderMode = (nodeId: string): NodeRenderMode => {
	if (effectiveFullRenderNodeIds.value.has(nodeId)) {
		return 'full'
	}

	if (canvasScreenshotEnabled.value) {
		return 'canvas'
	}

	return 'full'
}

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
	// 连线过程中（isLinking为true），锁定所有节点为Canvas渲染模式
	// 锚点交互完全由 WorkflowEdgeLayer (canvas层) + linkInteraction 处理
	// 无论节点之前是DOM模式还是canvas模式，连线期间一律使用canvas锚点
	// 彻底避免节点在canvas/DOM模式间切换导致的闪烁
	// ==========================================
	if (isLinking.value) {
		const lockedIds = new Set<string>()
		if (nodeChatDialog.value.visible && nodeChatDialog.value.nodeId) {
			const chatNodeId = String(nodeChatDialog.value.nodeId).trim()
			if (chatNodeId) lockedIds.add(chatNodeId)
		}
		for (const id of pendingScreenshotNodeIds.value) {
			const nid = String(id ?? '').trim()
			if (nid) lockedIds.add(nid)
		}
		return lockedIds
	}

	if (panningFullRenderSnapshot.value) {
		const snapshotWithPending = new Set(panningFullRenderSnapshot.value)
		for (const id of pendingScreenshotNodeIds.value) {
			const nid = String(id ?? '').trim()
			if (nid) snapshotWithPending.add(nid)
		}
		const nodesByIdForPan = store.state.nodesById as Record<string, WorkflowNode | undefined>
		let selectedAddedForPan = 0
		for (const id of selectedNodeIds.value) {
			const nid = String(id ?? '').trim()
			if (!nid) continue
			if (snapshotWithPending.has(nid)) {
				continue
			}
			if (selectedNodeIds.value.length > MAX_SELECTED_NODES_FOR_FULL_RENDER) {
				const node = nodesByIdForPan[nid]
				if (!node || !isNodeInViewport(node)) {
					continue
				}
			}
			if (selectedAddedForPan < MAX_SELECTED_NODES_FOR_FULL_RENDER) {
				snapshotWithPending.add(nid)
				selectedAddedForPan++
			}
		}
		if (nodeChatDialog.value.visible && nodeChatDialog.value.nodeId) {
			const chatNodeId = String(nodeChatDialog.value.nodeId).trim()
			if (chatNodeId) snapshotWithPending.add(chatNodeId)
		}
		return snapshotWithPending
	}

	// ==========================================
	// Step 1: 核心激活节点（用户直接交互的节点）+ 预热强制渲染节点 + 待截图节点
	// 选中节点超过40个时，仅激活视口内的节点且不超过40个，避免性能问题
	// ==========================================
	const coreIds = new Set<string>()
	const nodesById = store.state.nodesById as Record<string, WorkflowNode | undefined>

	if (selectedNodeIds.value.length <= MAX_SELECTED_NODES_FOR_FULL_RENDER) {
		for (const id of selectedNodeIds.value) {
			const nid = String(id ?? '').trim()
			if (nid) coreIds.add(nid)
		}
	} else {
		let selectedAdded = 0
		for (const id of selectedNodeIds.value) {
			const nid = String(id ?? '').trim()
			if (!nid) continue
			const node = nodesById[nid]
			if (node && isNodeInViewport(node)) {
				if (selectedAdded < MAX_SELECTED_NODES_FOR_FULL_RENDER) {
					coreIds.add(nid)
					selectedAdded++
				}
			}
		}
	}

	for (const id of warmupForceRenderNodeIds.value) {
		const nid = String(id ?? '').trim()
		if (nid) coreIds.add(nid)
	}

	for (const id of pendingScreenshotNodeIds.value) {
		const nid = String(id ?? '').trim()
		if (nid) coreIds.add(nid)
	}

	const linkFromId = linkingFromNodeId.value
	if (linkFromId) coreIds.add(String(linkFromId))

	const linkHoverId = stableLinkHoverNodeId.value
	if (linkHoverId) {
		const nid = String(linkHoverId).trim()
		if (nid) coreIds.add(nid)
	}

	if (nodeChatDialog.value.visible && nodeChatDialog.value.nodeId) {
		const chatNodeId = String(nodeChatDialog.value.nodeId).trim()
		if (chatNodeId) coreIds.add(chatNodeId)
	}

	if (coreIds.size === 0) return coreIds

	// ==========================================
	// Step 2: 直接邻居节点（仅一层，绝不传递）
	// ==========================================
	const result = new Set<string>(coreIds)

	for (const edge of edges.value) {
		const fromId = String(edge?.fromNodeId ?? '').trim()
		const toId = String(edge?.toNodeId ?? '').trim()
		if (!fromId || !toId) continue

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

	return result
})

// 节点拖拽优化：多选框拖拽时，将被拖拽节点切换为canvas轻量绘制模式
const effectiveFullRenderNodeIds = computed<Set<string>>(() => {
	const baseIds = fullRenderNodeIds.value
	const dragFullIds = selectionDragFullRenderIds.value

	if (!selectionFrameDragging.value || selectionFrameDragNodeIds.value.size === 0) {
		return baseIds
	}

	// 拖拽期间，排除被拖拽的节点，但保留：
	// - 有聊天对话框打开的节点
	// - 待截图的节点
	// - 视口内没有截图缓存需要临时完整渲染的节点
	const chatNodeId = nodeChatDialog.value.visible ? String(nodeChatDialog.value.nodeId).trim() : ''
	const pendingIds = pendingScreenshotNodeIds.value

	const result = new Set<string>()
	for (const id of baseIds) {
		if (selectionFrameDragNodeIds.value.has(id)) {
			if (id === chatNodeId || pendingIds.has(id) || dragFullIds.has(id)) {
				result.add(id)
			}
		} else {
			result.add(id)
		}
	}
	for (const id of dragFullIds) {
		result.add(id)
	}
	return result
})

const getNodeScreenshotVersion = (node: WorkflowNode, theme?: 'dark' | 'light'): string => {
	const targetTheme = theme ?? (themeStore.state.mode as 'dark' | 'light')
	const parts: string[] = []
	parts.push(`theme:${targetTheme}`)
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
	priority: ScreenshotPriority = 'normal',
	allowFullRender: boolean = false
) => {
	const nodeId = String(node?.id ?? '').trim()
	if (!nodeId) return
	if (!allowFullRender && selectedNodeIds.value.includes(nodeId)) return
	if (!allowFullRender && fullRenderNodeIds.value.has(nodeId)) return

	const hostEl = nodeHostRefs.get(nodeId)
	if (!hostEl) {
		if (retryCount < 3) {
			setTimeout(() => scheduleNodeScreenshot(node, retryCount + 1, priority, allowFullRender), 100)
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
			const activeTheme = themeStore.state.mode as 'dark' | 'light'
			invalidateCanvasScreenshot(nodeId, activeTheme)
			try {
				await loadScreenshotToCanvas(entry)
			} catch {}
			initCanvasScreenshotPool()
			refreshCanvasNodeLayer()
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
		const pendingBitmapLoads: Promise<void>[] = []
		for (const node of unselectedNodes) {
			if (scheduled >= 3) break
			const nodeId = node.id
			const version = getNodeScreenshotVersion(node)
			const cached = screenshotPool.getCachedScreenshot(nodeId, version)
			if (cached) {
				const newMap = new Map(nodeScreenshotMap.value)
				newMap.set(nodeId, cached)
				nodeScreenshotMap.value = newMap
				const activeTheme = themeStore.state.mode as 'dark' | 'light'
				if (!hasBitmap(nodeId, activeTheme)) {
					invalidateCanvasScreenshot(nodeId, activeTheme)
					const loadPromise = (async () => {
						try {
							await loadScreenshotToCanvas(cached)
						} catch {}
						initCanvasScreenshotPool()
						refreshCanvasNodeLayer()
					})()
					pendingBitmapLoads.push(loadPromise)
				}
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

const warmupAllNodeScreenshots = async (forceRecapture: boolean = false) => {
	const allNodes = nodes.value.filter((n) => {
		const nodeId = String(n?.id ?? '').trim()
		return nodeId
	})
	console.log('[Screenshot Warmup] warmupAllNodeScreenshots called, forceRecapture:', forceRecapture, 'allNodes count:', allNodes.length, 'selectedNodeIds:', selectedNodeIds.value)
	if (allNodes.length === 0) return

	const currentTheme = themeStore.state.mode as 'dark' | 'light'
	screenshotPool.setActiveTheme(currentTheme)
	setCanvasActiveTheme(currentTheme)

	const validNodeIds = new Set(allNodes.map((n) => String(n.id)))
	screenshotPool.pruneToValidNodes(validNodeIds)

	screenshotWarmupOpen.value = true
	screenshotWarmupProgress.value = 0
	screenshotWarmupDetail.value = forceRecapture ? t('aiworkflow.page.warmup.prepareRecapture') : t('aiworkflow.page.warmup.preparing')

	const cacheCtx = getScreenshotCacheContext()
	void cleanupOldScreenshots(7 * 24 * 60 * 60 * 1000)

	await nextTick()

	const visibleNodeIds = new Set(safeVisibleRenderNodes.value.map((n) => String(n.id)))

	const newMap = new Map<string, ScreenshotCacheEntry>()

	let diskLoadedCount = 0
	if (!forceRecapture) {
		screenshotWarmupProgress.value = 0.03
		screenshotWarmupDetail.value = t('aiworkflow.page.warmup.readingDiskCache')
		try {
			const diskCache = await loadAllScreenshotsForBlueprint(cacheCtx.projectId, cacheCtx.blueprintId)
			const totalNodes = allNodes.length
			const currentTheme = themeStore.state.mode as 'dark' | 'light'
			const otherTheme: 'dark' | 'light' = currentTheme === 'dark' ? 'light' : 'dark'
			for (let i = 0; i < totalNodes; i++) {
				const node = allNodes[i]
				const nodeId = node.id
				for (const theme of ['dark', 'light'] as const) {
					const version = getNodeScreenshotVersion(node, theme)
					const diskEntry = diskCache.get(makeDiskCacheKey(nodeId, theme))
					if (diskEntry && diskEntry.version === version && diskEntry.dataUrl) {
						screenshotPool.prefillCache(
							nodeId,
							version,
							diskEntry.dataUrl,
							diskEntry.width,
							diskEntry.height,
							SCREENSHOT_PADDING
						)
						if (theme === currentTheme) {
							const screenshotEntry: ScreenshotCacheEntry = {
								nodeId,
								version,
								theme,
								dataUrl: diskEntry.dataUrl,
								width: diskEntry.width,
								height: diskEntry.height,
								padding: SCREENSHOT_PADDING,
								capturedAt: Date.now()
							}
							newMap.set(nodeId, screenshotEntry)
						}
						diskLoadedCount++
					}
				}
				if (i % 10 === 0 || i === totalNodes - 1) {
					const ratio = totalNodes > 0 ? (i + 1) / totalNodes : 1
					screenshotWarmupProgress.value = 0.03 + ratio * 0.06
					screenshotWarmupDetail.value = t('aiworkflow.page.warmup.diskCacheLoading', { loaded: String(diskLoadedCount), totalNodes: String(totalNodes * 2) })
					if (i % 20 === 0) await new Promise<void>(r => requestAnimationFrame(() => r()))
				}
			}
		} catch (err) {
			console.warn('[Screenshot Warmup] load from disk failed:', err)
		}
	}

	const nodesNeedingCapture: WorkflowNode[] = []
	for (const node of allNodes) {
		const nodeId = node.id
		if (forceRecapture) {
			nodesNeedingCapture.push(node)
			continue
		}
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
	const cachedCount = allNodes.length - total

	console.log('[Screenshot Warmup] stats:', {
		allNodes: allNodes.length,
		selectedNodes: selectedNodeIds.value.length,
		diskLoaded: diskLoadedCount,
		poolCached: cachedCount - diskLoadedCount,
		needCapture: total,
		newMapSize: newMap.size,
		allNodeIds: allNodes.map(n => n.id),
		needCaptureIds: nodesNeedingCapture.map(n => n.id)
	})

	nodeScreenshotMap.value = newMap

	if (total === 0) {
		await nextTick()
		await waitForFrames(1)
		screenshotWarmupProgress.value = 0.1
		screenshotWarmupDetail.value = t('aiworkflow.page.warmup.loadingCanvas', { count: String(newMap.size) })
		await warmupCanvasAll(
			newMap,
			undefined,
			(p: number, d: string) => {
				screenshotWarmupProgress.value = 0.1 + p * 0.88
				screenshotWarmupDetail.value = d
			}
		)
		initCanvasScreenshotPool()
		refreshCanvasNodeLayer()
		screenshotWarmupProgress.value = 0.99
		screenshotWarmupDetail.value = t('aiworkflow.page.warmup.done')
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
	if (forceRecapture) {
		screenshotWarmupDetail.value = t('aiworkflow.page.warmup.forceRecapture', { nodeCount: String(allNodes.length) })
	} else {
		screenshotWarmupDetail.value = t('aiworkflow.page.warmup.readyToCapture', { nodeCount: String(allNodes.length), cached: String(cachedCount), diskLoaded: String(diskLoadedCount) })
	}

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
			screenshotWarmupProgress.value = 0.1 + ratio * 0.78
			screenshotWarmupDetail.value = t('aiworkflow.page.warmup.capturing', { nodeCount: String(allNodes.length), completed: String(screenshotCompleted), needCapture: String(total) })
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
			screenshotWarmupProgress.value = 0.1 + ratio * 0.12 + (screenshotCompleted / total) * 0.66
			screenshotWarmupDetail.value = t('aiworkflow.page.warmup.capturingWithReady', { nodeCount: String(allNodes.length), completed: String(screenshotCompleted), needCapture: String(total), started: String(screenshotStarted) })
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

	// === Canvas截图预热：加载所有截图到内存 ===
	screenshotWarmupProgress.value = 0.88
	screenshotWarmupDetail.value = t('aiworkflow.page.warmup.loadingCanvas', { count: String(newMap.size) })
	await waitForFrames(1)

	await warmupCanvasAll(
		newMap,
		undefined,
		(p: number, d: string) => {
			screenshotWarmupProgress.value = 0.88 + p * 0.11
			screenshotWarmupDetail.value = d
		}
	)

	initCanvasScreenshotPool()
	refreshCanvasNodeLayer()

	screenshotWarmupProgress.value = 0.99
	screenshotWarmupDetail.value = t('aiworkflow.page.warmup.done')
	await waitForFrames(1)

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
	screenshotWarmupDetail.value = t('aiworkflow.page.warmup.renderingNewNodes', { count: String(newNodes.length) })

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
		if (newMap.size > 0) {
			await warmupCanvasAll(newMap)
			initCanvasScreenshotPool()
			refreshCanvasNodeLayer()
		}
		screenshotWarmupOpen.value = false
		screenshotWarmupDetail.value = ''
		return
	}

	screenshotPool.setConcurrency(screenshotPool.getWarmupConcurrency())
	screenshotPool.setBurstMode(true)

	screenshotWarmupProgress.value = 0.02
	screenshotWarmupDetail.value = t('aiworkflow.page.warmup.generatingPreview', { total: String(total) })

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
			screenshotWarmupDetail.value = t('aiworkflow.page.warmup.generatingPreviewProgress', { completed: String(screenshotCompleted), total: String(total) })
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
			screenshotWarmupDetail.value = t('aiworkflow.page.warmup.waitingRender')
		} else {
			const pending = screenshotStarted - screenshotCompleted
			screenshotWarmupProgress.value =
				(screenshotStarted / total) * 0.15 + (screenshotCompleted / total) * 0.85
			screenshotWarmupDetail.value = t('aiworkflow.page.warmup.generatingPreviewPending', { completed: String(screenshotCompleted), total: String(total), pending: String(pending) })
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
	screenshotWarmupDetail.value = t('aiworkflow.page.warmup.newNodesDone', { count: String(newNodes.length) })
	if (newMap.size > 0) {
		await warmupCanvasAll(newMap)
		initCanvasScreenshotPool()
		refreshCanvasNodeLayer()
	}
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

function easeOutCubic(t: number): number {
	return 1 - Math.pow(1 - t, 3)
}

let viewportAnimationRaf: number | null = null

function animateViewportTo(
	target: { panX?: number; panY?: number; zoom?: number },
	duration = 350
): Promise<void> {
	return new Promise((resolve) => {
		if (viewportAnimationRaf !== null) {
			cancelAnimationFrame(viewportAnimationRaf)
			viewportAnimationRaf = null
		}

		const startPanX = viewport.value.panX
		const startPanY = viewport.value.panY
		const startZoom = viewport.value.zoom
		const endPanX = target.panX ?? startPanX
		const endPanY = target.panY ?? startPanY
		const endZoom = target.zoom ?? startZoom

		const hasChange = Math.abs(endPanX - startPanX) > 0.5 ||
			Math.abs(endPanY - startPanY) > 0.5 ||
			Math.abs(endZoom - startZoom) > 0.001

		if (!hasChange) {
			resolve()
			return
		}

		markViewportMotion()
		const startTime = performance.now()

		const step = (now: number) => {
			const elapsed = now - startTime
			const rawT = Math.min(1, elapsed / duration)
			const t = easeOutCubic(rawT)

			const curPanX = startPanX + (endPanX - startPanX) * t
			const curPanY = startPanY + (endPanY - startPanY) * t
			const curZoom = startZoom + (endZoom - startZoom) * t

			onViewportUpdate({ panX: curPanX, panY: curPanY, zoom: curZoom })

			if (rawT < 1) {
				viewportAnimationRaf = requestAnimationFrame(step)
			} else {
				viewportAnimationRaf = null
				forceEndViewportMotion()
				resolve()
			}
		}

		viewportAnimationRaf = requestAnimationFrame(step)
	})
}

const warmupNewTemplateNodes = async (newNodeIds: string[]): Promise<void> => {
	if (!newNodeIds || newNodeIds.length === 0) return

	const newNodes = newNodeIds
		.map((id) => store.state.nodesById[id])
		.filter(Boolean) as WorkflowNode[]
	if (newNodes.length === 0) return

	isWarmingUpScreenshots.value = true
	screenshotWarmupOpen.value = true
	screenshotWarmupProgress.value = 0
	screenshotWarmupDetail.value = t('aiworkflow.page.warmup.templateNodes', { count: String(newNodes.length) })

	warmupForceRenderNodeIds.value = new Set(newNodeIds)

	await waitForFrames(2)

	const newMap = new Map(nodeScreenshotMap.value)
	const nodesNeedingCapture: WorkflowNode[] = []

	for (const node of newNodes) {
		const nodeId = String(node.id ?? '').trim()
		if (!nodeId) continue
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
		if (newMap.size > 0) {
			await warmupCanvasAll(newMap)
			initCanvasScreenshotPool()
			refreshCanvasNodeLayer()
		}
		screenshotWarmupOpen.value = false
		screenshotWarmupDetail.value = ''
		return
	}

	screenshotPool.setConcurrency(screenshotPool.getWarmupConcurrency())
	screenshotPool.setBurstMode(true)

	screenshotWarmupProgress.value = 0.02
	screenshotWarmupDetail.value = t('aiworkflow.page.warmup.generatingPreview', { total: String(total) })

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
				console.warn('[Template Warmup] failed for node:', nodeId, err)
			}

			screenshotCompleted++
			screenshotWarmupProgress.value = screenshotCompleted / total
			screenshotWarmupDetail.value = t('aiworkflow.page.warmup.templateNodesProgress', { completed: String(screenshotCompleted), total: String(total) })
		})()
		promises.push(promise)
	}

	let waitFramesCount = 0
	const MAX_WAIT_FRAMES = 30
	while (screenshotStarted < total && waitFramesCount < MAX_WAIT_FRAMES) {
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
		waitFramesCount++

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
			screenshotWarmupProgress.value = 0.02 + (waitFramesCount / MAX_WAIT_FRAMES) * 0.08
			screenshotWarmupDetail.value = t('aiworkflow.page.warmup.waitingRender')
		} else {
			const pending = screenshotStarted - screenshotCompleted
			screenshotWarmupProgress.value =
				(screenshotStarted / total) * 0.15 + (screenshotCompleted / total) * 0.85
			screenshotWarmupDetail.value = t('aiworkflow.page.warmup.generatingPreviewPending', { completed: String(screenshotCompleted), total: String(total), pending: String(pending) })
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
	screenshotWarmupDetail.value = t('aiworkflow.page.warmup.newNodesDone', { count: String(newNodes.length) })
	if (newMap.size > 0) {
		await warmupCanvasAll(newMap)
		initCanvasScreenshotPool()
		refreshCanvasNodeLayer()
	}
	await waitForFrames(2)
	screenshotWarmupOpen.value = false
	screenshotWarmupDetail.value = ''
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
			setTimeout(() => {
				if (!viewportMotionActive.value) {
					scheduleVisibleNodeScreenshots()
				}
			}, 200)
		}
	},
	{ flush: 'post' }
)

watch(
	() => safeVisibleRenderNodes.value,
	() => {
		if (viewportMotionActive.value) return
		nextTick(() => {
			scheduleVisibleNodeScreenshots()
		})
	},
	{ flush: 'post' }
)

watch(
	() => themeStore.state.mode,
	(newTheme, oldTheme) => {
		invalidateDocumentStyleCache()

		if (themeWarmupAbortController) {
			themeWarmupAbortController.abort()
			themeWarmupAbortController = null
		}

		const fromTheme: 'dark' | 'light' = (oldTheme === 'light' ? 'light' : 'dark')
		const toTheme: 'dark' | 'light' = (newTheme === 'light' ? 'light' : 'dark')

		if (fromTheme === toTheme) return

		screenshotPool.setActiveTheme(toTheme)
		setCanvasActiveTheme(toTheme)

		nextTick(() => {
			nodeCanvasLayerRef.value?.setTheme(toTheme)
			refreshCanvasNodeLayer()
			void startThemeWarmup(toTheme, fromTheme)
		})
	},
	{ flush: 'post' }
)

const startThemeWarmup = async (toTheme: 'dark' | 'light', _fromTheme: 'dark' | 'light') => {
	const allNodes = nodes.value.filter((n) => {
		const nid = String(n?.id ?? '').trim()
		return nid && !selectedNodeIds.value.includes(nid)
	})

	const nodesNeedingCapture: WorkflowNode[] = []
	const versionMap = new Map<string, string>()
	for (const node of allNodes) {
		const nid = String(node.id)
		const version = getNodeScreenshotVersion(node, toTheme)
		versionMap.set(nid, version)
		if (!screenshotPool.hasCachedScreenshot(nid, version)) {
			nodesNeedingCapture.push(node)
		}
	}

	if (nodesNeedingCapture.length === 0) {
		const newMap = new Map(nodeScreenshotMap.value)
		for (const node of allNodes) {
			const nid = String(node.id)
			const cachedEntry = screenshotPool.getCachedScreenshot(nid, versionMap.get(nid) || '')
			if (cachedEntry) {
				newMap.set(nid, cachedEntry)
			}
			if (!hasBitmap(nid, toTheme) && cachedEntry) {
				try {
					await loadScreenshotToCanvas(cachedEntry)
				} catch {}
			}
		}
		nodeScreenshotMap.value = newMap
		initCanvasScreenshotPool()
		refreshCanvasNodeLayer()
		return
	}

	themeWarmupAbortController = new AbortController()
	const signal = themeWarmupAbortController.signal

	themeWarmupTargetTheme.value = toTheme
	themeWarmupOpen.value = true
	themeWarmupProgress.value = 0
	const twLabel = t(toTheme === 'light' ? 'aiworkflow.page.themeWarmup.lightLabel' : 'aiworkflow.page.themeWarmup.darkLabel')
	themeWarmupDetail.value = t('aiworkflow.page.themeWarmup.preparing', { theme: twLabel })

	const warmupNodeIds = new Set(nodesNeedingCapture.map((n) => String(n.id)))
	warmupForceRenderNodeIds.value = warmupNodeIds

	await nextTick()
	await waitForFrames(2)

	const total = nodesNeedingCapture.length
	let screenshotCompleted = 0
	const newMap = new Map(nodeScreenshotMap.value)
	const startedSet = new Set<string>()
	const promises: Promise<void>[] = []

	const startCapture = async (node: WorkflowNode) => {
		const nodeId = String(node.id ?? '').trim()
		if (startedSet.has(nodeId) || signal.aborted) return
		startedSet.add(nodeId)

		try {
			let nodeEl: HTMLElement | null = null
			let retries = 0
			while (retries < 8 && !nodeEl && !signal.aborted) {
				await nextTick()
				await waitForFrames(1)
				const hostEl = nodeHostRefs.get(nodeId)
				if (hostEl) {
					nodeEl = findNodeElementForScreenshot(hostEl)
				}
				retries++
			}

			if (nodeEl && !signal.aborted) {
				const version = getNodeScreenshotVersion(node, toTheme)
				const width = Math.max(80, Math.round(node.width) || 240)
				const height = Math.max(80, Math.round(node.height) || 160)
				const entry = await screenshotPool.queueScreenshot(
					nodeId,
					nodeEl,
					version,
					width,
					height,
					SCREENSHOT_PADDING,
					'normal'
				)
				if (entry?.dataUrl && !signal.aborted) {
					newMap.set(nodeId, entry)
					invalidateCanvasScreenshot(nodeId, toTheme)
					try {
						await loadScreenshotToCanvas(entry)
					} catch {}
				}
			}
		} catch (err) {
			console.warn('[Theme Warmup] failed for node:', nodeId, err)
		}

		screenshotCompleted++
		if (!signal.aborted) {
			const ratio = screenshotCompleted / total
			themeWarmupProgress.value = ratio
			themeWarmupDetail.value = t('aiworkflow.page.themeWarmup.progress', { theme: twLabel, completed: String(screenshotCompleted), total: String(total) })
			refreshCanvasNodeLayer()
		}
	}

	const CONCURRENCY = 4
	for (let i = 0; i < nodesNeedingCapture.length; i += CONCURRENCY) {
		if (signal.aborted) break
		const batch = nodesNeedingCapture.slice(i, i + CONCURRENCY)
		const batchPromises = batch.map((n) => startCapture(n))
		promises.push(...batchPromises)
		await Promise.all(batchPromises)
	}

	await Promise.all(promises)

	if (signal.aborted) {
		warmupForceRenderNodeIds.value = new Set()
		themeWarmupAbortController = null
		return
	}

	nodeScreenshotMap.value = newMap
	warmupExitingFullRender.value = true
	warmupForceRenderNodeIds.value = new Set()
	await nextTick()
	warmupExitingFullRender.value = false

	themeWarmupProgress.value = 1
	themeWarmupDetail.value = t('aiworkflow.page.themeWarmup.done', { theme: twLabel })
	initCanvasScreenshotPool()
	refreshCanvasNodeLayer()

	setTimeout(() => {
		if (themeWarmupTargetTheme.value === toTheme) {
			themeWarmupOpen.value = false
		}
	}, 800)

	themeWarmupAbortController = null
}

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
					const activeTheme = themeStore.state.mode as 'dark' | 'light'
					screenshotPool.invalidateScreenshot(nodeId, activeTheme)
					invalidateCanvasScreenshot(nodeId, activeTheme)
					if (currentFullRenderIds.has(nodeId)) {
						nodesNeedingScreenshotRefresh.add(nodeId)
						if (selectedNodeIds.value.includes(nodeId)) {
							userSelectedNodesNeedingRefresh.add(nodeId)
						}
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
						void scheduleNodeScreenshot(node, 0, 'high')
					}
				}, 200)
			})
		}
	},
	{ deep: true, flush: 'post' }
)

let prevSelectedNodeIds: string[] = []
const userSelectedNodesNeedingRefresh = new Set<string>()
watch(
	() => selectedNodeIds.value.slice(),
	(newIds) => {
		const newlySelected = newIds.filter((id) => !prevSelectedNodeIds.includes(id))
		prevSelectedNodeIds = newIds.slice()

		nextTick(() => {
			scheduleVisibleNodeScreenshots()

			for (const nodeId of newlySelected) {
				userSelectedNodesNeedingRefresh.add(nodeId)
			}
		})
	},
	{ deep: true, flush: 'post' }
)

let hasWarmedUp = false
let warmupDebounceTimer: ReturnType<typeof setTimeout> | null = null
let warmupMode: 'force' | 'cache' | null = null

const triggerWarmupIfNeeded = () => {
	if (warmupDebounceTimer) {
		clearTimeout(warmupDebounceTimer)
		warmupDebounceTimer = null
	}
	warmupDebounceTimer = setTimeout(() => {
		warmupDebounceTimer = null
		if (isWarmingUpScreenshots.value) return
		const count = nodes.value.length
		if (count <= 0) return
		if (hasWarmedUp) return
		warmupConfirmDialogOpen.value = true
	}, 300)
}

const onConfirmForceWarmup = () => {
	warmupConfirmDialogOpen.value = false
	warmupMode = 'force'
	hasWarmedUp = true
	screenshotPool.cleanup()
	nodeScreenshotMap.value = new Map()
	disposeCanvasScreenshot()
	initCanvasScreenshot()
	canvasScreenshotPool.value = { getEntry: () => null, setActiveTheme: () => {} }
	initCanvasScreenshotPool()
	warmupAllNodeScreenshots(true).catch((err) => {
		console.warn('[Screenshot Warmup] force warmup failed:', err)
		isWarmingUpScreenshots.value = false
		screenshotWarmupOpen.value = false
		hasWarmedUp = false
		warmupMode = null
	})
}

const onCancelUseCache = async () => {
	warmupConfirmDialogOpen.value = false
	warmupMode = 'cache'
	hasWarmedUp = true
	try {
		await loadCachedScreenshotsToCanvas()
	} catch (err) {
		console.warn('[Screenshot Warmup] load cache failed, falling back to force warmup:', err)
		warmupMode = 'force'
		screenshotPool.cleanup()
		nodeScreenshotMap.value = new Map()
		warmupAllNodeScreenshots(true).catch((err2) => {
			console.warn('[Screenshot Warmup] fallback force warmup failed:', err2)
			isWarmingUpScreenshots.value = false
			screenshotWarmupOpen.value = false
			hasWarmedUp = false
			warmupMode = null
		})
	}
}

const loadCachedScreenshotsToCanvas = async () => {
	const allNodes = nodes.value.filter((n) => {
		const nodeId = String(n?.id ?? '').trim()
		return nodeId
	})
	console.log('[Screenshot Warmup] loadCachedScreenshotsToCanvas called, allNodes count:', allNodes.length)
	if (allNodes.length === 0) {
		hasWarmedUp = false
		warmupMode = null
		return
	}

	const currentTheme = themeStore.state.mode as 'dark' | 'light'
	screenshotPool.setActiveTheme(currentTheme)
	setCanvasActiveTheme(currentTheme)

	const validNodeIds = new Set(allNodes.map((n) => String(n.id)))
	screenshotPool.pruneToValidNodes(validNodeIds)

	screenshotWarmupOpen.value = true
	screenshotWarmupProgress.value = 0
	screenshotWarmupDetail.value = t('aiworkflow.page.warmup.loadingDiskCache')

	const cacheCtx = getScreenshotCacheContext()

	await nextTick()
	await waitForFrames(1)

	const newMap = new Map<string, ScreenshotCacheEntry>()

	let diskLoadedCount = 0
	try {
		screenshotWarmupProgress.value = 0.05
		screenshotWarmupDetail.value = t('aiworkflow.page.warmup.readingDiskCache')
		const diskCache = await loadAllScreenshotsForBlueprint(cacheCtx.projectId, cacheCtx.blueprintId)
		const totalNodes = allNodes.length
		const currentTheme = themeStore.state.mode as 'dark' | 'light'
		for (let i = 0; i < totalNodes; i++) {
			const node = allNodes[i]
			const nodeId = node.id
			for (const theme of ['dark', 'light'] as const) {
				const version = getNodeScreenshotVersion(node, theme)
				const diskEntry = diskCache.get(makeDiskCacheKey(nodeId, theme))
				if (diskEntry && diskEntry.dataUrl && diskEntry.version === version) {
					screenshotPool.prefillCache(
						nodeId,
						version,
						diskEntry.dataUrl,
						diskEntry.width,
						diskEntry.height,
						SCREENSHOT_PADDING
					)
					if (theme === currentTheme) {
						const screenshotEntry: ScreenshotCacheEntry = {
							nodeId,
							version,
							theme,
							dataUrl: diskEntry.dataUrl,
							width: diskEntry.width,
							height: diskEntry.height,
							padding: SCREENSHOT_PADDING,
							capturedAt: Date.now()
						}
						newMap.set(nodeId, screenshotEntry)
					}
					diskLoadedCount++
				}
			}
			if (i % 10 === 0 || i === totalNodes - 1) {
				const ratio = totalNodes > 0 ? (i + 1) / totalNodes : 1
				screenshotWarmupProgress.value = 0.05 + ratio * 0.2
				screenshotWarmupDetail.value = t('aiworkflow.page.warmup.diskCacheLoading', {
					loaded: String(diskLoadedCount),
					totalNodes: String(totalNodes * 2)
				})
				if (i % 20 === 0) await new Promise<void>(r => requestAnimationFrame(() => r()))
			}
		}
	} catch (err) {
		console.warn('[Screenshot Warmup] load from disk failed:', err)
	}

	nodeScreenshotMap.value = newMap

	screenshotWarmupProgress.value = 0.28
	screenshotWarmupDetail.value = t('aiworkflow.page.warmup.loadingCanvas', { count: String(newMap.size) })

	await warmupCanvasAll(
		newMap,
		undefined,
		(p: number, d: string) => {
			screenshotWarmupProgress.value = 0.3 + p * 0.68
			screenshotWarmupDetail.value = d
		}
	)
	initCanvasScreenshotPool()
	refreshCanvasNodeLayer()

	screenshotWarmupProgress.value = 0.98
	screenshotWarmupDetail.value = t('aiworkflow.page.warmup.done')
	await waitForFrames(1)

	screenshotWarmupOpen.value = false
	screenshotWarmupDetail.value = ''

	if (newMap.size === 0) {
		console.log('[Screenshot Warmup] no cached screenshots found, triggering force warmup')
		warmupMode = 'force'
		await waitForFrames(1)
		warmupAllNodeScreenshots(true).catch((err) => {
			console.warn('[Screenshot Warmup] fallback force warmup failed:', err)
			isWarmingUpScreenshots.value = false
			screenshotWarmupOpen.value = false
			hasWarmedUp = false
			warmupMode = null
		})
	}
}

watch(
	() => nodes.value.length,
	(count) => {
		if (count > 0 && !hasWarmedUp && !isWarmingUpScreenshots.value) {
			triggerWarmupIfNeeded()
		}
	},
	{ immediate: true, flush: 'post' }
)

onMounted(() => {
	setTimeout(() => {
		scheduleVisibleNodeScreenshots()
	}, 1000)
	
	// Canvas2D截图渲染初始化
	initCanvasScreenshot()
	initCanvasScreenshotPool()
	if (import.meta.env.DEV) {
		console.log('[CanvasScreenshot] Initialized, enabled:', canvasScreenshotEnabled.value)
	}
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
	if (state === 'running') return t('aiworkflow.page.runtimeState.running')
	if (state === 'error') return t('aiworkflow.page.runtimeState.error')
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

const createImageNodeAtCenter = (url: string, name?: string): string | null => {
	try {
		const { worldX, worldY } = getCanvasCenterWorld()
		store.commit('addNodeAt', {
			worldX,
			worldY,
			title: name || t('aiworkflow.page.defaultImageNodeTitle')
		})
		const newNodeId = store.state.selectedNodeId
		if (!newNodeId) return null
		store.commit('setNodeType', { nodeId: newNodeId, type: 'image' })
		if (url) {
			store.commit('setNodeImageSettings', {
				nodeId: newNodeId,
				imageSettings: {
					imageUrl: url,
					imageGenerationSource: 'gemini'
				}
			})
		}
		return newNodeId
	} catch (e) {
		console.error('[createImageNodeAtCenter] 创建节点失败:', e)
		return null
	}
}

const createImageNodeAt = (worldX: number, worldY: number, url: string, name?: string): string | null => {
	try {
		store.commit('addNodeAt', {
			worldX,
			worldY,
			title: name || t('aiworkflow.page.defaultImageNodeTitle')
		})
		const newNodeId = store.state.selectedNodeId
		if (!newNodeId) return null
		store.commit('setNodeType', { nodeId: newNodeId, type: 'image' })
		if (url) {
			store.commit('setNodeImageSettings', {
				nodeId: newNodeId,
				imageSettings: {
					imageUrl: url,
					imageGenerationSource: 'gemini'
				}
			})
		}
		return newNodeId
	} catch (e) {
		console.error('[createImageNodeAt] 创建节点失败:', e)
		return null
	}
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
	const { runNodeGenerationTask } = await import('./node-business/chat/useAIWorkflowNodeGeneration')
	const castPayload = finalPayload as unknown as Parameters<typeof runNodeGenerationTask>[1]
	const result = await runNodeGenerationTask(
		{
			store,
			comfyService,
			resolveBackendUrl,
			resolveBackendFetchUrl,
			getProjectId: () => currentProjectId.value,
			nodeResourceUrl,
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
						pushToast(t('aiworkflow.page.media.importFailedNoLocalUrl', { mediaType: t('aiworkflow.page.mediaType.image') }), 'error')
						return false
					}
					store.commit('addResource', base)
					store.commit('setNodeResource', { nodeId, resourceId })
					return true
				}

				if (!(pid > 0) || !sourceUrl) {
					pushToast(t('aiworkflow.page.media.remoteNotAllowed', { mediaType: t('aiworkflow.page.mediaType.image') }), 'warn')
					return false
				}
				const rootPath = await ensureActiveProjectRootRegistered(pid)
				if (isElectron() && !rootPath) {
					pushToast(t('aiworkflow.page.media.importFailedNoRootBound', { mediaType: t('aiworkflow.page.mediaType.image') }), 'error')
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
					pushToast(t('aiworkflow.page.media.importFailedNoLocalUrl', { mediaType: t('aiworkflow.page.mediaType.image') }), 'error')
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
					pushToast(t('aiworkflow.page.media.remoteNotAllowed', { mediaType: t('aiworkflow.page.mediaType.video') }), 'warn')
					return false
				}
				const rootPath = await ensureActiveProjectRootRegistered(pid)
				if (isElectron() && !rootPath) {
					pushToast(t('aiworkflow.page.media.importFailedNoRootBound', { mediaType: t('aiworkflow.page.mediaType.video') }), 'error')
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
					pushToast(t('aiworkflow.page.media.importFailedNoLocalUrl', { mediaType: t('aiworkflow.page.mediaType.video') }), 'error')
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
						pushToast(t('aiworkflow.page.media.importFailedNoLocalUrl', { mediaType: t('aiworkflow.page.mediaType.model3d') }), 'error')
						return false
					}
					store.commit('addResource', base)
					store.commit('setNodeResource', { nodeId, resourceId })
					return true
				}

				if (!(pid > 0) || !sourceUrl) {
					pushToast(t('aiworkflow.page.media.remoteNotAllowed', { mediaType: t('aiworkflow.page.mediaType.model3d') }), 'warn')
					return false
				}
				const rootPath = await ensureActiveProjectRootRegistered(pid)
				if (isElectron() && !rootPath) {
					pushToast(t('aiworkflow.page.media.importFailedNoRootBound', { mediaType: t('aiworkflow.page.mediaType.model3d') }), 'error')
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
					pushToast(t('aiworkflow.page.media.importFailedNoLocalUrl', { mediaType: t('aiworkflow.page.mediaType.model3d') }), 'error')
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
			createImageNodeAtCenter,
			createImageNodeAt,
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
const toolApprovalQueue = ref<ToolApprovalItem[]>([])

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
	if (isElectronRuntime) {
		const w = window as Window & DwebRuntimeWindow
		if (w.dweb?.agent?.stream) {
			agentBackend.value = 'dvsagent'
		} else {
			agentBackend.value = 'copilot'
			console.warn('[AIWorkflowPage] DVSAgent IPC 不可用，已回退到 Copilot CLI')
		}
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
			label: a.label || t('aiworkflow.page.nanoAnchor.refImageLabel', { index: String(idx + 1) }),
			connected: !!edge,
			connectedFrom: fromTitle
		}
	})
})

const chatTaskStatusText = ref('')
const chatTaskStatus = computed(() => {
	if (chatTaskStatusText.value) return chatTaskStatusText.value
	if (chatRunState.value === 'stopping') return t('aiworkflow.page.chatTask.stopping')
	if (chatRunState.value === 'error') return t('aiworkflow.page.chatTask.error')
	return chatSending.value ? t('aiworkflow.page.chatTask.generating') : t('aiworkflow.page.chatTask.idle')
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
	return t('aiworkflow.page.chat.hello')
}
let autoHelloSent = false

const mapCodexSession = (row: CodexSessionRow): LocalExecSessionItem => ({
	id: String(row?.id || '').trim(),
	title: String(row?.title || t('aiworkflow.page.chat.defaultSessionTitle')).trim() || t('aiworkflow.page.chat.defaultSessionTitle'),
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
	const projectPath = String(currentProjectRootPath.value || '').trim()
	try {
		const res = await agentListConversations(projectPath)
		if (!res?.ok) {
			codexSessions.value = []
			codexActiveSessionId.value = ''
			return
		}
		const conversations = Array.isArray(res.conversations) ? res.conversations : []
		codexSessions.value = conversations.map((c) => ({
			id: c.id,
			title: c.title || t('aiworkflow.page.chat.newConversation'),
			modelName: c.model || '',
			status: 'active'
		}))
		if (!codexActiveSessionId.value && codexSessions.value.length) {
			codexActiveSessionId.value = codexSessions.value[0].id
			void onCodexSelectSession(codexActiveSessionId.value)
		}
	} catch {
		codexSessions.value = []
	}
}

const onCodexCreateSession = async () => {
	const projectPath = String(currentProjectRootPath.value || '').trim()
	try {
		const res = await agentCreateConversation(t('aiworkflow.page.chat.newConversation'), chatModelId.value, projectPath)
		if (!res?.ok) {
			pushToast(t('aiworkflow.page.chat.createSessionFailed', { error: String(res?.error || t('aiworkflow.page.chat.unknownError')) }), 'warn')
			return
		}
		const conversation = res.conversation as { id: string; title: string; model: string } | undefined
		if (!conversation?.id) {
			pushToast(t('aiworkflow.page.chat.createSessionFailedEmptyId'), 'warn')
			return
		}
		const item = {
			id: conversation.id,
			title: conversation.title || t('aiworkflow.page.chat.newConversation'),
			modelName: conversation.model || '',
			status: 'active'
		}
		codexSessions.value = [item, ...codexSessions.value.filter((s) => s.id !== item.id)]
		codexActiveSessionId.value = item.id
		chatMessages.value = []
	} catch (err: unknown) {
		pushToast(t('aiworkflow.page.chat.createSessionFailed', { error: getErrorMessage(err) }), 'warn')
	}
}

const onCodexSelectSession = async (sessionId: string) => {
	const sid = String(sessionId || '').trim()
	if (!sid) return
	codexActiveSessionId.value = sid
	codexFlowEvents.value = []
	try {
		const res = await agentGetConversationMessages(sid)
		if (!res?.ok) {
			chatMessages.value = []
			return
		}
		const items = Array.isArray(res.messages) ? res.messages : []
		chatMessages.value = items.map((m) => ({
			id: String(m.id || makeChatId()),
			role: m.role === 'assistant' || m.role === 'system' ? m.role : 'user',
			content: String(m.content || '')
		}))
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
		pushToast(t('aiworkflow.page.chat.submitApprovalFailedAutoSave'), 'warn')
		return
	}
	const sid = String(codexActiveSessionId.value || '').trim()
	if (!sid) {
		pushToast(t('aiworkflow.page.chat.selectSessionFirst'), 'warn')
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
			pushToast(t('aiworkflow.page.chat.approvalSubmitFailed', { error: String(result.error) }), 'warn')
			return
		}
		pushToast(t('aiworkflow.page.chat.approvalSubmitted'), 'info')
	} catch (err: unknown) {
		pushToast(t('aiworkflow.page.chat.approvalSubmitFailed', { error: getErrorMessage(err) }), 'warn')
	}
}

const onCodexDeleteSession = async (sessionId: string) => {
	const sid = String(sessionId || '').trim()
	if (!sid) return
	const ok = window.confirm(t('aiworkflow.page.chat.confirmDeleteSession'))
	if (!ok) return
	const res = await agentDeleteConversation(sid)
	if (!res?.ok) {
		pushToast(t('aiworkflow.page.chat.deleteSessionFailed', { error: String(res?.error || t('aiworkflow.page.chat.unknownError')) }), 'warn')
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
		pushToast(t('aiworkflow.page.chat.renameSessionFailedAutoSave'), 'warn')
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
		pushToast(t('aiworkflow.page.chat.renameSessionFailed', { error: String(result.error) }), 'warn')
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
		pushToast(t('aiworkflow.page.media.pasteNeedSaveProject'), 'warn')
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
	const files: File[] = []
	for (const item of items) {
		if (item.kind !== 'file') continue
		const file = item.getAsFile()
		if (file) files.push(file)
	}

	const mediaFiles = files.filter((f) => {
		const mime = String(f.type || '').toLowerCase()
		if (mime.startsWith('image/') || mime.startsWith('video/')) return true
		return !!inferMediaKindFromFileLocal(f)
	})

	if (mediaFiles.length > 0) {
		const { worldX, worldY } = getCanvasCenterWorld()
		const createdNodeIds: string[] = []
		let offset = 0

		for (const file of mediaFiles) {
			const mime = String(file.type || '').toLowerCase()
			let kind: 'image' | 'video' | null = null
			if (mime.startsWith('image/')) kind = 'image'
			if (mime.startsWith('video/')) kind = 'video'
			if (!kind) kind = inferMediaKindFromFileLocal(file)
			if (!kind) continue

			let assetUrl = ''
			let assetAbsPath = ''
			let assetRelPath = ''
			let displayName = ''

			try {
				const fileBuffer = await file.arrayBuffer()
				if (kind === 'image') {
					const pngBuffer = await transcodeImageToPng(fileBuffer)
					const finalBuffer = pngBuffer || fileBuffer
					const finalFileName = generateUniqueMediaFileName('paste', 'png')
					displayName = finalFileName
					const uploaded = await uploadProjectAsset({
						projectId,
						kind: 'image',
						name: finalFileName,
						arrayBuffer: finalBuffer,
						contentType: 'image/png'
					})
					if (uploaded && uploaded.ok && uploaded.asset) {
						assetRelPath = String(uploaded.asset.projectRelativePath || uploaded.asset.relativePath || '').trim()
						assetAbsPath = String(uploaded.asset.absolutePath || '').trim()
						assetUrl = buildProjectAssetUrl(projectId, assetRelPath)
					}
				} else {
					const videoMime = mime.startsWith('video/') ? mime : 'video/mp4'
					let videoExt = 'mp4'
					if (videoMime === 'video/webm') videoExt = 'webm'
					else if (videoMime === 'video/quicktime') videoExt = 'mov'
					else if (videoMime.startsWith('video/')) {
						const extFromMime = videoMime.split('/')[1]
						if (extFromMime && /^[a-z0-9]+$/.test(extFromMime)) videoExt = extFromMime
					}
					const finalFileName = generateUniqueMediaFileName('paste', videoExt)
					displayName = finalFileName
					const uploaded = await uploadProjectAsset({
						projectId,
						kind: 'video',
						name: finalFileName,
						arrayBuffer: fileBuffer,
						contentType: videoMime
					})
					if (uploaded && uploaded.ok && uploaded.asset) {
						assetRelPath = String(uploaded.asset.projectRelativePath || uploaded.asset.relativePath || '').trim()
						assetAbsPath = String(uploaded.asset.absolutePath || '').trim()
						assetUrl = buildProjectAssetUrl(projectId, assetRelPath)
					}
				}
			} catch {
				// upload failed, fall through to object url
			}

			let finalUrl: string
			if (assetUrl) {
				finalUrl = resolveBackendUrl(assetUrl)
			} else {
				finalUrl = URL.createObjectURL(file)
				displayName = String(file.name || (kind === 'image' ? 'image.png' : 'video.mp4'))
			}

			store.commit('addNodeAt', {
				worldX: worldX + offset,
				worldY: worldY + offset,
				title: kind === 'image' ? t('aiworkflow.page.mediaType.image') : t('aiworkflow.page.mediaType.video')
			})
			const nodeId = store.state.selectedNodeId
			if (nodeId) {
				store.commit('setNodeType', { nodeId, type: kind })
				bindMediaResourceToNode(nodeId, kind, finalUrl, displayName, {
					sourcePath: assetAbsPath || undefined,
					projectRelativePath: assetRelPath || undefined
				})
				autoSizeMediaNode(nodeId, finalUrl, kind)
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

	const urlText = (
		clipboardData.getData('text/uri-list') ||
		clipboardData.getData('text/plain') ||
		''
	).trim()

	if (urlText) {
		const isRemote = urlText.startsWith('http://') || urlText.startsWith('https://') || urlText.startsWith('blob:') || urlText.startsWith('data:')
		if (isRemote) {
			const urlKind = urlText.startsWith('data:video/') || /\.(mp4|webm|mov|m4v|mkv|avi|flv|wmv)(\?|$)/i.test(urlText)
				? 'video'
				: 'image'
			const center = getCanvasCenterWorld()

			let assetUrl = urlText
			let assetAbsPath = ''
			let assetRelPath = ''
			let displayName = ''

			const persisted = await persistBlobUrlToProject(urlText, urlKind as 'image' | 'video', 'paste')
			if (persisted && persisted.url) {
				assetUrl = persisted.url
				assetAbsPath = persisted.sourcePath || ''
				assetRelPath = persisted.projectRelativePath || ''
				displayName = persisted.fileName || ''
			}

			const finalUrl = resolveBackendUrl(assetUrl)
			const defaultName = urlKind === 'video'
				? generateUniqueMediaFileName('paste', 'mp4')
				: generateUniqueMediaFileName('paste', 'png')

			store.commit('addNodeAt', {
				worldX: center.worldX,
				worldY: center.worldY,
				title: urlKind === 'image' ? t('aiworkflow.page.mediaType.image') : t('aiworkflow.page.mediaType.video')
			})
			const nodeId = store.state.selectedNodeId
			if (nodeId) {
				store.commit('setNodeType', { nodeId, type: urlKind })
				bindMediaResourceToNode(nodeId, urlKind as 'image' | 'video', finalUrl, displayName || defaultName, {
					sourcePath: assetAbsPath || undefined,
					projectRelativePath: assetRelPath || undefined
				})
				autoSizeMediaNode(nodeId, finalUrl, urlKind as 'image' | 'video')
				return true
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
	pushToast(t('aiworkflow.page.media.importCancelled'), 'info')
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

	const placeholderId = String(placeholderPayload?.objectId ?? '').trim()
	const placeholderName =
		String(placeholderPayload?.name ?? placeholderId ?? 'placeholder').trim() || 'placeholder'
	const placeholderJson = serializeSceneLayoutSelectedPlaceholder(nodeId)
	const signature = `${nodeId}:placeholder-glb:${placeholderId}:${placeholderJson}`

	pushToast(t('aiworkflow.page.placeholder.exporting'), 'info')

	const viewerExportResult = await exportSceneLayoutPlaceholderGLB(nodeId)
	if (!viewerExportResult.ok || !viewerExportResult.glbData) {
		const errorMsg = viewerExportResult.ok ? t('aiworkflow.page.placeholder.failedGetGlb') : viewerExportResult.error
		pushToast(t('aiworkflow.page.placeholder.exportFailed', { error: String(errorMsg) }), 'error')
		throw new Error(t('aiworkflow.page.placeholder.exportPlaceholderFailed', { error: String(errorMsg) }))
	}

	const fileName = `${slugSceneLayoutPlaceholderModelName(`${viewerExportResult.name || placeholderName}-${placeholderId || 'placeholder'}`)}.glb`
	const file = new File([viewerExportResult.glbData], fileName, { type: 'model/gltf-binary' })
	pushToast(t('aiworkflow.page.placeholder.exportSuccess', { name: String(viewerExportResult.name || placeholderName) }), 'info')
	return {
		file,
		signature,
		placeholderId,
		placeholderJson,
		placeholderName: viewerExportResult.name || placeholderName
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

const {
	connectedTripo3DPrompt,
	connectedTripo3DImageUrls,
	connectedTripo3DImageInputs,
	normalizeTripo3DImageInputValue,
	buildTripo3DImageInputFromNode,
	buildTripo3DModelInputFromNode,
	connectedTripo3DModelInput,
	hasConnectedTripo3DConsumer
} = useAIWorkflowTripo3DInputResolver({
	store,
	getFirstIncomingEdge,
	getIncomingEdges,
	getOutgoingEdges,
	hasOutgoingEdge,
	getTextOutputForNode: (nodeId) => getTextOutputForNode(nodeId),
	nodeResourceUrl,
	getTripo3DEffectiveModelSource,
	getTripo3DDisplayThumbnailUrl,
	blobToDataUrl,
	resolveBackendUrl
})

const { buildTripo3DRequestPayload } = useAIWorkflowTripo3DRequest({
	connectedTripo3DPrompt,
	connectedTripo3DImageInputs,
	connectedTripo3DModelInput,
	buildTripo3DImageInputFromNode,
	normalizeTripo3DImageInputValue,
	hasConnectedTripo3DConsumer
})

const syncModel3DInputFromUpstream = async (
	nodeId: string,
	opts?: { warn?: boolean; forceSceneLayoutExport?: boolean }
) => {
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

		if (fromNode.type === 'model3d' && isRecord(fromNode.model3dSettings) && fromNode.model3dSettings.modelGenerationSource === 'tripo3d') {
			const tripo3dSettings = fromNode.model3dSettings.tripo3dModelSettings as Record<string, unknown> | undefined
			const settings = isRecord(tripo3dSettings) ? tripo3dSettings : {}
			const effective = getTripo3DEffectiveModelSource(settings)
			const sourceUrl = effective.preferredUrl || effective.assetUrl
			if (!sourceUrl) continue
			const format = effective.format
			const taskIdVal = String(settings.taskId ?? settings.tripo3dTaskId ?? fromNode.id).trim() || fromNode.id
			const name = `tripo3d_${taskIdVal}.${format}`
			const persisted = (await persistExternalAssetToProject({
				kind: 'file',
				name,
				sourceUrl,
				sourcePath: effective.assetPath || undefined
			})) as PersistedAsset | null
			revokeNodeModel3DObjectUrl(nodeId)
			const finalModelUrl = String(persisted?.url || effective.assetUrl || sourceUrl)
			if (isTripo3DRemoteUrl(finalModelUrl)) {
				console.warn(
					'[DVS:syncModel3D] tripo3d asset not yet localized, skipping commit — node:',
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
					lastInputSignature: `${fromNode.id}:${taskIdVal}:${sourceUrl}`,
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
			const finalModelUrl = String(persisted?.url || preferredUrl)
			if (isMeshyRemoteUrl(finalModelUrl)) {
				console.warn(
					'[DVS:syncModel3D] upstream model3d asset not yet localized, skipping commit — node:',
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
			if (!opts?.forceSceneLayoutExport) continue
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
					lastInputSourceName: `${t('aiworkflow.page.placeholder.term')} ${generated.placeholderName}`,
					lastInputPlaceholderId: generated.placeholderId || undefined,
					lastInputPlaceholderJson: generated.placeholderJson || undefined
				}
			})
			return true
		}
	}

	if (opts?.warn) pushToast(t('aiworkflow.page.meshy.noUpstreamOutput'), 'warn')
	return false
}

const syncConnectedModel3DTargets = async (
	fromNodeId: string,
	opts?: { forceSceneLayoutExport?: boolean }
) => {
	const targets = getOutgoingEdges(fromNodeId)
		.filter((e: WorkflowEdge) => String(e.toAnchorId ?? '') === 'in-resource')
		.map((e: WorkflowEdge) => String(e.toNodeId ?? '').trim())
		.filter((id: string, index: number, arr: string[]) => !!id && arr.indexOf(id) === index)

	for (const nodeId of targets) {
		await syncModel3DInputFromUpstream(nodeId, { forceSceneLayoutExport: opts?.forceSceneLayoutExport })
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
				const activeTheme = themeStore.state.mode as 'dark' | 'light'
				screenshotPool.invalidateScreenshot(nodeId, activeTheme)
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
	const activeTheme = themeStore.state.mode as 'dark' | 'light'
	screenshotPool.invalidateScreenshot(nodeId, activeTheme)
	invalidateCanvasScreenshot(nodeId, activeTheme)
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

const { sceneLayoutModelInputAnchorId, connectedSceneLayoutModelBindings, validateModelBindings } =
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
	const activeTheme = themeStore.state.mode as 'dark' | 'light'
	screenshotPool.invalidateScreenshot(nodeId, activeTheme)
	invalidateCanvasScreenshot(nodeId, activeTheme)
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
		statusText: t('aiworkflow.page.runtimeState.notConnected'),
		message: t('aiworkflow.page.unreal.resetCleared'),
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
			if (!opts?.silent) pushToast(t('aiworkflow.page.unreal.listSessionsFailed', { error: String(res.error || 'unknown') }), 'warn')
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
							? t('aiworkflow.page.unreal.exportFailed')
							: nodeHasRunningJob
								? t('aiworkflow.page.unreal.exporting')
								: t('aiworkflow.page.unreal.connected', { projectName: String(matchedSession.projectName ?? matchedSession.displayName ?? matchedSession.sessionId).trim() || matchedSession.sessionId }),
						targetSessionId: String(matchedSession.sessionId ?? '').trim(),
						connectedSession: matchedSession,
						lastHeartbeatAt: Number(matchedSession.lastSeenAt ?? 0) || undefined,
						message: latestJobMissing
							? t('aiworkflow.page.unreal.oldJobMissing')
							: latestJobMessage ||
								(nodeHasRunningJob
									? t('aiworkflow.page.unreal.jobPickedGenerating')
									: t('aiworkflow.page.unreal.pluginOnline')),
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
						statusText: t('aiworkflow.page.unreal.waitingForConnection'),
						connectedSession: null,
						message: t('aiworkflow.page.unreal.clickConnectInPlugin'),
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
		if (!opts?.silent) pushToast(t('aiworkflow.page.unreal.listSessionsFailed', { error: getErrorMessage(err) }), 'warn')
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
			statusText: t('aiworkflow.page.unreal.waitingForConnection'),
			message: t('aiworkflow.page.unreal.clickConnectInEditor'),
			autoPoll: true
		}
	})
	await syncUnrealExportNodes({ silent: true, nodeId })
}

type SceneLayoutNodeExpose = {
	getResolvedLayoutForUnreal: () => Promise<
		{ ok: true; exportData: WorkflowUnrealResolvedLayoutExport } | { ok: false; error: string }
	>
	exportSelectedPlaceholderGLB: () => Promise<
		{ ok: true; glbData: ArrayBuffer; name: string } | { ok: false; error: string }
	>
}

const sceneLayoutNodeComponentRefs = new Map<string, SceneLayoutNodeExpose>()

const setWorkflowNodeComponentRef = (nodeId: string, nodeType: string) => {
	return (instance: unknown | null) => {
		if (nodeType !== 'scene-layout') return
		if (
			instance &&
			typeof (instance as SceneLayoutNodeExpose).getResolvedLayoutForUnreal === 'function' &&
			typeof (instance as SceneLayoutNodeExpose).exportSelectedPlaceholderGLB === 'function'
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
		return { ok: false as const, error: t('aiworkflow.page.sceneLayout.missingNodeId') }
	}
	const instance = sceneLayoutNodeComponentRefs.get(normalizedNodeId)
	if (!instance || typeof instance.getResolvedLayoutForUnreal !== 'function') {
		return { ok: false as const, error: t('aiworkflow.page.sceneLayout.noPreviewInstance') }
	}
	try {
		return await instance.getResolvedLayoutForUnreal()
	} catch (err: unknown) {
		return { ok: false as const, error: getErrorMessage(err) }
	}
}

const exportSceneLayoutPlaceholderGLB = async (sceneLayoutNodeId: string) => {
	const normalizedNodeId = String(sceneLayoutNodeId ?? '').trim()
	if (!normalizedNodeId) {
		return { ok: false as const, error: t('aiworkflow.page.sceneLayout.missingNodeId') }
	}
	const instance = sceneLayoutNodeComponentRefs.get(normalizedNodeId)
	if (!instance || typeof instance.exportSelectedPlaceholderGLB !== 'function') {
		return { ok: false as const, error: t('aiworkflow.page.sceneLayout.noPreviewInstanceSelectPlaceholder') }
	}
	try {
		return await instance.exportSelectedPlaceholderGLB()
	} catch (err: unknown) {
		return { ok: false as const, error: getErrorMessage(err) }
	}
}

const activateSceneLayoutPreview = (sceneLayoutNodeId: string) => {
	const normalizedNodeId = String(sceneLayoutNodeId ?? '').trim()
	if (!normalizedNodeId) return
	const node = store.state.nodesById[normalizedNodeId] as Record<string, unknown> | undefined
	if (!node || node.type !== 'scene-layout') return
	const settings = (node.sceneLayoutSettings as Record<string, unknown>) ?? {}
	if (settings.previewMode === true) return
	store.commit('setNodeSceneLayoutSettings', {
		nodeId: normalizedNodeId,
		sceneLayoutSettings: { previewMode: true }
	})
}

const projectToolbarRef = ref<InstanceType<typeof BlueprintProjectToolbar> | null>(null)
const { loadTemplatePackage, deleteTemplate, saveUserTemplateFromBlob, loadTemplates } = useTemplateCenter()
const templateCenterOpen = ref(false)
const templateApplyDialogOpen = ref(false)
const selectedTemplateForApply = ref<TemplateItem | null>(null)
const saveTemplateDialogOpen = ref(false)
const saveTemplateFromCenter = ref(false)
const saveTemplateScope = ref<'full' | 'selection'>('full')
const saveTemplateNodeIds = ref<string[]>([])
const saveTemplatePrefillName = ref('')
const saveTemplateAutoCoverBlob = ref<Blob | null>(null)
const saveTemplateSaving = ref(false)
const saveTemplateProgress = ref(0)
let saveTemplatePendingCoverGen: { nodeIds: string[] } | null = null

function onOpenTemplateCenter() {
	void loadTemplates()
	templateCenterOpen.value = true
}

function onTemplateSelectForApply(template: TemplateItem) {
	selectedTemplateForApply.value = template
	templateCenterOpen.value = false
	templateApplyDialogOpen.value = true
}

async function onDeleteTemplate(template: TemplateItem) {
	const confirmed = window.confirm(t('aiworkflow.templateCenter.deleteConfirm', { name: template.name }))
	if (!confirmed) return
	const ok = await deleteTemplate(template)
	if (ok) {
		pushToast(t('aiworkflow.templateCenter.templateDeleted'), 'info')
	}
}

async function generateAutoCoverForNodes(nodeIds: string[]): Promise<Blob | null> {
	try {
		const currentTheme = themeStore.state.mode as 'dark' | 'light'
		const cachedScreenshots = screenshotPool.getAllCachedForTheme(currentTheme)
		const screenshotMap = new Map<string, { nodeId: string; dataUrl: string; width: number; height: number; padding?: number }>()
		for (const [nid, entry] of cachedScreenshots) {
			if (nodeIds.includes(nid)) {
				screenshotMap.set(nid, entry)
			}
		}
		if (screenshotMap.size === 0) return null
		const bgColor = currentTheme === 'dark' ? '#0f0f0f' : '#f5f5f5'
		return await captureNodesAsCoverBlob(nodeIds, store.state.nodesById, screenshotMap, bgColor)
	} catch {
		return null
	}
}

async function onSaveTemplateFromCenter(options: { scope: 'full' | 'selection' }) {
	saveTemplateScope.value = options.scope
	saveTemplateNodeIds.value = []
	saveTemplatePrefillName.value = currentProjectName.value || ''
	saveTemplateFromCenter.value = true
	saveTemplateAutoCoverBlob.value = null
	const allNodeIds = Object.keys(store.state.nodesById)
	saveTemplatePendingCoverGen = { nodeIds: allNodeIds }
	saveTemplateDialogOpen.value = true
}

async function onSaveSelectionAsTemplate() {
	if (selectedNodeIds.value.length === 0) return
	saveTemplateScope.value = 'selection'
	saveTemplateNodeIds.value = [...selectedNodeIds.value]
	saveTemplatePrefillName.value = ''
	saveTemplateFromCenter.value = false
	saveTemplateAutoCoverBlob.value = null
	saveTemplatePendingCoverGen = { nodeIds: [...selectedNodeIds.value] }
	saveTemplateDialogOpen.value = true
}

watch(saveTemplateDialogOpen, async (isOpen) => {
	if (!isOpen) {
		saveTemplatePendingCoverGen = null
		saveTemplateAutoCoverBlob.value = null
		if (saveTemplateFromCenter.value) {
			saveTemplateFromCenter.value = false
			await waitForFrames(2)
			templateCenterOpen.value = true
		}
		return
	}
	if (!saveTemplatePendingCoverGen) return
	const pendingIds = saveTemplatePendingCoverGen.nodeIds
	saveTemplatePendingCoverGen = null
	await waitForFrames(20)
	const blob = await generateAutoCoverForNodes(pendingIds)
	if (saveTemplateDialogOpen.value) {
		saveTemplateAutoCoverBlob.value = blob
	}
})

async function onConfirmSaveTemplate(options: SaveTemplateConfirmPayload) {
	saveTemplateSaving.value = true
	saveTemplateProgress.value = 0
	try {
		let snapshot: AIWorkflowDraftSnapshot
		let nodeIdsForCover: string[]
		if (options.scope === 'selection' && options.nodeIds && options.nodeIds.length > 0) {
			snapshot = buildSnapshotFromSelection(store.state, options.nodeIds)
			nodeIdsForCover = options.nodeIds
		} else {
			snapshot = buildFullSnapshot(store.state)
			nodeIdsForCover = Array.isArray(snapshot.nodeOrder) ? snapshot.nodeOrder : Object.keys(snapshot.nodesById || {})
		}

		const nodeCount = snapshot.nodeOrder.length
		let coverBlob = options.coverBlob
		if (!coverBlob) {
			saveTemplateProgress.value = 5
			coverBlob = await generateAutoCoverForNodes(nodeIdsForCover)
		}
		saveTemplateProgress.value = 10
		const blob = await createTemplatePackageZip(snapshot, options.name, coverBlob, undefined, (progress) => {
			saveTemplateProgress.value = 10 + progress.percent * 0.85
		})
		saveTemplateProgress.value = 95
		const saved = await saveUserTemplateFromBlob({
			name: options.name,
			description: options.description,
			category: options.category || 'other',
			tags: options.tags,
			blob,
			nodeCount,
			coverBlob
		})

		saveTemplateProgress.value = 100
		await waitForFrames(2)

		if (saved) {
			pushToast(t('aiworkflow.templateCenter.templateSaved'), 'info')
			store.commit('clearSelection')
			if (saveTemplateFromCenter.value) {
				void loadTemplates()
			}
		} else {
			pushToast(t('aiworkflow.templateCenter.templateSaveFailed'), 'error')
		}
		saveTemplateDialogOpen.value = false
	} catch (err) {
		console.error('[Template] Save failed:', err)
		pushToast(t('aiworkflow.templateCenter.templateSaveFailed'), 'error')
	} finally {
		saveTemplateSaving.value = false
		saveTemplateProgress.value = 0
	}
}

async function applyTemplateToCurrent(template: TemplateItem) {
	const blob = await loadTemplatePackage(template)
	if (!blob) {
		pushToast(t('aiworkflow.templateCenter.templatePackageNotFound'), 'error')
		return
	}

	const parsed = await parseTemplatePackageBlob(blob)
	const snapshot = parsed.snapshot
	if (!snapshot) {
		pushToast(t('aiworkflow.templateCenter.templatePackageNotFound'), 'error')
		return
	}

	const templateNodeIds = Array.isArray(snapshot.nodeOrder) ? snapshot.nodeOrder : Object.keys(snapshot.nodesById || {})
	const templateBounds = calculateNodeBounds(templateNodeIds, snapshot.nodesById)
	if (!templateBounds) {
		pushToast(t('aiworkflow.templateCenter.templatePackageNotFound'), 'error')
		return
	}

	const activeProjectId = currentProjectId.value
	if (isElectron() && activeProjectId && parsed.assets.length > 0 && parsed.zip) {
		try {
			const importResult = await importTemplateAssetsToProject(
				parsed,
				activeProjectId,
				async (pid, buffer, fileName, mimeType, subPath, bucket) => {
					const res = await uploadProjectAsset({
						projectId: pid,
						kind: mimeType?.startsWith('image')
							? 'image'
							: mimeType?.startsWith('video')
								? 'video'
								: 'file',
						name: fileName,
						arrayBuffer: buffer,
						contentType: mimeType,
						subPath,
						bucket
					})
					return res?.ok && res?.asset
						? {
							url: res.asset.url,
							relativePath: res.asset.relativePath || '',
							absolutePath: res.asset.absolutePath || res.asset.sourcePath || ''
						}
						: null
				}
			)
			remapTemplateAssetUrls(snapshot, parsed.assets, importResult.fileUrlMap, importResult.filePathMap, importResult.fileAbsPathMap)
		} catch (err) {
			console.error('[AIWF] Failed to import template assets:', err)
		}
	}

	const canvasW = canvasViewportSize.value?.width ?? window.innerWidth
	const canvasH = canvasViewportSize.value?.height ?? window.innerHeight
	const viewportCenter = getViewportCenterInWorld(store.state.viewport, canvasW, canvasH)
	const offsetX = viewportCenter.x - templateBounds.centerX
	const offsetY = viewportCenter.y - templateBounds.centerY

	const existingNodeIds = new Set(Object.keys(store.state.nodesById))
	const existingResourceIds = new Set(Object.keys(store.state.resourcesById))

	const result = mergeTemplateSnapshot(snapshot, {
		viewportCenter,
		existingNodeIds,
		existingResourceIds,
		placementOffset: { x: offsetX, y: offsetY }
	})

	store.commit('mergeTemplateContent', {
		nodes: result.nodes,
		edges: result.edges,
		resources: result.resources
	})

	const newNodeIds = result.nodes.map(n => n.id)
	store.commit('setSelectedNodes', { nodeIds: newNodeIds })

	await nextTick()
	await waitForFrames(2)

	const newBounds = calculateNodeBounds(newNodeIds, store.state.nodesById)
	if (newBounds) {
		const curZoom = store.state.viewport.zoom
		const curPanX = store.state.viewport.panX
		const curPanY = store.state.viewport.panY
		const animCanvasW = canvasViewportSize.value?.width ?? window.innerWidth
		const animCanvasH = canvasViewportSize.value?.height ?? window.innerHeight
		const margin = 100
		const scaleX = (animCanvasW - margin * 2) / newBounds.width
		const scaleY = (animCanvasH - margin * 2) / newBounds.height
		const fitZoom = Math.min(scaleX, scaleY) * curZoom
		const maxZoom = curZoom > 1.5 ? curZoom : 1.5
		let finalZoom: number
		let needsZoomOut: boolean
		if (fitZoom < curZoom * 0.9) {
			finalZoom = Math.max(0.15, fitZoom)
			needsZoomOut = true
		} else {
			finalZoom = curZoom
			needsZoomOut = false
		}
		finalZoom = Math.min(finalZoom, maxZoom)
		const targetPanX = -newBounds.centerX * finalZoom
		const targetPanY = -newBounds.centerY * finalZoom
		const panChanged = Math.abs(targetPanX - curPanX) > 15 || Math.abs(targetPanY - curPanY) > 15
		if (needsZoomOut) {
			await animateViewportTo({ zoom: finalZoom, panX: targetPanX, panY: targetPanY }, 400)
		} else if (panChanged) {
			await animateViewportTo({ panX: targetPanX, panY: targetPanY }, 350)
		}
		await waitForFrames(2)
	}

	void warmupNewTemplateNodes(newNodeIds)

	pushToast(t('aiworkflow.templateCenter.templateApplied'), 'info')
}

async function onConfirmApplyTemplate(options: TemplateApplyOptions) {
	templateApplyDialogOpen.value = false
	const template = options.template
	selectedTemplateForApply.value = null

	if (options.target === 'current') {
		await applyTemplateToCurrent(template)
		return
	}

	if (options.target === 'new-project') {
		const projectName = (options.newProjectName || template.name || 'template').trim()
		const rootPath = (options.newProjectPath || '').trim()

		if (!projectName) {
			pushToast(t('aiworkflow.templateCenter.nameRequired'), 'error')
			return
		}
		if (!rootPath) {
			pushToast(t('aiworkflow.templateCenter.pathRequired'), 'error')
			return
		}

		const blob = await loadTemplatePackage(template)
		if (!blob) {
			pushToast(t('aiworkflow.templateCenter.templatePackageNotFound'), 'error')
			return
		}

		const parsed = await parseTemplatePackageBlob(blob)
		const templateCode = parsed.templateCode || ''
		const subDir = templateCode ? `template/${templateCode}` : undefined

		try {
			cancelActiveRecoverySession()
			store.commit('hydrateDraft', { snapshot: buildSnapshotFromState(createDefaultAIWorkflowState()) })
			setUnsavedProject('')
			reuseRecordConfirm.value = null
			disposeComfyRuntime()
			comfyAnchorAssignments.clear()
			comfyAnchorLocalizedOutputs.clear()

			const opened = await blueprintProjectService.openProjectFolder({
				rootPath,
				name: projectName,
				create: true
			}) as { ok: boolean; error?: string; project?: { id?: number; name?: string; rootPath?: string } }

			if (!opened?.ok) {
				pushToast(t('aiworkflow.toast.projectCreateFailed', { error: String(opened?.error || 'unknown') }), 'error')
				return
			}

			const newProjectId = Number(opened.project?.id || 0)
			if (!Number.isFinite(newProjectId) || newProjectId <= 0) {
				pushToast(t('aiworkflow.runtime.newProjectInvalidId'), 'error')
				return
			}

			await setSavedProject({
				id: newProjectId,
				name: opened.project?.name || projectName,
				rootPath: opened.project?.rootPath || rootPath
			}, projectName)

			await recoverComfyUIRunStates({ silent: true })
			await refreshProjectList()

			const fileName = `${projectName}.zip`
			const file = new File([blob], fileName, { type: 'application/zip' })
			await onRequestImportProjectPackage({ file, templateCode, subPath: subDir })

			await nextTick()
			await waitForFrames(3)

			const allNodeIds = store.state.nodeOrder.slice()
			if (allNodeIds.length > 0) {
				const canvasW = canvasViewportSize.value?.width ?? window.innerWidth
				const canvasH = canvasViewportSize.value?.height ?? window.innerHeight
				const newBounds = calculateNodeBounds(allNodeIds, store.state.nodesById)
				if (newBounds) {
					store.commit('setSelectedNodes', { nodeIds: allNodeIds })
					const curZoom = store.state.viewport.zoom
					const curPanX = store.state.viewport.panX
					const curPanY = store.state.viewport.panY
					const margin = 100
					const scaleX = (canvasW - margin * 2) / newBounds.width
					const scaleY = (canvasH - margin * 2) / newBounds.height
					const fitZoom = Math.min(scaleX, scaleY) * curZoom
					let finalZoom: number
					let needsZoomOut: boolean
					if (fitZoom < curZoom * 0.9) {
						finalZoom = Math.max(0.15, fitZoom)
						needsZoomOut = true
					} else {
						finalZoom = curZoom
						needsZoomOut = false
					}
					finalZoom = Math.min(finalZoom, 1.5)
					const targetPanX = canvasW / 2 - newBounds.centerX * finalZoom
					const targetPanY = canvasH / 2 - newBounds.centerY * finalZoom
					const panChanged = Math.abs(targetPanX - curPanX) > 15 || Math.abs(targetPanY - curPanY) > 15
					if (needsZoomOut) {
						await animateViewportTo({ zoom: finalZoom, panX: targetPanX, panY: targetPanY }, 400)
					} else if (panChanged) {
						await animateViewportTo({ panX: targetPanX, panY: targetPanY }, 350)
					}
				}
			}

			pushToast(t('aiworkflow.templateCenter.templateApplied'), 'info')
		} catch (err: unknown) {
			pushToast(t('aiworkflow.toast.projectCreateFailed', { error: getErrorMessage(err) || 'unknown' }), 'error')
		}
	}
}

function onCopySelectedNodes() {
	const ids = selectedNodeIds.value
	if (ids.length === 0) return
	store.commit('copyNode', { nodeId: ids[0] })
}

function onPasteSelectedNodes() {
	const canvasW = canvasViewportSize.value?.width ?? window.innerWidth
	const canvasH = canvasViewportSize.value?.height ?? window.innerHeight
	const center = getViewportCenterInWorld(store.state.viewport, canvasW, canvasH)
	store.commit('pasteNode', { worldX: center.x, worldY: center.y })
}

const projectList = ref<BlueprintProjectListItem[]>([])
const currentProjectId = ref<number | null>(null)
const currentProjectName = ref('')
const currentProjectRootPath = ref('')
const noProjectSelected = ref(false)
const agentWorkingDirectory = computed(() => {
	const rootPath = String(currentProjectRootPath.value || '').trim()
	const projectName = String(currentProjectName.value || '').trim()
	if (rootPath && projectName) return `${rootPath} · ${projectName}`
	if (rootPath) return rootPath
	if (projectName) return projectName
	return ''
})

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
	(newId, oldId) => {
		void loadCodexSessions()
		if (newId !== oldId) {
			hasWarmedUp = false
			warmupMode = null
			warmupConfirmDialogOpen.value = false
			screenshotWarmupOpen.value = false
			isWarmingUpScreenshots.value = false
			nodeScreenshotMap.value = new Map()
			warmupForceRenderNodeIds.value = new Set()
			if (oldId !== null && oldId !== undefined) {
				screenshotPool.cleanup()
				disposeCanvasScreenshot()
				initCanvasScreenshot()
			}
			canvasScreenshotPool.value = { getEntry: () => null, setActiveTheme: () => {} }
			initCanvasScreenshotPool()
			if (warmupDebounceTimer) {
				clearTimeout(warmupDebounceTimer)
				warmupDebounceTimer = null
			}
			setTimeout(() => {
				if (nodes.value.length > 0 && !hasWarmedUp && !isWarmingUpScreenshots.value) {
					triggerWarmupIfNeeded()
				}
			}, 500)
		}
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

const worldToCanvasLocal = (point: { x: number; y: number }) => {
	const vw = canvasViewportSize.value.width
	const vh = canvasViewportSize.value.height
	const zoom = Math.max(0.01, Number(viewport.value.zoom) || 1)
	return {
		x: vw / 2 + (Number(viewport.value.panX) || 0) + point.x * zoom,
		y: vh / 2 + (Number(viewport.value.panY) || 0) + point.y * zoom
	}
}

const anchorCullMargin = 60
const computeCanvasAnchorRenders = () => {
	const vw = canvasViewportSize.value.width
	const vh = canvasViewportSize.value.height
	if (vw <= 0 || vh <= 0) return []
	const margin = anchorCullMargin
	const out: Array<{
		nodeId: string
		anchorId: string
		anchorIndex: number
		direction: 'in' | 'out'
		screenX: number
		screenY: number
		mediaType?: string
	}> = []
	for (const node of renderNodes.value) {
		if (node.id === NANO_ANCHOR_NODE_ID) continue
		if (getNodeRenderMode(node.id) === 'full') continue
		const inputs = Array.isArray(node.inputs) ? node.inputs : []
		const outputs = Array.isArray(node.outputs) ? node.outputs : []
		const inCount = inputs.length
		const outCount = outputs.length
		for (let i = 0; i < inCount; i++) {
			const a = inputs[i]
			if (!a) continue
			const wp = anchorWorld(node, 'in', i, inCount, a)
			const sp = worldToCanvasLocal(wp)
			if (sp.x < -margin || sp.y < -margin || sp.x > vw + margin || sp.y > vh + margin) continue
			out.push({
				nodeId: node.id,
				anchorId: String(a.id ?? ''),
				anchorIndex: i,
				direction: 'in',
				screenX: sp.x,
				screenY: sp.y,
				mediaType: a.mediaType === 'generic' ? 'resource' : a.mediaType
			})
		}
		for (let i = 0; i < outCount; i++) {
			const a = outputs[i]
			if (!a) continue
			const wp = anchorWorld(node, 'out', i, outCount, a)
			const sp = worldToCanvasLocal(wp)
			if (sp.x < -margin || sp.y < -margin || sp.x > vw + margin || sp.y > vh + margin) continue
			out.push({
				nodeId: node.id,
				anchorId: String(a.id ?? ''),
				anchorIndex: i,
				direction: 'out',
				screenX: sp.x,
				screenY: sp.y,
				mediaType: a.mediaType === 'generic' ? 'resource' : a.mediaType
			})
		}
	}
	return out
}

const canvasAnchors = computed(computeCanvasAnchorRenders)

const canvasAnchorRenderList = computed(() => {
	const states = linkInteraction?.anchorVisualStates.value ?? new Map()
	return canvasAnchors.value.map((a) => {
		const key = `${a.nodeId}-${a.direction}-${a.anchorId}`
		const s = states.get(key)
		return {
			nodeId: a.nodeId,
			anchorId: a.anchorId,
			anchorIndex: a.anchorIndex,
			direction: a.direction as 'in' | 'out',
			x: a.screenX,
			y: a.screenY,
			mediaType: a.mediaType,
			phase: (s?.phase ?? 'idle') as 'idle' | 'armed' | 'snapped' | 'dragging' | 'release',
			magnetX: s?.magnetX ?? 0,
			magnetY: s?.magnetY ?? 0,
			compatible: s?.compatible ?? null
		}
	})
})

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
				blueprintLog.append(t('aiworkflow.page.resourceRecover.success', { assetName }), {
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
			return t('aiworkflow.page.sourceType.resourceRecord')
		case 'node_input':
			return t('aiworkflow.page.sourceType.nodeInput')
		case 'node_output':
			return t('aiworkflow.page.sourceType.nodeOutput')
		case 'node_param':
			return t('aiworkflow.page.sourceType.nodeParam')
		case 'preview':
			return t('aiworkflow.page.sourceType.preview')
		case 'poster':
			return t('aiworkflow.page.sourceType.poster')
		case 'unknown':
			return t('aiworkflow.page.sourceType.unknown')
		default:
			return `[${type}]`
	}
}

const {
	buildUnrealExportPayload,
	onNodeExportUnrealScene,
	onNodeExportUnrealLighting,
	onNodeDisconnect,
	onNodeDetectEditor,
	onNodeCheckPlugin,
	onNodeInstallPlugin,
	onNodeSetAssetRootPath
} = useAIWorkflowUnrealExportActions({
	store,
	unrealExportService,
	connectedTextInputValue,
	getUnrealExportSourceSceneLayoutNode,
	getResolvedLayoutForUnreal,
	connectedSceneLayoutModelBindings,
	validateModelBindings,
	pushToast,
	activateSceneLayoutPreview,
	waitForNextTick: () => nextTick()
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

const onNodeUpdateSceneLayoutModelBindings = (nodeId: string, bindings: WorkflowSceneLayoutManualModelBinding[]) => {
	const node = store.state.nodesById[String(nodeId)]
	if (!node || node.type !== 'scene-layout') return
	const currentSettings = node.sceneLayoutSettings ?? {}
	store.commit('setNodeSceneLayoutSettings', {
		nodeId,
		sceneLayoutSettings: {
			...currentSettings,
			manualModelBindings: bindings
		}
	})
}

const generateUniqueMediaFileName = (prefix: string, ext: string): string => {
	const rand = Math.random().toString(36).slice(2, 8)
	const ts = Date.now().toString(36)
	return `${prefix}_${ts}_${rand}.${ext}`
}

const arrayBufferFromBlobUrl = async (url: string): Promise<ArrayBuffer | null> => {
	try {
		const resp = await fetch(url)
		if (resp.ok) {
			const blob = await resp.blob()
			return await blob.arrayBuffer()
		}
	} catch {
		// ignore
	}
	return null
}

const transcodeImageToPng = async (sourceBuffer: ArrayBuffer): Promise<ArrayBuffer | null> => {
	try {
		const blob = new Blob([sourceBuffer], { type: 'image/*' })
		const objectUrl = URL.createObjectURL(blob)
		const pngBuffer = await new Promise<ArrayBuffer | null>((resolve) => {
			const img = new Image()
			img.onload = () => {
				try {
					const canvas = document.createElement('canvas')
					canvas.width = img.naturalWidth || img.width
					canvas.height = img.naturalHeight || img.height
					const ctx = canvas.getContext('2d')
					if (!ctx) {
						resolve(null)
						return
					}
					ctx.drawImage(img, 0, 0)
					canvas.toBlob((pngBlob) => {
						if (!pngBlob) {
							resolve(null)
							return
						}
						pngBlob.arrayBuffer().then((buf) => resolve(buf)).catch(() => resolve(null))
					}, 'image/png')
				} catch {
					resolve(null)
				}
			}
			img.onerror = () => resolve(null)
			img.src = objectUrl
		})
		URL.revokeObjectURL(objectUrl)
		return pngBuffer
	} catch {
		return null
	}
}

const persistBlobUrlToProject = async (inputUrl: string, kind: 'image' | 'video', prefix = 'dragdrop'): Promise<{
	url: string
	sourcePath?: string
	projectRelativePath?: string
	fileName?: string
} | null> => {
	const url = String(inputUrl || '').trim()
	if (!url) return null
	const pid = Number(currentProjectId.value ?? 0)
	if (!(pid > 0) || !isElectron()) return null

	if (url.toLowerCase().startsWith('dweb://project-assets')) {
		return null
	}

	let arrayBuffer: ArrayBuffer | null = null
	let contentType = kind === 'video' ? 'video/mp4' : 'image/png'
	let detectedMime = ''

	try {
		const isHttp = url.startsWith('http://') || url.startsWith('https://')
		const isBlobOrData = url.startsWith('blob:') || url.startsWith('data:')

		if (isHttp) {
			const result = await fetchAsArrayBuffer(url)
			if (result?.ok && result.buffer) {
				arrayBuffer = result.buffer.buffer.slice(
					result.buffer.byteOffset,
					result.buffer.byteOffset + result.buffer.byteLength
				) as ArrayBuffer
				detectedMime = String(result.mime || '').toLowerCase()
			}
		} else if (isBlobOrData) {
			arrayBuffer = await arrayBufferFromBlobUrl(url)
			if (arrayBuffer) {
				try {
					const resp = await fetch(url)
					if (resp.ok) {
						const blob = await resp.blob()
						detectedMime = String(blob.type || '').toLowerCase()
					}
				} catch {
					// ignore mime detection failure
				}
			}
		}

		if (!arrayBuffer) return null

		let finalExt = 'png'
		if (kind === 'video') {
			const videoMime = detectedMime && detectedMime.startsWith('video/') ? detectedMime : ''
			if (videoMime === 'video/webm') finalExt = 'webm'
			else if (videoMime === 'video/quicktime') finalExt = 'mov'
			else if (videoMime) {
				const extFromMime = videoMime.split('/')[1]
				if (extFromMime && /^[a-z0-9]+$/.test(extFromMime)) finalExt = extFromMime
				else finalExt = 'mp4'
			} else {
				finalExt = 'mp4'
			}
			contentType = `video/${finalExt}`
		} else {
			finalExt = 'png'
			contentType = 'image/png'
			const pngBuffer = await transcodeImageToPng(arrayBuffer)
			if (pngBuffer) {
				arrayBuffer = pngBuffer
			}
		}

		const finalFileName = generateUniqueMediaFileName(prefix, finalExt)

		const uploaded = await uploadProjectAsset({
			projectId: pid,
			kind,
			name: finalFileName,
			arrayBuffer,
			contentType
		})
		if (uploaded && uploaded.ok && uploaded.asset) {
			const relPath = String(uploaded.asset.projectRelativePath || uploaded.asset.relativePath || '').trim()
			const absPath = String(uploaded.asset.absolutePath || '').trim()
			const dwebUrl = buildProjectAssetUrl(pid, relPath)
			if (dwebUrl) {
				return {
					url: dwebUrl,
					sourcePath: absPath || undefined,
					projectRelativePath: relPath || undefined,
					fileName: finalFileName
				}
			}
		}
	} catch {
		return null
	}
	return null
}

const fetchRemoteUrlAsArrayBuffer = async (url: string) => {
	if (!isElectron()) return null
	try {
		return await fetchAsArrayBuffer(String(url || '').trim())
	} catch {
		return null
	}
}

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
	persistBlobUrlToProject,
	fetchUrlAsArrayBuffer: fetchRemoteUrlAsArrayBuffer,
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

const { stopMeshyPoll, applyMeshyTaskResult, startMeshyPoll, recoverMeshyTaskStates, clearMeshyRuntime } =
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

const { stopTripo3DPoll, applyTripo3DTaskResult, startTripo3DPoll, recoverTripo3DTaskStates, clearTripo3DRuntime } =
	useAIWorkflowTripo3DRuntime({
		store,
		getComfyService: () => comfyService,
		pushToast: (message, tone) => pushToast(message, tone),
		normalizeTripo3DTaskStatus,
		pickTripo3DPreferredModelUrl,
		fileExtensionFromUrl: tripo3dFileExtensionFromUrl,
		persistExternalAssetToProject: (payload) => persistExternalAssetToProject(payload),
		syncConnectedModel3DTargets: (nodeId) => syncConnectedModel3DTargets(nodeId),
		refreshTripo3DTaskItems: (opts) => refreshTripo3DTaskItems(opts),
		shouldRefreshTripo3DTaskItems: () => tripo3dTaskDialogOpen.value
	})

const {
	onNodeGenerateTripo3D,
	onNodeRestartTripo3DTask
} = useAIWorkflowTripo3DCommands({
	store,
	getComfyService: () => comfyService,
	pushToast: (message, tone) => pushToast(message, tone),
	stopTripo3DPoll,
	startTripo3DPoll,
	buildTripo3DRequestPayload,
	normalizeTripo3DTaskStatus,
	refreshTripo3DTaskItems: (opts) => refreshTripo3DTaskItems(opts),
	shouldRefreshTripo3DTaskItems: () => tripo3dTaskDialogOpen.value
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
			importLimitAlertMessage.value = t('aiworkflow.page.importLimit.message', { count: String(count), limit: String(limit) })
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

const { onSend, onStop, onNanoBananaGenerate, onSeedanceGenerate, handleUserChoiceSelect } = useAIWorkflowChatGeneration({
	store,
	chatModelKey,
	chatDraft,
	chatModelId,
	chatThinkingEffort,
	chatContextUsage,
	chatMessages,
	chatSending,
	chatRunState,
	chatTaskStatusText,
	localExecStreamMode,
	agentConversationMode,
	agentBackend,
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
	currentProjectName,
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
	getChatService: () => localExecChatService,
	onSeedanceTaskObserved,
	getSelectedNode: () => selectedNode.value,
	getAllNodes: () => nodes.value,
	getAllEdges: () => renderEdges.value,
})

const { setupToolListener: setupAgentToolListener, cleanupToolListener: cleanupAgentToolListener } = useAgentToolBridge({
	store,
	toolApprovalQueue,
	pushToast,
	getSelectedNode: () => selectedNode.value,
	getAllNodes: () => nodes.value,
	getAllEdges: () => renderEdges.value,
	getNodeTypes: (category) => {
		const cat = String(category || '').trim().toLowerCase()
		return i18nCatalogItems.value
			.filter((item) => {
				if (!cat) return true
				if (item.topCategoryId === cat) return true
				if (item.primaryCategoryId === cat) return true
				if ((item.categoryIds as string[])?.includes(cat)) return true
				return false
			})
			.map((item) => ({
				type: item.actionId,
				label: item.label,
				category: item.topCategoryId,
			}))
	},
	getProjectInfo: () => ({
		id: currentProjectId.value,
		name: currentProjectName.value,
	}),
	viewport: computed(() => viewport.value),
	canvasViewportSize: computed(() => canvasViewportSize.value),
	focusNode: (nodeId) => onFocusNode(nodeId),
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
})

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
		pushToast(t('aiworkflow.page.resourcePreview.failedEmptyUrl'), 'warn')
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
	importAssetFromBuffer: async (projectId, buffer, fileName, mimeType, subPath, bucket) => {
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
				contentType: mimeType,
				subPath,
				bucket
			})
			return result?.ok && result?.asset
				? {
					url: result.asset.url,
					relativePath: result.asset.relativePath || '',
					absolutePath: result.asset.absolutePath || result.asset.sourcePath || ''
				}
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
	hasClipboardNodes: () => {
		return !!(store.state.clipboardNode || (Array.isArray(store.state.clipboardNodes) && store.state.clipboardNodes.length > 0))
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
						? t('aiworkflow.contextMenu.deleteSelectedNodes', { count: selectedNodeIds.value.length })
						: t('aiworkflow.contextMenu.delete'),
				target: { kind: 'none' }
			}
		]
	}
	const target: WorkflowSelectionTarget = selectedEdgeId.value
		? { kind: 'edge', id: selectedEdgeId.value }
		: { kind: 'none' }
	const del = buildDeleteAction(target)
	if (del) {
		del.label = t('aiworkflow.contextMenu.delete')
		return [del]
	}
	return []
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
	canvasAnchors,
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

const clearLinkHoverStableTimer = () => {
	if (linkHoverStableTimer) {
		clearTimeout(linkHoverStableTimer)
		linkHoverStableTimer = null
	}
}

watch(
	() => linkInteraction.linkingHoverNodeId.value,
	(nextHoverId) => {
		const hoverId = String(nextHoverId ?? '').trim()
		if (hoverId) {
			clearLinkHoverStableTimer()
			stableLinkHoverNodeId.value = hoverId
		} else {
			if (!stableLinkHoverNodeId.value) return
			clearLinkHoverStableTimer()
			linkHoverStableTimer = setTimeout(() => {
				stableLinkHoverNodeId.value = ''
				linkHoverStableTimer = null
			}, LINK_HOVER_STABLE_DELAY_MS)
		}
	}
)

watch(
	() => linkInteraction.isLinking.value,
	(isLinking) => {
		if (!isLinking) {
			clearLinkHoverStableTimer()
			stableLinkHoverNodeId.value = ''
		}
	}
)

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
	perfHealthClass,
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
		pushToast(t('aiworkflow.page.perf.exportedLog'), 'info')
	} catch (err: unknown) {
		pushToast(t('aiworkflow.page.perf.exportLogFailed', { error: getErrorMessage(err) }), 'warn')
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
		pushToast(t('aiworkflow.page.preview.noImageResource'), 'warn')
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
		pushToast(t('aiworkflow.page.preview.needElectron'), 'warn')
	} catch (err) {
		console.warn('[AIWorkflowPage] openImageMarkupPreview failed', err)
		pushToast(t('aiworkflow.page.preview.openFailed'), 'warn')
	}
}

const closeImageMarkupDialog = () => {
	imageMarkupContext.value = { nodeId: null, url: null, name: null }
}

// 预热裁剪/截图新建的图片节点：先以完整 DOM 渲染，捕获截图后释放为 canvas 位图
// 确保新节点不会直接显示占位 canvas，而是先展示完整节点再切换为预热截图
const warmupCropCreatedNode = async (nodeId: string) => {
	const node = store.state.nodesById[nodeId]
	if (!node) return
	const nid = String(node.id ?? '').trim()
	if (!nid) return

	// 锁定节点为完整渲染模式，避免在图片解码/截图捕获期间被切换为占位 canvas
	const pendingSet = new Set(pendingScreenshotNodeIds.value)
	pendingSet.add(nid)
	pendingScreenshotNodeIds.value = pendingSet

	try {
		// 等待节点 DOM 与图片解码完成
		await nextTick()
		await waitForFrames(2)

		// 失效可能存在的旧缓存（例如此前在图片未加载时捕获的空白截图）
		const activeTheme = themeStore.state.mode as 'dark' | 'light'
		screenshotPool.invalidateScreenshot(nid, activeTheme)
		invalidateCanvasScreenshot(nid, activeTheme)
		const clearedMap = new Map(nodeScreenshotMap.value)
		clearedMap.delete(nid)
		nodeScreenshotMap.value = clearedMap

		// allowFullRender=true 允许在选中/完整渲染状态下捕获截图
		// scheduleNodeScreenshot 内部会等待 <img> 加载完成再捕获，确保位图内容完整
		await scheduleNodeScreenshot(node, 0, 'high', true)
	} catch (err) {
		console.warn('[Crop Warmup] failed for node:', nid, err)
	} finally {
		// 释放锁定，节点可切换为 canvas 位图渲染（位图已就绪，不会显示占位 canvas）
		const releaseSet = new Set(pendingScreenshotNodeIds.value)
		releaseSet.delete(nid)
		pendingScreenshotNodeIds.value = releaseSet
		refreshCanvasNodeLayer()
	}
}

const handleImageMarkupExported = (payload: {
	dataUrl: string
	width: number
	height: number
	sourceName?: string | null
	exportType?: 'markup' | 'screenshot'
}) => {
	const fromNodeId = imageMarkupContext.value.nodeId
	const exportType = payload.exportType || 'markup'
	const isScreenshot = exportType === 'screenshot'
	const typeLabel = isScreenshot ? t('aiworkflow.page.mediaType.screenshot') : t('aiworkflow.page.mediaType.markedImage')
	const typeSuffix = isScreenshot ? 'screenshot' : 'marked'
	const baseName = (
		imageMarkupContext.value.name ||
		payload.sourceName ||
		(isScreenshot ? 'screenshot.png' : 'marked-image.png')
	).replace(/\.[^.]+$/, '')
	if (!fromNodeId) {
		pushToast(t('aiworkflow.page.markup.sourceNodeNotFound', { typeLabel }), 'warn')
		return
	}
	try {
		const fromNode = store.state.nodesById[fromNodeId]
		if (!fromNode) return

		const baseX = Number(fromNode.worldX || 0)
		const baseY = Number(fromNode.worldY || 0)
		const title = `${fromNode.title ? fromNode.title + ' ' : ''}${typeLabel}`

		store.commit('addNodeAt', { worldX: baseX + 400, worldY: baseY, title })
		const newNodeId = String(store.state.selectedNodeId || '').trim()
		if (!newNodeId || !store.state.nodesById[newNodeId]) {
			pushToast(t('aiworkflow.page.markup.createNodeFailed', { typeLabel }), 'error')
			return
		}

		const resourceId = `res-${typeSuffix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
		const resourceName = `${baseName}-${typeSuffix}-${Date.now()}.png`.slice(0, 200)
		const newResource: WorkflowResource = {
			id: resourceId,
			kind: 'image',
			name: resourceName,
			url: payload.dataUrl,
			localFileKey: `${typeSuffix}:${newNodeId}`,
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
				naturalHeight: h
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
		pushToast(t('aiworkflow.page.markup.nodeCreated', { typeLabel }), 'info')

		// 触发预热：先以完整节点显示，截图捕获后切换为 canvas 位图，避免直接显示占位 canvas
		void warmupCropCreatedNode(newNodeId)
	} catch (err) {
		console.warn('[AIWorkflowPage] handleImageMarkupExported failed', err)
		pushToast(t('aiworkflow.page.markup.generateNodeFailed', { typeLabel }), 'error')
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
	stopMeshyPoll,
	createImageNodeAtCenter
})

const onOpenMeshyTaskPanel = () => {
	openMeshyTaskDialog()
}

const {
	tripo3dTaskDialogOpen,
	tripo3dTaskItems,
	tripo3dTaskPanelStatusText,
	tripo3dBalanceText,
	tripo3dBalanceDetail,
	tripo3dBalanceTone,
	tripo3dTaskRemoteLoading,
	tripo3dTaskDetail,
	tripo3dTaskDetailTaskId,
	tripo3dTaskDetailLoading,
	tripo3dTaskActionBusyTaskId,
	tripo3dTaskActionBusyType,
	openTripo3DTaskDialog,
	closeTripo3DTaskDialog,
	onRefreshTripo3DTaskPanel,
	onPreviewTripo3DTask,
	onTripo3DTaskPanelAction,
	onNodeRefreshTripo3DTask,
	onNodePullTripo3DOutput,
	onNodeStopTripo3DTask,
	onNodeDeleteTripo3DTask,
	refreshTripo3DTaskItems,
	refreshTripo3DBalance
} = useAIWorkflowTripo3DTaskPanelController({
	store,
	renderNodes,
	comfyService,
	pushToast,
	getTripo3DDisplayThumbnailUrl,
	pickTripo3DEffectiveOutput,
	applyTripo3DTaskResult,
	stopTripo3DPoll,
	createImageNodeAtCenter
})

const onOpenTripo3DTaskPanel = () => {
	openTripo3DTaskDialog()
}

const onOpenArkTaskPanel = () => {
	openArkTaskDialog()
}

const onNodeRetryMeshyFetch = async (nodeId: string) => {
	const node = store.state.nodesById[nodeId]
	if (!node || node.type !== 'model3d') return
	const settings = node.model3dSettings?.meshyModelSettings
	const taskId = String(settings?.taskId ?? '').trim()
	const mode = String(settings?.taskFamily ?? 'text-to-3d').trim()
	if (!taskId) {
		pushToast(t('aiworkflow.page.meshy.noRetryTaskId'), 'warn')
		return
	}
	try {
		const res = await comfyService.meshyTask(taskId, mode)
		if (!res?.ok) {
			pushToast(t('aiworkflow.page.meshy.pullFailed', { error: String(res?.error ?? 'unknown') }), 'error')
			return
		}
		const finalStatus = await applyMeshyTaskResult(nodeId, res as unknown)
		if (finalStatus === 'succeeded') {
			pushToast(t('aiworkflow.page.meshy.pullSuccess'), 'info')
		} else {
			pushToast(t('aiworkflow.page.meshy.taskNotComplete', { status: finalStatus }), 'warn')
		}
	} catch (e: unknown) {
		pushToast(t('aiworkflow.page.meshy.pullException', { error: getErrorMessage(e) }), 'error')
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

// ===== 火山方舟 ARK 任务面板 =====
const {
	arkTaskDialogOpen,
	arkTaskItems,
	arkTaskRefreshBusy,
	arkTaskDetail,
	arkTaskDetailTaskId,
	arkTaskDetailLoading,
	arkTaskDownloading,
	arkTaskDataStatusText,
	openArkTaskDialog,
	closeArkTaskDialog,
	onRefreshArkTaskPanel,
	onPreviewArkTask,
	onArkTaskPanelAction
} = useAIWorkflowArkTaskPanel(currentProjectId, {
	comfyService,
	pushToast: (message, tone, opts) => pushToast(message, tone, opts),
	findVideoNodeByTaskId: (_remoteTaskId: string) => {
		// TODO: 后续可以根据节点上存储的任务ID来查找对应节点
		// 目前先返回 null，走新建节点的流程
		return null
	},
	bindVideoResultToNode: async (nodeId: string, url: string) => {
		const node = store.state.nodesById[nodeId]
		if (!node) return false
		const resourceId = `ark-video-${nodeId}-${Date.now()}`
		const resourceName = `ark_video_${resourceId.slice(-6)}.mp4`
		const base: GeneratedResourceBase = {
			id: resourceId,
			kind: 'video',
			name: resourceName,
			url
		}
		const pid = Number(currentProjectId.value ?? 0)
		if (!(pid > 0)) {
			pushToast(t('aiworkflow.page.media.videoProjectNotActive'), 'warn')
			return false
		}
		finalizeGeneratedResourceLocalUrl(base, pid)
		base.url = String(base.url || '').trim()
		if (!base.url) {
			pushToast(t('aiworkflow.page.media.importFailedNoLocalUrl', { mediaType: t('aiworkflow.page.mediaType.video') }), 'error')
			return false
		}
		store.commit('addResource', base)
		store.commit('setNodeResource', { nodeId, resourceId })
		return true
	},
	createMediaNodeWithAsset: async (url: string, kind: 'image' | 'video', prompt?: string) => {
		const pid = Number(currentProjectId.value ?? 0)
		if (!(pid > 0)) return ''
		const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')
		const resourceId = `ark-${kind}-new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
		const resourceName = kind === 'image'
			? `ark_image_${timestamp}.png`
			: `ark_video_${timestamp}.mp4`
		const base: GeneratedResourceBase = {
			id: resourceId,
			kind,
			name: resourceName,
			url
		}
		finalizeGeneratedResourceLocalUrl(base, pid)
		base.url = String(base.url || '').trim()
		if (!base.url) {
			pushToast(t('aiworkflow.page.media.importFailedNoLocalUrl', { mediaType: kind === 'image' ? t('aiworkflow.page.mediaType.image') : t('aiworkflow.page.mediaType.video') }), 'error')
			return ''
		}
		const vp = store.state.viewport
		const zoom = Math.max(0.01, Number(vp?.zoom) || 1)
		const panX = Number(vp?.panX) || 0
		const panY = Number(vp?.panY) || 0
		const worldCenterX = -panX / zoom
		const worldCenterY = -panY / zoom
		const nodeW = 240
		const nodeH = 160
		const worldX = worldCenterX - nodeW / 2
		const worldY = worldCenterY - nodeH / 2
		const titleLabel = kind === 'image' ? t('aiworkflow.page.mediaType.image') : t('aiworkflow.page.mediaType.video')
		store.commit('addNodeAt', { worldX, worldY, title: prompt ? `${titleLabel}：${prompt.slice(0, 20)}` : titleLabel })
		const nodeId = store.state.selectedNodeId
		if (!nodeId) return ''
		store.commit('setNodeType', { nodeId, type: kind })
		store.commit('addResource', base)
		store.commit('setNodeResource', { nodeId, resourceId })
		autoSizeMediaNode(nodeId, base.url, kind)
		return nodeId
	}
})

// ===== Google Gemini 图片任务面板 =====
const getGeminiService = () => {
	const dweb = (window as unknown as Record<string, unknown>).dweb
	if (!isRecord(dweb) || !isRecord(dweb.gemini)) return null
	return dweb.gemini as unknown as {
		health: () => Promise<{ ok: boolean; configured?: boolean }>
		getTask: (payload: { taskId: string }) => Promise<{ ok: boolean; task?: Record<string, unknown>; error?: string }>
		listTasks: (payload?: { limit?: number; status?: string }) => Promise<{ ok: boolean; items?: Record<string, unknown>[]; error?: string }>
		cancel: (payload: { taskId: string }) => Promise<{ ok: boolean; error?: string }>
		deleteTask: (payload: { taskId: string }) => Promise<{ ok: boolean; error?: string }>
		clearCompleted: (payload?: Record<string, unknown>) => Promise<{ ok: boolean; deletedCount?: number; error?: string }>
		getImagePath: (payload: { taskId: string; imageIndex?: number }) => Promise<{ ok: boolean; path?: string; filename?: string; mimeType?: string; error?: string }>
	}
}

const {
	geminiTaskDialogOpen,
	geminiTaskItems,
	geminiTaskPanelStatusText,
	geminiConfigured,
	geminiTaskLoaded,
	geminiTaskLoading,
	geminiTaskDetail,
	geminiTaskDetailTaskId,
	geminiTaskDetailLoading,
	geminiTaskActionBusyTaskId,
	geminiTaskActionBusyType,
	openGeminiTaskDialog,
	closeGeminiTaskDialog,
	onRefreshGeminiTaskPanel,
	onGeminiTaskPanelAction,
	onPreviewGeminiTask,
	refreshGeminiTasks,
	checkGeminiHealth,
	onGeminiTaskDialogOpenChanged
} = useAIWorkflowGeminiTaskPanelController({
	store,
	renderNodes,
	geminiService: {
		health: async () => {
			const svc = getGeminiService()
			if (!svc) return { ok: false, error: 'Gemini service not available' }
			return svc.health()
		},
		getTask: async (payload) => {
			const svc = getGeminiService()
			if (!svc) return { ok: false, error: 'Gemini service not available' }
			return svc.getTask(payload)
		},
		listTasks: async (payload) => {
			const svc = getGeminiService()
			if (!svc) return { ok: false, error: 'Gemini service not available' }
			return svc.listTasks(payload)
		},
		cancel: async (payload) => {
			const svc = getGeminiService()
			if (!svc) return { ok: false, error: 'Gemini service not available' }
			return svc.cancel(payload)
		},
		deleteTask: async (payload) => {
			const svc = getGeminiService()
			if (!svc) return { ok: false, error: 'Gemini service not available' }
			return svc.deleteTask(payload)
		},
		clearCompleted: async (payload) => {
			const svc = getGeminiService()
			if (!svc) return { ok: false, error: 'Gemini service not available' }
			return svc.clearCompleted(payload)
		},
		getImagePath: async (payload) => {
			const svc = getGeminiService()
			if (!svc) return { ok: false, error: 'Gemini service not available' }
			return svc.getImagePath(payload)
		}
	},
	pushToast: (message, tone) => pushToast(message, tone),
	createImageNodeAtCenter
})

const onOpenGeminiTaskPanel = () => {
	openGeminiTaskDialog()
}

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
		pushToast(t('aiworkflow.page.resourceNode.notFound'), 'warn')
		return
	}
	// 计算世界坐标
	const vp = viewport.value
	const screenX = screenPosition?.x ?? window.innerWidth / 2
	const screenY = screenPosition?.y ?? window.innerHeight / 2
	const worldX = (screenX - vp.panX) / vp.zoom
	const worldY = (screenY - vp.panY) / vp.zoom

	const title = String(resource.name || resourceId || t('aiworkflow.page.resourceNode.defaultTitle')).slice(0, 200)
	store.commit('addNodeAt', { worldX, worldY, title })
	const newNodeId = String(store.state.selectedNodeId || '').trim()
	if (!newNodeId || !store.state.nodesById[newNodeId]) {
		pushToast(t('aiworkflow.page.resourceNode.createFailed'), 'error')
		return
	}
	// 将资源绑定到新节点
	store.commit('nodeFieldUpdate', {
		nodeId: newNodeId,
		field: 'image',
		value: resource.url || ''
	})
	pushToast(t('aiworkflow.page.resourceNode.addedToBlueprint', { title }), 'info')
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
		const cX = rect.width / 2
		const cY = rect.height / 2
		const screenX = cX + viewport.value.panX + node.worldX * z + rect.left
		const screenY = cY + viewport.value.panY + node.worldY * z + rect.top
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
		pushSystemToast(t('aiworkflow.page.resourceManager.toastNodeDeleted'), 'warn')
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
					pushSystemToast(t('aiworkflow.page.resourceManager.toastNodeDeleted'), 'warn')
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
			const title = currentProjectName.value || t('aiworkflow.page.resourceManager.defaultTitle')
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
	pushToast(t('aiworkflow.page.resourceManager.onlyElectron'), 'warn')
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
		isDjangoManagedResource: isDjangoManagedResource as (resource: unknown) => boolean,
		importAssetIntoProjectScope: (payload: Parameters<typeof importAssetIntoProjectScope>[0]) => importAssetIntoProjectScope(payload),
	deleteAsset: (payload: Parameters<typeof blueprintProjectService.deleteAsset>[0]) => blueprintProjectService.deleteAsset(payload),
		pushToast
	})

const { removeResourceByPolicy, onRemoveResource, onRefreshMissingResourceRecords } =
	useAIWorkflowResourceRecordCleanup({
		store,
		currentProjectId,
		blueprintProjectService,
		pushToast,
		isComfyForwardResource: isComfyForwardResource as (resource: unknown) => boolean,
		isDjangoManagedResource: isDjangoManagedResource as (resource: unknown) => boolean,
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
	forceEndViewportMotion,
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

const canvasScreenToWorld = (point: { x: number; y: number }) => {
	const vw = canvasViewportSize.value.width
	const vh = canvasViewportSize.value.height
	const zoom = Math.max(0.01, Number(viewport.value.zoom) || 1)
	const panX = Number(viewport.value.panX) || 0
	const panY = Number(viewport.value.panY) || 0
	return {
		x: (point.x - vw / 2 - panX) / zoom,
		y: (point.y - vh / 2 - panY) / zoom
	}
}

const onCanvasAnchorPointerDown = (payload: {
	nodeId: string
	anchorId: string
	anchorIndex: number
	direction: 'in' | 'out'
	event: PointerEvent
}) => {
	if (payload.direction !== 'out') return
	onStartLink(
		{
			nodeId: payload.nodeId,
			anchorId: payload.anchorId,
			anchorIndex: payload.anchorIndex,
			event: payload.event
		},
		canvasScreenToWorld
	)
}

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
			const pendingCapture: WorkflowNode[] = []
			const pendingBitmapLoads: Promise<void>[] = []
			for (const nodeId of nodesExitingFullRender) {
				const node = nodes.value.find((n) => String(n.id) === nodeId)
				if (!node) continue
				nodesNeedingScreenshotRefresh.delete(nodeId)
				userSelectedNodesNeedingRefresh.delete(nodeId)
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
					if (existingCached && !hasBitmap(nodeId)) {
						const loadPromise = (async () => {
							try {
								await loadScreenshotToCanvas(existingCached)
							} catch {}
							initCanvasScreenshotPool()
						})()
						pendingBitmapLoads.push(loadPromise)
					}
					continue
				}

				if (!isWarmupExit && mapEntryValid && existingCached) {
					if (existingCached && !hasBitmap(nodeId)) {
						const loadPromise = (async () => {
							try {
								await loadScreenshotToCanvas(existingCached)
							} catch {}
							initCanvasScreenshotPool()
						})()
						pendingBitmapLoads.push(loadPromise)
					}
					continue
				}

				pendingCapture.push(node)
			}

			if (pendingBitmapLoads.length > 0) {
				void Promise.all(pendingBitmapLoads).then(() => {
					refreshCanvasNodeLayer()
				})
			}

			if (pendingCapture.length > 0) {
				const pendingSet = new Set(pendingScreenshotNodeIds.value)
				for (const node of pendingCapture) {
					pendingSet.add(String(node.id))
				}
				pendingScreenshotNodeIds.value = pendingSet

				nextTick(() => {
					setTimeout(() => {
						const capturePromises: Promise<void>[] = []
						for (const node of pendingCapture) {
							const promise = (async () => {
								const nodeId = String(node.id)
								try {
									await scheduleNodeScreenshot(node, 0, 'high', true)
									const version = getNodeScreenshotVersion(node)
									const cached = screenshotPool.getCachedScreenshot(nodeId, version)
									if (cached) {
										const newMap = new Map(nodeScreenshotMap.value)
										newMap.set(nodeId, cached)
										nodeScreenshotMap.value = newMap
										try {
											await loadScreenshotToCanvas(cached)
										} catch {}
										initCanvasScreenshotPool()
									}
								} catch (err) {
									console.warn('[Screenshot] pending capture failed for node:', nodeId, err)
								} finally {
									const newPendingSet = new Set(pendingScreenshotNodeIds.value)
									newPendingSet.delete(nodeId)
									pendingScreenshotNodeIds.value = newPendingSet
									refreshCanvasNodeLayer()
								}
							})()
							capturePromises.push(promise)
						}
						void Promise.all(capturePromises)
					}, isWarmupExit ? 0 : 50)
				})
			}
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
	panningFullRenderSnapshot.value = new Set(fullRenderNodeIds.value)
	markViewportMotion()
}

const onCanvasPanningEnd = () => {
	linkInteraction.setPanning(false)
	panningFullRenderSnapshot.value = null
	forceEndViewportMotion()
}

const onCanvasPointerDown = canvasInteraction.onCanvasPointerDown
const onNodeX = canvasInteraction.onNodeX
const onNodeY = canvasInteraction.onNodeY
const onNodeDragPosition = canvasInteraction.onNodeDragPosition
const onSelectNode = canvasInteraction.onSelectNode
const onSelectEdge = canvasInteraction.onSelectEdge
const onCompactNodePointerDown = canvasInteraction.onCompactNodePointerDown
const onBoxSelect = canvasInteraction.onBoxSelect
const onNodeSizeChange = canvasInteraction.onNodeSizeChange
const onFocusNode = canvasInteraction.onFocusNode

// Canvas节点事件处理
const onCanvasNodeHover = (nodeId: string | null) => {
	if (canvasScreenshotDebugMode.value) {
		console.log('[CanvasNode] hover:', nodeId)
	}
	// 可以在这里更新全局悬停状态
}

const onCanvasNodeClick = (nodeId: string, _event: PointerEvent) => {
	if (canvasScreenshotDebugMode.value) {
		console.log('[CanvasNode] click:', nodeId)
	}
	onSelectNode(nodeId)
}

const onCanvasNodePointerDown = (nodeId: string | null, _event: PointerEvent) => {
	if (canvasScreenshotDebugMode.value) {
		console.log('[CanvasNode] pointer-down:', nodeId, _event)
	}
}

const MAX_DRAG_FULL_RENDER_NODES = 40
let updateDragFullRenderRafId: number | null = null

const updateSelectionDragFullRender = () => {
	updateDragFullRenderRafId = null
	if (!selectionFrameDragging.value || selectionFrameDragNodeIds.value.size === 0) {
		if (selectionDragFullRenderIds.value.size > 0) {
			selectionDragFullRenderIds.value = new Set()
		}
		return
	}

	const nextFullRender = new Set<string>()
	let added = 0
	const nodesById = store.state.nodesById as Record<string, WorkflowNode | undefined>

	for (const id of selectionFrameDragNodeIds.value) {
		if (added >= MAX_DRAG_FULL_RENDER_NODES) break
		const node = nodesById[id]
		if (!node) continue

		if (!isNodeInViewport(node)) continue

		const version = getNodeScreenshotVersion(node)
		const hasCachedScreenshot = screenshotPool.getCachedScreenshot(id, version) != null
		const hasBitmapScreenshot = hasBitmap(id)

		if (!hasCachedScreenshot || !hasBitmapScreenshot) {
			nextFullRender.add(id)
			added++
		}
	}

	selectionDragFullRenderIds.value = nextFullRender
	refreshCanvasNodeLayer()
}

const scheduleUpdateDragFullRender = () => {
	if (updateDragFullRenderRafId !== null) return
	updateDragFullRenderRafId = requestAnimationFrame(() => {
		updateSelectionDragFullRender()
	})
}

const onSelectionFrameDragStart = (payload: { nodeIds: string[] }) => {
	selectionFrameDragging.value = true
	selectionFrameDragNodeIds.value = new Set(payload.nodeIds)
	selectionDragFullRenderIds.value = new Set()
	selectionDragMoveTick.value = 0
	markViewportMotion()
	scheduleUpdateDragFullRender()
	refreshCanvasNodeLayer()
}

const onSelectionFrameDrag = (payload: { dx: number; dy: number; nodeIds: string[] }) => {
	store.dispatch('moveNodesBy', payload)
	selectionDragMoveTick.value++
	markViewportMotion()
	scheduleAsyncEdgeRender()
	scheduleUpdateDragFullRender()
	refreshCanvasNodeLayer()
}

const onSelectionFrameDragEnd = (payload: { nodeIds: string[] }) => {
	selectionFrameDragging.value = false
	selectionFrameDragNodeIds.value = new Set()
	selectionDragFullRenderIds.value = new Set()
	selectionDragMoveTick.value++
	if (updateDragFullRenderRafId !== null) {
		cancelAnimationFrame(updateDragFullRenderRafId)
		updateDragFullRenderRafId = null
	}
	forceEndViewportMotion()
	refreshCanvasNodeLayer()
	scheduleVisibleNodeScreenshots()
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
	// Canvas2D截图渲染清理
	try {
		disposeCanvasScreenshot()
	} catch {
		if (import.meta.env.DEV) {
			console.warn('[CanvasScreenshot] cleanup failed')
		}
	}
	// 卸载全局 404 错误拦截器
	try {
		uninstallGlobal404Handlers?.()
	} catch {
		/* ignore */
	}
	cleanupAgentToolListener()
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
	blueprintLog.append(t('aiworkflow.page.blueprintLog.pageReady'), {
		category: 'system',
		level: 'INFO',
		tag: 'init'
	})

	setupAgentToolListener()

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
		await recoverMeshyTaskStates({ silent: true })
		if (!currentProjectId.value) {
			noProjectSelected.value = true
		}
	})()

	if (isElectronRuntime) {
		chatModelKey.value = 'codex'
		agentConversationMode.value = 'agent'
		const w = window as Window & DwebRuntimeWindow
		if (w.dweb?.agent?.stream) {
			agentBackend.value = 'dvsagent'
		} else {
			agentBackend.value = 'copilot'
		}
	}

	if (isElectronRuntime && shouldAutoHelloOnLaunch && !autoHelloSent) {
		autoHelloSent = true
		window.setTimeout(() => {
			if (chatSending.value) return
			if (chatModelKey.value !== 'codex') chatModelKey.value = 'codex'
			agentConversationMode.value = 'agent'
			chatCollapsed.value = false
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
		startupProgress.show(t('aiworkflow.page.startup.enterBlueprint'), 2500)
		startupProgress.reset(t('aiworkflow.page.startup.enterBlueprint'))
	}

	// Step 1. 读取本地项目数据
	let projectReady = false
	if (request.kind === 'open') {
		await startupProgress.runStep(
			'project.load',
			t('aiworkflow.page.startup.loadProjectData'),
			async () => {
				const ok = await loadProjectById(request.projectId)
				if (!ok) throw new Error(t('aiworkflow.page.startup.projectLoadFailed'))
				projectReady = true
				return true
			},
			{ errorDetailOnFailure: true }
		)
	} else {
		await startupProgress.runStep(
			'project.new',
			t('aiworkflow.page.startup.initProject'),
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
			t('aiworkflow.page.startup.loadAssets'),
			async () => {
				try {
					await recoverComfyUIRunStates({ silent: true })
					await recoverMeshyTaskStates({ silent: true })
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

// Canvas截图渲染开发调试命令
if (import.meta.env.DEV) {
	// @ts-ignore
	window.__toggleCanvasScreenshot = () => {
		canvasScreenshotEnabled.value = !canvasScreenshotEnabled.value
		console.log('[CanvasScreenshot] Enabled:', canvasScreenshotEnabled.value)
	}

	// @ts-ignore
	window.__toggleCanvasDebug = () => {
		canvasScreenshotDebugMode.value = !canvasScreenshotDebugMode.value
		console.log('[CanvasScreenshot] Debug mode:', canvasScreenshotDebugMode.value)
	}

	// @ts-ignore
	window.__getCanvasScreenshotState = () => {
		console.log('[CanvasScreenshot] State:', canvasScreenshotState.value)
		console.log('[CanvasScreenshot] Canvas entries:', canvasNodeEntries.value.length)
		return canvasScreenshotState.value
	}

	// @ts-ignore
	window.__forceCanvasWarmup = async () => {
		console.log('[CanvasScreenshot] Forcing warmup...')
		await warmupCanvasAll(nodeScreenshotMap.value)
		console.log('[CanvasScreenshot] Warmup complete')
	}

	// @ts-ignore
	window.__getRenderModes = () => {
		const nodes = safeVisibleRenderNodes.value
		const modes = {
			canvas: 0,
			'dom-screenshot': 0,
			full: 0
		}
		for (const node of nodes) {
			const mode = getNodeRenderMode(String(node.id ?? '').trim())
			modes[mode]++
		}
		console.log('[CanvasScreenshot] Render modes:', modes)
		console.log('[CanvasScreenshot] Total nodes:', nodes.length)
		return modes
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
.aiwf-overlay-bottom-left,
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

.aiwf-overlay-bottom-left {
	z-index: var(--aiwf-chrome-z-index, 30);
}

.aiwf-overlay-alerts {
	z-index: var(--aiwf-alert-z-index, 130);
}

.aiwf-overlay-top-left > *,
.aiwf-overlay-top-right > *,
.aiwf-overlay-floating > *,
.aiwf-overlay-bottom-left > *,
.aiwf-overlay-alerts > * {
	pointer-events: auto;
}

.aiwf-overlay-bottom-left {
	display: flex;
	align-items: flex-end;
	justify-content: flex-start;
	padding: 0 0 16px 16px;
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

.aiwf-viewport-motion .aiwf-canvas,
.aiwf-viewport-motion .wf-edge-canvas,
.aiwf-viewport-motion .node-canvas-layer {
	will-change: transform;
	contain: layout paint;
}

.aiwf-viewport-motion .wf-node {
	contain: layout paint style;
	will-change: transform;
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
