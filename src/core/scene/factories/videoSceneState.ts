import type { VideoSceneLayer, VideoSceneState } from '../types'

export const createVideoSceneLayer = (layerId: string, name: string): VideoSceneLayer => ({
	id: layerId,
	name,
	nodeTree: [
		{
			id: 'root',
			createdAt: Date.now(),
			name,
			category: 'project',
			projectKind: 'group',
			children: [],
		},
	],
})

export const createDefaultVideoSceneState = (): VideoSceneState => ({
	showSizePanel: false,
	showBackgroundPanel: false,
	layers: [
		{
			id: 'layer-1',
			name: '图层1',
			nodeTree: createVideoSceneLayer('layer-1', '图层1').nodeTree,
		},
	],
	activeLayerId: 'layer-1',
	selectedNodeId: null,
	selectedNodeIds: [],
	focusedNodeId: null,
	layoutInsets: { rightPanelWidth: 240, bottomToolbarHeight: 40 },
	imageAssets: {},
})
