import { getErrorMessage, isRecord, isString } from '../types/utils'
import { resolveBackendUrl } from './backendConfig'

export type CredentialProvidersStatus = {
  deepseek: { hasKey: boolean; fingerprint: string; updatedAt: string | null }
  gemini: { hasKey: boolean; fingerprint: string; updatedAt: string | null }
  bytedance: { hasKey: boolean; fingerprint: string; updatedAt: string | null }
  meshy: { hasKey: boolean; fingerprint: string; updatedAt: string | null }
  jimengAccessKeyId: { hasKey: boolean; fingerprint: string; updatedAt: string | null }
  jimengSecretKey: { hasKey: boolean; fingerprint: string; updatedAt: string | null }
}

export type SaveCredentialRequest = {
  deepseekApiKey?: string
  geminiApiKey?: string
  bytedanceApiKey?: string
  meshyApiKey?: string
  jimengAccessKeyId?: string
  jimengSecretKey?: string
}

export type SaveCredentialResponse = {
  ok: boolean
  providers?: CredentialProvidersStatus
  error?: string
}

const safeParseCredentialResponse = (text: string): { ok?: boolean; error?: string; providers?: CredentialProvidersStatus } | null => {
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

export const saveEncryptedAICredentials = async (payload: SaveCredentialRequest): Promise<SaveCredentialResponse> => {
  try {
    const url = resolveBackendUrl('/api/ai/credentials')
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
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
