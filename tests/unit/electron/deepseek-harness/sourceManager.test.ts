// @vitest-environment node
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import {
	normalizeProfile,
	validateRepoUrl,
	canonicalPath
} from '../../../../electron/backend/modules/deepseek-harness/sourceManager.mjs'
import {
	satisfiesNode,
	announcedUrl,
	launchArgs
} from '../../../../electron/backend/modules/deepseek-harness/runtimeAdapter.mjs'

describe('Harness source validation', () => {
	it('rejects credential URLs and unsupported protocols', () => {
		for (const url of [
			'http://example.com/repo',
			'https://user:secret@example.com/repo',
			'https://example.com/repo?token=x',
			'file:///repo'
		])
			expect(() => validateRepoUrl(url)).toThrow()
		expect(validateRepoUrl('https://example.com/MyRepo.git')).toBe('https://example.com/MyRepo.git')
	})
	it('normalizes paths and preserves names without using shell text', async () => {
		const localPath = path.join(os.tmpdir(), 'Harness 中文 space')
		const profile = await normalizeProfile({
			name: '旧源码',
			sourceKind: 'existing',
			localPath,
			port: 3080
		})
		expect(profile.canonicalPath).toBe(await canonicalPath(localPath + path.sep))
		expect(launchArgs(profile)).toContain(path.join(localPath, 'apps/cli/lib/bin.js'))
		await expect(normalizeProfile({ ...profile, port: 0 })).rejects.toThrow()
		await expect(
			normalizeProfile({ ...profile, requestedRef: '--upload-pack=bad' })
		).rejects.toThrow()
	})
	it('accepts the verified Node ranges and fails closed on unknown grammar', () => {
		expect(satisfiesNode('v22.22.0', '^22.19.0 || >=24.0.0')).toBe(true)
		expect(satisfiesNode('v23.0.0', '^22.19.0 || >=24.0.0')).toBe(false)
		expect(satisfiesNode('v20.0.0', '^22.19.0 || >=24.0.0')).toBe(false)
		expect(satisfiesNode('v24.0.0', '^22.19.0 || >=24.0.0')).toBe(true)
		expect(satisfiesNode('v24.0.0', 'unknown')).toBe(false)
	})
	it('accepts only the owned local port in the startup announcement', () => {
		expect(announcedUrl('dsh web: http://evil.example:3080/#token=x', 3080)).toBeNull()
		expect(announcedUrl('dsh web: http://127.0.0.1:3081/', 3080)).toBeNull()
		expect(announcedUrl('other http://127.0.0.1:3080/', 3080)).toBeNull()
		expect(announcedUrl('dsh web: http://127.0.0.1:3080/#token=x', 3080)).toContain('3080')
	})
})
