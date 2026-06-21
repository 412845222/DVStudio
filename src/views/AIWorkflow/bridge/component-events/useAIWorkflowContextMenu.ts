import { computed, onBeforeUnmount, ref, type ComputedRef, type Ref } from 'vue'
import type { Store } from 'vuex'
import type { WorkflowAction } from '../../../../aiworkflow/actions'
import type { WorkflowNode, WorkflowState } from '../../../../aiworkflow/types'
import type { ContextMenuSection } from '../../../../ui/UIComponent/ContextMenu.vue'
import { canLinkAnchors } from '../../../../aiworkflow/domain/link/anchorKinds'
import {
  NEWUI2_NODE_CATALOG,
  NEWUI2_NODE_CATALOG_CATEGORIES,
  NEWUI2_NODE_TOP_CATEGORIES,
  NEWUI2_NODE_SPECIAL_GROUPS,
} from '../../../../aiworkflow/nodeLibrary'
import type { DwebCanvasMenuNodeActionId } from '../../../../ui/UIComponent/DwebCanvasMenu.types'

type ContextMenuState = {
  open: boolean
  x: number
  y: number
  worldX: number
  worldY: number
}

export const useAIWorkflowContextMenu = (payload: {
  store: Store<WorkflowState>
  selectedNodeId: Ref<string | null>
  selectedNodeIds: Ref<string[]>
  selectedEdgeId: Ref<string | null>
  canOpenSelectedNodeFolder: ComputedRef<boolean>
  selectedNodeLocalResourcePath: ComputedRef<string>
  selectionActions: ComputedRef<WorkflowAction[]>
  nodeResourceUrl: (node: WorkflowNode) => string | null
  inferSelectedResourceFilename: (node: WorkflowNode) => string
  downloadUrlAsBlob: (url: string, filename: string) => Promise<void>
  pasteNodesWithResourceDedupe: (position?: { worldX?: number; worldY?: number }) => void
  applyAction: (action: WorkflowAction) => void
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
  openFolderForPath: (path: string) => Promise<{ ok?: boolean; error?: string } | null | void>
}) => {
  const contextMenu = ref<ContextMenuState>({ open: false, x: 0, y: 0, worldX: 0, worldY: 0 })
  const inspectorOpen = ref(false)
  let cleanupContext: (() => void) | null = null

  const nodeSearchMenuVisible = ref(false)
  const nodeSearchMenuPosition = ref({ clientX: 0, clientY: 0, worldX: 0, worldY: 0 })
  const pendingLinkAnchor = ref<{ fromNodeId: string; fromAnchorId: string } | null>(null)

  const closeContextMenu = () => {
    contextMenu.value.open = false
    if (cleanupContext) cleanupContext()
    cleanupContext = null
  }

  const closeNodeSearchMenu = () => {
    nodeSearchMenuVisible.value = false
    pendingLinkAnchor.value = null
  }

  const openNodeSearchMenu = (position: { clientX: number; clientY: number; worldX: number; worldY: number }, linkInfo?: { fromNodeId: string; fromAnchorId: string }) => {
    nodeSearchMenuPosition.value = position
    pendingLinkAnchor.value = linkInfo ?? null
    nodeSearchMenuVisible.value = true
    closeContextMenu()
  }

  const onCanvasContextMenu = (menuPayload: { clientX: number; clientY: number; worldX: number; worldY: number }) => {
    contextMenu.value = {
      open: true,
      x: menuPayload.clientX,
      y: menuPayload.clientY,
      worldX: menuPayload.worldX,
      worldY: menuPayload.worldY,
    }
    if (cleanupContext) cleanupContext()
    const onClose = (event: Event) => {
      closeContextMenu()
    }
    window.setTimeout(() => {
      window.addEventListener('pointerdown', onClose)
      window.addEventListener('contextmenu', onClose)
      cleanupContext = () => {
        window.removeEventListener('pointerdown', onClose)
        window.removeEventListener('contextmenu', onClose)
      }
    }, 0)
  }

  const onLinkDropOnCanvas = (payload: { clientX: number; clientY: number; worldX: number; worldY: number; fromNodeId: string; fromAnchorId: string }) => {
    openNodeSearchMenu(payload, { fromNodeId: payload.fromNodeId, fromAnchorId: payload.fromAnchorId })
  }

  const contextMenuSections = computed<ContextMenuSection[]>(() => {
    const topItems: { id: string; label: string; disabled?: boolean }[] = []
    if (payload.selectedNodeId.value) {
      const node = payload.store.state.nodesById[payload.selectedNodeId.value]
      topItems.push({ id: 'node-info', label: node ? `节点：${node.title}` : '节点：未找到', disabled: true })
    } else if (payload.selectedEdgeId.value) {
      topItems.push({ id: 'edge-info', label: `连线：${payload.selectedEdgeId.value}`, disabled: true })
    } else {
      topItems.push({ id: 'none', label: '未选中节点/连线', disabled: true })
    }

    const actionItems: { id: string; label: string; disabled?: boolean }[] = []
    const selectedNode = payload.selectedNodeId.value
      ? payload.store.state.nodesById[payload.selectedNodeId.value]
      : null

    if (selectedNode && (selectedNode.type === 'image' || selectedNode.type === 'video')) {
      const url = payload.nodeResourceUrl(selectedNode)
      actionItems.push({
        id: selectedNode.type === 'image' ? 'save-image-resource' : 'save-video-resource',
        label: selectedNode.type === 'image' ? '图片另存为' : '视频另存为',
        disabled: !String(url ?? '').trim(),
      })
      actionItems.push({
        id: 'open-image-folder',
        label: '在文件夹中显示',
        disabled: !payload.canOpenSelectedNodeFolder.value,
      })
    }

    if (selectedNode && selectedNode.type === 'model3d') {
      const url = String(selectedNode.model3dSettings?.modelUrl ?? '').trim()
      actionItems.push({ id: 'save-model-resource', label: '模型另存为', disabled: !url })
      actionItems.push({
        id: 'open-image-folder',
        label: '在文件夹中显示',
        disabled: !payload.canOpenSelectedNodeFolder.value,
      })
    }

    actionItems.push(...payload.selectionActions.value.map((action) => ({ id: action.id, label: action.label })))

    const canCopy = payload.selectedNodeIds.value.length > 0
    const canPaste = !!payload.store.state.clipboardNode || (Array.isArray(payload.store.state.clipboardNodes) && payload.store.state.clipboardNodes.length > 0)
    const canSetType = !!payload.selectedNodeId.value

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
              { id: 'set-type:model3d', label: '3D模型' },
              { id: 'set-type:meshy', label: 'Meshy模型生成' },
            ],
          },
        ],
      },
    ]
  })

  const onContextMenuSelect = (id: string) => {
    const selectedNode = payload.selectedNodeId.value
      ? payload.store.state.nodesById[payload.selectedNodeId.value]
      : null

    if ((id === 'save-image-resource' || id === 'save-video-resource' || id === 'save-model-resource') && selectedNode) {
      const url = selectedNode.type === 'model3d'
        ? String(selectedNode.model3dSettings?.modelUrl ?? '').trim()
        : String(payload.nodeResourceUrl(selectedNode) ?? '').trim()
      if (url) {
        const filename = payload.inferSelectedResourceFilename(selectedNode)
        payload.downloadUrlAsBlob(url, filename)
          .then(() => payload.pushToast('已开始下载。', 'info'))
          .catch((err: any) => payload.pushToast('下载失败：' + String(err?.message ?? err ?? 'unknown'), 'error'))
      }
    }

    if (id === 'open-image-folder' && payload.selectedNodeId.value) {
      const filePath = payload.selectedNodeLocalResourcePath.value
      if (filePath) {
        payload.openFolderForPath(filePath)
          .then((res) => {
            if (!res?.ok) {
              const message = String((res as any)?.error || 'unknown')
              if (/No handler registered/i.test(message)) {
                payload.pushToast('打开文件夹失败：Electron 主进程未加载新 IPC，请重启桌面端后重试。', 'warn')
                return
              }
              payload.pushToast('打开文件夹失败：' + message, 'warn')
            }
          })
          .catch((err: any) => {
            const message = String(err?.message ?? err ?? 'unknown')
            if (/No handler registered/i.test(message)) {
              payload.pushToast('打开文件夹失败：Electron 主进程未加载新 IPC，请重启桌面端后重试。', 'warn')
              return
            }
            payload.pushToast('打开文件夹失败：' + message, 'warn')
          })
      }
    }

    if (id === 'add-node') {
      payload.store.commit('addNodeAt', { worldX: contextMenu.value.worldX, worldY: contextMenu.value.worldY })
    }
    if (id === 'reset-viewport') {
      payload.store.commit('resetViewport')
    }
    if (id === 'copy-node') {
      const primary = payload.selectedNodeId.value ?? payload.selectedNodeIds.value[0]
      if (primary) payload.store.commit('copyNode', { nodeId: primary })
    }
    if (id === 'paste-node') {
      payload.pasteNodesWithResourceDedupe({ worldX: contextMenu.value.worldX, worldY: contextMenu.value.worldY })
    }
    if (id.startsWith('set-type:') && payload.selectedNodeId.value) {
      const nextType = id.slice('set-type:'.length)
      payload.store.commit('setNodeType', { nodeId: payload.selectedNodeId.value, type: nextType })
    }
    if (id === 'delete') {
      const action = payload.selectionActions.value.find((item) => item.id === 'delete')
      if (action) payload.applyAction(action)
    }

    closeContextMenu()
  }

  const onNodeSearchMenuSelect = (actionId: DwebCanvasMenuNodeActionId) => {
    const catalogItem = NEWUI2_NODE_CATALOG.find((item) => item.actionId === actionId)
    if (!catalogItem) return

    const { worldX, worldY } = nodeSearchMenuPosition.value

    payload.store.commit('addNodeAt', { worldX, worldY, title: catalogItem.label })

    const newNodeId = payload.store.state.selectedNodeId
    if (newNodeId && catalogItem.nodeType) {
      payload.store.commit('setNodeType', { nodeId: newNodeId, type: catalogItem.nodeType })
    }

    if (pendingLinkAnchor.value && newNodeId) {
      const { fromNodeId, fromAnchorId } = pendingLinkAnchor.value
      const nodesById = payload.store.state.nodesById
      const newNode = nodesById[newNodeId]
      if (newNode && newNode.inputs && newNode.inputs.length > 0) {
        const toAnchorId = newNode.inputs[0].id
        if (canLinkAnchors(nodesById, fromNodeId, fromAnchorId, newNodeId, toAnchorId)) {
          payload.store.commit('addEdge', {
            fromNodeId,
            fromAnchorId,
            toNodeId: newNodeId,
            toAnchorId,
          })
        }
      }
    }

    closeNodeSearchMenu()
  }

  const onNodeSearchMenuUploadFile = (_file: File) => {
    closeNodeSearchMenu()
  }

  const toggleInspector = () => {
    inspectorOpen.value = !inspectorOpen.value
  }

  onBeforeUnmount(() => {
    if (cleanupContext) cleanupContext()
    cleanupContext = null
  })

  return {
    contextMenu,
    inspectorOpen,
    toggleInspector,
    onCanvasContextMenu,
    onContextMenuSelect,
    contextMenuSections,
    closeContextMenu,
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
    NEWUI2_NODE_SPECIAL_GROUPS,
  }
}
