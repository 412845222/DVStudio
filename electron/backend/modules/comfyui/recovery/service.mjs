import { dialog } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { getLocalDb, getLocalDbFilePath } from '../../../../localdb/db.mjs'
import { archiveScope } from '../runtime/archiveScope.mjs'
import {
	createRecoveryBundle,
	validateRecoveryBundle,
	restoreRecoveryBundle,
	MAX_BUNDLE_BYTES
} from './recoveryBundle.mjs'
import { readLegacyComfyBundle } from './legacyComfyImport.mjs'

export async function manageRecovery(ctx, payload) {
	try {
		const rawBase = String(payload?.baseUrl || '').trim()
		const base = (rawBase.includes('://') ? rawBase : 'http://' + rawBase).replace(/\/+$/, '')
		const url = new URL(base)
		if (
			!['http:', 'https:'].includes(url.protocol) ||
			url.username ||
			url.password ||
			url.search ||
			url.hash
		)
			throw new Error('请使用不含凭证或查询参数的 ComfyUI 服务地址')
		const scope = archiveScope(ctx, base)
		if (!scope.repo) throw new Error('本地归档数据库不可用')
		if (payload.action === 'export') {
			const bundle = createRecoveryBundle({
				profile: scope.profile,
				entries: scope.repo.list(base),
				workflows: ctx.localdb?.comfyuiWorkflows?.list() || []
			})
			const selected = await dialog.showSaveDialog({
				title: '导出 ComfyUI 恢复包（包含模板内容，请妥善保管）',
				defaultPath: 'DVStudio-ComfyUI-recovery.json',
				filters: [{ name: 'ComfyUI recovery', extensions: ['json'] }]
			})
			if (selected.canceled || !selected.filePath) return { ok: true, cancelled: true }
			const temp = selected.filePath + '.' + crypto.randomUUID() + '.tmp'
			try {
				await fs.writeFile(temp, JSON.stringify(bundle), { flag: 'wx' })
				await fs.rename(temp, selected.filePath)
			} finally {
				await fs.unlink(temp).catch(() => {})
			}
			return { ok: true, message: '恢复包已导出；请保存在安装目录外，输入媒体与模型需另行保留' }
		}
		if (!['import', 'legacy'].includes(payload.action)) throw new Error('未知恢复操作')
		const selected = await dialog.showOpenDialog({
			title:
				payload.action === 'legacy'
					? '选择旧安装的 BackendData/localdb.sqlite3'
					: '选择 ComfyUI 恢复包',
			properties: ['openFile'],
			filters: [
				{
					name: 'ComfyUI recovery',
					extensions: payload.action === 'legacy' ? ['sqlite3', 'db'] : ['json']
				}
			]
		})
		if (selected.canceled || !selected.filePaths[0]) return { ok: true, cancelled: true }
		const file = selected.filePaths[0]
		if (path.resolve(file) === path.resolve(getLocalDbFilePath()))
			throw new Error('请选择旧安装的数据库，而不是当前运行数据库')
		let bundle
		if (payload.action === 'legacy') bundle = readLegacyComfyBundle(file, base)
		else {
			if ((await fs.stat(file)).size > MAX_BUNDLE_BYTES) throw new Error('恢复包超过 32 MB')
			bundle = JSON.parse(await fs.readFile(file, 'utf8'))
		}
		const data = validateRecoveryBundle(bundle)
		const confirm = await dialog.showMessageBox({
			type: 'question',
			buttons: ['取消', '导入'],
			defaultId: 0,
			cancelId: 0,
			message: `将 ${data.entries.length} 条快照和 ${data.workflows.length} 个模板导入当前服务 ${base}？`,
			detail:
				'仅在这是原服务或你明确选择的迁移目标时导入。不会替换已有冲突记录，也不会导入凭证、模型或媒体文件。'
		})
		if (confirm.response !== 1) return { ok: true, cancelled: true }
		// Check legacy URL rows too before writing into the profile namespace.
		for (const e of data.entries) {
			const existing = scope.repo.get(base, e.promptId)
			if (existing && existing.contentHash !== e.contentHash)
				throw new Error('历史 ID 冲突，导入已取消')
		}
		// SQLite backup API includes WAL data; backup remains available for rollback.
		const db = getLocalDb()
		await db.backup(getLocalDbFilePath() + '.comfy-recovery-' + Date.now() + '.bak')
		const counts = restoreRecoveryBundle(db, scope.source, bundle)
		return { ok: true, ...counts, message: '恢复完成，请刷新模板与成功历史' }
	} catch (err) {
		return { ok: false, error: 'COMFY_RECOVERY_FAILED', message: String(err.message || err) }
	}
}
