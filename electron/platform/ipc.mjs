import { ipcMain } from 'electron'
import { getManager } from './manager.mjs'

export function setMainWindowForPlatform(window) {
	const mgr = getManager()
	mgr.setMainWindow(window)
}

export function registerPlatformIpc() {
	const mgr = getManager()

	ipcMain.handle('platform:get-status', () => {
		return mgr.getStatus()
	})

	ipcMain.handle('platform:get-active', () => {
		const p = mgr.getActiveProvider()
		return p ? { id: p.id, displayName: p.displayName } : { id: 'none', displayName: 'None' }
	})

	ipcMain.handle('platform:get-user', () => {
		return mgr.getCurrentUser()
	})

	ipcMain.handle('platform:is-available', () => {
		const s = mgr.getStatus()
		return s.available
	})

	ipcMain.handle('platform:overlay:is-enabled', () => {
		return mgr.getActiveProvider()?.isOverlayEnabled?.() || false
	})

	ipcMain.handle('platform:overlay:is-active', () => {
		return mgr.getActiveProvider()?.isOverlayActive?.() || false
	})

	ipcMain.handle('platform:overlay:open-url', (_evt, url) => {
		return mgr.overlayOpenUrl(url)
	})

	ipcMain.handle('platform:overlay:activate', (_evt, dialog) => {
		return mgr.overlayActivateGameOverlay(dialog)
	})

	ipcMain.handle('platform:dlc:is-installed', (_evt, dlcAppId) => {
		return mgr.isDlcInstalled(dlcAppId)
	})

	ipcMain.handle('platform:dlc:get-installed', () => {
		return mgr.getInstalledDlcs()
	})

	ipcMain.handle('platform:request-status', () => {
		return mgr.getStatus()
	})
}
