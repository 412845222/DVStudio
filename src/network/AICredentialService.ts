import { resolveBackendUrl } from './backendConfig'

export type CredentialProvidersStatus = {
  deepseek: { hasKey: boolean; fingerprint: string; updatedAt: string | null }
  gemini: { hasKey: boolean; fingerprint: string; updatedAt: string | null }
  bytedance: { hasKey: boolean; fingerprint: string; updatedAt: string | null }
}

export const saveEncryptedAICredentials = async (payload: {
  deepseekApiKey?: string
  geminiApiKey?: string
  bytedanceApiKey?: string
}): Promise<{ ok: boolean; providers?: CredentialProvidersStatus; error?: string }> => {
  try {
    const url = resolveBackendUrl('/api/ai/credentials')
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    })
    const text = await res.text()
    let obj: any = null
    try {
      obj = JSON.parse(text)
    } catch {
      obj = null
    }

    if (!res.ok) return { ok: false, error: obj?.error || `HTTP ${res.status}: ${text}` }
    if (!obj?.ok) return { ok: false, error: obj?.error || 'unknown error' }
    return { ok: true, providers: obj?.providers }
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) }
  }
}
