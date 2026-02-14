import type { WorkflowAnchorSpec } from '../../types'

type ComfyWorkflowIO = {
  inputs: Array<Pick<WorkflowAnchorSpec, 'id' | 'label' | 'mediaType'>>
  outputs: Array<Pick<WorkflowAnchorSpec, 'id' | 'label' | 'mediaType'>>
  warnings: string[]
}

const detectComfyNodeMediaType = (node: any): WorkflowAnchorSpec['mediaType'] => {
  const text = `${String(node?.type ?? '')} ${String(node?.title ?? '')}`.toLowerCase()
  if (/save\s*video|load\s*video|savevideo|loadvideo/.test(text)) return 'video'
  if (/save\s*image|load\s*image|preview\s*image|saveimage|loadimage|previewimage/.test(text)) return 'image'
  return 'generic'
}

const detectMediaTypeFromPorts = (node: any): WorkflowAnchorSpec['mediaType'] => {
  const outputs = Array.isArray(node?.outputs) ? node.outputs : []
  const inputs = Array.isArray(node?.inputs) ? node.inputs : []
  const tokens = [
    ...outputs.map((o: any) => String(o?.type ?? '')),
    ...inputs.map((i: any) => String(i?.type ?? '')),
  ]
    .join(' ')
    .toLowerCase()

  if (/\b(video|audio\s*video|gif)\b/.test(tokens)) return 'video'
  if (/\bimage\b/.test(tokens)) return 'image'
  return detectComfyNodeMediaType(node)
}

const getNodeIdNum = (node: any): number => {
  const n = Number(node?.id)
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER
}

const getIncomingOutgoingCount = (workflow: any) => {
  const incoming = new Map<number, number>()
  const outgoing = new Map<number, number>()
  const links = Array.isArray(workflow?.links) ? workflow.links : []
  for (const link of links) {
    if (Array.isArray(link)) {
      const from = Number(link?.[1])
      const to = Number(link?.[3])
      if (Number.isFinite(from)) outgoing.set(from, (outgoing.get(from) ?? 0) + 1)
      if (Number.isFinite(to)) incoming.set(to, (incoming.get(to) ?? 0) + 1)
      continue
    }
    if (link && typeof link === 'object') {
      const from = Number((link as any).origin_id ?? (link as any).from ?? (link as any).from_node_id)
      const to = Number((link as any).target_id ?? (link as any).to ?? (link as any).to_node_id)
      if (Number.isFinite(from)) outgoing.set(from, (outgoing.get(from) ?? 0) + 1)
      if (Number.isFinite(to)) incoming.set(to, (incoming.get(to) ?? 0) + 1)
    }
  }
  return { incoming, outgoing }
}

export const parseComfyWorkflowIO = (workflow: any): ComfyWorkflowIO => {
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : []
  const { incoming, outgoing } = getIncomingOutgoingCount(workflow)
  const warnings: string[] = []

  const isInputNode = (node: any) => {
    const text = `${String(node?.type ?? '')} ${String(node?.title ?? '')}`.toLowerCase()
    if (/load\s*image|loadimage|image\s*input|start\s*frame/.test(text)) return true
    if (/load\s*video|loadvideo|video\s*input/.test(text)) return true

    const idNum = getNodeIdNum(node)
    const inCount = incoming.get(idNum) ?? 0
    const mediaType = detectMediaTypeFromPorts(node)

    if (inCount === 0 && (mediaType === 'image' || mediaType === 'video')) {
      const inputs = Array.isArray(node?.inputs) ? node.inputs : []
      const hasPathLikeWidget = inputs.some((i: any) => {
        const name = String(i?.name ?? '').toLowerCase()
        return /image|video|file|path|filename/.test(name) && i?.widget
      })
      if (hasPathLikeWidget) return true
    }

    return false
  }

  const isOutputNode = (node: any) => {
    const text = `${String(node?.type ?? '')} ${String(node?.title ?? '')}`.toLowerCase()
    if (/save\s*image|saveimage|preview\s*image/.test(text)) return true
    if (/save\s*video|savevideo|video\s*combine|vhs/.test(text)) return true

    const idNum = getNodeIdNum(node)
    const outCount = outgoing.get(idNum) ?? 0
    if (outCount === 0) {
      const mediaType = detectMediaTypeFromPorts(node)
      if (mediaType === 'image' || mediaType === 'video') return true
    }

    return false
  }

  const inputNodes = nodes
    .filter((n: any) => isInputNode(n))
    .sort((a: any, b: any) => getNodeIdNum(a) - getNodeIdNum(b))

  const outputNodes = nodes
    .filter((n: any) => isOutputNode(n))
    .sort((a: any, b: any) => getNodeIdNum(a) - getNodeIdNum(b))

  const inputs = (inputNodes.length ? inputNodes : [null]).map((n: any, idx: number) => {
    const label = n ? String(n?.title ?? n?.type ?? `输入${idx + 1}`) : '图片输入'
    const mediaType = n ? detectMediaTypeFromPorts(n) : 'image'
    const nodeId = n != null ? String(n?.id ?? idx) : String(idx)
    return { id: `in-${nodeId}`, label, mediaType }
  })

  const outputs = (outputNodes.length ? outputNodes : [null]).map((n: any, idx: number) => {
    const label = n ? String(n?.title ?? n?.type ?? `产物${idx + 1}`) : '产物输出'
    const mediaType = n ? detectMediaTypeFromPorts(n) : 'generic'
    const nodeId = n != null ? String(n?.id ?? idx) : String(idx)
    return { id: `out-${nodeId}`, label, mediaType }
  })

  const unknownOutputCount = outputs.filter((o: ComfyWorkflowIO['outputs'][number]) => o.mediaType !== 'image' && o.mediaType !== 'video').length
  if (unknownOutputCount > 0) {
    warnings.push(
      `检测到 ${unknownOutputCount} 个 ComfyUI 输出锚点无法识别为图片/视频，请优先使用 SaveImage/SaveVideo。`
    )
  }

  return { inputs, outputs, warnings }
}
