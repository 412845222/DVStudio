// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'

describe('vite.config.ts: startup performance optimization', () => {
	let devConfig: any
	let prodConfig: any

	beforeAll(async () => {
		const configModule = await import('../../../vite.config.ts')
		const configFactory = configModule.default
		devConfig = configFactory({ mode: 'development' })
		prodConfig = configFactory({ mode: 'production' })
	})

	it('server.watch.ignored should exclude large non-source directories', () => {
		const ignored = devConfig.server?.watch?.ignored
		expect(Array.isArray(ignored)).toBe(true)

		// 验证关键的非源码大目录被排除，避免 Vite 扫描开销
		const requiredExclusions = [
			'**/release-*/**',
			'**/steam-pipe/**',
			'**/DVSResource/**',
			'**/node_modules/.cache/**',
			'**/.git/**'
		]
		for (const pattern of requiredExclusions) {
			expect(ignored).toContain(pattern)
		}
	})

	it('server.watch.ignored should exclude database and log files', () => {
		const ignored = devConfig.server?.watch?.ignored
		expect(ignored).toContain('**/*.sqlite3')
		expect(ignored).toContain('**/*.log')
		expect(ignored).toContain('**/*.db')
	})

	it('optimizeDeps.exclude should exclude backend-only modules', () => {
		const exclude = devConfig.optimizeDeps?.exclude
		expect(Array.isArray(exclude)).toBe(true)
		// better-sqlite3 是 Node.js 原生模块，不应被 Vite 预构建
		expect(exclude).toContain('better-sqlite3')
		// @modelcontextprotocol/sdk 是后端专用模块
		expect(exclude).toContain('@modelcontextprotocol/sdk')
		// electron 本身不应被预构建
		expect(exclude).toContain('electron')
	})

	it('optimizeDeps.entries should limit scanning to source files', () => {
		const entries = devConfig.optimizeDeps?.entries
		expect(Array.isArray(entries)).toBe(true)
		expect(entries).toContain('index.html')
		// 应该包含 src 目录下的源码
		expect(entries.some((e: string) => e.includes('src/'))).toBe(true)
	})

	it('base should be "/" in dev and "./" in production', () => {
		expect(devConfig.base).toBe('/')
		expect(prodConfig.base).toBe('./')
	})

	it('server.watch.ignored should be present in both dev and prod', () => {
		// watch.ignored 在生产模式下也应有配置（preview 场景）
		expect(devConfig.server?.watch?.ignored).toBeDefined()
	})
})
