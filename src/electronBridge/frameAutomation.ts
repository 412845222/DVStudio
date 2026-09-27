import { ipcCall } from '../network/ipcClient'

export async function frameAutomationRequest<T>(
	action: 'create' | 'append' | 'list' | 'get' | 'reconcile' | 'validateAssets',
	payload: object
): Promise<T> {
	const bridge = (
		window as unknown as {
			dweb?: {
				frameAutomation?: Record<
					string,
					(p: object) => Promise<{ ok: boolean; value: T; error?: string }>
				>
			}
		}
	).dweb?.frameAutomation
	if (!bridge?.[action]) throw new Error('自动化记录不可用：请更新并重启 Electron 客户端')
	return ipcCall<T>(() => bridge[action](JSON.parse(JSON.stringify(payload))))
}
