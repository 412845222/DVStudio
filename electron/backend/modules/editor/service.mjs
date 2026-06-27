import { internalError, invalidParamsError, notFoundError } from '../../core/errors.mjs'

function getRepo(ctx) {
	const repo = ctx.localdb?.editorComponents
	if (!repo) throw internalError('editorComponents repo not available')
	return repo
}

export function listComponents(ctx, payload) {
	const repo = getRepo(ctx)
	const q = String(payload?.q || '').trim()
	const limit = Number(payload?.limit) || 200
	const offset = Number(payload?.offset) || 0
	return repo.list({ q: q || undefined, limit, offset })
}

export function saveComponent(ctx, payload) {
	const repo = getRepo(ctx)
	const p = payload || {}
	const templateId = String(p.templateId || '').trim()
	const name = String(p.name || '').trim()
	const template = p.template
	if (!templateId) throw invalidParamsError('templateId is required')
	if (!name) throw invalidParamsError('name is required')
	if (!template || typeof template !== 'object') throw invalidParamsError('template must be object')

	const coerced = { ...template }
	coerced.schemaVersion = Number(template.schemaVersion || template.schema_version || 1) || 1
	coerced.templateId = templateId
	coerced.name = name

	if (coerced.schemaVersion !== 1) throw invalidParamsError('template.schemaVersion must be 1')
	if (!coerced.rootLocalId || typeof coerced.rootLocalId !== 'string' || !coerced.rootLocalId.trim()) {
		throw invalidParamsError('template.rootLocalId must be non-empty string')
	}
	if (!Array.isArray(coerced.nodes)) throw invalidParamsError('template.nodes must be array')
	if (!Array.isArray(coerced.params)) coerced.params = []

	const result = repo.upsert({
		id: p.id,
		templateId,
		name,
		template: coerced,
		thumbAssetId: p.thumbAssetId,
		thumbDataUrl: p.thumbDataUrl,
		category: p.category,
		tags: p.tags
	})

	if (!result.ok) throw internalError(result.error || 'failed to save component')
	return { item: result.item, upserted: true }
}

export function deleteComponent(ctx, payload) {
	const repo = getRepo(ctx)
	const id = String(payload?.id || payload?.itemId || '').trim()
	if (!id) throw invalidParamsError('id is required')
	const result = repo.remove(id)
	if (!result.ok) {
		if (result.error === 'component not found') throw notFoundError('component not found')
		throw internalError(result.error || 'failed to delete component')
	}
	return { ok: true }
}

export function importComponents(ctx, payload) {
	const repo = getRepo(ctx)
	const items = Array.isArray(payload?.items) ? payload.items : []
	return repo.importComponents(items)
}

export function getComponent(ctx, payload) {
	const repo = getRepo(ctx)
	const id = String(payload?.id || '').trim()
	const templateId = String(payload?.templateId || '').trim()
	let item = null
	if (id) item = repo.getById(id)
	if (!item && templateId) item = repo.getByTemplateId(templateId)
	if (!item) throw notFoundError('component not found')
	return { item }
}
