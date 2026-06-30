import fs from 'fs'
import path from 'path'

const jobDir = 'C:\\Unreal5_projects\\RoomTest2\\Saved\\DwebImports\\job_mr0xpgoq_2346320b'

function readJson(p) {
  let buf = fs.readFileSync(p)
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    buf = buf.slice(3)
  } else if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    buf = Buffer.from(buf.slice(2).toString('utf16le'), 'utf8')
  } else if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    let swapped = Buffer.alloc(buf.length - 2)
    for (let i = 2; i < buf.length; i += 2) {
      swapped[i - 2] = buf[i + 1]
      swapped[i - 1] = buf[i]
    }
    buf = Buffer.from(swapped.toString('utf16le'), 'utf8')
  }
  let text = buf.toString('utf8')
  while (text.charCodeAt(0) === 0xFEFF || text.charCodeAt(0) === 0xFFFE) {
    text = text.slice(1)
  }
  return JSON.parse(text)
}

const sceneExport = readJson(path.join(jobDir, 'scene_export.json'))
const assetPlan = readJson(path.join(jobDir, 'scene_asset_plan.json'))

console.log('=== 基本信息 ===')
console.log('sourceNodeId:', sceneExport.sourceNodeId)
console.log('assetPlan.pendingModelImportCount:', assetPlan.pendingModelImportCount)
console.log('resolvedLayoutSlots总数:', sceneExport.resolvedLayoutSlots?.length)

const slots = sceneExport.resolvedLayoutSlots || []
const slotsWithBinding = []
const modelUrlMap = new Map()
const sourceNodeMap = new Map()

for (const slot of slots) {
  const slotId = slot.slotId
  const binding = slot.modelBinding
  if (binding) {
    slotsWithBinding.push({
      slotId,
      sourceNodeId: binding.sourceNodeId,
      sourceNodeType: binding.sourceNodeType,
      modelUrl: binding.modelUrl,
      modelAssetPath: binding.modelAssetPath,
      modelFormat: binding.modelFormat
    })
    const url = binding.modelUrl || binding.modelAssetUrl
    if (url) {
      if (!modelUrlMap.has(url)) {
        modelUrlMap.set(url, [])
      }
      modelUrlMap.get(url).push(slotId)
    }
    const srcId = binding.sourceNodeId
    if (!sourceNodeMap.has(srcId)) {
      sourceNodeMap.set(srcId, [])
    }
    sourceNodeMap.get(srcId).push(slotId)
  }
}

console.log('\n=== 有modelBinding的slot数量:', slotsWithBinding.length)
console.log('=== 唯一modelUrl数量:', modelUrlMap.size)
console.log('=== 唯一sourceNodeId数量:', sourceNodeMap.size)

console.log('\n=== 所有slot及其绑定详情 ===')
for (const s of slotsWithBinding) {
  console.log(`  ${s.slotId}:`)
  console.log(`    sourceNode: ${s.sourceNodeId} (${s.sourceNodeType})`)
  console.log(`    modelUrl: ${s.modelUrl}`)
  console.log(`    modelAssetPath: ${s.modelAssetPath}`)
  console.log()
}

console.log('\n=== 模型复用情况（同一modelUrl被多个slot使用）===')
for (const [url, slotIds] of modelUrlMap.entries()) {
  if (slotIds.length > 1) {
    console.log(`  URL: ${url}`)
    console.log(`  被${slotIds.length}个slot使用: ${slotIds.join(', ')}`)
    console.log()
  }
}

console.log('\n=== sourceNode复用情况 ===')
for (const [nodeId, slotIds] of sourceNodeMap.entries()) {
  if (slotIds.length > 1) {
    console.log(`  sourceNode: ${nodeId}`)
    console.log(`  被${slotIds.length}个slot使用: ${slotIds.join(', ')}`)
    console.log()
  }
}

console.log('\n=== 没有modelBinding的slot ===')
for (const slot of slots) {
  if (!slot.modelBinding) {
    console.log(`  ${slot.slotId} (无modelBinding)`)
  }
}
