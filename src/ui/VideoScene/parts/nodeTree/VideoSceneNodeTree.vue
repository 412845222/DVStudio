<template>
	<div ref="rootEl" class="vs-nodes" @pointerdown.stop>
		<div class="vs-nodes-header">{{ activeLayerName }}</div>
		<div ref="bodyEl" class="vs-nodes-body" @dragover.stop.prevent @drop.stop.prevent="onDropRoot">
			<div v-if="dropLineVisible" class="vs-drop-line" :style="{ top: `${dropLineTop}px` }" />
			<div
				v-for="n in visibleFlatNodes"
				:key="n.id"
				class="vs-tree-item"
				:class="{
					selected: selectedNodeIds.includes(n.id),
					locked: isLocked(n.id),
					'drag-over':
						draggingNodeId &&
						dropMode === 'child' &&
						dragOverNodeId === n.id &&
						draggingNodeId !== n.id
				}"
				:style="{
					paddingLeft: `${10 + n.depth * 14}px`,
					'--tree-indent': `${10 + n.depth * 14}px`
				}"
				draggable="true"
				@dragstart.stop="onDragStart(n.id, $event)"
				@dragend="onDragEnd"
				@dragenter.stop.prevent="onDragEnter(n)"
				@dragover.stop.prevent="onDragOver(n, $event)"
				@dragleave.stop="onDragLeave(n, $event)"
				@drop.stop.prevent="onDropOnNode(n, $event)"
				@click="onSelect(n.id)"
				@contextmenu.stop.prevent="onContextMenu(n, $event)"
			>
				<template v-if="renamingId === n.id">
					<input
						ref="renameInputRef"
						v-model="renameDraft"
						class="vs-rename"
						type="text"
						@pointerdown.stop
						@click.stop
						@keydown.enter.prevent="commitRename"
						@keydown.escape.prevent="cancelRename"
						@blur="commitRename"
					/>
				</template>
				<template v-else>
					<button
						v-if="hasChildren(n.id)"
						class="vs-tree-toggle"
						type="button"
						:title="isCollapsed(n.id) ? '展开' : '收起'"
						@pointerdown.stop
						@click.stop.prevent="toggleCollapse(n.id)"
					>
						<svg
							class="vs-tree-toggle-icon"
							:class="{ collapsed: isCollapsed(n.id) }"
							viewBox="0 0 24 24"
							width="14"
							height="14"
							aria-hidden="true"
						>
							<path fill="currentColor" d="M8 5l8 7-8 7V5z" />
						</svg>
					</button>
					<span v-else class="vs-tree-toggle-spacer" />
					<span class="vs-tree-name">{{ n.name }}</span>
					<span v-if="isComponentRoot(n.id)" class="vs-tree-badge">组件</span>
					<div class="vs-tree-actions">
						<button
							v-if="hasChildren(n.id)"
							class="vs-tree-action"
							type="button"
							:title="
								isGroupLocked(n.id)
									? '组合解锁：子节点可选可操作'
									: '组合锁：父节点可选，子节点不可选/不可操作'
							"
							@pointerdown.stop
							@click.stop.prevent="toggleGroupLock(n.id)"
						>
							<svg
								viewBox="0 0 24 24"
								width="14"
								height="14"
								aria-hidden="true"
								:style="{ opacity: isGroupLocked(n.id) ? 1 : 0.75 }"
							>
								<path
									fill="currentColor"
									d="M7 7h3V4H4v6h3V7Zm10 0h3V4h-6v3h3Zm0 10h-3v3h6v-6h-3v3ZM7 17H4v3h6v-3H7v-3H4v6h3v-3Zm3-3h4v-4h-4v4Zm-2 6h8v-2H8v2Zm0-14h8V4H8v2Z"
								/>
							</svg>
							组合
						</button>
						<button
							class="vs-tree-lock"
							type="button"
							:title="isLocked(n.id) ? '解锁：允许舞台点击选中' : '锁定：舞台点击将忽略该节点'"
							@pointerdown.stop
							@click.stop.prevent="toggleLock(n.id)"
						>
							<svg
								v-if="isLocked(n.id)"
								viewBox="0 0 24 24"
								width="14"
								height="14"
								aria-hidden="true"
							>
								<path
									fill="currentColor"
									d="M17 10h-1V8a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-7-2a2 2 0 1 1 4 0v2h-4V8Zm2 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"
								/>
							</svg>
							<svg v-else viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
								<path
									fill="currentColor"
									d="M17 8h-1V7a4 4 0 0 0-8 0v1H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2Zm-7-1a2 2 0 1 1 4 0v1h-4V7Zm2 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"
								/>
							</svg>
						</button>
						<button
							class="vs-tree-delete"
							type="button"
							title="删除"
							@pointerdown.stop
							@click.stop.prevent="deleteNode(n.id)"
						>
							×
						</button>
						<button
							class="vs-tree-action"
							type="button"
							@click.stop.prevent="startRename(n.id, n.name)"
						>
							重命名
						</button>
					</div>
				</template>
			</div>
		</div>
		<div
			v-if="menu.visible"
			class="vs-tree-menu"
			:style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
			@pointerdown.stop
			@click.stop
		>
			<button class="vs-tree-menu-item" type="button" @click="onSyncComponent">
				同步组件库数据
			</button>
			<button class="vs-tree-menu-item" type="button" @click="onPushComponent">
				更新组件库数据
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useStore } from 'vuex'
import { VideoSceneKey, type VideoSceneState } from '../../../../store/videoscene'
import type {
	VideoSceneLayer,
	VideoSceneTreeNode,
	VideoSceneNodeProps
} from '../../../../core/scene/types'
import { VideoSceneNodeTreeController } from './VideoSceneNodeTreeController'
import type { FlatNode } from './NodeTreeController'
import { DwebCanvasGLKey } from '../../VideoSceneRuntime'
import { ComponentLibraryService } from '../../../../network/ComponentLibraryService'
import { componentTemplateApi } from '../../../../core/components'
import { isObject, isString } from '../../../../types/utils'
import type { JsonValue } from '../../../../core/shared/json'

