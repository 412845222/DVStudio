// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

describe('python.mjs: detectPythonInfo cache mechanism', () => {
	let tempDir: string
	let detectPythonInfo: typeof import('../../../electron/backend/python.mjs').detectPythonInfo
	let setPythonDetectCacheDir: typeof import('../../../electron/backend/python.mjs').setPythonDetectCacheDir

	beforeEach(async () => {
		// 重置模块状态以清除内存级缓存变量 _pythonDetectCache
		vi.resetModules()
		tempDir = mkdtempSync(path.join(tmpdir(), 'dweb-py-cache-test-'))
		const mod = await import('../../../electron/backend/python.mjs')
		detectPythonInfo = mod.detectPythonInfo
		setPythonDetectCacheDir = mod.setPythonDetectCacheDir
		setPythonDetectCacheDir(tempDir)
	})

	afterEach(() => {
		try {
			rmSync(tempDir, { recursive: true, force: true })
		} catch {
			/* ignore */
		}
	})

	it('first call should execute detection and not return fromCache', () => {
		const result = detectPythonInfo({ useCache: true })
		expect(result.fromCache).toBeUndefined()
		expect(result).toHaveProperty('ok')
		expect(result).toHaveProperty('meetsRequirement')
		expect(result).toHaveProperty('detail')
	})

	it('second call should hit cache and return fromCache: true', () => {
		const first = detectPythonInfo({ useCache: true })
		const second = detectPythonInfo({ useCache: true })
		expect(second.fromCache).toBe(true)
		expect(second.ok).toBe(first.ok)
		expect(second.meetsRequirement).toBe(first.meetsRequirement)
		expect(second.detail).toBe(first.detail)
	})

	it('useCache: false should bypass cache even when cache exists', () => {
		// 先填充缓存
		detectPythonInfo({ useCache: true })
		// useCache=false 应该跳过缓存
		const result = detectPythonInfo({ useCache: false })
		expect(result.fromCache).toBeUndefined()
		expect(result).toHaveProperty('ok')
	})

	it('should persist cache file to the custom cache directory', () => {
		detectPythonInfo({ useCache: true })
		const cacheFile = path.join(tempDir, 'python-detect-cache.json')
		expect(existsSync(cacheFile)).toBe(true)
		const raw = JSON.parse(readFileSync(cacheFile, 'utf8'))
		expect(raw).toHaveProperty('timestamp')
		expect(raw).toHaveProperty('platform')
		expect(raw).toHaveProperty('result')
		expect(typeof raw.timestamp).toBe('number')
		expect(raw.platform).toBe(process.platform)
		expect(raw.result).toHaveProperty('ok')
	})

	it('should return cached result with fromCache flag when cache is valid', async () => {
		// 手动写入一个缓存文件
		const cacheFile = path.join(tempDir, 'python-detect-cache.json')
		const fakeResult = {
			ok: true,
			meetsRequirement: true,
			recommended: true,
			isBundled: false,
			command: '/fake/python',
			argsPrefix: [],
			version: '3.11.0',
			detail: 'Python 3.11.0 (fake cached)'
		}
		writeFileSync(
			cacheFile,
			JSON.stringify({
				timestamp: Date.now(),
				platform: process.platform,
				result: fakeResult
			}),
			'utf8'
		)

		// 重新加载模块以清除内存缓存
		vi.resetModules()
		const mod = await import('../../../electron/backend/python.mjs')
		mod.setPythonDetectCacheDir(tempDir)

		const result = mod.detectPythonInfo({ useCache: true })
		expect(result.fromCache).toBe(true)
		expect(result.ok).toBe(true)
		expect(result.command).toBe('/fake/python')
		expect(result.detail).toBe('Python 3.11.0 (fake cached)')
	})

	it('should ignore expired cache (TTL exceeded) and re-detect', async () => {
		// 写入一个过期的缓存（8天前）
		const cacheFile = path.join(tempDir, 'python-detect-cache.json')
		const expiredTimestamp = Date.now() - 8 * 24 * 60 * 60 * 1000 // 8天前，超过7天TTL
		writeFileSync(
			cacheFile,
			JSON.stringify({
				timestamp: expiredTimestamp,
				platform: process.platform,
				result: {
					ok: true,
					meetsRequirement: true,
					detail: 'expired cached result'
				}
			}),
			'utf8'
		)

		vi.resetModules()
		const mod = await import('../../../electron/backend/python.mjs')
		mod.setPythonDetectCacheDir(tempDir)

		const result = mod.detectPythonInfo({ useCache: true })
		// 过期缓存不应命中
		expect(result.fromCache).toBeUndefined()
		expect(result.detail).not.toBe('expired cached result')
	})

	it('should handle corrupted cache file gracefully', async () => {
		const cacheFile = path.join(tempDir, 'python-detect-cache.json')
		writeFileSync(cacheFile, '{ this is not valid json }', 'utf8')

		vi.resetModules()
		const mod = await import('../../../electron/backend/python.mjs')
		mod.setPythonDetectCacheDir(tempDir)

		// 损坏的缓存不应导致崩溃
		const result = mod.detectPythonInfo({ useCache: true })
		expect(result.fromCache).toBeUndefined()
		expect(result).toHaveProperty('ok')
	})
})
