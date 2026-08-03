/**
 * [3D模型节点诊断脚本] dump 场景分解节点下游链路中目标 3D 模型节点的完整字段，
 * 以及 resourcesById 中所有关联 Meshy/GLB 的资源。
 *
 * 使用: node scripts/utils/dump-blueprint-model3d-chain.mjs
 * 用法: 修改下方 PROJECT_ROOT 和 TARGET_IDS。
 */
import fs from 'node:fs'
import path from 'node:path'

const PROJECT_ROOT = 'G:\\DVSTestProject\\复赛视频项目'
const BLUEPRINT_PATH = path.join(PROJECT_ROOT, 'Blueprints', 'main.blueprint.json')

let blueprint = JSON.parse(fs.readFileSync(BLUEPRINT_PATH, 'utf-8'))
const { nodesById = {}, edgesById = {} } = blueprint

// 需要 dump 的节点 ID 列表，按需修改
const TARGET_IDS = [
  'node_1785687020687_euli2i',
  'node_1785699396436_irgzpo',
]

for (const ID of TARGET_IDS) {
  const node = nodesById[ID]
  if (!node) {
    console.log(`\n===== ID=${ID} 不存在 =====`)
    continue
  }
  console.log(`\n\n\n\n\n==================== NODE: ${ID} ====================`)
  console.log(`type:  ${node.type}`)
  console.log(`alias: ${node.alias || ''}`)
  console.log(`title: ${node.title || ''}`)
  console.log()

  function printObject(obj, depth = 0, prefix = '') {
    const indent = '  '.repeat(depth)
    const keys = Object.keys(obj || {}).sort()
    for (const k of keys) {
      const v = obj[k]
      const pathKey = prefix ? `${prefix}.${k}` : k
      if (v === null || v === undefined || v === '') continue
      if (typeof v === 'string') {
        const hasKeyword = /(task|model|asset|source|path|url|format|id|glb|gltf|meshy|local|relative|project|output|summary|thumbnail|preferred|effective)/i.test(k) || /(019fc|meshy|glb|gltf|Content|dweb|localAsset|taskId)/i.test(v)
        if (hasKeyword || v.length < 120) {
          console.log(`${indent}${k}: ${JSON.stringify(v.length > 300 ? v.slice(0,300)+'...' : v)}`)
        }
      } else if (typeof v === 'number' || typeof v === 'boolean') {
        console.log(`${indent}${k}: ${v}`)
      } else if (Array.isArray(v)) {
        if (v.length === 0) continue
        console.log(`${indent}${k}: Array(${v.length})`)
        const preview = v.slice(0, 3)
        for (let i = 0; i < preview.length; i++) {
          if (typeof preview[i] === 'object' && preview[i] !== null) {
            console.log(`${indent}  [${i}]: (object keys=${Object.keys(preview[i]).slice(0,10).join(',')})`)
            printObject(preview[i], depth + 2, `${pathKey}[${i}]`)
          } else {
            console.log(`${indent}  [${i}]: ${JSON.stringify(preview[i])}`)
          }
        }
        if (v.length > 3) console.log(`${indent}  ... (${v.length - 3} more)`)
      } else if (typeof v === 'object') {
        const subKeys = Object.keys(v)
        if (subKeys.length === 0) continue
        const hasUsefulKey = subKeys.some(sk => /(task|model|asset|source|path|url|format|id|glb|gltf|meshy|local|relative|project|output|summary|thumbnail|preferred|effective|taskId|Task|Output|Relation)/i.test(sk))
        const childHasUsefulValue = hasUsefulKey || Object.values(v).some(cv => {
          if (typeof cv === 'string') return /(019fc|meshy|glb|gltf|Content|dweb|localAsset|taskId|c79dbd7c)/i.test(cv)
          return false
        })
        if (hasUsefulKey || childHasUsefulValue) {
          console.log(`${indent}${k}: (object keys=${subKeys.slice(0,20).join(',')}${subKeys.length > 20 ? '...' : ''})`)
          printObject(v, depth + 1, pathKey)
        }
      }
    }
  }
  printObject(node, 0, 'node')
}

console.log(`\n\n\n\n\n==================== resourcesById 扫描 ====================`)
const resources = Object.values(nodesById.resourcesById || blueprint.resourcesById || {})
console.log(`resources 总数: ${resources.length}`)
for (const r of resources) {
  if (!r || typeof r !== 'object') continue
  const str = JSON.stringify(r)
  if (/(019fc|meshy.*glb|Content\/Media|tripo3d.*glb)/i.test(str)) {
    console.log(`\n--- resource id=${r.id || r.resourceId || '?'} name=${r.name || ''} ---`)
    for (const [k, v] of Object.entries(r)) {
      if (typeof v === 'string' && v.length < 500) {
        console.log(`  ${k}: ${JSON.stringify(v)}`)
      }
    }
  }
}
