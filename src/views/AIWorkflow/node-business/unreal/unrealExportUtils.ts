import type { WorkflowModelFormat } from '../../../../aiworkflow/types'

const MODEL_EXT_WHITELIST = ['glb', 'gltf', 'fbx', 'obj', 'stl', 'usdz', 'dae'] as const

/**
 * 检查 URL 是否是 meshy/tripo3d 远端 CDN URL 或其他外部 http(s) URL。
 * UE 端无法直接下载这些 URL（CORS / 签名过期 / 认证失败），
 * 在路径对齐时必须替换为本地 relPath（Content/Media/...）。
 */
export const isRemoteCdnUrl = (url: string): boolean => {
	if (!url) return false
	const lower = url.toLowerCase()
	// 明确的 meshy / tripo3d CDN
	if (lower.includes('meshy.ai') || lower.includes('tripo3d.ai')) return true
	// 任何 http/https URL（非 localhost）都视为远端 CDN
	if (lower.startsWith('http://') || lower.startsWith('https://')) {
		try {
			const parsed = new URL(url)
			const host = parsed.hostname.toLowerCase()
			if (host === 'localhost' || host === '127.0.0.1') return false
			return true
		} catch {
			return true
		}
	}
	return false
}

function getLowercasedExt(pathLike: unknown): string | null {
	if (pathLike === null || pathLike === undefined) return null
	const raw = String(pathLike).split('?')[0].split('#')[0].trim()
	if (!raw) return null
	// dweb://...?path=Content/Media/foo.glb → 取 query 里的 path 值再做 ext
	const queryMatch = /[?&](?:path|relativePath|assetPath|filePath|name)=([^&]+)/.exec(raw)
	const candidate = (() => {
		if (queryMatch && queryMatch[1]) {
			try {
				return decodeURIComponent(queryMatch[1])
			} catch {
				return queryMatch[1]
			}
		}
		// file:///C:/foo/bar.glb → /C:/foo/bar.glb → 直接取
		const stripProto = raw.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/+/, '')
		return stripProto || raw
	})()
	const slash = Math.max(candidate.lastIndexOf('/'), candidate.lastIndexOf('\\'))
	const base = slash >= 0 ? candidate.slice(slash + 1) : candidate
	if (!base) return null
	const dot = base.lastIndexOf('.')
	if (dot <= 0 || dot === base.length - 1) return null
	const ext = base.slice(dot + 1).toLowerCase()
	return ext || null
}

/**
 * 从路径字符串尾部推断模型文件格式。
 * 后缀必须命中 MODEL_EXT_WHITELIST（glb/gltf/fbx/obj/stl/usdz/dae）才返回。
 * dweb://project-assets?path=xxx.glb / Content/Media/foo.glb / file:///C:/foo.glb
 * 三种形式都能正确识别。
 */
export function detectModelFormatFromPath(pathLike: unknown): WorkflowModelFormat | null {
	const ext = getLowercasedExt(pathLike)
	if (!ext) return null
	const hit = (MODEL_EXT_WHITELIST as readonly string[]).includes(ext)
	if (!hit) return null
	if (ext === 'usdz') return 'glb' // UE 侧无法直接消费 usdz；归并成 glb 由下游自行兜底
	if (ext === 'dae') return 'fbx' // Collada → 归并到 fbx 分支（近似）
	return ext as WorkflowModelFormat
}

/**
 * 从一批候选路径中挑出"最可能是真实 3D 模型文件"的那一个。
 * 优先级：
 *   1) 后缀命中 MODEL_EXT_WHITELIST（白名单）；其中 glb/gltf 优先（当前项目主格式）
 *   2) 任一路径里带 Content/Media/ 或 static-assets/ 或 /assets/ 的本地感路径
 *   3) 否则第一个非空字符串
 */
export function pickBestModelUrlFromCandidates(
	candidates: Array<string | null | undefined>
): string | null {
	const clean = (candidates ?? [])
		.filter((c): c is string => typeof c === 'string' && !!c.trim())
		.map((c) => c.trim())
	if (clean.length === 0) return null

	const score = (v: string): number => {
		const ext = getLowercasedExt(v)
		const extIdx = ext ? (MODEL_EXT_WHITELIST as readonly string[]).indexOf(ext) : -1
		let s = 0
		if (extIdx >= 0) {
			// glb/gltf → 最高优先级
			if (ext === 'glb' || ext === 'gltf') s += 10000
			s += 1000 - extIdx
		}
		// 强烈偏向项目本地静态资产（Content/Media 是 UE Content 相对路径主目录）
		if (/Content[\\/]+Media[\\/]/i.test(v)) s += 500
		if (/static-assets|project-assets|assets[\\/]/i.test(v)) s += 200
		if (/^file:/i.test(v) || /^[a-zA-Z]:[\\/]/.test(v)) s += 100 // 本地绝对路径
		if (/^https?:/i.test(v)) s -= 10 // 远程 URL 降权（CORS/CDN 失效风险）
		return s
	}

	let best = clean[0]
	let bestScore = -Infinity
	for (const v of clean) {
		const sc = score(v)
		if (sc > bestScore) {
			bestScore = sc
			best = v
		}
	}
	return best || null
}

const identityTransform = {
	position: { x: 0, y: 0, z: 0 },
	rotation: { yaw: 0, pitch: 0, roll: 0 },
	quaternion: { x: 0, y: 0, z: 0, w: 1 },
	scale: { x: 1, y: 1, z: 1 }
}

function hasValidModelPath(binding: Record<string, unknown>): boolean {
	return !!(
		String(binding.modelUrl ?? '').trim() ||
		String(binding.modelAssetUrl ?? '').trim() ||
		String(binding.modelSourcePath ?? '').trim() ||
		String(binding.modelAssetPath ?? '').trim()
	)
}

function isValidTransform(transform: unknown): boolean {
	if (!transform || typeof transform !== 'object') return false
	const t = transform as Record<string, unknown>
	const pos = t.position
	const rot = t.rotation
	const scl = t.scale
	if (!pos || typeof pos !== 'object') return false
	if (!rot || typeof rot !== 'object') return false
	if (!scl || typeof scl !== 'object') return false
	return true
}

function normalizeTransform(transform: unknown) {
	if (!isValidTransform(transform)) {
		return { ...identityTransform }
	}
	const t = transform as Record<string, unknown>
	const pos = t.position as Record<string, unknown>
	const rot = t.rotation as Record<string, unknown>
	const scl = t.scale as Record<string, unknown>
	const quat = t.quaternion as Record<string, unknown> | undefined
	return {
		position: {
			x: Number(pos.x ?? 0) || 0,
			y: Number(pos.y ?? 0) || 0,
			z: Number(pos.z ?? 0) || 0
		},
		rotation: {
			yaw: Number(rot.yaw ?? 0) || 0,
			pitch: Number(rot.pitch ?? 0) || 0,
			roll: Number(rot.roll ?? 0) || 0
		},
		quaternion: quat
			? {
					x: Number(quat.x ?? 0) || 0,
					y: Number(quat.y ?? 0) || 0,
					z: Number(quat.z ?? 0) || 0,
					w: Number(quat.w ?? 1) || 1
				}
			: { x: 0, y: 0, z: 0, w: 1 },
		scale: {
			x: Number(scl.x ?? 1) || 1,
			y: Number(scl.y ?? 1) || 1,
			z: Number(scl.z ?? 1) || 1
		}
	}
}

/**
 * 规范化viewer返回的resolved slots，返回slots数组和按sourceObjectId的主slot映射
 */
export const normalizeResolvedLayoutSlots = (slots: unknown[]) => {
	if (!Array.isArray(slots)) {
		return {
			slots: [] as Record<string, unknown>[],
			bySlotId: new Map<string, Record<string, unknown>>(),
			bySourceObjectId: new Map<string, Record<string, unknown>>()
		}
	}

	const validSlots = slots
		.filter((slot) => {
			if (!slot || typeof slot !== 'object') return false
			const slotObj = slot as Record<string, unknown>
			const slotId = String(slotObj.slotId ?? '').trim()
			const sourceObjectId = String(slotObj.sourceObjectId ?? '').trim()
			if (!slotId || !sourceObjectId) return false
			return true
		})
		.map((slot) => ({ ...(slot as Record<string, unknown>) }))

	const bySlotId = new Map<string, Record<string, unknown>>()
	const bySourceObjectId = new Map<string, Record<string, unknown>>()

	for (const slot of validSlots) {
		const slotId = String(slot.slotId ?? '').trim()
		const sourceObjectId = String(slot.sourceObjectId ?? '').trim()
		if (slotId) {
			bySlotId.set(slotId, slot)
		}
		// 主slot（非clone或第一个clone）按sourceObjectId索引
		if (sourceObjectId && !bySourceObjectId.has(sourceObjectId) && !slot.isClone) {
			bySourceObjectId.set(sourceObjectId, slot)
		}
	}

	return { slots: validSlots, bySlotId, bySourceObjectId }
}

/**
 * 准备导出slots - 直接使用viewer返回的slots数据（保留所有变换字段）
 *
 * viewer.exportResolvedLayoutForUnreal()已经：
 * 1. 从Three.js世界矩阵分解出精确的position/rotation/scale
 * 2. 处理了actorOrigin偏移
 * 3. 处理了parentReference父子引用
 * 4. 填充了modelBinding模型路径信息
 * 5. 支持了clone多实例
 *
 * 这个函数只做：
 * - 验证和补充modelBinding
 * - 确保变换字段格式正确
 * - 收集警告信息
 */
