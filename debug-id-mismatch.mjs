import fs from 'fs'
import path from 'path'

const jobDir = 'C:\\Unreal5_projects\\RoomTest2\\Saved\\DwebImports\\job_mr0xpgoq_2346320b'
const sceneExportPath = path.join(jobDir, 'scene_export.json')

function readJson(p) {
  let buf = fs.readFileSync(p)
  // BOM handling for UTF-8, UTF-16LE, UTF-16BE
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

const data = readJson(sceneExportPath)

console.log('=== 分析 modelBindings.objectId vs resolvedLayoutSlots.sourceObjectId ===\n')

const modelBindings = data.modelBindings || []
const resolvedSlots = data.resolvedLayoutSlots || []

console.log(`modelBindings 数量: ${modelBindings.length}`)
console.log(`resolvedLayoutSlots 数量: ${resolvedSlots.length}\n`)

const bindingIds = new Set()
for (const b of modelBindings) {
  const id = String(b.objectId || '').trim()
  if (id) {
    bindingIds.add(id)
    console.log(`  modelBinding.objectId: ${id} -> modelUrl: ${b.modelUrl || b.modelAssetUrl || 'N/A'}`)
  }
}

console.log('\n--- resolvedLayoutSlots 完整列表 ---')
const slotSourceIds = new Set()
const missingBindings = []
let slotCount = 0
for (const slot of resolvedSlots) {
  slotCount++
  const sourceId = String(slot.sourceObjectId || '').trim()
  const slotId = String(slot.slotId || '').trim()
  if (sourceId) {
    slotSourceIds.add(sourceId)
    const hasBinding = bindingIds.has(sourceId)
    console.log(`  [${slotCount}] slot.slotId: ${slotId}, sourceObjectId: ${sourceId} -> ${hasBinding ? '✓' : '✗'}`)
    if (!hasBinding) {
      missingBindings.push({ slotId, sourceObjectId: sourceId, displayName: slot.displayName })
    }
  } else {
    console.log(`  [${slotCount}] slot.slotId: ${slotId}, sourceObjectId: EMPTY!`)
  }
}

console.log(`\n=== 总结 ===`)
console.log(`modelBindings中唯一objectId数量: ${bindingIds.size}`)
console.log(`resolvedSlots中唯一sourceObjectId数量: ${slotSourceIds.size}`)
console.log(`缺少绑定的slot数量: ${missingBindings.length}`)

if (missingBindings.length > 0) {
  console.log('\n缺少绑定的slots:')
  for (const m of missingBindings) {
    console.log(`  - ${m.displayName} (sourceObjectId: ${m.sourceObjectId}, slotId: ${m.slotId})`)
  }
}

console.log('\n=== modelBindings 详细路径信息 ===')
for (const b of modelBindings) {
  const id = String(b.objectId || '').trim()
  console.log(`\n  [${id}]:`)
  console.log(`    sourceNodeId: ${b.sourceNodeId}`)
  console.log(`    sourceNodeType: ${b.sourceNodeType}`)
  console.log(`    modelUrl: ${b.modelUrl}`)
  console.log(`    modelAssetUrl: ${b.modelAssetUrl}`)
  console.log(`    modelAssetPath: ${b.modelAssetPath}`)
  console.log(`    modelSourcePath: ${b.modelSourcePath}`)
  console.log(`    modelFormat: ${b.modelFormat}`)
}

console.log('\n=== resolvedLayoutSlots 中内嵌的 modelBinding 路径 ===')
for (const slot of resolvedSlots) {
  const mb = slot.modelBinding
  const id = String(slot.sourceObjectId || '').trim()
  console.log(`\n  [${id}]:`)
  if (mb) {
    console.log(`    modelUrl: ${mb.modelUrl}`)
    console.log(`    modelAssetUrl: ${mb.modelAssetUrl}`)
    console.log(`    modelAssetPath: ${mb.modelAssetPath}`)
    console.log(`    modelSourcePath: ${mb.modelSourcePath}`)
  } else {
    console.log(`    (无内嵌modelBinding)`)
  }
}