defineOptions({ name: 'VideoSceneNodeTree' })

type SavedComponentItem = {
	id?: string
	templateId?: string
	createdAt?: string
	savedAt?: string
	name?: string
	template?: unknown
	thumbAssetId?: string
	thumbUrl?: string
}

type ComponentMeta = {
	templateId: string
	componentId: string
	params: Record<string, JsonValue>
	props: Record<string, JsonValue>
}

const store = useStore<VideoSceneState>(VideoSceneKey)
const controller = new VideoSceneNodeTreeController(store)
const dwebCanvasRef = inject(DwebCanvasGLKey, null)
const componentService = new ComponentLibraryService()
const COMPONENT_LIBRARY_KEY = 'dvs.componentLibrary.v1'

const selectedNodeIds = computed(() => store.state.selectedNodeIds ?? [])
const rootEl = ref<HTMLElement | null>(null)
const bodyEl = ref<HTMLElement | null>(null)
defineExpose({ rootEl })

const activeLayerName = computed(() => controller.getActiveLayer()?.name ?? '图层')
const flatNodes = computed(() => controller.flatten(controller.getActiveElements(), 'root'))

const collapsedIds = ref<Set<string>>(new Set())
const isCollapsed = (nodeId: string) => collapsedIds.value.has(String(nodeId))
const toggleCollapse = (nodeId: string) => {
	const id = String(nodeId)
	if (!id) return
	const next = new Set(collapsedIds.value)
	if (next.has(id)) next.delete(id)
	else next.add(id)
	collapsedIds.value = next
}

const nodeIndex = computed(() => {
	const out = new Map<string, VideoSceneTreeNode>()
	const walk = (list: VideoSceneTreeNode[]) => {
		for (const n of list) {
			out.set(String(n.id), n)
			if (n.children?.length) walk(n.children)
		}
	}
	walk(controller.getActiveElements())
	return out
})

const getComponentMeta = (nodeId: string): ComponentMeta | null => {
	const n = nodeIndex.value.get(String(nodeId))
	const props = n?.props
	if (!props || typeof props !== 'object') return null
	const propsRec = props as Record<string, JsonValue>
	const templateIdVal = propsRec.__dvsComponentTemplateId
	const templateId = isString(templateIdVal) ? String(templateIdVal).trim() : ''
	if (!templateId) return null
	const componentIdVal = propsRec.__dvsComponentLibraryId
	const componentId = isString(componentIdVal) ? String(componentIdVal).trim() : ''
	const paramsVal = propsRec.__dvsComponentParams
	const params: Record<string, JsonValue> = isObject(paramsVal)
		? (paramsVal as Record<string, JsonValue>)
		: {}
	return { templateId, componentId, params, props: propsRec }
}

