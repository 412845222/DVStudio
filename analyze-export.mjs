import fs from 'fs'

const sceneExportPath = 'C:/Unreal5_projects/RoomTest2/Saved/DwebImports/job_mr0xpgoq_2346320b/scene_export.json'
const blueprintPath = 'G:/DVSTestProject/展示示例/Blueprints/main.blueprint.json'

function readJson(path) {
  const buf = fs.readFileSync(path)
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return JSON.parse(buf.slice(3).toString('utf8'))
  }
  if (buf[0] === 0xFF && buf[1] === 0xFE) {
    return JSON.parse(buf.slice(2).toString('utf16le'))
  }
  if (buf[0] === 0xFE && buf[1] === 0xFF) {
    return JSON.parse(buf.slice(2).swap16().toString('utf16le'))
  }
  return JSON.parse(buf.toString('utf8'))
}

const sceneExport = readJson(sceneExportPath)
const blueprint = readJson(blueprintPath)

console.log('=== 导出的场景数据 ===')
console.log('sourceNodeId:', sceneExport.sourceNodeId)
console.log('resolvedLayoutSlots数量:', sceneExport.resolvedLayoutSlots?.length)

const slotsWithBinding = sceneExport.resolvedLayoutSlots?.filter(s => s.modelBinding) || []
console.log('有modelBinding的slot数量:', slotsWithBinding.length)

console.log('\n=== 所有slot的modelBinding情况 ===')
const bindingSourceNodeIds = new Set()
for (const slot of sceneExport.resolvedLayoutSlots || []) {
  const slotId = slot.slotId
  const hasBinding = !!slot.modelBinding
  const sourceNodeId = slot.modelBinding?.sourceNodeId
  const sourceNodeType = slot.modelBinding?.sourceNodeType
  if (sourceNodeId) bindingSourceNodeIds.add(sourceNodeId)
  console.log(`  ${slotId}: hasBinding=${hasBinding}, sourceType=${sourceNodeType}, sourceNode=${sourceNodeId || '(none)'}`)
}

console.log('\n=== 蓝图节点分析 ===')
const nodesById = blueprint.nodesById || {}
const edges = blueprint.edges || []

const sceneLayoutNodeId = sceneExport.sourceNodeId
const sceneLayoutNode = nodesById[sceneLayoutNodeId]
console.log('场景布局节点:', sceneLayoutNode?.id, sceneLayoutNode?.title)

const connectedModelNodes = new Map()
for (const edge of edges) {
  const targetNodeId = edge.targetNodeId
  const sourceNodeId = edge.sourceNodeId
  if (targetNodeId === sceneLayoutNodeId) {
    const sourceNode = nodesById[sourceNodeId]
    if (sourceNode) {
      if (!connectedModelNodes.has(sourceNodeId)) {
        connectedModelNodes.set(sourceNodeId, {
          id: sourceNodeId,
          type: sourceNode.type,
          title: sourceNode.title,
          edges: []
        })
      }
      connectedModelNodes.get(sourceNodeId).edges.push({
        outputAnchor: edge.sourceAnchorId,
        inputAnchor: edge.targetAnchorId
      })
    }
  }
}

console.log('\n连接到场景布局的节点数量:', connectedModelNodes.size)
console.log('连接的节点详情:')
for (const [id, node] of connectedModelNodes) {
  const hasModel3dSettings = !!node.model3dSettings
  const hasMeshySettings = !!node.meshySettings
  console.log(`  ${id}: type=${node.type}, title=${node.title}`)
  console.log(`    edges:`, node.edges.map(e => `${e.outputAnchor}->${e.inputAnchor}`).join(', '))
  console.log(`    hasModel3dSettings=${hasModel3dSettings}, hasMeshySettings=${hasMeshySettings}`)
  
  if (hasModel3dSettings) {
    const m3d = node.model3dSettings
    const modelUrl = m3d.modelUrl || m3d.modelAssetUrl || ''
    console.log(`    model3d modelUrl: ${modelUrl || '(empty)'}`)
  }
  if (hasMeshySettings) {
    const meshy = node.meshySettings
    const keys = Object.keys(meshy)
    console.log(`    meshy keys:`, keys.join(', '))
  }
}

console.log('\n=== 对比 ===')
console.log('导出绑定的源节点数量:', bindingSourceNodeIds.size)
console.log('蓝图连接的节点数量:', connectedModelNodes.size)

const missingFromExport = []
for (const [id] of connectedModelNodes) {
  if (!bindingSourceNodeIds.has(id)) {
    missingFromExport.push(id)
  }
}
console.log('在蓝图中连接但导出时缺失的节点:', missingFromExport.length > 0 ? missingFromExport : '(none)')

if (missingFromExport.length > 0) {
  console.log('\n缺失节点详情:')
  for (const id of missingFromExport) {
    const node = connectedModelNodes.get(id)
    console.log(`  ${id}:`, JSON.stringify(node, null, 2).substring(0, 500))
  }
}
