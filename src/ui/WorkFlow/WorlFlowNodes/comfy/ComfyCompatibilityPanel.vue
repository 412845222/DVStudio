<template>
	<div v-if="diagnostics || warnings?.length" class="comfy-compatibility" role="status">
		<div v-if="diagnostics?.associationState === 'semantic'">
			{{ t('nodes.comfyui.semanticMatched') }}
		</div>
		<div v-if="diagnostics?.associationState === 'executable'">
			{{ t('nodes.comfyui.executionMatched') }}
		</div>
		<div v-if="diagnostics?.archiveState === 'saved'">
			{{ t('nodes.comfyui.snapshotArchived') }}
		</div>
		<div v-if="diagnostics?.readiness === 'unverified'">
			{{ t('nodes.comfyui.dependenciesUnverified') }}
		</div>
		<div v-for="warning in warnings" :key="warning">{{ warning }}</div>
		<template v-if="diagnostics?.correlationId">
			<div>{{ diagnostics.error }} · {{ diagnostics.correlationId }}</div>
			<button type="button" @pointerdown.stop @click.stop="downloadDiagnostics">
				{{ t('nodes.comfyui.downloadDiagnostics') }}
			</button>
		</template>
	</div>
</template>
<script setup lang="ts">
import { useI18n } from '../../../../i18n'
import type { ComfyTemplateDiagnostics } from '../../../../aiworkflow/types'
const props = defineProps<{ diagnostics?: ComfyTemplateDiagnostics; warnings?: string[] }>()
const { t } = useI18n()
function downloadDiagnostics() {
	const report = {
		format: 'dvstudio-comfy-diagnostics-v1',
		exportedAt: new Date().toISOString(),
		...props.diagnostics
	}
	const url = URL.createObjectURL(
		new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
	)
	const link = document.createElement('a')
	link.href = url
	link.download = `ComfyUI-diagnostics-${props.diagnostics?.correlationId || 'latest'}.json`
	link.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>
<style scoped>
.comfy-compatibility {
	font-size: 12px;
	line-height: 1.6;
	overflow-wrap: anywhere;
	opacity: 0.9;
}
</style>
