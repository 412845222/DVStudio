import type { ComfyBridgeMedia, ComfyLocalizedOutput } from './comfyOutputResolver'
import { comfyAnchorNodeIdFromAnchorId, inferMediaKind } from './comfyOutputResolver'
import { t } from '../../../../i18n'

/**
 * 纯函数：为 ComfyUI 返回的媒体对象生成主键。
 *
 * 为什么用 url 做主键（并附带 subfolder/type 防御）？
 * - 历史上 key 包含 nodeId + filename，当两次任务的 ComfyUI 默认文件名一致（如 video.mp4、
 *   ComfyUI_00001_.png）就会错误命中缓存，把旧任务的媒体当作新任务的路由给下游节点；
 * - 现在 url 本身就带 prompt_id / filename / subfolder（ComfyUI /view 接口规范），
 *   所以「url 不同」等价于「不同输出」，可以直接保证去重正确性。
 */
export const buildComfyMediaKey = (
	m: Pick<ComfyBridgeMedia, 'subfolder' | 'type' | 'url'>
): string => {
	const urlClean = String(m?.url ?? '').trim()
	return `${String(m?.subfolder ?? '')}|${String(m?.type ?? '')}|${urlClean}`
}

type BuildDesiredFilenameInput = {
	filename?: string | null | undefined
	kind: 'image' | 'video' | 'model3d'
	url?: string | null | undefined
	now?: number
	random2?: string
	origin?: string | null | undefined
}

/**
 * 纯函数：构造 ComfyUI 输出的唯一落盘文件名。
 *
 * 设计原则：
 * 1. 保留原文件扩展名（未知时按 kind → .mp4/.png/.glb 兜底）；
 * 2. 优先用 url query 里的 prompt_id 后 8 位（或 filename/subfolder 兜底）做 token，
 *    便于人眼比对 ComfyUI 任务 ID；
 * 3. 强制追加 _t<13位时间戳><2位随机> 后缀，保证即使用户两次提交相同工作流、
 *    ComfyUI 又返回相同 filename，落盘也绝对不会重名，downloadUrlToProjectRoot
 *    就不会错误地把旧媒体路径返回给新版本节点。
 */
