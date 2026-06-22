import { ref, type Ref } from 'vue'

interface CachedResource {
  url: string
  element: HTMLImageElement | HTMLVideoElement
  loaded: boolean
  error: boolean
  size?: { width: number; height: number }
}

interface LoadingEntry {
  callbacks: Array<(resource: CachedResource) => void>
}

const resourceCache = ref<Map<string, CachedResource>>(new Map())
const loadingResources = ref<Map<string, LoadingEntry>>(new Map())
const LRUOrder = ref<string[]>([])
const MAX_CACHE_SIZE = 512

const evictLRU = (): void => {
  while (LRUOrder.value.length > MAX_CACHE_SIZE) {
    const oldestKey = LRUOrder.value.shift()
    if (oldestKey) {
      resourceCache.value.delete(oldestKey)
    }
  }
}

const updateLRU = (url: string): void => {
  const index = LRUOrder.value.indexOf(url)
  if (index > -1) {
    LRUOrder.value.splice(index, 1)
  }
  LRUOrder.value.push(url)
  evictLRU()
}

export const useAIWorkflowResourceCache = () => {
  const getCachedResource = (url: string): CachedResource | null => {
    const cached = resourceCache.value.get(url)
    if (cached) {
      updateLRU(url)
    }
    return cached || null
  }

  const loadResource = async (url: string, type: 'image' | 'video'): Promise<CachedResource> => {
    const cached = resourceCache.value.get(url)
    if (cached) {
      updateLRU(url)
      if (cached.loaded || cached.error) return cached
      return new Promise((resolve) => {
        const existingEntry = loadingResources.value.get(url)
        if (existingEntry) {
          existingEntry.callbacks.push(resolve)
        } else {
          const check = setInterval(() => {
            const updated = resourceCache.value.get(url)
            if (updated && (updated.loaded || updated.error)) {
              clearInterval(check)
              resolve(updated)
            }
          }, 50)
        }
      })
    }

    const existingLoading = loadingResources.value.get(url)
    if (existingLoading) {
      return new Promise((resolve) => {
        existingLoading.callbacks.push(resolve)
      })
    }

    const loadingEntry: LoadingEntry = { callbacks: [] }
    loadingResources.value.set(url, loadingEntry)

    const resource: CachedResource = {
      url,
      element: type === 'image' ? new Image() : document.createElement('video'),
      loaded: false,
      error: false,
    }

    resourceCache.value.set(url, resource)
    updateLRU(url)

    return new Promise((resolve) => {
      const resolveAll = (result: CachedResource) => {
        const entry = loadingResources.value.get(url)
        if (entry) {
          entry.callbacks.forEach((cb) => cb(result))
          loadingResources.value.delete(url)
        }
        resolve(result)
      }

      if (type === 'image') {
        const img = resource.element as HTMLImageElement
        img.onload = () => {
          resource.loaded = true
          resource.size = { width: img.naturalWidth, height: img.naturalHeight }
          resolveAll(resource)
        }
        img.onerror = () => {
          resource.error = true
          resolveAll(resource)
        }
        img.src = url
      } else {
        const video = resource.element as HTMLVideoElement
        video.preload = 'metadata'
        video.onloadedmetadata = () => {
          resource.loaded = true
          resource.size = { width: video.videoWidth, height: video.videoHeight }
          resolveAll(resource)
        }
        video.onerror = () => {
          resource.error = true
          resolveAll(resource)
        }
        video.src = url
        video.load()
      }
    })
  }

  const preloadResources = (urls: string[], type: 'image' | 'video'): void => {
    for (const url of urls) {
      const trimmedUrl = String(url).trim()
      if (!trimmedUrl) continue
      if (!resourceCache.value.has(trimmedUrl) && !loadingResources.value.has(trimmedUrl)) {
        void loadResource(trimmedUrl, type)
      }
    }
  }

  const hasResource = (url: string): boolean => {
    return resourceCache.value.has(url) || loadingResources.value.has(url)
  }

  const isResourceCached = (url: string): boolean => {
    const cached = resourceCache.value.get(url)
    return cached?.loaded ?? false
  }

  const isResourceLoaded = (url: string): boolean => {
    const cached = resourceCache.value.get(url)
    return cached?.loaded ?? false
  }

  const isResourceError = (url: string): boolean => {
    const cached = resourceCache.value.get(url)
    return cached?.error ?? false
  }

  const getResourceSize = (url: string): { width: number; height: number } | null => {
    const cached = resourceCache.value.get(url)
    if (cached?.loaded && cached.size) {
      updateLRU(url)
      return cached.size
    }
    return null
  }

  const clearCache = (): void => {
    resourceCache.value.clear()
    loadingResources.value.clear()
    LRUOrder.value = []
  }

  const removeResource = (url: string): void => {
    resourceCache.value.delete(url)
    const index = LRUOrder.value.indexOf(url)
    if (index > -1) {
      LRUOrder.value.splice(index, 1)
    }
  }

  const getCacheStats = (): { size: number; loading: number; maxSize: number } => {
    return {
      size: resourceCache.value.size,
      loading: loadingResources.value.size,
      maxSize: MAX_CACHE_SIZE,
    }
  }

  return {
    getCachedResource,
    loadResource,
    preloadResources,
    hasResource,
    isResourceCached,
    isResourceLoaded,
    isResourceError,
    getResourceSize,
    clearCache,
    removeResource,
    getCacheStats,
  }
}