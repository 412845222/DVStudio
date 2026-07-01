export const normalizeResolvedLayoutSlots = (slots: unknown[]) => {
	const slotMap = new Map<string, Record<string, unknown>>()
	if (!Array.isArray(slots)) return slotMap
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

	for (const slot of validSlots) {
		const slotId = String(slot.slotId ?? '').trim()
		if (slotId) slotMap.set(slotId, slot)
	}
	return slotMap
}

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

	// NOTE: `rotation` MUST use euler-angle shape { yaw, pitch, roll } (in degrees)
	// because C++ `SceneRotationToUnreal` reads it that way. `quaternion` is the
	// preferred rotation source on the C++ side (used when valid), so we always
	// supply an identity quaternion too. Keeping both fields consistent prevents
	// the euler fallback path from misinterpreting quaternion-shaped data.
	const identityTransform = {
		position: { x: 0, y: 0, z: 0 },
		rotation: { yaw: 0, pitch: 0, roll: 0 },
		quaternion: { x: 0, y: 0, z: 0, w: 1 },
		scale: { x: 1, y: 1, z: 1 }
	}

	const safeBindings = Array.isArray(connectedModelBindings) ? connectedModelBindings : []
	for (const binding of safeBindings) {
		if (!binding || typeof binding !== 'object') continue
		const bindingObj = binding as Record<string, unknown>
		const objectId = String(bindingObj.objectId ?? '').trim()
		if (!objectId) continue

		const hasModelPath = !!(
			String(bindingObj.modelUrl ?? '').trim() ||
			String(bindingObj.modelAssetUrl ?? '').trim() ||
			String(bindingObj.modelSourcePath ?? '').trim() ||
			String(bindingObj.modelAssetPath ?? '').trim()
		)

		if (!hasModelPath) continue

		const existingSlot = resolvedSlotMap?.get(objectId)
		const layoutItem = itemMap.get(objectId)

		let transform = existingSlot?.previewInstanceTransform
		if (!transform || typeof transform !== 'object') {
			transform = layoutItem?.transform
		}
		if (!transform || typeof transform !== 'object') {
			transform = { ...identityTransform }
		}

		const slotId = objectId
		finalSlots.push({
			slotId,
			sourceObjectId: objectId,
			objectName: String(bindingObj.objectName ?? (layoutItem as Record<string, unknown> | undefined)?.name ?? objectId).trim() || objectId,
			previewInstanceTransform: transform,
			modelBinding: {
				...bindingObj,
				sourceNodeType: String(bindingObj.sourceNodeType ?? 'model3d'),
				sourceNodeId: String(bindingObj.sourceNodeId ?? '').trim() || undefined
			},
			generatedFromBinding: !existingSlot
		})
	}

	return finalSlots.sort((a, b) =>
		String(a.slotId ?? '').localeCompare(String(b.slotId ?? ''))
	)
}
