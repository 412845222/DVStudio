import { spawn } from 'node:child_process'
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { zipDirectory } from './utils/archive.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const args = new Set(process.argv.slice(2))
const includeDvsResource = args.has('--include-dvs-resource')
const dryRun = args.has('--dry-run')

const excludedRootEntries = new Set([
	'node_modules',
	'dist',
	'dist-ssr',
	'build',
	'release',
	'release-source',
	'release-sample',
	'release-transfer',
	'.venv',
	'venv',
	'ENV',
	'env',
	'.cache',
	'.idea',
	'.vscode',
	'.cloudbase',
])

const excludedDirectoryNames = new Set([
	'node_modules',
	'dist',
	'dist-ssr',
	'build',
	'release',
	'release-source',
	'release-sample',
	'release-transfer',
	'.venv',
	'venv',
	'ENV',
	'env',
	'.cache',
	'__pycache__',
	'.pytest_cache',
	'.mypy_cache',
	'.ruff_cache',
	'staticfiles',
	'media',
	'.dweb_exports',
])

const excludedFileExtensions = new Set(['.log', '.tmp', '.temp', '.bak', '.old', '.orig', '.rej', '.patch', '.swp', '.swo', '.zip', '.7z'])

const excludedFileNames = new Set([
	'.dweb-deps.lock',
	'Thumbs.db',
	'Desktop.ini',
	'.DS_Store',
])

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

function normalizeRelativePath(relativePath) {
	return relativePath.split(path.sep).join('/')
}

function shouldSkipRootEntry(entryName) {
	if (entryName === '.git') return false
	if (entryName === 'DVSResource' && includeDvsResource) return false
	if (entryName === 'DVSResource') return true
	if (/^release-.*$/i.test(entryName)) return true
	return excludedRootEntries.has(entryName)
}

function shouldSkipDirectory(entryName, relativePath) {
	if (relativePath === '.git') return false
	if (relativePath.startsWith('.git/')) return false
	if (relativePath === 'DVSResource' && includeDvsResource) return false
	if (relativePath.startsWith('DVSResource/') && includeDvsResource) return false
	if (excludedDirectoryNames.has(entryName)) return true
	if (/^release-.*$/i.test(entryName)) return true
	return false
}

function shouldSkipFile(entryName, relativePath) {
	if (relativePath.startsWith('.git/')) return false
	if (relativePath.startsWith('DVSResource/') && includeDvsResource) return false
	if (excludedFileNames.has(entryName)) return true
	const extension = path.extname(entryName).toLowerCase()
	if (excludedFileExtensions.has(extension)) return true
	if (/^release-.*\.(zip|7z)$/i.test(entryName)) return true
	return false
}

function run(command, argsList, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, argsList, {
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

async function getGitMetadata() {
	const [{ stdout: branch }, { stdout: head }, { stdout: status }] = await Promise.all([
		run('git', ['branch', '--show-current'], { captureOutput: true }),
		run('git', ['rev-parse', 'HEAD'], { captureOutput: true }),
		run('git', ['status', '--short'], { captureOutput: true }),
	])

	return {
		branch: branch.trim() || '(detached)',
		head: head.trim(),
		isClean: status.trim().length === 0,
	}
}

async function collectFiles(sourceDir, relativeDir = '') {
	const entries = await readdir(sourceDir, { withFileTypes: true })
	const files = []

	for (const entry of entries) {
		const entryRelativePath = normalizeRelativePath(path.join(relativeDir, entry.name))
		const sourcePath = path.join(sourceDir, entry.name)

		if (entry.isDirectory()) {
			if (!relativeDir && shouldSkipRootEntry(entry.name)) continue
			if (shouldSkipDirectory(entry.name, entryRelativePath)) continue
			files.push(...(await collectFiles(sourcePath, entryRelativePath)))
			continue
		}

		if (shouldSkipFile(entry.name, entryRelativePath)) continue
		files.push(entryRelativePath)
	}

	return files.sort((left, right) => left.localeCompare(right))
}

async function copyFilesToStaging(files, stagingDir) {
	for (const relativeFilePath of files) {
		const sourcePath = path.join(repoRoot, relativeFilePath)
		const destinationPath = path.join(stagingDir, relativeFilePath)
		await mkdir(path.dirname(destinationPath), { recursive: true })
		await cp(sourcePath, destinationPath, { force: true, recursive: false })
	}
}

async function writeManifest(stagingDir, metadata, files, packageName) {
	const manifestPath = path.join(stagingDir, 'TRANSFER_MANIFEST.txt')
	const lines = [
		'Dweb Video Studio LAN transfer package',
		`Package: ${packageName}`,
		`CreatedAt: ${new Date().toISOString()}`,
		`Branch: ${metadata.branch}`,
		`Head: ${metadata.head}`,
		`WorkingTreeClean: ${metadata.isClean ? 'yes' : 'no'}`,
		`IncludeDVSResource: ${includeDvsResource ? 'yes' : 'no'}`,
		`TotalFiles: ${String(files.length)}`,
		'',
		'Restore steps on target machine:',
		'1. Unzip the archive to the destination folder.',
		'2. Run git status and git branch --show-current to verify repository state.',
		'3. Run npm install to restore frontend dependencies.',
		'4. If needed, install Python dependencies for django-app separately.',
	]
	await writeFile(manifestPath, `${lines.join('\n')}\n`, 'utf8')
}

async function main() {
	const stamp = formatTimestamp(new Date())
	const outputRoot = path.resolve(repoRoot, 'release-transfer')
	const packageName = `dweb-video-studio-lan-transfer-${stamp}`
	const stagingDir = path.join(outputRoot, packageName)
	const zipPath = path.join(outputRoot, `${packageName}.zip`)

	const metadata = await getGitMetadata()
	const files = await collectFiles(repoRoot)

	if (files.length === 0) {
		throw new Error('No files matched current LAN transfer rules.')
	}

	process.stdout.write(`[pack:lan] branch: ${metadata.branch}\n`)
	process.stdout.write(`[pack:lan] head: ${metadata.head}\n`)
	process.stdout.write(`[pack:lan] working tree clean: ${metadata.isClean ? 'yes' : 'no'}\n`)
	process.stdout.write(`[pack:lan] include DVSResource: ${includeDvsResource ? 'yes' : 'no'}\n`)
	process.stdout.write(`[pack:lan] total files: ${String(files.length)}\n`)

	if (dryRun) {
		process.stdout.write('[pack:lan] dry-run enabled, no files were copied.\n')
		process.stdout.write(`[pack:lan] first files: ${files.slice(0, 20).join(', ')}\n`)
		return
	}

	await rm(stagingDir, { recursive: true, force: true })
	await rm(zipPath, { force: true })
	await mkdir(stagingDir, { recursive: true })

	await copyFilesToStaging(files, stagingDir)
	await writeManifest(stagingDir, metadata, files, packageName)

	await zipDirectory({ sourceDir: stagingDir, destinationZip: zipPath })

	process.stdout.write(`[pack:lan] staging dir: ${stagingDir}\n`)
	process.stdout.write(`[pack:lan] zip file: ${zipPath}\n`)
	process.stdout.write('[pack:lan] target machine should run: git status, npm install\n')
	if (!includeDvsResource) {
		process.stdout.write('[pack:lan] note: DVSResource was excluded. Re-run with --include-dvs-resource if you need local runtime assets.\n')
	}
}

main().catch((error) => {
	process.stderr.write(`[pack:lan] FAILED: ${String(error?.message || error)}\n`)
	process.exit(1)
})