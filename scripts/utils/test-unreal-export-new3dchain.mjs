#!/usr/bin/env node
/**
 * scripts/utils/test-unreal-export-new3dchain.mjs
 * ---------------------------------------------------------
 * Unreal 导出节点 —— 新 3D 资产链路独立测试
 *
 * 目标：在不启动 Electron / 不连接 UE 的前提下，用"干净的链路"验证
 *       从 sceneLayoutResolvedModelBindings → viewer rawSlots →
 *       prepareResolvedSlotsForExport → mergeViewerResolvedIntoFinalBindings
 *       → 最终 payload.modelBindings，一路能得到"正确数量（4 个）模型 +
 *       贴图路径完整透传（不丢 textureRefs / modelAssetProjectRelativePath）"。
 *
 * 运行：
 *   node scripts/utils/test-unreal-export-new3dchain.mjs
 *     - 退出码 0 = 全部通过；1 = 任一 Case 失败
 *   node scripts/utils/test-unreal-export-new3dchain.mjs --emit-browser-harness > _h.html
 *     - 生成一个可在浏览器 DevTools Console 粘贴运行的 html 文件（可选）
 *
 * 注：为了让测试能独立运行（不依赖 tsc / esbuild / vite 运行时），本脚本
 *     在文件顶部内联了一份 "期望行为版本" 的关键函数实现（与 TS 源文件实现
 *     语义 1:1）。当 TS 代码修改后，两边行为应该保持一致。
 */

// ============================================================================
// 【内联：期望行为版】prepareResolvedSlotsForExport
//   —— 此版本实现了方案 §四 模块 1 提出的修复：
//      1) fallbackBinding 全量 spread，不做 8 字段白名单裁剪
//      2) bindingByObjectId 允许 objectId + sourceNodeId 复合，但优先 objectId
//      3) 警告里补全诊断信息
// ============================================================================
const identityTransform = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { yaw: 0, pitch: 0, roll: 0 },
  quaternion: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 }
}
function hasValidModelPath(b) {
  return !!(
    String(b?.modelUrl ?? '').trim() ||
    String(b?.modelAssetUrl ?? '').trim() ||
    String(b?.modelSourcePath ?? '').trim() ||
    String(b?.modelAssetPath ?? '').trim()
  )
}
function isValidTransform(t) {
  if (!t || typeof t !== 'object') return false
  return !!(t.position && t.rotation && t.scale)
}
function normalizeTransform(t) {
  if (!isValidTransform(t)) return { ...identityTransform }
  const pos = t.position || {}
  const rot = t.rotation || {}
  const scl = t.scale || {}
  const q = t.quaternion || undefined
  return {
    position: { x: Number(pos.x ?? 0) || 0, y: Number(pos.y ?? 0) || 0, z: Number(pos.z ?? 0) || 0 },
    rotation: { yaw: Number(rot.yaw ?? 0) || 0, pitch: Number(rot.pitch ?? 0) || 0, roll: Number(rot.roll ?? 0) || 0 },
    quaternion: q
      ? { x: Number(q.x ?? 0) || 0, y: Number(q.y ?? 0) || 0, z: Number(q.z ?? 0) || 0, w: Number(q.w ?? 1) || 1 }
      : { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: Number(scl.x ?? 1) || 1, y: Number(scl.y ?? 1) || 1, z: Number(scl.z ?? 1) || 1 }
  }
}
function normalizeResolvedLayoutSlots(slots) {
  if (!Array.isArray(slots)) return { slots: [], bySlotId: new Map(), bySourceObjectId: new Map() }
  const valid = slots
    .filter((s) => s && typeof s === 'object' && String(s.slotId ?? '').trim() && String(s.sourceObjectId ?? '').trim())
    .map((s) => ({ ...s }))
  const bySlotId = new Map()
  const bySourceObjectId = new Map()
  for (const s of valid) {
    const slotId = String(s.slotId ?? '').trim()
    const src = String(s.sourceObjectId ?? '').trim()
    if (slotId) bySlotId.set(slotId, s)
    if (src && !bySourceObjectId.has(src) && !s.isClone) bySourceObjectId.set(src, s)
  }
  return { slots: valid, bySlotId, bySourceObjectId }
}

// ===== 【期望行为】修复版。真实 TS 代码修完后应该与本函数一致。 =====
function prepareResolvedSlotsForExport_EXPECTED(rawSlots, connectedModelBindings, layoutItems) {
  const warnings = []
  const { slots: resolvedSlots } = normalizeResolvedLayoutSlots(rawSlots)
  const bindingByObjectId = new Map()
  const safeBindings = Array.isArray(connectedModelBindings) ? connectedModelBindings : []
  for (const binding of safeBindings) {
    if (!binding || typeof binding !== 'object') continue
    const objectId = String(binding.objectId ?? '').trim()
    if (objectId && hasValidModelPath(binding)) {
      bindingByObjectId.set(objectId, binding)
    }
  }
  const itemMap = new Map()
  for (const item of Array.isArray(layoutItems) ? layoutItems : []) {
    if (item && typeof item === 'object') {
      const id = String(item.id ?? '').trim()
      if (id) itemMap.set(id, item)
    }
  }
  const finalSlots = []
  const processedObjectIds = new Set()
  for (const slot of resolvedSlots) {
    const slotId = String(slot.slotId ?? '').trim()
    const sourceObjectId = String(slot.sourceObjectId ?? '').trim()
    if (!slotId || !sourceObjectId) continue
    processedObjectIds.add(sourceObjectId)
    const finalSlot = { ...slot }
    if (!String(finalSlot.objectName ?? '').trim()) {
      const layoutItem = itemMap.get(sourceObjectId)
      const binding = bindingByObjectId.get(sourceObjectId)
      finalSlot.objectName = String(layoutItem?.name ?? binding?.objectName ?? sourceObjectId).trim() || sourceObjectId
    }
    if (!String(finalSlot.displayName ?? '').trim()) {
      const isClone = !!finalSlot.isClone
      const cloneIndex = Number(finalSlot.cloneIndex ?? 0)
      const cloneCount = Number(finalSlot.cloneCount ?? 1)
      finalSlot.displayName = isClone && cloneCount > 1 ? `${finalSlot.objectName} [${cloneIndex + 1}/${cloneCount}]` : finalSlot.objectName
    }
    let modelBinding = finalSlot.modelBinding
    const bindingHasValidPath = !!(modelBinding && typeof modelBinding === 'object' && hasValidModelPath(modelBinding))
    const TEXTURE_INTEGRITY_KEYS = [
      'modelAssetProjectRelativePath',
      'modelProjectRelativePath',
      'textureRefs',
      'modelMaterialOverrides',
      'modelFormat'
    ]
    const existingTextureKeysCount = TEXTURE_INTEGRITY_KEYS.filter((k) => {
      if (!modelBinding || typeof modelBinding !== 'object') return false
      const v = modelBinding[k]
      return Array.isArray(v) ? v.length > 0 : String(v ?? '').trim() !== ''
    }).length
    const bindingLacksTextureIntegrity = bindingHasValidPath && existingTextureKeysCount < 3
    const fallbackBinding = bindingByObjectId.get(sourceObjectId)
    if (!bindingHasValidPath || bindingLacksTextureIntegrity) {
      if (fallbackBinding) {
        // ★★ 修复点 1：全量 spread，不做 8 字段白名单；同时当 viewer 只给了 8 字段时，
        //    会因为 lacksTextureIntegrity 为 true 而强制走 fallback，用 resolved 的全量 binding
        //    覆盖它，把贴图/relPath/材质覆盖补回来。
        const copied = { ...fallbackBinding }
        if (!String(copied.sourceNodeType ?? '').trim()) {
          copied.sourceNodeType = 'model3d'
        }
        modelBinding = copied
        finalSlot.modelBinding = modelBinding
      } else if (!warnings.some((w) => String(w).includes(sourceObjectId))) {
        warnings.push(
          `Slot "${slotId}" (sourceObjectId=${sourceObjectId}) has no slot.modelBinding AND no fallback in connectedModelBindings; known keys: ${[...bindingByObjectId.keys()].join(',') || '<empty>'}; lacksTextureIntegrity=${String(bindingLacksTextureIntegrity)}`
        )
      }
    }
    const relativeTransform = normalizeTransform(finalSlot.relativeTransform ?? finalSlot.previewInstanceTransform)
    const previewInstanceTransform = normalizeTransform(finalSlot.previewInstanceTransform ?? relativeTransform)
    const worldTransform = normalizeTransform(finalSlot.worldTransform ?? finalSlot.previewInstanceWorldTransform ?? relativeTransform)
    const slotTransform = normalizeTransform(finalSlot.slotTransform ?? relativeTransform)
    const meshTransform = normalizeTransform(finalSlot.meshTransform ?? worldTransform)
    const placeholderTransform = finalSlot.placeholderTransform ? normalizeTransform(finalSlot.placeholderTransform) : null
    finalSlot.relativeTransform = relativeTransform
    finalSlot.previewInstanceTransform = previewInstanceTransform
    finalSlot.worldTransform = worldTransform
    finalSlot.slotTransform = slotTransform
    finalSlot.meshTransform = meshTransform
    finalSlot.placeholderTransform = placeholderTransform
    finalSlot.previewInstanceWorldTransform = normalizeTransform(finalSlot.previewInstanceWorldTransform ?? worldTransform)
    if (finalSlot.parentReference && typeof finalSlot.parentReference === 'object') {
      const pr = finalSlot.parentReference
      if (pr.relativeTransform) pr.relativeTransform = normalizeTransform(pr.relativeTransform)
    }
    finalSlot.generatedFromBinding = false
    finalSlots.push(finalSlot)
  }
  for (const [objectId, binding] of bindingByObjectId.entries()) {
    if (!processedObjectIds.has(objectId)) {
      const layoutItem = itemMap.get(objectId)
      const name = String(binding?.objectName ?? layoutItem?.name ?? objectId).trim() || objectId
      warnings.push(`Model "${name}" (objectId=${objectId}) has binding but was not found in 3D preview; it will not be exported`)
    }
  }
  finalSlots.sort((a, b) => String(a.slotId ?? '').localeCompare(String(b.slotId ?? '')))
  // —— 2026-08-03: 对齐 TS 代码 #5d 最后一道出口过滤 + #5e UE 路径字段对齐 ——
  //   #5d: 只有 6 路径字段任一非空的 slot 才算 validSlots（剔除 ceiling/floor/wall 房间壳子）
  //   #5e: 只要 modelAssetProjectRelativePath 有值就回填到 modelAssetPath/modelSourcePath，
  //        且 modelUrl 为 dweb:// 时替换为相对路径（UE C++ 侧不认识 dweb 协议）
  const slotsBeforeFilter = finalSlots.length
  const validSlots = []
  const skippedSlotIds = []
  for (const s of finalSlots) {
    const mb = (s && typeof s.modelBinding === 'object') ? s.modelBinding : null
    const hasPath = !!(
      mb &&
      (
        String(mb.modelAssetProjectRelativePath ?? '').trim() ||
        String(mb.modelAssetUrl ?? '').trim() ||
        String(mb.modelAssetPath ?? '').trim() ||
        String(mb.modelSourcePath ?? '').trim() ||
        String(mb.modelProjectRelativePath ?? '').trim() ||
        String(mb.modelUrl ?? '').trim()
      )
    )
    if (hasPath) validSlots.push(s)
    else skippedSlotIds.push(String(s.slotId ?? s.sourceObjectId ?? ''))
  }
  if (validSlots.length !== slotsBeforeFilter) {
    warnings.push(
      `Last-mile path-filter: dropped ${slotsBeforeFilter - validSlots.length} slots with no asset path. droppedSlotIds=[${skippedSlotIds.join(',')}]. validSlots=${validSlots.length}`
    )
  }
  // #5e: UE 路径字段对齐（modelAssetProjectRelativePath → modelAssetPath/modelSourcePath）
  const alignedSlotIds = []
  let alignedDwebCount = 0
  for (const s of validSlots) {
    const mb = (s && typeof s.modelBinding === 'object') ? s.modelBinding : null
    if (!mb) continue
    const relPath = String(mb.modelAssetProjectRelativePath ?? '').trim()
    let touched = false
    if (relPath) {
      if (!String(mb.modelAssetPath ?? '').trim()) { mb.modelAssetPath = relPath; touched = true }
      if (!String(mb.modelSourcePath ?? '').trim()) { mb.modelSourcePath = relPath; touched = true }
    }
    const mUrl = String(mb.modelUrl ?? '').trim()
    if (mUrl && mUrl.startsWith('dweb://') && relPath) {
      mb.modelUrl = relPath
      touched = true
      alignedDwebCount += 1
    }
    if (touched) alignedSlotIds.push(String(s.slotId ?? s.sourceObjectId ?? ''))
  }
  if (alignedSlotIds.length > 0) {
    warnings.push(
      `UE-path-alignment: backfilled for ${alignedSlotIds.length} slots (from modelAssetProjectRelativePath; dweb=${alignedDwebCount}). ids=[${alignedSlotIds.join(',')}]`
    )
  }
  return { slots: validSlots, warnings }
}

