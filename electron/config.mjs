import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const APP_NAME = 'Dweb Video Studio'

let _isPackaged = false
let _resourcesPath = ''

try {
	const electron = await import('electron')
	if (electron.app) {
		_isPackaged = electron.app.isPackaged
		_resourcesPath = process.resourcesPath || ''
	}
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
