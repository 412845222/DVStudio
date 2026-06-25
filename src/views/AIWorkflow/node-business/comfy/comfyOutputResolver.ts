export const inferMediaKind = (
  media: { kind?: string; filename?: string; url?: string } | null | undefined,
): 'image' | 'video' | null => {
  if (!media) return null
  const rawKind = String(media.kind ?? '').toLowerCase().trim()
  if (rawKind === 'image' || rawKind === 'video') return rawKind
  const url = String(media.url ?? '').trim()
  let filenameFromQuery = ''
  if (url) {
    try {
      const parsed = new URL(url, window.location.origin)
      filenameFromQuery = decodeURIComponent(String(parsed.searchParams.get('filename') ?? '')).trim()
    } catch {
      filenameFromQuery = ''
    }
  }
  const ref = `${String(media.filename ?? '')} ${filenameFromQuery} ${url}`.toLowerCase()
  if (/\.(mp4|webm|mov|mkv|avi|gif)([?#&]|$)/.test(ref)) return 'video'
  if (/\.(png|jpg|jpeg|webp|bmp)([?#&]|$)/.test(ref)) return 'image'
  return null
}

export type ComfyBridgeMedia = {
  kind: 'image' | 'video'
  url: string
  filename?: string
  nodeId?: string
  subfolder?: string
  type?: string
}

export type ComfyLocalizedOutput = {
  kind: 'image' | 'video'
  url: string
  filename?: string
  anchorId?: string
  nodeId?: string
  sourcePath?: string
  subfolder?: string
  type?: string
}

export const comfyAnchorNodeIdFromAnchorId = (anchorId: string): string => {
  const raw = String(anchorId || '').trim()
  if (!raw) return ''
  if (!raw.startsWith('out-')) return ''
  return raw.slice(4).trim()
}

export const comfyOutputForAnchor = (
  outputs: ComfyLocalizedOutput[],
  anchorId: string,
  expectedKind: 'image' | 'video',
) => {
  const byAnchorAndKind = outputs.find(
    (media) =>
      String(media?.anchorId ?? '') === anchorId
      && String(media?.url ?? '').trim()
      && inferMediaKind(media) === expectedKind,
  )
  if (byAnchorAndKind) return byAnchorAndKind

  const byAnchorAny = outputs.find(
    (media) =>
      String(media?.anchorId ?? '') === anchorId
      && String(media?.url ?? '').trim(),
  )
  if (byAnchorAny && inferMediaKind(byAnchorAny) === expectedKind) return byAnchorAny

  return outputs.find(
    (media) =>
      String(media?.url ?? '').trim()
      && inferMediaKind(media) === expectedKind,
  )
}
