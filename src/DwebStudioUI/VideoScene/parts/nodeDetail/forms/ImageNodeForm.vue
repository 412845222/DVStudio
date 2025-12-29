<template>
	<div class="vs-group">
		<div class="vs-group-title">图片</div>
		<label class="vs-row">
			<span class="vs-k">图片</span>
			<div class="vs-image-pick">
				<div v-if="currentImageUrl" class="vs-image-preview" :title="draft.imageName || ''">
					<img :src="currentImageUrl" alt="" />
				</div>
				<div class="vs-image-meta">
					<div class="vs-image-name">{{ draft.imageName || '未选择图片' }}</div>
					<button class="vs-btn" type="button" @click="openPicker">选择图片</button>
					<input ref="inputRef" class="vs-hidden-input" type="file" accept="image/*" @change="onPick" />
				</div>
			</div>
		</label>
		<label class="vs-row">
			<span class="vs-k">适配</span>
			<div class="vs-quick">
				<button class="vs-quick-btn" type="button" :class="{ active: draft.imageFit === 'contain' }" title="contain" @click="emit('set-fit', 'contain')">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4V5zm2 2v10h12V7H6zm2 2h8v6H8V9z"/></svg>
				</button>
				<button class="vs-quick-btn" type="button" :class="{ active: draft.imageFit === 'cover' }" title="cover" @click="emit('set-fit', 'cover')">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4V5zm2 2v10h12V7H6zm1 1h10v8H7V8z"/></svg>
				</button>
				<button class="vs-quick-btn" type="button" :class="{ active: draft.imageFit === 'fill' }" title="fill" @click="emit('set-fit', 'fill')">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4V5zm2 2v10h12V7H6z"/></svg>
				</button>
				<button class="vs-quick-btn" type="button" :class="{ active: draft.imageFit === 'none' }" title="none" @click="emit('set-fit', 'none')">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4V5zm7 5h2v4h-2v-4z"/></svg>
				</button>
				<button class="vs-quick-btn" type="button" :class="{ active: draft.imageFit === 'scale-down' }" title="scale-down" @click="emit('set-fit', 'scale-down')">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4V5zm2 2v10h12V7H6zm5 2h2v6h-2V9z"/></svg>
				</button>
			</div>
		</label>
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

type ImageFit = 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'

type DraftImage = {
	imageName: string
	imageFit: ImageFit
}

defineProps<{
	draft: DraftImage
	currentImageUrl: string
}>()

const emit = defineEmits<{
	(e: 'pick-file', file: File): void
	(e: 'set-fit', fit: ImageFit): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)

const openPicker = () => {
	try {
		inputRef.value?.click()
	} catch {
		// ignore
	}
}

const onPick = (e: Event) => {
	const input = e.target as HTMLInputElement | null
	const file = input?.files?.[0]
	if (!file) return
	// allow picking the same file again
	try {
		if (input) input.value = ''
	} catch {
		// ignore
	}
	emit('pick-file', file)
}
</script>
