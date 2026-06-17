import { spawn } from 'node:child_process'
import { cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { zipDirectory } from './utils/archive.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const pythonCommand = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3')

const includeEntries = [
	'src',
	'django-app',
	'samples',
	'electron',
	'public',
	'scripts',
	'package.json',
	'package-lock.json',
	'vite.config.ts',
	'tsconfig.json',
	'tsconfig.node.json',
	'index.html',
	'README.md',
	'LICENSE',
	'.gitignore',
]

const excludedRootEntries = new Set([
	'.git',
	'.github',
	'.vscode',
	'.cloudbase',
	'node_modules',
	'dist',
	'dist-ssr',
	'build',
	'release',
	'docs',
	'aidoc',
	'temp-patch-world-render.ts',
	'dweb-runtime.log',
	'count_lines.py',
])

const excludedNames = new Set([
	'node_modules',
	'.git',
	'.github',
	'.vscode',
	'.cloudbase',
	'.DS_Store',
	'Thumbs.db',
	'__pycache__',
	'.pytest_cache',
	'.mypy_cache',
	'.ruff_cache',
	'.cache',
	'.venv',
	'venv',
	'ENV',
	'env',
	'dist',
	'dist-ssr',
	'release',
	'release-*',
	'docs',
	'aidoc',
])

const excludedExtensions = ['.log', '.tmp', '.temp', '.bak', '.old', '.orig', '.rej', '.patch', '.swp', '.swo']

const djangoExcludedRelativePaths = new Set([
	'db.sqlite3',
	'django_secret_key.txt',
	'media',
	'staticfiles',
	'.dweb_exports',
	'.dweb-deps.lock',
])

const rootMarkdownAllowList = new Set(['README.md', 'LICENSE'])

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

function matchesExcludedExtension(name) {
	return excludedExtensions.some((extension) => name.endsWith(extension))
}

function normalizeRelativePath(relativePath) {
	return relativePath.split(path.sep).join('/')
}

function toWindowsPath(inputPath) {
	return inputPath.split('/').join('\\')
}

function shouldSkipTopLevelEntry(entryName) {
	if (excludedRootEntries.has(entryName)) return true
	if (entryName.endsWith('.md') && !rootMarkdownAllowList.has(entryName)) return true
	return false
}

function shouldSkipGeneralEntry(entryName) {
	if (excludedNames.has(entryName)) return true
	if (matchesExcludedExtension(entryName)) return true
	if (/^release-.*\.(zip|7z)$/i.test(entryName)) return true
	return false
}

function shouldSkipDjangoRelativePath(relativePath) {
	const normalized = normalizeRelativePath(relativePath)
	for (const blocked of djangoExcludedRelativePaths) {
		if (normalized === blocked || normalized.startsWith(`${blocked}/`)) return true
	}
	return false
}

