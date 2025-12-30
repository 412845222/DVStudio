import type { EditorSnapshot } from '../../editor/types'
import type { VideoSceneNodeProps, VideoSceneTreeNode } from '../../scene/types'
import type { ProjectManifestV1 } from './types'
import { genStableId } from './ids'

const mapTree = (
	nodes: VideoSceneTreeNode[] | undefined,
	map: (n: VideoSceneTreeNode) => VideoSceneTreeNode
): VideoSceneTreeNode[] => {
	if (!nodes) return []
	return nodes.map((n) => {
		const mapped = map(n)
		const children = mapped.children
		if (children?.length) {
			return { ...mapped, children: mapTree(children, map) }
		}
		return mapped
	})
}

const mapImageNodeProps = (props: VideoSceneNodeProps | undefined, idMap: Record<string, string>): VideoSceneNodeProps | undefined => {
	if (!props) return props
	const raw = props.imageId
	if (typeof raw !== 'string') return props
	const mapped = idMap[raw]
	if (!mapped) return props
	return { ...props, imageId: mapped }
}

export const rewriteImageAssetIdsOnImportV1 = (args: {
	snapshot: EditorSnapshot
	manifest: ProjectManifestV1
	existingImageAssetIds: Set<string>
}): { snapshot: EditorSnapshot; manifest: ProjectManifestV1; assetIdMap: Record<string, string> } => {
	const idMap: Record<string, string> = {}
	const nextManifest: ProjectManifestV1 = { ...args.manifest, assets: { ...args.manifest.assets } }
	const nextImageAssets = { ...args.snapshot.videoScene.imageAssets }
	for (const id of Object.keys(nextImageAssets)) {
		if (!args.existingImageAssetIds.has(id)) continue
		const nextId = genStableId('img')
		idMap[id] = nextId
		const cur = nextImageAssets[id]
		delete nextImageAssets[id]
		nextImageAssets[nextId] = { ...cur, id: nextId }

		const m = nextManifest.assets[id]
		if (m) {
			delete nextManifest.assets[id]
			nextManifest.assets[nextId] = { ...m, id: nextId }
		}
	}
	const nextLayers = args.snapshot.videoScene.layers.map((layer) => {
		return {
			...layer,
			nodeTree: mapTree(layer.nodeTree, (node) => {
				if (node.category !== 'user' || node.userType !== 'image') return node
				const nextProps = mapImageNodeProps(node.props, idMap)
				if (nextProps === node.props) return node
				return { ...node, props: nextProps }
			}),
		}
	})

	const nextSnapshot: EditorSnapshot = {
		...args.snapshot,
		videoScene: {
			...args.snapshot.videoScene,
			imageAssets: nextImageAssets,
			layers: nextLayers,
		},
	}

	return { snapshot: nextSnapshot, manifest: nextManifest, assetIdMap: idMap }
}
