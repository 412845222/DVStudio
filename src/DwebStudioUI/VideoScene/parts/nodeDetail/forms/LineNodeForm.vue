<template>
	<div class="vs-group">
		<div class="vs-group-title">线条</div>

		<label class="vs-row">
			<span class="vs-k">起点X</span>
			<input
				v-model.number="draft.startX"
				class="vs-input vs-scrub"
				type="number"
				step="1"
				@change="applyLine"
				@dblclick.stop="onNumberInputDblClick"
				@focus="onNumberInputFocus"
				@blur="onNumberInputBlur"
				@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.startX, (v) => (draft.startX = v), { step: 1, min: -999999, max: 999999, onCommit: applyLine })"
			/>
		</label>
		<label class="vs-row">
			<span class="vs-k">起点Y</span>
			<input
				v-model.number="draft.startY"
				class="vs-input vs-scrub"
				type="number"
				step="1"
				@change="applyLine"
				@dblclick.stop="onNumberInputDblClick"
				@focus="onNumberInputFocus"
				@blur="onNumberInputBlur"
				@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.startY, (v) => (draft.startY = v), { step: 1, min: -999999, max: 999999, onCommit: applyLine })"
			/>
		</label>

		<label class="vs-row">
			<span class="vs-k">终点X</span>
			<input
				v-model.number="draft.endX"
				class="vs-input vs-scrub"
				type="number"
				step="1"
				@change="applyLine"
				@dblclick.stop="onNumberInputDblClick"
				@focus="onNumberInputFocus"
				@blur="onNumberInputBlur"
				@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.endX, (v) => (draft.endX = v), { step: 1, min: -999999, max: 999999, onCommit: applyLine })"
			/>
		</label>
		<label class="vs-row">
			<span class="vs-k">终点Y</span>
			<input
				v-model.number="draft.endY"
				class="vs-input vs-scrub"
				type="number"
				step="1"
				@change="applyLine"
				@dblclick.stop="onNumberInputDblClick"
				@focus="onNumberInputFocus"
				@blur="onNumberInputBlur"
				@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.endY, (v) => (draft.endY = v), { step: 1, min: -999999, max: 999999, onCommit: applyLine })"
			/>
		</label>

		<label class="vs-row">
			<span class="vs-k">锚点X</span>
			<input
				v-model.number="draft.anchorX"
				class="vs-input vs-scrub"
				type="number"
				step="1"
				@change="applyLine"
				@dblclick.stop="onNumberInputDblClick"
				@focus="onNumberInputFocus"
				@blur="onNumberInputBlur"
				@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.anchorX, (v) => (draft.anchorX = v), { step: 1, min: -999999, max: 999999, onCommit: applyLine })"
			/>
		</label>
		<label class="vs-row">
			<span class="vs-k">锚点Y</span>
			<input
				v-model.number="draft.anchorY"
				class="vs-input vs-scrub"
				type="number"
				step="1"
				@change="applyLine"
				@dblclick.stop="onNumberInputDblClick"
				@focus="onNumberInputFocus"
				@blur="onNumberInputBlur"
				@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.anchorY, (v) => (draft.anchorY = v), { step: 1, min: -999999, max: 999999, onCommit: applyLine })"
			/>
		</label>

		<label class="vs-row">
			<span class="vs-k">颜色</span>
			<input v-model="draft.lineColor" class="vs-input" type="text" placeholder="#ffffff" @change="applyLine" />
			<input v-model="draft.lineColor" class="vs-color" type="color" @input="applyLine" />
		</label>

		<label class="vs-row">
			<span class="vs-k">线宽</span>
			<input
				v-model.number="draft.lineWidth"
				class="vs-input vs-scrub"
				type="number"
				min="1"
				step="1"
				@change="applyLine"
				@dblclick.stop="onNumberInputDblClick"
				@focus="onNumberInputFocus"
				@blur="onNumberInputBlur"
				@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.lineWidth, (v) => (draft.lineWidth = v), { step: 1, min: 1, max: 999999, onCommit: applyLine })"
			/>
		</label>

		<label class="vs-row">
			<span class="vs-k">样式</span>
			<select v-model="draft.lineStyle" class="vs-input" @change="applyLine">
				<option value="solid">实线</option>
				<option value="dashed">虚线</option>
			</select>
		</label>
	</div>
</template>

<script setup lang="ts">
import type { NumberScrubOptions } from './useNumberScrub'

type DraftLine = {
	startX: number
	startY: number
	endX: number
	endY: number
	anchorX: number
	anchorY: number
	lineColor: string
	lineWidth: number
	lineStyle: 'solid' | 'dashed'
}

defineProps<{
	draft: DraftLine
	applyLine: () => void
	onNumberScrubPointerDown: (e: PointerEvent, get: () => number, set: (v: number) => void, opt: NumberScrubOptions) => void
	onNumberInputDblClick: (e: MouseEvent) => void
	onNumberInputFocus: (e: FocusEvent) => void
	onNumberInputBlur: (e: FocusEvent) => void
}>()
</script>
