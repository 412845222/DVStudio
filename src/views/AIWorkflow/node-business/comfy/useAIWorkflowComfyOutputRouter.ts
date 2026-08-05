import type { ComfyBridgeMedia, ComfyLocalizedOutput } from './comfyOutputResolver'
import { comfyAnchorNodeIdFromAnchorId, inferMediaKind } from './comfyOutputResolver'
import { t } from '../../../../i18n'

type OutputAnchor = {
	id?: string
	label?: string
	mediaType?: 'image' | 'video' | 'model3d'
	[key: string]: unknown
}

type Edge = {
	fromNodeId?: string
	toNodeId?: string
	fromAnchorId?: string
	toAnchorId?: string
	[key: string]: unknown
}

export const useAIWorkflowComfyOutputRouter = (payload: {
	store: {
		state: {
			nodesById: Record<string, unknown>
		}
	}
	getOutgoingEdges: (nodeId: string) => Edge[]
	comfyAnchorAssignments: Map<string, Map<string, string>>
	comfyAnchorLocalizedOutputs: Map<string, Map<string, ComfyLocalizedOutput>>
	blueprintProjectService: unknown
	currentProjectId: { value: number | null }
	isElectron: () => boolean
	downloadUrlToProjectRoot?: (
		projectId: number,
		url: string,
		desiredFilename?: string
	) => Promise<{
		ok: boolean
		absolutePath?: string
		relativePath?: string
		size?: number
		error?: string
	} | null>
	resolveBackendUrl: (url: string) => string
	bindMediaResourceToNode: (
		nodeId: string,
		kind: 'image' | 'video' | 'model3d',
		url: string,
		name: string,
		meta?: { sourcePath?: string }
	) => void
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
}) => {
	const routeComfyOutputsToConnectedNodes = (
		comfyNodeId: string,
		media: ComfyBridgeMedia[],
		opts?: { notifyWarnings?: boolean }
	): Promise<{ alerts: string[]; outputs: ComfyLocalizedOutput[] }> => {
		const nodeRecord = payload.store.state.nodesById[comfyNodeId]
		const comfyNode = nodeRecord as
			| { type?: string; outputs?: unknown; comfyuiSettings?: { baseUrl?: string } }
			| undefined
		if (!comfyNode || comfyNode.type !== 'comfyui') {
			return Promise.resolve({ alerts: [] as string[], outputs: [] as ComfyLocalizedOutput[] })
		}

		const outputs = Array.isArray(comfyNode.outputs) ? (comfyNode.outputs as OutputAnchor[]) : []
		const outputAnchorIds = outputs.map((a: OutputAnchor) => String(a?.id ?? '')).filter(Boolean)
		if (!outputAnchorIds.length) {
			return Promise.resolve({ alerts: [] as string[], outputs: [] as ComfyLocalizedOutput[] })
		}

		const isSingleOutAnchor = outputAnchorIds.length === 1 && outputAnchorIds[0] === 'out'

		const outputAnchorIdSet = new Set(outputAnchorIds)
		const outputAnchorMap = new Map(outputs.map((a: OutputAnchor) => [String(a?.id ?? ''), a]))
		const outputAnchorOrder = new Map(
			outputs.map((a: OutputAnchor, idx: number) => [String(a?.id ?? ''), idx])
		)
		const outgoing = payload
			.getOutgoingEdges(comfyNodeId)
			.filter((e: Edge) => outputAnchorIdSet.has(String(e.fromAnchorId ?? '')))

		const outgoingByAnchor = new Map<string, Edge[]>()
		for (const e of outgoing) {
			const anchorId = String(e?.fromAnchorId ?? '')
			if (!anchorId) continue
			const list = outgoingByAnchor.get(anchorId) ?? []
			list.push(e)
			outgoingByAnchor.set(anchorId, list)
		}

		const validMedia = media.filter((m) => String(m.url || '').trim() && inferMediaKind(m))
		const imageMedia = validMedia.filter((m) => inferMediaKind(m) === 'image')
		const videoMedia = validMedia.filter((m) => inferMediaKind(m) === 'video')
		const model3dMedia = validMedia.filter((m) => inferMediaKind(m) === 'model3d')
		const alerts = new Set<string>()

		const mediaKey = (m: ComfyBridgeMedia) => {
			return `${String(m?.nodeId ?? '')}|${String(m?.filename ?? '')}|${String(m?.subfolder ?? '')}|${String(m?.type ?? '')}|${String(m?.url ?? '')}`
		}

		const localizeSingleMedia = async (
			selectedMedia: ComfyBridgeMedia,
			anchorId: string,
			anchorLabel: string,
			importedByMediaKey: Map<string, ComfyLocalizedOutput>
		): Promise<ComfyLocalizedOutput | null> => {
			const inferredMediaType = inferMediaKind(selectedMedia)
			if (!inferredMediaType) return null

			const key = mediaKey(selectedMedia)
			let localizedOutput: ComfyLocalizedOutput | null = importedByMediaKey.get(key) ?? null

			if (localizedOutput) {
				return { ...localizedOutput, anchorId }
			}

			const pid = Number(payload.currentProjectId.value ?? 0)
			const selectedUrl = String(selectedMedia.url || '').trim()
			const desiredName = String(
				selectedMedia.filename || `comfy_${inferredMediaType}_${Date.now()}`
			).trim()
			let localizedFromElectron = false

			if (
				payload.isElectron() &&
				Number.isFinite(pid) &&
				pid > 0 &&
				selectedUrl &&
				typeof payload.downloadUrlToProjectRoot === 'function'
			) {
				try {
					const dl = await payload.downloadUrlToProjectRoot(pid, selectedUrl, desiredName)
					const rel = String(dl?.relativePath || '').trim()
					const abs = String(dl?.absolutePath || '').trim()
					if (dl?.ok && rel && abs) {
						localizedOutput = {
							kind: inferredMediaType,
							url: `dweb://project-assets?projectId=${pid}&path=${encodeURIComponent(rel)}`,
							filename: desiredName,
							anchorId,
							nodeId: String(selectedMedia.nodeId ?? '').trim() || undefined,
							sourcePath: abs,
							subfolder: String(selectedMedia.subfolder || '').trim() || undefined,
							type: String(selectedMedia.type || '').trim() || undefined
						}
						importedByMediaKey.set(key, localizedOutput)
						localizedFromElectron = true
					}
				} catch {
					// ignore and fallback
				}
			}

			if (!localizedFromElectron && payload.isElectron()) {
				alerts.add(t('nodes.comfyui.downloadFailed', { anchor: anchorLabel }))
				return null
			}

			if (!localizedFromElectron) {
				const service = payload.blueprintProjectService as {
					importAsset: (
						params: Record<string, unknown>
					) => Promise<{ ok: boolean; error?: string; asset?: Record<string, unknown> }>
				}
				const imported = await service.importAsset({
					kind: inferredMediaType === 'model3d' ? 'file' : inferredMediaType,
					name: desiredName,
					sourceUrl: selectedUrl,
					baseUrl: String(comfyNode.comfyuiSettings?.baseUrl || '').trim() || undefined,
					filename: String(selectedMedia.filename || '').trim() || undefined,
					subfolder: String(selectedMedia.subfolder || '').trim() || undefined,
					type: String(selectedMedia.type || '').trim() || undefined,
					projectId: payload.currentProjectId.value
				})

				if (!imported.ok) {
					alerts.add(
						t('nodes.comfyui.importFailed', {
							anchor: anchorLabel,
							error: String(imported.error || 'unknown')
						})
					)
					return null
				}

				const asset = imported.asset ?? {}
				const importedUrl = payload.resolveBackendUrl(String(asset.url || ''))
				if (!String(importedUrl || '').trim()) {
					alerts.add(t('nodes.comfyui.emptyUrlReturned', { anchor: anchorLabel }))
					return null
				}

				localizedOutput = {
					kind: inferredMediaType,
					url: importedUrl,
					filename: String(
						asset.name || selectedMedia.filename || `comfy_${inferredMediaType}_${Date.now()}`
					),
					anchorId,
					nodeId: String(selectedMedia.nodeId ?? '').trim() || undefined,
					sourcePath: String(asset.sourcePath || asset.absolutePath || '').trim() || undefined,
					subfolder: String(selectedMedia.subfolder || '').trim() || undefined,
					type: String(selectedMedia.type || '').trim() || undefined
				}
				importedByMediaKey.set(key, localizedOutput)
			}

			return localizedOutput
		}

		const run = async () => {
			const assignMap = payload.comfyAnchorAssignments.get(comfyNodeId) ?? new Map<string, string>()
			if (!payload.comfyAnchorAssignments.has(comfyNodeId)) {
				payload.comfyAnchorAssignments.set(comfyNodeId, assignMap)
			}

			const localizedByAnchor =
				payload.comfyAnchorLocalizedOutputs.get(comfyNodeId) ??
				new Map<string, ComfyLocalizedOutput>()
			if (!payload.comfyAnchorLocalizedOutputs.has(comfyNodeId)) {
				payload.comfyAnchorLocalizedOutputs.set(comfyNodeId, localizedByAnchor)
			}

			const importedByMediaKey = new Map<string, ComfyLocalizedOutput>()
			const allLocalizedOutputs: ComfyLocalizedOutput[] = []

			if (isSingleOutAnchor) {
				const anchorId = 'out'
				const fromAnchor = outputAnchorMap.get(anchorId)
				const fromAnchorLabel = String(
					fromAnchor?.label ?? anchorId ?? t('aiworkflow.runtime.outputAnchor')
				)
				const edgesForAnchor = outgoingByAnchor.get(anchorId) ?? []

				const boundNodeIds = new Set<string>()

				for (const m of validMedia) {
					const localized = await localizeSingleMedia(
						m,
						anchorId,
						fromAnchorLabel,
						importedByMediaKey
					)
					if (localized) {
						allLocalizedOutputs.push(localized)
					}
				}

				for (const e of edgesForAnchor) {
					const toRecord = payload.store.state.nodesById[e.toNodeId ?? '']
					const to = toRecord as { id?: string; type?: string } | undefined
					if (!to || !to.id) continue
					if (boundNodeIds.has(to.id)) continue

					let targetKind: 'image' | 'video' | 'model3d' | null = null
					if (to.type === 'image') targetKind = 'image'
					else if (to.type === 'video') targetKind = 'video'
					else if (to.type === 'model3d') targetKind = 'model3d'
					if (!targetKind) continue

					const available = allLocalizedOutputs.filter((o) => o.kind === targetKind)
					if (available.length === 0) continue

					const output = available[0]
					payload.bindMediaResourceToNode(
						to.id,
						output.kind,
						output.url,
						String(output.filename || `comfy_${output.kind}_${Date.now()}`),
						{
							sourcePath: String(output.sourcePath || '').trim() || undefined
						}
					)
					boundNodeIds.add(to.id)
				}

				if (allLocalizedOutputs.length > 0) {
					localizedByAnchor.set(anchorId, allLocalizedOutputs[0])
					assignMap.set(anchorId, mediaKey(validMedia[0]))
				}
			} else {
				const sortedOutputAnchorIds = [...outputAnchorIds].sort((a, b) => {
					const ai = Number(outputAnchorOrder.get(a) ?? Number.MAX_SAFE_INTEGER)
					const bi = Number(outputAnchorOrder.get(b) ?? Number.MAX_SAFE_INTEGER)
					return ai - bi
				})

				const fallbackCursor = { image: 0, video: 0, model3d: 0 }

				for (const anchorId of sortedOutputAnchorIds) {
					const edgesForAnchor = outgoingByAnchor.get(anchorId) ?? []
					const fromAnchor = outputAnchorMap.get(anchorId)
					const fromAnchorLabel = String(
						fromAnchor?.label ?? anchorId ?? t('aiworkflow.runtime.outputAnchor')
					)
					const fromMediaType = fromAnchor?.mediaType as 'image' | 'video' | 'model3d' | undefined
					const hasDownstream = edgesForAnchor.length > 0

					const targetKinds = edgesForAnchor
						.map((e: Edge) => {
							const toRecord = payload.store.state.nodesById[e.toNodeId ?? '']
							const to = toRecord as { type?: string } | undefined
							if (to?.type === 'image') return 'image'
							if (to?.type === 'video') return 'video'
							if (to?.type === 'model3d') return 'model3d'
							return null
						})
						.filter(
							(x): x is 'image' | 'video' | 'model3d' =>
								x === 'image' || x === 'video' || x === 'model3d'
						)
					const uniqueTargetKinds = Array.from(new Set(targetKinds))

					if (
						hasDownstream &&
						(fromMediaType === 'image' || fromMediaType === 'video' || fromMediaType === 'model3d')
					) {
						if (uniqueTargetKinds.some((k) => k !== fromMediaType)) {
							alerts.add(
								t('nodes.comfyui.typeMismatch', {
									anchor: fromAnchorLabel,
									mediaType: fromMediaType
								})
							)
						}
					}

					const anchorNodeIdRaw = comfyAnchorNodeIdFromAnchorId(anchorId)
					const exactNodeCandidates: ComfyBridgeMedia[] = anchorNodeIdRaw
						? media.filter(
								(m: ComfyBridgeMedia) => String(m?.nodeId ?? '').trim() === anchorNodeIdRaw
							)
						: []

					let inferredMediaType: 'image' | 'video' | 'model3d' | null =
						fromMediaType === 'image' || fromMediaType === 'video' || fromMediaType === 'model3d'
							? fromMediaType
							: null

					if (!inferredMediaType && exactNodeCandidates.length) {
						inferredMediaType = inferMediaKind(exactNodeCandidates[0])
					}
					if (!inferredMediaType && uniqueTargetKinds.length === 1) {
						inferredMediaType = uniqueTargetKinds[0]
					}
					if (!inferredMediaType) {
						inferredMediaType = imageMedia.length
							? 'image'
							: videoMedia.length
								? 'video'
								: model3dMedia.length
									? 'model3d'
									: null
					}

					if (!inferredMediaType) {
						if (hasDownstream) {
							alerts.add(t('nodes.comfyui.noMediaOutput', { anchor: fromAnchorLabel }))
						}
						continue
					}

					if (
						hasDownstream &&
						fromMediaType !== 'image' &&
						fromMediaType !== 'video' &&
						fromMediaType !== 'model3d'
					) {
						alerts.add(
							t('nodes.comfyui.unlabeledType', {
								anchor: fromAnchorLabel,
								mediaType: inferredMediaType
							})
						)
					}

					const list =
						inferredMediaType === 'image'
							? imageMedia
							: inferredMediaType === 'video'
								? videoMedia
								: model3dMedia
					if (!list.length) {
						if (hasDownstream) {
							const mediaTypeLabel =
								inferredMediaType === 'image'
									? t('nodes.comfyui.imageType')
									: inferredMediaType === 'video'
										? t('nodes.comfyui.videoType')
										: t('common.model3d')
							alerts.add(
								t('nodes.comfyui.noMediaForAnchor', {
									mediaType: mediaTypeLabel,
									anchor: fromAnchorLabel
								})
							)
						}
						continue
					}

					const exactByKind = exactNodeCandidates.filter(
						(m: ComfyBridgeMedia) => inferMediaKind(m) === inferredMediaType
					)

					let selectedMedia: ComfyBridgeMedia | null
					if (exactByKind.length) {
						selectedMedia = exactByKind[0]
					} else if (exactNodeCandidates.length) {
						selectedMedia = exactNodeCandidates[0]
					} else {
						const idx = fallbackCursor[inferredMediaType]
						if (idx < list.length) {
							selectedMedia = list[idx]
							fallbackCursor[inferredMediaType] += 1
						} else {
							selectedMedia = list[list.length - 1]
						}
					}

					if (!selectedMedia || !String(selectedMedia.url || '').trim()) {
						alerts.add(t('nodes.comfyui.noMatchOutput', { anchor: fromAnchorLabel }))
						continue
					}

					const localizedOutput = await localizeSingleMedia(
						selectedMedia,
						anchorId,
						fromAnchorLabel,
						importedByMediaKey
					)
					if (!localizedOutput) continue

					allLocalizedOutputs.push(localizedOutput)
					assignMap.set(anchorId, mediaKey(selectedMedia))
					localizedByAnchor.set(anchorId, localizedOutput)

					for (const e of edgesForAnchor) {
						const toRecord = payload.store.state.nodesById[e.toNodeId ?? '']
						const to = toRecord as { id?: string; type?: string } | undefined
						if (!to) continue
						let targetKind: 'image' | 'video' | 'model3d' | null = null
						if (to.type === 'image') targetKind = 'image'
						else if (to.type === 'video') targetKind = 'video'
						else if (to.type === 'model3d') targetKind = 'model3d'
						if (!targetKind) continue
						if (targetKind !== localizedOutput.kind) continue
						payload.bindMediaResourceToNode(
							to.id ?? '',
							localizedOutput.kind,
							localizedOutput.url,
							String(localizedOutput.filename || `comfy_${localizedOutput.kind}_${Date.now()}`),
							{
								sourcePath: String(localizedOutput.sourcePath || '').trim() || undefined
							}
						)
					}
				}
			}

			for (const key of Array.from(assignMap.keys())) {
				if (!outputAnchorIdSet.has(key)) assignMap.delete(key)
			}
			for (const key of Array.from(localizedByAnchor.keys())) {
				if (!outputAnchorIdSet.has(key)) localizedByAnchor.delete(key)
			}

			const alertList = Array.from(alerts)
			if (opts?.notifyWarnings !== false && alertList.length) {
				for (const msg of alertList) payload.pushToast(msg, 'warn')
			}
			return { alerts: alertList, outputs: allLocalizedOutputs }
		}

		return run()
	}

	return {
		routeComfyOutputsToConnectedNodes
	}
}
