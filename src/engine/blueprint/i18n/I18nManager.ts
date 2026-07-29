import { I18nStore } from '../../../store/i18n/store'
import type { LocaleChangeCallback, TranslateParams } from './types'

export class I18nManager {
	private static _instance: I18nManager | null = null
	private _listeners: Set<LocaleChangeCallback> = new Set()
	private _unsubscribe: (() => void) | null = null

	private constructor() {
		this._setupStoreSubscription()
	}

	static getInstance(): I18nManager {
		if (!I18nManager._instance) {
			I18nManager._instance = new I18nManager()
		}
		return I18nManager._instance
	}

	private _setupStoreSubscription() {
		this._unsubscribe = I18nStore.subscribe((mutation) => {
			if (mutation.type === 'SET_LOCALE') {
				this._notifyListeners()
			}
		})
	}

	private _notifyListeners() {
		for (const callback of this._listeners) {
			try {
				callback()
			} catch (e) {
				console.error('[I18nManager] Listener error:', e)
			}
		}
	}

	t(key: string, params?: TranslateParams): string {
		try {
			return I18nStore.getters.t(key, params)
		} catch (e) {
			console.warn(`[I18nManager] Missing translation for key: ${key}`)
			return key
		}
	}

	get locale(): string {
		return I18nStore.state.locale
	}

	onChange(callback: LocaleChangeCallback): () => void {
		this._listeners.add(callback)
		return () => {
			this._listeners.delete(callback)
		}
	}

	destroy() {
		if (this._unsubscribe) {
			this._unsubscribe()
			this._unsubscribe = null
		}
		this._listeners.clear()
		I18nManager._instance = null
	}
}

let _i18nManager: I18nManager | null = null

export function getI18nManager(): I18nManager {
	if (!_i18nManager) {
		_i18nManager = I18nManager.getInstance()
	}
	return _i18nManager
}

export function t(key: string, params?: TranslateParams): string {
	return getI18nManager().t(key, params)
}
