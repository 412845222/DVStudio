// Stable profile identities never implicitly merge different endpoints/users.
// Legacy URL-keyed rows are read lazily, so older clients can still use their data.
export function archiveScope(ctx, base) {
	const repo = ctx.localdb?.comfyuiHistorySnapshots
	if (!repo) return { repo: undefined, source: base }
	let profile
	try {
		profile = ctx.localdb?.comfyuiProfiles?.getOrCreate(base)
	} catch {
		// An old/unavailable profiles table must not disable the existing archive.
	}
	if (!profile) return { repo, source: base }
	const source = `profile://${profile.id}`
	return {
		profile,
		source,
		repo: {
			get: (_base, id) => repo.get(source, id) || repo.get(base, id),
			list: () => {
				const entries = new Map(repo.list(base).map((e) => [e.promptId, e]))
				for (const e of repo.list(source)) {
					if (entries.has(e.promptId) && entries.get(e.promptId).contentHash !== e.contentHash)
						throw new Error('Conflicting legacy ComfyUI snapshot')
					entries.set(e.promptId, e)
				}
				return [...entries.values()]
			},
			save: (_base, entry) => {
				const legacy = repo.get(base, entry.promptId)
				if (legacy && legacy.contentHash !== entry.contentHash)
					throw new Error('Conflicting legacy ComfyUI snapshot')
				return repo.save(source, entry)
			}
		}
	}
}
