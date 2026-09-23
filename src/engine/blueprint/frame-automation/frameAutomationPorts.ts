import type { MediaType, PortSpec } from '../types'
import type { BlueprintNode } from '../BlueprintNode'
import {
	clampLoopCount,
	makePortalBindingId,
	type FrameAutomationData,
	type FrameIoBinding,
	type PortalDirection
} from './FrameAutomationTypes'

export interface BindablePortCandidate {
	nodeId: string
	anchorId: string
	label: string
	mediaType: MediaType
	portSpec: PortSpec
}

function nodeDisplayName(node: BlueprintNode): string {
	return String(node.alias ?? node.title ?? node.data.title ?? node.id).trim() || node.id
}

/** 列出成员节点上可绑定的输入/输出锚点候选 */
export function getBindablePorts(
	nodes: BlueprintNode[],
	direction: PortalDirection
): BindablePortCandidate[] {
	const result: BindablePortCandidate[] = []
	for (const node of nodes) {
		const ports = direction === 'in' ? node.inputPorts : node.outputPorts
		for (const port of ports) {
			result.push({
				nodeId: node.id,
				anchorId: port.spec.id,
				label: `${nodeDisplayName(node)} · ${port.spec.label ?? port.spec.id}`,
				mediaType: port.mediaType,
				portSpec: port.spec
			})
		}
	}
	return result
}

function bindingList(data: FrameAutomationData, direction: PortalDirection): FrameIoBinding[] {
	return direction === 'in' ? data.inputBindings : data.outputBindings
}

/** 该内部锚点是否已被绑定（同一方向内一个内部锚点至多一个门户） */
export function findBindingByAnchor(
	data: FrameAutomationData,
	direction: PortalDirection,
	nodeId: string,
	anchorId: string
): FrameIoBinding | undefined {
	return bindingList(data, direction).find((b) => b.nodeId === nodeId && b.anchorId === anchorId)
}

export function findBindingById(
	data: FrameAutomationData,
	direction: PortalDirection,
	bindingId: string
): FrameIoBinding | undefined {
	return bindingList(data, direction).find((b) => b.id === bindingId)
}

/**
 * 切换绑定：已绑定同一内部锚点则移除（toggle），否则新增。
 * 返回新的数组（不可变更新），由调用方经 Command 写回。
 */
export function toggleBinding(
	data: FrameAutomationData,
	direction: PortalDirection,
	nodeId: string,
	anchorId: string,
	label: string,
	mediaType: MediaType
): { bindings: FrameIoBinding[]; added: boolean } {
	const list = bindingList(data, direction)
	const existingIdx = list.findIndex((b) => b.nodeId === nodeId && b.anchorId === anchorId)
	if (existingIdx >= 0) {
		return { bindings: list.filter((_, i) => i !== existingIdx), added: false }
	}
	const binding: FrameIoBinding = {
		id: makePortalBindingId(direction),
		nodeId,
		anchorId,
		label,
		mediaType
	}
	return { bindings: [...list, binding], added: true }
}

export function removeBindingById(
	data: FrameAutomationData,
	direction: PortalDirection,
	bindingId: string
): FrameIoBinding[] {
	return bindingList(data, direction).filter((b) => b.id !== bindingId)
}

/**
 * 加载期清洗：丢弃失效节点/锚点绑定，重算 mediaType，钳制循环次数。
 * getNode 由 Scene 提供（nodeId → BlueprintNode | null）。
 * 返回 null 表示数据完全无效（无 enabled 结构）。
 */
export function sanitizeFrameAutomation(
	raw: unknown,
	frameNodeIds: string[],
	getNode: (id: string) => BlueprintNode | null
): FrameAutomationData | undefined {
	if (!raw || typeof raw !== 'object') return undefined
	const r = raw as Record<string, unknown>
	if (r.enabled !== true) return undefined

	const memberSet = new Set(frameNodeIds)

	const cleanList = (value: unknown, direction: PortalDirection): FrameIoBinding[] => {
		if (!Array.isArray(value)) return []
		const seen = new Set<string>()
		const out: FrameIoBinding[] = []
		for (const item of value) {
			if (!item || typeof item !== 'object') continue
			const b = item as Record<string, unknown>
			const nodeId = String(b.nodeId ?? '')
			const anchorId = String(b.anchorId ?? '')
			if (!nodeId || !anchorId || !memberSet.has(nodeId)) continue
			const node = getNode(nodeId)
			if (!node) continue
			const port = direction === 'in' ? node.getInputPort(anchorId) : node.getOutputPort(anchorId)
			if (!port) continue
			const key = `${nodeId}::${anchorId}`
			if (seen.has(key)) continue
			seen.add(key)
			const id = typeof b.id === 'string' && b.id.trim() ? b.id : makePortalBindingId(direction)
			out.push({
				id,
				nodeId,
				anchorId,
				label: typeof b.label === 'string' ? b.label : undefined,
				mediaType: port.mediaType
			})
		}
		return out
	}

	return {
		enabled: true,
		loopCount: clampLoopCount(r.loopCount),
		inputBindings: cleanList(r.inputBindings, 'in'),
		outputBindings: cleanList(r.outputBindings, 'out')
	}
}

/** 成员节点被删除时，剔除指向它的绑定（命令 undo/redo 对称使用） */
export function pruneBindingsForNode(
	data: FrameAutomationData | undefined,
	removedNodeId: string
): FrameAutomationData | undefined {
	if (!data?.enabled) return data
	const prune = (list: FrameIoBinding[]) => list.filter((b) => b.nodeId !== removedNodeId)
	return {
		...data,
		inputBindings: prune(data.inputBindings),
		outputBindings: prune(data.outputBindings)
	}
}