// ============================================================================
// 【内联：期望行为版】mergeViewerResolvedIntoFinalBindings + finalConnected 过滤
// ============================================================================
function isConnectedTruthy(obj) {
  return !!(
    obj?.connected === true ||
    obj?.connected === 1 ||
    String(obj?.connected ?? '').toLowerCase() === 'true'
  )
}
function hasAnyPathExtended(obj) {
  return !!(
    String(obj?.modelAssetUrl ?? '').trim() ||
    String(obj?.modelAssetPath ?? '').trim() ||
    String(obj?.modelSourcePath ?? '').trim() ||
    String(obj?.modelUrl ?? '').trim() ||
    String(obj?.modelAssetProjectRelativePath ?? '').trim() ||
    String(obj?.modelProjectRelativePath ?? '').trim()
  )
}
// 与 TS 端 hasAnyPathExtended 同义（别名方便 Case G 里阅读）
const hasAnyPathExtended_EXPECTED = hasAnyPathExtended
// 与 TS 端 detectModelFormatFromPath 同款简化版
const SUPPORTED_MODEL_EXT_FOR_TEST = ['glb', 'gltf', 'fbx', 'obj', 'stl', 'usdz']
function detectModelFormatFromPath(raw) {
  const p = String(raw ?? '').trim().toLowerCase()
  if (!p) return ''
  // 去掉查询串
  const clean = p.split('?')[0].split('#')[0]
  const m = /\.([a-z0-9]+)$/.exec(clean)
  const ext = m ? m[1] : ''
  return SUPPORTED_MODEL_EXT_FOR_TEST.includes(ext) ? ext : ''
}
// 与 TS 端 pickBestModelUrlFromCandidates 同款简化版（足够 Case G 使用）
function pickBestModelUrlFromCandidates(rawList) {
  const valid = []
  for (const raw of rawList) {
    const u = String(raw ?? '').trim()
    if (!u) continue
    // 去掉明显的远端 CDN
    if (/assets\.meshy\.ai/i.test(u) || /assets\.tripo3d\.ai/i.test(u)) continue
    const fmt = detectModelFormatFromPath(u)
    const looksLikeHttp = /^https?:\/\//i.test(u)
    const looksLikeLocal = /[a-zA-Z]:[\\/]/.test(u) || u.startsWith('/') || u.startsWith('Content/') || u.startsWith('Content\\') || u.startsWith('dweb://') || u.startsWith('file://')
    // 如果没有明确的 3D 模型扩展名，但是像 Content/Media/xxx 路径，按 .glb 扩展名的候选处理
    // 但这里为了简化：只要 format 检测通过 或 看起来像本地路径，就加入 valid（前者优先）
    let score = 0
    if (fmt) score += 10
    if (looksLikeLocal) score += 5
    if (!looksLikeHttp) score += 3
    if (score > 0) valid.push({ url: u, score, fmt })
  }
  if (valid.length === 0) return ''
  valid.sort((a, b) => b.score - a.score)
  return valid[0].url
}
// 与 TS 端 tryBackfillBindingPathsFromStore 同款简化版（足够 Case G 验证 Ultimate Backfill 逻辑）
function tryBackfillBindingPathsFromStore_EXPECTED(binding, nodesById, resourcesById) {
  if (!binding || typeof binding !== 'object') return binding ?? {}
  if (hasAnyPathExtended(binding)) return binding
  const b = { ...binding }
  const sourceNodeId = String(b.sourceNodeId ?? '').trim()
  const modelResourceId = String(b.modelResourceId ?? b.resourceId ?? '').trim()
  const nodesMap = nodesById && typeof nodesById === 'object' ? nodesById : {}
  const resourcesMap = resourcesById && typeof resourcesById === 'object' ? resourcesById : {}
  const candidates = []
  let fallbackFormat = 'glb'
  if (sourceNodeId && nodesMap[sourceNodeId]) {
    const fn = nodesMap[sourceNodeId]
    if (Array.isArray(fn.outputs)) {
      for (const out of fn.outputs) {
        if (!out || typeof out !== 'object') continue
        for (const src of [out.resolved, out.cached, out.value]) {
          if (!src) continue
          if (typeof src === 'string') {
            candidates.push(src)
          } else if (typeof src === 'object') {
            const s = src
            candidates.push(String(s.modelAssetProjectRelativePath ?? s.modelProjectRelativePath ?? '').trim() || null)
            candidates.push(String(s.modelAssetPath ?? s.modelSourcePath ?? '').trim() || null)
            candidates.push(String(s.modelAssetUrl ?? s.modelUrl ?? '').trim() || null)
            candidates.push(String(s.projectRelativePath ?? s.absolutePath ?? s.sourcePath ?? '').trim() || null)
            candidates.push(String(s.assetUrl ?? s.preferredUrl ?? s.url ?? '').trim() || null)
            const f = detectModelFormatFromPath(String(s.modelAssetProjectRelativePath ?? s.modelAssetUrl ?? s.url ?? ''))
            if (f) fallbackFormat = f
          }
        }
      }
    }
    const topKeys = ['modelAssetProjectRelativePath', 'modelProjectRelativePath', 'modelAssetUrl', 'modelUrl', 'modelAssetPath', 'modelSourcePath', 'resolvedModelPath', 'localAssetUrl', 'localAssetPath']
    for (const k of topKeys) {
      const v = String(fn[k] ?? '').trim()
      if (v) candidates.push(v)
      const f = detectModelFormatFromPath(v)
      if (f) fallbackFormat = f
    }
    const fnResId = String(fn.resourceId ?? fn.model3dSettings?.resourceId ?? '').trim()
    if (fnResId && resourcesMap[fnResId]) {
      const r = resourcesMap[fnResId]
      candidates.push(String(r.projectRelativePath ?? '').trim() || null)
      candidates.push(String(r.absolutePath ?? '').trim() || null)
      candidates.push(String(r.sourcePath ?? '').trim() || null)
      candidates.push(String(r.url ?? '').trim() || null)
      const f = detectModelFormatFromPath(String(r.projectRelativePath ?? r.url ?? r.absolutePath ?? ''))
      if (f) fallbackFormat = f
    }
  }
  if (modelResourceId && resourcesMap[modelResourceId]) {
    const r = resourcesMap[modelResourceId]
    candidates.push(String(r.projectRelativePath ?? '').trim() || null)
    candidates.push(String(r.absolutePath ?? '').trim() || null)
    candidates.push(String(r.sourcePath ?? '').trim() || null)
    candidates.push(String(r.url ?? '').trim() || null)
    const f = detectModelFormatFromPath(String(r.projectRelativePath ?? r.url ?? r.absolutePath ?? ''))
    if (f) fallbackFormat = f
  }
  const best = pickBestModelUrlFromCandidates(candidates)
  if (!best) return b
  const overrideFormat = detectModelFormatFromPath(best) || fallbackFormat
  // 解析 relPath
  let relPath = best
  const m1 = /\?(?:.*&)?(?:path|relativePath|assetPath|filePath)=([^&]+)/.exec(best)
  if (m1 && m1[1]) {
    try { relPath = decodeURIComponent(m1[1]).split('?')[0].split('#')[0] } catch { /* ignore */ }
  } else if (/^Content[\\/]/i.test(best)) {
    relPath = best.replace(/\\/g, '/')
  } else {
    const m2 = /^file:\/\/\/+([a-zA-Z]:[\\/].+)$/.exec(best)
    if (m2 && m2[1]) relPath = m2[1].replace(/\\/g, '/')
    else relPath = best.replace(/\\/g, '/')
  }
  const isRel = /^Content[\\/]/i.test(relPath)
  b.modelUrl = best
  b.modelAssetUrl = best
  if (!isRel) {
    if (!String(b.modelSourcePath ?? '').trim()) b.modelSourcePath = relPath
    if (!String(b.modelAssetPath ?? '').trim()) b.modelAssetPath = relPath
  } else {
    if (!String(b.modelProjectRelativePath ?? '').trim()) b.modelProjectRelativePath = relPath
    if (!String(b.modelAssetProjectRelativePath ?? '').trim()) b.modelAssetProjectRelativePath = relPath
  }
  if (!String(b.modelFormat ?? '').trim()) b.modelFormat = overrideFormat
  b.connected = true
  return b
}
function mergeViewerResolvedIntoFinalBindings_EXPECTED(exportData, precheckBindings, strict = true) {
  const resolvedArr = Array.isArray(exportData?.sceneLayoutResolvedModelBindings) ? exportData.sceneLayoutResolvedModelBindings : null
  const used = !!(strict && resolvedArr && resolvedArr.length > 0)
  const finalBindingsSource = used ? resolvedArr : (Array.isArray(precheckBindings) ? precheckBindings : [])
  return { finalBindingsSource, usedViewerResolvedBindings: used }
}
function buildFinalConnectedModelBindings_EXPECTED(finalBindingsSource) {
  if (!Array.isArray(finalBindingsSource)) return []
  // ★★ 修复点 2：connected 放宽真值 + hasAnyPath 扩展 relPath ★★
  return finalBindingsSource
    .filter((item) => item && typeof item === 'object')
    .filter((obj) => isConnectedTruthy(obj) && hasAnyPathExtended(obj))
}

