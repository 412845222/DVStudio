// Safe local smoke: creates its own fixture, spawns only owned Node children, no downloads.
// This verifies the manager/OS contract, not a real upstream Harness installation.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createProcessManager } from '../../electron/backend/modules/deepseek-harness/processManager.mjs'
import { createServiceEvents } from '../../electron/backend/modules/deepseek-harness/serviceEvents.mjs'
import {
	spawnManaged,
	commandEnv
} from '../../electron/backend/modules/deepseek-harness/commands.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dvs-harness-smoke-'))
const events = createServiceEvents()
const manager = createProcessManager(events)
const other = spawnManaged(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
	env: commandEnv(process.execPath)
})
const waitFor = async (predicate) => {
	const deadline = Date.now() + 20000
	while (!predicate()) {
		if (Date.now() > deadline) throw new Error(JSON.stringify(manager.snapshot()))
		await new Promise((resolve) => setTimeout(resolve, 50))
	}
}
try {
	await fs.mkdir(path.join(root, 'apps/cli/lib'), { recursive: true })
	await fs.mkdir(path.join(root, 'packages/bundle/web-app/src'), { recursive: true })
	await fs.writeFile(
		path.join(root, 'package.json'),
		JSON.stringify({
			name: '@deepseek-ai/dsh-root',
			type: 'module',
			engines: { node: '>=22.0.0' },
			packageManager: 'pnpm@11.7.0'
		})
	)
	await fs.writeFile(
		path.join(root, 'apps/cli/package.json'),
		JSON.stringify({ name: '@deepseek-ai/dsh', bin: { dsh: 'lib/bin.js' }, version: 'fixture' })
	)
	await fs.writeFile(
		path.join(root, 'packages/bundle/web-app/src/startup.ts'),
		'// --host --port --no-open'
	)
	await fs.writeFile(
		path.join(root, 'apps/cli/lib/bin.js'),
		`if (process.argv.includes('--help')) { console.log('Options: --host --port'); process.exit(0); }
console.log("dsh web: http://127.0.0.1:49381/#token=smoke-secret"); setInterval(() => {}, 1000)`
	)
	manager.start({
		id: 'smoke',
		revision: 1,
		localPath: root,
		port: 49381,
		nodePath: process.execPath
	})
	await waitFor(() => manager.snapshot().lifecycle === 'running')
	assert.ok(manager.snapshot().pid)
	assert.ok(!JSON.stringify(events.snapshot()).includes('smoke-secret'))
	await manager.stop()
	assert.equal(manager.snapshot().lifecycle, 'stopped')
	assert.equal(other.ended, false, 'Unrelated owned fixture must remain alive')
	console.log(
		'PASS: real Node startup, private URL redaction, Windows/POSIX stop, unrelated process preserved'
	)
} finally {
	await manager.stop()
	await other.stop()
	events.flush()
	const resolved = await fs.realpath(root)
	const temp = await fs.realpath(os.tmpdir())
	if (path.dirname(resolved) !== temp || !path.basename(resolved).startsWith('dvs-harness-smoke-'))
		throw new Error('Unexpected smoke fixture path; refusing cleanup')
	await fs.rm(resolved, { recursive: true, force: true })
}
