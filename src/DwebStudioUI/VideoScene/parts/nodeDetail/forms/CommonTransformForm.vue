<template>
	<div class="vs-group">
		<div class="vs-group-title">通用</div>
		<div class="vs-grid">
			<label class="vs-row">
				<span class="vs-k">X</span>
				<input
					v-model.number="draft.x"
					class="vs-input vs-scrub"
					type="number"
					step="1"
					@change="applyTransform"
					@dblclick.stop="onNumberInputDblClick"
					@focus="onNumberInputFocus"
					@blur="onNumberInputBlur"
					@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.x, (v) => (draft.x = v), { step: 1, min: -999999, max: 999999, onCommit: applyTransform })"
				/>
			</label>
			<label class="vs-row">
				<span class="vs-k">Y</span>
				<input
					v-model.number="draft.y"
					class="vs-input vs-scrub"
					type="number"
					step="1"
					@change="applyTransform"
					@dblclick.stop="onNumberInputDblClick"
					@focus="onNumberInputFocus"
					@blur="onNumberInputBlur"
					@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.y, (v) => (draft.y = v), { step: 1, min: -999999, max: 999999, onCommit: applyTransform })"
				/>
			</label>
			<label class="vs-row">
				<span class="vs-k">宽</span>
				<input
					v-model.number="draft.width"
					class="vs-input vs-scrub"
					type="number"
					min="1"
					step="1"
					@change="applyTransform"
					@dblclick.stop="onNumberInputDblClick"
					@focus="onNumberInputFocus"
					@blur="onNumberInputBlur"
					@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.width, (v) => (draft.width = v), { step: 1, min: 1, max: 999999, onCommit: applyTransform })"
				/>
			</label>
			<label class="vs-row">
				<span class="vs-k">高</span>
				<input
					v-model.number="draft.height"
					class="vs-input vs-scrub"
					type="number"
					min="1"
					step="1"
					@change="applyTransform"
					@dblclick.stop="onNumberInputDblClick"
					@focus="onNumberInputFocus"
					@blur="onNumberInputBlur"
					@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.height, (v) => (draft.height = v), { step: 1, min: 1, max: 999999, onCommit: applyTransform })"
				/>
			</label>
			<label class="vs-row">
				<span class="vs-k">旋转</span>
				<input
					v-model.number="draft.rotation"
					class="vs-input vs-scrub"
					type="number"
					step="0.01"
					@change="applyTransform"
					@dblclick.stop="onNumberInputDblClick"
					@focus="onNumberInputFocus"
					@blur="onNumberInputBlur"
					@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.rotation, (v) => (draft.rotation = v), { step: 0.01, min: -999999, max: 999999, onCommit: applyTransform })"
				/>
			</label>
			<label class="vs-row">
				<span class="vs-k">透明</span>
				<input
					v-model.number="draft.opacity"
					class="vs-input vs-scrub"
					type="number"
					min="0"
					max="1"
					step="0.01"
					@change="applyTransform"
					@dblclick.stop="onNumberInputDblClick"
					@focus="onNumberInputFocus"
					@blur="onNumberInputBlur"
					@pointerdown="(e) => onNumberScrubPointerDown(e, () => draft.opacity, (v) => (draft.opacity = v), { step: 0.01, min: 0, max: 1, onCommit: applyTransform })"
				/>
			</label>
			<label class="vs-row">
				<span class="vs-k">快捷</span>
				<div class="vs-quick">
					<button class="vs-quick-btn" type="button" title="靠左" @click="applyQuick('left')">
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4v16H3V4h2zm16 3v2H9V7h12zm0 8v2H9v-2h12z" /></svg>
					</button>
					<button class="vs-quick-btn" type="button" title="靠右" @click="applyQuick('right')">
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4v16h-2V4h2zM15 7v2H3V7h12zm0 8v2H3v-2h12z" /></svg>
					</button>
					<button class="vs-quick-btn" type="button" title="水平居中" @click="applyQuick('hcenter')">
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3h1v18h-1V3zm8 6v2H4V9h16zm0 4v2H4v-2h16z" /></svg>
					</button>
					<button class="vs-quick-btn" type="button" title="垂直居中" @click="applyQuick('vcenter')">
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18v1H3v-1zM8 4h8v6H8V4zm0 10h8v6H8v-6z" /></svg>
					</button>
					<button class="vs-quick-btn" type="button" title="宽度填充" @click="applyQuick('fillW')">
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h2v12H4V6zm14 0h2v12h-2V6zM7 9h10v6H7V9z" /></svg>
					</button>
					<button class="vs-quick-btn" type="button" title="高度填充" @click="applyQuick('fillH')">
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v2H6V4zm0 14h12v2H6v-2zM9 7h6v10H9V7z" /></svg>
					</button>
				</div>
			</label>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { NumberScrubOptions } from './useNumberScrub'

type DraftTransform = {
	x: number
	y: number
	width: number
	height: number
	rotation: number
	opacity: number
}

type QuickAction = 'left' | 'right' | 'hcenter' | 'vcenter' | 'fillW' | 'fillH'

defineProps<{
	draft: DraftTransform
	applyTransform: () => void
	applyQuick: (action: QuickAction) => void
	onNumberScrubPointerDown: (e: PointerEvent, get: () => number, set: (v: number) => void, opt: NumberScrubOptions) => void
	onNumberInputDblClick: (e: MouseEvent) => void
	onNumberInputFocus: (e: FocusEvent) => void
	onNumberInputBlur: (e: FocusEvent) => void
}>()
</script>
