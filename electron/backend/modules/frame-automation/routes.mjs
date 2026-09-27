import { validateAssets } from './assets.mjs'
const actions = ['create', 'append', 'list', 'get', 'reconcile', 'validateAssets']
export const routes = actions.map((action) => ({
	channel: `dweb:frame-automation:${action}`,
	handler: async (ctx, payload) => {
		if (!Number.isInteger(payload?.projectId) || payload.projectId <= 0)
			return { ok: false, error: 'PROJECT_REQUIRED' }
		const repo = ctx.localdb?.frameAutomationRuns
		if (!repo) return { ok: false, error: 'LOCALDB_UNAVAILABLE' }
		try {
			if (action === 'validateAssets') {
				const project = ctx.localdb.projects.getById(payload.projectId)
				if (!project) throw new Error('PROJECT_NOT_FOUND')
				return {
					ok: true,
					value: await validateAssets(project.rootPath, payload.resources, payload.expected)
				}
			}
			return { ok: true, value: repo[action](payload) }
		} catch (err) {
			return { ok: false, error: String(err.message || err) }
		}
	}
}))
