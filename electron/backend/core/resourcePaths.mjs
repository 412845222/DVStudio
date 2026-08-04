import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'
import { logger } from './logger.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const log = logger.child('resourcePaths')

export function isPackagedAsar() {
	return (
		__dirname.includes('app.asar') ||
		(process.resourcesPath && __dirname.startsWith(process.resourcesPath))
	)
}

export function getBundledScriptPath(relativePath) {
	const backendDir = path.resolve(__dirname, '..')
	const fullPath = path.resolve(backendDir, relativePath)

	if (!isPackagedAsar()) {
		return fullPath
	}

	if (!fullPath.includes('app.asar')) {
		return fullPath
	}

	const asarMarker = 'app.asar' + path.sep
	const asarIdx = fullPath.indexOf(asarMarker)
	const relativeToAsar = fullPath.substring(asarIdx + asarMarker.length)
	const tmpBase = path.join(os.tmpdir(), 'dvstudio-runtime')
	const tmpPath = path.join(tmpBase, relativeToAsar)

	try {
		const tmpDir = path.dirname(tmpPath)
		if (!fs.existsSync(tmpDir)) {
			fs.mkdirSync(tmpDir, { recursive: true })
		}
		const srcStat = fs.statSync(fullPath)
		if (!fs.existsSync(tmpPath) || fs.statSync(tmpPath).size !== srcStat.size) {
			fs.copyFileSync(fullPath, tmpPath)
			log.info(`Extracted bundled script to temp: ${tmpPath}`)
		}
		return tmpPath
	} catch (err) {
		log.error(`Failed to extract script to temp dir: ${err.message}`, err)
		return fullPath
	}
}

export function getNodeExecutablePath() {
	return process.execPath
}
