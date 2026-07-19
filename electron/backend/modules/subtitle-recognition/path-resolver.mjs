import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'

export function isLocalPath(p) {
	const text = String(p || '').trim()
	if (!text) return false
	if (text.startsWith('file://')) return true
	if (/^[a-zA-Z]:[\\/]/.test(text)) return true
	if (text.startsWith('/')) return true
	return false
}

export function resolveFileUrl(url) {
	const text = String(url || '').trim()
	if (!text) return null
	if (text.startsWith('file://')) {
		try {
			const u = new URL(text)
			let filePath = decodeURIComponent(u.pathname)
			if (process.platform === 'win32') {
				filePath = filePath.replace(/^\//, '')
				filePath = filePath.replace(/\//g, '\\')
			}
			return filePath
		} catch {
			return null
		}
	}
	return text
}

export function resolveVideoPath(videoPath) {
	const text = String(videoPath || '').trim()
	if (!text) return { ok: false, error: 'Empty path', resolvedPath: null }

	const resolved = resolveFileUrl(text)
	if (!resolved) {
		return { ok: false, error: 'Cannot resolve URL', resolvedPath: null }
	}

	if (!path.isAbsolute(resolved)) {
		return { ok: false, error: 'Path is not absolute', resolvedPath: resolved }
	}

	try {
		if (!fs.existsSync(resolved)) {
			return { ok: false, error: `File not found: ${resolved}`, resolvedPath: resolved }
		}
		const stat = fs.statSync(resolved)
		if (!stat.isFile()) {
			return { ok: false, error: 'Not a file', resolvedPath: resolved }
		}
		return { ok: true, error: null, resolvedPath: resolved }
	} catch (err) {
		return { ok: false, error: err.message || String(err), resolvedPath: resolved }
	}
}
