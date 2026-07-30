import { sanitizeWorkflowMediaUrl } from '../../../../aiworkflow/domain/resource/safeWorkflowUrl'
import type { WorkflowNode, WorkflowSceneDecomposeOutput } from '../../../../aiworkflow/types'
import { t } from '../../../../i18n'

export type InputParamPreviewRef = {
	edgeId?: string
	fromNodeId?: string
	fromAnchorId?: string
	toAnchorId?: string
	kind: 'text' | 'image' | 'video' | 'model3d' | 'audio'
	name?: string
	label?: string
	text?: string
	previewUrl?: string
	meta?: string
}

export type InputTextConnectedRef = InputParamPreviewRef & {
	kind: 'text'
	text: string
}

export const useAIWorkflowTextOutputResolver = (payload: {
	store: {
		state: {
			nodesById: Record<string, WorkflowNode>
			resourcesById: Record<string, unknown>
		}
	}
	getFirstIncomingEdge: (nodeId: string, anchorId?: string) => unknown
	getIncomingEdges: (nodeId: string, anchorId?: string) => unknown[]
	serializeSceneLayoutSelectedPlaceholder: (nodeId: string) => string
	serializeSceneLayoutOutput: (nodeId: string) => string
	nodeResourceUrl: (node: WorkflowNode) => string | null
	nodeImagePreviewUrl: (node: WorkflowNode, maxSize: number) => string | null
}) => {
	const previewText = (value: string, maxLength = 80) => {
		const text = String(value ?? '').trim()
		if (!text) return ''
		return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
	}

	const resolveNodeName = (node: WorkflowNode) =>
		String(node?.alias ?? node?.title ?? '').trim() || undefined

	const resolveVideoPosterUrl = (node: WorkflowNode) => {
		const rid = String(node?.resourceId ?? '').trim()
		if (!rid) return ''
		const resource = payload.store.state.resourcesById[rid] as Record<string, unknown>
		const poster = typeof resource?.posterUrl === 'string' ? String(resource.posterUrl).trim() : ''
		return sanitizeWorkflowMediaUrl(poster) || ''
	}

	const resolveModel3DLabel = (node: WorkflowNode) => {
		const settings = node.model3dSettings
		return String(
			settings?.modelSourceName ??
				settings?.lastInputSourceName ??
				settings?.modelProjectRelativePath ??
				settings?.modelSourcePath ??
				settings?.modelUrl ??
				''
		).trim()
	}

	const connectedTextInputValue = (nodeId: string, inputId: string) => {
		const edge = payload.getFirstIncomingEdge(nodeId, String(inputId ?? '')) as Record<
			string,
			unknown
		> | null
		if (!edge) return ''
		return getTextOutputForNode(String(edge.fromNodeId), undefined, String(edge.fromAnchorId ?? ''))
	}

	const sceneDecomposeTextOutputForAnchor = (node: WorkflowNode, anchorId: string) => {
		if (node.type !== 'scene-decompose') return ''
		const settings = node.sceneDecomposeSettings
		const rawOutputs = settings?.outputs
		const outputs: WorkflowSceneDecomposeOutput[] = Array.isArray(rawOutputs) ? rawOutputs : []
		const item = outputs.find(
			(entry) => String(entry?.textAnchorId ?? '') === String(anchorId ?? '')
		)
		if (item) return String(item.description ?? '').trim()
		return String(outputs[0]?.description ?? '').trim()
	}

	function getTextOutputForNode(
		nodeId: string,
		visited?: Set<string>,
		fromAnchorId?: string
	): string {
		const v = visited ?? new Set<string>()
		const visitKey = fromAnchorId ? `${nodeId}:${fromAnchorId}` : nodeId
		if (v.has(visitKey)) return ''
		v.add(visitKey)

		const node = payload.store.state.nodesById[nodeId]
		if (!node) return ''

		// 调试日志：场景节点文本输出解析（仅开发环境启用）
		const isSceneNodeForDiag =
			import.meta.env.DEV &&
			(node.type === 'scene-layout' ||
				node.type === 'scene-understanding' ||
				node.type === 'scene-decompose')
		const DIAG_KEY_TEXTOUT = `__diag_textOut_${visitKey}`
		if (isSceneNodeForDiag && !(window as any)[DIAG_KEY_TEXTOUT]) {
			;(window as any)[DIAG_KEY_TEXTOUT] = true
			// eslint-disable-next-line no-console
			console.log('[TEXT-OUTPUT DIAG] Resolving for:', {
				nodeId,
				nodeType: node.type,
				fromAnchorId: fromAnchorId ?? '(none)',
				visitKey
			})
		}

		if (node.type === 'text') {
			const n = node as Record<string, unknown>
			const inputs = Array.isArray(n.inputs) ? n.inputs : []
			// text节点现在是单个多模态输入in-0，优先找它
			const inputAnchor = inputs.find((anchor: unknown) => {
				const a = anchor as Record<string, unknown>
				return (
					String(a?.id ?? '') === 'in-0' ||
					String(a?.mediaType ?? '') === 'text' ||
					String(a?.id ?? '') === 'in-text'
				)
			}) as Record<string, unknown> | undefined
			if (inputAnchor?.id) {
				const linkedText = connectedTextInputValue(nodeId, String(inputAnchor.id))
				if (String(linkedText ?? '').trim()) return String(linkedText)
			}
			return String(node.textValue ?? '')
		}
		if (node.type === 'rotate-image') return String(node.rotatePromptText ?? '')
		if (node.type === 'text-merge') return computeMergedText(nodeId, v)
		if (node.type === 'scene-understanding') {
			const result = String(node.sceneUnderstandingSettings?.outputJson ?? '')
			if (isSceneNodeForDiag) {
				// eslint-disable-next-line no-console
				console.log('[TEXT-OUTPUT DIAG] scene-understanding output:', {
					nodeId,
					outputJson_len: result.length,
					outputJson_preview: result ? `${result.slice(0, 200)}...` : '(empty)',
					settings_exists: !!node.sceneUnderstandingSettings,
					status: (node.sceneUnderstandingSettings as any)?.status,
					running: (node as any).running
				})
			}
			return result
		}
		if (node.type === 'scene-decompose') {
			const result = sceneDecomposeTextOutputForAnchor(node, String(fromAnchorId ?? ''))
			if (isSceneNodeForDiag) {
				// eslint-disable-next-line no-console
				console.log('[TEXT-OUTPUT DIAG] scene-decompose output:', {
					nodeId,
					fromAnchorId,
					result_len: result.length,
					result_preview: result ? `${result.slice(0, 200)}...` : '(empty)'
				})
			}
			return result
		}
		if (node.type === 'scene-layout') {
			let result = ''
			if (String(fromAnchorId ?? '') === 'out-selected-placeholder') {
				result = payload.serializeSceneLayoutSelectedPlaceholder(nodeId)
			} else {
				result = payload.serializeSceneLayoutOutput(nodeId)
			}
			// 如果serializeSceneLayoutOutput返回空（例如节点未运行，settings中无inputJson），
			// 则回退到直接透传上游in-json连接的JSON数据
			if (!result && String(fromAnchorId ?? '') !== 'out-selected-placeholder') {
				const jsonEdge = payload.getFirstIncomingEdge(nodeId, 'in-json') as Record<
					string,
					unknown
				> | null
				if (jsonEdge) {
					result = getTextOutputForNode(
						String(jsonEdge.fromNodeId),
						v,
						String(jsonEdge.fromAnchorId ?? '')
					)
				}
			}
			if (isSceneNodeForDiag) {
				const sls = node.sceneLayoutSettings as any
				// eslint-disable-next-line no-console
				console.log('[TEXT-OUTPUT DIAG] scene-layout output:', {
					nodeId,
					fromAnchorId: fromAnchorId ?? '(default out)',
					result_len: result.length,
					result_preview: result ? `${result.slice(0, 200)}...` : '(empty)',
					inputJson_len: String(sls?.inputJson ?? '').length,
					inputJson_preview: sls?.inputJson
						? `${String(sls.inputJson).slice(0, 200)}...`
						: '(empty)',
					layoutItems_count: Array.isArray(sls?.layoutItems) ? sls.layoutItems.length : 0,
					status: sls?.status,
					running: (node as any).running,
					fellBackToUpstream: !payload.serializeSceneLayoutOutput(nodeId) && !!result
				})
			}
			return result
		}
		return ''
	}

	function computeMergedText(nodeId: string, visited?: Set<string>): string {
		const node = payload.store.state.nodesById[nodeId]
		if (!node || node.type !== 'text-merge') return ''
		const items = node.textMergeItems ?? []
		const parts: string[] = []
		for (const item of items) {
			const itemId = String(item?.id ?? '').trim()
			if (!itemId) continue
			const anchorId = `in-${itemId}`
			const edge = payload.getFirstIncomingEdge(nodeId, anchorId) as Record<string, unknown> | null
			if (!edge) continue
			parts.push(
				getTextOutputForNode(String(edge.fromNodeId), visited, String(edge.fromAnchorId ?? ''))
			)
		}
		return parts.join('\n')
	}

	const getInputParamPreviewRefs = (nodeId: string): InputParamPreviewRef[] => {
		const refs: InputParamPreviewRef[] = []
		const seen = new Set<string>()
		const incomingEdges = payload.getIncomingEdges(nodeId)
		const targetNode = payload.store.state.nodesById[nodeId]
		const targetInputs = Array.isArray(targetNode?.inputs) ? targetNode.inputs : []

		for (const edge of incomingEdges) {
			const e = edge as Record<string, unknown>
			const fromNodeId = String(e?.fromNodeId ?? '').trim()
			const toAnchorId = String(e?.toAnchorId ?? '').trim()
			const fromAnchorId = String(e?.fromAnchorId ?? '').trim()
			const edgeId = String(e?.id ?? '').trim()
			if (!fromNodeId) continue
			const fromNode = payload.store.state.nodesById[fromNodeId]
			if (!fromNode) continue

			// 获取目标锚点配置
			const targetAnchor = targetInputs.find((a: any) => String(a?.id ?? '') === toAnchorId)
			const targetMediaType = String(targetAnchor?.mediaType ?? '').trim()
			const targetAcceptedTypes = Array.isArray((targetAnchor as any)?.acceptedMediaTypes)
				? ((targetAnchor as any).acceptedMediaTypes as string[])
				: []

			const base = {
				edgeId: edgeId || undefined,
				fromNodeId: fromNodeId || undefined,
				fromAnchorId: fromAnchorId || undefined,
				toAnchorId: toAnchorId || undefined,
				name: resolveNodeName(fromNode)
			}

			// 根据目标锚点mediaType + 源节点实际输出来判断引用类型
			let refKind: 'text' | 'image' | 'video' | 'model3d' | null = null

			// 1. 如果目标锚点明确指定mediaType，优先使用
			if (targetMediaType === 'text') refKind = 'text'
			else if (targetMediaType === 'image') refKind = 'image'
			else if (targetMediaType === 'video') refKind = 'video'
			else if (targetMediaType === 'model3d') refKind = 'model3d'
			else if (targetMediaType === 'generic') {
				// generic类型根据源节点类型和acceptedMediaTypes判断
				if (
					fromNode.type === 'text' ||
					fromNode.type === 'text-merge' ||
					fromNode.type === 'rotate-image' ||
					fromNode.type === 'scene-understanding' ||
					fromNode.type === 'scene-decompose' ||
					fromNode.type === 'scene-layout'
				) {
					if (targetAcceptedTypes.length === 0 || targetAcceptedTypes.includes('text')) {
						refKind = 'text'
					}
				} else if (fromNode.type === 'image') {
					if (targetAcceptedTypes.length === 0 || targetAcceptedTypes.includes('image')) {
						refKind = 'image'
					}
				} else if (fromNode.type === 'video') {
					if (targetAcceptedTypes.length === 0 || targetAcceptedTypes.includes('video')) {
						refKind = 'video'
					}
				} else if (fromNode.type === 'model3d') {
					if (targetAcceptedTypes.length === 0 || targetAcceptedTypes.includes('model3d')) {
						refKind = 'model3d'
					}
				}
			} else {
				// 无mediaType时降级为源节点类型判断（向后兼容）
				if (
					fromNode.type === 'text' ||
					fromNode.type === 'text-merge' ||
					fromNode.type === 'rotate-image' ||
					fromNode.type === 'scene-understanding' ||
					fromNode.type === 'scene-decompose' ||
					fromNode.type === 'scene-layout'
				) {
					refKind = 'text'
				} else if (fromNode.type === 'image') {
					refKind = 'image'
				} else if (fromNode.type === 'video') {
					refKind = 'video'
				} else if (fromNode.type === 'model3d') {
					refKind = 'model3d'
				}
			}

			if (!refKind) continue

			// 根据refKind收集预览信息
			if (refKind === 'text') {
				const text = getTextOutputForNode(fromNodeId, undefined, fromAnchorId)
				// 即使文本为空也显示连接提示，让用户知道有节点连接上来
				const dedupeKey = edgeId || `${fromNodeId}:${fromAnchorId}:text`
				if (seen.has(dedupeKey)) continue
				seen.add(dedupeKey)
				refs.push({
					...base,
					kind: 'text',
					text: text || '',
					label: previewText(text) || base.name || t('aiworkflow.runtime.textInput')
				})
			} else if (refKind === 'image') {
				const previewUrl =
					sanitizeWorkflowMediaUrl(payload.nodeImagePreviewUrl(fromNode, 160)) ||
					sanitizeWorkflowMediaUrl(payload.nodeResourceUrl(fromNode)) ||
					''
				const dedupeKey = edgeId || `${fromNodeId}:${fromAnchorId}:image:${previewUrl || 'pending'}`
				if (seen.has(dedupeKey)) continue
				seen.add(dedupeKey)
				refs.push({
					...base,
					kind: 'image',
					previewUrl: previewUrl || undefined,
					label: base.name || t('aiworkflow.runtime.imageInput'),
					meta: previewUrl ? t('aiworkflow.runtime.imageResource') : t('aiworkflow.runtime.pending')
				})
			} else if (refKind === 'video') {
				const previewUrl = resolveVideoPosterUrl(fromNode)
				const resourceUrl = sanitizeWorkflowMediaUrl(payload.nodeResourceUrl(fromNode)) || ''
				if (!previewUrl && !resourceUrl) continue
				const dedupeKey =
					edgeId || `${fromNodeId}:${fromAnchorId}:video:${previewUrl || resourceUrl}`
				if (seen.has(dedupeKey)) continue
				seen.add(dedupeKey)
				refs.push({
					...base,
					kind: 'video',
					previewUrl: previewUrl || undefined,
					label: base.name || t('aiworkflow.runtime.videoInput'),
					meta: t('aiworkflow.runtime.videoResource')
				})
			} else if (refKind === 'model3d') {
				const modelLabel = resolveModel3DLabel(fromNode)
				if (!modelLabel) continue
				const dedupeKey = edgeId || `${fromNodeId}:${fromAnchorId}:model3d:${modelLabel}`
				if (seen.has(dedupeKey)) continue
				seen.add(dedupeKey)
				refs.push({
					...base,
					kind: 'model3d',
					label: base.name || t('aiworkflow.runtime.model3dInput'),
					meta: previewText(modelLabel, 60)
				})
			}
		}
		return refs
	}

	const getInputTextConnectedRefs = (nodeId: string): InputTextConnectedRef[] => {
		return getInputParamPreviewRefs(nodeId).filter(
			(item): item is InputTextConnectedRef => item.kind === 'text' && !!item.text
		)
	}

	return {
		connectedTextInputValue,
		sceneDecomposeTextOutputForAnchor,
		getTextOutputForNode,
		computeMergedText,
		getInputParamPreviewRefs,
		getInputTextConnectedRefs
	}
}
