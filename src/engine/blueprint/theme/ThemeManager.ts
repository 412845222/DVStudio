import { ThemeStore } from '../../../store/theme/store'
import type { ThemeMode } from './types'
import type { BlueprintThemeTokens, ThemeTokenName, NodeStatusColors } from './types'
import { getThemeTokens } from './tokens'

export type ThemeChangeCallback = (tokens: BlueprintThemeTokens) => void

export class ThemeManager {
	private static _instance: ThemeManager | null = null
	private _currentMode: ThemeMode
	private _tokens: BlueprintThemeTokens
	private _listeners: Set<ThemeChangeCallback> = new Set()
	private _unsubscribe: (() => void) | null = null

	private constructor() {
		this._currentMode = ThemeStore.state.mode
		this._tokens = getThemeTokens(this._currentMode)
		this._setupStoreSubscription()
	}

	static getInstance(): ThemeManager {
		if (!ThemeManager._instance) {
			ThemeManager._instance = new ThemeManager()
		}
		return ThemeManager._instance
	}

	private _setupStoreSubscription() {
		this._unsubscribe = ThemeStore.subscribe((mutation, state) => {
			if (mutation.type === 'SET_THEME_MODE') {
				this._currentMode = state.mode
				this._tokens = getThemeTokens(this._currentMode)
				this._notifyListeners()
			}
		})
	}

	private _notifyListeners() {
		for (const callback of this._listeners) {
			try {
				callback(this._tokens)
			} catch (e) {
				console.error('[ThemeManager] Listener error:', e)
			}
		}
	}

	get mode(): ThemeMode {
		return this._currentMode
	}

	get tokens(): BlueprintThemeTokens {
		return this._tokens
	}

	getToken<K extends ThemeTokenName>(name: K): BlueprintThemeTokens[K] {
		return this._tokens[name]
	}

	getStatusColors(status: string): NodeStatusColors {
		switch (status) {
			case 'running':
				return this._tokens.statusRunning
			case 'success':
				return this._tokens.statusSuccess
			case 'error':
				return this._tokens.statusError
			case 'selected':
				return this._tokens.statusSelected
			case 'hovered':
				return this._tokens.statusHovered
			case 'idle':
			default:
				return this._tokens.statusIdle
		}
	}

	onChange(callback: ThemeChangeCallback): () => void {
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
		ThemeManager._instance = null
	}
}

export function getThemeManager(): ThemeManager {
	return ThemeManager.getInstance()
}
