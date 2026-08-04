import { describe, it, expect } from 'vitest'
import {
	exportProjectJsonV1,
	createEmptyManifestV1,
	exportProjectPackageV1,
	stringifyProjectJson,
	stringifyProjectPackageV1,
	parseProjectJsonV1,
	parseProjectManifestV1,
	parseProjectPackageV1
} from '@/core/project/package/serialize'
import type { EditorSnapshot } from '@/core/editor/types'

const createMockSnapshot = (): EditorSnapshot => ({
	videoScene: {
		layers: [],
		activeLayerId: '',
		imageAssets: {}
	},
	videoStudio: {
		projectId: 'test-project',
		title: 'Test Project',
		lastSaved: Date.now()
	},
	timeline: {
		duration: 5000,
		spans: []
	}
})

describe('serialize', () => {
	describe('exportProjectJsonV1', () => {
		it('exports snapshot with schema version', () => {
			const snapshot = createMockSnapshot()
			const json = exportProjectJsonV1(snapshot)
			expect(json.schemaVersion).toBe(1)
			expect(json.snapshot).toBe(snapshot)
			expect(json.createdAt).toBeLessThanOrEqual(Date.now())
		})

		it('uses provided createdAt timestamp', () => {
			const snapshot = createMockSnapshot()
			const timestamp = 1700000000000
			const json = exportProjectJsonV1(snapshot, timestamp)
			expect(json.createdAt).toBe(timestamp)
		})
	})

	describe('createEmptyManifestV1', () => {
		it('creates empty manifest with schema version 1', () => {
			const manifest = createEmptyManifestV1()
			expect(manifest.schemaVersion).toBe(1)
			expect(manifest.assets).toEqual({})
		})
	})

	describe('exportProjectPackageV1', () => {
		it('exports package with snapshot, manifest, and assets', () => {
			const snapshot = createMockSnapshot()
			const pkg = exportProjectPackageV1(snapshot)
			expect(pkg.project.schemaVersion).toBe(1)
			expect(pkg.manifest.schemaVersion).toBe(1)
			expect(pkg.assets.files).toEqual({})
		})

		it('uses provided manifest and assets', () => {
			const snapshot = createMockSnapshot()
			const customManifest = createEmptyManifestV1()
			customManifest.assets = { img1: { id: 'img1', kind: 'image', mime: 'image/png' } }
			const customAssets = { files: { file1: { mime: 'image/png', bytesBase64: 'abc123' } } }
			const pkg = exportProjectPackageV1(snapshot, {
				manifest: customManifest,
				assets: customAssets
			})
			expect(pkg.manifest.assets.img1).toBeDefined()
			expect(pkg.assets.files.file1).toBeDefined()
		})
	})

	describe('stringifyProjectJson', () => {
		it('stringifies project to JSON', () => {
			const json = exportProjectJsonV1(createMockSnapshot())
			const str = stringifyProjectJson(json)
			expect(typeof str).toBe('string')
			const parsed = JSON.parse(str)
			expect(parsed.schemaVersion).toBe(1)
		})
	})

	describe('stringifyProjectPackageV1', () => {
		it('stringifies package to JSON', () => {
			const pkg = exportProjectPackageV1(createMockSnapshot())
			const str = stringifyProjectPackageV1(pkg)
			expect(typeof str).toBe('string')
			const parsed = JSON.parse(str)
			expect(parsed.project).toBeDefined()
			expect(parsed.manifest).toBeDefined()
		})
	})

	describe('parseProjectJsonV1', () => {
		it('parses valid project JSON', () => {
			const original = exportProjectJsonV1(createMockSnapshot())
			const str = stringifyProjectJson(original)
			const parsed = parseProjectJsonV1(str)
			expect(parsed.schemaVersion).toBe(1)
			expect(parsed.snapshot).toBeDefined()
		})

		it('throws for invalid schema version', () => {
			const invalid = JSON.stringify({ schemaVersion: 2, snapshot: {} })
			expect(() => parseProjectJsonV1(invalid)).toThrow('Unsupported project schemaVersion')
		})

		it('throws for missing snapshot', () => {
			const invalid = JSON.stringify({ schemaVersion: 1 })
			expect(() => parseProjectJsonV1(invalid)).toThrow('Invalid project snapshot')
		})

		it('throws for missing videoScene', () => {
			const invalid = JSON.stringify({
				schemaVersion: 1,
				snapshot: { videoStudio: {}, timeline: {} }
			})
			expect(() => parseProjectJsonV1(invalid)).toThrow('Invalid snapshot.videoScene')
		})

		it('throws for non-object input', () => {
			expect(() => parseProjectJsonV1('not json')).toThrow()
			expect(() => parseProjectJsonV1('')).toThrow()
		})
	})

	describe('parseProjectManifestV1', () => {
		it('parses valid manifest', () => {
			const manifest = createEmptyManifestV1()
			manifest.assets = {
				img1: { id: 'img1', kind: 'image', mime: 'image/png' }
			}
			const parsed = parseProjectManifestV1(manifest)
			expect(parsed.schemaVersion).toBe(1)
			expect(parsed.assets.img1).toBeDefined()
			expect(parsed.assets.img1.mime).toBe('image/png')
		})

		it('throws for invalid schema version', () => {
			const invalid = { schemaVersion: 'invalid', assets: {} }
			expect(() => parseProjectManifestV1(invalid)).toThrow('Unsupported manifest schemaVersion')
		})

		it('skips invalid asset entries', () => {
			const manifest = {
				schemaVersion: 1,
				assets: {
					valid: { id: 'valid', kind: 'image', mime: 'image/png' },
					invalidKind: { id: 'invalidKind', kind: 'video', mime: 'image/png' },
					noMime: { id: 'noMime', kind: 'image' }
				}
			}
			const parsed = parseProjectManifestV1(manifest)
			expect(Object.keys(parsed.assets)).toHaveLength(1)
			expect(parsed.assets.valid).toBeDefined()
		})
	})

	describe('parseProjectPackageV1', () => {
		it('parses valid package JSON string', () => {
			const original = exportProjectPackageV1(createMockSnapshot())
			const str = stringifyProjectPackageV1(original)
			const parsed = parseProjectPackageV1(str)
			expect(parsed.project.schemaVersion).toBe(1)
			expect(parsed.manifest.schemaVersion).toBe(1)
		})

		it('throws for invalid JSON', () => {
			expect(() => parseProjectPackageV1('invalid json')).toThrow()
		})

		it('throws for missing project', () => {
			const invalid = JSON.stringify({
				manifest: { schemaVersion: 1, assets: {} },
				assets: { files: {} }
			})
			expect(() => parseProjectPackageV1(invalid)).toThrow('Invalid project package.project')
		})
	})

	describe('round-trip', () => {
		it('parse -> stringify -> parse preserves data', () => {
			const original = exportProjectPackageV1(createMockSnapshot())
			const str = stringifyProjectPackageV1(original)
			const parsed = parseProjectPackageV1(str)
			expect(parsed.project.schemaVersion).toBe(original.project.schemaVersion)
			expect(parsed.manifest.schemaVersion).toBe(original.manifest.schemaVersion)
		})
	})
})
