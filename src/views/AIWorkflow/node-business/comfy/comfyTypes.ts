import type { ComfyWorkflow } from '../../../../network/ComfyUIBridgeService'
import type { ComfyBridgeMedia, ComfyLocalizedOutput } from './comfyOutputResolver'

export type { ComfyBridgeMedia, ComfyLocalizedOutput }

export type ComfyUIPingResponse =
  | {
      ok: true
      baseUrl: string
      comfyui?: { version?: string; os?: string; deviceName?: string }
    }
  | {
      ok: false
      error: string
      status?: number
      baseUrl?: string
    }

export type ComfyUIWorkflowsListResponse =
  | {
      ok: true
      baseUrl: string
      workflows: { path: string; name: string }[]
    }
  | {
      ok: false
      error: string
      status?: number
      baseUrl?: string
    }

export type ComfyUIGetWorkflowResponse =
  | {
      ok: true
      baseUrl: string
      workflowPath: string
      workflow: ComfyWorkflow
    }
  | {
      ok: false
      error: string
      status?: number
      baseUrl?: string
    }

export type ComfyUIRunResponse =
  | {
      ok: true
      baseUrl: string
      promptId: string
      result: Record<string, unknown>
      snapshot?: Record<string, unknown>
    }
  | {
      ok: false
      error: string
      status?: number
      baseUrl?: string
      requiresConfirm?: boolean
      fallbackRecord?: {
        workflowName?: string
        workflowPath?: string
        workflowId?: string
        savedAt?: number
        runDir?: string
      }
    }

export type ComfyUICancelResponse =
  | {
      ok: true
      baseUrl: string
      result: Record<string, unknown>
    }
  | {
      ok: false
      error: string
      status?: number
      baseUrl?: string
    }

export type ComfyUIJobResponse =
  | {
      ok: true
      baseUrl: string
      fallback?: string
      result: Record<string, unknown>
    }
  | {
      ok: false
      error: string
      status?: number
      baseUrl?: string
    }

export type ComfyUIOutputsResponse =
  | {
      ok: true
      baseUrl: string
      promptId: string
      media: ComfyBridgeMedia[]
      result: Record<string, unknown>
    }
  | {
      ok: false
      error: string
      status?: number
      baseUrl?: string
    }

export type ComfyService = {
  run: (
    baseUrl: string,
    workflowPath: string,
    files: File[],
    opts?: { positivePrompt?: string; negativePrompt?: string; confirmReuseRecord?: boolean },
  ) => Promise<ComfyUIRunResponse>
  cancel: (baseUrl: string, promptId: string) => Promise<ComfyUICancelResponse>
  job: (baseUrl: string, promptId: string) => Promise<ComfyUIJobResponse>
  outputs: (baseUrl: string, promptId: string) => Promise<ComfyUIOutputsResponse>
  ping: (baseUrl: string) => Promise<ComfyUIPingResponse>
  listWorkflows: (baseUrl: string) => Promise<ComfyUIWorkflowsListResponse>
  getWorkflow: (baseUrl: string, workflowPath: string) => Promise<ComfyUIGetWorkflowResponse>
}

export type ComfyNodeState = {
  id: string
  type?: string
  title?: string
  alias?: string
  inputs?: unknown[]
  outputs?: unknown[]
  resourceId?: string
  comfyuiSettings?: {
    baseUrl?: string
    workflowPath?: string
    positivePrompt?: string
    negativePrompt?: string
    runStatus?: string
    promptId?: string
    progress?: number
    statusText?: string
    status?: string
    message?: string
    lastCheckedAt?: number
    lastUpdateAt?: number
    workflows?: unknown[]
    outputs?: ComfyLocalizedOutput[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type ComfyInputAnchor = {
  id?: string
  [key: string]: unknown
}

export type ComfyEdgeState = {
  id?: string
  fromNodeId?: string
  toNodeId?: string
  fromAnchorId?: string
  toAnchorId?: string
  [key: string]: unknown
}

export type ComfyResourceState = {
  kind?: string
  url?: string
  name?: string
  [key: string]: unknown
}

export type ComfyStore = {
  state: {
    nodesById: Record<string, ComfyNodeState>
    nodeOrder: string[]
    edgeOrder: string[]
    edgesById: Record<string, ComfyEdgeState>
    resourcesById: Record<string, ComfyResourceState>
  }
  commit: (type: string, value: unknown) => void
}

export type ComfyJobStatus = {
  status?: string
  outputs_count?: number
  [key: string]: unknown
}

export type ImportAssetResult =
  | {
      ok: true
      asset: {
        url?: string
        name?: string
        sourcePath?: string
        absolutePath?: string
        [key: string]: unknown
      }
    }
  | {
      ok: false
      error?: string
    }
