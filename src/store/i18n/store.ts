import { createStore, type Store } from 'vuex'
import type { InjectionKey } from 'vue'
import type { LocaleCode, LocaleMeta, TranslateParams } from '../../i18n/types'
import { DEFAULT_LOCALE } from '../../i18n/types'
import { getLocalePackage, getAvailableLocales } from '../../i18n/locales'
import { translate, detectSystemLocale, normalizeLocale, isSupportedLocale } from '../../i18n/helpers'

export interface I18nState {
	locale: LocaleCode
}

export const I18nStoreKey: InjectionKey<Store<I18nState>> = Symbol('I18nStore')

const STORAGE_KEY = 'dweb-locale'

function getStoredLocale(): LocaleCode | null {
	try {
		const stored = localStorage.getItem(STORAGE_KEY)
		if (stored && isSupportedLocale(stored)) return stored
	} catch {
		// ignore
	}
	return null
}

function persistLocale(locale: LocaleCode) {
	try {
		localStorage.setItem(STORAGE_KEY, locale)
	} catch {
		// ignore
	}
}

async function loadPersistedFromSettings(): Promise<LocaleCode | null> {
	try {
		const dweb = (window as any).dweb
		if (dweb?.common?.getClientSettings) {
			const result = await dweb.common.getClientSettings()
			const settings = result?.value || result
			const loc = settings?.ui?.locale || settings?.locale
			if (loc && isSupportedLocale(loc)) return loc
		}
	} catch {
		// ignore
	}
	return null
}

async function persistToSettings(locale: LocaleCode) {
	try {
		const dweb = (window as any).dweb
		if (dweb?.common?.saveClientSettings && dweb?.common?.getClientSettings) {
			const result = await dweb.common.getClientSettings()
			const settings = result?.value || result || {}
			const updated = {
				...settings,
				ui: {
					...(settings?.ui || {}),
					locale,
				},
			}
			await dweb.common.saveClientSettings(updated)
		}
	} catch {
		// ignore
	}
}

export const I18nStore = createStore<I18nState>({
	state: (): I18nState => ({
		locale: DEFAULT_LOCALE,
	}),

	getters: {
		currentLocale: (state): LocaleCode => state.locale,
		currentLocaleMeta: (state): LocaleMeta => getLocalePackage(state.locale).meta,
		availableLocales: (): LocaleMeta[] => getAvailableLocales(),
		t: (state) => (key: string, params?: TranslateParams): string => {
			const messages = getLocalePackage(state.locale).messages
			return translate(messages, key, params)
		},
	},

	mutations: {
		SET_LOCALE(state, locale: LocaleCode) {
			state.locale = locale
			persistLocale(locale)
		},
	},

	actions: {
		async initLocale({ commit }) {
			const fromSettings = await loadPersistedFromSettings()
			if (fromSettings) {
				commit('SET_LOCALE', fromSettings)
				return
			}
			const fromLocalStorage = getStoredLocale()
			if (fromLocalStorage) {
				commit('SET_LOCALE', fromLocalStorage)
				return
			}
			const systemLang = detectSystemLocale()
			const normalized = normalizeLocale(systemLang)
			if (isSupportedLocale(normalized)) {
				commit('SET_LOCALE', normalized)
			}
		},

		async setLocale({ commit }, locale: LocaleCode) {
			if (!isSupportedLocale(locale)) {
				console.warn(`[i18n] Unsupported locale: ${locale}`)
				return
			}
			commit('SET_LOCALE', locale)
			await persistToSettings(locale)
		},
	},
})

export function t(key: string, params?: TranslateParams): string {
	return I18nStore.getters.t(key, params)
}
