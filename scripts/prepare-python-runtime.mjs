import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import https from 'node:https'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'

const PYTHON_VERSION = '3.11.9'
const PYTHON_EMBED_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`
const PYTHON_ZIP_FILENAME = `python-${PYTHON_VERSION}-embed-amd64.zip`
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py'
const GET_PIP_FILENAME = 'get-pip.py'

const REPO_ROOT = path.resolve(process.cwd())
const RUNTIME_DIR = path.resolve(REPO_ROOT, 'electron', 'static', 'runtime')
const PYTHON_RUNTIME_DIR = path.resolve(RUNTIME_DIR, 'python-win32-x64')
const TEMP_DIR = path.resolve(RUNTIME_DIR, '_tmp')
const CACHE_DIR = path.resolve(REPO_ROOT, 'python-runtime')

function log(msg) {
	process.stdout.write(`[prepare-python] ${msg}\n`)
}

function ensureDir(dir) {
	fs.mkdirSync(dir, { recursive: true })
}

function findCachedFile(filename) {
	const searchPaths = [
		path.resolve(CACHE_DIR, filename),
		path.resolve(TEMP_DIR, filename),
		path.resolve(REPO_ROOT, filename)
	]
	for (const p of searchPaths) {
		if (fs.existsSync(p) && fs.statSync(p).size > 0) {
			log(`Using cached file: ${path.relative(REPO_ROOT, p)}`)
			return p
		}
	}
	return null
}

function downloadFile(url, destPath, filename) {
	return new Promise((resolve, reject) => {
		const cachedPath = findCachedFile(filename)
		if (cachedPath) {
			if (cachedPath !== destPath) {
				ensureDir(path.dirname(destPath))
				fs.copyFileSync(cachedPath, destPath)
				log(`Copied from cache to ${path.relative(REPO_ROOT, destPath)}`)
			}
			resolve(destPath)
			return
		}

		log(`Downloading ${url}...`)
		const tempPath = `${destPath}.downloading`
		ensureDir(path.dirname(destPath))
		ensureDir(CACHE_DIR)

		function get(currentUrl, redirectCount = 0) {
			if (redirectCount > 10) {
				reject(new Error('Too many redirects'))
				return
			}
			https
				.get(currentUrl, (res) => {
					if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
						res.resume()
						get(new URL(res.headers.location, currentUrl).toString(), redirectCount + 1)
						return
					}
					if (res.statusCode !== 200) {
						res.resume()
						reject(new Error(`Download failed: HTTP ${res.statusCode} for ${currentUrl}`))
						return
					}
					const file = createWriteStream(tempPath)
					pipeline(res, file)
						.then(() => {
							fs.renameSync(tempPath, destPath)
							try {
								const cacheDest = path.resolve(CACHE_DIR, filename)
								fs.copyFileSync(destPath, cacheDest)
								log(`Downloaded and cached to ${path.relative(REPO_ROOT, cacheDest)}`)
							} catch {
								log(`Downloaded to ${path.relative(REPO_ROOT, destPath)} (cache copy skipped)`)
							}
							resolve(destPath)
						})
						.catch((err) => {
							try {
								fs.unlinkSync(tempPath)
							} catch {}
							reject(err)
						})
				})
				.on('error', (err) => {
					try {
						fs.unlinkSync(tempPath)
					} catch {}
					reject(err)
				})
		}

		get(url)
	})
}

function extractZip(zipPath, destDir) {
	log(`Extracting ${path.basename(zipPath)}...`)
	ensureDir(destDir)
	const psCommand = `
		$ErrorActionPreference = 'Stop'
		if (Test-Path '${destDir.replace(/'/g, "''")}') {
			Get-ChildItem '${destDir.replace(/'/g, "''")}' -Recurse | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
		}
		Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force
	`
	const result = spawnSync(
		'powershell',
		['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand],
		{
			stdio: 'inherit',
			windowsHide: true
		}
	)
	if (result.status !== 0) {
		throw new Error(`Failed to extract zip: exit code ${result.status}`)
	}
}

function runCommand(cmd, args, options = {}) {
	log(`Running: ${path.basename(cmd)} ${args.join(' ')}`)
	const result = spawnSync(cmd, args, {
		stdio: 'inherit',
		windowsHide: true,
		...options
	})
	if (result.status !== 0) {
		throw new Error(
			`Command failed: ${path.basename(cmd)} ${args.join(' ')} (exit code ${result.status})`
		)
	}
	return result
}

function findFileBySuffix(dir, suffix) {
	if (!fs.existsSync(dir)) return null
	const files = fs.readdirSync(dir)
	for (const f of files) {
		if (f.endsWith(suffix)) return path.resolve(dir, f)
	}
	return null
}

function configurePythonRuntime(pythonDir) {
	log('Configuring embedded Python...')

	const libDir = path.resolve(pythonDir, 'Lib')
	const sitePackagesDir = path.resolve(libDir, 'site-packages')
	ensureDir(sitePackagesDir)

	const pthFile = findFileBySuffix(pythonDir, '._pth')
	if (pthFile) {
		const zipFile = findFileBySuffix(pythonDir, '.zip')
		const pthLines = [
			path.basename(zipFile || 'python311.zip'),
			'.',
			'Lib',
			path.join('Lib', 'site-packages'),
			'',
			'import site',
			''
		]
		fs.writeFileSync(pthFile, pthLines.join('\n'), 'utf-8')
		log(`Configured ${path.basename(pthFile)} for pip installation`)
	}
}

function finalizePythonRuntime(pythonDir) {
	log('Finalizing Python runtime for portable use...')

	const pthFile = findFileBySuffix(pythonDir, '._pth')
	if (pthFile) {
		try {
			fs.unlinkSync(pthFile)
			log(`Removed ${path.basename(pthFile)} (enables normal Python path resolution)`)
		} catch (err) {
			log(`Warning: Could not remove ._pth file: ${err.message}`)
		}
	}
}

function cleanRuntime(pythonDir) {
	log('Cleaning up cache files...')
	const dirsToDelete = ['__pycache__']
	const extsToDelete = ['.pyc', '.pyo']

	function walk(dir) {
		if (!fs.existsSync(dir)) return
		let entries = []
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true })
		} catch {
			return
		}
		for (const ent of entries) {
			const full = path.resolve(dir, ent.name)
			if (ent.isDirectory()) {
				if (dirsToDelete.includes(ent.name)) {
					try {
						fs.rmSync(full, { recursive: true, force: true })
					} catch {}
				} else {
					walk(full)
				}
			} else if (ent.isFile()) {
				for (const ext of extsToDelete) {
					if (ent.name.endsWith(ext)) {
						try {
							fs.unlinkSync(full)
						} catch {}
						break
					}
				}
			}
		}
	}
	walk(pythonDir)
}

async function main() {
	const args = process.argv.slice(2)
	const force = args.includes('--force')

	log(`Preparing Python ${PYTHON_VERSION} runtime for Windows x64...`)
	log(`Target directory: ${path.relative(REPO_ROOT, PYTHON_RUNTIME_DIR)}`)
	log(`Cache directory: ${path.relative(REPO_ROOT, CACHE_DIR)}`)

	ensureDir(RUNTIME_DIR)
	ensureDir(TEMP_DIR)
	ensureDir(CACHE_DIR)

	const pythonExe = path.resolve(PYTHON_RUNTIME_DIR, 'python.exe')
	const markerFile = path.resolve(PYTHON_RUNTIME_DIR, '.dweb-prepared')

	if (!force && fs.existsSync(pythonExe) && fs.existsSync(markerFile)) {
		log('Python runtime already prepared. Use --force to rebuild.')
		process.exit(0)
	}

	if (process.platform !== 'win32') {
		log(
			'Warning: Python runtime preparation is only needed for Windows packaging. Skipping on non-Windows platform.'
		)
		process.exit(0)
	}

	if (fs.existsSync(PYTHON_RUNTIME_DIR)) {
		log('Removing existing Python runtime...')
		fs.rmSync(PYTHON_RUNTIME_DIR, { recursive: true, force: true })
	}

	const zipPath = path.resolve(TEMP_DIR, PYTHON_ZIP_FILENAME)
	const getPipPath = path.resolve(TEMP_DIR, GET_PIP_FILENAME)

	try {
		await downloadFile(PYTHON_EMBED_URL, zipPath, PYTHON_ZIP_FILENAME)
		await downloadFile(GET_PIP_URL, getPipPath, GET_PIP_FILENAME)

		extractZip(zipPath, PYTHON_RUNTIME_DIR)
		configurePythonRuntime(PYTHON_RUNTIME_DIR)

		log('Installing pip...')
		runCommand(pythonExe, [getPipPath, '--no-warn-script-location'], { cwd: PYTHON_RUNTIME_DIR })

		const requirementsPath = path.resolve(REPO_ROOT, 'django-app', 'requirements.txt')
		if (fs.existsSync(requirementsPath)) {
			log('Installing requirements from django-app/requirements.txt...')
			runCommand(
				pythonExe,
				[
					'-m',
					'pip',
					'install',
					'--no-warn-script-location',
					'--no-cache-dir',
					'-r',
					requirementsPath
				],
				{ cwd: PYTHON_RUNTIME_DIR }
			)
		} else {
			log('Warning: requirements.txt not found, installing minimal dependencies...')
			runCommand(
				pythonExe,
				[
					'-m',
					'pip',
					'install',
					'--no-warn-script-location',
					'--no-cache-dir',
					'Django==4.2.11',
					'djangorestframework==3.14.0',
					'django-cors-headers==4.4.0',
					'cryptography==42.0.8',
					'Pillow>=10.4.0',
					'certifi>=2024.0.0'
				],
				{ cwd: PYTHON_RUNTIME_DIR }
			)
		}

		finalizePythonRuntime(PYTHON_RUNTIME_DIR)

		cleanRuntime(PYTHON_RUNTIME_DIR)

		fs.writeFileSync(
			markerFile,
			`Prepared at ${new Date().toISOString()}\nPython ${PYTHON_VERSION}\n`,
			'utf-8'
		)

		log('Python runtime preparation complete!')
	} catch (err) {
		log(`ERROR: ${err.message}`)
		console.error(err)
		if (fs.existsSync(PYTHON_RUNTIME_DIR)) {
			try {
				fs.rmSync(PYTHON_RUNTIME_DIR, { recursive: true, force: true })
			} catch {}
		}
		process.exit(1)
	} finally {
		try {
			fs.rmSync(TEMP_DIR, { recursive: true, force: true })
		} catch {}
	}
}

main().catch((err) => {
	console.error('Fatal error:', err)
	process.exit(1)
})
