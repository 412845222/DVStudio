'use strict'

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '..')
const dwebSteamDir = path.join(repoRoot, 'DwebSteamJS')
const buildReleaseDir = path.join(dwebSteamDir, 'build', 'Release')
const nativeDir = path.join(repoRoot, 'electron', 'platform', 'native')
const win32Dir = path.join(nativeDir, 'win32')

const REQUIRED_FILES = ['dweb_steamjs.node', 'steam_api64.dll']
const STEAM_APPID_SRC = path.join(repoRoot, 'steam_appid.txt')
const STEAM_APPID_DST = path.join(win32Dir, 'steam_appid.txt')

function getFileHash(filePath) {
    try {
        const content = fs.readFileSync(filePath)
        return crypto.createHash('sha256').update(content).digest('hex')
    } catch {
        return null
    }
}

function needsCopy(src, dst) {
    if (!fs.existsSync(dst)) return true
    const srcHash = getFileHash(src)
    const dstHash = getFileHash(dst)
    return srcHash !== dstHash
}

function main() {
    console.log('[setup-steam-native] Checking Steam native modules...')

    if (!fs.existsSync(dwebSteamDir)) {
        console.log('[setup-steam-native] DwebSteamJS directory not found, skipping deployment (Mock mode only)')
        return
    }

    if (!fs.existsSync(buildReleaseDir)) {
        console.log('[setup-steam-native] DwebSteamJS build/Release not found, run "cd DwebSteamJS && npm run build:electron" first')
        console.log('[setup-steam-native] Falling back to Mock mode')
        return
    }

    const missingFiles = []
    for (const file of REQUIRED_FILES) {
        const filePath = path.join(buildReleaseDir, file)
        if (!fs.existsSync(filePath)) {
            missingFiles.push(file)
        }
    }

    if (missingFiles.length > 0) {
        console.log('[setup-steam-native] Missing build artifacts:', missingFiles.join(', '))
        console.log('[setup-steam-native] Run "cd DwebSteamJS && npm run build:electron" to build')
        console.log('[setup-steam-native] Falling back to Mock mode')
        return
    }

    fs.mkdirSync(win32Dir, { recursive: true })

    let copiedCount = 0
    for (const file of REQUIRED_FILES) {
        const src = path.join(buildReleaseDir, file)
        const dst = path.join(win32Dir, file)
        if (needsCopy(src, dst)) {
            fs.copyFileSync(src, dst)
            console.log(`[setup-steam-native] Deployed: ${file}`)
            copiedCount++
        }
    }

    if (fs.existsSync(STEAM_APPID_SRC)) {
        if (needsCopy(STEAM_APPID_SRC, STEAM_APPID_DST)) {
            fs.copyFileSync(STEAM_APPID_SRC, STEAM_APPID_DST)
            console.log('[setup-steam-native] Deployed: steam_appid.txt')
            copiedCount++
        }
    } else {
        const defaultAppIdPath = path.join(win32Dir, 'steam_appid.txt')
        if (!fs.existsSync(defaultAppIdPath)) {
            fs.writeFileSync(defaultAppIdPath, '480', 'utf8')
            console.log('[setup-steam-native] Created default steam_appid.txt (AppID 480/SpaceWar)')
            copiedCount++
        }
    }

    const manifestPath = path.join(win32Dir, '.manifest.json')
    const manifest = {
        deployedAt: new Date().toISOString(),
        source: buildReleaseDir,
        files: REQUIRED_FILES,
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

    if (copiedCount > 0) {
        console.log(`[setup-steam-native] Successfully deployed ${copiedCount} files to: ${win32Dir}`)
    } else {
        console.log('[setup-steam-native] Native modules already up to date')
    }
    console.log('[setup-steam-native] Steam integration ready!')
}

try {
    main()
} catch (err) {
    console.error('[setup-steam-native] Error during deployment:', err.message)
    console.error('[setup-steam-native] Falling back to Mock mode')
}
