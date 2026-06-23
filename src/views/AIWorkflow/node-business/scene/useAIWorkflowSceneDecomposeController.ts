import { nextTick } from 'vue'
import type { WorkflowNode, WorkflowSceneDecomposeOutput } from '../../../../aiworkflow/types'
import {
  buildSceneDecomposeDescription,
  extractSceneDecomposeItems,
  hasValidSceneDecomposeImageRect,
  hasValidSceneDecomposePixelRect,
  inferSceneDecomposeSourceImageIndex,
  normalizeSceneDecomposeCrop,
  shouldSkipSceneDecomposeItem,
  slugSceneDecomposeId,
  ensureSceneDecomposeSourceDimensions,
} from './sceneDecomposeShared'

export const useAIWorkflowSceneDecomposeController = (options: {
  store: any
  connectedTextInputValue: (nodeId: string, anchorId: string) => string
  connectedSceneDecomposeImageInputs: (nodeId: string) => Array<{ url: string; width?: number; height?: number }>
  connectedSceneDecomposeImageInputAt: (nodeId: string, sourceImageIndex: number) => { url: string; width?: number; height?: number } | null
  buildImageTransferFileFromCrop: (payload: {
    sourceUrl: string
    sourceName: string
    crop: any
    outputWidth?: number
    outputHeight?: number
    suffix?: string
  }) => Promise<File | null>
  addGeneratedImageResource: (file: File) => { resourceId: string; url: string }
  autoExpandSceneDecomposeOutputs: (
    sourceNode: WorkflowNode,
    outputs: WorkflowSceneDecomposeOutput[],
    generatedFiles: Map<string, File>
  ) => Promise<{ createdNodeIds: string[]; sceneLayoutConnections?: number }>
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
}) => {
  const onNodeRunSceneDecompose = async (nodeId: string) => {
    const node = options.store.state.nodesById[nodeId]
    if (!node || node.type !== 'scene-decompose') return

    const inputJson = String(options.connectedTextInputValue(nodeId, 'in-json') ?? '').trim()
    const imageInputs = options.connectedSceneDecomposeImageInputs(nodeId)
    if (!inputJson) {
      options.store.commit('setNodeSceneDecomposeSettings', {
        nodeId,
        sceneDecomposeSettings: { status: 'error', message: '场景分解节点缺少 JSON 文本输入。' },
      })
      options.pushToast('场景分解节点缺少 JSON 文本输入。', 'warn')
      return
    }
    if (!imageInputs.length) {
      options.store.commit('setNodeSceneDecomposeSettings', {
        nodeId,
        sceneDecomposeSettings: { status: 'error', message: '场景分解节点缺少参考图输入。' },
      })
      options.pushToast('场景分解节点缺少参考图输入。', 'warn')
      return
    }

    options.store.commit('setNodeSceneDecomposeSettings', {
      nodeId,
      sceneDecomposeSettings: {
        status: 'running',
        message: '正在按 JSON 中的 sourceImageIndex 生成拆解对象…',
        inputJson,
        lastRunAt: Date.now(),
        outputs: [],
      },
    })

    try {
      const parsed = JSON.parse(inputJson)
      const rawObjects = extractSceneDecomposeItems(parsed)
      if (!rawObjects.length) {
        options.store.commit('setNodeSceneDecomposeSettings', {
          nodeId,
          sceneDecomposeSettings: {
            status: 'error',
            message: 'JSON 中未找到可拆解的 objects 或 layoutItems 列表。',
            inputJson,
            outputs: [],
          },
        })
        options.pushToast('场景分解失败：JSON 中未找到可拆解的 objects 或 layoutItems 列表。', 'warn')
        return
      }

      const actionableItems = rawObjects.filter((item) => !shouldSkipSceneDecomposeItem(item))
      const totalTasks = actionableItems.length
      if (!totalTasks) {
        options.store.commit('setNodeSceneDecomposeSettings', {
          nodeId,
          sceneDecomposeSettings: {
            status: 'error',
            message: 'JSON 中的对象均为结构壳体或缺少可拆解信息。',
            inputJson,
            outputs: [],
            progress: 0,
            totalTasks: 0,
            completedTasks: 0,
            croppedCount: 0,
            fallbackCount: 0,
          },
        })
        options.pushToast('场景分解失败：没有可拆解的对象。', 'warn')
        return
      }

      options.store.commit('setNodeSceneDecomposeSettings', {
        nodeId,
        sceneDecomposeSettings: {
          status: 'running',
          message: `正在处理 0 / ${totalTasks} 个拆解对象…`,
          currentStep: '准备解析裁剪任务…',
          progress: 0,
          totalTasks,
          completedTasks: 0,
          croppedCount: 0,
          fallbackCount: 0,
          inputJson,
          outputs: [],
          lastRunAt: Date.now(),
        },
      })

      const outputs: WorkflowSceneDecomposeOutput[] = []
      const generatedFiles = new Map<string, File>()
      let skippedCount = 0
      let completedTasks = 0
      let croppedCount = 0
      let fallbackCount = 0

      for (let index = 0; index < rawObjects.length; index += 1) {
        const item = rawObjects[index]
        if (shouldSkipSceneDecomposeItem(item)) {
          skippedCount += 1
          continue
        }
        const outputId = slugSceneDecomposeId(item?.id ?? item?.name, index)
        const objectId = String(item?.id ?? '').trim() || outputId
        const sourceImageIndex = inferSceneDecomposeSourceImageIndex(item)
        const source = options.connectedSceneDecomposeImageInputAt(nodeId, sourceImageIndex)
        const objectName = String(item?.name ?? item?.label ?? `对象 ${index + 1}`).trim() || `对象 ${index + 1}`
        const taskLabel = `${objectName}（参考图 ${sourceImageIndex}）`
        options.store.commit('setNodeSceneDecomposeSettings', {
          nodeId,
          sceneDecomposeSettings: {
            status: 'running',
            message: `正在处理 ${completedTasks} / ${totalTasks} 个拆解对象…`,
            currentStep: `正在裁剪 ${taskLabel}`,
            progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
            totalTasks,
            completedTasks,
            croppedCount,
            fallbackCount,
            inputJson,
            outputs,
            lastRunAt: Date.now(),
          },
        })

        if (!source?.url) {
          skippedCount += 1
          completedTasks += 1
          continue
        }

        const hasExplicitCropInfo = hasValidSceneDecomposeImageRect(item?.imageRect) || hasValidSceneDecomposePixelRect(item?.imageRectPixels)
        const normalizedSource = await ensureSceneDecomposeSourceDimensions(source)

        const cropInfo = normalizeSceneDecomposeCrop(item?.imageRect, item?.imageRectPixels, normalizedSource, {
          allowFullImageFallback: !hasExplicitCropInfo,
        })
        if (!cropInfo) {
          skippedCount += 1
          completedTasks += 1
          continue
        }

        const description = buildSceneDecomposeDescription(item, objectName)
        const transferFile = await options.buildImageTransferFileFromCrop({
          sourceUrl: source.url,
          sourceName: objectName,
          crop: cropInfo.crop,
          outputWidth: cropInfo.outputWidth,
          outputHeight: cropInfo.outputHeight,
          suffix: `decompose_${index + 1}`,
        })
        if (!transferFile) {
          skippedCount += 1
          completedTasks += 1
          continue
        }

        const generated = options.addGeneratedImageResource(transferFile)
        generatedFiles.set(outputId, transferFile)
        if (cropInfo.cropMode === 'fallback') fallbackCount += 1
        else croppedCount += 1
        outputs.push({
          id: outputId,
          objectId,
          name: objectName,
          description,
          cropMode: cropInfo.cropMode,
          sourceImageIndex,
          observedImageIndices: Array.isArray(item?.observedImageIndices)
            ? item.observedImageIndices.map((value: any) => Number(value)).filter((value: number) => Number.isFinite(value) && value > 0)
            : undefined,
          imageRect: cropInfo.crop,
          imageRectPixels: cropInfo.pixelRect,
          imageAnchorId: `out-image-${outputId}`,
          textAnchorId: `out-text-${outputId}`,
          generatedResourceId: generated.resourceId,
          outputWidth: cropInfo.outputWidth,
          outputHeight: cropInfo.outputHeight,
        })

        completedTasks += 1
        options.store.commit('setNodeSceneDecomposeSettings', {
          nodeId,
          sceneDecomposeSettings: {
            status: 'running',
            message: `正在处理 ${completedTasks} / ${totalTasks} 个拆解对象…`,
            currentStep: `已完成 ${taskLabel}`,
            progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100,
            totalTasks,
            completedTasks,
            croppedCount,
            fallbackCount,
            inputJson,
            outputs,
            lastRunAt: Date.now(),
          },
        })
      }

      if (!outputs.length) {
        options.store.commit('setNodeSceneDecomposeSettings', {
          nodeId,
          sceneDecomposeSettings: {
            status: 'error',
            message: '没有可生成的拆解对象，请检查图片输入、observedImageIndices 或裁切框信息。',
            inputJson,
            outputs: [],
            progress: totalTasks > 0 ? 100 : 0,
            totalTasks,
            completedTasks,
            croppedCount,
            fallbackCount,
          },
        })
        options.pushToast('场景分解失败：没有可生成的拆解对象。', 'warn')
        return
      }

      // 先提交完整 outputs 以触发场景拆解节点输出锚点的渲染，
      // 等待 Vue 完成 DOM 刷新后再执行自动布线，确保连线起点能对准实际锚点位置。
      options.store.commit('setNodeSceneDecomposeSettings', {
        nodeId,
        sceneDecomposeSettings: {
          status: 'running',
          message: `正在生成 ${outputs.length} 个拆解对象节点…`,
          currentStep: '准备自动布线',
          progress: 100,
          totalTasks,
          completedTasks,
          croppedCount,
          fallbackCount,
          inputJson,
          outputs,
          lastRunAt: Date.now(),
        },
      })
      await nextTick()

      const refreshedNode = options.store.state.nodesById[nodeId]
      if (!refreshedNode || refreshedNode.type !== 'scene-decompose') {
        options.pushToast('场景分解节点已失效，无法执行自动布线。', 'warn')
        return
      }

      const autoExpandResult = await options.autoExpandSceneDecomposeOutputs(refreshedNode, outputs, generatedFiles)
      const createdNodeIds = autoExpandResult.createdNodeIds
      const sceneLayoutConnections = Number(autoExpandResult.sceneLayoutConnections ?? 0)
      const completedMessage = skippedCount > 0
        ? `已拆解 ${outputs.length} 个对象，其中裁切 ${croppedCount} 个、整图回退 ${fallbackCount} 个，并跳过 ${skippedCount} 个无效对象。`
        : `已拆解 ${outputs.length} 个对象，其中裁切 ${croppedCount} 个、整图回退 ${fallbackCount} 个，并自动创建 ${createdNodeIds.length} 个下游节点${sceneLayoutConnections > 0 ? `，回连 ${sceneLayoutConnections} 个场景布局模型输入` : ''}。`

      options.store.commit('setNodeSceneDecomposeSettings', {
        nodeId,
        sceneDecomposeSettings: {
          status: 'completed',
          message: completedMessage,
          progress: 100,
          currentStep: '自动裁剪完成',
          totalTasks,
          completedTasks,
          croppedCount,
          fallbackCount,
          inputJson,
          outputs,
          lastRunAt: Date.now(),
          lastExpandedAt: Date.now(),
          lastExpandedCount: createdNodeIds.length,
        },
      })
      options.pushToast('场景分解已生成并展开。', 'info')
    } catch (err: any) {
      const message = String(err?.message ?? err ?? 'unknown')
      options.store.commit('setNodeSceneDecomposeSettings', {
        nodeId,
        sceneDecomposeSettings: {
          status: 'error',
          message,
          inputJson,
          outputs: [],
        },
      })
      options.pushToast(`场景分解失败：${message}`, 'warn')
    }
  }

  return {
    onNodeRunSceneDecompose,
  }
}
