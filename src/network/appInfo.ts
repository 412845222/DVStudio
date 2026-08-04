import { isElectron } from './runtimePlatform'

export type UpdateCheckResult = {
	ok: boolean
	skipped?: boolean
	reason?: string
	hasUpdate?: boolean
	currentVersion: string
	latestVersion?: string
	releaseUrl?: string
	releaseNotes?: string
	publishedAt?: string
	isPrerelease?: boolean
	isDraft?: boolean
	error?: string
}

type AppInfo = {
	appName: string
	appId?: string
	appVersion: string
	copyright: string
	license: string
	homepage: string
	repoUrl: string
	bilibiliUrl: string
	issuesUrl: string
}

const COMPILE_TIME_APP_INFO = {
	appVersion: __DWEB_APP_VERSION__,
	appName: __DWEB_APP_NAME__,
	copyright: __DWEB_APP_COPYRIGHT__,
	license: 'MPL-2.0',
	homepage: __DWEB_HOMEPAGE_URL__,
	repoUrl: __DWEB_REPO_URL__,
	bilibiliUrl: __DWEB_BILIBILI_URL__,
	issuesUrl: __DWEB_ISSUES_URL__
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
						bilibiliUrl: info.bilibiliUrl || COMPILE_TIME_APP_INFO.bilibiliUrl,
						issuesUrl: info.issuesUrl || COMPILE_TIME_APP_INFO.issuesUrl
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
					bilibiliUrl: COMPILE_TIME_APP_INFO.bilibiliUrl,
					issuesUrl: COMPILE_TIME_APP_INFO.issuesUrl
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

export function openBilibili() {
	openExternal(getAppInfo().bilibiliUrl)
}

export function openIssues() {
	openExternal(getAppInfo().issuesUrl)
}

export function openExternalUrl(url: string) {
	openExternal(url)
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
	const info = getAppInfo()
	if (!isElectron()) {
		return {
			ok: false,
			error: 'Not running in Electron',
			currentVersion: info.appVersion
		}
	}
	try {
		const dwebCommon = window.dweb?.common
		if (typeof dwebCommon?.checkForUpdate === 'function') {
			const result = await dwebCommon.checkForUpdate()
			return result as UpdateCheckResult
		}
		return {
			ok: false,
			error: 'Update check not available',
			currentVersion: info.appVersion
		}
	} catch (e: unknown) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : String(e),
			currentVersion: info.appVersion
		}
	}
}

export async function isSteamVersion(): Promise<boolean> {
	if (!isElectron()) return false
	try {
		const dwebCommon = window.dweb?.common
		if (typeof dwebCommon?.isSteamVersion === 'function') {
			const result = await dwebCommon.isSteamVersion()
			return result?.isSteam === true
		}
	} catch {
		// ignore
	}
	return false
}
