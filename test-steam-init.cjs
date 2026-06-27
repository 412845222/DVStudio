'use strict'

const path = require('path')
const fs = require('fs')

process.env.DWEB_STEAMJS_DEBUG = '1'

const nativeDir = path.join(__dirname, 'electron', 'platform', 'native', 'win32')
const dllPath = path.join(nativeDir, 'steam_api64.dll')
const nodePath = path.join(nativeDir, 'dweb_steamjs.node')
const appidPath = path.join(nativeDir, 'steam_appid.txt')

console.log('=== Steam Init Diagnostic Test ===')
console.log('Working directory:', process.cwd())
console.log('Native dir:', nativeDir)
console.log('DLL exists:', fs.existsSync(dllPath))
console.log('Node exists:', fs.existsSync(nodePath))
console.log('AppID file (native dir) exists:', fs.existsSync(appidPath))

const rootAppidPath = path.join(__dirname, 'steam_appid.txt')
console.log('AppID file (project root) exists:', fs.existsSync(rootAppidPath))
if (fs.existsSync(rootAppidPath)) {
    console.log('Root AppID content:', fs.readFileSync(rootAppidPath, 'utf8').trim())
}

console.log('\n=== Adding DLL directory to PATH ===')
const currentPATH = process.env.PATH || ''
if (!currentPATH.includes(nativeDir)) {
    process.env.PATH = nativeDir + path.delimiter + currentPATH
    console.log('Added to PATH:', nativeDir)
}

console.log('\n=== Setting environment variables ===')
process.env.SteamAppId = '480'
process.env.SteamGameId = '480'
console.log('SteamAppId:', process.env.SteamAppId)
console.log('SteamGameId:', process.env.SteamGameId)

console.log('\n=== Loading native module ===')
let native
try {
    native = require(nodePath)
    console.log('Native module loaded successfully')
    console.log('Exports:', Object.keys(native))
} catch (err) {
    console.error('Failed to load native module:', err.message)
    console.error(err.stack)
    process.exit(1)
}

console.log('\n=== Testing Steam functions ===')
const SteamClient = native.SteamClient
console.log('SteamClient constructor:', typeof SteamClient)

try {
    const client = new SteamClient({ appId: 480 })
    console.log('SteamClient instance created')
    
    console.log('\n--- Checking isSteamRunning ---')
    const isRunning = client.isSteamRunning()
    console.log('isSteamRunning:', isRunning)
    
    console.log('\n--- Calling init(480) ---')
    const result = client.init(480)
    console.log('Init result:', JSON.stringify(result, null, 2))
    
    if (result.ok) {
        console.log('\n=== SUCCESS! Steam initialized ===')
        console.log('getPersonaName:', client.getPersonaName())
        const steamId = client.getSteamId()
        console.log('getSteamId:', steamId ? steamId.toString() : 0)
        console.log('isLoggedOn:', client.isLoggedOn())
        
        client.runCallbacks()
        client.shutdown()
    } else {
        console.log('\n=== FAILED to initialize Steam ===')
        console.log('Error message:', result.errMsg)
        console.log('Error code (initResult):', result.initResult)
        
        const errorCodes = {
            0: 'k_ESteamAPIInitResult_OK - Success',
            1: 'k_ESteamAPIInitResult_FailedGeneric - Some other failure',
            2: 'k_ESteamAPIInitResult_NoSteamClient - Cannot connect to Steam client (is it running?)',
            3: 'k_ESteamAPIInitResult_VersionMismatch - Client is out of date',
        }
        if (result.initResult !== undefined && errorCodes[result.initResult]) {
            console.log('Error meaning:', errorCodes[result.initResult])
        }
    }
} catch (err) {
    console.error('Error during test:', err.message)
    console.error(err.stack)
}