export const buildDesiredComfyMediaFilename = (input: BuildDesiredFilenameInput): string => {
	const { filename, kind, url, origin } = input
	const now = typeof input.now === 'number' ? input.now : Date.now()
	const random2 =
		typeof input.random2 === 'string'
			? input.random2.padStart(2, '0').slice(0, 2)
			: Math.floor(Math.random() * 100)
					.toString()
					.padStart(2, '0')

	const rawName = String(filename || '').trim()
	const baseName = (() => {
		if (rawName) {
			const dot = rawName.lastIndexOf('.')
			if (dot <= 0) return rawName
			return rawName.slice(0, dot)
		}
		return `comfy_${kind}`
	})()
	const ext = (() => {
		if (rawName) {
			const dot = rawName.lastIndexOf('.')
			if (dot >= 0) return rawName.slice(dot).toLowerCase()
		}
		if (kind === 'video') return '.mp4'
		if (kind === 'image') return '.png'
		return '.glb'
	})()

	let promptIdToken = ''
	const selectedUrl = String(url || '').trim()
	const effectiveOrigin =
		origin && typeof origin === 'string'
			? origin
			: typeof window !== 'undefined'
				? window.location.origin
				: 'http://localhost'
	try {
		const u = new URL(selectedUrl, effectiveOrigin)
		const pidTok = u.searchParams.get('prompt_id') || u.searchParams.get('promptId') || ''
		const fnTok = u.searchParams.get('filename') || ''
		const sfTok = u.searchParams.get('subfolder') || ''
		if (pidTok) promptIdToken = `_${pidTok.slice(-8)}`
		else if (fnTok || sfTok) {
			promptIdToken = `_${(sfTok + '_' + fnTok).replace(/[^a-zA-Z0-9_-]/g, '_').slice(-24)}`
		}
	} catch {
		// ignore parse errors
	}
	return `${baseName}${promptIdToken}_t${now}${random2}${ext}`
}

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
		if (typeof console !== 'undefined') {
			console.log(
				'%c[ComfyUI][OutputRouter] 🚚 routeComfyOutputsToConnectedNodes 启动',
				'color:#4f46e5;font-weight:bold',
				{
					comfyNodeId,
					outputAnchorIds,
					validMediaCnt: validMedia.length,
					validMedia: validMedia.map((m, idx) => ({
						idx,
						nodeId: m.nodeId,
						filename: m.filename,
						subfolder: m.subfolder,
						type: m.type,
						kind: inferMediaKind(m),
						url: String(m.url ?? '').slice(0, 160)
					}))
				}
			)
		}
		const imageMedia = validMedia.filter((m) => inferMediaKind(m) === 'image')
		const videoMedia = validMedia.filter((m) => inferMediaKind(m) === 'video')
		const model3dMedia = validMedia.filter((m) => inferMediaKind(m) === 'model3d')
		const alerts = new Set<string>()

		// FX6：mediaKey 改为以 ComfyUI 返回的「原始下载 url」为主键（最后包含 prompt_id / subfolder / filename）
		//   之前的 key = nodeId|filename|subfolder|type|url：当两次任务输出文件名相同（video.mp4 / ComfyUI_00001_.png 等常见默认名）
		//   且旧 url 恰好包含旧 filename 时，downloadUrlToProjectRoot 会返回已存在的同名文件，从而把新视频覆盖成旧内容。
		//   现在 key 去掉 nodeId/filename，只用 url（也带上 subfolder/type 作为防御性字段），保证「url 不同 → 必定重下」。
		// 注：该逻辑已抽取为 buildComfyMediaKey 纯函数（文件顶部），便于单元测试与外部复用。
		const mediaKey = (m: ComfyBridgeMedia) => buildComfyMediaKey(m)

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
				if (typeof console !== 'undefined') {
					console.log(
						`%c[ComfyUI][OutputRouter] ♻️ 命中 importedByMediaKey 缓存（url 相同跳过下载）` +
							` anchor=${anchorId} kind=${inferredMediaType}`,
						'color:#0ea5e9',
						{ filename: selectedMedia.filename, urlLen: String(selectedMedia.url ?? '').length }
					)
				}
				return { ...localizedOutput, anchorId }
			}

			const pid = Number(payload.currentProjectId.value ?? 0)
			const selectedUrl = String(selectedMedia.url || '').trim()
			// FX6：desiredFilename 增加时间戳+随机两位后缀（或用 url 里的 promptId），
			//   保证「两次任务即使 ComfyUI 产出相同 basename（video.mp4 / ComfyUI_00001_.png）」，
			//   落盘到 ProjectRoot 也不会重名，从而彻底避免 downloadUrlToProjectRoot 命中旧文件。
			// 注：该逻辑已抽取为 buildDesiredComfyMediaFilename 纯函数（文件顶部），便于单元测试与外部复用。
			const desiredName = buildDesiredComfyMediaFilename({
				filename: selectedMedia.filename,
				kind: inferredMediaType,
				url: selectedUrl
			})
			let localizedFromElectron = false

			if (
				payload.isElectron() &&
				Number.isFinite(pid) &&
				pid > 0 &&
				selectedUrl &&
				typeof payload.downloadUrlToProjectRoot === 'function'
			) {
				try {
					if (typeof console !== 'undefined') {
						console.log(
							`%c[ComfyUI][OutputRouter] ⬇️ downloadUrlToProjectRoot 开始下载：anchor=${anchorId} kind=${inferredMediaType}`,
							'color:#0ea5e9;font-weight:bold',
							{
								filename: selectedMedia.filename,
								desiredName,
								url: selectedUrl.slice(0, 140)
							}
						)
					}
					const dl = await payload.downloadUrlToProjectRoot(pid, selectedUrl, desiredName)
					const rel = String(dl?.relativePath || '').trim()
					const abs = String(dl?.absolutePath || '').trim()
					const size = Number(dl?.size ?? 0)
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
						if (typeof console !== 'undefined') {
							console.log(
								`%c[ComfyUI][OutputRouter] ✅ 下载成功 anchor=${anchorId} kind=${inferredMediaType} size=${size} bytes`,
								'color:#10b981;font-weight:bold',
								{ rel, abs, url: localizedOutput.url }
							)
						}
					} else if (typeof console !== 'undefined') {
						console.warn(
							`%c[ComfyUI][OutputRouter] ❌ downloadUrlToProjectRoot 失败（ok=false or path 空）`,
							'color:#b91c1c;font-weight:bold',
							{ dl, filename: selectedMedia.filename, desiredName }
						)
					}
				} catch (err) {
					if (typeof console !== 'undefined') {
						console.warn(`[ComfyUI][OutputRouter] downloadUrlToProjectRoot 抛异常:`, err)
					}
					// ignore and fallback
				}
			}

			if (!localizedFromElectron && payload.isElectron()) {
				// Electron 下载失败时，兜底使用远程 URL 直接绑定，避免 AutoWire 创建空节点
				if (selectedUrl.startsWith('http') || selectedUrl.startsWith('dweb://')) {
					localizedOutput = {
						kind: inferredMediaType,
						url: selectedUrl,
						filename: desiredName,
						anchorId,
						nodeId: String(selectedMedia.nodeId ?? '').trim() || undefined,
						subfolder: String(selectedMedia.subfolder || '').trim() || undefined,
						type: String(selectedMedia.type || '').trim() || undefined
					}
					importedByMediaKey.set(key, localizedOutput)
					alerts.add(t('nodes.comfyui.downloadFailed', { anchor: anchorLabel }))
					if (typeof console !== 'undefined') {
						console.warn(
							`[ComfyUI][OutputRouter] ⚠️ 兜底远程 URL：anchor=${anchorId} kind=${inferredMediaType}`,
							selectedUrl.slice(0, 160)
						)
					}
					return localizedOutput
				}
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
					// importAsset 失败时兜底使用远程 URL
					if (selectedUrl.startsWith('http') || selectedUrl.startsWith('dweb://')) {
						localizedOutput = {
							kind: inferredMediaType,
							url: selectedUrl,
							filename: desiredName,
							anchorId,
							nodeId: String(selectedMedia.nodeId ?? '').trim() || undefined,
							subfolder: String(selectedMedia.subfolder || '').trim() || undefined,
							type: String(selectedMedia.type || '').trim() || undefined
						}
						importedByMediaKey.set(key, localizedOutput)
						return localizedOutput
					}
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
			if (typeof console !== 'undefined') {
				console.log(
					'%c[ComfyUI][OutputRouter] 🏁 返回结果：最终写入 comfyuiSettings.outputs 的 localizedOutputs 如下',
					'color:#10b981;font-weight:bold',
					{
						alerts: alertList,
						outputsCnt: allLocalizedOutputs.length,
						outputs: allLocalizedOutputs.map((o, idx) => ({
							idx,
							anchorId: o.anchorId,
							kind: o.kind,
							filename: o.filename,
							sourcePath: o.sourcePath,
							url: String(o.url ?? '').slice(0, 180)
						}))
					}
				)
			}
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
