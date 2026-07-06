import { getErrorMessage, isRecord, isString } from '../types/utils'
import { resolveBackendUrl } from './backendConfig'
import { isMigrationMode, hasIpcApi, normalizeTimestamp } from './ipcClient'

export type CredentialProvidersStatus = {
	deepseek: { hasKey: boolean; fingerprint: string; updatedAt: string | null }
	gemini: { hasKey: boolean; fingerprint: string; updatedAt: string | null }
	bytedance: { hasKey: boolean; fingerprint: string; updatedAt: string | null }
	meshy: { hasKey: boolean; fingerprint: string; updatedAt: string | null }
	github: { hasKey: boolean; fingerprint: string; updatedAt: string | null }
}

export type SaveCredentialRequest = {
	deepseekApiKey?: string
	geminiApiKey?: string
	bytedanceApiKey?: string
	meshyApiKey?: string
	githubToken?: string
}

export type SaveCredentialResponse = {
	ok: boolean
	providers?: CredentialProvidersStatus
	error?: string
}

type ApiKeyEntry = {
	provider: string
	keyFingerprint?: string
	hasKey?: boolean
	updatedAt?: number | string | null
}

type LocalDbBridge = {
	dweb?: {
		aiworkflow?: {
			db?: {
				apiKeys?: {
					list?: () => Promise<ApiKeyEntry[]>
					set?: (payload: { provider: string; plaintext: string }) => Promise<{ ok?: boolean; error?: string }>
				}
			}
		}
	}
}

const PROVIDER_FIELDS: Array<{ field: keyof SaveCredentialRequest; provider: string; statusKey: keyof CredentialProvidersStatus }> = [
	{ field: 'deepseekApiKey', provider: 'deepseek', statusKey: 'deepseek' },
	{ field: 'geminiApiKey', provider: 'gemini', statusKey: 'gemini' },
	{ field: 'bytedanceApiKey', provider: 'bytedance', statusKey: 'bytedance' },
	{ field: 'meshyApiKey', provider: 'meshy', statusKey: 'meshy' },
	{ field: 'githubToken', provider: 'github', statusKey: 'github' },
]

function emptyStatus(): CredentialProvidersStatus {
	return {
		deepseek: { hasKey: false, fingerprint: '', updatedAt: null },
		gemini: { hasKey: false, fingerprint: '', updatedAt: null },
		bytedance: { hasKey: false, fingerprint: '', updatedAt: null },
		meshy: { hasKey: false, fingerprint: '', updatedAt: null },
		github: { hasKey: false, fingerprint: '', updatedAt: null },
	}
}

function getIpcBridge(): LocalDbBridge {
	return window as unknown as LocalDbBridge
}

async function getProvidersStatusIpc(): Promise<CredentialProvidersStatus> {
	const bridge = getIpcBridge()
	const listFn = bridge.dweb?.aiworkflow?.db?.apiKeys?.list
	if (typeof listFn !== 'function') {
		throw new Error('IPC apiKeys.list not available')
	}
	const list = await listFn()
	const status = emptyStatus()
	if (Array.isArray(list)) {
		for (const entry of list) {
			const provider = String(entry?.provider || '')
			const mapping = PROVIDER_FIELDS.find(p => p.provider === provider)
			if (mapping) {
				status[mapping.statusKey] = {
					hasKey: Boolean(entry?.hasKey),
					fingerprint: String(entry?.keyFingerprint || ''),
					updatedAt: normalizeTimestamp(entry?.updatedAt as number | string | undefined) || null,
				}
			}
		}
	}
	return status
}

async function saveEncryptedAICredentialsIpc(
	payload: SaveCredentialRequest
): Promise<SaveCredentialResponse> {
	const bridge = getIpcBridge()
	const setFn = bridge.dweb?.aiworkflow?.db?.apiKeys?.set
	if (typeof setFn !== 'function') {
		throw new Error('IPC apiKeys.set not available')
	}

	for (const { field, provider } of PROVIDER_FIELDS) {
		const value = payload[field]
		if (value !== undefined) {
			const result = await setFn({ provider, plaintext: String(value || '').trim() })
			if (result?.ok === false) {
				return { ok: false, error: result.error || `Failed to set ${provider}` }
			}
		}
	}

	const providers = await getProvidersStatusIpc()
	return { ok: true, providers }
}

const safeParseCredentialResponse = (
	text: string
): { ok?: boolean; error?: string; providers?: CredentialProvidersStatus } | null => {
	try {
		const parsed = JSON.parse(text) as unknown
		if (!isRecord(parsed)) return null
		const result: { ok?: boolean; error?: string; providers?: CredentialProvidersStatus } = {}
		if (typeof parsed.ok === 'boolean') result.ok = parsed.ok
		if (isString(parsed.error)) result.error = parsed.error
		if (isRecord(parsed.providers)) result.providers = parsed.providers as CredentialProvidersStatus
		return result
	} catch {
		return null
	}
}

async function saveEncryptedAICredentialsHttp(
	payload: SaveCredentialRequest
): Promise<SaveCredentialResponse> {
	try {
		const url = resolveBackendUrl('/api/ai/credentials')
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload || {})
		})
		const text = await res.text()
		const obj = safeParseCredentialResponse(text)

		if (!res.ok) {
			return { ok: false, error: obj?.error || `HTTP ${res.status}: ${text}` }
		}
		if (!obj || obj.ok !== true) {
			return { ok: false, error: obj?.error || 'unknown error' }
		}
		return { ok: true, providers: obj.providers }
	} catch (e: unknown) {
		return { ok: false, error: getErrorMessage(e) }
	}
}

export async function getCredentialStatus(): Promise<{ ok: boolean; providers?: CredentialProvidersStatus; error?: string }> {
	if (isMigrationMode() && hasIpcApi()) {
		try {
			const providers = await getProvidersStatusIpc()
			return { ok: true, providers }
		} catch (e: unknown) {
			console.warn('[AICredentialService] IPC get status failed:', e)
		}
	}
	return { ok: false, error: 'HTTP fallback for status not implemented; use IPC mode' }
}

export const saveEncryptedAICredentials = async (
	payload: SaveCredentialRequest
): Promise<SaveCredentialResponse> => {
	if (isMigrationMode() && hasIpcApi()) {
		try {
			return await saveEncryptedAICredentialsIpc(payload)
		} catch (e: unknown) {
			console.warn('[AICredentialService] IPC save failed, falling back to HTTP:', e)
		}
	}
	return saveEncryptedAICredentialsHttp(payload)
}
