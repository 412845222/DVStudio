import path from 'node:path'
import { runCommand } from './commands.mjs'
import { CLI_ENTRY, DEV_ENTRY } from './runtimeAdapter.mjs'

// Resolve which entry file to use: prefer dev mode (tsx) when available,
// because the built CLI may still dynamically import TypeScript plugin
// sources (e.g. turtlesoup) that Node's strip-only mode cannot handle.
export function resolveEntry(report) {
	if (report.devMode) return path.join(report.localPath || '', DEV_ENTRY)
	if (report.built) return path.join(report.localPath || '', CLI_ENTRY)
	return path.join(report.localPath || '', CLI_ENTRY)
}

// Resolve extra Node args needed before the entry (e.g. --import tsx/esm for dev mode).
export function resolveNodeArgs(report) {
	if (report.devMode) return ['--import', 'tsx/esm']
	return []
}

// Probe the selected source's supported web flags by running its own --help.
// This avoids hard-coding flags such as --no-open that only some versions ship.
export async function probeSupportedFlags(nodePath, report, { signal } = {}) {
	const entry = resolveEntry(report)
	const nodeArgs = resolveNodeArgs(report)
	let output = ''
	try {
		output = await runCommand(nodePath, [...nodeArgs, entry, 'web', '--help'], {
			signal,
			timeout: 15000
		})
	} catch {
		// Fall back to the safe default set when --help cannot run.
		return { host: true, port: true, noOpen: false, trustedHost: false }
	}
	const flags = new Set()
	for (const match of output.matchAll(/--([a-z][a-z0-9-]*)/g)) flags.add(match[1])
	return {
		host: flags.has('host'),
		port: flags.has('port'),
		noOpen: flags.has('no-open'),
		trustedHost: flags.has('trusted-host')
	}
}

// Build launch args using only flags the source actually supports.
// In dev mode, prepend tsx import args to the Node invocation.
export function buildLaunchArgs(profile, report, supported) {
	const entry = resolveEntry(report)
	const nodeArgs = resolveNodeArgs(report)
	const args = [...nodeArgs, entry, 'web']
	if (supported.host) args.push('--host', '127.0.0.1')
	if (supported.port) args.push('--port', String(profile.port))
	if (supported.noOpen) args.push('--no-open')
	return args
}
