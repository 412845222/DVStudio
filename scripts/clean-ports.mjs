import { execSync } from 'node:child_process'
import os from 'node:os'

const DEFAULT_PORTS = [5173]

function parsePortsFromArgs() {
	const args = process.argv.slice(2)
	const ports = []
	for (const arg of args) {
		const port = parseInt(arg, 10)
		if (!Number.isNaN(port) && port > 0 && port < 65536) {
			ports.push(port)
		}
	}
	return ports.length > 0 ? ports : DEFAULT_PORTS
}

function killProcessOnPortWin(port) {
	try {
		const result = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, {
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe']
		}).trim()

		if (!result) return false

		const lines = result.split('\n').filter(Boolean)
		let killed = false
		for (const line of lines) {
			const parts = line.trim().split(/\s+/)
			const pid = parts[parts.length - 1]
			if (pid && pid !== '0') {
				try {
					execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' })
					console.log(`[port-cleaner] Killed process ${pid} on port ${port}`)
					killed = true
				} catch (_) {}
			}
		}
		return killed
	} catch (_) {
		return false
	}
}

function killProcessOnPortUnix(port) {
	try {
		const result = execSync(`lsof -ti:${port} -sTCP:LISTEN`, {
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe']
		}).trim()

		if (!result) return false

		const pids = result.split('\n').filter(Boolean)
		let killed = false
		for (const pid of pids) {
			if (pid) {
				try {
					execSync(`kill -9 ${pid}`, { stdio: 'pipe' })
					console.log(`[port-cleaner] Killed process ${pid} on port ${port}`)
					killed = true
				} catch (_) {}
			}
		}
		return killed
	} catch (_) {
		return false
	}
}

function cleanPort(port) {
	const platform = os.platform()
	const isWin = platform === 'win32'

	try {
		if (isWin) {
			if (!killProcessOnPortWin(port)) {
				return false
			}
		} else {
			if (!killProcessOnPortUnix(port)) {
				try {
					execSync(`fuser -k ${port}/tcp 2>/dev/null`, { stdio: 'pipe' })
				} catch (_) {}
			}
		}
		return true
	} catch (err) {
		return false
	}
}

function main() {
	const ports = parsePortsFromArgs()
	let cleaned = 0

	for (const port of ports) {
		if (cleanPort(port)) {
			cleaned++
		}
	}

	if (cleaned > 0) {
		console.log(`[port-cleaner] Cleaned ${cleaned} port(s): ${ports.join(', ')}`)
	} else {
		console.log(`[port-cleaner] Ports ${ports.join(', ')} are free`)
	}
}

main()
