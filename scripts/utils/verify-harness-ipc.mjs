// Run with: node_modules/electron/dist/electron.exe scripts/utils/verify-harness-ipc.mjs
// Uses an isolated userData directory and in-memory repo, never the user's DVStudio DB.
import { app, BrowserWindow } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dvs-harness-ipc-'))
app.setPath('userData', root)
process.env.DWEB_RESOURCE_DIR = root
const { createRouter } = await import('../../electron/backend/router.mjs')
const { routes } = await import('../../electron/backend/modules/deepseek-harness/routes.mjs')
const { disposeDeepSeekHarness } =
	await import('../../electron/backend/modules/deepseek-harness/service.mjs')
const profiles = new Map()
let win
let router
let completed = false
const finish = async (ok, message) => {
	if (completed) return
	completed = true
	clearTimeout(timeout)
	await disposeDeepSeekHarness()
	router?.unregister()
	win?.destroy()
	console.log((ok ? 'PASS: ' : 'FAIL: ') + message)
	app.exit(ok ? 0 : 1)
}
const timeout = setTimeout(() => {
	void finish(false, 'Electron IPC smoke timed out')
}, 20000)
void app
	.whenReady()
	.then(async () => {
		win = new BrowserWindow({
			show: false,
			webPreferences: {
				preload: fileURLToPath(new URL('../../electron/preload.mjs', import.meta.url)),
				contextIsolation: true,
				nodeIntegration: false,
				sandbox: false
			}
		})
		router = createRouter({
			routes,
			mainWindow: win,
			contextFactory: () => ({
				localdb: {
					deepseekHarnessProfiles: {
						list: () => ({ records: [...profiles.values()], activeProfileId: null, revision: 0 }),
						get: (id) => profiles.get(id),
						save: (value, expectedRevision) => {
							if (expectedRevision !== 0) throw new Error('REVISION_CONFLICT')
							const saved = { ...value, id: 'fixture', revision: 1 }
							profiles.set(saved.id, saved)
							return saved
						}
					}
				}
			})
		})
		router.register()
		win.webContents.on('console-message', (_event, _level, message) => {
			if (message.startsWith('HARNESS_SMOKE_RESULT:')) {
				const result = JSON.parse(message.slice('HARNESS_SMOKE_RESULT:'.length))
				void finish(result.ok, result.message)
			}
		})
		win.webContents.on('preload-error', (_event, _preloadPath, error) => {
			void finish(false, error.message)
		})
		const fixturePath = path.join(root, 'missing-source')
		const html = `<!doctype html><meta charset="UTF-8"><script>
(async () => {
  const check = (ok, message) => { if (!ok) throw new Error(message) }
  try {
    const api = window.dweb.deepseekHarness.setup
    check((await api.listProfiles()).value.records.length === 0, 'list failed')
    const profile = { name: 'IPC fixture', sourceKind: 'existing', localPath: ${JSON.stringify(fixturePath)}, port: 3080 }
    const saved = await api.saveProfile({ profile, expectedRevision: 0 })
    check(saved.ok && saved.value.id === 'fixture', 'save failed: ' + JSON.stringify(saved))
    check((await api.listProfiles()).value.records.length === 1, 'history failed')
    let cleared = false
    const off = api.onServiceLogsCleared(() => { cleared = true })
    await api.clearServiceLogs()
    await new Promise(r => setTimeout(r, 50))
    off()
    check(cleared, 'clear event not received')
    let error = ''
    try { for await (const chunk of api.prepare({ profileId: 'fixture', expectedRevision: 1, operationId: 'smoke-prepare' })) {} }
    catch (e) { error = e.message }
    check(error.includes('SOURCE_MISSING'), 'stream error did not round trip: ' + error)
    console.log('HARNESS_SMOKE_RESULT:' + JSON.stringify({ ok: true, message: 'real Electron preload, profile save/list, broadcast unsubscribe and prepare stream error' }))
  } catch (e) { console.log('HARNESS_SMOKE_RESULT:' + JSON.stringify({ ok: false, message: e.message })) }
})()
</script>`
		const htmlPath = path.join(root, 'smoke.html')
		await fs.writeFile(htmlPath, html)
		await win.loadFile(htmlPath)
	})
	.catch((error) => {
		void finish(false, error.message)
	})
