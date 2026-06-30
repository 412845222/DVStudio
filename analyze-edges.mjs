import fs from 'fs'

const blueprintPath = 'G:/DVSTestProject/展示示例/Blueprints/main.blueprint.json'

function readJson(path) {
  const buf = fs.readFileSync(path)
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return JSON.parse(buf.slice(3).toString('utf8'))
  }
  return JSON.parse(buf.toString('utf8'))
}

const blueprint = readJson(blueprintPath)
const sceneLayoutNodeId = 'wf-node-mqx7lh2w-piiwqp'

console.log('=== edgesById结构 ===')
console.log('edgesById类型:', typeof blueprint.edgesById)
const edgeIds = Object.keys(blueprint.edgesById || {})
console.log('edges数量:', edgeIds.length)

if (edgeIds.length > 0) {
  const firstEdgeId = edgeIds[0]
  console.log('\n第一条edge (id=', firstEdgeId, '):')
  console.log(JSON.stringify(blueprint.edgesById[firstEdgeId], null, 2))
}

console.log('\n=== 查找连接到场景布局节点的edges ===')
const connectedEdges = []
for (const [edgeId, edge] of Object.entries(blueprint.edgesById || {})) {
  const e = edge
  const targetNodeId = e.targetNodeId ?? e.toNodeId ?? e.destNodeId
  const sourceNodeId = e.sourceNodeId ?? e.fromNodeId ?? e.srcNodeId
  if (targetNodeId === sceneLayoutNodeId) {
    connectedEdges.push({ edgeId, ...e })
  }
}
console.log('连接到场景布局的edges数量:', connectedEdges.length)
for (const e of connectedEdges.slice(0, 10)) {
  console.log(`\nEdge ${e.edgeId}:`)
  console.log(`  targetAnchor: ${e.targetAnchorId ?? e.toAnchorId ?? e.destAnchorId}`)
  console.log(`  sourceNode: ${e.sourceNodeId ?? e.fromNodeId ?? e.srcNodeId}`)
  console.log(`  sourceAnchor: ${e.sourceAnchorId ?? e.fromAnchorId ?? e.srcAnchorId}`)
}

console.log('\n=== 检查in-model-umbrella-stand锚点是否有连接 ===')
const umbrellaEdge = connectedEdges.find(e => {
  const anchor = e.targetAnchorId ?? e.toAnchorId ?? e.destAnchorId
  return anchor === 'in-model-umbrella-stand'
})
console.log('umbrella-stand edge:', umbrellaEdge ? 'found' : 'NOT FOUND')

console.log('\n=== 列出所有in-model-*锚点的连接情况 ===')
const nodesById = blueprint.nodesById || {}
const slNode = nodesById[sceneLayoutNodeId]
const modelInputs = (slNode.inputs || []).filter(i => String(i.id || '').startsWith('in-model-'))
console.log(`共${modelInputs.length}个in-model-*锚点`)
for (const inp of modelInputs) {
  const anchorId = inp.id
  const objectId = anchorId.replace('in-model-', '')
  const edge = connectedEdges.find(e => {
    const anchor = e.targetAnchorId ?? e.toAnchorId ?? e.destAnchorId
    return anchor === anchorId
  })
  if (edge) {
    const srcId = edge.sourceNodeId ?? edge.fromNodeId ?? edge.srcNodeId
    const srcNode = nodesById[srcId]
    const srcType = srcNode?.type
    const m3dUrl = srcNode?.model3dSettings?.modelUrl || srcNode?.model3dSettings?.modelAssetUrl
    const hasMeshy = !!srcNode?.meshySettings
    console.log(`  ✓ ${objectId}: connected to ${srcId} (${srcType}), hasModelUrl=${!!m3dUrl}, hasMeshy=${hasMeshy}`)
  } else {
    console.log(`  ✗ ${objectId}: NO CONNECTION`)
  }
}