export const prepareResolvedSlotsForExport = (
	rawSlots: unknown[],
	connectedModelBindings: unknown[],
	layoutItems: unknown[]
): { slots: Record<string, unknown>[]; warnings: string[]; placeholderCount: number } => {
	// 2026-08-03 贴图完整性关键字段（提升到函数作用域，便于最终 trace 也能使用）
	const TEXTURE_INTEGRITY_KEYS = [
		'modelAssetProjectRelativePath',
		'modelProjectRelativePath',
		'textureRefs',
		'modelMaterialOverrides',
		'modelFormat'
	] as const
	const warnings: string[] = []
	const { slots: resolvedSlots } = normalizeResolvedLayoutSlots(rawSlots)

	console.warn('[UNREAL-EXPORT-TRACE] #5a prepareResolvedSlotsForExport entry')
	console.warn(`rawSlots = ${rawSlots.length}`)
	console.warn(`resolvedSlots (after normalizeResolvedLayoutSlots) = ${resolvedSlots.length}`)
	console.warn(
		`normalized resolvedSlots[].sourceObjectId summary:`,
		resolvedSlots.map((s: Record<string, unknown>) => ({
			slotId: s.slotId,
			sourceObjectId: s.sourceObjectId,
			hasModelBinding: !!s.modelBinding,
			mb_objectId:
				s.modelBinding && typeof s.modelBinding === 'object'
					? String((s.modelBinding as Record<string, unknown>).objectId)
					: '',
			mb_sourceNodeType:
				s.modelBinding && typeof s.modelBinding === 'object'
					? String((s.modelBinding as Record<string, unknown>).sourceNodeType)
					: ''
		}))
	)
	const safeBindings = Array.isArray(connectedModelBindings) ? connectedModelBindings : []
	console.warn(
		`connectedModelBindings (rawBindings: ${safeBindings.length}`,
		safeBindings.map((b: unknown) => {
			const obj = (b ?? {}) as Record<string, unknown>
			return {
				objectId: String(obj.objectId ?? ''),
				sourceNodeType: String(obj.sourceNodeType ?? ''),
				hasValidPath: hasValidModelPath(obj),
				path: String(
					obj.modelAssetUrl ??
						obj.modelAssetProjectRelativePath ??
						obj.modelAssetPath ??
						obj.modelUrl ??
						''
				)
			}
		})
	)
	// [单行非折叠摘要] —— 保证复制到 log.md 也能直接看，不需要展开 group
	console.warn(
		`[UNREAL-EXPORT-TRACE][SUMMARY] #5a | rawSlots=${rawSlots.length} | normalizedResolvedSlots=${resolvedSlots.length} | sourceObjectIdList=${resolvedSlots
			.map((s) => String(s.sourceObjectId ?? ''))
			.filter(Boolean)
			.join(',')} | connectedModelBindings=${safeBindings.length}[${safeBindings
			.map((b) => String((b as Record<string, unknown>)?.objectId ?? ''))
			.filter(Boolean)
			.join(',')}]`
	)

	// 建立binding索引（【彻底不做过滤】，最后一英里 validSlots 再做 hasAnyPathExtended）：
	//   之前的 inResolvedWhitelist || hasAnyPath 会导致：rawSlots=1（viewer只有1条），
	//   剩下 26 个 binding 哪怕 later 能被 Ultimate Backfill 救回来，也会因为
	//   现在还没有 path 被提前过滤掉。这里改成 ——【只要 binding 有 objectId 就入索引】，
	//   后面补齐/合成/导出 全走 per-binding/per-slot 流程，彻底避免"1个失败跳过全部"。
	const resolvedSourceObjectIds = new Set<string>()
	for (const s of resolvedSlots) {
		const id = String(s.sourceObjectId ?? '').trim()
		if (id) resolvedSourceObjectIds.add(id)
	}
	const bindingByObjectId = new Map<string, Record<string, unknown>>()
	for (const binding of safeBindings) {
		if (!binding || typeof binding !== 'object') continue
		const b = binding as Record<string, unknown>
		const objectId = String(b.objectId ?? '').trim()
		if (!objectId) continue // 唯一硬门槛：没有 objectId 对不上任何占位体，直接扔
		// 同名 objectId 只留第一个（通常是 Force-Rebuild 从 edges 刚扫出来的那一个）
		if (!bindingByObjectId.has(objectId)) bindingByObjectId.set(objectId, b)
	}
	void resolvedSourceObjectIds // 保留变量防止 unused 告警（后续 trace/log 偶尔会看）

	// 建立layoutItem索引
	const itemMap = new Map<string, Record<string, unknown>>()
	const safeLayoutItems = Array.isArray(layoutItems) ? layoutItems : []
	for (const item of safeLayoutItems) {
		if (item && typeof item === 'object') {
			const itemObj = item as Record<string, unknown>
			const itemId = String(itemObj.id ?? '').trim()
			if (itemId) itemMap.set(itemId, itemObj)
		}
	}

	// 处理每个resolved slot - 保留viewer计算的所有变换数据
	// 2026-08-03：per-slot try/catch，任一条处理失败只跳过本条，其它正常入 finalSlots
	const finalSlots: Record<string, unknown>[] = []
	const processedObjectIds = new Set<string>()
	const perSlotFailures: Array<{ slotId: string; sourceObjectId: string; error: string }> = []

	for (const slot of resolvedSlots) {
		const slotId = String(slot.slotId ?? '').trim()
		const sourceObjectId = String(slot.sourceObjectId ?? '').trim()
		if (!slotId || !sourceObjectId) continue
		try {
			processedObjectIds.add(sourceObjectId)

			// 深拷贝slot，保留所有字段
			const finalSlot: Record<string, unknown> = { ...slot }

			// 确保objectName存在
			if (!String(finalSlot.objectName ?? '').trim()) {
				const layoutItem = itemMap.get(sourceObjectId)
				const binding = bindingByObjectId.get(sourceObjectId)
				finalSlot.objectName =
					String(layoutItem?.name ?? binding?.objectName ?? sourceObjectId).trim() || sourceObjectId
			}

			// 确保displayName存在
			if (!String(finalSlot.displayName ?? '').trim()) {
				const isClone = !!finalSlot.isClone
				const cloneIndex = Number(finalSlot.cloneIndex ?? 0)
				const cloneCount = Number(finalSlot.cloneCount ?? 1)
				const objectName = String(finalSlot.objectName ?? sourceObjectId)
				finalSlot.displayName =
					isClone && cloneCount > 1 ? `${objectName} [${cloneIndex + 1}/${cloneCount}]` : objectName
			}

			// 验证/补充modelBinding
			let modelBinding = finalSlot.modelBinding as Record<string, unknown> | undefined
			const bindingHasValidPath = !!(
				modelBinding &&
				typeof modelBinding === 'object' &&
				hasValidModelPath(modelBinding)
			)
			const TEXTURE_INTEGRITY_KEYS_LOCAL = TEXTURE_INTEGRITY_KEYS
			const existingTextureKeysCount = TEXTURE_INTEGRITY_KEYS_LOCAL.filter((k) => {
				if (!modelBinding || typeof modelBinding !== 'object') return false
				const mb = modelBinding as Record<string, unknown>
				const v = mb[k]
				if (Array.isArray(v)) return v.length > 0
				return String(v ?? '').trim() !== ''
			}).length
			const bindingLacksTextureIntegrity = bindingHasValidPath && existingTextureKeysCount < 3
			const fallbackBinding = bindingByObjectId.get(sourceObjectId)
			if (!bindingHasValidPath || bindingLacksTextureIntegrity) {
				if (fallbackBinding) {
					const copied: Record<string, unknown> = { ...fallbackBinding }
					if (!String(copied.sourceNodeType ?? '').trim()) {
						copied.sourceNodeType = 'model3d'
					}
					modelBinding = copied
					finalSlot.modelBinding = modelBinding
				} else if (!warnings.some((w) => String(w).includes(sourceObjectId))) {
					warnings.push(
						`Slot "${slotId}" (sourceObjectId=${sourceObjectId}) has no slot.modelBinding AND no fallback in connectedModelBindings; known keys: ${
							[...bindingByObjectId.keys()].join(',') || '<empty>'
						}; lacksTextureIntegrity=${String(bindingLacksTextureIntegrity)}`
					)
				}
			}

			// 确保所有变换字段存在且格式正确 - 优先使用relativeTransform（C++端主要使用）
			const relativeTransform = normalizeTransform(
				finalSlot.relativeTransform ?? finalSlot.previewInstanceTransform
			)
			const previewInstanceTransform = normalizeTransform(
				finalSlot.previewInstanceTransform ?? relativeTransform
			)
			const worldTransform = normalizeTransform(
				finalSlot.worldTransform ?? finalSlot.previewInstanceWorldTransform ?? relativeTransform
			)
			const slotTransform = normalizeTransform(finalSlot.slotTransform ?? relativeTransform)
			const meshTransform = normalizeTransform(finalSlot.meshTransform ?? worldTransform)
			const placeholderTransform = finalSlot.placeholderTransform
				? normalizeTransform(finalSlot.placeholderTransform)
				: null

			finalSlot.relativeTransform = relativeTransform
			finalSlot.previewInstanceTransform = previewInstanceTransform
			finalSlot.worldTransform = worldTransform
			finalSlot.slotTransform = slotTransform
			finalSlot.meshTransform = meshTransform
			finalSlot.placeholderTransform = placeholderTransform

			finalSlot.previewInstanceWorldTransform = normalizeTransform(
				finalSlot.previewInstanceWorldTransform ?? worldTransform
			)

			if (finalSlot.parentReference && typeof finalSlot.parentReference === 'object') {
				const pr = finalSlot.parentReference as Record<string, unknown>
				if (pr.relativeTransform) {
					pr.relativeTransform = normalizeTransform(pr.relativeTransform)
				}
			}

			finalSlot.generatedFromBinding = false

			finalSlots.push(finalSlot)
		} catch (err) {
			// ——per-slot 异常隔离：本条失败，其它继续——
			const msg = err instanceof Error ? err.message : String(err ?? 'unknown')
			perSlotFailures.push({ slotId, sourceObjectId, error: msg })
			console.warn(
				`[UnrealExport] prepareResolvedSlotsForExport 单条 slot 处理失败（跳过本条，继续其它）: ` +
					`slotId=${slotId} sourceObjectId=${sourceObjectId}`,
				err
			)
			continue
		}
	}
	if (perSlotFailures.length > 0) {
		warnings.push(
			`prepareResolvedSlotsForExport per-slot failures: ${perSlotFailures.length}. ` +
				perSlotFailures
					.map((f) => `slot=${f.slotId}(obj=${f.sourceObjectId})=${f.error}`)
					.join('; ')
		)
	}

	// 检查是否有connected binding但没有对应resolved slot的情况
	// ——2026-08-03 改为：**自动补齐**缺失的slots（不再只警告不导出）。
	//   单个binding合成失败 try/catch 隔离：一条合成失败不影响其它 binding。
	const synthesizedSlots: Record<string, unknown>[] = []
	const synthesizedFailures: Array<{ objectId: string; error: string }> = []
	for (const [objectId, binding] of bindingByObjectId.entries()) {
		if (!processedObjectIds.has(objectId)) {
			try {
				const layoutItem = itemMap.get(objectId)
				const name = String(binding.objectName ?? layoutItem?.name ?? objectId).trim() || objectId
				warnings.push(
					`Model "${name}" (objectId=${objectId}) has binding but was not found in viewer slots — auto-synthesizing a slot from pure data.`
				)
				const bySourceId = new Map<string, Record<string, unknown>>()
				const synthesisedOne = buildSlotsFromModelBindings([binding], bySourceId, safeLayoutItems)
				if (Array.isArray(synthesisedOne) && synthesisedOne.length > 0) {
					for (const s of synthesisedOne) {
						processedObjectIds.add(objectId)
						synthesizedSlots.push(s)
					}
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err ?? 'unknown')
				synthesizedFailures.push({ objectId, error: msg })
				console.warn(
					`[UnrealExport] prepareResolvedSlotsForExport auto-synthesize 单条失败（跳过本条，继续其它）: objectId=${objectId}`,
					err
				)
				continue
			}
		}
	}
	if (synthesizedFailures.length > 0) {
		warnings.push(
			`prepareResolvedSlotsForExport auto-synthesized failures: ${synthesizedFailures.length}. ` +
				synthesizedFailures.map((f) => `${f.objectId}=${f.error}`).join('; ')
		)
	}
	if (synthesizedSlots.length > 0) {
		console.warn(
			'[UNREAL-EXPORT-TRACE] #5b prepareResolvedSlotsForExport auto-synthesized missing slots'
		)
		console.warn(`synthesizedSlots = ${synthesizedSlots.length}`)
		console.warn(
			`synthesizedSlots[].sourceObjectId summary:`,
			synthesizedSlots.map((s: Record<string, unknown>) => {
				const mb = (s.modelBinding ?? {}) as Record<string, unknown>
				const wt = (s.worldTransform ?? s.slotTransform ?? {}) as Record<string, unknown>
				return {
					slotId: s.slotId,
					sourceObjectId: s.sourceObjectId,
					pos: wt.position,
					mb_objectId: mb.objectId,
					mb_path: String(
						mb.modelAssetUrl ??
							mb.modelAssetProjectRelativePath ??
							mb.modelAssetPath ??
							mb.modelUrl ??
							''
					)
				}
			})
		)
		console.warn(
			`[UNREAL-EXPORT-TRACE][SUMMARY] #5b | synthesized=${synthesizedSlots.length} | sourceObjectIdList=${synthesizedSlots
				.map((s) => String(s.sourceObjectId ?? ''))
				.filter(Boolean)
				.join(',')}`
		)
		console.info(
			`[prepareResolvedSlotsForExport] auto-synthesized ${synthesizedSlots.length} missing slots from connectedModelBindings (viewer slots before=${finalSlots.length}`
		)
		finalSlots.push(...synthesizedSlots)
	}

	// 按slotId排序
	finalSlots.sort((a, b) => String(a.slotId ?? '').localeCompare(String(b.slotId ?? '')))

	console.warn('[UNREAL-EXPORT-TRACE] #5c prepareResolvedSlotsForExport FINAL OUTPUT')
	console.warn(
		`finalSlots = ${finalSlots.length} (bindingByObjectId.size = ${bindingByObjectId.size})`
	)
	console.warn(
		`finalSlots[].sourceObjectId + modelBinding.objectId + pos summary:`,
		finalSlots.map((s: Record<string, unknown>) => {
			const mb = (s.modelBinding ?? {}) as Record<string, unknown>
			const wt = (s.worldTransform ?? s.slotTransform ?? s.relativeTransform ?? {}) as Record<
				string,
				unknown
			>
			return {
				slotId: s.slotId,
				sourceObjectId: s.sourceObjectId,
				displayName: s.displayName,
				mb_objectId: mb.objectId,
				mb_sourceNodeType: mb.sourceNodeType,
				mb_modelAssetProjectRelativePath: mb.modelAssetProjectRelativePath,
				mb_modelAssetUrl: mb.modelAssetUrl,
				pos:
					wt && typeof wt.position === 'object' ? (wt as Record<string, unknown>).position : null,
				generatedFromBinding: s.generatedFromBinding,
				textureIntegrity: (TEXTURE_INTEGRITY_KEYS as unknown as string[]).every(
					(k) => k in mb && mb[k]
				)
					? 'COMPLETE'
					: 'MISSING_KEYS'
			}
		})
	)
	if (warnings.length > 0) {
		console.warn(`warnings[] =`, warnings)
	}
	// [单行非折叠摘要] —— 关键输出
	console.warn(
		`[UNREAL-EXPORT-TRACE][SUMMARY] #5c | finalSlots=${finalSlots.length} | bindingByObjectId.size=${bindingByObjectId.size} | slots[slotId,sourceObjectId,mb_path,pos]=${JSON.stringify(
			finalSlots.map((s) => {
				const mb = (s.modelBinding ?? {}) as Record<string, unknown>
				const wt = (s.worldTransform ?? s.slotTransform ?? s.relativeTransform ?? {}) as Record<
					string,
					unknown
				>
				return {
					slotId: s.slotId,
					sourceObjectId: s.sourceObjectId,
					mb_path: String(
						mb.modelAssetProjectRelativePath ??
							mb.modelAssetUrl ??
							mb.modelAssetPath ??
							mb.modelSourcePath ??
							mb.modelProjectRelativePath ??
							mb.modelUrl ??
							''
					),
					pos:
						wt && typeof wt.position === 'object' ? (wt as Record<string, unknown>).position : null
				}
			})
		)}`
	)

	// 2026-08-04 第 1 层修复：占位 slot 保留策略
	//   ——原逻辑：无模型路径的 slot 直接丢弃，导致墙/地/天花/灯等占位体在 UE 中完全不出现。
	//   ——新逻辑：无模型路径的 slot 标记 isPlaceholder=true 并保留发给 UE，
	//     UE 端根据 isPlaceholder 标记创建 Cube 占位 Actor，保障布局完整性。
	//   ——6 个路径字段任一非空即视为有模型 slot，否则标记为占位 slot。
	const ENABLE_PLACEHOLDER_SLOTS = true // 方案 §六 回滚开关
	const slotsBeforeFilter = finalSlots.length
	const validSlots: Record<string, unknown>[] = []
	const skippedSlotIds: string[] = []
	let placeholderCount = 0
	for (const s of finalSlots) {
		const mb = (s.modelBinding ?? null) as Record<string, unknown> | null
		const hasPath =
			!!mb &&
			typeof mb === 'object' &&
			(!!String(mb.modelAssetProjectRelativePath ?? '').trim() ||
				!!String(mb.modelAssetUrl ?? '').trim() ||
				!!String(mb.modelAssetPath ?? '').trim() ||
				!!String(mb.modelSourcePath ?? '').trim() ||
				!!String(mb.modelProjectRelativePath ?? '').trim() ||
				!!String(mb.modelUrl ?? '').trim())
		if (hasPath) {
			validSlots.push(s)
		} else if (ENABLE_PLACEHOLDER_SLOTS) {
			// 无模型路径的 slot 标记为占位并保留发给 UE
			s.isPlaceholder = true
			s.placeholderReason = 'no-model-binding'
			placeholderCount += 1
			validSlots.push(s)
		} else {
			skippedSlotIds.push(String(s.slotId ?? s.sourceObjectId ?? ''))
		}
	}
	if (skippedSlotIds.length > 0) {
		warnings.push(
			`[prepareResolvedSlotsForExport] Last-mile path-filter: dropped ${skippedSlotIds.length} slots with no asset path (they are likely room-shell placeholders with no upstream 3D model node resources). droppedSlotIds=[${skippedSlotIds.join(',')}]. validSlots=${validSlots.length}`
		)
	}
	if (placeholderCount > 0) {
		warnings.push(
			`[prepareResolvedSlotsForExport] Placeholder slots preserved: ${placeholderCount} slots marked as placeholder (no model binding, will create Cube placeholder Actor in UE).`
		)
	}
	console.warn(
		`[UNREAL-EXPORT-TRACE][SUMMARY] last-mile filter: before=${slotsBeforeFilter}, valid(exported to UE)=${validSlots.length}, placeholder=${placeholderCount}, dropped(no asset path)=${skippedSlotIds.length} dropped=[${skippedSlotIds.join(',')}] placeholderIds=[${validSlots
			.filter((s) => s.isPlaceholder === true)
			.map((s) => String(s.slotId ?? s.sourceObjectId ?? ''))
			.join(',')}] validModelSlotIds=[${validSlots
			.filter((s) => s.isPlaceholder !== true)
			.map((s) => String(s.slotId ?? ''))
			.filter(Boolean)
			.join(',')}]`
	)

	// 2026-08-03 UE 插件路径字段对齐（修复"始终只导入 1 个模型"现场痛点）：
	//   项目约定 UE C++ 侧按 modelSourcePath > modelAssetPath > modelAssetUrl > modelUrl 读取路径，
	//   但前端新链路（Tripo3D / Meshy / 通用 3D 模型）实际只填充了
	//   modelAssetProjectRelativePath（UE 侧并不读取该字段），
	//   导致旧链路 bar_main（已有 modelAssetPath / modelSourcePath）成功导入后，
	//   其余 6 个新链路模型因 UE 侧取不到有效路径而跳过，现场表现为"始终只导入 1 个模型"。
	//
	//   2026-08-03 第三轮修复（根据蓝图数据分析）：
	//   蓝图数据中 4 个有真实模型的 source node，只有 bar_main 的 model3dSettings.modelUrl 是
	//   dweb://（本地），其余 3 个（stool_left/stool_mid/shelves_back）的 model3dSettings.modelUrl
	//   是 https://assets.meshy.ai/...（远端 CDN URL）。这些模型已经本地下载到 Content/Media/，
	//   但 model3dSettings 的本地路径字段（modelSourcePath/modelAssetPath/modelProjectRelativePath）
	//   未被填充，本地路径只存在于 resourcesById[resourceId].projectRelativePath 中。
	//   ——硬约束：绝对禁止使用远端 CDN URL，必须使用本地静态资产路径。
	//   修复：确保 modelAssetProjectRelativePath 有值时，同步回填全部 4 个路径字段，且
	//     dweb:// / meshy远端 / tripo3d远端 / 空字符串 一律替换为本地 relPath。
	const alignedSlotIds: string[] = []
	const alignedDwebUrlCount: Record<string, number> = { n: 0 }
	const replacedRemoteCdnCount = { modelUrl: 0, modelAssetUrl: 0 }
	const backfilledUrlCount = { modelUrl: 0, modelAssetUrl: 0 }
	for (const s of validSlots) {
		// 占位 slot 跳过路径回填（无模型路径需要回填）
		if (s.isPlaceholder === true) continue
		const mb = (s.modelBinding ?? null) as Record<string, unknown> | null
		if (!mb || typeof mb !== 'object') continue
		const relPath = String(mb.modelAssetProjectRelativePath ?? '').trim()
		let touched = false
		if (relPath) {
			// 回填 modelAssetPath（UE 优先级 #2）
			if (!String(mb.modelAssetPath ?? '').trim()) {
				mb.modelAssetPath = relPath
				touched = true
			}
			// 回填 modelSourcePath（UE 优先级 #1）
			if (!String(mb.modelSourcePath ?? '').trim()) {
				mb.modelSourcePath = relPath
				touched = true
			}
			// 回填 modelAssetUrl（UE 优先级 #3）—— dweb:// / 远端CDN / 空字符串 一律替换为本地 relPath
			const assetUrl = String(mb.modelAssetUrl ?? '').trim()
			if (!assetUrl || assetUrl.startsWith('dweb://') || isRemoteCdnUrl(assetUrl)) {
				mb.modelAssetUrl = relPath
				touched = true
				if (!assetUrl) backfilledUrlCount.modelAssetUrl++
				else if (isRemoteCdnUrl(assetUrl)) replacedRemoteCdnCount.modelAssetUrl++
			}
			// 回填 modelUrl（UE 优先级 #4）—— dweb:// / 远端CDN / 空字符串 一律替换为本地 relPath
			const mUrl = String(mb.modelUrl ?? '').trim()
			if (!mUrl || mUrl.startsWith('dweb://') || isRemoteCdnUrl(mUrl)) {
				mb.modelUrl = relPath
				touched = true
				if (mUrl.startsWith('dweb://')) alignedDwebUrlCount.n += 1
				else if (isRemoteCdnUrl(mUrl)) replacedRemoteCdnCount.modelUrl++
				else backfilledUrlCount.modelUrl++
			}
		}
		if (touched) alignedSlotIds.push(String(s.slotId ?? s.sourceObjectId ?? ''))
	}
	if (alignedSlotIds.length > 0) {
		const msg =
			`[prepareResolvedSlotsForExport] UE-path-alignment: backfilled 4 path fields for ${alignedSlotIds.length} slots ` +
			`(from modelAssetProjectRelativePath; replaced dweb:// modelUrl=${alignedDwebUrlCount.n}, replaced remote-CDN modelUrl=${replacedRemoteCdnCount.modelUrl}/modelAssetUrl=${replacedRemoteCdnCount.modelAssetUrl}, backfilled empty modelUrl=${backfilledUrlCount.modelUrl}/modelAssetUrl=${backfilledUrlCount.modelAssetUrl}). alignedSlotIds=[${alignedSlotIds.join(',')}]`
		warnings.push(msg)
	}
	console.warn(
		`[UNREAL-EXPORT-TRACE][SUMMARY] #5e | UE path alignment: slots=${validSlots.length}, aligned(4 fields)=${alignedSlotIds.length}, replaced-dweb-url=${alignedDwebUrlCount.n}, replaced-remote-CDN-modelUrl=${replacedRemoteCdnCount.modelUrl}, replaced-remote-CDN-modelAssetUrl=${replacedRemoteCdnCount.modelAssetUrl}, backfilled-empty-modelUrl=${backfilledUrlCount.modelUrl}, backfilled-empty-modelAssetUrl=${backfilledUrlCount.modelAssetUrl} alignedIds=[${alignedSlotIds.join(',')}]`
	)

	return { slots: validSlots, warnings, placeholderCount }
}

