import { ref } from 'vue'
import { getErrorMessage } from '../../../types/utils'

interface CachedResource {
  url: string
  element: HTMLImageElement | HTMLVideoElement
  loaded: boolean
  error: boolean
  size?: { width: number; height: number }
  errorCount: number
  lastErrorTime?: number
  retryAttempts: number
}

interface LoadingEntry {
  callbacks: Array<(resource: CachedResource) => void>
}

interface ResourceLoadLog {
  url: string
  type: 'image' | 'video'
  status: 'success' | 'error' | 'loading'
  timestamp: number
  errorCount?: number
  retryAttempts?: number
  size?: { width: number; height: number }
}

const resourceCache = ref<Map<string, CachedResource>>(new Map())
const loadingResources = ref<Map<string, LoadingEntry>>(new Map())
const LRUOrder = ref<string[]>([])
const MAX_CACHE_SIZE = 512
const MAX_RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = [1000, 2000, 4000]

const loadLog: ResourceLoadLog[] = []
const MAX_LOG_ENTRIES = 500

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

const logLoad = (entry: Omit<ResourceLoadLog, 'timestamp'>): void => {
  loadLog.push({ ...entry, timestamp: Date.now() })
  while (loadLog.length > MAX_LOG_ENTRIES) {
    loadLog.shift()
  }
}

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const useAIWorkflowResourceCache = () => {
  const getCachedResource = (url: string): CachedResource | null => {
    const cached = resourceCache.value.get(url)
    if (cached) {
      updateLRU(url)
    }
    return cached || null
  }

  const validateResourceUrl = (url: string): { valid: boolean; reason?: string } => {
    const trimmed = String(url).trim()
    if (!trimmed) return { valid: false, reason: 'empty url' }
    if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
      return { valid: true }
    }
    try {
      const u = new URL(trimmed)
      if (u.protocol !== 'dweb:' && u.protocol !== 'http:' && u.protocol !== 'https:') {
        return { valid: false, reason: `unsupported protocol: ${u.protocol}` }
      }
      return { valid: true }
    } catch {
      return { valid: false, reason: 'invalid url format' }
    }
  }

  const checkResourceAvailability = async (url: string): Promise<{ available: boolean; status?: number; error?: string }> => {
    const trimmed = String(url).trim()
    if (!trimmed) return { available: false, error: 'empty url' }
    if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
      return { available: true }
    }
    try {
      const response = await fetch(trimmed, { method: 'HEAD' })
      return { available: response.ok, status: response.status }
    } catch (err: unknown) {
      return { available: false, error: getErrorMessage(err) }
    }
  }

  const preCheckAndRepairResource = async (url: string): Promise<{ ok: boolean; url: string; repaired?: boolean }> => {
    const trimmed = String(url).trim()
    if (!trimmed) return { ok: false, url: trimmed }
    
    const validation = validateResourceUrl(trimmed)
    if (!validation.valid) {
      return { ok: false, url: trimmed }
    }
    
    const availability = await checkResourceAvailability(trimmed)
    if (availability.available) {
      return { ok: true, url: trimmed }
    }
    
    logLoad({ url: trimmed, type: 'image', status: 'error', errorCount: 1 })
    
    return { ok: false, url: trimmed }
  }

  const loadResourceWithRetry = async (
    url: string,
    type: 'image' | 'video',
    retryCount: number = 0
  ): Promise<CachedResource> => {
    const cached = resourceCache.value.get(url)
    if (cached) {
      updateLRU(url)
      if (cached.loaded) return cached
      if (cached.error && retryCount >= MAX_RETRY_ATTEMPTS) return cached
    }

    const existingLoading = loadingResources.value.get(url)
    if (existingLoading && retryCount === 0) {
      return new Promise((resolve) => {
        existingLoading.callbacks.push(resolve)
      })
    }

    const loadingEntry: LoadingEntry = { callbacks: [] }
    loadingResources.value.set(url, loadingEntry)

    const resource: CachedResource = cached || {
      url,
      element: type === 'image' ? new Image() : document.createElement('video'),
      loaded: false,
      error: false,
      errorCount: 0,
      retryAttempts: 0,
    }

    if (!cached) {
      resourceCache.value.set(url, resource)
      updateLRU(url)
    }

    logLoad({ url, type, status: 'loading' })

    return new Promise((resolve) => {
      const resolveAll = (result: CachedResource) => {
        const entry = loadingResources.value.get(url)
        if (entry) {
          entry.callbacks.forEach((cb) => cb(result))
          loadingResources.value.delete(url)
        }
        resolve(result)
      }

      const handleError = async () => {
        resource.error = true
        resource.errorCount += 1
        resource.lastErrorTime = Date.now()

        logLoad({ url, type, status: 'error', errorCount: resource.errorCount, retryAttempts: resource.retryAttempts })

        if (resource.retryAttempts < MAX_RETRY_ATTEMPTS) {
          const delay = RETRY_DELAY_MS[resource.retryAttempts] || 2000
          resource.retryAttempts += 1
          loadingResources.value.set(url, { callbacks: [] })
          await sleep(delay)
          const result = await loadResourceWithRetry(url, type, resource.retryAttempts)
          resolveAll(result)
        } else {
          resolveAll(resource)
        }
      }

      if (type === 'image') {
        const img = resource.element as HTMLImageElement
        img.onload = () => {
          resource.loaded = true
          resource.error = false
          resource.size = { width: img.naturalWidth, height: img.naturalHeight }
          logLoad({ url, type, status: 'success', size: resource.size })
          resolveAll(resource)
        }
        img.onerror = handleError
        img.src = url
      } else {
        const video = resource.element as HTMLVideoElement
        video.preload = 'metadata'
        video.onloadedmetadata = () => {
          resource.loaded = true
          resource.error = false
          resource.size = { width: video.videoWidth, height: video.videoHeight }
          logLoad({ url, type, status: 'success', size: resource.size })
          resolveAll(resource)
        }
        video.onerror = handleError
        video.src = url
        video.load()
      }
    })
  }

  const loadResource = async (url: string, type: 'image' | 'video'): Promise<CachedResource> => {
    return loadResourceWithRetry(url, type, 0)
  }

  const preloadResources = (urls: string[], type: 'image' | 'video', batchSize: number = 10, delayMs: number = 100): void => {
    const trimmedUrls = urls.map((u) => String(u).trim()).filter(Boolean)
    const batches: string[][] = []
    for (let i = 0; i < trimmedUrls.length; i += batchSize) {
      batches.push(trimmedUrls.slice(i, i + batchSize))
    }

    batches.forEach(async (batch, index) => {
      await sleep(index * delayMs)
      for (const url of batch) {
        if (!resourceCache.value.has(url) && !loadingResources.value.has(url)) {
          void loadResource(url, type)
        }
      }
    })
  }

  const validateAndPreloadResources = async (urls: string[], type: 'image' | 'video'): Promise<{ valid: string[]; invalid: string[]; unavailable: string[] }> => {
    const valid: string[] = []
    const invalid: string[] = []
    const unavailable: string[] = []

    for (const url of urls) {
      const trimmed = String(url).trim()
      if (!trimmed) {
        invalid.push(url)
        continue
      }

      const validation = validateResourceUrl(trimmed)
      if (!validation.valid) {
        invalid.push(url)
        continue
      }

      const availability = await checkResourceAvailability(trimmed)
      if (!availability.available) {
        unavailable.push(url)
        continue
      }

      valid.push(url)
    }

    if (valid.length > 0) {
      preloadResources(valid, type)
    }

    return { valid, invalid, unavailable }
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

  const getResourceErrorCount = (url: string): number => {
    const cached = resourceCache.value.get(url)
    return cached?.errorCount ?? 0
  }

  const getResourceRetryAttempts = (url: string): number => {
    const cached = resourceCache.value.get(url)
    return cached?.retryAttempts ?? 0
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

  const resetResource = (url: string): void => {
    const cached = resourceCache.value.get(url)
    if (cached) {
      cached.loaded = false
      cached.error = false
      cached.errorCount = 0
      cached.retryAttempts = 0
      cached.lastErrorTime = undefined
    }
  }

  const retryFailedResource = (url: string, type: 'image' | 'video'): Promise<CachedResource> => {
    resetResource(url)
    return loadResource(url, type)
  }

  const getCacheStats = (): { size: number; loading: number; maxSize: number; errors: number } => {
    let errors = 0
    resourceCache.value.forEach((r) => {
      if (r.error) errors += 1
    })
    return {
      size: resourceCache.value.size,
      loading: loadingResources.value.size,
      maxSize: MAX_CACHE_SIZE,
      errors,
    }
  }

  const getLoadLogs = (maxEntries: number = 50): ResourceLoadLog[] => {
    return loadLog.slice(-maxEntries)
  }

  const getFailedResources = (): Array<{ url: string; errorCount: number; lastErrorTime?: number; retryAttempts: number }> => {
    const failed: Array<{ url: string; errorCount: number; lastErrorTime?: number; retryAttempts: number }> = []
    resourceCache.value.forEach((r) => {
      if (r.error) {
        failed.push({
          url: r.url,
          errorCount: r.errorCount,
          lastErrorTime: r.lastErrorTime,
          retryAttempts: r.retryAttempts,
        })
      }
    })
    return failed
  }

  return {
    getCachedResource,
    loadResource,
    preloadResources,
    validateResourceUrl,
    checkResourceAvailability,
    preCheckAndRepairResource,
    validateAndPreloadResources,
    hasResource,
    isResourceCached,
    isResourceLoaded,
    isResourceError,
    getResourceErrorCount,
    getResourceRetryAttempts,
    getResourceSize,
    clearCache,
    removeResource,
    resetResource,
    retryFailedResource,
    getCacheStats,
    getLoadLogs,
    getFailedResources,
  }
}