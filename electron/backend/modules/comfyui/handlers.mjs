import * as service from './service.mjs'
import * as setup from './setup-service.mjs'

export async function listWorkflows(ctx, payload) {
	return service.listWorkflows(ctx, payload)
}

export async function getWorkflow(ctx, payload) {
	return service.getWorkflow(ctx, payload)
}

export async function saveWorkflow(ctx, payload) {
	return service.saveWorkflow(ctx, payload)
}

export async function deleteWorkflow(ctx, payload) {
	return service.deleteWorkflow(ctx, payload)
}

export async function proxy(ctx, payload) {
	return service.proxyRequest(ctx, payload)
}

export async function listJobs(ctx, payload) {
	return service.listJobs(ctx, payload)
}

export async function getJob(ctx, payload) {
	return service.getJob(ctx, payload)
}

export async function createJob(ctx, payload) {
	return service.createJob(ctx, payload)
}

export async function cancelJob(ctx, payload) {
	return service.cancelJob(ctx, payload)
}

export async function runtimePing(ctx, payload) {
	return service.runtimePing(ctx, payload)
}

export async function runtimeGetObjectInfo(ctx, payload) {
	return service.runtimeGetObjectInfo(ctx, payload)
}

export async function runtimeListWorkflowFiles(ctx, payload) {
	return service.runtimeListWorkflowFiles(ctx, payload)
}

export async function runtimeGetWorkflowFile(ctx, payload) {
	return service.runtimeGetWorkflowFile(ctx, payload)
}

export async function runtimeGetHistoryWorkflow(ctx, payload) {
	return service.runtimeGetHistoryWorkflow(ctx, payload)
}

export async function runtimeResolveHistoryPrompt(ctx, payload) {
	return service.runtimeResolveHistoryPrompt(ctx, payload)
}

export async function runtimeRunWorkflow(ctx, payload) {
	return service.runtimeRunWorkflow(ctx, payload)
}

export async function runtimeGetOutputs(ctx, payload) {
	return service.runtimeGetOutputs(ctx, payload)
}

export async function runtimeCancelRun(ctx, payload) {
	return service.runtimeCancelRun(ctx, payload)
}

export async function runtimeGetJobStatus(ctx, payload) {
	return service.runtimeGetJobStatus(ctx, payload)
}

export async function runtimeClearHistoryCache(ctx, payload) {
	return service.runtimeClearHistoryCache(ctx, payload)
}

// ===== ComfyUI Setup handlers =====

export function setupGetDefaultInstallPath() {
	return setup.setupGetDefaultInstallPath()
}

export async function setupSelectPath(ctx, payload) {
	return setup.setupSelectPath(ctx, payload)
}

export async function setupSelectModelPath(ctx) {
	return setup.setupSelectModelPath(ctx)
}

export async function setupValidatePath(ctx, payload) {
	return setup.setupValidatePath(ctx, payload)
}

export async function setupProbeExistingInstall(ctx, payload) {
	return setup.setupProbeExistingInstall(ctx, payload)
}

export async function setupCheckEnv(ctx, payload) {
	return setup.setupCheckEnv(ctx, payload)
}

export function setupGetConfig() {
	return setup.setupGetConfig()
}

export function setupSaveConfig(ctx, payload) {
	return setup.setupSaveConfig(ctx, payload)
}

export async function setupCheckVersionUpdate(ctx, payload) {
	return setup.setupCheckVersionUpdate(ctx, payload)
}

export function setupResetForFreshInstall() {
	return setup.setupResetForFreshInstall()
}

export async function setupAddCustomModelPath(ctx, payload) {
	return setup.setupAddCustomModelPath(ctx, payload)
}

export function setupRemoveCustomModelPath(ctx, payload) {
	return setup.setupRemoveCustomModelPath(ctx, payload)
}

export function setupOpenFolder(ctx, payload) {
	return setup.setupOpenFolder(ctx, payload)
}

export function setupGetServiceStatus() {
	return setup.setupGetServiceStatus()
}

