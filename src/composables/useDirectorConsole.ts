import { useI18n } from '../i18n'
import {
	openDirectorConsole,
	type OpenDirectorConsolePayload,
	type OpenDirectorConsoleResult
} from '../electronBridge'
import { isElectron } from '../electronBridge'

export interface UseDirectorConsoleOptions {
	nodeId: string
	projectId?: number
	title?: string
}

export function useDirectorConsole() {
	const { t } = useI18n()

	async function open(options: UseDirectorConsoleOptions): Promise<OpenDirectorConsoleResult> {
		const electronCheck = isElectron()
		if (!electronCheck) {
			return { ok: false, error: 'Director console is only available in Electron app.' }
		}

		const payload: OpenDirectorConsolePayload = {
			nodeId: options.nodeId,
			projectId: options.projectId,
			title: options.title || (t as any)('nodes.directorConsole.title', '导演控制台')
		}

		return openDirectorConsole(payload)
	}

	return {
		open
	}
}
