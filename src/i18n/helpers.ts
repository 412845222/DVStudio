import type { TranslateMessages, TranslateParams } from './types'

export function interpolate(template: string, params?: TranslateParams): string {
	if (!params || !template) return template
	return template.replace(/\{(\w+)\}/g, (match, key: string) => {
		const value = params[key]
		return value !== undefined && value !== null ? String(value) : match
	})
}

export function translate(messages: TranslateMessages, key: string, params?: TranslateParams): string {
	const raw = messages[key]
	if (raw === undefined || raw === null) {
		if (import.meta.env?.DEV) {
			console.warn(`[i18n] Missing translation key: "${key}"`)
		}
		return key
	}
	return interpolate(raw, params)
}

export function mergeMessages(...parts: TranslateMessages[]): TranslateMessages {
	return Object.assign({}, ...parts)
}

export function detectSystemLocale(): string {
	if (typeof navigator !== 'undefined' && navigator.language) {
		return navigator.language
	}
	return 'zh-CN'
}

export function normalizeLocale(locale: string | undefined | null): string {
	if (!locale) return ''
	const normalized = locale.replace(/_/g, '-')
	if (normalized.toLowerCase().startsWith('zh')) {
		if (normalized.toLowerCase().includes('tw') || normalized.toLowerCase().includes('hk') || normalized.toLowerCase().includes('mo')) {
			return 'zh-TW'
		}
		return 'zh-CN'
	}
	if (normalized.toLowerCase().startsWith('en')) {
		return 'en-US'
	}
	return normalized
}

export function isSupportedLocale(locale: string): locale is import('./types').LocaleCode {
	return ['zh-CN', 'en-US'].includes(locale)
}
