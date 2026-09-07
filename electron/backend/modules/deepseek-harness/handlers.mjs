import { dialog, shell } from 'electron'
import * as service from './service.mjs'
import { redact } from './serviceEvents.mjs'

// Sanitize failures before the shared router logs them (source tools may echo URLs).
const safe =
	(fn) =>
	async (ctx, payload = {}) => {
		try {
			return { ok: true, value: await fn(ctx, payload) }
		} catch (error) {
			return { ok: false, error: redact(error.message || String(error)) }
		}
	}
export const listProfiles = safe(service.listProfiles)
export const saveProfile = safe(service.saveProfile)
export const removeProfile = safe(service.removeProfile)
export const activateProfile = safe(service.activateProfile)
export const probe = safe(service.probe)
export const getSnapshot = safe(service.getSnapshot)
export const clearLogs = safe(service.clearLogs)
export const startService = safe(service.startService)
export const stopService = safe(service.stopService)
export const restartService = safe(service.restartService)
export const cancelPrepare = safe(service.cancelPrepare)
export const prepare = service.prepare
export const selectPath = safe(async () => {
	const result = await dialog.showOpenDialog({
		title: '选择 DeepSeek-Harness 源码目录',
		properties: ['openDirectory', 'createDirectory']
	})
	return { cancelled: result.canceled, path: result.filePaths[0] || '' }
})
export const openUi = safe(async (_ctx, payload) => {
	await shell.openExternal(service.getOpenUrl(payload.runId))
	return true
})
