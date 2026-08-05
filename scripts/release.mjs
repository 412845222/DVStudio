import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const PKG_PATH = path.resolve(ROOT, 'package.json')
const ELECTRON_CONFIG_PATH = path.resolve(ROOT, 'electron', 'config.mjs')

const COLOR_RED = '\x1b[0;31m'
const COLOR_GREEN = '\x1b[0;32m'
const COLOR_YELLOW = '\x1b[1;33m'
const COLOR_CYAN = '\x1b[0;36m'
const COLOR_RESET = '\x1b[0m'

function log(msg) {
	process.stdout.write(`${COLOR_CYAN}[release]${COLOR_RESET} ${msg}\n`)
}

function success(msg) {
	process.stdout.write(`${COLOR_GREEN}[release]${COLOR_RESET} ${msg}\n`)
}

function warn(msg) {
	process.stdout.write(`${COLOR_YELLOW}[release]${COLOR_RESET} ${msg}\n`)
}

function error(msg) {
	process.stderr.write(`${COLOR_RED}[release]${COLOR_RESET} ${msg}\n`)
}

function resolveCmd(cmd) {
	return cmd
}

// Windows 上 npm/npx 实际是 .cmd/.ps1 脚本：shell:false 既无法解析无扩展名的 'npm'
// （ENOENT），Node.js 安全更新后也禁止 shell:false 直接执行 .bat/.cmd。
// git/gh 在 Windows 上是真正的 .exe，shell:false 可正常执行，且能避免参数被 shell
// 错误转义（例如 gh pr create --body 中的换行符）。
function needsShell(cmd) {
	if (process.platform === 'win32' && (cmd === 'npm' || cmd === 'npx')) {
		return true
	}
	return false
}

function run(cmd, args, options = {}) {
	const resolvedCmd = resolveCmd(cmd)
	log(`$ ${resolvedCmd} ${args.join(' ')}`)
	const result = spawnSync(resolvedCmd, args, {
		cwd: ROOT,
		stdio: 'inherit',
		env: {
			...process.env,
			...(options.env || {})
		},
		...options,
		shell: options.shell ?? needsShell(resolvedCmd)
	})
	if (result.error) {
		throw new Error(`Failed to execute ${resolvedCmd}: ${result.error.message}`)
	}
	if (result.status !== 0) {
		throw new Error(`Command failed: ${resolvedCmd} ${args.join(' ')} (exit code ${result.status})`)
	}
	return result
}

function runGit(args, options = {}) {
	return run('git', args, {
		...options,
		env: {
			...(options.env || {}),
			DWEB_GIT_ALLOW_DIRECT_PUSH: '1',
			DWEB_SKIP_QUALITY_CHECK: '1'
		}
	})
}

function runNpm(args, options = {}) {
	return run('npm', args, options)
}

function parseVersion(versionStr) {
	const match = versionStr.match(/^(\d+)\.(\d+)\.(\d+)(?:-.+)?$/)
	if (!match) {
		throw new Error(
			`Invalid version format: ${versionStr}. Expected MAJOR.MINOR.PATCH (e.g. 0.1.2)`
		)
	}
	return {
		major: parseInt(match[1], 10),
		minor: parseInt(match[2], 10),
		patch: parseInt(match[3], 10),
		raw: match[0]
	}
}

function bumpVersion(currentVersion) {
	const v = parseVersion(currentVersion)
	v.patch += 1
	return `${v.major}.${v.minor}.${v.patch}`
}

function isGitClean() {
	const gitCmd = resolveCmd('git')
	const result = spawnSync(gitCmd, ['status', '--porcelain'], {
		cwd: ROOT,
		encoding: 'utf8',
		shell: false
	})
	if (result.error) {
		throw new Error(`Failed to run git: ${result.error.message}`)
	}
	const output = (result.stdout || '').trim()
	return output.length === 0
}

function getCurrentBranch() {
	const gitCmd = resolveCmd('git')
	const result = spawnSync(gitCmd, ['rev-parse', '--abbrev-ref', 'HEAD'], {
		cwd: ROOT,
		encoding: 'utf8',
		shell: false
	})
	if (result.error) {
		throw new Error(`Failed to run git: ${result.error.message}`)
	}
	return (result.stdout || '').trim()
}

function getRemoteUrl() {
	const gitCmd = resolveCmd('git')
	const result = spawnSync(gitCmd, ['remote', 'get-url', 'origin'], {
		cwd: ROOT,
		encoding: 'utf8',
		shell: false
	})
	if (result.error) {
		throw new Error(`Failed to run git: ${result.error.message}`)
	}
	return (result.stdout || '').trim()
}

function getRepoWebUrl(remoteUrl) {
	return remoteUrl.replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '')
}

