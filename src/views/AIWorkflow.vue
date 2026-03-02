<template>
  <div class="aiwf-page bg-vscode">
    <BlueprintCanvas
      class="aiwf-canvas"
      :viewport="viewport"
      @update:viewport="onViewportUpdate"
      @canvas-contextmenu="onCanvasContextMenu"
      @box-select="onBoxSelect"
      @pointerdown="onCanvasPointerDown"
      @dragover.prevent="onCanvasDragOver"
      @drop.prevent="onCanvasDrop"
      v-slot="vp"
    >
      <BlueprintProjectToolbar
        ref="projectToolbarRef"
        :projects="projectList"
        :currentProjectName="currentProjectName"
        @request-new="onRequestNewProject"
        @request-save="onRequestSaveProject"
        @request-load-list="refreshProjectList"
        @request-load-project="onRequestLoadProject"
        @request-delete-project="onRequestDeleteProject"
        @request-import-local="onRequestImportLocalProject"
        @request-export="onRequestExportProject"
      />

      <WorkflowEdgeLayer
        :edges="edgeRenders(vp.worldToScreen)"
        :selectedEdgeId="selectedEdgeId"
        :draft="draftRender(vp.worldToScreen)"
        @select-edge="onSelectEdge"
      />

      <component
        v-for="node in renderNodes"
        :key="node.id"
        :is="nodeComponent(node)"
        :nodeId="node.id"
        :title="node.title"
        :alias="node.alias"
        :nodeType="node.type"
        :subtitle="node.subtitle"
        :width="node.width"
        :height="node.height"
        :zoom="vp.zoom"
        :worldX="node.worldX"
        :worldY="node.worldY"
        :inputs="node.inputs"
        :outputs="node.outputs"
        :selected="selectedNodeIds.includes(node.id)"
        :hoverInputAnchorId="hoverInputAnchorId(node.id)"
        :hoverOutputAnchorId="hoverOutputAnchorId(node.id)"
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
        v-bind="nodeExtraProps(node)"
        @update:worldX="onNodeX(node.id, $event)"
        @update:worldY="onNodeY(node.id, $event)"
        @select="onSelectNode"
        @start-link="onStartLink($event, vp.screenToWorld)"
        @end-link="onEndLink"
        @copy="() => onNodeCopy(node.id)"
        @refresh="() => onNodeRefresh(node.id)"
        @delete="() => onNodeDelete(node.id)"
        @set-type="onNodeSetType(node.id, $event)"
        @upload-resource="onNodeUploadResource(node.id, $event.file, $event.kind)"
        @clear-resource="onNodeClearResource(node.id)"
        @resize="onNodeResize(node.id, $event)"
        @update-text-value="onNodeTextValueUpdate(node.id, $event)"
        @add-merge-item="onTextMergeItemAdd(node.id)"
        @remove-merge-item="onTextMergeItemRemove(node.id, $event)"
        @move-merge-item="onTextMergeItemMove(node.id, $event)"
        @update-image-settings="onNodeImageSettingsUpdate(node.id, $event)"
        @update-branch="onStoryBranchUpdate(node.id, $event)"
        @add-branch="onStoryBranchAdd(node.id)"
        @remove-branch="onStoryBranchRemove(node.id, $event)"
        @update-preview-settings="onStoryPreviewSettingsUpdate(node.id, $event)"
        @update-video-settings="onNodeVideoSettingsUpdate(node.id, $event)"
        @screenshot="onVideoScreenshot(node.id, $event)"
        @update-comfyui-settings="onComfyUISettingsUpdate(node.id, $event)"
        @connect-comfyui="onComfyUIConnect(node.id, $event)"
        @select-workflow="onComfyUISelectWorkflow(node.id, $event)"
        @run-comfyui="onComfyUIRun(node.id)"
        @cancel-comfyui="onComfyUICancel(node.id)"
        @preview-contextmenu="onNodePreviewContextMenu(node.id, $event)"
        @media-ready="onNodeMediaReady(node.id)"
        @update-rotate-output="onRotateImageOutput(node.id, $event)"
      />

      <BottomChatDock
        v-model="chatDraft"
        :messages="chatMessages"
        :sending="chatSending"
        :collapsed="chatCollapsed"
        :taskStatus="chatTaskStatus"
        :modelKey="chatModelKey"
        :nanoPreviewUrls="nanoPreviewUrls"
        :nanoPreviewLoadingStates="nanoPreviewLoadingStates"
        :nanoPreviewUrl="nanoPreviewUrl"
        :nanoStatus="nanoStatus"
        :nanoDetail="nanoDetail"
        :nanoBilling="nanoBilling"
        :nanoModelUsed="nanoModelUsed"
        :nanoAnchorNodeId="NANO_ANCHOR_NODE_ID"
        :nanoRefAnchors="nanoRefDockAnchors"
        :nanoHoverAnchorId="nanoHoverAnchorId"
        @send="onSend"
        @update:modelKey="chatModelKey = $event"
        @nanobanana-generate="onNanoBananaGenerate"
        @seedance-generate="onSeedanceGenerate"
        @workflow-end-link="onEndLink"
        @request-expand="chatCollapsed = false"
        @request-collapse="chatCollapsed = true"
        @focus-input="chatCollapsed = false"
        @layout-changed="onDockLayoutChanged"
      />
      <button
        class="aiwf-inspector-toggle"
        type="button"
        @pointerdown.stop
        @click.stop="toggleInspector"
      >
        属性
      </button>
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
      <ContextMenu
        :visible="contextMenu.open"
        :x="contextMenu.x"
        :y="contextMenu.y"
        :sections="contextMenuSections"
        @select="onContextMenuSelect"
      />

      <div class="aiwf-toolbar" @pointerdown.stop>
        <button
          class="aiwf-toolbar-btn"
          type="button"
          @pointerdown.stop
          @click.stop="openResourceDialog"
        >
          资源管理器
        </button>
      </div>
      <ResourceManagerPanel
        :open="resourceDialogOpen"
        :resources="resources"
        @close="closeResourceDialog"
        @remove="onRemoveResource"
        @preview="onPreviewResource"
        @refresh-missing="onRefreshMissingResourceRecords"
      />
      <ToastStack :items="toasts" @close="removeToast" @hover="setToastHovering" />
      <div
        v-if="importLimitAlertMessage"
        class="aiwf-import-limit-alert"
        @pointerdown.stop
      >
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
          模板：{{ reuseRecordConfirm.workflowName || "未知模板" }}
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
    </BlueprintCanvas>

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
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStore } from 'vuex'
import BlueprintCanvas from '../ui/BluePrint/BlueprintCanvas.vue'
import WorkflowNodeBase from '../ui/WorkFlow/WorkflowNodeBase.vue'
import WorkflowEdgeLayer from '../ui/WorkFlow/WorkflowEdgeLayer.vue'
import WorkflowTextNode from '../ui/WorkFlow/WorlFlowNodes/WorkflowTextNode.vue'
import WorkflowTextMergeNode from '../ui/WorkFlow/WorlFlowNodes/WorkflowTextMergeNode.vue'
import WorkflowImageNode from '../ui/WorkFlow/WorlFlowNodes/WorkflowImageNode.vue'
import WorkflowRotateImageNode from '../ui/WorkFlow/WorlFlowNodes/WorkflowRotateImageNode.vue'
import WorkflowVideoNode from '../ui/WorkFlow/WorlFlowNodes/WorkflowVideoNode.vue'
import WorkflowStoryNode from '../ui/WorkFlow/WorlFlowNodes/WorkflowStoryNode.vue'
import WorkflowComfyUINode from '../ui/WorkFlow/WorlFlowNodes/WorkflowComfyUINode.vue'
import BlueprintProjectToolbar, { type BlueprintProjectListItem } from '../ui/WorkFlow/BlueprintProjectToolbar.vue'
import ResourceManagerPanel from '../ui/WorkFlow/ResourceManagerPanel.vue'
import WorkflowInspectorPanel from '../ui/UIComponent/WorkflowInspectorPanel.vue'
import BottomChatDock, {
  type BottomChatMessage,
  type NanoBananaConfig,
  type SeedanceConfig,
} from '../ui/UIComponent/BottomChatDock.vue'
import ContextMenu, { type ContextMenuSection } from '../ui/UIComponent/ContextMenu.vue'
import ToastStack, { type ToastItem } from '../ui/UIComponent/ToastStack.vue'
import FullscreenProgressOverlay from '../ui/UIComponent/FullscreenProgressOverlay.vue'
import { buildDeleteAction, type WorkflowAction } from '../aiworkflow/actions'
import { exportWorkflowImageOutputPng } from '../aiworkflow/imageOutput'
import type { WorkflowAnchorSpec, WorkflowNode, WorkflowSelectionTarget, WorkflowState } from '../aiworkflow/types'
import {
  buildSnapshotFromState,
  isValidBlueprintSnapshot,
  normalizeSnapshotResourceUrls,
  type AIWorkflowDraftSnapshot,
} from '../aiworkflow/persistence/blueprintSnapshot'
import { parseComfyWorkflowIO } from '../aiworkflow/domain/comfyui/parseWorkflowIO'
import { hitTestNodesInWorldRect } from '../aiworkflow/domain/selection/hitTestNodesInWorldRect'
import { anchorKind, anchorKindLabel, canLinkAnchors, type AnchorKind } from '../aiworkflow/domain/link/anchorKinds'
import { AIWorkflowKey } from '../store/aiworkflow'
import { createDefaultAIWorkflowState } from '../store/aiworkflow/store'
import { ComfyUIBridgeService } from '../network/ComfyUIBridgeService'
import { BlueprintProjectService } from '../network/BlueprintProjectService'
import { MediaResourceImportManager } from '../aiworkflow/MediaResourceImportManager'
import { VideoMetadataReadQueue } from '../aiworkflow/VideoMetadataReadQueue'
import { createVideoFirstFrameThumbnail } from '../aiworkflow/domain/resource/createVideoFirstFrameThumbnail'
import { canUseFileSystemHandles, ensureReadPermission, getLocalFileHandle, putLocalFileHandle } from '../aiworkflow/localFileHandleDb'
import { resolveBackendUrl } from '../network/backendConfig'
import { isElectron, openFolderForPath } from '../electronBridge'

const router = useRouter()
const route = useRoute()

const store = useStore<WorkflowState>(AIWorkflowKey)

const AIWF_LAST_PROJECT_STORAGE_KEY = 'dweb.aiworkflow.lastProjectId.v1'

const viewport = computed(() => store.state.viewport)
const onViewportUpdate = (v: { zoom: number; panX: number; panY: number }) => {
  store.commit('setViewport', v)
}

// Edges are resolved from DOM anchor centers. During wheel zoom, Vue will re-render
// before the browser applies the new CSS transforms, so rects can be "one frame" stale.
// We schedule a post-layout bump to force a second render with fresh rects.
const anchorLayoutVersion = ref(0)
let anchorLayoutRaf = 0
let anchorLayoutRaf2 = 0
const scheduleAnchorLayoutRefresh = () => {
  if (anchorLayoutRaf) cancelAnimationFrame(anchorLayoutRaf)
  if (anchorLayoutRaf2) cancelAnimationFrame(anchorLayoutRaf2)
  // Use double-rAF so we bump after the browser has applied transforms.
  // This keeps DOM-measured anchor centers in sync during wheel zoom.
  anchorLayoutRaf = requestAnimationFrame(() => {
    anchorLayoutRaf = 0
    anchorLayoutRaf2 = requestAnimationFrame(() => {
      anchorLayoutRaf2 = 0
      anchorLayoutVersion.value += 1
    })
  })
}

watch(
  () => [viewport.value.zoom, viewport.value.panX, viewport.value.panY],
  async () => {
    await nextTick()
    scheduleAnchorLayoutRefresh()
  },
  { flush: 'post' }
)

// NOTE: must be declared before any watch/computed that references it.
const chatModelKey = ref<'deepseek' | 'nanobanana' | 'seedance'>('deepseek')

const nodes = computed(() => store.state.nodeOrder.map((id) => store.state.nodesById[id]).filter(Boolean))
const NANO_ANCHOR_NODE_ID = 'wf-nanobanana-ref-input'
const NANO_REF_IMAGE_MAX = 14

const ensureNanoAnchorNode = () => {
  const existing = store.state.nodesById[NANO_ANCHOR_NODE_ID]
  const inputs: WorkflowAnchorSpec[] = Array.from({ length: NANO_REF_IMAGE_MAX }, (_, i) => ({
    id: `ref-${i + 1}`,
    label: `参考图 ${i + 1}`,
    mediaType: 'image',
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
    createdAt: existing?.createdAt ?? Date.now(),
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

const renderNodes = computed(() => nodes.value.filter((n) => n.id !== NANO_ANCHOR_NODE_ID))

const edges = computed(() => store.state.edgeOrder.map((id) => store.state.edgesById[id]).filter(Boolean))
const renderEdges = computed(() => {
  // Only show NanoBanana reference edges when in NanoBanana mode and dock is expanded.
  if ((chatModelKey.value === 'nanobanana' || chatModelKey.value === 'seedance') && !chatCollapsed.value) return edges.value
  return edges.value.filter((e) => e.toNodeId !== NANO_ANCHOR_NODE_ID && e.fromNodeId !== NANO_ANCHOR_NODE_ID)
})
const selectedNodeId = computed(() => store.state.selectedNodeId)
const selectedNodeIds = computed(() => store.state.selectedNodeIds ?? [])
const selectedEdgeId = computed(() => store.state.selectedEdgeId)
const selectedNode = computed(() => (selectedNodeId.value ? store.state.nodesById[selectedNodeId.value] : null))
const selectedEdge = computed(() => (selectedEdgeId.value ? store.state.edgesById[selectedEdgeId.value] : null))
const selectedNodeResource = computed(() => {
  const node = selectedNode.value
  if (!node?.resourceId) return null
  return store.state.resourcesById[node.resourceId] ?? null
})

const chatDraft = computed({
  get: () => store.state.chatDraft ?? '',
  set: (v: string) => store.commit('setChatDraft', { text: v }),
})

const chatMessages = ref<BottomChatMessage[]>([])
const chatSending = ref(false)
const chatCollapsed = ref(true)

const nanoPreviewUrl = ref<string>('')
const nanoPreviewUrls = ref<string[]>([])
const nanoPreviewLoadingStates = ref<boolean[]>([])
const nanoStatus = ref<string>('')
const nanoBilling = ref<string>('')
const nanoModelUsed = ref<string>('')
const nanoDetail = ref<string>('')

const appendNanoDetail = (line: string) => {
  const text = String(line || '').trim()
  if (!text) return
  nanoDetail.value = nanoDetail.value ? `${nanoDetail.value}\n${text}` : text
}

const disconnectNanoRefEdges = () => {
  const removeIds: string[] = []
  for (const edgeId of store.state.edgeOrder.slice()) {
    const e = store.state.edgesById[edgeId]
    if (!e) continue
    if (e.toNodeId === NANO_ANCHOR_NODE_ID || e.fromNodeId === NANO_ANCHOR_NODE_ID) removeIds.push(edgeId)
  }
  for (const edgeId of removeIds) store.commit('removeEdge', { edgeId })
}

const onDockLayoutChanged = () => {
  if (chatModelKey.value !== 'nanobanana' && chatModelKey.value !== 'seedance') return
  if (chatCollapsed.value) return
  scheduleAnchorLayoutRefresh()
}

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
    if (v && (chatModelKey.value === 'nanobanana' || chatModelKey.value === 'seedance')) disconnectNanoRefEdges()
  }
)

const nanoRefDockAnchors = computed(() => {
  const pseudo = store.state.nodesById[NANO_ANCHOR_NODE_ID]
  const ins = Array.isArray(pseudo?.inputs) ? pseudo!.inputs : []
  return ins.map((a, idx) => {
    const edge = edges.value.find((e) => e.toNodeId === NANO_ANCHOR_NODE_ID && e.toAnchorId === a.id) ?? null
    const fromNode = edge ? store.state.nodesById[edge.fromNodeId] : null
    const fromTitle = fromNode ? String(fromNode.alias || fromNode.title || fromNode.id) : ''
    return {
      id: a.id,
      label: a.label || `参考图 ${idx + 1}`,
      connected: !!edge,
      connectedFrom: fromTitle,
    }
  })
})

const chatTaskStatusText = ref('')
const chatTaskStatus = computed(() => chatTaskStatusText.value || (chatSending.value ? 'AI 任务：生成中…' : 'AI 任务：空闲'))

const makeChatId = () => `aiwf-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const onSend = async () => {
  // DeepSeek chat only. NanoBanana uses a dedicated generate event.
  if (chatModelKey.value === 'nanobanana' || chatModelKey.value === 'seedance') return
  const content = String(chatDraft.value || '').trim()
  if (!content) return

  const history = chatMessages.value
    .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'system')
    .map((m) => ({ role: m.role, content: m.content }))

  // 1) 先把用户输入落到历史
  const userMsg: BottomChatMessage = { id: makeChatId(), role: 'user', content }
  const assistantMsg: BottomChatMessage = { id: makeChatId(), role: 'assistant', content: '' }
  chatMessages.value = chatMessages.value.concat([userMsg, assistantMsg])
  store.commit('setChatDraft', { text: '' })

  // 2) 调后端 DeepSeek 接口获取回复
  if (chatSending.value) return
  chatSending.value = true
  chatTaskStatusText.value = ''
  try {
    const svc = new ComfyUIBridgeService()

    for await (const ev of svc.blueprintChatStream({ content, history })) {
      if (ev.type === 'done') break
      if (ev.type === 'error') {
        chatTaskStatusText.value = 'AI 任务：错误'
        pushToast('AI 对话失败：' + String(ev.error?.message ?? 'unknown'), 'warn')
        break
      }
      const m = ev.message
      if (m.type === 'agentToUi/text') {
        const delta = String((m as any)?.payload?.text ?? '')
        if (delta) assistantMsg.content += delta
        continue
      }
      if (m.type === 'agentToUi/taskStatus') {
        const phase = String((m as any)?.payload?.phase ?? '')
        const msg = (m as any)?.payload?.message
        chatTaskStatusText.value = 'AI 任务：' + String(typeof msg === 'string' && msg.trim() ? msg.trim() : phase || '处理中')
        continue
      }
      if (m.type === 'agentToUi/error') {
        const msg = (m as any)?.payload?.message
        chatTaskStatusText.value = 'AI 任务：错误'
        pushToast('AI 对话失败：' + String(typeof msg === 'string' ? msg : 'unknown'), 'warn')
        break
      }
    }

    if (!assistantMsg.content.trim()) {
      pushToast('AI 返回为空，请重试。', 'warn')
    }
  } catch (err: any) {
    pushToast('AI 对话失败：' + String(err?.message ?? err ?? 'unknown'), 'warn')
  } finally {
    chatSending.value = false
  }
}

const onNanoBananaGenerate = async (payload: { prompt: string; config: NanoBananaConfig }) => {
  if (chatSending.value) return
  const prompt = String(payload?.prompt ?? '').trim()
  if (!prompt) return

  const sendingStartAt = Date.now()
  chatSending.value = true
  nanoStatus.value = '准备中…'
  nanoBilling.value = ''
  nanoModelUsed.value = ''
  nanoDetail.value = ''
  nanoPreviewUrl.value = ''
  const requestedCountRaw = Number((payload?.config as any)?.quantity ?? 1)
  const requestCount = Number.isFinite(requestedCountRaw)
    ? Math.max(1, Math.min(4, Math.floor(requestedCountRaw)))
    : 1
  nanoPreviewUrls.value = Array.from({ length: requestCount }, () => '')
  nanoPreviewLoadingStates.value = Array.from({ length: requestCount }, () => true)
  nanoStatus.value = `并发请求中（0/${requestCount}）`
  try {
    const svc = new ComfyUIBridgeService()

    const anchorIndexFromId = (id: string) => {
      const m = String(id || '').match(/(\d+)/)
      const n = m ? Number(m[1]) : NaN
      return Number.isFinite(n) ? n : 0
    }

    // Collect reference images from workflow edges connected to the NanoBanana pseudo node.
    const refFiles: Array<{ idx: number; file: File }> = []
    const refSources: Array<{ idx: number; nodeType: WorkflowNode['type'] }> = []
    const pseudo = store.state.nodesById[NANO_ANCHOR_NODE_ID]
    const inputAnchors = Array.isArray(pseudo?.inputs) ? pseudo!.inputs : ([] as WorkflowAnchorSpec[])
    const sortedAnchors = [...inputAnchors].sort((a, b) => anchorIndexFromId(a.id) - anchorIndexFromId(b.id))
    for (const a of sortedAnchors) {
      if (refFiles.length >= NANO_REF_IMAGE_MAX) break
      const edge = edges.value.find((e) => e.toNodeId === NANO_ANCHOR_NODE_ID && e.toAnchorId === a.id)
      if (!edge) continue
      const fromNode = store.state.nodesById[edge.fromNodeId]
      if (!fromNode) continue
      const isImageSource = fromNode.type === 'image' || fromNode.type === 'rotate-image'
      if (!isImageSource) {
        pushToast(`NanoBanana 参考图仅支持连接「图片节点/旋转图片节点」输出（当前：${fromNode.type}）。`, 'warn')
        continue
      }
      let url = nodeResourceUrl(fromNode)
      if (!url) {
        pushToast('NanoBanana 参考图来源节点缺少图片资源。', 'warn')
        continue
      }
      const nameBase = String(nodeResourceName(fromNode) ?? fromNode.alias ?? fromNode.title ?? 'ref').trim() || 'ref'
      const idx = anchorIndexFromId(a.id)

      // For rotate-image output, persist local/blob/data URL to backend asset first,
      // then cache refs for NanoBanana so HTTP payload always has concrete files.
      if (
        fromNode.type === 'rotate-image' &&
        (String(url).startsWith('blob:') || String(url).startsWith('data:') || String(url).startsWith('file:') || String(url).startsWith('/'))
      ) {
        try {
          const uploaded = await uploadLocalResourceAndGetUrl(
            String(url),
            'image',
            `${nameBase}_rot`,
            { projectId: currentProjectId.value }
          )
          const rid = String((fromNode as any).resourceId ?? '').trim()
          if (rid) {
            store.commit('patchResource', {
              resourceId: rid,
              patch: {
                url: uploaded.url,
                sourcePath: uploaded.absolutePath || undefined,
              } as any,
            })
          }
          url = uploaded.url
        } catch {
          // fallback to original local/blob/data URL below
        }
      }

      let file: File | null = null
      try {
        // Image node: prefer node-output (cropped) file if crop is enabled.
        // Rotate-image node: directly use current rotated output image file.
        if (fromNode.type === 'image') {
          file = await buildCroppedImageTransferFile(fromNode, url, nameBase)
        }
        if (!file) file = await fileFromUrl(url, nameBase)
      } catch {
        file = null
      }

      if (file) {
        refFiles.push({ idx, file })
        refSources.push({ idx, nodeType: fromNode.type })
      }
    }

    refFiles.sort((a, b) => a.idx - b.idx)
    refSources.sort((a, b) => a.idx - b.idx)

    const rotateRefIdx = refSources.filter((s) => s.nodeType === 'rotate-image').map((s) => s.idx)
    const imageRefIdx = refSources.filter((s) => s.nodeType === 'image').map((s) => s.idx)
    let finalPrompt = prompt
    if (rotateRefIdx.length) {
      const relLines: string[] = []
      relLines.push('[Reference Relation Rules]')
      if (imageRefIdx.length) {
        relLines.push(`- Original refs: #${imageRefIdx.join(', #')}.`)
      }
      relLines.push(`- Rotated refs: #${rotateRefIdx.join(', #')} (these are rotated-view references generated from the same original content).`)
      relLines.push('- REQUIRED: Keep the exact identical BACKGROUND, environment, and lighting from original refs.')
      relLines.push('- REQUIRED: Keep exact identity/texture/structure of the subject from original refs, and ONLY align the camera/view/framing to rotated refs.')
      relLines.push('- Do not replace the subject, do not alter the background, do not invent new materials or elements.')
      finalPrompt = `${prompt}\n\n${relLines.join('\n')}`
    }

    const ar = String(payload?.config?.aspectRatio ?? '').trim()
    const selectedImageModel = String((payload as any)?.config?.imageModel ?? '').trim()
    const useProByModel = selectedImageModel === 'gemini-3-pro-image-preview'

    // Cache ref images to Django first, then pass ordered cache ids.
    let cachedRefIds: string[] = []
    let useDirectRefUpload = false
    if (refFiles.length) {
      const cacheForm = new FormData()
      for (const r of refFiles) {
        const safeIdx = r.idx > 0 ? r.idx : 0
        const name = safeIdx ? `ref-${safeIdx}-${r.file.name}` : r.file.name
        cacheForm.append('refImages', r.file, name)
      }
      const cacheRes = await svc.nanoBananaCacheRefImages(cacheForm)
      if (cacheRes.ok && Array.isArray((cacheRes as any).cacheIds)) {
        cachedRefIds = ((cacheRes as any).cacheIds as string[]).map((v) => String(v || '')).filter(Boolean)
      } else {
        // Fallback: direct upload if cache endpoint fails.
        const warnMsg = '参考图缓存失败，已回退为直接上传。'
        appendNanoDetail(`警告：${warnMsg}`)
        pushToast(`NanoBanana：${warnMsg}`, 'warn')
        useDirectRefUpload = true
      }
    }
    let completedCount = 0
    let failedCount = 0
    const updateProgressStatus = () => {
      nanoStatus.value = `并发请求中（${completedCount}/${requestCount}）`
      if (completedCount >= requestCount) {
        const successCount = requestCount - failedCount
        nanoStatus.value = failedCount > 0 ? `完成（成功 ${successCount}，失败 ${failedCount}）` : '完成'
      }
    }

    const runSingleRequest = async (index: number) => {
      const requestNo = index + 1
      const form = new FormData()
      form.set('prompt', finalPrompt)
      if (ar) form.set('aspectRatio', ar)
      if (selectedImageModel) form.set('imageModel', selectedImageModel)
      if (useProByModel || (payload?.config && (payload as any).config?.usePro)) form.set('usePro', '1')
      if (useDirectRefUpload) {
        for (const r of refFiles) form.append('refImages', r.file, r.file.name)
      } else {
        for (const cid of cachedRefIds) form.append('refCacheIds', cid)
      }

      let requestFailed = false
      try {
        for await (const ev of svc.nanoBananaGenerateStream(form)) {
          if (ev.type === 'done') break
          if (ev.type === 'error') {
            const errMsg = String(ev.error?.message ?? 'unknown')
            requestFailed = true
            appendNanoDetail(`请求 ${requestNo} 错误：${errMsg}`)
            pushToast(`NanoBanana 第 ${requestNo} 张失败：` + errMsg, 'warn')
            break
          }

          const m = ev.message
          if (m.type === 'agentToUi/chatMessage') {
            const content = String((m as any)?.payload?.content ?? '')
            try {
              const obj = JSON.parse(content)
              if (obj && typeof obj === 'object') {
                if (typeof (obj as any).imageUrl === 'string') {
                  const nextUrl = resolveBackendUrl(String((obj as any).imageUrl))
                  if (nextUrl) {
                    nanoPreviewUrls.value = nanoPreviewUrls.value.map((v, i) => (i === index ? nextUrl : v))
                    nanoPreviewLoadingStates.value = nanoPreviewLoadingStates.value.map((v, i) => (i === index ? false : v))
                    if (!nanoPreviewUrl.value) nanoPreviewUrl.value = nextUrl
                  }
                }
                if (typeof (obj as any).billing === 'string') nanoBilling.value = String((obj as any).billing)
                if (typeof (obj as any).model === 'string') nanoModelUsed.value = String((obj as any).model)
              }
            } catch {
              // ignore
            }
            continue
          }

          if (m.type === 'agentToUi/error') {
            const msg = (m as any)?.payload?.message
            const errMsg = String(typeof msg === 'string' ? msg : 'unknown')
            requestFailed = true
            appendNanoDetail(`请求 ${requestNo} 错误：${errMsg}`)
            pushToast(`NanoBanana 第 ${requestNo} 张失败：` + errMsg, 'warn')
            break
          }
        }
      } finally {
        nanoPreviewLoadingStates.value = nanoPreviewLoadingStates.value.map((v, i) => (i === index ? false : v))
        if (requestFailed) failedCount += 1
        completedCount += 1
        updateProgressStatus()
      }
    }

    await Promise.all(Array.from({ length: requestCount }, (_, idx) => runSingleRequest(idx)))
  } catch (err: any) {
    const errMsg = String(err?.message ?? err ?? 'unknown')
    nanoStatus.value = '失败'
    appendNanoDetail(`错误：${errMsg}`)
    pushToast('NanoBanana 生成失败：' + errMsg, 'warn')
  } finally {
    // Ensure the preview loading animation is visible even if backend is disconnected and fails fast.
    const minShowMs = 900
    const elapsed = Date.now() - sendingStartAt
    if (elapsed < minShowMs) {
      await new Promise((r) => setTimeout(r, minShowMs - elapsed))
    }
    nanoPreviewLoadingStates.value = nanoPreviewLoadingStates.value.map(() => false)
    chatSending.value = false
  }
}

