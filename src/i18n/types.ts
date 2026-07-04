export type LocaleCode = 'zh-CN' | 'en-US'

export interface LocaleMeta {
	code: LocaleCode
	name: string
	englishName: string
	flag: string
}

export type TranslateMessages = Record<string, string>

export interface LocalePackage {
	meta: LocaleMeta
	messages: TranslateMessages
}

export type TranslateParams = Record<string, string | number>

export interface I18nInstance {
	readonly locale: LocaleCode
	readonly localeMeta: LocaleMeta
	readonly availableLocales: LocaleMeta[]
	t: (key: string, params?: TranslateParams) => string
	setLocale: (locale: LocaleCode) => Promise<void>
	init: () => Promise<void>
}

export const SUPPORTED_LOCALES: LocaleCode[] = ['zh-CN', 'en-US']

export const DEFAULT_LOCALE: LocaleCode = 'zh-CN'
