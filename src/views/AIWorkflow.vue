<template>
  <div class="aiwf-page bg-vscode">
    <BlueprintCanvas
      class="aiwf-canvas"
      :viewport="viewport"
      @update:viewport="onViewportUpdate"
      @canvas-contextmenu="onCanvasContextMenu"
      @box-select="onBoxSelect"
      @pointerdown="onCanvasPointerDown"
      v-slot="vp"
    >
      <SideNavDock :items="navItems" @select="onNavSelect" />

      <WorkflowEdgeLayer
        :edges="edgeRenders(vp.worldToScreen)"
        :selectedEdgeId="selectedEdgeId"
        :draft="draftRender(vp.worldToScreen)"
        @select-edge="onSelectEdge"
      />

      <component
        v-for="node in nodes"
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
        @delete="() => onNodeDelete(node.id)"
        @set-type="onNodeSetType(node.id, $event)"
        @upload-resource="onNodeUploadResource(node.id, $event.file, $event.kind)"
        @clear-resource="onNodeClearResource(node.id)"
        @resize="onNodeResize(node.id, $event)"
        @update-image-settings="onNodeImageSettingsUpdate(node.id, $event)"
        @update-branch="onStoryBranchUpdate(node.id, $event)"
        @add-branch="onStoryBranchAdd(node.id)"
        @remove-branch="onStoryBranchRemove(node.id, $event)"
        @update-preview-settings="onStoryPreviewSettingsUpdate(node.id, $event)"
        @update-video-settings="onNodeVideoSettingsUpdate(node.id, $event)"
        @screenshot="onVideoScreenshot(node.id, $event)"
      />

      <BottomChatDock v-model="chatDraft" @send="onSend" />
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
      />
      <ToastStack :items="toasts" @close="removeToast" />
    </BlueprintCanvas>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStore } from 'vuex'
import BlueprintCanvas from '../ui/BluePrint/BlueprintCanvas.vue'
import WorkflowNodeBase from '../ui/WorkFlow/WorkflowNodeBase.vue'
import WorkflowEdgeLayer from '../ui/WorkFlow/WorkflowEdgeLayer.vue'
import WorkflowImageNode from '../ui/WorkFlow/WorlFlowNodes/WorkflowImageNode.vue'
import WorkflowVideoNode from '../ui/WorkFlow/WorlFlowNodes/WorkflowVideoNode.vue'
import WorkflowStoryNode from '../ui/WorkFlow/WorlFlowNodes/WorkflowStoryNode.vue'
import ResourceManagerPanel from '../ui/WorkFlow/ResourceManagerPanel.vue'
import WorkflowInspectorPanel from '../ui/UIComponent/WorkflowInspectorPanel.vue'
import BottomChatDock from '../ui/UIComponent/BottomChatDock.vue'
import SideNavDock, { type SideNavItem } from '../ui/UIComponent/SideNavDock.vue'
import ContextMenu, { type ContextMenuSection } from '../ui/UIComponent/ContextMenu.vue'
import ToastStack, { type ToastItem } from '../ui/UIComponent/ToastStack.vue'
import { buildDeleteAction, type WorkflowAction } from '../aiworkflow/actions'
import type { WorkflowNode, WorkflowSelectionTarget, WorkflowState } from '../aiworkflow/types'
import { AIWorkflowKey } from '../store/aiworkflow'

const router = useRouter()
const route = useRoute()

const navItems = computed<SideNavItem[]>(() => [
	{ key: 'workflow', label: '工作流', icon: 'WF', active: true },
	{ key: 'studio', label: 'DVStudio 动画工作台', icon: 'VS' },
])

const onNavSelect = (key: string) => {
	if (key === 'studio') void router.push({ name: 'VideoStudio' })
	if (key === 'workflow') void router.push({ name: 'AIWorkflow' })
}

const store = useStore<WorkflowState>(AIWorkflowKey)

const AIWF_DRAFT_STORAGE_KEY = 'dweb.aiworkflow.draft.v1'

type AIWorkflowDraftSnapshot = {
  schemaVersion: 1
  savedAt: number
  viewport: WorkflowState['viewport']
  nodesById: WorkflowState['nodesById']
  nodeOrder: WorkflowState['nodeOrder']
  edgesById: WorkflowState['edgesById']
  edgeOrder: WorkflowState['edgeOrder']
  resourcesById: WorkflowState['resourcesById']
  resourceOrder: WorkflowState['resourceOrder']
  selectedNodeId: WorkflowState['selectedNodeId']
  selectedNodeIds: WorkflowState['selectedNodeIds']
}

