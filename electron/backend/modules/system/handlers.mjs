import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getMigrationSummary } from './migration-checklist.mjs'
import { getBackendRouter } from '../../index.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
