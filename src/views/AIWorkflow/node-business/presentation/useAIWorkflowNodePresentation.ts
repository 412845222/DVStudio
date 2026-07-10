import type { Component } from 'vue'
import type { Store } from 'vuex'
import type { WorkflowNode, WorkflowState } from '../../../../aiworkflow/types'
import WorkflowNodeBase from '../../../../ui/WorkFlow/WorkflowNodeBase.vue'
import WorkflowTextNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowTextNode.vue'
import WorkflowTextMergeNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowTextMergeNode.vue'
import WorkflowImageNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowImageNode.vue'
import WorkflowRotateImageNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowRotateImageNode.vue'
import WorkflowVideoNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowVideoNode.vue'
import WorkflowStoryNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowStoryNode.vue'
import WorkflowComfyUINode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowComfyUINode.vue'
import WorkflowModel3DNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowModel3DNode.vue'
import WorkflowMeshyModelNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowMeshyModelNode.vue'
import WorkflowSceneUnderstandingNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowSceneUnderstandingNode.vue'
import WorkflowSceneDecomposeNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowSceneDecomposeNode.vue'
import WorkflowSceneLayoutNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowSceneLayoutNode.vue'
import WorkflowUnrealExportNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowUnrealExportNode.vue'
import WorkflowBlenderNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowBlenderNode.vue'
import { sanitizeWorkflowMediaUrl } from '../../../../aiworkflow/domain/resource/safeWorkflowUrl'
import { isWorkflowLocalAssetUrl, resolveBackendUrl } from '../../../../network/backendConfig'
import { t } from '../../../../i18n'

