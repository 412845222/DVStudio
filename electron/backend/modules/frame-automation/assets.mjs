import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

// Recovery may only read files inside the selected project's registered root.
export async function validateAssets(rootPath, resources, expected = {}) {
	if (!Array.isArray(resources) || resources.length > 1000) throw new Error('INVALID_ASSETS')
	if (!resources.length) return {}
	if (!rootPath) throw new Error('PROJECT_ROOT_REQUIRED')
	const root = await fs.promises.realpath(rootPath)
	const manifest = {}
	for (const resource of resources) {
		let candidate = resource.projectRelativePath
		if (!candidate && resource.url?.startsWith('dweb://project-assets'))
			candidate = new URL(resource.url).searchParams.get('path')
		if (!candidate && resource.url?.startsWith('file:')) candidate = fileURLToPath(resource.url)
		if (!candidate) candidate = resource.sourcePath
		if (!resource.id || !candidate) throw new Error('ASSET_NOT_PERSISTED: ' + resource.id)
		const absolute = await fs.promises.realpath(path.resolve(root, candidate))
		const relative = path.relative(root, absolute)
		if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))
			throw new Error('ASSET_OUTSIDE_PROJECT')
		const stat = await fs.promises.stat(absolute)
		if (!stat.isFile()) throw new Error('ASSET_NOT_FILE')
		const hash = crypto.createHash('sha256')
		for await (const chunk of fs.createReadStream(absolute)) hash.update(chunk)
		const entry = {
			sha256: hash.digest('hex'),
			size: stat.size,
			path: relative.replaceAll('\\', '/')
		}
		if (expected[resource.id] && expected[resource.id].sha256 !== entry.sha256)
			throw new Error('ASSET_CHANGED: ' + resource.id)
		manifest[resource.id] = entry
	}
	return manifest
}