const isComponentRoot = (nodeId: string) => {
	return !!getComponentMeta(nodeId)
}

const hasChildren = (nodeId: string) => {
	const n = nodeIndex.value.get(String(nodeId))
	return !!(n && Array.isArray(n.children) && n.children.length)
}

const visibleFlatNodes = computed<FlatNode[]>(() => {
	const out: FlatNode[] = []
	const walk = (list: VideoSceneTreeNode[], depth: number, parentId: string | null) => {
		for (let index = 0; index < list.length; index++) {
			const n = list[index]
			out.push({ id: n.id, name: n.name, depth, parentId, index })
			if (n.children?.length && !isCollapsed(n.id)) walk(n.children, depth + 1, n.id)
		}
	}
	walk(controller.getActiveElements(), 0, 'root')
	return out
})

const isLocked = (nodeId: string) => {
	const n = nodeIndex.value.get(String(nodeId))
	if (!n || n.category !== 'user') return false
	const props = n.props as Record<string, unknown> | undefined
	return !!(props && props.locked)
}

const collectDescendantIds = (nodeId: string) => {
	const root = nodeIndex.value.get(String(nodeId))
	if (!root) return [] as string[]
	const out: string[] = []
	const walk = (n: VideoSceneTreeNode) => {
		if (!n || typeof n !== 'object') return
		const id = String(n.id || '')
		if (id) out.push(id)
		if (Array.isArray(n.children) && n.children.length) {
			for (const c of n.children) walk(c)
		}
	}
	walk(root)
	return out
}

const toggleLock = (nodeId: string) => {
	const n = nodeIndex.value.get(String(nodeId))
	if (!n || n.category !== 'user') return
	const nextLocked = !isLocked(nodeId)
	store.dispatch('updateNodesPropsBatch', {
		nodeIds: [String(nodeId)],
		patch: { locked: nextLocked }
	})
}

const collectChildIds = (nodeId: string) => {
	const ids = collectDescendantIds(nodeId)
	return ids.filter((x) => x !== String(nodeId))
}

const isGroupLocked = (nodeId: string) => {
	if (!hasChildren(nodeId)) return false
	const childIds = collectChildIds(nodeId)
	if (!childIds.length) return false
	return childIds.every((id) => isLocked(id))
}

const toggleGroupLock = (nodeId: string) => {
	const n = nodeIndex.value.get(String(nodeId))
	if (!n || n.category !== 'user') return
	const childIds = collectChildIds(nodeId)
	if (!childIds.length) return
	const nextLocked = !isGroupLocked(nodeId)
	store.dispatch('updateNodesPropsBatch', { nodeIds: childIds, patch: { locked: nextLocked } })
}

const deleteNode = (nodeId: string) => {
	if (renamingId.value) return
	store.dispatch('deleteNodeById', { nodeId })
}

const draggingNodeId = ref<string>('')
const dragOverNodeId = ref<string>('')

const renamingId = ref<string>('')
const renameDraft = ref<string>('')
const renamePrev = ref<string>('')
const renameInputRef = ref<HTMLInputElement | null>(null)

type DropMode = 'child' | 'insert'
const dropMode = ref<DropMode>('child')
const dropLineTop = ref<number>(0)
const dropInsertTarget = ref<{ parentId: string | null; index: number } | null>(null)

const dropLineVisible = computed(() => draggingNodeId.value && dropMode.value === 'insert')

const onSelect = (nodeId: string) => {
	if (renamingId.value) return
	if (isLocked(nodeId)) return
	controller.selectNode(nodeId)
}

type NodeClipboard = { node: VideoSceneTreeNode } | null
let nodeClipboard: NodeClipboard = null

const deepCloneJson = <T,>(v: T): T => {
	try {
		if (typeof structuredClone === 'function') return structuredClone(v)
	} catch {
		// ignore
	}
	return JSON.parse(JSON.stringify(v)) as T
}

const isTypingTarget = (el: EventTarget | null) => {
	const e = el as HTMLElement | null
	if (!e) return false
	const tag = String(e.tagName || '').toLowerCase()
	if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
	return e.isContentEditable === true
}

