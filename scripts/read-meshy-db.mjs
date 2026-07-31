import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
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

let Database
try {
	Database = require(path.join(projectRoot, 'node_modules', 'better-sqlite3'))
} catch (e) {
	console.error('[Script] Cannot load better-sqlite3:', e.message)
	process.exit(1)
}

const db = new Database(dbPath)
console.log('[Script] Database opened successfully')

// List all tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
console.log(
	'[Script] All tables:',
	tables.map((t) => t.name)
)

// Find meshy-related tables and show their data
const tableNames = tables.map((t) => t.name)

// Helper to safely parse JSON
function safeParseJSON(str) {
	if (!str) return str
	if (typeof str !== 'string') return str
	try {
		return JSON.parse(str)
	} catch {
		return str
	}
}

// Look for meshy tasks
for (const tableName of tableNames) {
	const lower = tableName.toLowerCase()
	if (lower.includes('meshy') || lower.includes('task')) {
		try {
			const count = db.prepare(`SELECT COUNT(*) as cnt FROM "${tableName}"`).get()
			console.log(`\n[Script] === Table: ${tableName} (${count.cnt} rows) ===`)

			const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all()
			console.log('[Script] Columns:', columns.map((c) => `${c.name} (${c.type})`).join(', '))

			const rows = db.prepare(`SELECT * FROM "${tableName}"`).all()
			for (let i = 0; i < rows.length; i++) {
				const row = rows[i]
				console.log(`\n[Script] --- Row ${i + 1} ---`)
				for (const [key, value] of Object.entries(row)) {
					const parsed = safeParseJSON(value)
					if (typeof parsed === 'object' && parsed !== null) {
						console.log(`  ${key}:`, JSON.stringify(parsed, null, 4))
					} else {
						console.log(`  ${key}:`, parsed)
					}
				}
			}
		} catch (e) {
			console.error(`[Script] Error reading table ${tableName}:`, e.message)
		}
	}
}

// Also look for blueprint projects
console.log('\n[Script] === Looking for blueprint projects ===')
for (const tableName of tableNames) {
	const lower = tableName.toLowerCase()
	if (lower.includes('project') || lower.includes('blueprint') || lower.includes('workflow')) {
		try {
			const count = db.prepare(`SELECT COUNT(*) as cnt FROM "${tableName}"`).get()
			console.log(`\n[Script] Table: ${tableName} (${count.cnt} rows)`)

			const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all()
			console.log('[Script] Columns:', columns.map((c) => c.name).join(', '))

			const rows = db.prepare(`SELECT * FROM "${tableName}"`).all()
			for (let i = 0; i < rows.length; i++) {
				const row = rows[i]
				console.log(`\n[Script] --- Project/Blueprint Row ${i + 1} ---`)
				for (const [key, value] of Object.entries(row)) {
					const parsed = safeParseJSON(value)
					if (typeof parsed === 'object' && parsed !== null) {
						console.log(`  ${key}:`, JSON.stringify(parsed, null, 2).slice(0, 2000))
					} else {
						console.log(`  ${key}:`, String(parsed || '').slice(0, 500))
					}
				}
			}
		} catch (e) {
			console.error(`[Script] Error reading table ${tableName}:`, e.message)
		}
	}
}

db.close()