// ============================================================================
// Fixture 构造：4 个新链路模型 bindings + 4 个 viewer slots + layoutItems
// ============================================================================
const PROJECT_ROOT = 'D:\\DVStudioProjects\\demo-ue-integration'
function makeFixture() {
  const bindings = [
    {
      objectId: 'obj-tripo-01',
      inputAnchorId: 'in-model-obj-tripo-01',
      connected: true,
      sourceNodeId: 'tripo3d-node-A',
      sourceNodeType: 'tripo3d',
      modelUrl: 'file:///D:/DVStudioProjects/demo-ue-integration/Content/Media/tripo3d/c79dbd7c/model.glb',
      modelAssetUrl: 'file:///D:/DVStudioProjects/demo-ue-integration/Content/Media/tripo3d/c79dbd7c/model.glb',
      modelAssetPath: PROJECT_ROOT + '\\Content\\Media\\tripo3d\\c79dbd7c\\model.glb',
      modelSourcePath: PROJECT_ROOT + '\\Content\\Media\\tripo3d\\c79dbd7c\\model.glb',
      modelAssetProjectRelativePath: 'Content/Media/tripo3d/c79dbd7c/model.glb',
      modelProjectRelativePath: 'Content/Media/tripo3d/c79dbd7c/model.glb',
      modelSourceName: 'tripo3d_c79dbd7c-b988-437c-bb2d-36687e880731',
      modelFormat: 'glb'
    },
    {
      objectId: 'obj-tripo-02',
      inputAnchorId: 'in-model-obj-tripo-02',
      connected: 'true',  // 字符串形式 —— Case C 兼容
      sourceNodeId: 'tripo3d-node-B',
      sourceNodeType: 'tripo3d',
      modelUrl: 'file:///D:/DVStudioProjects/demo-ue-integration/Content/Media/tripo3d/eaf91245/result.glb',
      modelAssetUrl: 'file:///D:/DVStudioProjects/demo-ue-integration/Content/Media/tripo3d/eaf91245/result.glb',
      modelAssetPath: PROJECT_ROOT + '\\Content\\Media\\tripo3d\\eaf91245\\result.glb',
      modelSourcePath: PROJECT_ROOT + '\\Content\\Media\\tripo3d\\eaf91245\\result.glb',
      modelAssetProjectRelativePath: 'Content/Media/tripo3d/eaf91245/result.glb',
      modelProjectRelativePath: 'Content/Media/tripo3d/eaf91245/result.glb',
      modelSourceName: 'tripo3d_chair_new_v2',
      modelFormat: 'glb'
    },
    {
      objectId: 'obj-meshy-01',
      inputAnchorId: 'in-model-obj-meshy-01',
      connected: 1,          // 数字形式 —— Case C 兼容
      sourceNodeId: 'meshy-node-C',
      sourceNodeType: 'meshy',
      modelUrl: 'file:///D:/DVStudioProjects/demo-ue-integration/Content/Media/meshy/c10a/textured.glb',
      modelAssetUrl: 'file:///D:/DVStudioProjects/demo-ue-integration/Content/Media/meshy/c10a/textured.glb',
      modelAssetPath: PROJECT_ROOT + '\\Content\\Media\\meshy\\c10a\\textured.glb',
      modelSourcePath: PROJECT_ROOT + '\\Content\\Media\\meshy\\c10a\\textured.glb',
      modelAssetProjectRelativePath: 'Content/Media/meshy/c10a/textured.glb',
      modelProjectRelativePath: 'Content/Media/meshy/c10a/textured.glb',
      modelSourceName: 'meshy_sci_fi_pillar',
      modelFormat: 'glb'
    },
    {
      objectId: 'obj-generic-gltf-01',
      inputAnchorId: 'in-model-obj-generic-gltf-01',
      connected: true,
      sourceNodeId: 'model3d-node-D',
      sourceNodeType: 'model3d',
      // 分离打包：gltf + bin + png（白模测试 Case B）
      modelUrl: 'file:///D:/DVStudioProjects/demo-ue-integration/Content/Media/generic/scene/scene.gltf',
      modelAssetUrl: 'file:///D:/DVStudioProjects/demo-ue-integration/Content/Media/generic/scene/scene.gltf',
      modelAssetPath: PROJECT_ROOT + '\\Content\\Media\\generic\\scene\\scene.gltf',
      modelSourcePath: PROJECT_ROOT + '\\Content\\Media\\generic\\scene\\scene.gltf',
      modelAssetProjectRelativePath: 'Content/Media/generic/scene/scene.gltf',
      modelProjectRelativePath: 'Content/Media/generic/scene/scene.gltf',
      modelSourceName: 'generic_interior_room',
      modelFormat: 'gltf',
      // ★ Case B：贴图引用必须被透传 ★
      textureRefs: [
        { role: 'BaseColor', rel: 'scene_Albedo.jpg' },
        { role: 'Normal',    rel: 'scene_Normal.png'  },
        { role: 'Roughness', rel: 'scene_Rough.png'   },
        { role: 'Metallic',  rel: 'scene_Metal.png'   }
      ],
      modelMaterialOverrides: [
        { slotName: 'M_Surface', materialPath: '/Game/Content/Media/generic/scene/M_Surface.M_Surface' }
      ]
    }
  ]
  const layoutItems = bindings.map((b, i) => ({
    id: b.objectId,
    name: `layout-${i + 1}-${b.objectId}`,
    transform: { position: { x: i, y: 0, z: 0 }, rotation: { yaw: 0, pitch: 0, roll: 0 }, scale: { x: 1, y: 1, z: 1 } }
  }))
  // viewer 插槽：故意把 slot[1..3].modelBinding 设为 undefined（模拟用户现场只剩 1 个有 modelBinding）
  const slots = [
    {
      slotId: 'obj-tripo-01',
      sourceObjectId: 'obj-tripo-01',
      objectName: 'layout-1-obj-tripo-01',
      // slot[0]：modelBinding 完整
      modelBinding: structuredClone(bindings[0]),
      relativeTransform: identityTransform,
      previewInstanceTransform: identityTransform,
      worldTransform: identityTransform
    },
    {
      slotId: 'obj-tripo-02',
      sourceObjectId: 'obj-tripo-02',
      objectName: 'layout-2-obj-tripo-02',
      modelBinding: undefined,   // ★ 未写：模拟 viewer 侧没写
      relativeTransform: { position: { x: 1, y: 0, z: 0 }, rotation: { yaw: 0, pitch: 0, roll: 0 }, scale: { x: 1, y: 1, z: 1 } }
    },
    {
      slotId: 'obj-meshy-01',
      sourceObjectId: 'obj-meshy-01',
      objectName: 'layout-3-obj-meshy-01',
      modelBinding: undefined,   // ★ 未写
      relativeTransform: { position: { x: 2, y: 0, z: 0 }, rotation: { yaw: 0, pitch: 0, roll: 0 }, scale: { x: 1, y: 1, z: 1 } }
    },
    {
      slotId: 'obj-generic-gltf-01',
      sourceObjectId: 'obj-generic-gltf-01',
      objectName: 'layout-4-obj-generic-gltf-01',
      modelBinding: undefined,   // ★ 未写
      relativeTransform: { position: { x: 3, y: 0, z: 0 }, rotation: { yaw: 0, pitch: 0, roll: 0 }, scale: { x: 1, y: 1, z: 1 } }
    }
  ]
  return { bindings, layoutItems, slots }
}

