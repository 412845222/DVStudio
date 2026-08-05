import { computed, type App } from 'vue'
import { useStore } from 'vuex'
import type { LocaleCode, LocaleMeta, TranslateParams } from './types'
import { I18nStore, I18nStoreKey } from '../store/i18n/store'
import type { Store } from 'vuex'
import type { I18nState } from '../store/i18n/store'
import { getLocalePackage } from './locales'
import { translate as doTranslate } from './helpers'

type I18nStoreType = Store<I18nState>

function getStore(): I18nStoreType {
	try {
		const store = useStore(I18nStoreKey)
		if (store) return store
	} catch {
		// fall through to global store
	}
	return I18nStore
}

export function useI18n() {
	const store = getStore()

	const locale = computed<LocaleCode>(() => store.state.locale)
	const localeMeta = computed<LocaleMeta>(() => getLocalePackage(store.state.locale).meta)
	const availableLocales = computed<LocaleMeta[]>(() => store.getters.availableLocales)
	const messages = computed(() => getLocalePackage(store.state.locale).messages)

	function t(key: string, params?: TranslateParams): string {
		return doTranslate(messages.value, key, params)
	}

	async function setLocale(localeCode: LocaleCode) {
		await store.dispatch('setLocale', localeCode)
	}

	return {
		t,
		locale,
		localeMeta,
		availableLocales,
		setLocale,
		messages
	}
}

const VueI18nPlugin = {
	install(app: App) {
		const messages = computed(() => getLocalePackage(I18nStore.state.locale).messages)

		app.config.globalProperties.$t = (key: string, params?: TranslateParams) => {
			return doTranslate(messages.value, key, params)
		}
		app.config.globalProperties.$i18n = {
			locale: computed(() => I18nStore.state.locale),
			availableLocales: I18nStore.getters.availableLocales,
			setLocale: (loc: LocaleCode) => I18nStore.dispatch('setLocale', loc)
		}
		app.provide(I18nStoreKey, I18nStore)
	}
}

export function createI18n() {
	return VueI18nPlugin
}

export { I18nStoreKey }
