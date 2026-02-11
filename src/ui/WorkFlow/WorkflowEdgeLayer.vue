<template>
	<svg class="wf-edge-layer" aria-hidden="true">
		<defs>
			<linearGradient
				v-for="edge in edges"
				:key="edge.id"
				:id="`edge-gradient-${edge.id}`"
				gradientUnits="userSpaceOnUse"
				:x1="edge.start.x"
				:y1="edge.start.y"
				:x2="edge.end.x"
				:y2="edge.end.y"
			>
				<stop offset="0" stop-color="var(--dweb-green-main)" />
				<stop offset="1" stop-color="var(--dweb-blue)" />
			</linearGradient>
		</defs>

		<g v-for="edge in edges" :key="edge.id" class="wf-edge-group">
			<path
				class="wf-edge-hit"
				:d="edge.path"
				@pointerdown.stop="emit('select-edge', edge.id)"
			/>
			<path
				class="wf-edge-path"
				:class="{ selected: edge.id === selectedEdgeId }"
				:d="edge.path"
				:stroke="edge.stroke || `url(#edge-gradient-${edge.id})`"
				:style="edge.strokeWidth ? { strokeWidth: edge.strokeWidth } : undefined"
			/>
		</g>

		<path
			v-if="draft"
			class="wf-edge-path draft"
			:d="draft.path"
			:stroke="draft.stroke || 'var(--dweb-green-main)'"
			:style="draft.strokeWidth ? { strokeWidth: draft.strokeWidth } : undefined"
		/>
	</svg>
</template>

<script setup lang="ts">
export type EdgePoint = { x: number; y: number }
export type EdgeRender = {
	id: string
	start: EdgePoint
	end: EdgePoint
	path: string
	stroke?: string
	strokeWidth?: number
}

const props = defineProps<{
	edges: EdgeRender[]
	selectedEdgeId: string | null
	draft?: { path: string; stroke?: string; strokeWidth?: number } | null
}>()

const emit = defineEmits<{
	(e: 'select-edge', id: string): void
}>()
</script>

<style scoped>
.wf-edge-layer {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
}


.wf-edge-hit {
	fill: none;
	stroke: transparent;
	stroke-width: 12;
	cursor: pointer;
	pointer-events: stroke;
}

.wf-edge-path {
	fill: none;
	stroke-width: 2;
	opacity: 0.9;
	pointer-events: none;
}

.wf-edge-path.selected {
	filter: drop-shadow(0 0 6px var(--vscode-border-accent));
	opacity: 1;
}

.wf-edge-path.draft {
	stroke-dasharray: 6 6;
	opacity: 0.8;
}
</style>