const onGlobalKeyDown = (ev: KeyboardEvent) => {
	if (!rootEl.value) return
	if (renamingId.value) return
	if (isTypingTarget(ev.target)) return
	const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
	const metaOrCtrl = isMac ? ev.metaKey : ev.ctrlKey
	if (!metaOrCtrl) return

	const selectedId = String(selectedNodeIds.value?.[0] ?? '')
	if (!selectedId) return
	if (selectedId === 'root') return

	const key = String(ev.key || '').toLowerCase()
	if (key === 'c') {
		const n = nodeIndex.value.get(selectedId)
		if (!n) return
		nodeClipboard = { node: deepCloneJson(n) }
		ev.preventDefault()
		return
	}
	if (key === 'v') {
		if (!nodeClipboard?.node) return
		const target = flatNodes.value.find((x) => x.id === selectedId)
		if (!target) return
		const targetParentId = target.parentId ?? 'root'
		const targetIndex = Math.max(0, (target.index ?? 0) + 1)
		store.dispatch('pasteNodeTreeAsSibling', {
			targetParentId,
			targetIndex,
			node: deepCloneJson(nodeClipboard.node)
		})
		ev.preventDefault()
		return
	}
}

onMounted(() => {
	window.addEventListener('keydown', onGlobalKeyDown, { capture: true })
	window.addEventListener('pointerdown', closeMenu, { passive: true })
})

onBeforeUnmount(() => {
	window.removeEventListener('keydown', onGlobalKeyDown, { capture: true })
	window.removeEventListener('pointerdown', closeMenu)
})

const startRename = async (nodeId: string, currentName: string) => {
	renamingId.value = nodeId
	renamePrev.value = String(currentName ?? '')
	renameDraft.value = String(currentName ?? '')
	await nextTick()
	renameInputRef.value?.focus()
	renameInputRef.value?.select()
}

const cancelRename = () => {
	renamingId.value = ''
	renameDraft.value = ''
	renamePrev.value = ''
}

const commitRename = () => {
	const nodeId = renamingId.value
	if (!nodeId) return
	const name = String(renameDraft.value ?? '').trim()
	const finalName = name || renamePrev.value || 'Node'
	store.dispatch('updateNodeName', { nodeId, name: finalName })
	cancelRename()
}

const onDragStart = (nodeId: string, ev: DragEvent) => {
	if (renamingId.value) return
	if (isLocked(nodeId)) return
	draggingNodeId.value = nodeId
	dragOverNodeId.value = ''
	dropMode.value = 'child'
	dropInsertTarget.value = null
	dropLineTop.value = 0
	try {
		ev.dataTransfer?.setData('application/x-dweb-node-id', nodeId)
		ev.dataTransfer?.setData('text/plain', nodeId)
		if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move'
	} catch {
		// ignore
	}
}

const onDragEnd = () => {
	draggingNodeId.value = ''
	dragOverNodeId.value = ''
	dropMode.value = 'child'
	dropInsertTarget.value = null
	dropLineTop.value = 0
}

const onDragEnter = (node: FlatNode) => {
	if (!draggingNodeId.value) return
	if (node.id === draggingNodeId.value) return
	dragOverNodeId.value = node.id
}

const onDragLeave = (node: FlatNode, ev: DragEvent) => {
	if (dragOverNodeId.value !== node.id) return
	const related = ev.relatedTarget as HTMLElement | null
	if (related && (ev.currentTarget as HTMLElement).contains(related)) return
	dragOverNodeId.value = ''
}

const onDragOver = (node: FlatNode, ev: DragEvent) => {
	if (renamingId.value) return
	if (!draggingNodeId.value) return
	if (node.id === draggingNodeId.value) return

	const el = ev.currentTarget as HTMLElement
	const rect = el.getBoundingClientRect()
	const y = ev.clientY
	const edge = 7

	const insertAbove = y <= rect.top + edge
	const insertBelow = y >= rect.bottom - edge
	if (insertAbove || insertBelow) {
		dropMode.value = 'insert'
		dragOverNodeId.value = ''
		const bodyRect = bodyEl.value?.getBoundingClientRect()
		const scrollTop = bodyEl.value?.scrollTop ?? 0
		if (bodyRect) {
			const lineY = (insertAbove ? rect.top : rect.bottom) - bodyRect.top + scrollTop
			dropLineTop.value = Math.max(0, Math.round(lineY))
		}
		const index = node.index + (insertBelow ? 1 : 0)
		dropInsertTarget.value = { parentId: node.parentId, index }
		return
	}

	dropMode.value = 'child'
	dropInsertTarget.value = null
	dragOverNodeId.value = node.id
}

