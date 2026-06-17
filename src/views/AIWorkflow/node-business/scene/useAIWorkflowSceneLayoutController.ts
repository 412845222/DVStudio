export const useAIWorkflowSceneLayoutController = (options: {
  store: any
  connectedTextInputValue: (nodeId: string, anchorId: string) => string
  extractSceneLayoutSourceItems: (parsed: any) => any[]
  parseSceneLayoutMetadataItems: (inputJson: string) => any[]
  mergeSceneLayoutItemsWithMetadata: (layoutItems: any[], metadataSources: any[][]) => any[]
  runSceneLayout: (payload: { nodeId: string; inputJson: string }) => Promise<any>
  syncConnectedModel3DTargets: (nodeId: string) => Promise<void>
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
}) => {
  const onNodeRunSceneLayout = async (nodeId: string) => {
    const node = options.store.state.nodesById[nodeId]
    if (!node || node.type !== 'scene-layout') return
    const linkedJson = String(options.connectedTextInputValue(nodeId, 'in-json') ?? '').trim()
    const cachedJson = String(node.sceneLayoutSettings?.inputJson ?? '').trim()
    const inputJson = linkedJson || cachedJson
    if (!inputJson) {
      options.pushToast('场景布局节点缺少 JSON 文本输入。', 'warn')
      return
    }

    options.store.commit('setNodeSceneLayoutSettings', {
      nodeId,
      sceneLayoutSettings: { status: 'running', message: '正在生成场景布局…', inputJson },
    })

    try {
      let parsedInput: any = null
      try {
        parsedInput = JSON.parse(inputJson)
      } catch {
        parsedInput = null
      }

      const directInputItems = options.extractSceneLayoutSourceItems(parsedInput)
      const directHasLayout = Array.isArray(parsedInput?.layoutItems) && directInputItems.length > 0
      const directHasCamera = parsedInput?.camera && typeof parsedInput.camera === 'object'
      if (directHasLayout) {
        const mergedLayoutItems = options.mergeSceneLayoutItemsWithMetadata(directInputItems, [directInputItems])
        options.store.commit('setNodeSceneLayoutSettings', {
          nodeId,
          sceneLayoutSettings: {
            status: 'completed',
            message: `已从输入 JSON 直接载入 ${mergedLayoutItems.length} 个布局对象。`,
            inputJson,
            layoutItems: mergedLayoutItems,
            camera: directHasCamera ? parsedInput.camera : node.sceneLayoutSettings?.camera,
            lastRunAt: Date.now(),
          },
        })
        options.pushToast('场景布局已从输入 JSON 载入。', 'info')
        return
      }

      const res = await options.runSceneLayout({ nodeId, inputJson })
      if (!res.ok) {
        options.store.commit('setNodeSceneLayoutSettings', {
          nodeId,
          sceneLayoutSettings: { status: 'error', message: res.error || '场景布局失败', inputJson },
        })
        options.pushToast(`场景布局失败：${res.error || 'unknown'}`, 'warn')
        return
      }
      const inputMetadataItems = options.parseSceneLayoutMetadataItems(inputJson)
      const mergedLayoutItems = options.mergeSceneLayoutItemsWithMetadata(
        Array.isArray(res.layoutItems) ? res.layoutItems : [],
        [inputMetadataItems],
      )
      options.store.commit('setNodeSceneLayoutSettings', {
        nodeId,
        sceneLayoutSettings: {
          status: 'completed',
          message: String(res.message || `已生成 ${mergedLayoutItems.length} 个占位物体。`),
          inputJson,
          layoutItems: mergedLayoutItems,
          camera: res.camera,
          lastRunAt: Date.now(),
        },
      })
      options.pushToast('场景布局已更新。', 'info')
    } catch (err: any) {
      const message = String(err?.message ?? err ?? 'unknown')
      options.store.commit('setNodeSceneLayoutSettings', {
        nodeId,
        sceneLayoutSettings: { status: 'error', message, inputJson },
      })
      options.pushToast(`场景布局失败：${message}`, 'warn')
    }
  }

  const onNodeSceneLayoutItemsUpdate = (nodeId: string, layoutItems: any[]) => {
    const node = options.store.state.nodesById[nodeId]
    if (!node || node.type !== 'scene-layout') return
    if (!Array.isArray(layoutItems)) return
    const layoutSettings = node.sceneLayoutSettings ?? null
    const inputMetadataItems = options.parseSceneLayoutMetadataItems(String(layoutSettings?.inputJson ?? ''))
    options.store.commit('setNodeSceneLayoutSettings', {
      nodeId,
      sceneLayoutSettings: {
        layoutItems: options.mergeSceneLayoutItemsWithMetadata(layoutItems, [inputMetadataItems]),
      },
    })
    void options.syncConnectedModel3DTargets(nodeId)
  }

  const onNodeSceneLayoutSelectedPlaceholderOutput = async (nodeId: string, itemId: string) => {
    const node = options.store.state.nodesById[nodeId]
    if (!node || node.type !== 'scene-layout') return
    const outputId = String(itemId ?? '').trim()
    if (!outputId) return
    options.store.commit('setNodeSceneLayoutSettings', {
      nodeId,
      sceneLayoutSettings: {
        selectedPlaceholderOutput: outputId,
        selectedLayoutItemId: outputId,
      },
    })
    await options.syncConnectedModel3DTargets(nodeId)
  }

  return {
    onNodeRunSceneLayout,
    onNodeSceneLayoutItemsUpdate,
    onNodeSceneLayoutSelectedPlaceholderOutput,
  }
}