export async function setupStartService(ctx, payload) {
	return setup.setupStartService(ctx, payload)
}

export function setupStopService() {
	return setup.setupStopService()
}

export function setupCancelInstall() {
	return setup.setupCancelInstall()
}

export async function* setupInstall(ctx, payload) {
	yield* setup.setupInstall(ctx, payload)
}

export async function setupPingMirrors() {
	return setup.setupPingMirrors()
}

export function setupGetMirrorList() {
	return setup.setupGetMirrorList()
}

export function setupSetMirror(ctx, payload) {
	return setup.setupSetMirror(ctx, payload)
}

export async function* setupFixPythonEnv(ctx, payload) {
	yield* setup.setupFixPythonEnv(ctx, payload)
}

export function setupGetDefaultVenvPath() {
	return setup.setupGetDefaultVenvPath()
}

export async function setupSelectVenvPath(ctx, payload) {
	return setup.setupSelectVenvPath(ctx, payload)
}

export function setupSetVenvPath(ctx, payload) {
	return setup.setupSetVenvPath(ctx, payload)
}

export function setupGetServiceLogs() {
	return setup.setupGetServiceLogs()
}

export function setupClearServiceLogs() {
	return setup.setupClearServiceLogs()
}

export async function setupRestartService(ctx, payload) {
	return setup.setupRestartService(ctx, payload)
}

export async function* setupCloneComfyUI(ctx, payload) {
	yield* setup.setupCloneComfyUI(ctx, payload)
}

export async function* setupUpdateComfyUI(ctx, payload) {
	console.error('[DEBUG UPDATE COMFYUI] handlers.setupUpdateComfyUI ENTER, yield* forwarding...')
	try {
		const gen = setup.setupUpdateComfyUI(ctx, payload)
		console.error(
			'[DEBUG UPDATE COMFYUI] handlers.setupUpdateComfyUI gen created, typeof next =',
			typeof gen?.next
		)
		yield* gen
	} catch (err) {
		console.error(
			'[DEBUG UPDATE COMFYUI] handlers.setupUpdateComfyUI SYNC/ASYNC EXPLOSION:',
			err?.stack || err
		)
		yield { type: 'error', message: (err?.message || String(err)) + '' }
	}
}

export async function* setupAutoInstallTorch(ctx, payload) {
	yield* setup.setupAutoInstallTorch(ctx, payload)
}

export function setupClearVenv(ctx, payload) {
	return setup.setupClearVenv(ctx, payload)
}

// ===== Terminal toolkit handlers =====

export function setupTerminalListPresets() {
	return setup.setupTerminalListPresets()
}

export async function* setupTerminalRunPreset(ctx, payload) {
	yield* setup.setupTerminalRunPreset(ctx, payload)
}

export async function* setupTerminalRunCustom(ctx, payload) {
	yield* setup.setupTerminalRunCustom(ctx, payload)
}

export function setupTerminalCheckMode() {
	return setup.setupTerminalCheckMode()
}

// ===== Launch args panel handlers =====

export function setupLaunchArgsGetCoreTags() {
	return setup.setupLaunchArgsGetCoreTags()
}

export function setupLaunchArgsGetReferenceArgs() {
	return setup.setupLaunchArgsGetReferenceArgs()
}

export function setupLaunchArgsGetCurrentText() {
	return setup.setupLaunchArgsGetCurrentText()
}

export function setupLaunchArgsParseAndSave(ctx, payload) {
	return setup.setupLaunchArgsParseAndSave(ctx, payload)
}

// ===== Active Python info =====

export async function setupGetActivePython(ctx, payload) {
	return setup.setupGetActivePython(ctx, payload)
}

// ===== Foreign ComfyUI process scan & kill =====

export async function setupScanForeignComfyProcesses(ctx, payload) {
	return setup.setupScanForeignComfyProcesses(ctx, payload)
}
export async function setupKillForeignComfyProcesses(ctx, payload) {
	return setup.setupKillForeignComfyProcesses(ctx, payload)
}