/**
 * 蓝图直扫：完全绕过 model3dSettings 的路径声明，直接从蓝图边表反推每个
 * 占位 objectId 对应的真实本地静态网格绝对路径。
 *
 * 数据流：
 *   edgesById → 筛选 toNodeId===sourceSceneLayoutNodeId 且 toAnchorId 以 `in-model-` 开头的边
 *   → 从 toAnchorId 解析出 objectId（去掉 `in-model-` 前缀）
 *   → fromNodeId → nodesById[fromNodeId]
 *   → 校验 fromNode.type ∈ {model3d, meshy, tripo3d}
 *   → fromNode.resourceId → resourcesById[rid].projectRelativePath
 *   → projectRootPath + relPath 拼接成绝对路径（正斜杠统一转换为反斜杠）
 *
 * 同一 objectId 多条入边时，保留首次解析到的绝对路径（与导出链路"先到先得"一致）。
 *
 * 用户硬约束：不要理会 3D 模型节点对模型来源的声明（远端 URL / 空字段），
 *   按照静态文件落盘位置直接导入静态网格。本函数只负责建立 objectId → 绝对路径 映射，
 *   调用方负责把映射覆盖到 binding 的 4 个标准路径字段。
 *
 * @returns Map<objectId, absoluteFilePath>
 */
