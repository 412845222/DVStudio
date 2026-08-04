import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipDirectory } from './utils/archive.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const sourceDir = path.join(
	repoRoot,
	'electron',
	'static',
	'unreal-plugin',
	'temp-source',
	'DwebWorkflowBridge'
)
const destinationZip = path.join(
	repoRoot,
	'electron',
	'static',
	'unreal-plugin',
	'DwebWorkflowBridge-source.zip'
)

await zipDirectory({ sourceDir, destinationZip })
process.stdout.write(`[pack:unreal-plugin] zip file: ${destinationZip}\n`)
