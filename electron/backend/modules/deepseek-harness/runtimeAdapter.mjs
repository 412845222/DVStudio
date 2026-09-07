import fs from 'node:fs/promises'
import path from 'node:path'

// Verified against upstream d347e703908d0406b7a7ef80e3a0e594d86b2215.
// Supports both built CLI (apps/cli/lib/bin.js) and dev mode (pnpm dsh / tsx).
export const ADAPTER_VERSION = 'dsh-adaptive-v2'
export const CLI_ENTRY = 'apps/cli/lib/bin.js'
export const DEV_ENTRY = 'apps/cli/src/bin.ts'

export function satisfiesNode(version, range) {
	const parse = (v) => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v)?.slice(1).map(Number)
	const actual = parse(version.trim())
	if (!actual || typeof range !== 'string') return false
	const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
	return range.split('||').some((part) => {
		const m = /^(\^|>=)?(\d+\.\d+\.\d+)$/.exec(part.trim())
		if (!m) return false // Unknown ranges require an adapter update, not a guess.
		const base = parse(m[2])
		return m[1] === '>='
			? compare(actual, base) >= 0
			: m[1] === '^'
				? actual[0] === base[0] && compare(actual, base) >= 0
				: compare(actual, base) === 0
	})
}

export async function inspectSource(localPath) {
	const root = JSON.parse(await fs.readFile(path.join(localPath, 'package.json'), 'utf8'))
	const cli = JSON.parse(await fs.readFile(path.join(localPath, 'apps/cli/package.json'), 'utf8'))
	if (
		root.name !== '@deepseek-ai/dsh-root' ||
		cli.name !== '@deepseek-ai/dsh' ||
		cli.bin?.dsh !== 'lib/bin.js'
	)
		throw new Error('不支持的 Harness 源码结构（UNSUPPORTED_VERSION）')
	const built = await fs
		.stat(path.join(localPath, CLI_ENTRY))
		.then((s) => s.isFile())
		.catch(() => false)
	// Detect dev-mode support: root scripts.dsh typically runs tsx against the source entry.
	const devScript = root.scripts?.dsh || ''
	const hasDevEntry = await fs
		.stat(path.join(localPath, DEV_ENTRY))
		.then((s) => s.isFile())
		.catch(() => false)
	const devMode = Boolean(hasDevEntry && devScript.includes('--import tsx'))
	return {
		adapterVersion: ADAPTER_VERSION,
		version: cli.version,
		nodeRange: root.engines?.node,
		packageManager: root.packageManager,
		built,
		devMode,
		devScript
	}
}

// Legacy launch args without --no-open (use buildLaunchArgs from startupProbe.mjs
// when dynamic flag detection is needed).
export function launchArgs(profile) {
	return [
		path.join(profile.localPath, CLI_ENTRY),
		'web',
		'--host',
		'127.0.0.1',
		'--port',
		String(profile.port)
	]
}

export function announcedUrl(line, port) {
	const clean = line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
	const match = /dsh web:\s+(http:\/\/[^\s]+)/.exec(clean)
	if (!match) return null
	try {
		const url = new URL(match[1])
		return url.hostname === '127.0.0.1' &&
			Number(url.port) === port &&
			!url.username &&
			!url.password
			? url.href
			: null
	} catch {
		return null
	}
}
