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

function rowToConfig(row) {
	if (!row) return null
	return {
		id: row.id,
		providerId: row.provider_id,
		configured: Boolean(row.config_encrypted),
		configFingerprint: row.config_fingerprint,
		isActive: Boolean(row.is_active),
		lastTestedAt: row.last_tested_at ? isoToMs(row.last_tested_at) : null,
		lastTestOk: Boolean(row.last_test_ok),
		createdAt: isoToMs(row.created_at),
		updatedAt: isoToMs(row.updated_at)
	}
}

function maskAccessKey(ak) {
		if (!ak || typeof ak !== 'string') return ''
		if (ak.length <= 10) return ak
		return `${ak.slice(0, 6)}...${ak.slice(-4)}`
	}

	function rowToBucket(row) {
		if (!row) return null
		const aclStatus = row.acl_status || 'unknown'
		let akMask = ''
		if (row.config_encrypted) {
			try {
				const decrypted = decrypt(row.config_encrypted, secret)
				if (decrypted) {
					const cfg = JSON.parse(decrypted)
					akMask = maskAccessKey(cfg.credentials?.accessKeyId || cfg.accessKeyId || '')
				}
			} catch (_) {}
		}
		return {
			id: row.id,
			configId: row.config_id,
			bucketName: row.bucket_name,
			region: row.region,
			endpoint: row.endpoint,
			aclStatus,
			akMask,
			is_public: aclStatus === 'public-read',
			isActive: Boolean(row.is_active),
			createdAt: isoToMs(row.created_at),
			updatedAt: isoToMs(row.updated_at)
		}
	}

function sanitizePublicConfig(config) {
	if (!config || typeof config !== 'object') return {}
	const publicConfig = { ...config }
	delete publicConfig.credentials
	return publicConfig
}

let migrated = false

function migrateLegacyData(db, secret) {
	if (migrated) return
	migrated = true
	try {
		const activeConfig = db.prepare('SELECT * FROM cloud_storage_config WHERE is_active = 1 LIMIT 1').get()
		if (!activeConfig) return
		const decrypted = decrypt(activeConfig.config_encrypted, secret)
		if (!decrypted) return
		const config = JSON.parse(decrypted)
		const bucketName = config.bucketName
		if (!bucketName) return
		const existingBucket = db.prepare('SELECT id FROM cloud_storage_buckets WHERE config_id = ? AND bucket_name = ? LIMIT 1').get(activeConfig.id, bucketName)
		if (existingBucket) return
		const now = new Date()
		const pad = (n) => String(n).padStart(2, '0')
		const nowStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
		db.prepare(`
			INSERT INTO cloud_storage_buckets (config_id, bucket_name, region, endpoint, acl_status, is_active, created_at, updated_at)
			VALUES (?, ?, ?, ?, 'unknown', 1, ?, ?)
		`).run(activeConfig.id, bucketName, config.region || '', config.endpoint || '', nowStr, nowStr)
	} catch (err) {
		console.warn('[cloudStorageConfig] legacy migration failed:', err.message)
	}
}

