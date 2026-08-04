import { describe, it, expect } from 'vitest'
import { isJsonObject, type JsonObject, type JsonValue } from '@/core/shared/json'

describe('isJsonObject', () => {
	it('returns true for plain objects', () => {
		expect(isJsonObject({})).toBe(true)
		expect(isJsonObject({ a: 1 })).toBe(true)
		expect(isJsonObject({ nested: { b: 2 } })).toBe(true)
	})

	it('returns true for object with various JSON values', () => {
		const obj: JsonObject = {
			str: 'hello',
			num: 42,
			bool: true,
			null: null,
			arr: [1, 2, 3],
			nested: { key: 'value' }
		}
		expect(isJsonObject(obj)).toBe(true)
	})

	it('returns false for arrays', () => {
		expect(isJsonObject([])).toBe(false)
		expect(isJsonObject([1, 2, 3])).toBe(false)
		expect(isJsonObject(['a', 'b'])).toBe(false)
	})

	it('returns false for null', () => {
		expect(isJsonObject(null)).toBe(false)
	})

	it('returns false for primitives', () => {
		expect(isJsonObject('string')).toBe(false)
		expect(isJsonObject(123)).toBe(false)
		expect(isJsonObject(true)).toBe(false)
		expect(isJsonObject(false)).toBe(false)
		expect(isJsonObject(undefined)).toBe(false)
		expect(isJsonObject(Symbol('test'))).toBe(false)
	})

	it('returns false for Date (which is object but not plain)', () => {
		expect(isJsonObject(new Date())).toBe(false)
	})

	it('returns false for class instances', () => {
		class CustomClass {
			constructor(public value: number) {}
		}
		expect(isJsonObject(new CustomClass(1))).toBe(false)
	})

	it('handles edge cases', () => {
		expect(isJsonObject({ '': 'empty key' })).toBe(true)
		expect(isJsonObject({ ' ': 'space key' })).toBe(true)
	})
})
