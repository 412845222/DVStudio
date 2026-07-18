import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { getProjectRootById } from './projectAssetProtocol.mjs'

function parseDwebAssetUrl(rawUrl) {
	const text = String(rawUrl || '').trim()
	if (!text) return null
	let u
	try {
		u = new URL(text)
	} catch {
		return null
	}
	if (String(u.protocol || '').toLowerCase() !== 'dweb:') return null
	if (String(u.hostname || '').toLowerCase() !== 'project-assets') return null
	const projectIdRaw = String(u.searchParams.get('projectId') || '').trim()
	const relPathRaw = String(u.searchParams.get('path') || '').trim()
	if (!projectIdRaw || !relPathRaw) return null
	const projectId = Number(projectIdRaw)
	if (!Number.isFinite(projectId) || projectId <= 0) return null
	return { projectId: Math.floor(projectId), relPath: relPathRaw }
}

function safeResolveProjectFile(root, relPath) {
	const rootStr = String(root || '').trim()
	if (!rootStr) return null
	const rel = String(relPath || '').trim().replace(/\\/g, '/')
	if (!rel || rel.startsWith('/') || rel.includes('..')) return null
	try {
		const normalized = path.resolve(rootStr, ...rel.split('/').filter((seg) => seg && seg !== '.'))
		const resolvedRoot = path.resolve(rootStr)
		const normalizedNorm = path.normalize(normalized)
		const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep
		const isInside =
			normalizedNorm === resolvedRoot ||
			normalizedNorm.startsWith(rootWithSep) ||
			(process.platform === 'win32' && normalizedNorm.toLowerCase().startsWith(rootWithSep.toLowerCase()))
		if (!isInside) return null
		return normalized
	} catch {
		return null
	}
}

function resolveVideoPath(dwebUrl) {
	const parsed = parseDwebAssetUrl(dwebUrl)
	if (!parsed) return { ok: false, error: 'invalid dweb:// URL' }
	const root = getProjectRootById(parsed.projectId)
	if (!root) return { ok: false, error: `project root not registered for projectId=${parsed.projectId}` }

	const candidates = new Set()
	const rel = parsed.relPath.replace(/\\/g, '/')
	candidates.add(rel)
	const parts = rel.split('/').filter((p) => p && p !== '.')
	if (parts.length >= 1) {
		const fileName = parts[parts.length - 1]
		candidates.add('Content/Media/' + fileName)
		candidates.add('Content/Media/' + rel)
	}
	if (rel.startsWith('Content/Media/')) {
		candidates.add(rel.slice('Content/Media/'.length))
	}

	let filePath = null
	for (const candidate of candidates) {
		const resolved = safeResolveProjectFile(root, candidate)
		if (resolved && fs.existsSync(resolved)) {
			try {
				const st = fs.statSync(resolved)
				if (st.isFile()) {
					filePath = resolved
					break
				}
			} catch {}
		}
	}

	if (!filePath) {
		const mediaDir = path.resolve(root, 'Content', 'Media')
		const basename = path.basename(parts[parts.length - 1] || '')
		if (basename && fs.existsSync(mediaDir)) {
			try {
				const found = findFileRecursive(mediaDir, basename)
				if (found) filePath = found
			} catch {}
		}
	}

	if (!filePath) return { ok: false, error: 'video file not found in project' }
	return { ok: true, filePath }
}

function findFileRecursive(dir, targetName) {
	if (!dir || !fs.existsSync(dir)) return null
	const skipDirs = new Set(['node_modules', '.git', '__pycache__', '.venv', '.dvcache'])
	let entries
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true })
	} catch {
		return null
	}
	for (const entry of entries) {
		const full = path.resolve(dir, entry.name)
		if (entry.isFile()) {
			if (entry.name.toLowerCase() === targetName.toLowerCase()) return full
		} else if (entry.isDirectory() && !skipDirs.has(entry.name)) {
			const found = findFileRecursive(full, targetName)
			if (found) return found
		}
	}
	return null
}

