import type { EditorSnapshot } from '../../editor/types'
import type { JsonValue } from '../../shared/json'
import type { ProjectAssetEntryV1, ProjectManifestV1 } from './types'

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

const walkNodes = (
	nodes: unknown,
	onNode: (node: Record<string, JsonValue>) => void
) => {
	if (!Array.isArray(nodes)) return
	for (const raw of nodes) {
		if (!raw || typeof raw !== 'object') continue
		const node = raw as Record<string, JsonValue>
		onNode(node)
		const children = node.children
		if (Array.isArray(children)) walkNodes(children, onNode)
	}
}

export const collectUsedImageAssetIdsFromSnapshot = (snapshot: EditorSnapshot): Set<string> => {
	const out = new Set<string>()
	for (const layer of snapshot.videoScene.layers ?? []) {
		walkNodes(layer.nodeTree as unknown, (node) => {
			if (node.category !== 'user') return
			if (node.userType !== 'image') return
			const props = node.props
			if (!props || typeof props !== 'object') return
			const imageId = (props as Record<string, JsonValue>).imageId
			if (isNonEmptyString(imageId)) out.add(imageId)
		})
	}
	return out
}

export const buildManifestFromSnapshotV1 = (snapshot: EditorSnapshot): ProjectManifestV1 => {
	const used = collectUsedImageAssetIdsFromSnapshot(snapshot)
	const assets: Record<string, ProjectAssetEntryV1> = {}

	for (const [id, a] of Object.entries(snapshot.videoScene.imageAssets ?? {})) {
		// 默认策略：只打包“被节点引用”的资源；但如果 imageAssets 里存在而没引用，也不强制丢弃。
		if (used.size && !used.has(id)) continue
		assets[id] = {
			id,
			kind: 'image',
			mime: 'image/*',
			name: a.name,
			createdAt: a.createdAt,
			url: a.url,
		}
	}

	// 兜底：节点里引用了 imageId，但 imageAssets 里缺少该条目
	for (const id of used) {
		if (assets[id]) continue
		assets[id] = { id, kind: 'image', mime: 'image/*' }
	}

	return { schemaVersion: 1, assets }
}