export const useAIWorkflowNodePresentation = (store: Store<WorkflowState>) => {
	const clampNodeScale = (zoom: number) => Math.max(0.2, Math.min(6, Number(zoom) || 1))

	const resolveNodeShellStyle = (
		worldToScreen: (point: { x: number; y: number }) => { x: number; y: number },
		worldX: number,
		worldY: number,
		zoom: number,
		width: number,
		height: number
	) => {
		const point = worldToScreen({ x: worldX, y: worldY })
		return {
			left: `${point.x}px`,
			top: `${point.y}px`,
			width: `${Math.max(80, width || 240)}px`,
			height: `${Math.max(80, height || 160)}px`,
			transform: `translate(-50%, -50%) scale(${clampNodeScale(zoom)})`
		} as Record<string, string>
	}

	/**
	 * Compact node style — DYNAMIC physical dimensions matching scaled node size.
	 * The type badge is now INSIDE the node, so no extra vertical space needed.
	 */
	const compactNodeShellStyle = (
		worldToScreen: (point: { x: number; y: number }) => { x: number; y: number },
		worldX: number,
		worldY: number,
		zoom: number,
		width: number,
		height: number
	) => {
		const point = worldToScreen({ x: worldX, y: worldY })
		const nodeWidth = Math.max(80, width || 240)
		const nodeHeight = Math.max(80, height || 160)
		const safeZoom = Math.max(0.01, Number(zoom) || 1)

		// Dynamic size matching scaled real node
		const fixedWidth = Math.max(120, nodeWidth * safeZoom)
		const fixedHeight = Math.max(64, nodeHeight * safeZoom)

		return {
			left: `${point.x}px`,
			top: `${point.y}px`,
			width: `${fixedWidth}px`,
			height: `${fixedHeight}px`,
			transform: 'translate(-50%, -50%)'
		} as Record<string, string>
	}

	const compactNodeTypeChinese = (node: WorkflowNode): string => {
		const labels: Record<string, string> = {
			text: t('aiworkflow.runtime.nodeTypeText'),
			'text-merge': t('aiworkflow.runtime.nodeTypeTextMerge'),
			image: t('aiworkflow.runtime.nodeTypeImage'),
			'rotate-image': t('aiworkflow.runtime.nodeTypeRotateImage'),
			video: t('aiworkflow.runtime.nodeTypeVideo'),
			'scene-understanding': t('aiworkflow.runtime.nodeTypeSceneUnderstanding'),
			'scene-decompose': t('aiworkflow.runtime.nodeTypeSceneDecompose'),
			'scene-layout': t('aiworkflow.runtime.nodeTypeSceneLayout'),
			'unreal-export': t('aiworkflow.runtime.nodeTypeUnrealExport'),
			story: t('aiworkflow.runtime.nodeTypeStory'),
			comfyui: 'ComfyUI',
			model3d: t('aiworkflow.runtime.nodeTypeModel3d'),
			meshy: 'Meshy',
			blender: 'Blender'
		}
		return labels[node.type] || t('aiworkflow.runtime.nodeTypeDefault')
	}

	/** Gradient CSS background for the icon block (left side). */
	const compactNodeTypeGradient = (node: WorkflowNode): string => {
		const color = compactNodeTypeColor(node)
		return `linear-gradient(135deg, color-mix(in srgb, ${color} 40%, #0d1117) 0%, color-mix(in srgb, ${color} 22%, #0d1117) 55%, color-mix(in srgb, ${color} 10%, #0d1117) 100%)`
	}

	/** Short uppercase type label for compact display. */
	const compactNodeTypeCode = (node: WorkflowNode): string => {
		const codes: Record<string, string> = {
			text: 'TXT',
			'text-merge': 'MERGE',
			image: 'IMG',
			'rotate-image': 'ROT',
			video: 'VID',
			'scene-understanding': 'SCU',
			'scene-decompose': 'SCD',
			'scene-layout': 'SCL',
			'unreal-export': 'UNR',
			story: 'STORY',
			comfyui: 'COMFY',
			model3d: '3D',
			meshy: 'MESH',
			blender: 'BLEND'
		}
		return codes[node.type] || 'NODE'
	}

	const nodeStyle = (
		worldToScreen: (point: { x: number; y: number }) => { x: number; y: number },
		worldX: number,
		worldY: number,
		zoom: number,
		width: number,
		height: number
	) => resolveNodeShellStyle(worldToScreen, worldX, worldY, zoom, width, height)

	const compactNodeStyle = (
		worldToScreen: (point: { x: number; y: number }) => { x: number; y: number },
		worldX: number,
		worldY: number,
		zoom: number,
		width: number,
		height: number
	) => resolveNodeShellStyle(worldToScreen, worldX, worldY, zoom, width, height)

	const nodeComponent = (node: WorkflowNode): Component => {
		if (node.type === 'story') return WorkflowStoryNode
		if (node.type === 'text') return WorkflowTextNode
		if (node.type === 'text-merge') return WorkflowTextMergeNode
		if (node.type === 'image') return WorkflowImageNode
		if (node.type === 'rotate-image') return WorkflowRotateImageNode
		if (node.type === 'video') return WorkflowVideoNode
		if (node.type === 'scene-understanding') return WorkflowSceneUnderstandingNode
		if (node.type === 'scene-decompose') return WorkflowSceneDecomposeNode
		if (node.type === 'scene-layout') return WorkflowSceneLayoutNode
		if (node.type === 'unreal-export') return WorkflowUnrealExportNode
		if (node.type === 'comfyui') return WorkflowComfyUINode
		if (node.type === 'model3d') return WorkflowModel3DNode
		if (node.type === 'meshy') return WorkflowMeshyModelNode
		if (node.type === 'blender') return WorkflowBlenderNode
		return WorkflowNodeBase
	}

	const parseProjectAssetUrl = (raw: unknown) => {
		const text = String(raw ?? '').trim()
		if (!text) return null
		try {
			const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
			const u = new URL(text, base)
			const protocol = String(u.protocol || '').toLowerCase()
			const host = String(u.hostname || '').toLowerCase()
			const isDwebAsset = protocol === 'dweb:' && host === 'project-assets'
			if (!isDwebAsset) return null
			const projectId = String(u.searchParams.get('projectId') || '').trim()
			const relPath = String(u.searchParams.get('path') || '').trim()
			if (!projectId || !relPath) return null
			return u
		} catch {
			return null
		}
	}

	const nodeImagePreviewVersion = (node: WorkflowNode) => {
		if (!['image', 'video', 'rotate-image'].includes(node.type) || !node.resourceId) return null
		const resource = store.state.resourcesById[node.resourceId]
		if (!resource || typeof resource !== 'object') return null

		const explicit = String(resource.previewVersion ?? '').trim()
		if (explicit) return explicit

		const seedParts: string[] = []
		const fingerprint = String(resource.sourceFingerprint ?? '').trim()
		const sourceSize = Number(resource.sourceSize)
		const sourceMtime = Number(resource.sourceLastModified)
		const previewPath = String(resource.previewProjectRelativePath ?? '').trim()
		const mediaPath = String(resource.projectRelativePath ?? '').trim()

		if (fingerprint) seedParts.push(`f:${fingerprint}`)
		if (previewPath) seedParts.push(`p:${previewPath}`)
		if (mediaPath) seedParts.push(`m:${mediaPath}`)
		if (Number.isFinite(sourceSize) && sourceSize > 0) seedParts.push(`s:${Math.floor(sourceSize)}`)
		if (Number.isFinite(sourceMtime) && sourceMtime > 0)
			seedParts.push(`t:${Math.floor(sourceMtime)}`)

		if (!seedParts.length) return null
		return seedParts.join('|')
	}

	const buildProjectAssetPreviewUrl = (raw: unknown, maxSize: number, version?: string | null) => {
		const safeUrl = sanitizeWorkflowMediaUrl(raw)
		if (!safeUrl) return ''

		if (/^(?:blob:|data:)/i.test(safeUrl)) return safeUrl
		if (/^https?:\/\//i.test(safeUrl)) return ''

		const parsed = parseProjectAssetUrl(raw)
		if (parsed) {
			const safeSize = Number.isFinite(Number(maxSize))
				? Math.max(128, Math.min(4096, Math.floor(Number(maxSize))))
				: 640
			parsed.searchParams.set('variant', 'preview')
			parsed.searchParams.set('maxSize', String(safeSize))
			const v = String(version ?? '').trim()
			if (v) parsed.searchParams.set('v', v)
			return parsed.toString()
		}

		if (safeUrl.startsWith('/api/') || safeUrl.startsWith('/media/')) {
			return resolveBackendUrl(safeUrl) || safeUrl
		}

		return ''
	}

	const nodeImagePreviewUrl = (node: WorkflowNode, maxSize: number) => {
		if (!['image', 'video', 'rotate-image'].includes(node.type) || !node.resourceId) return null
		const resource = store.state.resourcesById[node.resourceId]
		if (!resource || typeof resource !== 'object') return null

		const previewVersion = nodeImagePreviewVersion(node)
		const explicitPreviewUrl = sanitizeWorkflowMediaUrl(resource.previewUrl)
		const mediaUrl = sanitizeWorkflowMediaUrl(resource.url)

		const builtFromExplicit = buildProjectAssetPreviewUrl(
			explicitPreviewUrl,
			maxSize,
			previewVersion
		)
		if (builtFromExplicit) return sanitizeWorkflowMediaUrl(builtFromExplicit) || null

		const builtFromMedia = buildProjectAssetPreviewUrl(mediaUrl, maxSize, previewVersion)
		if (builtFromMedia) return sanitizeWorkflowMediaUrl(builtFromMedia) || null

		return explicitPreviewUrl || null
	}

	const nodeResourceUrl = (node: WorkflowNode) => {
		if (!node.resourceId) return null
		const raw = store.state.resourcesById[node.resourceId]?.url
		const safe = sanitizeWorkflowMediaUrl(raw)
		if (safe && (node.type === 'image' || node.type === 'video' || node.type === 'rotate-image')) {
			if (!isWorkflowLocalAssetUrl(safe)) return null
		}
		return safe || null
	}

	const nodeResourceName = (node: WorkflowNode) => {
		if (!node.resourceId) return null
		return store.state.resourcesById[node.resourceId]?.name ?? null
	}

	const compactNodeImageUrl = (node: WorkflowNode) => {
		if (node.type !== 'image' && node.type !== 'video' && node.type !== 'rotate-image') return null
		return nodeImagePreviewUrl(node, 320)
	}

	/**
	 * Returns the CSS color for a compact node's type icon block.
	 * Matches the sci-fi theme's distinct colors per node type.
	 */
	const compactNodeTypeColor = (node: WorkflowNode): string => {
		const typeColors: Record<string, string> = {
			text: '#3f8cfc',
			'text-merge': '#3f8cfc',
			image: '#ec4899',
			'rotate-image': '#ec4899',
			video: '#34d399',
			'scene-understanding': '#a855f7',
			'scene-decompose': '#a855f7',
			'scene-layout': '#f97322',
			'unreal-export': '#f97322',
			story: '#f59e0b',
			comfyui: '#0ea5e9',
			model3d: '#3b82f6',
			meshy: '#0ea5e9',
			blender: '#e87d0d',
			base: '#1f9d84'
		}
		return typeColors[node.type] || '#1f9d84'
	}

	return {
		nodeStyle,
		compactNodeShellStyle,
		compactNodeStyle,
		nodeComponent,
		nodeImagePreviewUrl,
		nodeImagePreviewVersion,
		nodeResourceUrl,
		nodeResourceName,
		compactNodeImageUrl,
		compactNodeTypeColor,
		compactNodeTypeChinese,
		compactNodeTypeGradient,
		compactNodeTypeCode
	}
}