async function probeVideoDuration(filePath) {
	return new Promise((resolve) => {
		const proc = spawn('ffmpeg', ['-i', filePath, '-hide_banner'], {
			windowsHide: true,
			stdio: ['ignore', 'ignore', 'pipe']
		})
		let stderr = ''
		proc.stderr?.on('data', (d) => { stderr += String(d) })
		proc.on('error', () => resolve(null))
		proc.on('exit', () => {
			const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
			if (!match) { resolve(null); return }
			const h = parseInt(match[1], 10)
			const m = parseInt(match[2], 10)
			const s = parseFloat(match[3])
			resolve(h * 3600 + m * 60 + s)
		})
	})
}

export async function generateFilmstrip(dwebUrl, options = {}) {
	const resolved = resolveVideoPath(dwebUrl)
	if (!resolved.ok) {
		return { ok: false, error: resolved.error }
	}
	const filePath = resolved.filePath

	const duration = await probeVideoDuration(filePath)
	if (!duration || duration <= 0) {
		return { ok: false, error: 'failed to probe video duration' }
	}

	const thumbWidth = options.thumbWidth || 240
	const columns = options.columns || 10
	const intervalSec = options.intervalSec || Math.max(0.2, Math.min(1.0, duration / 50))
	const fps = 1 / intervalSec
	const totalFrames = Math.max(1, Math.ceil(duration / intervalSec))
	const rows = Math.max(1, Math.ceil(totalFrames / columns))

	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvs-film-'))
	const outPath = path.join(tmpDir, 'sprite.jpg')

	const filter = `fps=${fps},scale=${thumbWidth}:-1,tile=${columns}x${rows}`
	const args = [
		'-y',
		'-i', filePath,
		'-vf', filter,
		'-frames:v', '1',
		'-q:v', '5',
		'-f', 'image2',
		outPath
	]

	return new Promise((resolve) => {
		const proc = spawn('ffmpeg', args, {
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe']
		})
		let stderr = ''
		proc.stderr?.on('data', (d) => { stderr += String(d) })
		let killed = false
		const timeout = setTimeout(() => {
			killed = true
			try { proc.kill() } catch {}
			cleanup()
			resolve({ ok: false, error: 'ffmpeg timeout' })
		}, 30000)

		const cleanup = () => {
			clearTimeout(timeout)
			try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
		}

		proc.on('error', (err) => {
			if (killed) return
			cleanup()
			resolve({ ok: false, error: 'ffmpeg spawn failed: ' + String(err?.message || err) })
		})

		proc.on('exit', (code) => {
			if (killed) return
			clearTimeout(timeout)
			if (code !== 0) {
				cleanup()
				resolve({ ok: false, error: 'ffmpeg exit code ' + code, stderr: stderr.slice(-500) })
				return
			}
			try {
				if (!fs.existsSync(outPath)) {
					cleanup()
					resolve({ ok: false, error: 'sprite file not generated' })
					return
				}
				const buf = fs.readFileSync(outPath)
				const base64 = buf.toString('base64')
				const dataUrl = 'data:image/jpeg;base64,' + base64
				cleanup()
				resolve({
					ok: true,
					spriteDataUrl: dataUrl,
					frameIntervalSec: intervalSec,
					thumbWidth,
					columns,
					rows,
					totalFrames,
					durationSec: duration
				})
			} catch (err) {
				cleanup()
				resolve({ ok: false, error: 'failed to read sprite: ' + String(err?.message || err) })
			}
		})
	})
}

export async function checkFfmpegAvailable() {
	return new Promise((resolve) => {
		try {
			const proc = spawn('ffmpeg', ['-version'], {
				windowsHide: true,
				stdio: ['ignore', 'pipe', 'pipe']
			})
			let stdout = ''
			const timeout = setTimeout(() => {
				try { proc.kill() } catch {}
				resolve(false)
			}, 5000)
			proc.stdout?.on('data', (d) => { stdout += String(d) })
			proc.on('error', () => {
				clearTimeout(timeout)
				resolve(false)
			})
			proc.on('exit', (code) => {
				clearTimeout(timeout)
				resolve(code === 0 && stdout.length > 0)
			})
		} catch {
			resolve(false)
		}
	})
}
