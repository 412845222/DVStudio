import type { WorkflowNode } from '../../../../aiworkflow/types'
import type { WorkflowThreePreviewState } from '../../../../ui/WorkFlow/WorlFlowNodes/three-preview/types'
import { sanitizeMeshyPreviewUrl } from '../meshy/useAIWorkflowMeshyAssets'
import {
	sanitizeWorkflowMediaUrl,
	sanitizeWorkflowUrlFieldsDeep
} from '../../../../aiworkflow/domain/resource/safeWorkflowUrl'

import type { InputParamPreviewRef } from './useAIWorkflowTextOutputResolver'
import { watch } from 'vue'

const DEBUG_LOG = true
const log = (...args: any[]) => {
	if (DEBUG_LOG) console.log('[NodeExtraProps]', ...args)
}

const THREE_PREVIEW_TYPES = new Set<WorkflowNode['type']>(['scene-layout', 'model3d'])
const THREE_STATE_HOLD_MS = 800

export const useAIWorkflowNodeExtraProps = (payload: {
	store: {
		state: {
			resourcesById: Record<string, unknown>
			nodesById: Record<string, unknown>
		}
		commit: (mutation: string, payload: unknown) => void
	}
	connectedTextInputValue: (nodeId: string, inputId: string) => string
	computeMergedText: (nodeId: string, visited?: Set<string>) => string
	getInputParamPreviewRefs: (nodeId: string) => InputParamPreviewRef[]
	storyPreview: (node: WorkflowNode) => {
		kind: 'image' | 'video' | null
		url: string | null
		cropEnabled: boolean
		crop: null | { x: number; y: number; width: number; height: number }
	}
	nodeImagePreviewUrl: (node: WorkflowNode, maxSize: number) => string | null
	nodeImagePreviewVersion: (node: WorkflowNode) => string | null
	nodeResourceUrl: (node: WorkflowNode) => string | null
	nodeResourceName: (node: WorkflowNode) => string | null
	rotateImagePreviewUrl: (node: WorkflowNode) => string | null
	connectedSceneUnderstandImageInputs: (
		nodeId: string
	) => Array<{ url: string; width?: number; height?: number }>
	connectedImageInputUrl: (nodeId: string, inputId: string) => string | null
	connectedImageInputSource: (
		nodeId: string,
		inputId: string
	) => { url: string; width?: number; height?: number } | null
	connectedSceneDecomposeImageInputs: (
		nodeId: string
	) => Array<{ url: string; width?: number; height?: number }>
	connectedSceneLayoutModelBindings: (nodeId: string) => unknown[]
	viewportMotionActive: { value: boolean }
	active3DPreviewNodeId: { value: string }
	getThreePreviewState: (
		nodeId: string,
		nodeType: WorkflowNode['type']
	) => WorkflowThreePreviewState | null
	performancePriorityMode: { value: boolean }
	nodeCount: { value: number }
	connectedMeshySourcePreview: (nodeId: string) => { url: string; label: string }
	buildMeshyNodePresentationSettings: (
		settings: Record<string, unknown> | null | undefined
	) => Record<string, unknown> | null
	connectedMeshyPrompt: (nodeId: string) => string
	connectedMeshyImageUrls: (nodeId: string) => string[]
	nodeMediaReloadToken: (nodeId: string) => number
	getFirstIncomingEdge: (nodeId: string, anchorId?: string) => Record<string, unknown> | null
	getUpstreamCroppedImageUrl: (node: WorkflowNode) => string | null
	getTextOutputForNode?: (nodeId: string, visited?: Set<string>, fromAnchorId?: string) => string
}) => {
	const extraPropsCache = new Map<string, Record<string, unknown>>()
	const threeStateHoldover = new Map<string, { state: WorkflowThreePreviewState; until: number }>()

	const getProtectedThreePreviewState = (
		nodeId: string,
		nodeType: WorkflowNode['type']
	): WorkflowThreePreviewState | null => {
		const fresh = payload.getThreePreviewState(nodeId, nodeType)
		if (!fresh) return fresh
		const now = Date.now()
		const holdover = threeStateHoldover.get(nodeId)
		if (holdover && now < holdover.until) {
			if (fresh.phase === 'masked' && holdover.state.phase !== 'masked') {
				log('getProtectedThreePreviewState: holding over non-masked state:', {
					nodeId,
					heldPhase: holdover.state.phase,
					freshPhase: fresh.phase,
					remainingMs: holdover.until - now
				})
				return holdover.state
			}
		}
		if (fresh.phase !== 'masked') {
			threeStateHoldover.set(nodeId, { state: { ...fresh }, until: now + THREE_STATE_HOLD_MS })
		} else {
			threeStateHoldover.delete(nodeId)
		}
		return fresh
	}

	const getUpstreamPassThroughImageNode = (node: WorkflowNode): WorkflowNode | null => {
		if (node.type !== 'image') return null
		if (node.resourceId) return null
		// 按优先级查找图片输入边：in-0 (新多模态) > in-image > in-resource
		let edge = payload.getFirstIncomingEdge(node.id, 'in-0')
		if (!edge) edge = payload.getFirstIncomingEdge(node.id, 'in-image')
		if (!edge) edge = payload.getFirstIncomingEdge(node.id, 'in-resource')
		if (!edge) return null
		const fromNode = payload.store.state.nodesById[String(edge.fromNodeId)] as
			| WorkflowNode
			| undefined
		if (!fromNode || fromNode.type !== 'image') return null
		if (!fromNode.resourceId) return null
		return fromNode
	}

	const resolveImageNodeEffectiveSource = (
		node: WorkflowNode
	): { sourceNode: WorkflowNode; isPassThrough: boolean } | null => {
		if (node.type !== 'image') return null
		if (node.resourceId) {
			return { sourceNode: node, isPassThrough: false }
		}
		const upstream = getUpstreamPassThroughImageNode(node)
		if (upstream) {
			return { sourceNode: upstream, isPassThrough: true }
		}
		return null
	}

	const buildImageNodeProps = (node: WorkflowNode) => {
		const effective = resolveImageNodeEffectiveSource(node)
		const sourceNode = effective?.sourceNode ?? node
		const isPassThrough = effective?.isPassThrough ?? false

		const rid = String(sourceNode.resourceId ?? '').trim()
		const resource = rid ? payload.store.state.resourcesById[rid] : null
		const resourceSourcePath =
			resource && typeof (resource as Record<string, unknown>).sourcePath === 'string'
				? String((resource as Record<string, unknown>).sourcePath).trim()
				: ''

		const imagePreviewUrl320 = sanitizeWorkflowMediaUrl(
			payload.nodeImagePreviewUrl(sourceNode, 320)
		)
		const imagePreviewUrl640 = sanitizeWorkflowMediaUrl(
			payload.nodeImagePreviewUrl(sourceNode, 640)
		)
		const imagePreviewVersion = String(payload.nodeImagePreviewVersion(sourceNode) ?? '').trim()

		const imageSettings = isPassThrough
			? (sourceNode.imageSettings ?? null)
			: (node.imageSettings ?? null)

		const upstreamCroppedImageUrl = isPassThrough ? payload.getUpstreamCroppedImageUrl(node) : null

		return {
			resourceUrl:
				upstreamCroppedImageUrl || sanitizeWorkflowMediaUrl(payload.nodeResourceUrl(sourceNode)),
			resourceSourcePath: resourceSourcePath || null,
			// 始终保留预览图，不清空已加载的图片
			resourcePreviewUrl320: imagePreviewUrl320 || null,
			resourcePreviewUrl640: imagePreviewUrl640 || imagePreviewUrl320 || null,
			resourcePreviewVersion: imagePreviewVersion || null,
			resourceName: payload.nodeResourceName(sourceNode),
			// 始终保留输入参数引用
			inputParamPreviewRefs: payload.getInputParamPreviewRefs(node.id),
			imageSettings,
			upstreamCroppedImageUrl: upstreamCroppedImageUrl
		}
	}

	const ALWAYS_SHED_THRESHOLD = 220

	const shouldShedHeavyMedia = () => {
		if (!payload.performancePriorityMode.value) return false
		const count = Number(payload.nodeCount.value) || 0
		if (count >= ALWAYS_SHED_THRESHOLD) return true
		// 运动期间不再因节点数阈值清空资源，由缓存机制保证
		return false
	}

	// buildMotionReducedProps 已废弃，运动期间不再调用
	// @deprecated use buildNodeExtraProps instead
	const buildMotionReducedProps = (_node: WorkflowNode): Record<string, unknown> => {
		return {}
	}

	const buildNodeExtraProps = (node: WorkflowNode): Record<string, unknown> => {
		// Helper: 直接从 Vuex store 获取最新节点数据，避免通过 Proxy 读取 BlueprintNode.data 中的旧数据。
		// 根因：applyInitialData 的 computeStructureHash 只包含位置/尺寸，不包含 settings 字段，
		// 导致 store 的 settings 变更后 BlueprintNode.data 不会同步更新，Proxy 返回过期数据。
		const getStoreNode = (id: string) =>
			payload.store.state.nodesById[id] as Record<string, unknown> | undefined
		const storeNode = getStoreNode(node.id)

		if (node.type === 'text') {
			const linkedInput =
				Array.isArray(node.inputs) && node.inputs.length
					? payload.connectedTextInputValue(node.id, String(node.inputs[0]?.id ?? ''))
					: ''
			const currentTextValue = String(node.textValue ?? '')
			const effectiveText = String(linkedInput || currentTextValue || '')
			if (linkedInput && linkedInput !== currentTextValue) {
				queueMicrotask(() => {
					payload.store.commit('setNodeTextValue', { nodeId: node.id, textValue: linkedInput })
				})
			}
			return {
				textValue: effectiveText,
				inputParamPreviewRefs: payload.getInputParamPreviewRefs(node.id)
			}
		}
		if (node.type === 'text-merge') {
			const items = Array.isArray((node as Record<string, unknown>).textMergeItems)
				? (node as Record<string, unknown>).textMergeItems
				: []
			return {
				mergeItems: items,
				mergedText: payload.computeMergedText(node.id)
			}
		}
		if (node.type === 'story') {
			const preview = payload.storyPreview(node)
			const storySettings = storeNode?.storySettings as Record<string, unknown> | undefined
			const pw = storySettings?.previewWidth
			const ph = storySettings?.previewHeight
			return {
				branches: node.branches || [],
				previewUrl: sanitizeWorkflowMediaUrl(preview.url),
				previewKind: preview.kind,
				previewCropEnabled: preview.kind === 'image' ? preview.cropEnabled : false,
				previewCrop: preview.kind === 'image' ? preview.crop : null,
				previewWidth: Number.isFinite(Number(pw)) ? Number(pw) : 1920,
				previewHeight: Number.isFinite(Number(ph)) ? Number(ph) : 1080
			}
		}
		if (node.type === 'image') {
			return buildImageNodeProps(node)
		}
		if (node.type === 'video') {
			const rid = String(node.resourceId ?? '').trim()
			const resource = rid ? payload.store.state.resourcesById[rid] : null
			const resourceSourcePath =
				resource && typeof (resource as Record<string, unknown>).sourcePath === 'string'
					? String((resource as Record<string, unknown>).sourcePath).trim()
					: ''
			const imagePreviewUrl320 = sanitizeWorkflowMediaUrl(payload.nodeImagePreviewUrl(node, 320))
			const imagePreviewUrl640 = sanitizeWorkflowMediaUrl(payload.nodeImagePreviewUrl(node, 640))
			const imagePreviewVersion = String(payload.nodeImagePreviewVersion(node) ?? '').trim()
			const resourcePosterUrl = (() => {
				if (!rid) return null
				const raw =
					typeof (resource as Record<string, unknown>)?.posterUrl === 'string'
						? String((resource as Record<string, unknown>).posterUrl).trim()
						: ''
				const safe = sanitizeWorkflowMediaUrl(raw)
				return safe || null
			})()
			return {
				resourceUrl: sanitizeWorkflowMediaUrl(payload.nodeResourceUrl(node)),
				resourceSourcePath: resourceSourcePath || null,
				resourcePreviewUrl320: imagePreviewUrl320 || null,
				resourcePreviewUrl640: imagePreviewUrl640 || imagePreviewUrl320 || null,
				resourcePreviewVersion: imagePreviewVersion || null,
				resourceName: payload.nodeResourceName(node),
				inputParamPreviewRefs: payload.getInputParamPreviewRefs(node.id),
				posterUrl: resourcePosterUrl,
				videoSettings: (storeNode?.videoSettings ?? null) as Record<string, unknown> | null,
				screenshotEnabled: true,
				reloadToken: payload.nodeMediaReloadToken(node.id)
			}
		}
		if (node.type === 'rotate-image') {
			return {
				inputUrl: sanitizeWorkflowMediaUrl(payload.rotateImagePreviewUrl(node)),
				rotatePromptText: String((node as Record<string, unknown>).rotatePromptText ?? '')
			}
		}
		if (node.type === 'scene-understanding') {
			const linkedImages = payload.connectedSceneUnderstandImageInputs(node.id)
			const shedHeavyMedia = shouldShedHeavyMedia()
			return {
				sceneUnderstandingSettings: (storeNode?.sceneUnderstandingSettings ?? null) as Record<
					string,
					unknown
				> | null,
				linkedImageUrl: shedHeavyMedia
					? ''
					: sanitizeWorkflowMediaUrl(
							linkedImages[0]?.url ?? payload.connectedImageInputUrl(node.id, 'in-image')
						),
				linkedImageUrls: shedHeavyMedia
					? []
					: linkedImages.map((item) => sanitizeWorkflowMediaUrl(item.url)).filter(Boolean),
				linkedLayoutJsonText: payload.connectedTextInputValue(node.id, 'in-layout-json'),
				linkedPromptText: payload.connectedTextInputValue(node.id, 'in-text')
			}
		}
		if (node.type === 'scene-decompose') {
			const linkedImages = payload.connectedSceneDecomposeImageInputs(node.id)
			const shedHeavyMedia = shouldShedHeavyMedia()
			return {
				sceneDecomposeSettings: (storeNode?.sceneDecomposeSettings ?? null) as Record<
					string,
					unknown
				> | null,
				linkedImageUrls: shedHeavyMedia
					? []
					: linkedImages.map((item) => sanitizeWorkflowMediaUrl(item.url)).filter(Boolean),
				linkedJsonText: payload.connectedTextInputValue(node.id, 'in-json')
			}
		}
		if (node.type === 'scene-layout') {
			const linkedJsonText = payload.connectedTextInputValue(node.id, 'in-json')
			const linkedLightingJsonText = payload.connectedTextInputValue(node.id, 'in-lighting-json')

			// ============== 场景布局节点全链路诊断（只在首次遇到该节点时打印一次）==============
			const DIAG_KEY = `__diag_sceneLayout_${node.id}`
			if (!(window as any)[DIAG_KEY]) {
				;(window as any)[DIAG_KEY] = true
				// eslint-disable-next-line no-console
				console.log('═══════════════════════════════════════════════════════════')
				// eslint-disable-next-line no-console
				console.log('[SCENE-LAYOUT CHAIN DIAG] START for nodeId =', node.id)

				// 1. 当前节点 inputs 定义
				const myInputs = Array.isArray(node.inputs)
					? node.inputs.map((a) => ({ id: a.id, label: a.label, mediaType: a.mediaType }))
					: []
				// eslint-disable-next-line no-console
				console.log('[SCENE-LAYOUT CHAIN DIAG] node.inputs =', myInputs)

				// 2. 从 store 里直接抓所有 edges
				const storeState: any = payload.store.state
				const allEdges: any[] = Object.values(storeState.edgesById ?? {})
				const incomingToMe = allEdges.filter((e: any) => String(e?.toNodeId ?? '') === node.id)
				// eslint-disable-next-line no-console
				console.log(
					'[SCENE-LAYOUT CHAIN DIAG] total edges in store =',
					allEdges.length,
					', edges pointing TO this scene-layout node:',
					incomingToMe.map((e) => ({
						id: e.id,
						fromNodeId: e.fromNodeId,
						fromAnchorId: e.fromAnchorId,
						toNodeId: e.toNodeId,
						toAnchorId: e.toAnchorId
					}))
				)

				// 3. 对每个 incoming edge 打印 upstream 节点信息
				const nodesById: Record<string, any> = storeState.nodesById ?? {}
				incomingToMe.forEach((e: any, idx: number) => {
					const upId = String(e?.fromNodeId ?? '')
					const upNode = upId ? nodesById[upId] : null
					// eslint-disable-next-line no-console
					console.log(`[SCENE-LAYOUT CHAIN DIAG] incoming#${idx} toAnchorId="${e?.toAnchorId}"`, {
						edgeId: e?.id,
						fromAnchorId: e?.fromAnchorId,
						upstreamNodeExists: !!upNode,
						upstreamNodeType: upNode?.type,
						upstreamNodeId: upId
					})
					if (upNode) {
						if (upNode.type === 'scene-understanding') {
							const sus = upNode.sceneUnderstandingSettings
							// eslint-disable-next-line no-console
							console.log(
								`[SCENE-LAYOUT CHAIN DIAG] incoming#${idx} upstream sceneUnderstandingSettings:`,
								{
									mode: sus?.mode,
									outputJson_len: String(sus?.outputJson ?? '').length,
									outputJson_preview: sus?.outputJson
										? `${String(sus.outputJson).slice(0, 300)}...`
										: '(empty/undefined)',
									outputJson_isString: typeof sus?.outputJson === 'string',
									running: upNode.running,
									error: upNode.error
								}
							)
						} else {
							// 其他 upstream 类型，列出主要字段
							// eslint-disable-next-line no-console
							console.log(
								`[SCENE-LAYOUT CHAIN DIAG] incoming#${idx} upstream node data keys:`,
								Object.keys(upNode).filter((k) => /output|text|result|json/i.test(k))
							)
						}
						// upstream 的 outputs 锚点
						const upOutputs = Array.isArray(upNode.outputs)
							? upNode.outputs.map((a: any) => ({
									id: a.id,
									label: a.label,
									mediaType: a.mediaType
								}))
							: []
						// eslint-disable-next-line no-console
						console.log(`[SCENE-LAYOUT CHAIN DIAG] incoming#${idx} upstream.outputs =`, upOutputs)
					}
				})

				// 4. getFirstIncomingEdge('in-json') 的结果
				try {
					const incJson = payload.getFirstIncomingEdge(node.id, 'in-json')
					// eslint-disable-next-line no-console
					console.log(
						'[SCENE-LAYOUT CHAIN DIAG] getFirstIncomingEdge(nodeId, "in-json") =',
						incJson
							? {
									id: incJson.id,
									fromNodeId: (incJson as any).fromNodeId,
									fromAnchorId: (incJson as any).fromAnchorId,
									toAnchorId: (incJson as any).toAnchorId
								}
							: null
					)
				} catch (err) {
					// eslint-disable-next-line no-console
					console.log('[SCENE-LAYOUT CHAIN DIAG] getFirstIncomingEdge threw:', err)
				}

				// 5. connectedTextInputValue 结果
				// eslint-disable-next-line no-console
				console.log('[SCENE-LAYOUT CHAIN DIAG] connectedTextInputValue("in-json") result:', {
					type: typeof linkedJsonText,
					len: String(linkedJsonText ?? '').length,
					preview: linkedJsonText
						? `${String(linkedJsonText).slice(0, 200)}...`
						: '(empty/null/undefined)'
				})

				// 6. sceneLayoutSettings.inputJson（用户手动输入的兜底 JSON）
				const sls = storeNode?.sceneLayoutSettings as any
				// eslint-disable-next-line no-console
				console.log('[SCENE-LAYOUT CHAIN DIAG] storeNode.sceneLayoutSettings.inputJson:', {
					exists: !!sls?.inputJson,
					len: String(sls?.inputJson ?? '').length,
					preview: sls?.inputJson ? `${String(sls.inputJson).slice(0, 200)}...` : '(empty)'
				})

				// eslint-disable-next-line no-console
				console.log('[SCENE-LAYOUT CHAIN DIAG] END')
				// eslint-disable-next-line no-console
				console.log('═══════════════════════════════════════════════════════════')
			}

			const storeSceneLayoutSettings = (storeNode?.sceneLayoutSettings ?? null) as Record<
				string,
				unknown
			> | null

			return {
				sceneLayoutSettings: sanitizeWorkflowUrlFieldsDeep(storeSceneLayoutSettings),
				linkedJsonText,
				linkedLightingJsonText,
				sceneLayoutModelBindings: sanitizeWorkflowUrlFieldsDeep(
					payload.connectedSceneLayoutModelBindings(node.id)
				),
				threePreviewState: getProtectedThreePreviewState(node.id, node.type)
			}
		}
		if (node.type === 'unreal-export') {
			return {
				unrealExportSettings: (storeNode?.unrealExportSettings ?? null) as Record<
					string,
					unknown
				> | null,
				linkedLayoutJsonText: payload.connectedTextInputValue(node.id, 'in-layout-json'),
				linkedLightingJsonText: payload.connectedTextInputValue(node.id, 'in-lighting-json')
			}
		}
		if (node.type === 'comfyui') {
			return {
				comfyuiSettings: (storeNode?.comfyuiSettings ?? null) as Record<string, unknown> | null
			}
		}
		if (node.type === 'model3d') {
			return {
				model3dSettings: sanitizeWorkflowUrlFieldsDeep(
					(storeNode?.model3dSettings ?? null) as Record<string, unknown> | null
				),
				threePreviewState: getProtectedThreePreviewState(node.id, node.type),
				inputParamPreviewRefs: payload.getInputParamPreviewRefs(node.id)
			}
		}
		if (node.type === 'meshy') {
			const sourcePreview = payload.connectedMeshySourcePreview(node.id)
			const shedHeavyMedia = shouldShedHeavyMedia()
			return {
				meshySettings: payload.buildMeshyNodePresentationSettings(
					(storeNode?.meshySettings ?? null) as Record<string, unknown> | null
				),
				connectedPrompt: payload.connectedMeshyPrompt(node.id),
				connectedImageUrls: shedHeavyMedia
					? []
					: payload
							.connectedMeshyImageUrls(node.id)
							.map((url) => sanitizeWorkflowMediaUrl(url))
							.filter(Boolean),
				sourcePreviewUrl: shedHeavyMedia
					? ''
					: sanitizeWorkflowMediaUrl(sanitizeMeshyPreviewUrl(sourcePreview.url)),
				sourcePreviewLabel: sourcePreview.label,
				inputParamPreviewRefs: payload.getInputParamPreviewRefs(node.id)
			}
		}
		if (node.type === 'blender') {
			return {
				blenderSettings: (storeNode?.blenderSettings ?? null) as Record<string, unknown> | null,
				inputParamPreviewRefs: payload.getInputParamPreviewRefs(node.id)
			}
		}
		return {}
	}

	const nodeExtraProps = (node: WorkflowNode) => {
		const nodeId = String(node.id ?? '').trim()
		if (!nodeId) return buildNodeExtraProps(node)

		const isMotionActive = payload.viewportMotionActive.value
		const isThreePreview = THREE_PREVIEW_TYPES.has(node.type)

		if (isMotionActive) {
			const cached = extraPropsCache.get(nodeId)
			if (cached) {
				if (isThreePreview) {
					const currentFresh = getProtectedThreePreviewState(nodeId, node.type)
					if (currentFresh) {
						const cachedThree = (cached as Record<string, unknown>).threePreviewState as
							| WorkflowThreePreviewState
							| undefined
						if (cachedThree && currentFresh.phase !== 'masked' && cachedThree.phase === 'masked') {
							;(cached as Record<string, unknown>).threePreviewState = currentFresh
						} else if (
							currentFresh.phase === 'masked' &&
							cachedThree &&
							cachedThree.phase !== 'masked'
						) {
							// keep cached non-masked state during motion
						}
					}
				}
				return {
					...cached,
					previewSuspended: isThreePreview
				}
			}

			const next = buildNodeExtraProps(node)
			extraPropsCache.set(nodeId, next)
			return {
				...next,
				previewSuspended: isThreePreview
			}
		}

		const full = buildNodeExtraProps(node)
		extraPropsCache.set(nodeId, full)

		if (isThreePreview) {
			const ts = full.threePreviewState as WorkflowThreePreviewState | null
			log('nodeExtraProps (non-motion, three-preview):', {
				nodeId,
				nodeType: node.type,
				phase: ts?.phase,
				canStart: ts?.canStart,
				hasViewer: !!(full as Record<string, unknown>).threePreviewState
			})
			if (node.type === 'scene-layout') {
				const f = full as Record<string, unknown>
				// 改用 console.log + info 级别，避免 debug 级别被过滤
				// eslint-disable-next-line no-console
				console.info('[SCENE-LAYOUT DIAG] ========== nodeExtraProps RESULT ==========')
				// eslint-disable-next-line no-console
				console.info(
					'[SCENE-LAYOUT DIAG] nodeId:',
					nodeId,
					'nodeType:',
					node.type,
					'type===scene-layout:',
					node.type === 'scene-layout'
				)
				const incJson = (() => {
					try {
						const e = payload.getFirstIncomingEdge(nodeId, 'in-json')
						return e
							? {
									fromNodeId: String((e as Record<string, unknown>).fromNodeId ?? ''),
									fromAnchorId: String((e as Record<string, unknown>).fromAnchorId ?? ''),
									edgeId: String((e as Record<string, unknown>).id ?? '')
								}
							: null
					} catch (err) {
						return `Error: ${String(err)}`
					}
				})()
				const incLight = (() => {
					try {
						const e = payload.getFirstIncomingEdge(nodeId, 'in-lighting-json')
						return e
							? {
									fromNodeId: String((e as Record<string, unknown>).fromNodeId ?? ''),
									fromAnchorId: String((e as Record<string, unknown>).fromAnchorId ?? ''),
									edgeId: String((e as Record<string, unknown>).id ?? '')
								}
							: null
					} catch (err) {
						return `Error: ${String(err)}`
					}
				})()
				// 直接从 store 中抓 upstream 节点信息
				let upstreamNodeOutputJsonPreview = '(N/A)'
				let upstreamNodeType = '(N/A)'
				let upstreamNodeExists = false
				if (
					incJson &&
					typeof incJson === 'object' &&
					(incJson as { fromNodeId?: string }).fromNodeId
				) {
					const up = payload.store.state.nodesById[
						(incJson as { fromNodeId: string }).fromNodeId
					] as Record<string, unknown> | undefined
					if (up) {
						upstreamNodeExists = true
						upstreamNodeType = String(up.type ?? '')
						if (up.type === 'scene-understanding') {
							const sus = up.sceneUnderstandingSettings as Record<string, unknown> | undefined
							const outputJson = String(sus?.outputJson ?? '')
							upstreamNodeOutputJsonPreview = outputJson
								? `${outputJson.slice(0, 200)}... (len=${outputJson.length})`
								: '(empty outputJson)'
						} else {
							upstreamNodeOutputJsonPreview = `(upstream type=${upstreamNodeType}, try fallback textOutput)`
							const fallback = payload.getTextOutputForNode?.(
								(incJson as { fromNodeId: string }).fromNodeId,
								undefined,
								(incJson as { fromAnchorId?: string }).fromAnchorId
							)
							if (typeof fallback === 'string') {
								upstreamNodeOutputJsonPreview += ` | getTextOutputForNode len=${fallback.length}`
							}
						}
					}
				}
				// eslint-disable-next-line no-console
				console.info('[SCENE-LAYOUT DIAG] incomingEdge for in-json:', incJson)
				// eslint-disable-next-line no-console
				console.info('[SCENE-LAYOUT DIAG] incomingEdge for in-lighting-json:', incLight)
				// eslint-disable-next-line no-console
				console.info(
					'[SCENE-LAYOUT DIAG] upstream (from in-json) node exists:',
					upstreamNodeExists,
					'type:',
					upstreamNodeType
				)
				// eslint-disable-next-line no-console
				console.info(
					'[SCENE-LAYOUT DIAG] upstream sceneUnderstandingSettings.outputJson:',
					upstreamNodeOutputJsonPreview
				)
				// eslint-disable-next-line no-console
				console.info('[SCENE-LAYOUT DIAG] linkedJsonText result:', {
					len: String(f.linkedJsonText ?? '').length,
					preview: f.linkedJsonText ? `${String(f.linkedJsonText).slice(0, 180)}...` : '(empty)'
				})
				// eslint-disable-next-line no-console
				console.info(
					'[SCENE-LAYOUT DIAG] linkedLightingJsonText len:',
					String(f.linkedLightingJsonText ?? '').length
				)
				// eslint-disable-next-line no-console
				console.info(
					'[SCENE-LAYOUT DIAG] sceneLayoutModelBindings count:',
					Array.isArray(f.sceneLayoutModelBindings) ? f.sceneLayoutModelBindings.length : 'N/A'
				)
				// eslint-disable-next-line no-console
				console.info(
					'[SCENE-LAYOUT DIAG] threePreviewState phase:',
					(f.threePreviewState as Record<string, unknown>)?.phase
				)
				// eslint-disable-next-line no-console
				console.info('[SCENE-LAYOUT DIAG] ============================================')
			}
		}

		return full
	}

	watch(
		() => payload.viewportMotionActive.value,
		(isMotionNow, wasMotionBefore) => {
			log('viewportMotionActive changed:', { isMotionNow, wasMotionBefore })
			if (isMotionNow && !wasMotionBefore) {
				const nodes = Object.values(payload.store.state.nodesById) as WorkflowNode[]
				let cached3d = 0
				for (const node of nodes) {
					const nodeId = String(node.id ?? '').trim()
					if (!nodeId) continue
					if (extraPropsCache.has(nodeId)) continue
					const full = buildNodeExtraProps(node)
					extraPropsCache.set(nodeId, full)
					if (THREE_PREVIEW_TYPES.has(node.type)) cached3d++
				}
				log('pre-filled cache on motion start, 3d nodes cached:', cached3d)
			} else if (!isMotionNow && wasMotionBefore) {
				extraPropsCache.clear()
				log('cache cleared on motion end')
			}
		}
	)

	return {
		nodeExtraProps
	}
}
