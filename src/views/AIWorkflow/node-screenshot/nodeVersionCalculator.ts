/**
 * 节点版本号统一计算器
 * 确保任何影响视觉呈现的变化都能反映在版本号中
 */

import type { WorkflowNode } from '../../../aiworkflow/types'

export type ThemeMode = 'dark' | 'light'

export interface ResourceLoadState {
	loaded: boolean
	error: boolean
	naturalWidth?: number
	naturalHeight?: number
}

export interface NodeVersionContext {
	node: WorkflowNode
	theme: ThemeMode
	resourceStates?: Map<string, ResourceLoadState>
	selected?: boolean
}

const safeString = (val: unknown): string => {
	if (val == null) return ''
	if (typeof val === 'string') return val
	if (typeof val === 'number' || typeof val === 'boolean') return String(val)
	try {
		return JSON.stringify(val)
	} catch {
		return String(val)
	}
}

const joinParts = (parts: string[]): string => parts.filter((p) => p !== '').join('|')

export const calculateNodeScreenshotVersion = (ctx: NodeVersionContext): string => {
	const { node, theme, resourceStates, selected } = ctx
	const n = node as WorkflowNode & {
		runtimeState?: { status?: string; error?: boolean; progress?: number }
		connections?: { inputs?: Array<{ nodeId?: string }> }
	}
	const parts: string[] = []

	parts.push(`theme:${theme}`)

	if (selected !== undefined) {
		parts.push(`selected:${selected ? '1' : '0'}`)
	}

	parts.push(`type:${n.type || ''}`)
	parts.push(`t:${n.title || ''}`)
	parts.push(`alias:${n.alias || ''}`)
	parts.push(`subtitle:${n.subtitle || ''}`)
	parts.push(`w:${n.width || 0}`)
	parts.push(`h:${n.height || 0}`)

	if (n.runtimeState) {
		parts.push(`rs:${safeString(n.runtimeState.status || 'idle')}`)
		if (n.runtimeState.error) {
			parts.push(`err:1`)
		}
		if (n.runtimeState.progress !== undefined) {
			parts.push(`prog:${Math.round(n.runtimeState.progress * 100)}`)
		}
	}

	switch (n.type) {
		case 'image':
		case 'rotate_image': {
			const imgNode = n as any
			parts.push(`rid:${imgNode.resourceId || ''}`)
			parts.push(`pv:${imgNode.previewVersion || ''}`)
			parts.push(`pu320:${imgNode.resourcePreviewUrl320 || ''}`)
			parts.push(`pu640:${imgNode.resourcePreviewUrl640 || ''}`)
			parts.push(`ow:${imgNode.imageSettings?.outputWidth || 0}`)
			parts.push(`oh:${imgNode.imageSettings?.outputHeight || 0}`)
			parts.push(`ce:${imgNode.imageSettings?.cropEnabled ? '1' : '0'}`)
			if (imgNode.imageSettings?.crop) {
				const c = imgNode.imageSettings.crop
				parts.push(`crop:${Math.round(c.x || 0)},${Math.round(c.y || 0)},${Math.round(c.width || 0)},${Math.round(c.height || 0)}`)
			}
			const resKey = imgNode.resourceUrl || imgNode.resourceId || ''
			if (resourceStates && resKey) {
				const rs = resourceStates.get(resKey)
				if (rs) {
					parts.push(`rl:${rs.loaded ? '1' : '0'}`)
					parts.push(`re:${rs.error ? '1' : '0'}`)
					if (rs.naturalWidth) parts.push(`nw:${rs.naturalWidth}`)
					if (rs.naturalHeight) parts.push(`nh:${rs.naturalHeight}`)
				}
			}
			break
		}
		case 'video': {
			const vidNode = n as any
			parts.push(`rid:${vidNode.resourceId || ''}`)
			parts.push(`pv:${vidNode.previewVersion || ''}`)
			parts.push(`poster:${vidNode.posterUrl || ''}`)
			parts.push(`ct:${vidNode.currentTime || 0}`)
			if (vidNode.videoSettings) {
				parts.push(`vs:${safeString(vidNode.videoSettings)}`)
			}
			break
		}
		case 'text': {
			const txtNode = n as any
			parts.push(`tv:${safeString(txtNode.textValue || '')}`)
			parts.push(`fs:${txtNode.fontSize || 0}`)
			parts.push(`ta:${txtNode.textAlign || ''}`)
			break
		}
		case 'text_merge': {
			const tmNode = n as any
			parts.push(`tmpl:${safeString(tmNode.template || '')}`)
			parts.push(`sep:${safeString(tmNode.separator || '')}`)
			break
		}
		case 'story': {
			const storyNode = n as any
			if (Array.isArray(storyNode.branches)) {
				parts.push(`bc:${storyNode.branches.length}`)
				const branchTexts = storyNode.branches
					.slice(0, 5)
					.map((b: any, i: number) => `${i}:${safeString(b.text || '').slice(0, 50)}`)
				parts.push(`bt:${branchTexts.join(';')}`)
			}
			break
		}
		case 'comfyui':
		case 'meshy_model':
		case 'tripo3d_model':
		case 'seedance':
		case 'gemini':
		case 'ark': {
			const taskNode = n as any
			parts.push(`ts:${taskNode.taskStatus || 'idle'}`)
			parts.push(`opv:${taskNode.outputPreviewUrl || ''}`)
			if (taskNode.generationParams) {
				parts.push(`gp:${safeString(taskNode.generationParams).slice(0, 100)}`)
			}
			break
		}
		case 'blender': {
			const blNode = n as any
			parts.push(`mcs:${blNode.mcpConnected ? '1' : '0'}`)
			parts.push(`sv:${blNode.screenshotVersion || 0}`)
			break
		}
		case 'model_3d': {
			const m3dNode = n as any
			parts.push(`mu:${m3dNode.modelUrl || ''}`)
			parts.push(`mls:${m3dNode.loadState || ''}`)
			parts.push(`mv:${m3dNode.previewVersion || 0}`)
			break
		}
		case 'scene_decompose':
		case 'scene_understanding':
		case 'scene_layout': {
			const sceneNode = n as any
			parts.push(`iu:${sceneNode.inputUrl || ''}`)
			parts.push(`ss:${sceneNode.status || ''}`)
			parts.push(`ov:${sceneNode.outputVersion || 0}`)
			break
		}
	}

	if (n.connections && Array.isArray(n.connections.inputs)) {
		const upstreamIds = n.connections.inputs
			.map((c: any) => c.nodeId || '')
			.filter(Boolean)
			.sort()
		if (upstreamIds.length > 0) {
			parts.push(`up:${upstreamIds.join(',')}`)
		}
	}

	return joinParts(parts)
}

