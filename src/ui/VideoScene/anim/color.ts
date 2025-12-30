import { lerpNumber } from '../../TimeLine/core/curveTick'

export type RGBA = { r: number; g: number; b: number; a: number }

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
const clamp255 = (n: number) => Math.max(0, Math.min(255, n))

const toByte = (n: number) => Math.round(clamp255(n))

const toHex2 = (n: number) => {
	const s = toByte(n).toString(16).toUpperCase()
	return s.length === 1 ? `0${s}` : s
}

export const rgbaToHex = (c: RGBA) => {
	const a = clamp01(c.a)
	if (a >= 1) return `#${toHex2(c.r)}${toHex2(c.g)}${toHex2(c.b)}`
	return `#${toHex2(c.r)}${toHex2(c.g)}${toHex2(c.b)}${toHex2(a * 255)}`
}

export const rgbaToRgbString = (c: RGBA) => {
	const r = toByte(c.r)
	const g = toByte(c.g)
	const b = toByte(c.b)
	const a = clamp01(c.a)
	if (a >= 1) return `rgb(${r}, ${g}, ${b})`
	return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`
}

const parseHexColor = (raw: string): RGBA | null => {
	const s = raw.trim()
	if (!s.startsWith('#')) return null
	const hex = s.slice(1)
	if (!/^[0-9a-fA-F]+$/.test(hex)) return null

	const toInt = (h: string) => Number.parseInt(h, 16)
	if (hex.length === 3 || hex.length === 4) {
		const r = toInt(hex[0] + hex[0])
		const g = toInt(hex[1] + hex[1])
		const b = toInt(hex[2] + hex[2])
		const a = hex.length === 4 ? toInt(hex[3] + hex[3]) / 255 : 1
		return { r, g, b, a }
	}
	if (hex.length === 6 || hex.length === 8) {
		const r = toInt(hex.slice(0, 2))
		const g = toInt(hex.slice(2, 4))
		const b = toInt(hex.slice(4, 6))
		const a = hex.length === 8 ? toInt(hex.slice(6, 8)) / 255 : 1
		return { r, g, b, a }
	}
	return null
}

const parseCssNumber = (raw: string): number | null => {
	const s = raw.trim()
	if (!s) return null
	const n = Number(s)
	return Number.isFinite(n) ? n : null
}

const parseRgbChannel = (raw: string): number | null => {
	const s = raw.trim()
	if (!s) return null
	if (s.endsWith('%')) {
		const p = Number(s.slice(0, -1))
		if (!Number.isFinite(p)) return null
		return clamp255((p / 100) * 255)
	}
	const n = parseCssNumber(s)
	if (n == null) return null
	return clamp255(n)
}

const parseAlpha = (raw: string): number | null => {
	const s = raw.trim()
	if (!s) return null
	if (s.endsWith('%')) {
		const p = Number(s.slice(0, -1))
		if (!Number.isFinite(p)) return null
		return clamp01(p / 100)
	}
	const n = parseCssNumber(s)
	if (n == null) return null
	return clamp01(n)
}

const parseRgbColor = (raw: string): RGBA | null => {
	const s = raw.trim()
	const m = /^rgba?\((.*)\)$/i.exec(s)
	if (!m) return null
	let body = m[1].trim()
	if (!body) return null

	let alphaPart: string | null = null
	if (body.includes('/')) {
		const parts = body.split('/')
		body = (parts[0] ?? '').trim()
		alphaPart = (parts[1] ?? '').trim()
	}

	const parts = body.includes(',') ? body.split(',') : body.split(/\s+/g)
	const r = parseRgbChannel(parts[0] ?? '')
	const g = parseRgbChannel(parts[1] ?? '')
	const b = parseRgbChannel(parts[2] ?? '')
	if (r == null || g == null || b == null) return null

	let a = 1
	const alphaRaw = alphaPart ?? parts[3]
	if (alphaRaw != null && String(alphaRaw).trim().length) {
		const aa = parseAlpha(String(alphaRaw))
		if (aa == null) return null
		a = aa
	}
	return { r, g, b, a }
}

export const parseColor = (raw: unknown): RGBA | null => {
	if (typeof raw !== 'string') return null
	return parseHexColor(raw) ?? parseRgbColor(raw)
}

const colorEqual = (a: RGBA, b: RGBA) => a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a

export type ColorFormat = 'hex' | 'rgb'

const detectFormat = (raw: unknown): ColorFormat | null => {
	if (typeof raw !== 'string') return null
	const s = raw.trim()
	if (s.startsWith('#')) return 'hex'
	if (/^rgba?\(/i.test(s)) return 'rgb'
	return null
}

export const convertColorString = (raw: unknown, format: ColorFormat): string | null => {
	const c = parseColor(raw)
	if (!c) return null
	return format === 'hex' ? rgbaToHex(c) : rgbaToRgbString(c)
}

export const interpolateColorString = (a: unknown, b: unknown, t: number, preferred?: ColorFormat): string | null => {
	const ca = parseColor(a)
	const cb = parseColor(b)
	if (!ca || !cb) return null

	// 颜色数值完全一致时，返回 a 的原始字符串，避免格式抖动（#fff -> rgba(...)）
	if (colorEqual(ca, cb)) return typeof a === 'string' ? a : typeof b === 'string' ? b : null

	const fmt = preferred ?? detectFormat(a) ?? detectFormat(b) ?? 'rgb'
	const out: RGBA = {
		r: lerpNumber(ca.r, cb.r, t),
		g: lerpNumber(ca.g, cb.g, t),
		b: lerpNumber(ca.b, cb.b, t),
		a: lerpNumber(ca.a, cb.a, t),
	}
	return fmt === 'hex' ? rgbaToHex(out) : rgbaToRgbString(out)
}