// ============================================================================
// 轻量断言工具
// ============================================================================
const passed = []
const failed = []
function dumpCtx(label, ctx) {
  const fields = (obj) => obj && typeof obj === 'object' ? {
    objectId: obj.objectId, slotId: obj.slotId, sourceObjectId: obj.sourceObjectId,
    modelUrl: obj.modelBinding?.modelUrl ?? obj.modelUrl,
    modelAssetUrl: obj.modelBinding?.modelAssetUrl ?? obj.modelAssetUrl,
    modelAssetProjectRelativePath: obj.modelBinding?.modelAssetProjectRelativePath ?? obj.modelAssetProjectRelativePath,
    textureRefs: obj.modelBinding?.textureRefs ?? obj.textureRefs,
    modelMaterialOverrides: obj.modelBinding?.modelMaterialOverrides ?? obj.modelMaterialOverrides,
    modelFormat: obj.modelBinding?.modelFormat ?? obj.modelFormat
  } : String(obj)
  return `${label}=${JSON.stringify(fields(ctx), null, 2)}`
}
function assertEq(label, actual, expected, ctx = {}) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) passed.push(label)
  else {
    const msg = [
      `FAIL ${label}`,
      `  expected: ${JSON.stringify(expected)}`,
      `  actual:   ${JSON.stringify(actual)}`,
      ...Object.entries(ctx).map(([k, v]) => `  ${dumpCtx(k, v)}`)
    ].join('\n')
    failed.push(msg)
    console.error(msg)
  }
  return ok
}
function assertTruthy(label, cond, ctx = {}) {
  if (!!cond) passed.push(label)
  else {
    const msg = [
      `FAIL ${label} (expected truthy, got: ${String(cond)})`,
      ...Object.entries(ctx).map(([k, v]) => `  ${dumpCtx(k, v)}`)
    ].join('\n')
    failed.push(msg)
    console.error(msg)
  }
  return !!cond
}

// ============================================================================
// Case A：4 模型数量 / 每个 slot 都有 modelBinding / 路径不串
// ============================================================================
function runCaseA(fx) {
  // viewer 返回的 exportData 中包含 sceneLayoutResolvedModelBindings
  const exportData = { sceneLayoutResolvedModelBindings: structuredClone(fx.bindings) }
  const { finalBindingsSource } = mergeViewerResolvedIntoFinalBindings_EXPECTED(exportData, [])
  const connected = buildFinalConnectedModelBindings_EXPECTED(finalBindingsSource)
  const { slots, warnings } = prepareResolvedSlotsForExport_EXPECTED(structuredClone(fx.slots), connected, fx.layoutItems)
  const byObj = new Map(fx.bindings.map((b) => [b.objectId, b]))

  assertEq('Case A1: 4 slots 最终都生成', slots.length, 4, { slots })
  slots.forEach((s, i) => {
    assertTruthy(`Case A2: slot[${i}] modelBinding 非空（${s.slotId}）`, s.modelBinding && typeof s.modelBinding === 'object' && hasValidModelPath(s.modelBinding), { slot: s })
  })
  slots.forEach((s, i) => {
    const expectedBinding = byObj.get(s.sourceObjectId)
    if (!expectedBinding) {
      assertTruthy(`Case A3: slot[${i}] (${s.slotId}) 找不到对应 expected binding → FAIL`, false, { slot: s })
      return
    }
    const actualAssetUrl = s.modelBinding?.modelAssetUrl
    assertEq(`Case A3: slot[${i}] modelAssetUrl 正确不串 (${s.slotId})`, actualAssetUrl, expectedBinding.modelAssetUrl, { slot: s, binding: expectedBinding })
  })
  slots.forEach((s, i) => {
    const expectedBinding = byObj.get(s.sourceObjectId)
    if (!expectedBinding) return
    const expectedRel = expectedBinding.modelAssetProjectRelativePath
    const actualRel = s.modelBinding?.modelAssetProjectRelativePath
    assertEq(`Case A4: slot[${i}] modelAssetProjectRelativePath 透传 (${s.slotId})`, actualRel, expectedRel, { slot: s, binding: expectedBinding })
  })
  if (warnings.length > 0) console.info('[Case A] 产生 warnings:', warnings)
}

// ============================================================================
// Case B：贴图 / 材质完整性（分离 gltf 场景）
// ============================================================================
function runCaseB(fx) {
  const exportData = { sceneLayoutResolvedModelBindings: structuredClone(fx.bindings) }
  const { finalBindingsSource } = mergeViewerResolvedIntoFinalBindings_EXPECTED(exportData, [])
  const connected = buildFinalConnectedModelBindings_EXPECTED(finalBindingsSource)
  const { slots } = prepareResolvedSlotsForExport_EXPECTED(structuredClone(fx.slots), connected, fx.layoutItems)
  const genericSlot = slots.find((s) => s.sourceObjectId === 'obj-generic-gltf-01')

  assertTruthy('Case B1: 分离 gltf slot 的 modelAssetProjectRelativePath 透传', genericSlot?.modelBinding?.modelAssetProjectRelativePath, { slot: genericSlot })
  assertEq('Case B2: 分离 gltf slot 的 modelAssetProjectRelativePath 值正确', genericSlot.modelBinding.modelAssetProjectRelativePath, 'Content/Media/generic/scene/scene.gltf', { slot: genericSlot })
  assertTruthy('Case B3: textureRefs 数组被透传', Array.isArray(genericSlot.modelBinding.textureRefs) && genericSlot.modelBinding.textureRefs.length === 4, { slot: genericSlot })
  assertEq('Case B4: textureRefs 四个元素 role+rel 正确（Albedo / Normal / Rough / Metal）',
    genericSlot.modelBinding.textureRefs,
    [
      { role: 'BaseColor', rel: 'scene_Albedo.jpg' },
      { role: 'Normal',    rel: 'scene_Normal.png'  },
      { role: 'Roughness', rel: 'scene_Rough.png'   },
      { role: 'Metallic',  rel: 'scene_Metal.png'   }
    ],
    { slot: genericSlot }
  )
  assertTruthy('Case B5: modelMaterialOverrides 被透传', Array.isArray(genericSlot.modelBinding.modelMaterialOverrides) && genericSlot.modelBinding.modelMaterialOverrides.length >= 1, { slot: genericSlot })
  assertEq('Case B6: modelMaterialOverrides[0].slotName === M_Surface', genericSlot.modelBinding.modelMaterialOverrides[0].slotName, 'M_Surface', { slot: genericSlot })
  assertEq('Case B7: modelFormat= gltf 被保留', genericSlot.modelBinding.modelFormat, 'gltf', { slot: genericSlot })

  // 同字段一致性：modelUrl / modelAssetUrl / modelAssetPath / modelSourcePath 应该和 resolvedBindings 保持完全一致
  const idx = 3
  assertEq('Case B8a: modelUrl 完全一致', genericSlot.modelBinding.modelUrl, fx.bindings[idx].modelUrl, { slot: genericSlot })
  assertEq('Case B8b: modelAssetUrl 完全一致', genericSlot.modelBinding.modelAssetUrl, fx.bindings[idx].modelAssetUrl, { slot: genericSlot })
  assertEq('Case B8c: modelAssetPath 完全一致', genericSlot.modelBinding.modelAssetPath, fx.bindings[idx].modelAssetPath, { slot: genericSlot })
  assertEq('Case B8d: modelSourcePath 完全一致', genericSlot.modelBinding.modelSourcePath, fx.bindings[idx].modelSourcePath, { slot: genericSlot })
}

