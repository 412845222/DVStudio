<template>
	<details v-if="candidates.length" open class="comfy-candidates" @pointerdown.stop>
		<summary>{{ t('nodes.comfyui.chooseHistoryCandidate') }} ({{ candidates.length }})</summary>
		<p>{{ t('nodes.comfyui.candidateNotice') }}</p>
		<select
			v-model="selected"
			:disabled="disabled"
			:aria-label="t('nodes.comfyui.chooseHistoryCandidate')"
		>
			<option value="">{{ t('nodes.comfyui.selectWorkflow') }}</option>
			<option v-for="candidate in visibleCandidates" :key="candidate.path" :value="candidate.path">
				{{ candidate.name }}
			</option>
		</select>
		<button v-if="limit < candidates.length" type="button" @click="limit += 50">
			{{ t('nodes.comfyui.moreCandidates') }}
		</button>
		<button type="button" :disabled="disabled || !selected" @click="choose">
			{{ t('nodes.comfyui.useHistorySnapshot') }}
		</button>
	</details>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '../../../../i18n'
import type { ComfyHistoryCandidate } from '../../../../aiworkflow/types'
const props = defineProps<{ candidates: ComfyHistoryCandidate[]; disabled?: boolean }>()
const emit = defineEmits<{ select: [path: string] }>()
const { t } = useI18n()
const selected = ref('')
const limit = ref(50)
const visibleCandidates = computed(() => props.candidates.slice(0, limit.value))
watch(
	() => props.candidates,
	() => {
		selected.value = ''
		limit.value = 50
	}
)
function choose() {
	if (!props.disabled && props.candidates.some((c) => c.path === selected.value))
		emit('select', selected.value)
}
</script>

<style scoped>
.comfy-candidates {
	padding: 8px;
	font-size: 12px;
	border: 1px solid currentColor;
	border-radius: 5px;
}
select {
	width: 100%;
	color: inherit;
	background: var(--panel-bg, #292929);
}
p {
	line-height: 1.5;
}
button {
	margin-top: 8px;
	cursor: pointer;
}
</style>
