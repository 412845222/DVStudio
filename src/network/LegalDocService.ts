import { getErrorMessage } from '../types/utils'
import { resolveBackendUrl } from './backendConfig'
import { isMigrationMode } from './ipcClient'

export const fetchUserAgreementMarkdown = async (): Promise<{
	ok: boolean
	markdown?: string
	error?: string
}> => {
	if (isMigrationMode()) {
		try {
			const dweb = (
				window as unknown as {
					dweb?: {
						common?: {
							getUserAgreement?: () => Promise<{
								ok?: boolean
								value?: { content?: string }
								content?: string
								error?: string
							}>
						}
					}
				}
			).dweb
			if (dweb?.common?.getUserAgreement) {
				const result = await dweb.common.getUserAgreement()
				if (result?.ok && result.value?.content) {
					return { ok: true, markdown: result.value.content }
				}
				if (typeof result?.content === 'string') {
					return { ok: true, markdown: result.content }
				}
				if (result?.error) {
					return { ok: false, error: result.error }
				}
			}
		} catch (e: unknown) {
			console.warn('[LegalDocService] IPC failed, falling back to HTTP:', e)
		}
	}
	try {
		const url = resolveBackendUrl('/api/legal/user-agreement-and-security.md')
		const res = await fetch(url, { method: 'GET' })
		const text = await res.text()
		if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text}` }
		return { ok: true, markdown: text }
	} catch (e: unknown) {
		return { ok: false, error: getErrorMessage(e) }
	}
}
