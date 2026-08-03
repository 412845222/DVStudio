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
): { slots: Record<string, unknown>[]; warnings: string[] } => {
	// 2026-08-03 贴图完整性关键字段（提升到函数作用域，便于最终 trace 也能使用）
	const TEXTURE_INTEGRITY_KEYS = [
		'modelAssetProjectRelativePath',
		'modelProjectRelativePath',
		'textureRefs',
		'modelMaterialOverrides',
		'modelFormat'
	] as const
	const warnings: string[] = []
	const { slots: resolvedSlots, bySourceObjectId } = normalizeResolvedLayoutSlots(rawSlots)

	console.groupCollapsed('[UNREAL-EXPORT-TRACE] #5a prepareResolvedSlotsForExport entry')
	console.log(`rawSlots = ${rawSlots.length}`)
	console.log(`resolvedSlots (after normalizeResolvedLayoutSlots) = ${resolvedSlots.length}`)
	console.log(
		`normalized resolvedSlots[].sourceObjectId summary:`,
		resolvedSlots.map((s: Record<string, unknown>) => ({
			slotId: s.slotId,
			sourceObjectId: s.sourceObjectId,
			hasModelBinding: !!s.modelBinding,
			mb_objectId:
				(s.modelBinding && typeof s.modelBinding === 'object')
					? String((s.modelBinding as Record<string, unknown>).objectId)
					: '',
			mb_sourceNodeType:
				(s.modelBinding && typeof s.modelBinding === 'object')
					? String((s.modelBinding as Record<string, unknown>).sourceNodeType)
					: ''
		}))
	)
	const safeBindings = Array.isArray(connectedModelBindings) ? connectedModelBindings : []
	console.log(`connectedModelBindings (rawBindings: ${safeBindings.length}`,
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
	console.groupEnd()
	// [单行非折叠摘要] —— 保证复制到 log.md 也能直接看，不需要展开 group
	console.log(
		`[UNREAL-EXPORT-TRACE][SUMMARY] #5a | rawSlots=${rawSlots.length} | normalizedResolvedSlots=${resolvedSlots.length} | sourceObjectIdList=${resolvedSlots.map((s) => String(s.sourceObjectId ?? '')).filter(Boolean).join(',')} | connectedModelBindings=${safeBindings.length}[${safeBindings.map((b) => String((b as Record<string, unknown>)?.objectId ?? '')).filter(Boolean).join(',')}]`
	)

	// 建立binding索引（用户要求彻底放宽，不要过度过滤）：
	//   取消 hasValidModelPath 作为录入门槛，改为：
	//     a) 只要 binding 的 objectId 出现在 resolvedSlots 的 sourceObjectId 中
	//        （这就是 SceneLayoutNode 真正渲染过的模型，即使 path 字段缺失，
	//         下面的补齐循环也会尝试从 rawSlot.modelBinding 偷路径）
	//     b) 或 binding 自身任一路径字段有非空值（hasAnyPathExtended）
	//   两种方式都 OK，全量透传 modelBinding 字段，不做裁剪。
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
		if (!objectId) continue
		const inResolvedWhitelist = resolvedSourceObjectIds.has(objectId)
		const hasAnyPath = hasAnyPathExtended(b)
		if (!inResolvedWhitelist && !hasAnyPath) continue
		bindingByObjectId.set(objectId, b)
	}

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
	const finalSlots: Record<string, unknown>[] = []
	const processedObjectIds = new Set<string>()

	for (const slot of resolvedSlots) {
		const slotId = String(slot.slotId ?? '').trim()
		const sourceObjectId = String(slot.sourceObjectId ?? '').trim()
		if (!slotId || !sourceObjectId) continue

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
		const bindingHasValidPath = !!(modelBinding && typeof modelBinding === 'object' && hasValidModelPath(modelBinding))
		// 2026-08-03：即使 slot.modelBinding 已经存在（比如 viewer 侧按旧 8 字段白名单写了），
		//   只要它"缺少贴图完整性字段"——modelAssetProjectRelativePath/textureRefs/
		//   modelMaterialOverrides/modelFormat/modelProjectRelativePath 中有任何 2 项缺失，
		//   就强制用 resolvedBindings 里的全量 binding 覆盖它。这样能修复用户现场最常见的
		//   "第一个模型能出现在导出里但贴图全白"：viewer 把 8 字段写了，
		//   hasValidModelPath 就认为它有效，从而挡住了 fallback；导致贴图引用永远不会被补。
		const TEXTURE_INTEGRITY_KEYS_LOCAL = TEXTURE_INTEGRITY_KEYS
		const existingTextureKeysCount = TEXTURE_INTEGRITY_KEYS_LOCAL.filter(
			(k) => {
				if (!modelBinding || typeof modelBinding !== 'object') return false
				const mb = modelBinding as Record<string, unknown>
				const v = mb[k]
				if (Array.isArray(v)) return v.length > 0
				return String(v ?? '').trim() !== ''
			}
		).length
		const bindingLacksTextureIntegrity = bindingHasValidPath && existingTextureKeysCount < 3
		const fallbackBinding = bindingByObjectId.get(sourceObjectId)
		if (!bindingHasValidPath || bindingLacksTextureIntegrity) {
			if (fallbackBinding) {
				// 2026-08-03 新链路：fallbackBinding 直接全量 spread 拷贝。
				// SceneLayoutNode.vue 已经把 resolvedModelBindings 解析成预览 Three.js
				// 真正成功加载的 binding，这里不做任何二次字段裁剪，才能保证：
				//   ① 导出的模型数量与预览一致（不会只剩第一个）
				//   ② 分离打包的 gltf + bin + png 的贴图引用
				//     (textureRefs)、材质覆盖 (modelMaterialOverrides)、
				//     项目相对路径 (modelAssetProjectRelativePath /
				//     modelProjectRelativePath) 等不被白名单过滤掉，造成白模。
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
		// viewer返回的relativeTransform是相对于actorOrigin的变换，这是C++端摆放Actor的关键
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

		// 确保previewInstanceWorldTransform存在
		finalSlot.previewInstanceWorldTransform = normalizeTransform(
			finalSlot.previewInstanceWorldTransform ?? worldTransform
		)

		// 保留其他元数据字段
		if (finalSlot.parentReference && typeof finalSlot.parentReference === 'object') {
			// parentReference中的relativeTransform也需要规范化
			const pr = finalSlot.parentReference as Record<string, unknown>
			if (pr.relativeTransform) {
				pr.relativeTransform = normalizeTransform(pr.relativeTransform)
			}
		}

		// 标记不是从binding生成的（是viewer真正解析到的）
		finalSlot.generatedFromBinding = false

		finalSlots.push(finalSlot)
	}

	// 检查是否有connected binding但没有对应resolved slot的情况
	// ——2026-08-03 改为：**自动补齐**缺失的slots（不再只警告不导出）。
	//   旧行为会导致"警告后不导出"，用户看到右下角显示 N 个但导出只剩 viewer 返回的 1 个。
	const synthesizedSlots: Record<string, unknown>[] = []
	for (const [objectId, binding] of bindingByObjectId.entries()) {
		if (!processedObjectIds.has(objectId)) {
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
		}
	}
	if (synthesizedSlots.length > 0) {
		console.groupCollapsed('[UNREAL-EXPORT-TRACE] #5b prepareResolvedSlotsForExport auto-synthesized missing slots')
		console.log(`synthesizedSlots = ${synthesizedSlots.length}`)
		console.log(
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
		console.groupEnd()
		console.log(
			`[UNREAL-EXPORT-TRACE][SUMMARY] #5b | synthesized=${synthesizedSlots.length} | sourceObjectIdList=${synthesizedSlots.map((s) => String(s.sourceObjectId ?? '')).filter(Boolean).join(',')}`
		)
		console.info(
			`[prepareResolvedSlotsForExport] auto-synthesized ${synthesizedSlots.length} missing slots from connectedModelBindings (viewer slots before=${finalSlots.length}`
		)
		finalSlots.push(...synthesizedSlots)
	}

	// 按slotId排序
	finalSlots.sort((a, b) => String(a.slotId ?? '').localeCompare(String(b.slotId ?? '')))

	console.groupCollapsed('[UNREAL-EXPORT-TRACE] #5c prepareResolvedSlotsForExport FINAL OUTPUT')
	console.log(`finalSlots = ${finalSlots.length} (bindingByObjectId.size = ${bindingByObjectId.size})`)
	console.log(
		`finalSlots[].sourceObjectId + modelBinding.objectId + pos summary:`,
		finalSlots.map((s: Record<string, unknown>) => {
			const mb = (s.modelBinding ?? {}) as Record<string, unknown>
			const wt = (s.worldTransform ?? s.slotTransform ?? s.relativeTransform ?? {}) as Record<string, unknown>
			return {
				slotId: s.slotId,
				sourceObjectId: s.sourceObjectId,
				displayName: s.displayName,
				mb_objectId: mb.objectId,
				mb_sourceNodeType: mb.sourceNodeType,
				mb_modelAssetProjectRelativePath: mb.modelAssetProjectRelativePath,
				mb_modelAssetUrl: mb.modelAssetUrl,
				pos: (wt && typeof wt.position === 'object') ? (wt as Record<string, unknown>).position : null,
				generatedFromBinding: s.generatedFromBinding,
				textureIntegrity: (TEXTURE_INTEGRITY_KEYS as unknown as string[]).every(k => (k in mb) && mb[k]) ? 'COMPLETE' : 'MISSING_KEYS'
			}
		})
	)
	if (warnings.length > 0) {
		console.log(`warnings[] =`, warnings)
	}
	console.groupEnd()
	// [单行非折叠摘要] —— 关键输出
	console.log(
		`[UNREAL-EXPORT-TRACE][SUMMARY] #5c | finalSlots=${finalSlots.length} | bindingByObjectId.size=${bindingByObjectId.size} | slots[slotId,sourceObjectId,mb_path,pos]=${JSON.stringify(finalSlots.map((s) => {
			const mb = (s.modelBinding ?? {}) as Record<string, unknown>
			const wt = (s.worldTransform ?? s.slotTransform ?? s.relativeTransform ?? {}) as Record<string, unknown>
			return {
				slotId: s.slotId,
				sourceObjectId: s.sourceObjectId,
				mb_path: String(mb.modelAssetProjectRelativePath ?? mb.modelAssetUrl ?? mb.modelAssetPath ?? mb.modelSourcePath ?? mb.modelProjectRelativePath ?? mb.modelUrl ?? ''),
				pos: (wt && typeof wt.position === 'object') ? (wt as Record<string, unknown>).position : null
			}
		}))}`
	)

	// 2026-08-03 最后一道出口过滤：只把有真实静态资产路径的 slot 交给 UE 插件导入。
	//   ——现场发现 SceneLayout 会把 ceiling/floor/wall_* 这些"房间壳子占位项"
	//     也注入到 resolvedModelBindings 里（objectId=ceiling_main/floor_main/wall_back/...），
	//     这些项没有任何上游 3D 模型节点产出的真实静态资源文件，
	//     UE 插件导入遇到空 mb_path 的 slot 可能报错打断 / 直接整体终止，
	//     导致后面有真实路径的 4 个模型也只导入第 1 个 bar_main。
	//   ——hasAnyPathExtended 与 #3 过滤器对齐（6 个路径字段任一非空就放行）。
	const slotsBeforeFilter = finalSlots.length
	const validSlots: Record<string, unknown>[] = []
	const skippedSlotIds: string[] = []
	for (const s of finalSlots) {
		const mb = (s.modelBinding ?? null) as Record<string, unknown> | null
		const hasPath =
			!!mb &&
			typeof mb === 'object' &&
			(
				!!String(mb.modelAssetProjectRelativePath ?? '').trim() ||
				!!String(mb.modelAssetUrl ?? '').trim() ||
				!!String(mb.modelAssetPath ?? '').trim() ||
				!!String(mb.modelSourcePath ?? '').trim() ||
				!!String(mb.modelProjectRelativePath ?? '').trim() ||
				!!String(mb.modelUrl ?? '').trim()
			)
		if (hasPath) validSlots.push(s)
		else skippedSlotIds.push(String(s.slotId ?? s.sourceObjectId ?? ''))
	}
	if (validSlots.length !== slotsBeforeFilter) {
		warnings.push(
			`[prepareResolvedSlotsForExport] Last-mile path-filter: dropped ${slotsBeforeFilter - validSlots.length} slots with no asset path (they are likely room-shell placeholders with no upstream 3D model node resources). droppedSlotIds=[${skippedSlotIds.join(',')}]. validSlots=${validSlots.length}`
		)
	}
	console.log(
		`[UNREAL-EXPORT-TRACE][SUMMARY] #5d | last-mile hasAnyPath filter: before=${slotsBeforeFilter}, valid(exported to UE)=${validSlots.length}, dropped(no asset path)=${skippedSlotIds.length} dropped=[${skippedSlotIds.join(',')}] validSlotIds=[${validSlots.map((s) => String(s.slotId ?? '')).filter(Boolean).join(',')}]`
	)

	// 2026-08-03 UE 插件路径字段对齐：
	//   项目约定 UE C++ 侧按 modelSourcePath > modelAssetPath > modelAssetUrl > modelUrl 读取路径，
	//   但前端新链路（Tripo3D / Meshy / 通用 3D 模型）实际只填充了
	//   modelAssetProjectRelativePath（UE 侧并不读取该字段），
	//   导致旧链路 bar_main（已有 modelAssetPath / modelSourcePath）成功导入后，
	//   其余 6 个新链路模型因 UE 侧取不到有效路径而跳过，现场表现为"始终只导入 1 个模型"。
	//   ——修复：只要 modelAssetProjectRelativePath 有值，就同步回填到
	//     modelAssetPath 与 modelSourcePath（仅当这两个字段为空时才覆盖，避免污染旧值）。
	//   同时兜底：当 modelUrl 是 dweb:// 协议（UE 完全无法识别）时，替换为相对路径。
	const alignedSlotIds: string[] = []
	const alignedDwebUrlCount: Record<string, number> = { n: 0 }
	for (const s of validSlots) {
		const mb = (s.modelBinding ?? null) as Record<string, unknown> | null
		if (!mb || typeof mb !== 'object') continue
		const relPath = String(mb.modelAssetProjectRelativePath ?? '').trim()
		let touched = false
		if (relPath) {
			if (!String(mb.modelAssetPath ?? '').trim()) {
				mb.modelAssetPath = relPath
				touched = true
			}
			if (!String(mb.modelSourcePath ?? '').trim()) {
				mb.modelSourcePath = relPath
				touched = true
			}
		}
		const mUrl = String(mb.modelUrl ?? '').trim()
		if (mUrl && mUrl.startsWith('dweb://') && relPath) {
			mb.modelUrl = relPath
			touched = true
			alignedDwebUrlCount.n += 1
		}
		const assetUrl = String(mb.modelAssetUrl ?? '').trim()
		if (assetUrl && assetUrl.startsWith('dweb://') && relPath && !String(mb.modelAssetPath ?? '').trim()) {
			// 极端兜底：当 UE 侧 fallback 读 modelAssetUrl 时也拿不到 dweb://，
			// 但前面已经把 modelAssetPath 覆盖过，这里只做日志标记就够
		}
		if (touched) alignedSlotIds.push(String(s.slotId ?? s.sourceObjectId ?? ''))
	}
	if (alignedSlotIds.length > 0) {
		const msg =
			`[prepareResolvedSlotsForExport] UE-path-alignment: backfilled modelAssetPath/modelSourcePath for ${alignedSlotIds.length} slots ` +
			`(from modelAssetProjectRelativePath; replaced dweb:// modelUrl=${alignedDwebUrlCount.n}). alignedSlotIds=[${alignedSlotIds.join(',')}]`
		warnings.push(msg)
	}
	console.log(
		`[UNREAL-EXPORT-TRACE][SUMMARY] #5e | UE path alignment: slots=${validSlots.length}, aligned(backfilled AssetPath/SourcePath)=${alignedSlotIds.length}, replaced-dweb-url=${alignedDwebUrlCount.n} alignedIds=[${alignedSlotIds.join(',')}]`
	)

	return { slots: validSlots, warnings }
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
	const viewerArr = Array.isArray((exportData as { sceneLayoutResolvedModelBindings?: unknown[] })?.sceneLayoutResolvedModelBindings)
		? ((exportData as { sceneLayoutResolvedModelBindings: unknown[] }).sceneLayoutResolvedModelBindings as unknown[])
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
					(precheckObj as Record<string, unknown>)[k] = { ...(vVal as Record<string, unknown>) }
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
	const pos = li.position && typeof li.position === 'object'
		? (li.position as Record<string, unknown>)
		: null
	const rot = li.rotation && typeof li.rotation === 'object'
		? (li.rotation as Record<string, unknown>)
		: null
	const scl = li.scale && typeof li.scale === 'object'
		? (li.scale as Record<string, unknown>)
		: null
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
	const modelResourceId = String(b.modelResourceId ?? (b as { resourceId?: unknown }).resourceId ?? '').trim()

	const nodesMap = nodesById && typeof nodesById === 'object' ? (nodesById as Record<string, unknown>) : {}
	const resourcesMap = resourcesById && typeof resourcesById === 'object' ? (resourcesById as Record<string, unknown>) : {}

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
						candidates.push(String(s.modelAssetProjectRelativePath ?? s.modelProjectRelativePath ?? '').trim() || null)
						candidates.push(String(s.modelAssetPath ?? s.modelSourcePath ?? '').trim() || null)
						candidates.push(String(s.modelAssetUrl ?? s.modelUrl ?? '').trim() || null)
						candidates.push(String(s.projectRelativePath ?? s.absolutePath ?? s.sourcePath ?? '').trim() || null)
						candidates.push(String(s.assetUrl ?? s.preferredUrl ?? s.url ?? '').trim() || null)
						const fmt = detectModelFormatFromPath(String(s.modelAssetProjectRelativePath ?? s.modelAssetUrl ?? s.url ?? ''))
						if (fmt) fallbackFormat = fmt
					}
				}
			}
		}
		// ② 节点顶层任一字段（新链路 decompose 经常直接塞顶层）
		const topKeys = [
			'modelAssetProjectRelativePath', 'modelProjectRelativePath',
			'modelAssetUrl', 'modelUrl', 'modelAssetPath', 'modelSourcePath',
			'resolvedModelPath', 'localAssetUrl', 'localAssetPath'
		] as const
		for (const k of topKeys) {
			const v = String((fn as Record<string, unknown>)[k] ?? '').trim()
			if (v) candidates.push(v)
			const fmt = detectModelFormatFromPath(v)
			if (fmt) fallbackFormat = fmt
		}
		// ③ 从节点 .resourceId 反查 resourcesById
		const fnResId = String(fn.resourceId ?? (fn.model3dSettings as Record<string, unknown> | undefined)?.resourceId ?? '').trim()
		if (fnResId && resourcesMap[fnResId]) {
			const r = resourcesMap[fnResId] as Record<string, unknown>
			candidates.push(String(r.projectRelativePath ?? '').trim() || null)
			candidates.push(String(r.absolutePath ?? '').trim() || null)
			candidates.push(String(r.sourcePath ?? '').trim() || null)
			candidates.push(String(r.url ?? '').trim() || null)
			candidates.push(String(r.assetUrl ?? '').trim() || null)
			candidates.push(String(r.localUrl ?? '').trim() || null)
			const fmt = detectModelFormatFromPath(String(r.projectRelativePath ?? r.url ?? r.absolutePath ?? ''))
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
		const fmt = detectModelFormatFromPath(String(r.projectRelativePath ?? r.url ?? r.absolutePath ?? ''))
		if (fmt) fallbackFormat = fmt
	}
	const best = pickBestModelUrlFromCandidates(candidates as Array<string | null | undefined>)
	if (!best) return b // 真·没找到，不填了
	const overrideFormat = detectModelFormatFromPath(best) || fallbackFormat
	// ---- 解析 best 成 6 路径字段 ----
	const relPath = (() => {
		const m1 = /\?(?:.*&)?(?:path|relativePath|assetPath|filePath)=([^&]+)/.exec(best)
		if (m1 && m1[1]) {
			try { return decodeURIComponent(m1[1]).split('?')[0].split('#')[0] } catch { /* ignore */ }
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
		if (!String(b.modelAssetProjectRelativePath ?? '').trim()) b.modelAssetProjectRelativePath = relPath
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
	const processedBindings: unknown[] = backfillNodes || backfillResources
		? safeBindings.map((b) => tryBackfillBindingPathsFromStore((b ?? {}) as Record<string, unknown>, backfillNodes, backfillResources))
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
			const suffix = (m && m[1]) ? String(m[1]).trim() : ''
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

	console.groupCollapsed('[UNREAL-EXPORT-TRACE] #2a buildPureDataSlotsForUnreal entry')
	console.log(`layoutItems (input) = ${Array.isArray(layoutItems) ? layoutItems.length : 0}`)
	console.log(`resolvedBindings (input) = ${safeBindings.length}`)
	console.log(
		`indexes: bindingByObjectId=${bindingByObjectId.size}, bindingByAnchorId=${bindingByAnchorId.size}, bindingByAnchorSuffix=${bindingByAnchorSuffix.size}`
	)
	console.log(
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
	console.groupEnd()
	// 2026-08-03: 用 processedBindings（已跑 Ultimate Backfill）打印，不是 safeBindings（初值），
	//   这样用户在 log.md 里看 #2a 的 hasValidPath 比例就能直接知道"这次兜底到底救回了多少个模型"。
	const diagBindings = processedBindings
	const backfilledCount = diagBindings.filter((b) => {
		const obj = (b ?? {}) as Record<string, unknown>
		return hasAnyPathExtended(obj) && safeBindings.every((orig) => {
			const o = (orig ?? {}) as Record<string, unknown>
			if (String(o.objectId ?? '') !== String(obj.objectId ?? '')) return true
			return !hasAnyPathExtended(o)
		})
	}).length
	console.log(
		`[UNREAL-EXPORT-TRACE][SUMMARY] #2a | layoutItems=${Array.isArray(layoutItems) ? layoutItems.length : 0} | rawBindings=${safeBindings.length} | afterBackfill=${diagBindings.length} | backfilledNewPaths=${backfilledCount} | ids=[${diagBindings.map((b) => String((b as Record<string, unknown>)?.objectId ?? '')).filter(Boolean).join(',')}]`
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
		const orientationFix = item.orientationFix && typeof item.orientationFix === 'object'
			? (item.orientationFix as Record<string, unknown>)
			: null
		const fitMode = (['oriented', 'filled', 'forced', 'normal'] as const).includes(
			(item.fitMode as 'oriented' | 'filled' | 'forced' | 'normal' | undefined) ?? 'normal'
		)
			? ((item.fitMode as 'oriented' | 'filled' | 'forced' | 'normal') ?? 'normal')
			: ('normal' as const)
		let fillMode: 'single' | 'fill-x' | 'fill-y' | 'fill-z' = 'single'
		if (item.fillMode === 'fill-x' || item.fillMode === 'fill-y' || item.fillMode === 'fill-z') fillMode = item.fillMode
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
			const relationTags = Array.isArray(item.relationTags) ? [...(item.relationTags as unknown[])] : undefined
			const modelBindingCopy: Record<string, unknown> = { ...binding }
			if (!String(modelBindingCopy.sourceNodeType ?? '').trim()) modelBindingCopy.sourceNodeType = 'model3d'
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

	console.groupCollapsed('[UNREAL-EXPORT-TRACE] #2b buildPureDataSlotsForUnreal output')
	console.log(`builtSlots = ${builtSlots.length}, boundItemCount = ${boundItemCount}`)
	console.log(
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
	console.groupEnd()
	// 2026-08-03 现场可观测性：把 skippedNoBinding / skippedNoPath 的明细也打进单行 SUMMARY 日志，
	//   下一次复制到 log.md 时不需要展开 Console group 就能直接看"具体哪个 objectId 没找到 binding
	//   / 哪个找到了 binding 但 6 路径字段全空"。否则用户每次只看到 builtSlots=7 不知道 27 个里漏了谁。
	console.log(
		`[UNREAL-EXPORT-TRACE][SUMMARY] #2b | builtSlots=${builtSlots.length}, boundItemCount=${boundItemCount} | skippedNoBinding(${skippedNoBinding.length})=[${skippedNoBinding.join(',')}] | skippedNoPath(${skippedNoPath.length})=[${skippedNoPath.join(',')}] | sourceObjectIdList=${builtSlots.map((s) => String(s.sourceObjectId ?? '')).filter(Boolean).join(',')}`
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
