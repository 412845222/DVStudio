import { getBackendBaseUrl } from './backendConfig'

type ServiceOptions = {
  baseUrl?: string | (() => string)
}

export type BlueprintProjectItem = {
  id: number
  name: string
  data: string
  createdAt?: number | null
  updatedAt?: number | null
}

type ListProjectsResponse =
  | { ok: true; projects: BlueprintProjectItem[] }
  | { ok: false; error: string; status?: number }

type SaveProjectResponse =
  | { ok: true; project: BlueprintProjectItem }
  | { ok: false; error: string; status?: number }

type LoadProjectResponse =
  | { ok: true; project: BlueprintProjectItem; snapshot: any }
  | { ok: false; error: string; status?: number }

type DeleteProjectResponse =
  | { ok: true; id: number }
  | { ok: false; error: string; status?: number }

type OpenProjectFolderResponse =
  | { ok: true; project: BlueprintProjectItem }
  | { ok: false; error: string; status?: number }

export type BlueprintUploadedAsset = {
  kind: string
  name: string
  contentType?: string
  size?: number
  relativePath: string
  projectRelativePath?: string
  absolutePath: string
  url: string
  sourcePath?: string
}

export type BlueprintAssetKind = 'image' | 'video' | 'file' | 'model'

type UploadAssetResponse =
  | { ok: true; asset: BlueprintUploadedAsset }
  | { ok: false; error: string; status?: number }

type ImportAssetResponse =
  | { ok: true; asset: BlueprintUploadedAsset }
  | { ok: false; error: string; status?: number }

type DeleteAssetResponse =
  | { ok: true; fileDeleted: boolean; path?: string }
  | { ok: false; error: string; status?: number }

type ResolveAssetResponse =
  | { ok: true; resolved: boolean; asset?: BlueprintUploadedAsset; reason?: string }
  | { ok: false; error: string; status?: number }

type RepairAssetResponse =
  | { ok: true; repaired: boolean; asset?: BlueprintUploadedAsset; reason?: string }
  | { ok: false; error: string; status?: number }

const jsonHeaders = {
  'Content-Type': 'application/json',
}

const safeJson = async (res: Response) => {
  const text = await res.text()
  try {
    return { ok: true as const, value: JSON.parse(text) }
  } catch {
    return { ok: false as const, text }
  }
}

export class BlueprintProjectService {
  private readonly getBaseUrl: () => string

  constructor(opts: ServiceOptions = {}) {
    if (typeof opts.baseUrl === 'function') this.getBaseUrl = opts.baseUrl
    else if (typeof opts.baseUrl === 'string') {
      const fixed = opts.baseUrl
      this.getBaseUrl = () => fixed
    } else {
      this.getBaseUrl = getBackendBaseUrl
    }
  }

  private async _ensureElectronLocalDb(): Promise<boolean> {
    const bridge = (window as any)?.dweb?.aiworkflow?.db
    if (!bridge) return false
    try {
      const state = await bridge._initState?.()
      if (state?.ok) return true
      const retry = await bridge._ensureInitialized?.()
      return Boolean(retry?.ok)
    } catch {
      return false
    }
  }

  private async electronDb<T>(fn: () => Promise<T>): Promise<T | null> {
    const bridge = (window as any)?.dweb?.aiworkflow?.db?.projects
    if (typeof bridge !== 'object') return null
    const ready = await this._ensureElectronLocalDb()
    if (!ready) return null
    return fn().catch(() => null)
  }

  private url(path: string) {
    const base = (this.getBaseUrl?.() ?? '').trim().replace(/\/$/, '')
    if (!base) return path
    if (path.startsWith('/')) return `${base}${path}`
    return `${base}/${path}`
  }

  async listProjects(): Promise<ListProjectsResponse> {
    const electronResult = await this.electronDb(() =>
      (window as any).dweb.aiworkflow.db.projects.list()
    )
    if (electronResult !== null) {
      const rows = Array.isArray(electronResult) ? electronResult : (electronResult as any)?.projects || []
      return { ok: true, projects: rows as any }
    }
    const res = await fetch(this.url('/api/workflow/projects/list'), { method: 'GET' })
    if (!res.ok) {
      const body = await safeJson(res)
      return {
        ok: false,
        status: res.status,
        error: `projects/list failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
      }
    }
    return (await res.json()) as ListProjectsResponse
  }

  async saveProject(payload: { name: string; snapshot: any; projectId?: number | null }): Promise<SaveProjectResponse> {
    const electronResult = await this.electronDb(() =>
      (window as any).dweb.aiworkflow.db.projects.save({
        projectId: payload.projectId,
        snapshot: payload.snapshot,
        name: payload.name,
      })
    )
    if (electronResult !== null) {
      return { ok: true, project: electronResult.project ?? electronResult }
    }
    const res = await fetch(this.url('/api/workflow/projects/save'), {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const body = await safeJson(res)
      return {
        ok: false,
        status: res.status,
        error: `projects/save failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
      }
    }
    return (await res.json()) as SaveProjectResponse
  }

