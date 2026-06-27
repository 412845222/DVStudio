import { spawn } from 'node:child_process'
import path from 'node:path'

function run(cmd, args, { env } = {}) {
	return new Promise((resolve) => {
		const child = spawn(cmd, args, {
			stdio: 'inherit',
			shell: true,
			env: { ...process.env, ...(env || {}) },
			windowsHide: true
		})
		child.once('exit', (code) => resolve(Number(code || 0)))
	})
}

async function main() {
	const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')
	const releaseDir = path.resolve(process.cwd(), `release-mac-${stamp}`)

	process.stdout.write(`[dist:mac] output dir: ${releaseDir}\n`)

	let code = await run('npm', ['run', 'build'])
	if (code !== 0) process.exit(code)

	code = await run(
		'electron-builder',
		[
			'-m',
			'--publish',
			'never',
			'--projectDir',
			process.cwd(),
			'--config.directories.output',
			releaseDir
		],
		{
			env: {
				ELECTRON_BUILDER_DISABLE_UPDATES_CHECK: 'true'
			}
		}
	)
	if (code !== 0) {
		process.stdout.write('[dist:mac] retry once...\n')
		code = await run(
			'electron-builder',
			[
				'-m',
				'--publish',
				'never',
				'--projectDir',
				process.cwd(),
				'--config.directories.output',
				releaseDir
			],
			{
				env: {
					ELECTRON_BUILDER_DISABLE_UPDATES_CHECK: 'true'
				}
			}
		)
	}

	process.exit(code)
}

main().catch((e) => {
	process.stderr.write(`[dist:mac] FAILED: ${String(e?.message || e)}\n`)
	process.exit(1)
})
