import type { SavedSelectionFrame } from '../../types'

/**
 * 判断选区的所有节点是否都在移动集合中（即选区被整体移动）
 */
export const isFrameFullyMoved = (
	frameNodeIds: string[],
	movingNodeIds: Set<string>,
): boolean => {
	if (!frameNodeIds?.length) return false
	return frameNodeIds.every(id => movingNodeIds.has(id))
}

/**
 * 获取所有被整体移动的选区
 * 这些选区的所有节点都在移动集合中
 */
export const getFullyMovedFrames = (
	frames: SavedSelectionFrame[],
	movingNodeIds: Set<string>,
): SavedSelectionFrame[] => {
	if (!frames?.length) return []
	return frames.filter(f => f.nodeIds?.length && isFrameFullyMoved(f.nodeIds, movingNodeIds))
}

/**
 * 判断选区 A 是否完全包含选区 B（A ⊇ B）
 */
export const frameContains = (frameA: SavedSelectionFrame, frameB: SavedSelectionFrame): boolean => {
	if (!frameA.nodeIds?.length || !frameB.nodeIds?.length) return false
	const setA = new Set(frameA.nodeIds)
	return frameB.nodeIds.every(id => setA.has(id))
}

/**
 * 构建选区包含关系树
 * 返回 Map<parentFrameId, childFrameId[]>
 * 只记录直接包含关系（不传递）
 */
export const buildFrameContainmentTree = (
	frames: SavedSelectionFrame[],
): Map<string, string[]> => {
	const tree = new Map<string, string[]>()
	if (!frames?.length) return tree

	for (const frame of frames) {
		tree.set(frame.id, [])
	}

	for (const potentialChild of frames) {
		let immediateParent: string | null = null
		let maxChildSize = -1

		for (const potentialParent of frames) {
			if (potentialParent.id === potentialChild.id) continue

			if (frameContains(potentialParent, potentialChild)) {
				// 找直接父节点：包含子节点且子节点数量最多的（最接近子节点的父节点）
				const parentSize = potentialParent.nodeIds?.length ?? 0
				if (parentSize > maxChildSize) {
					// 确认 potentialParent 是 potentialChild 的直接父节点
					// 方法：检查是否存在中间节点
					let isImmediate = true
					for (const middle of frames) {
						if (middle.id === potentialParent.id || middle.id === potentialChild.id) continue
						if (
							frameContains(potentialParent, middle) &&
							frameContains(middle, potentialChild)
						) {
							isImmediate = false
							break
						}
					}
					if (isImmediate) {
						maxChildSize = parentSize
						immediateParent = potentialParent.id
					}
				}
			}
		}

		if (immediateParent) {
			const children = tree.get(immediateParent) ?? []
			children.push(potentialChild.id)
			tree.set(immediateParent, children)
		}
	}

	return tree
}

/**
 * 计算两个选区之间的集合关系类型
 */
export type FrameRelation =
	| 'equal' // A = B
	| 'a_contains_b' // A ⊃ B（A 真包含 B）
	| 'b_contains_a' // B ⊃ A（B 真包含 A）
	| 'intersect' // 部分相交但互不包含
	| 'disjoint' // 完全不相交

export const getFrameRelation = (
	frameA: SavedSelectionFrame,
	frameB: SavedSelectionFrame,
): FrameRelation => {
	const setA = new Set(frameA.nodeIds ?? [])
	const setB = new Set(frameB.nodeIds ?? [])

	const aInB = frameA.nodeIds?.every(id => setB.has(id)) ?? false
	const bInA = frameB.nodeIds?.every(id => setA.has(id)) ?? false

	if (aInB && bInA) return 'equal'
	if (bInA) return 'a_contains_b'
	if (aInB) return 'b_contains_a'

	// 检查是否有交集
	const hasIntersection = frameA.nodeIds?.some(id => setB.has(id)) ?? false
	return hasIntersection ? 'intersect' : 'disjoint'
}

/**
 * 计算选区的并集节点列表
 */
export const unionFrames = (frames: SavedSelectionFrame[]): string[] => {
	const union = new Set<string>()
	for (const f of frames) {
		for (const id of f.nodeIds ?? []) {
			union.add(id)
		}
	}
	return Array.from(union)
}

/**
 * 计算选区的交集节点列表
 */
export const intersectFrames = (frames: SavedSelectionFrame[]): string[] => {
	if (!frames?.length) return []
	if (frames.length === 1) return [...(frames[0].nodeIds ?? [])]

	const sets = frames.map(f => new Set(f.nodeIds ?? []))
	const first = sets[0]
	const result: string[] = []

	for (const id of first) {
		let inAll = true
		for (let i = 1; i < sets.length; i++) {
			if (!sets[i].has(id)) {
				inAll = false
				break
			}
		}
		if (inAll) result.push(id)
	}

	return result
}
