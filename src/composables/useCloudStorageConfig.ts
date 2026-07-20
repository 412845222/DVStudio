import { ref } from 'vue'
import router from '../router'

export interface CloudStorageConfigStatus {
  configured: boolean
  hasActiveBucket: boolean
  providerId: string
  providerName: string
  activeBucketName: string
  lastTestedAt?: string
  lastTestOk?: boolean
  error: string | null
}

const defaultStatus: CloudStorageConfigStatus = {
  configured: false,
  hasActiveBucket: false,
  providerId: '',
  providerName: '',
  activeBucketName: '',
  error: null,
}

const status = ref<CloudStorageConfigStatus>({ ...defaultStatus })
const loading = ref(false)

export function useCloudStorageConfig() {
  const checkConfig = async (): Promise<CloudStorageConfigStatus> => {
    loading.value = true
    try {
      const result = await window.dweb?.cloudfs?.getConfigStatus?.()
      if (result?.ok) {
        status.value = {
          configured: !!result.configured,
          hasActiveBucket: !!result.hasActiveBucket,
          providerId: result.providerId || '',
          providerName: result.providerName || '',
          activeBucketName: result.activeBucketName || '',
          lastTestedAt: result.lastTestedAt,
          lastTestOk: result.lastTestOk,
          error: result.error || null,
        }
      } else {
        status.value = {
          ...defaultStatus,
          error: result?.error || '检查云存储配置失败',
        }
      }
    } catch (err) {
      status.value = {
        ...defaultStatus,
        error: err instanceof Error ? err.message : String(err),
      }
    } finally {
      loading.value = false
    }
    return status.value
  }

  const isReady = () => {
    return status.value.configured && status.value.hasActiveBucket
  }

  const navigateToCloudStorage = () => {
    router.push({ name: 'CloudStorage' })
  }

  return {
    status,
    loading,
    checkConfig,
    isReady,
    navigateToCloudStorage,
  }
}
