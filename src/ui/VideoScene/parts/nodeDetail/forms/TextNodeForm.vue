<template>
	<div class="vs-group">
		<div class="vs-group-title">文本</div>
		<label class="vs-row">
			<span class="vs-k">内容</span>
			<textarea v-model="draft.textContent" class="vs-input vs-textarea wide" rows="4" @change="applyText" />
		</label>
		<label class="vs-row">
			<span class="vs-k">字号</span>
			<input
				v-model.number="draft.fontSize"
				class="vs-input vs-scrub"
				type="number"
				min="1"
				step="1"
				@change="applyText"
				@dblclick.stop="onNumberInputDblClick"
				@focus="onNumberInputFocus"
				@blur="onNumberInputBlur"
				@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.fontSize, (v) => (draft.fontSize = v), { step: 1, min: 1, max: 999999, onCommit: applyText })"
			/>
		</label>
		<label class="vs-row">
			<span class="vs-k">颜色</span>
			<input v-model="draft.fontColor" class="vs-input" type="text" placeholder="#ffffff" @change="applyText" />
			<input v-model="draft.fontColor" class="vs-color" type="color" @input="applyText" />
		</label>
		<label class="vs-row">
			<span class="vs-k">样式</span>
			<input v-model="draft.fontStyle" class="vs-input" type="text" placeholder="normal" @change="applyText" />
		</label>
		<label class="vs-row">
			<span class="vs-k">对齐</span>
			<div class="vs-quick">
				<button
					class="vs-quick-btn"
					type="button"
					:class="{ active: draft.textAlign === 'left' }"
					title="左对齐"
					@click.stop.prevent="draft.textAlign = 'left'; applyText()"
				>
					L
				</button>
				<button
					class="vs-quick-btn"
					type="button"
					:class="{ active: draft.textAlign === 'center' }"
					title="居中"
					@click.stop.prevent="draft.textAlign = 'center'; applyText()"
				>
					C
				</button>
				<button
					class="vs-quick-btn"
					type="button"
					:class="{ active: draft.textAlign === 'right' }"
					title="右对齐"
					@click.stop.prevent="draft.textAlign = 'right'; applyText()"
				>
					R
				</button>
			</div>
		</label>
	</div>
</template>

<script setup lang="ts">
import type { NumberScrubOptions } from './useNumberScrub'

type DraftText = {
	textContent: string
	fontSize: number
	fontColor: string
	fontStyle: string
	textAlign: 'left' | 'center' | 'right'
}

defineProps<{
	draft: DraftText
	applyText: () => void
	onNumberScrubPointerDown: (e: PointerEvent, get: () => number, set: (v: number) => void, opt: NumberScrubOptions) => void
	onNumberInputDblClick: (e: MouseEvent) => void
	onNumberInputFocus: (e: FocusEvent) => void
	onNumberInputBlur: (e: FocusEvent) => void
}>()
</script>
