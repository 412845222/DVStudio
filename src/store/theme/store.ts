import { createStore, type Store } from 'vuex'
import type { InjectionKey } from 'vue'

export type ThemeMode = 'dark' | 'light'

export interface ThemeState {
  mode: ThemeMode
}

export const ThemeKey: InjectionKey<Store<ThemeState>> = Symbol('ThemeStore')

const STORAGE_KEY = 'dweb-theme-mode'

function getStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // ignore
  }
  return 'dark' // default
}

function persistTheme(mode: ThemeMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // ignore
  }
}

export const ThemeStore: Store<ThemeState> = createStore<ThemeState>({
  state: () => ({
    mode: getStoredTheme(),
  }),

  getters: {
    isDarkMode: (state): boolean => state.mode === 'dark',
    isLightMode: (state): boolean => state.mode === 'light',
    currentTheme: (state): ThemeMode => state.mode,
  },

  mutations: {
    SET_THEME_MODE(state, mode: ThemeMode) {
      state.mode = mode
      persistTheme(mode)
      // Apply to document
      document.documentElement.setAttribute('data-theme', mode)
    },
  },

  actions: {
    toggleTheme({ commit, state }) {
      const next: ThemeMode = state.mode === 'dark' ? 'light' : 'dark'
      commit('SET_THEME_MODE', next)
    },
    setTheme({ commit }, mode: ThemeMode) {
      commit('SET_THEME_MODE', mode)
    },
    initTheme({ commit }) {
      // Initialize theme on app load
      const stored = getStoredTheme()
      commit('SET_THEME_MODE', stored)
    },
  },
})
