import fs from 'node:fs'
import path from 'node:path'
import {
	copyFileToProjectRoot,
	downloadUrlToProjectRoot,
	getProjectRootById,
	importProjectAsset,
	migrateBinCacheMediaToMedia,
	resolveProjectAsset,
	uploadProjectAsset,
	deleteProjectAsset,
	repairProjectAsset
} from '../projectAssetProtocol.mjs'
import { upsertAssetManifestEntry } from './manifest.mjs'
import {
	basenameFromAnyPath,
	buildDwebAssetUrl,
	canonicalProjectRelativePath,
	extractDwebProjectAssetPath,
	fileUrlToPath,
	safeResolveProjectRelative
} from './paths.mjs'

function assetName(resourceId, resource) {
	const explicit = String(resource?.name || '').trim()
	if (explicit) return explicit
	const fromRel = basenameFromAnyPath(
		resource?.projectRelativePath || resource?.relativePath || resource?.url || resource?.sourcePath
	)
	return fromRel || String(resourceId || `asset-${Date.now()}`)
}

function assetKind(resource) {
	const raw = String(resource?.kind || '')
		.trim()
		.toLowerCase()
	if (raw === 'image' || raw === 'video' || raw === 'audio' || raw === 'file' || raw === 'model')
		return raw === 'model' ? 'file' : raw
	return 'file'
}

function fileExists(filePath) {
	try {
		return Boolean(filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile())
	} catch {
		return false
	}
}

function isBinCacheFile(root, filePath) {
	if (!filePath) return false
	const normalized = String(filePath).toLowerCase().replace(/\\/g, '/')
	if (normalized.endsWith('.bin')) return true
	const cacheBinDir = path.resolve(root, '.dvcache', 'bin').toLowerCase().replace(/\\/g, '/')
	return normalized.includes(cacheBinDir + '/')
}

function migrateBinIfMedia(pid, root, filePath, resourceId, resource) {
	if (!fileExists(filePath)) return null
	if (!isBinCacheFile(root, filePath)) return null
	const kind = assetKind(resource)
	if (kind === 'file' || kind === 'model') return null
	const name = assetName(resourceId, resource)
	const result = migrateBinCacheMediaToMedia({
		projectId: pid,
		binFilePath: filePath,
		kind,
		preferredName: name
	})
	if (result?.ok && result.migrated && result.asset) {
		return makeCanonicalAsset(
			pid,
			root,
			result.asset.absolutePath || result.asset.sourcePath,
			resourceId,
			resource
		)
	}
	return null
}

function scanForBasename(projectRoot, targetName) {
	const name = String(targetName || '').trim()
	const root = String(projectRoot || '').trim()
	if (!root || !name || !fs.existsSync(root)) return ''
	const skipDirs = new Set(['node_modules', '.git', '__pycache__', '.venv'])
	const allowedHiddenDirs = new Set(['.dvcache'])
	const searchRoots = [
		path.resolve(root, 'Content', 'Media'),
		path.resolve(root, 'Content', 'Generated'),
		path.resolve(root, 'generated-assets'),
		path.resolve(root, '.dvcache', 'bin')
	].filter((dir) => {
		try {
			return fs.existsSync(dir) && fs.statSync(dir).isDirectory()
		} catch {
			return false
		}
	})
	if (searchRoots.length === 0) return ''

	const nameLower = name.toLowerCase()
	const hasExt = path.extname(nameLower).length > 0

	let exactMatch = ''
	let basenameMatch = ''
	let prefixMatch = ''

	for (const searchRoot of searchRoots) {
		const stack = [searchRoot]
		while (stack.length) {
			const current = stack.pop()
			let entries = []
			try {
				entries = fs.readdirSync(current, { withFileTypes: true })
			} catch {
				continue
			}
			for (const entry of entries) {
				const full = path.resolve(current, entry.name)
				if (entry.isFile()) {
					const entryLower = entry.name.toLowerCase()
					if (entryLower === nameLower) {
						return full
					}
					if (!hasExt && !basenameMatch) {
						const entryBase = path.basename(entryLower, path.extname(entryLower))
						if (entryBase === nameLower) {
							basenameMatch = full
						}
					}
					if (!prefixMatch && entryLower.startsWith(nameLower)) {
						const sep = entryLower.charAt(nameLower.length)
						if (sep === '.' || sep === '_' || sep === '-') {
							prefixMatch = full
						}
					}
				}
				if (entry.isDirectory() && !skipDirs.has(entry.name)) {
					const isHidden = entry.name.startsWith('.')
					if (!isHidden || allowedHiddenDirs.has(entry.name)) {
						stack.push(full)
					}
				}
			}
		}
	}

	return basenameMatch || prefixMatch || ''
}

function makeCanonicalAsset(projectId, root, filePath, resourceId, resource, relOverride = '') {
	const rel = canonicalProjectRelativePath(
		relOverride || path.relative(root, filePath).split(path.sep).join('/')
	)
	if (!rel) return null
	const url = buildDwebAssetUrl(projectId, rel)
	if (!url) return null
	let size = 0
	try {
		size = Number(fs.statSync(filePath).size || 0)
	} catch {
		size = 0
	}
	return {
		...(resource || {}),
		id: resource?.id || resourceId,
		kind: assetKind(resource),
		name: assetName(resourceId, resource),
		url,
		projectRelativePath: rel,
		relativePath: rel,
		sourcePath: filePath,
		absolutePath: filePath,
		size: size || resource?.size || 0
	}
}

