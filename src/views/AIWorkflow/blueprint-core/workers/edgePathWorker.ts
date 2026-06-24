type WorkerNodeAnchor = {
  id: string
  offsetY?: number
}

type WorkerNode = {
  id: string
  type: string
  worldX: number
  worldY: number
  width: number
  inputs: WorkerNodeAnchor[]
  outputs: WorkerNodeAnchor[]
}

type WorkerEdge = {
  id: string
  fromNodeId: string
  fromAnchorId: string
  toNodeId: string
  toAnchorId: string
}

type WorkerRequest = {
  type: 'compute'
  version: number
  mutationVersion?: number
  viewport: { zoom: number; panX: number; panY: number }
  canvasViewportSize: { width: number; height: number }
  nodes: WorkerNode[]
  edges: WorkerEdge[]
  keepEdgeIds?: string[]
}

type WorkerResponse = {
  type: 'result'
  version: number
  mutationVersion: number
  edges: Array<{
    id: string
    start: { x: number; y: number }
    end: { x: number; y: number }
    path: string
    stroke?: string
    strokeWidth?: number
  }>
  stats?: {
    inputCount: number
    renderedCount: number
    culledCount: number
  }
}

const ANCHOR_GAP = 24
const ANCHOR_SIDE_INSET_PX = 0
const ANCHOR_IN_SIZE = 0
const ANCHOR_OUT_SIZE = 0
const STORY_ANCHOR_IN_SIZE = 0
const STORY_ANCHOR_OUT_SIZE = 0

const ANCHOR_IN_X_OFFSET = -ANCHOR_SIDE_INSET_PX + ANCHOR_IN_SIZE / 2
const ANCHOR_OUT_X_OFFSET = ANCHOR_SIDE_INSET_PX + ANCHOR_OUT_SIZE / 2
const STORY_ANCHOR_IN_X_OFFSET = -ANCHOR_SIDE_INSET_PX + STORY_ANCHOR_IN_SIZE / 2
const STORY_ANCHOR_OUT_X_OFFSET = ANCHOR_SIDE_INSET_PX - STORY_ANCHOR_OUT_SIZE / 2
const EDGE_VIEWPORT_CULL_MARGIN_PX = 240

const anchorWorld = (
  node: WorkerNode,
  kind: 'in' | 'out',
  anchorIndex: number,
  anchorCount: number,
  anchor?: WorkerNodeAnchor,
) => {
  const count = Math.max(1, anchorCount)
  const start = -((count - 1) * ANCHOR_GAP) / 2
  const offset = typeof anchor?.offsetY === 'number' ? anchor.offsetY : start + anchorIndex * ANCHOR_GAP
  const y = node.worldY + offset
  const width = Number.isFinite(node.width) ? node.width : 240
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

const worldToCanvas = (
  viewport: { zoom: number; panX: number; panY: number },
  canvasViewportSize: { width: number; height: number },
  point: { x: number; y: number },
) => {
  const viewportWidth = canvasViewportSize.width
  const viewportHeight = canvasViewportSize.height
  const zoom = Math.max(0.01, Number(viewport.zoom) || 1)
  return {
    x: viewportWidth / 2 + (Number(viewport.panX) || 0) + point.x * zoom,
    y: viewportHeight / 2 + (Number(viewport.panY) || 0) + point.y * zoom,
  }
}

const buildAnchorIndex = (anchors: WorkerNodeAnchor[]) => {
  const m = new Map<string, number>()
  for (let i = 0; i < anchors.length; i += 1) m.set(String(anchors[i]?.id ?? ''), i)
  return m
}

const shouldCullEdgeByViewport = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  viewportSize: { width: number; height: number },
  marginPx: number,
) => {
  const width = Number(viewportSize.width) || 0
  const height = Number(viewportSize.height) || 0
  if (width <= 0 || height <= 0) return false

  const left = -marginPx
  const top = -marginPx
  const right = width + marginPx
  const bottom = height + marginPx

  const curveSlackX = Math.max(80, Math.abs(end.x - start.x) * 0.5)
  const minX = Math.min(start.x, end.x) - curveSlackX
  const maxX = Math.max(start.x, end.x) + curveSlackX
  const minY = Math.min(start.y, end.y)
  const maxY = Math.max(start.y, end.y)

  return maxX < left || minX > right || maxY < top || minY > bottom
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data
  if (!msg || msg.type !== 'compute') return

  const nodeById = new Map<string, WorkerNode>()
  const inputIndexByNodeId = new Map<string, Map<string, number>>()
  const outputIndexByNodeId = new Map<string, Map<string, number>>()

  for (const node of msg.nodes || []) {
    nodeById.set(node.id, node)
    inputIndexByNodeId.set(node.id, buildAnchorIndex(Array.isArray(node.inputs) ? node.inputs : []))
    outputIndexByNodeId.set(node.id, buildAnchorIndex(Array.isArray(node.outputs) ? node.outputs : []))
  }

  const results: WorkerResponse['edges'] = []
  const keepEdgeIdSet = new Set<string>()
  for (const rawId of msg.keepEdgeIds || []) {
    const edgeId = String(rawId ?? '').trim()
    if (!edgeId) continue
    keepEdgeIdSet.add(edgeId)
  }
  let culledCount = 0
  let renderedCount = 0
  const inputCount = Array.isArray(msg.edges) ? msg.edges.length : 0

  for (const edge of msg.edges || []) {
    const fromNode = nodeById.get(String(edge.fromNodeId ?? ''))
    const toNode = nodeById.get(String(edge.toNodeId ?? ''))
    if (!fromNode || !toNode) continue

    const fromIndex = outputIndexByNodeId.get(fromNode.id)?.get(String(edge.fromAnchorId ?? '')) ?? 0
    const toIndex = inputIndexByNodeId.get(toNode.id)?.get(String(edge.toAnchorId ?? '')) ?? 0

    const fromAnchor = fromNode.outputs?.[Math.max(0, fromIndex)]
    const toAnchor = toNode.inputs?.[Math.max(0, toIndex)]

    const start = worldToCanvas(
      msg.viewport,
      msg.canvasViewportSize,
      anchorWorld(fromNode, 'out', Math.max(0, fromIndex), fromNode.outputs?.length || 0, fromAnchor),
    )
    const end = worldToCanvas(
      msg.viewport,
      msg.canvasViewportSize,
      anchorWorld(toNode, 'in', Math.max(0, toIndex), toNode.inputs?.length || 0, toAnchor),
    )

    const edgeId = String(edge.id ?? '')
    if (!keepEdgeIdSet.has(edgeId)) {
      const shouldCull = shouldCullEdgeByViewport(start, end, msg.canvasViewportSize, EDGE_VIEWPORT_CULL_MARGIN_PX)
      if (shouldCull) {
        culledCount += 1
        continue
      }
    }

    const isStory = fromNode.type === 'story'
    results.push({
      id: edge.id,
      start,
      end,
      path: buildPath(start, end),
      stroke: isStory ? '#f29d38' : undefined,
      strokeWidth: isStory ? 3.5 : undefined,
    })
    renderedCount += 1
  }

  ;(self as any).postMessage({
    type: 'result',
    version: Number(msg.version) || 0,
    mutationVersion: Number(msg.mutationVersion) || 0,
    edges: results,
    stats: {
      inputCount,
      renderedCount,
      culledCount,
    },
  } satisfies WorkerResponse)
}

export {}
