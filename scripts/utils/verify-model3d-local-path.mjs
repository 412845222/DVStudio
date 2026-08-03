/**
 * [3D模型节点诊断脚本] 直接验证：用蓝图项目 rootDir + resource 的 projectRelativePath 拼绝对路径，
 * 再转 file:///，检查文件是否真实存在。
 * 这就是 WorkflowModel3DNode.vue 中 forceResolvedLocalFileUrl -> effectiveModelUrl 做的事情。
 *
 * 使用:  node scripts/utils/verify-model3d-local-path.mjs
 * 用法: 修改下方 PROJECT_ROOT 为你的蓝图项目根目录即可。
 */
import fs from 'node:fs'
import path from 'node:path'

const PROJECT_ROOT = 'G:\\DVSTestProject\\复赛视频项目'
const BLUEPRINT_PATH = path.join(PROJECT_ROOT, 'Blueprints', 'main.blueprint.json')

console.log('============================================================')
console.log('[verify] 蓝图项目根目录:', PROJECT_ROOT)
console.log('[verify] 蓝图JSON路径:', BLUEPRINT_PATH)
console.log('[verify] 蓝图存在:', fs.existsSync(BLUEPRINT_PATH))
console.log('============================================================\n')

const blueprint = JSON.parse(fs.readFileSync(BLUEPRINT_PATH, 'utf-8'))
const { nodesById = {}, resourcesById = {} } = blueprint
const resMap = blueprint.resourcesById || {}

// Windows绝对路径转file:///
const winAbsToFileUrl = (abs) => {
  if (!abs) return ''
  const normalized = String(abs).replace(/\\/g, '/')
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return 'file:///' + normalized
  }
  if (normalized.startsWith('/')) return 'file://' + normalized
  return 'file:///' + normalized
}

// 扫描所有model3d节点
const model3dNodes = Object.values(nodesById).filter(n => n && n.type === 'model3d')
console.log(`[nodes] 找到 ${model3dNodes.length} 个 model3d 节点\n`)

