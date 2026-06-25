import type { WorkflowNode, WorkflowSceneDecomposeOutput } from '../../../../aiworkflow/types'

export const useAIWorkflowSceneDecomposeAutoExpand = (options: {
  store: any
  getIncomingEdges: (nodeId: string, anchorId?: string) => any[]
  connectedTextInputValue: (nodeId: string, anchorId: string) => string
  hasExactEdge: (payload: { fromNodeId: string; fromAnchorId: string; toNodeId: string; toAnchorId: string }) => boolean
  onNodeRunSceneLayout: (nodeId: string) => Promise<void>
  sceneLayoutModelInputAnchorId: (objectId: string) => string
  connectedSceneDecomposeImageInputRefAt: (
    nodeId: string,
    sourceImageIndex: number,
  ) => { inputAnchorId: string; fromNodeId: string; fromAnchorId: string; fromNode: WorkflowNode } | null
  onNodeUploadResource: (nodeId: string, file: File, kind: 'image' | 'video', opts?: { autoDistribute?: boolean }) => void
  onAutoWireNodeCreated?: (nodeId: string) => void
}) => {
  const autoExpandSceneDecomposeOutputs = async (
    sourceNode: WorkflowNode,
    outputs: WorkflowSceneDecomposeOutput[],
    generatedFiles: Map<string, File>,
  ) => {
    const createdNodeIds: string[] = []
    const createdModelTargets: Array<{ objectId: string; model3dNodeId: string }> = []
    const jsonInputEdge = options.getIncomingEdges(sourceNode.id, 'in-json')[0] ?? null
    const jsonSourceNodeId = String((jsonInputEdge as any)?.fromNodeId ?? '').trim()
    const jsonSourceAnchorId = String((jsonInputEdge as any)?.fromAnchorId ?? 'out-text').trim() || 'out-text'
    const inputJson = String(options.connectedTextInputValue(sourceNode.id, 'in-json') ?? '').trim()
    const actionableOutputs = outputs.filter((output) => generatedFiles.has(output.id))
    const baseX = sourceNode.worldX + sourceNode.width + 180
    const baseY = sourceNode.worldY - 30
    const horizontalGap = 110
    const rowGap = 620

    const nodeFootprint = {
      image: { width: 450, height: 300 },
      text: { width: 360, height: 260 },
      model3d: { width: 450, height: 420 },
      sceneLayout: { width: 450, height: 430 },
    }

    const pipelineColumns = [
      nodeFootprint.image.width,    // 列0: 拆解截图
      nodeFootprint.text.width,     // 列1: 图像Prompt
      nodeFootprint.image.width,    // 列2: 生成图像
      nodeFootprint.text.width,     // 列3: 3D Prompt
      nodeFootprint.model3d.width,  // 列4: 3D模型
    ]

    const columnCenterX = (columnIndex: number) => {
      let offset = baseX
      for (let index = 0; index < columnIndex; index += 1) {
        offset += pipelineColumns[index] + horizontalGap
      }
      return offset + pipelineColumns[columnIndex] / 2
    }

    const rowCenterY = (rowIndex: number) => baseY + rowIndex * rowGap

    const createNode = (payload: {
      worldX: number
      worldY: number
      title: string
      type: WorkflowNode['type']
      alias: string
    }) => {
      options.store.commit('addNodeAt', { worldX: payload.worldX, worldY: payload.worldY, title: payload.title })
      const nodeId = String(options.store.state.selectedNodeId ?? '').trim()
      if (!nodeId) return ''
      options.store.commit('setNodeType', { nodeId, type: payload.type })
      options.store.commit('setNodeAlias', { nodeId, alias: payload.alias })
      options.onAutoWireNodeCreated?.(nodeId)
      return nodeId
    }

    const addEdgeIfMissing = (payload: {
      fromNodeId: string
      fromAnchorId: string
      toNodeId: string
      toAnchorId: string
    }) => {
      const exists = options.hasExactEdge(payload)
      if (exists) return false
      options.store.commit('addEdge', payload)
      return true
    }

    const replaceIncomingSceneLayoutModelEdge = (
      sceneLayoutNodeId: string,
      inputAnchorId: string,
      nextModel3dNodeId: string,
    ) => {
      const incomingEdges = options.getIncomingEdges(sceneLayoutNodeId, inputAnchorId)
      let removedAny = false
      for (const edge of incomingEdges) {
        const fromNodeId = String((edge as any)?.fromNodeId ?? '').trim()
        if (!fromNodeId || fromNodeId === nextModel3dNodeId) continue
        const fromNode = options.store.state.nodesById[fromNodeId]
        if (!fromNode || fromNode.type !== 'model3d') continue
        const edgeId = String((edge as any)?.id ?? '').trim()
        if (!edgeId) continue
        options.store.commit('removeEdge', { edgeId })
        removedAny = true
      }
      return removedAny
    }

    const ensureSceneLayoutPreviewNode = async () => {
      const targetX = columnCenterX(pipelineColumns.length) + horizontalGap / 2 + nodeFootprint.sceneLayout.width / 2
      const targetY = actionableOutputs.length > 1
        ? baseY + ((actionableOutputs.length - 1) * rowGap) / 2
        : baseY

      let sceneLayoutNodeId = ''
      if (jsonSourceNodeId) {
        for (const candidateId of options.store.state.nodeOrder) {
          const candidate = options.store.state.nodesById[candidateId]
          if (!candidate || candidate.type !== 'scene-layout') continue
          const edge = options.getIncomingEdges(candidateId, 'in-json')[0]
          if (!edge) continue
          const sameSource = String((edge as any).fromNodeId ?? '').trim() === jsonSourceNodeId
            && String((edge as any).fromAnchorId ?? '').trim() === jsonSourceAnchorId
          if (sameSource) {
            sceneLayoutNodeId = candidateId
            break
          }
        }
      }

      let created = false
      if (!sceneLayoutNodeId) {
        sceneLayoutNodeId = createNode({
          worldX: targetX,
          worldY: targetY,
          title: '场景布局预览',
          type: 'scene-layout',
          alias: '场景布局预览',
        })
        created = !!sceneLayoutNodeId
        if (sceneLayoutNodeId) createdNodeIds.push(sceneLayoutNodeId)
      } else {
        options.store.commit('setNodePosition', { nodeId: sceneLayoutNodeId, worldX: targetX, worldY: targetY })
      }

      if (!sceneLayoutNodeId) return ''

      options.store.commit('setNodeSceneLayoutSettings', {
        nodeId: sceneLayoutNodeId,
        sceneLayoutSettings: {
          previewMode: true,
        },
      })

      if (jsonSourceNodeId) {
        addEdgeIfMissing({
          fromNodeId: jsonSourceNodeId,
          fromAnchorId: jsonSourceAnchorId,
          toNodeId: sceneLayoutNodeId,
          toAnchorId: 'in-json',
        })
      }

      if (inputJson) {
        await options.onNodeRunSceneLayout(sceneLayoutNodeId)
      } else if (created) {
        options.store.commit('setNodeSceneLayoutSettings', {
          nodeId: sceneLayoutNodeId,
          sceneLayoutSettings: {
            message: '等待场景 JSON 输入。',
          },
        })
      }

      return sceneLayoutNodeId
    }

    const normalizePromptText = (value: string) => String(value ?? '').replace(/\s+/g, ' ').trim()
    const isWindowLikeObject = (name: string) => /窗|window|glass|玻璃/i.test(String(name ?? ''))
    const buildMeshyImagePrompt = (output: WorkflowSceneDecomposeOutput) => {
      const objectName = normalizePromptText(String(output.name ?? '对象')) || '对象'
      const windowLike = isWindowLikeObject(objectName)
      const windowExtra = windowLike
        ? [
            '目标是窗户构件本体，只保留窗框与玻璃，不要出现室内或室外场景内容。',
            '玻璃不要反射任何环境，不要透视看到后方画面，可使用中性灰或轻微磨砂半透明玻璃占位。',
          ]
        : []
      return [
        `请生成“${objectName}”的单体三维建模参考图。`,
        '仅保留一个目标物体，居中展示，完整可见，正交风格，方图构图，纯白背景。',
        '保留目标物体的真实外形比例、结构层级和材质分区，线条清晰，边界干净。',
        ...windowExtra,
        '禁止出现环境、房间、地面、墙面、道具、人物、文字、水印。',
        '禁止镜面反射、禁止高光反射出其他画面、禁止投影干扰。',
        '结果应适合下游 3D 重建与低模建模参考。',
      ].join(' ')
    }

    const buildMeshy3dPrompt = (output: WorkflowSceneDecomposeOutput) => {
      const objectName = normalizePromptText(String(output.name ?? '对象')) || '对象'
      const windowLike = isWindowLikeObject(objectName)
      const windowExtra = windowLike
        ? [
            '若目标为窗户，仅建模窗框与玻璃平面占位，不要把室内外场景烘焙进模型。',
            '玻璃材质保持干净中性，不要反射或贴图出其他房间画面。',
          ]
        : []
      return [
        `请基于参考图生成“${objectName}”的单体低模 3D 模型。`,
        '仅建模目标物体本体，保持可识别轮廓、主要结构和材质分区。',
        '网格应轻量、拓扑清晰、比例稳定，便于场景布局预览和后续编辑。',
        ...windowExtra,
        '禁止包含背景、底座、墙地面、文字、水印、支撑架或其他附加物体。',
        '输出为可独立使用的单体模型资产。',
      ].join(' ')
    }

    const autoConnectGroupsToSceneLayout = (
      sceneLayoutNodeId: string,
      groups: Array<{ objectId: string; model3dNodeId: string }>,
    ) => {
      if (!sceneLayoutNodeId) return 0
      const sceneLayoutNode = options.store.state.nodesById[sceneLayoutNodeId]
      if (!sceneLayoutNode || sceneLayoutNode.type !== 'scene-layout') return 0

      let connectedCount = 0
      for (const group of groups) {
        const objectId = String(group.objectId ?? '').trim()
        const model3dNodeId = String(group.model3dNodeId ?? '').trim()
        if (!objectId || !model3dNodeId) continue
        const inputAnchorId = options.sceneLayoutModelInputAnchorId(objectId)
        const hasAnchor = Array.isArray(sceneLayoutNode.inputs)
          ? sceneLayoutNode.inputs.some((anchor: any) => String(anchor?.id ?? '') === inputAnchorId)
          : false
        if (!hasAnchor) continue

        replaceIncomingSceneLayoutModelEdge(sceneLayoutNodeId, inputAnchorId, model3dNodeId)
        if (addEdgeIfMissing({
          fromNodeId: model3dNodeId,
          fromAnchorId: 'out-model',
          toNodeId: sceneLayoutNodeId,
          toAnchorId: inputAnchorId,
        })) {
          connectedCount += 1
        }
      }
      return connectedCount
    }

    for (let index = 0; index < outputs.length; index += 1) {
      const output = outputs[index]
      const file = generatedFiles.get(output.id)
      if (!file) continue
      const currentY = rowCenterY(index)
      const requestedSourceIndex = Math.max(1, Number(output.sourceImageIndex ?? 1) || 1)
      const sourceRef = options.connectedSceneDecomposeImageInputRefAt(sourceNode.id, requestedSourceIndex)
      const objectId = String(output.objectId ?? output.id ?? '').trim() || String(output.id)

      // 列0: 拆解截图
      const imageNodeId = createNode({
        worldX: columnCenterX(0),
        worldY: currentY,
        title: output.name || '拆解图片',
        type: 'image',
        alias: output.name ? `${output.name} 图像` : '拆解图像',
      })
      if (!imageNodeId) continue
      // 输出锚点已归一化：所有下游节点统一从场景拆解节点的 out-main 锚点连出
      addEdgeIfMissing({
        fromNodeId: sourceNode.id,
        fromAnchorId: 'out-main',
        toNodeId: imageNodeId,
        toAnchorId: 'in-image',
      })
      const clonedFile = new File([file], file.name, { type: file.type || 'image/png' })
      options.onNodeUploadResource(imageNodeId, clonedFile, 'image', { autoDistribute: false })
      createdNodeIds.push(imageNodeId)

      // 列1: 图像Prompt
      const imagePromptNodeId = createNode({
        worldX: columnCenterX(1),
        worldY: currentY,
        title: output.name || '图像 Prompt',
        type: 'text',
        alias: output.name ? `${output.name} 图像Prompt` : '图像Prompt',
      })
      if (!imagePromptNodeId) continue
      options.store.commit('upsertNode', {
        node: {
          ...options.store.state.nodesById[imagePromptNodeId],
          id: imagePromptNodeId,
          textValue: buildMeshyImagePrompt(output),
        },
      })
      createdNodeIds.push(imagePromptNodeId)

      // 列2: 生成图像（替换原Meshy图像节点）
      const generatedImageNodeId = createNode({
        worldX: columnCenterX(2),
        worldY: currentY,
        title: output.name || '生成图像',
        type: 'image',
        alias: output.name ? `${output.name} 生成图像` : '生成图像',
      })
      if (!generatedImageNodeId) continue
      // 连接图像Prompt输出到生成图像节点
      addEdgeIfMissing({
        fromNodeId: imagePromptNodeId,
        fromAnchorId: 'out-text',
        toNodeId: generatedImageNodeId,
        toAnchorId: 'in-text',
      })
      // 连接参考图到生成图像节点
      if (sourceRef?.fromNodeId && sourceRef?.fromAnchorId) {
        addEdgeIfMissing({
          fromNodeId: sourceRef.fromNodeId,
          fromAnchorId: sourceRef.fromAnchorId,
          toNodeId: generatedImageNodeId,
          toAnchorId: 'in-image',
        })
      }
      addEdgeIfMissing({
        fromNodeId: imageNodeId,
        fromAnchorId: 'out-image',
        toNodeId: generatedImageNodeId,
        toAnchorId: 'in-image',
      })
      createdNodeIds.push(generatedImageNodeId)

      // 列3: 3D Prompt（调整列索引）
      const modelPromptNodeId = createNode({
        worldX: columnCenterX(3),
        worldY: currentY,
        title: output.name || '3D Prompt',
        type: 'text',
        alias: output.name ? `${output.name} 3DPrompt` : '3DPrompt',
      })
      if (!modelPromptNodeId) continue
      options.store.commit('upsertNode', {
        node: {
          ...options.store.state.nodesById[modelPromptNodeId],
          id: modelPromptNodeId,
          textValue: buildMeshy3dPrompt(output),
        },
      })
      createdNodeIds.push(modelPromptNodeId)

      // 列4: 3D模型（调整列索引，配置为Meshy模式）
      const model3dNodeId = createNode({
        worldX: columnCenterX(4),
        worldY: currentY,
        title: output.name || '3D 模型',
        type: 'model3d',
        alias: output.name ? `${output.name} 3D模型` : '3D模型',
      })
      if (!model3dNodeId) continue
      // 配置3D模型节点为Meshy模式
      options.store.commit('setNodeModel3DSettings', {
        nodeId: model3dNodeId,
        model3dSettings: {
          modelGenerationSource: 'meshy',
          meshyModelSettings: {
            taskFamily: 'image-to-3d',
            prompt: buildMeshy3dPrompt(output),
            aiModel: 'latest',
            modelType: 'lowpoly',
            topology: 'triangle',
            targetPolycount: 12000,
            shouldTexture: true,
            removeLighting: false,
          },
        },
      })
      // 连接生成图像输出到3D模型节点
      addEdgeIfMissing({
        fromNodeId: generatedImageNodeId,
        fromAnchorId: 'out-image',
        toNodeId: model3dNodeId,
        toAnchorId: 'in-model',
      })
      createdNodeIds.push(model3dNodeId)
      createdModelTargets.push({ objectId, model3dNodeId })
    }

    const sceneLayoutNodeId = await ensureSceneLayoutPreviewNode()
    const sceneLayoutConnections = autoConnectGroupsToSceneLayout(sceneLayoutNodeId, createdModelTargets)
    return {
      createdNodeIds,
      sceneLayoutConnections,
    }
  }

  return {
    autoExpandSceneDecomposeOutputs,
  }
}