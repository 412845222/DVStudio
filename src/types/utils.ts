// ============================================================================
// 类型安全工具库
// 用途：替代 any 的安全类型工具 + 运行时类型守卫
// ============================================================================

// ─── 基础工具类型 ────────────────────────────────────────────────────────────

/** 标记"已验证安全的 any"——仅用于已确认类型安全但暂时无法精确定义的场景 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SafeAny = any

/** T | null | undefined */
export type Nullable<T> = T | null | undefined

/** 所有属性可选（深度） */
export type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T

/** 所有属性必填（深度） */
export type DeepRequired<T> = T extends object ? { [P in keyof T]-?: DeepRequired<T[P]> } : T

/** 所有属性只读（深度） */
export type DeepReadonly<T> = T extends object ? { readonly [P in keyof T]: DeepReadonly<T[P]> } : T

/** 带 id 字段的类型 */
export type WithId<T> = T & { id: string }

/** 字符串键值字典 */
export type Dictionary<T = unknown> = Record<string, T>

/** 从 T 中提取 K 变为必填 */
export type RequiredKeys<T, K extends keyof T> = T & Required<Pick<T, K>>

/** 从 T 中提取 K 变为可选 */
export type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

/** 值为联合类型中某一个成员（用于精确收窄） */
export type ValueOf<T> = T[keyof T]

/** 异步函数类型 */
export type AsyncFn<T = void> = () => Promise<T>

/** 无参数无返回值回调 */
export type Noop = () => void

/** 事件处理器 */
export type EventHandler<E = Event> = (event: E) => void

/** 任意函数 */
export type AnyFunction = (...args: unknown[]) => unknown

/** Promise 的 resolve 类型 */
export type ResolveType<T> = T extends Promise<infer R> ? R : T

// ─── 运行时类型守卫 ──────────────────────────────────────────────────────────

/** 判断值是否为非 null 的对象（包括数组） */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 判断值是否为纯对象（非数组、非 null） */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return isObject(value) && !Array.isArray(value)
}

/** 判断值是否为字符串 */
export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/** 判断值是否为数字（且不是 NaN） */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value)
}

/** 判断值是否为布尔值 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

/** 判断值是否为 null 或 undefined */
export function isNull(value: unknown): value is null | undefined {
  return value === null || value === undefined
}

/** 判断值是否为函数 */
export function isFunction(value: unknown): value is AnyFunction {
  return typeof value === 'function'
}

/** 判断值是否为数组，可选项守卫验证每个元素 */
export function isArray<T>(
  value: unknown,
  itemGuard?: (v: unknown) => v is T
): value is T[] {
  if (!Array.isArray(value)) return false
  if (itemGuard) return value.every(itemGuard)
  return true
}

/** 判断对象是否拥有指定的自有属性键 */
export function hasKey<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return isRecord(obj) && key in obj
}

/** 判断对象是否拥有指定的字符串属性，且属性值满足类型守卫 */
export function hasKeyOfType<K extends string, V>(
  obj: unknown,
  key: K,
  guard: (v: unknown) => v is V
): obj is Record<K, V> {
  return hasKey(obj, key) && guard(obj[key])
}

/** 判断值是否为有效数字字符串 */
export function isNumericString(value: unknown): value is string {
  return isString(value) && !Number.isNaN(Number(value))
}

/** 判断值是否为非空字符串 */
export function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0
}

/** 判断值是否为 HTMLElement */
export function isHTMLElement(value: unknown): value is HTMLElement {
  return typeof HTMLElement !== 'undefined' && value instanceof HTMLElement
}

/** 判断值是否为 File */
export function isFile(value: unknown): value is File {
  return typeof File !== 'undefined' && value instanceof File
}

/** 判断值是否为 Blob */
export function isBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob
}

/** 判断值是否为 Error */
export function isError(value: unknown): value is Error {
  return value instanceof Error
}

// ─── 类型安全的工具函数 ──────────────────────────────────────────────────────

