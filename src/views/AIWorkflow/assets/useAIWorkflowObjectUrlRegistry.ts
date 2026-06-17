import { onBeforeUnmount } from 'vue'

export const useAIWorkflowObjectUrlRegistry = () => {
  const objectUrls = new Map<string, string>()

  const getObjectUrl = (key: string) => {
    return objectUrls.get(String(key ?? '').trim())
  }

  const setObjectUrl = (key: string, url: string) => {
    const normalizedKey = String(key ?? '').trim()
    if (!normalizedKey) return
    const nextUrl = String(url ?? '').trim()
    if (!nextUrl) {
      revokeObjectUrl(normalizedKey)
      return
    }
    const previous = objectUrls.get(normalizedKey)
    if (previous && previous !== nextUrl) {
      try {
        URL.revokeObjectURL(previous)
      } catch {
        // ignore
      }
    }
    objectUrls.set(normalizedKey, nextUrl)
  }

  const revokeObjectUrl = (key: string) => {
    const normalizedKey = String(key ?? '').trim()
    if (!normalizedKey) return
    const objectUrl = objectUrls.get(normalizedKey)
    if (!objectUrl) return
    try {
      URL.revokeObjectURL(objectUrl)
    } catch {
      // ignore
    }
    objectUrls.delete(normalizedKey)
  }

  const revokeObjectUrlsByPrefix = (prefix: string) => {
    const normalizedPrefix = String(prefix ?? '').trim()
    if (!normalizedPrefix) return
    for (const key of Array.from(objectUrls.keys())) {
      if (!key.startsWith(normalizedPrefix)) continue
      revokeObjectUrl(key)
    }
  }

  const revokeTrackedObjectUrlsForResource = (resourceId: string) => {
    const rid = String(resourceId ?? '').trim()
    if (!rid) return
    revokeObjectUrl(rid)
    revokeObjectUrl(`wf-poster:${rid}`)
  }

  const getEntries = () => Array.from(objectUrls.entries())
  const getValues = () => Array.from(objectUrls.values())

  const clearAllObjectUrls = () => {
    for (const key of Array.from(objectUrls.keys())) {
      revokeObjectUrl(key)
    }
  }

  onBeforeUnmount(() => {
    clearAllObjectUrls()
  })

  return {
    getObjectUrl,
    setObjectUrl,
    revokeObjectUrl,
    revokeObjectUrlsByPrefix,
    revokeTrackedObjectUrlsForResource,
    getEntries,
    getValues,
    clearAllObjectUrls,
  }
}