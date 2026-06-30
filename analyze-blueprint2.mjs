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

console.log('=== 顶层结构 ===')
console.log('keys:', Object.keys(blueprint))
console.log('edges类型:', typeof blueprint.edges, Array.isArray(blueprint.edges) ? 'array' : '')
console.log('edges长度:', blueprint.edges?.length)

if (blueprint.edges?.length > 0) {
  console.log('\n=== 前3条edge结构 ===')
  for (let i = 0; i < Math.min(3, blueprint.edges.length); i++) {
    console.log(`Edge ${i}:`, JSON.stringify(blueprint.edges[i], null, 2))
  }
}

console.log('\n=== model3d节点统计 ===')
const nodesById = blueprint.nodesById || {}
const model3dNodes = []
const model3dWithUrl = []
const model3dOnlyMeshy = []
for (const [id, node] of Object.entries(nodesById)) {
  if (node.type === 'model3d') {
    model3dNodes.push(id)
    const m3dUrl = node.model3dSettings?.modelUrl || node.model3dSettings?.modelAssetUrl
    if (m3dUrl) {
      model3dWithUrl.push(id)
    } else if (node.meshySettings) {
      model3dOnlyMeshy.push(id)
    }
  }
}
console.log('model3d总数:', model3dNodes.length)
console.log('有modelUrl的:', model3dWithUrl.length)
console.log('只有meshySettings的:', model3dOnlyMeshy.length)

console.log('\n=== 查找包含场景布局节点ID的所有edges ===')
let foundEdges = 0
for (const edge of blueprint.edges || []) {
  const s = JSON.stringify(edge)
  if (s.includes(sceneLayoutNodeId)) {
    foundEdges++
    console.log('Edge:', JSON.stringify(edge))
  }
}
console.log('找到相关edges:', foundEdges)

console.log('\n=== 查看场景布局节点的inputs ===')
const slNode = nodesById[sceneLayoutNodeId]
if (slNode) {
  console.log('场景布局节点type:', slNode.type)
  console.log('inputs:')
  for (const inp of slNode.inputs || []) {
    console.log(`  ${inp.id}: ${inp.label} (${inp.mediaType})`)
  }
  console.log('outputs:')
  for (const out of slNode.outputs || []) {
    console.log(`  ${out.id}: ${out.label} (${out.mediaType})`)
  }
}
