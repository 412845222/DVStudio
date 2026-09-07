import { randomUUID } from 'node:crypto'
import { getLocalDb } from '../db.mjs'

export function createDeepSeekHarnessProfilesRepo(db = getLocalDb()) {
	const decode = (row) =>
		row ? { ...JSON.parse(row.data), id: row.id, revision: row.revision } : null
	const get = (id) =>
		decode(db.prepare('SELECT * FROM deepseek_harness_profiles WHERE id = ?').get(id))
	const selection = () =>
		db
			.prepare(
				'SELECT active_profile_id AS activeProfileId, revision FROM deepseek_harness_settings WHERE id = 1'
			)
			.get()
	const check = (actual, expected) => {
		if (actual !== expected)
			throw new Error('配置已被其他窗口修改，请刷新后重试（REVISION_CONFLICT）')
	}
	return {
		get,
		list: () => ({
			records: db
				.prepare('SELECT * FROM deepseek_harness_profiles ORDER BY updated_at DESC')
				.all()
				.map(decode),
			...selection()
		}),
		save: db.transaction((profile, expectedRevision) => {
			const old = profile.id ? get(profile.id) : null
			if (profile.id && !old) throw new Error('源码记录不存在')
			check(old?.revision ?? 0, expectedRevision)
			const duplicate = db
				.prepare('SELECT id FROM deepseek_harness_profiles WHERE canonical_path = ?')
				.get(profile.canonicalPath)
			if (duplicate && duplicate.id !== profile.id)
				throw new Error('该源码目录已有记录，请选择已有记录')
			const now = Date.now()
			const value = {
				...profile,
				id: old?.id || randomUUID(),
				revision: (old?.revision || 0) + 1,
				createdAt: old?.createdAt || now,
				updatedAt: now
			}
			db.prepare(
				'INSERT INTO deepseek_harness_profiles (id, canonical_path, data, revision, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET canonical_path=excluded.canonical_path, data=excluded.data, revision=excluded.revision, updated_at=excluded.updated_at'
			).run(value.id, value.canonicalPath, JSON.stringify(value), value.revision, now)
			return value
		}),
		activate: db.transaction((id, expectedRevision) => {
			check(selection().revision, expectedRevision)
			if (!get(id)) throw new Error('源码记录不存在')
			db.prepare(
				'UPDATE deepseek_harness_settings SET active_profile_id = ?, revision = revision + 1 WHERE id = 1'
			).run(id)
			return selection()
		}),
		remove: db.transaction((id, expectedRevision) => {
			const old = get(id)
			if (!old) throw new Error('源码记录不存在')
			check(old.revision, expectedRevision)
			db.prepare(
				'UPDATE deepseek_harness_settings SET active_profile_id = NULL, revision = revision + 1 WHERE active_profile_id = ?'
			).run(id)
			db.prepare('DELETE FROM deepseek_harness_profiles WHERE id = ?').run(id)
		})
	}
}
