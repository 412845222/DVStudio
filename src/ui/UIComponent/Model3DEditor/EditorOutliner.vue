<template>
	<div class="editor-outliner">
		<div class="outliner-header">
			<span class="outliner-title">场景大纲</span>
		</div>
		<div class="outliner-content">
			<div v-if="nodes.length === 0" class="outliner-empty">暂无模型</div>
			<template v-for="node in nodes" :key="node.id">
				<div
					class="outliner-node model-node"
					:class="{ selected: selectedId === node.id }"
					@click="$emit('selectNode', node.id)"
					@dblclick="$emit('frameNode', node.id)"
				>
					<button class="expand-btn" @click.stop="toggleExpand(node.id)">
						<svg
							viewBox="0 0 24 24"
							width="12"
							height="12"
							fill="currentColor"
							:class="{ expanded: expandedNodes.has(node.id) }"
						>
							<polygon points="8,5 16,12 8,19" />
						</svg>
					</button>
					<svg
						class="node-icon model-icon"
						viewBox="0 0 24 24"
						width="14"
						height="14"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
						/>
						<polyline points="3.27 6.96 12 12.01 20.73 6.96" />
						<line x1="12" y1="22.08" x2="12" y2="12" />
					</svg>
					<span class="node-name">{{ node.name }}</span>
					<input
						v-if="node.type !== 'model'"
						type="checkbox"
						class="visibility-toggle"
						:checked="node.visible"
						@click.stop
						@change="
							$emit('toggleVisibility', node.id, ($event.target as HTMLInputElement).checked)
						"
					/>
				</div>
				<div
					v-if="expandedNodes.has(node.id) && node.children.length > 0"
					class="outliner-children"
				>
					<div
						v-for="child in node.children"
						:key="child.id"
						class="outliner-node child-node"
						:class="{ selected: selectedId === child.id }"
						@click="$emit('selectNode', child.id)"
					>
						<svg
							class="node-icon mesh-icon"
							viewBox="0 0 24 24"
							width="12"
							height="12"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<polygon
								v-if="child.type === 'mesh'"
								points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5"
							/>
							<circle v-else-if="child.type === 'light'" cx="12" cy="12" r="5" />
						</svg>
						<span class="node-name">{{ child.name }}</span>
						<input
							type="checkbox"
							class="visibility-toggle"
							:checked="child.visible"
							@click.stop
							@change="
								$emit('toggleVisibility', child.id, ($event.target as HTMLInputElement).checked)
							"
						/>
					</div>
				</div>
			</template>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { OutlinerNode } from '../../WorkFlow/WorlFlowNodes/model3d/editor/types'

defineProps<{
	nodes: OutlinerNode[]
	selectedId: string | null
}>()

defineEmits<{
	selectNode: [id: string]
	frameNode: [id: string]
	toggleVisibility: [id: string, visible: boolean]
}>()

const expandedNodes = ref<Set<string>>(new Set())

function toggleExpand(id: string) {
	if (expandedNodes.value.has(id)) {
		expandedNodes.value.delete(id)
	} else {
		expandedNodes.value.add(id)
	}
	expandedNodes.value = new Set(expandedNodes.value)
}
</script>

<style scoped>
.editor-outliner {
	display: flex;
	flex-direction: column;
	height: 100%;
	background: rgba(10, 15, 24, 0.92);
	backdrop-filter: blur(12px);
	border-right: 1px solid var(--theme-border, #1e3a5f);
}

.outliner-header {
	padding: 10px 12px;
	border-bottom: 1px solid var(--theme-border, #1e3a5f);
}

.outliner-title {
	font-size: 11px;
	color: var(--theme-text-secondary, #6b8299);
	text-transform: uppercase;
	letter-spacing: 1px;
	font-weight: 600;
}

.outliner-content {
	flex: 1;
	overflow-y: auto;
	padding: 4px 0;
}

.outliner-empty {
	padding: 20px 12px;
	text-align: center;
	color: var(--theme-text-muted, #4a5f75);
	font-size: 12px;
}

.outliner-node {
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 6px 8px;
	cursor: pointer;
	transition: background 0.12s ease;
	font-size: 12px;
	color: var(--theme-text-primary, #c5d4e3);
}

.outliner-node:hover {
	background: rgba(91, 182, 255, 0.08);
}

.outliner-node.selected {
	background: rgba(56, 185, 140, 0.15);
	color: var(--theme-success, #38b98c);
}

.model-node {
	padding-left: 8px;
	font-weight: 500;
}

.child-node {
	padding-left: 28px;
	font-size: 11px;
	color: var(--theme-text-secondary, #8fa3b8);
}

.expand-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 16px;
	height: 16px;
	padding: 0;
	background: transparent;
	border: none;
	color: inherit;
	cursor: pointer;
	transition: transform 0.15s ease;
}

.expand-btn svg {
	transition: transform 0.15s ease;
}

.expand-btn svg.expanded {
	transform: rotate(90deg);
}

.node-icon {
	flex-shrink: 0;
	opacity: 0.7;
}

.model-icon {
	color: var(--theme-accent, #5bb6ff);
}

.mesh-icon {
	color: var(--theme-text-secondary, #6b8299);
}

.node-name {
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.visibility-toggle {
	accent-color: var(--theme-success, #38b98c);
	width: 13px;
	height: 13px;
	flex-shrink: 0;
	opacity: 0.6;
}

.visibility-toggle:hover {
	opacity: 1;
}

.outliner-children {
	background: rgba(0, 0, 0, 0.15);
}
</style>
