/**
 * Runtime platform detection for DVStudio.
 *
 * Supports three platforms:
 *  - "electron" : running inside Electron (preload bridge is available).
 *  - "web"      : running in a regular browser (dev / test / production web).
 *  - "unknown"  : detected none of the above (should not normally happen).
 *
 * The main purpose of this module is providing a single source of truth for
 * code that needs to know whether Electron-only APIs can be used.  The
 * "web" platform is explicitly supported via `npm run dev:web` so that
 * developers / testers can use the project without an Electron installation.
 */

type Platform = 'electron' | 'web' | 'unknown'

const VITE_PLATFORM_OVERRIDE = (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_PLATFORM) || ''

export const getRuntimePlatform = (): Platform => {
  if (typeof window === 'undefined') return 'unknown'
  const w = window as any
  // Explicit runtime injection
  if (w?.__DWEB_RUNTIME__?.platform === 'electron') return 'electron'
  if (w?.__DWEB_RUNTIME__?.platform === 'web') return 'web'
  // Preload bridge exists -> electron
  if (typeof w?.dweb?.common?.getBackendBaseUrl === 'function') return 'electron'
  // process.versions.electron -> electron (legacy fallback)
  try {
    if ((w.process as any)?.versions?.electron) return 'electron'
  } catch {
    // ignore
  }
  // Build-time override via env
  if (VITE_PLATFORM_OVERRIDE === 'electron') return 'electron'
  if (VITE_PLATFORM_OVERRIDE === 'web') return 'web'
  // Fallback: non-electron browser == web
  return 'web'
}

export const isElectron = () => getRuntimePlatform() === 'electron'
export const isWeb = () => getRuntimePlatform() === 'web'

// Convenience for exposing debug info to the in-browser debug panel.
export const runtimeDescription = (): Record<string, string> => {
  const base = (typeof window !== 'undefined' && (window as any).__DWEB_BACKEND_BASE_URL__) || ''
  return {
    platform: getRuntimePlatform(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    backendBaseUrl: base,
    vitePlatformOverride: String(VITE_PLATFORM_OVERRIDE || ''),
  }
}
