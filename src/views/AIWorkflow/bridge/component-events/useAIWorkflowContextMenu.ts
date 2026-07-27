import { computed, nextTick, onBeforeUnmount, ref, type ComputedRef, type Ref } from 'vue'
import type { Store } from 'vuex'
import { useI18n } from '../../../../i18n'
import type { WorkflowAction } from '../../../../aiworkflow/actions'
import type { WorkflowNode, WorkflowState } from '../../../../aiworkflow/types'
import type { ContextMenuSection } from '../../../../ui/UIComponent/ContextMenu.vue'
import { findBestInputAnchorForOutput } from '../../../../aiworkflow/domain/link/anchorKinds'
import {
	NEWUI2_NODE_CATALOG,
	NEWUI2_NODE_CATALOG_CATEGORIES,
	NEWUI2_NODE_TOP_CATEGORIES,
	NEWUI2_NODE_SPECIAL_GROUPS
} from '../../../../aiworkflow/nodeLibrary'
import type { DwebCanvasMenuNodeActionId } from '../../../../ui/UIComponent/DwebCanvasMenu.types'

type ContextMenuState = {
	open: boolean
	x: number
	y: number
	worldX: number
	worldY: number
}

export const useAIWorkflowContextMenu = (payload: {
	store: Store<WorkflowState>
	selectedNodeId: Ref<string | null>
	selectedNodeIds: Ref<string[]>
	selectedEdgeId: Ref<string | null>
	canOpenSelectedNodeFolder: ComputedRef<boolean>
	selectedNodeLocalResourcePath: ComputedRef<string>
	selectionActions: ComputedRef<WorkflowAction[]>
	nodeResourceUrl: (node: WorkflowNode) => string | null
	inferSelectedResourceFilename: (node: WorkflowNode) => string
	downloadUrlAsBlob: (url: string, filename: string) => Promise<void>
	pasteNodesWithResourceDedupe: (position?: { worldX?: number; worldY?: number }) => void
	applyAction: (action: WorkflowAction) => void
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	openFolderForPath: (path: string) => Promise<{ ok?: boolean; error?: string } | null | void>
	syncBlueprint?: () => void
	engineApi?: {
		addNode?: (type: string, x: number, y: number, data?: Record<string, any>) => string | null
		createNodeWithConnection?: (params: {
			type: string
			x: number
			y: number
			title?: string
			fromNodeId: string
			fromAnchorId: string
			findBestInputAnchor?: (
				nodesById: Record<string, any>,
				fromNodeId: string,
				fromAnchorId: string,
				newNodeId: string
			) => string | null
			additionalData?: Record<string, any>
		}) => { nodeId: string | null; connected: boolean }
		updateNodeData?: (nodeId: string, patch: Record<string, any>) => boolean
		connectPorts?: (
			fromNodeId: string,
			fromAnchorId: string,
			toNodeId: string,
			toAnchorId: string
		) => boolean
		copySelection?: () => void
		paste?: () => void
		pasteAt?: (worldX: number, worldY: number) => string[]
		duplicate?: () => void
		deleteSelection?: () => void
	}
}) => {
	const { t } = useI18n()
	const contextMenu = ref<ContextMenuState>({ open: false, x: 0, y: 0, worldX: 0, worldY: 0 })
	const inspectorOpen = ref(false)
	let cleanupContext: (() => void) | null = null

	const nodeSearchMenuVisible = ref(false)
	const nodeSearchMenuPosition = ref({ clientX: 0, clientY: 0, worldX: 0, worldY: 0 })
	const pendingLinkAnchor = ref<{ fromNodeId: string; fromAnchorId: string } | null>(null)

	const closeContextMenu = () => {
		contextMenu.value.open = false
		if (cleanupContext) cleanupContext()
		cleanupContext = null
	}

	const closeNodeSearchMenu = () => {
		nodeSearchMenuVisible.value = false
		pendingLinkAnchor.value = null
	}

	const openNodeSearchMenu = (
		position: { clientX: number; clientY: number; worldX: number; worldY: number },
		linkInfo?: { fromNodeId: string; fromAnchorId: string }
	) => {
		nodeSearchMenuPosition.value = position
		pendingLinkAnchor.value = linkInfo ?? null
		nodeSearchMenuVisible.value = true
		closeContextMenu()
	}

	const onCanvasContextMenu = (menuPayload: {
		clientX: number
		clientY: number
		worldX: number
		worldY: number
	}) => {
		contextMenu.value = {
			open: true,
			x: menuPayload.clientX,
			y: menuPayload.clientY,
			worldX: menuPayload.worldX,
			worldY: menuPayload.worldY
		}
		if (cleanupContext) cleanupContext()
		const onClose = (event: Event) => {
			closeContextMenu()
		}
		window.setTimeout(() => {
			window.addEventListener('pointerdown', onClose)
			window.addEventListener('contextmenu', onClose)
			cleanupContext = () => {
				window.removeEventListener('pointerdown', onClose)
				window.removeEventListener('contextmenu', onClose)
			}
		}, 0)
	}

	const onLinkDropOnCanvas = (payload: {
		clientX: number
		clientY: number
		worldX: number
		worldY: number
		fromNodeId: string
		fromAnchorId: string
	}) => {
		openNodeSearchMenu(payload, {
			fromNodeId: payload.fromNodeId,
			fromAnchorId: payload.fromAnchorId
		})
	}

	const contextMenuSections = computed<ContextMenuSection[]>(() => {
		const topItems: { id: string; label: string; disabled?: boolean }[] = []
		if (payload.selectedNodeId.value) {
			const node = payload.store.state.nodesById[payload.selectedNodeId.value]
			topItems.push({
				id: 'node-info',
				label: node
					? t('aiworkflow.contextMenu.nodeInfo', { name: node.title })
					: t('aiworkflow.contextMenu.nodeNotFound'),
				disabled: true
			})
		} else if (payload.selectedEdgeId.value) {
			topItems.push({
				id: 'edge-info',
				label: t('aiworkflow.contextMenu.edgeInfo', { id: payload.selectedEdgeId.value }),
				disabled: true
			})
		} else {
			topItems.push({ id: 'none', label: t('aiworkflow.contextMenu.noSelection'), disabled: true })
		}

		const actionItems: { id: string; label: string; disabled?: boolean }[] = []
		const selectedNode = payload.selectedNodeId.value
			? payload.store.state.nodesById[payload.selectedNodeId.value]
			: null

		if (selectedNode && (selectedNode.type === 'image' || selectedNode.type === 'video')) {
			const url = payload.nodeResourceUrl(selectedNode)
			actionItems.push({
				id: selectedNode.type === 'image' ? 'save-image-resource' : 'save-video-resource',
				label:
					selectedNode.type === 'image'
						? t('aiworkflow.contextMenu.saveImageAs')
						: t('aiworkflow.contextMenu.saveVideoAs'),
				disabled: !String(url ?? '').trim()
			})
			actionItems.push({
				id: 'open-image-folder',
				label: t('aiworkflow.contextMenu.revealInFolder'),
				disabled: !payload.canOpenSelectedNodeFolder.value
			})
		}

		if (selectedNode && selectedNode.type === 'model3d') {
			const url = String(selectedNode.model3dSettings?.modelUrl ?? '').trim()
			actionItems.push({
				id: 'save-model-resource',
				label: t('aiworkflow.contextMenu.saveModelAs'),
				disabled: !url
			})
			actionItems.push({
				id: 'open-image-folder',
				label: t('aiworkflow.contextMenu.revealInFolder'),
				disabled: !payload.canOpenSelectedNodeFolder.value
			})
		}

		actionItems.push(
			...payload.selectionActions.value.map((action) => ({ id: action.id, label: action.label }))
		)

		const canCopy = payload.selectedNodeIds.value.length > 0
		const canPaste =
			!!payload.store.state.clipboardNode ||
			(Array.isArray(payload.store.state.clipboardNodes) &&
				payload.store.state.clipboardNodes.length > 0)
		const canDuplicate = payload.selectedNodeIds.value.length > 0
		const canSetType = !!payload.selectedNodeId.value

		return [
			{ title: t('aiworkflow.contextMenu.currentSelection'), items: topItems },
			...(actionItems.length
				? [{ title: t('aiworkflow.contextMenu.selectionActions'), items: actionItems }]
				: []),
			{
				title: t('aiworkflow.contextMenu.general'),
				items: [
					{ id: 'add-node', label: t('aiworkflow.contextMenu.addNode') },
					{ id: 'reset-viewport', label: t('aiworkflow.contextMenu.resetViewport') },
					{ id: 'copy-node', label: t('aiworkflow.contextMenu.copy'), disabled: !canCopy },
					{ id: 'paste-node', label: t('aiworkflow.contextMenu.paste'), disabled: !canPaste },
					{
						id: 'duplicate-node',
						label: t('aiworkflow.contextMenu.duplicate'),
						disabled: !canDuplicate
					}
				]
			},
			{
				title: t('aiworkflow.contextMenu.nodeSettings'),
				items: [
					{
						id: 'set-type',
						label: t('aiworkflow.contextMenu.setType'),
						disabled: !canSetType,
						children: [
							{ id: 'set-type:base', label: t('nodes.type.base') },
							{ id: 'set-type:text', label: t('nodes.type.text') },
							{ id: 'set-type:text-merge', label: t('nodes.type.textMerge') },
							{ id: 'set-type:image', label: t('nodes.type.image') },
							{ id: 'set-type:rotate-image', label: t('nodes.type.rotateImage') },
							{ id: 'set-type:video', label: t('nodes.type.video') },
							{ id: 'set-type:story', label: t('nodes.type.story') },
							{ id: 'set-type:comfyui', label: t('nodes.type.comfyui') },
							{ id: 'set-type:model3d', label: t('nodes.type.model3d') },
							{ id: 'set-type:meshy', label: t('nodes.type.meshy') }
						]
					}
				]
			}
		]
	})

	const onContextMenuSelect = (id: string) => {
		const selectedNode = payload.selectedNodeId.value
			? payload.store.state.nodesById[payload.selectedNodeId.value]
			: null

		if (
			(id === 'save-image-resource' ||
				id === 'save-video-resource' ||
				id === 'save-model-resource') &&
			selectedNode
		) {
			const url =
				selectedNode.type === 'model3d'
					? String(selectedNode.model3dSettings?.modelUrl ?? '').trim()
					: String(payload.nodeResourceUrl(selectedNode) ?? '').trim()
			if (url) {
				const filename = payload.inferSelectedResourceFilename(selectedNode)
				payload
					.downloadUrlAsBlob(url, filename)
					.then(() => payload.pushToast(t('aiworkflow.contextMenu.downloadStarted'), 'info'))
					.catch((err: unknown) => {
						const errMsg = err instanceof Error ? err.message : String(err ?? 'unknown')
						payload.pushToast(
							t('aiworkflow.contextMenu.downloadFailed', { error: errMsg }),
							'error'
						)
					})
			}
		}

		if (id === 'open-image-folder' && payload.selectedNodeId.value) {
			const filePath = payload.selectedNodeLocalResourcePath.value
			if (filePath) {
				payload
					.openFolderForPath(filePath)
					.then((res) => {
						if (!res?.ok) {
							let message = 'unknown'
							if (res && typeof res === 'object') {
								const ro = res as Record<string, unknown>
								message = String(ro.error ?? 'unknown')
							}
							if (/No handler registered/i.test(message)) {
								payload.pushToast(t('aiworkflow.contextMenu.folderOpenFailedIpc'), 'warn')
								return
							}
							payload.pushToast(
								t('aiworkflow.contextMenu.folderOpenFailed', { error: message }),
								'warn'
							)
						}
					})
					.catch((err: unknown) => {
						let message = 'unknown'
						if (err instanceof Error) {
							message = err.message
						} else if (err && typeof err === 'object') {
							const eo = err as Record<string, unknown>
							message = String(eo.message ?? err)
						} else {
							message = String(err)
						}
						if (/No handler registered/i.test(message)) {
							payload.pushToast(t('aiworkflow.contextMenu.folderOpenFailedIpc'), 'warn')
							return
						}
						payload.pushToast(
							t('aiworkflow.contextMenu.folderOpenFailed', { error: message }),
							'warn'
						)
					})
			}
		}

		if (id === 'add-node') {
			openNodeSearchMenu({
				clientX: contextMenu.value.x,
				clientY: contextMenu.value.y,
				worldX: contextMenu.value.worldX,
				worldY: contextMenu.value.worldY
			})
		}
		if (id === 'reset-viewport') {
			payload.store.commit('resetViewport')
		}
		if (id === 'copy-node') {
			if (payload.engineApi?.copySelection) {
				payload.engineApi.copySelection()
			} else {
				const primary = payload.selectedNodeId.value ?? payload.selectedNodeIds.value[0]
				if (primary) payload.store.commit('copyNode', { nodeId: primary })
			}
		}
		if (id === 'paste-node') {
			if (payload.engineApi?.paste) {
				payload.engineApi.paste()
			} else {
				payload.pasteNodesWithResourceDedupe({
					worldX: contextMenu.value.worldX,
					worldY: contextMenu.value.worldY
				})
			}
		}
		if (id === 'duplicate-node') {
			if (payload.engineApi?.duplicate) {
				payload.engineApi.duplicate()
			}
		}
		if (id.startsWith('set-type:') && payload.selectedNodeId.value) {
			const nextType = id.slice('set-type:'.length)
			if (payload.engineApi?.updateNodeData) {
				payload.engineApi.updateNodeData(payload.selectedNodeId.value, { type: nextType })
			}
		}
		if (id === 'delete') {
			if (payload.engineApi?.deleteSelection) {
				payload.engineApi.deleteSelection()
			} else {
				const action = payload.selectionActions.value.find((item) => item.id === 'delete')
				if (action) payload.applyAction(action)
			}
		}

		closeContextMenu()
	}

	const onNodeSearchMenuSelect = async (actionId: DwebCanvasMenuNodeActionId) => {
		const catalogItem = NEWUI2_NODE_CATALOG.find((item) => item.actionId === actionId)
		if (!catalogItem) return

		const { worldX, worldY } = nodeSearchMenuPosition.value

		let newNodeId: string | null = null

		if (payload.engineApi?.createNodeWithConnection && pendingLinkAnchor.value) {
			const { fromNodeId, fromAnchorId } = pendingLinkAnchor.value
			const result = payload.engineApi.createNodeWithConnection({
				type: catalogItem.nodeType || 'base',
				x: worldX,
				y: worldY,
				title: catalogItem.label,
				fromNodeId,
				fromAnchorId,
				findBestInputAnchor: findBestInputAnchorForOutput
			})
			newNodeId = result.nodeId
		} else if (payload.engineApi?.addNode) {
			newNodeId = payload.engineApi.addNode(catalogItem.nodeType || 'base', worldX, worldY, {
				title: catalogItem.label
			})
		}

		pendingLinkAnchor.value = null
		closeNodeSearchMenu()
	}

	const onNodeSearchMenuUploadFile = (_file: File) => {
		closeNodeSearchMenu()
	}

	const toggleInspector = () => {
		inspectorOpen.value = !inspectorOpen.value
	}

	onBeforeUnmount(() => {
		if (cleanupContext) cleanupContext()
		cleanupContext = null
	})

	return {
		contextMenu,
		inspectorOpen,
		toggleInspector,
		onCanvasContextMenu,
		onContextMenuSelect,
		contextMenuSections,
		closeContextMenu,
		nodeSearchMenuVisible,
		nodeSearchMenuPosition,
		closeNodeSearchMenu,
		onNodeSearchMenuSelect,
		onNodeSearchMenuUploadFile,
		onLinkDropOnCanvas,
		openNodeSearchMenu,
		NEWUI2_NODE_CATALOG,
		NEWUI2_NODE_CATALOG_CATEGORIES,
		NEWUI2_NODE_TOP_CATEGORIES,
		NEWUI2_NODE_SPECIAL_GROUPS
	}
}
