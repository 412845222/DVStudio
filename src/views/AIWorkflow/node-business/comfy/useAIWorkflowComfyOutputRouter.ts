import type { ComfyBridgeMedia, ComfyLocalizedOutput } from './comfyOutputResolver'
import { comfyAnchorNodeIdFromAnchorId, inferMediaKind } from './comfyOutputResolver'

export const useAIWorkflowComfyOutputRouter = (payload: {
  store: {
    state: {
      nodesById: Record<string, any>
    }
  }
  getOutgoingEdges: (nodeId: string) => any[]
  comfyAnchorAssignments: Map<string, Map<string, string>>
  comfyAnchorLocalizedOutputs: Map<string, Map<string, ComfyLocalizedOutput>>
  blueprintProjectService: {
    importAsset: (params: any) => Promise<any>
  }
  currentProjectId: { value: number | null }
  resolveBackendUrl: (url: string) => string
  bindMediaResourceToNode: (
    nodeId: string,
    kind: 'image' | 'video',
    url: string,
    name: string,
    meta?: { sourcePath?: string }
  ) => void
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
}) => {
  const routeComfyOutputsToConnectedNodes = (
    comfyNodeId: string,
    media: ComfyBridgeMedia[],
    opts?: { notifyWarnings?: boolean }
  ): Promise<{ alerts: string[]; outputs: ComfyLocalizedOutput[] }> => {
    const comfyNode = payload.store.state.nodesById[comfyNodeId]
    if (!comfyNode || comfyNode.type !== 'comfyui') {
      return Promise.resolve({ alerts: [] as string[], outputs: [] as ComfyLocalizedOutput[] })
    }

    const outputs = Array.isArray(comfyNode.outputs) ? comfyNode.outputs : []
    const outputAnchorIds = outputs.map((a: any) => String(a?.id ?? '')).filter(Boolean)
    if (!outputAnchorIds.length) {
      return Promise.resolve({ alerts: [] as string[], outputs: [] as ComfyLocalizedOutput[] })
    }

    const outputAnchorIdSet = new Set(outputAnchorIds)
    const outputAnchorMap = new Map(outputs.map((a: any) => [String(a?.id ?? ''), a]))
    const outputAnchorOrder = new Map(outputs.map((a: any, idx: number) => [String(a?.id ?? ''), idx]))
    const outgoing = payload.getOutgoingEdges(comfyNodeId).filter((e: any) => outputAnchorIdSet.has(String(e.fromAnchorId ?? '')))

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
      const assignMap = payload.comfyAnchorAssignments.get(comfyNodeId) ?? new Map<string, string>()
      if (!payload.comfyAnchorAssignments.has(comfyNodeId)) {
        payload.comfyAnchorAssignments.set(comfyNodeId, assignMap)
      }

      const localizedByAnchor = payload.comfyAnchorLocalizedOutputs.get(comfyNodeId) ?? new Map<string, ComfyLocalizedOutput>()
      if (!payload.comfyAnchorLocalizedOutputs.has(comfyNodeId)) {
        payload.comfyAnchorLocalizedOutputs.set(comfyNodeId, localizedByAnchor)
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
        const fromMediaType = (fromAnchor as any)?.mediaType as 'image' | 'video' | undefined

        const targetKinds = edgesForAnchor
          .map((e: any) => {
            const to = payload.store.state.nodesById[e.toNodeId]
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
          const imported = await payload.blueprintProjectService.importAsset({
            kind: inferredMediaType,
            name: String(selectedMedia.filename || `comfy_${inferredMediaType}_${Date.now()}`),
            sourceUrl: String(selectedMedia.url || ''),
            baseUrl: String(comfyNode.comfyuiSettings?.baseUrl || '').trim() || undefined,
            filename: String(selectedMedia.filename || '').trim() || undefined,
            subfolder: String((selectedMedia as any).subfolder || '').trim() || undefined,
            type: String((selectedMedia as any).type || '').trim() || undefined,
            projectId: payload.currentProjectId.value,
          })

          if (!imported.ok) {
            alerts.add(`ComfyUI 产物入库失败：锚点「${fromAnchorLabel}」未入库（${String((imported as any).error || 'unknown')}）`)
            continue
          }

          const asset = (imported as any).asset ?? {}
          const importedUrl = payload.resolveBackendUrl(String(asset.url || ''))
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
          const to = payload.store.state.nodesById[e.toNodeId]
          if (!to) continue
          const targetKind = to.type === 'image' ? 'image' : to.type === 'video' ? 'video' : null
          if (!targetKind) continue
          if (targetKind !== localizedOutput.kind) continue
          payload.bindMediaResourceToNode(
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
        .filter((x: ComfyLocalizedOutput | undefined): x is ComfyLocalizedOutput => !!x && String(x.url || '').trim().length > 0)

      const alertList = Array.from(alerts)
      if (opts?.notifyWarnings !== false && alertList.length) {
        for (const msg of alertList) payload.pushToast(msg, 'warn')
      }
      return { alerts: alertList, outputs: localizedOutputs }
    }

    return run()
  }

  return {
    routeComfyOutputsToConnectedNodes,
  }
}