export function createCloudStorageConfigRepo({ appSecret }) {
	const secret = String(appSecret || '').trim() || '__localdb_default_secret__'
	const db = getLocalDb()

	migrateLegacyData(db, secret)

	const getActiveStmt = db.prepare('SELECT * FROM cloud_storage_config WHERE is_active = 1 LIMIT 1')
	const getByIdStmt = db.prepare('SELECT * FROM cloud_storage_config WHERE id = ? LIMIT 1')
	const clearActiveStmt = db.prepare("UPDATE cloud_storage_config SET is_active = 0 WHERE is_active = 1")
	const insertStmt = db.prepare(`
		INSERT INTO cloud_storage_config (provider_id, config_encrypted, config_fingerprint, is_active, last_tested_at, last_test_ok)
		VALUES (?, ?, ?, 1, ?, ?)
	`)
	const updateStmt = db.prepare(`
		UPDATE cloud_storage_config
		SET provider_id = ?, config_encrypted = ?, config_fingerprint = ?, updated_at = datetime('now')
		WHERE id = ?
	`)
	const updateTestStatusStmt = db.prepare(`
		UPDATE cloud_storage_config
		SET last_tested_at = datetime('now'), last_test_ok = ?, updated_at = datetime('now')
		WHERE is_active = 1
	`)
	const deleteStmt = db.prepare('DELETE FROM cloud_storage_config WHERE id = ?')
	const clearAllStmt = db.prepare('DELETE FROM cloud_storage_config')
	const clearActiveConfigStmt = db.prepare("UPDATE cloud_storage_config SET is_active = 0 WHERE is_active = 1")
	const setActiveConfigByIdStmt = db.prepare("UPDATE cloud_storage_config SET is_active = 1, updated_at = datetime('now') WHERE id = ?")

	const listBucketsForConfigStmt = db.prepare('SELECT * FROM cloud_storage_buckets WHERE config_id = ? ORDER BY created_at ASC')
	const getAllBucketsStmt = db.prepare(`
		SELECT b.*, c.config_encrypted
		FROM cloud_storage_buckets b
		LEFT JOIN cloud_storage_config c ON b.config_id = c.id
		ORDER BY b.is_active DESC, b.created_at ASC
	`)
	const getBucketByIdStmt = db.prepare(`
		SELECT b.*, c.config_encrypted
		FROM cloud_storage_buckets b
		LEFT JOIN cloud_storage_config c ON b.config_id = c.id
		WHERE b.id = ? LIMIT 1
	`)
	const getActiveBucketStmt = db.prepare(`
		SELECT b.*, c.config_encrypted
		FROM cloud_storage_buckets b
		LEFT JOIN cloud_storage_config c ON b.config_id = c.id
		WHERE b.is_active = 1 LIMIT 1
	`)
	const getConfigByFingerprintStmt = db.prepare('SELECT * FROM cloud_storage_config WHERE config_fingerprint = ? LIMIT 1')
	const clearActiveBucketStmt = db.prepare("UPDATE cloud_storage_buckets SET is_active = 0 WHERE is_active = 1")
	const insertBucketStmt = db.prepare(`
		INSERT INTO cloud_storage_buckets (config_id, bucket_name, region, endpoint, acl_status, is_active, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
	`)
	const updateBucketAclStmt = db.prepare(`
		UPDATE cloud_storage_buckets
		SET acl_status = ?, updated_at = datetime('now')
		WHERE id = ?
	`)
	const deleteBucketStmt = db.prepare('DELETE FROM cloud_storage_buckets WHERE id = ?')

	function getActive() {
		const row = getActiveStmt.get()
		if (!row || !row.config_encrypted) {
			return { configured: false }
		}
		const decrypted = decrypt(row.config_encrypted, secret)
		if (!decrypted) {
			return { configured: false }
		}
		try {
			const config = JSON.parse(decrypted)
			const fp = fingerprint(decrypted)
			if (fp !== row.config_fingerprint) {
				return { configured: false, error: 'config fingerprint mismatch' }
			}
			const activeBucket = getActiveBucketStmt.get()
			if (activeBucket) {
				config.bucketName = activeBucket.bucket_name
				config.region = activeBucket.region || config.region
				config.endpoint = activeBucket.endpoint || config.endpoint
			}
			return {
				configured: true,
				providerId: row.provider_id,
				config,
				publicConfig: sanitizePublicConfig(config),
				lastTestedAt: row.last_tested_at ? isoToMs(row.last_tested_at) : null,
				lastTestOk: Boolean(row.last_test_ok),
			}
		} catch (_) {
			return { configured: false, error: 'failed to parse config' }
		}
	}

	function setActive(providerId, config, lastTestOk = 0) {
		const provider = String(providerId || '').trim()
		if (!provider) return { ok: false, error: 'providerId is required' }
		const configToSave = { ...(config || {}) }
		const bucketName = configToSave.bucketName
		delete configToSave.bucketName
		const configStr = JSON.stringify(configToSave)
		const testOk = lastTestOk ? 1 : 0
		const now = new Date()
		const pad = (n) => String(n).padStart(2, '0')
		const testedAt = testOk
			? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
			: null
		const run = db.transaction(() => {
			clearActiveConfigStmt.run()
			clearActiveBucketStmt.run()
			const ciphertext = encrypt(configStr, secret)
			const fp = fingerprint(configStr)
			const info = insertStmt.run(provider, ciphertext, fp, testedAt, testOk)
			const configId = info.lastInsertRowid
			if (bucketName) {
				insertBucketStmt.run(configId, bucketName, configToSave.region || '', configToSave.endpoint || '', 'unknown', 1)
			}
			return rowToConfig(getByIdStmt.get(configId))
		})
		try {
			const saved = run()
			return { ok: true, config: saved }
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	}

	function setActiveConfigById(configId) {
		const cid = Number(configId)
		if (!cid) return { ok: false, error: 'configId is required' }
		try {
			const run = db.transaction(() => {
				clearActiveConfigStmt.run()
				clearActiveBucketStmt.run()
				setActiveConfigByIdStmt.run(cid)
				const config = getByIdStmt.get(cid)
				if (!config) return null
				return rowToConfig(config)
			})
			const activeConfig = run()
			if (!activeConfig) return { ok: false, error: 'config not found' }
			return { ok: true, config: activeConfig }
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	}

	function clear() {
		const run = db.transaction(() => {
			clearAllStmt.run()
		})
		try {
			run()
			return { ok: true }
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	}

	function updateTestStatus(ok) {
		try {
			updateTestStatusStmt.run(ok ? 1 : 0)
			return { ok: true }
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	}

	function listConfiguredBuckets() {
		try {
			let rows = getAllBucketsStmt.all()
			const activeRows = rows.filter(r => Boolean(r.is_active))
			if (activeRows.length === 0 && rows.length > 0) {
				const firstBucket = rows[0]
				clearActiveBucketStmt.run()
				db.prepare("UPDATE cloud_storage_buckets SET is_active = 1, updated_at = datetime('now') WHERE id = ?").run(firstBucket.id)
				clearActiveStmt.run()
				db.prepare("UPDATE cloud_storage_config SET is_active = 1, updated_at = datetime('now') WHERE id = ?").run(firstBucket.config_id)
				rows = getAllBucketsStmt.all()
			} else if (activeRows.length > 1) {
				const firstActive = activeRows[0]
				clearActiveBucketStmt.run()
				db.prepare("UPDATE cloud_storage_buckets SET is_active = 1, updated_at = datetime('now') WHERE id = ?").run(firstActive.id)
				clearActiveStmt.run()
				db.prepare("UPDATE cloud_storage_config SET is_active = 1, updated_at = datetime('now') WHERE id = ?").run(firstActive.config_id)
				rows = getAllBucketsStmt.all()
			}
			return { ok: true, buckets: rows.map(rowToBucket) }
		} catch (err) {
			return { ok: false, error: String(err?.message || err), buckets: [] }
		}
	}

	function addBucket(configId, bucketName, region, endpoint, aclStatus = 'unknown') {
		const cid = Number(configId)
		const name = String(bucketName || '').trim()
		if (!cid) return { ok: false, error: 'configId is required' }
		if (!name) return { ok: false, error: 'bucketName is required' }
		try {
			const info = insertBucketStmt.run(cid, name, region || '', endpoint || '', aclStatus, 0)
			const bucket = rowToBucket(getBucketByIdStmt.get(info.lastInsertRowid))
			return { ok: true, bucket }
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	}

	function removeBucket(bucketId) {
		const bid = Number(bucketId)
		if (!bid) return { ok: false, error: 'bucketId is required' }
		try {
			const bucket = getBucketByIdStmt.get(bid)
			if (!bucket) return { ok: false, error: 'bucket not found' }
			const wasActive = Boolean(bucket.is_active)
			deleteBucketStmt.run(bid)
			if (wasActive) {
				const firstBucket = getAllBucketsStmt.get()
				if (firstBucket) {
					db.prepare("UPDATE cloud_storage_buckets SET is_active = 1 WHERE id = ?").run(firstBucket.id)
				}
			}
			return { ok: true }
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	}

	function setActiveBucket(bucketId) {
		const bid = Number(bucketId)
		if (!bid) return { ok: false, error: 'bucketId is required' }
		try {
			const run = db.transaction(() => {
				clearActiveBucketStmt.run()
				db.prepare("UPDATE cloud_storage_buckets SET is_active = 1, updated_at = datetime('now') WHERE id = ?").run(bid)
				const bucket = getBucketByIdStmt.get(bid)
				if (bucket) {
					clearActiveStmt.run()
					db.prepare("UPDATE cloud_storage_config SET is_active = 1, updated_at = datetime('now') WHERE id = ?").run(bucket.config_id)
				}
				return rowToBucket(bucket)
			})
			const activeBucket = run()
			if (!activeBucket) return { ok: false, error: 'bucket not found' }
			return { ok: true, bucket: activeBucket }
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	}

	function getActiveBucketWithConfig() {
		const bucket = getActiveBucketStmt.get()
		if (!bucket) return { ok: false, error: 'no active bucket' }
		const configRow = getByIdStmt.get(bucket.config_id)
		if (!configRow || !configRow.config_encrypted) {
			return { ok: false, error: 'config not found' }
		}
		const decrypted = decrypt(configRow.config_encrypted, secret)
		if (!decrypted) return { ok: false, error: 'failed to decrypt config' }
		try {
			const config = JSON.parse(decrypted)
			config.id = configRow.id
			config.bucketName = bucket.bucket_name
			config.region = bucket.region || config.region
			config.endpoint = bucket.endpoint || config.endpoint
			return {
				ok: true,
				providerId: configRow.provider_id,
				config,
				bucket: rowToBucket(bucket),
			}
		} catch (_) {
			return { ok: false, error: 'failed to parse config' }
		}
	}

	function updateBucketAcl(bucketId, aclStatus) {
		const bid = Number(bucketId)
		if (!bid) return { ok: false, error: 'bucketId is required' }
		const status = String(aclStatus || 'unknown')
		try {
			updateBucketAclStmt.run(status, bid)
			return { ok: true, bucket: rowToBucket(getBucketByIdStmt.get(bid)) }
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	}

	function findConfigByFingerprint(fp) {
		if (!fp) return null
		const row = getConfigByFingerprintStmt.get(fp)
		if (!row) return null
		return {
			id: row.id,
			providerId: row.provider_id,
			configFingerprint: row.config_fingerprint,
		}
	}

	function getConfigById(configId) {
		const cid = Number(configId)
		if (!cid) return null
		const row = getByIdStmt.get(cid)
		if (!row || !row.config_encrypted) return null
		const decrypted = decrypt(row.config_encrypted, secret)
		if (!decrypted) return null
		try {
			const config = JSON.parse(decrypted)
			const fp = fingerprint(decrypted)
			if (fp !== row.config_fingerprint) return null
			return {
				id: row.id,
				providerId: row.provider_id,
				config,
				publicConfig: sanitizePublicConfig(config),
				lastTestedAt: row.last_tested_at ? isoToMs(row.last_tested_at) : null,
				lastTestOk: Boolean(row.last_test_ok),
			}
		} catch (_) {
			return null
		}
	}

	function getBucketByName(configId, bucketName) {
		const cid = Number(configId)
		const name = String(bucketName || '').trim()
		if (!cid || !name) return null
		return db.prepare('SELECT * FROM cloud_storage_buckets WHERE config_id = ? AND bucket_name = ? LIMIT 1').get(cid, name)
	}

	return {
		getActive,
		setActive,
		setActiveConfigById,
		clear,
		updateTestStatus,
		listConfiguredBuckets,
		addBucket,
		removeBucket,
		setActiveBucket,
		getActiveBucketWithConfig,
		updateBucketAcl,
		findConfigByFingerprint,
		getConfigById,
		getBucketByName,
	}
}
