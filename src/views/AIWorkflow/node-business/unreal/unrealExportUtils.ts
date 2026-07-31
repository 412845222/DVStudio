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
	const warnings: string[] = []
	const { slots: resolvedSlots, bySourceObjectId } = normalizeResolvedLayoutSlots(rawSlots)

	// 建立binding索引
	const bindingByObjectId = new Map<string, Record<string, unknown>>()
	const safeBindings = Array.isArray(connectedModelBindings) ? connectedModelBindings : []
	for (const binding of safeBindings) {
		if (!binding || typeof binding !== 'object') continue
		const b = binding as Record<string, unknown>
		const objectId = String(b.objectId ?? '').trim()
		if (objectId && hasValidModelPath(b)) {
			bindingByObjectId.set(objectId, b)
		}
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
		if (!modelBinding || typeof modelBinding !== 'object' || !hasValidModelPath(modelBinding)) {
			// slot中没有有效modelBinding，从connected bindings中补充
			const fallbackBinding = bindingByObjectId.get(sourceObjectId)
			if (fallbackBinding) {
				modelBinding = {
					sourceNodeId: String(fallbackBinding.sourceNodeId ?? '').trim() || undefined,
					sourceNodeType: String(fallbackBinding.sourceNodeType ?? 'model3d'),
					modelUrl: String(fallbackBinding.modelUrl ?? '').trim() || undefined,
					modelAssetUrl: String(fallbackBinding.modelAssetUrl ?? '').trim() || undefined,
					modelSourcePath: String(fallbackBinding.modelSourcePath ?? '').trim() || undefined,
					modelAssetPath: String(fallbackBinding.modelAssetPath ?? '').trim() || undefined,
					modelSourceName: String(fallbackBinding.modelSourceName ?? '').trim() || undefined,
					modelFormat: fallbackBinding.modelFormat
				}
				finalSlot.modelBinding = modelBinding
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

	// 检查是否有connected binding但没有对应resolved slot的情况（给出警告）
	for (const [objectId, binding] of bindingByObjectId.entries()) {
		if (!processedObjectIds.has(objectId)) {
			const layoutItem = itemMap.get(objectId)
			const name = String(binding.objectName ?? layoutItem?.name ?? objectId).trim() || objectId
			warnings.push(
				`Model "${name}" has binding but was not found in 3D preview; it will not be exported`
			)
		}
	}

	// 按slotId排序
	finalSlots.sort((a, b) => String(a.slotId ?? '').localeCompare(String(b.slotId ?? '')))

	return { slots: finalSlots, warnings }
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
		if (!isValidTransform(transform)) {
			transform = layoutItem?.transform
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
