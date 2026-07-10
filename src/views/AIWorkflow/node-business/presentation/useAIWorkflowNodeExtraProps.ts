import type { WorkflowNode } from '../../../../aiworkflow/types'
import type { WorkflowThreePreviewState } from '../../../../ui/WorkFlow/WorlFlowNodes/three-preview/types'
import { sanitizeMeshyPreviewUrl } from '../meshy/useAIWorkflowMeshyAssets'
import {
	sanitizeWorkflowMediaUrl,
	sanitizeWorkflowUrlFieldsDeep
} from '../../../../aiworkflow/domain/resource/safeWorkflowUrl'

import type { InputParamPreviewRef } from './useAIWorkflowTextOutputResolver'
import { watch } from 'vue'

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
	buildMeshyNodePresentationSettings: (settings: Record<string, unknown> | null | undefined) => Record<string, unknown> | null
	connectedMeshyPrompt: (nodeId: string) => string
	connectedMeshyImageUrls: (nodeId: string) => string[]
	nodeMediaReloadToken: (nodeId: string) => number
	getFirstIncomingEdge: (nodeId: string, anchorId?: string) => Record<string, unknown> | null
	getUpstreamCroppedImageUrl: (node: WorkflowNode) => string | null
}) => {
	const extraPropsCache = new Map<string, Record<string, unknown>>()

	const getUpstreamPassThroughImageNode = (node: WorkflowNode): WorkflowNode | null => {
		if (node.type !== 'image') return null
		if (node.resourceId) return null
		const edge =
			payload.getFirstIncomingEdge(node.id, 'in-image') ||
			payload.getFirstIncomingEdge(node.id, 'in-resource')
		if (!edge) return null
		const fromNode = payload.store.state.nodesById[String(edge.fromNodeId)] as WorkflowNode | undefined
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
			const items = Array.isArray((node as Record<string, unknown>).textMergeItems) ? (node as Record<string, unknown>).textMergeItems : []
			return {
				mergeItems: items,
				mergedText: payload.computeMergedText(node.id)
			}
		}
		if (node.type === 'story') {
			const preview = payload.storyPreview(node)
			const pw = node.storySettings?.previewWidth
			const ph = node.storySettings?.previewHeight
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
				videoSettings: node.videoSettings ?? null,
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
				sceneUnderstandingSettings: node.sceneUnderstandingSettings ?? null,
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
				sceneDecomposeSettings: node.sceneDecomposeSettings ?? null,
				linkedImageUrls: shedHeavyMedia
					? []
					: linkedImages.map((item) => sanitizeWorkflowMediaUrl(item.url)).filter(Boolean),
				linkedJsonText: payload.connectedTextInputValue(node.id, 'in-json')
			}
		}
		if (node.type === 'scene-layout') {
			return {
				sceneLayoutSettings: sanitizeWorkflowUrlFieldsDeep(node.sceneLayoutSettings ?? null),
				linkedJsonText: payload.connectedTextInputValue(node.id, 'in-json'),
				linkedLightingJsonText: payload.connectedTextInputValue(node.id, 'in-lighting-json'),
				sceneLayoutModelBindings: sanitizeWorkflowUrlFieldsDeep(
					payload.connectedSceneLayoutModelBindings(node.id)
				),
				threePreviewState: payload.getThreePreviewState(node.id, node.type)
			}
		}
		if (node.type === 'unreal-export') {
			return {
				unrealExportSettings: (node as Record<string, unknown>).unrealExportSettings ?? null,
				linkedLayoutJsonText: payload.connectedTextInputValue(node.id, 'in-layout-json'),
				linkedLightingJsonText: payload.connectedTextInputValue(node.id, 'in-lighting-json')
			}
		}
		if (node.type === 'comfyui') {
			return {
				comfyuiSettings: node.comfyuiSettings ?? null
			}
		}
		if (node.type === 'model3d') {
			return {
				model3dSettings: sanitizeWorkflowUrlFieldsDeep(node.model3dSettings ?? null),
				threePreviewState: payload.getThreePreviewState(node.id, node.type),
				inputParamPreviewRefs: payload.getInputParamPreviewRefs(node.id)
			}
		}
		if (node.type === 'meshy') {
			const sourcePreview = payload.connectedMeshySourcePreview(node.id)
			const shedHeavyMedia = shouldShedHeavyMedia()
			return {
				meshySettings: payload.buildMeshyNodePresentationSettings(node.meshySettings ?? null),
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
				sourcePreviewLabel: sourcePreview.label
			}
		}
		return {}
	}

	const nodeExtraProps = (node: WorkflowNode) => {
		const nodeId = String(node.id ?? '').trim()
		if (!nodeId) return buildNodeExtraProps(node)

		const isMotionActive = payload.viewportMotionActive.value

		if (isMotionActive) {
			// 运动期间始终使用缓存，保留所有已加载资源
			const cached = extraPropsCache.get(nodeId)
			if (cached) {
				return {
					...cached,
					previewSuspended: ['scene-layout', 'model3d'].includes(node.type)
				}
			}

			// 缓存不存在时，构建完整 props 并缓存
			const next = buildNodeExtraProps(node)
			extraPropsCache.set(nodeId, next)
			return {
				...next,
				previewSuspended: ['scene-layout', 'model3d'].includes(node.type)
			}
		}

		// 非运动期间，缓存完整 props
		const full = buildNodeExtraProps(node)
		extraPropsCache.set(nodeId, full)
		return full
	}

	// 监听视口运动状态变化，平移开始时预填充缓存
	// 关键：保留真实的 threePreviewState，避免被 getNodePreviewState 强制置为 masked
	// 当非活跃的 scene-layout/model3d 节点被查询时，getNodePreviewState 会返回 phase: 'masked'
	// 为了避免 viewer 被 dispose，需要在平移开始时缓存真实的 threePreviewState
	watch(
		() => payload.viewportMotionActive.value,
		(isMotionNow, wasMotionBefore) => {
			if (isMotionNow && !wasMotionBefore) {
				// 平移开始：预填充所有节点的缓存
				const nodes = Object.values(payload.store.state.nodesById) as WorkflowNode[]
				for (const node of nodes) {
					const nodeId = String(node.id ?? '').trim()
					if (!nodeId) continue
					// 缓存已存在则跳过
					if (extraPropsCache.has(nodeId)) continue
					// 构建完整 props 并缓存
					const full = buildNodeExtraProps(node)
					extraPropsCache.set(nodeId, full)
				}
			} else if (!isMotionNow && wasMotionBefore) {
				// 平移结束：清空缓存以确保下次获取最新状态
				extraPropsCache.clear()
			}
		}
	)

	return {
		nodeExtraProps
	}
}
