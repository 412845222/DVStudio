export const useAIWorkflowSceneLayoutMetadata = (options: {
	store: {
		state: {
			nodesById: Record<string, any>
		}
	}
}) => {
	const extractSceneLayoutSourceItems = (parsed: any) => {
		if (Array.isArray(parsed?.objects)) return parsed.objects as any[]
		if (Array.isArray(parsed?.layoutItems)) return parsed.layoutItems as any[]
		if (Array.isArray(parsed)) return parsed as any[]
		return [] as any[]
	}

	const buildSceneLayoutMetadataMap = (items: any[]) => {
		const map = new Map<string, any>()
		for (const item of items) {
			const id = String(item?.id ?? '').trim()
			if (!id) continue
			map.set(id, item)
		}
		return map
	}

	const parseSceneLayoutMetadataItems = (inputJson: string) => {
		const text = String(inputJson ?? '').trim()
		if (!text) return [] as any[]
		try {
			const parsed = JSON.parse(text)
			return extractSceneLayoutSourceItems(parsed)
		} catch {
			return [] as any[]
		}
	}

	const mergeSceneLayoutItemsWithMetadata = (layoutItems: any[], metadataSources: any[][]) => {
		const maps = metadataSources.map((items) =>
			buildSceneLayoutMetadataMap(Array.isArray(items) ? items : [])
		)
		return (Array.isArray(layoutItems) ? layoutItems : []).map((item) => {
			const id = String(item?.id ?? '').trim()
			if (!id) return item
			const matchedSources = maps
				.map((map) => map.get(id))
				.filter((value) => value && typeof value === 'object')
			if (!matchedSources.length) return item
			const mergedSource = Object.assign({}, ...matchedSources.reverse())
			return {
				...mergedSource,
				...item,
				position:
					item?.position && typeof item.position === 'object'
						? item.position
						: mergedSource.position,
				size: item?.size && typeof item.size === 'object' ? item.size : mergedSource.size,
				rotation:
					item?.rotation && typeof item.rotation === 'object'
						? item.rotation
						: mergedSource.rotation,
				scale: item?.scale && typeof item.scale === 'object' ? item.scale : mergedSource.scale
			}
		})
	}

	const getSceneLayoutSelectedPlaceholderPayload = (nodeId: string) => {
		const node = options.store.state.nodesById[nodeId] as any
		if (!node || node.type !== 'scene-layout') return null
		const settings = node.sceneLayoutSettings ?? null
		const selectedId = String(settings?.selectedPlaceholderOutput ?? '').trim()
		if (!selectedId) return null
		const currentLayoutItems = Array.isArray(settings?.layoutItems) ? settings.layoutItems : []
		const inputMetadataItems = parseSceneLayoutMetadataItems(String(settings?.inputJson ?? ''))
		const mergedItems = mergeSceneLayoutItemsWithMetadata(currentLayoutItems, [inputMetadataItems])
		const item = mergedItems.find((entry: any) => String(entry?.id ?? '').trim() === selectedId)
		if (!item) return null
		return {
			kind: 'scene-layout-placeholder-ref',
			objectId: selectedId,
			name: String(item?.name ?? item?.id ?? '').trim() || selectedId,
			description: typeof item?.description === 'string' ? item.description : undefined,
			category: typeof item?.category === 'string' ? item.category : undefined,
			color: typeof item?.color === 'string' ? item.color : undefined,
			parentId: typeof item?.parentId === 'string' ? item.parentId : undefined,
			placement: typeof item?.placement === 'string' ? item.placement : undefined,
			relationReason: typeof item?.relationReason === 'string' ? item.relationReason : undefined,
			position: item?.position && typeof item.position === 'object' ? item.position : undefined,
			size: item?.size && typeof item.size === 'object' ? item.size : undefined,
			rotation: item?.rotation && typeof item.rotation === 'object' ? item.rotation : undefined,
			scale: item?.scale && typeof item.scale === 'object' ? item.scale : undefined,
			sourceImageIndex: Number.isFinite(Number(item?.sourceImageIndex))
				? Number(item.sourceImageIndex)
				: undefined,
			observedImageIndices: Array.isArray(item?.observedImageIndices)
				? item.observedImageIndices
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
		const node = options.store.state.nodesById[nodeId] as any
		if (!node || node.type !== 'scene-layout') return ''
		const settings = node.sceneLayoutSettings ?? null
		const currentLayoutItems = Array.isArray(settings?.layoutItems) ? settings.layoutItems : []
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
