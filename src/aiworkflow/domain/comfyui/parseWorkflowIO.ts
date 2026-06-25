import type { WorkflowAnchorSpec } from '../../types'
import { isString, isNumber, isRecord, isArray, hasKey } from '../../../types/utils'

type ComfyWorkflowIO = {
  inputs: Array<Pick<WorkflowAnchorSpec, 'id' | 'label' | 'mediaType'>>
  outputs: Array<Pick<WorkflowAnchorSpec, 'id' | 'label' | 'mediaType'>>
  warnings: string[]
}

type ComfyNodeLike = Record<string, unknown>

const getNodeText = (node: ComfyNodeLike): string => {
  const type = hasKey(node, 'type') && isString(node.type) ? node.type : ''
  const title = hasKey(node, 'title') && isString(node.title) ? node.title : ''
  return `${type} ${title}`.toLowerCase()
}

const detectComfyNodeMediaType = (node: unknown): WorkflowAnchorSpec['mediaType'] => {
  const n = isRecord(node) ? node : {}
  const text = getNodeText(n)
  if (/save\s*video|load\s*video|savevideo|loadvideo/.test(text)) return 'video'
  if (/save\s*image|load\s*image|preview\s*image|saveimage|loadimage|previewimage/.test(text)) return 'image'
  return 'generic'
}

const detectMediaTypeFromPorts = (node: unknown): WorkflowAnchorSpec['mediaType'] => {
  const n = isRecord(node) ? node : {}
  const outputs = isArray(n.outputs) ? n.outputs : []
  const inputs = isArray(n.inputs) ? n.inputs : []
  const tokens = [
    ...outputs.map((o: unknown) => {
      if (isRecord(o) && hasKey(o, 'type') && isString(o.type)) return o.type
      return ''
    }),
    ...inputs.map((i: unknown) => {
      if (isRecord(i) && hasKey(i, 'type') && isString(i.type)) return i.type
      return ''
    }),
  ]
    .join(' ')
    .toLowerCase()

  if (/\b(video|audio\s*video|gif)\b/.test(tokens)) return 'video'
  if (/\bimage\b/.test(tokens)) return 'image'
  return detectComfyNodeMediaType(node)
}

const getNodeIdNum = (node: unknown): number => {
  const n = isRecord(node) ? node : {}
  const idVal = n.id
  if (isNumber(idVal)) return idVal
  const num = Number(idVal)
  return Number.isFinite(num) ? num : Number.MAX_SAFE_INTEGER
}

const getLinkNodeId = (link: unknown, ...keys: string[]): number | null => {
  if (isRecord(link)) {
    for (const key of keys) {
      if (hasKey(link, key)) {
        const val = link[key]
        const num = Number(val)
        if (Number.isFinite(num)) return num
      }
    }
  }
  return null
}

const getIncomingOutgoingCount = (workflow: unknown) => {
  const incoming = new Map<number, number>()
  const outgoing = new Map<number, number>()
  const wf = isRecord(workflow) ? workflow : {}
  const links = isArray(wf.links) ? wf.links : []
  for (const link of links) {
    if (isArray(link)) {
      const from = Number(link[1])
      const to = Number(link[3])
      if (Number.isFinite(from)) outgoing.set(from, (outgoing.get(from) ?? 0) + 1)
      if (Number.isFinite(to)) incoming.set(to, (incoming.get(to) ?? 0) + 1)
      continue
    }
    if (isRecord(link)) {
      const from = getLinkNodeId(link, 'origin_id', 'from', 'from_node_id')
      const to = getLinkNodeId(link, 'target_id', 'to', 'to_node_id')
      if (from != null) outgoing.set(from, (outgoing.get(from) ?? 0) + 1)
      if (to != null) incoming.set(to, (incoming.get(to) ?? 0) + 1)
    }
  }
  return { incoming, outgoing }
}

export const parseComfyWorkflowIO = (workflow: unknown): ComfyWorkflowIO => {
  const wf = isRecord(workflow) ? workflow : {}
  const nodes = isArray(wf.nodes) ? wf.nodes : []
  const { incoming, outgoing } = getIncomingOutgoingCount(workflow)
  const warnings: string[] = []

  const isInputNode = (node: unknown): boolean => {
    const text = isRecord(node) ? getNodeText(node) : ''
    if (/load\s*image|loadimage|image\s*input|start\s*frame/.test(text)) return true
    if (/load\s*video|loadvideo|video\s*input/.test(text)) return true

    const idNum = getNodeIdNum(node)
    const inCount = incoming.get(idNum) ?? 0
    const mediaType = detectMediaTypeFromPorts(node)

    if (inCount === 0 && (mediaType === 'image' || mediaType === 'video')) {
      const nodeRec = isRecord(node) ? node : {}
      const inputs = isArray(nodeRec.inputs) ? nodeRec.inputs : []
      const hasPathLikeWidget = inputs.some((i: unknown) => {
        if (!isRecord(i)) return false
        const name = hasKey(i, 'name') && isString(i.name) ? i.name.toLowerCase() : ''
        const widget = hasKey(i, 'widget') ? i.widget : undefined
        return /image|video|file|path|filename/.test(name) && Boolean(widget)
      })
      if (hasPathLikeWidget) return true
    }

    return false
  }

  const isOutputNode = (node: unknown): boolean => {
    const text = isRecord(node) ? getNodeText(node) : ''
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
    .filter((n: unknown) => isInputNode(n))
    .sort((a: unknown, b: unknown) => getNodeIdNum(a) - getNodeIdNum(b))

  const outputNodes = nodes
    .filter((n: unknown) => isOutputNode(n))
    .sort((a: unknown, b: unknown) => getNodeIdNum(a) - getNodeIdNum(b))

  const inputs = (inputNodes.length ? inputNodes : [null]).map((n: unknown, idx: number) => {
    let label = '图片输入'
    let mediaType: WorkflowAnchorSpec['mediaType'] = 'image'
    let nodeId = String(idx)
    if (n != null) {
      const nodeRec = isRecord(n) ? n : ({} as Record<string, unknown>)
      const titleVal = nodeRec.title
      const typeVal = nodeRec.type
      const title = isString(titleVal) ? titleVal : ''
      const type = isString(typeVal) ? typeVal : ''
      label = title || type || `输入${idx + 1}`
      mediaType = detectMediaTypeFromPorts(n)
      const idVal = nodeRec.id
      nodeId = isNumber(idVal) || isString(idVal) ? String(idVal) : String(idx)
    }
    return { id: `in-${nodeId}`, label, mediaType }
  })

  const outputs = (outputNodes.length ? outputNodes : [null]).map((n: unknown, idx: number) => {
    let label = '产物输出'
    let mediaType: WorkflowAnchorSpec['mediaType'] = 'generic'
    let nodeId = String(idx)
    if (n != null) {
      const nodeRec = isRecord(n) ? n : ({} as Record<string, unknown>)
      const titleVal = nodeRec.title
      const typeVal = nodeRec.type
      const title = isString(titleVal) ? titleVal : ''
      const type = isString(typeVal) ? typeVal : ''
      label = title || type || `产物${idx + 1}`
      mediaType = detectMediaTypeFromPorts(n)
      const idVal = nodeRec.id
      nodeId = isNumber(idVal) || isString(idVal) ? String(idVal) : String(idx)
    }
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
