import type { WorkflowNode } from '../../../../aiworkflow/types'
import type { WorkflowThreePreviewState } from '../../../../ui/WorkFlow/WorlFlowNodes/three-preview/types'
import { sanitizeMeshyPreviewUrl } from '../meshy/useAIWorkflowMeshyAssets'
import {
	sanitizeWorkflowMediaUrl,
	sanitizeWorkflowUrlFieldsDeep
} from '../../../../aiworkflow/domain/resource/safeWorkflowUrl'

import type { InputParamPreviewRef } from './useAIWorkflowTextOutputResolver'

export const useAIWorkflowNodeExtraProps = (payload: {
	store: {
		state: {
			resourcesById: Record<string, unknown>
			nodesById: Record<string, unknown>
		}
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
	connectedImageTargetsFromVideo: (videoNodeId: string) => string[]
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

	const buildImageNodeProps = (node: WorkflowNode, shedHeavy: boolean, withInputRefs: boolean) => {
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
			resourcePreviewUrl320: shedHeavy ? null : imagePreviewUrl320 || null,
			resourcePreviewUrl640: shedHeavy ? null : imagePreviewUrl640 || imagePreviewUrl320 || null,
			resourcePreviewVersion: imagePreviewVersion || null,
			resourceName: payload.nodeResourceName(sourceNode),
			inputParamPreviewRefs: withInputRefs ? payload.getInputParamPreviewRefs(node.id) : [],
			imageSettings,
			upstreamCroppedImageUrl: upstreamCroppedImageUrl
		}
	}

	const withMotionSafeProps = (node: WorkflowNode, props: Record<string, unknown>) => {
		if (props.previewSuspended === true) return props
		if (node.type === 'scene-layout' || node.type === 'model3d') {
			return {
				...props,
				previewSuspended: true
			}
		}
		return props
	}

	const MOTION_SHED_THRESHOLD = 80
	const ALWAYS_SHED_THRESHOLD = 220

	const shouldShedHeavyMedia = () => {
		if (!payload.performancePriorityMode.value) return false
		const count = Number(payload.nodeCount.value) || 0
		if (count >= ALWAYS_SHED_THRESHOLD) return true
		if (payload.viewportMotionActive.value && count >= MOTION_SHED_THRESHOLD) return true
		return false
	}

	const buildMotionReducedProps = (node: WorkflowNode): Record<string, unknown> => {
		if (node.type === 'scene-layout') {
			return {
				sceneLayoutSettings: sanitizeWorkflowUrlFieldsDeep(node.sceneLayoutSettings ?? null),
				linkedJsonText: '',
				linkedLightingJsonText: '',
				sceneLayoutModelBindings: [],
				threePreviewState: null,
				previewSuspended: true
			}
		}
		if (node.type === 'model3d') {
			return {
				model3dSettings: sanitizeWorkflowUrlFieldsDeep(node.model3dSettings ?? null),
				threePreviewState: null,
				inputParamPreviewRefs: [],
				previewSuspended: true
			}
		}
		if (node.type === 'scene-understanding') {
			return {
				sceneUnderstandingSettings: node.sceneUnderstandingSettings ?? null,
				linkedImageUrl: '',
				linkedImageUrls: [],
				linkedLayoutJsonText: '',
				linkedPromptText: ''
			}
		}
		if (node.type === 'scene-decompose') {
			return {
				sceneDecomposeSettings: node.sceneDecomposeSettings ?? null,
				linkedImageUrls: [],
				linkedJsonText: ''
			}
		}
		if (node.type === 'meshy') {
			return {
				meshySettings: payload.buildMeshyNodePresentationSettings(node.meshySettings ?? null),
				connectedPrompt: '',
				connectedImageUrls: [],
				sourcePreviewUrl: '',
				sourcePreviewLabel: ''
			}
		}
		if (node.type === 'image') {
			return buildImageNodeProps(node, true, false)
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
				inputParamPreviewRefs: [],
				posterUrl: resourcePosterUrl,
				videoSettings: node.videoSettings ?? null,
				screenshotEnabled: payload.connectedImageTargetsFromVideo(node.id).length > 0,
				reloadToken: payload.nodeMediaReloadToken(node.id)
			}
		}
		if (node.type === 'rotate-image') {
			return {
				inputUrl: '',
				rotatePromptText: ''
			}
		}
		if (node.type === 'story') {
			const pw = node.storySettings?.previewWidth
			const ph = node.storySettings?.previewHeight
			return {
				branches: [],
				previewUrl: '',
				previewKind: null,
				previewCropEnabled: false,
				previewCrop: null,
				previewWidth: Number.isFinite(Number(pw)) ? Number(pw) : 1920,
				previewHeight: Number.isFinite(Number(ph)) ? Number(ph) : 1080
			}
		}
		return buildNodeExtraProps(node)
	}

	const buildNodeExtraProps = (node: WorkflowNode): Record<string, unknown> => {
		if (node.type === 'text') {
			const linkedInput =
				Array.isArray(node.inputs) && node.inputs.length
					? payload.connectedTextInputValue(node.id, String(node.inputs[0]?.id ?? ''))
					: ''
			return {
				textValue: String(linkedInput || node.textValue || ''),
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
			return buildImageNodeProps(node, false, true)
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
				screenshotEnabled: payload.connectedImageTargetsFromVideo(node.id).length > 0,
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
		const nodeCount = Number(payload.nodeCount.value) || 0

		if (isMotionActive) {
			if (nodeCount < MOTION_SHED_THRESHOLD) {
				const cached = extraPropsCache.get(nodeId)
				if (cached) return withMotionSafeProps(node, cached)
				const next = buildNodeExtraProps(node)
				extraPropsCache.set(nodeId, next)
				return withMotionSafeProps(node, next)
			}
			const cached = extraPropsCache.get(nodeId)
			if (cached) return withMotionSafeProps(node, cached)
			const next = buildMotionReducedProps(node)
			extraPropsCache.set(nodeId, next)
			return withMotionSafeProps(node, next)
		}

		extraPropsCache.delete(nodeId)

		return buildNodeExtraProps(node)
	}

	return {
		nodeExtraProps
	}
}
