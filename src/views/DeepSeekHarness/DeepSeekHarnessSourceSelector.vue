<template>
	<label class="source-selector">
		源码记录
		<select
			:value="selectedId"
			@change="$emit('select', ($event.target as HTMLSelectElement).value)"
		>
			<option value="">＋ 新增源码记录</option>
			<option v-for="profile in profiles" :key="profile.id" :value="profile.id">
				{{ profile.id === activeId ? '● 当前 · ' : '' }}{{ profile.name }} — {{ profile.localPath }}
			</option>
		</select>
	</label>
</template>
<script setup lang="ts">
import type { HarnessProfile } from '../../electronBridge/deepseekHarnessTypes'
defineProps<{ profiles: HarnessProfile[]; selectedId: string; activeId: string | null }>()
defineEmits<{ (event: 'select', id: string): void }>()
</script>
<style scoped>
.source-selector {
	display: grid;
	gap: 8px;
}
select {
	padding: 10px;
	color: var(--pl-fg);
	background: var(--pl-bg-0);
	border: 1px solid var(--pl-card-border);
	width: 100%;
}
</style>
