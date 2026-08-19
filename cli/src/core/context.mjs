import { discoverInstance } from './discovery.mjs'
import { getHealth } from './httpClient.mjs'

export async function buildRuntimeContext(argv) {
    const instance = await discoverInstance(argv)
    const ctx = {
        argv,
        instance,
        isJson: argv.includes('--json'),
        timeoutMs: (() => {
            const idx = argv.indexOf('--timeout')
            if (idx >= 0 && argv[idx + 1]) return parseInt(argv[idx + 1], 10) || 600000
            const eq = argv.find((a) => a.startsWith('--timeout='))
            if (eq) return parseInt(eq.split('=')[1], 10) || 600000
            return 600000 // 默认 10 分钟
        })(),
        health: null,
        version: process.env.npm_package_version || '0.2.4'
    }
    if (instance && instance.port) {
        try {
            const r = await getHealth(instance, 3000)
            ctx.health = r
            ctx.clientRunning = !r.connectionError && r.status === 200 && r.data?.running === true
        } catch {
            ctx.clientRunning = false
        }
    } else {
        ctx.clientRunning = false
    }
    return ctx
}
