<template>
	<div class="director-console-page">
		<DirectorConsoleWindow ref="windowRef" :title="pageTitle" @data-loaded="onDataLoaded" />
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from '../i18n'
import DirectorConsoleWindow from '../ui/DirectorConsole/DirectorConsoleWindow.vue'
import {
	directorConsoleRequestData,
	onDirectorConsoleData,
	offDirectorConsoleData,
	type DirectorConsoleScenePayload
} from '../electronBridge'

const { t } = useI18n()

const windowRef = ref<InstanceType<typeof DirectorConsoleWindow> | null>(null)
const pageTitle = ref(t('nodes.directorConsole.title'))
const nodeId = ref('')
const projectId = ref<number | undefined>(undefined)

let dataListenerId = -1

function parseHashQuery() {
	try {
		const raw = window.location.hash || ''
		const qStart = raw.indexOf('?')
		const queryStr = qStart >= 0 ? raw.slice(qStart + 1) : ''
		const params = new URLSearchParams(queryStr)
		nodeId.value = params.get('nodeId') || ''
		const pid = params.get('projectId')
		if (pid != null && pid !== '') {
			projectId.value = Number(pid)
		}
		const title = params.get('title')
		if (title) {
			pageTitle.value = decodeURIComponent(title)
		}
	} catch (e) {
		console.warn('[DirectorConsolePage] failed to parse hash query:', e)
	}
}

function onDataLoaded(payload: DirectorConsoleScenePayload) {
	console.log('[DirectorConsolePage] scene data loaded:', {
		layoutCount: Array.isArray(payload?.layoutItems) ? payload.layoutItems.length : 0
	})
}

async function requestData() {
	const dweb = window.dweb
	// Step 1: read from preload cache
	if (dweb?.window?.getDirectorConsoleData) {
		const cached = dweb.window.getDirectorConsoleData()
		if (cached) {
			windowRef.value?.applyScenePayload(cached)
		}
	}

	// Step 2: register push listener
	if (dweb?.window?.onDirectorConsoleData) {
		dataListenerId = onDirectorConsoleData((payload) => {
			if (payload && (!nodeId.value || payload.nodeId === nodeId.value)) {
				windowRef.value?.applyScenePayload(payload)
			}
		})
	}

	// Step 3: actively request data from main window
	if (nodeId.value) {
		try {
			const response = await directorConsoleRequestData({ nodeId: nodeId.value })
			if (response?.ok && response.data) {
				windowRef.value?.applyScenePayload(response.data)
			}
		} catch (err) {
			console.warn('[DirectorConsolePage] request data failed:', err)
		}
	}
}

onMounted(async () => {
	parseHashQuery()
	if (!nodeId.value) {
		windowRef.value?.set_error(t('nodes.directorConsole.errorMissingNodeId'))
		return
	}
	await requestData()
})

onBeforeUnmount(() => {
	if (dataListenerId >= 0) {
		offDirectorConsoleData(dataListenerId)
		dataListenerId = -1
	}
})
</script>

<style scoped>
.director-console-page {
	width: 100vw;
	height: 100vh;
	overflow: hidden;
}
</style>
