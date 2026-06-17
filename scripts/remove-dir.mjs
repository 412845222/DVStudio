import { rm } from 'node:fs/promises'
import path from 'node:path'

async function main() {
	const target = String(process.argv[2] || '').trim()
	if (!target) {
		throw new Error('usage: node scripts/remove-dir.mjs <dir>')
	}
	const abs = path.resolve(process.cwd(), target)
	await rm(abs, { recursive: true, force: true })
	process.stdout.write(`[clean] removed: ${abs}\n`)
}

main().catch((error) => {
	process.stderr.write(`[clean] FAILED: ${String(error?.message || error)}\n`)
	process.exit(1)
})
