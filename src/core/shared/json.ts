export type JsonPrimitive = string | number | boolean | null

export type JsonValue = JsonPrimitive | JsonObject | JsonArray

export type JsonObject = { [key: string]: JsonValue }

export type JsonArray = JsonValue[]

export const isJsonObject = (v: unknown): v is JsonObject => {
	if (v == null || typeof v !== 'object') return false
	if (Array.isArray(v)) return false
	const proto = Object.getPrototypeOf(v)
	return proto === null || proto === Object.prototype
}
