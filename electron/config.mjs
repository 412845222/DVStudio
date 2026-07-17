import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const APP_NAME = (() => {
	const env = String(process.env.DWEB_APP_NAME || process.env.DWEB_PRODUCT_NAME || '').trim()
	if (env) return env
	return 'DVStudio'
})()

export const APP_ID = (() => {
	const env = String(process.env.DWEB_APP_ID || '').trim()
	if (env) return env
	return 'club.dweb.dvstudio'
})()

export const APP_VERSION = '0.1.8'
export const APP_COPYRIGHT = 'Copyright (c) 2026 DwebStudio'
export const APP_LICENSE = 'MPL-2.0'
export const APP_HOMEPAGE = 'https://www.dweb.club/'
export const APP_REPO_URL = 'https://github.com/412845222/DVStudio'
export const APP_BILIBILI_URL = 'https://space.bilibili.com/22690066'
export const APP_ISSUES_URL = 'https://github.com/412845222/DVStudio/issues'

let _isPackaged = false
let _resourcesPath = ''

try {
	const electron = await import('electron')
	const electronApp = electron.default?.app || electron.app
	if (electronApp && typeof electronApp.isPackaged === 'boolean') {
		_isPackaged = electronApp.isPackaged
	} else {
		const rp = process.resourcesPath
		_isPackaged = typeof rp === 'string' && rp.length > 0 && !rp.includes('node_modules')
	}
	_resourcesPath = process.resourcesPath || ''
} catch {
	_isPackaged = false
	_resourcesPath = ''
}

export function getRepoRoot() {
	const here = path.dirname(fileURLToPath(import.meta.url))
	return path.resolve(here, '..')
}

export function isAppPackaged() {
	return _isPackaged
}

export function getResourcesPath() {
	if (_isPackaged && _resourcesPath) return _resourcesPath
	return getRepoRoot()
}

export function getDjangoAppDir() {
	if (_isPackaged && _resourcesPath) {
		return path.resolve(_resourcesPath, 'django-app')
	}
	return path.resolve(getRepoRoot(), 'django-app')
}

export function getWindowIconPath() {
	return path.resolve(getRepoRoot(), 'public', 'favicon.ico')
}

export function getStaticRuntimeDir() {
	if (_isPackaged && _resourcesPath) {
		return path.resolve(_resourcesPath, 'runtime')
	}
	return path.resolve(getRepoRoot(), 'electron', 'static', 'runtime')
}

export function getPythonBridgeScriptsDir() {
	return path.resolve(getRepoRoot(), 'electron', 'backend', 'python-bridge', 'scripts')
}
