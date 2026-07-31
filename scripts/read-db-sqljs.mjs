import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import initSqlJs from 'sql.js'

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

const projectRoot = findProjectRoot(__dirname)
console.log('[Script] Project root:', projectRoot)

const dbPath = path.join(projectRoot, 'DVSResource', 'BackendData', 'localdb.sqlite3')
console.log('[Script] Database path:', dbPath)

if (!fs.existsSync(dbPath)) {
  console.error('[Script] Database not found!')
  process.exit(1)
}

async function main() {
  const SQL = await initSqlJs()
  const dbBuffer = fs.readFileSync(dbPath)
  const db = new SQL.Database(dbBuffer)

  // List all tables
  const tablesResult = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  const tables = tablesResult[0]?.values.map(row => row[0]) || []
  console.log('[Script] All tables:', tables)

  function safeParseJSON(str) {
    if (!str) return str
    if (typeof str !== 'string') return str
    try {
      return JSON.parse(str)
    } catch {
      return str
    }
  }

  // Look for meshy tasks table
  for (const tableName of tables) {
    const lower = tableName.toLowerCase()
    if (lower.includes('meshy') || lower.includes('task')) {
      try {
        const countResult = db.exec(`SELECT COUNT(*) as cnt FROM "${tableName}"`)
        const count = countResult[0]?.values[0][0] || 0
        console.log(`\n[Script] === Table: ${tableName} (${count} rows) ===`)
        
        // Get columns
        const colsResult = db.exec(`PRAGMA table_info("${tableName}")`)
        const columns = colsResult[0]?.values.map(row => ({ name: row[1], type: row[2] })) || []
        console.log('[Script] Columns:', columns.map(c => `${c.name} (${c.type})`).join(', '))
        
        // Get all rows
        const dataResult = db.exec(`SELECT * FROM "${tableName}"`)
        const rows = dataResult[0]?.values || []
        const colNames = dataResult[0]?.columns || []
        
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]
          console.log(`\n[Script] --- Row ${i + 1} ---`)
          for (let j = 0; j < colNames.length; j++) {
            const key = colNames[j]
            let value = row[j]
            if (typeof value === 'string') {
              value = safeParseJSON(value)
            }
            if (typeof value === 'object' && value !== null) {
              console.log(`  ${key}:`, JSON.stringify(value, null, 2).slice(0, 3000))
            } else {
              console.log(`  ${key}:`, value)
            }
          }
        }
      } catch (e) {
        console.error(`[Script] Error reading table ${tableName}:`, e.message)
      }
    }
  }

  // Look for blueprint projects
  console.log('\n[Script] === Looking for blueprint projects ===')
  for (const tableName of tables) {
    const lower = tableName.toLowerCase()
    if (lower.includes('project') || lower.includes('blueprint') || lower.includes('workflow')) {
      try {
        const countResult = db.exec(`SELECT COUNT(*) as cnt FROM "${tableName}"`)
        const count = countResult[0]?.values[0][0] || 0
        console.log(`\n[Script] Table: ${tableName} (${count} rows)`)
        
        const colsResult = db.exec(`PRAGMA table_info("${tableName}")`)
        const columns = colsResult[0]?.values.map(row => row[1]) || []
        console.log('[Script] Columns:', columns.join(', '))
        
        const dataResult = db.exec(`SELECT * FROM "${tableName}"`)
        const rows = dataResult[0]?.values || []
        const colNames = dataResult[0]?.columns || []
        
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]
          console.log(`\n[Script] --- Row ${i + 1} ---`)
          for (let j = 0; j < colNames.length; j++) {
            const key = colNames[j]
            let value = row[j]
            if (typeof value === 'string') {
              value = safeParseJSON(value)
            }
            if (typeof value === 'object' && value !== null) {
              console.log(`  ${key}:`, JSON.stringify(value, null, 2).slice(0, 5000))
            } else {
              console.log(`  ${key}:`, String(value || '').slice(0, 500))
            }
          }
        }
      } catch (e) {
        console.error(`[Script] Error reading table ${tableName}:`, e.message)
      }
    }
  }

  db.close()
}

main().catch(err => {
  console.error('[Script] Fatal error:', err)
  process.exit(1)
})
