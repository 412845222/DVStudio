/**
 * 从节点ID列表生成稳定的标签key
 * @param nodeIds 节点ID数组
 * @returns 稳定key字符串，格式为 `ids:nodeId1|nodeId2|...`
 */
export const makeSelectionTagKey = (nodeIds: string[]): string => {
	const sorted = [...nodeIds].sort()
	return `ids:${sorted.join('|')}`
}

/**
 * 从标签key解析节点ID列表
 * @param key 标签key
 * @returns 节点ID数组
 */
export const parseSelectionTagKey = (key: string): string[] => {
	if (!key.startsWith('ids:')) return []
	return key.slice(4).split('|').filter(Boolean)
}

/**
 * 检查节点是否在某个标签的节点集合中
 * @param tag 标签对象
 * @param nodeId 节点ID
 * @returns 是否包含
 */
export const isNodeInSelectionTag = (tag: { nodeIds: string[] }, nodeId: string): boolean => {
	return tag.nodeIds.includes(nodeId)
}