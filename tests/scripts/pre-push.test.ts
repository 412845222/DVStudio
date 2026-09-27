// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

// Use Git's own Bash on Windows, never the unrelated WSL launcher in System32.
const bash =
	process.platform === 'win32'
		? resolve(
				execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(),
				'../../../bin/bash.exe'
			)
		: 'bash'
const hook = resolve('.githooks/pre-push').replaceAll('\\', '/')
const roots: string[] = []
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function run(
	options: {
		files?: string[]
		branch?: string
		bypass?: boolean
		formatFail?: boolean
		qualityFail?: boolean
	} = {}
) {
	const root = mkdtempSync(join(tmpdir(), 'dvstudio-hook-'))
	roots.push(root)
	mkdirSync(join(root, 'bin'))
	const stub = (name: string, body: string) =>
		writeFileSync(join(root, 'bin', name), '#!/usr/bin/env bash\n' + body, { mode: 0o755 })
	stub('git', 'if [ "$1" = diff ]; then cat "$HOOK_ROOT/files"; fi\n')
	stub('npx', 'printf "FORMAT:%s\\n" "$@"\nexit "${FORMAT_EXIT:-0}"\n')
	stub('npm', 'echo QUALITY\nexit "${QUALITY_EXIT:-0}"\n')
	stub('uname', 'echo HookTest\n')
	writeFileSync(join(root, 'files'), (options.files ?? []).map((f) => f + '\0').join(''))
	const branch = options.branch ?? 'codex/test'
	return spawnSync(
		bash,
		[
			'-c',
			'if command -v cygpath >/dev/null; then HOOK_ROOT=$(cygpath -u "$HOOK_ROOT"); export HOOK_ROOT; fi; export PATH="$HOOK_ROOT/bin:$PATH"; exec bash "$HOOK_FILE"'
		],
		{
			encoding: 'utf8',
			timeout: 15000,
			input: `refs/heads/test ${'1'.repeat(40)} refs/heads/${branch} ${'0'.repeat(40)}\n`,
			env: {
				...process.env,
				HOOK_ROOT: root.replaceAll('\\', '/'),
				HOOK_FILE: hook,
				CI: 'false',
				DWEB_SKIP_QUALITY_CHECK: '0',
				DWEB_GIT_ALLOW_DIRECT_PUSH: options.bypass ? '1' : '0',
				FORMAT_EXIT: options.formatFail ? '1' : '0',
				QUALITY_EXIT: options.qualityFail ? '1' : '0'
			}
		}
	)
}

describe('pre-push gates without contacting a remote', () => {
	it('allows a documentation-only range and still runs quality checks', () => {
		const result = run()
		expect(result.status, result.stderr).toBe(0)
		expect(result.stderr).toContain('\nQUALITY\n')
		expect(result.stderr).not.toContain('FORMAT:')
	})
	it('preserves filenames containing spaces and Chinese characters', () => {
		const result = run({ files: ['src/输入 参数.ts', 'src/other.ts'] })
		expect(result.status, result.stderr).toBe(0)
		expect(result.stderr).toContain('FORMAT:src/输入 参数.ts\n')
	})
	it.each(['main', 'dev'])('rejects a direct push to %s', (branch) => {
		const result = run({ branch })
		expect(result.status).toBe(1)
		expect(result.stderr).not.toContain('\nQUALITY\n')
	})
	it('still runs the defined quality function when branch protection is explicitly bypassed', () => {
		const result = run({ branch: 'dev', bypass: true })
		expect(result.status, result.stderr).toBe(0)
		expect(result.stderr).toContain('\nQUALITY\n')
	})
	it('rejects format failures before quality checks', () => {
		const result = run({ files: ['src/bad.ts'], formatFail: true })
		expect(result.status).toBe(1)
		expect(result.stderr).not.toContain('\nQUALITY\n')
	})
	it('rejects failing quality checks', () => {
		expect(run({ qualityFail: true }).status).toBe(1)
	})
})
