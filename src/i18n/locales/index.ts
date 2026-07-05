import type { LocaleCode, LocalePackage } from '../types'
import zhCN from './zh-CN'
import enUS from './en-US'

const locales: Record<LocaleCode, LocalePackage> = {
	'zh-CN': zhCN,
	'en-US': enUS,
}

export function getLocalePackage(code: LocaleCode): LocalePackage {
	return locales[code]
}

export function getAvailableLocales() {
	return Object.values(locales).map((pkg) => pkg.meta)
}

export default locales
