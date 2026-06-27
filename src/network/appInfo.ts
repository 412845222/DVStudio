import { isElectron } from './runtimePlatform'

type AppInfo = {
	appName: string
	appId?: string
	appVersion: string
	copyright: string
	license: string
	homepage: string
	repoUrl: string
}

const COMPILE_TIME_APP_INFO = {
	appVersion: __DWEB_APP_VERSION__,
	appName: __DWEB_APP_NAME__,
	copyright: __DWEB_APP_COPYRIGHT__,
	license: 'MPL-2.0',
	homepage: 'https://www.dweb.club/',
	repoUrl: __DWEB_REPO_URL__,
}

let cachedAppInfo: AppInfo | null = null

export function getAppInfo(): AppInfo {
	if (cachedAppInfo) return cachedAppInfo

	if (isElectron()) {
		try {
			const runtime = window.__DWEB_RUNTIME__
			const dwebCommon = window.dweb?.common
			if (typeof dwebCommon?.getAppInfo === 'function') {
				const info = dwebCommon.getAppInfo()
				if (info && info.appName) {
					cachedAppInfo = {
						appName: info.appName,
						appId: info.appId,
						appVersion: info.appVersion || COMPILE_TIME_APP_INFO.appVersion,
						copyright: info.copyright || COMPILE_TIME_APP_INFO.copyright,
						license: info.license || COMPILE_TIME_APP_INFO.license,
						homepage: info.homepage || COMPILE_TIME_APP_INFO.homepage,
						repoUrl: info.repoUrl || COMPILE_TIME_APP_INFO.repoUrl,
					}
					return cachedAppInfo
				}
			}
			if (runtime?.appName) {
				cachedAppInfo = {
					appName: runtime.appName,
					appVersion: runtime.appVersion || COMPILE_TIME_APP_INFO.appVersion,
					copyright: COMPILE_TIME_APP_INFO.copyright,
					license: COMPILE_TIME_APP_INFO.license,
					homepage: COMPILE_TIME_APP_INFO.homepage,
					repoUrl: COMPILE_TIME_APP_INFO.repoUrl,
				}
				return cachedAppInfo
			}
		} catch {
			// fallthrough to defaults
		}
	}

	cachedAppInfo = { ...COMPILE_TIME_APP_INFO }
	return cachedAppInfo
}

export function getAppName(): string {
	return getAppInfo().appName
}

export function getAppVersion(): string {
	return getAppInfo().appVersion
}

function openExternal(url: string) {
	if (!url || typeof window !== 'object') return
	try {
		const dwebCommon = window.dweb?.common
		if (typeof dwebCommon?.openExternalUrl === 'function') {
			void dwebCommon.openExternalUrl({ url })
			return
		}
	} catch {
		// ignore
	}
	window.open(url, '_blank', 'noopener')
}

export function openRepoUrl() {
	openExternal(getAppInfo().repoUrl)
}

export function openHomepage() {
	openExternal(getAppInfo().homepage)
}
