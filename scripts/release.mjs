import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const PKG_PATH = path.resolve(ROOT, 'package.json')

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

function run(cmd, args, options = {}) {
	const isCmd = process.platform === 'win32' && options.shell !== false
	const actualCmd = isCmd ? `${cmd}.cmd` : cmd
	log(`$ ${cmd} ${args.join(' ')}`)
	const result = spawnSync(actualCmd, args, {
		cwd: ROOT,
		stdio: 'inherit',
		shell: isCmd,
		env: {
			...process.env,
			...(options.env || {})
		},
		...options
	})
	if (result.status !== 0) {
		throw new Error(`Command failed: ${cmd} ${args.join(' ')} (exit code ${result.status})`)
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
		throw new Error(`Invalid version format: ${versionStr}. Expected MAJOR.MINOR.PATCH (e.g. 0.1.2)`)
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
	const result = spawnSync('git', ['status', '--porcelain'], {
		cwd: ROOT,
		encoding: 'utf8'
	})
	const output = result.stdout.trim()
	return output.length === 0
}

function getCurrentBranch() {
	const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
		cwd: ROOT,
		encoding: 'utf8'
	})
	return result.stdout.trim()
}

function getRemoteUrl() {
	const result = spawnSync('git', ['remote', 'get-url', 'origin'], {
		cwd: ROOT,
		encoding: 'utf8'
	})
	return result.stdout.trim()
}

function getRepoWebUrl(remoteUrl) {
	return remoteUrl
		.replace(/^git@github\.com:/, 'https://github.com/')
		.replace(/\.git$/, '')
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
		runNpm(['run', 'quality'])
	} catch {
		error('Quality checks failed. Please fix issues before releasing.')
		error('You can run `npm run quality` locally to debug.')
		process.exit(1)
	}
	success('Quality checks passed.')

	log('')
	log(`Updating package.json version to ${newVersion}...`)
	pkg.version = newVersion
	fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
	success('package.json updated.')

	const tagName = `v${newVersion}`

	log('')
	log('Committing version bump...')
	runGit(['add', 'package.json'])
	runGit(['commit', '-m', `chore: release ${newVersion}`])
	success('Committed version bump.')

	log('')
	log(`Creating tag ${tagName}...`)
	runGit(['tag', '-a', tagName, '-m', `Release ${tagName}`])
	success(`Tag ${tagName} created.`)

	log('')
	log('Pushing commit and tag to origin/main...')
	warn('This pushes directly to main (release bypass) and triggers GitHub Actions.')
	runGit(['push', 'origin', 'main'])
	runGit(['push', 'origin', tagName])
	success('Pushed to origin.')

	log('')
	success('=== Release process initiated successfully! ===')
	log('')
	log(`Version: ${newVersion}`)
	log(`Tag: ${tagName}`)
	log(`Branch: main`)
	log('')
	log('GitHub Actions is now building the Windows installer and creating the official Release.')
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
