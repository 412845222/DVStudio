import { resolveBackendUrl } from './backendConfig'

export const fetchUserAgreementMarkdown = async (): Promise<{ ok: boolean; markdown?: string; error?: string }> => {
  try {
    const url = resolveBackendUrl('/api/legal/user-agreement-and-security.md')
    const res = await fetch(url, { method: 'GET' })
    const text = await res.text()
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text}` }
    return { ok: true, markdown: text }
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) }
  }
}
