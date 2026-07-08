import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function readVersionFromPackageJson(packageJsonPath) {
	const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
	return pkg.version
}

export function readVersionFromElectronConfig(configPath) {
	const content = fs.readFileSync(configPath, 'utf8')
	const match = content.match(/export const APP_VERSION = '([\d.]+)'/)
	return match ? { version: match[1], content } : null
}

export function updateElectronConfigVersion(configContent, newVersion) {
	return configContent.replace(
		/export const APP_VERSION = '[\d.]+'/,
		`export const APP_VERSION = '${newVersion}'`
	)
}

export function syncVersion(packageJsonPath, electronConfigPath) {
	const pkgVersion = readVersionFromPackageJson(packageJsonPath)
	const configInfo = readVersionFromElectronConfig(electronConfigPath)

	if (!configInfo) {
		throw new Error(`[sync-version] 在 ${electronConfigPath} 中未找到 APP_VERSION`)
	}

	const currentVersion = configInfo.version
	if (currentVersion !== pkgVersion) {
		const updated = updateElectronConfigVersion(configInfo.content, pkgVersion)
		fs.writeFileSync(electronConfigPath, updated, 'utf8')
		return { synced: true, from: currentVersion, to: pkgVersion }
	}
	return { synced: false, version: pkgVersion }
}

function isMainModule() {
	try {
		const __filename = fileURLToPath(import.meta.url)
		const invoked = path.resolve(process.argv[1] || '')
		const modulePath = path.resolve(__filename)
		return invoked === modulePath
	} catch {
		return false
	}
}

if (isMainModule()) {
	const __filename = fileURLToPath(import.meta.url)
	const __dirname = path.dirname(__filename)
	const ROOT = path.resolve(__dirname, '..')
	const PKG_PATH = path.resolve(ROOT, 'package.json')
	const ELECTRON_CONFIG_PATH = path.resolve(ROOT, 'electron', 'config.mjs')

	try {
		const result = syncVersion(PKG_PATH, ELECTRON_CONFIG_PATH)
		if (result.synced) {
			console.log(`[sync-version] 已同步: ${result.from} -> ${result.to}`)
		} else {
			console.log(`[sync-version] 版本号一致: ${result.version}`)
		}
	} catch (err) {
		console.error(err.message)
		process.exit(1)
	}
}