// ============================================================================
// Case C：connected 兼容 true / 'true' / 1 三种形式
// ============================================================================
function runCaseC(fx) {
  const input = [fx.bindings[0], fx.bindings[1], fx.bindings[2]]  // connected = true / 'true' / 1
  const connected = buildFinalConnectedModelBindings_EXPECTED(input)
  assertEq('Case C1: connected 三种形式都保留，结果 3 条', connected.length, 3, { bindings: input, connected })
  assertTruthy('Case C2: 每条都有 modelAssetUrl（3 条都有）', connected.every((b) => String(b.modelAssetUrl ?? '').trim().startsWith('file:///')), { connected })
}

// ============================================================================
// Case D：最终 payload 组装（viewer resolved 优先）
// ============================================================================
function runCaseD(fx) {
  const precheckBindings = [structuredClone(fx.bindings[0])]  // 只放 1 条
  const exportData = { sceneLayoutResolvedModelBindings: structuredClone(fx.bindings) }  // viewer 返回 4 条

  const { finalBindingsSource, usedViewerResolvedBindings } = mergeViewerResolvedIntoFinalBindings_EXPECTED(exportData, precheckBindings)
  assertEq('Case D1: finalBindingsSource 优先使用 viewer resolvedBindings（4 条）', finalBindingsSource.length, 4, { finalBindingsSource })
  assertTruthy('Case D2: usedViewerResolvedBindings === true', usedViewerResolvedBindings, { usedViewerResolvedBindings })

  const finalConnected = buildFinalConnectedModelBindings_EXPECTED(finalBindingsSource)
  assertEq('Case D3: finalConnectedModelBindings 仍然保留 4 条', finalConnected.length, 4, { finalConnected })
  assertTruthy(
    'Case D4: 每条都有 modelAssetProjectRelativePath 字段透传（不被 filter 裁剪）',
    finalConnected.every((b) => String(b.modelAssetProjectRelativePath ?? '').trim().startsWith('Content/')),
    { finalConnected }
  )
  // mock 最终 payload
  const payload = { modelBindings: finalConnected, modelBindingCount: finalConnected.length }
  assertEq('Case D5: payload.modelBindingCount === 4', payload.modelBindingCount, 4, { payload })
  assertTruthy(
    'Case D6: 每条 payload.modelBindings[i].modelAssetUrl 都是 file:/// 开头',
    payload.modelBindings.every((b) => String(b.modelAssetUrl ?? '').startsWith('file:///')),
    { payload }
  )
}

// ============================================================================
// Case E：viewer slotCount=1（只返回了第一个模型），但 bindings=4，
//   必须靠 useAIWorkflowUnrealExportActions 端的 retry 策略 +
//   "若 rawSlots 覆盖的 objectId 数 < finalConnected bindings 数，则
//    用 pure-data 构造器补全缺失的 objectId 对应的 slot" —— 这一步
//   在 TS 侧的最终实现是 prepareResolvedSlotsForExport +
//   SceneLayoutNode.vue 兜底，但独立测试里我们直接断言：
//     给定 4 条 bindings 但 rawSlots 只带 1 条（含 objectId=obj-tripo-01），
//     再给 layoutItems=4 条 → 走纯数据补 slot 的逻辑。
//
//   本 Case 同时还验证：viewer 侧 slot[0].modelBinding 用"旧 8 字段白名单"
//   写入（没有 textureRefs / modelAssetProjectRelativePath），
//   prepareResolvedSlotsForExport 应该强制用 bindingByObjectId 的
//   全量 resolvedBinding 覆盖它（贴图完整性修复）。
// ============================================================================
function buildSlotsByLayoutItemsAndBindings(layoutItems, bindings) {
  const byId = new Map(bindings.filter(Boolean).map((b) => [String(b.objectId ?? '').trim(), b]).filter(([id]) => id))
  const slots = []
  for (const item of layoutItems) {
    const objectId = String(item.id ?? '').trim()
    if (!objectId) continue
    const binding = byId.get(objectId)
    if (!binding) continue
    const itemTransform = item.transform || { position: { x: 0, y: 0, z: 0 }, rotation: { yaw: 0, pitch: 0, roll: 0 }, scale: { x: 1, y: 1, z: 1 } }
    slots.push({
      slotId: objectId,
      sourceObjectId: objectId,
      sourceSlotId: objectId,
      objectName: item.name || objectId,
      displayName: item.name || objectId,
      cloneIndex: 0,
      cloneCount: 1,
      isClone: false,
      relativeTransform: itemTransform,
      worldTransform: itemTransform,
      previewInstanceTransform: itemTransform,
      previewInstanceWorldTransform: itemTransform,
      slotTransform: itemTransform,
      meshTransform: itemTransform,
      worldBounds: null,
      placeholderTransform: null,
      placeholderBounds: null,
      modelBinding: binding
    })
  }
  return slots
}

function runCaseE(fx) {
  // viewer 返回 1 条 slot（只有第 0 个 tripo 模型），且 slot.modelBinding 故意只有 8 字段白名单（缺贴图）
  const viewerSlots = [
    {
      slotId: 'obj-tripo-01',
      sourceSlotId: 'obj-tripo-01',
      sourceObjectId: 'obj-tripo-01',
      objectName: 'layout-1-obj-tripo-01',
      displayName: 'layout-1-obj-tripo-01',
      cloneIndex: 0,
      cloneCount: 1,
      isClone: false,
      relativeTransform: structuredClone(identityTransform),
      previewInstanceTransform: structuredClone(identityTransform),
      worldTransform: structuredClone(identityTransform),
      previewInstanceWorldTransform: structuredClone(identityTransform),
      slotTransform: structuredClone(identityTransform),
      meshTransform: structuredClone(identityTransform),
      worldBounds: null,
      placeholderTransform: null,
      placeholderBounds: null,
      // 8 字段白名单，缺：modelAssetProjectRelativePath / textureRefs / modelMaterialOverrides / modelProjectRelativePath
      modelBinding: {
        sourceNodeId: 'tripo3d-node-A',
        sourceNodeType: 'tripo3d',
        modelUrl: fx.bindings[0].modelUrl,
        modelAssetUrl: fx.bindings[0].modelAssetUrl,
        modelSourcePath: fx.bindings[0].modelSourcePath,
        modelAssetPath: fx.bindings[0].modelAssetPath,
        modelSourceName: fx.bindings[0].modelSourceName,
        modelFormat: fx.bindings[0].modelFormat
        // 注意：没有 modelAssetProjectRelativePath / textureRefs 等 → 贴图完整性 keys 不够
      }
    }
  ]
  const exportData = { sceneLayoutResolvedModelBindings: structuredClone(fx.bindings) }
  const { finalBindingsSource } = mergeViewerResolvedIntoFinalBindings_EXPECTED(exportData, [])
  const finalConnected = buildFinalConnectedModelBindings_EXPECTED(finalBindingsSource)

  // Step 1：直接走 viewer 返回的 1 条 slots（没有 viewer 兜底）→ 应该得到 1 条（prepare 不会凭空补 slot）
  const { slots: onlyViewerSlots } = prepareResolvedSlotsForExport_EXPECTED(structuredClone(viewerSlots), finalConnected, fx.layoutItems)
  assertEq('Case E1: 仅 viewer slots 时 → prepared=1 条（prepare 只基于入参 rawSlots）', onlyViewerSlots.length, 1, { onlyViewerSlots })
  const firstSlot = onlyViewerSlots[0]
  // —— 关键断言：即使 viewer 只给了 8 字段 modelBinding，prepare 检测到 lacksTextureIntegrity，
  //    会强制用 bindingByObjectId 的全量 resolvedBinding 覆盖 → relPath+贴图引用 都被补回来
  assertEq(
    'Case E2: viewer slot 虽有 8 字段 modelBinding，但缺少贴图完整性字段 → 被强制用 resolvedBinding 覆盖（modelAssetProjectRelativePath 回来了）',
    firstSlot.modelBinding.modelAssetProjectRelativePath,
    fx.bindings[0].modelAssetProjectRelativePath,
    { slot: firstSlot, binding: fx.bindings[0] }
  )

  // Step 2：在"不依赖 viewer 是否返回完整"的前提下，调用 pure-data 补全器（这就是
  //         WorkflowSceneLayoutNode.vue 兜底 + unrealExportUtils 端二次补的组合）
  //         结果应当 4 条，而且 4 条都有完整贴图引用。
  const pureDataSlots = buildSlotsByLayoutItemsAndBindings(fx.layoutItems, finalConnected)
  const merged = [...onlyViewerSlots]
  const already = new Set(onlyViewerSlots.map((s) => String(s.sourceObjectId ?? '').trim()).filter(Boolean))
  for (const s of pureDataSlots) {
    if (!already.has(String(s.sourceObjectId ?? '').trim())) merged.push(s)
  }
  const { slots: finalPrepared, warnings } = prepareResolvedSlotsForExport_EXPECTED(merged, finalConnected, fx.layoutItems)
  assertEq('Case E3: pure-data 补齐后，最终 prepared slots = 4', finalPrepared.length, 4, { finalPrepared })
  for (let i = 0; i < finalPrepared.length; i += 1) {
    const s = finalPrepared[i]
    const expected = fx.bindings.find((b) => b.objectId === s.sourceObjectId)
    assertTruthy(`Case E4: prepared slot[${i}] (${s.slotId}) modelBinding 非空`, !!s.modelBinding && hasValidModelPath(s.modelBinding), { slot: s })
    assertEq(
      `Case E5: prepared slot[${i}] modelAssetProjectRelativePath 透传`,
      s.modelBinding.modelAssetProjectRelativePath,
      expected?.modelAssetProjectRelativePath,
      { slot: s, binding: expected }
    )
    if (s.sourceObjectId === 'obj-generic-gltf-01') {
      assertEq(
        `Case E6: prepared slot[${i}] textureRefs 全量保留（分离 gltf 防白模）`,
        s.modelBinding.textureRefs?.length,
        4,
        { slot: s }
      )
    }
  }
  void warnings
}