function main() {
	const argVersion = process.argv[2]

	log('=== DVStudio Release Script ===')
	log('')

	const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'))
	const currentVersion = pkg.version

	log(`Current version: ${currentVersion}`)

	let newVersion
	if (argVersion) {
		parseVersion(argVersion)
		newVersion = argVersion
		log(`Target version (specified): ${newVersion}`)
	} else {
		newVersion = bumpVersion(currentVersion)
		log(`Target version (auto-bump patch): ${newVersion}`)
	}

	if (newVersion === currentVersion) {
		error(`New version is same as current version: ${currentVersion}`)
		process.exit(1)
	}

	log('')
	log('Pre-flight checks...')

	const branch = getCurrentBranch()
	log(`Current branch: ${branch}`)

	if (branch !== 'main') {
		error(`You must be on the 'main' branch to release. Current branch: '${branch}'`)
		error('Please run:')
		error('  git checkout main')
		error('  git pull origin main')
		process.exit(1)
	}

	if (!isGitClean()) {
		error('Working directory is not clean. Please commit or stash your changes before releasing.')
		error('Run `git status` to see uncommitted changes.')
		process.exit(1)
	}
	success('Working directory is clean.')

	const remoteUrl = getRemoteUrl()
	if (!remoteUrl) {
		error('No git remote "origin" configured.')
		process.exit(1)
	}
	log(`Remote: ${remoteUrl}`)

	const repoUrl = getRepoWebUrl(remoteUrl)

	log('')
	log('Pulling latest changes from main...')
	runGit(['pull', '--ff-only', 'origin', 'main'])
	success('Pulled latest changes.')

	log('')
	log('Running quality checks (typecheck + test)...')
	try {
		runNpm(['run', 'quality'], { stdio: 'inherit' })
		success('Quality checks passed.')
	} catch {
		warn(
			'Quality checks failed locally. This is advisory only - CI will run all checks before building.'
		)
		warn('If you want to debug locally, run `npm run quality` separately.')
		warn('Continuing with release...')
	}

	log('')
	log(`Updating package.json version to ${newVersion}...`)
	pkg.version = newVersion
	// Use tab indentation to match .prettierrc (useTabs: true, tabWidth: 2)
	fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, '\t') + '\n', 'utf8')
	success('package.json updated.')

	log('')
	log(`Updating electron/config.mjs version to ${newVersion}...`)
	const electronConfig = fs.readFileSync(ELECTRON_CONFIG_PATH, 'utf8')
	const updatedElectronConfig = electronConfig.replace(
		/export const APP_VERSION = '[\d.]+'/,
		`export const APP_VERSION = '${newVersion}'`
	)
	fs.writeFileSync(ELECTRON_CONFIG_PATH, updatedElectronConfig, 'utf8')
	success('electron/config.mjs updated.')

	log('')
	log('Running Prettier on modified files to ensure format compliance...')
	runNpm(['exec', 'prettier', '--', '--write', PKG_PATH, ELECTRON_CONFIG_PATH], {
		stdio: 'inherit'
	})
	success('Prettier formatting applied.')

	const tagName = `v${newVersion}`
	const releaseBranch = `release/${tagName}`

	log('')
	log('Committing version bump...')
	runGit(['add', 'package.json', 'electron/config.mjs'])
	runGit(['commit', '-m', `chore: release ${newVersion}`, '--no-verify'])
	success('Committed version bump.')

	log('')
	log(`Creating tag ${tagName}...`)
	runGit(['tag', '-a', tagName, '-m', `Release ${tagName}`])
	success(`Tag ${tagName} created.`)

	log('')
	log(`Pushing release branch ${releaseBranch} and tag ${tagName}...`)
	runGit(['push', 'origin', `HEAD:${releaseBranch}`])
	runGit(['push', 'origin', tagName])
	success('Pushed branch and tag.')

	log('')
	log(`Creating Pull Request: ${releaseBranch} → main...`)
	try {
		const prResult = run(
			'gh',
			[
				'pr',
				'create',
				'--base',
				'main',
				'--head',
				releaseBranch,
				'--title',
				`chore: release ${newVersion}`,
				'--body',
				`Automated release PR for version ${newVersion}.\n\nOnce merged, the tag ${tagName} will trigger the official release build.`
			],
			{ encoding: 'utf8' }
		)
		success('Pull Request created.')
	} catch {
		warn('Could not create PR automatically (gh CLI may not be authenticated).')
		warn(`Please create a PR manually from branch '${releaseBranch}' to 'main'.`)
		warn(`Then merge the PR to complete the release.`)
	}

	log('')
	success('=== Release process initiated successfully! ===')
	log('')
	log(`Version: ${newVersion}`)
	log(`Tag: ${tagName}`)
	log(`Release Branch: ${releaseBranch}`)
	log('')
	log('The tag push has triggered GitHub Actions to build the Windows installer.')
	log('Please review and merge the PR to update package.json on main.')
	log('')
	log('Monitor progress:')
	log(`  ${repoUrl}/actions`)
	log('')
	log('Once the build completes, the release will be available at:')
	log(`  ${repoUrl}/releases/tag/${tagName}`)
	log('')
}

try {
	main()
} catch (err) {
	error(`Release failed: ${err.message}`)
	console.error(err)
	process.exit(1)
}