for (const node of model3dNodes) {
  const nodeId = node.id
  const alias = node.alias || node.title || ''
  const resourceId = node.resourceId || ''
  const meshyTaskId = node.model3dSettings?.meshyModelSettings?.taskId
    || node.meshySettings?.meshyModelTaskId
    || node.meshySettings?.meshyTaskId
    || ''
  const tripoTaskId = node.model3dSettings?.tripo3dModelSettings?.taskId || ''

  console.log(`━━━━━━━━━━ 节点 ${nodeId}  (${alias})  ━━━━━━━━━━`)
  console.log(`  resourceId : ${resourceId || '(空)'}`)
  console.log(`  meshyTaskId: ${meshyTaskId || '(空)'}`)
  console.log(`  tripoTaskId: ${tripoTaskId || '(空)'}`)

  // 收集所有候选：resource.projectRelativePath / resource.sourcePath / taskId推导路径
  const candidates = []

  // 1. 来自resourcesById
  if (resourceId && resMap[resourceId]) {
    const res = resMap[resourceId]
    console.log(`\n  ✅ 找到资源映射: kind=${res.kind} name=${res.name || ''}`)
    if (res.projectRelativePath) {
      const abs = path.join(PROJECT_ROOT, res.projectRelativePath)
      candidates.push({
        src: `resourcesById[${resourceId}].projectRelativePath`,
        raw: res.projectRelativePath,
        abs,
        fileUrl: winAbsToFileUrl(abs)
      })
    }
    if (res.sourcePath) {
      candidates.push({
        src: `resourcesById[${resourceId}].sourcePath`,
        raw: res.sourcePath,
        abs: res.sourcePath,
        fileUrl: winAbsToFileUrl(res.sourcePath)
      })
    }
    if (res.url) {
      candidates.push({
        src: `resourcesById[${resourceId}].url (dweb)`,
        raw: res.url,
        abs: '',
        fileUrl: ''
      })
    }
  }

  // 2. settings里的modelProjectRelativePath / modelSourcePath / modelAssetPath
  const s = node.model3dSettings || {}
  ;[
    ['modelProjectRelativePath', 'settings.modelProjectRelativePath'],
    ['modelAssetProjectRelativePath', 'settings.modelAssetProjectRelativePath'],
    ['modelSourcePath', 'settings.modelSourcePath'],
    ['modelAssetPath', 'settings.modelAssetPath'],
    ['modelUrl', 'settings.modelUrl'],
    ['modelAssetUrl', 'settings.modelAssetUrl']
  ].forEach(([key, label]) => {
    if (s[key]) {
      const isRel = /Content[\\/]Media/i.test(String(s[key])) && !/^[a-zA-Z]:/.test(String(s[key]))
      const abs = isRel ? path.join(PROJECT_ROOT, String(s[key]).replace(/^[\\/]+/, '')) : String(s[key])
      candidates.push({
        src: label,
        raw: s[key],
        abs,
        fileUrl: /^dweb:|^https?:|^file:/.test(String(s[key]).toLowerCase()) ? '' : winAbsToFileUrl(abs)
      })
    }
  })

  // 3. taskId推导路径
  if (meshyTaskId) {
    const rel = `Content/Media/meshy-3d-${meshyTaskId}.glb`
    const abs = path.join(PROJECT_ROOT, rel)
    candidates.push({
      src: `meshyTaskId推导 (meshy-3d-${meshyTaskId}.glb)`,
      raw: rel,
      abs,
      fileUrl: winAbsToFileUrl(abs)
    })
    const rel2 = `Content/Media/meshy_${meshyTaskId}.glb`
    const abs2 = path.join(PROJECT_ROOT, rel2)
    candidates.push({
      src: `meshyTaskId推导2 (meshy_${meshyTaskId}.glb)`,
      raw: rel2,
      abs: abs2,
      fileUrl: winAbsToFileUrl(abs2)
    })
  }
  if (tripoTaskId) {
    const rel = `Content/Media/tripo3d-${tripoTaskId}.glb`
    const abs = path.join(PROJECT_ROOT, rel)
    candidates.push({
      src: `tripoTaskId推导 (tripo3d-${tripoTaskId}.glb)`,
      raw: rel,
      abs,
      fileUrl: winAbsToFileUrl(abs)
    })
    const rel2 = `Content/Media/tripo3d_${tripoTaskId}.glb`
    const abs2 = path.join(PROJECT_ROOT, rel2)
    candidates.push({
      src: `tripoTaskId推导2 (tripo3d_${tripoTaskId}.glb)`,
      raw: rel2,
      abs: abs2,
      fileUrl: winAbsToFileUrl(abs2)
    })
  }

  // 4. 也看看节点外层props(resourceUrl / resourceSourcePath可能通过父组件注入)
  if (node.resourceUrl) {
    candidates.push({src: 'node.resourceUrl', raw: node.resourceUrl, abs: '', fileUrl: ''})
  }
  if (node.resourceSourcePath) {
    candidates.push({
      src: 'node.resourceSourcePath',
      raw: node.resourceSourcePath,
      abs: node.resourceSourcePath,
      fileUrl: winAbsToFileUrl(node.resourceSourcePath)
    })
  }
  if (node.resourceProjectRelativePath) {
    const abs = path.join(PROJECT_ROOT, node.resourceProjectRelativePath)
    candidates.push({
      src: 'node.resourceProjectRelativePath',
      raw: node.resourceProjectRelativePath,
      abs,
      fileUrl: winAbsToFileUrl(abs)
    })
  }

  // 验证每个候选的存在性
  console.log(`\n  候选路径 (共${candidates.length}个):`)
  let hit = null
  for (const c of candidates) {
    const exists = c.abs && fs.existsSync(c.abs)
    const extOk = c.abs ? /\.(glb|gltf|fbx|obj|stl|usdz)$/i.test(c.abs) : /\.(glb|gltf|fbx|obj|stl|usdz)/i.test(c.raw)
    const mark = (exists && extOk) ? '✅✅✅ 命中' : (exists ? '⚠️  文件存在但后缀不对' : '❌ 不存在')
    if (exists && extOk && !hit) hit = c
    console.log(`    ${mark}`)
    console.log(`      来源 : ${c.src}`)
    console.log(`      raw  : ${c.raw.length > 120 ? c.raw.slice(0,120)+'...' : c.raw}`)
    if (c.abs) console.log(`      abs  : ${c.abs}`)
    if (c.fileUrl) console.log(`      file : ${c.fileUrl}`)
    if (c.abs) {
      try {
        const sz = fs.statSync(c.abs).size
        console.log(`      size : ${(sz/1024/1024).toFixed(2)} MB`)
      } catch {}
    }
  }

  if (hit) {
    console.log(`\n  🎯 推荐直接使用 (file:///):`)
    console.log(`     ${hit.fileUrl}`)
    console.log(`     来源: ${hit.src}`)
  } else {
    console.log(`\n  ❌ 没有找到任何存在的本地GLB文件！`)
  }
  console.log()
}

// 最后直接列出Content/Media下所有的glb
const mediaDir = path.join(PROJECT_ROOT, 'Content', 'Media')
console.log('============================================================')
console.log(`[disk] ${mediaDir} 下的所有 glb:`)
if (fs.existsSync(mediaDir)) {
  const glbs = fs.readdirSync(mediaDir).filter(f => /\.glb$/i.test(f))
  for (const f of glbs) {
    const abs = path.join(mediaDir, f)
    const sz = (fs.statSync(abs).size / 1024 / 1024).toFixed(2)
    console.log(`  ${f}  (${sz} MB)  ->  ${winAbsToFileUrl(abs)}`)
  }
  console.log(`\n  共 ${glbs.length} 个 GLB 文件`)
} else {
  console.log('  目录不存在')
}
console.log('\n[verify] 完成 ✅')
