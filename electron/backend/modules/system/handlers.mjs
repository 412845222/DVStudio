import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getMigrationSummary } from './migration-checklist.mjs'
import { getBackendRouter } from '../../index.mjs'
import { getHttpClient } from '../../core/http-client.mjs'
import { APP_VERSION, APP_REPO_URL } from '../../../config.mjs'
import { getManager } from '../../../platform/manager.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function parseVersion(versionStr) {
	const cleaned = String(versionStr || '').replace(/^[vV]/, '').trim()
	const parts = cleaned.split('.').map(p => {
		const num = parseInt(p, 10)
		return isNaN(num) ? 0 : num
	})
	while (parts.length < 3) parts.push(0)
	return {
		major: parts[0],
		minor: parts[1],
		patch: parts[2],
		raw: cleaned,
	}
}

function compareVersions(v1, v2) {
	const a = parseVersion(v1)
	const b = parseVersion(v2)
	if (a.major !== b.major) return a.major - b.major
	if (a.minor !== b.minor) return a.minor - b.minor
	return a.patch - b.patch
}

export async function health(ctx) {
  return {
    status: 'ok',
    timestamp: Date.now(),
    localdb: !!ctx.localdb,
    db: !!ctx.db,
  }
}

export async function echo(ctx, payload) {
  return {
    echo: payload,
    timestamp: Date.now(),
  }
}

export async function userAgreement() {
  const agreementPath = path.resolve(__dirname, '../../../dwebapp/user_agreement_and_security.md')
  try {
    if (fs.existsSync(agreementPath)) {
      const content = fs.readFileSync(agreementPath, 'utf-8')
      return { content }
    }
  } catch {}
  
  return { content: '# User Agreement\n\nWelcome to DVStudio.' }
}

export async function migrationStatus(ctx) {
  const checklist = getMigrationSummary()
  
  const registeredChannels = getBackendRouter()?.getRegisteredChannels() || []
  
  const dbTables = []
  if (ctx.db) {
    try {
      const rows = ctx.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
      for (const row of rows) dbTables.push(row.name)
    } catch {}
  }

  for (const [modKey, mod] of Object.entries(checklist.modules)) {
    for (const item of mod.items) {
      if (item.ipcChannel && item.ipcChannel.includes('*')) {
        const prefix = item.ipcChannel.replace('*', '')
        item.runtimeRegistered = registeredChannels.some(ch => ch.startsWith(prefix))
      } else if (item.ipcChannel) {
        item.runtimeRegistered = registeredChannels.includes(item.ipcChannel)
      } else {
        item.runtimeRegistered = null
      }

      if (item.status === 'done') {
        item.verified = item.runtimeRegistered !== false
      } else {
        item.verified = false
      }
    }
  }

  return {
    ...checklist,
    runtime: {
      registeredChannels,
      dbTables,
      backendRunning: !!getBackendRouter(),
      localdbConnected: !!ctx.db,
      djangoRunning: false,
      mode: 'migration',
    },
  }
}

export async function isSteam() {
	try {
		const mgr = getManager()
		const status = mgr.getStatus()
		return {
			ok: true,
			isSteam: status.activePlatform === 'steam',
		}
	} catch {
		return {
			ok: true,
			isSteam: false,
		}
	}
}

export async function checkUpdate() {
	try {
		const mgr = getManager()
		const status = mgr.getStatus()
		const isSteamVersion = status.activePlatform === 'steam'

		if (isSteamVersion) {
			return {
				ok: true,
				skipped: true,
				reason: 'steam',
				currentVersion: APP_VERSION,
			}
		}

		const repoMatch = APP_REPO_URL.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
		if (!repoMatch) {
			return {
				ok: false,
				error: 'Invalid repository URL',
				currentVersion: APP_VERSION,
			}
		}

		const owner = repoMatch[1]
		const repo = repoMatch[2]
		const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`

		const httpClient = getHttpClient()
		const response = await httpClient.get(apiUrl, {
			headers: {
				'Accept': 'application/vnd.github.v3+json',
				'User-Agent': 'DVStudio-UpdateChecker',
			},
			timeout: 10000,
		})

		if (!response.ok) {
			return {
				ok: false,
				error: `GitHub API request failed with status ${response.status}`,
				currentVersion: APP_VERSION,
			}
		}

		const releaseData = response.body
		const latestVersion = (releaseData.tag_name || '').replace(/^[vV]/, '').trim()
		const releaseUrl = releaseData.html_url || APP_REPO_URL + '/releases/latest'
		const releaseNotes = releaseData.body || ''
		const publishedAt = releaseData.published_at || null

		if (!latestVersion) {
			return {
				ok: false,
				error: 'Could not parse version from release',
				currentVersion: APP_VERSION,
			}
		}

		const hasUpdate = compareVersions(latestVersion, APP_VERSION) > 0

		return {
			ok: true,
			hasUpdate,
			currentVersion: APP_VERSION,
			latestVersion,
			releaseUrl,
			releaseNotes,
			publishedAt,
			isPrerelease: !!releaseData.prerelease,
			isDraft: !!releaseData.draft,
		}
	} catch (err) {
		return {
			ok: false,
			error: err?.message || String(err),
			currentVersion: APP_VERSION,
		}
	}
}