// ============================================================================
// Case F: 模拟现场数据 —— 旧链路 bar_main 已有 modelAssetPath/modelSourcePath，
//         其余 6 个新链路模型只有 modelAssetProjectRelativePath + modelUrl=dweb://；
//         另外加 5 个 ceiling/floor/wall 房间壳子（路径全空）
//         验证：出口过滤掉 5 个壳子 → 7 个 validSlots
//              → 6 个新链路模型被回填 modelAssetPath/modelSourcePath
//              → 旧链路 bar_main 的原有路径不被污染
//              → 所有 dweb:// modelUrl 被替换成相对路径
// ============================================================================
function runCaseF() {
  const PROJ = 'C:\\Users\\Sugar\\DVStudioProjects\\1'
  // —— 9 个 resolvedBindings（5 空壳 + 4 真模型，其中 bar_main 是旧链路）
  const bindings = [
    // 旧链路 bar_main：已经有 modelAssetPath / modelSourcePath
    {
      objectId: 'bar_main', connected: true, sourceNodeType: 'model3d',
      modelAssetUrl: 'dweb://project-assets?projectId=1&path=Content%2FMedia%2Ftripo3d_c79dbd7c.glb',
      modelAssetProjectRelativePath: 'Content/Media/tripo3d_c79dbd7c.glb',
      modelAssetPath: PROJ + '\\Content\\Media\\tripo3d_c79dbd7c.glb',  // 旧链路已有
      modelSourcePath: PROJ + '\\Content\\Media\\tripo3d_c79dbd7c.glb', // 旧链路已有
      modelUrl: 'file:///C:/Users/Sugar/DVStudioProjects/1/Content/Media/tripo3d_c79dbd7c.glb', // 旧链路是 file://
      modelFormat: 'glb'
    },
    // 5 个房间壳子：路径全空（场景布局注入的占位）
    { objectId: 'ceiling_main', connected: true, sourceNodeType: 'model3d' },
    { objectId: 'floor_main',   connected: true, sourceNodeType: 'model3d' },
    { objectId: 'wall_back',    connected: true, sourceNodeType: 'model3d' },
    { objectId: 'wall_left',    connected: true, sourceNodeType: 'model3d' },
    { objectId: 'wall_right',   connected: true, sourceNodeType: 'model3d' },
    // 新链路 shelves_back（1 个 binding 会被 layout 克隆成 4 个 item）
    {
      objectId: 'shelves_back', connected: true, sourceNodeType: 'meshy',
      modelAssetUrl: 'dweb://project-assets?projectId=1&path=Content%2FMedia%2Fmeshy_shelves.glb',
      modelAssetProjectRelativePath: 'Content/Media/meshy_shelves.glb',
      // ★ 新链路故意不填 modelAssetPath/modelSourcePath
      modelUrl: 'dweb://project-assets?projectId=1&path=Content%2FMedia%2Fmeshy_shelves.glb', // dweb://
      modelFormat: 'glb'
    },
    // 新链路 stool_left
    {
      objectId: 'stool_left', connected: true, sourceNodeType: 'tripo3d',
      modelAssetUrl: 'dweb://project-assets?projectId=1&path=Content%2FMedia%2Ftripo_stool_left.glb',
      modelAssetProjectRelativePath: 'Content/Media/tripo_stool_left.glb',
      modelUrl: 'dweb://project-assets?projectId=1&path=Content%2FMedia%2Ftripo_stool_left.glb',
      modelFormat: 'glb'
    },
    // 新链路 stool_mid
    {
      objectId: 'stool_mid', connected: true, sourceNodeType: 'meshy',
      modelAssetUrl: 'dweb://project-assets?projectId=1&path=Content%2FMedia%2Fmeshy_stool_mid.glb',
      modelAssetProjectRelativePath: 'Content/Media/meshy_stool_mid.glb',
      modelUrl: 'dweb://project-assets?projectId=1&path=Content%2FMedia%2Fmeshy_stool_mid.glb',
      modelFormat: 'glb'
    }
  ]
  // —— layoutItems: 32 个（只取真实渲染的 12 个，其余随意，模拟日志中的 layoutItems=32）
  const layoutItems = []
  for (let i = 0; i < 20; i += 1) layoutItems.push({ id: `dummy-${i}`, name: `dummy ${i}` })
  // bar_main 1 个
  layoutItems.push({ id: 'bar_main', name: '酒吧台' })
  // shelves_back 克隆 4 个（layout 中的多实例）
  for (let i = 0; i < 4; i += 1) layoutItems.push({ id: `shelves_back__clone_${i}`, name: `货架 ${i + 1}`, objectId: 'shelves_back' })
  // stool_left 1 个
  layoutItems.push({ id: 'stool_left', name: '左方凳' })
  // stool_mid 1 个
  layoutItems.push({ id: 'stool_mid', name: '中方凳' })
  // 5 个房间壳子（虽然在 bindings 中有，但真实资产路径空）
  layoutItems.push({ id: 'ceiling_main', name: '天花板' })
  layoutItems.push({ id: 'floor_main', name: '地板' })
  layoutItems.push({ id: 'wall_back', name: '后墙' })
  layoutItems.push({ id: 'wall_left', name: '左墙' })
  layoutItems.push({ id: 'wall_right', name: '右墙' })

  // —— 直接手写 12 个 slots（模拟日志 #2b：bar+4 shelves 克隆+2 stool+5 壳）
  //    真实链路 buildPureDataSlotsForUnreal 会通过 fillMode 展开克隆，
  //    Case F 重点是出口过滤与路径回填，不测试克隆展开，所以直接构造结果。
  const finalConnected = buildFinalConnectedModelBindings_EXPECTED(bindings)
  const bindingMap = new Map(finalConnected.filter(Boolean).map((b) => [String(b.objectId ?? '').trim(), structuredClone(b)]))
  const T = () => ({ position: { x: 0, y: 0, z: 0 }, rotation: { yaw: 0, pitch: 0, roll: 0 }, scale: { x: 1, y: 1, z: 1 } })
  function mkSlot(slotId, sourceObjectId, bindingObjId, name) {
    const mb = bindingMap.get(bindingObjId)
    return {
      slotId, sourceObjectId,
      objectName: name, displayName: name,
      cloneIndex: slotId.includes('__clone_') ? Number(slotId.split('__clone_')[1]) : 0,
      cloneCount: slotId.includes('__clone_') ? 4 : 1,
      isClone: slotId.includes('__clone_'),
      generatedFromBinding: true,
      pureDataBuilt: true,
      relativeTransform: T(), worldTransform: T(),
      previewInstanceTransform: T(), previewInstanceWorldTransform: T(),
      slotTransform: T(), meshTransform: T(),
      worldBounds: null, placeholderTransform: null, placeholderBounds: null,
      parentReference: null,
      modelBinding: mb ? structuredClone(mb) : undefined
    }
  }
  const pureDataSlots = [
    mkSlot('bar_main', 'bar_main', 'bar_main', '酒吧台'),
    mkSlot('ceiling_main', 'ceiling_main', 'ceiling_main', '天花板'),
    mkSlot('floor_main', 'floor_main', 'floor_main', '地板'),
    mkSlot('shelves_back__clone_0', 'shelves_back__clone_0', 'shelves_back', '货架 1'),
    mkSlot('shelves_back__clone_1', 'shelves_back__clone_1', 'shelves_back', '货架 2'),
    mkSlot('shelves_back__clone_2', 'shelves_back__clone_2', 'shelves_back', '货架 3'),
    mkSlot('shelves_back__clone_3', 'shelves_back__clone_3', 'shelves_back', '货架 4'),
    mkSlot('stool_left', 'stool_left', 'stool_left', '左方凳'),
    mkSlot('stool_mid', 'stool_mid', 'stool_mid', '中方凳'),
    mkSlot('wall_back', 'wall_back', 'wall_back', '后墙'),
    mkSlot('wall_left', 'wall_left', 'wall_left', '左墙'),
    mkSlot('wall_right', 'wall_right', 'wall_right', '右墙')
  ]
  const { slots, warnings } = prepareResolvedSlotsForExport_EXPECTED(pureDataSlots, finalConnected, layoutItems)
  void warnings

  // 断言 F1: 出口过滤后只有 7 个 validSlots（5 个壳子被丢弃）
  assertEq('Case F1: 出口过滤后 validSlots = 7（5 房间壳子被丢弃）', slots.length, 7, { slotsLen: slots.length, warnings })
  const byId = new Map(slots.map((s) => [String(s.slotId ?? s.sourceObjectId ?? ''), s]))

  // 断言 F2: bar_main（旧链路）的 modelAssetPath/modelSourcePath 未被污染
  const bar = byId.get('bar_main')
  assertTruthy('Case F2-1: bar_main slot 存在', !!bar, { byId: [...byId.keys()] })
  assertEq('Case F2-2: bar_main 原 modelAssetPath 不被覆盖（保留旧链路值）',
    bar.modelBinding.modelAssetPath, PROJ + '\\Content\\Media\\tripo3d_c79dbd7c.glb', { mb: bar.modelBinding })
  assertEq('Case F2-3: bar_main 原 modelSourcePath 不被覆盖',
    bar.modelBinding.modelSourcePath, PROJ + '\\Content\\Media\\tripo3d_c79dbd7c.glb', { mb: bar.modelBinding })
  assertEq('Case F2-4: bar_main modelUrl 仍为 file://（不是 dweb），不被替换',
    !!String(bar.modelBinding.modelUrl ?? '').startsWith('file://'), true, { modelUrl: bar.modelBinding.modelUrl })

  // 断言 F3: shelves_back clone_0 / clone_1 / clone_2 / clone_3 都有 modelAssetPath/modelSourcePath，且 modelUrl 不是 dweb://
  for (let i = 0; i < 4; i += 1) {
    const sid = `shelves_back__clone_${i}`
    const sl = byId.get(sid)
    assertTruthy(`Case F3-${i * 5 + 1}: shelves_back clone_${i} slot 存在`, !!sl, { byId: [...byId.keys()] })
    assertEq(`Case F3-${i * 5 + 2}: shelves_back clone_${i} modelAssetPath 被回填成 relPath`,
      sl.modelBinding.modelAssetPath, 'Content/Media/meshy_shelves.glb', { mb: sl.modelBinding })
    assertEq(`Case F3-${i * 5 + 3}: shelves_back clone_${i} modelSourcePath 被回填成 relPath`,
      sl.modelBinding.modelSourcePath, 'Content/Media/meshy_shelves.glb', { mb: sl.modelBinding })
    assertTruthy(`Case F3-${i * 5 + 4}: shelves_back clone_${i} modelUrl 不再是 dweb://`,
      !String(sl.modelBinding.modelUrl ?? '').startsWith('dweb://'), { modelUrl: sl.modelBinding.modelUrl })
    assertEq(`Case F3-${i * 5 + 5}: shelves_back clone_${i} modelUrl 被替换为 relPath`,
      sl.modelBinding.modelUrl, 'Content/Media/meshy_shelves.glb', { mb: sl.modelBinding })
  }

  // 断言 F4: stool_left 被回填
  const sl = byId.get('stool_left')
  assertTruthy('Case F4-1: stool_left slot 存在', !!sl, { byId: [...byId.keys()] })
  assertEq('Case F4-2: stool_left modelAssetPath = relPath', sl.modelBinding.modelAssetPath, 'Content/Media/tripo_stool_left.glb', { mb: sl.modelBinding })
  assertEq('Case F4-3: stool_left modelSourcePath = relPath', sl.modelBinding.modelSourcePath, 'Content/Media/tripo_stool_left.glb', { mb: sl.modelBinding })
  assertTruthy('Case F4-4: stool_left modelUrl 不是 dweb://', !String(sl.modelBinding.modelUrl ?? '').startsWith('dweb://'), { modelUrl: sl.modelBinding.modelUrl })

  // 断言 F5: stool_mid 被回填
  const sm = byId.get('stool_mid')
  assertTruthy('Case F5-1: stool_mid slot 存在', !!sm, { byId: [...byId.keys()] })
  assertEq('Case F5-2: stool_mid modelAssetPath = relPath', sm.modelBinding.modelAssetPath, 'Content/Media/meshy_stool_mid.glb', { mb: sm.modelBinding })
  assertEq('Case F5-3: stool_mid modelSourcePath = relPath', sm.modelBinding.modelSourcePath, 'Content/Media/meshy_stool_mid.glb', { mb: sm.modelBinding })
  assertTruthy('Case F5-4: stool_mid modelUrl 不是 dweb://', !String(sm.modelBinding.modelUrl ?? '').startsWith('dweb://'), { modelUrl: sm.modelBinding.modelUrl })
}