const onSeedanceGenerate = async (payload: { prompt: string; config: SeedanceConfig }) => {
  if (chatSending.value) return
  const prompt = String(payload?.prompt ?? '').trim()
  if (!prompt) return

  const sendingStartAt = Date.now()
  chatSending.value = true
  nanoStatus.value = '准备中…'
  nanoBilling.value = ''
  nanoModelUsed.value = ''
  nanoDetail.value = ''
  nanoPreviewUrl.value = ''
  nanoPreviewUrls.value = ['']
  nanoPreviewLoadingStates.value = [true]

  try {
    const svc = new ComfyUIBridgeService()

    const anchorIndexFromId = (id: string) => {
      const m = String(id || '').match(/(\d+)/)
      const n = m ? Number(m[1]) : NaN
      return Number.isFinite(n) ? n : 0
    }

    const refFiles: Array<{ idx: number; file: File }> = []
    const pseudo = store.state.nodesById[NANO_ANCHOR_NODE_ID]
    const inputAnchors = Array.isArray(pseudo?.inputs) ? pseudo!.inputs : ([] as WorkflowAnchorSpec[])
    const sortedAnchors = [...inputAnchors].sort((a, b) => anchorIndexFromId(a.id) - anchorIndexFromId(b.id))
    for (const a of sortedAnchors) {
      if (refFiles.length >= 4) break
      const edge = edges.value.find((e) => e.toNodeId === NANO_ANCHOR_NODE_ID && e.toAnchorId === a.id)
      if (!edge) continue
      const fromNode = store.state.nodesById[edge.fromNodeId]
      if (!fromNode) continue
      const isImageSource = fromNode.type === 'image' || fromNode.type === 'rotate-image'
      if (!isImageSource) continue
      let url = nodeResourceUrl(fromNode)
      if (!url) continue
      const nameBase = String(nodeResourceName(fromNode) ?? fromNode.alias ?? fromNode.title ?? 'ref').trim() || 'ref'
      let file: File | null = null
      try {
        if (fromNode.type === 'image') {
          file = await buildCroppedImageTransferFile(fromNode, url, nameBase)
        }
        if (!file) file = await fileFromUrl(url, nameBase)
      } catch {
        file = null
      }
      if (file) refFiles.push({ idx: anchorIndexFromId(a.id), file })
    }
    refFiles.sort((a, b) => a.idx - b.idx)

    const form = new FormData()
    form.set('prompt', prompt)
    form.set('model', String(payload?.config?.model ?? 'doubao-seedance-1-5-pro-251215'))
    form.set('ratio', String(payload?.config?.ratio ?? 'adaptive'))
    if (String(payload?.config?.resolution ?? '').trim()) {
      form.set('resolution', String(payload?.config?.resolution ?? '').trim())
    }
    form.set('duration', String(Number(payload?.config?.duration ?? 5) || 5))
    form.set('refMode', String(payload?.config?.refMode ?? 'auto'))
    form.set('referenceCount', String(Number(payload?.config?.referenceCount ?? 4) || 4))

    const flag = String(payload?.config?.flags ?? 'none')
    if (flag === 'audio') form.set('generateAudio', '1')
    else if (flag === 'watermark') form.set('watermark', '1')
    else if (flag === 'camera-fixed') form.set('cameraFixed', '1')
    else if (flag === 'draft') form.set('draft', '1')

    for (const rf of refFiles) form.append('refImages', rf.file, rf.file.name)

    for await (const ev of svc.seedanceGenerateStream(form)) {
      if (ev.type === 'done') break
      if (ev.type === 'error') {
        const errMsg = String(ev.error?.message ?? 'unknown')
        nanoStatus.value = '失败'
        appendNanoDetail(`错误：${errMsg}`)
        pushToast('Seedance 生成失败：' + errMsg, 'warn')
        break
      }
      const m = ev.message
      if (m.type === 'agentToUi/chatMessage') {
        const content = String((m as any)?.payload?.content ?? '')
        try {
          const obj = JSON.parse(content)
          if (obj && typeof obj === 'object') {
            const nextUrl = resolveBackendUrl(String((obj as any).videoUrl || ''))
            if (nextUrl) {
              nanoPreviewUrls.value = [nextUrl]
              nanoPreviewLoadingStates.value = [false]
              nanoPreviewUrl.value = nextUrl
            }
            if (typeof (obj as any).billing === 'string') nanoBilling.value = String((obj as any).billing)
            if (typeof (obj as any).model === 'string') nanoModelUsed.value = String((obj as any).model)
          }
        } catch {
          // ignore
        }
        continue
      }
      if (m.type === 'agentToUi/taskStatus') {
        const msg = String((m as any)?.payload?.message ?? '').trim()
        if (msg) nanoStatus.value = msg
        continue
      }
      if (m.type === 'agentToUi/error') {
        const msg = String((m as any)?.payload?.message ?? 'unknown')
        nanoStatus.value = '失败'
        appendNanoDetail(`错误：${msg}`)
        pushToast('Seedance 生成失败：' + msg, 'warn')
        break
      }
    }
  } catch (err: any) {
    const errMsg = String(err?.message ?? err ?? 'unknown')
    nanoStatus.value = '失败'
    appendNanoDetail(`错误：${errMsg}`)
    pushToast('Seedance 生成失败：' + errMsg, 'warn')
  } finally {
    const minShowMs = 900
    const elapsed = Date.now() - sendingStartAt
    if (elapsed < minShowMs) {
      await new Promise((r) => setTimeout(r, minShowMs - elapsed))
    }
    nanoPreviewLoadingStates.value = nanoPreviewLoadingStates.value.map(() => false)
    chatSending.value = false
  }
}

const onNodeCopy = (nodeId: string) => {
  store.commit('copyNode', { nodeId })
}

const collectResourceIdsFromNodes = (nodeIds: string[]) => {
  const out = new Set<string>()
  for (const nodeId of nodeIds) {
    const node = store.state.nodesById[String(nodeId || '').trim()]
    if (!node) continue
    const rid = String((node as any).resourceId ?? '').trim()
    if (rid) out.add(rid)
  }
  return out
}

const removeSelectedNodesWithResourceCleanup = async (explicitNodeIds?: string[]) => {
  const ids = Array.from(
    new Set(
      (explicitNodeIds && explicitNodeIds.length ? explicitNodeIds : selectedNodeIds.value)
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )
  )
  if (!ids.length) return

  const affectedResourceIds = collectResourceIdsFromNodes(ids)
  store.commit('setSelectedNodes', { nodeIds: ids, primaryNodeId: ids[0] ?? null })
  store.commit('removeSelectedNodes')

  for (const rid of affectedResourceIds) {
    if (resourceUsed(rid)) continue
    await removeResourceByPolicy(rid, { silent: true })
  }
}

