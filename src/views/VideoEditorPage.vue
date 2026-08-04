<template>
	<div class="video-editor-page">
		<GlobalPageBackground variant="project-list" />
		<div class="sq-container" aria-hidden="true">
			<span v-for="p in particles" :key="p.id" class="sq-particle" :style="p.style" />
		</div>
		<div class="video-editor-content">
			<VideoStudio
				:initialVideoUrl="initialVideoUrl"
				:initialVideoName="initialVideoName"
				:initialNodeId="initialNodeId"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import VideoStudio from './VideoStudio.vue'
import GlobalPageBackground from '../ui/UIComponent/GlobalPageBackground.vue'
import { useSquareParticles } from '../composables/useSquareParticles'
import '../styles/square-particles.css'

const route = useRoute()

const initialVideoUrl = computed(() => route.query.videoUrl as string | undefined)
const initialVideoName = computed(() => route.query.videoName as string | undefined)
const initialNodeId = computed(() => route.query.nodeId as string | undefined)

const { particles } = useSquareParticles({
	count: 14,
	minSize: 3,
	maxSize: 7,
	minDuration: 8,
	maxDuration: 16,
	baseOpacity: 0.5,
	seed: 20240815
})
</script>

<style scoped>
.video-editor-page {
	width: 100%;
	height: 100%;
	overflow: hidden;
	position: relative;
}

.video-editor-content {
	position: relative;
	z-index: 1;
	width: 100%;
	height: 100%;
}

.sq-container {
	position: absolute;
	inset: 0;
	pointer-events: none;
	overflow: hidden;
	z-index: 0;
}
</style>
