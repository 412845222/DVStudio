// ============================================================================
// 通用 API 类型定义
// 用途：network 层各 Service 共享的基础响应/请求类型
// ============================================================================

/**
 * API 错误信息
 */
export interface ApiError {
  error: string
  status?: number
  detail?: string
}

/**
 * 标准 API 响应判别联合类型
 * 成功：{ ok: true, ...data }
 * 失败：{ ok: false, error: string, status?: number }
 */
export type ApiResult<T, E = ApiError> =
  | ({ ok: true } & T)
  | ({ ok: false } & E)

/**
 * 简单成功响应（无额外数据）
 */
export type OkResult = ApiResult<Record<string, never>>

/**
 * 带 id 的成功响应
 */
export type IdResult = ApiResult<{ id: string | number }>

/**
 * 分页列表响应
 */
export interface PaginatedData<T> {
  items: T[]
  total: number
  page?: number
  pageSize?: number
  hasMore?: boolean
}

/**
 * 分页响应
 */
export type PaginatedResult<T> = ApiResult<PaginatedData<T>>

/**
 * 列表响应（不分页）
 */
export type ListResult<T> = ApiResult<{ items: T[] }>

/**
 * HTTP 请求方法
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * 通用请求选项
 */
export interface RequestOptions {
  method?: HttpMethod
  headers?: Record<string, string>
  body?: BodyInit | null
  signal?: AbortSignal
  /** 请求超时（毫秒），默认无超时 */
  timeout?: number
}

/**
 * 后端连接状态
 */
export interface BackendStatus {
  running: boolean
  baseUrl: string
  port: number
  lastError: string
  healthy?: boolean
}

/**
 * 任务状态（用于异步任务轮询）
 */
export type TaskStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled'

/**
 * 异步任务状态响应
 */
export interface TaskState<T = unknown> {
  taskId: string
  status: TaskStatus
  progress?: number
  statusText?: string
  errorMessage?: string
  result?: T
  createdAt?: number
  updatedAt?: number
}

/**
 * 进度回调
 */
export type ProgressCallback = (progress: number, statusText?: string) => void

/**
 * SSE 事件数据（用于 Server-Sent Events）
 */
export interface SseEvent<T = unknown> {
  event: string
  data: T
  id?: string
}

/**
 * 文件上传选项
 */
export interface UploadOptions {
  onProgress?: ProgressCallback
  signal?: AbortSignal
}

/**
 * 构造一个带错误的失败响应
 */
export function apiError(error: string, status?: number): ApiResult<never> {
  return { ok: false, error, status }
}

/**
 * 构造一个成功响应
 */
export function apiOk<T>(data: T): ApiResult<T> {
  return { ok: true, ...data }
}

/**
 * 判断 ApiResult 是否为成功
 */
export function isOk<T>(result: ApiResult<T>): result is { ok: true } & T {
  return result.ok === true
}

/**
 * 判断 ApiResult 是否为失败
 */
export function isErr<T>(result: ApiResult<T>): result is { ok: false } & ApiError {
  return result.ok === false
}

/**
 * 从 ApiResult 中获取数据，失败时抛出错误
 */
export function unwrap<T>(result: ApiResult<T>): T {
  if (isErr(result)) {
    throw new Error(result.error || 'Unknown API error')
  }
  return result
}

/**
 * 从 ApiResult 中获取数据，失败时返回默认值
 */
export function unwrapOr<T>(result: ApiResult<T>, defaultValue: T): T {
  if (isErr(result)) return defaultValue
  return result
}