export const nodeContentChanged = (oldNode: WorkflowNode, newNode: WorkflowNode): boolean => {
	const oldN = oldNode as any
	const newN = newNode as any
	if (oldN.type !== newN.type) return true
	if (oldN.title !== newN.title) return true
	if (oldN.width !== newN.width || oldN.height !== newN.height) return true
	if (JSON.stringify(oldN.runtimeState) !== JSON.stringify(newN.runtimeState)) return true

	if (oldN.previewVersion !== newN.previewVersion) return true
	if (oldN.resourceId !== newN.resourceId) return true
	if (oldN.resourcePreviewUrl320 !== newN.resourcePreviewUrl320) return true
	if (oldN.resourcePreviewUrl640 !== newN.resourcePreviewUrl640) return true
	if (oldN.posterUrl !== newN.posterUrl) return true
	if (oldN.textValue !== newN.textValue) return true
	if (oldN.outputPreviewUrl !== newN.outputPreviewUrl) return true
	if (oldN.taskStatus !== newN.taskStatus) return true
	if (oldN.modelUrl !== newN.modelUrl) return true
	if (oldN.screenshotVersion !== newN.screenshotVersion) return true

	if (JSON.stringify(oldN.imageSettings) !== JSON.stringify(newN.imageSettings)) return true
	if (JSON.stringify(oldN.videoSettings) !== JSON.stringify(newN.videoSettings)) return true

	return false
}