const getDraggedNodeId = (ev: DragEvent) => {
	return (
		ev.dataTransfer?.getData('application/x-dweb-node-id') ||
		ev.dataTransfer?.getData('text/plain') ||
		''
	)
}

const onDropOnNode = (node: FlatNode, ev: DragEvent) => {
	const nodeId = getDraggedNodeId(ev)
	if (!nodeId) return
	if (dropMode.value === 'insert' && dropInsertTarget.value) {
		controller.moveAsSibling(nodeId, dropInsertTarget.value.parentId, dropInsertTarget.value.index)
		onDragEnd()
		return
	}
	if (nodeId === node.id) return
	controller.moveAsChild(nodeId, node.id)
	onDragEnd()
}

const onDropRoot = (ev: DragEvent) => {
	const nodeId = getDraggedNodeId(ev)
	if (!nodeId) return
	controller.moveToRoot(nodeId)
	onDragEnd()
}

const menu = ref({ visible: false, x: 0, y: 0, nodeId: '' })

const closeMenu = () => {
	menu.value = { visible: false, x: 0, y: 0, nodeId: '' }
}

const onContextMenu = (node: FlatNode, ev: MouseEvent) => {
	if (!isComponentRoot(node.id)) {
		closeMenu()
		return
	}
	menu.value = { visible: true, x: ev.clientX, y: ev.clientY, nodeId: node.id }
}

const onSyncComponent = async () => {
	const nodeId = String(menu.value.nodeId || '').trim()
	closeMenu()
	if (!nodeId) return
	const meta = getComponentMeta(nodeId)
	if (!meta) return
	const layerId = controller.getActiveLayer()?.id
	if (!layerId) return
	const currentNode = nodeIndex.value.get(nodeId)
	if (!currentNode) return
	const currentTransform = currentNode.transform ? { ...currentNode.transform } : undefined
	const currentName = String(currentNode.name ?? '').trim()
	let latest: SavedComponentItem | null
	try {
		const res = await componentService.listComponents({ q: meta.templateId, limit: 50, offset: 0 })
		const items: unknown[] = Array.isArray((res as { items?: unknown[] }).items)
			? (res as { items: unknown[] }).items
			: []
		latest =
			items.find((x): x is SavedComponentItem => {
				if (!isObject(x)) return false
				const tid = (x as Record<string, unknown>).templateId
				return isString(tid) && String(tid).trim() === meta.templateId
			}) ?? null
	} catch {
		window.alert('同步失败：无法读取组件库数据')
		return
	}
	if (!latest?.template) {
		window.alert('同步失败：未找到该组件的最新数据')
		return
	}
	updateLocalComponentCache(latest, latest.template)
	let instantiated: { root?: VideoSceneTreeNode } | undefined
	try {
		instantiated = componentTemplateApi.instantiateTemplate(latest.template, meta.params ?? {}, {
			getNodeId: ({ templateId, localId }) => {
				const base = String(templateId).trim() ? `${templateId}:${localId}` : localId
				return base.replace(/[^a-zA-Z0-9:_-]/g, '_')
			}
		}) as { root?: VideoSceneTreeNode } | undefined
	} catch {
		window.alert('同步失败：组件模板无效')
		return
	}
	const newRoot = instantiated?.root
	if (!newRoot) return
	if (currentTransform) newRoot.transform = { ...currentTransform }
	if (currentName) newRoot.name = currentName
	const newProps: Record<string, unknown> = {
		...((newRoot.props as Record<string, unknown> | undefined) ?? {}),
		__dvsComponentRoot: true,
		__dvsComponentLibraryId: latest.id || meta.componentId,
		__dvsComponentTemplateId: meta.templateId,
		__dvsComponentName: isString(latest.name) ? latest.name : currentName,
		__dvsComponentParams: meta.params ?? {}
	}
	newRoot.props = newProps as VideoSceneTreeNode['props']

	const target = visibleFlatNodes.value.find((x) => x.id === nodeId)
	const parentId = target?.parentId ?? 'root'
	const index = Math.max(0, target?.index ?? 0)

	await store.dispatch('deleteNodesById', { nodeIds: [nodeId], layerId })
	await store.dispatch('addNodeTree', { node: newRoot, layerId, parentId })
	await store.dispatch('moveNode', {
		nodeId: newRoot.id,
		layerId,
		targetParentId: parentId,
		targetIndex: index
	})
	await store.dispatch('setSelectedNode', { nodeId: newRoot.id })
	dwebCanvasRef?.value?.requestRender?.()
}

