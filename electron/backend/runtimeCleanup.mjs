import fs from 'node:fs'
import path from 'node:path'

function removeDirSafe(dirPath) {
	const abs = path.resolve(dirPath)
	if (!fs.existsSync(abs)) return { path: abs, status: 'missing' }
	try {
		fs.rmSync(abs, { recursive: true, force: true })
		return { path: abs, status: 'removed' }
	} catch (e) {
		return { path: abs, status: 'error', error: String(e?.message || e) }
	}
}

/**
 * Remove old runtime django project artifacts under DVSResource.
 * Keeps UserSettings by default.
 */
export function cleanupOldRuntimeProject({
	resourceDir,
	targets = ['.venv', 'django-app', 'BackendData'],
	log = () => {}
} = {}) {
	if (!resourceDir) throw new Error('cleanupOldRuntimeProject: missing resourceDir')

	const root = path.resolve(resourceDir)
	fs.mkdirSync(root, { recursive: true })

	log(`[cleanup] resourceDir=${root}`)
	const results = []
	for (const rel of targets) {
		const r = removeDirSafe(path.resolve(root, rel))
		results.push({ target: rel, ...r })
		if (r.status === 'removed') log(`[cleanup] removed: ${rel}`)
		else if (r.status === 'missing') log(`[cleanup] not found: ${rel}`)
		else log(`[cleanup] failed: ${rel} (${r.error || 'unknown error'})`)
	}

	const removedCount = results.filter((v) => v.status === 'removed').length
	const errorCount = results.filter((v) => v.status === 'error').length

	if (errorCount === 0) {
		log(`[cleanup] done. removed=${removedCount}, missing=${results.length - removedCount}`)
		return { ok: true, resourceDir: root, results }
	}
	return { ok: false, resourceDir: root, results, error: `cleanup failed: ${errorCount} target(s)` }
}