const viewport = computed(() => store.state.viewport)
const onViewportUpdate = (v: { zoom: number; panX: number; panY: number }) => {
  store.commit('setViewport', v)
}

// Edges are resolved from DOM anchor centers. During wheel zoom, Vue will re-render
// before the browser applies the new CSS transforms, so rects can be "one frame" stale.
// We schedule a post-layout bump to force a second render with fresh rects.
const anchorLayoutVersion = ref(0)
let anchorLayoutRaf = 0
const scheduleAnchorLayoutRefresh = () => {
  if (anchorLayoutRaf) cancelAnimationFrame(anchorLayoutRaf)
  anchorLayoutRaf = requestAnimationFrame(() => {
    anchorLayoutRaf = 0
    anchorLayoutVersion.value += 1
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

const nodes = computed(() => store.state.nodeOrder.map((id) => store.state.nodesById[id]).filter(Boolean))
const edges = computed(() => store.state.edgeOrder.map((id) => store.state.edgesById[id]).filter(Boolean))
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

const onSend = () => {
  store.commit('setChatDraft', { text: String(chatDraft.value || '').trim() })
}

const onNodeCopy = (nodeId: string) => {
  store.commit('copyNode', { nodeId })
}

const onNodePaste = (nodeId: string) => {
  const n = store.state.nodesById[nodeId]
  if (!n) return
  store.commit('pasteNode', { worldX: n.worldX + 20, worldY: n.worldY + 20 })
}

const onNodeDelete = (nodeId: string) => {
  // If the node is part of multi-selection, delete the whole selection.
  if (selectedNodeIds.value.length > 1 && selectedNodeIds.value.includes(nodeId)) {
    store.commit('removeSelectedNodes')
    return
  }
  store.commit('setSelectedNode', { nodeId })
  store.commit('removeSelectedNodes')
}

const onNodeSetType = (nodeId: string, type: 'base' | 'image' | 'video' | 'story') => {
  store.commit('setNodeType', { nodeId, type })
}

const makeResourceId = () => `wf-res-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const objectUrls = new Map<string, string>()

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
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.onloadedmetadata = () => {
    const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 1
    const previewHeight = Math.round(targetWidth / Math.max(0.1, aspect))
    const height = Math.max(220, previewHeight + chromeHeight)
    store.commit('setNodeSize', { nodeId, width: targetWidth, height, customized: false })
  }
  video.src = url
  video.load()
}

const onNodeUploadResource = (nodeId: string, file: File, kind: 'image' | 'video') => {
  const node = store.state.nodesById[nodeId]
  if (!node) return
  const prevId = node.resourceId ?? null
  const resourceId = makeResourceId()
  const url = URL.createObjectURL(file)
  objectUrls.set(resourceId, url)
  store.commit('addResource', {
    id: resourceId,
    kind,
    name: file.name || `${kind}资源`,
    url,
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
  }

  autoSizeMediaNode(nodeId, url, kind)
  // do not auto-remove previous resource
}

const onNodeClearResource = (nodeId: string) => {
  const node = store.state.nodesById[nodeId]
  if (!node?.resourceId) return
  store.commit('setNodeResource', { nodeId, resourceId: null })
  // do not auto-remove resources when clearing from node
}

const onNodeResize = (
  nodeId: string,
  payload: { width: number; height: number; worldX: number; worldY: number }
) => {
  store.commit('setNodeSize', { nodeId, width: payload.width, height: payload.height })
  store.commit('setNodePosition', { nodeId, worldX: payload.worldX, worldY: payload.worldY })
}

const onNodeImageSettingsUpdate = (
	nodeId: string,
	payload: { outputWidth?: number; outputHeight?: number; naturalWidth?: number; naturalHeight?: number; crop?: { x: number; y: number; width: number; height: number } }
) => {
	store.commit('setNodeImageSettings', { nodeId, imageSettings: payload })
}

const onNodeVideoSettingsUpdate = (
  nodeId: string,
  payload: { outputWidth?: number; outputHeight?: number; naturalWidth?: number; naturalHeight?: number }
) => {
  store.commit('setNodeVideoSettings', { nodeId, videoSettings: payload })
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
  const xMin = Math.min(r.x0, r.x1)
  const xMax = Math.max(r.x0, r.x1)
  const yMin = Math.min(r.y0, r.y1)
  const yMax = Math.max(r.y0, r.y1)
  const hits: string[] = []
  for (const id of store.state.nodeOrder) {
    const n = store.state.nodesById[id]
    if (!n) continue
    const w = Number.isFinite(n.width) ? n.width : 240
    const h = Number.isFinite(n.height) ? n.height : 160
    const left = n.worldX - w / 2
    const right = n.worldX + w / 2
    const top = n.worldY - h / 2
    const bottom = n.worldY + h / 2
    const intersects = !(right < xMin || left > xMax || bottom < yMin || top > yMax)
    if (intersects) hits.push(id)
  }
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

const nodeComponent = (node: WorkflowNode) => {
  if (node.type === 'story') return WorkflowStoryNode
  if (node.type === 'image') return WorkflowImageNode
  if (node.type === 'video') return WorkflowVideoNode
  return WorkflowNodeBase
}

const nodeExtraProps = (node: WorkflowNode) => {
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
    return {
      resourceUrl: nodeResourceUrl(node),
      resourceName: nodeResourceName(node),
			...(node.type === 'image' ? { imageSettings: node.imageSettings ?? null } : {}),
      ...(node.type === 'video'
        ? {
            videoSettings: node.videoSettings ?? null,
            screenshotEnabled: Boolean(firstConnectedImageTargetFromVideo(node.id)),
          }
        : {}),
    }
  }
  return {}
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
  return edges.value.map((e) => {
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

type AnchorKind = 'flow' | 'resource'

const linkDraft = ref<LinkDraft | null>(null)
const dropTarget = ref<{ nodeId: string; anchorId: string; anchorIndex: number } | null>(null)
let cleanupLink: (() => void) | null = null

const toasts = ref<ToastItem[]>([])
const toastTimers = new Map<string, number>()

const removeToast = (id: string) => {
  toasts.value = toasts.value.filter((t) => t.id !== id)
  const timer = toastTimers.get(id)
  if (timer) {
    window.clearTimeout(timer)
    toastTimers.delete(id)
  }
}

const pushToast = (message: string, tone: ToastItem['tone'] = 'warn') => {
  const id = `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  toasts.value = [...toasts.value, { id, message, tone }]
  const timer = window.setTimeout(() => removeToast(id), 2600)
  toastTimers.set(id, timer)
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

const saveDraftToLocalStorage = () => {
  try {
    const snapshot = buildDraftSnapshot()
    localStorage.setItem(AIWF_DRAFT_STORAGE_KEY, JSON.stringify(snapshot))
    pushToast('已临时保存工作流草稿（Ctrl/Cmd+S）', 'info')
  } catch {
    pushToast('临时保存失败：无法写入本地缓存（localStorage）', 'error')
  }
}

const tryPromptLoadDraft = () => {
  const raw = localStorage.getItem(AIWF_DRAFT_STORAGE_KEY)
  if (!raw) return
  let snapshot: any = null
  try {
    snapshot = JSON.parse(raw)
  } catch {
    localStorage.removeItem(AIWF_DRAFT_STORAGE_KEY)
    return
  }
  if (!snapshot || snapshot.schemaVersion !== 1) return
  const savedAt = Number(snapshot.savedAt)
  const when = Number.isFinite(savedAt) ? new Date(savedAt).toLocaleString() : '未知时间'
  const ok = window.confirm(
    `检测到临时保存的工作流草稿（${when}）。\n\n是否加载该草稿？\n\n注意：本地上传的图片/视频（blob: URL）无法跨刷新恢复，需要重新上传。`
  )
  if (!ok) {
    localStorage.removeItem(AIWF_DRAFT_STORAGE_KEY)
    return
  }
  store.commit('hydrateDraft', { snapshot })
  pushToast('已加载临时保存草稿', 'info')
}

const onGlobalShortcutSave = (ev: Event) => {
  // Only take over save behavior on AIWorkflow route.
  if (route.name !== 'AIWorkflow') return
  ;(ev as any).preventDefault?.()
  ;(ev as any).stopImmediatePropagation?.()
  saveDraftToLocalStorage()
}

const anchorKind = (
  node: WorkflowNode | undefined,
  anchorId: string,
  direction: 'in' | 'out'
): AnchorKind | null => {
  if (!node) return null
  if (node.type === 'story') {
    if (direction === 'in') return anchorId === 'in-resource' ? 'resource' : 'flow'
    return 'flow'
  }
  if (node.type === 'image' || node.type === 'video') {
    return 'resource'
  }
  return 'resource'
}

const canLinkAnchors = (
  fromNodeId: string,
  fromAnchorId: string,
  toNodeId: string,
  toAnchorId: string
) => {
  const fromNode = store.state.nodesById[fromNodeId]
  const toNode = store.state.nodesById[toNodeId]
  const fromKind = anchorKind(fromNode, fromAnchorId, 'out')
  const toKind = anchorKind(toNode, toAnchorId, 'in')
  if (!fromKind || !toKind) return false
  return fromKind === toKind
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
  if (!canLinkAnchors(linkDraft.value.fromNodeId, linkDraft.value.fromAnchorId, payload.nodeId, payload.anchorId)) {
    pushToast('锚点类型不匹配：蓝色只能连接蓝色，橙色只能连接橙色。', 'warn')
    if (cleanupLink) cleanupLink()
    cleanupLink = null
    linkDraft.value = null
    dropTarget.value = null
    return
  }
  store.commit('addEdge', {
    fromNodeId: linkDraft.value.fromNodeId,
    fromAnchorId: linkDraft.value.fromAnchorId,
    toNodeId: payload.nodeId,
    toAnchorId: payload.anchorId,
  })
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
  const stroke = kind === 'flow' ? '#f29d38' : 'var(--dweb-blue)'
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
      if (fromKind && anchorKind(node, a.id, 'in') !== fromKind) continue
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

const onRemoveResource = (resourceId: string) => {
  const url = objectUrls.get(resourceId)
  if (url) {
    URL.revokeObjectURL(url)
    objectUrls.delete(resourceId)
  }
  store.commit('removeResource', { resourceId })
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
  const actionItems = actions.map((a) => ({ id: a.id, label: a.label }))
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
            { id: 'set-type:image', label: '图片' },
            { id: 'set-type:video', label: '视频' },
            { id: 'set-type:story', label: '剧情' },
          ],
        },
      ],
    },
  ]
})

