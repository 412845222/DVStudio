import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import logger from '../../core/logger.mjs'
import { CLI_TOKEN_HEADER } from './types.mjs'

const log = logger.child('cli-control-server:auth')

export function generateToken() {
	return 'dvs_cli_' + crypto.randomBytes(24).toString('hex')
}

/**
 * 验证请求头中的 Token
 */
export function verifyRequestToken(req, expectedToken) {
	const headerToken = req.headers[CLI_TOKEN_HEADER] || req.headers[CLI_TOKEN_HEADER.toLowerCase()]
	if (!headerToken) return false
	if (typeof headerToken !== 'string') return false
	const a = Buffer.from(headerToken.trim())
	const b = Buffer.from(expectedToken)
	if (a.length !== b.length) return false
	return crypto.timingSafeEqual(a, b)
}

/**
 * 安全写入 Runtime JSON 文件（仅限当前用户可读）
 */
export function writeRestrictedJson(filePath, data) {
	try {
		const dir = path.dirname(filePath)
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true })
		}
		const json = JSON.stringify(data, null, 2)
		fs.writeFileSync(filePath, json, 'utf8')
		try {
			if (process.platform !== 'win32') {
				fs.chmodSync(filePath, 0o600)
			}
		} catch (chmodErr) {
			log.debug(`chmod not supported for ${filePath}: ${chmodErr.message}`)
		}
		return { ok: true }
	} catch (err) {
		log.error(`writeRestrictedJson failed: ${err.message}`)
		return { ok: false, error: err.message }
	}
}

export function safeDeleteFile(filePath) {
	try {
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath)
		}
		return { ok: true }
	} catch (err) {
		log.warn(`safeDeleteFile failed for ${filePath}: ${err.message}`)
		return { ok: false, error: err.message }
	}
}

export function readJsonIfExists(filePath) {
	try {
		if (!fs.existsSync(filePath)) return null
		const raw = fs.readFileSync(filePath, 'utf8')
		return JSON.parse(raw)
	} catch (err) {
		log.warn(`readJsonIfExists failed for ${filePath}: ${err.message}`)
		return null
	}
}
