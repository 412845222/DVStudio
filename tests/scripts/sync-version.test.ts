// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
	readVersionFromPackageJson,
	readVersionFromElectronConfig,
	updateElectronConfigVersion,
	syncVersion,
} from '../../scripts/sync-version.mjs'

function createTempDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'sync-version-test-'))
}

function writeFile(filePath: string, content: string) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
	fs.writeFileSync(filePath, content, 'utf8')
}

describe('sync-version: readVersionFromPackageJson', () => {
	it('reads version from package.json', () => {
		const dir = createTempDir()
		const pkgPath = path.join(dir, 'package.json')
		writeFile(pkgPath, JSON.stringify({ name: 'test', version: '0.1.5' }))
		expect(readVersionFromPackageJson(pkgPath)).toBe('0.1.5')
		fs.rmSync(dir, { recursive: true })
	})
})

describe('sync-version: readVersionFromElectronConfig', () => {
	it('reads version from electron config', () => {
		const dir = createTempDir()
		const configPath = path.join(dir, 'config.mjs')
		writeFile(configPath, "export const APP_VERSION = '0.1.3'\n")
		const result = readVersionFromElectronConfig(configPath)
		expect(result).not.toBeNull()
		expect(result!.version).toBe('0.1.3')
		fs.rmSync(dir, { recursive: true })
	})

	it('returns null when APP_VERSION not found', () => {
		const dir = createTempDir()
		const configPath = path.join(dir, 'config.mjs')
		writeFile(configPath, 'export const OTHER = 123\n')
		const result = readVersionFromElectronConfig(configPath)
		expect(result).toBeNull()
		fs.rmSync(dir, { recursive: true })
	})
})

describe('sync-version: updateElectronConfigVersion', () => {
	it('replaces version string', () => {
		const content = "export const APP_VERSION = '0.1.3'\n"
		const updated = updateElectronConfigVersion(content, '0.1.5')
		expect(updated).toBe("export const APP_VERSION = '0.1.5'\n")
	})

	it('only replaces the first occurrence', () => {
		const content = "export const APP_VERSION = '0.1.3'\n// version: 0.1.3\n"
		const updated = updateElectronConfigVersion(content, '0.1.5')
		expect(updated).toBe("export const APP_VERSION = '0.1.5'\n// version: 0.1.3\n")
	})
})

describe('sync-version: syncVersion', () => {
	it('syncs version when mismatch', () => {
		const dir = createTempDir()
		const pkgPath = path.join(dir, 'package.json')
		const configPath = path.join(dir, 'electron', 'config.mjs')
		writeFile(pkgPath, JSON.stringify({ name: 'test', version: '0.1.5' }))
		writeFile(configPath, "export const APP_VERSION = '0.1.3'\n")

		const result = syncVersion(pkgPath, configPath)
		expect(result.synced).toBe(true)
		expect(result.from).toBe('0.1.3')
		expect(result.to).toBe('0.1.5')

		const updatedContent = fs.readFileSync(configPath, 'utf8')
		expect(updatedContent).toContain("export const APP_VERSION = '0.1.5'")
		fs.rmSync(dir, { recursive: true })
	})

	it('does nothing when versions match', () => {
		const dir = createTempDir()
		const pkgPath = path.join(dir, 'package.json')
		const configPath = path.join(dir, 'electron', 'config.mjs')
		writeFile(pkgPath, JSON.stringify({ name: 'test', version: '0.1.5' }))
		writeFile(configPath, "export const APP_VERSION = '0.1.5'\n")

		const result = syncVersion(pkgPath, configPath)
		expect(result.synced).toBe(false)
		expect(result.version).toBe('0.1.5')
		fs.rmSync(dir, { recursive: true })
	})

	it('throws when APP_VERSION not found in config', () => {
		const dir = createTempDir()
		const pkgPath = path.join(dir, 'package.json')
		const configPath = path.join(dir, 'electron', 'config.mjs')
		writeFile(pkgPath, JSON.stringify({ name: 'test', version: '0.1.5' }))
		writeFile(configPath, 'export const OTHER = 123\n')

		expect(() => syncVersion(pkgPath, configPath)).toThrow('未找到 APP_VERSION')
		fs.rmSync(dir, { recursive: true })
	})
})
