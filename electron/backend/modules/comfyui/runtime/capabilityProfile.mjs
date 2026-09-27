import { getJson, hashJson, isRecord } from './historyCatalog.mjs'

// Probe on each explicit resolution/run: a restart may change nodes without changing URL.
export async function probeNodeSchema(client, base) {
	return getJson(client, `${base}/object_info`)
}

function stableInputs(input) {
	return Object.fromEntries(
		Object.entries(input || {}).map(([section, fields]) => [
			section,
			isRecord(fields)
				? Object.fromEntries(
						Object.entries(fields).map(([key, definition]) => {
							const config = definition?.[1]
							if (
								!Array.isArray(definition) ||
								!(config?.image_upload || config?.video_upload || config?.audio_upload)
							)
								return [key, definition]
							// Uploaded filenames are inventory, not a node schema revision.
							const { options: _options, ...stableConfig } = config
							return [key, ['UPLOAD_FILE', stableConfig]]
						})
					)
				: fields
		])
	)
}

export function nodeSchemaHash(graph, schema) {
	if (!isRecord(schema) || !Object.keys(schema).length) return ''
	return hashJson(
		Object.fromEntries(
			[...new Set(Object.values(graph).map((n) => n.class_type))].sort().map((type) => [
				type,
				schema[type]
					? {
							input: stableInputs(schema[type].input),
							output: schema[type].output,
							output_node: schema[type].output_node
						}
					: null
			])
		)
	)
}