const onPushComponent = async () => {
	const nodeId = String(menu.value.nodeId || '').trim()
	closeMenu()
	if (!nodeId) return
	const meta = getComponentMeta(nodeId)
	if (!meta) return
	const layer = controller.getActiveLayer() as VideoSceneLayer | undefined
	if (!layer) return
	const currentNode = nodeIndex.value.get(nodeId)
	const name =
		String(
			currentNode?.name ?? (meta.props.__dvsComponentName as string | undefined) ?? meta.templateId
		).trim() || meta.templateId
	let template: unknown
	try {
		template = componentTemplateApi.exportTemplateFromSelection({
			layerNodeTree: layer.nodeTree ?? [],
			selectedNodeIds: [nodeId],
			templateId: meta.templateId,
			name
		})
	} catch {
		window.alert('更新失败：无法导出组件模板')
		return
	}
	let res: { item?: SavedComponentItem } | undefined
	const thumbAssetIdVal = meta.props.__dvsComponentThumbAssetId
	const thumbAssetId = isString(thumbAssetIdVal) ? thumbAssetIdVal : undefined
	try {
		res = (await componentService.upsertComponent({
			templateId: meta.templateId,
			name,
			template,
			thumbAssetId
		})) as { item?: SavedComponentItem } | undefined
	} catch {
		window.alert('更新失败：写入组件库失败')
		return
	}
	if (res?.item) updateLocalComponentCache(res.item, template)
	const nextId = res?.item?.id || meta.componentId
	await store.dispatch('updateNodeProps', {
		layerId: layer.id,
		nodeId,
		patch: {
			__dvsComponentRoot: true,
			__dvsComponentLibraryId: nextId,
			__dvsComponentTemplateId: meta.templateId,
			__dvsComponentName: name
		}
	})
	dwebCanvasRef?.value?.requestRender?.()
}

const updateLocalComponentCache = (item: SavedComponentItem, templateOverride?: unknown) => {
	try {
		const raw = localStorage.getItem(COMPONENT_LIBRARY_KEY)
		const parsed: unknown = raw ? JSON.parse(raw) : []
		const list: unknown[] = Array.isArray(parsed) ? parsed : []
		const templateIdVal = item.templateId
		const templateId = isString(templateIdVal) ? String(templateIdVal).trim() : ''
		if (!templateId) return
		const nextItem: SavedComponentItem = {
			id: isString(item.id) ? item.id : `${templateId}::${Date.now()}`,
			createdAt: isString(item.createdAt) ? item.createdAt : new Date().toISOString(),
			savedAt: isString(item.savedAt) ? item.savedAt : new Date().toISOString(),
			templateId,
			name: isString(item.name) ? item.name : templateId,
			template: templateOverride ?? item.template,
			thumbAssetId: isString(item.thumbAssetId) ? item.thumbAssetId : undefined,
			thumbUrl: isString(item.thumbUrl) ? item.thumbUrl : undefined
		}
		const next = list.filter((x): x is SavedComponentItem => {
			if (!isObject(x)) return false
			const tid = (x as Record<string, unknown>).templateId
			return isString(tid) && String(tid).trim() !== templateId
		})
		next.unshift(nextItem)
		localStorage.setItem(COMPONENT_LIBRARY_KEY, JSON.stringify(next))
		window.dispatchEvent(
			new CustomEvent('dvs:componentLibrary/refresh', { detail: { templateId } })
		)
	} catch {
		// ignore
	}
}
</script>

