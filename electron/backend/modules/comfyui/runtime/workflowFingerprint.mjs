import { hashJson, isRecord } from './historyCatalog.mjs'

export const FINGERPRINT_VERSION = 1

// Only Comfy registry provenance is excluded. Unknown extension properties may execute.
const provenance = new Set(['ver', 'cnr_id'])
const layout = new Set(['pos', 'size', 'color', 'bgcolor'])
const sorted = (values) => values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))

function normalize(value, context = '') {
	if (Array.isArray(value)) {
		if (context === 'links') {
			return sorted(
				value.map((link) => {
					if (Array.isArray(link))
						return [String(link[0]), String(link[1]), link[2], String(link[3]), link[4], link[5]]
					if (isRecord(link) && 'origin_id' in link && 'target_id' in link)
						return [
							String(link.id),
							String(link.origin_id),
							link.origin_slot,
							String(link.target_id),
							link.target_slot,
							link.type
						]
					return normalize(link)
				})
			)
		}
		const result = value.map((v) => normalize(v, context === 'nodes' ? 'node' : ''))
		return context === 'nodes' ? sorted(result) : result
	}
	if (!isRecord(value)) return value
	const result = {}
	for (const [key, item] of Object.entries(value)) {
		if (context === 'properties' && provenance.has(key)) continue
		if (context === 'node' && (layout.has(key) || key === 'order')) continue
		if (context === 'node' && key === 'id') result[key] = String(item)
		else if (key === 'link' && item !== null) result[key] = String(item)
		else result[key] = normalize(item, key)
	}
	return result
}

export function semanticWorkflowHash(workflow) {
	if (!Array.isArray(workflow?.nodes) || !Array.isArray(workflow?.links)) return ''
	// Top-level identity, viewport and save counters do not execute. Subgraph contents
	// remain conservative: normalize node geometry but retain unknown definition fields.
	return hashJson({
		version: FINGERPRINT_VERSION,
		nodes: normalize(
			workflow.nodes.map((n) => ({ ...n, mode: n.mode ?? 0 })),
			'nodes'
		),
		links: normalize(workflow.links, 'links'),
		definitions: normalize(workflow.definitions)
	})
}
