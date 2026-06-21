import crypto from 'node:crypto'

import { getLocalDb } from '../db.mjs'
import { isoToMs } from '../json.mjs'

const ALGO = 'aes-256-gcm'
const KEY_LEN = 32
const SALT_LEN = 16
const IV_LEN = 12
const ITERATIONS = 120_000

function deriveKey(secret, salt) {
	return crypto.pbkdf2Sync(Buffer.from(secret, 'utf-8'), salt, ITERATIONS, KEY_LEN, 'sha256')
}

function fingerprint(text) {
	if (!text) return ''
	return crypto.createHash('sha256').update(text).digest('hex')
}

function encrypt(plaintext, secret) {
	const text = String(plaintext || '')
	const salt = crypto.randomBytes(SALT_LEN)
	const iv = crypto.randomBytes(IV_LEN)
	const key = deriveKey(secret, salt)
	const cipher = crypto.createCipheriv(ALGO, key, iv)
	const buf = Buffer.concat([cipher.update(text, 'utf-8'), cipher.final()])
	const tag = cipher.getAuthTag()
	const payload = Buffer.concat([salt, iv, tag, buf])
	return payload.toString('base64')
}

function decrypt(ciphertext, secret) {
	if (!ciphertext) return ''
	const raw = Buffer.from(String(ciphertext), 'base64')
	const salt = raw.subarray(0, SALT_LEN)
	const iv = raw.subarray(SALT_LEN, SALT_LEN + IV_LEN)
	const tag = raw.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + 16)
	const data = raw.subarray(SALT_LEN + IV_LEN + 16)
	const key = deriveKey(secret, salt)
	const decipher = crypto.createDecipheriv(ALGO, key, iv)
	decipher.setAuthTag(tag)
	try {
		return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf-8')
	} catch (_) {
		return ''
	}
}

function rowToApiKey(row) {
	if (!row) return null
	return {
		id: row.id,
		provider: row.provider,
		keyFingerprint: row.key_fingerprint,
		hasKey: Boolean(row.key_ciphertext),
		createdAt: isoToMs(row.created_at),
		updatedAt: isoToMs(row.updated_at),
	}
}

export function createApiKeysRepo({ appSecret }) {
	const secret = String(appSecret || '').trim() || '__localdb_default_secret__'
	const db = getLocalDb()

	const listStmt = db.prepare('SELECT id, provider, key_fingerprint, created_at, updated_at FROM api_keys ORDER BY updated_at DESC')
	const getByProviderStmt = db.prepare('SELECT * FROM api_keys WHERE provider = ? LIMIT 1')
	const insertStmt = db.prepare(
		'INSERT INTO api_keys (provider, key_ciphertext, key_fingerprint) VALUES (?, ?, ?)',
	)
	const updateStmt = db.prepare(
		'UPDATE api_keys SET key_ciphertext = ?, key_fingerprint = ?, updated_at = datetime(\'now\') WHERE provider = ?',
	)
	const clearStmt = db.prepare(
		"UPDATE api_keys SET key_ciphertext = '', key_fingerprint = '', updated_at = datetime('now') WHERE provider = ?",
	)
	const deleteStmt = db.prepare('DELETE FROM api_keys WHERE provider = ?')

	function list() {
		return listStmt.all().map(rowToApiKey)
	}

	function get(provider) {
		const key = String(provider || '').trim()
		if (!key) return null
		const row = getByProviderStmt.get(key)
		return rowToApiKey(row)
	}

	function setPlaintext(provider, plaintext) {
		const key = String(provider || '').trim()
		if (!key) return { ok: false, error: 'provider is required' }
		const value = String(plaintext || '').trim()
		const run = db.transaction(() => {
			if (!value) {
				const exists = getByProviderStmt.get(key)
				if (exists) {
					clearStmt.run(key)
				} else {
					insertStmt.run(key, '', '')
				}
				return rowToApiKey(getByProviderStmt.get(key))
			}
			const ciphertext = encrypt(value, secret)
			const fp = fingerprint(value)
			const exists = getByProviderStmt.get(key)
			if (exists) updateStmt.run(ciphertext, fp, key)
			else insertStmt.run(key, ciphertext, fp)
			return rowToApiKey(getByProviderStmt.get(key))
		})
		return { ok: true, apiKey: run() }
	}

	function getPlaintext(provider) {
		const key = String(provider || '').trim()
		if (!key) return { ok: false, error: 'provider is required' }
		const row = getByProviderStmt.get(key)
		if (!row || !row.key_ciphertext) return { ok: true, plaintext: '' }
		const plaintext = decrypt(row.key_ciphertext, secret)
		const fp = fingerprint(plaintext)
		if (plaintext && fp !== row.key_fingerprint) return { ok: false, error: 'decrypted value failed fingerprint check' }
		return { ok: true, plaintext }
	}

	function remove(provider) {
		const key = String(provider || '').trim()
		if (!key) return { ok: false, error: 'provider is required' }
		deleteStmt.run(key)
		return { ok: true, provider: key }
	}

	return { list, get, setPlaintext, getPlaintext, remove }
}
