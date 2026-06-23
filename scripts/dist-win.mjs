import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

function run(cmd, args, { env } = {}) {
	return new Promise((resolve) => {
		const child = spawn(cmd, args, {
			stdio: 'inherit',
			shell: true,
			env: { ...process.env, ...(env || {}) },
			windowsHide: true,
		})
		child.once('exit', (code) => resolve(Number(code || 0)))
	})
}

async function main() {
	const stamp = new Date()
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\..+$/, '')
		.replace('T', '-')
	const releaseDir = path.resolve(process.cwd(), `release-${stamp}`)
	const cacheDir = path.resolve(process.cwd(), '.electron-cache')

	fs.mkdirSync(cacheDir, { recursive: true })

	process.stdout.write(`[dist:win] output dir: ${releaseDir}\n`)
	process.stdout.write(`[dist:win] electron cache dir: ${cacheDir}\n`)

	const buildEnv = {
		ELECTRON_BUILDER_DISABLE_UPDATES_CHECK: 'true',
		ELECTRON_CACHE: cacheDir,
		ELECTRON_BUILDER_CACHE: cacheDir,
	}

	let code = await run('npx', ['vite', 'build'])
	if (code !== 0) process.exit(code)

	code = await run('electron-builder', ['-w', '--publish', 'never', '--projectDir', process.cwd(), '--config.directories.output', releaseDir], {
		env: buildEnv,
	})
	if (code !== 0) {
		process.stdout.write('[dist:win] retry once...\n')
		code = await run(
			'electron-builder',
			['-w', '--publish', 'never', '--projectDir', process.cwd(), '--config.directories.output', releaseDir],
			{
				env: buildEnv,
			},
		)
	}

	process.exit(code)
}

main().catch((e) => {
	process.stderr.write(`[dist:win] FAILED: ${String(e?.message || e)}\n`)
	process.exit(1)
})
