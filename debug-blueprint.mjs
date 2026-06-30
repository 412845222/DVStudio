import fs from 'fs'

const blueprintPath = 'G:/DVSTestProject/展示示例/Blueprints/main.blueprint.json'
const data = JSON.parse(fs.readFileSync(blueprintPath, 'utf-8'))

const nodesById = data.nodesById || {}
const edgesById = data.edgesById || {}
const edges = Object.values(edgesById)

const targetSceneLayoutId = 'wf-node-mqx7lh2w-piiwqp'
const incoming = edges.filter(e => e.toNodeId === targetSceneLayoutId)
const modelConnections = incoming.filter(e => e.toAnchorId?.startsWith('in-model-'))

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : ''
}
function isRecord(v) {
  return v && typeof v === 'object' && !Array.isArray(v)
}
function pickMeshyPreferredModelUrl(urls) {
  const record = isRecord(urls) ? urls : {}
  const keys = ['glb', 'pre_remeshed_glb', 'fbx', 'obj', 'stl', 'usdz']
  for (const key of keys) {
    const url = normalizeText(record[key])
    if (url) return url
  }
  return ''
}
function getMeshyEffectiveModelSource(settings) {
  const value = isRecord(settings) ? settings : {}
  const relationSummary = isRecord(value.meshyRelationSummary) ? value.meshyRelationSummary : {}
  const outputSummary = isRecord(value.meshyOutputSummary) ? value.meshyOutputSummary : {}
  const modelUrls = isRecord(value.meshyModelUrls) ? value.meshyModelUrls : {}
  const assetUrl = normalizeText(
    relationSummary.effectiveLocalAssetUrl ?? value.meshyOutputAssetUrl ?? outputSummary.assetUrl
  )
  const assetPath = normalizeText(
    relationSummary.effectiveLocalPath ?? value.meshyOutputAssetPath ?? outputSummary.assetPath
  )
  const preferredUrl =
    normalizeText(relationSummary.effectivePreferredModelUrl ?? outputSummary.preferredUrl) ||
    assetUrl ||
    pickMeshyPreferredModelUrl(modelUrls)
  return { preferredUrl, assetUrl, assetPath, modelUrls, outputSummary, relationSummary }
}

// 打印第一个空节点的meshySettings中所有URL相关字段
console.log('=== 第一个空model3d节点的meshySettings详细信息 ===\n')
for (const edge of modelConnections) {
  const fromNode = nodesById[edge.fromNodeId]
  if (!fromNode || fromNode.type !== 'model3d') continue
  const m3d = fromNode.model3dSettings || {}
  if (m3d.modelUrl || m3d.modelAssetUrl) continue
  
  console.log(`节点: ${fromNode.alias}`)
  const ms = fromNode.meshySettings
  if (ms) {
    const eff = getMeshyEffectiveModelSource(ms)
    console.log('preferredUrl:', eff.preferredUrl)
    console.log('assetUrl:', eff.assetUrl)
    console.log('assetPath:', eff.assetPath)
    console.log('meshyOutputAssetUrl:', ms.meshyOutputAssetUrl)
    console.log('meshyOutputAssetPath:', ms.meshyOutputAssetPath)
    console.log('outputSummary:', JSON.stringify(eff.outputSummary, null, 2))
    console.log('relationSummary:', JSON.stringify(eff.relationSummary, null, 2))
    console.log('meshyModelUrls keys:', eff.modelUrls ? Object.keys(eff.modelUrls) : 'none')
    if (eff.modelUrls) {
      for (const [k, v] of Object.entries(eff.modelUrls)) {
        console.log(`  modelUrls.${k}:`, typeof v === 'string' ? v.slice(0, 200) : v)
      }
    }
    // 检查所有包含url/path的字段
    console.log('\n所有包含"Url"或"Path"的字段:')
    function searchUrls(obj, prefix = '') {
      for (const [k, v] of Object.entries(obj || {})) {
        const key = prefix ? `${prefix}.${k}` : k
        if (/url|path/i.test(k) && typeof v === 'string') {
          console.log(`  ${key}:`, v.slice(0, 200))
        } else if (v && typeof v === 'object' && !Array.isArray(v)) {
          searchUrls(v, key)
        }
      }
    }
    searchUrls(ms)
  }
  break
}
