<template>
	<div class="vs-group">
		<div class="vs-group-title">矩形</div>
		<label class="vs-row">
			<span class="vs-k">填充</span>
			<input v-model="draft.fillColor" class="vs-input" type="text" placeholder="#3aa1ff" @change="applyRect" />
			<input v-model="draft.fillColor" class="vs-color" type="color" @input="applyRect" />
			<input
				v-model.number="draft.fillOpacity"
				class="vs-input vs-scrub"
				type="number"
				min="0"
				max="1"
				step="0.01"
				@change="applyRect"
				@dblclick.stop="onNumberInputDblClick"
				@focus="onNumberInputFocus"
				@blur="onNumberInputBlur"
				@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.fillOpacity, (v) => (draft.fillOpacity = v), { step: 0.01, min: 0, max: 1, onCommit: applyRect })"
			/>
		</label>
		<label class="vs-row">
			<span class="vs-k">边框色</span>
			<input v-model="draft.borderColor" class="vs-input" type="text" placeholder="#9cdcfe" @change="applyRect" />
			<input v-model="draft.borderColor" class="vs-color" type="color" @input="applyRect" />
			<input
				v-model.number="draft.borderOpacity"
				class="vs-input vs-scrub"
				type="number"
				min="0"
				max="1"
				step="0.01"
				@change="applyRect"
				@dblclick.stop="onNumberInputDblClick"
				@focus="onNumberInputFocus"
				@blur="onNumberInputBlur"
				@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.borderOpacity, (v) => (draft.borderOpacity = v), { step: 0.01, min: 0, max: 1, onCommit: applyRect })"
			/>
		</label>
		<label class="vs-row">
			<span class="vs-k">边框宽</span>
			<input
				v-model.number="draft.borderWidth"
				class="vs-input vs-scrub"
				type="number"
				min="0"
				step="1"
				@change="applyRect"
				@dblclick.stop="onNumberInputDblClick"
				@focus="onNumberInputFocus"
				@blur="onNumberInputBlur"
				@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.borderWidth, (v) => (draft.borderWidth = v), { step: 1, min: 0, max: 999999, onCommit: applyRect })"
			/>
		</label>
		<label class="vs-row">
			<span class="vs-k">圆角</span>
			<input
				v-model.number="draft.cornerRadius"
				class="vs-input vs-scrub"
				type="number"
				min="0"
				step="1"
				@change="applyRect"
				@dblclick.stop="onNumberInputDblClick"
				@focus="onNumberInputFocus"
				@blur="onNumberInputBlur"
				@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.cornerRadius, (v) => (draft.cornerRadius = v), { step: 1, min: 0, max: 999999, onCommit: applyRect })"
			/>
		</label>
	</div>
</template>

<script setup lang="ts">
import type { NumberScrubOptions } from './useNumberScrub'

type DraftRect = {
	fillColor: string
	fillOpacity: number
	borderColor: string
	borderOpacity: number
	borderWidth: number
	cornerRadius: number
}

defineProps<{
	draft: DraftRect
	applyRect: () => void
	onNumberScrubPointerDown: (e: PointerEvent, get: () => number, set: (v: number) => void, opt: NumberScrubOptions) => void
	onNumberInputDblClick: (e: MouseEvent) => void
	onNumberInputFocus: (e: FocusEvent) => void
	onNumberInputBlur: (e: FocusEvent) => void
}>()
</script>
