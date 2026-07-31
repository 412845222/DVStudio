export const useAIWorkflowSceneLayoutMetadata = (options: {
	store: {
		state: {
			nodesById: Record<string, unknown>
		}
	}
}) => {
	const extractSceneLayoutSourceItems = (parsed: unknown) => {
		const obj = parsed as Record<string, unknown>
		if (Array.isArray(obj?.objects)) return obj.objects as unknown[]
		if (Array.isArray(obj?.layoutItems)) return obj.layoutItems as unknown[]
		if (Array.isArray(parsed)) return parsed as unknown[]
		return [] as unknown[]
	}

	const buildSceneLayoutMetadataMap = (items: unknown[]) => {
		const map = new Map<string, unknown>()
		for (const item of items) {
			const obj = item as Record<string, unknown>
			const id = String(obj?.id ?? '').trim()
			if (!id) continue
			map.set(id, item)
		}
		return map
	}

	const parseSceneLayoutMetadataItems = (inputJson: string) => {
		const text = String(inputJson ?? '').trim()
		if (!text) return [] as unknown[]
		try {
			const parsed = JSON.parse(text)
			return extractSceneLayoutSourceItems(parsed)
		} catch {
			return [] as unknown[]
		}
	}

	const mergeSceneLayoutItemsWithMetadata = (layoutItems: unknown[], metadataSources: unknown[][]) => {
		const maps = metadataSources.map((items) =>
			buildSceneLayoutMetadataMap(Array.isArray(items) ? items : [])
		)
		return (Array.isArray(layoutItems) ? layoutItems : []).map((item) => {
			const obj = item as Record<string, unknown>
			const id = String(obj?.id ?? '').trim()
			if (!id) return item
			const matchedSources = maps
				.map((map) => map.get(id))
				.filter((value) => value && typeof value === 'object')
			if (!matchedSources.length) return item
			const mergedSource = Object.assign({}, ...matchedSources.reverse()) as Record<string, unknown>
			return {
				...mergedSource,
				...obj,
				position:
					obj?.position && typeof obj.position === 'object'
						? obj.position
						: mergedSource.position,
				size: obj?.size && typeof obj.size === 'object' ? obj.size : mergedSource.size,
				rotation:
					obj?.rotation && typeof obj.rotation === 'object'
						? obj.rotation
						: mergedSource.rotation,
				scale: obj?.scale && typeof obj.scale === 'object' ? obj.scale : mergedSource.scale,
				holePunches: Array.isArray(obj?.holePunches)
					? obj.holePunches
					: Array.isArray(mergedSource.holePunches)
						? mergedSource.holePunches
						: undefined
			}
		})
	}

	const getSceneLayoutSelectedPlaceholderPayload = (nodeId: string) => {
		const node = options.store.state.nodesById[nodeId] as Record<string, unknown>
		if (!node || node.type !== 'scene-layout') return null
		const settings = (node.sceneLayoutSettings ?? null) as Record<string, unknown> | null
		const selectedId = String(settings?.selectedPlaceholderOutput ?? '').trim()
		if (!selectedId) return null
		const layoutItemsVal = settings?.layoutItems
		const currentLayoutItems = Array.isArray(layoutItemsVal)
			? (layoutItemsVal as unknown[])
			: []
		const inputMetadataItems = parseSceneLayoutMetadataItems(String(settings?.inputJson ?? ''))
		const mergedItems = mergeSceneLayoutItemsWithMetadata(currentLayoutItems, [inputMetadataItems])
		const item = mergedItems.find(
			(entry) =>
				String((entry as Record<string, unknown>)?.id ?? '').trim() === selectedId
		)
		if (!item) return null
		const obj = item as Record<string, unknown>
		return {
			kind: 'scene-layout-placeholder-ref',
			objectId: selectedId,
			name: String(obj?.name ?? obj?.id ?? '').trim() || selectedId,
			description: typeof obj?.description === 'string' ? obj.description : undefined,
			category: typeof obj?.category === 'string' ? obj.category : undefined,
			color: typeof obj?.color === 'string' ? obj.color : undefined,
			parentId: typeof obj?.parentId === 'string' ? obj.parentId : undefined,
			placement: typeof obj?.placement === 'string' ? obj.placement : undefined,
			relationReason: typeof obj?.relationReason === 'string' ? obj.relationReason : undefined,
			position: obj?.position && typeof obj.position === 'object' ? obj.position : undefined,
			size: obj?.size && typeof obj.size === 'object' ? obj.size : undefined,
			rotation: obj?.rotation && typeof obj.rotation === 'object' ? obj.rotation : undefined,
			scale: obj?.scale && typeof obj.scale === 'object' ? obj.scale : undefined,
			holePunches: Array.isArray(obj?.holePunches) ? obj.holePunches : undefined,
			sourceImageIndex: Number.isFinite(Number(obj?.sourceImageIndex))
				? Number(obj.sourceImageIndex)
				: undefined,
			observedImageIndices: Array.isArray(obj?.observedImageIndices)
				? obj.observedImageIndices
				: undefined
		}
	}

	const serializeSceneLayoutSelectedPlaceholder = (nodeId: string) => {
		const payload = getSceneLayoutSelectedPlaceholderPayload(nodeId)
		if (!payload) return ''
		try {
			return JSON.stringify(payload, null, 2)
		} catch {
			return ''
		}
	}

	const serializeSceneLayoutOutput = (nodeId: string): string => {
		const node = options.store.state.nodesById[nodeId] as Record<string, unknown>
		if (!node || node.type !== 'scene-layout') return ''
		const settings = (node.sceneLayoutSettings ?? null) as Record<string, unknown> | null
		const layoutItemsVal = settings?.layoutItems
		const currentLayoutItems = Array.isArray(layoutItemsVal)
			? (layoutItemsVal as unknown[])
			: []
		const inputMetadataItems = parseSceneLayoutMetadataItems(String(settings?.inputJson ?? ''))
		const layoutItems = mergeSceneLayoutItemsWithMetadata(currentLayoutItems, [inputMetadataItems])
		const camera =
			settings?.camera && typeof settings.camera === 'object' ? settings.camera : undefined
		if (!layoutItems.length) return String(settings?.inputJson ?? '')
		try {
			return JSON.stringify(
				{
					layoutItems,
					...(camera ? { camera } : {})
				},
				null,
				2
			)
		} catch {
			return String(settings?.inputJson ?? '')
		}
	}

	return {
		extractSceneLayoutSourceItems,
		parseSceneLayoutMetadataItems,
		mergeSceneLayoutItemsWithMetadata,
		getSceneLayoutSelectedPlaceholderPayload,
		serializeSceneLayoutSelectedPlaceholder,
		serializeSceneLayoutOutput
	}
}
