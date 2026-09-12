/**
 * Offline test: simulate the core of
 *   - tryDirectGenerateImage queueing (exportedFiles + outputFiles fallback = previewFiles)
 *   - markTaskCompleted meta fields (exportedFiles/outputFiles/targetOutputPath)
 * so that CLI task-status consumer can always surface the destination path and preview files
 */

const assert = (cond, msg) => {
	if (!cond) {
		throw new Error('ASSERT: ' + (msg || ''))
	}
}

// ============== Simulated mini taskStore ==============
const _tasks = new Map()
let nextTaskSeq = 1
function createTask(command, payload) {
	const id = 'task-' + nextTaskSeq++ + '-' + Math.random().toString(36).slice(2, 6)
	_tasks.set(id, {
		taskId: id,
		command,
		payload,
		status: 'pending',
		createdAt: Date.now(),
		meta: {}
	})
	return { taskId: id }
}
function getTask(id) {
	return _tasks.get(id)
}
function updateTask(id, patch) {
	const cur = _tasks.get(id) || {}
	const next = { ...cur, ...patch }
	if (patch.meta && cur.meta) next.meta = { ...cur.meta, ...patch.meta }
	_tasks.set(id, next)
	return next
}
function markTaskCompleted(id, outputFiles, exportedFiles) {
	return updateTask(id, {
		status: 'completed',
		outputFiles,
		exportedFiles,
		completedAt: Date.now()
	})
}

// ============== Simulated enqueue functions (mirror service.mjs) ==============
function enqueueCreateImageNodeRequests(taskId, exportedFiles, note) {
	if (!Array.isArray(exportedFiles) || exportedFiles.length === 0) return
	const t = getTask(taskId)
	if (!t) return
	const meta = { ...(t.meta || {}) }
	const list = Array.isArray(meta.createImageNodeRequests) ? [...meta.createImageNodeRequests] : []
	for (const fp of exportedFiles) {
		if (!fp || typeof fp !== 'string') continue
		list.push({
			id: 'img-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
			imageUrl: 'file:///' + fp,
			sourceLocalPath: fp,
			name: fp.split(/[\\/]/).pop(),
			status: 'pending'
		})
	}
	updateTask(taskId, { meta: { ...meta, createImageNodeRequests: list } })
}
function enqueueChatImagePreviewBlocks(taskId, exportedFiles, prompt) {
	if (!Array.isArray(exportedFiles) || exportedFiles.length === 0) return
	const t = getTask(taskId)
	if (!t) return
	const meta = { ...(t.meta || {}) }
	const blocks = Array.isArray(meta.chatPreviewBlocks) ? [...meta.chatPreviewBlocks] : []
	for (const fp of exportedFiles) {
		if (!fp || typeof fp !== 'string') continue
		blocks.push({
			type: 'image_url',
			url: 'file:///' + fp,
			sourceLocalPath: fp,
			promptPreview: String(prompt || '').slice(0, 120)
		})
	}
	updateTask(taskId, { meta: { ...meta, chatPreviewBlocks: blocks } })
}

// ============== Simulated tryDirectGenerateImage result handler ==============
function onDirectSuccess(taskId, result, outputPath, prompt) {
	const exported = Array.isArray(result.exportedFiles) ? result.exportedFiles : []
	const outputFiles = Array.isArray(result.outputFiles) ? result.outputFiles : []
	// KEY LOGIC: exportedFiles FIRST, outputFiles as FALLBACK (the exact fix for user's issue)
	const previewFiles = exported.length > 0 ? exported : outputFiles
	enqueueCreateImageNodeRequests(taskId, previewFiles, prompt)
	enqueueChatImagePreviewBlocks(taskId, previewFiles, prompt)
	markTaskCompleted(taskId, outputFiles, exported)
	updateTask(taskId, {
		meta: {
			pipelinePhase: 'p3-direct-completed',
			cliDirectCompletedAt: Date.now(),
			exportedFiles: exported,
			outputFiles: outputFiles,
			targetOutputPath: outputPath,
			autoExportEffective: exported.length > 0
		},
		note:
			exported.length > 0
				? `autoExport OK: ${exported.length} file(s) copied to ${outputPath}`
				: `autoExport SKIPPED; files saved to temp, still rendered from outputFiles`
	})
}

// ============== Tests ==============
let passed = 0,
	failed = 0
console.log('=== Preview Queue + outputFile Fallback Test ===')

