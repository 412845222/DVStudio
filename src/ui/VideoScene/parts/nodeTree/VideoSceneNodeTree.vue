<template>
	<div ref="rootEl" class="vs-nodes" @pointerdown.stop>
		<div class="vs-nodes-header">{{ activeLayerName }}</div>
		<div ref="bodyEl" class="vs-nodes-body" @dragover.stop.prevent @drop.stop.prevent="onDropRoot">
			<div v-if="dropLineVisible" class="vs-drop-line" :style="{ top: `${dropLineTop}px` }" />
			<div
				v-for="n in flatNodes"
				:key="n.id"
				class="vs-tree-item"
				:class="{
					selected: selectedNodeIds.includes(n.id),
					locked: isLocked(n.id),
					'drag-over':
						draggingNodeId && dropMode === 'child' && dragOverNodeId === n.id && draggingNodeId !== n.id,
				}"
				:style="{ paddingLeft: `${10 + n.depth * 14}px`, '--tree-indent': `${10 + n.depth * 14}px` }"
				draggable="true"
				@dragstart.stop="onDragStart(n.id, $event)"
				@dragend="onDragEnd"
				@dragenter.stop.prevent="onDragEnter(n)"
				@dragover.stop.prevent="onDragOver(n, $event)"
				@dragleave.stop="onDragLeave(n, $event)"
				@drop.stop.prevent="onDropOnNode(n, $event)"
				@click="onSelect(n.id)"
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
					<span class="vs-tree-name">{{ n.name }}</span>
					<div class="vs-tree-actions">
						<button
							class="vs-tree-lock"
							type="button"
							:title="isLocked(n.id) ? '解锁：允许舞台点击选中' : '锁定：舞台点击将忽略该节点'"
							@pointerdown.stop
							@click.stop.prevent="toggleLock(n.id)"
						>
							<svg v-if="isLocked(n.id)" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
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
						<button class="vs-tree-action" type="button" @click.stop.prevent="startRename(n.id, n.name)">重命名</button>
					</div>
				</template>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useStore } from 'vuex'
import { VideoSceneKey, type VideoSceneState } from '../../../../store/videoscene'
import { VideoSceneNodeTreeController } from './VideoSceneNodeTreeController'
import type { FlatNode } from './NodeTreeController'

defineOptions({ name: 'VideoSceneNodeTree' })

const store = useStore<VideoSceneState>(VideoSceneKey)
const controller = new VideoSceneNodeTreeController(store)

const selectedNodeIds = computed(() => store.state.selectedNodeIds ?? [])
const rootEl = ref<HTMLElement | null>(null)
const bodyEl = ref<HTMLElement | null>(null)
defineExpose({ rootEl })

const activeLayerName = computed(() => controller.getActiveLayer()?.name ?? '图层')
const flatNodes = computed(() => controller.flatten(controller.getActiveElements(), 'root'))

const nodeIndex = computed(() => {
	const out = new Map<string, any>()
	const walk = (list: any[]) => {
		for (const n of list) {
			out.set(String(n.id), n)
			if (n.children?.length) walk(n.children)
		}
	}
	walk(controller.getActiveElements() as any)
	return out
})

const isLocked = (nodeId: string) => {
	const n = nodeIndex.value.get(String(nodeId))
	if (!n || n.category !== 'user') return false
	return !!(n.props && (n.props as any).locked)
}

const toggleLock = (nodeId: string) => {
	const n = nodeIndex.value.get(String(nodeId))
	if (!n || n.category !== 'user') return
	store.dispatch('updateNodeProps', { nodeId, patch: { locked: !isLocked(nodeId) } })
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
	controller.selectNode(nodeId)
}

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
	draggingNodeId.value = nodeId
	dragOverNodeId.value = ''
	dropMode.value = 'child'
	dropInsertTarget.value = null
	dropLineTop.value = 0
	try {
		ev.dataTransfer?.setData('application/x-dweb-node-id', nodeId)
		ev.dataTransfer?.setData('text/plain', nodeId)
		ev.dataTransfer!.effectAllowed = 'move'
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

	// default: child drop
	dropMode.value = 'child'
	dropInsertTarget.value = null
	dragOverNodeId.value = node.id
}

const getDraggedNodeId = (ev: DragEvent) => {
	return ev.dataTransfer?.getData('application/x-dweb-node-id') || ev.dataTransfer?.getData('text/plain') || ''
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
</style>
