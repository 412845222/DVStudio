import { showConfirm } from '../../../../ui/UIComponent/useGlobalFeedback'
import { useCloudStorageConfig } from '../../../../composables/useCloudStorageConfig'

let pendingPromptOpen = false

export async function checkVideoReferencePrerequisites(
  hasVideoReferences: boolean
): Promise<{ canProceed: boolean }> {
  if (!hasVideoReferences) {
    return { canProceed: true }
  }

  if (pendingPromptOpen) {
    return { canProceed: false }
  }

  const { checkConfig, isReady, navigateToCloudStorage } = useCloudStorageConfig()
  const status = await checkConfig()

  if (isReady()) {
    return { canProceed: true }
  }

  pendingPromptOpen = true

  const hasConfig = status.configured
  const hasBucket = status.hasActiveBucket

  let title = '需要配置云存储'
  let message = '视频参考功能需要配置云存储才能使用。请先配置您的云存储，视频文件将上传到您的默认桶中以获取公网访问URL。'

  if (hasConfig && !hasBucket) {
    title = '需要设置默认桶'
    message = '您已配置云存储账号，请先在云存储页面选择一个桶作为默认桶后再使用视频参考功能。点击桶旁的星形图标可将其设为默认桶。'
  }

  try {
    await showConfirm({
      title,
      message,
      tone: 'warn',
      showCancel: false,
      showClose: true,
      actions: [
        {
          label: '取消',
          role: 'cancel',
        },
        {
          label: '去配置云存储',
          role: 'confirm',
          onClick: () => {
            navigateToCloudStorage()
          }
        }
      ]
    })
  } finally {
    pendingPromptOpen = false
  }

  return { canProceed: false }
}

export function clearPendingPrompt() {
  pendingPromptOpen = false
}
