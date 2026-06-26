import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { cleanupOldRuntimeProject } from '../electron/backend/runtimeCleanup.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const resourceDir = path.resolve(repoRoot, 'DVSResource')

const result = cleanupOldRuntimeProject({
	resourceDir,
	log: (line) => console.log(line)
})

if (result.ok) {
	console.log('[cleanup] success')
	process.exit(0)
}

console.error(`[cleanup] failed: ${result.error || 'unknown error'}`)
process.exit(1)
