

<template>
	<router-view />
</template>

<script setup lang="ts">
import { provide } from 'vue'
import { VideoStudioKey, VideoStudioStore } from './store/videostudio'
import { TimelineKey, TimelineStore } from './store/timeline'
import { AIWorkflowKey, AIWorkflowStore } from './store/aiworkflow'

provide(VideoStudioKey, VideoStudioStore)
provide(TimelineKey, TimelineStore)
provide(AIWorkflowKey, AIWorkflowStore)
</script>

<style scoped></style>
