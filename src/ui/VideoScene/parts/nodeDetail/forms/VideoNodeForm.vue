<template>
	<div class="vs-group">
		<div class="vs-group-title">视频</div>
		<label class="vs-row">
			<span class="vs-k">视频</span>
			<div class="vs-video-info">
				<div class="vs-video-name">{{ videoName || '未选择视频' }}</div>
			</div>
		</label>
		<label class="vs-row">
			<span class="vs-k">适配</span>
			<div class="vs-quick">
				<button
					class="vs-quick-btn"
					type="button"
					:class="{ active: draft.videoFit === 'contain' }"
					title="contain"
					@click="emit('set-fit', 'contain')"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M4 5h16v14H4V5zm2 2v10h12V7H6zm2 2h8v6H8V9z" />
					</svg>
				</button>
				<button
					class="vs-quick-btn"
					type="button"
					:class="{ active: draft.videoFit === 'cover' }"
					title="cover"
					@click="emit('set-fit', 'cover')"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M4 5h16v14H4V5zm2 2v10h12V7H6zm1 1h10v8H7V8z" />
					</svg>
				</button>
				<button
					class="vs-quick-btn"
					type="button"
					:class="{ active: draft.videoFit === 'fill' }"
					title="fill"
					@click="emit('set-fit', 'fill')"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M4 5h16v14H4V5zm2 2v10h12V7H6z" />
					</svg>
				</button>
				<button
					class="vs-quick-btn"
					type="button"
					:class="{ active: draft.videoFit === 'none' }"
					title="none"
					@click="emit('set-fit', 'none')"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M4 5h16v14H4V5zm7 5h2v4h-2v-4z" />
					</svg>
				</button>
				<button
					class="vs-quick-btn"
					type="button"
					:class="{ active: draft.videoFit === 'scale-down' }"
					title="scale-down"
					@click="emit('set-fit', 'scale-down')"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M4 5h16v14H4V5zm2 2v10h12V7H6zm5 2h2v6h-2V9z" />
					</svg>
				</button>
			</div>
		</label>
	</div>
</template>

<script setup lang="ts">
type VideoFit = 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'

type DraftVideo = {
	videoName: string
	videoFit: VideoFit
}

defineProps<{
	draft: DraftVideo
	hasVideo: boolean
	videoName: string
}>()

const emit = defineEmits<{
	(e: 'set-fit', fit: VideoFit): void
}>()
</script>

<style scoped>
.vs-video-info {
	flex: 1;
	min-width: 0;
}

.vs-video-name {
	font-size: 12px;
	color: var(--vscode-fg);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
</style>