/**
 * 类型安全的 JSON 解析
 * @param text 要解析的 JSON 字符串
 * @param guard 类型守卫函数，验证解析结果
 * @param fallback 解析失败时的回退值
 */
export function safeJsonParse<T>(
  text: string | null | undefined,
  guard: (value: unknown) => value is T,
  fallback: T
): T {
  if (isNull(text)) return fallback
  try {
    const parsed = JSON.parse(text)
    return guard(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

/**
 * 类型安全的 localStorage 读取
 * @param key localStorage 键名
 * @param guard 类型守卫函数
 * @param fallback 读取失败时的回退值
 */
export function getStorageItem<T>(
  key: string,
  guard: (value: unknown) => value is T,
  fallback: T
): T {
  try {
    const raw = localStorage.getItem(key)
    return safeJsonParse(raw, guard, fallback)
  } catch {
    return fallback
  }
}

/**
 * 类型安全的 localStorage 写入
 */
export function setStorageItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 静默失败，localStorage 可能不可用
  }
}

/**
 * 类型安全的对象属性访问
 * @param obj 目标对象
 * @param path 属性路径（如 'a.b.c'）
 * @param guard 类型守卫验证最终值
 * @param fallback 路径不存在或类型不匹配时的回退值
 */
export function getPropByPath<T>(
  obj: unknown,
  path: string,
  guard: (v: unknown) => v is T,
  fallback: T
): T {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (!hasKey(current, key)) return fallback
    current = current[key]
  }
  return guard(current) ? current : fallback
}

/**
 * 确保值是数组：如果已经是数组则原样返回，否则包装成单元素数组
 */
export function ensureArray<T>(value: T | T[] | null | undefined): T[] {
  if (isNull(value)) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * 空函数，用于可选回调的默认值
 */
export const noop: Noop = () => {}

/**
 * 类型安全的类型断言（运行时不做检查，仅编译时使用）
 * 注意：仅在你 100% 确定类型安全时使用
 */
export function assertType<T>(value: unknown): T {
  return value as T
}

/**
 * 创建一个带类型守卫的数组过滤器
 */
export function filterGuard<T>(
  guard: (value: unknown) => value is T
): (value: unknown) => value is T {
  return guard
}

/**
 * 将联合类型收窄为具体类型的工具（用于 switch/case 穷尽检查）
 */
export function exhaustiveCheck(value: never, message?: string): never {
  throw new Error(message || `Unhandled case: ${String(value)}`)
}

/**
 * 从 unknown 类型的错误中安全提取错误消息
 * 用于 catch (e: unknown) 块
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (isString(error)) return error
  if (isRecord(error) && isString(error.message)) return error.message
  return String(error)
}

/**
 * 从 unknown 类型的错误中安全提取 Error 对象
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error(getErrorMessage(error))
}

// ─── 安全属性访问辅助函数 ────────────────────────────────────────────────────

/**
 * 从 unknown 对象中安全获取字符串属性
 */
export function safeGetString(obj: unknown, key: string): string | undefined {
  if (!hasKey(obj, key)) return undefined
  const value = obj[key]
  return isString(value) ? value : undefined
}

/**
 * 从 unknown 对象中安全获取数字属性
 */
export function safeGetNumber(obj: unknown, key: string): number | undefined {
  if (!hasKey(obj, key)) return undefined
  const value = obj[key]
  return isNumber(value) ? value : undefined
}

/**
 * 从 unknown 对象中安全获取数组属性，并验证每个元素类型
 */
export function safeGetArray<T>(
  obj: unknown,
  key: string,
  itemGuard: (v: unknown) => v is T
): T[] | undefined {
  if (!hasKey(obj, key)) return undefined
  const value = obj[key]
  return isArray(value, itemGuard) ? value : undefined
}

/**
 * 从 unknown 对象中安全获取 Record<string, unknown> 属性
 */
export function safeGetRecord(obj: unknown, key: string): Record<string, unknown> | undefined {
  if (!hasKey(obj, key)) return undefined
  const value = obj[key]
  return isRecord(value) ? value : undefined
}