const normalizePastedNodeResources = (nodeIds: string[]) => {
  const ids = Array.from(new Set((nodeIds ?? []).map((id) => String(id || '').trim()).filter(Boolean)))
  if (!ids.length) return

  const canonicalByUniqueKey = new Map<string, string>()
  for (const rid of store.state.resourceOrder) {
    const r = store.state.resourcesById[rid] as any
    if (!r) continue
    const key = resourceUniqueIndexKey({
      kind: r.kind,
      sourcePath: r.sourcePath,
      url: r.url,
      sourceFingerprint: (r as any).sourceFingerprint,
      localFileKey: (r as any).localFileKey,
      sourceName: (r as any).sourceName,
      sourceSize: (r as any).sourceSize,
      sourceLastModified: (r as any).sourceLastModified,
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
    const resource = store.state.resourcesById[resourceId] as any
    if (!resource) continue

    const key = resourceUniqueIndexKey({
      kind: resource.kind,
      sourcePath: resource.sourcePath,
      url: resource.url,
      sourceFingerprint: (resource as any).sourceFingerprint,
      localFileKey: (resource as any).localFileKey,
      sourceName: (resource as any).sourceName,
      sourceSize: (resource as any).sourceSize,
      sourceLastModified: (resource as any).sourceLastModified,
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

const onNodePaste = (nodeId: string) => {
  const n = store.state.nodesById[nodeId]
  if (!n) return
  pasteNodesWithResourceDedupe({ worldX: n.worldX + 20, worldY: n.worldY + 20 })
}

const onNodeDelete = (nodeId: string) => {
  // If the node is part of multi-selection, delete the whole selection.
  if (selectedNodeIds.value.length > 1 && selectedNodeIds.value.includes(nodeId)) {
    void removeSelectedNodesWithResourceCleanup(selectedNodeIds.value)
    return
  }
  store.commit('setSelectedNode', { nodeId })
  void removeSelectedNodesWithResourceCleanup([nodeId])
}

const onNodeSetType = (nodeId: string, type: 'base' | 'text' | 'text-merge' | 'image' | 'rotate-image' | 'video' | 'story' | 'comfyui') => {
  store.commit('setNodeType', { nodeId, type })
}

const makeResourceId = () => `wf-res-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const objectUrls = new Map<string, string>()

const snapshotRemoteImageToObjectUrl = async (inputUrl: string, resourceId: string) => {
  const url = String(inputUrl || '').trim()
  if (!url) return ''
  if (url.startsWith('blob:') || url.startsWith('data:')) return url
  try {
    const resp = await fetch(url, { cache: 'no-store' })
    if (!resp.ok) return url
    const blob = await resp.blob()
    const objUrl = URL.createObjectURL(blob)
    const rid = String(resourceId || '').trim()
    if (rid) objectUrls.set(rid, objUrl)
    return objUrl
  } catch {
    return url
  }
}

const normalizeSourcePathKey = (raw: unknown) => {
  const v = String(raw ?? '').trim()
  if (!v) return ''
  return v.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase()
}

const normalizeFileSignatureKey = (rawName: unknown, rawSize: unknown, rawLastModified: unknown) => {
  const name = String(rawName ?? '').trim().toLowerCase()
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
  const kind = String(input.kind ?? '').trim().toLowerCase()
  const sourcePathKey = normalizeSourcePathKey(input.sourcePath)
  if (sourcePathKey) return `${kind}|p:${sourcePathKey}`
  const urlKey = normalizeStableUrlKey(input.url)
  if (urlKey) return `${kind}|u:${urlKey}`
  const sourceFingerprint = String(input.sourceFingerprint ?? '').trim().toLowerCase()
  if (sourceFingerprint) return `${kind}|f:${sourceFingerprint}`
  const localFileKey = String(input.localFileKey ?? '').trim().toLowerCase()
  if (localFileKey) return `${kind}|k:${localFileKey}`
  const fileSig = normalizeFileSignatureKey(input.sourceName, input.sourceSize, input.sourceLastModified)
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
    const r = store.state.resourcesById[rid] as any
    if (!r) continue
    const cur = resourceUniqueIndexKey({
      kind: r.kind,
      sourcePath: r.sourcePath,
      url: r.url,
      sourceFingerprint: r.sourceFingerprint,
      localFileKey: r.localFileKey,
      sourceName: r.sourceName,
      sourceSize: r.sourceSize,
      sourceLastModified: r.sourceLastModified,
    })
    if (cur && cur === key) return rid
  }
  return null
}

const isComfyForwardResource = (resource: any) => {
  const url = String(resource?.url ?? '').trim().toLowerCase()
  return /\/api\/workflow\/(view|outputs)(\?|$)/.test(url)
}

const isDjangoManagedResource = (resource: any) => {
  if (!resource) return false
  if (isComfyForwardResource(resource)) return false
  const sp = normalizeSourcePathKey(resource?.sourcePath)
  if (sp.includes('/media/')) return true
  const url = String(resource?.url ?? '').trim()
  if (!url) return false
  try {
    const u = new URL(url, window.location.origin)
    if (/\/media\//.test(u.pathname)) return true
    if (/\/api\/workflow\/projects\/assets\/local(\?|$)/.test(u.pathname + u.search)) return true
  } catch {
    if (/\/media\//.test(url)) return true
  }
  return false
}

const revokeTrackedObjectUrlsForResource = (resourceId: string) => {
  const rid = String(resourceId ?? '').trim()
  if (!rid) return
  const keys = [rid, `wf-poster:${rid}`]
  for (const k of keys) {
    const url = objectUrls.get(k)
    if (!url) continue
    try {
      URL.revokeObjectURL(url)
    } catch {
      // ignore
    }
    objectUrls.delete(k)
  }
}

const mediaImportManager = new MediaResourceImportManager({
  batchSize: 50,
  maxWorkers: 16,
  // Spec: if exceeding 16*10, queue the rest.
  maxInFlight: 16 * 10,
})

type ActiveImportSession = {
  id: string
  cancelled: boolean
  resourceIdToNode: Map<string, { nodeId: string; kind: 'image' | 'video' }>
  nodeIdToResourceId: Map<string, string>
  resourceState: Map<
    string,
    {
      kind: 'image' | 'video'
      urlReady: boolean
      nodeReady: boolean
      done: boolean
    }
  >
  total: number
  processed: number
}

const importOverlayOpen = ref(false)
const importOverlayTitle = ref('正在导入资源…')
const importOverlayDetail = ref('')
const importOverlayProgress = ref(0)
let activeImportSession: ActiveImportSession | null = null

type ActiveRecoverySession = {
  id: string
  nodeState: Map<
    string,
    {
      resourceId: string
      kind: 'image' | 'video'
      urlReady: boolean
      nodeReady: boolean
      done: boolean
    }
  >
  total: number
  processed: number
}

const recoveryOverlayOpen = ref(false)
const recoveryOverlayTitle = ref('正在恢复资源…')
const recoveryOverlayDetail = ref('')
const recoveryOverlayProgress = ref(0)
let activeRecoverySession: ActiveRecoverySession | null = null

let videoMetadataQueue: VideoMetadataReadQueue | null = new VideoMetadataReadQueue({ concurrency: 2, timeoutMs: 8000 })

const updateImportProgressIfNeeded = (sessionId: string, resourceId: string) => {
  const s = activeImportSession
  if (!s || s.id !== sessionId || s.cancelled) return
  const st = s.resourceState.get(resourceId)
  if (!st || st.done) return

  // Ready means the node preview is actually usable (image texture loaded / video has a frame ready).
  const ready = Boolean(st.urlReady && st.nodeReady)
  if (!ready) return
  st.done = true
  s.processed += 1
  importOverlayProgress.value = s.total > 0 ? Math.max(0, Math.min(1, s.processed / s.total)) : 0
  importOverlayDetail.value = `${Math.min(s.processed, s.total)} / ${s.total}`
  if (s.processed >= s.total) {
    importOverlayProgress.value = 1
    importOverlayOpen.value = false
    activeImportSession = null
  }
}

const cancelActiveRecoverySession = () => {
  recoveryOverlayOpen.value = false
  recoveryOverlayProgress.value = 0
  recoveryOverlayDetail.value = ''
  activeRecoverySession = null
}

const refreshRecoveryUrlReady = (sessionId: string) => {
  const s = activeRecoverySession
  if (!s || s.id !== sessionId) return
  for (const [nodeId, st] of s.nodeState.entries()) {
    if (st.done) continue
    const r = (store.state as any).resourcesById?.[st.resourceId]
    const url = typeof r?.url === 'string' ? String(r.url).trim() : ''
    st.urlReady = Boolean(url)
    updateRecoveryProgressIfNeeded(sessionId, nodeId)
  }
}

const updateRecoveryProgressIfNeeded = (sessionId: string, nodeId: string) => {
  const s = activeRecoverySession
  if (!s || s.id !== sessionId) return
  const st = s.nodeState.get(nodeId)
  if (!st || st.done) return

  // Recovery session tracks URL recovery (not preview readiness).
  // Some nodes may never emit 'media-ready' (e.g. missing permission/handles),
  // and the overlay must not block the editor indefinitely.
  const ready = Boolean(st.urlReady)
  if (!ready) return

  st.done = true
  s.processed += 1
  recoveryOverlayProgress.value = s.total > 0 ? Math.max(0, Math.min(1, s.processed / s.total)) : 0
  recoveryOverlayDetail.value = `${Math.min(s.processed, s.total)} / ${s.total}`
  if (s.processed >= s.total) {
    recoveryOverlayProgress.value = 1
    recoveryOverlayOpen.value = false
    activeRecoverySession = null
  }
}

const finalizeRecoverySessionAfterUrlRecoveryAttempt = (sessionId: string) => {
  const s = activeRecoverySession
  if (!s || s.id !== sessionId) return

  let missingUrl = 0
  for (const [nodeId, st] of s.nodeState.entries()) {
    if (st.done) continue
    const r = (store.state as any).resourcesById?.[st.resourceId]
    const url = typeof r?.url === 'string' ? String(r.url).trim() : ''
    st.urlReady = Boolean(url)
    if (st.urlReady) {
      updateRecoveryProgressIfNeeded(sessionId, nodeId)
      continue
    }

    // No URL after recovery attempt => treat as processed but missing.
    st.done = true
    missingUrl += 1
    s.processed += 1
  }

  recoveryOverlayProgress.value = s.total > 0 ? Math.max(0, Math.min(1, s.processed / s.total)) : 0
  recoveryOverlayDetail.value = `${Math.min(s.processed, s.total)} / ${s.total}`
  if (missingUrl > 0) {
    recoveryOverlayDetail.value = `${Math.min(s.processed, s.total)} / ${s.total}（缺失 ${missingUrl}）`
  }
  if (s.processed >= s.total) {
    recoveryOverlayProgress.value = 1
    recoveryOverlayOpen.value = false
    activeRecoverySession = null
    if (missingUrl > 0) {
      pushToast(`有 ${missingUrl} 个本地资源无法自动恢复（缺失 URL）。可在“加载项目”时选择文件夹重新绑定/授权。`, 'warn')
    }
  }
}

const startRecoverySessionFromCurrentState = () => {
  cancelActiveRecoverySession()

  const nodeState = new Map<
    string,
    {
      resourceId: string
      kind: 'image' | 'video'
      urlReady: boolean
      nodeReady: boolean
      done: boolean
    }
  >()

  const nodesById = (store.state as any).nodesById ?? {}
  const nodeOrder = Array.isArray((store.state as any).nodeOrder) ? (store.state as any).nodeOrder : Object.keys(nodesById)
  const resourcesById = (store.state as any).resourcesById ?? {}

  for (const nodeId of nodeOrder) {
    const n = nodesById?.[nodeId]
    if (!n) continue
    const type = String(n.type ?? '').toLowerCase()
    if (type !== 'image' && type !== 'video') continue
    const resourceId = String(n.resourceId ?? '').trim()
    if (!resourceId) continue
    const r = resourcesById?.[resourceId]
    if (!r) continue
    const kind = String(r.kind ?? '').toLowerCase()
    if (kind !== 'image' && kind !== 'video') continue
    const url = typeof r.url === 'string' ? String(r.url).trim() : ''
    nodeState.set(String(nodeId), {
      resourceId,
      kind: kind as 'image' | 'video',
      urlReady: Boolean(url),
      nodeReady: false,
      done: false,
    })
  }

  const total = nodeState.size
  if (!total) return null

  const sessionId = `recover-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  activeRecoverySession = {
    id: sessionId,
    nodeState,
    total,
    processed: 0,
  }
  recoveryOverlayTitle.value = '正在恢复资源…'
  recoveryOverlayOpen.value = true
  recoveryOverlayProgress.value = 0
  recoveryOverlayDetail.value = `0 / ${total}`
  return sessionId
}

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

const scheduleVideoMetadataRead = (payload: { sessionId?: string; resourceId: string; nodeId: string; url: string }) => {
  if (!payload.url) return
  if (!videoMetadataQueue) {
    videoMetadataQueue = new VideoMetadataReadQueue({ concurrency: 2, timeoutMs: 8000 })
  }
  const localQueue = videoMetadataQueue

  localQueue.enqueue([
    {
      id: payload.resourceId,
      url: payload.url,
      onResult: (res) => {
        if (!store.state.nodesById[payload.nodeId]) return

        const w = Number((res as any).width)
        const h = Number((res as any).height)
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return

        const ww = Math.max(1, Math.floor(w))
        const hh = Math.max(1, Math.floor(h))
        store.commit('setNodeVideoSettings', {
          nodeId: payload.nodeId,
          videoSettings: {
            outputWidth: ww,
            outputHeight: hh,
            naturalWidth: ww,
            naturalHeight: hh,
          },
        })
        autoSizeVideoNodeFromDims(payload.nodeId, ww, hh)
        void ensureVideoResourcePoster(payload.resourceId, payload.url)
      },
    },
  ])
}

const cancelActiveImportSession = (opts?: { cleanupUnresolved?: boolean }) => {
  const s = activeImportSession
  importOverlayOpen.value = false
  importOverlayProgress.value = 0
  importOverlayDetail.value = ''
  if (!s) return
  s.cancelled = true

  // stop background processing ASAP
  mediaImportManager.cancel()
  try {
    videoMetadataQueue?.cancel()
  } catch {
    // ignore
  }
  videoMetadataQueue = new VideoMetadataReadQueue({ concurrency: 2, timeoutMs: 8000 })
  try {
  } catch {
    // ignore
  }

  if (opts?.cleanupUnresolved) {
    for (const [rid, info] of s.resourceIdToNode.entries()) {
      const st = s.resourceState.get(rid)
      if (st?.done) continue

      // Remove unresolved nodes/resources and revoke any blob urls we created.
      if (store.state.nodesById[info.nodeId]) store.commit('removeNode', { nodeId: info.nodeId })
      if (store.state.resourcesById[rid]) {
        revokeTrackedObjectUrlsForResource(rid)
        store.commit('removeResource', { resourceId: rid })
      }
    }
  }

  activeImportSession = null
}

const onCancelImportOverlay = () => {
  cancelActiveImportSession({ cleanupUnresolved: true })
  pushToast('已取消导入：保留已完成的节点/资源，清理未完成项。', 'info')
}

const resourceUsed = (resourceId: string) => {
  return Object.values(store.state.nodesById).some((n) => n.resourceId === resourceId)
}

const releaseResourceIfUnused = (resourceId: string | null) => {
  if (!resourceId) return
  // NOTE: resources should NOT be auto-removed when nodes clear/replace.
  // They remain in ResourceManager for future reuse.
  // Only explicit "删除" in ResourceManagerPanel will remove them.
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
      const w = Math.max(1, Math.floor((img as any).naturalWidth || img.width || 1))
      const h = Math.max(1, Math.floor((img as any).naturalHeight || img.height || 1))
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

const onNodeUploadResource = (
  nodeId: string,
  file: File,
  kind: 'image' | 'video',
  opts?: { autoDistribute?: boolean }
) => {
  const node = store.state.nodesById[nodeId]
  if (!node) return
  const sourcePath = typeof (file as any)?.path === 'string' ? String((file as any).path).trim() : ''

  const resourceId = makeResourceId()
  const url = URL.createObjectURL(file)
  objectUrls.set(resourceId, url)
  store.commit('addResource', {
    id: resourceId,
    kind,
    name: file.name || `${kind}资源`,
    url,
    ...(sourcePath ? { sourcePath } : {}),
    createdAt: Date.now(),
  })
  store.commit('setNodeResource', { nodeId, resourceId })

  // When an image is uploaded, initialize output resolution from the source image.
  if (kind === 'image') {
    const img = new Image()
    img.onload = () => {
      const w = Math.max(1, Math.floor(img.naturalWidth || img.width || 1))
      const h = Math.max(1, Math.floor(img.naturalHeight || img.height || 1))
      store.commit('setNodeImageSettings', {
        nodeId,
        imageSettings: {
          outputWidth: w,
          outputHeight: h,
          naturalWidth: w,
          naturalHeight: h,
          crop: { x: 0, y: 0, width: 1, height: 1 },
        },
      })
    }
    img.src = url
  }

  // When a video is uploaded, initialize output resolution from the source video.
  if (kind === 'video') {
    scheduleVideoMetadataRead({ resourceId, nodeId, url })
  }

  autoSizeMediaNode(nodeId, url, kind)

  if (kind === 'image' && opts?.autoDistribute !== false) {
    void autoDistributeImageOutputToConnectedNodes(nodeId)
  }

  // do not auto-remove previous resource
}

const onNodeClearResource = (nodeId: string) => {
  const node = store.state.nodesById[nodeId]
  if (!node?.resourceId) return
  store.commit('setNodeResource', { nodeId, resourceId: null })
  // do not auto-remove resources when clearing from node
}

const buildCroppedImageTransferFile = async (
  fromNode: WorkflowNode,
  sourceUrl: string,
  sourceName: string
): Promise<File | null> => {
  if (fromNode.type !== 'image') return null
  const imageSettings = fromNode.imageSettings
  if (!imageSettings?.cropEnabled || !imageSettings.crop) return null
  const outputWidth = Math.max(1, Math.floor(Number(imageSettings.outputWidth ?? imageSettings.naturalWidth ?? 0)))
  const outputHeight = Math.max(1, Math.floor(Number(imageSettings.outputHeight ?? imageSettings.naturalHeight ?? 0)))
  if (!outputWidth || !outputHeight) return null

  const blob = await exportWorkflowImageOutputPng({
    src: sourceUrl,
    outputWidth,
    outputHeight,
    crop: imageSettings.crop,
  })
  if (!blob) return null

  const baseName = String(sourceName || 'image').replace(/\.[^./\\]+$/, '')
  return new File([blob], `${baseName}_crop.png`, { type: 'image/png' })
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
  const sourceResource = store.state.resourcesById[rid]
  if (!sourceResource || sourceResource.kind !== 'image') return

  const sourceUrl = String((sourceResource as any).url ?? '').trim()
  if (!sourceUrl) return
  const sourceName = String((sourceResource as any).name ?? 'image')

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
        type: croppedFile.type || 'image/png',
      })
      onNodeUploadResource(targetId, cloned, 'image', { autoDistribute: false })
      continue
    }
    store.commit('setNodeResource', { nodeId: targetId, resourceId: rid })
    autoSizeMediaNode(targetId, sourceUrl, 'image')
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

const onNodeRefresh = async (nodeId: string) => {
  const node = store.state.nodesById[nodeId]
  if (!node) return
  if (node.type !== 'image' && node.type !== 'video') {
    pushToast('手动刷新仅支持图片/视频节点。', 'warn')
    return
  }

  const expectedKind = node.type === 'image' ? 'image' : 'video'
  const incoming = edges.value.filter((e: any) => e && e.toNodeId === nodeId)
  if (!incoming.length) {
    pushToast('未找到输入连线，无法刷新资源。', 'warn')
    return
  }

  const reasons: string[] = []
  for (const e of incoming) {
    const fromNode = store.state.nodesById[e.fromNodeId]
    if (!fromNode) continue

    const rid = String(fromNode.resourceId ?? '').trim()
    if (rid) {
      const r = store.state.resourcesById[rid]
      if (r && r.kind === expectedKind) {
        if (expectedKind === 'image' && fromNode.type === 'image') {
          const sourceUrl = String((r as any).url ?? '').trim()
          if (sourceUrl) {
            try {
              const croppedFile = await buildCroppedImageTransferFile(
                fromNode,
                sourceUrl,
                String((r as any).name ?? 'image')
              )
              if (croppedFile) {
                onNodeUploadResource(nodeId, croppedFile, 'image')
                pushToast('已按上游图片节点的裁剪结果刷新资源。', 'info')
                return
              }
            } catch {
              // ignore and fallback to original resource
            }
          }
        }
        store.commit('setNodeResource', { nodeId, resourceId: rid })
        const url = String((r as any).url ?? '').trim()
        if (url) autoSizeMediaNode(nodeId, url, expectedKind)
        pushToast(`已从输入锚点刷新${expectedKind === 'image' ? '图片' : '视频'}资源。`, 'info')
        return
      }
      if (r && r.kind !== expectedKind) {
        reasons.push(`上游资源类型为 ${r.kind}，与目标 ${expectedKind} 不匹配`)
      }
    }

    if (fromNode.type === 'comfyui') {
      const outputs = Array.isArray(fromNode.comfyuiSettings?.outputs) ? (fromNode.comfyuiSettings!.outputs! as ComfyLocalizedOutput[]) : []
      const media = comfyOutputForAnchor(outputs, String((e as any).fromAnchorId ?? ''), expectedKind)

      if (media && String((media as any).url || '').trim()) {
        bindMediaResourceToNode(
          nodeId,
          expectedKind,
          String((media as any).url),
          String((media as any).filename || `comfy_${expectedKind}_${Date.now()}`),
          {
            sourcePath: String((media as any).sourcePath || '').trim() || undefined,
          }
        )
        const anchorLabel = String((e as any).fromAnchorId || '输出锚点')
        pushToast(`已从 ComfyUI 锚点 ${anchorLabel} 刷新${expectedKind === 'image' ? '图片' : '视频'}资源。`, 'info')
        return
      }
      reasons.push(`ComfyUI 上游暂无可用${expectedKind === 'image' ? '图片' : '视频'}产出`)
    }
  }

  pushToast(
    reasons.length
      ? `刷新失败：${reasons[0]}`
      : '刷新失败：未找到匹配的输入资源来源。',
    'warn'
  )
}

const onNodeResize = (
  nodeId: string,
  payload: { width: number; height: number; worldX: number; worldY: number }
) => {
  store.commit('setNodeSize', { nodeId, width: payload.width, height: payload.height })
  store.commit('setNodePosition', { nodeId, worldX: payload.worldX, worldY: payload.worldY })
}

const onNodeTextValueUpdate = (nodeId: string, payload: { textValue: string }) => {
	store.commit('setNodeTextValue', { nodeId, textValue: String(payload?.textValue ?? '') })
}

const onTextMergeItemAdd = (nodeId: string) => {
  store.commit('textMergeAddItem', { nodeId })
}

const onTextMergeItemRemove = (nodeId: string, itemId: string) => {
  store.commit('textMergeRemoveItem', { nodeId, itemId })
}

const onTextMergeItemMove = (nodeId: string, payload: { itemId: string; dir: 'up' | 'down' }) => {
  store.commit('textMergeMoveItem', { nodeId, itemId: payload.itemId, dir: payload.dir })
}

const onNodeImageSettingsUpdate = (
	nodeId: string,
	payload: {
    outputWidth?: number
    outputHeight?: number
    naturalWidth?: number
    naturalHeight?: number
    cropEnabled?: boolean
    crop?: { x: number; y: number; width: number; height: number }
  }
) => {
	store.commit('setNodeImageSettings', { nodeId, imageSettings: payload })
  const hasCropPayload = Object.prototype.hasOwnProperty.call(payload, 'crop')
  if (hasCropPayload) {
    queueImageDistributeOnPointerUp(nodeId)
    return
  }
  void autoDistributeImageOutputToConnectedNodes(nodeId)
}

const onNodeVideoSettingsUpdate = (
  nodeId: string,
  payload: { outputWidth?: number; outputHeight?: number; naturalWidth?: number; naturalHeight?: number }
) => {
  const n = store.state.nodesById[nodeId] as any
  const prev = (n?.videoSettings ?? {}) as any
  const next = (payload ?? {}) as any
  const keys: Array<'outputWidth' | 'outputHeight' | 'naturalWidth' | 'naturalHeight'> = [
    'outputWidth',
    'outputHeight',
    'naturalWidth',
    'naturalHeight',
  ]
  let changed = false
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(next, k)) continue
    const a = Number(prev?.[k])
    const b = Number(next?.[k])
    if (!Number.isFinite(a) || !Number.isFinite(b) || a !== b) {
      changed = true
      break
    }
  }
  if (!changed) return
  store.commit('setNodeVideoSettings', { nodeId, videoSettings: payload })
}

const onNodeMediaReady = (nodeId: string) => {
  const s = activeImportSession
  if (s && !s.cancelled) {
    const rid = s.nodeIdToResourceId.get(nodeId)
    if (rid) {
      const st = s.resourceState.get(rid)
      if (st) {
        st.nodeReady = true
        updateImportProgressIfNeeded(s.id, rid)
      }
    }
  }

  const r = activeRecoverySession
  if (!r) return
  const st = r.nodeState.get(nodeId)
  if (!st) return
  st.nodeReady = true
  updateRecoveryProgressIfNeeded(r.id, nodeId)
}

const firstConnectedImageTargetFromVideo = (videoNodeId: string) => {
  const outIds = store.state.nodesById[videoNodeId]?.outputs?.map((o) => o.id) ?? []
  if (!outIds.length) return null
  for (const e of edges.value) {
    if (e.fromNodeId !== videoNodeId) continue
    if (!outIds.includes(e.fromAnchorId)) continue
    const to = store.state.nodesById[e.toNodeId]
    if (to?.type === 'image') return to.id
  }
  return null
}

const onVideoScreenshot = (
  videoNodeId: string,
  payload: { dataUrl: string; width: number; height: number; time: number }
) => {
  const targetImageNodeId = firstConnectedImageTargetFromVideo(videoNodeId)
  if (!targetImageNodeId) return
  const resourceId = makeResourceId()
  const name = `screenshot_${Math.max(0, payload.time).toFixed(3)}.png`
  store.commit('addResource', {
    id: resourceId,
    kind: 'image',
    name,
    url: payload.dataUrl,
    createdAt: Date.now(),
  })
  store.commit('setNodeResource', { nodeId: targetImageNodeId, resourceId })
  store.commit('setNodeImageSettings', {
    nodeId: targetImageNodeId,
    imageSettings: {
      outputWidth: payload.width,
      outputHeight: payload.height,
      naturalWidth: payload.width,
      naturalHeight: payload.height,
      cropEnabled: false,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    },
  })
  autoSizeMediaNode(targetImageNodeId, payload.dataUrl, 'image')
}

const onRotateImageOutput = (
  nodeId: string,
  payload: { dataUrl: string; promptText: string; yaw: number; pitch: number; width: number; height: number }
) => {
  const node = store.state.nodesById[nodeId] as any
  if (!node || node.type !== 'rotate-image') return

  const promptText = String(payload?.promptText ?? '')
  store.commit('setNodeRotatePromptText', { nodeId, text: promptText })

  const dataUrl = String(payload?.dataUrl ?? '').trim()
  if (!dataUrl) return

  const name = `rotate_${nodeId}.png`
  const existingRid = String(node.resourceId ?? '').trim()
  let outputRid = existingRid
  const existing = existingRid ? (store.state.resourcesById[existingRid] as any) : null

  if (existing && existing.kind === 'image') {
    store.commit('patchResource', {
      resourceId: existingRid,
      patch: { name, url: dataUrl } as any,
    })
  } else {
    outputRid = makeResourceId()
    store.commit('addResource', {
      id: outputRid,
      kind: 'image',
      name,
      url: dataUrl,
      createdAt: Date.now(),
    })
    store.commit('setNodeResource', { nodeId, resourceId: outputRid })
  }

  for (const e of edges.value) {
    if (e.fromNodeId !== nodeId) continue
    if (e.fromAnchorId !== 'out-image') continue
    const toNode = store.state.nodesById[e.toNodeId]
    if (!toNode || toNode.type !== 'image') continue
    store.commit('setNodeResource', { nodeId: toNode.id, resourceId: outputRid })
    autoSizeMediaNode(toNode.id, dataUrl, 'image')
  }
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

  const cur = store.state.resourcesById?.[rid] as any
  const existedPoster = typeof cur?.posterUrl === 'string' ? String(cur.posterUrl).trim() : ''
  if (existedPoster) return

  videoPosterGenerating.add(rid)
  try {
    const thumb = await createVideoFirstFrameThumbnail({
      url: rawUrl,
      targetWidth: 360,
      mime: 'image/jpeg',
      quality: 0.86,
      timeoutMs: 12000,
    })

    let nextPosterUrl = ''
    let nextPosterSourcePath = ''
    try {
      const file = new File([thumb.blob], `thumb_${rid}.jpg`, { type: thumb.mime || 'image/jpeg' })
      const uploaded = await blueprintProjectService.uploadAsset(file, 'image', {
        projectId: currentProjectId.value,
        bucket: 'thumbnails',
      })
      if (uploaded.ok) {
        const asset = (uploaded as any).asset ?? {}
        nextPosterUrl = resolveBackendUrl(String(asset?.url || ''))
        nextPosterSourcePath = String(asset?.absolutePath || '').trim()
      }
    } catch {
      // fallback to local objectURL below
    }

    if (!nextPosterUrl) {
      try {
        nextPosterUrl = URL.createObjectURL(thumb.blob)
        objectUrls.set(`wf-poster:${rid}`, nextPosterUrl)
      } catch {
        nextPosterUrl = ''
      }
    }

    if (nextPosterUrl) {
      const prevPoster = String((store.state.resourcesById?.[rid] as any)?.posterUrl || '').trim()
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
          posterSourcePath: nextPosterSourcePath || undefined,
        } as any,
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

const bindMediaResourceToNode = (
  nodeId: string,
  kind: 'image' | 'video',
  url: string,
  name: string,
  opts?: { posterUrl?: string; sourcePath?: string }
) => {
  const node = store.state.nodesById[nodeId]
  if (!node) return
  const resourceId = makeResourceId()
  store.commit('addResource', {
    id: resourceId,
    kind,
    name,
    url,
    ...(opts?.posterUrl ? { posterUrl: String(opts.posterUrl) } : {}),
    ...(opts?.sourcePath ? { sourcePath: String(opts.sourcePath) } : {}),
    createdAt: Date.now(),
  })
  store.commit('setNodeResource', { nodeId, resourceId })

  if (kind === 'image') {
    const img = new Image()
    img.onload = () => {
      const w = Math.max(1, Math.floor(img.naturalWidth || img.width || 1))
      const h = Math.max(1, Math.floor(img.naturalHeight || img.height || 1))
      store.commit('setNodeImageSettings', {
        nodeId,
        imageSettings: {
          outputWidth: w,
          outputHeight: h,
          naturalWidth: w,
          naturalHeight: h,
          cropEnabled: false,
          crop: { x: 0, y: 0, width: 1, height: 1 },
        },
      })
    }
    img.src = url
  }

  if (kind === 'video') {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const w = Math.max(1, Math.floor(video.videoWidth || 1))
      const h = Math.max(1, Math.floor(video.videoHeight || 1))
      store.commit('setNodeVideoSettings', {
        nodeId,
        videoSettings: {
          outputWidth: w,
          outputHeight: h,
          naturalWidth: w,
          naturalHeight: h,
        },
      })
    }
    video.src = url
    video.load()
    if (!opts?.posterUrl) {
      void ensureVideoResourcePoster(resourceId, url)
    }
  }

  autoSizeMediaNode(nodeId, url, kind)
}

const inferMediaKind = (m: { kind?: string; filename?: string; url?: string } | null | undefined): 'image' | 'video' | null => {
  if (!m) return null
  const rawKind = String(m.kind ?? '').toLowerCase().trim()
  if (rawKind === 'image' || rawKind === 'video') return rawKind
  const url = String(m.url ?? '').trim()
  let filenameFromQuery = ''
  if (url) {
    try {
      const u = new URL(url, window.location.origin)
      filenameFromQuery = decodeURIComponent(String(u.searchParams.get('filename') ?? '')).trim()
    } catch {
      filenameFromQuery = ''
    }
  }
  const ref = `${String(m.filename ?? '')} ${filenameFromQuery} ${url}`.toLowerCase()
  if (/\.(mp4|webm|mov|mkv|avi|gif)([?#&]|$)/.test(ref)) return 'video'
  if (/\.(png|jpg|jpeg|webp|bmp)([?#&]|$)/.test(ref)) return 'image'
  return null
}

type ComfyBridgeMedia = {
  kind: 'image' | 'video'
  url: string
  filename?: string
  nodeId?: string
  subfolder?: string
  type?: string
}

type ComfyLocalizedOutput = {
  kind: 'image' | 'video'
  url: string
  filename?: string
  anchorId?: string
  nodeId?: string
  sourcePath?: string
  subfolder?: string
  type?: string
}

const comfyAnchorNodeIdFromAnchorId = (anchorId: string): string => {
  const raw = String(anchorId || '').trim()
  if (!raw) return ''
  if (!raw.startsWith('out-')) return ''
  return raw.slice(4).trim()
}

const comfyOutputForAnchor = (
  outputs: ComfyLocalizedOutput[],
  anchorId: string,
  expectedKind: 'image' | 'video'
) => {
  const byAnchorAndKind = outputs.find((m) =>
    String((m as any)?.anchorId ?? '') === anchorId &&
    String((m as any)?.url ?? '').trim() &&
    inferMediaKind(m as any) === expectedKind
  )
  if (byAnchorAndKind) return byAnchorAndKind

  const byAnchorAny = outputs.find((m) =>
    String((m as any)?.anchorId ?? '') === anchorId &&
    String((m as any)?.url ?? '').trim()
  )
  if (byAnchorAny && inferMediaKind(byAnchorAny as any) === expectedKind) return byAnchorAny

  return outputs.find((m) =>
    String((m as any)?.url ?? '').trim() && inferMediaKind(m as any) === expectedKind
  )
}

const routeComfyOutputsToConnectedNodes = (
  comfyNodeId: string,
  media: ComfyBridgeMedia[],
  opts?: { notifyWarnings?: boolean }
): Promise<{ alerts: string[]; outputs: ComfyLocalizedOutput[] }> => {
  const comfyNode = store.state.nodesById[comfyNodeId]
  if (!comfyNode || comfyNode.type !== 'comfyui') return Promise.resolve({ alerts: [] as string[], outputs: [] as ComfyLocalizedOutput[] })

  const outputs = Array.isArray(comfyNode.outputs) ? comfyNode.outputs : []
  const outputAnchorIds = outputs.map((a: any) => String(a?.id ?? '')).filter(Boolean)
  if (!outputAnchorIds.length) return Promise.resolve({ alerts: [] as string[], outputs: [] as ComfyLocalizedOutput[] })

  const outputAnchorIdSet = new Set(outputAnchorIds)
  const outputAnchorMap = new Map(outputs.map((a: any) => [String(a?.id ?? ''), a]))
  const outputAnchorOrder = new Map(outputs.map((a: any, idx: number) => [String(a?.id ?? ''), idx]))
  const outgoing = edges.value.filter(
    (e: any) => e && e.fromNodeId === comfyNodeId && outputAnchorIdSet.has(String(e.fromAnchorId ?? ''))
  )

  const outgoingByAnchor = new Map<string, any[]>()
  for (const e of outgoing) {
    const anchorId = String(e?.fromAnchorId ?? '')
    if (!anchorId) continue
    const list = outgoingByAnchor.get(anchorId) ?? []
    list.push(e)
    outgoingByAnchor.set(anchorId, list)
  }

  const imageMedia = media.filter((m) => inferMediaKind(m as any) === 'image' && String(m.url || '').trim())
  const videoMedia = media.filter((m) => inferMediaKind(m as any) === 'video' && String(m.url || '').trim())
  const fallbackCursor = { image: 0, video: 0 }
  const alerts = new Set<string>()

  const mediaKey = (m: any) => {
    return `${String(m?.nodeId ?? '')}|${String(m?.filename ?? '')}|${String(m?.subfolder ?? '')}|${String(m?.type ?? '')}|${String(m?.url ?? '')}`
  }

  const run = async () => {
    const assignMap = comfyAnchorAssignments.get(comfyNodeId) ?? new Map<string, string>()
    if (!comfyAnchorAssignments.has(comfyNodeId)) {
      comfyAnchorAssignments.set(comfyNodeId, assignMap)
    }

    const localizedByAnchor = comfyAnchorLocalizedOutputs.get(comfyNodeId) ?? new Map<string, ComfyLocalizedOutput>()
    if (!comfyAnchorLocalizedOutputs.has(comfyNodeId)) {
      comfyAnchorLocalizedOutputs.set(comfyNodeId, localizedByAnchor)
    }

    const importedByMediaKey = new Map<string, ComfyLocalizedOutput>()

    const sortedOutputAnchorIds = [...outputAnchorIds].sort((a, b) => {
      const ai = Number(outputAnchorOrder.get(a) ?? Number.MAX_SAFE_INTEGER)
      const bi = Number(outputAnchorOrder.get(b) ?? Number.MAX_SAFE_INTEGER)
      return ai - bi
    })

    for (const anchorId of sortedOutputAnchorIds) {
      const edgesForAnchor = outgoingByAnchor.get(anchorId) ?? []
      const fromAnchor = outputAnchorMap.get(anchorId)
      const fromAnchorLabel = String((fromAnchor as any)?.label ?? anchorId ?? '输出锚点')
      const fromMediaType = (fromAnchor as any)?.mediaType as WorkflowAnchorSpec['mediaType']

      const targetKinds = edgesForAnchor
        .map((e: any) => {
          const to = store.state.nodesById[e.toNodeId]
          return to?.type === 'image' ? 'image' : to?.type === 'video' ? 'video' : null
        })
        .filter((x: any): x is 'image' | 'video' => x === 'image' || x === 'video')
      const uniqueTargetKinds = Array.from(new Set(targetKinds))

      if (fromMediaType === 'image' || fromMediaType === 'video') {
        if (uniqueTargetKinds.some((k) => k !== fromMediaType)) {
          alerts.add(`连接类型不匹配：输出锚点「${fromAnchorLabel}」为 ${fromMediaType}，但存在不匹配的下游连接。`)
        }
      }

      const anchorNodeIdRaw = comfyAnchorNodeIdFromAnchorId(anchorId)
      const exactNodeCandidates = anchorNodeIdRaw
        ? media.filter((m: any) => String((m as any)?.nodeId ?? '').trim() === anchorNodeIdRaw)
        : []

      let inferredMediaType: 'image' | 'video' | null =
        fromMediaType === 'image' || fromMediaType === 'video' ? fromMediaType : null

      if (!inferredMediaType && exactNodeCandidates.length) {
        inferredMediaType = inferMediaKind(exactNodeCandidates[0] as any)
      }
      if (!inferredMediaType && uniqueTargetKinds.length === 1) {
        inferredMediaType = uniqueTargetKinds[0]
      }
      if (!inferredMediaType) {
        inferredMediaType = imageMedia.length ? 'image' : (videoMedia.length ? 'video' : null)
      }

      if (!inferredMediaType) {
        alerts.add(`ComfyUI 输出锚点「${fromAnchorLabel}」暂无可识别媒体产出。`)
        continue
      }

      if (fromMediaType !== 'image' && fromMediaType !== 'video') {
        alerts.add(`ComfyUI 输出锚点「${fromAnchorLabel}」未标注类型，已按 ${inferredMediaType} 分发。`)
      }

      const list = inferredMediaType === 'image' ? imageMedia : videoMedia
      if (!list.length) {
        alerts.add(`ComfyUI 本次未产出${inferredMediaType === 'image' ? '图片' : '视频'}，无法分发到锚点「${fromAnchorLabel}」。`)
        continue
      }

      const exactByKind = exactNodeCandidates
        .filter((m: any) => inferMediaKind(m as any) === inferredMediaType)

      let selectedMedia: ComfyBridgeMedia | null = null
      if (exactByKind.length) {
        selectedMedia = exactByKind[0] as ComfyBridgeMedia
      } else if (exactNodeCandidates.length) {
        selectedMedia = exactNodeCandidates[0] as ComfyBridgeMedia
      } else {
        const idx = fallbackCursor[inferredMediaType]
        if (idx < list.length) {
          selectedMedia = list[idx] as ComfyBridgeMedia
          fallbackCursor[inferredMediaType] += 1
        } else {
          selectedMedia = list[list.length - 1] as ComfyBridgeMedia
        }
      }

      if (!selectedMedia || !String(selectedMedia.url || '').trim()) {
        alerts.add(`输出锚点「${fromAnchorLabel}」未匹配到可用产物。`)
        continue
      }

      const key = mediaKey(selectedMedia)
      let localizedOutput: ComfyLocalizedOutput | null = null

      if (assignMap.get(anchorId) === key) {
        localizedOutput = localizedByAnchor.get(anchorId) ?? null
      }
      if (!localizedOutput) {
        localizedOutput = importedByMediaKey.get(key) ?? null
      }

      if (!localizedOutput) {
        const imported = await blueprintProjectService.importAsset({
          kind: inferredMediaType,
          name: String(selectedMedia.filename || `comfy_${inferredMediaType}_${Date.now()}`),
          sourceUrl: String(selectedMedia.url || ''),
          baseUrl: String(comfyNode.comfyuiSettings?.baseUrl || '').trim() || undefined,
          filename: String(selectedMedia.filename || '').trim() || undefined,
          subfolder: String((selectedMedia as any).subfolder || '').trim() || undefined,
          type: String((selectedMedia as any).type || '').trim() || undefined,
          projectId: currentProjectId.value,
        })

        if (!imported.ok) {
          alerts.add(`ComfyUI 产物入库失败：锚点「${fromAnchorLabel}」未入库（${String((imported as any).error || 'unknown')}）`)
          continue
        }

        const asset = (imported as any).asset ?? {}
        const importedUrl = resolveBackendUrl(String(asset.url || ''))
        if (!String(importedUrl || '').trim()) {
          alerts.add(`ComfyUI 产物入库失败：锚点「${fromAnchorLabel}」返回了空地址。`)
          continue
        }

        localizedOutput = {
          kind: inferredMediaType,
          url: importedUrl,
          filename: String(asset.name || selectedMedia.filename || `comfy_${inferredMediaType}_${Date.now()}`),
          anchorId,
          nodeId: String((selectedMedia as any).nodeId ?? '').trim() || undefined,
          sourcePath: String(asset.sourcePath || asset.absolutePath || '').trim() || undefined,
          subfolder: String((selectedMedia as any).subfolder || '').trim() || undefined,
          type: String((selectedMedia as any).type || '').trim() || undefined,
        }
        importedByMediaKey.set(key, localizedOutput)
      }

      assignMap.set(anchorId, key)
      localizedByAnchor.set(anchorId, localizedOutput)

      for (const e of edgesForAnchor) {
        const to = store.state.nodesById[e.toNodeId]
        if (!to) continue
        const targetKind = to.type === 'image' ? 'image' : to.type === 'video' ? 'video' : null
        if (!targetKind) continue
        if (targetKind !== localizedOutput.kind) continue
        bindMediaResourceToNode(
          to.id,
          localizedOutput.kind,
          localizedOutput.url,
          String(localizedOutput.filename || `comfy_${localizedOutput.kind}_${Date.now()}`),
          {
            sourcePath: String(localizedOutput.sourcePath || '').trim() || undefined,
          }
        )
      }
    }

    for (const key of Array.from(assignMap.keys())) {
      if (!outputAnchorIdSet.has(key)) assignMap.delete(key)
    }
    for (const key of Array.from(localizedByAnchor.keys())) {
      if (!outputAnchorIdSet.has(key)) localizedByAnchor.delete(key)
    }

    const localizedOutputs = outputs
      .map((a: any) => localizedByAnchor.get(String(a?.id ?? '')))
      .filter((x): x is ComfyLocalizedOutput => !!x && String(x.url || '').trim().length > 0)

    const alertList = Array.from(alerts)
    if (opts?.notifyWarnings !== false && alertList.length) {
      for (const msg of alertList) pushToast(msg, 'warn')
    }
    return { alerts: alertList, outputs: localizedOutputs }
  }

  return run()
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

const onCanvasPointerDown = (e: PointerEvent) => {
  if (e.button !== 0) return
  const target = e.target as HTMLElement | null
  if (!target) return
  const inUi = target.closest(
    '.wf-node, .wf-resource-panel, .wf-inspector, .ctx-menu, .aiwf-toolbar, .aiwf-inspector-toggle'
  )
  if (inUi) return
  store.commit('clearSelection')
  inspectorOpen.value = false
  if (chatModelKey.value !== 'nanobanana' && chatModelKey.value !== 'seedance') chatCollapsed.value = true
}

const getDraggedNanoPreviewUrl = (e: DragEvent): string | null => {
  const dt = e.dataTransfer
  if (!dt) return null
  const url =
    dt.getData('application/x-dweb-nanobanana-preview') ||
    dt.getData('text/uri-list') ||
    dt.getData('text/plain')
  const v = String(url || '').trim()
  return v ? v : null
}

const getDraggedNanoPreviewMeta = (e: DragEvent): { url: string; kind: 'image' | 'video' } | null => {
  const dt = e.dataTransfer
  if (!dt) return null
  const raw = dt.getData('application/x-dweb-nanobanana-preview-meta')
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as any
    const url = String(parsed?.url || '').trim()
    const kindText = String(parsed?.kind || '').trim().toLowerCase()
    const kind = kindText === 'video' ? 'video' : kindText === 'image' ? 'image' : null
    if (!url || !kind) return null
    return { url, kind }
  } catch {
    return null
  }
}

const getDraggedResourceItem = (e: DragEvent): {
  resourceId: string
  kind: 'image' | 'video'
  name?: string
  url?: string
  sourcePath?: string
} | null => {
  const dt = e.dataTransfer
  if (!dt) return null
  const raw = dt.getData('application/x-dweb-resource-item')
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as any
    const resourceId = String(parsed?.resourceId ?? '').trim()
    const kind = String(parsed?.kind ?? '').trim().toLowerCase()
    if (!resourceId) return null
    if (kind !== 'image' && kind !== 'video') return null
    return {
      resourceId,
      kind,
      name: String(parsed?.name ?? '').trim() || undefined,
      url: String(parsed?.url ?? '').trim() || undefined,
      sourcePath: String(parsed?.sourcePath ?? '').trim() || undefined,
    }
  } catch {
    return null
  }
}

type DroppedFile = { file: File; relativePath: string; fsHandle?: any }

const isEditableEventTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  if (!el) return false
  if (el.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')) return true
  return false
}

const inferMediaKindFromFile = (file: File): 'image' | 'video' | null => {
  const mime = String(file?.type ?? '')
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  const name = String(file?.name ?? '')
  const ext = name.toLowerCase().split('.').pop() || ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi'].includes(ext)) return 'video'
  return null
}

const readAllDirectoryEntries = async (dirEntry: any): Promise<any[]> => {
  const reader = dirEntry.createReader()
  const out: any[] = []
  // readEntries returns at most 100 entries per call.
  while (true) {
    const batch: any[] = await new Promise((resolve, reject) => {
      reader.readEntries(
        (entries: any[]) => resolve(entries || []),
        (err: any) => reject(err)
      )
    })
    if (!batch.length) break
    out.push(...batch)
  }
  return out
}

const collectDroppedFilesFromEntry = async (entry: any, pathPrefix = ''): Promise<DroppedFile[]> => {
  if (!entry) return []
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      entry.file((f: File) => resolve(f), (err: any) => reject(err))
    })
    const rel = `${pathPrefix}${file.name}`
    return [{ file, relativePath: rel }]
  }
  if (entry.isDirectory) {
    const dirName = String(entry.name ?? '')
    const nextPrefix = dirName ? `${pathPrefix}${dirName}/` : pathPrefix
    const children = await readAllDirectoryEntries(entry)
    const nested = await Promise.all(children.map((c: any) => collectDroppedFilesFromEntry(c, nextPrefix)))
    return nested.flat()
  }
  return []
}

const collectDroppedFilesFromHandle = async (handle: any, pathPrefix = ''): Promise<DroppedFile[]> => {
  if (!handle) return []
  const kind = String((handle as any).kind || '')
  if (kind === 'file') {
    try {
      const file = await (handle as any).getFile()
      const rel = `${pathPrefix}${file.name || String((handle as any).name ?? '')}`
      return [{ file, relativePath: rel, fsHandle: handle }]
    } catch {
      return []
    }
  }
  if (kind === 'directory') {
    const dirName = String((handle as any).name ?? '')
    const nextPrefix = dirName ? `${pathPrefix}${dirName}/` : pathPrefix
    const out: DroppedFile[] = []
    try {
      const entries = (handle as any).entries?.()
      if (entries && typeof entries[Symbol.asyncIterator] === 'function') {
        for await (const [_name, child] of entries as any) {
          out.push(...(await collectDroppedFilesFromHandle(child, nextPrefix)))
        }
      } else if (entries && typeof entries[Symbol.iterator] === 'function') {
        for (const [_name, child] of entries as any) {
          out.push(...(await collectDroppedFilesFromHandle(child, nextPrefix)))
        }
      }
    } catch {
      // ignore
    }
    return out
  }
  return []
}

const collectDroppedFiles = async (dt: DataTransfer): Promise<DroppedFile[]> => {
  // Prefer File System Access API handles (can be persisted via IndexedDB for refresh recovery).
  const fsItems = Array.from(dt.items ?? []).filter((it) => (it as any).kind === 'file' && typeof (it as any).getAsFileSystemHandle === 'function')
  if (fsItems.length) {
    const handles = await Promise.all(
      fsItems.map(async (it) => {
        try {
          return await (it as any).getAsFileSystemHandle()
        } catch {
          return null
        }
      })
    )
    const nested = await Promise.all(handles.filter(Boolean).map((h) => collectDroppedFilesFromHandle(h, '')))
    const flat = nested.flat()
    if (flat.length) return flat
  }

  // Prefer entries API (Chromium) so we can traverse directories.
  const items = Array.from(dt.items ?? []).filter((it) => it.kind === 'file')
  const entries: any[] = []
  for (const it of items) {
    const e = (it as any).webkitGetAsEntry?.()
    if (e) entries.push(e)
  }
  if (entries.length) {
    const nested = await Promise.all(entries.map((e) => collectDroppedFilesFromEntry(e, '')))
    return nested.flat()
  }
  // Fallback: plain files (no directory support).
  const files = Array.from(dt.files ?? [])
  return files.map((f) => ({ file: f, relativePath: String(f?.name ?? '') }))
}

const createMediaNodesFromFiles = async (opts: { files: DroppedFile[]; worldX: number; worldY: number }) => {
  const media = opts.files
    .map((x) => ({ ...x, kind: inferMediaKindFromFile(x.file) }))
    .filter((x) => x.kind === 'image' || x.kind === 'video') as Array<DroppedFile & { kind: 'image' | 'video' }>
  if (!media.length) return

  if (media.length > MAX_BATCH_IMPORT_MEDIA_COUNT) {
    importLimitAlertMessage.value = `本次检测到 ${media.length} 个媒体文件，超过批量导入上限 ${MAX_BATCH_IMPORT_MEDIA_COUNT} 个。请减少后再导入。`
    return
  }

  // Grid placement to avoid initial overlap; autosize may adjust further.
  const COLS = 4
  const CELL_W = 520
  const CELL_H = 380

  const createdNodeIds: string[] = []
  const resourceIdToNode = new Map<string, { nodeId: string; kind: 'image' | 'video' }>()
  const nodeIdToResourceId = new Map<string, string>()
  const importTasks: Array<{ resourceId: string; kind: 'image' | 'video'; name: string; file: File }> = []
  for (let i = 0; i < media.length; i += 1) {
    const m = media[i]
    const col = i % COLS
    const row = Math.floor(i / COLS)
    const worldX = opts.worldX + col * CELL_W
    const worldY = opts.worldY + row * CELL_H

    const name = String(m.relativePath || m.file.name || (m.kind === 'image' ? 'image' : 'video'))
    const absPath = typeof (m.file as any)?.path === 'string' ? String((m.file as any).path).trim() : ''
    const sourceName = String(m.file?.name || name || '').trim()
    const sourceSize = Number(m.file?.size || 0)
    const sourceLastModified = Number(m.file?.lastModified || 0)
    const sourceFingerprint = normalizeFileSignatureKey(sourceName, sourceSize, sourceLastModified)
    const resourceId = makeResourceId()
    const localFileKey = m.fsHandle
      ? `lfh:${m.kind}:${sourceFingerprint || `${String(resourceId)}`}`
      : ''
    if (localFileKey) {
      // best-effort persist the handle so refresh can recover without backend storage.
      void putLocalFileHandle(localFileKey, m.fsHandle)
    }
    // 1) 先创建资源占位（url 为空），避免批量时立刻触发 <img>/<video> 解码/预加载。
    store.commit('addResource', {
      id: resourceId,
      kind: m.kind,
      name,
      url: '',
      sourcePath: absPath || undefined,
      localFileKey: localFileKey || undefined,
      sourceFingerprint: sourceFingerprint || undefined,
      sourceName: sourceName || undefined,
      sourceSize: Number.isFinite(sourceSize) ? Math.max(0, Math.floor(sourceSize)) : undefined,
      sourceLastModified: Number.isFinite(sourceLastModified) ? Math.max(0, Math.floor(sourceLastModified)) : undefined,
      createdAt: Date.now(),
    })

    store.commit('addNodeAt', { worldX, worldY, title: m.kind === 'image' ? '图片' : '视频' })
    const nodeId = store.state.selectedNodeId
    if (!nodeId) continue
    createdNodeIds.push(nodeId)
    store.commit('setNodeType', { nodeId, type: m.kind })
    store.commit('setNodeResource', { nodeId, resourceId })
    if (absPath) store.commit('setNodeResourcePath', { nodeId, resourcePath: absPath })
    resourceIdToNode.set(resourceId, { nodeId, kind: m.kind })
    nodeIdToResourceId.set(nodeId, resourceId)
    importTasks.push({ resourceId, kind: m.kind, name, file: m.file })
  }

  if (createdNodeIds.length) {
    store.commit('setSelectedNodes', { nodeIds: createdNodeIds, primaryNodeId: createdNodeIds[0] })
  }

  // Start cancellable overlay session for the async import phase.
  cancelActiveImportSession({ cleanupUnresolved: false })
  const sessionId = `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const resourceState = new Map<
    string,
    {
      kind: 'image' | 'video'
      urlReady: boolean
      nodeReady: boolean
      done: boolean
    }
  >()
  for (const t of importTasks) {
    resourceState.set(t.resourceId, {
      kind: t.kind,
      urlReady: false,
      nodeReady: false,
      done: false,
    })
  }
  activeImportSession = {
    id: sessionId,
    cancelled: false,
    resourceIdToNode,
    nodeIdToResourceId,
    resourceState,
    total: importTasks.length,
    processed: 0,
  }
  if (importTasks.length) {
    importOverlayTitle.value = '正在导入资源…'
    importOverlayOpen.value = true
    importOverlayProgress.value = 0
    importOverlayDetail.value = `0 / ${importTasks.length}`
  }

  // 2) 再用 worker + 队列分批读取资源（生成 objectURL / 读取图片尺寸），避免阻塞主线程。
  if (importTasks.length) {
    // NOTE: Create blob urls for video on the main thread.
    // Worker-created blob urls can be unreliable across realms in some runtimes.
    for (const t of importTasks) {
      if (t.kind !== 'video') continue
      const s = activeImportSession
      if (!s || s.id !== sessionId || s.cancelled) break
      const st = s.resourceState.get(t.resourceId)
      const info = resourceIdToNode.get(t.resourceId)
      if (!info || !store.state.nodesById[info.nodeId]) continue

      let url = ''
      try {
        url = URL.createObjectURL(t.file)
      } catch {
        url = ''
      }

      if (st) st.urlReady = Boolean(url)
      if (url) {
        objectUrls.set(t.resourceId, url)
        const sourcePath = typeof (t.file as any)?.path === 'string' ? String((t.file as any).path).trim() : ''
        store.commit('patchResource', {
          resourceId: t.resourceId,
          patch: { url, ...(sourcePath ? { sourcePath } : {}) },
        })
        scheduleVideoMetadataRead({ sessionId, resourceId: t.resourceId, nodeId: info.nodeId, url })
      }
      updateImportProgressIfNeeded(sessionId, t.resourceId)
    }

    // Keep worker pipeline for images (off-main-thread decode for natural size).
    const imageTasks = importTasks.filter((t) => t.kind === 'image')
    if (imageTasks.length) {
      mediaImportManager.enqueue(
        imageTasks.map((t) => ({
          ...t,
          onResult: (res) => {
            const s = activeImportSession
            if (!s || s.id !== sessionId || s.cancelled) return

            const st = s.resourceState.get(res.resourceId)
            if (st) {
              st.urlReady = Boolean(res.url)
            }

            if (res.url) {
              objectUrls.set(res.resourceId, res.url)
              store.commit('patchResource', {
                resourceId: res.resourceId,
                patch: { url: res.url, sourcePath: (res as any).sourcePath || undefined },
              })
            } else if ((res as any).sourcePath) {
              // Still persist path even if url creation failed; user may refresh and recover via backend.
              store.commit('patchResource', { resourceId: res.resourceId, patch: { sourcePath: (res as any).sourcePath } })
            }

            const info = resourceIdToNode.get(res.resourceId)
            if (!info) return
            if (!store.state.nodesById[info.nodeId]) return

            const sp = typeof (res as any).sourcePath === 'string' ? String((res as any).sourcePath).trim() : ''
            if (sp) store.commit('setNodeResourcePath', { nodeId: info.nodeId, resourcePath: sp })

            // 图片：worker 已拿到尺寸，直接初始化 output 分辨率 + 自动高度。
            if (info.kind === 'image' && res.width && res.height) {
              const w = Math.max(1, Math.floor(Number(res.width) || 1))
              const h = Math.max(1, Math.floor(Number(res.height) || 1))
              store.commit('setNodeImageSettings', {
                nodeId: info.nodeId,
                imageSettings: {
                  outputWidth: w,
                  outputHeight: h,
                  naturalWidth: w,
                  naturalHeight: h,
                  crop: { x: 0, y: 0, width: 1, height: 1 },
                },
              })
              autoSizeImageNodeFromDims(info.nodeId, w, h)

              const st2 = s.resourceState.get(res.resourceId)
              if (st2) {
                // Node readiness will be reported by the node component via 'media-ready'.
              }
            }

            updateImportProgressIfNeeded(sessionId, res.resourceId)
          },
        }))
      )
    }
  }
}

const onCanvasDragOver = (e: DragEvent) => {
  const dt = e.dataTransfer
  const hasFiles = !!dt && ((dt.items && Array.from(dt.items).some((it) => it.kind === 'file')) || (dt.files && dt.files.length > 0))
  const resourceItem = getDraggedResourceItem(e)
  const nanoMeta = getDraggedNanoPreviewMeta(e)
  const url = nanoMeta?.url || getDraggedNanoPreviewUrl(e)
  if (!hasFiles && !url && !resourceItem) return
  try {
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  } catch {
    // ignore
  }
}

const onCanvasDrop = async (e: DragEvent) => {
  const wrap = e.currentTarget as HTMLElement | null
  const rect = wrap?.getBoundingClientRect() ?? null
  if (!rect) return

  const z = Number(viewport.value.zoom) || 1
  const panX = Number(viewport.value.panX) || 0
  const panY = Number(viewport.value.panY) || 0
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top
  const cx = rect.width / 2
  const cy = rect.height / 2
  const worldX = (sx - cx - panX) / z
  const worldY = (sy - cy - panY) / z

  const dt = e.dataTransfer
  const draggedResource = getDraggedResourceItem(e)
  if (draggedResource) {
    const r = store.state.resourcesById?.[draggedResource.resourceId] as any
    if (r) {
      store.commit('addNodeAt', { worldX, worldY, title: draggedResource.kind === 'image' ? '图片' : '视频' })
      const nodeId = store.state.selectedNodeId
      if (nodeId) {
        store.commit('setNodeType', { nodeId, type: draggedResource.kind })
        // Create a unique resource record for the new node.
        const resourceId = makeResourceId()
        store.commit('addResource', {
          id: resourceId,
          kind: draggedResource.kind,
          name: String(r?.name || draggedResource.name || (draggedResource.kind === 'image' ? '图片资源' : '视频资源')),
          url: String(r?.url || draggedResource.url || '').trim(),
          ...(String(r?.sourcePath || draggedResource.sourcePath || '').trim()
            ? { sourcePath: String(r?.sourcePath || draggedResource.sourcePath).trim() }
            : {}),
          ...((draggedResource.kind === 'video' && String((r as any)?.posterUrl || '').trim())
            ? { posterUrl: String((r as any).posterUrl).trim() }
            : {}),
          createdAt: Date.now(),
        } as any)
        store.commit('setNodeResource', { nodeId, resourceId })
        const srcPath = String(r?.sourcePath || draggedResource.sourcePath || '').trim()
        if (srcPath) store.commit('setNodeResourcePath', { nodeId, resourcePath: srcPath })
        const mediaUrl = String(r?.url || draggedResource.url || '').trim()
        if (mediaUrl) autoSizeMediaNode(nodeId, mediaUrl, draggedResource.kind)
      }
      return
    }
  }

  if (dt) {
    try {
      const dropped = await collectDroppedFiles(dt)
      const hasMedia = dropped.some((x) => !!inferMediaKindFromFile(x.file))
      if (hasMedia) {
        await createMediaNodesFromFiles({ files: dropped, worldX, worldY })
        return
      }
    } catch (err: any) {
      pushToast('拖拽导入失败：' + String(err?.message ?? err ?? 'unknown'), 'warn')
      // fall through to NanoBanana URL if present
    }
  }

  const nanoMeta = getDraggedNanoPreviewMeta(e)
  const urlRaw = nanoMeta?.url || getDraggedNanoPreviewUrl(e)
  if (!urlRaw) return

  const url = resolveBackendUrl(urlRaw)
  const kind: 'image' | 'video' = nanoMeta?.kind === 'video' ? 'video' : 'image'
  const resourceId = `wf-res-nanobanana-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  let storedUrl = url
  if (kind === 'image') {
    const frozenUrl = await snapshotRemoteImageToObjectUrl(url, resourceId)
    storedUrl = frozenUrl || url
  }
  store.commit('addResource', {
    id: resourceId,
    kind,
    name:
      kind === 'video'
        ? `Seedance_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.mp4`
        : `NanoBanana_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.png`,
    url: storedUrl,
    createdAt: Date.now(),
  })
  store.commit('addNodeAt', { worldX, worldY, title: kind === 'video' ? '视频' : '图片' })
  const nodeId = store.state.selectedNodeId
  if (!nodeId) return
  store.commit('setNodeType', { nodeId, type: kind })
  store.commit('setNodeResource', { nodeId, resourceId })
  autoSizeMediaNode(nodeId, storedUrl, kind)
}

const onNodeX = (nodeId: string, v: number) => {
  const n = store.state.nodesById[nodeId]
  if (!n) return
  const next = Number(v)
  if (!Number.isFinite(next)) return
  const dx = next - n.worldX
  if (selectedNodeIds.value.length > 1 && selectedNodeIds.value.includes(nodeId)) {
    store.commit('moveSelectedNodesByDelta', { dx, dy: 0 })
    return
  }
  store.commit('setNodePosition', { nodeId, worldX: next })
}
const onNodeY = (nodeId: string, v: number) => {
  const n = store.state.nodesById[nodeId]
  if (!n) return
  const next = Number(v)
  if (!Number.isFinite(next)) return
  const dy = next - n.worldY
  if (selectedNodeIds.value.length > 1 && selectedNodeIds.value.includes(nodeId)) {
    store.commit('moveSelectedNodesByDelta', { dx: 0, dy })
    return
  }
  store.commit('setNodePosition', { nodeId, worldY: next })
}

const onBoxSelect = (payload: { worldRect: { x0: number; y0: number; x1: number; y1: number } }) => {
  const r = payload?.worldRect
  if (!r) return
  const hits = hitTestNodesInWorldRect(store.state, r)
  // 多选时属性面板只同步第一个节点
  store.commit('setSelectedNodes', { nodeIds: hits, primaryNodeId: hits[0] ?? null })
}

const onNodeSizeChange = (nodeId: string, width?: number, height?: number) => {
  store.commit('setNodeSize', { nodeId, width, height })
}

const onSelectNode = (nodeId: string) => {
  // Common multi-select behavior:
  // - If we already have a multi-selection, clicking any selected node keeps the group
  //   and only switches the primary node (for inspector focus).
  if (selectedNodeIds.value.length > 1 && selectedNodeIds.value.includes(nodeId)) {
    store.commit('setSelectedNodes', { nodeIds: selectedNodeIds.value, primaryNodeId: nodeId })
    return
  }
  store.commit('setSelectedNode', { nodeId })
}

const onSelectEdge = (edgeId: string) => {
  store.commit('setSelectedEdge', { edgeId })
}

const onInspectorUploadResource = (nodeId: string, file: File, kind: 'image' | 'video') => {
  onNodeUploadResource(nodeId, file, kind)
}

const onInspectorClearResource = (nodeId: string) => {
  onNodeClearResource(nodeId)
}

const onFocusNode = (nodeId: string) => {
  const node = store.state.nodesById[nodeId]
  if (!node) return
  const zoom = store.state.viewport.zoom
  store.commit('setViewport', { zoom, panX: -node.worldX * zoom, panY: -node.worldY * zoom })
}

const nodeStyle = (
	worldToScreen: (p: { x: number; y: number }) => { x: number; y: number },
	worldX: number,
  worldY: number,
  zoom: number,
  width: number,
  height: number
) => {
	const p = worldToScreen({ x: worldX, y: worldY })
	return {
		left: `${p.x}px`,
		top: `${p.y}px`,
    width: `${Math.max(80, width || 240)}px`,
    height: `${Math.max(80, height || 160)}px`,
    transform: `translate(-50%, -50%) scale(${Math.max(0.2, Math.min(6, zoom))})`,
	} as Record<string, string>
}

const nodeResourceUrl = (node: WorkflowNode) => {
  if (!node.resourceId) return null
  return store.state.resourcesById[node.resourceId]?.url ?? null
}

const nodeResourceName = (node: WorkflowNode) => {
  if (!node.resourceId) return null
  return store.state.resourcesById[node.resourceId]?.name ?? null
}

const triggerDownloadObjectUrl = (objectUrl: string, filename: string) => {
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

const downloadUrlAsBlob = async (url: string, filename: string) => {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  try {
    triggerDownloadObjectUrl(objectUrl, filename)
  } finally {
    // Give the browser a moment to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }
}

const inferSelectedResourceFilename = (node: WorkflowNode) => {
  const raw = String(nodeResourceName(node) ?? '').trim()
  const safe = raw.replace(/[\\/:*?"<>|]+/g, '_')
  if (safe) return safe
  if (node.type === 'video') return `video-${node.id}.mp4`
  return `image-${node.id}.png`
}

const selectedNodeLocalResourcePath = computed(() => {
  if (!selectedNodeId.value) return ''
  const node = store.state.nodesById[selectedNodeId.value]
  if (!node || (node.type !== 'image' && node.type !== 'video')) return ''
  const rid = String((node as any)?.resourceId ?? '').trim()
  if (!rid) return ''
  const resource = store.state.resourcesById[rid] as any
  if (!resource) return ''

  const sourcePath = String(resource?.sourcePath ?? '').trim()
  if (/^[a-zA-Z]:[\\/]/.test(sourcePath) || sourcePath.startsWith('/')) return sourcePath

  const rawUrl = String(resource?.url ?? '').trim()
  if (/^file:\/\//i.test(rawUrl)) {
    const urlObj = new URL(rawUrl)
    return decodeURIComponent(urlObj.pathname).replace(/^\/+([a-zA-Z]:)/, '$1')
  }
  return ''
})

const canOpenSelectedNodeFolder = computed(() => {
  return Boolean(isElectron() && selectedNodeLocalResourcePath.value)
})

const onNodePreviewContextMenu = (nodeId: string, payload: { clientX: number; clientY: number }) => {
  const node = store.state.nodesById[nodeId]
  const worldX = node ? node.worldX : 0
  const worldY = node ? node.worldY : 0
  onCanvasContextMenu({ clientX: payload.clientX, clientY: payload.clientY, worldX, worldY })
}

const storyPreview = (node: WorkflowNode) => {
  const resourceInput = node.inputs?.find((a) => a.id === 'in-resource')
  const inputId = resourceInput?.id || node.inputs?.[0]?.id
  if (!inputId) {
    return {
      kind: null as null,
      url: null as string | null,
      cropEnabled: false,
      crop: null as null | { x: number; y: number; width: number; height: number },
    }
  }
  const edge = edges.value.find((e) => e.toNodeId === node.id && e.toAnchorId === inputId)
  if (!edge) {
    return {
      kind: null as null,
      url: null as string | null,
      cropEnabled: false,
      crop: null as null | { x: number; y: number; width: number; height: number },
    }
  }
  const fromNode = store.state.nodesById[edge.fromNodeId]
  if (!fromNode) {
    return {
      kind: null as null,
      url: null as string | null,
      cropEnabled: false,
      crop: null as null | { x: number; y: number; width: number; height: number },
    }
  }
  if (fromNode.type === 'image' || fromNode.type === 'video') {
    const cropEnabled = !!fromNode.imageSettings?.cropEnabled
    const crop = fromNode.type === 'image' ? (fromNode.imageSettings?.crop ?? null) : null
    return { kind: fromNode.type, url: nodeResourceUrl(fromNode), cropEnabled, crop }
  }
  return {
    kind: null as null,
    url: null as string | null,
    cropEnabled: false,
    crop: null as null | { x: number; y: number; width: number; height: number },
  }
}

const rotateImagePreviewUrl = (node: WorkflowNode) => {
  const inputId = node.inputs?.[0]?.id
  if (!inputId) return null as string | null
  const edge = edges.value.find((e) => e.toNodeId === node.id && e.toAnchorId === inputId)
  if (!edge) return null as string | null
  const fromNode = store.state.nodesById[edge.fromNodeId]
  if (!fromNode) return null as string | null

  const rid = String((fromNode as any).resourceId ?? '').trim()
  if (rid) {
    const r = store.state.resourcesById[rid] as any
    if (r && String(r.kind ?? '').trim() === 'image') {
      const url = String(r.url ?? '').trim()
      if (url) return url
    }
  }

  if (fromNode.type === 'comfyui') {
    const outputs = Array.isArray(fromNode.comfyuiSettings?.outputs)
      ? (fromNode.comfyuiSettings!.outputs! as ComfyLocalizedOutput[])
      : []
    const media = comfyOutputForAnchor(outputs, String((edge as any).fromAnchorId ?? ''), 'image')
    const url = String((media as any)?.url ?? '').trim()
    if (url) return url
  }

  return null as string | null
}

const nodeComponent = (node: WorkflowNode) => {
  if (node.type === 'story') return WorkflowStoryNode
  if (node.type === 'text') return WorkflowTextNode
  if (node.type === 'text-merge') return WorkflowTextMergeNode
  if (node.type === 'image') return WorkflowImageNode
  if (node.type === 'rotate-image') return WorkflowRotateImageNode
  if (node.type === 'video') return WorkflowVideoNode
  if (node.type === 'comfyui') return WorkflowComfyUINode
  return WorkflowNodeBase
}

function getTextOutputForNode(nodeId: string, visited?: Set<string>): string {
  const v = visited ?? new Set<string>()
  if (v.has(nodeId)) return ''
  v.add(nodeId)

  const n = store.state.nodesById[nodeId] as any
  if (!n) return ''
  if (n.type === 'text') return String(n.textValue ?? '')
  if (n.type === 'rotate-image') return String(n.rotatePromptText ?? '')
  if (n.type === 'text-merge') return computeMergedText(nodeId, v)
  return ''
}

function computeMergedText(nodeId: string, visited?: Set<string>): string {
  const n = store.state.nodesById[nodeId] as any
  if (!n || n.type !== 'text-merge') return ''
  const items = Array.isArray(n.textMergeItems) ? n.textMergeItems : []
  const parts: string[] = []
  for (const it of items) {
    const itemId = String(it?.id ?? '').trim()
    if (!itemId) continue
    const anchorId = `in-${itemId}`
    const edge = edges.value.find((e) => e.toNodeId === nodeId && e.toAnchorId === anchorId)
    if (!edge) continue
    parts.push(getTextOutputForNode(edge.fromNodeId, visited))
  }
  return parts.join('\n')
}

const nodeExtraProps = (node: WorkflowNode) => {
  if (node.type === 'text') {
    return {
      textValue: node.textValue ?? '',
    }
  }
  if (node.type === 'text-merge') {
    const items = Array.isArray((node as any).textMergeItems) ? (node as any).textMergeItems : []
    return {
      mergeItems: items,
      mergedText: computeMergedText(node.id),
    }
  }
  if (node.type === 'story') {
    const preview = storyPreview(node)
    const pw = node.storySettings?.previewWidth
    const ph = node.storySettings?.previewHeight
    return {
      branches: node.branches || [],
      previewUrl: preview.url,
      previewKind: preview.kind,
      previewCropEnabled: preview.kind === 'image' ? preview.cropEnabled : false,
      previewCrop: preview.kind === 'image' ? preview.crop : null,
			previewWidth: Number.isFinite(Number(pw)) ? Number(pw) : 1920,
			previewHeight: Number.isFinite(Number(ph)) ? Number(ph) : 1080,
    }
  }
  if (node.type === 'image' || node.type === 'video') {
    const resourcePosterUrl =
      node.type === 'video'
        ? (() => {
            const rid = String(node.resourceId ?? '').trim()
            if (!rid) return null
            const r = store.state.resourcesById[rid]
            const raw = typeof (r as any)?.posterUrl === 'string' ? String((r as any).posterUrl).trim() : ''
            return raw || null
          })()
        : null
    return {
      resourceUrl: nodeResourceUrl(node),
      resourceName: nodeResourceName(node),
			...(node.type === 'image' ? { imageSettings: node.imageSettings ?? null } : {}),
      ...(node.type === 'video'
        ? {
            posterUrl: resourcePosterUrl,
            videoSettings: node.videoSettings ?? null,
            screenshotEnabled: Boolean(firstConnectedImageTargetFromVideo(node.id)),
          }
        : {}),
    }
  }
  if (node.type === 'rotate-image') {
    return {
      inputUrl: rotateImagePreviewUrl(node),
      rotatePromptText: String((node as any).rotatePromptText ?? ''),
    }
  }
  if (node.type === 'comfyui') {
    return {
      comfyuiSettings: node.comfyuiSettings ?? null,
    }
  }
  return {}
}

const comfyService = new ComfyUIBridgeService()
const blueprintProjectService = new BlueprintProjectService()
const projectToolbarRef = ref<{ openSaveDialog: () => void } | null>(null)
const projectList = ref<BlueprintProjectListItem[]>([])
const currentProjectId = ref<number | null>(null)
const currentProjectName = ref('')

const onComfyUISettingsUpdate = (nodeId: string, payload: { baseUrl?: string; positivePrompt?: string; negativePrompt?: string }) => {
  store.commit('setNodeComfyUISettings', { nodeId, comfyuiSettings: payload })
}

const onComfyUIConnect = async (nodeId: string, payload: { baseUrl: string }) => {
  const baseUrl = String(payload?.baseUrl ?? '').trim()
  if (!baseUrl) return
  store.commit('setNodeComfyUISettings', {
    nodeId,
    comfyuiSettings: { baseUrl, status: 'connecting', message: '', lastCheckedAt: Date.now() },
  })
  try {
    const res = await comfyService.ping(baseUrl)
    if (res.ok) {
      store.commit('setNodeComfyUISettings', {
        nodeId,
        comfyuiSettings: { status: 'connected', message: '', lastCheckedAt: Date.now() },
      })

      try {
        const wf = await comfyService.listWorkflows(baseUrl)
        if (wf.ok) {
          store.commit('setNodeComfyUISettings', {
            nodeId,
            comfyuiSettings: { workflows: wf.workflows },
          })
        } else {
          pushToast('读取工作流列表失败：' + (wf.error || 'unknown'), 'warn')
          store.commit('setNodeComfyUISettings', {
            nodeId,
            comfyuiSettings: { workflows: [] },
          })
        }
      } catch (err: any) {
        pushToast('读取工作流列表失败：' + String(err?.message ?? err ?? 'unknown'), 'warn')
        store.commit('setNodeComfyUISettings', {
          nodeId,
          comfyuiSettings: { workflows: [] },
        })
      }
    } else {
      store.commit('setNodeComfyUISettings', {
        nodeId,
        comfyuiSettings: { status: 'error', message: res.error || '连接失败', lastCheckedAt: Date.now() },
      })
    }
  } catch (err: any) {
    store.commit('setNodeComfyUISettings', {
      nodeId,
      comfyuiSettings: { status: 'error', message: String(err?.message ?? err ?? '连接失败'), lastCheckedAt: Date.now() },
    })
  }
}

const onComfyUISelectWorkflow = async (nodeId: string, payload: { workflowPath: string }) => {
  const workflowPath = String(payload?.workflowPath ?? '').trim()
  if (!workflowPath) return
  const node = store.state.nodesById[nodeId]
  const baseUrl = String(node?.comfyuiSettings?.baseUrl ?? '').trim()
  if (!node || node.type !== 'comfyui' || !baseUrl) return

  try {
    const res = await comfyService.getWorkflow(baseUrl, workflowPath)
    if (!res.ok) {
      pushToast('读取工作流失败：' + (res.error || 'unknown'), 'error')
      return
    }
    const { inputs, outputs, warnings } = parseComfyWorkflowIO(res.workflow)
    for (const w of warnings) pushToast(w, 'warn')
    store.commit('setNodeComfyUIWorkflowIO', {
      nodeId,
      workflowPath: res.workflowPath || workflowPath,
      inputs,
      outputs,
    })
    store.commit('setNodeComfyUISettings', {
      nodeId,
      comfyuiSettings: { workflowPath: res.workflowPath || workflowPath },
    })
  } catch (err: any) {
    pushToast('读取工作流失败：' + String(err?.message ?? err ?? 'unknown'), 'error')
  }
}

const comfyPollTimers = new Map<string, number>()
const comfyAnchorAssignments = new Map<string, Map<string, string>>()
const comfyAnchorLocalizedOutputs = new Map<string, Map<string, ComfyLocalizedOutput>>()
const comfyTerminalNotified = new Set<string>()
const comfyPollErrorCounts = new Map<string, number>()

const isLikelyJobMissing = (res: any) => {
  const status = Number((res as any)?.status)
  if (status === 404) return true
  const msg = String((res as any)?.error ?? '').toLowerCase()
  return /not\s*found|404|unknown\s*prompt|missing|不存在|无此/.test(msg)
}

const resetComfyNodeToIdle = (
  nodeId: string,
  statusText: string,
  tone: ToastItem['tone'] = 'warn'
) => {
  stopComfyUIPoll(nodeId)
  comfyPollErrorCounts.delete(nodeId)
  store.commit('setNodeComfyUISettings', {
    nodeId,
    comfyuiSettings: {
      runStatus: 'idle',
      promptId: '',
      progress: 0,
      statusText,
      lastUpdateAt: Date.now(),
    },
  })
  if (statusText) pushToast(statusText, tone)
}

const stopComfyUIPoll = (nodeId: string) => {
  const t = comfyPollTimers.get(nodeId)
  if (t != null) {
    window.clearInterval(t)
    comfyPollTimers.delete(nodeId)
  }
  comfyPollErrorCounts.delete(nodeId)
}

const normalizeJobFromResult = (res: any, promptId: string) => {
  if (res && typeof res === 'object') {
    if (typeof res.status === 'string') return res
    const item = (res as any)[promptId]
    if (item && typeof item === 'object') return item
  }
  return null
}

const deriveRunStateFromJob = (job: any) => {
  const status = String(job?.status ?? '').toLowerCase()
  if (status === 'not_found' || status === 'missing') return { runStatus: 'idle' as const, progress: 0, text: '任务不存在' }
  if (status === 'pending') return { runStatus: 'running' as const, progress: 10, text: '排队中…' }
  if (status === 'in_progress') return { runStatus: 'running' as const, progress: 50, text: '执行中…' }
  if (status === 'completed') return { runStatus: 'completed' as const, progress: 100, text: '已完成' }
  if (status === 'failed') return { runStatus: 'failed' as const, progress: 100, text: '失败' }
  if (status === 'cancelled') return { runStatus: 'cancelled' as const, progress: 100, text: '已取消' }
  return { runStatus: 'running' as const, progress: 30, text: '运行中…' }
}

const startComfyUIPoll = (nodeId: string, baseUrl: string, promptId: string) => {
  stopComfyUIPoll(nodeId)
  comfyTerminalNotified.delete(nodeId)
  comfyPollErrorCounts.delete(nodeId)
  const tick = async () => {
    try {
      const node = store.state.nodesById[nodeId]
      const currentRunStatus = String(node?.comfyuiSettings?.runStatus ?? '').toLowerCase()
      if (currentRunStatus === 'completed' || currentRunStatus === 'failed' || currentRunStatus === 'cancelled') {
        stopComfyUIPoll(nodeId)
        return
      }

      const jr = await comfyService.job(baseUrl, promptId)
      if (!jr.ok) {
        if (isLikelyJobMissing(jr)) {
          resetComfyNodeToIdle(nodeId, 'ComfyUI 任务不存在（可能已重启），已停止轮询。', 'warn')
          return
        }
        const nextCount = Number(comfyPollErrorCounts.get(nodeId) ?? 0) + 1
        comfyPollErrorCounts.set(nodeId, nextCount)
        if (nextCount >= 4) {
          resetComfyNodeToIdle(nodeId, 'ComfyUI 状态连续获取失败，已停止轮询，请重新运行。', 'warn')
          return
        }
        store.commit('setNodeComfyUISettings', {
          nodeId,
          comfyuiSettings: {
            runStatus: 'running',
            statusText: '状态获取失败',
            lastUpdateAt: Date.now(),
          },
        })
        return
      }
      comfyPollErrorCounts.delete(nodeId)
      const job = normalizeJobFromResult(jr.result, promptId)
      if (!job) {
        resetComfyNodeToIdle(nodeId, 'ComfyUI 未找到该任务，已停止轮询。', 'warn')
        return
      }
      const next = deriveRunStateFromJob(job)
      if (next.runStatus === 'idle') {
        resetComfyNodeToIdle(nodeId, 'ComfyUI 任务已不存在，状态已重置。', 'warn')
        return
      }
      const outputsCount = Number.isFinite(Number((job as any)?.outputs_count)) ? Number((job as any).outputs_count) : null
      const suffix = outputsCount != null && (next.runStatus === 'completed') ? `（产物 ${outputsCount}）` : ''
      store.commit('setNodeComfyUISettings', {
        nodeId,
        comfyuiSettings: {
          runStatus: next.runStatus,
          progress: next.progress,
          statusText: next.text + suffix,
          lastUpdateAt: Date.now(),
        },
      })

      let terminalAlerts: string[] = []
      let derivedTerminalStatus = next.runStatus
      if (next.runStatus === 'running' || next.runStatus === 'completed') {
        try {
          const or = await comfyService.outputs(baseUrl, promptId)
          if (or.ok) {
            const media = Array.isArray((or as any).media) ? (or as any).media : []
            const dispatchRes = await routeComfyOutputsToConnectedNodes(nodeId, media, {
              notifyWarnings: next.runStatus !== 'running',
            })
            const localizedOutputs = Array.isArray((dispatchRes as any)?.outputs)
              ? (dispatchRes as any).outputs
              : []
            const runningText = next.runStatus === 'running'
              ? `${next.text}（已入库 ${localizedOutputs.length}/${media.length}）`
              : `已完成（已入库 ${localizedOutputs.length}/${media.length}）`
            store.commit('setNodeComfyUISettings', {
              nodeId,
              comfyuiSettings: {
                outputs: localizedOutputs,
                statusText: runningText,
                lastUpdateAt: Date.now(),
              },
            })

            if (next.runStatus === 'running' && outputsCount != null && outputsCount > 0 && media.length >= outputsCount) {
              derivedTerminalStatus = 'completed'
              store.commit('setNodeComfyUISettings', {
                nodeId,
                comfyuiSettings: {
                  runStatus: 'completed',
                  progress: 100,
                  statusText: `已完成（产物 ${media.length}）`,
                  lastUpdateAt: Date.now(),
                },
              })
            }

            if (next.runStatus === 'completed') {
              terminalAlerts = Array.isArray((dispatchRes as any)?.alerts) ? (dispatchRes as any).alerts : []
            }
          }
        } catch {
          // ignore outputs retrieval errors
        }
      }

      if (derivedTerminalStatus === 'completed' || derivedTerminalStatus === 'failed' || derivedTerminalStatus === 'cancelled') {
        if (!comfyTerminalNotified.has(nodeId)) {
          comfyTerminalNotified.add(nodeId)
          if (derivedTerminalStatus === 'completed') {
            if (terminalAlerts.length) {
              pushToast(`任务完成，但有 ${terminalAlerts.length} 条输出分发警告。`, 'warn')
            }
          } else if (derivedTerminalStatus === 'failed') {
            pushToast('任务失败，请检查 ComfyUI 日志或工作流配置。', 'warn')
          } else if (derivedTerminalStatus === 'cancelled') {
            pushToast('任务已取消。', 'warn')
          }
        }
        stopComfyUIPoll(nodeId)
      }
    } catch {
      // ignore transient poll errors
    }
  }
  void tick()
  const timer = window.setInterval(() => void tick(), 900)
  comfyPollTimers.set(nodeId, timer)
}

const collectComfyUIInputFiles = async (nodeId: string): Promise<File[]> => {
  const node = store.state.nodesById[nodeId]
  if (!node || node.type !== 'comfyui') return []
  const inputs = Array.isArray(node.inputs) ? node.inputs : []
  const edgeOrder = store.state.edgeOrder
  const edgesById = store.state.edgesById

  const out: File[] = []
  for (let i = 0; i < inputs.length; i++) {
    const anchorId = String((inputs[i] as any)?.id ?? '').trim()
    if (!anchorId) continue
    const edge = edgeOrder
      .map((id) => edgesById[id])
      .find((e) => e && e.toNodeId === nodeId && e.toAnchorId === anchorId)
    if (!edge) continue
    const fromNode = store.state.nodesById[edge.fromNodeId]
    const rid = String(fromNode?.resourceId ?? '').trim()
    if (!rid) continue
    const r = store.state.resourcesById[rid]
    if (!r) continue
    if (r.kind !== 'image') {
      pushToast('当前仅支持图片输入资源', 'warn')
      continue
    }
    const url = String((r as any).url ?? '').trim()
    if (!url) continue
    const resp = await fetch(url)
    const blob = await resp.blob()
    const name = String((r as any).name ?? `input_${i}.png`) || `input_${i}.png`
    out.push(new File([blob], name, { type: blob.type || 'image/png' }))
  }
  return out
}

type ReuseRecordConfirmState = {
  nodeId: string
  workflowName?: string
  savedAt?: number
}

const reuseRecordConfirm = ref<ReuseRecordConfirmState | null>(null)

const formatReuseRecordTime = (v?: number) => {
  const t = Number(v)
  if (!Number.isFinite(t) || t <= 0) return '未知'
  return new Date(t).toLocaleString()
}

const onCancelReuseRecord = () => {
  const target = reuseRecordConfirm.value
  reuseRecordConfirm.value = null
  if (!target) return
  store.commit('setNodeComfyUISettings', {
    nodeId: target.nodeId,
    comfyuiSettings: {
      runStatus: 'idle',
      progress: 0,
      statusText: '已取消复用 Django 记录',
      lastUpdateAt: Date.now(),
    },
  })
}

const onConfirmReuseRecord = () => {
  const target = reuseRecordConfirm.value
  reuseRecordConfirm.value = null
  if (!target) return
  void onComfyUIRun(target.nodeId, { confirmReuseRecord: true })
}

const getIncomingTextValue = (toNodeId: string, toAnchorId: string) => {
	for (const e of edges.value) {
		if (e.toNodeId !== toNodeId) continue
		if (e.toAnchorId !== toAnchorId) continue
    return getTextOutputForNode(e.fromNodeId)
	}
	return ''
}

const onComfyUIRun = async (nodeId: string, opts?: { confirmReuseRecord?: boolean }) => {
  const node = store.state.nodesById[nodeId]
  const baseUrl = String(node?.comfyuiSettings?.baseUrl ?? '').trim()
  const workflowPath = String(node?.comfyuiSettings?.workflowPath ?? '').trim()
  const positivePrompt = String(node?.comfyuiSettings?.positivePrompt ?? '')
  const negativePrompt = String(node?.comfyuiSettings?.negativePrompt ?? '')
  const positiveFromText = getIncomingTextValue(nodeId, 'in-positive')
  const negativeFromText = getIncomingTextValue(nodeId, 'in-negative')
  const finalPositivePrompt = String(positiveFromText).trim() ? positiveFromText : positivePrompt
  const finalNegativePrompt = String(negativeFromText).trim() ? negativeFromText : negativePrompt
  if (!node || node.type !== 'comfyui') return
  if (!baseUrl) {
    pushToast('请先填写 ComfyUI 地址', 'warn')
    return
  }
  if (!workflowPath) {
    pushToast('请先选择工作流', 'warn')
    return
  }

  stopComfyUIPoll(nodeId)
  comfyAnchorAssignments.delete(nodeId)
  comfyAnchorLocalizedOutputs.delete(nodeId)
  comfyTerminalNotified.delete(nodeId)
  store.commit('setNodeComfyUISettings', {
    nodeId,
    comfyuiSettings: {
      runStatus: 'running',
      progress: 5,
      statusText: '正在提交…',
      outputs: [],
      lastUpdateAt: Date.now(),
    },
  })

  try {
    const files = await collectComfyUIInputFiles(nodeId)
    const rr = await comfyService.run(baseUrl, workflowPath, files, {
      positivePrompt: finalPositivePrompt,
      negativePrompt: finalNegativePrompt,
      confirmReuseRecord: Boolean(opts?.confirmReuseRecord),
    })
    if (!rr.ok) {
      if ((rr as any).requiresConfirm) {
        reuseRecordConfirm.value = {
          nodeId,
          workflowName: String((rr as any)?.fallbackRecord?.workflowName ?? workflowPath),
          savedAt: Number((rr as any)?.fallbackRecord?.savedAt),
        }
        store.commit('setNodeComfyUISettings', {
          nodeId,
          comfyuiSettings: {
            runStatus: 'idle',
            progress: 0,
            statusText: '等待确认：复用 Django 记录',
            lastUpdateAt: Date.now(),
          },
        })
        pushToast('ComfyUI history 不可用，检测到 Django 记录。请在右下角确认后继续。', 'warn')
        return
      }
      console.error('[ComfyUI] 运行失败', {
        nodeId,
        baseUrl,
        workflowPath,
        error: rr.error,
        raw: rr,
      })
      store.commit('setNodeComfyUISettings', {
        nodeId,
        comfyuiSettings: {
          runStatus: 'failed',
          progress: 100,
          statusText: '提交失败',
          lastUpdateAt: Date.now(),
        },
      })
      pushToast('运行失败：' + (rr.error || 'unknown'), 'error')
      return
    }
    const pid = String((rr as any).promptId ?? '')
    store.commit('setNodeComfyUISettings', {
      nodeId,
      comfyuiSettings: {
        runStatus: 'running',
        promptId: pid,
        progress: 10,
        statusText: pid ? '已提交' : '已提交（无 promptId）',
        lastUpdateAt: Date.now(),
      },
    })
    if (pid) startComfyUIPoll(nodeId, baseUrl, pid)
  } catch (err: any) {
    console.error('[ComfyUI] 运行异常', {
      nodeId,
      baseUrl,
      workflowPath,
      err,
    })
    store.commit('setNodeComfyUISettings', {
      nodeId,
      comfyuiSettings: {
        runStatus: 'failed',
        progress: 100,
        statusText: '提交异常',
        lastUpdateAt: Date.now(),
      },
    })
    pushToast('运行异常：' + String(err?.message ?? err ?? 'unknown'), 'error')
  }
}

const onComfyUICancel = async (nodeId: string) => {
  const node = store.state.nodesById[nodeId]
  const baseUrl = String(node?.comfyuiSettings?.baseUrl ?? '').trim()
  const promptId = String(node?.comfyuiSettings?.promptId ?? '').trim()
  if (!node || node.type !== 'comfyui') return
  if (!baseUrl || !promptId) return
  store.commit('setNodeComfyUISettings', {
    nodeId,
    comfyuiSettings: {
      runStatus: 'canceling',
      statusText: '取消中…',
      lastUpdateAt: Date.now(),
    },
  })
  try {
    const res = await comfyService.cancel(baseUrl, promptId)
    if (!res.ok && isLikelyJobMissing(res)) {
      resetComfyNodeToIdle(nodeId, '任务已不存在，已重置为可运行状态。', 'info')
      return
    }
    const jr = await comfyService.job(baseUrl, promptId)
    if (!jr.ok || isLikelyJobMissing(jr) || !normalizeJobFromResult((jr as any).result, promptId)) {
      store.commit('setNodeComfyUISettings', {
        nodeId,
        comfyuiSettings: {
          runStatus: 'cancelled',
          promptId: '',
          progress: 100,
          statusText: '已取消',
          lastUpdateAt: Date.now(),
        },
      })
      stopComfyUIPoll(nodeId)
      return
    }
    startComfyUIPoll(nodeId, baseUrl, promptId)
  } catch {
    resetComfyNodeToIdle(nodeId, '取消失败：ComfyUI 状态未知，已停止轮询。', 'warn')
  }
}

const onStoryPreviewSettingsUpdate = (
  nodeId: string,
  payload: { previewWidth?: number; previewHeight?: number }
) => {
  store.commit('setNodeStorySettings', { nodeId, storySettings: payload })
}

const NODE_WIDTH = 240
const ANCHOR_GAP = 14

// NOTE: anchors are rendered as DOM elements (absolute positioned + scaled with node).
// To avoid fragile "magic" offsets (like 25), we will resolve the exact anchor center
// from DOM (getBoundingClientRect) and convert it into BlueprintCanvas-local coords.
// The constants below are only used as a fallback when the DOM is not available.
const ANCHOR_SIDE_INSET_PX = 10
const ANCHOR_IN_SIZE = 18
const ANCHOR_OUT_SIZE = 18
const STORY_ANCHOR_IN_SIZE = 9
const STORY_ANCHOR_OUT_SIZE = 10

const ANCHOR_IN_X_OFFSET = -ANCHOR_SIDE_INSET_PX + ANCHOR_IN_SIZE / 2
const ANCHOR_OUT_X_OFFSET = ANCHOR_SIDE_INSET_PX - ANCHOR_OUT_SIZE / 2
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

const getAnchorCanvasPoint = (payload: { nodeId: string; anchorId: string; dir: 'in' | 'out' }) => {
  // create a reactive dependency so scheduled refresh triggers re-render
  void anchorLayoutVersion.value
  const r = getCanvasWrapRect()
  if (!r) return null
  const sel = `[data-wf-node-id="${payload.nodeId}"][data-wf-anchor-id="${payload.anchorId}"][data-wf-dir="${payload.dir}"]`
  const el = document.querySelector<HTMLElement>(sel)
  if (!el) return null
  const b = el.getBoundingClientRect()
  return { x: (b.left + b.right) / 2 - r.left, y: (b.top + b.bottom) / 2 - r.top }
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
  const offset = typeof anchor?.offsetY === 'number' ? anchor.offsetY : start + anchorIndex * ANCHOR_GAP
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

const edgeRenders = (worldToScreen: (p: { x: number; y: number }) => { x: number; y: number }) => {
  return renderEdges.value.map((e) => {
    const fromNode = store.state.nodesById[e.fromNodeId]
    const toNode = store.state.nodesById[e.toNodeId]
    const fromIndex = fromNode?.outputs.findIndex((a) => a.id === e.fromAnchorId) ?? 0
    const toIndex = toNode?.inputs.findIndex((a) => a.id === e.toAnchorId) ?? 0
    const fromAnchor = fromNode?.outputs?.[Math.max(0, fromIndex)]
    const toAnchor = toNode?.inputs?.[Math.max(0, toIndex)]
		const start = fromNode
			? (getAnchorCanvasPoint({ nodeId: e.fromNodeId, anchorId: e.fromAnchorId, dir: 'out' })
				?? worldToScreen(anchorWorld(fromNode, 'out', Math.max(0, fromIndex), fromNode.outputs.length, fromAnchor)))
			: { x: 0, y: 0 }
		const end = toNode
			? (getAnchorCanvasPoint({ nodeId: e.toNodeId, anchorId: e.toAnchorId, dir: 'in' })
				?? worldToScreen(anchorWorld(toNode, 'in', Math.max(0, toIndex), toNode.inputs.length, toAnchor)))
			: { x: 0, y: 0 }
    const isStory = fromNode?.type === 'story'
    return {
      id: e.id,
      start,
      end,
      path: buildPath(start, end),
      stroke: isStory ? '#f29d38' : undefined,
      strokeWidth: isStory ? 3.5 : undefined,
    }
  })
}

type LinkDraft = {
  fromNodeId: string
  fromAnchorId: string
  fromAnchorIndex: number
	endCanvas: { x: number; y: number }
}

const linkDraft = ref<LinkDraft | null>(null)
const dropTarget = ref<{ nodeId: string; anchorId: string; anchorIndex: number } | null>(null)
let cleanupLink: (() => void) | null = null

const nanoHoverAnchorId = computed(() => {
  if (chatModelKey.value !== 'nanobanana' && chatModelKey.value !== 'seedance') return null
  if (!dropTarget.value) return null
  if (dropTarget.value.nodeId !== NANO_ANCHOR_NODE_ID) return null
  return dropTarget.value.anchorId
})

const toasts = ref<ToastItem[]>([])
const toastTimers = new Map<string, number>()
const toastDeadlines = new Map<string, number>()
const toastRemaining = new Map<string, number>()
const toastHovering = ref(false)
const importLimitAlertMessage = ref('')
const MAX_BATCH_IMPORT_MEDIA_COUNT = 100

const TOAST_DURATION_MS = 2600

const scheduleToastDismiss = (id: string, ms: number) => {
  const old = toastTimers.get(id)
  if (old) window.clearTimeout(old)
  const now = performance.now()
  toastDeadlines.set(id, now + Math.max(0, ms))
  const timer = window.setTimeout(() => removeToast(id), Math.max(0, ms))
  toastTimers.set(id, timer)
}

const pauseToastTimers = () => {
  const now = performance.now()
  for (const t of toasts.value) {
    const id = t.id
    const timer = toastTimers.get(id)
    if (!timer) continue
    window.clearTimeout(timer)
    toastTimers.delete(id)
    const deadline = toastDeadlines.get(id)
    const remaining = typeof deadline === 'number' ? Math.max(0, deadline - now) : 0
    toastRemaining.set(id, remaining)
  }
}

const resumeToastTimers = () => {
  for (const t of toasts.value) {
    const id = t.id
    if (toastTimers.has(id)) continue
    const remaining = toastRemaining.get(id)
    if (typeof remaining === 'number') {
      toastRemaining.delete(id)
      if (remaining <= 0) {
        removeToast(id)
        continue
      }
      scheduleToastDismiss(id, remaining)
      continue
    }

    // Fallback: if we lost remaining time, treat as full duration.
    scheduleToastDismiss(id, TOAST_DURATION_MS)
  }
}

const setToastHovering = (hovering: boolean) => {
  const next = !!hovering
  if (toastHovering.value === next) return
  toastHovering.value = next
  if (next) pauseToastTimers()
  else resumeToastTimers()
}

const removeToast = (id: string) => {
  toasts.value = toasts.value.filter((t) => t.id !== id)
  const timer = toastTimers.get(id)
  if (timer) {
    window.clearTimeout(timer)
    toastTimers.delete(id)
  }
	toastDeadlines.delete(id)
	toastRemaining.delete(id)
}

const pushToast = (message: string, tone: ToastItem['tone'] = 'warn') => {
  if (tone === 'error') {
    console.error('[AIWorkflow Toast]', message)
  }
  const id = `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  toasts.value = [...toasts.value, { id, message, tone }]
  if (toastHovering.value) {
    toastRemaining.set(id, TOAST_DURATION_MS)
    return
  }
  scheduleToastDismiss(id, TOAST_DURATION_MS)
}

const onConfirmImportLimitAlert = () => {
  importLimitAlertMessage.value = ''
}

const buildDraftSnapshot = (): AIWorkflowDraftSnapshot => {
  // NOTE: 本地上传的图片/视频会生成 blob: URL，刷新后无法复用；这里不跨刷新保存这类资源。
  const resourcesById: WorkflowState['resourcesById'] = {}
  const resourceOrder: string[] = []
  for (const rid of store.state.resourceOrder) {
    const r = store.state.resourcesById[rid]
    if (!r) continue
    const url = typeof (r as any).url === 'string' ? String((r as any).url) : ''
    if (url.startsWith('blob:')) continue
    resourcesById[rid] = { ...(r as any), url } as any
    resourceOrder.push(rid)
  }
  return {
    schemaVersion: 1,
    savedAt: Date.now(),
    viewport: store.state.viewport,
    nodesById: store.state.nodesById,
    nodeOrder: store.state.nodeOrder,
    edgesById: store.state.edgesById,
    edgeOrder: store.state.edgeOrder,
    resourcesById,
    resourceOrder,
    selectedNodeId: store.state.selectedNodeId,
    selectedNodeIds: store.state.selectedNodeIds,
  }
}

const localUrlUploadedAssetCache = new Map<string, { url: string; absolutePath: string }>()

const extFromMime = (mime: string): string => {
  const m = String(mime || '').toLowerCase()
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

const uploadLocalResourceAndGetUrl = async (
  localUrl: string,
  kind: 'image' | 'video',
  resourceName: string,
  opts?: { projectId?: number | null }
): Promise<{ url: string; absolutePath: string }> => {
  const projectId = Number(opts?.projectId ?? currentProjectId.value ?? 0)
  const cacheKey = `${Number.isFinite(projectId) && projectId > 0 ? projectId : 0}|${localUrl}`
  const cached = localUrlUploadedAssetCache.get(cacheKey)
  if (cached) return cached

  const file = await fileFromUrl(localUrl, String(resourceName || kind || 'resource').replace(/\.[^.]+$/, ''))
  const uploaded = await blueprintProjectService.uploadAsset(
    file,
    kind,
    (Number.isFinite(projectId) && projectId > 0) ? { projectId } : undefined
  )
  if (!uploaded.ok) {
    throw new Error(String(uploaded.error || 'upload failed'))
  }
  const asset = (uploaded as any).asset ?? {}
  const next = {
    url: resolveBackendUrl(String(asset.url || '')),
    absolutePath: String(asset.absolutePath || ''),
  }
  if (!next.url) throw new Error('empty uploaded asset url')
  localUrlUploadedAssetCache.set(cacheKey, next)
  return next
}

const buildPersistableSnapshot = async (): Promise<AIWorkflowDraftSnapshot> => {
  // default behavior (legacy): upload local blob/data resources
  return buildPersistableSnapshotWithOptions({ uploadLocalResources: true })
}

const buildPersistableSnapshotWithOptions = async (opts?: { uploadLocalResources?: boolean }): Promise<AIWorkflowDraftSnapshot> => {
  const resourcesById: WorkflowState['resourcesById'] = {}
  const resourceOrder: string[] = []
  let uploadedCount = 0
  const uploadLocal = opts?.uploadLocalResources === true
  const omittedResourceIds = new Set<string>()

  for (const rid of store.state.resourceOrder) {
    const r = store.state.resourcesById[rid]
    if (!r) continue
    const rawUrl = typeof (r as any).url === 'string' ? String((r as any).url) : ''
    const sourcePath = typeof (r as any).sourcePath === 'string' ? String((r as any).sourcePath).trim() : ''
    const localFileKey = typeof (r as any).localFileKey === 'string' ? String((r as any).localFileKey).trim() : ''

    // Keep resource if it has either a usable url or an absolute sourcePath.
    if (!rawUrl && !sourcePath && !localFileKey) continue

    const isLocal = rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')
    if (isLocal && !uploadLocal) {
      // Prefer persisting local resources by absolute path (backend recovery) or localFileKey (IndexedDB handle recovery).
      if (!sourcePath && !localFileKey) {
        // If we don't have an OS path, we can't recover after refresh, so keep previous lightweight behavior.
        omittedResourceIds.add(rid)
        continue
      }
    }

    let persistUrl = rawUrl ? resolveBackendUrl(rawUrl) : ''
    let backendAbsolutePath = ''
    const kind = ((r as any).kind === 'video' ? 'video' : 'image') as 'image' | 'video'
    if (uploadLocal && (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:'))) {
        const uploaded = await uploadLocalResourceAndGetUrl(rawUrl, kind, String((r as any).name || kind), {
          projectId: currentProjectId.value,
        })
      persistUrl = uploaded.url
      backendAbsolutePath = uploaded.absolutePath
      uploadedCount += 1
    }

    // When not uploading local resources but sourcePath exists, do not persist blob/data urls.
    if (!uploadLocal && isLocal && (sourcePath || localFileKey)) {
      persistUrl = ''
    }

    resourcesById[rid] = {
      ...(r as any),
      url: persistUrl,
      // Prefer backend absolute path when uploaded; otherwise keep existing (local) sourcePath.
      sourcePath: backendAbsolutePath || sourcePath || '',
      localFileKey: localFileKey || undefined,
      // posterUrl is usually blob: and can't survive refresh; keep it only when we have a stable url.
      posterUrl: persistUrl ? (r as any).posterUrl : undefined,
    } as any
    resourceOrder.push(rid)
  }

  if (uploadLocal && uploadedCount > 0) {
    pushToast(`已上传 ${uploadedCount} 个本地资源到后端文件库，刷新后可恢复。`, 'info')
  }

  let nodesById: WorkflowState['nodesById'] = store.state.nodesById
  if (!uploadLocal && omittedResourceIds.size) {
    const next: WorkflowState['nodesById'] = {}
    for (const id of store.state.nodeOrder) {
      const n = store.state.nodesById[id]
      if (!n) continue
      const rid = String((n as any).resourceId ?? '').trim()
      if (rid && omittedResourceIds.has(rid)) {
        next[id] = { ...(n as any), resourceId: null } as any
      } else {
        next[id] = n
      }
    }
    nodesById = next
  }

  return {
    schemaVersion: 1,
    savedAt: Date.now(),
    viewport: store.state.viewport,
    nodesById,
    nodeOrder: store.state.nodeOrder,
    edgesById: store.state.edgesById,
    edgeOrder: store.state.edgeOrder,
    resourcesById,
    resourceOrder,
    selectedNodeId: store.state.selectedNodeId,
    selectedNodeIds: store.state.selectedNodeIds,
  }
}

const recoverLocalResourcesFromHandles = async (opts?: { silent?: boolean }) => {
  const silent = Boolean(opts?.silent)

  const stats = {
    totalNeedRecover: 0,
    recovered: 0,
    missingHandle: 0,
    permissionDenied: 0,
    fileReadFailed: 0,
    rebound: 0,
  }

  const missing: Array<{ rid: string; key: string; name: string; kind: 'image' | 'video' }> = []
  const denied: Array<{ rid: string; key: string; name: string; kind: 'image' | 'video' }> = []

  const pendingPatches: Array<{ resourceId: string; patch: any }> = []
  const pendingSizeTasks: Array<{ nodeId: string; url: string; kind: 'image' | 'video' }> = []

  const flushPending = async () => {
    if (!pendingPatches.length) return
    const patches = pendingPatches.splice(0, pendingPatches.length)
    const tasks = pendingSizeTasks.splice(0, pendingSizeTasks.length)
    store.commit('patchResourcesBatch', { patches })
    // Give Vue a chance to apply prop updates before kicking sizing/metadata pipelines.
    await nextTick()
    for (const t of tasks) {
      if (!store.state.nodesById[t.nodeId]) continue
      void autoSizeMediaNode(t.nodeId, t.url, t.kind)
    }
  }

  for (const rid of store.state.resourceOrder) {
    const r = store.state.resourcesById[rid] as any
    if (!r) continue

    const url = typeof r.url === 'string' ? String(r.url).trim() : ''
    if (url) continue

    const key = typeof r.localFileKey === 'string' ? String(r.localFileKey).trim() : ''
    if (!key) continue

    stats.totalNeedRecover += 1

    const handle = await getLocalFileHandle(key)
    if (!handle) {
      stats.missingHandle += 1
      missing.push({ rid, key, name: String(r.name || rid), kind: (r.kind === 'video' ? 'video' : 'image') })
      continue
    }

    const ok = await ensureReadPermission(handle)
    if (!ok) {
      stats.permissionDenied += 1
      denied.push({ rid, key, name: String(r.name || rid), kind: (r.kind === 'video' ? 'video' : 'image') })
      continue
    }

    let file: File
    try {
      file = await (handle as any).getFile()
    } catch {
      stats.fileReadFailed += 1
      continue
    }

    const objectUrl = URL.createObjectURL(file)
    objectUrls.set(rid, objectUrl)

    pendingPatches.push({
      resourceId: rid,
      patch: {
        url: objectUrl,
        name: r.name || file.name,
      },
    })

    stats.recovered += 1

    // Re-trigger sizing/metadata pipeline for nodes using this resource.
    const kind = (r.kind === 'video' ? 'video' : 'image') as 'image' | 'video'
    for (const nodeId of store.state.nodeOrder) {
      const n = store.state.nodesById[nodeId] as any
      if (!n || n.resourceId !== rid) continue
      pendingSizeTasks.push({ nodeId, url: objectUrl, kind })
    }

    // Flush in small batches to avoid Vue recursive update detection during long recovery loops.
    if (pendingPatches.length >= 20) {
      await flushPending()
    }
  }

  await flushPending()

  // Fallback: if many file handles are missing/denied, allow user to rebind in one shot.
  // This keeps old projects usable without deletion.
  if (!silent && canUseFileSystemHandles() && (missing.length || denied.length)) {
    const total = missing.length + denied.length
    const ok = window.confirm(
      `检测到 ${total} 个本地资源无法自动恢复（缺少句柄或未授权）。\n\n是否选择包含这些文件的文件夹以重新绑定并恢复加载？`
    )
    if (ok) {
      try {
        const dir = await (window as any).showDirectoryPicker?.()
        if (dir) {
          const dropped = await collectDroppedFilesFromHandle(dir, '')
          const byName = new Map<string, any>()
          for (const it of dropped) {
            if (!it?.file || !it?.fsHandle) continue
            const nm = String(it.file.name || '').trim()
            if (!nm) continue
            if (!byName.has(nm)) byName.set(nm, it.fsHandle)
          }

          const tryBindList = [...missing, ...denied]
          for (const item of tryBindList) {
            const h = byName.get(String(item.name || '').trim())
            if (!h) continue
            const saved = await putLocalFileHandle(item.key, h)
            if (saved) stats.rebound += 1
          }

          if (stats.rebound > 0) {
            // Re-run recovery once (silent) after rebinding.
            await recoverLocalResourcesFromHandles({ silent: true })
            pushToast(`已重新绑定 ${stats.rebound} 个文件句柄，正在恢复资源加载。`, 'info')
            return stats
          }
        }
      } catch {
        // ignore (user cancelled picker)
      }
    }
  }

  if (!silent && stats.totalNeedRecover > 0 && stats.recovered === 0 && (stats.missingHandle || stats.permissionDenied)) {
    pushToast(
      `本地资源未恢复：缺少句柄 ${stats.missingHandle} 个，未授权 ${stats.permissionDenied} 个。可尝试重新选择文件夹绑定。`,
      'warn'
    )
  }

  return stats
}

const recoverComfyUIRunStates = async (opts?: { silent?: boolean }) => {
  const comfyNodes = store.state.nodeOrder
    .map((id) => store.state.nodesById[id])
    .filter((node): node is WorkflowNode => Boolean(node) && node.type === 'comfyui')

  for (const node of comfyNodes) {
    const nodeId = node.id
    const baseUrl = String(node.comfyuiSettings?.baseUrl ?? '').trim()
    const promptId = String(node.comfyuiSettings?.promptId ?? '').trim()
    const runStatus = String(node.comfyuiSettings?.runStatus ?? '').toLowerCase()
    if (!baseUrl || !promptId) continue
    if (runStatus !== 'running' && runStatus !== 'canceling') continue

    try {
      const jr = await comfyService.job(baseUrl, promptId)
      if (!jr.ok || isLikelyJobMissing(jr)) {
        store.commit('setNodeComfyUISettings', {
          nodeId,
          comfyuiSettings: {
            runStatus: 'idle',
            promptId: '',
            progress: 0,
            statusText: '检测到任务已失效（可能后端已重启）',
            lastUpdateAt: Date.now(),
          },
        })
        stopComfyUIPoll(nodeId)
        if (!opts?.silent) pushToast(`节点「${node.alias || node.title}」任务已失效，已重置。`, 'warn')
        continue
      }

      const job = normalizeJobFromResult((jr as any).result, promptId)
      if (!job) {
        store.commit('setNodeComfyUISettings', {
          nodeId,
          comfyuiSettings: {
            runStatus: 'idle',
            promptId: '',
            progress: 0,
            statusText: '检测到任务不存在，已重置。',
            lastUpdateAt: Date.now(),
          },
        })
        stopComfyUIPoll(nodeId)
        continue
      }

      const next = deriveRunStateFromJob(job)
      if (next.runStatus === 'running') {
        startComfyUIPoll(nodeId, baseUrl, promptId)
      } else if (next.runStatus === 'completed' || next.runStatus === 'failed' || next.runStatus === 'cancelled') {
        store.commit('setNodeComfyUISettings', {
          nodeId,
          comfyuiSettings: {
            runStatus: next.runStatus,
            progress: next.progress,
            statusText: next.text,
            lastUpdateAt: Date.now(),
          },
        })
        stopComfyUIPoll(nodeId)
      }
    } catch {
      stopComfyUIPoll(nodeId)
    }
  }
}

const refreshProjectList = async () => {
  const res = await blueprintProjectService.listProjects()
  if (!res.ok) {
    pushToast('读取项目列表失败：' + String(res.error || 'unknown'), 'warn')
    return
  }
  projectList.value = Array.isArray(res.projects) ? res.projects : []
}

const loadProjectById = async (projectId: number, opts?: { silent?: boolean }) => {
  cancelActiveRecoverySession()
  const res = await blueprintProjectService.loadProject(projectId)
  if (!res.ok) {
    pushToast('加载项目失败：' + String(res.error || 'unknown'), 'error')
    return false
  }
  if (!isValidBlueprintSnapshot((res as any).snapshot)) {
    pushToast('加载项目失败：项目文件数据结构无效。', 'error')
    return false
  }

  // IMPORTANT: set current project id/name ASAP to prevent save actions from accidentally creating a new project.
  const project = (res as any).project ?? {}
  currentProjectId.value = Number(project.id) || null
  currentProjectName.value = String(project.name ?? '').trim()
  localStorage.setItem(AIWF_LAST_PROJECT_STORAGE_KEY, String(project.id ?? ''))

  const normalizedSnapshot = normalizeSnapshotResourceUrls((res as any).snapshot, resolveBackendUrl)
  store.commit('hydrateDraft', { snapshot: normalizedSnapshot })

  const recoverySessionId = startRecoverySessionFromCurrentState()
  if (recoverySessionId) {
    // initial urlReady refresh (some urls may be rewritten by backend)
    refreshRecoveryUrlReady(recoverySessionId)
  }

  // If snapshot only contains localFileKey (no url/sourcePath), try to recover from persisted FileSystemHandles.
  try {
    const st = await recoverLocalResourcesFromHandles({ silent: Boolean(opts?.silent) })
    // Silent auto-load should still show a single actionable hint.
    if (opts?.silent && st && (st.missingHandle || st.permissionDenied)) {
      pushToast(
        `有本地资源需要重新授权/绑定：缺少句柄 ${st.missingHandle}，未授权 ${st.permissionDenied}。可手动“加载项目”再选择文件夹绑定。`,
        'warn'
      )
    }
  } catch {
    // ignore
  }

  if (recoverySessionId) {
    refreshRecoveryUrlReady(recoverySessionId)
    finalizeRecoverySessionAfterUrlRecoveryAttempt(recoverySessionId)
  }

  const loadedProjectId = Number(currentProjectId.value || 0)
  if (Number.isFinite(loadedProjectId) && loadedProjectId > 0) {
    const migratedOnLoad = await migrateCurrentResourcesToProjectScope(loadedProjectId, { silent: true })
    if (migratedOnLoad.changed > 0) {
      try {
        const migratedSnapshot = await buildPersistableSnapshotWithOptions({ uploadLocalResources: false })
        await blueprintProjectService.saveProject({
          name: currentProjectName.value || `project_${loadedProjectId}`,
          snapshot: migratedSnapshot,
          projectId: loadedProjectId,
        })
      } catch {
        // ignore migration save-back failure on load path
      }
    }
  }

  // NOTE: We intentionally do not build video posters here.
  // Import progress relies on <video> metadata readiness; poster capture is unnecessary.

  if (!opts?.silent) pushToast(`已加载项目：${currentProjectName.value || `#${projectId}`}`, 'info')
  return true
}

const persistUnstableImagesForSave = async () => {
  const resourcesById = (store.state as any).resourcesById ?? {}
  const resourceOrder = Array.isArray((store.state as any).resourceOrder)
    ? ((store.state as any).resourceOrder as string[])
    : Object.keys(resourcesById)

  const toUpload: Array<{ id: string; url: string; name: string }> = []
  for (const rid of resourceOrder) {
    const r = resourcesById?.[rid]
    if (!r) continue
    const kind = String(r.kind ?? '').toLowerCase()
    if (kind !== 'image') continue
    const url = typeof r.url === 'string' ? String(r.url).trim() : ''
    if (!url) continue
    // Only upload unrecoverable local urls (data/blob) to avoid breaking dev preview with /media paths.
    if (!url.startsWith('data:') && !url.startsWith('blob:')) continue

    const sourcePath = typeof r.sourcePath === 'string' ? String(r.sourcePath).trim() : ''
    const localFileKey = typeof r.localFileKey === 'string' ? String(r.localFileKey).trim() : ''
    // If we can recover by path/handle, keep lightweight Ctrl+S behavior.
    if (sourcePath || localFileKey) continue

    const name = String(r.name ?? `image_${rid}`).trim() || `image_${rid}`
    toUpload.push({ id: String(rid), url, name })
  }
  if (!toUpload.length) return true

  for (const item of toUpload) {
    try {
      const uploaded = await uploadLocalResourceAndGetUrl(item.url, 'image', item.name)
      store.commit('patchResource', {
        resourceId: item.id,
        patch: {
          url: uploaded.url,
          sourcePath: uploaded.absolutePath || undefined,
        },
      })
    } catch {
      pushToast(`保存前图片读取失败：${item.name}`, 'error')
      return false
    }
  }

  return true
}

const saveProjectToBackend = async (nameInput?: string, opts?: { silent?: boolean }) => {
  const silent = Boolean(opts?.silent)
  const wasUnsavedProject = !currentProjectId.value
  const nextName = String(nameInput ?? currentProjectName.value ?? '').trim()
  if (!nextName) {
    if (!silent) pushToast('请先输入项目名称。', 'warn')
    return false
  }

  if (activeRecoverySession) {
    if (!silent) pushToast('资源恢复中，请等待加载完成后再保存。', 'warn')
    return false
  }

  // Ensure image resources (especially screenshots/data/blob urls) survive refresh by uploading them before save.
  const persisted = await persistUnstableImagesForSave()
  if (!persisted) return false

  // Electron packaged build cannot reliably restore FileSystemHandle permissions across restarts.
  // Persist local blob/data media into backend storage on save so reopening a project restores the last import.
  const uploadLocalResources = isElectron()

  let snapshot: AIWorkflowDraftSnapshot
  try {
    // Ctrl+S 保存只落盘结构，不触发本地 blob/data 资源上传。
    snapshot = await buildPersistableSnapshotWithOptions({ uploadLocalResources })
  } catch (err: any) {
    if (!silent) pushToast('保存项目失败：' + String(err?.message ?? err ?? 'unknown'), 'error')
    return false
  }
  const res = await blueprintProjectService.saveProject({
    name: nextName,
    snapshot,
    projectId: currentProjectId.value ?? undefined,
  })
  if (!res.ok) {
    if (!silent) pushToast('保存项目失败：' + String(res.error || 'unknown'), 'error')
    return false
  }

  const project = (res as any).project ?? {}
  currentProjectId.value = Number(project.id) || null
  currentProjectName.value = String(project.name ?? nextName).trim() || nextName
  localStorage.setItem(AIWF_LAST_PROJECT_STORAGE_KEY, String(project.id ?? ''))

  const projectId = Number(currentProjectId.value || 0)
  if (wasUnsavedProject && Number.isFinite(projectId) && projectId > 0) {
    const migrated = await migrateCurrentResourcesToProjectScope(projectId, { silent })
    if (migrated.changed > 0) {
      try {
        const migratedSnapshot = await buildPersistableSnapshotWithOptions({ uploadLocalResources })
        const second = await blueprintProjectService.saveProject({
          name: currentProjectName.value,
          snapshot: migratedSnapshot,
          projectId,
        })
        if (!second.ok && !silent) {
          pushToast('迁移后回写项目失败：' + String(second.error || 'unknown'), 'warn')
        }
      } catch (err: any) {
        if (!silent) {
          pushToast('迁移后回写项目失败：' + String(err?.message ?? err ?? 'unknown'), 'warn')
        }
      }
    }
  }

  await refreshProjectList()
  if (!silent) pushToast(`项目已保存：${currentProjectName.value}`, 'info')
  return true
}

const onRequestSaveProject = async (payload?: { name?: string }) => {
  const name = String(payload?.name ?? '').trim()
  await saveProjectToBackend(name || currentProjectName.value)
}

const onRequestNewProject = async () => {
  if (activeRecoverySession) {
    pushToast('资源恢复中，请稍候再新建项目。', 'warn')
    return
  }
  const ok = window.confirm('新建项目将清空当前蓝图未保存改动，是否继续？')
  if (!ok) return
  cancelActiveRecoverySession()
  const next = createDefaultAIWorkflowState()
  store.commit('hydrateDraft', { snapshot: buildSnapshotFromState(next) })
  currentProjectId.value = null
  currentProjectName.value = ''
  localStorage.removeItem(AIWF_LAST_PROJECT_STORAGE_KEY)
  reuseRecordConfirm.value = null
  for (const id of Array.from(comfyPollTimers.keys())) stopComfyUIPoll(id)
  comfyAnchorAssignments.clear()
  comfyAnchorLocalizedOutputs.clear()
  comfyTerminalNotified.clear()
  pushToast('已新建空白项目，请保存并输入项目名称。', 'info')
}

const onRequestLoadProject = async (payload: { projectId: number }) => {
  const id = Number(payload?.projectId)
  if (!Number.isFinite(id) || id <= 0) return
  const loaded = await loadProjectById(id)
  if (loaded) await recoverComfyUIRunStates({ silent: true })
}

const onRequestDeleteProject = async (payload: { projectId: number }) => {
  const id = Number(payload?.projectId)
  if (!Number.isFinite(id) || id <= 0) return
  const res = await blueprintProjectService.deleteProject(id)
  if (!res.ok) {
    pushToast('删除项目失败：' + String(res.error || 'unknown'), 'error')
    return
  }
  if (currentProjectId.value === id) {
    currentProjectId.value = null
    currentProjectName.value = ''
    localStorage.removeItem(AIWF_LAST_PROJECT_STORAGE_KEY)
  }
  await refreshProjectList()
  pushToast('项目已删除。', 'info')
}

const onPreviewResource = (resourceId: string) => {
  const r = store.state.resourcesById?.[String(resourceId)] as any
  if (!r) return
  const kind = String(r.kind || '').toLowerCase()
  const url = kind === 'video'
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

const onRequestImportLocalProject = async (payload: { file: File }) => {
  const file = payload?.file
  if (!file) return
  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    if (!isValidBlueprintSnapshot(parsed)) {
      pushToast('导入失败：JSON 不是有效的蓝图项目结构。', 'error')
      return
    }
    store.commit('hydrateDraft', { snapshot: parsed })
    currentProjectId.value = null
    currentProjectName.value = String(file.name || '').replace(/\.json$/i, '').trim()
    await recoverComfyUIRunStates({ silent: true })
    pushToast('已从本地文件加载蓝图。', 'info')
  } catch (err: any) {
    pushToast('导入失败：' + String(err?.message ?? err ?? 'unknown'), 'error')
  }
}

const onRequestExportProject = async () => {
  try {
    // 导出时仍保留“可持久化”能力：会把 blob/data 资源上传成后端 URL。
    const snapshot = await buildPersistableSnapshotWithOptions({ uploadLocalResources: true })
    const content = JSON.stringify(snapshot, null, 2)
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const name = String(currentProjectName.value || 'blueprint_project').trim().replace(/[\\/:*?"<>|]+/g, '_')
    const a = document.createElement('a')
    a.href = url
    a.download = `${name || 'blueprint_project'}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    pushToast('已导出蓝图 JSON 文件。', 'info')
  } catch (err: any) {
    pushToast('导出失败：' + String(err?.message ?? err ?? 'unknown'), 'error')
  }
}

const tryAutoLoadLastProject = async () => {
  const raw = localStorage.getItem(AIWF_LAST_PROJECT_STORAGE_KEY)
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) return
  // Not fully silent: if local resources cannot be recovered, we need to prompt user to rebind/authorize.
  const ok = await loadProjectById(id, { silent: false })
  if (!ok) {
    localStorage.removeItem(AIWF_LAST_PROJECT_STORAGE_KEY)
  }
}

const onGlobalShortcutSave = async (ev: Event) => {
  // Only take over save behavior on AIWorkflow route.
  if (route.name !== 'AIWorkflow') return
  ;(ev as any).preventDefault?.()
  ;(ev as any).stopImmediatePropagation?.()

  // Ctrl/Cmd+S: persist blueprint project to backend (DB + JSON file).
  const name = String(currentProjectName.value ?? '').trim()
  if (!name) {
    projectToolbarRef.value?.openSaveDialog?.()
    pushToast('请先输入项目名称，再执行保存。', 'info')
    return
  }
  await saveProjectToBackend(name)
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

const onWorkflowKeyDown = (ev: KeyboardEvent) => {
  if (route.name !== 'AIWorkflow') return
  if (isEditableEventTarget(ev.target ?? null)) return

  const key = String(ev.key || '').toLowerCase()
  const mod = ev.ctrlKey || ev.metaKey

  if (mod && key === 'a') {
    ev.preventDefault()
    const ids = store.state.nodeOrder.slice()
    store.commit('setSelectedNodes', { nodeIds: ids, primaryNodeId: ids[0] ?? null })
    return
  }

  if (mod && key === 'v') {
    ev.preventDefault()
    const { worldX, worldY } = getCanvasCenterWorld()
    pasteNodesWithResourceDedupe({ worldX, worldY })
    return
  }

  if (key === 'backspace' || key === 'delete') {
    if (!selectedNodeIds.value.length) return
    ev.preventDefault()
    void removeSelectedNodesWithResourceCleanup(selectedNodeIds.value)
  }
}

const onStartLink = (
  payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent },
  screenToWorld: (p: { x: number; y: number }) => { x: number; y: number }
) => {
  const node = store.state.nodesById[payload.nodeId]
  if (!node) return
  const endCanvas = clientToCanvasPoint({ x: payload.event.clientX, y: payload.event.clientY })
  if (!endCanvas) return
  linkDraft.value = {
    fromNodeId: payload.nodeId,
    fromAnchorId: payload.anchorId,
    fromAnchorIndex: payload.anchorIndex,
		endCanvas,
  }

  const onMove = (ev: PointerEvent) => {
    if (!linkDraft.value) return
		const next = clientToCanvasPoint({ x: ev.clientX, y: ev.clientY })
		if (!next) return
		linkDraft.value.endCanvas = next
		dropTarget.value = findDropTarget(linkDraft.value.endCanvas)
  }
  const onUp = () => {
    // 如果没有落在输入锚点，按“断开该输出锚点的连线”处理
    if (linkDraft.value && !dropTarget.value) {
      store.commit('removeEdgesFromAnchor', {
        nodeId: linkDraft.value.fromNodeId,
        anchorId: linkDraft.value.fromAnchorId,
      })
    }
    if (cleanupLink) cleanupLink()
    cleanupLink = null
    linkDraft.value = null
    dropTarget.value = null
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp, { once: true })
  window.addEventListener('pointercancel', onUp, { once: true })
  cleanupLink = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  }
}

const onEndLink = (payload: { nodeId: string; anchorId: string; anchorIndex: number }) => {
  if (!linkDraft.value) return
  if (!canLinkAnchors(store.state.nodesById, linkDraft.value.fromNodeId, linkDraft.value.fromAnchorId, payload.nodeId, payload.anchorId)) {
    const fromNode = store.state.nodesById[linkDraft.value.fromNodeId]
    const toNode = store.state.nodesById[payload.nodeId]
    const fromKind = anchorKind(fromNode, linkDraft.value.fromAnchorId, 'out')
    const toKind = anchorKind(toNode, payload.anchorId, 'in')
    pushToast(
      `锚点类型不匹配：${anchorKindLabel(fromKind)} → ${anchorKindLabel(toKind)}。resource 输入可接收 image/video/resource。`,
      'warn'
    )
    if (cleanupLink) cleanupLink()
    cleanupLink = null
    linkDraft.value = null
    dropTarget.value = null
    return
  }
  const fromNodeId = linkDraft.value.fromNodeId
  const fromAnchorId = linkDraft.value.fromAnchorId
  const toNodeId = payload.nodeId
  const toAnchorId = payload.anchorId

  store.commit('addEdge', {
    fromNodeId: linkDraft.value.fromNodeId,
    fromAnchorId: linkDraft.value.fromAnchorId,
    toNodeId: payload.nodeId,
    toAnchorId: payload.anchorId,
  })

  // Immediate sync for rotate-image -> image nodes (out-image -> in-resource)
  const fromNode = store.state.nodesById[fromNodeId] as any
  const toNode = store.state.nodesById[toNodeId] as any
  if (
    fromNode &&
    toNode &&
    fromNode.type === 'rotate-image' &&
    fromAnchorId === 'out-image' &&
    toNode.type === 'image'
  ) {
    const rid = String(fromNode.resourceId ?? '').trim()
    if (rid) {
      const r = store.state.resourcesById[rid] as any
      const url = String(r?.url ?? '').trim()
      store.commit('setNodeResource', { nodeId: toNodeId, resourceId: rid })
      if (url) autoSizeMediaNode(toNodeId, url, 'image')
    }
  }

  if (cleanupLink) cleanupLink()
  cleanupLink = null
  linkDraft.value = null
  dropTarget.value = null
}

const draftRender = (worldToScreen: (p: { x: number; y: number }) => { x: number; y: number }) => {
  if (!linkDraft.value) return null
  const fromNode = store.state.nodesById[linkDraft.value.fromNodeId]
  if (!fromNode) return null
  const kind = anchorKind(fromNode, linkDraft.value.fromAnchorId, 'out')
  const stroke =
    kind === 'flow'
      ? 'var(--dweb-orange)'
      : kind === 'text'
        ? 'var(--dweb-yellow)'
      : kind === 'video'
        ? 'var(--dweb-green-main)'
        : kind === 'image'
          ? 'var(--dweb-purple)'
          : 'var(--dweb-blue)'
  const strokeWidth = kind === 'flow' ? 3.5 : 2.5
  const fromAnchor = fromNode.outputs?.[Math.max(0, linkDraft.value.fromAnchorIndex)]
	const start =
		getAnchorCanvasPoint({ nodeId: linkDraft.value.fromNodeId, anchorId: linkDraft.value.fromAnchorId, dir: 'out' })
		?? worldToScreen(
			anchorWorld(fromNode, 'out', linkDraft.value.fromAnchorIndex, fromNode.outputs.length, fromAnchor)
		)
	const end = linkDraft.value.endCanvas
  return { path: buildPath(start, end), stroke, strokeWidth }
}

const DROP_RADIUS_PX = 16

const findDropTarget = (canvasPoint: { x: number; y: number }) => {
  let best: { nodeId: string; anchorId: string; anchorIndex: number } | null = null
  let bestDist = Infinity
  const fromNode = linkDraft.value ? store.state.nodesById[linkDraft.value.fromNodeId] : null
  const fromKind = linkDraft.value && fromNode
    ? anchorKind(fromNode, linkDraft.value.fromAnchorId, 'out')
    : null
  for (const node of nodes.value) {
    const inputs = Array.isArray(node.inputs) ? node.inputs : []
    for (let i = 0; i < inputs.length; i += 1) {
      const a = inputs[i]
      if (fromKind && linkDraft.value && !canLinkAnchors(store.state.nodesById, linkDraft.value.fromNodeId, linkDraft.value.fromAnchorId, node.id, a.id)) continue
			const p = getAnchorCanvasPoint({ nodeId: node.id, anchorId: a.id, dir: 'in' })
			if (!p) continue
			const dx = p.x - canvasPoint.x
			const dy = p.y - canvasPoint.y
			const d = Math.hypot(dx, dy)
			if (d <= DROP_RADIUS_PX && d < bestDist) {
        best = { nodeId: node.id, anchorId: a.id, anchorIndex: i }
        bestDist = d
      }
    }
  }
  return best
}

const hoverInputAnchorId = (nodeId: string) => {
  if (!dropTarget.value) return null
  return dropTarget.value.nodeId === nodeId ? dropTarget.value.anchorId : null
}

const hoverOutputAnchorId = (nodeId: string) => {
  if (!linkDraft.value) return null
  return linkDraft.value.fromNodeId === nodeId ? linkDraft.value.fromAnchorId : null
}

const resourceDialogOpen = ref(false)
const resources = computed(() =>
  store.state.resourceOrder.map((id) => store.state.resourcesById[id]).filter(Boolean)
)

const openResourceDialog = () => {
  resourceDialogOpen.value = true
}

const closeResourceDialog = () => {
  resourceDialogOpen.value = false
}

const removeResourceRecordOnly = (resourceId: string) => {
  revokeTrackedObjectUrlsForResource(resourceId)
  store.commit('removeResource', { resourceId })
}

const mediaRelativePathFromUrl = (rawUrl: string) => {
  const v = String(rawUrl || '').trim()
  if (!v) return ''
  try {
    const u = new URL(v, window.location.origin)
    const m = u.pathname.match(/\/media\/(.+)$/)
    if (!m) return ''
    return decodeURIComponent(String(m[1] || '').trim())
  } catch {
    const m = v.match(/\/media\/(.+)$/)
    return m ? decodeURIComponent(String(m[1] || '').trim()) : ''
  }
}

const isProjectScopedMediaRef = (projectId: number, input: { url?: unknown; sourcePath?: unknown }) => {
  const pid = Number(projectId)
  if (!Number.isFinite(pid) || pid <= 0) return false
  const marker = `/blueprint_projects/${Math.floor(pid)}/`

  const sourcePathKey = normalizeSourcePathKey(input?.sourcePath)
  if (sourcePathKey && sourcePathKey.includes(marker)) return true

  const url = String(input?.url ?? '').trim()
  if (!url) return false
  try {
    const u = new URL(url, window.location.origin)
    return `${u.pathname}${u.search}`.toLowerCase().includes(marker)
  } catch {
    return url.toLowerCase().includes(marker)
  }
}

const isTemporaryThumbnailRef = (input: { url?: unknown; sourcePath?: unknown }) => {
  const marker = '/aiworkflow_projects/thumbnails/'
  const sourcePathKey = normalizeSourcePathKey(input?.sourcePath)
  if (sourcePathKey && sourcePathKey.includes(marker)) return true

  const url = String(input?.url ?? '').trim()
  if (!url) return false
  try {
    const u = new URL(url, window.location.origin)
    return `${u.pathname}${u.search}`.toLowerCase().includes(marker)
  } catch {
    return url.toLowerCase().includes(marker)
  }
}

const importAssetIntoProjectScope = async (payload: {
  kind: 'image' | 'video'
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
    const byPath = await blueprintProjectService.importAsset({
      kind: payload.kind,
      name: payload.name,
      sourcePath,
      projectId: payload.projectId,
      bucket: payload.bucket,
    })
    if (byPath.ok) return (byPath as any).asset ?? null
  }

  if (sourceUrl) {
    const byUrl = await blueprintProjectService.importAsset({
      kind: payload.kind,
      name: payload.name,
      sourceUrl,
      projectId: payload.projectId,
      bucket: payload.bucket,
    })
    if (byUrl.ok) return (byUrl as any).asset ?? null
  }

  return null
}

const makePosterMigrationFileName = (resourceName: string, resourceId: string) => {
  const base = String(resourceName || '').trim().replace(/[\\/:*?"<>|]+/g, '_')
  const noExt = base.replace(/\.[^.]+$/, '')
  const stem = (noExt || `resource_${resourceId}`).slice(0, 80)
  return `poster_${stem}.jpg`
}

const migrateCurrentResourcesToProjectScope = async (
  projectId: number,
  opts?: { silent?: boolean }
): Promise<{ changed: number; failed: number }> => {
  const pid = Number(projectId)
  if (!Number.isFinite(pid) || pid <= 0) return { changed: 0, failed: 0 }

  let changed = 0
  let failed = 0

  const ids = store.state.resourceOrder.slice()
  for (const rid of ids) {
    const r = store.state.resourcesById?.[rid] as any
    if (!r) continue
    const kind = (String(r.kind || '').toLowerCase() === 'video' ? 'video' : 'image') as 'image' | 'video'
    const name = String(r.name || `${kind}_${rid}`).trim() || `${kind}_${rid}`

    // 1) Migrate main asset (image/video) into project-scoped bucket so it can be restored
    // without relying on FileSystemHandle permissions (important for Electron packaged builds).
    const rawUrl = String(r?.url || '').trim()
    const rawSourcePath = String(r?.sourcePath || '').trim()
    const mediaRef = { url: rawUrl, sourcePath: rawSourcePath }
    const mediaIsProjectScoped = isProjectScopedMediaRef(pid, mediaRef)
    const urlLooksLocal = rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')
    const sourceUrlForImport = rawUrl && !rawUrl.startsWith('file:') ? rawUrl : ''
    const mediaNeedsMigration =
      !mediaIsProjectScoped &&
      (Boolean(rawSourcePath) || urlLooksLocal || isDjangoManagedResource(mediaRef))
    if (mediaNeedsMigration) {
      const imported = await importAssetIntoProjectScope({
        kind,
        name,
        projectId: pid,
        sourcePath: rawSourcePath || undefined,
        sourceUrl: sourceUrlForImport || undefined,
        bucket: 'assets',
      })

      if (!imported) {
        failed += 1
      } else {
        const nextUrl = resolveBackendUrl(String((imported as any).url || ''))
        const nextSourcePath = String((imported as any).sourcePath || (imported as any).absolutePath || '').trim()
        if (nextUrl || nextSourcePath) {
          store.commit('patchResource', {
            resourceId: rid,
            patch: {
              url: nextUrl || rawUrl,
              sourcePath: nextSourcePath || rawSourcePath || undefined,
              // Once project-scoped, do not rely on IndexedDB handles.
              localFileKey: undefined,
            } as any,
          })

          if (isDjangoManagedResource(mediaRef) && (rawUrl || rawSourcePath)) {
            await blueprintProjectService.deleteAsset({
              projectId: pid,
              url: rawUrl || undefined,
              sourcePath: rawSourcePath || undefined,
              relativePath: mediaRelativePathFromUrl(rawUrl) || undefined,
            })
          }

          changed += 1
        } else {
          failed += 1
        }
      }
    }

    const latest = store.state.resourcesById?.[rid] as any
    const posterUrl = String((latest as any)?.posterUrl || '').trim()
    const posterSourcePath = String((latest as any)?.posterSourcePath || '').trim()
    if (!(posterUrl || posterSourcePath)) continue

    const posterRef = { url: posterUrl, sourcePath: posterSourcePath }
    const posterRefDjangoManaged = isDjangoManagedResource(posterRef)
    const posterIsTemporary = isTemporaryThumbnailRef(posterRef)
    const posterNeedsMigration =
      posterIsTemporary &&
      !isProjectScopedMediaRef(pid, posterRef) &&
      Boolean(posterSourcePath || posterRefDjangoManaged)
    if (!posterNeedsMigration) continue

    const importedPoster = await importAssetIntoProjectScope({
      kind: 'image',
      name: makePosterMigrationFileName(name, rid),
      projectId: pid,
      sourcePath: posterSourcePath || undefined,
      sourceUrl: posterUrl || undefined,
      bucket: 'thumbnails',
    })

    if (!importedPoster) {
      failed += 1
      continue
    }

    const nextPosterUrl = resolveBackendUrl(String((importedPoster as any).url || ''))
    const nextPosterSourcePath = String((importedPoster as any).sourcePath || (importedPoster as any).absolutePath || '').trim()
    if (!nextPosterUrl && !nextPosterSourcePath) {
      failed += 1
      continue
    }

    store.commit('patchResource', {
      resourceId: rid,
      patch: {
        posterUrl: nextPosterUrl || posterUrl,
        posterSourcePath: nextPosterSourcePath || posterSourcePath || undefined,
      } as any,
    })

    if (posterRefDjangoManaged && (posterUrl || posterSourcePath)) {
      await blueprintProjectService.deleteAsset({
        projectId: pid,
        url: posterUrl || undefined,
        sourcePath: posterSourcePath || undefined,
        relativePath: mediaRelativePathFromUrl(posterUrl) || undefined,
      })
    }

    changed += 1
  }

  if (!opts?.silent && changed > 0) {
    pushToast(`已迁移 ${changed} 条资源到项目专属目录。`, 'info')
  }
  if (!opts?.silent && failed > 0) {
    pushToast(`有 ${failed} 条资源迁移失败，已保留原路径。`, 'warn')
  }
  return { changed, failed }
}

const removeResourceByPolicy = async (
  resourceId: string,
  opts?: { silent?: boolean }
): Promise<{ removed: boolean; reason: 'record' | 'django-file' | 'skip' | 'error' }> => {
  const rid = String(resourceId || '').trim()
  if (!rid) return { removed: false, reason: 'skip' }
  const r = store.state.resourcesById?.[rid] as any
  if (!r) return { removed: false, reason: 'skip' }

  const posterUrl = String((r as any)?.posterUrl || '').trim()
  const posterSourcePath = String((r as any)?.posterSourcePath || '').trim()

  const deletePosterAssetIfNeeded = async () => {
    if (!posterUrl && !posterSourcePath) return
    const posterRef = { url: posterUrl, sourcePath: posterSourcePath }
    if (!isDjangoManagedResource(posterRef)) return

    const resp = await blueprintProjectService.deleteAsset({
      projectId: currentProjectId.value,
      url: posterUrl || undefined,
      sourcePath: posterSourcePath || undefined,
      relativePath: mediaRelativePathFromUrl(posterUrl) || undefined,
    })

    if (!resp.ok && !opts?.silent) {
      pushToast(`删除缩略图失败：${String(resp.error || 'unknown')}`, 'warn')
    }
  }

  if (isComfyForwardResource(r)) {
    await deletePosterAssetIfNeeded()
    removeResourceRecordOnly(rid)
    return { removed: true, reason: 'record' }
  }

  if (!isDjangoManagedResource(r)) {
    await deletePosterAssetIfNeeded()
    removeResourceRecordOnly(rid)
    return { removed: true, reason: 'record' }
  }

  const resp = await blueprintProjectService.deleteAsset({
    projectId: currentProjectId.value,
    resourceId: rid,
    url: String(r?.url || '').trim() || undefined,
    sourcePath: String(r?.sourcePath || '').trim() || undefined,
    relativePath: mediaRelativePathFromUrl(String(r?.url || '')) || undefined,
  })

  if (!resp.ok) {
    if (!opts?.silent) pushToast(`删除资源失败：${String(resp.error || 'unknown')}`, 'error')
    return { removed: false, reason: 'error' }
  }

  await deletePosterAssetIfNeeded()
  removeResourceRecordOnly(rid)
  return { removed: true, reason: 'django-file' }
}

const onRemoveResource = async (resourceId: string) => {
  await removeResourceByPolicy(resourceId)
}

const onRefreshMissingResourceRecords = async (resourceIds: string[]) => {
  const ids = Array.from(new Set((resourceIds ?? []).map((id) => String(id || '').trim()).filter((id) => !!id)))
  if (!ids.length) {
    pushToast('没有检测到无缩略图资源。', 'info')
    return
  }

  let removed = 0
  for (const rid of ids) {
    const result = await removeResourceByPolicy(rid, { silent: true })
    if (result.removed) removed += 1
  }
  pushToast(`已清理 ${removed} / ${ids.length} 条无缩略图资源记录。`, 'info')
}

const contextMenu = ref({ open: false, x: 0, y: 0, worldX: 0, worldY: 0 })
let cleanupContext: (() => void) | null = null

const onCanvasContextMenu = (payload: { clientX: number; clientY: number; worldX: number; worldY: number }) => {
  contextMenu.value = {
    open: true,
    x: payload.clientX,
    y: payload.clientY,
    worldX: payload.worldX,
    worldY: payload.worldY,
  }
  if (cleanupContext) cleanupContext()
  const onClose = () => {
    contextMenu.value.open = false
    if (cleanupContext) cleanupContext()
    cleanupContext = null
  }
  setTimeout(() => {
    window.addEventListener('pointerdown', onClose, { once: true })
    window.addEventListener('contextmenu', onClose, { once: true })
    cleanupContext = () => {
      window.removeEventListener('pointerdown', onClose)
      window.removeEventListener('contextmenu', onClose)
    }
  }, 0)
}

const contextMenuSections = computed<ContextMenuSection[]>(() => {
  const topItems: { id: string; label: string; disabled?: boolean }[] = []
  if (selectedNodeId.value) {
    const node = store.state.nodesById[selectedNodeId.value]
    topItems.push({ id: 'node-info', label: node ? `节点：${node.title}` : '节点：未找到', disabled: true })
  } else if (selectedEdgeId.value) {
    topItems.push({ id: 'edge-info', label: `连线：${selectedEdgeId.value}`, disabled: true })
  } else {
    topItems.push({ id: 'none', label: '未选中节点/连线', disabled: true })
  }

  const actions = selectionActions.value
  const actionItems: { id: string; label: string; disabled?: boolean }[] = []

  if (selectedNodeId.value) {
    const node = store.state.nodesById[selectedNodeId.value]
    if (node && (node.type === 'image' || node.type === 'video')) {
      const url = nodeResourceUrl(node)
      actionItems.push({
        id: node.type === 'image' ? 'save-image-resource' : 'save-video-resource',
        label: node.type === 'image' ? '图片另存为' : '视频另存为',
        disabled: !String(url ?? '').trim(),
      })
      actionItems.push({
        id: 'open-image-folder',
        label: '文件夹打开',
        disabled: !canOpenSelectedNodeFolder.value,
      })
    }
  }

  actionItems.push(...actions.map((a) => ({ id: a.id, label: a.label })))
  const canCopy = selectedNodeIds.value.length > 0
  const canPaste = !!store.state.clipboardNode || (Array.isArray(store.state.clipboardNodes) && store.state.clipboardNodes.length > 0)
  const canSetType = !!selectedNodeId.value

  return [
    { title: '当前选择', items: topItems },
		...(actionItems.length ? [{ title: '选中操作', items: actionItems }] : []),
    {
      title: '常规功能',
      items: [
        { id: 'add-node', label: '添加节点' },
        { id: 'reset-viewport', label: '重置视口' },
				{ id: 'copy-node', label: '复制', disabled: !canCopy },
				{ id: 'paste-node', label: '粘贴', disabled: !canPaste },
      ],
    },
    {
      title: '节点设置',
      items: [
        {
          id: 'set-type',
          label: '设置类型',
          disabled: !canSetType,
          children: [
            { id: 'set-type:base', label: '基础' },
            { id: 'set-type:text', label: '文本' },
            { id: 'set-type:text-merge', label: '文本整合' },
            { id: 'set-type:image', label: '图片' },
            { id: 'set-type:rotate-image', label: '旋转图片' },
            { id: 'set-type:video', label: '视频' },
            { id: 'set-type:story', label: '剧情' },
            { id: 'set-type:comfyui', label: 'ComfyUI' },
          ],
        },
      ],
    },
  ]
})

const onContextMenuSelect = (id: string) => {
  if ((id === 'save-image-resource' || id === 'save-video-resource') && selectedNodeId.value) {
    const node = store.state.nodesById[selectedNodeId.value]
    if (node && (node.type === 'image' || node.type === 'video')) {
      const url = String(nodeResourceUrl(node) ?? '').trim()
      if (url) {
        const filename = inferSelectedResourceFilename(node)
        downloadUrlAsBlob(url, filename)
          .then(() => pushToast('已开始下载。', 'info'))
          .catch((err: any) => pushToast('下载失败：' + String(err?.message ?? err ?? 'unknown'), 'error'))
      }
    }
  }
  if (id === 'open-image-folder' && selectedNodeId.value) {
    const filePath = selectedNodeLocalResourcePath.value
    if (filePath) {
      openFolderForPath(filePath)
        .then((res) => {
          if (!res?.ok) {
            const msg = String((res as any)?.error || 'unknown')
            if (/No handler registered/i.test(msg)) {
              pushToast('打开文件夹失败：Electron 主进程未加载新 IPC，请重启桌面端后重试。', 'warn')
              return
            }
            pushToast('打开文件夹失败：' + msg, 'warn')
          }
        })
        .catch((err: any) => {
          const msg = String(err?.message ?? err ?? 'unknown')
          if (/No handler registered/i.test(msg)) {
            pushToast('打开文件夹失败：Electron 主进程未加载新 IPC，请重启桌面端后重试。', 'warn')
            return
          }
          pushToast('打开文件夹失败：' + msg, 'warn')
        })
    }
  }
  if (id === 'add-node') {
    store.commit('addNodeAt', { worldX: contextMenu.value.worldX, worldY: contextMenu.value.worldY })
  }
  if (id === 'reset-viewport') {
    store.commit('resetViewport')
  }
  if (id === 'copy-node') {
    const primary = selectedNodeId.value ?? selectedNodeIds.value[0]
    if (primary) store.commit('copyNode', { nodeId: primary })
	}
  if (id === 'paste-node') {
    pasteNodesWithResourceDedupe({ worldX: contextMenu.value.worldX, worldY: contextMenu.value.worldY })
	}
  if (id === 'set-type:base' && selectedNodeId.value) {
    store.commit('setNodeType', { nodeId: selectedNodeId.value, type: 'base' })
  }
  if (id === 'set-type:text' && selectedNodeId.value) {
    store.commit('setNodeType', { nodeId: selectedNodeId.value, type: 'text' })
  }
  if (id === 'set-type:text-merge' && selectedNodeId.value) {
    store.commit('setNodeType', { nodeId: selectedNodeId.value, type: 'text-merge' })
  }
  if (id === 'set-type:image' && selectedNodeId.value) {
    store.commit('setNodeType', { nodeId: selectedNodeId.value, type: 'image' })
  }
  if (id === 'set-type:rotate-image' && selectedNodeId.value) {
    store.commit('setNodeType', { nodeId: selectedNodeId.value, type: 'rotate-image' })
  }
  if (id === 'set-type:video' && selectedNodeId.value) {
    store.commit('setNodeType', { nodeId: selectedNodeId.value, type: 'video' })
  }
  if (id === 'set-type:story' && selectedNodeId.value) {
    store.commit('setNodeType', { nodeId: selectedNodeId.value, type: 'story' })
  }
  if (id === 'set-type:comfyui' && selectedNodeId.value) {
    store.commit('setNodeType', { nodeId: selectedNodeId.value, type: 'comfyui' })
  }
  if (id === 'delete') {
		const del = selectionActions.value.find((a) => a.id === 'delete')
		if (del) applyAction(del)
  }
  contextMenu.value.open = false
}

const inspectorOpen = ref(false)
const toggleInspector = () => {
  inspectorOpen.value = !inspectorOpen.value
}

const selectionActions = computed<WorkflowAction[]>(() => {
  if (selectedNodeIds.value.length) {
    return [{
      id: 'delete',
      label: selectedNodeIds.value.length > 1 ? `删除所选节点（${selectedNodeIds.value.length}）` : '删除',
      target: { kind: 'none' },
    }]
  }
  const target: WorkflowSelectionTarget = selectedEdgeId.value
    ? { kind: 'edge', id: selectedEdgeId.value }
    : { kind: 'none' }
  const del = buildDeleteAction(target)
  return del ? [del] : []
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

const onAliasChange = (nodeId: string, alias: string) => {
	store.commit('setNodeAlias', { nodeId, alias })
}

const onContentResize = () => {
  scheduleAnchorLayoutRefresh()
}

onBeforeUnmount(() => {
  reuseRecordConfirm.value = null
	cancelActiveImportSession({ cleanupUnresolved: false })
	mediaImportManager.dispose()
  try {
    videoMetadataQueue?.cancel()
  } catch {
    // ignore
  }
  if (cleanupContext) cleanupContext()
  if (cleanupLink) cleanupLink()
	if (anchorLayoutRaf) cancelAnimationFrame(anchorLayoutRaf)
  anchorLayoutRaf = 0
	window.removeEventListener('dvs:shortcut/save', onGlobalShortcutSave as EventListener, true)
	window.removeEventListener('keydown', onWorkflowKeyDown, true)
  window.removeEventListener('dweb:content/resize', onContentResize as EventListener, true)
  window.removeEventListener('pointerup', flushPendingImageDistribute, true)
  window.removeEventListener('pointercancel', flushPendingImageDistribute, true)
  for (const timer of toastTimers.values()) window.clearTimeout(timer)
	for (const timer of comfyPollTimers.values()) window.clearInterval(timer)
	comfyPollTimers.clear()
  if (posterAutoSaveTimer) {
    window.clearTimeout(posterAutoSaveTimer)
    posterAutoSaveTimer = null
  }
  posterAutoSaveQueued = false
  posterAutoSaveRunning = false
  comfyTerminalNotified.clear()
  pendingImageDistributeNodeIds.clear()
  for (const url of objectUrls.values()) URL.revokeObjectURL(url)
  objectUrls.clear()
})

onMounted(() => {
	// Take over global Ctrl/Cmd+S only on this page.
  window.addEventListener('dvs:shortcut/save', onGlobalShortcutSave as EventListener, true)
	window.addEventListener('keydown', onWorkflowKeyDown, true)
  window.addEventListener('dweb:content/resize', onContentResize as EventListener, true)
  window.addEventListener('pointerup', flushPendingImageDistribute, true)
  window.addEventListener('pointercancel', flushPendingImageDistribute, true)
  void refreshProjectList()
  void tryAutoLoadLastProject().then(() => recoverComfyUIRunStates({ silent: true }))
})
</script>

<style scoped>
.aiwf-page {
  height: 100%;
  position: relative;
  overflow: hidden;
}

.aiwf-canvas {
  position: absolute;
  inset: 0;
}

.aiwf-inspector-toggle {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 25;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  color: var(--vscode-fg);
  padding: 6px 10px;
  cursor: pointer;
  box-shadow: var(--vscode-shadow);
}

.aiwf-inspector-toggle:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.aiwf-toolbar {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 25;
  display: flex;
  align-items: center;
  gap: 8px;
}

.aiwf-toolbar-btn {
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  color: var(--vscode-fg);
  padding: 6px 10px;
  cursor: pointer;
  box-shadow: var(--vscode-shadow);
}

.aiwf-toolbar-btn:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.aiwf-reuse-alert {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 95;
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
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 96;
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
</style>
