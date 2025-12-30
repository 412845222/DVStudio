export type JsonPrimitive = string | number | boolean | null

export type JsonValue = JsonPrimitive | JsonObject | JsonArray

export type JsonObject = { [key: string]: JsonValue }

export type JsonArray = JsonValue[]

export const isJsonObject = (v: unknown): v is JsonObject => {
	if (v == null || typeof v !== 'object') return false
	if (Array.isArray(v)) return false
	return true
}