<style scoped>
.vs-nodes {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.vs-nodes-header {
	height: 36px;
	display: flex;
	align-items: center;
	padding: 0 10px;
	border-bottom: 1px solid var(--vscode-border);
	color: var(--vscode-fg);
	font-size: 12px;
	background: var(--dweb-defualt-dark);
}

.vs-nodes-body {
	flex: 1;
	min-height: 0;
	overflow: auto;
	padding: 0;
	position: relative;
}

.vs-drop-line {
	position: absolute;
	left: 0;
	right: 0;
	height: 2px;
	background: var(--vscode-border-accent);
	pointer-events: none;
	transform: translateY(-1px);
}

.vs-tree-item {
	height: 26px;
	display: flex;
	align-items: center;
	gap: 8px;
	border: 1px solid transparent;
	border-bottom-color: var(--vscode-border);
	background: transparent;
	color: var(--vscode-fg);
	font-size: 12px;
	user-select: none;
	-webkit-user-select: none;
	cursor: default;
	box-sizing: border-box;
	position: relative;
}

.vs-tree-toggle {
	width: 16px;
	height: 16px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border: none;
	background: transparent;
	color: var(--vscode-fg-muted);
	padding: 0;
	margin-left: -2px;
	cursor: pointer;
}

.vs-tree-toggle-spacer {
	width: 16px;
	height: 16px;
	display: inline-block;
}

.vs-tree-toggle-icon {
	transition: transform 0.08s linear;
	transform: rotate(90deg);
}

.vs-tree-toggle-icon.collapsed {
	transform: rotate(0deg);
}

.vs-tree-name {
	flex: 1;
	min-width: 0;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.vs-tree-actions {
	margin-left: auto;
	display: inline-flex;
	align-items: center;
	gap: 8px;
	padding-right: 8px;
}

.vs-tree-action {
	margin-left: 0;
	margin-right: 0;
	padding: 2px 6px;
	border-radius: 6px;
	border: 1px solid var(--vscode-border);
	background: transparent;
	color: var(--vscode-fg-muted);
	font-size: 11px;
	line-height: 16px;
	opacity: 0;
	cursor: pointer;
}

.vs-tree-lock {
	width: 26px;
	height: 20px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border: none;
	background: transparent;
	color: var(--vscode-fg-muted);
	opacity: 1;
	cursor: pointer;
}

.vs-tree-delete {
	width: 22px;
	height: 20px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border: none;
	background: transparent;
	color: var(--vscode-fg-muted);
	opacity: 1;
	cursor: pointer;
	font-size: 14px;
	line-height: 1;
}

.vs-tree-item.locked .vs-tree-lock {
	color: var(--vscode-success);
}

.vs-tree-item:hover .vs-tree-action {
	opacity: 1;
}

.vs-tree-item.locked .vs-tree-name {
	opacity: 0.8;
}

.vs-rename {
	flex: 1;
	min-width: 0;
	margin-left: 0;
	margin-right: 8px;
	padding: 4px 6px;
	border-radius: 6px;
	border: 1px solid var(--vscode-border-accent);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	outline: none;
}

.vs-tree-item::before {
	content: '';
	position: absolute;
	left: calc(var(--tree-indent, 10px) - 10px);
	top: 0;
	bottom: 0;
	width: 1px;
	background: var(--vscode-border);
	opacity: 0.9;
}

.vs-tree-item::after {
	content: '';
	position: absolute;
	left: calc(var(--tree-indent, 10px) - 10px);
	bottom: 0;
	width: 10px;
	height: 1px;
	background: var(--vscode-border);
	opacity: 0.9;
}

.vs-tree-item:hover,
.vs-tree-item.selected,
.vs-tree-item.drag-over {
	border-color: var(--vscode-border-accent);
	background: var(--vscode-hover-bg);
}

.vs-tree-item.selected {
	background: var(--vscode-selected-bg);
}

.vs-tree-name {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.vs-tree-badge {
	margin-left: 6px;
	padding: 1px 4px;
	border-radius: 4px;
	font-size: 10px;
	line-height: 12px;
	border: 1px solid var(--vscode-border);
	color: var(--vscode-fg-muted);
}

.vs-tree-menu {
	position: fixed;
	z-index: 9999;
	min-width: 140px;
	background: var(--dweb-defualt);
	border: 1px solid var(--vscode-border);
	box-shadow: var(--dweb-shadow);
	padding: 6px;
}

.vs-tree-menu-item {
	width: 100%;
	text-align: left;
	background: transparent;
	border: none;
	padding: 6px 8px;
	color: var(--vscode-fg);
	cursor: pointer;
	font-size: 12px;
}

.vs-tree-menu-item:hover {
	background: var(--vscode-hover-bg);
}
</style>
