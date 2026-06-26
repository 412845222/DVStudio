import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

function formatTimestamp(date) {
	const pad = (value) => String(value).padStart(2, '0')
	return [
		date.getFullYear(),
		pad(date.getMonth() + 1),
		pad(date.getDate()),
		'-',
		pad(date.getHours()),
		pad(date.getMinutes()),
		pad(date.getSeconds())
	].join('')
}

function run(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: repoRoot,
			stdio: options.captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
			shell: false,
			windowsHide: true
		})

		let stdout = ''
		let stderr = ''
		if (options.captureOutput) {
			child.stdout?.on('data', (chunk) => {
				stdout += String(chunk)
			})
			child.stderr?.on('data', (chunk) => {
				stderr += String(chunk)
			})
		}

		child.once('error', reject)
		child.once('exit', (code) => {
			if (code === 0) {
				resolve({ stdout, stderr })
				return
			}
			const output = stderr.trim() || stdout.trim()
			reject(
				new Error(
					output
						? `${command} exited with code ${String(code)}: ${output}`
						: `${command} exited with code ${String(code)}`
				)
			)
		})
	})
}

async function main() {
	const outputRoot = path.resolve(repoRoot, 'release-transfer')
	const stamp = formatTimestamp(new Date())
	const bundlePath = path.join(outputRoot, `dweb-video-studio-repo-${stamp}.bundle`)

	await mkdir(outputRoot, { recursive: true })
	await run('git', ['bundle', 'create', bundlePath, '--all'])

	process.stdout.write(`[pack:git-bundle] bundle file: ${bundlePath}\n`)
	process.stdout.write('[pack:git-bundle] restore on target: git clone <bundle-file> <folder>\n')
	process.stdout.write(
		'[pack:git-bundle] note: ignored local files such as django-app/db.sqlite3 must be copied separately if needed.\n'
	)
}

main().catch((error) => {
	process.stderr.write(`[pack:git-bundle] FAILED: ${String(error?.message || error)}\n`)
	process.exit(1)
})