// Case G: Ultimate Backfill —— 模拟用户现场的关键场景：
//         27 个 bindings（9 有路径 connected=true；18 无路径 connected=false 但都带 sourceNodeId）
//         + nodesById 里 18 个上游 model3d 节点都有 outputs[out-model].resolved.modelAssetProjectRelativePath
//         + resourcesById 有对应 resource 条目含 projectRelativePath
//         验证：tryBackfillBindingPathsFromStore 把 18 个空 binding 全部回填 6 路径字段 →
//              buildPureDataSlotsForUnreal 拿到 27 个 hasAnyPath=true 的 binding →
//              validSlots ≥ 22（扣 5 个房间壳子）
// ============================================================================
function runCaseG() {
  const PROJ = 'C:\\Users\\Sugar\\DVStudioProjects\\1'
  // ---- 5 个房间壳子（路径全空，没有 sourceNodeId → 终极兜底也救不回）----
  const shellIds = ['ceiling_main', 'floor_main', 'wall_back', 'wall_left', 'wall_right']
  // ---- 9 个已有路径 binding（严格校验会通过）----
  const legacyBindings = [
    { objectId: 'bar_main', connected: true, sourceNodeId: 'node_legacy_00', sourceNodeType: 'model3d',
      modelAssetPath: `${PROJ}\\Content\\Media\\bar_main.glb`,
      modelSourcePath: `${PROJ}\\Content\\Media\\bar_main.glb`,
      modelAssetProjectRelativePath: 'Content/Media/bar_main.glb', modelFormat: 'glb' }
  ]
  // 旧链路另外 8 个（shelves_back + stool_left + stool_mid + 5 壳子，其中 5 壳子无路径）
  //   ——简化：legacyBindings 里就放 1 个真正的"有路径"旧链路模型，其它 8 个从 shellIds 合成
  shellIds.forEach((sid) => {
    legacyBindings.push({ objectId: sid, connected: false, objectName: sid })
  })
  // ---- 18 个 connected=false + 6 路径全空 + 但 sourceNodeId/inputAnchorId 真实存在的新链路模型 ----
  const anchorSuffixes = [
    'stool_left', 'stool_mid', 'stool_right', 'sofa_front', 'booth_left',
    'table_front', 'table_booth', 'lamp_pendant_1', 'lamp_pendant_2',
    'lamp_pendant_3', 'lamp_pendant_4', 'lamp_pendant_5', 'lamp_pendant_small',
    'plant_left', 'plant_bar', 'tv_wall_right', 'candle_bar', 'bar_tools'
  ]
  const newChainBindings = anchorSuffixes.map((sfx, i) => ({
    objectId: sfx,
    objectName: sfx,
    inputAnchorId: `in-model-${sfx}`,
    connected: false,
    sourceNodeId: `node_new3d_${String(i + 1).padStart(3, '0')}`,
    sourceNodeType: 'model3d'
  }))
  // 9 个已路径旧链路（1 真+8 含 5 壳） + 18 新链路 = 27 binding
  const all27Bindings = [...legacyBindings, ...newChainBindings]

  // ---- layoutItems：22 个真实对象（= 1 旧链路 bar_main + 18 新链路 + 3 个房间壳占位 floor/ceiling/wall_back）
  //   简化：只造 20 个 layoutItems 足够（每个 item.id = binding.objectId）
  const layoutIdsPresent = [
    'bar_main',
    'shelves_back', // 这个 Case G 中额外放 shelves_back（有 clone 展开）
    ...anchorSuffixes
  ]
  const layoutItems = layoutIdsPresent.map((id) => ({
    id,
    name: id,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    fillMode: id === 'shelves_back' ? 'fill-x' : 'single', // shelves_back 是 fill 展开型（clone_0..3）
    fillCount: id === 'shelves_back' ? 4 : 0,
    fillAxisScale: 1
  }))
  // 5 个壳子中的 2 个（ceiling/floor）也在 layoutItems 里
  for (const sid of ['ceiling_main', 'floor_main']) {
    layoutItems.push({
      id: sid, name: sid,
      position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }
    })
  }

  // ---- nodesById: 18 个新链路上游 model3d 节点都有真实 outputs[out-model].resolved.modelAssetProjectRelativePath ----
  const nodesById = {}
  const resourcesById = {}
  anchorSuffixes.forEach((sfx, i) => {
    const nid = `node_new3d_${String(i + 1).padStart(3, '0')}`
    const relPath = `Content/Media/decompose/${sfx}.glb`
    nodesById[nid] = {
      id: nid, type: 'model3d',
      outputs: [
        { anchorId: 'out-model',
          resolved: {
            modelAssetProjectRelativePath: relPath,
            projectRelativePath: relPath,
            modelAssetUrl: `dweb://project-assets?path=${encodeURIComponent(relPath)}`,
            preferredUrl: `dweb://project-assets?path=${encodeURIComponent(relPath)}`
          } }
      ],
      resourceId: `res_${sfx}`
    }
    resourcesById[`res_${sfx}`] = { projectRelativePath: relPath, absolutePath: `${PROJ}\\${relPath}` }
  })
  // ---- 终极兜底调用：tryBackfillBindingPathsFromStore 对每个空 binding ----
  let backfillOk = 0
  const processed = all27Bindings.map((raw) => {
    const before = { ...raw }
    const after = tryBackfillBindingPathsFromStore_EXPECTED(raw, nodesById, resourcesById)
    const wasEmpty = !hasAnyPathExtended_EXPECTED(before)
    const nowHas = hasAnyPathExtended_EXPECTED(after)
    if (wasEmpty && nowHas) backfillOk += 1
    return after
  })
  assertEq('Case G-1: 18 个新链路空 binding 都被 Ultimate Backfill 回填了路径', backfillOk, 18, { backfillOk })
  assertTruthy('Case G-2: bar_main 原本有路径，现在还保留',
    !!processed.find((b) => b.objectId === 'bar_main' && hasAnyPathExtended_EXPECTED(b)), { processed })
  assertTruthy('Case G-3: shell ceiling_main 还是无路径（因为没 sourceNodeId 也没 resourceId）',
    !!processed.find((b) => b.objectId === 'ceiling_main' && !hasAnyPathExtended_EXPECTED(b)), { processed })
  // ---- buildSlots + last-mile hasAnyPath 过滤 ----
  const pureBuilt = buildSlotsByLayoutItemsAndBindings(layoutItems, processed)
  const { slots: finalSlots, warnings } = prepareResolvedSlotsForExport_EXPECTED(
    pureBuilt.slots, processed, layoutItems
  )
  // 期望 validSlots 数：
  //  bar_main (1) + shelves_back clones x4 (4) + 18 新链路模型 = 23
  //  ——扣掉：ceiling_main / floor_main 这 2 个 shell
  assertEq('Case G-4: validSlots（发送给 UE 的）= 23 个（=1旧 + 4 shelves克隆 + 18新链路）',
    finalSlots.length, 23, { finalSlots: finalSlots.length, warnings })
  const slotIds = finalSlots.map((s) => s.slotId).sort()
  // 校验 18 个新链路 anchorSuffix 都出现在 slotIds 里
  for (const sfx of anchorSuffixes) {
    assertTruthy(`Case G-5 [${sfx}]: 新链路模型 ${sfx} 出现在导出 slots 里`, slotIds.includes(sfx), { slotIds })
  }
  // 校验 18 个新链路模型都有非空 modelAssetPath
  for (const sfx of anchorSuffixes) {
    const sl = finalSlots.find((s) => s.slotId === sfx)
    assertTruthy(`Case G-6 [${sfx}]: modelAssetPath 非空`, !!sl && !!sl.modelBinding.modelAssetPath, { mb: sl?.modelBinding })
    assertEq(`Case G-7 [${sfx}]: modelAssetProjectRelativePath = Content/Media/decompose/${sfx}.glb`,
      sl?.modelBinding?.modelAssetProjectRelativePath, `Content/Media/decompose/${sfx}.glb`, { mb: sl?.modelBinding })
  }
  // 校验 ceiling_main/floor_main 确实被 last-mile hasAnyPath 过滤丢弃了
  assertTruthy('Case G-8: ceiling_main / floor_main 不在导出 slots 里',
    !slotIds.includes('ceiling_main') && !slotIds.includes('floor_main'), { slotIds })
}

