

<template>
	<router-view />
</template>

<script setup lang="ts">
import { provide } from 'vue'
import { VideoStudioKey, VideoStudioStore } from './store/videostudio'
import { TimelineKey, TimelineStore } from './store/timeline'

provide(VideoStudioKey, VideoStudioStore)
provide(TimelineKey, TimelineStore)
</script>

<style scoped></style>
