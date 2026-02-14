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

export type BlueprintUploadedAsset = {
  kind: string
  name: string
  contentType?: string
  size?: number
  relativePath: string
  absolutePath: string
  url: string
  sourcePath?: string
}

type UploadAssetResponse =
  | { ok: true; asset: BlueprintUploadedAsset }
  | { ok: false; error: string; status?: number }

type ImportAssetResponse =
  | { ok: true; asset: BlueprintUploadedAsset }
  | { ok: false; error: string; status?: number }

type DeleteAssetResponse =
  | { ok: true; fileDeleted: boolean; path?: string }
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

  private url(path: string) {
    const base = (this.getBaseUrl?.() ?? '').trim().replace(/\/$/, '')
    if (!base) return path
    if (path.startsWith('/')) return `${base}${path}`
    return `${base}/${path}`
  }

  async listProjects(): Promise<ListProjectsResponse> {
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

  async uploadAsset(
    file: File,
    kind: 'image' | 'video',
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
    kind: 'image' | 'video'
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
}
