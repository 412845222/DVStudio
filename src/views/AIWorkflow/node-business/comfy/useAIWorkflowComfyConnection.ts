import { parseComfyWorkflowIO } from '../../../../aiworkflow/domain/comfyui/parseWorkflowIO'
import { getErrorMessage } from '../../../../types/utils'

export const useAIWorkflowComfyConnection = (payload: {
  store: {
    state: {
      nodesById: Record<string, any>
    }
    commit: (type: string, value: any) => void
  }
  comfyService: {
    ping: (baseUrl: string) => Promise<any>
    listWorkflows: (baseUrl: string) => Promise<any>
    getWorkflow: (baseUrl: string, workflowPath: string) => Promise<any>
  }
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
}) => {
  const onComfyUISettingsUpdate = (
    nodeId: string,
    input: { baseUrl?: string; positivePrompt?: string; negativePrompt?: string },
  ) => {
    payload.store.commit('setNodeComfyUISettings', { nodeId, comfyuiSettings: input })
  }

  const onComfyUIConnect = async (nodeId: string, input: { baseUrl: string }) => {
    const baseUrl = String(input?.baseUrl ?? '').trim()
    if (!baseUrl) return
    payload.store.commit('setNodeComfyUISettings', {
      nodeId,
      comfyuiSettings: { status: 'connecting', message: '', baseUrl, lastCheckedAt: Date.now() },
    })
    try {
      const res = await payload.comfyService.ping(baseUrl)
      if (res.ok) {
        payload.store.commit('setNodeComfyUISettings', {
          nodeId,
          comfyuiSettings: { status: 'connected', message: '', lastCheckedAt: Date.now() },
        })

        try {
          const wf = await payload.comfyService.listWorkflows(baseUrl)
          if (wf.ok) {
            payload.store.commit('setNodeComfyUISettings', {
              nodeId,
              comfyuiSettings: { workflows: wf.workflows },
            })
          } else {
            payload.pushToast('读取工作流列表失败：' + (wf.error || 'unknown'), 'warn')
            payload.store.commit('setNodeComfyUISettings', {
              nodeId,
              comfyuiSettings: { workflows: [] },
            })
          }
        } catch (err: unknown) {
          payload.pushToast('读取工作流列表失败：' + getErrorMessage(err), 'warn')
          payload.store.commit('setNodeComfyUISettings', {
            nodeId,
            comfyuiSettings: { workflows: [] },
          })
        }
      } else {
        payload.store.commit('setNodeComfyUISettings', {
          nodeId,
          comfyuiSettings: {
            status: 'error',
            message: res.error || '连接失败',
            lastCheckedAt: Date.now(),
          },
        })
      }
    } catch (err: unknown) {
      payload.store.commit('setNodeComfyUISettings', {
        nodeId,
        comfyuiSettings: {
          status: 'error',
          message: getErrorMessage(err),
          lastCheckedAt: Date.now(),
        },
      })
    }
  }

  const onComfyUISelectWorkflow = async (nodeId: string, input: { workflowPath: string }) => {
    const workflowPath = String(input?.workflowPath ?? '').trim()
    if (!workflowPath) return
    const node = payload.store.state.nodesById[nodeId]
    const baseUrl = String(node?.comfyuiSettings?.baseUrl ?? '').trim()
    if (!node || node.type !== 'comfyui' || !baseUrl) return

    try {
      const res = await payload.comfyService.getWorkflow(baseUrl, workflowPath)
      if (!res.ok) {
        payload.pushToast('读取工作流失败：' + (res.error || 'unknown'), 'error')
        return
      }
      const { inputs, outputs, warnings } = parseComfyWorkflowIO(res.workflow)
      for (const warning of warnings) payload.pushToast(warning, 'warn')
      payload.store.commit('setNodeComfyUIWorkflowIO', {
        nodeId,
        inputs,
        outputs,
        workflowPath: res.workflowPath || workflowPath,
      })
      payload.store.commit('setNodeComfyUISettings', {
        nodeId,
        comfyuiSettings: { workflowPath: res.workflowPath || workflowPath },
      })
    } catch (err: unknown) {
      payload.pushToast('读取工作流失败：' + getErrorMessage(err), 'error')
    }
  }

  return {
    onComfyUISettingsUpdate,
    onComfyUIConnect,
    onComfyUISelectWorkflow,
  }
}
