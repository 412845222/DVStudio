// This script runs inside Electron to access localdb
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Find project root
function findProjectRoot(startDir) {
	let dir = startDir
	for (let i = 0; i < 10; i++) {
		if (fs.existsSync(path.join(dir, 'package.json'))) {
			try {
				const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'))
				if (pkg.name === 'dvstudio' || pkg.name === 'dweb-video-studio') {
					return dir
				}
			} catch {}
		}
		const parent = path.dirname(dir)
		if (parent === dir) break
		dir = parent
	}
	return startDir
}

async function main() {
	const projectRoot = findProjectRoot(__dirname)
	console.log('[Script] Project root:', projectRoot)

	// Set up paths like in main.mjs
	function getDvsResourceDir() {
		const envResourceDir = String(process.env.DWEB_RESOURCE_DIR || '').trim()
		if (envResourceDir) return path.resolve(envResourceDir)
		return path.resolve(projectRoot, 'DVSResource')
	}

	function getBackendDataDir() {
		return path.resolve(getDvsResourceDir(), 'BackendData')
	}

	const backendDataDir = getBackendDataDir()
	console.log('[Script] Backend data dir:', backendDataDir)

	// Init localdb
	const { initLocalDb, getRepos } = await import(
		path.join(projectRoot, 'electron', 'localdb', 'index.mjs')
	)

	initLocalDb({ backendDataDir, userDataDir: backendDataDir, appSecret: backendDataDir })
	const repos = getRepos()
	console.log('[Script] LocalDB initialized, dbFilePath:', repos.dbFilePath)

	// Get meshy tasks repo
	const meshyTasksRepo = repos.meshyTasks
	if (!meshyTasksRepo) {
		console.error('[Script] meshyTasks repo not available!')
		process.exit(1)
	}

	// List all meshy tasks
	const allTasks = meshyTasksRepo.list()
	console.log('[Script] Total meshy tasks:', allTasks.length)
	for (const task of allTasks) {
		console.log('\n[Script] === Task:', task.taskId, '===')
		console.log('  mode:', task.mode)
		console.log('  status:', task.status)
		console.log('  progress:', task.progress)
		console.log('  projectId:', task.projectId)
		console.log('  lastNodeId:', task.lastNodeId)
		console.log('  localAssetUrl:', task.localAssetUrl)
		console.log('  localAssetPath:', task.localAssetPath)
		console.log('  thumbnailUrl:', task.thumbnailUrl)
		console.log('  preferredModelUrl:', task.preferredModelUrl)
		console.log('  rootTaskId:', task.rootTaskId)
		console.log('  parentTaskId:', task.parentTaskId)
		console.log('  taskFamily:', task.taskFamily)
		console.log('  taskTarget:', task.taskTarget)

		// Show response payload keys
		if (task.responsePayload) {
			try {
				const resp =
					typeof task.responsePayload === 'string'
						? JSON.parse(task.responsePayload)
						: task.responsePayload
				console.log('  responsePayload keys:', Object.keys(resp))
				if (resp.model_urls) {
					console.log('  model_urls:', JSON.stringify(resp.model_urls))
				}
				if (resp.thumbnail_url) {
					console.log('  thumbnail_url:', resp.thumbnail_url)
				}
			} catch (e) {
				console.log('  responsePayload parse error:', e.message)
			}
		}
	}

	// Check available repos
	console.log('\n[Script] Available repos:', Object.keys(repos).join(', '))

	process.exit(0)
}

app
	.whenReady()
	.then(main)
	.catch((err) => {
		console.error('[Script] Fatal error:', err)
		process.exit(1)
	})
