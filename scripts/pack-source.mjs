import { spawn } from 'node:child_process'
import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { zipDirectory } from './utils/archive.mjs'

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
		pad(date.getSeconds()),
	].join('')
}

function run(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: repoRoot,
			stdio: options.captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
			shell: false,
			windowsHide: true,
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
			reject(new Error(output ? `${command} exited with code ${String(code)}: ${output}` : `${command} exited with code ${String(code)}`))
		})
	})
}

async function listPackFiles() {
	const { stdout } = await run('git', ['ls-files', '-c', '-o', '--exclude-standard', '-z'], { captureOutput: true })
	return stdout
		.split('\u0000')
		.map((item) => item.trim())
		.filter(Boolean)
		.filter((item) => !item.startsWith('release-source/'))
}

async function copyFilesToStaging(files, stagingDir) {
	for (const relativeFilePath of files) {
		const sourcePath = path.join(repoRoot, relativeFilePath)
		const destinationPath = path.join(stagingDir, relativeFilePath)
		try {
			await mkdir(path.dirname(destinationPath), { recursive: true })
			await cp(sourcePath, destinationPath, { force: true, recursive: false })
		} catch (error) {
			if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
				process.stdout.write(`[pack:source] skip missing file: ${relativeFilePath}\n`)
				continue
			}
			throw error
		}
	}
}

async function main() {
	const stamp = formatTimestamp(new Date())
	const outputRoot = path.resolve(repoRoot, 'release-source')
	const packageName = `dweb-video-studio-source-${stamp}`
	const stagingDir = path.join(outputRoot, packageName)
	const zipPath = path.join(outputRoot, `${packageName}.zip`)

	await rm(stagingDir, { recursive: true, force: true })
	await rm(zipPath, { force: true })
	await mkdir(stagingDir, { recursive: true })

	const files = await listPackFiles()
	if (files.length === 0) {
		throw new Error('No files matched current gitignore rules for packaging.')
	}

	await copyFilesToStaging(files, stagingDir)

	await zipDirectory({ sourceDir: stagingDir, destinationZip: zipPath })

	process.stdout.write(`[pack:source] total files: ${String(files.length)}\n`)
	process.stdout.write(`[pack:source] staging dir: ${stagingDir}\n`)
	process.stdout.write(`[pack:source] zip file: ${zipPath}\n`)
}

main().catch((error) => {
	process.stderr.write(`[pack:source] FAILED: ${String(error?.message || error)}\n`)
	process.exit(1)
})