async function repairOneProjectAsset(projectId, resourceId, resource) {
	const pid = Number(projectId)
	const root = getProjectRootById(pid)
	if (!Number.isFinite(pid) || pid <= 0 || !root || !resource) return null

	const candidates = []
	const dwebRel = extractDwebProjectAssetPath(resource.url)
	const explicitRel = canonicalProjectRelativePath(
		resource.projectRelativePath || resource.relativePath || ''
	)
	if (explicitRel) candidates.push(explicitRel)
	if (dwebRel) candidates.push(canonicalProjectRelativePath(dwebRel))

	for (const rel of candidates.filter(Boolean)) {
		const resolved = safeResolveProjectRelative(root, rel)
		if (fileExists(resolved)) {
			const migrated = migrateBinIfMedia(pid, root, resolved, resourceId, resource)
			if (migrated) return migrated
			return makeCanonicalAsset(pid, root, resolved, resourceId, resource, rel)
		}
	}

	const sourcePath = fileUrlToPath(
		String(resource.sourcePath || resource.absolutePath || '').trim()
	)
	if (fileExists(sourcePath)) {
		const migrated = migrateBinIfMedia(pid, root, sourcePath, resourceId, resource)
		if (migrated) return migrated
		const copied = await copyFileToProjectRoot(pid, sourcePath, assetName(resourceId, resource))
		const rel = String(copied?.relativePath || '').trim()
		const abs = String(copied?.absolutePath || '').trim()
		if (copied?.ok && rel && fileExists(abs)) {
			const copiedMigrated = migrateBinIfMedia(pid, root, abs, resourceId, resource)
			if (copiedMigrated) return copiedMigrated
			return makeCanonicalAsset(pid, root, abs, resourceId, resource, rel)
		}
	}

	const sourceUrl = String(resource.url || '').trim()
	if (/^https?:\/\//i.test(sourceUrl)) {
		const dl = await downloadUrlToProjectRoot(pid, sourceUrl, assetName(resourceId, resource))
		const rel = String(dl?.relativePath || '').trim()
		const abs = String(dl?.absolutePath || '').trim()
		if (dl?.ok && rel && fileExists(abs))
			return makeCanonicalAsset(pid, root, abs, resourceId, resource, rel)
	}

	const names = new Set()
	names.add(assetName(resourceId, resource))
	for (const raw of [
		resource.projectRelativePath,
		resource.relativePath,
		resource.url,
		resource.sourcePath,
		dwebRel
	]) {
		const base = basenameFromAnyPath(raw)
		if (base) names.add(base)
	}

	for (const name of names) {
		const hit = scanForBasename(root, name)
		if (hit) {
			const migrated = migrateBinIfMedia(pid, root, hit, resourceId, resource)
			if (migrated) return migrated
			return makeCanonicalAsset(pid, root, hit, resourceId, resource)
		}
	}

	const repaired = repairProjectAsset({
		projectId: pid,
		kind: assetKind(resource),
		name: assetName(resourceId, resource),
		projectRelativePath: explicitRel || dwebRel || undefined
	})
	if (repaired?.ok && repaired?.repaired && repaired.asset) {
		return {
			...(resource || {}),
			...(repaired.asset || {}),
			id: resource?.id || resourceId,
			url: buildDwebAssetUrl(
				pid,
				repaired.asset.projectRelativePath || repaired.asset.relativePath || ''
			)
		}
	}

	return null
}

export async function repairAllProjectAssets({ projectId, resourcesById }) {
	const pid = Number(projectId)
	const root = getProjectRootById(pid)
	if (!Number.isFinite(pid) || pid <= 0) return { ok: false, error: 'projectId is invalid' }
	if (!root) return { ok: false, error: `project root not registered for projectId=${pid}` }

	const resources = resourcesById && typeof resourcesById === 'object' ? resourcesById : {}
	const patches = {}
	const failed = []
	for (const [resourceId, resource] of Object.entries(resources)) {
		const kind = String(resource?.kind || '').toLowerCase()
		if (!['image', 'video', 'audio', 'file', 'model'].includes(kind)) continue
		const repaired = await repairOneProjectAsset(pid, resourceId, resource)
		if (repaired) {
			patches[resourceId] = repaired
			try {
				upsertAssetManifestEntry(root, repaired)
			} catch {
				/* ignore manifest failures */
			}
		} else {
			failed.push(resourceId)
		}
	}
	return {
		ok: true,
		patches,
		failed,
		changed: Object.keys(patches).length
	}
}

export async function importUrlProjectAsset(payload) {
	return importProjectAsset({ ...payload, sourceUrl: payload?.sourceUrl || payload?.url })
}

export async function importFileProjectAsset(payload) {
	return importProjectAsset({ ...payload, sourcePath: payload?.sourcePath || payload?.path })
}

export function uploadBufferProjectAsset(payload) {
	return uploadProjectAsset(payload || {})
}

export function resolveStaticProjectAsset(payload) {
	return resolveProjectAsset(payload || {})
}

export function deleteStaticProjectAsset(payload) {
	return deleteProjectAsset(payload || {})
}
