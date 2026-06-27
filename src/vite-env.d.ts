/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PLATFORM?: string
  readonly VITE_BACKEND_BASE_URL?: string
  readonly VITE_AIWF_AUTO_HELLO?: string
  readonly VITE_AIWF_AUTO_HELLO_TEXT?: string
  readonly VITE_LOCAL_EXEC_BASE_PATH?: string
  readonly VITE_LOCAL_EXEC_STREAM_MODE?: string
  readonly DEV?: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __DWEB_REPO_URL__: string

interface Window {
  __DWEB_REPO_URL__?: string
  __DWEB_RUNTIME__?: { platform?: 'electron' | 'web'; isElectron?: boolean }
  __DWEB_BACKEND_BASE_URL__?: string
  __DWEB_BACKEND_MODE__?: 'normal' | 'migration'
  __DWEB_CLIENT_SETTINGS?: import('./electronBridge/types').ClientSettings
  __DWEB_AIWF_AUTO_HELLO?: string
  __DWEB_AIWF_AUTO_HELLO_TEXT?: string
  __DWEB_LOCAL_EXEC_BASE_PATH?: string
  __DWEB_LOCAL_EXEC_STREAM_MODE?: string
  process?: { versions?: { electron?: string } }
  dweb?: {
    common?: {
      getBackendBaseUrl?: () => string
      health?: () => Promise<{ ok: boolean; value?: { status: string; timestamp: number; localdb: boolean; db: boolean }; error?: string }>
      echo?: (payload: unknown) => Promise<{ ok: boolean; value?: { echo: unknown; timestamp: number }; error?: string }>
      getUserAgreement?: () => Promise<{ ok: boolean; value?: { content: string }; error?: string }>
      getMigrationStatus?: () => Promise<unknown>
      getBackendRuntimeState?: () => Promise<import('./electronBridge/types').BackendRuntimeState | null>
      onBackendRuntimeStateChanged?: (handler: (state: import('./electronBridge/types').BackendRuntimeState) => void) => number | string
      offBackendRuntimeStateChanged?: (listenerId: number | string) => void
      pingBackend?: () => Promise<import('./electronBridge/types').BackendPingResult>
      startBackend?: () => Promise<import('./electronBridge/types').BackendStartResult>
      restartBackend?: () => Promise<import('./electronBridge/types').BackendRestartResult>
      getBackendStatus?: () => Promise<import('./electronBridge/types').BackendStatus | null>
      getBackendLogs?: (options?: { since?: number }) => Promise<import('./electronBridge/types').BackendLogsResult | null>
      clearBackendLogs?: () => Promise<{ ok: boolean } | null>
      collectDiagnostics?: () => Promise<import('./electronBridge/types').DiagnosticsResult | null>
      revealUserDataDir?: () => Promise<{ ok: boolean } | null>
      openFolderForPath?: (payload: { path: string }) => Promise<import('./electronBridge/types').OpenFolderResult | null>
      openExternalUrl?: (payload: { url: string }) => Promise<{ ok: boolean; error?: string }>
      runBootstrapInstaller?: () => Promise<import('./electronBridge/types').BootstrapInstallResult | null>
      getSetupState?: () => Promise<import('./electronBridge/types').SetupState | null>
      runSetupWorkflow?: (payload?: { reason?: string; retryKey?: string }) => Promise<import('./electronBridge/types').SetupRunResult>
      cleanupOldProject?: () => Promise<import('./electronBridge/types').CleanupOldProjectResult | null>
      getClientSettings?: () => Promise<import('./electronBridge/types').ClientSettingsResult>
      saveClientSettings?: (payload: import('./electronBridge/types').ClientSettings) => Promise<import('./electronBridge/types').ClientSettingsResult>
      invokeStream?: <T = unknown>(baseChannel: string, payload?: Record<string, unknown>) => AsyncGenerator<T, void, void>
    }
    meshy?: {
      health?: () => Promise<{ ok: boolean; configured: boolean }>
      generate?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; mode?: string; taskId?: string; status?: string; raw?: unknown; error?: string }>
      getTask?: (payload: { taskId: string; mode?: string }) => Promise<import('./network/ComfyUIBridgeService').MeshyTaskResponse>
      listTasks?: (payload?: { projectId?: number | string; status?: string; target?: string; family?: string; limit?: number }) => Promise<{ ok: boolean; items?: import('./network/ComfyUIBridgeService').MeshyTaskMirrorItem[]; error?: string }>
      taskDetail?: (payload: { taskId: string }) => Promise<import('./network/ComfyUIBridgeService').MeshyTaskDetailResponse>
      stop?: (payload: { taskId: string; mode?: string }) => Promise<import('./network/ComfyUIBridgeService').MeshyTaskActionResponse>
      deleteTask?: (payload: { taskId: string }) => Promise<import('./network/ComfyUIBridgeService').MeshyTaskActionResponse>
      balance?: () => Promise<import('./network/ComfyUIBridgeService').MeshyBalanceResponse>
    }
    seedance?: {
      health?: () => Promise<{ ok: boolean; configured: boolean }>
      generateStream?: (payload: Record<string, unknown>) => AsyncGenerator<import('./network/ComfyUIBridgeService').SeedanceGenerateStreamEvent, void, void>
      list?: (payload?: { projectId?: number | string; status?: string; model?: string; limit?: number }) => Promise<{ ok: boolean; items?: import('./network/ComfyUIBridgeService').SeedanceTaskMirrorItem[]; error?: string }>
      taskDetail?: (payload: { taskId: string }) => Promise<import('./network/ComfyUIBridgeService').SeedanceTaskDetailResponse>
      sync?: (payload?: Record<string, unknown>) => Promise<import('./network/ComfyUIBridgeService').SeedanceSyncTasksResponse>
    }
    chat?: {
      conversations?: {
        list?: () => Promise<{ ok: boolean; items?: unknown[]; error?: string }>
        create?: (payload: { title?: string; projectId?: number | string }) => Promise<{ ok: boolean; id?: string; conversation?: unknown; error?: string }>
        get?: (payload: { id: string }) => Promise<{ ok: boolean; conversation?: unknown; messages?: unknown[]; error?: string }>
        delete?: (payload: { id: string }) => Promise<{ ok: boolean; error?: string }>
        updateTitle?: (payload: { id: string; title: string }) => Promise<{ ok: boolean; error?: string }>
      }
      messages?: {
        send?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; message?: unknown; error?: string }>
        stream?: (payload: Record<string, unknown>) => AsyncGenerator<{ type?: string; [key: string]: unknown }, void, void>
      }
    }
    export?: {
      jobs?: {
        create?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; job?: unknown; jobId?: string; error?: string }>
        get?: (payload: { jobId: string }) => Promise<{ ok: boolean; job?: unknown; error?: string }>
        listByProject?: (payload: { projectId: number | string }) => Promise<{ ok: boolean; items?: unknown[]; error?: string }>
        stream?: (payload: { jobId: string }) => AsyncGenerator<Record<string, unknown>, void, void>
        finalize?: (payload: { jobId: string }) => Promise<{ ok: boolean; job?: unknown; error?: string }>
        file?: (payload: { jobId: string }) => Promise<{ ok: boolean; filePath?: string; fileName?: string; error?: string }>
      }
      frames?: {
        upload?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>
        uploadRaw?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>
        uploadBatch?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>
      }
    }
    editor?: {
      components?: {
        list?: (payload?: Record<string, unknown>) => Promise<{ ok: boolean; items?: unknown[]; total?: number; error?: string }>
        get?: (payload: { id: string }) => Promise<{ ok: boolean; item?: unknown; error?: string }>
        save?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; item?: unknown; error?: string }>
        delete?: (payload: { id: string }) => Promise<{ ok: boolean; error?: string }>
        import?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; imported?: number; error?: string }>
      }
    }
    comfyui?: {
      proxy?: (payload: { method?: string; path: string; body?: unknown; headers?: Record<string, string> }) => Promise<{ ok: boolean; status?: number; data?: unknown; error?: string }>
      workflows?: {
        list?: (payload?: Record<string, unknown>) => Promise<{ ok: boolean; items?: unknown[]; error?: string }>
        get?: (payload: { id: string }) => Promise<{ ok: boolean; workflow?: unknown; error?: string }>
        save?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; workflow?: unknown; error?: string }>
        delete?: (payload: { id: string }) => Promise<{ ok: boolean; error?: string }>
      }
      jobs?: {
        list?: (payload?: Record<string, unknown>) => Promise<{ ok: boolean; items?: unknown[]; error?: string }>
        get?: (payload: { id: string }) => Promise<{ ok: boolean; job?: unknown; error?: string }>
        create?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; jobId?: string; error?: string }>
        cancel?: (payload: { id: string }) => Promise<{ ok: boolean; error?: string }>
      }
      runtime?: {
        ping?: (payload?: Record<string, unknown>) => Promise<{ ok: boolean; status?: string; [key: string]: unknown }>
        workflows?: {
          list?: (payload?: Record<string, unknown>) => Promise<{ ok: boolean; items?: unknown[]; error?: string }>
          get?: (payload: { baseUrl?: string; workflowPath: string }) => Promise<{ ok: boolean; workflow?: unknown; error?: string }>
        }
        run?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; promptId?: string; baseUrl?: string; promptSource?: string; result?: unknown; comfyuiError?: unknown; error?: string; status?: number }>
        outputs?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; outputs?: unknown[]; error?: string }>
        cancel?: (payload: { baseUrl?: string; promptId: string }) => Promise<{ ok: boolean; error?: string }>
        job?: (payload: { baseUrl?: string; promptId: string }) => Promise<{ ok: boolean; result?: unknown; error?: string; status?: number }>
      }
    }
    thirdParty?: {
      nanobanana?: {
        refCache?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; cacheIds?: string[]; error?: string }>
        generate?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; imageUrl?: string; error?: string; [key: string]: unknown }>
        generateStream?: (payload: Record<string, unknown>) => AsyncGenerator<import('./network/ComfyUIBridgeService').BlueprintChatStreamEvent, void, void>
      }
      seedream?: {
        refCache?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; cacheIds?: string[]; error?: string }>
        generateStream?: (payload: Record<string, unknown>) => AsyncGenerator<import('./network/ComfyUIBridgeService').BlueprintChatStreamEvent, void, void>
      }
      jimeng?: {
        imageGenerateStream?: (payload: Record<string, unknown>) => AsyncGenerator<import('./network/ComfyUIBridgeService').JimengGenerateStreamEvent, void, void>
        videoGenerateStream?: (payload: Record<string, unknown>) => AsyncGenerator<import('./network/ComfyUIBridgeService').JimengGenerateStreamEvent, void, void>
      }
      blueprint?: {
        chat?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; text?: string; content?: string; error?: string; [key: string]: unknown }>
        chatStream?: (payload: Record<string, unknown>) => AsyncGenerator<import('./network/ComfyUIBridgeService').BlueprintChatStreamEvent, void, void>
      }
    }
    agentSkills?: {
      sceneUnderstand?: {
        models?: () => Promise<import('./network/SceneSkillService').SceneUnderstandModelsResponse>
        run?: (payload: Record<string, unknown>) => Promise<import('./network/SceneSkillService').SceneUnderstandRunResponse>
        runStream?: (payload: Record<string, unknown>) => AsyncGenerator<{ type?: string; message?: import('./core/agentToUI').AgentToUiMessage; error?: { message: string; details?: unknown }; [key: string]: unknown }, void, void>
      }
      sceneLighting?: {
        models?: () => Promise<import('./network/SceneSkillService').SceneLightingModelsResponse>
        run?: (payload: Record<string, unknown>) => Promise<import('./network/SceneSkillService').SceneLightingRunResponse>
        runStream?: (payload: Record<string, unknown>) => AsyncGenerator<{ type?: string; message?: import('./core/agentToUI').AgentToUiMessage; error?: { message: string; details?: unknown }; [key: string]: unknown }, void, void>
      }
      sceneLayout?: {
        run?: (payload: Record<string, unknown>) => Promise<import('./network/SceneSkillService').SceneLayoutRunResponse>
      }
      unreal?: {
        sessions?: () => Promise<{ ok: boolean; sessions?: unknown[]; error?: string }>
        register?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; sessionId?: string; session?: unknown; error?: string }>
        sessionDetail?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; session?: unknown; error?: string }>
        createJob?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; jobId?: string; job?: unknown; error?: string }>
        jobDetail?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; job?: unknown; error?: string }>
        heartbeat?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>
        pickJob?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; job?: unknown; error?: string }>
        getHttpPort?: () => Promise<{ ok: boolean; port?: number; error?: string }>
      }
    }
    codex?: {
      health?: () => Promise<import('./network/ComfyUIBridgeService').CodexHealthResponse>
      listSessions?: (payload?: { projectId?: number | null }) => Promise<import('./network/ComfyUIBridgeService').CodexListSessionsResponse>
      createSession?: (payload?: { title?: string; cwd?: string; model?: string; projectId?: number | null }) => Promise<import('./network/ComfyUIBridgeService').CodexCreateSessionResponse>
      listMessages?: (payload: { sessionId: string; projectId?: number | null }) => Promise<import('./network/ComfyUIBridgeService').CodexListMessagesResponse>
      updateSession?: (payload: { sessionId: string; projectId?: number | null; title?: string }) => Promise<import('./network/ComfyUIBridgeService').CodexUpdateSessionResponse>
      deleteSession?: (payload: { sessionId: string; projectId?: number | null }) => Promise<{ ok?: boolean; error?: string }>
      submitApproval?: (payload: { sessionId: string; messageId: string; decision: 'accept' | 'decline'; projectId?: number | null }) => Promise<import('./network/ComfyUIBridgeService').CodexApprovalResponse>
      sendMessageStream?: (payload: { sessionId: string; content: string; [key: string]: unknown }) => AsyncGenerator<{ event?: string; data?: unknown; type?: string; error?: { message: string; details?: unknown } }, void, void>
      cancel?: (payload: { sessionId: string }) => Promise<{ ok?: boolean; error?: string }>
    }
    projects?: {
      list?: () => Promise<{ ok: boolean; projects?: unknown[]; error?: string }>
      save?: (payload: { name: string; snapshot: unknown; projectId?: number | null }) => Promise<{ ok: boolean; project?: unknown; error?: string }>
      load?: (payload: { id: number | string }) => Promise<{ ok: boolean; project?: unknown; snapshot?: unknown; error?: string }>
      delete?: (payload: { id: number | string }) => Promise<{ ok: boolean; id?: number; error?: string }>
      openFolder?: (payload: { rootPath: string; name?: string; create?: boolean }) => Promise<{ ok: boolean; project?: unknown; error?: string }>
    }
    projectAssets?: {
      health?: () => Promise<{ ok: boolean; route?: string; schemaVersion?: number; error?: string }>
      upload?: (payload: unknown) => Promise<{ ok: boolean; asset?: unknown; error?: string }>
      import?: (payload: unknown) => Promise<{ ok: boolean; asset?: unknown; error?: string }>
      delete?: (payload: unknown) => Promise<{ ok: boolean; fileDeleted?: boolean; error?: string }>
      resolve?: (payload: unknown) => Promise<{ ok: boolean; resolved?: boolean; asset?: unknown; error?: string }>
      repair?: (payload: unknown) => Promise<{ ok: boolean; repaired?: boolean; asset?: unknown; error?: string }>
      repairAll?: (payload: unknown) => Promise<{ ok: boolean; patches?: Record<string, unknown>; failed?: string[]; changed?: number; error?: string }>
      registerRoot?: (payload: unknown) => Promise<{ ok: boolean; error?: string }>
      clearRoot?: (payload: unknown) => Promise<{ ok: boolean; error?: string }>
      validateRoot?: (payload: unknown) => Promise<{ ok: boolean; error?: string }>
      rootSnapshot?: () => Promise<Record<string, unknown> | null>
      diagnose?: (payload: unknown) => Promise<{ ok: boolean; error?: string }>
      accessLogs?: (payload: unknown) => Promise<{ ok: boolean; logs?: unknown[]; error?: string }>
    }
    window?: {
      minimize?: () => Promise<{ ok: boolean; error?: string }>
      toggleMaximize?: () => Promise<{ ok: boolean; maximized?: boolean; error?: string }>
      isMaximized?: () => Promise<{ ok: boolean; maximized?: boolean; error?: string }>
      close?: () => Promise<{ ok: boolean; error?: string }>
      reload?: () => Promise<{ ok: boolean; error?: string }>
      openDevTools?: () => Promise<{ ok: boolean; opened?: boolean; error?: string }>
    }
    aiworkflow?: {
      db?: {
        _initState?: () => Promise<{ ok?: boolean; error?: string; dbFilePath?: string }>
        _ensureInitialized?: (payload?: Record<string, unknown>) => Promise<{ ok?: boolean; error?: string }>
        projects?: {
          list?: () => Promise<unknown>
          openFolder?: (payload: { rootPath: string; name: string; create: boolean }) => Promise<{
            ok?: boolean
            project?: { id: number }
            error?: string
          }>
          delete?: (payload: { id: number }) => Promise<unknown>
        }
      }
      selectProjectFolder?: () => Promise<import('./electronBridge/types').DirectoryPickResult>
      registerProjectRoot?: (payload: { projectId: number; rootPath: string }) => Promise<{ ok: boolean; cleared?: boolean; created?: boolean; root?: string; error?: string } | null>
      clearProjectRoot?: (payload: { projectId: number }) => Promise<{ ok: boolean; error?: string } | null>
      getProjectRootSnapshot?: () => Promise<Record<string, string> | null>
      getProjectRootById?: (payload: { projectId: number }) => Promise<string | null>
      downloadUrlToProjectRoot?: (payload: { projectId: number; url: string; desiredFilename?: string }) => Promise<{ ok: boolean; absolutePath?: string; relativePath?: string; size?: number; error?: string } | null>
      copyFileToProjectRoot?: (payload: { projectId: number; sourcePath: string; desiredFilename?: string }) => Promise<{ ok: boolean; absolutePath?: string; relativePath?: string; size?: number; reused?: boolean; error?: string } | null>
      fetchAsArrayBuffer?: (payload: { url: string }) => Promise<{ ok: boolean; buffer?: Uint8Array; mime?: string; error?: string } | null>
      uploadProjectAsset?: (payload: { projectId: number; kind?: string; name?: string; arrayBuffer: ArrayBuffer; contentType?: string; bucket?: string }) => Promise<{ ok: boolean; asset?: import('./electronBridge/types').UploadedProjectAsset; error?: string } | null>
      importProjectAsset?: (payload: { projectId: number; kind?: string; name?: string; sourcePath?: string; sourceUrl?: string; bucket?: string }) => Promise<{ ok: boolean; asset?: import('./electronBridge/types').UploadedProjectAsset; error?: string } | null>
      projectAssets?: {
        repairAll?: (payload: { projectId: number; resourcesById: Record<string, unknown> }) => Promise<{ ok: boolean; patches?: Record<string, unknown>; failed?: string[]; changed?: number; error?: string } | null>
      }
      diagnoseAsset?: (payload: { projectId?: number; relPath?: string; url?: string }) => Promise<import('./electronBridge').DwebAssetDiagnoseResult | null>
      validateProjectRoot?: (payload: { projectId: number; expectedRootPath?: string }) => Promise<{ ok: boolean; reRegistered?: boolean; registerResult?: unknown; validation?: { valid: boolean; projectId: number; root?: string; mediaDirExists?: boolean; mediaDir?: string; error?: string }; error?: string } | null>
      getAssetAccessLogs?: (payload: { maxEntries: number }) => Promise<{ ok: boolean; logs?: unknown[]; error?: string } | null>
      getCacheStats?: (payload: { projectId: number }) => Promise<import('./electronBridge').ProjectCacheStatsResult | null>
      clearCache?: (payload: { projectId: number }) => Promise<import('./electronBridge').ProjectCacheClearResult | null>
      openResourceManager?: (payload: { projectId: number; title: string }) => Promise<{ ok: boolean; error?: string }>
      closeResourceManager?: () => Promise<{ ok: boolean; error?: string }>
      focusResourceManager?: () => Promise<{ ok: boolean; error?: string }>
      sendResourceManagerData?: (payload: { resources?: unknown[]; nodesById?: Record<string, unknown>; nodeOrder?: string[] }) => Promise<{ ok: boolean; error?: string }>
      broadcastResourceEvent?: (payload: { event: string; data?: unknown }) => Promise<{ ok: boolean; error?: string }>
      notifyResourceEvent?: (payload: { event: string; data?: unknown }) => Promise<{ ok: boolean; error?: string }>
      getResourceManagerData?: () => { resources?: unknown[]; nodesById?: Record<string, unknown>; nodeOrder?: string[] } | null
      requestResourceManagerData?: () => Promise<{ ok: boolean; data?: { resources?: unknown[]; nodesById?: Record<string, unknown>; nodeOrder?: string[] }; error?: string }>
      onResourceManagerEvent?: (handler: (payload: { event: string; data?: unknown }) => void) => number
      offResourceManagerEvent?: (listenerId: number) => Promise<{ ok: boolean; error?: string }>
      onResourceManagerNotify?: (handler: (payload: { event: string; data?: unknown }) => void) => number
      offResourceManagerNotify?: (listenerId: number) => Promise<{ ok: boolean; error?: string }>
      onResourceManagerData?: (handler: (payload: { resources?: unknown[]; nodesById?: Record<string, unknown>; nodeOrder?: string[] }) => void) => number
      offResourceManagerData?: (listenerId: number) => Promise<{ ok: boolean; error?: string }>
    }
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