const onContextMenuSelect = (id: string) => {
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
		store.commit('pasteNode', { worldX: contextMenu.value.worldX, worldY: contextMenu.value.worldY })
	}
  if (id === 'set-type:base' && selectedNodeId.value) {
    store.commit('setNodeType', { nodeId: selectedNodeId.value, type: 'base' })
  }
  if (id === 'set-type:image' && selectedNodeId.value) {
    store.commit('setNodeType', { nodeId: selectedNodeId.value, type: 'image' })
  }
  if (id === 'set-type:video' && selectedNodeId.value) {
    store.commit('setNodeType', { nodeId: selectedNodeId.value, type: 'video' })
  }
  if (id === 'set-type:story' && selectedNodeId.value) {
    store.commit('setNodeType', { nodeId: selectedNodeId.value, type: 'story' })
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
      store.commit('removeSelectedNodes')
      return
    }
    if (selectedEdgeId.value) store.commit('removeEdge', { edgeId: selectedEdgeId.value })
  }
}

const onAliasChange = (nodeId: string, alias: string) => {
	store.commit('setNodeAlias', { nodeId, alias })
}

onBeforeUnmount(() => {
  if (cleanupContext) cleanupContext()
  if (cleanupLink) cleanupLink()
	if (anchorLayoutRaf) cancelAnimationFrame(anchorLayoutRaf)
  anchorLayoutRaf = 0
	window.removeEventListener('dvs:shortcut/save', onGlobalShortcutSave as EventListener, true)
  for (const timer of toastTimers.values()) window.clearTimeout(timer)
  for (const url of objectUrls.values()) URL.revokeObjectURL(url)
  objectUrls.clear()
})

onMounted(() => {
	// Take over global Ctrl/Cmd+S only on this page.
  window.addEventListener('dvs:shortcut/save', onGlobalShortcutSave as EventListener, true)
	tryPromptLoadDraft()
})
</script>

<style scoped>
.aiwf-page {
  height: 100vh;
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
</style>
