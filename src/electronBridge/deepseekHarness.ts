import { ipcCall as unwrapCall } from '../network/ipcClient'
import type { HarnessSetupApi, HarnessResult } from './deepseekHarnessTypes'

function ipcCall<T>(fn: () => Promise<HarnessResult<T>>): Promise<T> {
	return unwrapCall<T>(fn)
}

export function hasDeepSeekHarness(): boolean {
	return (
		typeof window !== 'undefined' &&
		typeof window.dweb?.deepseekHarness?.setup?.listProfiles === 'function'
	)
}
function api(): HarnessSetupApi {
	if (!hasDeepSeekHarness()) throw new Error('请在已就绪的 DVStudio 桌面客户端中管理 Harness 服务')
	return window.dweb!.deepseekHarness!.setup
}
// Access window.dweb only in this bridge; keep all invoke unwrapping here.
export const deepseekHarness = {
	listProfiles: () => ipcCall(() => api().listProfiles()),
	saveProfile: (payload: Parameters<HarnessSetupApi['saveProfile']>[0]) =>
		ipcCall(() => api().saveProfile(payload)),
	removeProfile: (payload: Parameters<HarnessSetupApi['removeProfile']>[0]) =>
		ipcCall(() => api().removeProfile(payload)),
	activateProfile: (payload: Parameters<HarnessSetupApi['activateProfile']>[0]) =>
		ipcCall(() => api().activateProfile(payload)),
	selectPath: () => ipcCall(() => api().selectPath()),
	probe: (payload: Parameters<HarnessSetupApi['probe']>[0]) => ipcCall(() => api().probe(payload)),
	snapshot: () => ipcCall(() => api().getServiceLogs()),
	clearLogs: () => ipcCall(() => api().clearServiceLogs()),
	start: (payload: Parameters<HarnessSetupApi['startService']>[0]) =>
		ipcCall(() => api().startService(payload)),
	stop: (payload: Parameters<HarnessSetupApi['stopService']>[0]) =>
		ipcCall(() => api().stopService(payload)),
	restart: (payload: Parameters<HarnessSetupApi['restartService']>[0]) =>
		ipcCall(() => api().restartService(payload)),
	prepare: (payload: Parameters<HarnessSetupApi['prepare']>[0]) => api().prepare(payload),
	cancelPrepare: (payload: Parameters<HarnessSetupApi['cancelPrepare']>[0]) =>
		ipcCall(() => api().cancelPrepare(payload)),
	openUi: (payload: Parameters<HarnessSetupApi['openUi']>[0]) =>
		ipcCall(() => api().openUi(payload)),
	subscribe: (listeners: {
		logs: Parameters<HarnessSetupApi['onServiceLog']>[0]
		changed: Parameters<HarnessSetupApi['onServiceStatusChange']>[0]
	}) => {
		const setup = api()
		const unsubs = [
			setup.onServiceLog(listeners.logs),
			setup.onServiceStatusChange(listeners.changed),
			setup.onServiceExit(listeners.changed),
			setup.onServiceLogsCleared(listeners.changed),
			setup.onConfigChange(listeners.changed)
		]
		return () => unsubs.forEach((off) => off())
	}
}
