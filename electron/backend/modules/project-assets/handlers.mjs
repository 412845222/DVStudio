import { invalidParamsError } from '../../core/errors.mjs'
import {
	uploadBufferProjectAsset,
	importUrlProjectAsset,
	importFileProjectAsset,
	deleteStaticProjectAsset,
	resolveStaticProjectAsset,
	repairAllProjectAssets
} from '../../projectStaticAssets/service.mjs'
import { repairProjectAsset } from '../../projectAssetProtocol.mjs'

export async function health() {
	return { ok: true, route: 'project-assets', schemaVersion: 1 }
}

export async function uploadAsset(_ctx, payload) {
	return uploadBufferProjectAsset(payload || {})
}

export async function importAsset(_ctx, payload) {
	const p = payload || {}
	if (p.sourcePath || p.path) {
		return importFileProjectAsset(p)
	}
	return importUrlProjectAsset(p)
}

export async function deleteAsset(_ctx, payload) {
	return deleteStaticProjectAsset(payload || {})
}

export async function resolveAsset(_ctx, payload) {
	return resolveStaticProjectAsset(payload || {})
}

export async function repairAsset(_ctx, payload) {
	return repairProjectAsset(payload || {})
}

export async function repairAllAssets(_ctx, payload) {
	return repairAllProjectAssets(payload || {})
}

export function registerRoot(ctx, payload) {
	const projectId = Number(payload?.projectId)
	const rootPath = String(payload?.rootPath || '').trim()
	if (!Number.isFinite(projectId) || projectId <= 0) {
		throw invalidParamsError('projectId is invalid')
	}
	if (!rootPath) {
		ctx.protocol.clearProjectRoot(projectId)
		return { ok: true, cleared: true }
	}
	return ctx.protocol.setProjectRoot(projectId, rootPath)
}

export function clearRoot(ctx, payload) {
	const projectId = Number(payload?.projectId)
	if (!Number.isFinite(projectId) || projectId <= 0) {
		throw invalidParamsError('projectId is invalid')
	}
	ctx.protocol.clearProjectRoot(projectId)
	return { ok: true }
}

export function validateRoot(ctx, payload) {
	const projectId = Number(payload?.projectId)
	if (!Number.isFinite(projectId) || projectId <= 0) {
		throw invalidParamsError('projectId is invalid')
	}
	const expected = String(payload?.expectedRootPath || '').trim()
	if (expected) {
		const result = ctx.protocol.setProjectRoot(projectId, expected)
		return {
			ok: true,
			reRegistered: result?.ok,
			registerResult: result,
			validation: ctx.protocol.validateProjectRoot(projectId)
		}
	}
	return { ok: true, validation: ctx.protocol.validateProjectRoot(projectId) }
}

export function getRootSnapshot(ctx) {
	return { ok: true, snapshot: ctx.protocol.getProjectRootSnapshot() }
}

export function diagnose(ctx, payload) {
	return ctx.protocol.diagnoseDwebAsset(payload || {})
}

export function getAccessLogs(ctx, payload) {
	const maxEntries = Number(payload?.maxEntries)
	return {
		ok: true,
		logs: ctx.protocol.getAccessLogs(
			Number.isFinite(maxEntries) && maxEntries > 0 ? Math.floor(maxEntries) : 100
		)
	}
}