export const buildDirectScanAbsPathByObjectId = (params: {
	edgesById: Record<string, unknown> | null | undefined
	nodesById: Record<string, unknown> | null | undefined
	resourcesById: Record<string, unknown> | null | undefined
	sourceSceneLayoutNodeId: string
	projectRootPath: string
}): Map<string, string> => {
	const { sourceSceneLayoutNodeId, projectRootPath } = params
	const result = new Map<string, string>()
	const targetNodeId = String(sourceSceneLayoutNodeId ?? '').trim()
	const root = String(projectRootPath ?? '').trim()
	if (!targetNodeId || !root) return result

	const edgesById = (params.edgesById ?? {}) as Record<string, Record<string, unknown>>
	const nodesById = (params.nodesById ?? {}) as Record<string, Record<string, unknown>>
	const resById = (params.resourcesById ?? {}) as Record<string, Record<string, unknown>>

	const parseObjectIdFromAnchor = (anchorId: string): string => {
		const t = String(anchorId ?? '').trim()
		if (t.startsWith('in-model-')) return t.slice('in-model-'.length)
		return t
	}

	for (const edge of Object.values(edgesById)) {
		if (!edge || typeof edge !== 'object') continue
		const toNodeId = String(edge.toNodeId ?? '').trim()
		if (toNodeId !== targetNodeId) continue
		const toAnchorId = String(edge.toAnchorId ?? '').trim()
		if (!toAnchorId.startsWith('in-model-')) continue
		const objectId = parseObjectIdFromAnchor(toAnchorId)
		if (!objectId) continue
		// 同一 objectId 已有映射时跳过（保留首次解析结果）
		if (result.has(objectId)) continue
		const fromNodeId = String(edge.fromNodeId ?? '').trim()
		if (!fromNodeId) continue
		const fromNode = nodesById[fromNodeId]
		if (!fromNode) continue
		const fromNodeType = String(fromNode.type ?? '').trim()
		if (fromNodeType !== 'model3d' && fromNodeType !== 'meshy' && fromNodeType !== 'tripo3d')
			continue
		// 从节点 resourceId 查 resourcesById
		const rid = String(fromNode.resourceId ?? '').trim()
		if (!rid) continue
		const resource = resById[rid]
		if (!resource) continue
		const relPath = String(resource.projectRelativePath ?? '').trim()
		if (!relPath) continue
		// 相对路径 → 绝对路径（反斜杠规范化，适配 UE 端 FPaths::FileExists）
		const cleanRoot = root.replace(/[\\/]+$/, '')
		const cleanRel = relPath.replace(/^[\\/]+/, '').replace(/\//g, '\\')
		const absPath = cleanRoot + '\\' + cleanRel
		result.set(objectId, absPath)
	}
	return result
}

/**
 * @deprecated Use prepareResolvedSlotsForExport instead - it preserves all transform data from viewer
 */
export const buildSlotsFromModelBindings = (
	connectedModelBindings: unknown[],
	resolvedSlotMap: Map<string, Record<string, unknown>>,
	layoutItems: unknown[]
) => {
	const finalSlots: Record<string, unknown>[] = []
	const itemMap = new Map<string, Record<string, unknown>>()

	const safeLayoutItems = Array.isArray(layoutItems) ? layoutItems : []
	for (const item of safeLayoutItems) {
		if (item && typeof item === 'object') {
			const itemObj = item as Record<string, unknown>
			const itemId = String(itemObj.id ?? '').trim()
			if (itemId) itemMap.set(itemId, itemObj)
		}
	}

	const safeBindings = Array.isArray(connectedModelBindings) ? connectedModelBindings : []
	for (const binding of safeBindings) {
		if (!binding || typeof binding !== 'object') continue
		const bindingObj = binding as Record<string, unknown>
		const objectId = String(bindingObj.objectId ?? '').trim()
		if (!objectId) continue

		if (!hasValidModelPath(bindingObj)) continue

		// 优先按sourceObjectId查找主slot，然后按slotId查找
		let existingSlot = resolvedSlotMap?.get(objectId)
		if (!existingSlot) {
			// 尝试查找clone slot
			for (const [, slot] of resolvedSlotMap?.entries() ?? []) {
				if (String(slot.sourceObjectId ?? '') === objectId) {
					existingSlot = slot
					break
				}
			}
		}

		const layoutItem = itemMap.get(objectId)

		// 优先使用relativeTransform（C++端主要使用的变换）
		let transform = existingSlot?.relativeTransform
		if (!isValidTransform(transform)) {
			transform = existingSlot?.previewInstanceTransform
		}
		// 注意：WorkflowSceneLayoutItem 没有 .transform 字段，
		//   变换数据在 layoutItem.position / .rotation / .scale 顶层字段上。
		if (!isValidTransform(transform) && layoutItem) {
			transform = normalizeLayoutItemTransform(layoutItem) as unknown as Record<string, unknown>
		}
		if (!isValidTransform(transform)) {
			transform = { ...identityTransform }
		}

		const normalizedTransform = normalizeTransform(transform)
		const slotId = String(existingSlot?.slotId ?? objectId)

		finalSlots.push({
			slotId,
			sourceObjectId: objectId,
			objectName:
				String(
					bindingObj.objectName ??
						(layoutItem as Record<string, unknown> | undefined)?.name ??
						objectId
				).trim() || objectId,
			displayName:
				String(
					bindingObj.objectName ??
						(layoutItem as Record<string, unknown> | undefined)?.name ??
						objectId
				).trim() || objectId,
			sourceSlotId: objectId,
			cloneIndex: 0,
			cloneCount: 1,
			isClone: false,
			previewInstanceTransform: normalizedTransform,
			relativeTransform: normalizedTransform,
			worldTransform: normalizedTransform,
			slotTransform: normalizedTransform,
			meshTransform: normalizedTransform,
			previewInstanceWorldTransform: normalizedTransform,
			modelBinding: {
				...bindingObj,
				sourceNodeType: String(bindingObj.sourceNodeType ?? 'model3d'),
				sourceNodeId: String(bindingObj.sourceNodeId ?? '').trim() || undefined
			},
			generatedFromBinding: !existingSlot,
			worldBounds: existingSlot?.worldBounds ?? null,
			placeholderTransform: existingSlot?.placeholderTransform
				? normalizeTransform(existingSlot.placeholderTransform)
				: null,
			placeholderBounds: existingSlot?.placeholderBounds ?? null,
			parentReference: existingSlot?.parentReference
		})
	}

	return finalSlots.sort((a, b) => String(a.slotId ?? '').localeCompare(String(b.slotId ?? '')))
}

export const UNREAL_CONNECTION_FAST_POLL_INTERVAL_MS = 800
export const UNREAL_CONNECTION_SLOW_POLL_INTERVAL_MS = 1500
export const UNREAL_CONNECTION_FAST_POLL_COUNT = 10

export function getUnrealConnectionPollInterval(pollCount: number): number {
	return pollCount < UNREAL_CONNECTION_FAST_POLL_COUNT
		? UNREAL_CONNECTION_FAST_POLL_INTERVAL_MS
		: UNREAL_CONNECTION_SLOW_POLL_INTERVAL_MS
}

// ============================================================================
// 2026-08-03 新链路辅助函数：把 useAIWorkflowUnrealExportActions 中
// viewer resolvedBindings ↔ fallback connectedPrecheckBindings 的合并逻辑
// + connected 真值放宽 + hasAnyPath 扩展 relPath 的判断抽成纯函数，
// 便于独立单测。
// ============================================================================

/**
 * connected 字段放宽形式判断：
 *   true / 1 / 'true' / 'True' / 'TRUE' 均视为"已连接"。
 * （新链路 resolvedModelBindings 里的 connected 可能是 string 'true' 或数字 1）
 */
export function isConnectedTruthy(obj: Record<string, unknown> | null | undefined): boolean {
	if (!obj || typeof obj !== 'object') return false
	const v = obj.connected
	return !!(v === true || v === 1 || String(v ?? '').toLowerCase() === 'true')
}

/**
 * hasAnyPath 的扩展版：除了 4 个绝对路径字段，也接受项目相对路径
 * (modelAssetProjectRelativePath / modelProjectRelativePath)。UE C++ 侧
 * 配合 dwebProjectRootPath 可以把相对路径拼回完整本地文件路径，
 * 所以只有相对路径的 binding 也是合法的（不应该被 filter 掉）。
 */
export function hasAnyPathExtended(obj: Record<string, unknown> | null | undefined): boolean {
	if (!obj || typeof obj !== 'object') return false
	return !!(
		String(obj.modelAssetUrl ?? '').trim() ||
		String(obj.modelAssetPath ?? '').trim() ||
		String(obj.modelSourcePath ?? '').trim() ||
		String(obj.modelUrl ?? '').trim() ||
		String(obj.modelAssetProjectRelativePath ?? '').trim() ||
		String(obj.modelProjectRelativePath ?? '').trim()
	)
}

export type MergeViewerResolvedResult = {
	finalBindingsSource: unknown[]
	usedViewerResolvedBindings: boolean
}

/**
 * 2026-08-03 彻底修正优先级（用户现场：CHAIN DIAG 有 27 条 in-model-* 真实入边，
 *   但 viewer 缓存的 sceneLayoutResolvedModelBindings 只有 9 个过期占位项）：
 *   ——【永远以 connectedPrecheckBindings 为基底】（这是从 Vuex edges 实时重扫
 *     得到的真实蓝图连线绑定，数量 = 场景节点所有 in-model-* 入边数量），
 *     viewer 返回的 sceneLayoutResolvedModelBindings 【只作为字段补充源】
 *     （只拿它里面已经拼好的 file:/// 本地路径 / textureRefs 等字段，
 *     用 objectId 做 key 去"点对点覆盖合并"到 precheck 基底上），
 *     绝对不再让 viewer 缓存决定最终 bindings 数量，
 *     彻底避免"场景里真实渲染了 N 个但导出只剩旧的 9 个"。
 *   只有当 connectedPrecheckBindings 本身为空时（极端旧项目 / 没连线），
 *   才 fallback 到 viewer.sceneLayoutResolvedModelBindings 兜底。
 */
export function mergeViewerResolvedIntoFinalBindings(
	exportData: Record<string, unknown> | null | undefined,
	connectedPrecheckBindings: unknown[],
	_strictUseViewerBindingsWhenPresent = true
): MergeViewerResolvedResult {
	const viewerArr = Array.isArray(
		(exportData as { sceneLayoutResolvedModelBindings?: unknown[] })
			?.sceneLayoutResolvedModelBindings
	)
		? ((exportData as { sceneLayoutResolvedModelBindings: unknown[] })
				.sceneLayoutResolvedModelBindings as unknown[])
		: []
	const precheckArr = Array.isArray(connectedPrecheckBindings) ? connectedPrecheckBindings : []

	// 基底永远是 precheck（从 edges 重扫得到的，数量真实可靠）
	const baseArr = precheckArr.length > 0 ? precheckArr : viewerArr
	const usedViewerAsBase = precheckArr.length === 0 && viewerArr.length > 0

	if (precheckArr.length === 0 || viewerArr.length === 0) {
		// 任何一侧为空就直接拿另一侧，不需要合并
		return {
			finalBindingsSource: baseArr,
			usedViewerResolvedBindings: usedViewerAsBase
		}
	}

	// 构建 viewer binding 的 objectId → binding 索引（只做字段补充用）
	const viewerByObjectId = new Map<string, Record<string, unknown>>()
	for (const vb of viewerArr) {
		if (!vb || typeof vb !== 'object') continue
		const id = String((vb as Record<string, unknown>).objectId ?? '').trim()
		if (id) viewerByObjectId.set(id, vb as Record<string, unknown>)
	}

	// 【以 precheck 为基底】逐个 objectId 合并：precheck 的所有字段保留，
	//   只有 viewer 里"有、且 precheck 对应字段为空"时才从 viewer 抄过来，
	//   绝不丢 precheck 里的任何一条（即使 viewer 里没有这个 objectId）。
	const merged: unknown[] = []
	const TEXTURE_COPY_KEYS = [
		'modelAssetProjectRelativePath',
		'modelProjectRelativePath',
		'modelAssetUrl',
		'modelAssetPath',
		'modelSourcePath',
		'modelUrl',
		'textureRefs',
		'modelMaterialOverrides',
		'modelFormat',
		'modelResourceId',
		'objectName',
		'modelSourceName',
		'sourceNodeId',
		'sourceNodeType'
	] as const
	for (const pb of precheckArr) {
		if (!pb || typeof pb !== 'object') continue
		const precheckObj = { ...(pb as Record<string, unknown>) }
		const id = String(precheckObj.objectId ?? '').trim()
		const vObj = id ? viewerByObjectId.get(id) : undefined
		if (vObj) {
			for (const k of TEXTURE_COPY_KEYS) {
				const preVal = precheckObj[k]
				const preEmpty =
					preVal === null ||
					preVal === undefined ||
					(Array.isArray(preVal) && preVal.length === 0) ||
					(typeof preVal === 'string' && !String(preVal).trim())
				if (!preEmpty) continue // precheck 有值就坚决不覆盖（用户要求以 edges 重扫为准）
				const vVal = vObj[k]
				if (vVal === null || vVal === undefined) continue
				if (Array.isArray(vVal)) {
					if (vVal.length > 0) (precheckObj as Record<string, unknown>)[k] = [...vVal]
				} else if (typeof vVal === 'object') {
					;(precheckObj as Record<string, unknown>)[k] = { ...(vVal as Record<string, unknown>) }
				} else {
					const s = String(vVal ?? '').trim()
					if (s) (precheckObj as Record<string, unknown>)[k] = s
				}
			}
			// connected 字段：只有 precheck 的 connected 非 truthy 时才抄 viewer 的（避免误降级）
			if (!isConnectedTruthy(precheckObj) && isConnectedTruthy(vObj)) {
				precheckObj.connected = true
			}
		}
		merged.push(precheckObj)
	}

	return {
		finalBindingsSource: merged,
		usedViewerResolvedBindings: false // 永远是 precheck 作为基底
	}
}

// =============================================================================
// 2026-08-03 纯数据链路（不依赖 Three.js / viewer / Vue 组件实例）
// =============================================================================

/**
 * 从 WorkflowSceneLayoutItem 顶层字段 (position/rotation/scale) 构造规范化变换。
 * WorkflowSceneLayoutItem 没有 .transform 字段，所以不能写 layoutItem.transform。
 */
export function normalizeLayoutItemTransform(layoutItem: unknown) {
	if (!layoutItem || typeof layoutItem !== 'object') return { ...identityTransform }
	const li = layoutItem as Record<string, unknown>
	const pos =
		li.position && typeof li.position === 'object' ? (li.position as Record<string, unknown>) : null
	const rot =
		li.rotation && typeof li.rotation === 'object' ? (li.rotation as Record<string, unknown>) : null
	const scl =
		li.scale && typeof li.scale === 'object' ? (li.scale as Record<string, unknown>) : null
	return {
		position: {
			x: Number(pos?.x ?? 0) || 0,
			y: Number(pos?.y ?? 0) || 0,
			z: Number(pos?.z ?? 0) || 0
		},
		rotation: {
			yaw: Number(rot?.yaw ?? 0) || 0,
			pitch: Number(rot?.pitch ?? 0) || 0,
			roll: Number(rot?.roll ?? 0) || 0
		},
		quaternion: { x: 0, y: 0, z: 0, w: 1 },
		scale: {
			x: Number(scl?.x ?? 1) || 1,
			y: Number(scl?.y ?? 1) || 1,
			z: Number(scl?.z ?? 1) || 1
		}
	}
}

export type BuildPureDataSlotsResult = {
	slots: Record<string, unknown>[]
	bindingCount: number
}

/**
 * 终极 binding 路径回填：当 6 个标准路径字段全空（hasAnyPathExtended=false）但
 * binding 有 sourceNodeId / modelResourceId 时，从 Vuex store 的 nodesById /
 * resourcesById 反查上游节点真实 outputs / 顶层字段 / resource 条目，只要找到
 * 任何像 3D 模型文件的线索，就回填到 binding 的 6 路径字段 + modelFormat。
 * ——这是"出口前最后一次兜底"，确保 CHAIN DIAG 里所有 27 条 in-model-* 入边
 *   都能拿到真实可导的路径，不再因 connected 初值或 extractModelInfoFromSettings
 *   某一层没命中而被 last-mile hasAnyPath 丢弃。
 */
export function tryBackfillBindingPathsFromStore(
	binding: Record<string, unknown>,
	nodesById: unknown,
	resourcesById: unknown
): Record<string, unknown> {
	if (!binding || typeof binding !== 'object') return binding ?? {}
	if (hasAnyPathExtended(binding)) return binding // 已经有路径就不做多余事
	const b = binding as Record<string, unknown>
	const sourceNodeId = String(b.sourceNodeId ?? '').trim()
	const modelResourceId = String(
		b.modelResourceId ?? (b as { resourceId?: unknown }).resourceId ?? ''
	).trim()

	const nodesMap =
		nodesById && typeof nodesById === 'object' ? (nodesById as Record<string, unknown>) : {}
	const resourcesMap =
		resourcesById && typeof resourcesById === 'object'
			? (resourcesById as Record<string, unknown>)
			: {}

	const candidates: Array<string | null | undefined> = []
	let fallbackFormat: WorkflowModelFormat = 'glb'

	// ---- sourceNodeId → 从上游节点 outputs / 顶层字段硬扫 ----
	if (sourceNodeId && nodesMap[sourceNodeId]) {
		const fn = nodesMap[sourceNodeId] as Record<string, unknown>
		// ① outputs 所有 out-* 锚点的 resolved / cached / value
		if (Array.isArray(fn.outputs)) {
			for (const out of fn.outputs as unknown[]) {
				if (!out || typeof out !== 'object') continue
				const o = out as Record<string, unknown>
				for (const src of [o.resolved, o.cached, o.value]) {
					if (!src) continue
					if (typeof src === 'string') {
						candidates.push(src)
					} else if (typeof src === 'object') {
						const s = src as Record<string, unknown>
						candidates.push(
							String(s.modelAssetProjectRelativePath ?? s.modelProjectRelativePath ?? '').trim() ||
								null
						)
						candidates.push(String(s.modelAssetPath ?? s.modelSourcePath ?? '').trim() || null)
						candidates.push(String(s.modelAssetUrl ?? s.modelUrl ?? '').trim() || null)
						candidates.push(
							String(s.projectRelativePath ?? s.absolutePath ?? s.sourcePath ?? '').trim() || null
						)
						candidates.push(String(s.assetUrl ?? s.preferredUrl ?? s.url ?? '').trim() || null)
						const fmt = detectModelFormatFromPath(
							String(s.modelAssetProjectRelativePath ?? s.modelAssetUrl ?? s.url ?? '')
						)
						if (fmt) fallbackFormat = fmt
					}
				}
			}
		}
		// ② 节点顶层任一字段（新链路 decompose 经常直接塞顶层）
		const topKeys = [
			'modelAssetProjectRelativePath',
			'modelProjectRelativePath',
			'modelAssetUrl',
			'modelUrl',
			'modelAssetPath',
			'modelSourcePath',
			'resolvedModelPath',
			'localAssetUrl',
			'localAssetPath'
		] as const
		for (const k of topKeys) {
			const v = String((fn as Record<string, unknown>)[k] ?? '').trim()
			if (v) candidates.push(v)
			const fmt = detectModelFormatFromPath(v)
			if (fmt) fallbackFormat = fmt
		}
		// ②b 深嵌套 settings 字段直接读取（AIPlan/02 方案 §5.4）：
		//   与 connectedSceneLayoutModelBindings 的类型专用提取对齐，
		//   确保出口前最后一次兜底也能读到 meshy/tripo3d/model3d 深字段真实资产路径。
		const meshySettings = fn.meshySettings as Record<string, unknown> | undefined
		if (meshySettings && typeof meshySettings === 'object') {
			const relation =
				meshySettings.meshyRelationSummary && typeof meshySettings.meshyRelationSummary === 'object'
					? (meshySettings.meshyRelationSummary as Record<string, unknown>)
					: {}
			const output =
				meshySettings.meshyOutputSummary && typeof meshySettings.meshyOutputSummary === 'object'
					? (meshySettings.meshyOutputSummary as Record<string, unknown>)
					: {}
			candidates.push(
				String(
					relation.effectiveLocalAssetUrl ??
						meshySettings.meshyOutputAssetUrl ??
						output.assetUrl ??
						''
				).trim() || null
			)
			candidates.push(
				String(
					relation.effectiveLocalAssetPath ??
						meshySettings.meshyOutputAssetPath ??
						output.assetPath ??
						''
				).trim() || null
			)
			candidates.push(
				String(relation.effectivePreferredModelUrl ?? output.preferredUrl ?? '').trim() || null
			)
			const fmt = detectModelFormatFromPath(
				String(relation.effectiveLocalAssetUrl ?? output.assetUrl ?? '')
			)
			if (fmt) fallbackFormat = fmt
		}
		const tripo3dSettings = fn.tripo3dSettings as Record<string, unknown> | undefined
		if (tripo3dSettings && typeof tripo3dSettings === 'object') {
			const relation =
				tripo3dSettings.tripo3dRelationSummary &&
				typeof tripo3dSettings.tripo3dRelationSummary === 'object'
					? (tripo3dSettings.tripo3dRelationSummary as Record<string, unknown>)
					: {}
			const output =
				tripo3dSettings.tripo3dOutputSummary &&
				typeof tripo3dSettings.tripo3dOutputSummary === 'object'
					? (tripo3dSettings.tripo3dOutputSummary as Record<string, unknown>)
					: {}
			candidates.push(
				String(
					relation.effectiveLocalAssetUrl ??
						tripo3dSettings.tripo3dOutputAssetUrl ??
						output.assetUrl ??
						''
				).trim() || null
			)
			candidates.push(
				String(
					relation.effectiveLocalAssetPath ??
						tripo3dSettings.tripo3dOutputAssetPath ??
						output.assetPath ??
						''
				).trim() || null
			)
			candidates.push(
				String(relation.effectivePreferredModelUrl ?? output.preferredUrl ?? '').trim() || null
			)
			const fmt = detectModelFormatFromPath(
				String(relation.effectiveLocalAssetUrl ?? output.assetUrl ?? '')
			)
			if (fmt) fallbackFormat = fmt
		}
		const model3dSettingsDeep = fn.model3dSettings as Record<string, unknown> | undefined
		if (model3dSettingsDeep && typeof model3dSettingsDeep === 'object') {
			candidates.push(String(model3dSettingsDeep.modelAssetUrl ?? '').trim() || null)
			candidates.push(String(model3dSettingsDeep.modelAssetPath ?? '').trim() || null)
			candidates.push(String(model3dSettingsDeep.modelUrl ?? '').trim() || null)
			candidates.push(String(model3dSettingsDeep.modelSourcePath ?? '').trim() || null)
			candidates.push(
				String(model3dSettingsDeep.modelAssetProjectRelativePath ?? '').trim() || null
			)
			candidates.push(String(model3dSettingsDeep.modelProjectRelativePath ?? '').trim() || null)
			const fmt = detectModelFormatFromPath(
				String(model3dSettingsDeep.modelAssetUrl ?? model3dSettingsDeep.modelAssetPath ?? '')
			)
			if (fmt) fallbackFormat = fmt
		}
		// ③ 从节点 .resourceId 反查 resourcesById（AIPlan/02 方案 §5.4：补全 meshy/tripo3d resourceId）
		const fnResId = String(
			fn.resourceId ??
				(fn.model3dSettings as Record<string, unknown> | undefined)?.resourceId ??
				(fn.meshySettings as Record<string, unknown> | undefined)?.resourceId ??
				(fn.tripo3dSettings as Record<string, unknown> | undefined)?.resourceId ??
				''
		).trim()
		if (fnResId && resourcesMap[fnResId]) {
			const r = resourcesMap[fnResId] as Record<string, unknown>
			candidates.push(String(r.projectRelativePath ?? '').trim() || null)
			candidates.push(String(r.absolutePath ?? '').trim() || null)
			candidates.push(String(r.sourcePath ?? '').trim() || null)
			candidates.push(String(r.url ?? '').trim() || null)
			candidates.push(String(r.assetUrl ?? '').trim() || null)
			candidates.push(String(r.localUrl ?? '').trim() || null)
			const fmt = detectModelFormatFromPath(
				String(r.projectRelativePath ?? r.url ?? r.absolutePath ?? '')
			)
			if (fmt) fallbackFormat = fmt
		}
	}
	// ---- modelResourceId 单独扫资源 ----
	if (modelResourceId && resourcesMap[modelResourceId]) {
		const r = resourcesMap[modelResourceId] as Record<string, unknown>
		candidates.push(String(r.projectRelativePath ?? '').trim() || null)
		candidates.push(String(r.absolutePath ?? '').trim() || null)
		candidates.push(String(r.sourcePath ?? '').trim() || null)
		candidates.push(String(r.url ?? '').trim() || null)
		candidates.push(String(r.assetUrl ?? '').trim() || null)
		candidates.push(String(r.localUrl ?? '').trim() || null)
		const fmt = detectModelFormatFromPath(
			String(r.projectRelativePath ?? r.url ?? r.absolutePath ?? '')
		)
		if (fmt) fallbackFormat = fmt
	}
	const best = pickBestModelUrlFromCandidates(candidates as Array<string | null | undefined>)
	if (!best) return b // 真·没找到，不填了
	const overrideFormat = detectModelFormatFromPath(best) || fallbackFormat
	// ---- 解析 best 成 6 路径字段 ----
	const relPath = (() => {
		const m1 = /\?(?:.*&)?(?:path|relativePath|assetPath|filePath)=([^&]+)/.exec(best)
		if (m1 && m1[1]) {
			try {
				return decodeURIComponent(m1[1]).split('?')[0].split('#')[0]
			} catch {
				/* ignore */
			}
		}
		if (/^Content[\\/]/i.test(best)) return best.replace(/\\/g, '/')
		const m2 = /^file:\/\/\/+([a-zA-Z]:[\\/].+)$/.exec(best)
		if (m2 && m2[1]) return m2[1].replace(/\\/g, '/')
		return best.replace(/\\/g, '/')
	})()
	const isRel = /^Content[\\/]/i.test(relPath)
	b.modelUrl = best
	b.modelAssetUrl = best
	if (!isRel) {
		if (!String(b.modelSourcePath ?? '').trim()) b.modelSourcePath = relPath
		if (!String(b.modelAssetPath ?? '').trim()) b.modelAssetPath = relPath
	} else {
		if (!String(b.modelProjectRelativePath ?? '').trim()) b.modelProjectRelativePath = relPath
		if (!String(b.modelAssetProjectRelativePath ?? '').trim())
			b.modelAssetProjectRelativePath = relPath
	}
	if (!String(b.modelFormat ?? '').trim()) b.modelFormat = overrideFormat
	b.connected = true // 兜底找到路径了，connected 升级为 true（便于下游标记）
	return b
}

/**
 * 纯数据构造器：直接用 layoutItems × resolvedModelBindings 合成 N 条 resolved slots。
 * 不需要 canvasRef / Three.js / viewer / 组件实例挂载。fillMode 展开 clone 与预览
 * 渲染端 SceneLayoutPreviewViewer.buildLayoutInstanceSlots() 保持一致。
 */
export function buildPureDataSlotsForUnreal(
	layoutItems: unknown[],
	resolvedBindings: unknown[],
	bindingPathBackfillCtx?: {
		nodesById?: unknown
		resourcesById?: unknown
	}
): BuildPureDataSlotsResult {
	const bindingByObjectId = new Map<string, Record<string, unknown>>()
	// 2026-08-03: 新增二级索引：按 inputAnchorId (in-model-xxx) 和 anchorSuffix (xxx) 也能反查到 binding，
	//   避免 layoutItem.id 与 binding.objectId 因命名差异（大小写/下划线/连字符/clone后缀）
	//   导致 "有真实上游 3D 节点产出的静态资产，但 buildPureDataSlotsForUnreal 跳过了"。
	//   ——现场现象：SceneLayout CHAIN DIAG 显示 27 条 in-model-* 入边，但 resolvedBindings 只有 9 条，
	//     就是因为 connectedSceneLayoutModelBindings 之前没处理 tripo3d 类型，修完后这里还必须正确匹配。
	const bindingByAnchorId = new Map<string, Record<string, unknown>>()
	const bindingByAnchorSuffix = new Map<string, Record<string, unknown>>()
	const safeBindings = Array.isArray(resolvedBindings) ? resolvedBindings : []
	// 2026-08-03: Ultimate Backfill —— 建索引之前就对每个 binding 跑一次
	//   tryBackfillBindingPathsFromStore。这样 ① bindingByObjectId 里存的就是"带路径的"，
	//   ② hasAnyPathExtended 判定会通过；不再因 6 路径字段初值空而漏掉 18/27 个新链路模型。
	const backfillNodes = bindingPathBackfillCtx?.nodesById
	const backfillResources = bindingPathBackfillCtx?.resourcesById
	const processedBindings: unknown[] =
		backfillNodes || backfillResources
			? safeBindings.map((b) =>
					tryBackfillBindingPathsFromStore(
						(b ?? {}) as Record<string, unknown>,
						backfillNodes,
						backfillResources
					)
				)
			: safeBindings
	for (const b of processedBindings) {
		if (!b || typeof b !== 'object') continue
		const bb = b as Record<string, unknown>
		const id = String(bb.objectId ?? '').trim()
		if (id) bindingByObjectId.set(id, bb)
		const anchorId = String(bb.inputAnchorId ?? '').trim()
		if (anchorId) {
			bindingByAnchorId.set(anchorId, bb)
			const m = /^in-model-(.+)$/i.exec(anchorId)
			const suffix = m && m[1] ? String(m[1]).trim() : ''
			if (suffix) bindingByAnchorSuffix.set(suffix, bb)
		}
	}
	/** 先剥掉 __clone_N / _clone_N 这种克隆后缀（如果有的话）。
	 *  layoutItems 里的 shelves_back 克隆出来的子项 id 是 shelves_back__clone_0，
	 *  但 upstream binding 的 objectId 永远是 shelves_back（不区分克隆），
	 *  所以必须先去后缀再查索引，否则所有克隆项都会被"没有上游绑定→不导出"。
	 */
	const stripCloneSuffix = (raw: string): string => {
		const s = String(raw ?? '').trim()
		if (!s) return ''
		// 常见两种写法：__clone_0 或 _clone_0（大小写不敏感）
		let m = /^(.+?)__?clone_\d+$/i.exec(s)
		if (m && m[1]) return String(m[1]).trim()
		// 兜底：取 __ 或 _ 出现克隆关键字之前的部分
		m = /^(.+?)(?:__|_)clone(?:__|_)?\d*$/i.exec(s)
		if (m && m[1]) return String(m[1]).trim()
		return s
	}
	/** 按 objectId / anchorId / anchorSuffix 逐级查找，三者任一命中即可（先命中优先级更高）。
	 *  2026-08-03 关键 Bug 修复：
	 *   ① 对于 shelves_back__clone_N 这种克隆 layoutItem，自动剥离克隆后缀后再查一次，
	 *      确保"同一个上游 3D 模型节点 fill 出来的 N 个克隆实例"都能正确找到 binding。
	 *   ② 定义了这个函数后，循环体内必须【实际调用】它，
	 *      绝不能再写 `bindingByObjectId.get(objectId)` 这种只查一级索引的代码，
	 *      否则所有 anchorId/anchorSuffix/忽略大小写/去克隆后缀的兜底都不生效。
	 */
	function resolveBinding(objectId: string): Record<string, unknown> | null {
		const key = String(objectId ?? '').trim()
		if (!key) return null
		const tryKeys: string[] = [key]
		const stripped = stripCloneSuffix(key)
		if (stripped && stripped !== key) tryKeys.push(stripped)
		for (const k of tryKeys) {
			if (bindingByObjectId.has(k)) return bindingByObjectId.get(k) ?? null
			const anchorKey = `in-model-${k}`
			if (bindingByAnchorId.has(anchorKey)) return bindingByAnchorId.get(anchorKey) ?? null
			if (bindingByAnchorSuffix.has(k)) return bindingByAnchorSuffix.get(k) ?? null
			// 兜底：忽略大小写匹配
			const lowerK = k.toLowerCase()
			for (const [bk, bv] of bindingByObjectId.entries()) {
				if (bk.toLowerCase() === lowerK) return bv
			}
			for (const [bk, bv] of bindingByAnchorSuffix.entries()) {
				if (bk.toLowerCase() === lowerK) return bv
			}
		}
		return null
	}
	const builtSlots: Record<string, unknown>[] = []
	let boundItemCount = 0

	console.warn('[UNREAL-EXPORT-TRACE] #2a buildPureDataSlotsForUnreal entry')
	console.warn(`layoutItems (input) = ${Array.isArray(layoutItems) ? layoutItems.length : 0}`)
	console.warn(`resolvedBindings (input) = ${safeBindings.length}`)
	console.warn(
		`indexes: bindingByObjectId=${bindingByObjectId.size}, bindingByAnchorId=${bindingByAnchorId.size}, bindingByAnchorSuffix=${bindingByAnchorSuffix.size}`
	)
	console.warn(
		`resolvedBindings[].objectId summary (hasValidPath):`,
		safeBindings.map((b: unknown) => {
			const obj = (b ?? {}) as Record<string, unknown>
			return {
				objectId: String(obj.objectId ?? ''),
				sourceNodeType: String(obj.sourceNodeType ?? ''),
				connected: obj.connected,
				hasValidPath: hasValidModelPath(obj),
				path: String(
					obj.modelAssetUrl ??
						obj.modelAssetProjectRelativePath ??
						obj.modelAssetPath ??
						obj.modelUrl ??
						''
				)
			}
		})
	)
	// 2026-08-03: 用 processedBindings（已跑 Ultimate Backfill）打印，不是 safeBindings（初值），
	//   这样用户在 log.md 里看 #2a 的 hasValidPath 比例就能直接知道"这次兜底到底救回了多少个模型"。
	const diagBindings = processedBindings
	const backfilledCount = diagBindings.filter((b) => {
		const obj = (b ?? {}) as Record<string, unknown>
		return (
			hasAnyPathExtended(obj) &&
			safeBindings.every((orig) => {
				const o = (orig ?? {}) as Record<string, unknown>
				if (String(o.objectId ?? '') !== String(obj.objectId ?? '')) return true
				return !hasAnyPathExtended(o)
			})
		)
	}).length
	console.warn(
		`[UNREAL-EXPORT-TRACE][SUMMARY] #2a | layoutItems=${Array.isArray(layoutItems) ? layoutItems.length : 0} | rawBindings=${safeBindings.length} | afterBackfill=${diagBindings.length} | backfilledNewPaths=${backfilledCount} | ids=[${diagBindings
			.map((b) => String((b as Record<string, unknown>)?.objectId ?? ''))
			.filter(Boolean)
			.join(',')}]`
	)

	const safeLayoutItems = Array.isArray(layoutItems) ? layoutItems : []
	// 2026-08-03 关键 Bug 修复：循环体内必须【实际调用 resolveBinding(objectId)】，
	//   才能让前面构建的"二级索引 + anchorSuffix + 忽略大小写 + 去克隆后缀"全部生效。
	//   之前写成 `bindingByObjectId.get(objectId)` 只会查一级 objectId 精确匹配，
	//   导致 ① shelves_back 克隆出的 __clone_0/1/2/3 全部被 skip（找不到binding），
	//        ② 通过 inputAnchorId=in-model-xxx 关联的 layoutItem 也全部被 skip，
	//   最终表现为"SceneLayout里 N 个真实渲染的模型，导出时只有第1个 bar_main 能导入"。
	// ——而且只要 resolveBinding 返回值【任一路径字段非空】(hasAnyPathExtended)就导出，
	//   不再额外要求 connected 必须是 truthy（避免某些节点 connected 未及时刷新导致漏导）。
	const skippedNoBinding: string[] = []
	const skippedNoPath: string[] = []
	for (const rawItem of safeLayoutItems) {
		if (!rawItem || typeof rawItem !== 'object') continue
		const item = rawItem as Record<string, unknown>
		const objectId = String(item.id ?? '').trim()
		if (!objectId) continue
		const binding = resolveBinding(objectId)
		if (!binding) {
			skippedNoBinding.push(objectId)
			continue // 完全没有任何索引能匹配到的 binding（房间壳子天花板/地板/墙这类真·占位项才会走这里）
		}
		if (!hasAnyPathExtended(binding)) {
			skippedNoPath.push(objectId)
			continue // 匹配到了 binding，但 6 个路径字段全是空（没有真实静态资产可导，不浪费 UE 端导入尝试）
		}
		boundItemCount++
		const sourceName = String(item.name ?? binding.objectName ?? objectId).trim() || objectId

		const baseT = normalizeLayoutItemTransform(item)
		const orientationFix =
			item.orientationFix && typeof item.orientationFix === 'object'
				? (item.orientationFix as Record<string, unknown>)
				: null
		const fitMode = (['oriented', 'filled', 'forced', 'normal'] as const).includes(
			(item.fitMode as 'oriented' | 'filled' | 'forced' | 'normal' | undefined) ?? 'normal'
		)
			? ((item.fitMode as 'oriented' | 'filled' | 'forced' | 'normal') ?? 'normal')
			: ('normal' as const)
		let fillMode: 'single' | 'fill-x' | 'fill-y' | 'fill-z' = 'single'
		if (item.fillMode === 'fill-x' || item.fillMode === 'fill-y' || item.fillMode === 'fill-z')
			fillMode = item.fillMode
		const fillCountRaw = Number(item.fillCount ?? 0) || 0
		const fillAxisScaleRaw = Number(item.fillAxisScale ?? 1) || 1
		const instanceCount = fillMode === 'single' ? 1 : Math.max(1, Math.floor(fillCountRaw))
		const fillAxisIndex = fillMode === 'fill-x' ? 0 : fillMode === 'fill-y' ? 1 : 2

		for (let i = 0; i < instanceCount; i++) {
			const isClone = instanceCount > 1
			const displayName = isClone ? `${sourceName} [${i + 1}/${instanceCount}]` : sourceName
			const instanceOffset = { x: 0, y: 0, z: 0 }
			if (isClone) {
				const offsetAlongAxis = i * fillAxisScaleRaw
				if (fillAxisIndex === 0) instanceOffset.x = offsetAlongAxis
				else if (fillAxisIndex === 1) instanceOffset.y = offsetAlongAxis
				else instanceOffset.z = offsetAlongAxis
			}
			const worldT: Record<string, unknown> = {
				position: {
					x: baseT.position.x + instanceOffset.x,
					y: baseT.position.y + instanceOffset.y,
					z: baseT.position.z + instanceOffset.z
				},
				rotation: { ...baseT.rotation },
				quaternion: { ...baseT.quaternion },
				scale: { ...baseT.scale }
			}
			const slotId = isClone ? `${objectId}__clone_${i}` : objectId
			const materialOverrides = Array.isArray(item.materialOverrides)
				? (item.materialOverrides as unknown[]).map((e) => ({ ...(e as Record<string, unknown>) }))
				: undefined
			const relationTags = Array.isArray(item.relationTags)
				? [...(item.relationTags as unknown[])]
				: undefined
			const modelBindingCopy: Record<string, unknown> = { ...binding }
			if (!String(modelBindingCopy.sourceNodeType ?? '').trim())
				modelBindingCopy.sourceNodeType = 'model3d'
			if (!String(modelBindingCopy.sourceNodeId ?? '').trim()) {
				const src = String((binding as { sourceNodeId?: unknown }).sourceNodeId ?? '').trim()
				if (src) modelBindingCopy.sourceNodeId = src
			}
			builtSlots.push({
				slotId,
				sourceObjectId: objectId,
				sourceSlotId: objectId,
				objectName: sourceName,
				displayName,
				cloneIndex: i,
				cloneCount: instanceCount,
				isClone,
				generatedFromBinding: true,
				pureDataBuilt: true,
				orientationFix: orientationFix ? { ...orientationFix } : null,
				fitMode,
				fillMode,
				fillCount: fillMode !== 'single' ? fillCountRaw : undefined,
				fillAxisScale: fillMode !== 'single' ? fillAxisScaleRaw : undefined,
				materialOverrides,
				relationTags,
				notes: String(item.fitMessage ?? item.description ?? '').trim() || undefined,
				modelBinding: modelBindingCopy,
				slotTransform: { ...worldT },
				meshTransform: { ...worldT },
				previewInstanceTransform: { ...worldT },
				previewInstanceWorldTransform: { ...worldT },
				worldTransform: { ...worldT },
				relativeTransform: { ...worldT },
				worldBounds: null,
				placeholderTransform: null,
				placeholderBounds: null,
				parentReference: null
			})
		}
	}
	builtSlots.sort((a, b) => String(a.slotId ?? '').localeCompare(String(b.slotId ?? '')))

	console.warn('[UNREAL-EXPORT-TRACE] #2b buildPureDataSlotsForUnreal output')
	console.warn(`builtSlots = ${builtSlots.length}, boundItemCount = ${boundItemCount}`)
	console.warn(
		`builtSlots[].sourceObjectId + pos + mb summary:`,
		builtSlots.map((s: Record<string, unknown>) => {
			const mb = (s.modelBinding ?? {}) as Record<string, unknown>
			const wt = (s.worldTransform ?? {}) as Record<string, unknown>
			return {
				slotId: s.slotId,
				sourceObjectId: s.sourceObjectId,
				displayName: s.displayName,
				isClone: s.isClone,
				cloneIndex: s.cloneIndex,
				cloneCount: s.cloneCount,
				position: wt.position ?? null,
				mb_objectId: mb.objectId,
				mb_sourceNodeType: mb.sourceNodeType,
				mb_modelAssetProjectRelativePath: mb.modelAssetProjectRelativePath,
				mb_modelAssetUrl: mb.modelAssetUrl
			}
		})
	)
	// 2026-08-03 现场可观测性：把 skippedNoBinding / skippedNoPath 的明细也打进单行 SUMMARY 日志，
	//   下一次复制到 log.md 时不需要展开 Console group 就能直接看"具体哪个 objectId 没找到 binding
	//   / 哪个找到了 binding 但 6 路径字段全空"。否则用户每次只看到 builtSlots=7 不知道 27 个里漏了谁。
	console.warn(
		`[UNREAL-EXPORT-TRACE][SUMMARY] #2b | builtSlots=${builtSlots.length}, boundItemCount=${boundItemCount} | skippedNoBinding(${skippedNoBinding.length})=[${skippedNoBinding.join(',')}] | skippedNoPath(${skippedNoPath.length})=[${skippedNoPath.join(',')}] | sourceObjectIdList=${builtSlots
			.map((s) => String(s.sourceObjectId ?? ''))
			.filter(Boolean)
			.join(',')}`
	)

	return { slots: builtSlots, bindingCount: boundItemCount }
}

/**
 * 构造完整的 WorkflowUnrealResolvedLayoutExport，纯数据链路调用方（例如
 * AIWorkflowPage.vue getResolvedLayoutForUnreal 的 store-data fallback）
 * 可以直接使用此函数生成 { ok: true, exportData } 返回值。
 */
export function buildPureDataResolvedLayoutExport(
	layoutItems: unknown[],
	resolvedBindings: unknown[],
	bindingPathBackfillCtx?: { nodesById?: unknown; resourcesById?: unknown }
) {
	const built = buildPureDataSlotsForUnreal(layoutItems, resolvedBindings, bindingPathBackfillCtx)
	const safeItems = Array.isArray(layoutItems) ? layoutItems : []
	const safeBindings = Array.isArray(resolvedBindings) ? resolvedBindings : []
	const warnings: string[] = []
	const msg =
		`[PureDataFallback] buildPureDataSlotsForUnreal produced slots=${built.slots.length} ` +
		`(layoutItems=${safeItems.length}, resolvedBindings=${safeBindings.length}, ` +
		`bound-items=${built.bindingCount}) — no Vue component / Three.js render required`
	console.info(msg)
	warnings.push(msg)
	return {
		generatedAt: Date.now(),
		sourceItemCount: safeItems.length,
		slotCount: built.slots.length,
		actorOrigin: { x: 0, y: 0, z: 0 },
		warnings,
		slots: built.slots as unknown[],
		sceneLayoutResolvedModelBindings: safeBindings
	}
}