async function copyEntry(sourcePath, destinationPath, context) {
	const entryStat = await stat(sourcePath)
	if (entryStat.isDirectory()) {
		await mkdir(destinationPath, { recursive: true })
		const children = await readdir(sourcePath, { withFileTypes: true })
		for (const child of children) {
			const childSourcePath = path.join(sourcePath, child.name)
			const childDestinationPath = path.join(destinationPath, child.name)
			const childRelativePath = context.relativePath ? path.join(context.relativePath, child.name) : child.name

			if (shouldSkipGeneralEntry(child.name)) continue
			if (context.scope === 'django-app' && shouldSkipDjangoRelativePath(childRelativePath)) continue

			await copyEntry(childSourcePath, childDestinationPath, {
				scope: context.scope,
				relativePath: childRelativePath,
			})
		}
		return
	}

	await mkdir(path.dirname(destinationPath), { recursive: true })
	await cp(sourcePath, destinationPath, { force: true, recursive: false })
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

async function copyFileToRelativeMediaPath(mediaRelativePath, mediaRootSourceDir, mediaRootDestinationDir) {
	const normalized = normalizeRelativePath(mediaRelativePath).replace(/^media\//, '')
	const sourcePath = path.join(mediaRootSourceDir, toWindowsPath(normalized))
	const destinationPath = path.join(mediaRootDestinationDir, toWindowsPath(normalized))
	await mkdir(path.dirname(destinationPath), { recursive: true })
	await cp(sourcePath, destinationPath, { force: true, recursive: false })
}

function extractMediaRelativePath(value) {
	if (typeof value !== 'string') return null
	if (value.includes('/media/')) {
		const mediaIndex = value.indexOf('/media/')
		return value.slice(mediaIndex + '/media/'.length)
	}
	if (value.startsWith('media/')) return value.slice('media/'.length)
	const knownRoots = [
		'blueprint_projects/',
		'aiworkflow_projects/',
		'comfyui_bridge_inputs/',
		'comfyui_bridge_reuse/',
		'component_thumbs/',
		'meshy_outputs/',
		'nanobanana_outputs/',
		'nanobanana_ref_cache/',
		'seedance_outputs/',
		'seedream_outputs/',
		'seedream_ref_cache/',
	]
	for (const root of knownRoots) {
		if (value.startsWith(root)) return value
	}
	return null
}

function collectMediaReferences(value, results) {
	if (typeof value === 'string') {
		const mediaRelativePath = extractMediaRelativePath(value)
		if (mediaRelativePath) results.add(normalizeRelativePath(mediaRelativePath))
		return
	}
	if (Array.isArray(value)) {
		for (const item of value) collectMediaReferences(item, results)
		return
	}
	if (value && typeof value === 'object') {
		for (const nestedValue of Object.values(value)) collectMediaReferences(nestedValue, results)
	}
}

async function getLatestBlueprintProject() {
	const queryScript = [
		'import json, sqlite3',
		'conn = sqlite3.connect(r"DVSResource\\BackendData\\db.sqlite3")',
		'cur = conn.cursor()',
		'table = cur.execute("select count(1) from sqlite_master where type=\'table\' and name=\'comfyui_blueprint_project\'").fetchone()',
		'if not table or int(table[0]) == 0:',
		'    raise SystemExit("Missing table comfyui_blueprint_project in DVSResource/BackendData/db.sqlite3. Please run app setup first.")',
		'row = cur.execute("select id, name, data from comfyui_blueprint_project order by updated_at desc, id desc limit 1").fetchone()',
		'if row is None:',
		'    raise SystemExit("No blueprint project found in DVSResource/BackendData/db.sqlite3")',
		'print(json.dumps({"id": row[0], "name": row[1], "data": row[2]}, ensure_ascii=False))',
	].join('\n')

	const { stdout } = await run(pythonCommand, ['-c', queryScript], { captureOutput: true })
	return JSON.parse(stdout.trim())
}

async function packageSelectedDvsResource(stagingDir) {
	const sourceDvsRoot = path.join(repoRoot, 'DVSResource')
	const sourceBackendDataDir = path.join(sourceDvsRoot, 'BackendData')
	const sourceMediaDir = path.join(sourceBackendDataDir, 'media')
	const destinationDvsRoot = path.join(stagingDir, 'DVSResource')
	const destinationBackendDataDir = path.join(destinationDvsRoot, 'BackendData')
	const destinationMediaDir = path.join(destinationBackendDataDir, 'media')
	const latestProject = await getLatestBlueprintProject()
	const blueprintRelativePath = normalizeRelativePath(latestProject.data)
	const blueprintFilePath = path.join(sourceMediaDir, toWindowsPath(blueprintRelativePath))
	const blueprintJson = JSON.parse(await readFile(blueprintFilePath, 'utf8'))
	const mediaReferences = new Set([blueprintRelativePath])

	collectMediaReferences(blueprintJson, mediaReferences)

	await mkdir(destinationBackendDataDir, { recursive: true })
	await cp(path.join(sourceDvsRoot, 'UserSettings'), path.join(destinationDvsRoot, 'UserSettings'), { recursive: true, force: true })
	await cp(path.join(sourceBackendDataDir, 'db.sqlite3'), path.join(destinationBackendDataDir, 'db.sqlite3'), { force: true, recursive: false })

	for (const mediaRelativePath of mediaReferences) {
		await copyFileToRelativeMediaPath(mediaRelativePath, sourceMediaDir, destinationMediaDir)
	}

	const filterDbScript = [
		'import sqlite3, sys',
		'db_path = sys.argv[1]',
		'keep_project_id = int(sys.argv[2])',
		'conn = sqlite3.connect(db_path)',
		'cur = conn.cursor()',
		'cur.execute("delete from comfyui_blueprint_project where id <> ?", (keep_project_id,))',
		'conn.commit()',
		'conn.close()',
		'vacuum_conn = sqlite3.connect(db_path)',
		'vacuum_conn.execute("VACUUM")',
		'vacuum_conn.close()',
	].join('\n')

	await run(pythonCommand, ['-c', filterDbScript, path.join(destinationBackendDataDir, 'db.sqlite3'), String(latestProject.id)])

	process.stdout.write(`[pack:sample] selected blueprint project: ${latestProject.name} (#${String(latestProject.id)})\n`)
	process.stdout.write(`[pack:sample] selected blueprint data: media/${blueprintRelativePath}\n`)
	process.stdout.write(`[pack:sample] selected media references: ${String(mediaReferences.size)}\n`)
}

async function main() {
	const stamp = formatTimestamp(new Date())
	const outputRoot = path.resolve(repoRoot, 'release-sample')
	const packageName = `dweb-video-studio-sample-${stamp}`
	const stagingDir = path.join(outputRoot, packageName)
	const zipPath = path.join(outputRoot, `${packageName}.zip`)

	await rm(stagingDir, { recursive: true, force: true })
	await rm(zipPath, { force: true })
	await mkdir(stagingDir, { recursive: true })

	for (const entryName of includeEntries) {
		if (shouldSkipTopLevelEntry(entryName)) continue

		const sourcePath = path.join(repoRoot, entryName)
		const destinationPath = path.join(stagingDir, entryName)
		const scope = entryName === 'django-app' ? 'django-app' : entryName
		await copyEntry(sourcePath, destinationPath, { scope, relativePath: '' })
	}

	await packageSelectedDvsResource(stagingDir)

	await zipDirectory({ sourceDir: stagingDir, destinationZip: zipPath })

	process.stdout.write(`[pack:sample] staging dir: ${stagingDir}\n`)
	process.stdout.write(`[pack:sample] zip file: ${zipPath}\n`)
}

main().catch((error) => {
	process.stderr.write(`[pack:sample] FAILED: ${String(error?.message || error)}\n`)
	process.exit(1)
})