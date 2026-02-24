import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const APP_NAME = 'Dweb Video Studio'

export function getRepoRoot() {
	const here = path.dirname(fileURLToPath(import.meta.url))
	return path.resolve(here, '..')
}

export function getDjangoAppDir() {
	return path.resolve(getRepoRoot(), 'django-app')
}

export function getWindowIconPath() {
	// 复用现有图标资源；后续可替换为专用 .ico/.png
	return path.resolve(getRepoRoot(), 'public', 'favicon.ico')
}