  async loadProject(projectId: number): Promise<LoadProjectResponse> {
    const electronResult = await this.electronDb(() =>
      (window as any).dweb.aiworkflow.db.projects.load({ id: projectId })
    )
    if (electronResult !== null) {
      // Electron returns { ok, project, snapshot } with snapshot at root level
      return {
        ok: true,
        project: electronResult.project ?? electronResult,
        snapshot: electronResult.snapshot,
      }
    }
    const res = await fetch(this.url(`/api/workflow/projects/load?id=${encodeURIComponent(String(projectId))}`), {
      method: 'GET',
    })
    if (!res.ok) {
      const body = await safeJson(res)
      return {
        ok: false,
        status: res.status,
        error: `projects/load failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
      }
    }
    return (await res.json()) as LoadProjectResponse
  }

  async deleteProject(projectId: number): Promise<DeleteProjectResponse> {
    const electronResult = await this.electronDb(() =>
      (window as any).dweb.aiworkflow.db.projects.delete({ id: projectId })
    )
    if (electronResult !== null) {
      if ((electronResult as any).ok === false) {
        return { ok: false, error: String((electronResult as any).error || 'delete failed') }
      }
      return { ok: true, id: projectId }
    }
    const res = await fetch(this.url('/api/workflow/projects/delete'), {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ id: projectId }),
    })
    if (!res.ok) {
      const body = await safeJson(res)
      return {
        ok: false,
        status: res.status,
        error: `projects/delete failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
      }
    }
    return (await res.json()) as DeleteProjectResponse
  }

  async openProjectFolder(payload: { rootPath: string; name?: string; create?: boolean }): Promise<OpenProjectFolderResponse> {
    const electronResult = await this.electronDb(() =>
      (window as any).dweb.aiworkflow.db.projects.openFolder({
        rootPath: payload.rootPath,
        name: payload.name,
        create: payload.create,
      })
    )
    if (electronResult !== null) {
      return { ok: true, project: electronResult.project ?? electronResult }
    }
    const res = await fetch(this.url('/api/workflow/projects/folder/open'), {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(payload ?? {}),
    })
    if (!res.ok) {
      const body = await safeJson(res)
      return {
        ok: false,
        status: res.status,
        error: `projects/folder/open failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
      }
    }
    return (await res.json()) as OpenProjectFolderResponse
  }

  async uploadAsset(
    file: File,
    kind: BlueprintAssetKind,
    opts?: { projectId?: number | null; bucket?: 'assets' | 'thumbnails' }
  ): Promise<UploadAssetResponse> {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', kind)
    if (opts?.projectId && Number.isFinite(Number(opts.projectId)) && Number(opts.projectId) > 0) {
      fd.append('projectId', String(Number(opts.projectId)))
    }
    if (opts?.bucket === 'thumbnails') fd.append('bucket', 'thumbnails')
    const res = await fetch(this.url('/api/workflow/projects/assets/upload'), {
      method: 'POST',
      body: fd,
    })
    if (!res.ok) {
      const body = await safeJson(res)
      return {
        ok: false,
        status: res.status,
        error: `projects/assets/upload failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
      }
    }
    return (await res.json()) as UploadAssetResponse
  }

  async importAsset(payload: {
    kind: BlueprintAssetKind
    name?: string
    sourcePath?: string
    sourceUrl?: string
    baseUrl?: string
    filename?: string
    subfolder?: string
    type?: string
    projectId?: number | null
    bucket?: 'assets' | 'thumbnails'
  }): Promise<ImportAssetResponse> {
    const res = await fetch(this.url('/api/workflow/projects/assets/import'), {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(payload ?? {}),
    })
    if (!res.ok) {
      const body = await safeJson(res)
      return {
        ok: false,
        status: res.status,
        error: `projects/assets/import failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
      }
    }
    return (await res.json()) as ImportAssetResponse
  }

  async deleteAsset(payload: {
    projectId?: number | null
    resourceId?: string
    url?: string
    sourcePath?: string
    relativePath?: string
    projectRelativePath?: string
  }): Promise<DeleteAssetResponse> {
    const res = await fetch(this.url('/api/workflow/projects/assets/delete'), {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(payload ?? {}),
    })
    if (!res.ok) {
      const body = await safeJson(res)
      return {
        ok: false,
        status: res.status,
        error: `projects/assets/delete failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
      }
    }
    return (await res.json()) as DeleteAssetResponse
  }

  async resolveAsset(payload: {
    projectId?: number | null
    kind?: BlueprintAssetKind
    name?: string
    sourcePath?: string
    sourceUrl?: string
    projectRelativePath?: string
  }): Promise<ResolveAssetResponse> {
    const res = await fetch(this.url('/api/workflow/projects/assets/resolve'), {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(payload ?? {}),
    })
    if (!res.ok) {
      const body = await safeJson(res)
      return {
        ok: false,
        status: res.status,
        error: `projects/assets/resolve failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
      }
    }
    return (await res.json()) as ResolveAssetResponse
  }

  async repairAsset(payload: {
    projectId?: number | null
    kind?: BlueprintAssetKind
    name?: string
    projectRelativePath?: string
  }): Promise<RepairAssetResponse> {
    const res = await fetch(this.url('/api/workflow/projects/assets/repair'), {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(payload ?? {}),
    })
    if (!res.ok) {
      const body = await safeJson(res)
      return {
        ok: false,
        status: res.status,
        error: `projects/assets/repair failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
      }
    }
    return (await res.json()) as RepairAssetResponse
  }
}
