import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = process.cwd()

function log(msg) {
	process.stdout.write(`[ci:prepare-release] ${msg}\n`)
}

function isTagTrigger() {
	const ref = process.env.GITHUB_REF || ''
	return ref.startsWith('refs/tags/')
}

function getTagFromRef() {
	const ref = process.env.GITHUB_REF || ''
	return ref.replace(/^refs\/tags\//, '')
}

function getBuildVersion() {
	const pkg = JSON.parse(fs.readFileSync(path.resolve(ROOT, 'package.json'), 'utf8'))
	const baseVersion = pkg.version
	const sha = (process.env.GITHUB_SHA || '').slice(0, 7) || 'local'
	const runNumber = process.env.GITHUB_RUN_NUMBER || '0'
	const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
	const tagTrigger = isTagTrigger()
	const tag = tagTrigger ? getTagFromRef() : ''

	if (tagTrigger) {
		const versionFromTag = tag.replace(/^v/, '')
		return {
			baseVersion,
			version: versionFromTag,
			tag: tag,
			commit: process.env.GITHUB_SHA || '',
			branch: process.env.GITHUB_REF_NAME || 'main',
			isPrerelease: false,
			releaseType: 'official'
		}
	}

	return {
		baseVersion,
		version: `${baseVersion}-dev.${date}.${runNumber}+${sha}`,
		tag: `v${baseVersion}-dev.${date}.${runNumber}`,
		commit: process.env.GITHUB_SHA || '',
		branch: process.env.GITHUB_REF_NAME || 'main',
		isPrerelease: true,
		releaseType: 'dev'
	}
}

function findInstaller() {
	const entries = fs.readdirSync(ROOT, { withFileTypes: true })
	const releaseDirs = entries
		.filter((e) => e.isDirectory() && e.name.startsWith('release-'))
		.map((e) => ({
			name: e.name,
			path: path.resolve(ROOT, e.name),
			mtime: fs.statSync(path.resolve(ROOT, e.name)).mtime
		}))
		.sort((a, b) => b.mtime - a.mtime)

	if (releaseDirs.length === 0) {
		throw new Error('No release-* directory found')
	}

	const latestDir = releaseDirs[0]
	log(`Using release directory: ${latestDir.name}`)

	const exeFiles = fs
		.readdirSync(latestDir.path, { withFileTypes: true })
		.filter((e) => e.isFile() && e.name.endsWith('.exe'))
		.map((e) => ({
			name: e.name,
			path: path.resolve(latestDir.path, e.name)
		}))

	if (exeFiles.length === 0) {
		throw new Error(`No .exe installer found in ${latestDir.name}`)
	}

	const installer = exeFiles[0]
	log(`Found installer: ${installer.name}`)
	return {
		dir: latestDir.path,
		dirName: latestDir.name,
		path: installer.path,
		name: installer.name
	}
}

function getRecentChanges(limit = 50) {
	try {
		const output = execSync(`git log --oneline --no-merges -${limit}`, {
			encoding: 'utf8',
			cwd: ROOT
		})
		return output
			.split('\n')
			.filter(Boolean)
			.map((line) => `- ${line}`)
			.join('\n')
	} catch {
		return '- (无法获取变更日志)'
	}
}

function getChangesSinceTag(tag) {
	try {
		const output = execSync(`git log --oneline --no-merges ${tag}..HEAD`, {
			encoding: 'utf8',
			cwd: ROOT
		})
		const lines = output.split('\n').filter(Boolean)
		if (lines.length === 0) {
			return getRecentChanges(20)
		}
		return lines.map((line) => `- ${line}`).join('\n')
	} catch {
		return getRecentChanges(20)
	}
}

function generateReleaseNotes(versionInfo, installer) {
	const runId = process.env.GITHUB_RUN_ID || ''
	const repo = process.env.GITHUB_REPOSITORY || ''
	const runUrl = runId && repo ? `https://github.com/${repo}/actions/runs/${runId}` : '(本地构建)'

	let changes
	let releaseTitle
	let header

	if (versionInfo.releaseType === 'official') {
		header = `## DVStudio ${versionInfo.version} 正式发布`
		changes = getChangesSinceTag(versionInfo.tag)
	} else {
		header = `## DVStudio ${versionInfo.version} 开发预览版`
		changes = getRecentChanges()
	}

	return `${header}

### 构建信息

- **版本**: \`${versionInfo.version}\`
- **类型**: ${versionInfo.releaseType === 'official' ? '正式发布' : '开发预览版'}
- **提交**: \`${versionInfo.commit}\`
- **分支**: \`${versionInfo.branch}\`
- **构建运行**: ${runUrl}
- **安装包**: \`${installer.name}\`

### 变更日志

${changes}

---
*此版本由 GitHub Actions 自动构建发布*
`
}

function setOutput(name, value) {
	const outputFile = process.env.GITHUB_OUTPUT
	if (outputFile) {
		fs.appendFileSync(outputFile, `${name}=${value}\n`)
		log(`Set output ${name}=${value}`)
	} else {
		log(`[local] ${name}=${value}`)
	}
}

function main() {
	log('Preparing release artifacts...')
	log(`Trigger type: ${isTagTrigger() ? 'tag (official release)' : 'branch push (dev preview)'}`)

	const versionInfo = getBuildVersion()
	log(`Version: ${versionInfo.version}`)
	log(`Tag: ${versionInfo.tag}`)
	log(`Prerelease: ${versionInfo.isPrerelease}`)

	const installer = findInstaller()

	const notes = generateReleaseNotes(versionInfo, installer)
	const notesPath = path.resolve(ROOT, 'release-notes.md')
	fs.writeFileSync(notesPath, notes, 'utf8')
	log('Release notes written to release-notes.md')

	setOutput('version', versionInfo.version)
	setOutput('tag', versionInfo.tag)
	setOutput('installer_path', installer.path)
	setOutput('installer_name', installer.name)
	setOutput('notes_path', notesPath)
	setOutput('is_prerelease', versionInfo.isPrerelease ? 'true' : 'false')
	setOutput('release_name', `DVStudio v${versionInfo.version}`)

	log('Done!')
}

main()
