import crypto from 'node:crypto'
import { historyListItem, hashJson } from './historyCatalog.mjs'

export const RESOLVER_REVISION = '2026-09-27-socketless-v2'

// Field names and hashes only: never include prompts, model paths or widget values.
export function compareWorkflowSummary(workflow, candidate) {
	if (!candidate?.nodes) return { workflowMetadata: false }
	const previous = new Map(candidate.nodes.map((node) => [String(node.id), node]))
	const changes = []
	for (const node of workflow.nodes) {
		const other = previous.get(String(node.id))
		const fields = other
			? [
					'type',
					'mode',
					'inputs',
					'outputs',
					'widgets_values',
					'widgets_values_named',
					'properties'
				].filter((key) => hashJson(node[key] ?? null) !== hashJson(other[key] ?? null))
			: ['missing-node']
		if (fields.length) changes.push({ nodeId: String(node.id), fields })
		previous.delete(String(node.id))
	}
	for (const id of previous.keys()) changes.push({ nodeId: id, fields: ['additional-node'] })
	return { workflowMetadata: true, changedNodeCount: changes.length, changes: changes.slice(0, 20) }
}

export function templateFailure(error, message, base, catalog, extra = {}) {
	return {
		ok: false,
		error,
		message,
		baseUrl: base,
		candidates: catalog?.entries.map(historyListItem) || [],
		scanComplete: catalog?.complete,
		warnings: catalog?.warnings || [],
		diagnostics: {
			correlationId: crypto.randomUUID(),
			resolverRevision: RESOLVER_REVISION,
			stage: 'resolve',
			historyState: catalog
				? catalog.failure
					? 'unavailable'
					: !catalog.complete
						? 'incomplete'
						: catalog.entries.length
							? 'available'
							: 'empty'
				: 'unchecked',
			associationState: 'unresolved',
			readiness: 'blocked',
			scannedCount: catalog?.scannedCount || 0,
			rejectedHistory: catalog?.rejected || []
		},
		...extra
	}
}
