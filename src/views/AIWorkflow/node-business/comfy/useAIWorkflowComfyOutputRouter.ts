import type { ComfyBridgeMedia, ComfyLocalizedOutput } from './comfyOutputResolver'
import { comfyAnchorNodeIdFromAnchorId, inferMediaKind } from './comfyOutputResolver'

type OutputAnchor = {
  id?: string
  label?: string
  mediaType?: 'image' | 'video'
  [key: string]: unknown
}

type Edge = {
  fromNodeId?: string
  toNodeId?: string
  fromAnchorId?: string
  toAnchorId?: string
  [key: string]: unknown
}

export const useAIWorkflowComfyOutputRouter = (payload: {
  store: {
    state: {
      nodesById: Record<string, unknown>
    }
  }
  getOutgoingEdges: (nodeId: string) => Edge[]
  comfyAnchorAssignments: Map<string, Map<string, string>>
  comfyAnchorLocalizedOutputs: Map<string, Map<string, ComfyLocalizedOutput>>
  blueprintProjectService: unknown
  currentProjectId: { value: number | null }
  isElectron: () => boolean
  downloadUrlToProjectRoot?: (
    projectId: number,
    url: string,
    desiredFilename?: string
  ) => Promise<{ ok: boolean; absolutePath?: string; relativePath?: string; size?: number; error?: string } | null>
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
    const nodeRecord = payload.store.state.nodesById[comfyNodeId]
    const comfyNode = nodeRecord as { type?: string; outputs?: unknown; comfyuiSettings?: { baseUrl?: string } } | undefined
    if (!comfyNode || comfyNode.type !== 'comfyui') {
      return Promise.resolve({ alerts: [] as string[], outputs: [] as ComfyLocalizedOutput[] })
    }

    const outputs = Array.isArray(comfyNode.outputs) ? comfyNode.outputs as OutputAnchor[] : []
    const outputAnchorIds = outputs.map((a: OutputAnchor) => String(a?.id ?? '')).filter(Boolean)
    if (!outputAnchorIds.length) {
      return Promise.resolve({ alerts: [] as string[], outputs: [] as ComfyLocalizedOutput[] })
    }

    const outputAnchorIdSet = new Set(outputAnchorIds)
    const outputAnchorMap = new Map(outputs.map((a: OutputAnchor) => [String(a?.id ?? ''), a]))
    const outputAnchorOrder = new Map(outputs.map((a: OutputAnchor, idx: number) => [String(a?.id ?? ''), idx]))
    const outgoing = payload.getOutgoingEdges(comfyNodeId).filter((e: Edge) => outputAnchorIdSet.has(String(e.fromAnchorId ?? '')))

    const outgoingByAnchor = new Map<string, Edge[]>()
    for (const e of outgoing) {
      const anchorId = String(e?.fromAnchorId ?? '')
      if (!anchorId) continue
      const list = outgoingByAnchor.get(anchorId) ?? []
      list.push(e)
      outgoingByAnchor.set(anchorId, list)
    }

    const imageMedia = media.filter((m) => inferMediaKind(m) === 'image' && String(m.url || '').trim())
    const videoMedia = media.filter((m) => inferMediaKind(m) === 'video' && String(m.url || '').trim())
    const fallbackCursor = { image: 0, video: 0 }
    const alerts = new Set<string>()

    const mediaKey = (m: ComfyBridgeMedia) => {
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
        const fromAnchorLabel = String(fromAnchor?.label ?? anchorId ?? '输出锚点')
        const fromMediaType = fromAnchor?.mediaType as 'image' | 'video' | undefined

        const targetKinds = edgesForAnchor
          .map((e: Edge) => {
            const toRecord = payload.store.state.nodesById[e.toNodeId ?? '']
            const to = toRecord as { type?: string } | undefined
            return to?.type === 'image' ? 'image' : to?.type === 'video' ? 'video' : null
          })
          .filter((x): x is 'image' | 'video' => x === 'image' || x === 'video')
        const uniqueTargetKinds = Array.from(new Set(targetKinds))

        if (fromMediaType === 'image' || fromMediaType === 'video') {
          if (uniqueTargetKinds.some((k) => k !== fromMediaType)) {
            alerts.add(`连接类型不匹配：输出锚点「${fromAnchorLabel}」为 ${fromMediaType}，但存在不匹配的下游连接。`)
          }
        }

        const anchorNodeIdRaw = comfyAnchorNodeIdFromAnchorId(anchorId)
        const exactNodeCandidates: ComfyBridgeMedia[] = anchorNodeIdRaw
          ? media.filter((m: ComfyBridgeMedia) => String(m?.nodeId ?? '').trim() === anchorNodeIdRaw)
          : []

        let inferredMediaType: 'image' | 'video' | null =
          fromMediaType === 'image' || fromMediaType === 'video' ? fromMediaType : null

        if (!inferredMediaType && exactNodeCandidates.length) {
          inferredMediaType = inferMediaKind(exactNodeCandidates[0])
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
          .filter((m: ComfyBridgeMedia) => inferMediaKind(m) === inferredMediaType)

        let selectedMedia: ComfyBridgeMedia | null = null
        if (exactByKind.length) {
          selectedMedia = exactByKind[0]
        } else if (exactNodeCandidates.length) {
          selectedMedia = exactNodeCandidates[0]
        } else {
          const idx = fallbackCursor[inferredMediaType]
          if (idx < list.length) {
            selectedMedia = list[idx]
            fallbackCursor[inferredMediaType] += 1
          } else {
            selectedMedia = list[list.length - 1]
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
          const pid = Number(payload.currentProjectId.value ?? 0)
          const selectedUrl = String(selectedMedia.url || '').trim()
          const desiredName = String(selectedMedia.filename || `comfy_${inferredMediaType}_${Date.now()}`).trim()
          let localizedFromElectron = false

          if (payload.isElectron() && Number.isFinite(pid) && pid > 0 && selectedUrl && typeof payload.downloadUrlToProjectRoot === 'function') {
            try {
              const dl = await payload.downloadUrlToProjectRoot(pid, selectedUrl, desiredName)
              const rel = String(dl?.relativePath || '').trim()
              const abs = String(dl?.absolutePath || '').trim()
              if (dl?.ok && rel && abs) {
                localizedOutput = {
                  kind: inferredMediaType,
                  url: `dweb://project-assets?projectId=${pid}&path=${encodeURIComponent(rel)}`,
                  filename: desiredName,
                  anchorId,
                  nodeId: String(selectedMedia.nodeId ?? '').trim() || undefined,
                  sourcePath: abs,
                  subfolder: String(selectedMedia.subfolder || '').trim() || undefined,
                  type: String(selectedMedia.type || '').trim() || undefined,
                }
                importedByMediaKey.set(key, localizedOutput)
                localizedFromElectron = true
              }
            } catch {
              // ignore and fallback
            }
          }

          if (!localizedFromElectron && payload.isElectron()) {
            alerts.add(`ComfyUI 产物入库失败：锚点「${fromAnchorLabel}」主进程下载失败。`)
            continue
          }

          if (!localizedFromElectron) {
            const service = payload.blueprintProjectService as {
              importAsset: (params: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; asset?: Record<string, unknown> }>
            }
            const imported = await service.importAsset({
              kind: inferredMediaType,
              name: desiredName,
              sourceUrl: selectedUrl,
              baseUrl: String(comfyNode.comfyuiSettings?.baseUrl || '').trim() || undefined,
              filename: String(selectedMedia.filename || '').trim() || undefined,
              subfolder: String(selectedMedia.subfolder || '').trim() || undefined,
              type: String(selectedMedia.type || '').trim() || undefined,
              projectId: payload.currentProjectId.value,
            })

            if (!imported.ok) {
              alerts.add(`ComfyUI 产物入库失败：锚点「${fromAnchorLabel}」未入库（${String(imported.error || 'unknown')}）`)
              continue
            }

            const asset = imported.asset ?? {}
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
              nodeId: String(selectedMedia.nodeId ?? '').trim() || undefined,
              sourcePath: String(asset.sourcePath || asset.absolutePath || '').trim() || undefined,
              subfolder: String(selectedMedia.subfolder || '').trim() || undefined,
              type: String(selectedMedia.type || '').trim() || undefined,
            }
            importedByMediaKey.set(key, localizedOutput)
          }
        }

        assignMap.set(anchorId, key)
        localizedByAnchor.set(anchorId, localizedOutput!)

        for (const e of edgesForAnchor) {
          const toRecord = payload.store.state.nodesById[e.toNodeId ?? '']
          const to = toRecord as { id?: string; type?: string } | undefined
          if (!to) continue
          const targetKind = to.type === 'image' ? 'image' : to.type === 'video' ? 'video' : null
          if (!targetKind) continue
          if (targetKind !== localizedOutput!.kind) continue
          payload.bindMediaResourceToNode(
            to.id ?? '',
            localizedOutput!.kind,
            localizedOutput!.url,
            String(localizedOutput!.filename || `comfy_${localizedOutput!.kind}_${Date.now()}`),
            {
              sourcePath: String(localizedOutput!.sourcePath || '').trim() || undefined,
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
        .map((a: OutputAnchor) => localizedByAnchor.get(String(a?.id ?? '')))
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