// Case 1: Both exportedFiles & outputFiles present -> preview uses exportedFiles (priority)
{
	const { taskId } = createTask('generate-image', { prompt: 'cute cat' })
	onDirectSuccess(
		taskId,
		{
			exportedFiles: [
				'C:\\proj\\Content\\Media\\seedream-1.jpeg',
				'C:\\proj\\Content\\Media\\seedream-2.jpeg'
			],
			outputFiles: [
				'C:\\Users\\foo\\AppData\\Local\\Temp\\dvs-genimg\\tmp-1.png',
				'C:\\Users\\foo\\AppData\\Local\\Temp\\dvs-genimg\\tmp-2.png'
			]
		},
		'C:\\proj\\Content\\Media',
		'cute cat'
	)
	const t = getTask(taskId)
	const ok1 =
		t.meta.createImageNodeRequests?.length === 2 &&
		t.meta.createImageNodeRequests[0].sourceLocalPath ===
			'C:\\proj\\Content\\Media\\seedream-1.jpeg'
	const ok2 = t.meta.chatPreviewBlocks?.length === 2
	const ok3 = t.meta.exportedFiles?.length === 2
	const ok4 = t.meta.outputFiles?.length === 2
	const ok5 = t.meta.targetOutputPath === 'C:\\proj\\Content\\Media'
	const ok6 = t.meta.autoExportEffective === true
	if (ok1 && ok2 && ok3 && ok4 && ok5 && ok6) {
		passed++
		console.log(
			'\x1b[32m[PASS]\x1b[0m Case1: exportedFiles priority - uses exported, meta complete'
		)
	} else {
		failed++
		console.log('\x1b[31m[FAIL]\x1b[0m Case1:', { ok1, ok2, ok3, ok4, ok5, ok6, t })
	}
}

// Case 2: exportedFiles empty (autoExport=false, or copy failed) -> preview falls back to outputFiles (TEMP FILES)
//         This is the KEY FIX for user's complaint that "no image node rendered and can't see whether files saved".
{
	const { taskId } = createTask('generate-image', { prompt: 'mountain' })
	onDirectSuccess(
		taskId,
		{
			exportedFiles: [], // empty means autoExport did not deliver any file to target path
			outputFiles: ['C:\\Users\\foo\\AppData\\Local\\Temp\\dvs-genimg\\tmp-a.png']
		},
		'',
		'mountain'
	)
	const t = getTask(taskId)
	const okA =
		t.meta.createImageNodeRequests?.length === 1 &&
		t.meta.createImageNodeRequests[0].sourceLocalPath ===
			'C:\\Users\\foo\\AppData\\Local\\Temp\\dvs-genimg\\tmp-a.png'
	const okB = t.meta.chatPreviewBlocks?.length === 1
	const okC = t.meta.exportedFiles?.length === 0
	const okD = t.meta.outputFiles?.length === 1
	const okE = t.meta.autoExportEffective === false
	// Most critical: previewFiles should come from outputFiles even though exported is empty
	if (okA && okB && okC && okD && okE) {
		passed++
		console.log(
			'\x1b[32m[PASS]\x1b[0m Case2: exportedFiles empty fallback - still creates 1 preview node+chat block from temp outputFiles'
		)
	} else {
		failed++
		console.log('\x1b[31m[FAIL]\x1b[0m Case2:', { okA, okB, okC, okD, okE })
	}
}

// Case 3: Both empty (failure) -> no preview queued, but task still marked completed with meta fields
{
	const { taskId } = createTask('generate-image', { prompt: 'ocean' })
	onDirectSuccess(taskId, { exportedFiles: [], outputFiles: [] }, 'C:\\proj', 'ocean')
	const t = getTask(taskId)
	const okA =
		!Array.isArray(t.meta.createImageNodeRequests) || t.meta.createImageNodeRequests.length === 0
	const okB = !Array.isArray(t.meta.chatPreviewBlocks) || t.meta.chatPreviewBlocks.length === 0
	const okC = t.meta.targetOutputPath === 'C:\\proj'
	const okD = t.status === 'completed'
	if (okA && okB && okC && okD) {
		passed++
		console.log('\x1b[32m[PASS]\x1b[0m Case3: both arrays empty - no preview queued, status valid')
	} else {
		failed++
		console.log('\x1b[31m[FAIL]\x1b[0m Case3:', { okA, okB, okC, okD })
	}
}

console.log('')
const color = failed === 0 ? '\x1b[32m' : '\x1b[31m'
console.log(`${color}Results: PASS=${passed} FAIL=${failed} TOTAL=3\x1b[0m`)
process.exit(failed === 0 ? 0 : 1)
