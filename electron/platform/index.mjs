import { getManager } from './manager.mjs'
import {
	registerPlatformIpc as _registerPlatformIpc,
	setMainWindowForPlatform as _setMainWindowForPlatform
} from './ipc.mjs'

export function platformPreflight() {
	const mgr = getManager()
	mgr.discover()
	const preflightResult = mgr.preflightAll()
	if (preflightResult === 'restart') {
		console.log(`[platform] requested app restart (launch through platform client), quitting...`)
		return true
	}
	return false
}

export async function platformInit() {
	const mgr = getManager()
	await mgr.initializeAll()
	mgr.startCallbackPump()
	const status = mgr.getStatus()
	console.log(
		`[platform] initialized. Active: ${status.activeDisplayName}, User: ${status.user?.displayName || 'N/A'}`
	)
	return status
}

export function platformShutdown() {
	getManager().shutdownAll()
}

export function platformOverlayOpenUrl(url) {
	return getManager().overlayOpenUrl(url)
}

export function platformOverlayActivateGameOverlay(dialog) {
	return getManager().overlayActivateGameOverlay(dialog)
}

export function platformIsDlcInstalled(dlcAppId) {
	return getManager().isDlcInstalled(dlcAppId)
}

export function platformGetInstalledDlcs() {
	return getManager().getInstalledDlcs()
}

export const registerPlatformIpc = _registerPlatformIpc
export const setMainWindowForPlatform = _setMainWindowForPlatform
