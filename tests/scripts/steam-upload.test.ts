// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseCliArgs, resolveConfigValue, renderAppBuildVdf } from '../../scripts/upload-steam.mjs'

describe('steam upload: parseCliArgs', () => {
	it('returns empty object for no arguments', () => {
		expect(parseCliArgs([])).toEqual({})
	})

	it('parses --flag (boolean true)', () => {
		const result = parseCliArgs(['--dry-run', '--set-live'])
		expect(result['dry-run']).toBe(true)
		expect(result['set-live']).toBe(true)
	})

	it('parses --key=value', () => {
		const result = parseCliArgs(['--guard=7G7QM', '--branch=beta'])
		expect(result.guard).toBe('7G7QM')
		expect(result.branch).toBe('beta')
	})

	it('parses --key value (space separated)', () => {
		const result = parseCliArgs(['--guard', 'ABCDE', '--branch', 'public'])
		expect(result.guard).toBe('ABCDE')
		expect(result.branch).toBe('public')
	})

	it('parses mixed formats', () => {
		const result = parseCliArgs([
			'--guard=7G7QM',
			'--set-live',
			'--branch', 'public',
			'--desc=v0.1.2 release'
		])
		expect(result.guard).toBe('7G7QM')
		expect(result['set-live']).toBe(true)
		expect(result.branch).toBe('public')
		expect(result.desc).toBe('v0.1.2 release')
	})

	it('treats --key followed by --next-flag as boolean true', () => {
		const result = parseCliArgs(['--dry-run', '--guard=XXXXX'])
		expect(result['dry-run']).toBe(true)
		expect(result.guard).toBe('XXXXX')
	})

	it('strips quotes from quoted values', () => {
		const result = parseCliArgs(['--desc="hello world"'])
		expect(result.desc).toBe('hello world')
	})

	it('strips single quotes from values', () => {
		const result = parseCliArgs(["--desc='hello world'"])
		expect(result.desc).toBe('hello world')
	})

	it('handles --publish as alias for set-live', () => {
		const result = parseCliArgs(['--publish'])
		expect(result.publish).toBe(true)
	})
})

describe('steam upload: resolveConfigValue', () => {
	it('returns CLI value when provided (takes priority over env)', () => {
		const cliArgs = { guard: 'CLIVAL' }
		expect(resolveConfigValue(cliArgs, 'guard', 'ENV_VAL', 'fallback')).toBe('CLIVAL')
	})

	it('returns env value when CLI not provided', () => {
		const cliArgs = {}
		expect(resolveConfigValue(cliArgs, 'guard', 'ENV_VAL', 'fallback')).toBe('ENV_VAL')
	})

	it('returns fallback when neither CLI nor env set', () => {
		const cliArgs = {}
		expect(resolveConfigValue(cliArgs, 'guard', '', 'fallback')).toBe('fallback')
	})

	it('returns empty string as fallback default', () => {
		const cliArgs = {}
		expect(resolveConfigValue(cliArgs, 'user', '')).toBe('')
	})

	it('treats CLI boolean true as not set (for flags)', () => {
		const cliArgs = { 'set-live': true }
		expect(resolveConfigValue(cliArgs, 'set-live', 'env', 'fallback')).toBe('env')
	})

	it('treats empty CLI string as not set', () => {
		const cliArgs = { branch: '' }
		expect(resolveConfigValue(cliArgs, 'branch', 'beta', 'beta')).toBe('beta')
	})
})

describe('steam upload: renderAppBuildVdf', () => {
	const template = `"AppBuild"
{
	"AppID" "{{APP_ID}}"
	"Desc" "{{DESCRIPTION}}"
	"BuildOutput" "{{BUILD_OUTPUT}}"
	"ContentRoot" "{{CONTENT_ROOT}}"
	"Preview" "0"
	"verbose" "1"
{{SET_LIVE_BLOCK}}
	"Depots"
	{
{{DEPOT_ENTRIES}}
	}
}`

	it('replaces all placeholders correctly', () => {
		const result = renderAppBuildVdf(template, {
			appId: 2475710,
			version: '0.1.2',
			buildOutput: 'G:\\\\output',
			contentRoot: 'G:\\\\content',
			branch: 'beta',
			depotEntries: '\t\t"2475711" "G:\\\\depot.vdf"',
			description: 'test build',
			setLive: false
		})
		expect(result).toContain('"AppID" "2475710"')
		expect(result).toContain('"Desc" "test build"')
		expect(result).toContain('"BuildOutput" "G:\\\\output"')
		expect(result).toContain('"ContentRoot" "G:\\\\content"')
		expect(result).toContain('"2475711" "G:\\\\depot.vdf"')
		expect(result).not.toContain('SetLive')
	})

	it('generates default description from version when not provided', () => {
		const result = renderAppBuildVdf(template, {
			appId: 2475710,
			version: '0.1.2',
			buildOutput: 'out',
			contentRoot: 'root',
			branch: 'beta',
			depotEntries: '',
			description: '',
			setLive: false
		})
		expect(result).toContain('"Desc" "v0.1.2 build"')
	})

	it('adds SetLive block when setLive is true', () => {
		const result = renderAppBuildVdf(template, {
			appId: 2475710,
			version: '0.1.2',
			buildOutput: 'out',
			contentRoot: 'root',
			branch: 'beta',
			depotEntries: '',
			description: 'release',
			setLive: true
		})
		expect(result).toContain('"SetLive" "beta"')
	})

	it('does not add SetLive when setLive is false', () => {
		const result = renderAppBuildVdf(template, {
			appId: 2475710,
			version: '0.1.2',
			buildOutput: 'out',
			contentRoot: 'root',
			branch: 'beta',
			depotEntries: '',
			description: 'test',
			setLive: false
		})
		const lines = result.split('\n')
		const setLiveLines = lines.filter(l => l.includes('SetLive'))
		expect(setLiveLines.length).toBe(0)
	})

	it('replaces all {{VERSION}} occurrences', () => {
		const multiVersionTemplate = `"AppBuild"
{
	"AppID" "{{APP_ID}}"
	"Desc" "v{{VERSION}} - {{VERSION}}"
	"BuildOutput" "out/{{VERSION}}"
}`
		const result = renderAppBuildVdf(multiVersionTemplate, {
			appId: 2475710,
			version: '1.0.0',
			buildOutput: '',
			contentRoot: '',
			branch: 'beta',
			depotEntries: '',
			description: '',
			setLive: false
		})
		expect(result).toContain('v1.0.0 - 1.0.0')
		expect(result).toContain('out/1.0.0')
		expect(result).not.toContain('{{VERSION}}')
	})
})
