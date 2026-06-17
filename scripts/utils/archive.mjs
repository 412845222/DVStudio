import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import path from 'node:path'

function run(command, args, { cwd } = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			stdio: 'inherit',
			shell: false,
			windowsHide: true,
		})

		child.once('error', reject)
		child.once('exit', (code) => {
			if (code === 0) {
				resolve()
				return
			}
			reject(new Error(`${command} exited with code ${String(code)}`))
		})
	})
}

export async function zipDirectory({ sourceDir, destinationZip }) {
	const src = path.resolve(String(sourceDir || ''))
	const dst = path.resolve(String(destinationZip || ''))
	if (!src || !dst) throw new Error('zipDirectory requires sourceDir and destinationZip')

	await rm(dst, { force: true })

	if (process.platform === 'win32') {
		const script = [
			"$ErrorActionPreference = 'Stop'",
			`Compress-Archive -Path '${src.replace(/'/g, "''")}' -DestinationPath '${dst.replace(/'/g, "''")}' -Force`,
		].join('; ')
		await run('powershell', ['-NoProfile', '-Command', script])
		return
	}

	const parentDir = path.dirname(src)
	const baseName = path.basename(src)

	if (process.platform === 'darwin') {
		await run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', baseName, dst], { cwd: parentDir })
		return
	}

	await run('zip', ['-r', dst, baseName], { cwd: parentDir })
}
