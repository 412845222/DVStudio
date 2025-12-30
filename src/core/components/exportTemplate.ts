import type { JsonValue } from '../shared/json'
import type { VideoSceneTreeNode } from '../scene'
import { findNode, isDescendant, walkTree } from '../scene/tree'

import type { ComponentTemplate, TemplateNode, TemplateNodeTransform } from './types'

export type ExportTemplateFromSelectionArgs = {
	layerNodeTree: VideoSceneTreeNode[]
	selectedNodeIds: string[]
	templateId?: string
	name?: string
	description?: string
}

const nowId = () => `tpl_${Date.now().toString(36)}`

const cloneProps = (props?: Record<string, JsonValue>): Record<string, JsonValue> => ({ ...(props ?? {}) })

const toTransform = (n: VideoSceneTreeNode): TemplateNodeTransform | undefined => {
	if (!n.transform) return undefined
	return {
		x: n.transform.x,
		y: n.transform.y,
		width: n.transform.width,
		height: n.transform.height,
		rotation: n.transform.rotation,
		opacity: n.transform.opacity,
	}
}

const collectSubtreeUserNodes = (root: VideoSceneTreeNode): VideoSceneTreeNode[] => {
	const out: VideoSceneTreeNode[] = []
	const nodes = [root]
	while (nodes.length) {
		const n = nodes.shift()
		if (!n) break
		if (n.category === 'user') out.push(n)
		if (n.children?.length) nodes.push(...n.children)
	}
	return out
}

export function exportTemplateFromSelection(args: ExportTemplateFromSelectionArgs): ComponentTemplate {
	const selected = args.selectedNodeIds.map((id) => String(id || '').trim()).filter(Boolean)
	if (selected.length === 0) {
		throw new Error('exportTemplateFromSelection: selectedNodeIds is empty')
	}

	// Only allow ids that exist and are user nodes.
	const selectedUserIds = selected.filter((id) => {
		const n = findNode(args.layerNodeTree, id)
		return !!n && n.category === 'user'
	})
	if (selectedUserIds.length === 0) {
		throw new Error('exportTemplateFromSelection: no user nodes found in selection')
	}

	// Reduce to roots (exclude nodes whose ancestor is also selected)
	const selectedSet = new Set(selectedUserIds)
	const rootIds = selectedUserIds.filter((id) => {
		for (const maybeAncestorId of selectedSet) {
			if (maybeAncestorId === id) continue
			if (isDescendant(args.layerNodeTree, maybeAncestorId, id)) return false
		}
		return true
	})

	const roots: VideoSceneTreeNode[] = []
	for (const id of rootIds) {
		const n = findNode(args.layerNodeTree, id)
		if (n && n.category === 'user') roots.push(n)
	}
	if (roots.length === 0) throw new Error('exportTemplateFromSelection: no root nodes found')

	// Collect all user nodes we want to export (full subtrees of each root)
	const nodesToExport: VideoSceneTreeNode[] = []
	const toExportSet = new Set<string>()
	for (const r of roots) {
		for (const n of collectSubtreeUserNodes(r)) {
			if (toExportSet.has(n.id)) continue
			toExportSet.add(n.id)
			nodesToExport.push(n)
		}
	}

	// Build localId mapping
	const nodeIdToLocalId: Record<string, string> = {}
	const localIdToNodeId: Record<string, string> = {}
	let seq = 0
	for (const n of nodesToExport) {
		seq += 1
		const localId = `n${seq}`
		nodeIdToLocalId[n.id] = localId
		localIdToNodeId[localId] = n.id
	}

	// Determine parent mapping inside exported set
	const parentIdById: Record<string, string | undefined> = {}
	walkTree(args.layerNodeTree, (node, parent) => {
		if (node.category !== 'user') return
		if (!toExportSet.has(node.id)) return
		if (parent && parent.category === 'user' && toExportSet.has(parent.id)) {
			parentIdById[node.id] = parent.id
		}
	})

	const templateNodes: TemplateNode[] = nodesToExport.map((n) => {
		const localId = nodeIdToLocalId[n.id]
		const parentId = parentIdById[n.id]
		const parentLocalId = parentId ? nodeIdToLocalId[parentId] : undefined
		return {
			localId,
			type: n.userType ?? 'base',
			name: n.name,
			parentLocalId,
			transform: toTransform(n),
			props: cloneProps(n.props),
		}
	})

	// Single root => use that node; multi roots => synth group root
	let rootLocalId: string
	if (roots.length === 1) {
		rootLocalId = nodeIdToLocalId[roots[0].id]
	} else {
		// group root
		rootLocalId = 'g0'
		const group: TemplateNode = { localId: rootLocalId, type: 'group', name: 'Group', props: {} }
		// re-parent exported roots under group
		const rootIdSet = new Set(roots.map((r) => r.id))
		for (const n of templateNodes) {
			const originalNodeId = localIdToNodeId[n.localId]
			if (originalNodeId && rootIdSet.has(originalNodeId)) {
				n.parentLocalId = rootLocalId
			}
		}
		templateNodes.unshift(group)
	}

	return {
		schemaVersion: 1,
		templateId: args.templateId ?? nowId(),
		name: args.name ?? 'Exported Template',
		description: args.description,
		params: [],
		nodes: templateNodes,
		rootLocalId,
	}
}
