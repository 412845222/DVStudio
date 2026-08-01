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
	error: null
}

const status = ref<CloudStorageConfigStatus>({ ...defaultStatus })
const loading = ref(false)

export function useCloudStorageConfig() {
	const checkConfig = async (): Promise<CloudStorageConfigStatus> => {
		loading.value = true
		try {
			const result = await window.dweb?.cloudfs?.getConfigStatus?.()
			console.log('[CloudStorageConfig] getConfigStatus raw result:', result)
			if (result) {
				const hasError = !result.configured && result.error
				status.value = {
					configured: !!result.configured,
					hasActiveBucket: !!result.hasActiveBucket,
					providerId: result.providerId || '',
					providerName: result.providerName || '',
					activeBucketName: result.activeBucketName || '',
					lastTestedAt: result.lastTestedAt,
					lastTestOk: result.lastTestOk,
					error: hasError ? result.error : null
				}
				console.log('[CloudStorageConfig] parsed status:', { ...status.value })
			} else {
				status.value = {
					...defaultStatus,
					error: '检查云存储配置失败'
				}
				console.log('[CloudStorageConfig] result is null/undefined')
			}
		} catch (err) {
			status.value = {
				...defaultStatus,
				error: err instanceof Error ? err.message : String(err)
			}
			console.error('[CloudStorageConfig] checkConfig error:', err)
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
		navigateToCloudStorage
	}
}
