import path from 'node:path'
import fs from 'node:fs'

export const PROJECT_MEDIA_RELATIVE_DIR = 'Content/Media'

export function normalizePathSeparators(value) {
	return String(value || '')
		.trim()
		.replace(/\\/g, '/')
}

export function decodeMaybeEncodedPath(value) {
	let out = String(value || '').trim()
	if (!out) return ''
	// Historic snapshots may contain repeated encoding or plus-as-space forms.
	out = out.replace(/\+/g, ' ')
	for (let i = 0; i < 3; i += 1) {
		try {
			const next = decodeURIComponent(out)
			if (next === out) break
			out = next
		} catch {
			break
		}
	}
	return normalizePathSeparators(out)
}

export function extractDwebProjectAssetPath(rawUrl) {
	const text = String(rawUrl || '').trim()
	if (!text) return ''
	try {
		const u = new URL(text)
		if (String(u.protocol || '').toLowerCase() !== 'dweb:') return ''
		if (String(u.hostname || '').toLowerCase() !== 'project-assets') return ''
		return decodeMaybeEncodedPath(String(u.searchParams.get('path') || '').trim())
	} catch {
		return ''
	}
}

export function canonicalProjectRelativePath(rawPath) {
	let rel = decodeMaybeEncodedPath(rawPath)
	if (!rel) return ''
	rel = rel.replace(/^\/+/, '')
	rel = rel.replace(/\/\.\//g, '/')
	while (/^(?:content\/media\/)+content\/media\//i.test(rel)) {
		rel = rel.replace(/^content\/media\//i, '')
	}
	if (/^media\//i.test(rel)) rel = rel.replace(/^media\//i, '')
	const isKnownRootPath = /^(?:content\/media|content\/generated|generated-assets|\.dvcache)\//i.test(rel)
	if (!isKnownRootPath) rel = `${PROJECT_MEDIA_RELATIVE_DIR}/${rel}`
	const parts = rel.split('/').filter(Boolean)
	if (!parts.length) return ''
	if (parts.some((p) => p === '..')) return ''
	return parts.join('/')
}

export function projectMediaRoot(projectRoot) {
	const root = String(projectRoot || '').trim()
	if (!root) return ''
	return path.resolve(root, 'Content', 'Media')
}

export function ensureProjectMediaRoot(projectRoot) {
	const mediaRoot = projectMediaRoot(projectRoot)
	if (!mediaRoot) return ''
	fs.mkdirSync(mediaRoot, { recursive: true })
	return mediaRoot
}

export function safeResolveProjectRelative(projectRoot, relPath) {
	const root = String(projectRoot || '').trim()
	const rel = canonicalProjectRelativePath(relPath)
	if (!root || !rel) return null
	const resolvedRoot = path.resolve(root)
	const candidate = path.resolve(resolvedRoot, ...rel.split('/'))
	if (candidate !== resolvedRoot && !candidate.startsWith(resolvedRoot + path.sep)) return null
	return candidate
}

export function fileUrlToPath(raw) {
	const text = String(raw || '').trim()
	if (!/^file:\/\//i.test(text)) return text
	try {
		const u = new URL(text)
		return decodeURIComponent(u.pathname.replace(/^\/(?:([a-zA-Z]:))/, '$1')).replace(
			/\//g,
			path.sep
		)
	} catch {
		return text
			.replace(/^file:\/\//i, '')
			.replace(/^\/+/, '')
			.replace(/\//g, path.sep)
	}
}

export function buildDwebAssetUrl(projectId, relPath) {
	const pid = Number(projectId)
	const rel = canonicalProjectRelativePath(relPath)
	if (!Number.isFinite(pid) || pid <= 0 || !rel) return ''
	return `dweb://project-assets?projectId=${encodeURIComponent(String(Math.floor(pid)))}&path=${encodeURIComponent(rel)}`
}

export function basenameFromAnyPath(raw) {
	const text = decodeMaybeEncodedPath(raw)
	if (!text) return ''
	return path.basename(text)
}