// ============================================================================
// 汇总执行
// ============================================================================
function runAll() {
  const fx = makeFixture()
  console.log('=== Case A: 4 模型数量 & path 不串 ===')
  runCaseA(fx)
  console.log('\n=== Case B: 贴图 / 材质完整性 ===')
  runCaseB(fx)
  console.log('\n=== Case C: connected 兼容 ===')
  runCaseC(fx)
  console.log('\n=== Case D: 最终 payload 组装 ===')
  runCaseD(fx)
  console.log('\n=== Case E: viewer slots=1，其余靠纯数据兜底补到 4；旧 8 字段白名单强制用 resolvedBinding 覆盖贴图 ===')
  runCaseE(fx)
  console.log('\n=== Case F: 现场模拟 —— 旧链路 bar_main + 新链路 6 模型 + 5 房间壳子；出口过滤+路径回填+dweb替换 ===')
  runCaseF()
  console.log('\n=== Case G: Ultimate Backfill —— 27 bindings(9有路径+18空) → 18个空binding被nodesById/outputs兜底回填 → validSlots=23 ===')
  runCaseG()

  const total = passed.length + failed.length
  const ok = failed.length === 0
  console.log('\n' + '='.repeat(60))
  console.log(`TOTAL: ${ok ? `PASS: ${passed.length}/${total}` : `FAIL: ${failed.length} failed, ${passed.length}/${total} passed`}`)
  console.log('Summary (期望最终应该达到):')
  // —— 用 Case D 最终产物出一个可对照的 summary ——
  const exportData = { sceneLayoutResolvedModelBindings: structuredClone(fx.bindings) }
  const { finalBindingsSource } = mergeViewerResolvedIntoFinalBindings_EXPECTED(exportData, [])
  const connected = buildFinalConnectedModelBindings_EXPECTED(finalBindingsSource)
  const pureDataSlots = buildSlotsByLayoutItemsAndBindings(fx.layoutItems, connected)
  const { slots } = prepareResolvedSlotsForExport_EXPECTED(pureDataSlots, connected, fx.layoutItems)
  console.log(`  finalSlots.length = ${slots.length}`)
  console.log(`  finalPayload.modelBindingCount = ${connected.length}`)
  connected.forEach((b, i) => console.log(`    [${i + 1}] modelAssetUrl = ${b.modelAssetUrl}`))
  process.exit(ok ? 0 : 1)
}

// ============================================================================
// --emit-browser-harness 输出可在 Console 粘贴执行的 html
// ============================================================================
function emitBrowserHarness() {
  const text = `
<!doctype html><meta charset="utf-8"><title>Unreal Export New 3D Chain Smoke</title>
<pre id=out></pre>
<script>
${String.raw`${readSelfBody()}`}
const origLog = console.log.bind(console), origErr = console.error.bind(console)
const buf = []
console.log = (...a) => { buf.push(a.map((x) => typeof x === 'string' ? x : JSON.stringify(x, null, 2)).join(' ')); origLog(...a) }
console.error = (...a) => { buf.push('! ' + a.map((x) => typeof x === 'string' ? x : JSON.stringify(x, null, 2)).join(' ')); origErr(...a) }
process = { exit(code) { console.log('(emulated process.exit %s)', code) } }
runAll()
document.getElementById('out').textContent = buf.join('\n')
</script>
`.trim()
  process.stdout.write(text)
}

function readSelfBody() {
  // 去掉文件头的 shebang/注释，直接把整个脚本作为字符串返回（用于浏览器 harness）
  const fs = require('fs')
  return fs.readFileSync(new URL(import.meta.url), 'utf8').replace(/^#!.*\n/, '')
}

const args = process.argv.slice(2)
if (args.includes('--emit-browser-harness')) {
  emitBrowserHarness()
} else {
  runAll()
}
