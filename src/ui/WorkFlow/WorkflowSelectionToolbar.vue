<template>
	<button
		v-if="visible"
		class="wf-save-template-btn"
		type="button"
		:style="btnStyle"
		@click="emit('save-as-template')"
	>
		<svg viewBox="0 0 16 16" aria-hidden="true" class="wf-btn-icon">
			<path
				d="M2 3a1 1 0 0 1 1-1h7l4 4v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"
				fill="none"
				stroke="currentColor"
				stroke-width="1.2"
			/>
			<path d="M9 2v4h4" fill="none" stroke="currentColor" stroke-width="1.2" />
		</svg>
		{{ t('aiworkflow.toolbar.saveAsTemplate') }}
	</button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '../../i18n'

const { t } = useI18n()

const props = withDefaults(
	defineProps<{
		visible: boolean
		anchorX?: number
		anchorY?: number
	}>(),
	{
		anchorX: -1,
		anchorY: -1
	}
)

const emit = defineEmits<{
	(e: 'save-as-template'): void
}>()

const btnStyle = computed(() => {
	if (props.anchorX >= 0 && props.anchorY >= 0) {
		return {
			position: 'absolute' as const,
			left: `${props.anchorX}px`,
			top: `${props.anchorY}px`
		}
	}
	return {
		position: 'absolute' as const,
		top: '16px',
		left: '50%',
		transform: 'translateX(-50%)'
	}
})
</script>

<style scoped>
.wf-save-template-btn {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 5px 12px;
	font-size: 12px;
	font-family: inherit;
	color: #fff;
	background: var(--wf-primary, #1f9d84);
	border: none;
	border-radius: 2px;
	cursor: pointer;
	white-space: nowrap;
	z-index: 200;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	transition: background 120ms ease;
	pointer-events: auto;
}

.wf-save-template-btn:hover {
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 80%, #fff);
}

.wf-save-template-btn:active {
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, #000);
}

.wf-btn-icon {
	width: 14px;
	height: 14px;
	flex-shrink: 0;
}
</style>
