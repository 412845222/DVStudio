<template>
	<div class="m3de-panel m3de-outliner">
		<div class="sq-container">
			<span v-for="p in particles" :key="p.id" class="sq-particle" :style="p.style" />
		</div>
		<div class="m3de-corner m3de-corner-tl" />
		<div class="m3de-corner m3de-corner-br" />

		<div class="m3de-panel-header">
			<span class="m3de-panel-header-title">
				<span class="m3de-panel-header-dot" />
				{{ outlinerLabel }}
			</span>
			<span class="m3de-panel-header-count">{{ nodes.length }}</span>
		</div>

		<div class="m3de-outliner-tree">
			<template v-for="node in nodes" :key="node.id">
				<OutlinerNode
					:node="node"
					:selected-ids="selectedIds"
					:expanded-ids="expandedIds"
					:depth="0"
					@select="$emit('select', $event)"
					@toggle-visibility="$emit('toggleVisibility', $event)"
					@toggle-lock="$emit('toggleLock', $event)"
					@toggle-expand="$emit('toggleExpand', $event)"
				/>
			</template>
		</div>
	</div>
</template>

<script setup lang="ts">
import { h } from 'vue'
import { useI18n } from '../../../i18n'
import { useSquareParticles } from '../../../composables/useSquareParticles'
import type { OutlinerNode as OutlinerNodeType } from '../../WorkFlow/WorlFlowNodes/model3d/editor/types'
import OutlinerNode from './OutlinerNode.vue'

const { t } = useI18n()

const { particles } = useSquareParticles({
	count: 3,
	baseOpacity: 0.25,
	minSize: 2,
	maxSize: 3,
	seed: 7331
})

interface Props {
	nodes: OutlinerNodeType[]
	selectedIds: Set<string>
	expandedIds: Set<string>
}

defineProps<Props>()

defineEmits<{
	select: [id: string]
	toggleVisibility: [id: string]
	toggleLock: [id: string]
	toggleExpand: [id: string]
}>()

const outlinerLabel = t('nodes.model3d.outliner')
</script>

<style scoped>
.m3de-panel {
	position: relative;
	display: flex;
	flex-direction: column;
	background: var(
		--wf-surface-glass,
		linear-gradient(
			180deg,
			color-mix(in srgb, var(--wf-primary) 3%, rgba(21, 24, 28, 0.92)) 0%,
			rgba(18, 21, 25, 0.96) 100%
		)
	);
	backdrop-filter: blur(10px) saturate(130%);
	-webkit-backdrop-filter: blur(10px) saturate(130%);
	border: 1px solid
		color-mix(in srgb, var(--wf-primary) 20%, var(--wf-border-subtle, rgba(255, 255, 255, 0.04)));
	overflow: hidden;
}

.m3de-corner {
	position: absolute;
	width: 8px;
	height: 8px;
	border: 2px solid color-mix(in srgb, var(--wf-primary) 55%, transparent);
	box-shadow: 0 0 5px color-mix(in srgb, var(--wf-primary) 25%, transparent);
	pointer-events: none;
	z-index: 2;
}

.m3de-corner-tl {
	top: 3px;
	left: 3px;
	border-right: none;
	border-bottom: none;
}

.m3de-corner-br {
	bottom: 3px;
	right: 3px;
	border-left: none;
	border-top: none;
}

.m3de-panel-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 8px 10px;
	background: linear-gradient(
		90deg,
		color-mix(in srgb, var(--wf-primary) 8%, var(--wf-control-bg, rgba(0, 0, 0, 0.3))),
		color-mix(in srgb, var(--wf-primary) 2%, transparent)
	);
	border-bottom: 1px solid
		color-mix(in srgb, var(--wf-primary) 18%, var(--wf-border-subtle, rgba(255, 255, 255, 0.04)));
}

.m3de-panel-header-title {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 11px;
	font-weight: 600;
	color: var(--wf-primary);
	letter-spacing: 0.08em;
	text-transform: uppercase;
	text-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary) 35%, transparent);
}

.m3de-panel-header-dot {
	width: 6px;
	height: 6px;
	background: var(--wf-primary);
	box-shadow: 0 0 6px var(--wf-primary);
}

.m3de-panel-header-count {
	font-size: 10px;
	color: var(--wf-text-muted);
	padding: 1px 6px;
	background: var(--wf-control-bg, rgba(0, 0, 0, 0.3));
	border: 1px solid color-mix(in srgb, var(--wf-primary) 25%, var(--wf-control-border, transparent));
}

.m3de-outliner {
	flex: 1 1 0;
	min-height: 0;
}

.m3de-outliner-tree {
	flex: 1 1 0;
	overflow-y: auto;
	padding: 4px 0;
}

.m3de-outliner-tree::-webkit-scrollbar {
	width: 5px;
}

.m3de-outliner-tree::-webkit-scrollbar-track {
	background: transparent;
}

.m3de-outliner-tree::-webkit-scrollbar-thumb {
	background: color-mix(in srgb, var(--wf-primary) 25%, transparent);
	border-radius: 0;
}

.m3de-outliner-tree::-webkit-scrollbar-thumb:hover {
	background: color-mix(in srgb, var(--wf-primary) 40%, transparent);
}
</style>
